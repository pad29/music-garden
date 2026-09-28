// The script loader itself: tests/helpers/game-scripts.mjs and the way loadGame() runs its list.
// With index.html still one inline script, the rest of the suite barely exercises either, so these
// build tiny throwaway pages in a temp directory and load them the way the game will be loaded once
// its code moves into js/ files: several classic scripts, in document order, in one context.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gameScripts, applyPatches, countAcross, joinScripts, checkSyntax } from "./helpers/game-scripts.mjs";
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

test("a <!-- inside a script body is code, not an HTML comment", () => {
  const body = '\nconst marker = "<!-- audible -->";\n';
  page(`<html>${TEMPO}<script>${body}</script></html>`, {}, (dir) => {
    assert.equal(gameScripts(dir).scripts[0].src, body);
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

test("the real page loads as a list today: one inline script, and __script is exactly it", () => {
  const g = loadGame();
  const { scripts } = gameScripts();
  assert.ok(scripts.length >= 1);
  assert.equal(g.__scripts.length, scripts.length);
  assert.equal(g.__script, joinScripts(scripts));
  assert.ok(scripts.every((s) => !s.src.includes("\r")), "no CR survives normalisation");
});
