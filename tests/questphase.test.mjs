// The phase gate and the offering.
//
// advanceQuestPhase() is the only post-construction writer of run.phase — the anti-drift rule the
// scope migration established, applied to the phase. And finalisation is ordered so that a completed
// run can never exist without its artifact, because localStorage cannot write two keys atomically.

import { test } from "node:test";
import assert from "node:assert";
import { loadGame } from "./harness.mjs";

const SPAN = { start: 0, end: 16 };
const song = (notes = [{ p: 60, c: 0, len: 1 }]) => ({
  v: 3, meta: { created: 1, updated: 1 }, time: { cols: 16, tempo: 108, groove: 0 },
  tracks: [{ role: "melody", notes }, { role: "drums", hits: [{ lane: 0, c: 0 }] }],
});

/** A game in quest scope with one heard version, ready to advance or offer. */
function questGame({ heard = true, phases = 3 } = {}) {
  const g = loadGame({ fresh: true });
  const run = g.newQuestRun({ runId: "r1", questId: "firefly-crossing", definitionVersion: 1,
    song: song(), span: SPAN, at: 1 });
  g.QUEST_RUNS = { r1: run };
  g.setPlayScope({ kind: "quest", questId: "firefly-crossing", runId: "r1",
    stages: [{ name: "The Firefly Crossing", steps: Array.from({ length: phases }, (_, i) => ({ name: `phase ${i + 1}`, goals: [] })) }] });
  if (heard) g.transactQuestRun("r1", [{ type: "completePass", versionId: "A", editRev: 0, sessionId: "s1", at: 2 }]);
  return g;
}

const openGate = g => run => g.playbackCompleteSinceLastEdit(run, "A");

test("the completion gate is two numbers, and nothing else", () => {
  const g = questGame();
  assert.strictEqual(g.playbackCompleteSinceLastEdit(g.QUEST_RUNS.r1, "A"), true);

  g.transactQuestRun("r1", [{ type: "edit", target: "song", versionId: "A", baseRev: 0,
    song: song([{ p: 62, c: 1, len: 1 }]), span: SPAN, at: 3 }]);
  assert.strictEqual(g.playbackCompleteSinceLastEdit(g.QUEST_RUNS.r1, "A"), false,
    "an edit reopens it without anyone having to remember to clear a flag");
  assert.strictEqual(g.playbackCompleteSinceLastEdit(g.QUEST_RUNS.r1, "nope"), false);
});

test("a closed, missing or throwing gate does not advance the phase", () => {
  const g = questGame({ heard: false });
  const before = g.QUEST_RUNS.r1.phase;

  assert.strictEqual(g.advanceQuestPhase({ runId: "r1", expectedPhase: 0, gate: openGate(g) }).code, "gate-closed",
    "nothing was heard yet");
  assert.strictEqual(g.advanceQuestPhase({ runId: "r1", expectedPhase: 0 }).code, "no-gate");
  assert.strictEqual(g.advanceQuestPhase({ runId: "r1", expectedPhase: 0, gate: () => { throw new Error("boom"); } }).code,
    "gate-threw", "a throwing gate is a closed gate, not a crash");
  assert.strictEqual(g.advanceQuestPhase({ runId: "r1", expectedPhase: 0, gate: () => "yes" }).code, "gate-closed",
    "only the literal true opens it");
  assert.strictEqual(g.QUEST_RUNS.r1.phase, before);
});

test("a stale expected phase is refused", () => {
  const g = questGame();
  assert.strictEqual(g.advanceQuestPhase({ runId: "r1", expectedPhase: 1, gate: openGate(g) }).code, "stale-phase");
  assert.strictEqual(g.advanceQuestPhase({ runId: "other", expectedPhase: 0, gate: openGate(g) }).code, "wrong-scope");
});

test("the phase cannot step past the last one the definition declares", () => {
  const g = questGame({ phases: 1 });
  assert.strictEqual(g.advanceQuestPhase({ runId: "r1", expectedPhase: 0, gate: openGate(g) }).code, "no-next-phase");
});

