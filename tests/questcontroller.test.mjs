// Entering a quest, and moving through it.
//
// The controller is generic on purpose: what a transition does is named by the definition, and the
// procedural gate is the AND of its declared ids; a dealt task also needs readiness before comparison.
// There is no branch on phase number
// anywhere in it, because the whole point of the declarative format is that a new phase is data.
//
// Each test names the mutation it must catch. A test that passes against the correct code AND against
// the bug it claims to catch is a false proof.

import { test } from "node:test";
import assert from "node:assert";
import { loadQuestGame as loadGame, completeDealtSong } from "./helpers/quest-fixtures.mjs";

const RISE = [[60, 0], [62, 2], [64, 4], [67, 6]];
const FALL = [[67, 0], [64, 2], [62, 4], [60, 6]];
const MAIN = [[0, 0], [0, 4], [0, 8], [0, 12]];
const EVEN = [0, 2, 4, 6, 8, 10, 12, 14].map(c => [0, c]);

const song = (mel, hits, over = {}) => ({
  v: 3, meta: { title: null, created: 0, updated: 0, author: null },
  palette: "pentatonic", time: { cols: 16, tempo: 108, groove: 0 },
  tracks: [
    { kind: "melody", voice: "musicbox", notes: mel.map(([p, c]) => ({ p, c, len: 1 })) },
    { kind: "drums", hits: hits.map(([lane, c]) => ({ lane, c })) },
  ],
  ...over,
});

/** A fresh game with a fresh run of the Firefly, entered. */
function launched() {
  const g = loadGame({ fresh: true });
  const r = g.startQuestRun("firefly-crossing");
  assert.strictEqual(r.ok, true, r.code);
  return { g, runId: r.runId };
}
const runOf = (g, runId) => g.QUEST_RUNS[runId];
/** Auditioning starts the transport, and a transport left running keeps Node alive forever — so a
 *  test that plays must stop even when it FAILS, or a red test becomes a hung suite. */
const alwaysStop = (t, g) => t.after(() => { try { if (g.playing) g.stop(); } catch (e) { /* already down */ } });
/** A real player edit: change the live document, then tell the game an edit happened. */
function edit(g, runId, s) { g.applySong(completeDealtSong(g, s)); g.noteEdit("test-edit"); return runOf(g, runId); }
const credit = (g, runId, versionId, sessionId) => {
  const v = runOf(g, runId).versions[versionId];
  const r = g.transactQuestRun(runId, [{ type: "completePass", versionId, editRev: v.editRev,
    sessionId, at: Date.now() }]);
  assert.strictEqual(r.ok, true, "credit " + versionId + ": " + r.code);
  return r.run;
};

// ============================ the envelope ============================

test("a quest is one level whose steps are its phases, and it carries no goals", () => {
  // MUTATION: give a quest step a `goals` array.
  // checkLevel() calls stageComplete() when a goal list is non-empty and every goal passes — so a
  // quest step with goals could be completed by the lesson engine, which must never move a quest on.
  const { g } = launched();
  assert.strictEqual(g.activeStages().length, 1);
  const L = g.currentLevel();
  assert.deepEqual(L.steps.map(s => s.id), ["light-first-path", "another-way-across", "choose-crossing"]);
  for (const st of L.steps) assert.strictEqual(st.goals, undefined, st.id + " must have no goals");

  const before = g.QUEST_RUNS[g.activeScope.runId].phase;
  g.checkLevel();
  g.checkLevel();
  assert.strictEqual(g.QUEST_RUNS[g.activeScope.runId].phase, before,
    "the lesson engine must be structurally unable to advance a quest");
});

