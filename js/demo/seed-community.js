/**
 * MyTree — demo data for the community features: sellers' payment profiles and listings, orders in every status, workshops (past and upcoming, for every kind of
 * audience) with RSVPs, attendance and feedback, and bird stations with care logs and sightings. Registered through MT.seed.extend; deterministic.
 */
(function () {
  'use strict';
  var MT = window.MT, DAY = 86400000, HOUR = 3600000;

  function local(ms) { var d = new Date(ms), p = function (n) { return String(n).padStart(2, '0'); }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()); }
  function at(daysFromNow, hour, mins) { var d = new Date(Date.now() + daysFromNow * DAY); d.setHours(hour, mins || 0, 0, 0); return d.getTime(); }

  MT.seed.extend.push(function (db, ctx) {
    var users = ctx.users, orgs = ctx.orgs, rnd = ctx.rnd, now = ctx.now;
    var byOrg = function (name) { return orgs.filter(function (o) { return o.name === name; })[0]; };
    var user = function (id) { return users.filter(function (u) { return u.userId === id; })[0]; };
    var short = function (n) { return MT.stats && MT.stats.shortName ? MT.stats.shortName(n) : n; };

    /* ---------- sellers, payment details, listings ---------- */
    var S = [byOrg('Green Roots Nursery'), byOrg('Hariyali Saplings'), byOrg('Nature Nest Shop')], profiles = [], listings = [], L = {};
    var PAY = [{ upi: 'greenroots@okaxis', accountName: 'Green Roots Nursery', accountNo: '918020045671234', ifsc: 'UTIB0001234', bank: 'Axis Bank', payNote: 'Pickup from Hadapsar, Pune (9am–6pm). Delivery within Pune for orders above ₹500.' },
      { upi: 'hariyali@ybl', accountName: 'Hariyali Saplings', accountNo: '50100234567890', ifsc: 'HDFC0000321', bank: 'HDFC Bank', payNote: 'Nagpur pickup or courier across Vidarbha.' },
      { upi: 'naturenest@oksbi', accountName: 'Nature Nest Shop', accountNo: '3012345678901', ifsc: 'SBIN0004567', bank: 'State Bank of India', payNote: 'Handmade nest boxes. Delivery in Mumbai & Thane.' }];
    S.forEach(function (o, i) { profiles.push(Object.assign({ id: o.id, name: o.name, city: o.city, state: o.state, phone: o.phone, active: true, updatedAt: now - 20 * DAY }, PAY[i])); });
    function add(key, si, cat, title, price, stock, extra) { var o = S[si], l = Object.assign({ id: 'l_' + key, sellerId: o.id, sellerName: o.name, city: o.city, state: o.state, category: cat, title: title, description: '', price: price, stock: stock, photo: '', active: true, createdAt: now - (30 - listings.length) * DAY, updatedAt: now - 5 * DAY }, extra || {}); listings.push(l); L[key] = l; }
    add('neem', 0, 'sapling', 'Neem sapling · 2 ft · polybag', 45, 120, { speciesId: 'neem', description: 'Hardy, shade-giving native. Healthy roots, hardened off.' });
    add('mango', 0, 'sapling', 'Mango (Alphonso graft) · 3 ft', 220, 40, { speciesId: 'mango', description: 'Grafted for fruit in 3–4 years.' });
    add('jamun', 0, 'sapling', 'Jamun sapling · 2.5 ft', 90, 60, { speciesId: 'jamun', description: 'Native fruit tree loved by birds.' });
    add('gulmohar', 0, 'sapling', 'Gulmohar sapling · 3 ft', 70, 8, { speciesId: 'gulmohar', description: 'Fast-growing, flaming red summer flowers.' });
    add('arjun', 1, 'sapling', 'Arjun sapling · 2 ft', 80, 75, { speciesId: 'arjun', description: 'Medicinal native, ideal near water.' });
    add('teak', 1, 'sapling', 'Teak sapling · 2 ft', 60, 200, { speciesId: 'teak', description: 'Timber tree for farm boundaries.' });
    add('tamarind', 1, 'sapling', 'Tamarind sapling · 2 ft', 110, 0, { speciesId: 'tamarind', description: 'Slow, long-lived. (Currently sold out.)' });
    add('banyan', 1, 'sapling', 'Banyan sapling · 2 ft', 150, 25, { speciesId: 'banyan', description: 'For big open spaces — needs room.' });
    add('nest', 2, 'bird', 'Wooden nest box · sparrow size', 350, 30, { birdKind: 'Nest box', description: 'Untreated teak, 32 mm entrance, easy-clean roof.' });
    add('feeder', 2, 'bird', 'Hanging bird feeder (seed)', 280, 45, { birdKind: 'Bird feeder', description: 'Rain-proof clay-and-cane feeder with 4 perches.' });
    add('water', 2, 'bird', 'Clay bird water bowl · wide & shallow', 120, 80, { birdKind: 'Bird water bowl', description: 'Hang or place in shade. Easy to scrub.' });
    add('mix', 2, 'bird', 'Wild bird seed mix · 1 kg', 130, 100, { birdKind: 'Bird feed (seed mix)', description: 'Millet, sunflower, broken rice. No salt.' });
    db._bulk('sellerProfiles', profiles); db._bulk('listings', listings);

    /* ---------- orders ---------- */
    var ind = user('MT-IND-000001'), school = byOrg('Satsang Vidyalaya'), schoolAdmin = user(school.id), kendra = byOrg('TSF Pune Kendra'), kendraAdmin = user(kendra.id), found = byOrg('The Satsang Foundation'), foundAdmin = user(found.id);
    var orders = [];
    function order(buyer, key, qty, status, o) {
      var l = L[key], k = orders.length + 1;
      orders.push(Object.assign({ id: 'o_demo' + k, buyerId: buyer.userId, buyerName: buyer.name, buyerRole: buyer.role, buyerOrgId: buyer.orgId || '', buyerAncestorOrgIds: buyer.ancestorOrgIds || [], sellerId: l.sellerId, sellerName: l.sellerName,
        items: [{ listingId: l.id, title: l.title, qty: qty, price: l.price, speciesId: l.speciesId || '', category: l.category }], total: l.price * qty, delivery: k % 2 ? 'pickup' : 'delivery', address: k % 2 ? '' : '12, Garden Road, ' + (buyer.city || 'Pune'), phone: buyer.phone || '+91 98765 43210', note: '', status: status, payRef: '', sellerNote: '', plantedQty: {}, createdAt: now - (12 - k) * DAY, updatedAt: now - (11 - k) * DAY }, o || {}));
    }
    order(ind, 'neem', 4, 'delivered', { payRef: 'UPI 4123987651', plantedQty: { 0: 2 } });           // 2 of 4 planted — "Plant this (2 left)"
    order(ind, 'jamun', 2, 'confirmed', { payRef: 'UPI 4123995512' });                                // paid & confirmed, awaiting delivery
    order(ind, 'gulmohar', 1, 'paid_claimed', { payRef: 'UPI 4124002290' });                           // waiting for the seller to confirm
    order(ind, 'feeder', 1, 'placed');                                                                 // waiting for payment
    order(ind, 'mango', 1, 'cancelled');
    order(schoolAdmin, 'teak', 25, 'delivered', { payRef: 'NEFT 889120034', plantedQty: {} });          // a school buys 25 saplings for a plantation drive
    order(schoolAdmin, 'nest', 6, 'confirmed', { payRef: 'UPI 4124100031' });
    order(kendraAdmin, 'arjun', 10, 'paid_claimed', { payRef: 'UPI 4124111902' });
    order(foundAdmin, 'banyan', 5, 'rejected', { sellerNote: 'Out of stock this month, sorry.' });
    order(user('MT-IND-000002') || ind, 'water', 3, 'delivered', { payRef: 'UPI 4123774412' });
    db._bulk('orders', orders);

    /* ---------- workshops ---------- */
    var tsfMy = byOrg('TSF MyTree'), kendras = orgs.filter(function (o) { return /^TSF .* Kendra$/.test(o.name); });
    function beneath(o) { return orgs.filter(function (x) { return (x.ancestorOrgIds || []).indexOf(o.id) > -1; }).map(function (x) { return x.id; }); }
    var admin = user('MT-ADM-000001'), W = [], R = [], A = [], F = [];
    function ws(id, organiser, title, desc, mode, aud, sessions, extra) { var o = organiser; W.push(Object.assign({ id: id, title: title, description: desc, mode: mode, capacity: 0, organiserId: o.userId, organiserName: o.name, orgId: o.orgId || '', ancestorOrgIds: o.ancestorOrgIds || [], audience: 'custom', audienceRoles: [], audienceOrgIds: [], audienceUserIds: [], audienceLabel: '', pickedOrgs: [], sessions: sessions, certificate: true, status: 'scheduled', createdAt: now - 25 * DAY }, aud, extra || {})); }
    ws('w_demo1', admin, 'MyTree orientation for everyone', 'A 45-minute tour of planting, growth updates, badges and the shop. Great for new members.', 'online', { audience: 'all', audienceLabel: 'Everyone' },
      [{ id: 's1', start: local(at(-14, 17)), end: local(at(-14, 17, 45)), link: 'https://meet.google.com/mty-orient-001', venue: '' }, { id: 's2', start: local(at(4, 17)), end: local(at(4, 17, 45)), link: 'https://meet.google.com/mty-orient-002', venue: '' }]);
    ws('w_demo2', foundAdmin, 'Composting & tree care for Kendra volunteers', 'Hands-on: mulching, watering schedules, spotting pests early. Open to all TSF Kendras and schools beneath TSF MyTree.', 'hybrid', { audienceLabel: 'TSF MyTree (+ beneath)', audienceOrgIds: [tsfMy.id].concat(beneath(tsfMy)), pickedOrgs: [tsfMy.id] },
      [{ id: 's1', start: local(at(-7, 10)), end: local(at(-7, 12)), link: 'https://zoom.us/j/9000000001', venue: 'TSF Pune Kendra hall' }, { id: 's2', start: local(at(2, 10)), end: local(at(2, 12)), link: 'https://zoom.us/j/9000000001', venue: 'TSF Pune Kendra hall' }], { capacity: 80 });
    ws('w_demo3', schoolAdmin, 'Class 8 plantation drive briefing', 'Briefing for students planting saplings on Environment Day.', 'offline', { audienceLabel: 'Satsang Vidyalaya (+ beneath)', audienceOrgIds: [school.id], pickedOrgs: [school.id] },
      [{ id: 's1', start: local(at(-3, 11)), end: local(at(-3, 12)), link: '', venue: 'School assembly hall' }]);
    ws('w_demo4', admin, 'Birds in your backyard — nest boxes, feeders & water', 'Learn to set up and care for bird stations; identify common visitors.', 'online', { audienceRoles: ['individual', 'student', 'school'], audienceLabel: 'Individuals · Students · Schools' },
      [{ id: 's1', start: local(at(6, 16)), end: local(at(6, 17)), link: 'https://meet.google.com/mty-birds-001', venue: '' }]);
    ws('w_demo5', byOrg('The Satsang Foundation') ? foundAdmin : admin, 'Mentoring circle (invite only)', 'A small group session for selected volunteers.', 'online', { audienceLabel: '3 invited people', audienceUserIds: ['MT-IND-000001', 'MT-IND-000002', 'MT-IND-000003'] },
      [{ id: 's1', start: local(at(9, 19)), end: local(at(9, 20)), link: 'https://teams.microsoft.com/l/meetup-join/demo', venue: '' }], { certificate: false });
    ws('w_demo6', user(kendra.id), 'Pune Kendra: monsoon planting day', 'Planting day with the Pune Kendra families.', 'offline', { audienceLabel: 'TSF Pune Kendra', audienceOrgIds: [kendra.id], pickedOrgs: [kendra.id] },
      [{ id: 's1', start: local(at(-20, 8)), end: local(at(-20, 11)), link: '', venue: 'Vetal Tekdi, Pune' }]);
    ws('w_demo7', admin, 'Cancelled: Seller onboarding clinic', 'Rescheduled to next month.', 'online', { audienceRoles: ['seller'], audienceLabel: 'Sellers' }, [{ id: 's1', start: local(at(12, 15)), end: local(at(12, 16)), link: 'https://meet.google.com/mty-sellers-001', venue: '' }], { status: 'cancelled' });

    // RSVPs, attendance and feedback for the sessions that already happened
    var invited = function (w) { return users.filter(function (u) { return u.role !== 'super_admin' && u.role !== 'seller' && (w.audience === 'all' || w.audienceRoles.indexOf(u.role) > -1 || (u.orgId && w.audienceOrgIds.indexOf(u.orgId) > -1) || w.audienceUserIds.indexOf(u.userId) > -1); }); };
    var worked = ['Clear and practical.', 'Loved the live demo.', 'Good pace, easy to follow.', 'The examples were from our own city.'], improve = ['A longer Q&A would help.', 'Share slides afterwards.', 'Start a little earlier.', ''];
    W.forEach(function (w) {
      if (w.status === 'cancelled') return;
      var people = invited(w).slice(0, 40);
      people.forEach(function (u, i) { if (i % 3 !== 2) R.push({ id: w.id + '_' + u.userId, workshopId: w.id, userId: u.userId, name: short(u.name), role: u.role, orgId: u.orgId || '', response: i % 7 === 0 ? 'maybe' : i % 11 === 0 ? 'no' : 'yes', at: now - 10 * DAY, organiserId: w.organiserId, ancestorOrgIds: w.ancestorOrgIds }); });
      w.sessions.forEach(function (s) {
        if (new Date(s.start).getTime() > now) return;
        people.forEach(function (u, i) {
          if (i % 4 === 3) { A.push({ id: w.id + '_' + s.id + '_' + u.userId, workshopId: w.id, sessionId: s.id, userId: u.userId, name: short(u.name), role: u.role, status: 'absent', method: 'organiser', markedBy: w.organiserId, at: now - 2 * DAY, organiserId: w.organiserId, ancestorOrgIds: w.ancestorOrgIds }); return; }
          A.push({ id: w.id + '_' + s.id + '_' + u.userId, workshopId: w.id, sessionId: s.id, userId: u.userId, name: short(u.name), role: u.role, status: 'present', method: i % 5 === 0 ? 'self' : 'organiser', markedBy: i % 5 === 0 ? u.userId : w.organiserId, at: now - 2 * DAY, organiserId: w.organiserId, ancestorOrgIds: w.ancestorOrgIds });
          if (i % 2 === 0) F.push({ id: w.id + '_' + s.id + '_' + u.userId, workshopId: w.id, sessionId: s.id, userId: u.userId, name: short(u.name), rating: 3 + (i % 3), worked: worked[i % 4], improve: improve[i % 4], comment: i % 6 === 0 ? 'Thank you — please run it again!' : '', at: now - DAY, organiserId: w.organiserId, ancestorOrgIds: w.ancestorOrgIds });
        });
      });
    });
    db._bulk('workshops', W); db._bulk('workshopRsvps', R); db._bulk('workshopAttendance', A); db._bulk('workshopFeedback', F);

    /* ---------- bird friends ---------- */
    var KINDS = ['nest', 'feeder', 'water'], NAMES = { nest: ['Balcony nest box', 'Mango-tree nest', 'School garden nest box'], feeder: ['Terrace feeder', 'Courtyard feeder', 'Canteen feeder'], water: ['Window water bowl', 'Garden water dish', 'Roof-top bird bath'] };
    var owners = [ind, user('MT-IND-000002'), user('MT-IND-000003'), schoolAdmin, kendraAdmin].filter(Boolean).concat(users.filter(function (u) { return u.role === 'student'; }).slice(0, 6)), stations = [], care = [], sights = [], BIRDS = ['House Sparrow', 'Rose-ringed Parakeet', 'Red-vented Bulbul', 'Oriental Magpie-Robin', 'Purple Sunbird', 'Common Myna', 'Asian Koel', 'Indian Robin'], n = 0, year = new Date().getFullYear();
    owners.forEach(function (o, oi) {
      var org = orgs.filter(function (x) { return x.id === o.orgId; })[0], city = MT.geoData.city(o.city || (org && org.city) || 'Pune') || MT.geoData.city('Pune');
      for (var k = 0; k < 3; k++) {
        n++; var kind = KINDS[(oi + k) % 3], code = 'BIRD-' + year + '-' + MT.pad(n, 6), last = now - Math.floor(rnd() * 12) * DAY;
        stations.push({ id: code, code: code, kind: kind, name: NAMES[kind][k % 3], ownerId: o.userId, ownerName: o.name, orgId: o.orgId || '', ancestorOrgIds: o.ancestorOrgIds || [], lat: +(city.lat + (rnd() - 0.5) * 0.05).toFixed(6), lng: +(city.lng + (rnd() - 0.5) * 0.05).toFixed(6), city: city.name, state: city.state, treeCode: '', notes: '', status: k === 2 && oi % 4 === 0 ? 'damaged' : 'active', careCount: 3 + k, lastCareAt: last, lastAction: kind === 'water' ? 'Refilled water' : 'Added bird feed', createdAt: now - (60 - n) * DAY });
        for (var c = 0; c < 3; c++) care.push({ id: 'bc_' + code + c, stationCode: code, ownerId: o.userId, orgId: o.orgId || '', ancestorOrgIds: o.ancestorOrgIds || [], date: MT.fmt.iso(new Date(last - c * 4 * DAY)), action: kind === 'water' ? 'Refilled water' : 'Added bird feed', notes: '', postedBy: o.userId, createdAt: last - c * 4 * DAY });
        for (var s = 0; s < 2; s++) sights.push({ id: 'bs_' + code + s, species: BIRDS[Math.floor(rnd() * BIRDS.length)], count: 1 + Math.floor(rnd() * 5), date: MT.fmt.iso(new Date(now - Math.floor(rnd() * 20) * DAY)), stationCode: code, notes: s ? 'Came with chicks!' : '', ownerId: o.userId, ownerName: o.name, orgId: o.orgId || '', ancestorOrgIds: o.ancestorOrgIds || [], createdAt: now - Math.floor(rnd() * 20) * DAY });
      }
    });
    db._bulk('birdStations', stations); db._bulk('birdCare', care); db._bulk('birdSightings', sights);
    db._bulk('counters', [{ id: 'BIRD_' + year, n: n }]);


    /* ---------- plantation drives (hosted by many kinds of users) with real registrations ---------- */
    var nGoers = users.filter(function (u) { return u.role === 'individual' || u.role === 'student'; }), drives = [], dregs = [];
    function drive(id, host, title, desc, daysFrom, hour, dur, city, address, cap, saplings, bring, joined, extra) {
      var c = MT.geoData.city(city) || MT.geoData.city('Pune'), t = new Date(at(daysFrom, hour)), q = function (x) { return String(x).padStart(2, '0'); };
      var d = Object.assign({ id: id, title: title, description: desc, hostId: host.userId, hostName: short(host.name), hostRole: host.role, orgId: host.orgId || '', ancestorOrgIds: host.ancestorOrgIds || [], date: t.getFullYear() + '-' + q(t.getMonth() + 1) + '-' + q(t.getDate()) + 'T' + q(t.getHours()) + ':00',
        durationH: dur, address: address, city: c.name, state: c.state, lat: +(c.lat + (rnd() - 0.5) * 0.05).toFixed(6), lng: +(c.lng + (rnd() - 0.5) * 0.05).toFixed(6), capacity: cap, registered: 0, saplings: saplings, bring: bring, phone: host.phone || '+91 98765 43210', status: 'open', createdAt: now - 6 * DAY }, extra || {});
      var left = joined, gi = drives.length * 3;
      while (left > 0 && gi < nGoers.length + drives.length * 3) { var u = nGoers[gi % nGoers.length], party = Math.min(left, 1 + (gi % 3 === 0 ? 2 : 0)); gi++; if (u.userId === d.hostId || dregs.some(function (r) { return r.id === id + '_' + u.userId; })) continue;
        dregs.push({ id: id + '_' + u.userId, driveId: id, userId: u.userId, name: short(u.name), role: u.role, orgId: u.orgId || '', party: party, status: d.status === 'done' ? (gi % 4 ? 'attended' : 'registered') : 'registered', hostId: d.hostId, ancestorOrgIds: d.ancestorOrgIds, at: now - (gi % 5 + 1) * DAY }); d.registered += party; left -= party; }
      drives.push(d); return d;
    }
    drive('dr_demo1', foundAdmin, 'Satsang Foundation Mega Plantation · Vetal Tekdi', 'Our biggest drive of the year: 300 native saplings on the Vetal Tekdi slopes, followed by tea, a short talk on tree care and group photos. Families and first-timers very welcome.', 5, 7, 4, 'Pune', 'Gate 2, Vetal Tekdi, Paud Road, Pune', 120, 300, 'Water bottle, cap, gloves if you have them', 88);
    drive('dr_demo2', schoolAdmin, 'Satsang Vidyalaya · Class 8 sapling day', 'Students plant and name a sapling each along the school boundary, then record it in MyTree.', 2, 9, 2, 'Mumbai', 'Satsang Vidyalaya, Link Road, Mumbai', 40, 40, 'School uniform and a water bottle', 33);
    drive('dr_demo3', kendraAdmin, 'TSF Pune Kendra · Sunday Plantation', 'Weekly Kendra plantation. Bring the family; saplings and tools provided.', 9, 6, 3, 'Pune', 'TSF Pune Kendra grounds, Kothrud, Pune', 60, 80, 'Sun hat, water', 14);
    drive('dr_demo4', ind, 'Neighbourhood tree walk & plant', 'A small friendly group: we walk the lane, pick gaps, and plant 12 saplings together. Chai after!', 3, 17, 2, 'Pune', 'Near Lakshya Garden, Baner, Pune', 12, 12, 'Gardening gloves', 10);
    drive('dr_demo5', admin, 'Earth Day Mega Drive (everyone welcome)', 'City-wide Earth Day plantation across MyTree. Register now — you will receive the exact meeting point.', 20, 8, 5, 'Delhi', 'Sanjay Van, Mehrauli, New Delhi', 500, 1000, 'Water, cap, sturdy shoes', 142);
    drive('dr_demo6', user(byOrg('TSF Nagpur Kendra').id), 'TSF Nagpur Kendra · Orange City Greening', 'Roadside plantation with the Nagpur Kendra. (Full — join the next one!)', 4, 7, 3, 'Nagpur', 'Ambazari Lake garden, Nagpur', 20, 60, 'Cap and water', 20);
    drive('dr_demo7', kendraAdmin, 'Monsoon Plantation at Vetal Tekdi (finished)', 'Thank you to everyone who came — 140 saplings planted!', -12, 7, 3, 'Pune', 'Vetal Tekdi, Pune', 60, 140, '', 41, { status: 'done' });
    drive('dr_demo8', ind, 'Society garden plantation (cancelled due to rain)', 'Postponed to the next dry weekend.', 6, 8, 2, 'Pune', 'Baner Society Garden, Pune', 15, 10, '', 3, { status: 'cancelled' });
    db._bulk('drives', drives); db._bulk('driveRegs', dregs);

    /* ---------- carbon ladder rows (same maths as js/features/ladder.js) ---------- */
    var byOwner = {}; ctx.trees.forEach(function (t) { (byOwner[t.ownerId] = byOwner[t.ownerId] || []).push(t); });
    var ladder = [], fps = [], TR = ['individual', 'student', 'foundation', 'school', 'institution'];
    users.forEach(function (u, ui) {
      if (TR.indexOf(u.role) < 0 || u.active === false) return;
      var ts = byOwner[u.userId] || [], alive = ts.filter(function (t) { return t.status !== 'dead'; }), kg = alive.reduce(function (a, t) { return a + MT.species.co2Total(t.speciesId, Math.max(1, MT.species.ageYears(t.plantedOn, now))); }, 0);
      var m = {}, city = '', best = 0; ts.forEach(function (t) { if (t.city) { m[t.city] = (m[t.city] || 0) + 1; if (m[t.city] > best) { best = m[t.city]; city = t.city; } } });
      var org = orgs.filter(function (o) { return o.id === u.orgId; })[0]; city = city || u.city || (org && org.city) || 'Pune';
      var aqi = MT.aqi.typical(city), mult = MT.aqi.multiplier(aqi), score = kg * mult, row = { id: u.userId, userId: u.userId, label: short(u.name), role: u.role, orgId: u.orgId || '', orgName: (org && org.name) || '', ancestorOrgIds: u.ancestorOrgIds || [], city: city, state: (MT.geoData.city(city) || {}).state || '', trees: ts.length, treesAlive: alive.length,
        kgCo2: Math.round(kg * 10) / 10, aqi: aqi, aqiSource: 'typical', aqiMult: Math.round(mult * 100) / 100, score: Math.round(score * 10) / 10, credits: Math.round(score / 10 * 100) / 100, hidden: false, updatedAt: now };
      if (ts.length && ui % 3 === 0) { row.footprintKg = 1400 + Math.floor(rnd() * 1800); fps.push({ id: u.userId, userId: u.userId, kgPerYear: row.footprintKg, inputs: { kwh: 150, car: 0, bike: 40, bus: 30, flights: 1, lpg: 6, diet: 'mixed' }, updatedAt: now }); }
      if (u.userId === 'MT-IND-000004') row.hidden = true;
      if (ts.length) ladder.push(row);
    });
    db._bulk('ladder', ladder); db._bulk('footprints', fps);
  });
})();
