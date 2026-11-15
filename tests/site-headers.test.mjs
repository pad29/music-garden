// `_headers` — the security and caching headers Cloudflare Pages sends with the site (TUN-86) — must
// exist, be published by the build, and say what the game needs: a content security policy that lets the page
// load only from its own site and connect only to the backend and Cognito, no framing by other sites,
// and a cache that keeps narration clips while always re-checking the page, the scripts and the packs.
//
// Why a test: the headers exist only on a real host. file:// and http-server send none, so nothing local
// shows a policy that blocks the game — it breaks in production only, and silently. The preview is the
// real proof (the review record has its curl -I output); this is the static half: it reads the file the
// way the host does (tests/helpers/site-headers.mjs), and works out the headers for every file the build
// publishes.
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { gameScripts, ROOT } from "./helpers/game-scripts.mjs";
import { parseBuildScript, publishedTree } from "./helpers/cloudflare-publish.mjs";
import { parseHeaders, headersFor, cspProblems, authEndpoints } from "./helpers/site-headers.mjs";

const read = (p) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const REAL = read("_headers");
const CLOUD = read("js/cloud.js");
const REAL_SH = read("cloudflare-build.sh");

const REVALIDATE = "public, max-age=0, must-revalidate";
// Clips: kept 30 days, exactly. Pinned rather than bounded (GPT's PR review, finding 2): "max-age=…,
// no-store" or "no-cache" would quietly stop the caching, and a year or "immutable" would keep a
// re-voiced clip, or the index.html a clip not yet baked was answered with, far too long.
const CLIP = "public, max-age=2592000";

// Every path the build publishes, as a request path, plus the page's root and a path that is no file
// (the single-page fallback answers it with index.html). `_headers` itself is read by the host, not served.
const published = () => [...publishedTree(ROOT, parseBuildScript(REAL_SH).copies).keys()].filter((p) => p !== "_headers");
const PATHS = () => ["/", ...published().map((p) => "/" + p)];

/** Everything wrong with a headers file, for the given request paths and js/cloud.js. */
function problems({ text = REAL, cloud = CLOUD, paths = PATHS() } = {}) {
  const { rules, refused, lines } = parseHeaders(text);
  const out = [...refused];
  if (rules.length > 100) out.push(`${rules.length} rules; Cloudflare allows 100`);
  lines.forEach((l, i) => { if (l.length > 2000) out.push(`line ${i + 1} is ${l.length} characters; Cloudflare allows 2,000`); });
  const endpoints = authEndpoints(cloud);
  for (const path of [...paths, "/a/path/that/is/no/file"]) {
    const { headers, twice } = headersFor(rules, path);
    out.push(...twice);
    const csp = headers.get("content-security-policy");
    if (!csp) out.push(`${path} gets no Content-Security-Policy`);
    else out.push(...cspProblems(csp, endpoints).map((p) => `${path}: ${p}`));
    if (headers.get("x-frame-options") !== "DENY") out.push(`${path}: X-Frame-Options is not DENY`);
    if (headers.get("x-content-type-options") !== "nosniff") out.push(`${path}: X-Content-Type-Options is not nosniff`);
    if (headers.get("referrer-policy") !== "no-referrer") out.push(`${path}: Referrer-Policy is not no-referrer`);
    if (path === "/a/path/that/is/no/file") continue;   // its cache is the host's default, like index.html's
    const cc = headers.get("cache-control");
    if (path.startsWith("/voice/")) {
      if (cc !== CLIP) out.push(`${path}: a narration clip's Cache-Control is "${cc}", expected "${CLIP}"`);
    } else if (cc !== REVALIDATE) out.push(`${path}: Cache-Control is "${cc}", expected "${REVALIDATE}"`);
  }
  return [...new Set(out)];
}

// Replace an anchor that must occur exactly once, so a mutation can never silently not apply.
const swap = (text, from, to) => {
  assert.strictEqual(text.split(from).length, 2, "anchor occurs once: " + from);
  return text.replace(from, to);
};
const hdr = (from, to) => swap(REAL, from, to);
const includesAll = (got, want) => {
  for (const w of want) assert.ok(got.includes(w), `expected problem:\n  ${w}\ngot:\n  ${got.slice(0, 12).join("\n  ")}`);
};

