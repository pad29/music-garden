// The authoring boundary: every id a definition writes must name something the engine resolves.
//
// The whole-slice design review found the hole these tests close. The schema accepted a family of
// behaviour-bearing ids — controls, tool grants, transitions, the completion action and payoff, the
// presentation tokens — that NOTHING looked up. A definition inventing all of them published with zero
// catalog errors, opened, withheld the drum its own routes needed, and dead-ended on its first button.
// Official content passed only because a human happened to write the right words, which is a quieter
// form of the privileged trust the declarative format exists to remove.
//
// The other half is QUESTS.md Q9's authorability acceptance test: a second working Guided Commission
// added as declarative data and no engine branch. `waking-woods` is that second commission, and the
// last section here plays it end to end.
//
// Each test names the mutation it must catch. A test that passes against correct code AND against the
// bug it claims to catch is a false proof.

import { test } from "node:test";
import assert from "node:assert";
import { loadQuestGame as loadGame, completeDealtSong, loadNoLoopWoods } from "./helpers/quest-fixtures.mjs";
import { withBeatNotes } from "./helpers/quest-h-fixtures.mjs";

const g = loadGame();

const song = (mel, hits, over = {}) => ({
  v: 3, meta: { title: null, created: 0, updated: 0, author: null },
  palette: "pentatonic", time: { cols: 16, tempo: 108, groove: 0 },
  tracks: [
    { kind: "melody", voice: "musicbox", notes: mel.map(([p, c]) => ({ p, c, len: 1 })) },
    { kind: "drums", hits: hits.map(([lane, c]) => ({ lane, c })) },
  ],
  ...over,
});
const RISE = [[60, 0], [62, 2], [64, 4], [67, 6]];
const FALL = [[67, 0], [64, 2], [62, 4], [60, 6]];
const MAIN = [[0, 0], [0, 4], [0, 8], [0, 12]];
const EVEN = [0, 2, 4, 6, 8, 10, 12, 14].map(c => [0, c]);

/** The shipped Firefly, deep-cloned and mutated per test, loaded on its own. */
const clone = id => JSON.parse(JSON.stringify(g.QUEST_DEFINITIONS[id]));
function load(mutate, source = "official", id = "firefly-crossing") {
  const def = clone(id);
  if (mutate) mutate(def);
  const g2 = loadGame({ fresh: true });
  g2.loadQuestCatalog(JSON.stringify({ v: 1, definitions: [def] }), source);
  return g2;
}
const codes = game => game.QUEST_CATALOG_ERRORS.map(e => e.code);
const route = (d, phase, i) => d.phases[phase].challenge.routes[i];

// ======================= the ids that used to resolve to nothing =======================

test("a definition inventing every behaviour-bearing id is refused, not published", () => {
  // MUTATION: drop any one of the registry lookups in questSemantics.
  // This is the design review's own probe, verbatim. It used to publish with ZERO catalog errors,
  // open, withhold the drums its routes need, and dead-end at not-a-transition on the first button.
  const g2 = load(d => {
    d.workspace.controlIds = ["melody"];
    d.workspace.toolGrants = [{ toolId: "stamp.stable-tower", capabilityId: "melodic-contour" }];
    d.phases[0].procedure.transitionId = "leap-forward";
    d.completion.actionId = "publish-to-the-world";
    d.completion.payoffId = "a-trophy";
    d.presentation.themeId = "sunset-vista";
    d.presentation.regionId = "atlantis";
    d.prerequisites.earnedByPackageIds = ["intro"];
  });
  assert.deepEqual(Object.keys(g2.QUEST_DEFINITIONS), [],
    "an unresolvable id must stop the catalog, not the child");
  const got = codes(g2);
  for (const want of ["no-such-control", "no-such-tool", "no-such-transition",
                      "no-such-completion-action", "no-such-payoff", "no-such-theme",
                      "no-such-region", "capability-not-earned", "analyzer-control-not-granted",
                      "tool-capability-not-earned"])
    assert.strictEqual(got.includes(want), true, "missing " + want + " in " + got.join(","));
});

