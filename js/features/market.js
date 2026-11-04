/**
 * MyTree — Saplings & bird-care shop. Approved sellers (nurseries, shops, NGOs) list saplings, nest boxes, feeders and water bowls.
 * Buyers (individuals, schools, institutions, foundations) place an order and pay the seller DIRECTLY (UPI / bank transfer — MyTree never handles money),
 * then tap "I have paid" with the payment reference. The seller confirms once the money has arrived, delivers, and the buyer plants the saplings with
 * "Plant this" (the tree page then says where the sapling came from).
 *
 *   order status:  placed → paid_claimed → confirmed → delivered        (or cancelled by the buyer / rejected by the seller)
 * Routes: #/market (browse), #/market/orders (buyer: my orders · seller: orders received), #/market/sell (seller home: listings + payment details).
 */
(function () {
  'use strict';
  var MT = window.MT, ui = MT.ui, kit = MT.kit, esc = MT.esc;
  var BUYERS = ['foundation', 'school', 'institution', 'individual'], ALLR = BUYERS.concat(['student', 'super_admin', 'seller']);
  var CATS = [['all', 'Everything'], ['sapling', 'Saplings'], ['bird', 'Bird care']];
  var BIRD_KINDS = ['Nest box', 'Bird feeder', 'Bird water bowl', 'Bird feed (seed mix)', 'Other bird-care item'];
  var STATUS = { placed: ['Waiting for payment', 'warn'], paid_claimed: ['Payment claimed — seller to confirm', 'warn'], confirmed: ['Confirmed — being prepared', 'ok'], delivered: ['Delivered', 'ok'], cancelled: ['Cancelled', 'bad'], rejected: ['Declined by seller', 'bad'] };
  var shortName = function (n) { return MT.stats && MT.stats.shortName ? MT.stats.shortName(n) : n; };
  function badge(s) { var x = STATUS[s] || [s, 'neutral']; return '<span class="badge badge-' + x[1] + '">' + esc(x[0]) + '</span>'; }
  function thumb(l) { return l.photo ? '<img src="' + esc(l.photo) + '" alt="" loading="lazy">' : (l.category === 'bird' ? '<span class="mk-ph">' + ui.icon('bird').s + '</span>' : ui.treeArt('thriving', 120).s); }

  /* ================= browse ================= */
  function browse() {
    return '<div class="page mk-page" data-reveal><div class="page-head"><h2>Saplings & bird-care shop</h2><p class="muted">Buy saplings from verified nurseries, plant them with one tap, and give birds a home — nest boxes, feeders and water bowls.</p></div>' +
      '<div class="mk-filters"><div class="chips" id="mk-cats">' + CATS.map(function (c, i) { return '<button class="chip' + (i ? '' : ' on') + '" data-c="' + c[0] + '">' + c[1] + '</button>'; }).join('') + '</div><div class="search-wrap"><label class="sr-only" for="mk-q">Search</label><input id="mk-q" type="search" placeholder="Search neem, nest box, Pune…"></div></div><div id="mk-grid" class="mk-grid">' + ui.skeleton(4, 'sk-line').s + '</div></div>';
  }
  function browseAfter(host, ctx) {
    var p = MT.auth.profile(), cat = (ctx.query && ctx.query.cat) || 'all', rows = [], dead = false, grid = MT.$('#mk-grid', host), q = MT.$('#mk-q', host), canBuy = BUYERS.indexOf(p.role) > -1;
    function paint() {
      var t = q.value.toLowerCase().trim(), list = rows.filter(function (l) { return (cat === 'all' || l.category === cat) && (!t || (l.title + ' ' + l.sellerName + ' ' + (l.city || '') + ' ' + (l.description || '')).toLowerCase().indexOf(t) > -1); });
      MT.$$('#mk-cats .chip', host).forEach(function (b) { b.classList.toggle('on', b.dataset.c === cat); });
      grid.innerHTML = list.length ? list.map(function (l) {
        return '<article class="card mk-card"><div class="mk-img">' + thumb(l) + (l.stock <= 0 ? '<span class="badge badge-bad mk-tag">Sold out</span>' : l.stock < 10 ? '<span class="badge badge-warn mk-tag">Only ' + l.stock + ' left</span>' : '') + '</div><div class="mk-body"><h3>' + esc(l.title) + '</h3><p class="muted">' + esc(l.sellerName) + ' · ' + esc(l.city || '') + '</p><p class="fine">' + esc((l.description || '').slice(0, 90)) + '</p>' +
          '<div class="mk-foot"><strong class="mk-price">' + kit.rupees(l.price) + '<small> ' + (l.category === 'sapling' ? '/ sapling' : '/ piece') + '</small></strong>' + (canBuy ? '<button class="btn btn-primary btn-sm" data-buy="' + esc(l.id) + '"' + (l.stock <= 0 ? ' disabled' : '') + '>Buy</button>' : '') + '</div></div></article>';
      }).join('') : ui.empty({ icon: 'store', title: 'Nothing here yet', text: 'No listings match. Sellers add new saplings and bird-care items all the time.' }).s; ui.icons();
    }
    MT.db.list('listings', { where: [['active', '==', true]], limit: 400 }).then(function (r) { if (dead) return; rows = r; paint(); }).catch(function (e) { grid.innerHTML = '<p class="muted">' + esc(MT.friendlyError(e)) + '</p>'; });
    q.addEventListener('input', paint);
    MT.$('#mk-cats', host).addEventListener('click', function (e) { var b = e.target.closest('[data-c]'); if (b) { cat = b.dataset.c; paint(); } });
    grid.addEventListener('click', function (e) { var b = e.target.closest('[data-buy]'); if (b) buy(rows.filter(function (l) { return l.id === b.dataset.buy; })[0]); });
    return function () { dead = true; };
  }

  /** Order dialog: quantity, pickup / delivery, then the seller's payment details. */
  function buy(l) {
    var p = MT.auth.profile(), left = Math.max(1, l.stock);
    MT.db.get('sellerProfiles', l.sellerId).catch(function () { return null; }).then(function (sp) {
      sp = sp || {};
      kit.form({ title: 'Buy: ' + l.title, submit: 'Place order', html:
        '<p class="field-wide muted">From <strong>' + esc(l.sellerName) + '</strong>' + (l.city ? ', ' + esc(l.city) : '') + ' · ' + kit.rupees(l.price) + (l.category === 'sapling' ? ' per sapling' : ' each') + ' · ' + l.stock + ' in stock</p>' +
        '<div class="field"><label for="o-qty">Quantity</label><input id="o-qty" name="qty" type="number" min="1" max="' + left + '" value="1" required></div><div class="field"><label>Total</label><output id="o-total" class="mk-total">' + kit.rupees(l.price) + '</output></div>' +
        '<div class="field"><label for="o-del">How will you get it?</label><select id="o-del" name="delivery"><option value="pickup">Pick up from the seller</option><option value="delivery">Seller delivers to me</option></select></div><div class="field"><label for="o-phone">Your phone</label><input id="o-phone" name="phone" type="tel" maxlength="30" value="' + esc(p.phone || '') + '" required></div>' +
        '<div class="field field-wide"><label for="o-addr">Delivery address (if delivery)</label><textarea id="o-addr" name="address" rows="2" maxlength="300"></textarea></div><div class="field field-wide"><label for="o-note">Note to seller (optional)</label><input id="o-note" name="note" maxlength="200"></div>' +
        '<p class="fine field-wide">' + ui.icon('info').s + ' You pay the seller directly by UPI or bank transfer after placing the order. The seller confirms once the payment arrives.</p>',
        onOpen: function (b) { var qi = b.querySelector('#o-qty'), out = b.querySelector('#o-total'); qi.addEventListener('input', function () { out.textContent = kit.rupees(l.price * (parseInt(qi.value, 10) || 0)); }); },
        onSubmit: function (v) {
          var qty = parseInt(v.qty, 10); if (!(qty >= 1) || qty > l.stock) throw MT.userError('Please choose between 1 and ' + l.stock + '.'); if (!v.phone) throw MT.userError('Please add a phone number so the seller can reach you.');
          if (v.delivery === 'delivery' && !v.address) throw MT.userError('Please add the delivery address.');
          var id = MT.uid('o'), o = { buyerId: p.userId, buyerName: p.name, buyerRole: p.role, buyerOrgId: p.orgId || '', buyerAncestorOrgIds: p.ancestorOrgIds || [], sellerId: l.sellerId, sellerName: l.sellerName,
            items: [{ listingId: l.id, title: l.title, qty: qty, price: +l.price, speciesId: l.speciesId || '', category: l.category }], total: Math.round(l.price * qty * 100) / 100, delivery: v.delivery, address: v.address.slice(0, 300), phone: v.phone.slice(0, 30), note: v.note.slice(0, 200), status: 'placed', payRef: '', sellerNote: '', plantedQty: {}, createdAt: Date.now(), updatedAt: Date.now() };
          return MT.db.set('orders', id, o).then(function () { ui.success('Order placed! Now pay the seller and tap “I have paid”.'); MT.router.go('/market/orders'); });
        } });
    });
  }

  /* ================= orders (buyer & seller) ================= */
  function ordersPage() { return '<div class="page mk-page" data-reveal><div class="page-head"><h2 id="od-h">Orders</h2><p class="muted" id="od-sub"></p></div><div id="od-body">' + ui.skeleton(3, 'sk-line').s + '</div></div>'; }
  function ordersAfter(host) {
    var p = MT.auth.profile(), seller = p.role === 'seller', dead = false, body = MT.$('#od-body', host), orders = [], profiles = {};
    MT.$('#od-h', host).textContent = seller ? 'Orders received' : 'My orders'; MT.$('#od-sub', host).textContent = seller ? 'Confirm each payment once the money reaches you, then mark the order delivered.' : 'Pay the seller directly, tell us once you have paid, and plant your saplings when they arrive.';
    function load() {
      var q = seller ? MT.db.list('orders', { where: [['sellerId', '==', p.userId]], limit: 300 }) : p.role === 'super_admin' ? MT.db.list('orders', { limit: 300 }) : MT.db.list('orders', { where: [['buyerId', '==', p.userId]], limit: 300 });
      return q.then(function (r) { orders = r.sort(function (a, b) { return b.createdAt - a.createdAt; }); var ids = {}; orders.forEach(function (o) { ids[o.sellerId] = 1; }); return Promise.all(Object.keys(ids).map(function (id) { return MT.db.get('sellerProfiles', id).then(function (sp) { profiles[id] = sp || {}; }).catch(function () { profiles[id] = {}; }); })); }).then(paint);
    }
    function payBox(o) {
      var sp = profiles[o.sellerId] || {}; if (!(o.status === 'placed' || o.status === 'paid_claimed')) return '';
      return '<div class="mk-pay"><strong>Pay ' + kit.rupees(o.total) + ' to ' + esc(o.sellerName) + '</strong>' + (sp.upi ? '<p>UPI ID: <code>' + esc(sp.upi) + '</code> <button class="btn btn-ghost btn-sm" data-copy="' + esc(sp.upi) + '">Copy</button></p>' : '') +
        (sp.accountNo ? '<p>Bank: ' + esc(sp.accountName || '') + ' · A/c <code>' + esc(sp.accountNo) + '</code> · IFSC <code>' + esc(sp.ifsc || '') + '</code>' + (sp.bank ? ' · ' + esc(sp.bank) : '') + '</p>' : '') + (sp.payNote ? '<p class="fine">' + esc(sp.payNote) + '</p>' : '') + (!sp.upi && !sp.accountNo ? '<p class="muted">The seller has not added payment details yet — contact them on ' + esc(sp.phone || 'their listed number') + '.</p>' : '') + '</div>';
    }
    function card(o) {
      var it = o.items[0], idx = 0, planted = +((o.plantedQty || {})[0]) || 0, left = it.qty - planted, acts = '';
      if (seller) {
        if (o.status === 'paid_claimed') acts = '<button class="btn btn-primary btn-sm" data-act="confirm" data-id="' + esc(o.id) + '">✓ Payment received — confirm</button><button class="btn btn-ghost btn-sm" data-act="notpaid" data-id="' + esc(o.id) + '">Not received</button>';
        if (o.status === 'confirmed') acts = '<button class="btn btn-primary btn-sm" data-act="deliver" data-id="' + esc(o.id) + '">Mark delivered / handed over</button>';
        if (o.status === 'placed' || o.status === 'paid_claimed') acts += '<button class="btn btn-danger-soft btn-sm" data-act="reject" data-id="' + esc(o.id) + '">Decline</button>';
      } else if (p.role !== 'super_admin') {
        if (o.status === 'placed') acts = '<button class="btn btn-primary btn-sm" data-act="paid" data-id="' + esc(o.id) + '">I have paid</button><button class="btn btn-ghost btn-sm" data-act="cancel" data-id="' + esc(o.id) + '">Cancel order</button>';
        if (o.status === 'delivered' && it.category === 'sapling') acts = left > 0 ? '<a class="btn btn-primary btn-sm" href="#/plant?order=' + esc(o.id) + '&item=0">' + ui.icon('sprout').s + ' Plant this (' + left + ' left)</a>' : '<span class="badge badge-ok">All planted ✓</span>';
        if (o.status === 'delivered' && it.category === 'bird') acts = '<a class="btn btn-primary btn-sm" href="#/wings?add=1">' + ui.icon('bird').s + ' Set it up in Bird friends</a>';
      }
      return '<article class="card mk-order"><div class="mk-order-h"><div><h3>' + esc(it.title) + ' × ' + it.qty + '</h3><p class="muted">' + (seller ? 'Buyer: <strong>' + esc(shortName(o.buyerName)) + '</strong> (' + esc(MT.ROLE_LABEL[o.buyerRole] || '') + ') · ' + esc(o.phone) : 'Seller: <strong>' + esc(o.sellerName) + '</strong>') + ' · ' + esc(kit.dateOnly(o.createdAt)) + '</p></div><div class="mk-order-r"><strong>' + kit.rupees(o.total) + '</strong>' + badge(o.status) + '</div></div>' +
        '<p class="fine">' + (o.delivery === 'delivery' ? 'Delivery to: ' + esc(o.address) : 'Pickup') + (o.note ? ' · Note: ' + esc(o.note) : '') + (o.payRef ? ' · Payment ref: <code>' + esc(o.payRef) + '</code>' : '') + (o.sellerNote ? ' · Seller: ' + esc(o.sellerNote) : '') + (planted ? ' · Planted ' + planted + '/' + it.qty : '') + '</p>' +
        (seller ? '' : payBox(o)) + (acts ? '<div class="btn-row">' + acts + '</div>' : '') + '</article>';
    }
    function paint() { if (dead) return; body.innerHTML = orders.length ? '<div class="mk-orders">' + orders.map(card).join('') + '</div>' : ui.empty({ icon: 'package', title: seller ? 'No orders yet' : 'No orders yet', text: seller ? 'Orders will appear here when buyers purchase your listings.' : 'Browse the shop to buy saplings or bird-care items.', action: seller ? null : { label: 'Open the shop', href: '#/market' } }).s; ui.icons(); }
    function patch(id, data) { return MT.db.update('orders', id, Object.assign({ updatedAt: Date.now() }, data)).then(load); }
    body.addEventListener('click', function (e) {
      var c = e.target.closest('[data-copy]'); if (c) return MT.copy(c.dataset.copy).then(function () { ui.success('Copied'); });
      var b = e.target.closest('[data-act]'); if (!b) return; var id = b.dataset.id, o = orders.filter(function (x) { return x.id === id; })[0], act = b.dataset.act; b.disabled = true;
      var fail = function (er) { b.disabled = false; ui.error(er); };
      if (act === 'paid') kit.form({ title: 'I have paid', submit: 'Tell the seller', html: '<p class="field-wide">Enter the UPI transaction ID or bank reference so the seller can match your payment.</p><div class="field field-wide"><label for="pr">Payment reference (UTR / transaction ID)</label><input id="pr" name="ref" maxlength="60" required></div>', onSubmit: function (v) { if (!v.ref) throw MT.userError('Please enter the payment reference.'); return patch(id, { status: 'paid_claimed', payRef: v.ref.slice(0, 60) }).then(function () { ui.success('The seller has been told. They will confirm once the money arrives.'); }); }, onOpen: function () { b.disabled = false; } });
      else if (act === 'cancel') ui.confirm('Cancel this order?', 'You have not been charged by MyTree. If you already paid, contact the seller first.', 'Cancel order', true).then(function (ok) { if (ok) patch(id, { status: 'cancelled' }).catch(fail); else b.disabled = false; });
      else if (act === 'confirm') { var batch = MT.db.batch(); batch.update('orders', id, { status: 'confirmed', updatedAt: Date.now() }); o.items.forEach(function (it) { batch.update('listings', it.listingId, { stock: MT.db.inc(-it.qty), updatedAt: Date.now() }); }); batch.commit().then(function () { ui.success('Confirmed. Stock updated.'); return load(); }).catch(fail); }
      else if (act === 'notpaid') kit.form({ title: 'Payment not received', submit: 'Send back', html: '<div class="field field-wide"><label for="sn">Message to the buyer</label><input id="sn" name="note" maxlength="150" placeholder="Not seen in my account yet — please check the reference" required></div>', onSubmit: function (v) { return patch(id, { status: 'placed', sellerNote: v.note || 'Payment not received yet' }); }, onOpen: function () { b.disabled = false; } });
      else if (act === 'deliver') patch(id, { status: 'delivered' }).then(function () { ui.success('Marked delivered. The buyer can now plant their saplings.'); }).catch(fail);
      else if (act === 'reject') kit.form({ title: 'Decline this order', submit: 'Decline', html: '<div class="field field-wide"><label for="rn">Reason</label><input id="rn" name="note" maxlength="150" required></div>', onSubmit: function (v) { return patch(id, { status: 'rejected', sellerNote: v.note }); }, onOpen: function () { b.disabled = false; } });
    });
    load().catch(function (e) { body.innerHTML = '<p class="muted">' + esc(MT.friendlyError(e)) + '</p>'; });
    return function () { dead = true; };
  }

  /* ================= seller home ================= */
  function sellPage() { return '<div class="page mk-page" data-reveal><div class="page-head"><h2>My listings</h2><p class="muted">Add saplings and bird-care items. Buyers pay you directly using the details below.</p></div><div id="sl-body">' + ui.skeleton(3, 'sk-line').s + '</div></div>'; }
  function sellAfter(host) {
    var p = MT.auth.profile(), dead = false, body = MT.$('#sl-body', host), listings = [], sp = {}, orders = [];
    function load() { return Promise.all([MT.db.list('listings', { where: [['sellerId', '==', p.userId]], limit: 300 }), MT.db.get('sellerProfiles', p.userId).catch(function () { return null; }), MT.db.list('orders', { where: [['sellerId', '==', p.userId]], limit: 300 }).catch(function () { return []; })]).then(function (r) { listings = r[0].sort(function (a, b) { return b.createdAt - a.createdAt; }); sp = r[1] || {}; orders = r[2]; paint(); }); }
    function paint() {
      if (dead) return; var wait = orders.filter(function (o) { return o.status === 'paid_claimed'; }).length, open = orders.filter(function (o) { return o.status === 'confirmed'; }).length, revenue = orders.filter(function (o) { return o.status === 'confirmed' || o.status === 'delivered'; }).reduce(function (a, o) { return a + o.total; }, 0);
      body.innerHTML = '<div class="sum-row"><div class="sum"><strong>' + listings.filter(function (l) { return l.active; }).length + '</strong><span>active listings</span></div><div class="sum sum-warn"><strong>' + wait + '</strong><span>payments to confirm</span></div><div class="sum"><strong>' + open + '</strong><span>to deliver</span></div><div class="sum sum-ok"><strong>' + kit.rupees(revenue) + '</strong><span>confirmed sales</span></div></div>' +
        '<div class="btn-row"><button class="btn btn-primary" id="l-new">' + ui.icon('plus').s + ' Add a listing</button><a class="btn btn-soft" href="#/market/orders">Orders received' + (wait ? ' (' + wait + ' to confirm)' : '') + '</a><button class="btn btn-soft" id="l-pay">' + ui.icon('badge-indian-rupee').s + ' Payment details</button></div>' +
        (!(sp.upi || sp.accountNo) ? '<div class="card mk-warn">' + ui.icon('alert-triangle').s + ' <span>Add your <strong>UPI ID or bank account</strong> so buyers know where to pay. Buyers cannot order until you do.</span></div>' : '') +
        '<div class="mk-grid">' + (listings.length ? listings.map(function (l) { return '<article class="card mk-card"><div class="mk-img">' + thumb(l) + (l.active ? '' : '<span class="badge badge-bad mk-tag">Hidden</span>') + '</div><div class="mk-body"><h3>' + esc(l.title) + '</h3><p class="muted">' + esc(l.category === 'bird' ? 'Bird care' : 'Sapling') + ' · ' + kit.rupees(l.price) + ' · stock ' + l.stock + '</p><div class="mk-foot"><button class="btn btn-soft btn-sm" data-edit="' + esc(l.id) + '">Edit</button><button class="btn btn-ghost btn-sm" data-del="' + esc(l.id) + '">Delete</button></div></div></article>'; }).join('') : '<p class="muted">No listings yet — add your first sapling or nest box.</p>') + '</div>'; ui.icons();
    }
    function listingForm(l) {
      var create = !l, spOpts; l = l || { category: 'sapling', active: true, stock: 10, price: 50 }; spOpts = MT.species.list.filter(function (s) { return s.id !== 'other'; }).map(function (s) { return '<option value="' + esc(s.id) + '"' + (l.speciesId === s.id ? ' selected' : '') + '>' + esc(s.common) + '</option>'; }).join(''); var photo = l.photo || '';
      kit.form({ title: create ? 'New listing' : 'Edit listing', wide: true, submit: create ? 'Publish listing' : 'Save', html:
        '<div class="field"><label for="l-cat">Type</label><select id="l-cat" name="category"><option value="sapling"' + (l.category === 'sapling' ? ' selected' : '') + '>Sapling</option><option value="bird"' + (l.category === 'bird' ? ' selected' : '') + '>Bird-care item</option></select></div>' +
        '<div class="field" id="l-sp-wrap"><label for="l-sp">Species</label><select id="l-sp" name="speciesId">' + spOpts + '</select></div><div class="field" id="l-bk-wrap" hidden><label for="l-bk">Item</label><select id="l-bk" name="birdKind">' + BIRD_KINDS.map(function (k) { return '<option>' + k + '</option>'; }).join('') + '</select></div>' +
        '<div class="field field-wide"><label for="l-title">Title</label><input id="l-title" name="title" maxlength="90" required value="' + esc(l.title || '') + '" placeholder="Neem sapling · 2 ft · polybag"></div><div class="field field-wide"><label for="l-desc">Description</label><textarea id="l-desc" name="description" rows="2" maxlength="300">' + esc(l.description || '') + '</textarea></div>' +
        '<div class="field"><label for="l-price">Price (₹ each)</label><input id="l-price" name="price" type="number" min="0" step="0.5" required value="' + l.price + '"></div><div class="field"><label for="l-stock">In stock</label><input id="l-stock" name="stock" type="number" min="0" max="100000" required value="' + l.stock + '"></div>' +
        '<div class="field field-wide"><label for="l-photo">Photo (optional)</label><input id="l-photo" type="file" accept="image/*"><p class="fine" id="l-pinfo">' + (photo ? 'Current photo kept unless you choose another.' : '') + '</p></div><label class="check field-wide"><input type="checkbox" name="active"' + (l.active ? ' checked' : '') + '><span>Visible to buyers</span></label>',
        onOpen: function (b) { var cat = b.querySelector('#l-cat'), tg = function () { var bird = cat.value === 'bird'; b.querySelector('#l-sp-wrap').hidden = bird; b.querySelector('#l-bk-wrap').hidden = !bird; }; cat.addEventListener('change', tg); tg();
          b.querySelector('#l-photo').addEventListener('change', function (e) { var f = e.target.files[0]; if (!f) return; MT.img.compress(f, { max: 220, quality: 0.7 }).then(function (r) { photo = r.dataUrl; b.querySelector('#l-pinfo').textContent = 'Photo ready (' + Math.round(photo.length / 1024) + ' KB).'; }).catch(ui.error); }); },
        onSubmit: function (v) {
          var price = +v.price, stock = parseInt(v.stock, 10); if (!v.title) throw MT.userError('Please add a title.'); if (!(price >= 0)) throw MT.userError('Enter a valid price.'); if (!(stock >= 0)) throw MT.userError('Enter the stock you have.'); if (photo.length > 24000) throw MT.userError('That photo is too large — choose a smaller one.');
          var d = { sellerId: p.userId, sellerName: sp.name || p.name, city: sp.city || '', state: sp.state || '', category: v.category, speciesId: v.category === 'sapling' ? v.speciesId : '', title: v.title.slice(0, 90), description: (v.description || '').slice(0, 300), price: price, stock: stock, photo: photo, active: !!v.active, updatedAt: Date.now() };
          if (v.category === 'bird') d.birdKind = v.birdKind;
          return (create ? MT.db.set('listings', MT.uid('l'), Object.assign(d, { createdAt: Date.now() })) : MT.db.update('listings', l.id, d)).then(function () { ui.success('Listing saved.'); return load(); });
        } });
    }
    function payForm() {
      kit.form({ title: 'How should buyers pay you?', submit: 'Save payment details', html:
        '<p class="field-wide muted">Buyers pay you directly. MyTree never touches the money — you confirm each order once it arrives.</p><div class="field"><label for="p-upi">UPI ID</label><input id="p-upi" name="upi" maxlength="80" value="' + esc(sp.upi || '') + '" placeholder="nursery@upi"></div><div class="field"><label for="p-ph">Phone</label><input id="p-ph" name="phone" type="tel" maxlength="30" value="' + esc(sp.phone || p.phone || '') + '"></div>' +
        '<div class="field"><label for="p-an">Account holder</label><input id="p-an" name="accountName" maxlength="80" value="' + esc(sp.accountName || '') + '"></div><div class="field"><label for="p-ac">Account number</label><input id="p-ac" name="accountNo" maxlength="30" value="' + esc(sp.accountNo || '') + '"></div><div class="field"><label for="p-if">IFSC</label><input id="p-if" name="ifsc" maxlength="20" value="' + esc(sp.ifsc || '') + '"></div><div class="field"><label for="p-bk">Bank</label><input id="p-bk" name="bank" maxlength="60" value="' + esc(sp.bank || '') + '"></div>' +
        '<div class="field field-wide"><label for="p-nt">Note for buyers (pickup address, delivery areas…)</label><textarea id="p-nt" name="payNote" rows="2" maxlength="250">' + esc(sp.payNote || '') + '</textarea></div>',
        onSubmit: function (v) { if (!v.upi && !v.accountNo) throw MT.userError('Add a UPI ID or a bank account number.'); return MT.db.get('orgs', p.orgId).catch(function () { return null; }).then(function (o) { var d = { name: (o && o.name) || p.name, city: (o && o.city) || '', state: (o && o.state) || '', upi: v.upi, accountName: v.accountName, accountNo: v.accountNo, ifsc: v.ifsc, bank: v.bank, phone: v.phone, payNote: v.payNote, active: true, updatedAt: Date.now() }; return MT.db.set('sellerProfiles', p.userId, d); }).then(function () { ui.success('Payment details saved.'); return load(); }); } });
    }
    body.addEventListener('click', function (e) {
      if (e.target.closest('#l-new')) { if (!(sp.upi || sp.accountNo)) { ui.toast('Add your payment details first.'); return payForm(); } listingForm(null); }
      else if (e.target.closest('#l-pay')) payForm();
      var ed = e.target.closest('[data-edit]'); if (ed) listingForm(listings.filter(function (l) { return l.id === ed.dataset.edit; })[0]);
      var dl = e.target.closest('[data-del]'); if (dl) ui.confirm('Delete this listing?', 'Existing orders are not affected.', 'Delete', true).then(function (ok) { if (ok) MT.db.delete('listings', dl.dataset.del).then(load).catch(ui.error); });
    });
    load().catch(function (e) { body.innerHTML = '<p class="muted">' + esc(MT.friendlyError(e)) + '</p>'; });
    return function () { dead = true; };
  }

  MT.router.add('/market', { title: 'Saplings shop', layout: 'app', access: ALLR, render: browse, after: browseAfter });
  MT.router.add('/market/orders', { title: 'Orders', layout: 'app', access: BUYERS.concat(['seller', 'super_admin']), render: ordersPage, after: ordersAfter });
  MT.router.add('/market/sell', { title: 'My listings', layout: 'app', access: ['seller'], render: sellPage, after: sellAfter });
})();
