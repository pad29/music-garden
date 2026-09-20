// The evaluator, and what the garden says back.
//
// `evaluateQuest` is the only thing that turns a definition, some evidence and a run into an answer,
// and it reads nothing live — no DOM, grid, audio, clock, Store or active scope. What it says is built
// from engine-owned descriptors: a definition may choose which of them a route names, but never the
// words. And nothing it produces is a score, a grade, or a "closest" route.
//
// Each test names the mutation it must catch. A test that passes against the correct code AND against
// the bug it claims to catch is a false proof.

import { test } from "node:test";
import assert from "node:assert";
import { loadGame } from "./harness.mjs";

const g = loadGame();
const DEF = g.QUEST_DEFINITIONS["firefly-crossing"];

const song = (mel, hits, over = {}) => ({
  v: 3, meta: { title: null, created: 0, updated: 0, author: null },
  palette: "pentatonic", time: { cols: 16, tempo: 108, groove: 0 },
  tracks: [
    { kind: "melody", voice: "musicbox", notes: mel.map(([p, c]) => ({ p, c, len: 1 })) },
    { kind: "drums", hits: hits.map(([lane, c]) => ({ lane, c })) },
  ],
  ...over,
});
const C4 = 60, D4 = 62, E4 = 64, G4 = 67;
const RISE = [[C4, 0], [D4, 2], [E4, 4], [G4, 6]];
const FALL = [[G4, 0], [E4, 2], [D4, 4], [C4, 6]];
const MAIN = [[0, 0], [0, 4], [0, 8], [0, 12]];
const EVEN = [0, 2, 4, 6, 8, 10, 12, 14].map(c => [0, c]);
const HATS = [0, 2, 4, 6, 8, 10, 12, 14].map(c => [2, c]);
const SPAN = { start: 0, end: 16 };

const evidenceOf = versions => {
  const out = {};
  for (const k of Object.keys(versions)) out[k] = g.songEvidence(versions[k]);
  return { versions: out };
};

/** Build a run by replaying real ops, so nothing here asserts against a hand-carved shape. */
function build(ops, over = {}) {
  let run = g.newQuestRun({ runId: "r1", questId: "firefly-crossing", definitionVersion: 2,
    song: song(RISE, MAIN), span: SPAN, at: 0, ...over });
  for (const op of ops) {
    const r = g.reduceQuestTransaction(run, [op]);
    assert.strictEqual(r.ok, true, op.type + ": " + r.code);
    run = r.run;
  }
  return run;
}
const heardA = { type: "completePass", versionId: "A", editRev: 0, sessionId: "s1", at: 1 };

// ============================ what it refuses to answer ============================

test("the evaluator answers only for the run and version it was handed", () => {
  // MUTATION: skip an identity check and evaluate whatever arrives.
  const ev = evidenceOf({ A: song(RISE, MAIN) });
  const run = build([]);

  assert.strictEqual(g.evaluateQuest(DEF, ev, { ...run, questId: "other" }).code, "wrong-quest");
  assert.strictEqual(g.evaluateQuest(DEF, ev, { ...run, definitionVersion: 3 }).code,
    "wrong-definition-version");
  assert.strictEqual(g.evaluateQuest(DEF, ev, { ...run, phase: 9 }).code, "no-phase");
  assert.strictEqual(g.evaluateQuest(DEF, { versions: {} }, run).code, "no-evidence");
  assert.strictEqual(g.evaluateQuest(DEF, { versions: { A: { valid: false, code: "not-v3" } } }, run).code,
    "no-evidence", "invalid evidence is not evidence");
});

test("a transform phase will not answer without the snapshot it compares against", () => {
  // MUTATION: require only the current version's evidence.
  const run = build([heardA,
    { type: "forkFrom", sourceVersionId: "A", sourceRev: 0, newVersionId: "B", at: 2 },
    { type: "_phase", to: 1, at: 3 }]);
  const only = g.evaluateQuest(DEF, evidenceOf({ B: song(FALL, MAIN) }), run);
  assert.strictEqual(only.code, "no-evidence");
  assert.strictEqual(only.extra, "A");
  assert.strictEqual(g.evaluateQuest(DEF, evidenceOf({ A: song(RISE, MAIN), B: song(FALL, MAIN) }), run).ok, true);
});

