// TUN-135: while a sign-in is out (authBusy), the Studio can't be entered (TUN-93), so no ordinary way of
// opening a song into it may touch the level on screen. A saved melody's ▶ Load (and the cloud list's, which
// lands in the same loadSong after its fetch), the Jukebox's ▶ Play, a package finale's ✨ Keep building in the
// Studio and a quest finale's Studio button each: keep the level's tracks and undo history, leave the Studio
// shut, keep their own list or card up, claim nothing — and say why. Once the sign-in is over, each opens the
// Studio with the song, as before. The shared-link path is TUN-109's (tests/shared-link-instrument.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame } from "./harness.mjs";
import { completed, clone } from "./helpers/quest-e6-fixtures.mjs";

const up = () => ({ style: { display: "flex" } });   // a list or card the player is looking at
// The undo history, as the player sees it: syncUndoUI enables ↶ Undo while the journal holds an edit. (The
// harness can't hand back `journal` itself: it shares a line with JOURNAL_MAX.)
// Built in this realm: the game's own arrays come from its vm context, and deepStrictEqual compares prototypes.
const melody = song => Array.from(song.tracks.find(t => t.kind === "melody").notes, n => n.p + "@" + n.c).sort();

/** A booted game on its first package level, with one real edit in its undo history. */
function game(t, extra = {}) {
  const els = { moverlay: up(), congratsoverlay: up(), congratsStudio: {}, undoBtn: {}, ...extra };
  const g = loadGame({ fresh: true, elements: els });
  t.after(() => { if (g.playing) g.stop(); clearTimeout(g.autosaveT); });
  return { g, els, ...watch(g, els.undoBtn) };
}
/** Records toasts, status lines and starts; edits the level so it has an undo history to lose. */
function watch(g, undoBtn) {
  const toasts = [], statuses = [], starts = [], clears = [];
  g.toast = m => toasts.push(m); g.setStatus = m => statuses.push(m); g.start = o => starts.push(o);
  const clear = g.journalClear; g.journalClear = () => { clears.push(1); clear(); };
  g.modelSetCell(g.ROWS - 1, 2, !g.grid[g.ROWS - 1][2]);   // through the editor's own transaction
  assert.equal(undoBtn.disabled, false, "fixture: the level has an undo history");
  return { toasts, statuses, starts, clears, undoBtn };
}
/** Runs fn with one sign-in out, and returns what the level looked like before. */
function midSignIn(g, w, fn) {
  const before = { tracks: JSON.stringify(g.currentSong().tracks), scope: g.activeScope.kind, w };
  w.clears.length = 0;
  g.authBusy = 1;
  try { return { before, out: fn() }; } finally { g.authBusy = 0; }
}
function untouched(g, before, what) {
  assert.equal(g.isStudioScope(), false, what + ": the Studio did not open");
  assert.equal(g.activeScope.kind, before.scope, what + ": the player stays where they were");
  assert.equal(JSON.stringify(g.currentSong().tracks), before.tracks, what + ": the level on screen is untouched");
  assert.equal(before.w.clears.length, 0, what + ": its undo history is never cleared");
  assert.equal(before.w.undoBtn.disabled, false, what + ": ↶ Undo still has the player's edit");
}

test("TUN-135: a saved melody's ▶ Load waits for a sign-in, keeps the list up, then loads", t => {
  const { g, els, ...w } = game(t); const { toasts, statuses } = w;
  const song = g.famousToSong("mary");
  const { before, out } = midSignIn(g, w, () => g.loadSong(clone(song)));
  assert.equal(out, null, "reports the refusal");
  untouched(g, before, "▶ Load");
  assert.equal(els.moverlay.style.display, "flex", "the list stays up, so the player still has it");
  assert.deepEqual(toasts, [g.STUDIO_WAITS_FOR_SIGNIN], "says why, once");
  assert.ok(!statuses.some(s => /Loaded into the Studio/.test(s)), "claims nothing was loaded");

  g.loadSong(clone(song));   // the sign-in is over
  assert.equal(g.isStudioScope(), true, "the Studio opens");
  assert.deepEqual(melody(g.currentSong()), melody(song), "with the song");
  assert.equal(w.undoBtn.disabled, true, "undo starts fresh from the loaded song");
  assert.equal(els.moverlay.style.display, "none", "the list closes");
  assert.match(statuses.at(-1), /Loaded into the Studio/);
});

