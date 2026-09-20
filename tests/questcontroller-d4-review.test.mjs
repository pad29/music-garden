// Adversarial D4 controller regressions found during review.
//
// These tests deliberately exercise boundaries the normal controller path does not: authored starter
// data and the existing undo journal.  A quest run owns the durable song, so neither may leave the live
// document and the run disagreeing.

import { test } from "node:test";
import assert from "node:assert";
import { loadQuestGame as loadGame, completeDealtSong } from "./helpers/quest-fixtures.mjs";

const song = (mel, hits) => ({
  v: 3, meta: { title: null, created: 0, updated: 0, author: null },
  palette: "pentatonic", time: { cols: 16, tempo: 108, groove: 0 },
  tracks: [
    { kind: "melody", voice: "musicbox", notes: mel.map(([p, c]) => ({ p, c, len: 1 })) },
    { kind: "drums", hits: hits.map(([lane, c]) => ({ lane, c })) },
  ],
});
const RISE = [[60, 0], [62, 2], [64, 4], [67, 6]];
const FALL = [[67, 0], [64, 2], [62, 4], [60, 6]];
const MAIN = [[0, 0], [0, 4], [0, 8], [0, 12]];

function atCompare(g) {
  const begun = g.startQuestRun("firefly-crossing");
  assert.strictEqual(begun.ok, true, begun.code);
  const run = () => g.QUEST_RUNS[begun.runId];
  const credit = (versionId, sessionId) => {
    const v = run().versions[versionId];
    const r = g.transactQuestRun(begun.runId, [{ type: "completePass", versionId, editRev: v.editRev,
      sessionId, at: Date.now() }]);
    assert.strictEqual(r.ok, true, r.code);
  };
  g.applySong(completeDealtSong(g, song(RISE, MAIN))); g.noteEdit("A edit"); credit("A", "a");
  assert.strictEqual(g.performQuestAction("continue").ok, true);
  g.applySong(completeDealtSong(g, song(FALL, MAIN))); g.noteEdit("B edit"); credit("B", "b");
  assert.strictEqual(g.performQuestAction("continue").ok, true);
  return begun.runId;
}

test("quest undo persists the restored draft before leave and resume", t => {
  // DEFECT: restoreSnapshot() calls scheduleAutosave(), which is not the quest write door.  Undo therefore
  // changes only the live document; leave/re-enter restores the pre-undo version from QUEST_RUNS.
  const g = loadGame({ fresh: true });
  t.after(() => clearTimeout(g.autosaveT));
  const begun = g.startQuestRun("firefly-crossing");
  assert.strictEqual(begun.ok, true, begun.code);
  const run = () => g.QUEST_RUNS[begun.runId];

  const dealt = run().versions.A.song.tracks[0].notes.length;   // the landmarks this run was dealt
  g.modelSetCell(g.ROWS - 1, 0, true); // an ordinary planted note uses noteEdit and is durable
  assert.strictEqual(run().versions.A.editRev, 1);
  assert.strictEqual(run().versions.A.song.tracks[0].notes.length, dealt + 1);

  g.undoEdit();
  assert.strictEqual(g.currentSong().tracks[0].notes.length, dealt, "the editor visibly undid the note");
  assert.strictEqual(run().versions.A.song.tracks[0].notes.length, dealt,
    "the run must record the same draft now visible in the editor");

  g.performQuestAction("leave");
  assert.strictEqual(g.enterQuestRun(begun.runId).ok, true);
  assert.strictEqual(g.currentSong().tracks[0].notes.length, dealt,
    "resume must restore the undo result, not silently bring the note back");
});

test("undo cannot write through a listening lock", t => {
  // DEFECT (GPT's finding): undo during an audition restored a snapshot while the lock stayed set, so
  // the grid and the run disagreed and the next edit was silently dropped.
  //
  // DISAGREEMENT ON THE REMEDY. GPT expected undo to release the lock and hand the draft back. I do
  // not: undo is not a "stop listening" button anywhere else in this game, and during a comparison
  // there is nothing of the player's to take back — only songs the game applied for them to hear.
  // Two changes instead. An applied audition no longer enters the journal at all, following the rule
  // openStudioWith() and the cloud load already follow ("the async load must not be the first undoable
  // edit"); and undo refuses outright while a lock is held. The way back to the draft is choosing,
  // which is the act that means "I have heard enough".
  const g = loadGame({ fresh: true });
  t.after(() => { try { if (g.playing) g.stop(); } finally { clearTimeout(g.autosaveT); } });
  const runId = atCompare(g);
  const bBefore = JSON.stringify(g.QUEST_RUNS[runId].versions.B.song);

  assert.strictEqual(g.performQuestAction("audition", { versionId: "A" }).ok, true);
  g.undoEdit();
  g.undoEdit();
  assert.strictEqual(g.questAuditionVersionId, "A", "still listening to A");
  assert.strictEqual(g.isRising(g.contourSeq()), true, "and A is still what is on the grid");
  assert.strictEqual(JSON.stringify(g.QUEST_RUNS[runId].versions.B.song), bBefore,
    "the draft survived, which is the whole point of the lock");
  g.stop();

  // choosing is what hands the grid back, and then undo is a real edit again
  assert.strictEqual(g.performQuestAction("choose", { versionId: "B" }).code, "not-compared",
    "a choice still needs a comparison behind it");
  for (const id of ["A", "B"]) {
    assert.strictEqual(g.performQuestAction("audition", { versionId: id }).ok, true);
    g.stop();
    const v = g.QUEST_RUNS[runId].versions[id];
    g.transactQuestRun(runId, [{ type: "audition", versionId: id, editRev: v.editRev,
      sessionId: v.lastCompletePlaySessionId, at: Date.now() }]);
  }
  assert.strictEqual(g.performQuestAction("compare").ok, true);
  assert.strictEqual(g.performQuestAction("choose", { versionId: "B" }).ok, true);
  assert.strictEqual(g.questAuditionVersionId, null);

  g.modelSetCell(g.ROWS - 1, 8, true);
  assert.strictEqual(g.QUEST_RUNS[runId].versions.B.editRev, 2,
    "the chosen draft is editable and durable again");
  g.undoEdit();
  assert.strictEqual(g.QUEST_RUNS[runId].versions.B.editRev, 3,
    "and undo is once more an edit the run records");
  assert.strictEqual(g.currentSong().tracks[0].notes.length,
    g.QUEST_RUNS[runId].versions.B.song.tracks[0].notes.length,
    "the editor and the run agree on what the draft is");
});
