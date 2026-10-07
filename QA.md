# Manual QA checklist

Tick each box in **Demo mode** (`index.html`) and again in **Live mode**. Phase tags show when an item becomes testable.

## Phase 1 — Foundation
- [ ] Landing page loads from `file://` with no console errors; hero tree grows; counters animate; map shows city markers (needs internet for tiles).
- [ ] Block all CDNs (offline mode in DevTools): the page still renders and shows friendly fallbacks, never a blank screen.
- [ ] Theme toggle cycles auto/light/dark; language switcher changes nav and hero copy; text-size and high-contrast options work; `prefers-reduced-motion` stops animations.
- [ ] Keyboard only: Tab order is logical, focus ring is visible, Skip link works, Ctrl/Cmd+K opens the palette, Esc closes popovers and dialogs.
- [ ] **Register individual:** empty submit shows inline errors; bad e-mail, short password, mismatched passwords and unticked consent are all explained; success → confetti → dashboard with ID `MT-IND-…`.
- [ ] **Register school / institution / foundation:** all fields validated, logo preview works, success → *Awaiting approval* page with the org ID.
- [ ] Pending user cannot reach `#/dashboard` (redirected to `#/pending`); *Check status* works.
- [ ] **Approvals (super admin):** pending list, approve → org becomes active and the registrant can now sign in; reject with reason → registrant sees the reason; suspend → everyone beneath is locked out; reactivate restores them.
- [ ] Login by **user ID** (student) and by **e-mail**; wrong password shows a friendly message; forgot-password flow (live: e-mail arrives).
- [ ] Role routing: super admin → Command centre; others → Dashboard; visiting `#/admin` as a student shows a polite message and redirects.
- [ ] **Live only:** brand-new project shows *Create Super Admin* once; after creation `#/setup` redirects to login.
- [ ] Demo only: ribbon visible, *Reset demo data* restores the seed and signs you out; `?demo=1` forces demo even when Firebase is configured.
- [ ] Mobile (360 px and 390 px): no horizontal scroll, bottom tab bar + floating plant button, drawer opens from *More*, tap targets ≥ 44 px.
- [ ] 4K / ultrawide: layout stays centred and readable.
- [ ] Offline banner appears when the network is switched off.

## Phase 2 — Planting & trees
- [ ] Species search (type "neem", "mango", a scientific name, a typo); filter chips; "Other" requires a name; count +/− and typing; 100 max.
- [ ] Location: tap map, drag pin, search an address, **Use my current location** (allow and deny the permission), draw a plot polygon (area shown), clear it, switch Street/Satellite/Terrain, full-screen and Esc.
- [ ] Pin more than the organisation's city radius away → warning but can continue.
- [ ] Details: future date refused; photo from camera and gallery; size shown ≤ ~250 KB; a geotagged phone photo pre-fills location and date.
- [ ] Plant 1 and 5 saplings: success screen with animation, confetti, QR (downloadable), share card image, WhatsApp link, Web Share on mobile; 5 saplings get consecutive IDs and one shared plot ID.
- [ ] Planting the same species within 0.5 m asks for confirmation.
- [ ] Admin plants **on behalf of** a student (search by name or ID); the Audit log row/stat shows who posted for whom (full viewer arrives in phase 6).
- [ ] My Trees: grid/list/map toggle persists, filters (species, status, health, dates), sort, search, multi-select → set cadence, export CSV, delete with **Undo**; "Load older trees" past 500.
- [ ] Tree page: photo loads full-size on demand, QR, location mini-map, move pin, delete, copy link.
- [ ] `#/map`: clusters, health colours, popups, filters; panning loads new areas; super admin sees all, org admin sees subtree, student sees only own.
- [ ] Storage note shows photo usage; (live) warning appears above 70% of 1 GiB.
- [ ] Offline (live): plant while offline, reconnect, tree appears.

## Phase 3 — Growth updates
- [ ] Tree page: timeline shows planting + updates newest first with health chips, height, girth, notes, thumbnails; click a thumbnail → full photo.
- [ ] Post update: date limits (not future, not before planting), height/girth validation, up to 4 photos (camera + gallery) compressed, health picker (keyboard: arrows), notes. Tree health, height and counters change.
- [ ] Growth chart: points + dashed "typical growth" line, legend, tooltip, **View as table**; dark mode redraws correctly.
- [ ] Before/after: pick any two photos, drag or use arrow keys; Growth journey auto-plays on scroll, Play/Pause and scrubber work, reduced-motion disables autoplay.
- [ ] Weather card shows temperature, rain totals and advice (and degrades politely offline).
- [ ] Cadence select on the tree page (owner/admin); due badge text changes (Next update… / Due today / Overdue by N d).
- [ ] `#/updates`: summary tiles, Due / Coming up / All tabs, search, per-row Post update, multi-select → one update for several trees, photo drop-zone with files named `TREE-YYYY-NNNNNN.jpg`.
- [ ] Bell and the Updates nav badge show counts; **View all notifications** page lists what is due.
- [ ] Download `.ics` for one tree and for all trees; import into Google/Apple/Outlook — recurring event with a morning alert.
- [ ] Mark a tree **Dead** → status banner, no longer due, "Replant" pre-fills species and spot, replacement links back.
- [ ] Post an update as school admin for a student → timeline shows "Posted by … on behalf of …".

