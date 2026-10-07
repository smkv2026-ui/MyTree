/**
 * MyTree — #/map: every tree you are allowed to see, loaded by viewport (geohash cells), clustered, health-coloured,
 * with street / satellite / terrain layers. Never fetches the whole collection.
 * Visibility: own trees (students, individuals) · whole subtree (org admins) · everything (super admin).
 */
(function () {
  'use strict';
  var MT = window.MT, h = MT.html, ui = MT.ui;

  function render() {
    var p = MT.auth.profile();
    return h`<div class="page map-page"><div class="page-head row"><div><h2>Map</h2><p class="muted" id="mp-sub">Showing ${p.role === 'super_admin' ? 'all trees' : MT.auth.isOrgAdmin() ? 'trees in your organisation' : 'your trees'}. Zoom in for detail.</p></div>
      <div class="chips" id="mp-health" role="group" aria-label="Filter by health">${MT.trees.HEALTHS.map(function (x) { return h`<button type="button" class="chip on" data-h="${x}" aria-pressed="true"><i class="hdot hdot-${x}"></i>${ui.healthLabel[x]}</button>`; })}</div></div>
      <div class="map-wrap tall"><div id="big-map" class="tr-map"></div><div class="map-count glass" id="mp-count" role="status">Loading…</div></div>
      ${MT.maps.legend()}</div>`;
  }

  function after(host) {
    var p = MT.auth.profile(), scope = MT.trees.scopeFor(p), loader = MT.maps.viewportLoader(scope), el = MT.$('#big-map', host);
    var map, group, on = {}, last = [], destroyed = false, cap = false;
    MT.trees.HEALTHS.forEach(function (x) { on[x] = true; });
    function paint() {
      var rows = last.filter(function (t) { return on[t.status === 'dead' ? 'dead' : t.health]; });
      MT.maps.renderTrees(group, rows);
      MT.$('#mp-count', host).textContent = MT.fmt.num(rows.length) + ' tree' + (rows.length === 1 ? '' : 's') + ' in view' + (cap ? ' — zoom in to see all' : '');
    }
    var refresh = MT.debounce(function () {
      if (destroyed || !map) return; var b = map.getBounds();
      loader.load({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() }).then(function (r) { if (destroyed) return; last = r.trees; cap = r.capped; paint(); })
        .catch(function (e) { MT.$('#mp-count', host).textContent = MT.friendlyError(e); });
    }, 350);
    host.addEventListener('click', function (e) {
      var b = e.target.closest('[data-h]'); if (!b) return; on[b.dataset.h] = !on[b.dataset.h]; b.classList.toggle('on', on[b.dataset.h]); b.setAttribute('aria-pressed', on[b.dataset.h]); paint();
    });
    // start where the data is
    var first = MT.db.list('trees', { where: scope, limit: 1 }).then(function (r) { return r[0] ? [r[0].lat, r[0].lng] : null; }).catch(function () { return null; });
    first.then(function (c) {
      var org = MT.auth.session().org, city = org && MT.geoData.city(org.city);
      var start = c || (city ? [city.lat, city.lng] : [21.5, 79]);
      return MT.maps.create(el, { center: start, zoom: c ? 13 : (city ? 11 : 5) });
    }).then(function (m) {
      if (destroyed) { m.remove(); return; }
      map = m; return MT.maps.clusterGroup().then(function (g) { group = g; g.addTo(m); m.on('moveend', refresh); refresh(); });
    }).catch(function (e) { el.innerHTML = '<div class="empty"><h3>Map unavailable</h3><p>' + MT.esc(MT.friendlyError(e)) + '</p></div>'; });
    return function () { destroyed = true; if (map) map.remove(); };
  }
  MT.router.add('/map', { title: 'Map', layout: 'app', access: ['super_admin', 'foundation', 'school', 'institution', 'student', 'individual'], render: render, after: after });
})();