test("a control the engine does not open cannot be granted", () => {
  // MUTATION: accept any slug as a control id.
  // The shipped list used to name melody, playback, voice, tempo, mixer, undo, redo and room. Not one
  // of them reached renderLevel(): the definition was claiming credit for what it did not give.
  assert.deepEqual(Object.keys(g.QUEST_CONTROLS).sort(),
    ["drums", "fuse", "grow", "jam", "loop", "more", "room"]);
  assert.strictEqual(codes(load(d => { d.workspace.controlIds = ["drums", "mixer"]; }))
    .includes("no-such-control"), true);
  // and every id the shipped catalog grants is one scopeFeatures() actually honours
  for (const id of Object.keys(g.QUEST_DEFINITIONS))
    for (const c of g.QUEST_DEFINITIONS[id].workspace.controlIds)
      assert.strictEqual(Object.prototype.hasOwnProperty.call(g.QUEST_CONTROLS, c), true, id + ": " + c);
});

test("a route may not ask for music the workspace gave no control to make", () => {
  // MUTATION: drop requiredControlIds, or check it against the capabilities instead of the workspace.
  // Asking a child for a heartbeat in a workspace with no drum bed is a quest that opens and cannot be
  // finished. The grammar allows an empty control list precisely so this check has to do the work.
  const g2 = load(d => { d.workspace.controlIds = []; });
  assert.deepEqual(Object.keys(g2.QUEST_DEFINITIONS), []);
  assert.strictEqual(codes(g2).includes("analyzer-control-not-granted"), true);

  // the requirement is declared per analyzer, not guessed from its id
  assert.deepEqual(g.QUEST_PRIMITIVES["pulse.even-walk"].requiredControlIds, ["drums"]);
  assert.deepEqual(g.QUEST_PRIMITIVES["contour.any-of"].requiredControlIds, []);
  assert.deepEqual(g.QUEST_PRIMITIVES["phrase.minimum-onsets"].requiredControlIds, []);
});

test("a quest may only claim a power its own prerequisites teach", () => {
  // MUTATION: check capabilityIds against the registry alone, as it did before.
  // A quest claiming steady-pulse behind the intro package alone reaches a child who has never been
  // shown a drum — eligibility would open it, and the routes would ask for a heartbeat anyway.
  const g2 = load(d => { d.prerequisites.earnedByPackageIds = ["follow-the-fireflies"]; });
  assert.deepEqual(Object.keys(g2.QUEST_DEFINITIONS), []);
  assert.strictEqual(codes(g2).includes("capability-not-earned"), true);
  // …and the shipped catalog satisfies it, for every quest and every capability
  for (const id of Object.keys(g.QUEST_DEFINITIONS)) {
    const d = g.QUEST_DEFINITIONS[id];
    for (const cap of d.capabilityIds)
      for (const pkg of g.QUEST_CAPABILITIES[cap].earnedByPackageIds)
        assert.strictEqual(d.prerequisites.earnedByPackageIds.includes(pkg), true, id + ": " + cap);
  }
});

test("a transition must exist, and must belong to the phase type that carries it", () => {
  // MUTATION: validate the id's existence but not the phase type it may end.
  // A compose phase carrying "offer" would have nothing to fork to; a comparison carrying
  // "fork-version" would fork a version nobody asked for.
  assert.strictEqual(codes(load(d => { d.phases[1].procedure.transitionId = "sidestep"; }))
    .includes("no-such-transition"), true);
  assert.strictEqual(codes(load(d => { d.phases[0].procedure.transitionId = "offer"; }))
    .includes("transition-wrong-phase"), true);
  assert.strictEqual(codes(load(d => { d.phases[2].procedure.transitionId = "advance"; }))
    .includes("transition-wrong-phase"), true);
});

test("the completion action names a transition some phase actually carries", () => {
  // MUTATION: check the action id against the registry but not against the phases.
  // An action naming a transition no phase carries is a quest whose last button leads nowhere, and a
  // child's finished song can never be put away.
  assert.strictEqual(codes(load(d => { d.completion.actionId = "mail-it-home"; }))
    .includes("no-such-completion-action"), true);
  assert.strictEqual(codes(load(d => { d.phases[2].procedure.transitionId = "advance";
                                       d.completion.actionId = "offer-song"; }))
    .includes("completion-unreachable"), true);
});

