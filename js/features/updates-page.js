/**
 * MyTree — #/updates (due & overdue trees, quick posting, bulk posting, photo drop-zone), #/notifications,
 * and the notification-centre provider that feeds the bell and the "Updates" badge.
 */
(function () {
  'use strict';
  var MT = window.MT, h = MT.html, raw = MT.raw, ui = MT.ui;
  var ROLES = ['foundation', 'school', 'institution', 'student', 'individual'];

  /* ---------- bell + nav badge ---------- */
  MT.notify.register(function () {
    var p = MT.auth.profile(); if (!p || p.role === 'super_admin') return [];
    return MT.due.load().then(function (r) {
      var over = r.needs.filter(function (i) { return i.s.state === 'overdue'; }).length, due = r.needs.length - over;
      MT.notify.counts.dueCount = r.needs.length;
      var out = [];
      if (over) out.push({ id: 'overdue', icon: 'alarm-clock', title: over + ' tree' + (over > 1 ? 's' : '') + ' overdue for an update', text: 'Post a quick update to keep their story going.', href: '/updates' });
      if (due) out.push({ id: 'due', icon: 'clipboard-check', title: due + ' tree' + (due > 1 ? 's' : '') + ' due for an update', text: 'Takes under a minute each.', href: '/updates' });
      return out;
    });
  });

  function row(i, sel, orgView) {
    var t = i.tree;
    return '<li class="up-row" data-id="' + MT.esc(t.id) + '"><label class="sel-box inl"><input type="checkbox" data-sel="' + MT.esc(t.id) + '"' + (sel[t.id] ? ' checked' : '') + ' aria-label="Select ' + MT.esc(t.code) + '"></label>' +
      '<a class="tree-thumb" aria-label="Open ' + MT.esc(MT.trees.nameOf(t)) + ' ' + MT.esc(t.code) + '" href="#/trees/' + encodeURIComponent(t.id) + '">' + (t.cover ? '<img src="' + MT.esc(t.cover) + '" alt="" width="48" height="48">' : ui.treeArt(t.health, 48).s) + '</a>' +
      '<div class="up-main"><a href="#/trees/' + encodeURIComponent(t.id) + '"><strong>' + MT.esc(MT.trees.nameOf(t)) + '</strong></a><small class="mono">' + MT.esc(t.code) + '</small>' + (orgView ? '<small class="muted">' + MT.esc(t.ownerName || '') + '</small>' : '') + '</div>' +
      '<span class="hchip"><i class="hdot hdot-' + t.health + '"></i>' + MT.esc(ui.healthLabel[t.health]) + '</span><span class="badge badge-' + MT.cadence.tone(i.s) + '">' + MT.esc(MT.cadence.label(i.s)) + '</span>' +
      '<button type="button" class="btn btn-soft btn-sm" data-post="' + MT.esc(t.id) + '">Post update</button></li>';
  }

  function render() {
    var isOrg = MT.auth.isOrgAdmin();
    return h`<div class="page updates-page" data-reveal>
      <div class="page-head row"><div><h2>Growth updates</h2><p class="muted" id="up-sub">Checking what is due…</p></div><button class="btn btn-ghost" id="up-ics">${ui.icon('calendar-plus')} Calendar reminders</button></div>
      <div class="sum-row" id="up-sum"></div>
      <div class="toolbar card"><div class="tb-row">
        ${isOrg ? h`<div class="seg" role="group" aria-label="Scope"><button type="button" data-scope="mine" aria-pressed="false">Mine</button><button type="button" data-scope="org" aria-pressed="true">My organisation</button></div>` : ''}
        <div class="seg" role="group" aria-label="Show"><button type="button" data-tab="needs" aria-pressed="true">Due &amp; overdue</button><button type="button" data-tab="soon" aria-pressed="false">Coming up</button><button type="button" data-tab="all" aria-pressed="false">All alive</button></div>
        <input type="search" id="up-q" placeholder="Search…" aria-label="Search trees"></div></div>
      <div class="bulk-bar card" id="up-bulk" hidden><strong id="up-n">0 selected</strong><button type="button" class="btn btn-sm btn-primary" id="up-bulk-post">Post one update for all</button><button type="button" class="btn btn-sm btn-soft" id="up-all">Select all shown</button></div>
      <ul class="up-list card" id="up-list">${ui.skeleton(4, 'sk-line')}</ul>
      <section class="card dropzone" id="drop" tabindex="0"><div class="dz-in">${ui.icon('images')}<div><strong>Drop photos here</strong><p class="fine">Name each file with its tree ID (for example <code>TREE-2026-000123.jpg</code>) and we will add it to that tree as a photo update.</p></div><label class="btn btn-soft">Choose photos<input type="file" id="drop-in" accept="image/*" multiple hidden></label></div><p class="fine" id="drop-msg" role="status"></p></section></div>`;
  }

  function after(host, ctx) {
    var p = MT.auth.profile(), isOrg = MT.auth.isOrgAdmin(), S = { scope: isOrg ? 'org' : 'mine', tab: 'needs', sel: {}, data: null, q: '' }, destroyed = false;
    var list = MT.$('#up-list', host);
    function loadJob(id) {
      return MT.db.get('importJobs', id).then(function (job) {
        if (!job) throw MT.userError('That import could not be found.');
        var codes = (job.treeCodes || []).slice(0, 300), trees = [], i = 0;
        function worker() { if (i >= codes.length) return Promise.resolve(); var c = codes[i++]; return MT.db.get('trees', c).then(function (t) { if (t) trees.push(t); }, function () {}).then(worker); }
        return Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]).then(function () {
          var now = Date.now(); return { items: trees.map(function (t) { return { tree: t, s: MT.cadence.status(t, now) }; }), trees: trees, capped: (job.treeCodes || []).length > 300, job: job };
        });
      });
    }
    function load(force) {
      list.innerHTML = ui.skeleton(4, 'sk-line').s;
      if (ctx && ctx.query && ctx.query.job) return loadJob(ctx.query.job).then(function (d) { if (destroyed) return; S.data = d; S.tab = 'all'; draw(); MT.$('#up-sub', host).textContent = 'Imported trees (' + d.trees.length + (d.capped ? ', first 300 shown' : '') + ') — post a first update or drop photos below.'; }).catch(function (e) { list.innerHTML = '<li class="empty"><h3>Could not load</h3><p>' + MT.esc(MT.friendlyError(e)) + '</p></li>'; });
      return MT.due.load(S.scope, force).then(function (d) { if (destroyed) return; S.data = d; draw(); }).catch(function (e) { list.innerHTML = '<li class="empty"><h3>Could not load</h3><p>' + MT.esc(MT.friendlyError(e)) + '</p></li>'; });
    }
    function shown() {
      var items = S.data.items.filter(function (i) { return i.s.state !== 'dead'; }), q = S.q.toLowerCase();
      if (S.tab === 'needs') items = items.filter(function (i) { return i.s.state === 'due' || i.s.state === 'overdue'; });
      else if (S.tab === 'soon') items = items.filter(function (i) { return i.s.state === 'soon'; });
      if (q) items = items.filter(function (i) { return (i.tree.code + ' ' + MT.trees.nameOf(i.tree) + ' ' + (i.tree.ownerName || '')).toLowerCase().indexOf(q) > -1; });
      return items.sort(function (a, b) { return a.s.dueAt - b.s.dueAt; });
    }
    function draw() {
      var d = S.data, c = { overdue: 0, due: 0, soon: 0, ok: 0 }; d.items.forEach(function (i) { if (c[i.s.state] != null) c[i.s.state]++; });
      MT.$('#up-sub', host).textContent = (c.overdue + c.due) ? (c.overdue + c.due) + ' tree' + (c.overdue + c.due > 1 ? 's' : '') + ' need an update.' : 'Everything is up to date — well done! 🌳';
      MT.$('#up-sum', host).innerHTML = [['bad', 'Overdue', c.overdue], ['warn', 'Due now', c.due], ['info', 'Coming up (3 days)', c.soon], ['ok', 'On track', c.ok]].map(function (x) { return '<div class="sum sum-' + x[0] + '"><strong>' + x[2] + '</strong><span>' + x[1] + '</span></div>'; }).join('');
      MT.$$('[data-tab]', host).forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.tab === S.tab)); });
      var rows = shown();
      list.innerHTML = rows.length ? rows.slice(0, 100).map(function (i) { return row(i, S.sel, isOrg && S.scope === 'org'); }).join('') + (rows.length > 100 ? '<li class="fine center">Showing the first 100 of ' + rows.length + ' — use search to narrow down.</li>' : '') : '<li class="empty"><h3>' + (S.tab === 'needs' ? 'Nothing is due' : 'Nothing here') + '</h3><p>' + (S.tab === 'needs' ? 'Come back later or check “Coming up”.' : 'No trees match.') + '</p></li>';
      var n = Object.keys(S.sel).length; MT.$('#up-bulk', host).hidden = !n; MT.$('#up-n', host).textContent = n + ' selected';
      if (d.job) MT.$('#up-sub', host).textContent = 'Imported trees (' + d.trees.length + ') — post a first update or drop photos below.'; else if (d.capped) MT.$('#up-sub', host).textContent += ' (showing the 500 least recently updated trees)';
    }
    host.addEventListener('click', function (e) {
      var tab = e.target.closest('[data-tab]'); if (tab) { S.tab = tab.dataset.tab; draw(); return; }
      var sc = e.target.closest('[data-scope]'); if (sc) { S.scope = sc.dataset.scope; S.sel = {}; MT.$$('[data-scope]', host).forEach(function (b) { b.setAttribute('aria-pressed', String(b === sc)); }); load(); return; }
      var pb = e.target.closest('[data-post]'); if (pb) { var t = S.data.trees.filter(function (x) { return x.id === pb.dataset.post; })[0]; if (t) MT.growth.openForm([t], function (rep) { if (!rep) { MT.shell.refreshBadges(); load(true); } }); }
    });
    host.addEventListener('change', function (e) { var c = e.target.closest('[data-sel]'); if (!c) return; if (c.checked) S.sel[c.dataset.sel] = 1; else delete S.sel[c.dataset.sel]; draw(); });
    MT.$('#up-q', host).addEventListener('input', MT.debounce(function (e) { S.q = e.target.value; draw(); }, 150));
    MT.$('#up-all', host).addEventListener('click', function () { shown().slice(0, 100).forEach(function (i) { S.sel[i.tree.id] = 1; }); draw(); });
    MT.$('#up-bulk-post', host).addEventListener('click', function () { var ts = S.data.trees.filter(function (t) { return S.sel[t.id] && t.status !== 'dead'; }); if (ts.length) MT.growth.openForm(ts, function () { S.sel = {}; MT.shell.refreshBadges(); load(true); }); });
    MT.$('#up-ics', host).addEventListener('click', function () { var ts = S.data ? S.data.trees.filter(function (t) { return t.status !== 'dead'; }).slice(0, 100) : []; if (!ts.length) return ui.toast('No trees to remind you about yet.', { type: 'warn' }); MT.ics.download(ts); ui.success('Calendar file for ' + ts.length + ' trees downloaded.'); });
    // photo drop-zone: files named by tree ID become photo updates
    var dz = MT.$('#drop', host), msg = MT.$('#drop-msg', host);
    function handle(files) {
      files = [].slice.call(files); if (!files.length) return;
      var done = 0, skipped = [];
      files.reduce(function (pr, f) {
        return pr.then(function () {
          var m = /TREE-\d{4}-\d{6}/i.exec(f.name);
          if (!m) { skipped.push(f.name + ' (no tree ID in the name)'); return; }
          msg.textContent = 'Adding ' + f.name + '…';
          return MT.db.get('trees', m[0].toUpperCase()).then(function (t) {
            if (!t) { skipped.push(f.name + ' (tree not found)'); return; }
            return MT.photoStore.prepare(f).then(function (prep) { return MT.updates.post({ tree: t, date: MT.fmt.iso(new Date()), health: t.health === 'dead' ? 'healthy' : t.health, notes: 'Photo added from gallery', photos: [prep] }); }).then(function () { done++; });
          }).catch(function (e) { skipped.push(f.name + ' (' + MT.friendlyError(e) + ')'); });
        });
      }, Promise.resolve()).then(function () { msg.textContent = done + ' photo update' + (done === 1 ? '' : 's') + ' added.' + (skipped.length ? ' Skipped: ' + skipped.join('; ') : ''); if (done) { MT.shell.refreshBadges(); load(true); } });
    }
    ['dragenter', 'dragover'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('over'); }); });
    dz.addEventListener('drop', function (e) { handle(e.dataTransfer.files); }); MT.$('#drop-in', host).addEventListener('change', function (e) { handle(e.target.files); e.target.value = ''; });
    load();
    return function () { destroyed = true; };
  }

  /* ---------- #/notifications ---------- */
  function notifications() {
    return Promise.all([MT.notify.collect(), MT.due.load()]).then(function (r) {
      var items = r[0], needs = r[1].needs.slice(0, 30);
      return h`<div class="page narrow"><div class="page-head"><h2>Notifications</h2><p class="muted">E-mail reminders need a server, which the free plan does not include — so MyTree shows what is due here and offers calendar reminders instead.</p></div>
        <section class="card">${items.length ? h`<ul class="plain-list">${items.map(function (n) { return h`<li><a href="#${n.href}"><strong>${n.title}</strong></a><small>${n.text}</small></li>`; })}</ul>` : ui.empty({ title: 'You are all caught up', text: 'Nothing needs your attention right now. 🌿' })}</section>
        ${needs.length ? h`<section class="card"><div class="card-head"><h3>Next up</h3><a href="#/updates">See all</a></div><ul class="tree-list">${needs.map(function (i) { return h`<li class="tree-row"><span class="tree-thumb">${ui.treeArt(i.tree.health, 44)}</span><div class="tree-row-main"><a href="#/trees/${i.tree.code}"><strong>${MT.trees.nameOf(i.tree)}</strong></a><small>${i.tree.code}</small></div><span class="badge badge-${MT.cadence.tone(i.s)}">${MT.cadence.label(i.s)}</span></li>`; })}</ul></section>` : ''}</div>`;
    });
  }

  MT.router.add('/updates', { title: 'Growth updates', layout: 'app', access: ROLES, render: render, after: after });
  MT.router.add('/notifications', { title: 'Notifications', layout: 'app', access: ROLES, render: notifications });
})();
