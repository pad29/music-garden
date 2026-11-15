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

1. *Design checkpoint (`needs-owner`)* — **open**.
2. *Q1 — what kind of deploy identity?* A) IAM user `mg-deployer` + access key · B) IAM Identity Center
   user + permission set, `aws sso login` — **open**.
3. *Q2 — how narrow?* A) the scoped policy above now · B) `AdministratorAccess` now, narrowing as a
   follow-up ticket — **open**.
4. *Q3 — Polly for `gen-voice.mjs`?* A) add `polly:SynthesizeSpeech` to the deploy identity · B) keep
   Polly on its own identity (a named profile), and change the voice script's instructions — **open**.
5. *Q4 — when to delete the root key?* A) right after the no-op deploy succeeds as the new identity, as the
   ticket says · B) deactivate it then, delete after the first real deploy succeeds — **open**.
