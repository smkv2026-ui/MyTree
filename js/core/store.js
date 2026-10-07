/**
 * MyTree — tiny observable state store.
 * MT.store.set('theme','dark'); MT.store.on('theme', fn); MT.store.get('session')
 */
(function () {
  'use strict';
  var MT = window.MT, state = {}, subs = {};
  MT.store = {
    get: function (k, def) { return k in state ? state[k] : def; },
    set: function (k, v) {
      var old = state[k]; state[k] = v;
      (subs[k] || []).slice().forEach(function (f) { try { f(v, old); } catch (e) { console.error(e); } });
    },
    on: function (k, fn) { (subs[k] = subs[k] || []).push(fn); return function () { subs[k] = (subs[k] || []).filter(function (f) { return f !== fn; }); }; }
  };
})();
