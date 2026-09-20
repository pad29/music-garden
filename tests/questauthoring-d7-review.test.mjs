// D7 adversarial review: the cross-catalog seams that only become meaningful once two quests exist.
//
// These deliberately exercise the official ids rather than invented fixtures: a collision in history,
// a catalog disappearing between an offer and crash recovery, or one quest inheriting the other one's
// controls only appears when both definitions travel through the same registries and persistence key.

import { test } from "node:test";
import assert from "node:assert";
import { loadQuestGame as loadGame } from "./helpers/quest-fixtures.mjs";

const song = () => ({
  v: 3, meta: { title: null, created: 0, updated: 0, author: null },
  palette: "pentatonic", time: { cols: 16, tempo: 108, groove: 0 },
  tracks: [
    { kind: "melody", voice: "musicbox", notes: [{ p: 60, c: 0, len: 1 }] },
    { kind: "drums", hits: [{ lane: 0, c: 0 }] },
  ],
});

function offer(g, runId, questId, at) {
  g.QUEST_RUNS[runId] = g.newQuestRun({
    runId, questId, definitionVersion: g.QUEST_DEFINITIONS[questId].v,
    song: song(), span: { start: 0, end: 16 }, at,
  });
  let r = g.transactQuestRun(runId, [{ type: "completePass", versionId: "A", editRev: 0,
    sessionId: "heard-" + runId, at: at + 1 }]);
  assert.strictEqual(r.ok, true, r.code);
  g.QUEST_RUNS[runId] = { ...g.QUEST_RUNS[runId], selection: "A" };
  r = g.transactQuestRun(runId, [{ type: "offer", title: runId, at: at + 2 }]);
  assert.strictEqual(r.ok, true, r.code);
}

test("each official workspace is the only feature set and envelope that enters its run", () => {
  // MUTATION: reuse Firefly's feature list or envelope while opening Waking Woods.
  // Two definitions sharing one controller must not inherit loop/drums or their reverse by accident.
  const g = loadGame({ fresh: true });
  for (const id of ["firefly-crossing", "waking-woods"]) {
    const def = g.QUEST_DEFINITIONS[id];
    const r = g.startQuestRun(id);
    assert.strictEqual(r.ok, true, id + ": " + r.code);
    assert.deepEqual([...g.scopeFeatures()].sort(), [...def.workspace.controlIds].sort(), id);
    assert.strictEqual(g.currentLevel().drums, def.workspace.controlIds.includes("drums"), id + " drum envelope");
    assert.strictEqual(g.currentLevel().loop, def.workspace.controlIds.includes("loop"), id + " loop envelope");
    assert.strictEqual(g.questWorkspaceMismatch(g.currentSong(), def), null,
      id + " opens a song its own workspace accepts");
  }
});

test("an offering recovers to its ordinary song when its catalog definition was withdrawn", () => {
  // MUTATION: remove the saved-song fallback, or consult the missing definition before upserting.
  // A deploy may drop a quest after a browser crashes between offer and artifact write. Recovery must
  // still save the already-chosen composition; it must not strand it because the card no longer exists.
  const g = loadGame({ fresh: true });
  offer(g, "woods-offering", "waking-woods", 10);

  const fireflyOnly = JSON.parse(JSON.stringify(g.QUEST_DEFINITIONS["firefly-crossing"]));
  g.loadQuestCatalog(JSON.stringify({ v: 1, definitions: [fireflyOnly] }), "official");
  assert.deepEqual(Object.keys(g.QUEST_DEFINITIONS), ["firefly-crossing"]);

  const recovered = g.recoverQuestOfferings();
  assert.strictEqual(recovered.length, 1);
  assert.strictEqual(recovered[0][1].ok, true, recovered[0][1].code);
  const saved = g.getSaves().find(s => s.meta && s.meta.localId === "quest-run:woods-offering");
  assert.strictEqual(!!saved, true, "the selected song is put away even without its definition");
  assert.strictEqual(saved.meta.source.questId, "waking-woods");
  assert.strictEqual(g.QUEST_RUNS["woods-offering"].status, "completed");
});

test("run pruning preserves separate completion histories for both shipped quest ids", () => {
  // MUTATION: key completion history by one shared slot, or derive it from the capped run map.
  // The two real ids make this a collision test rather than a generic completion test.
  const g = loadGame({ fresh: true });
  g.QUEST_RUNS = Object.create(null);
  const ids = ["firefly-crossing", "waking-woods"];
  for (let i = 0; i < g.QUEST_RUN_MAX + 3; i++) {
    const questId = ids[i % ids.length];
    const runId = "d7-" + i;
    offer(g, runId, questId, 100 + i * 10);
    const done = g.finalizeQuestOffering(runId);
    assert.strictEqual(done.ok, true, runId + ": " + done.code);
  }

  assert.strictEqual(Object.keys(g.QUEST_RUNS).length <= g.QUEST_RUN_MAX, true, "the cap still applies");
  for (const questId of ids) {
    assert.strictEqual(g.questCompleted(questId), true, questId + " completion survived pruning");
    assert.strictEqual(g.QUEST_HISTORY[questId].questId, questId, questId + " history did not collide");
  }
});
