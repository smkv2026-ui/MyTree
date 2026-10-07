# MyTree — Setup guide (beginner friendly)

You need: a Google account, a web browser, and the MyTree folder. **No coding, no installs.**
Total time: about 20 minutes. Everything runs on Firebase's **free Spark plan** — no credit card.

> **Just want to look around first?** Double-click `index.html`. With no Firebase settings pasted in, MyTree runs in **Demo mode** with sample data stored only in your browser. Come back here when you want the real thing.

---

## The five manual steps at a glance
1. Create a Firebase project
2. Paste its web config into **one file**: `js/firebase-config.js`
3. Paste `firestore.rules` into the Firebase console
4. Turn on **Email/Password** sign-in
5. Put the folder online and add your web address to **Authorized domains**

---

## Step 1 — Create a Firebase project
1. Go to **https://console.firebase.google.com** and sign in with your Google account.
2. Click the big **Create a project** (or **Add project**) card.
3. Type a name, for example `mytree-yourschool`, and click **Continue**.
4. On the *Google Analytics* screen, switch the toggle **off** (you don't need it) and click **Create project**.
5. Wait for "Your new project is ready", then click **Continue**. You are now on the project's home page.

## Step 2 — Register the web app and copy its config
1. On the project home page, click the round **`</>`** (Web) icon under "Get started by adding Firebase to your app".
2. For *App nickname* type `MyTree web`. **Leave "Also set up Firebase Hosting" unticked** (you can do that later). Click **Register app**.
3. You will see a code box that starts with `const firebaseConfig = { apiKey: "...", authDomain: "...", ... }`. Copy **only the lines between the curly braces**.
4. Open the file **`js/firebase-config.js`** in any text editor (Notepad is fine) and paste the values so it looks like this:
   ```js
   window.MT_FIREBASE_CONFIG = {
     apiKey: "AIzaSy...",
     authDomain: "mytree-yourschool.firebaseapp.com",
     projectId: "mytree-yourschool",
     storageBucket: "mytree-yourschool.appspot.com",
     messagingSenderId: "1234567890",
     appId: "1:1234567890:web:abcdef"
   };
   ```
5. Save the file. Back in Firebase, click **Continue to console**.

> **Is it safe to put this in a public file?** Yes. The web config only *identifies* your project; it is not a password. Your data is protected by the **security rules** from Step 3 (and optional extras at the bottom). Never put a *service account* key or any other secret in this folder.

## Step 3 — Create the database and paste the rules
1. In the left menu click **Build → Firestore Database**, then **Create database**.
2. Choose a location close to your users (for India pick **asia-south1 (Mumbai)**). The location cannot be changed later. Click **Next**.
3. Choose **Start in production mode** and click **Create**. Wait a minute while it provisions.
4. Open the **Rules** tab (top of the Firestore page). Select everything in the editor and delete it.
5. Open **`firestore.rules`** from the MyTree folder, copy **all** of it, paste it into the editor and click **Publish**. You should see "Rules published".

*(Developers can use `firebase deploy --only firestore` instead — `firebase.json` is included.)*

### Indexes (only if prompted)
Most screens need no extra setup. If a page ever shows "The query requires an index", open the browser's developer console (F12 → Console); Firebase prints a long link — click it, press **Create index**, wait 2–5 minutes and refresh. Or import all indexes at once with `firebase deploy --only firestore:indexes` (uses `firestore.indexes.json`).

## Step 4 — Enable Email/Password sign-in
1. In the left menu click **Build → Authentication**, then **Get started**.
2. Open the **Sign-in method** tab and click **Email/Password**.
3. Switch **Enable** on (leave "Email link (passwordless)" off) and click **Save**.

## Step 5 — Put MyTree online and authorise the domain
Pick **one** of the options. All of them just serve the folder as static files.

**Option A — Netlify drag-and-drop (easiest)**
1. Go to **https://app.netlify.com/drop** (create a free account if asked).
2. Drag the whole **MyTree folder** onto the page. In a few seconds you get an address like `https://wonderful-name-123.netlify.app`.

**Option B — GitHub Pages**
1. Upload the folder to a GitHub repository. In the repository open **Settings → Pages**.
2. Under *Build and deployment* choose **Deploy from a branch**, pick `main` and `/ (root)`, and click **Save**. Your address is `https://<user>.github.io/<repo>/`.

**Option C — Firebase Hosting** (needs Node.js once)
1. Install the CLI: `npm install -g firebase-tools`, then `firebase login`.
2. In the MyTree folder run `firebase use --add` (pick your project) and `firebase deploy --only hosting`.

**Then authorise your address:**
1. In Firebase open **Authentication → Settings → Authorized domains**.
2. Click **Add domain**, type your host name **without** `https://` (for example `wonderful-name-123.netlify.app`), and click **Add**.
   (`localhost` and your `*.firebaseapp.com` domain are already there.)

## First run — create the Super Admin
Open your site. Because the database is brand new you will see **"Create the Super Admin"**. Enter your name, e-mail and a strong password. This screen appears **only once**: the rules allow `meta/setup` to be created a single time, together with the first super-admin profile. After that the screen is gone and everyone else must register or be created by an admin.

You are now signed in to the **Command centre**. Schools, institutions and foundations that register will wait in **Approvals** until you approve them.

---

## Optional hardening (recommended before a public launch)
* **Restrict the API key to your domain.** Google Cloud console → *APIs & Services → Credentials* → open the *Browser key* → *Application restrictions: Websites* → add `https://your-site/*`. (Keep the Identity Toolkit and Firestore APIs enabled.)
* **App Check** (blocks other websites/bots from using your project): Firebase console → *App Check* → register the web app with **reCAPTCHA v3**, run in *monitor* mode for a few days, then enforce. Then paste the reCAPTCHA **site key** into `js/firebase-config.js` as `window.MT_APPCHECK_SITE_KEY = "...";` — MyTree loads and activates App Check automatically when that value is present.
* **Budget alert:** Firebase *Usage and billing* → set an alert. The Spark plan never charges you; it simply pauses when a free quota is used up.
* **Backups:** the Spark plan has no scheduled backups. Use *Export* from the Super Admin tools (coming in phase 6) or upgrade to Blaze if you need managed backups.

## Free-tier limits to know (Spark plan, approximate)
| Service | Daily/monthly free | What it means |
|---|---|---|
| Firestore reads | 50,000 / day | Dashboards read counter documents, not whole collections, so this lasts a long time |
| Firestore writes | 20,000 / day | Bulk imports of ~10,000 trees fit in one day |
| Firestore storage | 1 GiB | Photos are compressed (~250 KB); ≈ 3,500 full-size photos. MyTree shows storage usage and warnings |
| Authentication | Generous | Email/password is free |

## Local development with the emulators (optional, developers)
```bash
npm install -g firebase-tools
firebase emulators:start --only auth,firestore
```
In `js/firebase-config.js` use project id `demo-mytree` and any non-empty `apiKey`, and add this line:
`window.MT_EMULATOR = { host: '127.0.0.1', auth: 9099, firestore: 8080 };`
Automated rule tests: `cd tests && npm install && npm test`.

## Troubleshooting
| Symptom | Fix |
|---|---|
| Page says "We could not reach the database" | Check `js/firebase-config.js` (all six values pasted?) and that Firestore was created (Step 3). Use **Open in demo mode** to confirm the app itself works. |
| "E-mail/password sign-in is not enabled" | Step 4. |
| "You do not have permission to do that" / `permission-denied` | The rules were not published (Step 3), or the account is pending/suspended. |
| Sign-in works on one address but not another | Add that domain to **Authorized domains** (Step 5). |
| Create-Super-Admin screen appears again | You are looking at a different Firebase project than before — check the config. |
| Reset e-mail not arriving | Check spam. Customise the template under *Authentication → Templates*. |
| Want to force the demo | Add `?demo=1` to the address. |
