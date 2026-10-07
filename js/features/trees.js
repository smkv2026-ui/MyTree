/**
 * MyTree — My Trees (map / grid / list with filters, sort, multi-select), tree detail page and the public tree page.
 */
(function () {
  'use strict';
  var MT = window.MT, h = MT.html, raw = MT.raw, ui = MT.ui;
  var PAGE = 48;
  var ALL_ROLES = ['foundation', 'school', 'institution', 'student', 'individual'];

  function canManageTree(t) {
    var p = MT.auth.profile(); if (!p) return false;
    return t.ownerId === p.userId || p.role === 'super_admin' || (MT.auth.isOrgAdmin() && (t.ancestorOrgIds || []).indexOf(p.orgId) > -1);
  }
  function thumbHtml(t, size) {
    return t.cover ? raw('<img src="' + MT.esc(t.cover) + '" alt="" width="' + size + '" height="' + size + '" loading="lazy">') : ui.treeArt(t.health, size);
  }
  function healthChip(hc) { return h`<span class="hchip hchip-${hc}"><i class="hdot hdot-${hc}"></i>${ui.healthLabel[hc]}</span>`; }

  /* =================== My Trees =================== */
  function listPage() {
    var p = MT.auth.profile(), isOrg = MT.auth.isOrgAdmin();
    return h`<div class="page trees-page" data-reveal>
      <div class="page-head row"><div><h2>${isOrg ? 'Trees' : 'My trees'}</h2><p class="muted" id="tr-sub">Loading…</p></div>
        <a class="btn btn-primary" href="#/plant">${ui.icon('plus')} Plant a tree</a></div>
      <div id="storage-note"></div>
      <div class="toolbar card">
        <div class="tb-row">
          ${isOrg ? h`<div class="seg" role="group" aria-label="Scope"><button type="button" data-scope="mine" aria-pressed="false">Mine</button><button type="button" data-scope="org" aria-pressed="true">My organisation</button></div>` : ''}
          <input type="search" id="tr-q" placeholder="Search by ID, species, name…" aria-label="Search trees">
          <div class="seg" role="group" aria-label="View"><button type="button" data-view="grid" aria-pressed="true" title="Grid">${ui.icon('layout-grid')}<span class="sr-only">Grid</span></button><button type="button" data-view="list" aria-pressed="false" title="List">${ui.icon('list')}<span class="sr-only">List</span></button><button type="button" data-view="map" aria-pressed="false" title="Map">${ui.icon('map')}<span class="sr-only">Map</span></button></div>
          <button type="button" class="btn btn-ghost" id="tr-select">${ui.icon('check-square')} Select</button>
        </div>
        <div class="tb-row filters">
          <select id="f-species" aria-label="Species"><option value="">All species</option></select>
          <select id="f-status" aria-label="Status"><option value="">Alive &amp; dead</option><option value="alive">Alive</option><option value="dead">Dead</option></select>
          <select id="f-health" aria-label="Health"><option value="">Any health</option>${MT.trees.HEALTHS.map(function (x) { return h`<option value="${x}">${ui.healthLabel[x]}</option>`; })}</select>
          <label class="inline-date">From <input type="date" id="f-from"></label><label class="inline-date">To <input type="date" id="f-to"></label>
          <select id="f-sort" aria-label="Sort"><option value="new">Newest first</option><option value="old">Oldest first</option><option value="species">Species A–Z</option><option value="health">Needs attention first</option></select>
          <button type="button" class="link-btn" id="f-reset">Reset</button>
        </div>
      </div>
      <div class="bulk-bar card" id="bulk-bar" hidden><strong id="bulk-n">0 selected</strong><button type="button" class="btn btn-sm btn-soft" data-bulk="all">Select all</button><button type="button" class="btn btn-sm btn-soft" data-bulk="cadence">Set update cadence</button><button type="button" class="btn btn-sm btn-soft" data-bulk="csv">Export CSV</button><button type="button" class="btn btn-sm btn-danger-soft" data-bulk="delete">Delete</button></div>
      <div id="tr-body">${ui.skeleton(4, 'sk-card')}</div>
      <div class="center" id="tr-more"></div></div>`;
  }

  function listAfter(host, ctx) {
    var p = MT.auth.profile(), isOrg = MT.auth.isOrgAdmin();
    var S = { scope: isOrg ? 'org' : 'mine', view: MT.storage.get('mt.treeview', 'grid'), limit: 500, all: [], shown: PAGE, selecting: false, sel: {} };
    var body = MT.$('#tr-body', host), map = null, layer = null, destroyed = false;
    var q = MT.$('#tr-q', host); if (ctx && ctx.query && ctx.query.q) q.value = ctx.query.q;

    function scopeWhere() { return S.scope === 'org' ? [['ancestorOrgIds', 'array-contains', p.orgId]] : [['ownerId', '==', p.userId]]; }
    function load() {
      body.innerHTML = ui.skeleton(4, 'sk-card').s;
      var query = { where: scopeWhere(), orderBy: ['createdAt', 'desc'], limit: S.limit };
      return MT.db.list('trees', query).then(function (rows) {
        if (destroyed) return; S.all = rows; S.capped = rows.length >= S.limit;
        var sp = {}; rows.forEach(function (t) { sp[t.speciesId] = MT.trees.nameOf(t); });
        var sel = MT.$('#f-species', host), cur = sel.value;
        sel.innerHTML = '<option value="">All species</option>' + Object.keys(sp).sort(function (a, b) { return sp[a].localeCompare(sp[b]); }).map(function (k) { return '<option value="' + MT.esc(k) + '">' + MT.esc(sp[k]) + '</option>'; }).join('');
        sel.value = cur; draw();
      }).catch(function (e) { body.innerHTML = ''; body.appendChild(document.createRange().createContextualFragment(ui.empty({ title: 'We could not load trees', text: MT.friendlyError(e) }).s)); });
    }
    function filtered() {
      var term = q.value.trim().toLowerCase(), sp = MT.$('#f-species', host).value, st = MT.$('#f-status', host).value, hl = MT.$('#f-health', host).value, from = MT.$('#f-from', host).value, to = MT.$('#f-to', host).value;
      var out = S.all.filter(function (t) {
        if (sp && t.speciesId !== sp) return false; if (st && t.status !== st) return false; if (hl && t.health !== hl) return false;
        if (from && t.plantedOn < from) return false; if (to && t.plantedOn > to) return false;
        if (term) { var hay = (t.code + ' ' + MT.trees.nameOf(t) + ' ' + MT.species.get(t.speciesId).scientific + ' ' + (t.ownerName || '') + ' ' + (t.ownerId || '') + ' ' + (t.dedication || '') + ' ' + (t.city || '')).toLowerCase(); if (hay.indexOf(term) < 0) return false; }
        return true;
      });
      var sort = MT.$('#f-sort', host).value, rank = { struggling: 0, dead: 1, needs_care: 2, healthy: 3, thriving: 4 };
      out.sort(function (a, b) {
        if (sort === 'old') return a.createdAt - b.createdAt; if (sort === 'species') return MT.trees.nameOf(a).localeCompare(MT.trees.nameOf(b));
        if (sort === 'health') return (rank[a.health] - rank[b.health]) || (b.createdAt - a.createdAt);
        return b.createdAt - a.createdAt;
      });
      return out;
    }
    function card(t) {
      var chk = S.selecting ? '<label class="sel-box"><input type="checkbox" data-sel="' + MT.esc(t.id) + '"' + (S.sel[t.id] ? ' checked' : '') + ' aria-label="Select ' + MT.esc(t.code) + '"></label>' : '';
      return '<article class="tree-card card-lift" data-id="' + MT.esc(t.id) + '">' + chk + '<a class="tc-img" href="#/trees/' + encodeURIComponent(t.id) + '">' + thumbHtml(t, 240).s + '</a><div class="tc-body"><a class="tc-name" href="#/trees/' + encodeURIComponent(t.id) + '">' + MT.esc(MT.trees.nameOf(t)) + '</a>' +
        '<small class="mono">' + MT.esc(t.code) + '</small><div class="tc-meta">' + healthChip(t.status === 'dead' ? 'dead' : t.health).s + '<small>' + MT.fmt.date(t.plantedOn, { day: 'numeric', month: 'short', year: '2-digit' }) + '</small></div>' +
        (isOrg && S.scope === 'org' ? '<small class="muted">' + MT.esc(t.ownerName || '') + '</small>' : '') + '</div></article>';
    }
    function row(t) {
      return '<tr data-id="' + MT.esc(t.id) + '">' + (S.selecting ? '<td><input type="checkbox" data-sel="' + MT.esc(t.id) + '"' + (S.sel[t.id] ? ' checked' : '') + ' aria-label="Select ' + MT.esc(t.code) + '"></td>' : '') +
        '<td><a href="#/trees/' + encodeURIComponent(t.id) + '"><strong>' + MT.esc(MT.trees.nameOf(t)) + '</strong></a><br><small class="mono">' + MT.esc(t.code) + '</small></td><td>' + healthChip(t.health).s + '</td><td>' + MT.fmt.date(t.plantedOn) + '</td><td>' + MT.esc(t.city || '—') + '</td>' + (isOrg ? '<td>' + MT.esc(t.ownerName || '') + '</td>' : '') + '<td>' + (t.lastUpdateAt ? MT.fmt.ago(t.lastUpdateAt) : '—') + '</td></tr>';
    }
    function draw() {
      if (destroyed) return;
      var rows = filtered();
      MT.$('#tr-sub', host).textContent = MT.fmt.num(rows.length) + ' of ' + MT.fmt.num(S.all.length) + ' tree' + (S.all.length === 1 ? '' : 's') + (S.capped ? ' loaded (more available)' : '');
      MT.$$('[data-view]', host).forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.view === S.view)); });
      MT.$('#bulk-bar', host).hidden = !S.selecting; MT.$('#bulk-n', host).textContent = Object.keys(S.sel).length + ' selected';
      MT.$('#tr-select', host).classList.toggle('active', S.selecting);
      if (map) { map.remove(); map = null; }
      var more = MT.$('#tr-more', host); more.innerHTML = '';
      if (!rows.length) { body.innerHTML = ui.empty(S.all.length ? { title: 'No trees match these filters', text: 'Try clearing a filter.' } : { title: 'No trees yet', text: 'Plant your first tree — it only takes a minute.', action: { label: 'Plant a tree', href: '#/plant' } }).s; return; }
      if (S.view === 'map') { drawMap(rows); return; }
      var slice = rows.slice(0, S.shown);
      if (S.view === 'list') body.innerHTML = '<div class="card table-wrap"><table class="table"><thead><tr>' + (S.selecting ? '<th></th>' : '') + '<th>Tree</th><th>Health</th><th>Planted</th><th>City</th>' + (isOrg ? '<th>Owner</th>' : '') + '<th>Last update</th></tr></thead><tbody>' + slice.map(row).join('') + '</tbody></table></div>';
      else body.innerHTML = '<div class="tree-grid">' + slice.map(card).join('') + '</div>';
      if (rows.length > S.shown) { more.innerHTML = '<button type="button" class="btn btn-soft" id="show-more">Show more (' + (rows.length - S.shown) + ' left)</button>'; MT.$('#show-more', host).addEventListener('click', function () { S.shown += PAGE; draw(); }); }
      else if (S.capped) { more.innerHTML = '<button type="button" class="btn btn-soft" id="load-more">Load older trees</button>'; MT.$('#load-more', host).addEventListener('click', function () { S.limit += 500; load(); }); }
    }
    function drawMap(rows) {
      body.innerHTML = '<div class="map-wrap"><div id="tr-map" class="tr-map"></div>' + MT.maps.legend().s + '</div>';
      var el = MT.$('#tr-map', host);
      MT.maps.create(el, { center: [rows[0].lat, rows[0].lng], zoom: 12 }).then(function (m) {
        if (destroyed || S.view !== 'map') { m.remove(); return; }
        map = m; return MT.maps.clusterGroup().then(function (g) {
          layer = g.addTo(m); MT.maps.renderTrees(g, rows);
          var pts = rows.map(function (t) { return [t.lat, t.lng]; }); if (pts.length > 1) m.fitBounds(pts, { padding: [40, 40], maxZoom: 17 }); else m.setView(pts[0], 17);
        });
      }).catch(function (e) { el.innerHTML = '<div class="empty"><h3>Map unavailable</h3><p>' + MT.esc(MT.friendlyError(e)) + '</p></div>'; });
    }

    // events
    var redraw = MT.debounce(function () { S.shown = PAGE; draw(); }, 150);
    ['#tr-q', '#f-species', '#f-status', '#f-health', '#f-from', '#f-to', '#f-sort'].forEach(function (s) { MT.$(s, host).addEventListener('input', redraw); });
    MT.$('#f-reset', host).addEventListener('click', function () { q.value = ''; ['#f-species', '#f-status', '#f-health', '#f-from', '#f-to'].forEach(function (s) { MT.$(s, host).value = ''; }); MT.$('#f-sort', host).value = 'new'; S.shown = PAGE; draw(); });
    host.addEventListener('click', function (e) {
      var v = e.target.closest('[data-view]'); if (v) { S.view = v.dataset.view; MT.storage.set('mt.treeview', S.view); draw(); return; }
      var sc = e.target.closest('[data-scope]'); if (sc) { S.scope = sc.dataset.scope; MT.$$('[data-scope]', host).forEach(function (b) { b.setAttribute('aria-pressed', String(b === sc)); }); S.sel = {}; S.limit = 500; load(); return; }
      var b = e.target.closest('[data-bulk]'); if (b) bulk(b.dataset.bulk);
    });
    host.addEventListener('change', function (e) { var c = e.target.closest('[data-sel]'); if (!c) return; if (c.checked) S.sel[c.dataset.sel] = 1; else delete S.sel[c.dataset.sel]; MT.$('#bulk-n', host).textContent = Object.keys(S.sel).length + ' selected'; });
    MT.$('#tr-select', host).addEventListener('click', function () { S.selecting = !S.selecting; if (!S.selecting) S.sel = {}; draw(); });

    function selected() { return S.all.filter(function (t) { return S.sel[t.id]; }); }
    function bulk(act) {
      if (act === 'all') { filtered().forEach(function (t) { S.sel[t.id] = 1; }); draw(); return; }
      var items = selected(); if (!items.length) { ui.toast('Select some trees first.', { type: 'warn' }); return; }
      var editable = items.filter(canManageTree);
      if (act === 'csv') { MT.download('mytree-trees.csv', MT.csv([['Tree ID', 'Species', 'Scientific name', 'Planted on', 'Health', 'Status', 'Latitude', 'Longitude', 'City', 'Owner']].concat(items.map(function (t) { return [t.code, MT.trees.nameOf(t), MT.species.get(t.speciesId).scientific, t.plantedOn, t.health, t.status, t.lat, t.lng, t.city, t.ownerName]; }))), 'text/csv'); return; }
      if (act === 'cadence') {
        ui.modal({ title: 'Update cadence for ' + editable.length + ' tree(s)', body: raw('<div class="field"><label for="bc">How often should updates be posted?</label><select id="bc">' + MT.trees.CADENCES.map(function (c) { return '<option value="' + c[0] + '">' + c[1] + '</option>'; }).join('') + '</select></div>'), actions: [{ label: 'Cancel', value: false }, { label: 'Apply', kind: 'primary', value: true, onClick: function (d) { d._v = d.querySelector('#bc').value; S._cad = d._v; } }] }).then(function (ok) {
          if (!ok) return; var b = MT.db.batch(); editable.forEach(function (t) { b.update('trees', t.id, { cadence: S._cad }); t.cadence = S._cad; });
          return b.commit().then(function () { ui.success('Updated ' + editable.length + ' tree(s).'); S.sel = {}; draw(); });
        }).catch(ui.error); return;
      }
      if (act === 'delete') {
        if (!editable.length) { ui.toast('You cannot delete those trees.', { type: 'warn' }); return; }
        var ids = {}; editable.forEach(function (t) { ids[t.id] = 1; });
        var removed = S.all.filter(function (t) { return ids[t.id]; });
        S.all = S.all.filter(function (t) { return !ids[t.id]; }); S.sel = {}; draw();
        ui.undoToast('Deleted ' + removed.length + ' tree(s).', function () { S.all = S.all.concat(removed); draw(); }, function () { MT.trees.remove(removed).catch(function (e) { ui.error(e); S.all = S.all.concat(removed); if (!destroyed) draw(); }); });
      }
    }
    // storage usage / free-tier warning
    Promise.all([MT.photoStore.usage(p.userId), MT.db.get('stats', 'global').catch(function () { return null; })]).then(function (r) {
      var el = MT.$('#storage-note', host); if (!el) return; var w = MT.photoStore.warning(r[1]);
      el.innerHTML = (w ? '<div class="announce announce-' + (w.tone === 'bad' ? 'warn' : 'warn') + '" role="status">' + MT.esc(w.text) + '</div>' : '') +
        (r[0].photos ? '<p class="fine">Your photo storage: ' + MT.fmt.bytes(r[0].bytes) + ' in ' + r[0].photos + ' photo' + (r[0].photos > 1 ? 's' : '') + '.</p>' : '');
    });
    load();
    return function () { destroyed = true; if (map) map.remove(); };
  }

  /* =================== Tree detail =================== */
  function detailPage(ctx) {
    return MT.db.get('trees', ctx.params.id).then(function (t) {
      if (!t) return ui.empty({ title: 'Tree not found', text: 'It may have been removed, or it belongs to someone else.', action: { label: 'My trees', href: '#/trees' } });
      var sp = MT.species.get(t.speciesId), age = MT.trees.ageYears(t), co2 = MT.trees.co2(t), editable = canManageTree(t), cad = MT.cadence.status(t);
      return h`<div class="page tree-page" data-reveal>
        <a class="back-link" href="#/trees">${ui.icon('arrow-left')} All trees</a>
        <section class="tree-hero card">
          <div class="th-photo" id="th-photo">${thumbHtml(t, 360)}</div>
          <div class="th-main"><p class="eyebrow">${sp.native ? 'Native species' : 'Introduced species'} · ${sp.category}</p><h2>${MT.trees.nameOf(t)}</h2>
            ${sp.scientific ? h`<p class="sci">${sp.scientific}</p>` : ''}
            <div class="th-chips">${healthChip(t.status === 'dead' ? 'dead' : t.health)}<span class="mono code-chip">${t.code}</span></div>
            ${t.dedication ? h`<blockquote class="dedication">“${t.dedication}”</blockquote>` : ''}
            <div class="th-stats">
              <div><strong>${age < 1 ? Math.max(1, Math.round(age * 12)) + ' mo' : MT.fmt.num(age, 1) + ' yr'}</strong><span>age</span></div>
              <div><strong>${t.heightCm ? t.heightCm + ' cm' : '—'}</strong><span>height</span></div>
              <div><strong>${MT.fmt.num(co2, 1)} kg</strong><span>CO₂ absorbed (est.)</span></div>
              <div><strong>${t.updatesCount || 0}</strong><span>updates</span></div>
            </div>
            <div class="due-row">${t.status === 'dead' ? h`<span class="badge badge-bad">This tree has died</span>${t.replacedBy ? h`<a class="btn btn-soft btn-sm" href="#/trees/${t.replacedBy}">See replacement ${t.replacedBy}</a>` : (editable ? h`<a class="btn btn-primary btn-sm" href="#/plant?replaces=${t.code}">${ui.icon('sprout')} Replant</a>` : '')}` : h`<span class="badge badge-${MT.cadence.tone(cad)}">${MT.cadence.label(cad)}</span>${editable ? h`<label class="inline-sel">Updates <select id="cad-sel">${MT.trees.CADENCES.map(function (c) { return h`<option value="${c[0]}" ${c[0] === t.cadence ? raw('selected') : ''}>${c[1]}</option>`; })}</select></label>` : ''}`}</div>
            <div class="btn-row">${editable ? h`<button class="btn btn-primary" id="post-upd">${ui.icon('clipboard-check')} Post update</button><button class="btn btn-soft" id="mv-pin">${ui.icon('move')} Move pin</button><button class="btn btn-danger-soft" id="del-tree">${ui.icon('trash-2')} Delete</button>` : ''}<button class="btn btn-ghost" id="ics-tree">${ui.icon('calendar-plus')} Add reminders (.ics)</button><button class="btn btn-ghost" id="copy-link">${ui.icon('link')} Copy public link</button><button class="btn btn-ghost" id="cert-tree">${ui.icon('award')} Certificate</button><button class="btn btn-ghost" id="gift-tree">${ui.icon('gift')} Gift card</button></div>
          </div>
        </section>
        <div class="two-col">
          <section class="card"><div class="card-head"><h3>Location</h3></div><div class="detail-map" id="detail-map"></div><p class="fine">${t.address || ''}</p><p class="mono fine">${t.lat.toFixed(6)}, ${t.lng.toFixed(6)}</p></section>
          <section class="card"><div class="card-head"><h3>QR code</h3></div><div id="detail-qr" class="qr-box"></div><p class="fine">Scan to open this tree's page. Print it on a tag next to the tree.</p></section>
        </div>
        <section class="card"><div class="card-head"><h3>About this tree</h3></div>
          <dl class="kv kv-2"><dt>Planted on</dt><dd>${MT.fmt.date(t.plantedOn)}</dd><dt>Planted by</dt><dd>${t.ownerName}${t.onBehalfOf ? ' (posted by an admin on their behalf)' : ''}</dd><dt>City</dt><dd>${t.city || '—'}${t.state ? ', ' + t.state : ''}</dd><dt>Update cadence</dt><dd>${t.cadence}</dd>${t.girthCm ? h`<dt>Girth</dt><dd>${t.girthCm} cm</dd>` : ''}${t.plotId ? h`<dt>Plot</dt><dd class="mono">${t.plotId}</dd>` : ''}${t.notes ? h`<dt>Notes</dt><dd>${t.notes}</dd>` : ''}</dl>
          <h4>Care tip</h4><p>${sp.tip}</p></section>
        <div id="growth-host" class="growth-host"></div></div>`;
    });
  }
  function detailAfter(host, ctx) {
    var map = null, mapPromise;
    return MT.db.get('trees', ctx.params.id).then(function (t) {
      if (!t) return;
      // full-size photo on demand
      if (t.coverPhotoId) MT.photoStore.full(t.coverPhotoId).then(function (src) { var el = MT.$('#th-photo', host); if (src && el) el.innerHTML = '<img src="' + src + '" alt="Photo of ' + MT.esc(MT.trees.nameOf(t)) + '">'; }).catch(function () {});
      MT.qr.render(MT.$('#detail-qr', host), MT.trees.url(t.code), 200);
      var el = MT.$('#detail-map', host), marker;
      MT.maps.create(el, { center: [t.lat, t.lng], zoom: 17, scrollWheelZoom: false }).then(function (m) {
        map = m; marker = L.marker([t.lat, t.lng], { icon: MT.maps.treeIcon(t.health), draggable: false }).addTo(m);
      }).catch(function (e) { el.innerHTML = '<div class="empty"><p>' + MT.esc(MT.friendlyError(e)) + '</p></div>'; });
      var stopGrowth = MT.growth.mount(MT.$('#growth-host', host), t, { editable: canManageTree(t), onChange: function () { MT.router.refresh(); } });
      host._stopGrowth = stopGrowth;
      var pu = MT.$('#post-upd', host); if (pu) pu.addEventListener('click', function () { MT.growth.openForm([t], function (replant) { if (!replant) MT.router.refresh(); }); });
      var ct = MT.$('#cert-tree', host); if (ct) ct.addEventListener('click', function () { ct.disabled = true; MT.lazy.load('social').then(function () { return MT.certificates.tree(t); }).catch(ui.error).then(function () { ct.disabled = false; }); });
      var gt = MT.$('#gift-tree', host); if (gt) gt.addEventListener('click', function () { MT.lazy.load('social').then(function () { MT.certificates.giftForm(t); }).catch(ui.error); });
      var ic = MT.$('#ics-tree', host); ic.addEventListener('click', function () { MT.ics.download([t], t.code + '-reminders.ics'); ui.success('Calendar file downloaded — open it to add the reminders.'); });
      var cs = MT.$('#cad-sel', host); if (cs) cs.addEventListener('change', function () { MT.trees.update(t, { cadence: cs.value }).then(function () { t.cadence = cs.value; MT.due.invalidate(); ui.success('Update cadence changed to ' + cs.value + '.'); MT.router.refresh(); }).catch(ui.error); });
      var cl = MT.$('#copy-link', host); cl.addEventListener('click', function () { MT.copy(MT.trees.url(t.code)).then(function () { ui.success('Link copied'); }); });
      var mv = MT.$('#mv-pin', host);
      if (mv) mv.addEventListener('click', function () {
        if (!map || !marker) return;
        var on = !marker.dragging.enabled();
        if (on) { marker.dragging.enable(); mv.textContent = 'Save new position'; ui.toast('Drag the pin, then tap “Save new position”.', { duration: 4000 }); }
        else { var ll = marker.getLatLng(); marker.dragging.disable(); mv.disabled = true;
          MT.trees.update(t, { lat: +ll.lat.toFixed(6), lng: +ll.lng.toFixed(6), geohash: MT.geo.geohash(ll.lat, ll.lng, 9) }).then(function () { ui.success('Position updated.'); t.lat = ll.lat; t.lng = ll.lng; mv.innerHTML = ''; mv.append('Move pin'); }).catch(ui.error).then(function () { mv.disabled = false; }); }
      });
      var del = MT.$('#del-tree', host);
      if (del) del.addEventListener('click', function () {
        ui.confirm('Delete this tree?', 'This removes ' + MT.trees.nameOf(t) + ' (' + t.code + ') and its photo. You will have a few seconds to undo.', 'Delete', true).then(function (ok) {
          if (!ok) return; MT.router.go('/trees');
          ui.undoToast('Tree deleted.', function () { ui.toast('Restored.', { duration: 1500 }); }, function () { MT.trees.remove([t]).catch(ui.error); });
        });
      });
    }).then(function () { return function () { if (host._stopGrowth) host._stopGrowth(); if (map) map.remove(); }; });
  }

  /* =================== Public tree page (#/t/CODE) =================== */
  function publicPage(ctx) {
    return MT.db.get('publicTrees', ctx.params.code).then(function (t) { return t; }, function () { return null; }).then(function (t) {
      if (!t) return h`<div class="wrap narrow notfound"><div class="empty"><h1>This tree’s page is private</h1><p>The person who planted it has not made it public. If it is yours, sign in to view it.</p><a class="btn btn-primary" href="#/login">Sign in</a></div></div>`;
      var sp = MT.species.get(t.speciesId);
      return h`<div class="wrap narrow public-tree"><section class="card tree-hero"><div class="th-photo">${ui.treeArt(t.health, 240)}</div><div class="th-main"><p class="eyebrow">A MyTree tree</p><h1>${MT.trees.nameOf(t)}</h1><p class="sci">${sp.scientific}</p>
        <div class="th-chips">${healthChip(t.health)}<span class="mono code-chip">${t.code}</span></div>${t.dedication ? h`<blockquote class="dedication">“${t.dedication}”</blockquote>` : ''}
        <p>Planted ${t.ownerFirst ? 'by ' + t.ownerFirst + ' ' : ''}on ${MT.fmt.date(t.plantedOn)}${t.city ? ' in ' + t.city : ''}. It has absorbed an estimated ${MT.fmt.num(MT.trees.co2(t), 1)} kg of CO₂ so far (estimate).</p>
        <div class="btn-row"><a class="btn btn-primary" href="#/register">Plant your own tree</a><button class="btn btn-ghost" id="pub-share">${ui.icon('share-2')} Share</button></div></div></section></div>`;
    });
  }
  function publicAfter(host, ctx) {
    var b = MT.$('#pub-share', host); if (b) b.addEventListener('click', function () { var u = MT.trees.url(ctx.params.code); if (navigator.share) navigator.share({ title: 'A MyTree tree', url: u }).catch(function () {}); else MT.copy(u).then(function () { ui.success('Link copied'); }); });
  }

  MT.router.add('/trees', { title: 'Trees', layout: 'app', access: ALL_ROLES, render: listPage, after: listAfter });
  MT.router.add('/trees/:id', { title: 'Tree', layout: 'app', access: ALL_ROLES.concat(['super_admin']), render: detailPage, after: detailAfter });
  MT.router.add('/t/:code', { title: 'Tree', layout: 'public', access: 'public', render: publicPage, after: publicAfter });
})();
