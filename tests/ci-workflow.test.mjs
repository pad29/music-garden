// .github/workflows/checks.yml — the syntax check and the suite on every pull request and every push to
// main (TUN-90) — must stay safe to run on a stranger's pull request: triggered by `pull_request`, never
// `pull_request_target` (which runs with the base repository's secrets and a write token); asking only
// to read; using no secrets; checking out without keeping the token; installing nothing; and running
// third-party actions only at a pinned commit, since a tag can be moved to other code. And it must keep
// checking every pull request: both commands, unfiltered, unskipped, a failure failing the job, on a
// Node that can run the suite.
//
// Why a test: the workflow only runs on GitHub, and a loosened one still goes green — nothing on a
// pull request shows that it now hands a fork's code a write token, or that the tests no longer fail it.
// The checker (tests/helpers/ci-workflow.mjs) parses a defined subset of YAML and reports anything
// outside it rather than guessing. Every rule has a mutation below that it must catch.
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./helpers/game-scripts.mjs";
import { parseWorkflow, safetyProblems, workflowProblems, nodeMeetsFloor } from "./helpers/ci-workflow.mjs";

const DIR = join(ROOT, ".github", "workflows");
const read = (f) => readFileSync(join(DIR, f), "utf8").replace(/\r\n/g, "\n");
const REAL = read("checks.yml");

// Replace an anchor that must occur exactly once, so a mutation can never silently not apply.
const swap = (from, to, text = REAL) => {
  assert.strictEqual(text.split(from).length, 2, "anchor occurs once: " + from);
  return text.replace(from, to);
};
const has = (got, want) =>
  assert.ok(got.some((p) => p.includes(want)), `expected a problem containing "${want}", got:\n  ${got.join("\n  ")}`);
const catches = (text, want) => has(workflowProblems(text), want);
const unsafe = (text, want) => has(safetyProblems(text), want);

// A second, harmless workflow: the safety rules hold for every file in .github/workflows/, not only checks.yml.
const OTHER = `name: Other
on:
  pull_request:
permissions:
  contents: read
jobs:
  other:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
        with:
          persist-credentials: false
      - run: echo hello
`;

test("checks.yml runs both commands on every pull request and push to main, safely", () => {
  assert.deepEqual(workflowProblems(REAL), []);
});

test("every workflow in .github/workflows is safe for a fork's pull request", () => {
  const files = readdirSync(DIR).filter((f) => /\.ya?ml$/.test(f));
  assert.ok(files.includes("checks.yml"));
  for (const f of files) assert.deepEqual(safetyProblems(read(f)), [], f);
  assert.deepEqual(safetyProblems(OTHER), [], "the control workflow is safe");
});

test("the parser reads checks.yml as written: triggers, steps, pins and the Node version", () => {
  const { doc, errors } = parseWorkflow(REAL);
  assert.deepEqual(errors, []);
  assert.deepEqual(Object.keys(doc.on), ["pull_request", "push"]);
  assert.deepEqual(doc.on.push.branches, ["main"]);
  const steps = doc.jobs.checks.steps;
  assert.deepEqual(steps.map((s) => s.uses || s.run), [
    "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
    "actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1",
    "node tools/check-syntax.mjs", 'node --test "tests/*.test.mjs"']);
  assert.strictEqual(steps[1].with["node-version"], "24");
});

test("formatting controls: CRLF, and a harmless inline comment, are accepted", () => {
  assert.deepEqual(workflowProblems(REAL.replace(/\n/g, "\r\n")), []);
  assert.deepEqual(workflowProblems(swap("          node-version: 24\n", "          node-version: 24 # npm is not needed\n")), []);
});

// Mutations: the real workflow with one mistake each, and each must be caught.
test("mutation: triggered by pull_request_target or workflow_run instead", () => {
  catches(swap("  pull_request:\n", "  pull_request_target:\n"), "pull_request_target");
  catches(swap("  pull_request:\n", "  pull_request_target:\n"), "not triggered by pull_request");
  catches(swap("on:\n", "on: [workflow_run]\nx:\n"), "workflow_run");
  unsafe(swap("  pull_request:\n", "  workflow_run:\n", OTHER), "workflow_run");
});

