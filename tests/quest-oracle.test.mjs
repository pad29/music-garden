// Differential oracle for the projectTracks() extraction.
//
// `quest-seams.test.mjs` has an agreement test that computes its expectation with
// projectTracks() and then checks a wrapper which calls projectTracks(). That proves the grids
// are ASSIGNED correctly; it cannot detect an algorithmic difference from the reproject() that
// shipped before the extraction — gpt-tester flagged it as a tautology. This file reimplements
// the old algorithm verbatim as an independent oracle and diffs the two.

import { test } from "node:test";
import assert from "node:assert";
import { loadGame } from "./harness.mjs";

const g = loadGame();

/** The pre-extraction reproject(), transcribed literally — the only copy of it left. */
function oldReproject(tracks, midi, cols, drumsLen, ticksPerCol) {
  const rows = midi.length;
  const grid = Array.from({ length: rows }, () => Array(cols).fill(false));
  const gridNote = Array.from({ length: rows }, () => Array(cols).fill(null));
  const drumG = Array.from({ length: drumsLen }, () => Array(cols).fill(false));
  const projRow = (p) => {
    let best = null, bd = Infinity;
    for (let r = 0; r < rows; r++) { const d = Math.abs(midi[r] - p); if (d === 0) return r; if (d < bd) { bd = d; best = r; } }
    return best;
  };
  const noteCol = (n) => Math.round(n.startTick / ticksPerCol);
  for (const n of tracks.find((t) => t.role === "melody").notes) {
    const r = projRow(n.pitch), c = noteCol(n);
    if (r != null && c >= 0 && c < cols) { grid[r][c] = true; gridNote[r][c] = n; }
  }
  for (const n of tracks.find((t) => t.role === "drums").notes) {
    const c = noteCol(n);
    if (n.pitch >= 0 && n.pitch < drumsLen && c >= 0 && c < cols) drumG[n.pitch][c] = true;
  }
  return { grid, gridNote, drumG };
}

test("projectTracks reproduces the pre-extraction reproject algorithm exactly", () => {
  const T = g.TICKS_PER_COL;
  const mel = (pitch, col, durationTicks = T) => ({ pitch, startTick: col * T, durationTicks });
  const cases = [
    ["empty", []],
    // real ties: in pentatonic 73 is equidistant from 74 (row 3) and 72 (row 4), and 63 from
    // 64 (row 7) and 62 (row 8). Strict `<` keeps the FIRST — flipping it to `<=` picks the
    // second, which is the tie-break this case exists to pin.
    ["nearest-match ties", [mel(73, 0), mel(63, 1)]],
    ["exact and snapped", [mel(60, 0), mel(65, 1), mel(71, 2)]],
    ["boundaries", [mel(60, -1), mel(62, 0), mel(64, 3)]],
    ["fractional onset rounds", [{ pitch: 60, startTick: Math.round(1.5 * T), durationTicks: T }]],
    ["duplicate cell keeps the last", [mel(60, 2), mel(60, 2)]],
    ["long and zero durations", [mel(60, 0, T * 9), mel(62, 1, 0)]],
    ["out-of-range pitch", [mel(200, 0), mel(-5, 1)]],
  ];

  for (const [label, notes] of cases) {
    for (const pal of ["pentatonic", "diatonic"]) {
      for (const span of [1, 4, 16, 24]) {
        const tracks = [
          { role: "melody", notes },
          { role: "drums", notes: [{ pitch: 0, startTick: 0, durationTicks: T }, { pitch: 2, startTick: 3 * T, durationTicks: T }] },
        ];
        const where = `${label} / ${pal} / span ${span}`;
        const mine = g.projectTracks(tracks, pal, span);
        const old = oldReproject(tracks, g.PALETTES[pal].MIDI, span, g.DRUMS.length, T);

        assert.deepEqual(mine.grid, old.grid, `${where}: grid`);
        assert.deepEqual(mine.drumG, old.drumG, `${where}: drumG`);
        // Identity, not just shape: gridNote feeds the duration lookup at play time and the
        // vine layer's hit test, so the same note OBJECT has to come back.
        for (let r = 0; r < mine.rows; r++)
          for (let c = 0; c < span; c++)
            assert.strictEqual(mine.gridNote[r][c], old.gridNote[r][c], `${where}: gridNote[${r}][${c}] identity`);
      }
    }
  }
});

test("a document missing a track no longer throws — a deliberate, documented deviation", () => {
  // The old reproject() called tracks.find(...).notes unguarded, so a document without a melody
  // or a drums track threw a TypeError. projectTracks() treats a missing track as empty, because
  // it is also the analyser for SAVED songs, which may legitimately carry only one track.
  // Unreachable from the live path — every construction path keeps both tracks — so reproject()'s
  // behaviour is unchanged in practice. Pinned here so the deviation stays a decision, not a drift.
  const melodyOnly = [{ role: "melody", notes: [{ pitch: 60, startTick: 0, durationTicks: 4 }] }];

  const p = g.projectTracks(melodyOnly, "pentatonic", 4);
  assert.strictEqual(p.grid[9][0], true, "the melody still projects (C4 is the bottom pentatonic row)");
  assert.strictEqual(p.drumG.every((lane) => lane.every((on) => on === false)), true, "absent drums read as empty");

  assert.throws(
    () => oldReproject(melodyOnly, g.PALETTES.pentatonic.MIDI, 4, g.DRUMS.length, g.TICKS_PER_COL),
    "the old algorithm threw on this same input — that is the deviation being recorded"
  );
});
