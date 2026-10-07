/**
 * MyTree — Nominatim (OpenStreetMap) search & reverse geocoding.
 * Rate-limit safe: requests are queued ≥ 1.1 s apart (usage policy is max 1 req/s), results are cached in localStorage
 * (bounded), and callers should debounce. Never throws to the UI — resolves null/[] when unavailable.
 */
(function () {
  'use strict';
  var MT = window.MT, KEY = 'mt.geocache', MAX = 300, last = 0, chain = Promise.resolve();
  var cache = MT.storage.get(KEY, {});
  function save() { var k = Object.keys(cache); if (k.length > MAX) k.slice(0, k.length - MAX).forEach(function (x) { delete cache[x]; }); MT.storage.set(KEY, cache); }
  function fetchJson(url) {
    var p = chain.then(function () {
      var wait = Math.max(0, last + 1100 - Date.now());
      return MT.sleep(wait);
    }).then(function () {
      last = Date.now();
      return fetch(url, { headers: { 'Accept': 'application/json' } }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
    });
    chain = p.catch(function () {});
    return p;
  }
  MT.geocode = {
    /** @returns {Promise<Array<{label:string, lat:number, lng:number}>>} */
    search: function (q) {
      q = String(q || '').trim(); if (q.length < 3) return Promise.resolve([]);
      var key = 's:' + q.toLowerCase();
      if (cache[key]) return Promise.resolve(cache[key]);
      return fetchJson('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&addressdetails=0&q=' + encodeURIComponent(q)).then(function (rows) {
        var out = rows.map(function (r) { return { label: r.display_name, lat: +r.lat, lng: +r.lon }; });
        cache[key] = out; save(); return out;
      }).catch(function () { return []; });
    },
    /** @returns {Promise<{label:string, city:string, state:string}|null>} */
    reverse: function (lat, lng) {
      var key = 'r:' + lat.toFixed(4) + ',' + lng.toFixed(4);
      if (cache[key]) return Promise.resolve(cache[key]);
      return fetchJson('https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=16&addressdetails=1&lat=' + lat + '&lon=' + lng).then(function (r) {
        if (!r || !r.address) return null;
        var a = r.address, out = { label: r.display_name || '', city: a.city || a.town || a.village || a.suburb || a.county || a.state_district || '', state: a.state || '' };
        cache[key] = out; save(); return out;
      }).catch(function () { return null; });
    },
    /** Nearest known city (from MT.geoData) and its distance in km. */
    nearestCity: function (lat, lng) {
      var best = null, bd = Infinity;
      MT.geoData.cities.forEach(function (c) { var d = MT.geo.distance(lat, lng, c.lat, c.lng) / 1000; if (d < bd) { bd = d; best = c; } });
      return best ? { city: best, km: bd, inside: bd <= best.r } : null;
    }
  };
})();
