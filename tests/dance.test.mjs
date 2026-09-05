// Waltz and Jig — the band content §17 said meter alone could not deliver.
//
// The point of the whole exercise is that 3/4 and 6/8 are the SAME bar width and differ only in
// grouping, so most of what is worth asserting here is the difference between two grooves that occupy
// identical space. No golden can hear any of this (see tests/groove.test.mjs), so it lives here.

import { test } from "node:test";
import assert from "node:assert";
import { loadGame } from "./harness.mjs";

const g = loadGame();

const waltz = g.GROOVES.find(G => G.comp === "oompah");
const jig = g.GROOVES.find(G => G.comp === "pulse");
const bar = c => c % 6;

const unmeter = () => { g.doc.meterMap = []; g._tintKey = null; };
const meter = (preset, originCols = 0) => {
  g.doc.meterMap = [{ tick: 0, preset, originTick: originCols * g.TICKS_PER_COL }];
  g._tintKey = null;
};

// ---------------------------------------------------------------- the two dances exist and differ

test("both dances ship, six columns to the bar, four bars to the cycle", () => {
  for (const [name, G] of [["waltz", waltz], ["jig", jig]]) {
    assert.ok(G, `${name} groove exists`);
    assert.strictEqual(G.bar, 6, `${name}: a six-column bar`);
    assert.strictEqual(G.cycle, 24, `${name}: four bars`);
    assert.strictEqual(G.swing, 0, `${name}: the swing lens must stay inert — in 6/8 the columns ARE the subdivision`);
    assert.strictEqual(g.groovePlan(G, 0).chordCols, 6, `${name}: one chord per bar`);
  }
});

// This is the claim the whole meter decision rests on, now audible: identical bar width, different feel.
test("the waltz and the jig fill the same bar and do not agree about anything inside it", () => {
  assert.strictEqual(g.barTicks(g.METERS["3/4"]), g.barTicks(g.METERS["6/8"]),
    "the two meters really are the same length");
  const wBass = [], jBass = [];
  for (let c = 0; c < 6; c++) {
    if (g.groovePlan(waltz, c).bass.length) wBass.push(c);
    if (g.groovePlan(jig, c).bass.length) jBass.push(c);
  }
  assert.deepEqual(wBass, [0], "a waltz puts its OOM on one and nowhere else");
  assert.deepEqual(jBass, [0, 3], "a jig has two pulses");
  assert.notDeepEqual(wBass, jBass);
});

// ---------------------------------------------------------------- the waltz

test("oom-pah-pah: bass alone on one, chord on two and three", () => {
  const at = c => g.groovePlan(waltz, c);
  assert.strictEqual(at(0).chord, null, "beat 1 is BASS ALONE — a chord there is what stops it being a waltz");
  assert.ok(at(0).bass.length === 1);
  assert.ok(at(2).chord, "the first pah");
  assert.ok(at(4).chord, "the second pah");
  assert.deepEqual(at(2).bass, [], "…and the pahs carry no bass");
  assert.deepEqual(at(4).bass, []);
  assert.strictEqual(at(1).chord, null); assert.strictEqual(at(3).chord, null); assert.strictEqual(at(5).chord, null);
});

test("a waltz has no backbeat at all", () => {
  for (let c = 0; c < 24; c++) {
    assert.deepEqual(g.groovePlan(waltz, c).snare, [], `column ${c}: a snare on 2 is what kills a waltz`);
  }
});

test("the waltz's comp stab is shorter than a sustained bed", () => {
  const P = g.groovePlan(waltz, 2);
  assert.strictEqual(P.chordHold, 2, "one beat, not the whole six-column region");
  assert.ok(P.chordHold < P.chordCols, "a comp is not a bed");
});

test("the waltz bass alternates root and fifth bar by bar, so four bars are not four thumps", () => {
  const root = waltz.prog[0].bass;
  assert.deepEqual(g.groovePlan(waltz, 0).bass, [root], "bar 1: the root");
  assert.deepEqual(g.groovePlan(waltz, 6).bass, [waltz.prog[1].bass + 7], "bar 2: a fifth above ITS chord");
});

// ---------------------------------------------------------------- the jig