test("the offer action asks the definition which transition ends the quest", () => {
  // MUTATION: compare the phase's transitionId to the literal "offer" again.
  // With the literal back, completion.actionId is a word nobody reads and the registry entry that
  // binds an action to a transition can be deleted without a test noticing.
  assert.deepEqual(g.QUEST_COMPLETION_ACTIONS["offer-song"], { transitionId: "offer" });
  assert.strictEqual(Object.isFrozen(g.QUEST_COMPLETION_ACTIONS), true);
  assert.strictEqual(g.QUEST_TRANSITIONS["offer"].phaseType, "compare-offer");
  assert.strictEqual(g.QUEST_TRANSITIONS["offer"].ops, null, "offering finalises; it advances nothing");
  assert.strictEqual(g.QUEST_TRANSITIONS["fork-version"].phaseType, "compose");
  assert.strictEqual(g.QUEST_TRANSITIONS["advance"].phaseType, "transform");
});

test("no tool is grantable in this build, and an empty registry says so out loud", () => {
  // MUTATION: skip the toolGrants loop, or treat an empty registry as "allow anything".
  // Q10's Quest Tray is a shape the format keeps; a definition promising a stamp that never arrives is
  // worse than one that cannot ask.
  assert.deepEqual(Object.keys(g.QUEST_TOOLS), []);
  assert.strictEqual(codes(load(d => {
    d.workspace.toolGrants = [{ toolId: "stamp.anything", capabilityId: "steady-pulse" }];
  })).includes("no-such-tool"), true);
  // Q10: the capability authorising a grant need not be one of the quest's own two — its example
  // grants a stable-tower stamp after `standing-towers` — but the player must have EARNED it, or the
  // quest hands out a tool for a lesson they have never had.
  const got = codes(load(d => {
    d.workspace.toolGrants = [{ toolId: "stamp.anything", capabilityId: "melody-making" }];
  }));
  assert.strictEqual(got.includes("tool-capability-not-earned"), true, got.join(","));
  // …and one the prerequisites DO earn passes that check, failing only on the empty tool registry
  const earned = codes(load(d => {
    d.workspace.toolGrants = [{ toolId: "stamp.anything", capabilityId: "steady-pulse" }];
  }));
  assert.strictEqual(earned.includes("tool-capability-not-earned"), false, earned.join(","));
});

test("presentation tokens name a real theme and a real land", () => {
  // MUTATION: accept any slug for themeId or regionId.
  assert.strictEqual(codes(load(d => { d.presentation.themeId = "chartreuse"; }))
    .includes("no-such-theme"), true);
  assert.strictEqual(codes(load(d => { d.presentation.regionId = "atlantis"; }))
    .includes("no-such-region"), true);
  // an icon id beside a theme id was a second name for the same look, and only one was ever read
  assert.strictEqual("iconId" in g.QUEST_DEFINITIONS["firefly-crossing"].presentation, false);
});

// ======================= who says this content is official =======================

test("the source context decides whether a definition is official, not the definition", () => {
  // MUTATION: default sourceKind to "official", or drop the comparison.
  // A definition calls itself official. Only the path it arrived on can know whether that is true, so
  // a player's import must not be able to promote itself by writing a word — and the built-in catalog
  // must not get a shorter path to trust than that import would.
  const g2 = loadGame({ fresh: true });
  g2.loadQuestCatalog(JSON.stringify({ v: 1, definitions: [clone("firefly-crossing")] }));
  assert.deepEqual(Object.keys(g2.QUEST_DEFINITIONS), []);
  assert.strictEqual(codes(g2).includes("no-source-kind"), true, "a caller must state where this came from");

  assert.strictEqual(codes(load(null, "player")).includes("author-kind-mismatch"), true,
    "official content arriving on the player path is refused");
  assert.strictEqual(codes(load(d => { d.author.kind = "player"; }, "official"))
    .includes("author-kind-mismatch"), true,
    "…and a player definition cannot ride in on the official one either");

  // the same definition, on the path that matches its claim, loads
  const g3 = load(d => { d.author.kind = "player"; d.author.id = "someone"; }, "player");
  assert.deepEqual(Object.keys(g3.QUEST_DEFINITIONS), ["firefly-crossing"]);
});

