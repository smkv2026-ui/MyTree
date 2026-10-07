/**
 * MyTree — denormalised counters (no Cloud Functions on the free plan).
 * Every tree write adds the matching increments to the SAME batch, so counters and data commit atomically.
 * Documents (all in `stats/`):
 *   global · org_<orgId> (one per ancestor org) · region_<state-slug> · city_<city-slug> (public, anonymised) · month_<yyyy-mm> · user_<userId>
 * Fields: trees, treesAlive, treesDead, h_<health>, sumPlantedDayAlive (Σ day-number of planting of live trees — gives tree-years
 * as N·today − Σ without reading trees), photos, bytes (+ photoBytes on global).
 */
(function () {
  'use strict';
  var MT = window.MT, DAY = 86400000;
  var slug = function (s) { return MT.geoData.slug(s); };

  var S = (MT.stats = {
    /** Privacy-friendly display name for leaderboards: first name + last initial. */
    shortName: function (n) { var p = String(n || '').trim().split(/\s+/); return p.length > 1 ? p[0] + ' ' + p[p.length - 1][0] + '.' : (p[0] || ''); },
    keysFor: function (t) {
      var k = ['global'];
      (t.ancestorOrgIds || []).forEach(function (a) { k.push('org_' + a); });
      if (t.state) k.push('region_' + slug(t.state));
      if (t.city) k.push('city_' + slug(t.city));
      if (t.plantedOn) k.push('month_' + t.plantedOn.slice(0, 7));
      if (t.ownerId) k.push('user_' + t.ownerId);
      return k;
    },
    fieldsFor: function (t, sign) {
      var f = {}, dead = t.status === 'dead';
      f.trees = sign; f[dead ? 'treesDead' : 'treesAlive'] = sign; f['h_' + (t.health || 'healthy')] = sign;
      if (!dead) f.sumPlantedDayAlive = sign * Math.floor(new Date(t.plantedOn).getTime() / DAY);
      return f;
    },
    meta: function (key, t) {
      if (key.indexOf('city_') === 0) { var m = { kind: 'city', name: t.city, state: t.state || '' }; if (t.cityLat != null) { m.lat = t.cityLat; m.lng = t.cityLng; } return m; }
      if (key.indexOf('region_') === 0) return { kind: 'region', name: t.state };
      if (key.indexOf('org_') === 0) return { kind: 'org' };
      if (key.indexOf('month_') === 0) return { kind: 'month' };
      if (key.indexOf('user_') === 0) return { kind: 'user', orgId: t.orgId || '', label: S.shortName(t.ownerName) };
      return {};
    },
    /**
     * Add counter changes to `batch`.
     * @param {Array<{tree:Object, sign:1|-1}>} entries one per tree added (+1), removed (−1) or state-changed (remove old, add new)
     */
    apply: function (batch, entries) {
      var agg = {};
      entries.forEach(function (e) {
        var f = S.fieldsFor(e.tree, e.sign);
        S.keysFor(e.tree).forEach(function (k) {
          var a = agg[k] = agg[k] || { fields: {}, meta: {} };
          if (e.sign > 0) a.meta = Object.assign(a.meta, S.meta(k, e.tree));
          Object.keys(f).forEach(function (x) { a.fields[x] = (a.fields[x] || 0) + f[x]; });
        });
      });
      var sp = {}; entries.forEach(function (e) { if (e.tree.status !== 'dead') sp[e.tree.speciesId] = (sp[e.tree.speciesId] || 0) + e.sign; });
      if (Object.keys(sp).length) { var sd = { kind: 'species' }; Object.keys(sp).forEach(function (k) { sd[k] = MT.db.inc(sp[k]); }); batch.set('stats', 'species', sd, { merge: true }); }
      Object.keys(agg).forEach(function (k) {
        var d = Object.assign({}, agg[k].meta);
        Object.keys(agg[k].fields).forEach(function (x) { d[x] = MT.db.inc(agg[k].fields[x]); });
        batch.set('stats', k, d, { merge: true });
      });
    },
    /** Photo storage accounting. */
    photo: function (batch, ownerId, bytes, sign) {
      sign = sign || 1;
      batch.set('stats', 'global', { photos: MT.db.inc(sign), photoBytes: MT.db.inc(sign * bytes) }, { merge: true });
      batch.set('stats', 'user_' + ownerId, { kind: 'user', photos: MT.db.inc(sign), bytes: MT.db.inc(sign * bytes) }, { merge: true });
    },
    /** Platform-wide estimate of CO₂ absorbed to date (kg) from counters only. */
    co2FromGlobal: function (g) {
      var today = Math.floor(Date.now() / DAY);
      var ty = Math.max(0, ((g.treesAlive || 0) * today - (g.sumPlantedDayAlive || 0)) / 365.25);
      return Math.round(ty * MT.species.AVG_CO2_PER_TREE_YEAR);
    }
  });
})();
