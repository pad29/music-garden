// TUN-5: run the shipped mutation hook in actual child processes. Production modules are copied
// byte-for-byte to disposable checkouts, never edited. No tools or voice assets are copied or run.
import { test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, cpSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { gameScripts } from "./helpers/game-scripts.mjs";

const REPO = fileURLToPath(new URL("../", import.meta.url));
const TEMPO = '<input id="tempo" min="40" max="200" value="100">';
const BEFORE = "const VALUE = 41;";
const AFTER = "const VALUE = 42;";
const HOOK = "./tests/helpers/questsetup-mutation-hook.mjs";

function put(root, name, text) {
  mkdirSync(dirname(join(root, name)), { recursive: true });
  writeFileSync(join(root, name), text);
}
function checkout(t, wholeTests = false) {
  const root = mkdtempSync(join(tmpdir(), "tg-tun5-hook-"));
  t.after(() => {
    const rel = relative(resolve(tmpdir()), resolve(root));
    assert.ok(rel && !rel.startsWith("..") && !isAbsolute(rel));
    rmSync(root, { recursive: true, force: true });
  });
  if (wholeTests) {
    cpSync(join(REPO, "tests"), join(root, "tests"), { recursive: true,
      filter: src => !/game-scripts-(?:edge|hook)-review\.test\.mjs$/.test(src) });
  } else {
    for (const name of ["tests/harness.mjs", "tests/helpers/game-scripts.mjs", "tests/helpers/questsetup-mutation-hook.mjs"]) {
      mkdirSync(dirname(join(root, name)), { recursive: true });
      copyFileSync(join(REPO, name), join(root, name));
    }
  }
  put(root, "index.html", TEMPO + '<script src="js/data.js"></script><script>\nconst TOTAL = VALUE + 1;\n</script>');
  put(root, "js/data.js", BEFORE);
  put(root, "tests/probe.test.mjs", `
import {test} from 'node:test';
import assert from 'node:assert';
import {loadGame} from './harness.mjs';
console.log('TUN5_TEST_BODY_ENTERED');
test('external patch reaches the child', () => {
  const g = loadGame();
  assert.strictEqual(g.VALUE, Number(process.env.EXPECTED_VALUE));
  assert.strictEqual(g.TOTAL, Number(process.env.EXPECTED_VALUE) + 1);
  assert.strictEqual(g.__scripts[0].src, 'const VALUE = ' + process.env.EXPECTED_VALUE + ';');
  assert.ok(g.__script.startsWith(g.__scripts[0].src));
});
`);
  return root;
}

function child(root, { patches = [], expected = 41, bootstrap = false, args, timeout = 30000 } = {}) {
  const env = { ...process.env, QUEST_SETUP_MUTATIONS: JSON.stringify(patches), EXPECTED_VALUE: String(expected) };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, args || [
    ...(bootstrap ? ["--import", "./bootstrap.mjs"] : []),
    "--import", HOOK, "--test", "--test-reporter=tap", "tests/probe.test.mjs",
  ], { cwd: root, env, encoding: "utf8", timeout, maxBuffer: 8 * 1024 * 1024 });
  assert.ifError(result.error);
  assert.strictEqual(result.signal, null);
  return { ...result, output: result.stdout + result.stderr };
}
function rejected(result, pattern) {
  assert.notStrictEqual(result.status, 0, result.output);
  assert.match(result.output, pattern);
  assert.ok(!result.output.includes("TUN5_TEST_BODY_ENTERED"), result.output);
}