test("preparatory ops and the phase step land together or not at all", () => {
  const g = questGame();
  const ok = g.advanceQuestPhase({ runId: "r1", expectedPhase: 0, gate: openGate(g),
    ops: [{ type: "forkFrom", sourceVersionId: "A", sourceRev: 0, newVersionId: "B", at: 4 }] });
  assert.strictEqual(ok.ok, true);
  assert.strictEqual(g.QUEST_RUNS.r1.phase, 1);
  assert.strictEqual(g.QUEST_RUNS.r1.draft, "B", "the fork and the phase move are one transaction");

  // a preparatory op that cannot apply takes the phase move down with it
  const g2 = questGame();
  const bad = g2.advanceQuestPhase({ runId: "r1", expectedPhase: 0, gate: openGate(g2),
    ops: [{ type: "forkFrom", sourceVersionId: "MISSING", sourceRev: 0, newVersionId: "B", at: 4 }] });
  assert.strictEqual(bad.ok, false);
  assert.strictEqual(g2.QUEST_RUNS.r1.phase, 0, "a fork that failed must not leave the phase moved on");
  assert.strictEqual(g2.QUEST_RUNS.r1.versions.B, undefined);
});

test("the lesson engine cannot move a quest phase", () => {
  const g = questGame();
  g.lessonStepIdx = 2;
  assert.strictEqual(g.QUEST_RUNS.r1.phase, 0, "the run is untouched by the lesson index");
  assert.strictEqual(g.currentStepIndex(), 0);
  // and the reducer's private step is not reachable as an ordinary op through the public door
  const direct = g.transactQuestRun("r1", [{ type: "_phase", to: 5, at: 1 }]);
  assert.strictEqual(direct.ok, false, "a phase step must be a single increment, whoever submits it");
  assert.strictEqual(g.QUEST_RUNS.r1.phase, 0);
});

test("offering succeeds without any route match, and needs only a real listen", () => {
  const g = questGame();
  g.transactQuestRun("r1", [{ type: "audition", versionId: "A", editRev: 0, sessionId: "s1", at: 3 }]);
  // choose requires a comparison, so select by hand the way phase 3 will
  g.QUEST_RUNS.r1 = { ...g.QUEST_RUNS.r1, selection: "A" };

  const r = g.transactQuestRun("r1", [{ type: "offer", title: "The Crossing", at: 5 }]);
  assert.strictEqual(r.ok, true, "no route evidence is consulted — there is no input here that could carry one");
  assert.strictEqual(g.QUEST_RUNS.r1.status, "offering");
  assert.strictEqual(g.QUEST_RUNS.r1.pendingOffer.artifactId, "quest-run:r1");
});

test("offering is refused when the chosen version has not been heard since its last edit", () => {
  const g = questGame();
  g.QUEST_RUNS.r1 = { ...g.QUEST_RUNS.r1, selection: "A" };
  g.transactQuestRun("r1", [{ type: "edit", target: "song", versionId: "A", baseRev: 0,
    song: song([{ p: 67, c: 2, len: 1 }]), span: SPAN, at: 6 }]);

  const r = g.transactQuestRun("r1", [{ type: "offer", title: "x", at: 7 }]);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, "not-heard");
});

test("a completed run can never exist without its artifact", () => {
  const g = questGame();
  g.QUEST_RUNS.r1 = { ...g.QUEST_RUNS.r1, selection: "A" };
  g.transactQuestRun("r1", [{ type: "offer", title: "The Crossing", at: 5 }]);

  const done = g.finalizeQuestOffering("r1");
  assert.strictEqual(done.ok, true);
  assert.strictEqual(g.QUEST_RUNS.r1.status, "completed");

  const saved = g.getSaves().find(x => x.meta && x.meta.localId === "quest-run:r1");
  assert.strictEqual(!!saved, true, "the artifact exists");
  assert.strictEqual(saved.meta.source.kind, "quest");
  assert.strictEqual(saved.meta.source.runId, "r1");
  assert.strictEqual(saved.v, 3, "it is an ordinary v3 song — a pointer, not embedded quest content");
});

