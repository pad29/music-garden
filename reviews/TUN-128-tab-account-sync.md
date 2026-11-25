# TUN-128 — Keep a tab's cloud sync on the account that signed in, when another tab changes who is signed in

Branch `ao/tab-cloud-sync/root` · Size **M** (label and `## Size` agree) · Findings 48–51 and tests 53–59 are GPT's
round-4 review of TUN-93 (`reviews/TUN-93-garden-name-accounts.md` § *PR review, round 4*); the numbers are that
review's.

## Plan (Claude)

### What changes for the player

Nothing they can see in ordinary play. In the rare case where a second tab of the same browser signs someone else
in, or signs out, while this tab is signing in, loading or saving: this tab no longer loads, shows or saves a garden
for an account other than the one its child signed in to, and Home's sign-in form stays up, with its words and a
message, when the sign-in turns out not to have worked.

### Approach, file by file

**`js/cloud.js`**

1. **`freshId(name,sub)` tells "nobody signed in" from "can't refresh now"** (50, and the ticket's trap). No current
   user in the shared storage → `{ gone:true }`. A current user whose `getSession` fails or is invalid → `{}` as today
   (an outage: the calm "cloud is resting" path). `{ mismatch:true }` and `{ token, sub }` unchanged. `freshToken`
   (the song calls) is unchanged in effect: both still give no token. A helper `lostAccount(id) = id.mismatch || id.gone`
   is what every sync caller tests.
2. **`sessionAccount(s)`** (new, 48): from the session `cogSignIn` resolves with, `{ name, sub }` — the ID token's
   `cognito:username`, lower-cased, and `sub` — or `null` when either is missing.
3. **`signInWith`** (48, 51): keeps `cogSignIn`'s session; no `name`/`sub` in it → `{ ok:false, msg:AUTH_SAYS.other }`.
   Otherwise `onSignedIn(false, acct.name, acct.sub, { form:true })`. So the run is bound to the account that
   authenticated: if the shared storage already names another account (or the same name with another `sub`),
   `onSignedIn`'s existing `onlyFor` check and `freshId`'s claims check return `signedIn:false` before any request,
   and the form stays.
4. **`onSignedIn(uploadLocal, onlyFor, onlySub, opts)`** — positional arguments kept (about 40 test calls use them);
   a fourth, `opts.form`: a sign-in form is waiting for the outcome.
   - **51:** with `opts.form`, the "loading your progress…" redraw (`cloudSync="loading"; renderAuth()`) is skipped,
     so Home's submitting form stays attached ("Signing in…", its words, Sign in and Cancel disabled by its own
     `busy`) until the outcome is known. Success redraws the panel at the end, as today; every failure path redraws
     only when the panel shows the signed-in row (`loseSync`'s existing rule), so a failure leaves the form for its
     handler to write the message into. The unconditional `renderAuth()` after `loseSync()` on `pull.mismatch`
     goes (loseSync already redraws when it should). Boot's resume (no `opts`) keeps the loading row.
   - **50 at the GET lookup:** `cloudPull` returns `{ ok:false, lost:true }` for `gone` as it does for `mismatch`;
     `onSignedIn` handles both alike: `loseSync()`, `NO` — never `{ signedIn:true }` with an unreachable cloud.
   - **49, after the GET returns:** a fresh `freshId(who,_syncSub)` and the run check, **before** `cloudSync="ready"`,
     `Store.set`, `applyProgress`, any render, and before TUN-112's narration block (whose order is untouched).
     Lost (mismatch or gone) → `loseSync()`, `NO`. A session that exists but can't refresh → treated as a failed
     load (`cloudSync="unreachable"`, `{ signedIn:true, saved:false }`): nothing applied, nothing writable (TUN-106).
     The check runs whatever the GET answered, so a failed load under a changed account is `NO` too, not a
     "signed in, cloud resting".
5. **`cloudPush`** (50, 49's save half):
   - At the token lookup: `gone` → `loseSync()`, `false`, no cloud failure reported (`done` not called: nobody is
     signed in, the cloud did nothing wrong). `{}` (can't refresh) → `done(false)` as today — calm "resting".
     A 503 with a valid session → `done(false)` as today.
   - **After a successful PUT** returns: the run check, then `freshId(_syncUser,_syncSub)` again; lost →
     `loseSync()`, return `false` (so neither `onSignedIn`'s "saved to cloud" nor the card's "saved ✓" credits it);
     can't refresh → return `false` without `done` or `loseSync` (unknown: not credited, nothing revoked).
     Only then `done(true)`. The PUT itself went out with a token checked for this run's account, so the bytes are in
     that account's row; what is withheld is only the claim.

**`js/garden-card.js` — `createGarden`** (48)

6. The recovery sign-in after a lost sign-up answer keeps `cogSignIn`'s session: `a.sub = sessionAccount(s).sub`
   (a session without a name equal to `a.name`, or without a `sub` → `cantCheck`, card kept, `a.made` set so the
   card says the account is made). Every later retry passes that same `a.sub` to `onSignedIn(true, a.name, a.sub)`.
7. The ordinary sign-in (and every retry's) keeps its session too: when `a.sub` is set (sign-up's `userSub`, or the
   recovery's), a session whose `sub` differs → `{ ok:false, msg:GARDEN_SAYS.cantCheck }` and no upload; when
   `a.sub` is not set (a sign-up answer without `userSub`), the session's `sub` becomes `a.sub`.

**Not touched:** `js/boot.js` (`doLandingSignIn` already writes into the landing's own message, which is never
detached; TUN-69's worker is in boot.js today), `js/home.js` (the guards are right — GPT 53 asks only for tests),
the backend.

### Tests that would prove it

In `tests/cloud-sync.test.mjs` (`cloudGame`), `tests/garden-card.test.mjs` (`cardGame`):

- **Fixture changes:** `cloudGame` gains a way to call the real `signInWith` with a stubbed `cogSignIn` that returns a
  chosen session (name, `sub`) and, optionally, changes the shared storage before resolving; `cardGame`'s
  `cogSignIn` stub returns a session (`cognito:username`, `sub`) with **distinguishable `sub`s under one name**
  (56), and its `getSession` stub gains a "gone" vs "broken" distinction. `tests/cloud-resting.test.mjs`'s two
  `cogSignIn` stubs return a session.
- **54 (identity and late GET):** `cogSignIn` returns A's session while the storage selects B → no request with B's
  token, `signedIn:false`, the form's `{ ok:false }`. Hold A's GET, change only the storage, release — three cases:
  B; A's name with another `sub`; nobody. Each: `progress` and `mg_progress` unchanged, no `applyProgress`
  (level unchanged, no narration recorded), `cloudSync` not `"ready"`, `signedIn:false`. **The second half of the
  existing test at line 790 is replaced** by the "nobody / B" cases asserting the copy never lands.
- **55 (write revocation):** a sign-up whose first PUT fails; queue an ordinary save; a replacement `sub` at that
  save's lookup → zero PUTs with it, `cloudSync` `"off"`, no "saved". The same with no current user; then restore A
  in the storage → another save sends nothing until `onSignedIn` has done a fresh GET. A 503 with a valid session
  still says the cloud is resting and keeps `"ready"`. A successful PUT held while the storage switches to B → the
  panel never shows "saved to cloud", `onSignedIn` returns `saved:false`.
- **56 (card):** Retry after a stale session: both sign-in argument pairs equal the card's name and words; one
  sign-up; one PUT, with the card account's `sub`. Lost sign-up answer: recovery `cogSignIn` returns A's session,
  the storage then shows A's name with another `sub` before upload → card survives, no PUT, success withheld; a
  retry signs in again and passes A's `sub`.
- **57 (form outcomes):** Home's form, identity lost after the first lookup (at the GET lookup, and after the GET
  returns) → the form is still in `authbox`, its words in it, the message shown, Sign in enabled. Landing seed-503
  case → the signed-in panel visibly shows the "cloud is resting" save line. **Superseded submission:** see
  question 1 below.
- **58 (navigation controls):** `homeclose`, `landingSignin`, `landingmain`, `landingauth` supplied as elements before
  boot; press the handlers boot and `home.js` install (Close, backdrop, a package, the Studio) while busy and idle;
  assert scope, form cleanup, and the passphrase box empty and masked on reopen (Home and landing, after Show and
  Back).
- **53 (quest buttons):** the profile with `intro`, `footsteps`, `follow-the-fireflies` completed and no quest runs;
  press the rendered **Firefly Crossing** card, and separately the enabled **Waking Woods** trail row: during a
  held sign-in Home stays open, scope unchanged, no quest run; idle, the quest opens, and Home's sign-in form
  reopens empty and masked.
- **59:** the keep-this-card-and-retry message asserted in the existing recovery table for `""` (and the other rows).
- **Mutation checks I will run myself:** drop each new check (post-GET recheck, post-PUT recheck, `gone` → loseSync in
  push, `gone` at the GET lookup, `opts.form`'s skipped redraw, the card's `a.sub` from recovery) and confirm a test
  fails for each.

### Risks

- **Offline vs signed out.** `gone` is only "no current user in storage". A refresh that fails for any reason
  (offline, or a revoked refresh token) stays `{}` — calm, no write, no revocation. A revoked refresh token therefore
  keeps the tab "ready" but every push fails calmly; that is today's behaviour and never writes.
- **One more `getSession` per load and per save.** It reads storage and calls back at once while the tokens are
  valid; it refreshes only when they are not, which the call before it would have done anyway.
- **A false "not saved" on the card** if the storage switches between a successful PUT and its recheck: the child
  presses Try again and the same progress goes up again. Chosen over crediting a save while another account is
  signed in.
- **TUN-112's narration order** is untouched; the extra `await` sits before the block, and the narration tests'
  stubs already carry the claims.
- **`file://`**: no Cognito, `userPool` null — `freshId` returns `{ gone:true }` where it returned `{}`; every caller
  that can run without Cognito (`freshToken`, the song calls) only reads `token`. To be checked by the suite and by
  opening the game from `file://`.

### Questions

For the owner: **none** — the ticket says none, and nothing here has more than one defensible answer for a player.

For GPT's review, one design point:

1. **Test 57's "superseded Home submission".** GPT's round-4 case was: A's Home form held at the GET, a newer Home
   submission, A finishes first, the newer form survives. That newer submission was possible only because the
   loading redraw removed A's form (the guest panel's "Sign in" came back). With item 4's `opts.form`, A's form
   stays up and busy until its outcome, so **no newer Home submission can start while A's is out**. I plan to test
   that (the form stays, busy, Home locked), plus a newer sign-in through `onSignedIn` directly (boot's or the
   landing's path) superseding A's held GET: A's handler writes only into its own form, and the newer run's panel
   is what remains. Is that the right reading of 51's last sentence, or is there a path to a newer Home form I have
   missed?
