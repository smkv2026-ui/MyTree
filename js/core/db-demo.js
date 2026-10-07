/**
 * MyTree — DEMO adapter for MT.db and MT.authAdapter.
 * Everything lives in memory and is mirrored to IndexedDB (fallback: localStorage, then memory only).
 * Works when index.html is opened straight from disk.
 */
(function () {
  'use strict';
  var MT = window.MT, H = MT.dbHelpers;

  /* ---- Persistent key/value (IndexedDB → localStorage → memory) ---- */
  var memKv = {};
  MT.kv = (function () {
    var dbp = null;
    function open() {
      if (dbp) return dbp;
      dbp = new Promise(function (res) {
        try {
          if (!window.indexedDB) return res(null);
          var r = indexedDB.open('mytree-demo', 1);
          r.onupgradeneeded = function () { r.result.createObjectStore('kv'); };
          r.onsuccess = function () { res(r.result); };
          r.onerror = function () { res(null); };
          r.onblocked = function () { res(null); };
        } catch (e) { res(null); }
      });
      return dbp;
    }
    function tx(mode, fn) {
      return open().then(function (db) {
        if (!db) return undefined;
        return new Promise(function (res, rej) {
          var t = db.transaction('kv', mode), st = t.objectStore('kv'), out = fn(st);
          t.oncomplete = function () { res(out && out.result); };
          t.onerror = t.onabort = function () { rej(t.error); };
        });
      });
    }
    return {
      get: function (k) {
        return open().then(function (db) {
          if (!db) { try { var v = localStorage.getItem('mt.kv.' + k); return v ? JSON.parse(v) : (memKv[k] || null); } catch (e) { return memKv[k] || null; } }
          return tx('readonly', function (st) { return st.get(k); });
        }).catch(function () { return memKv[k] || null; });
      },
      set: function (k, v) {
        memKv[k] = v;
        return open().then(function (db) {
          if (!db) { try { localStorage.setItem('mt.kv.' + k, JSON.stringify(v)); } catch (e) { /* too big: memory only */ } return; }
          return tx('readwrite', function (st) { return st.put(v, k); });
        }).catch(function () { /* memory only */ });
      },
      clear: function () {
        memKv = {};
        try { Object.keys(localStorage).forEach(function (k) { if (k.indexOf('mt.kv.') === 0) localStorage.removeItem(k); }); } catch (e) { /* ignore */ }
        return open().then(function (db) { if (db) return tx('readwrite', function (st) { return st.clear(); }); }).catch(function () {});
      }
    };
  })();

  var data = {}, dirty = {}, ready = false;
  var SEED_VERSION = 3;

  function col(name) { return data[name] || (data[name] = {}); }
  function withId(id, d) { var o = MT.clone(d); o.id = id; return o; }
  function stripId(o) { var c = Object.assign({}, o); delete c.id; return c; }
  function markDirty(c) { dirty[c] = true; flushSoon(); }
  var flushSoon = MT.debounce(function () { flush(); }, 350);
  function flush() {
    var names = Object.keys(dirty); dirty = {};
    return Promise.all(names.map(function (n) { return MT.kv.set('col:' + n, data[n] || {}); }))
      .then(function () { return MT.kv.set('cols', Object.keys(data)); });
  }
  window.addEventListener('pagehide', function () { if (Object.keys(dirty).length) flush(); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden' && Object.keys(dirty).length) flush(); });

  var db = {
    mode: 'demo',
    ready: null,
    /** Load persisted collections; seed on first run or when the seed version changes. */
    init: function () {
      if (db.ready) return db.ready;
      db.ready = MT.kv.get('seedVersion').then(function (v) {
        if (v !== SEED_VERSION) return db.resetDemo(true);
        return MT.kv.get('cols').then(function (cols) {
          return Promise.all((cols || []).map(function (n) { return MT.kv.get('col:' + n).then(function (d) { data[n] = d || {}; }); }));
        });
      }).then(function () {
        if (!data.users || !Object.keys(data.users).length) return db.resetDemo(true);
      }).then(function () { ready = true; });
      return db.ready;
    },
    /** Wipe and re-seed the demo database. */
    resetDemo: function (silent) {
      data = {}; dirty = {};
      return MT.kv.clear().then(function () {
        if (!MT.seed) throw new Error('Seed generator missing');
        MT.seed.run(db);
        Object.keys(data).forEach(function (n) { dirty[n] = true; });
        return flush();
      }).then(function () { return MT.kv.set('seedVersion', SEED_VERSION); })
        .then(function () { if (!silent) MT.store.set('dbReset', Date.now()); });
    },
    /** Synchronous bulk insert used by the seed generator only. */
    _bulk: function (c, docs) {
      var t = col(c);
      docs.forEach(function (d) { var id = d.id; t[id] = stripId(d); });
      markDirty(c);
    },
    _raw: function (c) { return col(c); },

    get: function (c, id) {
      var d = col(c)[id];
      return Promise.resolve(d ? withId(id, d) : null);
    },
    list: function (c, q) {
      q = q || {};
      var t = col(c), out = [];
      Object.keys(t).forEach(function (id) {
        var d = t[id];
        var o = d; o = Object.assign({ id: id }, d); // shallow wrapper for matching
        if (!q.where || H.matches(o, q.where)) out.push(o);
      });
      H.sort(out, q.orderBy);
      if (q.limit) out = out.slice(0, q.limit);
      return Promise.resolve(out.map(function (o) { return MT.clone(o); }));
    },
    count: function (c, q) { return db.list(c, q).then(function (r) { return r.length; }); },
    set: function (c, id, d, opts) {
      var t = col(c);
      if (opts && opts.merge && t[id]) {
        var cur = t[id], nd = H.resolveSentinels(d, cur);
        t[id] = Object.assign({}, cur, nd);
      } else t[id] = H.resolveSentinels(d, null);
      markDirty(c); return Promise.resolve();
    },
    add: function (c, d) { var id = MT.uid('d'); return db.set(c, id, d).then(function () { return id; }); },
    update: function (c, id, patch) {
      var t = col(c);
      if (!t[id]) return Promise.reject(MT.userError('That record no longer exists.'));
      H.applyPatch(t[id], patch); markDirty(c); return Promise.resolve();
    },
    delete: function (c, id) { delete col(c)[id]; markDirty(c); return Promise.resolve(); },
    batch: function () {
      var ops = [];
      var b = {
        set: function (c, id, d, o) { ops.push(['set', c, id, d, o]); return b; },
        update: function (c, id, p) { ops.push(['update', c, id, p]); return b; },
        delete: function (c, id) { ops.push(['delete', c, id]); return b; },
        size: function () { return ops.length; },
        commit: function (onProgress) {
          // Validate first so a failing update leaves nothing half-applied.
          for (var i = 0; i < ops.length; i++) if (ops[i][0] === 'update' && !col(ops[i][1])[ops[i][2]]) {
            // an earlier set in the same batch may create it
            var created = ops.slice(0, i).some(function (p) { return p[0] === 'set' && p[1] === ops[i][1] && p[2] === ops[i][2]; });
            if (!created) return Promise.reject(MT.userError('A record in this operation no longer exists.'));
          }
          ops.forEach(function (o, i) {
            if (o[0] === 'set') db.set(o[1], o[2], o[3], o[4]);
            else if (o[0] === 'update') db.update(o[1], o[2], o[3]);
            else db.delete(o[1], o[2]);
            if (onProgress) onProgress(i + 1, ops.length);
          });
          return Promise.resolve();
        }
      };
      return b;
    },
    nextId: function (key) {
      var t = col('counters'), n = ((t[key] && t[key].n) || 0) + 1;
      t[key] = { n: n }; markDirty('counters'); return Promise.resolve(n);
    },
    /** Test/ops helper: size of the demo data in bytes (approx.). */
    approxSize: function () { try { return JSON.stringify(data).length; } catch (e) { return 0; } }
  };
  H.install(db);
  MT.dbDemo = db;

  /* ---------- Demo auth adapter ----------
   * Credentials live in collection `_auth` ({email, pw, disabled}). Plain-text passwords are acceptable ONLY because
   * this is a local demo; the Firebase adapter never sees or stores passwords. */
  var SESSION_KEY = 'mt.demo.session';
  var listeners = [];
  var auth = {
    mode: 'demo',
    init: function (onChange) {
      listeners.push(onChange);
      setTimeout(function () { onChange(MT.storage.get(SESSION_KEY, null)); }, 0);
    },
    uid: function () { return MT.storage.get(SESSION_KEY, null); },
    _find: function (email) {
      var t = col('_auth'), e = String(email || '').trim().toLowerCase();
      for (var k in t) if (t[k].email === e) return { uid: k, rec: t[k] };
      return null;
    },
    signIn: function (email, pw) {
      var f = auth._find(email);
      if (!f || f.rec.pw !== pw) return Promise.reject({ code: 'auth/invalid-credential' });
      MT.storage.set(SESSION_KEY, f.uid);
      listeners.forEach(function (l) { l(f.uid); });
      return Promise.resolve(f.uid);
    },
    _mk: function (email, pw) {
      if (auth._find(email)) return Promise.reject({ code: 'auth/email-already-in-use' });
      if (String(pw).length < 6) return Promise.reject({ code: 'auth/weak-password' });
      var uid = MT.uid('u');
      col('_auth')[uid] = { email: String(email).trim().toLowerCase(), pw: pw };
      markDirty('_auth'); return Promise.resolve(uid);
    },
    /** Create an account and sign in as it (self-registration). */
    create: function (email, pw) {
      return auth._mk(email, pw).then(function (uid) {
        MT.storage.set(SESSION_KEY, uid); listeners.forEach(function (l) { l(uid); }); return uid;
      });
    },
    /** Create an account WITHOUT touching the current session (admin creating a student). */
    createSecondary: function (email, pw) { return auth._mk(email, pw); },
    /** Roll back a half-finished registration. */
    deleteCurrent: function () { var u = auth.uid(); if (u) { delete col('_auth')[u]; markDirty('_auth'); } return auth.signOut(); },
    signOut: function () { MT.storage.remove(SESSION_KEY); listeners.forEach(function (l) { l(null); }); return Promise.resolve(); },
    sendReset: function () { return Promise.resolve(); }
  };
  MT.authDemo = auth;
})();
