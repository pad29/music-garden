// Meter, bars and the bar loop range (EDITOR-DESIGN §17, first slice).
//
// These matter more than a usual test file, because of something recorded in tools/goldens/README.md:
// ALL NINE playback goldens pin *scheduling* and are completely blind to *drawing*. A barline rendered
// at the wrong column, a bar numbered wrong, or a beat mark at the wrong density is invisible to every
// one of them. `meterLayout` is deliberately pure so that this file is the place those get checked.

import { test } from "node:test";
import assert from "node:assert";
import { loadGame } from "./harness.mjs";

const g = loadGame();

const unmeter = () => { g.doc.meterMap = []; g._tintKey = null; };
const meter = (preset, originCols = 0) => {
  g.doc.meterMap = [{ tick: 0, preset, originTick: originCols * g.TICKS_PER_COL }];
  g._tintKey = null;
  return g.doc.meterMap[0];
};
const barsOf = (L) => L.marks.filter(m => m.kind === "bar").map(m => m.c);
const beatsOf = (L) => L.marks.filter(m => m.kind === "beat").map(m => m.c);

// ---------------------------------------------------------------- the preset table

// 3/4 and 6/8 are the SAME length and differ only in grouping. That is the whole reason a meter cannot
// be one number, and the reason two earlier drafts of this design were rejected.
test("3/4 and 6/8 are the same bar length and differ only in how it is grouped", () => {
  const three = g.METERS["3/4"], six = g.METERS["6/8"];
  assert.strictEqual(g.barTicks(three), g.barTicks(six), "same length");
  assert.strictEqual(g.barTicks(three), 288);
  assert.deepEqual(three.beats, [96, 96, 96]);       // three quarter-note pulses
  assert.deepEqual(six.beats, [144, 144]);           // two DOTTED-quarter pulses
  assert.notStrictEqual(three.beats.length, six.beats.length);
  assert.strictEqual(six.pulse, 144, "a jig's felt pulse is a dotted quarter, so a tempo needs the preset to say so");
});

// Barlines and beat marks are positioned in whole columns. That holds for these four presets but is not
// a general law (6/16 would break it), so it is asserted rather than assumed.
test("every preset's bar is a whole number of columns", () => {
  for (const [id, P] of Object.entries(g.METERS)) {
    assert.strictEqual(g.barTicks(P) % g.TICKS_PER_COL, 0, `${id} must not need a fractional column`);
    for (const b of P.beats) assert.strictEqual(b % g.TICKS_PER_COL, 0, `${id}'s beats must land on columns`);
  }
});

test("bar lengths in columns are 8 / 6 / 6 / 4", () => {
  const cols = id => g.barTicks(g.METERS[id]) / g.TICKS_PER_COL;
  assert.strictEqual(cols("4/4"), 8);
  assert.strictEqual(cols("3/4"), 6);
  assert.strictEqual(cols("6/8"), 6);
  assert.strictEqual(cols("2/4"), 4);
});

// ---------------------------------------------------------------- meterLayout, no pickup

test("unmetered draws nothing at all", () => {
  const L = g.meterLayout(16, null);
  assert.deepEqual(L.segs, []);
  assert.deepEqual(L.marks, []);
});

test("an unknown preset draws nothing rather than throwing", () => {
  assert.deepEqual(g.meterLayout(16, { tick: 0, preset: "9/7", originTick: 0 }).marks, []);
});

test("4/4 over 16 columns is two bars, with beats every 2 columns", () => {
  const L = g.meterLayout(16, { tick: 0, preset: "4/4", originTick: 0 });
  assert.deepEqual(barsOf(L), [0, 8]);
  // The owner's 2026-08-28 decision: beat marks follow the TRUE pulse. stepDur() is 60000/tempo/2, so a
  // quarter is two columns — the tempo box has always treated a column as an eighth.
  assert.deepEqual(beatsOf(L), [2, 4, 6, 10, 12, 14]);
  assert.deepEqual(L.segs.map(s => [s.n, s.c0, s.cols]), [[1, 0, 8], [2, 8, 8]]);
});

test("3/4 and 6/8 draw the same barlines but different beats — the whole point", () => {
  const three = g.meterLayout(12, { tick: 0, preset: "3/4", originTick: 0 });
  const six = g.meterLayout(12, { tick: 0, preset: "6/8", originTick: 0 });
  assert.deepEqual(barsOf(three), barsOf(six), "same bar length, so the same barlines");
  assert.deepEqual(barsOf(three), [0, 6]);
  assert.deepEqual(beatsOf(three), [2, 4, 8, 10], "waltz: ONE-two-three");
  assert.deepEqual(beatsOf(six), [3, 9], "jig: two dotted-quarter pulses");
});