test("the launcher builds the field the workspace asked for", () => {
  // MUTATION: ignore workspace.columns or grooveId and use whatever the editor had.
  const { g, runId } = launched();
  const def = g.QUEST_DEFINITIONS["firefly-crossing"];
  const v = runOf(g, runId).versions.A;
  assert.strictEqual(v.song.time.cols, def.workspace.columns);
  assert.strictEqual(v.song.palette, def.workspace.paletteId);
  assert.strictEqual(v.song.time.groove, g.QUEST_GROOVES[def.workspace.grooveId]);
  assert.strictEqual(v.span.end, def.workspace.columns, "the span the completion session checks");
  assert.strictEqual(g.COLS, def.workspace.columns);
  assert.strictEqual(g.paletteId, def.workspace.paletteId);
  assert.deepEqual([...g.scopeFeatures()].sort(), [...def.workspace.controlIds].sort());
});

test("a workspace wider than the editor's default really is built wider", () => {
  // MUTATION: use the live COLS instead of workspace.columns. The shipped Firefly asks for 16, which
  // is also the editor's floor — so only a definition that asks for something else can tell them apart.
  const g = loadGame({ fresh: true, questSeed: "fixture-0" });
  const wide = JSON.parse(JSON.stringify(g.QUEST_DEFINITIONS["firefly-crossing"]));
  wide.workspace.columns = 24;
  // …and so are the songs that prove its routes reachable: a 16-column witness is not something a
  // 24-column workspace can hand back, and the validator now says so.
  for (const w of wide.witnesses) for (const v of Object.keys(w.songs)) {
    const s = w.songs[v];
    s.time.cols = 24;
    // extend each witness's own drum pattern across the wider field, keeping its family
    const hits = s.tracks[1].hits;
    if (hits.length) {
      const lane = hits[0].lane, step = hits.length > 4 ? 2 : 4;
      s.tracks[1].hits = [];
      for (let c = 0; c < 24; c += step) s.tracks[1].hits.push({ lane, c });
    }
  }
  g.loadQuestCatalog(JSON.stringify({ v: 1, definitions: [wide] }), "official");
  assert.deepEqual([...g.QUEST_CATALOG_ERRORS], []);

  const r = g.startQuestRun("firefly-crossing");
  assert.strictEqual(r.ok, true, r.code);
  assert.strictEqual(runOf(g, r.runId).versions.A.song.time.cols, 24);
  assert.strictEqual(runOf(g, r.runId).versions.A.span.end, 24);
  assert.strictEqual(g.COLS, 24);
});

test("a starter song must fit the workspace it starts in", () => {
  // MUTATION: leave starterSong opaque, as it was before the controller could reach it.
  // A starter narrower than the workspace is not cosmetic: the run's span is the song's width,
  // applySong widens the field to the editor's floor, and beginCompletionSession refuses when the two
  // disagree — so the quest would open, look right, and never be finishable, because no playback
  // could ever be credited. Nothing would say why.
  const g = loadGame({ fresh: true });
  // captured once: a failed load publishes an EMPTY registry, so the second call would have nothing
  // left to clone from
  const BASE = JSON.stringify(g.QUEST_DEFINITIONS["firefly-crossing"]);
  const withStarter = starter => {
    const d = JSON.parse(BASE);
    delete d.setup;                    // a dealt task and a starter song cannot share one field
    d.starterSong = starter;
    g.loadQuestCatalog(JSON.stringify({ v: 1, definitions: [d] }), "official");
    return g.QUEST_CATALOG_ERRORS.map(e => e.code);
  };
  const at = cols => song(RISE, MAIN, { time: { cols, tempo: 108, groove: 0 } });

  assert.strictEqual(withStarter(at(12)).includes("starter-unreachable"), true);
  assert.strictEqual(withStarter(at(24)).includes("starter-unreachable"), true);
  assert.strictEqual(withStarter(song(RISE, MAIN, { palette: "diatonic" })).includes("starter-unreachable"), true);
  assert.strictEqual(withStarter(song(RISE, MAIN, { palette: "nope" })).includes("starter-palette-unusable"), true);
  assert.strictEqual(withStarter({ v: 2 }).includes("starter-song-invalid"), true);

  // a starter that DOES fit is used, and the run can be finished from it
  assert.deepEqual(withStarter(at(16)), []);
  const r = g.startQuestRun("firefly-crossing");
  assert.strictEqual(r.ok, true, r.code);
  const v = runOf(g, r.runId).versions.A;
  assert.strictEqual(v.song.tracks[0].notes.length, 4, "the run starts from the authored song");
  assert.strictEqual(v.span.end, g.COLS, "and the span the completion session checks matches the field");
  credit(g, r.runId, "A", "s1");
  assert.strictEqual(g.performQuestAction("continue").ok, true);
});

