/**
 * MyTree — lazy library loader with CDN fallbacks.
 * MT.loader.load('leaflet') resolves when the library (and its CSS) are ready, or rejects with a friendly error.
 * Optional SRI hashes live in MT.sri (see tools/gen-sri.mjs); a library with no hash is loaded without integrity.
 */
(function () {
  'use strict';
  var MT = window.MT;
  var CF = 'https://cdnjs.cloudflare.com/ajax/libs/';
  var JD = 'https://cdn.jsdelivr.net/npm/';
  var UP = 'https://unpkg.com/';
  var FB = 'https://www.gstatic.com/firebasejs/10.12.2/';

  /** Registry: global = window property proving the lib loaded; js/css = ordered candidate URLs (primary first). */
  MT.libs = {
    gsap:        { global: 'gsap', js: [CF + 'gsap/3.12.5/gsap.min.js', JD + 'gsap@3.12.5/dist/gsap.min.js'] },
    scrolltrigger: { global: 'ScrollTrigger', needs: ['gsap'], js: [CF + 'gsap/3.12.5/ScrollTrigger.min.js', JD + 'gsap@3.12.5/dist/ScrollTrigger.min.js'] },
    confetti:    { global: 'confetti', js: [CF + 'canvas-confetti/1.9.3/confetti.browser.min.js', JD + 'canvas-confetti@1.9.3/dist/confetti.browser.min.js'] },
    lottie:      { global: 'lottie', js: [CF + 'lottie-web/5.12.2/lottie.min.js', JD + 'lottie-web@5.12.2/build/player/lottie.min.js'] },
    dompurify:   { global: 'DOMPurify', js: [CF + 'dompurify/3.1.6/purify.min.js', JD + 'dompurify@3.1.6/dist/purify.min.js'] },
    dayjs:       { global: 'dayjs', js: [CF + 'dayjs/1.11.10/dayjs.min.js', JD + 'dayjs@1.11.10/dayjs.min.js'] },
    fuse:        { global: 'Fuse', js: [CF + 'fuse.js/7.0.0/fuse.min.js', JD + 'fuse.js@7.0.0/dist/fuse.min.js'] },
    lucide:      { global: 'lucide', js: [UP + 'lucide@0.427.0/dist/umd/lucide.min.js', JD + 'lucide@0.427.0/dist/umd/lucide.min.js'] },
    leaflet:     { global: 'L', css: [[CF + 'leaflet/1.9.4/leaflet.min.css', JD + 'leaflet@1.9.4/dist/leaflet.css']], js: [CF + 'leaflet/1.9.4/leaflet.min.js', JD + 'leaflet@1.9.4/dist/leaflet.js'] },
    markercluster: { global: 'L.markerClusterGroup', needs: ['leaflet'],
      css: [[CF + 'leaflet.markercluster/1.5.3/MarkerCluster.min.css', JD + 'leaflet.markercluster@1.5.3/dist/MarkerCluster.css'], [CF + 'leaflet.markercluster/1.5.3/MarkerCluster.Default.min.css', JD + 'leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css']],
      js: [CF + 'leaflet.markercluster/1.5.3/leaflet.markercluster.min.js', JD + 'leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js'] },
    exifr:       { global: 'exifr', js: [CF + 'exifr/7.1.3/lite.umd.js', JD + 'exifr@7.1.3/dist/lite.umd.js'] },
    qrcode:      { global: 'QRCodeStyling', js: [JD + 'qr-code-styling@1.8.4/lib/qr-code-styling.js', UP + 'qr-code-styling@1.8.4/lib/qr-code-styling.js'] },
    leafletdraw: { global: 'L.Draw', needs: ['leaflet'], css: [[CF + 'leaflet.draw/1.0.4/leaflet.draw.css', JD + 'leaflet-draw@1.0.4/dist/leaflet.draw.css']], js: [CF + 'leaflet.draw/1.0.4/leaflet.draw.js', JD + 'leaflet-draw@1.0.4/dist/leaflet.draw.js'] },
    jspdf:       { global: 'jspdf', js: [CF + 'jspdf/2.5.1/jspdf.umd.min.js', JD + 'jspdf@2.5.1/dist/jspdf.umd.min.js'] },
    chart:       { global: 'Chart', js: [CF + 'Chart.js/4.4.3/chart.umd.min.js', JD + 'chart.js@4.4.3/dist/chart.umd.js'] },
    'firebase-app':       { global: 'firebase', js: [FB + 'firebase-app-compat.js'] },
    'firebase-auth':      { global: 'firebase.auth', needs: ['firebase-app'], js: [FB + 'firebase-auth-compat.js'] },
    'firebase-app-check': { global: 'firebase.appCheck', needs: ['firebase-app'], js: [FB + 'firebase-app-check-compat.js'] },
    'firebase-firestore': { global: 'firebase.firestore', needs: ['firebase-app'], js: [FB + 'firebase-firestore-compat.js'] }
  };
  /** Optional integrity hashes: { 'https://…url': 'sha384-…' }. Filled by tools/gen-sri.mjs. */
  MT.sri = MT.sri || {};

  function has(path) {
    try { return !!path.split('.').reduce(function (o, k) { return o[k]; }, window); } catch (e) { return false; }
  }
  function tag(kind, url) {
    return new Promise(function (res, rej) {
      var el = document.createElement(kind === 'css' ? 'link' : 'script');
      if (kind === 'css') { el.rel = 'stylesheet'; el.href = url; } else { el.src = url; el.async = false; }
      if (MT.sri[url]) { el.integrity = MT.sri[url]; el.crossOrigin = 'anonymous'; }
      var t = setTimeout(function () { el.remove(); rej(new Error('timeout ' + url)); }, 15000);
      el.onload = function () { clearTimeout(t); res(); };
      el.onerror = function () { clearTimeout(t); el.remove(); rej(new Error('failed ' + url)); };
      document.head.appendChild(el);
    });
  }
  function firstOf(kind, urls) {
    var i = 0;
    return (function next() {
      if (i >= urls.length) return Promise.reject(new Error('All sources failed'));
      return tag(kind, urls[i++]).catch(next);
    })();
  }

  var cache = {};
  /** @param {string} name key of MT.libs @returns {Promise<void>} */
  MT.loader = {
    load: function (name) {
      var def = MT.libs[name];
      if (!def) return Promise.reject(new Error('Unknown library ' + name));
      if (cache[name]) return cache[name];
      if (has(def.global)) return (cache[name] = Promise.resolve());
      var deps = Promise.all((def.needs || []).map(MT.loader.load));
      cache[name] = deps.then(function () {
        // def.css = list of stylesheets; each entry is a list of alternative URLs (first that loads wins).
        var css = def.css ? Promise.all(def.css.map(function (alts) { return firstOf('css', alts); })).catch(function () {}) : Promise.resolve();
        return css.then(function () { return def.js ? firstOf('js', def.js) : null; });
      }).then(function () {
        if (!has(def.global)) throw new Error(name + ' did not initialise');
      }).catch(function (e) {
        delete cache[name];
        var err = MT.userError('We could not load a helper library (' + name + '). Please check your internet connection and try again.');
        err.cause = e; throw err;
      });
      return cache[name];
    },
    /** Load several; never rejects — resolves to {name: true|false}. */
    loadSoft: function (names) {
      var out = {};
      return Promise.all(names.map(function (n) { return MT.loader.load(n).then(function () { out[n] = true; }, function () { out[n] = false; }); })).then(function () { return out; });
    }
  };
})();
