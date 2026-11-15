# TUN-113 — Deploy the backend as a dedicated AWS user, and retire the root access key

Branch `ao/aws-deploy-user/root` · Size **S** (label and section agree) · `needs-owner`

## Plan (Claude)

No code. The deliverable is `backend/README.md` § One-time setup, rewritten for the owner's choices, plus
the owner's console steps. Nothing in AWS is done by a session.

1. **§ One-time setup, step 1** becomes "create the deploy identity" in the chosen kind (Q1), with the
   chosen permissions (Q2) — a policy JSON block in the README to paste into the console's JSON editor —
   and a plain **never create or use a root access key** rule.
2. **Step 3** (`aws configure`) becomes the matching CLI setup — `aws configure` for an IAM user, or
   `aws configure sso` + `aws sso login` for Identity Center — then
   `aws sts get-caller-identity` must show the new identity, never an ARN ending in `:root`.
3. **A new "Moving off the root key" block** for this owner's machine, in this order: create the identity;
   switch the CLI; check the identity; `sam build; sam deploy --confirm-changeset` from `backend/`
   (expect *No changes to deploy*, or the usual `Modify / False` code rows after a `git pull`); only then
   delete the root key (console → account menu → Security credentials → Access keys → Delete), turn on
   root MFA, and check `~/.aws/credentials` and `~/.aws/config` hold no root key.
4. **What the policy covers**, read from `backend/template.yaml` today: CloudFormation on the
   `music-garden` stack and SAM's transform; SAM's managed bucket stack `aws-sam-cli-managed-default`
   and its bucket (`resolve_s3 = true`); IAM roles named `music-garden-*` (create, tag, put/attach
   policies, `PassRole` to Lambda — `CAPABILITY_IAM`); Lambda functions `music-garden-*` (code,
   configuration, reserved concurrency, event-invoke config, permissions, tags); DynamoDB tables
   `music-garden-*` (incl. PITR, deletion protection, TTL for TUN-88's counter); Cognito user pools in
   us-east-1 (IDs are random, so not name-scoped); API Gateway v2 APIs in us-east-1 (same); SNS topics
   `music-garden-*`; SSM parameters under `/music-garden/`; Budgets in this account. Plus what the
   README's own runbook needs: `lambda:InvokeFunction` on `music-garden-cloud-switch` (the status / on /
   off commands), `sns:Publish` on the alarm topic (the rehearsal), reading stack outputs and change
   sets, viewing budgets. Each needs Delete too, so a failed deploy can roll back.
5. **Tests:** none can run AWS. The README is checked by reading it against the template's resource
   types; the owner's no-op deploy is the live check. The PR review checks the policy against
   `template.yaml`.

### What the work showed (inputs to the questions)

- **Polly shares the credentials.** `tools/gen-voice.mjs` calls `aws polly synthesize-speech` with the
  default CLI credentials, "same creds used for `sam deploy`" (its header). A deploy identity without
  `polly:SynthesizeSpeech` breaks voice generation. (`ask.sh` already loads a separate Polly-only IAM
  user from `~/.codex/tunegarden-aws.env` for GPT's test pass; that user is untouched here.)
- **A no-op deploy does not prove a narrow policy.** "No changes to deploy" exercises only the read and
  change-set calls; it never runs `iam:CreateRole`, `lambda:UpdateFunctionCode` and the rest. The first
  real deploy (likely TUN-88's) is the real proof. Deleting the root key first is still safe: the root
  user can always sign in to the console (password + MFA) and widen the policy. A missing permission
  shows up as a deploy that fails and rolls back, with an `AccessDenied` naming the action.
- **A narrow policy is not a hard wall.** Any identity that can create IAM roles, attach policies to them
  and pass them to Lambda can, deliberately, give itself more power through a Lambda. Scoping to
  `music-garden-*` names and us-east-1 still blocks the common abuse of a leaked key — EC2 in every
  region, new IAM users and keys, billing and account closure — but it is not airtight. Closing that
  needs a permissions boundary on the functions' roles, which is a `template.yaml` change: out of scope
  (and TUN-88 is editing it now); a follow-up ticket if wanted.
- **Identity Center needs AWS Organizations.** Account access through IAM Identity Center needs its
  *organization* instance, so enabling it turns this standalone account into an organization's
  management account (free; nothing else changes for the stack).

## Owner's decisions

All answered by the owner, relayed by the orchestrator (music-garden-5), 2026-11-15.

1. *Design checkpoint (`needs-owner`)* — **build it**, with the answers below. No GPT design review (S).
2. *Q1 — what kind of deploy identity?* A) IAM user `mg-deployer` + access key · B) IAM Identity Center
   user + permission set, `aws sso login` — **B**.
