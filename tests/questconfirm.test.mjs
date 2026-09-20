// Step E commit 4: Q6's choice is transient, exact, and never a musical veto.
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
  const model = () => g.questShellModel(run(), d, { confirm: g.questConfirm });
  return { g, id, d, run, model };
}
function credit(f, vid = f.run().draft) {
  const v = f.run().versions[vid];
  assert.strictEqual(f.g.transactQuestRun(f.id, [{ type: "completePass", versionId: vid,
    editRev: v.editRev, sessionId: vid + ":" + v.editRev, at: 20 + v.editRev }]).ok, true);
}
function ready(f, matched = false) {
  const { g, run } = f, vid = run().draft;
  const song = completeDealtSong(g, run().versions[vid].song);
  // Independently chosen beats: an isolated offbeat matches no suggested steady family;
  // main beats -> even eighths supplies a real matched transform with a changed beat.
  song.tracks[1].hits = matched
    ? (vid === "A" ? [0, 4, 8, 12] : [0, 2, 4, 6, 8, 10, 12, 14]).map(c => ({ lane: 0, c }))
    : [{ lane: 1, c: vid === "A" ? 1 : 3 }];
  g.applySong(song); g.noteEdit("confirmation-fixture"); credit(f);
  const ev = g.questEvaluateRun(run(), f.d);
  assert.strictEqual(ev.ok, true);
  assert.strictEqual(ev.readiness.ok, true);
  assert.strictEqual(ev.procedural.canAdvance, true);
  assert.strictEqual(ev.musical.matchedRouteIds.length > 0, matched, "fixture route premise");
}
function ask(f) {
  const before = clone(f.run()), stored = clone(f.g.Store.get("questRuns"));
  assert.deepEqual(f.g.performQuestAction("continue"), { ok: false, code: "needs-confirm" });
  assert.deepEqual(f.run(), before, "asking does not advance, fork, or alter the run");
  assert.deepEqual(f.g.Store.get("questRuns"), stored, "asking does not persist an answer");
  assert.strictEqual(f.model().asking, true);
}
function reachCompare(f, matched = false) {
  for (const phase of [0, 1]) {
    ready(f, matched);
    if (!matched) ask(f);
    assert.strictEqual(f.g.performQuestAction("continue").ok, true);
    assert.strictEqual(f.run().phase, phase + 1);
  }
}
function choose(f, vid = "B") {
  for (const versionId of ["A", "B"]) {
    const v = f.run().versions[versionId];
    assert.strictEqual(f.g.transactQuestRun(f.id, [{ type: "audition", versionId,
      editRev: v.editRev, sessionId: v.lastCompletePlaySessionId, at: 40 }]).ok, true);
  }
  assert.strictEqual(f.g.performQuestAction("compare").ok, true);
  assert.strictEqual(f.g.performQuestAction("choose", { versionId: vid }).ok, true);
}

test("unmatched paths ask once per early phase and finish with the same payoff", () => {
  // MUTATION: skip the question, ask forever, hard-gate unmatched routes, or diminish their payoff.
  for (const questId of ["firefly-crossing", "waking-woods"]) {
    const results = [];
    for (const matched of [false, true]) {
      const f = launch(questId), { g, run, model } = f;
      reachCompare(f, matched);
      assert.strictEqual(g.questConfirm, null);
      choose(f);
      const offered = clone(run().versions.B.song);
      assert.strictEqual(g.performQuestAction("offer", { title: "My path" }).ok, true);
      assert.strictEqual(run().status, "completed");
      assert.strictEqual(g.questCompleted(questId), true);
      const saves = g.getSaves();
      assert.strictEqual(saves.length, 1);
      assert.strictEqual(saves[0].v, 3);
      assert.strictEqual(saves[0].meta.title, "My path");
      assert.deepEqual(saves[0].tracks, offered.tracks);
      assert.strictEqual(model().asking, false);
      assert.strictEqual(model().confirmText, "");
      results.push({ saved: model().saved, actions: model().actions,
        historyKeys: Object.keys(g.QUEST_HISTORY[questId]).sort(), artifactKeys: Object.keys(run().artifact).sort() });
    }
    assert.deepEqual(results[0], results[1], "decision #11: identical payoff and completion shape");
  }
});

