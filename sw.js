/* MyTree service worker — app-shell caching so the portal opens instantly and works offline.
 * Strategy: precache the files index.html references; same-origin static files = stale-while-revalidate; navigations = network-first with offline fallback;
 * CDN libraries = cache-first (they are versioned URLs). Firebase / Google API traffic is never touched (Firestore has its own offline persistence).
 * Bump VERSION to force clients to refresh their cache. */
var VERSION = 'mytree-v2';
var SHELL = VERSION + '-shell', RUNTIME = VERSION + '-runtime';
var NEVER = /(firestore|identitytoolkit|securetoken|firebaseinstallations|googleapis\.com\/(?!css)|gstatic\.com\/firebasejs\/.*\/firebase-.*\.map)/;

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(SHELL).then(function (c) {
    return fetch('index.html', { cache: 'reload' }).then(function (r) {
      var clone = r.clone(); return r.text().then(function (html) {
        var urls = ['./', 'index.html', 'offline.html', 'manifest.json', 'assets/favicon.svg', 'assets/icons/icon-192.png'];
        var re = /(?:src|href)="((?:js|css|assets)\/[^"]+)"/g, m; while ((m = re.exec(html))) urls.push(m[1]);
        return fetch('js/core/lazy.js').then(function (l) { return l.text(); }).then(function (t) { var re2 = /'(js\/[^']+\.js)'/g, m2; while ((m2 = re2.exec(t))) urls.push(m2[1]); }, function () {}).then(function () {
          return c.put('index.html', clone).then(function () { return Promise.all(urls.map(function (u) { return c.add(new Request(u, { cache: 'reload' })).catch(function () {}); })); }); });
      });
    }).catch(function () { return c.add('offline.html'); });
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) { return Promise.all(keys.filter(function (k) { return k.indexOf(VERSION) !== 0; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('message', function (e) { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', function (e) {
  var req = e.request; if (req.method !== 'GET') return;
  var url = new URL(req.url); if (NEVER.test(req.url)) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(function (r) { var c = r.clone(); caches.open(SHELL).then(function (ch) { ch.put('index.html', c); }); return r; })
      .catch(function () { return caches.match('index.html').then(function (r) { return r || caches.match('offline.html'); }); }));
    return;
  }
  if (url.origin === location.origin) {
    e.respondWith(caches.match(req).then(function (hit) {
      var net = fetch(req).then(function (r) { if (r && r.ok) { var c = r.clone(); caches.open(SHELL).then(function (ch) { ch.put(req, c); }); } return r; }).catch(function () { return hit; });
      return hit || net;
    }));
    return;
  }
  // third-party libraries / fonts / map tiles: cache-first with runtime cache (opaque responses allowed)
  if (/cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com|fonts\.(googleapis|gstatic)\.com/.test(url.host)) {
    e.respondWith(caches.open(RUNTIME).then(function (c) { return c.match(req).then(function (hit) { return hit || fetch(req).then(function (r) { if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r; }); }); }));
  }
});