test("2/4 is a bar every 4 columns", () => {
  const L = g.meterLayout(16, { tick: 0, preset: "2/4", originTick: 0 });
  assert.deepEqual(barsOf(L), [0, 4, 8, 12]);
});

// ---------------------------------------------------------------- clipping

// An unclipped chip would run past the grid, and absolutely-positioned overflow inside .scroller
// enlarges its scrollable area — which desyncs the camera and the drum lane.
test("a final partial bar is CLIPPED to the field, never drawn past it", () => {
  const L = g.meterLayout(16, { tick: 0, preset: "3/4", originTick: 0 });
  assert.deepEqual(L.segs.map(s => [s.n, s.c0, s.cols]), [[1, 0, 6], [2, 6, 6], [3, 12, 4]]);
  const last = L.segs[L.segs.length - 1];
  assert.strictEqual(last.c0 + last.cols, 16, "the last chip ends exactly at the field's edge");
  assert.strictEqual(last.partial, true, "…and knows it is short");
  for (const m of L.marks) assert.ok(m.c < 16, `mark at ${m.c} is outside a 16-column field`);
});

test("a song may end mid-bar and nothing pads it — §17(6)", () => {
  const L = g.meterLayout(12, { tick: 0, preset: "4/4", originTick: 0 });
  assert.deepEqual(barsOf(L), [0, 8]);
  assert.deepEqual(L.segs.map(s => s.cols), [8, 4], "bar 2 is half a bar wide and stays that way");
});

// ---------------------------------------------------------------- the pickup (§17(4))

test("a pickup is bar 0, unnumbered, and bar 1 starts at the origin", () => {
  const L = g.meterLayout(16, { tick: 0, preset: "4/4", originTick: 2 * g.TICKS_PER_COL });
  const pickup = L.segs[0];
  assert.strictEqual(pickup.pickup, true);
  assert.strictEqual(pickup.n, 0);
  assert.strictEqual(pickup.c0, 0);
  assert.strictEqual(pickup.cols, 2);
  assert.strictEqual(L.segs[1].n, 1, "the bar AFTER the pickup is bar 1 — a child counting ONE must be right");
  assert.strictEqual(L.segs[1].c0, 2, "…and it starts at the origin");
  assert.deepEqual(barsOf(L), [2, 10], "no barline at column 0 — that is mid-bar");
});

// `d = col*TICKS_PER_COL - originTick` is negative inside a pickup, and JS % keeps the sign. Only songs
// with a pickup can expose it — which is Taps, Amazing Grace and Moldau, the three §17 named.
test("the pickup's own beats are drawn, counted backwards from the downbeat", () => {
  const L = g.meterLayout(16, { tick: 0, preset: "4/4", originTick: 2 * g.TICKS_PER_COL });
  // a 2-column pickup is exactly one quarter, and it starts ON a beat
  assert.ok(beatsOf(L).includes(0), "the pickup's own beat must be marked, not skipped");
  for (const m of L.marks) assert.ok(m.c >= 0, `mark at ${m.c} was drawn before the field starts`);
});

test("a one-column pickup does not push a barline off the left edge", () => {
  for (const preset of Object.keys(g.METERS)) {
    for (let o = 0; o < 4; o++) {
      const L = g.meterLayout(16, { tick: 0, preset, originTick: o * g.TICKS_PER_COL });
      for (const m of L.marks) assert.ok(m.c >= 0 && m.c < 16, `${preset}/+${o}: mark at ${m.c}`);
      for (const s of L.segs) assert.ok(s.c0 >= 0 && s.c0 + s.cols <= 16, `${preset}/+${o}: seg ${s.c0}+${s.cols}`);
    }
  }
});

// ---------------------------------------------------------------- barCols + the pad tint

test("a patch is 16 steps unmetered and one bar when metered", () => {
  unmeter();
  assert.strictEqual(g.barCols(), 16, "unmetered ＋ patch must stay exactly today's 16");
  meter("3/4"); assert.strictEqual(g.barCols(), 6);
  meter("6/8"); assert.strictEqual(g.barCols(), 6);
  meter("4/4"); assert.strictEqual(g.barCols(), 8);
  meter("2/4"); assert.strictEqual(g.barCols(), 4);
  unmeter();
});

// The one line in this slice that shipped levels execute. Levels are never metered, so they must take
// the `c%4===0` branch and nothing else.
test("the drum pad tint is byte-identically today's every-4th-column when unmetered", () => {
  unmeter();
  for (let c = 0; c < 32; c++) assert.strictEqual(g.beatTintAt(c), c % 4 === 0, `column ${c}`);
});

