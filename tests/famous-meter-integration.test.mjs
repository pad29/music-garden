// Review coverage for famous-meter. No browser rendering or audible claims: UI callbacks,
// model state, wire bytes, and calls booked by the real transport are the observable seams.
// Each green case has an in-memory fault in famous-meter-review-mutations.mjs.
import { test } from "node:test";
import assert from "node:assert";
import { loadGame } from "./harness.mjs";

const clone = v => JSON.parse(JSON.stringify(v));
const played = (g, id) => g.FAMOUS[id].jukebox || g.FAMOUS[id];
// A 3/4 song arrives with the Waltz and a 6/8 one with the Jig (normalizeGroove); everything else keeps 0.
const expectedGroove = (g, meter) => meter === "3/4" ? g.GROOVES.findIndex(G => G.name.includes("Waltz"))
  : meter === "6/8" ? g.GROOVES.findIndex(G => G.name.includes("Jig")) : 0;
function game() {
  const g = loadGame({ fresh: true });
  // Deterministic manual pumping; no wall-clock narration, animation or autosave callbacks.
  g.__window.setTimeout = () => 0;
  g.__window.requestAnimationFrame = () => 0;
  return g;
}
const notes = g => g.melTrack().notes.map(n =>
  `${n.pitch}@${n.startTick / g.TICKS_PER_COL}:${n.durationTicks / g.TICKS_PER_COL}`).sort();
const songNotes = s => s.tracks[0].notes.map(n => `${n.p}@${n.c}:${n.len}`).sort();

// Only buttons need real DOM storage: the ordinary proxy discards .onclick writes.
// Run the real openMelodies and mkBtn; restore the ordinary element factory before navigating.
async function famousButtons(g) {
  const buttons = [], create = g.__document.createElement;
  Object.defineProperty(g.__document, "createElement", { configurable: true,
    value(tag) { if (tag === "button") { const b = {}; buttons.push(b); return b; }
      return create(tag); } });
  try { await g.openMelodies(); }
  finally { Object.defineProperty(g.__document, "createElement", { configurable: true, value: create }); }
  assert.strictEqual(buttons.length, g.JUKEBOX_FAMOUS.length);
  assert.ok(buttons.every(b => b.textContent === "▶ Play" && typeof b.onclick === "function"));
  return buttons;
}

test("famous review: every Jukebox button loads before starting and clears stale playback state", async () => {
  const g = game(), buttons = await famousButtons(g), starts = [];
  // Keep start() real; intercept only the audio transport boundary, after its decisions.
  g.Transport.begin = countIn => starts.push({ countIn, step: g.step,
    studio: g.isStudioScope(), looping: g.looping, meter: clone(g.meterAt()),
    time: clone(g.currentSong().time), notes: notes(g), jam: g.jamMode, swing: g.levelSwing });
  for (let i = 0; i < buttons.length; i++) {
    const id = g.JUKEBOX_FAMOUS[i], v = played(g, id), song = g.famousToSong(id);
    g.openPkg("off-the-path", 0);
    g.jamMode = true; g.levelSwing = true; g.clickMode = "both";
    g.cursorPinned = true; g.cursorCol = 9; g.loopStart = 4; g.loopEnd = 8;
    buttons[i].onclick();
    assert.strictEqual(starts.length, i + 1, id);
    const call = starts.at(-1);
    assert.strictEqual(call.studio, true, id);
    assert.strictEqual(call.step, 0, id);
    assert.strictEqual(call.looping, true, id);
    assert.strictEqual(call.countIn, false, "Jukebox autoplay does not request a count-in");
    assert.strictEqual(call.jam, false, id);
    assert.strictEqual(call.swing, 0, id); // levelSwing is numeric (0/1), not boolean
    assert.strictEqual(g.rangeOn(), false, id);
    assert.strictEqual(call.time.cols, song.time.cols, id);
    assert.strictEqual(call.time.tempo, song.time.tempo, id);
    assert.strictEqual(call.time.groove, expectedGroove(g, v.meter), id);
    assert.deepEqual(call.notes, songNotes(song), id);
    assert.deepEqual(call.meter, v.meter
      ? { tick: 0, preset: v.meter, originTick: v.origin * 48 } : null, id);
    const loaded = g.snapState(); g.undoEdit();
    assert.strictEqual(g.snapState(), loaded, "loading through the Jukebox leaves no undoable setup");
  }
});

