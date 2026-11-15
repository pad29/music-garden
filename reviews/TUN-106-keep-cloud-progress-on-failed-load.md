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
