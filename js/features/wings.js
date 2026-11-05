/**
 * MyTree — "Bird friends" (#/wings): bird-life conservation. People set up bird STATIONS — nest boxes, feeders and water bowls — pin them on the map,
 * log care (refilled water, fed, cleaned, repaired) with reminders, and record bird SIGHTINGS. Stations can link to a tree; supplies are bought in the shop (Bird care).
 * Codes look like BIRD-2026-000012. Data: birdStations, birdCare, birdSightings.
 */
(function () {
  'use strict';
  var MT = window.MT, ui = MT.ui, kit = MT.kit, esc = MT.esc, DAY = 86400000;
  var ROLES = ['foundation', 'school', 'institution', 'student', 'individual'];
  var KINDS = { nest: { label: 'Nest box', icon: 'house', color: '#8a5a33', every: 30, tip: 'Hang 2–4 m high, facing away from strong sun and rain, with a small entrance hole. Clean out once the nesting season ends.' },
    feeder: { label: 'Bird feeder', icon: 'wheat', color: '#c9a227', every: 7, tip: 'Offer millet, sunflower or broken rice — never salty or spicy food. Refill often and keep the tray dry and clean.' },
    water: { label: 'Water bowl', icon: 'droplets', color: '#2b8fbf', every: 2, tip: 'A shallow, wide bowl in shade. Change the water daily in summer and scrub weekly to prevent mosquitoes and disease.' } };
  var ACTIONS = ['Refilled water', 'Added bird feed', 'Cleaned', 'Repaired', 'Moved to a better spot', 'Just checked'];
  var BIRDS = ['House Sparrow', 'Rose-ringed Parakeet', 'Indian Myna', 'Common Myna', 'Red-vented Bulbul', 'Oriental Magpie-Robin', 'Asian Koel', 'Indian Robin', 'Purple Sunbird', 'Coppersmith Barbet', 'House Crow', 'Rock Pigeon', 'Spotted Dove', 'Black Drongo', 'Common Tailorbird', 'Indian Peafowl', 'White-throated Kingfisher', 'Little Egret', 'Black Kite', 'Other'];
  var shortName = function (n) { return MT.stats && MT.stats.shortName ? MT.stats.shortName(n) : n; };

  function due(st) { var k = KINDS[st.kind], last = st.lastCareAt || st.createdAt || 0, days = (Date.now() - last) / DAY; return st.status === 'removed' ? 'ok' : days > k.every * 2 ? 'overdue' : days > k.every ? 'due' : 'ok'; }
  function pin(st) { var k = KINDS[st.kind]; return L.divIcon({ className: 'bird-pin-wrap', iconSize: [30, 30], iconAnchor: [15, 15], html: '<span class="bird-pin" style="--c:' + k.color + '">' + (st.kind === 'water' ? '💧' : st.kind === 'feeder' ? '🌾' : '🪺') + '</span>' }); }

  function page() {
    return '<div class="page wg-page" data-reveal><div class="page-head"><h2>Bird friends</h2><p class="muted">Trees feed and shelter birds — add nest boxes, feeders and water so they can thrive. Set one up, keep it cared for, and log the visitors.</p></div>' +
      '<div class="wg-hero"><div class="t3d t3d-sm" id="wg-bird"></div></div><div class="btn-row"><button class="btn btn-primary" id="wg-add">' + ui.icon('plus').s + ' Add a nest, feeder or water bowl</button><button class="btn btn-soft" id="wg-see">' + ui.icon('eye').s + ' Log a bird sighting</button><a class="btn btn-ghost" href="#/market?cat=bird">' + ui.icon('shopping-basket').s + ' Buy bird-care items</a></div>' +
      '<div class="tabs" id="wg-tabs"><a class="tab-link active" href="#/wings" data-t="stations">My stations</a><a class="tab-link" href="#/wings" data-t="sightings">Sightings</a><a class="tab-link" href="#/wings" data-t="learn">How to help birds</a></div><div id="wg-body">' + ui.skeleton(3, 'sk-line').s + '</div></div>';
  }
  function after(host, ctx) {
    var p = MT.auth.profile(), dead = false, tab = 'stations', stations = [], sightings = [], body = MT.$('#wg-body', host), map = null;
    function load() {
      var scopeOwn = [['ownerId', '==', p.userId]], org = p.orgId && ['school', 'institution', 'foundation'].indexOf(p.role) > -1;
      var q = function (c) { return MT.db.list(c, { where: org ? [['ancestorOrgIds', 'array-contains', p.orgId]] : scopeOwn, limit: 500 }).catch(function () { return []; }); };
      return Promise.all([q('birdStations'), q('birdSightings')]).then(function (r) { stations = r[0].sort(function (a, b) { return b.createdAt - a.createdAt; }); sightings = r[1].sort(function (a, b) { return b.createdAt - a.createdAt; }); });
    }
    function stationsTab() {
      var counts = { nest: 0, feeder: 0, water: 0 }; stations.forEach(function (s) { if (s.status !== 'removed') counts[s.kind]++; });
      var overdue = stations.filter(function (s) { return due(s) !== 'ok'; }).length;
      body.innerHTML = '<div class="sum-row"><div class="sum"><strong>' + counts.nest + '</strong><span>nest boxes</span></div><div class="sum"><strong>' + counts.feeder + '</strong><span>feeders</span></div><div class="sum"><strong>' + counts.water + '</strong><span>water bowls</span></div><div class="sum ' + (overdue ? 'sum-warn' : 'sum-ok') + '"><strong>' + overdue + '</strong><span>need care</span></div></div>' +
        (stations.length ? '<div class="card"><div class="detail-map wg-map" id="wg-map"></div></div><div class="wg-grid">' + stations.map(function (s) { var k = KINDS[s.kind], d = due(s); return '<article class="card wg-card"><div class="wg-head"><span class="wg-ic" style="--c:' + k.color + '">' + ui.icon(k.icon).s + '</span><div><h3>' + esc(s.name || k.label) + '</h3><p class="muted"><span class="mono">' + esc(s.code) + '</span> · ' + esc(k.label) + (s.city ? ' · ' + esc(s.city) : '') + '</p></div></div>' +
          '<p class="fine">' + (s.lastCareAt ? 'Last care: ' + esc(kit.dateOnly(s.lastCareAt)) + (s.lastAction ? ' (' + esc(s.lastAction) + ')' : '') : 'No care logged yet') + ' · ' + (s.careCount || 0) + ' check-ins</p><div class="chips"><span class="badge badge-' + (d === 'ok' ? 'ok' : d === 'due' ? 'warn' : 'bad') + '">' + (d === 'ok' ? 'Looking good' : d === 'due' ? 'Care due' : 'Overdue') + '</span>' + (s.status === 'damaged' ? '<span class="badge badge-bad">Damaged</span>' : '') + (s.treeCode ? '<a class="badge badge-neutral" href="#/trees/' + esc(s.treeCode) + '">Near ' + esc(s.treeCode) + '</a>' : '') + '</div>' +
          '<div class="btn-row"><button class="btn btn-primary btn-sm" data-care="' + esc(s.code) + '">Log care</button><button class="btn btn-ghost btn-sm" data-sight="' + esc(s.code) + '">Birds seen</button></div></article>'; }).join('') + '</div>'
          : ui.empty({ icon: 'bird', title: 'No bird stations yet', text: 'Hang a nest box, fill a feeder or put out a water bowl — then pin it here.' }).s);
      ui.icons(); if (stations.length) drawMap();
    }
    function drawMap() {
      MT.maps.create(MT.$('#wg-map', host), { locate: false, satelliteToggle: false }).then(function (m) { if (dead) return m.remove(); map = m; var pts = []; stations.forEach(function (s) { L.marker([s.lat, s.lng], { icon: pin(s), keyboard: false }).addTo(m).bindTooltip(esc(s.name || KINDS[s.kind].label) + ' · ' + KINDS[s.kind].label); pts.push([s.lat, s.lng]); }); if (pts.length) { try { m.fitBounds(pts, { padding: [40, 40], maxZoom: 16, animate: false }); } catch (e) { /* map removed */ } } }).catch(function () {});
    }
    function sightingsTab() {
      var species = {}; sightings.forEach(function (s) { species[s.species] = (species[s.species] || 0) + s.count; }); var top = Object.keys(species).sort(function (a, b) { return species[b] - species[a]; });
      body.innerHTML = '<div class="sum-row"><div class="sum"><strong>' + sightings.length + '</strong><span>sightings</span></div><div class="sum"><strong>' + top.length + '</strong><span>species seen</span></div><div class="sum"><strong>' + sightings.reduce(function (a, s) { return a + s.count; }, 0) + '</strong><span>birds counted</span></div></div>' +
        (sightings.length ? '<div class="card"><ul class="plain-list">' + sightings.slice(0, 60).map(function (s) { return '<li><strong>' + esc(s.species) + ' × ' + s.count + '</strong><small>' + esc(kit.dateOnly(s.date)) + (s.stationCode ? ' · at ' + esc(s.stationCode) : '') + (s.notes ? ' · ' + esc(s.notes) : '') + '</small></li>'; }).join('') + '</ul></div>' : ui.empty({ icon: 'eye', title: 'No sightings yet', text: 'Spotted a sparrow at your feeder? Log it — even common birds count.' }).s); ui.icons();
    }
    function learnTab() {
      body.innerHTML = '<div class="wg-grid">' + Object.keys(KINDS).map(function (k) { var x = KINDS[k]; return '<article class="card"><div class="wg-head"><span class="wg-ic" style="--c:' + x.color + '">' + ui.icon(x.icon).s + '</span><h3>' + x.label + '</h3></div><p>' + esc(x.tip) + '</p><p class="fine">Check every ' + x.every + ' day' + (x.every > 1 ? 's' : '') + '.</p></article>'; }).join('') +
        '<article class="card"><h3>Good to know</h3><ul class="plain-list"><li>Place feeders and water away from cats and busy roads.</li><li>Keep stations near a tree or shrub so birds can perch and hide.</li><li>Avoid bread, salty snacks and milk.</li><li>Tell us when something is damaged so it is not left unsafe.</li></ul></article></div>'; ui.icons();
    }
    var viewer = null;
    function paint() { if (dead) return; if (map) { map.remove(); map = null; } ({ stations: stationsTab, sightings: sightingsTab, learn: learnTab }[tab])(); }

    /* ---- forms ---- */
    function addStation() {
      var lat = null, lng = null, mk = null, m = null;
      kit.form({ title: 'Add a bird station', wide: true, submit: 'Save station', html:
        '<div class="field"><label for="b-kind">What is it?</label><select id="b-kind" name="kind">' + Object.keys(KINDS).map(function (k) { return '<option value="' + k + '">' + KINDS[k].label + '</option>'; }).join('') + '</select></div><div class="field"><label for="b-name">Name (optional)</label><input id="b-name" name="name" maxlength="60" placeholder="Balcony feeder"></div>' +
        '<div class="field field-wide"><label>Where is it? <span class="req">*</span></label><div class="btn-row"><button type="button" class="btn btn-soft btn-sm" id="b-gps">' + ui.icon('locate-fixed').s + ' Use my location</button><span class="fine" id="b-loc">Tap the map to place the pin.</span></div><div class="detail-map" id="b-map" style="height:240px"></div></div>' +
        '<div class="field field-wide"><label for="b-tree">Near one of your trees? (optional tree ID)</label><input id="b-tree" name="tree" maxlength="30" placeholder="TREE-2026-000123"></div><div class="field field-wide"><label for="b-notes">Notes (optional)</label><input id="b-notes" name="notes" maxlength="200"></div>',
        onOpen: function (b) {
          function set(a, o) { lat = +a.toFixed(6); lng = +o.toFixed(6); if (m) { if (mk) mk.setLatLng([lat, lng]); else mk = L.marker([lat, lng]).addTo(m); } b.querySelector('#b-loc').textContent = lat + ', ' + lng; }
          MT.maps.create(b.querySelector('#b-map'), { locate: false, satelliteToggle: false, center: [20.5, 78.9], zoom: 5 }).then(function (mm) { m = mm; m.on('click', function (e) { set(e.latlng.lat, e.latlng.lng); }); setTimeout(function () { try { m.invalidateSize(); } catch (e) { /* closed */ } }, 250); });
          b.querySelector('#b-gps').addEventListener('click', function () { if (!navigator.geolocation) return ui.toast('Location is not available on this device — tap the map instead.'); navigator.geolocation.getCurrentPosition(function (pos) { set(pos.coords.latitude, pos.coords.longitude); if (m) { try { m.setView([lat, lng], 17, { animate: false }); } catch (e) { /* closed */ } } }, function () { ui.toast('Could not get your location — tap the map instead.'); }, { enableHighAccuracy: true, timeout: 8000 }); });
        },
        onSubmit: function (v) {
          if (lat == null) throw MT.userError('Please pin the location on the map.');
          var year = new Date().getFullYear(), place = MT.trees.placeFor(lat, lng, null);
          return MT.db.nextId('BIRD_' + year).then(function (n) {
            var code = 'BIRD-' + year + '-' + MT.pad(n, 6), d = { code: code, kind: v.kind, name: v.name.slice(0, 60), ownerId: p.userId, ownerName: p.name, orgId: p.orgId || '', ancestorOrgIds: p.ancestorOrgIds || [], lat: lat, lng: lng, city: place.city || '', state: place.state || '', treeCode: (v.tree || '').slice(0, 30), notes: v.notes.slice(0, 200), status: 'active', careCount: 0, lastCareAt: Date.now(), lastAction: 'Set up', createdAt: Date.now() };
            return MT.db.set('birdStations', code, d);
          }).then(function () { ui.success('Station added. Check it regularly — we will remind you.'); return load().then(paint); });
        } });
    }
    function logCare(code) {
      var st = stations.filter(function (s) { return s.code === code; })[0];
      kit.form({ title: 'Care for ' + (st.name || KINDS[st.kind].label), submit: 'Save', html: '<div class="field field-wide"><label for="c-act">What did you do?</label><select id="c-act" name="action">' + ACTIONS.map(function (a) { return '<option>' + a + '</option>'; }).join('') + '</select></div><div class="field field-wide"><label for="c-st">Condition now</label><select id="c-st" name="status"><option value="active">Working well</option><option value="needs_refill">Needs refilling soon</option><option value="damaged">Damaged</option></select></div><div class="field field-wide"><label for="c-n">Notes (optional)</label><input id="c-n" name="notes" maxlength="200"></div>',
        onSubmit: function (v) { var now = Date.now(), b = MT.db.batch(); b.set('birdCare', MT.uid('bc'), { stationCode: code, ownerId: st.ownerId, orgId: st.orgId, ancestorOrgIds: st.ancestorOrgIds, date: MT.fmt.iso(new Date()), action: v.action, notes: v.notes, postedBy: p.userId, createdAt: now }); b.update('birdStations', code, { lastCareAt: now, lastAction: v.action, status: v.status, careCount: MT.db.inc(1) }); return b.commit().then(function () { ui.success('Thanks for caring for the birds! 🐦'); return load().then(paint); }); } });
    }
    function logSighting(code, bird) {
      kit.form({ title: 'Log a bird sighting', submit: 'Save sighting', html: '<div class="field field-wide"><label for="s-sp">Which bird?</label><select id="s-sp" name="species">' + BIRDS.map(function (b) { return '<option' + (b === bird ? ' selected' : '') + '>' + b + '</option>'; }).join('') + '</select></div><div class="field"><label for="s-n">How many?</label><input id="s-n" name="count" type="number" min="1" max="500" value="1" required></div><div class="field"><label for="s-d">Date</label><input id="s-d" name="date" type="date" value="' + MT.fmt.iso(new Date()) + '" required></div>' +
        '<div class="field field-wide"><label for="s-st">At which station? (optional)</label><select id="s-st" name="station"><option value="">Not at a station</option>' + stations.map(function (s) { return '<option value="' + esc(s.code) + '"' + (s.code === code ? ' selected' : '') + '>' + esc((s.name || KINDS[s.kind].label) + ' · ' + s.code) + '</option>'; }).join('') + '</select></div><div class="field field-wide"><label for="s-no">Notes (optional)</label><input id="s-no" name="notes" maxlength="200"></div>',
        onSubmit: function (v) { var n = parseInt(v.count, 10); if (!(n >= 1)) throw MT.userError('Enter how many birds you saw.'); return MT.db.set('birdSightings', MT.uid('bs'), { species: v.species, count: n, date: v.date, stationCode: v.station, notes: v.notes, ownerId: p.userId, ownerName: p.name, orgId: p.orgId || '', ancestorOrgIds: p.ancestorOrgIds || [], createdAt: Date.now() }).then(function () { ui.success('Sighting saved.'); return load().then(paint); }); } });
    }
    host.addEventListener('click', function (e) {
      var t;
      if (e.target.closest('#wg-add')) addStation(); else if (e.target.closest('#wg-see')) logSighting('');
      else if ((t = e.target.closest('[data-care]'))) logCare(t.dataset.care); else if ((t = e.target.closest('[data-sight]'))) logSighting(t.dataset.sight);
      else if ((t = e.target.closest('#wg-tabs [data-t]'))) { e.preventDefault(); tab = t.dataset.t; MT.$$('#wg-tabs .tab-link', host).forEach(function (x) { x.classList.toggle('active', x === t); }); paint(); }
    });
    MT.lazy.load('wings').then(function () { var el = MT.$('#wg-bird', host); if (!dead && el) viewer = MT.bird3d.mount(el, { species: 'House Sparrow' }); }).catch(function () { var el = MT.$('#wg-bird', host); if (el) el.remove(); });
    load().then(function () { paint(); if (ctx.query && ctx.query.add) addStation(); }).catch(function (e) { body.innerHTML = '<p class="muted">' + esc(MT.friendlyError(e)) + '</p>'; });
    return function () { dead = true; if (map) map.remove(); if (viewer) viewer.destroy(); };
  }

  MT.router.add('/wings', { title: 'Bird friends', layout: 'app', access: ROLES, render: page, after: after });
})();