test("mutation: a trigger filtered, or the push not to main", () => {
  catches(swap("    branches: [main]\n", "    branches: [dev]\n"), "push to main");
  catches(swap("    branches: [main]\n", "    branches: [main]\n    paths: [js/**]\n"), "push to main");
  catches(swap("  pull_request:\n", "  pull_request:\n    paths: [js/**]\n"), "pull_request is filtered");
  catches(swap("  pull_request:\n", "  pull_request:\n    branches: [main]\n"), "pull_request is filtered");
  catches(swap("  pull_request:\n", "  pull_request:\n    types: [opened]\n"), "pull_request is filtered");
});

test("mutation: a write permission, top-level or in a job, or a job overriding them", () => {
  catches(swap("  contents: read\n", "  contents: read\n  pull-requests: write\n"), "pull-requests: write");
  catches(swap("    runs-on: ubuntu-latest\n", "    runs-on: ubuntu-latest\n    permissions:\n      contents: write\n"), "contents: write");
  catches(swap("    runs-on: ubuntu-latest\n", "    runs-on: ubuntu-latest\n    permissions:\n      contents: read\n"), "sets permissions");
  catches(swap("permissions:\n  contents: read\n", "permissions: write-all\n"), "blanket permissions");
  catches(swap("permissions:\n  contents: read\n", ""), "no top-level permissions");
  unsafe(swap("  contents: read\n", "  contents: write\n", OTHER), "contents: write");
});

test("mutation: quoted keys, flow mappings and bracket access are reported, never passed", () => {
  // GPT's PR review, finding 2: each of these passed the first, regex checker.
  catches(swap("  pull_request:\n", '  "pull_request_target":\n'), "cannot read");
  catches(swap("    runs-on: ubuntu-latest\n", '    runs-on: ubuntu-latest\n    "permissions": {contents: write}\n'), "cannot read");
  catches(swap("    runs-on: ubuntu-latest\n", "    runs-on: ubuntu-latest\n    permissions: {contents: write}\n"), "cannot read");
  catches(swap("      - name: Syntax check\n", '      - "uses": actions/cache@main\n      - name: Syntax check\n'), "cannot read");
  catches(swap("      - name: Syntax check\n", "      - {uses: actions/cache@main}\n      - name: Syntax check\n"), "cannot read");
  catches(swap("        run: node tools/check-syntax.mjs\n", "        run: node tools/check-syntax.mjs\n        env:\n          T: ${{ secrets['DEPLOY'] }}\n"), "uses a secret");
  // The same, in a second workflow.
  unsafe(swap("  pull_request:\n", '  "pull_request_target":\n', OTHER), "cannot read");
  unsafe(swap("      - run: echo hello\n", '      - "uses": actions/cache@main\n', OTHER), "cannot read");
  unsafe(swap("      - run: echo hello\n", "      - {uses: actions/cache@main}\n", OTHER), "cannot read");
  unsafe(swap("      - run: echo hello\n", "      - run: echo ${{ secrets['DEPLOY'] }}\n", OTHER), "uses a secret");
});

test("mutation: other YAML outside the subset is reported explicitly", () => {
  for (const [from, to] of [
    ["name: Checks\n", "name: &n Checks\n"],
    ["name: Checks\n", "---\nname: Checks\n"],
    ["name: Checks\n", "name: Checks\nname: Again\n"],
    ["  contents: read\n", "  <<: {contents: write}\n"],
    ["  contents: read\n", "\tcontents: read\n"],
    ["        run: node tools/check-syntax.mjs\n", '        run: echo "a" # && npm ci\n'],
  ]) catches(swap(from, to), "cannot read");
});

test("mutation: an action on a tag, a branch or a short SHA, in any workflow", () => {
  catches(swap("actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1", "actions/checkout@v7"), "not pinned");
  catches(swap("actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1", "actions/setup-node@main"), "not pinned");
  catches(swap("actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1", "actions/setup-node@949feb2"), "not pinned");
  unsafe(swap("actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1", "actions/checkout@v7", OTHER), "not pinned");
});