// ======================= reachable, not merely satisfiable =======================

test("a witness must be a song the declared workspace could actually produce", () => {
  // MUTATION: check witnesses with songEvidence alone, as before.
  // Satisfiability is not reachability: a witness leaning on drums the quest withholds, on a pitch the
  // palette cannot place, or on another field width proves a route reachable in a workspace that does
  // not exist. The route would then be provably reachable and unreachable at the same time.
  const bad = mutate => codes(load(d => { mutate(d.witnesses[0].songs.A); }));
  assert.strictEqual(bad(s => { s.tracks[0].notes[0].p = 61; }).includes("witness-unreachable"), true,
    "C#4 is not on the pentatonic ladder this workspace opens");
  assert.strictEqual(bad(s => { s.time.cols = 32; }).includes("witness-unreachable"), true);
  assert.strictEqual(bad(s => { s.time.groove = 1; }).includes("witness-unreachable"), true);
  assert.strictEqual(bad(s => { s.palette = "diatonic"; }).includes("witness-unreachable"), true);

  // Duration. songEvidence ignores note length, but applySong loads `(n.len||1)` straight onto the
  // field — so a long note in a workspace with no grow/trim is a song no child could have built, and a
  // length that is not a positive integer reaches the field as a NaN duration. Found by GPT's tester,
  // which reproduced it against The Waking Woods: it published with zero catalog errors.
  const woods = mutate => {
    const d = clone("waking-woods");
    mutate(d.witnesses[0].songs.A.tracks[0].notes[0], d);
    const g2 = loadGame({ fresh: true });
    g2.loadQuestCatalog(JSON.stringify({ v: 1, definitions: [d] }), "official");
    return g2.QUEST_CATALOG_ERRORS.map(e => String(e.extra));
  };
  assert.strictEqual(clone("waking-woods").workspace.controlIds.includes("grow"), false,
    "this quest grants no grow, which is what makes the next assertions mean anything");
  assert.strictEqual(woods(n => { n.len = 4; }).some(x => x.includes("length-not-granted")), true);
  assert.strictEqual(woods(n => { n.len = "long" }).some(x => x.includes("length:long")), true);
  assert.strictEqual(woods(n => { n.len = 0; }).some(x => x.includes("length:0")), true);
  // …and with grow granted, the editor's OWN ceiling still applies: min(MAX_VINE, columns - column)
  const grown = (len, col) => woods((n, d) => { d.workspace.controlIds = ["drums", "grow"];
    n.len = len; n.c = col; });
  assert.deepEqual(grown(4, 0), [], "four columns from the start is a note the editor can grow");
  assert.strictEqual(grown(9, 0).some(x => x.includes("length-past-reach")), true, "MAX_VINE is 8");
  assert.strictEqual(grown(4, 14).some(x => x.includes("length-past-reach")), true, "past the last column");
  // An ABSENT length is one column, the same thing applySong's `(n.len||1)` reads it as. The compact
  // share format drops `len` when it is 1, so a song arriving without it is ordinary, not suspect —
  // and every fixture in this repo writes `len` explicitly, which is what left this default untested.
  assert.deepEqual(woods(n => { delete n.len; }), []);

  // and drums specifically: withheld by the workspace, used by the witness
  const g2 = load(d => {
    d.workspace.controlIds = ["loop"];
    for (const p of d.phases) if (p.challenge) for (const r of p.challenge.routes)
      r.observations = r.observations.filter(o => !o.analyzerId.startsWith("pulse."));
  });
  // the routes no longer span their capabilities, but the drums finding must be among the reasons
  assert.strictEqual(codes(g2).includes("witness-unreachable"), true);
  assert.strictEqual(g2.QUEST_CATALOG_ERRORS.some(e => String(e.extra).includes("drums-not-granted")), true);
});

test("the reachability gate is the same one the starter song goes through", () => {
  // MUTATION: give starterSong its own palette/columns comparison again.
  // Two gates that answer "could this workspace produce this song?" drift, and this seam has already
  // produced two defects from exactly that.
  const at = cols => song(RISE, MAIN, { time: { cols, tempo: 108, groove: 0 } });
  const starter = (s, m) => load(d => { delete d.setup; d.starterSong = s; if (m) m(d); });
  assert.strictEqual(codes(starter(at(12))).includes("starter-unreachable"), true);
  assert.strictEqual(codes(starter(song([[61, 0]], MAIN))).includes("starter-unreachable"), true);
  assert.deepEqual(codes(starter(at(16))), []);
});

