/**
 * MyTree — UI toolkit: icons, toasts, modals, forms, counters, reveals, confetti, skeletons, empty states.
 * Only touches the DOM it creates; no feature knowledge.
 */
(function () {
  'use strict';
  var MT = window.MT, h = MT.html, raw = MT.raw;
  var ui = (MT.ui = {});

  /* ---------- Icons (Lucide via CDN; <i data-lucide> are swapped for inline SVG by ui.icons()) ---------- */
  ui.icon = function (name, cls) { return raw('<i data-lucide="' + MT.esc(name) + '" class="ic ' + MT.esc(cls || '') + '" aria-hidden="true"></i>'); };
  ui.icons = function () {
    if (window.lucide && window.lucide.createIcons) { try { window.lucide.createIcons(); } catch (e) { /* ignore */ } }
  };
  ui.loadIcons = function () { return MT.loader.load('lucide').then(ui.icons, function () {}); };

  /* ---------- Logo ---------- */
  ui.logo = function (size) {
    size = size || 36;
    return raw('<svg class="logo-mark" width="' + size + '" height="' + size + '" viewBox="0 0 64 64" aria-hidden="true" focusable="false">' +
      '<defs><linearGradient id="lg' + size + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3ec27a"/><stop offset="1" stop-color="#1f7f4a"/></linearGradient></defs>' +
      '<rect width="64" height="64" rx="16" fill="#0f3d2e"/><path d="M32 55V35" stroke="#c8a27a" stroke-width="5" stroke-linecap="round"/>' +
      '<path d="M32 44C23 42 14 36 14 25 14 17 22 13 30 19" fill="none" stroke="url(#lg' + size + ')" stroke-width="5" stroke-linecap="round"/>' +
      '<path d="M32 44C41 42 50 36 50 25 50 17 42 13 34 19" fill="none" stroke="url(#lg' + size + ')" stroke-width="5" stroke-linecap="round"/>' +
      '<circle cx="29.5" cy="19.5" r="4.6" fill="#e3c25a"/><circle cx="34.5" cy="19.5" r="4.6" fill="#c9a227" fill-opacity=".92"/>' +
      '<path d="M32 6c4 3.5 4 8 0 10-4-2-4-6.5 0-10z" fill="#d9f3e3"/></svg>');
  };

  /* ---------- Toasts ---------- */
  function toastHost() {
    var el = document.getElementById('toasts');
    if (!el) {
      el = document.createElement('div'); el.id = 'toasts'; el.className = 'toasts';
      el.setAttribute('role', 'region'); el.setAttribute('aria-label', 'Notifications'); el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    return el;
  }
  /**
   * @param {string} msg
   * @param {{type?:'success'|'error'|'info'|'warn', duration?:number, action?:{label:string, onClick:Function}}} [o]
   */
  ui.toast = function (msg, o) {
    o = o || {};
    var t = document.createElement('div');
    t.className = 'toast toast-' + (o.type || 'info');
    var ic = { success: 'check-circle-2', error: 'alert-circle', warn: 'alert-triangle', info: 'info' }[o.type || 'info'];
    t.innerHTML = '<i data-lucide="' + ic + '" class="ic" aria-hidden="true"></i><span class="toast-msg"></span>';
    t.querySelector('.toast-msg').textContent = msg;
    function close() { t.classList.add('out'); setTimeout(function () { t.remove(); }, 250); }
    if (o.action) {
      var b = document.createElement('button'); b.className = 'toast-action'; b.type = 'button'; b.textContent = o.action.label;
      b.addEventListener('click', function () { close(); o.action.onClick(); });
      t.appendChild(b);
    }
    var x = document.createElement('button'); x.className = 'toast-x'; x.type = 'button'; x.setAttribute('aria-label', 'Dismiss'); x.textContent = '×';
    x.addEventListener('click', close); t.appendChild(x);
    toastHost().appendChild(t); ui.icons();
    var d = o.duration == null ? (o.action ? 7000 : o.type === 'error' ? 6500 : 3800) : o.duration;
    if (d) setTimeout(close, d);
    return { close: close };
  };
  ui.success = function (m, o) { return ui.toast(m, Object.assign({ type: 'success' }, o)); };
  ui.error = function (e, o) {
    var m = typeof e === 'string' ? e : MT.friendlyError(e);
    if (MT.debug && e && e.stack) console.error(e);
    return ui.toast(m, Object.assign({ type: 'error' }, o));
  };
  /** Toast with an Undo button; `commit` runs when the toast expires without undo. */
  ui.undoToast = function (msg, onUndo, commit) {
    var undone = false, timer;
    var t = ui.toast(msg, { duration: 0, action: { label: 'Undo', onClick: function () { undone = true; clearTimeout(timer); onUndo(); } } });
    timer = setTimeout(function () { t.close(); if (!undone && commit) commit(); }, 7000);
    return t;
  };

  /* ---------- Modal (native <dialog>) ---------- */
  /**
   * @param {{title:string, body:any, actions?:Array<{label:string, kind?:string, value?:any, onClick?:Function}>, wide?:boolean, dismissible?:boolean}} o
   * @returns {Promise<any>} resolves with the clicked action's value (or undefined when dismissed)
   */
  ui.modal = function (o) {
    return new Promise(function (resolve) {
      var d = document.createElement('dialog');
      d.className = 'modal' + (o.wide ? ' modal-wide' : '');
      d.setAttribute('aria-labelledby', 'modal-title');
      var body = typeof o.body === 'string' ? '<p>' + MT.esc(o.body) + '</p>' : (o.body instanceof MT.SafeHtml ? o.body.s : '');
      d.innerHTML = '<form method="dialog" class="modal-card"><header class="modal-head"><h2 id="modal-title" class="modal-title"></h2>' +
        '<button type="button" class="icon-btn" data-close aria-label="Close"><i data-lucide="x" class="ic"></i></button></header>' +
        '<div class="modal-body">' + body + '</div><footer class="modal-foot"></footer></form>';
      d.querySelector('.modal-title').textContent = o.title || '';
      if (o.body instanceof Node) { var mb = d.querySelector('.modal-body'); mb.innerHTML = ''; mb.appendChild(o.body); }
      var foot = d.querySelector('.modal-foot'), result;
      (o.actions || [{ label: 'OK', kind: 'primary', value: true }]).forEach(function (a) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn-' + (a.kind || 'ghost'); b.textContent = a.label;
        b.addEventListener('click', function () {
          if (a.onClick) { var r = a.onClick(d); if (r === false) return; }
          result = a.value; d.close();
        });
        foot.appendChild(b);
      });
      d.addEventListener('close', function () { setTimeout(function () { d.remove(); }, 200); resolve(result); });
      d.querySelector('[data-close]').addEventListener('click', function () { d.close(); });
      if (o.dismissible === false) d.addEventListener('cancel', function (e) { e.preventDefault(); });
      document.body.appendChild(d);
      if (d.showModal) d.showModal(); else d.setAttribute('open', '');
      ui.icons();
      var first = d.querySelector('input,select,textarea') || d.querySelector('.modal-foot .btn-primary,.modal-foot .btn-danger');
      if (first) first.focus();
      if (o.onOpen) o.onOpen(d);
    });
  };
  ui.confirm = function (title, text, okLabel, danger) {
    return ui.modal({ title: title, body: text, actions: [{ label: 'Cancel', kind: 'ghost', value: false }, { label: okLabel || 'Confirm', kind: danger ? 'danger' : 'primary', value: true }] }).then(function (v) { return !!v; });
  };

  /* ---------- Forms ---------- */
  /**
   * Field markup helper.
   * @param {{id:string, label:string, type?:string, value?:any, required?:boolean, hint?:string, placeholder?:string, options?:Array, autocomplete?:string, attrs?:string, rows?:number}} f
   */
  ui.field = function (f) {
    var id = 'f-' + f.id, type = f.type || 'text', req = f.required ? ' required aria-required="true"' : '';
    var common = ' id="' + id + '" name="' + MT.esc(f.id) + '"' + req + (f.autocomplete ? ' autocomplete="' + f.autocomplete + '"' : '') + ' aria-describedby="' + id + '-msg" ' + (f.attrs || '');
    var ctrl;
    if (type === 'select') {
      ctrl = '<select' + common + '>' + (f.options || []).map(function (o) {
        var v = typeof o === 'object' ? o.value : o, l = typeof o === 'object' ? o.label : o;
        return '<option value="' + MT.esc(v) + '"' + (String(v) === String(f.value == null ? '' : f.value) ? ' selected' : '') + '>' + MT.esc(l) + '</option>';
      }).join('') + '</select>';
    } else if (type === 'textarea') {
      ctrl = '<textarea' + common + ' rows="' + (f.rows || 3) + '" placeholder="' + MT.esc(f.placeholder || '') + '">' + MT.esc(f.value || '') + '</textarea>';
    } else if (type === 'password') {
      ctrl = '<div class="pw-wrap"><input type="password"' + common + ' placeholder="' + MT.esc(f.placeholder || '') + '"><button type="button" class="pw-toggle" data-toggle-pw aria-label="Show password" aria-pressed="false"><i data-lucide="eye" class="ic"></i></button></div>';
    } else if (type === 'checkbox') {
      return raw('<div class="field field-check"><label class="check"><input type="checkbox"' + common + '><span>' + (f.labelHtml ? f.labelHtml.s : MT.esc(f.label)) + '</span></label><p class="field-msg" id="' + id + '-msg" role="alert"></p></div>');
    } else {
      ctrl = '<input type="' + type + '"' + common + ' value="' + MT.esc(f.value == null ? '' : f.value) + '" placeholder="' + MT.esc(f.placeholder || '') + '">';
    }
    return raw('<div class="field' + (f.wide ? ' field-wide' : '') + '"><label for="' + id + '">' + MT.esc(f.label) + (f.required ? ' <span class="req" aria-hidden="true">*</span>' : '') + '</label>' + ctrl +
      '<p class="field-hint">' + MT.esc(f.hint || '') + '</p><p class="field-msg" id="' + id + '-msg" role="alert"></p></div>');
  };
  function setMsg(form, name, msg) {
    var el = form.elements[name]; if (!el) return;
    var wrap = el.closest('.field'); if (!wrap) return;
    var m = wrap.querySelector('.field-msg');
    wrap.classList.toggle('has-error', !!msg);
    if (m) m.textContent = msg || '';
    el.setAttribute('aria-invalid', msg ? 'true' : 'false');
  }
  /**
   * Bind inline validation + async submit to a form.
   * rules: { fieldName: (value, allValues) => errorString|'' } ; required fields are checked via the `required` attribute.
   */
  ui.form = function (form, rules, onSubmit) {
    rules = rules || {};
    function val(name) { var el = form.elements[name]; return el ? (el.type === 'checkbox' ? el.checked : String(el.value).trim()) : ''; }
    function values() { var o = {}; Array.prototype.forEach.call(form.elements, function (el) { if (el.name) o[el.name] = el.type === 'checkbox' ? el.checked : (el.type === 'file' ? el.files : String(el.value).trim()); }); return o; }
    function check(name) {
      var el = form.elements[name]; if (!el) return true;
      var v = val(name), msg = '';
      if (el.required && (el.type === 'checkbox' ? !v : !v)) msg = el.type === 'checkbox' ? 'Please tick this box to continue.' : 'This field is required.';
      else if (rules[name] && (v || el.required)) msg = rules[name](v, values()) || '';
      setMsg(form, name, msg); return !msg;
    }
    form.setAttribute('novalidate', '');
    form.addEventListener('focusout', function (e) { if (e.target.name && e.target.dataset.touched) check(e.target.name); });
    form.addEventListener('input', function (e) { if (e.target.name) { e.target.dataset.touched = '1'; if (e.target.closest('.has-error')) check(e.target.name); } });
    form.addEventListener('change', function (e) { if (e.target.name) { e.target.dataset.touched = '1'; check(e.target.name); } });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var bad = null;
      Array.prototype.forEach.call(form.elements, function (el) { if (el.name && !check(el.name) && !bad) bad = el; });
      if (bad) { bad.focus(); ui.toast('Please fix the highlighted fields.', { type: 'warn' }); return; }
      var btn = form.querySelector('[type=submit]');
      if (btn) { btn.disabled = true; btn.classList.add('is-loading'); }
      Promise.resolve().then(function () { return onSubmit(values(), form); })
        .catch(function (err) { ui.error(err); })
        .then(function () { if (btn && btn.isConnected) { btn.disabled = false; btn.classList.remove('is-loading'); } });
    });
    return { check: check, values: values, setError: function (n, m) { setMsg(form, n, m); } };
  };

  /* ---------- Delegated micro-interactions ---------- */
  document.addEventListener('pointerdown', function (e) {
    var b = e.target.closest && e.target.closest('.btn,.ripple');
    if (!b || b.disabled || MT.prefersReducedMotion()) return;
    var r = b.getBoundingClientRect(), s = document.createElement('span');
    var d = Math.max(r.width, r.height);
    s.className = 'ripple-fx'; s.style.width = s.style.height = d + 'px';
    s.style.left = (e.clientX - r.left - d / 2) + 'px'; s.style.top = (e.clientY - r.top - d / 2) + 'px';
    b.appendChild(s); setTimeout(function () { s.remove(); }, 650);
  });
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-toggle-pw]');
    if (!t) return;
    var inp = t.parentNode.querySelector('input'), show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    t.setAttribute('aria-pressed', String(show)); t.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    t.innerHTML = '<i data-lucide="' + (show ? 'eye-off' : 'eye') + '" class="ic"></i>'; ui.icons();
  });
  document.addEventListener('click', function (e) {
    var c = e.target.closest && e.target.closest('[data-copy]');
    if (!c) return;
    MT.copy(c.getAttribute('data-copy')).then(function () { ui.success('Copied to clipboard'); }, function () { ui.toast('Could not copy — please select and copy manually.', { type: 'warn' }); });
  });

  /* ---------- Counters ---------- */
  ui.countUp = function (el, to, o) {
    o = o || {};
    var fmt = o.format || function (n) { return MT.fmt.num(n, o.decimals || 0); }, from = o.from || 0;
    if (MT.prefersReducedMotion() || !isFinite(to)) { el.textContent = fmt(to); return; }
    var dur = o.duration || 1600, t0 = null;
    function step(ts) {
      if (t0 == null) t0 = ts;
      var p = Math.min(1, (ts - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(from + (to - from) * e);
      if (p < 1) requestAnimationFrame(step); else el.textContent = fmt(to);
    }
    requestAnimationFrame(step);
  };
  /** Count up every [data-count] element when it scrolls into view. */
  ui.counters = function (root) {
    MT.$$('[data-count]', root).forEach(function (el) {
      var to = parseFloat(el.getAttribute('data-count')) || 0, dec = +(el.getAttribute('data-decimals') || 0);
      var suffix = el.getAttribute('data-suffix') || '';
      var fmt = function (n) { return MT.fmt.num(n, dec) + suffix; };
      if (!('IntersectionObserver' in window)) { el.textContent = fmt(to); return; }
      var io = new IntersectionObserver(function (en) {
        if (en[0].isIntersecting) { io.disconnect(); ui.countUp(el, to, { format: fmt }); }
      }, { threshold: 0.3 });
      io.observe(el);
    });
  };

  /* ---------- Scroll reveal ---------- */
  var revealIO = null;
  ui.reveal = function (root) {
    var els = MT.$$('[data-reveal]', root);
    if (!('IntersectionObserver' in window) || MT.prefersReducedMotion()) { els.forEach(function (e) { e.classList.add('in'); }); return; }
    if (!revealIO) revealIO = new IntersectionObserver(function (en) {
      en.forEach(function (x) { if (x.isIntersecting) { x.target.classList.add('in'); revealIO.unobserve(x.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    els.forEach(function (e, i) {
      var d = e.getAttribute('data-reveal-delay'); if (d) e.style.transitionDelay = d + 'ms';
      revealIO.observe(e);
    });
  };

  /* ---------- Confetti ---------- */
  ui.confetti = function (o) {
    if (MT.prefersReducedMotion()) return Promise.resolve();
    return MT.loader.load('confetti').then(function () {
      var colors = ['#2e9e5b', '#d9f3e3', '#c9a227', '#f4ecd8', '#0f3d2e'];
      window.confetti(Object.assign({ particleCount: 110, spread: 75, origin: { y: 0.65 }, colors: colors, disableForReducedMotion: true }, o));
    }).catch(function () { /* decorative only */ });
  };

  /* ---------- Skeleton + empty state ---------- */
  ui.skeleton = function (rows, kind) {
    var out = ''; for (var i = 0; i < (rows || 3); i++) out += '<div class="skeleton ' + (kind || 'sk-line') + '"></div>';
    return raw('<div class="sk-wrap" aria-busy="true" aria-label="Loading">' + out + '</div>');
  };
  ui.spinnerPage = function () { return raw('<div class="page-loading" role="status"><span class="spinner"></span><span class="sr-only">Loading…</span></div>'); };
  var EMPTY_ART = '<svg viewBox="0 0 160 120" class="empty-art" aria-hidden="true"><ellipse cx="80" cy="104" rx="52" ry="8" fill="currentColor" opacity=".08"/>' +
    '<path d="M80 100V62" stroke="#8b5e3c" stroke-width="5" stroke-linecap="round"/><path d="M80 78c-14-2-24-12-22-26 14 0 24 8 22 26z" fill="#2e9e5b"/>' +
    '<path d="M80 70c12-2 22-10 22-24-13 0-22 8-22 24z" fill="#58c488"/><circle cx="36" cy="30" r="3" fill="#c9a227" opacity=".8"/><circle cx="128" cy="40" r="2.5" fill="#2e9e5b" opacity=".6"/><circle cx="120" cy="22" r="2" fill="#c9a227" opacity=".6"/></svg>';
  /** @param {{title:string, text?:string, action?:{label:string, href?:string, id?:string}}} o */
  ui.empty = function (o) {
    return h`<div class="empty">${raw(EMPTY_ART)}<h3>${o.title}</h3>${o.text ? h`<p>${o.text}</p>` : ''}${o.action ? h`<a class="btn btn-primary" href="${o.action.href || '#'}" ${o.action.id ? raw('id="' + MT.esc(o.action.id) + '"') : ''}>${o.action.label}</a>` : ''}</div>`;
  };

  /** Small coloured placeholder image for trees (no photo hotlinking). */
  ui.treeArt = function (health, size) {
    var c = { thriving: ['#2e9e5b', '#58c488'], healthy: ['#4aa66b', '#79c593'], needs_care: ['#c9a227', '#e3c25a'], struggling: ['#d9822b', '#e9a45a'], dead: ['#8d8576', '#aaa294'] }[health] || ['#2e9e5b', '#58c488'];
    var s = size || 96;
    return raw('<svg viewBox="0 0 96 96" width="' + s + '" height="' + s + '" aria-hidden="true"><rect width="96" height="96" fill="#eaf6ee"/><path d="M48 88V54" stroke="#8b5e3c" stroke-width="5" stroke-linecap="round"/><circle cx="48" cy="40" r="22" fill="' + c[0] + '"/><circle cx="36" cy="46" r="14" fill="' + c[1] + '"/><circle cx="60" cy="44" r="13" fill="' + c[1] + '" opacity=".9"/></svg>');
  };

  /* ---------- Misc ---------- */
  ui.healthLabel = { thriving: 'Thriving', healthy: 'Healthy', needs_care: 'Needs care', struggling: 'Struggling', dead: 'Dead' };
  ui.badge = function (text, tone) { return h`<span class="badge badge-${tone || 'neutral'}">${text}</span>`; };
  ui.statusBadge = function (s) {
    var tone = { approved: 'ok', active: 'ok', pending: 'warn', rejected: 'bad', suspended: 'bad' }[s] || 'neutral';
    return ui.badge(String(s || '').replace(/^./, function (c) { return c.toUpperCase(); }), tone);
  };
  ui.avatar = function (name, size) {
    var ini = String(name || '?').split(/\s+/).slice(0, 2).map(function (p) { return p[0]; }).join('').toUpperCase();
    return h`<span class="avatar" style="--s:${size || 36}px" aria-hidden="true">${ini}</span>`;
  };
  ui.offlineBanner = function () {
    var el;
    function upd() {
      if (!navigator.onLine) {
        if (!el) { el = document.createElement('div'); el.className = 'offline-banner'; el.setAttribute('role', 'status'); el.textContent = 'You are offline. Changes will sync when you reconnect.'; document.body.appendChild(el); }
      } else if (el) { el.remove(); el = null; }
    }
    window.addEventListener('online', upd); window.addEventListener('offline', upd); upd();
  };
})();
