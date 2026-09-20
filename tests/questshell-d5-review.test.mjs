// D5 shell review: controls outside noteEdit must not let the field and QuestRun diverge.
//
// These are intentionally red against the reviewed change. They name the interaction that a
// browser child can perform; the stubbed DOM is used only to invoke the same event handler.

import { test } from "node:test";
import assert from "node:assert";
import { loadQuestGame as loadGame, completeDealtSong } from "./helpers/quest-fixtures.mjs";

const RISE = [[60, 0], [62, 2], [64, 4], [67, 6]];
const FALL = [[67, 0], [64, 2], [62, 4], [60, 6]];
const MAIN = [[0, 0], [0, 4], [0, 8], [0, 12]];
const EVEN = [0, 2, 4, 6, 8, 10, 12, 14].map(c => [0, c]);
const song = (mel, hits) => ({
  v: 3, meta: { title: null, created: 0, updated: 0, author: null },
  palette: "pentatonic", time: { cols: 16, tempo: 108, groove: 0 },
  tracks: [
    { kind: "melody", voice: "musicbox", notes: mel.map(([p, c]) => ({ p, c, len: 1 })) },
    { kind: "drums", hits: hits.map(([lane, c]) => ({ lane, c })) },
  ],
});

function atCompare() {
  const g = loadGame({ fresh: true });
  const launch = g.startQuestRun("firefly-crossing");
  assert.strictEqual(launch.ok, true, launch.code);
  const runId = launch.runId;
  const edit = s => { g.applySong(completeDealtSong(g, s)); g.noteEdit("test-edit"); };
  const credit = (versionId, sessionId) => {
    const v = g.QUEST_RUNS[runId].versions[versionId];
    const r = g.transactQuestRun(runId, [{ type: "completePass", versionId, editRev: v.editRev,
      sessionId, at: Date.now() }]);
    assert.strictEqual(r.ok, true, r.code);
  };
  edit(song(RISE, MAIN)); credit("A", "a");
  assert.strictEqual(g.performQuestAction("continue").ok, true);
  edit(song(FALL, EVEN)); credit("B", "b");
  assert.strictEqual(g.performQuestAction("continue").ok, true);
  return { g, runId };
}

test("a path being auditioned is editor-locked, rather than merely refusing to persist a stray click", t => {
  // MUTATION: omit the interaction-level questAuditionVersionId guard.  The old noteEdit-only guard
  // is too late: tx has already changed the displayed document and journaled the click.
  const { g } = atCompare();
  t.after(() => { try { if (g.playing) g.stop(); } catch { /* transport already down */ } });
  assert.strictEqual(g.performQuestAction("audition", { versionId: "A" }).ok, true);
  const music = () => { const s = g.currentSong(); delete s.meta; return JSON.stringify(s); };
  const before = music();

  g.cellClick(g.ROWS - 1, 9, g.__document.createElement("div"));

  assert.strictEqual(music(), before,
    "a field click while hearing a path must be refused before it changes what the child sees");
});

test("a quest tempo change is committed to its draft and reopens the full-play gate", () => {
  // MUTATION: handle #tempo only as a personal setting. Tempo is serialized by currentSong(), so this
  // otherwise leaves the audible document at one tempo and the offered QuestRun artifact at another.
  //
  // NOTE ON THE REMEDY: the commit hangs off "change", not "input". A range slider fires "input" for
  // every pixel of a drag, and one run transaction per pixel is not a revision history — it is noise.
  // "change" is one deliberate set, which is also where the settings save already lives. The handler
  // moved from addEventListener to onchange so that it can be called directly: a listener the harness
  // cannot dispatch is a handler no test can reach.
  const g = loadGame({ fresh: true });
  const launch = g.startQuestRun("firefly-crossing");
  assert.strictEqual(launch.ok, true, launch.code);
  const run = () => g.QUEST_RUNS[launch.runId];
  g.applySong(song(RISE, MAIN)); g.noteEdit("test-edit");
  const v = run().versions.A;
  assert.strictEqual(g.transactQuestRun(launch.runId, [{ type: "completePass", versionId: "A",
    editRev: v.editRev, sessionId: "heard", at: Date.now() }]).ok, true);

  g.tempoEl.value = 120;
  g.tempoEl.oninput();      // the drag: retimes the transport, commits nothing
  assert.strictEqual(run().versions.A.song.time.tempo, 108, "a drag in progress is not a decision");
  g.tempoEl.onchange();     // the release: one deliberate set

  assert.strictEqual(run().versions.A.song.time.tempo, 120,
    "the persisted version must be the Song v3 currently on the field");
  assert.strictEqual(g.playbackCompleteSinceLastEdit(run(), "A"), false,
    "changing the offered song must require a new complete playback");

  // The VOICE is serialised by currentSong() too and commits the same way — but the harness's <select>
  // stub does not hold a value, so it cannot be exercised here. Pinned in the browser instead, which is
  // where a select can actually be changed.
});
