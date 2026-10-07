/**
 * MyTree — credentials sheets: printable PDF (one card per person, with QR to the sign-in page), CSV, and the "shown once" result dialog.
 * Passwords exist only in the rows passed in here — they are never stored anywhere.
 */
(function () {
  'use strict';
  var MT = window.MT, ui = MT.ui, raw = MT.raw;
  function loginUrl() { return location.href.split('#')[0].split('?')[0] + '#/login'; }

  var C = (MT.credentials = {
    csv: function (rows) {
      return MT.csv([['Name', 'Class / grade', 'Roll', 'User ID', 'Password', 'Organisation', 'Sign in at']].concat(rows.map(function (r) { return [r.name, r.grade || '', r.roll || '', r.userId, r.password, r.orgName || '', loginUrl()]; })));
    },
    /** @returns {Promise<Blob>} A4 sheet, 2 × 4 cards per page. */
    pdf: function (rows, o) {
      o = o || {};
      return Promise.all([MT.loader.load('jspdf'), MT.qr.dataUrl(loginUrl(), 260)]).then(function (r) {
        var qr = r[1], doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' }), W = 95, H = 66, gx = 5, gy = 5, mx = 10, my = 12;
        rows.forEach(function (c, i) {
          var pos = i % 8; if (i > 0 && pos === 0) doc.addPage();
          var x = mx + (pos % 2) * (W + gx), y = my + Math.floor(pos / 2) * (H + gy);
          doc.setDrawColor(15, 61, 46); doc.setLineWidth(0.4); doc.roundedRect(x, y, W, H, 3, 3);
          doc.setFillColor(15, 61, 46); doc.roundedRect(x, y, W, 12, 3, 3, 'F'); doc.rect(x, y + 6, W, 6, 'F');
          doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text('MyTree', x + 4, y + 8);
          doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.text(String(c.orgName || o.orgName || '').slice(0, 44), x + W - 4, y + 8, { align: 'right' });
          doc.setTextColor(30, 40, 35); doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.text(String(c.name).slice(0, 30), x + 4, y + 19);
          doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(90, 100, 95);
          doc.text([c.grade ? 'Class ' + c.grade : '', c.roll ? 'Roll ' + c.roll : ''].filter(Boolean).join('  ·  '), x + 4, y + 24);
          doc.setFontSize(7.5); doc.text('USER ID', x + 4, y + 32); doc.text('PASSWORD', x + 4, y + 47);
          doc.setTextColor(15, 61, 46); doc.setFont('courier', 'bold'); doc.setFontSize(10.5); doc.text(c.userId, x + 4, y + 37); doc.setFontSize(12); doc.text(c.password, x + 4, y + 52);
          if (qr) doc.addImage(qr, 'PNG', x + W - 30, y + 28, 26, 26);
          doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(110, 120, 115);
          doc.text('Scan or open the link to sign in. Keep this card private.', x + 4, y + 60); doc.text(loginUrl().slice(0, 70), x + 4, y + 63.2);
        });
        return doc.output('blob');
      });
    },
    /** Dialog shown once after creating / re-issuing: copy buttons + sheet downloads. */
    show: function (rows, o) {
      o = o || {}; rows = [].concat(rows);
      var body = document.createElement('div');
      body.innerHTML = '<p class="muted">' + MT.esc(o.intro || 'Share these sign-in details privately. For safety the passwords are shown only now and are not saved anywhere.') + '</p>' +
        '<div class="cred-list">' + rows.slice(0, 50).map(function (c) {
          return '<div class="cred"><div><strong>' + MT.esc(c.name) + '</strong><small>' + MT.esc([c.grade && 'Class ' + c.grade, c.roll && 'Roll ' + c.roll, c.orgName].filter(Boolean).join(' · ')) + '</small></div>' +
            '<div class="cred-vals"><span><small>User ID</small><code>' + MT.esc(c.userId) + '</code></span><span><small>Password</small><code>' + MT.esc(c.password) + '</code></span>' +
            '<button type="button" class="btn btn-soft btn-sm" data-copy="User ID: ' + MT.esc(c.userId) + '\nPassword: ' + MT.esc(c.password) + '">Copy</button></div></div>';
        }).join('') + (rows.length > 50 ? '<p class="fine">…and ' + (rows.length - 50) + ' more in the downloads.</p>' : '') + '</div>' +
        '<div class="btn-row"><button type="button" class="btn btn-primary" id="cr-pdf">' + ui.icon('file-down').s + ' Printable PDF</button><button type="button" class="btn btn-soft" id="cr-csv">' + ui.icon('table').s + ' CSV</button><button type="button" class="btn btn-ghost" id="cr-copy">Copy all</button></div><p class="fine" id="cr-msg" role="status"></p>';
      body.querySelector('#cr-csv').addEventListener('click', function () { MT.download('mytree-credentials.csv', C.csv(rows), 'text/csv'); });
      body.querySelector('#cr-copy').addEventListener('click', function () { MT.copy(rows.map(function (c) { return c.name + '\t' + c.userId + '\t' + c.password; }).join('\n')).then(function () { ui.success('Copied.'); }, function () { ui.toast('Could not copy automatically.', { type: 'warn' }); }); });
      body.querySelector('#cr-pdf').addEventListener('click', function () {
        var m = body.querySelector('#cr-msg'); m.textContent = 'Preparing PDF…';
        C.pdf(rows, o).then(function (b) { MT.download('mytree-credentials.pdf', b, 'application/pdf'); m.textContent = 'PDF ready — check your downloads.'; }).catch(function (e) { m.textContent = ''; ui.error(e); });
      });
      return ui.modal({ title: o.title || (rows.length > 1 ? 'Sign-in details for ' + rows.length + ' people' : 'Sign-in details'), body: body, wide: true, dismissible: true, actions: [{ label: 'Done', kind: 'primary', value: true }], onOpen: function () { ui.icons(); } });
    }
  });
})();
