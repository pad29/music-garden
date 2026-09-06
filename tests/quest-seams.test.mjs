import { test } from "node:test";
import assert from "node:assert";
import { loadGame } from "./harness.mjs";

const g = loadGame();
const EVEN_STEPS = [0, 2, 4, 6, 8, 10, 12, 14];

function drumGrid(...lanes) {
  const grid = Array.from({ length: 3 }, () => Array(16).fill(false));
  for (const [lane, steps] of lanes) for (const step of steps) grid[lane][step] = true;
  return grid;
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function countHits(grid) {
  return grid.reduce((total, row) => total + row.filter(Boolean).length, 0);
}

const pulseCases = [
  ["kickOn4", drumGrid([0, [0, 4, 8, 12]])],
  ["kickClean", drumGrid([0, [0, 4, 8, 12]])],
  ["kickWalk8", drumGrid([0, EVEN_STEPS])],
  ["snareBackbeat", drumGrid([1, [4, 12]])],
  ["snareBackbeatClean", drumGrid([1, [4, 12]])],
  ["hat8ths", drumGrid([2, EVEN_STEPS])],
];

test("explicit pulse grids determine all six verdicts without consulting opposite live state", () => {
  const fresh = loadGame({ fresh: true });

  for (const [name, passing] of pulseCases) {
    const failing = drumGrid();

    fresh.drumG = failing;
    assert.strictEqual(fresh[name](), false, `${name}: failing live grid establishes the opposite verdict`);
    assert.strictEqual(fresh[name](passing), true, `${name}: explicit passing grid wins over failing live grid`);

    fresh.drumG = passing;
    assert.strictEqual(fresh[name](), true, `${name}: passing live grid establishes the opposite verdict`);
    assert.strictEqual(fresh[name](failing), false, `${name}: explicit failing grid wins over passing live grid`);
  }
});

test("pulse helper defaults agree with explicitly passing the live drum grid", () => {
  const fresh = loadGame({ fresh: true });
  fresh.drumG = drumGrid(
    [0, [0, 4, 8, 12]],
    [1, [4]],
    [2, EVEN_STEPS]
  );

  for (const [name] of pulseCases) {
    assert.strictEqual(fresh[name](), fresh[name](fresh.drumG), name);
  }
});

test("pulse helpers neither throw on nor mutate a deeply frozen explicit grid", () => {
  const frozen = deepFreeze(drumGrid(
    [0, EVEN_STEPS],
    [1, [4, 12]],
    [2, EVEN_STEPS]
  ));
  const before = frozen.map((row) => row.slice());

  for (const [name] of pulseCases) {
    assert.doesNotThrow(() => g[name](frozen), name);
  }
  assert.deepEqual(frozen, before);
});

test("projectTracks is deterministic and does not mutate deeply frozen tracks", () => {
  const tracks = deepFreeze([
    {
      id: "melody",
      role: "melody",
      notes: [
        { id: "m1", pitch: 65, startTick: 0, durationTicks: 96, velocity: 1 },
        { id: "m2", pitch: 71, startTick: g.TICKS_PER_COL, durationTicks: 48, velocity: 0.8 },
      ],
    },
    {
      id: "drums",
      role: "drums",
      notes: [
        { id: "d1", pitch: 0, startTick: 0, durationTicks: 48, velocity: 1 },
        { id: "d2", pitch: 2, startTick: 2 * g.TICKS_PER_COL, durationTicks: 48, velocity: 1 },
      ],
    },
  ]);
  const before = JSON.parse(JSON.stringify(tracks));

  let first;
  assert.doesNotThrow(() => {
    first = g.projectTracks(tracks, "pentatonic", 8);
  });
  assert.deepEqual(tracks, before, "the input graph is unchanged");

  const second = g.projectTracks(tracks, "pentatonic", 8);
  assert.deepEqual(second, first, "equal inputs produce equal projections");
  assert.deepEqual(tracks, before, "a repeated projection still leaves the input unchanged");
});

test("projectTracks uses the named palette and nearest-matches pitches missing from it", () => {
  const tracks = [
    {
      role: "melody",
      notes: [
        { pitch: 65, startTick: 0, durationTicks: g.TICKS_PER_COL },
        { pitch: 71, startTick: g.TICKS_PER_COL, durationTicks: g.TICKS_PER_COL },
      ],
    },
    { role: "drums", notes: [] },
  ];

  const pentatonic = g.projectTracks(tracks, "pentatonic", 4);
  const diatonic = g.projectTracks(tracks, "diatonic", 4);

  assert.strictEqual(pentatonic.rows, 10);
  assert.strictEqual(diatonic.rows, 14);
  assert.strictEqual(pentatonic.palette, "pentatonic");
  assert.strictEqual(diatonic.palette, "diatonic");

  assert.strictEqual(pentatonic.grid[7][0], true, "F4 snaps to pentatonic E4");
  assert.strictEqual(diatonic.grid[10][0], true, "F4 is exact in the diatonic palette");
  assert.strictEqual(pentatonic.grid[4][1], true, "B4 snaps to pentatonic C5");
  assert.strictEqual(diatonic.grid[7][1], true, "B4 is exact in the diatonic palette");
  assert.strictEqual(countHits(pentatonic.grid), 2, "missing pentatonic pitches are snapped, not dropped");
  assert.strictEqual(countHits(diatonic.grid), 2);
});

test("projectTracks clips notes to the requested span and valid drum lanes", () => {
  const span = 4;
  const tracks = [
    {
      role: "melody",
      notes: [
        { pitch: 60, startTick: 0, durationTicks: g.TICKS_PER_COL },
        { pitch: 62, startTick: 3 * g.TICKS_PER_COL, durationTicks: g.TICKS_PER_COL },
        { pitch: 64, startTick: span * g.TICKS_PER_COL, durationTicks: g.TICKS_PER_COL },
        { pitch: 67, startTick: -g.TICKS_PER_COL, durationTicks: g.TICKS_PER_COL },
      ],
    },
    {
      role: "drums",
      notes: [
        { pitch: 0, startTick: g.TICKS_PER_COL, durationTicks: g.TICKS_PER_COL },
        { pitch: 2, startTick: 3 * g.TICKS_PER_COL, durationTicks: g.TICKS_PER_COL },
        { pitch: 1, startTick: span * g.TICKS_PER_COL, durationTicks: g.TICKS_PER_COL },
        { pitch: 3, startTick: 2 * g.TICKS_PER_COL, durationTicks: g.TICKS_PER_COL },
        { pitch: -1, startTick: 2 * g.TICKS_PER_COL, durationTicks: g.TICKS_PER_COL },
      ],
    },
  ];

  const projected = g.projectTracks(tracks, "pentatonic", span);

  assert.strictEqual(projected.span, span);
  assert.strictEqual(projected.grid.length, projected.rows);
  assert.strictEqual(projected.grid.every((row) => row.length === span), true);
  assert.strictEqual(projected.gridNote.every((row) => row.length === span), true);
  assert.strictEqual(projected.drumG.length, 3);
  assert.strictEqual(projected.drumG.every((lane) => lane.length === span), true);
  assert.strictEqual(countHits(projected.grid), 2, "negative and at-span melody onsets are dropped");
  assert.strictEqual(countHits(projected.drumG), 2, "at-span onsets and invalid drum lanes are dropped");
  assert.strictEqual(projected.drumG[0][1], true);
  assert.strictEqual(projected.drumG[2][3], true);
});

test("reproject produces the same legacy grids as projectTracks for the live document", () => {
  const fresh = loadGame({ fresh: true });
  fresh.setPalette("diatonic");
  fresh.doc.tracks = [
    {
      id: "melody",
      role: "melody",
      notes: [
        { id: "m1", pitch: 65, startTick: 0, durationTicks: 96, velocity: 1 },
        { id: "m2", pitch: 71, startTick: 5 * fresh.TICKS_PER_COL, durationTicks: 48, velocity: 1 },
      ],
    },
    {
      id: "drums",
      role: "drums",
      notes: [
        { id: "d1", pitch: 0, startTick: 4 * fresh.TICKS_PER_COL, durationTicks: 48, velocity: 1 },
        { id: "d2", pitch: 2, startTick: 14 * fresh.TICKS_PER_COL, durationTicks: 48, velocity: 1 },
      ],
    },
  ];
  const expected = fresh.projectTracks(fresh.doc.tracks, fresh.paletteId, fresh.COLS);

  fresh.reproject();

  assert.deepEqual(fresh.grid, expected.grid);
  assert.deepEqual(fresh.gridNote, expected.gridNote);
  assert.deepEqual(fresh.drumG, expected.drumG);
});

test("kickWalk8 is equivalent to the Footsteps inline eight-even-kicks predicate", () => {
  const grids = [
    drumGrid(),
    drumGrid([0, EVEN_STEPS]),
    drumGrid([0, EVEN_STEPS.slice(0, -1)]),
    drumGrid([0, [...EVEN_STEPS, 1]]),
    drumGrid([0, Array.from({ length: 16 }, (_, step) => step)]),
    drumGrid([2, EVEN_STEPS]),
  ];
  const inlinePredicate = (dg) => EVEN_STEPS.every((step) => dg[0][step]);

  for (const [index, dg] of grids.entries()) {
    assert.strictEqual(g.kickWalk8(dg), inlinePredicate(dg), `grid ${index}`);
  }
  assert.strictEqual(g.kickWalk8(grids[3]), true, "an extra odd kick remains allowed");
  assert.strictEqual(g.kickWalk8(grids[4]), true, "all eight extra odd kicks remain allowed");
});