// Meter, bars and note lengths for the famous tunes.
//
// The meter is HAND-ENTERED from the scores (EDITOR-DESIGN §17: an analyser cannot separate 3/4 from 6/8
// and cannot find a pickup). So these tests do not decide what the meter is — they check that what was
// typed is internally consistent, travels to the Studio intact, and never leaks into a capstone reward.

import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { loadGame } from "./harness.mjs";

const g = loadGame();
const TPC = g.TICKS_PER_COL;
const played = id => g.FAMOUS[id].jukebox || g.FAMOUS[id];          // the block the Jukebox plays

// What the owner is validating tune by tune. If one changes, change it HERE too, on purpose.
const DECLARED = {
  mary: ["4/4", 0], odetojoy: ["4/4", 0], shave: ["4/4", 2], moldau: ["6/8", 1], bigben: ["4/4", 0],
  pachelbel: ["4/4", 0], amazinggrace: ["3/4", 2], goinhome: ["4/4", 0],
  igotrhythm: ["4/4", 0], chopsticks: ["3/4", 0], swinglow: ["4/4", 2],
};
// Their true unit is a 16th (joy, charleston, bachprelude, bodiddley — the last settled by the owner from the
// beat's standard one-bar notation) or their spacing drifts (taps). No METERS preset can describe them
// honestly, so they stay free.
const UNMETERED = ["taps", "joy", "charleston", "bachprelude", "bodiddley"];

test("every Jukebox song is either declared metered or deliberately left free", () => {
  const all = [...Object.keys(DECLARED), ...UNMETERED].sort();
  assert.deepEqual([...g.JUKEBOX_FAMOUS].sort(), all);
  for (const id of UNMETERED) assert.strictEqual(played(id).meter, undefined, `${id} must stay free`);
});

test("each declared meter is what the data says, and is one validMeter accepts", () => {
  for (const [id, [preset, origin]] of Object.entries(DECLARED)) {
    const v = played(id);
    assert.strictEqual(v.meter, preset, `${id}: meter`);
    assert.strictEqual(v.origin, origin, `${id}: pick-up`);
    assert.strictEqual(g.validMeter(preset, origin).length, 1, `${id}: ${preset}+${origin} must be valid`);
  }
});

test("a metered famous song lands in the Studio with its own bars", () => {
  for (const [id, [preset, origin]] of Object.entries(DECLARED)) {
    const song = g.famousToSong(id);
    assert.strictEqual(song.time.meter, preset, `${id}: time.meter`);
    assert.strictEqual(song.time.origin, origin, `${id}: time.origin`);
    g.applySong(song);
    const m = g.meterAt();
    assert.ok(m, `${id}: the Studio must show bars`);
    assert.strictEqual(m.preset, preset);
    assert.strictEqual(m.originTick, origin * TPC);
    // …and it survives being saved from there, which is what a child's 💾 does next
    const back = g.currentSong();
    assert.strictEqual(back.time.meter, preset, `${id}: meter survives a save`);
    assert.strictEqual(back.time.origin, origin, `${id}: pick-up survives a save`);
  }
});

// The Jukebox LOOPS the whole field. The phase at the wrap is (COLS - origin) against (0 - origin), so the
// pick-up cancels out and the only condition is that the field is a whole number of bars. Five entries
// were not, and the review measured what that does: across Moldau's wrap the click came four columns
// after the last one instead of three. Nothing here pads COLS automatically (§17(6)); the DATA is fixed.
test("every metered Jukebox field is a whole number of bars, so the loop keeps time", () => {
  for (const id of Object.keys(DECLARED)) {
    const v = played(id), bar = g.barTicks(g.METERS[v.meter]) / TPC, cols = v.cols || 16;
    assert.strictEqual(cols % bar, 0, `${id}: ${cols} columns is not a whole number of ${bar}-column bars`);
  }
});

