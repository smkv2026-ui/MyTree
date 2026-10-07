/**
 * MyTree — data-layer contract and shared helpers.
 *
 * Every adapter (js/core/db-demo.js, js/core/db-firebase.js) implements this async interface and is
 * installed as `MT.db` by js/boot.js. Feature code must ONLY use MT.db — never Firestore directly.
 *
 *   db.mode                              'demo' | 'live'
 *   db.get(col, id)                      → {id, ...data} | null
 *   db.list(col, {where:[[f,op,v]], orderBy:'f'|['f','desc'], limit})  → [{id,...}]
 *   db.count(col, query)                 → number
 *   db.set(col, id, data, {merge})       → void
 *   db.add(col, data)                    → new id
 *   db.update(col, id, patch)            → void   (dot-paths and sentinels allowed)
 *   db.delete(col, id)                   → void
 *   db.batch()                           → {set, update, delete, commit()}  (commit auto-chunks to ≤400 ops with retry)
 *   db.nextId(counterKey, count=1)       → first integer of a block of `count` reserved by one transaction on counters/{key}.n
 *   Sentinels: db.inc(n), db.union(...vals), db.remove(...vals), db.del()
 *
 * Operators for `where`: == != < <= > >= in array-contains array-contains-any
 * Dates are stored as epoch milliseconds (numbers) or ISO yyyy-mm-dd strings — never Date/Timestamp objects —
 * so both adapters behave identically.
 */