test("every procedural gate answers with a real boolean", () => {
  // This is what makes "only the literal true opens a transition" meaningful rather than decorative:
  // if a gate could answer with a truthy string, the strict comparison would be the only thing
  // standing between a descriptive message and an opened door. The registry is frozen, so a fake gate
  // cannot be injected — pinning the gates themselves is the honest way to prove the same property.
  const { g, runId } = launched();
  const states = [runOf(g, runId), { ...runOf(g, runId), comparison: null, selection: null },
                  { versions: {} }, {}];
  for (const id of Object.keys(g.QUEST_PRIMITIVES)) {
    const prim = g.QUEST_PRIMITIVES[id];
    if (prim.kind !== "procedural") continue;
    for (const st of states) for (const v of ["A", "B", "nope"])
      assert.strictEqual(typeof prim.gate(st, v), "boolean", id + " answered with a non-boolean");
  }
});

// ============================ entering ============================

test("entry refuses a run it cannot honestly render", () => {
  // MUTATION: enter anyway and fall back to phase 0.
  const { g, runId } = launched();
  assert.strictEqual(g.enterQuestRun("nope").code, "no-run");

  const abandoned = g.transactQuestRun(runId, [{ type: "abandon", at: 1 }]);
  assert.strictEqual(abandoned.ok, true);
  assert.strictEqual(g.enterQuestRun(runId).code, "unusable-run");

  const g2 = loadGame({ fresh: true });
  const r2 = g2.startQuestRun("firefly-crossing");
  g2.QUEST_RUNS[r2.runId] = { ...runOf(g2, r2.runId), definitionVersion: 3 };
  assert.strictEqual(g2.enterQuestRun(r2.runId).code, "definition-changed");

  const g3 = loadGame({ fresh: true });
  const r3 = g3.startQuestRun("firefly-crossing");
  const run3 = runOf(g3, r3.runId);
  g3.QUEST_RUNS[r3.runId] = { ...run3, versions: { ...run3.versions,
    A: { ...run3.versions.A, song: { ...run3.versions.A.song, palette: "diatonic" } } } };
  assert.strictEqual(g3.enterQuestRun(r3.runId).code, "palette-mismatch",
    "a draft in another ladder is a corrupt run, not one to open anyway");
});

test("entry opens the draft, and is not itself an edit", () => {
  // MUTATION: always apply version A, or let the load count as a player edit.
  const { g, runId } = launched();
  edit(g, runId, song(RISE, MAIN));
  credit(g, runId, "A", "s1");
  assert.strictEqual(g.performQuestAction("continue").ok, true);
  edit(g, runId, song(FALL, EVEN));
  const beforeRev = runOf(g, runId).versions.B.editRev;
  credit(g, runId, "B", "s2");

  g.setPlayScope({ kind: "package", packageId: "footsteps" });     // leave the garden
  const back = g.enterQuestRun(runId);
  assert.strictEqual(back.ok, true);
  assert.strictEqual(back.versionId, "B", "resume opens the draft, not the first version");
  assert.strictEqual(back.phase, 1);
  // and the MUSIC on the grid is B's, not merely the id in the answer
  assert.strictEqual(g.isFalling(g.contourSeq()), true, "B falls; A rises");
  assert.strictEqual(g.kickWalk8(), true, "B walks; A is on the main beats");
  assert.strictEqual(runOf(g, runId).versions.B.editRev, beforeRev, "entering must not bump the revision");
  assert.strictEqual(g.playbackCompleteSinceLastEdit(runOf(g, runId), "B"), true,
    "and a gate earned before leaving is still open on return");
});

