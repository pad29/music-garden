// QuestRun: the durable owner of a quest's versions, phase and tray.
//
// A completion receipt is only a claim about what was heard. Nothing becomes evidence until it
// survives a persisted transaction, so a lost write cannot leave the game believing a pass happened.
// These tests pin the reducer, the all-or-nothing transaction, and the isolation from package state.

import { test } from "node:test";
import assert from "node:assert";
import { loadGame } from "./harness.mjs";

const g = loadGame();

const SPAN = { start: 0, end: 16 };
const song = (cols = 16, notes = [{ p: 60, c: 0, len: 1 }]) => ({
  v: 3, meta: { created: 1, updated: 1 }, time: { cols, tempo: 108, groove: 0 },
  tracks: [{ kind: "melody", notes }, { kind: "drums", hits: [{ lane: 0, c: 0 }] }],
});
const emptySong = () => ({ v: 3, meta: {}, time: { cols: 16, tempo: 108, groove: 0 },
  tracks: [{ kind: "melody", notes: [] }, { kind: "drums", hits: [] }] });

const fresh = (over = {}) => g.newQuestRun({ runId: "r1", questId: "firefly-crossing",
  definitionVersion: 2, song: song(), span: SPAN, at: 100, ...over });

const apply = (run, ops) => g.reduceQuestTransaction(run, ops);

test("an edit advances the revision and makes the completion gate false again", () => {
  let run = fresh();
  const heard = apply(run, [{ type: "completePass", versionId: "A", editRev: 0, sessionId: "s1", at: 1 }]);
  assert.strictEqual(heard.ok, true);
  assert.strictEqual(g.playbackCompleteSinceLastEdit ? g.playbackCompleteSinceLastEdit(heard.run, "A")
    : heard.run.versions.A.lastCompletePlayRev === heard.run.versions.A.editRev, true);

  const edited = apply(heard.run, [{ type: "edit", target: "song", versionId: "A", baseRev: 0,
    song: song(16, [{ p: 62, c: 1, len: 1 }]), span: SPAN, at: 2 }]);
  assert.strictEqual(edited.ok, true);
  assert.strictEqual(edited.run.versions.A.editRev, 1);
  assert.notStrictEqual(edited.run.versions.A.lastCompletePlayRev, edited.run.versions.A.editRev,
    "the gate reopens because the numbers stop matching — the audit trail is kept, not cleared");
});

test("a stale receipt is refused even if the cancellation wiring failed", () => {
  const run = apply(fresh(), [{ type: "edit", target: "song", versionId: "A", baseRev: 0,
    song: song(16, [{ p: 64, c: 2, len: 1 }]), span: SPAN, at: 2 }]).run;
  const late = g.reduceQuestRun(run, { type: "completePass", versionId: "A", editRev: 0, sessionId: "s1", at: 3 });
  assert.strictEqual(late.ok, false);
  assert.strictEqual(late.code, "stale-rev");
  assert.strictEqual(late.run, run, "a rejected op returns the original reference, never a half-mutation");
});

test("an empty composition cannot be credited", () => {
  const run = g.newQuestRun({ runId: "r2", questId: "q", definitionVersion: 2, song: emptySong(), span: SPAN, at: 0 });
  const r = g.reduceQuestRun(run, { type: "completePass", versionId: "A", editRev: 0, sessionId: "s", at: 1 });
  assert.strictEqual(r.code, "empty-song");
});

test("a tray change does not invalidate playback of an unchanged song", () => {
  const heard = apply(fresh(), [{ type: "completePass", versionId: "A", editRev: 0, sessionId: "s1", at: 1 }]).run;
  const trayed = apply(heard, [{ type: "edit", target: "tray", tray: [{ offs: [0, 4], midis: [60, 64] }], at: 2 }]);
  assert.strictEqual(trayed.ok, true);
  assert.strictEqual(trayed.run.versions.A.editRev, 0, "crafting is not composing");
  assert.strictEqual(trayed.run.versions.A.lastCompletePlayRev, 0, "…so the pass still counts");
});

