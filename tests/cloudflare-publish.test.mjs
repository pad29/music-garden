// cloudflare-build.sh (Cloudflare Pages' build, TUN-80) must publish exactly what the game loads —
// index.html, js/, voice/, samples/, vendor/ — at the paths the page uses, and the same folders as netlify.toml
// while both hosts exist.
//
// Why a test: Pages' build command and output folder live in its dashboard (`sh cloudflare-build.sh`,
// output `site`), so this script is the only part of the Cloudflare config the repository holds. As on
// Netlify, a js/ file missing from the output is not a 404: with no 404.html, Pages serves index.html
// for any path that is not a file, and the game never starts. Unlike the Netlify checker, this one is
// strict — a step it cannot read fails the test (tests/helpers/cloudflare-publish.mjs says why) — and
// it also runs the real script, under Git Bash on Windows, in a scratch folder.
import { test } from "node:test";
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { gameScripts, ROOT } from "./helpers/game-scripts.mjs";
import { parseBuildScript, cloudflareProblems, publishedTree, custom404s } from "./helpers/cloudflare-publish.mjs";
import { vendorFiles } from "./helpers/vendor.mjs";

// LF, as git stores it and Cloudflare's Linux checkout gets it (a Windows checkout may hold CRLF).
const REAL_SH = readFileSync(join(ROOT, "cloudflare-build.sh"), "utf8").replace(/\r\n/g, "\n");
const REAL_TOML = readFileSync(join(ROOT, "netlify.toml"), "utf8");

// The contract, independent of both configs: what the game loads, and nothing else. A new runtime
// folder is added here on purpose, together with both configs.
const ALLOWED = ["cp index.html site/index.html", "cp -r js site/js", "cp -r voice site/voice", "cp -r samples site/samples",
  "cp -r vendor site/vendor"];
// What the page itself names: its game scripts, and every vendored file (TUN-81: the fonts and the sign-in library).
const pageFiles = () => [...gameScripts().scripts, ...vendorFiles()];

const problems = ({ script = REAL_SH, toml = REAL_TOML } = {}) =>
  cloudflareProblems({ script, toml, scripts: pageFiles(), allowed: ALLOWED });

// Replace an anchor that must occur exactly once, so a mutation can never silently not apply.
const swap = (text, from, to) => {
  assert.strictEqual(text.split(from).length, 2, "anchor occurs once: " + from);
  return text.replace(from, to);
};
const sh = (from, to) => swap(REAL_SH, from, to);
const includesAll = (got, want) => {
  for (const w of want) assert.ok(got.includes(w), `expected problem:\n  ${w}\ngot:\n  ${got.join("\n  ")}`);
};

test("cloudflare-build.sh publishes exactly index.html, js/, voice/, samples/ and vendor/, as netlify.toml does", () => {
  assert.deepEqual(problems(), []);
});

test("what the real config publishes: the page's scripts at their paths, only the allowed folders, no 404.html", () => {
  const { copies } = parseBuildScript(REAL_SH);
  const tree = publishedTree(ROOT, copies);
  const external = pageFiles().filter((s) => !s.inline);
  assert.ok(external.length > 0, "the page loads local scripts");
  for (const path of ["index.html", ...external.map((s) => s.name)]) assert.ok(tree.has(path), "published: " + path);
  const tops = new Set([...tree.keys()].map((p) => p.split("/")[0]));
  assert.deepEqual([...tops].sort(), ["index.html", "js", "samples", "vendor", "voice"]);
  assert.deepEqual(custom404s(tree), []);
});

