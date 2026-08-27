// Test harness for Tune Garden.
//
// The whole game lives in one <script> tag inside index.html, and that script does a lot of
// top-level DOM wiring on load. So a test can't import it — the harness instead runs the
// script inside a vm context with stubbed browser globals, then hands back every top-level
// binding it declared.
//
// Zero dependencies, on purpose: the game itself has none, and `node --test` is built in.
//
//   import { loadGame } from "./harness.mjs";
//   const g = await loadGame();
//   g.contourSeq([...]);      // any top-level function or const from index.html
//
// The stubbed DOM absorbs anything (see makeStub) rather than emulating a browser. That makes
// PURE logic testable — detectors, contour/motion math, chord and cadence helpers, the song
// format, palette maths. It does NOT make rendering or audio testable: those call into stubs
// that do nothing. Don't write a test that asserts on what got drawn or what was heard; verify
// that in a real browser (see AGENTS.md § "How changes are verified").

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** A proxy that swallows any property access, call, or construction and returns another one. */
function makeStub(name = "stub") {
  const target = function () {};
  target.__stub = name;
  return new Proxy(target, {
    get(t, prop) {
      // A few properties must return real values or callers loop forever / crash.
      if (prop === "length") return 0;
      if (prop === "value" || prop === "textContent" || prop === "innerHTML" || prop === "id") return "";
      if (prop === "children" || prop === "childNodes" || prop === "classList") {
        // classList needs add/remove/toggle/contains; an array-like covers children.
        return prop === "classList"
          ? { add() {}, remove() {}, toggle() {}, contains: () => false }
          : [];
      }
      if (prop === Symbol.iterator) return function* () {};
      if (prop === Symbol.toPrimitive) return () => 0;
      if (prop === "then") return undefined; // never look like a promise
      if (prop === "toString") return () => `[${name}]`;
      if (prop in t && typeof t[prop] !== "undefined") return t[prop];
      return makeStub(`${name}.${String(prop)}`);
    },
    set() {
      return true;
    },
    apply() {
      return makeStub(`${name}()`);
    },
    construct() {
      return makeStub(`new ${name}`);
    },
    has() {
      return true;
    },
  });
}

function makeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
}