// ============================ what it reads ============================

test("the evaluation comes from the evidence, never from the live grid", () => {
  // MUTATION: call contourSeq() or read drumG instead of the evidence handed in.
  const g2 = loadGame({ fresh: true });
  g2.applySong(song(FALL, HATS));                    // the live document says fall + shimmer
  const run = g2.newQuestRun({ runId: "r1", questId: "firefly-crossing", definitionVersion: 2,
    song: song(RISE, MAIN), span: SPAN, at: 0 });
  const versions = {}; versions.A = g2.songEvidence(song(RISE, MAIN));
  const out = g2.evaluateQuest(g2.QUEST_DEFINITIONS["firefly-crossing"], { versions }, run);
  assert.strictEqual(out.ok, true);
  assert.deepEqual(out.musical.matchedRouteIds, ["main-beat-crossing"],
    "the live document's shimmer must not reach the answer");
  assert.strictEqual(out.musical.descriptorTokens.some(t => t.descriptorId === "heard-contour-rise"), true);
});

test("routes report which matched, and nothing that resembles a grade", () => {
  // MUTATION: add a score, a percentage, or a "closest route".
  const run = build([]);
  const out = g.evaluateQuest(DEF, evidenceOf({ A: song(FALL, EVEN) }), run);
  assert.strictEqual(out.ok, true);
  assert.deepEqual(out.musical.routes.map(r => r.routeId),
    ["main-beat-crossing", "even-walk-crossing", "shimmer-crossing"]);
  assert.deepEqual(out.musical.matchedRouteIds, ["even-walk-crossing"]);

  const banned = ["score", "percent", "percentage", "grade", "confidence", "closest", "rank", "best"];
  const seen = JSON.stringify(out).toLowerCase();
  for (const w of banned) assert.strictEqual(seen.includes(w), false, "found " + w);

  // an observation says whether IT matched, not how near it came
  const r0 = out.musical.routes[0];
  assert.deepEqual(r0.observations.map(o => [o.analyzerId, o.matched]),
    [["contour.any-of", true], ["pulse.kick-on-main-beats", false]]);
});

// ============================ what it says ============================

test("the description follows the music, not the question that was asked", () => {
  // MUTATION: derive the token from the analyzer id, or from whether the clause matched.
  // B kept A's rise, so "differs from the snapshot" did NOT match — and the honest description is
  // still that the lights kept their Rise shape, not a negation of the question.
  const run = build([heardA,
    { type: "forkFrom", sourceVersionId: "A", sourceRev: 0, newVersionId: "B", at: 2 },
    { type: "edit", target: "song", versionId: "B", baseRev: 0, song: song(RISE, EVEN), span: SPAN, at: 3 },
    { type: "_phase", to: 1, at: 4 }]);
  const out = g.evaluateQuest(DEF, evidenceOf({ A: song(RISE, MAIN), B: song(RISE, EVEN) }), run);
  assert.strictEqual(out.ok, true);

  const differs = out.musical.routes.find(r => r.routeId === "new-shape-same-heartbeat");
  assert.strictEqual(differs.observations[0].analyzerId, "contour.differs-from-snapshot");
  assert.strictEqual(differs.observations[0].matched, false);
  assert.deepEqual(differs.observations[0].descriptorTokens.map(t => t.text),
    ["The notes kept their Rise shape."]);

  const texts = out.musical.descriptorTokens.map(t => t.text);
  assert.strictEqual(texts.includes("The drums changed from main-beat kicks to even kick walk."),
    true, JSON.stringify(texts));
});

