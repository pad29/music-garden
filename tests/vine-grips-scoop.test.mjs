// TUN-16: no vine grip while the Scoop is armed.
//
// growOn() refuses a grip drag while trayMode is on (it settles the pointer conflict with the Scoop), but
// renderVines() drew the grips on body.growing alone — so while scooping they were visible and inert. Now
// renderVines() leaves them out while trayMode is on; enterTray() (through trayPaint) and exitTray() both
// re-render after flipping trayMode, so ✕ Done brings them back. Stems, and a picked stem's .tsel, stay.
//
// The harness's stubs swallow writes, so the game loads with a RECORDING #vines layer, a real body
// classList and a createElement that keeps className / dataset / style. Everything that runs below is the
// game's own code: openStudio(), enterTray(), exitTray(), renderVines() and the #vines pointer handlers.

import { test } from "node:test";
import assert from "node:assert";
import { loadGame } from "./harness.mjs";

// A no-op that survives any use the game makes of an element it was given (like the harness's stub).
function noop() {
  return new Proxy(function () {}, {
    get(t, prop) {
      if (prop === "length") return 0;
      if (prop === Symbol.iterator) return function* () {};
      if (prop === Symbol.toPrimitive) return () => 0;
      if (prop === "then") return undefined;
      if (prop === "value" || prop === "textContent" || prop === "innerHTML" || prop === "id") return "";
      return noop();
    },
    set: () => true,
    apply: () => noop(),
    construct: () => noop(),
  });
}

function listenerBag() {
  const listeners = new Map();
  return {
    addEventListener(type, fn) {
      const list = listeners.get(type) || [];
      if (!list.includes(fn)) list.push(fn);
      listeners.set(type, list);
    },
    removeEventListener(type, fn) {
      listeners.set(type, (listeners.get(type) || []).filter((f) => f !== fn));
    },
    emit(type, event = {}) {
      for (const fn of [...(listeners.get(type) || [])]) fn(event);
    },
  };
}

function classList() {
  const s = new Set();
  return {
    add: (...c) => c.forEach((x) => s.add(x)),
    remove: (...c) => c.forEach((x) => s.delete(x)),
    toggle(c, force) { const on = force === undefined ? !s.has(c) : !!force; if (on) s.add(c); else s.delete(c); return on; },
    contains: (c) => s.has(c),
  };
}

// A div that keeps what renderVines and the pull write (className, dataset, style), answers closest() for
// the pointerdown hit test, and no-ops the rest — createElement also builds the grid's cells.
function makeDiv() {
  const o = { className: "", dataset: {}, style: {}, parentNode: null };
  const el = new Proxy(o, {
    get: (t, p) => (p in t ? t[p] : p === "closest" ? (sel) => (sel === ".grip" && t.className.split(" ").includes("grip") ? el : null) : noop()),
    set: (t, p, v) => { t[p] = v; return true; },
  });
  return el;
}

// The #vines layer: innerHTML="" empties it, appendChild records, querySelector finds a stem by id.
function makeVines() {
  let kids = [];
  const v = {
    ...listenerBag(),
    get children() { return kids; },
    set innerHTML(x) { if (x === "") { kids.forEach((k) => { k.parentNode = null; }); kids = []; } },
    get innerHTML() { return ""; },
    appendChild(k) { k.parentNode = v; kids.push(k); return k; },
    querySelector(sel) {
      const m = sel.match(/^\.stem\[data-id="(\d+)"\]$/);
      return m ? kids.find((k) => k.className.split(" ").includes("stem") && String(k.dataset.id) === m[1]) || null : null;
    },
  };
  return v;
}

// An element that keeps every write (onclick, textContent) and no-ops the rest.
function keep(own = {}) {
  return new Proxy(own, { get: (o, p) => (p in o ? o[p] : noop()), set: (o, p, v) => { o[p] = v; return true; } });
}

// Records each OUTERMOST tx label — the journal's own rule (setCell nests its own), as pair-integration does.
function txLog(g) {
  const labels = [], realTx = g.tx;
  let depth = 0;
  g.tx = (label, fn) => {
    if (depth === 0) labels.push(label);
    depth++;
    try { return realTx(label, fn); } finally { depth--; }
  };
  return labels;
}

function boot() {
  const vines = makeVines();
  const body = new Proxy({ classList: classList(), style: {} }, { get: (o, p) => (p in o ? o[p] : noop()), set: () => true });
  const g = loadGame({
    fresh: true,
    elements: {
      vines,
      trayBtn: keep(),            // the stub would swallow its onclick, and the test presses it
      // A real, unzoomed 1000×600 field at the viewport's origin, so the pull's field coordinates are plain arithmetic.
      grid: new Proxy({ offsetWidth: 1000, getBoundingClientRect: () => ({ left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600 }) },
        { get: (o, p) => (p in o ? o[p] : noop()), set: () => true }),
    },
    setup: (w) => {
      Object.defineProperty(w.document, "body", { value: body });
      Object.defineProperty(w.document, "createElement", { value: () => makeDiv() });
    },
  });
  g.openStudio();
  return { g, vines, body };
}

const grips = (vines) => vines.children.filter((k) => k.className === "grip");
const stems = (vines) => vines.children.filter((k) => k.className.split(" ").includes("stem"));

