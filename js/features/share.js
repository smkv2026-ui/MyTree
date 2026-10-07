/**
 * MyTree — branded QR codes and the shareable "I planted a tree" image card (canvas → PNG), plus WhatsApp / Web Share.
 */
(function () {
  'use strict';
  var MT = window.MT;
  var LOGO = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#0f3d2e"/><path d="M32 55V35" stroke="#c8a27a" stroke-width="5" stroke-linecap="round"/><path d="M32 44C23 42 14 36 14 25 14 17 22 13 30 19" fill="none" stroke="#3ec27a" stroke-width="5" stroke-linecap="round"/><path d="M32 44C41 42 50 36 50 25 50 17 42 13 34 19" fill="none" stroke="#3ec27a" stroke-width="5" stroke-linecap="round"/><circle cx="29.5" cy="19.5" r="4.6" fill="#e3c25a"/><circle cx="34.5" cy="19.5" r="4.6" fill="#c9a227"/></svg>');

  MT.qr = {
    /** @returns {Promise<QRCodeStyling>} */
    make: function (url, size) {
      return MT.loader.load('qrcode').then(function () {
        return new window.QRCodeStyling({
          width: size || 220, height: size || 220, type: 'canvas', data: url, margin: 6, image: LOGO,
          qrOptions: { errorCorrectionLevel: 'H' }, imageOptions: { crossOrigin: 'anonymous', margin: 3, imageSize: 0.26 },
          dotsOptions: { color: '#0f3d2e', type: 'rounded' }, cornersSquareOptions: { color: '#237d49', type: 'extra-rounded' }, cornersDotOptions: { color: '#c9a227', type: 'dot' },
          backgroundOptions: { color: '#ffffff' }
        });
      });
    },
    /** Draw the QR into `el`; resolves to the QR object or null when the library is unreachable. */
    render: function (el, url, size) {
      return MT.qr.make(url, size).then(function (q) { el.innerHTML = ''; q.append(el); return q; }).catch(function () {
        el.innerHTML = '<p class="fine">QR code unavailable offline. Link: <a href="' + MT.esc(url) + '">' + MT.esc(url) + '</a></p>'; return null;
      });
    },
    dataUrl: function (url, size) {
      return MT.qr.make(url, size).then(function (q) { return q.getRawData('png'); }).then(function (blob) { return MT.img.fileToDataUrl(blob); }).catch(function () { return ''; });
    }
  };

  function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function wrap(c, text, x, y, maxW, lh, maxLines) {
    var words = String(text).split(/\s+/), line = '', n = 0;
    for (var i = 0; i < words.length; i++) {
      var t = line ? line + ' ' + words[i] : words[i];
      if (c.measureText(t).width > maxW && line) { c.fillText(line, x, y); y += lh; line = words[i]; if (++n >= maxLines - 1) { c.fillText(words.slice(i).join(' ').slice(0, 44) + (words.length > i + 1 ? '…' : ''), x, y); return y; } }
      else line = t;
    }
    if (line) c.fillText(line, x, y); return y;
  }
  MT.share = {
    /**
     * Render a 1080×1500 "I planted a tree" card. @returns {Promise<{blob:Blob, dataUrl:string}>}
     * @param {Object} t tree, @param {string} qrData PNG data URL of the tree's QR (optional), @param {{count?:number, name?:string}} [o]
     */
    card: function (t, qrData, o) {
      o = o || {};
      var W = 1080, H = 1500, cv = document.createElement('canvas'); cv.width = W; cv.height = H; var c = cv.getContext('2d');
      var g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#0f3d2e'); g.addColorStop(1, '#237d49'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.fillStyle = 'rgba(255,255,255,.06)'; for (var i = 0; i < 9; i++) { c.beginPath(); c.arc(100 + i * 130, 160 + (i % 3) * 90, 60 + (i % 4) * 14, 0, 6.3); c.fill(); }
      c.fillStyle = '#f4ecd8'; roundRect(c, 70, 230, W - 140, 900, 48); c.fill();
      c.fillStyle = '#0f3d2e'; c.textAlign = 'center';
      c.font = '700 64px "Fraunces", Georgia, serif'; c.fillText('I planted a tree!', 540, 320);
      // tree illustration
      var dy = 120, ph = { thriving: '#2e9e5b', healthy: '#4aa66b' }[t.health] || '#2e9e5b';
      c.strokeStyle = '#8b5e3c'; c.lineWidth = 22; c.lineCap = 'round'; c.beginPath(); c.moveTo(540, 700 + dy); c.lineTo(540, 520 + dy); c.stroke();
      [[540, 440 + dy, 150, ph], [450, 500 + dy, 100, '#58c488'], [630, 490 + dy, 96, '#58c488'], [545, 380 + dy, 90, '#79d3a0']].forEach(function (b) { c.fillStyle = b[3]; c.beginPath(); c.arc(b[0], b[1], b[2], 0, 6.3); c.fill(); });
      c.fillStyle = '#c9a227'; [[470, 430], [610, 400], [560, 500], [500, 360]].forEach(function (b) { c.beginPath(); c.arc(b[0], b[1] + dy, 12, 0, 6.3); c.fill(); });
      c.fillStyle = '#0f3d2e'; c.font = '700 58px "Fraunces", Georgia, serif'; wrap(c, (o.count > 1 ? o.count + ' × ' : '') + (o.name || MT.trees.nameOf(t)), 540, 900, 840, 66, 2);
      c.font = '500 34px "Plus Jakarta Sans", Arial, sans-serif'; c.fillStyle = '#3d544a';
      c.fillText((t.city ? t.city + ' · ' : '') + MT.fmt.date(t.plantedOn), 540, 980);
      if (t.dedication) { c.font = 'italic 500 34px "Fraunces", Georgia, serif'; c.fillStyle = '#5a3e2b'; wrap(c, '“' + t.dedication + '”', 540, 1040, 800, 44, 2); }
      c.font = '700 30px ui-monospace, Menlo, monospace'; c.fillStyle = '#237d49'; c.fillText(t.code, 540, 1100);
      c.font = '600 32px "Plus Jakarta Sans", Arial, sans-serif'; c.fillStyle = '#e9f6ee'; c.fillText('MyTree · Maitree — friendship with nature', 540, 1430);
      c.font = '500 28px "Plus Jakarta Sans", Arial, sans-serif'; c.fillStyle = 'rgba(233,246,238,.8)'; c.fillText('Scan the QR to meet my tree', 540, 1470);
      function done() { return new Promise(function (res) { cv.toBlob(function (b) { res({ blob: b, dataUrl: cv.toDataURL('image/png') }); }, 'image/png'); }); }
      if (!qrData) return done();
      return MT.img.load(qrData).then(function (q) { c.fillStyle = '#fff'; roundRect(c, 440, 1160, 200, 200, 20); c.fill(); c.drawImage(q, 448, 1168, 184, 184); return done(); }).catch(done);
    },
    whatsapp: function (t) {
      var txt = 'I just planted ' + MT.trees.nameOf(t) + ' with MyTree 🌳 — meet it here: ' + MT.trees.url(t.code);
      window.open('https://wa.me/?text=' + encodeURIComponent(txt), '_blank', 'noopener');
    },
    /** Web Share API with the image if supported; else downloads the PNG. */
    share: function (t, blob) {
      var file = blob && new File([blob], t.code + '.png', { type: 'image/png' });
      if (navigator.canShare && file && navigator.canShare({ files: [file] })) return navigator.share({ files: [file], text: 'I planted a tree with MyTree 🌳', url: MT.trees.url(t.code) }).catch(function () {});
      if (blob) MT.download(t.code + '.png', blob, 'image/png');
      return Promise.resolve();
    }
  };
})();
