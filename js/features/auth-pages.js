/**
 * MyTree — login, registration (4 account types), first-run super-admin setup, pending-approval and forgot-password pages.
 */
(function () {
  'use strict';
  var MT = window.MT, h = MT.html, raw = MT.raw, ui = MT.ui, F = ui.field;

  var TYPES = {
    individual: { icon: 'user-round', title: 'Individual', blurb: 'Plant trees for yourself or your family. Instant activation.' },
    school: { icon: 'school', title: 'School', blurb: 'Add students, post for them and run class challenges. Needs approval.' },
    institution: { icon: 'graduation-cap', title: 'Institution', blurb: 'Colleges, companies and clubs. Needs approval.' },
    foundation: { icon: 'heart-handshake', title: 'Foundation', blurb: 'Manage many schools and sub-foundations. Needs approval.' }
  };
  var CONSENT = h`I agree to the <a href="#/help" target="_blank" rel="noopener">privacy notice</a>: my details are used only to run MyTree, photos of minors are never shown publicly by default, and I can ask for my data to be removed.`;
  var pwRule = function (v) { return MT.valid.password(v) ? '' : 'Use at least 8 characters.'; };
  var emailRule = function (v) { return MT.valid.email(v) ? '' : 'That e-mail address does not look right (example: name@school.org).'; };

  function goAfterAuth(next) {
    MT.shell.reset();
    var to = next && next.charAt(0) === '/' && next.indexOf('//') !== 0 ? next : MT.auth.homeRoute();
    MT.router.go(to);
  }

  /* ---------- Login ---------- */
  function login(ctx) {
    var demo = MT.mode === 'demo';
    var accts = demo ? MT.seed.accounts() : [];
    return h`<div class="auth-card" data-reveal>
      <h1 class="auth-title">Welcome back</h1><p class="auth-sub">Sign in with your <strong>user ID</strong> (students) or <strong>e-mail</strong>.</p>
      <form id="login-form" class="form" autocomplete="on">
        ${F({ id: 'login', label: 'User ID or e-mail', required: true, autocomplete: 'username', placeholder: 'MT-STU-SCH001-0012 or name@example.com', attrs: 'autocapitalize="off" spellcheck="false"' })}
        ${F({ id: 'password', label: 'Password', type: 'password', required: true, autocomplete: 'current-password' })}
        <button class="btn btn-primary btn-block btn-lg" type="submit"><span class="btn-label">Sign in</span><span class="spinner-sm"></span></button>
      </form>
      <p class="auth-links"><a href="#/forgot">Forgot your password?</a><span>New here? <a href="#/register">Create an account</a></span></p>
      ${demo ? h`<details class="demo-panel" open><summary>${ui.icon('flask-conical')} Try a demo account</summary>
        <p class="fine">All demo passwords are <code>${MT.seed.password}</code>. Click “Use” to sign in instantly.</p>
        <ul class="demo-list">${accts.map(function (a, i) { return h`<li><div><strong>${a.label}</strong><small>${a.login}</small><small>${a.note}</small></div><button type="button" class="btn btn-soft btn-sm" data-demo="${i}">Use</button></li>`; })}</ul></details>` : ''}
    </div>`;
  }
  function loginAfter(host, ctx) {
    var f = MT.$('#login-form', host);
    function doLogin(v) {
      return MT.auth.login(v.login, v.password).then(function (s) {
        ui.success('Welcome back, ' + s.profile.name.split(' ')[0] + '!');
        goAfterAuth(ctx.query.next);
      });
    }
    ui.form(f, {}, doLogin);
    MT.$$('[data-demo]', host).forEach(function (b) {
      b.addEventListener('click', function () {
        var a = MT.seed.accounts()[+b.dataset.demo];
        f.elements.login.value = a.login; f.elements.password.value = a.password;
        b.disabled = true;
        doLogin({ login: a.login, password: a.password }).catch(ui.error).then(function () { b.disabled = false; });
      });
    });
    var first = f.elements.login; if (first && !MT.$('details.demo-panel[open]', host)) first.focus();
  }

  /* ---------- Register: choose type ---------- */
  function registerChoose() {
    return h`<div class="auth-card auth-card-wide" data-reveal>
      <h1 class="auth-title">Join MyTree</h1><p class="auth-sub">Who is planting? Pick the one that fits you best.</p>
      <div class="type-grid">${Object.keys(TYPES).map(function (k) { var t = TYPES[k];
        return h`<a class="type-card card-lift" href="#/register/${k}"><span class="role-ic">${ui.icon(t.icon)}</span><h2 class="as-h3">${t.title}</h2><p>${t.blurb}</p><span class="type-go">Continue ${ui.icon('arrow-right')}</span></a>`; })}</div>
      <p class="auth-links"><span>Already have an account? <a href="#/login">Sign in</a></span></p></div>`;
  }

  /* ---------- Register: forms ---------- */
  function registerForm(ctx) {
    var type = ctx.params.type, t = TYPES[type];
    if (!t) return h`<div class="auth-card"><h1 class="auth-title">Unknown account type</h1><p><a href="#/register">Choose again</a></p></div>`;
    var isOrg = type !== 'individual';
    var cityOpts = MT.geoData.cities.map(function (c) { return c.name; });
    return h`<div class="auth-card auth-card-wide" data-reveal>
      <a class="back-link" href="#/register">${ui.icon('arrow-left')} All account types</a>
      <h1 class="auth-title">${isOrg ? 'Register your ' + type : 'Create your account'}</h1>
      <p class="auth-sub">${isOrg ? 'A MyTree super admin will review your details — usually within 1–2 working days. You can sign in meanwhile to check the status.' : 'It takes less than a minute. You can plant your first tree right after.'}</p>
      <form id="reg-form" class="form form-grid">
        ${isOrg ? h`
          ${F({ id: 'name', label: type === 'school' ? 'School name' : type === 'institution' ? 'Institution name' : 'Foundation name', required: true, autocomplete: 'organization', wide: true })}
          ${F({ id: 'regNo', label: 'Registration number', required: true, hint: 'As on your registration certificate, e.g. society / trust / UDISE no.' })}
          ${F({ id: 'address', label: 'Address', required: true, autocomplete: 'street-address' })}
          ${F({ id: 'city', label: 'City', required: true, autocomplete: 'address-level2', attrs: 'list="city-list"' })}
          <datalist id="city-list">${cityOpts.map(function (c) { return h`<option value="${c}">`; })}</datalist>
          ${F({ id: 'state', label: 'State', type: 'select', required: true, options: [{ value: '', label: 'Select state…' }].concat(MT.geoData.states) })}
          ${F({ id: 'country', label: 'Country', required: true, value: 'India' })}
          ${F({ id: 'contactName', label: 'Contact person', required: true, autocomplete: 'name' })}
          ${F({ id: 'phone', label: 'Phone', type: 'tel', required: true, autocomplete: 'tel' })}
          ${F({ id: 'email', label: 'E-mail (used to sign in)', type: 'email', required: true, autocomplete: 'email' })}
          <div class="field field-wide"><label for="logo">Logo (optional)</label><div class="logo-pick"><div class="logo-prev" id="logo-prev" aria-hidden="true">${ui.icon('image')}</div><input type="file" id="logo" name="logo" accept="image/*"><p class="field-hint">We shrink it automatically. PNG or JPG.</p></div></div>
        ` : h`
          ${F({ id: 'name', label: 'Full name', required: true, autocomplete: 'name' })}
          ${F({ id: 'email', label: 'E-mail', type: 'email', required: true, autocomplete: 'email' })}
          ${F({ id: 'phone', label: 'Phone (optional)', type: 'tel', autocomplete: 'tel' })}
        `}
        ${F({ id: 'password', label: 'Password', type: 'password', required: true, autocomplete: 'new-password', hint: 'At least 8 characters.' })}
        ${F({ id: 'password2', label: 'Confirm password', type: 'password', required: true, autocomplete: 'new-password' })}
        <div class="field-wide">${F({ id: 'consent', type: 'checkbox', required: true, label: '', labelHtml: CONSENT })}</div>
        <div class="field-wide"><button class="btn btn-primary btn-block btn-lg" type="submit"><span class="btn-label">${isOrg ? 'Submit for approval' : 'Create my account'}</span><span class="spinner-sm"></span></button></div>
      </form></div>`;
  }
  function registerAfter(host, ctx) {
    var type = ctx.params.type, isOrg = type !== 'individual', logo = '';
    var f = MT.$('#reg-form', host); if (!f) return;
    var lf = MT.$('#logo', host);
    if (lf) lf.addEventListener('change', function () {
      if (!lf.files[0]) return;
      MT.img.compress(lf.files[0], { max: 256, quality: 0.82 }).then(function (r) {
        logo = r.dataUrl; var p = MT.$('#logo-prev', host); p.innerHTML = ''; var im = new Image(); im.alt = 'Logo preview'; im.src = logo; p.appendChild(im);
      }).catch(ui.error);
    });
    ui.form(f, {
      email: emailRule, password: pwRule, phone: function (v) { return MT.valid.phone(v) ? '' : 'Enter a valid phone number.'; },
      password2: function (v, all) { return v === all.password ? '' : 'The two passwords do not match.'; }
    }, function (v) {
      if (isOrg) return MT.auth.registerOrg(type, { name: v.name, regNo: v.regNo, address: v.address, city: v.city, state: v.state, country: v.country, contactName: v.contactName, phone: v.phone, email: v.email, password: v.password, logo: logo })
        .then(function () { MT.shell.reset(); ui.success('Registration received. We will review it shortly.'); MT.router.go('/pending'); });
      return MT.auth.registerIndividual({ name: v.name, email: v.email, phone: v.phone, password: v.password }).then(function (s) {
        MT.shell.reset(); ui.confetti(); ui.success('Welcome to MyTree, ' + v.name.split(' ')[0] + '! 🌱'); MT.router.go('/dashboard');
      });
    });
  }

  /* ---------- First-run Super Admin ---------- */
  function setup() {
    return h`<div class="auth-card" data-reveal>
      <p class="eyebrow">First-time setup</p><h1 class="auth-title">Create the Super Admin</h1>
      <p class="auth-sub">This one-time screen appears because your database is new. The Super Admin approves organisations and sees everything. After this account is created, this screen disappears for good.</p>
      <form id="setup-form" class="form">
        ${F({ id: 'name', label: 'Your full name', required: true, autocomplete: 'name' })}
        ${F({ id: 'email', label: 'E-mail', type: 'email', required: true, autocomplete: 'email' })}
        ${F({ id: 'password', label: 'Password', type: 'password', required: true, autocomplete: 'new-password', hint: 'At least 8 characters. Keep it safe.' })}
        ${F({ id: 'password2', label: 'Confirm password', type: 'password', required: true, autocomplete: 'new-password' })}
        <button class="btn btn-primary btn-block btn-lg" type="submit"><span class="btn-label">Create Super Admin</span><span class="spinner-sm"></span></button>
      </form></div>`;
  }
  function setupAfter(host) {
    ui.form(MT.$('#setup-form', host), { email: emailRule, password: pwRule, password2: function (v, a) { return v === a.password ? '' : 'The two passwords do not match.'; } }, function (v) {
      return MT.auth.bootstrapSuperAdmin(v).then(function () { MT.state.needsSetup = false; MT.shell.reset(); ui.confetti(); ui.success('Super Admin created. Welcome aboard!'); MT.router.go('/admin'); });
    });
  }

  /* ---------- Pending approval ---------- */
  function pending() {
    var s = MT.auth.session(), p = s.profile, org = s.org;
    var st = org ? org.status : p.status;
    var copy = {
      pending: ['Awaiting approval', 'Thank you for registering! A MyTree super admin is reviewing your details. You will be able to use everything as soon as you are approved — usually within 1–2 working days.'],
      rejected: ['Registration not approved', 'Unfortunately we could not approve this registration.' + (org && org.statusReason ? ' Reason: ' + org.statusReason : '') + ' Please contact us if you think this is a mistake.'],
      suspended: ['Account suspended', 'This account has been paused by an administrator.' + (org && org.statusReason ? ' Reason: ' + org.statusReason : '') + ' Please contact us to resolve this.']
    }[st] || ['Account inactive', 'This account is not active yet. Please contact your administrator.'];
    return h`<div class="auth-card" data-reveal><div class="pending-art">${ui.icon(st === 'pending' ? 'hourglass' : 'shield-alert')}</div>
      <h1 class="auth-title">${copy[0]}</h1><p class="auth-sub">${copy[1]}</p>
      ${org ? h`<dl class="kv"><dt>Organisation</dt><dd>${org.name}</dd><dt>ID</dt><dd><code>${org.id}</code></dd><dt>City</dt><dd>${org.city}, ${org.state}</dd><dt>Status</dt><dd>${ui.statusBadge(org.status)}</dd></dl>` : ''}
      <div class="btn-row"><button class="btn btn-soft" id="pend-refresh">${ui.icon('refresh-cw')} Check status</button><button class="btn btn-ghost" data-act="logout">Sign out</button></div>
      <p class="fine">Questions? Write to <a href="mailto:${MT.site.contactEmail}">${MT.site.contactEmail}</a>.</p></div>`;
  }
  function pendingAfter(host) {
    MT.$('#pend-refresh', host).addEventListener('click', function () {
      MT.auth.refresh().then(function () { if (MT.auth.isActive()) { ui.confetti(); ui.success('You are approved — welcome!'); MT.shell.reset(); MT.router.go(MT.auth.homeRoute()); } else { MT.shell.reset(); MT.router.refresh(); ui.toast('Still waiting — we will get to you soon.'); } });
    });
  }

  /* ---------- Forgot password ---------- */
  function forgot() {
    return h`<div class="auth-card" data-reveal><a class="back-link" href="#/login">${ui.icon('arrow-left')} Back to sign in</a>
      <h1 class="auth-title">Forgot your password?</h1>
      <p class="auth-sub">Enter your registered e-mail and we will send you a reset link. <strong>Students:</strong> ask your teacher or school admin to issue a new password.</p>
      <form id="forgot-form" class="form">${F({ id: 'email', label: 'E-mail', type: 'email', required: true, autocomplete: 'email' })}
      <button class="btn btn-primary btn-block btn-lg" type="submit"><span class="btn-label">Send reset link</span><span class="spinner-sm"></span></button></form></div>`;
  }
  function forgotAfter(host) {
    ui.form(MT.$('#forgot-form', host), { email: emailRule }, function (v) {
      return MT.auth.forgot(v.email).then(function () {
        ui.success(MT.mode === 'demo' ? 'Demo mode: no e-mail is sent. In live mode a reset link would arrive.' : 'If that e-mail is registered, a reset link is on its way.', { duration: 6000 });
        MT.router.go('/login');
      });
    });
  }

  MT.router.add('/login', { title: 'Sign in', layout: 'auth', access: 'guest', render: login, after: loginAfter });
  MT.router.add('/register', { title: 'Join MyTree', layout: 'auth', access: 'guest', render: registerChoose });
  MT.router.add('/register/:type', { title: 'Register', layout: 'auth', access: 'guest', render: registerForm, after: registerAfter });
  MT.router.add('/setup', { title: 'First-time setup', layout: 'auth', access: 'public', render: setup, after: setupAfter });
  MT.router.add('/pending', { title: 'Account status', layout: 'auth', access: 'auth', render: pending, after: pendingAfter });
  MT.router.add('/forgot', { title: 'Reset password', layout: 'auth', access: 'guest', render: forgot, after: forgotAfter });
})();
