/**
 * MyTree — boot sequence. Picks DEMO or LIVE mode, installs adapters, initialises auth and starts the router.
 * Always the last script loaded.
 */
(function () {
  'use strict';
  var MT = window.MT;

  function fatal(title, msg) {
    var app = document.getElementById('app');
    app.className = 'layout layout-bare';
    app.innerHTML = '<div class="boot-error"><h1></h1><p></p><p><a class="btn btn-primary" href="?demo=1#/">Open in demo mode</a> <button class="btn btn-ghost" onclick="location.reload()">Try again</button></p></div>';
    app.querySelector('h1').textContent = title; app.querySelector('p').textContent = msg;
  }

  var cfg = window.MT_FIREBASE_CONFIG || {};
  var configured = !!(cfg.apiKey && cfg.projectId && !/^(YOUR|PASTE)/i.test(cfg.apiKey));
  MT.mode = configured && !MT.forceDemo ? 'live' : 'demo';
  document.documentElement.setAttribute('data-mode', MT.mode);

  function selectAdapters() {
    if (MT.mode === 'live') return MT.loader.load('firebase-app').then(function () { return MT.loader.load('firebase-auth'); })
      .then(function () { return MT.loader.load('firebase-firestore'); })
      .then(function () { MT.db = MT.dbFirebase; MT.authAdapter = MT.authFirebase; return MT.db.init(); });
    MT.db = MT.dbDemo; MT.authAdapter = MT.authDemo; return MT.db.init();
  }

  function boot() {
    MT.ui.loadIcons();
    MT.loader.loadSoft(['dompurify']);
    selectAdapters().then(function () { return MT.auth.needsSetup(); }).then(function (need) {
      MT.state.needsSetup = need;
      return MT.auth.init();
    }).then(function () {
      MT.ui.offlineBanner();
      return MT.router.start();
    }).catch(function (e) {
      console.error(e);
      if (MT.mode === 'live') fatal('We could not reach the database', 'Check your internet connection and your Firebase settings (see SETUP.md). You can still look around in demo mode.');
      else fatal('MyTree could not start', MT.friendlyError(e));
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  window.addEventListener('unhandledrejection', function (e) { if (MT.debug) console.error(e.reason); });
})();
