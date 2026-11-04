/**
 * MyTree — interactive 3D tree. A small procedural engine on a 2D canvas (no libraries, works offline and inside sandboxed previews).
 *
 *   var viewer = MT.tree3d.mount(el, { speciesId:'neem', health:'healthy', ageYears:3, seed:'TREE-2026-000123', controls:true });
 *   viewer.setGrowth(0.5); viewer.play(); viewer.destroy();
 *
 * What you see: the tree is generated from a seed (so the same tree always looks the same) and GROWS — trunk first, then each order of branches,
 * then leaves, flowers and fruit. Species decide the form (broad-leaf, palm, conifer, bamboo, shrub), flower / fruit colours and size. Health decides foliage
 * (lush → sparse and yellow → bare). It sways in the wind, leaves drift down, butterflies visit healthy trees, and the sky follows the light / dark theme.
 * Drag to rotate, wheel / pinch to zoom, double-click to reset, arrow keys and + / − work too (the canvas is focusable). Honours "Reduce motion".
 */
(function () {
  'use strict';
  var MT = window.MT, TAU = Math.PI * 2;

  /* ---------- small helpers ---------- */
  function hash(str) { var h = 1779033703 ^ str.length; for (var i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); } return (h >>> 0) || 1; }
  function rng(seed) { var a = typeof seed === 'string' ? hash(seed) : (seed >>> 0) || 1; return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function ease(t) { return 1 - Math.pow(1 - t, 2.2); }
  function hex(c) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }
  function mix(c, to, t) { var a = hex(c), b = to === 'w' ? [255, 255, 255] : to === 'k' ? [0, 0, 0] : hex(to); return 'rgb(' + Math.round(lerp(a[0], b[0], t)) + ',' + Math.round(lerp(a[1], b[1], t)) + ',' + Math.round(lerp(a[2], b[2], t)) + ')'; }
  function norm(v) { var l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function reduced() { return MT.prefersReducedMotion && MT.prefersReducedMotion(); }
  function isDark() { var r = document.documentElement, t = r.getAttribute('data-theme'); return t === 'dark' || (!t && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches); }

  /* ---------- species → visual style ---------- */
  var FLOWER = { gulmohar: '#ef4b2f', amaltas: '#f3c614', jacaranda: '#9a7bd8', tabebuia: '#f48fb1', champa: '#fff4d6', kachnar: '#d86aa7', parijat: '#fffaf0', bougainvillea: '#d6246e', semal: '#e03a2c', palash: '#ff7a1a', african_tulip: '#e8441f', hibiscus: '#e0245e', frangipani: '#fff0f3', ashoka: '#f08a24', kadamba: '#f6c744', jasmine: '#ffffff', rhododendron: '#d8284a', bakul: '#fff6e0', mahua: '#f0e6c8', cannonball: '#f2a1b8' };
  var FRUIT = { mango: '#e8b130', orange: '#f28c1c', lemon: '#f1d733', pomegranate: '#c4262e', guava: '#cbd66a', jamun: '#4b1f4f', jackfruit: '#a9b53b', papaya: '#f0a53a', apple: '#d8302f', peach: '#f3a06b', tamarind: '#8a5a33', amla: '#a8c75a', ber: '#c79a3a', litchi: '#d6403b', coconut: '#6a8a3a', pear: '#b7c64a', walnut: '#7a8a3a', avocado: '#4d6b2d', cashew: '#e8602c', sapota: '#b57a45', fig: '#7a4a6a', custard_apple: '#8fb35a', curry_leaf: '#222', nutmeg: '#e6b24a', mulberry: '#6b2d5c', date_palm: '#c26a1c', almond: '#a8b45a' };
  function styleFor(sp, tree) {
    var id = (sp && sp.id) || 'other', cat = (sp && sp.category) || 'shade', st = { id: id, form: 'broad', maxH: (sp && sp.maxH) || 12, canopy: (sp && sp.canopy) || 40, maturity: 12 };
    if (cat === 'palm') { st.form = 'palm'; st.maturity = 15; }
    else if (cat === 'grass') { st.form = 'bamboo'; st.maturity = 3; }
    else if (/pine|deodar|cedar|casuarina|spruce|fir/.test(id)) { st.form = 'conifer'; st.maturity = 14; }
    else if (st.maxH <= 8 || /hibiscus|bougainvillea|rose|jasmine|curry|aloe|tulsi/.test(id)) { st.form = 'shrub'; st.maturity = 5; }
    st.flower = FLOWER[id] || (cat === 'flowering' ? '#f48fb1' : null);
    st.fruit = FRUIT[id] || (cat === 'fruit' ? '#e8872a' : null);
    st.bark = /silver|birch|eucalyptus/.test(id) ? '#b9b2a2' : /teak|sal|mahogany|sandal|sheesham|sissoo/.test(id) ? '#7a5638' : /banyan|peepal|fig/.test(id) ? '#8a7a68' : '#7b5a3c';
    st.leaf = /neem|amla|tamarind|gliricidia|subabul/.test(id) ? 0 : /peepal|banyan|mango|jamun|jackfruit/.test(id) ? 1 : /teak|sal|mahogany/.test(id) ? 2 : 3;
    st.tall = clamp(st.maxH / 22, 0.45, 1.25);
    st.wide = clamp(Math.sqrt(st.canopy) / 8, 0.55, 1.5);
    return st;
  }
  var HEALTH = {
    thriving: { leaves: 1, colors: ['#2e9e5b', '#37b36a', '#4cc77b', '#1f8a50'], bloom: 1, dry: 0 },
    healthy: { leaves: 0.9, colors: ['#3f9a4f', '#5aa845', '#2f8a48', '#6db356'], bloom: 0.7, dry: 0.04 },
    needs_care: { leaves: 0.62, colors: ['#9aae3d', '#b7b84a', '#7e9a3a', '#c9b24a'], bloom: 0.25, dry: 0.25 },
    struggling: { leaves: 0.32, colors: ['#b79a3a', '#a8782f', '#8c6a2a', '#c2a14a'], bloom: 0, dry: 0.6 },
    dead: { leaves: 0, colors: ['#8c6a2a'], bloom: 0, dry: 1 }
  };

  /* ---------- sprites (cached): leaf clusters, flowers, fruit ---------- */
  var cache = {};
  function sprite(key, size, draw) {
    if (cache[key]) return cache[key];
    var c = document.createElement('canvas'); c.width = c.height = size; var x = c.getContext('2d'); draw(x, size); return (cache[key] = c);
  }
  function leafSprite(color, shade, kind) {
    return sprite('L' + color + shade + kind, 64, function (x, s) {
      var r = rng(hash(color + kind) + shade), base = shade === 0 ? mix(color, 'k', 0.38) : shade === 1 ? color : shade === 2 ? mix(color, 'w', 0.18) : mix(color, 'w', 0.36);
      x.translate(s / 2, s / 2);
      var n = kind === 3 ? 20 : 15;
      for (var i = 0; i < n; i++) {
        var a = r() * TAU, d = Math.sqrt(r()) * s * 0.3, ex = Math.cos(a) * d, ey = Math.sin(a) * d * 0.85;
        x.save(); x.translate(ex, ey); x.rotate(r() * TAU);
        x.fillStyle = r() > 0.5 ? base : mix(color, shade > 1 ? 'w' : 'k', 0.1 + r() * 0.16);
        x.beginPath();
        if (kind === 0) { x.ellipse(0, 0, 3.4, 1.4, 0, 0, TAU); }                 // small pinnate leaflets (neem, tamarind)
        else if (kind === 1) { x.ellipse(0, 0, 6.8, 4.6, 0, 0, TAU); }             // broad glossy leaves (peepal, mango)
        else if (kind === 2) { x.ellipse(0, 0, 8.2, 5.2, 0, 0, TAU); }             // big leaves (teak)
        else { x.ellipse(0, 0, 5, 2.6, 0, 0, TAU); }
        x.fill(); x.restore();
      }
    });
  }
  function needleSprite(shade) {
    return sprite('N' + shade, 64, function (x, s) {
      var r = rng(31 + shade); x.translate(s / 2, s / 2);
      for (var i = 0; i < 30; i++) { var a = (r() - 0.5) * 2.6 - Math.PI / 2 + (r() > 0.5 ? 0.2 : -0.2), l = 8 + r() * 12; x.strokeStyle = mix('#1f6b3e', shade > 1 ? 'w' : 'k', shade === 0 ? 0.35 : shade === 1 ? 0.05 : 0.2); x.lineWidth = 2.2; x.lineCap = 'round'; x.beginPath(); x.moveTo(0, 6); x.lineTo(Math.cos(a) * l * 0.9, 6 + Math.sin(a) * l * 1.5 + 10); x.stroke(); }
    });
  }
  function flowerSprite(color) {
    return sprite('F' + color, 24, function (x, s) { x.translate(s / 2, s / 2); for (var i = 0; i < 5; i++) { x.save(); x.rotate(i * TAU / 5); x.fillStyle = color; x.beginPath(); x.ellipse(0, -4.4, 2.8, 4.2, 0, 0, TAU); x.fill(); x.restore(); } x.fillStyle = '#f3c614'; x.beginPath(); x.arc(0, 0, 1.9, 0, TAU); x.fill(); });
  }
  function fruitSprite(color) {
    return sprite('R' + color, 20, function (x, s) { x.translate(s / 2, s / 2); x.fillStyle = color; x.beginPath(); x.arc(0, 0, 6, 0, TAU); x.fill(); x.fillStyle = 'rgba(255,255,255,.55)'; x.beginPath(); x.arc(-2, -2.2, 1.8, 0, TAU); x.fill(); });
  }

  /* ---------- structure generation ---------- */
  /** A branch is a polyline; `lvl` is its order (0 = trunk). Returned nodes carry everything the renderer needs. */
  function build(st, seed, healthKey, detail) {
    detail = detail || 1;
    var r = rng(seed + '|' + st.id), H = HEALTH[healthKey] || HEALTH.healthy, branches = [], leaves = [], fronds = [], blooms = [], height = 10 * st.tall;
    if (st.form === 'shrub') height = 5.2;
    if (st.form === 'bamboo') height = 11;
    var D = st.form === 'broad' ? 4 : st.form === 'shrub' ? 3 : 2;

    function mkBranch(start, dir, len, rad0, lvl, bend, parent) {
      var K = lvl === 0 ? 8 : lvl === 1 ? 6 : 4, pts = [start.slice()], p = start.slice(), d = dir.slice(), seg = len / K, i;
      for (i = 1; i <= K; i++) {
        var up = lvl === 0 ? 0.0 : lvl === 1 ? 0.07 : 0.13;
        d = norm([d[0] + (r() - 0.5) * bend, d[1] + up + (r() - 0.5) * bend * 0.45, d[2] + (r() - 0.5) * bend]);
        p = [p[0] + d[0] * seg, p[1] + d[1] * seg, p[2] + d[2] * seg]; pts.push(p);
      }
      var b = { pts: pts, r0: rad0, r1: rad0 * (lvl === 0 ? 0.42 : 0.3), lvl: lvl, len: len }; branches.push(b); return b;
    }
    function crown(b, lvl) {
      // leaf clusters, flowers and fruit near the end of terminal branches
      var n = Math.round((lvl >= D ? 7 : 3) * detail), k, pts = b.pts;
      for (k = 0; k < n; k++) {
        var f = lvl >= D ? 0.35 + r() * 0.65 : 0.7 + r() * 0.3, i = Math.min(pts.length - 2, Math.floor(f * (pts.length - 1))), t = f * (pts.length - 1) - i;
        var P = [lerp(pts[i][0], pts[i + 1][0], t) + (r() - 0.5) * 1.1, lerp(pts[i][1], pts[i + 1][1], t) + (r() - 0.3) * 0.9, lerp(pts[i][2], pts[i + 1][2], t) + (r() - 0.5) * 1.1];
        leaves.push({ p: P, s: 0.8 + r() * 0.9, c: Math.floor(r() * 4), keep: r(), start: 0.1 + lvl * 0.1 + r() * 0.1, dry: r() });
        if (st.flower && r() < 0.34) blooms.push({ p: [P[0] + (r() - 0.5) * 0.9, P[1] + 0.3, P[2] + (r() - 0.5) * 0.9], flower: true, s: 0.8 + r() * 0.5, keep: r(), start: 0.62 + r() * 0.3 });
        else if (st.fruit && r() < 0.16) blooms.push({ p: [P[0] + (r() - 0.5) * 0.7, P[1] - 0.5, P[2] + (r() - 0.5) * 0.7], flower: false, s: 0.8 + r() * 0.4, keep: r(), start: 0.78 + r() * 0.18 });
      }
    }
    function grow(b, lvl) {
      var count = lvl === 0 ? 5 + Math.floor(r() * 2) : lvl === 1 ? 3 : 2, k;
      if (lvl >= D) { crown(b, lvl); return; }
      if (lvl >= 1) crown(b, lvl);
      for (k = 0; k < count; k++) {
        var f = lvl === 0 ? 0.42 + (k / count) * 0.55 : 0.3 + r() * 0.65, i = Math.min(b.pts.length - 2, Math.floor(f * (b.pts.length - 1))), s = b.pts[i];
        var az = (lvl * 1.7 + k * 2.399 + r() * 0.9), el = lvl === 0 ? 0.55 + r() * 0.45 : 0.35 + r() * 0.5, sd = [Math.cos(az) * Math.cos(el), Math.sin(el) * (lvl === 0 ? 0.9 : 0.6), Math.sin(az) * Math.cos(el)];
        var len = b.len * (lvl === 0 ? 0.62 - f * 0.28 : 0.7) * st.wide * (0.85 + r() * 0.3);
        var c = mkBranch(s, norm(sd), len, b.r0 * 0.5, lvl + 1, 0.28 + lvl * 0.06);
        grow(c, lvl + 1);
      }
    }

    if (st.form === 'broad' || st.form === 'shrub') {
      var tr = mkBranch([0, 0, 0], norm([(r() - 0.5) * 0.12, 1, (r() - 0.5) * 0.12]), height * (st.form === 'shrub' ? 0.4 : 0.62), st.form === 'shrub' ? 0.35 : 0.62, 0, 0.06);
      grow(tr, 0); crown(tr, 0);
      var i; for (i = 0; i < 5; i++) { var az = i * 1.26 + r(), rb = mkBranch([0, 0.12, 0], norm([Math.cos(az), -0.22, Math.sin(az)]), 1.4 + r() * 0.8, 0.26, 3, 0.2); rb.root = true; }
    } else if (st.form === 'conifer') {
      var trunk = mkBranch([0, 0, 0], [0, 1, 0], height * 1.05, 0.5, 0, 0.02); var tiers = 11, ti, bi;
      for (ti = 0; ti < tiers; ti++) {
        var hf = 0.16 + ti * (0.84 / tiers), s0 = [0, hf * height * 1.05, 0], cnt = 6;
        for (bi = 0; bi < cnt; bi++) {
          var a = bi * (TAU / cnt) + ti * 0.9 + r() * 0.3, L = (1 - hf) * 4.2 * st.wide + 0.5, bb = mkBranch(s0, norm([Math.cos(a), -0.12 + (r() - 0.5) * 0.1, Math.sin(a)]), L, 0.12, 2, 0.1);
          [0.45, 0.75, 1].forEach(function (f) { var q = Math.min(bb.pts.length - 1, Math.round(f * (bb.pts.length - 1))); leaves.push({ p: [bb.pts[q][0], bb.pts[q][1] - 0.15, bb.pts[q][2]], s: 1.1 * (1.1 - hf * 0.5), c: 0, keep: r(), start: 0.3 + hf * 0.25, dry: r(), needle: true }); });
        }
      }
      leaves.push({ p: [0, height * 1.08, 0], s: 0.8, c: 0, keep: 0, start: 0.45, dry: 0, needle: true });
    } else if (st.form === 'palm') {
      var ph = height * 1.15, pts = [[0, 0, 0]], lean = (r() - 0.5) * 1.6, j, tx = 0, tz = 0;
      for (j = 1; j <= 9; j++) { tx += lean * 0.11 * (j / 9); tz += (r() - 0.5) * 0.04; pts.push([tx, ph * j / 9, tz]); }
      branches.push({ pts: pts, r0: 0.42, r1: 0.26, lvl: 0, len: ph, palm: true });
      var top = pts[pts.length - 1], nf = 11;
      for (j = 0; j < nf; j++) { var af = j * 2.399 + r() * 0.4; fronds.push({ o: top.slice(), a: af, len: 4.2 + r() * 1.4, droop: 0.5 + r() * 0.5, start: 0.3 + r() * 0.2, keep: r(), up: j / nf }); }
      if (st.id === 'coconut') for (j = 0; j < 4; j++) blooms.push({ p: [top[0] + (r() - 0.5) * 0.7, top[1] - 0.5, top[2] + (r() - 0.5) * 0.7], flower: false, s: 1.3, keep: r() * 0.7, start: 0.8 });
    } else if (st.form === 'bamboo') {
      var culms = 7, cI, nI;
      for (cI = 0; cI < culms; cI++) {
        var ang = cI * 2.399, off = 0.25 + r() * 0.55, base = [Math.cos(ang) * off, 0, Math.sin(ang) * off], cH = height * (0.7 + r() * 0.4), cpts = [base.slice()], bx = (r() - 0.5) * 0.35, bz = (r() - 0.5) * 0.35;
        for (nI = 1; nI <= 8; nI++) { var u = nI / 8; cpts.push([base[0] + bx * u * u * 3 + Math.cos(ang) * u * 0.6, cH * u, base[2] + bz * u * u * 3 + Math.sin(ang) * u * 0.6]); }
        branches.push({ pts: cpts, r0: 0.13, r1: 0.07, lvl: 0, len: cH, bamboo: true, start: cI * 0.03 });
        for (nI = 4; nI <= 8; nI++) for (j = 0; j < 3; j++) leaves.push({ p: [cpts[nI][0] + (r() - 0.5) * 1.2, cpts[nI][1] + (r() - 0.2) * 0.5, cpts[nI][2] + (r() - 0.5) * 1.2], s: 0.7 + r() * 0.5, c: Math.floor(r() * 4), keep: r(), start: 0.35 + nI * 0.025, dry: r(), slim: true });
      }
    }
    // normalise leaf order: far → near sorted at render time; give each its sprite kind
    var kind = st.form === 'conifer' ? 0 : st.form === 'bamboo' ? 3 : st.leaf;
    leaves.forEach(function (l) { l.kind = kind; });
    return { branches: branches, leaves: leaves, fronds: fronds, blooms: blooms, height: height, D: D, form: st.form };
  }

  /* ---------- the viewer ---------- */
  var SUN = norm([-0.55, 0.85, 0.5]);

  function mount(el, o) {
    o = o || {};
    var sp = o.speciesId ? MT.species.get(o.speciesId) : null, st = styleFor(sp, o), healthKey = o.health === 'dead' || o.status === 'dead' ? 'dead' : (HEALTH[o.health] ? o.health : 'healthy');
    var seed = String(o.seed || o.speciesId || 'tree'), model = build(st, seed, healthKey, o.detail), H = HEALTH[healthKey], dead = healthKey === 'dead';
    var live = o.ageYears != null ? clamp(Math.pow(Math.max(0, o.ageYears) / st.maturity, 0.65), 0.1, 1) : (o.growth != null ? o.growth : 1), shown = live, target = live;
    var still = reduced(), autorotate = o.autorotate !== false && !still, yaw = 0.5, pitch = 0.2, dist = 1, vyaw = 0, drag = null, playing = false, birth = o.birth !== false && !still, t0 = performance.now(), dead3 = false;
    var rnd = rng(seed + 'fx'), parts = [], flies = [], lastT = 0, wind = 0;

    el.classList.add('t3d'); el.innerHTML = '';
    var cv = document.createElement('canvas'); cv.className = 't3d-canvas'; cv.tabIndex = 0; cv.setAttribute('role', 'img');
    var label = function () { return 'Interactive 3D model of ' + ((sp && sp.common) || 'a tree') + ', ' + (healthKey === 'dead' ? 'bare — the tree has died' : healthKey.replace('_', ' ')) + '. Drag sideways or use the left and right arrow keys to turn it, plus and minus to zoom.'; };
    cv.setAttribute('aria-label', label()); el.appendChild(cv);
    var hint = document.createElement('div'); hint.className = 't3d-hint'; hint.textContent = '↔ Drag sideways to turn · scroll to zoom out/in'; el.appendChild(hint);
    var ui = null, slider, ageOut;
    if (o.controls) {
      ui = document.createElement('div'); ui.className = 't3d-ctl' + (o.controls === 'lite' ? ' lite' : '');
      ui.innerHTML = '<button type="button" class="btn btn-primary btn-sm" data-a="play">▶ Watch it grow</button><label class="t3d-age"' + (o.controls === 'lite' ? ' hidden' : '') + '><span class="sr-only">Tree age</span><input type="range" min="0" max="100" value="' + Math.round(live * 100) + '" aria-label="Tree age"><output></output></label>' +
        '<button type="button" class="btn btn-soft btn-sm" data-a="spin" aria-pressed="' + autorotate + '">Auto-rotate</button><button type="button" class="btn btn-ghost btn-sm" data-a="reset">Reset view</button>';
      el.appendChild(ui); slider = ui.querySelector('input'); ageOut = ui.querySelector('output');
    }
    var ctx = cv.getContext('2d'), W = 0, Hh = 0, dpr = 1;

    function ageText() { var yrs = Math.pow(shown, 1 / 0.65) * st.maturity; return (yrs < 1 ? Math.max(1, Math.round(yrs * 12)) + ' mo' : yrs.toFixed(1) + ' yr') + (Math.abs(shown - live) < 0.012 ? ' · today' : shown > live ? ' · projected' : ' · past'); }
    function sync() { if (slider) { slider.value = Math.round(shown * 100); ageOut.textContent = ageText(); } }
    function resize() { var r = el.getBoundingClientRect(); dpr = Math.min(2, window.devicePixelRatio || 1); W = Math.max(120, Math.round(r.width)); Hh = Math.max(140, Math.round(r.height)); cv.width = W * dpr; cv.height = Hh * dpr; cv.style.width = W + 'px'; cv.style.height = Hh + 'px'; }

    /* ----- projection ----- */
    var cosY, sinY, cosP, sinP, F, CX, CY, TY, SC;
    function setCam() {
      cosY = Math.cos(yaw); sinY = Math.sin(yaw); cosP = Math.cos(pitch); sinP = Math.sin(pitch);
      var fit = model.height * (0.2 + 0.8 * ease(shown)); F = Math.min(W, Hh) * 1.55; CX = W / 2; CY = Hh * (o.horizon || 0.66); TY = fit * 0.42; SC = fit;
    }
    var DZ = function () { return (SC * 3.0 + 6) / dist; };
    function proj(x, y, z, out) {
      var sway = wind ? wind * Math.pow(Math.max(0, y) / model.height, 2) : 0;
      x += sway * Math.sin(lastT * 0.0017 + y * 0.35 + z * 0.2) * 0.9; z += sway * Math.cos(lastT * 0.0013 + y * 0.3) * 0.5;
      var rx = x * cosY + z * sinY, rz = -x * sinY + z * cosY, ry = y - TY, py = ry * cosP - rz * sinP, pz = ry * sinP + rz * cosP + DZ(), s = F / pz;
      out.x = CX + rx * s; out.y = CY - py * s; out.z = pz; out.s = s; return out;
    }

    /* ----- drawing ----- */
    var prim = [], tmp = { x: 0, y: 0, z: 0, s: 1 }, tmp2 = { x: 0, y: 0, z: 0, s: 1 };
    function sky() {
      var night = isDark(), g = ctx.createLinearGradient(0, 0, 0, Hh);
      if (night) { g.addColorStop(0, '#0a1a33'); g.addColorStop(0.6, '#12304a'); g.addColorStop(1, '#16402f'); } else { g.addColorStop(0, '#9bd3f2'); g.addColorStop(0.55, '#d7efe6'); g.addColorStop(1, '#e9f3cf'); }
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, Hh);
      if (night) {
        var sr = rng('stars'), i; ctx.fillStyle = '#fff';
        for (i = 0; i < 46; i++) { ctx.globalAlpha = 0.35 + sr() * 0.6 * (0.7 + 0.3 * Math.sin(lastT * 0.002 + i)); ctx.fillRect(sr() * W, sr() * Hh * 0.6, 1.4, 1.4); }
        ctx.globalAlpha = 1; ctx.fillStyle = '#f4f1d8'; ctx.beginPath(); ctx.arc(W * 0.82, Hh * 0.17, Math.min(W, Hh) * 0.055, 0, TAU); ctx.fill();
        var mg = ctx.createRadialGradient(W * 0.82, Hh * 0.17, 0, W * 0.82, Hh * 0.17, Math.min(W, Hh) * 0.25); mg.addColorStop(0, 'rgba(244,241,216,.28)'); mg.addColorStop(1, 'rgba(244,241,216,0)'); ctx.fillStyle = mg; ctx.fillRect(0, 0, W, Hh);
      } else {
        var sg = ctx.createRadialGradient(W * 0.2, Hh * 0.14, 0, W * 0.2, Hh * 0.14, Math.min(W, Hh) * 0.6); sg.addColorStop(0, 'rgba(255,244,180,.95)'); sg.addColorStop(0.18, 'rgba(255,236,150,.55)'); sg.addColorStop(1, 'rgba(255,236,150,0)'); ctx.fillStyle = sg; ctx.fillRect(0, 0, W, Hh);
        ctx.globalAlpha = 0.7; ctx.fillStyle = '#fff'; var cl = [[0.55, 0.16, 0.9], [0.78, 0.28, 0.7], [0.3, 0.3, 0.55]];
        cl.forEach(function (c, i) { var cx = ((c[0] * W + lastT * 0.004 * (0.4 + i * 0.2)) % (W + 160)) - 80, cy = c[1] * Hh, rr = 18 * c[2] * (W / 420 + 0.6); ctx.beginPath(); ctx.arc(cx, cy, rr, 0, TAU); ctx.arc(cx + rr * 1.1, cy + 3, rr * 0.8, 0, TAU); ctx.arc(cx - rr * 1.1, cy + 4, rr * 0.7, 0, TAU); ctx.fill(); });
        ctx.globalAlpha = 1;
      }
    }
    function ground() {
      var R = 9, i, n = 56, p = proj(0, 0, 0, tmp), night = isDark();
      // soft grass disc as a projected polygon
      ctx.beginPath();
      for (i = 0; i <= n; i++) { var a = i / n * TAU, q = proj(Math.cos(a) * R, -0.02, Math.sin(a) * R, tmp2); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); }
      var gg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, R * p.s * 1.1); gg.addColorStop(0, night ? '#245c3c' : '#7fc66a'); gg.addColorStop(0.7, night ? '#1b4a31' : '#5aae55'); gg.addColorStop(1, night ? '#123524' : '#47964a');
      ctx.fillStyle = gg; ctx.fill();
      // shadow of the crown, cast away from the sun
      var sh = proj(-SUN[0] * model.height * 0.35, 0, -SUN[2] * model.height * 0.35, tmp2), sr = (2.4 + 3.2 * shown * st.wide) * sh.s;
      ctx.save(); ctx.translate(sh.x, sh.y); ctx.scale(1, Math.max(0.2, sinP * 0.9 + 0.12)); var sg = ctx.createRadialGradient(0, 0, 0, 0, 0, sr); sg.addColorStop(0, 'rgba(0,0,0,' + (night ? 0.38 : 0.32) + ')'); sg.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(0, 0, sr, 0, TAU); ctx.fill(); ctx.restore();
    }
    function addScenery() {
      var gr = rng('grass' + seed), k;
      for (k = 0; k < 70; k++) { var a = gr() * TAU, d = 1.2 + gr() * 6.8, x = Math.cos(a) * d, z = Math.sin(a) * d, q = proj(x, 0, z, tmp); prim.push({ z: q.z, t: 3, x: q.x, y: q.y, s: q.s, h: 0.3 + gr() * 0.5, c: gr(), sway: gr() * 6 }); }
      for (k = 0; k < 12; k++) { var a2 = gr() * TAU, d2 = 2 + gr() * 6, q2 = proj(Math.cos(a2) * d2, 0.05, Math.sin(a2) * d2, tmp); prim.push({ z: q2.z, t: 4, x: q2.x, y: q2.y, s: q2.s, col: ['#fff', '#ffd966', '#ff9ab5', '#c9a3ff'][k % 4] }); }
      for (k = 0; k < 4; k++) { var a3 = gr() * TAU, d3 = 3 + gr() * 4, q3 = proj(Math.cos(a3) * d3, 0.05, Math.sin(a3) * d3, tmp); prim.push({ z: q3.z, t: 5, x: q3.x, y: q3.y, s: q3.s, r: 0.25 + gr() * 0.3 }); }
    }
    function branchPrims() {
      var g = Math.pow(shown, 0.72), sc = 0.62 + 0.38 * ease(shown), dk = mix(st.bark, 'k', dead ? 0.1 : 0.25), lt = mix(st.bark, 'w', dead ? 0.3 : 0.3);
      if (dead) { dk = '#5d5750'; lt = '#8b857a'; }
      model.branches.forEach(function (b) {
        var gl = clamp((g - (b.start || 0) - b.lvl * 0.13) / 0.42, 0, 1); if (b.root) gl = clamp(g * 3, 0, 1); if (gl <= 0.005) return;
        var n = b.pts.length - 1, upto = gl * n, i;
        for (i = 0; i < n; i++) {
          var f = clamp(upto - i, 0, 1); if (f <= 0) break;
          var A = b.pts[i], B = b.pts[i + 1], pa = proj(A[0] * sc, A[1] * sc, A[2] * sc, tmp), xa = pa.x, ya = pa.y, za = pa.z, sa = pa.s;
          var pb = proj((A[0] + (B[0] - A[0]) * f) * sc, (A[1] + (B[1] - A[1]) * f) * sc, (A[2] + (B[2] - A[2]) * f) * sc, tmp2);
          var u = i / n, rad = lerp(b.r0, b.r1, u) * (0.45 + 0.55 * gl) * sc * (b.palm ? 1 : 1), rb = lerp(b.r0, b.r1, (i + f) / n) * (0.45 + 0.55 * gl) * sc;
          prim.push({ z: (za + pb.z) / 2, t: 0, x1: xa, y1: ya, x2: pb.x, y2: pb.y, w: Math.max(1, (rad + rb) * sa), lvl: b.lvl, dk: dk, lt: lt, ring: b.palm && i % 1 === 0, bam: b.bamboo, node: b.bamboo && i % 1 === 0 });
        }
      });
    }
    function leafPrims() {
      var g = Math.pow(shown, 0.72), sc = 0.62 + 0.38 * ease(shown), keepRate = H.leaves, i, l, p, lf, sh, dry, col;
      for (i = 0; i < model.leaves.length; i++) {
        l = model.leaves[i]; if (l.keep > keepRate) continue; lf = clamp((g - l.start) / 0.4, 0, 1); if (lf <= 0.01) continue;
        p = proj(l.p[0] * sc, l.p[1] * sc, l.p[2] * sc, tmp);
        var n = [l.p[0], l.p[1] - model.height * 0.5, l.p[2]]; n = norm(n); sh = n[0] * SUN[0] + n[1] * SUN[1] + n[2] * SUN[2]; sh = sh < -0.25 ? 0 : sh < 0.15 ? 1 : sh < 0.55 ? 2 : 3;
        dry = l.dry < H.dry; col = dry ? H.colors[(l.c + 2) % H.colors.length] : H.colors[l.c % H.colors.length];
        if (dry && healthKey !== 'thriving') col = healthKey === 'struggling' ? '#9a6a2a' : '#c9a83e';
        prim.push({ z: p.z, t: 1, x: p.x, y: p.y, sz: l.s * p.s * 5.2 * lf * (st.form === 'conifer' ? 1.15 : 1) * (0.7 + 0.3 * sc), img: l.needle ? needleSprite(sh) : leafSprite(col, sh, l.kind), a: 1 });
      }
      model.blooms.forEach(function (b) {
        var bl = clamp((g - b.start) / 0.25, 0, 1); if (bl <= 0.01 || b.keep > (b.flower ? H.bloom : Math.max(H.bloom, 0.0001))) return;
        if (!b.flower && healthKey === 'struggling') return;
        var q = proj(b.p[0] * sc, b.p[1] * sc, b.p[2] * sc, tmp);
        prim.push({ z: q.z - 0.2, t: 1, x: q.x, y: q.y, sz: b.s * q.s * (b.flower ? 3.2 : 2.6) * bl, img: b.flower ? flowerSprite(st.flower) : fruitSprite(st.fruit), a: 1 });
      });
      model.fronds.forEach(function (f) {
        var fl = clamp((g - f.start) / 0.45, 0, 1); if (fl <= 0.01 || (dead && f.keep > 0.4) || f.keep > H.leaves + 0.12) return;
        var o0 = f.o, len = f.len * fl, pts = [], k, col = dead ? '#8c6a2a' : healthKey === 'struggling' ? '#a9893a' : healthKey === 'needs_care' ? '#9dae44' : '#2f9a55';
        for (k = 0; k <= 8; k++) { var u = k / 8, hz = len * u, px = o0[0] + Math.cos(f.a) * hz, pz = o0[2] + Math.sin(f.a) * hz, py = o0[1] + Math.sin(u * 2.4) * len * 0.36 * (1 - f.up * 0.5) - f.droop * len * u * u * 0.8; var q = proj(px * sc, py * sc, pz * sc, { x: 0, y: 0, z: 0, s: 1 }); pts.push(q); }
        prim.push({ z: pts[4].z, t: 2, pts: pts, col: col, s: pts[0].s });
      });
    }
    function particles(dt) {
      if (!still && healthKey !== 'dead' && shown > 0.45 && parts.length < (o.ambient ? 34 : 14) && rnd() < dt * (o.ambient ? 0.004 : 0.0016)) parts.push({ x: (rnd() - 0.5) * 6, y: model.height * (0.55 + rnd() * 0.4), z: (rnd() - 0.5) * 6, vx: 0.4 + rnd() * 0.5, vy: -0.8 - rnd() * 0.6, ph: rnd() * 6, c: rnd() < 0.7 ? H.colors[0] : '#d6a03a', fl: st.flower && rnd() < 0.5 ? st.flower : null });
      if (dead && !still && parts.length < 10 && rnd() < dt * 0.0006) parts.push({ x: (rnd() - 0.5) * 5, y: model.height * 0.7, z: (rnd() - 0.5) * 5, vx: 0.3, vy: -0.8, ph: rnd() * 6, c: '#9a6a2a' });
      for (var i = parts.length - 1; i >= 0; i--) { var p = parts[i]; p.x += p.vx * dt * 0.0016 + Math.sin(lastT * 0.002 + p.ph) * 0.004; p.y += p.vy * dt * 0.0016; p.z += Math.cos(lastT * 0.0015 + p.ph) * 0.004; if (p.y <= 0.03) { parts.splice(i, 1); continue; } var q = proj(p.x, p.y, p.z, tmp); prim.push({ z: q.z - 0.3, t: 6, x: q.x, y: q.y, s: q.s, c: p.fl || p.c, a: lastT * 0.004 + p.ph }); }
      if (o.ambient && !still) {
        for (var b = 0; b < 3; b++) { var bp = ((lastT * 0.000045 * (1 + b * 0.35) + b * 0.37) % 1.3) - 0.15; prim.push({ z: 1e9, t: 9, x: bp * W, y: Hh * (0.14 + b * 0.07) + Math.sin(lastT * 0.002 + b * 2) * 7, a: Math.sin(lastT * 0.016 + b), s: 5 + b * 1.5 }); }
        if (isDark()) for (var ff = 0; ff < 16; ff++) { var fa = lastT * 0.00035 * (ff % 2 ? 1 : -1) + ff * 1.9, fq = proj(Math.cos(fa) * (3 + (ff % 5)), 0.7 + (ff % 6) * 0.9 + Math.sin(lastT * 0.0013 + ff) * 0.4, Math.sin(fa * 1.3) * (3 + (ff % 4)), tmp); prim.push({ z: fq.z - 0.4, t: 8, x: fq.x, y: fq.y, s: fq.s, g: 0.5 + 0.5 * Math.sin(lastT * 0.004 + ff * 1.7) }); }
      }
      if (!still && !dead && (healthKey === 'thriving' || healthKey === 'healthy') && shown > 0.5) {
        for (var k = 0; k < 2; k++) { var th = lastT * 0.0007 * (k ? -1 : 1) + k * 3, rr = 3.4 + k, bx = Math.cos(th) * rr, bz = Math.sin(th) * rr, by = model.height * (0.35 + 0.2 * Math.sin(lastT * 0.0021 + k * 2)), q2 = proj(bx, by, bz, tmp); prim.push({ z: q2.z - 0.5, t: 7, x: q2.x, y: q2.y, s: q2.s, w: Math.abs(Math.sin(lastT * 0.02 + k)), col: k ? '#ff9a3c' : '#6aa8ff' }); }
      }
    }
    function drawPrim(p) {
      switch (p.t) {
        case 0:
          ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(p.x1, p.y1); ctx.lineTo(p.x2, p.y2);
          if (p.bam) { ctx.strokeStyle = '#7fae43'; ctx.lineWidth = p.w; ctx.stroke(); ctx.strokeStyle = '#a8cf5f'; ctx.lineWidth = p.w * 0.45; ctx.stroke(); ctx.fillStyle = '#5c8a2f'; ctx.fillRect(p.x2 - p.w * 0.7, p.y2 - 1, p.w * 1.4, 2); break; }
          ctx.strokeStyle = p.dk; ctx.lineWidth = p.w; ctx.stroke();
          if (p.w > 3) { ctx.beginPath(); ctx.moveTo(p.x1 - p.w * 0.16, p.y1); ctx.lineTo(p.x2 - p.w * 0.16, p.y2); ctx.strokeStyle = p.lt; ctx.lineWidth = p.w * 0.38; ctx.stroke(); }
          if (p.ring) { ctx.strokeStyle = 'rgba(0,0,0,.28)'; ctx.lineWidth = Math.max(1, p.w * 0.1); ctx.beginPath(); ctx.moveTo(p.x1 - p.w / 2, p.y1); ctx.lineTo(p.x1 + p.w / 2, p.y1 - p.w * 0.12); ctx.stroke(); }
          break;
        case 1: ctx.drawImage(p.img, p.x - p.sz / 2, p.y - p.sz / 2, p.sz, p.sz); break;
        case 2: {
          var pts = p.pts, i, q;
          ctx.lineCap = 'round'; ctx.strokeStyle = p.col; ctx.lineWidth = Math.max(2, p.s * 0.15); ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke();
          ctx.lineWidth = Math.max(1.2, p.s * 0.07); ctx.beginPath();
          for (i = 2; i < pts.length; i++) { q = pts[i]; var pr = pts[i - 1], dx = q.x - pr.x, dy = q.y - pr.y, nl = Math.sqrt(dx * dx + dy * dy) || 1, nx = -dy / nl, ny = dx / nl, ll = p.s * 0.38 * (1 - (i - 2) / 9); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x + nx * ll + dx * 0.25, q.y + ny * ll + dy * 0.25 + ll * 0.35); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x - nx * ll + dx * 0.25, q.y - ny * ll + dy * 0.25 + ll * 0.35); }
          ctx.stroke(); break; }
        case 3: { var sw = Math.sin(lastT * 0.002 + p.sway) * (wind ? 2.5 : 0), hh = p.h * p.s * 0.8; ctx.strokeStyle = p.c > 0.5 ? (isDark() ? '#2c7a49' : '#4fa24c') : (isDark() ? '#1f5f3a' : '#3d8f46'); ctx.lineWidth = Math.max(1, p.s * 0.06); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.quadraticCurveTo(p.x + sw * 0.3, p.y - hh * 0.6, p.x + sw, p.y - hh); ctx.moveTo(p.x + 2, p.y); ctx.quadraticCurveTo(p.x + 2 + sw * 0.2, p.y - hh * 0.5, p.x + 4 + sw, p.y - hh * 0.8); ctx.stroke(); break; }
        case 4: { var fs = Math.max(1.5, p.s * 0.1); ctx.strokeStyle = '#3d8f46'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - fs * 2); ctx.stroke(); ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y - fs * 2.2, fs * 1.1, 0, TAU); ctx.fill(); break; }
        case 5: { var rw = p.r * p.s * 2; ctx.fillStyle = isDark() ? '#5c6a66' : '#9aa39c'; ctx.beginPath(); ctx.ellipse(p.x, p.y, rw, rw * 0.6, 0, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.ellipse(p.x - rw * 0.2, p.y - rw * 0.2, rw * 0.5, rw * 0.28, 0, 0, TAU); ctx.fill(); break; }
        case 6: ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.scale(1, 0.55 + 0.45 * Math.abs(Math.sin(p.a * 1.7))); ctx.fillStyle = p.c; ctx.beginPath(); ctx.ellipse(0, 0, Math.max(2, p.s * 0.2), Math.max(1.2, p.s * 0.1), 0, 0, TAU); ctx.fill(); ctx.restore(); break;
        case 8: { var gr = Math.max(4, p.s * 0.45) * (0.6 + p.g * 0.6), gg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, gr); gg.addColorStop(0, 'rgba(255,240,150,' + (0.9 * p.g) + ')'); gg.addColorStop(1, 'rgba(255,240,150,0)'); ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(p.x, p.y, gr, 0, TAU); ctx.fill(); break; }
        case 9: { ctx.strokeStyle = isDark() ? 'rgba(230,240,235,.85)' : 'rgba(40,60,60,.7)'; ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(p.x - p.s, p.y - p.a * p.s * 0.8); ctx.quadraticCurveTo(p.x - p.s * 0.4, p.y + 1, p.x, p.y); ctx.quadraticCurveTo(p.x + p.s * 0.4, p.y + 1, p.x + p.s, p.y - p.a * p.s * 0.8); ctx.stroke(); break; }
        case 7: { var ws = Math.max(3, p.s * 0.26) * (0.25 + p.w); ctx.fillStyle = p.col; ctx.beginPath(); ctx.ellipse(p.x - ws * 0.7, p.y, ws, ws * 1.1, -0.5, 0, TAU); ctx.ellipse(p.x + ws * 0.7, p.y, ws, ws * 1.1, 0.5, 0, TAU); ctx.fill(); break; }
      }
    }
    function frame(now) {
      if (dead3) return;
      if (!el.isConnected) { destroy(); return; }
      var dt = lastT ? Math.min(60, now - lastT) : 16; lastT = now;
      // growth easing
      if (birth) { var bt = clamp((now - t0) / 3200, 0, 1); shown = lerp(0.02, target, ease(bt)); if (bt >= 1) { birth = false; sync(); } sync(); }
      else if (playing) { shown = Math.min(1, shown + dt * 0.00011); if (shown >= 1) { playing = false; if (playBtn) playBtn.textContent = '▶ Watch it grow'; } sync(); }
      else if (Math.abs(shown - target) > 0.0005) { shown += (target - shown) * Math.min(1, dt * 0.01); sync(); }
      if (!drag) { yaw += vyaw * dt * 0.06; vyaw *= 0.94; if (autorotate && Math.abs(vyaw) < 0.003) yaw += dt * 0.00022; }
      wind = still ? 0 : 0.55 + 0.35 * Math.sin(now * 0.0006);
      setCam(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, Hh);
      if (o.sky !== false) sky(); ground();
      prim.length = 0; addScenery(); branchPrims(); leafPrims(); particles(dt);
      prim.sort(function (a, b) { return b.z - a.z; });
      for (var i = 0; i < prim.length; i++) drawPrim(prim[i]);
      if (still && !drag && !birth && !playing) { raf = 0; return; }
      raf = requestAnimationFrame(frame);
    }
    var raf = 0;
    function kick() { if (!raf && !dead3) raf = requestAnimationFrame(frame); }

    /* ----- interaction ----- */
    var pts = {}, pinch = 0;
    cv.addEventListener('pointerdown', function (e) { cv.setPointerCapture(e.pointerId); pts[e.pointerId] = [e.clientX, e.clientY]; drag = { x: e.clientX, y: e.clientY, yaw: yaw, pitch: pitch }; vyaw = 0; hint.classList.add('gone'); cv.classList.add('grab'); var k = Object.keys(pts); if (k.length === 2) pinch = Math.hypot(pts[k[0]][0] - pts[k[1]][0], pts[k[0]][1] - pts[k[1]][1]); kick(); });
    cv.addEventListener('pointermove', function (e) {
      if (!pts[e.pointerId]) return; pts[e.pointerId] = [e.clientX, e.clientY]; var k = Object.keys(pts);
      if (k.length === 2) { var d = Math.hypot(pts[k[0]][0] - pts[k[1]][0], pts[k[0]][1] - pts[k[1]][1]); if (pinch) dist = clamp(dist * d / pinch, 0.6, 1.1); pinch = d; kick(); return; }
      if (!drag) return; var dx = e.clientX - drag.x, dy = e.clientY - drag.y; var ny = drag.yaw + dx * 0.009; vyaw = (ny - yaw) * 0.6; yaw = ny; kick(); /* sideways only: the view angle above the ground is fixed */
    });
    function up(e) { delete pts[e.pointerId]; if (!Object.keys(pts).length) { drag = null; pinch = 0; cv.classList.remove('grab'); } }
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', function (e) { e.preventDefault(); dist = clamp(dist * (e.deltaY > 0 ? 0.92 : 1.09), 0.6, 1.1); hint.classList.add('gone'); kick(); }, { passive: false });
    cv.addEventListener('dblclick', resetView);
    cv.addEventListener('keydown', function (e) {
      var h = true; if (e.key === 'ArrowLeft') yaw -= 0.18; else if (e.key === 'ArrowRight') yaw += 0.18; else if (e.key === '+' || e.key === '=') dist = clamp(dist * 1.1, 0.6, 1.1); else if (e.key === '-') dist = clamp(dist / 1.1, 0.6, 1.1); else if (e.key === '0') resetView(); else h = false;
      if (h) { e.preventDefault(); kick(); }
    });
    function resetView() { yaw = 0.5; pitch = 0.2; dist = 1; vyaw = 0; kick(); }
    var playBtn = ui && ui.querySelector('[data-a=play]');
    if (ui) {
      ui.addEventListener('click', function (e) {
        var b = e.target.closest('[data-a]'); if (!b) return;
        if (b.dataset.a === 'play') { if (playing) { playing = false; b.textContent = '▶ Watch it grow'; } else { birth = false; shown = 0.03; target = 1; playing = true; /* always replay from a tiny sapling to the full tree */ b.textContent = '❚❚ Pause'; } kick(); }
        else if (b.dataset.a === 'spin') { autorotate = !autorotate; b.setAttribute('aria-pressed', autorotate); kick(); }
        else resetView();
      });
      slider.addEventListener('input', function () { playing = false; birth = false; if (playBtn) playBtn.textContent = '▶ Watch it grow'; shown = target = slider.value / 100; sync(); kick(); });
    }
    var ro = window.ResizeObserver ? new ResizeObserver(function () { resize(); kick(); }) : null; if (ro) ro.observe(el);
    var io = window.IntersectionObserver ? new IntersectionObserver(function (ents) { if (ents[0].isIntersecting) kick(); else if (raf) { cancelAnimationFrame(raf); raf = 0; } }) : null; if (io) io.observe(el);
    var theme = new MutationObserver(function () { kick(); }); theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    function destroy() { dead3 = true; if (raf) cancelAnimationFrame(raf); raf = 0; if (ro) ro.disconnect(); if (io) io.disconnect(); theme.disconnect(); }
    resize(); sync(); kick();
    return {
      destroy: destroy, resetView: resetView, canvas: cv,
      setGrowth: function (g, now) { target = clamp(g, 0.02, 1); if (now) shown = target; birth = false; sync(); kick(); },
      play: function () { if (playBtn) playBtn.click(); else { shown = 0.02; target = 1; playing = true; kick(); } },
      growth: function () { return shown; }
    };
  }

  MT.tree3d = { mount: mount, styleFor: styleFor };
})();