test("TUN-5 hook: an external anchor is patched in the child, metadata follows, and disk stays unchanged", t => {
  const root = checkout(t);
  const html = readFileSync(join(root, "index.html"), "utf8");
  const baseline = child(root);
  assert.strictEqual(baseline.status, 0, baseline.output);
  assert.match(baseline.stdout, /ok 1 - external patch reaches the child/);
  const mutant = child(root, { patches: [[BEFORE, AFTER]], expected: 42 });
  assert.strictEqual(mutant.status, 0, mutant.output);
  assert.match(mutant.stdout, /ok 1 - external patch reaches the child/);
  assert.strictEqual(readFileSync(join(root, "js/data.js"), "utf8"), BEFORE);
  assert.strictEqual(readFileSync(join(root, "index.html"), "utf8"), html);
});

test("TUN-5 hook: duplicate anchors in separate files are rejected before the child test", t => {
  const root = checkout(t);
  put(root, "index.html", TEMPO + '<script src="js/data.js"></script><script src="js/duplicate.js"></script>');
  put(root, "js/duplicate.js", "// " + BEFORE);
  rejected(child(root, { patches: [[BEFORE, AFTER]] }), /Mutation anchor must occur once: const VALUE = 41;/);
});

test("TUN-5 hook: missing anchors are rejected before the child test", t => {
  const root = checkout(t);
  rejected(child(root, { patches: [["anchor not in either file", AFTER]] }), /Mutation anchor must occur once/);
});

for (const [label, replacement, pattern] of [
  ["syntax", "const VALUE = ;", /SyntaxError/],
  ["initialization", 'throw new Error("TUN5_LOAD_FAILURE");', /TUN5_LOAD_FAILURE/],
]) {
  test(`TUN-5 hook: an external ${label} failure cannot masquerade as a caught assertion`, t => {
    const root = checkout(t);
    rejected(child(root, { patches: [[BEFORE, replacement]] }), pattern);
  });
}

for (const mode of ["missing", "duplicate"]) {
  test(`TUN-5 hook: a ${mode} harness needle fails before the child test`, t => {
    const root = checkout(t);
    // A separate test-only loader supplies drifted source in memory. The harness and hook on disk
    // remain byte-identical to production; the hook itself must notice the changed contract.
    put(root, "bootstrap.mjs", `
import {registerHooks} from 'node:module';
registerHooks({load(url, context, nextLoad) {
  const result = nextLoad(url, context);
  if (!url.endsWith('/tests/harness.mjs')) return result;
  const source = String(result.source);
  const changed = ${JSON.stringify(mode)} === 'missing'
    ? source.replace('const scripts = loaded;', 'const scripts = [...loaded];')
    : source + '\\n// const scripts = loaded;\\n';
  return {...result, source: changed};
}});
`);
    rejected(child(root, { bootstrap: true }), /Harness source extraction changed; update the audit hook/);
    assert.strictEqual(readFileSync(join(root, "tests/harness.mjs"), "utf8"),
      readFileSync(join(REPO, "tests/harness.mjs"), "utf8"));
  });
}

test("TUN-5 audit: questsetup G faults are caught when their game source lives in an external file", t => {
  const root = checkout(t, true);
  // Relocate the page's first inline script, unchanged, into an external file. (Once TUN-6/7 have
  // moved the G quest code out of index.html already, this still holds — it just proves less.)
  const { html, scripts } = gameScripts(REPO);
  const inline = scripts.find(s => s.inline);
  const opening = html.indexOf("<script>");
  const closing = html.indexOf("</script>", opening);
  assert.ok(inline && opening >= 0 && closing > opening);
  assert.strictEqual(html.slice(opening + 8, closing), inline.src);
  put(root, "js/game.js", inline.src);
  put(root, "index.html", html.slice(0, opening) + '<script src="js/game.js"></script>' + html.slice(closing + 9));
  const result = child(root, { args: ["tests/questsetup-mutations.mjs", "--g-only"], timeout: 120000 });
  assert.strictEqual(result.status, 0, result.output);
  assert.match(result.stdout, /\n[1-9]\d* mutations caught across [1-9]\d* green tests\. No source files changed\./);
  assert.strictEqual(readFileSync(join(root, "js/game.js"), "utf8"), inline.src);
});
