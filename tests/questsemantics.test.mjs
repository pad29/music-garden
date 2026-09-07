// The engine registries, song evidence, and the semantic validator.
//
// Quest data names primitives; engine code decides what they mean. That split is what makes a future
// player-facing Questmaker possible: an author may reference `pulse.even-walk`, but only the registry
// can say what an even walk is, and only the validator can decide whether two routes are really
// alternatives. These tests pin that boundary.
//
// Each test names the mutation it must catch. A test that passes against correct code AND against the
// bug it claims to catch is a false proof; four of those have already been caught in this project.

import { test } from "node:test";
import assert from "node:assert";
import { loadGame } from "./harness.mjs";

const g = loadGame();

// ---- v3 songs in their TRUE shape: `kind`, not `role`, and palette at the top level. ----
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
const MAIN = [[0, 0], [0, 4], [0, 8], [0, 12]];
const EVEN = [0, 2, 4, 6, 8, 10, 12, 14].map(c => [0, c]);
const HATS = [0, 2, 4, 6, 8, 10, 12, 14].map(c => [2, c]);

/** The shipped Firefly catalog, deep-cloned and mutated per test. */
function catalog(mutate) {
  const def = JSON.parse(JSON.stringify(g.QUEST_DEFINITIONS["firefly-crossing"]));
  if (mutate) mutate(def);
  return JSON.stringify({ v: 1, definitions: [def] });
}
const load = mutate => { const g2 = loadGame({ fresh: true }); g2.loadQuestCatalog(catalog(mutate)); return g2; };
const codes = game => game.QUEST_CATALOG_ERRORS.map(e => e.code);
const route = (d, phase, i) => d.phases[phase].challenge.routes[i];

// ============================ contour from an explicit grid ============================

test("the live contour reader is the pure one, with the live grid handed to it", () => {
  // MUTATION: swap rows and span in the wrapper, or let the pure form keep reading a global.
  // A non-square grid is the point: with rows === span a swap is invisible.
  const rows = 5, span = 3;
  const grid = Array.from({ length: rows }, () => Array(span).fill(false));
  grid[4][0] = true;   // height 0
  grid[2][1] = true;   // height 2
  grid[0][2] = true;   // height 4
  assert.deepEqual(g.contourSeqFromGrid(grid, rows, span), [0, 2, 4]);

  // and the live reader agrees with an independent reading of the live grid
  const g2 = loadGame({ fresh: true });
  g2.applySong(song(RISE, MAIN));
  const expected = [];
  for (let c = 0; c < g2.COLS; c++)
    for (let r = 0; r < g2.ROWS; r++) if (g2.grid[r][c]) { expected.push((g2.ROWS - 1) - r); break; }
  assert.deepEqual(g2.contourSeq(), expected);
  assert.strictEqual(expected.length, 4, "the fixture must actually put notes on the grid");
});

// ============================ songEvidence ============================

test("evidence never loads the song it is reading", () => {
  // MUTATION: implement songEvidence by calling applySong and reading the live grids.
  const g2 = loadGame({ fresh: true });
  g2.applySong(song(RISE, MAIN));
  // `meta.updated` is stamped from the clock on every read, so the comparison is of the MUSIC.
  const music = () => { const s = g2.currentSong(); delete s.meta; return JSON.stringify(s); };
  const before = music();
  const ev = g2.songEvidence(song([[G4, 0], [E4, 2], [D4, 4], [C4, 6]], EVEN));
  assert.strictEqual(ev.valid, true);
  assert.deepEqual(ev.contourFamilies, ["fall"], "it really did read the OTHER song");
  assert.strictEqual(music(), before, "reading a snapshot must not touch the player's work");
});

test("a song is projected under its own palette, not whichever one is loaded", () => {
  // MUTATION: pass the live paletteId to projectTracks instead of song.palette.
  const g2 = loadGame({ fresh: true });
  g2.setPalette("pentatonic");
  const ev = g2.songEvidence(song(RISE, MAIN, { palette: "diatonic" }));
  assert.strictEqual(ev.valid, true);
  assert.strictEqual(ev.paletteId, "diatonic");
  assert.strictEqual(ev.projected.palette, "diatonic",
    "projecting under the live ladder snaps pitches to different rows and changes what detectors see");
});