test("_headers exists, and the build publishes it", () => {
  assert.ok(REAL.trim().length > 0);
  assert.ok(parseBuildScript(REAL_SH).copies.some((c) => c.src === "_headers" && c.dst === "_headers" && !c.recursive));
});

test("every published file — the page, its scripts, the packs, the vendored files, every clip — gets the right headers, each once", () => {
  const paths = PATHS();
  // The checks really cover the page, a script, a pack, a vendored file and the clips.
  for (const p of ["/", "/index.html", "/js/boot.js", "/samples/piano.js", "/vendor/fonts/fonts.css"]) assert.ok(paths.includes(p), p);
  assert.ok(paths.filter((p) => /^\/voice\/[0-9a-f]+\.mp3$/.test(p)).length > 200, "the narration clips are published");
  assert.deepEqual(problems(), []);
});

test("the page's cache: always re-checked; the clips' cache: long", () => {
  const { rules } = parseHeaders(REAL);
  const cc = (p) => headersFor(rules, p).headers.get("cache-control");
  for (const p of ["/", "/index.html", "/js/boot.js", "/samples/piano.js", "/vendor/cognito/amazon-cognito-identity.min.js"])
    assert.strictEqual(cc(p), REVALIDATE, p);
  const clip = published().find((p) => p.startsWith("voice/"));
  assert.strictEqual(cc("/" + clip), CLIP);
});

test("connect-src follows js/cloud.js: moving the API or the region is caught here, not in production", () => {
  const ep = authEndpoints(CLOUD);
  assert.deepEqual(ep, { api: "https://xush1pnxc7.execute-api.us-east-1.amazonaws.com", cognito: "https://cognito-idp.us-east-1.amazonaws.com" });
  const moved = CLOUD.replace("xush1pnxc7.execute-api", "abcdefghij.execute-api");
  includesAll(problems({ cloud: moved, paths: ["/"] }), [`/: CSP connect-src is "${ep.api} ${ep.cognito}", expected "https://abcdefghij.execute-api.us-east-1.amazonaws.com ${ep.cognito}"`]);
  const region = CLOUD.replace('region:"us-east-1"', 'region:"eu-west-1"');
  assert.ok(problems({ cloud: region, paths: ["/"] }).some((p) => p.includes("connect-src") && p.includes("cognito-idp.eu-west-1")));
});

// Mutations: each is the real file with one mistake, and each must be caught.
test("a loosened policy is caught: inline scripts, eval, a third party, a missing directive, framing", () => {
  const csp = (from, to) => problems({ text: hdr(from, to), paths: ["/"] });
  includesAll(csp("script-src 'self';", "script-src 'self' 'unsafe-inline';"), [`/: CSP script-src is "'self' 'unsafe-inline'", expected "'self'"`]);
  includesAll(csp("script-src 'self';", "script-src 'self' 'unsafe-eval';"), [`/: CSP script-src is "'self' 'unsafe-eval'", expected "'self'"`]);
  includesAll(csp("font-src 'self';", "font-src 'self' https://fonts.gstatic.com;"), [`/: CSP font-src is "'self' https://fonts.gstatic.com", expected "'self'"`]);
  includesAll(csp("media-src 'self';", "media-src 'self' blob: data:;"), [`/: CSP media-src is "'self' blob: data:", expected "'self'"`]);
  includesAll(csp("default-src 'self'; ", ""), ["/: CSP has no default-src"]);
  includesAll(csp("; frame-ancestors 'none'", ""), ["/: CSP has no frame-ancestors"]);
  includesAll(csp("; frame-ancestors 'none'", "; frame-ancestors *"), [`/: CSP frame-ancestors is "*", expected "'none'"`]);
  includesAll(csp("object-src 'none'; ", "object-src 'none'; worker-src blob:; "), ["/: CSP has an unexpected directive: worker-src"]);
  includesAll(csp("  X-Frame-Options: DENY\n", ""), ["/: X-Frame-Options is not DENY"]);
  includesAll(csp("  X-Content-Type-Options: nosniff\n", ""), ["/: X-Content-Type-Options is not nosniff"]);
  includesAll(csp("  Referrer-Policy: no-referrer\n", ""), ["/: Referrer-Policy is not no-referrer"]);
  // The policy only on the page, not on the scripts: a script path is then caught.
  includesAll(problems({ text: hdr("\n/*\n", "\n/index.html\n"), paths: ["/js/boot.js"] }), ["/js/boot.js gets no Content-Security-Policy"]);
});

