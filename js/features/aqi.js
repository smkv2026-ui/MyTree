/**
 * MyTree — air quality (AQI) for a region, from the FREE Open-Meteo Air Quality API (no key, no sign-up): https://open-meteo.com/en/docs/air-quality-api
 * One request fetches every city at once; results are cached for an hour in the browser. If the network or the API is unavailable (offline, a sandboxed preview,
 * a blocked domain) a clearly-labelled "typical" value for that city is used instead, so nothing here ever claims to be live when it is not.
 *
 *   MT.aqi.forCities(['Pune','Delhi']).then(function (m) { m.Pune → { aqi, pm25, source: 'live' | 'typical' } })
 *   MT.aqi.band(aqi) → { label, tone };   MT.aqi.multiplier(aqi) → 1 … 1.5   (dirtier air → each tree's CO₂ counts for a little more on the ladder)
 */
(function () {
  'use strict';
  var MT = window.MT, KEY = 'mt.aqi.cache', TTL = 3600000;
  /** Typical annual-average US-AQI by city (rounded, indicative only) — used only when the live API cannot be reached. */
  var TYPICAL = { Delhi: 175, Kolkata: 150, Lucknow: 160, Jaipur: 125, Ahmedabad: 120, Mumbai: 105, Nagpur: 105, Hyderabad: 100, Pune: 95, Bhopal: 100, Nashik: 85, Chennai: 85, Bengaluru: 75, Kochi: 60 };
  var BANDS = [[50, 'Good', 'ok'], [100, 'Moderate', 'warn'], [150, 'Unhealthy for sensitive groups', 'warn'], [200, 'Unhealthy', 'bad'], [300, 'Very unhealthy', 'bad'], [9999, 'Hazardous', 'bad']];

  function read() { try { var c = JSON.parse(localStorage.getItem(KEY) || 'null'); return c && Date.now() - c.t < TTL ? c.d : {}; } catch (e) { return {}; } }
  function write(d) { try { localStorage.setItem(KEY, JSON.stringify({ t: Date.now(), d: d })); } catch (e) { /* private mode */ } }

  MT.aqi = {
    typical: function (city) { return TYPICAL[city] || 90; },
    band: function (aqi) { var b = BANDS.filter(function (x) { return aqi <= x[0]; })[0] || BANDS[BANDS.length - 1]; return { label: b[1], tone: b[2] }; },
    /** Dirtier air → a tree's cleaning work counts more (up to +50 % at AQI 200+). Documented in the Carbon ladder page. */
    multiplier: function (aqi) { return 1 + Math.min(0.5, Math.max(0, (aqi - 50) / 300)); },
    forCities: function (names) {
      names = names.filter(function (n, i) { return n && names.indexOf(n) === i; });
      var cache = read(), out = {}, need = [];
      names.forEach(function (n) { if (cache[n]) out[n] = cache[n]; else need.push(n); });
      var fill = function () { names.forEach(function (n) { if (!out[n]) out[n] = { aqi: MT.aqi.typical(n), pm25: null, source: 'typical' }; }); return out; };
      var pts = need.map(function (n) { return MT.geoData.city(n); }).filter(Boolean);
      if (!pts.length || typeof fetch !== 'function') return Promise.resolve(fill());
      var ctl = window.AbortController ? new AbortController() : null, timer = setTimeout(function () { if (ctl) ctl.abort(); }, 6000);
      var url = 'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=' + pts.map(function (c) { return c.lat; }).join(',') + '&longitude=' + pts.map(function (c) { return c.lng; }).join(',') + '&current=us_aqi,pm2_5';
      return fetch(url, ctl ? { signal: ctl.signal } : {}).then(function (r) { if (!r.ok) throw new Error('aqi ' + r.status); return r.json(); }).then(function (j) {
        clearTimeout(timer); var arr = Array.isArray(j) ? j : [j], fresh = read();
        arr.forEach(function (x, i) { var c = x && x.current; if (c && typeof c.us_aqi === 'number') { out[pts[i].name] = { aqi: Math.round(c.us_aqi), pm25: c.pm2_5 == null ? null : Math.round(c.pm2_5), source: 'live' }; fresh[pts[i].name] = out[pts[i].name]; } });
        write(fresh); return fill();
      }).catch(function () { clearTimeout(timer); return fill(); });
    }
  };
})();
