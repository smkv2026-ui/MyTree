/**
 * MyTree — growth UI: post-update form, tree timeline, growth chart (Chart.js), before/after slider (<mt-compare>),
 * auto-playing "growth journey", care & weather card (Open-Meteo, no key).
 *   MT.growth.openForm(trees, onDone)   modal used by the tree page and #/updates
 *   MT.growth.mount(host, tree, opts)   renders everything below the tree hero
 */
(function () {
  'use strict';
  var MT = window.MT, h = MT.html, raw = MT.raw, ui = MT.ui, U = MT.updates;
  function today() { return MT.fmt.iso(new Date()); }
  function hchip(hc) { return '<span class="hchip"><i class="hdot hdot-' + hc + '"></i>' + MT.esc(ui.healthLabel[hc]) + '</span>'; }

  /* =============== before / after slider web component =============== */
  if (window.customElements && !customElements.get('mt-compare')) {
    customElements.define('mt-compare', class extends HTMLElement {
      connectedCallback() {
        if (this._built) return; this._built = true;
        this.innerHTML = '<div class="cmp"><img class="cmp-a" alt="" draggable="false"><img class="cmp-b" alt="" draggable="false"><span class="cmp-l"></span><span class="cmp-r"></span>' +
          '<input type="range" min="0" max="100" value="50" aria-label="Drag to compare the two photos"><span class="cmp-bar" aria-hidden="true"></span></div>';
        var r = this.querySelector('input'), self = this;
        function set() { self.style.setProperty('--x', r.value + '%'); }
        r.addEventListener('input', set); set();
      }
      /** @param {string} a before src, @param {string} b after src */
      setImages(a, b, la, lb) {
        this.connectedCallback();
        this.querySelector('.cmp-a').src = a; this.querySelector('.cmp-b').src = b;
        this.querySelector('.cmp-l').textContent = la || 'Before'; this.querySelector('.cmp-r').textContent = lb || 'After';
      }
    });
  }

  /* =============== post update form =============== */
  function openForm(trees, onDone) {
    trees = [].concat(trees); var multi = trees.length > 1, t0 = trees[0], photos = [];
    var body = document.createElement('div');
    body.innerHTML = '<form class="upd-form form" novalidate><p class="muted">' + (multi ? 'Posting the same update for <strong>' + trees.length + ' trees</strong>.' : '<strong>' + MT.esc(MT.trees.nameOf(t0)) + '</strong> · <span class="mono">' + MT.esc(t0.code) + '</span>') + '</p>' +
      '<div class="form-grid">' + ui.field({ id: 'date', label: 'Date', type: 'date', value: today(), required: true, attrs: 'max="' + today() + '" min="' + (multi ? '' : t0.plantedOn) + '"' }).s +
      (multi ? '' : ui.field({ id: 'heightCm', label: 'Height (cm)', type: 'number', value: '', attrs: 'min="0" max="5000" step="0.1" inputmode="decimal" placeholder="' + (t0.heightCm || '') + '"' }).s + ui.field({ id: 'girthCm', label: 'Girth at chest height (cm, optional)', type: 'number', value: '', attrs: 'min="0" max="1000" step="0.1" inputmode="decimal"' }).s) + '</div>' +
      '<fieldset class="health-pick"><legend>How is it doing?</legend><div class="hp">' + U.HEALTH.map(function (x) { return '<label class="hp-opt hp-' + x[0] + '"><input type="radio" name="health" value="' + x[0] + '"' + (x[0] === (t0.health === 'dead' ? 'healthy' : t0.health) ? ' checked' : '') + '><span><i data-lucide="' + x[2] + '" class="ic"></i>' + x[1] + '</span></label>'; }).join('') + '</div></fieldset>' +
      '<div class="field"><label for="f-notes">Notes (optional)</label><textarea id="f-notes" name="notes" rows="3" maxlength="500" placeholder="Watered, new leaves, pest spotted…"></textarea></div>' +
      (multi ? '<p class="fine">Photos can be added for one tree at a time.</p>' : '<div class="field"><label>Photos (up to ' + U.MAX_PHOTOS + ')</label><div class="upd-photos" id="upd-photos"></div><div class="btn-row tight"><label class="btn btn-soft">' + ui.icon('camera').s + ' Take photo<input type="file" id="up-cam" accept="image/*" capture="environment" hidden></label><label class="btn btn-ghost">' + ui.icon('image').s + ' Choose photos<input type="file" id="up-gal" accept="image/*" multiple hidden></label></div><p class="field-hint" id="up-info"></p></div>') +
      '<label class="check replant" id="replant-row" hidden><input type="checkbox" id="replant"><span>I will plant a replacement tree (we will link it to this one)</span></label>' +
      '<p class="field-msg" id="upd-err" role="alert"></p><div class="modal-foot inline"><button type="button" class="btn btn-ghost" data-cancel>Cancel</button><button type="submit" class="btn btn-primary"><span class="btn-label">Save update</span><span class="spinner-sm"></span></button></div></form>';
    var form = body.querySelector('form'), err = body.querySelector('#upd-err'), dlg;
    function drawPhotos() {
      var el = body.querySelector('#upd-photos'); if (!el) return;
      el.innerHTML = photos.map(function (p, i) { return '<figure><img src="' + p.thumb.dataUrl + '" alt="Photo ' + (i + 1) + '"><button type="button" data-rm="' + i + '" aria-label="Remove photo">×</button></figure>'; }).join('');
      body.querySelector('#up-info').textContent = photos.length ? photos.length + ' photo(s), ' + MT.fmt.bytes(photos.reduce(function (a, p) { return a + p.full.size; }, 0)) + ' after compression.' : '';
    }
    function addFiles(files) {
      var list = [].slice.call(files).slice(0, U.MAX_PHOTOS - photos.length); if (!list.length) return;
      body.querySelector('#up-info').textContent = 'Compressing…';
      list.reduce(function (p, f) { return p.then(function () { return MT.photoStore.prepare(f).then(function (x) { photos.push(x); }); }); }, Promise.resolve()).then(drawPhotos).catch(function (e) { ui.error(e); drawPhotos(); });
    }
    ['up-cam', 'up-gal'].forEach(function (id) { var el = body.querySelector('#' + id); if (el) el.addEventListener('change', function () { addFiles(el.files); el.value = ''; }); });
    body.addEventListener('click', function (e) { var r = e.target.closest('[data-rm]'); if (r) { photos.splice(+r.dataset.rm, 1); drawPhotos(); } if (e.target.closest('[data-cancel]')) dlg.close(); });
    form.addEventListener('change', function (e) { if (e.target.name === 'health') body.querySelector('#replant-row').hidden = e.target.value !== 'dead' || multi; });
    form.addEventListener('submit', function (e) {
      e.preventDefault(); err.textContent = '';
      var v = { date: form.elements.date.value, health: form.elements.health.value, notes: form.elements.notes.value, heightCm: multi ? '' : form.elements.heightCm.value, girthCm: multi ? '' : form.elements.girthCm.value };
      if (!v.date) { err.textContent = 'Please choose a date.'; return; }
      var btn = form.querySelector('[type=submit]'); btn.disabled = true; btn.classList.add('is-loading');
      var i = 0;
      trees.reduce(function (p, t) {
        return p.then(function () { btn.querySelector('.btn-label').textContent = trees.length > 1 ? 'Saving ' + (++i) + ' of ' + trees.length + '…' : 'Saving…'; return U.post(Object.assign({ tree: t, photos: photos }, v)); });
      }, Promise.resolve()).then(function () {
        var replant = v.health === 'dead' && !multi && body.querySelector('#replant').checked;
        dlg.close(); ui.success(trees.length > 1 ? 'Updates posted for ' + trees.length + ' trees.' : 'Update saved. 🌿');
        if (v.health === 'dead') ui.toast('We are sorry to hear that. Replanting in the monsoon works best.', { duration: 5000 });
        if (onDone) onDone(replant ? t0 : null); if (replant) MT.router.go('/plant?replaces=' + encodeURIComponent(t0.code));
      }).catch(function (e2) { btn.disabled = false; btn.classList.remove('is-loading'); btn.querySelector('.btn-label').textContent = 'Save update'; err.textContent = MT.friendlyError(e2); });
    });
    ui.modal({ title: multi ? 'Post update for ' + trees.length + ' trees' : 'Post a growth update', body: body, actions: [], wide: false, onOpen: function (d) { dlg = d; ui.icons(); } });
  }

  /* =============== timeline =============== */
  function timelineHtml(tree, updates, editable) {
    var items = updates.map(function (u) {
      var by = u.onBehalfOf ? 'Posted by ' + MT.esc(u.postedByName || 'an admin') + ' on behalf of ' + MT.esc(u.onBehalfOfName || 'the owner') : (u.postedByName && u.postedBy !== tree.ownerId ? 'Posted by ' + MT.esc(u.postedByName) : '');
      return '<li class="tl-item' + (u.kind === 'dead' ? ' tl-dead' : '') + '"><span class="tl-dot hdot-' + u.health + '"></span><div class="tl-card"><div class="tl-head"><strong>' + MT.fmt.date(u.date) + '</strong>' + hchip(u.health) + '</div>' +
        '<div class="tl-meta">' + (u.heightCm != null ? '<span>📏 ' + u.heightCm + ' cm</span>' : '') + (u.girthCm != null ? '<span>⭕ girth ' + u.girthCm + ' cm</span>' : '') + '</div>' +
        (u.notes ? '<p>' + MT.esc(u.notes) + '</p>' : '') + ((u.photoIds || []).length ? '<div class="tl-photos">' + u.photoIds.map(function (pid) { return '<button type="button" class="tl-ph" data-photo="' + MT.esc(pid) + '" aria-label="Open photo"><img alt="" data-thumb="' + MT.esc(pid) + '" src="' + (u.cover && pid === u.photoIds[0] ? MT.esc(u.cover) : '') + '"></button>'; }).join('') + '</div>' : '') +
        (by ? '<small class="muted">' + by + '</small>' : '') + (editable ? '<button type="button" class="link-btn tl-del" data-del="' + MT.esc(u.id) + '">Delete</button>' : '') + '</div></li>';
    }).join('');
    var planted = '<li class="tl-item"><span class="tl-dot"></span><div class="tl-card"><div class="tl-head"><strong>' + MT.fmt.date(tree.plantedOn) + '</strong><span class="hchip">🌱 Planted</span></div><p>' + MT.esc(MT.trees.nameOf(tree)) + ' planted' + (tree.city ? ' in ' + MT.esc(tree.city) : '') + '.</p>' + (tree.replaces ? '<small class="muted">Replacing <a href="#/trees/' + encodeURIComponent(tree.replaces) + '">' + MT.esc(tree.replaces) + '</a></small>' : '') + '</div></li>';
    return '<ol class="timeline">' + items + planted + '</ol>';
  }

  /* =============== chart =============== */
  var chartInst = null;
  function cssVar(n, f) { var v = getComputedStyle(document.documentElement).getPropertyValue(n).trim(); return v || f; }
  function drawChart(canvas, tree, updates) {
    var pts = updates.filter(function (u) { return u.heightCm != null; }).map(function (u) { return { x: new Date(u.date).getTime(), y: u.heightCm }; });
    var first = { x: new Date(tree.plantedOn).getTime(), y: tree.initialHeightCm != null ? tree.initialHeightCm : 30 };
    pts.push(first); pts.sort(function (a, b) { return a.x - b.x; });
    var end = Math.max(pts[pts.length - 1].x, Date.now()), typical = [];
    for (var t = first.x; t <= end + 1; t += Math.max(7, (end - first.x) / 24 / 86400000) * 86400000) typical.push({ x: t, y: Math.round(MT.species.heightAt(tree.speciesId, (t - first.x) / (365.25 * 86400000)) + first.y * 0.6) });
    var ink = cssVar('--text-2', '#3d544a'), grid = cssVar('--border', '#e3ddcd'), line = cssVar('--primary', '#237d49'), surface = cssVar('--surface', '#fff'), muted = cssVar('--muted', '#55695f');
    if (chartInst) chartInst.destroy();
    var ctx = canvas.getContext('2d'), grad = ctx.createLinearGradient(0, 0, 0, 260); grad.addColorStop(0, 'rgba(46,158,91,.28)'); grad.addColorStop(1, 'rgba(46,158,91,0)');
    chartInst = new Chart(canvas, {
      type: 'line',
      data: { datasets: [
        { label: 'Measured height', data: pts, borderColor: line, backgroundColor: grad, fill: true, borderWidth: 2, tension: 0.3, pointRadius: 4.5, pointHoverRadius: 6, pointBackgroundColor: line, pointBorderColor: surface, pointBorderWidth: 2 },
        { label: 'Typical growth for this species (estimate)', data: typical, borderColor: muted, borderDash: [6, 6], borderWidth: 1.5, pointRadius: 0, fill: false, tension: 0.35 }
      ] },
      options: {
        responsive: true, maintainAspectRatio: false, animation: MT.prefersReducedMotion() ? false : { duration: 900 }, interaction: { mode: 'nearest', intersect: false, axis: 'x' },
        plugins: { legend: { position: 'bottom', labels: { color: ink, usePointStyle: true, boxWidth: 8, font: { family: 'inherit' } } },
          tooltip: { callbacks: { title: function (i) { return MT.fmt.date(i[0].parsed.x); }, label: function (i) { return ' ' + i.dataset.label.split(' (')[0] + ': ' + Math.round(i.parsed.y) + ' cm'; } } } },
        scales: { x: { type: 'linear', ticks: { color: ink, maxTicksLimit: 6, callback: function (v) { return MT.fmt.date(v, { day: 'numeric', month: 'short', year: '2-digit' }); } }, grid: { color: 'transparent' }, border: { color: grid } },
          y: { beginAtZero: true, title: { display: true, text: 'Height (cm)', color: ink }, ticks: { color: ink }, grid: { color: grid }, border: { display: false } } }
      }
    });
  }

  /* =============== weather (Open-Meteo, keyless) =============== */
  function weather(tree) {
    var key = 'mt.wx.' + tree.lat.toFixed(1) + ',' + tree.lng.toFixed(1), c = MT.storage.get(key, null);
    if (c && Date.now() - c.at < 3600000) return Promise.resolve(c.d);
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + tree.lat + '&longitude=' + tree.lng + '&current=temperature_2m,weather_code&daily=precipitation_sum,temperature_2m_max&past_days=7&forecast_days=4&timezone=auto';
    return fetch(url).then(function (r) { if (!r.ok) throw new Error('wx'); return r.json(); }).then(function (j) {
      var rain = j.daily.precipitation_sum, past = rain.slice(0, 7).reduce(function (a, b) { return a + (b || 0); }, 0), next = rain.slice(7).reduce(function (a, b) { return a + (b || 0); }, 0);
      var d = { temp: j.current.temperature_2m, past: past, next: next, max: Math.max.apply(null, j.daily.temperature_2m_max) }; MT.storage.set(key, { at: Date.now(), d: d }); return d;
    });
  }
  function weatherAdvice(w, sp) {
    if (w.past >= 25 || w.next >= 15) return '🌧 Plenty of rain — skip watering and make sure water is not pooling at the base.';
    if (w.past < 5 && w.next < 5 && w.max >= 33) return '☀️ Hot and dry — water deeply early in the morning and mulch the base.';
    if (w.past < 5 && w.next < 5) return '💧 Little rain this week — check the soil and water if the top 5 cm is dry.';
    return '🌤 Moderate rain — water only if the soil feels dry.';
  }

  /* =============== photos list helper =============== */
  function photoEntries(tree, updatesOldestFirst) {
    var out = [], seen = {};
    updatesOldestFirst.forEach(function (u) { (u.photoIds || []).forEach(function (pid) { if (!seen[pid]) { seen[pid] = 1; out.push({ id: pid, date: u.date }); } }); });
    if (tree.coverPhotoId && !seen[tree.coverPhotoId]) out.unshift({ id: tree.coverPhotoId, date: tree.plantedOn, planting: true });
    return out.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  }
  function lightbox(src) {
    var d = document.createElement('div'); d.innerHTML = '<img class="lb-img" alt="Tree photo" src="' + MT.esc(src) + '">'; ui.modal({ title: 'Photo', body: d, wide: true, actions: [{ label: 'Close', kind: 'primary', value: true }] });
  }

  /* =============== mount =============== */
  function mount(host, tree, o) {
    o = o || {}; var alive = true, themeOff, lapseTimer;
    function shell() {
      var tip = U.seasonTip(tree);
      host.innerHTML = '<section class="card" id="g-care"><div class="card-head"><h3>Care &amp; weather</h3><span class="badge badge-info">' + tip.season + '</span></div><div class="care-grid"><div><h4>This season</h4><p>' + MT.esc(tip.tip) + '</p><h4>About this species</h4><p>' + MT.esc(tip.species) + '</p></div><div id="wx" class="wx"><p class="fine">Loading local weather…</p></div></div></section>' +
        '<section class="card" id="g-chart"><div class="card-head"><h3>Growth chart</h3></div><div id="chart-body">' + ui.skeleton(2, 'sk-card').s + '</div></section>' +
        '<section class="card" id="g-compare"><div class="card-head"><h3>Before &amp; after</h3></div><div id="cmp-body"><p class="fine">Loading photos…</p></div></section>' +
        '<section class="card" id="g-lapse"><div class="card-head"><h3>Growth journey</h3></div><div id="lapse-body"></div></section>' +
        '<section class="card" id="g-timeline"><div class="card-head"><h3>Timeline</h3>' + (o.editable ? '<button type="button" class="btn btn-primary btn-sm" data-post>' + ui.icon('plus').s + ' Post update</button>' : '') + '</div><div id="tl-body">' + ui.skeleton(3, 'sk-line').s + '</div></section>';
      ui.icons();
    }
    function load() {
      return U.forTree(tree).then(function (updates) { if (!alive) return; render(updates); }).catch(function (e) { var b = host.querySelector('#tl-body'); if (b) b.innerHTML = '<p class="muted">' + MT.esc(MT.friendlyError(e)) + '</p>'; });
    }
    function render(updates) {
      var asc = updates.slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt; });
      var tl = host.querySelector('#tl-body');
      tl.innerHTML = updates.length ? timelineHtml(tree, updates, o.editable) : timelineHtml(tree, [], false) + '<p class="muted center">No updates yet. ' + (o.editable ? 'Post the first one to start the growth story.' : '') + '</p>';
      // thumbnails
      MT.$$('img[data-thumb]', tl).forEach(function (im) { if (!im.getAttribute('src')) MT.photoStore.thumb(im.dataset.thumb).then(function (s) { if (s) im.src = s; }); });
      // chart
      var cb = host.querySelector('#chart-body'), withH = updates.filter(function (u) { return u.heightCm != null; });
      if (withH.length < 1) cb.innerHTML = '<p class="muted">Post an update with the tree’s height to start drawing its growth curve.</p>';
      else {
        cb.innerHTML = '<div class="chart-box"><canvas id="growth-canvas" role="img" aria-label="Line chart of tree height over time"></canvas></div><details class="tbl-view"><summary>View as table</summary><table class="table"><thead><tr><th>Date</th><th>Height (cm)</th><th>Girth (cm)</th><th>Health</th></tr></thead><tbody>' + asc.filter(function (u) { return u.heightCm != null; }).map(function (u) { return '<tr><td>' + MT.fmt.date(u.date) + '</td><td>' + u.heightCm + '</td><td>' + (u.girthCm != null ? u.girthCm : '—') + '</td><td>' + MT.esc(ui.healthLabel[u.health]) + '</td></tr>'; }).join('') + '</tbody></table></details>';
        MT.loader.load('chart').then(function () { if (alive) drawChart(host.querySelector('#growth-canvas'), tree, updates); }).catch(function () { cb.querySelector('.chart-box').innerHTML = '<p class="muted">The chart library could not load. The table below has the same data.</p>'; cb.querySelector('details').open = true; });
      }
      // photos: before/after + journey
      var ph = photoEntries(tree, asc), cmp = host.querySelector('#cmp-body'), lapse = host.querySelector('#lapse-body');
      if (ph.length < 2) { cmp.innerHTML = '<p class="muted">Add photos in at least two updates to compare how your tree has changed.</p>'; lapse.innerHTML = '<p class="muted">Your photos will play back here as a short growth movie.</p>'; return; }
      var opts = ph.map(function (p, i) { return '<option value="' + i + '">' + MT.fmt.date(p.date) + (p.planting ? ' (planting)' : '') + '</option>'; }).join('');
      cmp.innerHTML = '<div class="cmp-pick"><label>Before <select id="cmp-a">' + opts + '</select></label><label>After <select id="cmp-b">' + opts + '</select></label></div><mt-compare id="cmp"></mt-compare><p class="fine">Drag the handle to reveal the change.</p>';
      var A = cmp.querySelector('#cmp-a'), B = cmp.querySelector('#cmp-b'), C = cmp.querySelector('#cmp'); A.value = 0; B.value = ph.length - 1;
      function setCmp() { var a = ph[+A.value], b = ph[+B.value]; Promise.all([MT.photoStore.full(a.id), MT.photoStore.full(b.id)]).then(function (s) { C.setImages(s[0], s[1], MT.fmt.date(a.date), MT.fmt.date(b.date)); }); }
      A.addEventListener('change', setCmp); B.addEventListener('change', setCmp); setCmp();
      lapse.innerHTML = '<div class="lapse"><img id="lapse-img" alt="Growth journey frame" width="320" height="240"><div class="lapse-bar"><button type="button" class="btn btn-soft btn-sm" id="lapse-play">' + ui.icon('play').s + ' Play</button><input type="range" id="lapse-pos" min="0" max="' + (ph.length - 1) + '" value="0" aria-label="Journey position"><span id="lapse-cap" class="fine"></span></div></div>';
      ui.icons();
      var li = lapse.querySelector('#lapse-img'), pos = lapse.querySelector('#lapse-pos'), cap = lapse.querySelector('#lapse-cap'), play = lapse.querySelector('#lapse-play'), cur = 0, thumbs = [];
      function show(i) { cur = i; pos.value = i; cap.textContent = MT.fmt.date(ph[i].date) + ' · ' + (i + 1) + '/' + ph.length; Promise.resolve(thumbs[i] || MT.photoStore.thumb(ph[i].id)).then(function (s) { thumbs[i] = s; if (li.isConnected && cur === i) { li.src = s; li.classList.remove('fade'); void li.offsetWidth; li.classList.add('fade'); } }); }
      function stop() { clearInterval(lapseTimer); lapseTimer = null; play.innerHTML = ui.icon('play').s + ' Play'; ui.icons(); }
      function start() { if (cur >= ph.length - 1) show(0); play.innerHTML = ui.icon('pause').s + ' Pause'; ui.icons(); lapseTimer = setInterval(function () { if (cur >= ph.length - 1) return stop(); show(cur + 1); }, 1100); }
      play.addEventListener('click', function () { lapseTimer ? stop() : start(); }); pos.addEventListener('input', function () { stop(); show(+pos.value); }); show(0);
      if (!MT.prefersReducedMotion()) { var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (en) { if (en[0].isIntersecting && !lapseTimer && cur === 0) { start(); io.disconnect(); } }, { threshold: 0.6 }) : null; if (io) io.observe(lapse); }
    }
    shell(); load();
    weather(tree).then(function (w) { var el = host.querySelector('#wx'); if (el && alive) el.innerHTML = '<h4>Weather at this tree</h4><p class="wx-big">' + Math.round(w.temp) + '°C now</p><p class="fine">Rain last 7 days: <strong>' + w.past.toFixed(0) + ' mm</strong> · next 3 days: <strong>' + w.next.toFixed(0) + ' mm</strong></p><p>' + weatherAdvice(w) + '</p><p class="fine">Weather by Open-Meteo.com</p>'; }).catch(function () { var el = host.querySelector('#wx'); if (el) el.innerHTML = '<p class="fine">Local weather is unavailable right now.</p>'; });
    host.addEventListener('click', function (e) {
      if (e.target.closest('[data-post]')) { openForm([tree], function () { o.onChange && o.onChange(); load(); }); return; }
      var ph = e.target.closest('[data-photo]'); if (ph) { MT.photoStore.full(ph.dataset.photo).then(function (s) { if (s) lightbox(s); }); return; }
      var d = e.target.closest('[data-del]');
      if (d) ui.confirm('Delete this update?', 'The note and its photos will be removed.', 'Delete', true).then(function (ok) { if (!ok) return; U.forTree(tree).then(function (all) { var u = all.filter(function (x) { return x.id === d.dataset.del; })[0]; return u && U.remove(u, tree); }).then(function () { ui.success('Update deleted.'); load(); }).catch(ui.error); });
    });
    themeOff = MT.store.on('themeTick', function () { if (chartInst && host.querySelector('#growth-canvas')) load(); });
    return function () { alive = false; clearInterval(lapseTimer); if (themeOff) themeOff(); if (chartInst) { chartInst.destroy(); chartInst = null; } };
  }

  MT.growth = { openForm: openForm, mount: mount };
})();