// Two seeds on the bottom row, the first one a 3-step vine; drawn the way the game draws after an edit.
function seedVine(g) {
  g.modelSetCell(g.ROWS - 1, 0, true);
  g.modelSetCell(g.ROWS - 2, 5, true);
  const n = g.melTrack().notes.find((q) => g.noteCol(q) === 0);
  n.durationTicks = 3 * g.TICKS_PER_COL;
  g.reproject();
  g.renderVines();
  return n;
}

test("the Studio grows vines, and draws a grip on every seed while the Scoop is idle", () => {
  const { g, vines, body } = boot();
  seedVine(g);
  assert.strictEqual(body.classList.contains("growing"), true, "openStudio turns growing on — the grips' own gate");
  assert.strictEqual(g.trayMode, false);
  assert.strictEqual(grips(vines).length, 2, "one grip per seed");
  assert.strictEqual(stems(vines).length, 1, "and one stem, for the vine");
});

test("arming the Scoop takes every grip away; the stems stay", () => {
  const { g, vines } = boot();
  seedVine(g);
  g.enterTray();
  assert.strictEqual(g.trayMode, true);
  assert.strictEqual(grips(vines).length, 0, "no grip is drawn while the Scoop is armed");
  assert.strictEqual(stems(vines).length, 1, "the vine's stem is still drawn");
});

test("a picked vine's stem still shows .tsel while scooping, with no grip", () => {
  const { g, vines } = boot();
  const n = seedVine(g);
  g.enterTray();
  g.traySel = [n.id];
  g.trayPaint();
  const s = stems(vines);
  assert.strictEqual(s.length, 1);
  assert.strictEqual(s[0].className, "stem tsel", "the pick is visible on its stem");
  assert.strictEqual(grips(vines).length, 0, "and repainting the pick brings no grip back");
});

test("an edit while scooping re-renders the vines without grips", () => {
  const { g, vines } = boot();
  seedVine(g);
  g.enterTray();
  g.setCell(g.ROWS - 3, 8, true);   // setCell is the edit path that re-renders the vines itself
  assert.strictEqual(grips(vines).length, 0, "a re-render while armed still draws no grip");
});

test("✕ Done brings every grip back", () => {
  const { g, vines } = boot();
  const n = seedVine(g);
  g.enterTray();
  g.traySel = [n.id];
  g.trayPaint();
  g.exitTray();
  assert.strictEqual(g.trayMode, false);
  assert.strictEqual(grips(vines).length, 2, "the grips are back on both seeds");
  assert.strictEqual(stems(vines)[0].className, "stem", "and the emptied pick's highlight is gone");
});

test("the trayBtn's ✕ Done (the player's exit) brings them back too", () => {
  const { g, vines } = boot();
  seedVine(g);
  g.trayBtn.onclick();          // 🧺 Scoop
  assert.strictEqual(grips(vines).length, 0);
  g.trayBtn.onclick();          // ✕ Done
  assert.strictEqual(grips(vines).length, 2);
});

test("a grip pull after ✕ Done still commits exactly one tx(\"grow\")", () => {
  const { g, vines } = boot();
  const n = seedVine(g);
  g.enterTray();
  g.exitTray();
  const grip = grips(vines).find((k) => String(k.dataset.id) === String(n.id));
  assert.ok(grip, "the vine's grip is drawn again");
  const txs = txLog(g);
  const ptr = (x) => ({ target: grip, pointerId: 1, clientX: x, clientY: 20, preventDefault() {}, stopPropagation() {} });
  vines.emit("pointerdown", ptr(100));
  assert.ok(g.pull, "the grip answers the press");
  vines.emit("pointermove", ptr(100 + 2 * g.TRAY_CW));   // two steps longer: 3 → 5
  vines.emit("pointerup", ptr(100 + 2 * g.TRAY_CW));
  assert.deepStrictEqual(txs, ["grow"], "exactly one transaction, and it is a grow");
  assert.strictEqual(n.durationTicks, 5 * g.TICKS_PER_COL, "the vine is two steps longer");
  assert.strictEqual(grips(vines).length, 2, "the release re-renders with its grips");
});

test("Grow and Trim still work while the Scoop is armed, on the pick", () => {
  const { g, vines } = boot();
  const n = seedVine(g);
  g.enterTray();
  g.traySel = [n.id];
  g.trayPaint();
  const txs = txLog(g);
  g.growTrim(+1);               // what 🌿 Grow and the G key both call (#growBtn's handler is growTrim(+1))
  assert.strictEqual(n.durationTicks, 4 * g.TICKS_PER_COL, "🌿 grows the picked vine while scooping");
  g.growTrim(-1);               // ✂ Trim
  assert.strictEqual(n.durationTicks, 3 * g.TICKS_PER_COL, "✂ trims it back");
  assert.deepStrictEqual(txs, ["grow", "grow"], "one transaction per press");
  assert.strictEqual(g.trayMode, true, "the Scoop stays armed");
  assert.strictEqual(stems(vines)[0].className, "stem tsel", "the pick still shows on its stem");
  assert.strictEqual(grips(vines).length, 0, "and Grow's own repaint draws no grip");
});

test("a grip press while scooping is refused (growOn), as before", () => {
  const { g, vines } = boot();
  const n = seedVine(g);
  const grip = grips(vines).find((k) => String(k.dataset.id) === String(n.id));   // a grip from before the Scoop
  g.enterTray();
  vines.emit("pointerdown", { target: grip, pointerId: 1, clientX: 100, clientY: 20, preventDefault() {}, stopPropagation() {} });
  assert.strictEqual(g.pull, null, "the drag path's own gate is unchanged");
});
