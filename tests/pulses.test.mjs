// The pulse planner: every beat and barline the meter puts in a TICK range.
//
// It exists because `meterLayout` could not describe the region BEFORE a song starts — it clips to
// `c >= 0 && c < cols` — and a count-in lives entirely there. Phase is the dangerous part: a first draft
// positioned count-in clicks relative to transport tick zero while bars are phased on `originTick`, which
// with a one-column pickup counts you in exactly half a beat wrong. So bar phase now has one owner, and
// `meterLayout` is a projection of it.
//
// This file is the proof of that projection, in the same shape as tests/groove.test.mjs: a VERBATIM copy
// of the shipped `meterLayout` kept as the oracle.

import { test } from "node:test";
import assert from "node:assert";
import { loadGame } from "./harness.mjs";

const g = loadGame();
const TPC = g.TICKS_PER_COL;
const PRESETS = Object.keys(g.METERS);
const mk = (preset, originCols = 0) => ({ tick: 0, preset, originTick: originCols * TPC });

// ---------------------------------------------------------------------------------------------
// meterLayout EXACTLY as it shipped at f7ca1b5, before the planner was extracted. If a future edit is
// meant to change where a barline or a beat mark falls, this file is supposed to fail.
// ---------------------------------------------------------------------------------------------
function legacyLayout(cols, m) {
  const P = m && g.meterDef(m.preset); if (!P) return { segs: [], marks: [] };
  const bc = g.barTicks(P) / TPC, oc = Math.round(m.originTick / TPC);
  const segs = [], marks = [];
  if (oc > 0) segs.push({ n: 0, c0: 0, cols: Math.min(oc, cols), pickup: true });
  for (let c0 = oc - bc, i = 0; c0 < cols; c0 += bc, i++) {
    if (c0 >= 0) {
      if (i > 0) segs.push({ n: i, c0, cols: Math.min(bc, cols - c0), partial: c0 + bc > cols });
      marks.push({ c: c0, kind: "bar" });
    }
    let t = 0;
    for (let k = 0; k < P.beats.length - 1; k++) {
      t += P.beats[k];
      const c = c0 + t / TPC; if (c >= 0 && c < cols) marks.push({ c, kind: "beat" });
    }
  }
  return { segs, marks };
}

// ---------------------------------------------------------------- the equivalence proof

test("meterLayout draws exactly what it drew before, for every preset, pickup and field length", () => {
  let compared = 0;
  for (const preset of PRESETS) {
    for (let originCols = 0; originCols <= 3; originCols++) {
      for (let cols = 1; cols <= 64; cols++) {
        const m = mk(preset, originCols);
        assert.deepEqual(g.meterLayout(cols, m), legacyLayout(cols, m),
          `${preset} pickup ${originCols} at ${cols} columns`);
        compared++;
      }
    }
  }
  assert.ok(compared >= 4 * 4 * 64, `only compared ${compared} layouts`);
});

test("an absent or unknown meter still draws nothing", () => {
  for (const m of [null, undefined, mk("9/7"), mk("toString"), mk("__proto__")]) {
    assert.deepEqual(g.meterLayout(16, m), { segs: [], marks: [] });
    assert.deepEqual(g.pulsesIn(m, -1000, 1000), []);
  }
});

// ---------------------------------------------------------------- what the planner adds

// The reason it exists at all: meterLayout clips at column 0, so it cannot describe a count-in.
test("the planner reaches back before the song starts, where meterLayout could not", () => {
  const m = mk("4/4", 0);
  const before = g.pulsesIn(m, -g.barTicks(g.METERS["4/4"]), 0);
  assert.deepEqual(before.map(u => u.tick), [-384, -288, -192, -96], "one whole bar of pulses before tick 0");
  assert.strictEqual(before[0].kind, "bar", "…starting on a downbeat");
  assert.ok(before.slice(1).every(u => u.kind === "beat"));
  assert.deepEqual(g.meterLayout(16, m).marks.filter(k => k.c < 0), [], "meterLayout sees none of it");
});

