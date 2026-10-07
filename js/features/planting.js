/**
 * MyTree — "Plant a tree": 4-step animated stepper (Species → Location → Details → Review) and success screen.
 */
(function () {
  'use strict';
  var MT = window.MT, h = MT.html, raw = MT.raw, ui = MT.ui, F = ui.field;
  var STEPS = [['Species', 'sprout'], ['Location', 'map-pin'], ['Details', 'clipboard-list'], ['Review', 'check-check']];

  function today() { return MT.fmt.iso(new Date()); }

  function render() {
    return h`<div class="page planter" data-reveal>
      <div class="page-head"><h2>Plant a tree</h2><p class="muted">Four quick steps. You can go back at any time — nothing is saved until you confirm.</p></div>
      <div class="stepper-card card">
        <ol class="stepper" id="stepper" aria-label="Progress">${STEPS.map(function (s, i) { return h`<li data-step="${i}"><span class="st-dot">${ui.icon(s[1])}</span><span class="st-label">${s[0]}</span></li>`; })}</ol>
        <div class="st-bar"><span id="st-fill"></span></div>
        <div id="step-panel" class="step-panel" tabindex="-1"></div>
        <p class="step-err" id="step-err" role="alert"></p>
        <div class="step-nav"><button type="button" class="btn btn-ghost" id="st-back">${ui.icon('arrow-left')} Back</button><button type="button" class="btn btn-primary btn-lg" id="st-next"><span class="btn-label">Next</span> ${ui.icon('arrow-right')}<span class="spinner-sm"></span></button></div>
      </div></div>`;
  }

  function after(host, ctx) {
    var me = MT.auth.profile(), S = {
      step: 0, speciesId: '', customName: '', count: 1, owner: me, ownerLabel: 'Myself', lat: null, lng: null, address: '', geo: null, polygon: null, areaM2: 0,
      plantedOn: today(), heightCm: '', dedication: '', notes: '', cadence: 'monthly', pub: false, photo: null, photoSrc: '', exif: null, plotName: ''
    };
    var panel = MT.$('#step-panel', host), errEl = MT.$('#step-err', host), nextBtn = MT.$('#st-next', host), backBtn = MT.$('#st-back', host);
    var cleanups = [], map = null, usersCache = null, fuse = null, done = false;

    function setErr(m) { errEl.textContent = m || ''; if (m) errEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    function go(n) {
      if (map) { map.remove(); map = null; }
      S.step = n; setErr('');
      MT.$$('#stepper li', host).forEach(function (li, i) { li.classList.toggle('done', i < n); li.classList.toggle('current', i === n); if (i === n) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current'); });
      MT.$('#st-fill', host).style.width = (n / (STEPS.length - 1) * 100) + '%';
      backBtn.style.visibility = n === 0 ? 'hidden' : 'visible';
      MT.$('.btn-label', nextBtn).textContent = n === 3 ? 'Confirm & plant' : 'Next';
      panel.classList.remove('slide'); void panel.offsetWidth; panel.classList.add('slide');
      [stepSpecies, stepLocation, stepDetails, stepReview][n]();
      ui.icons(); window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    /* ---------- Step 1: species ---------- */
    function ownerPicker() {
      if (!MT.auth.isManager()) return '';
      return '<div class="field field-wide"><label for="owner-q">Who is this tree for?</label><input id="owner-q" list="owner-list" placeholder="Myself — or type a name / user ID to plant on someone’s behalf" value="' + MT.esc(S.owner === me ? '' : S.ownerLabel) + '" autocomplete="off"><datalist id="owner-list"></datalist><p class="field-hint">Posting for someone else is recorded in the audit log: “Posted by ' + MT.esc(me.name) + ' on behalf of …”.</p></div>';
    }
    function loadUsers() {
      if (usersCache) return Promise.resolve(usersCache);
      var where = MT.auth.isSuper() ? [] : [['ancestorOrgIds', 'array-contains', me.orgId]];
      return MT.db.list('users', { where: where, limit: 2000 }).then(function (rows) {
        usersCache = rows.filter(function (u) { return u.active && u.status !== 'replaced' && u.role !== 'super_admin'; });
        return usersCache;
      });
    }
    function stepSpecies() {
      panel.innerHTML = '<h3>What are you planting?</h3><div class="form-grid">' +
        '<div class="field field-wide"><label for="sp-q">Search species</label><input id="sp-q" type="search" placeholder="Neem, mango, Azadirachta indica…" autocomplete="off"><p class="field-hint">' + MT.species.list.length + ' Indian and common species. Can’t find yours? Choose “Other”.</p></div>' +
        '<div class="chips field-wide" id="sp-chips" role="group" aria-label="Filter species"></div>' +
        '<ul class="sp-list field-wide" id="sp-list" role="listbox" aria-label="Species"></ul>' +
        '<div class="field field-wide" id="sp-detail"></div>' +
        '<div class="field"><label for="sp-count">How many saplings?</label><div class="qty"><button type="button" class="icon-btn" data-qty="-1" aria-label="Fewer">−</button><input id="sp-count" type="number" min="1" max="' + MT.trees.MAX_PER_POST + '" value="' + S.count + '" inputmode="numeric"><button type="button" class="icon-btn" data-qty="1" aria-label="More">+</button></div><p class="field-hint">Each sapling gets its own ID and QR; they share one plot. For more than ' + MT.trees.MAX_PER_POST + ', use Bulk upload.</p></div>' +
        ownerPicker() + '</div>';
      var cat = 'all', q = MT.$('#sp-q', panel), list = MT.$('#sp-list', panel);
      var cats = [['all', 'All'], ['native', 'Native'], ['shade', 'Shade'], ['fruit', 'Fruit'], ['flowering', 'Flowering'], ['timber', 'Timber'], ['medicinal', 'Medicinal'], ['palm', 'Palms']];
      MT.$('#sp-chips', panel).innerHTML = cats.map(function (c) { return '<button type="button" class="chip' + (c[0] === cat ? ' on' : '') + '" data-cat="' + c[0] + '" aria-pressed="' + (c[0] === cat) + '">' + c[1] + '</button>'; }).join('');
      function matches() {
        var term = q.value.trim(), arr;
        if (term && fuse) arr = fuse.search(term).map(function (r) { return r.item; });
        else if (term) arr = MT.species.list.map(function (s) { return { s: s, v: MT.palette.score(term, s.common + ' ' + s.scientific) }; }).filter(function (x) { return x.v > 0; }).sort(function (a, b) { return b.v - a.v; }).map(function (x) { return x.s; });
        else arr = MT.species.list.slice().sort(function (a, b) { return a.common.localeCompare(b.common); });
        if (cat === 'native') arr = arr.filter(function (s) { return s.native; }); else if (cat !== 'all') arr = arr.filter(function (s) { return s.category === cat; });
        return arr;
      }
      function draw() {
        var arr = matches();
        list.innerHTML = arr.map(function (s) {
          return '<li role="option" aria-selected="' + (S.speciesId === s.id) + '"><button type="button" class="sp-item' + (S.speciesId === s.id ? ' sel' : '') + '" data-id="' + MT.esc(s.id) + '"><span class="sp-name">' + MT.esc(s.common) + '</span><em>' + MT.esc(s.scientific) + '</em><span class="sp-tags"><span class="tag ' + (s.native ? 'tag-ok' : '') + '">' + (s.native ? 'Native' : 'Introduced') + '</span><span class="tag">' + MT.esc(s.category) + '</span></span></button></li>';
        }).join('') + '<li role="option"><button type="button" class="sp-item' + (S.speciesId === 'other' ? ' sel' : '') + '" data-id="other"><span class="sp-name">Other (not listed)</span><em>Type its name below</em></button></li>';
        if (!arr.length) list.insertAdjacentHTML('afterbegin', '<li class="sp-none">No match — try another spelling, or pick “Other”.</li>');
        detail();
      }
      function detail() {
        var d = MT.$('#sp-detail', panel); if (!S.speciesId) { d.innerHTML = ''; return; }
        var s = MT.species.get(S.speciesId);
        d.innerHTML = '<div class="sp-card">' + (S.speciesId === 'other' ? '<label for="sp-custom">Name of the tree <span class="req">*</span></label><input id="sp-custom" maxlength="60" value="' + MT.esc(S.customName) + '" placeholder="e.g. Local name or your own"><p class="field-hint">Care tip: ' + MT.esc(s.tip) + '</p>' :
          '<strong>' + MT.esc(s.common) + '</strong> <em>' + MT.esc(s.scientific) + '</em><p>' + MT.esc(s.tip) + '</p><p class="fine">Grows up to ~' + s.maxH + ' m · absorbs an estimated ' + s.co2 + ' kg CO₂/year at maturity (estimate).</p>') + '</div>';
        var cu = MT.$('#sp-custom', d); if (cu) cu.addEventListener('input', function () { S.customName = cu.value; });
      }
      var debounced = MT.debounce(draw, 120); q.addEventListener('input', debounced);
      MT.loader.load('fuse').then(function () { fuse = new Fuse(MT.species.list, { keys: ['common', 'scientific'], threshold: 0.35, ignoreLocation: true }); if (q.value) draw(); }).catch(function () {});
      MT.$('#sp-chips', panel).addEventListener('click', function (e) { var b = e.target.closest('[data-cat]'); if (!b) return; cat = b.dataset.cat; MT.$$('#sp-chips .chip', panel).forEach(function (x) { var on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); }); draw(); });
      list.addEventListener('click', function (e) { var b = e.target.closest('[data-id]'); if (!b) return; S.speciesId = b.dataset.id; MT.$$('.sp-item', list).forEach(function (x) { x.classList.toggle('sel', x === b); x.parentNode.setAttribute('aria-selected', x === b); }); detail(); var d = MT.$('#sp-detail', panel); d.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); setErr(''); });
      var ci = MT.$('#sp-count', panel);
      ci.addEventListener('input', function () { S.count = Math.max(1, Math.min(MT.trees.MAX_PER_POST, parseInt(ci.value, 10) || 1)); });
      ci.addEventListener('blur', function () { ci.value = S.count; });
      panel.addEventListener('click', function (e) { var b = e.target.closest('[data-qty]'); if (b) { S.count = Math.max(1, Math.min(MT.trees.MAX_PER_POST, S.count + (+b.dataset.qty))); ci.value = S.count; } });
      var oq = MT.$('#owner-q', panel);
      if (oq) {
        loadUsers().then(function (users) {
          MT.$('#owner-list', panel).innerHTML = users.slice(0, 1500).map(function (u) { return '<option value="' + MT.esc(u.name + ' — ' + u.userId) + '"></option>'; }).join('');
        }).catch(function () {});
        oq.addEventListener('change', function () {
          var v = oq.value.trim();
          if (!v) { S.owner = me; S.ownerLabel = 'Myself'; return; }
          var m = /(MT-[A-Z]{3}-[A-Z0-9-]+)\s*$/.exec(v), id = m ? m[1] : v.toUpperCase();
          var u = (usersCache || []).filter(function (x) { return x.userId === id || x.name.toLowerCase() === v.toLowerCase(); })[0];
          if (u) { S.owner = u; S.ownerLabel = u.name + ' — ' + u.userId; ui.toast('Planting for ' + u.name, { duration: 1800 }); }
          else { S.owner = me; setErr('We could not find that person in your organisation. Choose from the suggestions, or leave blank to plant for yourself.'); }
        });
      }
      draw();
    }

    /* ---------- Step 2: location ---------- */
    var marker = null, drawn = null, drawCtl = null;
    function setPos(lat, lng, o) {
      o = o || {}; S.lat = +lat.toFixed(6); S.lng = +lng.toFixed(6);
      if (marker) marker.setLatLng([S.lat, S.lng]);
      else if (map) { marker = L.marker([S.lat, S.lng], { draggable: true, icon: MT.maps.pinIcon(), autoPan: true }).addTo(map); marker.on('dragend', function () { var p = marker.getLatLng(); setPos(p.lat, p.lng, { keepView: true }); }); }
      if (map && !o.keepView) map.setView([S.lat, S.lng], Math.max(map.getZoom(), 17), { animate: true });
      readout(); geoCheck();
      clearTimeout(setPos._t); setPos._t = setTimeout(function () {
        var a = MT.$('#loc-addr', panel); if (a) a.textContent = 'Looking up address…';
        MT.geocode.reverse(S.lat, S.lng).then(function (r) { S.geo = r; S.address = r ? r.label : ''; var a2 = MT.$('#loc-addr', panel); if (a2) a2.textContent = S.address || 'Address not available — that is fine.'; });
      }, 900);
    }
    function readout() { var r = MT.$('#loc-read', panel); if (r) r.textContent = S.lat == null ? 'No location chosen yet — tap the map, search, or use GPS.' : S.lat.toFixed(6) + ', ' + S.lng.toFixed(6); }
    function geoCheck() {
      var w = MT.$('#loc-warn', panel); if (!w) return; w.innerHTML = ''; S.geoFlag = '';
      var city = S.owner && S.owner.orgId ? (MT.auth.session().org && S.owner.orgId === MT.auth.session().org.id ? MT.auth.session().org.city : null) : null;
      var c = city ? MT.geoData.city(city) : null;
      if (c && S.lat != null) { var km = MT.geo.distance(S.lat, S.lng, c.lat, c.lng) / 1000; if (km > c.r) { S.geoFlag = 'outside_city'; w.innerHTML = '<div class="warn-note">⚠️ This spot is about ' + Math.round(km) + ' km from ' + MT.esc(c.name) + ', where your organisation is based. Double-check the pin — you can still continue.</div>'; ui.icons(); } }
    }
    function stepLocation() {
      panel.innerHTML = '<h3>Where is it planted?</h3><div class="loc-tools">' +
        '<div class="field"><label for="loc-q">Search an address or place</label><div class="search-wrap"><input id="loc-q" type="search" placeholder="e.g. Sunrise Public School, Pune" autocomplete="off"><ul class="geo-results" id="geo-results" hidden></ul></div></div>' +
        '<div class="btn-row tight"><button type="button" class="btn btn-soft" id="loc-gps">' + ui.icon('locate-fixed').s + ' Use my current location</button><button type="button" class="btn btn-ghost" id="loc-poly">' + ui.icon('pentagon').s + ' Mark plot area</button><button type="button" class="btn btn-ghost" id="loc-clear" hidden>Clear plot</button></div></div>' +
        '<div class="picker-map" id="picker-map" role="application" aria-label="Map: tap to place the tree"></div>' +
        '<div class="loc-info"><div><span class="fine">Coordinates</span><strong id="loc-read"></strong></div><div class="grow"><span class="fine">Address</span><span id="loc-addr">—</span></div><div id="plot-info" class="fine"></div></div><div id="loc-warn"></div>' +
        (S.exif && S.exif.lat != null ? '<p class="fine">📷 Your photo has a location. <button type="button" class="link-btn" id="use-exif">Use photo location</button></p>' : '') +
        '<p class="fine">Tip: drag the pin to fine-tune. Switch to satellite with the layers button on the map.</p>';
      var el = MT.$('#picker-map', panel);
      var start = S.lat != null ? [S.lat, S.lng] : (function () { var c = MT.auth.session().org && MT.geoData.city(MT.auth.session().org.city); return c ? [c.lat, c.lng] : [21.5, 79]; })();
      MT.maps.create(el, { center: start, zoom: S.lat != null ? 17 : (MT.auth.session().org ? 11 : 5), onLocate: function (la, ln) { setPos(la, ln); } }).then(function (m) {
        if (S.step !== 1) { m.remove(); return; }
        map = m; marker = null;
        if (S.lat != null) setPos(S.lat, S.lng, { keepView: true });
        m.on('click', function (e) { if (drawCtl && drawCtl._enabled) return; setPos(e.latlng.lat, e.latlng.lng, { keepView: true }); });
        if (S.polygon) drawPoly(S.polygon.map(function (p) { return [p.lat, p.lng]; }));
      }).catch(function (e) { el.innerHTML = '<div class="empty"><h3>Map unavailable</h3><p>' + MT.esc(MT.friendlyError(e)) + '</p></div>'; });
      readout();
      var gq = MT.$('#loc-q', panel), gr = MT.$('#geo-results', panel);
      gq.addEventListener('input', MT.debounce(function () {
        MT.geocode.search(gq.value).then(function (rows) {
          gr.hidden = !rows.length; gr.innerHTML = rows.map(function (r, i) { return '<li><button type="button" data-i="' + i + '">' + MT.esc(r.label) + '</button></li>'; }).join('');
          gr._rows = rows;
        });
      }, 600));
      gr.addEventListener('click', function (e) { var b = e.target.closest('[data-i]'); if (!b) return; var r = gr._rows[+b.dataset.i]; gr.hidden = true; gq.value = r.label; if (map) { map.setView([r.lat, r.lng], 17); setPos(r.lat, r.lng, { keepView: true }); } });
      MT.$('#loc-gps', panel).addEventListener('click', function () { if (map) MT.maps.locate(map, function (la, ln) { setPos(la, ln); }); });
      var ue = MT.$('#use-exif', panel); if (ue) ue.addEventListener('click', function () { setPos(S.exif.lat, S.exif.lng); });
      MT.$('#loc-poly', panel).addEventListener('click', startPoly);
      MT.$('#loc-clear', panel).addEventListener('click', function () { S.polygon = null; S.areaM2 = 0; if (drawn) { map.removeLayer(drawn); drawn = null; } MT.$('#loc-clear', panel).hidden = true; MT.$('#plot-info', panel).textContent = ''; });
    }
    function drawPoly(latlngs) {
      if (!map) return; if (drawn) map.removeLayer(drawn);
      drawn = L.polygon(latlngs, { color: '#237d49', weight: 3, fillOpacity: 0.2 }).addTo(map);
      var area = 0;
      try { area = L.GeometryUtil ? L.GeometryUtil.geodesicArea(drawn.getLatLngs()[0]) : 0; } catch (e) { area = 0; }
      S.polygon = latlngs.map(function (p) { return { lat: +p[0].toFixed(6), lng: +p[1].toFixed(6) }; }); S.areaM2 = Math.round(area);
      MT.$('#loc-clear', panel).hidden = false;
      MT.$('#plot-info', panel).textContent = 'Plot area ≈ ' + MT.fmt.num(S.areaM2) + ' m²';
      if (S.lat == null) { var c = drawn.getBounds().getCenter(); setPos(c.lat, c.lng, { keepView: true }); }
    }
    function startPoly() {
      MT.loader.load('leafletdraw').then(function () {
        if (!map) return;
        ui.toast('Tap each corner of the plot, then tap the first corner to finish.', { duration: 4500 });
        drawCtl = new L.Draw.Polygon(map, { shapeOptions: { color: '#237d49', weight: 3 }, allowIntersection: false, showArea: false });
        drawCtl._enabled = true; drawCtl.enable();
        map.once('draw:created', function (e) { drawCtl._enabled = false; drawPoly(e.layer.getLatLngs()[0].map(function (p) { return [p.lat, p.lng]; })); });
        map.once('draw:drawstop', function () { drawCtl._enabled = false; });
      }).catch(function () { ui.toast('The plot-drawing tool could not load. You can still plant with a single pin.', { type: 'warn' }); });
    }

    /* ---------- Step 3: details ---------- */
    function stepDetails() {
      var student = me.role === 'student' || (S.owner && S.owner.role === 'student');
      panel.innerHTML = '<h3>A few details</h3><div class="form-grid">' +
        F({ id: 'plantedOn', label: 'Planting date', type: 'date', value: S.plantedOn, required: true, attrs: 'max="' + today() + '"' }).s +
        F({ id: 'heightCm', label: 'Sapling height (cm, optional)', type: 'number', value: S.heightCm, attrs: 'min="0" max="3000" inputmode="numeric"' }).s +
        F({ id: 'cadence', label: 'How often will you post updates?', type: 'select', value: S.cadence, options: MT.trees.CADENCES.map(function (c) { return { value: c[0], label: c[1] }; }), hint: 'We will show “update due” in your notifications.' }).s +
        (S.count > 1 || S.polygon ? F({ id: 'plotName', label: 'Plot name (optional)', value: S.plotName, attrs: 'maxlength="80"', hint: 'All ' + S.count + ' saplings share this plot.' }).s : '') +
        F({ id: 'dedication', label: 'Dedication / in memory of (optional)', value: S.dedication, attrs: 'maxlength="200"', wide: true, placeholder: 'e.g. In memory of Dadaji' }).s +
        F({ id: 'notes', label: 'Notes (optional)', type: 'textarea', value: S.notes, attrs: 'maxlength="500"', wide: true }).s +
        '<div class="field field-wide"><label>Photo (optional)</label><div class="photo-pick"><div class="photo-prev" id="photo-prev">' + (S.photoSrc ? '<img src="' + S.photoSrc + '" alt="Photo preview">' : ui.icon('camera').s) + '</div><div class="grow">' +
        '<div class="btn-row tight"><label class="btn btn-soft">' + ui.icon('camera').s + ' Take photo<input type="file" id="photo-cam" accept="image/*" capture="environment" hidden></label><label class="btn btn-ghost">' + ui.icon('image').s + ' From gallery<input type="file" id="photo-gal" accept="image/*" hidden></label><button type="button" class="btn btn-ghost" id="photo-rm" ' + (S.photo ? '' : 'hidden') + '>Remove</button></div>' +
        '<p class="field-hint" id="photo-info">' + (S.photo ? 'Compressed to ' + MT.fmt.bytes(S.photo.full.size) + '.' : 'Photos are shrunk on your device (about 250 KB) before saving.') + '</p></div></div></div>' +
        (student ? '<p class="fine field-wide">🔒 Trees planted by students are never public. A school admin decides what is shared.</p>' : '<div class="field-wide">' + F({ id: 'pub', type: 'checkbox', label: 'Make this tree’s page public (anyone with the QR link can see species, date and growth — never personal details)', value: S.pub }).s + '</div>') +
        '</div>';
      if (!student) { var pc = MT.$('#f-pub', panel); if (pc) { pc.checked = S.pub; pc.addEventListener('change', function () { S.pub = pc.checked; }); } }
      var bind = function (id, key) { var el = MT.$('#f-' + id, panel); if (el) el.addEventListener('input', function () { S[key] = el.value; }); };
      bind('plantedOn', 'plantedOn'); bind('heightCm', 'heightCm'); bind('cadence', 'cadence'); bind('plotName', 'plotName'); bind('dedication', 'dedication'); bind('notes', 'notes');
      function picked(file) {
        if (!file) return;
        var info = MT.$('#photo-info', panel); info.textContent = 'Compressing…';
        MT.photoStore.prepare(file).then(function (p) {
          S.photo = p; S.photoSrc = p.thumb.dataUrl;
          MT.$('#photo-prev', panel).innerHTML = '<img src="' + S.photoSrc + '" alt="Photo preview">'; MT.$('#photo-rm', panel).hidden = false;
          info.textContent = 'Compressed to ' + MT.fmt.bytes(p.full.size) + ' (thumbnail ' + MT.fmt.bytes(p.thumb.size) + ').';
          return MT.loader.load('exifr').then(function () { return Promise.all([window.exifr.gps(file).catch(function () { return null; }), window.exifr.parse(file, ['DateTimeOriginal']).catch(function () { return null; })]); }).then(function (r) {
            var g = r[0], d = r[1] && r[1].DateTimeOriginal;
            if (g && g.latitude != null) { S.exif = { lat: g.latitude, lng: g.longitude }; if (S.lat == null) { S.lat = +g.latitude.toFixed(6); S.lng = +g.longitude.toFixed(6); } ui.toast('📷 Found the location in your photo — we’ll use it on the map step.', { duration: 4000 }); }
            if (d instanceof Date && !isNaN(d) && d <= new Date() && (Date.now() - d) < 5 * 365 * 86400000) { S.plantedOn = MT.fmt.iso(d); var di = MT.$('#f-plantedOn', panel); if (di) di.value = S.plantedOn; }
          }).catch(function () {});
        }).catch(function (e) { info.textContent = ''; ui.error(e); });
      }
      ['photo-cam', 'photo-gal'].forEach(function (id) { MT.$('#' + id, panel).addEventListener('change', function (e) { picked(e.target.files[0]); }); });
      MT.$('#photo-rm', panel).addEventListener('click', function () { S.photo = null; S.photoSrc = ''; MT.$('#photo-prev', panel).innerHTML = ui.icon('camera').s; this.hidden = true; MT.$('#photo-info', panel).textContent = 'Photo removed.'; ui.icons(); });
    }
    function validateDetails() {
      if (!S.plantedOn) return 'Please choose the planting date.';
      if (S.plantedOn > today()) return 'The planting date cannot be in the future.';
      if (S.plantedOn < '1990-01-01') return 'That planting date looks too old.';
      if (S.heightCm !== '' && (isNaN(+S.heightCm) || +S.heightCm < 0 || +S.heightCm > 3000)) return 'Sapling height should be between 0 and 3000 cm.';
      return '';
    }

    /* ---------- Step 4: review ---------- */
    function stepReview() {
      var sp = MT.species.get(S.speciesId), name = S.speciesId === 'other' ? S.customName : sp.common;
      var rows = [['Species', (S.count > 1 ? S.count + ' × ' : '') + name + (sp.scientific ? ' (' + sp.scientific + ')' : '')], ['For', S.owner === me ? 'Myself' : S.owner.name + ' (posted by you on their behalf)'],
        ['Location', S.lat.toFixed(6) + ', ' + S.lng.toFixed(6)], ['Address', S.address || '—'], ['Planted on', MT.fmt.date(S.plantedOn)], ['Update cadence', S.cadence],
        ['Height', S.heightCm !== '' ? S.heightCm + ' cm' : '—']];
      if (S.polygon) rows.push(['Plot area', '≈ ' + MT.fmt.num(S.areaM2) + ' m²']);
      if (S.dedication) rows.push(['Dedication', S.dedication]);
      if (S.notes) rows.push(['Notes', S.notes]);
      rows.push(['Public page', S.pub ? 'Yes — anyone with the link' : 'No (private)']);
      panel.innerHTML = '<h3>Ready to plant?</h3><div class="review">' + (S.photoSrc ? '<img class="review-img" src="' + S.photoSrc + '" alt="Your photo">' : '<div class="review-img">' + ui.treeArt('thriving', 160).s + '</div>') +
        '<dl class="kv">' + rows.map(function (r) { return '<dt>' + MT.esc(r[0]) + '</dt><dd>' + MT.esc(r[1]) + '</dd>'; }).join('') + '</dl></div>' +
        (S.geoFlag ? '<div class="warn-note">⚠️ The pin is far from your organisation’s city. It will be flagged for review.</div>' : '') +
        '<p class="fine">Each tree gets a unique ID like <code>TREE-' + new Date().getFullYear() + '-000123</code> and a QR code.</p>';
    }

    /* ---------- Navigation ---------- */
    function validate(n) {
      if (n === 0) { if (!S.speciesId) return 'Please choose a species (or “Other”).'; if (S.speciesId === 'other' && S.customName.trim().length < 2) return 'Please type the name of your tree.'; if (S.count < 1) return 'Plant at least one sapling.'; }
      if (n === 1 && S.lat == null) return 'Please place the pin on the map — tap the map, search, or use GPS.';
      if (n === 2) return validateDetails();
      return '';
    }
    function duplicateCheck() {
      if (S.speciesId === 'other') return Promise.resolve(null);
      var p8 = MT.geo.geohash(S.lat, S.lng, 8);
      return MT.db.list('trees', { where: [['ownerId', '==', S.owner.userId], ['geohash', '>=', p8], ['geohash', '<', p8 + '~']], limit: 50 }).then(function (rows) {
        return rows.filter(function (t) { return t.status !== 'dead' && t.code !== S.replaces && t.speciesId === S.speciesId && MT.geo.distance(S.lat, S.lng, t.lat, t.lng) < 0.5; })[0] || null;
      }).catch(function () { return null; });
    }
    nextBtn.addEventListener('click', function () {
      if (done) return;
      var msg = validate(S.step); if (msg) { setErr(msg); return; }
      if (S.step < 3) { go(S.step + 1); return; }
      nextBtn.disabled = true; nextBtn.classList.add('is-loading');
      duplicateCheck().then(function (dup) {
        if (!dup) return true;
        return ui.confirm('Already planted here?', 'You already have a ' + MT.species.get(dup.speciesId).common + ' (' + dup.code + ') within half a metre of this spot. Plant another anyway?', 'Plant anyway');
      }).then(function (ok) {
        if (!ok) { nextBtn.disabled = false; nextBtn.classList.remove('is-loading'); return; }
        return MT.trees.plant({ owner: S.owner, speciesId: S.speciesId, customName: S.customName, count: S.count, lat: S.lat, lng: S.lng, address: S.address, geo: S.geo, polygon: S.polygon, areaM2: S.areaM2,
          plantedOn: S.plantedOn, heightCm: S.heightCm, dedication: S.dedication, notes: S.notes, cadence: S.cadence, public: S.pub, photo: S.photo, plotName: S.plotName, geoFlag: S.geoFlag, replaces: S.replaces })
          .then(function (res) { done = true; success(res); });
      }).catch(function (e) { nextBtn.disabled = false; nextBtn.classList.remove('is-loading'); ui.error(e); setErr('We could not save your tree. Your details are still here — please try again.'); });
    });
    backBtn.addEventListener('click', function () { if (S.step > 0 && !done) go(S.step - 1); });

    /* ---------- Success ---------- */
    function success(res) {
      var first = res.trees[0], sp = MT.species.get(first.speciesId);
      MT.$('#stepper', host).hidden = true; MT.$('.st-bar', host).hidden = true; MT.$('.step-nav', host).hidden = true; errEl.hidden = true;
      panel.innerHTML = '<div class="success"><div class="success-anim" id="success-anim" aria-hidden="true"></div><h2>' + (res.trees.length > 1 ? res.trees.length + ' trees planted!' : 'Your tree is planted!') + '</h2>' +
        '<p class="muted">Thank you for growing something good. 🌱</p>' +
        '<div class="success-grid"><div class="id-card"><span class="fine">Tree ID' + (res.trees.length > 1 ? 's' : '') + '</span><strong class="mono">' + MT.esc(first.code) + '</strong>' +
        (res.trees.length > 1 ? '<span class="fine">to ' + MT.esc(res.trees[res.trees.length - 1].code) + ' · plot ' + MT.esc(res.plotId) + '</span>' : '') +
        '<div id="success-qr" class="qr-box"></div><button type="button" class="btn btn-ghost btn-sm" id="qr-dl">Download QR</button></div>' +
        '<div class="share-card"><img id="share-img" alt="Shareable card: I planted a tree" width="270" height="375"><div class="btn-row tight"><button type="button" class="btn btn-primary" id="sh-wa">' + ui.icon('message-circle').s + ' WhatsApp</button><button type="button" class="btn btn-soft" id="sh-share">' + ui.icon('share-2').s + ' Share / save image</button></div></div></div>' +
        '<div class="btn-row center-row"><a class="btn btn-primary" href="#/trees/' + encodeURIComponent(first.code) + '">View my tree</a><button type="button" class="btn btn-soft" id="plant-more">Plant another</button><a class="btn btn-ghost" href="#/trees">My trees</a></div></div>';
      ui.icons(); ui.lottie(MT.$('#success-anim', panel), 'success'); ui.confetti(); window.scrollTo({ top: 0 });
      MT.shell.refreshBadges();
      MT.qr.render(MT.$('#success-qr', panel), MT.trees.url(first.code), 160).then(function (q) {
        var dl = MT.$('#qr-dl', panel); dl.addEventListener('click', function () { if (q) q.download({ name: first.code, extension: 'png' }); else ui.toast('QR not available offline.', { type: 'warn' }); });
      });
      MT.qr.dataUrl(MT.trees.url(first.code), 400).then(function (qd) { return MT.share.card(first, qd, { count: res.trees.length, name: S.speciesId === 'other' ? S.customName : sp.common }); }).then(function (c) {
        var im = MT.$('#share-img', panel); if (!im) return; im.src = c.dataUrl;
        MT.$('#sh-share', panel).addEventListener('click', function () { MT.share.share(first, c.blob); });
      });
      MT.$('#sh-wa', panel).addEventListener('click', function () { MT.share.whatsapp(first); });
      MT.$('#plant-more', panel).addEventListener('click', function () { MT.router.refresh(); });
    }

    S.replaces = (ctx && ctx.query && ctx.query.replaces) || '';
    function prefill() {
      if (!S.replaces) return Promise.resolve();
      return MT.db.get('trees', S.replaces).then(function (old) {
        if (!old) { S.replaces = ''; return; }
        S.speciesId = old.speciesId; S.customName = old.customName || ''; S.lat = old.lat; S.lng = old.lng; S.address = old.address || '';
        if (old.ownerId !== me.userId && MT.auth.isManager()) return loadUsers().then(function (us) { var u = us.filter(function (x) { return x.userId === old.ownerId; })[0]; if (u) { S.owner = u; S.ownerLabel = u.name + ' — ' + u.userId; } });
      }).then(function () { if (S.replaces) ui.toast('Replanting for ' + S.replaces + ' — species and spot are pre-filled.', { duration: 5000 }); }).catch(function () { S.replaces = ''; });
    }
    prefill().then(function () { go(0); });
    return function () { if (map) map.remove(); };
  }

  MT.router.add('/plant', { title: 'Plant a tree', layout: 'app', access: ['foundation', 'school', 'institution', 'student', 'individual'], render: render, after: after });
})();
