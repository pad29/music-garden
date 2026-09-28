// TUN-5 independent review. These fixtures exercise the real loader and harness unchanged.
// Known regressions remain ordinary failing tests, not TODOs or assertions of broken behavior.
import { test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, isAbsolute } from "node:path";
import { gameScripts, applyPatches, countAcross, checkSyntax } from "./helpers/game-scripts.mjs";
import { loadGame } from "./harness.mjs";

const TEMPO = '<input id="tempo" min="40" max="200" value="100">';
function fixture(t, html, files = {}) {
  const root = mkdtempSync(join(tmpdir(), "tg-tun5-edge-"));
  t.after(() => {
    const rel = relative(resolve(tmpdir()), resolve(root));
    assert.ok(rel && !rel.startsWith("..") && !isAbsolute(rel));
    rmSync(root, { recursive: true, force: true });
  });
  for (const [name, src] of Object.entries({ "index.html": TEMPO + html, ...files })) {
    const file = join(root, name);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, src);
  }
  return root;
}

test("TUN-5: uppercase tags, unquoted attributes, padded src, and spaced closing tags execute in order", t => {
  const root = fixture(t, '<SCRIPT SRC=js/a.js TYPE=text/javascript></SCRIPT >' +
    '<script src=" \t./js/b.js?v=2#part \n"></script\t>' +
    '<SCRIPT TYPE="">\nconst result = FIRST + SECOND;\n</SCRIPT>', {
    "js/a.js": "const FIRST = 3;\r\n",
    "js/b.js": "const SECOND = FIRST + 1;\r\n",
  });
  const g = loadGame({ root });
  assert.strictEqual(g.result, 7);
  assert.strictEqual(g.__scripts.length, 3);
  assert.ok(g.__scripts.every(s => !s.src.includes("\r")));
});

test("TUN-5: a comment spanning complete script tags leaves the next live script intact", t => {
  const root = fixture(t, '<!--\n<script src="missing.js"></script>\n<script>throw 1;</script>\n-->' +
    '<script>const LIVE = 9;</script><!-- <script src="also-missing.js"></script>');
  assert.strictEqual(gameScripts(root).scripts.length, 1);
  assert.strictEqual(loadGame({ root }).LIVE, 9);
});

test("TUN-5: page subdirectory controls relative file resolution, not root or cwd", t => {
  const root = fixture(t, '<script>const unused = 0;</script>', {
    "pages/lesson.html": '<script src="../js/shared.js#part"></script>\n<script>const local = SHARED;</script>',
    "js/shared.js": "const SHARED = 12;",
  });
  const { scripts } = gameScripts(root, "pages/lesson.html");
  assert.strictEqual(scripts[0].src, "const SHARED = 12;");
  assert.strictEqual(scripts[1].name, "pages/lesson.html");
  assert.strictEqual(scripts[1].line, 2);
  checkSyntax(scripts);
});

test("TUN-5: ./js/a.js and js/a.js resolve to identical sources without deduplicating script tags", t => {
  const root = fixture(t, '<script src="js/a.js"></script><script src="./js/a.js"></script>', {
    "js/a.js": "var executions = (globalThis.executions || 0) + 1;",
  });
  const scripts = gameScripts(root).scripts;
  assert.strictEqual(scripts[0].src, scripts[1].src);
  assert.strictEqual(loadGame({ root }).executions, 2);
  assert.strictEqual(countAcross(scripts, "var executions"), 2);
});

test("TUN-5: empty sources and a page with only skipped tags fail closed", t => {
  for (const src of ["", " \t ", "?v=1", "#fragment"]) {
    const root = fixture(t, `<script src="${src}"></script><script>const fine=1;</script>`);
    assert.throws(() => gameScripts(root), /empty src/);
  }
  const root = fixture(t, '<!-- <script>ignored</script> --><script src="https://example.invalid/a.js"></script>');
  assert.throws(() => gameScripts(root), /No local scripts/);
});

test("TUN-5: src takes precedence over a script tag's inline fallback text", t => {
  const root = fixture(t, '<script src="js/a.js">throw new Error("must not run");</script>', {
    "js/a.js": "const loaded = true;",
  });
  assert.strictEqual(loadGame({ root }).loaded, true);
  assert.ok(!gameScripts(root).scripts[0].src.includes("must not run"));
});

test("TUN-5: custom roots bypass and do not poison the default cache, even after a failed load", t => {
  const standard = loadGame();
  const root = fixture(t, '<script>let VALUE = 1;</script>');
  const first = loadGame({ root });
  first.VALUE = 8;
  assert.strictEqual(loadGame({ root }).VALUE, 1);
  writeFileSync(join(root, "index.html"), TEMPO + '<script>throw new Error("bad fixture");</script>');
  assert.throws(() => loadGame({ root }), /bad fixture/);
  writeFileSync(join(root, "index.html"), TEMPO + '<script>const VALUE = 2;</script>');
  assert.strictEqual(loadGame({ root }).VALUE, 2);
  assert.strictEqual(loadGame(), standard);
  assert.notStrictEqual(loadGame({ fresh: true }), standard);
  assert.strictEqual(loadGame(), standard);
});

