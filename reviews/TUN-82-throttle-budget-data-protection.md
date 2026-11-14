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

> **Corrected in PR review round 1** (§ *The arithmetic, corrected*, below): `DELETE` was underpriced,
> PITR was charged on the index too, and "worst case" overstated what these figures bound. They are
> saturated-rate scenarios, not upper bounds. This section is kept as first written.

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

**Budget confirmation email:** ~~not believed to get a confirmation email~~ — wrong, corrected in PR
review round 1 (finding 1). AWS Budgets now emails new direct recipients a verification link, and only
an **Active** recipient gets alerts. The ticket's "confirms the budget's confirmation email arrives"
stands, and the owner also checks for Active status.

## The arithmetic, corrected (PR review round 1)

Same prices and method, with three corrections from GPT's findings 3 and 4:

- **`DELETE /songs/{id}`:** a real delete of a 16 KB song costs 16 WRU on the table plus 16 on the
  ALL-projection `byOwner` index, after the read. That is $21.87 per million, not $2.49. Each delete
  needs a prior create, but at saturation creates and deletes run at the same 0.25/s.
- **PITR** is billed on table storage only; the index's half of song storage pays storage, not PITR.
- **These are saturated-rate scenarios, not upper bounds.** `songs.mjs` caps a song's
  `JSON.stringify(...).length` at `MAX_BYTES` = 102,400 — UTF-16 code units, not bytes — so multi-byte
  text can make a song ~300 KB (GPT's example: `{v:3,x:"一".repeat(100000)}` passes at 100,014 code
  units and serialises to 300,014 bytes). The 200 ms Lambda duration is an assumption, and AWS throttles
  best-effort, so bursts can briefly exceed the nominal rates.
- **Round 2:** `GET /songs` (`listMine`) reads one 1 MB query page, so its response carries at most
  ⌊1024 / song KB⌋ songs' metadata (~150 bytes each), not all 200. This lowers today's figures slightly
  and leaves the after-TUN-83 figures unchanged.

| Scenario | Split A (~5 req/s, chosen) | Split B (~1.5 req/s) |
|---|---|---|
| Today, progress 400 KB, songs 100 KB | $1,818.86/month (≈ $2.44/hour) | $461.19/month |
| Today, songs ~300 KB (multi-byte) | $2,465.47/month (≈ $3.31/hour) | — |
| After TUN-83, progress 8 KB, songs 16 KB | **$119.62/month** (≈ $0.16/hour) | $28.79/month |

<details><summary>Split A today, per route (round 2)</summary>

Progress 400 KB, songs 100 KB:

| Route | Limit | Requests/month | $ per million | $/month |
|---|---|---|---|---|
| `PUT /progress` | 2/s | 5.36M | $251.62 | $1,347.86 |
| `GET /progress` | 1/s | 2.68M | $43.87 | $117.49 |
| `GET /songs/{id}` | 1/s | 2.68M | $12.18 | $32.62 |
| `POST /songs` | 0.25/s | 0.67M | $142.62 | $95.50 |
| `GET /songs` | 0.25/s | 0.67M | $17.75 | $11.89 |
| `PUT /songs/{id}` | 0.25/s | 0.67M | $190.68 | $127.68 |
| `DELETE /songs/{id}` | 0.25/s | 0.67M | $128.18 | $85.83 |
| **Total** | 5/s | 13.39M | | **$1,818.86** |

Progress 400 KB, songs ~300 KB (multi-byte):

| Route | Limit | Requests/month | $ per million | $/month |
|---|---|---|---|---|
| `PUT /progress` | 2/s | 5.36M | $251.62 | $1,347.86 |
| `GET /progress` | 1/s | 2.68M | $43.87 | $117.49 |
| `GET /songs/{id}` | 1/s | 2.68M | $33.30 | $89.20 |
| `POST /songs` | 0.25/s | 0.67M | $392.62 | $262.90 |
| `GET /songs` | 0.25/s | 0.67M | $17.66 | $11.82 |
| `PUT /songs/{id}` | 0.25/s | 0.67M | $568.80 | $380.87 |
| `DELETE /songs/{id}` | 0.25/s | 0.67M | $381.30 | $255.32 |
| **Total** | 5/s | 13.39M | | **$2,465.47** |

</details>

Song storage can grow, cumulatively: split A after TUN-83 by up to 21.4 GB/month (+$7.50/month); today
by up to 134 GB/month (100 KB songs) or 402 GB/month (300 KB).

<details><summary>Split A after TUN-83, per route (corrected)</summary>