test("the jig is 3+3: two pulses over six running eighths", () => {
  const at = c => g.groovePlan(jig, c);
  assert.ok(at(0).chord && at(3).chord, "a chord on each dotted-quarter pulse");
  assert.strictEqual(at(2).chord, null, "…and nowhere else in the bar");
  assert.deepEqual(at(0).kick, [0.36]); assert.deepEqual(at(3).kick, [0.36]);
  assert.deepEqual(at(1).kick, [], "the kick marks the pulse, not the eighths");
  for (let c = 0; c < 6; c++) assert.strictEqual(at(c).hat.length, 1, `column ${c}: the lilt runs underneath`);
  assert.strictEqual(at(0).chordHold, 3, "a pulse is three columns long");
});

test("the jig's bass answers its root with a fifth on the second pulse", () => {
  const root = jig.prog[0].bass;
  assert.deepEqual(g.groovePlan(jig, 0).bass, [root]);
  assert.deepEqual(g.groovePlan(jig, 3).bass, [root + 7]);
});

// ---------------------------------------------------------------- which groove may play which meter

test("a dance belongs to its own meter and the shipped five belong to the others", () => {
  assert.ok(g.grooveFits(waltz, "3/4")); assert.ok(!g.grooveFits(waltz, "6/8"));
  assert.ok(!g.grooveFits(waltz, "4/4")); assert.ok(!g.grooveFits(waltz, null));
  assert.ok(g.grooveFits(jig, "6/8")); assert.ok(!g.grooveFits(jig, "3/4"));
  for (let i = 0; i < 5; i++) {
    const G = g.GROOVES[i];
    assert.ok(g.grooveFits(G, null), `${G.name} plays unmetered, as it always has`);
    assert.ok(g.grooveFits(G, "4/4"), `${G.name}: 16 divides an 8-column bar`);
    assert.ok(g.grooveFits(G, "2/4"), `${G.name}: …and a 4-column one`);
    assert.ok(!g.grooveFits(G, "3/4"), `${G.name}: but not a six-column bar`);
    assert.ok(!g.grooveFits(G, "6/8"));
  }
});

test("every meter has a band, so Jam is never disabled again", () => {
  for (const preset of ["", "4/4", "3/4", "6/8", "2/4"]) {
    if (preset) meter(preset); else unmeter();
    assert.ok(g.grooveChoices().length > 0, `${preset || "free"} must have somewhere to go`);
    assert.strictEqual(g.jamFitsMeter(), true);
  }
  unmeter();
});

// ---------------------------------------------------------------- normalisation

test("choosing a dance meter moves an incompatible groove, and leaves a compatible one alone", () => {
  unmeter(); g.grooveIdx = 2;                       // Doo-wop
  assert.strictEqual(g.normalizeGroove(), false, "unmetered, an old groove is fine");
  assert.strictEqual(g.grooveIdx, 2);
  meter("3/4");
  assert.strictEqual(g.normalizeGroove(), true, "…but a waltz cannot be played by Doo-wop");
  assert.strictEqual(g.GROOVES[g.grooveIdx].comp, "oompah");
  assert.strictEqual(g.normalizeGroove(), false, "…and once it fits, nothing moves");
  unmeter();
  assert.strictEqual(g.normalizeGroove(), true, "leaving the meter moves it back off the dance");
  assert.ok(g.grooveIdx < 5);
  g.grooveIdx = 0;
});

// The load path's real case: songs saved between the meter slice and the dances legitimately pair a 3/4
// meter with one of the old grooves, because currentSong has always written grooveIdx whether or not Jam
// could use it. That is normal saved state, not corruption, and it migrates rather than being rejected.
test("a song saved with a 3/4 meter and an old groove migrates to the dance", () => {
  const song = { v: 3, meta: {}, palette: "pentatonic",
    time: { cols: 24, tempo: 120, groove: 0, meter: "3/4", origin: 0 },
    tracks: [{ kind: "melody", voice: "musicbox", notes: [] }, { kind: "drums", hits: [] }] };
  g.applySong(song);
  assert.strictEqual(g.meterAt().preset, "3/4");
  assert.strictEqual(g.GROOVES[g.grooveIdx].comp, "oompah", "the band follows the meter it was saved with");
  unmeter(); g.grooveIdx = 0;
});

