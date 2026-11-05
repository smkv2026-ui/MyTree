/**
 * MyTree — Plantation drives, shared core (eager: it feeds the dashboard widget and the notification bell).
 * Anyone (except students, whose school hosts for them) can host a drive: date, site address + map pin, how many volunteers are needed, saplings provided.
 * Everyone signed in can see drives and register while spots remain (1–5 people per registration). Pages live in drives.js (lazy).
 *
 *   drives/{id}              { title, description, hostId, hostName, hostRole, orgId, ancestorOrgIds, date 'YYYY-MM-DDTHH:mm', durationH, address, city, state, lat, lng,
 *                              capacity, registered, saplings, bring, phone, status: open|cancelled|done, createdAt }
 *   driveRegs/{drive}_{user} { driveId, userId, name, role, orgId, party, status: registered|cancelled|attended, hostId, ancestorOrgIds, at }
 * `registered` is bumped with a server-side increment in the same batch as the registration, and the security rules refuse anything above `capacity`
 * — so two people grabbing the last spot can never both succeed.
 */
(function () {
  'use strict';
  var MT = window.MT, ui = MT.ui, esc = MT.esc, DAY = 86400000;
  var ART = [['#0f6b4a', '#3ec27a'], ['#17808c', '#52c7a6'], ['#2e7d32', '#c6d85a'], ['#b8742a', '#f0c95a'], ['#3b5fa8', '#69c0b0'], ['#7a4a8a', '#e08bb0']];

  function startMs(d) { return new Date(d.date).getTime(); }
  function endMs(d) { return startMs(d) + (d.durationH || 2) * 3600000; }
  var D = (MT.drives = {
    spots: function (d) { return Math.max(0, d.capacity - (d.registered || 0)); },
    state: function (d, now) { now = now || Date.now(); if (d.status === 'cancelled') return 'cancelled'; if (d.status === 'done' || now > endMs(d)) return 'past'; if (now >= startMs(d) - 30 * 60000) return 'live'; return D.spots(d) <= 0 ? 'full' : 'open'; },
    art: function (id) { var h = 0; String(id).split('').forEach(function (c) { h = (h * 31 + c.charCodeAt(0)) >>> 0; }); return ART[h % ART.length]; },
    startMs: startMs, endMs: endMs,
    countdown: function (d) { var ms = startMs(d) - Date.now(); if (ms < 0) return Date.now() <= endMs(d) ? 'Happening now' : 'Finished'; var h = Math.floor(ms / 3600000); return h < 1 ? 'Starts in ' + Math.max(1, Math.round(ms / 60000)) + ' min' : h < 24 ? 'Starts in ' + h + ' h' : 'In ' + Math.round(ms / DAY) + ' day' + (Math.round(ms / DAY) > 1 ? 's' : ''); },
    when: function (d) { var a = new Date(d.date), b = new Date(endMs(d)); return a.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' + a.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) + ' – ' + b.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }); },
    mapsUrl: function (d) { return 'https://www.google.com/maps/search/?api=1&query=' + d.lat + ',' + d.lng; },
    url: function (id) { return location.href.split('#')[0].split('?')[0] + '#/drives/' + encodeURIComponent(id); },
    list: function () { return MT.db.list('drives', { limit: 300 }).then(function (r) { return r.sort(function (a, b) { return startMs(a) - startMs(b); }); }); },
    myRegs: function () { var p = MT.auth.profile(); return MT.db.list('driveRegs', { where: [['userId', '==', p.userId]], limit: 300 }).catch(function () { return []; }); },
    /** One drive as a card (used by the dashboard and the drives page). `reg` is my registration, if any. */
    card: function (d, reg) {
      var st = D.state(d), a = D.art(d.id), left = D.spots(d), pct = d.capacity ? Math.round((d.registered || 0) / d.capacity * 100) : 0, mine = reg && reg.status !== 'cancelled' ? reg : null, tone = pct >= 100 ? 'full' : pct >= 80 ? 'low' : 'ok', dt = new Date(d.date);
      return '<article class="card dr-card st-' + st + '" style="--a:' + a[0] + ';--b:' + a[1] + '"><a class="dr-banner" href="#/drives/' + esc(d.id) + '" tabindex="-1" aria-hidden="true"><span class="dr-date"><strong>' + dt.getDate() + '</strong><small>' + esc(dt.toLocaleDateString('en-IN', { month: 'short' })) + '</small></span><span class="dr-emoji" aria-hidden="true">' + (d.saplings > 0 ? '🌳' : '🌱') + '</span>' +
        '<span class="dr-badges">' + (st === 'live' ? '<span class="badge badge-warn">Live now</span>' : '') + (st === 'full' ? '<span class="badge badge-bad">Full</span>' : '') + (st === 'cancelled' ? '<span class="badge badge-bad">Cancelled</span>' : '') + (st === 'past' ? '<span class="badge badge-neutral">Finished</span>' : '') + (mine ? '<span class="badge badge-ok">✓ You’re in</span>' : '') + '</span></a>' +
        '<div class="dr-body"><h3><a href="#/drives/' + esc(d.id) + '">' + esc(d.title) + '</a></h3><p class="muted">' + esc(D.when(d)) + '</p><p class="dr-where">' + ui.icon('map-pin').s + ' ' + esc(d.city || d.address) + '</p>' +
        '<div class="dr-meter ' + tone + '" role="progressbar" aria-valuemin="0" aria-valuemax="' + d.capacity + '" aria-valuenow="' + (d.registered || 0) + '" aria-label="Volunteers registered"><span style="width:' + Math.min(100, pct) + '%"></span></div>' +
        '<div class="dr-foot"><span class="dr-spots ' + tone + '"><strong>' + (st === 'past' || st === 'cancelled' ? (d.registered || 0) : left) + '</strong> ' + (st === 'past' || st === 'cancelled' ? 'joined' : left === 1 ? 'spot left' : 'spots left') + ' <small>of ' + d.capacity + '</small></span>' +
        (st === 'open' || st === 'live' ? '<a class="btn btn-primary btn-sm" href="#/drives/' + esc(d.id) + (mine ? '' : '?reg=1') + '">' + (mine ? 'Your ticket' : 'Register') + '</a>' : '<a class="btn btn-soft btn-sm" href="#/drives/' + esc(d.id) + '">View</a>') + '</div></div></article>';
    },
    /** Dashboard strip: the next few upcoming drives, with a way to host one. */
    widget: function (host) {
      var box = MT.$('#dr-widget', host); if (!box) return;
      Promise.all([D.list().catch(function () { return []; }), D.myRegs()]).then(function (r) {
        if (!box.isConnected) return; var regs = {}; r[1].forEach(function (x) { regs[x.driveId] = x; });
        var up = r[0].filter(function (d) { var s = D.state(d); return s === 'open' || s === 'live' || s === 'full'; }).slice(0, 4), p = MT.auth.profile(), canHost = p.role !== 'student';
        box.innerHTML = '<div class="card-head"><h3>Plantation drives</h3><span class="dr-head-links"><a href="#/drives">See all</a></span></div>' +
          (up.length ? '<div class="dr-strip">' + up.map(function (d) { return D.card(d, regs[d.id]); }).join('') + '</div>' : '<p class="muted">No drives are scheduled yet. ' + (canHost ? 'Be the first to host one!' : 'Ask your school or an organisation to host one.') + '</p>') +
          '<div class="btn-row">' + (canHost ? '<a class="btn btn-primary btn-sm" href="#/drives?new=1">' + ui.icon('plus').s + ' Host a drive</a>' : '') + '<a class="btn btn-soft btn-sm" href="#/drives">' + ui.icon('calendar-heart').s + ' Browse all drives</a></div>'; ui.icons();
      }).catch(function () { box.remove(); });
    },
    register: function (d, party) {
      var p = MT.auth.profile(), b = MT.db.batch(), rec = { driveId: d.id, userId: p.userId, name: MT.stats.shortName(p.name), role: p.role, orgId: p.orgId || '', party: party, status: 'registered', hostId: d.hostId, ancestorOrgIds: d.ancestorOrgIds || [], at: Date.now() };
      b.set('driveRegs', d.id + '_' + p.userId, rec); b.update('drives', d.id, { registered: MT.db.inc(party) }); return b.commit().then(function () { return rec; });
    },
    cancel: function (d, reg) { var b = MT.db.batch(); b.update('driveRegs', reg.id || d.id + '_' + reg.userId, { status: 'cancelled', at: Date.now() }); b.update('drives', d.id, { registered: MT.db.inc(-reg.party) }); return b.commit(); }
  });

  /* reminders in the notification bell: a drive I registered for starts within 2 days; hosts see sign-ups growing */
  MT.notify.register(function () {
    var p = MT.auth.profile(); if (!p) return [];
    return Promise.all([D.myRegs(), D.list().catch(function () { return []; })]).then(function (r) {
      var now = Date.now(), by = {}; r[1].forEach(function (d) { by[d.id] = d; });
      return r[0].filter(function (x) { return x.status === 'registered' && by[x.driveId]; }).map(function (x) { return by[x.driveId]; }).filter(function (d) { var t = startMs(d); return d.status === 'open' && t > now - 3600000 && t < now + 2 * DAY; })
        .map(function (d) { return { nid: 'dr_' + d.id, title: 'Drive: ' + d.title, text: D.countdown(d) + ' · ' + (d.city || d.address), href: '/drives/' + d.id, icon: 'tent-tree' }; });
    }).catch(function () { return []; });
  });
})();
