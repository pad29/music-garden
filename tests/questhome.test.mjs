// Who may begin a quest, and what Home shows.
//
// Q22's rule is that a quest waits rather than nags: ONE calm card, no badge, no dot, no exclamation
// mark, nothing that escalates. A second quest is reachable through a fixed trail link, never
// advertised beside the first.
//
// Eligibility is an AND over package completion and nothing else. A quest never gates a package, a
// palette, an instrument, a tool or a Studio control — it is a door, not a fence.
//
// Each test names the mutation it must catch.

import { test } from "node:test";
import assert from "node:assert";
import { loadQuestGame as loadGame, completeDealtSong } from "./helpers/quest-fixtures.mjs";

const g = loadGame();
const DEFS = g.QUEST_DEFINITIONS;
const FIREFLY = DEFS["firefly-crossing"];
const PREREQS = FIREFLY.prerequisites.earnedByPackageIds;

const progressWith = (...completed) => {
  const packages = {};
  for (const id of completed) packages[id] = { level: 0, maxLevel: 0, completed: true };
  return { packages };
};
const ALL_DONE = progressWith(...PREREQS);
// A live run now carries the hand it was dealt, and Home refuses to advertise a Continue the door
// would bounce — so a fixture without one is a run the game would rightly not offer.
const DEALT = (() => {
  const def = DEFS["firefly-crossing"], k = g.QUEST_SETUP_KINDS[def.setup.kind];
  for (let i = 0; i < 12; i++) {
    const hand = k.generate(def.setup, def, g.questRng("home-fixture:" + i));
    if (!k.validateInstance(hand, def.setup, def) && !g.questSetupCompletable(def, hand)) return hand;
  }
  throw new Error("no usable fixture hand");
})();
const run = (over = {}) => ({ runId: "r1", questId: "firefly-crossing", definitionVersion: 2,
  setup: JSON.parse(JSON.stringify(DEALT)),
  status: "active", phase: 0, draft: "A", selection: null, versions: {}, updatedAt: 10, ...over });
const rows = (progress, runs = {}, hist = {}) => g.questEligibility(DEFS, progress, runs, hist);
const one = (progress, runs = {}, hist = {}) => rows(progress, runs, hist)[0];

// ============================ eligibility ============================

test("every prerequisite must be finished, not just one of them", () => {
  // MUTATION: use `some` instead of `every`, or read a capability out of progress.
  assert.strictEqual(PREREQS.length, 2, "the fixture needs two, or this proves nothing");
  assert.strictEqual(one({ packages: {} }).eligible, false);
  assert.strictEqual(one(progressWith(PREREQS[0])).eligible, false);
  assert.deepEqual(one(progressWith(PREREQS[0])).missing, [PREREQS[1]]);
  assert.strictEqual(one(ALL_DONE).eligible, true);
  assert.deepEqual(one(ALL_DONE).missing, []);
});

test("a package half-played is not a package finished", () => {
  // MUTATION: accept any progress record, or read `level`/`maxLevel` instead of `completed`.
  const partway = { packages: { [PREREQS[0]]: { level: 3, maxLevel: 5, completed: false },
                                [PREREQS[1]]: { level: 0, maxLevel: 0, completed: true } } };
  assert.strictEqual(one(partway).eligible, false);
  assert.deepEqual(one(partway).missing, [PREREQS[0]]);
});