// THE defect this seam exists to prevent, stated as an assertion.
test("pulses are phased on the DOWNBEAT, not on tick zero", () => {
  const bar = g.barTicks(g.METERS["4/4"]);
  for (let originCols = 0; originCols <= 3; originCols++) {
    const m = mk("4/4", originCols);
    const origin = originCols * TPC;
    const countIn = g.pulsesIn(m, origin - bar, origin);
    assert.strictEqual(countIn.length, 4, `pickup ${originCols}: four clicks`);
    assert.strictEqual(countIn[0].tick, origin - bar, `pickup ${originCols}: the count-in starts a bar before the downbeat`);
    // the click AFTER the last one is the downbeat itself — that is what "counting you in" means
    assert.strictEqual(countIn[3].tick + 96, origin, `pickup ${originCols}: the last click is one beat before bar 1`);
    // …and the naive version, ignoring the origin, is wrong by exactly the pickup
    const naive = [-4, -3, -2, -1].map(k => k * 96);
    if (originCols > 0) assert.notDeepEqual(countIn.map(u => u.tick), naive,
      `pickup ${originCols}: tick-zero phasing would be ${originCols} column(s) out`);
  }
});

test("bar numbers start at one on the downbeat, and the pickup is the bar before it", () => {
  const m = mk("3/4", 2);
  const origin = 2 * TPC;
  const at = t => g.pulsesIn(m, t, t + 1)[0];
  assert.strictEqual(at(origin).bar, 1, "the downbeat is bar 1");
  assert.strictEqual(at(origin).kind, "bar");
  assert.strictEqual(at(origin + g.barTicks(g.METERS["3/4"])).bar, 2);
  assert.strictEqual(at(origin - g.barTicks(g.METERS["3/4"])).bar, 0, "the pickup's own bar is 0");
});

test("a range asks for exactly what it asks for, and the ends are half-open", () => {
  const m = mk("4/4", 0);
  assert.deepEqual(g.pulsesIn(m, 0, 96).map(u => u.tick), [0], "the start is included");
  assert.deepEqual(g.pulsesIn(m, 0, 97).map(u => u.tick), [0, 96], "…and the end is not");
  assert.deepEqual(g.pulsesIn(m, 1, 96).map(u => u.tick), [], "a range between two pulses is empty");
  assert.deepEqual(g.pulsesIn(m, -96, 96).map(u => u.tick), [-96, 0], "and it spans zero without a seam");
});

test("every pulse of every preset lands on a whole column, which is what makes the projection a division", () => {
  for (const preset of PRESETS) {
    for (let originCols = 0; originCols <= 3; originCols++) {
      for (const u of g.pulsesIn(mk(preset, originCols), -1000, 1000)) {
        // Number.isInteger, not `% TPC === 0`: a negative tick divides to -0, and strictEqual(-0, 0)
        // is false. Worth knowing beyond the test — a column derived from a pre-song tick can be -0,
        // so anything keying a Map or a Set on one has to normalise it.
        assert.ok(Number.isInteger(u.tick / TPC),
          `${preset} pickup ${originCols}: a pulse at tick ${u.tick} is not on a column`);
      }
    }
  }
});

// ---------------------------------------------------------------- the memo

test("the memo carries the KIND now, and the pad tint is unchanged by that", () => {
  const saved = g.COLS;
  g.COLS = 16;
  g.doc.meterMap = [mk("3/4", 0)]; g._tintKey = null;
  const marked = new Set(g.meterLayout(16, g.meterAt()).marks.map(k => k.c));
  for (let c = 0; c < 16; c++) {
    assert.strictEqual(g.beatTintAt(c), marked.has(c), `column ${c}: the tint must not have moved`);
  }
  assert.strictEqual(g.pulseKindAt(0), "bar", "…and a barline is now distinguishable from a beat");
  assert.strictEqual(g.pulseKindAt(2), "beat");
  assert.strictEqual(g.pulseKindAt(1), null, "…while an off-pulse column is neither");
  g.doc.meterMap = []; g._tintKey = null;
  for (let c = 0; c < 32; c++) assert.strictEqual(g.beatTintAt(c), c % 4 === 0, "unmetered is byte-identically today");
  assert.strictEqual(g.pulseKindAt(0), null, "…and has no pulse to name");
  g.COLS = saved;
});
