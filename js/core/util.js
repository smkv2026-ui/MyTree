/**
 * MyTree — core utilities. Must be the first MyTree script loaded after firebase-config.js.
 * Defines the global namespace `window.MT` and small dependency-free helpers.
 * @namespace MT
 */
(function () {
  'use strict';
  var MT = (window.MT = window.MT || {});
  MT.version = '1.0.0';
  /** Runtime flags shared across modules (e.g. needsSetup). */
  MT.state = {};
  MT.APP_NAME = 'MyTree';
  MT.TAGLINE = 'Maitree — friendship with nature.';

  /* ---------- DOM ---------- */
  MT.$ = function (sel, root) { return (root || document).querySelector(sel); };
  MT.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  /* ---------- Safe HTML templating ----------
   * html`<p>${userText}</p>` escapes every interpolation by default.
   * Use MT.raw(str) only for trusted markup; nested html`` results and arrays are accepted. */
  function SafeHtml(s) { this.s = s; }
  SafeHtml.prototype.toString = function () { return this.s; };
  MT.SafeHtml = SafeHtml;
  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
  MT.esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"'`]/g, function (c) { return ESC[c]; }); };
  function part(v) {
    if (v == null || v === false || v === true) return '';
    if (v instanceof SafeHtml) return v.s;
    if (Array.isArray(v)) return v.map(part).join('');
    return MT.esc(v);
  }
  MT.html = function (strings) {
    var out = strings[0];
    for (var i = 1; i < arguments.length; i++) out += part(arguments[i]) + strings[i];
    return new SafeHtml(out);
  };
  MT.raw = function (s) { return new SafeHtml(String(s == null ? '' : s)); };
  /** Sanitise rich text with DOMPurify when available; otherwise escape. */
  MT.clean = function (s) {
    if (window.DOMPurify) return MT.raw(window.DOMPurify.sanitize(String(s || '')));
    return MT.raw(MT.esc(s));
  };

  /* ---------- Functional helpers ---------- */
  MT.sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  MT.debounce = function (fn, ms) {
    var t; return function () { var a = arguments, c = this; clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms); };
  };
  MT.throttle = function (fn, ms) {
    var last = 0, timer;
    return function () {
      var a = arguments, c = this, now = Date.now(), wait = ms - (now - last);
      if (wait <= 0) { last = now; fn.apply(c, a); }
      else { clearTimeout(timer); timer = setTimeout(function () { last = Date.now(); fn.apply(c, a); }, wait); }
    };
  };
  MT.uid = function (prefix) {
    var a = new Uint8Array(9);
    (window.crypto || { getRandomValues: function (x) { for (var i = 0; i < x.length; i++) x[i] = Math.random() * 256; } }).getRandomValues(a);
    var s = ''; for (var i = 0; i < a.length; i++) s += a[i].toString(36).padStart(2, '0');
    return (prefix || '') + s.slice(0, 16);
  };
  MT.pad = function (n, w) { return String(n).padStart(w, '0'); };
  MT.clone = function (o) { return o == null ? o : JSON.parse(JSON.stringify(o)); };
  MT.pick = function (o, keys) { var r = {}; keys.forEach(function (k) { if (o && o[k] !== undefined) r[k] = o[k]; }); return r; };
  MT.groupBy = function (arr, fn) { var m = {}; arr.forEach(function (x) { var k = fn(x); (m[k] = m[k] || []).push(x); }); return m; };

  /* ---------- Formatting ---------- */
  MT.fmt = {
    num: function (n, d) { return (Number(n) || 0).toLocaleString(MT.lang || 'en-IN', { maximumFractionDigits: d == null ? 0 : d }); },
    compact: function (n) {
      n = Number(n) || 0;
      if (n >= 1e7) return (n / 1e7).toFixed(1).replace(/\.0$/, '') + ' Cr';
      if (n >= 1e5) return (n / 1e5).toFixed(1).replace(/\.0$/, '') + ' L';
      if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
      return String(Math.round(n));
    },
    date: function (d, opts) {
      if (!d) return '—';
      var dt = d instanceof Date ? d : new Date(d);
      if (isNaN(dt)) return '—';
      return dt.toLocaleDateString('en-IN', opts || { day: 'numeric', month: 'short', year: 'numeric' });
    },
    dateTime: function (d) {
      if (!d) return '—';
      var dt = new Date(d);
      return isNaN(dt) ? '—' : dt.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    },
    ago: function (d) {
      if (!d) return '—';
      var s = (Date.now() - new Date(d).getTime()) / 1000;
      if (s < 0) return 'just now';
      if (s < 60) return 'just now';
      if (s < 3600) return Math.floor(s / 60) + ' min ago';
      if (s < 86400) return Math.floor(s / 3600) + ' h ago';
      if (s < 86400 * 30) return Math.floor(s / 86400) + ' d ago';
      return MT.fmt.date(d);
    },
    iso: function (d) { return (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10); },
    kg: function (kg) { return kg >= 1000 ? MT.fmt.num(kg / 1000, 1) + ' t' : MT.fmt.num(kg) + ' kg'; },
    bytes: function (b) { return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }
  };

  /* ---------- Safe storage (never throws) ---------- */
  var mem = {};
  MT.storage = {
    get: function (k, def) {
      try { var v = window.localStorage.getItem(k); return v == null ? (k in mem ? mem[k] : def) : JSON.parse(v); } catch (e) { return k in mem ? mem[k] : def; }
    },
    set: function (k, v) {
      mem[k] = v;
      try { window.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode etc. */ }
    },
    remove: function (k) { delete mem[k]; try { window.localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  };

  /* ---------- Seeded RNG (deterministic demo data) ---------- */
  MT.rng = function (seed) {
    var a = seed >>> 0;
    function next() {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    next.int = function (lo, hi) { return lo + Math.floor(next() * (hi - lo + 1)); };
    next.pick = function (arr) { return arr[Math.floor(next() * arr.length)]; };
    next.weighted = function (items, weightFn) {
      var tot = 0, i; for (i = 0; i < items.length; i++) tot += weightFn(items[i]);
      var r = next() * tot; for (i = 0; i < items.length; i++) { r -= weightFn(items[i]); if (r <= 0) return items[i]; }
      return items[items.length - 1];
    };
    next.gauss = function () { return (next() + next() + next() + next() - 2) / 0.58; };
    return next;
  };

  /* ---------- Geo helpers ---------- */
  var B32 = '0123456789bcdefghjkmnpqrstuvwxyz';
  MT.geo = {
    geohash: function (lat, lng, precision) {
      precision = precision || 9;
      var idx = 0, bit = 0, even = true, hash = '', latR = [-90, 90], lngR = [-180, 180];
      while (hash.length < precision) {
        var r = even ? lngR : latR, v = even ? lng : lat, mid = (r[0] + r[1]) / 2;
        if (v > mid) { idx = idx * 2 + 1; r[0] = mid; } else { idx = idx * 2; r[1] = mid; }
        even = !even;
        if (++bit === 5) { hash += B32[idx]; bit = 0; idx = 0; }
      }
      return hash;
    },
    /** Great-circle distance in metres. */
    distance: function (a, b, c, d) {
      var R = 6371000, rad = Math.PI / 180;
      var dLat = (c - a) * rad, dLng = (d - b) * rad;
      var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a * rad) * Math.cos(c * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
      return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
    }
  };

  /* ---------- Readable passwords: Maple-River-4821 ---------- */
  var W1 = ['Maple', 'Neem', 'Banyan', 'Peepal', 'Mango', 'Teak', 'Cedar', 'Willow', 'Jasmine', 'Lotus', 'Amla', 'Sal', 'Oak', 'Pine', 'Fern', 'Bamboo', 'Palm', 'Ashoka', 'Champa', 'Tulsi'];
  var W2 = ['River', 'Sunrise', 'Monsoon', 'Meadow', 'Forest', 'Cloud', 'Breeze', 'Garden', 'Valley', 'Harvest', 'Dawn', 'Rain', 'Hill', 'Leaf', 'Brook', 'Moon', 'Spring', 'Dew', 'Star', 'Lake'];
  MT.genPassword = function () {
    var a = new Uint32Array(3);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(a);
    else a = [Math.random() * 4e9, Math.random() * 4e9, Math.random() * 4e9];
    return W1[a[0] % W1.length] + '-' + W2[a[1] % W2.length] + '-' + (1000 + (a[2] % 9000));
  };

  /* ---------- Validation ---------- */
  MT.valid = {
    email: function (s) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || '').trim()); },
    phone: function (s) { return /^[+]?[0-9 ()-]{7,16}$/.test(String(s || '').trim()); },
    password: function (s) { return String(s || '').length >= 8; }
  };

  /* ---------- Image compression (canvas) ----------
   * Returns {dataUrl, width, height, size}. Used for org logos now, photos in phase 2. */
  MT.img = {
    load: function (src) {
      return new Promise(function (res, rej) {
        var im = new Image(); im.onload = function () { res(im); }; im.onerror = function () { rej(new Error('Could not read that image.')); }; im.src = src;
      });
    },
    fileToDataUrl: function (file) {
      return new Promise(function (res, rej) {
        var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = function () { rej(new Error('Could not read that file.')); }; r.readAsDataURL(file);
      });
    },
    compress: function (file, opts) {
      opts = opts || {};
      var max = opts.max || 1280, q = opts.quality || 0.7, type = opts.type || 'image/jpeg';
      return MT.img.fileToDataUrl(file).then(MT.img.load).then(function (im) {
        var w = im.naturalWidth, h = im.naturalHeight, s = Math.min(1, max / Math.max(w, h));
        var cw = Math.max(1, Math.round(w * s)), ch = Math.max(1, Math.round(h * s));
        var c = document.createElement('canvas'); c.width = cw; c.height = ch;
        var ctx = c.getContext('2d');
        if (type === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cw, ch); }
        ctx.drawImage(im, 0, 0, cw, ch);
        var out = c.toDataURL(type, q);
        return { dataUrl: out, width: cw, height: ch, size: Math.round(out.length * 0.75) };
      });
    }
  };

  /* ---------- Misc ---------- */
  MT.prefersReducedMotion = function () {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  };
  MT.copy = function (text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return new Promise(function (res, rej) {
      var t = document.createElement('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select();
      try { document.execCommand('copy') ? res() : rej(); } catch (e) { rej(e); }
      document.body.removeChild(t);
    });
  };
  MT.download = function (filename, content, mime) {
    var blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'text/plain' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };
  MT.csv = function (rows) {
    return rows.map(function (r) {
      return r.map(function (c) { c = c == null ? '' : String(c); return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(',');
    }).join('\r\n');
  };
  MT.log = function () { if (MT.debug) console.log.apply(console, ['[MT]'].concat([].slice.call(arguments))); };
  MT.friendlyError = function (e) {
    var code = (e && e.code) || '', msg = (e && e.message) || '';
    var map = {
      'auth/invalid-credential': 'That ID/e-mail and password do not match. Please try again.',
      'auth/wrong-password': 'That password is not right. Please try again.',
      'auth/user-not-found': 'We could not find that account.',
      'auth/invalid-email': 'That e-mail address does not look right.',
      'auth/email-already-in-use': 'An account with this e-mail already exists. Try signing in instead.',
      'auth/weak-password': 'Please choose a stronger password (at least 8 characters).',
      'auth/too-many-requests': 'Too many attempts. Please wait a few minutes and try again.',
      'auth/network-request-failed': 'No internet connection. Please check your network and retry.',
      'auth/operation-not-allowed': 'E-mail/password sign-in is not enabled yet. The site owner must enable it in Firebase (see SETUP.md).',
      'permission-denied': 'You do not have permission to do that.',
      'unavailable': 'The service is temporarily unreachable. Please retry in a moment.'
    };
    if (map[code]) return map[code];
    if (e && e.friendly) return msg;
    return 'Something went wrong. Please try again.' + (MT.debug && msg ? ' (' + msg + ')' : '');
  };
  /** Error whose message is already safe to show to users. */
  MT.userError = function (message) { var e = new Error(message); e.friendly = true; return e; };

  var q = new URLSearchParams(location.search || (location.hash.indexOf('?') > -1 ? location.hash.split('?')[1] : ''));
  MT.debug = q.has('debug');
  MT.forceDemo = q.get('demo') === '1';
})();
