// Adversarial D4 controller regressions found during review.
//
// These tests deliberately exercise boundaries the normal controller path does not: authored starter
// data and the existing undo journal.  A quest run owns the durable song, so neither may leave the live
// document and the run disagreeing.

import { test, after } from "node:test";
import assert from "node:assert";
import { loadQuestGame as loadGame, completeDealtSong, continueQuest } from "./helpers/quest-fixtures.mjs";

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
  assert.strictEqual(continueQuest(g).ok, true);
  g.applySong(completeDealtSong(g, song(FALL, MAIN))); g.noteEdit("B edit"); credit("B", "b");
  assert.strictEqual(continueQuest(g).ok, true);
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

test("a final-phase undo remains durable when the held path is resumed", t => {
  // The lock subject was removed in E5. The replacement pins D4's underlying persistence guarantee.
  // MUTATION: restoreSnapshot schedules autosave instead of writing the quest run.
  const g=loadGame({fresh:true});
  t.after(()=>{if(g.playing)g.stop(); clearTimeout(g.autosaveT);});
  const runId=atCompare(g);
  g.performQuestAction("pick",{versionId:"A"});
  const before=JSON.stringify(g.currentSong().tracks);
  g.modelSetCell(g.ROWS-1,9,true);
  assert.notStrictEqual(JSON.stringify(g.currentSong().tracks),before);
  g.undoEdit();
  assert.strictEqual(JSON.stringify(g.QUEST_RUNS[runId].versions.A.song.tracks),before);
  g.performQuestAction("leave"); g.enterQuestRun(runId);
  assert.strictEqual(g.QUEST_RUNS[runId].draft,"A");
  assert.strictEqual(JSON.stringify(g.currentSong().tracks),before);
});

