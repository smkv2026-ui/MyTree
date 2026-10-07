/**
 * MyTree — chart helpers (Chart.js, lazy). Thin 4px-rounded bars anchored to the baseline, recessive grid, one series colour per
 * chart (health uses the reserved status colours), text always in theme text tokens, light/dark aware, every chart has a table view.
 */
(function () {
  'use strict';
  var MT = window.MT, ui = MT.ui;
  function v(name, fb) { var x = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); return x || fb; }

  MT.charts = {
    theme: function () { return { ink: v('--text-2', '#3d544a'), grid: v('--border', '#e3ddcd'), primary: v('--primary', '#237d49'), surface: v('--surface', '#fff'), muted: v('--muted', '#55695f'), health: { thriving: v('--h-thriving', '#1b8f4e'), healthy: v('--h-healthy', '#66b432'), needs_care: v('--h-needs_care', '#d9a21b'), struggling: v('--h-struggling', '#e0662b'), dead: v('--h-dead', '#7b7468') } }; },
    /** A manager that owns chart instances for a page and redraws them when the theme changes. */
    manager: function () {
      var items = [], off = MT.store.on('themeTick', function () { items.forEach(function (i) { i.draw(); }); });
      return {
        /** @param {HTMLCanvasElement} canvas @param {function(theme):Object} cfg returns a Chart.js config */
        add: function (canvas, cfg) {
          var item = { inst: null, dead: false, draw: function () { if (item.dead || !canvas.isConnected) return; if (item.inst) item.inst.destroy(); item.inst = new window.Chart(canvas, cfg(MT.charts.theme())); } };
          items.push(item); item.draw(); return item;
        },
        destroy: function () { off(); items.forEach(function (i) { i.dead = true; if (i.inst) i.inst.destroy(); }); items.length = 0; }
      };
    },
    /** Horizontal / vertical single-series bar config. opts: {labels, data, colors?, horizontal, fmt, label, max?} */
    bar: function (th, o) {
      var horiz = !!o.horizontal, colors = o.colors || o.labels.map(function () { return th.primary; });
      return {
        type: 'bar', data: { labels: o.labels, datasets: [{ label: o.label || 'Trees', data: o.data, backgroundColor: colors, borderRadius: 4, borderSkipped: false, maxBarThickness: horiz ? 18 : 28 }] },
        options: { indexAxis: horiz ? 'y' : 'x', responsive: true, maintainAspectRatio: false, animation: MT.prefersReducedMotion() ? false : { duration: 700 },
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (i) { return ' ' + (o.fmt ? o.fmt(i.parsed[horiz ? 'x' : 'y']) : MT.fmt.num(i.parsed[horiz ? 'x' : 'y'])) + ' ' + (o.unit || ''); } } } },
          scales: (function () {
            var cat = { ticks: { color: th.ink, maxRotation: 0, autoSkip: true }, grid: { display: false }, border: { color: th.grid } };
            var val = { beginAtZero: true, ticks: { color: th.ink, callback: function (t) { return MT.fmt.compact(t); } }, grid: { color: th.grid }, border: { display: false } };
            return horiz ? { x: Object.assign({}, val), y: Object.assign({}, cat, { border: { display: false } }) } : { x: cat, y: val };
          })() }
      };
    },
    /** Card with a title, a chart canvas and a "Table" toggle. Returns {el, canvas}. */
    card: function (host, id, title, sub, table) {
      var d = document.createElement('section'); d.className = 'card chart-card';
      d.innerHTML = '<div class="card-head"><div><h3>' + MT.esc(title) + '</h3>' + (sub ? '<p class="fine">' + MT.esc(sub) + '</p>' : '') + '</div><button type="button" class="link-btn" data-tbl>Table</button></div><div class="chart-box short"><canvas id="' + id + '" role="img" aria-label="' + MT.esc(title) + '"></canvas></div><div class="tbl-wrap" hidden></div>';
      var t = d.querySelector('[data-tbl]'), w = d.querySelector('.tbl-wrap');
      t.addEventListener('click', function () { w.hidden = !w.hidden; t.textContent = w.hidden ? 'Table' : 'Hide table'; if (!w.hidden && !w.innerHTML) w.innerHTML = d._table ? d._table() : ''; });
      d.setTable = function (head, rows) { d._table = function () { return '<table class="table"><thead><tr>' + head.map(function (h) { return '<th>' + MT.esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + MT.esc(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>'; }; if (!w.hidden) w.innerHTML = d._table(); };
      host.appendChild(d); return d;
    }
  };
})();
