// TUN-81: the page makes no third-party requests. The fonts and the Cognito sign-in library are served from
// vendor/, as released, and nothing in the page's markup or CSS names another host. tests/helpers/vendor.mjs
// says what each check reads; the browser check in reviews/TUN-81-self-hosted-fonts-and-sign-in.md is the
// network half.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync, rmSync, mkdtempSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gameScripts, ROOT } from "./helpers/game-scripts.mjs";
import { vendorSums, vendorProblems, htmlThirdParty, cssThirdParty } from "./helpers/vendor.mjs";

const LIB = "cognito/amazon-cognito-identity.min.js";
const FONTS_CSS = readFileSync(join(ROOT, "vendor", "fonts", "fonts.css"), "utf8");
const PAGE = readFileSync(join(ROOT, "index.html"), "utf8");

test("vendor/ holds exactly the files SHA256SUMS lists, byte for byte", () => {
  assert.deepEqual(vendorProblems(), []);
  const listed = [...vendorSums().keys()];
  for (const f of [LIB, "cognito/LICENSE.txt", "cognito/NOTICE.txt", "fonts/fonts.css", "fonts/fredoka/OFL.txt", "fonts/nunito/OFL.txt"])
    assert.ok(listed.includes(f), "listed: " + f);
});

// Mutations, on a scratch copy of vendor/: a changed byte, a file added, a file removed, and SHA256SUMS lines
// that can't be read — each caught, never skipped.
test("a changed, added or missing vendored file is caught, and an unreadable SHA256SUMS line refused", (t) => {
  const root = mkdtempSync(join(tmpdir(), "tg-vendor-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const fresh = () => { rmSync(join(root, "vendor"), { recursive: true, force: true }); cpSync(join(ROOT, "vendor"), join(root, "vendor"), { recursive: true }); };
  const sums = join(root, "vendor", "SHA256SUMS");
  fresh();
  assert.deepEqual(vendorProblems(root), [], "the unmodified copy");
  const font = join(root, "vendor", "fonts", "nunito", "latin.woff2");
  const bytes = readFileSync(font); bytes[100] ^= 1; writeFileSync(font, bytes);
  assert.match(vendorProblems(root).join("\n"), /^vendor\/fonts\/nunito\/latin\.woff2 has SHA-256 [0-9a-f]{64}, SHA256SUMS says /);
  fresh(); writeFileSync(join(root, "vendor", "cognito", "extra.js"), "x");
  assert.deepEqual(vendorProblems(root), ["vendor/cognito/extra.js is not listed in SHA256SUMS"]);
  fresh(); rmSync(join(root, "vendor", "cognito", "NOTICE.txt"));
  assert.deepEqual(vendorProblems(root), ["vendor/cognito/NOTICE.txt is listed but missing"]);
  // The README and SHA256SUMS themselves are the only files that need no line.
  fresh(); writeFileSync(join(root, "vendor", "README.md"), "edited");
  assert.deepEqual(vendorProblems(root), []);
  const real = readFileSync(sums, "utf8");
  const first = real.split("\n")[0];
  for (const [text, why] of [
    [real.replace(first, first.toUpperCase()), /can't read/],
    [real.replace(first, first.replace("  ", " \t")), /can't read/],
    [real + first + "\n", /listed twice/],
    [real.replace(/ {2}cognito\//, "  ../cognito/"), /not a plain path/],
    [real.replace("\n", "\n\n"), /can't read ""/],
  ]) {
    writeFileSync(sums, text);
    assert.throws(() => vendorSums(root), why);
  }
});

test("vendor/README.md records the library's exact version, its source and the SHA-256 SHA256SUMS holds", () => {
  const readme = readFileSync(join(ROOT, "vendor", "README.md"), "utf8");
  assert.match(readme, /amazon-cognito-identity-js 6\.3\.22\b/);
  assert.ok(readme.includes("https://registry.npmjs.org/amazon-cognito-identity-js/-/amazon-cognito-identity-js-6.3.22.tgz"));
  const hash = /\*\*The library's SHA-256:\*\* `([0-9a-f]{64})`/.exec(readme);
  assert.ok(hash, "the README states the library's SHA-256");
  assert.equal(hash[1], vendorSums().get(LIB));
  for (const f of ["fonts/fredoka/OFL.txt", "fonts/nunito/OFL.txt"])
    assert.match(readFileSync(join(ROOT, "vendor", f), "utf8"), /SIL Open Font License, Version 1\.1/, f);
  assert.match(readFileSync(join(ROOT, "vendor", "cognito", "LICENSE.txt"), "utf8"), /Apache License/);
});

test("the page links the local fonts and loads the library from vendor/, before js/cloud.js reads it", () => {
  const links = [...PAGE.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
  assert.deepEqual(links.filter((l) => l.includes("vendor/fonts/fonts.css")), ['<link rel="stylesheet" href="vendor/fonts/fonts.css">']);
  const { scripts, vendored } = gameScripts();
  assert.deepEqual(vendored.map((v) => v.name), ["vendor/" + LIB]);
  assert.equal(scripts[0].name, "js/load-gate.js", "the library is not a game script; the gate is still the first");
  assert.ok(PAGE.indexOf(`src="vendor/${LIB}"`) < PAGE.indexOf('src="js/cloud.js"'), "AmazonCognitoIdentity exists when js/cloud.js runs");
});

// Parse fonts.css's @font-face rules: family, weight, and the url() each names.
function faces(css) {
  return [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(([, body]) => ({
    family: /font-family:\s*'([^']+)'/.exec(body)[1],
    weight: /font-weight:\s*(\d+)\s*;/.exec(body)[1],
    url: /src:\s*url\(([^)]+)\)\s*format\('woff2'\)/.exec(body)[1],
  }));
}

test("fonts.css declares every weight the page used, for every subset, from listed woff2 files — and uses them all", () => {
  const rules = faces(FONTS_CSS);
  assert.equal(rules.length, (FONTS_CSS.match(/@font-face/g) || []).length, "every rule parsed");
  const woff2 = [...vendorSums().keys()].filter((p) => p.endsWith(".woff2"));
  assert.deepEqual([...new Set(rules.map((r) => "fonts/" + r.url))].sort(), woff2.sort(), "each url() is a listed file, and each file is used");
  const want = { Fredoka: ["400", "500", "600"], Nunito: ["400", "600", "700", "800"] };
  for (const [family, weights] of Object.entries(want)) {
    const mine = rules.filter((r) => r.family === family);
    assert.deepEqual([...new Set(mine.map((r) => r.weight))].sort(), weights, family + " weights");
    const files = [...new Set(mine.map((r) => r.url))].sort();
    for (const w of weights)   // one rule per weight per subset, as Google declared them
      assert.deepEqual(mine.filter((r) => r.weight === w).map((r) => r.url).sort(), files, `${family} ${w}: every subset`);
  }
  assert.deepEqual([...new Set(rules.map((r) => r.family))].sort(), ["Fredoka", "Nunito"]);
});

test("no third-party reference in the page's markup or CSS", () => {
  assert.deepEqual(htmlThirdParty(PAGE), []);
  assert.deepEqual(cssThirdParty(FONTS_CSS), []);
});

// The scanner's own mutations: each line names one other host in a way a browser would fetch it.
test("the third-party scanner catches every way the page could name another host, and only those", () => {
  for (const [html, want] of [
    ['<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nunito">', "https://fonts.googleapis.com/css2?family=Nunito"],
    ['<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>', "https://fonts.gstatic.com"],
    ['<script src="https://cdn.jsdelivr.net/npm/x@6/x.js"></script>', "https://cdn.jsdelivr.net/npm/x@6/x.js"],
    ["<script src='//cdn.example/x.js'></script>", "//cdn.example/x.js"],
    ["<img src=http://img.example/a.png>", "http://img.example/a.png"],
    ['<img srcset="a.png 1x, https://img.example/b.png 2x">', "https://img.example/b.png"],
    ['<video poster=" https://v.example/p.jpg "></video>', "https://v.example/p.jpg"],
    ['<svg><image xlink:href="https://img.example/s.png"/></svg>', "https://img.example/s.png"],
    ['<div style="background:url(\'https://img.example/bg.png\')"></div>', "https://img.example/bg.png"],
    ["<style>@import url(https://fonts.example/a.css);</style>", "https://fonts.example/a.css"],
    ['<style>@import "//fonts.example/b.css";</style>', "//fonts.example/b.css"],
    ['<!-- <script src="https://cdn.example/old.js"></script> -->', "https://cdn.example/old.js"],
  ]) assert.deepEqual(htmlThirdParty(html), [want], html);
  // Controls: local paths, data: URLs, and links (a link fetches nothing until clicked).
  for (const html of [
    '<link rel="stylesheet" href="vendor/fonts/fonts.css"><script src="js/boot.js"></script>',
    '<img src="data:image/png;base64,AAAA"><div style="background:url(img/a.png)"></div>',
    '<a href="https://tunegarden.game/">home</a><area href="https://example.com/">',
    '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
  ]) assert.deepEqual(htmlThirdParty(html), [], html);
  assert.deepEqual(cssThirdParty("@font-face{src:url(\"https://fonts.gstatic.com/x.woff2\") format('woff2')}"), ["https://fonts.gstatic.com/x.woff2"]);
  assert.deepEqual(cssThirdParty("@font-face{src:url(nunito/latin.woff2) format('woff2')}"), []);
});

// The game's own scripts may name exactly two absolute URLs: the backend (cloud sync, signed-in players only)
// and the SVG namespace, which is a name, not a request. Cognito's endpoint lives in the vendored library.
test("the game's scripts name no host but the backend", () => {
  const allowed = new Set(["https://xush1pnxc7.execute-api.us-east-1.amazonaws.com", "http://www.w3.org/2000/svg"]);
  const found = new Set();
  for (const f of readdirSync(join(ROOT, "js")).filter((f) => f.endsWith(".js"))) {
    const text = readFileSync(join(ROOT, "js", f), "utf8");
    for (const m of text.matchAll(/https?:\/\/[^\s"'`)\\]+/gi)) found.add(m[0]);
    // Protocol-relative, at the start of a string: "//cdn.example/x.js" (a // comment is not in quotes).
    for (const m of text.matchAll(/["'`](\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+[^\s"'`]*)/gi)) found.add(m[1]);
  }
  assert.deepEqual([...found].filter((u) => !allowed.has(u)), []);
  assert.ok(found.has("https://xush1pnxc7.execute-api.us-east-1.amazonaws.com"), "the scan sees the backend URL (it is not blind)");
});
