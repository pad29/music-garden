# Tune Garden — backend

**Status: DEPLOYED** (stack `music-garden`, us-east-1). Cognito (username + password, email optional) + an HTTP API backed by DynamoDB. Two APIs: **progress** (`GET`/`PUT /progress`, one row per user) and **songs** (`POST/GET/PUT/DELETE /songs`, `GET /songs?mine` — cloud song storage per `SAVE-SHARE.md` §6; `GET /songs/{id}` is deliberately unauthenticated so share links open without an account). Deployed with **AWS SAM**; Lambdas run on nodejs24.x. All serverless, pay-per-use — at hobby traffic this is effectively free / pennies.

```
backend/
  template.yaml        # all the AWS resources (Cognito, DynamoDB ×2, API, Lambdas, the $30 budget, the cost switch)
  src/
    presignup.mjs      # auto-confirms new accounts (no email step)
    progress.mjs       # the progress Lambda: AWS SDK wiring only
    progress-api.mjs   # GET/PUT the caller's own progress (no SDK, so it is testable)
    songs.mjs          # the songs Lambda: AWS SDK wiring only
    songs-api.mjs      # cloud songs CRUD (SAVE-SHARE.md §6: caps, unlisted-only; no SDK)
    validate.mjs       # what a song and progress may hold — the one place the server knows the formats
    http.mjs           # replies with fixed messages; reading a body under a byte cap
    cloud-switch.mjs   # the cost switch Lambda: AWS SDK wiring only (TUN-87)
    cloud-switch-api.mjs # switches the cloud off at the $30 budget, or on by command (no SDK, so it is testable)
    package.json
  events/              # the cost switch's payloads: switch-on/off/status.json
  samconfig.toml       # saved deploy args (so future deploys are just `sam deploy`)
  README.md            # you are here
```

---

## One-time setup (Windows / PowerShell)

You already have an AWS account; you need credentials + two CLIs.

### 1. Create deploy credentials (IAM access key)
In the AWS Console:
1. **IAM → Users → Create user** (e.g. `mg-deployer`). *Skip* console access.
2. Attach policy **`AdministratorAccess`** (simplest for setup; you can scope it down later).
3. Open the user → **Security credentials → Create access key → "Command Line Interface (CLI)"**.
4. Copy the **Access key ID** and **Secret access key**. (The secret is shown once — keep it private; never commit it.)

### 2. Install the AWS CLI v2
Download & run the MSI: https://awscli.amazonaws.com/AWSCLIV2.msi  — then in a **new** PowerShell:
```powershell
aws --version          # expect: aws-cli/2.x ...
```

### 3. Configure credentials
```powershell
aws configure
# AWS Access Key ID:     <paste>
# AWS Secret Access Key: <paste>
# Default region name:   us-east-1        # or your preferred region
# Default output format: json
```

### 4. Install the AWS SAM CLI
Download & run the MSI: https://github.com/aws/aws-sam-cli/releases/latest/download/AWS_SAM_CLI_64_PY3.msi — then in a **new** PowerShell:
```powershell
sam --version          # expect: SAM CLI, version 1.x
```
*(No Docker needed — these Lambdas have no dependencies; the AWS SDK is provided by the Node.js 24 runtime, `nodejs24.x`.)*

---

## Deploy

```powershell
cd backend   # from the repo root
sam build
sam deploy --guided
```

