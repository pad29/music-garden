// The sealed quest catalog.
//
// Quest definitions are DATA, never code — the level format is 247 `chk` closures and an authoring UI
// cannot emit JavaScript, so a player-facing Questmaker is only reachable if official quests travel
// the same declarative path from the start. These tests pin that path's front door.
//
// Each test names the mutation it must catch. A test that passes against correct code AND against the
// bug it claims to catch is a false proof; three of those have already been caught in this project.

import { test } from "node:test";
import assert from "node:assert";
import { loadGame } from "./harness.mjs";

const g = loadGame();

/** A minimal valid catalog, mutated per test. */
function catalog(mutate) {
  const def = JSON.parse(JSON.stringify(g.QUEST_DEFINITIONS["firefly-crossing"]));
  if (mutate) mutate(def);
  return JSON.stringify({ v: 1, definitions: [def] });
}
const loadInto = (game, json) => { game.loadQuestCatalog(json, "official"); return game; };
const codes = game => game.QUEST_CATALOG_ERRORS.map(e => e.code);

test("the shipped catalog validates, loads and is deep-frozen", () => {
  // MUTATION: corrupt any Firefly route id, witness reference or analyzer id.
  const g2 = loadGame({ fresh: true });
  assert.deepEqual(Object.keys(g2.QUEST_DEFINITIONS), ["firefly-crossing", "waking-woods"]);
  assert.deepEqual([...g2.QUEST_CATALOG_ERRORS], []);

  const fc = g2.QUEST_DEFINITIONS["firefly-crossing"];
  assert.strictEqual(Object.isFrozen(fc), true);
  assert.strictEqual(Object.isFrozen(fc.phases[0].challenge.routes[0].observations[0].params), true,
    "a shallow freeze would leave authored parameters mutable at runtime");
  assert.deepEqual(fc.phases.map(p => p.type), ["compose", "transform", "compare-offer"]);
});

test("one bad definition publishes an empty registry, not a partial catalog", () => {
  // MUTATION: install definitions as they validate instead of all-or-nothing.
  const g2 = loadGame({ fresh: true });
  loadInto(g2, catalog(d => { d.title = ""; }));
  assert.deepEqual(Object.keys(g2.QUEST_DEFINITIONS), [],
    "a half-installed quest is one that can strand a child mid-way");
  assert.strictEqual(g2.QUEST_CATALOG_ERRORS.length > 0, true);
});

test("an unknown key is rejected at every level of the grammar", () => {
  // MUTATION: ignore extra object keys instead of rejecting them.
  const g2 = loadGame({ fresh: true });
  const places = [
    d => { d.extra = 1; },
    d => { d.workspace.extra = 1; },
    d => { d.phases[0].extra = 1; },
    d => { d.phases[0].challenge.routes[0].extra = 1; },
    d => { d.phases[0].challenge.routes[0].observations[0].extra = 1; },
    d => { d.witnesses[0].extra = 1; },
    d => { d.presentation.extra = 1; },
  ];
  for (const [i, m] of places.entries()) {
    loadInto(g2, catalog(m));
    assert.strictEqual(codes(g2).includes("unknown-key"), true, "place " + i);
  }
});

test("an unknown schema version is refused, never treated as the newest one", () => {
  // MUTATION: fall back to the v1 validator for any unrecognised version.
  const g2 = loadGame({ fresh: true });
  loadInto(g2, catalog(d => { d.v = 7; }));   // 1 and 2 both ship; 7 is the one nobody wrote
  assert.strictEqual(codes(g2).includes("unsupported-schema-version"), true);
  assert.deepEqual(Object.keys(g2.QUEST_DEFINITIONS), []);
});

