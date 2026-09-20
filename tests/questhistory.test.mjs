// Completion history survives run pruning.
//
// C2 capped mg_questRuns at 12 and pruned completed runs before active ones — so finishing a quest
// and then starting twelve more erased the record that you ever finished it, because the run holding
// the evidence is the same object the cap throws away. The completion record now lives outside the
// cap, in the same write as the run that earned it.

import { test } from "node:test";
import assert from "node:assert";
import { loadGame } from "./harness.mjs";

const SPAN = { start: 0, end: 16 };
const song = () => ({ v: 3, meta: {}, time: { cols: 16, tempo: 108, groove: 0 },
  tracks: [{ kind: "melody", notes: [{ p: 60, c: 0, len: 1 }] }, { kind: "drums", hits: [{ lane: 0, c: 0 }] }] });

/** Drive one quest all the way to a saved artifact. */
function completeAQuest(g, runId = "r1", questId = "firefly-crossing") {
  g.QUEST_RUNS[runId] = g.newQuestRun({ runId, questId, definitionVersion: 2, song: song(), span: SPAN, at: 1 });
  g.transactQuestRun(runId, [{ type: "completePass", versionId: "A", editRev: 0, sessionId: "s-" + runId, at: 2 }]);
  g.QUEST_RUNS[runId] = { ...g.QUEST_RUNS[runId], selection: "A" };
  g.transactQuestRun(runId, [{ type: "offer", title: "The Crossing", at: 3 }]);
  return g.finalizeQuestOffering(runId);
}

test("a completion is remembered after the runs that earned it are pruned away", () => {
  // MUTATION: apply QUEST_RUN_MAX to the completed map as well, or derive completion from runs only.
  const g = loadGame({ fresh: true });
  g.QUEST_RUNS = Object.create(null);

  assert.strictEqual(completeAQuest(g).ok, true);
  assert.strictEqual(g.questCompleted("firefly-crossing"), true);

  // Churn past the cap with COMPLETED runs — abandoned ones prune first, so they would never
  // evict r1. Completed runs are the case that actually threatens the record.
  for (let i = 0; i < 15; i++) completeAQuest(g, "later" + i, "quest" + i);

  assert.strictEqual(Object.keys(g.QUEST_RUNS).length <= g.QUEST_RUN_MAX, true, "the cap still holds on runs");
  assert.strictEqual(g.QUEST_RUNS.r1, undefined, "the completed run itself was pruned, as designed");

  // Re-hydrate: the in-memory map would survive a defect that only corrupts what is WRITTEN, so the
  // property is only real if it comes back off disk.
  g.hydrateQuestRuns();
  assert.strictEqual(g.questCompleted("firefly-crossing"), true,
    "…but the completion is still known after a reload — this is the whole point");
  assert.strictEqual(g.QUEST_HISTORY["firefly-crossing"].artifactId, "quest-run:r1");
});

test("the completion record and the completed run land in one write", () => {
  // MUTATION: record history in a second Store.set after the run transaction.
  const g = loadGame({ fresh: true });
  g.QUEST_RUNS = Object.create(null);
  g.QUEST_RUNS.r1 = g.newQuestRun({ runId: "r1", questId: "fc", definitionVersion: 2, song: song(), span: SPAN, at: 1 });
  g.transactQuestRun("r1", [{ type: "completePass", versionId: "A", editRev: 0, sessionId: "s1", at: 2 }]);
  g.QUEST_RUNS.r1 = { ...g.QUEST_RUNS.r1, selection: "A" };
  g.transactQuestRun("r1", [{ type: "offer", title: "x", at: 3 }]);

  let writes = 0;
  const realSet = g.Store.set;
  g.Store.set = (k, v) => { if (k === "questRuns") writes++; return realSet(k, v); };
  g.finalizeQuestOffering("r1");
  g.Store.set = realSet;

  assert.strictEqual(g.questCompleted("fc"), true);
  assert.strictEqual(writes, 1, "one questRuns write: a crash between two would lose the record");
});

test("a failed write publishes neither the run nor the history", () => {
  // MUTATION: assign QUEST_HISTORY before checking the store result.
  const g = loadGame({ fresh: true });
  g.QUEST_RUNS = Object.create(null);
  g.QUEST_RUNS.r1 = g.newQuestRun({ runId: "r1", questId: "fc", definitionVersion: 2, song: song(), span: SPAN, at: 1 });
  g.transactQuestRun("r1", [{ type: "completePass", versionId: "A", editRev: 0, sessionId: "s1", at: 2 }]);
  g.QUEST_RUNS.r1 = { ...g.QUEST_RUNS.r1, selection: "A" };
  g.transactQuestRun("r1", [{ type: "offer", title: "x", at: 3 }]);

  const realSet = g.Store.set;
  g.Store.set = (k) => (k === "questRuns" ? false : true);
  g.transactQuestRun("r1", [{ type: "saveAs", artifactId: "quest-run:r1", savedAt: 9 }]);
  g.Store.set = realSet;

  assert.strictEqual(g.questCompleted("fc"), false, "a lost write must not leave a phantom completion");
  assert.strictEqual(g.QUEST_RUNS.r1.status, "offering");
});

test("a v1 profile migrates its completions in memory, without forcing a write", () => {
  // MUTATION: drop completed runs during migration, or ignore a v1 envelope entirely.
  const g = loadGame({ fresh: true });
  const done = { ...g.newQuestRun({ runId: "old", questId: "fc", definitionVersion: 2, song: song(), span: SPAN, at: 1 }),
    status: "completed", artifact: { artifactId: "quest-run:old", versionId: "A", editRev: 0, title: "t", savedAt: 50 } };
  g.Store.set("questRuns", { v: 1, runs: { old: done } });      // the shipped C2 shape

  let wrote = false;
  const realSet = g.Store.set;
  g.Store.set = (k, v) => { if (k === "questRuns") wrote = true; return realSet(k, v); };
  g.hydrateQuestRuns();
  g.Store.set = realSet;

  assert.strictEqual(g.questCompleted("fc"), true, "an old profile's completion is recovered");
  assert.strictEqual(g.QUEST_HISTORY.fc.artifactId, "quest-run:old");
  assert.strictEqual(wrote, false, "migration is in memory; the next ordinary write saves v2");
});

test("a v2 envelope round-trips its history", () => {
  // MUTATION: read env.completed without checking the key matches its questId.
  const g = loadGame({ fresh: true });
  g.Store.set("questRuns", { v: 2, runs: {}, completed: {
    good: { questId: "good", definitionVersion: 2, lastRunId: "r9", artifactId: "quest-run:r9", completedAt: 5 },
    mismatched: { questId: "somethingelse", lastRunId: "r8" },
  }});
  g.hydrateQuestRuns();

  assert.strictEqual(g.questCompleted("good"), true);
  assert.strictEqual(g.questCompleted("mismatched"), false, "a record whose key disagrees with its questId is dropped");
});