test("a run already going means Continue, never Begin", () => {
  // MUTATION: offer Begin beside a live run — which would quietly abandon the song in progress.
  assert.strictEqual(one(ALL_DONE).action, "begin");
  assert.strictEqual(one(ALL_DONE, { r1: run() }).action, "continue");
  assert.strictEqual(one(ALL_DONE, { r1: run() }).liveRunId, "r1");

  // a run stuck mid-save is still this child's run
  assert.strictEqual(one(ALL_DONE, { r1: run({ status: "offering" }) }).action, "continue");
  // …and a run whose dealt hand no longer fits its rule is not advertised either: Home and the door
  // ask one question, so a Continue that the door would bounce is never offered. D6 found this with a
  // replaced definition; a stale task instance is the same defect in the new field's clothes.
  assert.strictEqual(one(ALL_DONE, { r1: run({ setup: null }) }).action, "begin");
  assert.strictEqual(one(ALL_DONE, { r1: run({ setup: { kind: "waypoints", generatorVersion: 1,
    waypoints: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }] } }) }).action, "begin");

  // …but a finished or abandoned one is not
  for (const status of ["completed", "abandoned"]) {
    const r = one(ALL_DONE, { r1: run({ status }) });
    assert.strictEqual(r.liveRunId, null, status);
    assert.strictEqual(r.action, "begin", status);
  }
});

test("a quest already finished is offered again as a new version", () => {
  // MUTATION: hide a completed quest, or call it Begin as though it had never happened.
  const hist = { "firefly-crossing": { questId: "firefly-crossing", lastRunId: "old" } };
  assert.strictEqual(one(ALL_DONE, {}, hist).action, "replay");
  assert.strictEqual(one(ALL_DONE, {}, hist).completed, true);
  assert.strictEqual(one({ packages: {} }, {}, hist).action, "locked",
    "prerequisites still come first, however many times it has been played");
});

test("eligibility reads progress and nothing else", () => {
  // MUTATION: consult the live game — the active scope, the toolbox, the palette.
  // It is pure so that Home can ask about a profile it is not currently playing.
  const before = JSON.stringify({ scope: g.activeScope && g.activeScope.kind, palette: g.paletteId });
  const a = rows(ALL_DONE), b = rows(ALL_DONE);
  assert.deepEqual(a, b, "the same question twice must give the same answer");
  assert.strictEqual(JSON.stringify({ scope: g.activeScope && g.activeScope.kind, palette: g.paletteId }),
    before, "and asking must change nothing");
});

// ============================ what Home surfaces ============================

const card = (progress, runs = {}, hist = {}) => g.questHomeCard(DEFS, progress, runs, hist);

test("nothing is surfaced until the prerequisites are done", () => {
  // MUTATION: advertise a locked quest, so a child is shown a door they cannot open.
  assert.strictEqual(card({ packages: {} }), null);
  assert.strictEqual(card(progressWith(PREREQS[0])), null);
  assert.notStrictEqual(card(ALL_DONE), null);
});

test("the card invites once, and never nags", () => {
  // MUTATION: add a badge count, an exclamation mark, a "new" flag or a reminder.
  // Q22 is explicit: no exclamation mark, no badge count, no pulsing dot, no escalation.
  const c = card(ALL_DONE);
  assert.strictEqual(c.kind, "begin");
  assert.strictEqual(c.title, FIREFLY.title);
  assert.strictEqual(c.meta, "About " + FIREFLY.presentation.estimateMinutes + " minutes");
  assert.strictEqual(c.label, "Begin quest");

  // MUTATION: borrow brief.intentionText for the card.
  // That string is written to be read INSIDE the quest — an instruction, phase by phase, 88 characters
  // long. An invitation is a different job, so it is a different field. GPT's tester called the
  // register, and the fix is a schema field rather than a cleverer fallback.
  assert.strictEqual(c.subtitle, FIREFLY.presentation.cardText);
  assert.strictEqual(c.subtitle, "A crossing for two powers");
  assert.notStrictEqual(c.subtitle, FIREFLY.brief.intentionText);
  assert.strictEqual(c.subtitle.length <= 60, true, "a card line, not a paragraph");

  const words = JSON.stringify(c).toLowerCase();
  assert.strictEqual(words.includes("!"), false, "nothing here raises its voice");
  for (const w of ["badge", "new!", "unread", "reminder", "expires", "today", "streak", "don't miss"])
    assert.strictEqual(words.includes(w), false, "found " + w);
});

