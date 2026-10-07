/**
 * MyTree — administration: tree-health inspection (#/admin/health) with bulk reminders, audit log viewer (#/admin/audit),
 * settings (#/admin/settings: announcements, species master list, tools), stats rebuild and sample-data loader.
 */
(function () {
  'use strict';
  var MT = window.MT, h = MT.html, raw = MT.raw, ui = MT.ui, F = ui.field;
  var SA = ['super_admin'], MGR = ['super_admin', 'foundation', 'school', 'institution'];

  /* =============== stored notifications (admin reminders) =============== */
  MT.notify.register(function () {
    var p = MT.auth.profile(); if (!p || !p.active) return [];
    return MT.db.list('notifications', { where: [['toUserId', '==', p.userId], ['read', '==', false]], limit: 20 }).then(function (rows) {
      return rows.sort(function (a, b) { return b.createdAt - a.createdAt; }).map(function (n) { return { nid: n.id, id: n.id, icon: 'megaphone', title: n.title, text: n.text, href: n.href || '/dashboard' }; });
    }).catch(function () { return []; });
  });
  MT.notify.markRead = function (id) { MT.db.update('notifications', id, { read: true }).catch(function () {}); };

  /* =============== tree health =============== */
  function healthPage() {
    return h`<div class="page health-page" data-reveal><div class="page-head row"><div><p class="eyebrow">Super Admin</p><h2>Tree health &amp; performance</h2><p class="muted" id="hp-sub">Loading…</p></div><a class="btn btn-ghost" href="#/admin">${ui.icon('arrow-left')} Command centre</a></div>
      <div class="toolbar card"><div class="tb-row"><div class="seg" role="group" aria-label="Show"><button type="button" data-tab="struggling" aria-pressed="true">Struggling</button><button type="button" data-tab="needs_care" aria-pressed="false">Needs care</button><button type="button" data-tab="overdue" aria-pressed="false">Overdue</button><button type="button" data-tab="dead" aria-pressed="false">Dead</button></div>
        <input type="search" id="hp-q" placeholder="Search tree, species, owner, city…"><select id="hp-state" aria-label="State"><option value="">All states</option></select><div class="seg" role="group" aria-label="View"><button type="button" data-view="list" aria-pressed="true">List</button><button type="button" data-view="map" aria-pressed="false">Map</button></div></div></div>
      <div class="bulk-bar card" id="hp-bulk" hidden><strong id="hp-n">0 selected</strong><button class="btn btn-sm btn-primary" data-do="remind">${ui.icon('bell-ring')} Send reminder to owners</button><button class="btn btn-sm btn-soft" data-do="csv">Export CSV</button><button class="btn btn-sm btn-soft" data-do="all">Select all shown</button></div>
      <div id="hp-body" class="card table-wrap">${ui.skeleton(5, 'sk-line')}</div></div>`;
  }
  function healthAfter(host) {
    var S = { tab: 'struggling', view: 'list', rows: [], sel: {}, shown: 100 }, body = MT.$('#hp-body', host), destroyed = false, map = null;
    function fetch() {
      body.innerHTML = ui.skeleton(5, 'sk-line').s; var q;
      if (S.tab === 'overdue') q = MT.db.list('trees', { orderBy: ['lastUpdateAt', 'asc'], limit: 600 }).then(function (r) { return r.filter(function (t) { return MT.cadence.status(t).state === 'overdue'; }); });
      else q = MT.db.list('trees', { where: [['health', '==', S.tab]], limit: 600 });
      return q.then(function (r) { if (destroyed) return; S.rows = r; S.sel = {}; var st = {}; r.forEach(function (t) { if (t.state) st[t.state] = 1; }); var sel = MT.$('#hp-state', host), cur = sel.value; sel.innerHTML = '<option value="">All states</option>' + Object.keys(st).sort().map(function (x) { return '<option>' + MT.esc(x) + '</option>'; }).join(''); sel.value = cur; draw(); }).catch(function (e) { body.innerHTML = ui.empty({ title: 'Could not load', text: MT.friendlyError(e) }).s; });
    }
    function shown() {
      var q = MT.$('#hp-q', host).value.trim().toLowerCase(), st = MT.$('#hp-state', host).value;
      return S.rows.filter(function (t) { return (!st || t.state === st) && (!q || (t.code + ' ' + MT.trees.nameOf(t) + ' ' + (t.ownerName || '') + ' ' + (t.city || '')).toLowerCase().indexOf(q) > -1); }).sort(function (a, b) { return MT.cadence.lastOn(a) - MT.cadence.lastOn(b); });
    }
    function draw() {
      if (destroyed) return; var rows = shown(); if (map) { map.remove(); map = null; }
      MT.$('#hp-sub', host).textContent = MT.fmt.num(rows.length) + ' tree' + (rows.length === 1 ? '' : 's') + ' — ' + { struggling: 'struggling', needs_care: 'needing care', overdue: 'overdue for an update', dead: 'recorded dead' }[S.tab] + (S.rows.length >= 600 ? ' (first 600 loaded)' : '');
      MT.$$('[data-tab]', host).forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.tab === S.tab)); }); MT.$$('[data-view]', host).forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.view === S.view)); });
      var n = Object.keys(S.sel).length; MT.$('#hp-bulk', host).hidden = !n; MT.$('#hp-n', host).textContent = n + ' selected';
      if (!rows.length) { body.innerHTML = ui.empty({ title: 'Nothing to worry about', text: 'No trees match this list right now. 🌳' }).s; return; }
      if (S.view === 'map') { body.innerHTML = '<div class="tr-map" id="hp-map"></div>'; MT.maps.create(MT.$('#hp-map', host), { center: [rows[0].lat, rows[0].lng], zoom: 10 }).then(function (m) { if (destroyed || S.view !== 'map') { m.remove(); return; } map = m; return MT.maps.clusterGroup().then(function (g) { g.addTo(m); MT.maps.renderTrees(g, rows); var pts = rows.map(function (t) { return [t.lat, t.lng]; }); m.fitBounds(pts, { padding: [30, 30], maxZoom: 14 }); }); }); return; }
      body.innerHTML = '<table class="table"><thead><tr><th></th><th>Tree</th><th>Owner</th><th>Place</th><th>Health</th><th>Updates</th><th>Last update</th></tr></thead><tbody>' + rows.slice(0, S.shown).map(function (t) {
        var st = MT.cadence.status(t); return '<tr><td><input type="checkbox" data-sel="' + MT.esc(t.id) + '"' + (S.sel[t.id] ? ' checked' : '') + ' aria-label="Select ' + MT.esc(t.code) + '"></td><td><a href="#/trees/' + encodeURIComponent(t.id) + '"><strong>' + MT.esc(MT.trees.nameOf(t)) + '</strong></a><br><small class="mono">' + MT.esc(t.code) + '</small></td><td>' + MT.esc(t.ownerName || '') + '</td><td>' + MT.esc([t.city, t.state].filter(Boolean).join(', ')) + '</td><td><span class="hchip"><i class="hdot hdot-' + t.health + '"></i>' + MT.esc(ui.healthLabel[t.health]) + '</span></td><td><span class="badge badge-' + MT.cadence.tone(st) + '">' + MT.esc(MT.cadence.label(st)) + '</span></td><td>' + (t.lastUpdateAt ? MT.fmt.ago(t.lastUpdateAt) : 'never') + '</td></tr>';
      }).join('') + '</tbody></table>' + (rows.length > S.shown ? '<p class="center pad"><button class="btn btn-soft" id="hp-more">Show more</button></p>' : '');
      var m = MT.$('#hp-more', host); if (m) m.addEventListener('click', function () { S.shown += 100; draw(); });
    }
    host.addEventListener('click', function (e) {
      var t = e.target.closest('[data-tab]'); if (t) { S.tab = t.dataset.tab; S.shown = 100; fetch(); return; }
      var v = e.target.closest('[data-view]'); if (v) { S.view = v.dataset.view; draw(); return; }
      var d = e.target.closest('[data-do]'); if (!d) return; var sel = S.rows.filter(function (x) { return S.sel[x.id]; });
      if (d.dataset.do === 'all') { shown().slice(0, S.shown).forEach(function (x) { S.sel[x.id] = 1; }); draw(); return; }
      if (!sel.length) return ui.toast('Select trees first.', { type: 'warn' });
      if (d.dataset.do === 'csv') MT.download('mytree-at-risk.csv', MT.csv([['Tree ID', 'Species', 'Health', 'Owner', 'City', 'State', 'Last update']].concat(sel.map(function (x) { return [x.code, MT.trees.nameOf(x), x.health, x.ownerName, x.city, x.state, x.lastUpdateAt ? MT.fmt.iso(new Date(x.lastUpdateAt)) : '']; }))), 'text/csv');
      else remind(sel);
    });
    host.addEventListener('change', function (e) { var c = e.target.closest('[data-sel]'); if (!c) return; if (c.checked) S.sel[c.dataset.sel] = 1; else delete S.sel[c.dataset.sel]; var n = Object.keys(S.sel).length; MT.$('#hp-bulk', host).hidden = !n; MT.$('#hp-n', host).textContent = n + ' selected'; });
    ['#hp-q', '#hp-state'].forEach(function (s) { MT.$(s, host).addEventListener('input', MT.debounce(function () { S.shown = 100; draw(); }, 150)); });
    function remind(trees) {
      var by = {}; trees.forEach(function (t) { (by[t.ownerId] = by[t.ownerId] || { t: t, list: [] }).list.push(t); });
      var owners = Object.keys(by);
      ui.confirm('Send reminders?', owners.length + ' owner' + (owners.length > 1 ? 's' : '') + ' will see a notification about ' + trees.length + ' tree' + (trees.length > 1 ? 's' : '') + '.', 'Send').then(function (ok) {
        if (!ok) return; var b = MT.db.batch(), now = Date.now(), me = MT.auth.profile();
        owners.forEach(function (id) {
          var g = by[id], n = g.list.length, msg = S.tab === 'overdue' ? 'needs an update' : 'needs attention (' + ui.healthLabel[S.tab].toLowerCase() + ')';
          b.set('notifications', MT.uid('n'), { toUserId: id, toAncestorOrgIds: g.t.ancestorOrgIds || [], title: n === 1 ? MT.trees.nameOf(g.list[0]) + ' ' + msg : n + ' of your trees ' + msg.replace('needs', 'need'), text: g.list.slice(0, 4).map(function (x) { return x.code; }).join(', ') + (n > 4 ? ' and ' + (n - 4) + ' more' : '') + '. Sent by ' + me.name + '.', href: n === 1 ? '/trees/' + g.list[0].code : '/updates', read: false, createdAt: now, from: me.userId });
        });
        MT.audit.add(b, { action: 'notify.bulk', targetType: 'tree', targetId: trees[0].code, detail: 'Reminders to ' + owners.length + ' owners about ' + trees.length + ' trees' });
        return b.commit().then(function () { ui.success('Reminders sent to ' + owners.length + ' owner' + (owners.length > 1 ? 's' : '') + '.'); S.sel = {}; draw(); }).catch(ui.error);
      });
    }
    fetch();
    return function () { destroyed = true; if (map) map.remove(); };
  }

  /* =============== audit log =============== */
  var ACTION = { 'tree.plant': 'planted trees', 'tree.update': 'posted an update', 'tree.edit': 'edited a tree', 'tree.delete': 'deleted trees', 'tree.bulk': 'imported trees', 'user.create': 'created an account', 'user.reissue': 're-issued a password', 'user.activate': 'reactivated an account', 'user.deactivate': 'deactivated an account', 'user.edit': 'edited a person', 'org.create': 'created an organisation', 'org.approved': 'approved an organisation', 'org.rejected': 'rejected an organisation', 'org.suspended': 'suspended an organisation', 'notify.bulk': 'sent reminders', 'stats.rebuild': 'rebuilt statistics', 'sample.load': 'loaded sample data', 'sample.remove': 'removed sample data' };
  function auditSentence(a) {
    var who = a.actorName || a.actorId || 'Someone', what = ACTION[a.action] || a.action;
    return who + (a.actorRole ? ' (' + (MT.ROLE_LABEL[a.actorRole] || a.actorRole) + ')' : '') + ' ' + what + (a.onBehalfOfName ? ' on behalf of ' + a.onBehalfOfName : '') + (a.detail ? ' — ' + a.detail : '');
  }
  function auditPage() {
    return h`<div class="page audit-page" data-reveal><div class="page-head row"><div><h2>Audit log</h2><p class="muted">Every admin action and every “post on behalf of”, with who did what for whom. Entries cannot be edited or deleted.</p></div><button class="btn btn-ghost" id="au-csv">${ui.icon('download')} Export CSV</button></div>
      <div class="toolbar card"><div class="tb-row"><input type="search" id="au-q" placeholder="Search names, IDs, details…"><select id="au-act" aria-label="Action"><option value="">All actions</option>${Object.keys(ACTION).map(function (k) { return h`<option value="${k}">${ACTION[k]}</option>`; })}</select></div></div>
      <div class="card" id="au-body">${ui.skeleton(5, 'sk-line')}</div><div class="center"><button class="btn btn-soft" id="au-more" hidden>Load older entries</button></div></div>`;
  }
  function auditAfter(host) {
    var p = MT.auth.profile(), S = { rows: [], done: false }, body = MT.$('#au-body', host), destroyed = false;
    function page() {
      var q = { orderBy: ['at', 'desc'], limit: 100 }; if (p.role !== 'super_admin') q.where = [['ancestorOrgIds', 'array-contains', p.orgId]]; if (S.rows.length) q.after = S.rows[S.rows.length - 1].at;
      return MT.db.list('auditLog', q).then(function (r) { if (destroyed) return; S.rows = S.rows.concat(r); S.done = r.length < 100; draw(); }).catch(function (e) { body.innerHTML = ui.empty({ title: 'Could not load', text: MT.friendlyError(e) }).s; });
    }
    function shown() { var q = MT.$('#au-q', host).value.trim().toLowerCase(), a = MT.$('#au-act', host).value; return S.rows.filter(function (r) { return (!a || r.action === a) && (!q || (auditSentence(r) + ' ' + r.targetId + ' ' + r.actorId).toLowerCase().indexOf(q) > -1); }); }
    function draw() {
      var rows = shown(); MT.$('#au-more', host).hidden = S.done;
      body.innerHTML = rows.length ? '<ul class="audit-list">' + rows.map(function (r) { return '<li><span class="au-ic">' + ui.icon(r.onBehalfOfName ? 'users' : 'shield').s + '</span><div><strong>' + MT.esc(auditSentence(r)) + '</strong><small>' + MT.fmt.dateTime(r.at) + (r.targetId ? ' · ' + MT.esc(r.targetId) : '') + '</small></div></li>'; }).join('') + '</ul>' : ui.empty({ title: 'No entries', text: 'Nothing has been recorded yet for this filter.' }).s; ui.icons();
    }
    ['#au-q', '#au-act'].forEach(function (s) { MT.$(s, host).addEventListener('input', MT.debounce(draw, 150)); });
    MT.$('#au-more', host).addEventListener('click', page);
    MT.$('#au-csv', host).addEventListener('click', function () { MT.download('mytree-audit-log.csv', MT.csv([['When', 'Actor', 'Role', 'Action', 'On behalf of', 'Target', 'Detail']].concat(shown().map(function (r) { return [MT.fmt.dateTime(r.at), r.actorName, r.actorRole, r.action, r.onBehalfOfName || '', r.targetId, r.detail]; }))), 'text/csv'); });
    page(); return function () { destroyed = true; };
  }

  /* =============== stats rebuild =============== */
  var Tools = (MT.tools = {
    /** Recompute every stats/* document from the source collections, in pages of 500. */
    rebuildStats: function (onProgress) {
      var agg = {}, step = onProgress || function () {}, DAY = 86400000;
      function A(key) { return agg[key] || (agg[key] = { f: {}, m: {} }); }
      function add(key, fields, meta) { var a = A(key); Object.keys(fields).forEach(function (k) { a.f[k] = (a.f[k] || 0) + fields[k]; }); if (meta) Object.assign(a.m, meta); }
      function paged(col, each, label) {
        var n = 0;
        function next(after) { var q = { orderBy: ['__name__'], limit: 500 }; if (after !== undefined) q.after = after; return MT.db.list(col, q).then(function (rows) { rows.forEach(each); n += rows.length; step(label + ': ' + n); if (rows.length < 500) return n; return next(rows[rows.length - 1].id); }); }
        return next();
      }
      var monthNow = MT.fmt.iso(new Date()).slice(0, 7), userOrg = {};
      return paged('trees', function (t) {
        var f = MT.stats.fieldsFor(t, 1); MT.stats.keysFor(t).forEach(function (k) { var meta = MT.stats.meta(k, Object.assign({ cityLat: undefined }, t)); if (k.indexOf('city_') === 0) { var c = MT.geoData.city(t.city); meta.lat = c ? c.lat : t.lat; meta.lng = c ? c.lng : t.lng; } add(k, f, meta); });
        if (t.status !== 'dead') add('species', (function () { var o = {}; o[t.speciesId] = 1; return o; })(), { kind: 'species' });
      }, 'Trees').then(function () {
        return paged('users', function (u) { if (u.status === 'replaced' || u.role === 'super_admin') { if (u.role === 'super_admin') add('global', { users: 1 }); return; } var g = { users: 1 }; if (u.role === 'individual') g.individuals = 1; if (u.role === 'student') g.students = 1; add('global', g);
          if (u.role === 'student') (u.ancestorOrgIds || []).forEach(function (a) { add('org_' + a, { members: 1 }, { kind: 'org' }); }); }, 'People');
      }).then(function () {
        return paged('orgs', function (o) { if (o.status === 'pending') add('global', { orgsPending: 1 }); if (o.status === 'approved') { var g = { orgsApproved: 1 }; g['orgs_' + o.type] = 1; add('global', g); add('org_' + o.id, {}, { kind: 'org', name: o.name, type: o.type, city: o.city || '' }); } }, 'Organisations');
      }).then(function () {
        return paged('treeUpdates', function (u) { var m = (u.date || '').slice(0, 7); add('global', { updates: 1 }); if (m) add('month_' + m, { updates: 1 }, { kind: 'month' }); if (m === monthNow) add('global', { updatesThisMonth: 1 }); (u.ancestorOrgIds || []).forEach(function (a) { add('org_' + a, { updates: 1 }, { kind: 'org' }); }); }, 'Updates');
      }).then(function () {
        return paged('photos', function (p) { add('global', { photos: 1, photoBytes: p.size || 0 }); add('user_' + p.ownerId, { photos: 1, bytes: p.size || 0 }, { kind: 'user' }); }, 'Photos');
      }).then(function () {
        var ids = Object.keys(agg); step('Writing ' + ids.length + ' counters…');
        return MT.db.list('stats', { limit: 20000 }).then(function (old) {
          var b = MT.db.batch();
          ids.forEach(function (k) { var d = Object.assign({}, agg[k].m, agg[k].f); b.set('stats', k, d); });
          old.forEach(function (o) { if (!agg[o.id]) b.delete('stats', o.id); });
          MT.audit.add(b, { action: 'stats.rebuild', targetType: 'stats', detail: ids.length + ' counters recomputed' });
          return b.commit(function (d, t) { step('Writing counters… ' + d + '/' + t); }).then(function () { return { counters: ids.length, removed: old.filter(function (o) { return !agg[o.id]; }).length }; });
        });
      });
    }
  });

  /* =============== sample data (live mode) =============== */
  var Sample = (MT.sample = {
    exists: function () { return MT.db.get('meta', 'sample').then(function (d) { return d; }, function () { return null; }); },
    load: function (step) {
      step = step || function () {}; var me = MT.auth.profile(), made = { orgs: [], users: [], trees: [] }, rnd = MT.rng(99), NAMES = ['Aarav Shah', 'Diya Patil', 'Kabir Rao', 'Meera Nair', 'Rohan Das', 'Saanvi Iyer', 'Vihaan Joshi', 'Zoya Khan', 'Isha Menon', 'Arjun Verma', 'Tara Bhat', 'Neel Pawar'];
      var f, s1, s2, now = Date.now();
      function mkOrg(type, name, parent, city) {
        return MT.ids.org(type).then(function (id) {
          var uid = 'sample_' + id.toLowerCase(), anc = (parent ? parent.ancestorOrgIds : []).concat([id]), c = MT.geoData.city(city);
          var org = { id: id, type: type, name: name, regNo: 'SAMPLE', address: 'Sample address', city: city, state: c.state, country: 'India', contactName: 'Sample Admin', phone: '', email: '', logo: '', status: 'approved', parentOrgId: parent ? parent.id : '', ancestorOrgIds: anc, createdBy: me.userId, createdAt: now, sample: true };
          var prof = { userId: id, role: type, orgId: id, ancestorOrgIds: anc, active: true, status: 'active', name: 'Sample Admin', email: '', authEmail: '', phone: '', createdAt: now, createdBy: me.userId, sample: true };
          var b = MT.db.batch(); b.set('orgs', id, Object.assign({}, org, { id: undefined })); b.set('users', uid, prof); b.set('userIds', id, { uid: uid, orgId: id, ancestorOrgIds: anc });
          var g = { users: MT.db.inc(1), orgsApproved: MT.db.inc(1) }; g['orgs_' + type] = MT.db.inc(1); b.set('stats', 'global', g, { merge: true }); b.set('stats', 'org_' + id, { kind: 'org', name: name, type: type, city: city }, { merge: true });
          return b.commit().then(function () { made.orgs.push(id); made.users.push({ uid: uid, userId: id }); return org; });
        });
      }
      step('Creating organisations…');
      return mkOrg('foundation', 'Sample Foundation', null, 'Pune').then(function (o) { f = o; return mkOrg('school', 'Sample Public School', f, 'Pune'); }).then(function (o) { s1 = o; return mkOrg('school', 'Sample Valley School', f, 'Nashik'); }).then(function (o) {
        s2 = o; var students = []; step('Creating students…');
        return NAMES.reduce(function (p, name, i) {
          return p.then(function () { var org = i % 2 ? s2 : s1; return MT.ids.member(org.id).then(function (userId) { var uid = 'sample_' + userId.toLowerCase(), prof = { userId: userId, role: 'student', orgId: org.id, ancestorOrgIds: org.ancestorOrgIds, active: true, status: 'active', name: name, email: '', authEmail: '', phone: '', grade: (5 + i % 4) + '-A', roll: String(i + 1), createdAt: now, createdBy: me.userId, sample: true };
            var b = MT.db.batch(); b.set('users', uid, prof); b.set('userIds', userId, { uid: uid, orgId: org.id, ancestorOrgIds: org.ancestorOrgIds }); b.set('stats', 'global', { users: MT.db.inc(1), students: MT.db.inc(1) }, { merge: true });
            org.ancestorOrgIds.forEach(function (a) { b.set('stats', 'org_' + a, { kind: 'org', members: MT.db.inc(1) }, { merge: true }); });
            return b.commit().then(function () { made.users.push({ uid: uid, userId: userId }); students.push(Object.assign({ role: 'student' }, prof)); }); }); });
        }, Promise.resolve()).then(function () { return students; });
      }).then(function (students) {
        step('Planting sample trees…'); var city = [MT.geoData.city('Pune'), MT.geoData.city('Nashik')], codes = [];
        return students.reduce(function (p, st, i) {
          return p.then(function () { var c = city[i % 2], n = 6, cs; return MT.ids.trees(n).then(function (cc) { cs = cc; var made2 = MT.trees.build({ owner: st, speciesId: MT.species.list[(i * 7) % 40].id, lat: c.lat + (rnd() - 0.5) * 0.04, lng: c.lng + (rnd() - 0.5) * 0.04, plantedOn: MT.fmt.iso(new Date(now - (30 + rnd() * 200) * 86400000)), notes: 'Sample' }, cs);
            var b = MT.db.batch(), entries = []; made2.trees.forEach(function (t) { var d = MT.trees.stored(t); d.sample = true; b.set('trees', t.code, d); entries.push({ tree: t, sign: 1 }); codes.push(t.code); }); if (made2.plot) { made2.plot.sample = true; b.set('plots', made2.plotId, made2.plot); }
            MT.stats.apply(b, entries); return b.commit().then(function () { return made2.trees; }); }); });
        }, Promise.resolve()).then(function () { made.trees = codes; });
      }).then(function () {
        step('Adding growth updates…'); var pick = made.trees.filter(function (c, i) { return i % 4 === 0; }).slice(0, 10);
        return pick.reduce(function (p, code) { return p.then(function () { return MT.db.get('trees', code).then(function (t) { var d = new Date(); d.setDate(d.getDate() - 20); var iso = MT.fmt.iso(d); if (iso < t.plantedOn) return; return MT.updates.post({ tree: t, date: iso, health: rnd() < 0.8 ? 'healthy' : 'needs_care', heightCm: (t.heightCm || 30) + 15, notes: 'Sample update' }); }); }); }, Promise.resolve());
      }).then(function () { return MT.db.set('meta', 'sample', Object.assign({ createdAt: now, by: me.userId }, { orgs: made.orgs, users: made.users, trees: made.trees })); }).then(function () { var b = MT.db.batch(); MT.audit.add(b, { action: 'sample.load', detail: made.trees.length + ' trees, ' + made.users.length + ' people' }); return b.commit(); }).then(function () { return made; });
    },
    remove: function (step) {
      step = step || function () {};
      return MT.db.get('meta', 'sample').then(function (m) {
        if (!m) throw MT.userError('There is no sample data to remove.');
        var plots = {}, ops = [];
        function chunkDelete(items, fn) { var b = MT.db.batch(), n = 0; return items.reduce(function (p, it) { return p.then(function () { fn(b, it); if (++n >= 300) { var bb = b; return bb.commit(); } }); }, Promise.resolve()).then(function () { return b.commit(); }); }
        step('Removing growth updates…');
        return m.trees.reduce(function (p, code) { return p.then(function () { return MT.db.list('treeUpdates', { where: [['treeId', '==', code]], limit: 100 }).then(function (us) { if (!us.length) return; var b = MT.db.batch(); us.forEach(function (u) { b.delete('treeUpdates', u.id); }); return b.commit(); }); }); }, Promise.resolve()).then(function () {
          step('Removing trees…'); var b = MT.db.batch(), seen = {}; return Promise.all(m.trees.map(function (c) { return MT.db.get('trees', c); })).then(function (ts) { ts.forEach(function (t) { if (t && t.plotId) seen[t.plotId] = 1; }); var del = MT.db.batch(); m.trees.forEach(function (c) { del.delete('trees', c); }); Object.keys(seen).forEach(function (pl) { del.delete('plots', pl); }); return del.commit(); });
        }).then(function () { step('Removing people and organisations…'); var b = MT.db.batch(); m.users.forEach(function (u) { b.delete('users', u.uid); b.delete('userIds', u.userId); }); m.orgs.forEach(function (o) { b.delete('orgs', o); }); b.delete('meta', 'sample'); MT.audit.add(b, { action: 'sample.remove', detail: 'Sample data removed' }); return b.commit(); });
      });
    }
  });

  /* =============== settings =============== */
  function settingsPage(ctx) {
    var tab = ctx.query.tab || 'announcements', tabs = [['announcements', 'Announcements'], ['species', 'Species list'], ['tools', 'Tools']];
    return h`<div class="page settings-page" data-reveal><div class="page-head"><h2>Settings</h2><p class="muted">Announcements, the species master list and maintenance tools.</p></div>
      <div class="tabs" role="tablist">${tabs.map(function (t) { return h`<a role="tab" aria-selected="${tab === t[0]}" class="tab-link ${tab === t[0] ? 'active' : ''}" href="#/admin/settings?tab=${t[0]}">${t[1]}</a>`; })}</div><div id="st-body">${ui.skeleton(3, 'sk-card')}</div></div>`;
  }
  function settingsAfter(host, ctx) {
    var tab = ctx.query.tab || 'announcements', body = MT.$('#st-body', host), destroyed = false;
    function modal(title, fields, label, fn) {
      var b = document.createElement('div'); b.innerHTML = '<form class="form" novalidate><div class="form-grid">' + fields + '</div><p class="field-msg" id="m-err" role="alert"></p><div class="modal-foot inline"><button type="button" class="btn btn-ghost" data-cancel>Cancel</button><button class="btn btn-primary" type="submit">' + MT.esc(label) + '</button></div></form>';
      var form = b.querySelector('form'), dlg; b.addEventListener('click', function (e) { if (e.target.closest('[data-cancel]')) dlg.close(); });
      form.addEventListener('submit', function (e) { e.preventDefault(); var v = {}; [].forEach.call(form.elements, function (el) { if (el.name) v[el.name] = el.type === 'checkbox' ? el.checked : String(el.value).trim(); }); Promise.resolve(fn(v)).then(function () { dlg.close(); }).catch(function (er) { b.querySelector('#m-err').textContent = MT.friendlyError(er); }); });
      return ui.modal({ title: title, body: b, actions: [], onOpen: function (d) { dlg = d; } });
    }
    /* --- announcements --- */
    function announcements() {
      MT.db.list('announcements', { limit: 50 }).then(function (rows) {
        if (destroyed) return; rows.sort(function (a, b) { return b.createdAt - a.createdAt; });
        body.innerHTML = '<div class="card"><div class="card-head"><h3>Announcement banners</h3><button class="btn btn-primary btn-sm" id="an-add">' + ui.icon('plus').s + ' New announcement</button></div><p class="muted">Active announcements show as a dismissible banner at the top of every signed-in page.</p>' +
          (rows.length ? '<ul class="plain-list">' + rows.map(function (a) { return '<li><span class="badge ' + (a.active ? 'badge-ok' : '') + '">' + (a.active ? 'Live' : 'Off') + '</span> <strong>' + MT.esc(a.text) + '</strong><small>' + MT.fmt.dateTime(a.createdAt) + ' · ' + MT.esc(a.tone || 'info') + '</small><span class="btn-row tight"><button class="btn btn-soft btn-sm" data-tog="' + MT.esc(a.id) + '" data-on="' + (a.active ? '1' : '') + '">' + (a.active ? 'Turn off' : 'Turn on') + '</button><button class="btn btn-danger-soft btn-sm" data-del="' + MT.esc(a.id) + '">Delete</button></span></li>'; }).join('') + '</ul>' : '<p class="muted">No announcements yet.</p>') + '</div>'; ui.icons();
        MT.$('#an-add', body).addEventListener('click', function () { modal('New announcement', F({ id: 'text', label: 'Message (max 200 characters)', required: true, wide: true, attrs: 'maxlength="200"' }).s + F({ id: 'tone', label: 'Style', type: 'select', options: [{ value: 'info', label: 'Information' }, { value: 'warn', label: 'Warning' }] }).s, 'Publish', function (v) { if (!v.text) throw MT.userError('Please write the message.'); return MT.db.set('announcements', MT.uid('a'), { text: v.text.slice(0, 200), tone: v.tone, active: true, createdAt: Date.now() }).then(function () { ui.success('Published.'); announcements(); }); }); });
        body.addEventListener('click', function (e) { var t = e.target.closest('[data-tog]'), d = e.target.closest('[data-del]'); if (t) MT.db.update('announcements', t.dataset.tog, { active: !t.dataset.on }).then(announcements).catch(ui.error); if (d) ui.confirm('Delete this announcement?', '', 'Delete', true).then(function (ok) { if (ok) MT.db.delete('announcements', d.dataset.del).then(announcements).catch(ui.error); }); });
      }).catch(function (e) { body.innerHTML = ui.empty({ title: 'Could not load', text: MT.friendlyError(e) }).s; });
    }
    /* --- species --- */
    function species() {
      body.innerHTML = '<div class="card"><div class="card-head"><h3>Species master list</h3><button class="btn btn-primary btn-sm" id="sp-add">' + ui.icon('plus').s + ' Add species</button></div><p class="muted">These factors drive CO₂, canopy and growth estimates. Replace the starter values with local research data; changes apply to everyone (estimates are always labelled).</p><input type="search" id="sp-find" placeholder="Search species…" class="inp"><div class="table-wrap"><table class="table"><thead><tr><th>Species</th><th>Category</th><th>CO₂ kg/yr</th><th>Max height m</th><th>Growth cm/yr</th><th>Canopy m²</th><th></th></tr></thead><tbody id="sp-rows"></tbody></table></div></div>';
      function draw() { var q = MT.$('#sp-find', body).value.toLowerCase(); MT.$('#sp-rows', body).innerHTML = MT.species.list.filter(function (s) { return !q || (s.common + ' ' + s.scientific).toLowerCase().indexOf(q) > -1; }).map(function (s) { return '<tr><td><strong>' + MT.esc(s.common) + '</strong>' + (s.custom ? ' <span class="badge badge-info">edited</span>' : '') + '<br><small><em>' + MT.esc(s.scientific) + '</em></small></td><td>' + MT.esc(s.category) + '</td><td>' + s.co2 + '</td><td>' + s.maxH + '</td><td>' + s.growth + '</td><td>' + s.canopy + '</td><td><button class="btn btn-soft btn-sm" data-edit="' + MT.esc(s.id) + '">Edit</button></td></tr>'; }).join(''); }
      function edit(s) {
        s = s || { id: '', common: '', scientific: '', native: true, category: 'shade', co2: 20, maxH: 15, growth: 50, canopy: 40, tip: '' };
        modal(s.id ? 'Edit ' + s.common : 'Add species', F({ id: 'common', label: 'Common name', value: s.common, required: true }).s + F({ id: 'scientific', label: 'Scientific name', value: s.scientific }).s +
          F({ id: 'category', label: 'Category', type: 'select', value: s.category, options: MT.species.categories }).s + '<div class="field"><label class="check"><input type="checkbox" name="native" ' + (s.native ? 'checked' : '') + '><span>Native to India</span></label></div>' +
          F({ id: 'co2', label: 'CO₂ kg/yr at maturity', type: 'number', value: s.co2, attrs: 'min="0" max="500" step="any"' }).s + F({ id: 'maxH', label: 'Max height (m)', type: 'number', value: s.maxH, attrs: 'min="0.5" max="100" step="any"' }).s + F({ id: 'growth', label: 'Growth (cm/yr, first 5 years)', type: 'number', value: s.growth, attrs: 'min="1" max="500" step="any"' }).s + F({ id: 'canopy', label: 'Canopy at maturity (m²)', type: 'number', value: s.canopy, attrs: 'min="0.1" max="1000" step="any"' }).s +
          F({ id: 'tip', label: 'Care tip', type: 'textarea', value: s.tip, wide: true, attrs: 'maxlength="400"' }).s, 'Save', function (v) {
          if (!v.common) throw MT.userError('Please enter the common name.'); var id = s.id || v.common.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
          var doc = { common: v.common.slice(0, 80), scientific: v.scientific.slice(0, 120), native: !!v.native, category: v.category, co2: +v.co2, maxH: +v.maxH, growth: +v.growth, canopy: +v.canopy, tip: v.tip.slice(0, 400), updatedAt: Date.now() };
          return MT.db.set('species', id, doc).then(function () { MT.species.apply([Object.assign({ id: id }, doc)]); ui.success('Species saved.'); draw(); });
        });
      }
      MT.$('#sp-find', body).addEventListener('input', MT.debounce(draw, 120)); MT.$('#sp-add', body).addEventListener('click', function () { edit(null); });
      body.addEventListener('click', function (e) { var b = e.target.closest('[data-edit]'); if (b) edit(MT.species.get(b.dataset.edit)); }); draw();
    }
    /* --- tools --- */
    function tools() {
      var live = MT.mode === 'live';
      body.innerHTML = '<div class="card"><h3>Rebuild statistics</h3><p class="muted">Dashboards read pre-computed counters. If they ever drift (for example after deleting data by hand), this recomputes all of them from the real records, 500 at a time. Safe to run repeatedly.</p><div class="btn-row"><button class="btn btn-primary" id="rb-go">' + ui.icon('refresh-cw').s + ' Rebuild statistics</button></div><p class="fine" id="rb-msg" role="status"></p></div>' +
        '<div class="card"><h3>Sample data</h3>' + (live ? '<p class="muted">Adds a small, clearly separated sample set to <em>your</em> Firebase project (1 foundation, 2 schools, 12 students, 72 trees, a few updates) so you can explore with real screens. Sample people cannot sign in. Remove it any time with one click.</p><div class="btn-row"><button class="btn btn-soft" id="sm-load">Load sample data</button><button class="btn btn-danger-soft" id="sm-del" hidden>Remove sample data</button></div><p class="fine" id="sm-msg" role="status"></p>' : '<p class="muted">You are in demo mode, which already contains a large sample data set. Use “Reset demo data” in the ribbon to start over.</p>') + '</div>';
      var rb = MT.$('#rb-go', body), rm = MT.$('#rb-msg', body);
      rb.addEventListener('click', function () { rb.disabled = true; Tools.rebuildStats(function (m) { rm.textContent = m; }).then(function (r) { rm.textContent = 'Done — ' + r.counters + ' counters recomputed' + (r.removed ? ', ' + r.removed + ' stale ones removed' : '') + '.'; ui.success('Statistics rebuilt.'); }).catch(function (e) { rm.textContent = ''; ui.error(e); }).then(function () { rb.disabled = false; }); });
      if (live) { var ld = MT.$('#sm-load', body), dl = MT.$('#sm-del', body), sm = MT.$('#sm-msg', body);
        function state() { Sample.exists().then(function (m) { ld.hidden = !!m; dl.hidden = !m; sm.textContent = m ? 'Sample data is loaded (' + (m.trees || []).length + ' trees).' : ''; }); }
        ld.addEventListener('click', function () { ld.disabled = true; Sample.load(function (x) { sm.textContent = x; }).then(function () { ui.success('Sample data loaded.'); state(); }).catch(function (e) { ui.error(e); sm.textContent = 'Stopped: ' + MT.friendlyError(e) + ' You can remove what was created with “Remove sample data”.'; state(); }).then(function () { ld.disabled = false; }); });
        dl.addEventListener('click', function () { ui.confirm('Remove all sample data?', 'Only the sample organisations, people, trees and updates are deleted. Run “Rebuild statistics” afterwards.', 'Remove', true).then(function (ok) { if (!ok) return; dl.disabled = true; return Sample.remove(function (x) { sm.textContent = x; }).then(function () { ui.success('Sample data removed. Rebuilding statistics…'); return Tools.rebuildStats(function (x) { sm.textContent = x; }); }).then(function () { sm.textContent = ''; state(); }).catch(ui.error).then(function () { dl.disabled = false; }); }); });
        state(); }
    }
    ({ announcements: announcements, species: species, tools: tools }[tab] || announcements)();
    return function () { destroyed = true; };
  }

  MT.router.add('/admin/health', { title: 'Tree health', layout: 'app', access: SA, render: healthPage, after: healthAfter });
  MT.router.add('/admin/audit', { title: 'Audit log', layout: 'app', access: MGR, render: auditPage, after: auditAfter });
  MT.router.add('/admin/settings', { title: 'Settings', layout: 'app', access: SA, render: settingsPage, after: settingsAfter });
})();
