// The authoritative play scope.
//
// `currentPkg` used to be identity, progress key, toolbox key and control gate at once, with `LEVELS`
// as a second mutable global that could disagree with it. A quest can be neither: as a package id it
// would write a quest tray into progress.packages; as "studio" nothing would persist at all. These
// tests pin the replacement — one frozen descriptor, one setter, and a quest phase that lives in its
// run rather than in a second index.

import { test } from "node:test";
import assert from "node:assert";
import { loadGame } from "./harness.mjs";

const g = loadGame();

/** A minimal quest envelope: ONE level whose steps are the phases (the shipped stage engine, reused). */
function questScope(runId = "run-1", phases = 3) {
  return {
    kind: "quest", questId: "firefly-crossing", runId,
    stages: [{ name: "The Firefly Crossing", steps: Array.from({ length: phases }, (_, i) => ({ name: `phase ${i + 1}`, goals: [] })) }],
  };
}

test("the setter is the only door, and it refuses a bad identity", () => {
  const g = loadGame({ fresh: true });

  assert.throws(() => g.setPlayScope({ kind: "package", packageId: "nope" }), /not a package/);
  assert.throws(() => g.setPlayScope({ kind: "package", packageId: "studio" }), /not a package/,
    "the Studio must never masquerade as a package");
  assert.throws(() => g.setPlayScope({ kind: "quest", questId: "q" }), /incomplete quest identity/,
    "a quest without a run has no phase to read");
  assert.throws(() => g.setPlayScope({ kind: "elsewhere" }), /unknown scope kind/);
  assert.throws(() => g.setPlayScope(null), /no scope given/);
});

test("identity and stages change together, and the descriptor is frozen", () => {
  const g = loadGame({ fresh: true });

  g.setPlayScope({ kind: "package", packageId: "footsteps" });
  assert.strictEqual(g.activePackageId(), "footsteps");
  assert.deepEqual(g.activeStages(), g.PACKAGES.footsteps.levels);
  assert.strictEqual(Object.isFrozen(g.activeScope), true,
    "a writable descriptor is how the old drift got in");
});

test("package identity is unavailable outside a package", () => {
  const g = loadGame({ fresh: true });

  g.setPlayScope({ kind: "studio" });
  assert.strictEqual(g.activePackageId(), null);
  assert.strictEqual(g.scopeCatalogId(), "studio");
  assert.throws(() => g.requirePackageId(), /package scope required/);

  g.setPlayScope(questScope());
  assert.strictEqual(g.activePackageId(), null);
  assert.strictEqual(g.scopeCatalogId(), null, "a quest is not in the package catalog at all");
  assert.throws(() => g.requirePackageId(), /package scope required/);
});

test("a quest reads its phase from the run, never from the lesson index", () => {
  const g = loadGame({ fresh: true });
  g.QUEST_RUNS = { "run-1": { phase: 0 } };
  g.setPlayScope(questScope("run-1"));

  assert.strictEqual(g.curStage().name, "phase 1");

  // The lesson index is not the quest's phase, and moving it must change nothing.
  g.lessonStepIdx = 2;
  assert.strictEqual(g.currentStepIndex(), 0, "lessonStepIdx must be inert in quest scope");
  assert.strictEqual(g.curStage().name, "phase 1");

  // The run is the only thing that moves it.
  g.QUEST_RUNS["run-1"].phase = 2;
  assert.strictEqual(g.currentStepIndex(), 2);
  assert.strictEqual(g.curStage().name, "phase 3");
  assert.strictEqual(g.lessonStepIdx, 2, "…and the run was never mirrored back into it");
});

test("entering a quest scope does not carry a lesson step in", () => {
  const g = loadGame({ fresh: true });
  g.QUEST_RUNS = { "run-2": { phase: 1 } };

  g.setPlayScope({ kind: "package", packageId: "footsteps" }, { stepIdx: 3 });
  assert.strictEqual(g.lessonStepIdx, 3);

  g.setPlayScope(questScope("run-2"));
  assert.strictEqual(g.lessonStepIdx, 0, "the lesson index is reset, not reused as a phase");
  assert.strictEqual(g.currentStepIndex(), 1, "the phase comes from the run");
});

