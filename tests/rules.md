# Firestore rules — manual test matrix

Automated: `cd tests && npm install && npm test` (needs Node 18+ and Java for the emulator) runs `rules.test.js` (57 checks).
Manual: in the Firebase console → Firestore → **Rules → Rules playground**, simulate the requests below. ✅ = allowed, ❌ = denied.
Set up three profiles first (use the app itself): super admin, a school admin (approved) with one student, and a second school admin.

| # | Actor | Request | Expected |
|---|---|---|---|
| 1 | Unauthenticated | get `meta/setup` | ✅ |
| 2 | Unauthenticated | get `loginAliases/<studentId>` | ✅ (only `authEmail`,`active`) |
| 3 | Unauthenticated | list `loginAliases` | ❌ |
| 4 | Unauthenticated | get `stats/global`, query `stats` where `kind=='city'` | ✅ |
| 5 | Unauthenticated | get `stats/org_<id>`, list `users`, get `orgs/<id>` | ❌ |
| 6 | Unauthenticated | write anything | ❌ |
| 7 | New signed-in user, no profile | create `meta/setup` | ❌ (needs a super_admin profile in same batch) |
| 8 | First user | batch: `meta/setup` + `users/{uid}` (super_admin) + `userIds` | ✅ once; ❌ afterwards |
| 9 | Signed-in user | create own `users` profile as `individual`, ID ≤ counter | ✅ |
| 10 | Same | …with an ID that already exists in `userIds` | ❌ |
| 11 | Same | …with an ID greater than the counter | ❌ |
| 12 | Same | …as `super_admin`, or `school` with `active:true` | ❌ |
| 13 | Registering school | batch: `orgs` (pending) + `users` (inactive, pending) + `userIds` | ✅ |
| 14 | Pending school admin | update own `users.active` or own org `status` | ❌ |
| 15 | Pending school admin | read trees / other orgs | ❌ |
| 16 | Super admin | approve org + activate its user | ✅ |
| 17 | School admin | create `student` in own school (+ alias + userIds) | ✅ |
| 18 | School admin | create student in another school / create a `school` user | ❌ |
| 19 | Student | read own profile ✅, classmate's profile ❌ | as shown |
| 20 | Student | update own `role`, `orgId`, `active` ❌; own `name` ✅ | as shown |
| 21 | School admin | query `users` where `ancestorOrgIds array-contains <ownOrg>` | ✅ |
| 22 | Other school admin | same query for the first school | ❌ |
| 23 | School admin | change own student's `role` | ❌ |
| 24 | School admin | update alias of own student ✅, of another school's student ❌ | as shown |
| 25 | Foundation | read a school's student (school is beneath it) | ✅ |
| 26 | Foundation | suspend child org ✅; suspend itself ❌ | as shown |
| 27 | Suspended user (`active:false`) | read trees / orgs | ❌ (own profile still readable) |
| 28 | Any user | write `announcements` ❌; Super admin ✅ | as shown |
| 29 | Manager | append `auditLog` with own `actorUid` ✅; forged actor ❌; update/delete ❌ | as shown |
| 30 | Student | read a classmate's private tree ❌; own tree ✅; public tree (anyone) ✅ | as shown |

| 31 | Individual | create tree for self ✅; with another `ownerId` / forged `ancestorOrgIds` / wrong doc ID / `health:'great'` / `lat:123` ❌ | as shown |
| 32 | Student | create private tree ✅; `public:true` ❌ | as shown |
| 33 | School admin | create tree on behalf of own student (`postedBy`=admin, `onBehalfOf`=student) ✅; for another school's student ❌; without `onBehalfOf` ❌ | as shown |
| 34 | Owner | move pin ✅; change `ownerId` ❌; classmate edit ❌; manager delete ✅; stranger delete ❌ | as shown |
| 35 | Owner | create `photos` + `photoData` ✅; thumb > 45 KB or full > 900 KB ❌; classmate read ❌ | as shown |
| 36 | Any signed-in | reserve counter block ≤ 500 ✅; 700 or going backwards ❌ | as shown |

| 37 | Owner | post update + patch tree in one batch ✅; invalid health / > 4 photos / negative height ❌ | as shown |
| 38 | Anyone | attach an update to a tree owned by someone else, or post as another user ❌ | as shown |
| 39 | School admin | post update on behalf of own student ✅; other school ❌ | as shown |
| 40 | Owner / manager | read scoped updates ✅; classmate ❌; edit an update ❌; delete own ✅ | as shown |
| 41 | Owner / org admin | due-list query (scope + `orderBy lastUpdateAt`) ✅ | as shown |

| 42 | School admin | re-issue a student (new profile, old → replaced, repoint `userIds` + alias) ✅; another school ❌ | as shown |
| 43 | Re-issued student | reads own trees ✅; the replaced profile ❌ | as shown |
| 44 | Foundation | create school + admin user + `userIds` + alias in one batch ✅; admin then reads own org ✅ | as shown |
| 45 | User with `mustChangePassword` | clear the flag ✅; set it ❌ | as shown |
| 46 | Super admin | create a top-level organisation ✅; foundation without a parent ❌ | as shown |
| 47 | Foundation | add a student to a school beneath it ✅ | as shown |

Later phases add rows for stats coupling and bulk imports.
