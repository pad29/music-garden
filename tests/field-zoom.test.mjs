// Field-zoom interaction coverage.  The DOM harness cannot produce browser compatibility
// mouse events, so pointer sequences below model the relevant listener inputs; browser event
// ordering and touch-action cancellation still need device verification.

import { test } from "node:test";
import assert from "node:assert";
import { loadGame } from "./harness.mjs";

function fakeEventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, fn) {
      const list = listeners.get(type) || [];
      list.push(fn);
      listeners.set(type, list);
    },
    removeEventListener(type, fn) {
      const list = listeners.get(type) || [];
      listeners.set(type, list.filter((candidate) => candidate !== fn));
    },
    emit(type, event) {
      for (const fn of [...(listeners.get(type) || [])]) fn({ type, ...event });
    },
    listenerCount(type) {
      return (listeners.get(type) || []).length;
    },
  };
}

function clearGarden(g) {
  g.modelClearMelody();
  for (let d = 0; d < g.drumG.length; d++) {
    for (let c = 0; c < g.drumG[d].length; c++) g.modelSetDrum(d, c, false);
  }
}

test("look-only blocks both beds", () => {
  const g = loadGame({ fresh: true });
  clearGarden(g);

  g.setFieldZoom(g.ZOOM_LOOK);
  g.cellClick(3, 2, g.cells[3][2]);
  g.drumClick(0, 2);
  assert.strictEqual(g.grid[3][2], false);
  assert.strictEqual(g.drumG[0][2], false);
});

// The swallow is ONE-SHOT, not a dead window: it eats the synthesized mousedown that belongs to
// the tap, and the child's very next press plants. That is what lets the deadline be generous.
test("a booked swallow eats exactly one press on the melody bed, then planting resumes", () => {
  const g = loadGame({ fresh: true });
  clearGarden(g);

  g.setFieldZoom(g.ZOOM_PLANT);
  g.swallowTapUntil = performance.now() + 900;
  g.cellClick(3, 2, g.cells[3][2]);
  assert.strictEqual(g.grid[3][2], false, "the tap's own compatibility mousedown is swallowed");

  g.cellClick(3, 2, g.cells[3][2]);
  assert.strictEqual(g.grid[3][2], true, "the next press plants — no waiting out a clock");
});

test("a booked swallow eats exactly one press on the beat bed, then planting resumes", () => {
  const g = loadGame({ fresh: true });
  clearGarden(g);

  g.setFieldZoom(g.ZOOM_PLANT);
  g.swallowTapUntil = performance.now() + 900;
  g.drumClick(0, 2);
  assert.strictEqual(g.drumG[0][2], false);

  g.drumClick(0, 2);
  assert.strictEqual(g.drumG[0][2], true);
});

test("an expired swallow blocks nothing", () => {
  const g = loadGame({ fresh: true });
  clearGarden(g);

  g.setFieldZoom(g.ZOOM_PLANT);
  g.swallowTapUntil = performance.now() - 1;
  g.cellClick(3, 2, g.cells[3][2]);
  assert.strictEqual(g.grid[3][2], true);
});

test("modelled touch pointerup then compatibility mousedown zooms without planting", () => {
  const g = loadGame({ fresh: true });
  clearGarden(g);
  const target = fakeEventTarget();
  g.setFieldZoom(g.ZOOM_LOOK);
  g.armZoomTap(target);

  target.emit("pointerdown", { clientX: 40, clientY: 70, pointerId: 1 });
  target.emit("pointerup", { clientX: 40, clientY: 70, pointerId: 1 });
  assert.strictEqual(g.fieldZoom, g.ZOOM_PLANT);

  // Model the post-pointerup compatibility mousedown which is browser-only in reality.
  g.cellClick(3, 2, g.cells[3][2]);
  assert.strictEqual(g.grid[3][2], false);
});

// A mouse never needs the swallow — there mousedown precedes pointerup — so desktop must not pay
// a single blocked press for a guard that only exists for touch.
test("a mouse tap zooms in and books no swallow at all", () => {
  const g = loadGame({ fresh: true });
  clearGarden(g);
  const target = fakeEventTarget();
  g.setFieldZoom(g.ZOOM_LOOK);
  g.armZoomTap(target);

  target.emit("pointerdown", { clientX: 40, clientY: 70, pointerId: 1, pointerType: "mouse" });
  target.emit("pointerup", { clientX: 40, clientY: 70, pointerId: 1, pointerType: "mouse" });
  assert.strictEqual(g.fieldZoom, g.ZOOM_PLANT);
  assert.strictEqual(g.swallowTapUntil, 0);

  g.cellClick(3, 2, g.cells[3][2]);
  assert.strictEqual(g.grid[3][2], true, "the very next click plants");
});

test("an editable-stop tap does not arm the zoom handler", () => {
  const g = loadGame({ fresh: true });
  clearGarden(g);
  const target = fakeEventTarget();
  g.setFieldZoom(g.ZOOM_PLANT);
  g.armZoomTap(target);

  target.emit("pointerdown", { clientX: 40, clientY: 70, pointerId: 1 });
  assert.strictEqual(target.listenerCount("pointerup"), 0);
  g.cellClick(3, 2, g.cells[3][2]);
  assert.strictEqual(g.grid[3][2], true);
  assert.strictEqual(g.fieldZoom, g.ZOOM_PLANT);
});

