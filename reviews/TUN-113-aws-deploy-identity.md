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
6. *After review round 3 (Needs Input) — accept, or a fourth GPT review?* **B, a fourth review** of the
   four round-3 fixes: the owner, relayed by the orchestrator, 2026-11-15.
7. *TUN-88 was deployed with the root key* (the owner, 2026-11-15, before setting up `mg-deploy`), so
   the first real deploy as `mg-deploy` is still to come. The README's order is now: set up, then
   redeploy `main` as `mg-deploy`, deactivate, and delete the root key after a deploy that applied
   changes. The orchestrator asked which redeploy I recommend. My first answer (`c5d1713`): redeploy
   `main` after a pull, counting on its usual code-update rows. Round 4 showed that wrong (below).
   **Now:** redeploy `main` with a fresh `--s3-prefix`. Every function's code location changes, so it
   is a real deploy that proves upload, change-set execution, function code updates and the cost
   switch's invocation, but not creates, deletes, rollback, or the rows that only follow from the
   functions.

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

## PR review (temporarily GPT through `ask.sh`, Astra)

Round 1, on `bd2130b` — **CHANGES REQUESTED**. GPT's opening: *"I found **no confirmed missing deployment
permission in the current policy**. PR #147's changes appear covered. That is not a guarantee"*. It
checked the SNS handler schemas and SAM's source directly, and inferred the rest, marking each row as
inference. It found no invented action name, and judged the conditions valid.

1. **High — `lambda:*` lets the identity invoke the player functions directly.** *"Their handlers trust
   `event.requestContext.authorizer.jwt.claims.sub`; a direct Lambda caller supplies that event without
   passing through the JWT authorizer. I verified locally with a stub database that a fabricated `sub`
   returns HTTP 200 and reads that player's progress."* **Agreed.** Fixed in the opposite direction from
   GPT's suggestion. GPT suggested listing the Lambda management actions. I added a `Deny` on
   `lambda:Invoke*` with `NotResource` set to the cost switch, so management stays `lambda:*` (no handler
   call to miss) and invoking anything else is refused. The README now says why.
2. **Medium — the test did not evaluate conditions** (removing the region conditions, or pinning
   `Functions` to another region, still passed). **Agreed.** The test now evaluates `StringEquals` and
   `ArnEquals` on the three keys the policy uses, with a context per request, and reports any other
   operator or key. Mutation cases cover all three.
3. **Medium — the resource extraction was a regex that silently dropped what it couldn't read** (a quoted
   `Type` vanished). **Agreed on fail-closed; disagreed on sharing `backend-template.test.mjs`'s parser.**
   That file is being edited by TUN-88 (PR #147), and extracting its parser means touching it. Instead,
   the reader now reports any resource without exactly one readable `Type`, accepts quotes, and reports
   names that are not literals (`!Sub`, block form) and explicit function roles. Each case has a mutation
   test, plus a harmless-quoting case that must stay clean.
4. **Medium — the test checked only its author's list; SNS subscription calls authorize against the
   topic; change-set calls against the stack; lifecycle reads missing.** **Agreed, except the "sourced,
   versioned operation table".** SNS calls are now checked on the topic. Change-set calls are checked on
   both the stack and the change-set ARN (the policy allows both). `NEEDS` adds the topic read handler's
   calls, role, function and event-invoke reads, API tag paths, DynamoDB reads, budget tags, and SAM's
   bucket creation. The claims in `tests/README.md` and the test's header now say `NEEDS` is a model, not
   proof. A sourced, versioned table of every handler call is more than an S ticket should carry. The
   owner's deploy is the real check, and the README says how to repair a refusal. (The Build section
   above overstates this: read "the actions in `NEEDS`".)
5. **Medium — the README overstated region, account and data claims.** **Agreed on the wording;
   disagreed on adding an S3 location condition.** The README now says IAM, S3 and Budgets are global,
   what `*` for the account does and doesn't limit, and that the identity can turn off deletion
   protection and delete the player stores. No S3 region condition: the SAM bucket already exists, a
   look-alike bucket elsewhere holds nothing, and a wrong condition is one more way for the first real
   deploy to fail. The account ID stays out of the README, as the ticket requires.
6. **Medium — Windows credential precedence and cleanup.** **Agreed.** The README now sets `AWS_PROFILE`
   in the current shell too, checks and clears key variables in the Process, User and Machine scopes,
   says to reopen terminal apps, checks the identity in the deploy shell, names TUN-88 as the real deploy,
   and searches for every copy of the key ID (CSV downloads, scripts, `.env`, PowerShell history).
