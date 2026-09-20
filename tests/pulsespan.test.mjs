// The steady pulses across a field that is not 16 columns wide, and the room controls that make it so.
//
// Every pulse detector read fixed positions in the first 16 columns: `kickWalk8` and `hat8ths` tested
// `[0,2,…,14]` literally. On a wider field a beat that stopped two thirds of the way across still read
// as a steady walk — and the ＋ room control beside the cursor, which widens the field, was gated by
// nothing at all, so any player could reach that state and any quest granted it without declaring it.
//
// The fix is one pure helper with an explicit span. The lesson wrappers keep 16 forever, because 247
// goal closures are written against them; only a caller that knows its own width passes one.
//
// Each test names the mutation it must catch. A test that passes against correct code AND against the
// bug it claims to catch is a false proof.

import { test } from "node:test";
import assert from "node:assert";
import { loadGame } from "./harness.mjs";

const g = loadGame();

/** A drum grid of `cols` columns, three lanes, with `on` cells lit in `lane`. */
const grid = (lane, on, cols = 16) => {
  const dg = [0, 1, 2].map(() => Array(cols).fill(false));
  for (const c of on) dg[lane][c] = true;
  return dg;
};
const EVEN = [0, 2, 4, 6, 8, 10, 12, 14];
const MAIN = [0, 4, 8, 12];

// ============================ the wrappers did not move ============================

test("every 16-column pattern reads exactly as it did before the span existed", () => {
  // MUTATION: change any wrapper's span, step or lane — or let `laneOnlyEvery` sweep the span instead
  // of the whole lane, which is what keeps the clean four disjoint from the even walk.
  // Exhaustive, not sampled: mutation testing shows a test catches mistakes, it cannot show two
  // functions are the same. 65,536 patterns is the whole space of one 16-cell lane.
  const oldKickOn4   = dg => MAIN.every(i => dg[0][i]);
  const oldKickClean = dg => oldKickOn4(dg) && dg[0].every((on, i) => !on || i % 4 === 0);
  const oldKickWalk8 = dg => EVEN.every(i => dg[0][i]);
  const oldHat8ths   = dg => EVEN.every(i => dg[2][i]);

  for (let bits = 0; bits < 65536; bits++) {
    const on = [];
    for (let c = 0; c < 16; c++) if (bits & (1 << c)) on.push(c);
    const kicks = grid(0, on), hats = grid(2, on);
    assert.strictEqual(g.kickOn4(kicks),   oldKickOn4(kicks),   "kickOn4 @" + bits);
    assert.strictEqual(g.kickClean(kicks), oldKickClean(kicks), "kickClean @" + bits);
    assert.strictEqual(g.kickWalk8(kicks), oldKickWalk8(kicks), "kickWalk8 @" + bits);
    assert.strictEqual(g.hat8ths(hats),    oldHat8ths(hats),    "hat8ths @" + bits);
  }
});

test("a lesson wrapper ignores a wider field, exactly as it always has", () => {
  // MUTATION: give the wrappers the live COLS instead of 16.
  // 247 goal closures call these with no span. A lesson that widened its field must not have its goal
  // silently redefined — that is the whole reason the wrappers keep their own number.
  const wide = grid(0, MAIN, 24);
  assert.strictEqual(g.kickOn4(wide), true, "four kicks still satisfy a 16-column lesson goal");
  assert.strictEqual(g.kickClean(wide), true);

  // …and with the LIVE field actually widened, which is the only way to tell 16 from COLS apart: the
  // wrappers read the global drum grid when a goal closure calls them with no argument.
  const g2 = loadGame({ fresh: true });
  g2.applySong({ v: 3, meta: { title: null, created: 0, updated: 0, author: null },
    palette: "pentatonic", time: { cols: 24, tempo: 108, groove: 0 },
    tracks: [{ kind: "melody", voice: "musicbox", notes: [{ p: 60, c: 0, len: 1 }] },
             { kind: "drums", hits: MAIN.map(c => ({ lane: 0, c })) }] });
  assert.strictEqual(g2.COLS, 24, "the field really is wider");
  assert.strictEqual(g2.kickOn4(), true, "a lesson goal must not be redefined by the player's extra room");
  assert.strictEqual(g2.kickClean(), true);
  assert.strictEqual(g2.pulseMainBeats(g2.drumG, g2.COLS), false, "…while a span-aware caller sees the gap");
});

// ============================ the span does something ============================

