// The B1 persistence split: three owners, one sink.
//
// saveProgress() used to snapshot the global controls AND advance the package AND serialise, in one
// call. The snapshot was the bug: a control's live value is often something the game set — a package
// entry default, a groove's tempo, the Studio's unconditional guitar — and any later package save
// wrote it into progress.settings as though the player had chosen it. `tempoOnLoan` in index.html is
// a scar from that exact failure.
//
// These tests pin the property that replaces it: only saveUserSettings() may read a live control, and
// it is only ever called from an explicit player handler.

import { test } from "node:test";
import assert from "node:assert";
import { loadGame } from "./harness.mjs";

/** A game with a known settings block, so "did this get overwritten?" is answerable. */
function gameWithSettings(settings = { voice: "harp", tempo: 96, mix: { voice: 1, band: 1, drums: 1 }, speak: false }) {
  const g = loadGame({ fresh: true });
  g.progress.settings = JSON.parse(JSON.stringify(settings));
  return g;
}

test("package advancement never rewrites the player's settings", () => {
  const g = gameWithSettings();
  const before = JSON.parse(JSON.stringify(g.progress.settings));

  g.savePackageProgress();

  assert.deepEqual(g.progress.settings, before,
    "a package save that touched settings is how a programmatic default became a saved choice");
});

test("the commit sink never reads a live control", () => {
  const g = gameWithSettings();
  const before = JSON.parse(JSON.stringify(g.progress.settings));

  g.speakOn = !before.speak;          // the live control now disagrees with the saved value
  g.commitProgress();

  assert.deepEqual(g.progress.settings, before,
    "commitProgress must serialise what is already in progress, never sample the controls");
});

test("saveUserSettings is the only function that snapshots the controls", () => {
  const g = gameWithSettings({ voice: "harp", tempo: 96, mix: {}, speak: false });

  g.speakOn = true;
  g.saveUserSettings();

  assert.strictEqual(g.progress.settings.speak, true, "an explicit change is captured");
  assert.strictEqual(g.progress.settings.tempo, g.playerTempo(), "the tempo comes from playerTempo()");
});

test("a package save and a settings save touch disjoint parts of progress", () => {
  const g = gameWithSettings();
  g.progress.packages = {};

  g.savePackageProgress();
  const pkgAfterPackageSave = JSON.parse(JSON.stringify(g.progress.packages));
  const settingsBefore = JSON.parse(JSON.stringify(g.progress.settings));

  g.saveUserSettings();

  assert.deepEqual(g.progress.packages, pkgAfterPackageSave, "settings saves leave package state alone");
  assert.notDeepEqual(g.progress.settings, settingsBefore, "…and do rewrite settings");
});

test("package-only writes are refused outside a package, loudly", () => {
  const g = loadGame({ fresh: true });
  g.setPlayScope({ kind: "studio" });

  assert.throws(() => g.savePackageProgress(), /package scope required/,
    "the old early return hid wrong calls; these must fail instead");

  // And an invalid identity cannot even be entered — the setter is the only door.
  assert.throws(() => g.setPlayScope({ kind: "package", packageId: "not-a-real-package" }), /not a package/);
  assert.throws(() => g.setPlayScope({ kind: "package", packageId: "studio" }), /not a package/,
    "the Studio must never masquerade as a package");
});

test("the Studio persists no inventory, and a package does", () => {
  const g = loadGame({ fresh: true });
  const pkg = g.activePackageId();
  g.toolbox = [{ offs: [0, 4], midis: [60, 64] }];

  g.setPlayScope({ kind: "studio" });
  g.saveActiveInventory();
  assert.strictEqual(g.progress.packages.studio, undefined,
    "the Studio must never appear in progress.packages");

  g.setPlayScope({ kind: "package", packageId: pkg });
  g.toolbox = [{ offs: [0, 4], midis: [60, 64] }];
  g.saveActiveInventory();
  assert.deepEqual(g.progress.packages[pkg].toolbox, [{ offs: [0, 4], midis: [60, 64] }]);
});

test("a package save leaves other packages' bags untouched", () => {
  const g = loadGame({ fresh: true });
  g.progress.packages = { "twin-blooms": { level: 3, maxLevel: 3, completed: true, toolbox: [{ offs: [0, 3], midis: [60, 63] }] } };
  const other = JSON.parse(JSON.stringify(g.progress.packages["twin-blooms"]));

  g.toolbox = [{ offs: [0, 7], midis: [60, 67] }];
  g.savePackageProgress();

  assert.deepEqual(g.progress.packages["twin-blooms"], other,
    "the per-package toolbox invariant: one bag per package, never shared");
});

test("committing drops the vestigial root toolbox from a legacy profile", () => {
  const g = loadGame({ fresh: true });
  g.progress.toolbox = [{ offs: [0, 4], midis: [60, 64] }];      // pre-2026-06-20 global bag
  g.progress.packages = { intro: { level: 0, maxLevel: 0, completed: false, toolbox: [{ offs: [0, 7], midis: [60, 67] }] } };

  g.commitProgress();

  assert.strictEqual("toolbox" in g.progress, false, "the dead root key is removed");
  assert.deepEqual(g.progress.packages.intro.toolbox, [{ offs: [0, 7], midis: [60, 67] }],
    "per-package bags survive the cleanup");
});

test("saving the player's name touches nothing else", () => {
  const g = gameWithSettings();
  const settings = JSON.parse(JSON.stringify(g.progress.settings));

  g.savePlayerName("Ada");

  assert.strictEqual(g.progress.name, "Ada");
  assert.deepEqual(g.progress.settings, settings);
});
