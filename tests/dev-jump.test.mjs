// TUN-69: the ?dev bar's package jump (#devpkg in js/boot.js). Its list is every key of PACKAGES, the
// hidden `studio` node included; picking Studio used to call openPkg("studio"), which setPlayScope
// refuses with a throw. These drive the real handler, installed by booting with ?dev.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame } from "./harness.mjs";

// A <select> that remembers its value: the voice (#instr) is the one the Studio sets.
function remembering() {
  let v = "";
  return { get value() { return v; }, set value(n) { v = String(n); }, options: [],
    style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, removeEventListener() {} };
}
// The level list (#devjump): records the options populateDevJump appends; innerHTML="" empties it.
function levelList() {
  const opts = [];
  return Object.defineProperties(remembering(), {
    opts: { value: opts },
    innerHTML: { get: () => "", set: () => { opts.length = 0; } },
    appendChild: { value: o => { opts.push(o); return o; } },
  });
}

function devBoot() {
  const devjump = levelList(), instr = remembering();
  const g = loadGame({ elements: { devjump, instr }, setup: w => {
    w.location = { ...w.location, search: "?dev", pathname: "/index.html" };
    w.history = { state: null, replaceState() {} };
    // populateDevJump builds <option>s; give them a value that sticks
    const create = w.document.createElement;
    Object.defineProperty(w.document, "createElement", { configurable: true,
      value: tag => tag === "option" ? { value: "", textContent: "" } : create(tag) });
  } });
  const pkg = g.__document.getElementById("devpkg");
  assert.equal(typeof pkg.onchange, "function", "?dev installs the #devpkg handler");
  const pick = id => { pkg.value = id; pkg.onchange({ target: pkg }); };
  return { g, pick, devjump, instr };
}

test("picking Studio in #devpkg opens the Studio, as the map's Open Studio does", () => {
  const { g, pick, instr } = devBoot();
  assert.notEqual(g.scopeCatalogId(), "studio", "boot does not start in the Studio");
  pick("studio");   // threw "setPlayScope: not a package: studio" before TUN-69
  assert.equal(g.isStudioScope(), true);
  assert.equal(g.scopeCatalogId(), "studio");
  assert.equal(g.levelIdx, 0);

  // the reference: the same entry the map's ▶ Open Studio makes
  const refInstr = remembering();
  const ref = loadGame({ fresh: true, elements: { instr: refInstr } });
  ref.openStudio();
  assert.equal(g.paletteId, ref.paletteId, "the Studio's palette");
  assert.equal(instr.value, refInstr.value, "the Studio's voice");
  assert.ok(instr.value, "a voice was set");
});

test("picking a real package in #devpkg jumps to its first level and lists its levels", () => {
  const { g, pick, devjump } = devBoot();
  pick("studio");
  const id = Object.keys(g.PACKAGES).find(k => k !== "studio" && g.PACKAGES[k].levels.length > 1);
  pick(id);
  assert.equal(g.activePackageId(), id);
  assert.equal(g.levelIdx, 0);
  assert.deepEqual(devjump.opts.map(o => +o.value), Array.from(g.PACKAGES[id].levels, (_, i) => i),
    "#devjump lists the package's levels");

  // re-picking the package you are in leaves you where you are
  g.__document.getElementById("devjump").onchange({ target: { value: "1" } });
  assert.equal(g.levelIdx, 1);
  pick(id);
  assert.equal(g.levelIdx, 1, "re-picking the current package does not restart it");
});
