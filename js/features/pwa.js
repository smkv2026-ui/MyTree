/**
 * MyTree — PWA glue: registers the service worker (http/https only), offers "Install app" (palette + settings + banner),
 * and tells the user when a new version is ready. Nothing here runs from file:// (demo opened locally), which is fine.
 */
(function () {
  'use strict';
  var MT = window.MT, ui = MT.ui, deferred = null, KEY = '';
  var secure = /^https?:$/.test(location.protocol) && !/[?&]nosw=1/.test(location.search);
  var installed = window.matchMedia && (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone);

  MT.pwa = {
    canInstall: function () { return !!deferred && !installed; },
    install: function () {
      if (!deferred) { ui.toast('Use your browser menu → “Install app” / “Add to Home screen”.'); return Promise.resolve(false); }
      deferred.prompt(); return deferred.userChoice.then(function (c) { deferred = null; if (c.outcome === 'accepted') ui.success('MyTree installed. Look for it on your home screen.'); hideBanner(); return c.outcome === 'accepted'; });
    },
    supported: secure && 'serviceWorker' in navigator
  };

  function hideBanner() { var b = document.getElementById('pwa-banner'); if (b) b.remove(); }
  function showBanner() {
    if (document.getElementById('pwa-banner') || MT.storage.get('pwaDismissed', false)) return;
    var b = document.createElement('div'); b.id = 'pwa-banner'; b.className = 'pwa-banner'; b.setAttribute('role', 'region'); b.setAttribute('aria-label', 'Install MyTree');
    b.innerHTML = '<img src="assets/icons/icon-192.png" alt="" width="40" height="40"><div><strong>Install MyTree</strong><span>Open it like an app, even with patchy internet.</span></div><button class="btn btn-primary btn-sm" data-i>Install</button><button class="btn btn-ghost btn-sm" data-x aria-label="Dismiss">Not now</button>';
    b.querySelector('[data-i]').addEventListener('click', MT.pwa.install);
    b.querySelector('[data-x]').addEventListener('click', function () { MT.storage.set('pwaDismissed', true); hideBanner(); });
    document.body.appendChild(b);
  }

  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; setTimeout(showBanner, 8000); });
  window.addEventListener('appinstalled', function () { deferred = null; hideBanner(); });

  if (MT.palette) MT.palette.register({ title: 'Install the app', hint: 'Action', icon: 'download', keywords: 'pwa home screen', run: MT.pwa.install });

  if (MT.pwa.supported) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').then(function (reg) {
        reg.addEventListener('updatefound', function () {
          var w = reg.installing; if (!w) return;
          w.addEventListener('statechange', function () { if (w.state === 'installed' && navigator.serviceWorker.controller) ui.toast('A new version of MyTree is ready — reload to update.'); });
        });
      }).catch(function (e) { MT.log('sw failed', e && e.message); });
    });
  }
})();