test("matched paths advance on the first press without a confirmation", () => {
  // MUTATION: ask regardless of route matches, including when a stale unrelated question exists.
  for (const questId of ["firefly-crossing", "waking-woods"]) {
    const f = launch(questId);
    for (const phase of [0, 1]) {
      ready(f, true);
      f.g.questConfirm = { ...f.g.questConfirmKeyFor(f.run(), f.d), runId: "another-run" };
      assert.strictEqual(f.model().asking, false);
      assert.strictEqual(f.model().confirmText, "");
      assert.strictEqual(f.g.performQuestAction("continue").ok, true);
      assert.strictEqual(f.run().phase, phase + 1);
      assert.strictEqual(f.g.questConfirm, null);
    }
  }
});

test("the question offers two model actions and shape-more really cancels it", () => {
  // MUTATION: omit either action, use authored copy, disable an answer, or leave shape-more inert.
  const f = launch(); ready(f);
  assert.strictEqual(f.model().asking, false);
  assert.strictEqual(f.model().confirmText, "");
  ask(f);
  assert.deepEqual(f.model().actions, [
    { id: "shape-more", label: "Shape it more", enabled: true },
    { id: "continue", label: "Keep it anyway", enabled: true },
    { id: "leave", label: "Leave for now", enabled: true },
  ]);
  assert.strictEqual(f.model().confirmText, f.g.QUEST_CONFIRM_TEXT);
  assert.ok(f.g.QUEST_CONFIRM_TEXT.length > 0);
  assert.strictEqual(f.g.questLastRendered.asking, true, "shell passes the transient key into its model");
  const before = clone(f.run());
  assert.strictEqual(f.g.performQuestAction("shape-more").ok, true);
  assert.strictEqual(f.g.questConfirm, null);
  assert.strictEqual(f.model().asking, false);
  assert.strictEqual(f.model().confirmText, "");
  assert.deepEqual(f.run(), before);
  ask(f);
  assert.strictEqual(f.g.performQuestAction("continue").ok, true);
});

test("confirmation keys bind every identity field and reject absent or stale answers", () => {
  // MUTATION: omit any key field, compare a boolean, or reuse a caller-mutated key object.
  const f = launch(); ready(f);
  const { g, run, d } = f, v = run().versions.A;
  const expected = { runId: f.id, phaseId: d.phases[0].id, versionId: "A", editRev: v.editRev, actionId: "continue" };
  assert.deepEqual(g.questConfirmKeyFor(run(), d), expected);
  assert.strictEqual(g.questSameConfirm(expected, clone(expected)), true);
  for (const absent of [null, undefined, false, true, {}]) {
    assert.strictEqual(g.questSameConfirm(absent, expected), false);
    assert.strictEqual(g.questSameConfirm(expected, absent), false);
  }
  for (const field of Object.keys(expected)) {
    const stale = { ...expected, [field]: field === "editRev" ? expected[field] + 1 : expected[field] + "-other" };
    assert.strictEqual(g.questSameConfirm(expected, stale), false, field);
    assert.strictEqual(g.questSameConfirm(stale, expected), false, field);
    g.questConfirm = stale;
    assert.strictEqual(f.model().asking, false, field);
    ask(f); // Controller must reject the stale answer too, without advancing.
  }
  const key = g.questConfirmKeyFor(run(), d); key.editRev++;
  assert.deepEqual(g.questConfirmKeyFor(run(), d), expected);
  const renamed = clone(d), other = clone(run());
  renamed.phases[0].id = "another-phase";
  renamed.phases[0].versionId = "C";
  other.runId = "another-run";
  other.versions.C = { ...clone(v), editRev: 7 };
  assert.deepEqual(g.questConfirmKeyFor(other, renamed), {
    runId: "another-run", phaseId: "another-phase", versionId: "C", editRev: 7, actionId: "continue",
  });
  const r = clone(run()); r.status = "completed";
  assert.strictEqual(g.questConfirmKeyFor(r, d), null);
  r.status = "offering";
  assert.strictEqual(g.questConfirmKeyFor(r, d), null);
  r.status = "active"; r.phase = 99;
  assert.strictEqual(g.questConfirmKeyFor(r, d), null);
  r.phase = 0; delete r.versions.A;
  assert.strictEqual(g.questConfirmKeyFor(r, d), null);
  assert.strictEqual(g.questConfirmKeyFor(run(), null), null);
});

