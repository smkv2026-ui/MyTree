/**
 * MyTree — #/admin/reports: sortable, filterable, paginated tables (Trees · Organisations · People · Updates) with CSV / Excel / PDF export,
 * and the branded Impact Report PDF (per organisation or the whole platform).
 */
(function () {
  'use strict';
  var MT = window.MT, h = MT.html, raw = MT.raw, ui = MT.ui;
  var MGR = ['super_admin', 'foundation', 'school', 'institution'], MAX = 5000;

  function pageAll(col, scope, progress) {
    if (scope.length) return MT.db.list(col, { where: scope, limit: MAX });
    var out = [];
    function next(after) { var q = { orderBy: ['__name__'], limit: 500 }; if (after !== undefined) q.after = after; return MT.db.list(col, q).then(function (r) { out = out.concat(r); if (progress) progress(out.length); if (r.length < 500 || out.length >= MAX) return out; return next(r[r.length - 1].id); }); }
    return next();
  }
  function orgName(map, id) { return (map[id] && map[id].name) || id || '—'; }

  var DATASETS = {
    trees: { label: 'Trees', col: 'trees', cols: function (O) { return [
      ['Tree ID', function (t) { return t.code; }], ['Species', function (t) { return MT.trees.nameOf(t); }], ['Scientific name', function (t) { return MT.species.get(t.speciesId).scientific; }], ['Planted on', function (t) { return t.plantedOn; }],
      ['Health', function (t) { return ui.healthLabel[t.health] || t.health; }], ['Status', function (t) { return t.status; }], ['City', function (t) { return t.city || ''; }], ['State', function (t) { return t.state || ''; }], ['Owner', function (t) { return t.ownerName || ''; }],
      ['Organisation', function (t) { return orgName(O, t.orgId) === '—' ? '' : orgName(O, t.orgId); }], ['Latitude', function (t) { return t.lat; }, 'num'], ['Longitude', function (t) { return t.lng; }, 'num'], ['Updates', function (t) { return t.updatesCount || 0; }, 'num'],
      ['Last update', function (t) { return t.lastUpdateAt ? MT.fmt.iso(new Date(t.lastUpdateAt)) : ''; }], ['CO₂ est. (kg)', function (t) { return Math.round(MT.trees.co2(t) * 10) / 10; }, 'num']]; },
      filters: function (t, f) { return (!f.state || t.state === f.state) && (!f.org || (t.ancestorOrgIds || []).indexOf(f.org) > -1) && (!f.health || t.health === f.health) && (!f.from || t.plantedOn >= f.from) && (!f.to || t.plantedOn <= f.to); } },
    orgs: { label: 'Organisations', col: 'orgs', cols: function (O, S) { return [
      ['ID', function (o) { return o.id; }], ['Name', function (o) { return o.name; }], ['Type', function (o) { return MT.ROLE_LABEL[o.type]; }], ['City', function (o) { return o.city; }], ['State', function (o) { return o.state; }], ['Status', function (o) { return o.status; }],
      ['Contact', function (o) { return o.contactName; }], ['Phone', function (o) { return o.phone; }], ['E-mail', function (o) { return o.email; }], ['Registered', function (o) { return MT.fmt.iso(new Date(o.createdAt)); }],
      ['Members', function (o) { return (S[o.id] || {}).members || 0; }, 'num'], ['Trees', function (o) { return (S[o.id] || {}).trees || 0; }, 'num'], ['Alive %', function (o) { var s = S[o.id] || {}; return s.trees ? Math.round((s.treesAlive || 0) / s.trees * 100) : ''; }, 'num']]; },
      filters: function (o, f) { return (!f.state || o.state === f.state) && (!f.org || (o.ancestorOrgIds || []).indexOf(f.org) > -1); } },
    people: { label: 'People', col: 'users', cols: function (O) { return [
      ['User ID', function (u) { return u.userId; }], ['Name', function (u) { return u.name; }], ['Role', function (u) { return MT.ROLE_LABEL[u.role] || u.role; }], ['Organisation', function (u) { return orgName(O, u.orgId) === '—' ? '' : orgName(O, u.orgId); }],
      ['Class', function (u) { return u.grade || ''; }], ['Roll', function (u) { return u.roll || ''; }], ['Status', function (u) { return u.active ? 'active' : (u.status || 'inactive'); }], ['Joined', function (u) { return MT.fmt.iso(new Date(u.createdAt)); }]]; },
      filters: function (u, f) { return u.status !== 'replaced' && u.role !== 'super_admin' && (!f.org || (u.ancestorOrgIds || []).indexOf(f.org) > -1); } },
    updates: { label: 'Growth updates', col: 'treeUpdates', cols: function () { return [
      ['Date', function (u) { return u.date; }], ['Tree', function (u) { return u.treeId; }], ['Health', function (u) { return ui.healthLabel[u.health] || u.health; }], ['Height (cm)', function (u) { return u.heightCm == null ? '' : u.heightCm; }, 'num'], ['Girth (cm)', function (u) { return u.girthCm == null ? '' : u.girthCm; }, 'num'],
      ['Notes', function (u) { return u.notes || ''; }], ['Posted by', function (u) { return u.postedByName || ''; }], ['On behalf of', function (u) { return u.onBehalfOfName || ''; }]]; },
      filters: function (u, f) { return (!f.org || (u.ancestorOrgIds || []).indexOf(f.org) > -1) && (!f.health || u.health === f.health) && (!f.from || u.date >= f.from) && (!f.to || u.date <= f.to); } }
  };

  function render() {
    var p = MT.auth.profile();
    return h`<div class="page reports-page" data-reveal><div class="page-head row"><div><h2>Reports</h2><p class="muted">Filter, sort and export. Up to ${MT.fmt.num(MAX)} rows are loaded per report.</p></div>
      <div class="btn-row tight"><button class="btn btn-gold" id="rp-impact">${ui.icon('file-text')} Impact report (PDF)</button></div></div>
      <div class="toolbar card"><div class="tb-row"><select id="rp-set" aria-label="Report">${Object.keys(DATASETS).map(function (k) { return h`<option value="${k}">${DATASETS[k].label}</option>`; })}</select><input type="search" id="rp-q" placeholder="Search…" aria-label="Search"><select id="rp-org" aria-label="Organisation"><option value="">All organisations</option></select><select id="rp-state" aria-label="State"><option value="">All states</option></select><select id="rp-health" aria-label="Health"><option value="">Any health</option>${MT.trees.HEALTHS.map(function (x) { return h`<option value="${x}">${ui.healthLabel[x]}</option>`; })}</select>
        <label class="inline-date">From <input type="date" id="rp-from"></label><label class="inline-date">To <input type="date" id="rp-to"></label></div>
        <div class="tb-row"><span class="fine" id="rp-count">Loading…</span><span class="grow"></span><button class="btn btn-soft btn-sm" data-exp="csv">${ui.icon('file-text')} CSV</button><button class="btn btn-soft btn-sm" data-exp="xlsx">${ui.icon('file-spreadsheet')} Excel</button><button class="btn btn-soft btn-sm" data-exp="pdf">${ui.icon('file-down')} PDF</button></div></div>
      <div class="card table-wrap" id="rp-body">${ui.skeleton(5, 'sk-line')}</div><div class="pager" id="rp-pager"></div></div>`;
  }

  function after(host) {
    var p = MT.auth.profile(), S = { set: 'trees', raw: [], orgs: {}, stats: {}, sort: null, dir: 1, page: 0, per: 25 }, body = MT.$('#rp-body', host), destroyed = false, loadTok = 0;
    var scopeFor = function (col) { if (p.role === 'super_admin') return []; return [['ancestorOrgIds', 'array-contains', p.orgId]]; };
    function initLookups() {
      return Promise.all([p.role === 'super_admin' ? MT.db.list('orgs', { limit: 2000 }) : MT.db.list('orgs', { where: scopeFor(), limit: 2000 }), MT.db.list('stats', { where: [['kind', '==', 'org']] }).catch(function () { return []; })]).then(function (r) {
        r[0].forEach(function (o) { S.orgs[o.id] = o; }); var s = MT.auth.session().org; if (s) S.orgs[s.id] = s; r[1].forEach(function (x) { S.stats[x.id.replace(/^org_/, '')] = x; });
        MT.$('#rp-org', host).innerHTML = '<option value="">All organisations</option>' + Object.keys(S.orgs).sort(function (a, b) { return S.orgs[a].name.localeCompare(S.orgs[b].name); }).map(function (id) { return '<option value="' + MT.esc(id) + '">' + MT.esc(S.orgs[id].name) + '</option>'; }).join('');
        MT.$('#rp-state', host).innerHTML = '<option value="">All states</option>' + MT.geoData.states.map(function (x) { return '<option>' + MT.esc(x) + '</option>'; }).join('');
      });
    }
    function load() {
      var tok = ++loadTok, d = DATASETS[S.set]; body.innerHTML = ui.skeleton(5, 'sk-line').s; MT.$('#rp-count', host).textContent = 'Loading…';
      var sc = S.set === 'orgs' ? Promise.resolve(Object.keys(S.orgs).map(function (k) { return Object.assign({ id: k }, S.orgs[k]); })) : pageAll(d.col, scopeFor(), function (n) { MT.$('#rp-count', host).textContent = 'Loading… ' + n; });
      return sc.then(function (rows) { if (destroyed || tok !== loadTok) return; S.raw = rows; S.sort = null; S.page = 0; draw(); }).catch(function (e) { body.innerHTML = ui.empty({ title: 'Could not load this report', text: MT.friendlyError(e) }).s; });
    }
    function filt() { return { state: MT.$('#rp-state', host).value, org: MT.$('#rp-org', host).value, health: MT.$('#rp-health', host).value, from: MT.$('#rp-from', host).value, to: MT.$('#rp-to', host).value, q: MT.$('#rp-q', host).value.trim().toLowerCase() }; }
    function view() {
      var d = DATASETS[S.set], cols = d.cols(S.orgs, S.stats), f = filt();
      var rows = S.raw.filter(function (r) { if (!d.filters(r, f)) return false; if (!f.q) return true; return cols.some(function (c) { return String(c[1](r)).toLowerCase().indexOf(f.q) > -1; }); });
      if (S.sort != null) { var c = cols[S.sort], num = c[2] === 'num'; rows = rows.map(function (r) { return [c[1](r), r]; }).sort(function (a, b) { var x = a[0], y = b[0]; if (num) { x = +x || 0; y = +y || 0; } return (x < y ? -1 : x > y ? 1 : 0) * S.dir; }).map(function (x) { return x[1]; }); }
      return { cols: cols, rows: rows };
    }
    function draw() {
      if (destroyed) return; var v = view(), pages = Math.max(1, Math.ceil(v.rows.length / S.per)); if (S.page >= pages) S.page = pages - 1;
      MT.$('#rp-count', host).textContent = MT.fmt.num(v.rows.length) + ' row' + (v.rows.length === 1 ? '' : 's') + (S.raw.length >= MAX ? ' (limit reached — narrow the scope)' : '');
      var slice = v.rows.slice(S.page * S.per, (S.page + 1) * S.per);
      body.innerHTML = v.rows.length ? '<table class="table rp-table"><thead><tr>' + v.cols.map(function (c, i) { return '<th><button type="button" class="th-btn" data-col="' + i + '" aria-label="Sort by ' + MT.esc(c[0]) + '">' + MT.esc(c[0]) + (S.sort === i ? (S.dir > 0 ? ' ▲' : ' ▼') : '') + '</button></th>'; }).join('') + '</tr></thead><tbody>' + slice.map(function (r) { return '<tr>' + v.cols.map(function (c) { return '<td' + (c[2] === 'num' ? ' class="num"' : '') + '>' + MT.esc(c[1](r)) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>' : ui.empty({ title: 'No rows', text: 'Nothing matches these filters.' }).s;
      MT.$('#rp-pager', host).innerHTML = pages > 1 ? '<button class="btn btn-soft btn-sm" data-pg="-1" ' + (S.page ? '' : 'disabled') + '>Previous</button><span>Page ' + (S.page + 1) + ' of ' + pages + '</span><button class="btn btn-soft btn-sm" data-pg="1" ' + (S.page < pages - 1 ? '' : 'disabled') + '>Next</button><select id="rp-per" aria-label="Rows per page">' + [25, 50, 100].map(function (n) { return '<option' + (n === S.per ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select>' : '';
    }
    host.addEventListener('click', function (e) {
      var c = e.target.closest('[data-col]'); if (c) { var i = +c.dataset.col; if (S.sort === i) S.dir = -S.dir; else { S.sort = i; S.dir = 1; } draw(); return; }
      var pg = e.target.closest('[data-pg]'); if (pg) { S.page += +pg.dataset.pg; draw(); return; }
      var ex = e.target.closest('[data-exp]'); if (ex) exportAs(ex.dataset.exp);
    });
    host.addEventListener('change', function (e) { if (e.target.id === 'rp-per') { S.per = +e.target.value; S.page = 0; draw(); } });
    MT.$('#rp-set', host).addEventListener('change', function (e) { S.set = e.target.value; load(); });
    ['#rp-q', '#rp-org', '#rp-state', '#rp-health', '#rp-from', '#rp-to'].forEach(function (s) { MT.$(s, host).addEventListener('input', MT.debounce(function () { S.page = 0; draw(); }, 200)); });
    function exportAs(kind) {
      var v = view(), name = 'mytree-' + S.set + '-' + MT.fmt.iso(new Date()), head = v.cols.map(function (c) { return c[0]; }), data = v.rows.map(function (r) { return v.cols.map(function (c) { return c[1](r); }); });
      if (!data.length) return ui.toast('Nothing to export.', { type: 'warn' });
      if (kind === 'csv') { MT.download(name + '.csv', MT.csv([head].concat(data)), 'text/csv'); return; }
      if (kind === 'xlsx') { MT.loader.load('exceljs').then(function () { var wb = new ExcelJS.Workbook(), ws = wb.addWorksheet(DATASETS[S.set].label); ws.addRow(head); data.forEach(function (r) { ws.addRow(r); }); ws.getRow(1).eachCell(function (c) { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F3D2E' } }; }); ws.views = [{ state: 'frozen', ySplit: 1 }]; ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: head.length } }; ws.columns.forEach(function (c, i) { c.width = Math.min(40, Math.max(12, String(head[i]).length + 4)); }); return wb.xlsx.writeBuffer(); }).then(function (buf) { MT.download(name + '.xlsx', new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })); }).catch(ui.error); return; }
      MT.loader.load('autotable').then(function () {
        var T = function (x) { return String(x).replace(/₂/g, '2'); }; head = head.map(T); data = data.map(function (r) { return r.map(T); });
        var doc = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        doc.setFillColor(15, 61, 46); doc.rect(0, 0, 297, 16, 'F'); doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text('MyTree — ' + DATASETS[S.set].label + ' report', 10, 10.5); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.text(MT.fmt.date(new Date()) + ' · ' + v.rows.length + ' rows', 287, 10.5, { align: 'right' });
        doc.autoTable({ head: [head], body: data.slice(0, 2000), startY: 20, styles: { fontSize: 6.5, cellPadding: 1.2 }, headStyles: { fillColor: [35, 125, 73] }, alternateRowStyles: { fillColor: [246, 250, 247] }, didDrawPage: function (d) { doc.setFontSize(7); doc.setTextColor(120); doc.text('Page ' + doc.internal.getNumberOfPages(), 287, 205, { align: 'right' }); } });
        MT.download(name + '.pdf', doc.output('blob'), 'application/pdf'); if (data.length > 2000) ui.toast('The PDF holds the first 2,000 rows; use CSV or Excel for everything.', { duration: 6000 });
      }).catch(ui.error);
    }
    MT.$('#rp-impact', host).addEventListener('click', function () {
      var ids = Object.keys(S.orgs).sort(function (a, b) { return S.orgs[a].name.localeCompare(S.orgs[b].name); });
      var b = document.createElement('div'); b.innerHTML = '<div class="field"><label for="ip-org">Report for</label><select id="ip-org">' + (p.role === 'super_admin' ? '<option value="">Whole platform</option>' : '') + ids.map(function (id) { return '<option value="' + MT.esc(id) + '"' + (id === p.orgId ? ' selected' : '') + '>' + MT.esc(S.orgs[id].name) + '</option>'; }).join('') + '</select></div>';
      ui.modal({ title: 'Impact report', body: b, actions: [{ label: 'Cancel', value: false }, { label: 'Create PDF', kind: 'primary', value: true, onClick: function (d) { d._org = d.querySelector('#ip-org').value; MT.reports._org = d._org; } }] }).then(function (ok) {
        if (!ok) return; var t = ui.toast('Preparing the report…', { duration: 0 });
        MT.reports.impactPdf(MT.reports._org || null).then(function (blob) { MT.download('mytree-impact-report.pdf', blob, 'application/pdf'); ui.success('Report ready.'); }).catch(ui.error).then(function () { t.close(); });
      });
    });
    initLookups().then(load).catch(function (e) { body.innerHTML = ui.empty({ title: 'Could not load', text: MT.friendlyError(e) }).s; });
    return function () { destroyed = true; };
  }

  /* =============== Impact report PDF =============== */
  MT.reports = {
    /** @param {string|null} orgId null = whole platform (super admin) @returns {Promise<Blob>} */
    impactPdf: function (orgId) {
      var key = orgId ? 'org_' + orgId : 'global';
      return Promise.all([MT.loader.load('jspdf'), MT.loader.load('autotable'), MT.loader.load('chart'), MT.db.get('stats', key), MT.db.list('orgs', orgId ? { where: [['ancestorOrgIds', 'array-contains', orgId]], limit: 500 } : { limit: 1000 }), MT.db.list('stats', { where: [['kind', '==', 'org']] }).catch(function () { return []; }), orgId ? MT.db.list('trees', { where: [['ancestorOrgIds', 'array-contains', orgId]], orderBy: ['createdAt', 'desc'], limit: 2000 }) : MT.db.get('stats', 'species'), MT.db.list('stats', { where: [['kind', '==', 'month']] }).catch(function () { return []; })]).then(function (r) {
        var st = r[3] || {}, orgs = r[4], os = {}; r[5].forEach(function (x) { os[x.id.replace(/^org_/, '')] = x; });
        var name = orgId ? (orgs.filter(function (o) { return o.id === orgId; })[0] || MT.auth.session().org || { name: orgId }).name : 'All organisations on MyTree';
        var species = {}; if (orgId) r[6].forEach(function (t) { if (t.status !== 'dead') species[t.speciesId] = (species[t.speciesId] || 0) + 1; }); else Object.keys(r[6] || {}).forEach(function (k) { if (k !== 'id' && k !== 'kind' && r[6][k] > 0) species[k] = r[6][k]; });
        var months = {}; if (!orgId) r[7].forEach(function (m) { months[m.id.replace('month_', '')] = m.trees || 0; }); else r[6].forEach(function (t) { var k = t.plantedOn.slice(0, 7); months[k] = (months[k] || 0) + 1; });
        var today = Math.floor(Date.now() / 86400000), ty = Math.max(0, ((st.treesAlive || 0) * today - (st.sumPlantedDayAlive || 0)) / 365.25), co2 = Math.round(ty * MT.species.AVG_CO2_PER_TREE_YEAR);
        // chart image (offscreen)
        var mk = Object.keys(months).sort().slice(-12), cv = document.createElement('canvas'); cv.width = 900; cv.height = 360; var th = MT.charts.theme(); var cfg = MT.charts.bar(th, { labels: mk.map(function (k) { return MT.fmt.date(k + '-01', { month: 'short', year: '2-digit' }); }), data: mk.map(function (k) { return months[k]; }) }); cfg.options.animation = false; cfg.options.responsive = false; cfg.options.devicePixelRatio = 1;
        var img = ''; if (mk.length) { var ch = new Chart(cv, cfg); img = cv.toDataURL('image/png'); ch.destroy(); }
        var doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' }), W = 210;
        doc.setFillColor(15, 61, 46); doc.rect(0, 0, W, 38, 'F'); doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.text('MyTree', 14, 18); doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.text('Maitree — friendship with nature', 14, 25); doc.setFontSize(9); doc.text('Impact report · ' + MT.fmt.date(new Date()), W - 14, 18, { align: 'right' });
        doc.setTextColor(15, 61, 46); doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.text(String(name).slice(0, 60), 14, 52);
        var kp = [['Trees planted', MT.fmt.num(st.trees || 0)], ['Alive', (st.trees ? Math.round((st.treesAlive || 0) / st.trees * 100) : 0) + '%'], ['CO2 absorbed (est.)', MT.fmt.num(co2 / 1000, 1) + ' t'], ['O2 produced (est.)', MT.fmt.num(MT.species.o2FromCo2(co2) / 1000, 1) + ' t'], [orgId ? 'Members' : 'Users', MT.fmt.num(orgId ? st.members || 0 : st.users || 0)], ['Growth updates', MT.fmt.num(st.updates || 0)]];
        kp.forEach(function (k, i) { var x = 14 + (i % 3) * 62, y = 60 + Math.floor(i / 3) * 24; doc.setFillColor(217, 243, 227); doc.roundedRect(x, y, 58, 20, 3, 3, 'F'); doc.setTextColor(15, 61, 46); doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text(String(k[1]), x + 4, y + 10); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(60, 80, 70); doc.text(k[0], x + 4, y + 16); });
        var y = 112; doc.setTextColor(15, 61, 46); doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text('Trees planted per month', 14, y); if (img) doc.addImage(img, 'PNG', 14, y + 3, 182, 72); y += 82;
        var H = ['thriving', 'healthy', 'needs_care', 'struggling', 'dead'];
        doc.autoTable({ startY: y, head: [['Health', 'Trees', 'Share']], body: H.map(function (x) { var n = st['h_' + x] || 0; return [ui.healthLabel[x], MT.fmt.num(n), st.trees ? Math.round(n / st.trees * 100) + '%' : '—']; }), theme: 'striped', headStyles: { fillColor: [35, 125, 73] }, styles: { fontSize: 9 }, margin: { left: 14, right: 110 } });
        var tops = Object.keys(species).sort(function (a, b) { return species[b] - species[a]; }).slice(0, 6);
        doc.autoTable({ startY: y, head: [['Top species', 'Live trees']], body: tops.map(function (k) { return [MT.species.get(k).common, MT.fmt.num(species[k])]; }), theme: 'striped', headStyles: { fillColor: [35, 125, 73] }, styles: { fontSize: 9 }, margin: { left: 110, right: 14 } });
        doc.addPage(); doc.setTextColor(15, 61, 46); doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.text(orgId ? 'Organisations in this report' : 'Leading organisations', 14, 20);
        var list = orgs.filter(function (o) { return o.type !== 'foundation' || orgId; }).map(function (o) { var s = os[o.id] || {}; return [o.name, MT.ROLE_LABEL[o.type], o.city, s.members || 0, s.trees || 0, s.trees ? Math.round((s.treesAlive || 0) / s.trees * 100) + '%' : '—']; }).sort(function (a, b) { return b[4] - a[4]; }).slice(0, 25);
        doc.autoTable({ startY: 25, head: [['Organisation', 'Type', 'City', 'Members', 'Trees', 'Alive']], body: list, theme: 'striped', headStyles: { fillColor: [35, 125, 73] }, styles: { fontSize: 9 } });
        var ny = doc.lastAutoTable.finalY + 12; doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(15, 61, 46); doc.text('How the estimates are made', 14, ny); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(60, 80, 70);
        doc.text(doc.splitTextToSize('CO2 and O2 figures are estimates, not measurements. Tree-years are derived from planting dates of live trees; the platform average of ' + MT.species.AVG_CO2_PER_TREE_YEAR + ' kg CO2 per tree-year is applied (per-species factors and age ramps are listed in the species master list). O2 = CO2 x 32/44. Survival is live trees ÷ trees planted. Counts come from MyTree’s running counters and are recomputed by the administrator’s “Rebuild statistics” tool.', W - 28), 14, ny + 6);
        var pages = doc.internal.getNumberOfPages(); for (var i = 1; i <= pages; i++) { doc.setPage(i); doc.setFontSize(7); doc.setTextColor(130); doc.text('MyTree · Maitree — friendship with nature · page ' + i + ' of ' + pages, W / 2, 290, { align: 'center' }); }
        return doc.output('blob');
      });
    }
  };

  MT.router.add('/admin/reports', { title: 'Reports', layout: 'app', access: MGR, render: render, after: after });
})();
