# TUN-106 — Keep a player's cloud progress when signing in fails to load it

Branch `ao/cloud-sync-status/root` · Size **S** · touches `js/cloud.js` only (no `backend/`).

## Plan (Claude)

- **One state, not a flag per caller.** `js/cloud.js` gets `cloudSync`: `"off"` (not signed in),
  `"loading"` (signed in, pull in flight), `"ready"` (the cloud copy was read, or the account is brand
  new), `"unreachable"` (the pull failed). Only `"ready"` lets progress go up: `cloudPush` returns
  `false` without a request otherwise, and `scheduleCloud` schedules nothing. So no save — during the
  pull or after a failed one — can replace a cloud copy the game never read. `cloudOn` stays as it is.
- **`cloudPull` returns `{ ok, progress }`.** `ok:false` for no token, a non-OK status (429, 5xx), a
  thrown `fetch`, or a body that is not JSON; `ok:true, progress:null` for "nothing saved yet". A 200
  whose body is not a loadable progress (no `packages`) is treated as today — pushed over.
- **`onSignedIn(false)`**: resets to `"loading"` and drops any queued push first; on `ok:false` →
  `"unreachable"`, no push, the panel says so; on `ok:true` → `"ready"`, then load or push as today.
  **`onSignedIn(true)`** (sign-up) → `"ready"` and pushes, as today. `doSignOut` → `"off"`.
- **The panel reads the state**, not only the one-off status, so `openHome`'s plain `renderAuth()` keeps
  saying it: *"☁️ Signed in as **ann** — couldn't reach the cloud just now. Your cloud progress is safe;
  reload the page later to load it."* While loading: *"— loading your progress…"*.
- **Retry**: the next `onSignedIn(false)` — every page load of a signed-in player (`js/boot.js`'s resume
  path) and every sign-in. No automatic retry (out of scope).
- **Tests**, new `tests/cloud-sync.test.mjs`, a per-test `fetch` and a stub Cognito user: pull 200 with
  data (loaded, pushes allowed after); 200 `null` (pushes); 429, 500 and a thrown error (no PUT, panel
  says unreachable, a later `commitProgress` sends nothing, `cloudPush` sends nothing); a save queued
  during the pull sends nothing; sign-up pushes; the next sign-in after a failure loads and re-enables
  pushes; sign-out stops pushes. From the ticket's comment (TUN-82's review): a `PUT /progress` answering
  429 is one `fetch` call, and the next save sends the whole progress again.
  `tests/helpers/backend-fixtures.mjs` sets `cloudSync="ready"` beside its `freshToken` stub.

## Built