test("a phase-one answer cannot authorize phase two even when revision numbers coincide", () => {
  // MUTATION: keep the old answer on advance, or ignore phase/version in the key.
  const f = launch(); ready(f); ask(f);
  const old = clone(f.g.questConfirm);
  assert.strictEqual(f.g.performQuestAction("continue").ok, true);
  assert.strictEqual(f.g.questConfirm, null);
  ready(f);
  assert.strictEqual(f.run().versions.B.editRev, old.editRev, "equal revisions isolate identity, not age");
  f.g.questConfirm = old; // An old queued answer cannot become the answer to the new question.
  ask(f);
  assert.strictEqual(f.g.performQuestAction("continue").ok, true);
  assert.strictEqual(f.run().phase, 2);
});

test("edits and undo retire the question even when the song returns to the same notes", () => {
  // MUTATION: omit editRev from key creation/comparison, or treat undo as restoring authorization.
  const f = launch(); ready(f); ask(f);
  const old = clone(f.g.questConfirm), original = clone(f.run().versions.A.song.tracks);
  const waypointCols = new Set(f.run().setup.waypoints.map(w => w.col));
  const col = Array.from({ length: f.g.COLS }, (_, i) => i).find(c => !waypointCols.has(c));
  f.g.modelSetCell(0, col, !f.g.grid[0][col]);
  assert.ok(f.run().versions.A.editRev > old.editRev);
  assert.strictEqual(f.model().asking, false);
  assert.strictEqual(f.g.performQuestAction("continue").code, "gate-closed");
  f.g.undoEdit();
  assert.deepEqual(f.run().versions.A.song.tracks, original);
  assert.ok(f.run().versions.A.editRev > old.editRev);
  assert.strictEqual(f.model().asking, false);
  credit(f);
  f.g.questConfirm = old; // Revocation must work even without eagerly clearing the stale object.
  ask(f);
  assert.strictEqual(f.g.performQuestAction("continue").ok, true);
});

test("leaving and reloading discard the answer without losing the draft or earned gates", () => {
  // MUTATION: leave questConfirm set on cleanup, or write/read it through the QuestRun envelope.
  const f = launch(); ready(f); ask(f);
  const before = clone(f.run());
  assert.strictEqual(f.g.performQuestAction("leave").ok, true);
  assert.strictEqual(f.g.questConfirm, null);
  assert.deepEqual(f.run(), before);
  assert.strictEqual(f.g.enterQuestRun(f.id).ok, true);
  assert.strictEqual(f.model().asking, false);
  ask(f);
  // Force a normal save while the prompt is pending, then cross a real serialization boundary.
  f.g.saveQuestRuns(f.g.QUEST_RUNS);
  const stored = clone(f.g.Store.get("questRuns"));
  assert.deepEqual(Object.keys(stored).sort(), ["completed", "runs", "v"], "no transient state on the envelope either");
  assert.deepEqual(stored.runs[f.id], before);
  const g = loadQuestGame({ fresh: true });
  g.Store.set("questRuns", stored); g.hydrateQuestRuns();
  assert.strictEqual(g.enterQuestRun(f.id).ok, true);
  assert.strictEqual(g.questConfirm, null);
  assert.deepEqual(g.QUEST_RUNS[f.id], before);
  assert.strictEqual(g.performQuestAction("continue").code, "needs-confirm");
  assert.strictEqual(g.performQuestAction("continue").ok, true);
});