test("a malformed event is refused; an out-of-span one is dropped", () => {
  // MUTATION: swap the two — accept bad notes, or reject songs that merely run past their columns.
  const bad = [
    [song([[C4, 0]], []), s => { s.tracks[0].notes[0].p = "60"; }, "bad-note"],
    [song([[C4, 0]], []), s => { s.tracks[0].notes[0].c = 1.5; }, "bad-note"],
    [song([], [[0, 0]]), s => { s.tracks[1].hits[0].lane = 99; }, "bad-hit"],
    [song([[C4, 0]], []), s => { s.v = 2; }, "not-v3"],
    [song([[C4, 0]], []), s => { s.palette = "nope"; }, "unknown-palette"],
    [song([[C4, 0]], []), s => { s.time.cols = 0; }, "bad-cols"],
    [song([[C4, 0]], []), s => { s.tracks = null; }, "bad-tracks"],
  ];
  for (const [s, mutate, code] of bad) {
    mutate(s);
    const ev = g.songEvidence(s);
    assert.strictEqual(ev.valid, false, code);
    assert.strictEqual(ev.code, code);
  }
  // past the last column is the ordinary case applySong already filters, not corruption
  const ok = g.songEvidence(song([[C4, 0], [D4, 99]], [[0, 0], [0, 40]]));
  assert.strictEqual(ok.valid, true);
  assert.strictEqual(ok.melodyOnsetCount, 1);
});

test("evidence reads the song at the width the editor would open it at", () => {
  // MUTATION: use the declared `time.cols` as the span.
  // Found by GPT's tester. A v3 document may declare cols:1 and still carry events out at column 12 —
  // applySong widens it to the editor's 16-column floor and every one of them comes back. Reading the
  // declared width made a clear rise over clean main-beat kicks analyse as no contour and no pulse,
  // so a quest would have refused a song that visibly satisfied it.
  const narrow = song(RISE, MAIN, { time: { cols: 1, tempo: 108, groove: 0 } });
  const ev = g.songEvidence(narrow);
  assert.strictEqual(ev.valid, true, "a legal v3 song the game opens must not be refused here");
  assert.strictEqual(ev.columns, 16);
  assert.deepEqual(ev.contourFamilies, ["rise"]);
  assert.deepEqual(ev.steadyPulseFamilies, ["main-beat-kicks"]);

  // and it agrees with what the editor actually builds from the same document
  const g2 = loadGame({ fresh: true });
  g2.applySong(narrow);
  assert.strictEqual(g2.COLS, 16);
  assert.strictEqual(g2.isRising(g2.contourSeq()), true);
  assert.strictEqual(g2.kickClean(), true);
});

test("onsets are counted off the projection, not off the note list", () => {
  // MUTATION: return notes.length. Two notes that land on one cell are ONE thing the player hears,
  // and every other analyzer reads the projection, so the count has to agree with them.
  const ev = g.songEvidence(song([[C4, 0], [C4, 0]], []));
  assert.strictEqual(ev.valid, true);
  assert.strictEqual(ev.melodyOnsetCount, 1);
  assert.strictEqual(ev.nonempty, true);
  assert.strictEqual(g.songEvidence(song([], [])).nonempty, false);
});

test("the even walk is lane 0 and the shimmer is lane 2", () => {
  // MUTATION: let pulse.even-walk call hat8ths. Conflating the kick walk with the hi-hat shimmer
  // cost this project a design round; they are different lanes and different lessons.
  const walk = g.songEvidence(song(RISE, EVEN)), shimmer = g.songEvidence(song(RISE, HATS));
  assert.deepEqual(walk.steadyPulseFamilies, ["even-kick-walk"]);
  assert.deepEqual(shimmer.steadyPulseFamilies, ["hat-shimmer"]);
});

test("an even kick walk is not also clean main-beat kicks", () => {
  // MUTATION: derive main-beat-kicks from the permissive kickOn4 instead of kickClean.
  // The even walk lands ON 0/4/8/12 too, so a permissive reading makes the two families overlap —
  // and phase 2's "you changed the heartbeat" silently stops being true.
  assert.deepEqual(g.songEvidence(song(RISE, EVEN)).steadyPulseFamilies, ["even-kick-walk"]);
  assert.deepEqual(g.songEvidence(song(RISE, MAIN)).steadyPulseFamilies, ["main-beat-kicks"]);
});