// GPT's PR review, finding 1: a browser uses a repeated directive's FIRST occurrence, so a wrong copy
// in front of the real one must be caught, not hidden by it — whatever its case.
test("a repeated directive is caught, in any case: the browser would obey the first copy", () => {
  for (const [extra, name] of [["script-src * 'unsafe-inline' 'unsafe-eval'; ", "script-src"], ["script-src 'none'; ", "script-src"],
    ["connect-src *; ", "connect-src"], ["SCRIPT-SRC 'none'; ", "script-src"]]) {
    includesAll(problems({ text: hdr("Content-Security-Policy: default-src", "Content-Security-Policy: " + extra + "default-src"), paths: ["/"] }),
      [`/: CSP repeats ${name} (a browser uses only the first)`]);
  }
  // A repeat after the real one is refused too: the policy must say each thing once.
  includesAll(problems({ text: hdr("; frame-ancestors 'none'", "; frame-ancestors 'none'; frame-ancestors *"), paths: ["/"] }),
    ["/: CSP repeats frame-ancestors (a browser uses only the first)"]);
  assert.deepEqual(problems({ paths: ["/"] }), []);   // the control: the real policy, unchanged
});

test("a wrong cache is caught: scripts or packs kept long, a clip cached any other way, a published folder with no rule", () => {
  const long = "public, max-age=31536000";
  const jsRule = `/js/*\n  Cache-Control: ${REVALIDATE}`, packRule = `/samples/*\n  Cache-Control: ${REVALIDATE}`;
  includesAll(problems({ text: hdr(jsRule, `/js/*\n  Cache-Control: ${long}`), paths: ["/js/boot.js"] }),
    [`/js/boot.js: Cache-Control is "${long}", expected "${REVALIDATE}"`]);
  includesAll(problems({ text: hdr(packRule, `/samples/*\n  Cache-Control: ${long}`), paths: ["/samples/piano.js"] }),
    [`/samples/piano.js: Cache-Control is "${long}", expected "${REVALIDATE}"`]);
  includesAll(problems({ text: hdr(`/index.html\n  Cache-Control: ${REVALIDATE}\n`, ""), paths: ["/index.html"] }),
    [`/index.html: Cache-Control is "undefined", expected "${REVALIDATE}"`]);
  const clip = "/" + published().find((p) => p.startsWith("voice/"));
  // GPT's PR review, finding 2: each of these passed the old "a week or more, not immutable" check.
  for (const wrong of ["public, max-age=2592000, immutable", "public, max-age=0", "public, max-age=2592000, no-store",
    "public, max-age=2592000, no-cache", "public, max-age=315360000", "public, max-age=31536000"]) {
    includesAll(problems({ text: hdr(`Cache-Control: ${CLIP}`, `Cache-Control: ${wrong}`), paths: [clip] }),
      [`${clip}: a narration clip's Cache-Control is "${wrong}", expected "${CLIP}"`]);
  }
  assert.deepEqual(problems({ paths: [clip] }), []);   // the control: the real rule passes
  // A folder added to the build later, with no cache rule of its own.
  includesAll(problems({ paths: ["/images/logo.svg"] }), [`/images/logo.svg: Cache-Control is "undefined", expected "${REVALIDATE}"`]);
});

test("a header two matching rules both set is caught: Cloudflare would join them with a comma", () => {
  includesAll(problems({ text: REAL + "\n/*\n  Cache-Control: no-store\n", paths: ["/js/boot.js"] }),
    ["/js/boot.js gets Cache-Control from both /js/* and /*"]);
  includesAll(problems({ text: REAL + "\n/js/*\n  X-Frame-Options: SAMEORIGIN\n", paths: ["/js/boot.js"] }),
    ["/js/boot.js gets X-Frame-Options from both /* and /js/*"]);
});