test("each distinct musical fact is said once, however many routes named it", () => {
  // MUTATION: skip the dedupe. All three phase-1 routes ask the same contour question, so a rise
  // would be announced three times over.
  const out = g.evaluateQuest(DEF, evidenceOf({ A: song(RISE, MAIN) }), build([]));
  const rises = out.musical.descriptorTokens.filter(t => t.descriptorId === "heard-contour-rise");
  assert.strictEqual(rises.length, 1);
  assert.deepEqual(out.musical.descriptorTokens.map(t => t.descriptorId),
    ["heard-contour-rise", "heard-pulse-main-kicks"]);
});

test("a song on two families is named in the engine's order, the same way every time", () => {
  // MUTATION: take whichever family the set happens to end with.
  // C-D-E-D-C is BOTH a hover and an arc under the shipped detectors — a genuine tie, and the sentence
  // has to name one of them. Which one is an engine choice, and it must not drift between renders.
  const ARCH = [[C4, 0], [D4, 2], [E4, 4], [D4, 6], [C4, 8]];
  assert.deepEqual(g.songEvidence(song(ARCH, MAIN)).contourFamilies, ["hover", "arc"],
    "the fixture must actually be ambiguous, or this test proves nothing");

  const run = build([heardA,
    { type: "forkFrom", sourceVersionId: "A", sourceRev: 0, newVersionId: "B", at: 2 },
    { type: "edit", target: "song", versionId: "B", baseRev: 0, song: song(ARCH, EVEN), span: SPAN, at: 3 },
    { type: "_phase", to: 1, at: 4 }]);
  const out = g.evaluateQuest(DEF, evidenceOf({ A: song(ARCH, MAIN), B: song(ARCH, EVEN) }), run);
  assert.strictEqual(out.musical.descriptorTokens.some(t => t.text === "The notes kept their Hover shape."),
    true, JSON.stringify(out.musical.descriptorTokens.map(t => t.text)));
});

test("a song the garden cannot name is said so, not passed over in silence", () => {
  // MUTATION: return an empty token list when no family is recognized.
  const out = g.evaluateQuest(DEF, evidenceOf({ A: song([[C4, 0]], []) }), build([]));
  assert.deepEqual(out.musical.descriptorTokens.map(t => t.descriptorId),
    ["heard-contour-unnamed", "heard-pulse-none"]);
  assert.deepEqual(out.musical.matchedRouteIds, []);
});

test("slot values are engine labels, and a slot that cannot be filled cancels the sentence", () => {
  // MUTATION: interpolate the raw enum id, or leave the brace in place when a slot is missing.
  assert.strictEqual(g.questTokenText({ id: "heard-contour-kept", slots: { contour: "rise" } }),
    "The notes kept their Rise shape.");
  // The same label has to read well in BOTH pulse templates. The design's "kept the {pulse} heartbeat"
  // produced "kept the main-beat kicks heartbeat", which is not a sentence to read to a six-year-old.
  assert.strictEqual(g.questTokenText({ id: "heard-pulse-kept", slots: { pulse: "main-beat-kicks" } }),
    "The drums kept their main-beat kicks.");
  assert.strictEqual(g.questTokenText({ id: "heard-pulse-changed",
    slots: { oldPulse: "main-beat-kicks", newPulse: "hat-shimmer" } }),
    "The drums changed from main-beat kicks to hi-hat shimmer.");

  assert.strictEqual(g.questTokenText({ id: "heard-contour-kept", slots: { contour: "nope" } }), null);
  assert.strictEqual(g.questTokenText({ id: "heard-contour-kept" }), null);
  assert.strictEqual(g.questTokenText({ id: "way-contour-any" }), null,
    "a way this could work is not something that was heard");
  assert.strictEqual(g.questTokenText({ id: "no-such-descriptor" }), null);
});

