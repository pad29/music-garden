// The script loader itself: tests/helpers/game-scripts.mjs and the way loadGame() runs its list.
// The real page is only one arrangement (since TUN-7: js/ files only, no inline script), so these
// build tiny throwaway pages in a temp directory to reach the rest: several classic scripts, in
// document order, in one context, including the orders and failures the game itself never has.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { gameScripts, applyPatches, countAcross, joinScripts, checkSyntax, vendoredSources, ROOT } from "./helpers/game-scripts.mjs";
import { loadGame } from "./harness.mjs";

const TEMPO = '<input id="tempo" type="range" min="40" max="200" value="100">';

/** A temp directory holding index.html plus the given files; removed after `fn`. */
function page(html, files, fn) {
  const dir = mkdtempSync(join(tmpdir(), "tg-scripts-"));
  try {
    for (const [name, text] of Object.entries(files || {})) {
      mkdirSync(join(dir, name, ".."), { recursive: true });
      writeFileSync(join(dir, name), text);
    }
    writeFileSync(join(dir, "index.html"), html);
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("scripts come back in document order, CDN tags and commented-out tags skipped", () => {
  const html = [
    "<!doctype html><html><head>",
    "<!-- <script src=\"js/gone.js\"></script>",
    "     a multi-line comment -->",
    '<script src="https://cdn.example.com/lib.js"></script>',
    '<script src="//cdn.example.com/other.js"></script>',
    '<script src="js/a.js?v=2"></script>',
    "</head><body>" + TEMPO,
    "<script>",
    "const B = A + 1;",
    "</script>",
    '<script type="application/javascript" src="js/c.js"></script>',
    "</body></html>",
  ].join("\r\n");
  page(html, { "js/a.js": "const A = 1;\r\n", "js/c.js": "const C = B + 1;\n" }, (dir) => {
    const { scripts } = gameScripts(dir);
    assert.equal(JSON.stringify(scripts.map((s) => s.name)), '["js/a.js","index.html","js/c.js"]');
    assert.equal(scripts[0].src, "const A = 1;\n", "CRLF is normalised in external files");
    assert.equal(scripts[1].src, "\nconst B = A + 1;\n", "and in the page");
    assert.equal(scripts[1].line, 8, "the inline body starts on the <script> line of index.html");
    assert.equal(scripts[0].line, 1);
  });
});

// TUN-81: a script under vendor/ is third-party code the site serves itself — listed apart, never a game
// script, by where the file is rather than how the src is spelled. Mutations: drop the vendor/ test (the
// library becomes scripts[0], ahead of the gate); match the src text instead of the path ("./vendor/" and
// "js/vendor/" then go wrong); match "vendor" as a prefix ("vendorx/" becomes vendored).
test("a vendor/ script is listed apart, unread, and still held to document order", () => {
  const html = [
    `<html>${TEMPO}`,
    '<script src="vendor/lib.min.js"></script>',
    '<script src="./vendor/other.js?v=1"></script>',
    '<script src="js/a.js"></script>',
    '<script src="js/vendor/b.js"></script>',
    '<script src="vendorx/c.js"></script>',
    "</html>",
  ].join("\n");
  const files = { "js/a.js": "const A = 1;", "js/vendor/b.js": "const B = 2;", "vendorx/c.js": "const C = 3;" };
  page(html, files, (dir) => {
    const { scripts, vendored } = gameScripts(dir);   // the vendor/ files do not exist: never read
    assert.deepEqual(scripts.map((s) => s.name), ["js/a.js", "js/vendor/b.js", "vendorx/c.js"]);
    assert.deepEqual(vendored.map((v) => [v.name, v.line]), [["vendor/lib.min.js", 2], ["./vendor/other.js", 3]]);
    assert.throws(() => vendoredSources(vendored), /index\.html:2: cannot read vendored <script src="vendor\/lib\.min\.js">/);
  });
  for (const [tag, message] of [['<script async src="vendor/lib.js"></script>', /async/], ['<script type="module" src="vendor/lib.js"></script>', /module/]])
    page(`<html>${TEMPO}${tag}<script src="js/a.js"></script></html>`, { "js/a.js": "const A=1;", "vendor/lib.js": "1" }, (dir) => {
      assert.throws(() => gameScripts(dir), message, tag);
    });
});

// GPT's design review, finding 3: AGENTS.md has every local <script src> file syntax-checked, the vendored
// library included. Mutation: leave vendoredSources out of tools/check-syntax.mjs — the broken copy passes.
test("tools/check-syntax.mjs compiles the vendored scripts too, and fails on a broken one", () => {
  const run = (dir) => spawnSync(process.execPath, [join(ROOT, "tools", "check-syntax.mjs"), dir], { encoding: "utf8" });
  const html = `<html>${TEMPO}<script src="vendor/lib.js"></script><script src="js/a.js"></script></html>`;
  page(html, { "js/a.js": "const A = 1;", "vendor/lib.js": "var Lib = {};" }, (dir) => {
    const ok = run(dir);
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /^syntax OK \(1 script: js\/a\.js; vendored: vendor\/lib\.js\)/);
  });
  page(html, { "js/a.js": "const A = 1;", "vendor/lib.js": "var Lib = {;" }, (dir) => {
    const bad = run(dir);
    assert.notEqual(bad.status, 0);
    assert.match(bad.stderr, /vendor\/lib\.js:1/);
  });
});

test("a <!-- inside a script body is code, not an HTML comment", () => {
  const body = '\nconst marker = "<!-- audible -->";\n';
  page(`<html>${TEMPO}<script>${body}</script></html>`, {}, (dir) => {
    assert.equal(gameScripts(dir).scripts[0].src, body);
  });
});

test("a <script> written inside <style> is CSS text, and a quoted > in an attribute keeps the line right", () => {
  const html = ["<html><style>", "/* <script>throw 1;</script> */", "</style>", TEMPO,
    '<script data-note="a > b">', "const LINE = 5;", "</script></html>"].join("\n");
  page(html, {}, (dir) => {
    const { scripts } = gameScripts(dir);
    assert.equal(scripts.length, 1);
    assert.equal(scripts[0].src, "\nconst LINE = 5;\n");
    assert.equal(scripts[0].line, 5);
  });
});

test("script types and attributes that break document order are refused, not skipped", () => {
  const cases = [
    ['<script type="module" src="js/a.js"></script>', /module/],
    ['<script async src="js/a.js"></script>', /async/],
    ['<script defer src="js/a.js"></script>', /defer/],
    ["<script nomodule>const A=1;</script>", /nomodule/],
    ['<script type="text/template">x</script>', /unsupported script type/],
    ['<script src="js/missing.js"></script>', /cannot read.*missing\.js/],
  ];
  for (const [tag, message] of cases) {
    page(`<html>${TEMPO}${tag}<script>const Z=1;</script></html>`, { "js/a.js": "const A=1;" }, (dir) => {
      assert.throws(() => gameScripts(dir), message, tag);
    });
  }
  page(`<html>${TEMPO}<script type=" Text/JavaScript ">const A=1;</script></html>`, {}, (dir) => {
    assert.equal(gameScripts(dir).scripts.length, 1, "JS MIME types are case- and space-insensitive");
  });
});

test("loadGame runs each file separately: const reaches later files, the collector sees every name, getters stay live", () => {
  const html = `<html>${TEMPO}<script src="js/a.js"></script><script>
let count = 0;
function bump(){ count++; return count; }
</script><script src="js/b.js"></script></html>`;
  page(html, { "js/a.js": "const BASE = 10;\nfunction fromA(){ return BASE; }\n", "js/b.js": "const TOTAL = BASE + fromA();\nclass Late {}\n" }, (dir) => {
    const g = loadGame({ root: dir });
    assert.equal(g.TOTAL, 20);
    assert.equal(g.bump(), 1);
    assert.equal(g.count, 1, "a let binding is read live, not copied at load");
    assert.equal(typeof g.Late, "function");
    assert.equal(g.__scripts.length, 3);
    assert.equal(g.__scripts[2].name, "js/b.js");
    assert.equal(g.__script, joinScripts(gameScripts(dir).scripts));
  });
});

test("load-time code calling a function from a later file throws, naming the file — as in a browser", () => {
  // Concatenated into one script, `later` would be hoisted and this would pass. Separate classic
  // scripts don't hoist across files, so the browser throws on js/early.js — and so must the harness.
  const html = `<html>${TEMPO}<script src="js/early.js"></script><script>function later(){ return 1; }</script></html>`;
  page(html, { "js/early.js": "const x = later();\n" }, (dir) => {
    assert.throws(() => loadGame({ root: dir }), (err) =>
      /^js\/early\.js threw while loading/.test(err.message) && /later is not defined/.test(err.message)
      && err.cause?.name === "ReferenceError"); // the vm's own error, kept as cause (another realm: no instanceof)
  });
});

test("two files declaring the same top-level name fail to load", () => {
  const html = `<html>${TEMPO}<script src="js/a.js"></script><script>let SHARED = 2;</script></html>`;
  page(html, { "js/a.js": "let SHARED = 1;\n" }, (dir) => {
    checkSyntax(gameScripts(dir).scripts); // each file is fine on its own…
    assert.throws(() => loadGame({ root: dir }), /index\.html threw.*SHARED/s); // …together they are not
  });
});

test("a load error's stack points at the real line of index.html", () => {
  const html = ["<html>", TEMPO, "<script>", "const ok = 1;", "undefinedThing();", "</script></html>"].join("\n");
  page(html, {}, (dir) => {
    assert.throws(() => loadGame({ root: dir }), (err) => /index\.html:5\b/.test(err.cause.stack));
  });
});

test("checkSyntax compiles each file as a classic script, not a function body", () => {
  const one = (src) => [{ name: "js/x.js", src, line: 1 }];
  assert.throws(() => checkSyntax(one("return;")), SyntaxError, "top-level return is legal in new Function, not in a script");
  assert.throws(() => checkSyntax(one("const x = new.target;")), SyntaxError);
  assert.throws(() => checkSyntax(one("let a = ;")), (err) => /js\/x\.js:1/.test(err.stack));
  checkSyntax(one("const fine = 1;"));
});

test("applyPatches finds an anchor in whichever file holds it and requires it once across all files", () => {
  const scripts = Object.freeze([
    Object.freeze({ name: "js/a.js", src: "alpha(); shared();" }),
    Object.freeze({ name: "index.html", src: "beta(); shared();" }),
  ]);
  const out = applyPatches(scripts, [["beta()", "BETA()"], ["alpha()", "A$&()"]]);
  assert.equal(out[0].src, "A$&(); shared();", "replacement text is literal — no $& expansion");
  assert.equal(out[1].src, "BETA(); shared();");
  assert.equal(scripts[1].src, "beta(); shared();", "the input list is untouched");
  assert.throws(() => applyPatches(scripts, [["shared()", "x"]]), /Mutation anchor must occur once: shared\(\)/);
  assert.throws(() => applyPatches(scripts, [["gamma()", "x"]]), /Mutation anchor must occur once/);
  // Patches apply in sequence: the second sees the first's result.
  assert.equal(applyPatches(scripts, [["alpha()", "gamma()"], ["gamma()", "delta()"]])[0].src, "delta(); shared();");
  assert.equal(countAcross(scripts, "shared()"), 2);
});

test("the real page loads as a list: every local script in order, and __script is them joined", () => {
  const g = loadGame();
  const { scripts } = gameScripts();
  assert.ok(scripts.length >= 1);
  assert.equal(g.__scripts.length, scripts.length);
  assert.equal(g.__script, joinScripts(scripts));
  assert.ok(scripts.every((s) => !s.src.includes("\r")), "no CR survives normalisation");
});