// …and measured the way the review measured it: the gap between the last pulse before the wrap and the
// first one after it must be an ordinary beat, never a stutter.
test("across the loop's wrap, the pulse is as regular as anywhere else", () => {
  for (const id of Object.keys(DECLARED)) {
    g.applySong(g.famousToSong(id));
    const m = g.meterAt(), span = g.COLS * TPC;
    const ticks = g.pulsesIn(m, 0, span).map(u => u.tick);
    const gaps = new Set();
    for (let i = 1; i < ticks.length; i++) gaps.add(ticks[i] - ticks[i - 1]);
    const wrap = ticks[0] + span - ticks[ticks.length - 1];
    assert.ok(gaps.has(wrap) || (gaps.size === 0 && wrap === g.METERS[m.preset].pulse),
      `${id}: ${wrap / TPC} columns across the wrap, but ${[...gaps].map(x => x / TPC)} everywhere else`);
  }
});

test("an unmetered famous song serialises with no meter keys at all, and clears a stale meter", () => {
  for (const id of UNMETERED) {
    const song = g.famousToSong(id);
    assert.ok(!("meter" in song.time) && !("origin" in song.time), `${id}: no meter keys, not even undefined`);
    g.applySong(g.famousToSong("moldau"));               // arrive from a metered song…
    g.applySong(song);
    assert.strictEqual(g.meterAt(), null, `${id}: …and the Moldau's bars must not survive`);
  }
});

// Within one voice, a length that runs past the next onset is a data error: it means the score reading and
// the onsets disagree. mel and chords are separate voices (Shave's bass rings under its own dyads).
test("no note is held past the next note of its own voice, past MAX_VINE, or off the field", () => {
  for (const id of g.JUKEBOX_FAMOUS) {
    const v = played(id), cols = v.cols || 16;
    for (const key of ["mel", "chords"]) {
      const tuples = v[key] || [];
      const onsets = [...new Set(tuples.map(t => t[1]))].sort((a, b) => a - b);
      for (const [, c, len = 1] of tuples) {
        const next = onsets.find(o => o > c) ?? cols;
        assert.ok(len >= 1 && len <= g.MAX_VINE, `${id} ${key}@${c}: length ${len} out of range`);
        assert.ok(c + len <= next, `${id} ${key}@${c}: length ${len} runs into the note at ${next}`);
      }
    }
  }
});

test("every authored length survives the trip into the Studio", () => {
  for (const id of g.JUKEBOX_FAMOUS) {
    const v = played(id);
    const want = [];
    (v.mel || []).forEach(([p, c, len = 1]) => want.push(`${p}@${c}:${Math.min(len, g.MAX_VINE)}`));
    (v.chords || []).forEach(([ms, c, len = 1]) => ms.forEach(p => want.push(`${p}@${c}:${Math.min(len, g.MAX_VINE)}`)));
    g.applySong(g.famousToSong(id));
    const got = g.melTrack().notes.map(n => `${n.pitch}@${n.startTick / TPC}:${n.durationTicks / TPC}`);
    assert.deepEqual(got.sort(), [...new Set(want)].sort(), `${id}: lengths lost between the data and the field`);
  }
});

test("the Jukebox song carries the chords' lengths, not one column each", () => {
  const notes = g.famousToSong("pachelbel").tracks[0].notes;
  assert.ok(notes.length === 24 && notes.every(n => n.len === 4), "eight half-note chords");
  const bb = g.famousToSong("bigben").tracks[0].notes.filter(n => n.c >= 40);
  assert.deepEqual([...new Set(bb.map(n => `${n.c}:${n.len}`))].sort(), ["40:4", "44:8"]);
});

// ---------------------------------------------------------------- the capstone stays what it was

test("only a package that has taught the vine may hold a note in its reveal", () => {
  const holders = Object.keys(g.FAMOUS).filter(g.famousHolds);
  assert.deepEqual(holders, ["swinglow"], "nothing requires two-kinds-of-walking, so only its own reveal");
  assert.strictEqual(g.vinesTaughtBy("two-kinds-of-walking"), true);
  assert.strictEqual(g.vinesTaughtBy(null), false);
});

