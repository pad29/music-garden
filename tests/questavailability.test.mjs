// A7 migration: retain the five non-fork guarantees from questconfirm.test.mjs.
// These are model/controller tests, not assertions about the stubbed DOM or audio.
import { test } from "node:test";
import assert from "node:assert";
import { loadQuestGame, completeDealtSong } from "./helpers/quest-fixtures.mjs";

const clone = x => JSON.parse(JSON.stringify(x));
const freeze = x => {
  if (x && typeof x === "object") { Object.values(x).forEach(freeze); Object.freeze(x); }
  return x;
};
function launch(questId = "firefly-crossing") {
  const g = loadQuestGame({ fresh: true }), started = g.startQuestRun(questId);
  assert.strictEqual(started.ok, true, started.code);
  const id = started.runId, d = g.QUEST_DEFINITIONS[questId];
  const run = () => g.QUEST_RUNS[id];
  const model = () => g.questShellModel(run(), d);
  return { g, id, d, run, model };
}
function credit(f, vid = f.run().draft) {
  const v = f.run().versions[vid];
  assert.strictEqual(f.g.transactQuestRun(f.id, [{ type: "completePass", versionId: vid,
    editRev: v.editRev, sessionId: vid + ":" + v.editRev, at: 20 + v.editRev }]).ok, true);
}
function ready(f, matched = false) {
  const { g, run } = f, vid = run().draft;
  const song = clone(run().versions[vid].song);
  // Independently chosen beats: an isolated offbeat matches no suggested steady family;
  // main beats -> even eighths supplies a real matched transform with a changed beat.
  song.tracks[1].hits = matched
    ? (vid === "A" ? [0, 4, 8, 12] : [0, 2, 4, 6, 8, 10, 12, 14]).map(c => ({ lane: 0, c }))
    : [{ lane: 1, c: vid === "A" ? 1 : 3 }];
  g.applySong(completeDealtSong(g, song)); g.noteEdit("availability-fixture"); credit(f);
  const ev = g.questEvaluateRun(run(), f.d);
  assert.strictEqual(ev.ok, true);
  assert.strictEqual(ev.readiness.ok, true);
  assert.strictEqual(ev.procedural.canAdvance, true);
  assert.strictEqual(ev.musical.matchedRouteIds.length > 0, matched, "fixture route premise");
}
function reachCompare(f, matched = false) {
  for (const phase of [0, 1]) {
    ready(f, matched);
    assert.strictEqual(f.g.performQuestAction("continue").ok, true);
    assert.strictEqual(f.run().phase, phase + 1);
  }
}
function pickHeardPaths(f, vid = "B") {
  try {
    for (const versionId of [vid === "A" ? "B" : "A", vid]) {
      assert.strictEqual(f.g.performQuestAction("pick", { versionId }).ok, true);
      const v = f.run().versions[versionId];
      f.g.onCompletePass({ runId:f.id, versionId, editRev:v.editRev,
        sessionId:versionId + ":comparison", purpose:"audition" });
    }
  } finally { if (f.g.playing) f.g.stop(); }
}