test("auditioning clears an old answer including a refused audition", t => {
  // MUTATION: omit questConfirm cleanup in the audition handler.
  const f = launch(); ready(f); ask(f);
  assert.strictEqual(f.g.performQuestAction("audition", { versionId: "A" }).code, "bad-version");
  assert.strictEqual(f.g.questConfirm, null);
  assert.strictEqual(f.model().asking, false);
  ask(f);
  assert.strictEqual(f.g.performQuestAction("continue").ok, true);
  ready(f); ask(f);
  const stale = clone(f.g.questConfirm);
  assert.strictEqual(f.g.performQuestAction("continue").ok, true);
  t.after(() => { if (f.g.playing) f.g.stop(); });
  f.g.questConfirm = stale;
  assert.strictEqual(f.g.performQuestAction("audition", { versionId: "A" }).ok, true);
  assert.strictEqual(f.g.questConfirm, null);
});

test("a fresh run cannot inherit an answer from an otherwise identical run", () => {
  // MUTATION: omit runId in the confirmation comparison. The seed, phase, version and rev all match.
  const f = launch(); ready(f); ask(f);
  const stale = clone(f.g.questConfirm), oldRun = clone(f.run());
  const start = f.g.startQuestRun(f.d.id);
  assert.strictEqual(start.ok, true);
  assert.notStrictEqual(start.runId, f.id);
  const next = { ...f, id: start.runId, run: () => f.g.QUEST_RUNS[start.runId] };
  next.model = () => f.g.questShellModel(next.run(), f.d, { confirm: f.g.questConfirm });
  ready(next);
  const key = f.g.questConfirmKeyFor(next.run(), f.d);
  assert.deepEqual({ ...key, runId: stale.runId }, stale);
  f.g.questConfirm = stale;
  ask(next);
  assert.strictEqual(f.g.performQuestAction("continue").ok, true);
  assert.deepEqual(f.run(), oldRun, "the older run is unchanged");
});

test("a pending answer cannot bypass a gate that closes before the second press", () => {
  // MUTATION: treat confirmation as authority to skip questPhaseGate on the next press.
  const f = launch(); ready(f); ask(f);
  // Change only a procedural receipt, leaving the exact confirmation key intact.
  f.run().versions.A.lastCompletePlayRev = null;
  assert.strictEqual(f.g.questSameConfirm(f.g.questConfirm, f.g.questConfirmKeyFor(f.run(), f.d)), true);
  assert.strictEqual(f.model().actions.find(a => a.id === "continue").enabled, false);
  assert.strictEqual(f.g.performQuestAction("continue").code, "gate-closed");
  assert.strictEqual(f.run().phase, 0);
  assert.strictEqual(f.g.questConfirm, null);
  credit(f); ask(f);
  assert.strictEqual(f.g.performQuestAction("continue").ok, true);
});

test("comparison never asks for any route state selection or phase position", () => {
  // MUTATION: return a confirmation key for compare-offer, test phase index instead of type,
  // or introduce the fork into offer. Injecting a challenge tests beyond the shipped no-challenge case.
  for (const matched of [false, true]) for (const selected of ["A", "B"]) {
    const f = launch(); reachCompare(f, matched); choose(f, selected);
    const { g, run } = f;
    const d = clone(f.d), p = d.phases[2];
    p.challenge = clone(d.phases[0].challenge);
    p.versionId = selected; // Defeat a false proof from compare's otherwise absent versionId.
    g.QUEST_DEFINITIONS = { [d.id]: d };
    const expectedMatch = g.questEvaluateRun(run(), d).musical.matchedRouteIds.length > 0;
    assert.strictEqual(expectedMatch, matched);
    for (const phase of [0, 1, 2]) {
      const rd = clone(d), rr = clone(run()); rd.phases[phase] = clone(p); rr.phase = phase;
      const forged = { runId: rr.runId, phaseId: p.id, versionId: selected,
        editRev: rr.versions[selected].editRev, actionId: "continue" };
      assert.strictEqual(g.questConfirmKeyFor(rr, rd), null);
      const model = g.questShellModel(rr, rd, { confirm: forged });
      assert.strictEqual(model.asking, false);
      assert.strictEqual(model.confirmText, "");
      assert.ok(!model.actions.some(a => ["continue", "shape-more"].includes(a.id)));
      const ev = g.questEvaluateRun(rr, rd);
      assert.strictEqual(ev.procedural.canAdvance, false);
      assert.strictEqual(ev.procedural.canOffer, true);
    }
    assert.strictEqual(g.performQuestAction("continue").code, "not-a-transition");
    assert.strictEqual(g.performQuestAction("offer").ok, true);
    assert.strictEqual(run().status, "completed");
  }
});