test("…and anything that comes to require it inherits that, however indirectly", () => {
  const G = loadGame({ fresh: true });
  G.PACKAGES.__a = { id: "__a", requires: ["two-kinds-of-walking"], levels: [] };
  G.PACKAGES.__b = { id: "__b", requires: ["__a"], levels: [] };
  G.PACKAGES.__c = { id: "__c", requires: ["__c", "intro"], levels: [] };     // a cycle must terminate
  assert.strictEqual(G.vinesTaughtBy("__b"), true);
  assert.strictEqual(G.vinesTaughtBy("__c"), false);
});

// Through playFamous, the one real caller: a test of placeFamous alone would stay green if playFamous
// forgot to pass the gate and flattened every reward, Swing Low's included.
//
// What this does NOT prove is that a reward is drawn without bars. placeFamous never WRITES a meter, but it
// does not clear one either; rewards are bar-less because entering a level resets the meter
// (resetTransient), which the meter quarantine tests pin. The reset below stands in for that boundary.
test("every reveal except swinglow's is placed flat, and none writes a meter", () => {
  for (const id of Object.keys(g.FAMOUS)) {
    g.doc.meterMap = [];
    g.playFamous(id); g.clearFamousTimers();
    const lens = g.melTrack().notes.map(n => n.durationTicks / TPC);
    if (id === "swinglow") assert.ok(lens.some(l => l > 1), "swinglow's reveal keeps its holds");
    else assert.ok(lens.every(l => l === 1), `${id}: a reveal before the vine is taught must stay flat`);
    assert.deepEqual(g.doc.meterMap, [], `${id}: a capstone never writes a meter`);
  }
});

// The golden records Swing Low's reveal as it sounded before any of this: 15 notes, 7 of them held. It is
// re-captured by hand, never checked by the suite, so replay it here through playFamous itself.
test("Swing Low's reveal still sounds exactly the golden's holds", () => {
  const G = loadGame({ fresh: true });
  const golden = JSON.parse(readFileSync(new URL("../tools/goldens/playback.json", import.meta.url))).I_famous_sweep;
  const heard = [], orig = G.voice;
  G.voice = (i, f, t, hold) => { heard.push([+f.toFixed(2), +(+(hold || 0)).toFixed(5)]); };
  try { G.playFamous("swinglow"); } finally { G.voice = orig; G.clearFamousTimers(); }
  assert.deepEqual(heard, golden.voices.map(v => [v.freq, v.hold]));
  assert.strictEqual(heard.filter(([, h]) => h > 0).length, 7, "seven held notes, as recorded");
});

test("a direct placeFamous call without the gate is flat too", () => {
  g.placeFamous(g.FAMOUS.swinglow, g.FAMOUS_TEMPO.swinglow);
  assert.ok(g.melTrack().notes.every(n => n.durationTicks === TPC));
});

// ---------------------------------------------------------------- the Scoop's stem highlight

// Found by the owner while correcting I Got Rhythm: after ✕ Done the picked seed lost its outline but its
// held-note stem kept one. A stem's highlight is baked in from traySel when renderVines draws it, and
// exitTray emptied traySel without redrawing. The harness DOM keeps no classes, so assert on the redraw:
// it must happen, and it must happen AFTER the pick is empty.
test("leaving the Scoop redraws the stems from an empty pick", () => {
  const G = loadGame({ fresh: true });
  G.openStudioWith(G.famousToSong("igotrhythm"));
  G.enterTray();
  const held = G.melTrack().notes.find(n => n.durationTicks > TPC);
  G.traySel.push(held.id); G.trayPaint();
  const seen = [], orig = G.renderVines;
  G.renderVines = () => { seen.push(G.traySel.length); return orig(); };
  try { G.exitTray(); } finally { G.renderVines = orig; }
  assert.ok(seen.length > 0, "Done must redraw the stems");
  assert.strictEqual(seen.at(-1), 0, "…from a pick that is already empty");
});
