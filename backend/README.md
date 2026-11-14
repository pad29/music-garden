# Tune Garden — backend

**Status: DEPLOYED** (stack `music-garden`, us-east-1). Cognito (username + password, email optional) + an HTTP API backed by DynamoDB. Two APIs: **progress** (`GET`/`PUT /progress`, one row per user) and **songs** (`POST/GET/PUT/DELETE /songs`, `GET /songs?mine` — cloud song storage per `SAVE-SHARE.md` §6; `GET /songs/{id}` is deliberately unauthenticated so share links open without an account). Deployed with **AWS SAM**; Lambdas run on nodejs24.x. All serverless, pay-per-use — at hobby traffic this is effectively free / pennies.

```
backend/
  template.yaml        # all the AWS resources (Cognito, DynamoDB ×2, API, Lambdas, the $30 budget)
  src/
    presignup.mjs      # auto-confirms new accounts (no email step)
    progress.mjs       # GET/PUT the caller's own progress
    songs.mjs          # cloud songs CRUD (SAVE-SHARE.md §6: caps, unlisted-only)
    package.json
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
After any change to `template.yaml` or `src/`:
```powershell
cd backend   # from the repo root
sam validate --lint
sam build; sam deploy --confirm-changeset
```
`--confirm-changeset` shows the change set and waits for `y`. **Read its `Replacement` column first:** a
`True` on `UserPool`, `ProgressTable` or `SongsTable` means CloudFormation wants a new one. Their
`UpdateReplacePolicy: Retain` keeps the old one and its data, but the app would then point at an empty
new one — answer `n` and fix the template instead.

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
Gateway answers `503 Service Unavailable`. The game treats both like any failed call, with no
automatic retry:

- A progress save that fails is silent; the next save sends the whole progress again.
- Sharing a big song: "⚠️ Couldn't reach the cloud — please try again." Loading one from Melodies:
  "⚠️ Couldn't load that song." Deleting one: "⚠️ Couldn't delete."
- **Misleading:** a friend's `#song=` link says "⚠️ That song link didn't work — it may have been
  deleted.", and a failed Melodies list shows "Nothing here yet — share a big song to store it in the
  cloud." as if the player's cloud songs were gone (TUN-107).
- **Data loss:** a failed progress load at sign-in pushes this device's progress over the cloud copy
  (TUN-106).

To change a limit, edit `RouteSettings` on the route's event in `template.yaml`, update the sum in the
comment on `Api`, this table and `tests/backend-template.test.mjs`, and redo the arithmetic. The
arithmetic is a set of saturated-rate *scenarios*, not an upper bound: with today's payload sizes even 5
requests a second costs far more than $30 a month. The throttle slows how fast money can go; the budget
email (and TUN-87's switch-off) bound the month.

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
`ReservedConcurrentExecutions` in `Globals`. Never set it to `0` — that switches the functions off.

**Budget.** `MonthlyBudget` is an AWS Budget of **$30 a month for the whole AWS account** — it has no
cost filters, so anything else in the account counts too. It emails `BudgetEmail` when actual spend
passes 50 %, 80 % and 100 %, and when AWS forecasts the month will pass 100 %. Budget alerts with email
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

## Notes
- **What's secret vs not:** the IAM access key (on your machine, in `~/.aws`) is secret. `UserPoolId` / `UserPoolClientId` / `ApiUrl` are **not** secret.
- **CORS** is scoped to `https://tunegarden.game` (+ `www` + the Netlify fallback origin) in `template.yaml`. Update `AllowOrigins` there if the deploy URL changes.
- **Recovery:** accounts are username+password with no email by default (no password reset). A user can optionally add an email at sign-up to enable forgot-password; a custom "recovery code" flow can be added later.
- **Cost:** Cognito has a large free tier; DynamoDB on-demand + Lambda + HTTP API are pay-per-request and negligible at hobby scale. The throttle, the reserved concurrency and the $30 budget alert are in [Limits and budget](#limits-and-budget).
