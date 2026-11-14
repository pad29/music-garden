# TUN-82 — Throttle the API, email the owner at the $30 budget, and protect player data from a bad deploy

Branch `ao/tun-82/root` · Size **S** (label and section agree) · Lane: backend, phase 1 (TUN-77).

## Plan (Claude)

Template and docs only, as the ticket says. Every property below is documented as **Update requires: No
interruption**, so the expected change set replaces **nothing** — the owner confirms that before executing.

1. **Throttle** (`backend/template.yaml`). HTTP API throttling is per route and shared by all clients (no
   per-client limits on HTTP APIs), so the API's ceiling is the **sum** of the route limits. Each `HttpApi`
   event gets `RouteSettings: {ThrottlingRateLimit, ThrottlingBurstLimit}` — SAM's own example puts them
   there; routes defined by SAM events live in the API's OpenAPI body, so they exist before the stage
   (the "Unable to find Route by key" ordering bug, SAM issue #2479, is for separate `Route` resources).
   `Api` gets `DefaultRouteSettings` at the lowest rate, so a route added later is throttled by default.
   The split is **Question 1** below. A throttled call gets `429 Too Many Requests`.
2. **Reserved concurrency.** Parameter `ReservedConcurrency` (Number, default per Question 3; `0` = none),
   applied to all three functions through `Globals` with `!If [.., !Ref AWS::NoValue]` — never a literal
   0, which would switch a function off. Lambda keeps 100 units unreserved, so an account below
   100 + 3 × N cannot reserve and the API throttle alone limits.
3. **Budget.** `AWS::Budgets::Budget`, `COST`, `MONTHLY`, 30 USD, **no cost filters: it covers the whole
   AWS account**. Email subscribers on ACTUAL > 50 %, 80 %, 100 % and FORECASTED > 100 %. Address from a
   new `BudgetEmail` parameter (`NoEcho`, a loose email `AllowedPattern`, no default). The first deploy
   passes it with `--parameter-overrides`; later `sam deploy`s reuse the stored value (SAM sends
   `UsePreviousValue` for parameters it isn't given). Never `sam deploy --guided` again: it would write
   the address into `samconfig.toml`. Budgets with email notifications are free.
4. **Data protection.** Both tables: `DeletionProtectionEnabled: true`,
   `PointInTimeRecoverySpecification: {PointInTimeRecoveryEnabled: true}`, `DeletionPolicy: Retain`,
   `UpdateReplacePolicy: Retain`. User pool: `DeletionProtection: ACTIVE`, the same two policies.
   Consequence for the docs: `sam delete` now leaves the tables and the pool behind.
5. **Docs.** `backend/README.md`: a *Limits and budget* section (the split, the parameters, how to
   change them, what a 429 does to the game); first deploy with the email; teardown note; "Node 20
   runtime" → nodejs24.x; drop the "$1–5 budget alert" suggestion. `README.md` § Backend: drop the
   budget TODO, one line on the throttle and budget.
6. **Tests.** The backend has none and this ticket adds no code; the suite runs unchanged. The template is
   checked by parsing it and, where available, `sam validate --lint`. The deploy is the owner's.

## The arithmetic

**Prices (us-east-1), from AWS's pages on 2026-11-13.** The pricing tables did not render, so these are
quoted from each page's worked examples:

- API Gateway HTTP API — "300 million * $1.00/million" (first 300M); metered per 512 KB ("4.5 MB/512
  KB/request"); "pay only for the API calls you receive and the amount of data transferred out", "at the
  EC2 data transfer rate" — the page's examples use **$0.09/GB**. aws.amazon.com/api-gateway/pricing
- Lambda — "$0.0000166667 per GB-s", "$0.20 per one million requests". aws.amazon.com/lambda/pricing
- DynamoDB on-demand — "$0.6250 per million writes", "$0.125 per million reads"; "1 WRU per 1 KB or part
  thereof"; reads 1 RRU per 4 KB, eventually consistent half; storage "$0.25 per GB" after 25 GB; PITR
  "($0.20 x 29 GB)" → $0.20/GB-month; an index write is billed separately. aws.amazon.com/dynamodb/pricing/on-demand
- Data out — "100 GB of free data transfer out to the internet free each month", across all services.
- AWS Budgets — "You can monitor and receive notifications on your budgets free of charge."

**Method.** Worst case = every route saturated at its limit for a 31-day month (2,678,400 s); free tiers
ignored; Lambda billed 200 ms at 128 MB. Per request: API $1.00/M + Lambda $0.617/M (a **floor of
$1.62/M** before any DynamoDB), plus DynamoDB units for the item size and $0.09/GB for the response.
`POST /songs` also counts the owner's songs on the `byOwner` index (projection ALL, up to a 1 MB page)
and writes the item twice (table + index); `PUT /songs/{id}` writes it three times (the index's range
key `updated` changes: delete + put). A real `DELETE` needs a prior create, so it is bounded by creates.

**Finding: the throttle cannot hold $30 on its own, at any split that leaves sync usable, until TUN-83
caps payload sizes.** `PUT /progress` stores any body up to DynamoDB's 400 KB item limit — 400 write
units, $251.62 per million calls.

| Split | Today's code (progress 400 KB, song 100 KB) | After TUN-83 (progress 8 KB, song 16 KB, 50 songs/owner) |
|---|---|---|
| **A — ~5 req/s** (ticket's figure) | $1,737/month (≈ $2.34/hour) | **$106.65/month** (≈ $0.14/hour) |
| **B — ~1.5 req/s** | $445/month (≈ $0.60/hour) | **$26.19/month** (≈ $0.035/hour) |

Plus song storage, which grows and persists: A after TUN-83 up to 21.4 GB/month (+$9.64/month,
cumulative); B up to 4.3 GB/month (+$1.93).

<details><summary>Per-route breakdown after TUN-83 (progress 8 KB, song 16 KB)</summary>

Split A (~5 req/s):

| Route | Limit | Requests/month | $ per million | $/month |
|---|---|---|---|---|
| `PUT /progress` | 2/s | 5.36M | $6.62 | $35.44 |
| `GET /progress` | 1/s | 2.68M | $2.46 | $6.59 |
| `GET /songs/{id}` | 1/s | 2.68M | $3.31 | $8.86 |
| `POST /songs` | 0.25/s | 0.67M | $34.12 | $22.84 |
| `GET /songs` | 0.25/s | 0.67M | $14.79 | $9.90 |
| `PUT /songs/{id}` | 0.25/s | 0.67M | $31.87 | $21.34 |
| `DELETE /songs/{id}` | 0.25/s | 0.67M | $2.49 | $1.67 |
| **Total** | 5/s | 13.39M | | **$106.65** |

Split B (~1.5 req/s):

| Route | Limit | Requests/month | $ per million | $/month |
|---|---|---|---|---|
| `PUT /progress` | 0.5/s | 1.34M | $6.62 | $8.86 |
| `GET /progress` | 0.4/s | 1.07M | $2.46 | $2.64 |
| `GET /songs/{id}` | 0.4/s | 1.07M | $3.31 | $3.54 |
| `POST /songs` | 0.05/s | 0.13M | $34.12 | $4.57 |
| `GET /songs` | 0.05/s | 0.13M | $14.79 | $1.98 |
| `PUT /songs/{id}` | 0.05/s | 0.13M | $31.87 | $4.27 |
| `DELETE /songs/{id}` | 0.05/s | 0.13M | $2.49 | $0.33 |
| **Total** | 1.5/s | 4.02M | | **$26.19** |

The 8 KB / 16 KB caps are placeholders: TUN-83 measures a played-through progress object and real cloud
songs. Each 1 KB of progress cap adds $0.625 per million `PUT /progress`.

</details>

**What the throttle cannot bound** (residual risks, for TUN-102's rehearsal against production):

- AWS does not say whether HTTP APIs bill requests they throttle (429), reject at the JWT authorizer (401)
  or route nowhere (404), nor CORS preflights, which API Gateway answers itself on no route of ours. If
  billed, junk traffic is capped only by the account-level limit, at $1.00 per million.
- Sign-ups go to Cognito directly, not through this API (TUN-88).
- Lambda duration: if calls ran to the 10 s timeout, reserved concurrency N caps each function at
  N × 0.125 GB × 2.68M s per month ($5.58 per unit of N).

## The client under a 429 (checked)

- `cloudPush` is fire-and-forget behind `scheduleCloud`'s 900 ms trailing debounce: no retry, no loop, no
  message. A throttled push is lost until the next change pushes the whole object again. Calm.
- `shareSong`: toast "⚠️ Couldn't reach the cloud — please try again." Melodies ▶ Load: "⚠️ Couldn't load
  that song." A friend's `#song=` link: "⚠️ That song link didn't work — it may have been deleted." —
  calm, though the last one misreads a 429 as a deletion.
- **Not calm — a data-loss path.** `onSignedIn(false)` treats a failed `cloudPull` (429 included) as "no
  cloud progress" and calls `cloudPush`, which **overwrites the cloud copy with this device's local
  progress**. Signing in on a new device while `GET /progress` is throttled replaces that player's cloud
  progress with a near-empty guest one. Pre-existing for any network failure; the throttle makes it
  likelier under load, and TUN-87's switch-off would make every pull fail. Client code, so out of this ticket's scope: filed as **TUN-106** (Backlog; Question 2).

## Owner's decisions

1. *The throttle level* — **A, about 5 req/s** (split A above): the owner, in AO session
   `music-garden-23`, 2026-11-13. The throttle bounds how fast spend can grow; the budget emails and
   TUN-87's switch-off bound the month.
2. *TUN-106 into phase 1?* — **yes**, before TUN-87: the owner, same session. Now a sub-issue of TUN-77
   that blocks TUN-87.
3. *Reserved concurrency* — the account's Lambda limit is **1000**: the owner, same session. So the
   default is 2 per function (6 reserved, 994 left unreserved).

## Build (Claude)

Built as planned with split A. Departures from the plan:

- **Reserved concurrency is a fixed `ReservedConcurrentExecutions: 2` in `Globals`, not a parameter.**
  The owner's limit is 1000, so no condition is needed. A second parameter would also have needed
  passing on the first deploy, because SAM asks for the previous value of any parameter it isn't given,
  and a new parameter has none.
- **No `sam validate` / `cfn-lint` here:** neither is installed, and running a freshly downloaded
  cfn-lint was refused by this session's permission check. The template was reviewed by hand. The
  owner's deploy steps start with `sam validate --lint`, and `--confirm-changeset` shows the change set
  before anything runs.

**Expected change set** (the owner confirms it; no credentials here): **no resource marked
`Replacement`**. Every changed property is documented as *Update requires: No interruption*:
`DeletionProtection` (user pool), `DeletionProtectionEnabled` and `PointInTimeRecoverySpecification`
(tables), `ReservedConcurrentExecutions` (functions), and the stage's `RouteSettings` /
`DefaultRouteSettings`. `DeletionPolicy` and `UpdateReplacePolicy` are resource attributes, not
properties. Added: `MonthlyBudget`. `UserPoolClient` is untouched; its ID is hard-coded in
`js/cloud.js` `AUTH`.

**Budget confirmation email:** AWS Budgets' direct email subscribers are not believed to get a
confirmation email (unverified; SNS topic subscriptions do). If none arrives, the owner checks the
Budgets console lists the address. The ticket's "confirms the budget's confirmation email arrives" is
replaced by that check.

## PR review

_None yet._