test("authored prose that could become markup or a URL is rejected", () => {
  // MUTATION: remove the text guard. renderStage writes levelTitle.innerHTML, so a quest title is
  // exactly the string that would reach it.
  const g2 = loadGame({ fresh: true });
  for (const bad of ["<img src=x>", "hello {0}", "see https://example.com", "a\\b",
                     "click javascript:alert(1)", "../secret", "tune.mp3"]) {
    loadInto(g2, catalog(d => { d.title = bad; }));
    assert.strictEqual(g2.QUEST_CATALOG_ERRORS.length > 0, true, JSON.stringify(bad));
    assert.deepEqual(Object.keys(g2.QUEST_DEFINITIONS), [], JSON.stringify(bad));
  }

  // The Home card's line is authored text too, and it reaches a different screen from the rest — so it
  // goes through the same guard, and is held to a card's length rather than a paragraph's.
  loadInto(g2, catalog(d => { d.presentation.cardText = "<b>look</b>"; }));
  assert.strictEqual(codes(g2).includes("unsafe-text"), true);
  loadInto(g2, catalog(d => { d.presentation.cardText = "x".repeat(61); }));
  assert.strictEqual(codes(g2).includes("text-length"), true);
  loadInto(g2, catalog(d => { delete d.presentation.cardText; }));
  assert.strictEqual(codes(g2).includes("missing-key"), true,
    "every quest owes the map a line of its own");
});

test("slugs and engine primitive ids use different grammars", () => {
  // MUTATION: accept a dotted primitive id wherever a content slug is required.
  const g2 = loadGame({ fresh: true });
  loadInto(g2, catalog(d => { d.id = "contour.any-of"; }));
  assert.strictEqual(codes(g2).includes("not-slug"), true, "a content id must not look like an engine primitive");

  loadInto(g2, catalog(d => { d.phases[0].challenge.routes[0].observations[0].analyzerId = "plainword"; }));
  assert.strictEqual(codes(g2).includes("not-primitive-id"), true, "an analyzer id must be dotted");

  loadInto(g2, catalog(d => { d.phases[0].challenge.routes[0].observations[0].analyzerId = "contour.anyOf"; }));
  assert.strictEqual(codes(g2).includes("not-primitive-id"), true,
    "camelCase is not the grammar — this is the exact id the design shipped with, and it was wrong");
});

test("a dangerous key cannot ride in through JSON.parse", () => {
  // MUTATION: drop the dangerous-key branch from the plain-JSON gate.
  const g2 = loadGame({ fresh: true });
  // JSON.parse creates a real own "__proto__" data property — the one poisoning route parse leaves open.
  g2.loadQuestCatalog('{"v":1,"definitions":[{"__proto__":{"polluted":true},"v":1}]}', "official");
  assert.strictEqual(codes(g2).includes("dangerous-key"), true);
  assert.strictEqual({}.polluted, undefined, "and nothing was polluted on the way past");
});

test("the gate refuses a getter without evaluating it", () => {
  // MUTATION: read properties directly instead of inspecting descriptors first.
  const g2 = loadGame({ fresh: true });
  let touched = false;
  const trap = { v: 1, definitions: [] };
  Object.defineProperty(trap, "definitions", { enumerable: true, configurable: true,
    get() { touched = true; return []; } });

  assert.throws(() => g2.assertPlainJsonTree(trap), e => e.code === "accessor");
  assert.strictEqual(touched, false, "discovering a getter by calling it is the bug");
});

test("the gate refuses values JSON could never produce", () => {
  // MUTATION: accept anything whose typeof is "object".
  const g2 = loadGame({ fresh: true });
  const cyc = { a: 1 }; cyc.self = cyc;
  const cases = [
    [{ f: () => 1 }, "not-plain-json"],
    [{ d: new Date() }, "bad-prototype"],
    [{ m: new Map() }, "bad-prototype"],
    [{ n: Number.POSITIVE_INFINITY }, "non-finite-number"],
    [{ n: NaN }, "non-finite-number"],
    [{ n: 2e12 }, "number-out-of-range"],
    [cyc, "too-deep"],
  ];
  for (const [v, code] of cases) {
    assert.throws(() => g2.assertPlainJsonTree(v), e => e.code === code, code);
  }
  const holed = [1]; holed[3] = 4;
  assert.throws(() => g2.assertPlainJsonTree({ a: holed }), e => e.code === "array-hole");
});

