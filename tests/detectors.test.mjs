// Seed tests for the contour / motion / interval detectors.
//
// These exist to prove the harness pattern works and to give new tests something to copy.
// The detectors are the reusable building blocks every package's goals are written against
// (README.md § "Mechanics / detectors"), so a regression here breaks levels silently — the
// level still loads, it just stops recognising a correct answer.

import { test } from "node:test";
import assert from "node:assert";
import { loadGame, plant } from "./harness.mjs";

const g = loadGame();

test("contourSeq reads the lowest-index note per column, bottom-up", () => {
  assert.deepEqual(plant(g, [0, 1, 2, 3, 4]), [0, 1, 2, 3, 4]);
  assert.deepEqual(plant(g, [4, 0]), [4, 0]);
  // Empty columns are skipped, not reported as gaps.
  assert.deepEqual(plant(g, [2, null, 5]), [2, 5]);
});

test("isRising / isFalling are lenient about wiggle but need real net travel", () => {
  assert.strictEqual(g.isRising(plant(g, [0, 1, 2, 3, 4])), true);
  assert.strictEqual(g.isFalling(plant(g, [0, 1, 2, 3, 4])), false);

  assert.strictEqual(g.isFalling(plant(g, [4, 3, 2, 1, 0])), true);
  assert.strictEqual(g.isRising(plant(g, [4, 3, 2, 1, 0])), false);

  // A dip on the way up is still rising — this leniency is deliberate.
  assert.strictEqual(g.isRising(plant(g, [0, 2, 1, 3, 4])), true);

  // Net rise of 2 is below the threshold of 3.
  assert.strictEqual(g.isRising(plant(g, [0, 1, 2])), false);

  // Fewer than 3 notes can't establish a direction.
  assert.strictEqual(g.isRising(plant(g, [0, 5])), false);
});

test("isHovering wants a flat line that doesn't sneak away", () => {
  assert.strictEqual(g.isHovering(plant(g, [2, 3, 2, 3])), true);
  // Ends 3 above where it started — hovering must not mask a climb.
  assert.strictEqual(g.isHovering(plant(g, [2, 3, 4, 5])), false);
});

test("isArch is exactly one hill; isTwoArcs needs two", () => {
  const arch = plant(g, [0, 2, 4, 2, 0]);
  assert.deepEqual(g.extrema(arch), ["peak"]);
  assert.strictEqual(g.isArch(arch), true);
  assert.strictEqual(g.isTwoArcs(arch), false);

  const twoArcs = plant(g, [0, 3, 0, 3, 0, 3]);
  assert.strictEqual(g.isTwoArcs(twoArcs), true);
});

test("extrema merges wiggles below the prominence threshold", () => {
  // A 1-step notch inside a climb is noise, not a turning point.
  assert.deepEqual(g.extrema([0, 3, 2, 5]), []);
  // A 2-step drop clears the default prominence of 2.
  assert.deepEqual(g.extrema([0, 4, 2, 6]), ["peak", "valley"]);
});

test("motion detectors separate steps from leaps", () => {
  plant(g, [0, 1, 2, 3, 4]);
  assert.strictEqual(g.isStepwise(), true);
  assert.strictEqual(g.isOneJump(), false);

  plant(g, [0, 1, 5, 6]);
  assert.strictEqual(g.isOneJump(), true, "one leap of 4, the rest steps");
  assert.strictEqual(g.isStepwise(), false);

  plant(g, [0, 4, 1, 5]);
  assert.strictEqual(g.isBold(), true, "several leaps");
  assert.strictEqual(g.isGentle(), false);
});

test("isStaircase needs four steps running the same way", () => {
  assert.strictEqual(g.isStaircase(), false, "reset by the previous test's bold line");
  plant(g, [0, 1, 2, 3, 4]);
  assert.strictEqual(g.isStaircase(), true);
  // Same number of steps, but the direction flips.
  plant(g, [0, 1, 2, 1, 0]);
  assert.strictEqual(g.isStaircase(), false);
});

