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