test("the registries are frozen all the way down", () => {
  // MUTATION: Object.freeze the registry maps only.
  // A shallow freeze leaves every entry writable, so one stray assignment could redefine what
  // `pulse.even-walk` means for every quest at once — including quests already in progress.
  const prim = g.QUEST_PRIMITIVES["pulse.even-walk"];
  assert.strictEqual(Object.isFrozen(g.QUEST_PRIMITIVES), true);
  assert.strictEqual(Object.isFrozen(prim), true);
  assert.strictEqual(Object.isFrozen(prim.allowedDescriptorIds), true);
  assert.strictEqual(Object.isFrozen(g.QUEST_DESCRIPTORS["way-pulse-even-kicks"]), true);
  assert.strictEqual(Object.isFrozen(g.QUEST_CAPABILITIES["steady-pulse"].earnedByPackageIds), true);

  const was = prim.capabilityId;
  try { prim.capabilityId = "melodic-contour"; } catch (e) { /* strict mode would throw; either is fine */ }
  assert.strictEqual(g.QUEST_PRIMITIVES["pulse.even-walk"].capabilityId, was);
});

// ============================ the relation algebra ============================

test("a smaller enum set is the stronger demand", () => {
  // MUTATION: reverse the subset direction, so asking for MORE would read as the stronger clause.
  const R = (a, b) => g.questRelate("contour.any-of", { families: a }, "contour.any-of", { families: b });
  assert.strictEqual(R(["rise"], ["rise", "fall"]), "left-implies-right");
  assert.strictEqual(R(["rise", "fall"], ["rise"]), "right-implies-left");
  assert.strictEqual(R(["rise"], ["rise"]), "equivalent");
  assert.strictEqual(R(["rise"], ["fall"]), "disjoint");
  assert.strictEqual(R(["rise", "hover"], ["hover", "arc"]), "overlap");
});

test("a higher floor is the stronger demand", () => {
  // MUTATION: reverse the numeric ordering.
  const R = (a, b) => g.questRelate("phrase.minimum-onsets", { minimum: a }, "phrase.minimum-onsets", { minimum: b });
  assert.strictEqual(R(8, 4), "left-implies-right");
  assert.strictEqual(R(4, 8), "right-implies-left");
  assert.strictEqual(R(4, 4), "equivalent");
});

test("a cross-analyzer relation nobody declared is unknown, in both directions", () => {
  // MUTATION: default an undeclared pair to "overlap" so nothing is ever rejected for being unclear.
  assert.strictEqual(g.questRelate("pulse.kick-on-main-beats", {}, "pulse.even-walk", {}), "disjoint");
  assert.strictEqual(g.questRelate("pulse.even-walk", {}, "pulse.kick-on-main-beats", {}), "disjoint");
  assert.strictEqual(g.questRelate("pulse.kick-on-main-beats", {}, "pulse.hat-shimmer", {}), "overlap");
  assert.strictEqual(g.questRelate("contour.any-of", { families: ["rise"] }, "pulse.even-walk", {}), "unknown");
  assert.strictEqual(g.questRelate("pulse.even-walk", {}, "phrase.minimum-onsets", { minimum: 4 }), "unknown");
});

// ============================ Q5's rules ============================

test("a route that implies another is not an alternative, however different its ids look", () => {
  // MUTATION: drop derived parameter implication and trust that two routes with different JSON differ.
  const g2 = load(d => {
    route(d, 0, 0).observations[0].params.families = ["rise"];
    route(d, 0, 1).observations[0].params.families = ["rise", "fall"];
    route(d, 0, 1).observations[1] = JSON.parse(JSON.stringify(route(d, 0, 0).observations[1]));
  });
  assert.strictEqual(codes(g2).includes("route-implies-route"), true);
  assert.deepEqual(Object.keys(g2.QUEST_DEFINITIONS), []);
});

test("two routes are duplicates by their canonical form, not by their ids or key order", () => {
  // MUTATION: compare route ids, or compare the authored JSON as written.
  const g2 = load(d => {
    const a = route(d, 0, 0), b = route(d, 0, 1);
    b.observations = [
      JSON.parse(JSON.stringify(a.observations[1])),                       // written in the other order
      { analyzerId: "contour.any-of", params: { families: ["fall", "arc", "rise", "hover"] },
        descriptorId: "way-contour-any" },                                 // same set, other sequence
    ];
  });
  assert.strictEqual(codes(g2).includes("duplicate-route-observations"), true);
});

test("a relation the engine never declared rejects the definition", () => {
  // MUTATION: treat "unknown" as "no implication" and carry on. A relation nobody wrote down is one
  // the alternatives check cannot make, so it must stop the quest rather than be assumed benign.
  const g2 = load(d => { route(d, 1, 0).observations[1] = {
    analyzerId: "pulse.kick-on-main-beats", params: {}, descriptorId: "way-pulse-main-kicks" }; });
  assert.strictEqual(codes(g2).includes("relation-unknown"), true);
});

