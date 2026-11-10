# Tune Garden — backend

**Status: DEPLOYED** (stack `music-garden`, us-east-1). Cognito (username + password, email optional) + an HTTP API backed by DynamoDB. Two APIs: **progress** (`GET`/`PUT /progress`, one row per user) and **songs** (`POST/GET/PUT/DELETE /songs`, `GET /songs?mine` — cloud song storage per `SAVE-SHARE.md` §6; `GET /songs/{id}` is deliberately unauthenticated so share links open without an account). Deployed with **AWS SAM**; Lambdas run on nodejs24.x. All serverless, pay-per-use — at hobby traffic this is effectively free / pennies.

```
backend/
  template.yaml        # all the AWS resources (Cognito, DynamoDB ×2, API, Lambdas)
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
*(No Docker needed — these Lambdas have no dependencies; the AWS SDK is provided by the Node 20 runtime.)*

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
sam build; sam deploy
```

## Tear down (if you ever want to remove everything)
```powershell
sam delete --stack-name music-garden
```

## Notes
- **What's secret vs not:** the IAM access key (on your machine, in `~/.aws`) is secret. `UserPoolId` / `UserPoolClientId` / `ApiUrl` are **not** secret.
- **CORS** is scoped to `https://tunegarden.game` (+ `www` + the Netlify fallback origin) in `template.yaml`. Update `AllowOrigins` there if the deploy URL changes.
- **Recovery:** accounts are username+password with no email by default (no password reset). A user can optionally add an email at sign-up to enable forgot-password; a custom "recovery code" flow can be added later.
- **Cost:** Cognito has a large free tier; DynamoDB on-demand + Lambda + HTTP API are pay-per-request and negligible at hobby scale. Consider setting an AWS **Budget alert** ($1–5) for peace of mind.
