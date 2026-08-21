// Adversarial integration coverage for the pinch STATE MACHINE — the part of the gesture that is
// bookkeeping rather than compositor behaviour: who owns the move listener, when it is released,
// what a filtered third touch does to a live gesture, and which branch a non-cancelable move takes.
//
// armPinch(el) only ever calls el.addEventListener / removeEventListener, and pinchEligible(t) only
// ever calls t.target.closest(sel) — so a fake with those three methods is a faithful stand-in and
// the real handlers run unmodified. What it CANNOT show is whether Chrome hands us a cancelable
// touchmove in the first place; that is spike/pinch-probe.html's job, on a device.
//
// Written by gpt-5.6-terra as the cross-test for the `pinch-zoom` branch; trimmed on review (two
// mutually contradictory assertions about the same sequence, and two tests over unreachable inputs,
// were removed — see REVIEW-LOG).

import { test } from "node:test";
import assert from "node:assert";
import { loadGame } from "./harness.mjs";

function eventTarget(name) {
  const listeners = new Map();
  return {
    name,
    addEventListener(type, fn) {
      const list = listeners.get(type) || [];
      // Browser EventTarget ignores an identical type/callback/capture registration.
      if (!list.includes(fn)) list.push(fn);
      listeners.set(type, list);
    },
    removeEventListener(type, fn) {
      const list = listeners.get(type) || [];
      listeners.set(type, list.filter((candidate) => candidate !== fn));
    },
    emit(type, event) {
      for (const fn of [...(listeners.get(type) || [])]) fn(event);
    },
    count(type) {
      return (listeners.get(type) || []).length;
    },
  };
}

function touchTarget(kind) {
  const node = {
    closest(selector) {
      if (kind === "cursor" && selector === "#cursorStrip") return node;
      if (kind === "grip" && selector === ".grip") return node;
      if (kind === "scroller" && selector === "#scroller") return node;
      if (kind === "drum" && selector === "#drumArea") return node;
      return null;
    },
  };
  return node;
}

function touch(identifier, kind, x, y) {
  return { identifier, target: touchTarget(kind), clientX: x, clientY: y };
}

function touchEvent(touches, { cancelable = true } = {}) {
  let prevented = false;
  return {
    touches,
    cancelable,
    preventDefault() {
      if (cancelable) prevented = true;
    },
    get defaultPrevented() {
      return prevented;
    },
  };
}

// Physical sequence: finger 1 starts in the seed bed, finger 2 starts in the beat lane (so #drumArea
// is what armed the pinch), then a third finger lands on #cursorStrip — which is a CHILD of #scroller
// (index.html:644), so its touchstart bubbles to the seed bed's handler. pinchPair() filters the
// cursor touch out and hands that handler the original two, which re-arms over the live gesture.
//
// The assertion is deliberately fix-agnostic: it does not say who should own the gesture afterwards,
// only that whatever teardown runs must leave no bed holding a non-passive touchmove listener. That
// is the promise the design makes — "one-finger scrolling never has a non-passive listener at all".
test("a filtered third touch never leaves a touchmove listener that teardown cannot remove", () => {
  const g = loadGame({ fresh: true });
  const melody = eventTarget("melody");
  const drums = eventTarget("drums");
  g.armPinch(melody);
  g.armPinch(drums);

  const first = touch(1, "scroller", 60, 200);
  const second = touch(2, "drum", 180, 200);
  melody.emit("touchstart", touchEvent([first]));
  drums.emit("touchstart", touchEvent([first, second]));
  assert.strictEqual(drums.count("touchmove"), 1, "the second finger's bed arms the gesture");

  melody.emit("touchstart", touchEvent([first, second, touch(3, "cursor", 120, 260)]));
  g.pinchDrop();

  assert.strictEqual(melody.count("touchmove"), 0);
  assert.strictEqual(drums.count("touchmove"), 0,
    "an abandoned bed must not keep a non-passive touchmove listener after the gesture is over");
});

