/**
 * MyTree — shared Leaflet helpers (used by the planting picker, My Trees, tree page and the Map route).
 * Leaflet and plugins are lazy-loaded; every function returns a Promise or tolerates a missing library.
 */
(function () {
  'use strict';
  var MT = window.MT, h = MT.html, raw = MT.raw, ui = MT.ui;

  var COLORS = { thriving: '#1b8f4e', healthy: '#66b432', needs_care: '#d9a21b', struggling: '#e0662b', dead: '#7b7468' };
  var LAYERS = [
    { id: 'street', label: 'Street', url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', opts: { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' } },
    { id: 'satellite', label: 'Satellite', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', opts: { maxZoom: 19, attribution: 'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics' } },
    { id: 'terrain', label: 'Terrain', url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', opts: { maxZoom: 17, attribution: 'Map data © OpenStreetMap contributors, SRTM | Style © <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)' } }
  ];

  var maps = (MT.maps = {
    COLORS: COLORS, LAYERS: LAYERS,
    color: function (hc) { return COLORS[hc] || COLORS.healthy; },
    /** Health-coloured tree marker icon. */
    treeIcon: function (health, bounce) {
      var c = maps.color(health);
      return L.divIcon({
        className: 'tree-pin-wrap', iconSize: [34, 42], iconAnchor: [17, 40], popupAnchor: [0, -36],
        html: '<span class="tree-pin' + (bounce ? ' bounce' : '') + '" style="--c:' + c + '"><svg viewBox="0 0 34 42" width="34" height="42" aria-hidden="true"><path d="M17 41C17 41 3 26 3 16a14 14 0 0 1 28 0c0 10-14 25-14 25z" fill="' + c + '" stroke="#fff" stroke-width="2.5"/><path d="M17 27v-8" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><circle cx="17" cy="14" r="5.2" fill="#fff"/><circle cx="13.6" cy="16" r="3.3" fill="#fff"/><circle cx="20.6" cy="16" r="3.3" fill="#fff"/></svg></span>'
      });
    },
    pinIcon: function () { return maps.treeIcon('thriving', true); },
    /** Create a map with layer switcher, fullscreen and locate-me. @returns {Promise<L.Map>} */
    create: function (el, o) {
      o = o || {};
      return MT.loader.load('leaflet').then(function () {
        var map = L.map(el, { center: o.center || [21.5, 79], zoom: o.zoom || 5, scrollWheelZoom: o.scrollWheelZoom !== false, zoomControl: true, worldCopyJump: true });
        var base = {}, saved = MT.storage.get('mt.baselayer', 'street'), first;
        LAYERS.forEach(function (l) { var t = L.tileLayer(l.url, Object.assign({ subdomains: 'abc' }, l.opts)); base[l.label] = t; if (l.id === saved) first = t; });
        (first || base.Street).addTo(map);
        L.control.layers(base, null, { collapsed: true, position: 'topright' }).addTo(map);
        map.on('baselayerchange', function (e) { var l = LAYERS.filter(function (x) { return x.label === e.name; })[0]; if (l) MT.storage.set('mt.baselayer', l.id); });
        if (o.fullscreen !== false) maps.addButton(map, 'Full screen', 'maximize', function (btn) {
          var on = el.classList.toggle('map-full'); document.body.classList.toggle('no-scroll', on); btn.classList.toggle('active', on);
          setTimeout(function () { try { map.invalidateSize(); } catch (e) { /* removed */ } }, 60);
        }, 'topleft');
        if (o.satelliteToggle !== false) maps.addButton(map, 'Toggle satellite view', 'satellite', function (btn) {
          var sat = base.Satellite, st = base.Street, on = map.hasLayer(sat);
          map.removeLayer(on ? sat : st); (on ? st : sat).addTo(map); btn.classList.toggle('active', !on); MT.storage.set('mt.baselayer', on ? 'street' : 'satellite');
        }, 'topleft');
        if (o.locate !== false) maps.addButton(map, 'Show my location', 'locate-fixed', function (btn) { maps.locate(map, o.onLocate); }, 'topleft');
        document.addEventListener('keydown', function esc(e) { if (!el.isConnected) return document.removeEventListener('keydown', esc); if (e.key === 'Escape' && el.classList.contains('map-full')) { el.classList.remove('map-full'); document.body.classList.remove('no-scroll'); map.invalidateSize(); } });
        // make sure tiles render after the container is laid out (stepper panels, tabs)
        setTimeout(function () { try { if (el.isConnected) map.invalidateSize(); } catch (e) { /* map already removed */ } }, 200);
        return map;
      });
    },
    addButton: function (map, label, icon, fn, pos) {
      var C = L.Control.extend({
        options: { position: pos || 'topleft' },
        onAdd: function () {
          var d = L.DomUtil.create('div', 'leaflet-bar mt-ctl'), b = L.DomUtil.create('button', '', d);
          b.type = 'button'; b.title = label; b.setAttribute('aria-label', label); b.innerHTML = '<i data-lucide="' + icon + '" class="ic"></i>';
          L.DomEvent.disableClickPropagation(d); L.DomEvent.on(b, 'click', function (e) { L.DomEvent.stop(e); fn(b); });
          setTimeout(ui.icons, 0); return d;
        }
      });
      new C().addTo(map);
    },
    /** GPS → map. Calls cb(lat,lng,accuracy) if given. */
    locate: function (map, cb) {
      if (!navigator.geolocation) return ui.toast('Your browser cannot share its location. Search for an address instead.', { type: 'warn' });
      ui.toast('Finding your location…', { duration: 1500 });
      navigator.geolocation.getCurrentPosition(function (p) {
        var ll = [p.coords.latitude, p.coords.longitude];
        map.setView(ll, Math.max(map.getZoom(), 17));
        if (cb) cb(ll[0], ll[1], p.coords.accuracy);
        else L.circle(ll, { radius: p.coords.accuracy, color: '#1666d6', weight: 1, fillOpacity: .12 }).addTo(map);
      }, function (e) {
        ui.toast(e.code === 1 ? 'Location permission was denied. Allow it in your browser settings, or search for an address.' : 'Could not get your location. Move the pin by hand or search for an address.', { type: 'warn', duration: 6000 });
      }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
    },
    popupHtml: function (t, opts) {
      opts = opts || {};
      var sp = MT.species.get(t.speciesId);
      var img = t.cover ? '<img src="' + MT.esc(t.cover) + '" alt="" width="64" height="64">' : ui.treeArt(t.health, 64).s;
      return '<div class="tree-pop"><div class="tree-pop-img">' + img + '</div><div class="tree-pop-body"><strong>' + MT.esc(t.customName || sp.common) + '</strong>' +
        '<small>' + MT.esc(t.code) + '</small><span class="hrow"><i class="hdot hdot-' + t.health + '"></i>' + MT.esc(ui.healthLabel[t.health] || '') + '</span>' +
        '<small>Planted ' + MT.fmt.date(t.plantedOn) + '</small>' +
        (opts.owner !== false && t.ownerName ? '<small>By ' + MT.esc(t.ownerName) + (t.onBehalfOf ? ' (posted by admin)' : '') + '</small>' : '') +
        '<small>' + (t.lastUpdateAt ? 'Last update ' + MT.fmt.ago(t.lastUpdateAt) : 'No updates yet') + '</small>' +
        '<a href="#/trees/' + encodeURIComponent(t.code) + '">View timeline →</a></div></div>';
    },
    /** Geohash prefixes (≤ ~9, never more than 32) covering a bounds object {south,west,north,east}. */
    cells: function (b) {
      var p, w, hh, nx, ny;
      for (p = 6; p >= 1; p--) {
        var lngBits = Math.ceil(5 * p / 2), latBits = Math.floor(5 * p / 2);
        w = 360 / Math.pow(2, lngBits); hh = 180 / Math.pow(2, latBits);
        nx = Math.ceil((b.east - b.west) / w) + 1; ny = Math.ceil((b.north - b.south) / hh) + 1;
        if (nx * ny <= 9) break;
      }
      var set = {};
      for (var i = 0; i < Math.min(ny, 16); i++) for (var j = 0; j < Math.min(nx, 16); j++) {
        var lat = Math.min(89.999, Math.max(-89.999, Math.min(b.north, b.south + i * hh))), lng = Math.min(179.999, Math.max(-179.999, Math.min(b.east, b.west + j * w)));
        set[MT.geo.geohash(lat, lng, p)] = 1;
      }
      return Object.keys(set);
    },
    /**
     * Viewport loader: fetches trees one geohash cell at a time (never the whole collection) and caches cells.
     * scope = list of where-clauses that make the query rule-provable, e.g. [['ownerId','==',id]] or [['ancestorOrgIds','array-contains',org]].
     */
    viewportLoader: function (scope, perCell) {
      var cache = {}; perCell = perCell || 1500;
      return {
        load: function (bounds) {
          var cells = maps.cells(bounds), capped = false;
          return Promise.all(cells.map(function (c) {
            if (cache[c]) return cache[c];
            var q = { where: scope.concat([['geohash', '>=', c], ['geohash', '<', c + '~']]), limit: perCell };
            return (cache[c] = MT.db.list('trees', q).then(function (r) { if (r.length >= perCell) capped = true; return r; }).catch(function (e) { delete cache[c]; throw e; }));
          })).then(function (parts) {
            var seen = {}, out = [];
            parts.forEach(function (rows) { rows.forEach(function (t) { if (!seen[t.id]) { seen[t.id] = 1; out.push(t); } }); });
            return { trees: out, capped: capped };
          });
        },
        reset: function () { cache = {}; }
      };
    },
    /** Render trees as clustered, health-coloured markers into a layer group. */
    renderTrees: function (layer, trees, opts) {
      opts = opts || {};
      layer.clearLayers();
      var ms = trees.map(function (t) {
        var m = L.marker([t.lat, t.lng], { icon: maps.treeIcon(t.health), title: t.code, riseOnHover: true });
        m.bindPopup(function () { return maps.popupHtml(t, opts); }, { minWidth: 220 });
        m._tree = t; return m;
      });
      if (layer.addLayers) layer.addLayers(ms); else ms.forEach(function (m) { layer.addLayer(m); });
      return ms;
    },
    clusterGroup: function () {
      return MT.loader.load('markercluster').then(function () {
        return L.markerClusterGroup({ chunkedLoading: true, maxClusterRadius: 55, spiderfyOnMaxZoom: true, showCoverageOnHover: false });
      }).catch(function () { return L.layerGroup(); });
    },
    legend: function () {
      return h`<ul class="map-legend">${Object.keys(COLORS).map(function (k) { return h`<li><i class="hdot hdot-${k}"></i>${ui.healthLabel[k]}</li>`; })}</ul>`;
    }
  });
})();
