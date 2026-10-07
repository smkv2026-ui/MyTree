/**
 * MyTree — keyless imagery sources for the green-cover before/after swipe.
 *
 * ⚠ These endpoints could not be verified at build time (the build environment had no access to them). Check them from a normal
 * internet connection with:   node tools/check-imagery.mjs
 * and adjust here if a URL has changed. Attribution is always shown on the map and under it.
 *
 *  • Esri World Imagery (current) — high resolution, usage subject to Esri's terms for web display.
 *  • Esri World Imagery *Wayback* — dated historical releases. The list of releases is fetched at run time from Esri's public
 *    Wayback configuration (`waybackconfig.json`); availability varies by area and may carry usage terms.
 *  • NASA GIBS (Global Imagery Browse Services) — MODIS Terra true colour and 8-day NDVI with a TIME parameter. COARSE: 250 m – 1 km
 *    per pixel, so only large plots/regional trends are visible. Native zoom levels stop at 9 (tiles are up-scaled beyond).
 */
(function () {
  'use strict';
  var MT = window.MT;
  var GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/';
  MT.imagery = {
    WAYBACK_CONFIG: 'https://s3-us-west-2.amazonaws.com/config.maptiles.arcgis.com/waybackconfig.json',
    sources: {
      'esri-now': { label: 'Satellite — current (Esri World Imagery)', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', opts: { maxZoom: 19, maxNativeZoom: 18, attribution: 'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics' } },
      'gibs-true': { label: 'NASA GIBS — MODIS true colour (coarse, ~250 m)', dated: true, url: GIBS + 'MODIS_Terra_CorrectedReflectance_TrueColor/default/{time}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg', opts: { maxZoom: 14, maxNativeZoom: 9, attribution: 'Imagery © NASA EOSDIS GIBS / MODIS Terra (coarse resolution)' } },
      'gibs-ndvi': { label: 'NASA GIBS — MODIS vegetation index NDVI (coarse, 8-day)', dated: true, url: GIBS + 'MODIS_Terra_NDVI_8Day/default/{time}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.png', opts: { maxZoom: 14, maxNativeZoom: 9, attribution: 'NDVI © NASA EOSDIS GIBS / MODIS Terra (coarse resolution)' } }
    },
    /** Fetch (and cache for a week) the list of Wayback releases → [{id,label,date,url}] newest first. */
    wayback: function () {
      var c = MT.storage.get('mt.wayback', null); if (c && Date.now() - c.at < 7 * 86400000) return Promise.resolve(c.list);
      return fetch(MT.imagery.WAYBACK_CONFIG).then(function (r) { if (!r.ok) throw new Error('wayback ' + r.status); return r.json(); }).then(function (j) {
        var list = Object.keys(j).map(function (k) {
          var m = /(\d{4}-\d{2}-\d{2})/.exec(j[k].itemTitle || ''), u = String(j[k].itemURL || '').replace('{level}', '{z}').replace('{row}', '{y}').replace('{col}', '{x}');
          return m && u ? { id: 'wb-' + k, label: 'Esri Wayback — ' + m[1], date: m[1], url: u } : null;
        }).filter(Boolean).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
        MT.storage.set('mt.wayback', { at: Date.now(), list: list }); return list;
      });
    }
  };
})();