test("TUN-5: a trailing line comment in an external script cannot swallow the collector", t => {
  const root = fixture(t, '<script src="a.js"></script>', { "a.js": "const VALUE = 8; // no final newline" });
  assert.strictEqual(loadGame({ root }).VALUE, 8);
});

test("TUN-5: metadata is deeply frozen and reflects the exact files that ran", t => {
  const root = fixture(t, '<script src="a.js"></script><script>const B=A+1;</script>', { "a.js": "const A=4;" });
  const g = loadGame({ root });
  assert.ok(Object.isFrozen(g.__scripts));
  assert.ok(g.__scripts.every(Object.isFrozen));
  assert.throws(() => { g.__scripts[0].src = "changed"; }, TypeError);
  assert.strictEqual(g.__script, g.__scripts.map(s => s.src).join("\n"));
  assert.strictEqual(g.__scripts[0].src, readFileSync(join(root, "a.js"), "utf8"));
});

test("TUN-5: second inline error keeps its unique name and original CRLF page line", t => {
  const root = fixture(t, ['<script>const A=1;</script>', '<!-- comment', 'more -->',
    '<script', 'type="text/javascript">', 'const B=A;', 'missingName();', '</script>'].join("\r\n"));
  assert.throws(() => loadGame({ root }), err =>
    /index\.html#2 threw/.test(err.message) && err.cause?.name === "ReferenceError" &&
    /index\.html#2:7\b/.test(err.cause.stack));
});

test("TUN-5: checkSyntax never executes files and does not combine their strict-mode directives", () => {
  checkSyntax([
    { name: "strict.js", line: 1, src: '"use strict"; throw new Error("do not execute");' },
    { name: "sloppy.js", line: 1, src: "with ({x:1}) { void x; }" },
  ]);
});

test("TUN-5: patch failure after a successful patch leaves the original sources untouched", () => {
  const sources = Object.freeze([Object.freeze({ name: "a.js", src: "alpha beta", line: 1 })]);
  assert.throws(() => applyPatches(sources, [["alpha", "beta"], ["beta", "other"]]), /Mutation anchor must occur once/);
  assert.strictEqual(sources[0].src, "alpha beta");
  assert.strictEqual(countAcross([{ src: "left" }, { src: "right" }], "leftright"), 0);
  assert.throws(() => applyPatches([{ src: "left" }, { src: "right" }], [["leftright", "x"]]), /Mutation anchor/);
});

// Regression: [^>]* terminates an opening tag inside a quoted attribute, silently dropping src.
test("TUN-5 regression: a quoted greater-than attribute must not hide an external script", t => {
  const root = fixture(t, '<script data-note="a > b" src="js/a.js"></script>', {
    "js/a.js": 'const story = {intro:"A real narration line."};',
  });
  const scripts = gameScripts(root).scripts;
  assert.strictEqual(scripts[0].inline, false);
  assert.strictEqual(scripts[0].src, 'const story = {intro:"A real narration line."};');
});

// Regression: \b accepts the hyphen in a different, valid custom-element name.
test("TUN-5 regression: script-prefixed custom elements must not consume the next real script", t => {
  const root = fixture(t, '<script-notes>explanation</script-notes><script>const REAL = 3;</script>');
  assert.strictEqual(gameScripts(root).scripts[0].src, "const REAL = 3;");
  assert.strictEqual(loadGame({ root }).REAL, 3);
});

// GPT's test pass asked for these to be decoded. Claude's call (review file): we write index.html, so
// script paths stay plain, and an encoded one is refused by name rather than half-decoded.
test("TUN-5: an entity- or percent-encoded src is refused with a clear message, not misread", t => {
  for (const [src, file] of [["js/a&#46;js", "js/a.js"], ["js/a%20b.js", "js/a b.js"]]) {
    const root = fixture(t, `<script src="${src}"></script>`, { [file]: "const REAL = 3;" });
    assert.throws(() => gameScripts(root), /is encoded — use a plain relative path/);
  }
});

// Regression: RCDATA content is text, not an executable script element.
test("TUN-5 regression: script-looking textarea content must not execute", t => {
  const root = fixture(t, '<textarea><script>throw new Error("not executable");</script></textarea>' +
    '<script>const REAL = 3;</script>');
  assert.strictEqual(gameScripts(root).scripts.length, 1);
  assert.strictEqual(loadGame({ root }).REAL, 3);
});