test("no analyzer can say something its own declared list does not allow", () => {
  // The receipt reducer refuses any token a phase's analyzers could not have produced. If describe()
  // can emit an id outside heardDescriptorIds, that refusal turns on the player: a real observation
  // from a real playback would be rejected. So walk EVERY family combination rather than trusting the
  // two lists were kept in step by hand.
  const subsets = list => {
    const out = [];
    for (let m = 0; m < (1 << list.length); m++)
      out.push(list.filter((_, i) => m & (1 << i)));
    return out;
  };
  for (const id of Object.keys(g.QUEST_PRIMITIVES)) {
    const prim = g.QUEST_PRIMITIVES[id];
    if (prim.kind !== "musical") continue;
    assert.strictEqual(Array.isArray(prim.heardDescriptorIds), true, id + " declares no heard list");
    const fams = prim.capabilityId === "melodic-contour" ? [...g.QUEST_CONTOUR_FAMILIES]
               : prim.capabilityId === "steady-pulse" ? [...g.QUEST_PULSE_FAMILIES] : [];
    const sets = subsets(fams);
    for (const cur of sets) for (const snap of sets) {
      for (const t of prim.describe({ families: cur, snapshotFamilies: snap, onsets: cur.length })) {
        assert.strictEqual(prim.heardDescriptorIds.includes(t.id), true,
          id + " said " + t.id + " for " + JSON.stringify([cur, snap]));
        assert.strictEqual(typeof g.questTokenText(t), "string",
          id + " produced an unrenderable token: " + JSON.stringify(t));
      }
    }
  }
});

test("ways this could work are the engine's phrases, one entry per route", () => {
  // MUTATION: read authored text, or collapse the routes into one.
  assert.deepEqual(g.questWays(DEF, "light-first-path"), [
    { routeId: "main-beat-crossing", phrases: ["a Rise, Fall, Hover, or Arc path", "a clean kick on every main beat"] },
    { routeId: "even-walk-crossing", phrases: ["a Rise, Fall, Hover, or Arc path", "an even kick walk, all the way across"] },
    { routeId: "shimmer-crossing", phrases: ["a Rise, Fall, Hover, or Arc path", "a steady hi-hat shimmer, all the way across"] },
  ]);
  assert.deepEqual(g.questWays(DEF, "choose-crossing"), [], "a compare phase has no routes to offer");
});

// ============================ the procedural half ============================

test("advancing is the AND of the phase's own declared gates, and blockers name the shut ones", () => {
  // MUTATION: gate on a route match, or invent a blocker the phase never declared.
  const unheard = g.evaluateQuest(DEF, evidenceOf({ A: song(RISE, MAIN) }), build([]));
  assert.strictEqual(unheard.procedural.canAdvance, false);
  assert.deepEqual(unheard.procedural.blockers, ["playback.complete-since-last-edit"]);

  const heard = g.evaluateQuest(DEF, evidenceOf({ A: song(RISE, MAIN) }), build([heardA]));
  assert.strictEqual(heard.procedural.canAdvance, true);
  assert.deepEqual(heard.procedural.blockers, []);

  // a song that matches NO route still advances: Q6's "offer anyway" has no route-match input
  const noRoute = g.evaluateQuest(DEF, evidenceOf({ A: song([[C4, 0]], []) }), build([heardA]));
  assert.deepEqual(noRoute.musical.matchedRouteIds, []);
  assert.strictEqual(noRoute.procedural.canAdvance, true);
});

test("every blocker is a gate the phase declared, and nothing else", () => {
  // MUTATION: push a musical or ad-hoc condition into blockers — emptiness is the tempting one, and
  // an EMPTY version is the only fixture that can tell the difference.
  for (const [phase, run, ev] of [
    [0, build([]), evidenceOf({ A: song([], []) })],
    [1, build([heardA, { type: "forkFrom", sourceVersionId: "A", sourceRev: 0, newVersionId: "B", at: 2 },
               { type: "_phase", to: 1, at: 3 }]), evidenceOf({ A: song(RISE, MAIN), B: song(RISE, MAIN) })],
  ]) {
    const out = g.evaluateQuest(DEF, ev, run);
    assert.strictEqual(out.ok, true);
    const declared = DEF.phases[phase].procedure.gateIds;
    for (const b of out.procedural.blockers)
      assert.strictEqual(declared.includes(b), true, b + " is not a gate of phase " + phase);
  }
});