test("an analyzer may only run in a phase that can supply what it reads", () => {
  // MUTATION: ignore allowedPhaseTypes. A compose phase has no snapshot to differ from.
  const g2 = load(d => { route(d, 0, 0).observations[0] = {
    analyzerId: "contour.differs-from-snapshot", params: { snapshotVersionId: "A" },
    descriptorId: "way-contour-changed" }; });
  assert.strictEqual(codes(g2).includes("analyzer-wrong-phase"), true);
});

test("every route covers each claimed capability exactly once", () => {
  // MUTATION: accept a route that satisfies one capability twice and the other not at all.
  const g2 = load(d => { route(d, 0, 0).observations[1] = {
    analyzerId: "contour.any-of", params: { families: ["arc"] }, descriptorId: "way-contour-any" }; });
  assert.strictEqual(codes(g2).includes("route-capability-span"), true);
});

test("procedural facts and musical ones are not interchangeable", () => {
  // MUTATION: keep gates and analyzers in separate maps, which makes Q5 rule 6 true by accident
  // rather than a check that can fail.
  const asObs = load(d => { route(d, 0, 0).observations[1] = {
    analyzerId: "playback.complete-since-last-edit", params: {}, descriptorId: "way-pulse-main-kicks" }; });
  assert.strictEqual(codes(asObs).includes("procedural-in-route"), true);

  const asGate = load(d => { d.phases[0].procedure.gateIds = ["contour.any-of"]; });
  assert.strictEqual(codes(asGate).includes("musical-as-gate"), true);

  const missing = load(d => { d.phases[0].procedure.gateIds = ["playback.no-such-gate"]; });
  assert.strictEqual(codes(missing).includes("no-such-gate"), true);
});

test("capabilities, analyzers and descriptors must all resolve", () => {
  // MUTATION: skip a registry lookup, so a typo ships as a quest nobody can finish.
  assert.strictEqual(codes(load(d => { d.capabilityIds[0] = "no-such-thing";
    d.phases[0].challenge.capabilityIds[0] = "no-such-thing";
    d.phases[1].challenge.capabilityIds[0] = "no-such-thing"; })).includes("no-such-capability"), true);
  assert.strictEqual(codes(load(d => { route(d, 0, 0).observations[0].analyzerId = "contour.no-such-thing"; }))
    .includes("no-such-analyzer"), true);
  assert.strictEqual(codes(load(d => { route(d, 0, 0).observations[0].descriptorId = "no-such-descriptor"; }))
    .includes("no-such-descriptor"), true);
});

test("a descriptor must be a way this could work, and one this analyzer may use", () => {
  // MUTATION: accept any descriptor id that resolves.
  const heard = load(d => { route(d, 0, 0).observations[0].descriptorId = "heard-contour-rise"; });
  assert.strictEqual(codes(heard).includes("descriptor-wrong-kind"), true,
    "a heard-fact describes what happened; a route names what would count");

  const foreign = load(d => { route(d, 0, 0).observations[0].descriptorId = "way-pulse-hat-shimmer"; });
  assert.strictEqual(codes(foreign).includes("descriptor-not-allowed"), true,
    "a contour clause must not be able to claim it is about the hi-hat");
});

test("analyzer parameters are checked against the engine's schema, never left opaque", () => {
  // MUTATION: keep params opaque past D1, so an author could ship families the engine cannot detect.
  const cases = [
    [d => { route(d, 0, 0).observations[0].params = {}; }, "params-shape"],
    [d => { route(d, 0, 0).observations[0].params = { families: [] }; }, "params-set-size"],
    [d => { route(d, 0, 0).observations[0].params = { families: ["spiral"] }; }, "params-unknown-value"],
    [d => { route(d, 0, 0).observations[0].params = { families: ["rise", "rise"] }; }, "params-set-duplicate"],
    [d => { route(d, 0, 0).observations[1].params = { extra: 1 }; }, "params-unexpected"],
    [d => { route(d, 1, 0).observations[0].params = { snapshotVersionId: "C" }; }, "params-bad-version"],
  ];
  for (const [mutate, code] of cases) {
    assert.strictEqual(codes(load(mutate)).includes(code), true, code);
  }
});