(function () {
  'use strict';
  var MT = window.MT;

  var H = (MT.dbHelpers = {});
  H.isInc = function (v) { return v && typeof v === 'object' && '__inc' in v; };
  H.isUnion = function (v) { return v && typeof v === 'object' && '__union' in v; };
  H.isRemove = function (v) { return v && typeof v === 'object' && '__remove' in v; };
  H.isDel = function (v) { return v && typeof v === 'object' && v.__del === true; };
  H.inc = function (n) { return { __inc: n == null ? 1 : n }; };
  H.union = function () { return { __union: [].slice.call(arguments) }; };
  H.remove = function () { return { __remove: [].slice.call(arguments) }; };
  H.del = function () { return { __del: true }; };

  H.getPath = function (o, path) {
    if (path === '__name__' || path === 'id') return o && o.id;
    var parts = path.split('.'), cur = o;
    for (var i = 0; i < parts.length; i++) { if (cur == null) return undefined; cur = cur[parts[i]]; }
    return cur;
  };
  /** Apply a Firestore-style patch (dot-paths + sentinels) to a plain object in place. */
  H.applyPatch = function (obj, patch) {
    Object.keys(patch).forEach(function (k) {
      var parts = k.split('.'), cur = obj;
      for (var i = 0; i < parts.length - 1; i++) {
        if (cur[parts[i]] == null || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
        cur = cur[parts[i]];
      }
      var last = parts[parts.length - 1], v = patch[k];
      if (H.isInc(v)) cur[last] = (Number(cur[last]) || 0) + v.__inc;
      else if (H.isUnion(v)) { var a = Array.isArray(cur[last]) ? cur[last] : []; v.__union.forEach(function (x) { if (a.indexOf(x) < 0) a.push(x); }); cur[last] = a; }
      else if (H.isRemove(v)) { cur[last] = (Array.isArray(cur[last]) ? cur[last] : []).filter(function (x) { return v.__remove.indexOf(x) < 0; }); }
      else if (H.isDel(v)) delete cur[last];
      else cur[last] = MT.clone(v);
    });
    return obj;
  };
  /** Like applyPatch, but for set(): nested sentinels inside plain objects are resolved too. */
  H.resolveSentinels = function (data, existing) {
    var out = {};
    Object.keys(data).forEach(function (k) {
      var v = data[k];
      if (H.isInc(v) || H.isUnion(v) || H.isRemove(v) || H.isDel(v)) { var tmp = {}; if (existing && k in existing) tmp[k] = existing[k]; H.applyPatch(tmp, (function () { var p = {}; p[k] = v; return p; })()); if (k in tmp) out[k] = tmp[k]; }
      else if (v && typeof v === 'object' && !Array.isArray(v)) out[k] = H.resolveSentinels(v, existing && existing[k]);
      else out[k] = MT.clone(v);
    });
    return out;
  };
  H.matches = function (doc, where) {
    for (var i = 0; i < where.length; i++) {
      var f = where[i][0], op = where[i][1], val = where[i][2], x = H.getPath(doc, f);
      switch (op) {
        case '==': if (x !== val) return false; break;
        case '!=': if (x === val) return false; break;
        case '<': if (!(x < val)) return false; break;
        case '<=': if (!(x <= val)) return false; break;
        case '>': if (!(x > val)) return false; break;
        case '>=': if (!(x >= val)) return false; break;
        case 'in': if (!Array.isArray(val) || val.indexOf(x) < 0) return false; break;
        case 'array-contains': if (!Array.isArray(x) || x.indexOf(val) < 0) return false; break;
        case 'array-contains-any': if (!Array.isArray(x) || !x.some(function (y) { return val.indexOf(y) > -1; })) return false; break;
        default: throw new Error('Unsupported operator ' + op);
      }
    }
    return true;
  };
  H.sort = function (docs, orderBy) {
    if (!orderBy) return docs;
    var f = Array.isArray(orderBy) ? orderBy[0] : orderBy, dir = Array.isArray(orderBy) && orderBy[1] === 'desc' ? -1 : 1;
    return docs.sort(function (a, b) {
      var x = H.getPath(a, f), y = H.getPath(b, f);
      if (x === y) return 0; if (x == null) return 1; if (y == null) return -1;
      return (x < y ? -1 : 1) * dir;
    });
  };
  H.chunk = function (arr, n) { var o = []; for (var i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; };

  /** Install sentinel helpers on a db object. */
  H.install = function (db) { db.inc = H.inc; db.union = H.union; db.remove = H.remove; db.del = H.del; return db; };

  /** Generate ids like MT-IND-000123 using a transactional counter. */
  MT.ids = {
    pad: function (n, w) { return MT.pad(n, w || 6); },
    individual: function () { return MT.db.nextId('IND').then(function (n) { return 'MT-IND-' + MT.pad(n, 6); }); },
    foundation: function () { return MT.db.nextId('FND').then(function (n) { return 'MT-FND-' + MT.pad(n, 6); }); },
    school: function () { return MT.db.nextId('SCH').then(function (n) { return 'MT-SCH-' + MT.pad(n, 6); }); },
    institution: function () { return MT.db.nextId('INS').then(function (n) { return 'MT-INS-' + MT.pad(n, 6); }); },
    org: function (type) { return MT.ids[type](); },
    /** Student/user inside an org: MT-STU-SCH045-0012 */
    member: function (orgId) {
      var m = /^MT-(SCH|INS|FND)-0*(\d+)$/.exec(orgId) || [];
      var tag = (m[1] || 'ORG') + MT.pad(m[2] || 0, 3);
      return MT.db.nextId('STU_' + orgId).then(function (n) { return 'MT-STU-' + tag + '-' + MT.pad(n, 4); });
    },
    tree: function (year) { year = year || new Date().getFullYear(); return MT.db.nextId('TREE_' + year).then(function (n) { return 'TREE-' + year + '-' + MT.pad(n, 6); }); },
    /** Reserve `count` tree codes with a single counter transaction. */
    trees: function (count, year) {
      year = year || new Date().getFullYear();
      return MT.db.nextId('TREE_' + year, count).then(function (first) {
        var out = []; for (var i = 0; i < count; i++) out.push('TREE-' + year + '-' + MT.pad(first + i, 6)); return out;
      });
    }
  };
})();
