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

## Design review (`gpt-6.2-astra`)

`ask.sh fresh read-only`, 2026-11-25, on the plan at `bf29cfb`. Usage: in 1,297,681 (cached 1,203,456), out 6,215.
**Verdict: CHANGES REQUESTED** — five High (1–5), five Medium (6–10), one Low (11). No question for the owner.

<details><summary>GPT's design review, verbatim</summary>

1. **High — The final identity check can itself return stale information.** `getCurrentUser()` reads `LastAuthUser` and constructs a user object. `getSession()` can then refresh asynchronously. Its callback describes that session, while the shared account may have changed since the lookup began. The vendored SDK also clears cached identity on a `NotAuthorizedException` and writes tokens and `LastAuthUser` on successful refresh. The plan’s claim that a revoked refresh leaves the tab ready and merely offline is therefore incorrect. Require the final decision to check the currently selected name and subject against the run’s captured identity. Prefer a read-only check of cached identity at completion so reporting a GET or PUT does not itself initiate a refresh. Test a switch *during the final lookup*, including a callback for A after the cache selects B, and distinguish a network error with A still present from an error that leaves nobody signed in. [Plan, item 4](reviews/TUN-128-tab-account-sync.md#L42) · [freshId](js/cloud.js#L54) · [Vendored Cognito SDK](vendor/cognito/amazon-cognito-identity.min.js)

2. **High — A stale completion can revoke a newer run.** Item 5 checks `_cloudRun` **before** awaiting the final `freshId`. If B starts a run during that await, A can return and call `loseSync()` on B. `cloudCall` guards its own callback, but cannot protect that state change. Also, `loseSync()` clears `_syncUser` and `_syncSub` without advancing `_cloudRun`, so another outstanding push can pass the run check and use those cleared values as wildcard expectations. Capture the run, name and subject together, invalidate the run on observed loss, and check ownership after every await before changing state or publishing an outcome. Hold the final lookup, complete B’s load, then release A. Removing the guard **after** that lookup must fail a test that checks B’s readiness, panel and ability to save. [Plan, item 5](reviews/TUN-128-tab-account-sync.md#L48) · [loseSync and cloudPush](js/cloud.js#L64) · [TUN-106’s run rule](reviews/TUN-106-keep-cloud-progress-on-failed-load.md#L56)

3. **High — The GET can redraw the panel before the proposed check.** `cloudPull` calls `done(false)` on an HTTP or parse failure and `done(true)` after parsing a successful response. `done` can immediately call `renderAuth()`, which reads the username from shared storage. On boot resume, A’s loading row can therefore be redrawn under B’s name before control returns to `onSignedIn`. Keep the cloud-call sequence assigned at request start, but defer publishing its result until ownership is established. Give an observed `pull.lost` precedence even if A has reappeared by the final lookup. Test the render history with the signed-in loading row visible and a held GET returning 503 after a switch. Checking only the final panel misses the premature redraw. Keep this decision ahead of readiness, `Store.set`, and the entire TUN-112 narration block. [cloudCall](js/cloud.js#L22) · [cloudPull](js/cloud.js#L68) · [Application and narration](js/cloud.js#L140) · [Panel account lookup](js/cloud.js#L165)

4. **High — The initial name guard can observe a sign-out and leave an old writer ready.** `onSignedIn` returns at `onlyFor && !currentUserIs(onlyFor)` before it advances `_cloudRun`, cancels a queued save, or revokes the existing writer. If this tab already had write permission for A and that check observes nobody, A reappearing in storage can let an ordinary save through without a fresh GET. The plan also retains a second storage read to choose `who` after checking `onlyFor`. Use the authenticated name and subject as the run’s identity throughout. When the current writer’s identity is observed gone or replaced, revoke that writer while preserving any newer run that owns the tab. Start the regression test with a ready writer and a queued save. A test starting from `off` cannot expose this failure. [Plan, item 3](reviews/TUN-128-tab-account-sync.md#L27) · [Initial guard and run allocation](js/cloud.js#L131) · [Queued saves](js/cloud.js#L85)

5. **High — A failed seed PUT can still dismiss the form after sign-out.** The plan rechecks only successful PUTs. If the empty-copy seed PUT returns 503 or rejects after the shared account disappears, `done(false)` runs, `cloudSync` can remain `ready`, and `onSignedIn` returns `signedIn:true, saved:false`. Landing then clears the words and closes. Finalize failed PUTs against the same ownership rules. A valid session plus 503 must still produce the signed-in save-failure line. Observed loss must end the run and preserve the submitting form. A refresh failure with the account still present must have the calm resting outcome, including at the final lookup where item 5 currently proposes silence. Test all three outcomes through the seed path. This can be handled in `cloud.js` with the existing landing handler. [Plan, item 5](reviews/TUN-128-tab-account-sync.md#L49) · [Seed result](js/cloud.js#L153) · [Landing handler](js/boot.js#L122)

6. **Medium — Answer to Question 1: keep the newer Home submission test.** `busy` belongs to one form. Home’s entry handler can call `openHome()` again, which unconditionally redraws `authbox`. Home has no background focus containment like the garden card’s. Also, the existing loading redraw normally shows the **signed-in loading row** when the user is present. The premise that it necessarily restores the guest Sign in button is wrong. A direct `onSignedIn` call creates neither a second form nor a second `authBusy` claim, and boot resume runs only at first load. Exercise two real Home submit handlers, mounting the second form explicitly in the fixture if necessary. Finish A while B is pending and assert B’s exact form, words, message, button state and navigation lock survive. Include B pending in `cogSignIn`, before it has acquired a new `_cloudRun`. Protect the form that actually owns the panel, including from a boot-resume redraw while someone is typing. Keep `cloudSync="loading"` independent of whether the panel redraws. [Plan question](reviews/TUN-128-tab-account-sync.md#L133) · [Home entry](js/home.js#L18) · [Form handler](js/cloud.js#L246) · [Boot gate](js/boot.js#L132)

7. **Medium — The card’s recovery state claims more than the session proves.** Item 6 sets `a.made` even when recovery returns a different name or no usable subject. `showGardenCard` then tells the child the account exists, removes Cancel and offers Done. With a lost sign-up answer, that identity has not established which account was created. Keep the same card and the uncertain recovery state until its account is identified. After a confirmed sign-up, keep `made`, preserve the original `userSub`, and require the returned name and a nonempty matching subject on every ordinary sign-in and retry. Test missing claims, a contradictory sign-up `userSub`, and a retry whose returned session **and cache agree on the same replacement subject**. The latter kills the mutation that overwrites the original `a.sub` on every retry. [Plan, items 6–7](reviews/TUN-128-tab-account-sync.md#L60) · [Recovery state](js/garden-card.js#L48) · [Visible card outcomes](js/garden-card.js#L132)

8. **Medium — Two existing tests contradict the fixture plan.** The test at line 434 explicitly requires `cloudResting === true` after `signIn(null)`. Split it into observed sign-out and a still-present user whose refresh fails. Assert revocation and a required fresh GET for the former, and the resting line plus a successful ordinary retry for the latter. The landing outage test at line 555 replaces `cogSignIn` with a function returning `undefined`, so the proposed claim check rejects it before its GET. The wrappers at garden-card lines 534 and 551 likewise discard the wrapped session. Return the authenticated session from those fixtures and assert that each reaches its intended later failure. The two `cloud-resting` stubs named in the plan are refusal sentinels whose tests already require zero sign-ins. [Existing sign-out expectation](tests/cloud-sync.test.mjs#L434) · [Landing outage stub](tests/cloud-sync.test.mjs#L550) · [Card wrapper](tests/garden-card.test.mjs#L534) · [Home wrapper](tests/garden-card.test.mjs#L551) · [Refusal sentinel](tests/cloud-resting.test.mjs#L159)

9. **Medium — Several proposed tests would pass with part of the fix removed.** For finding 48, test an ordinary sign-in whose returned session and cached account have the **same name and different subjects before sync starts**. The different-name case still passes if `signInWith` drops only `acct.sub`. For finding 50, make the GET token lookup observe nobody and restore A before the final lookup. Leaving storage empty throughout lets the final check conceal a missing `gone` branch in `cloudPull`. For finding 54, record calls to `applyProgress` and narration directly, and assert `narrateReady` stays unchanged on rejection. The generic harness swallows audio calls, and an unchanged level alone cannot prove the narration block was never entered. [Planned mutations](reviews/TUN-128-tab-account-sync.md#L107) · [Cloud fixture](tests/cloud-sync.test.mjs#L74) · [Harness audio stubs](tests/harness.mjs#L267) · [Narration fixture](tests/narration.test.mjs#L149)

10. **Medium — The navigation fixture cannot currently produce the controls it promises to press.** `cardGame` replaces `renderPkgs` with a no-op. Its fake elements clear `innerHTML` without constructing the SVG that installs the package and Studio handlers. `questhome` also needs a persistent element for the tests to find the rendered card and trail buttons. Specify a recording DOM capable of exercising those handlers, or use a real browser for the map controls. For each busy and idle case, press the installed button and assert the intended quest ID or a distinguishable destination scope. For landing, assert that Back and reopen actually toggle `landingmain` and `landingauth`. An already-empty password field passes even if reopen does nothing. [Card fixture](tests/garden-card.test.mjs#L36) · [Disabled map renderer](tests/garden-card.test.mjs#L65) · [Map controls](js/home.js#L259) · [Quest controls](js/home.js#L23) · [Landing visibility](js/boot.js#L105)

11. **Low — `file://` does not imply `userPool === null`.** `index.html` loads the vendored classic script locally, and `cloud.js` constructs the pool whenever the SDK global exists. An available SDK with an empty pool and an unavailable SDK are separate cases. Verify guest startup and device-only progress in both, including opening `index.html` directly. The first-load gate already handles an empty pool, so this requires no `boot.js` edit. [Local SDK script](index.html#L1023) · [Pool initialization](js/cloud.js#L4) · [First-load gate](js/boot.js#L132)

CHANGES REQUESTED

</details>

## My answers

All eleven agreed. None is a question for the owner: each has one right answer once the code is read, and none
changes what a player is offered.

1. **High, the final check can be stale — agree.** Verified in `vendor/cognito/amazon-cognito-identity.min.js`:
   `getSession` reads the tokens for `this.username` from the shared storage, and a refresh refused with
   `NotAuthorizedException` calls `clearCachedUser()`. My risk note ("a revoked refresh keeps the tab ready") was
   wrong: the library signs the browser out. Revised: a synchronous, read-only `cachedAccount()` for every decision
   made after an `await` (item R2), and `freshId` asks the cache again after a failed refresh to tell "gone" from
   "offline" (R1).
2. **High, a stale completion can revoke a newer run — agree.** Revised: the run, name and `sub` are captured
   together at the start; after every `await` the run is checked first, and only then the account; `loseSync`
   advances `_cloudRun`, so the run's other calls in flight end too (R3).
3. **High, the GET can redraw before the check — agree.** `cloudPull`'s `done()` runs `renderAuth()`, which names the
   stored user. Revised: the run and account are checked inside `cloudPull` before `done` (R4); a `lost` seen at
   the GET's own lookup wins even if A is back by the end.
4. **High, the first name guard returns before revoking — agree.** Revised: `onSignedIn` starts its run, drops the
   queued save and revokes the old writer **before** any account check, and uses the authenticated name and `sub`
   throughout — no second read of the storage to choose `who` (R5).
5. **High, a failed seed PUT after sign-out still dismisses the form — agree.** Revised: every PUT outcome, success or
   failure, is settled against the run and the cached account before `done` (R6). A 503 with A still signed in:
   the signed-in save-failure line; A gone: the run ends and the form stays.
6. **Medium, question 1 — agree; my premise was wrong twice.** The loading redraw shows the signed-in loading row, not
   the guest panel; and `openHome()` redraws `authbox` unconditionally, so a second Home form can be mounted while
   the first is out (held in `cogSignIn`). Revised: the panel remembers which form owns it, and no sign-in's
   redraw — the loading row, the end of a load or a save, boot's resume — replaces a form it does not own (R7).
   Tested with two real Home submit handlers, the newer one held in `cogSignIn`.
7. **Medium, the card's recovery claims too much — agree.** Revised: a recovery session without a matching name and a
   non-empty `sub` leaves the attempt uncertain (no `made`, so Cancel stays and the card does not say the account
   exists); a known `a.sub` is never overwritten, and every sign-in must match it (R8).
8. **Medium, existing tests contradict the fixture plan — agree.** The test at line 434 is split (gone vs a refresh
   failing with A present); the landing outage stub at line 555 and the card wrappers at lines 534 and 551 return
   the session and assert they reach their intended later failure. The `cloud-resting` stubs are left alone: they
   are refusal sentinels, as GPT says.
9. **Medium, tests that would survive part of the fix — agree.** Added: same name with a different `sub` at sign-in;
   nobody at the GET lookup, A restored before the end; `applyProgress` and narration calls recorded directly, and
   `narrateReady` unchanged on rejection.
10. **Medium, the navigation fixture can't press the real controls — agree.** `renderPkgs`' Studio and package
    controls are ordinary `mkBtn` buttons, and the quest card and trail rows are buttons in `questhome`: the
    fixture keeps the real `renderPkgs`, supplies `pkglist`, `questhome`, `homeclose` and the landing elements
    before boot, and the tests press what the game rendered, asserting the quest id or the destination scope, and
    that Back and reopen toggle `landingmain` / `landingauth`.
11. **Low, `file://` with the SDK loaded — agree.** Both cases checked: the SDK present with an empty pool
    (`index.html` opened directly), and the SDK absent (the suite's harness).

## Plan, revised after the design review

The approach and the files of § *Plan (Claude)* stand, with these changes (R = revised):

- **R1 `freshId(name,sub)`.** No current user → `{ gone:true }`. A failed or invalid `getSession` → `cachedAccount()`
  again: nobody now (the library cleared a refused refresh) → `{ gone:true }`; still someone → `{}` (offline: calm).
  Mismatch and token as before.
- **R2 `cachedAccount()`** (new, synchronous, no network): the stored current user's name (lower case) and the
  `cognito:username` and `sub` of its cached ID token, read through the library's own storage and `CognitoIdToken`;
  `null` when nobody is signed in. `accountIs(name,sub)` compares all three. Every decision made after an `await`
  uses it — never a `getSession` that might refresh.
- **R3 runs.** A sync call captures `{ run, name, sub }` once. After every `await`: `run !== _cloudRun` → do nothing;
  then `!accountIs(name,sub)` → `loseSync()`. `loseSync()` advances `_cloudRun`, so every other call of the lost
  run ends where it next checks.
- **R4 `cloudPull(acct)`.** Lookup `gone` or `mismatch` → `{ lost:true }` (no `done`). After the response: run check,
  account check (→ `{ lost:true }`, no `done`), only then `done(ok)` and the result. In `onSignedIn`, `lost` →
  `loseSync()`, `NO` — before `cloudSync="ready"`, `Store.set`, `applyProgress` and TUN-112's narration block,
  whose order is untouched.
- **R5 `onSignedIn(uploadLocal, onlyFor, onlySub, opts)`.** First: a new run, the queued save dropped, the old writer
  revoked. Then the account: `onlyFor`/`onlySub` (the authenticated session's, from `signInWith` and the card) or,
  for boot's resume, the cache's. Never a second read to choose `who`.
- **R6 `cloudPush`.** Captures the run's account at the start (not `_syncUser` after an `await`). Lookup `gone` or
  `mismatch` → `loseSync()`, no `done`; `{}` → `done(false)` (calm). After the response, success or failure: run
  check, account check (→ `loseSync()`, `false`, no `done`), then `done(r.ok)`.
- **R7 forms.** `showSignInForm` registers its form as the panel's owner; `renderAuth` clears it. `signInWith` takes
  the form (the landing passes none) and hands it to `onSignedIn` as `opts.form`. A form sign-in skips the loading
  redraw; `cloudSync="loading"` is set either way. Every redraw `onSignedIn` makes is skipped while a sign-in form
  it does not own holds the panel.
- **R8 the card.** Recovery: a session whose name is `a.name` and whose `sub` is non-empty → `made`, `a.sub` from it;
  otherwise the attempt stays uncertain, the card kept, "keep this same card". Every later sign-in: the session's
  name must be `a.name` and its `sub` must equal `a.sub` (set once — from sign-up's `userSub`, or the first
  session when sign-up gave none — and never overwritten); otherwise no upload and "keep this same card".
- **Tests:** as § *Tests that would prove it*, with answers 2, 3, 5, 6, 8, 9 and 10's cases added; each new guard gets
  a mutation that a test must catch.
