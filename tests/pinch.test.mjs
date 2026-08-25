// Pinch geometry and stop selection.
//
// Only the PURE parts are testable here: the harness has no touches, no layout and no CSS `zoom`, so
// whether Chrome lets us cancel a two-finger move, whether it had already taken the stream, and whether
// the synthesized mousedown still arrives are device questions — see spike/pinch-probe.html.

import { test } from "node:test";
import assert from "node:assert";
import { loadGame } from "./harness.mjs";

const g = loadGame();

test("a spread that is not decisive selects no stop", () => {
  for (const ratio of [1, 1.05, 1.21, 0.83, 0.95]) {
    assert.strictEqual(g.nextPinchStop(1, ratio), null, `ratio ${ratio}`);
    assert.strictEqual(g.nextPinchStop(g.ZOOM_PLANT, ratio), null, `ratio ${ratio}`);
  }
});

// ZOOM_STOPS is [1, 0.8, 0.6]: index 0 is full size, so zooming IN walks the index DOWN.
test("spreading the fingers walks one stop toward full size", () => {
  assert.strictEqual(g.nextPinchStop(g.ZOOM_LOOK, 1.3), g.ZOOM_PLANT);
  assert.strictEqual(g.nextPinchStop(g.ZOOM_PLANT, 1.3), 1);
});

test("closing the fingers walks one stop toward the whole garden", () => {
  assert.strictEqual(g.nextPinchStop(1, 0.7), g.ZOOM_PLANT);
  assert.strictEqual(g.nextPinchStop(g.ZOOM_PLANT, 0.7), g.ZOOM_LOOK);
});

test("the ladder does not wrap at either end", () => {
  assert.strictEqual(g.nextPinchStop(1, 2.0), null, "already at full size");
  assert.strictEqual(g.nextPinchStop(g.ZOOM_LOOK, 0.4), null, "already at the whole garden");
});

// cycleZoom snaps an off-ladder zoom to full size via its `i<0?0` branch; the pinch must agree rather
// than invent a stop of its own.
test("an off-ladder zoom is treated as full size, exactly as cycleZoom treats it", () => {
  assert.strictEqual(g.nextPinchStop(0.73, 0.7), g.ZOOM_PLANT, "steps off index 0");
  assert.strictEqual(g.nextPinchStop(0.73, 1.3), null, "and cannot go further in than full size");
});

// The anchor keeps the field point under the fingers where it is. scrollLeft is FIELD px under CSS
// `zoom`; getBoundingClientRect().left is VISUAL px. Mixing them is the whole difficulty.
test("anchoring holds the point under the fingers still", () => {
  // Bed at x=100 visual, zoom 1, scrolled 200 field px, fingers centred at x=300.
  // The field point under them is 200 + (300-100)/1 = 400.
  const sl2 = g.anchoredScroll(200, 300, 100, 1, 100, 0.5);
  // At zoom 0.5 that same visual offset is 400 field px, so we must scroll to 400 - 400 = 0.
  assert.strictEqual(sl2, 0);
  // And the round trip holds: the field point under the fingers is unchanged.
  assert.strictEqual(sl2 + (300 - 100) / 0.5, 400);
});

test("anchoring is a no-op when the zoom does not actually change", () => {
  assert.strictEqual(g.anchoredScroll(200, 300, 100, 1, 100, 1), 200);
  assert.strictEqual(g.anchoredScroll(0, 42, 0, 0.8, 0, 0.8), 0);
});

// zoomOf() returns 1 on a browser that ignores CSS `zoom`, and index.html's stated contract is that
// every conversion then degrades to a true no-op rather than silently doubling.
test("on a browser that ignores CSS zoom the anchor changes nothing", () => {
  for (const cx of [0, 150, 390]) {
    assert.strictEqual(g.anchoredScroll(137, cx, 72, 1, 72, 1), 137);
  }
});

test("the anchor survives the rail's visually-constant margin", () => {
  // .stage > .scroller carries margin-left: calc(72px / var(--fz)), which is inside the zoomed element
  // and therefore visually constant — so rect.left is the same before and after a stop change.
  const before = 500 + (200 - 72) / 0.8;
  const sl2 = g.anchoredScroll(500, 200, 72, 0.8, 72, 0.6);
  assert.strictEqual(sl2 + (200 - 72) / 0.6, before);
});

test("the pinch thresholds are symmetric enough that neither direction is the hard one", () => {
  // A gesture that must travel much further one way than the other reads as broken to a child.
  const outTravel = 1 / g.PINCH_OUT;      // how far apart you must end up to zoom out by ratio
  assert.ok(Math.abs(outTravel - g.PINCH_IN) < 0.02,
    `IN needs ${g.PINCH_IN}x, OUT needs ${outTravel.toFixed(3)}x`);
});

// ---- The claim test: which way are the two fingers going? ----
// This is what decides whether the browser keeps a gesture or we take it, and getting it wrong is not
// symmetric. Claiming a pan means preventing its FIRST touchmove, and Chrome cancels scrolling for the
// whole gesture when you do that — so a wrong claim is not "a stray zoom", it is a pan that does nothing
// at all. That is exactly what the Pixel 10a reported against the old spread-versus-travel test.

const V = (x, y) => ({ x, y });

test("two fingers sliding the same way are a pan, never a pinch", () => {
  assert.strictEqual(g.movingTogether(V(-90, 0), V(-94, 0)), true, "straight sideways");
  assert.strictEqual(g.movingTogether(V(40, 12), V(38, 9)), true, "slightly diagonal, still together");
  assert.strictEqual(g.movingTogether(V(0, 60), V(0, 55)), true, "vertical");
});

test("two fingers moving apart or together are a pinch", () => {
  assert.strictEqual(g.movingTogether(V(-40, 0), V(40, 0)), false, "spreading");
  assert.strictEqual(g.movingTogether(V(30, 0), V(-30, 0)), false, "closing");
  assert.strictEqual(g.movingTogether(V(-20, -20), V(20, 20)), false, "diagonal spread");
});

// A child often anchors one finger and moves the other. That is a pinch, and the direction test must not
// veto it just because one vector is ~zero and the cosine is meaningless.
test("one resting finger and one sliding finger is still a pinch", () => {
  assert.strictEqual(g.movingTogether(V(0, 0), V(60, 0)), false);
  assert.strictEqual(g.movingTogether(V(2, 1), V(-70, 4)), false, "a resting finger is allowed to tremble");
});

// Below the noise floor nothing is decided; the spread threshold is what gates the claim there.
test("the direction test abstains while both fingers are still near where they started", () => {
  assert.strictEqual(g.movingTogether(V(3, 0), V(4, 0)), false, "same way, but too small to call");
  assert.strictEqual(g.movingTogether(V(5, 0), V(-5, 0)), false);
});

test("a pan has to be clearly a pan: perpendicular movement is not vetoed", () => {
  assert.strictEqual(g.movingTogether(V(0, 40), V(40, 0)), false,
    "at right angles the fingers are not travelling together");
});

test("the claim threshold is above ordinary finger wobble but well under a committing pinch", () => {
  assert.ok(g.PINCH_CLAIM >= 10, "below this, two fingers resting on glass would claim the gesture");
  assert.ok(g.PINCH_CLAIM < g.PINCH_MIN, "claiming must happen before committing, never after");
});
