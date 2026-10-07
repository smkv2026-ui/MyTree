/**
 * MyTree — lazy feature bundles. Rarely used screens (bulk upload, reports, green cover, badges/certificates, help + tour, translations)
 * are plain script files that load on first use, so the first screen needs ~30 % less JavaScript.
 *
 *   MT.lazy.load('social').then(function () { MT.gamify… })   // idempotent, shared promise
 *
 * Every bundle that owns routes registers a stub route here; the stub shows a skeleton, loads the files (which register the REAL route for the
 * same pattern — later registrations win) and re-renders. Paths below are also precached by sw.js (it reads this file), so bundles work offline.
 */
(function () {
  'use strict';
  var MT = window.MT, ui = MT.ui, B = {
    bulk: { files: ['js/features/bulk-core.js', 'js/features/bulk.js'], routes: ['/bulk'], access: 'auth' },
    reports: { files: ['js/features/reports.js'], routes: ['/admin/reports'], access: 'auth' },
    green: { files: ['js/data/imagery.js', 'js/features/greencover.js'], routes: ['/green', '/green/:id'], access: 'auth' },
    social: { files: ['js/features/gamify.js', 'js/features/certificates.js'], routes: ['/leaderboard', '/badges'], access: 'auth' },
    help: { files: ['js/data/help.js', 'js/features/help.js', 'js/features/tours.js'], routes: ['/help'], access: 'public' },
    phrases: { files: ['js/data/phrases.js'], routes: [] }
  }, loading = {}, done = {};

  function script(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = src; s.async = false;
      s.onload = res; s.onerror = function () { rej(MT.userError('Could not load part of the app (' + src + '). Check your connection and try again.')); };
      document.head.appendChild(s);
    });
  }
  MT.lazy = {
    bundles: B,
    load: function (name) {
      var b = B[name]; if (!b) return Promise.reject(new Error('Unknown bundle ' + name));
      if (done[name]) return Promise.resolve();
      return loading[name] || (loading[name] = b.files.reduce(function (p, f) { return p.then(function () { return script(f); }); }, Promise.resolve()).then(function () { done[name] = true; }, function (e) { delete loading[name]; throw e; }));
    },
    isLoaded: function (name) { return !!done[name]; }
  };

  if (MT.lang !== 'en') MT.lazy.load('phrases').then(function () { if (MT.i18nDom) MT.i18nDom.translate(); }, function () {});

  Object.keys(B).forEach(function (name) {
    B[name].routes.forEach(function (pattern) {
      MT.router.add(pattern, {
        title: 'Loading…', layout: 'app', access: B[name].access, lazyStub: true,
        render: function () { return '<div class="page">' + ui.skeleton(4, 'sk-line').s + '</div>'; },
        after: function (host) {
          var dead = false;
          if (done[name]) { host.innerHTML = '<div class="page"><div class="empty"><h2>This page could not be opened</h2><p>Please reload the app.</p></div></div>'; return; }
          MT.lazy.load(name).then(function () { if (!dead) MT.router.refresh(); }).catch(function (e) { if (!dead) { host.innerHTML = '<div class="page"><div class="empty"><h2>Could not load this page</h2><p>' + MT.esc(MT.friendlyError(e)) + '</p><button class="btn btn-primary" onclick="location.reload()">Reload</button></div></div>'; } });
          return function () { dead = true; };
        }
      });
    });
  });
})();