// ======================= the engine speaks about music, not about one quest =======================

test("no engine descriptor is written in one quest's fiction", t => {
  // MUTATION: put a quest's nouns back into QUEST_DESCRIPTORS.
  // "The lights climbed" and "The roots stepped…" were engine strings. A second, differently-themed
  // commission would have spoken of lights and roots that are not in it — mechanically generic and
  // editorially single-quest. The fiction belongs in each quest's own authored text.
  const fiction = ["light", "root", "firefly", "flutter", "hopper", "wood", "crossing", "walk the"];
  for (const id of Object.keys(g.QUEST_DESCRIPTORS)) {
    const t = g.QUEST_DESCRIPTORS[id].text.toLowerCase();
    for (const w of fiction)
      assert.strictEqual(t.includes(w), false, id + ' says "' + w + '": ' + g.QUEST_DESCRIPTORS[id].text);
  }
  // …and each quest still carries its own, in the fields authors own
  assert.strictEqual(g.QUEST_DEFINITIONS["firefly-crossing"].brief.worldText.includes("Flutter"), true);
  assert.strictEqual(g.QUEST_DEFINITIONS["waking-woods"].brief.worldText.includes("Hopper"), true);
});

test("the same music gets the same sentence, whichever quest asked", t => {
  // MUTATION: let describe() or the descriptor lookup take the quest into account.
  // This is the property the neutral wording exists for: a fact about the song must not change its
  // words because a different commission observed it.
  const say = questId => {
    const g2 = loadGame({ fresh: true });
    const r = g2.startQuestRun(questId);
    g2.applySong(song(RISE, MAIN));
    g2.noteEdit("test-edit");
    const run = g2.QUEST_RUNS[r.runId];
    g2.transactQuestRun(r.runId, [{ type: "completePass", versionId: "A",
      editRev: run.versions.A.editRev, sessionId: "s1", at: 2 }]);
    const done = g2.QUEST_RUNS[r.runId];
    const ev = { versions: { A: g2.songEvidence(done.versions.A.song) } };
    return g2.evaluateQuest(g2.QUEST_DEFINITIONS[questId], ev, done)
      .musical.descriptorTokens.map(t => t.descriptorId).sort();
  };
  const firefly = say("firefly-crossing"), woods = say("waking-woods");
  assert.strictEqual(firefly.includes("heard-pulse-main-kicks"), true);
  assert.strictEqual(woods.includes("heard-pulse-main-kicks"), true,
    "the same drum pattern is the same fact in both quests");
  assert.strictEqual(g.questTokenText({ id: "heard-pulse-main-kicks" }),
    "The drum stepped on every main beat.");
});

// ======================= the second commission, played end to end =======================

const runOf = (g2, runId) => g2.QUEST_RUNS[runId];
const alwaysStop = (t, g2) => t.after(() => { try { if (g2.playing) g2.stop(); } catch (e) { /* down */ } });
function edit(g2, s) { g2.applySong(withBeatNotes(completeDealtSong(g2, s))); g2.noteEdit("test-edit"); }
const credit = (g2, runId, versionId, sessionId) => {
  const v = runOf(g2, runId).versions[versionId];
  const r = g2.transactQuestRun(runId, [{ type: "completePass", versionId, editRev: v.editRev,
    sessionId, at: Date.now() }]);
  assert.strictEqual(r.ok, true, "credit " + versionId + ": " + r.code);
};

