# TUN-90 — Run the syntax check and the tests on every pull request

Branch `ao/pr-ci-checks/root` · PR (pending)

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