3. *Q2 — how narrow?* A) the scoped policy above now · B) `AdministratorAccess` now, narrowing as a
   follow-up ticket — **A**, scoped by resource name `music-garden-*`, so that TUN-88's new counter table
   (PR #147) is covered. The policy must cover everything in `backend/template.yaml` on PR #147's
   branch, because the owner will deploy TUN-88 with the new identity.
4. *Q3 — Polly for `gen-voice.mjs`?* A) add `polly:SynthesizeSpeech` to the deploy identity · B) keep
   Polly on its own identity (a named profile), and change the voice script's instructions — **A**.
5. *Q4 — when to delete the root key?* A) right after the no-op deploy succeeds as the new identity, as the
   ticket says · B) deactivate it then, delete after the first real deploy succeeds — **B**. TUN-88's
   deploy is that real deploy.

## Build (Claude)

- **`backend/README.md` § One-time setup**, rewritten: root MFA; IAM Identity Center (Organizations
  accepted), MFA every sign-in, a user, the `mg-deploy` permission set with the inline policy, the
  assignment; `aws configure sso` to a `mg-deploy` profile, made the default with a user-level
  `AWS_PROFILE`; `aws sso login`; never a root key. A new **Moving off a root access key** block in the
  owner's Q4 B order: no-op deploy → deactivate → first real deploy (TUN-88's) → delete → clean
  `~/.aws/credentials`.
- **The policy** is scoped by name (`music-garden-*`; `/music-garden/` for SSM) and by us-east-1. Cognito
  user pools, HTTP APIs and budgets have random IDs, so they are scoped to this region and account only.
  Players' data is kept out: DynamoDB and Cognito get management actions only, with no item, user or
  `Admin*` actions. `PassRole` goes only to Lambda, and `AttachRolePolicy` only for
  `AWSLambdaBasicExecutionRole`. The account appears as `*` in every ARN, so the public README names no
  account ID. An identity's own policy reaches only its own account unless another account's resource
  policy opens up.
- **Three lines outside § One-time setup** were made false by the change and are corrected: the outputs
  paragraph ("unlike your IAM secret key"), the cost switch ("IAM users of this account, like you"), and
  Notes' "What's secret". This goes beyond the orchestrator's "setup section only", because CLAUDE.md
  § Docs requires fixing drift in the same commit. Each fix is one line, away from TUN-88's sections.
- **`tests/backend-deploy-policy.test.mjs`** (new; `tests/README.md` describes it) parses the README's
  policy and checks it against `template.yaml`. Every resource type maps to the create, update and delete
  actions CloudFormation calls, on the ARN the resource would get. A new type, or a name outside
  `music-garden-`, fails. It also checks SAM's calls, the runbook, Polly, the data exclusions, the
  `PassRole` and `AttachRolePolicy` conditions, and that no account ID appears.
  - Run against **PR #147's `template.yaml`** (TUN-88's counter table with TTL, its inline role policy):
    6/6 pass, in a scratch copy outside the worktree.
  - **Mutations** (scratch copy), each caught: a new `AWS::Events::Rule`; the counter table renamed
    `mg-…`; `UpdateTimeToLive` dropped; `dynamodb:*`; `PassRole` without its condition; Polly dropped;
    role actions on `*`; `PutRolePolicy` dropped.

**What no test can reach:** whether AWS accepts every action name, and whether CloudFormation's handlers
call an API the list misses. Only the owner's deploys show that, which is why the root key goes last.
