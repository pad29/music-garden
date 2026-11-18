// .github/workflows/checks.yml — the syntax check and the suite on every pull request and every push to
// main (TUN-90) — must stay safe to run on a stranger's pull request: triggered by `pull_request`, never
// `pull_request_target` (which runs with the base repository's secrets and a write token); asking only
// to read; using no secrets; installing nothing; and running third-party actions only at a pinned commit,
// since a tag can be moved to other code. And it must keep running both commands on a Node that can.
//
// Why a test: the workflow only runs on GitHub, and a loosened one still goes green — nothing on a
// pull request shows that it now hands a fork's code a write token. The checker reads the file as text
// (no YAML parser: the suite has no dependencies), so it is strict: what it cannot read it reports.
// Every rule has a mutation below that it must catch.
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./helpers/game-scripts.mjs";

const DIR = join(ROOT, ".github", "workflows");
const read = (f) => readFileSync(join(DIR, f), "utf8").replace(/\r\n/g, "\n");
const REAL = read("checks.yml");

// The suite's floor: `node --test` takes a glob ("tests/*.test.mjs") only from Node 21 on.
const NODE_FLOOR = 21;
const SHA_PIN = /^[\w.-]+\/[\w./-]+@[0-9a-f]{40}(?:\s+#.*)?$/;

/** What makes any workflow unsafe for a fork's pull request. */
function safetyProblems(text) {
  const out = [];
  const lines = text.split("\n").map((l) => l.replace(/^\s*-?\s*/, "")).filter((l) => !l.startsWith("#"));
  for (const t of ["pull_request_target", "workflow_run"]) {
    if (new RegExp(`(^|[\\s\\[,{])${t}\\b`).test(lines.join("\n"))) out.push(`trigger ${t} runs with secrets and a write token`);
  }
  for (const l of lines) {
    const m = l.match(/^uses:\s*(.+)$/);
    if (!m) continue;
    const ref = m[1].trim().replace(/^["']|["']$/g, "");
    if (ref.startsWith("./")) continue;
    if (!SHA_PIN.test(ref)) out.push(`action not pinned to a commit: ${ref}`);
  }
  if (/\$\{\{\s*secrets\./.test(text)) out.push("uses a secret");
  if (/\bGITHUB_TOKEN\b|\bgithub\.token\b/.test(text)) out.push("uses the job's token");
  if (/^[ \t]*permissions:[ \t]*(write-all|read-all)[ \t]*$/m.test(text)) out.push("blanket permissions");
  if (/^[ \t]+[\w-]+:[ \t]*write[ \t]*$/m.test(text)) out.push("asks for a write permission");
  return out;
}

/** Everything wrong with checks.yml: the safety rules, plus what it must run and how. */
function workflowProblems(text) {
  const out = safetyProblems(text);
  const on = text.match(/^on:\n((?:[ \t]+.*\n|\n)*)/m);
  if (!on) out.push("no `on:` block it can read");
  else {
    if (!/^[ \t]+pull_request:[ \t]*$/m.test(on[1])) out.push("not triggered by pull_request");
    if (!/^[ \t]+push:[ \t]*\n[ \t]+branches:[ \t]*\[[ \t]*main[ \t]*\][ \t]*$/m.test(on[1])) out.push("not triggered by a push to main");
  }
  const perms = text.match(/^permissions:\n((?:[ \t]+.*\n)*)/m);
  if (!perms) out.push("no top-level permissions block");
  else if (perms[1].trim() !== "contents: read") out.push("top-level permissions are not exactly contents: read");
  if (/^[ \t]+permissions:/m.test(text)) out.push("a job overrides the permissions");
  if (!/persist-credentials:\s*false\b/.test(text)) out.push("checkout keeps the token in .git/config");
  // A step's command, one line each: a `run: |` block reads as "|", so its commands count as not run.
  const runs = [...text.matchAll(/^[ \t]+(?:-[ \t]+)?run:[ \t]*(.+)$/gm)].map((m) => m[1].trim());
  for (const cmd of ['node tools/check-syntax.mjs', 'node --test "tests/*.test.mjs"']) {
    if (!runs.includes(cmd)) out.push(`does not run: ${cmd}`);
  }
  const code = text.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
  if (/\b(npm|yarn|pnpm|npx|apt-get|apt|pip3?|brew|choco)\b/.test(code)) out.push("installs something");
  const node = text.match(/^[ \t]+node-version:[ \t]*["']?(\d+)/m);
  if (!node) out.push("Node version not stated");
  else if (Number(node[1]) < NODE_FLOOR) out.push(`Node ${node[1]} is below the suite's floor, ${NODE_FLOOR}`);
  return out;
}

// Replace an anchor that must occur exactly once, so a mutation can never silently not apply.
const swap = (from, to) => {
  assert.strictEqual(REAL.split(from).length, 2, "anchor occurs once: " + from);
  return REAL.replace(from, to);
};
const catches = (text, want) => {
  const got = workflowProblems(text);
  assert.ok(got.some((p) => p.includes(want)), `expected a problem containing "${want}", got:\n  ${got.join("\n  ")}`);
};

test("checks.yml runs both commands on a pull request and a push to main, safely", () => {
  assert.deepEqual(workflowProblems(REAL), []);
});

test("every workflow in .github/workflows is safe for a fork's pull request", () => {
  const files = readdirSync(DIR).filter((f) => /\.ya?ml$/.test(f));
  assert.ok(files.includes("checks.yml"));
  for (const f of files) assert.deepEqual(safetyProblems(read(f)), [], f);
});

// Mutations: the real workflow with one mistake each, and each must be caught.
test("mutation: triggered by pull_request_target instead", () => {
  catches(swap("  pull_request:\n", "  pull_request_target:\n"), "pull_request_target");
  catches(swap("  pull_request:\n", "  pull_request_target:\n"), "not triggered by pull_request");
});
test("mutation: a workflow_run trigger, inline", () => {
  catches(swap("on:\n", "on: [workflow_run]\nx:\n"), "workflow_run");
});
test("mutation: no push to main", () => {
  catches(swap("    branches: [main]\n", "    branches: [dev]\n"), "push to main");
});
test("mutation: a write permission, top-level or in a job", () => {
  catches(swap("  contents: read\n", "  contents: read\n  pull-requests: write\n"), "write permission");
  catches(swap("    runs-on: ubuntu-latest\n", "    runs-on: ubuntu-latest\n    permissions:\n      contents: write\n"), "write permission");
  catches(swap("    runs-on: ubuntu-latest\n", "    runs-on: ubuntu-latest\n    permissions:\n      contents: read\n"), "overrides the permissions");
});
test("mutation: blanket or missing permissions", () => {
  catches(swap("permissions:\n  contents: read\n", "permissions: write-all\n"), "blanket permissions");
  catches(swap("permissions:\n  contents: read\n", ""), "no top-level permissions");
});
test("mutation: an action on a tag or a branch, not a commit", () => {
  catches(swap("actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1", "actions/checkout@v7"), "not pinned");
  catches(swap("actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1", "actions/setup-node@main"), "not pinned");
  catches(swap("actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1", "actions/setup-node@949feb2"), "not pinned");
});
test("mutation: a secret, or the job's token, reaches a step", () => {
  catches(swap("        run: node tools/check-syntax.mjs\n", "        run: node tools/check-syntax.mjs\n        env:\n          T: ${{ secrets.DEPLOY }}\n"), "secret");
  catches(swap("        run: node tools/check-syntax.mjs\n", "        run: node tools/check-syntax.mjs\n        env:\n          T: ${{ github.token }}\n"), "token");
});
test("mutation: checkout keeps the token", () => {
  catches(swap("          persist-credentials: false\n", "          persist-credentials: true\n"), "keeps the token");
});
test("mutation: a command dropped or changed, or an install step added", () => {
  catches(swap("        run: node tools/check-syntax.mjs\n", "        run: echo skipped\n"), "check-syntax");
  catches(swap('        run: node --test "tests/*.test.mjs"\n', "        run: node --test tests/meter.test.mjs\n"), "tests/*.test.mjs");
  catches(swap("      - name: Syntax check\n", "      - run: npm ci\n      - name: Syntax check\n"), "installs");
});
test("mutation: Node unstated, or below the suite's floor", () => {
  catches(swap("          node-version: 24\n", ""), "not stated");
  catches(swap("          node-version: 24\n", "          node-version: 20\n"), "below the suite's floor");
});