test("loading a song does not let the groove fallback overwrite the tempo the song carries", () => {
  const tempo = g.__document.getElementById("tempo");
  const song = { v: 3, meta: {}, palette: "pentatonic",
    time: { cols: 24, tempo: 96, groove: 0, meter: "6/8", origin: 0 },
    tracks: [{ kind: "melody", voice: "musicbox", notes: [] }, { kind: "drums", hits: [] }] };
  g.applySong(song);
  assert.strictEqual(g.GROOVES[g.grooveIdx].comp, "pulse", "it did migrate to the jig");
  assert.strictEqual(+tempo.value, 96, "…and did NOT stamp the jig's own 138 over the song's 96");
  unmeter(); g.grooveIdx = 0;
});

// grooveIdx is part of snapState, so a fallback journalled outside the meter transaction would let undo
// restore the old meter beside the new groove.
test("the meter and the groove move together, so undo cannot restore a mismatched pair", () => {
  unmeter(); g.grooveIdx = 0;
  const before = g.snapState();
  g.setMeter("3/4", 0);
  const after = g.snapState();
  assert.notStrictEqual(after, before);
  const A = JSON.parse(after);
  assert.strictEqual(A.meter[0].preset, "3/4");
  assert.ok(g.grooveFits(g.GROOVES[A.groove], "3/4"), "the snapshot's own pair is coherent");
  g.restoreSnapshot(before);
  assert.strictEqual(g.meterAt(), null);
  assert.ok(g.grooveFits(g.GROOVES[g.grooveIdx], null), "…and so is the one undo restores");
  g.setMeter("", 0); g.grooveIdx = 0;
});

// ---------------------------------------------------------------- indices are song state, forever

test("the dances were APPENDED — every index a saved song may hold still means what it meant", () => {
  const shipped = ["🎵 Pop", "💗 Ballad", "🕺 Doo-wop", "🌙 Lo-fi", "🤠 Folk"];
  shipped.forEach((name, i) => assert.strictEqual(g.GROOVES[i].name, name, `index ${i} must not move`));
  assert.ok(g.GROOVES.length > 5);
  for (let i = 5; i < g.GROOVES.length; i++) assert.ok(g.GROOVES[i].meter, "…and everything appended is tagged");
});

test("the select carries array indices, not positions in the filtered list", () => {
  meter("6/8");
  const choices = g.grooveChoices();
  assert.strictEqual(choices.length, 1, "only the jig can play a jig");
  assert.ok(choices[0].i >= 5, "…and its index is its place in GROOVES, which is what a song saves");
  assert.strictEqual(g.GROOVES[choices[0].i], choices[0].G);
  unmeter();
});

// ---------------------------------------------------------------- the tempo ceiling (2026-08-29)

// The dial is QUARTER-note BPM and a column is an EIGHTH, so a quarter is two columns and the field runs
// at 2*tempo columns a minute. A jig's felt pulse is a dotted quarter — three columns — so its rate is
// 2*tempo/3. Worth writing out: the first version of this helper said tempo/3, which is the same slip in
// the other direction from the one that made the jig a lilt in the first place.
const dottedQuartersPerMin = bpm => bpm * 2 / 3;

test("the Jig is a real jig, not a lilt", () => {
  const jigG = g.GROOVES.find(G => G.comp === "pulse");
  const rate = dottedQuartersPerMin(jigG.bpm);
  assert.ok(rate >= 110 && rate <= 132,
    `a session jig is ~120 dotted quarters a minute; this one is ${rate}`);
  // …and it could not have been, at the old ceiling
  assert.ok(jigG.bpm > 170, "which is why the dial had to go past 170");
});

test("the dial can actually reach every tempo the game assigns, including the jig's", () => {
  const tempo = g.__document.getElementById("tempo");
  for (const G of g.GROOVES) {
    tempo.value = G.bpm;
    assert.strictEqual(+tempo.value, G.bpm, `${G.name}'s ${G.bpm} must not clamp`);
  }
});