// ============================ the generic gate ============================

test("a ready phase is gated by exactly the procedure ids it declares", () => {
  // Deliberate behavior change: procedure ids used to be the ONLY gates. These songs now finish
  // the dealt task first; independent tests pin readiness as the additional early-phase condition.
  // MUTATION: hardcode the gate for phase 1, or gate on a route match.
  const { g, runId } = launched();
  const def = g.QUEST_DEFINITIONS["firefly-crossing"];
  assert.deepEqual(def.phases[0].procedure.gateIds, ["playback.complete-since-last-edit"]);

  edit(g, runId, song(RISE, MAIN));
  assert.strictEqual(g.performQuestAction("continue").code, "gate-closed");
  credit(g, runId, "A", "s1");
  assert.strictEqual(g.performQuestAction("continue").ok, true, "one declared gate, now open");

  // phase 2 declares TWO, and the fork alone opens neither
  assert.deepEqual(def.phases[1].procedure.gateIds,
    ["edit.after-fork", "playback.complete-since-last-edit"]);
  assert.strictEqual(g.performQuestAction("continue").code, "gate-closed",
    "B is an untouched copy of A: there is no second path yet");
  edit(g, runId, song(FALL, MAIN));
  assert.strictEqual(g.performQuestAction("continue").code, "gate-closed", "edited, but not yet heard");
  credit(g, runId, "B", "s2");
  assert.strictEqual(g.performQuestAction("continue").ok, true);
  assert.strictEqual(runOf(g, runId).phase, 2);
});

test("a song matching no route still moves the quest on", () => {
  // MUTATION: gate a transition on a route match. Q6's "offer anyway" is the whole shape of this quest.
  const { g, runId } = launched();
  edit(g, runId, song([[60, 0], [60, 4]], []));      // completed landmarks and regions, but no steady pulse
  credit(g, runId, "A", "s1");
  const ev = { versions: { A: g.songEvidence(runOf(g, runId).versions.A.song) } };
  assert.deepEqual(
    g.evaluateQuest(g.QUEST_DEFINITIONS["firefly-crossing"], ev, runOf(g, runId)).musical.matchedRouteIds,
    []);
  assert.strictEqual(g.performQuestAction("continue").ok, true);
});

test("the fork is named by the definition, not by the phase number", () => {
  // MUTATION: fork on every transition, or on none.
  const { g, runId } = launched();
  edit(g, runId, song(RISE, MAIN));
  credit(g, runId, "A", "s1");
  assert.strictEqual(g.performQuestAction("continue").ok, true);

  const run = runOf(g, runId);
  assert.deepEqual(Object.keys(run.versions).sort(), ["A", "B"]);
  assert.strictEqual(run.draft, "B");
  assert.strictEqual(run.versions.B.editRev, 0, "a fork is a copy, not an edit");
  assert.deepEqual(run.versions.B.forkedFrom, { versionId: "A", editRev: 1 });
  assert.strictEqual(JSON.stringify(run.versions.B.song), JSON.stringify(run.versions.A.song));

  // the compare phase's transition is "offer": it does not advance, and says so
  edit(g, runId, song(FALL, MAIN));
  credit(g, runId, "B", "s2");
  assert.strictEqual(g.performQuestAction("continue").ok, true);
  assert.strictEqual(g.performQuestAction("continue").code, "not-a-transition");
});

// ============================ the comparison ============================

/** Drive a launched run all the way to the compare phase with A=rise/main, B=fall/main. */
function atCompare() {
  const { g, runId } = launched();
  edit(g, runId, song(RISE, MAIN));
  credit(g, runId, "A", "s1");
  assert.strictEqual(g.performQuestAction("continue").ok, true);
  edit(g, runId, song(FALL, MAIN));
  credit(g, runId, "B", "s2");
  assert.strictEqual(g.performQuestAction("continue").ok, true);
  assert.strictEqual(runOf(g, runId).phase, 2);
  return { g, runId };
}