test("readiness and declared gate sweeps agree between evaluator model and controller gate", () => {
  // MUTATION: omit/invert readiness in canAdvance, use A for B, hardcode gates, or replace AND by OR.
  for (const questId of ["firefly-crossing", "waking-woods"]) {
    const f = launch(questId); ready(f);
    assert.strictEqual(f.g.performQuestAction("continue").ok, true);
    ready(f);
    const { g } = f, base = clone(f.run());
    for (const phase of [0, 1]) for (let mask = 0; mask < 8; mask++)
      for (const played of [false, true]) for (const edited of [false, true])
        for (const gateIds of [[], ["playback.complete-since-last-edit"], ["edit.after-fork"],
          ["edit.after-fork", "playback.complete-since-last-edit"]]) {
          const d = clone(f.d), r = clone(base), vid = phase ? "B" : "A";
          r.phase = phase; r.draft = vid;
          d.phases[phase].procedure.gateIds = gateIds;
          const v = r.versions[vid], song = v.song;
          v.forkedFrom = edited ? { versionId: "other", editRev: 0 } : null;
          v.lastCompletePlayRev = played ? v.editRev : null;
          if (mask & 1) song.tracks[0].notes = song.tracks[0].notes.filter(n => n.c !== r.setup.waypoints[0].col);
          if (mask & 2) song.tracks[0].notes = song.tracks[0].notes.filter(n => n.c >= r.setup.waypoints[0].col);
          if (mask & 4) song.tracks[1].hits = [];
          const open = (!gateIds.includes("playback.complete-since-last-edit") || played)
            && (!gateIds.includes("edit.after-fork") || edited);
          const expected = mask === 0 && open;
          const label = JSON.stringify({ questId, phase, mask, played, edited, gateIds });
          const ev = g.questEvaluateRun(r, d), model = g.questShellModel(r, d);
          assert.strictEqual(ev.ok, true, label);
          assert.strictEqual(ev.readiness.ok, mask === 0, label);
          assert.strictEqual(ev.procedural.canAdvance, expected, label);
          assert.strictEqual(g.questPhaseGate(d, phase, vid)(r), expected, label);
          assert.strictEqual(model.actions.find(a => a.id === "continue").enabled, expected, label);

          // Readiness is above declared gates. Older definitions without setup have no such task.
          delete d.setup;
          assert.strictEqual(g.questEvaluateRun(r, d).procedural.canAdvance, open, label);
          assert.strictEqual(g.questPhaseGate(d, phase, vid)(r), open, label);
        }
  }
});

test("comparison offer availability follows its gates across all readiness combinations", () => {
  // MUTATION: apply readiness to canOffer, leave canAdvance enabled in compare, or ignore a gate.
  const f = launch(); reachCompare(f); pickHeardPaths(f);
  for (const selected of ["A", "B"]) for (let mask = 0; mask < 8; mask++)
    for (const played of [false, true]) for (const auditioned of [false, true]) for (const chosen of [false, true]) {
      const r = clone(f.run()); r.selection = chosen ? selected : null; r.draft = selected;
      const v = r.versions[selected];
      if (mask & 1) v.song.tracks[0].notes = v.song.tracks[0].notes.filter(n => n.c !== r.setup.waypoints[0].col);
      if (mask & 2) v.song.tracks[0].notes = v.song.tracks[0].notes.filter(n => n.c >= r.setup.waypoints[0].col);
      if (mask & 4) v.song.tracks[1].hits = [];
      v.lastCompletePlayRev = played ? v.editRev : null;
      v.auditionedRev = auditioned ? v.editRev : null;
      const ev = f.g.questEvaluateRun(r, f.d), m = f.g.questShellModel(r, f.d);
      const expected = played && auditioned && chosen;
      assert.deepEqual(ev.readiness, { ok: true, missing: [] });
      assert.strictEqual(ev.procedural.canAdvance, false);
      assert.strictEqual(ev.procedural.canOffer, expected);
      assert.strictEqual(f.g.questPhaseGate(f.d, 2, selected)(r), expected);
      assert.strictEqual(m.actions.find(a => a.id === "offer").enabled, expected);

    }
});