// Same sequence, the other consequence: the touchstart handler builds a fresh pinch record with
// done:false, so a stray contact on the cursor strip re-opens the one-stop-per-gesture budget that
// index.html:1418 says is deliberately closed.
test("a filtered third touch cannot grant a second zoom stop in one gesture", () => {
  const g = loadGame({ fresh: true });
  const melody = eventTarget("melody");
  const drums = eventTarget("drums");
  g.armPinch(melody);
  g.armPinch(drums);

  const first = touch(1, "scroller", 60, 200);
  const second = touch(2, "drum", 180, 200);
  drums.emit("touchstart", touchEvent([first, second]));
  g.pinch.done = true;                      // the gesture has already spent its one stop
  melody.emit("touchstart", touchEvent([first, second, touch(3, "cursor", 120, 260)]));

  // Abandoning the gesture (pinch===null) and keeping it spent (done===true) are both acceptable
  // answers; handing it a fresh budget is not.
  assert.ok(!g.pinch || g.pinch.done === true,
    "a third contact re-armed the gesture with done:false and a fresh d0");
});

test("touchcancel always terminates a live pinch, even if its TouchList still names the pair", () => {
  const g = loadGame({ fresh: true });
  const melody = eventTarget("melody");
  g.armPinch(melody);
  const a = touch(1, "scroller", 50, 160);
  const b = touch(2, "scroller", 180, 160);
  melody.emit("touchstart", touchEvent([a, b]));
  assert.ok(g.pinch);

  melody.emit("touchcancel", touchEvent([a, b], { cancelable: false }));
  assert.strictEqual(g.pinch, null, "cancellation is terminal; it is not an ordinary remaining-touch check");
  assert.strictEqual(melody.count("touchmove"), 0, "cancellation releases the non-passive move listener");
});

test("an unclaimed two-finger contact does not yield the playback camera", () => {
  const g = loadGame({ fresh: true });
  const melody = eventTarget("melody");
  g.CAM.yielded = false;
  g.pinch = { el: melody, move: () => {} };  // an armed gesture that never latched and never zoomed

  g.pinchDrop();
  assert.strictEqual(g.CAM.yielded, false,
    "two resting fingers that changed nothing must not stop the camera following the playhead");
});

test("ordinary arm and explicit drop leave no touchmove listener behind", () => {
  const g = loadGame({ fresh: true });
  const melody = eventTarget("melody");
  g.armPinch(melody);
  const a = touch(1, "scroller", 40, 100);
  const b = touch(2, "scroller", 160, 100);
  melody.emit("touchstart", touchEvent([a, b]));
  assert.strictEqual(melody.count("touchmove"), 1);

  g.pinchDrop();
  assert.strictEqual(melody.count("touchmove"), 0);
  assert.strictEqual(g.pinch, null);
});

// The two load-bearing branches of `move`, pinned here because the browser run could only reach them
// with a `cancelable` flag chosen by the test rather than by Chrome.

test("a decisive spread on a NON-cancelable move abandons the whole gesture", () => {
  const g = loadGame({ fresh: true });
  const melody = eventTarget("melody");
  g.armPinch(melody);
  melody.emit("touchstart", touchEvent([touch(1, "scroller", 100, 200), touch(2, "scroller", 200, 200)]));
  const before = g.fieldZoom;

  // Spread 100 -> 220 with a stationary centroid: decisive, and past PINCH_MIN.
  melody.emit("touchmove", touchEvent([touch(1, "scroller", 40, 200), touch(2, "scroller", 260, 200)],
    { cancelable: false }));

  assert.strictEqual(g.pinch, null, "half a gesture is worse than none — Chrome already owns it");
  assert.strictEqual(melody.count("touchmove"), 0, "and the non-passive listener goes with it");
  assert.strictEqual(g.fieldZoom, before, "nothing zoomed on the way out");
});

test("a two-finger PAN is never claimed and never zooms", () => {
  const g = loadGame({ fresh: true });
  const melody = eventTarget("melody");
  g.armPinch(melody);
  melody.emit("touchstart", touchEvent([touch(1, "scroller", 100, 200), touch(2, "scroller", 200, 200)]));
  const before = g.fieldZoom;

  // Both fingers slide 90px left together: the centroid travels 90, the spread changes by 4.
  const pan = touchEvent([touch(1, "scroller", 10, 200), touch(2, "scroller", 106, 200)]);
  melody.emit("touchmove", pan);

  assert.strictEqual(pan.defaultPrevented, false, "a pan stays the browser's to scroll");
  assert.strictEqual(g.fieldZoom, before, "and it does not walk the zoom ladder");
  assert.ok(g.pinch, "the gesture stays armed — a pan that later becomes a pinch is still a pinch");
});
