// Integration coverage for the raw-width pair-band change.
//
// These deliberately exercise the stateful paths the unit tests do not: crafting, stamping,
// placed-column classification, level goals, and a persisted (unsorted) toolbox tool.

import { test } from "node:test";
import assert from "node:assert";
import { loadGame } from "./harness.mjs";

function readyGame() {
  const g = loadGame({ fresh: true });
  // The live Craft button initializes audio before reaching craftFromCells/fusePick/fuseField.
  // Do the same here; the harness absorbs sound, but craftFromCells reads actx.currentTime.
  g.initAudio();
  return g;
}

function clearMelody(g) {
  g.modelClearMelody();
}

function put(g, r, c) {
  g.modelSetCell(r, c, true);
}

test("crafting records raw pair spans and keeps pair bookkeeping in goal bands", () => {
  const g = readyGame();

  // C4–B5 is a compound major 7th: spatially open, but it was formerly recorded as octave.
  g.craftFromCells([{ r: 0, c: 0 }, { r: 9, c: 0 }]);
  assert.deepEqual(g.ev.pairs, [{ span: 9, kind: "open", gap: 21 }]);
  assert.deepEqual(g.ev.pairKinds, ["open"]);
  assert.strictEqual(g.ev.lastPairKind, "open");
  assert.strictEqual(g.toolbox.length, 1);
  assert.deepEqual(g.toolbox[0].offs, [0, 9]);
  assert.deepEqual(g.toolbox[0].midis, [60, 81]);

  // An exact octave remains a display subtype but joins the same goal band and event kind.
  g.craftFromCells([{ r: 9, c: 1 }, { r: 4, c: 1 }]);
  assert.deepEqual(g.ev.pairs[1], { span: 5, kind: "open", gap: 12 });
  assert.deepEqual(g.ev.pairKinds, ["open", "open"]);
  assert.strictEqual(g.distinctBands(), 1, "Octave twins is not a fourth crafted band");
  assert.strictEqual(g.toolMeta(g.toolbox[1].offs, g.toolbox[1].midis).name, "Octave twins");
});

test("Fuse finds one field stack, but defers an ambiguous field to Scoop", () => {
  const one = readyGame();
  put(one, 9, 2);
  put(one, 0, 2);
  one.fuseField();
  assert.deepEqual(one.ev.pairs, [{ span: 9, kind: "open", gap: 21 }]);
  assert.strictEqual(one.toolbox.length, 1);

  const many = readyGame();
  put(many, 9, 0);
  put(many, 8, 0);
  put(many, 9, 1);
  put(many, 0, 1);
  many.fuseField();
  assert.strictEqual(many.ev.pairs.length, 0, "ambiguous stacks must not craft an arbitrary pair");
  assert.strictEqual(many.trayMode, true, "ambiguous stacks should arm Scoop");
});

test("Fuse uses the Scoop selection rather than another stack in the field", () => {
  const g = readyGame();
  // Two stacks exist; choose only the compound pair in column 1.
  put(g, 9, 0);
  put(g, 8, 0);
  put(g, 9, 1);
  put(g, 0, 1);
  g.trayMode = true;
  g.traySel = g.melTrack().notes.filter((n) => g.noteCol(n) === 1).map((n) => n.id);

  g.fusePick();

  assert.deepEqual(g.ev.pairs, [{ span: 9, kind: "open", gap: 21 }]);
  assert.deepEqual(g.toolbox[0].midis, [60, 81]);
});

test("stamping an octave twin creates an OPEN placed column", () => {
  const g = readyGame();
  g.craftFromCells([{ r: 9, c: 0 }, { r: 4, c: 0 }]);
  const octaveTool = g.toolbox[0];

  clearMelody(g);
  g.activeTool = octaveTool;
  g.stampTool(9, 3);

  assert.strictEqual(g.colBand(3), "open");
  assert.deepEqual(g.countColBands(), { close: 0, bright: 0, open: 1 });
  assert.strictEqual(g.ev.stampedTool, true);
});

