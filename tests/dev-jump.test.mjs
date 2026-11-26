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

// `devpkg`: a test's own recording #devpkg, or none for the harness's default makeSelect.
function devBoot({ devpkg = null } = {}) {
  const devjump = levelList(), instr = remembering();
  const elements = devpkg ? { devjump, instr, devpkg } : { devjump, instr };
  const g = loadGame({ elements, setup: w => {
    w.location = { ...w.location, search: "?dev", pathname: "/index.html" };
    w.history = { state: null, replaceState() {} };
    // populateDevJump builds <option>s; give them a value that sticks
    const create = w.document.createElement;
    Object.defineProperty(w.document, "createElement", { configurable: true,
      value: tag => tag === "option" ? { value: "", textContent: "" } : create(tag) });
  } });
  const pkg = g.__document.getElementById("devpkg");
  if (devpkg) assert.equal(pkg, devpkg, "a caller's own #devpkg wins over the harness's");
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

test("Studio then a real package: each jump lands, and #devjump follows it", () => {
  // the package list, recorded: a pick must be one of its options, not any string the stub accepts
  const opts = [];
  const devpkg = Object.defineProperties(remembering(), {
    options: { value: opts },
    appendChild: { value: o => { opts.push(o); return o; } },
  });
  const { g, pick, devjump } = devBoot({ devpkg });
  const listed = () => devjump.opts.map(o => [String(o.value), o.textContent]);
  const levelsOf = id => Array.from(g.PACKAGES[id].levels, (L, i) => [String(i), `${i + 1}. ${L.name}`]);
  const values = opts.map(o => o.value);
  assert.ok(values.includes("studio"), "#devpkg lists Studio");
  assert.ok(values.includes("footsteps"), "#devpkg lists Footsteps");
  const bootPkg = g.scopeCatalogId();
  assert.ok(bootPkg && bootPkg !== "footsteps" && bootPkg !== "studio", "boot opens another package");
  assert.deepEqual(listed(), levelsOf(bootPkg), "#devjump lists the boot package's levels");

  pick("studio");
  assert.equal(g.isStudioScope(), true);
  assert.deepEqual(listed(), levelsOf("studio"), "#devjump lists the Studio's one level");

  pick("footsteps");
  assert.equal(g.activePackageId(), "footsteps");
  assert.equal(g.levelIdx, 0);
  assert.ok(g.PACKAGES.footsteps.levels.length > 1);
  assert.deepEqual(listed(), levelsOf("footsteps"), "#devjump lists Footsteps' levels, in order");

  // re-picking the package you are in leaves you where you are
  g.__document.getElementById("devjump").onchange({ target: { value: "1" } });
  assert.equal(g.levelIdx, 1);
  pick("footsteps");
  assert.equal(g.levelIdx, 1, "re-picking the current package does not restart it");
});