// The regular DOM proxy intentionally ignores state.  Tempo is the one control whose native
// range semantics are data-model behaviour: assigning an out-of-range famous/song tempo clamps
// before stepDur(), snapshots, and saveProgress() can read it.  Keep this deliberately narrow;
// rendering and the rest of the controls remain outside this harness's remit.
function tempoRangeFromHtml(html) {
  const tag = html.match(/<input\b[^>]*\bid=["']tempo["'][^>]*>/i)?.[0];
  if (!tag) throw new Error("No #tempo input in index.html");
  const attr = (name, fallback) => {
    const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))`, "i"));
    return m ? Number(m[1] ?? m[2] ?? m[3]) : fallback;
  };
  return { min: attr("min", 0), max: attr("max", 100), value: attr("value", 50), step: attr("step", 1) };
}

function makeTempoRange({ min, max, value, step }) {
  let current = value;
  const clamp = (next) => {
    let n = Number(next);
    if (!Number.isFinite(n)) n = value;
    n = Math.max(min, Math.min(max, n));
    if (step > 0) n = min + Math.round((n - min) / step) * step;
    return Math.max(min, Math.min(max, n));
  };
  return {
    min: String(min), max: String(max), step: String(step),
    get value() { return String(current); },
    set value(next) { current = clamp(next); },
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    style: {},
    addEventListener() {}, removeEventListener() {},
  };
}

/**
 * Names of every top-level binding the script declares, so we can hand them back.
 * Handles multi-declarator statements (`let COLS = 16, ROWS = MIDI.length;`) by splitting the
 * declaration at depth-0 commas. Over-extraction is harmless — unresolvable names are skipped.
 */
function topLevelNames(src) {
  const names = new Set();

  for (const m of src.matchAll(/^(?:async\s+)?(?:function\*?|class)\s+([A-Za-z_$][\w$]*)/gm)) {
    names.add(m[1]);
  }

  // Scan line by line rather than statement by statement: a trailing `//` comment means a
  // declaration doesn't end at a `;` on its own line, and a regex that scans on would swallow
  // the next declaration whole (this cost us `NAMES` in `let MIDI = …; // …` / `let NAMES = …`).
  for (const line of src.split("\n")) {
    const start = line.match(/^(?:const|let|var)\s+/);
    if (!start) continue;
    const rest = line.slice(start[0].length);

    let depth = 0;
    let quote = null;
    let piece = "";
    const pieces = [];
    for (let i = 0; i < rest.length; i++) {
      const ch = rest[i];
      if (quote) {
        if (ch === quote && rest[i - 1] !== "\\") quote = null;
        piece += ch;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") quote = ch;
      else if ("([{".includes(ch)) depth++;
      else if (")]}".includes(ch)) depth--;
      else if (depth === 0 && ch === "/" && rest[i + 1] === "/") break; // trailing comment
      else if (depth === 0 && ch === ";") break; // end of the declaration
      else if (ch === "," && depth === 0) {
        pieces.push(piece);
        piece = "";
        continue;
      }
      piece += ch;
    }
    pieces.push(piece);

    for (const p of pieces) {
      const plain = p.match(/^\s*([A-Za-z_$][\w$]*)/);
      if (plain) {
        names.add(plain[1]);
        continue;
      }
      // Destructuring: grab the identifiers and let the try/catch discard any that aren't real.
      const pattern = p.split("=")[0];
      for (const id of pattern.matchAll(/([A-Za-z_$][\w$]*)/g)) names.add(id[1]);
    }
  }

  // Destructuring patterns leak keywords ("new", "typeof", ...) which would be a syntax error
  // in the generated collector, not a skippable runtime failure. Drop them.
  const RESERVED = new Set(
    ("await break case catch class const continue debugger default delete do else enum export " +
      "extends false finally for function if implements import in instanceof interface let new " +
      "null package private protected public return static super switch this throw true try " +
      "typeof var void while with yield")
      .split(" ")
  );
  return [...names].filter((n) => /^[A-Za-z_$][\w$]*$/.test(n) && !RESERVED.has(n));
}

let cached = null;

/**
 * Run index.html's inline script in a stubbed browser and return its top-level bindings.
 * Cached — the script is ~5.5k lines and every test file would otherwise re-run it.
 * Pass { fresh: true } for a test that needs an unmutated copy of the game's state.
 */
export function loadGame({ fresh = false } = {}) {
  if (cached && !fresh) return cached;

  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!match) throw new Error("No inline <script> found in index.html");
  const src = match[1];

  const tempoInput = makeTempoRange(tempoRangeFromHtml(html));
  const stubDoc = makeStub("document");
  Object.defineProperty(stubDoc, "getElementById", {
    value: (id) => (id === "tempo" ? tempoInput : makeStub(`document#${id}`)),
  });
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Math,
    JSON,
    Date,
    Promise,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Map,
    Set,
    Error,
    RegExp,
    Uint8Array,
    Float32Array,
    ArrayBuffer,
    Intl,
    performance,
    atob: (s) => Buffer.from(s, "base64").toString("binary"),
    btoa: (s) => Buffer.from(s, "binary").toString("base64"),
    document: stubDoc,
    localStorage: makeStorage(),
    sessionStorage: makeStorage(),
    location: { hash: "", search: "", href: "file:///index.html", protocol: "file:", reload() {} },
    navigator: { userAgent: "node-test", language: "en-US", maxTouchPoints: 0 },
    requestAnimationFrame: (fn) => setTimeout(() => fn(0), 0),
    cancelAnimationFrame: clearTimeout,
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    ResizeObserver: undefined, // index.html guards on window.ResizeObserver
    AudioContext: makeStub("AudioContext"),
    webkitAudioContext: makeStub("webkitAudioContext"),
    Audio: makeStub("Audio"),
    Image: makeStub("Image"),
    speechSynthesis: makeStub("speechSynthesis"),
    SpeechSynthesisUtterance: makeStub("SpeechSynthesisUtterance"),
    // Deliberately absent: fetch/XMLHttpRequest. index.html must never use them for local
    // assets (AGENTS.md hard invariant) — if a test blows up here, that's the bug.
  };
  sandbox.addEventListener = () => {};
  sandbox.removeEventListener = () => {};
  sandbox.dispatchEvent = () => true;
  sandbox.scrollTo = () => {};
  sandbox.getComputedStyle = () => makeStub("computedStyle");
  sandbox.alert = () => {};
  sandbox.confirm = () => false;
  sandbox.prompt = () => null;
  sandbox.innerWidth = 1280;
  sandbox.innerHeight = 800;
  sandbox.devicePixelRatio = 1;
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  sandbox.top = sandbox;

  const ctx = vm.createContext(sandbox);

  // vm keeps top-level const/let/function out of the context object, so append an explicit
  // collector. Bindings are exposed as live getters, not copied values, so that reassignments
  // made by the game (setPalette swaps MIDI/NAMES/ROWS wholesale) stay visible to the test.
  // Names that fail to resolve — over-extracted from a destructuring pattern, say — are skipped.
  const names = topLevelNames(src);
  const collector =
    "\n;globalThis.__api = {};\n" +
    names
      .map(
        (n) =>
          `try{ ${n}; Object.defineProperty(globalThis.__api, ${JSON.stringify(n)}, {` +
          `get(){ return ${n}; }, set(v){ ${n} = v; }, enumerable:true, configurable:true }); }catch(e){}`
      )
      .join("\n");

  try {
    vm.runInContext(src + collector, ctx, { filename: "index.html", timeout: 30000 });
  } catch (err) {
    throw new Error(
      `index.html's script threw while loading in the harness: ${err.message}\n` +
        "If this is a real bug, fix index.html. If the harness is missing a browser API, add a " +
        "stub to tests/harness.mjs — do not weaken the game to satisfy the test."
    );
  }

  // Don't spread — that would evaluate the getters once and lose liveness.
  const api = sandbox.__api;
  Object.defineProperty(api, "__window", { value: sandbox });
  Object.defineProperty(api, "__document", { value: stubDoc });
  if (!fresh) cached = api;
  return api;
}

/**
 * Clear the melody grid and plant one note per column at the given ladder rows.
 *
 * Rows are counted the way `contourSeq()` reports them — 0 = bottom of the ladder — so
 * `plant(g, [0, 1, 2])` is a rising line. `null` leaves that column empty.
 * Returns the resulting contour, since nearly every detector wants it.
 */
export function plant(g, rows) {
  for (let r = 0; r < g.ROWS; r++) for (let c = 0; c < g.COLS; c++) g.grid[r][c] = 0;
  rows.forEach((row, c) => {
    if (row != null) g.grid[g.ROWS - 1 - row][c] = 1;
  });
  return g.contourSeq();
}