`--guided` will prompt — sensible answers:
- **Stack Name:** `music-garden`
- **AWS Region:** `us-east-1` (or your choice)
- **Confirm changes before deploy:** `N`
- **Allow SAM CLI IAM role creation:** `Y`  ← required (the app needs IAM roles)
- **Disable rollback:** `N`
- **ProgressFn / PreSignUpFn may not have authorization defined — OK?:** `Y` (the API itself is JWT-protected; this prompt is about the Lambda, which is fine)
- **Save arguments to configuration file:** `Y` (writes `samconfig.toml` so future deploys are just `sam deploy`)
- **BudgetEmail:** your address for the cost alerts (see [Limits and budget](#limits-and-budget)). It is a `NoEcho` parameter, which current SAM leaves out when it saves `samconfig.toml` — but **check `samconfig.toml` holds no address before committing**: the repository is public. The stack keeps the value, so later deploys don't need it.

When it finishes it prints **Outputs**. You'll see four values:

```
Region            us-east-1
UserPoolId        us-east-1_XXXXXXXXX
UserPoolClientId  xxxxxxxxxxxxxxxxxxxxxxxxxx
ApiUrl            https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com
```

Those four values are *public* identifiers (the kind that ship inside any web app), safe to commit — unlike your IAM secret key, which stays on your machine. They're already wired into the client (the `AUTH` object in `js/cloud.js`); if you ever recreate the stack, update `AUTH` with the new outputs.

---

## Future deploys
After any change to `template.yaml` or `src/`. **First ask the [cost switch](#the-cost-switch) for its
status** (once TUN-87 is deployed). **Deploy only if the command prints no `"FunctionError"` and
`status.json` says `"cloud": "on"`.** `"off"`, `"mixed"` (a partial switch, or a setting it could not
read), a `FunctionError` or no answer all mean stop — see *Deploying while it is off* there.
```powershell
cd backend   # from the repo root
aws lambda invoke --function-name music-garden-cloud-switch --payload fileb://events/switch-status.json status.json; type status.json
sam validate --lint
sam build; sam deploy --confirm-changeset
aws lambda invoke --function-name music-garden-cloud-switch --payload fileb://events/switch-status.json status.json; type status.json
```
The last line asks again after the deploy: it should still say `"cloud": "on"`.
`--confirm-changeset` shows the change set and waits for `y`. **Read its `Replacement` column first:** a
`True` on `UserPool`, `ProgressTable` or `SongsTable` means CloudFormation wants a new one. Their
`UpdateReplacePolicy: Retain` keeps the old one and its data, but the app would then point at an empty
new one — answer `n` and fix the template instead.

**Rows that are normal even when `src/` is unchanged** (seen at TUN-76's and TUN-83's deploys,
2026-11-14; the reasons are CloudFormation's own, from `aws cloudformation describe-change-set`):

| Resource | Action / Replacement | Why |
|---|---|---|
| `PreSignUpFn`, `ProgressFn`, `SongsFn` | Modify / `False` | `sam build` re-zips the code, and after a `git pull` the files' timestamps differ, so the zip gets a new upload key (`Code`, never recreated) |
| `UserPool` | Modify / `False` | its sign-up trigger (`LambdaConfig`) refers to `PreSignUpFn`'s ARN |
| `PreSignUpPermission` | Modify / `Conditional` | its `SourceArn` refers to `UserPool`'s ARN. It would be recreated only if the pool were replaced, and the pool is not |
| `Api` | Modify / `False` | its route definitions (`Body`) refer to `SongsFn`'s and `ProgressFn`'s ARNs, so it shows whenever those functions change. Their ARNs stay the same |

To see why any row is there, read the pending change set before answering:
`aws cloudformation describe-change-set --stack-name music-garden --change-set-name <name>`.
Each row's `Details` name the property and what caused it. `aws cloudformation list-change-sets
--stack-name music-garden` gives the name.

The stop rule does not change: `True` in the `Replacement` column on `UserPool`, `ProgressTable` or
`SongsTable` means answer `n`.

**The first deploy after TUN-82** adds the `BudgetEmail` parameter, which has no default, so pass it once
on the command line — never in `samconfig.toml`, which is public:
```powershell
sam deploy --confirm-changeset --parameter-overrides BudgetEmail=you@example.com
```
Later `sam deploy`s reuse the stored value (SAM asks CloudFormation for the previous value of any
parameter it isn't given). Then **verify the address**: AWS Budgets emails a verification link (from an
`@aws.com` sender; it expires after 12 hours). Open it while signed in to this AWS account, then check the
budget's detail page (Billing and Cost Management → Budgets) shows the address as **Active**. *Pending* or
*Inactive* means no alerts will arrive — use *Resend verification* or *Send Notification* there. An
address already verified in this account through another AWS service shows Active at once.

## Tear down (if you ever want to remove everything)
```powershell
sam delete --stack-name music-garden
```
Since TUN-82 this **leaves the user pool and both tables behind**, with every account and song: they
have `DeletionPolicy: Retain`. To really remove them, switch off deletion protection in the console
(Cognito → the pool → Settings; DynamoDB → each table → Additional settings), then delete them by hand.

## Limits and budget

Set in `template.yaml` by TUN-82. The cost arithmetic — every route used flat out for a month, at AWS's
list prices — is in `reviews/TUN-82-throttle-budget-data-protection.md`.

**API throttle.** Each route has a rate limit (requests per second) and a burst, shared by **every**
caller — HTTP APIs have no per-user limits — so the API's nominal steady-state rate is the sum, 5
requests a second. AWS applies throttles **best-effort**: bursts and other factors can briefly exceed
them, so treat the numbers as targets, not a guaranteed ceiling.

| Route | Rate/s | Burst | Why |
|---|---|---|---|
| `PUT /progress` | 2 | 10 | every save, 900 ms after the player's last change: the busiest route |
| `GET /progress` | 1 | 5 | once per sign-in or page load |
| `GET /songs/{id}` | 1 | 5 | every opened cloud share link; needs no account |
| `POST /songs`, `GET /songs`, `PUT /songs/{id}`, `DELETE /songs/{id}` | 0.25 each | 2 | sharing a big song, the Melodies list, deleting: rare |
| any route added later | 0.25 | 2 | `DefaultRouteSettings` on `Api` |

Over a limit, API Gateway answers `429 Too Many Requests` without calling the Lambda. When a third call
reaches a function while two are still running (its reserved concurrency), Lambda refuses it and API
Gateway answers `503 Service Unavailable`. The game treats both like any failed call — and like the
[cost switch](#the-cost-switch) being off, which it cannot tell apart — with no automatic retry. Since
TUN-87 every such failure says one calm thing, "the cloud is resting" (`CLOUD_RESTING` in `js/cloud.js`):

- A progress save that fails sends nothing more until the next save, which sends the whole progress
  again. Until a save succeeds, the signed-in panel stops saying "progress syncs across your devices"
  and says "☁️ the cloud is resting just now. What you play is kept on this device, and goes up with
  your next save after it wakes, while this page stays open. Opening the game again after it wakes
  brings your cloud garden back in its place." Any failed or successful cloud call — songs included —
  moves this line; the newest call to start wins.
- A failed progress load at sign-in or page load — or a 200 that is neither `null` nor progress —
  leaves the cloud copy alone (TUN-106): nothing is pushed until a later load succeeds, the player plays
  on this device's progress, and the panel says "☁️ the cloud is resting just now. Your cloud garden is
  safe there, and what you play now is kept on this device. When the cloud wakes, reloading brings your
  cloud garden back in its place." The next page load or sign-in tries again; a success replaces this
  device's progress with the cloud copy, as every load does.
- Sharing a big song: "☁️ The cloud is resting just now — try sharing this song again later." Loading
  or deleting one from Melodies: "☁️ The cloud is resting just now — try again later." A Melodies list
  that cannot be loaded says the cloud is resting and the songs are safe; only a list that loads empty
  says "Nothing here yet…" (TUN-107's fix, taken into TUN-87).
- A friend's `#song=` link: "☁️ The cloud is resting just now, so this song can't open yet. Try the
  link again later." Only the API's own `404 {"error":"not found"}` says "⚠️ That song link didn't
  work — it may have been deleted." — a switched-off API answers 404 too, with API Gateway's body.
- Making an account when Cognito cannot run the sign-up trigger (the switch is off, or the trigger
  failed): "🌱 The garden isn't taking new accounts just now. Keep playing as a guest — your garden is
  saved on this device — and try again another day." Cognito's own text, which the game no longer shows, is
  "PreSignUp invocation failed due to error TooManyRequestsException." (measured with the switch off,
  2026-11-15).

To change a limit, edit `RouteSettings` on the route's event in `template.yaml`, update the sum in the
comment on `Api`, this table and `tests/backend-template.test.mjs`, and redo the arithmetic. The
arithmetic is a set of saturated-rate *scenarios*, not an upper bound: with today's payload sizes even 5
requests a second costs far more than $30 a month. The throttle slows how fast money can go; the budget
email and the [cost switch](#the-cost-switch) bound the month.

**Measured after the first deploy (2026-11-14).** The live stage held exactly the configured limits.
Under a real burst they were looser than configured:

| Test | Result |
|---|---|
| One client, sequential calls to `GET /songs/{id}` (limit 1/s, burst 5) at 5.9/s for 10 s | 50 × `404`, only 10 × `429`: about 4.9/s got through |
| 20 simultaneous calls to `GET /songs/{id}` | 15 refused with `503` by the concurrency cap, not `429` |
| Up to 60 simultaneous unauthenticated calls to `GET /progress` | all `401` from the JWT authorizer, none throttled; these run no Lambda |

So at these low rates the throttle is a rough brake, and the hard limit is the reserved
concurrency. With ~100–200 ms calls, 2 in flight still allows on the order of 10–20 calls a second
per function. TUN-102 rehearses the cost cap against production with these numbers in mind.

**Reserved concurrency.** `Globals` reserves 2 concurrent executions for each of the three functions
(6 of the account's 1,000; Lambda keeps 100 unreserved). It caps what reaches a function whatever the
API does, and guarantees the game's functions can run if something else in the account is busy. Change
`ReservedConcurrentExecutions` in `Globals`. Never set it to `0` by hand — that switches the functions
off, which is the [cost switch](#the-cost-switch)'s job. (`CloudSwitchFn` itself reserves 1, so two
switch commands never run at once.)

**Budget.** `MonthlyBudget` is an AWS Budget of **$30 a month for the whole AWS account** — it has no
cost filters, so anything else in the account counts too. It emails `BudgetEmail` when actual spend
passes 50 %, 80 % and 100 %, and when AWS forecasts the month will pass 100 %. At 100 % actual it also
trips the [cost switch](#the-cost-switch). Budget alerts with email
are free. Billing data lags by hours, so an alert is a warning, not a stop. Alerts only reach an address
the budget shows as **Active** (see the verification step under [Future deploys](#future-deploys)).
Change the amount in `BudgetLimit`. Change the address with
`sam deploy --confirm-changeset --parameter-overrides BudgetEmail=new@example.com`: a new address
**replaces** the budget (CloudFormation creates the new one, then deletes the old), which is why the
budget has no fixed name — CloudFormation generates one, so look for it on the Budgets page by its
$30.00 amount. Verify the new address the same way.

**Data protection.** The user pool and both tables have `DeletionPolicy: Retain` and
`UpdateReplacePolicy: Retain` (kept if the stack is deleted or a change would replace them) and AWS's
own deletion protection. Both tables have point-in-time recovery: DynamoDB can restore either table to
any second of the last 35 days, into a new table (console → the table → Backups → Restore). It costs
$0.20 per GB-month — cents at this size.

## The cost switch

Set in `template.yaml` by TUN-87; the design, the AWS facts it rests on and the overshoot arithmetic are
in `reviews/TUN-87-cloud-switch.md`. The throttle is the real cap; this is the backstop.

**What trips it.** When the month's **actual** spend passes $30, `MonthlyBudget`'s 100 % alert posts to
the SNS topic `CloudSwitchAlarmTopic`, which runs `music-garden-cloud-switch` (`CloudSwitchFn`,
`src/cloud-switch.mjs`). Any message on that topic means **off** — a message can never switch the cloud
on. Only AWS Budgets (and IAM users of this account, like you) can publish there. When you switch back
on, the switch records the time in the SSM parameter `/music-garden/cloud-switch/on-at`
(`CloudSwitchState`); a trip message **published before that time** is ignored, and emailed about — Lambda
and SNS can deliver a message again, even hours later, and it must not undo your switch-on. A trip
published after it, however late it arrives, switches off. Nothing is running while it waits: it costs
nothing.

**What it does.** It sets `ProgressFn`, `SongsFn` and `PreSignUpFn` to reserved concurrency **0** — no
Lambda runs, no DynamoDB read or write, and Cognito cannot run the sign-up trigger, so **no new accounts**
— and **disables the API's default endpoint**, so calls stop at API Gateway before any route,
authorizer or throttle. It reads all four back, then emails `BudgetEmail` (through
`CloudSwitchNoticeTopic`) what tripped it and what each setting now is. A step that fails or hangs does
not stop the others — at its deadline (10 seconds) its AWS call is cancelled, retries and all, and the
switch waits up to 2 seconds more for it to settle before reading every setting back. Cancelling only
stops the switch's side: a request AWS had already received may still apply — possibly after the
read-back, or even after a later command (not seen, and not ruled out by AWS's documentation; the owner's
call in TUN-87's review record). Any step that failed or timed out makes the email say "NOT COMPLETE",
with the command to run again, and an automatic trip is retried twice. **A minute after any on or off,
ask for the status once more**: it should say what you asked for — if not, run the command again. It **never switches back on by itself** — not at the start of a month
either.

**What players see.** The game plays on as for a guest: levels, the Studio, local saves, `#s=` links.
Existing players can still sign in (sign-in never runs the sign-up trigger), and every cloud call fails
calmly — "the cloud is resting" (the list under [Limits and budget](#limits-and-budget)): nothing claims
"syncs across your devices", no song is called deleted, nothing is pushed over the cloud copy (TUN-106).
**What a player plays while it is off stays on their device**, and the first load after you switch on
replaces it with their cloud copy, as every load does — the messages say so.

**What it cannot stop.** API Gateway's charge for the calls it refuses, if refused calls are billed
($1.00 per million; TUN-102 measures it), existing players' sign-ins (Cognito), storage and backups,
anything else in the account, and the hours of spend before the budget notices — billing data reaches
Budgets hours late. The review record has the scenarios.

**Commands.** Run from `backend/` in the repository; the payload files are in `events/`, so no shell
quoting matters. Each prints `"StatusCode": 200`; **if it also prints `"FunctionError"`, it did not
fully work** — open the `.json` file it wrote to see which setting did not take, and run it again.

| To | Run |
|---|---|
| Switch back **on** | `aws lambda invoke --function-name music-garden-cloud-switch --payload fileb://events/switch-on.json on.json` |
| See the **status** (`"cloud": "on"`, `"off"` or `"mixed"`) | `aws lambda invoke --function-name music-garden-cloud-switch --payload fileb://events/switch-status.json status.json` |
| Switch **off** by hand | `aws lambda invoke --function-name music-garden-cloud-switch --payload fileb://events/switch-off.json off.json` |
| **Rehearse** the trip, through the real SNS path | `aws sns publish --topic-arn <CloudSwitchAlarmTopicArn> --message rehearsal` |

`<CloudSwitchAlarmTopicArn>` is a stack output (`sam list stack-outputs --stack-name music-garden`).
`on.json`, `status.json` and `off.json` are gitignored.

**Before switching back on**, look at the month's spend (Billing and Cost Management → Budgets).
**The budget alerts once per budget per month**: if this month's $30 alert has already fired (not a
rehearsal — that does not use it up), switching on while the month is still over $30 means the switch
will not trip again until next month — only the throttle stands in the way.

**Deploying while it is off.** Don't. A `sam deploy` may or may not switch the functions or the endpoint
back on (CloudFormation compares templates, not live settings; not yet measured — TUN-102 can), and
nothing can hold them off during the deploy itself. So [Future deploys](#future-deploys) starts with the
**status** command. If a deploy can't wait — the switch itself needs fixing — deploy, then at once run
the **off** command and **status** again; the functions may have run for the minutes in between.
A change to the `CloudSwitchState` resource resets the recorded switch-on time to `never`; that is
harmless unless an old trip message is delivered again afterwards.

**Setting it up — the first deploy after TUN-87:**
1. Look at the month's spend first. The deploy **replaces** the budget (its notifications change), and a
   new budget already over $30 notifies at its first check — the switch would trip right after the deploy.
2. `sam build; sam deploy --confirm-changeset`. New in the change set: `CloudSwitchAlarmTopic`,
   `CloudSwitchAlarmTopicPolicy`, `CloudSwitchAlarmSubscription`, `CloudSwitchAlarmPermission`,
   `CloudSwitchNoticeTopic`, `CloudSwitchState`, `CloudSwitchFn` with its role and invoke config (Add);
   `MonthlyBudget` (Modify, Replacement
   `True` — expected; only `UserPool`, `ProgressTable` and `SongsTable` must never show `True`). Budgets
   checks it may publish to a subscriber topic when a budget is saved (the console's "Invalid SNS
   topic" error), so a deploy that succeeds should mean the topic policy works. The rehearsal cannot
   test that part: it publishes as you, not as Budgets.
3. An email "AWS Notification - Subscription Confirmation" arrives at `BudgetEmail`: **Confirm
   subscription**. Until you do, the switch works but emails no one.
4. Rehearse: publish to the topic (above). Within a minute, an email "Tune Garden: the cloud is switched
   OFF". **A minute after the trip, status** says `"cloud": "off"`. Open https://tunegarden.game: the game
   plays, Home's panel says the cloud is resting, a cloud song link says the same, and creating an account
   says the garden isn't taking new accounts.
5. Switch back on (above); the email "…switched back ON" arrives, and **a minute later, status** says
   `"cloud": "on"` — if it doesn't, run the switch-on command again.

## What the API accepts

Since TUN-83 the server stores only songs and progress the game really writes. `src/validate.mjs` is
the **one place on the server that knows both formats**. `songs-api.mjs` and `progress-api.mjs` call
it on every write. The rules, field by field, are in `validate.mjs` itself and in
`reviews/TUN-83-real-songs-and-progress.md`. In short:

- **Known keys only, closed lists for every string.** A song is a v3 song (`SAVE-SHARE.md` § 3).
  Numbers must be in range: pitch 0–127, column inside `cols`, lane 0–2, tempo 40–180, groove 0–6,
  pickup inside one bar. `cols` may be 16–100,000 and a note's length 1–100,000
  (`SONG_COLS_LIMIT`): a song saved before TUN-84 can be wider than today's 1,920-column Studio, and
  the game clamps it on load. Strings come from closed lists: the
  palette, the voice (today's eight, plus the retired `pluck` and `pad`, which old settings still
  carry), the track kind and the meter. A song may have at most 1,000 notes and 1,000 hits. Progress
  is the shape `commitProgress()` writes. Its package and region names are closed lists too, checked
  as set members, so `"constructor"` is no package. Anything else is refused.
- **No free text but the title.** A song's `meta` (quest ids, `author`, `cloudId`…) is checked for
  known keys and then dropped. The stored `meta` is `{ title, created, updated }`, and `meta.title`
  is always the stored title (`sanitizeTitle`, unchanged). Progress `name` is still accepted
  (removing it is a later ticket). It is cut to 20 characters and stripped of control characters.
- **Writes are rebuilt.** What is stored is rebuilt from the checked fields, never the request as it
  came. It is stored as JSON text (`payload`, `data`), so the stored size is the size the cap
  measured. Reads are never checked: a row written before TUN-83 loads as it did, and an old map and
  new text both read back the same.
- **Refusals carry fixed messages.** A body that does not parse is `400 bad json`. One that fails a
  check is `400 bad song`, `bad progress` or `bad request`. One over a size cap is `413 too large`,
  checked before parsing. Anything unexpected is `500 server error`. The reason goes to CloudWatch,
  never to the caller.

| Cap | Value | Where |
|---|---|---|
| Stored song (UTF-8) | 16 KB (16,384 bytes) | `MAX_SONG_BYTES`; the owner, 2026-11-14 |
| Song request body | 17 KB | `MAX_SONG_BODY_BYTES` (title and dropped `meta` ride along) |
| Progress (request and stored) | 16 KB | `MAX_PROGRESS_BYTES`; the owner, 2026-11-14 |
| Cloud songs per account | 50, **soft** | `MAX_PER_USER` |

**Per-account ceiling: about 50 × 16 KB = 800 KB of songs** (stored twice: the table and the
ALL-projection `byOwner` index), plus one progress row of at most 16 KB. The song count pages through
the whole index, but it is a soft cap. Two shares at the same moment can both see 49, and the index
lags writes slightly, so an account can pass 50 by one or two. Accounts already over a cap keep what
they have.

**What the caps cost.** With these caps, every route used flat out for a month costs about
**$155** at the nominal throttle. TUN-82's corrected figure was $119.62. The difference is the 16 KB
progress cap instead of 8 KB, and each full item's keys and other attributes, which take it to 17
write units, not 16. The route table is in `reviews/TUN-83-real-songs-and-progress.md` § The
arithmetic. It is a scenario, not a bound: the throttle measured about 5× looser than configured.
The budget email and the [cost switch](#the-cost-switch) bound the month. Replacing an old row bigger than the cap is
billed at the old size, once.

**When the game grows, check the caps.** The largest progress the game can write is every package
completed, with every distinct tool crafted in each package that has Fuse. Today that is 13,310
bytes. A new Fuse package, a wider palette or a new progress field makes it bigger.
`tests/backend-validate.test.mjs` builds that progress through the real game and **fails once it no
longer fits under `MAX_PROGRESS_BYTES` with 10% to spare**. When it does, raise the cap and redo the
cost line above. Do the same for the song cap if the Studio's field or a song's fields grow
(`MAX_COLS`, multi-voice, velocity).

**Changing a format, or adding a package, region, voice, companion or meter:** change
`validate.mjs` in the same PR. The drift tests in `tests/backend-validate.test.mjs` fail until you
do. **Deploy the backend before the client merges.** An older client never sends the new value, but
a newer client against the old backend is refused. A refused progress save is worse than a failed
one: sign-in replaces local progress with the cloud copy, so the stale copy comes back over newer
play.

**Rolling back past TUN-83** would bring back unchecked storage and 400 KB writes. It would also
break every song shared after the deploy, because older code returns the stored JSON text as a
string, which the game cannot open. Fix forward instead.

## Notes
- **What's secret vs not:** the IAM access key (on your machine, in `~/.aws`) is secret. `UserPoolId` / `UserPoolClientId` / `ApiUrl` are **not** secret.
- **CORS** is scoped to `https://tunegarden.game` and `https://www.tunegarden.game` in `template.yaml` — nothing else: Cloudflare's previews (`*.music-garden.pages.dev`) and the retired `music-garden.netlify.app` cannot call the API (TUN-76). Adding an origin is the owner's decision; `tests/backend-template.test.mjs` holds the list, so change both. To see what the live API allows, send it a preflight; an allowed origin comes back in an `access-control-allow-origin` line, any other gets none:
  ```powershell
  curl.exe -s -i -X OPTIONS https://xush1pnxc7.execute-api.us-east-1.amazonaws.com/songs/x -H "Origin: https://tunegarden.game" -H "Access-Control-Request-Method: GET"
  ```
- **Recovery:** accounts are username+password with no email by default (no password reset). A user can optionally add an email at sign-up to enable forgot-password; a custom "recovery code" flow can be added later.
- **Cost:** Cognito has a large free tier; DynamoDB on-demand + Lambda + HTTP API are pay-per-request and negligible at hobby scale. The throttle, the reserved concurrency and the $30 budget alert are in [Limits and budget](#limits-and-budget).
