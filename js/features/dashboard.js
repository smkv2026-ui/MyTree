/**
 * MyTree — role home (#/dashboard), "coming soon" placeholders for features built in later phases, and the 404 page.
 */
(function () {
  'use strict';
  var MT = window.MT, h = MT.html, raw = MT.raw, ui = MT.ui;

  /** Animated progress ring. */
  MT.ui.ring = function (pct, label, sub, size) {
    size = size || 132; var r = 52, c = 2 * Math.PI * r, p = Math.max(0, Math.min(100, pct || 0));
    return raw('<div class="ring" style="--size:' + size + 'px"><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="' + r + '" class="ring-bg"/><circle cx="60" cy="60" r="' + r + '" class="ring-fg" style="--c:' + c.toFixed(1) + ';--o:' + (c * (1 - p / 100)).toFixed(1) + '" transform="rotate(-90 60 60)"/></svg>' +
      '<div class="ring-txt"><strong>' + MT.esc(label) + '</strong>' + (sub ? '<span>' + MT.esc(sub) + '</span>' : '') + '</div></div>');
  };

  function greeting(name) {
    var hr = new Date().getHours();
    return (hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening') + ', ' + name.split(' ')[0];
  }
  function stat(icon, label, value, opts) {
    opts = opts || {};
    return h`<div class="kpi card"><span class="kpi-ic">${ui.icon(icon)}</span><div><strong class="kpi-num" data-count="${value}" data-decimals="${opts.decimals || 0}" data-suffix="${opts.suffix || ''}">0</strong><span class="kpi-label">${label}</span></div></div>`;
  }
  MT.ui.kpi = stat;

  function treeRow(t) {
    var sp = MT.species.get(t.speciesId);
    return h`<li class="tree-row"><span class="tree-thumb">${ui.treeArt(t.health, 44)}</span><div class="tree-row-main"><strong>${sp.common}</strong><small>${t.code} · planted ${MT.fmt.date(t.plantedOn)}</small></div><span class="hdot hdot-${t.health}" title="${ui.healthLabel[t.health]}"></span></li>`;
  }

  function actions(role) {
    var a = [['sprout', 'Plant a tree', '/plant', 'primary'], ['clipboard-check', 'Post an update', '/updates'], ['map', 'Open the map', '/map']];
    if (['school', 'institution', 'foundation'].indexOf(role) > -1) a.splice(2, 0, ['users', 'Add people', '/people'], ['file-spreadsheet', 'Bulk upload', '/bulk']);
    if (role === 'foundation') a.push(['building-2', 'Organisations', '/orgs']);
    return h`<div class="actions">${a.map(function (x) { return h`<a class="action ${x[3] === 'primary' ? 'action-primary' : ''}" href="#${x[2]}">${ui.icon(x[0])}<span>${x[1]}</span>${MT.router.isSoon(x[2]) ? h`<em class="soon-pill">Soon</em>` : ''}</a>`; })}</div>`;
  }

  function dashboard() {
    var s = MT.auth.session(), p = s.profile, role = p.role, isOrg = MT.ORG_TYPES.indexOf(role) > -1;
    if (role === 'super_admin') { MT.router.go('/admin', { replace: true }); return ''; }
    var own = MT.db.list('trees', { where: [['ownerId', '==', p.userId]] });
    var orgStats = isOrg ? MT.db.get('stats', 'org_' + p.orgId) : Promise.resolve(null);
    var kids = isOrg ? MT.db.list('orgs', { where: [['parentOrgId', '==', p.orgId]] }) : Promise.resolve([]);
    var recentOrg = isOrg ? MT.db.list('trees', { where: [['ancestorOrgIds', 'array-contains', p.orgId]], limit: 400 }) : Promise.resolve([]);
    return Promise.all([own, orgStats, kids, recentOrg]).then(function (r) {
      var mine = r[0], os = r[1] || {}, children = r[2], orgTrees = r[3];
      var alive = mine.filter(function (t) { return t.status !== 'dead'; }), now = Date.now();
      var co2 = alive.reduce(function (a, t) { return a + MT.species.co2Total(t.speciesId, MT.species.ageYears(t.plantedOn, now)); }, 0);
      var survival = mine.length ? Math.round(alive.length / mine.length * 100) : 0;
      var recent = (isOrg ? orgTrees : mine).slice().sort(function (a, b) { return b.createdAt - a.createdAt; }).slice(0, 6);
      var orgAlive = os.treesAlive || 0, orgTotal = os.trees || 0;
      return h`<div class="page">
        <section class="welcome card-hero" data-reveal>
          <div><p class="eyebrow">${MT.ROLE_LABEL[role]}${s.org ? ' · ' + s.org.name : ''}</p><h2>${greeting(p.name)} 🌿</h2>
            <p>${mine.length ? 'You have planted ' + MT.fmt.num(mine.length) + ' tree' + (mine.length > 1 ? 's' : '') + '. Keep nurturing them!' : 'Your forest starts with a single sapling. Ready when you are.'}</p></div>
          ${ui.ring(survival, survival + '%', 'survival')}
        </section>
        ${actions(role)}
        <section class="kpi-grid">
          ${stat('trees', 'My trees', mine.length)}${stat('heart-pulse', 'Alive & growing', alive.length)}
          ${stat('wind', 'CO₂ absorbed (est.)', co2, { suffix: ' kg' })}
          ${isOrg ? stat('users', 'Members', os.members || 0) : stat('flame', 'Update streak (weeks)', 0)}
          ${isOrg ? stat('trees', 'Trees in my organisation', orgTotal) : ''}${isOrg ? stat('shield-check', 'Org survival', orgTotal ? Math.round(orgAlive / orgTotal * 100) : 0, { suffix: '%' }) : ''}
        </section>
        <div class="two-col">
          <section class="card" data-reveal><div class="card-head"><h3>${isOrg ? 'Recent trees in your organisation' : 'Your recent trees'}</h3></div>
            ${recent.length ? h`<ul class="tree-list">${recent.map(treeRow)}</ul>` : ui.empty({ title: 'No trees yet', text: 'Plant your first tree and it will appear here with its own ID and QR code.', action: { label: 'Plant a tree', href: '#/plant' } })}</section>
          <section class="card" data-reveal>
            <div class="card-head"><h3>${isOrg ? 'Your network' : 'Getting started'}</h3></div>
            ${isOrg ? (children.length ? h`<ul class="plain-list">${children.map(function (c) { return h`<li><strong>${c.name}</strong> ${ui.statusBadge(c.status)}<small>${MT.ROLE_LABEL[c.type]} · ${c.city}</small></li>`; })}</ul>` : h`<p class="muted">No organisations beneath you yet. Sub-accounts and students will appear here.</p>`)
              : h`<ol class="check-list"><li class="done">Create your account</li><li class="${mine.length ? 'done' : ''}">Plant your first tree</li><li>Post your first growth update</li><li>Earn the “Green Guardian” badge</li></ol>`}
          </section>
        </div></div>`;
    });
  }

  /* ---------- Coming-soon placeholders (replaced when the real feature registers the same route) ---------- */
  var SOON = [
    ['/plant', 'Plant a tree', 2, 'The 4-step planting stepper with map picker and photo upload.'],
    ['/trees', 'My trees', 2, 'Your trees on a map and in a grid, with filters.'],
    ['/trees/:id', 'Tree', 3, 'Tree page with timeline, growth chart and QR.'],
    ['/updates', 'Growth updates', 3, 'Post and track weekly, monthly or yearly updates.'],
    ['/notifications', 'Notifications', 3, 'Updates that are due or overdue.'],
    ['/people', 'People', 4, 'Add and manage students and members, and print credential sheets.'],
    ['/orgs', 'Organisations', 4, 'Sub-foundations, schools and institutions beneath you.'],
    ['/bulk', 'Bulk upload', 5, 'Download Excel templates and import trees, students and updates.'],
    ['/map', 'Map', 2, 'All trees on a real map with clusters, heatmap and satellite.'],
    ['/leaderboard', 'Leaderboard', 7, 'Schools and students ranked by trees planted and cared for.'],
    ['/help', 'Help centre', 7, 'Searchable guides for every role.'],
    ['/admin/reports', 'Reports', 6, 'Sortable tables with CSV, Excel and PDF export.'],
    ['/admin/audit', 'Audit log', 6, 'Every admin and on-behalf action, with who did what for whom.']
  ];
  SOON.forEach(function (s) {
    MT.router.add(s[0], { title: s[1], layout: 'app', access: 'auth', soon: true, render: function () {
      return h`<div class="page"><div class="card soon-card" data-reveal>${raw('<svg viewBox="0 0 160 120" class="empty-art" aria-hidden="true"><ellipse cx="80" cy="104" rx="52" ry="8" fill="currentColor" opacity=".08"/><path d="M80 100V70" stroke="#8b5e3c" stroke-width="5" stroke-linecap="round"/><path d="M80 78c-10-1-17-8-16-18 10 0 17 6 16 18z" fill="#2e9e5b"/></svg>')}
        <p class="eyebrow">Coming soon · build phase ${s[2]}</p><h2>${s[1]}</h2><p>${s[3]}</p><a class="btn btn-soft" href="#/dashboard">Back to dashboard</a></div></div>`;
    } });
  });

  MT.router.add('/dashboard', { title: 'Dashboard', layout: 'app', access: 'auth', render: dashboard });
  MT.router.add('/404', { title: 'Page not found', layout: 'public', access: 'public', render: function () {
    return h`<div class="wrap narrow notfound"><div class="empty">${raw('<svg viewBox="0 0 160 120" class="empty-art" aria-hidden="true"><path d="M80 100V70" stroke="#8b5e3c" stroke-width="5" stroke-linecap="round"/><circle cx="80" cy="58" r="22" fill="#c9d8cf"/></svg>')}<h1>This path has not grown yet</h1><p>We could not find that page.</p><a class="btn btn-primary" href="#/">Take me home</a></div></div>`;
  } });
})();
