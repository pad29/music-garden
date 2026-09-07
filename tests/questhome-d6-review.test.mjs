// D6 review regressions: Home must not advertise a route the quest engine cannot enter, and it
// must redraw after the only asynchronous profile replacement while Home can remain visible.

import { test } from "node:test";
import assert from "node:assert";
import { loadGame } from "./harness.mjs";

const completedPrerequisites = (g) => {
  const ids = g.QUEST_DEFINITIONS["firefly-crossing"].prerequisites.earnedByPackageIds;
  return { packages: Object.fromEntries(ids.map((id) => [id, { completed: true }])) };
};

test("a run from a replaced definition is not advertised as Continue", () => {
  // MUTATION: treat every active run as resumable, without checking its definition version.
  // enterQuestRun() correctly refuses this run with definition-changed; Home must not offer a
  // Continue button whose only possible result is that refusal.
  const g = loadGame({ fresh: true });
  const defs = g.QUEST_DEFINITIONS;
  const oldRun = {
    runId: "old-firefly", questId: "firefly-crossing",
    definitionVersion: defs["firefly-crossing"].v - 1,
    status: "active", phase: 0, draft: "A", versions: {}, updatedAt: 1,
  };

  const eligibility = g.questEligibility(defs, completedPrerequisites(g), { "old-firefly": oldRun }, {});
  assert.strictEqual(eligibility[0].liveRunId, null,
    "a version the installed definition cannot render is not a live resumable run");
  assert.notStrictEqual(g.questHomeCard(defs, completedPrerequisites(g), { "old-firefly": oldRun }, {}).kind, "continue");
});

test("a cloud-applied profile redraws the already-open Home quest card", () => {
  // MUTATION: refresh package territories after cloud pull but leave the Home quest card from the
  // previous profile in place. A signed-in child can stay on Home while the pull completes.
  const g = loadGame({ fresh: true });
  g.openHome();
  let redraws = 0;
  g.renderQuestHome = () => { redraws++; };
  g.progress = completedPrerequisites(g);
  g.applyProgress();
  assert.strictEqual(redraws, 1,
    "the card must agree with the newly applied package completion while Home is open");
});