test("a pulse that stops before the end of the field is not a pulse across the field", () => {
  // MUTATION: default the span-explicit form to 16, or read `dg[lane].length` instead of the argument.
  // This is the defect itself: on a 24-column field, kicks on the first four main beats and silence
  // after used to read as clean main-beat kicks.
  const short = grid(0, MAIN, 24);
  assert.strictEqual(g.pulseMainBeats(short, 16), true, "…which is still true of its first 16 columns");
  assert.strictEqual(g.pulseMainBeats(short, 24), false, "but the last third has no beat in it");

  const full = grid(0, [0, 4, 8, 12, 16, 20], 24);
  assert.strictEqual(g.pulseMainBeats(full, 24), true);

  const walk = grid(0, EVEN, 24);
  assert.strictEqual(g.pulseEvenWalk(walk, 24), false, "an eight-step walk does not cross 24 columns");
  assert.strictEqual(g.pulseEvenWalk(grid(0, [0,2,4,6,8,10,12,14,16,18,20,22], 24), 24), true);

  const hats = grid(2, EVEN, 24);
  assert.strictEqual(g.pulseHatShimmer(hats, 24), false);
  assert.strictEqual(g.pulseHatShimmer(grid(2, [0,2,4,6,8,10,12,14,16,18,20,22], 24), 24), true);
});

test("the clean four still refuses an off-pattern kick anywhere, at any width", () => {
  // MUTATION: sweep only the span. The quest's route alternatives depend on main-beat kicks and the
  // even walk being disjoint families, and it is the cleanliness sweep that makes them disjoint.
  const dirty = grid(0, [0, 4, 8, 12, 16, 20, 21], 24);
  assert.strictEqual(g.pulseMainBeats(dirty, 24), false, "column 21 is off the pattern");
  assert.strictEqual(g.pulseEvenWalk(grid(0, [0,2,4,6,8,10,12,14,16,18,20,22,23], 24), 24), true,
    "…while the walk has always tolerated extra hits");
});

test("song evidence reads the pulse across the width it already computed", () => {
  // MUTATION: pass 16, or the declared cols, instead of the projection span.
  // Evidence describes songs wider than the editor's floor — saved and shared music included — and a
  // descriptor that says the drum walked all the way across must be true of the whole song.
  const song = (cols, hits) => ({
    v: 3, meta: { title: null, created: 0, updated: 0, author: null },
    palette: "pentatonic", time: { cols, tempo: 108, groove: 0 },
    tracks: [{ kind: "melody", voice: "musicbox", notes: [{ p: 60, c: 0, len: 1 }] },
             { kind: "drums", hits: hits.map(c => ({ lane: 0, c })) }],
  });
  assert.deepEqual(g.songEvidence(song(16, MAIN)).steadyPulseFamilies, ["main-beat-kicks"]);
  assert.deepEqual(g.songEvidence(song(24, MAIN)).steadyPulseFamilies, [],
    "four kicks at the start of a 24-column song are not a pulse across it");
  assert.deepEqual(g.songEvidence(song(24, [0, 4, 8, 12, 16, 20])).steadyPulseFamilies,
    ["main-beat-kicks"]);
});

// ============================ nothing the engine says counts anything ============================

test("no pulse wording commits to a number of beats", () => {
  // MUTATION: put "four main beats" or "eight-step" back into a descriptor or an enum label.
  // A player can widen the field with the room controls, so a sentence naming a count describes one
  // width and quietly mis-describes every other.
  const said = Object.keys(g.QUEST_DESCRIPTORS).map(id => g.QUEST_DESCRIPTORS[id].text)
    .concat(Object.keys(g.QUEST_ENUM_LABELS).map(k => g.QUEST_ENUM_LABELS[k]));
  for (const text of said)
    for (const n of ["four ", "eight", "six ", "twelve"])
      assert.strictEqual(text.toLowerCase().includes(n), false, 'counted beats in: "' + text + '"');
});

// ============================ room is a control now ============================

test("the room controls are a grant, not a given", () => {
  // MUTATION: drop `room` from QUEST_CONTROLS, or stop adding it in package scope.
  // The ＋/－ beside the cursor insert and remove TIME, sliding every note sideways. They were gated by
  // nothing, so every quest granted time surgery it never declared — and a task pinned to columns
  // cannot afford that. Packages keep them: no level ever unlocked them, and all 247 assume them.
  assert.strictEqual(Object.prototype.hasOwnProperty.call(g.QUEST_CONTROLS, "room"), true);

  const g2 = loadGame({ fresh: true });
  g2.setPlayScope({ kind: "package", packageId: "intro" });
  assert.strictEqual(g2.scopeFeatures().has("room"), true, "a package has always had them");

  // This test concerns control grants, so choose a reproducible hand that passes all three obligations.
  const rng = g2.questRng; g2.questRng = () => rng("fixture-4");
  const r = g2.startQuestRun("firefly-crossing");
  assert.strictEqual(r.ok, true, r.code);
  assert.strictEqual(g2.scopeFeatures().has("room"), false,
    "…and a quest gets them only by declaring them, which this one does not");
});
