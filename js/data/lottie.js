/** MyTree — tiny hand-written Lottie animations (no external assets). */
(function () {
  'use strict';
  var MT = window.MT;
  function ks(extra) { return Object.assign({ o: { a: 0, k: 100 }, r: { a: 0, k: 0 }, p: { a: 0, k: [100, 100, 0] }, a: { a: 0, k: [0, 0, 0] }, s: { a: 0, k: [100, 100, 100] } }, extra || {}); }
  function trim(start, end) {
    return { ty: 'tm', s: { a: 0, k: 0 }, e: { a: 1, k: [{ t: start, s: [0], i: { x: [0.3], y: [1] }, o: { x: [0.6], y: [0] } }, { t: end, s: [100] }] }, o: { a: 0, k: 0 }, m: 1 };
  }
  var tr = { ty: 'tr', p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } };
  var stroke = function (w) { return { ty: 'st', c: { a: 0, k: [0.137, 0.49, 0.286, 1] }, o: { a: 0, k: 100 }, w: { a: 0, k: w }, lc: 2, lj: 2 }; };
  /** Animated check-mark inside a circle (planting / import success). */
  MT.lottie = {
    success: {
      v: '5.7.0', fr: 30, ip: 0, op: 75, w: 200, h: 200, nm: 'success', ddd: 0, assets: [],
      layers: [
        { ddd: 0, ind: 1, ty: 4, nm: 'circle', sr: 1, ks: ks({ r: { a: 0, k: -90 } }), ao: 0, ip: 0, op: 75, st: 0, bm: 0,
          shapes: [{ ty: 'gr', it: [{ ty: 'el', d: 1, s: { a: 0, k: [150, 150] }, p: { a: 0, k: [0, 0] } }, stroke(10), trim(0, 36), tr] }] },
        { ddd: 0, ind: 2, ty: 4, nm: 'check', sr: 1, ks: ks(), ao: 0, ip: 0, op: 75, st: 0, bm: 0,
          shapes: [{ ty: 'gr', it: [{ ty: 'sh', ks: { a: 0, k: { i: [[0, 0], [0, 0], [0, 0]], o: [[0, 0], [0, 0], [0, 0]], v: [[-36, 2], [-10, 28], [38, -26]], c: false } } }, stroke(11), trim(30, 55), tr] }] }
      ]
    }
  };
  /** Play an animation into `el` if lottie-web loads; otherwise show a static check. */
  MT.ui.lottie = function (el, name, o) {
    o = o || {};
    el.innerHTML = '<svg viewBox="0 0 200 200" class="lottie-fallback" aria-hidden="true"><circle cx="100" cy="100" r="75" fill="none" stroke="#237d49" stroke-width="10"/><path d="M64 102l26 26 48-54" fill="none" stroke="#237d49" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    if (MT.prefersReducedMotion()) return;
    MT.loader.load('lottie').then(function () {
      if (!el.isConnected) return;
      el.innerHTML = '';
      window.lottie.loadAnimation({ container: el, renderer: 'svg', loop: !!o.loop, autoplay: true, animationData: MT.lottie[name] });
    }).catch(function () { /* static fallback stays */ });
  };
})();
