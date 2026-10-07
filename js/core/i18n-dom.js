/**
 * MyTree — phrase-level interface translation. For non-English languages every visible UI string that exactly matches an entry of
 * MT.phrases[lang] (js/data/phrases.js) is swapped in place — text nodes plus placeholder / title / aria-label — and a MutationObserver keeps
 * newly rendered pages translated. Anything without an entry stays English. Language changes re-render the whole shell, so no restore is needed.
 * User content (names, notes…) is only touched when it equals a phrase exactly, and elements marked [data-notranslate] or .notranslate are skipped.
 */
(function () {
  'use strict';
  var MT = window.MT, obs = null, ATTRS = ['placeholder', 'title', 'aria-label', 'alt'], pending = false, queue = [];

  function dict() { return (MT.phrases && MT.phrases[MT.lang]) || null; }
  function tr(s, d) { var k = s.trim(); if (!k) return null; var v = d[k]; return v == null ? null : s.replace(k, v); }
  function skip(n) { for (; n && n.nodeType === 1; n = n.parentNode) { if (n.nodeName === 'SCRIPT' || n.nodeName === 'STYLE' || n.nodeName === 'TEXTAREA' || n.nodeName === 'CODE' || n.hasAttribute('data-notranslate') || n.classList.contains('notranslate') || n.classList.contains('mono')) return true; } return false; }
  function node(n, d) {
    if (n.nodeType === 3) { if (!n.parentNode || skip(n.parentNode)) return; var v = tr(n.nodeValue, d); if (v != null && v !== n.nodeValue) n.nodeValue = v; return; }
    if (n.nodeType !== 1 || skip(n)) return;
    ATTRS.forEach(function (a) { if (n.hasAttribute(a)) { var v = tr(n.getAttribute(a), d); if (v != null) n.setAttribute(a, v); } });
    for (var c = n.firstChild; c; c = c.nextSibling) node(c, d);
  }
  function flush() { pending = false; var d = dict(); if (!d) { queue.length = 0; return; } obs.disconnect(); queue.splice(0).forEach(function (n) { if (n.isConnected !== false) node(n, d); }); observe(); }
  function observe() { obs.observe(document.body, { childList: true, subtree: true, characterData: true }); }
  function start() {
    if (obs) return;
    if (MT.lang !== 'en' && !MT.phrases && MT.lazy) { MT.lazy.load('phrases').then(function () { MT.i18nDom.translate(); }, function () {}); }
    obs = new MutationObserver(function (list) {
      list.forEach(function (m) { if (m.type === 'characterData') queue.push(m.target); else m.addedNodes.forEach(function (n) { queue.push(n); }); });
      if (!pending) { pending = true; (window.requestAnimationFrame || setTimeout)(flush); }
    });
    var d = dict(); if (d) node(document.body, d); observe();
  }
  MT.i18nDom = { start: start, translate: function (root) { var d = dict(); if (d) node(root || document.body, d); } };
  document.addEventListener('DOMContentLoaded', start);
  if (document.readyState !== 'loading') start();
})();