test("metered, the pad tint follows the meter so the two lanes cannot disagree", () => {
  const saved = g.COLS;
  g.COLS = 16;
  meter("3/4");
  const marked = new Set(g.meterLayout(16, g.meterAt()).marks.map(m => m.c));
  for (let c = 0; c < 16; c++) assert.strictEqual(g.beatTintAt(c), marked.has(c), `column ${c}`);
  // The point of finding D: the metered tint really does differ from the shipped every-4th-column one.
  // Column 6 opens bar 2 of a waltz, so it must be tinted — and 6 % 4 is 2, so today's rule would not.
  assert.strictEqual(g.beatTintAt(6), true, "column 6 is a BARLINE in 3/4");
  assert.strictEqual(6 % 4 === 0, false, "…and the shipped every-4th rule would have missed it");
  assert.strictEqual(g.beatTintAt(5), false, "an odd column is never a beat at these presets");
  unmeter();
  g.COLS = saved;
});

// ---------------------------------------------------------------- the loop range

test("with no range, the loop bounds reduce to today's 0 and COLS", () => {
  const saved = g.COLS;
  g.COLS = 16; g.loopStart = 0; g.loopEnd = 0;
  assert.strictEqual(g.rangeOn(), false);
  assert.strictEqual(g.loopA(), 0);
  assert.strictEqual(g.loopB(), 16, "loopB must be COLS, so the wrap test is the one that shipped");
  g.COLS = saved;
});

test("a range never collapses onto one column, however it is set", () => {
  const saved = g.COLS;
  g.COLS = 16;
  for (const [a, b] of [[8, 8], [12, 4], [15, 1], [0, 0], [5, 5]]) {
    g.loopStart = a; g.loopEnd = b;
    assert.ok(g.loopB() > g.loopA(), `loopStart=${a} loopEnd=${b} would be an infinite tight loop`);
  }
  g.loopStart = 0; g.loopEnd = 0; g.COLS = saved;
});

test("a range that outlived a shrink is clamped to the field it is in now", () => {
  const saved = g.COLS;
  g.COLS = 16; g.loopStart = 8; g.loopEnd = 16;
  g.COLS = 12;                                    // …as if －patch had run
  assert.ok(g.loopB() <= 12, "the loop cannot book a column the field no longer has");
  assert.ok(g.loopA() < g.loopB());
  g.loopStart = 0; g.loopEnd = 0; g.COLS = saved;
});

// ---------------------------------------------------------------- untrusted share input

test("a hostile or malformed meter in a share link normalises to unmetered, never throws", () => {
  const bad = [
    ["9/7", 0], ["", 0], [null, 0], [undefined, 2], ["4/4", -1], ["4/4", 99],
    ["4/4", 8], ["3/4", 6], ["<script>", 0], [{}, 0], ["4/4", NaN],
  ];
  for (const [preset, origin] of bad) {
    const out = g.validMeter(preset, origin);
    assert.deepEqual(out, [], `validMeter(${JSON.stringify(preset)}, ${String(origin)}) must be unmetered`);
  }
});

test("a legitimate meter survives validation with its origin intact", () => {
  const out = g.validMeter("6/8", 2);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].preset, "6/8");
  assert.strictEqual(out[0].originTick, 2 * g.TICKS_PER_COL);
  assert.strictEqual(out[0].tick, 0, "exactly one event, at tick 0 (§17(3))");
});

// An origin at or past a bar's own length is not a pickup — it is a whole bar of silence mislabelled,
// and it would put bar 1 in the wrong place.
test("an origin as long as the bar itself is rejected", () => {
  assert.deepEqual(g.validMeter("2/4", 4), [], "a 4-column origin in a 4-column bar is not a pickup");
  assert.strictEqual(g.validMeter("2/4", 3).length, 1, "…but three columns of it is");
});

// ---------------------------------------------------------------- save / share

// §17: "meter/snap may only ever be appended as slot 8, never inserted, and must be genuinely OMITTED
// rather than assigned undefined, which JSON serializes as null and breaks byte-identity."
test("an unmetered song packs to exactly 8 slots, with no null in the wire form", () => {
  unmeter();
  const packed = g.packSong(g.currentSong());
  assert.strictEqual(packed.length, 8, "a 9th slot would lengthen every link ever shared");
  const wire = JSON.stringify(packed);
  assert.ok(!wire.includes("null"), `no null may reach the wire form: ${wire.slice(0, 120)}`);
});

test("a metered song appends slot 8 and round-trips through it", () => {
  const song = g.currentSong();
  song.time.meter = "6/8";
  song.time.origin = 1;
  const packed = g.packSong(song);
  assert.strictEqual(packed.length, 9);
  assert.deepEqual(packed[8], ["6/8", 1]);
  const back = g.unpackSong(packed);
  assert.strictEqual(back.time.meter, "6/8");
  assert.strictEqual(back.time.origin, 1);
});

