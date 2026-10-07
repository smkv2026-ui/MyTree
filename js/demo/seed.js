/**
 * MyTree — deterministic DEMO data generator.
 * Produces: 1 super admin, 4 foundations (one sub-foundation), 6 schools, 2 institutions, 2 pending orgs,
 * ~120 students, 8 individuals, 2,000+ trees across Indian cities, plots, counters and denormalised stats.
 * (Growth updates, photos and green-cover readings are added by later phases through MT.seed.extend.)
 */
(function () {
  'use strict';
  var MT = window.MT;
  var PW = 'Demo@1234';
  var DAY = 86400000;
  var FIRST = ['Aarav', 'Aditi', 'Aisha', 'Akash', 'Ananya', 'Arjun', 'Diya', 'Ishaan', 'Kavya', 'Krish', 'Meera', 'Neha', 'Omkar', 'Priya', 'Rohan', 'Saanvi', 'Sahil', 'Sara', 'Tanvi', 'Vihaan', 'Zoya', 'Aryan', 'Riya', 'Siddharth', 'Pooja', 'Manav', 'Nisha', 'Yash', 'Isha', 'Dev', 'Anika', 'Kabir', 'Mira', 'Reyansh', 'Trisha', 'Harsh', 'Jiya', 'Lakshya', 'Navya', 'Parth'];
  var LAST = ['Sharma', 'Patil', 'Deshmukh', 'Iyer', 'Reddy', 'Khan', 'Gupta', 'Nair', 'Joshi', 'Kulkarni', 'Singh', 'Mehta', 'Das', 'Banerjee', 'Chavan', 'Shah', 'Menon', 'Verma', 'Pillai', 'Bhat', 'Rao', 'Kapoor', 'Jain', 'More', 'Pawar'];

  function slug(s) { return MT.geoData.slug(s); }

  /** Build the dataset and write it through db._bulk. */
  function run(db) {
    var rnd = MT.rng(2026), now = Date.now();
    var users = [], orgs = [], aliases = [], auths = [], trees = [], plots = [], stats = {}, counters = {};
    var demoAccounts = [];

    function bump(key, field, n) { stats[key] = stats[key] || {}; stats[key][field] = (stats[key][field] || 0) + (n == null ? 1 : n); }
    function profile(o) {
      return Object.assign({ active: true, status: 'active', consentAt: now - 90 * DAY, createdAt: now - 200 * DAY, createdBy: 'seed', lang: 'en', phone: '' }, o);
    }
    function addAuth(uid, email) { auths.push({ id: uid, email: email.toLowerCase(), pw: PW }); }
    function cityObj(n) { return MT.geoData.city(n); }

    /* --- Super admin --- */
    users.push(profile({ id: 'u_demo_admin', userId: 'MT-ADM-000001', role: 'super_admin', orgId: '', ancestorOrgIds: [], name: 'Asha Kulkarni', email: 'admin@mytree.demo', authEmail: 'admin@mytree.demo' }));
    addAuth('u_demo_admin', 'admin@mytree.demo');
    counters.ADM = { n: 1 };
    bump('global', 'users');
    demoAccounts.push({ role: 'super_admin', label: 'Super Admin', login: 'admin@mytree.demo', password: PW, note: 'Sees and manages everything' });

    /* --- Organisations --- */
    var orgDefs = [
      { type: 'foundation', name: 'Green Earth Foundation', city: 'Pune', parent: '' },
      { type: 'foundation', name: 'Vanrai Trust', city: 'Nagpur', parent: '' },
      { type: 'foundation', name: 'Hariyali Foundation', city: 'Delhi', parent: '' },
      { type: 'foundation', name: 'Green Earth — Mumbai Chapter', city: 'Mumbai', parent: 'MT-FND-000001' },
      { type: 'school', name: 'Sunrise Public School', city: 'Pune', parent: 'MT-FND-000001' },
      { type: 'school', name: 'Lotus Valley High School', city: 'Pune', parent: 'MT-FND-000001' },
      { type: 'school', name: 'Bayview Convent School', city: 'Mumbai', parent: 'MT-FND-000004' },
      { type: 'school', name: 'Orange City Vidyalaya', city: 'Nagpur', parent: 'MT-FND-000002' },
      { type: 'school', name: 'Yamuna Heritage School', city: 'Delhi', parent: 'MT-FND-000003' },
      { type: 'school', name: 'Garden City International', city: 'Bengaluru', parent: '' },
      { type: 'institution', name: 'College of Engineering, Pune', city: 'Pune', parent: 'MT-FND-000001' },
      { type: 'institution', name: 'Bengaluru Institute of Technology', city: 'Bengaluru', parent: '' }
    ];
    var typeCount = { foundation: 0, school: 0, institution: 0 };
    var orgById = {};
    orgDefs.forEach(function (d) {
      var n = ++typeCount[d.type], id = 'MT-' + MT.ORG_PREFIX[d.type] + '-' + MT.pad(n, 6);
      var parent = d.parent ? orgById[d.parent] : null;
      var o = {
        id: id, type: d.type, name: d.name, regNo: 'REG/' + (2010 + n) + '/' + MT.pad(rnd.int(100, 9999), 4),
        address: rnd.int(1, 120) + ', Garden Road', city: d.city, state: cityObj(d.city).state, country: 'India',
        contactName: rnd.pick(FIRST) + ' ' + rnd.pick(LAST), phone: '+91 98' + rnd.int(10000000, 99999999),
        email: MT.ORG_PREFIX[d.type].toLowerCase() + n + '@mytree.demo', logo: '', status: 'approved', parentOrgId: d.parent,
        ancestorOrgIds: (parent ? parent.ancestorOrgIds : []).concat([id]), createdBy: 'seed', createdAt: now - 220 * DAY, statusAt: now - 210 * DAY, statusBy: 'MT-ADM-000001'
      };
      orgs.push(o); orgById[id] = o;
      var uid = 'u_' + id.toLowerCase();
      users.push(profile({ id: uid, userId: id, role: d.type, orgId: id, ancestorOrgIds: o.ancestorOrgIds, name: o.contactName, email: o.email, authEmail: o.email }));
      addAuth(uid, o.email);
      bump('global', 'orgsApproved'); bump('global', 'orgs_' + d.type); bump('global', 'users');
      counters[MT.ORG_PREFIX[d.type]] = { n: n };
    });
    // Two organisations waiting for approval (shows the approval queue).
    [{ type: 'school', name: 'Maple Grove Academy', city: 'Jaipur' }, { type: 'foundation', name: 'Neer Van Foundation', city: 'Hyderabad' }].forEach(function (d) {
      var n = ++typeCount[d.type], id = 'MT-' + MT.ORG_PREFIX[d.type] + '-' + MT.pad(n, 6);
      var o = {
        id: id, type: d.type, name: d.name, regNo: 'REG/2026/' + MT.pad(rnd.int(100, 9999), 4), address: '12, Station Road', city: d.city,
        state: cityObj(d.city).state, country: 'India', contactName: rnd.pick(FIRST) + ' ' + rnd.pick(LAST), phone: '+91 97' + rnd.int(10000000, 99999999),
        email: 'pending' + n + '@mytree.demo', logo: '', status: 'pending', parentOrgId: '', ancestorOrgIds: [id], createdBy: 'seed', createdAt: now - 2 * DAY
      };
      orgs.push(o); orgById[id] = o;
      var uid = 'u_' + id.toLowerCase();
      users.push(profile({ id: uid, userId: id, role: d.type, orgId: id, ancestorOrgIds: [id], active: false, status: 'pending', name: o.contactName, email: o.email, authEmail: o.email, createdAt: now - 2 * DAY }));
      addAuth(uid, o.email);
      bump('global', 'orgsPending'); bump('global', 'users');
      counters[MT.ORG_PREFIX[d.type]] = { n: n };
    });

    /* --- Students (managed accounts: ID login via public alias) --- */
    var activeSchools = orgs.filter(function (o) { return (o.type === 'school' || o.type === 'institution') && o.status === 'approved'; });
    var students = [], perOrg = {};
    activeSchools.forEach(function (o, i) {
      var cnt = o.type === 'institution' ? 12 : 16;
      if (i === 0) cnt = 20;
      for (var k = 1; k <= cnt; k++) {
        var nn = k, tag = MT.ORG_PREFIX[o.type] + MT.pad(+o.id.split('-')[2], 3);
        var userId = 'MT-STU-' + tag + '-' + MT.pad(nn, 4), uid = 'u_' + userId.toLowerCase();
        var authEmail = userId.toLowerCase() + '@mytree.app';
        var name = rnd.pick(FIRST) + ' ' + rnd.pick(LAST);
        var u = profile({
          id: uid, userId: userId, role: 'student', orgId: o.id, ancestorOrgIds: o.ancestorOrgIds, name: name, email: '', authEmail: authEmail,
          grade: o.type === 'institution' ? 'Year ' + rnd.int(1, 4) + ' · ' + rnd.pick(['CSE', 'Mech', 'Civil', 'E&TC']) : rnd.int(5, 10) + '-' + rnd.pick(['A', 'B', 'C']),
          roll: String(k), createdBy: 'u_' + o.id.toLowerCase(), createdAt: now - rnd.int(60, 190) * DAY, publicOk: false
        });
        users.push(u); students.push(u); (perOrg[o.id] = perOrg[o.id] || []).push(u);
        aliases.push({ id: userId, authEmail: authEmail, active: true }); addAuth(uid, authEmail);
        counters['STU_' + o.id] = { n: nn };
        bump('global', 'users'); bump('global', 'students'); bump('org_' + o.id, 'members');
        o.ancestorOrgIds.forEach(function (a) { if (a !== o.id) bump('org_' + a, 'members'); });
      }
    });
    var sunriseStudent = students[0], lotusStudent = perOrg['MT-SCH-000002'][0];
    demoAccounts.push({ role: 'foundation', label: 'Foundation', login: 'fnd1@mytree.demo', password: PW, note: 'Green Earth Foundation — sees its schools and the Mumbai chapter' });
    demoAccounts.push({ role: 'foundation', label: 'Sub-foundation', login: 'fnd4@mytree.demo', password: PW, note: 'Mumbai chapter under Green Earth' });
    demoAccounts.push({ role: 'school', label: 'School admin', login: 'sch1@mytree.demo', password: PW, note: 'Sunrise Public School' });
    demoAccounts.push({ role: 'institution', label: 'Institution admin', login: 'ins1@mytree.demo', password: PW, note: 'College of Engineering, Pune' });
    demoAccounts.push({ role: 'student', label: 'Student (user ID login)', login: sunriseStudent.userId, password: PW, note: sunriseStudent.name + ' · Sunrise Public School' });
    demoAccounts.push({ role: 'student', label: 'Another student', login: lotusStudent.userId, password: PW, note: lotusStudent.name + ' · Lotus Valley' });

    /* --- Individuals --- */
    var inds = [];
    for (var i = 1; i <= 8; i++) {
      var uid2 = 'u_mt-ind-' + MT.pad(i, 6), userId2 = 'MT-IND-' + MT.pad(i, 6), email2 = 'ind' + i + '@mytree.demo';
      var city2 = rnd.pick(MT.geoData.cities);
      var u2 = profile({ id: uid2, userId: userId2, role: 'individual', orgId: '', ancestorOrgIds: [], name: rnd.pick(FIRST) + ' ' + rnd.pick(LAST), email: email2, authEmail: email2, city: city2.name, createdAt: now - rnd.int(30, 200) * DAY });
      users.push(u2); inds.push(u2); addAuth(uid2, email2);
      bump('global', 'users'); bump('global', 'individuals');
    }
    counters.IND = { n: 8 };
    demoAccounts.push({ role: 'individual', label: 'Individual', login: 'ind1@mytree.demo', password: PW, note: inds[0].name });

    /* --- Plots (one per active org, polygon around its planting site) --- */
    var siteByOrg = {};
    orgs.filter(function (o) { return o.status === 'approved'; }).forEach(function (o) {
      var c = cityObj(o.city);
      var lat = c.lat + (rnd() - 0.5) * 0.12, lng = c.lng + (rnd() - 0.5) * 0.12;
      siteByOrg[o.id] = { lat: lat, lng: lng };
      var h = 0.0007 + rnd() * 0.0006, w = h * 1.4;
      var poly = [{ lat: lat - h, lng: lng - w }, { lat: lat - h, lng: lng + w }, { lat: lat + h, lng: lng + w }, { lat: lat + h, lng: lng - w }]; // array of maps: Firestore forbids nested arrays
      var area = Math.round((2 * h * 111320) * (2 * w * 111320 * Math.cos(lat * Math.PI / 180)));
      plots.push({
        id: 'PLOT-' + o.id.slice(3), name: o.name + ' — campus plot', orgId: o.id, ancestorOrgIds: o.ancestorOrgIds, city: o.city, state: o.state,
        polygon: poly, areaM2: area, baselineOn: new Date(now - 420 * DAY).toISOString().slice(0, 10), baselinePhotoIds: [], ownerId: o.id, createdBy: 'u_' + o.id.toLowerCase(), createdAt: now - 420 * DAY, simulated: true
      });
    });

    /* --- Trees --- */
    var POPULAR = ['neem', 'mango', 'banyan', 'peepal', 'jamun', 'gulmohar', 'karanj-pongamia', 'arjun', 'amla-indian-gooseberry', 'guava', 'drumstick-moringa', 'bamboo', 'amaltas-golden-shower', 'teak', 'ashoka', 'tamarind', 'jackfruit', 'curry-leaf', 'lemon', 'kadamba'];
    var weights = {};
    MT.species.list.forEach(function (s) { weights[s.id] = (s.native ? 2 : 1) * (POPULAR.indexOf(s.id) > -1 ? 8 : 1) * (s.category === 'grass' || s.category === 'coastal' ? 0.3 : 1); });
    var codeSeq = {};
    function mkTree(owner, o, opts) {
      var planted = now - opts.ageDays * DAY, year = new Date(planted).getFullYear();
      codeSeq[year] = (codeSeq[year] || 0) + 1;
      var sp = rnd.weighted(MT.species.list, function (s) { return weights[s.id]; });
      var site = o ? siteByOrg[o.id] : null, city = o ? cityObj(o.city) : cityObj(owner.city || 'Pune');
      var lat, lng;
      if (site && rnd() < 0.85) { lat = site.lat + (rnd() - 0.5) * 0.0024; lng = site.lng + (rnd() - 0.5) * 0.0032; }
      else { lat = city.lat + rnd.gauss() * 0.025; lng = city.lng + rnd.gauss() * 0.025; }
      var ageY = opts.ageDays / 365.25, r = rnd(), health, status = 'alive';
      if (r < 0.06) { health = 'dead'; status = 'dead'; } else if (r < 0.12) health = 'struggling'; else if (r < 0.26) health = 'needs_care'; else if (r < 0.62) health = 'healthy'; else health = 'thriving';
      var cr = rnd(), cadence = cr < 0.1 ? 'weekly' : cr < 0.8 ? 'monthly' : 'yearly';
      var code = 'TREE-' + year + '-' + MT.pad(codeSeq[year], 6);
      var t = {
        id: code, code: code, speciesId: sp.id, ownerId: owner.userId, ownerName: owner.name, postedBy: owner.userId, onBehalfOf: '',
        orgId: owner.orgId || '', ancestorOrgIds: owner.ancestorOrgIds || [], lat: +lat.toFixed(6), lng: +lng.toFixed(6), geohash: MT.geo.geohash(lat, lng, 9),
        city: city.name, state: city.state, plantedOn: new Date(planted).toISOString().slice(0, 10), status: status, health: health, cadence: cadence,
        heightCm: Math.round(MT.species.heightAt(sp.id, ageY) * (0.7 + rnd() * 0.6) + 30), lastUpdateAt: 0, updatesCount: 0,
        plotId: (o && opts.plot) ? 'PLOT-' + o.id.slice(3) : '', public: rnd() < 0.18 && owner.role !== 'student', dedication: '', notes: '', createdAt: planted
      };
      trees.push(t);
      bump('global', 'trees'); bump('global', status === 'dead' ? 'treesDead' : 'treesAlive'); bump('global', 'h_' + health);
      if (status !== 'dead') bump('global', 'sumPlantedDayAlive', Math.floor(planted / DAY));
      var keys = ['region_' + slug(city.state), 'city_' + slug(city.name), 'month_' + t.plantedOn.slice(0, 7), 'user_' + owner.userId];
      if (status !== 'dead') bump('species', sp.id);
      (owner.ancestorOrgIds || []).forEach(function (a) { keys.push('org_' + a); });
      keys.forEach(function (k) {
        bump(k, 'trees'); bump(k, status === 'dead' ? 'treesDead' : 'treesAlive'); bump(k, 'h_' + health);
        if (status !== 'dead') bump(k, 'sumPlantedDayAlive', Math.floor(planted / DAY));
      });
      return t;
    }
    // Students
    students.forEach(function (s) {
      var o = orgById[s.orgId], n = rnd.int(5, 18);
      var drive = rnd.int(20, 400);
      for (var k = 0; k < n; k++) mkTree(s, o, { ageDays: Math.max(3, drive + rnd.int(-5, 30)), plot: rnd() < 0.5 });
    });
    // Org admins' own plantation drives
    orgs.filter(function (o) { return o.status === 'approved'; }).forEach(function (o) {
      var owner = users.filter(function (u) { return u.userId === o.id; })[0], n = rnd.int(25, 60);
      for (var k = 0; k < n; k++) mkTree(owner, o, { ageDays: rnd.int(10, 420), plot: true });
    });
    // Individuals
    inds.forEach(function (u) { var n = rnd.int(10, 35); for (var k = 0; k < n; k++) mkTree(u, null, { ageDays: rnd.int(5, 430), plot: false }); });
    var guard = 0;
    while (trees.length < 2050 && guard++ < 200) mkTree(rnd.pick(inds), null, { ageDays: rnd.int(5, 430) });
    Object.keys(codeSeq).forEach(function (y) { counters['TREE_' + y] = { n: codeSeq[y] }; });
    stats.global.updatesThisMonth = 0;

    /* --- Write --- */
    var statDocs = Object.keys(stats).map(function (k) {
      var d = Object.assign({ id: k }, stats[k]);
      if (k.indexOf('city_') === 0) { var c = MT.geoData.cities.filter(function (x) { return 'city_' + slug(x.name) === k; })[0]; Object.assign(d, { kind: 'city', name: c.name, state: c.state, lat: c.lat, lng: c.lng }); }
      if (k.indexOf('region_') === 0) { d.kind = 'region'; var cc = MT.geoData.cities.filter(function (x) { return 'region_' + slug(x.state) === k; })[0]; d.name = cc ? cc.state : k; }
      if (k.indexOf('org_') === 0) { d.kind = 'org'; var oo = orgs.filter(function (x) { return 'org_' + x.id === k; })[0]; if (oo) { d.name = oo.name; d.type = oo.type; d.city = oo.city; } }
      if (k.indexOf('month_') === 0) d.kind = 'month';
      if (k.indexOf('user_') === 0) { var uu = users.filter(function (x) { return 'user_' + x.userId === k; })[0]; d.kind = 'user'; d.orgId = uu.orgId || ''; d.label = MT.stats.shortName(uu.name); }
      if (k === 'species') d.kind = 'species';
      return d;
    });
    db._bulk('users', users);
    db._bulk('orgs', orgs);
    db._bulk('loginAliases', aliases);
    db._bulk('_auth', auths);
    db._bulk('trees', trees);
    db._bulk('plots', plots);
    db._bulk('stats', statDocs);
    db._bulk('counters', Object.keys(counters).map(function (k) { return Object.assign({ id: k }, counters[k]); }));
    db._bulk('meta', [{ id: 'setup', createdAt: now - 230 * DAY, superAdminUid: 'u_demo_admin', demo: true }]);
    db._bulk('announcements', [{ id: 'welcome', text: 'Welcome to the MyTree demo — everything you see here is sample data stored only in your browser.', active: true, createdAt: now, tone: 'info' }]);
    MT.seed.demoAccounts = demoAccounts;
    MT.seed.password = PW;
    if (MT.seed.extend) MT.seed.extend.forEach(function (fn) { fn(db, { users: users, orgs: orgs, trees: trees, plots: plots, rnd: rnd, now: now }); });
  }

  MT.seed = { run: run, extend: [], demoAccounts: [], password: PW,
    /** Demo accounts are static; expose them even when the DB is loaded from IndexedDB. */
    accounts: function () {
      return [
        { role: 'super_admin', label: 'Super Admin', login: 'admin@mytree.demo', password: PW, note: 'Sees and manages everything' },
        { role: 'foundation', label: 'Foundation', login: 'fnd1@mytree.demo', password: PW, note: 'Green Earth Foundation — sees its schools' },
        { role: 'foundation', label: 'Sub-foundation', login: 'fnd4@mytree.demo', password: PW, note: 'Mumbai chapter under Green Earth' },
        { role: 'school', label: 'School admin', login: 'sch1@mytree.demo', password: PW, note: 'Sunrise Public School' },
        { role: 'institution', label: 'Institution admin', login: 'ins1@mytree.demo', password: PW, note: 'College of Engineering, Pune' },
        { role: 'student', label: 'Student (ID login)', login: 'MT-STU-SCH001-0001', password: PW, note: 'Sunrise Public School' },
        { role: 'student', label: 'Another student', login: 'MT-STU-SCH002-0001', password: PW, note: 'Lotus Valley High School' },
        { role: 'individual', label: 'Individual', login: 'ind1@mytree.demo', password: PW, note: 'Plants on their own' }
      ];
    } };
})();