test("the second commission is data: a different land, different powers, no engine branch", () => {
  // MUTATIONS: reuse Firefly's envelope or features, force loop on/off, or retain the previous loop.
  // Q9 still proves another land, cast, prerequisites and analyzers. Loop defaults now agree in
  // official data; a uniquely named no-loop clone supplies the contrasting workspace through JSON.
  const w = g.QUEST_DEFINITIONS["waking-woods"], f = g.QUEST_DEFINITIONS["firefly-crossing"];
  assert.notStrictEqual(w.presentation.regionId, f.presentation.regionId);
  assert.notStrictEqual(w.presentation.themeId, f.presentation.themeId);
  assert.deepEqual(w.capabilityIds, ["melody-making", "steady-pulse"]);
  assert.deepEqual(w.workspace.controlIds, ["drums", "loop"], "Woods starts with looping on");
  assert.deepEqual(w.cast, [{ regionId: "pulse-woods", capabilityId: "steady-pulse" }]);
  assert.notDeepEqual(w.cast, f.cast);
  assert.deepEqual(w.prerequisites.earnedByPackageIds, ["intro", "footsteps"]);
  // no contour analyzer anywhere in it: the routes are carried by a different pair of primitives
  const analyzers = w.phases.flatMap(p => p.challenge ? p.challenge.routes.flatMap(
    r => r.observations.map(o => o.analyzerId)) : []);
  assert.strictEqual(analyzers.some(a => a.startsWith("contour.")), false);
  assert.strictEqual(analyzers.some(a => a === "phrase.on-every-beat"), true,
    "and it uses a primitive the first quest never touched");

  // the envelope the generic controller builds is the SECOND quest's, not the first's
  const g2 = loadGame({ fresh: true });
  const noLoopId = loadNoLoopWoods(g2);
  assert.deepEqual(g2.QUEST_CATALOG_ERRORS, []);
  for (const [id, loop] of [["firefly-crossing", true], [noLoopId, false], ["waking-woods", true]]) {
    const r = g2.startQuestRun(id);
    assert.strictEqual(r.ok, true, id + ": " + r.code);
    assert.deepEqual([...g2.scopeFeatures()].sort(), loop ? ["drums", "loop"] : ["drums"], id);
    assert.strictEqual(g2.currentLevel().loop, loop, id + " envelope");
    assert.strictEqual(g2.looping, loop, id + " transport default");
  }
  const L = g2.currentLevel();
  assert.deepEqual(L.steps.map(s => s.id), ["wake-the-woods", "walk-it-again", "choose-the-walk"]);
  for (const st of L.steps) assert.strictEqual(st.goals, undefined, st.id + " must have no goals");
  assert.strictEqual(L.loop, true, "the official Woods envelope starts looping");
  assert.strictEqual(L.drums, true);
  assert.strictEqual(g2.scopeVisualRegion(), "pulse-woods",
    "a quest is tinted by the land its presentation names");
});

test("the second commission can be played from its first note to a saved song", t => {
  // MUTATION: anything that makes the quest machinery specific to the Firefly's shape.
  const g2 = loadGame({ fresh: true });
  alwaysStop(t, g2);
  const r = g2.startQuestRun("waking-woods");
  assert.strictEqual(r.ok, true, r.code);
  const runId = r.runId;

  // phase 1: four notes over a steady beat
  edit(g2, song(RISE, MAIN));
  assert.strictEqual(g2.performQuestAction("continue").code, "gate-closed", "not heard yet");
  credit(g2, runId, "A", "s1");
  const evA = { versions: { A: g2.songEvidence(runOf(g2, runId).versions.A.song) } };
  assert.deepEqual(
    g2.evaluateQuest(g2.QUEST_DEFINITIONS["waking-woods"], evA, runOf(g2, runId)).musical.matchedRouteIds,
    ["walk-on-main-beats"]);
  assert.strictEqual(g2.performQuestAction("continue").ok, true);
  assert.strictEqual(runOf(g2, runId).draft, "B");

  // phase 2: same beat, a different tune — the "kept the beat" way
  edit(g2, song(FALL, MAIN));
  credit(g2, runId, "B", "s2");
  const evB = { versions: {
    A: g2.songEvidence(runOf(g2, runId).versions.A.song),
    B: g2.songEvidence(runOf(g2, runId).versions.B.song) } };
  assert.deepEqual(
    g2.evaluateQuest(g2.QUEST_DEFINITIONS["waking-woods"], evB, runOf(g2, runId)).musical.matchedRouteIds,
    ["kept-the-beat"]);
  assert.strictEqual(g2.performQuestAction("continue").ok, true);
  assert.strictEqual(runOf(g2, runId).phase, 2);

  // phase 3: hear both, choose one, offer it
  for (const id of ["A", "B"]) {
    t.after(() => { if (g2.playing) g2.stop(); });
    assert.strictEqual(g2.performQuestAction("pick", { versionId: id }).ok, true);
    g2.stop();
    const v = runOf(g2, runId).versions[id];
    g2.transactQuestRun(runId, [{ type: "audition", versionId: id, editRev: v.editRev,
      sessionId: v.lastCompletePlaySessionId, at: Date.now() }]);
  }
  g2.questAfterReceipt(runId);
  t.after(() => { if (g2.playing) g2.stop(); });
  assert.strictEqual(g2.performQuestAction("pick", { versionId: "B" }).ok, true);
  const before = g2.getSaves().length;
  const offered = g2.performQuestAction("offer");
  assert.strictEqual(offered.ok, true, offered.code);

  const art = g2.getSaves()[0];
  assert.strictEqual(g2.getSaves().length, before + 1);
  assert.strictEqual(art.meta.title, "The Waking Woods");
  assert.strictEqual(art.meta.source.questId, "waking-woods");
  assert.strictEqual(runOf(g2, runId).status, "completed");
  assert.strictEqual(g2.questCompleted("waking-woods"), true);
});

