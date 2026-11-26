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
   nobody at the GET lookup, A restored before the end; `applyProgress` calls recorded, and `narrateReady`
   unchanged on rejection. *(Corrected after PR review round 1, finding 7: narration itself is not recorded — the
   tests count `applyProgress` and check `narrateReady`, which the narration block sets first.)*
10. **Medium, the navigation fixture can't press the real controls — agree.** `renderPkgs`' Studio and package
    controls are ordinary `mkBtn` buttons, and the quest card and trail rows are buttons in `questhome`: the
    fixture keeps the real `renderPkgs`, supplies `pkglist`, `questhome`, `homeclose` and the landing elements
    before boot, and the tests press what the game rendered, asserting the quest id or the destination scope, and
    that Back and reopen toggle `landingmain` / `landingauth`.
11. **Low, `file://` with the SDK loaded — agree.** To be checked in both cases: the SDK present with an empty
    pool (`index.html` opened directly), and the SDK absent. *(Corrected after PR review round 1, finding 7: this
    said "checked" before anything was; AO's browser refuses `file://`, so opening `index.html` directly is on the
    owner's playtest list and under Not verified. The SDK-absent case is the suite's harness.)*

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

## Build (session `music-garden-49`, 2026-11-25)

Built as the revised plan (R1–R8). Departures, and choices the owner might overrule:

- **`loseSync()` advances `_cloudRun`** (R3), so a lost run's other calls end where they next check. Every caller
  returns at once after it.
- **`onSignedIn` sets `cloudOn=false` at the start of every run** with the rest of the revocation (R5). A sign-in
  that fails its checks leaves the tab signed out of sync, not still syncing an older account.
- **A successful PUT whose account is gone by the time it returns is not credited** (R6): the card says "isn't in
  the cloud yet" and Try again sends the same garden again, although the PUT did land in the card's account. A
  false "not saved" was chosen over crediting a save while another account is signed in.
- **The card's sub can't change once known:** a session for the card's name with another `sub` gets *"Keep this
  same card, and press Try again"* — practically unreachable (the same name and the same four words for a new
  account), so no new wording.
- **Test 53 records `startQuestRun`'s argument** for the idle press instead of opening the quest: opening one paints
  the grid, which the card tests' DOM does not have. The busy press is asserted by Home staying open, the scope,
  `QUEST_RUNS` and no `startQuestRun` call.
- **Test 58's map** is a stand-in `<svg>` (the card tests' `el()`): it keeps the listeners the real `renderPkgs`
  installs, and the tests press a land, then the package's and the Studio's buttons the game draws in its box.
- `currentUserIs` is gone (its last caller, the card, now uses `accountIs`).

**Tests:** 1122/1122 (1105 before; 17 new or split). Narration's two fixtures, the card fixture and the
cloud fixture now carry the cached ID token (`harness.mjs`); the card's two wrappers and the landing outage
stub pass the session through (GPT 8). **Mutation audit** (`node`, a script outside the repo, each mutation
against `cloud-sync`, `garden-card` and `narration`): 21 mutations of the new guards, 20 killed. The survivor —
*every retry overwrites `a.sub`* — is equivalent: the line before it refuses any session whose `sub` differs, so
the overwrite can only write the same value.

**Browser** (AO preview of this worktree, files checked byte for byte): the landing's and Home's sign-in forms
keep their words and show the message on an empty submit, Cancel brings the guest row back, the name roller
opens and cancels, no page errors. A real sign-in is not reachable from the preview (CORS allows only
tunegarden.game), nor is a second tab's session change. **Not verified here:** `file://` (AO's browser refuses
it), the two-tab cases on a real deployment — both on the playtest list.

## PR review, round 1 (`gpt-6.2-astra`, through `ask.sh`), on `e9cc8c3`

`ask.sh fresh read-only`, 2026-11-25. Usage: in 2,179,634 (cached 2,066,688), out 7,615. **Verdict: REQUEST CHANGES** —
five High (1–5), one Medium (6), one Low (7), and eight missing test cases.

<details><summary>GPT's PR review, verbatim</summary>

## Required changes