test("forking copies the song without sharing it, and carries no evidence across", () => {
  const heard = apply(fresh(), [{ type: "completePass", versionId: "A", editRev: 0, sessionId: "s1", at: 1 }]).run;
  const forked = apply(heard, [{ type: "forkFrom", sourceVersionId: "A", sourceRev: 0, newVersionId: "B", at: 2 }]);
  assert.strictEqual(forked.ok, true);
  const { A, B } = forked.run.versions;
  assert.deepEqual(B.song, A.song, "B starts as a copy of A");
  assert.notStrictEqual(B.song, A.song, "…but not the same object");
  assert.notStrictEqual(B.song.tracks, A.song.tracks, "…and not a shared tracks array");
  assert.strictEqual(B.editRev, 0);
  assert.strictEqual(B.lastCompletePlayRev, null, "B has not been heard just because A was");
  assert.strictEqual(forked.run.draft, "B");
  assert.deepEqual(B.forkedFrom, { versionId: "A", editRev: 0 });
});

test("comparing needs both versions auditioned at their current revision", () => {
  let run = fresh();
  run = apply(run, [{ type: "completePass", versionId: "A", editRev: 0, sessionId: "s1", at: 1 },
                    { type: "audition", versionId: "A", editRev: 0, sessionId: "s1", at: 1 },
                    { type: "forkFrom", sourceVersionId: "A", sourceRev: 0, newVersionId: "B", at: 2 }]).run;

  assert.strictEqual(g.reduceQuestRun(run, { type: "compare", leftVersionId: "A", rightVersionId: "B", at: 3 }).code,
    "not-auditioned", "B has not been heard yet");

  run = apply(run, [{ type: "completePass", versionId: "B", editRev: 0, sessionId: "s2", at: 3 },
                    { type: "audition", versionId: "B", editRev: 0, sessionId: "s2", at: 3 },
                    { type: "compare", leftVersionId: "A", rightVersionId: "B", at: 4 }]).run;
  assert.deepEqual(run.comparison.versionIds, ["A", "B"]);

  const chosen = apply(run, [{ type: "choose", versionId: "B", at: 5 }]);
  assert.strictEqual(chosen.run.selection, "B");
  assert.strictEqual(chosen.run.draft, "B");
});

test("an audition is refused unless that exact session heard that exact revision", () => {
  const heard = apply(fresh(), [{ type: "completePass", versionId: "A", editRev: 0, sessionId: "s1", at: 1 }]).run;
  assert.strictEqual(g.reduceQuestRun(heard, { type: "audition", versionId: "A", editRev: 0, sessionId: "OTHER", at: 2 }).code,
    "not-heard", "a different session's receipt cannot authorise this audition");
});

test("editing after choosing keeps the selection but reopens the gate", () => {
  let run = fresh();
  run = apply(run, [{ type: "completePass", versionId: "A", editRev: 0, sessionId: "s1", at: 1 },
                    { type: "audition", versionId: "A", editRev: 0, sessionId: "s1", at: 1 },
                    { type: "forkFrom", sourceVersionId: "A", sourceRev: 0, newVersionId: "B", at: 2 },
                    { type: "completePass", versionId: "B", editRev: 0, sessionId: "s2", at: 3 },
                    { type: "audition", versionId: "B", editRev: 0, sessionId: "s2", at: 3 },
                    { type: "compare", leftVersionId: "A", rightVersionId: "B", at: 4 },
                    { type: "choose", versionId: "B", at: 5 }]).run;

  const after = apply(run, [{ type: "edit", target: "song", versionId: "B", baseRev: 0,
    song: song(16, [{ p: 67, c: 3, len: 1 }]), span: SPAN, at: 6 }]);
  assert.strictEqual(after.run.selection, "B", "a final polish does not un-choose the version");
  assert.notStrictEqual(after.run.versions.B.lastCompletePlayRev, after.run.versions.B.editRev,
    "…but it does require playing it through again");
});

