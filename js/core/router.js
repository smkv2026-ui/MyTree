/**
 * MyTree — hash router (#/path?query), guards, layouts and page transitions.
 *
 *   MT.router.add('/trees/:id', {
 *     title: 'Tree', layout: 'app' | 'public' | 'auth' | 'bare',
 *     access: 'public' | 'guest' | 'auth' | ['super_admin', …],
 *     render(ctx) → SafeHtml | Node | string(html) | Promise of those,
 *     after(el, ctx) → optional destroy function (called when leaving the route)
 *   });
 * ctx = { path, params, query, session, route }
 */
(function () {
  'use strict';
  var MT = window.MT;
  var routes = [], token = 0, destroy = null, current = null, started = false;

  function compile(pattern) {
    var keys = [];
    var re = '^' + pattern.replace(/\/:([A-Za-z_]+)/g, function (m, k) { keys.push(k); return '/([^/]+)'; }).replace(/\/\*$/, '(?:/(.*))?') + '/?$';
    return { re: new RegExp(re), keys: keys };
  }
  function parse() {
    var h = (location.hash || '').replace(/^#/, '') || '/';
    if (h.charAt(0) !== '/') h = '/' + h;
    var parts = h.split('?'), q = {};
    new URLSearchParams(parts[1] || '').forEach(function (v, k) { q[k] = v; });
    return { path: parts[0] || '/', query: q };
  }
  function match(path) {
    for (var i = routes.length - 1; i >= 0; i--) { // later registrations win
      var r = routes[i], m = r.c.re.exec(path);
      if (m) { var params = {}; r.c.keys.forEach(function (k, j) { params[k] = decodeURIComponent(m[j + 1]); }); return { route: r, params: params }; }
    }
    return null;
  }
  function toNode(out) {
    if (out instanceof Node) return out;
    var t = document.createElement('template');
    t.innerHTML = out instanceof MT.SafeHtml ? out.s : String(out == null ? '' : out);
    return t.content;
  }

  var router = (MT.router = {
    /** Routes that exist only as "coming soon" placeholders are flagged so the nav can show a "Soon" pill. */
    add: function (pattern, def) { def.pattern = pattern; def.c = compile(pattern); routes.push(def); return router; },
    has: function (pattern) { return routes.some(function (r) { return r.pattern === pattern && !r.soon; }); },
    isSoon: function (path) { var m = match(path); return !!(m && m.route.soon); },
    parse: parse,
    current: function () { return current; },
    go: function (path, o) {
      if (o && o.replace) { history.replaceState(null, '', '#' + path); navigate(); }
      else if (('#' + path) === location.hash) navigate();
      else location.hash = path;
    },
    start: function () { if (!started) { started = true; window.addEventListener('hashchange', navigate); } return navigate(); },
    refresh: function () { return navigate(); },
    /** Return a redirect path when a route may not be shown, else null. */
    guard: function (route, ctx) {
      var s = MT.auth.session(), p = s && s.profile, a = route.access || 'auth';
      if (MT.state.needsSetup && ctx.path !== '/setup') return '/setup';
      if (ctx.path === '/setup' && !MT.state.needsSetup) return s ? MT.auth.homeRoute() : '/login';
      if (a === 'public') return null;
      if (a === 'guest') return s ? MT.auth.homeRoute() : null;
      if (!s) return '/login?next=' + encodeURIComponent(ctx.path);
      if (!p.active && ['/pending'].indexOf(ctx.path) < 0) return '/pending';
      if (Array.isArray(a) && a.indexOf(p.role) < 0) { MT.ui.toast('That page is not available for your account type.', { type: 'warn' }); return MT.auth.homeRoute(); }
      return null;
    }
  });

  function navigate() {
    var my = ++token, loc = parse();
    var m = match(loc.path) || { route: routes.filter(function (r) { return r.pattern === '/404'; })[0], params: {} };
    var route = m.route, ctx = { path: loc.path, params: m.params, query: loc.query, session: MT.auth.session(), route: route };
    var red = router.guard(route, ctx);
    if (red) { history.replaceState(null, '', '#' + red); return navigate(); }
    current = ctx;
    if (destroy) { try { destroy(); } catch (e) { console.error(e); } destroy = null; }
    var host = MT.shell.mount(route.layout || 'app', route, ctx);
    host.classList.remove('page-in');
    host.innerHTML = MT.ui.spinnerPage().s;
    window.scrollTo(0, 0);
    var title = typeof route.title === 'function' ? route.title(ctx) : route.title;
    document.title = (title ? title + ' · ' : '') + 'MyTree';
    return Promise.resolve().then(function () { return route.render(ctx); }).then(function (out) {
      if (my !== token) return;
      host.innerHTML = '';
      host.appendChild(toNode(out));
      void host.offsetWidth; host.classList.add('page-in');
      MT.ui.icons(); MT.ui.reveal(host); MT.ui.counters(host);
      var d = route.after && route.after(host, ctx);
      if (typeof d === 'function') destroy = d;
      else if (d && typeof d.then === 'function') d.then(function (fn) { if (typeof fn === 'function') { if (my === token) destroy = fn; else fn(); } });
      MT.shell.routed(ctx, title);
      if (loc.query.scroll) { var t = document.getElementById(loc.query.scroll); if (t) t.scrollIntoView(); }
    }).catch(function (e) {
      if (my !== token) return;
      console.error(e);
      host.innerHTML = '<div class="empty"><h3>Something went wrong</h3><p>' + MT.esc(MT.friendlyError(e)) + '</p><button class="btn btn-primary" id="retry">Try again</button></div>';
      var b = host.querySelector('#retry'); if (b) b.addEventListener('click', navigate);
    });
  }
})();
