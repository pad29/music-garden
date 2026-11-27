// TUN-14: a Scoop pointer whose up/cancel never reaches #track must not freeze the camera.
//
// camBusy() holds the camera off the playhead while trayPtrs has an entry. An entry used to leave only
// through trayUp, trayCancel or exitTray(), so a pointer lost to a hidden tab, a blurred window or a lost
// capture stayed for the rest of the Scoop session. trayPtrsDrop() releases the set from the exits
// pinchDrop() uses, plus lostpointercapture — discarding the gesture in flight, keeping the pick and the
// armed copy (the spike rule, EDITOR-DESIGN §16).
//
// The harness's stubs swallow addEventListener, so this file loads the game with RECORDING targets for
// the window, the document and #track: the handlers that run below are the game's own, unmodified.

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

// An element with real values where the test needs them, recorded listeners, and a no-op for the rest.
// Writes are kept, so `cursorStripEl._drag = false` reads back false.
function fakeEl(own = {}) {
  const t = { ...own, ...listenerBag() };
  return new Proxy(t, {
    get: (o, prop) => (prop in o ? o[prop] : noop()),
    set: (o, prop, v) => { o[prop] = v; return true; },
  });
}

function boot() {
  const win = listenerBag();
  const doc = listenerBag();
  let hidden = false;
  const track = fakeEl();
  const elements = {
    track,
    // A real, unzoomed 1000×600 field at the viewport's origin, so trayGridPos is plain arithmetic.
    grid: fakeEl({ offsetWidth: 1000, getBoundingClientRect: () => ({ left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600 }) }),
    cursorStrip: fakeEl({ _drag: false }),   // a stub's _drag is truthy, and would hold camBusy() by itself
  };
  const g = loadGame({
    fresh: true,
    elements,
    setup: (w) => {
      w.addEventListener = win.addEventListener;
      w.removeEventListener = win.removeEventListener;
      Object.defineProperty(w.document, "addEventListener", { value: doc.addEventListener });
      Object.defineProperty(w.document, "removeEventListener", { value: doc.removeEventListener });
      Object.defineProperty(w.document, "hidden", { get: () => hidden });
    },
  });
  return { g, win, doc, track, setHidden: (v) => { hidden = v; } };
}

// Three real seeds in the MODEL (the harness's plant() only writes the grid the model is projected to).
function seed(g) { for (let c = 0; c < 3; c++) g.modelSetCell(g.ROWS - 1 - c, c, true); }

const ptr = (pointerId, clientX, clientY) => ({ pointerId, clientX, clientY, preventDefault() {} });

// The Scoop armed, a pick held, and a finger pressed on empty field: a marquee is in flight.
function pressedInScoop() {
  const s = boot();
  const { g, track } = s;
  seed(g);
  g.enterTray();
  g.traySel = [g.melTrack().notes[0].id];
  track.emit("pointerdown", ptr(7, 900, 300));
  assert.strictEqual(g.trayPtrs.size, 1, "the press is tracked");
  assert.strictEqual(g.trayDrag && g.trayDrag.mode, "marquee", "a press off the pick starts a marquee");
  assert.ok(g.trayMarqEl, "with its box drawn");
  assert.strictEqual(g.camBusy(), true, "a live Scoop gesture holds the camera");
  return s;
}

function assertReleasedKeepingPick(g, pickId, why) {
  assert.strictEqual(g.camBusy(), false, `${why}: the camera is free to follow again`);
  assert.strictEqual(g.trayPtrs.size, 0, `${why}: no pointer is left in the set`);
  assert.strictEqual(g.trayDrag, null, `${why}: the gesture in flight is discarded`);
  assert.strictEqual(g.trayMarqEl, null, `${why}: and its marquee box removed`);
  assert.strictEqual(g.trayMode, true, `${why}: the Scoop stays armed`);
  assert.deepStrictEqual([...g.traySel], [pickId], `${why}: the pick survives`);
}

const exits = {
  "the window blurs": ({ win }) => win.emit("blur"),
  "the page is hidden (pagehide)": ({ win }) => win.emit("pagehide"),
  "the tab is hidden (visibilitychange)": ({ doc, setHidden }) => { setHidden(true); doc.emit("visibilitychange"); },
  "#track loses the pointer's capture": ({ track }) => track.emit("lostpointercapture", ptr(7, 900, 300)),
};

for (const [name, fire] of Object.entries(exits)) {
  test(`a Scoop pointer stranded when ${name} no longer freezes the camera`, () => {
    const s = pressedInScoop();
    const pickId = s.g.traySel[0];
    fire(s);
    assertReleasedKeepingPick(s.g, pickId, name);
  });
}

test("resetTransient releases a stranded Scoop pointer too", () => {
  const { g } = pressedInScoop();
  g.resetTransient();
  assert.strictEqual(g.trayPtrs.size, 0);
  assert.strictEqual(g.trayDrag, null);
  assert.strictEqual(g.camBusy(), false, "a new level or step never starts with the camera held");
});

test("the late pointerup of a released gesture commits nothing", () => {
  const { g, win, track } = pressedInScoop();
  const pickId = g.traySel[0];
  track.emit("pointermove", ptr(7, 0, 0));    // the box now covers the whole field
  win.emit("blur");
  track.emit("pointerup", ptr(7, 0, 0));      // the up arrives after all (a blur that came back)
  assert.deepStrictEqual([...g.traySel], [pickId], "the abandoned marquee must not union its box into the pick");
  assert.strictEqual(g.camBusy(), false);
});

