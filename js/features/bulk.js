/**
 * MyTree — #/bulk: choose what to import → download template → drop file → validated preview → import → result.
 */
(function () {
  'use strict';
  var MT = window.MT, h = MT.html, raw = MT.raw, ui = MT.ui;
  var PREVIEW_COLS = {
    trees: [['owner_user_id', 'Owner'], ['species', 'Species'], ['count', 'No.'], ['planting_date', 'Date'], ['latitude', 'Lat'], ['longitude', 'Lng']],
    students: [['school_id', 'School'], ['full_name', 'Name'], ['class_grade', 'Class'], ['roll_number', 'Roll']],
    orgs: [['org_type', 'Type'], ['org_name', 'Name'], ['city', 'City'], ['contact_person', 'Contact']],
    updates: [['tree_id', 'Tree'], ['date', 'Date'], ['health', 'Health'], ['height_cm', 'Height']]
  };

  function render() {
    var role = MT.auth.role(), types = MT.bulk.typesFor(role);
    return h`<div class="page bulk-page" data-reveal><div class="page-head"><h2>Bulk upload</h2><p class="muted">Add many things at once from an Excel or CSV file. Everything is checked and explained <strong>before</strong> anything is saved.</p></div>
      <div id="bk-body"><div class="type-grid">${types.map(function (k) { var t = MT.bulk.TYPES[k]; return h`<button type="button" class="type-card card-lift bk-type" data-type="${k}"><span class="role-ic">${ui.icon(t.icon)}</span><h3>${t.label}</h3><p>${t.blurb}</p><span class="type-go">Start ${ui.icon('arrow-right')}</span></button>`; })}</div></div></div>`;
  }

  function after(host, ctx) {
    var body = MT.$('#bk-body', host), S = { type: '', results: null, ctx: null, only: true };
    function stepper(n) { return '<ol class="stepper bk-steps">' + ['Template', 'Upload', 'Check', 'Import'].map(function (s, i) { return '<li class="' + (i < n ? 'done' : i === n ? 'current' : '') + '"><span class="st-dot">' + (i + 1) + '</span><span class="st-label">' + s + '</span></li>'; }).join('') + '</ol>'; }

    function pickType(type) {
      S.type = type; var def = MT.bulk.TYPES[type];
      body.innerHTML = '<a class="back-link" href="#/bulk" id="bk-back">' + ui.icon('arrow-left').s + ' Choose something else</a>' + stepper(0) + '<section class="card"><h3>' + MT.esc(def.label) + '</h3><p>' + MT.esc(def.blurb) + '</p>' +
        '<div class="bk-cols"><h4>Columns</h4><ul class="plain-list">' + MT.bulk.columns(type).map(function (c) { return '<li><code>' + MT.esc(c.key) + '</code> ' + (c.req ? '<span class="badge badge-bad">required</span>' : '<span class="badge">optional</span>') + '<small>' + MT.esc(c.hint) + '</small></li>'; }).join('') + '</ul></div>' +
        '<div class="btn-row"><button class="btn btn-primary" id="bk-tpl">' + ui.icon('file-spreadsheet').s + ' Download Excel template</button><button class="btn btn-ghost" id="bk-csv">CSV template</button></div></section>' +
        '<section class="card dropzone" id="bk-drop" tabindex="0"><div class="dz-in">' + ui.icon('upload-cloud').s + '<div><strong>Drop your filled file here</strong><p class="fine">.xlsx or .csv · up to 5,000 rows · nothing is saved until you confirm</p></div><label class="btn btn-soft">Choose file<input type="file" id="bk-file" accept=".xlsx,.csv,.txt" hidden></label></div><p class="fine" id="bk-msg" role="status"></p></section>';
      ui.icons();
      MT.$('#bk-back', body).addEventListener('click', function (e) { e.preventDefault(); MT.router.refresh(); });
      MT.$('#bk-tpl', body).addEventListener('click', function (e) { var b = e.currentTarget; b.disabled = true; MT.bulk.template(type).then(function (blob) { MT.download('mytree-' + type + '-template.xlsx', blob); ui.success('Template downloaded.'); }).catch(ui.error).then(function () { b.disabled = false; }); });
      MT.$('#bk-csv', body).addEventListener('click', function () { MT.download('mytree-' + type + '-template.csv', MT.bulk.templateCsv(type), 'text/csv'); });
      var dz = MT.$('#bk-drop', body);
      ['dragenter', 'dragover'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('over'); }); });
      ['dragleave', 'drop'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('over'); }); });
      dz.addEventListener('drop', function (e) { if (e.dataTransfer.files[0]) load(e.dataTransfer.files[0]); });
      MT.$('#bk-file', body).addEventListener('change', function (e) { if (e.target.files[0]) load(e.target.files[0]); });
    }

    function load(file) {
      var msg = MT.$('#bk-msg', body); msg.textContent = 'Reading ' + file.name + '…';
      MT.bulk.parseFile(file).then(function (parsed) {
        if (!parsed.rows.length) throw MT.userError('No data rows found. Fill in rows under the header (rows marked EXAMPLE are ignored).');
        if (parsed.rows.length > 5000) throw MT.userError('That file has ' + parsed.rows.length + ' rows — please split it into files of up to 5,000.');
        var need = MT.bulk.columns(S.type).filter(function (c) { return c.req; }).map(function (c) { return c.key; }).filter(function (k) { return parsed.headers.indexOf(k) < 0; });
        if (need.length) throw MT.userError('Missing column' + (need.length > 1 ? 's' : '') + ': ' + need.join(', ') + '. Please start from the template so the headers match.');
        msg.textContent = 'Checking ' + parsed.rows.length + ' rows…';
        return MT.bulk.prepare(S.type).then(function (c) { S.ctx = c; return MT.bulk.validate(S.type, parsed.rows, c); }).then(function (res) { S.results = res; S.file = file.name; preview(); });
      }).catch(function (e) { msg.textContent = ''; ui.error(e); });
    }

    function preview() {
      var R = S.results, bad = R.filter(function (r) { return r.errors.length; }).length, warn = R.filter(function (r) { return !r.errors.length && r.warnings.length; }).length, okN = R.length - bad, cols = PREVIEW_COLS[S.type], showAll = !!S.showAll;
      var units = S.type === 'trees' ? R.filter(function (r) { return !r.errors.length; }).reduce(function (a, r) { return a + r.data.count; }, 0) : okN;
      var rows = (showAll ? R : R.filter(function (r) { return r.errors.length || r.warnings.length; })).slice(0, 300);
      body.innerHTML = '<a class="back-link" href="#/bulk" id="bk-back">' + ui.icon('arrow-left').s + ' Start over</a>' + stepper(2) +
        '<section class="card"><h3>Check: ' + MT.esc(S.file) + '</h3><div class="sum-row"><div class="sum sum-ok"><strong>' + (okN - warn) + '</strong><span>ready</span></div><div class="sum sum-warn"><strong>' + warn + '</strong><span>with warnings (will import)</span></div><div class="sum sum-bad"><strong>' + bad + '</strong><span>with errors (skipped)</span></div></div>' +
        '<div class="btn-row"><button class="btn btn-primary btn-lg" id="bk-go" ' + (okN ? '' : 'disabled') + '>' + (okN ? 'Import ' + MT.fmt.num(okN) + ' valid row' + (okN > 1 ? 's' : '') + (S.type === 'trees' ? ' (' + MT.fmt.num(units) + ' trees)' : '') : 'Nothing to import') + '</button>' +
        (bad ? '<button class="btn btn-ghost" id="bk-err">Download error report</button>' : '') + '<label class="check inline"><input type="checkbox" id="bk-all"' + (showAll ? ' checked' : '') + '><span>Show all rows</span></label></div>' +
        (bad ? '<p class="fine">Fix the red rows in your file and upload again, or import the valid rows now and fix the rest later.</p>' : '') + '</section>' +
        '<div class="card table-wrap"><table class="table bk-table"><thead><tr><th>Row</th><th></th>' + cols.map(function (c) { return '<th>' + c[1] + '</th>'; }).join('') + '<th>What we found</th></tr></thead><tbody>' +
        (rows.length ? rows.map(function (r) { var st = r.errors.length ? 'bad' : r.warnings.length ? 'warn' : 'ok'; return '<tr class="bk-' + st + '"><td>' + r.n + '</td><td>' + { bad: '✖', warn: '⚠', ok: '✔' }[st] + '</td>' + cols.map(function (c) { return '<td>' + MT.esc(String(r.raw[c[0]] == null ? '' : r.raw[c[0]]).slice(0, 40)) + '</td>'; }).join('') + '<td>' + MT.esc(r.errors.concat(r.warnings).join(' ')) + '</td></tr>'; }).join('') : '<tr><td colspan="' + (cols.length + 3) + '" class="muted center">All rows are fine. 🌿</td></tr>') + '</tbody></table>' + (R.length > 300 ? '<p class="fine pad">Showing the first 300 rows.</p>' : '') + '</div>';
      MT.$('#bk-back', body).addEventListener('click', function (e) { e.preventDefault(); MT.router.refresh(); });
      MT.$('#bk-all', body).addEventListener('change', function (e) { S.showAll = e.target.checked; preview(); });
      var eb = MT.$('#bk-err', body); if (eb) eb.addEventListener('click', function () { MT.download('mytree-error-report.csv', MT.bulk.errorReportCsv(R), 'text/csv'); });
      MT.$('#bk-go', body).addEventListener('click', function () { if (okN) go(); });
    }

    function go() {
      body.innerHTML = stepper(3) + '<section class="card"><h3>Importing…</h3><div class="progress big"><span id="bk-bar" style="width:0%"></span></div><p id="bk-prog" role="status">Starting…</p><p class="fine">Please keep this tab open. Large imports are saved in safe chunks and retried if the connection drops.</p></section>';
      var bar = MT.$('#bk-bar', body), prog = MT.$('#bk-prog', body);
      MT.bulk.run(S.type, S.results, S.ctx, function (d, t, label) { bar.style.width = Math.round(d / Math.max(1, t) * 100) + '%'; prog.textContent = d + ' of ' + t + ' rows' + (label ? ' · ' + label : ''); }).then(done).catch(function (e) { ui.error(e); preview(); });
    }

    function done(sum) {
      var skipped = S.results.length - S.results.filter(function (r) { return !r.errors.length; }).length, failed = sum.failed;
      var allErr = S.results.filter(function (r) { return r.errors.length; }).map(function (r) { return r; }).concat(sum.errors.map(function (e) { return { n: e.row, errors: [e.msg], warnings: [] }; }));
      MT.shell.refreshBadges();
      body.innerHTML = '<section class="card result"><div class="success-anim" id="bk-anim" aria-hidden="true"></div><h2>' + (sum.ok ? 'Import finished' : 'Nothing was imported') + '</h2>' +
        '<div class="sum-row"><div class="sum sum-ok"><strong>' + sum.ok + '</strong><span>imported</span></div><div class="sum sum-bad"><strong>' + (failed + skipped) + '</strong><span>not imported</span></div>' + (sum.trees ? '<div class="sum"><strong>' + MT.fmt.num(sum.trees) + '</strong><span>trees created</span></div>' : '') + '</div>' +
        '<div class="btn-row center-row">' + (S.type === 'trees' && sum.ok ? '<a class="btn btn-primary" href="#/updates?job=' + encodeURIComponent(sum.jobId || '') + '">' + ui.icon('clipboard-check').s + ' Post updates for these trees</a><a class="btn btn-soft" href="#/trees">View trees</a>' : '') +
        (S.type === 'students' && sum.creds && sum.creds.length ? '<button class="btn btn-primary" id="bk-cred">' + ui.icon('file-down').s + ' Credentials sheet (PDF / CSV)</button><a class="btn btn-soft" href="#/people">View people</a>' : '') +
        (S.type === 'orgs' && sum.creds && sum.creds.length ? '<button class="btn btn-primary" id="bk-cred">' + ui.icon('file-down').s + ' Admin credentials (PDF / CSV)</button><a class="btn btn-soft" href="#/orgs">View organisations</a>' : '') +
        (S.type === 'updates' && sum.ok ? '<a class="btn btn-primary" href="#/updates?job=' + encodeURIComponent(sum.jobId || '') + '">Add photos to these trees</a>' : '') +
        (allErr.length ? '<button class="btn btn-ghost" id="bk-err2">Download error report</button>' : '') + '<a class="btn btn-ghost" href="#/bulk">Import another file</a></div></section>';
      ui.icons(); ui.lottie(MT.$('#bk-anim', body), 'success'); if (sum.ok) ui.confetti({ particleCount: 70 });
      var cr = MT.$('#bk-cred', body); if (cr) { cr.addEventListener('click', function () { MT.credentials.show(sum.creds, { title: 'Sign-in details for ' + sum.creds.length }); }); MT.credentials.show(sum.creds, { title: 'Sign-in details for ' + sum.creds.length }); }
      var e2 = MT.$('#bk-err2', body); if (e2) e2.addEventListener('click', function () { MT.download('mytree-error-report.csv', MT.bulk.errorReportCsv(allErr), 'text/csv'); });
    }

    body.addEventListener('click', function (e) { var t = e.target.closest('.bk-type'); if (t) pickType(t.dataset.type); });
    if (ctx.query.type && MT.bulk.typesFor(MT.auth.role()).indexOf(ctx.query.type) > -1) pickType(ctx.query.type);
  }

  MT.router.add('/bulk', { title: 'Bulk upload', layout: 'app', access: ['super_admin', 'foundation', 'school', 'institution', 'student', 'individual'], render: render, after: after });
})();