As planned. Two additions while building: `doSignOut` and `onSignedIn` also drop a save already
queued (`clearTimeout(_pushT)`), so a save queued for one player never lands after they sign out or
another signs in; and a 200 whose body is not JSON (a captive portal's page, say) counts as a failed load.

**Tests:** `tests/cloud-sync.test.mjs`, 12 cases (the ticket's list, plus 503, a non-JSON 200, a save
during the pull, sign-out, the retry on the next sign-in, and the 429-push cases from the ticket's
comment). Mutation check, each run against the new file and restored: a non-OK load read as "nothing
saved" (5 fail), a thrown load read as "nothing saved" (2), no gate in `cloudPush` (5), no gate in
`scheduleCloud` (5, once the failure cases also assert no timer is queued — it survived before),
sign-out keeping `"ready"` (1), a failed load marked `"ready"` (6).

**Browser:** the page loads with this branch's `js/cloud.js` (served bytes compared) and logs no errors.
**Not verified in a browser:** every signed-in state — AO's browser cannot run page code and this worker
has no account; the API refuses every origin but `tunegarden.game` (CORS), so only production reaches it.

## PR review — round 1 (Astra, through `ask.sh`, on `ecab246`)

<details><summary>GPT's review, verbatim</summary>

**VERDICT: CHANGES REQUESTED**

**FINDINGS**

1. **blocker — js/cloud.js:57–61:** Pull completions are not bound to their sign-in attempt/account. Reproduced: A’s GET remains pending; sign out; B signs in and gets 429; A’s GET returns `null`; the stale continuation sends a PUT using **B’s token**, overwriting B’s unread progress. Conversely, an older failure disables saving after a newer successful load. Require an account-bound attempt identifier, invalidated on sign-out/new sign-in, and checked after every await before changing state, applying progress, or pushing.

2. **blocker — js/cloud.js:26–28:** `cloudPush` checks permission only **before** awaiting `freshToken()`. Clearing the timer cannot cancel a push already awaiting token refresh. Reproduced: A’s push waits for its token; sign out and load B; release A’s token; the PUT writes **B’s progress into A’s account**. Recheck attempt/account identity and readiness after token acquisition, immediately before sending.

3. **should-fix — js/cloud.js:59–62:** Any JSON body that fails the progress check falls through to the “nothing saved” push. Reproduced GET `200 {}` → PUT of local progress. Only explicit `null` establishes that no cloud progress exists. Reject malformed non-null bodies as failed loads, preserve local progress, and keep writes blocked. Update the plan’s explicit decision to overwrite these responses.

4. **should-fix — js/cloud.js:72:** The failure message recommends reloading without explaining that continued play stays local and a successful reload **replaces it**. State those consequences calmly in the panel; the backend README already documents them. Preserve the existing replacement behavior.

**MISSING TESTS**

1. Defer A’s GET, sign out, sign in B with GET 429, then resolve A with `null` and separately with progress. Assert no PUT, no stale progress application, and B remains blocked. Also resolve an older failed attempt after a newer successful load; saving must remain enabled.

2. Start a legitimate save and defer its token callback. Sign out, then release the token: assert no PUT. Repeat after B successfully loads: assert no PUT using A’s token or B’s progress.

3. Return 200 with `{}`, an array, a primitive, and malformed `packages`. Assert local progress is preserved, sync remains blocked, and neither sign-in nor subsequent saves send PUTs. Keep explicit `null` as the successful first-save control.

4. Extend the failed-load panel assertion to require the device-only saving and replacement-on-reload explanation, including after a plain `renderAuth()`.

Syntax checking and all 41 cloud/backend tests passed; the reproductions above expose gaps in that coverage. No files changed.

</details>

### My answers

1. **Agree.** `_cloudRun`, bumped by every `onSignedIn` and `doSignOut`; `onSignedIn` checks it after each
   await (token, load, sign-up push) and does nothing in a replaced run. Tests: Ann's late load answering
   `null` and answering progress after Bea's failed load (2), a load returning after sign-out with no new
   sign-in, and an older failure after a newer success.
2. **Agree.** `cloudPush` captures the run before asking for the token and rechecks run and readiness once
   it comes, right before sending. Tests: a push waiting for Ann's token across sign-out; and across Bea's
   sign-in and successful load, with only Ann's token held — only Bea's `GET` goes out.
3. **Agree** — reverses my plan's "push over a 200 that is not progress". Only an explicit `null` means
   "nothing saved"; `{}`, an array, a number, `packages` as a string or an array are failed loads. Tests:
   all five, through the same failure checks as a 429.
4. **Agree.** The panel now reads: "couldn't reach the cloud just now. Your cloud progress is safe, but
   what you play now stays on this device: reloading later loads your cloud progress in its place." The
   failure tests assert the whole sentence, after a plain `renderAuth()` too.

**Mutation check of the new tests** (each restored): no run check after the load (3 fail), no recheck
after the push's token (2), a recheck of readiness but not the run (1 — it survived until the token test
held only Ann's token), sign-out not bumping the run (1 — it survived until the after-sign-out load test),
any 200 body counted as a load (5), `packages` allowed to be an array (1). Not tested: the run check after
the sign-up push, which only keeps a replaced run from re-rendering the panel's status.