test("no empty version can hold the playback gate open", () => {
  // This is the claim that lets `nonempty` be REPORTED rather than gated: adding it to canAdvance
  // would be a condition that cannot be false whenever the playback gate is open, which is the kind of
  // check that looks like safety and proves nothing. If this test ever fails, that reasoning is wrong
  // and `nonempty` has to become a real gate.
  const empty = song([], []);
  const fresh = g.newQuestRun({ runId: "r1", questId: "firefly-crossing", definitionVersion: 2,
    song: empty, span: SPAN, at: 0 });

  // 1. an empty song cannot be credited in the first place
  assert.strictEqual(g.reduceQuestRun(fresh, heardA).code, "empty-song");

  // 1b. and "empty" means what a player would HEAR, not how many entries the note list has.
  // Found by GPT's tester: a note at column 16 of a 16-column song is dropped by applySong and heard
  // by nobody, yet the old check counted it and handed out a playback credit for silence.
  const silent = song([[C4, 16]], []);
  assert.strictEqual(g.songEvidence(silent).nonempty, false);
  const silentRun = g.newQuestRun({ runId: "r1", questId: "firefly-crossing", definitionVersion: 2,
    song: silent, span: SPAN, at: 0 });
  assert.strictEqual(g.reduceQuestRun(silentRun, heardA).code, "empty-song");

  // 2. and emptying a credited one bumps the revision, which shuts the gate again
  const heard = build([heardA]);
  assert.strictEqual(g.playbackCompleteSinceLastEdit(heard, "A"), true);
  const emptied = g.reduceQuestTransaction(heard,
    [{ type: "edit", target: "song", versionId: "A", baseRev: 0, song: empty, span: SPAN, at: 2 }]);
  assert.strictEqual(emptied.ok, true);
  assert.strictEqual(g.playbackCompleteSinceLastEdit(emptied.run, "A"), false);

  const out = g.evaluateQuest(DEF, evidenceOf({ A: empty }), emptied.run);
  assert.strictEqual(out.procedural.nonempty, false, "and the emptiness is still reported");
  assert.strictEqual(out.procedural.canAdvance, false);
});

test("offering belongs to the last phase and advancing to the others", () => {
  // MUTATION: let canAdvance and canOffer both be true, so the shell could show two exits.
  const first = g.evaluateQuest(DEF, evidenceOf({ A: song(RISE, MAIN) }), build([heardA]));
  assert.strictEqual(first.procedural.canOffer, false);
  assert.strictEqual(first.procedural.canAdvance, true);

  const done = build([heardA, { type: "audition", versionId: "A", editRev: 0, sessionId: "s1", at: 2 },
    { type: "forkFrom", sourceVersionId: "A", sourceRev: 0, newVersionId: "B", at: 3 },
    { type: "edit", target: "song", versionId: "B", baseRev: 0, song: song(FALL, MAIN), span: SPAN, at: 4 },
    { type: "completePass", versionId: "B", editRev: 1, sessionId: "s2", at: 5 },
    { type: "audition", versionId: "B", editRev: 1, sessionId: "s2", at: 6 },
    { type: "_phase", to: 1, at: 7 }, { type: "_phase", to: 2, at: 8 },
    { type: "compare", leftVersionId: "A", rightVersionId: "B", at: 9 },
    { type: "selectDraft", versionId: "B", at: 10 }]);
  const last = g.evaluateQuest(DEF, evidenceOf({ A: song(RISE, MAIN), B: song(FALL, MAIN) }), done);
  assert.strictEqual(last.ok, true);
  assert.strictEqual(last.currentVersionId, "B", "the chosen version is the one being offered");
  assert.strictEqual(last.procedural.canOffer, true);
  assert.strictEqual(last.procedural.canAdvance, false);
  assert.deepEqual(last.musical.routes, [], "a compare phase judges no music");
});

// ============================ persisting what was heard ============================

const OBS = { type: "recordObservation", phaseId: "light-first-path", versionId: "A", editRev: 0,
  sessionId: "s1", matchedRouteIds: ["main-beat-crossing"],
  descriptorTokens: [{ id: "heard-contour-rise" }, { id: "heard-pulse-main-kicks" }], at: 2 };

