// The band. This file exists because the `D_jam` playback golden CANNOT SEE THE BAND AT ALL.
//
// Its capture wrapper records only that `jamStep` was called — `{k:'j', step, dt}` — and the groove's own
// kick/snare/hat are booked straight onto `jamBus` rather than through `DRUMS[i].play`, which is the only
// percussion the wrapper intercepts. That is why every step of `D_jam` reads `drums: []`, and why its own
// `_note` admits its value is "the fact that every step fires a jamStep". A complete rewrite of what the
// band plays would re-capture that golden byte-identically.
//
// So `groovePlan` is pure, and this file is its oracle.

import { test } from "node:test";
import assert from "node:assert";
import { loadGame } from "./harness.mjs";

const g = loadGame();

// ---------------------------------------------------------------------------------------------
// A VERBATIM transcription of the groove logic as it shipped at 5cf8417, before the seam was cut.
// Kept deliberately: this is the thing the refactor is proved against, and if a future edit is meant
// to change what the five shipped grooves play, this file is supposed to fail.
// ---------------------------------------------------------------------------------------------
function legacyPlan(G, step) {
  const s = ((step % 16) + 16) % 16, c = G.prog[(s / 4) | 0];
  const P = { s, chordCols: 4, chord: null, bass: [], kick: [], snare: [], hat: [] };
  if (s % 4 === 0) P.chord = c.chord;
  if (G.bass === "half") { if (s % 4 === 0) P.bass.push(c.bass); }
  else if (G.bass === "sparse") { if (s % 4 === 0 || s === 6 || s === 14) P.bass.push(c.bass); }
  else if (G.bass === "bounce") { if (s % 2 === 0) P.bass.push(s % 4 === 0 ? c.bass : c.bass + 12); }
  else if (G.bass === "root5") { if (s % 4 === 0) P.bass.push(c.bass); else if (s % 4 === 2) P.bass.push(c.bass + 7); }
  else { if (s % 2 === 0) P.bass.push(c.bass); }
  if (G.drums === "soft") { if (s % 8 === 0) P.kick.push(0.34); if (s % 8 === 4) P.snare.push(0.26); }
  else if (G.drums === "lofi") {
    if (s % 4 === 0) P.kick.push(0.4); if (s % 4 === 2) P.snare.push(0.28);
    if (s % 2 === 1) P.hat.push(0.12); if (s % 8 === 6) P.kick.push(0.28);
  }
  else { if (s % 4 === 0) P.kick.push(0.46); if (s % 4 === 2) P.snare.push(0.3); P.hat.push(0.14); }
  return P;
}

const SHIPPED = 5;   // grooves 0..4 existed before any dance content was appended

// ---------------------------------------------------------------- the equivalence proof

test("every shipped groove plays exactly what it shipped playing, at every step", () => {
  assert.ok(g.GROOVES.length >= SHIPPED);
  for (let i = 0; i < SHIPPED; i++) {
    const G = g.GROOVES[i];
    // well past one cycle in both directions: the modulo is written to survive a negative step, so the
    // proof should exercise that even though bookCol never goes below loopA() today
    for (let step = -32; step <= 64; step++) {
      assert.deepEqual(g.groovePlan(G, step), legacyPlan(G, step),
        `${G.name} at step ${step}`);
    }
  }
});

// The specific error a first draft of this refactor made: deriving the cycle as bar*prog gives 64 for the
// shipped grooves, which quadruples it and puts the wrong chord under nearly every column. D_jam would
// have passed anyway. This is the assertion that would not have.
test("the shipped cycle is 16 columns and four chords of four, not sixty-four", () => {
  for (let i = 0; i < SHIPPED; i++) {
    const G = g.GROOVES[i];
    assert.strictEqual(g.groovePlan(G, 0).chordCols, 4, `${G.name}: a chord lasts four columns`);
    assert.deepEqual(g.groovePlan(G, 16), g.groovePlan(G, 0), `${G.name}: step 16 is step 0 again`);
    assert.notDeepEqual(g.groovePlan(G, 4), g.groovePlan(G, 0), `${G.name}: step 4 is a NEW chord region`);
  }
});

