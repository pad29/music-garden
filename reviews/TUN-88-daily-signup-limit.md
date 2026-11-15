# TUN-88 — Limit how many accounts can be created in a day

Branch `ao/signup-limit/root` · Size **M** · `needs-owner` · touches `backend/` (template, the sign-up
function), `js/cloud.js`, tests, `backend/README.md`.

## Plan (Claude)

### Verified against the docs (2026-11-15)

- **A failing trigger reaches the client as** `PreSignUp failed with error <our text>.` — "The Amazon
  Cognito user pools API returns trigger errors in the format `[trigger] failed with error [error text
  from response]`" (Cognito guide, *Customizing user pool workflows with Lambda triggers*). The error
  code is `UserLambdaValidationException`. So our text goes to the browser: it must be a fixed token,
  never an AWS error.
- **5 seconds:** "When Amazon Cognito calls your Lambda function, it must respond within 5 seconds. If it
  doesn't and if the call can be retried, Amazon Cognito may retry the call." A retry after a slow
  success counts one sign-up twice — an overcount, the safe direction.
- **Trigger sources:** `PreSignUp_SignUp` (the game's `SignUp`), `PreSignUp_AdminCreateUser` (needs the
  owner's IAM credentials), `PreSignUp_ExternalProvider` (no identity provider is configured).
- **Cognito's `UserCreation` quota** (`SignUp`, `AdminCreateUser`, …): 50 requests/second per account
  and Region, by default.
- **Cognito pricing:** new pools default to **Essentials**: 10,000 MAUs free, then **$0.015**. Lite:
  $0.0055 (pools created on or before 2024-11-22 keep 50,000 free). This pool dates from 2026-06
  (`be32387`) and the template sets no `UserPoolTier`, so it should be on Essentials — the owner can
  confirm with `aws cognito-idp describe-user-pool --user-pool-id us-east-1_Ikzq1qoTI --query
  UserPool.UserPoolTier`. "A user is counted as a MAU if, within a calendar month, … administrative
  creation or update, sign-up, sign-in, sign-out, token refresh, password change" happens for them.
- **DynamoDB:** `UpdateItem` with `ADD` is atomic, and a `ConditionExpression` is checked atomically with
  it; a failed condition still bills one write unit. TTL deletes expired items at no cost, "typically
  within a few days" of expiry.

### Approach

1. **A counter table, `SignUpCountTable`** (`music-garden-signup-count`): on-demand, key `day` (a
   string, the UTC date, `2026-11-15`), attributes `signups` (number) and `expiresAt` (epoch seconds),
   TTL on `expiresAt`. No point-in-time recovery, no deletion protection, no `Retain`: it holds nothing
   worth keeping, and losing it only resets today's count *(wrong — see PR review rounds 1–2: deleting the
   table fails sign-ups closed until it is recreated, and warm functions remember a full day)*. Its own table rather than a reserved key in
   `ProgressTable`, so TTL is never switched on for the table that holds players' progress.
2. **The sign-up function counts before it confirms.** One conditional `UpdateItem` per sign-up:
   `SET expiresAt = if_not_exists(expiresAt, :exp) ADD signups :one` if
   `attribute_not_exists(signups) OR signups < :max`. Success → auto-confirm as today. Condition failed →
   throw `Error("daily-signup-limit")`, and remember the full day in module scope, so later refusals in a
   warm container that day make no DynamoDB call (a refused attempt then costs only the Lambda call).
   `expiresAt` is the day's start + 3 days.
3. **Only `PreSignUp_AdminCreateUser` is not counted** (only the owner can call it). Every other source,
   an unknown one included, is counted.
4. **The counter cannot be reached, or the limit is not a whole number ≥ 0 → refuse** (fail closed),
   with the fixed text `signup-counter-unavailable`; the real error goes to CloudWatch only. Why refuse:
   failing open would make a broken deploy (a missing permission, a misspelled table) switch the cost
   protection off silently; failing closed shows at once, on the owner's playtest, and costs a child
   only the account — guest play goes on, as when the cost switch is off. The SDK client gets short
   timeouts (connect 1 s, request 1.5 s, 2 attempts) so a refusal comes well inside Cognito's 5 s.
5. **N is a deploy setting:** `DAILY_SIGNUP_LIMIT: "100"` in `PreSignUpFn`'s environment in
   `template.yaml`, held by `tests/backend-template.test.mjs` as the approved value, like the route
   throttles. Not a stack parameter: SAM reuses a parameter's previous value on later deploys, so an
   edited default would silently not apply. To change it: edit the value, the test, the README and the
   arithmetic here, and deploy. (An emergency change in the Lambda console works at once and is undone by
   the next deploy.) `0` refuses every sign-up.
6. **Least privilege:** `PreSignUpFn` gets one statement, `dynamodb:UpdateItem` on the counter table's
   ARN, nothing else. The cost switch is untouched: it still sets `PreSignUpFn` to concurrency 0.
7. **Code shape**, as TUN-83 and TUN-87 did: `backend/src/presignup-api.mjs` holds the logic without the
   SDK (`makePreSignUpHandler(counter, { limit, now })`, `signUpConfig(env)`, `utcDay`), and
   `presignup.mjs` only wires the DocumentClient in.
8. **The client:** in `submitAuth`, a sign-up error that is a trigger failure **and** whose message
   carries `daily-signup-limit` shows a message of its own, checked before TUN-87's mapping:
   "🌱 So many new gardeners joined today that the garden is full! Keep playing as a guest — your garden
   is saved on this device — and make your account tomorrow." Every other trigger failure (the switch,
   the counter unavailable) keeps TUN-87's "isn't taking new accounts just now". No sign-in is
   attempted after either. Nothing else in the form changes (a later ticket redesigns it).

**Counting is per attempt that passes the trigger,** not per account made: if Cognito refuses a sign-up
after the trigger ran (should a taken username be checked after it), that attempt still counted. An
overcount is the safe direction.

