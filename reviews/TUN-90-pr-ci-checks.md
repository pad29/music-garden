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
- **Node 24** — the owner's version (24.15). The suite's floor is Node 21: `node --test` takes a glob
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
  installed, Node stated and ≥ 21. The trigger and pinning rules hold for every file in
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
