/**
 * MyTree — public landing page (#/): animated hero tree, live counters, forest map, how-it-works,
 * role cards, stories carousel, testimonials, FAQ.
 */
(function () {
  'use strict';
  var MT = window.MT, h = MT.html, raw = MT.raw, ui = MT.ui;

  /** Hero tree: trunk + branches draw themselves, leaves pop in (pure SVG/CSS so it works without any library). */
  function heroTree() {
    var r = MT.rng(7), leaves = '', shades = ['#2e9e5b', '#3ec27a', '#58c488', '#79d3a0', '#1f7f4a', '#a6e3bf'];
    var cx = 200, cy = 170;
    for (var i = 0; i < 62; i++) {
      var a = r() * Math.PI * 2, d = Math.sqrt(r()) * 118;
      var x = cx + Math.cos(a) * d * 1.15, y = cy + Math.sin(a) * d * 0.82, s = 15 + r() * 17;
      var delay = (1.6 + (1 - (y - 60) / 230) * 1.1 + r() * 0.5).toFixed(2);
      leaves += '<circle class="hl" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + s.toFixed(1) + '" fill="' + shades[Math.floor(r() * shades.length)] + '" style="--d:' + delay + 's"/>';
    }
    var fruits = '';
    for (var k = 0; k < 7; k++) { var fa = r() * 6.28, fd = 40 + r() * 70; fruits += '<circle class="hl" cx="' + (cx + Math.cos(fa) * fd * 1.1).toFixed(1) + '" cy="' + (cy + Math.sin(fa) * fd * 0.8).toFixed(1) + '" r="5" fill="#c9a227" style="--d:' + (3.1 + r() * 0.6).toFixed(2) + 's"/>'; }
    return '<svg class="hero-tree" viewBox="0 0 400 440" role="img" aria-label="A tree growing from a seedling into a full canopy">' +
      '<ellipse class="ground" cx="200" cy="410" rx="150" ry="20" fill="#0f3d2e" opacity=".22"/>' +
      '<path class="mound" d="M60 412 Q200 360 340 412 Z" fill="#5a3e2b"/><path class="mound2" d="M90 412 Q200 378 310 412 Z" fill="#7a553a"/>' +
      '<g class="trunk" fill="none" stroke="#8b5e3c" stroke-linecap="round" stroke-linejoin="round">' +
      '<path class="tp" style="--len:260;--d:0.2s" stroke-width="22" d="M200 400 C198 340 204 290 200 230"/>' +
      '<path class="tp" style="--len:140;--d:0.9s" stroke-width="12" d="M201 285 C170 260 150 230 132 196"/>' +
      '<path class="tp" style="--len:140;--d:1.0s" stroke-width="12" d="M200 262 C235 240 255 214 272 180"/>' +
      '<path class="tp" style="--len:90;--d:1.2s" stroke-width="8" d="M200 232 C196 205 200 180 206 150"/>' +
      '<path class="tp" style="--len:70;--d:1.3s" stroke-width="7" d="M150 220 C130 214 112 200 100 182"/>' +
      '<path class="tp" style="--len:70;--d:1.4s" stroke-width="7" d="M252 204 C270 198 288 186 298 168"/></g>' +
      '<g class="canopy">' + leaves + fruits + '</g></svg>';
  }
  function floatLeaves() {
    var r = MT.rng(11), out = '', cols = ['#2e9e5b', '#58c488', '#c9a227', '#3ec27a'];
    for (var i = 0; i < 14; i++) {
      var sz = 18 + r() * 30;
      out += '<svg class="leaf-float" data-speed="' + (0.25 + r() * 0.9).toFixed(2) + '" style="left:' + (r() * 96).toFixed(1) + '%;top:' + (r() * 92).toFixed(1) + '%;width:' + sz.toFixed(0) + 'px;--rot:' + Math.floor(r() * 360) + 'deg;--dur:' + (9 + r() * 9).toFixed(1) + 's;--delay:-' + (r() * 9).toFixed(1) + 's" viewBox="0 0 32 32" aria-hidden="true"><path d="M4 28C4 12 14 4 28 4c0 14-8 24-24 24z" fill="' + cols[i % 4] + '" opacity=".55"/><path d="M6 26C12 18 18 12 26 6" stroke="#fff" stroke-opacity=".5" fill="none"/></svg>';
    }
    return out;
  }

  var FAQ = [
    ['What is MyTree?', 'MyTree is a free portal where individuals, schools, institutions and foundations record every tree they plant — with its exact location, photos, growth updates and a QR code — so planting becomes caring, not just counting.'],
    ['How do students log in?', 'School or institution admins create student accounts. Each student gets a unique user ID (like MT-STU-SCH001-0012) and an easy password such as “Maple-River-4821”. No e-mail is needed. Admins can print a credentials sheet and re-issue a password at any time.'],
    ['Do you store photos of children?', 'Photos are compressed in the browser and stored privately with the tree record. Minors are never publicly identifiable by default — public pages and maps show only anonymised counts unless a school admin deliberately opts a tree in.'],
    ['How accurate are the CO₂ numbers?', 'They are clearly labelled estimates, calculated from species, age and documented growth factors — not measurements. Satellite green-cover comparisons are also labelled by method (photo-based, on-ground estimate, or satellite).'],
    ['Does it work on a phone with a poor connection?', 'Yes. MyTree is a mobile-first web app you can add to your home screen. Updates made offline are saved on the device and sync automatically when you are back online.'],
    ['Is it really free?', 'The portal itself runs on free-tier cloud services and can be hosted by any foundation at no software cost.']
  ];

  function section(id, cls, inner) { return '<section class="sec ' + cls + '" id="' + id + '"><div class="wrap">' + inner + '</div></section>'; }

  function load() {
    var cities = [], g = {};
    return Promise.all([
      MT.db.get('stats', 'global').catch(function () { return null; }),
      MT.db.list('stats', { where: [['kind', '==', 'city']] }).catch(function () { return []; })
    ]).then(function (r) {
      g = r[0] || {}; cities = r[1] || [];
      var today = Math.floor(Date.now() / 86400000);
      var treeYears = Math.max(0, ((g.treesAlive || 0) * today - (g.sumPlantedDayAlive || 0)) / 365.25);
      return { trees: g.trees || 0, schools: g.orgs_school || 0, foundations: g.orgs_foundation || 0, institutions: g.orgs_institution || 0, co2Kg: Math.round(treeYears * MT.species.AVG_CO2_PER_TREE_YEAR), cities: cities };
    });
  }

  function render() {
    return load().then(function (S) {
      var demo = MT.mode === 'demo';
      var t = MT.t;
      var roleCards = [
        ['individual', 'user-round', 'Individual', 'Plant for yourself, your family or in memory of someone.', ['Instant activation', 'Pin the exact spot on the map', 'QR code + shareable certificate']],
        ['school', 'school', 'School', 'Turn a plantation drive into a living classroom.', ['Add students in bulk with auto passwords', 'Post updates on their behalf', 'School vs school leaderboards']],
        ['institution', 'graduation-cap', 'Institution', 'Colleges, companies and clubs — track every campus tree.', ['Departments & clubs under one roof', 'Printable credentials & reports', 'Annual impact report PDF']],
        ['foundation', 'heart-handshake', 'Foundation', 'Run programmes across many schools and cities.', ['Create sub-foundations & school admins', 'Roll-up dashboards by region', 'Donor-ready impact reports']]
      ];
      var steps = [['user-plus', 'Sign up', 'Choose your role. Individuals start instantly; schools and foundations are verified.'], ['map-pin', 'Plant & pin', 'Pick the species, drop a pin on the map, add a photo. Your tree gets a unique ID and QR code.'], ['clipboard-check', 'Nurture & update', 'Post weekly, monthly or yearly growth updates. We remind you when one is due.'], ['trees', 'Watch it grow', 'See timelines, before/after photos, green-cover change and your impact on the map.']];
      var stories = [
        ['A school that planted 300 saplings in one monsoon', 'Every class adopted a row. Students log in with their own ID, post a photo each month and compete for the Green Guardian badge.'],
        ['A grandmother’s mango tree gets a QR code', 'A family planted a mango sapling in memory of their grandmother. Visitors scan its QR to read the dedication and see how it has grown.'],
        ['A foundation reports to donors in one click', 'With every school under one account, the foundation exports a branded impact report showing survival rate and CO₂ estimates.'],
        ['From bare plot to a green patch', 'Before-and-after photos and satellite swipe comparison show how a barren campus corner turned green over one year.']
      ];
      var quotes = [['“My Class 6 now checks their saplings before the bell rings.”', 'A teacher, sample story'], ['“I finally know which of our 40 trees need water.”', 'A foundation coordinator, sample story'], ['“Scanning the QR on Dadaji’s tree made the whole family smile.”', 'A parent, sample story']];

      return h`
      <section class="hero" id="top"><div class="hero-bg" aria-hidden="true">${raw(floatLeaves())}</div>
        <div class="wrap hero-grid">
          <div class="hero-copy">
            <p class="eyebrow"><span class="eyebrow-dot"></span>Maitree — friendship with nature</p>
            <h1 class="display">${t('hero.title')}</h1>
            <p class="lead">${t('hero.sub')}</p>
            <div class="hero-cta"><a class="btn btn-primary btn-lg" href="#/register">${t('hero.cta')} ${ui.icon('arrow-right')}</a><a class="btn btn-glass btn-lg" href="#/" data-scroll="forest">${t('hero.cta2')}</a></div>
            <p class="hero-note">${ui.icon('shield-check')} Free to start · Works on any phone · Kids’ data stays private</p>
          </div>
          <div class="hero-art">${raw(heroTree())}</div>
        </div>
        <a class="scroll-cue" href="#/" data-scroll="impact" aria-label="Scroll to see our impact">${ui.icon('chevrons-down')}</a>
      </section>

      <section class="impact" id="impact"><div class="wrap">
        <div class="stat-row">
          <div class="stat glass" data-reveal><strong class="stat-num" data-count="${S.trees}">0</strong><span>trees planted</span></div>
          <div class="stat glass" data-reveal data-reveal-delay="80"><strong class="stat-num" data-count="${S.schools + S.institutions}">0</strong><span>schools &amp; institutions</span></div>
          <div class="stat glass" data-reveal data-reveal-delay="160"><strong class="stat-num" data-count="${S.foundations}">0</strong><span>foundations</span></div>
          <div class="stat glass" data-reveal data-reveal-delay="240"><strong class="stat-num" data-count="${(S.co2Kg / 1000).toFixed(1)}" data-decimals="1" data-suffix=" t">0</strong><span>CO₂ offset <abbr title="Estimate from species, age and documented growth factors. Not a measurement.">(estimate)</abbr></span></div>
        </div>
        ${demo ? h`<p class="fine">Numbers shown are from the built-in sample data.</p>` : ''}
      </div></section>

      ${raw(section('forest', 'sec-forest', '<div class="forest-head" data-reveal><p class="eyebrow">The living forest</p><h2>Every dot is a tree someone is caring for</h2><p class="lead sm">Only anonymised city-level totals are public — never names or exact locations.</p></div><div class="forest-map-wrap" data-reveal><div id="forest-map" class="forest-map" role="img" aria-label="Map of India showing the number of trees planted in each city"></div><div class="forest-legend glass"><span class="pulse-dot"></span> Trees planted per city</div></div>'))}

      ${raw(section('how', 'sec-how', '<div class="sec-head" data-reveal><p class="eyebrow">How it works</p><h2>From sapling to story in four steps</h2></div><ol class="steps">' +
        steps.map(function (s, i) { return '<li class="step" data-reveal data-reveal-delay="' + i * 90 + '"><span class="step-n">' + (i + 1) + '</span><span class="step-ic"><i data-lucide="' + s[0] + '" class="ic"></i></span><h3>' + MT.esc(s[1]) + '</h3><p>' + MT.esc(s[2]) + '</p></li>'; }).join('') + '</ol>'))}

      ${raw(section('who', 'sec-who', '<div class="sec-head" data-reveal><p class="eyebrow">Who it’s for</p><h2>One platform, four ways to plant</h2></div><div class="role-grid">' +
        roleCards.map(function (c, i) {
          return '<article class="role-card card-lift" data-reveal data-reveal-delay="' + i * 80 + '"><span class="role-ic"><i data-lucide="' + c[1] + '" class="ic"></i></span><h3>' + c[2] + '</h3><p>' + MT.esc(c[3]) + '</p><ul>' + c[4].map(function (b) { return '<li>' + MT.esc(b) + '</li>'; }).join('') + '</ul><a class="btn btn-soft" href="#/register/' + c[0] + '">Join as ' + c[2].toLowerCase() + '</a></article>';
        }).join('') + '</div>'))}

      <section class="sec sec-stories" id="stories"><div class="wrap">
        <div class="sec-head row" data-reveal><div><p class="eyebrow">Impact stories</p><h2>What growing together looks like</h2><p class="fine">Illustrative stories to show what MyTree can do.</p></div>
          <div class="car-btns"><button type="button" class="icon-btn" data-car="-1" aria-label="Previous story">${ui.icon('chevron-left')}</button><button type="button" class="icon-btn" data-car="1" aria-label="Next story">${ui.icon('chevron-right')}</button></div></div>
        <div class="carousel" id="carousel" tabindex="0" aria-label="Impact stories" role="region">
          ${stories.map(function (s, i) { return h`<article class="story card-lift"><div class="story-art" style="--hue:${i * 24}">${ui.treeArt(['thriving', 'healthy', 'thriving', 'needs_care'][i], 120)}</div><h3>${s[0]}</h3><p>${s[1]}</p></article>`; })}
        </div></div></section>

      <section class="sec sec-quotes"><div class="wrap">
        <div class="quote-grid">${quotes.map(function (q, i) { return h`<figure class="quote" data-reveal data-reveal-delay="${i * 80}"><blockquote>${q[0]}</blockquote><figcaption>${q[1]}</figcaption></figure>`; })}</div>
        <p class="fine center">Sample quotes written for the demo — replace them with real testimonials from your community.</p></div></section>

      <section class="sec sec-faq" id="faq"><div class="wrap narrow">
        <div class="sec-head" data-reveal><p class="eyebrow">Questions</p><h2>Good to know</h2></div>
        <div class="faq">${FAQ.map(function (f) { return h`<details class="faq-item" data-reveal><summary>${f[0]}</summary><p>${f[1]}</p></details>`; })}</div>
      </div></section>

      <section class="cta-band"><div class="wrap cta-inner" data-reveal><h2>Ready to plant your first tree?</h2><p>It takes about two minutes to register and one minute to plant.</p><a class="btn btn-gold btn-lg" href="#/register">${t('common.register')} ${ui.icon('arrow-right')}</a></div></section>`;
    });
  }

  function forestMap(el, cities) {
    function fallback() {
      el.classList.add('map-fallback');
      el.innerHTML = '<ul class="city-list">' + cities.sort(function (a, b) { return b.trees - a.trees; }).map(function (c) { return '<li><strong>' + MT.esc(c.name) + '</strong><span>' + MT.fmt.num(c.trees) + ' trees</span></li>'; }).join('') + '</ul>';
    }
    if (!cities.length) { fallback(); return function () {}; }
    var map;
    MT.loader.load('leaflet').then(function () {
      if (!el.isConnected) return;
      map = L.map(el, { scrollWheelZoom: false, zoomControl: true, attributionControl: true }).setView([21.5, 79], 5);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap contributors' }).addTo(map);
      var max = Math.max.apply(null, cities.map(function (c) { return c.trees; })), pts = [];
      cities.forEach(function (c) {
        var size = Math.round(30 + 34 * Math.sqrt(c.trees / max));
        var icon = L.divIcon({ className: 'pm-wrap', iconSize: [size, size], html: '<span class="pm" style="--s:' + size + 'px"><b>' + MT.fmt.compact(c.trees) + '</b></span>' });
        L.marker([c.lat, c.lng], { icon: icon, keyboard: false, title: c.name + ': ' + c.trees + ' trees' }).addTo(map).bindTooltip(MT.esc(c.name) + ' · ' + MT.fmt.num(c.trees) + ' trees');
        pts.push([c.lat, c.lng]);
      });
      map.fitBounds(pts, { padding: [40, 40], maxZoom: 6 });
    }).catch(fallback);
    return function () { if (map) map.remove(); };
  }

  function after(host) {
    var cleanups = [];
    // Lazy-load the map only when it scrolls near the viewport.
    var mapEl = MT.$('#forest-map', host);
    MT.db.list('stats', { where: [['kind', '==', 'city']] }).catch(function () { return []; }).then(function (cities) {
      cities = cities.filter(function (c) { return c.trees > 0; });
      if (!mapEl) return;
      var started = false;
      function start() { if (started) return; started = true; cleanups.push(forestMap(mapEl, cities)); }
      if ('IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (en) { if (en[0].isIntersecting) { io.disconnect(); start(); } }, { rootMargin: '300px' });
        io.observe(mapEl); cleanups.push(function () { io.disconnect(); });
      } else start();
    });

    // Parallax leaves (GSAP + ScrollTrigger if reachable; CSS drift otherwise)
    if (!MT.prefersReducedMotion()) {
      MT.loader.loadSoft(['gsap', 'scrolltrigger']).then(function (ok) {
        if (!ok.gsap || !ok.scrolltrigger || !host.isConnected) return;
        gsap.registerPlugin(ScrollTrigger);
        MT.$$('.leaf-float', host).forEach(function (l) {
          gsap.to(l, { yPercent: -120 * parseFloat(l.dataset.speed), ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
        });
        gsap.from('.hero-copy > *', { y: 24, opacity: 0, duration: 0.8, stagger: 0.1, ease: 'power2.out' });
        cleanups.push(function () { ScrollTrigger.getAll().forEach(function (t) { t.kill(); }); });
      });
    }

    // Carousel
    var car = MT.$('#carousel', host), timer;
    function step(dir) {
      var w = car.firstElementChild ? car.firstElementChild.getBoundingClientRect().width + 20 : 300;
      var end = car.scrollLeft + car.clientWidth >= car.scrollWidth - 8;
      if (dir > 0 && end) car.scrollTo({ left: 0, behavior: 'smooth' });
      else if (dir < 0 && car.scrollLeft < 8) car.scrollTo({ left: car.scrollWidth, behavior: 'smooth' });
      else car.scrollBy({ left: dir * w, behavior: 'smooth' });
    }
    MT.$$('[data-car]', host).forEach(function (b) { b.addEventListener('click', function () { step(+b.dataset.car); }); });
    if (car && !MT.prefersReducedMotion()) {
      var play = function () { clearInterval(timer); timer = setInterval(function () { step(1); }, 6000); };
      var stop = function () { clearInterval(timer); };
      play(); car.addEventListener('pointerenter', stop); car.addEventListener('focusin', stop); car.addEventListener('pointerleave', play); car.addEventListener('focusout', play);
      cleanups.push(stop);
    }
    car && car.addEventListener('keydown', function (e) { if (e.key === 'ArrowRight') step(1); if (e.key === 'ArrowLeft') step(-1); });
    return function () { cleanups.forEach(function (f) { try { f(); } catch (e) { /* ignore */ } }); };
  }

  MT.router.add('/', { title: '', layout: 'public', access: 'public', render: render, after: after });
})();