test("questEvaluateRun builds all version evidence and stays detached and pure", () => {
  // MUTATION: build only the draft/A evidence, swap snapshots, use the live grid, or mutate inputs.
  // Construct this fixture without calling the seam (including indirectly through the shell).
  // Otherwise an idempotent input mutation can already be present in our "before" snapshot.
  const g = loadQuestGame({ fresh: true }), d = clone(g.QUEST_DEFINITIONS["firefly-crossing"]);
  const witness = d.witnesses.find(w => w.songs.B);
  const r = g.newQuestRun({ runId: "pure-run", questId: d.id, definitionVersion: d.v,
    song: witness.songs.A, span: { start: 0, end: 16 }, at: 1 });
  r.phase = 1; r.draft = "B";
  r.versions.B = { ...clone(r.versions.A), song: clone(witness.songs.B), editRev: 1,
    lastCompletePlayRev: 1, forkedFrom: { versionId: "A", editRev: 0 } };
  // An extra version ensures evidence construction is generic, not special-cased to A/B.
  r.versions.C = clone(r.versions.A); r.versions.C.song.tracks[1].hits = [];
  const snapshot = JSON.stringify({ r, d });
  const direct = g.evaluateQuest(d, { versions: Object.fromEntries(Object.entries(r.versions)
    .map(([id, v]) => [id, g.songEvidence(v.song)])) }, r);
  assert.strictEqual(direct.ok, true);
  assert.ok(direct.musical.matchedRouteIds.length > 0);
  const evaluate = g.evaluateQuest, evidenceCalls = [];
  g.evaluateQuest = (def, evidence, run) => {
    assert.strictEqual(def, d); assert.strictEqual(run, r);
    evidenceCalls.push(clone(evidence)); return evaluate(def, evidence, run);
  };
  assert.deepEqual(g.questEvaluateRun(r, d), direct);
  assert.strictEqual(JSON.stringify({ r, d }), snapshot);
  freeze(r); freeze(d);
  g.setPalette("diatonic"); g.grid[0][0] = 1; g.drumG[0][0] = 1;
  g.Store.set = () => { throw new Error("pure evaluation attempted a write"); };
  const result = g.questEvaluateRun(r, d);
  assert.deepEqual(result, direct);
  for (const ev of evidenceCalls) {
    assert.deepEqual(Object.keys(ev.versions).sort(), ["A", "B", "C"]);
    for (const id of ["A", "B", "C"]) assert.deepEqual(ev.versions[id], g.songEvidence(r.versions[id].song));
  }
  result.musical.matchedRouteIds.push("caller-corruption");
  assert.deepEqual(g.questEvaluateRun(r, d), direct);
  assert.strictEqual(JSON.stringify({ r, d }), snapshot);
});

test("the shell and controller both consume the shared evaluation seam", () => {
  // MUTATION: give the model its own readiness-and-gates computation again
  // (`gatesOpen && missing.length===0`) instead of asking questPhaseGate.
  //
  // The seam used to be held by an accident: the confirmation fork made the controller call the
  // evaluator on its way past, and removing the fork removed that call. GPT's tester caught the
  // accident ending. The remedy is the opposite direction to the one it proposed — the DOOR is now
  // the single authority and the button reads it, rather than the controller re-asking the evaluator
  // before a reducer gate that would then check the same thing again. Two answers that have to agree
  // is what drifted in the first place, and a second guard in front of the gate would make the gate
  // untestable.
  //
  // So: stubbing the gate must move BOTH surfaces. If the button can be lit while the door is shut —
  // or dark while it is open — they are computing it twice again.
  const f = launch(); ready(f, true);
  const { g } = f, realGate = g.questPhaseGate, before = clone(f.run());

  g.questPhaseGate = () => () => false;
  assert.strictEqual(f.model().actions.find(a => a.id === "continue").enabled, false,
    "a shut door must leave the button dark");
  assert.deepEqual(g.performQuestAction("continue"), { ok: false, code: "gate-closed" });
  assert.strictEqual(f.run().phase, before.phase, "and nothing moves");

  g.questPhaseGate = realGate;
  assert.strictEqual(f.model().actions.find(a => a.id === "continue").enabled, true,
    "an open door must light it");
  assert.strictEqual(g.performQuestAction("continue").ok, true);
  assert.strictEqual(f.run().phase, before.phase + 1);
});

test("confirmation is not an authorable procedural gate", () => {
  // MUTATION: register a confirmation primitive or permit unknown gate ids.
  const f = launch(), { g } = f;
  for (const id of ["needs-confirm", "shape-more", "continue", "questConfirm", "confirmation",
    "confirmation.required", "confirmation.accepted", "quest.confirm", "route.unmatched"]) {
    assert.strictEqual(g.QUEST_PRIMITIVES[id], undefined);
    const d = clone(f.d); d.phases[0].procedure.gateIds.push(id);
    g.loadQuestCatalog(JSON.stringify({ v: 1, definitions: [d] }), "official");
    assert.ok(g.QUEST_CATALOG_ERRORS.some(e => ["not-primitive-id", "no-such-gate"].includes(e.code)), id);
    assert.deepEqual(Object.keys(g.QUEST_DEFINITIONS), []);
    assert.strictEqual(g.questPhaseGate(d, 0, "A")(f.run()), false);
  }
  assert.deepEqual(Object.entries(g.QUEST_PRIMITIVES).filter(([, p]) => p.kind === "procedural")
    .map(([id]) => id).sort(), ["comparison.auditioned-both", "comparison.chosen", "edit.after-fork", "playback.complete-since-last-edit"]);
});
