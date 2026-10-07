/**
 * MyTree — #/people (students & members), #/orgs (sub-organisations), #/change-password.
 * Everything an admin does here is recorded in the audit log.
 */
(function () {
  'use strict';
  var MT = window.MT, h = MT.html, raw = MT.raw, ui = MT.ui, F = ui.field, A = MT.accounts;
  var MANAGERS = ['super_admin', 'foundation', 'school', 'institution'];

  /** Small helper: a modal with a form body that saves asynchronously and stays open on errors. */
  function formModal(title, fieldsHtml, submitLabel, onSubmit, o) {
    o = o || {};
    var body = document.createElement('div');
    body.innerHTML = '<form class="form" novalidate>' + (o.intro ? '<p class="muted">' + MT.esc(o.intro) + '</p>' : '') + '<div class="form-grid">' + fieldsHtml + '</div><p class="field-msg" id="fm-err" role="alert"></p><div class="modal-foot inline"><button type="button" class="btn btn-ghost" data-cancel>Cancel</button><button type="submit" class="btn btn-primary"><span class="btn-label">' + MT.esc(submitLabel) + '</span><span class="spinner-sm"></span></button></div></form>';
    var form = body.querySelector('form'), dlg;
    body.addEventListener('click', function (e) { if (e.target.closest('[data-cancel]')) dlg.close(); });
    form.addEventListener('submit', function (e) {
      e.preventDefault(); var err = body.querySelector('#fm-err'); err.textContent = '';
      var v = {}; [].forEach.call(form.elements, function (el) { if (el.name) v[el.name] = el.type === 'checkbox' ? el.checked : String(el.value).trim(); });
      var req = [].filter.call(form.elements, function (el) { return el.required && !String(el.value).trim(); })[0];
      if (req) { err.textContent = 'Please fill in: ' + (form.querySelector('label[for="' + req.id + '"]') || { textContent: req.name }).textContent.replace('*', '').trim() + '.'; req.focus(); return; }
      var btn = form.querySelector('[type=submit]'); btn.disabled = true; btn.classList.add('is-loading');
      Promise.resolve(onSubmit(v, dlg)).then(function (keepOpen) { if (!keepOpen) dlg.close(); }).catch(function (er) { err.textContent = MT.friendlyError(er); }).then(function () { btn.disabled = false; btn.classList.remove('is-loading'); });
    });
    return ui.modal({ title: title, body: body, actions: [], onOpen: function (d) { dlg = d; ui.icons(); var f = form.querySelector('input,select'); if (f) f.focus(); } });
  }

  /* ---------- helpers ---------- */
  function myOrgs() {
    var p = MT.auth.profile();
    if (p.role === 'super_admin') return MT.db.list('orgs', { limit: 1000 });
    return MT.db.list('orgs', { where: [['ancestorOrgIds', 'array-contains', p.orgId]], limit: 1000 });
  }
  var ROLE_ICON = { student: 'graduation-cap', school: 'school', institution: 'building', foundation: 'heart-handshake', individual: 'user-round' };

  /* =================== People =================== */
  function peoplePage() {
    var isStudentAdder = MT.auth.isOrgAdmin() || MT.auth.isSuper();
    return h`<div class="page people-page" data-reveal>
      <div class="page-head row"><div><h2>People</h2><p class="muted" id="pp-sub">Loading…</p></div>
        <div class="btn-row tight"><a class="btn btn-ghost" href="#/bulk">${ui.icon('file-spreadsheet')} Bulk add ${MT.router.isSoon('/bulk') ? h`<em class="soon-pill">Soon</em>` : ''}</a>${MT.auth.isSuper() ? '' : h`<button class="btn btn-primary" id="pp-add">${ui.icon('user-plus')} Add student</button>`}</div></div>
      <div class="toolbar card"><div class="tb-row"><input type="search" id="pp-q" placeholder="Search name, ID, class…" aria-label="Search people">
        <select id="pp-role" aria-label="Role"><option value="">All roles</option><option value="student">Students</option><option value="admins">Organisation admins</option><option value="individual">Individuals</option></select>
        <select id="pp-org" aria-label="Organisation"><option value="">All organisations</option></select>
        <select id="pp-status" aria-label="Status"><option value="">Any status</option><option value="active">Active</option><option value="suspended">Deactivated</option></select></div></div>
      <div class="bulk-bar card" id="pp-bulk" hidden><strong id="pp-n">0 selected</strong><button class="btn btn-sm btn-soft" data-bulk="reissue">Re-issue passwords + sheet</button><button class="btn btn-sm btn-danger-soft" data-bulk="deactivate">Deactivate</button><button class="btn btn-sm btn-soft" data-bulk="all">Select all shown</button></div>
      <div class="card table-wrap" id="pp-body">${ui.skeleton(5, 'sk-line')}</div><div class="center" id="pp-more"></div></div>`;
  }

  function peopleAfter(host, ctx) {
    var me = MT.auth.profile(), S = { people: [], orgs: {}, sel: {}, shown: 50, destroyed: false }, body = MT.$('#pp-body', host);
    if (ctx.query.org) MT.$('#pp-org', host).dataset.pre = ctx.query.org;
    function filtered() {
      var q = MT.$('#pp-q', host).value.trim().toLowerCase(), role = MT.$('#pp-role', host).value, org = MT.$('#pp-org', host).value, st = MT.$('#pp-status', host).value;
      return S.people.filter(function (u) {
        if (role === 'admins' ? MT.ORG_TYPES.indexOf(u.role) < 0 : role && u.role !== role) return false; if (org && u.orgId !== org) return false;
        if (st && (st === 'active' ? !u.active : u.active)) return false;
        return !q || (u.name + ' ' + u.userId + ' ' + (u.grade || '') + ' ' + (u.roll || '') + ' ' + (u.email || '')).toLowerCase().indexOf(q) > -1;
      }).sort(function (a, b) { return a.name.localeCompare(b.name); });
    }
    function draw() {
      if (S.destroyed) return; var rows = filtered(), showOrg = !MT.auth.isOrgAdmin() || me.role === 'foundation';
      MT.$('#pp-sub', host).textContent = MT.fmt.num(rows.length) + ' of ' + MT.fmt.num(S.people.length) + ' people';
      var n = Object.keys(S.sel).length; MT.$('#pp-bulk', host).hidden = !n; MT.$('#pp-n', host).textContent = n + ' selected';
      if (!rows.length) { body.innerHTML = ui.empty(S.people.length ? { title: 'No one matches', text: 'Try clearing a filter.' } : { title: 'No people yet', text: me.role === 'super_admin' ? 'Members appear here as organisations add them.' : 'Add your first student — they get a user ID and an easy password.' }).s; return; }
      body.innerHTML = '<table class="table"><thead><tr><th><input type="checkbox" id="pp-chk-all" aria-label="Select all shown"></th><th>Name</th><th>User ID</th><th>Role</th>' + (showOrg ? '<th>Organisation</th>' : '') + '<th>Class</th><th>Status</th><th></th></tr></thead><tbody>' +
        rows.slice(0, S.shown).map(function (u) {
          var o = S.orgs[u.orgId];
          return '<tr data-uid="' + MT.esc(u.id) + '"><td><input type="checkbox" data-sel="' + MT.esc(u.id) + '"' + (S.sel[u.id] ? ' checked' : '') + ' aria-label="Select ' + MT.esc(u.name) + '"></td><td><strong>' + MT.esc(u.name) + '</strong></td><td><button type="button" class="link-btn mono" data-copy="' + MT.esc(u.userId) + '" title="Copy ID">' + MT.esc(u.userId) + '</button></td><td>' + MT.esc(MT.ROLE_LABEL[u.role] || u.role) + '</td>' +
            (showOrg ? '<td>' + MT.esc(o ? o.name : (u.orgId || '—')) + '</td>' : '') + '<td>' + MT.esc([u.grade, u.roll && '#' + u.roll].filter(Boolean).join(' ') || '—') + '</td><td>' + ui.statusBadge(u.active ? 'active' : (u.status || 'suspended')).s + '</td>' +
            '<td class="row-actions"><button type="button" class="btn btn-soft btn-sm" data-act="menu" aria-haspopup="true" aria-label="Actions for ' + MT.esc(u.name) + '">Actions ' + ui.icon('chevron-down').s + '</button></td></tr>';
        }).join('') + '</tbody></table>';
      ui.icons(); MT.$('#pp-more', host).innerHTML = rows.length > S.shown ? '<button class="btn btn-soft" id="pp-showmore">Show more (' + (rows.length - S.shown) + ')</button>' : '';
      var sm = MT.$('#pp-showmore', host); if (sm) sm.addEventListener('click', function () { S.shown += 50; draw(); });
    }
    function load() {
      return Promise.all([A.listPeople(), myOrgs()]).then(function (r) {
        S.people = r[0]; r[1].forEach(function (o) { S.orgs[o.id] = o; }); var s = MT.auth.session(); if (s.org) S.orgs[s.org.id] = s.org;
        var sel = MT.$('#pp-org', host); sel.innerHTML = '<option value="">All organisations</option>' + Object.keys(S.orgs).sort(function (a, b) { return S.orgs[a].name.localeCompare(S.orgs[b].name); }).map(function (id) { return '<option value="' + MT.esc(id) + '">' + MT.esc(S.orgs[id].name) + '</option>'; }).join('');
        if (sel.dataset.pre) sel.value = sel.dataset.pre; draw();
      }).catch(function (e) { body.innerHTML = ui.empty({ title: 'Could not load people', text: MT.friendlyError(e) }).s; });
    }
    ['#pp-q', '#pp-role', '#pp-org', '#pp-status'].forEach(function (s) { MT.$(s, host).addEventListener('input', MT.debounce(function () { S.shown = 50; draw(); }, 150)); });
    function byId(id) { return S.people.filter(function (u) { return u.id === id; })[0]; }

    /* ----- add student ----- */
    function addStudent() {
      var targets = Object.keys(S.orgs).map(function (k) { return S.orgs[k]; }).filter(function (o) { return (o.type === 'school' || o.type === 'institution') && o.status === 'approved'; }).sort(function (a, b) { return a.name.localeCompare(b.name); });
      if (!targets.length) return ui.toast('There is no approved school or institution to add students to yet.', { type: 'warn' });
      var fixed = me.role === 'school' || me.role === 'institution';
      formModal('Add a student', (fixed ? '' : F({ id: 'orgId', label: 'School / institution', type: 'select', required: true, options: targets.map(function (o) { return { value: o.id, label: o.name + ' — ' + o.city }; }), wide: true }).s) +
        F({ id: 'name', label: 'Full name', required: true, wide: true, attrs: 'maxlength="120"' }).s + F({ id: 'grade', label: 'Class / grade', attrs: 'maxlength="60"', placeholder: 'e.g. 7-B' }).s + F({ id: 'roll', label: 'Roll number', attrs: 'maxlength="30"' }).s +
        F({ id: 'phone', label: 'Phone (optional)', type: 'tel' }).s + F({ id: 'guardian', label: 'Guardian contact (optional)', attrs: 'maxlength="120"' }).s + F({ id: 'email', label: 'E-mail (optional)', type: 'email' }).s +
        '<div class="field-wide"><label class="check"><input type="checkbox" name="forceChange" id="f-forceChange"><span>Ask them to choose their own password the first time they sign in</span></label></div>',
        'Create account', function (v, dlg) {
          var org = fixed ? (S.orgs[me.orgId] || MT.auth.session().org) : S.orgs[v.orgId];
          return A.createStudent({ org: org, name: v.name, grade: v.grade, roll: v.roll, phone: v.phone, guardian: v.guardian, email: v.email, forceChange: v.forceChange }).then(function (c) {
            dlg.close(); return load().then(function () { MT.shell.refreshBadges(); return MT.credentials.show(c, { title: 'Account created for ' + c.name }); });
          }).then(function () { return true; });
        }, { intro: 'The student gets a user ID (like MT-STU-SCH001-0013) and an easy password such as “Maple-River-4821”.' });
    }
    function editUser(u) {
      formModal('Edit ' + u.name, F({ id: 'name', label: 'Full name', value: u.name, required: true, wide: true }).s + F({ id: 'grade', label: 'Class / grade', value: u.grade || '' }).s + F({ id: 'roll', label: 'Roll number', value: u.roll || '' }).s + F({ id: 'phone', label: 'Phone', value: u.phone || '', type: 'tel' }).s + F({ id: 'guardian', label: 'Guardian contact', value: u.guardian || '' }).s, 'Save', function (v) {
        var patch = { name: v.name.slice(0, 120), phone: v.phone.slice(0, 30), grade: v.grade.slice(0, 60), roll: v.roll.slice(0, 30), guardian: v.guardian.slice(0, 120) };
        return A.update(u, patch).then(function () { Object.assign(u, patch); draw(); ui.success('Saved.'); });
      });
    }
    function reissue(list) {
      var names = list.length === 1 ? list[0].name : list.length + ' people';
      ui.confirm('Re-issue password' + (list.length > 1 ? 's' : '') + '?', 'A new password is created for ' + names + '. The old password stops working immediately; the user ID and all trees stay the same. You will see the new sign-in details once.', 'Re-issue', true).then(function (ok) {
        if (!ok) return; var out = [], fails = [], i = 0, t = ui.toast('Creating new passwords…', { duration: 0 });
        return list.reduce(function (p, u) { return p.then(function () { return A.reissue(u, { orgName: (S.orgs[u.orgId] || {}).name }).then(function (c) { out.push(c); }, function (e) { fails.push(u.name + ': ' + MT.friendlyError(e)); }); }); }, Promise.resolve()).then(function () {
          t.close(); S.sel = {}; return load();
        }).then(function () {
          if (fails.length) ui.toast(fails.length + ' could not be re-issued. ' + fails[0], { type: 'error', duration: 8000 });
          if (out.length) return MT.credentials.show(out, { title: 'New passwords' });
        });
      }).catch(ui.error);
    }
    function toggle(list, on) {
      return list.reduce(function (p, u) { return p.then(function () { return A.setActive(u, on).then(function () { u.active = on; u.status = on ? 'active' : 'suspended'; }); }); }, Promise.resolve()).then(function () { S.sel = {}; draw(); ui.success((on ? 'Reactivated ' : 'Deactivated ') + list.length + ' account' + (list.length > 1 ? 's' : '') + '.'); }).catch(ui.error);
    }
    function menu(btn, u) {
      var old = document.getElementById('row-menu'); if (old) old.remove();
      var m = document.createElement('div'); m.id = 'row-menu'; m.className = 'row-menu pop'; m.setAttribute('role', 'menu');
      var items = [['trees', 'View their trees', function () { MT.router.go('/trees?q=' + encodeURIComponent(u.userId)); }], ['sprout', 'Plant a tree for them', function () { MT.router.go('/plant?for=' + encodeURIComponent(u.userId)); }, u.active],
        ['pencil', 'Edit details', function () { editUser(u); }], ['key-round', 'Re-issue password', function () { reissue([u]); }], [u.active ? 'user-x' : 'user-check', u.active ? 'Deactivate' : 'Reactivate', function () { toggle([u], !u.active); }]];
      items.forEach(function (it) { if (it[3] === false) return; var b = document.createElement('button'); b.type = 'button'; b.className = 'pop-item'; b.setAttribute('role', 'menuitem'); b.innerHTML = '<i data-lucide="' + it[0] + '" class="ic"></i> ' + it[1]; b.addEventListener('click', function () { m.remove(); it[2](); }); m.appendChild(b); });
      document.body.appendChild(m); var r = btn.getBoundingClientRect(); m.style.position = 'fixed'; m.style.top = Math.min(window.innerHeight - 260, r.bottom + 4) + 'px'; m.style.right = Math.max(8, window.innerWidth - r.right) + 'px'; m.style.width = '230px'; ui.icons(); m.querySelector('button').focus();
      setTimeout(function () { document.addEventListener('click', function off(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('click', off); } }); }, 0);
    }
    host.addEventListener('click', function (e) {
      var a = e.target.closest('[data-act=menu]'); if (a) { e.stopPropagation(); menu(a, byId(a.closest('tr').dataset.uid)); return; }
      var b = e.target.closest('[data-bulk]'); if (b) { var ids = Object.keys(S.sel), list = ids.map(byId).filter(Boolean);
        if (b.dataset.bulk === 'all') { filtered().slice(0, S.shown).forEach(function (u) { S.sel[u.id] = 1; }); draw(); } else if (!list.length) ui.toast('Select people first.', { type: 'warn' }); else if (b.dataset.bulk === 'reissue') reissue(list); else toggle(list, false); }
    });
    host.addEventListener('change', function (e) {
      if (e.target.id === 'pp-chk-all') { filtered().slice(0, S.shown).forEach(function (u) { if (e.target.checked) S.sel[u.id] = 1; else delete S.sel[u.id]; }); draw(); return; }
      var c = e.target.closest('[data-sel]'); if (c) { if (c.checked) S.sel[c.dataset.sel] = 1; else delete S.sel[c.dataset.sel]; var n = Object.keys(S.sel).length; MT.$('#pp-bulk', host).hidden = !n; MT.$('#pp-n', host).textContent = n + ' selected'; }
    });
    var add = MT.$('#pp-add', host); if (add) add.addEventListener('click', addStudent);
    load();
    return function () { S.destroyed = true; var m = document.getElementById('row-menu'); if (m) m.remove(); };
  }

  /* =================== Organisations =================== */
  function orgsPage() {
    return h`<div class="page orgs-page" data-reveal><div class="page-head row"><div><h2>Organisations</h2><p class="muted" id="og-sub">Loading…</p></div><button class="btn btn-primary" id="og-add">${ui.icon('building-2')} Add organisation</button></div>
      <div class="org-grid" id="og-grid">${ui.skeleton(3, 'sk-card')}</div></div>`;
  }
  function orgsAfter(host) {
    var me = MT.auth.profile(), S = { orgs: [], stats: {} }, grid = MT.$('#og-grid', host), destroyed = false;
    function draw() {
      if (destroyed) return; var mine = S.orgs.filter(function (o) { return o.id !== me.orgId; }).sort(function (a, b) { return a.ancestorOrgIds.length - b.ancestorOrgIds.length || a.name.localeCompare(b.name); });
      MT.$('#og-sub', host).textContent = mine.length ? mine.length + ' organisation' + (mine.length > 1 ? 's' : '') + ' ' + (me.role === 'super_admin' ? 'on the platform' : 'beneath you') : 'No organisations beneath you yet.';
      if (!mine.length) { grid.innerHTML = ui.empty({ title: 'Nothing here yet', text: 'Create a sub-foundation, school or institution. Its admin gets a user ID and password right away.' }).s; return; }
      var byId = {}; S.orgs.forEach(function (o) { byId[o.id] = o; });
      grid.innerHTML = mine.map(function (o) {
        var st = S.stats[o.id] || {}, depth = Math.max(0, o.ancestorOrgIds.length - 1 - (me.role === 'super_admin' ? 0 : me.ancestorOrgIds.length));
        return '<article class="org-card card" data-org="' + MT.esc(o.id) + '" style="margin-left:' + Math.min(depth, 3) * 14 + 'px"><div class="org-head"><span class="org-logo org-logo-ph">' + ui.icon(ROLE_ICON[o.type] || 'building-2').s + '</span><div><h3>' + MT.esc(o.name) + '</h3><p class="muted">' + MT.esc(MT.ROLE_LABEL[o.type]) + ' · <code>' + MT.esc(o.id) + '</code>' + (o.parentOrgId && byId[o.parentOrgId] ? ' · under ' + MT.esc(byId[o.parentOrgId].name) : '') + '</p></div>' + ui.statusBadge(o.status).s + '</div>' +
          '<dl class="kv kv-2"><dt>City</dt><dd>' + MT.esc([o.city, o.state].filter(Boolean).join(', ') || '—') + '</dd><dt>Members</dt><dd>' + MT.fmt.num(st.members || 0) + '</dd><dt>Trees</dt><dd>' + MT.fmt.num(st.trees || 0) + (st.trees ? ' (' + Math.round((st.treesAlive || 0) / st.trees * 100) + '% alive)' : '') + '</dd></dl>' +
          '<div class="btn-row tight"><a class="btn btn-soft btn-sm" href="#/people?org=' + encodeURIComponent(o.id) + '">People</a>' + (o.status === 'approved' ? '<button class="btn btn-danger-soft btn-sm" data-do="suspend">Suspend</button>' : o.status === 'suspended' ? '<button class="btn btn-primary btn-sm" data-do="reactivate">Reactivate</button>' : '') + '</div></article>';
      }).join(''); ui.icons();
    }
    function load() {
      return Promise.all([myOrgs(), MT.db.list('stats', { where: [['kind', '==', 'org']] }).catch(function () { return []; })]).then(function (r) { S.orgs = r[0]; r[1].forEach(function (s) { S.stats[s.id.replace(/^org_/, '')] = s; }); draw(); })
        .catch(function (e) { grid.innerHTML = ui.empty({ title: 'Could not load organisations', text: MT.friendlyError(e) }).s; });
    }
    MT.$('#og-add', host).addEventListener('click', function () {
      var parents = S.orgs.filter(function (o) { return o.type === 'foundation' && o.status === 'approved'; });
      var self = me.role === 'foundation' ? [(S.orgs.filter(function (o) { return o.id === me.orgId; })[0] || MT.auth.session().org)] : [];
      var parentOpts = (me.role === 'super_admin' ? [{ value: '', label: '(top level — no parent)' }] : []).concat(parents.filter(function (o) { return o.id !== me.orgId; }).concat(self).filter(Boolean).map(function (o) { return { value: o.id, label: o.name }; }));
      formModal('Add an organisation', F({ id: 'type', label: 'Type', type: 'select', required: true, options: [{ value: 'school', label: 'School' }, { value: 'institution', label: 'Institution' }, { value: 'foundation', label: 'Sub-foundation' }] }).s +
        F({ id: 'parent', label: 'Belongs to', type: 'select', options: parentOpts, value: me.role === 'foundation' ? me.orgId : '' }).s + F({ id: 'name', label: 'Name', required: true, wide: true, attrs: 'maxlength="160"' }).s +
        F({ id: 'regNo', label: 'Registration no. (optional)' }).s + F({ id: 'city', label: 'City', required: true, attrs: 'list="og-cities"' }).s + '<datalist id="og-cities">' + MT.geoData.cities.map(function (c) { return '<option value="' + MT.esc(c.name) + '">'; }).join('') + '</datalist>' +
        F({ id: 'state', label: 'State', type: 'select', required: true, options: [{ value: '', label: 'Select state…' }].concat(MT.geoData.states) }).s + F({ id: 'contactName', label: 'Contact person (becomes the admin)', required: true }).s + F({ id: 'phone', label: 'Phone', type: 'tel' }).s + F({ id: 'email', label: 'E-mail (optional)', type: 'email', wide: true }).s,
        'Create organisation', function (v, dlg) {
          var parent = v.parent ? S.orgs.filter(function (o) { return o.id === v.parent; })[0] || (v.parent === me.orgId ? MT.auth.session().org : null) : null;
          if (me.role === 'foundation' && !parent) throw MT.userError('Please choose which foundation it belongs to.');
          return A.createOrg({ type: v.type, parent: parent, name: v.name, regNo: v.regNo, city: v.city, state: v.state, contactName: v.contactName, phone: v.phone, email: v.email }).then(function (c) {
            dlg.close(); return load().then(function () { return MT.credentials.show(c, { title: c.orgName + ' created', intro: 'This is the administrator account for ' + c.orgName + '. The admin signs in with the user ID below (it is also the organisation ID) and is asked to choose a new password.' }); });
          }).then(function () { return true; });
        });
    });
    grid.addEventListener('click', function (e) {
      var b = e.target.closest('[data-do]'); if (!b) return; var id = b.closest('.org-card').dataset.org, o = S.orgs.filter(function (x) { return x.id === id; })[0]; b.disabled = true;
      var fn = b.dataset.do === 'suspend' ? 'suspendOrg' : 'reactivateOrg';
      ui.confirm((b.dataset.do === 'suspend' ? 'Suspend ' : 'Reactivate ') + o.name + '?', b.dataset.do === 'suspend' ? 'Everyone in it (and beneath it) will be unable to sign in until it is reactivated.' : 'Its people will be able to sign in again.', b.dataset.do === 'suspend' ? 'Suspend' : 'Reactivate', b.dataset.do === 'suspend').then(function (ok) { if (ok) return MT.auth[fn](o).then(function () { ui.success('Done.'); return load(); }); }).catch(ui.error).then(function () { b.disabled = false; });
    });
    load();
    return function () { destroyed = true; };
  }

  /* =================== Change password =================== */
  function changePwPage() {
    var forced = MT.auth.profile().mustChangePassword;
    return h`<div class="auth-card pw-card" data-reveal>${forced ? h`<p class="eyebrow">First sign-in</p>` : ''}<h1 class="auth-title">${forced ? 'Choose your own password' : 'Change password'}</h1>
      <p class="auth-sub">${forced ? 'Your administrator gave you a temporary password. Please choose one only you know.' : 'Pick a password that is easy for you to remember and hard for others to guess.'}</p>
      <form id="pw-form" class="form">${F({ id: 'pw', label: 'New password', type: 'password', required: true, autocomplete: 'new-password', hint: 'At least 8 characters.' })}${F({ id: 'pw2', label: 'Repeat new password', type: 'password', required: true, autocomplete: 'new-password' })}
      <button class="btn btn-primary btn-block btn-lg" type="submit"><span class="btn-label">Save password</span><span class="spinner-sm"></span></button></form>
      ${forced ? '' : h`<p class="auth-links"><a href="#/dashboard">Cancel</a></p>`}</div>`;
  }
  function changePwAfter(host) {
    ui.form(MT.$('#pw-form', host), { pw: function (v) { return MT.valid.password(v) ? '' : 'Use at least 8 characters.'; }, pw2: function (v, a) { return v === a.pw ? '' : 'The two passwords do not match.'; } }, function (v) {
      return A.changePassword(v.pw).then(function () { MT.shell.reset(); ui.success('Password changed.'); MT.router.go(MT.auth.homeRoute()); });
    });
  }

  MT.router.add('/people', { title: 'People', layout: 'app', access: MANAGERS, render: peoplePage, after: peopleAfter });
  MT.router.add('/orgs', { title: 'Organisations', layout: 'app', access: ['foundation', 'super_admin'], render: orgsPage, after: orgsAfter });
  MT.router.add('/change-password', { title: 'Change password', layout: 'app', access: 'auth', render: changePwPage, after: changePwAfter });
})();