| Route | Limit | Requests/month | $ per million | $/month |
|---|---|---|---|---|
| `PUT /progress` | 2/s | 5.36M | $6.62 | $35.44 |
| `GET /progress` | 1/s | 2.68M | $2.46 | $6.59 |
| `GET /songs/{id}` | 1/s | 2.68M | $3.31 | $8.86 |
| `POST /songs` | 0.25/s | 0.67M | $34.12 | $22.84 |
| `GET /songs` | 0.25/s | 0.67M | $14.79 | $9.90 |
| `PUT /songs/{id}` | 0.25/s | 0.67M | $31.87 | $21.34 |
| `DELETE /songs/{id}` | 0.25/s | 0.67M | $21.87 | $14.64 |
| **Total** | 5/s | 13.39M | | **$119.62** |

</details>

The owner's choice of split A rested on its rate per hour being small. Corrected, it is ≈ $0.16/hour
after TUN-83 instead of $0.14, so a few hours of billing lag still cost well under a dollar. The
conclusion stands, and the hand-off reports the change.

## PR review

- **Round 1 — not run.** `ask.sh` on head `c958c2e`: "usage limit — try again at Nov 14th, 2026 1:59
  AM (codex exit 1)" (1:59 AM Chicago time). Stopped at Needs Input. The prompt is reproducible: the
  ticket verbatim, the owner's three answers, `git diff origin/main...HEAD`, and the specific risks
  (SAM transform of event `RouteSettings` + `DefaultRouteSettings`, fractional rates,
  `ReservedConcurrentExecutions` in Globals, Budget shapes, replacements, `UsePreviousValue` for
  `BudgetEmail`, the arithmetic, the docs). Ask for required changes with severity, missing tests or
  checks, and an approval naming the head SHA.
- **Round 1 — run on `9eded2a`** (owner: "Let's run the GPT review now", 2026-11-14, 8:35 AM Chicago).
  **CHANGES REQUESTED**: one high, four medium, two low, plus five owner/deploy checks.

<details><summary>GPT's round 1 review, verbatim</summary>

Reviewed **9eded2aee8140ad741a24041b1afeb1e20cc5522** against `origin/main`. No files changed. SAM 1.162.0 is now installed: lint validation passed, and an in-memory transform preserved all seven route overrides. AWS deployment remains unverified.

I require these changes:

1. **High — [review record:158](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-23/reviews/TUN-82-throttle-budget-data-protection.md:158): the replacement budget-email acceptance check can leave alerts disabled.**  
   AWS now requires verification for new direct email recipients, separately from SNS. An address merely appearing in the console is insufficient: it can be Pending or Inactive and receive nothing. Replace this instruction, and update `backend/README.md`, to require completing verification and confirming **Active** status; already-verified addresses need no new email. [AWS recipient-verification documentation](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-email-recipients.html).

2. **Medium — [template.yaml:38](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-23/backend/template.yaml:38), `backend/README.md:149–150`: the documented email-change command cannot safely replace this fixed-name budget.**  
   Changing `BudgetEmail` changes `NotificationsWithSubscribers`, which requires resource replacement. CloudFormation creates replacements before deleting originals, but `tune-garden-monthly` must be unique within the account. Remove the fixed name before initial deployment, or provide a working replacement/name-rotation procedure. The advertised single parameter override is insufficient. [Budget replacement rules](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-budgets-budget.html), [budget-name uniqueness](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-properties-budgets-budget-budgetdata.html), [replacement ordering](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-attribute-updatereplacepolicy.html).

3. **Medium — [review record:84](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-23/reviews/TUN-82-throttle-budget-data-protection.md:84): DELETE is materially underpriced.**  
   Deleting a 16 KiB song consumes 16 WRUs for the table **plus 16 for its ALL-projection GSI**, alongside the preceding read. Under the record's other assumptions, this is approximately **$21.87/million, or $14.64/month**, versus the reported $2.49/million and $1.67/month. Correcting this alone raises split A's $106.65 to approximately **$119.62**. Recalculate both splits and today's scenario. Also correct the storage calculation: PITR charges exclude GSIs. [DynamoDB delete accounting](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/read-write-operations.html), [GSI write accounting](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/GSI.html), [PITR pricing basis](https://aws.amazon.com/dynamodb/pricing/).

4. **Medium — [review record:53](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-23/reviews/TUN-82-throttle-budget-data-protection.md:53): the "worst case" assumes a song-size bound the backend does not enforce.**  
   `songs.mjs` checks JavaScript string length, not UTF-8 bytes or DynamoDB item size. An in-memory example `{v:3,x:"一".repeat(100000)}` passes the current guard at **100,014 characters**, yet serializes to **300,014 bytes**. The 100 KB assumption therefore understates storage, reads, writes and response transfer. Recalculate using enforceable sizes, including item overhead, or label these figures as illustrative scenarios. Likewise, 200 ms Lambda duration is an assumption, not a worst-case bound. Validator changes can remain in TUN-83.