test("readiness and declared gate sweeps agree between evaluator model and controller gate", () => {
  // MUTATION: omit/invert readiness in canAdvance, use A for B, hardcode gates, or replace AND by OR.
  for (const questId of ["firefly-crossing", "waking-woods"]) {
    const f = launch(questId); ready(f); ask(f);
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
          assert.strictEqual(model.asking, false, label);
          // Readiness is above declared gates. Older definitions without setup have no such task.
          delete d.setup;
          assert.strictEqual(g.questEvaluateRun(r, d).procedural.canAdvance, open, label);
          assert.strictEqual(g.questPhaseGate(d, phase, vid)(r), open, label);
        }
  }
});

test("an unready or unheard path never enters the confirmation fork", () => {
  // MUTATION: drop questPhaseGate from the fork condition, so even a blocked child gets asked.
  for (const phase of [0, 1]) for (const failure of ["region", "landmark", "beat", "play", "edit"]) {
    const f = launch();
    if (phase) { ready(f); ask(f); assert.strictEqual(f.g.performQuestAction("continue").ok, true); }
    ready(f);
    const r = f.run(), v = r.versions[r.draft];
    if (failure === "region") v.song.tracks[0].notes = v.song.tracks[0].notes.filter(n => n.c >= r.setup.waypoints[0].col);
    if (failure === "landmark") v.song.tracks[0].notes = v.song.tracks[0].notes.filter(n => n.c !== r.setup.waypoints[0].col);
    if (failure === "beat") v.song.tracks[1].hits = [];
    if (failure === "play") v.lastCompletePlayRev = null;
    if (failure === "edit") {
      if (!phase) continue; // compose deliberately has no edit.after-fork gate
      v.forkedFrom = null;
    }
    assert.strictEqual(f.model().actions.find(a => a.id === "continue").enabled, false);
    const before = clone(r);
    assert.strictEqual(f.g.performQuestAction("continue").code, "gate-closed");
    assert.strictEqual(f.g.questConfirm, null);
    assert.strictEqual(f.model().asking, false);
    assert.deepEqual(f.run(), before);
  }
});

test("comparison offer availability follows its gates across all readiness combinations", () => {
  // MUTATION: apply readiness to canOffer, leave canAdvance enabled in compare, or ignore a gate.
  const f = launch(); reachCompare(f); choose(f);
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
      assert.strictEqual(m.asking, false);
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
  // MUTATION: rebuild evidence independently in either consumer. A controlled alternate answer
  // makes a bypass observable; spying alone could accept a decorative unused call.
  for (const pretendMatched of [false, true]) {
    const f = launch(); ready(f, !pretendMatched);
    const { g } = f, evaluate = g.questEvaluateRun, calls = [];
    g.questEvaluateRun = (r, d) => {
      assert.strictEqual(r, f.run()); assert.strictEqual(d, f.d);
      calls.push(r.phase);
      const ev = evaluate(r, d);
      ev.musical.matchedRouteIds = pretendMatched ? ["seam-test"] : [];
      return ev;
    };
    g.questConfirm = g.questConfirmKeyFor(f.run(), f.d);
    assert.strictEqual(f.model().asking, !pretendMatched);
    assert.ok(calls.length > 0);
    g.questConfirm = null; calls.length = 0;
    const result = g.performQuestAction("continue");
    assert.ok(calls.includes(0));
    assert.strictEqual(result.ok, pretendMatched);
    if (!pretendMatched) assert.strictEqual(result.code, "needs-confirm");
    assert.strictEqual(f.run().phase, pretendMatched ? 1 : 0);
  }
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
