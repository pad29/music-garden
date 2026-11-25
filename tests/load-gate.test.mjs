// TUN-7: the load gate (js/load-gate.js). Once the game became many classic scripts, the browser could hand input
// to a half-loaded game between them, and a failed file no longer stopped the ones after it. The gate holds input
// back until the page has loaded, and a failed game script keeps js/boot.js from starting the game at all.
//
// What this cannot see: a real DOM's event path (window capture → target) and a browser carrying on after a
// script fails. Node's EventTarget has one target and no phases, so the gate is exercised here on the window
// itself; both of the browser behaviours are checked on the deploy preview (reviews/TUN-7-rest-of-script.md).
import { test } from "node:test";
import assert from "node:assert";
import vm from "node:vm";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, isAbsolute } from "node:path";
import { gameScripts, ROOT } from "./helpers/game-scripts.mjs";
import { loadGame } from "./harness.mjs";

const GATE = readFileSync(join(ROOT, "js/load-gate.js"), "utf8").replace(/\r\n/g, "\n");
const BASE = "https://tunegarden.test/js/";

/** A fresh gate in its own context, with EventTargets standing in for window and document. */
function gate({ href = "https://tunegarden.test/index.html?dev#s=abc" } = {}) {
  const window = new EventTarget(), document = new EventTarget();
  document.currentScript = null;
  document.baseURI = href;                  // no <base> element: the base URL is the page's own address
  const ctx = vm.createContext({ window, document });
  vm.runInContext(GATE, ctx, { filename: "js/load-gate.js" });
  const api = vm.runInContext(`({ LOAD_GATE_EVENTS, isGameScriptError, gameScriptsLoaded, openLoadGate,
    get failed(){ return gameScriptFailed; }, get open(){ return loadGateOpen; } })`, ctx);
  return Object.assign(api, { window, document,
    error(filename){ const e = new Event("error"); Object.defineProperty(e, "filename", { value: filename }); window.dispatchEvent(e); },
    parsed(){ document.dispatchEvent(new Event("DOMContentLoaded")); } });
}

// Mutations: load js/palettes.js ahead of the gate; put the gate's tag after js/boot.js; move boot's guard below
// its ?reset line, or delete it. Each fails here.
test("load gate: it is the first game script, boot is the last, and boot asks it before doing anything", () => {
  const { scripts } = gameScripts();
  assert.deepStrictEqual(scripts.filter((s) => s.inline).map((s) => s.name), [], "no inline game script is left");
  assert.strictEqual(scripts[0].name, "js/load-gate.js");
  assert.strictEqual(scripts.at(-1).name, "js/boot.js");
  const code = scripts.at(-1).src.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("//"));
  assert.match(code[0], /^if\(!gameScriptsLoaded\(\)\) throw new Error\(/);
});

// Mutations: drop "keydown" or "pointerleave" from LOAD_GATE_EVENTS; wire a "dblclick" listener without listing
// it. Each fails here: a new kind of listener has to be declared input (gated) or not.
const NOT_INPUT = new Set(["scroll", "resize", "visibilitychange", "pagehide", "blur", "error", "load",
  "voiceschanged", "DOMContentLoaded", "statechange"]);   // statechange: the AudioContext's, for a waiting opening melody (TUN-125)