test("an armed copy survives the release, and its interrupted tap does not place it", () => {
  const { g, win, track } = boot();
  seed(g);
  g.enterTray();
  const notes = g.melTrack().notes.length;
  g.trayPlace = { rel: [{ dr: 0, dc: 0, dur: g.melTrack().notes[0].durationTicks }], h: 0, w: 0 };
  track.emit("pointerdown", ptr(3, 500, 300));
  assert.strictEqual(g.trayDrag && g.trayDrag.mode, "placetap");
  assert.strictEqual(g.camBusy(), true);
  win.emit("blur");
  assert.strictEqual(g.camBusy(), false);
  assert.ok(g.trayPlace, "the copy stays armed");
  track.emit("pointerup", ptr(3, 500, 300));
  assert.strictEqual(g.melTrack().notes.length, notes, "a tap cut off by the blur never plants the copy");
});

test("a visible visibilitychange leaves a live gesture alone", () => {
  const { g, doc, setHidden } = pressedInScoop();
  setHidden(false);
  doc.emit("visibilitychange");
  assert.strictEqual(g.trayPtrs.size, 1);
  assert.strictEqual(g.trayDrag && g.trayDrag.mode, "marquee");
  assert.ok(g.trayMarqEl);
});

test("the release is idempotent, and with nothing pressed it touches nothing", () => {
  const { g, win } = boot();
  g.enterTray();
  let cleared = 0;
  g.trayGhosts = [{ classList: { remove() { cleared++; } } }];   // an armed copy's hover ghost
  win.emit("blur");
  g.trayPtrsDrop();
  assert.strictEqual(cleared, 0, "blurring with no finger down must not wipe the copy's preview");
  assert.strictEqual(g.trayGhosts.length, 1);
  assert.strictEqual(g.camBusy(), false);
});

test("lostpointercapture after an ordinary pointerup keeps what the release committed", () => {
  const { g, track } = boot();
  seed(g);
  g.enterTray();
  track.emit("pointerdown", ptr(1, 999, 599));
  track.emit("pointermove", ptr(1, 0, 0));
  track.emit("pointerup", ptr(1, 0, 0));        // the browser releases capture AFTER pointerup…
  track.emit("lostpointercapture", ptr(1, 0, 0));  // …and only then fires this
  assert.strictEqual(g.traySel.length, 3, "the marquee's pick stands");
  assert.strictEqual(g.camBusy(), false);
});

test("lostpointercapture for a pointer the Scoop is not tracking leaves its gesture alone", () => {
  const { g, track } = pressedInScoop();
  track.emit("lostpointercapture", ptr(99, 0, 0));
  assert.strictEqual(g.trayPtrs.size, 1);
  assert.strictEqual(g.trayDrag && g.trayDrag.mode, "marquee", "someone else's capture is not ours to end");
  assert.ok(g.trayMarqEl);
});

test("a second finger's lost capture ends the two-finger pan, and the first finger cannot revive it", () => {
  const { g, track } = boot();
  g.enterTray();
  track.emit("pointerdown", ptr(1, 100, 100));
  track.emit("pointerdown", ptr(2, 300, 100));
  assert.strictEqual(g.trayPtrs.size, 2, "two fingers: pan mode");
  track.emit("lostpointercapture", ptr(2, 300, 100));
  assert.strictEqual(g.trayPtrs.size, 0);
  assert.strictEqual(g.camBusy(), false);
  track.emit("pointermove", ptr(1, 140, 100));
  assert.strictEqual(g.trayPtrs.size, 0, "a move from a released finger is not re-tracked");
  track.emit("pointerup", ptr(1, 140, 100));
  assert.strictEqual(g.camBusy(), false);
  assert.strictEqual(g.trayMode, true);
});

test("a move cut off by the release puts nothing down, and its late pointerup moves nothing", () => {
  const { g, win, track } = boot();
  for (let c = 0; c < 3; c++) g.modelSetCell(g.ROWS - 1 - c, c, true);
  g.enterTray();
  const n = g.melTrack().notes[0];
  const at = g.trayCellOf(n);
  g.traySel = [n.id];
  const px = (q) => ptr(5, g.TRAY_PAD + (q.c + 0.5) * g.TRAY_CW, g.TRAY_PAD + (q.r + 0.5) * g.TRAY_CH);
  const before = JSON.stringify(g.melTrack().notes);
  track.emit("pointerdown", px(at));
  assert.strictEqual(g.trayDrag && g.trayDrag.mode, "move", "a press on the pick starts a move");
  track.emit("pointermove", px({ r: at.r, c: at.c + 4 }));
  assert.deepStrictEqual([g.trayDrag.d.r, g.trayDrag.d.c], [0, 4], "the move is four columns right, in flight");
  win.emit("blur");
  assert.strictEqual(g.trayDrag, null);
  assert.strictEqual(g.trayGhosts.length, 0, "the move's ghosts are cleared");
  assert.strictEqual(g.camBusy(), false);
  track.emit("pointerup", px({ r: at.r, c: at.c + 4 }));
  assert.strictEqual(JSON.stringify(g.melTrack().notes), before, "no seed moved");
  assert.deepStrictEqual([...g.traySel], [n.id], "and the pick is still held");
});