### Tests (no AWS)

- `tests/backend-presignup.test.mjs`, an in-memory counter that applies the condition atomically:
  N sign-ups pass and the N+1th throws exactly `daily-signup-limit`; **2N concurrent** sign-ups → exactly
  N pass; a new UTC day (23:59:59.999 → 00:00:00.000) starts again; the `UpdateItem` parameters (key,
  condition, names, `expiresAt` = day start + 3 days, set only if absent); auto-confirm and auto-verify
  as today; `AdminCreateUser` not counted; after a refusal, the same day makes no further call and the
  next day does; a DynamoDB error, or a limit that is missing, empty, negative, fractional or not a
  number → `signup-counter-unavailable`, no AWS text in the message, the error logged; limit 0 refuses.
- `tests/backend-template.test.mjs`: the table (on-demand, `day` key, TTL on `expiresAt`), the function's
  environment (`DAILY_SIGNUP_LIMIT` = the approved 100, the table's name) and its policy (exactly
  `UpdateItem` on that table), with a broken-template case for each.
- `tests/cloud-resting.test.mjs` (the TUN-87 sign-up mapping): the daily-limit error → the new message,
  no sign-in; the other trigger failures still → TUN-87's; a taken username still → Cognito's own text.

### Docs

`backend/README.md`: a section *The daily sign-up limit* (what it does, the setting and how to change it,
fail closed, the accepted lock-out trade, the arithmetic summary), the residual-risk note in *Limits and
budget* ("Sign-ups go to Cognito directly … (TUN-88)") brought up to date, the change set to expect on
the next deploy, and the message list in *The cost switch*.

### Risks