7. **Medium — recovery when the rollback fails** (`UPDATE_ROLLBACK_FAILED`). **Agreed.** Added
   `describe-stack-events`, the status check, and `continue-update-rollback` until
   `UPDATE_ROLLBACK_COMPLETE`.
8. **Low — wording.** **Agreed** on "no key is stored" (now: no long-term access key; temporary
   credentials are cached), on Deploy's "us-east-1 (or your choice)", and on Organizations' free-plan
   catch. **Deferred:** `backend/template.yaml:99`'s comment calls the owner an "IAM user". The
   orchestrator put `template.yaml` off-limits while TUN-88 edits it, so it goes to a follow-up.

Missing tests GPT listed:
- Added: invocation scope; mandatory conditions; the unusable-region grant; a quoted type and a missing
  type; non-literal names and an explicit role; SNS on the topic; change sets on the stack; lifecycle
  removals (role reads, budget tags, API tags, TTL, the topic read handler); SAM bucket creation; an
  unknown service prefix; the size limit; an account ID.
- **Not added:** "an invented action such as `iam:NoSuchAction` fails". There is no catalog of real
  action names here, so the test checks the format and the service prefix only. "Matching-prefix S3
  creation outside the permitted region": no such condition, per 5. "A retained PR #147 fixture": once
  PR #147 merges, its template is `main`'s, and a frozen copy would go stale. Its table, TTL and
  role-policy calls are in `NEEDS`, and the test passes against PR #147's template (scratch copy).

**871 tests pass** (the policy test: 26, of which 22 are mutation cases).

Round 2, on `b9cd600` (the delta from `bd2130b`) — **CHANGES REQUESTED**. *"I found no confirmed
deployment failure caused by the invocation deny."* GPT **accepted** the Deny/`NotResource` fix, not
sharing the parser, dropping the versioned handler table, no S3 location condition, the deferred template
comment, no invented-action detector and no frozen PR #147 fixture. It did **not accept** checking
CloudFormation calls against both ARN kinds (finding 3).

1. **Medium — the reader still isn't fail-closed.** *"`prop()` still recognizes only unquoted keys at
   exactly six spaces. Unrecognized properties become 'absent,' and the checker substitutes generated
   names."* Its examples: a quoted `"TableName"`, deeper property indentation, a quoted `"Role"`, and a
   permission's `FunctionName: other`. **Agreed.** The reader now reads each map level structurally
   (`mapOf`): plain or quoted keys at the level's own indentation, and any other line at that level is an
   error. A permission's `FunctionName` must be a literal in the prefix, or a `!Ref` / `!GetAtt …Arn` of a
   function in the template, and its checks use that function's ARN.
2. **Medium — conditions.** *"`ArnEquals` uses literal equality. AWS permits wildcards in `ArnEquals`"*;
   a policy with `Admin*` added passed. Also, the early return on a missing key skipped validating later
   operators. **Agreed.** `ArnEquals` and `ArnLike` now glob, and every statement's operators and keys
   are validated before any evaluation.
3. **Medium — "Checking CloudFormation actions against both ARN kinds preserves the incorrect
   authorization model."** **Agreed.** Change-set calls are now checked on the two stacks only. The
   policy keeps its `changeSet/*` grant as harmless belt-and-braces, and a test proves dropping it
   reports nothing.
4. **Medium — "Root-key cleanup remains incomplete"** (hidden files, `credentials.bak`,
   `.bash_history`, `AWS_SHARED_CREDENTIALS_FILE`, suppressed errors). **Agreed.** The search now covers
   all of `~/.aws` and the files the two variables point to (all scopes). It also covers the home
   folder's own files, Downloads, Desktop, Documents and the history folder, hidden files included. It
   reports what it couldn't read, and says plainly it is a partial search. It also says to remove the
   matching line or profile, deleting a whole file only for the key's own download.
5. **Low — the 32,768-byte limit and size tests.** **Agreed:** both limits are checked in bytes and
   tested at their boundaries.
6. **Low — "'Within those' incorrectly implies stack-membership enforcement."** **Agreed:** the README
   now says the grants go by name, not by stack.