test("placed columns count raw-width bands and ignore non-pairs", () => {
  const g = readyGame();
  // C4–D4 = close; C4–E4 = bright; C4–A5 = compound open; C4–C5 = octave/open.
  put(g, 9, 0); put(g, 8, 0);
  put(g, 9, 1); put(g, 7, 1);
  put(g, 9, 2); put(g, 0, 2);
  put(g, 9, 3); put(g, 4, 3);
  put(g, 9, 4);                         // one note: not a pair
  put(g, 9, 5); put(g, 8, 5); put(g, 7, 5); // three notes: not a pair

  assert.strictEqual(g.colBand(0), "close");
  assert.strictEqual(g.colBand(1), "bright");
  assert.strictEqual(g.colBand(2), "open");
  assert.strictEqual(g.colBand(3), "open");
  assert.strictEqual(g.colBand(4), null);
  assert.strictEqual(g.colBand(5), null);
  assert.deepEqual(g.countColBands(), { close: 1, bright: 1, open: 2 });
});

test("Twin Blooms goals recognize crafted and placed raw-width pairs", () => {
  const g = readyGame();
  const levels = g.PACKAGES["twin-blooms"].levels;
  const sameDistance = levels.find((l) => l.name === "Same Distance, New Feel");
  const gardens = levels.find((l) => l.name === "Two Gardens");
  const song = levels.find((l) => l.name === "The Twin Bloom Song");

  // One-rung close then bright crafts exercise both craftedSpanBand goals.
  g.craftFromCells([{ r: 9, c: 0 }, { r: 8, c: 0 }]);
  assert.strictEqual(sameDistance.steps[0].goals[0].chk(), true);
  g.craftFromCells([{ r: 7, c: 1 }, { r: 6, c: 1 }]);
  assert.strictEqual(sameDistance.steps[1].goals[0].chk(), true);

  clearMelody(g);
  // Three close pairs plus two compound opens and an exact octave: all six are placed columns.
  for (const c of [0, 1, 2]) { put(g, 9, c); put(g, 8, c); }
  put(g, 9, 3); put(g, 0, 3);
  put(g, 9, 4); put(g, 1, 4);
  put(g, 9, 5); put(g, 4, 5);
  assert.strictEqual(gardens.goals.find((goal) => goal.id === "close").chk(), true);
  assert.strictEqual(gardens.goals.find((goal) => goal.id === "open").chk(), true);

  clearMelody(g);
  put(g, 9, 0); put(g, 8, 0); // close
  put(g, 9, 1); put(g, 7, 1); // bright
  put(g, 9, 2); put(g, 4, 2); // exact octave, still open for the capstone
  for (const id of ["c", "b", "o"]) {
    assert.strictEqual(song.goals.find((goal) => goal.id === id).chk(), true, `capstone ${id}`);
  }
});

test("an unsorted saved pair survives persistence and still describes its real interval", () => {
  const g = readyGame();
  g.currentPkg = "twin-blooms";
  g.levelIdx = 0;
  g.toolbox = [{ id: "temporary", offs: [0, 7], midis: [73, 60] }]; // C♯5/C4, deliberately descending

  g.savePackageProgress();   // package advancement owns the bag; settings are a separate owner now
  assert.deepEqual(g.progress.packages["twin-blooms"].toolbox, [{ offs: [0, 7], midis: [73, 60] }]);

  g.toolbox = [];
  g.loadPkgToolbox();
  assert.deepEqual(g.toolbox, [{ offs: [0, 7], midis: [73, 60] }]);
  assert.strictEqual(g.pairKind(g.toolbox[0].midis), "open");
  assert.strictEqual(g.toolMeta(g.toolbox[0].offs, g.toolbox[0].midis).name, "Open pair");
  assert.strictEqual(g.chordName(g.toolbox[0].midis), g.chordName([60, 73]));
});

test("compound tense pairs retain their raw width after diatonic crafting", () => {
  const g = readyGame();
  g.setPalette("diatonic");
  // C4–B5 is a compound major 7th: open in spacing, clash in tension.
  g.craftFromCells([{ r: 13, c: 0 }, { r: 0, c: 0 }]);

  assert.deepEqual(g.ev.pairs, [{ span: 13, kind: "open", gap: 23 }]);
  assert.strictEqual(g.ev.lastPairKind, "open");
  assert.strictEqual(g.distinctBands(), 1);
  assert.strictEqual(g.craftedClash(), true);
  assert.strictEqual(g.toolMeta(g.toolbox[0].offs, g.toolbox[0].midis).name, "Open pair");
});