- **The lock-out** (the ticket's accepted trade): a script can use up the day's 100 by early morning UTC
  and nobody else can make an account until 00:00 UTC (18:00 in Chicago, 19:00 in summer). Guest play is
  untouched. The docs say so.
- **"Tomorrow" is the UTC day**, which for the owner's players turns over in the early evening.
- **The exact error shape** comes from the docs, not from a call; the playtest checks it (set the limit
  to 0 in the console, try to sign up, put it back).

### Questions only the owner can answer

None open: N = 100 was decided on 2026-11-15. The arithmetic below has one finding the owner should see
before deploying — the Cognito MAU line.

## The arithmetic

TUN-82's prices and method (`reviews/TUN-82-throttle-budget-data-protection.md` § The arithmetic):
31-day months, free tiers ignored except where named, **decimal** GB. Storage is $0.25/GB-month, and
point-in-time recovery $0.20/GB-month on the table's half only.

**Per-account storage ceiling** (TUN-83): 50 songs × ~16,600 bytes, stored twice (table and the
ALL-projection `byOwner` index), plus one progress row of ~16,450 bytes; with DynamoDB's 100 bytes per
item, about **1.69 MB per account** (0.85 MB on the table, 0.84 MB in the index). Filling it takes 50
`POST /songs`; those writes are inside TUN-82/83's saturated-rate scenario ($155.33/month), not added to
it.

**Worst case: every day's N accounts are made, and every one is filled to the ceiling.**

| Daily limit N | Accounts / month | Storage added / month | Its cost, per month of abuse | Storage bill after 12 such months |
|---|---|---|---|---|
| A — 50 | 1,550 | 2.61 GB | +$0.92/month | $11.01/month |
| **B — 100 (chosen)** | **3,100** | **5.23 GB** | **+$1.84/month** | **$22.02/month** |
| C — 500 | 15,500 | 22.62 GB* | +$7.94/month | $95.32/month |

\* At 500 a day the accounts could hold 775,000 songs a month, but `POST /songs`' throttle (0.25/s)
creates at most 669,600: the throttle binds, as it does with no cap at all (22.36 GB/month of songs).
So **at 100 a day the cap cuts the storage growth ceiling about 4.3-fold**, from 22.36 to 5.23 GB/month.
Storage is cumulative: each month of abuse adds its line to every later month's bill, until the accounts
are removed. (DynamoDB's 25 GB free storage would absorb the first ~4.8 months at N = 100.)

**Cognito monthly active users — the larger line.** A sign-up makes its account an MAU that month. If
the attacker also signs every account in (or refreshes its token) once each month — free to them, and
it never touches our API or the trigger — every account ever made stays an MAU. On Essentials ($0.015
above 10,000 free):

| N | MAUs in month *m* | First month over 10,000 | Month 6 | Month 12 | Each further month |
|---|---|---|---|---|---|
| 50 | 1,550 *m* | month 7 ($12.75) | $0 | $129.00 | +$23.25 |
| **100** | **3,100 *m*** | **month 4 ($36.00)** | **$129.00** | **$408.00** | **+$46.50** |
| 500 | 15,500 *m* | month 1 ($82.50) | $1,245.00 | $2,640.00 | +$232.50 |

Without the re-sign-ins, the month's new accounts alone (3,100 at N = 100) stay inside the free 10,000.
On Lite ($0.0055) the N = 100 line would be $149.60 in month 12. **The cost switch does not stop this:**
it stops new accounts and the API, not sign-ins of existing accounts. The budget's emails at $15, $24
and $30 would tell the owner. Bounding it for good needs the accounts removed (or the pool on Lite) —
outside this ticket (*Out of scope*); without the cap, though, the same attacker could make 50 accounts
a **second** (Cognito's quota), so the cap is what makes the line grow in months rather than minutes.

**Refused attempts.** Each `SignUp` runs the trigger, refused or not. At Cognito's 50/s for a whole
month that is 133.9M Lambda calls: $26.78 in requests plus ~$1.40 of duration, with no DynamoDB cost
once a warm container has seen the day is full. This existed before TUN-88 (every sign-up ran the
trigger) and the cap does not change it; the reserved concurrency of 2 and the cost switch do.

**The counter itself:** one write unit per counted sign-up — 3,100 a month at N = 100, $0.002.

## Design review (Astra)

`ask.sh fresh read-only gpt-6-astra`, 2026-11-15, on the plan above with the ticket verbatim and the owner's answer.

<details><summary>GPT's design review, verbatim</summary>

**Changes requested.** The counter approach is viable, but the timeout guarantee and several cost claims are not. No files changed; no AWS operations performed.

1. **High — The proposed timeouts do not establish a response within Cognito’s five seconds.**  
   [Plan, line 52](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-35/reviews/TUN-88-daily-signup-limit.md:52)

   In the current Smithy HTTP handler, `requestTimeout` merely warns unless `throwOnRequestTimeout: true` is set. TUN-87’s `CLIENT_OPTIONS` explicitly includes that flag. Two attempts also introduce retry delays; per-request timeouts are not an overall deadline. Cognito’s five-second limit includes time outside the DynamoDB request. [Smithy implementation](https://raw.githubusercontent.com/smithy-lang/smithy-typescript/main/packages/node-http-handler/src/set-request-timeout.ts), [Cognito trigger requirements](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-working-with-lambda-triggers.html).

   **Change:** specify the actual SDK options, including `throwOnRequestTimeout`, and impose an abortable overall operation deadline with substantial headroom. The simpler option is `maxAttempts: 1`, a short request timeout, and the overall deadline. Retrying a non-idempotent increment increases overcounting. Add tests for a hanging operation, abort propagation, late completion, and the SDK adapter—not just the pure handler.

2. **High — The “storage growth ceiling” repeats assumptions already rejected in TUN-82 and TUN-83.**  
   [Arithmetic, line 117](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-35/reviews/TUN-88-daily-signup-limit.md:117)

   The 50-song quota is explicitly **soft**: count-then-create races and an eventually consistent index can exceed it. The API throttle is explicitly best-effort, and this repository records substantial measured overshoot. Therefore, “creates at most 669,600” and the claimed hard 4.3-fold reduction are unsupported.

   Recomputed using the plan’s approximate item sizes, decimal GB, and prices:

   | N | New accounts/31 days | Storage at exactly 50 songs/account | Added monthly storage + PITR run rate | Run rate after 12 such periods |
   |---|---:|---:|---:|---:|
   | 50 | 1,550 | 2.614 GB | $0.918 | $11.01 |
   | **100** | **3,100** | **5.228 GB** | **$1.835** | **$22.02** |
   | 500 | 15,500 | 26.142 GB | $9.175 | $110.10 |

   Calculation per account: table **851,550 bytes**, index **835,000 bytes**; monthly cost = total GB × $0.25 + table GB × $0.20.

   **Change:** call these *50-song scenarios*, explicitly retaining TUN-83’s soft-cap limitation. Keep the existing 500/day row only as a separate **nominal-throttle scenario**: its 22.621 GB and $7.943 arithmetic is correct under that assumption. A strict storage ceiling requires atomic song-quota enforcement, which is separate work.

3. **High — Refusal costs omit logging, assume permanent cache reuse, and use the wrong execution rate.**  
   [Arithmetic, line 155](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-35/reviews/TUN-88-daily-signup-limit.md:155)

   Cognito’s 50/s quota is offered traffic, not 50 executed triggers/s. AWS documents a synchronous Lambda request-rate limit of ten times the corresponding concurrency quota: with reserved concurrency 2, use **20 executions/s**, subject also to duration. That gives **53.568 million executions/31 days**, **$10.71 in requests**, and **$0.56 duration only if billed duration averages 5 ms**. The plan never states that duration assumption. [Lambda scaling limits](https://docs.aws.amazon.com/lambda/latest/dg/lambda-concurrency.html).

   More seriously, cached refusals still produce Lambda logs. System records and thrown-error output cost money; the template has no explicit retention policy. An illustrative **1,000 ingested bytes/execution** at that execution rate is **53.568 GB**, approximately **$26.78 ingestion** before free allowances, plus retained-log storage. This is a scenario, not a measured log size. [Lambda logging](https://docs.aws.amazon.com/lambda/latest/dg/nodejs-logging.html), [CloudWatch pricing](https://aws.amazon.com/cloudwatch/pricing/).

   Cold/replacement environments also need another conditional write before learning that the day is full. Reserved concurrency 2 does not guarantee only two cache misses per day.

   **Change:** distinguish offered requests, executions, cached refusals, counter calls, and log bytes. Measure refusal log volume during the owner’s rehearsal; include logging and cache-miss sensitivity. The **$0.0019375** counter figure covers successful increments only, not all counter traffic.

4. **Medium — The zero-limit behavior contradicts the supplied condition.**  
   [Approach, line 41](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-35/reviews/TUN-88-daily-signup-limit.md:41)

   With a missing item and `:max = 0`, `attribute_not_exists(signups) OR signups < :max` is true. The first signup passes unless a separate guard prevents the write.

   **Change:** explicitly require an early `limit === 0` refusal with `daily-signup-limit`, before DynamoDB access. Test zero against both an absent and an existing counter. Validate configuration as a nonnegative **safe integer**, rejecting whitespace-only strings, infinity, unsafe integers and partial numeric strings. Validate the table setting too. Configuration failure must not populate the “day full” cache.

5. **Medium — Accepting unknown trigger sources conflicts with the repository’s refusal rule.**  
   [Approach, line 45](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-35/reviews/TUN-88-daily-signup-limit.md:45)

   Counting an unknown source and then auto-confirming it is still accepting an operation whose semantics the backend does not know. It contradicts “the backend refuses what it doesn’t know.”

   **Change:** explicitly dispatch supported trigger sources and refuse missing/unknown sources with a fixed failure token before writing. Preserve the deliberate administrator exemption only as a documented exception to the public-signup cap. Test each source. Also distinguish setting response flags from their effect: Cognito ignores the auto-confirm/auto-verify flags for `AdminCreateUser`. [Pre-signup documentation](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-lambda-pre-sign-up.html).

6. **Medium — Mid-day configuration changes have no defined operational contract.**  
   [Approach, line 57](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-35/reviews/TUN-88-daily-signup-limit.md:57)

   “Works at once” is false: Lambda continues using the previous configuration while an update is in progress. “Undone by the next deploy” is also too strong; CloudFormation does not generally reconcile all manual drift merely because another deployment occurs. TUN-87 already records that distinction. [Lambda update states](https://docs.aws.amazon.com/lambda/latest/dg/functions-states.html).

   **Change:** document that changing N preserves today’s accumulated count. Raising N permits the remaining difference; lowering N cannot revoke earlier admissions. Wait for `LastUpdateStatus: Successful`, then verify the effective environment. Restore emergency console changes explicitly.

   Scope cached fullness to a handler’s immutable configuration and UTC day; never reuse it across different limits/tables in tests or future configuration reloads. Test new handlers sharing the same stored count at higher and lower limits. Preserve the cost-switch status checks before and after deployment; changing N must never change concurrency.

7. **Medium — Midnight needs an in-flight test and a precise definition of what day is being counted.**  
   [Tests, line 79](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-35/reviews/TUN-88-daily-signup-limit.md:79)

   Sequential calls immediately before and after midnight do not cover a write started before midnight whose result arrives afterward. Computing the cache date again in the catch path could incorrectly mark the new day full. Computing the key and TTL from separate clock reads can also produce inconsistent values.

   **Change:** capture time once per invocation and derive the key, expiry and cached refusal day from that value. Test a delayed previous-day success and failure across midnight. Define the guarantee as **at most N successful admissions assigned to each UTC day**, not exactly N completed Cognito accounts on that calendar date. Retries and subsequent Cognito failures can consume allowance without producing an account; do not refund uncertain writes.

8. **Medium — Two proposed remedies in the cost narrative do not do what it claims.**  
   [Arithmetic, lines 134 and 151](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-35/reviews/TUN-88-daily-signup-limit.md:134)

   Putting the pool on Lite lowers the price; it does **not** bound cumulative MAU spending. The plan’s own $149.60 month-12 example disproves “bounding it for good.” Deleting Cognito accounts also does not delete their DynamoDB songs or progress: this repository has no account-deletion cleanup path.

   **Change:** remove Lite as a bounding remedy, and distinguish account removal from data cleanup. State that the twelve-month growth examples assume signup remains enabled or is repeatedly re-enabled; the cost switch stops further admissions but cannot eliminate charges from the existing active cohort.

   The Essentials MAU table itself is arithmetically correct under its assumptions, and current AWS pricing supports $0.015 above the applicable 10,000 allowance. Confirm the actual pool tier and available account/organization allowance before approval. [Cognito pricing](https://aws.amazon.com/cognito/pricing/).

9. **Medium — The proposed tests can pass without proving the production counter works.**  
   [Tests, line 77](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-35/reviews/TUN-88-daily-signup-limit.md:77)

   An atomic in-memory counter proves the behavior of that fake. It does not validate DynamoDB expression syntax, IAM, SDK wiring or Cognito’s actual error object. Likewise, the proposed **limit-zero playtest should bypass DynamoDB**, so it cannot verify the new table permission or conditional write.

   **Change:** add multiple handler instances sharing one fake database, committed-write/lost-response failures, transient failure followed by recovery, and assertions that refused events never acquire confirmation flags. Make the fake reject unsupported/missing expressions rather than silently supplying intended semantics.

   Extend client cases to `code`, `name`, and message-only trigger failures; verify token precedence, counter-unavailable fallback, no sign-in/upload, unchanged guest progress, and unchanged sign-in behavior. Owner acceptance must include a real successful increment and a real condition-failed refusal—not only N=0—plus continued guest play in the same browser session.

10. **Low — The deployment and cost documentation needs explicit qualifications.**  
    [Docs, line 90](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-35/reviews/TUN-88-daily-signup-limit.md:90)

    **Change:** name the expected change-set entries: new counter table; modifications to `PreSignUpFn` and its **existing generated role**; possible familiar dependent-resource rows. Adding `Policies` appends permissions to that role—it does not require a replacement user pool or a newly invented execution role. Keep `sam validate --lint` and the existing protected-resource replacement stop rules. [SAM function policies](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-resource-function.html).

    Document that deleting/recreating today’s counter resets enforcement; its contents are operational quota state, even if they need no PITR. Label storage figures as **end-of-period monthly run rates**, not actual invoices during gradual accumulation. The 25 GB allowance does not make PITR free. Add the landed feature to `DESIGN.md`, as AGENTS.md requires.

No issue with **fail-closed**: fail-open improves signup availability during a transient outage, but silently defeats the accepted spending control; guest play makes fail-closed the stronger choice here.

No issue with **one conditional `UpdateItem`, a separate TTL table, and UpdateItem-only data permission**. Failed conditions consume write capacity; TTL is delayed cleanup, not the reset mechanism. `day` is reserved only when used in an expression; using it in `Key` is valid. [DynamoDB conditional writes](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/WorkingWithItems.html), [TTL](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/TTL.html), [reserved words](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/ReservedWords.html).

No issue with **daily-token mapping before TUN-87’s generic trigger mapping**. The existing nested signup catch is the correct boundary.

The simplest satisfactory design remains the proposed conditional counter, with **one SDK attempt**, explicit failure handling, and the refusal cache treated solely as a cost optimization.

</details>

## My answers (Claude)

1. **High — timeouts. Agreed.** One attempt (`maxAttempts: 1`: a retried increment overcounts), connect
   1 s, request 1.5 s with `throwOnRequestTimeout: true`, and an overall 2.5 s deadline through an
   `AbortController` whose signal goes to `send`. Past the deadline the sign-up is refused
   `signup-counter-unavailable`; a late result changes nothing. The SDK wiring moves into an `sdkAdapter`
   in `presignup-api.mjs`, tested with a fake client, as TUN-87's is.
2. **High — "ceiling" over-claimed. Agreed.** TUN-83 calls the 50-song quota soft and TUN-82 the throttle
   best-effort; I wrote a hard 4.3-fold cut on both. The arithmetic is relabelled *50-song scenarios*, and
   500 a day shows both GPT's no-throttle figure and the nominal-throttle one.
3. **High — refusal costs. Agreed**, with one note: the Lambda calls and their START/END/REPORT log lines
   happened on every sign-up attempt before TUN-88 too; what TUN-88 adds is the thrown error's log record
   on each refusal, and a conditional write on each cache miss. The arithmetic now separates offered
   requests (Cognito's 50/s), executions (Lambda's 10 × concurrency = 20/s), duration (an assumption,
   stated), log bytes (a scenario, to measure at the owner's rehearsal) and counter calls. To keep the
   added log small, a refusal's error carries a one-line stack, and the function logs a refusal only on
   the first one a container sees each day. Log levels and retention for every function are a separate,
   account-wide question — a follow-up, not this ticket.
4. **Medium — limit 0. Agreed; my plan was wrong.** With no item, `attribute_not_exists(signups)` is true
   and the first sign-up would pass. `0` now refuses `daily-signup-limit` before any DynamoDB call. The
   limit must match `^\d+$` and be a safe integer; the table name must be non-empty. A config failure
   never marks the day full.
5. **Medium — unknown trigger sources. Agreed.** Only `PreSignUp_SignUp` (counted) and
   `PreSignUp_AdminCreateUser` (exempt, the owner's own) are accepted; anything else, `ExternalProvider`
   included (no identity provider is configured), is refused `signup-source-unsupported` before any
   write. The docs say Cognito ignores the confirm flags on `AdminCreateUser`.
6. **Medium — mid-day changes. Agreed.** The docs say: changing N keeps today's count (raising it lets the
   difference through; lowering it revokes nothing); after a console change wait for
   `LastUpdateStatus: Successful`; a console change is drift that a later deploy may **not** undo, so put
   it back by hand. The full-day cache belongs to one handler instance (one limit, one table) and one UTC
   day.
7. **Medium — midnight. Agreed.** One clock read per invocation gives the key, the expiry and the day a
   refusal marks full; a previous-day write that resolves after midnight cannot mark the new day. The
   guarantee is stated as **at most N admissions counted against each UTC day** — not N accounts made.
8. **Medium — remedies. Agreed.** Lite lowers the price, it does not bound the growth; deleting Cognito
   accounts leaves their songs and progress in DynamoDB. The twelve-month figures assume sign-up stays
   on; the cost switch stops new accounts but not the existing ones' MAUs.
9. **Medium — tests prove the fake. Agreed.** The fake accepts only the exact expression strings and
   names the handler sends, and throws on anything else. Added: several handlers sharing one fake table,
   a committed write whose response is lost, a failure then a recovery, refusals never setting confirm
   flags, and the client's `code`/`name`/message-only shapes, token precedence, no sign-in and unchanged
   guest progress. The owner's acceptance becomes a real increment (the item in the DynamoDB console)
   and a real condition refusal (the limit set in the console to today's count), not only `0`.
10. **Low — docs. Agreed.** The change set the next deploy shows (the new table, `PreSignUpFn` and its
    generated role `PreSignUpFnRole`), that deleting the counter table resets today's count, run rates
    not invoices, PITR not covered by the 25 GB free storage, and `DESIGN.md` § 11b.

GPT found no issue with failing closed, the separate TTL table, the `UpdateItem`-only permission, or the
token checked before TUN-87's mapping.

## Plan, revised after the design review

As *Plan (Claude)*, with:

- **`presignup-api.mjs`:** `signUpConfig(env)` → `{ ok, limit, table }` or `{ ok:false }`;
  `utcDay(ms)`; `makePreSignUpHandler(counter, { config, now, deadlineMs })`; `sdkAdapter(client,
  UpdateCommand)`; the tokens `daily-signup-limit`, `signup-counter-unavailable`,
  `signup-source-unsupported`. Order per call: one clock read → source check → config check → limit 0 →
  cached full day → the conditional write under the deadline → confirm.
- **SDK:** `{ maxAttempts: 1, requestHandler: { connectionTimeout: 1000, requestTimeout: 1500,
  throwOnRequestTimeout: true } }`, deadline 2,500 ms.
- **Owner's acceptance** (the playtest checklist): a sign-up → today's item in `music-garden-signup-count`
  shows `signups` up by one; set `DAILY_SIGNUP_LIMIT` in the Lambda console to that count, wait for
  `Successful`, sign up → the "garden is full" message, still playing as a guest; put it back.

## Owner's decisions

1. *What daily limit?* — **B, 100**, a deploy setting: the owner, through the orchestrator's spawn
   prompt, 2026-11-15, before the arithmetic existed.
2. *Design checkpoint (`needs-owner`)* — the owner's answer above came with the instruction to run the
   whole loop to a PR, so the build went ahead without stopping. The arithmetic below has a line the
   owner has not seen (Cognito MAUs): it is in the hand-off, and N is one value to change before
   deploying.

## The arithmetic, revised after the design review

Replaces *The arithmetic* above where they differ (findings 2, 3 and 8). These are **scenarios**, and
the storage figures are **run rates at the end of each month** of abuse, not that month's invoice.

**50-song scenarios.** Each account holds exactly TUN-83's 50 songs and one full progress row: per
account 851,550 bytes on the tables, 835,000 in the `byOwner` index. The 50-song quota is **soft**
(TUN-83: count-then-create races and the eventually consistent index can pass it), so this is not a
ceiling.

| N | Accounts / month | Storage added / month | Run rate added / month | Run rate after 12 months |
|---|---|---|---|---|
| 50 | 1,550 | 2.61 GB | +$0.92 | $11.01 |
| **100 (chosen)** | **3,100** | **5.23 GB** | **+$1.84** | **$22.02** |
| 500 | 15,500 | 26.14 GB | +$9.18 | $110.10 |
| 500, `POST /songs` held to its nominal 0.25/s | 15,500 | 22.62 GB | +$7.94 | $95.32 |

The throttle is best-effort and measured looser than configured (`backend/README.md` § Limits and
budget), so the last row is a scenario too. DynamoDB's 25 GB of free storage does not cover
point-in-time recovery. Deleting the Cognito accounts would not remove this data: nothing removes a
deleted account's songs and progress today.

**Cognito MAUs** — unchanged from the first arithmetic, and correct by GPT's check: at N = 100 on
Essentials, month 4 $36.00, month 6 $129.00, month 12 $408.00, +$46.50 each further month, **if** sign-up
stays on all year and every account is signed in monthly. The cost switch stops new accounts at $30,
not the existing accounts' MAUs; switching it back on starts the growth again. Putting the pool on Lite
lowers the price (month 12: $149.60), it does not stop the growth. The pool's real tier and free
allowance are the owner's to confirm (`describe-user-pool`, above) before deploying.

**A flood of refused sign-ups**, a whole month at the most that can run:

| Line | Assumption | $ / month |
|---|---|---|
| Offered `SignUp` calls | Cognito's `UserCreation` quota, 50/s: 133.9M | — (Cognito does not bill calls) |
| Lambda executions | Lambda runs at most 10 × concurrency = 20/s: 53.6M | $10.71 |
| Lambda duration | $0.11 per ms of average billed duration; at most 2 × 128 MB all month | $0.56 at 5 ms, at most $11.16 |
| CloudWatch Logs ingestion | $0.50/GB; bytes per execution **to be measured** at the rehearsal | $8.04 at 300 B, $13.39 at 500 B, $26.78 at 1,000 B |
| Counter writes | one per cache miss (a cold or new container, or a container's first refusal of the day) | $0.625 per million misses; $33.48 if every execution missed |

Log storage adds $0.03 per GB-month, kept forever (no retention is set). *(Corrected in PR review round
1 — I had called $25–$40 "realistic" and said the cost switch "bounds it".)* At 5 ms of billed duration,
requests + duration + log ingestion come to **$19.31, $24.66 or $38.06 a month** for 300, 500 or 1,000
log bytes per execution, before log storage and cache misses. These are unmeasured scenarios, and not
all of them pass $30. The **cost switch** sets `PreSignUpFn` to concurrency 0 once the budget notices
$30 — after which Cognito refuses sign-ups without running the trigger, at no cost to us — but Budgets
sees billing data hours late (AWS: typically 8–12 hours apart), so it is a delayed shutdown, not a $30
ceiling. Before TUN-88 the same flood would have been 53.6M new accounts, each an MAU.

**The counter, when nobody attacks:** 3,100 successful increments a month at N = 100, $0.002, plus one
write per cache miss on refused days.

## Build (Claude)

As the revised plan, no departures. `backend/src/presignup-api.mjs` (the logic), `presignup.mjs` (SDK
wiring only), `SignUpCountTable` and `PreSignUpFn`'s environment and one-statement policy in
`template.yaml`, `signUpFullToday` / `SIGNUP_FULL_TODAY` in `js/cloud.js`. Docs: `backend/README.md`
(§ The daily sign-up limit; the first deploy after TUN-88 and its checks; the message list, the cost
switch's limits, tear-down and data protection), `README.md`, `DESIGN.md` § 11b, `tests/README.md`.

**Mutation audit (mine, before the PR review).** 22 mutations of `presignup-api.mjs` against
`backend-presignup.test.mjs`: 21 killed. The survivor lets the limit's pattern accept `.`; it is
equivalent, as `Number.isSafeInteger` still refuses `1.5`. The audit found that losing the deadline made
the hanging-counter test hang rather than fail: both deadline tests now carry a 5 s timeout. 4 mutations
of the client mapping in `js/cloud.js` against `cloud-resting.test.mjs` (TUN-87's check first, the token
alone enough, no full message, a sign-in after the refusal): all killed. 10 broken templates added to
`backend-template.test.mjs`, each refused with its own diagnostic.

**Browser** (AO's, this worktree served by `ao preview start`, `js/cloud.js` byte-compared): the game
loads with no errors, Home → Create account opens the form, and an empty submit answers "Enter a
username and password." The refusal messages themselves need the deployed trigger, so they are on the
owner's list; their text and precedence are proven in Node.

## Tests

`node --test "tests/*.test.mjs"`: 862 pass, 0 fail (before the PR review); 864 pass, 0 fail after rounds 1 and 2. **Not verified here** — the
owner's, after deploying: Cognito's real error object for a refusal; the conditional write, the
`UpdateItem` permission and TTL on the live table; the message on the live site; the pool's tier
(`describe-user-pool`); a refused sign-up's log bytes (the arithmetic's log line).

## PR review

### Round 1 — head `b340295` (GPT, `ask.sh fresh read-only gpt-6-astra`, 2026-11-15)

<details><summary>GPT's PR review, verbatim</summary>

Changes requested

1. **Medium — [backend/README.md:145](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-35/backend/README.md:145): the acceptance checklist tests the wrong client before merge.**  
   `tunegarden.game` serves `main`, whose client maps this refusal to TUN-87’s generic message. Deploying the backend cannot make production display this PR’s “garden is full” message. Use this PR’s verified branch preview for pre-merge signup/message checks, then check production after merge. Explicitly start the refusal check signed out, and compare the counter before/after the successful signup rather than accepting any existing positive count.

2. **Medium — [reviews/TUN-88-daily-signup-limit.md:384](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-35/reviews/TUN-88-daily-signup-limit.md:384): the revised arithmetic still overstates its conclusions.**  
   The individual calculations reproduce. At the stated 5 ms duration, requests + duration + ingestion total **$19.31, $24.66 and $38.06/month** for 300, 500 and 1,000 bytes/execution, before retained logs and cache misses. These are unmeasured scenarios; “realistic” is unsupported, and they do not all exceed $30. Replace that conclusion with conditional scenarios. Also replace “bounds it: at $30” with a delayed shutdown after the budget notification: billing updates typically occur 8–12 hours apart, so this is not a $30 spending ceiling. [AWS Budgets documentation](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-managing-costs.html)

3. **Low — [README.md:222](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-35/README.md:222), [backend/README.md:349](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-35/backend/README.md:349): the published guarantee remains stronger than the implementation.**  
   “At most 100 accounts can be made a UTC day” is false: an admission begun before midnight can complete afterward, alongside the following day’s allowance; administrator-created accounts are exempt. State the agreed guarantee consistently: **at most 100 public-signup admissions assigned to each UTC day, captured at invocation start**. Explain that uncertain writes and subsequent Cognito failures can consume allowance without creating an account. Update the corresponding DESIGN wording too.

4. **Low — [backend/README.md:392](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-35/backend/README.md:392): deleting the counter is not the documented immediate reset.**  
   Deleting the table causes uncached requests to fail closed until it is recreated. Deleting today’s row leaves warm handlers’ `fullDay` caches intact. I reproduced a cached handler refusing after its stored row was removed, without another database call. Describe deletion/recreation as invalidating the stored quota history and potentially allowing additional admissions, while cached handlers can continue refusing. Do not present deletion as a reliable reset operation.

The ten earlier design findings are addressed as follows:

| Earlier finding | Assessment |
|---|---|
| 1. Deadlines | **Addressed in code.** One attempt, throwing request timeout, overall deadline and abort forwarding. Production SDK execution remains unverified. |
| 2. Storage ceiling | **Addressed.** Revised figures are explicitly soft-cap scenarios; all four storage rows reproduce. |
| 3. Refusal costs | **Partly addressed.** Executions, logging and cache misses are separated correctly; finding 2 above remains. |
| 4. Zero/configuration | **Addressed.** Zero bypasses DynamoDB; invalid limits and empty table settings fail closed. |
| 5. Trigger sources | **Addressed.** Explicit public-signup/admin dispatch; unknown and external-provider sources refuse before writing. |
| 6. Configuration changes | **Addressed.** Shared count survives limit changes; caches belong to handler instances; update completion and manual drift restoration are documented. |
| 7. Midnight | **Code and tests addressed; documentation incomplete.** One captured timestamp drives the key, expiry and refusal cache; finding 3 above remains. |
| 8. Cost remedies | **Addressed.** Lite reduces price, deletion leaves application data, and continuing MAUs remain billable. |
| 9. Test realism | **Partly addressed.** Recovery, lost responses and multiple handlers are covered; production-boundary coverage below remains missing. |
| 10. Deployment/docs | **Mostly addressed.** Generated-role/change-set description, run-rate qualifications, PITR and DESIGN updates landed; findings 1 and 4 remain. |

The conditional `SET … ADD …` expression, aliases, DocumentClient values and atomic condition are sound. `day` appears only in `Key`, so its reserved-word status causes no problem. [DynamoDB expression syntax](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.UpdateExpressions.html)

The `CLIENT_OPTIONS` object is a supported SDK v3 shorthand; the abort adapter is correctly wired. [AWS SDK shorthand](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/node-configuring-maxsockets.html)

The template is sound: an in-memory SAM transform adds only `SignUpCountTable` and modifies `PreSignUpFn` and its existing `PreSignUpFnRole`. Familiar packaging/dependency rows may also appear in the deployed change set.

The client mapping is sound: daily-token precedence is correct, refusals return before sign-in/upload, and backend exceptions expose fixed tokens. Running the actual vendored library against synthetic HTTP responses confirmed normal and namespaced error types preserve the token; its header-only fallback loses the message and correctly receives the generic refusal.

**Missing tests**

1. **Production entry-point wiring and timeout completion** — [tests/backend-presignup.test.mjs:259](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-35/tests/backend-presignup.test.mjs:259). Import `presignup.mjs` with recording SDK substitutes and assert constructor options, DocumentClient wrapping, parsed environment and the exact signal reaching `send`. Hold that send past the deadline, then separately resolve and reject it; assert refusal remains final and the event never acquires confirmation/verification flags. Current tests exercise the adapter separately and cover late rejection only.

2. **Effective trigger deployment guards** — [tests/backend-template.test.mjs:204](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-35/tests/backend-template.test.mjs:204). Add mutations removing `PreSignUpPermission`, pointing it at `SongsFn`, reducing the inherited Lambda timeout below the operation deadline, and adding counter-table retention attributes. All four currently return **zero problems**. Pin the invoke permission, effective timeout and intended table lifecycle with specific diagnostics.

3. **Vendored Cognito through the real signup wrapper** — [tests/cloud-resting.test.mjs:169](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-35/tests/cloud-resting.test.mjs:169). Exercise the bundled library with synthetic normal/namespaced `__type`, `code`, and header-only responses, through real `cogSignUp` and `submitAuth`. Record authentication and API calls directly; assert no sign-in/upload, unchanged persisted guest progress, and the correct specific/generic message. The current test replaces `cogSignUp` entirely.

Syntax and **70 focused tests passed**; the installed CloudFormation linter reported no findings. No files changed. Full-suite, real-browser and live-AWS acceptance were not rerun; the documented live increment/refusal, pool-tier and log-volume checks remain pending.

</details>

**My answers — all agreed:**

1. **Medium — the acceptance check used the wrong client. Agreed.** `tunegarden.game` serves `main`
   until the merge, and the backend deploys first. `backend/README.md` (*The first deploy after TUN-88*)
   and the playtest list now check the message on the PR's branch preview (sign-up talks to Cognito
   directly, which a preview may do) and on the live site after the merge; the refusal is tried signed out,
   and the count is compared before and after the successful sign-up.
2. **Medium — the refusal-flood conclusion overstated. Agreed; recomputed: $19.31 / $24.66 / $38.06.**
   *The arithmetic, revised* now gives conditional scenarios, and calls the cost switch a delayed
   shutdown, not a ceiling. `backend/README.md`'s *What it costs* says the same.
3. **Low — "at most 100 accounts a day" is stronger than the code. Agreed.** Now "at most 100 public
   sign-ups counted against each UTC day (the day each starts in)", with what that does not mean, in
   `backend/README.md`, `README.md`, `DESIGN.md`, `template.yaml` and `presignup.mjs`.
4. **Low — deleting the counter is no reset. Agreed** (GPT reproduced a warm handler refusing from memory
   after its row was deleted). The README now says not to, and why, and to raise the limit instead.

**Missing tests — all added:** (1) `presignup.mjs` itself, imported with recording SDK stand-ins via
`registerHooks`: the options, the DocumentClient wrap, the environment, the signal on the real send, and a
send held past the real 2.5 s deadline then resolved, and then rejected, without confirming the sign-up or
marking the day full; (2) the template: `PreSignUpPermission` pinned, a timeout under 3 s refused, the
counter table refused with lifecycle attributes — four broken templates added, each with its diagnostic;
(3) the vendored library itself through the real `cogSignUp` and `submitAuth`: `__type`, namespaced,
`code`, the counter unavailable, and header-only (no token → the generic line), each with no sign-in call,
no API call, and the guest's progress and storage unchanged. Mutations: 3/3 on the entry point, 4/4 on the
client mapping against the extended tests.

### Round 2 — head `6483851`, the delta since `b340295` (GPT, `ask.sh fresh read-only gpt-6-astra`, 2026-11-15)

<details><summary>GPT's PR review, verbatim</summary>

Changes requested

1. **Medium — [tests/cloud-resting.test.mjs:214](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-35/tests/cloud-resting.test.mjs:214): the vendored-library test checks the wrong storage.**  
   The Cognito context has no `localStorage`, so the library falls back to private memory. The assertions inspect the game’s separate localStorage. This cannot establish persisted guest-data safety through the real integration.

   **Reproduced:** an in-memory mutation adding `userPool.storage.clear()` inside real `cogSignUp` passes all eight tests. Connecting Cognito to the game’s localStorage makes that mutation fail because it deletes `mg_progress`.

   **Change:** give both contexts the same storage, seed guest progress before constructing the pool, and compare persisted contents after each refusal. Assert that `userPool.storage` is that shared storage.

2. **Low — [backend/README.md:403](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-35/backend/README.md:403): deletion recovery remains misleading.**  
   “Until a deploy recreates it” implies the normal deployment procedure repairs a manually deleted table. An unchanged deployment does not establish recreation; recovery requires an explicit resource-recreation operation. [AWS’s recovery procedure](https://repost.aws/knowledge-center/cfn-recreate-resource-deleted-outside) changes the template and references before updating.

   **Change:** say signups fail closed until the table is explicitly recreated, without promising ordinary redeployment repairs it. Also remove “losing it only resets today’s count” from [backend/template.yaml:304](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-35/backend/template.yaml:304) and [tests/backend-template.test.mjs:229](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-35/tests/backend-template.test.mjs:229); those active comments retain the rejected reset claim.

Round-1 disposition:

| Item | Assessment |
|---|---|
| Finding 1: wrong acceptance client | **Addressed.** Branch preview before merge, production afterward; signed-out refusal and before/after counter comparison are specified. |
| Finding 2: refusal arithmetic and spending bound | **Addressed.** $19.31 / $24.66 / $38.06 reproduce; assumptions and delayed shutdown are explicit. |
| Finding 3: overstated daily guarantee | **Addressed.** Documentation distinguishes UTC-attributed public admissions from completed accounts and administrator-created accounts. |
| Finding 4: deletion is not a reset | **Partly addressed.** The README explains cached refusals and recommends raising N; finding 2 above remains. |
| Missing test 1: deployed entry point | **Addressed.** `registerHooks` exercises real wiring with recording substitutes, the real deadline, abort propagation, and both late settlement paths. It does not validate production SDK transport behavior. |
| Missing test 2: template guards | **Addressed.** Permission, inherited timeout and lifecycle guards reject the requested mutations with specific diagnostics. Function-level timeout overrides are separately rejected. |
| Missing test 3: vendored Cognito integration | **Partly addressed.** Real wrappers and error conversion run, with authentication/API traffic recorded; shared-storage coverage remains missing. |

**Missing tests**

1. Run all five vendored Cognito refusal cases against the game’s shared, populated localStorage. Assert unchanged persisted guest progress and retain the no-sign-in/no-upload assertions. Verify that clearing `userPool.storage` before refusal makes this test fail.

Syntax and all **30 directly affected tests passed**. No additional production-code defect found. Full-suite, real-browser and live-AWS acceptance were not rerun. No files changed.

</details>

**My answers — both agreed:**

1. **Medium — the vendored-library test checked the wrong storage. Agreed** (GPT reproduced a
   `userPool.storage.clear()` in `cogSignUp` passing). The library's context now gets the game's own
   `localStorage`; the test saves the guest's progress first, asserts `userPool.storage` is that storage,
   and after each of the five refusals checks `mg_progress` and the whole storage unchanged. Mutations:
   `userPool.storage.clear()` and `removeItem("mg_progress")` in `cogSignUp` are now killed, as is
   TUN-87's mapping first.
2. **Low — "until a deploy recreates it". Agreed.** The README now says sign-ups fail closed until the
   table is recreated, that an ordinary deploy is not sure to do it, and where AWS's procedure is. The
   "losing it only resets today's count" comments in `template.yaml` and the template test are gone, and
   the plan's sentence above is marked wrong.

**Missing test — added:** the five vendored refusal cases against the shared, populated storage (above).
