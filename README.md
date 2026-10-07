# 🌳 MyTree — *Maitree, friendship with nature*

A complete tree-plantation tracking portal that is **just static files**: HTML, CSS and vanilla JavaScript, with Firebase (free Spark plan) as the optional backend. No build step, no server, no paid services.

* **Try it now:** double-click `index.html` → **Demo mode** (sample data stored in your browser, logins for every role).
* **Go live:** follow [`SETUP.md`](SETUP.md) (about 20 minutes, no coding).
* **Roadmap / architecture:** [`PLAN.md`](PLAN.md) · **Rules test matrix:** [`tests/rules.md`](tests/rules.md) · **QA checklist:** [`QA.md`](QA.md) · **Guides per role:** [`USER_GUIDE.md`](USER_GUIDE.md)

## Build status

| Phase | Scope | Status |
|---|---|---|
| 1 | Foundation: design system, landing, router, app shell, DB adapters (demo + Firebase), auth, role routing, 4-way registration, super-admin bootstrap, approval queue, security rules | ✅ done |
| 2 | Planting stepper, map picker, photo store, My Trees | next |
| 3 | Tree page, timeline, charts, before/after, cadence & notifications | |
| 4 | Students, sub-accounts, post-on-behalf, credentials PDF, password re-issue | |
| 5 | Bulk Excel/CSV import with validation | |
| 6 | Command centre, counters, maps, reports, green cover, audit viewer | |
| 7 | Gamification, certificates, public pages, PWA/offline, tours, i18n | |
| 8 | Polish, accessibility, performance, docs, QA | |

Nav items for features that are not built yet show a **Soon** pill and open a friendly placeholder, so the app is always runnable.

## Runtime modes

| Mode | When | Data |
|---|---|---|
| **DEMO** | `js/firebase-config.js` has no `apiKey`, or the URL has `?demo=1` | IndexedDB (→ localStorage → memory). Seeded with 1 super admin, 4 foundations (1 sub-foundation), 6 schools, 2 institutions, 2 pending orgs, ~120 students, 8 individuals, 2,000+ trees in 14 Indian cities. A ribbon offers **Reset demo data**. Demo logins are printed on the login page. |
| **LIVE** | Firebase config present | Firestore + Auth through the *same* code paths (adapters) |

Both adapters implement one contract (`MT.db`, documented at the top of `js/core/db.js`) plus an auth adapter (`MT.authAdapter`). Feature code never touches Firestore directly, so everything works in both modes.

## Folder map & script load order

```
index.html            shell + ordered <script defer> tags (classic scripts, not modules → works from file://)
css/                  tokens → base → components → layout → pages
js/firebase-config.js ← the only file you edit
js/core/              util → sri → loader → store → (data/i18n) i18n → db → db-demo → db-firebase → auth → ui → router → shell
js/data/              i18n, site contact details, species (107 species + impact factors), India cities
js/demo/seed.js       deterministic demo-data generator
js/features/          landing, auth-pages, dashboard, admin   (planting, trees, updates, bulk, maps, … in later phases)
js/boot.js            picks the mode, installs adapters, starts the router (always last)
firestore.rules  firestore.indexes.json  firebase.json
tools/gen-sri.mjs     optional SRI hash generator
tests/                rules.test.js (automated, needs Node + Java) and rules.md (manual matrix)
```
Each file is a self-contained IIFE that attaches to the `window.MT` namespace and is documented with JSDoc-style comments.

### Adding a page
```js
MT.router.add('/my-page', { title: 'My page', layout: 'app', access: ['school', 'foundation'],
  render: function (ctx) { return MT.html`<h2>Hello ${MT.auth.profile().name}</h2>`; },   // html`` escapes user text automatically
  after: function (el, ctx) { /* wire events */ return function destroy() {}; } });
```
Routes registered later replace earlier ones (that is how "Soon" placeholders are replaced by real features).

## Design decisions (recorded as requested)

1. **Human IDs are the ownership key.** `trees.ownerId` is the *userId* (e.g. `MT-STU-SCH001-0012`), not the Firebase uid, so re-issuing a password (which creates a new Auth account) never orphans a tree.
2. **`ancestorOrgIds` includes the entity's own org.** One `array-contains` / `in` check answers "is this inside my organisation tree?".
3. **Real e-mails vs. synthetic e-mails.** Individuals and self-registered organisations sign in with their real e-mail (so *forgot password* works). Only admin-created accounts (students, sub-accounts) use `<userid>@mytree.app` with a public `loginAliases/{userId}` doc `{authEmail, active}`. Putting real e-mails in a public alias document would leak them, so they never go there. Consequence: individuals and org admins sign in with e-mail; the login form still accepts either an ID or an e-mail.
4. **`userIds/{userId}` binds an ID to one uid.** Rules refuse a second claim, so nobody can register with someone else's ID and inherit their trees. IDs must also not exceed the issued counter.
5. **Counters for IDs** (`counters/{key}.n`) are incremented in Firestore transactions; rules only allow +1.
6. **Dates** are stored as epoch milliseconds or `YYYY-MM-DD` strings — never Date/Timestamp objects — so demo and live behave identically.
7. **Rules-provable queries.** Firestore cannot evaluate a list rule for a query that is not constrained by the rule's own condition. Org-scoped lists therefore always filter with `ancestorOrgIds array-contains <orgId>`; do the same in new code.
8. **Impact numbers are estimates** with formulas documented in `js/data/species.js`. The landing page's CO₂ figure uses `Σ(tree-years) × 21 kg`, where `Σ(tree-years)` is derived from two counters (`treesAlive`, `sumPlantedDayAlive`) that are updated atomically, so it needs no reads of the tree collection.
9. **Offline.** Firestore persistence is enabled in live mode; a banner shows when the browser is offline. (Service worker / installable PWA arrives in phase 7.)
10. **E-mail reminders are impossible without a server** (no Cloud Functions on the free plan). "Update due" is computed in the browser and shown in the notification centre; `.ics` calendar reminders are offered instead (phase 3).

## Libraries (all from CDNs, lazy-loaded)
Pinned versions in `js/core/loader.js` with a primary (cdnjs / unpkg / gstatic) and a fallback (jsDelivr) URL each; a failed load shows a friendly message rather than a blank page. Landing hero art, counters, reveals and the carousel are pure CSS/JS and work even if every CDN is blocked; Lucide icons, GSAP parallax, Leaflet and confetti degrade gracefully.

**SRI:** hashes cannot be baked in without downloading the files from the CDNs. Run `node tools/gen-sri.mjs` once on a machine with internet; it writes `js/core/sri.js` and the loader then adds `integrity` + `crossorigin` automatically. Until you do, libraries load without SRI.

## Security notes
* The Firebase web config is public by design; **`firestore.rules` is the real protection** (34 automated checks in `tests/rules.test.js`, run against the Firestore emulator).
* All user text is rendered through `MT.html` (auto-escaping) or `textContent`; DOMPurify is loaded for rich text. No inline event handlers are used on user data.
* Demo mode stores demo passwords in plain text *inside the browser only*; live mode never sees or stores passwords.
* Optional hardening (API-key restriction, App Check via `MT_APPCHECK_SITE_KEY`) is described in `SETUP.md`.

## Known limitations (Phase 1)
* Multi-chunk batches (> 400 operations) are atomic per chunk, not overall (Firestore limit).
* `stats/*` write rules only restrict *which fields* can be written; phase 6 couples them to tree writes with `getAfter()` as specified.
* Satellite/green-cover, certificates, bulk import, PWA install etc. are scheduled for later phases (see table).