test("mutation: a secret, or the job's token, reaches a step", () => {
  catches(swap("        run: node tools/check-syntax.mjs\n", "        run: node tools/check-syntax.mjs\n        env:\n          T: ${{ secrets.DEPLOY }}\n"), "secret");
  catches(swap("        run: node tools/check-syntax.mjs\n", "        run: node tools/check-syntax.mjs\n        env:\n          T: ${{ github.token }}\n"), "token");
});

test("mutation: a checkout keeps the token — set true, commented out, or a second checkout without it", () => {
  // GPT's PR review, finding 3: a commented-out input and a second checkout both passed.
  catches(swap("          persist-credentials: false\n", "          persist-credentials: true\n"), "keeps the token");
  catches(swap("          persist-credentials: false\n", "          # persist-credentials: false\n          fetch-depth: 1\n"), "keeps the token");
  catches(swap("      - name: Syntax check\n", "      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1\n      - name: Syntax check\n"), "keeps the token");
  unsafe(swap("          persist-credentials: false\n", "          fetch-depth: 1\n", OTHER), "keeps the token");
});

test("mutation: a step or job skipped, its failure ignored, or its shell replaced", () => {
  // GPT's PR review, finding 4: `continue-on-error` turns a failed step into a passing job.
  catches(swap("      - name: Tests\n", "      - name: Tests\n        continue-on-error: true\n"), "continue-on-error");
  catches(swap("      - name: Tests\n", "      - name: Tests\n        if: false\n"), "sets if");
  catches(swap("    runs-on: ubuntu-latest\n", "    runs-on: ubuntu-latest\n    continue-on-error: true\n"), "continue-on-error");
  catches(swap("    runs-on: ubuntu-latest\n", "    runs-on: ubuntu-latest\n    if: false\n"), "sets if");
  catches(swap("      - name: Tests\n", "      - name: Tests\n        shell: bash {0} || true\n"), "cannot read");
  catches(swap("      - name: Tests\n", "      - name: Tests\n        shell: sh\n"), "sets shell");
  catches(swap("jobs:\n", "defaults:\n  run:\n    shell: sh\njobs:\n"), "defaults");
});

test("mutation: the concurrency group is not per ref", () => {
  catches(swap("  group: checks-${{ github.ref }}\n", "  group: checks\n"), "concurrency group");
  catches(swap("  group: checks-${{ github.ref }}\n", "  group: checks-${{ github.workflow }}\n"), "concurrency group");
});

test("mutation: a command dropped or changed, or an install step added", () => {
  catches(swap("        run: node tools/check-syntax.mjs\n", "        run: echo skipped\n"), "check-syntax");
  catches(swap('        run: node --test "tests/*.test.mjs"\n', "        run: node --test tests/meter.test.mjs\n"), "tests/*.test.mjs");
  catches(swap("      - name: Syntax check\n", "      - run: npm ci\n      - name: Syntax check\n"), "installs");
  catches(swap("        run: node tools/check-syntax.mjs\n", "        run: |\n          npm ci\n          node tools/check-syntax.mjs\n"), "installs");
  catches(swap("        run: node tools/check-syntax.mjs\n", "        run: |\n          node tools/check-syntax.mjs\n          true\n"), "does not run: node tools/check-syntax.mjs");
});

test("mutation: Node unstated, or below the suite's floor (registerHooks: 22.15 / 23.5)", () => {
  catches(swap("          node-version: 24\n", ""), "not stated");
  for (const v of ["20", "21", "22.14.0", "22.14", "23.0.0", "23.4", "lts/*", "latest"]) {
    catches(swap("          node-version: 24\n", `          node-version: ${v}\n`), "below the suite's floor");
  }
  for (const v of ["22", "22.15", "22.15.0", "23", "23.5.0", "24", "24.0.0", "25"]) assert.ok(nodeMeetsFloor(v), v);
});