test("an observation is only accepted for a pass that was actually credited", () => {
  // MUTATION: accept the observation on its own, or against a stale revision.
  const fresh = build([]);
  assert.strictEqual(g.reduceQuestRun(fresh, OBS).code, "not-heard",
    "a description with no completed playback behind it is a claim, not a receipt");

  const heard = build([heardA]);
  assert.strictEqual(g.reduceQuestRun(heard, { ...OBS, sessionId: "other" }).code, "not-heard");
  assert.strictEqual(g.reduceQuestRun(heard, { ...OBS, editRev: 1 }).code, "stale-rev");
  assert.strictEqual(g.reduceQuestRun(heard, OBS).ok, true);
});

test("an observation may only name routes and descriptors its own definition declares", () => {
  // MUTATION: store the payload as given.
  const heard = build([heardA]);
  const bad = [
    [{ matchedRouteIds: ["ghost-route"] }, "unknown-route"],
    [{ matchedRouteIds: ["new-shape-same-heartbeat"] }, "unknown-route"],   // a route of ANOTHER phase
    [{ descriptorTokens: [{ id: "no-such" }] }, "unknown-descriptor"],
    [{ descriptorTokens: [{ id: "way-contour-any" }] }, "unknown-descriptor"],
    // phase 1 has no snapshot, so its analyzers can never report a comparison — a forged one
    // is refused before its slots are even looked at
    [{ descriptorTokens: [{ id: "heard-contour-kept", slots: { contour: "rise" } }] }, "descriptor-unreachable"],
    [{ descriptorTokens: [{ id: "heard-contour-rise", slots: { contour: "rise" } }] }, "unknown-slot"],
    [{ phaseId: "no-such-phase" }, "wrong-phase"],
    [{ phaseId: "choose-crossing" }, "wrong-phase"],   // a real phase, but not the one the run is on
    [{ versionId: "B" }, "no-version"],
    [{ descriptorTokens: new Array(9).fill({ id: "heard-contour-rise" }) }, "bad-payload"],
  ];
  for (const [over, code] of bad)
    assert.strictEqual(g.reduceQuestRun(heard, { ...OBS, ...over }).code, code, code);
});

test("a comparison receipt is refused unless the run is on a phase that can make one", () => {
  // MUTATION: check that the phase exists rather than that it is the run's current phase.
  // A phase-1 pass could otherwise write a phase-3 observation before B exists at all.
  const atTwo = build([heardA,
    { type: "forkFrom", sourceVersionId: "A", sourceRev: 0, newVersionId: "B", at: 2 },
    { type: "edit", target: "song", versionId: "B", baseRev: 0, song: song(FALL, MAIN), span: SPAN, at: 3 },
    { type: "completePass", versionId: "B", editRev: 1, sessionId: "s2", at: 4 },
    { type: "_phase", to: 1, at: 5 }]);
  const kept = { type: "recordObservation", phaseId: "another-way-across", versionId: "B", editRev: 1,
    sessionId: "s2", matchedRouteIds: ["new-shape-same-heartbeat"],
    descriptorTokens: [{ id: "heard-contour-changed", slots: { oldContour: "rise", newContour: "fall" } }], at: 6 };
  assert.strictEqual(g.reduceQuestRun(atTwo, kept).ok, true, "phase 2 CAN report a comparison");
  assert.strictEqual(g.reduceQuestRun(atTwo, { ...kept, phaseId: "light-first-path" }).code, "wrong-phase");
  assert.strictEqual(g.reduceQuestRun(atTwo,
    { ...kept, descriptorTokens: [{ id: "heard-contour-changed", slots: { oldContour: "rise" } }] }).code,
    "missing-slot", "half a comparison is not a sentence");
  assert.strictEqual(g.reduceQuestRun(atTwo, { ...kept,
    descriptorTokens: [{ id: "heard-contour-changed", slots: { oldContour: "spiral", newContour: "fall" } }] }).code,
    "bad-slot-value", "a slot value must be an engine enum, not a word someone chose");
});

