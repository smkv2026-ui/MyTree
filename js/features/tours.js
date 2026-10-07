/**
 * MyTree — first-run onboarding tour: a lightweight spotlight with role-specific steps. Shown once per role (remembered in localStorage),
 * skippable, keyboard friendly (→ ← Esc), replayable from Help and Quick search. Steps whose target is not visible (e.g. sidebar on phones) are skipped.
 */
(function () {
  'use strict';
  var MT = window.MT, el = null, idx = 0, steps = [], onKey = null;
  var ADMINS = ['super_admin', 'foundation', 'school', 'institution'];

  function def(role) {
    var s = [{ t: 'Welcome to MyTree 🌳', x: 'A two-minute tour of the places you will use most. You can skip it any time and replay it from Help.' }];
    if (role !== 'super_admin') s.push({ sel: 'a[href="#/plant"]', t: 'Plant a tree', x: 'Record a new tree in four easy steps — species, map pin, details, confirm.' }, { sel: 'a[href="#/trees"]', t: 'My trees', x: 'All your trees on a map or in a grid, with filters and QR codes.' });
    s.push({ sel: 'a[href="#/updates"]', t: 'Growth updates', x: 'Post height, health and photos. Overdue updates are highlighted so no tree is forgotten.' });
    if (ADMINS.indexOf(role) > -1) s.push({ sel: 'a[href="#/people"], a[href="#/admin/approvals"]', t: 'People & approvals', x: 'Add students, members and organisations, print credential sheets, and approve new registrations.' }, { sel: 'a[href="#/bulk"]', t: 'Bulk upload', x: 'Import many trees, students or updates from an Excel or CSV template.' });
    if (role === 'super_admin') s.push({ sel: 'a[href="#/admin"]', t: 'Command centre', x: 'Live totals, maps, charts, tree health and reports for the whole portal.' });
    else s.push({ sel: 'a[href="#/leaderboard"]', t: 'Badges & leaderboard', x: 'Earn badges, keep streaks and see how your school is doing.' });
    s.push({ sel: '[data-act="palette"]', t: 'Quick search', x: 'Press Ctrl K (⌘ K on Mac) to jump anywhere or run an action.' }, { sel: 'a[href="#/help"]', t: 'Need help?', x: 'The Help centre has short guides for every role. Enjoy growing your forest!' });
    return s;
  }
  function visible(n) { if (!n) return null; var r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(n).visibility !== 'hidden' ? n : null; }
  function find(sel) { var all = document.querySelectorAll(sel), i; for (i = 0; i < all.length; i++) if (visible(all[i])) return all[i]; return null; }

  function close(done) {
    if (el) { el.remove(); el = null; } if (onKey) { document.removeEventListener('keydown', onKey, true); onKey = null; }
    if (done) MT.storage.set('tour.' + MT.auth.role(), true);
    var p = document.activeElement; if (p && p.blur) p.blur();
  }
  function show() {
    var s = steps[idx], target = s.sel ? find(s.sel) : null;
    if (s.sel && !target) { steps.splice(idx, 1); if (idx >= steps.length) return close(true); return show(); }
    if (!el) { el = document.createElement('div'); el.className = 'tour'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'false'); el.setAttribute('aria-label', 'Welcome tour'); document.body.appendChild(el); }
    var last = idx === steps.length - 1;
    el.innerHTML = '<div class="tour-spot"></div><div class="tour-card" tabindex="-1"><p class="eyebrow">Step ' + (idx + 1) + ' of ' + steps.length + '</p><h3>' + MT.esc(s.t) + '</h3><p>' + MT.esc(s.x) + '</p>' +
      '<div class="btn-row"><button class="btn btn-ghost btn-sm" data-k="skip">Skip</button><span class="grow"></span>' + (idx ? '<button class="btn btn-soft btn-sm" data-k="back">Back</button>' : '') + '<button class="btn btn-primary btn-sm" data-k="next">' + (last ? 'Done' : 'Next') + '</button></div></div>';
    var spot = el.querySelector('.tour-spot'), card = el.querySelector('.tour-card');
    if (target) {
      target.scrollIntoView({ block: 'nearest', inline: 'nearest' }); var r = target.getBoundingClientRect(), pad = 6;
      spot.style.cssText = 'top:' + (r.top - pad) + 'px;left:' + (r.left - pad) + 'px;width:' + (r.width + pad * 2) + 'px;height:' + (r.height + pad * 2) + 'px';
      var below = r.bottom + 190 < window.innerHeight, right = r.right + 340 < window.innerWidth;
      card.style.top = below ? Math.max(8, r.bottom + 14) + 'px' : 'auto'; card.style.bottom = below ? 'auto' : Math.max(8, window.innerHeight - r.top + 14) + 'px';
      card.style.left = right ? r.right + 14 + 'px' : Math.max(8, Math.min(r.left, window.innerWidth - 340)) + 'px';
      if (right) { card.style.top = Math.max(8, Math.min(r.top, window.innerHeight - 220)) + 'px'; card.style.bottom = 'auto'; }
    } else { spot.style.cssText = 'display:none'; card.classList.add('center'); }
    card.focus({ preventScroll: true });
    var an = document.getElementById('sr-announcer'); if (an) an.textContent = s.t + '. ' + s.x;
  }

  MT.tour = {
    seen: function () { return MT.storage.get('tour.' + MT.auth.role(), false) || MT.storage.get('tour.off', false); },
    start: function (force) {
      var role = MT.auth.role(); if (!role) return; if (!force && MT.tour.seen()) return;
      close(); steps = def(role); idx = 0; show();
      onKey = function (e) { if (!el) return; if (e.key === 'Escape') { e.stopPropagation(); close(true); } else if (e.key === 'ArrowRight') { next(); } else if (e.key === 'ArrowLeft' && idx) { idx--; show(); } };
      document.addEventListener('keydown', onKey, true);
      el.addEventListener('click', function (e) { var k = e.target.closest('[data-k]'); if (!k) return; if (k.dataset.k === 'skip') close(true); else if (k.dataset.k === 'back') { idx--; show(); } else next(); });
    },
    close: close
  };
  function next() { if (idx >= steps.length - 1) close(true); else { idx++; show(); } }

})();
