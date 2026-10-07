/**
 * MyTree — tree domain service (no UI). Used by the planting stepper now and by bulk import / updates later.
 *   MT.trees.plant(opts)       create N trees (+plot, photo, counters, audit) in ONE atomic batch
 *   MT.trees.remove(trees)     delete trees (+ counters, + photos) — callers show an undo toast first
 *   MT.trees.update(tree, patch)
 *   MT.trees.scopeFor(profile) rule-provable query scope for listing trees
 */
(function () {
  'use strict';
  var MT = window.MT;
  var MAX_PER_POST = 100;

  function clip(s, n) { return String(s == null ? '' : s).trim().slice(0, n); }
  /** Spiral jitter so N saplings in one plot do not sit on one pixel (≈0.9 m · √i apart); each can be moved later. */
  function jitter(lat, lng, i) {
    if (!i) return { lat: lat, lng: lng };
    var r = 0.9 * Math.sqrt(i), a = i * 2.39996;
    return { lat: lat + (r * Math.sin(a)) / 111320, lng: lng + (r * Math.cos(a)) / (111320 * Math.cos(lat * Math.PI / 180)) };
  }
  function round6(x) { return Math.round(x * 1e6) / 1e6; }

  var T = (MT.trees = {
    MAX_PER_POST: MAX_PER_POST,
    CADENCES: [['weekly', 'Weekly'], ['monthly', 'Monthly'], ['yearly', 'Yearly']],
    HEALTHS: ['thriving', 'healthy', 'needs_care', 'struggling', 'dead'],
    /** City/state for counters: nearest known city when inside its radius, else reverse-geocode result. */
    placeFor: function (lat, lng, geo) {
      var n = MT.geocode.nearestCity(lat, lng);
      if (n && n.inside) return { city: n.city.name, state: n.city.state, cityLat: n.city.lat, cityLng: n.city.lng };
      if (geo && (geo.city || geo.state)) return { city: geo.city || '', state: geo.state || '', cityLat: lat, cityLng: lng };
      return { city: '', state: '' };
    },
    scopeFor: function (p) {
      p = p || MT.auth.profile();
      if (p.role === 'super_admin') return [];
      if (MT.ORG_TYPES.indexOf(p.role) > -1) return [['ancestorOrgIds', 'array-contains', p.orgId]];
      return [['ownerId', '==', p.userId]];
    },
    /**
     * Pure builder (no I/O): tree docs (+ plot doc) for one planting row. `codes` are the pre-reserved IDs (one per sapling).
     * Used by plant() and by bulk import. @returns {{trees:Object[], plotId:string, plot:Object|null, place:Object}}
     */
    /** Strip helper fields (used only for counters) before writing a tree doc. */
    stored: function (t) { var d = Object.assign({}, t); delete d.cityLat; delete d.cityLng; return d; },
    build: function (o, codes, x) {
      x = x || {}; var me = MT.auth.profile(), owner = o.owner || me, onBehalf = owner.userId !== me.userId, count = codes.length, now = Date.now();
      var sp = MT.species.get(o.speciesId), place = T.placeFor(o.lat, o.lng, o.geo), photoId = x.photoId || '';
      var plotId = (count > 1 || (o.polygon && o.polygon.length > 2)) ? 'PLOT-' + codes[0].slice(5) : '';
      var canPublic = owner.role !== 'student' && me.role !== 'student';
      var trees = codes.map(function (code, i) {
        var pos = jitter(o.lat, o.lng, i);
        var t = {
          code: code, speciesId: sp.id, ownerId: owner.userId, ownerName: owner.name, postedBy: me.userId, onBehalfOf: onBehalf ? owner.userId : '',
          orgId: owner.orgId || '', ancestorOrgIds: owner.ancestorOrgIds || [], lat: round6(pos.lat), lng: round6(pos.lng), geohash: MT.geo.geohash(pos.lat, pos.lng, 9),
          city: place.city, state: place.state, address: clip(o.address, 300), plantedOn: o.plantedOn, status: 'alive', health: 'healthy', cadence: o.cadence || 'monthly',
          heightCm: Math.max(0, Math.min(5000, Math.round(+o.heightCm || 30))), initialHeightCm: Math.max(0, Math.min(5000, Math.round(+o.heightCm || 30))), lastUpdateAt: 0, updatesCount: 0, plotId: plotId, public: !!(o.public && canPublic),
          dedication: clip(o.dedication, 200), notes: clip(o.notes, 500), createdAt: now, cityLat: place.cityLat, cityLng: place.cityLng
        };
        if (sp.id === 'other') t.customName = clip(o.customName || 'Unnamed tree', 60);
        if (photoId) { t.coverPhotoId = photoId; t.cover = o.photo.cover; t.photoSize = o.photo.size; }
        if (o.geoFlag) t.geoFlag = o.geoFlag;
        if (o.replaces && i === 0) t.replaces = o.replaces;
        return t;
      });
      var plot = plotId ? { name: clip(o.plotName, 80) || (sp.common + ' plot'), ownerId: owner.userId, orgId: owner.orgId || '', ancestorOrgIds: owner.ancestorOrgIds || [], city: place.city, state: place.state, polygon: o.polygon || [], areaM2: Math.round(o.areaM2 || 0), center: { lat: round6(o.lat), lng: round6(o.lng) }, baselineOn: o.plantedOn, baselinePhotoIds: photoId ? [photoId] : [], treeCount: count, createdBy: me.userId, createdAt: now } : null;
      return { trees: trees, plotId: plotId, plot: plot, place: place };
    },
    /**
     * @param {Object} o {owner (profile-like: userId,name,orgId,ancestorOrgIds,role), speciesId, customName, count, lat, lng, address, geo, polygon[{lat,lng}], areaM2,
     *                    plantedOn 'YYYY-MM-DD', heightCm, dedication, notes, cadence, public, photo (MT.photoStore.prepare result), geoFlag}
     * @returns {Promise<{trees:Object[], photoId:string, plotId:string}>}
     */
    plant: function (o) {
      var me = MT.auth.profile(), owner = o.owner || me, onBehalf = owner.userId !== me.userId;
      var count = Math.max(1, Math.min(MAX_PER_POST, parseInt(o.count, 10) || 1));
      if (!MT.auth.isActive()) return Promise.reject(MT.userError('Your account is not active yet.'));
      if (isNaN(o.lat) || isNaN(o.lng)) return Promise.reject(MT.userError('Please choose a location on the map.'));
      var sp = MT.species.get(o.speciesId), place = T.placeFor(o.lat, o.lng, o.geo), now = Date.now();
      return MT.ids.trees(count).then(function (codes) {
        var b = MT.db.batch(), now = Date.now();
        var photoId = o.photo ? MT.photoStore.store(b, o.photo, { treeId: codes[0], ownerId: owner.userId, orgId: owner.orgId || '', ancestorOrgIds: owner.ancestorOrgIds || [] }) : '';
        var made = T.build(o, codes, { photoId: photoId });
        var trees = made.trees, plotId = made.plotId;
        trees.forEach(function (t) { b.set('trees', t.code, T.stored(t)); });
        if (o.replaces) b.update('trees', o.replaces, { replacedBy: codes[0] });
        if (made.plot) b.set('plots', plotId, made.plot);
        MT.stats.apply(b, trees.map(function (t) { return { tree: t, sign: 1 }; }));
        if (onBehalf) MT.audit.add(b, { action: 'tree.plant', targetType: 'tree', targetId: codes[0], onBehalfOfId: owner.userId, onBehalfOfName: owner.name, detail: count + ' × ' + (o.customName || sp.common), orgId: owner.orgId, ancestorOrgIds: owner.ancestorOrgIds });
        return b.commit().then(function () { MT.due.invalidate(); return { trees: trees.map(function (t) { return Object.assign({ id: t.code }, t); }), photoId: photoId, plotId: plotId }; });
      });
    },
    /** Delete trees (and their counters). Photos are removed when this was the only tree they belonged to. */
    remove: function (trees) {
      var me = MT.auth.profile(), b = MT.db.batch();
      trees.forEach(function (t) {
        b.delete('trees', t.id || t.code);
        if (t.coverPhotoId && !t.plotId) MT.photoStore.remove(b, t.coverPhotoId, { ownerId: t.ownerId, size: t.photoSize || 0 });
      });
      MT.stats.apply(b, trees.map(function (t) { return { tree: t, sign: -1 }; }));
      var other = trees.filter(function (t) { return t.ownerId !== me.userId; })[0];
      if (other) MT.audit.add(b, { action: 'tree.delete', targetType: 'tree', targetId: other.code, onBehalfOfId: other.ownerId, onBehalfOfName: other.ownerName, detail: trees.length + ' tree(s) deleted', orgId: other.orgId, ancestorOrgIds: other.ancestorOrgIds });
      return b.commit().then(function () { MT.due.invalidate(); });
    },
    update: function (tree, patch) {
      var me = MT.auth.profile(), b = MT.db.batch();
      b.update('trees', tree.id || tree.code, patch);
      if (tree.ownerId !== me.userId) MT.audit.add(b, { action: 'tree.edit', targetType: 'tree', targetId: tree.code, onBehalfOfId: tree.ownerId, onBehalfOfName: tree.ownerName, detail: Object.keys(patch).join(', '), orgId: tree.orgId, ancestorOrgIds: tree.ancestorOrgIds });
      return b.commit();
    },
    /** Public URL encoded into each tree's QR code. */
    url: function (code) { return location.href.split('#')[0].split('?')[0] + '#/t/' + encodeURIComponent(code); },
    nameOf: function (t) { return t.customName || MT.species.get(t.speciesId).common; },
    ageYears: function (t) { return MT.species.ageYears(t.plantedOn); },
    co2: function (t) { return t.status === 'dead' ? 0 : MT.species.co2Total(t.speciesId, T.ageYears(t)); }
  });
})();
