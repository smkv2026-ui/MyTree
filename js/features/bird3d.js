/**
 * MyTree — interactive 3D bird (software 3D on a canvas, no libraries). A bird perches on a swaying branch: it breathes, turns its head, bobs its tail and
 * now and then flaps its wings. Drag sideways to turn around it, wheel / pinch to zoom (stops when the whole bird is just in view), arrow keys and + / − also work.
 *
 *   var v = MT.bird3d.mount(el, { species: 'House Sparrow' });  v.setSpecies('Rose-ringed Parakeet');  v.destroy();
 */
(function () {
  'use strict';
  var MT = window.MT, TAU = Math.PI * 2;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hex(c) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }
  function mix(c, t, to) { var a = hex(c), b = to === 'w' ? [255, 255, 255] : to === 'k' ? [0, 0, 0] : hex(to); return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * t) + ',' + Math.round(a[1] + (b[1] - a[1]) * t) + ',' + Math.round(a[2] + (b[2] - a[2]) * t) + ')'; }
  function reduced() { return MT.prefersReducedMotion && MT.prefersReducedMotion(); }
  function isDark() { var r = document.documentElement, t = r.getAttribute('data-theme'); return t === 'dark' || (!t && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches); }

  /* body / belly / head / wing / tail / beak, size, tail length, crest */
  var SPECIES = {
    'House Sparrow': { body: '#8a6a4a', belly: '#d9cbb6', head: '#7d7d7d', wing: '#6b4a2e', tail: '#5d4630', beak: '#4a4a4a', size: 0.85, tail_: 0.9, fact: 'Lives close to people, nests in roof gaps and nest boxes. Males have a grey cap and black bib.' },
    'Rose-ringed Parakeet': { body: '#4fbf4a', belly: '#8fdc6a', head: '#4fbf4a', wing: '#2f9a3a', tail: '#3aa5a0', beak: '#e0343b', size: 1.15, tail_: 1.9, ring: '#e86a8a', fact: 'Noisy flocks nest in tree holes — a big nest box suits them. Loves guava and chilli seeds.' },
    'Red-vented Bulbul': { body: '#6b5a4d', belly: '#d9cdbf', head: '#2b2522', wing: '#5a4a3f', tail: '#3b312b', beak: '#2b2b2b', size: 1, tail_: 1.2, crest: true, vent: '#d43a2a', fact: 'Sociable fruit-and-insect eater. Look for the red patch under the tail and the pointy crest.' },
    'Purple Sunbird': { body: '#3a2d6b', belly: '#4c3a8a', head: '#4b2f86', wing: '#2c2158', tail: '#241a4a', beak: '#2a2a2a', size: 0.7, tail_: 0.9, curved: true, fact: 'A tiny nectar drinker. Plant hibiscus and bottle-brush to bring it close.' },
    'Asian Koel': { body: '#1f1f2b', belly: '#2a2a3a', head: '#1b1b26', wing: '#161620', tail: '#12121b', beak: '#c6d27a', size: 1.25, tail_: 1.8, eye: '#d4222a', fact: 'Its loud “ko-el” call heralds summer. Eats figs and berries from fruiting trees.' },
    'Common Myna': { body: '#6a4a2c', belly: '#8a6a4a', head: '#1d1d1d', wing: '#5a3c22', tail: '#2a1e14', beak: '#f2b21c', size: 1, tail_: 1, patch: '#f2b21c', fact: 'Bold, chatty and social. Bright yellow beak and eye patch; drinks at ground-level water bowls.' },
    'Oriental Magpie-Robin': { body: '#18181f', belly: '#f4f4f4', head: '#18181f', wing: '#22222c', tail: '#101016', beak: '#2a2a2a', size: 0.95, tail_: 1.4, perk: true, fact: 'Sings at dawn. Holds its long tail cocked up; likes a feeder with soft fruit.' }
  };

  function mount(el, o) {
    o = o || {};
    var name = SPECIES[o.species] ? o.species : 'House Sparrow', sp = SPECIES[name], still = reduced(), autorotate = o.autorotate !== false && !still;
    var yaw = -0.7, pitch = 0.12, dist = 1, vyaw = 0, drag = null, W = 0, Hh = 0, dpr = 1, raf = 0, dead = false, lastT = 0, t0 = performance.now(), flapAt = t0 + 1500, flapUntil = 0;
    el.classList.add('t3d'); el.innerHTML = '';
    var cv = document.createElement('canvas'); cv.className = 't3d-canvas'; cv.tabIndex = 0; cv.setAttribute('role', 'img'); el.appendChild(cv);
    var hint = document.createElement('div'); hint.className = 't3d-hint'; hint.textContent = '↔ Drag sideways to turn · scroll to zoom out/in'; el.appendChild(hint);
    var ctx = cv.getContext('2d');
    function label() { cv.setAttribute('aria-label', 'Interactive 3D model of a ' + name + ' perched on a branch. Drag sideways or use the left and right arrow keys to turn it, plus and minus to zoom.'); }
    label();
    function resize() { var r = el.getBoundingClientRect(); dpr = Math.min(2, window.devicePixelRatio || 1); W = Math.max(120, Math.round(r.width)); Hh = Math.max(140, Math.round(r.height)); cv.width = W * dpr; cv.height = Hh * dpr; cv.style.width = W + 'px'; cv.style.height = Hh + 'px'; }

    var cy, sy, cp, sp_, F, CX, CY, DZ;
    function setCam() { cy = Math.cos(yaw); sy = Math.sin(yaw); cp = Math.cos(pitch); sp_ = Math.sin(pitch); F = Math.min(W, Hh) * 1.5; CX = W / 2; CY = Hh * 0.6; DZ = 7.4 / dist; }
    function P(x, y, z, out) { var rx = x * cy + z * sy, rz = -x * sy + z * cy, ry = y - 0.85, py = ry * cp - rz * sp_, pz = ry * sp_ + rz * cp + DZ, s = F / pz; out.x = CX + rx * s; out.y = CY - py * s; out.z = pz; out.s = s; return out; }

    var prim = [];
    function ball(x, y, z, r, col, hl) { var q = P(x, y, z, { x: 0, y: 0, z: 0, s: 1 }); prim.push({ z: q.z, t: 0, x: q.x, y: q.y, r: r * q.s, c: col, hl: hl == null ? 0.35 : hl }); }
    function stick(a, b, w, col, z) { var A = P(a[0], a[1], a[2], { x: 0, y: 0, z: 0, s: 1 }), B = P(b[0], b[1], b[2], { x: 0, y: 0, z: 0, s: 1 }); prim.push({ z: z != null ? z : (A.z + B.z) / 2, t: 1, x1: A.x, y1: A.y, x2: B.x, y2: B.y, w: Math.max(1.2, w * (A.s + B.s) / 2), c: col }); }

    function scene(now) {
      var t = now - t0, dark = isDark(), k = sp.size, breathe = 1 + 0.015 * Math.sin(t * 0.004), sway = still ? 0 : Math.sin(t * 0.0011) * 0.05;
      var flap = 0; if (!still) { if (now > flapAt && now > flapUntil) { flapUntil = now + 1100; flapAt = now + 5500 + Math.random() * 3000; } if (now < flapUntil) flap = Math.sin((now - (flapUntil - 1100)) * 0.03) * 0.9 * Math.sin(((flapUntil - now) / 1100) * Math.PI); }
      var headTurn = still ? 0 : Math.sin(t * 0.0009) * 0.45 + (Math.sin(t * 0.0023) > 0.93 ? 0.5 : 0), tailBob = still ? 0 : Math.sin(t * 0.003) * 0.07 + (sp.perk ? 0.55 : 0), hop = still ? 0 : Math.max(0, Math.sin(t * 0.0007)) > 0.985 ? 0.12 : 0;
      prim.length = 0;
      /* branch + leaves (sways a little) */
      var by = -0.5 + sway * 0.2; stick([-3.2, by - 0.1, sway], [3.4, by + 0.1, -sway], 0.22, dark ? '#4a3524' : '#7a5636', 0);
      stick([1.6, by + 0.05, 0], [2.6, by + 0.65, 0.5], 0.1, dark ? '#4a3524' : '#7a5636', 1);
      for (var i = 0; i < 16; i++) { var a = i * 2.399, lx = -3 + (i % 8) * 0.85, lz = Math.cos(a) * 0.7, ly = by + 0.15 + Math.sin(a) * 0.35 + Math.sin(t * 0.002 + i) * (still ? 0 : 0.04); var q = P(lx, ly, lz, { x: 0, y: 0, z: 0, s: 1 }); prim.push({ z: q.z, t: 2, x: q.x, y: q.y, r: 0.34 * q.s, a: a + sway * 3, c: dark ? '#2a6a45' : (i % 3 ? '#3fae5b' : '#5cc873') }); }
      var feetY = by + 0.16 + hop, bodyC = sp.body, belly = sp.belly, n = 10, j;
      /* legs and toes gripping the branch */
      [1, -1].forEach(function (sd) { stick([0.05 * k, feetY + 0.62 * k, sd * 0.17 * k], [0.08 * k, feetY, sd * 0.19 * k], 0.07 * k, '#8a5a3a'); stick([0.08 * k, feetY, sd * 0.19 * k], [0.34 * k, feetY, sd * 0.21 * k], 0.055 * k, '#8a5a3a'); stick([0.08 * k, feetY, sd * 0.19 * k], [-0.12 * k, feetY, sd * 0.2 * k], 0.045 * k, '#8a5a3a'); });
      /* body: a tilted chain of shaded spheres (tail-base low at the back, chest high at the front) with a lighter belly */
      for (j = 0; j < n; j++) {
        var u = j / (n - 1), x = (-0.5 + 1.0 * u) * k, y = feetY + (0.72 + 0.62 * u) * k, rad = (0.2 + 0.3 * Math.sin(Math.PI * (0.1 + 0.8 * u))) * k * breathe;
        ball(x, y, 0, rad, bodyC, 0.4); if (u > 0.2) ball(x + 0.09 * k, y - rad * 0.38, 0, rad * 0.78, belly, 0.3);
      }
      if (sp.vent) ball(-0.44 * k, feetY + 0.6 * k, 0, 0.13 * k, sp.vent, 0.3);
      /* head */
      var hx = 0.68 * k, hy = feetY + 1.78 * k, hz = Math.sin(headTurn) * 0.1 * k, hr = 0.3 * k;
      ball(hx - 0.1 * k, hy - 0.22 * k, 0, 0.24 * k, sp.head, 0.4);
      ball(hx, hy, hz, hr, sp.head, 0.45);
      if (sp.patch) { ball(hx + 0.1 * k, hy - 0.02 * k, hz + 0.24 * k, 0.09 * k, sp.patch, 0.2); ball(hx + 0.1 * k, hy - 0.02 * k, hz - 0.24 * k, 0.09 * k, sp.patch, 0.2); }
      if (sp.ring) ball(hx, hy - 0.22 * k, hz, 0.17 * k, sp.ring, 0.2);
      if (sp.crest) stick([hx - 0.05 * k, hy + 0.2 * k, hz], [hx - 0.3 * k, hy + 0.5 * k, hz], 0.12 * k, sp.head);
      var bl = (sp.curved ? 0.62 : 0.36) * k, bx = hx + hr * 0.8 * Math.cos(headTurn), bz = hz + hr * 0.8 * Math.sin(headTurn);
      stick([bx - 0.04 * k, hy - 0.03 * k, bz], [bx + bl * Math.cos(headTurn), hy - 0.1 * k - (sp.curved ? 0.14 * k : 0), bz + bl * Math.sin(headTurn)], 0.15 * k, sp.beak, null);
      var ex = hx + 0.17 * k * Math.cos(headTurn);
      [1, -1].forEach(function (sd) { var ez = hz + sd * 0.25 * k * Math.cos(headTurn) + 0.06 * k * Math.sin(headTurn); ball(ex, hy + 0.06 * k, ez, 0.07 * k, sp.eye || '#101010', 0.5); ball(ex + 0.025 * k, hy + 0.09 * k, ez + sd * 0.01, 0.022 * k, '#ffffff', 0); });
      /* tail: a fan of feathers from the low back, pointing backwards and down */
      var tl = sp.tail_ * k;
      for (j = -2; j <= 2; j++) stick([-0.5 * k, feetY + 0.74 * k, 0], [-0.5 * k - (0.5 + 0.55 * tl) * Math.cos(0.5 + tailBob), feetY + 0.74 * k - (0.5 + 0.55 * tl) * Math.sin(0.5 + tailBob) * 0.9, j * 0.14 * k], 0.17 * k, j % 2 ? sp.tail : mix(sp.tail, 0.2, 'w'));
      /* wings: folded along the sides; a flap lifts and spreads them outwards */
      [1, -1].forEach(function (sd) {
        var lift = 0.12 + Math.max(0, flap) * 1.25 + Math.min(0, flap) * 0.15, cl = Math.cos(lift), sl = Math.sin(lift);
        for (var f = 0; f < 7; f++) {
          var ang = 0.32 + f * 0.07, L = (0.95 - f * 0.05) * k, dx = -Math.cos(ang) * L, dy = -Math.sin(ang) * L * (0.55 + 0.45 * (1 - lift * 0.5));
          var S = [0.12 * k, feetY + 1.28 * k, sd * 0.3 * k];
          stick(S, [S[0] + dx, S[1] + dy * cl + Math.abs(dy) * 0.4 * (flap > 0 ? flap : 0), S[2] + sd * (Math.abs(dy) * sl + 0.03 * f * k)], (0.2 - f * 0.012) * k, f % 2 ? sp.wing : mix(sp.wing, 0.16, 'w'));
        }
      });
    }

    function draw() {
      var dark = isDark(), g = ctx.createLinearGradient(0, 0, 0, Hh);
      if (dark) { g.addColorStop(0, '#0b1c33'); g.addColorStop(1, '#16402f'); } else { g.addColorStop(0, '#a6d8f2'); g.addColorStop(0.7, '#dcf0e4'); g.addColorStop(1, '#e9f3cf'); }
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, Hh);
      var sg = ctx.createRadialGradient(W * 0.18, Hh * 0.14, 0, W * 0.18, Hh * 0.14, Math.min(W, Hh) * 0.6); sg.addColorStop(0, dark ? 'rgba(220,230,255,.35)' : 'rgba(255,244,180,.9)'); sg.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = sg; ctx.fillRect(0, 0, W, Hh);
      prim.sort(function (a, b) { return b.z - a.z; });
      for (var i = 0; i < prim.length; i++) {
        var p = prim[i];
        if (p.t === 0) { var gr = ctx.createRadialGradient(p.x - p.r * 0.35, p.y - p.r * 0.4, p.r * 0.1, p.x, p.y, p.r); gr.addColorStop(0, mix(p.c.charAt(0) === '#' ? p.c : '#888888', p.hl, 'w')); gr.addColorStop(1, mix(p.c.charAt(0) === '#' ? p.c : '#888888', 0.28, 'k')); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill(); }
        else if (p.t === 1) { ctx.lineCap = 'round'; ctx.strokeStyle = p.c; ctx.lineWidth = p.w; ctx.beginPath(); ctx.moveTo(p.x1, p.y1); ctx.lineTo(p.x2, p.y2); ctx.stroke(); }
        else { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * 0.5, 0, 0, TAU); ctx.fill(); ctx.restore(); }
      }
    }
    function frame(now) {
      if (dead) return; if (!el.isConnected) { destroy(); return; }
      var dt = lastT ? Math.min(60, now - lastT) : 16; lastT = now;
      if (!drag) { yaw += vyaw * dt * 0.06; vyaw *= 0.94; if (autorotate && Math.abs(vyaw) < 0.003) yaw += dt * 0.00035; }
      setCam(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); scene(now); draw();
      if (still && !drag) { raf = 0; return; } raf = requestAnimationFrame(frame);
    }
    function kick() { if (!raf && !dead) raf = requestAnimationFrame(frame); }

    var pts = {}, pinch = 0;
    cv.style.touchAction = 'pan-y';
    cv.addEventListener('pointerdown', function (e) { cv.setPointerCapture(e.pointerId); pts[e.pointerId] = [e.clientX, e.clientY]; drag = { x: e.clientX, yaw: yaw }; vyaw = 0; hint.classList.add('gone'); cv.classList.add('grab'); var k = Object.keys(pts); if (k.length === 2) pinch = Math.hypot(pts[k[0]][0] - pts[k[1]][0], pts[k[0]][1] - pts[k[1]][1]); kick(); });
    cv.addEventListener('pointermove', function (e) {
      if (!pts[e.pointerId]) return; pts[e.pointerId] = [e.clientX, e.clientY]; var k = Object.keys(pts);
      if (k.length === 2) { var d = Math.hypot(pts[k[0]][0] - pts[k[1]][0], pts[k[0]][1] - pts[k[1]][1]); if (pinch) dist = clamp(dist * d / pinch, 0.6, 1.25); pinch = d; kick(); return; }
      if (!drag) return; var ny = drag.yaw + (e.clientX - drag.x) * 0.009; vyaw = (ny - yaw) * 0.6; yaw = ny; kick();
    });
    function up(e) { delete pts[e.pointerId]; if (!Object.keys(pts).length) { drag = null; pinch = 0; cv.classList.remove('grab'); } }
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', function (e) { e.preventDefault(); dist = clamp(dist * (e.deltaY > 0 ? 0.92 : 1.09), 0.6, 1.25); hint.classList.add('gone'); kick(); }, { passive: false });
    function reset() { yaw = -0.7; dist = 1; vyaw = 0; kick(); }
    cv.addEventListener('dblclick', reset);
    cv.addEventListener('keydown', function (e) { var h = true; if (e.key === 'ArrowLeft') yaw -= 0.2; else if (e.key === 'ArrowRight') yaw += 0.2; else if (e.key === '+' || e.key === '=') dist = clamp(dist * 1.1, 0.6, 1.25); else if (e.key === '-') dist = clamp(dist / 1.1, 0.6, 1.25); else if (e.key === '0') reset(); else h = false; if (h) { e.preventDefault(); kick(); } });
    var ro = window.ResizeObserver ? new ResizeObserver(function () { resize(); kick(); }) : null; if (ro) ro.observe(el);
    var io = window.IntersectionObserver ? new IntersectionObserver(function (en) { if (en[0].isIntersecting) kick(); else if (raf) { cancelAnimationFrame(raf); raf = 0; } }) : null; if (io) io.observe(el);
    function destroy() { dead = true; if (raf) cancelAnimationFrame(raf); raf = 0; if (ro) ro.disconnect(); if (io) io.disconnect(); }
    resize(); kick();
    return { destroy: destroy, reset: reset, setSpecies: function (n) { if (SPECIES[n]) { name = n; sp = SPECIES[n]; flapAt = performance.now() + 400; label(); kick(); } }, fact: function (n) { return (SPECIES[n || name] || {}).fact; } };
  }
  MT.bird3d = { mount: mount, species: Object.keys(SPECIES), data: SPECIES };
})();
