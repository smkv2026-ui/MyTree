/**
 * MyTree — Help centre (#/help): searchable, role-aware articles, FAQ, contact card and tour replay.
 */
(function () {
  'use strict';
  var MT = window.MT, h = MT.html, raw = MT.raw, ui = MT.ui, D = MT.helpData;

  function visible(a) { var r = MT.auth.role(); return !a.roles.length || (r && a.roles.indexOf(r) > -1); }
  function score(q, a) {
    q = q.toLowerCase().trim(); if (!q) return 1; var t = a.title.toLowerCase(), b = a.body.toLowerCase(), s = 0;
    q.split(/\s+/).forEach(function (w) { if (!w) return; if (t.indexOf(w) > -1) s += 10; if (b.indexOf(w) > -1) s += 3; else s -= 100; });
    return s;
  }

  function render() {
    var site = MT.site || {}, signed = !!MT.auth.role();
    return h`<div class="${signed ? 'page' : 'wrap narrow'} help-page" data-reveal>
      <div class="page-head">${signed ? h`<h2>Help centre</h2>` : h`<h1>Help centre</h1>`}<p class="muted">Guides for every role. Type to search.</p></div>
      <div class="search-wrap"><label class="sr-only" for="help-q">Search help</label><input id="help-q" type="search" placeholder="Search — e.g. password, update, QR, Excel" autocomplete="off"></div>
      <div id="help-topics" class="chips help-topics"></div>
      <div id="help-list" class="help-list" aria-live="polite"></div>
      <section class="card help-faq"><div class="card-head"><h2 class="as-h3">Quick answers</h2></div>${D.faq.map(function (f) { return h`<details><summary>${f[0]}</summary><p>${f[1]}</p></details>`; })}</section>
      <section class="card help-contact"><div class="card-head"><h2 class="as-h3">Still stuck?</h2></div><p>Write to <a href="mailto:${site.contactEmail}">${site.contactEmail}</a> or call ${site.contactPhone}. Please mention your user ID — never your password.</p>${signed ? h`<div class="btn-row"><button class="btn btn-soft" id="help-tour">${ui.icon('map')} Replay the welcome tour</button></div>` : ''}</section>
    </div>`;
  }

  function after(host, ctx) {
    var q = MT.$('#help-q', host), list = MT.$('#help-list', host), topics = MT.$('#help-topics', host), topic = ctx.query.topic || '';
    function paint() {
      var arts = D.articles.filter(visible).filter(function (a) { return !topic || a.topic === topic; }), term = q.value;
      var rows = arts.map(function (a) { return { a: a, s: score(term, a) }; }).filter(function (x) { return x.s > 0; }).sort(function (x, y) { return y.s - x.s; });
      topics.innerHTML = '<button class="chip' + (!topic ? ' on' : '') + '" data-t="">All</button>' + D.topics.map(function (t) { return '<button class="chip' + (topic === t.id ? ' on' : '') + '" data-t="' + t.id + '">' + MT.esc(t.title) + '</button>'; }).join('');
      list.innerHTML = rows.length ? rows.map(function (x, i) { return '<details class="card help-art" id="a-' + x.a.id + '"' + ((term && i < 2) || ctx.query.a === x.a.id ? ' open' : '') + '><summary><strong>' + MT.esc(x.a.title) + '</strong></summary><p>' + MT.esc(x.a.body) + '</p></details>'; }).join('')
        : ui.empty({ title: 'Nothing found', text: 'Try a different word, or write to us below.' }).s;
    }
    q.addEventListener('input', paint); topics.addEventListener('click', function (e) { var b = e.target.closest('[data-t]'); if (b) { topic = b.dataset.t; paint(); } });
    var tb = MT.$('#help-tour', host); if (tb) tb.addEventListener('click', function () { MT.router.go('/dashboard'); setTimeout(function () { MT.tour.start(true); }, 600); });
    paint(); if (ctx.query.a) { var el = MT.$('#a-' + ctx.query.a, host); if (el) el.scrollIntoView(); }
    ui.icons();
  }

  MT.router.add('/help', { title: 'Help centre', layout: 'app', access: 'public', render: render, after: after });

  if (MT.palette) D.articles.slice(0, 40).forEach(function (a) { MT.palette.register({ title: 'Help: ' + a.title, hint: 'Help', icon: 'life-buoy', keywords: a.body.slice(0, 80), run: function () { MT.router.go('/help?a=' + a.id); } }); });
})();