test("a line the reader cannot read is refused, never skipped", () => {
  for (const [extra, refused] of [
    ["  X-Test: 1\n/x\n  A: b", "line 1: a header before any path: X-Test: 1"],
    ["/js/*\n  ! Cache-Control", "a detach line: ! Cache-Control"],
    ["/voice/:name.mp3\n  A: b", "a placeholder or URL in a path: /voice/:name.mp3"],
    ["https://music-garden.pages.dev/*\n  A: b", "not a path: https://music-garden.pages.dev/*"],
    ["/a/*/b/*\n  A: b", "more than one * in a path: /a/*/b/*"],
    ["/js/*\n  Cache-Control public", 'not a "Name: value" header: Cache-Control public'],
    ["/empty", "a rule with no headers: /empty"],
  ]) {
    const text = extra.startsWith(" ") ? extra : REAL + "\n" + extra + "\n";
    const got = problems({ text, paths: ["/"] });
    assert.ok(got.some((p) => p.endsWith(refused)), `expected "${refused}" refused; got:\n  ${got.slice(0, 6).join("\n  ")}`);
  }
  // Comments, indented or not, and blank lines are fine.
  assert.deepEqual(problems({ text: "# top\n" + REAL.replace("\n/*\n", "\n/*\n  # the policy:\n") + "\n\n", paths: ["/"] }), []);
});

test("Cloudflare's limits: at most 100 rules, no line over 2,000 characters", () => {
  const many = REAL + Array.from({ length: 100 }, (_, i) => `\n/x${i}\n  A: b\n`).join("");
  includesAll(problems({ text: many, paths: ["/"] }), [`${parseHeaders(many).rules.length} rules; Cloudflare allows 100`]);
  const wide = hdr("form-action 'none'", "form-action 'none'" + "; x".repeat(1000));
  assert.ok(problems({ text: wide, paths: [] }).some((p) => /^line \d+ is \d+ characters; Cloudflare allows 2,000$/.test(p)));
});

// What `script-src 'self'` would block, kept out of the page so the policy stays that strict: an inline
// <script>, an on…= attribute in the page or in HTML a script writes, and code built from strings.
const ON_ATTR = /<[a-z][^<>]*\son[a-z]+\s*=/i;
const STRING_CODE = /\beval\s*\(|\bnew\s+Function\s*\(|\bset(?:Timeout|Interval)\s*\(\s*["'`]/;
const codeFiles = () => [
  ...readdirSync(join(ROOT, "js")).filter((f) => f.endsWith(".js")).map((f) => "js/" + f),
  "vendor/cognito/amazon-cognito-identity.min.js",
];
// The one exception, in the vendored sign-in library: webpack's globalThis shim. Its `new Function`
// runs only where globalThis is missing — no browser that enforces a CSP — and sits in a try whose
// catch falls back to window, so the policy blocking it changes nothing. Allowed once, exactly.
const WEBPACK_GLOBAL = 'if("object"==typeof globalThis)return globalThis;try{return this||new Function("return this")()}catch(e){if("object"==typeof window)return window}';
const withoutShim = (f, src) => {
  if (!f.startsWith("vendor/")) return src;
  assert.strictEqual(src.split(WEBPACK_GLOBAL).length, 2, `${f}: webpack's globalThis shim, exactly once`);
  return src.replace(WEBPACK_GLOBAL, "");
};
test("the page has nothing script-src 'self' would block: no inline script, no on…= attribute, no eval", () => {
  assert.deepEqual(gameScripts().scripts.filter((s) => s.inline).map((s) => s.line), [], "no inline <script> in index.html");
  assert.ok(!ON_ATTR.test(read("index.html")), "no on…= attribute in index.html");
  for (const f of codeFiles()) {
    const src = withoutShim(f, read(f));
    assert.ok(!ON_ATTR.test(src), `${f} writes HTML with an on…= attribute`);
    assert.ok(!STRING_CODE.test(src), `${f} runs code from a string`);
  }
  // The patterns themselves catch what they are for.
  for (const s of ['el.innerHTML = `<button class="b" onclick="go()">`', '<div onclick=go()>']) assert.ok(ON_ATTR.test(s), s);
  for (const s of ["eval(x)", "new Function('a', b)", 'setTimeout("go()", 5)']) assert.ok(STRING_CODE.test(s), s);
  for (const s of ["el.onclick = go", "setTimeout(go, 5)", "a < b && c.onload=d"]) {
    assert.ok(!ON_ATTR.test(s) && !STRING_CODE.test(s), s);
  }
});