test("load gate: every kind of player input the game listens for is held back", () => {
  const listened = new Set();
  for (const s of gameScripts().scripts) {
    for (const m of s.src.matchAll(/addEventListener\(\s*["']([A-Za-z]+)["']/g)) listened.add(m[1]);
    for (const m of s.src.matchAll(/\.on([a-z]+)\s*=(?!=)/g)) listened.add(m[1]);
  }
  for (const t of ["click", "keydown", "pointerdown", "touchstart", "change", "scroll"])
    assert.ok(listened.has(t), `the scan sees the game's own "${t}" wiring`);
  const gated = new Set(gate().LOAD_GATE_EVENTS);
  assert.deepEqual([...listened].filter((t) => !gated.has(t) && !NOT_INPUT.has(t)).sort(), []);
  assert.deepEqual([...gated].filter((t) => NOT_INPUT.has(t)), [], "nothing is both input and not");
});

// Mutations: make loadGateSwallow a no-op; have openLoadGate forget to remove one listener, or remove them without
// the capture flag (removeEventListener then matches nothing). Each fails here.
test("load gate: input is swallowed before the game's own handlers until the gate opens", () => {
  const g = gate(), heard = [];
  for (const t of g.LOAD_GATE_EVENTS) g.window.addEventListener(t, (e) => heard.push(e.type));   // wired after the gate
  for (const t of g.LOAD_GATE_EVENTS) g.window.dispatchEvent(new Event(t));
  assert.deepEqual(heard, []);
  g.openLoadGate();
  for (const t of g.LOAD_GATE_EVENTS) g.window.dispatchEvent(new Event(t));
  assert.deepEqual(heard, [...g.LOAD_GATE_EVENTS]);
});

// Mutations: count every error (the vendored Cognito SDK's, an extension's, a sample pack's); ignore document.currentScript
// (a throw on file:// arrives with its filename hidden); ignore a <script> element's own load error; compare
// against the site root instead of the page's folder; take the folder from location.href rather than the
// document's base URL. Each fails here.
test("load gate: only an error from one of the game's own js/ files counts as a failed load", () => {
  const g = gate();
  assert.strictEqual(g.isGameScriptError({ target: { tagName: "SCRIPT", src: BASE + "grid.js" } }), true, "a file that never arrived");
  assert.strictEqual(g.isGameScriptError({ target: g.window, filename: BASE + "grid.js" }), true, "a file that threw");
  g.document.currentScript = { src: BASE + "grid.js" };
  assert.strictEqual(g.isGameScriptError({ target: g.window, filename: "" }), true, "a throw whose details are hidden");
  g.document.currentScript = null;
  for (const [what, e] of [
    // TUN-81: same origin, but outside js/ — the sign-in library stays optional, as it was on its CDN.
    ["the vendored Cognito SDK", { target: { tagName: "SCRIPT", src: "https://tunegarden.test/vendor/cognito/amazon-cognito-identity.min.js" } }],
    ["a third-party script", { target: { tagName: "SCRIPT", src: "https://cdn.example/lib.js" } }],
    ["a sample pack", { target: { tagName: "SCRIPT", src: "https://tunegarden.test/samples/piano.js" } }],
    ["an extension", { target: g.window, filename: "chrome-extension://abc/content.js" }],
    ["an error with no source", { target: g.window, filename: "" }],
  ]) assert.strictEqual(g.isGameScriptError(e), false, what);
  const nested = gate({ href: "https://tunegarden.test/play/" });
  assert.strictEqual(nested.isGameScriptError({ target: { tagName: "SCRIPT", src: BASE + "grid.js" } }), false, "not this page's js/");
  const local = gate({ href: "file:///C:/Claude/MusicTheory/index.html" });
  assert.strictEqual(local.isGameScriptError({ target: { tagName: "SCRIPT", src: "file:///C:/Claude/MusicTheory/js/boot.js" } }), true, "file://");
  // A <base href> (or a srcdoc document) moves where "js/…" resolves, away from the page's own address.
  const based = gate({ href: "https://assets.tunegarden.test/app/" });
  assert.strictEqual(based.isGameScriptError({ target: { tagName: "SCRIPT", src: "https://assets.tunegarden.test/app/js/grid.js" } }), true, "the base URL's js/");
  assert.strictEqual(based.isGameScriptError({ target: { tagName: "SCRIPT", src: BASE + "grid.js" } }), false, "not the page address's js/");
});

// Mutations: open the gate on DOMContentLoaded whatever the flag says; open it before boot has asked; keep
// recording errors after boot has asked (a throw inside boot would then shut a game that is already running).
test("load gate: a failed game script keeps the game from starting and the gate shut, and nothing else does", () => {
  let g = gate();
  assert.strictEqual(g.gameScriptsLoaded(), true); g.parsed(); assert.strictEqual(g.open, true, "all arrived: open");
  g = gate(); g.error(BASE + "quest-engine.js");
  assert.strictEqual(g.gameScriptsLoaded(), false, "boot is refused"); g.parsed(); assert.strictEqual(g.open, false);
  g = gate(); g.parsed(); assert.strictEqual(g.open, false, "boot never asked (js/boot.js itself is missing): shut");
  g = gate(); assert.strictEqual(g.gameScriptsLoaded(), true); g.error(BASE + "boot.js"); g.parsed();
  assert.strictEqual(g.open, true, "a throw inside a boot that has started is an ordinary runtime error");
  g = gate(); g.error("https://tunegarden.test/vendor/cognito/amazon-cognito-identity.min.js");
  assert.strictEqual(g.gameScriptsLoaded(), true, "the optional sign-in library (vendor/) does not stop the game");
});

// Mutations: delete boot's guard, or have it ask something other than the gate (`if(false) throw …`) — then a
// recorded failure boots the game anyway and nothing throws. (WHERE the guard sits is the first test's job.)
test("load gate: the real boot refuses to start when the gate recorded a failed game script", (t) => {
  const root = mkdtempSync(join(tmpdir(), "tg-load-gate-"));
  t.after(() => {
    const rel = relative(resolve(tmpdir()), resolve(root));
    assert.ok(rel && !rel.startsWith("..") && !isAbsolute(rel));
    rmSync(root, { recursive: true, force: true });
  });
  const put = (name, text) => { mkdirSync(dirname(join(root, name)), { recursive: true }); writeFileSync(join(root, name), text); };
  const { html, scripts } = gameScripts();
  const anchor = "let gameScriptFailed=false";
  assert.ok(scripts[0].src.includes(anchor));
  for (const s of scripts) put(s.name, s.src);
  put("index.html", html);
  assert.doesNotThrow(() => loadGame({ root }), "the unmodified copy boots");
  put("js/load-gate.js", scripts[0].src.replace(anchor, "let gameScriptFailed=true"));
  assert.throws(() => loadGame({ root }),
    /^Error: js\/boot\.js threw while loading in the harness: Tune Garden: a game script failed to load/);
});