test("famous review: loaded songs survive slot-eight encoding and reopening without semantic drift", () => {
  const g = game();
  for (const id of g.JUKEBOX_FAMOUS) {
    const raw = g.famousToSong(id), v = played(g, id);
    g.openStudioWith(raw);
    const s = g.currentSong(), packed = g.packSong(s), encoded = g.encodeSong(s);
    assert.strictEqual(packed.length, v.meter ? 9 : 8, id);
    if (v.meter) assert.deepEqual(packed[8], [v.meter, v.origin], id);
    assert.strictEqual(packed[4], expectedGroove(g, v.meter), id);
    assert.deepEqual(songNotes(s), songNotes(raw), id);
    assert.ok(encoded.length <= g.SHARE_MAX, `${id}: no new sign-in requirement to share`);
    const decoded = g.decodeSong(encoded);
    assert.deepEqual(decoded.time, s.time, id);
    assert.deepEqual(decoded.tracks, s.tracks, id);
    g.openStudioWith(g.famousToSong(id === "moldau" ? "mary" : "moldau"));
    g.openStudioWith(decoded);
    assert.strictEqual(g.encodeSong(g.currentSong()), encoded, id);
  }
  // The harness's instrument select absorbs value writes. Voice persistence itself is NOT
  // inferred from this currentSong test; the raw-song byte fixture above includes musicbox.
});

test("famous review: old famous saves and eight-slot links are not silently upgraded from the catalog", () => {
  const g = game();
  // Pre-change Moldau payload: same pitches/onsets, 52 columns, every len=1, no meter.
  // Local saves can retain meta.famous, whereas packed links deliberately drop that metadata.
  const old = clone(g.famousToSong("moldau"));
  old.time.cols = 52; delete old.time.meter; delete old.time.origin;
  old.tracks[0].notes.forEach(n => { n.len = 1; });
  g.setSaves([old]);
  const savedBytes = JSON.stringify(g.getSaves());
  const encoded = g.encodeSong(old);
  assert.strictEqual(g.packSong(old).length, 8);
  for (const source of [g.getSaves()[0], g.decodeSong(encoded)]) {
    g.openStudioWith(g.famousToSong("moldau"));
    g.loadSong(source);
    assert.strictEqual(g.COLS, 52);
    assert.strictEqual(g.meterAt(), null);
    assert.deepEqual(notes(g), songNotes(old));
    assert.strictEqual(g.currentSong().time.tempo, 112);
  }
  assert.strictEqual(JSON.stringify(g.getSaves()), savedBytes, "opening is not a migration write");
});

test("famous review: loading clears history but later edits undo and redo around the held metered song", () => {
  const g = game();
  for (const id of ["moldau", "amazinggrace", "pachelbel", "shave", "swinglow"]) {
    g.openStudioWith(g.famousToSong("mary"));
    g.modelSetCell(0, 63, true);
    g.openStudioWith(g.famousToSong(id));
    const before = g.snapState();
    g.undoEdit(); assert.strictEqual(g.snapState(), before, `${id}: setup must not be undoable`);
    g.redoEdit(); assert.strictEqual(g.snapState(), before, `${id}: setup must not be redoable`);
    const n = g.melTrack().notes.find(n => n.durationTicks > 48);
    assert.ok(n, id);
    g.modelSetCell(g.projRow(n.pitch), g.noteCol(n), false);
    const after = g.snapState(); assert.notStrictEqual(after, before, id);
    g.undoEdit(); assert.strictEqual(g.snapState(), before, id);
    g.redoEdit(); assert.strictEqual(g.snapState(), after, id);
  }
});

function clockedGame() {
  const g = game(), clicks = [], gain = () => ({ connect() {}, disconnect() {},
    gain: { setValueAtTime() {}, linearRampToValueAtTime() {} } });
  g.actx = { state: "running", currentTime: 10, resume() {}, createGain: gain };
  g.initAudio = () => {}; // audio factories are outside this Node test's contract
  g.playRow = () => {};
  g.DRUMS.forEach(d => { d.play = () => {}; });
  g.clickAt = (at, accent) => clicks.push({ at, accent });
  g.paintDue = () => {}; // bookkeeping only; no claim about pixels or audible output
  return { g, clicks };
}

test("famous review: loaded pickups count in on the correct phase and selected bars count from their downbeat", () => {
  const fixtures = {
    moldau: [[-5, true], [-2, false]],
    shave: [[-8, false], [-6, true], [-4, false], [-2, false]],
    amazinggrace: [[-6, false], [-4, true], [-2, false]],
    swinglow: [[-8, false], [-6, true], [-4, false], [-2, false]],
  };
  for (const [id, expected] of Object.entries(fixtures)) {
    const { g, clicks } = clockedGame();
    g.openStudioWith(g.famousToSong(id)); g.clickMode = "both";
    g.start({ countIn: true });
    const sd = g.stepDur() / 1000;
    assert.deepEqual(clicks.map(c => [Math.round((c.at - g.anchorTime) / sd), c.accent]), expected, id);
    assert.strictEqual(g.bookTick, 0, "no song column books during the count");
    g.stop(); clicks.length = 0;
    const origin = played(g, id).origin, seg = g.barSegAt(origin);
    g.applyRange(seg, seg); g.pinCursor(0); // the selected bar overrides the pin
    g.start({ countIn: true });
    const bc = g.barCols(), pulse = g.METERS[played(g, id).meter].pulse / 48;
    assert.strictEqual(g.step, origin, id);
    assert.deepEqual(clicks.map(c => [Math.round((c.at - g.anchorTime) / sd), c.accent]),
      Array.from({ length: bc / pulse }, (_, i) => [-bc + i * pulse, i === 0]), id);
    g.stop();
  }
});

