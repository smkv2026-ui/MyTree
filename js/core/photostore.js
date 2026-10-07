/**
 * MyTree — MT.photoStore: photos WITHOUT cloud storage.
 *
 * Photos are compressed in the browser (full ≤1280 px, JPEG q≈0.7, target ≤250 KB; thumbnail 320 px ≤25 KB;
 * tiny 120 px "cover" kept on the tree doc for lists/map popups) and stored in Firestore as two small documents:
 *   photos/{id}      metadata + 320 px thumb   (lists/timelines read ONLY this)
 *   photoData/{id}   the full image            (loaded on demand, then cached)
 * Keeping the full image in a second doc means lists never download full images, and each doc stays far below 1 MiB.
 *
 * SWAP POINT: to move to Cloudinary / Cloud Storage replace this one file. Keep the same five methods:
 *   prepare(file) → Promise<Prepared>            compress & measure (no network)
 *   store(batch, prepared, meta) → photoId       queue the writes in a MT.db batch (or upload, then return an id/URL)
 *   thumb(id) / full(id) → Promise<dataUrl|url>  read paths (cached)
 *   remove(batch, id, meta)                      queue deletes
 *   usage(ownerId) → Promise<{bytes, photos}>    account usage for the warning banner
 */
(function () {
  'use strict';
  var MT = window.MT;
  var LIMITS = { fullMaxSide: 1280, fullTarget: 250 * 1024, hardCap: 700 * 1024, thumbSide: 320, thumbTarget: 25 * 1024, coverSide: 120 };
  var FREE_BYTES = 1024 * 1024 * 1024; // Spark plan: 1 GiB Firestore storage
  var fullCache = {}, thumbCache = {};

  function draw(im, side, q, mime) {
    var s = Math.min(1, side / Math.max(im.naturalWidth, im.naturalHeight));
    var w = Math.max(1, Math.round(im.naturalWidth * s)), h = Math.max(1, Math.round(im.naturalHeight * s));
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(im, 0, 0, w, h);
    var url = c.toDataURL(mime || 'image/jpeg', q);
    return { dataUrl: url, width: w, height: h, size: Math.round((url.length - url.indexOf(',') - 1) * 0.75) };
  }
  /** Shrink quality, then dimensions, until the target size is met. */
  function fit(im, side, target, q0) {
    var q = q0, sd = side, out = draw(im, sd, q);
    while (out.size > target && (q > 0.42 || sd > 480)) {
      if (q > 0.42) q = Math.max(0.4, q - 0.1); else sd = Math.round(sd * 0.85);
      out = draw(im, sd, q);
    }
    return out;
  }

  MT.photoStore = {
    LIMITS: LIMITS, FREE_BYTES: FREE_BYTES,
    prepare: function (file) {
      if (!file || !/^image\//.test(file.type || 'image/jpeg')) return Promise.reject(MT.userError('Please choose an image file (JPG or PNG).'));
      return MT.img.fileToDataUrl(file).then(MT.img.load).then(function (im) {
        var full = fit(im, LIMITS.fullMaxSide, LIMITS.fullTarget, 0.7);
        if (full.size > LIMITS.hardCap) throw MT.userError('That photo is too detailed to store. Please try a smaller one.');
        var thumb = fit(im, LIMITS.thumbSide, LIMITS.thumbTarget, 0.65);
        var cover = draw(im, LIMITS.coverSide, 0.6);
        return { full: full, thumb: thumb, cover: cover.dataUrl, size: full.size + thumb.size, name: file.name || '' };
      });
    },
    store: function (batch, p, meta) {
      var id = MT.uid('p');
      var base = { treeId: meta.treeId || '', ownerId: meta.ownerId, orgId: meta.orgId || '', ancestorOrgIds: meta.ancestorOrgIds || [], createdAt: Date.now() };
      batch.set('photos', id, Object.assign({ thumb: p.thumb.dataUrl, size: p.size, width: p.full.width, height: p.full.height, kind: meta.kind || 'tree', note: meta.note || '' }, base));
      batch.set('photoData', id, Object.assign({ data: p.full.dataUrl }, base));
      MT.stats.photo(batch, meta.ownerId, p.size, 1);
      fullCache[id] = p.full.dataUrl; thumbCache[id] = p.thumb.dataUrl;
      return id;
    },
    thumb: function (id) {
      if (thumbCache[id]) return Promise.resolve(thumbCache[id]);
      return MT.db.get('photos', id).then(function (d) { if (d) thumbCache[id] = d.thumb; return d ? d.thumb : ''; });
    },
    full: function (id) {
      if (fullCache[id]) return Promise.resolve(fullCache[id]);
      return MT.db.get('photoData', id).then(function (d) { if (d) fullCache[id] = d.data; return d ? d.data : ''; });
    },
    remove: function (batch, id, meta) {
      batch.delete('photos', id); batch.delete('photoData', id);
      MT.stats.photo(batch, meta.ownerId, meta.size || 0, -1);
      delete fullCache[id]; delete thumbCache[id];
    },
    usage: function (ownerId) {
      return MT.db.get('stats', 'user_' + ownerId).then(function (s) { return { bytes: (s && s.bytes) || 0, photos: (s && s.photos) || 0 }; }).catch(function () { return { bytes: 0, photos: 0 }; });
    },
    /** Friendly storage notice for the platform (free tier) — returns null when there is nothing to say. */
    warning: function (globalStats) {
      var used = (globalStats && globalStats.photoBytes) || 0, pct = used / FREE_BYTES * 100;
      if (pct >= 90) return { tone: 'bad', text: 'Photo storage is ' + Math.round(pct) + '% of the free 1 GiB. New photos may soon be refused — ask your administrator to archive old photos or upgrade.' };
      if (pct >= 70) return { tone: 'warn', text: 'Photo storage is ' + Math.round(pct) + '% of the free 1 GiB. Consider fewer or smaller photos.' };
      return null;
    }
  };
})();