Missing tests GPT listed, all added: quoted keys and deeper indentation (reported or read correctly),
an unrelated, missing or `!Sub` permission target, `ArnEquals` with `Admin*`, an unsupported operator
after a failing supported one, an unsupported key, an evaluator matrix, change sets (dropping the extra
grant passes; dropping either stack fails), independent removals, and both size limits.

**891 tests pass** (the policy test: 46). The test also passes against PR #147's template, in a scratch
copy.

Round 3, on `41d14b0` (the delta from `b9cd600`) — **CHANGES REQUESTED**. GPT confirmed round 2's
findings 3, 5 and 6 fixed, and 1, 2 and 4 partly fixed. It probed the PowerShell on Windows PowerShell 5.1,
read-only. Its words: *"both arrays reach `Select-String`, null entries are filtered, and `-ErrorVariable`
captures errors with `-ErrorAction SilentlyContinue`."*

1. **Medium — "Inline `Properties` maps still disappear."** `Properties: {TopicName: unrelated}` and an
   inline `Role` passed. **Agreed.** Inline `Properties` content is now an error ("write them as a block
   map"). Two mutation cases cover it.
2. **Medium — "ARN conditions use whole-string globbing instead of ARN-component matching."**
   `arn:aws:iam::*AWSLambdaBasicExecutionRole` passed. **Agreed.** `ArnEquals` and `ArnLike` now match
   the six components separately, and an operand that is not a six-part ARN is reported. There is a
   mutation case, and matrix cases for valid in-component wildcards.
3. **Medium — "Alternate credential paths are interpreted as wildcard patterns."** **Agreed, and
   confirmed.** On a scratch fixture (Windows PowerShell 5.1), plain `Test-Path` returned `False` for an
   existing `…\[work]\credentials`. Step 7 now uses `-LiteralPath`, and lists configured or expected
   paths it cannot find. Re-run on the fixture, it found the key in the `[work]` file, a hidden file and a
   `.bak`, and reported both missing paths. PowerShell 7 is not installed here: not verified on 7.
4. **Medium — "Removing only the matching line can leave the root secret behind."** **Agreed.** Step 7
   now says to remove the whole credential: the ID line, its secret and any token. In `credentials` that
   is the profile block, and in history, every command that set either value. Other credentials stay.

Missing tests GPT listed:
- Added: inline `Properties` with an out-of-prefix name; inline `Properties` with a role; the shortened
  ARN operand, plus valid in-component wildcards.
- **Not added as repository tests:** the PowerShell cases, a bracket path searched literally, an
  unreadable path reported, and the credential-pair removal. The suite runs Node, not the README's
  PowerShell, and the removal is the owner's manual edit. The search was checked once on a 5.1 fixture
  (above); the pair removal is an instruction, not code.

**This was the third review round** (`work-ticket` § 8): the fixes are pushed without a fourth review,
and the PR stops at Needs Input.

**894 tests pass** (the policy test: 49). The test also passes against PR #147's template, in a scratch
copy.

Round 4 (the owner's extra review), on `c5d1713`: the round-3 fixes (`41d14b0..b54cc74`) and the
root-key order commit — **CHANGES REQUESTED**. *"All four round-3 fixes are accepted."* GPT also
accepted not adding PowerShell repository tests: *"this change does not warrant introducing a PowerShell
harness. PowerShell 7 remains unverified."* It checked the policy test against the merged template:
dropping `UpdateTimeToLive` or `PutRolePolicy`, or renaming the counter table, is reported.

1. **Medium — "A fresh pull does not reliably produce a code deployment."** SAM's upload key is *"a
   checksum of relative filenames and file contents … File timestamps do not participate."*
   **Agreed, and confirmed** in the installed SAM CLI: `samcli/lib/utils/hash.py` `dir_checksum` hashes
   each file's relative path and content checksum, and `samcli/lib/package/utils.py` uses it as the
   upload key. Step 3 now redeploys with a fresh `--s3-prefix`, which changes every function's code
   location without touching the template. That is not saved to `samconfig.toml`. The § Future deploys
   table row that blamed timestamps (it predates this PR) is corrected too.
2. **Medium — "The listed `Modify` rows do not prove all the claimed update permissions."** Rows that
   follow from a reference may not call their service. **Agreed.** Step 3 now claims only upload,
   change-set execution, function code updates and the cost switch's invocation. It says the rows that
   follow from the functions, creates, deletes and rollback are untested.

Missing tests: none in the repository. The owner-run case GPT asked for (a fresh-prefix redeploy, then
record what ran) is step 3 and the hand-off checklist.