// Mutations: each is the real script with one mistake, and each must be caught.
test("a folder dropped, misplaced or copied without -r is caught, for every folder", () => {
  for (const dir of ["js", "voice", "samples", "vendor"]) {
    const copy = `cp -r ${dir} site/${dir}`;
    includesAll(problems({ script: sh(` && ${copy}`, "") }), [`cloudflare-build.sh does not run: ${copy}`]);
    includesAll(problems({ script: sh(copy, `cp -r ${dir} site/elsewhere`) }),
      [`cloudflare-build.sh publishes more than the game loads: cp -r ${dir} site/elsewhere`, `cloudflare-build.sh does not run: ${copy}`]);
    includesAll(problems({ script: sh(copy, `cp ${dir} site/${dir}`) }), [`cloudflare-build.sh does not run: ${copy}`]);
  }
  // For js/, the page's own scripts are named too.
  const first = gameScripts().scripts.find((s) => !s.inline).name;
  includesAll(problems({ script: sh(" && cp -r js site/js", "") }), [`cloudflare-build.sh does not publish ${first}`]);
  // For vendor/, the vendored files are named too: the library and the fonts.
  includesAll(problems({ script: sh(" && cp -r vendor site/vendor", "") }), vendorFiles().map((f) => `cloudflare-build.sh does not publish ${f.name}`));
  includesAll(problems({ script: sh("cp index.html site/index.html && ", "") }), ["cloudflare-build.sh does not publish index.html"]);
});

test("anything that is not a plain copy is refused, never skipped", () => {
  const last = "cp -r samples site/samples";
  for (const [mutant, refused] of [
    [sh(last, `${last} && cp -R spike site/spike`), "cp -R spike site/spike"],
    [sh(last, `${last} && cp -r backend site`), "cp -r backend site"],
    [sh(last, `${last} && rm site/js/boot.js`), "rm site/js/boot.js"],
    [sh(last, `${last} && cp -r ../secrets site/x`), "cp -r ../secrets site/x"],
    [sh(last, `${last} || true`), `${last} || true`],
    [sh(last, `${last} &&`), "(an empty step)"],
    [sh("rm -rf site && ", "exit 0 && rm -rf site && "), "exit 0 && rm -rf site"],
    [sh("rm -rf site && mkdir site", "mkdir -p site"), "mkdir -p site && cp index.html site/index.html"],
    [sh("set -eu\n", ""), "rm -rf site && mkdir site && cp index.html site/index.html && cp -r js site/js && cp -r voice site/voice && cp -r samples site/samples && cp -r vendor site/vendor"],
    [sh(" && cp -r voice site/voice", " # && cp -r voice site/voice"), "cp -r js site/js #"],
  ]) assert.deepEqual(problems({ script: mutant }), [`cloudflare-build.sh: refused "${refused}"`]);
  // A whole line commented out is no command: here, the only chain line.
  assert.deepEqual(problems({ script: sh("\nrm -rf site", "\n# rm -rf site") }), ['cloudflare-build.sh: refused "(no build steps)"']);
});

// Exactly one chain line. Under `set -e`, a failure inside an `&&` list does not stop the script, so a
// second line would run after a failed copy and the build would "succeed" half-published (GPT's PR
// review, finding 3; the execution test below shows the single chain failing instead).
test("a second command line is refused, even one that would publish correctly; comment lines are fine", () => {
  const tail = " && cp -r samples site/samples && cp -r vendor site/vendor";
  assert.deepEqual(problems({ script: sh(tail, "\ncp -r samples site/samples && cp -r vendor site/vendor") }),
    ['cloudflare-build.sh: refused "a second command line: cp -r samples site/samples && cp -r vendor site/vendor"']);
  assert.deepEqual(problems({ script: sh(" && cp -r vendor site/vendor", "\ncp -r vendor site/vendor") }),
    ['cloudflare-build.sh: refused "a second command line: cp -r vendor site/vendor"']);
  // A comment line between `set -eu` and the chain, or a commented-out copy after it, changes nothing.
  assert.deepEqual(problems({ script: sh("set -eu\n", "set -eu\n# the copy:\n") }), []);
  assert.deepEqual(problems({ script: REAL_SH + "# cp -r spike site/spike\n" }), []);
});

test("a valid copy of something the game does not load is caught — spike/ above all", () => {
  const last = "cp -r samples site/samples";
  assert.deepEqual(problems({ script: sh(last, `${last} && cp -r spike site/spike`) }),
    ["cloudflare-build.sh publishes more than the game loads: cp -r spike site/spike",
      "cloudflare-build.sh runs cp -r spike site/spike; netlify.toml [build] does not"]);
});

