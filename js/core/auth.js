/**
 * MyTree — authentication & account business logic (shared by demo and live modes).
 * Talks to `MT.authAdapter` (sign-in primitives) and `MT.db` (profiles, aliases, counters, stats).
 *
 * Profile doc  users/{authUid}: userId, role, orgId, ancestorOrgIds[], active, status, name, email, …
 * ownerId on trees = profile.userId (stable human ID), never the auth uid.
 */
(function () {
  'use strict';
  var MT = window.MT;
  var ROLES = ['super_admin', 'foundation', 'school', 'institution', 'student', 'individual'];
  var ORG_TYPES = ['foundation', 'school', 'institution'];
  var registering = false;

  MT.ROLES = ROLES;
  MT.ORG_TYPES = ORG_TYPES;
  MT.ROLE_LABEL = { super_admin: 'Super Admin', foundation: 'Foundation', school: 'School', institution: 'Institution', student: 'Student', individual: 'Individual' };
  MT.ORG_PREFIX = { foundation: 'FND', school: 'SCH', institution: 'INS' };

  /* ---------- Audit log helper (records every admin / on-behalf action) ---------- */
  MT.audit = {
    /** Adds an auditLog write to an existing batch so it commits atomically with the action itself. */
    add: function (batch, e) {
      var s = MT.auth.session(), p = s && s.profile;
      var rec = {
        at: Date.now(), action: e.action, targetType: e.targetType || '', targetId: e.targetId || '',
        actorUid: s ? s.uid : '', actorId: p ? p.userId : '', actorName: p ? p.name : '', actorRole: p ? p.role : '',
        onBehalfOfId: e.onBehalfOfId || '', onBehalfOfName: e.onBehalfOfName || '', detail: String(e.detail || '').slice(0, 300),
        orgId: e.orgId || (p && p.orgId) || '', ancestorOrgIds: e.ancestorOrgIds || (p && p.ancestorOrgIds) || []
      };
      batch.set('auditLog', MT.uid('a'), rec);
      return rec;
    }
  };

  var auth = {
    /** Wire the adapter and resolve once the first auth state has been processed. */
    init: function () {
      var first = true;
      return new Promise(function (resolve) {
        MT.authAdapter.init(function (uid) {
          if (registering) return;
          auth._load(uid).then(function () { if (first) { first = false; resolve(); } });
        });
      });
    },
    _load: function (uid) {
      if (!uid) { MT.store.set('session', null); return Promise.resolve(null); }
      return MT.db.get('users', uid).then(function (profile) {
        if (!profile) { MT.store.set('session', null); return null; }
        var orgP = profile.orgId ? MT.db.get('orgs', profile.orgId).catch(function () { return null; }) : Promise.resolve(null);
        return orgP.then(function (org) {
          var s = { uid: uid, profile: profile, org: org };
          MT.store.set('session', s); return s;
        });
      }).catch(function (e) { console.error(e); MT.store.set('session', null); return null; });
    },
    refresh: function () { return auth._load(MT.authAdapter.uid()); },
    session: function () { return MT.store.get('session', null); },
    profile: function () { var s = auth.session(); return s && s.profile; },
    role: function () { var p = auth.profile(); return p && p.role; },
    isSignedIn: function () { return !!auth.session(); },
    isActive: function () { var p = auth.profile(); return !!(p && p.active === true); },
    isSuper: function () { return auth.role() === 'super_admin'; },
    isOrgAdmin: function () { return ORG_TYPES.indexOf(auth.role()) > -1; },
    /** Roles allowed to manage people beneath them. */
    isManager: function () { return auth.isSuper() || auth.isOrgAdmin(); },
    homeRoute: function () {
      var p = auth.profile();
      if (!p) return '/';
      if (!p.active) return '/pending';
      return p.role === 'super_admin' ? '/admin' : '/dashboard';
    },

    needsSetup: function () {
      if (MT.db.mode === 'demo') return Promise.resolve(false);
      return MT.db.get('meta', 'setup').then(function (d) { return !d; }).catch(function () { return false; });
    },

    /** Turn "MT-STU-SCH045-0012" or an e-mail into the Auth e-mail. */
    resolveAuthEmail: function (idOrEmail) {
      var v = String(idOrEmail || '').trim();
      if (!v) return Promise.reject(MT.userError('Please enter your user ID or e-mail.'));
      if (v.indexOf('@') > -1) return Promise.resolve(v.toLowerCase());
      var id = v.toUpperCase().replace(/\s+/g, '');
      return MT.db.get('loginAliases', id).then(function (a) {
        if (!a) throw MT.userError('We could not find that user ID. Check for typos, or sign in with your e-mail address instead.');
        if (a.active === false) throw MT.userError('This account is not active. Please contact your administrator.');
        return a.authEmail;
      });
    },

    login: function (idOrEmail, password) {
      if (!password) return Promise.reject(MT.userError('Please enter your password.'));
      return auth.resolveAuthEmail(idOrEmail).then(function (email) {
        return MT.authAdapter.signIn(email, password);
      }).then(function (uid) {
        return auth._load(uid).then(function (s) {
          if (!s) { return MT.authAdapter.signOut().then(function () { throw MT.userError('Your sign-in worked, but we could not find your profile. If you just registered, please try again in a moment.'); }); }
          if (s.profile.status === 'replaced') { return MT.authAdapter.signOut().then(function () { auth._load(null); throw MT.userError('This password was replaced by your administrator. Please use your new password.'); }); }
          return s;
        });
      });
    },
    logout: function () { return MT.authAdapter.signOut().then(function () { return auth._load(null); }); },

    forgot: function (email) {
      var v = String(email || '').trim();
      if (!MT.valid.email(v)) return Promise.reject(MT.userError('Please enter the e-mail address you registered with. (Students: ask your teacher for a new password.)'));
      return MT.authAdapter.sendReset(v.toLowerCase()).catch(function (e) {
        if (e && (e.code === 'auth/user-not-found')) return; // do not reveal whether an account exists
        throw e;
      });
    },

    /** Individuals: instant activation. */
    registerIndividual: function (f) {
      var email = String(f.email || '').trim().toLowerCase();
      registering = true;
      var uid;
      return MT.authAdapter.create(email, f.password).then(function (u) {
        uid = u;
        return MT.ids.individual();
      }).then(function (userId) {
        var now = Date.now();
        var profile = {
          userId: userId, role: 'individual', orgId: '', ancestorOrgIds: [], active: true, status: 'active',
          name: f.name.trim(), email: email, authEmail: email, phone: (f.phone || '').trim(),
          consentAt: now, createdAt: now, createdBy: uid, lang: MT.lang || 'en'
        };
        var b = MT.db.batch();
        b.set('users', uid, profile);
        b.set('stats', 'global', { users: MT.db.inc(1), individuals: MT.db.inc(1) }, { merge: true });
        return b.commit();
      }).then(function () { registering = false; return auth.refresh(); })
        .catch(function (e) { registering = false; return MT.authAdapter.deleteCurrent().then(function () { auth._load(null); throw e; }); });
    },

    /** Foundations, schools, institutions: created "pending" until a super admin approves. */
    registerOrg: function (type, f) {
      if (ORG_TYPES.indexOf(type) < 0) return Promise.reject(MT.userError('Unknown organisation type.'));
      var email = String(f.email).trim().toLowerCase();
      registering = true;
      var uid, orgId;
      return MT.authAdapter.create(email, f.password).then(function (u) {
        uid = u; return MT.ids.org(type);
      }).then(function (id) {
        orgId = id;
        var now = Date.now();
        var org = {
          type: type, name: f.name.trim(), regNo: (f.regNo || '').trim(), address: (f.address || '').trim(),
          city: (f.city || '').trim(), state: (f.state || '').trim(), country: (f.country || 'India').trim(),
          contactName: f.contactName.trim(), phone: (f.phone || '').trim(), email: email, logo: f.logo || '',
          status: 'pending', parentOrgId: '', ancestorOrgIds: [orgId], createdBy: uid, createdAt: now
        };
        var profile = {
          userId: orgId, role: type, orgId: orgId, ancestorOrgIds: [orgId], active: false, status: 'pending',
          name: f.contactName.trim(), email: email, authEmail: email, phone: (f.phone || '').trim(),
          consentAt: now, createdAt: now, createdBy: uid, lang: MT.lang || 'en'
        };
        var b = MT.db.batch();
        b.set('orgs', orgId, org);
        b.set('users', uid, profile);
        b.set('stats', 'global', { orgsPending: MT.db.inc(1) }, { merge: true });
        return b.commit();
      }).then(function () { registering = false; return auth.refresh().then(function () { return orgId; }); })
        .catch(function (e) { registering = false; return MT.authAdapter.deleteCurrent().then(function () { auth._load(null); throw e; }); });
    },

    /** One-time first-run Super Admin. Rules only allow this while meta/setup does not exist. */
    bootstrapSuperAdmin: function (f) {
      var email = String(f.email).trim().toLowerCase();
      registering = true;
      var uid;
      return auth.needsSetup().then(function (need) {
        if (!need && MT.db.mode === 'live') throw MT.userError('Setup has already been completed. Please sign in.');
        return MT.authAdapter.create(email, f.password);
      }).then(function (u) {
        uid = u; return MT.db.nextId('ADM');
      }).then(function (n) {
        var now = Date.now();
        var profile = {
          userId: 'MT-ADM-' + MT.pad(n, 6), role: 'super_admin', orgId: '', ancestorOrgIds: [], active: true, status: 'active',
          name: f.name.trim(), email: email, authEmail: email, phone: '', consentAt: now, createdAt: now, createdBy: uid
        };
        var b = MT.db.batch();
        b.set('meta', 'setup', { createdAt: now, superAdminUid: uid, version: MT.version });
        b.set('users', uid, profile);
        b.set('stats', 'global', { users: MT.db.inc(1) }, { merge: true });
        return b.commit();
      }).then(function () { registering = false; return auth.refresh(); })
        .catch(function (e) { registering = false; return MT.authAdapter.deleteCurrent().then(function () { auth._load(null); throw e; }); });
    },

    /* ---------- Organisation approvals (super admin) ---------- */
    pendingOrgs: function () { return MT.db.list('orgs', { where: [['status', '==', 'pending']], orderBy: ['createdAt', 'asc'] }); },
    allOrgs: function () { return MT.db.list('orgs', { orderBy: ['createdAt', 'desc'] }); },

    /** Core of approve / reject / suspend / reactivate: flips the org and its users in one batch. */
    _setOrgStatus: function (org, status, opts) {
      opts = opts || {};
      var b = MT.db.batch(), now = Date.now();
      var orgPatch = { status: status, statusAt: now, statusBy: auth.profile().userId };
      if (opts.reason) orgPatch.statusReason = String(opts.reason).slice(0, 300);
      b.update('orgs', org.id, orgPatch);
      return MT.db.list('users', { where: [['ancestorOrgIds', 'array-contains', org.id]] }).then(function (users) {
        users.forEach(function (u) {
          if (u.status === 'replaced') return;
          if (status === 'approved') { if (u.status === 'pending' || u.status === 'suspended' || u.status === 'rejected') b.update('users', u.id, { active: true, status: 'active' }); }
          else if (status === 'rejected') b.update('users', u.id, { active: false, status: 'rejected' });
          else if (status === 'suspended') { if (u.status === 'active') b.update('users', u.id, { active: false, status: 'suspended' }); }
        });
        var st = { };
        if (org.status === 'pending') st.orgsPending = MT.db.inc(-1);
        if (status === 'approved') { st['orgs_' + org.type] = MT.db.inc(1); st.orgsApproved = MT.db.inc(1); }
        if (org.status === 'approved' && (status === 'suspended' || status === 'rejected')) { st['orgs_' + org.type] = MT.db.inc(-1); st.orgsApproved = MT.db.inc(-1); }
        if (Object.keys(st).length) b.set('stats', 'global', st, { merge: true });
        MT.audit.add(b, { action: 'org.' + status, targetType: 'org', targetId: org.id, detail: (org.name || '') + (opts.reason ? ' — ' + opts.reason : ''), orgId: org.id, ancestorOrgIds: org.ancestorOrgIds });
        return b.commit();
      });
    },
    approveOrg: function (org) { return auth._setOrgStatus(org, 'approved'); },
    rejectOrg: function (org, reason) { return auth._setOrgStatus(org, 'rejected', { reason: reason }); },
    suspendOrg: function (org, reason) { return auth._setOrgStatus(org, 'suspended', { reason: reason }); },
    reactivateOrg: function (org) { return auth._setOrgStatus(org, 'approved'); }
  };

  MT.auth = auth;
})();