test("a run in progress is offered as itself, with where it got to", () => {
  // MUTATION: show Begin for a quest that is already under way.
  const c = card(ALL_DONE, { r1: run({ phase: 1 }) });
  assert.strictEqual(c.kind, "continue");
  assert.strictEqual(c.runId, "r1");
  assert.strictEqual(c.title, "Continue " + FIREFLY.title);
  assert.strictEqual(c.subtitle, "Phase 2 of 3 · saved on this device");
  assert.strictEqual(c.label, "Continue");
});

test("a song still waiting to be put away comes before anything else", () => {
  // MUTATION: order by recency alone, so a newer active run buries a failed save.
  // The offering run holds a song that was never written. Nothing outranks getting it saved.
  const c = card(ALL_DONE,
    { r1: run({ status: "offering", updatedAt: 1 }), r2: run({ runId: "r2", updatedAt: 999 }) });
  assert.strictEqual(c.kind, "retry");
  assert.strictEqual(c.runId, "r1");
  assert.strictEqual(c.label, "Try saving it again");
});

test("the most recent run wins, and the same profile always surfaces the same thing", () => {
  // MUTATION: pick whichever run the object happens to yield first.
  const runs = { b: run({ runId: "b", updatedAt: 50 }), a: run({ runId: "a", updatedAt: 90 }) };
  assert.strictEqual(card(ALL_DONE, runs).runId, "a");

  // a dead tie must still be decided, and decided the same way every time
  const tied = { z: run({ runId: "z", updatedAt: 7 }), a: run({ runId: "a", updatedAt: 7 }) };
  const first = card(ALL_DONE, tied).runId;
  for (let i = 0; i < 5; i++) assert.strictEqual(card(ALL_DONE, tied).runId, first);
  assert.strictEqual(first, "a", "ties break on the id, not on insertion order");
});

test("a run whose quest the build no longer ships is stepped over", () => {
  // MUTATION: surface any run, then read a definition that is not there — a crash on the Home screen,
  // for a profile that merely outlived a quest.
  const orphan = { r1: run({ questId: "withdrawn-quest", updatedAt: 999 }) };
  const c = card(ALL_DONE, orphan);
  assert.strictEqual(c.kind, "begin", "it falls through to what this build does have");
  assert.strictEqual(c.questId, "firefly-crossing");

  // …and with nothing else to offer, it surfaces nothing rather than half a card
  assert.strictEqual(card({ packages: {} }, orphan), null);
  assert.deepEqual(trail(ALL_DONE, orphan).map(r => r.questId), ["firefly-crossing"],
    "the trail lists what ships, not what a profile remembers");
});

// ============================ the trail ============================

const trail = (progress, runs = {}, hist = {}) => g.questTrailModel(DEFS, progress, runs, hist);

test("the trail is eligible or completed quests, and nothing a child cannot open", () => {
  // MUTATION: list locked quests too.
  // I had them listed, greyed, naming their prerequisites — informational rather than pushy, and GPT
  // agreed it escalates nothing. But §9.4 says "other eligible or completed quests", the owner approved
  // that, and a list of doors you cannot open is a to-do list by another name. Every row here is one
  // that can be pressed.
  assert.deepEqual(trail({ packages: {} }), [], "nothing to open, so nothing to list");
  for (const row of trail(ALL_DONE)) assert.strictEqual(row.enabled, true);
  const hist = { "firefly-crossing": { questId: "firefly-crossing", lastRunId: "old" } };
  for (const row of trail(ALL_DONE, {}, hist)) assert.strictEqual(row.enabled, true);
});