test("a snapshot clause looks at what the phase forked from, not at itself", () => {
  // MUTATION: accept any valid version id as the snapshot.
  // Pointed at the phase's own version, "differs from the snapshot" asks whether a song differs from
  // itself. It is never true — a route no player could ever finish, dressed as a real alternative.
  const g2 = load(d => { route(d, 1, 0).observations[0].params.snapshotVersionId = "B"; });
  assert.strictEqual(codes(g2).includes("snapshot-not-source"), true);
  assert.deepEqual(Object.keys(g2.QUEST_DEFINITIONS), []);
});

test("a definition with unusable parameters is reported, not crashed on", () => {
  // MUTATION: hand un-normalized params straight to the relation algebra.
  // It threw a TypeError on the way to the implication check. The loader's catch happened to keep the
  // errors already collected, so the definition was still refused — but every check after the throw was
  // skipped, and any caller outside that catch (a Questmaker preview, a dev tool, this test) got a
  // crash instead of a validation report.
  const g2 = loadGame({ fresh: true });
  const def = JSON.parse(JSON.stringify(g2.QUEST_DEFINITIONS["firefly-crossing"]));
  route(def, 0, 0).observations[0].params = {};
  const errs = [];
  assert.strictEqual(g2.questSemantics(def, errs), false);
  const found = errs.map(e => e.code);
  assert.strictEqual(found.includes("params-shape"), true, JSON.stringify(found));
  // the pass ran to the end rather than stopping at the bad clause
  assert.strictEqual(found.includes("route-unsatisfiable"), true,
    "the witness pass must still run: a truncated report hides everything after the first bad clause");
});

// ============================ executable witnesses ============================

test("a route no song can satisfy is rejected", () => {
  // MUTATION: skip satisfiability and rely on the pair check, which reports a different thing.
  // One note has no recognized contour, so the route it witnesses can never fire.
  const g2 = load(d => { d.witnesses[0].songs.A = song([[C4, 0]], MAIN); });
  assert.strictEqual(codes(g2).includes("route-unsatisfiable"), true);
});

test("each route needs its own witness that the others fail — in that direction", () => {
  // MUTATION: accept a witness that distinguishes the pair in EITHER direction, or accept any
  // witness in the definition rather than one this route actually references.
  // Main-beat kicks and the hi-hat shimmer OVERLAP: a song can have both. Give route 0's only
  // witness a shimmer as well, and it stops separating route 0 from route 2 — while route 2's own
  // witness still separates 2 from 0, so exactly one direction fails.
  const g2 = load(d => { d.witnesses[0].songs.A = song(RISE, [...MAIN, ...HATS]); });
  const failures = g2.QUEST_CATALOG_ERRORS.filter(e => e.code === "no-distinguishing-witness");
  assert.strictEqual(failures.length, 1, JSON.stringify(g2.QUEST_CATALOG_ERRORS));
  assert.strictEqual(failures[0].extra, "main-beat-crossing without shimmer-crossing");
});

test("a witness belongs to the phase it is cited in", () => {
  // MUTATION: check only that the phase id exists somewhere in the definition.
  const g2 = load(d => { d.witnesses[0].phaseId = "another-way-across"; });
  assert.strictEqual(codes(g2).includes("witness-wrong-phase"), true);
});

test("witness songs are run through the real extractor, not taken on trust", () => {
  // MUTATION: trust an authored witness because it shipped with the definition.
  assert.strictEqual(codes(load(d => { d.witnesses[0].songs.A.v = 2; })).includes("witness-song-invalid"), true);
  assert.strictEqual(codes(load(d => { d.witnesses[3].currentVersionId = "B"; delete d.witnesses[3].songs.B; }))
    .includes("witness-missing-current"), true);
});

test("the shipped quest passes every semantic rule, on real songs", () => {
  // MUTATION: make questSemantics a no-op, or never call it from the loader.
  const g2 = loadGame({ fresh: true });
  assert.deepEqual([...g2.QUEST_CATALOG_ERRORS], []);
  const fc = g2.QUEST_DEFINITIONS["firefly-crossing"];
  const errs = [];
  assert.strictEqual(g2.questSemantics(fc, errs), true, JSON.stringify(errs));

  // and the evidence really was extracted from the witness music
  const seen = fc.witnesses.map(w => {
    const ev = g2.songEvidence(w.songs[w.currentVersionId]);
    return [w.id, ev.contourFamilies.join("+"), ev.steadyPulseFamilies.join("+")].join(":");
  });
  assert.deepEqual(seen, [
    "first-main-rise:rise:main-beat-kicks",
    "first-even-fall:fall:even-kick-walk",
    "first-shimmer-arc:arc:hat-shimmer",
    "second-fall-same-main:fall:main-beat-kicks",
    "second-rise-even-walk:rise:even-kick-walk",
  ]);
});

