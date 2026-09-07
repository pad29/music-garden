// Adversarial quest-engine tests, WRITTEN BY GPT during an independent review round and kept as it
// wrote them. Every one of them failed when it arrived; each named a real defect:
//
//   - the completion receipt credited playback and never recorded what was heard;
//   - a phase-1 receipt could write a phase-3 observation, or forge a comparison no phase-1
//     analyzer is able to make;
//   - the render dedupe keyed on the raw slots object, so one fact could be said twice;
//   - "empty" meant two different things — a note at column 16 of a 16-column song is dropped by
//     applySong and heard by nobody, yet it earned a playback credit.
//
// They are kept separate from the unit suites on purpose: this is the independent formulation, and
// the value of an adversary's test is that it was not written by the person who wrote the code.

import { test } from "node:test";
import assert from "node:assert";
import { loadGame } from "./harness.mjs";

const song = (notes = [{ p: 60, c: 0, len: 1 }]) => ({
  v: 3, meta: {}, palette: "pentatonic", time: { cols: 16, tempo: 108, groove: 0 },
  tracks: [{ kind: "melody", notes }, { kind: "drums", hits: [] }],
});
const makeRun = (g, id = "r1", s = song()) => g.newQuestRun({
  runId: id, questId: "firefly-crossing", definitionVersion: 1, song: s,
  span: { start: 0, end: 16 }, at: 0,
});
const credited = { type: "completePass", versionId: "A", editRev: 0, sessionId: "s1", at: 1 };
const receipt = (over = {}) => ({
  type: "recordObservation", phaseId: "light-first-path", versionId: "A", editRev: 0,
  sessionId: "s1", matchedRouteIds: [], descriptorTokens: [], at: 1, ...over,
});

test("a normal completion receipt persists its observation atomically", () => {
  // DEFECT: onCompletePass currently sends only completePass/(audition), never recordObservation.
  const g = loadGame({ fresh: true });
  g.QUEST_RUNS = { r1: makeRun(g) };
  g.onCompletePass({ runId: "r1", versionId: "A", editRev: 0, sessionId: "s1", purpose: "play" });
  assert.ok(g.QUEST_RUNS.r1.evidence.observations?.["light-first-path"],
    "§6.4 requires [completePass, recordObservation] to be one persisted receipt");
});

test("an observation cannot smuggle a heard descriptor unavailable in this phase", () => {
  // DEFECT: phase 1 has no snapshot comparison, but accepts a forged 'changed' receipt.
  const g = loadGame({ fresh: true });
  const run = g.reduceQuestTransaction(makeRun(g), [credited]).run;
  const r = g.reduceQuestRun(run, receipt({ descriptorTokens: [{
    id: "heard-contour-changed", slots: { oldContour: "rise", newContour: "fall" },
  }] }));
  assert.strictEqual(r.ok, false, "only observation descriptors reachable from this phase belong in its receipt");
});

test("an observation belongs to the run's current phase, not merely any declared phase", () => {
  // DEFECT: a phase-1 receipt can write a future phase-3 observation before B exists or is selected.
  const g = loadGame({ fresh: true });
  const run = g.reduceQuestTransaction(makeRun(g), [credited]).run;
  const r = g.reduceQuestRun(run, receipt({ phaseId: "choose-crossing" }));
  assert.strictEqual(r.ok, false);
});

test("render dedupe is semantic, not sensitive to irrelevant slots or slot key order", () => {
  // DEFECT: id + JSON.stringify(slots) announces this one fact twice.
  const g = loadGame({ fresh: true });
  const out = g.questRenderTokens([
    { id: "heard-contour-rise" },
    { id: "heard-contour-rise", slots: { ignored: "rise" } },
  ]);
  assert.strictEqual(out.length, 1);
});

test("a song that loads empty cannot earn a complete-pass credit", () => {
  // DEFECT: applySong drops c:16 at a 16-column span, but completePass counts the raw array entry.
  const g = loadGame({ fresh: true });
  const s = song([{ p: 60, c: 16, len: 1 }]);
  assert.strictEqual(g.songEvidence(s).nonempty, false, "the analysis agrees with applySong: no event is in range");
  const r = g.reduceQuestRun(makeRun(g, "r1", s), credited);
  assert.strictEqual(r.code, "empty-song");
});