test("the description rides in the same transaction as the credit it belongs to", () => {
  // MUTATION: write the observation in its own transaction, so a failed write could leave a
  // description attached to playback that never got credited (or the reverse).
  let run = g.newQuestRun({ runId: "r1", questId: "firefly-crossing", definitionVersion: 2,
    song: song(RISE, MAIN), span: SPAN, at: 0 });
  const both = g.reduceQuestTransaction(run, [heardA, OBS]);
  assert.strictEqual(both.ok, true);
  assert.strictEqual(both.run.evidence.observations["light-first-path"].versionId, "A");

  // and the whole transaction is refused when the credit in it is not valid
  const neither = g.reduceQuestTransaction(run, [{ ...heardA, editRev: 5 }, OBS]);
  assert.strictEqual(neither.ok, false);
  assert.strictEqual(neither.run, run, "nothing partial survived");
});

test("what was heard is stored as ids and slots, so a later rewording reaches an old run", () => {
  // MUTATION: persist the rendered sentence. A copy edit would then never reach runs saved before it.
  // A slotted descriptor is only reachable from phase 2, where there is a snapshot to compare against.
  const atTwo = build([heardA,
    { type: "forkFrom", sourceVersionId: "A", sourceRev: 0, newVersionId: "B", at: 2 },
    { type: "edit", target: "song", versionId: "B", baseRev: 0, song: song(RISE, EVEN), span: SPAN, at: 3 },
    { type: "completePass", versionId: "B", editRev: 1, sessionId: "s2", at: 4 },
    { type: "_phase", to: 1, at: 5 }]);
  const run = g.reduceQuestTransaction(atTwo, [{ type: "recordObservation", phaseId: "another-way-across",
    versionId: "B", editRev: 1, sessionId: "s2", matchedRouteIds: ["same-shape-new-heartbeat"],
    descriptorTokens: [{ id: "heard-contour-kept", slots: { contour: "rise" } }], at: 6 }]).run;
  const stored = run.evidence.observations["another-way-across"].descriptorTokens[0];
  assert.deepEqual(stored, { id: "heard-contour-kept", slots: { contour: "rise" } });
  assert.strictEqual("text" in stored, false, "wording must not be frozen into the save");

  assert.deepEqual(g.questObservationFor(run, "another-way-across").descriptorTokens,
    [{ descriptorId: "heard-contour-kept", slots: { contour: "rise" }, text: "The notes kept their Rise shape." }]);
  assert.strictEqual(g.questObservationFor(run, "choose-crossing"), null);
});

