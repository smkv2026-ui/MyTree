/**
 * MyTree — demo growth updates (6–12 months), tiny illustrative SVG photos and update counters.
 * Registered through MT.seed.extend so it runs after the base seed. Deterministic (seeded RNG).
 */
(function () {
  'use strict';
  var MT = window.MT, DAY = 86400000;
  var NOTES = ['Watered and mulched around the base.', 'New leaves are coming out nicely.', 'Replaced the tree guard.', 'Pulled out the weeds around it.', 'Grew about a hand taller this month!', 'Monsoon rains helped a lot.', 'Spotted a few insects — sprayed neem water.', 'Added compost.', 'Straightened the support stake.', 'A bird has made a nest in it. 🐦', 'Leaves look a little yellow, watering more.', 'Pruned the dry twigs.'];
  var BAD = ['Leaves are drooping — needs water.', 'Termites at the base, asked for help.', 'Goats nibbled the branches.', 'Very dry weather, leaves are curling.'];
  var DEAD = ['Sadly it has dried up completely.', 'Did not survive the summer heat.'];
  var COL = { thriving: ['#2e9e5b', '#58c488'], healthy: ['#4aa66b', '#79c593'], needs_care: ['#c9a227', '#e3c25a'], struggling: ['#d9822b', '#e9a45a'], dead: ['#8d8576', '#aaa294'] };

  /** Small illustrative scene; `stage` 0..1 makes the tree bigger so before/after comparisons look real. */
  function svg(stage, health, tag) {
    var c = COL[health] || COL.healthy, th = 30 + stage * 70, r = 14 + stage * 40, cx = 160, gy = 200;
    var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfe9f7"/><stop offset="1" stop-color="#eaf6ee"/></linearGradient></defs><rect width="320" height="240" fill="url(#s)"/><ellipse cx="160" cy="205" rx="150" ry="34" fill="#8fbf7a"/><rect y="205" width="320" height="35" fill="#7aa866"/>' +
      '<path d="M160 ' + gy + 'V' + (gy - th) + '" stroke="#8b5e3c" stroke-width="' + (4 + stage * 8) + '" stroke-linecap="round"/>' +
      '<circle cx="' + cx + '" cy="' + (gy - th) + '" r="' + r.toFixed(0) + '" fill="' + c[0] + '"/><circle cx="' + (cx - r * 0.55).toFixed(0) + '" cy="' + (gy - th + r * 0.3).toFixed(0) + '" r="' + (r * 0.65).toFixed(0) + '" fill="' + c[1] + '"/><circle cx="' + (cx + r * 0.55).toFixed(0) + '" cy="' + (gy - th + r * 0.2).toFixed(0) + '" r="' + (r * 0.6).toFixed(0) + '" fill="' + c[1] + '" opacity=".9"/>';
    if (health === 'dead') s += '<path d="M120 190l80-60M200 190l-80-60" stroke="#6b6458" stroke-width="3" opacity=".5"/>';
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(s + '<text x="10" y="228" font-family="Arial" font-size="11" fill="#2b3d34" opacity=".6">' + tag + '</text></svg>');
  }

  MT.seed.extend.push(function (db, ctx) {
    var rnd = MT.rng(77), now = ctx.now, trees = db._raw('trees'), users = ctx.users, adminOf = {};
    users.forEach(function (u) { if (u.userId === u.orgId) adminOf[u.orgId] = u; });
    var upd = [], photos = [], pdata = [], stats = db._raw('stats'), dil = {};
    var thisMonth = new Date(now).toISOString().slice(0, 7);
    function bump(key, n) { var d = stats[key] = stats[key] || {}; d.updates = (d.updates || 0) + n; }
    function ownerDil(id) { if (dil[id] == null) { var x = 0; for (var i = 0; i < id.length; i++) x = (x * 31 + id.charCodeAt(i)) % 97; dil[id] = 0.3 + (x / 97) * 0.75; } return dil[id]; }

    Object.keys(trees).forEach(function (code) {
      var t = trees[code], planted = new Date(t.plantedOn + 'T12:00:00').getTime(), days = (now - planted) / DAY, cad = MT.cadence.DAYS[t.cadence];
      var n = Math.min(14, Math.floor(days / cad * ownerDil(t.ownerId)));
      if (t.status === 'dead' && n < 1 && days > 20) n = 1;
      t.initialHeightCm = 30 + Math.floor(rnd() * 25);
      if (n < 1) return;
      var lastGap = rnd() * cad * (ownerDil(t.ownerId) > 0.7 ? 0.9 : 1.8), last = Math.max(planted + DAY, now - lastGap * DAY), first = Math.min(last, planted + cad * 0.8 * DAY);
      var hasPhotos = rnd() < 0.12, hf = t.heightCm, h0 = t.initialHeightCm, ids = [];
      var admin = adminOf[t.orgId], behalf = admin && t.ownerId !== admin.userId && rnd() < 0.15;
      for (var k = 0; k < n; k++) {
        var frac = n === 1 ? 1 : k / (n - 1), at = first + (last - first) * frac, date = new Date(at).toISOString().slice(0, 10);
        var isLast = k === n - 1, health;
        if (isLast) health = t.health; else if (t.health === 'dead' || t.health === 'struggling') health = frac > 0.6 ? 'needs_care' : (rnd() < 0.5 ? 'healthy' : 'thriving'); else if (t.health === 'needs_care') health = frac > 0.7 ? 'needs_care' : 'healthy'; else health = rnd() < 0.5 ? 'thriving' : 'healthy';
        var growth = Math.pow(frac, 1.1), hh = Math.round(h0 + (hf - h0) * growth + (isLast ? 0 : (rnd() - 0.5) * 6));
        var u = { treeId: code, ownerId: t.ownerId, orgId: t.orgId, ancestorOrgIds: t.ancestorOrgIds, postedBy: behalf ? admin.userId : t.ownerId, postedByName: behalf ? admin.name : t.ownerName, onBehalfOf: behalf ? t.ownerId : '', onBehalfOfName: behalf ? t.ownerName : '',
          date: date, heightCm: Math.max(h0, hh), health: health, notes: t.status === 'dead' && isLast ? DEAD[n % 2] : ((health === 'needs_care' || health === 'struggling') ? BAD[Math.floor(rnd() * BAD.length)] : (rnd() < 0.7 ? NOTES[Math.floor(rnd() * NOTES.length)] : '')),
          photoIds: [], kind: t.status === 'dead' && isLast ? 'dead' : 'update', createdAt: at };
        if (days > 150) u.girthCm = Math.round(u.heightCm * 0.07 * 10) / 10;
        if (hasPhotos && (k === 0 || isLast || k === Math.floor(n / 2))) {
          var pid = 'p_' + code.slice(5).replace('-', '') + '_' + k, img = svg(Math.min(1, 0.1 + frac * 0.9), health, code);
          var base = { treeId: code, ownerId: t.ownerId, orgId: t.orgId, ancestorOrgIds: t.ancestorOrgIds, createdAt: at };
          photos.push(Object.assign({ id: pid, thumb: img, size: img.length, width: 320, height: 240, kind: 'update', note: '' }, base)); pdata.push(Object.assign({ id: pid, data: img }, base));
          u.photoIds.push(pid); u.cover = img; ids.push(pid);
        }
        u.id = 'u_' + code.slice(5).replace('-', '') + '_' + k; upd.push(u);
        bump('global', 1); bump('month_' + date.slice(0, 7), 1); t.ancestorOrgIds.forEach(function (a) { bump('org_' + a, 1); });
        if (date.slice(0, 7) === thisMonth) stats.global.updatesThisMonth = (stats.global.updatesThisMonth || 0) + 1;
        if (isLast) { t.lastUpdateAt = at; t.heightCm = u.heightCm; if (u.girthCm) t.girthCm = u.girthCm; }
      }
      t.updatesCount = n;
      if (ids.length) { t.coverPhotoId = ids[ids.length - 1]; t.cover = photos[photos.length - 1].thumb; t.photoSize = photos[photos.length - 1].size; }
    });
    // SIMULATED green-cover readings (labelled as such everywhere in the UI; never used for headline numbers)
    var gcr = []; (ctx.plots || []).forEach(function (pl, pi) {
      var from = new Date(pl.baselineOn + 'T12:00:00').getTime(), steps = 7;
      for (var i = 0; i <= steps; i++) { var at = from + (now - from) * i / steps; gcr.push({ id: 'g_' + pi + '_' + i, plotId: pl.id, method: 'simulated', pct: Math.round((12 + 30 * Math.pow(i / steps, 1.3) + (rnd() - 0.5) * 3) * 10) / 10, date: new Date(at).toISOString().slice(0, 10), photoId: '', ownerId: pl.ownerId, orgId: pl.orgId, ancestorOrgIds: pl.ancestorOrgIds, createdBy: 'seed', createdAt: at, simulated: true }); }
    });
    db._bulk('greenCoverReadings', gcr);
    db._bulk('treeUpdates', upd); db._bulk('photos', photos); db._bulk('photoData', pdata);
    stats.global.photos = photos.length; stats.global.photoBytes = photos.reduce(function (a, p) { return a + p.size; }, 0) * 2;
    var uk = Object.keys(stats); void uk;
  });
})();