// ============================ the procedural gates ============================

const SPAN = { start: 0, end: 16 };
const gateOf = id => g.QUEST_PRIMITIVES[id].gate;

function runThrough(ops) {
  let run = g.newQuestRun({ runId: "r1", questId: "firefly-crossing", definitionVersion: 1,
    song: song(RISE, MAIN), span: SPAN, at: 0 });
  for (const op of ops) {
    const r = g.reduceQuestTransaction(run, [op]);
    assert.strictEqual(r.ok, true, op.type + ": " + r.code);
    run = r.run;
  }
  return run;
}

test("the fork gate wants an edit after the fork, not merely a fork", () => {
  // MUTATION: open on forkedFrom alone, which would wave the untouched copy of A through as "B".
  const forked = runThrough([
    { type: "completePass", versionId: "A", editRev: 0, sessionId: "s1", at: 1 },
    { type: "forkFrom", sourceVersionId: "A", sourceRev: 0, newVersionId: "B", at: 2 },
  ]);
  assert.strictEqual(gateOf("edit.after-fork")(forked, "B"), false);
  assert.strictEqual(gateOf("edit.after-fork")(forked, "A"), false, "A was never forked from anything");

  const edited = g.reduceQuestTransaction(forked, [{ type: "edit", target: "song", versionId: "B",
    baseRev: 0, song: song([[G4, 0], [E4, 2], [D4, 4], [C4, 6]], MAIN), span: SPAN, at: 3 }]);
  assert.strictEqual(edited.ok, true);
  assert.strictEqual(gateOf("edit.after-fork")(edited.run, "B"), true);
});

test("the comparison gates go shut again when the thing compared changes underneath", () => {
  // MUTATION: read run.selection alone, without re-checking that the comparison is still current.
  const compared = runThrough([
    { type: "completePass", versionId: "A", editRev: 0, sessionId: "s1", at: 1 },
    { type: "audition", versionId: "A", editRev: 0, sessionId: "s1", at: 2 },
    { type: "forkFrom", sourceVersionId: "A", sourceRev: 0, newVersionId: "B", at: 3 },
    { type: "edit", target: "song", versionId: "B", baseRev: 0,
      song: song(RISE, EVEN), span: SPAN, at: 4 },
    { type: "completePass", versionId: "B", editRev: 1, sessionId: "s2", at: 5 },
    { type: "audition", versionId: "B", editRev: 1, sessionId: "s2", at: 6 },
    { type: "compare", leftVersionId: "A", rightVersionId: "B", at: 7 },
  ]);
  assert.strictEqual(gateOf("comparison.auditioned-both")(compared), true);
  assert.strictEqual(gateOf("comparison.chosen")(compared), false, "nothing has been chosen yet");

  const chosen = g.reduceQuestTransaction(compared, [{ type: "choose", versionId: "B", at: 8 }]);
  assert.strictEqual(chosen.ok, true);
  assert.strictEqual(gateOf("comparison.chosen")(chosen.run, "B"), true);

  const moved = g.reduceQuestTransaction(chosen.run, [{ type: "edit", target: "song", versionId: "B",
    baseRev: 1, song: song(RISE, HATS), span: SPAN, at: 9 }]);
  assert.strictEqual(moved.ok, true);
  assert.strictEqual(moved.run.selection, "B", "the choice is still recorded");
  assert.strictEqual(gateOf("comparison.chosen")(moved.run, "B"), false,
    "the song they chose is not the song they would offer");
  assert.strictEqual(gateOf("comparison.auditioned-both")(moved.run), false);
});

test("the playback gate is the two numbers the run already owns", () => {
  // MUTATION: consult live paint or transport state instead of the run.
  const heard = runThrough([{ type: "completePass", versionId: "A", editRev: 0, sessionId: "s1", at: 1 }]);
  assert.strictEqual(gateOf("playback.complete-since-last-edit")(heard, "A"), true);
  const edited = g.reduceQuestTransaction(heard, [{ type: "edit", target: "song", versionId: "A",
    baseRev: 0, song: song(RISE, EVEN), span: SPAN, at: 2 }]);
  assert.strictEqual(gateOf("playback.complete-since-last-edit")(edited.run, "A"), false);
});