test("a description is never allowed to cost the player their credit", () => {
  // MUTATION: record an observation whatever the phase or version, or let a failed evaluation throw.
  // recordObservation refuses a phase with no challenge, a version the phase does not own, and an
  // unevaluable run — and because the receipt is ONE transaction, a refusal there would take the
  // playback credit down with it. So the sink must decline to describe, not decline to credit.
  const g2 = loadGame({ fresh: true });
  const mk = (id, run) => { g2.QUEST_RUNS = { ...g2.QUEST_RUNS, [id]: run }; return run; };
  const base = () => g2.newQuestRun({ runId: "rx", questId: "firefly-crossing", definitionVersion: 2,
    song: song(RISE, MAIN), span: SPAN, at: 0 });
  const toPhaseTwo = ops => {
    let run = base();
    for (const op of [{ type: "completePass", versionId: "A", editRev: 0, sessionId: "s1", at: 1 },
                      { type: "audition", versionId: "A", editRev: 0, sessionId: "s1", at: 1 },
                      { type: "forkFrom", sourceVersionId: "A", sourceRev: 0, newVersionId: "B", at: 2 },
                      { type: "edit", target: "song", versionId: "B", baseRev: 0, song: song(FALL, MAIN), span: SPAN, at: 3 },
                      { type: "_phase", to: 1, at: 4 }, ...ops]) {
      const r = g2.reduceQuestTransaction(run, [op]);
      assert.strictEqual(r.ok, true, op.type + ": " + r.code);
      run = r.run;
    }
    return run;
  };

  // auditioning A while phase 2 is about B: credit lands, nothing is described
  mk("rx", toPhaseTwo([]));
  g2.onCompletePass({ runId: "rx", versionId: "A", editRev: 0, sessionId: "sA", purpose: "audition" });
  assert.strictEqual(g2.QUEST_RUNS.rx.versions.A.lastCompletePlaySessionId, "sA", "the pass was credited");
  assert.strictEqual(g2.QUEST_RUNS.rx.evidence.observations, undefined, "and nothing was described");

  // the compare phase judges no music at all
  mk("rx", toPhaseTwo([{ type: "completePass", versionId: "B", editRev: 1, sessionId: "s2", at: 5 },
                       { type: "audition", versionId: "B", editRev: 1, sessionId: "s2", at: 5 },
                       { type: "_phase", to: 2, at: 6 }]));
  g2.onCompletePass({ runId: "rx", versionId: "B", editRev: 1, sessionId: "s3", purpose: "play" });
  assert.strictEqual(g2.QUEST_RUNS.rx.versions.B.lastCompletePlaySessionId, "s3");
  assert.strictEqual(g2.QUEST_RUNS.rx.evidence.observations, undefined);

  // a run whose snapshot no longer analyses — a corrupt store is the reachable way in — still credits
  const corrupt = toPhaseTwo([]);
  corrupt.versions.A = { ...corrupt.versions.A, song: { ...corrupt.versions.A.song, v: 2 } };
  mk("rx", corrupt);
  g2.onCompletePass({ runId: "rx", versionId: "B", editRev: 1, sessionId: "s9", purpose: "play" });
  assert.strictEqual(g2.QUEST_RUNS.rx.versions.B.lastCompletePlaySessionId, "s9",
    "an evaluation that cannot be made must not swallow the pass that was heard");
  assert.strictEqual(g2.QUEST_RUNS.rx.evidence.observations, undefined);
});

test("a receipt names the version its phase is about", () => {
  // MUTATION: drop the version check, so a phase-2 receipt could describe A's music as if it were B's.
  const atTwo = build([heardA,
    { type: "forkFrom", sourceVersionId: "A", sourceRev: 0, newVersionId: "B", at: 2 },
    { type: "edit", target: "song", versionId: "B", baseRev: 0, song: song(FALL, MAIN), span: SPAN, at: 3 },
    { type: "completePass", versionId: "B", editRev: 1, sessionId: "s2", at: 4 },
    { type: "_phase", to: 1, at: 5 }]);
  const forA = { type: "recordObservation", phaseId: "another-way-across", versionId: "A", editRev: 0,
    sessionId: "s1", matchedRouteIds: [], descriptorTokens: [], at: 6 };
  assert.strictEqual(g.reduceQuestRun(atTwo, forA).code, "wrong-version");
  assert.strictEqual(g.reduceQuestRun(atTwo, { ...forA, versionId: "B", editRev: 1, sessionId: "s2" }).ok, true);
});

test("a resumed run still says what it last heard", () => {
  // MUTATION: keep observations in memory only, so leaving the garden forgets them.
  const g2 = loadGame({ fresh: true });
  const run = g2.newQuestRun({ runId: "r9", questId: "firefly-crossing", definitionVersion: 2,
    song: song(RISE, MAIN), span: SPAN, at: 0 });
  g2.QUEST_RUNS[run.runId] = run;
  assert.strictEqual(g2.transactQuestRun("r9", [heardA, OBS]).ok, true);

  g2.hydrateQuestRuns();                                  // as if the page had been closed and reopened
  const back = g2.questObservationFor(g2.QUEST_RUNS["r9"], "light-first-path");
  assert.deepEqual(back.matchedRouteIds, ["main-beat-crossing"]);
  assert.deepEqual(back.descriptorTokens.map(t => t.text),
    ["The notes climbed.", "The drum stepped on every main beat."]);
});
