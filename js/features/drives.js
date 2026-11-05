/**
 * MyTree — Plantation drives pages: #/drives (browse, filter, map, host one) and #/drives/:id (details, live spots, register, ticket, host tools).
 * Core helpers (cards, registration, dashboard strip) are in drives-core.js.
 */
(function () {
  'use strict';
  var MT = window.MT, ui = MT.ui, kit = MT.kit, D = MT.drives, esc = MT.esc;
  var ALL = ['super_admin', 'foundation', 'school', 'institution', 'student', 'individual', 'seller'];
  function canHost() { return MT.auth.role() !== 'student'; }
  function isHost(d, p) { return d.hostId === p.userId || p.role === 'super_admin'; }
  function canManage(d, p) { return isHost(d, p) || (['foundation', 'school', 'institution'].indexOf(p.role) > -1 && (d.ancestorOrgIds || []).indexOf(p.orgId) > -1); }

  /* ================= create / edit ================= */
  function driveForm(d, done) {
    var p = MT.auth.profile(), create = !d, lat = d ? d.lat : null, lng = d ? d.lng : null, m = null, mk = null, city = d ? d.city : '', state = d ? d.state : '';
    d = d || { durationH: 3, capacity: 30, saplings: 0 };
    var soon = new Date(Date.now() + 3 * 86400000); soon.setHours(7, 30, 0, 0); var dv = d.date || (function (x) { var q = function (n) { return String(n).padStart(2, '0'); }; return x.getFullYear() + '-' + q(x.getMonth() + 1) + '-' + q(x.getDate()) + 'T' + q(x.getHours()) + ':' + q(x.getMinutes()); })(soon);
    kit.form({ title: create ? 'Host a plantation drive' : 'Edit drive', wide: true, submit: create ? 'Publish drive' : 'Save changes', html:
      '<div class="field field-wide"><label for="d-title">Name of the drive</label><input id="d-title" name="title" maxlength="100" required value="' + esc(d.title || '') + '" placeholder="Monsoon plantation at Vetal Tekdi"></div>' +
      '<div class="field field-wide"><label for="d-desc">What will happen?</label><textarea id="d-desc" name="description" rows="3" maxlength="800" placeholder="We will plant 200 native saplings, followed by tea and a short talk.">' + esc(d.description || '') + '</textarea></div>' +
      '<div class="field"><label for="d-date">Starts</label><input id="d-date" name="date" type="datetime-local" required value="' + esc(dv) + '"></div>' +
      '<div class="field"><label for="d-dur">Duration</label><select id="d-dur" name="durationH">' + [1, 2, 3, 4, 6, 8].map(function (h) { return '<option value="' + h + '"' + (+d.durationH === h ? ' selected' : '') + '>' + h + ' hour' + (h > 1 ? 's' : '') + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label for="d-cap">Volunteers needed</label><input id="d-cap" name="capacity" type="number" min="1" max="5000" required value="' + d.capacity + '"></div>' +
      '<div class="field"><label for="d-sap">Saplings you will provide</label><input id="d-sap" name="saplings" type="number" min="0" max="100000" value="' + (d.saplings || 0) + '"></div>' +
      '<div class="field field-wide"><label for="d-addr">Site address</label><textarea id="d-addr" name="address" rows="2" maxlength="300" required placeholder="Gate 2, Vetal Tekdi, Paud Road, Pune">' + esc(d.address || '') + '</textarea>' +
      '<div class="btn-row"><button type="button" class="btn btn-soft btn-sm" id="d-find">' + ui.icon('search').s + ' Find this address on the map</button><button type="button" class="btn btn-ghost btn-sm" id="d-gps">' + ui.icon('locate-fixed').s + ' Use my location</button><span class="fine" id="d-loc">' + (lat != null ? lat + ', ' + lng : 'Tap the map to drop the pin.') + '</span></div><div class="detail-map" id="d-map" style="height:230px"></div></div>' +
      '<div class="field"><label for="d-bring">Please bring</label><input id="d-bring" name="bring" maxlength="300" value="' + esc(d.bring || '') + '" placeholder="Water bottle, gloves, cap"></div><div class="field"><label for="d-ph">Contact phone (shown to registered people)</label><input id="d-ph" name="phone" type="tel" maxlength="30" value="' + esc(d.phone || '') + '"></div>',
      onOpen: function (b) {
        function set(a, o, label) { lat = +a.toFixed(6); lng = +o.toFixed(6); if (m) { if (mk) mk.setLatLng([lat, lng]); else mk = L.marker([lat, lng]).addTo(m); try { m.setView([lat, lng], Math.max(m.getZoom(), 15), { animate: false }); } catch (e) { /* closed */ } } b.querySelector('#d-loc').textContent = lat + ', ' + lng; }
        MT.maps.create(b.querySelector('#d-map'), { locate: false, satelliteToggle: false, center: lat != null ? [lat, lng] : [20.5, 78.9], zoom: lat != null ? 15 : 5 }).then(function (mm) { m = mm; if (lat != null) mk = L.marker([lat, lng]).addTo(m); m.on('click', function (e) { set(e.latlng.lat, e.latlng.lng); }); setTimeout(function () { try { m.invalidateSize(); } catch (e) { /* closed */ } }, 250); });
        b.querySelector('#d-gps').addEventListener('click', function () { if (!navigator.geolocation) return ui.toast('Location is not available — tap the map instead.'); navigator.geolocation.getCurrentPosition(function (pos) { set(pos.coords.latitude, pos.coords.longitude); }, function () { ui.toast('Could not get your location — tap the map instead.'); }, { timeout: 8000, enableHighAccuracy: true }); });
        b.querySelector('#d-find').addEventListener('click', function () { var q = b.querySelector('#d-addr').value; if (q.trim().length < 3) return ui.toast('Type the address first.'); MT.geocode.search(q).then(function (r) { if (!r.length) return ui.toast('Address not found — tap the map to pin the spot.'); set(r[0].lat, r[0].lng); ui.success('Pinned: ' + r[0].label.slice(0, 60)); }); });
      },
      onSubmit: function (v) {
        if (!v.title) throw MT.userError('Please name the drive.'); if (!v.address) throw MT.userError('Please add the site address.'); if (lat == null) throw MT.userError('Please pin the location on the map (tap the map, or use “Find this address”).');
        var cap = parseInt(v.capacity, 10); if (!(cap >= 1)) throw MT.userError('How many volunteers do you need?'); if (!create && cap < (d.registered || 0)) throw MT.userError(d.registered + ' people have already registered — capacity cannot go below that.');
        if (create && new Date(v.date).getTime() < Date.now() - 3600000) throw MT.userError('Please choose a start time in the future.');
        var place = MT.trees.placeFor(lat, lng, null), doc = { title: v.title.slice(0, 100), description: (v.description || '').slice(0, 800), date: v.date, durationH: +v.durationH, address: v.address.slice(0, 300), city: place.city || city || '', state: place.state || state || '', lat: lat, lng: lng, capacity: cap, saplings: Math.max(0, parseInt(v.saplings, 10) || 0), bring: (v.bring || '').slice(0, 300), phone: (v.phone || '').slice(0, 30) };
        var id = d.id || MT.uid('dr');
        return (create ? MT.db.set('drives', id, Object.assign(doc, { hostId: p.userId, hostName: MT.stats.shortName(p.name), hostRole: p.role, orgId: p.orgId || '', ancestorOrgIds: p.ancestorOrgIds || [], registered: 0, status: 'open', createdAt: Date.now() })) : MT.db.update('drives', id, doc)).then(function () { ui.success(create ? 'Your drive is live! Everyone can see and register for it.' : 'Drive updated.'); if (create) ui.confetti(); if (done) done(id); });
      } });
  }

  /* ================= list ================= */
  function listPage() {
    return '<div class="page dr-page" data-reveal><section class="dr-hero card-hero"><div><p class="eyebrow">Plantation drives</p><h2>Plant together. Show up, dig in, grow a forest.</h2><p>Join a drive near you — or host your own. Register while spots last.</p><div class="btn-row">' + (canHost() ? '<button class="btn btn-primary" id="dr-new">' + ui.icon('plus').s + ' Host a drive</button>' : '') + '</div></div><div class="dr-stats" id="dr-stats"></div></section>' +
      '<div class="dr-toolbar"><div class="chips" id="dr-tabs" role="group" aria-label="Filter drives">' + [['upcoming', 'Upcoming'], ['week', 'This week'], ['city', 'My city'], ['going', 'I’m going'], ['mine', 'Hosted by me'], ['past', 'Past']].map(function (t, i) { return '<button class="chip' + (i ? '' : ' on') + '" data-t="' + t[0] + '" aria-pressed="' + (!i) + '">' + t[1] + '</button>'; }).join('') + '</div>' +
      '<div class="dr-tools"><div class="search-wrap"><label class="sr-only" for="dr-q">Search drives</label><input id="dr-q" type="search" placeholder="Search by name, city, host…"></div><div class="seg" role="group" aria-label="View"><button class="chip on" data-v="cards" aria-pressed="true">Cards</button><button class="chip" data-v="map" aria-pressed="false">Map</button></div></div></div><div id="dr-body">' + ui.skeleton(4, 'sk-line').s + '</div></div>';
  }
  function listAfter(host, ctx) {
    var p = MT.auth.profile(), tab = 'upcoming', view = 'cards', all = [], regs = {}, dead = false, map = null, body = MT.$('#dr-body', host), q = MT.$('#dr-q', host), myCity = '';
    function filtered() {
      var t = q.value.toLowerCase().trim(), now = Date.now();
      return all.filter(function (d) {
        var st = D.state(d), r = regs[d.id], going = r && r.status !== 'cancelled';
        if (tab === 'upcoming' && !(st === 'open' || st === 'live' || st === 'full')) return false; if (tab === 'week' && !((st === 'open' || st === 'live' || st === 'full') && D.startMs(d) < now + 7 * 86400000)) return false;
        if (tab === 'city' && (!myCity || d.city !== myCity)) return false; if (tab === 'going' && !going) return false; if (tab === 'mine' && d.hostId !== p.userId) return false; if (tab === 'past' && !(st === 'past' || st === 'cancelled')) return false;
        return !t || (d.title + ' ' + d.city + ' ' + d.address + ' ' + d.hostName).toLowerCase().indexOf(t) > -1;
      }).sort(function (a, b) { return tab === 'past' ? D.startMs(b) - D.startMs(a) : D.startMs(a) - D.startMs(b); });
    }
    function stats() {
      var up = all.filter(function (d) { var s = D.state(d); return s === 'open' || s === 'live' || s === 'full'; });
      MT.$('#dr-stats', host).innerHTML = [[up.length, 'upcoming drives'], [up.reduce(function (a, d) { return a + D.spots(d); }, 0), 'spots open'], [all.reduce(function (a, d) { return a + (d.registered || 0); }, 0), 'volunteers joined'], [up.reduce(function (a, d) { return a + (d.saplings || 0); }, 0), 'saplings to plant']].map(function (x) { return '<div class="dr-stat"><strong data-count="' + x[0] + '">' + x[0] + '</strong><span>' + x[1] + '</span></div>'; }).join('');
    }
    function paint() {
      if (dead) return; if (map) { map.remove(); map = null; }
      var list = filtered();
      if (!list.length) { body.innerHTML = ui.empty({ icon: 'tent-tree', title: tab === 'mine' ? 'You have not hosted a drive yet' : 'No drives here', text: tab === 'city' && !myCity ? 'Plant a tree first so we know your city.' : canHost() ? 'Why not host one? It takes two minutes.' : 'Check back soon.' }).s; ui.icons(); return; }
      if (view === 'cards') { body.innerHTML = '<div class="dr-grid">' + list.map(function (d) { return D.card(d, regs[d.id]); }).join('') + '</div>'; ui.icons(); return; }
      body.innerHTML = '<div class="card"><div class="detail-map dr-bigmap" id="dr-map"></div></div><p class="fine">Green = spots available, amber = filling up, red = full. Tap a pin for details.</p>';
      MT.maps.create(MT.$('#dr-map', host), { locate: false, satelliteToggle: false }).then(function (m) {
        if (dead) return m.remove(); map = m; var pts = [];
        list.forEach(function (d) { var tone = D.spots(d) <= 0 ? '#c0392b' : D.spots(d) / d.capacity < 0.2 ? '#d9822b' : '#2e9e5b'; L.marker([d.lat, d.lng], { icon: L.divIcon({ className: 'dr-pin-wrap', iconSize: [34, 34], iconAnchor: [17, 17], html: '<span class="dr-pin" style="--c:' + tone + '">🌳</span>' }) }).addTo(m).bindPopup('<strong>' + esc(d.title) + '</strong><br>' + esc(D.when(d)) + '<br>' + D.spots(d) + ' of ' + d.capacity + ' spots left<br><a href="#/drives/' + esc(d.id) + '">Open drive →</a>'); pts.push([d.lat, d.lng]); });
        try { m.fitBounds(pts, { padding: [40, 40], maxZoom: 13, animate: false }); } catch (e) { /* removed */ }
      }).catch(function () {});
    }
    Promise.all([D.list(), D.myRegs()]).then(function (r) { if (dead) return; all = r[0]; r[1].forEach(function (x) { regs[x.driveId] = x; });
      return MT.db.list('trees', { where: [['ownerId', '==', p.userId]], limit: 50 }).catch(function () { return []; }).then(function (ts) { myCity = MT.ladder ? MT.ladder.cityOf(ts, '') : ''; stats(); paint(); if (ctx.query && ctx.query.new && canHost()) driveForm(null, function (id) { MT.router.go('/drives/' + id); }); }); }).catch(function (e) { body.innerHTML = '<p class="muted">' + esc(MT.friendlyError(e)) + '</p>'; });
    MT.$('#dr-tabs', host).addEventListener('click', function (e) { var b = e.target.closest('[data-t]'); if (!b) return; tab = b.dataset.t; MT.$$('#dr-tabs .chip', host).forEach(function (x) { var on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); }); paint(); });
    MT.$('.seg', host).addEventListener('click', function (e) { var b = e.target.closest('[data-v]'); if (!b) return; view = b.dataset.v; MT.$$('.seg .chip', host).forEach(function (x) { var on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); }); paint(); });
    q.addEventListener('input', paint);
    var nb = MT.$('#dr-new', host); if (nb) nb.addEventListener('click', function () { driveForm(null, function (id) { MT.router.go('/drives/' + id); }); });
    return function () { dead = true; if (map) map.remove(); };
  }

  /* ================= detail ================= */
  function detailPage() { return '<div class="page dr-page" data-reveal><a class="back-link" href="#/drives">' + ui.icon('arrow-left').s + ' All drives</a><div id="dd">' + ui.skeleton(4, 'sk-line').s + '</div></div>'; }
  function detailAfter(host, ctx) {
    var p = MT.auth.profile(), id = ctx.params.id, dd = MT.$('#dd', host), dead = false, d, reg = null, party = 1, map = null, timer = null, S = { tab: 'about' };
    function load() { return Promise.all([MT.db.get('drives', id), MT.db.get('driveRegs', id + '_' + p.userId).catch(function () { return null; })]).then(function (r) { if (!r[0]) throw MT.userError('This drive was not found.'); d = r[0]; reg = r[1]; }); }
    function ics() { var pad = function (x) { return new Date(x).toISOString().replace(/[-:]|\.\d{3}/g, ''); }; MT.download('drive-' + id + '.ics', ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MyTree//Drives//EN', 'BEGIN:VEVENT', 'UID:' + id + '@mytree', 'DTSTAMP:' + pad(Date.now()), 'DTSTART:' + pad(D.startMs(d)), 'DTEND:' + pad(D.endMs(d)), 'SUMMARY:' + d.title.replace(/[,;\n]/g, ' '), 'LOCATION:' + d.address.replace(/[,;\n]/g, ' '), 'GEO:' + d.lat + ';' + d.lng, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n'), 'text/calendar'); }
    function joinPanel() {
      var st = D.state(d), left = D.spots(d), pct = Math.round((d.registered || 0) / d.capacity * 100), mine = reg && reg.status !== 'cancelled' ? reg : null, host_ = isHost(d, p), maxParty = Math.min(5, left);
      var ring = ui.ring(100 - pct, String(left), 'spots left', 150).s;
      var act = '';
      if (mine) act = '<div class="dr-ticket"><div class="dr-ticket-main"><p class="eyebrow">Your ticket</p><h4>' + esc(MT.stats.shortName(p.name)) + '</h4><p>' + mine.party + ' ' + (mine.party > 1 ? 'people' : 'person') + ' · ' + (mine.status === 'attended' ? '✓ Attended' : 'Registered') + '</p></div><div class="dr-qr" id="dr-qr" aria-hidden="true"></div></div>' + (mine.status === 'attended' ? '<a class="btn btn-primary btn-block" href="#/plant?drive=' + esc(id) + '">' + ui.icon('sprout').s + ' Record the tree you planted</a>' : st === 'open' || st === 'live' ? '<button class="btn btn-ghost btn-block" id="dr-cancel">Cancel my registration</button>' : '');
      else if (st === 'open' || st === 'live') act = '<label class="dr-party" for="dr-party">How many people are coming?</label><div class="dr-stepper"><button class="btn btn-soft" id="dr-minus" aria-label="Fewer people">−</button><output id="dr-party" aria-live="polite">' + party + '</output><button class="btn btn-soft" id="dr-plus" aria-label="More people">+</button></div><button class="btn btn-primary btn-block btn-lg" id="dr-reg">' + ui.icon('hand-heart').s + ' Register' + (maxParty ? ' — ' + left + ' spot' + (left > 1 ? 's' : '') + ' left' : '') + '</button>';
      else act = '<p class="muted">' + (st === 'full' ? 'This drive is full. Check other drives, or ask the host to open more spots.' : st === 'cancelled' ? 'This drive was cancelled.' : 'This drive has finished.') + '</p>';
      return '<aside class="card dr-join"><div class="dr-ringwrap">' + ring + '</div><p class="dr-count"><strong>' + (d.registered || 0) + '</strong> of ' + d.capacity + ' volunteers joined' + (st === 'open' || st === 'live' ? ' · <span class="dr-cd">' + esc(D.countdown(d)) + '</span>' : '') + '</p>' + act +
        '<div class="btn-row dr-mini"><button class="btn btn-ghost btn-sm" id="dr-ics">' + ui.icon('calendar-plus').s + ' Calendar</button><button class="btn btn-ghost btn-sm" id="dr-share">' + ui.icon('share-2').s + ' Share</button><a class="btn btn-ghost btn-sm" target="_blank" rel="noopener noreferrer" href="' + esc(D.mapsUrl(d)) + '">' + ui.icon('navigation').s + ' Directions</a></div></aside>';
    }
    function paint() {
      if (dead) return; var a = D.art(id), st = D.state(d), dt = new Date(d.date), manage = canManage(d, p);
      dd.innerHTML = '<section class="dr-banner-lg" style="--a:' + a[0] + ';--b:' + a[1] + '"><div class="dr-orbs" aria-hidden="true"><i></i><i></i><i></i></div><div class="dr-bl-main"><span class="dr-date lg"><strong>' + dt.getDate() + '</strong><small>' + esc(dt.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })) + '</small></span><div><p class="eyebrow">Hosted by ' + esc(d.hostName) + ' · ' + esc(MT.ROLE_LABEL[d.hostRole] || '') + '</p><h2>' + esc(d.title) + '</h2><p>' + esc(D.when(d)) + '</p>' +
        '<div class="chips">' + (st === 'live' ? '<span class="badge badge-warn">Live now</span>' : '') + (st === 'full' ? '<span class="badge badge-bad">Full</span>' : '') + (st === 'cancelled' ? '<span class="badge badge-bad">Cancelled</span>' : '') + (st === 'past' ? '<span class="badge badge-neutral">Finished</span>' : '') + (d.saplings ? '<span class="badge badge-ok">🌱 ' + d.saplings + ' saplings provided</span>' : '') + '</div></div></div></section>' +
        '<div class="dr-layout"><div class="dr-main">' + (manage ? '<div class="tabs" id="dd-tabs">' + [['about', 'About'], ['people', 'Volunteers']].map(function (t) { return '<a class="tab-link' + (S.tab === t[0] ? ' active' : '') + '" href="#/drives/' + esc(id) + '" data-t="' + t[0] + '">' + t[1] + '</a>'; }).join('') + '</div>' : '') + '<div id="dd-body"></div></div>' + joinPanel() + '</div>';
      ui.icons(); body(); var qr = MT.$('#dr-qr', host); if (qr && reg && MT.qr) MT.qr.dataUrl(D.url(id), 120).then(function (u) { if (u && qr.isConnected) qr.innerHTML = '<img src="' + u + '" alt="" width="96" height="96">'; }).catch(function () {});
    }
    function body() {
      var b = MT.$('#dd-body', host), manage = canManage(d, p);
      if (S.tab === 'people' && manage) return people(b);
      b.innerHTML = '<div class="card"><h3>About this drive</h3><p>' + esc(d.description || 'Join us to plant trees together.') + '</p><dl class="kv kv-2"><dt>When</dt><dd>' + esc(D.when(d)) + '</dd><dt>Where</dt><dd>' + esc(d.address) + '</dd>' + (d.bring ? '<dt>Please bring</dt><dd>' + esc(d.bring) + '</dd>' : '') + (d.saplings ? '<dt>Saplings</dt><dd>' + d.saplings + ' provided by the host</dd>' : '') + (reg && reg.status !== 'cancelled' && d.phone ? '<dt>Host contact</dt><dd>' + esc(d.phone) + '</dd>' : '') + '</dl></div>' +
        '<div class="card"><div class="card-head"><h3>Site location</h3><a target="_blank" rel="noopener noreferrer" href="' + esc(D.mapsUrl(d)) + '">Open in Maps</a></div><div class="detail-map" id="dd-map"></div></div>' +
        (isHost(d, p) ? '<div class="card"><h3>Host tools</h3><div class="btn-row"><button class="btn btn-soft btn-sm" id="dr-edit">' + ui.icon('pencil').s + ' Edit</button>' + (d.status === 'open' ? '<button class="btn btn-soft btn-sm" id="dr-done">Mark as finished</button><button class="btn btn-danger-soft btn-sm" id="dr-cancel-drive">Cancel drive</button>' : '') + '<a class="btn btn-ghost btn-sm" href="#/plant?drive=' + esc(id) + '">' + ui.icon('sprout').s + ' Plant here</a></div></div>' : ''); ui.icons();
      if (map) { map.remove(); map = null; } MT.maps.create(MT.$('#dd-map', host), { locate: false, satelliteToggle: true }).then(function (m) { if (dead) return m.remove(); map = m; L.marker([d.lat, d.lng], { icon: L.divIcon({ className: 'dr-pin-wrap', iconSize: [34, 34], iconAnchor: [17, 17], html: '<span class="dr-pin" style="--c:#2e9e5b">🌳</span>' }) }).addTo(m); try { m.setView([d.lat, d.lng], 15, { animate: false }); } catch (e) { /* removed */ } }).catch(function () {});
    }
    function people(b) {
      b.innerHTML = ui.skeleton(3, 'sk-line').s;
      var where = p.role === 'super_admin' ? [['driveId', '==', id]] : d.hostId === p.userId ? [['hostId', '==', p.userId], ['driveId', '==', id]] : [['ancestorOrgIds', 'array-contains', p.orgId], ['driveId', '==', id]];
      MT.db.list('driveRegs', { where: where, limit: 1000 }).catch(function () { return []; }).then(function (rows) {
        if (dead) return; rows = rows.filter(function (r) { return r.status !== 'cancelled'; }).sort(function (a, c) { return a.at - c.at; }); var ppl = rows.reduce(function (a, r) { return a + r.party; }, 0), att = rows.filter(function (r) { return r.status === 'attended'; }).length;
        b.innerHTML = '<div class="sum-row"><div class="sum"><strong>' + rows.length + '</strong><span>registrations</span></div><div class="sum"><strong>' + ppl + '</strong><span>people</span></div><div class="sum sum-ok"><strong>' + att + '</strong><span>checked in</span></div><div class="sum"><strong>' + Math.max(0, d.capacity - ppl) + '</strong><span>spots left</span></div></div>' +
          '<div class="card"><div class="ws-toolbar"><button class="btn btn-soft btn-sm" id="pp-all">Check everyone in</button><button class="btn btn-ghost btn-sm" id="pp-csv">Export CSV</button><span class="fine">Tap a name to toggle check-in on the day.</span></div><div class="table-wrap"><table class="table"><thead><tr><th>Name</th><th>Role</th><th>People</th><th>Registered</th><th>Check-in</th></tr></thead><tbody>' + (rows.length ? rows.map(function (r) { return '<tr><td>' + esc(r.name) + '</td><td>' + esc(MT.ROLE_LABEL[r.role] || r.role) + '</td><td>' + r.party + '</td><td>' + esc(kit.dateOnly(r.at)) + '</td><td><button class="btn ' + (r.status === 'attended' ? 'btn-primary' : 'btn-soft') + ' btn-sm" data-ck="' + esc(r.id) + '" aria-pressed="' + (r.status === 'attended') + '">' + (r.status === 'attended' ? '✓ Here' : 'Check in') + '</button></td></tr>'; }).join('') : '<tr><td colspan="5" class="muted">Nobody has registered yet — share the drive link!</td></tr>') + '</tbody></table></div></div>';
        b.onclick = function (e) {
          var c = e.target.closest('[data-ck]'), all = e.target.closest('#pp-all'), csv = e.target.closest('#pp-csv');
          if (c) { var r = rows.filter(function (x) { return x.id === c.dataset.ck; })[0], ns = r.status === 'attended' ? 'registered' : 'attended'; MT.db.update('driveRegs', r.id, { status: ns, checkedAt: Date.now() }).then(function () { people(b); }).catch(ui.error); }
          else if (all) { var bt = MT.db.batch(); rows.forEach(function (r) { if (r.status !== 'attended') bt.update('driveRegs', r.id, { status: 'attended', checkedAt: Date.now() }); }); bt.commit().then(function () { ui.success('Everyone is checked in.'); people(b); }).catch(ui.error); }
          else if (csv) { var out = [['Name', 'Role', 'People', 'Status']].concat(rows.map(function (r) { return [r.name, r.role, r.party, r.status]; })); MT.download('drive-' + id + '-volunteers.csv', '﻿' + out.map(function (r) { return r.map(function (x) { x = String(x); return /[",\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; }).join(','); }).join('\r\n'), 'text/csv'); }
        };
      });
    }
    host.addEventListener('click', function (e) {
      var t;
      if (e.target.closest('#dr-plus')) { party = Math.min(Math.min(5, D.spots(d)), party + 1); MT.$('#dr-party', host).textContent = party; }
      else if (e.target.closest('#dr-minus')) { party = Math.max(1, party - 1); MT.$('#dr-party', host).textContent = party; }
      else if (e.target.closest('#dr-reg')) { var bt = e.target.closest('#dr-reg'); bt.disabled = true; D.register(d, party).then(function () { ui.confetti(); ui.success('You’re registered! See you there 🌳'); return load().then(paint); }).catch(function (er) { bt.disabled = false; load().then(paint); ui.error(/permission|insufficient/i.test(String(er && er.message)) ? MT.userError('Sorry — the last spots were just taken. Spots left: ' + D.spots(d) + '.') : er); }); }
      else if (e.target.closest('#dr-cancel')) ui.confirm('Cancel your registration?', 'Your spot goes back to other volunteers.', 'Cancel registration', true).then(function (ok) { if (ok) D.cancel(d, reg).then(function () { ui.success('Registration cancelled.'); return load().then(paint); }).catch(ui.error); });
      else if (e.target.closest('#dr-ics')) ics();
      else if (e.target.closest('#dr-share')) { var u = D.url(id); if (navigator.share) navigator.share({ title: d.title, text: 'Join the plantation drive: ' + d.title, url: u }).catch(function () {}); else MT.copy(u).then(function () { ui.success('Link copied — share it with friends!'); }); }
      else if (e.target.closest('#dr-edit')) driveForm(d, function () { load().then(paint); });
      else if (e.target.closest('#dr-done')) MT.db.update('drives', id, { status: 'done' }).then(function () { ui.success('Marked as finished.'); return load().then(paint); }).catch(ui.error);
      else if (e.target.closest('#dr-cancel-drive')) ui.confirm('Cancel this drive?', 'Registered volunteers will see it as cancelled.', 'Cancel drive', true).then(function (ok) { if (ok) MT.db.update('drives', id, { status: 'cancelled' }).then(function () { return load().then(paint); }).catch(ui.error); });
      else if ((t = e.target.closest('#dd-tabs [data-t]'))) { e.preventDefault(); S.tab = t.dataset.t; MT.$$('#dd-tabs .tab-link', host).forEach(function (x) { x.classList.toggle('active', x === t); }); body(); }
    });
    load().then(function () { paint(); if (ctx.query && ctx.query.reg && !reg && D.state(d) !== 'full') { var j = MT.$('.dr-join', host); if (j) j.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
      timer = setInterval(function () { if (!dd.isConnected || document.querySelector('dialog[open]')) return; MT.db.get('drives', id).then(function (x) { if (x && (x.registered !== d.registered || x.status !== d.status)) { d = x; paint(); } }).catch(function () {}); }, 20000); /* live spot count */ }).catch(function (e) { dd.innerHTML = ui.empty({ icon: 'tent-tree', title: 'Drive not available', text: MT.friendlyError(e) }).s; ui.icons(); });
    return function () { dead = true; if (timer) clearInterval(timer); if (map) map.remove(); };
  }

  MT.router.add('/drives', { title: 'Plantation drives', layout: 'app', access: ALL, render: listPage, after: listAfter });
  MT.router.add('/drives/:id', { title: 'Drive', layout: 'app', access: ALL, render: detailPage, after: detailAfter });
})();