test("a link written before this change decodes as unmetered, not as 4/4", () => {
  const legacy = [3, "pentatonic", 16, 108, 0, "musicbox", [[60, 0]], []];
  const back = g.unpackSong(legacy);
  assert.strictEqual(back.time.meter, undefined, "an old link must never sprout bars");
  assert.strictEqual(g.validMeter(back.time.meter, back.time.origin).length, 0);
});

test("an unmetered song's encoded link is unchanged by the meter work", () => {
  unmeter();
  const a = g.encodeSong(g.currentSong());
  meter("4/4");                                   // set one…
  unmeter();                                      // …and take it away again
  assert.strictEqual(g.encodeSong(g.currentSong()), a, "a meter set and cleared must leave no trace in the link");
});

// ---------------------------------------------------------------- undo

test("a meter change is visible to the undo journal", () => {
  unmeter();
  const before = g.snapState();
  meter("3/4", 1);
  const after = g.snapState();
  assert.notStrictEqual(after, before, "without this, undo silently fails to restore a meter change");
  assert.ok(JSON.parse(after).meter.length === 1);
  assert.ok(JSON.parse(before).meter.length === 0);
  unmeter();
});

test("restoring a snapshot restores the meter with it", () => {
  unmeter();
  const empty = g.snapState();
  meter("6/8", 2);
  const metered = g.snapState();
  g.restoreSnapshot(empty);
  assert.strictEqual(g.meterAt(), null, "undo must take the bars away again");
  g.restoreSnapshot(metered);
  assert.strictEqual(g.meterAt().preset, "6/8");
  assert.strictEqual(g.meterAt().originTick, 2 * g.TICKS_PER_COL);
  unmeter();
});

// ---------------------------------------------------------------- fixes from the 2026-08-28 test round

// `METERS[id]` alone accepts "toString", "constructor", "valueOf" and "__proto__" — inherited, truthy,
// and with no `.beats`, so barTicks threw. The throw landed INSIDE applySong's tx, after the palette,
// COLS and both tracks had been written, leaving the Studio holding a stranger's notes behind a stale
// grid. Every lookup goes through meterDef now, so test the gate itself rather than each caller.
test("inherited Object.prototype names are not meters", () => {
  for (const k of ["toString", "constructor", "valueOf", "hasOwnProperty", "__proto__", "9/7", "", null, 4]) {
    assert.strictEqual(g.meterDef(k), null, `${String(k)} must not resolve to a preset`);
  }
  for (const k of Object.keys(g.METERS)) assert.ok(g.meterDef(k), `${k} must still resolve`);
});

test("the meter picker and a share link go through the same gate", () => {
  g.setMeter("toString", 0);
  assert.strictEqual(g.meterAt(), null, "a hostile preset must leave the song unmetered, not half-set");
  g.setMeter("3/4", 99);
  assert.strictEqual(g.meterAt(), null, "an origin longer than the bar is not a pickup");
  g.setMeter("3/4", 1);
  assert.strictEqual(g.meterAt().originTick, g.TICKS_PER_COL);
  unmeter();
});

// Time surgery moves the music; the meter has to come with it or the barlines detach from the notes on
// the first ＋/－ room. An origin is a PICKUP — always a fraction of a bar — so it wraps rather than
// growing into "bar 1 starts three bars in".
test("the meter origin travels with time surgery, and wraps inside one bar", () => {
  const bar = 8 * g.TICKS_PER_COL;                       // 4/4
  meter("4/4", 2);
  g.shiftMeterOrigin(0, g.TICKS_PER_COL);                // insert one column at the very start
  assert.strictEqual(g.meterAt().originTick, 3 * g.TICKS_PER_COL);
  g.shiftMeterOrigin(0, 6 * g.TICKS_PER_COL);            // …past the end of the bar
  assert.strictEqual(g.meterAt().originTick, (9 * g.TICKS_PER_COL) % bar, "must wrap, not run away");
  assert.ok(g.meterAt().originTick < bar);
  meter("4/4", 2);
  g.shiftMeterOrigin(0, -3 * g.TICKS_PER_COL);           // remove more than the pickup holds
  assert.ok(g.meterAt().originTick >= 0, "a negative origin would put bar 1 off the field");
  assert.ok(g.meterAt().originTick < bar);
  unmeter();
});

test("an edit after the downbeat leaves bar 1 where it is", () => {
  meter("4/4", 2);
  const was = g.meterAt().originTick;
  g.shiftMeterOrigin(10 * g.TICKS_PER_COL, g.TICKS_PER_COL);
  assert.strictEqual(g.meterAt().originTick, was, "inserting later in the song must not move bar 1");
  unmeter();
});