// This is WHY raising the maximum is free, and it is worth pinning because the reasoning is not obvious:
// the sampled-voice ceiling is set by the SLOWEST tempo, where an 8-column vine is longest. A faster
// maximum only ever makes notes shorter. Lowering the MINIMUM is the change that would threaten it.
test("the voice ceiling is governed by the slowest tempo, not the fastest", () => {
  const tempo = g.__document.getElementById("tempo");
  const colMs = bpm => 60000 / bpm / 2;
  const longestVine = bpm => g.MAX_VINE * colMs(bpm) / 1000;
  const slowest = +tempo.min, fastest = +tempo.max;
  assert.ok(longestVine(slowest) > longestVine(fastest), "slower means longer, always");
  assert.ok(longestVine(slowest) <= g.VOICE_MAX_SEC,
    `an ${g.MAX_VINE}-column vine at ${slowest} BPM is ${longestVine(slowest)}s and must fit inside VOICE_MAX_SEC=${g.VOICE_MAX_SEC}`);
  assert.ok(longestVine(fastest) < g.VOICE_MAX_SEC, "…and the fast end has room to spare");
});

// ---------------------------------------------------------------- the free Studio may have any band

// Owner, 2026-09-05: with no meter there is no bar drawn for a dance to contradict, so why shouldn't the
// Studio offer one? Agreed — but gated on the STUDIO, not on the absence of a meter, because every
// shipped level is unmetered too and `grooveFits(G, null)` is the guard that keeps a waltz out of them.
const asStudio = fn => { const was = g.currentPkg; g.currentPkg = "studio"; try { return fn(); } finally { g.currentPkg = was; } };
const asLevel  = fn => { const was = g.currentPkg; g.currentPkg = "stepping-stones"; try { return fn(); } finally { g.currentPkg = was; } };

test("with no meter, the Studio offers the dances too", () => {
  unmeter();
  asStudio(() => {
    const names = g.grooveChoices().map(x => x.G.name);
    assert.strictEqual(names.length, g.GROOVES.length, "every band is on the list");
    assert.ok(names.some(n => /Waltz/.test(n)));
    assert.ok(names.some(n => /Jig/.test(n)));
  });
});

// The whole reason this is gated on the Studio rather than on `!meter`.
test("a level offers only the shipped five, however free it is", () => {
  unmeter();
  asLevel(() => {
    const choices = g.grooveChoices();
    assert.strictEqual(choices.length, 5, "a package must never be offered a dance");
    for (const { G } of choices) assert.ok(!G.meter, `${G.name} is untagged`);
  });
});

test("a dance chosen in the free Studio survives a redraw there, and is moved off on the way out", () => {
  unmeter();
  const waltzIdx = g.GROOVES.indexOf(waltz);
  asStudio(() => {
    g.grooveIdx = waltzIdx;
    assert.strictEqual(g.normalizeGroove(), false, "it may stay while we are in the Studio");
    assert.strictEqual(g.grooveIdx, waltzIdx);
  });
  // …and now the player walks into a package, which is where resetTransient runs
  asLevel(() => {
    assert.strictEqual(g.normalizeGroove(), true, "the waltz cannot come along");
    assert.ok(g.grooveIdx < 5, "…and lands on one the level can actually use");
  });
  g.grooveIdx = 0;
});

// A scripted reveal applies the selected groove's BPM. This is the concrete harm the gate prevents.
test("a jam reveal in a package can never inherit a six-column band", () => {
  unmeter();
  asStudio(() => { g.grooveIdx = g.GROOVES.indexOf(jig); });
  asLevel(() => {
    g.normalizeGroove();
    const G = g.GROOVES[g.grooveIdx];
    assert.ok(!G.bar, `${G.name} must not be written in bars — a reveal would play it`);
    assert.ok(!G.meter, "…and must not be a dance");
    assert.ok(G.bpm <= 170, "…nor drag a level's reveal to a dance tempo");
  });
  g.grooveIdx = 0;
});

test("with a meter set, the offer is still exactly what can play it", () => {
  asStudio(() => {
    meter("3/4");
    assert.deepEqual(g.grooveChoices().map(x => x.G.comp), ["oompah"], "a waltz meter takes the waltz alone");
    meter("4/4");
    assert.strictEqual(g.grooveChoices().length, 5, "…and a march takes the shipped five");
    for (const { G } of g.grooveChoices()) assert.ok(!G.meter);
  });
  unmeter();
});
