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

## Later phases (to be filled in as they ship)
- [ ] Plant a tree (single and many saplings, GPS, drag pin, polygon, EXIF prefill, photo compression sizes)
- [ ] Post update, cadence overdue badges, before/after slider, dead-tree → replanted link
- [ ] Post on behalf (audit row shows "Posted by Admin … on behalf of Student …")
- [ ] Student creation, credentials PDF/CSV, password re-issue (old password stops working, same ID keeps trees)
- [ ] Bulk import (trees, students, updates) with error report
- [ ] Admin dashboard counters, rebuild stats, reports export, impact report PDF
- [ ] Green-cover swipe comparison, photo ExG estimate, simulated label in demo
- [ ] PWA install, offline post then sync