test("auditioning is a listen: the grid becomes a speaker, never a page", t => {
  // MUTATION: drop the audition guard in noteEdit.
  // Applying A to hear it puts A's music on the grid while the DRAFT is B. Without the guard, the
  // next edit writes A's notes back as B — silently replacing the second path with the first.
  const { g, runId } = atCompare();
  alwaysStop(t, g);
  const bBefore = JSON.stringify(runOf(g, runId).versions.B.song);

  const a = g.performQuestAction("audition", { versionId: "A" });
  assert.strictEqual(a.ok, true);
  assert.strictEqual(g.contourSeq().length, 7, "A really is on the grid");
  assert.strictEqual(g.isRising(g.contourSeq()), true);

  g.noteEdit("a stray poke while listening");
  assert.strictEqual(JSON.stringify(runOf(g, runId).versions.B.song), bBefore,
    "the second path must survive listening to the first");
  assert.strictEqual(runOf(g, runId).versions.B.editRev, 1);

  g.stop();
  assert.strictEqual(g.performQuestAction("audition", { versionId: "C" }).code, "bad-version");
});

test("choosing hands the grid back, and the choice becomes the draft", t => {
  // MUTATION: leave the audition lock set after a choice, so the player cannot edit their own pick.
  const { g, runId } = atCompare();
  alwaysStop(t, g);
  for (const id of ["A", "B"]) {
    assert.strictEqual(g.performQuestAction("audition", { versionId: id }).ok, true);
    g.stop();
    const v = runOf(g, runId).versions[id];
    const r = g.transactQuestRun(runId, [{ type: "audition", versionId: id, editRev: v.editRev,
      sessionId: v.lastCompletePlaySessionId, at: Date.now() }]);
    assert.strictEqual(r.ok, true, "audition " + id + ": " + r.code);
  }
  assert.strictEqual(g.performQuestAction("compare").ok, true);
  assert.strictEqual(g.performQuestAction("choose", { versionId: "A" }).ok, true);

  const run = runOf(g, runId);
  assert.strictEqual(run.selection, "A");
  assert.strictEqual(run.draft, "A");
  assert.strictEqual(g.isRising(g.contourSeq()), true, "the chosen song is what is on the grid");

  g.applySong(song([[60, 0], [62, 2], [64, 4], [67, 6], [67, 8]], MAIN));
  g.noteEdit("a final touch");
  assert.strictEqual(runOf(g, runId).versions.A.editRev, 2, "editing is live again on the chosen draft");
  assert.strictEqual(runOf(g, runId).selection, "A", "and the choice is not forgotten by an edit");
});

// ============================ offering ============================

test("offering needs the phase's gates, and produces one ordinary saved song", t => {
  // MUTATION: offer without checking the gate, or write something other than a plain v3 song.
  const { g, runId } = atCompare();
  alwaysStop(t, g);
  assert.strictEqual(g.performQuestAction("offer").code, "gate-closed", "nothing compared or chosen yet");

  for (const id of ["A", "B"]) {
    assert.strictEqual(g.performQuestAction("audition", { versionId: id }).ok, true);
    g.stop();
    const v = runOf(g, runId).versions[id];
    g.transactQuestRun(runId, [{ type: "audition", versionId: id, editRev: v.editRev,
      sessionId: v.lastCompletePlaySessionId, at: Date.now() }]);
  }
  assert.strictEqual(g.performQuestAction("compare").ok, true);
  assert.strictEqual(g.performQuestAction("offer").code, "gate-closed", "compared, but nothing chosen");
  assert.strictEqual(g.performQuestAction("choose", { versionId: "B" }).ok, true);

  const before = g.getSaves().length;
  const r = g.performQuestAction("offer");
  assert.strictEqual(r.ok, true, r.code);

  const saves = g.getSaves();
  assert.strictEqual(saves.length, before + 1);
  const art = saves[0];
  assert.strictEqual(art.v, 3);
  assert.strictEqual(art.meta.title, "The Firefly Crossing");
  assert.strictEqual(art.meta.source.kind, "quest");
  assert.strictEqual(art.meta.source.runId, runId);
  assert.strictEqual(runOf(g, runId).status, "completed");
  assert.strictEqual(g.questCompleted("firefly-crossing"), true);
});

