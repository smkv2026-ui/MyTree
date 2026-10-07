/**
 * MyTree — account management (no UI): students, sub-organisations with their admin, password re-issue, activate/deactivate, change password.
 *
 * Accounts created here use a synthetic Auth e-mail  <userid>@mytree.app  plus a public minimal alias doc, so people sign in with their user ID.
 * New Auth accounts are created on a SECOND Firebase app instance (MT.authAdapter.createSecondary) so the admin stays signed in.
 * Passwords are generated here, shown once and never stored.
 *
 * Password re-issue (no server): create a NEW Auth account (<userid>+rN@mytree.app) → copy the profile to the new uid → old profile becomes
 * status 'replaced' (rules deny it) → userIds and loginAliases point at the new account. The user keeps the same ID and trees (ownerId = userId).
 */
(function () {
  'use strict';
  var MT = window.MT;
  function clip(s, n) { return String(s == null ? '' : s).trim().slice(0, n); }
  function aliasEmail(userId, n) { var b = String(userId).toLowerCase(); return n > 1 ? b + '+r' + n + '@mytree.app' : b + '@mytree.app'; }
  function bumpMembers(b, org, n, role) {
    var f = { users: MT.db.inc(n) }; if (role === 'student') f.students = MT.db.inc(n);
    b.set('stats', 'global', f, { merge: true });
    (org.ancestorOrgIds || []).forEach(function (a) { b.set('stats', 'org_' + a, { kind: 'org', members: MT.db.inc(n) }, { merge: true }); });
  }

  var A = (MT.accounts = {
    aliasEmail: aliasEmail,
    /** @returns {Promise<{userId,password,name,grade,roll,orgName,orgId}>} */
    createStudent: function (o) {
      var me = MT.auth.profile(), org = o.org, pw = MT.genPassword(), now = Date.now(), name = clip(o.name, 120);
      if (!name) return Promise.reject(MT.userError('Please enter the full name.'));
      if (!org) return Promise.reject(MT.userError('Please choose a school or institution.'));
      var userId, uid;
      return MT.ids.member(org.id).then(function (id) { userId = id; return MT.authAdapter.createSecondary(aliasEmail(userId, 1), pw); }).then(function (u) {
        uid = u;
        var profile = { userId: userId, role: 'student', orgId: org.id, ancestorOrgIds: org.ancestorOrgIds, active: true, status: 'active', name: name, email: clip(o.email, 120), authEmail: aliasEmail(userId, 1),
          phone: clip(o.phone, 30), grade: clip(o.grade, 60), roll: clip(o.roll, 30), guardian: clip(o.guardian, 120), createdAt: now, createdBy: me.userId, consentAt: 0, lang: 'en', reissueCount: 1 };
        if (o.forceChange) profile.mustChangePassword = true;
        var b = MT.db.batch();
        b.set('users', uid, profile);
        b.set('userIds', userId, { uid: uid, orgId: org.id, ancestorOrgIds: org.ancestorOrgIds });
        b.set('loginAliases', userId, { authEmail: aliasEmail(userId, 1), active: true });
        bumpMembers(b, org, 1, 'student');
        MT.audit.add(b, { action: 'user.create', targetType: 'user', targetId: userId, onBehalfOfId: userId, onBehalfOfName: name, detail: 'Student account created', orgId: org.id, ancestorOrgIds: org.ancestorOrgIds });
        return b.commit();
      }).then(function () { return { userId: userId, password: pw, name: name, grade: clip(o.grade, 60), roll: clip(o.roll, 30), orgName: org.name, orgId: org.id }; });
    },
    /** Create many sequentially. Never rejects: resolves {ok:[creds], failed:[{input, error}]}. */
    createStudents: function (list, org, onProgress) {
      var ok = [], failed = [];
      return list.reduce(function (p, row, i) {
        return p.then(function () { return A.createStudent(Object.assign({ org: org }, row)).then(function (c) { ok.push(c); }, function (e) { failed.push({ input: row, error: MT.friendlyError(e) }); }).then(function () { if (onProgress) onProgress(i + 1, list.length); }); });
      }, Promise.resolve()).then(function () { return { ok: ok, failed: failed }; });
    },
    /** Sub-foundation / school / institution plus its admin account, created approved. parent = org doc or null (super admin only). */
    createOrg: function (o) {
      var me = MT.auth.profile(), type = o.type, parent = o.parent || null, pw = MT.genPassword(), now = Date.now(), name = clip(o.name, 160);
      if (!name || !clip(o.contactName, 120)) return Promise.reject(MT.userError('Please enter the organisation name and the contact person.'));
      var orgId, uid;
      return MT.ids.org(type).then(function (id) { orgId = id; return MT.authAdapter.createSecondary(aliasEmail(orgId, 1), pw); }).then(function (u) {
        uid = u; var anc = (parent ? parent.ancestorOrgIds : []).concat([orgId]);
        var org = { type: type, name: name, regNo: clip(o.regNo, 60), address: clip(o.address, 300), city: clip(o.city, 80), state: clip(o.state, 80), country: 'India', contactName: clip(o.contactName, 120), phone: clip(o.phone, 30), email: clip(o.email, 120), logo: '',
          status: 'approved', parentOrgId: parent ? parent.id : '', ancestorOrgIds: anc, createdBy: MT.auth.session().uid, createdAt: now, statusAt: now, statusBy: me.userId };
        var profile = { userId: orgId, role: type, orgId: orgId, ancestorOrgIds: anc, active: true, status: 'active', name: org.contactName, email: org.email, authEmail: aliasEmail(orgId, 1), phone: org.phone, createdAt: now, createdBy: me.userId, consentAt: 0, lang: 'en', reissueCount: 1, mustChangePassword: true };
        var b = MT.db.batch();
        b.set('orgs', orgId, org); b.set('users', uid, profile); b.set('userIds', orgId, { uid: uid, orgId: orgId, ancestorOrgIds: anc }); b.set('loginAliases', orgId, { authEmail: aliasEmail(orgId, 1), active: true });
        var g = { users: MT.db.inc(1), orgsApproved: MT.db.inc(1) }; g['orgs_' + type] = MT.db.inc(1); b.set('stats', 'global', g, { merge: true }); b.set('stats', 'org_' + orgId, { kind: 'org', name: name, type: type, city: org.city || '' }, { merge: true });
        MT.audit.add(b, { action: 'org.create', targetType: 'org', targetId: orgId, detail: name + ' (' + type + ')', orgId: orgId, ancestorOrgIds: anc });
        return b.commit().then(function () { return { userId: orgId, password: pw, name: org.contactName, grade: '', roll: '', orgName: name, orgId: orgId, org: Object.assign({ id: orgId }, org) }; });
      });
    },
    /** New password for a user; ID and trees stay. @param {Object} user users doc ({id, ...}) */
    reissue: function (user, o) {
      o = o || {}; var me = MT.auth.profile(), pw = MT.genPassword(), n = (user.reissueCount || 1) + 1, email = aliasEmail(user.userId, n), now = Date.now(), newUid;
      return MT.authAdapter.createSecondary(email, pw).then(function (u) {
        newUid = u;
        var copy = Object.assign({}, user); delete copy.id; delete copy.supersededBy;
        Object.assign(copy, { authEmail: email, reissueCount: n, reissuedAt: now, active: true, status: 'active', supersedes: user.id });
        if (o.forceChange) copy.mustChangePassword = true; else delete copy.mustChangePassword;
        var b = MT.db.batch();
        b.set('users', newUid, copy);
        b.update('users', user.id, { active: false, status: 'replaced', supersededBy: newUid });
        b.update('userIds', user.userId, { uid: newUid });
        b.set('loginAliases', user.userId, { authEmail: email, active: true });
        MT.audit.add(b, { action: 'user.reissue', targetType: 'user', targetId: user.userId, onBehalfOfId: user.userId, onBehalfOfName: user.name, detail: 'Password re-issued', orgId: user.orgId, ancestorOrgIds: user.ancestorOrgIds });
        return b.commit();
      }).then(function () { return { userId: user.userId, password: pw, name: user.name, grade: user.grade || '', roll: user.roll || '', orgName: o.orgName || '', orgId: user.orgId }; });
    },
    setActive: function (user, on) {
      var b = MT.db.batch(); b.update('users', user.id, { active: on, status: on ? 'active' : 'suspended' });
      if (/@mytree\.app$/.test(user.authEmail || '')) b.set('loginAliases', user.userId, { authEmail: user.authEmail, active: on });
      MT.audit.add(b, { action: on ? 'user.activate' : 'user.deactivate', targetType: 'user', targetId: user.userId, onBehalfOfId: user.userId, onBehalfOfName: user.name, orgId: user.orgId, ancestorOrgIds: user.ancestorOrgIds });
      return b.commit();
    },
    update: function (user, patch) {
      var b = MT.db.batch(); b.update('users', user.id, patch);
      MT.audit.add(b, { action: 'user.edit', targetType: 'user', targetId: user.userId, onBehalfOfId: user.userId, onBehalfOfName: user.name, detail: Object.keys(patch).join(', '), orgId: user.orgId, ancestorOrgIds: user.ancestorOrgIds });
      return b.commit();
    },
    /** People beneath the signed-in manager (never superseded/old accounts, never super admins). */
    listPeople: function () {
      var p = MT.auth.profile(), where = p.role === 'super_admin' ? [] : [['ancestorOrgIds', 'array-contains', p.orgId]];
      return MT.db.list('users', { where: where, limit: 3000 }).then(function (rows) {
        return rows.filter(function (u) { return u.status !== 'replaced' && u.role !== 'super_admin' && u.userId !== p.userId; });
      });
    },
    changePassword: function (pw) {
      return MT.authAdapter.changePassword(pw).then(function () { var s = MT.auth.session(); return MT.db.update('users', s.uid, { mustChangePassword: false }); }).then(function () { return MT.auth.refresh(); });
    }
  });
})();
