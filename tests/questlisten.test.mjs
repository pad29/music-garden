// Playtest, 2026-09-22: "after I edit the path and play it, Offer stays greyed out until I click the
// other path, play it, and then come back to this path and play it again."
//
// Only an `audition` purpose records `auditionedRev`, and the ONLY caller that ever set one was the
// path toggle. So pressing ▶ Play on the path you are holding — the most direct way there is to listen
// to it — did not count as listening to it, and the offer stayed shut until you had tapped your way
// around both paths again. The path that had NOT changed was never the problem; the game simply
// refused to notice the listen it had just been given.
//
// These cover the decision and its consequence. The transport chain between them (start → tick → pass)
// is browser work and is not simulated here.
import { test } from "node:test";
import assert from "node:assert";
import { launch, compare } from "./helpers/quest-e6-fixtures.mjs";

test("a session begun with no stated purpose auditions only in the comparison phase", t => {
  // MUTATION: default the purpose to "play" everywhere, or to "audition" in every phase.
  // Auditioning in an early phase would quietly credit a comparison that has not been made; playing
  // in the last one is the defect this test exists for.
  const early = launch(t);
  early.ready();
  assert.strictEqual(early.run().phase, 0);
  assert.ok(early.g.beginCompletionSession());
  assert.strictEqual(early.g.completionState.active.purpose, "play");

  const late = compare(t);
  assert.strictEqual(late.run().phase, 2);
  assert.ok(late.g.beginCompletionSession());
  assert.strictEqual(late.g.completionState.active.purpose, "audition");

  // An explicitly named purpose still wins — the default decides nothing that a caller has stated.
  assert.ok(late.g.beginCompletionSession({ purpose:"play" }));
  assert.strictEqual(late.g.completionState.active.purpose, "play");
});

test("hearing the path you hold is enough, and the path you did not touch stays heard", t => {
  // The baseline, on its own run: both paths heard, nothing edited, the offer open.
  assert.strictEqual(compare(t).g.performQuestAction("offer").ok, true);

  // Now the reported case, on a fresh run: edit the path being held, then listen to it.
  const f2 = compare(t), g2 = f2.g, run2 = f2.run;
  const held2 = run2().draft, other2 = held2 === "A" ? "B" : "A";
  const heardOther2 = run2().versions[other2].auditionedRev;
  g2.modelSetCell(g2.ROWS - 1, 3, !g2.grid[g2.ROWS - 1][3]);
  assert.notStrictEqual(run2().versions[held2].auditionedRev, run2().versions[held2].editRev,
    "an edited path has to be heard again — that was never in question");
  assert.strictEqual(g2.performQuestAction("offer").code, "gate-closed");

  // …and it cannot be talked into counting one. An audition is a RECEIPT for a play that finished at
  // this exact revision in this exact session; claiming one without it is refused. Making listening
  // easier must not make it optional.
  const claimed = g2.transactQuestRun(f2.id, [{ type:"audition", versionId:held2,
    editRev:run2().versions[held2].editRev, sessionId:"never-played", at:Date.now() }]);
  assert.deepEqual([claimed.ok, claimed.code], [false, "not-heard"]);

  // Play it through the way ▶ Play does: no purpose named, the session decides.
  assert.ok(g2.beginCompletionSession());
  const v = run2().versions[held2];
  g2.onCompletePass({ runId:f2.id, versionId:held2, editRev:v.editRev,
    sessionId:"replay", purpose:g2.completionState.active.purpose });

  assert.strictEqual(run2().versions[other2].auditionedRev, heardOther2,
    "the untouched path is still heard, and was never listened to twice");
  const model = g2.questShellModel(run2(), f2.def, {});
  assert.strictEqual(model.actions.find(a => a.id === "offer").enabled, true, "the button lights");
  assert.strictEqual(g2.performQuestAction("offer").ok, true, "…and the door opens with it");
});
