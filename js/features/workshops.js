/**
 * MyTree — Workshops. Admins (Super Admin, foundations, schools, institutions) hold workshops for any audience beneath them — the whole portal (Super Admin only),
 * whole roles, chosen organisations (everything beneath them is included) or hand-picked people. A workshop has one or more sessions with your own meeting
 * link (Zoom / Meet / Teams…) or a venue. Invitees RSVP; the organiser marks attendance (or people check themselves in while the session is live);
 * afterwards attendees give feedback and can download a certificate. Routes: #/workshops (list), #/workshops/:id (details & management).
 */
(function () {
  'use strict';
  var MT = window.MT, ui = MT.ui, kit = MT.kit, esc = MT.esc;
  var ROLES = ['super_admin', 'foundation', 'school', 'institution', 'student', 'individual', 'seller'], MGR = ['super_admin', 'foundation', 'school', 'institution'];
  var AUD_ROLES = [['foundation', 'Foundations'], ['school', 'Schools'], ['institution', 'Institutions / Kendras'], ['student', 'Students'], ['individual', 'Individuals'], ['seller', 'Sellers']];

  function isOrganiser(w, p) { return w.organiserId === p.userId || p.role === 'super_admin'; }
  function canManage(w, p) { return isOrganiser(w, p) || (MGR.indexOf(p.role) > -1 && (w.ancestorOrgIds || []).indexOf(p.orgId) > -1); }
  function shortName(n) { return MT.stats && MT.stats.shortName ? MT.stats.shortName(n) : n; }
  function ownRecords(coll) { var p = MT.auth.profile(); return MT.db.list(coll, { where: [['userId', '==', p.userId]], limit: 500 }).catch(function () { return []; }); }
  /** Where-clause that lets Firestore prove the organiser / manager may read these rows. */
  function scope(w) { var p = MT.auth.profile(); if (p.role === 'super_admin') return [['workshopId', '==', w.id]]; if (w.organiserId === p.userId) return [['organiserId', '==', p.userId], ['workshopId', '==', w.id]]; return [['ancestorOrgIds', 'array-contains', p.orgId], ['workshopId', '==', w.id]]; }
  function scoped(coll, w) { return MT.db.list(coll, { where: scope(w), limit: 3000 }).catch(function () { return []; }); }

  function audienceBadge(w) { return '<span class="badge badge-neutral">' + esc(w.audienceLabel || 'Invited people') + '</span>'; }
  function modeBadge(w) { return '<span class="badge badge-ok">' + esc({ online: 'Online', offline: 'In person', hybrid: 'Hybrid' }[w.mode] || 'Online') + '</span>'; }
  function stateOf(w) { if (w.status === 'cancelled') return 'cancelled'; var n = kit.nextSession(w); return n ? kit.sessionState(n) : 'past'; }

  /* ---------------- ICS ---------------- */
  function ics(w) {
    var pad = function (d) { return d.toISOString().replace(/[-:]|\.\d{3}/g, ''); }, L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MyTree//Workshops//EN'];
    (w.sessions || []).forEach(function (s) { var a = new Date(s.start), b = new Date(s.end || a.getTime() + 3600000); L.push('BEGIN:VEVENT', 'UID:' + w.id + '-' + s.id + '@mytree', 'DTSTAMP:' + pad(new Date()), 'DTSTART:' + pad(a), 'DTEND:' + pad(b), 'SUMMARY:' + w.title.replace(/[,;\n]/g, ' '), 'LOCATION:' + (s.link || s.venue || '').replace(/[,;\n]/g, ' '), 'DESCRIPTION:' + (w.description || '').replace(/\n/g, ' ').slice(0, 300) + (s.link ? ' Join: ' + s.link : ''), 'END:VEVENT'); });
    L.push('END:VCALENDAR'); MT.download('workshop-' + w.id + '.ics', L.join('\r\n'), 'text/calendar');
  }

  /* ================= list page ================= */
  function listPage() {
    var p = MT.auth.profile(), mgr = MGR.indexOf(p.role) > -1;
    return '<div class="page ws-page" data-reveal><div class="page-head"><h2>Workshops</h2><p class="muted">Learning sessions for the MyTree community — join, give feedback and collect certificates.' + (mgr ? ' You can also organise your own.' : '') + '</p></div>' +
      '<div class="btn-row">' + (mgr ? '<button class="btn btn-primary" id="ws-new">' + ui.icon('plus').s + ' New workshop</button>' : '') + '</div>' +
      '<div class="tabs" role="tablist" id="ws-tabs"><a class="tab-link active" role="tab" data-t="upcoming" href="#/workshops">Upcoming</a><a class="tab-link" role="tab" data-t="past" href="#/workshops">Past</a>' + (mgr ? '<a class="tab-link" role="tab" data-t="mine" href="#/workshops">Organised by me</a>' : '') + '</div><div id="ws-body">' + ui.skeleton(3, 'sk-line').s + '</div></div>';
  }
  function listAfter(host) {
    var p = MT.auth.profile(), tab = 'upcoming', list = [], rsvps = {}, dead = false, body = MT.$('#ws-body', host);
    function card(w) {
      var n = kit.nextSession(w), st = stateOf(w), r = rsvps[w.id];
      return '<article class="card ws-card"><div class="ws-date">' + (n ? '<strong>' + esc(new Date(n.start).toLocaleDateString('en-IN', { day: 'numeric' })) + '</strong><span>' + esc(new Date(n.start).toLocaleDateString('en-IN', { month: 'short' })) + '</span>' : '') + '</div><div class="ws-main"><h3><a href="#/workshops/' + esc(w.id) + '">' + esc(w.title) + '</a></h3>' +
        '<p class="muted">' + (n ? esc(kit.when(n.start)) : '') + ((w.sessions || []).length > 1 ? ' · ' + w.sessions.length + ' sessions' : '') + ' · by ' + esc(w.organiserName) + '</p><div class="chips">' + modeBadge(w) + audienceBadge(w) +
        (st === 'live' ? '<span class="badge badge-warn">Live now</span>' : '') + (st === 'cancelled' ? '<span class="badge badge-bad">Cancelled</span>' : '') + (r ? '<span class="badge badge-ok">You: ' + esc(r.response) + '</span>' : (canManage(w, p) ? '' : '<span class="badge badge-warn">RSVP needed</span>')) + '</div></div>' +
        '<a class="btn btn-soft btn-sm" href="#/workshops/' + esc(w.id) + '">' + (canManage(w, p) && isOrganiser(w, p) ? 'Manage' : 'Open') + '</a></article>';
    }
    function paint() {
      var now = Date.now(), rows = list.filter(function (w) {
        if (tab === 'mine') return isOrganiser(w, p);
        var st = stateOf(w); return tab === 'upcoming' ? (st === 'upcoming' || st === 'live') : (st === 'past' || st === 'cancelled');
      }).sort(function (a, b) { var x = (kit.nextSession(a) || {}).start || '', y = (kit.nextSession(b) || {}).start || ''; return tab === 'past' ? (x < y ? 1 : -1) : (x < y ? -1 : 1); });
      body.innerHTML = rows.length ? '<div class="ws-list">' + rows.map(card).join('') + '</div>' : ui.empty({ icon: 'presentation', title: tab === 'upcoming' ? 'No upcoming workshops' : tab === 'past' ? 'Nothing here yet' : 'You have not organised a workshop yet', text: tab === 'upcoming' ? 'When someone invites you, it will appear here (and in your notifications).' : '' }).s; ui.icons();
    }
    Promise.all([kit.myWorkshops(true), ownRecords('workshopRsvps')]).then(function (r) { if (dead) return; list = r[0]; r[1].forEach(function (x) { rsvps[x.workshopId] = x; }); paint(); }).catch(function (e) { body.innerHTML = '<p class="muted">' + esc(MT.friendlyError(e)) + '</p>'; });
    MT.$('#ws-tabs', host).addEventListener('click', function (e) { var a = e.target.closest('[data-t]'); if (!a) return; e.preventDefault(); tab = a.dataset.t; MT.$$('#ws-tabs .tab-link', host).forEach(function (x) { x.classList.toggle('active', x === a); }); paint(); });
    var nb = MT.$('#ws-new', host); if (nb) nb.addEventListener('click', function () { editWorkshop(null, function (id) { MT.router.go('/workshops/' + id); }); });
    return function () { dead = true; };
  }

  /* ================= create / edit ================= */
  function sessionRow(s, i) {
    return '<div class="ws-srow" data-s="' + esc(s.id) + '"><label>Starts<input type="datetime-local" name="s_start" value="' + esc(s.start || '') + '" required></label><label>Ends<input type="datetime-local" name="s_end" value="' + esc(s.end || '') + '"></label>' +
      '<label class="ws-wide">Meeting link (Zoom, Meet, Teams…)<input type="url" name="s_link" value="' + esc(s.link || '') + '" placeholder="https://meet.google.com/abc-defg-hij"></label><label class="ws-wide">Venue (for in-person)<input name="s_venue" maxlength="120" value="' + esc(s.venue || '') + '" placeholder="Hall 2, Satsang Vidyalaya"></label>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-rm-s aria-label="Remove session">Remove</button></div>';
  }
  function editWorkshop(w, done) {
    var p = MT.auth.profile(), isSuper = p.role === 'super_admin', orgs = []; w = w || { sessions: [{ id: 's1' }], audience: 'custom', audienceRoles: [], audienceOrgIds: [], audienceUserIds: [], mode: 'online', certificate: true };
    var create = !w.id;
    var orgQ = isSuper ? MT.db.list('orgs', { limit: 500 }) : MT.db.list('orgs', { where: [['ancestorOrgIds', 'array-contains', p.orgId]], limit: 500 });
    orgQ.catch(function () { return []; }).then(function (list) {
      orgs = list.filter(function (o) { return o.status === 'approved' && o.type !== 'seller'; }).sort(function (a, b) { return a.name < b.name ? -1 : 1; });
      var picked = {}; (w.pickedOrgs || []).forEach(function (x) { picked[x] = 1; });
      var html = '<div class="field field-wide"><label for="w-title">Title</label><input id="w-title" name="title" maxlength="100" required value="' + esc(w.title || '') + '" placeholder="Composting & tree care for beginners"></div>' +
        '<div class="field field-wide"><label for="w-desc">What will people learn?</label><textarea id="w-desc" name="description" rows="3" maxlength="600">' + esc(w.description || '') + '</textarea></div>' +
        '<div class="field"><label for="w-mode">Mode</label><select id="w-mode" name="mode">' + [['online', 'Online (meeting link)'], ['offline', 'In person (venue)'], ['hybrid', 'Hybrid']].map(function (m) { return '<option value="' + m[0] + '"' + (w.mode === m[0] ? ' selected' : '') + '>' + m[1] + '</option>'; }).join('') + '</select></div>' +
        '<div class="field"><label for="w-cap">Capacity (0 = no limit)</label><input id="w-cap" name="capacity" type="number" min="0" max="100000" value="' + (w.capacity || 0) + '"></div>' +
        '<fieldset class="field field-wide ws-fs"><legend>Sessions</legend><div id="w-sessions">' + (w.sessions || []).map(sessionRow).join('') + '</div><button type="button" class="btn btn-soft btn-sm" id="w-add-s">+ Add another session</button><p class="fine">Use your own meeting link for each session. Times are in your local time zone.</p></fieldset>' +
        '<fieldset class="field field-wide ws-fs"><legend>Who is invited?</legend>' +
        (isSuper ? '<label class="check"><input type="checkbox" name="all" ' + (w.audience === 'all' ? 'checked' : '') + '><span><strong>Everyone on MyTree</strong> (all users)</span></label><p class="fine">Or pick roles:</p><div class="chips">' + AUD_ROLES.map(function (r) { return '<label class="chip"><input type="checkbox" name="roles[]" value="' + r[0] + '"' + ((w.audienceRoles || []).indexOf(r[0]) > -1 ? ' checked' : '') + '> ' + r[1] + '</label>'; }).join('') + '</div>' : '') +
        '<p class="fine">Organisations (everything beneath each one is included — students, sub-organisations, members):</p><div class="ws-orgs">' + (orgs.length ? orgs.map(function (o) { return '<label class="check"><input type="checkbox" name="orgs[]" value="' + esc(o.id) + '"' + (picked[o.id] ? ' checked' : '') + '><span>' + esc(o.name) + ' <small class="muted">' + esc(MT.ROLE_LABEL[o.type]) + ' · ' + esc(o.city || '') + '</small></span></label>'; }).join('') : '<p class="muted">No organisations beneath you yet.</p>') + '</div>' +
        '<label for="w-people">Specific people (user IDs, one per line or comma-separated)</label><textarea id="w-people" name="people" rows="2" placeholder="MT-IND-000012, MT-STU-SCH001-0004">' + esc((w.audienceUserIds || []).join(', ')) + '</textarea></fieldset>' +
        '<label class="check field-wide"><input type="checkbox" name="certificate" ' + (w.certificate !== false ? 'checked' : '') + '><span>Give a certificate of participation to attendees</span></label>';
      kit.form({ title: create ? 'New workshop' : 'Edit workshop', wide: true, html: html, submit: create ? 'Create workshop' : 'Save changes',
        onClick: function (e, b) {
          if (e.target.closest('#w-add-s')) { var d = document.createElement('div'); d.innerHTML = sessionRow({ id: 's' + (b.querySelectorAll('.ws-srow').length + 1 + Math.floor(Math.random() * 900)) }); MT.$('#w-sessions', b).appendChild(d.firstChild); }
          var rm = e.target.closest('[data-rm-s]'); if (rm && b.querySelectorAll('.ws-srow').length > 1) rm.closest('.ws-srow').remove();
        },
        onSubmit: function (v, dlg) {
          var b = dlg.querySelector('.modal-body'), sessions = [].map.call(b.querySelectorAll('.ws-srow'), function (r) { return { id: r.dataset.s, start: r.querySelector('[name=s_start]').value, end: r.querySelector('[name=s_end]').value, link: r.querySelector('[name=s_link]').value.trim(), venue: r.querySelector('[name=s_venue]').value.trim() }; });
          if (!v.title) throw MT.userError('Please give the workshop a title.');
          if (sessions.some(function (s) { return !s.start; })) throw MT.userError('Every session needs a start time.');
          if (sessions.some(function (s) { return s.end && s.end < s.start; })) throw MT.userError('A session ends before it starts.');
          if (sessions.some(function (s) { return s.link && !/^https?:\/\//i.test(s.link); })) throw MT.userError('Meeting links must start with https://');
          if (v.mode !== 'offline' && sessions.some(function (s) { return !s.link; })) throw MT.userError('Online and hybrid sessions need a meeting link — paste yours (Zoom, Google Meet, Teams…).');
          var users = String(v.people || '').split(/[\s,;]+/).filter(Boolean), picks = v.orgs || [], roles = isSuper ? (v.roles || []) : [], all = isSuper && !!v.all;
          if (!all && !roles.length && !picks.length && !users.length) throw MT.userError('Choose who is invited: an organisation, a role or specific people.');
          var expanded = {}; picks.forEach(function (id) { expanded[id] = 1; orgs.forEach(function (o) { if ((o.ancestorOrgIds || []).indexOf(id) > -1) expanded[o.id] = 1; }); });
          var names = all ? ['Everyone'] : roles.map(function (r) { return (AUD_ROLES.filter(function (x) { return x[0] === r; })[0] || [0, r])[1]; }).concat(picks.map(function (id) { return (orgs.filter(function (o) { return o.id === id; })[0] || {}).name; }).filter(Boolean).map(function (n) { return n + ' (+ beneath)'; })); if (users.length) names.push(users.length + ' invited ' + (users.length > 1 ? 'people' : 'person'));
          var doc = { title: v.title.slice(0, 100), description: (v.description || '').slice(0, 600), mode: v.mode, capacity: Math.max(0, parseInt(v.capacity, 10) || 0), sessions: sessions, audience: all ? 'all' : 'custom', audienceRoles: roles, audienceOrgIds: Object.keys(expanded).slice(0, 300), audienceUserIds: users.slice(0, 200), audienceLabel: names.join(' · ').slice(0, 200), pickedOrgs: picks, certificate: !!v.certificate };
          var id = w.id || MT.uid('w');
          var full = create ? Object.assign(doc, { organiserId: p.userId, organiserName: p.name, orgId: p.orgId || '', ancestorOrgIds: p.ancestorOrgIds || [], status: 'scheduled', createdAt: Date.now() }) : doc;
          return (create ? MT.db.set('workshops', id, full) : MT.db.update('workshops', id, doc)).then(function () { kit.refreshWorkshops(); ui.success(create ? 'Workshop created — invitees will see it in Workshops and their notifications.' : 'Workshop updated.'); if (done) done(id); });
        } });
    });
  }

  /* ================= detail ================= */
  function detailPage() { return '<div class="page ws-page" data-reveal><a class="back-link" href="#/workshops">' + ui.icon('arrow-left').s + ' All workshops</a><div id="wd">' + ui.skeleton(4, 'sk-line').s + '</div></div>'; }
  function detailAfter(host, ctx) {
    var p = MT.auth.profile(), id = ctx.params.id, wd = MT.$('#wd', host), dead = false, W, S = { rsvp: null, att: {}, fb: {}, tab: 'sessions' };
    function load() {
      return MT.db.get('workshops', id).then(function (w) { if (!w) throw MT.userError('This workshop was not found, or you are not invited.'); W = w; return Promise.all([ownRecords('workshopRsvps'), ownRecords('workshopAttendance'), ownRecords('workshopFeedback')]); }).then(function (r) {
        S.rsvp = r[0].filter(function (x) { return x.workshopId === id; })[0] || null; S.att = {}; S.fb = {}; r[1].forEach(function (x) { if (x.workshopId === id) S.att[x.sessionId] = x; }); r[2].forEach(function (x) { if (x.workshopId === id) S.fb[x.sessionId] = x; });
      });
    }
    function sessionCard(s, i) {
      var st = kit.sessionState(s), a = S.att[s.id], f = S.fb[s.id], org = canManage(W, p), cancelled = W.status === 'cancelled';
      var act = '';
      if (!cancelled) {
        if (s.link) act += '<a class="btn ' + (st === 'live' ? 'btn-primary' : 'btn-soft') + ' btn-sm" href="' + esc(s.link) + '" target="_blank" rel="noopener noreferrer">' + ui.icon('video').s + ' ' + (st === 'live' ? 'Join now' : 'Open meeting link') + '</a>';
        if (!org || isOrganiser(W, p)) { /* attendees */ }
        if (st === 'live' && !a) act += ' <button class="btn btn-primary btn-sm" data-checkin="' + esc(s.id) + '">I am attending — check me in</button>';
        if (a && a.status === 'present') act += ' <span class="badge badge-ok">✓ Attended</span>';
        if (st === 'past' && a && a.status === 'present' && !f) act += ' <button class="btn btn-primary btn-sm" data-fb="' + esc(s.id) + '">Give feedback</button>';
        if (f) act += ' <span class="badge badge-ok">Feedback sent · ' + '★'.repeat(f.rating) + '</span>';
        if (st === 'past' && a && a.status === 'present' && W.certificate) act += ' <button class="btn btn-ghost btn-sm" data-cert="' + esc(s.id) + '">' + ui.icon('award').s + ' Certificate</button>';
      }
      return '<article class="card ws-session"><div><p class="eyebrow">Session ' + (i + 1) + ' · ' + (st === 'live' ? 'Live now' : st === 'past' ? 'Finished' : 'Upcoming') + '</p><h3>' + esc(kit.when(s.start)) + (s.end ? ' – ' + esc(new Date(s.end).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })) : '') + '</h3>' + (s.venue ? '<p>' + ui.icon('map-pin').s + ' ' + esc(s.venue) + '</p>' : '') + (s.link ? '<p class="fine mono">' + esc(s.link) + '</p>' : '') + '</div><div class="btn-row">' + act + '</div></article>';
    }
    function invitee() {
      var r = S.rsvp ? S.rsvp.response : null;
      return '<section class="card"><div class="card-head"><h3>Will you join?</h3></div><div class="btn-row" id="rsvp-row">' + [['yes', 'Yes, I will attend'], ['maybe', 'Maybe'], ['no', 'No']].map(function (x) { return '<button class="btn ' + (r === x[0] ? 'btn-primary' : 'btn-soft') + '" data-rsvp="' + x[0] + '" aria-pressed="' + (r === x[0]) + '">' + x[1] + '</button>'; }).join('') + '<button class="btn btn-ghost" id="ics">' + ui.icon('calendar-plus').s + ' Add to calendar</button></div></section>';
    }
    function paint() {
      if (dead) return; var org = canManage(W, p), mine = isOrganiser(W, p);
      var head = '<section class="card tree-hero ws-hero"><div class="th-main"><p class="eyebrow">' + esc(W.audienceLabel || '') + '</p><h2>' + esc(W.title) + '</h2><p>' + esc(W.description || '') + '</p><div class="chips">' + modeBadge(W) + (W.status === 'cancelled' ? '<span class="badge badge-bad">Cancelled</span>' : '') + (W.capacity ? '<span class="badge badge-neutral">Capacity ' + W.capacity + '</span>' : '') + (W.certificate ? '<span class="badge badge-neutral">Certificate</span>' : '') + '</div><p class="fine">Organised by <strong>' + esc(W.organiserName) + '</strong></p>' +
        (mine ? '<div class="btn-row"><button class="btn btn-soft btn-sm" id="w-edit">' + ui.icon('pencil').s + ' Edit</button><button class="btn btn-ghost btn-sm" id="w-dup">Duplicate</button>' + (W.status !== 'cancelled' ? '<button class="btn btn-danger-soft btn-sm" id="w-cancel">Cancel workshop</button>' : '') + '</div>' : '') + '</div></section>';
      var tabs = org ? '<div class="tabs" id="wd-tabs">' + [['sessions', 'Sessions'], ['people', 'Invitees & RSVPs'], ['attendance', 'Attendance'], ['feedback', 'Feedback']].map(function (t) { return '<a href="#/workshops/' + esc(id) + '" class="tab-link' + (S.tab === t[0] ? ' active' : '') + '" data-t="' + t[0] + '">' + t[1] + '</a>'; }).join('') + '</div>' : '';
      wd.innerHTML = head + (W.status === 'cancelled' ? '' : (!mine || !org ? invitee() : '')) + tabs + '<div id="wd-body"></div>'; ui.icons(); tab();
    }
    function tab() {
      var b = MT.$('#wd-body', host), org = canManage(W, p);
      if (S.tab === 'sessions' || !org) { b.innerHTML = '<div class="ws-sessions">' + (W.sessions || []).slice().sort(function (a, c) { return a.start < c.start ? -1 : 1; }).map(sessionCard).join('') + '</div>'; ui.icons(); return; }
      b.innerHTML = ui.skeleton(3, 'sk-line').s;
      Promise.all([scoped('workshopRsvps', W), scoped('workshopAttendance', W), scoped('workshopFeedback', W), inviteesFor(W)]).then(function (r) { if (dead) return; ({ people: peopleTab, attendance: attendTab, feedback: fbTab }[S.tab])(b, r[0], r[1], r[2], r[3]); ui.icons(); });
    }
    /** People I can see who match the audience (plus anyone who RSVP'd or checked in). */
    function inviteesFor(w) {
      var q = p.role === 'super_admin' ? MT.db.list('users', { limit: 3000 }) : MT.db.list('users', { where: [['ancestorOrgIds', 'array-contains', p.orgId]], limit: 3000 });
      return q.catch(function () { return []; }).then(function (users) {
        return users.filter(function (u) { return u.role !== 'super_admin' && (w.audience === 'all' || (w.audienceRoles || []).indexOf(u.role) > -1 || (u.orgId && (w.audienceOrgIds || []).indexOf(u.orgId) > -1) || (w.audienceUserIds || []).indexOf(u.userId) > -1); }).map(function (u) { return { userId: u.userId, name: u.name, role: u.role }; });
      });
    }
    function merge(inv, rs, at) { var m = {}; inv.forEach(function (u) { m[u.userId] = { userId: u.userId, name: u.name, role: u.role }; }); rs.concat(at).forEach(function (x) { if (!m[x.userId]) m[x.userId] = { userId: x.userId, name: x.name, role: x.role || '' }; }); return Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, c) { return (a.name || '') < (c.name || '') ? -1 : 1; }); }
    function peopleTab(b, rs, att, fb, inv) {
      var rmap = {}, all = merge(inv, rs, att), cnt = { yes: 0, maybe: 0, no: 0 };
      rs.forEach(function (x) { rmap[x.userId] = x.response; cnt[x.response] = (cnt[x.response] || 0) + 1; });
      b.innerHTML = '<div class="sum-row"><div class="sum sum-ok"><strong>' + cnt.yes + '</strong><span>yes</span></div><div class="sum sum-warn"><strong>' + cnt.maybe + '</strong><span>maybe</span></div><div class="sum"><strong>' + cnt.no + '</strong><span>no</span></div><div class="sum"><strong>' + (all.length - rs.length) + '</strong><span>no reply yet</span></div></div>' +
        '<div class="card"><div class="table-wrap"><table class="table"><thead><tr><th>Name</th><th>User ID</th><th>Role</th><th>RSVP</th></tr></thead><tbody>' + (all.length ? all.map(function (u) { return '<tr><td>' + esc(u.name) + '</td><td class="mono">' + esc(u.userId) + '</td><td>' + esc(MT.ROLE_LABEL[u.role] || u.role) + '</td><td>' + esc(rmap[u.userId] || '—') + '</td></tr>'; }).join('') : '<tr><td colspan="4" class="muted">No invitees visible to you yet. People you invited by user ID appear once they reply.</td></tr>') + '</tbody></table></div><p class="fine">You only see people beneath you. Individuals appear here once they RSVP or check in.</p></div>';
    }
    function attendTab(b, rs, att, fb, inv) {
      var sessions = (W.sessions || []).slice().sort(function (a, c) { return a.start < c.start ? -1 : 1; }), sid = S.sid || sessions[0].id, all = merge(inv, rs, att), amap = {};
      att.forEach(function (x) { if (x.sessionId === sid) amap[x.userId] = x.status; });
      b.innerHTML = '<div class="card"><div class="ws-toolbar"><label>Session <select id="a-sess">' + sessions.map(function (s, i) { return '<option value="' + esc(s.id) + '"' + (s.id === sid ? ' selected' : '') + '>#' + (i + 1) + ' · ' + esc(kit.when(s.start)) + '</option>'; }).join('') + '</select></label><button class="btn btn-soft btn-sm" id="a-all">Mark all present</button><button class="btn btn-primary btn-sm" id="a-save">Save attendance</button><button class="btn btn-ghost btn-sm" id="a-csv">Export CSV</button></div>' +
        '<div class="table-wrap"><table class="table"><thead><tr><th>Name</th><th>Role</th><th>Present</th><th>Absent</th></tr></thead><tbody>' + (all.length ? all.map(function (u) { var s = amap[u.userId]; return '<tr data-u="' + esc(u.userId) + '" data-n="' + esc(u.name) + '" data-r="' + esc(u.role) + '"><td>' + esc(u.name) + '<small class="muted"> ' + esc(u.userId) + '</small></td><td>' + esc(MT.ROLE_LABEL[u.role] || u.role) + '</td><td><input type="radio" name="p_' + esc(u.userId) + '" value="present"' + (s === 'present' ? ' checked' : '') + ' aria-label="Present: ' + esc(u.name) + '"></td><td><input type="radio" name="p_' + esc(u.userId) + '" value="absent"' + (s === 'absent' ? ' checked' : '') + ' aria-label="Absent: ' + esc(u.name) + '"></td></tr>'; }).join('') : '<tr><td colspan="4" class="muted">Nobody to mark yet.</td></tr>') + '</tbody></table></div>' +
        '<p class="fine" id="a-msg">' + Object.keys(amap).filter(function (k) { return amap[k] === 'present'; }).length + ' present · ' + Object.keys(amap).filter(function (k) { return amap[k] === 'absent'; }).length + ' absent. People can also check themselves in while the session is live.</p></div>';
      MT.$('#a-sess', b).addEventListener('change', function (e) { S.sid = e.target.value; attendTab(b, rs, att, fb, inv); ui.icons(); });
      MT.$('#a-all', b).addEventListener('click', function () { MT.$$('input[value=present]', b).forEach(function (r) { r.checked = true; }); });
      MT.$('#a-save', b).addEventListener('click', function () {
        var bt = this, batch = MT.db.batch(), n = 0; bt.disabled = true;
        MT.$$('tbody tr[data-u]', b).forEach(function (tr) { var c = tr.querySelector('input:checked'); if (!c) return; n++; batch.set('workshopAttendance', id + '_' + sid + '_' + tr.dataset.u, { workshopId: id, sessionId: sid, userId: tr.dataset.u, name: tr.dataset.n, role: tr.dataset.r, status: c.value, method: 'organiser', markedBy: p.userId, at: Date.now(), organiserId: W.organiserId, ancestorOrgIds: W.ancestorOrgIds || [] }); });
        if (!n) { bt.disabled = false; return ui.toast('Tick present or absent for at least one person.'); }
        batch.commit().then(function () { ui.success('Attendance saved for ' + n + ' people.'); tab(); }).catch(ui.error).then(function () { bt.disabled = false; });
      });
      MT.$('#a-csv', b).addEventListener('click', function () { var rows = [['Workshop', 'Session', 'Name', 'User ID', 'Role', 'Status']]; sessions.forEach(function (s, i) { var m = {}; att.forEach(function (x) { if (x.sessionId === s.id) m[x.userId] = x.status; }); all.forEach(function (u) { rows.push([W.title, '#' + (i + 1) + ' ' + s.start, u.name, u.userId, u.role, m[u.userId] || 'unmarked']); }); }); csv('attendance-' + id, rows); });
    }
    function fbTab(b, rs, att, fb) {
      var sessions = (W.sessions || []).slice().sort(function (a, c) { return a.start < c.start ? -1 : 1; });
      var avg = fb.length ? (fb.reduce(function (a, x) { return a + x.rating; }, 0) / fb.length) : 0, present = att.filter(function (x) { return x.status === 'present'; }).length;
      b.innerHTML = '<div class="sum-row"><div class="sum"><strong>' + (fb.length ? avg.toFixed(1) + ' ★' : '—') + '</strong><span>average rating</span></div><div class="sum"><strong>' + fb.length + '</strong><span>responses</span></div><div class="sum"><strong>' + present + '</strong><span>present records</span></div><div class="sum"><strong>' + (present ? Math.round(fb.length / present * 100) : 0) + '%</strong><span>response rate</span></div></div>' +
        '<div class="btn-row"><button class="btn btn-ghost btn-sm" id="f-csv">Export CSV</button></div>' +
        (fb.length ? '<div class="ws-fb">' + fb.slice().sort(function (a, c) { return c.at - a.at; }).map(function (x) { var si = sessions.map(function (s) { return s.id; }).indexOf(x.sessionId); return '<article class="card"><div class="ws-stars" aria-label="' + x.rating + ' out of 5">' + '★'.repeat(x.rating) + '<span class="muted">' + '★'.repeat(5 - x.rating) + '</span></div><p class="fine">' + esc(x.name) + ' · session ' + (si + 1) + '</p>' + (x.worked ? '<p><strong>What worked:</strong> ' + esc(x.worked) + '</p>' : '') + (x.improve ? '<p><strong>To improve:</strong> ' + esc(x.improve) + '</p>' : '') + (x.comment ? '<p>' + esc(x.comment) + '</p>' : '') + '</article>'; }).join('') + '</div>' : '<p class="muted">No feedback yet. Attendees are asked once a session has finished.</p>');
      var cb = MT.$('#f-csv', b); if (cb) cb.addEventListener('click', function () { csv('feedback-' + id, [['Session', 'Name', 'Rating', 'What worked', 'To improve', 'Comment']].concat(fb.map(function (x) { return [x.sessionId, x.name, x.rating, x.worked, x.improve, x.comment]; }))); });
    }
    function csv(name, rows) { MT.download(name + '.csv', '﻿' + rows.map(function (r) { return r.map(function (c) { c = String(c == null ? '' : c); return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(','); }).join('\r\n'), 'text/csv'); }

    host.addEventListener('click', function (e) {
      var t;
      if ((t = e.target.closest('[data-rsvp]'))) { var rec = { workshopId: id, userId: p.userId, name: shortName(p.name), role: p.role, orgId: p.orgId || '', response: t.dataset.rsvp, at: Date.now(), organiserId: W.organiserId, ancestorOrgIds: W.ancestorOrgIds || [] }; MT.db.set('workshopRsvps', id + '_' + p.userId, rec).then(function () { S.rsvp = rec; kit.refreshWorkshops(); ui.success('Thanks — your reply is saved.'); paint(); }).catch(ui.error); }
      else if (e.target.closest('#ics')) ics(W);
      else if ((t = e.target.closest('[data-checkin]'))) { var sid = t.dataset.checkin, a = { workshopId: id, sessionId: sid, userId: p.userId, name: shortName(p.name), role: p.role, status: 'present', method: 'self', markedBy: p.userId, at: Date.now(), organiserId: W.organiserId, ancestorOrgIds: W.ancestorOrgIds || [] }; MT.db.set('workshopAttendance', id + '_' + sid + '_' + p.userId, a).then(function () { S.att[sid] = a; ui.success('You are checked in. Enjoy the session!'); paint(); }).catch(ui.error); }
      else if ((t = e.target.closest('[data-fb]'))) feedback(t.dataset.fb);
      else if ((t = e.target.closest('[data-cert]'))) { t.disabled = true; MT.lazy.load('social').then(function () { return MT.certificates.workshop(W, p); }).catch(ui.error).then(function () { t.disabled = false; }); }
      else if ((t = e.target.closest('#wd-tabs [data-t]'))) { e.preventDefault(); S.tab = t.dataset.t; MT.$$('#wd-tabs .tab-link', host).forEach(function (x) { x.classList.toggle('active', x === t); }); tab(); }
      else if (e.target.closest('#w-edit')) { MT.db.get('workshops', id).then(function (w) { editWorkshop(w, function () { load().then(paint); }); }); }
      else if (e.target.closest('#w-dup')) { var c = Object.assign({}, W, { id: null, title: W.title + ' (copy)', sessions: W.sessions.map(function (s, i) { return { id: 's' + (i + 1), start: '', end: '', link: s.link, venue: s.venue }; }) }); editWorkshop(Object.assign(c, { id: undefined }), function (nid) { MT.router.go('/workshops/' + nid); }, true); }
      else if (e.target.closest('#w-cancel')) ui.confirm('Cancel this workshop?', 'Invitees will see it marked as cancelled.', 'Cancel workshop', true).then(function (ok) { if (ok) MT.db.update('workshops', id, { status: 'cancelled' }).then(function () { kit.refreshWorkshops(); return load(); }).then(paint).catch(ui.error); });
    });
    function feedback(sid) {
      kit.form({ title: 'How was the session?', submit: 'Send feedback', html: '<fieldset class="field field-wide ws-fs"><legend>Your rating</legend><div class="chips">' + [1, 2, 3, 4, 5].map(function (n) { return '<label class="chip"><input type="radio" name="rating" value="' + n + '"' + (n === 5 ? ' checked' : '') + '> ' + '★'.repeat(n) + '</label>'; }).join('') + '</div></fieldset>' +
        '<div class="field field-wide"><label for="fb-w">What worked well?</label><textarea id="fb-w" name="worked" rows="2" maxlength="300"></textarea></div><div class="field field-wide"><label for="fb-i">What could be better?</label><textarea id="fb-i" name="improve" rows="2" maxlength="300"></textarea></div><div class="field field-wide"><label for="fb-c">Anything else? (optional)</label><textarea id="fb-c" name="comment" rows="2" maxlength="300"></textarea></div>',
        onSubmit: function (v) { var rec = { workshopId: id, sessionId: sid, userId: p.userId, name: shortName(p.name), rating: parseInt(v.rating, 10) || 5, worked: v.worked || '', improve: v.improve || '', comment: v.comment || '', at: Date.now(), organiserId: W.organiserId, ancestorOrgIds: W.ancestorOrgIds || [] }; return MT.db.set('workshopFeedback', id + '_' + sid + '_' + p.userId, rec).then(function () { S.fb[sid] = rec; ui.success('Thank you for your feedback!'); paint(); }); } });
    }
    load().then(paint).catch(function (e) { wd.innerHTML = ui.empty({ icon: 'presentation', title: 'Workshop not available', text: MT.friendlyError(e) }).s; ui.icons(); });
    return function () { dead = true; };
  }

  MT.router.add('/workshops', { title: 'Workshops', layout: 'app', access: ROLES, render: listPage, after: listAfter });
  MT.router.add('/workshops/:id', { title: 'Workshop', layout: 'app', access: ROLES, render: detailPage, after: detailAfter });
})();
