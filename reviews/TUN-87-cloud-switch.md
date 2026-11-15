# TUN-87 — Switch cloud features off automatically when the month's budget is spent

Branch `ao/cost-cap/root` · Size **M** · touches `backend/` (template, a new function), `js/cloud.js`,
`js/boot.js`, `js/save-share.js`, tests, `backend/README.md`.

## Plan (Claude)

### What the player experiences

When the account's actual spend passes $30 in a month, within hours and with nobody acting, the cloud
"rests": progress and songs stop syncing, new accounts cannot be made, the game plays on as a guest
would. Signed-in players keep their sign-in (Cognito sign-in is not switched off) but every API call
fails. The owner gets an email saying the switch tripped and what it did. The owner switches it back on
with one command; it never switches back on by itself, a new month included.

### Verified against the docs

- **Budget actions cannot touch API Gateway or Lambda.** They apply an IAM policy or SCP, or stop EC2 /
  RDS instances (Cost Management guide, "Configuring budget actions"). So: a budget **notification** to
  an **SNS topic**, which runs a function.
- **SNS topic policy for Budgets:** principal `budgets.amazonaws.com`, `SNS:Publish`, conditions
  `aws:SourceAccount` = the account and `aws:SourceArn` like `arn:aws:budgets::<account>:*`. The topic
  must be in the same account and **unencrypted** (an encrypted topic needs a KMS key policy).
- **Reserved concurrency 0** is the documented way to "intentionally throttle" a function: "This stops
  your function from processing any events until you remove the limit." It costs nothing.
- **Disabling an HTTP API's default endpoint** (`UpdateApi DisableExecuteApiEndpoint`) needs no redeploy
  when the stage auto-deploys — SAM's `$default` stage does.