1. **High — Recheck the cached account after token acquisition, before sending a request or drawing the loading row.** `cloudPull` and `cloudPush` check the run and the identity in the returned token. Neither checks whether the cache still selects that identity before `fetch`. A late token for A can therefore send a PUT to A after the cache has switched to B. The check after the response can withhold credit, but the write has already happened. The initial lookup in `onSignedIn` has the same gap before it draws the loading row. Boot also captures only the stored username, so a replacement subject under that name can become the owner of the resumed run. Capture the cached name and subject together on resume. At each token continuation, check the run first and the current account second. [Token lookup and GET](./js/cloud.js#L88) · [PUT](./js/cloud.js#L104) · [Resume and loading row](./js/cloud.js#L169)

2. **High — A failed refresh can preserve a writer after the code has observed identity loss.** On error, `freshId` reads the cached token but compares only `c.name`. A replacement subject under the same username, a contradictory token username, and a missing ID token all fall through to `{}`. `cloudPush` then reports an outage and leaves `cloudSync` ready. If A reappears, an ordinary save can overwrite A’s cloud copy without a fresh GET. The GET version can report a successful sign-in with an unreachable cloud and dismiss the form. Reserve the outage outcome for a cache that still identifies the expected account. An expired token with matching claims suffices for that identity check. Preserve an observed mismatch through the caller even if A reappears. [Refresh error classification](./js/cloud.js#L69) · [GET failure](./js/cloud.js#L91) · [PUT failure](./js/cloud.js#L108)

3. **High — Check ownership where `onSignedIn` applies the GET or credits the PUT.** After `await cloudPull(...)` and `await cloudPush()`, the caller checks only `_cloudRun`. A change in another tab leaves that counter alone. A helper can finish its check under A, then the caller can resume under B and store A’s progress, narrate it, or draw “saved to cloud” under B. Check the captured account in the consuming continuation immediately before those effects. Keep an earlier `pull.lost` decisive. `cloudPull` should also check after the response headers arrive, before waiting for the JSON body, so a loss visible at that boundary cannot be forgotten by the time the body finishes. [GET response and body](./js/cloud.js#L93) · [Progress and narration](./js/cloud.js#L178) · [Save credit](./js/cloud.js#L194)

4. **High — An older authentication can still displace a newer successful sign-in.** The run number is allocated *after* `await cogSignIn`. If B’s newer Home submission finishes first, A’s older continuation can subsequently enter `onSignedIn`, increment `_cloudRun`, drop B’s queued save, and turn B’s sync off before checking A’s identity. If the SDK has reselected A, the old submission can instead start loading A over B. Track submission order before authentication and prevent a superseded completion from claiming the tab. Keep revocation when the current writer genuinely loses its identity. The existing overlap test releases A first, so it misses this ordering. [Submission](./js/cloud.js#L261) · [Unconditional run reset](./js/cloud.js#L166) · [Overlap test](./tests/garden-card.test.mjs#L695)

5. **High — A routine panel redraw can label A’s sync as B’s, or observe sign-out and leave A writable.** `renderAuth` combines the current SDK username with this tab’s `cloudOn` and `cloudSync`. Opening Home after a cache switch can therefore say B’s progress syncs while the ready run belongs to A. With an empty cache, the same redraw shows the guest row but leaves A’s writer ready. Restoring A before the next save then bypasses the required GET. When an existing sync run is presented, validate its captured identity, revoke it on observed loss, and render from that validated state. This needs no storage-event listener. [Signed-in row](./js/cloud.js#L202) · [Home redraw](./js/home.js#L18) · [Queued-save redraw](./js/cloud.js#L115)

6. **Medium — Re-entering Home still destroys the submitting form.** `openHome()` unconditionally calls `renderAuth()`, which clears both `authbox` and `_authForm`. During a held GET this replaces the child’s form with the loading row. If identity is then lost, the failure handler writes the retry message into the detached form. The new overlap test itself uses Home re-entry to discard the first form. Preserve the mounted form on incidental Home re-entry, while retaining the successful owner’s redraw and deliberate Cancel and exit behavior. [Home entry](./js/home.js#L7) · [Panel reset](./js/cloud.js#L202) · [Form completion](./js/cloud.js#L295)

7. **Low — Correct the verification record.** Answer 11 says `index.html` was opened directly with the SDK present. The Build section says the browser refused `file://`. Answer 9 says narration calls were recorded directly, while the rejection test records `applyProgress` and checks the final `narrateReady` value. Record the actual coverage and leave the direct-file check pending until performed. [Answers 9–11](./reviews/TUN-128-tab-account-sync.md#L210) · [Browser result](./reviews/TUN-128-tab-account-sync.md#L285) · [Rejection assertions](./tests/cloud-sync.test.mjs#L921)

## Missing tests

| Case to add | What must fail if the guard is removed |
|---|---|
| **Token callback after a cache switch.** Hold A’s initial, GET, and ordinary PUT token callbacks separately. Select B, then return A’s valid token. Also start boot with A’s cached subject and return a session for the same username with a replacement subject. | Assert zero requests from the stale lookup, no loading row naming B, and sync off. This distinguishes checking the cache from merely checking the callback’s token. [Cloud fixture](./tests/cloud-sync.test.mjs#L74) |
| **Failed refresh with the username still present.** Independently replace the cached subject, contradict the token username, and remove the ID token while retaining `LastAuthUser`. Run both a ready save and the form’s GET lookup. Restore A before attempting an ordinary save. | Assert revocation, retained retry form on GET, and no PUT until a fresh GET. Keep a matching expired-token/network-error control that still produces the resting outcome. This kills the username-only error classification. [Current offline control](./tests/cloud-sync.test.mjs#L440) |
| **Loss between helper and caller.** Wrap each real helper so the cache changes after it settles and before `onSignedIn` resumes. Cover a GET with progress, a failed GET, and a completed seed PUT. Separately make the response headers arrive under B and the body finish after A returns. | Assert unchanged memory and `mg_progress`, zero application and narration calls, no save credit, and `signedIn:false`. For the observed-loss case, restore A **before** the caller consumes `lost`. The current test restores A after `await tick()`, when the sign-in can already have finished. [Late GET tests](./tests/cloud-sync.test.mjs#L910) · [Restore timing](./tests/cloud-sync.test.mjs#L942) |
| **Two Home submissions, B finishes first.** Hold A in authentication. Let B authenticate, load, and queue a save. Deliver A’s old result with B still selected. Also cover the ordering requested in test 57, with A already at its GET and B pending in authentication. | In the first case B retains its progress, panel, readiness, and queued save. In the second, assert B’s exact mounted form, words, message, disabled buttons, and navigation lock. These catch late run allocation and stale form redraw independently. [Existing overlap order](./tests/garden-card.test.mjs#L695) |
| **Real Home redraws.** With A ready, change the cache to B or nobody and open Home before any save runs. Separately re-enter Home while its submitting form is waiting for a GET, then let that GET lose identity. | In the first case no row credits B, and restoring A permits no PUT before a fresh GET. In the second, the original form remains attached to `authbox`, retains its words, and displays an enabled retry. Also check that the owning form’s successful retry draws the signed-in row. [Home entry](./js/home.js#L18) |
| **SDK cache contract.** Use the vendored SDK and isolated storage to exercise its exact client/user key, JWT decoding, expiry, missing token, and cache clearing. Vary the cached claims independently from the session callback. | A wrong prefix, client ID, username, or decoder must fail. The current fixture returns JSON for **any** key ending in `.idToken`. The deferred narration fixture also supplies token storage without installing `CognitoIdToken`, which a correct caller-side recheck would expose. [Fake cache](./tests/harness.mjs#L367) · [Narration fixture](./tests/narration.test.mjs#L145) · [Existing real-SDK fixture](./tests/cloud-resting.test.mjs#L221) |
| **Card and Home refusal paths.** Return a nonempty subject with the wrong token username on recovery and ordinary card sign-in. In the existing broken-session wrapper cases, record that the real `getSession` failure was reached. | Recovery stays uncertain with Cancel available. Confirmed sign-up retains its original subject and sends nothing. Dropping either name comparison, or discarding the authenticated session in a wrapper and failing earlier, must fail the corresponding test. [Card claim checks](./js/garden-card.js#L50) · [Wrapper tests](./tests/garden-card.test.mjs#L541) |
| **Navigation tests 53 and 58.** Start the busy package case outside `intro` and assert after each individual press. Resolve the clicked `data-pkg` from the rendered map. For each idle quest press, exercise real quest entry and assert its run ID and scope. | Removing the package busy guard must fail even though `leaveHome()` independently keeps Home visible. Removing a rendered map target must fail even if its click handler remains. The quest spy proves the handler passes the intended ID, but it assigns the destination scope itself. [Map fixture](./tests/garden-card.test.mjs#L763) · [Quest fixture](./tests/garden-card.test.mjs#L805) |

Finding 48’s explicit sign-in and card subject binding is present. The card retains a known subject across retries, and the empty-denial case in test 59 asserts the requested message. Findings 49–51 remain open for the paths above. For accepted loads, TUN-112’s `narrateReady` → `applyProgress()` → conditional `enterPlay()` order is intact. A failed GET still blocks writes under TUN-106, and the song callers continue to consume only `freshToken`’s token-or-null result. [Card retry](./js/garden-card.js#L65) · [Empty denial](./tests/garden-card.test.mjs#L440) · [Accepted load](./js/cloud.js#L183) · [Song token adapter](./js/cloud.js#L77)

This was a read-only review of the pinned diff and five commits. The 1,122-test result, mutation counts, and preview checks are the author’s runs. Direct-file guest startup with and without the SDK, and real two-tab behavior, remain unverified here.

REQUEST CHANGES on e9cc8c3f1db0675907db113a224e1aa73c71e6b0.

</details>

### My answers — all agreed, fixed in the commit that records this round

None needs the owner: each has one right answer in the code, and none changes what a player is offered.

1. **High, recheck the cache after each token lookup — agree.** `cloudPull` and `cloudPush` now check the run, then
   `accountIs`, after the lookup and **before** the request; `onSignedIn` checks the first lookup's token against the
   cache before it draws the loading row; boot's resume takes its account from the cache, name and `sub` together.
2. **High, a failed refresh compared only the name — agree.** `freshId`'s error branch is `{}` (offline) only while the
   cache still names this very account — stored name, token name and `sub`; anything else is a mismatch.
3. **High, check where the result is used — agree.** `onSignedIn` checks `owns()` (the run, then the account) after the
   load and after the first save, before applying, storing, narrating or crediting; `cloudPull` checks again when the
   answer starts and once its body is in. A `lost` seen earlier stays decisive.
4. **High, an older sign-in can displace a newer one — agree.** `signInWith` numbers its sign-ins before
   authenticating; one a newer sign-in followed claims nothing when it answers (and says nothing on its form: the newer
   one decides), whichever finishes first.
5. **High, a routine redraw labels A's sync as B's — agree.** `renderAuth` shows the signed-in row only while the cache
   still names the run's account, by the run's own name; one found gone or replaced ends the run there (`dropSync`),
   as a save would.
6. **Medium, reopening Home destroys the submitting form — agree.** `openHome` leaves a sign-in form whose sign-in is
   out (`signInFormBusy`) as it is; Cancel, exits and the owner's own success still redraw. So a second Home form can no
   longer appear while one is out: the newer-sign-in case is now Home's form against the landing's.
7. **Low, the record overstated two checks — agree.** Answers 9 and 11 corrected in place, marked as corrections.

**Missing tests — all added:** a token callback after a cache switch (first lookup, the load's, a save's) and boot's
resume with a replacement `sub`; a failed refresh with another `sub` cached, a token naming someone else, no cached
token — on a ready save and on the form's GET lookup — against the offline control; a loss between helper and caller
(a load with progress, a failed load, nobody at the load with ann back before its use, headers under bea and body under
ann, headers under ann and body under bea, a sign-up's first save); an older sign-in answering after a newer one
finished (cloud) and after the landing's (card), with Home reopened while it waits; redraws that find bea, nobody or a
new `sub`; the cache contract through the **vendored library** (key, decoding, an expired token, another client's key,
no token, an offline refresh, a refused refresh clearing the session); the card's wrong token name on recovery and after
sign-up; the wrappers' real `getSession` failure counted; the busy package press starting outside `intro`, asserted
after each press, with each pressed land checked against the map's markup; real quest entry (only the grid painting
stood in), asserting the run and its scope.

**Round-1 fixes, verified:** suite 1130/1130. Fixtures that fake a session now give its cached ID token too
(`tests/helpers/backend-fixtures.mjs`, the load-gate stub, narration's deferred fixture with the library's
`CognitoIdToken`); TUN-87's never-redraws-over-a-form test now expects its redraw, which found nobody signed in, to
end that run, so the late song result no longer counts. **Mutation audit:** 36 mutations, 31 killed. The 5 that
survive are each caught by another guard, with no difference a player or a test can see: the cache check after the
first lookup and boot's resume from the cache (each catches the other, and the redraw check catches both); the row
naming the stored user (the row appears only once the stored user is the run's); the body check (`owns()` where the
load is used catches it); and the retry's `a.sub` (equivalent, as before). Each stays as a second line.

## PR review, round 2 (`gpt-6.2-astra`, through `ask.sh`), on `7463e1c`

`ask.sh fresh read-only`, 2026-11-25. Usage: in 1,509,003 (cached 1,409,024), out 7,992. **Verdict: REQUEST CHANGES** —
four High (1–4), one Low (5), and eight missing test cases. Round-1 findings 5, 6 and 7 and test row 7 resolved; the rest partly.

<details><summary>GPT's PR review, verbatim</summary>

Two account changes still escape the new guards. Cognito can write an old account back into shared storage **before** the game checks it. Also, a newer submission supersedes an older authentication, but does not supersede an older GET that has already started. That GET can still replace the device’s progress while the newer form says “Signing in…”.

### Round-1 disposition

| Round-1 item | Status | Reason |
|---|---|---|
| Finding 1 · Check the cache after token acquisition and bind boot to a subject | Partly | Boot now captures the name and subject. Successful token continuations check the cache before sending. A real SDK refresh can reselect A before any of those checks sees B. |
| Finding 2 · Classify a failed refresh by the whole identity | Partly | `freshId` distinguishes a replaced subject, contradictory username, or missing ID token at callback time. The awaiting GET and PUT skip their own cache check when that callback returned `{}`. |
| Finding 3 · Check ownership where GET and PUT results are consumed | Partly | The headers, body, and caller checks are present, and `pull.lost` wins after A returns. A final `renderAuth` can itself observe loss and end the run, yet `onSignedIn` still returns success. |
| Finding 4 · Older authentication must not displace newer sign-in | Partly | Numbering before authentication fixes the tested ordering with B still selected. It does not fence an older GET while B authenticates or prevent an older SDK success from reselecting A. |
| Finding 5 · Routine redraw must validate the writer | Resolved | A redraw that finds a different account drops the run and cancels its queued save. The signed-in row uses `_syncUser`. `dropSync` avoids recursive rendering here. |
| Finding 6 · Re-entering Home destroys the submitting form | Resolved | `openHome` preserves the mounted busy form. The held-GET test also exercises loss, retry, and the owning form’s successful redraw. |
| Finding 7 · Correct answers 9 and 11 | Resolved | The record now describes the indirect narration assertions and leaves direct-file verification pending. |
| Test 1 · Token callback after a cache switch | Partly | All three lookup sites are exercised with a stub. The boot test changes only the returned subject, and the refresh stub omits the SDK’s cache write. |
| Test 2 · Failed refresh with username present | Partly | The three bad-cache variants and matching offline control are present. The GET case calls `signInWith` directly and never checks a mounted retry form. The cache also stays unchanged between callback and continuation. |
| Test 3 · Loss between helper and caller | Partly | The GET, failed GET, seed PUT, and header-loss cases are present. In the body-loss case B stays selected through the caller check, masking deletion of the body check. Narration calls are still not counted directly. |
| Test 4 · Two submissions, B first | Partly | B’s queued save is verified with B still cached. Both new overlap cases hold A in authentication. Neither covers A already at GET while B waits in authentication. |
| Test 5 · Real Home redraws | Partly | The busy-form half uses `openHome`. The ready-writer half calls `renderAuth()` directly, so it cannot catch Home skipping the redraw. |
| Test 6 · Vendored SDK cache contract | Partly | The new test exercises decoding, expiry, missing tokens, another client’s key, offline failure, and cache clearing. Its only selected username is `ann`, and it never completes a successful refresh across an account switch. |
| Test 7 · Card and Home refusal paths | Resolved | Both wrong-name cases carry a nonempty subject. The ordinary card case holds the subject constant to isolate the name check. Both broken-session wrappers now assert that `getSession` actually failed. |
| Test 8 · Navigation 53 and 58 | Partly | Real quest entry now proves the run and scope, and each busy navigation press starts from a distinguishable scope. The map fixture checks that the attribute text exists, then invents the click target. Its `closest()` succeeds for any selector. |

### Required changes

1. **High — Preserve the account selection across a real SDK refresh.** The vendored `refreshSession` calls `cacheTokens()` before invoking the callback. `cacheTokens()` writes `LastAuthUser`. If A’s refresh finishes after B was selected, `accountIs(A)` can pass precisely because the refresh just selected A again. An ordinary PUT can then proceed. Make the progress lookup preserve a newer selection and refuse the stale operation. This needs protection at the SDK storage boundary. Another read after the callback sees the same overwritten value. [Token lookup and PUT][tokens] · [Vendored SDK][sdk]

2. **High — Make submission order govern the whole sign-in.** `_signInSeq` is checked after `cogSignIn`, but an A that already passed that check keeps its `_cloudRun` until B finishes authenticating. A can apply and narrate its GET, or seed an empty copy, while B is pending. Conversely, if B finishes first, a late successful A authentication can write A into the SDK cache before the sequence check rejects its result. B then loses its queued save on the next ownership check. Fence the older sync work when the newer submission starts and prevent a superseded same-tab authentication from undoing the winning selection. Give a still-mounted superseded form a clear outcome. Today one path blanks its message and the authentication-error path bypasses the supersession check altogether. [Submission and form handler][submission] · [Progress application][consume] · [Overlap fixture][overlap]

3. **High — Check ownership after a tokenless refresh result.** Both callers condition their post-`await` cache check on `id.token`. A matching offline result can become stale just like a successful token. For an ordinary save already showing “cloud is resting,” `done(false)` causes no redraw, so the writer can remain ready through the switch. If A returns, its next save can proceed without a fresh GET. Check the captured account before publishing the offline outcome, and preserve any earlier `gone` or `mismatch`. The unbound song adapter can continue returning token-or-null. [GET and PUT continuations][tokens]

4. **High — Honor revocation discovered by the final redraw.** `renderAuth` clears `_authForm` and its DOM before validating the account. If this redraw is the first operation to see the loss, it calls `dropSync`, but the failed-load, loaded-progress, and seed-save branches still return `signedIn:true`. The landing can erase the words and close, Home can lose its retry form, and the garden card can credit a save from a run the game already ended. Preserve the owning form when this validation fails and propagate the lost-run outcome to the consumer. [Final redraw and return values][consume] · [Landing completion][landing] · [Card credit][card]

5. **Low — Correct the round-1 verification conclusion.** Answers 9 and 11 are fixed. The later statement that all requested cases were added and all five survivors are equivalent overstates the evidence. The initial lookup, boot capture, and body check have distinguishable outcomes below. Naming the row from storage is equivalent only if it uses the **same validated snapshot**. A second `getCurrentUser()` can name B. The unconditional retry assignment to `a.sub` really is equivalent here because the preceding guard already rejected a different subject. [Mutation record][record] · [Card subject guard][cardguard]

### Missing tests

| Case to add | Setup and assertions | Regression it catches |
|---|---|---|
| Real SDK refresh across a switch | Use the vendored SDK with isolated storage and a deferred successful refresh. Begin an ordinary save for expired A, select B while it waits, and finish the refresh. Assert B remains selected, no progress PUT goes out, and A needs a fresh GET. Keep distinct cached subjects for two usernames under the same client and verify each lookup. | Unconditional stale SDK cache writes and a cache key hard-coded to `ann`. |
| Initial check and boot capture, independently | For a form submission, return A’s valid initial token while B is selected and restore A at entry to `cloudPull` **if reached**. Require rejection before that entry. Separately start actual boot with A/subject 1 and let both the cache and returned session become A/subject 2 during the first lookup. Require zero GETs and sync off. | Deleting the initial cache check, and resuming by username alone. Each case defeats the downstream guard that masked its mutant. |
| Failed-refresh continuation | Start with a ready A already showing the resting status. Let `freshId` classify a matching offline failure, then select B before `cloudPush` resumes. Assert revocation and no PUT after A returns. Exercise the corresponding GET through a mounted Home form and assert its exact fields, retry message, and enabled button. | The `id.token &&` shortcut and treating any tokenless result as an outage. |
| Loss at body completion | Receive headers under A, finish the body under B, then restore A after the real `cloudPull` settles but before `onSignedIn` consumes it. Assert `signedIn:false`, unchanged memory and `mg_progress`, zero application and narration calls, and no save. | Deleting the post-body check. The caller’s current-account check now sees A and cannot rescue the mutant. |
| Both submission orderings | Hold A at GET and B in authentication. Finish A first and assert unchanged progress, no seed, no narration, and B’s exact form, message, disabled controls, and navigation lock. For B-first completion, model the SDK’s actual cache write before A’s callback and verify B’s queued save retains the correct owner. Check both stale success and stale rejection on a still-mounted form. | Checking sequence only before entering `onSignedIn`, relying on a side-effect-free authentication stub, and inconsistent stale messages. |
| Loss discovered by the final redraw | Keep A valid through the caller’s ownership check and let the final real `renderAuth` see the loss. Cover a failed GET and a successful seed PUT. Assert sync off, no successful sign-in or card credit, and retained form words with an enabled retry. | Returning the pre-redraw outcome after `dropSync()` has invalidated it. |
| Real Home redraw and row name | Queue A’s save, select B or nobody, and open Home through its entry handler. Assert guest row, canceled save, and no PUT when A returns. Separately vary the selected name after row validation and assert no row names B. | Skipping the ready-writer redraw in `openHome`, or independently rereading the username for display. |
| Rendered map target | Resolve the pressed package or Studio cell from the generated SVG and make the fixture honor the selector passed to `closest`. Keep the current per-press scope assertions. | A broken click selector that the unconditional `closest()` stub accepts. |

The TUN-69 merge changes the `?dev` Studio dispatch and its fixture. Both destination functions retain the busy guard. I found no merge-induced change to account sync, the TUN-106 failed-load write block, TUN-122’s explicit-null seed rule, or TUN-112’s accepted-load narration order. This was a read-only source review. The 1,130-test result is the author’s pre-merge run. Direct `file://` startup and real two-tab behavior remain unverified.

[tokens]: /C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-49/js/cloud.js:72
[sdk]: /C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-49/vendor/cognito/amazon-cognito-identity.min.js
[submission]: /C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-49/js/cloud.js:282
[consume]: /C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-49/js/cloud.js:194
[overlap]: /C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-49/tests/garden-card.test.mjs:697
[landing]: /C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-49/js/boot.js:125
[card]: /C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-49/js/garden-card.js:75
[cardguard]: /C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-49/js/garden-card.js:71
[record]: /C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-49/reviews/TUN-128-tab-account-sync.md:375

REQUEST CHANGES on 7463e1ca9851596f59c058c34018e572f9622e4e.

</details>

### My answers

1. **High, a real refresh can reselect the old account — agree; open for the owner (question 1).** Verified in the
   vendored library: `refreshSession` ends in `cacheTokens()`, which writes `LastAuthUser`. So when an expired token's
   refresh finishes after another tab selected B, the library itself selects A again, and every check after it sees A.
   The game's own checks cannot see past the library's write; the fix is for the game to guard the library's storage
   (a refresh never changes which account is selected). That is a change to how the game uses the library, not a
   check in the game's own code.
2. **High, submission order must govern the whole sign-in — agree, in two halves.** *In the game:* a newer sign-in,
   from the moment it begins, ends an older sign-in's sync work, and a superseded form gets one clear outcome on every
   path — fixed now. *In the library:* an older authentication that finishes last still has the library select its
   account — the same storage-boundary question as 1; open for the owner (question 1).
3. **High, check ownership after a tokenless result — agree.** Fixing now.
4. **High, honour a loss the final redraw discovers — agree.** Fixing now.
5. **Low, the round-1 verification overstated — agree.** Corrected with the round-2 fixes.

**Missing tests:** all but one are about the game's own code and are being added; the real-library refresh across a
switch, and the B-first ordering with the library's write modelled, wait on question 1.

## Owner's decisions

1. **open** — *GPT's round-2 findings 1 and half of 2: the Cognito library itself rewrites which account is selected
   when a token refresh, or an older sign-in in the same tab, finishes after another tab switched accounts. Fix that
   here, or in a follow-up ticket?* Options: **A)** follow-up ticket — this PR fixes everything else from round 2, and
   round 3 (the last) reviews that; **B)** fix it here — the game guards the library's storage writes, tested through
   the real library, all in round 3; larger than M (about 2–3 more hours), and if round 3 still finds something it
   comes back to you; **C)** stop — hand off what is there with no third round. Recommended: **A**.