test("widthBand reads raw width and never folds by octave", () => {
  assert.strictEqual(g.widthBand(1), "close");
  assert.strictEqual(g.widthBand(2), "close");
  assert.strictEqual(g.widthBand(3), "bright");
  assert.strictEqual(g.widthBand(4), "bright");
  assert.strictEqual(g.widthBand(5), "open");
  assert.strictEqual(g.widthBand(7), "open");

  // The bug this replaced: everything >= 12 banded as a fourth category called "octave", so a
  // compound 2nd was announced as "Octave twins - minor 2nd + octave" in one sentence.
  // Width is spatial, so anything wider than a 3rd is open no matter how many octaves it spans.
  assert.strictEqual(g.widthBand(11), "open");
  assert.strictEqual(g.widthBand(12), "open", "an octave is a wide pair; 'Octave twins' is its display name");
  assert.strictEqual(g.widthBand(13), "open");
  assert.strictEqual(g.widthBand(23), "open");
  assert.strictEqual(g.widthBand(24), "open");
  assert.strictEqual(g.widthBand(25), "open");

  // widthBand only ever answers with a goal band. Nothing asks for a fourth one.
  const bands = new Set();
  for (let gap = 0; gap <= 36; gap++) bands.add(g.widthBand(gap));
  assert.deepEqual([...bands].sort(), ["bright", "close", "open"]);
});

test("widthBand has a defined answer for degenerate input", () => {
  assert.strictEqual(g.widthBand(0), "close", "unison: not craftable from the grid, but must not be undefined");
  assert.strictEqual(g.widthBand(-3), "bright", "sign is direction, not width");
  assert.strictEqual(g.widthBand(-13), "open");
});

test("Octave twins is a display name for an exact octave, not a band", () => {
  assert.strictEqual(g.isOctavePair(12), true);
  assert.strictEqual(g.isOctavePair(24), true);
  assert.strictEqual(g.isOctavePair(-12), true);
  assert.strictEqual(g.isOctavePair(0), false, "unison is not an octave");
  assert.strictEqual(g.isOctavePair(13), false);

  assert.strictEqual(g.pairMeta(12).name, "Octave twins");
  assert.strictEqual(g.pairMeta(24).name, "Octave twins");
  assert.strictEqual(g.pairMeta(13).name, "Open pair");
  assert.strictEqual(g.pairMeta(23).name, "Open pair");
  assert.strictEqual(g.pairMeta(1).name, "Close pair");
  assert.strictEqual(g.pairMeta(4).name, "Bright pair");
});

test("the width label never contradicts the real interval name", () => {
  // The regression that started this: pairMeta and intervalName describe the same pair in the
  // same status line, so "Octave twins" must only ever appear opposite a literal octave.
  for (let gap = 1; gap <= 36; gap++) {
    const label = g.pairMeta(gap).name;
    const real = g.intervalName(gap);
    if (label === "Octave twins") {
      assert.strictEqual(real, "octave", `gap ${gap} labelled Octave twins but is "${real}"`);
    } else {
      assert.notStrictEqual(real, "octave", `gap ${gap} is a real octave but labelled "${label}"`);
    }
  }
});

test("pair span is order-independent", () => {
  // Saved toolbox arrays are restored without re-sorting, so a descending pair must not
  // produce a negative gap and land in the wrong band.
  assert.strictEqual(g.pairKind([60, 72]), g.pairKind([72, 60]));
  assert.strictEqual(g.pairKind([72, 60]), "open");
  assert.strictEqual(g.pairKind([64, 65]), "close");
  assert.strictEqual(g.pairKind([65, 64]), "close");
  assert.strictEqual(g.toolMeta([0, 7], [72, 60]).name, "Octave twins");
});

test("width and tension are independent axes", () => {
  // A compound minor 2nd is spatially wide AND harmonically tense. One label must not
  // silently answer the other question.
  assert.strictEqual(g.widthBand(13), "open");
  assert.strictEqual(g.pairTension(13), "clash");
  assert.strictEqual(g.widthBand(18), "open");
  assert.strictEqual(g.pairTension(18), "tritone");
  assert.strictEqual(g.pairTension(12), null, "an octave is wide and calm");
});

test("palette switching swaps the pitch set and the ladder height", () => {
  // Uses a fresh game so the palette change can't leak into other test files' expectations.
  const fresh = loadGame({ fresh: true });
  assert.strictEqual(fresh.paletteId, "pentatonic");
  assert.strictEqual(fresh.ROWS, 10);
  assert.deepEqual(fresh.NAMES.slice(0, 3), ["A5", "G5", "E5"]);

  fresh.setPalette("diatonic");
  assert.strictEqual(fresh.paletteId, "diatonic");
  assert.strictEqual(fresh.ROWS, 14, "diatonic adds F and B");
  assert.strictEqual(fresh.NAMES[0], "B5");
  assert.strictEqual(fresh.MIDI.length, fresh.ROWS, "MIDI and ROWS must stay in step");

  // An unknown palette id falls back rather than throwing.
  fresh.setPalette("no-such-palette");
  assert.strictEqual(fresh.paletteId, "pentatonic");
});