test("famous review: the real scheduler keeps clicks and accents continuous across two full loops", () => {
  for (const id of ["mary", "odetojoy", "shave", "moldau", "bigben", "pachelbel",
    "amazinggrace", "goinhome", "igotrhythm", "chopsticks", "swinglow"]) {
    const { g, clicks } = clockedGame();
    g.openStudioWith(g.famousToSong(id)); g.clickMode = "both";
    g.start();
    const sd = g.stepDur() / 1000, cols = g.COLS;
    g.actx.currentTime = g.anchorTime + (2 * cols + 8) * sd;
    g.pump();
    const at = clicks.map(c => ({ col: Math.round((c.at - g.anchorTime) / sd), accent: c.accent }));
    assert.ok(at.length > 0, `${id}: the scheduler must book metronome clicks`);
    assert.ok(at.at(-1).col >= 2 * cols, `${id}: must actually cross two boundaries`);
    const pulse = g.METERS[played(g, id).meter].pulse / 48;
    for (let i = 1; i < at.length; i++) assert.strictEqual(at[i].col - at[i - 1].col, pulse, id);
    const accents = at.filter(c => c.accent).map(c => c.col);
    assert.strictEqual(accents[0], played(g, id).origin, id);
    for (let i = 1; i < accents.length; i++) assert.strictEqual(accents[i] - accents[i - 1], g.barCols(), id);
    g.stop();
  }
});

test("famous review: entering each actual capstone clears a loaded meter before reveal and undo", () => {
  const g = game(); g.voice = () => {};
  for (const id of Object.keys(g.FAMOUS)) {
    const owner = g.famousOwner(id), level = g.PACKAGES[owner].levels.findIndex(l => l.famous === id);
    g.openStudioWith(g.famousToSong("moldau"));
    g.openPkg(owner, level);
    const before = g.snapState();
    g.revealFamous(id);
    const after = g.snapState();
    assert.notStrictEqual(after, before, id);
    assert.strictEqual(g.meterAt(), null, id);
    assert.strictEqual(g.grooveIdx, 0, id);
    assert.ok(g.melTrack().notes.every(n => id === "swinglow" || n.durationTicks === 48), id);
    if (id === "swinglow") assert.strictEqual(g.melTrack().notes.filter(n => n.durationTicks > 48).length, 7);
    g.undoEdit(); assert.strictEqual(g.snapState(), before, id);
    g.redoEdit(); assert.strictEqual(g.snapState(), after, id);
    g.openStudioWith(g.famousToSong("mary"));
    const studio = g.snapState(); g.revealFamous(id);
    assert.strictEqual(g.snapState(), studio, "a delayed reward cannot replace a Studio song");
  }
});

test("famous review: transitive eligibility retains chord holds and ownerless entries use the fallback", () => {
  const g = game();
  g.PACKAGES.__bridge = { requires: ["__cycle", "two-kinds-of-walking"], levels: [] };
  g.PACKAGES.__cycle = { requires: ["__bridge"], levels: [] };
  g.PACKAGES.__owner = { requires: ["missing-package", "__cycle"], palette: "diatonic",
    levels: [{ famous: "__held" }] };
  g.FAMOUS.__held = { cols: 16, chords: [[[60, 64, 67], 0, 4], [[62, 65, 69], 14, 8]] };
  g.setPalette("diatonic"); g.COLS = 16;
  assert.strictEqual(g.famousOwner("__held"), "__owner");
  assert.strictEqual(g.famousPalette("__held"), "diatonic");
  assert.strictEqual(g.famousHolds("__held"), true);
  g.playFamous("__held");
  assert.deepEqual(notes(g), ["60@0:4", "62@14:2", "64@0:4", "65@14:2", "67@0:4", "69@14:2"]);
  assert.strictEqual(g.famousOwner("__absent"), null);
  assert.strictEqual(g.famousPalette("__absent"), "diatonic");
  assert.strictEqual(g.famousHolds("__absent"), false);
});
