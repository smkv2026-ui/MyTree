/**
 * MyTree — gamification: badges (First Tree, Ten Trees, Green Guardian, Year Keeper, …), update streaks, school-vs-school and in-school
 * leaderboards, admin-set class challenges with progress rings. Route: #/leaderboard?tab=schools|students|challenges|badges (also #/badges).
 */
(function () {
  'use strict';
  var MT = window.MT, h = MT.html, raw = MT.raw, ui = MT.ui, DAY = 86400000;
  var ALL = ['foundation', 'school', 'institution', 'student', 'individual'];

  var BADGES = [
    { id: 'first_tree', title: 'First Tree', icon: 'sprout', desc: 'Plant your first tree.', test: function (m) { return m.trees >= 1; }, prog: function (m) { return [m.trees, 1]; } },
    { id: 'ten_trees', title: 'Ten Trees', icon: 'trees', desc: 'Plant 10 trees.', test: function (m) { return m.trees >= 10; }, prog: function (m) { return [m.trees, 10]; } },
    { id: 'green_guardian', title: 'Green Guardian', icon: 'shield-check', desc: 'Look after at least 25 trees and keep 90% of them alive.', test: function (m) { return m.trees >= 25 && m.alive / m.trees >= 0.9; }, prog: function (m) { return [m.trees, 25]; } },
    { id: 'year_keeper', title: 'Year Keeper', icon: 'calendar-check', desc: 'Keep a tree alive for a whole year with at least 6 updates.', test: function (m) { return m.yearKeeper; }, prog: function (m) { return [m.yearKeeper ? 1 : 0, 1]; } },
    { id: 'steady_hands', title: 'Steady Hands', icon: 'flame', desc: 'Post growth updates 4 weeks in a row.', test: function (m) { return m.streak >= 4; }, prog: function (m) { return [m.streak, 4]; } },
    { id: 'forest_maker', title: 'Forest Maker', icon: 'mountain', desc: 'Plant 100 trees.', test: function (m) { return m.trees >= 100; }, prog: function (m) { return [m.trees, 100]; } }
  ];

  /** Monday (UTC) of the week containing `d`, as yyyy-mm-dd. */
  function weekKey(d) { var x = new Date(d + 'T12:00:00Z'), day = (x.getUTCDay() + 6) % 7; x.setUTCDate(x.getUTCDate() - day); return x.toISOString().slice(0, 10); }
  function streakOf(dates) {
    var set = {}; dates.forEach(function (d) { set[weekKey(d)] = 1; });
    var cur = weekKey(MT.fmt.iso(new Date())), n = 0, t = new Date(cur + 'T12:00:00Z');
    if (!set[cur]) t.setUTCDate(t.getUTCDate() - 7); // this week not done yet: the streak is still alive if last week was
    while (set[t.toISOString().slice(0, 10)]) { n++; t.setUTCDate(t.getUTCDate() - 7); }
    return n;
  }

  var G = (MT.gamify = {
    BADGES: BADGES,
    /** Metrics for the signed-in user: trees, alive, yearKeeper, streak. */
    metrics: function () {
      var p = MT.auth.profile();
      return Promise.all([MT.db.list('trees', { where: [['ownerId', '==', p.userId]], limit: 1500 }), MT.db.list('treeUpdates', { where: [['ownerId', '==', p.userId]], limit: 800 }).catch(function () { return []; })]).then(function (r) {
        var trees = r[0], alive = trees.filter(function (t) { return t.status !== 'dead'; });
        return { trees: trees.length, alive: alive.length, yearKeeper: alive.some(function (t) { return MT.trees.ageYears(t) >= 1 && (t.updatesCount || 0) >= 6; }), streak: streakOf(r[1].filter(function (u) { return u.postedBy === p.userId; }).map(function (u) { return u.date; })), updates: r[1].length };
      });
    },
    /** Quietly evaluate after sign-in / planting; celebrate any newly earned badge once. */
    celebrate: function () {
      G.evaluate().then(function (r) { (r.fresh || []).forEach(function (f, i) { setTimeout(function () { ui.success('New badge: ' + f.badge.title + '!'); if (ui.confetti) ui.confetti(); }, i * 1800); }); }).catch(function () {});
    },
    /** Evaluate, persist newly earned badges, and resolve {metrics, earned:[{badge, earnedAt, isNew}], todo:[…]}. */
    evaluate: function () {
      var p = MT.auth.profile();
      return Promise.all([G.metrics(), MT.db.list('userBadges', { where: [['userId', '==', p.userId]], limit: 50 }).catch(function () { return []; })]).then(function (r) {
        var m = r[0], have = {}; r[1].forEach(function (b) { have[b.badgeId] = b; });
        var earned = [], todo = [], fresh = [], b = MT.db.batch();
        BADGES.forEach(function (bd) {
          if (have[bd.id]) earned.push({ badge: bd, earnedAt: have[bd.id].earnedAt });
          else if (bd.test(m)) { var e = { badge: bd, earnedAt: Date.now(), isNew: true }; earned.push(e); fresh.push(e); b.set('userBadges', p.userId + '_' + bd.id, { userId: p.userId, badgeId: bd.id, earnedAt: e.earnedAt, orgId: p.orgId || '', ancestorOrgIds: p.ancestorOrgIds || [] }); }
          else todo.push({ badge: bd, p: bd.prog(m) });
        });
        if (!fresh.length) return { metrics: m, earned: earned, todo: todo };
        return b.commit().then(function () { return { metrics: m, earned: earned, todo: todo, fresh: fresh }; }, function () { return { metrics: m, earned: earned, todo: todo }; });
      });
    }
  });

  function ringSvg(pct, label) { return MT.ui.ring(pct, label, '', 96).s; }

  /* =============== page =============== */
  function render(ctx) {
    var tab = ctx.query.tab || (ctx.path === '/badges' ? 'badges' : 'schools'), tabs = [['schools', 'Schools'], ['students', 'In my school'], ['challenges', 'Challenges'], ['badges', 'My badges']];
    return h`<div class="page lb-page" data-reveal><div class="page-head"><h2>Leaderboard &amp; badges</h2><p class="muted">Friendly competition: who has planted the most, kept the most trees alive, and earned which badges.</p></div>
      <div class="tabs" role="tablist">${tabs.map(function (t) { return h`<a role="tab" aria-selected="${tab === t[0]}" class="tab-link ${tab === t[0] ? 'active' : ''}" href="#/leaderboard?tab=${t[0]}">${t[1]}</a>`; })}</div><div id="lb-body">${ui.skeleton(4, 'sk-line')}</div></div>`;
  }
  function after(host, ctx) {
    var tab = ctx.query.tab || (ctx.path === '/badges' ? 'badges' : 'schools'), body = MT.$('#lb-body', host), p = MT.auth.profile(), destroyed = false;
    function rankRows(rows, name, meId) {
      rows = rows.slice().sort(function (a, b) { return (b.treesAlive || 0) - (a.treesAlive || 0) || (b.trees ? b.treesAlive / b.trees : 0) - (a.trees ? a.treesAlive / a.trees : 0); });
      var max = Math.max.apply(null, rows.map(function (r) { return r.treesAlive || 0; }).concat([1]));
      return '<ol class="lb-list">' + rows.slice(0, 25).map(function (r, i) { var me = r.id === meId; return '<li class="lb-row' + (me ? ' me' : '') + '"><span class="lb-rank r' + (i < 3 ? i + 1 : '') + '">' + (i + 1) + '</span><div class="lb-main"><strong>' + MT.esc(name(r)) + (me ? ' <span class="badge badge-info">you</span>' : '') + '</strong><div class="progress"><span style="width:' + Math.round((r.treesAlive || 0) / max * 100) + '%"></span></div></div><div class="lb-num"><strong>' + MT.fmt.num(r.treesAlive || 0) + '</strong><small>alive' + (r.trees ? ' · ' + Math.round((r.treesAlive || 0) / r.trees * 100) + '% survive' : '') + '</small></div></li>'; }).join('') + '</ol>';
    }
    function schools() {
      MT.db.list('stats', { where: [['kind', '==', 'org']] }).then(function (rows) {
        if (destroyed) return; rows = rows.filter(function (r) { return (r.type === 'school' || r.type === 'institution') && (r.trees || 0) > 0; });
        body.innerHTML = rows.length ? '<div class="card">' + rankRows(rows, function (r) { return r.name || r.id.replace('org_', ''); }, p.orgId ? 'org_' + p.orgId : '') + '</div><p class="fine">Ranked by live trees. Only organisation names and totals are shown — never students.</p>' : ui.empty({ title: 'No schools on the board yet', text: 'Schools appear after their first tree is planted.' }).s;
      }).catch(fail);
    }
    function students() {
      if (!p.orgId) { body.innerHTML = ui.empty({ title: 'Class leaderboards are for schools and institutions', text: 'Ask your school to add you, or see the Schools tab.' }).s; return; }
      MT.db.list('stats', { where: [['kind', '==', 'user'], ['orgId', '==', p.orgId]], limit: 300 }).then(function (rows) {
        if (destroyed) return; rows = rows.filter(function (r) { return (r.trees || 0) > 0; });
        body.innerHTML = rows.length ? '<div class="card">' + rankRows(rows, function (r) { return r.label || 'Member'; }, 'user_' + p.userId) + '</div><p class="fine">Names are shortened (first name and last initial) for privacy.</p>' : ui.empty({ title: 'Nobody has planted yet', text: 'Be the first!', action: { label: 'Plant a tree', href: '#/plant' } }).s;
      }).catch(fail);
    }
    function challenges() {
      var q = p.role === 'super_admin' ? { limit: 50 } : { where: [['ancestorOrgIds', 'array-contains', p.orgId || '_']], limit: 50 };
      MT.db.list('challenges', q).then(function (list) {
        if (destroyed) return; var now = MT.fmt.iso(new Date()); list.sort(function (a, b) { return a.to < b.to ? 1 : -1; });
        return Promise.all(list.map(function (c) { return progress(c); })).then(function (counts) {
          body.innerHTML = (MT.auth.isOrgAdmin() ? '<div class="btn-row"><button class="btn btn-primary" id="ch-new">' + ui.icon('flag').s + ' New challenge</button></div>' : '') +
            (list.length ? '<div class="org-grid">' + list.map(function (c, i) { var n = counts[i].all, mine = counts[i].mine, pct = Math.min(100, Math.round(n / c.target * 100)), live = c.from <= now && c.to >= now; return '<article class="card"><div class="org-head"><div><h3>' + MT.esc(c.title) + '</h3><p class="muted">' + MT.esc(c.metric === 'trees' ? 'Trees planted' : 'Growth updates') + ' · ' + MT.fmt.date(c.from) + ' – ' + MT.fmt.date(c.to) + '</p></div><span class="badge ' + (live ? 'badge-ok' : '') + '">' + (live ? 'Live' : c.to < now ? 'Ended' : 'Soon') + '</span></div><div class="two-rings">' + ui.ring(pct, pct + '%', '', 110).s + '<ul class="plain-list"><li><strong>' + MT.fmt.num(n) + ' / ' + MT.fmt.num(c.target) + '</strong><small>together</small></li>' + (mine != null ? '<li><strong>' + mine + '</strong><small>your share</small></li>' : '') + '</ul></div>' + (MT.auth.isOrgAdmin() ? '<button class="btn btn-danger-soft btn-sm" data-del="' + MT.esc(c.id) + '">Delete</button>' : '') + '</article>'; }).join('') + '</div>' : ui.empty({ title: 'No challenges yet', text: MT.auth.isOrgAdmin() ? 'Create one: for example “Plant 100 trees in July”.' : 'Your teacher can set a class challenge.' }).s);
          ui.icons(); var nb = MT.$('#ch-new', body); if (nb) nb.addEventListener('click', newChallenge);
          body.addEventListener('click', function (e) { var d = e.target.closest('[data-del]'); if (d) ui.confirm('Delete this challenge?', '', 'Delete', true).then(function (ok) { if (ok) MT.db.delete('challenges', d.dataset.del).then(challenges).catch(ui.error); }); });
        });
      }).catch(fail);
    }
    function progress(c) {
      var scope = [['ancestorOrgIds', 'array-contains', c.orgId]];
      var q = c.metric === 'trees' ? MT.db.list('trees', { where: scope.concat([['plantedOn', '>=', c.from], ['plantedOn', '<=', c.to]]), limit: 3000 }) : MT.db.list('treeUpdates', { where: scope.concat([['date', '>=', c.from], ['date', '<=', c.to]]), limit: 3000 });
      return q.then(function (rows) { var mine = rows.filter(function (r) { return r.ownerId === p.userId; }).length; return { all: rows.length, mine: p.orgId ? mine : null }; }).catch(function () { return { all: 0, mine: null }; });
    }
    function newChallenge() {
      var b = document.createElement('div'), today = MT.fmt.iso(new Date()), end = MT.fmt.iso(new Date(Date.now() + 30 * DAY));
      b.innerHTML = '<form class="form" novalidate><div class="form-grid">' + ui.field({ id: 'title', label: 'Title', required: true, wide: true, attrs: 'maxlength="80"', placeholder: 'Plant 100 trees this month' }).s + ui.field({ id: 'metric', label: 'Counts', type: 'select', options: [{ value: 'trees', label: 'Trees planted' }, { value: 'updates', label: 'Growth updates' }] }).s + ui.field({ id: 'target', label: 'Goal', type: 'number', required: true, value: 100, attrs: 'min="1" max="100000"' }).s + ui.field({ id: 'from', label: 'From', type: 'date', value: today, required: true }).s + ui.field({ id: 'to', label: 'To', type: 'date', value: end, required: true }).s + '</div><p class="field-msg" id="ch-err" role="alert"></p><div class="modal-foot inline"><button type="button" class="btn btn-ghost" data-cancel>Cancel</button><button type="submit" class="btn btn-primary">Create</button></div></form>';
      var dlg, form = b.querySelector('form'); b.addEventListener('click', function (e) { if (e.target.closest('[data-cancel]')) dlg.close(); });
      form.addEventListener('submit', function (e) { e.preventDefault(); var v = {}; [].forEach.call(form.elements, function (el) { if (el.name) v[el.name] = String(el.value).trim(); }); var err = b.querySelector('#ch-err');
        if (!v.title) { err.textContent = 'Please give the challenge a title.'; return; } if (v.to < v.from) { err.textContent = 'The end date must be after the start date.'; return; } if (!(+v.target > 0)) { err.textContent = 'The goal must be a positive number.'; return; }
        MT.db.set('challenges', MT.uid('c'), { orgId: p.orgId, ancestorOrgIds: p.ancestorOrgIds, title: v.title.slice(0, 80), metric: v.metric, target: Math.round(+v.target), from: v.from, to: v.to, createdBy: p.userId, createdAt: Date.now() }).then(function () { dlg.close(); ui.success('Challenge created.'); challenges(); }).catch(function (er) { err.textContent = MT.friendlyError(er); }); });
      ui.modal({ title: 'New class challenge', body: b, actions: [], onOpen: function (d) { dlg = d; } });
    }
    function badges() {
      G.evaluate().then(function (r) {
        if (destroyed) return; var m = r.metrics;
        body.innerHTML = '<div class="sum-row"><div class="sum"><strong>' + m.trees + '</strong><span>trees planted</span></div><div class="sum sum-ok"><strong>' + m.alive + '</strong><span>alive</span></div><div class="sum sum-warn"><strong>' + m.streak + '</strong><span>week update streak 🔥</span></div><div class="sum"><strong>' + r.earned.length + '/' + BADGES.length + '</strong><span>badges</span></div></div>' +
          '<div class="badge-grid">' + r.earned.map(function (e) { return '<article class="bdg earned' + (e.isNew ? ' new' : '') + '"><span class="bdg-ic">' + ui.icon(e.badge.icon).s + '</span><h3>' + MT.esc(e.badge.title) + '</h3><p>' + MT.esc(e.badge.desc) + '</p><small>Earned ' + MT.fmt.date(e.earnedAt) + '</small><button class="btn btn-soft btn-sm" data-cert="' + MT.esc(e.badge.id) + '">Certificate</button></article>'; }).join('') +
          r.todo.map(function (t) { var pc = Math.min(100, Math.round(t.p[0] / t.p[1] * 100)); return '<article class="bdg locked"><span class="bdg-ic">' + ui.icon(t.badge.icon).s + '</span><h3>' + MT.esc(t.badge.title) + '</h3><p>' + MT.esc(t.badge.desc) + '</p><div class="progress"><span style="width:' + pc + '%"></span></div><small>' + Math.min(t.p[0], t.p[1]) + ' / ' + t.p[1] + '</small></article>'; }).join('') + '</div>'; ui.icons();
        if (r.fresh && r.fresh.length) { ui.confetti(); ui.success('New badge' + (r.fresh.length > 1 ? 's' : '') + ': ' + r.fresh.map(function (f) { return f.badge.title; }).join(', ') + '! 🏅', { duration: 6000 }); }
        body.addEventListener('click', function (e) { var c = e.target.closest('[data-cert]'); if (c) { var e2 = r.earned.filter(function (x) { return x.badge.id === c.dataset.cert; })[0]; MT.certificates.milestone(e2.badge, e2.earnedAt, r.metrics).catch(ui.error); } });
      }).catch(fail);
    }
    function fail(e) { body.innerHTML = ui.empty({ title: 'Could not load', text: MT.friendlyError(e) }).s; }
    ({ schools: schools, students: students, challenges: challenges, badges: badges }[tab] || schools)();
    return function () { destroyed = true; };
  }

  MT.router.add('/leaderboard', { title: 'Leaderboard', layout: 'app', access: ALL, render: render, after: after });
  MT.router.add('/badges', { title: 'My badges', layout: 'app', access: ALL, render: render, after: after });
})();
