// Edge cases deliberately outside meter.test.mjs: hostile wire input, the level quarantine,
// and pre-existing time surgery acting on the newly musical meter/range state.

import { test } from "node:test";
import assert from "node:assert";
import { loadGame } from "./harness.mjs";

const metered = (g, preset = "3/4", originCols = 0) => {
  g.doc.meterMap = [{ tick: 0, preset, originTick: originCols * g.TICKS_PER_COL }];
  g._tintKey = null;
};

test("every shipped level clears a Studio meter and restores the legacy pad tint", () => {
  const g = loadGame({ fresh: true });

  for (const id of Object.keys(g.PACKAGES)) {
    if (id === "studio") continue;
    for (let level = 0; level < g.PACKAGES[id].levels.length; level++) {
      g.openStudio();
      g.setMeter("3/4", 1);
      g.openPkg(id, level);
      assert.deepEqual(g.doc.meterMap, [], `${id}/${level} retained a Studio meter`);
      g.undoEdit();
      assert.deepEqual(g.doc.meterMap, [], `${id}/${level} let Undo restore a Studio meter`);
      for (let c = 0; c < g.COLS; c++) {
        assert.strictEqual(g.beatTintAt(c), c % 4 === 0, `${id}/${level}, column ${c}`);
      }
    }
  }
});

test("validMeter rejects inherited Object.prototype preset names instead of throwing", () => {
  const g = loadGame({ fresh: true });
  for (const preset of ["constructor", "__proto__", "toString"]) {
    assert.doesNotThrow(() => {
      assert.deepEqual(g.validMeter(preset, 0), [], `${preset} must be unmetered`);
    }, `${preset} must not turn a hostile share link into an exception`);
  }
});

test("removing time that shrinks past a live range clears the range instead of collapsing it to one column", () => {
  const g = loadGame({ fresh: true });
  g.COLS = 24;
  g.loopStart = 16;
  g.loopEnd = 24;

  g.modelRemoveTime(0, 8 * g.TICKS_PER_COL);

  assert.strictEqual(g.COLS, 16);
  assert.strictEqual(g.rangeOn(), false, "a removed endpoint cannot remain an active range");
  assert.strictEqual(g.loopStart, 0);
  assert.strictEqual(g.loopEnd, 0);
});

test("inserting time before a pickup moves the meter origin with the shifted music", () => {
  const g = loadGame({ fresh: true });
  g.COLS = 16;
  metered(g, "4/4", 2);

  g.modelInsertTime(0, g.TICKS_PER_COL);

  assert.strictEqual(g.doc.meterMap[0].originTick, 3 * g.TICKS_PER_COL,
    "inserting one pickup step before bar 1 must move bar 1 one step right");
});

test("removing pickup time moves bar 1 left with the remaining music", () => {
  const g = loadGame({ fresh: true });
  g.COLS = 24;
  metered(g, "4/4", 2);

  g.modelRemoveTime(0, 2 * g.TICKS_PER_COL);

  assert.strictEqual(g.doc.meterMap[0].originTick, 0,
    "cutting the complete pickup must leave bar 1 at the new column 0");
});
