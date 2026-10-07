/**
 * MyTree — Super Admin area. Phase 1: overview + approval queue + organisation list.
 * (The full command centre, reports and audit log arrive in phase 6.)
 */
(function () {
  'use strict';
  var MT = window.MT, h = MT.html, raw = MT.raw, ui = MT.ui, SA = ['super_admin'];

  function overview() {
    return Promise.all([MT.db.get('stats', 'global'), MT.auth.pendingOrgs()]).then(function (r) {
      var g = r[0] || {}, pend = r[1];
      return h`<div class="page">
        <section class="welcome card-hero" data-reveal><div><p class="eyebrow">Super Admin</p><h2>Command centre</h2><p>${pend.length ? pend.length + ' organisation' + (pend.length > 1 ? 's are' : ' is') + ' waiting for your approval.' : 'Everything is up to date. 🌳'}</p></div>
          <a class="btn btn-gold btn-lg" href="#/admin/approvals">${ui.icon('badge-check')} Review approvals</a></section>
        <section class="kpi-grid">
          ${ui.kpi('trees', 'Trees planted', g.trees || 0)}${ui.kpi('shield-check', 'Alive', g.treesAlive || 0)}${ui.kpi('users', 'Users', g.users || 0)}
          ${ui.kpi('school', 'Schools', g.orgs_school || 0)}${ui.kpi('graduation-cap', 'Institutions', g.orgs_institution || 0)}${ui.kpi('heart-handshake', 'Foundations', g.orgs_foundation || 0)}
        </section>
        <section class="card" data-reveal><div class="card-head"><h3>Waiting for approval</h3><a href="#/admin/approvals">See all</a></div>
          ${pend.length ? h`<ul class="plain-list">${pend.slice(0, 5).map(function (o) { return h`<li><strong>${o.name}</strong><small>${MT.ROLE_LABEL[o.type]} · ${o.city}, ${o.state} · ${MT.fmt.ago(o.createdAt)}</small></li>`; })}</ul>` : ui.empty({ title: 'No pending requests', text: 'New school, institution and foundation registrations will appear here.' })}</section>
        <p class="fine">More charts, maps and reports arrive in the next build phases.</p></div>`;
    });
  }

  function orgCard(o) {
    return h`<article class="org-card card" data-org="${o.id}">
      <div class="org-head">${o.logo ? h`<img class="org-logo" src="${o.logo}" alt="${o.name} logo">` : h`<span class="org-logo org-logo-ph">${ui.icon(o.type === 'school' ? 'school' : o.type === 'institution' ? 'graduation-cap' : 'heart-handshake')}</span>`}
        <div><h3>${o.name}</h3><p class="muted">${MT.ROLE_LABEL[o.type]} · <code>${o.id}</code></p></div>${ui.statusBadge(o.status)}</div>
      <dl class="kv kv-2"><dt>Registration no.</dt><dd>${o.regNo || '—'}</dd><dt>Location</dt><dd>${o.city}, ${o.state}</dd><dt>Contact</dt><dd>${o.contactName}</dd><dt>Phone</dt><dd>${o.phone}</dd><dt>E-mail</dt><dd>${o.email}</dd><dt>Address</dt><dd>${o.address || '—'}</dd><dt>Registered</dt><dd>${MT.fmt.dateTime(o.createdAt)}</dd></dl>
      <div class="btn-row">${o.status === 'pending' ? h`<button class="btn btn-primary" data-do="approve">${ui.icon('check')} Approve</button><button class="btn btn-danger-soft" data-do="reject">${ui.icon('x')} Reject</button>`
        : o.status === 'approved' ? h`<button class="btn btn-danger-soft" data-do="suspend">${ui.icon('pause')} Suspend</button>`
        : h`<button class="btn btn-primary" data-do="reactivate">${ui.icon('play')} ${o.status === 'rejected' ? 'Approve now' : 'Reactivate'}</button>`}</div></article>`;
  }

  function approvals(ctx) {
    var tab = ctx.query.tab || 'pending';
    return MT.auth.allOrgs().then(function (orgs) {
      var counts = { pending: 0, approved: 0, suspended: 0, rejected: 0 };
      orgs.forEach(function (o) { counts[o.status] = (counts[o.status] || 0) + 1; });
      var shown = orgs.filter(function (o) { return tab === 'all' || o.status === tab; });
      if (tab === 'pending') shown.sort(function (a, b) { return a.createdAt - b.createdAt; });
      var tabs = [['pending', 'Pending'], ['approved', 'Approved'], ['suspended', 'Suspended'], ['rejected', 'Rejected'], ['all', 'All']];
      return h`<div class="page"><div class="page-head"><h2>Organisation approvals</h2><p class="muted">Approve new registrations, or suspend and reactivate existing organisations. Suspending an organisation also pauses its students and sub-accounts.</p></div>
        <div class="tabs" role="tablist">${tabs.map(function (t) { return h`<a role="tab" aria-selected="${tab === t[0]}" class="tab-link ${tab === t[0] ? 'active' : ''}" href="#/admin/approvals?tab=${t[0]}">${t[1]}${t[0] !== 'all' && counts[t[0]] ? h` <span class="count-pill">${counts[t[0]]}</span>` : ''}</a>`; })}</div>
        <div class="search-row"><input type="search" id="org-q" placeholder="Search by name, city or ID…" aria-label="Search organisations"></div>
        <div class="org-grid" id="org-grid">${shown.length ? shown.map(orgCard) : ui.empty({ title: tab === 'pending' ? 'Nothing waiting' : 'Nothing here', text: 'There are no organisations in this list.' })}</div></div>`;
    });
  }

  function approvalsAfter(host, ctx) {
    var grid = MT.$('#org-grid', host);
    var q = MT.$('#org-q', host);
    q.addEventListener('input', MT.debounce(function () {
      var v = q.value.trim().toLowerCase();
      MT.$$('.org-card', grid).forEach(function (c) { c.hidden = v && c.textContent.toLowerCase().indexOf(v) < 0; });
    }, 120));
    grid.addEventListener('click', function (e) {
      var b = e.target.closest('[data-do]'); if (!b) return;
      var card = b.closest('.org-card'), id = card.getAttribute('data-org'), what = b.getAttribute('data-do');
      b.disabled = true;
      MT.db.get('orgs', id).then(function (org) {
        if (what === 'approve' || what === 'reactivate') return MT.auth[what === 'approve' ? 'approveOrg' : 'reactivateOrg'](org).then(function () { ui.confetti({ particleCount: 60 }); ui.success(org.name + ' is now active.'); });
        var reason = '';
        return ui.modal({
          title: (what === 'reject' ? 'Reject ' : 'Suspend ') + org.name + '?',
          body: raw('<p>' + (what === 'reject' ? 'The registrant will see your reason.' : 'Everyone in this organisation will be unable to sign in until it is reactivated.') + '</p><label class="field-label" for="why">Reason (optional)</label><textarea id="why" rows="3" class="textarea" maxlength="300"></textarea>'),
          actions: [{ label: 'Cancel', kind: 'ghost', value: false }, { label: what === 'reject' ? 'Reject' : 'Suspend', kind: 'danger', value: true, onClick: function (d) { reason = d.querySelector('#why').value; } }]
        }).then(function (ok) {
          if (!ok) return null;
          return MT.auth[what === 'reject' ? 'rejectOrg' : 'suspendOrg'](org, reason).then(function () { ui.success(org.name + (what === 'reject' ? ' was rejected.' : ' was suspended.')); });
        });
      }).then(function () { MT.shell.refreshBadges(); MT.router.refresh(); }).catch(ui.error).then(function () { b.disabled = false; });
    });
  }

  MT.router.add('/admin', { title: 'Command centre', layout: 'app', access: SA, render: overview });
  MT.router.add('/admin/approvals', { title: 'Approvals', layout: 'app', access: SA, render: approvals, after: approvalsAfter });
})();
