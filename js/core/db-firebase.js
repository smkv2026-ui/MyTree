/**
 * MyTree — LIVE adapter: Firestore for MT.db and Firebase Auth for the auth adapter.
 * Uses the Firebase v10 *compat* CDN builds (classic scripts, no modules). Loaded lazily by js/boot.js.
 */
(function () {
  'use strict';
  var MT = window.MT, H = MT.dbHelpers;
  var fb, fs, authSvc, secondaryApp, FV;

  function toSentinel(v) {
    if (H.isInc(v)) return FV.increment(v.__inc);
    if (H.isUnion(v)) return FV.arrayUnion.apply(FV, v.__union);
    if (H.isRemove(v)) return FV.arrayRemove.apply(FV, v.__remove);
    if (H.isDel(v)) return FV.delete();
    return v;
  }
  /** Convert MT sentinels (recursively through plain objects) to Firestore FieldValues. */
  function conv(obj) {
    var out = Array.isArray(obj) ? [] : {};
    Object.keys(obj).forEach(function (k) {
      var v = obj[k];
      if (H.isInc(v) || H.isUnion(v) || H.isRemove(v) || H.isDel(v)) out[k] = toSentinel(v);
      else if (v && typeof v === 'object' && !(v instanceof Date)) out[k] = conv(v);
      else if (v !== undefined) out[k] = v;
    });
    return out;
  }
  function snap(d) { if (!d.exists) return null; var o = d.data(); o.id = d.id; return o; }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function withRetry(fn, tries) {
    tries = tries || 3;
    return fn().catch(function (e) {
      var transient = e && (e.code === 'unavailable' || e.code === 'deadline-exceeded' || e.code === 'resource-exhausted' || e.code === 'aborted');
      if (tries > 1 && transient) return sleep(700 * (4 - tries)).then(function () { return withRetry(fn, tries - 1); });
      throw e;
    });
  }
  function query(c, q) {
    var ref = fs.collection(c);
    ((q && q.where) || []).forEach(function (w) { ref = ref.where(w[0] === 'id' ? firebase.firestore.FieldPath.documentId() : w[0], w[1], w[2]); });
    if (q && q.orderBy) ref = Array.isArray(q.orderBy) ? ref.orderBy(q.orderBy[0], q.orderBy[1] || 'asc') : ref.orderBy(q.orderBy);
    if (q && q.after !== undefined && q.orderBy) ref = ref.startAfter(q.after);
    if (q && q.limit) ref = ref.limit(q.limit);
    return ref;
  }

  var db = {
    mode: 'live',
    ready: null,
    init: function () {
      if (db.ready) return db.ready;
      db.ready = Promise.resolve().then(function () {
        fb = window.firebase;
        if (!fb.apps.length) fb.initializeApp(window.MT_FIREBASE_CONFIG);
        if (window.MT_APPCHECK_SITE_KEY && fb.appCheck) { try { fb.appCheck().activate(window.MT_APPCHECK_SITE_KEY, true); } catch (e) { MT.log('app check', e); } }
        fs = fb.firestore(); FV = fb.firestore.FieldValue; authSvc = fb.auth();
        // Local development against the Firebase Emulator Suite: set window.MT_EMULATOR = {host:'127.0.0.1', auth:9099, firestore:8080}.
        if (window.MT_EMULATOR) {
          var E = window.MT_EMULATOR; authSvc.useEmulator('http://' + E.host + ':' + E.auth); fs.useEmulator(E.host, E.firestore);
          return;
        }
        // Offline persistence so posts made offline sync later. Fails harmlessly with several tabs on old browsers.
        return fs.enablePersistence({ synchronizeTabs: true }).catch(function (e) { MT.log('persistence off', e && e.code); });
      });
      return db.ready;
    },
    raw: function () { return fs; },
    get: function (c, id) { return withRetry(function () { return fs.collection(c).doc(id).get(); }).then(snap); },
    list: function (c, q) {
      return withRetry(function () { return query(c, q).get(); }).then(function (s) { return s.docs.map(snap); });
    },
    count: function (c, q) {
      var ref = query(c, q);
      if (ref.count) return ref.count().get().then(function (s) { return s.data().count; }).catch(function () { return db.list(c, q).then(function (r) { return r.length; }); });
      return db.list(c, q).then(function (r) { return r.length; });
    },
    set: function (c, id, d, opts) { return withRetry(function () { return fs.collection(c).doc(id).set(conv(d), opts && opts.merge ? { merge: true } : {}); }); },
    add: function (c, d) { var ref = fs.collection(c).doc(); return ref.set(conv(d)).then(function () { return ref.id; }); },
    update: function (c, id, patch) { return withRetry(function () { return fs.collection(c).doc(id).update(conv(patch)); }); },
    delete: function (c, id) { return fs.collection(c).doc(id).delete(); },
    /** Batched writes, auto-chunked to ≤400 ops (Firestore max is 500). Atomic per chunk; retried on transient errors. */
    batch: function () {
      var ops = [];
      var b = {
        set: function (c, id, d, o) { ops.push(['set', c, id, d, o]); return b; },
        update: function (c, id, p) { ops.push(['update', c, id, p]); return b; },
        delete: function (c, id) { ops.push(['delete', c, id]); return b; },
        size: function () { return ops.length; },
        commit: function (onProgress) {
          var chunks = H.chunk(ops, 400), done = 0, p = Promise.resolve();
          chunks.forEach(function (ch) {
            p = p.then(function () {
              return withRetry(function () {
                var wb = fs.batch();
                ch.forEach(function (o) {
                  var ref = fs.collection(o[1]).doc(o[2]);
                  if (o[0] === 'set') wb.set(ref, conv(o[3]), o[4] && o[4].merge ? { merge: true } : {});
                  else if (o[0] === 'update') wb.update(ref, conv(o[3]));
                  else wb.delete(ref);
                });
                return wb.commit();
              });
            }).then(function () { done += ch.length; if (onProgress) onProgress(done, ops.length); });
          });
          return p;
        }
      };
      return b;
    },
    /** Reserve `count` (default 1) consecutive numbers in ONE transaction; resolves to the FIRST of the block. */
    nextId: function (key, count) {
      count = count || 1;
      var ref = fs.collection('counters').doc(key);
      return fs.runTransaction(function (tx) {
        return tx.get(ref).then(function (s) {
          var first = (s.exists ? s.data().n : 0) + 1;
          tx.set(ref, { n: first + count - 1 });
          return first;
        });
      });
    }
  };
  H.install(db);
  MT.dbFirebase = db;

  /* ---------- Firebase Auth adapter ---------- */
  var auth = {
    mode: 'live',
    init: function (onChange) { authSvc.onAuthStateChanged(function (u) { onChange(u ? u.uid : null); }); },
    uid: function () { return authSvc.currentUser ? authSvc.currentUser.uid : null; },
    signIn: function (email, pw) { return authSvc.signInWithEmailAndPassword(email, pw).then(function (c) { return c.user.uid; }); },
    /** Create + sign in as the new user (self-registration, first super admin). */
    create: function (email, pw) { return authSvc.createUserWithEmailAndPassword(email, pw).then(function (c) { return c.user.uid; }); },
    /** Create an account on a SECOND app instance so the admin stays signed in; signs out of the secondary only. */
    createSecondary: function (email, pw) {
      var fresh = !secondaryApp;
      if (!secondaryApp) secondaryApp = fb.initializeApp(window.MT_FIREBASE_CONFIG, 'secondary');
      var sa = secondaryApp.auth();
      if (fresh && window.MT_EMULATOR) sa.useEmulator('http://' + window.MT_EMULATOR.host + ':' + window.MT_EMULATOR.auth);
      return sa.createUserWithEmailAndPassword(email, pw).then(function (c) {
        var uid = c.user.uid;
        return sa.signOut().then(function () { return uid; });
      });
    },
    /** Roll back a half-finished registration (deletes the just-created Auth user). */
    deleteCurrent: function () { var u = authSvc.currentUser; return u ? u.delete().catch(function () { return authSvc.signOut(); }) : Promise.resolve(); },
    /** Change the signed-in user's password (needs a recent sign-in, which is true right after login). */
    changePassword: function (pw) { var u = authSvc.currentUser; return u ? u.updatePassword(pw) : Promise.reject({ code: 'auth/requires-recent-login' }); },
    signOut: function () { return authSvc.signOut(); },
    sendReset: function (email) { return authSvc.sendPasswordResetEmail(email); }
  };
  MT.authFirebase = auth;
})();