test("the other way through the second commission changes the beat instead", () => {
  // MUTATION: collapse the two transform routes, or gate the transition on one of them.
  // Two ways that are really one alternative is the defect Q5 exists to prevent, and a second quest
  // built on a different axis is the only thing that proves the check is not Firefly-shaped.
  const g2 = loadGame({ fresh: true });
  const r = g2.startQuestRun("waking-woods");
  const runId = r.runId;
  edit(g2, song(RISE, MAIN));
  credit(g2, runId, "A", "s1");
  assert.strictEqual(g2.performQuestAction("continue").ok, true);
  edit(g2, song(RISE, EVEN));                     // same tune, a different walk
  credit(g2, runId, "B", "s2");
  const ev = { versions: {
    A: g2.songEvidence(runOf(g2, runId).versions.A.song),
    B: g2.songEvidence(runOf(g2, runId).versions.B.song) } };
  assert.deepEqual(
    g2.evaluateQuest(g2.QUEST_DEFINITIONS["waking-woods"], ev, runOf(g2, runId)).musical.matchedRouteIds,
    ["changed-the-beat"]);
});

test("two quests share one surface: one card, and the other on the trail", () => {
  // MUTATION: surface every eligible quest, or key the home card on a quest id.
  // Q22 is "at most one invitation"; with a single quest shipped, a surface that returned everything
  // looked identical to one that returned the best.
  const done = ids => ({ packages: Object.fromEntries(ids.map(id => [id, { completed: true }])) });
  const all = done(["intro", "footsteps", "follow-the-fireflies"]);
  const none = Object.create(null);
  // The two official quests, as an explicit fixture: a contributor's quest in the shipped catalog must
  // not change which of THESE two is the invitation.
  const defs = Object.assign(Object.create(null),
    { "firefly-crossing": g.QUEST_DEFINITIONS["firefly-crossing"], "waking-woods": g.QUEST_DEFINITIONS["waking-woods"] });
  const card = g.questHomeCard(defs, all, none, none);
  assert.strictEqual(card.questId, "firefly-crossing", "the lower priority number is the invitation");
  assert.strictEqual(card.icon, "✨", "the theme reaches the card");

  const trail = g.questTrailModel(defs, all, none, none);
  assert.deepEqual(trail.map(r => r.questId).sort(), ["firefly-crossing", "waking-woods"]);
  assert.deepEqual(trail.filter(r => !r.surfaced).map(r => r.questId), ["waking-woods"],
    "the card's quest is not repeated below it");
  assert.strictEqual(trail.find(r => r.questId === "waking-woods").icon, "🌲");

  // eligibility is still an AND over that quest's OWN prerequisites
  const woodsOnly = g.questTrailModel(defs, done(["intro", "footsteps"]), none, none);
  assert.deepEqual(woodsOnly.map(r => r.questId), ["waking-woods"],
    "the Firefly needs a package this profile has not finished");
});