test("cross-references that D1 can resolve are checked, and only those", () => {
  // MUTATION: replace own-property checks with truthy prototype lookup (so "toString" resolves).
  const g2 = loadGame({ fresh: true });

  // "constructor" is the probe that matters: all-lowercase so it passes the slug grammar, and on
  // Object.prototype, so a truthy lookup would resolve it as a real package. ("toString" would not
  // reach this check at all — its capital S fails the slug rule first.)
  loadInto(g2, catalog(d => { d.prerequisites.earnedByPackageIds = ["constructor"]; }));
  assert.strictEqual(codes(g2).includes("no-such-package"), true);

  loadInto(g2, catalog(d => { d.prerequisites.earnedByPackageIds = ["studio"]; }));
  assert.strictEqual(codes(g2).includes("no-such-package"), true, "the Studio is not a prerequisite");

  loadInto(g2, catalog(d => { d.workspace.paletteId = "nope"; }));
  assert.strictEqual(codes(g2).includes("no-such-palette"), true);

  // GROOVES is an array whose indices are song state forever, so a definition names a feel and the
  // engine resolves it. A quest that asked for a shuffle and silently got straight eighths would
  // teach the wrong thing, so an unresolvable id is a catalog error rather than a fall back to 0.
  loadInto(g2, catalog(d => { d.workspace.grooveId = "shuffle"; }));
  assert.strictEqual(codes(g2).includes("no-such-groove"), true);

  loadInto(g2, catalog(d => { d.phases[0].challenge.routes[0].witnessIds = ["ghost"]; }));
  assert.strictEqual(codes(g2).includes("no-such-witness"), true);

  loadInto(g2, catalog(d => { d.witnesses[0].phaseId = "ghost-phase"; }));
  assert.strictEqual(codes(g2).includes("no-such-phase"), true);
});

test("a challenge must claim exactly the capabilities the quest does", () => {
  // MUTATION: check only that some claimed capability appears.
  const g2 = loadGame({ fresh: true });
  loadInto(g2, catalog(d => { d.phases[0].challenge.capabilityIds = ["melodic-contour", "melody-making"]; }));
  assert.strictEqual(codes(g2).includes("challenge-capabilities"), true);
});

test("the phases must be compose, transform, compare-offer in that order", () => {
  // MUTATION: validate each phase against its own declared type without checking position.
  const g2 = loadGame({ fresh: true });
  loadInto(g2, catalog(d => { const p = d.phases; d.phases = [p[1], p[0], p[2]]; }));
  assert.strictEqual(codes(g2).includes("phase-order"), true);
});

test("a route may carry at most two observations", () => {
  // MUTATION: raise or remove the ceiling — Q5 rule 3 is what stops a route becoming a checklist.
  const g2 = loadGame({ fresh: true });
  loadInto(g2, catalog(d => {
    const r = d.phases[0].challenge.routes[0];
    r.observations = [...r.observations, { analyzerId: "phrase.minimum-onsets", params: { minimum: 4 }, descriptorId: "way-contour-any" }];
  }));
  assert.strictEqual(codes(g2).includes("array-length"), true);
});

test("a challenge needs at least two routes", () => {
  // MUTATION: allow a single route — one "alternative" is a hidden single answer.
  const g2 = loadGame({ fresh: true });
  loadInto(g2, catalog(d => { d.phases[0].challenge.routes = [d.phases[0].challenge.routes[0]]; }));
  assert.strictEqual(codes(g2).includes("array-length"), true);
});

test("a reflection choice must match the versions being compared", () => {
  // MUTATION: skip the reflection/versionIds cross-check.
  const g2 = loadGame({ fresh: true });
  loadInto(g2, catalog(d => { d.phases[2].reflection.choices[1].id = "A"; }));
  assert.strictEqual(g2.QUEST_CATALOG_ERRORS.length > 0, true);
});

test("the catalog survives a JSON round-trip unchanged", () => {
  // MUTATION: retain a reference to the parsed source, or normalise non-deterministically.
  const g2 = loadGame({ fresh: true });
  const once = JSON.stringify(g2.QUEST_DEFINITIONS["firefly-crossing"]);
  g2.loadQuestCatalog(JSON.stringify({ v: 1, definitions: [JSON.parse(once)] }), "official");
  assert.strictEqual(JSON.stringify(g2.QUEST_DEFINITIONS["firefly-crossing"]), once);
});

test("packages and the Studio are untouched by a catalog failure", () => {
  // MUTATION: let a catalog error throw out of boot instead of publishing an empty registry.
  const g2 = loadGame({ fresh: true });
  g2.loadQuestCatalog("{ not json", "official");
  assert.deepEqual(Object.keys(g2.QUEST_DEFINITIONS), []);
  assert.strictEqual(g2.QUEST_CATALOG_ERRORS.length > 0, true);

  g2.setPlayScope({ kind: "package", packageId: "footsteps" });
  assert.strictEqual(g2.activePackageId(), "footsteps", "the game still plays");
});