test("an interrupted offering finishes on the next load, without duplicating the artifact", () => {
  const g = questGame();
  g.QUEST_RUNS.r1 = { ...g.QUEST_RUNS.r1, selection: "A" };
  g.transactQuestRun("r1", [{ type: "offer", title: "The Crossing", at: 5 }]);

  // crash after step 1: the run is "offering" and no artifact exists yet
  assert.strictEqual(g.getSaves().filter(x => x.meta && x.meta.localId === "quest-run:r1").length, 0);

  const first = g.recoverQuestOfferings();
  assert.strictEqual(first.length, 1);
  assert.strictEqual(g.QUEST_RUNS.r1.status, "completed");

  // and a second recovery pass is inert rather than duplicating
  const again = g.recoverQuestOfferings();
  assert.strictEqual(again.length, 0);
  assert.strictEqual(g.getSaves().filter(x => x.meta && x.meta.localId === "quest-run:r1").length, 1);
});

test("writing the artifact twice replaces it rather than making a second song", () => {
  // The recovery path can genuinely reach the upsert more than once — a write that failed after the
  // artifact landed leaves the run offering, and the next load tries again. Exercise that directly:
  // going through recoverQuestOfferings twice cannot, because the run completes on the first pass.
  const g = questGame();
  g.QUEST_RUNS.r1 = { ...g.QUEST_RUNS.r1, selection: "A" };
  g.transactQuestRun("r1", [{ type: "offer", title: "The Crossing", at: 5 }]);
  const run = g.QUEST_RUNS.r1;

  g.questArtifactUpsert(run);
  g.questArtifactUpsert(run);
  g.questArtifactUpsert(run);

  assert.strictEqual(g.getSaves().filter(x => x.meta && x.meta.localId === "quest-run:r1").length, 1,
    "three attempts, one song — the upsert replaces by id");
});

test("a run does not complete when its artifact could not be written", () => {
  // The ordering IS the recovery guarantee: artifact first, then saveAs. Reversing them would let a
  // completed run exist with nothing saved, which no later pass would ever repair.
  const g = questGame();
  g.QUEST_RUNS.r1 = { ...g.QUEST_RUNS.r1, selection: "A" };
  g.transactQuestRun("r1", [{ type: "offer", title: "The Crossing", at: 5 }]);

  const realSet = g.Store.set;
  g.Store.set = (k, v) => (k === "saves" ? false : realSet(k, v));   // only the artifact write fails
  const r = g.finalizeQuestOffering("r1");
  g.Store.set = realSet;

  assert.strictEqual(r.ok, false, "finalisation must not report success");
  assert.strictEqual(g.QUEST_RUNS.r1.status, "offering",
    "the run stays offering so the next load retries — completing here would strand it forever");
});

test("a missing or terminal run yields the invalid sentinel, never a plausible phase 0", () => {
  const g = questGame();
  assert.strictEqual(g.questPhaseIndex("nope"), g.QUEST_PHASE_INVALID);

  g.QUEST_RUNS.r1 = { ...g.QUEST_RUNS.r1, status: "abandoned" };
  assert.strictEqual(g.questPhaseIndex("r1"), g.QUEST_PHASE_INVALID, "a finished run is not at phase 0");

  g.QUEST_RUNS.r1 = { ...g.QUEST_RUNS.r1, status: "active", phase: -2 };
  assert.strictEqual(g.questPhaseIndex("r1"), g.QUEST_PHASE_INVALID);

  // …and the render path degrades instead of throwing, because curStage() is on the paint loop
  assert.doesNotThrow(() => g.currentStepIndex());
  assert.strictEqual(g.currentStepIndex(), 0);
});
