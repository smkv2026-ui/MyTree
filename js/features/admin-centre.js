/**
 * MyTree — Super Admin command centre (#/admin). Reads denormalised COUNTER documents (stats/*), never the whole tree collection;
 * charts that need per-tree detail use a clearly labelled sample of the 2,000 newest trees in the selected scope.
 * Filters (state → city, or organisation) cascade to every widget.
 */
(function () {
  'use strict';
  var MT = window.MT, h = MT.html, raw = MT.raw, ui = MT.ui, slug = MT.geoData.slug;
  var SAMPLE = 2000;

  function render() {
    return h`<div class="page admin-centre" data-reveal>
      <div class="page-head row"><div><p class="eyebrow">Super Admin</p><h2>Command centre</h2><p class="muted" id="ac-scope">All of India · every organisation</p></div>
        <div class="btn-row tight"><a class="btn btn-ghost" href="#/admin/health">${ui.icon('heart-pulse')} Tree health</a><a class="btn btn-ghost" href="#/admin/reports">${ui.icon('bar-chart-3')} Reports</a><a class="btn btn-gold" href="#/admin/approvals" id="ac-appr">${ui.icon('badge-check')} Approvals</a></div></div>
      <div class="toolbar card"><div class="tb-row"><select id="ac-state" aria-label="State"><option value="">All states</option></select><select id="ac-city" aria-label="City" disabled><option value="">All cities</option></select><select id="ac-org" aria-label="Organisation"><option value="">All organisations</option></select><button type="button" class="link-btn" id="ac-reset">Reset filters</button><span class="fine" id="ac-note"></span></div></div>
      <section class="kpi-grid" id="ac-kpi">${ui.skeleton(2, 'sk-card')}</section>
      <section class="card"><div class="card-head"><div><h3 id="ac-map-title">Where the trees are</h3><p class="fine">Circle size = trees planted; darker = higher survival. Click a circle to drill down.</p></div></div><div class="tr-map" id="ac-map"></div></section>
      <div class="chart-grid" id="ac-charts"></div></div>`;
  }

  function after(host) {
    var F = { state: '', city: '', org: '' }, D = null, destroyed = false, map = null, layer = null, mgr = null;
    var els = { state: MT.$('#ac-state', host), city: MT.$('#ac-city', host), org: MT.$('#ac-org', host) };

    function monthKey(d) { return d.slice(0, 7); }
    function docKey() { return F.org ? 'org_' + F.org : F.city ? 'city_' + slug(F.city) : F.state ? 'region_' + slug(F.state) : 'global'; }
    function sampleScope() {
      if (F.org) return [['ancestorOrgIds', 'array-contains', F.org]]; if (F.city) return [['city', '==', F.city]]; if (F.state) return [['state', '==', F.state]]; return [];
    }
    function treeYears(d) { var today = Math.floor(Date.now() / 86400000); return Math.max(0, ((d.treesAlive || 0) * today - (d.sumPlantedDayAlive || 0)) / 365.25); }

    function loadAll() {
      return Promise.all([MT.db.get('stats', 'global'), MT.db.get('stats', 'species'), MT.db.list('stats', { where: [['kind', '==', 'region']] }), MT.db.list('stats', { where: [['kind', '==', 'city']] }), MT.db.list('stats', { where: [['kind', '==', 'month']] }), MT.db.list('stats', { where: [['kind', '==', 'org']] }), MT.db.list('orgs', { limit: 2000 })]).then(function (r) {
        D = { global: r[0] || {}, species: r[1] || {}, regions: r[2], cities: r[3], months: r[4], orgStats: {}, orgs: {} };
        r[5].forEach(function (s) { D.orgStats[s.id.replace(/^org_/, '')] = s; }); r[6].forEach(function (o) { D.orgs[o.id] = o; });
        els.state.innerHTML = '<option value="">All states</option>' + D.regions.map(function (x) { return x.name; }).sort().map(function (n) { return '<option>' + MT.esc(n) + '</option>'; }).join('');
        els.org.innerHTML = '<option value="">All organisations</option>' + Object.keys(D.orgs).filter(function (id) { return D.orgs[id].status === 'approved'; }).sort(function (a, b) { return D.orgs[a].name.localeCompare(D.orgs[b].name); }).map(function (id) { return '<option value="' + MT.esc(id) + '">' + MT.esc(D.orgs[id].name) + '</option>'; }).join('');
      });
    }
    function loadSample() {
      var sc = sampleScope(); if (!sc.length && !F.state) return MT.db.list('trees', { orderBy: ['createdAt', 'desc'], limit: SAMPLE });
      return MT.db.list('trees', { where: sc, orderBy: ['createdAt', 'desc'], limit: SAMPLE });
    }

    function refresh() {
      if (destroyed) return;
      var key = docKey(), doc = key === 'global' ? D.global : (key.indexOf('org_') === 0 ? D.orgStats[F.org] : key.indexOf('city_') === 0 ? D.cities.filter(function (c) { return c.id === key; })[0] : D.regions.filter(function (c) { return c.id === key; })[0]) || {};
      var label = F.org ? D.orgs[F.org].name : F.city ? F.city + ', ' + F.state : F.state ? F.state : 'All of India';
      MT.$('#ac-scope', host).textContent = label + (F.org ? '' : ' · every organisation');
      MT.$('#ac-appr', host).innerHTML = ui.icon('badge-check').s + ' Approvals' + (D.global.orgsPending ? ' <span class="count-pill">' + D.global.orgsPending + '</span>' : ''); ui.icons();
      kpis(doc);
      drawMap();
      var needSample = key !== 'global' || true; // species growth & compliance always need per-tree data
      loadSample().then(function (rows) { if (destroyed) return; charts(doc, rows, key); }).catch(function (e) { MT.$('#ac-charts', host).innerHTML = '<div class="card"><p>' + MT.esc(MT.friendlyError(e)) + '</p></div>'; });
    }

    function kpis(d) {
      var g = D.global, alive = d.treesAlive || 0, total = d.trees || 0, surv = total ? Math.round(alive / total * 100) : 0, co2 = Math.round(treeYears(d) * MT.species.AVG_CO2_PER_TREE_YEAR), o2 = Math.round(MT.species.o2FromCo2(co2));
      var cur = D.months.filter(function (m) { return m.id === 'month_' + MT.fmt.iso(new Date()).slice(0, 7); })[0];
      var k = [['trees', 'Trees planted', total, ''], ['shield-check', 'Survival rate', surv, '%'], ['users', F.org ? 'Members' : 'Active users', F.org ? (d.members || 0) : (g.users || 0), ''], ['clipboard-check', 'Updates this month', cur ? (cur.updates || 0) : 0, ''], ['wind', 'CO₂ absorbed (estimate)', co2 / 1000, ' t', 1], ['cloud-sun', 'O₂ produced (estimate)', o2 / 1000, ' t', 1]];
      var orgs = '<div class="kpi card"><span class="kpi-ic">' + ui.icon('building-2').s + '</span><div><strong class="kpi-num kpi-orgs">' + (g.orgs_school || 0) + ' · ' + (g.orgs_institution || 0) + ' · ' + (g.orgs_foundation || 0) + '</strong><span class="kpi-label">Schools · Institutions · Foundations</span></div></div>';
      MT.$('#ac-kpi', host).innerHTML = k.map(function (x) { return '<div class="kpi card"><span class="kpi-ic">' + ui.icon(x[0]).s + '</span><div><strong class="kpi-num" data-count="' + x[2] + '" data-decimals="' + (x[4] || 0) + '" data-suffix="' + x[3] + '">0</strong><span class="kpi-label">' + x[1] + '</span></div></div>'; }).join('') + orgs;
      ui.icons(); ui.counters(MT.$('#ac-kpi', host));
      MT.$('#ac-note', host).textContent = 'CO₂ and O₂ are estimates (species × age factors; O₂ = CO₂ × 32/44).';
    }

    function colorFor(p) { var a = [217, 243, 227], b = [15, 61, 46], c = a.map(function (x, i) { return Math.round(x + (b[i] - x) * p); }); return 'rgb(' + c.join(',') + ')'; }
    function drawMap() {
      var el = MT.$('#ac-map', host);
      function paint() {
        if (layer) layer.clearLayers(); else layer = L.layerGroup().addTo(map);
        var items, byCity = F.state || F.org;
        if (!byCity) items = D.regions.map(function (r) { var c = MT.geoData.stateCentroids[r.name]; return c ? { name: r.name, lat: c[0], lng: c[1], d: r, onclick: function () { els.state.value = r.name; set(); } } : null; });
        else items = D.cities.filter(function (c) { return !F.state || c.state === F.state; }).map(function (c) { return { name: c.name, lat: c.lat, lng: c.lng, d: c, onclick: function () { els.state.value = c.state; set(); els.city.value = c.name; set(); } }; });
        items = items.filter(Boolean).filter(function (i) { return i.d.trees > 0 && i.lat != null; });
        var sv = items.map(function (i) { return (i.d.treesAlive || 0) / i.d.trees; }), smin = Math.min.apply(null, sv.concat([1])), smax = Math.max.apply(null, sv.concat([0])); var max = Math.max.apply(null, items.map(function (i) { return i.d.trees; }).concat([1])), pts = [];
        MT.$('#ac-map-title', host).textContent = byCity ? 'Cities' + (F.state ? ' in ' + F.state : '') : 'States';
        items.forEach(function (i) {
          var surv = i.d.trees ? (i.d.treesAlive || 0) / i.d.trees : 0, r = 9 + 30 * Math.sqrt(i.d.trees / max);
          var m = L.circleMarker([i.lat, i.lng], { radius: r, color: '#fff', weight: 2, fillColor: colorFor(smax > smin ? (surv - smin) / (smax - smin) : 0.6), fillOpacity: 0.9 }).addTo(layer);
          m.bindTooltip('<strong>' + MT.esc(i.name) + '</strong><br>' + MT.fmt.num(i.d.trees) + ' trees · ' + Math.round(surv * 100) + '% alive'); m.on('click', i.onclick); pts.push([i.lat, i.lng]);
        });
        if (pts.length) map.fitBounds(pts, { padding: [40, 40], maxZoom: F.state ? 9 : 6 });
      }
      if (map) { paint(); return; }
      MT.maps.create(el, { center: [21.5, 79], zoom: 5, scrollWheelZoom: false }).then(function (m) { if (destroyed) { m.remove(); return; } map = m; paint(); }).catch(function (e) { el.innerHTML = '<div class="empty"><h3>Map unavailable</h3><p>' + MT.esc(MT.friendlyError(e)) + '</p></div>'; });
    }

    function charts(doc, rows, key) {
      var grid = MT.$('#ac-charts', host); if (mgr) mgr.destroy(); grid.innerHTML = ''; mgr = MT.charts.manager();
      var sampled = rows.length >= SAMPLE, nm = function (id) { return MT.species.get(id).common; };
      MT.loader.load('chart').then(function () {
        if (destroyed) return;
        // 1 planting over time
        var months = {}; if (key === 'global') D.months.forEach(function (m) { months[m.id.replace('month_', '')] = m.trees || 0; }); else rows.forEach(function (t) { months[monthKey(t.plantedOn)] = (months[monthKey(t.plantedOn)] || 0) + 1; });
        var mk = Object.keys(months).sort().slice(-18), c1 = MT.charts.card(grid, 'c-time', 'Trees planted per month', key === 'global' ? 'From platform counters' : (sampled ? 'Sample: newest ' + SAMPLE + ' trees in this scope' : 'All trees in this scope'));
        c1.setTable(['Month', 'Trees'], mk.map(function (k) { return [k, months[k]]; })); mgr.add(c1.querySelector('canvas'), function (th) { return MT.charts.bar(th, { labels: mk.map(function (k) { return MT.fmt.date(k + '-01', { month: 'short', year: '2-digit' }); }), data: mk.map(function (k) { return months[k]; }) }); });
        // 2 species mix
        var sp = {}; if (key === 'global') Object.keys(D.species).forEach(function (k) { if (k !== 'id' && k !== 'kind' && D.species[k] > 0) sp[k] = D.species[k]; }); else rows.forEach(function (t) { if (t.status !== 'dead') sp[t.speciesId] = (sp[t.speciesId] || 0) + 1; });
        var top = Object.keys(sp).sort(function (a, b) { return sp[b] - sp[a]; }), shown = top.slice(0, 9), other = top.slice(9).reduce(function (a, k) { return a + sp[k]; }, 0), labels = shown.map(nm), data = shown.map(function (k) { return sp[k]; }); if (other) { labels.push('Other species'); data.push(other); }
        var c2 = MT.charts.card(grid, 'c-species', 'Species mix (live trees)', key === 'global' ? 'From platform counters' : 'Sample'); c2.setTable(['Species', 'Trees'], labels.map(function (l, i) { return [l, data[i]]; })); mgr.add(c2.querySelector('canvas'), function (th) { return MT.charts.bar(th, { labels: labels, data: data, horizontal: true }); });
        // 3 health
        var H = ['thriving', 'healthy', 'needs_care', 'struggling', 'dead'], hv = H.map(function (x) { return doc['h_' + x] || 0; }), c3 = MT.charts.card(grid, 'c-health', 'Health distribution', 'From counters');
        c3.setTable(['Health', 'Trees'], H.map(function (x, i) { return [ui.healthLabel[x], hv[i]]; })); mgr.add(c3.querySelector('canvas'), function (th) { return MT.charts.bar(th, { labels: H.map(function (x) { return ui.healthLabel[x]; }), data: hv, colors: H.map(function (x) { return th.health[x]; }) }); });
        // 4 survival vs mortality (stat card)
        var total = doc.trees || 0, alive = doc.treesAlive || 0, s = document.createElement('section'); s.className = 'card'; s.innerHTML = '<div class="card-head"><h3>Survival vs mortality</h3></div><div class="two-rings">' + ui.ring(total ? alive / total * 100 : 0, (total ? Math.round(alive / total * 100) : 0) + '%', 'survive', 120).s + '<ul class="plain-list"><li><strong>' + MT.fmt.num(alive) + '</strong> alive<small>' + (doc.treesDead ? MT.fmt.num(doc.treesDead) + ' died' : 'none died yet') + '</small></li><li><strong>' + (total ? Math.round((doc.treesDead || 0) / total * 100) : 0) + '%</strong> mortality<small>of ' + MT.fmt.num(total) + ' planted</small></li></ul></div>'; grid.appendChild(s);
        // 5 top orgs
        var orgs = Object.keys(D.orgStats).map(function (id) { return { id: id, o: D.orgs[id], s: D.orgStats[id] }; }).filter(function (x) { return x.o && x.o.type !== 'foundation' && (!F.state || x.o.state === F.state) && (!F.city || x.o.city === F.city) && (!F.org || x.id === F.org); }).sort(function (a, b) { return (b.s.trees || 0) - (a.s.trees || 0); }).slice(0, 10);
        var c5 = MT.charts.card(grid, 'c-orgs', 'Top organisations', 'Schools and institutions by trees planted'); c5.setTable(['Organisation', 'Trees', 'Alive %', 'Members'], orgs.map(function (x) { return [x.o.name, x.s.trees || 0, x.s.trees ? Math.round((x.s.treesAlive || 0) / x.s.trees * 100) + '%' : '—', x.s.members || 0]; })); mgr.add(c5.querySelector('canvas'), function (th) { return MT.charts.bar(th, { labels: orgs.map(function (x) { return x.o.name; }), data: orgs.map(function (x) { return x.s.trees || 0; }), horizontal: true }); });
        // 6 growth by species (sample)
        var gr = {}; rows.forEach(function (t) { var a = MT.trees.ageYears(t); if (t.status !== 'dead' && a >= 0.25 && t.heightCm) (gr[t.speciesId] = gr[t.speciesId] || []).push(t.heightCm / a); });
        var gk = Object.keys(gr).filter(function (k) { return gr[k].length >= 3; }).map(function (k) { var a = gr[k].sort(function (x, y) { return x - y; }); return [k, a[Math.floor(a.length / 2)], a.length]; }).sort(function (a, b) { return b[2] - a[2]; }).slice(0, 8);
        var c6 = MT.charts.card(grid, 'c-growth', 'Growth by species (cm per year)', 'Median of live trees older than 3 months — ' + (sampled ? 'sample of ' + SAMPLE : 'all in scope')); c6.setTable(['Species', 'Median cm/yr', 'Trees'], gk.map(function (x) { return [nm(x[0]), Math.round(x[1]), x[2]]; })); mgr.add(c6.querySelector('canvas'), function (th) { return MT.charts.bar(th, { labels: gk.map(function (x) { return nm(x[0]); }), data: gk.map(function (x) { return Math.round(x[1]); }), horizontal: true, unit: 'cm/yr' }); });
        // 7 compliance
        var live = rows.filter(function (t) { return t.status !== 'dead'; }), ok = live.filter(function (t) { var st = MT.cadence.status(t).state; return st === 'ok' || st === 'soon'; }).length, comp = live.length ? Math.round(ok / live.length * 100) : 0;
        var s7 = document.createElement('section'); s7.className = 'card'; s7.innerHTML = '<div class="card-head"><div><h3>Update compliance</h3><p class="fine">Share of live trees that are not overdue — ' + (sampled ? 'sample of ' + SAMPLE : 'all in scope') + '</p></div></div><div class="two-rings">' + ui.ring(comp, comp + '%', 'on time', 120).s + '<ul class="plain-list"><li><strong>' + MT.fmt.num(live.length - ok) + '</strong> due or overdue<small>of ' + MT.fmt.num(live.length) + ' live trees checked</small></li></ul></div>'; grid.appendChild(s7);
        // 8 city / state comparison
        var cmp = F.state ? D.cities.filter(function (c) { return c.state === F.state; }) : D.regions.map(function (r) { return { name: r.name, trees: r.trees, treesAlive: r.treesAlive }; });
        cmp = cmp.filter(function (x) { return x.trees; }).sort(function (a, b) { return b.trees - a.trees; }).slice(0, 10);
        var c8 = MT.charts.card(grid, 'c-cmp', F.state ? 'Cities in ' + F.state : 'States compared', 'Trees planted'); c8.setTable(['Place', 'Trees', 'Alive %'], cmp.map(function (x) { return [x.name, x.trees, Math.round((x.treesAlive || 0) / x.trees * 100) + '%']; })); mgr.add(c8.querySelector('canvas'), function (th) { return MT.charts.bar(th, { labels: cmp.map(function (x) { return x.name; }), data: cmp.map(function (x) { return x.trees; }), horizontal: true }); });
      }).catch(function (e) { grid.innerHTML = '<div class="card"><p>' + MT.esc(MT.friendlyError(e)) + '</p></div>'; });
    }

    function set() {
      F.state = els.state.value; var cs = D.cities.filter(function (c) { return !F.state || c.state === F.state; });
      els.city.disabled = !F.state; els.city.innerHTML = '<option value="">All cities</option>' + cs.map(function (c) { return c.name; }).sort().map(function (n) { return '<option>' + MT.esc(n) + '</option>'; }).join(''); if (!F.state) els.city.value = '';
      F.city = els.city.value; F.org = els.org.value; refresh();
    }
    els.state.addEventListener('change', function () { els.city.value = ''; els.org.value = ''; set(); });
    els.city.addEventListener('change', function () { F.city = els.city.value; refresh(); });
    els.org.addEventListener('change', function () { els.state.value = ''; els.city.value = ''; F.org = els.org.value; F.state = ''; F.city = ''; els.city.disabled = true; refresh(); });
    MT.$('#ac-reset', host).addEventListener('click', function () { els.state.value = ''; els.city.value = ''; els.org.value = ''; set(); });
    loadAll().then(function () { if (!destroyed) refresh(); }).catch(function (e) { MT.$('#ac-kpi', host).innerHTML = '<div class="card"><p>' + MT.esc(MT.friendlyError(e)) + '</p></div>'; });
    return function () { destroyed = true; if (mgr) mgr.destroy(); if (map) map.remove(); };
  }

  MT.router.add('/admin', { title: 'Command centre', layout: 'app', access: ['super_admin'], render: render, after: after });
})();
