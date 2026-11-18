# TUN-90 — Run the syntax check and the tests on every pull request

Branch `ao/pr-ci-checks/root` · PR #150

## Plan (Claude)

- **One workflow, `.github/workflows/checks.yml`**, named *Checks*, job *syntax and tests*: on
  `pull_request` (never `pull_request_target`) and on `push` to `main`. `ubuntu-latest`;
  `permissions: contents: read` at the top level; no secrets, no install step. Steps: checkout
  (`persist-credentials: false`), setup-node, `node tools/check-syntax.mjs`,
  `node --test "tests/*.test.mjs"`. A `concurrency` group per ref cancels a superseded run on the same PR;
  `timeout-minutes` stops a hung suite (it takes ~4 min on the owner's machine).
- **Actions pinned to commits**, the tag in a comment: `actions/checkout` v7.0.1 `3d3c42e5…`,
  `actions/setup-node` v7.1.0 `949feb24…` (full SHAs in the file).
- **Node 24** — the owner's version (24.15). The suite's floor is Node 21 (wrong: 22.15 / 23.5 — PR review 1, finding 1): `node --test` takes a glob
  only from 21 on; 22 is the oldest LTS that has it.
- **The suite on Linux**, found by the first run: `tests/workflow-scripts.test.mjs` runs the workflow
  scripts under the runner's own `bash` with fake `ao`, `gh`, `sleep` and `codex` first on PATH, so no
  real tool is needed. One test there is Windows-only by design (*a busy directory blocks removal only
  on Windows*) and is skipped on Linux with that reason printed in the run's output — the only skip.
  Anything else the first run turns up is fixed in the test and recorded here.
- **The failing-check demo**: one commit adds a deliberately failing test, the run goes red on the PR,
  the next commit removes it; both run links recorded here.
- **Docs**: `README.md` — the badge under the title and a line in § Dev workflow we use; `AGENTS.md` §
  Commands — one line saying CI runs both commands. Minimal, localized edits: parallel workers touch
  both files.
- **Tests**: the workflow itself is the test — its runs on this PR, green and deliberately red.

## Build

- **Added a guard, `tests/ci-workflow.test.mjs`** (not in the plan): the workflow only runs on GitHub,
  and a loosened one still goes green, so a text checker pins the safety rules — no
  `pull_request_target` / `workflow_run`, exactly `contents: read`, no job-level override, no secrets or
  job token, `persist-credentials: false`, every action at a 40-hex commit, both commands run, nothing
  installed, Node stated and ≥ 21 (wrong — PR review 1, finding 1). The trigger and pinning rules hold for every file in
  `.github/workflows/`. Each rule has a mutation it must catch; writing them caught two bugs in the
  checker itself (`^\s+` spanning a newline read the top-level `permissions:` as a job override; a
  `- run:` step was invisible).
- **First Linux run** — [run 44245608942](https://github.com/pad29/music-garden/actions/runs/44245608942),
  Ubuntu, Node 24.22.2: syntax OK; 925 tests, 924 pass, 0 fail, **1 skipped, with its reason printed**:
  *gpt-lock: a release that cannot remove the lock exits 1…* — `# a busy directory blocks removal only
  on Windows`. Nothing needed fixing for Linux: `workflow-scripts.test.mjs` found the runner's `bash`,
  and its fake `ao`, `gh`, `sleep` and `codex` stood in for the real tools; `ask.sh`'s only other
  dependency is `node`, `gpt-lock.sh`'s `cygpath` is behind a Windows check. ~1m50s for the job.
- **The red check** — commit `f21d6c0` added `tests/ci-deliberate-failure.test.mjs`
  (`assert.strictEqual(1, 2)`); [run 44245882827](https://github.com/pad29/music-garden/actions/runs/44245882827)
  failed (926 tests, 1 fail, exit code 1) and PR #150 showed *Syntax check and tests — fail*. Commit
  `6674ab6` removed it.

## Owner's decisions

1. *Round 3's two Low fixes (`30f8e96`) are unreviewed, and the review loop has used its three rounds.
   Accept them as they are, or run a fourth GPT review?* — **B**. Claude would accept them: both
   findings were Low, I agreed with both, the fixes are one regex flag and four test cases, and a
   mutation shows the new test catches the bug. A fourth round costs about 550k tokens of the ChatGPT
   limit.

   **Answered B — run a fourth GPT review**: the owner, through the orchestrator (music-garden-5), 2026-11-18. Claude had recommended A.

## PR review (Astra, via ask.sh)

### Round 1 — head `7c5e987` — changes requested

<details><summary>GPT's review, verbatim</summary>

**Changes required**

1. **Medium — [tests/ci-workflow.test.mjs:22](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-37/tests/ci-workflow.test.mjs:22): the Node floor is incorrect.** Existing tests import `node:module.registerHooks`, introduced in **22.15.0 / 23.5.0**. The guard accepts `21`, `22.14.0`, and `23.0.0`, although those cannot run the suite. Keep Node 24; correct the validation, workflow comment at line 32, and review record’s floor claims. Document the requirement near the test command. [Node API documentation](https://nodejs.org/api/module.html#moduleregisterhooksoptions).

2. **Medium — [tests/ci-workflow.test.mjs:26](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-37/tests/ci-workflow.test.mjs:26): the safety checker silently accepts unsafe YAML forms.** Independently adding `"pull_request_target":`, job-level `"permissions": {contents: write}`, `- "uses": actions/cache@main`, or `${{ secrets['DEPLOY'] }}` produces **no problems**. Flow-style action steps also bypass pin checking. This contradicts the stated “what it cannot read it reports” contract. Validate a defined YAML subset structurally and reject unsupported constructs, including in additional workflow files. Quoted `"on":` currently fails closed; quoted dangerous keys do not.

3. **Medium — [tests/ci-workflow.test.mjs:59](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-37/tests/ci-workflow.test.mjs:59): checkout protection can be satisfied by a comment.** Changing the input to `# persist-credentials: false` still passes, while checkout defaults to retaining credentials. Adding a second checkout without that input also passes. Require an active `persist-credentials: false` input on **each checkout step**, rather than searching the entire document for the string.

4. **Medium — [tests/ci-workflow.test.mjs:49](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-37/tests/ci-workflow.test.mjs:49): the guard does not establish that checks run and failures fail.** Adding `continue-on-error: true` or `if: false` to Tests passes unchanged. Adding `paths` filters under either trigger also passes, violating “every pull request / every push to main.” Validate trigger restrictions and the enclosing jobs/steps, including conditions and failure handling. GitHub explicitly allows a failed step to produce a passing job with `continue-on-error`. [Workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepscontinue-on-error).

**Missing tests**

- Reject Node `21`, `22.14.0`, and `23.0.0`; accept the supported version policy.
- Reject each quoted-key, flow-mapping, and bracket-access bypass above, both in `checks.yml` and an additional workflow.
- Reject commented-out credential protection and a second checkout with default credential persistence.
- Reject skipped required steps, ignored failures, and PR/main path filters.
- Reject a constant concurrency group: replacing the current group with `checks` presently passes the guard and permits unrelated runs to cancel each other.
- Add formatting controls: CRLF must remain accepted; a harmless inline comment such as `node-version: 24 # npm is not needed` must not be classified as an install step. Unsupported YAML forms must produce explicit errors.

Verification: syntax and all 12 existing guard tests passed; the bypasses were reproduced in memory. No files changed. Full-suite execution was not repeated in this read-only environment; live CI logs could not be independently retrieved.

</details>

**My answers** — I agreed with all four findings and every missing test:

1. **Medium — Node floor wrong. Agreed.** `registerHooks` from `node:module` is imported by
   `backend-presignup.test.mjs`, `game-scripts-hook-review.test.mjs` and
   `helpers/questsetup-mutation-hook.mjs`; I had looked for newer APIs and missed it. The checker's
   `nodeMeetsFloor` now requires 22.15+ or 23.5+ (a bare major means its latest release, as setup-node
   installs); the workflow comment, `AGENTS.md` § Commands (next to the test command) and
   `tests/README.md` say so.
2. **Medium — quoted keys, flow mappings, bracket access passed silently. Agreed.** The regex checker is
   replaced by `tests/helpers/ci-workflow.mjs`: a parser for a defined YAML subset that reports everything
   outside it (quoted or complex keys, flow mappings, anchors, aliases, merge keys, tags, tabs, document
   markers, duplicate keys, an inline comment after a quoted value), and checks the rules on the parsed
   structure. Secrets are found in any `${{ }}` naming `secrets`, bracket access included, and a
   `secrets:` key. The safety rules apply to every workflow file.
3. **Medium — `persist-credentials` satisfied by a comment; a second checkout passed. Agreed.** Each
   `actions/checkout` step must carry `with: persist-credentials: false`, in every workflow.
4. **Medium — `continue-on-error`, `if: false`, path filters passed. Agreed.** `pull_request` must be
   unfiltered; `push` exactly `branches: [main]`; no job or step `if`, `continue-on-error`, `shell`; no
   job `permissions`, `defaults`, `strategy`, `uses`; no workflow `defaults`. I added `shell` and
   `defaults` myself — both can swallow a failing exit status.

Missing tests — all added in `tests/ci-workflow.test.mjs`: Node 20, 21, 22.14(.0), 23.0.0, 23.4,
`lts/*`, `latest` rejected and 22, 22.15(.0), 23, 23.5.0, 24, 25 accepted; each quoted-key, flow-mapping
and bracket-access bypass in `checks.yml` and in a second workflow; a commented-out and a missing
`persist-credentials`, and a second checkout; skipped steps and jobs, ignored failures, PR and main path
filters; a constant (and a per-workflow) concurrency group; CRLF accepted and
`node-version: 24 # npm is not needed` not an install; other unsupported YAML reported explicitly.
16 tests, up from 12.

### Round 2 — head `3f65d57` — changes requested

<details><summary>GPT's review, verbatim</summary>

**Changes required**

The original bypasses are now rejected, and the Node floor is corrected. However, the following new mutations return **no problems**.

1. **Medium — [tests/helpers/ci-workflow.mjs:34](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-37/tests/helpers/ci-workflow.mjs:34): block scalars swallow sibling step fields.** Adding this step passes both validators:
   ```yaml
         - name: |
             Cache
           uses: actions/cache@main
   ```
   The parser stores `uses:` inside `name`, hiding the unpinned action. A pinned checkout without credential protection is hidden identically. Determine scalar boundaries from the mapping/content indentation, including mappings opened after `-`, or explicitly reject these forms.

2. **Medium — [tests/helpers/ci-workflow.mjs:43](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-37/tests/helpers/ci-workflow.mjs:43): double-quoted escapes are decoded incorrectly.** `T: "${{ se\u0063rets.DEPLOY }}"` passes both validators. YAML decodes this to `${{ secrets.DEPLOY }}`, while the checker produces `seu0063rets`. It also accepts invalid escapes such as `"bad\q"` without errors. Implement the supported [YAML escape semantics](https://yaml.org/spec/1.2.2/#57-escaped-characters), or reject escapes explicitly.

3. **Medium — [tests/helpers/ci-workflow.mjs:69](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-37/tests/helpers/ci-workflow.mjs:69): a job named `__proto__` disappears from validation.** Appending that job with `contents: write` and `uses: actions/cache@main` passes both validators. Assignment changes the JavaScript object's prototype, and subsequent `Object.entries()` calls omit the job. This is a valid [GitHub job identifier](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_id). Store mappings in null-prototype objects or otherwise preserve every key as an own property.

4. **Medium — [tests/helpers/ci-workflow.mjs:135](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-37/tests/helpers/ci-workflow.mjs:135): alternate expression spellings bypass secret/token protection.** Both `${{ SECRETS.DEPLOY }}` and `${{ github['token'] }}` pass in either workflow. GitHub's expression parser resolves context names [case-insensitively](https://github.com/actions/runner/blob/main/src/Sdk/DTExpressions2/Expressions2/ExpressionParser.cs), and contexts support [index access](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#about-contexts). Account for these forms or reject unsupported expressions.

5. **Medium — [tests/helpers/ci-workflow.mjs:196](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-37/tests/helpers/ci-workflow.mjs:196): job-level concurrency bypasses the cancellation guard.** Adding `concurrency:`, `group: constant`, and `cancel-in-progress: true` under `jobs.checks` passes unchanged. Unrelated PR jobs can consequently cancel each other despite the safe workflow-level group. Validate or forbid [job-level concurrency](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idconcurrency).

6. **Medium — [tests/helpers/ci-workflow.mjs:209](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-37/tests/helpers/ci-workflow.mjs:209): required commands can check the wrong revision.** Adding `ref: main` to checkout's `with:` passes. A failing PR can then receive a green result from testing `main`; checkout explicitly supports this [ref override](https://github.com/actions/checkout/blob/main/action.yml). Require the checkout feeding the checks to use the event's revision and repository, rejecting unrelated overrides.

7. **Medium — [tests/helpers/ci-workflow.mjs:140](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-37/tests/helpers/ci-workflow.mjs:140): additional workflows need not restrict permissions.** Removing `permissions` from the additional-workflow fixture passes `safetyProblems()`. Such workflows inherit repository/organization defaults, which may grant writes; only `checks.yml` requires an explicit restriction. Validate effective read-only permissions for every workflow/job instead of accepting absence unconditionally. [GitHub permissions documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions).

8. **Low — [tests/helpers/ci-workflow.mjs:216](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-37/tests/helpers/ci-workflow.mjs:216): descriptive text is mistaken for installation.** Changing only the workflow name to `Checks without npm` fails with `installs something: .name`. Scope installation detection to executable configuration rather than every string and key.

**Missing tests**

- In both workflow fixtures, reject unpinned actions and unprotected checkouts following a `- name: |` or `- name: >`; verify sibling fields remain separate.
- Reject Unicode-escaped secret expressions and invalid escapes; verify supported escapes decode correctly.
- Validate an actual `__proto__` job, including its permissions and actions.
- Reject uppercase/mixed-case secret contexts and bracket-access job tokens.
- Reject constant job-level concurrency groups, even with valid workflow-level concurrency.
- Reject checkout overrides that test `main` or an unrelated repository.
- Reject additional workflows whose effective permissions remain unrestricted.
- Accept harmless package-manager words in workflow/step names.
- Add the round-1 quoted job-permissions mutation to the **additional-workflow** fixture; it is caught manually but remains absent from that fixture's tests.

Verification: syntax, all 16 guard tests, and diff whitespace checks passed. Mutations ran in memory; no files changed. Full-suite execution was not repeated. Live CI results could not be independently retrieved because GitHub CLI configuration access was denied.

</details>

**My answers.** I agreed with all eight findings and every missing test. Patching each bypass would only
invite the next one, so the checker now fails closed:

1. **Medium — a block scalar swallowed its step's sibling fields. Agreed.** The scalar's content is
   now what is indented past the *key's* column. For `- name: |`, that is the column of `name`, not of
   the dash.
2. **Medium — double-quoted escapes were decoded wrongly. Agreed; escapes are rejected, not
   implemented.** Any backslash in a double-quoted value is reported. The workflow needs none, and
   implementing YAML's escape table is more surface than it is worth.
3. **Medium — a `__proto__` job vanished. Agreed.** Mappings are now null-prototype objects.
4. **Medium — `SECRETS.X` and `github['token']` passed. Agreed, and taken further.** Every `${{ }}`
   expression, and every `if:`, must be a plain property path. Anything else is reported as unreadable:
   index access, function calls such as `toJSON(github)` (which would print the token) and operators.
   `secrets.*` and `github.token` are matched in any letter case, and so is `GITHUB_TOKEN`.
5. **Medium — job-level concurrency was unchecked. Agreed.** `checks.yml` now uses allowlists. The
   workflow may set only `name`, `on`, `permissions`, `concurrency` and `jobs`. A job may set only
   `name`, `runs-on`, `timeout-minutes` and `steps`. The allowlists also catch `env` (for example
   `NODE_OPTIONS`) at the workflow, job or step level, which I added myself.
6. **Medium — `ref: main` would test the wrong revision. Agreed.** Exactly one checkout step,
   whose only input is `persist-credentials`, and exactly one setup-node step, whose only input is
   `node-version` (so no `cache:`). No other actions, and no `run` steps but the two checks.
7. **Medium — other workflows did not have to restrict permissions. Agreed.** Every workflow must set
   top-level `permissions` or set them on every job. I also added a rule that every workflow runs on
   a GitHub-hosted runner: a self-hosted one would run a fork's code on the owner's machine.
8. **Low — "Checks without npm" read as an install. Agreed.** Install detection now looks only at
   `run` commands.

Missing tests: every case listed was added, 24 tests, up from 16:
- `- name: |` and `>` followed by an unpinned action, and by an unprotected checkout, in both
  workflows, with sibling fields shown to stay separate;
- `\u0063` and `\q` rejected, and plain double-quoted and `''`-escaped single-quoted values still read;
- a real `__proto__` job with a write permission and an unpinned action;
- mixed-case `secrets` and `GitHub.Token`, `github['token']`, `toJSON(secrets)`, `toJSON(github)`,
  a bare `github`, `if: SECRETS.X` and `env.Github_Token` rejected, and `github.sha` accepted;
- a constant job-level concurrency group;
- `ref: main`, `repository:`, `cache: npm`, an extra `git checkout main` step, an extra action, and
  `env: NODE_OPTIONS` at step and workflow level;
- the other workflow without permissions rejected, but accepted when every job restricts its own;
  its quoted job permissions; a self-hosted runner;
- package-manager words in workflow and step names accepted.

`secrets['DEPLOY']` (round 1's case) is now reported as an unreadable expression, not as a secret. It
is still rejected; the test's expected message changed.

### Round 3 — head `e46fe8d` — changes requested (two Low)

<details><summary>GPT's review, verbatim</summary>

**Changes required**

The eight round-2 bypasses are rejected, and the real `checks.yml` passes. Two low-severity issues remain.

1. **Low — [tests/helpers/ci-workflow.mjs:199](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-37/tests/helpers/ci-workflow.mjs:199): checkout recognition is case-sensitive.** In `OTHER`, change `actions/checkout@…` to `Actions/Checkout@…` and remove its `with:` block: `safetyProblems()` returns `[]`. GitHub repository names are [case-insensitive](https://docs.github.com/en/rest/repos/repos#get-a-repository), and this checkout defaults to [persisting credentials](https://github.com/actions/checkout/blob/3d3c42e5aac5ba805825da76410c181273ba90b1/action.yml). Match the checkout repository case-insensitively or explicitly reject alternate casing. This affects additional workflows; `checks.yml`’s action allowlist rejects it.

2. **Low — [tests/ci-workflow.test.mjs:188](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-37/tests/ci-workflow.test.mjs:188): one explicitly requested regression case remains missing.** The unprotected checkout following `- name: |` or `>` is tested only against `OTHER`. Add both variants against `REAL`, asserting the credential-protection diagnostic. They are rejected manually, but the [review record’s claim that both fixtures cover them](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-37/reviews/TUN-90-pr-ci-checks.md:181) is currently false.

**Missing tests**

- Additional workflow: pinned `Actions/Checkout` without `persist-credentials: false` must be rejected.
- Real workflow: unprotected pinned checkout following each of `- name: |` and `- name: >` must report missing credential protection.

Verification: syntax, all 24 guard tests, and diff whitespace checks passed. Mutations ran in memory; no files changed. Full suite not repeated. Live CI results remain unverified: GitHub CLI configuration access was denied, and web retrieval failed.

</details>

**My answers** — I agreed with both:

1. **Low — checkout recognized case-sensitively. Agreed.** `actions/checkout` and `actions/setup-node`
   are now matched case-insensitively, as GitHub resolves owner and repository names. Without the `/i`
   flag, the new test fails.
2. **Low — the `- name: |` / `>` unprotected-checkout case was missing against the real workflow.
   Agreed:** my round-2 note above claimed both fixtures were covered, and that was false. It is now
   tested against `checks.yml` for both styles, so the claim holds.

Missing tests: both added — a pinned `Actions/Checkout` without `persist-credentials: false`, in the
other workflow (with and without a `with:` block) and in `checks.yml`; and the unprotected checkout
after `- name: |` and `- name: >` in `checks.yml`. 25 tests, up from 24.

**The review loop stops here** (`work-ticket` § 8: three rounds). These fixes have not been reviewed; the
decision is the owner's.