test("the chord region walks the progression once per cycle", () => {
  const G = g.GROOVES[0];
  const chordAt = s => g.groovePlan(G, s).chord;
  assert.deepEqual(chordAt(0), G.prog[0].chord);
  assert.deepEqual(chordAt(4), G.prog[1].chord);
  assert.deepEqual(chordAt(8), G.prog[2].chord);
  assert.deepEqual(chordAt(12), G.prog[3].chord);
  assert.strictEqual(chordAt(1), null, "the bed sounds only where the chord CHANGES");
  assert.strictEqual(chordAt(5), null);
});

// ---------------------------------------------------------------- the details each style turns on

test("lo-fi's two kick conditions never collide, and the list does not depend on that", () => {
  const lofi = g.GROOVES.find(G => G.drums === "lofi");
  assert.ok(lofi, "a lo-fi groove still ships");
  for (let s = 0; s < 16; s++) {
    const k = g.groovePlan(lofi, s).kick;
    assert.ok(k.length <= 1, `step ${s} fired ${k.length} kicks`);
  }
  assert.deepEqual(g.groovePlan(lofi, 0).kick, [0.4], "the downbeat kick");
  assert.deepEqual(g.groovePlan(lofi, 6).kick, [0.28], "…and the pickup kick, quieter");
});

test("lo-fi's bass leans late on two literal steps, not on a modulo", () => {
  const lofi = g.GROOVES.find(G => G.bass === "sparse");
  const has = s => g.groovePlan(lofi, s).bass.length > 0;
  assert.ok(has(6) && has(14), "6 and 14 are hand-placed and must survive any refactor");
  assert.ok(!has(2) && !has(10), "…and their modulo twins are deliberately silent");
});

test("doo-wop's bass bounces an octave off the beat", () => {
  const dw = g.GROOVES.find(G => G.bass === "bounce");
  const root = dw.prog[0].bass;
  assert.deepEqual(g.groovePlan(dw, 0).bass, [root]);
  assert.deepEqual(g.groovePlan(dw, 2).bass, [root + 12], "the bounce is up an octave");
  assert.deepEqual(g.groovePlan(dw, 1).bass, [], "…and only on even columns");
});

test("folk answers its root with a fifth", () => {
  const folk = g.GROOVES.find(G => G.bass === "root5");
  const root = folk.prog[0].bass;
  assert.deepEqual(g.groovePlan(folk, 0).bass, [root]);
  assert.deepEqual(g.groovePlan(folk, 2).bass, [root + 7], "a fifth above");
});

test("the gentle kit really has no hats, and the steady kit has one every column", () => {
  const soft = g.GROOVES.find(G => G.drums === "soft");
  const rock = g.GROOVES.find(G => G.drums === "rock");
  for (let s = 0; s < 16; s++) {
    assert.deepEqual(g.groovePlan(soft, s).hat, [], `soft step ${s} must stay bare`);
    assert.deepEqual(g.groovePlan(rock, s).hat, [0.14], `rock step ${s} keeps its tick`);
  }
  assert.deepEqual(g.groovePlan(soft, 4).snare, [0.26], "the gentle backbeat is on 4 of 8");
  assert.deepEqual(g.groovePlan(soft, 8).kick, [0.34]);
});

// ---------------------------------------------------------------- the seam itself

test("a negative step folds into the cycle rather than reading off the end", () => {
  const G = g.GROOVES[0];
  for (const [neg, pos] of [[-1, 15], [-4, 12], [-16, 0], [-17, 15]]) {
    assert.deepEqual(g.groovePlan(G, neg), g.groovePlan(G, pos), `step ${neg} is step ${pos}`);
  }
});

// Forward-looking: the seam has to carry a groove whose cycle is not 16, or it has bought nothing.
// A six-column bar over four bars is 24 — the shape a waltz or a jig needs.
test("a groove may declare its own cycle, and the chord region follows it", () => {
  const G = { ...g.GROOVES[0], cycle: 24 };
  const P = g.groovePlan(G, 0);
  assert.strictEqual(P.chordCols, 6, "24 columns over four chords is one chord per six-column bar");
  assert.deepEqual(g.groovePlan(G, 6).chord, G.prog[1].chord);
  assert.deepEqual(g.groovePlan(G, 24), P, "…and it repeats after 24, not 16");
  assert.strictEqual(g.groovePlan(G, 16).chord, null, "16 is no longer a chord change");
});

test("the shipped grooves declare no cycle, so the default is what they get", () => {
  for (let i = 0; i < SHIPPED; i++) {
    assert.strictEqual(g.GROOVES[i].cycle, undefined,
      "PR 1 changes no groove DATA — only the code that reads it");
  }
});
