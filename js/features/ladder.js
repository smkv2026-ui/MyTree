/**
 * MyTree — Carbon ladder (#/ladder), visible to every signed-in role.
 *
 *  • Each person's trees remove CO₂ (species × age, the same estimate used everywhere in MyTree). That is weighted by the air quality of their region:
 *    dirtier air (higher AQI from the free Open-Meteo API) makes each tree's cleaning work count up to +50 % more.  score = kg CO₂ removed × AQI weight.
 *  • 1 MyTree carbon credit = 10 kg of weighted CO₂ removed. Credits are an EDUCATIONAL showcase — they are not tradable and not a certified offset.
 *  • People climb a ladder of rungs (Seed → Rainforest). The page shows the top 10 first, then everyone else rung by rung, plus an Organisations tab.
 *  • A person can enter an annual carbon-footprint estimate (calculator) to see what share of it their trees already offset.
 *  Rows live in `ladder/{userId}` (first name + initial only; people can hide themselves). The Super Admin can rebuild every row from the tree data.
 */
(function () {
  'use strict';
  var MT = window.MT, ui = MT.ui, kit = MT.kit, esc = MT.esc;
  var TRACKED = ['individual', 'student', 'foundation', 'school', 'institution'], PEOPLE = ['individual', 'student'], CREDIT_KG = 10;
  var RUNGS = [
    { id: 'seed', label: 'Seed', min: 0, icon: 'sprout', color: '#8a6a4a' }, { id: 'sprout', label: 'Sprout', min: 1, icon: 'leaf', color: '#4fbf4a' }, { id: 'sapling', label: 'Sapling', min: 5, icon: 'trees', color: '#2e9e5b' },
    { id: 'grove', label: 'Grove', min: 15, icon: 'tree-pine', color: '#1f8a50' }, { id: 'forest', label: 'Forest', min: 40, icon: 'mountain', color: '#17808c' }, { id: 'canopy', label: 'Canopy', min: 100, icon: 'cloud-sun', color: '#c9a227' },
    { id: 'rainforest', label: 'Rainforest', min: 250, icon: 'crown', color: '#b8421a' }];
  function rungOf(c) { var r = RUNGS[0]; RUNGS.forEach(function (x) { if (c >= x.min) r = x; }); return r; }
  function nextRung(c) { return RUNGS.filter(function (x) { return x.min > c; })[0] || null; }
  var fmt = function (n, d) { return MT.fmt.num(n, d == null ? 1 : d); };

  /* ---------- computing one person's row from their trees ---------- */
  function cityOf(trees, profile, org) { var m = {}, best = '', n = 0; trees.forEach(function (t) { if (t.city) { m[t.city] = (m[t.city] || 0) + 1; if (m[t.city] > n) { n = m[t.city]; best = t.city; } } }); return best || profile.city || (org && org.city) || ''; }
  function buildRow(u, trees, org, aqiMap, footprintKg) {
    var alive = trees.filter(function (t) { return t.status !== 'dead'; }), kg = alive.reduce(function (a, t) { return a + MT.species.co2Total(t.speciesId, MT.species.ageYears(t.plantedOn)); }, 0);
    var city = cityOf(trees, u, org), a = (aqiMap && aqiMap[city]) || { aqi: MT.aqi.typical(city), source: 'typical' }, mult = MT.aqi.multiplier(a.aqi), score = kg * mult;
    var row = { userId: u.userId, label: MT.stats.shortName(u.name), role: u.role, orgId: u.orgId || '', orgName: (org && org.name) || '', city: city, state: (MT.geoData.city(city) || {}).state || '', trees: trees.length, treesAlive: alive.length, kgCo2: Math.round(kg * 10) / 10,
      aqi: a.aqi, aqiSource: a.source, aqiMult: Math.round(mult * 100) / 100, score: Math.round(score * 10) / 10, credits: Math.round(score / CREDIT_KG * 100) / 100, hidden: false, updatedAt: Date.now() };
    if (footprintKg) row.footprintKg = Math.round(footprintKg);
    return row;
  }
  MT.ladder = {
    RUNGS: RUNGS, CREDIT_KG: CREDIT_KG, rungOf: rungOf, buildRow: buildRow,
    /** Recompute the signed-in person's own row (their trees → CO₂ → weighted by regional AQI) and save it. */
    syncMine: function () {
      var p = MT.auth.profile(); if (!p || TRACKED.indexOf(p.role) < 0) return Promise.resolve(null);
      return Promise.all([MT.db.list('trees', { where: [['ownerId', '==', p.userId]], limit: 3000 }), p.orgId ? MT.db.get('orgs', p.orgId).catch(function () { return null; }) : Promise.resolve(null), MT.db.get('footprints', p.userId).catch(function () { return null; }), MT.db.get('ladder', p.userId).catch(function () { return null; })]).then(function (r) {
        var city = cityOf(r[0], p, r[1]); return MT.aqi.forCities([city]).then(function (m) { var row = buildRow(p, r[0], r[1], m, r[2] && r[2].kgPerYear); if (r[3] && r[3].hidden) row.hidden = true; return MT.db.set('ladder', p.userId, row).then(function () { return row; }); });
      });
    }
  };

  /* ---------- page ---------- */
  function render() {
    return '<div class="page ld-page" data-reveal><div class="page-head"><h2>Carbon ladder</h2><p class="muted">Climb the ladder by removing CO₂ with your trees. Cleaner-air regions are already doing well — so in dirtier-air regions every tree counts a little more.</p></div>' +
      '<div id="ld-me"></div><div class="tabs" id="ld-tabs"><a class="tab-link active" href="#/ladder" data-t="people">People</a><a class="tab-link" href="#/ladder" data-t="orgs">Schools & organisations</a><a class="tab-link" href="#/ladder" data-t="how">How it works</a></div><div id="ld-body">' + ui.skeleton(4, 'sk-line').s + '</div></div>';
  }
  function after(host) {
    var p = MT.auth.profile(), dead = false, tab = 'people', rows = [], aqi = {}, shown = 40, body = MT.$('#ld-body', host), meBox = MT.$('#ld-me', host), mine = null, tracked = TRACKED.indexOf(p.role) > -1;

    function aqiChip(city) { var a = aqi[city]; if (!a) return ''; var b = MT.aqi.band(a.aqi); return '<span class="badge badge-' + b.tone + '" title="' + esc(b.label) + ' · ' + (a.source === 'live' ? 'live from Open-Meteo' : 'typical value (live data unavailable)') + '">AQI ' + a.aqi + (a.source === 'live' ? '' : '*') + '</span>'; }
    function rungChip(c) { var r = rungOf(c); return '<span class="ld-rung" style="--c:' + r.color + '">' + ui.icon(r.icon).s + r.label + '</span>'; }
    function who(r) { return esc(r.label) + (r.role === 'student' && r.orgName ? ' <small class="muted">· ' + esc(r.orgName) + '</small>' : r.role !== 'individual' && r.role !== 'student' ? ' <small class="muted">· ' + esc(MT.ROLE_LABEL[r.role] || '') + '</small>' : ''); }
    function offset(r) { return r.footprintKg ? '<span class="fine">offsets ' + Math.min(999, Math.round(r.kgCo2 / r.footprintKg * 100)) + '% of own yearly footprint</span>' : ''; }

    function myCard() {
      if (!tracked) { meBox.innerHTML = '<div class="card ld-me"><p class="muted">The ladder ranks people and organisations that plant trees. ' + (p.role === 'seller' ? 'Sellers can browse it here.' : 'Super Admins can rebuild it below.') + '</p></div>' + (p.role === 'super_admin' ? '<div class="btn-row"><button class="btn btn-soft" id="ld-rebuild">' + ui.icon('refresh-cw').s + ' Rebuild ladder from tree data</button><span class="fine" id="ld-rb-msg"></span></div>' : ''); return; }
      if (!mine) { meBox.innerHTML = '<div class="card ld-me"><p class="muted">Calculating your position…</p></div>'; return; }
      var vis = rows.filter(function (x) { return PEOPLE.indexOf(x.role) > -1; }), rank = Math.max(1, vis.map(function (x) { return x.userId; }).indexOf(mine.userId) + 1) || 1, nx = nextRung(mine.credits), cur = rungOf(mine.credits), pct = nx ? Math.round((mine.credits - cur.min) / (nx.min - cur.min) * 100) : 100;
      meBox.innerHTML = '<section class="card ld-me"><div class="ld-me-main"><div>' + rungChip(mine.credits) + '<h3>' + fmt(mine.credits, 2) + ' carbon credits</h3><p class="muted">' + fmt(mine.kgCo2) + ' kg CO₂ removed · ' + mine.treesAlive + ' living trees · ' + esc(mine.city || 'your region') + ' ' + aqiChip(mine.city) + '</p>' +
        '<p class="fine">AQI weight ×' + mine.aqiMult + ' → score ' + fmt(mine.score) + (mine.hidden ? ' · <strong>you are hidden from the ladder</strong>' : '') + '</p></div><div class="ld-rank"><strong>#' + (mine.hidden ? '–' : rank) + '</strong><span>of ' + vis.length + '</span></div></div>' +
        (nx ? '<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '" aria-label="Progress to ' + nx.label + '"><span style="width:' + pct + '%"></span></div><p class="fine">' + fmt(nx.min - mine.credits, 1) + ' more credits to reach <strong>' + nx.label + '</strong></p>' : '<p class="fine">You are on the top rung. 🌳</p>') +
        (mine.footprintKg ? '<p class="fine">Your yearly footprint ≈ ' + fmt(mine.footprintKg / 1000, 2) + ' t CO₂ — your trees have removed ' + Math.round(mine.kgCo2 / mine.footprintKg * 100) + '% of that so far.</p>' : '') +
        '<div class="btn-row"><button class="btn btn-soft btn-sm" id="ld-fp">' + ui.icon('footprints').s + ' ' + (mine.footprintKg ? 'Update' : 'Add') + ' my carbon footprint</button><button class="btn btn-ghost btn-sm" id="ld-hide">' + (mine.hidden ? 'Show me on the ladder' : 'Hide me from the ladder') + '</button><button class="btn btn-ghost btn-sm" id="ld-refresh">Refresh my numbers</button>' + (p.role === 'super_admin' ? '' : '') + '</div></section>';
      ui.icons();
    }
    function row(r, i, rank) {
      var me = r.userId === p.userId;
      return '<li class="ld-row' + (me ? ' me' : '') + '"><span class="ld-n r' + (rank <= 3 ? rank : '') + '">' + rank + '</span><div class="ld-who"><strong>' + who(r) + (me ? ' <span class="badge badge-ok">you</span>' : '') + '</strong><span class="muted">' + esc(r.city || '—') + ' ' + aqiChip(r.city) + ' ' + offset(r) + '</span></div><div class="ld-score"><strong>' + fmt(r.credits, 2) + '</strong><span>credits · ' + fmt(r.kgCo2, 0) + ' kg</span></div>' + rungChip(r.credits) + '</li>';
    }
    function peopleTab() {
      var list = rows.filter(function (x) { return PEOPLE.indexOf(x.role) > -1; });
      if (!list.length) { body.innerHTML = ui.empty({ icon: 'leaf', title: 'Nobody on the ladder yet', text: 'Plant a tree and open this page — your row appears automatically.' }).s; return; }
      var top = list.slice(0, 10), rest = list.slice(10), podium = top.slice(0, 3), medals = ['🥇', '🥈', '🥉'];
      var html = '<h3 class="ld-h">Top 10</h3><div class="ld-podium">' + [1, 0, 2].filter(function (i) { return podium[i]; }).map(function (i) { var r = podium[i]; return '<article class="card ld-pod p' + (i + 1) + (r.userId === p.userId ? ' me' : '') + '"><span class="ld-medal" aria-hidden="true">' + medals[i] + '</span><h4>' + who(r) + '</h4><p class="muted">' + esc(r.city || '') + ' ' + aqiChip(r.city) + '</p><strong class="ld-big">' + fmt(r.credits, 1) + '</strong><span class="fine">credits · ' + fmt(r.kgCo2, 0) + ' kg CO₂</span>' + rungChip(r.credits) + '</article>'; }).join('') + '</div>';
      html += '<ol class="ld-list" start="4">' + top.slice(3).map(function (r, i) { return row(r, i, i + 4); }).join('') + '</ol>';
      if (rest.length) {
        html += '<h3 class="ld-h">The ladder — everyone else</h3><p class="muted">Rung by rung, from the highest down. ' + (mine && !mine.hidden ? '<button class="btn btn-ghost btn-sm" id="ld-find">Find me</button>' : '') + '</p><div class="ld-ladder">';
        var slice = rest.slice(0, shown), cur = '';
        slice.forEach(function (r, i) { var g = rungOf(r.credits); if (g.id !== cur) { if (cur) html += '</ol></div>'; cur = g.id; html += '<div class="ld-rungblock" style="--c:' + g.color + '"><h4 class="ld-rh">' + ui.icon(g.icon).s + ' ' + g.label + ' <small>' + (g.min ? '≥ ' + g.min + ' credits' : 'just starting') + '</small></h4><ol class="ld-list" start="' + (i + 11) + '">'; } html += row(r, i, i + 11); });
        html += '</ol></div></div>' + (rest.length > shown ? '<div class="btn-row"><button class="btn btn-soft" id="ld-more">Show more (' + (rest.length - shown) + ' below)</button></div>' : '');
      }
      body.innerHTML = html + '<p class="fine">* typical AQI shown when live air-quality data could not be reached. Credits are an educational estimate, not tradable offsets.</p>'; ui.icons();
    }
    function orgsTab() {
      var g = {}; rows.forEach(function (r) { if (!r.orgId) return; var o = g[r.orgId] = g[r.orgId] || { id: r.orgId, name: r.orgName || r.orgId, city: r.city, members: 0, kg: 0, score: 0, trees: 0 }; o.members++; o.kg += r.kgCo2; o.score += r.score; o.trees += r.treesAlive; });
      var list = Object.keys(g).map(function (k) { g[k].credits = g[k].score / CREDIT_KG; return g[k]; }).sort(function (a, b) { return b.score - a.score; });
      body.innerHTML = list.length ? '<ol class="ld-list">' + list.map(function (o, i) { var me = o.id === p.orgId; return '<li class="ld-row' + (me ? ' me' : '') + '"><span class="ld-n r' + (i < 3 ? i + 1 : '') + '">' + (i + 1) + '</span><div class="ld-who"><strong>' + esc(o.name) + (me ? ' <span class="badge badge-ok">your organisation</span>' : '') + '</strong><span class="muted">' + o.members + ' members · ' + o.trees + ' living trees · ' + esc(o.city || '') + ' ' + aqiChip(o.city) + '</span></div><div class="ld-score"><strong>' + fmt(o.credits, 1) + '</strong><span>credits · ' + fmt(o.kg, 0) + ' kg</span></div>' + rungChip(o.credits) + '</li>'; }).join('') + '</ol><p class="fine">Organisations are ranked by the combined credits of their members and their own trees.</p>' : ui.empty({ icon: 'building-2', title: 'No organisations yet', text: '' }).s; ui.icons();
    }
    function howTab() {
      body.innerHTML = '<div class="card"><h3>How your position is worked out</h3><ol class="plain-list"><li><strong>CO₂ removed.</strong> Every living tree absorbs CO₂ — a conservative estimate from its species and age (the same figure shown on your dashboard).</li><li><strong>Air-quality weight.</strong> We read the current <strong>US AQI</strong> for your region (the city where most of your trees are) from the free <a href="https://open-meteo.com/en/docs/air-quality-api" target="_blank" rel="noopener noreferrer">Open-Meteo Air Quality API</a>. Weight = 1 + (AQI − 50) ÷ 300, between ×1.00 (clean air) and ×1.50 (AQI 200+).</li><li><strong>Score and credits.</strong> Score = kg CO₂ × weight. <strong>1 carbon credit = ' + CREDIT_KG + ' kg</strong> of weighted CO₂ removed.</li><li><strong>Rungs.</strong> ' + RUNGS.map(function (r) { return r.label + ' (' + r.min + '+)'; }).join(' → ') + '.</li><li><strong>Your footprint.</strong> Optionally enter a yearly footprint estimate to see how much of it your trees offset.</li></ol><p class="fine">Credits are a motivational showcase. They are not tradable, not verified by any registry and not a certified carbon offset. Rows show first name + initial only; you can hide yourself any time. If live AQI cannot be reached the page uses a typical value for the city and marks it with *.</p></div>'; ui.icons();
    }
    function paint() { ({ people: peopleTab, orgs: orgsTab, how: howTab }[tab])(); }

    function load() {
      return MT.db.list('ladder', { limit: 3000 }).then(function (r) { rows = r.filter(function (x) { return !x.hidden; }).sort(function (a, b) { return b.score - a.score; }); mine = r.filter(function (x) { return x.userId === p.userId; })[0] || null;
        return MT.aqi.forCities(rows.map(function (x) { return x.city; }).concat(mine ? [mine.city] : [])); }).then(function (m) { aqi = m; });
    }
    function syncAndPaint() {
      return (tracked ? MT.ladder.syncMine().catch(function () { return null; }) : Promise.resolve(null)).then(function () { return load(); }).then(function () { if (dead) return; myCard(); paint(); });
    }
    /* footprint calculator: documented factors (kg CO₂e); India grid ≈ 0.71 kg/kWh */
    var DIET = { veg: 1100, mixed: 1700, nonveg: 2200 };
    function footprintForm() {
      MT.db.get('footprints', p.userId).catch(function () { return null; }).then(function (f) {
        var i = (f && f.inputs) || { kwh: 150, car: 0, bike: 40, bus: 30, flights: 1, lpg: 6, diet: 'mixed' };
        kit.form({ title: 'My carbon footprint', submit: 'Save', html:
          '<p class="field-wide muted">A quick yearly estimate. The India average is roughly 2,000 kg CO₂ per person per year.</p>' +
          [['kwh', 'Electricity (kWh per month)', 0, 5000], ['car', 'Car (km per week)', 0, 5000], ['bike', 'Two-wheeler (km per week)', 0, 5000], ['bus', 'Bus / train (km per week)', 0, 5000], ['flights', 'Flights per year (≈1,000 km each)', 0, 200], ['lpg', 'LPG cylinders per year', 0, 100]].map(function (x) { return '<div class="field"><label for="fp-' + x[0] + '">' + x[1] + '</label><input id="fp-' + x[0] + '" name="' + x[0] + '" type="number" min="' + x[2] + '" max="' + x[3] + '" step="any" value="' + i[x[0]] + '"></div>'; }).join('') +
          '<div class="field"><label for="fp-diet">Diet</label><select id="fp-diet" name="diet"><option value="veg"' + (i.diet === 'veg' ? ' selected' : '') + '>Vegetarian</option><option value="mixed"' + (i.diet === 'mixed' ? ' selected' : '') + '>Mixed</option><option value="nonveg"' + (i.diet === 'nonveg' ? ' selected' : '') + '>Meat-heavy</option></select></div><p class="field-wide fine">Your total appears on the ladder only as “offsets X % of own footprint”.</p>',
          onSubmit: function (v) {
            var n = function (k) { return Math.max(0, +v[k] || 0); }, kg = n('kwh') * 12 * 0.71 + n('car') * 52 * 0.17 + n('bike') * 52 * 0.04 + n('bus') * 52 * 0.06 + n('flights') * 150 + n('lpg') * 42.6 + (DIET[v.diet] || 1700);
            var inputs = { kwh: n('kwh'), car: n('car'), bike: n('bike'), bus: n('bus'), flights: n('flights'), lpg: n('lpg'), diet: v.diet };
            return MT.db.set('footprints', p.userId, { userId: p.userId, kgPerYear: Math.round(kg), inputs: inputs, updatedAt: Date.now() }).then(function () { ui.success('Saved: about ' + fmt(kg / 1000, 2) + ' t CO₂ per year.'); return syncAndPaint(); });
          } });
      });
    }
    function rebuildAll(msg) {
      var users = [], trees = {}, n = 0, orgs = {};
      function paged(col, each) { function next(after) { var q = { orderBy: ['__name__'], limit: 500 }; if (after !== undefined) q.after = after; return MT.db.list(col, q).then(function (r) { r.forEach(each); n += r.length; msg('Reading ' + col + '… ' + n); return r.length === 500 ? next(r[r.length - 1].id) : null; }); } return next(); }
      return paged('orgs', function (o) { orgs[o.id] = o; }).then(function () { return paged('users', function (u) { if (TRACKED.indexOf(u.role) > -1 && u.active !== false) users.push(u); }); }).then(function () { return paged('trees', function (t) { (trees[t.ownerId] = trees[t.ownerId] || []).push(t); }); }).then(function () { return paged('footprints', function (f) { orgs['fp_' + f.userId] = f; }); }).then(function () {
        var cities = users.map(function (u) { return cityOf(trees[u.userId] || [], u, orgs[u.orgId]); }); return MT.aqi.forCities(cities).then(function (m) {
          var b = MT.db.batch(); users.forEach(function (u) { var f = orgs['fp_' + u.userId]; b.set('ladder', u.userId, buildRow(u, trees[u.userId] || [], orgs[u.orgId], m, f && f.kgPerYear)); }); msg('Writing ' + users.length + ' rows…'); return b.commit().then(function () { return users.length; }); });
      });
    }

    host.addEventListener('click', function (e) {
      var t;
      if ((t = e.target.closest('#ld-tabs [data-t]'))) { e.preventDefault(); tab = t.dataset.t; MT.$$('#ld-tabs .tab-link', host).forEach(function (x) { x.classList.toggle('active', x === t); }); paint(); }
      else if (e.target.closest('#ld-more')) { shown += 60; paint(); }
      else if (e.target.closest('#ld-find')) { var el = MT.$('.ld-row.me', host); if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); else ui.toast('You are in the Top 10 or hidden.'); }
      else if (e.target.closest('#ld-fp')) footprintForm();
      else if (e.target.closest('#ld-refresh')) { ui.toast('Refreshing…'); syncAndPaint().then(function () { ui.success('Numbers refreshed.'); }); }
      else if (e.target.closest('#ld-hide')) MT.db.update('ladder', p.userId, { hidden: !mine.hidden }).then(function () { ui.success(mine.hidden ? 'You are visible again.' : 'You are hidden from the ladder.'); return syncAndPaint(); }).catch(ui.error);
      else if (e.target.closest('#ld-rebuild')) { var m = MT.$('#ld-rb-msg', host); e.target.closest('button').disabled = true; rebuildAll(function (x) { m.textContent = x; }).then(function (c) { m.textContent = 'Done — ' + c + ' rows rebuilt.'; ui.success('Ladder rebuilt.'); return syncAndPaint(); }).catch(function (er) { m.textContent = ''; ui.error(er); }).then(function () { var b = MT.$('#ld-rebuild', host); if (b) b.disabled = false; }); }
    });
    syncAndPaint().catch(function (e) { body.innerHTML = '<p class="muted">' + esc(MT.friendlyError(e)) + '</p>'; });
    return function () { dead = true; };
  }

  MT.router.add('/ladder', { title: 'Carbon ladder', layout: 'app', access: ['super_admin', 'foundation', 'school', 'institution', 'student', 'individual', 'seller'], render: render, after: after });
})();
