/**
 * MyTree — Carbon ladder engine (no UI, loaded eagerly so it can run after ANY tree activity).
 *
 * A person's ladder row is always derived from their trees — nobody types numbers in:
 *   kg CO₂ removed  = Σ over living trees of species × age (MT.species.co2Total); a newly planted tree counts as one year of growth straight away, so planting is rewarded at once
 *   AQI weight      = MT.aqi.multiplier(AQI of the city where most of their trees are)   (1.00 … 1.50)
 *   score = kg × weight;   credits = score ÷ 10  (1 credit = 10 kg weighted CO₂ — an educational showcase, not a tradable offset)
 * Rows (`ladder/{userId}`) are recomputed automatically when trees are planted, updated, lost, deleted or imported (MT.ladder.touch), when a person signs in
 * and their row is more than 12 hours old (trees keep growing), and by the Super Admin's rebuild.
 */
(function () {
  'use strict';
  var MT = window.MT, CREDIT_KG = 10, TRACKED = ['individual', 'student', 'foundation', 'school', 'institution'], AVG_FOOTPRINT_KG = 2000; /* rough India per-person yearly average, for context only */
  var RUNGS = [
    { id: 'seed', label: 'Seed', min: 0, icon: 'sprout', color: '#8a6a4a' }, { id: 'sprout', label: 'Sprout', min: 1, icon: 'leaf', color: '#4fbf4a' }, { id: 'sapling', label: 'Sapling', min: 5, icon: 'trees', color: '#2e9e5b' },
    { id: 'grove', label: 'Grove', min: 15, icon: 'tree-pine', color: '#1f8a50' }, { id: 'forest', label: 'Forest', min: 40, icon: 'mountain', color: '#17808c' }, { id: 'canopy', label: 'Canopy', min: 100, icon: 'cloud-sun', color: '#c9a227' },
    { id: 'rainforest', label: 'Rainforest', min: 250, icon: 'crown', color: '#b8421a' }];

  function roleOfId(id) { id = String(id || ''); return /^MT-STU-/.test(id) ? 'student' : /^MT-IND-/.test(id) ? 'individual' : /^MT-FND-/.test(id) ? 'foundation' : /^MT-SCH-/.test(id) ? 'school' : /^MT-INS-/.test(id) ? 'institution' : ''; }
  function cityOf(trees, fallback) { var m = {}, best = '', n = 0; trees.forEach(function (t) { if (t.city) { m[t.city] = (m[t.city] || 0) + 1; if (m[t.city] > n) { n = m[t.city]; best = t.city; } } }); return best || fallback || ''; }

  function buildRow(u, trees, orgName, aqiMap, keep) {
    var alive = trees.filter(function (t) { return t.status !== 'dead'; }), kg = alive.reduce(function (a, t) { return a + MT.species.co2Total(t.speciesId, Math.max(1, MT.species.ageYears(t.plantedOn))); }, 0);
    var city = cityOf(trees, u.city), a = (aqiMap && aqiMap[city]) || { aqi: MT.aqi.typical(city), source: 'typical' }, mult = MT.aqi.multiplier(a.aqi), score = kg * mult;
    return { userId: u.userId, label: MT.stats.shortName(u.name), role: u.role, orgId: u.orgId || '', orgName: orgName || '', ancestorOrgIds: u.ancestorOrgIds || [], city: city, state: (MT.geoData.city(city) || {}).state || '', trees: trees.length, treesAlive: alive.length,
      kgCo2: Math.round(kg * 10) / 10, aqi: a.aqi, aqiSource: a.source, aqiMult: Math.round(mult * 100) / 100, score: Math.round(score * 10) / 10, credits: Math.round(score / CREDIT_KG * 100) / 100, hidden: !!(keep && keep.hidden), updatedAt: Date.now() };
  }

  /** Recompute and save the rows of these tree owners ({userId, name, orgId, ancestorOrgIds, role?}). Silent and best-effort — never blocks or fails the action that triggered it. */
  function touch(owners) {
    var me = MT.auth.profile(); if (!me || !owners || !owners.length) return Promise.resolve();
    var seen = {}, list = owners.filter(function (o) { if (!o || !o.userId || seen[o.userId]) return false; seen[o.userId] = 1; o.role = o.role || roleOfId(o.userId); return TRACKED.indexOf(o.role) > -1; }).slice(0, 40);
    return list.reduce(function (p, o) {
      return p.then(function () {
        var own = o.userId === me.userId, where = own ? [['ownerId', '==', o.userId]] : me.role === 'super_admin' ? [['ownerId', '==', o.userId]] : [['ancestorOrgIds', 'array-contains', me.orgId], ['ownerId', '==', o.userId]];
        return Promise.all([MT.db.list('trees', { where: where, limit: 3000 }), MT.db.get('ladder', o.userId).catch(function () { return null; }), o.orgId ? MT.db.get('orgs', o.orgId).catch(function () { return null; }) : Promise.resolve(null)]).then(function (r) {
          var city = cityOf(r[0], o.city); return MT.aqi.forCities([city]).then(function (m) { return MT.db.set('ladder', o.userId, buildRow(o, r[0], (r[2] && r[2].name) || '', m, r[1])); });
        });
      });
    }, Promise.resolve()).catch(function () { /* the ladder catches up at the next sign-in or rebuild */ });
  }
  /** Convenience for tree docs (owner details live on the tree). */
  function touchTrees(trees) { return touch(trees.map(function (t) { return { userId: t.ownerId, name: t.ownerName || '', orgId: t.orgId || '', ancestorOrgIds: t.ancestorOrgIds || [], city: t.city }; })); }
  /** Keep my own row fresh as my trees grow: refresh when it is older than `maxAge` (default 12 h). */
  function refreshMine(maxAge) {
    var p = MT.auth.profile(); if (!p || TRACKED.indexOf(p.role) < 0) return Promise.resolve();
    return MT.db.get('ladder', p.userId).catch(function () { return null; }).then(function (row) { if (row && Date.now() - (row.updatedAt || 0) < (maxAge || 12 * 3600000)) return; return touch([p]); });
  }

  MT.ladder = { RUNGS: RUNGS, CREDIT_KG: CREDIT_KG, TRACKED: TRACKED, AVG_FOOTPRINT_KG: AVG_FOOTPRINT_KG, rungOf: function (c) { var r = RUNGS[0]; RUNGS.forEach(function (x) { if (c >= x.min) r = x; }); return r; }, nextRung: function (c) { return RUNGS.filter(function (x) { return x.min > c; })[0] || null; },
    roleOfId: roleOfId, cityOf: cityOf, buildRow: buildRow, touch: touch, touchTrees: touchTrees, refreshMine: refreshMine, syncMine: function () { var p = MT.auth.profile(); return touch([p]).then(function () { return MT.db.get('ladder', p.userId); }); } };
})();
