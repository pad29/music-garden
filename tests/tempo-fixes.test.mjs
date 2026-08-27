// Regression coverage for famous-song tempo handling.  The harness models #tempo's native
// range clamping, but deliberately does not attempt audio, rendering, or timer assertions.

import { test } from "node:test";
import assert from "node:assert";
import { loadGame } from "./harness.mjs";

function tempoInput(g) {
  return g.__document.getElementById("tempo");
}

// A range input CLAMPS a value assigned below its own min, so `tempoEl.value = 40` silently
// became 60 and Taps played half again too fast on every reveal since it shipped.  Assert the
// behaviour — nothing the game assigns may clamp — rather than the attribute itself, which may
// legitimately move again the next time a tune needs room.
test("every tempo the game assigns survives the slider's range unclamped", () => {
  const g = loadGame({ fresh: true });
  const tempo = tempoInput(g);

  for (const [id, bpm] of Object.entries(g.FAMOUS_TEMPO)) {
    tempo.value = bpm;
    assert.strictEqual(+tempo.value, bpm, `${id}'s declared tempo must not clamp`);
  }
  g.GROOVES.forEach((groove, i) => {              // applyGrooveTempo() assigns these too
    tempo.value = groove.bpm;
    assert.strictEqual(+tempo.value, groove.bpm, `groove ${i} (${groove.name}) must not clamp`);
  });

  tempo.value = g.FAMOUS_TEMPO.taps;              // "Slowly", from the score: 750ms a column
  assert.strictEqual(g.stepDur(), 750);
});

test("Taps' famous transaction snapshots its tempo for undo and redo", () => {
  const g = loadGame({ fresh: true });
  const tempo = tempoInput(g);
  tempo.value = 108;
  g.journalClear();

  g.placeFamous(g.FAMOUS.taps, g.FAMOUS_TEMPO.taps);
  assert.strictEqual(+tempo.value, 40);
  assert.strictEqual(g.melTrack().notes.length, 27);

  g.undoEdit();
  assert.strictEqual(+tempo.value, 108, "undo restores the player's pre-reveal tempo");
  assert.strictEqual(g.melTrack().notes.length, 0);

  g.redoEdit();
  assert.strictEqual(+tempo.value, 40, "redo restores the tune's tempo with its notes");
  assert.strictEqual(g.melTrack().notes.length, 27);
});

test("drum-only famous entries still create non-tempo state changes and retain their tempo on redo", () => {
  for (const id of ["bodiddley", "charleston"]) {
    const g = loadGame({ fresh: true });
    const tempo = tempoInput(g);
    tempo.value = 108;
    g.journalClear();
    const before = g.snapState();

    g.placeFamous(g.FAMOUS[id], g.FAMOUS_TEMPO[id]);
    assert.strictEqual(g.melTrack().notes.length, 0, `${id} is drum-only`);
    assert.ok(g.drumTrack().notes.length > 0, `${id} must plant its rhythm`);
    assert.notStrictEqual(g.snapState(), before, `${id} is never a tempo-only transaction`);

    g.undoEdit();
    assert.strictEqual(+tempo.value, 108, `${id} undo restores the player tempo`);
    g.redoEdit();
    assert.strictEqual(+tempo.value, g.FAMOUS_TEMPO[id], `${id} redo restores its own tempo`);
  }
});

test("every famous reveal changes arrangement state in both shipped palettes", () => {
  for (const palette of ["pentatonic", "diatonic"]) {
    const g = loadGame({ fresh: true });
    g.setPalette(palette);
    const tempo = tempoInput(g);

    for (const [id, famous] of Object.entries(g.FAMOUS)) {
      g.modelClearMelody();
      g.modelClearDrums();
      g.journalClear();
      tempo.value = 108;
      const before = g.snapState();

      g.placeFamous(famous, g.FAMOUS_TEMPO[id]);
      assert.ok(g.melTrack().notes.length || g.drumTrack().notes.length,
        `${id} must plant pitched notes or drums in ${palette}`);
      assert.notStrictEqual(g.snapState(), before,
        `${id} must create an arrangement delta in ${palette}, not a tempo-only journal entry`);
      assert.strictEqual(+tempo.value, g.FAMOUS_TEMPO[id] || 108,
        `${id} preserves its default tempo behavior in ${palette}`);
    }
  }
});

test("the Jukebox Taps song carries 40 BPM through song loading", () => {
  const g = loadGame({ fresh: true });
  const song = g.famousToSong("taps");
  assert.strictEqual(song.time.tempo, 40);

  g.applySong(song);
  assert.strictEqual(+tempoInput(g).value, 40);
  assert.strictEqual(g.stepDur(), 750);
});