test("Netlify and Cloudflare must copy the same folders, in [build] and in every [context.*] override", () => {
  // A context override that keeps the scripts but drops the asset folders: the script check alone
  // would pass it (TUN-6's context lesson, one level down).
  for (const ctx of ["production", "deploy-preview"]) {
    const toml = REAL_TOML + `\n[context.${ctx}]\n  command = "mkdir -p site && cp index.html site/index.html && cp -r js site/js"\n`;
    includesAll(problems({ toml }), [
      `cloudflare-build.sh runs cp -r voice site/voice; netlify.toml [context.${ctx}] does not`,
      `cloudflare-build.sh runs cp -r samples site/samples; netlify.toml [context.${ctx}] does not`,
      `cloudflare-build.sh runs cp -r vendor site/vendor; netlify.toml [context.${ctx}] does not`]);
  }
  // A new folder in one config only fails parity; in both, it still fails the allowlist.
  const extra = " && cp -r fonts site/fonts";
  const tomlPlus = swap(REAL_TOML, "cp -r vendor site/vendor\"", "cp -r vendor site/vendor" + extra + "\"");
  const shPlus = sh("cp -r vendor site/vendor", "cp -r vendor site/vendor" + extra);
  assert.deepEqual(problems({ toml: tomlPlus }), ["netlify.toml [build] runs cp -r fonts site/fonts; cloudflare-build.sh does not"]);
  assert.deepEqual(problems({ script: shPlus }), [
    "cloudflare-build.sh publishes more than the game loads: cp -r fonts site/fonts",
    "cloudflare-build.sh runs cp -r fonts site/fonts; netlify.toml [build] does not"]);
  assert.deepEqual(problems({ script: shPlus, toml: tomlPlus }),
    ["cloudflare-build.sh publishes more than the game loads: cp -r fonts site/fonts"]);
});

test("Netlify must publish site/, in [build] and in any override", () => {
  assert.deepEqual(problems({ toml: swap(REAL_TOML, 'publish = "site"', 'publish = "."') }),
    ['netlify.toml [build] publishes ".", not "site"']);
  assert.deepEqual(problems({ toml: REAL_TOML + '\n[context.production]\n  publish = "dist"\n' }),
    ['netlify.toml [context.production] publishes "dist", not "site"']);
  assert.deepEqual(problems({ toml: swap(REAL_TOML, 'publish = "site"', "") }), ["netlify.toml [build] sets no publish directory"]);
});

// Parity reads Netlify's commands strictly too: the lenient Netlify checker skips a step it can't read,
// so each of these passed parity before (GPT's PR review, finding 1), in [build] and in an override.
test("a Netlify command with anything but plain copies is refused, in [build] and in every override", () => {
  const real = REAL_TOML.match(/^\s*command\s*=\s*"([^"]*)"/m)[1];
  const mutants = [
    [real + " && cp -R spike site/spike", "cp -R spike site/spike"],
    [real + " && cp -r backend site", "cp -r backend site"],
    [real + " && rm site/js/boot.js", "rm site/js/boot.js"],
    ["exit 0 && " + real, "exit 0"],
  ];
  for (const [cmd, refused] of mutants) {
    assert.deepEqual(problems({ toml: swap(REAL_TOML, `"${real}"`, `"${cmd}"`) }), [`netlify.toml [build]: refused "${refused}"`]);
    for (const ctx of ["production", "deploy-preview"])
      assert.deepEqual(problems({ toml: REAL_TOML + `\n[context.${ctx}]\n  command = "${cmd}"\n` }),
        [`netlify.toml [context.${ctx}]: refused "${refused}"`]);
  }
  // Control: an override that repeats the real command is fine.
  assert.deepEqual(problems({ toml: REAL_TOML + `\n[context.production]\n  command = "${real}"\n` }), []);
});