test("the Studio's palette is computed, not written into the catalog", () => {
  const g = loadGame({ fresh: true });
  g.setPlayScope({ kind: "studio" });

  assert.strictEqual(g.scopePalette(), g.widestPalette());
  assert.strictEqual(g.PACKAGES.studio.levels[0].palette, undefined,
    "openStudio used to mutate the shipped catalog entry to carry this");
});

test("a quest inherits no controls, palette or companion from a package", () => {
  const g = loadGame({ fresh: true });
  g.QUEST_RUNS = { "run-3": { phase: 0 } };

  g.setPlayScope({ kind: "package", packageId: "two-kinds-of-walking" });
  const pkgFeatures = [...g.scopeFeatures()];
  assert.strictEqual(pkgFeatures.length > 0, true, "a package does accumulate controls");

  g.setPlayScope(questScope("run-3"));                    // granted nothing
  assert.deepEqual([...g.scopeFeatures()], [], "a quest gets only what its workspace granted");
  assert.strictEqual(g.scopeCompanionRegion(), null, "no companion inherited from a prerequisite");
  assert.strictEqual(g.scopePalette(), "pentatonic", "its own workspace palette, not a package's");

  g.setPlayScope({ ...questScope("run-3"), palette: "diatonic", features: ["grow"] });
  assert.strictEqual(g.scopePalette(), "diatonic");
  assert.deepEqual([...g.scopeFeatures()], ["grow"]);
});

test("each scope owns a distinct toolbox key", () => {
  const g = loadGame({ fresh: true });
  g.QUEST_RUNS = { "run-4": { phase: 0 } };

  g.setPlayScope({ kind: "package", packageId: "twin-blooms" });
  const a = g.scopeToolboxOwner();
  g.setPlayScope({ kind: "studio" });
  const b = g.scopeToolboxOwner();
  g.setPlayScope(questScope("run-4"));
  const c = g.scopeToolboxOwner();

  assert.deepEqual([a, b, c], ["pkg:twin-blooms", "studio", "quest:run-4"]);
  assert.strictEqual(new Set([a, b, c]).size, 3, "one bag per scope — a shared key is the old global bag");
});

test("the autosave context keeps its shipped values so old rescues still match", () => {
  const g = loadGame({ fresh: true });
  g.QUEST_RUNS = { "run-5": { phase: 0 } };

  g.setPlayScope({ kind: "package", packageId: "intro" });
  assert.strictEqual(g.scopeAutosaveContext(), "intro");
  g.setPlayScope({ kind: "studio" });
  assert.strictEqual(g.scopeAutosaveContext(), "studio");
  g.setPlayScope(questScope("run-5"));
  assert.strictEqual(g.scopeAutosaveContext(), "quest:run-5");
});

test("every shipped package resolves exactly as it did before the migration", () => {
  const g = loadGame({ fresh: true });

  for (const id of Object.keys(g.PACKAGES)) {
    const def = g.PACKAGES[id];
    if (id === "studio") {
      g.setPlayScope({ kind: "studio" });
      assert.deepEqual(g.activeStages(), def.levels, "studio: stages");
      assert.strictEqual(g.scopeVisualRegion(), def.region || "first-garden", "studio: region");
      assert.strictEqual(g.scopePalette(), g.widestPalette(), "studio: palette");
      continue;
    }
    g.setPlayScope({ kind: "package", packageId: id });
    assert.deepEqual(g.activeStages(), def.levels, `${id}: stages`);
    assert.strictEqual(g.currentLevel(), def.levels[0], `${id}: first level identity`);
    assert.strictEqual(g.scopeVisualRegion(), def.region || "first-garden", `${id}: region`);
    assert.strictEqual(g.scopeCompanionRegion(), def.region || "first-garden", `${id}: companion region`);
    assert.strictEqual(g.scopePalette(), def.palette || def.levels[0].palette || "pentatonic", `${id}: palette`);
    assert.strictEqual(g.scopeCatalogId(), id, `${id}: catalog id`);
    assert.strictEqual(g.scopeToolboxOwner(), "pkg:" + id, `${id}: toolbox owner`);
    // features accumulate level by level, exactly as unlockedSet did over LEVELS
    const expected = new Set();
    (def.levels[0].unlock || []).forEach(f => expected.add(f));
    assert.deepEqual([...g.scopeFeatures()].sort(), [...expected].sort(), `${id}: level-0 features`);
  }
});