## Phase 4 — Hierarchy & accounts
- [ ] School admin: **Add student** (name, class, roll, optional contacts) → ID like `MT-STU-SCH001-0013` and an easy password shown once; Copy works; PDF and CSV download; the PDF prints 8 cards per A4 page with a scannable QR.
- [ ] The new student signs in with the **user ID** (any letter case) + password; with "ask to choose own password" ticked they are sent to Change password first.
- [ ] **Re-issue password:** old password stops working immediately, new works, same ID, trees and history intact; list shows no duplicate person.
- [ ] Deactivate → student sees "This account is not active"; Reactivate restores access.
- [ ] Edit name/class/roll/phone/guardian; bulk select → re-issue several (one sheet) / deactivate several.
- [ ] Admin signed-in session survives creating accounts (live: secondary Firebase app) — no logout, no flicker.
- [ ] Foundation: **Add organisation** (school, institution, sub-foundation) → admin credentials shown; the new admin must change the password at first sign-in; foundation sees the org with members/trees; suspend/reactivate a child; cannot suspend itself.
- [ ] Super admin: create a top-level organisation; People page shows everyone; re-issue for an individual.
- [ ] **Plant on behalf:** People → Actions → *Plant a tree for them* pre-selects the person; the tree belongs to them and its timeline/audit credit the admin ("Posted by … on behalf of …"). Posting an update on a student's tree does the same.
- [ ] A foundation sees trees of schools beneath it (Trees → My organisation, Map); a sibling school never sees them.

## Phase 5 — Bulk import
- [ ] Download each template (Trees, Students, Organisations, Updates): opens in Excel/LibreOffice/Google Sheets; Instructions sheet is protected; drop-downs appear for species/health/org type/state; count and coordinates reject out-of-range numbers; example rows are ignored on upload.
- [ ] Upload a file with a mix of good rows, typos (“Neemm”), future dates, swapped lat/lng, a non-numeric count, a missing owner and a duplicate: each is flagged red/amber with a clear reason; “Show all rows” toggles; the error-report CSV downloads.
- [ ] **Import valid rows only** → progress bar → result; tree counters and Map/My Trees show the new trees; admin imports for a student land under that student.
- [ ] 500+ trees import without errors (live: several batches); closing the tab mid-import leaves earlier batches saved and nothing half-written within a batch.
- [ ] Students import → credentials dialog with PDF/CSV appears immediately; the students can sign in.
- [ ] Organisations import (foundation) creates schools/sub-foundations with admin credentials.
- [ ] Updates import posts updates in date order; unknown tree IDs are rejected.
- [ ] After a trees import, **Post updates for these trees** lists exactly the imported trees; drop photos named by tree ID to attach them.
- [ ] CSV (comma and semicolon-free) and .xlsx both work; a .xls or wrong sheet shows a friendly message.

## Phase 6 — Super admin
- [ ] `#/admin` shows KPIs, state → city / organisation filters, circle map and 6+ charts; numbers come from `stats/*` counters (no scans). Charts that use a sample say so.
- [ ] `#/admin/health`: struggling / dead / overdue lists; "Send reminders" creates notifications that appear in the owner's bell.
- [ ] `#/admin/audit` lists actions (also visible, scoped, to foundations / schools).
- [ ] `#/admin/reports`: pick dataset, filter, sort, paginate; CSV, Excel and PDF exports download. Impact PDF per organisation / whole portal.
- [ ] `#/admin/settings`: announcements, species edit (persists, used by CO₂ maths), **Rebuild statistics** ("N counters recomputed"; run twice → no changes), **Sample data** (live only): load, remove.
- [ ] `#/green` / `#/green/:plotId`: ground estimate, photo ExG estimate, swipe before/after; satellite provider shows "not configured"; *simulated* readings exist only in demo and are labelled.
- [ ] Live: counters after sample load equal counters after rebuild (verified: 0 differences).

## Later phases (to be filled in as they ship)
- [ ] Admin dashboard counters, rebuild stats, reports export, impact report PDF
- [ ] Green-cover swipe comparison, photo ExG estimate, simulated label in demo
- [ ] PWA install, offline post then sync