test("a title the player typed wins, and an empty one falls back to the quest's", t => {
  // MUTATION: always use the definition's default, or save an empty title.
  const { g, runId } = atCompare();
  alwaysStop(t, g);
  for (const id of ["A", "B"]) {
    g.performQuestAction("audition", { versionId: id }); g.stop();
    const v = runOf(g, runId).versions[id];
    g.transactQuestRun(runId, [{ type: "audition", versionId: id, editRev: v.editRev,
      sessionId: v.lastCompletePlaySessionId, at: Date.now() }]);
  }
  g.performQuestAction("compare");
  g.performQuestAction("choose", { versionId: "B" });
  assert.strictEqual(g.performQuestAction("offer", { title: "  Night Bridge  " }).ok, true);
  assert.strictEqual(g.getSaves()[0].meta.title, "Night Bridge");
});

// ============================ leaving ============================

test("leaving is not abandoning, and loses nothing", () => {
  // MUTATION: abandon on leave, or flush some quest autosave that does not exist.
  const { g, runId } = launched();
  edit(g, runId, song(RISE, MAIN));
  credit(g, runId, "A", "s1");
  const snapshot = JSON.stringify(runOf(g, runId));

  assert.strictEqual(g.performQuestAction("leave").ok, true);
  assert.strictEqual(runOf(g, runId).status, "active");
  assert.strictEqual(JSON.stringify(runOf(g, runId)), snapshot, "leaving writes nothing at all");
  assert.strictEqual(!!g.activeCompletionSessionId(), false, "and no session is left running");

  assert.strictEqual(g.enterQuestRun(runId).ok, true);
  assert.strictEqual(g.performQuestAction("abandon").ok, true);
  assert.strictEqual(runOf(g, runId).status, "abandoned");
});

test("a listening lock belongs to one comparison and never leaves it", t => {
  // MUTATION: leave questAuditionVersionId set across a scope change.
  // It is module state, not run state, and deliberately not persisted — a reload must land a child
  // editing their draft, never stuck unable to touch their own work. The same reasoning that cancels
  // a completion session on navigation applies to the lock.
  const { g, runId } = atCompare();
  alwaysStop(t, g);
  assert.strictEqual(g.performQuestAction("audition", { versionId: "A" }).ok, true);
  assert.strictEqual(g.questAuditionVersionId, "A");
  g.stop();

  g.setPlayScope({ kind: "package", packageId: "footsteps" });
  assert.strictEqual(g.questAuditionVersionId, null, "the lock does not follow you out of the quest");

  assert.strictEqual(g.enterQuestRun(runId).ok, true);
  assert.strictEqual(g.questAuditionVersionId, null, "and coming back does not restore it");
  assert.strictEqual(g.isFalling(g.contourSeq()), true, "the draft is what is on the grid, not the last thing heard");
});

test("undo is refused while listening, even once the grid has been poked", t => {
  // MUTATION: drop the guard in undoEdit/redoEdit.
  // A poke during an audition is refused persistence by the lock — but tx() journals it BEFORE
  // noteEdit is consulted, so the journal is not empty after all. Undoing that entry would restore a
  // snapshot the run does not have, putting the editor and the run back out of step.
  const { g, runId } = atCompare();
  alwaysStop(t, g);
  assert.strictEqual(g.performQuestAction("audition", { versionId: "A" }).ok, true);
  const bBefore = JSON.stringify(runOf(g, runId).versions.B.song);

  g.modelSetCell(g.ROWS - 1, 9, true);                      // a stray poke: journaled, never persisted
  const poked = g.currentSong().tracks[0].notes.length;
  g.undoEdit();
  assert.strictEqual(g.currentSong().tracks[0].notes.length, poked, "undo did nothing, because it may not");
  g.redoEdit();
  assert.strictEqual(g.currentSong().tracks[0].notes.length, poked);
  assert.strictEqual(JSON.stringify(runOf(g, runId).versions.B.song), bBefore, "and the draft is untouched");
});