// Quoted keys are valid TOML; a reader that misses them would treat the setting as absent (finding 2).
test("quoted and dotted command/publish keys are read, or refused — never ignored", () => {
  const real = REAL_TOML.match(/^\s*command\s*=\s*"([^"]*)"/m)[1];
  const short = "mkdir -p site && cp index.html site/index.html && cp -r js site/js";
  assert.deepEqual(problems({ toml: REAL_TOML + '\n[context.production]\n  "publish" = "."\n' }),
    ['netlify.toml [context.production] publishes ".", not "site"']);
  assert.deepEqual(problems({ toml: REAL_TOML + "\n[context.production]\n  'publish' = \"dist\"\n" }),
    ['netlify.toml [context.production] publishes "dist", not "site"']);
  includesAll(problems({ toml: REAL_TOML + `\n[context.deploy-preview]\n  "command" = "${short}"\n` }),
    ["cloudflare-build.sh runs cp -r voice site/voice; netlify.toml [context.deploy-preview] does not"]);
  // Controls: the same quoted keys with the right values.
  assert.deepEqual(problems({ toml: REAL_TOML + `\n[context.production]\n  "publish" = "site"\n  "command" = "${real}"\n` }), []);
  // A dotted key can't be read here, so it is refused rather than taken as absent.
  refusesLine(REAL_TOML + `\n[context]\n  production.command = "${short}"\n`, `production.command = "${short}"`);
  refusesLine('build.publish = "."\n' + REAL_TOML, 'build.publish = "."');
  // A command in a table that never deploys (Netlify Dev's [dev]) is plain TOML, and fine.
  assert.deepEqual(problems({ toml: REAL_TOML + '\n[dev]\n  command = "npx http-server"\n' }), []);
});

// The six spellings GPT's round-2 review found passing: valid TOML for a production or deploy-preview
// override that the readers would miss. Each must be refused, by line, not treated as absent.
const refusesLine = (toml, text) => {
  const got = problems({ toml });
  assert.ok(got.some((p) => /^netlify\.toml line \d+: can't read /.test(p) && p.endsWith(`"${text}"`)),
    `expected "${text}" to be refused; got:\n  ${got.join("\n  ")}`);
};
test("any other TOML spelling of a table or key is refused, never read as absent", () => {
  for (const [extra, text] of [
    ['["context".production]\npublish = "."', '["context".production]'],
    ['[context . production]\npublish = "."', "[context . production]"],
    ['[context]\nproduction . publish = "."', 'production . publish = "."'],
    ["['context'.'deploy-preview']\ncommand = \"exit 0\"", "['context'.'deploy-preview']"],
    ['[context.production]\n"\\u0070ublish" = "."', '"\\u0070ublish" = "."'],
    ['[context]\nproduction = { publish = "." }', 'production = { publish = "." }'],
    ['[context.production]\ncommand = """mkdir -p site"""', 'command = """mkdir -p site"""'],
  ]) refusesLine(REAL_TOML + "\n" + extra + "\n", text);
  // Controls: the plain spellings of correct overrides, and the real file itself, read cleanly.
  const real = REAL_TOML.match(/^\s*command\s*=\s*"([^"]*)"/m)[1];
  assert.deepEqual(problems({ toml: REAL_TOML + `\n[context.production]\npublish = "site"\ncommand = "${real}"\n` }), []);
  assert.deepEqual(problems({ toml: REAL_TOML + `\n[context.deploy-preview]\n'publish' = 'site'\n'command' = '${real}'\n` }), []);
});

// ---- A scratch repository: a few files in each folder, plus everything that must stay out. ----
function scratch() {
  const dir = mkdtempSync(join(tmpdir(), "cf-publish-"));
  const files = {
    "index.html": "<!doctype html><title>page</title>", "js/boot.js": "boot();", "js/nested/deep.js": "deep();",
    "voice/abc.mp3": "\u0000mp3\u00ff", "samples/piano.js": "pack()", "samples/piano/C4.mp3": "\u0001rec",
    "spike/probe.html": "spike", "backend/template.yaml": "aws", "tests/t.test.mjs": "test", "tools/x.mjs": "tool",
    "reviews/r.md": "review", ".claude/gpt/ask.sh": "gpt", "README.md": "readme", "404.html": "an unpublished root 404",
    "vendor/SHA256SUMS": "sums", "vendor/cognito/lib.min.js": "lib()", "vendor/fonts/fonts.css": "@font-face{}",
    "vendor/fonts/nunito/latin.woff2": "wOF2\u0000\u00ff\r\n", "vendor/fonts/nunito/OFL.txt": "licence\r\n",
  };
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), body, "latin1");
  }
  writeFileSync(join(dir, "cloudflare-build.sh"), REAL_SH);
  return dir;
}

