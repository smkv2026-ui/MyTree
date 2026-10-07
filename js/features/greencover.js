/**
 * MyTree — green cover before/after (#/green, #/green/:plotId). Honest by design: every number says how it was obtained.
 *
 *  Methods (providers) —  MT.greenCover.register({id, label, real, compute(plot, ctx) → Promise<Result>}):
 *   • ground   On-ground estimate  = Σ canopy(species, age) of live trees in the plot ÷ plot area      (needs the plot polygon)
 *              canopy(species, age) = canopy_max × min(1, (age/15)^1.5)   (js/data/species.js, an estimate)
 *   • photo    Photo-based estimate: Excess Green index ExG = 2g − r − b on chromatic coordinates with an adaptive (Otsu) threshold,
 *              computed in the browser from before/after photos; saved as readings.
 *   • satellite  Placeholder for a Sentinel Hub / Earth Engine provider that needs an API key (see README → "Adding a satellite provider").
 *   • simulated  DEMO MODE ONLY, always labelled "SIMULATED (demo)"; never used for the headline number.
 *  Satellite swipe: two dated imagery layers side by side (MT.imagery); GIBS is coarse (250 m – 1 km).
 */
(function () {
  'use strict';
  var MT = window.MT, h = MT.html, raw = MT.raw, ui = MT.ui, DAY = 86400000;
  var ALL = ['super_admin', 'foundation', 'school', 'institution', 'student', 'individual'];

  /* ---------- provider registry ---------- */
  var G = (MT.greenCover = {
    providers: [],
    register: function (p) { G.providers = G.providers.filter(function (x) { return x.id !== p.id; }).concat([p]); },
    /** Excess-Green vegetation fraction of an image/canvas source. @returns {{pct:number, overlay:HTMLCanvasElement, threshold:number}} */
    exg: function (src) {
      var w = src.naturalWidth || src.width, hh = src.naturalHeight || src.height, s = Math.min(1, 640 / Math.max(w, hh)), cw = Math.max(1, Math.round(w * s)), ch = Math.max(1, Math.round(hh * s));
      var c = document.createElement('canvas'); c.width = cw; c.height = ch; var x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(src, 0, 0, cw, ch);
      var img = x.getImageData(0, 0, cw, ch), d = img.data, n = cw * ch, ex = new Float32Array(n), hist = new Uint32Array(256), valid = 0, i, p;
      for (i = 0, p = 0; i < n; i++, p += 4) {
        var r = d[p], g = d[p + 1], b = d[p + 2], t = r + g + b;
        if (t < 45) { ex[i] = -2; continue; } // too dark to judge
        var v = 2 * g / t - r / t - b / t; ex[i] = v; hist[Math.max(0, Math.min(255, Math.floor((v + 1) / 2.5 * 256)))]++; valid++;
      }
      // Otsu threshold on the ExG histogram (adaptive to lighting)
      var sum = 0, k; for (k = 0; k < 256; k++) sum += k * hist[k]; var sB = 0, wB = 0, best = 0, thrBin = 0;
      for (k = 0; k < 256; k++) { wB += hist[k]; if (!wB) continue; var wF = valid - wB; if (!wF) break; sB += k * hist[k]; var mB = sB / wB, mF = (sum - sB) / wF, between = wB * wF * (mB - mF) * (mB - mF); if (between > best) { best = between; thrBin = k; } }
      var thr = ((thrBin + 1) / 256) * 2.5 - 1; // upper edge of the last 'not vegetation' bin
      thr = Math.max(thr, 0.04); // absolute floor: genuine vegetation has ExG well above zero
      // Guard: when the two classes are barely different (no real vegetation signal) fall back to a fixed, conservative cut.
      var lowSum = 0, lowN = 0, hiSum = 0, hiN = 0; for (k = 0; k < 256; k++) { if (k <= thrBin) { lowSum += k * hist[k]; lowN += hist[k]; } else { hiSum += k * hist[k]; hiN += hist[k]; } }
      var sep = lowN && hiN ? ((hiSum / hiN) - (lowSum / lowN)) / 256 * 2.5 : 0; if (sep < 0.08) thr = Math.max(thr, 0.12);
      var out = document.createElement('canvas'); out.width = cw; out.height = ch; var ox = out.getContext('2d'); ox.drawImage(c, 0, 0); var od = ox.getImageData(0, 0, cw, ch), q = od.data, veg = 0;
      for (i = 0, p = 0; i < n; i++, p += 4) { if (ex[i] > thr && ex[i] > -2) { veg++; q[p] = 80; q[p + 1] = 235; q[p + 2] = 80; } else { q[p] = q[p] * 0.55 + 40; q[p + 1] = q[p + 1] * 0.55 + 40; q[p + 2] = q[p + 2] * 0.55 + 40; } }
      ox.putImageData(od, 0, 0); return { pct: valid ? Math.round(veg / valid * 1000) / 10 : 0, overlay: out, threshold: Math.round(thr * 1000) / 1000 };
    },
    summary: function (plot, ctx) {
      return Promise.all(G.providers.filter(function (p) { return !p.demoOnly || MT.mode === 'demo'; }).map(function (p) { return Promise.resolve().then(function () { return p.compute(plot, ctx); }).then(function (r) { return Object.assign({ id: p.id, label: p.label, real: p.real !== false, simulated: !!p.simulated }, r); }, function (e) { return { id: p.id, label: p.label, real: p.real !== false, simulated: !!p.simulated, unavailable: MT.friendlyError(e) }; }); }));
    }
  });
  function delta(r) { return r.series && r.series.length > 1 ? Math.round((r.series[r.series.length - 1].pct - r.series[0].pct) * 10) / 10 : null; }

  G.register({ id: 'ground', label: 'On-ground estimate (trees × canopy ÷ area)', real: true, compute: function (plot, ctx) {
    if (!plot.areaM2) throw MT.userError('Draw or enter the plot area to enable this estimate.');
    var from = new Date(plot.baselineOn + 'T00:00:00').getTime(), now = Date.now(), pts = [], steps = 8;
    var trees = ctx.trees.filter(function (t) { return t.status !== 'dead'; }); if (!trees.length) throw MT.userError('No live trees recorded in this plot yet.');
    for (var i = 0; i <= steps; i++) { var at = from + (now - from) * i / steps, tot = 0; trees.forEach(function (t) { var pl = new Date(t.plantedOn + 'T00:00:00').getTime(); if (pl <= at) tot += MT.species.canopyAt(t.speciesId, (at - pl) / (365.25 * DAY)); }); pts.push({ date: MT.fmt.iso(new Date(at)), pct: Math.min(100, Math.round(tot / plot.areaM2 * 1000) / 10) }); }
    var base = +plot.baselineCoverPct || 0; return { series: pts.map(function (p) { return { date: p.date, pct: Math.min(100, p.pct + base) }; }), note: trees.length + ' live trees · plot area ' + MT.fmt.num(plot.areaM2) + ' m² · baseline cover ' + base + '%' };
  } });
  G.register({ id: 'photo', label: 'Photo-based estimate (Excess Green)', real: true, compute: function (plot, ctx) {
    var r = ctx.readings.filter(function (x) { return x.method === 'photo-exg'; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; }); if (r.length < 1) throw MT.userError('Analyse and save at least two photos to see a change.');
    return { series: r.map(function (x) { return { date: x.date, pct: x.pct }; }), note: r.length + ' saved photo readings' };
  } });
  G.register({ id: 'satellite', label: 'Satellite vegetation index (needs an API key)', real: true, compute: function () { throw MT.userError('Not connected. A Sentinel Hub / Earth Engine provider can be registered with MT.greenCover.register() once you have an API key (see README).'); } });
  G.register({ id: 'simulated', label: 'SIMULATED (demo) — illustrative only', real: false, simulated: true, demoOnly: true, compute: function (plot, ctx) {
    var r = ctx.readings.filter(function (x) { return x.method === 'simulated'; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; }); if (!r.length) throw MT.userError('No simulated readings.');
    return { series: r.map(function (x) { return { date: x.date, pct: x.pct }; }), note: 'Generated sample numbers for the demo — not measurements.' };
  } });


  function gcConfig(th, shown) {
    var cols = { ground: th.primary, photo: '#2f6fb4', simulated: th.muted, satellite: '#7c4dbd' };
    var datasets = shown.map(function (r) {
      return { label: (r.simulated ? 'SIMULATED (demo) · ' : '') + r.label.split(' (')[0], data: r.series.map(function (s) { return { x: new Date(s.date).getTime(), y: s.pct }; }), borderColor: cols[r.id] || th.primary, backgroundColor: cols[r.id] || th.primary, borderWidth: 2, borderDash: r.simulated ? [6, 5] : [], pointRadius: 4, tension: 0.25 };
    });
    return {
      type: 'line', data: { datasets: datasets },
      options: {
        responsive: true, maintainAspectRatio: false, animation: MT.prefersReducedMotion() ? false : { duration: 700 },
        plugins: { legend: { position: 'bottom', labels: { color: th.ink, usePointStyle: true, boxWidth: 8 } }, tooltip: { callbacks: { title: function (i) { return MT.fmt.date(i[0].parsed.x); }, label: function (i) { return ' ' + i.dataset.label + ': ' + i.parsed.y + '%'; } } } },
        scales: {
          x: { type: 'linear', ticks: { color: th.ink, maxTicksLimit: 6, callback: function (v) { return MT.fmt.date(v, { month: 'short', year: '2-digit' }); } }, grid: { display: false }, border: { color: th.grid } },
          y: { min: 0, title: { display: true, text: 'Green cover (%)', color: th.ink }, ticks: { color: th.ink }, grid: { color: th.grid }, border: { display: false } }
        }
      }
    };
  }

  /* ---------- list page ---------- */
  function listPage() {
    return h`<div class="page green-page" data-reveal><div class="page-head"><h2>Green cover</h2><p class="muted">How much greener has each planting site become? Compare satellite imagery over time, photos, and an on-ground estimate. Every number is labelled with the method behind it.</p></div><div class="org-grid" id="gc-list">${ui.skeleton(3, 'sk-card')}</div></div>`;
  }
  function listAfter(host) {
    var p = MT.auth.profile(), scope = p.role === 'super_admin' ? [] : (MT.auth.isOrgAdmin() ? [['ancestorOrgIds', 'array-contains', p.orgId]] : [['ownerId', '==', p.userId]]), el = MT.$('#gc-list', host);
    MT.db.list('plots', { where: scope, limit: 200 }).then(function (plots) {
      plots = plots.filter(function (x) { return x.polygon && x.polygon.length > 2 || x.areaM2; }).sort(function (a, b) { return (b.treeCount || 0) - (a.treeCount || 0); });
      el.innerHTML = plots.length ? plots.map(function (x) { return '<article class="org-card card card-lift"><div class="org-head"><span class="org-logo org-logo-ph">' + ui.icon('sprout').s + '</span><div><h3>' + MT.esc(x.name) + '</h3><p class="muted">' + MT.esc([x.city, x.state].filter(Boolean).join(', ')) + '</p></div></div><dl class="kv kv-2"><dt>Area</dt><dd>' + (x.areaM2 ? MT.fmt.num(x.areaM2) + ' m²' : '—') + '</dd><dt>Planted</dt><dd>' + MT.fmt.date(x.baselineOn) + '</dd><dt>Trees</dt><dd>' + (x.treeCount || '—') + '</dd></dl><a class="btn btn-soft" href="#/green/' + encodeURIComponent(x.id) + '">Open</a></article>'; }).join('') : ui.empty({ title: 'No planting sites yet', text: 'Plant several saplings together, or draw a plot area while planting, and the site appears here.', action: { label: 'Plant a tree', href: '#/plant' } }).s; ui.icons();
    }).catch(function (e) { el.innerHTML = ui.empty({ title: 'Could not load', text: MT.friendlyError(e) }).s; });
  }

  /* ---------- plot page ---------- */
  function plotPage() {
    return h`<div class="page green-page" data-reveal><a class="back-link" href="#/green">${ui.icon('arrow-left')} All sites</a><div id="gp-head">${ui.skeleton(2, 'sk-card')}</div><div id="gp-body"></div></div>`;
  }
  function plotAfter(host, ctx) {
    var id = ctx.params.id, me = MT.auth.profile(), destroyed = false, map = null, chart = null, charts = MT.charts.manager();
    MT.db.get('plots', id).then(function (plot) {
      if (!plot) { MT.$('#gp-head', host).innerHTML = ui.empty({ title: 'Site not found', text: 'It may belong to someone else.' }).s; return; }
      var scope = plot.ownerId === me.userId ? [['ownerId', '==', me.userId]] : (me.role === 'super_admin' ? [] : [['ancestorOrgIds', 'array-contains', me.orgId]]);
      return Promise.all([MT.db.list('trees', { where: scope.concat([['plotId', '==', id]]), limit: 500 }), MT.db.list('greenCoverReadings', { where: scope.concat([['plotId', '==', id]]), limit: 200 }).catch(function () { return []; })]).then(function (r) { if (!destroyed) draw(plot, { trees: r[0], readings: r[1] }); });
    }).catch(function (e) { MT.$('#gp-head', host).innerHTML = ui.empty({ title: 'Could not load', text: MT.friendlyError(e) }).s; });

    function draw(plot, cx) {
      var canEdit = plot.ownerId === me.userId || me.role === 'super_admin' || (MT.auth.isOrgAdmin() && (plot.ancestorOrgIds || []).indexOf(me.orgId) > -1);
      MT.$('#gp-head', host).innerHTML = '<div class="card-hero welcome"><div><p class="eyebrow">Planting site</p><h2>' + MT.esc(plot.name) + '</h2><p>' + MT.esc([plot.city, plot.state].filter(Boolean).join(', ')) + ' · planted ' + MT.fmt.date(plot.baselineOn) + ' · ' + (plot.areaM2 ? MT.fmt.num(plot.areaM2) + ' m²' : 'area not set') + '</p></div><div id="gc-tile" class="gc-tile">Calculating…</div></div>';
      MT.$('#gp-body', host).innerHTML =
        '<section class="card"><div class="card-head"><div><h3>Satellite before &amp; after</h3><p class="fine">Drag the divider. Left = before, right = after.</p></div></div><div class="cmp-pick" id="sw-pick"></div><div class="tr-map swipe" id="sw-map"></div><p class="fine" id="sw-attr"></p><p class="fine">⚠ NASA GIBS layers are coarse (250 m – 1 km per pixel): they show regional vegetation trends, not individual plots. Esri Wayback availability varies by area and may carry usage terms.</p></section>' +
        '<section class="card"><div class="card-head"><h3>Green cover over time</h3></div><div id="gc-methods"></div><div class="chart-box"><canvas id="gc-chart" role="img" aria-label="Green cover percentage over time by method"></canvas></div></section>' +
        '<section class="card" id="ex-card"><div class="card-head"><div><h3>Photo-based estimate</h3><p class="fine">Detects green vegetation in a photo with the Excess Green index (ExG = 2G − R − B) and an adaptive threshold. A <strong>photo-based estimate</strong> — lighting and camera angle matter, so use the same viewpoint.</p></div></div><div class="ex-grid"><div class="ex-slot" data-slot="a"></div><div class="ex-slot" data-slot="b"></div></div><div class="btn-row"><button class="btn btn-primary" id="ex-go">' + ui.icon('scan-search').s + ' Analyse</button><button class="btn btn-soft" id="ex-save" disabled>Save readings</button></div><p class="fine" id="ex-msg" role="status"></p></section>' +
        (canEdit ? '<section class="card"><h3>Site settings</h3><div class="form-grid"><div class="field"><label for="bp">Green cover before planting (%)</label><input id="bp" type="number" min="0" max="100" step="1" value="' + (+plot.baselineCoverPct || 0) + '"><p class="field-hint">Used as the starting point of the on-ground estimate.</p></div><div class="field"><label for="ar">Plot area (m²)</label><input id="ar" type="number" min="0" step="1" value="' + (plot.areaM2 || 0) + '"></div></div><button class="btn btn-soft" id="st-save">Save</button></section>' : '');
      ui.icons(); methods(plot, cx); swipe(plot); exSection(plot, cx);
      var sv = MT.$('#st-save', host); if (sv) sv.addEventListener('click', function () { MT.db.update('plots', plot.id, { baselineCoverPct: +MT.$('#bp', host).value || 0, areaM2: +MT.$('#ar', host).value || 0 }).then(function () { ui.success('Saved.'); MT.router.refresh(); }).catch(ui.error); });
    }

    function methods(plot, cx) {
      G.summary(plot, cx).then(function (res) {
        if (destroyed) return; var real = res.filter(function (r) { return r.real && !r.unavailable && delta(r) != null; }), main = real.filter(function (r) { return r.id === 'ground'; })[0] || real[0];
        var tile = MT.$('#gc-tile', host); tile.innerHTML = main ? '<span class="fine">Green cover change since plantation</span><strong>' + (delta(main) >= 0 ? '+' : '') + delta(main) + '%</strong><span class="fine">based on: ' + MT.esc(main.label.split(' (')[0]) + (real.length > 1 ? ' · also ' + real.filter(function (r) { return r !== main; }).map(function (r) { return MT.esc(r.label.split(' (')[0]); }).join(', ') : '') + '</span>' : '<span class="fine">Green cover change since plantation</span><strong>—</strong><span class="fine">Not enough real data yet: set the plot area, or analyse two photos.</span>';
        MT.$('#gc-methods', host).innerHTML = '<ul class="plain-list">' + res.map(function (r) { var dl = delta(r); return '<li>' + (r.simulated ? '<span class="badge badge-warn">SIMULATED (demo)</span> ' : r.real ? '<span class="badge badge-ok">real data</span> ' : '') + '<strong>' + MT.esc(r.label) + '</strong>' + (r.unavailable ? '<small>' + MT.esc(r.unavailable) + '</small>' : '<small>' + (dl != null ? (dl >= 0 ? '+' : '') + dl + ' percentage points · latest ' + r.series[r.series.length - 1].pct + '% · ' : '') + MT.esc(r.note || '') + '</small>') + '</li>'; }).join('') + '</ul>';
        var shown = res.filter(function (r) { return r.series && r.series.length; });
        if (!shown.length) { MT.$('#gc-chart', host).parentNode.innerHTML = '<p class="muted">Nothing to chart yet.</p>'; return; }
        MT.loader.load('chart').then(function () { if (destroyed) return; charts.add(MT.$('#gc-chart', host), function (th) { return gcConfig(th, shown); }); });
      });
    }

    /* --- satellite swipe --- */
    function swipe(plot) {
      var el = MT.$('#sw-map', host), pick = MT.$('#sw-pick', host), L1, L2, slider;
      var pts = (plot.polygon || []).map(function (q) { return Array.isArray(q) ? q : [q.lat, q.lng]; }), center = plot.center ? [plot.center.lat, plot.center.lng] : (pts[0] || [21.5, 79]);
      MT.imagery.wayback().catch(function () { return []; }).then(function (wb) {
        var srcs = Object.keys(MT.imagery.sources).map(function (k) { return Object.assign({ id: k }, MT.imagery.sources[k]); });
        var base = plot.baselineOn || MT.fmt.iso(new Date()), nearest = wb.slice().sort(function (a, b) { return Math.abs(new Date(a.date) - new Date(base)) - Math.abs(new Date(b.date) - new Date(base)); })[0];
        wb.filter(function (w, i) { return i % 3 === 0; }).concat(nearest ? [nearest] : []).forEach(function (w) { if (!srcs.some(function (s) { return s.id === w.id; })) srcs.push({ id: w.id, label: w.label, url: w.url, opts: { maxZoom: 19, maxNativeZoom: 17, attribution: 'Esri Wayback — ' + w.date + ' · Esri, Maxar, Earthstar Geographics' } }); });
        function opts(side, def, date) { return '<label>' + side + ' <select id="sw-' + side + '">' + srcs.map(function (s) { return '<option value="' + MT.esc(s.id) + '"' + (s.id === def ? ' selected' : '') + '>' + MT.esc(s.label) + '</option>'; }).join('') + '</select></label><input type="date" id="sw-' + side + '-d" value="' + date + '" max="' + MT.fmt.iso(new Date()) + '" aria-label="' + side + ' imagery date" hidden>'; }
        var defA = nearest ? nearest.id : 'gibs-true', defB = 'esri-now', dB = MT.fmt.iso(new Date(Date.now() - 20 * DAY));
        pick.innerHTML = opts('Before', defA, base) + opts('After', defB, dB);
        MT.maps.create(el, { center: center, zoom: pts.length ? 16 : 14, satelliteToggle: false, scrollWheelZoom: false }).then(function (map0) {
          if (destroyed) { map0.remove(); return; } map = map0; if (pts.length) { L.polygon(pts, { color: '#ffd23f', weight: 3, fill: false }).addTo(map); map.fitBounds(pts, { padding: [30, 30], maxZoom: 17 }); }
          var misses = 0; function warn() { if (++misses === 6) ui.toast('Some imagery tiles are unavailable for this area or date.', { type: 'warn' }); }
          function layerFor(side) {
            var id = MT.$('#sw-' + side, host).value, s = srcs.filter(function (x) { return x.id === id; })[0], d = MT.$('#sw-' + side + '-d', host); d.hidden = !s.dated;
            var o = Object.assign({ pane: 'tilePane' }, s.opts, s.dated ? { time: d.value || base } : {}); var l = L.tileLayer(s.url, o); l.on('tileerror', warn); l._src = s; return l;
          }
          function clip() { if (!L1 || !L2) return; var nw = map.containerPointToLayerPoint([0, 0]), se = map.containerPointToLayerPoint(map.getSize()), x = nw.x + (se.x - nw.x) * (+slider.value / 100); L1.getContainer().style.clip = 'rect(' + nw.y + 'px,' + x + 'px,' + se.y + 'px,' + nw.x + 'px)'; L2.getContainer().style.clip = 'rect(' + nw.y + 'px,' + se.x + 'px,' + se.y + 'px,' + x + 'px)'; MT.$('#sw-bar', host).style.left = slider.value + '%'; }
          function build() { if (L1) map.removeLayer(L1); if (L2) map.removeLayer(L2); L1 = layerFor('Before').addTo(map); L2 = layerFor('After').addTo(map); MT.$('#sw-attr', host).textContent = 'Imagery: ' + L1._src.opts.attribution + '  |  ' + L2._src.opts.attribution; clip(); }
          var wrap = document.createElement('div'); wrap.className = 'sw-ctl'; wrap.innerHTML = '<span class="cmp-bar" id="sw-bar" aria-hidden="true" style="left:50%"></span><input type="range" min="0" max="100" value="50" id="sw-range" aria-label="Drag to compare before and after imagery">'; el.appendChild(wrap); slider = wrap.querySelector('input');
          slider.addEventListener('input', clip); map.on('move zoom viewreset', clip); ['Before', 'After'].forEach(function (s) { MT.$('#sw-' + s, host).addEventListener('change', build); MT.$('#sw-' + s + '-d', host).addEventListener('change', build); });
          build(); setTimeout(clip, 300);
        }).catch(function (e) { el.innerHTML = '<div class="empty"><h3>Map unavailable</h3><p>' + MT.esc(MT.friendlyError(e)) + '</p></div>'; });
      });
    }

    /* --- photo ExG --- */
    function exSection(plot, cx) {
      var slots = { a: { label: 'Before' }, b: { label: 'After' } }, photos = [], result = {};
      function gather() {
        var out = (plot.baselinePhotoIds || []).map(function (pid) { return { id: pid, date: plot.baselineOn, label: 'Baseline photo' }; }), trees = cx.trees.slice(0, 12);
        trees.forEach(function (t) { if (t.coverPhotoId) out.push({ id: t.coverPhotoId, date: t.plantedOn, label: t.code }); });
        return trees.reduce(function (p, t) { return p.then(function () { if (!t.updatesCount) return; return MT.updates.forTree(t).then(function (us) { us.forEach(function (u) { (u.photoIds || []).forEach(function (pid) { out.push({ id: pid, date: u.date, label: t.code }); }); }); }).catch(function () {}); }); }, Promise.resolve()).then(function () { var seen = {}; return out.filter(function (x) { if (seen[x.id]) return false; seen[x.id] = 1; return true; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; }); });
      }
      gather().then(function (list) {
        if (destroyed) return; photos = list;
        MT.$$('.ex-slot', host).forEach(function (el) {
          var k = el.dataset.slot; el.innerHTML = '<h4>' + slots[k].label + '</h4><select class="ex-sel" aria-label="' + slots[k].label + ' photo"><option value="">' + (list.length ? 'Choose a saved photo…' : 'No saved photos yet') + '</option>' + list.map(function (p, i) { return '<option value="' + i + '">' + MT.fmt.date(p.date) + ' · ' + MT.esc(p.label) + '</option>'; }).join('') + '</select><label class="btn btn-ghost btn-sm">Upload a photo<input type="file" accept="image/*" hidden></label><div class="field"><label>Photo date</label><input type="date" class="ex-date" max="' + MT.fmt.iso(new Date()) + '"></div><div class="ex-out"><p class="fine">Pick or upload a photo.</p></div>';
          var sel = el.querySelector('.ex-sel'), file = el.querySelector('input[type=file]'), dt = el.querySelector('.ex-date'), out = el.querySelector('.ex-out');
          sel.addEventListener('change', function () { var p = photos[+sel.value]; if (!p) return; slots[k].photoId = p.id; slots[k].src = null; dt.value = p.date; MT.photoStore.full(p.id).then(function (src) { slots[k].src = src; out.innerHTML = '<img src="' + MT.esc(src) + '" alt="Selected photo" class="ex-img">'; }); });
          file.addEventListener('change', function () { if (!file.files[0]) return; MT.img.fileToDataUrl(file.files[0]).then(function (src) { slots[k].src = src; slots[k].photoId = ''; if (!dt.value) dt.value = MT.fmt.iso(new Date()); out.innerHTML = '<img src="' + src + '" alt="Uploaded photo" class="ex-img">'; }); });
        });
      });
      var go = MT.$('#ex-go', host), save = MT.$('#ex-save', host), msg = MT.$('#ex-msg', host);
      go.addEventListener('click', function () {
        var ks = ['a', 'b'].filter(function (k) { return slots[k].src; }); if (!ks.length) return ui.toast('Choose or upload at least one photo.', { type: 'warn' });
        msg.textContent = 'Analysing…'; result = {};
        Promise.all(ks.map(function (k) { return MT.img.load(slots[k].src).then(function (im) { var r = G.exg(im); result[k] = r; var out = MT.$('.ex-slot[data-slot=' + k + '] .ex-out', host); out.innerHTML = ''; r.overlay.className = 'ex-img'; out.appendChild(r.overlay); var b = document.createElement('p'); b.innerHTML = '<strong>' + r.pct + '%</strong> green vegetation <span class="fine">(photo-based estimate, threshold ' + r.threshold + ')</span>'; out.appendChild(b); }); })).then(function () {
          msg.textContent = result.a && result.b ? 'Change: ' + (result.b.pct - result.a.pct >= 0 ? '+' : '') + (Math.round((result.b.pct - result.a.pct) * 10) / 10) + ' percentage points (photo-based estimate).' : 'Analysed.'; save.disabled = !canSave();
        }).catch(ui.error);
      });
      function canSave() { return !!(plot.ownerId === me.userId || me.role === 'super_admin' || MT.auth.isOrgAdmin()); }
      save.addEventListener('click', function () {
        var b = MT.db.batch(), n = 0; ['a', 'b'].forEach(function (k) {
          if (!result[k]) return; var dt = MT.$('.ex-slot[data-slot=' + k + '] .ex-date', host).value || MT.fmt.iso(new Date());
          b.set('greenCoverReadings', MT.uid('g'), { plotId: plot.id, method: 'photo-exg', pct: result[k].pct, date: dt, photoId: slots[k].photoId || '', ownerId: plot.ownerId, orgId: plot.orgId || '', ancestorOrgIds: plot.ancestorOrgIds || [], createdBy: me.userId, createdAt: Date.now(), threshold: result[k].threshold }); n++;
        }); if (!n) return; save.disabled = true;
        b.commit().then(function () { ui.success(n + ' reading' + (n > 1 ? 's' : '') + ' saved.'); MT.router.refresh(); }).catch(function (e) { ui.error(e); save.disabled = false; });
      });
    }
    return function () { destroyed = true; charts.destroy(); if (map) map.remove(); };
  }

  MT.router.add('/green', { title: 'Green cover', layout: 'app', access: ALL, render: listPage, after: listAfter });
  MT.router.add('/green/:id', { title: 'Green cover', layout: 'app', access: ALL, render: plotPage, after: plotAfter });
})();
