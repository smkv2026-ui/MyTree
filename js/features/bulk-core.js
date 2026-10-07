/**
 * MyTree — bulk import engine (no UI): styled Excel templates with real dropdown validation (ExcelJS), parsing of .xlsx/.csv,
 * per-row validation in plain language, and chunked, retried imports.
 *
 *   MT.bulk.TYPES / MT.bulk.typesFor(role)
 *   MT.bulk.template(type)              → Promise<Blob>   (.xlsx: Instructions [protected] · Data · Lookup)
 *   MT.bulk.parseFile(file)             → Promise<{rows:[{__row, ...}], headers}>
 *   MT.bulk.prepare(type)               → Promise<ctx>    (loads what validation needs: people, orgs, trees…)
 *   MT.bulk.validate(type, rows, ctx)   → Promise<[{n, data, errors[], warnings[], raw}]>
 *   MT.bulk.run(type, results, ctx, onProgress) → Promise<summary>
 *
 * Firestore rules limit document look-ups per request (20), so tree imports commit ONE OWNER PER BATCH (≤ 350 documents);
 * student / organisation imports create one account per batch (each needs its own Auth account anyway).
 */
(function () {
  'use strict';
  var MT = window.MT;
  var HEALTH = [['thriving', 'Thriving'], ['healthy', 'Healthy'], ['needs_care', 'Needs care'], ['struggling', 'Struggling'], ['dead', 'Dead']];
  var CAD = ['weekly', 'monthly', 'yearly'];
  function today() { return MT.fmt.iso(new Date()); }

  /* ---------- column definitions ---------- */
  var COLS = {
    trees: [
      { key: 'owner_user_id', hint: 'Optional. Leave empty to plant for yourself; admins may enter the user ID of someone in their organisation.', example: ['', ''], width: 22 },
      { key: 'species', req: 1, list: 'species', hint: 'Pick from the list, or type  Other: <name>  for a species that is not listed.', example: ['Neem', 'Other: Rose apple'], width: 28 },
      { key: 'count', hint: 'How many saplings (1–100). Each gets its own ID. Default 1.', example: [5, 1], width: 10, whole: [1, 100] },
      { key: 'planting_date', req: 1, hint: 'Date planted, e.g. 2026-07-15. Not in the future.', example: ['2026-07-15', '2026-08-02'], width: 16, date: 1 },
      { key: 'latitude', req: 1, hint: 'Decimal degrees, e.g. 18.5204 (India: roughly 6 to 38).', example: [18.5204, 18.5211], width: 12, decimal: [-90, 90] },
      { key: 'longitude', req: 1, hint: 'Decimal degrees, e.g. 73.8567 (India: roughly 68 to 98).', example: [73.8567, 73.8571], width: 12, decimal: [-180, 180] },
      { key: 'plot_name', hint: 'Optional name for the plot (shared by all saplings in a row).', example: ['School garden', ''], width: 22 },
      { key: 'notes', hint: 'Optional, up to 500 characters.', example: ['Planted by Class 7', ''], width: 30 }
    ],
    students: [
      { key: 'full_name', req: 1, hint: 'Student or member’s full name.', example: ['Aarav Sharma', 'Diya Patil'], width: 26 },
      { key: 'class_grade', hint: 'Class / grade / year, e.g. 7-B.', example: ['7-B', '8-A'], width: 14 },
      { key: 'roll_number', hint: 'Roll number (text or number).', example: [12, 7], width: 12 },
      { key: 'email', hint: 'Optional.', example: ['', ''], width: 26 },
      { key: 'phone', hint: 'Optional.', example: ['', ''], width: 16 },
      { key: 'guardian_contact', hint: 'Optional guardian name / phone.', example: ['Mr Sharma 98xxxxxx12', ''], width: 26 }
    ],
    orgs: [
      { key: 'org_type', req: 1, list: 'orgtypes', hint: 'school, institution or foundation.', example: ['school', 'institution'], width: 14 },
      { key: 'org_name', req: 1, hint: 'Name of the organisation.', example: ['Lotus Public School', 'City Engineering College'], width: 30 },
      { key: 'city', req: 1, hint: 'City.', example: ['Pune', 'Nagpur'], width: 16 },
      { key: 'state', req: 1, list: 'states', hint: 'Pick the state.', example: ['Maharashtra', 'Maharashtra'], width: 18 },
      { key: 'contact_person', req: 1, hint: 'Becomes the administrator of the new organisation.', example: ['Mrs Rao', 'Dr Kulkarni'], width: 22 },
      { key: 'phone', hint: 'Optional.', example: ['', ''], width: 16 },
      { key: 'email', hint: 'Optional.', example: ['', ''], width: 26 },
      { key: 'registration_no', hint: 'Optional.', example: ['', ''], width: 18 },
      { key: 'parent_org_id', hint: 'Optional: ID of the foundation it belongs to (defaults to yours).', example: ['', ''], width: 20 }
    ],
    updates: [
      { key: 'tree_id', req: 1, hint: 'Tree ID, e.g. TREE-2026-000123.', example: ['TREE-2026-000123', 'TREE-2026-000124'], width: 22 },
      { key: 'date', req: 1, hint: 'Date of the update, e.g. 2026-09-01. Not in the future.', example: ['2026-09-01', '2026-09-01'], width: 14, date: 1 },
      { key: 'height_cm', hint: 'Height in centimetres (optional).', example: [64, 71], width: 12, decimal: [0, 5000] },
      { key: 'health', req: 1, list: 'health', hint: 'Thriving, Healthy, Needs care, Struggling or Dead.', example: ['Healthy', 'Needs care'], width: 14 },
      { key: 'notes', hint: 'Optional, up to 500 characters.', example: ['New leaves', 'Leaves yellowing'], width: 30 },
      { key: 'girth_cm', hint: 'Optional girth at chest height (cm).', example: ['', ''], width: 12, decimal: [0, 1000] }
    ]
  };
  var TYPES = {
    trees: { label: 'Trees', icon: 'trees', roles: ['foundation', 'school', 'institution', 'student', 'individual'], blurb: 'Add many trees at once, for yourself or (admins) for people in your organisation.' },
    students: { label: 'Students / members', icon: 'users', roles: ['school', 'institution', 'foundation', 'super_admin'], blurb: 'Create accounts with user IDs and passwords, and get the credentials sheet straight away.' },
    orgs: { label: 'Sub-foundations & school admins', icon: 'building-2', roles: ['foundation', 'super_admin'], blurb: 'Create schools, institutions and sub-foundations, each with its administrator account.' },
    updates: { label: 'Growth updates', icon: 'clipboard-check', roles: ['foundation', 'school', 'institution', 'student', 'individual'], blurb: 'Post many growth updates in one go (photos can be added afterwards).' }
  };
  function cols(type) {
    var c = COLS[type].slice();
    if (type === 'students' && (MT.auth.isSuper() || MT.auth.role() === 'foundation')) c.unshift({ key: 'school_id', req: 1, hint: 'ID of the school or institution, e.g. MT-SCH-000001.', example: ['MT-SCH-000001', 'MT-SCH-000001'], width: 20 });
    return c;
  }

  /* ---------- lookups ---------- */
  var spIndex = null;
  function speciesIndex() {
    if (spIndex) return spIndex; spIndex = {};
    MT.species.list.forEach(function (s) { [s.common, s.scientific, s.id].forEach(function (k) { if (k) spIndex[String(k).toLowerCase().trim()] = s; }); });
    return spIndex;
  }
  function resolveSpecies(raw) {
    var v = String(raw || '').trim(); if (!v) return { err: 'Species is required.' };
    var m = /^other\s*[:\-–]\s*(.+)$/i.exec(v); if (m) return { id: 'other', custom: m[1].trim().slice(0, 60) };
    if (/^other$/i.test(v)) return { err: 'Write  Other: <name of the tree>  so we know what it is.' };
    var s = speciesIndex()[v.toLowerCase()]; if (s) return { id: s.id };
    var best = null, bd = 99, q = v.toLowerCase();
    MT.species.list.forEach(function (x) { [x.common.toLowerCase(), x.common.toLowerCase().split(/[ (]/)[0], x.scientific.toLowerCase()].forEach(function (c) { var d = lev(q, c); if (d < bd) { bd = d; best = x; } }); });
    return { err: 'Species “' + v + '” is not in the list.' + (best && bd <= Math.max(2, Math.floor(q.length / 3)) ? ' Did you mean “' + best.common + '”?' : '') + ' Or write  Other: <name>.' };
  }
  /** Levenshtein distance (small strings only). */
  function lev(a, b) { var m = a.length, n = b.length, d = []; for (var i = 0; i <= m; i++) { d[i] = [i]; } for (var j = 1; j <= n; j++) d[0][j] = j; for (i = 1; i <= m; i++) for (j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[m][n]; }
  function isoDate(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date) return isNaN(v) ? null : new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate())).toISOString().slice(0, 10);
    var s = String(v).trim(), m;
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) return m[1] + '-' + MT.pad(m[2], 2) + '-' + MT.pad(m[3], 2);
    if ((m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/.exec(s))) return m[3] + '-' + MT.pad(m[2], 2) + '-' + MT.pad(m[1], 2); // dd/mm/yyyy (Indian convention)
    return null;
  }
  function validDate(iso) { if (!iso) return false; var d = new Date(iso + 'T00:00:00Z'); return !isNaN(d) && d.toISOString().slice(0, 10) === iso; }
  function num(v) { if (v === '' || v == null) return null; var n = Number(String(v).replace(/,/g, '.').trim()); return isNaN(n) ? NaN : n; }
  function str(v) { return v == null ? '' : String(v).trim(); }
  function healthKey(v) { var s = str(v).toLowerCase().replace(/[\s_-]+/g, ' '); var m = HEALTH.filter(function (h) { return h[1].toLowerCase() === s || h[0].replace(/_/g, ' ') === s; })[0]; return m ? m[0] : null; }

  var B = (MT.bulk = {
    TYPES: TYPES, HEALTH: HEALTH,
    typesFor: function (role) { return Object.keys(TYPES).filter(function (k) { return TYPES[k].roles.indexOf(role) > -1; }); },
    columns: cols,

    /* =============== templates =============== */
    template: function (type) {
      return MT.loader.load('exceljs').then(function () {
        var wb = new ExcelJS.Workbook(); wb.creator = 'MyTree'; wb.created = new Date();
        var C = cols(type), def = TYPES[type], FOREST = 'FF0F3D2E', LEAF = 'FF237D49', MINT = 'FFD9F3E3', SAND = 'FFF4ECD8';
        var species = MT.species.list.map(function (s) { return s.common; });
        var lookups = { species: species, health: HEALTH.map(function (h) { return h[1]; }), orgtypes: ['school', 'institution', 'foundation'], states: MT.geoData.states, cadence: CAD };
        var lcol = { species: 'A', health: 'B', orgtypes: 'C', states: 'D', cadence: 'E' };

        // --- Instructions (protected) ---
        var ins = wb.addWorksheet('Instructions', { properties: { tabColor: { argb: LEAF } }, views: [{ showGridLines: false }] });
        ins.columns = [{ width: 24 }, { width: 12 }, { width: 70 }, { width: 28 }];
        ins.mergeCells('A1:D1'); ins.getCell('A1').value = 'MyTree — ' + def.label + ' template'; ins.getCell('A1').font = { name: 'Calibri', size: 20, bold: true, color: { argb: FOREST } };
        ins.mergeCells('A2:D2'); ins.getCell('A2').value = 'Maitree — friendship with nature'; ins.getCell('A2').font = { italic: true, color: { argb: LEAF } };
        var steps = ['1. Open the “Data” sheet. The two grey rows are examples — you can delete them (any row marked EXAMPLE is ignored).', '2. Fill one row per ' + (type === 'trees' ? 'planting (a row with count 5 creates 5 trees)' : type === 'students' ? 'person' : type === 'orgs' ? 'organisation' : 'update') + ', starting directly under the header. Columns marked “required” must be filled.',
          '3. Use the drop-down lists where offered. Dates look like 2026-07-15 (day/month/year such as 15/07/2026 also works).', '4. Save the file, then in MyTree open Bulk upload and drop it in. You will see every problem explained before anything is saved.', '5. Up to 5,000 rows per file. This sheet is protected so the instructions stay intact (no password needed to view).'];
        steps.forEach(function (t, i) { ins.mergeCells('A' + (4 + i) + ':D' + (4 + i)); var c = ins.getCell('A' + (4 + i)); c.value = t; c.alignment = { wrapText: true, vertical: 'top' }; ins.getRow(4 + i).height = 32; });
        var hr = ins.getRow(10); ['Column', 'Required?', 'What to enter', 'Example'].forEach(function (t, i) { var c = hr.getCell(i + 1); c.value = t; c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FOREST } }; });
        C.forEach(function (c, i) { var r = ins.getRow(11 + i); r.values = [c.key, c.req ? 'required' : 'optional', c.hint, String(c.example[0] === '' ? (c.example[1] || '') : c.example[0])]; r.getCell(3).alignment = { wrapText: true, vertical: 'top' }; r.height = 30; r.getCell(1).font = { bold: true }; if (c.req) r.getCell(2).font = { bold: true, color: { argb: 'FFB3362B' } }; if (i % 2) r.eachCell(function (cell) { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SAND } }; }); });
        // --- Data ---
        var ds = wb.addWorksheet('Data', { properties: { tabColor: { argb: FOREST } }, views: [{ state: 'frozen', ySplit: 1 }] });
        ds.columns = C.map(function (c) { return { header: c.key, key: c.key, width: c.width || 18 }; }).concat([{ header: '_example', key: '_example', width: 12 }]);
        var h1 = ds.getRow(1); h1.height = 24; h1.eachCell(function (c, i) { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i <= C.length && C[i - 1].req ? LEAF : FOREST } }; c.alignment = { vertical: 'middle' }; if (i <= C.length) c.note = (C[i - 1].req ? 'REQUIRED. ' : 'Optional. ') + C[i - 1].hint; });
        [0, 1].forEach(function (k) { var row = ds.addRow(C.map(function (c) { return c.example[k]; }).concat(['EXAMPLE'])); row.eachCell(function (c) { c.font = { italic: true, color: { argb: 'FF7B7468' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } }; }); });
        for (var r = 2; r <= 1001; r++) C.forEach(function (c, i) {
          var cell = ds.getCell(r, i + 1);
          if (c.list) cell.dataValidation = { type: 'list', allowBlank: !c.req, formulae: ['Lookup!$' + lcol[c.list] + '$2:$' + lcol[c.list] + '$' + (lookups[c.list].length + 1)], showErrorMessage: c.list !== 'species', errorStyle: 'stop', errorTitle: 'Pick from the list', error: 'Please choose one of the listed values.' };
          else if (c.whole) cell.dataValidation = { type: 'whole', operator: 'between', formulae: c.whole, allowBlank: true, showErrorMessage: true, errorTitle: 'Whole number', error: 'Enter a whole number between ' + c.whole[0] + ' and ' + c.whole[1] + '.' };
          else if (c.decimal) cell.dataValidation = { type: 'decimal', operator: 'between', formulae: c.decimal, allowBlank: true, showErrorMessage: true, errorTitle: 'Number', error: 'Enter a number between ' + c.decimal[0] + ' and ' + c.decimal[1] + '.' };
          if (c.date && r > 3) cell.numFmt = 'yyyy-mm-dd';
        });
        // --- Lookup ---
        var lk = wb.addWorksheet('Lookup', { properties: { tabColor: { argb: 'FFC9A227' } } });
        var heads = ['Species', 'Health', 'Organisation types', 'States', 'Update cadence']; var order = ['species', 'health', 'orgtypes', 'states', 'cadence'];
        lk.columns = heads.map(function (h, i) { return { header: h, width: i === 0 ? 34 : 22 }; });
        lk.getRow(1).eachCell(function (c) { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FOREST } }; });
        order.forEach(function (k, ci) { lookups[k].forEach(function (v, ri) { lk.getCell(ri + 2, ci + 1).value = v; }); });
        return ins.protect('mytree', { selectLockedCells: true, selectUnlockedCells: true }).then(function () { return wb.xlsx.writeBuffer(); }).then(function (buf) { return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }); });
      });
    },
    templateCsv: function (type) { var C = cols(type); return MT.csv([C.map(function (c) { return c.key; })].concat([0, 1].map(function (k) { return C.map(function (c) { return c.example[k]; }); }))); },

    /* =============== parsing =============== */
    parseFile: function (file) {
      var name = String(file.name || '').toLowerCase();
      function norm(h) { return String(h == null ? '' : h).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); }
      function pack(headers, rowsArr) {
        var rows = [], skipped = 0;
        rowsArr.forEach(function (arr, i) {
          var o = { __row: i + 2 }, any = false;
          headers.forEach(function (h, j) { if (h) { o[h] = arr[j] == null ? '' : arr[j]; if (str(arr[j]) !== '') any = true; } });
          if (!any) return; if (/^example/i.test(str(o._example)) || /^example\b/i.test(str(arr[0]))) { skipped++; return; } rows.push(o);
        });
        return { rows: rows, headers: headers.filter(Boolean), skippedExamples: skipped };
      }
      if (/\.csv$|\.txt$/.test(name)) {
        return MT.loader.load('papaparse').then(function () { return file.text(); }).then(function (t) {
          var r = window.Papa.parse(t.replace(/^﻿/, ''), { skipEmptyLines: 'greedy' }); if (!r.data.length) throw MT.userError('That file is empty.');
          return pack(r.data[0].map(norm), r.data.slice(1));
        });
      }
      if (!/\.xlsx$/.test(name)) return Promise.reject(MT.userError('Please upload an Excel (.xlsx) or CSV file. Use “Download template” for the right format.'));
      return MT.loader.load('exceljs').then(function () { return file.arrayBuffer(); }).then(function (buf) {
        var wb = new ExcelJS.Workbook(); return wb.xlsx.load(buf).then(function () {
          var ws = wb.getWorksheet('Data') || wb.worksheets[0]; if (!ws) throw MT.userError('That workbook has no sheets.');
          function val(v) { if (v && typeof v === 'object' && !(v instanceof Date)) { if (v.richText) return v.richText.map(function (t) { return t.text; }).join(''); if ('result' in v) return v.result; if ('text' in v) return v.text; if (v.hyperlink) return v.hyperlink; } return v; }
          var headers = []; ws.getRow(1).eachCell({ includeEmpty: true }, function (c, i) { headers[i - 1] = norm(val(c.value)); });
          var rows = []; for (var r = 2; r <= ws.rowCount; r++) { var arr = []; for (var c = 1; c <= headers.length; c++) arr.push(val(ws.getRow(r).getCell(c).value)); rows.push(arr); }
          var out = pack(headers, rows); out.rows.forEach(function (o, k) { o.__row = o.__row; }); return out;
        });
      });
    },

    /* =============== validation =============== */
    prepare: function (type) {
      var me = MT.auth.profile(), ctx = { me: me, org: MT.auth.session().org, people: {}, orgs: {}, trees: {} };
      var jobs = [];
      if (type === 'trees' && MT.auth.isManager()) jobs.push(MT.accounts.listPeople().then(function (ps) { ps.forEach(function (u) { if (u.active) ctx.people[u.userId] = u; }); }));
      if (type === 'students' || type === 'orgs') jobs.push((me.role === 'super_admin' ? MT.db.list('orgs', { limit: 2000 }) : MT.db.list('orgs', { where: [['ancestorOrgIds', 'array-contains', me.orgId]], limit: 2000 })).then(function (os) { os.forEach(function (o) { ctx.orgs[o.id] = o; }); if (ctx.org) ctx.orgs[ctx.org.id] = ctx.org; }));
      if (type === 'students') jobs.push(MT.accounts.listPeople().then(function (ps) { ctx.existing = ps; }));
      return Promise.all(jobs).then(function () { return ctx; });
    },
    validate: function (type, rows, ctx) {
      var v = { trees: vTrees, students: vStudents, orgs: vOrgs, updates: vUpdates }[type];
      return Promise.resolve(v(rows, ctx));
    },

    /* =============== running =============== */
    run: function (type, results, ctx, onProgress) {
      var ok = results.filter(function (r) { return !r.errors.length; });
      return { trees: runTrees, students: runStudents, orgs: runOrgs, updates: runUpdates }[type](ok, ctx, onProgress || function () {});
    },
    errorReportCsv: function (results) {
      var rows = [['Row', 'Status', 'Problems', 'Warnings']]; results.forEach(function (r) { if (r.errors.length || r.warnings.length) rows.push([r.n, r.errors.length ? 'ERROR' : 'WARNING', r.errors.join(' | '), r.warnings.join(' | ')]); });
      return MT.csv(rows);
    }
  });

  /* ---------- validators ---------- */
  function vTrees(rows, ctx) {
    var me = ctx.me, seen = {}, org = ctx.org, city = org && org.city ? MT.geoData.city(org.city) : null;
    return rows.map(function (r) {
      var o = { n: r.__row, raw: r, errors: [], warnings: [], data: {} };
      var owner = str(r.owner_user_id).toUpperCase(); o.data.owner = null;
      if (owner && owner !== me.userId) { if (!MT.auth.isManager()) o.errors.push('Only administrators can plant for other people — leave owner_user_id empty.'); else if (!ctx.people[owner]) o.errors.push('Owner “' + owner + '” was not found among the active people in your organisation.'); else o.data.owner = ctx.people[owner]; }
      var sp = resolveSpecies(r.species); if (sp.err) o.errors.push(sp.err); else { o.data.speciesId = sp.id; o.data.customName = sp.custom || ''; }
      var cnt = str(r.count) === '' ? 1 : num(r.count); if (isNaN(cnt) || cnt % 1 !== 0 || cnt < 1) o.errors.push('count must be a whole number from 1 to ' + MT.trees.MAX_PER_POST + '.'); else if (cnt > MT.trees.MAX_PER_POST) o.errors.push('count is ' + cnt + ' — use several rows (maximum ' + MT.trees.MAX_PER_POST + ' per row).'); else o.data.count = cnt;
      var d = isoDate(r.planting_date); if (!d || !validDate(d)) o.errors.push('planting_date “' + str(r.planting_date) + '” is not a valid date (use 2026-07-15).'); else if (d > today()) o.errors.push('planting_date is in the future.'); else if (d < '1990-01-01') o.errors.push('planting_date is before 1990.'); else o.data.plantedOn = d;
      var la = num(r.latitude), ln = num(r.longitude);
      if (la == null || ln == null || isNaN(la) || isNaN(ln)) o.errors.push('latitude and longitude must both be numbers (e.g. 18.5204 and 73.8567).');
      else if (la < -90 || la > 90 || ln < -180 || ln > 180) o.errors.push('latitude must be between -90 and 90 and longitude between -180 and 180.');
      else if (la === 0 && ln === 0) o.errors.push('latitude/longitude 0, 0 is not a real location.');
      else { o.data.lat = la; o.data.lng = ln; if (la < 6 || la > 38 || ln < 68 || ln > 98) o.warnings.push('Coordinates are outside India — check that latitude and longitude are not swapped.'); else if (la > ln) o.warnings.push('Latitude is larger than longitude — are they swapped?'); if (city && MT.geo.distance(la, ln, city.lat, city.lng) / 1000 > city.r * 1.5) o.warnings.push('Location is far from ' + city.name + ' (your organisation’s city).'); }
      o.data.plotName = str(r.plot_name).slice(0, 80); if (str(r.plot_name).length > 80) o.warnings.push('plot_name was shortened to 80 characters.');
      o.data.notes = str(r.notes).slice(0, 500); if (str(r.notes).length > 500) o.warnings.push('notes were shortened to 500 characters.');
      if (!o.errors.length) { var k = [owner, o.data.speciesId, o.data.customName, o.data.plantedOn, o.data.lat, o.data.lng].join('|'); if (seen[k]) o.warnings.push('Looks like a duplicate of row ' + seen[k] + '.'); else seen[k] = r.__row; }
      return o;
    });
  }
  function vStudents(rows, ctx) {
    var me = ctx.me, multi = MT.auth.isSuper() || me.role === 'foundation', seen = {}, existing = {};
    (ctx.existing || []).forEach(function (u) { existing[[u.name, u.grade || '', u.roll || ''].join('|').toLowerCase()] = 1; });
    return rows.map(function (r) {
      var o = { n: r.__row, raw: r, errors: [], warnings: [], data: {} };
      var name = str(r.full_name); if (!name) o.errors.push('full_name is required.'); else if (name.length > 120) o.errors.push('full_name is longer than 120 characters.'); else o.data.name = name;
      var org = multi ? ctx.orgs[str(r.school_id).toUpperCase()] : (ctx.orgs[me.orgId] || ctx.org);
      if (multi && !str(r.school_id)) o.errors.push('school_id is required (e.g. MT-SCH-000001).'); else if (!org) o.errors.push('School/institution “' + str(r.school_id) + '” was not found beneath you.'); else if (org.type !== 'school' && org.type !== 'institution') o.errors.push(org.name + ' is not a school or institution.'); else if (org.status !== 'approved') o.errors.push(org.name + ' is not active.'); else o.data.org = org;
      o.data.grade = str(r.class_grade).slice(0, 60); o.data.roll = str(r.roll_number).slice(0, 30);
      var em = str(r.email); if (em && !MT.valid.email(em)) o.errors.push('email “' + em + '” does not look right.'); else o.data.email = em;
      var ph = str(r.phone); if (ph && !MT.valid.phone(ph)) o.warnings.push('phone “' + ph + '” looks unusual.'); o.data.phone = ph.slice(0, 30); o.data.guardian = str(r.guardian_contact).slice(0, 120);
      if (!o.errors.length) { var k = [name, o.data.grade, o.data.roll].join('|').toLowerCase(); if (existing[k]) o.warnings.push('Someone with the same name, class and roll already exists — a second account will be created.'); if (seen[k]) o.warnings.push('Same name, class and roll as row ' + seen[k] + '.'); else seen[k] = r.__row; }
      return o;
    });
  }
  function vOrgs(rows, ctx) {
    var me = ctx.me;
    return rows.map(function (r) {
      var o = { n: r.__row, raw: r, errors: [], warnings: [], data: {} };
      var t = str(r.org_type).toLowerCase(); if (['school', 'institution', 'foundation'].indexOf(t) < 0) o.errors.push('org_type must be school, institution or foundation.'); else o.data.type = t;
      var nm = str(r.org_name); if (!nm) o.errors.push('org_name is required.'); else o.data.name = nm.slice(0, 160);
      var city = str(r.city); if (!city) o.errors.push('city is required.'); else o.data.city = city;
      var st = str(r.state); if (!st) o.errors.push('state is required.'); else { o.data.state = st; if (MT.geoData.states.indexOf(st) < 0) o.warnings.push('State “' + st + '” is not in the standard list.'); }
      var cp = str(r.contact_person); if (!cp) o.errors.push('contact_person is required.'); else o.data.contactName = cp;
      var em = str(r.email); if (em && !MT.valid.email(em)) o.errors.push('email “' + em + '” does not look right.'); else o.data.email = em; o.data.phone = str(r.phone); o.data.regNo = str(r.registration_no);
      var pid = str(r.parent_org_id).toUpperCase();
      if (pid) { var p = ctx.orgs[pid]; if (!p) o.errors.push('parent_org_id “' + pid + '” was not found beneath you.'); else if (p.type !== 'foundation') o.errors.push(pid + ' is not a foundation.'); else o.data.parent = p; }
      else if (me.role === 'foundation') o.data.parent = ctx.orgs[me.orgId] || ctx.org; else o.data.parent = null;
      return o;
    });
  }
  function vUpdates(rows, ctx) {
    var ids = {}; rows.forEach(function (r) { var id = str(r.tree_id).toUpperCase(); if (id) ids[id] = 1; });
    var list = Object.keys(ids), trees = {}, i = 0;
    function worker() { if (i >= list.length) return Promise.resolve(); var id = list[i++]; return MT.db.get('trees', id).then(function (t) { if (t) trees[id] = t; }, function () {}).then(worker); }
    return Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]).then(function () {
      ctx.trees = trees; var me = ctx.me;
      return rows.map(function (r) {
        var o = { n: r.__row, raw: r, errors: [], warnings: [], data: {} }, id = str(r.tree_id).toUpperCase(), t = trees[id];
        if (!id) o.errors.push('tree_id is required.'); else if (!t) o.errors.push('Tree “' + id + '” was not found (or you cannot see it).'); else if (!(t.ownerId === me.userId || me.role === 'super_admin' || (MT.auth.isOrgAdmin() && (t.ancestorOrgIds || []).indexOf(me.orgId) > -1))) o.errors.push('You cannot post updates for ' + id + '.'); else o.data.tree = t;
        var d = isoDate(r.date); if (!d || !validDate(d)) o.errors.push('date “' + str(r.date) + '” is not a valid date.'); else if (d > today()) o.errors.push('date is in the future.'); else if (t && d < t.plantedOn) o.errors.push('date is before the tree was planted (' + t.plantedOn + ').'); else o.data.date = d;
        var h = healthKey(r.health); if (!h) o.errors.push('health must be Thriving, Healthy, Needs care, Struggling or Dead.'); else o.data.health = h;
        var ht = num(r.height_cm); if (isNaN(ht) || (ht != null && (ht < 0 || ht > 5000))) o.errors.push('height_cm must be a number between 0 and 5000.'); else { o.data.heightCm = ht; if (ht != null && t && t.heightCm && ht < t.heightCm * 0.5) o.warnings.push('Height is much smaller than the tree’s current ' + t.heightCm + ' cm.'); }
        var gi = num(r.girth_cm); if (isNaN(gi) || (gi != null && (gi < 0 || gi > 1000))) o.errors.push('girth_cm must be a number between 0 and 1000.'); else o.data.girthCm = gi;
        o.data.notes = str(r.notes).slice(0, 500); if (str(r.notes).length > 500) o.warnings.push('notes were shortened to 500 characters.');
        if (t && t.status === 'dead' && h && h !== 'dead') o.warnings.push('This tree is marked dead; the update will mark it alive again.');
        return o;
      });
    });
  }

  /* ---------- runners ---------- */
  function saveJob(type, summary, extra) {
    var me = MT.auth.profile(), id = MT.uid('j');
    var job = Object.assign({ type: type, createdBy: me.userId, createdByName: me.name, ancestorOrgIds: me.ancestorOrgIds || [], createdAt: Date.now(), total: summary.total, ok: summary.ok, failed: summary.failed, errors: (summary.errors || []).slice(0, 200) }, extra || {});
    return MT.db.set('importJobs', id, job).then(function () { return id; }, function () { return ''; });
  }
  function runTrees(ok, ctx, progress) {
    var me = ctx.me, byOwner = {}; ok.forEach(function (r) { var ow = r.data.owner || me; (byOwner[ow.userId] = byOwner[ow.userId] || { owner: ow, rows: [] }).rows.push(r); });
    var groups = []; Object.keys(byOwner).forEach(function (k) { // split each owner into batches of ≤ 300 trees
      var g = byOwner[k], cur = [], n = 0; g.rows.forEach(function (r) { if (n + r.data.count > 300 && cur.length) { groups.push({ owner: g.owner, rows: cur }); cur = []; n = 0; } cur.push(r); n += r.data.count; }); if (cur.length) groups.push({ owner: g.owner, rows: cur });
    });
    var total = ok.length, done = 0, planted = 0, codes = [], errors = [], year = new Date().getFullYear();
    return groups.reduce(function (p, g) {
      return p.then(function () {
        var count = g.rows.reduce(function (a, r) { return a + r.data.count; }, 0);
        return MT.db.nextId('TREE_' + year, count).then(function (first) {
          var idx = 0, b = MT.db.batch(), entries = [], onBehalf = g.owner.userId !== me.userId;
          g.rows.forEach(function (r) {
            var cs = []; for (var i = 0; i < r.data.count; i++) cs.push('TREE-' + year + '-' + MT.pad(first + idx++, 6));
            var made = MT.trees.build({ owner: g.owner, speciesId: r.data.speciesId, customName: r.data.customName, lat: r.data.lat, lng: r.data.lng, plantedOn: r.data.plantedOn, notes: r.data.notes, plotName: r.data.plotName }, cs);
            made.trees.forEach(function (t) { b.set('trees', t.code, MT.trees.stored(t)); entries.push({ tree: t, sign: 1 }); codes.push(t.code); }); if (made.plot) b.set('plots', made.plotId, made.plot);
          });
          MT.stats.apply(b, entries);
          if (onBehalf) MT.audit.add(b, { action: 'tree.bulk', targetType: 'tree', targetId: entries[0].tree.code, onBehalfOfId: g.owner.userId, onBehalfOfName: g.owner.name, detail: 'Bulk import: ' + count + ' trees', orgId: g.owner.orgId, ancestorOrgIds: g.owner.ancestorOrgIds });
          return b.commit().then(function () { planted += count; done += g.rows.length; progress(done, total, 'Planted ' + planted + ' trees'); });
        }).catch(function (e) { g.rows.forEach(function (r) { errors.push({ row: r.n, msg: MT.friendlyError(e) }); }); done += g.rows.length; progress(done, total); });
      });
    }, Promise.resolve()).then(function () {
      MT.due.invalidate(); var sum = { total: total, ok: total - errors.length, failed: errors.length, errors: errors, trees: planted };
      return saveJob('trees', sum, { treeCodes: codes.slice(0, 3000) }).then(function (id) { sum.jobId = id; return sum; });
    });
  }
  function runStudents(ok, ctx, progress) {
    var creds = [], errors = [], total = ok.length, i = 0;
    return ok.reduce(function (p, r) {
      return p.then(function () { return MT.accounts.createStudent({ org: r.data.org, name: r.data.name, grade: r.data.grade, roll: r.data.roll, email: r.data.email, phone: r.data.phone, guardian: r.data.guardian }).then(function (c) { creds.push(c); }, function (e) { errors.push({ row: r.n, msg: MT.friendlyError(e) }); }).then(function () { progress(++i, total, 'Created ' + creds.length + ' accounts'); }); });
    }, Promise.resolve()).then(function () { var sum = { total: total, ok: creds.length, failed: errors.length, errors: errors, creds: creds }; return saveJob('students', sum).then(function (id) { sum.jobId = id; return sum; }); });
  }
  function runOrgs(ok, ctx, progress) {
    var creds = [], errors = [], total = ok.length, i = 0;
    return ok.reduce(function (p, r) {
      return p.then(function () { return MT.accounts.createOrg(r.data).then(function (c) { creds.push(c); }, function (e) { errors.push({ row: r.n, msg: MT.friendlyError(e) }); }).then(function () { progress(++i, total, 'Created ' + creds.length + ' organisations'); }); });
    }, Promise.resolve()).then(function () { var sum = { total: total, ok: creds.length, failed: errors.length, errors: errors, creds: creds }; return saveJob('orgs', sum).then(function (id) { sum.jobId = id; return sum; }); });
  }
  function runUpdates(ok, ctx, progress) {
    var sorted = ok.slice().sort(function (a, b) { return a.data.date < b.data.date ? -1 : 1; }), errors = [], done = 0, posted = 0, total = sorted.length, touched = {};
    return sorted.reduce(function (p, r) {
      return p.then(function () { var t = r.data.tree; touched[t.code] = 1; return MT.updates.post({ tree: t, date: r.data.date, health: r.data.health, heightCm: r.data.heightCm == null ? '' : r.data.heightCm, girthCm: r.data.girthCm == null ? '' : r.data.girthCm, notes: r.data.notes, photos: [] }).then(function () { posted++; }, function (e) { errors.push({ row: r.n, msg: MT.friendlyError(e) }); }).then(function () { progress(++done, total, 'Posted ' + posted + ' updates'); }); });
    }, Promise.resolve()).then(function () { var sum = { total: total, ok: posted, failed: errors.length, errors: errors }; return saveJob('updates', sum, { treeCodes: Object.keys(touched).slice(0, 3000) }).then(function (id) { sum.jobId = id; return sum; }); });
  }
})();