test("a 404.html inside a published folder is caught; one the config does not publish is not", () => {
  const dir = scratch();
  try {
    const { copies } = parseBuildScript(REAL_SH);
    assert.deepEqual(custom404s(publishedTree(dir, copies)), []);   // the root 404.html is not copied
    for (const path of ["js/404.html", "samples/piano/404.html"]) {
      writeFileSync(join(dir, path), "custom");
      assert.deepEqual(custom404s(publishedTree(dir, copies)), [path]);
      rmSync(join(dir, path));
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// The real script, run for real. On Windows, Git's own bash (found as tests/workflow-scripts.test.mjs
// finds it), never WSL's; Cloudflare's build runs it with Ubuntu's sh.
function findBash() {
  const r = spawnSync("git", ["--exec-path"], { encoding: "utf8" });
  const gitRoot = r.status === 0 ? join(r.stdout.trim(), "..", "..", "..") : null;
  const candidates = process.platform === "win32"
    ? [process.env.GIT_BASH, gitRoot && join(gitRoot, "bin", "bash.exe"), gitRoot && join(gitRoot, "usr", "bin", "bash.exe"), "C:/Program Files/Git/bin/bash.exe"]
    : ["bash"];
  for (const c of candidates.filter(Boolean)) {
    if (process.platform === "win32" && !existsSync(c)) continue;
    const t = spawnSync(c, ["-c", "echo ok"], { encoding: "utf8" });
    if (t.status === 0 && t.stdout.trim() === "ok") return c;
  }
  return null;
}
const bash = findBash();

function filesUnder(dir, prefix = "") {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name), rel = prefix ? `${prefix}/${name}` : name;
    if (statSync(full).isDirectory()) out.push(...filesUnder(full, rel)); else out.push(rel);
  }
  return out.sort();
}

test("run for real, twice over a stale site/: exactly the allowed trees, byte for byte", { skip: bash ? false : "no bash found" }, () => {
  const dir = scratch();
  try {
    const expected = publishedTree(dir, parseBuildScript(REAL_SH).copies);
    const check = () => {
      const run = spawnSync(bash, ["-c", "sh cloudflare-build.sh"], { cwd: dir, encoding: "utf8" });
      assert.strictEqual(run.status, 0, run.stderr);
      const got = filesUnder(join(dir, "site"));
      assert.deepEqual(got, [...expected.keys()].sort());
      for (const path of got) assert.ok(readFileSync(join(dir, "site", path)).equals(readFileSync(expected.get(path))), "bytes: " + path);
      assert.deepEqual(custom404s(new Map(got.map((p) => [p, p]))), []);
    };
    check();
    // A stale output from an older build: a spike/ copy and a script since removed.
    mkdirSync(join(dir, "site", "spike"), { recursive: true });
    writeFileSync(join(dir, "site", "spike", "old.html"), "stale");
    writeFileSync(join(dir, "site", "js", "gone.js"), "stale");
    check();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// A missing source fails the build instead of publishing a partial site — wherever it sits in the
// chain, not only last (GPT's PR review, finding 3: a failure mid-chain must still fail the script).
test("run for real: a missing index.html, js/, voice/, samples/ or vendor/ fails the build", { skip: bash ? false : "no bash found" }, () => {
  for (const missing of ["index.html", "js", "voice", "samples", "vendor"]) {
    const dir = scratch();
    try {
      rmSync(join(dir, missing), { recursive: true });
      const run = spawnSync(bash, ["-c", "sh cloudflare-build.sh"], { cwd: dir, encoding: "utf8" });
      assert.notStrictEqual(run.status, 0, `a build missing ${missing} must fail`);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});