test("a transaction is all-or-nothing", () => {
  const run = fresh();
  const r = apply(run, [{ type: "completePass", versionId: "A", editRev: 0, sessionId: "s1", at: 1 },
                        { type: "audition", versionId: "A", editRev: 0, sessionId: "WRONG", at: 1 }]);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.failedOp, "audition");
  assert.strictEqual(r.run, run, "the accepted first op is discarded with the rest");
  assert.strictEqual(run.versions.A.lastCompletePlayRev, null);
});

test("a no-op edit is rejected rather than burning a revision", () => {
  const run = fresh();
  const same = g.reduceQuestRun(run, { type: "edit", target: "song", versionId: "A", baseRev: 0,
    song: song(), span: SPAN, at: 2 });   // identical content, different meta timestamps
  assert.strictEqual(same.code, "no-change", "meta.created/updated must not read as a musical change");
});

test("pruning drops abandoned before completed, and never an active run", () => {
  const runs = {};
  const mk = (id, status, updatedAt) => ({ ...fresh({ runId: id }), status, updatedAt });
  runs.keepMe = mk("keepMe", "active", 1);
  for (let i = 0; i < 8; i++) runs["done" + i] = mk("done" + i, "completed", 100 + i);
  for (let i = 0; i < 8; i++) runs["gone" + i] = mk("gone" + i, "abandoned", 200 + i);

  const pruned = g.pruneQuestRuns(runs, null);
  assert.strictEqual(Object.keys(pruned).length <= 12, true);
  assert.strictEqual(!!pruned.keepMe, true, "an active run is never pruned automatically");
  const abandonedLeft = Object.keys(pruned).filter(k => pruned[k].status === "abandoned").length;
  const completedLeft = Object.keys(pruned).filter(k => pruned[k].status === "completed").length;
  assert.strictEqual(abandonedLeft < completedLeft, true, "abandoned goes first");
});

test("a failed store write publishes nothing", () => {
  const g2 = loadGame({ fresh: true });
  g2.QUEST_RUNS = { r1: fresh() };
  const before = g2.QUEST_RUNS.r1;
  const realSet = g2.Store.set;
  g2.Store.set = () => false;                       // a full disk
  const r = g2.transactQuestRun("r1", [{ type: "completePass", versionId: "A", editRev: 0, sessionId: "s", at: 1 }]);
  g2.Store.set = realSet;

  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, "store-failed");
  assert.strictEqual(g2.QUEST_RUNS.r1, before, "the visible run is untouched until the write lands");
});

test("quest runs never touch package progress", () => {
  const g2 = loadGame({ fresh: true });
  g2.progress.packages = { "twin-blooms": { level: 2, maxLevel: 2, completed: false, toolbox: [{ offs: [0, 4], midis: [60, 64] }] } };
  const packagesBefore = JSON.parse(JSON.stringify(g2.progress.packages));
  g2.QUEST_RUNS = { r1: fresh() };

  g2.transactQuestRun("r1", [{ type: "edit", target: "tray", tray: [{ offs: [0, 7], midis: [60, 67] }], at: 1 }]);

  assert.deepEqual(g2.progress.packages, packagesBefore, "a quest tray is not a package bag");
  assert.strictEqual(g2.progress.packages.r1, undefined);
  assert.deepEqual(g2.QUEST_RUNS.r1.tray, [{ offs: [0, 7], midis: [60, 67] }]);
});

test("hydration drops a malformed run rather than guessing at it", () => {
  const g2 = loadGame({ fresh: true });
  const good = fresh({ runId: "good" });
  g2.Store.set("questRuns", { v: 1, runs: {
    good,
    mismatched: { ...fresh({ runId: "other" }) },     // runId disagrees with its key
    phaseless: { runId: "phaseless", versions: {}, status: "active" },
    negative: { runId: "negative", versions: {}, status: "active", phase: -1 },
  }});
  const out = g2.hydrateQuestRuns();
  assert.deepEqual(Object.keys(out), ["good"], "a wrong phase is worse than no run at all");
});