// Chrome fires pointercancel the moment it takes a touch over for its own scrolling, so on a
// pan-x pan-y surface this is the COMMON path, not the exotic one.
test("pointercancel abandons a pending zoom tap and releases its listener", () => {
  const g = loadGame({ fresh: true });
  const target = fakeEventTarget();
  g.setFieldZoom(g.ZOOM_LOOK);
  g.armZoomTap(target);

  target.emit("pointerdown", { clientX: 40, clientY: 70, pointerId: 1 });
  target.emit("pointercancel", { clientX: 140, clientY: 70, pointerId: 1 });
  assert.strictEqual(target.listenerCount("pointerup"), 0, "no stale closure is left behind");

  target.emit("pointerdown", { clientX: 100, clientY: 70, pointerId: 2 });
  target.emit("pointerup", { clientX: 40, clientY: 70, pointerId: 2 });

  assert.strictEqual(g.fieldZoom, g.ZOOM_LOOK,
    "a cancelled pan must not be revived by an unrelated later pointerup");
});

// Two fingers on the field is a pan or a pinch. If one of them happens to stay still, lifting it
// must not zoom the garden out from under the other one.
test("a second finger disarms the tap, even if the first one never moves", () => {
  const g = loadGame({ fresh: true });
  const target = fakeEventTarget();
  g.setFieldZoom(g.ZOOM_LOOK);
  g.armZoomTap(target);

  target.emit("pointerdown", { clientX: 40, clientY: 70, pointerId: 1 });
  target.emit("pointerdown", { clientX: 200, clientY: 70, pointerId: 2 });
  assert.strictEqual(target.listenerCount("pointerup"), 0);

  target.emit("pointerup", { clientX: 40, clientY: 70, pointerId: 1 });
  assert.strictEqual(g.fieldZoom, g.ZOOM_LOOK,
    "a stationary finger in a two-finger gesture is not a tap");
});

// Tap is the only advertised way back to planting ("tap the garden when you want to plant
// again"), so a child's careful slow press has to count exactly as much as a quick one.
test("a slow deliberate press still counts as a tap", async () => {
  const g = loadGame({ fresh: true });
  const target = fakeEventTarget();
  g.setFieldZoom(g.ZOOM_LOOK);
  g.armZoomTap(target);

  target.emit("pointerdown", { clientX: 40, clientY: 70, pointerId: 1 });
  await new Promise((done) => setTimeout(done, 450));
  target.emit("pointerup", { clientX: 40, clientY: 70, pointerId: 1 });
  assert.strictEqual(g.fieldZoom, g.ZOOM_PLANT);
});

test("resetTransient clears the zoom-tap swallow", () => {
  const g = loadGame({ fresh: true });
  clearGarden(g);
  g.setFieldZoom(g.ZOOM_LOOK);
  g.swallowTapUntil = performance.now() + 900;
  g.resetTransient();
  assert.strictEqual(g.fieldZoom, 1);

  g.cellClick(3, 2, g.cells[3][2]);
  assert.strictEqual(g.grid[3][2], true,
    "a new full-size level should not inherit the previous level's temporary input block");
});

test("resetTransient drops a half-finished tap so it cannot fire into the next level", () => {
  const g = loadGame({ fresh: true });
  const target = fakeEventTarget();
  g.setFieldZoom(g.ZOOM_LOOK);
  g.armZoomTap(target);

  target.emit("pointerdown", { clientX: 40, clientY: 70, pointerId: 1 });
  g.resetTransient();
  assert.strictEqual(target.listenerCount("pointerup"), 0);

  target.emit("pointerup", { clientX: 40, clientY: 70, pointerId: 1 });
  assert.strictEqual(g.fieldZoom, 1, "the seam swallowed the gesture, not the next level");
});

// The two REJECTION branches of the tap predicate: they are what keeps a pan from being read
// as a tap.
test("a pan at look-only is not a tap: it neither zooms nor leaves the listener behind", () => {
  const g = loadGame({ fresh: true });
  const target = fakeEventTarget();
  g.setFieldZoom(g.ZOOM_LOOK);
  g.armZoomTap(target);

  target.emit("pointerdown", { clientX: 40, clientY: 70, pointerId: 1 });
  target.emit("pointerup", { clientX: 80, clientY: 70, pointerId: 1 });   // 40px — a pan
  assert.strictEqual(g.fieldZoom, g.ZOOM_LOOK, "a 40px drag stays a pan");
  assert.strictEqual(target.listenerCount("pointerup"), 0, "the pointerup listener is released");

  target.emit("pointerdown", { clientX: 40, clientY: 70, pointerId: 2 });
  target.emit("pointerup", { clientX: 48, clientY: 70, pointerId: 2 });   // 8px — still a tap
  assert.strictEqual(g.fieldZoom, g.ZOOM_PLANT, "8px is inside the slop and still zooms");
});
