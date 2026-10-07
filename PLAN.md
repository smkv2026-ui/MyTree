# MyTree — Plan

> "Maitree — friendship with nature." A no-build, static, Firebase-Spark-plan tree-plantation portal.

## 1. Principles

* **No build step.** Classic `<script defer>` tags, global namespace `window.MT`. Opens from `file://` (demo mode) or any static host.
* **One data-layer interface (`MT.db`) + one auth adapter (`MT.authAdapter`)**, two implementations:
  `demo` (IndexedDB → localStorage → memory) and `firebase` (Firestore + Auth, compat v10 CDN builds).
  All feature code talks to `MT.db` / `MT.auth` only.
* **Heavy libs are lazy** (`MT.loader.load('leaflet')`), each with a primary + fallback CDN and friendly failure.
* **Free tier only:** Auth + Firestore (+ optional Hosting). Photos are compressed and stored as Firestore docs behind `MT.photoStore`.
* **Security lives in `firestore.rules`**, not in the client.

## 2. File structure

```
index.html                 shell: head, preconnects, noscript, script load order
manifest.json, sw.js       PWA (phase 7)
firestore.rules            security rules (grows per phase)
firestore.indexes.json     composite indexes
SETUP.md README.md USER_GUIDE.md QA.md PLAN.md
tests/rules.md             manual rules test matrix
css/tokens.css             design tokens (light/dark, spacing, type, shadows)
css/base.css               reset, typography, a11y, motion
css/components.css         buttons, forms, cards, chips, toast, modal, table, skeleton…
css/layout.css             public header/footer, app shell, sidebar, bottom tabs
css/pages.css              landing, auth, dashboard, admin
js/firebase-config.js      <-- the ONLY file the owner edits
js/core/util.js            MT namespace, html`` escaping, ids, dates, storage, geohash
js/core/loader.js          lazy CDN loader w/ fallbacks, SRI map
js/core/store.js           tiny observable state (session, theme, lang…)
js/core/i18n.js + js/data/i18n.js
js/core/db.js              MT.db contract + shared helpers (inc sentinel, batch chunking)
js/core/db-demo.js         demo adapter (+ MT.kv persistence)
js/core/db-firebase.js     Firestore adapter + Firebase auth adapter
js/core/auth.js            business logic: login, register, bootstrap, approvals, aliases
js/core/ui.js              icons, toast, modal, ripple, counters, reveal, confetti, skeleton
js/core/router.js          hash router, guards, layouts, transitions
js/core/shell.js           public layout + app shell (sidebar, topbar, tabs, palette, settings)
js/data/species.js         100+ species, care tips, CO2 / canopy factors (documented)
js/data/geo.js             Indian cities / states
js/demo/seed.js            deterministic demo seed generator
js/features/landing.js     public landing page
js/features/auth-pages.js  login, register, setup, pending, forgot
js/features/dashboard.js   role home
js/features/admin.js       approvals (phase 1) → command centre (phase 6)
js/features/<planting|trees|updates|bulk|maps|greencover|gamification|certificates>.js   later phases
js/boot.js                 detect mode, load adapters, init, start router
assets/logo.svg  assets/leaf.svg  assets/icons/*
```

### Script load order (index.html)
`firebase-config → util → loader → store → i18n data → i18n → db → db-demo → db-firebase → auth → ui → data → seed → router → shell → features → boot`

## 3. Runtime modes
`MT.mode = 'live'` when `MT_FIREBASE_CONFIG.apiKey` is set and URL has no `?demo=1`; else `'demo'`.
Demo: seeded on first run; ribbon "Demo mode · Reset demo data".

## 4. Data model (Firestore)

| collection | key | notes |
|---|---|---|
| `users/{authUid}` | auth uid | `userId` (human ID), `role`, `orgId`, `ancestorOrgIds[]` (includes own org), `active`, `status`, `name`, `email`, … |
| `orgs/{orgId}` | e.g. `MT-SCH-000045` | `type`, `parentOrgId`, `ancestorOrgIds[]` (includes self), `status` pending/approved/suspended/rejected |
| `loginAliases/{userId}` | human ID | `{authEmail, active}` only; **managed accounts only** (students, sub-accounts) |
| `counters/{key}` | e.g. `IND`, `STU_MT-SCH-000045`, `TREE_2026` | `{n}` bumped in transactions |
| `meta/setup` | — | created once with first super admin |
| `stats/global`, `stats/org_{id}`, `stats/region_{k}` | — | denormalised counters (`FieldValue.increment`) |
| `trees`, `plots`, `treeUpdates`, `photos`, `greenCoverReadings` | tree code | phase 2+ (`ownerId` = human userId, stable across password reissues) |
| `notifications`, `badges`, `userBadges`, `importJobs`, `auditLog`, `announcements`, `species` | | later phases |

**Decisions**
* `ownerId` is the *human userId*, not the auth uid, so password re-issue (new auth account) keeps ownership.
* Individuals and self-registered org admins use their **real e-mail** as the Auth e-mail (so "forgot password" works). Only admin-created accounts get `<userid>@mytree.app` + a public alias doc. This avoids leaking real e-mails through the public alias collection.
* `ancestorOrgIds` always includes the entity's own org so one `in` check covers "my org or any ancestor".

## 5. Route map

| route | access | phase |
|---|---|---|
| `#/` | public landing | 1 |
| `#/login` `#/register` `#/register/:type` `#/forgot` | public | 1 |
| `#/setup` | only when `meta/setup` missing | 1 |
| `#/pending` | org admin awaiting approval | 1 |
| `#/dashboard` | any signed-in | 1 |
| `#/admin` `#/admin/approvals` | super_admin | 1 |
| `#/plant` `#/trees` `#/trees/:id` | signed-in | 2–3 |
| `#/updates` `#/notifications` | signed-in | 3 |
| `#/people` `#/orgs` `#/credentials` | org admins / foundation | 4 |
| `#/bulk` | all roles (template varies) | 5 |
| `#/admin/*` command centre, reports, audit, green cover | super_admin | 6 |
| `#/map` `#/forest` (public aggregate map) | signed-in / public | 2 / 6 |
| `#/t/:code` public tree page | public if `public:true` | 7 |
| `#/help` `#/leaderboard` `#/badges` | signed-in | 7 |

## 6. Build order

1. **Foundation** — tokens/components, landing, router, shell, DB+auth adapters, registration ×4, bootstrap, approval queue. *(commit)*
2. Planting — IDs, stepper, map picker, photoStore, My Trees. *(commit)*
3. Updates — tree page, timeline, charts, slider, cadence, notifications. *(commit)*
4. Hierarchy — students, sub-accounts, on-behalf, credentials PDF, reissue. *(commit)*
5. Bulk — ExcelJS templates, validate/import. *(commit)*
6. Super admin — command centre, counters, maps, reports, green cover, audit. *(commit)*
7. Extras — gamification, certificates, public pages, PWA, tours, palette, i18n. *(commit)*
8. Polish — animation, a11y, perf, rules review, docs, QA. *(commit)*