- **Not verifiable from the docs:** whether API Gateway bills requests it refuses (`401`, `429`, `503`,
  or a disabled endpoint's `403`). The pricing page says only "you pay only for the API calls you
  receive". TUN-102 measures this. The plan assumes the worst: they are billed at $1.00 per million.
- **Not verifiable without AWS:** the exact error Cognito returns to `signUp` when the pre-sign-up
  trigger is throttled (expected `UnexpectedLambdaException`, message naming `PreSignUp`). The client maps
  every trigger failure, and the rehearsal shows the real one.

### The backend

New resources in `backend/template.yaml`:

1. **`CloudSwitchAlarmTopic`** (SNS, unencrypted) with a **`CloudSwitchAlarmTopicPolicy`** allowing only
   Budgets from this account to publish (the doc's policy above). Account principals with IAM rights (the
   owner) can still publish — that is the rehearsal path.
2. **`MonthlyBudget`**: the `ACTUAL 100` notification gains a second subscriber, `SubscriptionType: SNS`,
   `Address: !Ref CloudSwitchAlarmTopic`. The other three alerts are unchanged. (This changes
   `NotificationsWithSubscribers`, so the deploy **replaces** the budget — as TUN-82 documented for an
   address change. See *Risks*.)
3. **`CloudSwitchNoticeTopic`** (SNS) with one `EMAIL` subscription to `BudgetEmail`: the switch's own
   email. AWS sends a confirmation link on deploy; the owner must click it.
4. **`CloudSwitchFn`** — `FunctionName: music-garden-cloud-switch` (fixed, so the documented commands
   need no lookup). Subscribed to `CloudSwitchAlarmTopic` (SAM `SNS` event, which adds the invoke
   permission). Environment: the three function names, the API id, the notice topic ARN, and
   `ON_CONCURRENCY: 2`. Its role, besides basic logging:
   - `lambda:PutFunctionConcurrency`, `lambda:GetFunctionConcurrency` on exactly `ProgressFn`, `SongsFn`,
     `PreSignUpFn` (their ARNs);
   - `apigateway:PATCH`, `apigateway:GET` on exactly `arn:aws:apigateway:<region>::/apis/<Api>`;
   - `sns:Publish` on exactly `CloudSwitchNoticeTopic`.
   Nothing else: no `*` resource, no IAM, no Cognito, no DynamoDB. It never touches itself.
5. **Outputs:** `CloudSwitchAlarmTopicArn` (for the rehearsal).

**What "off" does** (`backend/src/cloud-switch.mjs` wiring, logic in `backend/src/cloud-switch-api.mjs`,
no SDK, so tests need no AWS):

- `ProgressFn`, `SongsFn` → reserved concurrency **0**: no Lambda runs, no DynamoDB read or write. The API
  answers `503` (TUN-82 measured `503` for a refused invocation).
- `PreSignUpFn` → **0**: Cognito cannot run the sign-up trigger, so **every new sign-up fails**. Sign-in
  never runs that trigger, so existing players still sign in. (Sign-ups talk to Cognito directly, not
  the API — this is the lever the ticket's trap asks for, with no `UpdateUserPool`, which resets every
  setting it is not sent and so is too dangerous to call from a function.)
- The API's **default endpoint disabled**: requests get API Gateway's `403` before any route, authorizer
  or throttle — the only lever that also stops the unthrottled `401` flood TUN-82 measured on
  `GET /progress`. Whether that `403` is billed is TUN-102's to measure.
- Each step runs whether or not an earlier one failed; then one email to `CloudSwitchNoticeTopic`
  saying what tripped it (the budget, or a rehearsal message), each step's result, and the command to
  switch back on. If any step failed the handler throws after the email, so the asynchronous invoke is
  retried (twice, by Lambda); every step is idempotent.

**"on"** sets the three functions back to `ON_CONCURRENCY` (2) and re-enables the endpoint, then emails
"switched back on". **"status"** reads all four and returns them; no email.

**Who can trigger what.** An SNS record (any message on the alarm topic) means **off**, always — never
on. A direct invoke takes `{"switch":"off"|"on"|"status"}` from a payload file; anything else is refused
and changes nothing. Only the owner's IAM user and the alarm topic can invoke the function.

**Commands** (in `backend/README.md`'s runbook; run from `backend/`; payload files committed as
`backend/events/switch-on.json` and `switch-status.json`, so PowerShell's JSON quoting never matters):

- Switch on: `aws lambda invoke --function-name music-garden-cloud-switch --payload fileb://events/switch-on.json on.json`
- Status: same with `switch-status.json`.
- Rehearse the trip, through the real SNS path:
  `aws sns publish --topic-arn <CloudSwitchAlarmTopicArn> --message "rehearsal"`.

### The client — one calm message for "the cloud is resting"

The client **cannot tell a switched-off cloud from a busy one**: a `503` from a function at 0 looks like
a `503` from the concurrency cap, and a disabled endpoint's `403` carries no CORS headers, so `fetch`
throws as it does for a network error. So the game says one calm thing for every failed cloud call —
"the cloud is resting" — which is true of both. No new request, no status endpoint (that would be paid
work, or need the static site, which is out of scope).

1. **The signed-in panel, after a failed load** (`cloudSync === "unreachable"`, TUN-106). Today: "couldn't
   reach the cloud just now. Your cloud progress is safe, but what you play now stays on this device:
   reloading later loads your cloud progress in its place." New, same facts in the garden's voice:
   " — ☁️ the cloud is resting just now. Your cloud garden is safe there, and what you play now is kept on
   this device. When the cloud wakes, reloading brings your cloud garden back in its place." TUN-106's
   rules are untouched: nothing is pushed, a later successful load replaces this device's progress.
2. **The signed-in panel, after a failed save** — new. Today a player whose load succeeded keeps seeing
   "progress syncs across your devices" while every save fails (the switch trips mid-session, or the
   throttle refuses). `cloudPush` records whether its last attempt in this run failed; while it has,
   the panel says " — ☁️ the cloud is resting just now. What you play is kept on this device and goes up
   with your next save once the cloud wakes." A successful save, sign-out or a new sign-in clears it.
   The panel is re-rendered only when that flag flips. Saves keep trying as today (TUN-82: the next save
   sends the whole progress again); `cloudSync` stays `"ready"` — the cloud copy was read, so pushing
   over it is still right.
3. **Making an account while switched off.** `submitAuth("up")` today shows Cognito's raw message
   ("⚠️ PreSignUp invocation failed due to error TooManyRequestsException." or similar). A sign-up error
   whose code is `UnexpectedLambdaException`, `UserLambdaValidationException` or
   `InvalidLambdaResponseException`, or whose message names `PreSignUp`, shows instead: "🌱 The garden
   isn't taking new accounts just now. Keep playing as a guest — your garden is saved on this device —
   and try again another day." Other errors (taken username, short password) are unchanged. TUN-88 will
   give its daily cap its own message on this path; this one covers any trigger failure.
4. **A `#song=` link** (`js/boot.js`). `cloudSongGet` keeps its contract for callers that only test
   `res && res.song`, and distinguishes the two failures: `null` for **404** (not found) and `false` for
   anything else (429, 5xx, 403, a thrown `fetch`, a body that is not JSON). Only `null` keeps "⚠️ That
   song link didn't work — it may have been deleted."; `false` says "☁️ The cloud is resting just now —
   this song will open from the same link once it wakes. Try again later." The Studio stays open, as
   today. Melodies' ▶ Load keeps "⚠️ Couldn't load that song." for both.
5. **Sharing a big song** (`shareSong`): "⚠️ Couldn't reach the cloud — please try again." becomes
   "☁️ The cloud is resting just now — try sharing this song again later." Small songs share by `#s=`
   as today, with no cloud.

**Unchanged, on purpose:** the guest hint ("Playing as a guest… Make an account to sync across
devices.") — making one fails calmly, item 3; landing-screen sign-in, which still works; Melodies'
"Nothing here yet…" for a failed list, which is **TUN-107**'s (this ticket takes TUN-107's song-link half
only, because TUN-87's *Done* requires it).

### Tests (all without AWS)

- **`tests/backend-cloud-switch.test.mjs`** — `makeCloudSwitchHandler` with recording fakes:
  an SNS event → all three functions to 0, endpoint disabled, one email naming each result; SNS with any
  message, or several records → still off, never on; `{"switch":"on"}` → 2 and enabled, one email;
  `status` → reads only, no writes, no email; unknown payloads (`{}`, `{"switch":"ON"}`, a string,
  `{"switch":"on"}` *inside* an SNS message) → no writes; one failing step → the others still run, the
  email reports the failure, the handler rejects; the email failing → the switch still happened and the
  handler rejects. A second trip while off is harmless.
- **`tests/backend-template.test.mjs`** additions: the switch's role grants exactly the actions above on
  exactly those resources (no `*`); the `ACTUAL 100` notification has the SNS subscriber and the others
  have none; the topic policy allows only `budgets.amazonaws.com` with both conditions; the alarm topic
  is not encrypted; `ON_CONCURRENCY` equals `Globals.Function.ReservedConcurrentExecutions`; the notice
  subscription uses `BudgetEmail`; the payload files hold exactly `on` and `status`; no `samconfig.toml`
  address (exists).
- **`tests/cloud-sync.test.mjs`**: the unreachable sentence (TUN-106's assertion) updated; a failed push
  while ready → the panel stops saying "syncs across your devices" and says resting; a later success
  restores it; sign-out clears it; a stale push result from a replaced run does not set it.
- **Sign-up**: each of the three trigger codes and a `PreSignUp` message → the calm line; a taken
  username → Cognito's message as today.
- **Song link**: 200 → opens; 404 → "may have been deleted"; 429, 503, 403, thrown, non-JSON 200 →
  resting, never "deleted".

### Overshoot (the trip reacts late)

Cost data reaches Budgets hours after it is incurred, and Budgets evaluates a few times a day, so the trip
lags real spend by roughly **8–32 hours**. What a flood costs in that time, from TUN-83's figure ($155 a
month with every route flat out at the nominal 5 requests/second, so ≈ **$5 a day**) and TUN-82's
measurement (the throttle lets through about 5× its rate, ≈ **$25 a day**):

| Lag | Nominal throttle | Measured 5× |
|---|---|---|
| 8 h | ≈ $1.70 | ≈ $8.50 |
| 32 h | ≈ $6.80 | ≈ $34 |

So in a sustained flood the month ends at about **$32–$64**, not $30. After the trip: no Lambda, no
DynamoDB; what remains is API Gateway's per-request charge **if** refused requests are billed ($1.00 per
million: ≈ $13 a month at 5/s, ≈ $65 at 25/s, for a flood that keeps going all month after the trip), and
storage (cents). Disabling the endpoint is there to make that zero if a disabled endpoint's `403` is not
billed — TUN-102 measures it. Unrelated spend counts too: the budget is account-wide.

### Risks

1. **The deploy replaces the budget.** A new budget whose month-to-date actual spend is already over $30
   would notify on its first evaluation and **trip the switch**. Before deploying, the owner checks the
   month's spend on the Budgets page.
2. **The `ACTUAL 100` notification fires once a month.** Switching back on while the month is still over
   $30 means no automatic trip again until next month. The runbook says so.
3. **A `sam deploy` while switched off** may or may not reset concurrency or the endpoint (CloudFormation
   compares templates, not live state; whether the Lambda and ApiGatewayV2 handlers re-send unchanged
   properties is not documented). The runbook: switch on before deploying, and run `status` after any
   deploy.
4. **A long pause and TUN-106.** A signed-in player who plays for days while the cloud rests keeps that
   play on the device; when the cloud wakes, their next load replaces it with the older cloud copy —
   TUN-106's rule ("a success replaces this device's progress with the cloud copy, as every load does").
   The messages say so plainly. Changing the rule (keep the device's play after an outage) is a sync
   redesign, not this ticket: I would file it to Backlog, not build it here. **The owner may want it
   before the announcement.**
5. **The account-wide budget can trip on unrelated spend** (the Glacier archive this month), switching the
   game's cloud off with no player traffic. The email says what tripped it.
6. **The SNS email subscription needs a click** after deploy; until then the switch acts but no email
   comes. The deploy steps say so.

### Alternatives considered

- **Stage or route throttles to 0** (`UpdateStage`). Every route has its own `RouteSettings`, so all seven
  must be zeroed, and switching on must restore seven different values the function would have to keep
  in step with the template. The endpoint switch is one boolean each way and stops more.
- **`UpdateUserPool` to admin-only sign-up.** Resets every pool setting it is not sent (triggers,
  policies) — too dangerous from a function. Concurrency 0 on the trigger does the same job.
- **A flag in SSM or DynamoDB that the functions read.** The functions would still run (paid work) and
  need a read on every call; reserved concurrency stops them before they start.
- **A budget action** — cannot target these services (above).
- **A status endpoint the client asks** — paid work while paused, or the static site (out of scope).

## Design review (Astra, `ask.sh fresh read-only`, on the plan above)

<details><summary>GPT's review, verbatim</summary>

VERDICT: CHANGES REQUESTED — the shutdown mechanism is viable, but the plan does not yet establish reliable activation, truthful client behavior, or the claimed spending bound.

1. **blocker — Plan § “The backend”: the budget can become active before its shutdown path is ready.**

   `MonthlyBudget` references the alarm topic, but that does **not** order it after the topic policy, Lambda subscription, or invoke permission. Budget creation can fail permission validation; an already-exceeded replacement budget could also notify before the subscriber exists.

   Explicitly order budget activation after the complete delivery path. Inspect the **transformed SAM dependency graph**, not just the source YAML. There is no inherent cycle in the proposed references; however, tightening the topic policy with a reference back to `MonthlyBudget` would create one if the budget depends on that policy.

   The notice subscription adds another race: CloudFormation creating an email subscription does not mean the owner has confirmed it. A successful SNS publish before confirmation does not prove an email arrived. Document staged activation or an explicit post-confirmation recovery check.

   AWS references: [DependsOn attribute](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-attribute-dependson.html), [Creating an Amazon SNS topic for budget notifications](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-sns-policy.html), [SAM SNS event](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-property-function-sns.html).

2. **should-fix — Plan § “Verified against the docs” and client item 4: disabled HTTP endpoints can return 404, which the plan classifies as deletion.**

   AWS’s Knowledge Center distinguishes **403 for REST APIs from 404 for HTTP APIs**. Tune Garden uses an HTTP API. The plan’s blanket `404 → null → “may have been deleted”` therefore lacks a reliable distinction between an unavailable endpoint and a missing song. CORS may hide the response as a rejected fetch, but that must be demonstrated, not used as the correctness guarantee.

   Reserve `null` for a recognizable application not-found response, such as this backend’s `404 {"error":"not found"}`. Treat gateway-generated or malformed responses as unavailable. Also specify `200 null`, `{}`, and missing-song envelopes: blindly returning parsed JSON would violate “null only means 404.”

   Preserve successful `{id, song, ...}` results: both callers and `tests/hostile-links.test.mjs` depend on that shape. Avoid promising “this song **will** open”; an unavailable service cannot establish that the song exists.

   References: [Deactivate the API Gateway default endpoint](https://repost.aws/knowledge-center/api-gateway-disable-endpoint). The auto-deployment assumption itself is correct: [Disable the default endpoint for HTTP APIs](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-disable-default-endpoint.html).

3. **blocker — Plan client items 1–5; `js/cloud.js:71`; `js/save-share.js:239–242`: “Nobody sees an error” is not met.**

   The plan leaves these paths:

   - A failed initial upload—after signup or `GET /progress → null`—still calls `renderAuth("⚠️ cloud sync failed")`.
   - A cloud song listed before shutdown still produces “Couldn’t load that song” or “Couldn’t delete.”
   - A failed Melodies listing still claims “Nothing here yet.”
   - A song-operation failure does not affect the progress panel. After shutdown, sharing can report “resting” while Home still says “progress syncs across your devices,” until a progress save fails.

   Remove the explicit initial-upload error and define which observed failures suppress the sync claim. An availability indicator must **not** grant write permission or collapse TUN-106’s `unreachable` into `ready`.

   TUN-107 can retain ownership of list semantics, but leaving it in Backlog is an acceptance exception or release dependency—not satisfaction of this ticket’s unqualified Done bullet.

4. **should-fix — Plan client item 2: `_cloudRun` alone cannot make the new save-failure flag truthful.**

   Consider two pushes in the **same run**:

   1. Save A starts before shutdown; its successful response is delayed.
   2. Save B starts after shutdown and fails.
   3. A’s response arrives and clears the failure flag.

   The panel now advertises synchronization although the newer save failed. Conversely, an old failure can overwrite a newer success.

   Define ordering using a per-save sequence or serialize/coalesce saves. Check run identity after token acquisition and after completion, including exceptions and missing-token results. A stale success must not clear another run’s failure, just as a stale failure must not set it.

   Required tests: both same-run completion orders, stale success **and** failure across sign-out/sign-in, current-run missing token, and persistence of the message after plain `renderAuth()`.

5. **should-fix — Plan client item 2 and Risk 4: the failed-save message promises recovery that reload can destroy.**

   “What you play … goes up with your next save once the cloud wakes” omits the decisive condition: **this loaded session must remain alive until a successful save**.

   Reproduction: load successfully → switch trips → play locally → close the tab → cloud resumes → reload. `onSignedIn(false)` replaces local progress with the older cloud copy before those changes upload.

   Risk 4 acknowledges this, but incorrectly says the messages explain it plainly; only the failed-*load* message does. Explain replacement on reload in the failed-*save* message too. Keep TUN-106’s accepted replacement behavior; this finding does not demand a sync redesign.

6. **should-fix — Plan § Risks 3 and runbook: “switch on before deploying” is not a sufficient maintenance policy.**

   It requires reopening spending to deploy a repair while the budget is exhausted. Furthermore, the repository records that ordinary builds modify the functions and API even when their logical configuration seems unchanged.

   The plan correctly admits uncertainty about CloudFormation reapplying concurrency and endpoint properties. Resolve it through a controlled deployment test, then provide either a deploy procedure that preserves the paused state or an explicit guard that refuses deployment while paused. A post-deploy status check alone detects an accidental reopening after it happened.

   Budget replacement is correctly identified: changing `NotificationsWithSubscribers` requires replacement. A replacement budget above threshold may notify afresh; “once this month” belongs to the particular budget, not the entire account. Do not promise an exact immediate-notification time. [AWS::Budgets::Budget](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-budgets-budget.html), [Best practices for AWS Budgets](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-best-practices.html).

7. **should-fix — Plan § “off,” “on,” and Commands: retries, timeouts, and concurrent commands can invalidate recovery.**

   The new function inherits **10 seconds and concurrency 2**. Slow SDK calls can consume its timeout before later shutdown steps or the email execute. Catching rejected promises does not catch Lambda terminating the process.

   Define explicit operation timeouts/retry limits and enough total execution time; ensure one slow operation cannot prevent the others being attempted. Prevent overlapping on/off commands from leaving mixed settings.

   Also, off→on→duplicate-off is not harmless idempotency. Lambda can deliver duplicates even after success; its asynchronous queue can retry infrastructure failures for hours, and SNS delivery retries can last much longer. Specify how recovery handles outstanding shutdown deliveries.

   Finally, `aws lambda invoke` can report HTTP success while returning `FunctionError`. The one-command recovery must surface function failure and verify all four settings before declaring success.

   References: [Lambda asynchronous error handling](https://docs.aws.amazon.com/lambda/latest/dg/invocation-async-error-handling.html), [SNS message delivery retries](https://docs.aws.amazon.com/sns/latest/dg/sns-message-delivery-retries.html), [Lambda Invoke](https://docs.aws.amazon.com/lambda/latest/api/API_Invoke.html).

8. **should-fix — Plan § Overshoot: the numerical scenarios are reasonable; the claimed monthly outcome is not.**

   Using TUN-83’s $155.33 per 31-day month gives:

   | Assumed traffic | Additional spend over 8 hours | Over 32 hours |
   |---|---:|---:|
   | Nominal route rates | $1.67 | $6.68 |
   | Every route at 5× nominal | $8.35 | $33.40 |

   Those roughly reproduce the plan. But one ten-second GET experiment establishes neither sustained 5× throughput nor the same multiplier on expensive writes.

   As a separate **illustration**, 10/s of full-sized progress PUTs plus 10/s of song PUTs costs approximately **$1.66/hour**, using the existing review’s unit prices and 200 ms assumption: about **$53 over 32 hours**, before other costs.

   AWS documents typical budget updates every 8–12 hours, not an end-to-end 32-hour maximum. Replace “the month ends at $32–$64” with explicitly conditional scenarios. [Managing your costs with AWS Budgets](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-managing-costs.html).

   Post-trip gateway traffic is also **not capped at 5/s or 25/s by Lambda concurrency**. If rejected calls are billed, use offered traffic in that calculation. Include continuing Cognito MAUs from sign-in/refresh, accumulated storage/PITR, unrelated account spend, and in-flight work finishing after shutdown. Cognito identity activity can remain billable while the API rests. [Amazon Cognito pricing](https://aws.amazon.com/cognito/pricing/).

9. **should-fix — Plan § permissions and “Who can trigger what”: resource scope is good, but the least-privilege claims are overstated.**

   `apigateway:PATCH` and `GET` on `arn:aws:apigateway:<region>::/apis/<id>` are correct; the empty account field is intentional. However, PATCH authorizes API updates beyond this boolean. AWS exposes `apigateway:Request/DisableExecuteApiEndpoint`; consider applicable conditions, while acknowledging they do not provide complete field-level isolation. [API Gateway Management V2 authorization reference](https://docs.aws.amazon.com/service-authorization/latest/reference/list_apigatewayv2.html).

   “Only the owner’s IAM user and the topic can invoke” is not established by the proposed template. Other same-account identities with sufficient identity-based permissions can invoke too. Audit or qualify that claim. [Managing permissions in AWS Lambda](https://docs.aws.amazon.com/lambda/latest/dg/lambda-permissions.html).

   The Budgets policy’s account-wide source ARN is AWS’s documented pattern and avoids a budget-policy dependency cycle; describe that tradeoff. Test the generated SNS invoke permission’s exact source topic, absence of public invocation paths, and exclusion of the switch itself from target resources.

   Publishing identifiers is not publishing credentials. The public-repository concerns are committed credentials/email addresses and overly broad permissions—not the discoverability of the function name.

10. **should-fix — Plan § Alternatives: the simpler owner-side recovery command was not considered.**

    An **off-only Lambda plus one committed PowerShell recovery script** still meets “one documented command.” It removes the Lambda’s `on`/`status` dispatch paths and read permissions needed solely for status; endpoint PATCH could be restricted to disabling. The script can perform read-back and return a failing exit code. It would not eliminate every concurrency-permission risk or delayed-off race, but it deserves comparison.

    Other rejected alternatives are mostly rejected sensibly:

    - Native budget actions do not directly update these settings. IAM/SCP actions exist, but are not equivalent to stopping Lambda invocation and public Cognito signup. [Configuring budget actions](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-controls.html).
    - `UpdateUserPool` really can reset omitted settings. A careful read-modify-write is possible, but is broader and more fragile than throttling this trigger. [UpdateUserPool](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_UpdateUserPool.html).
    - A flag read by every request retains paid work. A flag used **only by switch/deploy operations**, however, is a different alternative and could preserve shutdown intent without per-request reads.

11. **should-fix — Plan § Tests and deployment acceptance: several essential proofs are missing.**

    Add the following to the plan:

    - **Template:** dependency ordering, transformed subscription/invoke permission, effective switch timeout/concurrency, SDK environment wiring, and mutation cases for incorrect resource ARNs or quoted literal references.
    - **Handler:** direct `off`; malformed/wrong-topic SNS envelopes; partial failures during both directions; hung operations; overlapping commands; delayed duplicate-off after recovery; and failed status reads. Fix the contradictory test specification: an SNS message containing `{"switch":"on"}` must cause **off writes**, not “no writes.”
    - **Client:** findings 2–5; first-upload failures; production entry through landing sign-in and session resume; signup failure must not proceed to sign-in/upload; preserve hostile-link guards and successful stubs.
    - **Live rehearsal:** actual Cognito SDK error shape, signup refusal, existing-user sign-in and token refresh, both production origins, known cloud links, local saves/Studio/levels/`#s=`, then recovery verified with newly advanced progress in a fresh session.

    PreSignUp is appropriate for blocking this pool’s new accounts; existing local-user authentication and refresh do not invoke it. The exact throttling error remains a rehearsal requirement, not something synthetic tests establish. Keep the mapping confined to signup and allow TUN-88’s future specific message to take precedence. [Pre sign-up Lambda trigger](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-lambda-pre-sign-up.html), [SignUp errors](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_SignUp.html).

    Publishing “rehearsal” directly to SNS tests **SNS onward**, not Budgets’ permission to publish. Separately verify the deployed budget subscriber and policy.

12. **should-fix — Plan overall: acceptance must distinguish planned coverage from unmet requirements.**

    | Done bullet | Assessment of this plan |
    |---|---|
    | Automatic shutdown and refused signup | Mechanism supported; activation ordering and failure handling incomplete. Reserved concurrency zero is documented and has no reservation charge. [AWS concurrency guidance](https://docs.aws.amazon.com/lambda/latest/dg/configuration-concurrency.html) |
    | Guest play, calm messages, no deletion claim | **Not met as written**: findings 2–5. |
    | Owner receives trip email | Planned, but confirmation/activation ordering and failure delivery remain gaps. |
    | One-command manual recovery; no automatic reopening | Command provided; result checking and deployment behavior incomplete. |
    | Hand-triggered rehearsal | Covered through SNS, subject to recovery races. |
    | Tests without AWS | Appropriate injected-handler approach; missing cases above. |
    | Short README runbook | Planned, but needs the corrected limitations and operational rules. |
    | Owner deploys, rehearses, sees email/guest play, restores | Must remain explicitly pending until performed. |

**QUESTIONS FOR THE OWNER**

1. May TUN-87 ship with TUN-107’s misleading Melodies state and remaining load/delete errors, or should TUN-107 block acceptance? Keeping it separate does not resolve the Done-bullet conflict.
2. Does “off” mean stopping application Lambda/DynamoDB requests and new accounts while accepting possible gateway charges, continuing Cognito activity, and retained storage/PITR? The plan cannot promise that all cloud spending stops.

No files changed. This was a source-and-documentation review; AWS behavior was not exercised.

</details>

### My answers

1. **Agree (blocker).** No SAM `SNS` event: the subscription (`CloudSwitchAlarmSubscription`) and the
   invoke permission (`CloudSwitchAlarmPermission`, `SourceArn` = the alarm topic) are explicit resources
   with names I control, and `MonthlyBudget` has `DependsOn` on them and on the topic policy — so the
   budget is created (or replaced) only once the whole path to the function exists. The topic policy keeps
   AWS's documented account-wide `aws:SourceArn` (`arn:aws:budgets::<account>:*`): naming the budget would
   make the policy depend on the budget and the budget on the policy. The email confirmation is a deploy
   step, followed by a rehearsal that proves the email arrives.
2. **Agree.** A disabled HTTP API endpoint answers `404`. `cloudSongGet` returns `null` only for a `404`
   whose body is `{"error":"not found"}` (what `songs-api.mjs` sends), the response on success only when it
   is an object with an object `song`, and `false` for everything else (`200 null`, `{}`, a gateway 404, 429,
   5xx, thrown, not JSON). The resting line no longer promises the song will open.
3. **Agree (blocker), all four.** (a) The first upload's "⚠️ cloud sync failed" goes: a failed first push
   marks the cloud as resting like any failed save. (b) Melodies' ▶ Load and 🗑 on a failure: "☁️ The cloud
   is resting just now — try again later." (▶ Load on a real not-found keeps "⚠️ Couldn't load that song.").
   (c) **The Melodies list: I take the rest of TUN-107 into this ticket** — `cloudSongList` returns `null` on a
   failure, and Melodies says "☁️ The cloud is resting just now — your cloud songs are safe; try again in a
   moment." while a 200 with no songs keeps "Nothing here yet…". TUN-87's *Done* requires it, and TUN-107's
   own *Done* is met by the same change; I note it on TUN-107 rather than leave an exception. **The owner may
   overrule** (see the hand-off). (d) One availability indicator for the run, `cloudResting`, set by any
   failed cloud call (progress or songs) and cleared by any successful one; the panel says "resting" instead
   of "syncs across your devices" while it is set. It never touches `cloudSync`, so it grants no write and
   never turns `"unreachable"` into `"ready"`.
4. **Agree.** Every cloud call takes a sequence number when it starts; a result updates `cloudResting` only
   if it belongs to the current run and is newer than the last result applied. A missing token counts as a
   failure (no sync is happening). Tests: both completion orders in one run, a stale success and a stale
   failure across sign-out/sign-in, a missing token, and the message surviving a plain `renderAuth()`.
5. **Agree.** The failed-save line now says reloading after the cloud wakes brings the cloud copy back:
   " — ☁️ the cloud is resting just now. What you play is kept on this device and goes up with your next save
   after it wakes, while this page stays open. Opening the game again after it wakes brings your cloud
   garden back in its place." TUN-106's rule is unchanged; Risk 4 corrected.
6. **Partly agree.** "Once a month" is per budget — wording fixed. **Disagree** that a deploy guard or a
   controlled deploy test is needed in this ticket: the procedure is "if `status` says off, run the `off`
   command again right after the deploy". A deploy that briefly reopens the functions costs what a few
   minutes of traffic costs (cents at the measured rates), and `off` re-applies all four settings
   idempotently. TUN-102's production rehearsal can record whether a deploy resets them; the runbook says
   it is unknown.
7. **Agree.** The switch gets `Timeout: 60` and `ReservedConcurrentExecutions: 1` (overlapping commands
   queue or are refused, never interleave). SDK clients get `maxAttempts: 3` and a 5-second request timeout;
   the four steps run together (`Promise.allSettled`), so a hung one cannot block the others or the email.
   Asynchronous invokes: `MaximumEventAgeInSeconds: 3600`. **A delayed duplicate "off"**: an SNS record
   published more than an hour before it is handled is ignored, with an email saying so — so an old
   delivery cannot re-trip a cloud the owner switched back on. Every command reads all four settings back
   after acting and returns them; if any is not what was asked, it throws, so the CLI prints
   `"FunctionError"`. The runbook says to look for that line.
8. **Agree.** The overshoot section is rewritten as conditional scenarios with GPT's figures and the costs
   the switch cannot stop (gateway requests if billed, Cognito sign-ins, storage and backups, unrelated
   spend, in-flight work).
9. **Agree on the qualifications**: same-account principals with `lambda:InvokeFunction` can invoke the
   switch (they could also change the settings directly — `on` grants nobody anything new); the
   account-wide source ARN is AWS's documented pattern and avoids the cycle; tests pin the permission's
   source topic, no public principal, and the switch absent from its own targets. **Disagree** on the
   `apigateway:Request/DisableExecuteApiEndpoint` condition: it would not isolate the field (a request that
   sets it can set others), the function's code sends only that field, and a condition I cannot test
   without AWS risks the endpoint step failing at the one moment it matters.
10. **Disagree.** Keeping `on` and `status` in the function means one place knows the targets (its
    environment), the same code is tested without AWS in both directions, and the owner's command is the
    same on any shell. An owner-side script would duplicate the targets and be untested here. The read-back
    from finding 7 gives the command a visible failure.
11. **Agree**, except as noted: the template, handler and client tests are added (the contradictory case
    fixed: an SNS message reading `{"switch":"on"}` switches **off**). The live checks go to the owner's
    rehearsal steps. Budgets' permission to publish is checked by the deploy itself: Budgets refuses to
    save a subscriber topic it cannot publish to ("Invalid SNS topic").
12. Noted; the hand-off reports each *Done* bullet against what was verified.

**Owner questions GPT raised.** (1) TUN-107: I decided to take it in (answer 3c) — the owner can split it
back out. (2) What "off" stops: the switch stops every Lambda run, every database read and write, and new
accounts; it cannot stop API Gateway's per-request charge (if refused requests are billed), Cognito sign-ins
of existing players, or storage — nothing short of deleting the stack can. I report this in the hand-off
rather than stop: the ticket's decision is that the throttle is the real cap and this is the backstop.

## Design checkpoint

No `needs-owner` label, no open question only the owner can answer, nothing larger than L: **build**,
with the amendments above.

## Built (Claude)

As planned, with the answers above. Where the build departs from the plan or adds to it:

- **No SAM `SNS` event.** `CloudSwitchAlarmSubscription` and `CloudSwitchAlarmPermission` are explicit,
  so `MonthlyBudget` can `DependsOn` them by name (answer 1).
- **The switch's own settings:** `Timeout: 60`, `ReservedConcurrentExecutions: 1`,
  `EventInvokeConfig` (event age 3600 s, 2 retries); each step capped at 15 s in the handler, so writes,
  read-back and email take 45 s at most; SDK clients 3 attempts, 5 s request timeout (answer 7).
- **Every command reads back** all four settings and throws when one is not what was asked; the email
  says "NOT COMPLETE" and gives the command to retry. A failed email also throws (an SNS trip is then
  retried; the settings are idempotent).
- **`cloudSongCreate`** counts only a reply with an `id` as the cloud answering, and **`cloudSongDelete`**
  treats the API's own 404 as already gone (Melodies reloads its list) instead of a failure.
- **`cloudSongList`** returns `null` on any failure, and Melodies says the cloud is resting — TUN-107's
  other half (answer 3c).
- **A sign-up refusal** is matched on Cognito's `code` or `name`, or a message naming `PreSignUp`, and is
  for sign-up only; sign-in errors are unchanged.

### The overshoot (rewritten after the design review)

Scenarios, not bounds. Budgets updates "typically every 8–12 hours" (AWS); spend reaches it later still,
so read the lag as **8 to ~32 hours** between the $30 crossing and the trip.

| Assumed traffic before the trip | per hour | 8 h | 32 h |
|---|---:|---:|---:|
| Every route flat out at the nominal 5/s (TUN-83's $155.33 a month) | $0.21 | $1.67 | $6.68 |
| Every route at 5× nominal (TUN-82's measured looseness, if it held for every route) | $1.04 | $8.35 | $33.40 |
| 10/s full-size `PUT /progress` + 10/s full-size `PUT /songs/{id}` (GPT's illustration) | $1.66 | $13.30 | $53 |

So a sustained flood could end the month at roughly **$32 to $83**, not $30. After the trip, no Lambda
runs and DynamoDB is not touched. What goes on costing: API Gateway's $1.00 per million for calls it
refuses, **if** refused calls are billed (unknown — TUN-102 measures it), at whatever rate they are
offered, since nothing in the account caps offered traffic; existing players' Cognito sign-ins and
refreshes; stored songs, progress and point-in-time backups (cents); and anything else in the account.

### Tests

- `tests/backend-cloud-switch.test.mjs` (13): off from any alarm-topic message (a `{"switch":"on"}`
  message included), the owner's on/off/status, refusals, other topics and malformed records, stale and
  future timestamps, failing and hanging steps both ways, the read-back, a failed email, a misconfigured
  environment.
- `tests/backend-template.test.mjs`: the switch's whole path and role as exact JSON, the budget's
  subscribers and `DependsOn`, no non-AWS invoke principal, and 23 new mutation cases, each refused with
  its own diagnostic; the payload files and the stale window match the wiring.
- `tests/cloud-sync.test.mjs` (9 new; TUN-106's unreachable sentence updated to the new wording): a failed
  save stops the sync claim and a good one restores it (503, 429, thrown, a gateway 404), a plain
  `renderAuth()` keeps it, sign-up's failed first save is calm, both completion orders in one run, stale
  results across sign-out/sign-in both ways, a result arriving while the next player's load is out, a
  missing session, song calls moving the line, a failed load untouched by a working song call, and the
  song calls' return values.
- `tests/cloud-resting.test.mjs` (6): the `#song=` link at boot for 11 failure answers and the API's own
  404, Melodies' list, ▶ Load and 🗑, sharing a big song, and the sign-up mapping (4 refusal shapes, a taken
  username, sign-in unchanged).

**Mutation check** (each restored after): no sequence ordering (1 fail), no run check (1, once the
in-flight test was added — it survived before), the panel ignoring `cloudResting` (5), any 404 counted
as gone (2), no sign-up mapping (1), a failed list read as empty (1), a missing session not counted as
failing (1), the first-save warning back (1), a create without `id` counted as answering (1, once its
test was added — it survived before), a gone song's delete failing (1); in the switch: no stale check
(2), any topic (1), `Promise.all` for the steps (8), no read-back (1), failures not thrown (4), a loose
payload (1), no step timeout (2), a message able to switch on (1).

**Browser** (AO's preview of this worktree; `js/cloud.js`, `js/boot.js` and `js/save-share.js` served
byte-identical): `index.html#song=abc` — the preview's origin is refused by the API's CORS, so the
`fetch` throws exactly as it would against a disabled endpoint — opens the Studio and toasts "☁️ The
cloud is resting just now, so this song can't open yet. Try the link again later." No page error but
the expected CORS refusal.

**Not verified** (needs AWS or a signed-in player; the owner's rehearsal): the template deploying
(`sam validate --lint` included); Budgets accepting the topic; the trip and the email; reserved
concurrency 0 refusing calls with 503; the disabled endpoint taking effect without a redeploy and what it
answers; the exact error Cognito's SDK gives a throttled sign-up trigger; existing players' sign-in while
off; whether a `sam deploy` resets the switch; every signed-in panel state in a real browser.

## PR review — round 1 (Astra, through `ask.sh`, on `35225de`)

<details><summary>GPT's review, verbatim</summary>

VERDICT: CHANGES REQUESTED

**FINDINGS**

1. **blocker — [backend/src/cloud-switch-api.mjs:24](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-33/backend/src/cloud-switch-api.mjs:24): elapsed age does not establish whether a trip was superseded.**  
   Reproduced: trip at 12:00 → owner switches on at 12:06 → duplicate arrives at 12:07 → cloud switches off again. The runbook’s five-minute wait does not prevent this; Lambda documents duplicate delivery even after successful execution. Conversely, a first delivery older than one hour is acknowledged without shutting anything down, even when the owner never restored service. A failed notification on that path is swallowed too. SNS can legitimately retry delivery beyond an hour.  
   Distinguish superseded trips using durable recovery state, rather than publication age alone. Update the recovery instructions accordingly. [Lambda retry behavior](https://docs.aws.amazon.com/lambda/latest/dg/invocation-async-error-handling.html), [SNS delivery retries](https://docs.aws.amazon.com/sns/latest/dg/sns-message-delivery-retries.html).

2. **blocker — [backend/src/cloud-switch-api.mjs:41](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-33/backend/src/cloud-switch-api.mjs:41), [backend/src/cloud-switch.mjs:9](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-33/backend/src/cloud-switch.mjs:9): timing out does not cancel the AWS operation.**  
   `Promise.race` abandons the wait while the SDK operation and retries remain alive. Reproduced with sequential handler calls: an ON write times out → OFF completes and reports `cloud:"off"` → the old ON write completes → state becomes mixed. Reserved concurrency 1 does not serialize work abandoned by an earlier invocation.  
   Pass cancellation through to SDK calls, terminate outstanding retries, and settle operations before the final read-back and return. Also, current SDK documentation specifies that `requestTimeout` only warns unless `throwOnRequestTimeout:true`; the claimed five-second enforcement is not assured by these options. [AWS SDK timeout configuration](https://github.com/aws/aws-sdk-js-v3/blob/main/UPGRADING.md).

3. **should-fix — [backend/README.md:285](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-33/backend/README.md:285): disagreement 6 still lacks a reliable maintenance procedure.**  
   Checking after deployment cannot preserve the paused state during deployment or rollback. “A few minutes, costing cents” is an assumption, not an established limit. The ordinary deployment instructions also omit this check. Require a procedure that preserves OFF, or a pre-deployment guard that refuses deployment while OFF. The controlled deployment check remains pending; the current instructions do not close the original finding.

4. **should-fix — [js/cloud.js:22](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-33/js/cloud.js:22): a background availability result can erase an open authentication form.**  
   `cloudOn` can remain true after the stored session disappears, such as sign-out in another tab. `renderAuth()` then offers the guest sign-in form. A pending cloud failure subsequently flips `cloudResting` and calls `renderAuth()` again, destroying the form, entered credentials, and its status element. Reproduced using the existing recording fixture. Preserve an active form; update the signed-in status separately or verify that the panel still represents the signed-in session.

5. **should-fix — [js/cloud.js:108](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-33/js/cloud.js:108): first-upload status bypasses the new sequence protection.**  
   Reproduced: signup’s initial PUT remains pending → a newer save fails → the initial PUT succeeds. `cloudCall` correctly retains the resting state, but `onSignedIn` appends **“saved to cloud”** anyway. The resulting panel simultaneously describes unsaved local progress and announces success. Apply the same ordering rule to this completion message, or remove the transient success message.

6. **should-fix — [tests/backend-template.test.mjs:159](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-33/tests/backend-template.test.mjs:159): the template guard misses material violations of its advertised guarantees.**  
   Each independent in-memory mutation returned **zero problems**:
   - `MaximumRetryAttempts: 2` → `0`.
   - Add an explicit unrestricted `Role`, bypassing the checked generated-role policies.
   - Add `FunctionUrlConfig: { AuthType: NONE }`, creating a public invocation path after SAM transformation.

   Check effective role selection, function URLs, and retry configuration—not only the existing policy and permission objects.

7. **nit — [backend/src/cloud-switch-api.mjs:110](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-33/backend/src/cloud-switch-api.mjs:110): every recovery email incorrectly says the budget cannot trip again this month.**  
   Switching on after a rehearsal below $30 does not consume the actual-spend notification. Make this warning conditional on the actual alert having fired for the current budget period. The existing test currently requires the incorrect unconditional sentence.

The other agreed changes are substantially implemented: design findings **1–3 and 5** are addressed in the normal paths; **4 and 7** retain the gaps above; **8** has conditional spending scenarios and residual costs; **11–12** still require the tests and live acceptance below. TUN-106’s write gates and run checks remain intact. Both `cloudSongGet` callers respect `null` versus `false`; list failure remains distinct from empty, DELETE recognizes the application’s own 404, and trigger-error mapping is confined to signup.

Disagreements **9 and 10 hold up**: the proposed IAM condition would not isolate PATCH to one field, and retaining tested ON/status handling in the function is reasonable. Those choices do not resolve the timeout or recovery-ordering defects.

**MISSING TESTS**

1. **Recovery ordering:** deliver an SNS trip, switch ON six minutes later, then redeliver that same message at minute seven. Assert recovery remains effective. A genuinely new post-recovery alarm must still switch OFF.

2. **Delayed legitimate trip:** deliver the first alarm after an hour without any intervening recovery. Assert it is not silently treated as superseded. Also exercise a partial shutdown whose retry crosses the age boundary.

3. **Late write completion:** hold an ON write beyond its deadline, complete a subsequent OFF command, then release the old operation. Assert the old operation cannot change the verified OFF state. Repeat with the API endpoint and pre-signup concurrency.

4. **SDK cancellation wiring:** exercise the real adapter with recording SDK substitutes; assert deadlines abort outstanding calls/retries, timeout options enforce failure, and final read-back follows settlement.

5. **Authentication-form preservation:** remove the stored session while `cloudOn` remains true, open and populate the sign-in form, then finish a pending cloud call. Assert the form, values, and in-progress status survive.

6. **First-upload ordering:** defer signup’s initial PUT, fail a newer save, then succeed the initial PUT. Assert the panel retains resting information without “saved to cloud.”

7. **Template retry mutation:** set `MaximumRetryAttempts` to zero; require a specific failure.

8. **Template role mutation:** add an explicit `Role` that bypasses the checked policies; require a specific failure.

9. **Template public-entry mutation:** add an unauthenticated function URL; require a specific failure.

10. **Production entry paths:** exercise landing sign-in and boot session-resume through a failed progress load. Assert local progress survives, no PUT occurs, and the persistent panel reports resting.

11. **Owner rehearsal, still pending:** explicitly verify both production origins, refused signup, existing-user sign-in and refresh, levels/Studio/local saves/`#s=`, a known `#song=` link, and recovery with newly advanced progress surviving a fresh session. Add the controlled deploy-while-OFF check.

Verification: syntax and **84 targeted tests passed**. SAM lint passed; an in-memory SAM transform produced an acyclic dependency graph and the expected subscription, permission, role, `$LATEST` invocation configuration, and auto-deploy stage. No SDK command-shape defect found beyond timeout handling. Full suite: **756 passed, 75 failed**, all failures being sandbox `mkdtemp` permission errors. AWS and real-browser acceptance were not performed. No files changed.

</details>

### My answers

1. **Agree (blocker).** Age could not tell a redelivered trip from a late real one. The switch now records
   the owner's switch-on time in an SSM parameter (`CloudSwitchState`, `/music-garden/cloud-switch/on-at`,
   free; role: `ssm:GetParameter`/`PutParameter` on that one parameter). A trip **published** before it is
   ignored and emailed about (a failed notice throws, so it is retried); one published after it — however
   late — switches off; one whose switch-on time cannot be read switches off, saying so. The one-hour rule
   is gone and the event age is Lambda's longest, 6 hours. Tests: missing tests 1 and 2 as written, plus the
   unreadable/hanging state, a record with no timestamp, and a failed notice.
2. **Agree (blocker).** Each step now gets an `AbortSignal` that fires at its deadline, and every SDK call
   carries it (`send(cmd, { abortSignal })`), which stops the request and its retries; `throwOnRequestTimeout`
   makes a stalled request fail. The AWS calls moved into `sdkAdapter` in `cloud-switch-api.mjs`, so the
   real adapter is tested with recording clients (missing test 4), and through it a hung `UpdateApi` is
   aborted (missing test 3, via the fake account for each lever). A request already received by AWS when
   it is aborted can still apply — the read-back reports what is true either way.
3. **Partly agree.** The ordinary deploy steps were missing the check — fixed: [Future deploys] now starts
   with **status**, and "Deploying while it is off" says **don't**, and what to do when a fix to the switch
   itself can't wait. **Still disagree** that this ticket needs an automated guard: the deploy is the owner's
   own hand-run command, two lines below the check, and a wrapper script would be one more untested thing to
   keep in step. Whether a deploy resets the settings is for TUN-102's production rehearsal to measure.
4. **Agree.** The panel is redrawn only while it shows the signed-in row (`_authShowsSignedIn`, set by
   `renderAuth`, cleared by it and by `showAuthForm`). Missing test 5 added.
5. **Agree.** "saved to cloud" only when nothing newer has failed. Missing test 6 added.
6. **Agree.** `EventInvokeConfig` must be exactly 6 hours and 2 retries; `CloudSwitchFn` may set only its
   known properties (so no `Role`, `Events` or `FunctionUrlConfig`); no function anywhere may have a function
   URL or an explicit `Role`, nor may `Globals`. Missing tests 7–9 added as mutation cases, plus the SSM
   parameter's name and the role's parameter ARN.
7. **Agree (nit).** The email and runbook now say the budget won't trip again "if this month's $30 alert has
   already fired"; a rehearsal does not use it up.

Missing test 10 added: a stored session resumed at page load, and a landing-screen sign-in, against a
resting cloud — this device's progress stays, only the `GET` goes out, the panel says resting, no ⚠️.
Missing test 11 is the owner's rehearsal (the hand-off lists it).

**Mutation check of the round's fixes** (each restored): a redraw while `cloudOn` (1 fail), "saved to
cloud" after a newer failure (1), no superseded check (2), switch-on recording no time (3), a deadline that
doesn't abort (2), the adapter dropping the signal (2), an unreadable switch-on time ignoring the trip (1),
a failed switch-on-time write not reported (1), `PutParameter` without `Overwrite` (1).