test("a finished quest lives in the trail, and starts a new version", () => {
  // MUTATION: offer Replay on the Home card too, so a finished quest keeps asking to be replayed.
  const hist = { "firefly-crossing": { questId: "firefly-crossing", lastRunId: "old" } };
  assert.strictEqual(card(ALL_DONE, {}, hist), null, "a finished quest does not sit on the map");
  const row = trail(ALL_DONE, {}, hist)[0];
  assert.strictEqual(row.action, "replay");
  assert.strictEqual(row.label, "Start a new version");
  assert.strictEqual(row.enabled, true);
});

test("the trail says which of its rows is the one already on the card", () => {
  // MUTATION: drop the flag and let the same quest be advertised twice at once.
  // One invitation at a time is the whole of Q22, and a list that echoes the card is a second
  // invitation wearing a different hat. The renderer filters on this flag.
  const t = trail(ALL_DONE)[0];
  assert.strictEqual(t.surfaced, true);

  const hist = { "firefly-crossing": { questId: "firefly-crossing", lastRunId: "old" } };
  assert.strictEqual(trail(ALL_DONE, {}, hist)[0].surfaced, false,
    "and a finished one is only ever in the trail");
});

// ============================ replay never overwrites ============================

test("starting a new version writes a new song, never over the old one", () => {
  // MUTATION: key the artifact on the quest instead of the run, so a replay silently replaces the
  // song a child offered the first time.
  const g2 = loadGame({ fresh: true });
  const song = (mel) => ({ v: 3, meta: { title: null, created: 0, updated: 0, author: null },
    palette: "pentatonic", time: { cols: 16, tempo: 108, groove: 0 },
    tracks: [{ kind: "melody", voice: "musicbox", notes: mel.map(([p, c]) => ({ p, c, len: 1 })) },
             { kind: "drums", hits: [[0, 0], [0, 4], [0, 8], [0, 12]].map(([lane, c]) => ({ lane, c })) }] });
  const RISE = [[60, 0], [62, 2], [64, 4], [67, 6]], FALL = [[67, 0], [64, 2], [62, 4], [60, 6]];

  const finish = (melA, melB, title) => {
    const r = g2.startQuestRun("firefly-crossing");
    assert.strictEqual(r.ok, true, r.code);
    const id = r.runId, at = () => g2.QUEST_RUNS[id];
    const T = ops => { const x = g2.transactQuestRun(id, ops); assert.strictEqual(x.ok, true, x.code); };
    g2.applySong(completeDealtSong(g2, song(melA))); g2.noteEdit("e");
    T([{ type: "completePass", versionId: "A", editRev: at().versions.A.editRev, sessionId: "s1", at: 1 },
       { type: "audition", versionId: "A", editRev: at().versions.A.editRev, sessionId: "s1", at: 1 }]);
    assert.strictEqual(g2.performQuestAction("continue").ok, true);
    g2.applySong(completeDealtSong(g2, song(melB))); g2.noteEdit("e");
    T([{ type: "completePass", versionId: "B", editRev: at().versions.B.editRev, sessionId: "s2", at: 2 },
       { type: "audition", versionId: "B", editRev: at().versions.B.editRev, sessionId: "s2", at: 2 }]);
    assert.strictEqual(g2.performQuestAction("continue").ok, true);
    g2.performQuestAction("compare");
    g2.performQuestAction("choose", { versionId: "B" });
    assert.strictEqual(g2.performQuestAction("offer", { title }).ok, true);
    return id;
  };

  const first = finish(RISE, FALL, "First Crossing");
  assert.strictEqual(g2.getSaves().length, 1);
  assert.strictEqual(g2.questCompleted("firefly-crossing"), true);

  const second = finish(FALL, RISE, "Second Crossing");
  assert.notStrictEqual(second, first);
  const titles = g2.getSaves().map(s => s.meta.title).sort();
  assert.deepEqual(titles, ["First Crossing", "Second Crossing"],
    "the first offering must survive the second");
  const ids = g2.getSaves().map(s => s.meta.localId);
  assert.strictEqual(new Set(ids).size, 2, "two runs, two artifact ids");
});
