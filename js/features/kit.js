/**
 * MyTree — small shared kit for the community features (workshops, marketplace, wings):
 *   MT.kit.form({title, html, submit, onSubmit(values, dlg), wide})  modal form with validation message + busy state
 *   MT.kit.myWorkshops()                                              every workshop the signed-in user may see (merged queries)
 *   MT.kit.when(iso)                                                  friendly date-time
 * It is loaded eagerly because it also feeds the notification bell (upcoming workshops, orders waiting for you) without loading the feature bundles.
 */
(function () {
  'use strict';
  var MT = window.MT, ui = MT.ui, kit = (MT.kit = {}), DAY = 86400000;

  kit.when = function (iso) {
    if (!iso) return '';
    var d = new Date(iso); if (isNaN(d)) return iso;
    return d.toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  };
  kit.dateOnly = function (iso) { var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); };
  kit.rupees = function (n) { return '₹' + (Math.round((+n || 0) * 100) / 100).toLocaleString('en-IN'); };
  kit.sessionState = function (s, now) {
    now = now || Date.now(); var a = new Date(s.start).getTime(), b = new Date(s.end || s.start).getTime() || a + 3600000;
    return now < a - 30 * 60000 ? 'upcoming' : now <= b + 15 * 60000 ? 'live' : 'past';
  };
  kit.nextSession = function (w) {
    var now = Date.now(), list = (w.sessions || []).slice().sort(function (a, b) { return a.start < b.start ? -1 : 1; });
    return list.filter(function (s) { return kit.sessionState(s, now) !== 'past'; })[0] || list[list.length - 1] || null;
  };

  /** Modal form. `html` is the inner markup of the form grid; values are read by element name (checkbox groups → arrays). */
  kit.form = function (o) {
    var b = document.createElement('div'), dlg;
    b.innerHTML = '<form class="form" novalidate><div class="form-grid">' + o.html + '</div><p class="field-err" data-err role="alert"></p><div class="btn-row"><button type="button" class="btn btn-ghost" data-cancel>Cancel</button><button class="btn btn-primary" type="submit">' + MT.esc(o.submit || 'Save') + '</button></div></form>';
    var form = b.querySelector('form'), err = b.querySelector('[data-err]');
    b.addEventListener('click', function (e) { if (e.target.closest('[data-cancel]')) dlg.close(); if (o.onClick) o.onClick(e, b); });
    form.addEventListener('submit', function (e) {
      e.preventDefault(); err.textContent = '';
      var v = {}; [].forEach.call(form.elements, function (el) {
        if (!el.name) return;
        if (el.type === 'checkbox') { if (/\[\]$/.test(el.name)) { var k = el.name.slice(0, -2); (v[k] = v[k] || []); if (el.checked) v[k].push(el.value); } else v[el.name] = el.checked; }
        else if (el.type === 'radio') { if (el.checked) v[el.name] = el.value; }
        else v[el.name] = typeof el.value === 'string' ? el.value.trim() : el.value;
      });
      var btn = form.querySelector('[type=submit]'); btn.disabled = true;
      Promise.resolve().then(function () { return o.onSubmit(v, dlg); }).then(function (r) { if (r !== false) dlg.close(); }, function (er) { err.textContent = MT.friendlyError(er); }).then(function () { btn.disabled = false; });
    });
    ui.modal({ title: o.title, body: b, wide: !!o.wide, actions: [], onOpen: function (d) { dlg = d; if (o.onOpen) o.onOpen(b, d); } });
    return b;
  };

  /** All workshops visible to me (invited by everyone / role / organisation / person, organised by me, or run beneath me). */
  var wsCache = { at: 0, p: null };
  kit.myWorkshops = function (force) {
    var p = MT.auth.profile(); if (!p) return Promise.resolve([]);
    if (!force && wsCache.p && Date.now() - wsCache.at < 30000) return wsCache.p;
    var q = function (where) { return MT.db.list('workshops', { where: where, limit: 200 }).catch(function () { return []; }); };
    var jobs = p.role === 'super_admin' ? [MT.db.list('workshops', { limit: 300 }).catch(function () { return []; })] : [
      q([['audience', '==', 'all']]), q([['audienceRoles', 'array-contains', p.role]]), p.orgId ? q([['audienceOrgIds', 'array-contains', p.orgId]]) : Promise.resolve([]),
      q([['audienceUserIds', 'array-contains', p.userId]]), q([['organiserId', '==', p.userId]]), p.orgId ? q([['ancestorOrgIds', 'array-contains', p.orgId]]) : Promise.resolve([])];
    wsCache.at = Date.now();
    return (wsCache.p = Promise.all(jobs).then(function (r) { var seen = {}, out = []; r.forEach(function (l) { l.forEach(function (w) { if (!seen[w.id]) { seen[w.id] = 1; out.push(w); } }); }); return out; }));
  };
  kit.refreshWorkshops = function () { wsCache.p = null; };

  /* ---------- notification bell: upcoming workshops + marketplace actions ---------- */
  MT.notify.register(function () {
    var p = MT.auth.profile(); if (!p) return [];
    var tasks = [kit.myWorkshops().then(function (list) {
      var now = Date.now();
      return list.filter(function (w) { return w.status !== 'cancelled'; }).map(function (w) { var s = kit.nextSession(w); return s && { w: w, s: s }; }).filter(function (x) { if (!x) return false; var t = new Date(x.s.start).getTime(); return t > now - 3600000 && t < now + 3 * DAY; })
        .map(function (x) { return { nid: 'ws_' + x.w.id + '_' + x.s.id, title: 'Workshop: ' + x.w.title, text: kit.when(x.s.start), href: '/workshops/' + x.w.id, icon: 'presentation' }; });
    })];
    if (p.role === 'seller') tasks.push(MT.db.list('orders', { where: [['sellerId', '==', p.orgId]], limit: 100 }).then(function (rows) { var n = rows.filter(function (o) { return o.status === 'paid_claimed'; }).length; return n ? [{ nid: 'ord_wait', title: n + ' payment' + (n > 1 ? 's' : '') + ' to confirm', text: 'Buyers say they have paid — confirm once you receive it.', href: '/market/orders', icon: 'badge-indian-rupee' }] : []; }).catch(function () { return []; }));
    else if (['foundation', 'school', 'institution', 'individual'].indexOf(p.role) > -1) tasks.push(MT.db.list('orders', { where: [['buyerId', '==', p.userId]], limit: 100 }).then(function (rows) {
      var n = rows.filter(function (o) { return o.status === 'delivered' && (o.items || []).some(function (it, i) { return it.category === 'sapling' && (+((o.plantedQty || {})[i]) || 0) < it.qty; }); }).length;
      return n ? [{ nid: 'ord_plant', title: 'Saplings ready to plant', text: 'You have delivered saplings waiting to be planted.', href: '/market/orders', icon: 'sprout' }] : [];
    }).catch(function () { return []; }));
    return Promise.all(tasks).then(function (r) { return [].concat.apply([], r); });
  });
})();