5. **Medium — [backend/README.md:119](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-23/backend/README.md:119), `template.yaml:289–292`, review arithmetic: the throttle is falsely described as a guaranteed ceiling.**  
   AWS explicitly describes HTTP API throttling as best effort; bursts and other factors can exceed configured rates. Replace "at most," "ceiling," and guaranteed burn-rate language with a **nominal steady-state target**, and state that saturated-rate arithmetic is not an upper bound. Preserve the owner-approved split; the problem is the claimed guarantee. [AWS HTTP API throttling documentation](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-throttling.html).

6. **Low — [backend/README.md:131](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-23/backend/README.md:131), review record's "client under a 429": the Melodies-list failure is omitted.**  
   `cloudSongList()` returns `[]` on 429, so `openMelodies()` displays **"Nothing here yet — share a big song to store it in the cloud."** Existing cloud songs appear absent, without a retry message. Document this additional gap and the actual cloud-link message suggesting deletion. TUN-106 is not the only misleading failure path; client fixes may remain separate.

7. **Low — [backend/README.md:70](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-23/backend/README.md:70), `template.yaml:13–14`, review record: the claimed guided-deploy email leak is inaccurate.**  
   Current SAM marks prompted `NoEcho` parameters hidden and excludes them when saving configuration. Correct the categorical claim that `--guided` writes this parameter into `samconfig.toml`. Retain the instruction to inspect configuration before committing. [SAM configuration-saving implementation](https://raw.githubusercontent.com/aws/aws-sam-cli/develop/samcli/commands/deploy/guided_config.py).

The remaining checks are:

1. **Owner change-set check:** create an unexecuted change set against the deployed stack. Record every replacement, including `Conditional`; explicitly inspect `UserPool`, `UserPoolClient`, both tables and `Api`. Local transformation cannot establish deployed-stack state.
2. **Budget lifecycle check:** verify all four notification thresholds, account-wide scope and Active recipient status; demonstrate receipt with a controlled notification test. After fixing item 2, verify changing the address succeeds and a subsequent deploy without parameter overrides preserves it.
3. **Deployed configuration check:** read back all seven route settings, default settings, concurrency reservations, deletion protection and PITR status. Verify existing accounts and saved data remain accessible.
4. **429 and smoke checks:** exercise bounded throttling requests and verify recovery after token refill. Cover progress push, large-song sharing, Melodies listing/loading/deleting and anonymous `#song=` loading. Mock failed sign-in pulls to avoid triggering the acknowledged TUN-106 overwrite against real player data; verify no automatic retry loop.
5. **Production owner check:** confirm sign-in, cross-device progress sync and an existing cloud-song link on `https://tunegarden.game`, recording these as pending until performed.

**CHANGES REQUESTED**

</details>

**My answers (round 1)** — I agree with all seven findings. I checked findings 1, 2 and 7 against
AWS's and SAM's own pages and source before agreeing. GPT's SAM claim also checked out: SAM CLI
1.162.0 is installed on this machine (it wasn't on this session's PATH), and its `sam validate --lint`
reports "valid SAM Template".

1. **High — agree.** AWS's page says new direct recipients get a verification email and "only verified
   addresses receive budget notifications". Fixed: the `backend/README.md` deploy steps and the
   hand-off require completing the verification link and seeing **Active**. The template comment says so too.
2. **Medium — agree.** `NotificationsWithSubscribers` is "Update requires: Replacement". Fixed: `BudgetName`
   removed (CloudFormation generates one). The template says why. The README's change-the-address step
   now uses `--confirm-changeset` and says the budget is replaced and needs verifying again.
3. **Medium — agree.** I had priced a delete at 1 WRU, as a miss. Recomputed (above): GPT's $21.87/M and
   $119.62 reproduce exactly. PITR is now on the table half only.
4. **Medium — agree.** The figures are relabelled as saturated-rate scenarios, with a multi-byte song
   scenario added. The README no longer calls them a bound. Enforcing byte sizes stays in TUN-83.
5. **Medium — agree.** "At most" and "ceiling" are gone from the README, the template comment and
   README.md § Backend. They now say "nominal steady-state rate", "best-effort" and "a target, not a
   guaranteed ceiling". The split is unchanged.
6. **Low — agree.** `backend/README.md` now lists every 429 path with its actual message, including the
   Melodies "Nothing here yet" line and the `#song=` "may have been deleted" line. Both misleading
   messages are filed as **TUN-107** (Backlog, S, Bug).
7. **Low — agree.** SAM's `_save_parameter_overrides` skips values flagged `Hidden`, which is how guided
   marks `NoEcho` prompts. The README and the template comment drop the claim and keep "check
   `samconfig.toml` holds no address before committing".

**Missing tests and checks:**
- **Added:** `tests/backend-template.test.mjs`. It statically pins the seven route throttles summing to
  5/s, the default throttle, reserved concurrency ≥ 1, `Retain` and deletion protection on the pool and
  tables, PITR, the budget's $30 / four alerts / no name / no filters / `!Ref BudgetEmail`, `NoEcho` with
  no default, and no email address in `template.yaml` or `samconfig.toml`. Its 13 mutation cases are
  kept as a second test.
- **GPT's five owner checks** went into the deploy checklist: the unexecuted change set, inspecting
  `UserPool`, `UserPoolClient`, both tables and `Api` including `Conditional`; recipient Active; a read-back
  of the deployed settings; a bounded 429 check on a nonexistent song ID, then recovery; the production
  smoke test. Two are not done:
  - The live 429 check skips progress sync, sharing and Melodies, because that would need a real
    account under TUN-106's overwrite risk; the game paths are checked by reading the code above.
  - The address-change rehearsal is skipped: replacing the budget would need re-verifying the address.
    The README documents the steps instead.

- **Round 2 — run on `b10cacc`** (the delta since `9eded2a`). **CHANGES REQUESTED**: four medium, one
  low — all but the low one about the new test's rigour. GPT: "The seven round-1 fixes are materially
  addressed … I found no new deployment defect in the actual template."

<details><summary>GPT's round 2 review, verbatim</summary>

Reviewed **b10cacc738b0745230977e1ca844609c1e1c4dfe**. No files changed.

The seven round-1 fixes are materially addressed. Removing `BudgetName` is supported: AWS generates a name when it is omitted. I found no new deployment defect in the actual template. [AWS documentation](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-properties-budgets-budget-budgetdata.html)

Required changes:

1. **Medium — [tests/backend-template.test.mjs:46](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-23/tests/backend-template.test.mjs:46): the checker accepts protection settings in the wrong location.**  
   `value()` searches descendants without checking their parent. Moving `SongsTable`'s two `Retain` attributes into resource `Metadata` returns **zero problems**, although neither retention policy then applies. That mutation also passes CloudFormation lint. Moving budget notifications into metadata likewise fools the checker. Require each setting at its effective YAML path; metadata or other nested text must not satisfy it.

2. **Medium — [tests/backend-template.test.mjs:63](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-23/tests/backend-template.test.mjs:63): route discovery silently misses valid routes.**  
   Adding an eighth event with `Type: HttpApi # new route`, no explicit throttle, and a new path returns **zero problems**. The template passes lint; the additional route inherits the default rate, making the documented aggregate 5.25/s. Quoted `HttpApi` values also escape discovery. Discover events structurally, including ordinary comments and quoted scalars, and verify their API/path/method identities.

3. **Medium — [tests/backend-template.test.mjs:76](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-23/tests/backend-template.test.mjs:76): the guard does not check effective concurrency or the promised burst limits.**  
   Adding `ReservedConcurrentExecutions: 0` to `SongsFn.Properties` passes both this checker and lint, despite disabling the songs function. The global value does not establish each function's effective value. Setting the default burst to zero—or every burst to 5,000—also passes. Check function overrides and pin the approved rate/burst/concurrency configuration.

4. **Medium — [tests/backend-template.test.mjs:118](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-23/tests/backend-template.test.mjs:118): the email guard ignores public comments, and its mutation tests cannot detect its removal.**  
   Appending `# Budget contact: owner@example.org` to either file returns **zero problems**, because `code()` removes comments before scanning. More significantly, I disabled the email regex entirely in memory: **both committed tests still passed**. Their address mutations are rejected by the separate subscriber, default-value, or `parameter_overrides` checks. Scan comments too, allowing only explicitly permitted examples, and assert the specific email diagnostic independently.

5. **Low — [review record:175](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-23/reviews/TUN-82-throttle-budget-data-protection.md:175): the new explanation states the wrong size limit.**  
   The guard is **102,400 UTF-16 code units**, not 100,000 characters. This explains why the 100,014-unit example passes. Correct the number and terminology.

Missing tests or checks:

1. Add the structural mutations from findings 1–2, plus valid formatting cases with comments, quoted types and reordered event properties. Assert the precise diagnostic, not merely any failure.
2. Add per-function zero/high concurrency overrides, missing/zero default burst, and oversized route bursts. Check the approved settings.
3. Add address-only fixtures in comments and otherwise valid configuration text. Disabling the email detector must make its mutation test fail.
4. Add explicit per-route calculations for the current 100/300 KB scenarios. Their totals reproduce with a 30 KB Melodies response assumption, but `listMine()` processes only one 1 MB query page—roughly ten or three songs at those sizes. The corrected DELETE calculation, table-only PITR allocation, and post-TUN-83 **$119.62/$28.79** totals otherwise reproduce under the record's approximations. [AWS PITR pricing basis](https://aws.amazon.com/dynamodb/pricing/)
5. Keep the skipped address-change rehearsal and controlled notification delivery test pending. Verify replacement succeeds, the new recipient becomes Active, and a subsequent deployment without overrides preserves the address. Verification is account-scoped, so an already-verified test address need not be verified again. [AWS recipient verification](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-email-recipients.html)
6. Complete the pending owner change-set/read-back/smoke checks and mocked 429 coverage for every documented client path. Reading code does not replace exercising those paths.

Verification: the focused test passed **2/2**. The full suite produced **615 passes, 69 failures**, all failures reporting `EPERM` while creating temporary directories in this restricted environment. `sam validate --lint` reported a valid template, then failed in SAM telemetry with a permissions error; invoking the installed lint API directly returned no findings for the head.

**CHANGES REQUESTED**

</details>

**My answers (round 2):**

1. **Medium — agree.** The test is rewritten on a small structural parser for this template's
   block-YAML subset. Every setting is read at its effective path, and the parser throws on anything it
   doesn't understand. Mutation cases: `Retain` moved under `Metadata` → "SongsTable lacks
   DeletionPolicy: Retain"; budget notifications moved under `Metadata` → "budget alerts are []".
2. **Medium — agree.** Routes are discovered structurally: every `HttpApi` event on every function,
   quoted or commented. Each is identified as `METHOD /path`, must be on `!Ref Api`, and must match the
   approved table exactly. An unknown route is refused ("is not an approved route"), and a second HTTP
   API or a raw `ApiGatewayV2` route is flagged. A valid-formatting test (quoted `Type`, inline comment,
   reordered event properties) must report no problems.
3. **Medium — agree.** The approved rate and burst are pinned for each of the seven routes and the
   default, and Globals concurrency is pinned at 2. Any function overriding it with another value is
   refused. Mutation cases: `SongsFn` at 0, default burst 0, a route burst of 5000.
4. **Medium — agree.** The email scan now covers comments, allowing only `@example.com` placeholders.
   A separate test uses otherwise-valid config (a template comment, a description, a `samconfig.toml`
   comment) and requires *only* the address diagnostic. Mutation audit of the rewritten test, each guard
   broken in a temporary copy: email scan off → the address test fails; `Retain` read from anywhere,
   function overrides ignored, unknown routes ignored, bursts not compared → the mutation test fails.
   All five caught.
5. **Low — agree.** Corrected to "102,400 UTF-16 code units" above.

**Missing tests and checks (round 2):**
- 1–3: added, as above.
- 4: **agree, added.** Per-route tables for today's 100 KB and 300 KB scenarios, with `GET /songs`
  limited to one 1 MB page. The totals move slightly ($1,818.86 and $2,465.47).
- 5: **agree.** The address-change rehearsal and a delivery test stay pending owner checks in the
  hand-off.
- 6: **partly disagree.** The owner change-set, read-back and smoke checks stay pending, in the deploy
  checklist. Mocked 429 tests of the game's client paths I did **not** add here, because:
  - The ticket is "template and docs only".
  - The misleading paths are owned by tickets whose Done criteria already demand those tests: TUN-106
    (the sign-in overwrite: 429/500/network cases) and TUN-107 (the Melodies list and the `#song=` link:
    200/404/429).
  - The calm paths (a failed push not retried, the share, load and delete toasts) are one-line
    `r.ok ? … : …` branches. I commented on TUN-106 and TUN-107 to add a 429 case for them, since
    those tickets edit the same functions.

  GPT's position: "Reading code does not replace exercising those paths." Both sides stand; the owner
  can overrule.

## Tests

682/682 pass on `c958c2e` (no code changed). Not verified: anything on AWS — no credentials, no `sam`,
and running a downloaded cfn-lint was refused. The owner's deploy runs `sam validate --lint` and shows
the change set first.

After round 1: see the round's commit message and the hand-off for the suite count. `sam validate --lint`
passes locally (SAM CLI 1.162.0).
