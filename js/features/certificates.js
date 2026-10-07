/**
 * MyTree — PDF certificates (jsPDF): per tree and per milestone, each with a QR code to the public tree page / portal.
 */
(function () {
  'use strict';
  var MT = window.MT;
  function T(s) { return String(s == null ? '' : s).replace(/₂/g, '2'); }
  function frame(doc, W, H) {
    doc.setFillColor(251, 248, 241); doc.rect(0, 0, W, H, 'F');
    doc.setDrawColor(15, 61, 46); doc.setLineWidth(1.6); doc.rect(8, 8, W - 16, H - 16); doc.setDrawColor(201, 162, 39); doc.setLineWidth(0.5); doc.rect(11.5, 11.5, W - 23, H - 23);
    doc.setFillColor(15, 61, 46); doc.circle(W / 2, 30, 10, 'F'); doc.setFillColor(201, 162, 39); doc.circle(W / 2 - 2.4, 28.5, 2.6, 'F'); doc.circle(W / 2 + 2.4, 28.5, 2.6, 'F'); doc.setDrawColor(58, 194, 122); doc.setLineWidth(1.4); doc.line(W / 2, 41, W / 2, 34);
  }
  function center(doc, text, y, size, font, color) { doc.setFont('helvetica', font || 'normal'); doc.setFontSize(size); doc.setTextColor.apply(doc, color || [30, 40, 35]); doc.text(T(text), 148.5, y, { align: 'center' }); }
  var C = (MT.certificates = {
    /** Certificate of Planting for one tree. @returns {Promise<void>} downloads the PDF */
    tree: function (t) {
      return Promise.all([MT.loader.load('jspdf'), MT.qr.dataUrl(MT.trees.url(t.code), 300)]).then(function (r) {
        var doc = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' }), W = 297, H = 210, sp = MT.species.get(t.speciesId);
        frame(doc, W, H);
        center(doc, 'CERTIFICATE OF PLANTING', 62, 28, 'bold', [15, 61, 46]); center(doc, 'This certifies that a tree has been planted and is being cared for', 72, 12, 'normal', [90, 100, 95]);
        center(doc, MT.trees.nameOf(t), 94, 30, 'bold', [35, 125, 73]); if (sp.scientific) center(doc, sp.scientific, 102, 13, 'italic', [90, 100, 95]);
        center(doc, 'planted by ' + (t.ownerName || 'a MyTree member') + ' on ' + MT.fmt.date(t.plantedOn) + (t.city ? ' in ' + t.city : ''), 116, 14, 'normal');
        if (t.dedication) center(doc, '“' + t.dedication + '”', 128, 13, 'italic', [90, 62, 43]);
        center(doc, 'Tree ID  ' + t.code, 146, 13, 'bold', [15, 61, 46]);
        if (r[1]) doc.addImage(r[1], 'PNG', 40, 148, 34, 34);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(110, 120, 115); doc.text('Scan to meet this tree', 57, 186, { align: 'center' });
        center(doc, 'MyTree · Maitree — friendship with nature', 188, 11, 'normal', [90, 100, 95]);
        doc.setDrawColor(15, 61, 46); doc.setLineWidth(0.3); doc.line(205, 168, 262, 168); doc.setFontSize(8); doc.text('MyTree', 233.5, 173, { align: 'center' });
        MT.download('certificate-' + t.code + '.pdf', doc.output('blob'), 'application/pdf');
      });
    },

    /** "A tree in your name" gift card (A5 landscape) with a QR to the tree's public page. Opens a small form first. */
    giftForm: function (t) {
      var ui = MT.ui, p = MT.auth.profile(), b = document.createElement('div'), dlg;
      b.innerHTML = '<form class="form" novalidate><div class="form-grid"><div class="field field-wide"><label for="g-to">Gift for</label><input id="g-to" name="to" maxlength="60" placeholder="e.g. Aunt Meera" required></div>' +
        '<div class="field field-wide"><label for="g-msg">Your message</label><textarea id="g-msg" name="msg" rows="3" maxlength="160" placeholder="Happy birthday! May this tree grow as tall as your dreams."></textarea></div>' +
        '<div class="field field-wide"><label for="g-from">From</label><input id="g-from" name="from" maxlength="60" value="' + MT.esc(p.name || '') + '"></div></div>' +
        (t.public ? '' : '<p class="fine">This tree is private, so the QR code will only open for you. Make the tree public if you want the recipient to see its page.</p>') +
        '<p class="field-err" id="g-err" role="alert"></p><div class="btn-row"><button type="button" class="btn btn-ghost" data-cancel>Cancel</button><button class="btn btn-primary" type="submit">Download card</button></div></form>';
      b.addEventListener('click', function (e) { if (e.target.closest('[data-cancel]')) dlg.close(); });
      b.querySelector('form').addEventListener('submit', function (e) {
        e.preventDefault(); var f = e.target, to = f.elements.to.value.trim(); if (!to) { b.querySelector('#g-err').textContent = 'Please say who the gift is for.'; return; }
        C.gift(t, { to: to, message: f.elements.msg.value.trim(), from: f.elements.from.value.trim() }).then(function () { dlg.close(); ui.success('Gift card downloaded.'); }).catch(ui.error);
      });
      return ui.modal({ title: 'Gift this tree', body: b, actions: [], onOpen: function (d) { dlg = d; } });
    },
    gift: function (t, o) {
      return Promise.all([MT.loader.load('jspdf'), MT.qr.dataUrl(MT.trees.url(t.code), 300)]).then(function (r) {
        var doc = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a5' }), W = 210, H = 148, sp = MT.species.get(t.speciesId);
        doc.setFillColor(251, 248, 241); doc.rect(0, 0, W, H, 'F'); doc.setFillColor(15, 61, 46); doc.rect(0, 0, W, 34, 'F');
        doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.text('A tree has been planted in your name', W / 2, 21, { align: 'center' });
        doc.setTextColor(35, 125, 73); doc.setFontSize(24); doc.text(T(o.to), W / 2, 56, { align: 'center' });
        doc.setFont('helvetica', 'normal'); doc.setFontSize(12); doc.setTextColor(60, 75, 68);
        doc.text(T(MT.trees.nameOf(t)) + (sp.scientific ? ' (' + T(sp.scientific) + ')' : '') + ' · planted ' + MT.fmt.date(t.plantedOn) + (t.city ? ' in ' + T(t.city) : ''), W / 2, 68, { align: 'center' });
        if (o.message) { doc.setFont('helvetica', 'italic'); doc.setFontSize(13); doc.setTextColor(90, 62, 43); doc.text(doc.splitTextToSize('“' + T(o.message) + '”', 150), W / 2, 84, { align: 'center' }); }
        if (r[1]) doc.addImage(r[1], 'PNG', 18, 98, 34, 34);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(110, 120, 115); doc.text('Scan to meet your tree', 35, 136, { align: 'center' });
        doc.setFontSize(11); doc.setTextColor(30, 40, 35); doc.text(o.from ? 'With love, ' + T(o.from) : '', W - 20, 118, { align: 'right' });
        doc.setFontSize(9); doc.text('Tree ID ' + t.code + ' · MyTree — friendship with nature', W - 20, 134, { align: 'right' });
        MT.download('gift-' + t.code + '.pdf', doc.output('blob'), 'application/pdf');
      });
    },
    /** Milestone certificate for an earned badge. */
    milestone: function (badge, earnedAt, metrics) {
      var p = MT.auth.profile();
      return Promise.all([MT.loader.load('jspdf'), MT.qr.dataUrl(location.href.split('#')[0].split('?')[0], 260)]).then(function (r) {
        var doc = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' }), W = 297, H = 210; frame(doc, W, H);
        center(doc, 'CERTIFICATE OF ACHIEVEMENT', 62, 28, 'bold', [15, 61, 46]); center(doc, 'is proudly presented to', 74, 12, 'normal', [90, 100, 95]);
        center(doc, p.name, 96, 32, 'bold', [35, 125, 73]); center(doc, 'for earning the', 112, 13, 'normal', [90, 100, 95]);
        center(doc, badge.title + ' badge', 128, 24, 'bold', [201, 162, 39]); center(doc, badge.desc, 140, 12, 'italic', [90, 100, 95]);
        center(doc, (metrics ? metrics.trees + ' trees planted · ' + metrics.alive + ' alive · ' : '') + 'earned ' + MT.fmt.date(earnedAt), 156, 11, 'normal');
        if (r[1]) doc.addImage(r[1], 'PNG', 40, 150, 30, 30);
        center(doc, 'MyTree · Maitree — friendship with nature', 188, 11, 'normal', [90, 100, 95]);
        MT.download('certificate-' + badge.id + '.pdf', doc.output('blob'), 'application/pdf');
      });
    }
  });
})();