test("undo never walks back into a song the game applied", t => {
  // MUTATION: drop journalClear() after entering, auditioning, or choosing.
  // Those applies are not the player's work — the same rule openStudioWith() and the cloud load
  // already follow. Without it, undo steps back into a version the player was only listening to,
  // and the fix that makes undo durable would then persist it over the draft they chose.
  const { g, runId } = launched();
  edit(g, runId, song(RISE, MAIN));
  credit(g, runId, "A", "s1");

  g.setPlayScope({ kind: "package", packageId: "footsteps" });
  assert.strictEqual(g.enterQuestRun(runId).ok, true);
  const onResume = JSON.stringify(runOf(g, runId).versions.A.song);
  for (let i = 0; i < 4; i++) g.undoEdit();      // more presses than there is history for
  assert.strictEqual(JSON.stringify(runOf(g, runId).versions.A.song), onResume,
    "resuming is not a step to take back, however many times you press it");

  // now the whole comparison, and two undos after choosing
  assert.strictEqual(g.performQuestAction("continue").ok, true);
  edit(g, runId, song(FALL, EVEN));
  credit(g, runId, "B", "s2");
  assert.strictEqual(g.performQuestAction("continue").ok, true);
  alwaysStop(t, g);
  for (const id of ["A", "B"]) {
    assert.strictEqual(g.performQuestAction("audition", { versionId: id }).ok, true);
    g.stop();
    const v = runOf(g, runId).versions[id];
    g.transactQuestRun(runId, [{ type: "audition", versionId: id, editRev: v.editRev,
      sessionId: v.lastCompletePlaySessionId, at: Date.now() }]);
  }
  assert.strictEqual(g.performQuestAction("compare").ok, true);
  assert.strictEqual(g.performQuestAction("choose", { versionId: "B" }).ok, true);

  g.modelSetCell(g.ROWS - 1, 9, true);
  // asserted after EVERY press, not just the last: keep going far enough and the journal runs out
  // back into the pre-comparison state, which is also B — so only checking the end proves nothing.
  for (let i = 0; i < 5; i++) {
    g.undoEdit();
    assert.strictEqual(g.isFalling(g.contourSeq()), true,
      "undo " + (i + 1) + " walked back into a song the player was only listening to");
  }
  assert.strictEqual(g.kickWalk8(), true);
  assert.strictEqual(runOf(g, runId).draft, "B");
});

// NO test for the matching guard in redoEdit(). It cannot fire today: tx() empties journalRedo on
// every commit, and applying the audition's song is a commit — so the redo stack is always empty while
// a lock is held, and a test would pass whether the guard were there or not. That is a false proof,
// and this project has caught five of those already. The reasoning lives in the code beside the guard.

test("every action refuses to run outside a quest", () => {
  // MUTATION: let the controller act on whatever scope happens to be current.
  const { g } = launched();
  g.setPlayScope({ kind: "studio" });
  for (const id of ["continue", "audition", "compare", "choose", "offer", "abandon", "leave"])
    assert.strictEqual(g.performQuestAction(id, { versionId: "A" }).code, "wrong-scope", id);
  assert.strictEqual(g.performQuestAction("nonsense").code, "wrong-scope");
});

test("an unknown action is refused rather than quietly doing nothing", () => {
  // MUTATION: return ok for anything unrecognised.
  const { g } = launched();
  assert.strictEqual(g.performQuestAction("teleport").code, "unknown-action");
});
