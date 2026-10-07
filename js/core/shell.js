/**
 * MyTree — layouts: public site chrome, auth split-screen, and the signed-in app shell
 * (collapsible sidebar, top bar, bottom tabs + FAB, notifications, settings, command palette).
 */
(function () {
  'use strict';
  var MT = window.MT, h = MT.html, raw = MT.raw, ui = MT.ui;
  var root = null, mounted = null, mountedKey = '', mainEl = null;

  /* ---------- Navigation registry ---------- */
  var ALL = ['super_admin', 'foundation', 'school', 'institution', 'student', 'individual'];
  var NOT_SUPER = ALL.slice(1), ORGS = ['foundation', 'school', 'institution'];
  /** @type {Array<{id:string, icon:string, href:string, roles:string[], group:string, badge?:string}>} */
  MT.NAV = [
    { id: 'dashboard', icon: 'layout-dashboard', href: '/dashboard', roles: NOT_SUPER, group: 'main' },
    { id: 'plant', icon: 'sprout', href: '/plant', roles: NOT_SUPER, group: 'main' },
    { id: 'trees', icon: 'trees', href: '/trees', roles: NOT_SUPER, group: 'main' },
    { id: 'updates', icon: 'clipboard-check', href: '/updates', roles: NOT_SUPER, group: 'main', badge: 'dueCount' },
    { id: 'people', icon: 'users', href: '/people', roles: ['school', 'institution', 'foundation'], group: 'manage' },
    { id: 'orgs', icon: 'building-2', href: '/orgs', roles: ['foundation', 'super_admin'], group: 'manage' },
    { id: 'bulk', icon: 'file-spreadsheet', href: '/bulk', roles: NOT_SUPER, group: 'manage' },
    { id: 'admin', icon: 'gauge', href: '/admin', roles: ['super_admin'], group: 'admin' },
    { id: 'approvals', icon: 'badge-check', href: '/admin/approvals', roles: ['super_admin'], group: 'admin', badge: 'pendingCount' },
    { id: 'reports', icon: 'bar-chart-3', href: '/admin/reports', roles: ['super_admin'], group: 'admin' },
    { id: 'audit', icon: 'scroll-text', href: '/admin/audit', roles: ['super_admin'], group: 'admin' },
    { id: 'map', icon: 'map', href: '/map', roles: ALL, group: 'explore' },
    { id: 'leaderboard', icon: 'trophy', href: '/leaderboard', roles: NOT_SUPER, group: 'explore' },
    { id: 'help', icon: 'life-buoy', href: '/help', roles: ALL, group: 'explore' }
  ];
  var GROUPS = { main: '', manage: 'Manage', admin: 'Administration', explore: 'Explore' };
  function navFor(role) { return MT.NAV.filter(function (n) { return n.roles.indexOf(role) > -1; }); }

  /* ---------- Theme & accessibility prefs ---------- */
  var prefs = {
    theme: function () { return MT.storage.get('mt.theme', 'auto'); },
    apply: function () {
      var t = prefs.theme(), el = document.documentElement;
      if (t === 'auto') el.removeAttribute('data-theme'); else el.setAttribute('data-theme', t);
      el.setAttribute('data-fs', String(MT.storage.get('mt.fs', 100)));
      if (MT.storage.get('mt.contrast', false)) el.setAttribute('data-contrast', 'high'); else el.removeAttribute('data-contrast');
      var m = document.querySelector('meta[name=theme-color]');
      MT.store.set('themeTick', Date.now());
      if (m) m.setAttribute('content', (t === 'dark' || (t === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)) ? '#0b2b20' : '#0f3d2e');
    },
    setTheme: function (t) { MT.storage.set('mt.theme', t); prefs.apply(); },
    cycle: function () { var o = ['auto', 'light', 'dark'], n = o[(o.indexOf(prefs.theme()) + 1) % 3]; prefs.setTheme(n); ui.toast('Theme: ' + n, { duration: 1500 }); }
  };
  MT.prefs = prefs;
  prefs.apply();

  /* ---------- Notifications registry ---------- */
  MT.notify = {
    providers: [],
    /** fn() → Promise<Array<{id,icon,title,text,href,at}>> */
    register: function (fn) { MT.notify.providers.push(fn); },
    collect: function () {
      return Promise.all(MT.notify.providers.map(function (p) { return Promise.resolve().then(p).catch(function () { return []; }); }))
        .then(function (arr) { return [].concat.apply([], arr); });
    },
    counts: {}
  };
  MT.notify.register(function () {
    if (!MT.auth.isSuper()) return [];
    return MT.db.get('stats', 'global').then(function (s) {
      var n = (s && s.orgsPending) || 0; MT.notify.counts.pendingCount = n;
      return n ? [{ id: 'pending', icon: 'badge-check', title: n + ' organisation' + (n > 1 ? 's' : '') + ' awaiting approval', text: 'Review and approve new schools, institutions and foundations.', href: '/admin/approvals' }] : [];
    });
  });

  /* ---------- Small helpers ---------- */
  function ribbon() {
    if (MT.mode !== 'demo') return '';
    return '<div class="demo-ribbon" role="status"><span class="demo-dot"></span><strong>Demo mode</strong><span class="demo-txt">— sample data, stored only in this browser.</span> <button type="button" class="link-btn" data-act="reset-demo">Reset demo data</button></div>';
  }
  function themeBtn() { return '<button type="button" class="icon-btn" data-act="theme" aria-label="Switch theme (light, dark, automatic)"><i data-lucide="sun-moon" class="ic"></i></button>'; }

  function pop(id, btnHtml, bodyHtml, cls) {
    return '<div class="pop-wrap">' + btnHtml + '<div class="pop ' + (cls || '') + '" id="pop-' + id + '" hidden>' + bodyHtml + '</div></div>';
  }
  function closePops(except) {
    MT.$$('.pop:not([hidden])').forEach(function (p) {
      if (p.id === except) return;
      p.hidden = true;
      var b = document.querySelector('[aria-controls="' + p.id + '"]'); if (b) b.setAttribute('aria-expanded', 'false');
    });
  }
  function togglePop(id) {
    var p = document.getElementById('pop-' + id); if (!p) return;
    closePops(p.id);
    p.hidden = !p.hidden;
    var b = document.querySelector('[aria-controls="pop-' + id + '"]'); if (b) b.setAttribute('aria-expanded', String(!p.hidden));
    if (!p.hidden) { var f = p.querySelector('button,select,a,input'); if (f && id !== 'notif') f.focus(); }
  }

  function settingsBody() {
    var t = prefs.theme(), fs = MT.storage.get('mt.fs', 100);
    return '<h3 class="pop-title">Appearance &amp; accessibility</h3>' +
      '<div class="seg" role="group" aria-label="' + MT.t('common.theme') + '">' + ['auto', 'light', 'dark'].map(function (x) { return '<button type="button" data-theme-set="' + x + '" aria-pressed="' + (t === x) + '">' + x[0].toUpperCase() + x.slice(1) + '</button>'; }).join('') + '</div>' +
      '<label class="pop-row">' + MT.t('common.language') + '<select data-lang-set>' + MT.LANGS.map(function (l) { return '<option value="' + l.code + '"' + (l.code === MT.lang ? ' selected' : '') + '>' + l.label + '</option>'; }).join('') + '</select></label>' +
      '<div class="pop-row">' + MT.t('common.textsize') + '<div class="seg" role="group">' + [[100, 'A'], [112, 'A+'], [125, 'A++']].map(function (x) { return '<button type="button" data-fs-set="' + x[0] + '" aria-pressed="' + (fs === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div></div>' +
      '<label class="pop-row check"><input type="checkbox" data-contrast-set' + (MT.storage.get('mt.contrast', false) ? ' checked' : '') + '><span>' + MT.t('common.contrast') + '</span></label>';
  }

  /* ---------- Layout builders ---------- */
  function publicLayout() {
    return ribbon() +
      '<header class="pub-header" id="pub-header"><div class="wrap pub-bar">' +
      '<a href="#/" class="brand" aria-label="MyTree home">' + ui.logo(34).s + '<span class="brand-name">MyTree</span></a>' +
      '<nav class="pub-nav" id="pub-nav" aria-label="Main">' +
      '<a href="#/" data-scroll="how">How it works</a><a href="#/" data-scroll="forest">Forest map</a><a href="#/" data-scroll="who">Who it\'s for</a><a href="#/" data-scroll="stories">Stories</a><a href="#/" data-scroll="faq">FAQ</a></nav>' +
      '<div class="pub-actions">' + themeBtn() + '<a class="btn btn-ghost btn-sm" href="#/login">' + MT.t('common.signin') + '</a><a class="btn btn-primary btn-sm" href="#/register">' + MT.t('common.register') + '</a>' +
      '<button type="button" class="icon-btn pub-burger" data-act="pub-menu" aria-label="Menu" aria-expanded="false" aria-controls="pub-nav"><i data-lucide="menu" class="ic"></i></button></div></div></header>' +
      '<main id="main" tabindex="-1" class="pub-main"></main>' + footer();
  }
  function footer() {
    var s = MT.site;
    return '<footer class="pub-footer"><div class="wrap footer-grid">' +
      '<div><a href="#/" class="brand brand-light">' + ui.logo(34).s + '<span class="brand-name">MyTree</span></a><p class="footer-tag">' + MT.esc(MT.TAGLINE) + '</p></div>' +
      '<div><h4>Get started</h4><ul><li><a href="#/register">Create an account</a></li><li><a href="#/login">Sign in</a></li><li><a href="#/help">Help centre</a></li></ul></div>' +
      '<div><h4>Contact</h4><ul><li><a href="mailto:' + MT.esc(s.contactEmail) + '">' + MT.esc(s.contactEmail) + '</a></li><li>' + MT.esc(s.contactPhone) + '</li><li>' + MT.esc(s.address) + '</li></ul></div>' +
      '<div><h4>Good to know</h4><ul><li>Minors are never publicly identifiable by default.</li><li>Impact numbers are estimates and labelled as such.</li></ul></div>' +
      '</div><div class="wrap footer-bottom"><span>© ' + new Date().getFullYear() + ' MyTree · Maitree — friendship with nature.</span><span>Made with care for trees and the people who plant them.</span></div></footer>';
  }
  function authLayout() {
    return ribbon() + '<div class="auth-split"><aside class="auth-art" aria-hidden="true">' +
      '<a href="#/" class="brand brand-light">' + ui.logo(38).s + '<span class="brand-name">MyTree</span></a>' +
      '<div class="auth-art-body"><h2>Maitree —<br>friendship with nature.</h2><p>Every tree you plant gets a name, a place on the map and a story that grows with it.</p></div>' +
      '<svg class="auth-tree" viewBox="0 0 200 200"><path d="M100 190V110" stroke="#c8a27a" stroke-width="8" stroke-linecap="round"/><circle cx="100" cy="86" r="52" fill="#2e9e5b"/><circle cx="70" cy="104" r="34" fill="#58c488"/><circle cx="132" cy="100" r="32" fill="#3ec27a"/><circle cx="104" cy="62" r="24" fill="#79d3a0"/></svg></aside>' +
      '<main id="main" tabindex="-1" class="auth-main"></main></div>';
  }
  function bareLayout() { return ribbon() + '<main id="main" tabindex="-1" class="bare-main"></main>'; }

  function appLayout(role) {
    var items = navFor(role), p = MT.auth.profile(), org = MT.auth.session().org;
    var groups = {};
    items.forEach(function (n) { (groups[n.group] = groups[n.group] || []).push(n); });
    var side = Object.keys(GROUPS).filter(function (g) { return groups[g]; }).map(function (g) {
      return '<div class="nav-group">' + (GROUPS[g] ? '<p class="nav-label">' + GROUPS[g] + '</p>' : '') + groups[g].map(navItem).join('') + '</div>';
    }).join('');
    var tabs = mobileTabs(role, items);
    var userMenu = '<div class="pop-user"><strong>' + MT.esc(p.name) + '</strong><span>' + MT.esc(MT.ROLE_LABEL[p.role]) + (org ? ' · ' + MT.esc(org.name) : '') + '</span>' +
      '<button type="button" class="link-btn" data-copy="' + MT.esc(p.userId) + '" title="Copy user ID"><code>' + MT.esc(p.userId) + '</code> <i data-lucide="copy" class="ic ic-sm"></i></button></div>' +
      '<a class="pop-item" href="#/dashboard"><i data-lucide="user-round" class="ic"></i> My dashboard</a><a class="pop-item" href="#/change-password"><i data-lucide="key-round" class="ic"></i> Change password</a>' +
      '<button type="button" class="pop-item" data-act="logout"><i data-lucide="log-out" class="ic"></i> ' + MT.t('common.signout') + '</button>';
    return ribbon() + '<div class="shell' + (MT.storage.get('mt.sidebar', false) ? ' collapsed' : '') + '" id="shell">' +
      '<aside class="sidebar" id="sidebar" aria-label="Sidebar"><div class="side-head"><a href="#/" class="brand brand-light" aria-label="MyTree home">' + ui.logo(34).s + '<span class="brand-name">MyTree</span></a>' +
      '<button type="button" class="icon-btn side-collapse" data-act="collapse" aria-label="Collapse sidebar"><i data-lucide="panel-left-close" class="ic"></i></button></div>' +
      '<nav class="side-nav" aria-label="Primary">' + side + '</nav>' +
      '<div class="side-foot"><div class="side-user">' + ui.avatar(p.name, 34).s + '<div><strong>' + MT.esc(p.name) + '</strong><span>' + MT.esc(MT.ROLE_LABEL[p.role]) + '</span></div></div></div></aside>' +
      '<div class="side-scrim" data-act="close-drawer"></div>' +
      '<div class="shell-main"><header class="topbar"><button type="button" class="icon-btn only-mobile" data-act="drawer" aria-label="Open menu"><i data-lucide="menu" class="ic"></i></button>' +
      '<h1 class="topbar-title" id="topbar-title"></h1>' +
      '<button type="button" class="search-btn" data-act="palette" aria-label="Search (Ctrl+K)"><i data-lucide="search" class="ic"></i><span>' + MT.t('common.search') + '</span><kbd>Ctrl K</kbd></button>' +
      '<div class="topbar-actions">' +
      pop('notif', '<button type="button" class="icon-btn" data-pop-btn="notif" aria-haspopup="true" aria-expanded="false" aria-controls="pop-notif" aria-label="' + MT.t('common.notifications') + '"><i data-lucide="bell" class="ic"></i><span class="dot-badge" id="bell-badge" hidden></span></button>', '<h3 class="pop-title">' + MT.t('common.notifications') + '</h3><div id="notif-list"></div><a class="pop-item" href="#/notifications">View all notifications</a>', 'pop-wide') +
      pop('settings', '<button type="button" class="icon-btn" data-pop-btn="settings" aria-haspopup="true" aria-expanded="false" aria-controls="pop-settings" aria-label="Appearance and accessibility"><i data-lucide="settings-2" class="ic"></i></button>', settingsBody()) +
      pop('user', '<button type="button" class="icon-btn avatar-btn" data-pop-btn="user" aria-haspopup="true" aria-expanded="false" aria-controls="pop-user" aria-label="Account menu">' + ui.avatar(p.name, 34).s + '</button>', userMenu) +
      '</div></header><div id="announce"></div><main id="main" tabindex="-1" class="app-main"></main></div>' +
      tabs + '</div>';
  }
  function navItem(n) {
    var soon = MT.router.isSoon(n.href);
    return '<a class="nav-item' + (soon ? ' is-soon' : '') + '" href="#' + n.href + '" data-nav="' + n.href + '" title="' + MT.esc(MT.t('nav.' + n.id)) + '"><i data-lucide="' + n.icon + '" class="ic"></i><span class="nav-text">' + MT.esc(MT.t('nav.' + n.id)) + '</span>' +
      (soon ? '<span class="soon-pill">' + MT.t('common.soon') + '</span>' : '') + (n.badge ? '<span class="count-pill" data-badge="' + n.badge + '" hidden></span>' : '') + '</a>';
  }
  function mobileTabs(role, items) {
    var pick = function (id) { return items.filter(function (n) { return n.id === id; })[0]; };
    var left, right, fab = pick('plant');
    if (role === 'super_admin') { left = [pick('admin'), pick('approvals')]; right = [pick('map')]; fab = null; }
    else { left = [pick('dashboard'), pick('trees')]; right = [pick('map')]; }
    function tab(n) { return n ? '<a class="tab" href="#' + n.href + '" data-nav="' + n.href + '"><i data-lucide="' + n.icon + '" class="ic"></i><span>' + MT.esc(MT.t('nav.' + n.id)) + '</span></a>' : ''; }
    return '<nav class="tabbar" aria-label="Quick navigation">' + left.map(tab).join('') +
      (fab ? '<a class="fab" href="#' + fab.href + '" aria-label="Plant a tree"><i data-lucide="plus" class="ic"></i></a>' : '') +
      right.map(tab).join('') + '<button type="button" class="tab" data-act="drawer"><i data-lucide="layout-grid" class="ic"></i><span>' + MT.t('nav.more') + '</span></button></nav>';
  }

  /* ---------- Mount / unmount ---------- */
  var shell = (MT.shell = {
    reset: function () { mountedKey = ''; },
    mount: function (layout, route, ctx) {
      root = root || document.getElementById('app');
      var s = MT.auth.session(), key = layout + '|' + (layout === 'app' ? (s ? s.profile.role + s.uid + MT.lang : 'x') : MT.lang) + '|' + MT.mode;
      if (layout === 'app' && !s) layout = 'public';
      if (key !== mountedKey) {
        var html = layout === 'public' ? publicLayout() : layout === 'auth' ? authLayout() : layout === 'bare' ? bareLayout() : appLayout(s.profile.role);
        root.className = 'layout layout-' + layout;
        root.innerHTML = html; mountedKey = key; mounted = layout;
        ui.icons();
        if (layout === 'app') { shell.refreshBadges(); shell.loadAnnouncements(); }
      }
      mainEl = document.getElementById('main');
      mainEl.className = mainEl.className.replace(/\bpage-in\b/, '').trim();
      return mainEl;
    },
    routed: function (ctx, title) {
      MT.$$('[data-nav]').forEach(function (a) {
        var href = a.getAttribute('data-nav');
        var on = ctx.path === href || (href !== '/dashboard' && href !== '/admin' && ctx.path.indexOf(href + '/') === 0);
        a.classList.toggle('active', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
      });
      var tt = document.getElementById('topbar-title'); if (tt) tt.textContent = title || '';
      var an = document.getElementById('sr-announcer'); if (an) an.textContent = (title || 'Page') + ' loaded';
      closePops(); document.getElementById('shell') && document.getElementById('shell').classList.remove('drawer-open');
      if (mounted === 'app') shell.refreshBadges();
      if (!shell._first) shell._first = true; else if (mainEl) mainEl.focus({ preventScroll: true });
    },
    /** Notification list + bell badge + nav count pills. */
    refreshBadges: function () {
      if (!MT.auth.isSignedIn()) return;
      MT.notify.collect().then(function (items) {
        var b = document.getElementById('bell-badge'); if (b) { b.hidden = !items.length; b.textContent = items.length > 9 ? '9+' : String(items.length); }
        var l = document.getElementById('notif-list');
        if (l) l.innerHTML = items.length ? items.map(function (n) {
          return '<a class="notif" href="#' + MT.esc(n.href || '/dashboard') + '"><i data-lucide="' + MT.esc(n.icon || 'bell') + '" class="ic"></i><span><strong>' + MT.esc(n.title) + '</strong><small>' + MT.esc(n.text || '') + '</small></span></a>';
        }).join('') : '<p class="muted pop-empty">You are all caught up. 🌿</p>';
        MT.$$('[data-badge]').forEach(function (el) { var n = MT.notify.counts[el.getAttribute('data-badge')] || 0; el.hidden = !n; el.textContent = n; });
        ui.icons();
      });
    },
    loadAnnouncements: function () {
      MT.db.list('announcements', { where: [['active', '==', true]], limit: 3 }).then(function (rows) {
        var el = document.getElementById('announce'); if (!el) return;
        var seen = MT.storage.get('mt.seenAnn', []);
        rows = rows.filter(function (r) { return seen.indexOf(r.id) < 0; });
        el.innerHTML = rows.map(function (r) { return '<div class="announce announce-' + MT.esc(r.tone || 'info') + '" role="note"><i data-lucide="megaphone" class="ic"></i><span>' + MT.esc(r.text) + '</span><button type="button" class="icon-btn" data-ann="' + MT.esc(r.id) + '" aria-label="Dismiss announcement">×</button></div>'; }).join('');
        ui.icons();
      }).catch(function () {});
    }
  });

  /* ---------- Command palette ---------- */
  var commands = [];
  MT.palette = {
    register: function (c) { commands.push(c); },
    list: function () {
      var role = MT.auth.role(), out = [];
      if (role) navFor(role).forEach(function (n) { if (!MT.router.isSoon(n.href)) out.push({ title: MT.t('nav.' + n.id), hint: 'Go to', icon: n.icon, run: function () { MT.router.go(n.href); } }); });
      else out.push({ title: 'Sign in', hint: 'Go to', icon: 'log-in', run: function () { MT.router.go('/login'); } }, { title: 'Create an account', hint: 'Go to', icon: 'user-plus', run: function () { MT.router.go('/register'); } });
      out.push({ title: 'Home page', hint: 'Go to', icon: 'house', run: function () { MT.router.go('/'); } });
      out.push({ title: 'Switch theme', hint: 'Action', icon: 'sun-moon', run: prefs.cycle });
      MT.LANGS.forEach(function (l) { if (l.code !== MT.lang) out.push({ title: 'Language: ' + l.label, hint: 'Action', icon: 'languages', run: function () { MT.setLang(l.code); } }); });
      if (role) out.push({ title: 'Sign out', hint: 'Action', icon: 'log-out', run: doLogout });
      if (MT.mode === 'demo') out.push({ title: 'Reset demo data', hint: 'Action', icon: 'rotate-ccw', run: resetDemo });
      return out.concat(commands.filter(function (c) { return !c.roles || c.roles.indexOf(role) > -1; }));
    },
    /** Lightweight fuzzy score: substring beats subsequence. */
    score: function (q, text) {
      q = q.toLowerCase(); text = text.toLowerCase();
      if (!q) return 1;
      var i = text.indexOf(q); if (i > -1) return 100 - i;
      var qi = 0, s = 0; for (var k = 0; k < text.length && qi < q.length; k++) if (text[k] === q[qi]) { qi++; s += 1; }
      return qi === q.length ? s : 0;
    },
    open: function () {
      var all = MT.palette.list(), sel = 0, results = all;
      var body = document.createElement('div');
      body.innerHTML = '<input class="pal-input" type="search" placeholder="Type to search pages and actions…" aria-label="Search" autocomplete="off"><ul class="pal-list" role="listbox"></ul>';
      var input = body.querySelector('input'), list = body.querySelector('ul');
      function draw() {
        list.innerHTML = results.length ? results.map(function (r, i) {
          return '<li role="option" data-i="' + i + '" aria-selected="' + (i === sel) + '" class="' + (i === sel ? 'sel' : '') + '"><i data-lucide="' + MT.esc(r.icon || 'arrow-right') + '" class="ic"></i><span>' + MT.esc(r.title) + '</span><small>' + MT.esc(r.hint || '') + '</small></li>';
        }).join('') : '<li class="pal-none">Nothing found. Try another word.</li>';
        ui.icons();
        var s = list.querySelector('.sel'); if (s && s.scrollIntoView) s.scrollIntoView({ block: 'nearest' });
      }
      var dlgRef;
      function run(i) { var r = results[i]; if (!r) return; if (dlgRef) dlgRef.close(); setTimeout(function () { r.run(); }, 60); }
      input.addEventListener('input', function () {
        results = all.map(function (c) { return { c: c, s: MT.palette.score(input.value, c.title + ' ' + (c.keywords || '')) }; }).filter(function (x) { return x.s > 0; }).sort(function (a, b) { return b.s - a.s; }).map(function (x) { return x.c; });
        sel = 0; draw();
      });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown') { sel = Math.min(results.length - 1, sel + 1); draw(); e.preventDefault(); }
        else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); draw(); e.preventDefault(); }
        else if (e.key === 'Enter') { run(sel); e.preventDefault(); }
      });
      list.addEventListener('click', function (e) { var li = e.target.closest('li[data-i]'); if (li) run(+li.dataset.i); });
      ui.modal({ title: 'Quick search', body: body, actions: [], onOpen: function (d) { dlgRef = d; d.classList.add('modal-palette'); input.focus(); draw(); } });
    }
  };

  /* ---------- Actions ---------- */
  function doLogout() {
    return MT.auth.logout().then(function () { MT.shell.reset(); MT.router.go('/'); ui.toast('You have been signed out. See you soon! 🌱'); });
  }
  function resetDemo() {
    ui.confirm('Reset demo data?', 'This erases everything you added in the demo and restores the original sample data. You will be signed out.', 'Reset demo data', true).then(function (ok) {
      if (!ok) return;
      MT.auth.logout().then(function () { return MT.db.resetDemo(true); }).then(function () { location.hash = '#/'; location.reload(); });
    });
  }

  document.addEventListener('click', function (e) {
    var el = e.target;
    var sc = el.closest('[data-scroll]');
    if (sc) {
      e.preventDefault();
      var id = sc.getAttribute('data-scroll');
      var go = function () { var t = document.getElementById(id); if (t) t.scrollIntoView({ behavior: MT.prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' }); };
      var nav = document.getElementById('pub-nav'); if (nav) nav.classList.remove('open');
      if (MT.router.current() && MT.router.current().path === '/') go(); else { MT.router.go('/'); setTimeout(go, 500); }
      return;
    }
    var pb = el.closest('[data-pop-btn]');
    if (pb) { togglePop(pb.getAttribute('data-pop-btn')); return; }
    if (!el.closest('.pop')) closePops();
    var a = el.closest('[data-act]'); if (!a) { var ann = el.closest('[data-ann]'); if (ann) { var seen = MT.storage.get('mt.seenAnn', []); seen.push(ann.getAttribute('data-ann')); MT.storage.set('mt.seenAnn', seen); ann.closest('.announce').remove(); } return; }
    var act = a.getAttribute('data-act');
    if (act === 'theme') prefs.cycle();
    else if (act === 'logout') doLogout();
    else if (act === 'reset-demo') resetDemo();
    else if (act === 'palette') MT.palette.open();
    else if (act === 'collapse') { var s = document.getElementById('shell'); s.classList.toggle('collapsed'); MT.storage.set('mt.sidebar', s.classList.contains('collapsed')); }
    else if (act === 'drawer') document.getElementById('shell').classList.add('drawer-open');
    else if (act === 'close-drawer') document.getElementById('shell').classList.remove('drawer-open');
    else if (act === 'pub-menu') { var n = document.getElementById('pub-nav'); var o = n.classList.toggle('open'); a.setAttribute('aria-expanded', String(o)); }
  });
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-theme-set]'); if (t) { prefs.setTheme(t.getAttribute('data-theme-set')); MT.$$('[data-theme-set]').forEach(function (b) { b.setAttribute('aria-pressed', String(b === t)); }); }
    var f = e.target.closest('[data-fs-set]'); if (f) { MT.storage.set('mt.fs', +f.getAttribute('data-fs-set')); prefs.apply(); MT.$$('[data-fs-set]').forEach(function (b) { b.setAttribute('aria-pressed', String(b === f)); }); }
    // nav links inside the drawer close it
    if (e.target.closest('.sidebar .nav-item')) { var sh = document.getElementById('shell'); if (sh) sh.classList.remove('drawer-open'); }
  });
  document.addEventListener('change', function (e) {
    if (e.target.matches('[data-lang-set]')) MT.setLang(e.target.value);
    if (e.target.matches('[data-contrast-set]')) { MT.storage.set('mt.contrast', e.target.checked); prefs.apply(); }
  });
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (!document.querySelector('dialog[open]')) MT.palette.open(); }
    else if (e.key === 'Escape') closePops();
  });
  window.addEventListener('scroll', MT.throttle(function () { var hd = document.getElementById('pub-header'); if (hd) hd.classList.toggle('scrolled', window.scrollY > 20); }, 100), { passive: true });
  try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', prefs.apply); } catch (e) { /* old browsers */ }
  MT.store.on('session', function () { mountedKey = ''; });
})();