test("TUN-135: the Jukebox's ▶ Play neither loads nor starts nor says Now playing mid-sign-in", t => {
  const { g, els, ...w } = game(t); const { toasts, statuses, starts } = w;
  const song = g.famousToSong("mary");
  const { before } = midSignIn(g, w, () => g.playSong(clone(song)));
  untouched(g, before, "▶ Play");
  assert.equal(starts.length, 0, "nothing starts playing");
  assert.ok(!statuses.some(s => /Now playing|Loaded into the Studio/.test(s)), "claims nothing");
  assert.equal(els.moverlay.style.display, "flex");
  assert.deepEqual(toasts, [g.STUDIO_WAITS_FOR_SIGNIN]);

  g.playSong(clone(song));
  assert.equal(g.isStudioScope(), true);
  assert.deepEqual(melody(g.currentSong()), melody(song));
  assert.equal(starts.length, 1, "and plays it");
  assert.match(statuses.at(-1), /Now playing/);
});

test("TUN-135: a finale's ✨ Keep building in the Studio waits for a sign-in, keeping its card, then carries the song", t => {
  const { g, els, ...w } = game(t); const { toasts } = w;
  const field = melody(g.currentSong());
  const { before } = midSignIn(g, w, () => els.congratsStudio.onclick());
  untouched(g, before, "✨ Keep building");
  assert.equal(els.congratsoverlay.style.display, "flex", "the congratulations card stays, its buttons with it");
  assert.deepEqual(toasts, [g.STUDIO_WAITS_FOR_SIGNIN]);

  els.congratsStudio.onclick();
  assert.equal(g.isStudioScope(), true);
  assert.deepEqual(melody(g.currentSong()), field, "the finale's own creation comes along");
  assert.equal(w.undoBtn.disabled, true);
  assert.equal(els.congratsoverlay.style.display, "none");
});

test("TUN-135: a quest finale's Studio button waits for a sign-in, keeping the finale and its typed name, then hands the song over", t => {
  const finName = { value: "Firefly tune" };
  const els = { finStudio: {}, questfinale: up(), undoBtn: {} };
  const { g, run } = completed(t, undefined, { elements: { ...els, finName } });
  els.questfinale.style.display = "flex";   // the finale, up
  const named = []; const act = g.performQuestAction; g.performQuestAction = (id, o) => { named.push(id); return act(id, o); };
  const w = watch(g, els.undoBtn), { toasts } = w;
  const song = clone(run().versions[run().artifact.versionId].song);
  const { before } = midSignIn(g, w, () => els.finStudio.onclick());
  untouched(g, before, "the finale's Studio button");
  assert.equal(g.isQuestScope(), true, "still in the quest");
  assert.equal(els.questfinale.style.display, "flex", "the finale stays up");
  assert.equal(finName.value, "Firefly tune", "with the name the player typed");
  assert.deepEqual(named, [], "the name is not committed by a refused exit");
  assert.deepEqual(toasts, [g.STUDIO_WAITS_FOR_SIGNIN]);

  els.finStudio.onclick();
  assert.deepEqual(named, ["name-song"], "the name is committed on the way out");
  assert.equal(g.isStudioScope(), true);
  assert.deepEqual(melody(g.currentSong()), melody(song), "with the quest's song");
  assert.equal(w.undoBtn.disabled, true);
  assert.equal(els.questfinale.style.display, "none");
});

test("TUN-135: openStudioWith itself lands nothing mid-sign-in, for any caller", t => {
  const { g, ...w } = game(t);
  const { before, out } = midSignIn(g, w, () => g.openStudioWith(g.famousToSong("mary")));
  assert.equal(out, false, "reports it did not open");
  untouched(g, before, "openStudioWith");
});
