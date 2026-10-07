# MyTree user guide (short)

*Sections marked "coming soon" arrive in later build phases; the app shows a **Soon** pill next to those menu items.*

## Everyone
* **Sign in:** use your **user ID** (students) or **e-mail**. Forgot your password? Individuals and organisations use *Forgot your password?* on the sign-in page. Students ask their teacher for a new one.
* **Search anything:** press **Ctrl + K** (⌘ + K on Mac) to jump to a page or run an action.
* **Make it comfortable:** the sliders icon in the top bar changes theme, language, text size and contrast.
* **Phone:** use the bottom bar; the round **+** button is *Plant a tree*. Add MyTree to your home screen for an app-like experience (coming soon).

## Planting a tree (everyone)
1. Tap **Plant a tree** (the round **+** on phones).
2. **Species:** search by common or scientific name. Choose how many saplings — each gets its own ID and QR code.
3. **Location:** tap the map, drag the pin, search an address or press **Use my current location**. Use the layers button for satellite. Optionally mark the whole plot area.
4. **Details:** planting date, a photo (camera or gallery), a dedication, how often you will post updates.
5. **Review → Confirm.** Share the card on WhatsApp or print the QR code.
**My trees** shows your trees as a grid, list or map; select several to export or delete (you can undo for a few seconds). School, institution and foundation admins can plant *on behalf of* anyone beneath them — it is recorded in the audit log.

## Growth updates (everyone)
Open a tree and tap **Post update** — add a photo, its height, how it looks (Thriving … Dead) and a note. The **Updates** page lists trees that are due or overdue (based on the weekly / monthly / yearly rhythm you chose), lets you update several trees at once, and accepts a batch of photos named with tree IDs. The bell shows what is due. MyTree cannot send e-mail reminders on the free plan, so use **Add reminders (.ics)** to put recurring reminders in your phone calendar. On a tree page you also get a growth chart, a before/after slider, a growth-journey movie, local weather and season-aware care tips. If a tree dies, mark it *Dead* and choose **replant** to link a new tree to it.

## Adding people and organisations (admins)
* **School / institution admin → People → Add student.** Enter the name (class and roll optional). MyTree creates a user ID and an easy password and shows them **once** — copy them, or download the **printable PDF** (cards with a QR to the sign-in page) or the **CSV**. Passwords are never stored, so a forgotten one is replaced with **Actions → Re-issue password**: the old password stops working, the user ID and all trees stay.
* **Plant or post for someone:** People → Actions → *Plant a tree for them*, or open any of their trees and post an update. It is recorded as “Posted by you on behalf of …”.
* **Deactivate** pauses an account without deleting anything; **Reactivate** brings it back.
* **Foundation → Organisations → Add organisation** creates a sub-foundation, school or institution together with its administrator account (you get the sign-in details once; the new admin picks their own password at first sign-in). Super admins can also create top-level organisations.
* Anyone can change their own password from the account menu.

## Bulk upload (everyone)
Open **Bulk upload**, choose what to add, press **Download Excel template**, fill in the Data sheet (use the drop-downs; the grey example rows are ignored) and drop the file back in. You will see every problem explained in plain language — red rows are skipped, amber rows import with a warning. Choose **Import valid rows**, then **Post updates for these trees** to add first updates, or drop photos named with each tree ID. Student and organisation imports show the sign-in details (PDF/CSV) right away. Up to 5,000 rows per file.

## Individual
1. *Get started → Individual*, fill in your details and tick the privacy box. You are active immediately and receive a user ID like `MT-IND-000123`.
2. Plant trees, post growth updates and download certificates (coming soon).

## School or Institution admin
1. *Get started → School / Institution*. Enter your registration number and contact details. A super admin approves you — check progress on the *Awaiting approval* page.
2. Once approved you can add students one by one or in bulk, print their login cards, post trees and updates for them, and see the school leaderboard (coming soon).

## Foundation
1. *Get started → Foundation* and wait for approval.
2. Create sub-foundations and school/institution admin accounts, and view roll-up dashboards across everything beneath you (coming soon).

## Student
Your teacher gives you a **user ID** and **password** (for example `Maple-River-4821`). Sign in, plant trees and post updates. You only see your own trees and your school's leaderboard.

## Super admin
* On a brand-new live site you create the first Super Admin on the one-time setup screen.
* **Approvals:** review each new organisation → *Approve*, *Reject* (with a reason) or later *Suspend* / *Reactivate*. Suspending an organisation also pauses its students and sub-accounts.
* The full command centre, reports and audit log arrive in phase 6.

### Super admin — command centre (Phase 6)
* **Command centre** (`Admin`): live totals, filter by state → city or organisation, charts and map. Numbers are pre-computed counters, so the page is fast and costs almost no Firestore reads.
* **Tree health**: see struggling, dead and overdue trees; send reminders to owners in one click.
* **Reports**: choose trees, organisations, people or updates; filter and sort; export CSV, Excel or PDF. *Impact report* PDFs can be produced for one organisation or the whole portal.
* **Audit log**: who did what and when.
* **Settings**: announcements banner, species data (CO₂ per year, growth, canopy), *Rebuild statistics* (use if numbers ever look off), and *Sample data* (live mode) to explore with ready-made schools and trees; remove it with one click.
* **Green cover**: each planting site can be measured three honest ways — on-ground estimate, photo analysis (share of green pixels, computed in your browser) and, if you configure a provider, satellite imagery. Without a provider it says so; nothing is made up.
