/**
 * MyTree — growth-update domain service (no UI).
 *   MT.updates.post(opts)          one atomic batch: update doc + photos + tree patch + counters (+ audit if on behalf)
 *   MT.updates.forTree(tree)       updates for a tree, newest first (rule-provable query for the current viewer)
 *   MT.cadence.status(tree)        {state:'ok'|'soon'|'due'|'overdue'|'dead', dueOn, days}
 *   MT.due.load(scopeKey)          cached list of trees needing updates (drives bell badge, #/updates)
 *   MT.ics.build / MT.ics.download calendar reminders (no server e-mail on the free plan)
 *   MT.updates.seasonTip(tree)     species- and season-aware care tip
 */
(function () {
  'use strict';
  var MT = window.MT, DAY = 86400000;

  /* ---------- cadence & due logic (client-side) ---------- */
  MT.cadence = {
    DAYS: { weekly: 7, monthly: 30, yearly: 365 },
    /** Last known update (ms) — falls back to the planting date. */
    lastOn: function (t) { return Math.max(t.lastUpdateAt || 0, new Date(t.plantedOn + 'T00:00:00').getTime() || 0); },
    status: function (t, now) {
      now = now || Date.now();
      if (t.status === 'dead') return { state: 'dead', days: 0 };
      var d = MT.cadence.DAYS[t.cadence] || 30, dueAt = MT.cadence.lastOn(t) + d * DAY, diff = Math.floor((dueAt - now) / DAY);
      var state = now >= dueAt + d * 0.5 * DAY ? 'overdue' : now >= dueAt ? 'due' : diff <= 3 ? 'soon' : 'ok';
      return { state: state, dueAt: dueAt, dueOn: MT.fmt.iso(new Date(dueAt)), days: diff };
    },
    label: function (s) {
      if (s.state === 'dead') return 'No updates needed';
      if (s.state === 'overdue') return 'Overdue by ' + Math.max(1, -s.days) + ' d';
      if (s.state === 'due') return s.days === 0 ? 'Due today' : 'Due ' + Math.max(1, -s.days) + ' d ago';
      if (s.state === 'soon') return s.days <= 0 ? 'Due today' : 'Due in ' + s.days + ' d';
      return 'Next update ' + MT.fmt.date(s.dueAt, { day: 'numeric', month: 'short' });
    },
    tone: function (s) { return { overdue: 'bad', due: 'warn', soon: 'info', ok: 'ok', dead: 'neutral' }[s.state]; }
  };

  /* ---------- cached due list ---------- */
  var cache = {};
  MT.due = {
    scopeKey: function () { var p = MT.auth.profile(); return p ? p.role + ':' + (p.orgId || p.userId) : ''; },
    /** @param {'mine'|'org'} [scope] default: org for org admins, mine otherwise */
    load: function (scope, force) {
      var p = MT.auth.profile(); if (!p || p.role === 'super_admin' || !p.active) return Promise.resolve({ items: [], capped: false, trees: [] });
      scope = scope || (MT.auth.isOrgAdmin() ? 'org' : 'mine');
      var key = MT.due.scopeKey() + '|' + scope, hit = cache[key];
      if (!force && hit && Date.now() - hit.at < 180000) return hit.p;
      var where = scope === 'org' ? [['ancestorOrgIds', 'array-contains', p.orgId]] : [['ownerId', '==', p.userId]];
      var LIMIT = 500;
      var pr = MT.db.list('trees', { where: where, orderBy: ['lastUpdateAt', 'asc'], limit: LIMIT }).then(function (rows) {
        var now = Date.now(), items = rows.map(function (t) { return { tree: t, s: MT.cadence.status(t, now) }; });
        var needs = items.filter(function (i) { return i.s.state === 'due' || i.s.state === 'overdue'; });
        needs.sort(function (a, b) { return a.s.dueAt - b.s.dueAt; });
        return { items: items, needs: needs, capped: rows.length >= LIMIT, trees: rows };
      });
      cache[key] = { at: Date.now(), p: pr }; pr.catch(function () { delete cache[key]; });
      return pr;
    },
    invalidate: function () { cache = {}; }
  };

  /* ---------- posting ---------- */
  var U = (MT.updates = {
    HEALTH: [['thriving', 'Thriving', 'sparkles'], ['healthy', 'Healthy', 'leaf'], ['needs_care', 'Needs care', 'droplets'], ['struggling', 'Struggling', 'alert-triangle'], ['dead', 'Dead', 'skull']],
    MAX_PHOTOS: 4,
    /**
     * @param {{tree:Object, date:string, health:string, heightCm?:number, girthCm?:number, notes?:string, photos?:Array}} o
     * @returns {Promise<Object>} the created update
     */
    post: function (o) {
      var me = MT.auth.profile(), t = o.tree, onBehalf = t.ownerId !== me.userId, now = Date.now();
      if (!MT.auth.isActive()) return Promise.reject(MT.userError('Your account is not active yet.'));
      if (!o.date || o.date > MT.fmt.iso(new Date())) return Promise.reject(MT.userError('The date cannot be in the future.'));
      if (o.date < t.plantedOn) return Promise.reject(MT.userError('The update cannot be older than the planting date (' + MT.fmt.date(t.plantedOn) + ').'));
      var h = o.heightCm === '' || o.heightCm == null ? null : +o.heightCm, g = o.girthCm === '' || o.girthCm == null ? null : +o.girthCm;
      if (h != null && (isNaN(h) || h < 0 || h > 5000)) return Promise.reject(MT.userError('Height should be between 0 and 5000 cm.'));
      if (g != null && (isNaN(g) || g < 0 || g > 1000)) return Promise.reject(MT.userError('Girth should be between 0 and 1000 cm.'));
      var b = MT.db.batch(), photos = (o.photos || []).slice(0, U.MAX_PHOTOS);
      var scope = { treeId: t.code, ownerId: t.ownerId, orgId: t.orgId || '', ancestorOrgIds: t.ancestorOrgIds || [] };
      var photoIds = photos.map(function (p) { return MT.photoStore.store(b, p, Object.assign({ kind: 'update' }, scope)); });
      var id = MT.uid('u'), upd = Object.assign({}, scope, {
        postedBy: me.userId, postedByName: me.name, onBehalfOf: onBehalf ? t.ownerId : '', onBehalfOfName: onBehalf ? t.ownerName : '', date: o.date, health: o.health,
        notes: String(o.notes || '').trim().slice(0, 500), photoIds: photoIds, kind: o.health === 'dead' ? 'dead' : 'update', createdAt: now
      });
      if (h != null) upd.heightCm = h; if (g != null) upd.girthCm = g; if (photos[0]) upd.cover = photos[0].cover;
      b.set('treeUpdates', id, upd);
      var dateMs = new Date(o.date + 'T12:00:00').getTime();
      var patch = { health: o.health, status: o.health === 'dead' ? 'dead' : 'alive', lastUpdateAt: Math.max(t.lastUpdateAt || 0, dateMs), updatesCount: MT.db.inc(1) };
      if (h != null && dateMs >= (t.lastUpdateAt || 0)) patch.heightCm = Math.round(h);
      if (g != null) patch.girthCm = g;
      if (photos[0] && !t.coverPhotoId) { patch.coverPhotoId = photoIds[0]; patch.cover = photos[0].cover; patch.photoSize = photos[0].size; }
      b.update('trees', t.code, patch);
      var next = Object.assign({}, t, { health: patch.health, status: patch.status });
      if (t.health !== next.health || t.status !== next.status) MT.stats.apply(b, [{ tree: t, sign: -1 }, { tree: next, sign: 1 }]);
      MT.stats.updates(b, t, o.date);
      if (onBehalf) MT.audit.add(b, { action: 'tree.update', targetType: 'tree', targetId: t.code, onBehalfOfId: t.ownerId, onBehalfOfName: t.ownerName, detail: ui_health(o.health) + (photos.length ? ' · ' + photos.length + ' photo(s)' : ''), orgId: t.orgId, ancestorOrgIds: t.ancestorOrgIds });
      return b.commit().then(function () {
        MT.due.invalidate();
        Object.assign(t, { health: patch.health, status: patch.status, lastUpdateAt: patch.lastUpdateAt, updatesCount: (t.updatesCount || 0) + 1 });
        if (patch.heightCm != null) t.heightCm = patch.heightCm; if (patch.coverPhotoId) { t.coverPhotoId = patch.coverPhotoId; t.cover = patch.cover; }
        return Object.assign({ id: id }, upd);
      });
    },
    /** Updates for one tree, newest first. The query is scoped so Firestore rules can prove access for owners and org admins. */
    forTree: function (t) {
      var p = MT.auth.profile(), where = [['treeId', '==', t.code]];
      if (p.role === 'super_admin') { /* unrestricted */ } else if (t.ownerId === p.userId) where.push(['ownerId', '==', p.userId]); else where.push(['ancestorOrgIds', 'array-contains', p.orgId]);
      return MT.db.list('treeUpdates', { where: where, limit: 200 }).then(function (rows) { return rows.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt; }); });
    },
    remove: function (u, tree) {
      var b = MT.db.batch(); b.delete('treeUpdates', u.id); (u.photoIds || []).forEach(function (pid) { MT.photoStore.remove(b, pid, { ownerId: u.ownerId, size: 0 }); });
      b.update('trees', tree.code, { updatesCount: MT.db.inc(-1) }); return b.commit().then(MT.due.invalidate);
    },
    /** Season-aware care tip for the tree's species and the current Indian season. */
    seasonTip: function (t, d) {
      var m = (d || new Date()).getMonth() + 1, sp = MT.species.get(t.speciesId), season, tip;
      if (m >= 3 && m <= 5) { season = 'Summer'; tip = 'Water deeply early in the morning, add a 5 cm mulch ring and shade young saplings from afternoon sun.'; }
      else if (m >= 6 && m <= 9) { season = 'Monsoon'; tip = 'Best time to plant and replace dead saplings. Check that water does not collect around the trunk and watch for fungus or pests.'; }
      else if (m >= 10 && m <= 11) { season = 'Post-monsoon'; tip = 'Good time to prune dead twigs, loosen the soil around the base and add compost.'; }
      else { season = 'Winter'; tip = (sp.category === 'palm' || sp.category === 'fruit') ? 'Water less often but keep soil lightly moist. Protect young trees from cold nights and frost.' : 'Water less often. Protect young saplings from frost in the hills and check guards after strong winds.'; }
      return { season: season, tip: tip, species: sp.tip };
    }
  });
  function ui_health(h) { return MT.ui.healthLabel[h] || h; }

  /** Update counters (global, every org, month of the update). */
  MT.stats.updates = function (batch, t, dateStr) {
    var keys = ['global', 'month_' + dateStr.slice(0, 7)].concat((t.ancestorOrgIds || []).map(function (a) { return 'org_' + a; }));
    keys.forEach(function (k) { var d = { updates: MT.db.inc(1) }; if (k.indexOf('month_') === 0) d.kind = 'month'; else if (k.indexOf('org_') === 0) d.kind = 'org'; batch.set('stats', k, d, { merge: true }); });
  };

  /* ---------- calendar reminders (.ics) ---------- */
  function esc(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
  function fold(line) { var out = [], l = line; while (l.length > 74) { out.push(l.slice(0, 74)); l = ' ' + l.slice(74); } out.push(l); return out.join('\r\n'); }
  function ymd(iso) { return iso.replace(/-/g, ''); }
  MT.ics = {
    /** @param {Array<{uid:string, date:string, title:string, desc?:string, url?:string, freq?:'WEEKLY'|'MONTHLY'|'YEARLY'}>} events */
    build: function (events) {
      var L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MyTree//Update reminders//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:MyTree reminders'];
      var stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
      events.forEach(function (e) {
        L.push('BEGIN:VEVENT', 'UID:' + e.uid + '@mytree', 'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + ymd(e.date), 'SUMMARY:' + esc(e.title));
        if (e.freq) L.push('RRULE:FREQ=' + e.freq);
        if (e.desc) L.push('DESCRIPTION:' + esc(e.desc)); if (e.url) L.push('URL:' + e.url);
        L.push('TRANSP:TRANSPARENT', 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(e.title), 'TRIGGER:PT9H', 'END:VALARM', 'END:VEVENT');
      });
      L.push('END:VCALENDAR'); return L.map(fold).join('\r\n') + '\r\n';
    },
    forTree: function (t) {
      var s = MT.cadence.status(t), date = s.dueOn < MT.fmt.iso(new Date()) ? MT.fmt.iso(new Date()) : s.dueOn;
      return { uid: t.code, date: date, freq: { weekly: 'WEEKLY', monthly: 'MONTHLY', yearly: 'YEARLY' }[t.cadence] || 'MONTHLY', title: 'Update ' + MT.trees.nameOf(t) + ' (' + t.code + ')', desc: 'Post a growth update for ' + MT.trees.nameOf(t) + ': photo, height and health.', url: MT.trees.url(t.code) };
    },
    download: function (trees, name) {
      MT.download(name || 'mytree-reminders.ics', MT.ics.build(trees.filter(function (t) { return t.status !== 'dead'; }).map(MT.ics.forTree)), 'text/calendar');
    }
  };
})();
