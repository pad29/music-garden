// Step E commit 3. Pure songs, gates and transactions only; no rendering assertions.
import { test } from "node:test";
import assert from "node:assert";
import { loadGame } from "./harness.mjs";
import { loadQuestGame, completeDealtSong, continueQuest } from "./helpers/quest-fixtures.mjs";

const clone = x => JSON.parse(JSON.stringify(x));
const fresh = () => loadGame({ fresh: true });
const defOf = g => clone(g.QUEST_DEFINITIONS["firefly-crossing"]);
const instOf = (rows = [3, 5, 4], cols = [3, 7, 13]) => ({ kind: "waypoints", generatorVersion: 1,
  waypoints: rows.map((row, i) => ({ row, col: cols[i] })) });
const notes = s => s.tracks.find(t => t.kind === "melody").notes;
const hits = s => s.tracks.find(t => t.kind === "drums").hits;
const missing = (g, d, i, s) => g.QUEST_READINESS.waypoints.missing(d, i, g.songEvidence(s));
const codes = list => Array.from(list, x => x.code).sort();
// Independent construction: no production regions/completion/generator call supplies our oracle.
function completion(g, d, inst, regionRows = [9, 6, 3, 0]) {
  const ladder = g.PALETTES[d.workspace.paletteId].MIDI;
  const cuts = [-1, ...inst.waypoints.map(p => p.col), d.workspace.columns];
  return { v: 3, meta: { title: null, created: 0, updated: 0, author: null },
    palette: d.workspace.paletteId, time: { cols: d.workspace.columns, tempo: 108, groove: 0 },
    tracks: [{ kind: "melody", voice: "musicbox", notes: [
      ...inst.waypoints.map(p => ({ p: ladder[p.row], c: p.col, len: 1 })),
      ...regionRows.map((r, i) => ({ p: ladder[r], c: Math.floor((cuts[i] + cuts[i + 1]) / 2), len: 1 }))
    ] }, { kind: "drums", hits: [{ lane: 1, c: 1 }] }] };
}
function runFor(g, d, inst, song) {
  return g.newQuestRun({ runId: "readiness", questId: d.id, definitionVersion: d.v,
    setup: inst, song, span: { start: 0, end: d.workspace.columns }, at: 1 });
}
function frozen(x) {
  if (!x || typeof x !== "object" || Object.isFrozen(x)) return x;
  Object.values(x).forEach(frozen); return Object.freeze(x);
}

test("row bounds and feasibility reject every impossible band independently of column fit", () => {
  // MUTATION: ignore rowBounds in feasible, accept reversed spread bounds, use live ROWS,
  // or reject exact room. The catalog must enforce this before anybody presses Begin.
  const g = fresh(), d = defOf(g), k = g.QUEST_SETUP_KINDS.waypoints;
  for (const paletteId of ["pentatonic", "diatonic"]) {
    d.workspace.paletteId = paletteId;
    const rows = paletteId === "pentatonic" ? 10 : 14;
    for (let rowMargin = 0; rowMargin <= 4; rowMargin++)
      for (let minRowSpread = 0; minRowSpread <= 4; minRowSpread++)
        for (let maxRowSpread = 0; maxRowSpread <= 4; maxRowSpread++) {
          const rule = { ...d.setup, rowMargin, minRowSpread, maxRowSpread };
          const fits = minRowSpread <= maxRowSpread && maxRowSpread <= rows - 1 - 2 * rowMargin;
          assert.deepEqual(k.rowBounds(rule, d), fits ? { lo: rowMargin, hi: rows - 1 - rowMargin } : null);
          for (const columns of [16, 64]) {
            d.workspace.columns = columns;
            assert.strictEqual(k.feasible(rule, d), fits);
          }
          const crowded = { ...rule, count: 5, minGap: 8, edgeMargin: 8 };
          d.workspace.columns = 16;
          assert.strictEqual(k.feasible(crowded, d), false);
        }
  }
  const base = defOf(g);
  for (const setup of [{ rowMargin: 4, minRowSpread: 0, maxRowSpread: 2 },
    { rowMargin: 0, minRowSpread: 4, maxRowSpread: 3 }]) {
    const bad = clone(base); Object.assign(bad.setup, setup);
    g.loadQuestCatalog(JSON.stringify({ v: 1, definitions: [bad] }), "official");
    assert.ok(g.QUEST_CATALOG_ERRORS.some(e => e.code === "setup-rule-infeasible"));
  }
});

test("all 28000 schema tuples honor both spread bounds and margins across seeds", t => {
  // MUTATION: omit either pin, collide pins for count=2, allow a spread above max, or drop rowMargin.
  // The older test sweeps EVERY width for horizontal geometry; here every full rule gets both
  // ladders, its minimum feasible width and 64, eight seeded streams and both RNG extremes.
  const g = fresh(), d = defOf(g), k = g.QUEST_SETUP_KINDS.waypoints;
  let tuples = 0, deals = 0;
  for (let count = 2; count <= 5; count++) for (let minGap = 2; minGap <= 8; minGap++)
    for (let edgeMargin = 1; edgeMargin <= 8; edgeMargin++) for (let rowMargin = 0; rowMargin <= 4; rowMargin++)
      for (let minRowSpread = 0; minRowSpread <= 4; minRowSpread++) for (let maxRowSpread = 0; maxRowSpread <= 4; maxRowSpread++) {
        tuples++;
        const rule = { kind: "waypoints", count, minGap, edgeMargin, rowMargin, minRowSpread, maxRowSpread };
        for (const paletteId of ["pentatonic", "diatonic"]) {
          const rows = paletteId === "pentatonic" ? 10 : 14;
          if (minRowSpread > maxRowSpread || maxRowSpread > rows - 1 - 2 * rowMargin) continue;
          for (const columns of new Set([Math.max(16, 2 * edgeMargin + 1 + (count - 1) * minGap), 64])) {
            d.workspace = { ...d.workspace, paletteId, columns };
            for (let seed = 0; seed < 10; seed++) {
              const rng = seed === 8 ? () => 0 : seed === 9 ? () => 1 - 2 ** -32 : g.questRng("band-" + seed);
              const inst = k.generate(rule, d, rng), w = inst.waypoints;
              const rs = w.map(p => p.row), spread = Math.max(...rs) - Math.min(...rs);
              const good = w.length === count && rs.every(r => Number.isInteger(r) && r >= rowMargin && r < rows - rowMargin)
                && spread >= minRowSpread && spread <= maxRowSpread
                && w[0].col >= edgeMargin && w.at(-1).col < columns - edgeMargin
                && w.every((p, i) => Number.isInteger(p.col) && (!i || p.col - w[i - 1].col >= minGap));
              assert.ok(good, JSON.stringify({ rule, paletteId, columns, seed, inst }));
              deals++;
            }
          }
        }
      }
  assert.strictEqual(tuples, 28000);
  t.diagnostic(`${deals} independently checked deals; infeasible row rules tested separately`);
});

test("readiness is one missing sentence per kind across every missing-region subset", () => {
  // MUTATION: report each empty region/stone, count drums as region contents, or count a landmark
  // column as part of an adjoining region. All 16 subsets also exercise both edge regions.
  const g = fresh(), d = defOf(g), i = instOf(), ready = completion(g, d, i);
  assert.deepEqual(missing(g, d, i, ready), []);
  for (let mask = 0; mask < 16; mask++) {
    const s = clone(ready); s.tracks[0].notes = notes(s).filter((n, at) => at < 3 || !(mask & (1 << (at - 3))));
    for (const noBeat of [false, true]) {
      const v = clone(s); if (noBeat) v.tracks[1].hits = [];
      const result = missing(g, d, i, v);
      assert.deepEqual(codes(result), [...(mask ? ["region-empty"] : []), ...(noBeat ? ["no-beat"] : [])].sort());
      assert.strictEqual(new Set(result.map(x => x.code)).size, result.length);
      for (const entry of result) {
        assert.deepEqual(Object.keys(entry).sort(), ["code", "descriptorId"]);
        const descriptor = g.QUEST_DESCRIPTORS[entry.descriptorId];
        assert.strictEqual(descriptor.kind, "missing");
        assert.strictEqual((descriptor.text.match(/[.!?]/g) || []).length, 1);
        assert.ok(!/[0-9{}]/.test(descriptor.text), "no tally or parameterized checklist");
      }
    }
  }
  for (let removed = 1; removed < 8; removed++) {
    const s = clone(ready); s.tracks[0].notes = notes(s).filter((n, at) => at >= 3 || !(removed & (1 << at)));
    assert.deepEqual(missing(g, d, i, s), [{ code: "landmark-gone", descriptorId: "missing-landmark" }]);
  }
  const wrongPitch = clone(ready); notes(wrongPitch)[0].p = 60;
  assert.deepEqual(codes(missing(g, d, i, wrongPitch)), ["landmark-gone"]);
  const empty = clone(ready); empty.tracks[0].notes = []; empty.tracks[1].hits = [];
  assert.deepEqual(codes(missing(g, d, i, empty)), ["landmark-gone", "no-beat", "region-empty"]);
});

test("drum evidence counts projected onsets on all lanes and clips out-of-span and duplicate hits", () => {
  // MUTATION: omit drumOnsetCount, count raw hits, or count only kicks.
  const g = fresh(), d = defOf(g), s = completion(g, d, instOf());
  s.tracks[0].notes = [];
  for (const [input, count] of [[[], 0], [[{ lane: 2, c: 15 }], 1],
    [[{ lane: 0, c: 0 }, { lane: 0, c: 0 }, { lane: 1, c: 0 }, { lane: 2, c: 15 },
      { lane: 0, c: 16 }, { lane: 0, c: -1 }], 3]]) {
    s.tracks[1].hits = input;
    const ev = g.songEvidence(s);
    assert.strictEqual(ev.valid, true);
    assert.strictEqual(ev.drumOnsetCount, count);
    assert.strictEqual(ev.melodyOnsetCount, 0);
    assert.strictEqual(ev.nonempty, count > 0);
  }
});

test("readiness dispatch uses setup kind and version, with safe no-task and invalid-song paths", () => {
  // MUTATION: key readiness on Firefly's id, ignore versionId, or require readiness for no-task runs.
  const g = fresh(), d = defOf(g), i = instOf(), good = completion(g, d, i);
  const run = runFor(g, d, i, good);
  run.versions.B = clone(run.versions.A); run.versions.B.song.tracks[1].hits = [];
  for (const id of ["firefly-crossing", "waking-woods", "my-new-quest"]) {
    d.id = id; run.questId = id;
    assert.deepEqual(g.questReadinessMissing(d, run, "A"), []);
    assert.deepEqual(codes(g.questReadinessMissing(d, run, "B")), ["no-beat"]);
  }
  for (const [def, r, v] of [[null, run, "A"], [d, null, "A"], [{ ...d, setup: undefined }, run, "B"],
    [d, { ...run, setup: null }, "B"], [{ ...d, setup: { kind: "constructor" } }, run, "B"],
    [d, run, "C"], [d, { ...run, versions: { A: { song: null } } }, "A"]])
    assert.deepEqual(g.questReadinessMissing(def, r, v), []);
  run.versions.B.song.v = 999;
  assert.deepEqual(g.questReadinessMissing(d, run, "B"), [{ code: "song-invalid", descriptorId: "missing-region" }]);
  assert.deepEqual(Object.keys(g.QUEST_READINESS), ["waypoints"]);
  assert.ok(Object.isFrozen(g.QUEST_READINESS) && Object.isFrozen(g.QUEST_READINESS.waypoints));
});

test("missing descriptors and setup kinds cannot be smuggled into procedure gateIds", () => {
  // MUTATION: let readiness live in QUEST_PRIMITIVES as procedural gates, or bypass gate crossrefs.
  const g = fresh(), base = defOf(g);
  for (const id of ["waypoints", "landmark-gone", "region-empty", "no-beat", "song-invalid",
    "missing-landmark", "missing-region", "missing-beat", "readiness.waypoints"]) {
    assert.strictEqual(g.QUEST_PRIMITIVES[id], undefined);
    const d = clone(base); d.phases[0].procedure.gateIds.push(id);
    g.loadQuestCatalog(JSON.stringify({ v: 1, definitions: [d] }), "official");
    assert.ok(g.QUEST_CATALOG_ERRORS.some(e => ["not-primitive-id", "no-such-gate"].includes(e.code)), JSON.stringify(g.QUEST_CATALOG_ERRORS));
    assert.deepEqual(Object.keys(g.QUEST_DEFINITIONS), []);
    const run = runFor(g, d, instOf(), completion(g, d, instOf()));
    assert.strictEqual(g.questPhaseGate(d, 0, "A")(run), false);
  }
  assert.deepEqual(Object.entries(g.QUEST_DESCRIPTORS).filter(([, v]) => v.kind === "missing").map(([k]) => k).sort(),
    ["missing-beat", "missing-landmark", "missing-region"]);
});

function launch() {
  const g = loadQuestGame({ fresh: true }), result = g.startQuestRun("firefly-crossing");
  assert.strictEqual(result.ok, true, JSON.stringify(result));
  return { g, id: result.runId, d: g.QUEST_DEFINITIONS["firefly-crossing"] };
}
function credit(g, id, versionId) {
  const v = g.QUEST_RUNS[id].versions[versionId];
  const r = g.transactQuestRun(id, [{ type: "completePass", versionId, editRev: v.editRev,
    sessionId: versionId + ":" + v.editRev, at: 10 + v.editRev }]);
  assert.strictEqual(r.ok, true, r.code);
}
function edit(g, s) { g.applySong(s); g.noteEdit("readiness-test"); }

test("each readiness kind blocks phases one and two after all procedural gates are open", () => {
  // MUTATION: remove readiness from questPhaseGate, consult A during transform, or gate only compose.
  const { g, id, d } = launch();
  for (const [phase, vid] of [[0, "A"], [1, "B"]]) {
    const good = completeDealtSong(g, g.QUEST_RUNS[id].versions[vid].song);
    for (const code of ["landmark-gone", "region-empty", "no-beat"]) {
      const s = clone(good), inst = g.QUEST_RUNS[id].setup;
      if (code === "landmark-gone") s.tracks[0].notes = notes(s).filter(n => n.c !== inst.waypoints[0].col);
      if (code === "region-empty") s.tracks[0].notes = notes(s).filter(n => n.c >= inst.waypoints[0].col);
      if (code === "no-beat") s.tracks[1].hits = [];
      edit(g, s); credit(g, id, vid);
      const run = g.QUEST_RUNS[id], snapshot = clone(run);
      assert.deepEqual(codes(g.questReadinessMissing(d, run, vid)), [code]);
      for (const gateId of d.phases[phase].procedure.gateIds) assert.strictEqual(g.QUEST_PRIMITIVES[gateId].gate(run, vid), true);
      assert.strictEqual(g.questPhaseGate(d, phase, vid)(run), false);
      assert.strictEqual(g.performQuestAction("continue").code, "gate-closed");
      assert.deepEqual(g.QUEST_RUNS[id], snapshot, "a refused transition must not fork or mutate the run");
    }
    edit(g, good); credit(g, id, vid);
    assert.strictEqual(continueQuest(g).ok, true);
    assert.strictEqual(g.QUEST_RUNS[id].phase, phase + 1);
  }
});

test("Q6 permits a final offer that fails every readiness kind and matches no route", () => {
  // MUTATION: remove compare-offer exemption from gate/evaluator, or consult readiness in offer.
  const { g, id, d } = launch();
  for (const vid of ["A", "B"]) {
    const song = completeDealtSong(g, g.QUEST_RUNS[id].versions[vid].song);
    if (vid === "B") hits(song).push({ lane: 2, c: 3 });
    edit(g, song); credit(g, id, vid);
    assert.strictEqual(continueQuest(g).ok, true);
  }
  for (const vid of ["A", "B"]) {
    const v = g.QUEST_RUNS[id].versions[vid];
    assert.strictEqual(g.transactQuestRun(id, [{ type: "audition", versionId: vid, editRev: v.editRev,
      sessionId: v.lastCompletePlaySessionId, at: 20 }]).ok, true);
  }
  assert.strictEqual(g.performQuestAction("compare").ok, true);
  assert.strictEqual(g.performQuestAction("choose", { versionId: "B" }).ok, true);
  const sparse = clone(g.QUEST_RUNS[id].versions.B.song);
  sparse.tracks[0].notes = [{ p: 60, c: 0, len: 1 }]; sparse.tracks[1].hits = [];
  edit(g, sparse);
  assert.strictEqual(g.performQuestAction("offer").ok, false, "Q6 still requires hearing the latest edit");
  credit(g, id, "B");
  const heard = g.QUEST_RUNS[id].versions.B;
  assert.strictEqual(g.transactQuestRun(id, [{ type: "audition", versionId: "B", editRev: heard.editRev,
    sessionId: heard.lastCompletePlaySessionId, at: 30 }]).ok, true);
  g.questAfterReceipt(id);
  const run = g.QUEST_RUNS[id];
  assert.deepEqual(codes(g.questReadinessMissing(d, run, "B")), ["landmark-gone", "no-beat", "region-empty"]);
  const ev = g.evaluateQuest(d, { versions: Object.fromEntries(Object.entries(run.versions).map(([v, x]) => [v, g.songEvidence(x.song)])) }, run);
  assert.deepEqual(ev.readiness, { ok: true, missing: [] });
  assert.deepEqual(ev.musical.matchedRouteIds, []);
  assert.strictEqual(ev.procedural.canOffer, true);
  assert.strictEqual(g.questPhaseGate(d, 2, "B")(run), true);
  assert.strictEqual(g.performQuestAction("offer").ok, true);
  assert.strictEqual(g.QUEST_RUNS[id].status, "completed");
  const saved = g.getSaves().find(s => s.meta.localId === "quest-run:" + id);
  assert.deepEqual(saved.tracks, sparse.tracks);
});

test("evaluateQuest reports readiness without mutating frozen inputs or consulting live state", () => {
  // MUTATION: skip readiness in evaluateQuest, modify its inputs, or consult activeScope/live grids.
  const g = fresh(), d = defOf(g), i = instOf(), s = completion(g, d, i);
  s.tracks[1].hits = [];
  const run = runFor(g, d, i, s), evidence = { versions: { A: g.songEvidence(s) } };
  const before = JSON.stringify({ d, run, evidence });
  const result = g.evaluateQuest(d, evidence, run);
  assert.strictEqual(JSON.stringify({ d, run, evidence }), before, "mutable inputs must also remain untouched");
  frozen(d); frozen(run); frozen(evidence);
  assert.deepEqual(result.readiness, { ok: false, missing: [{ code: "no-beat", descriptorId: "missing-beat" }] });
  g.setPalette("diatonic"); g.grid[0][0] = 1; g.drumG[0][0] = 1;
  g.Store.set = () => { throw new Error("pure evaluation may not persist"); };
  assert.deepEqual(g.evaluateQuest(d, evidence, run), result);
  result.readiness.missing[0].code = "caller-mutation";
  assert.strictEqual(g.evaluateQuest(d, evidence, run).readiness.missing[0].code, "no-beat");
  assert.strictEqual(JSON.stringify({ d, run, evidence }), before);
});

test("readiness exemptions follow phase type and absent setup rather than phase position or quest id", () => {
  // MUTATION: exempt phase index 2 instead of compare-offer, or introduce global readiness for v1.
  // Direct gate/evaluator calls isolate phase type from the catalog's ordered phase grammar.
  const g = fresh(), d = defOf(g), i = instOf(), s = completion(g, d, i);
  s.tracks[1].hits = [];
  const run = runFor(g, d, i, s);
  const ev = { versions: { A: g.songEvidence(s) } };
  const compose = clone(d.phases[0]); compose.procedure.gateIds = [];
  d.phases = [compose, clone(compose), clone(compose)];
  for (const phase of [0, 1, 2]) {
    run.phase = phase;
    assert.strictEqual(g.questPhaseGate(d, phase, "A")(run), false);
    assert.strictEqual(g.evaluateQuest(d, ev, run).readiness.ok, false);
  }
  delete d.setup; run.setup = null;
  assert.strictEqual(g.questPhaseGate(d, 2, "A")(run), true);
  assert.deepEqual(g.evaluateQuest(d, ev, run).readiness, { ok: true, missing: [] });
  d.setup = defOf(g).setup; run.setup = i;
  d.phases[0] = { ...compose, type: "compare-offer", versionIds: ["A"] };
  run.phase = 0;
  assert.strictEqual(g.questPhaseGate(d, 0, "A")(run), true);
  assert.deepEqual(g.evaluateQuest(d, ev, run).readiness, { ok: true, missing: [] });
});

test("reachable families are exactly the evidence of real constructed songs, never strategy names", () => {
  // MUTATION: push plan names, invent a family, ignore ev.valid, duplicate families, or lose a song's
  // second family. Capture the real analyzer inputs, not a copy of the production strategy formula.
  const g = fresh(), d = defOf(g), k = g.QUEST_SETUP_KINDS.waypoints, analyze = g.songEvidence;
  for (const paletteId of ["pentatonic", "diatonic"]) for (const columns of [16, 32, 64]) {
    d.workspace = { ...d.workspace, paletteId, columns };
    for (let seed = 0; seed < 64; seed++) {
      const inst = k.generate(d.setup, d, g.questRng("reach-" + seed)), before = clone({ d, inst }), captured = [];
      g.songEvidence = song => { const ev = analyze(song); captured.push({ song: clone(song), ev }); return ev; };
      const found = g.questSetupReachableFamilies(d, inst);
      assert.strictEqual(captured.length, 8);   // four shapes, each tried dense and sparse
      g.songEvidence = analyze;
      const actual = new Set();
      for (const { song, ev } of captured) {
        assert.strictEqual(ev.valid, true);
        assert.strictEqual(g.questWorkspaceMismatch(song, d), null);
        // Strategies only establish contour. Adding a beat makes their songs ready without changing it.
        hits(song).push({ lane: 1, c: 1 });
        assert.deepEqual(missing(g, d, inst, song), []);
        ev.contourFamilies.forEach(f => actual.add(f));
      }
      assert.deepEqual([...found].sort(), [...actual].sort());
      assert.strictEqual(new Set(found).size, found.length);
      assert.deepEqual({ d, inst }, before);
      g.songEvidence = analyze;
    }
  }
  g.songEvidence = () => ({ valid: false, contourFamilies: ["hover"] });
  assert.deepEqual(g.questSetupReachableFamilies(d, instOf()), []);
  assert.deepEqual(g.questSetupReachableFamilies(d, { kind: "absent" }), []);
});

test("route reachability checks each declared contour alternative after the two-family floor", () => {
  // MUTATION: skip the floor, stop after the first phase/route, or require every alternative instead
  // of any one. Injection isolates routing from the conservative construction search.
  const g = fresh(), d = defOf(g), i = instOf();
  g.questSetupReachableFamilies = () => ["rise"];
  assert.strictEqual(g.questSetupRoutesReachable(d, i), "one-contour-family-only");
  g.questSetupReachableFamilies = () => ["rise", "fall"];
  assert.strictEqual(g.questSetupRoutesReachable(d, i), null);
  const obs = clone(d.phases[0].challenge.routes[0].observations.find(o => o.analyzerId === "contour.any-of"));
  for (const phase of d.phases.filter(p => p.challenge)) for (const route of phase.challenge.routes) {
    const original = route.observations;
    route.observations = [{ ...obs, params: { families: ["hover", "arc"] } }];
    assert.strictEqual(g.questSetupRoutesReachable(d, i), "route-unreachable:" + route.id);
    route.observations = [{ ...obs, params: { families: ["hover", "rise"] } }];
    assert.strictEqual(g.questSetupRoutesReachable(d, i), null);
    route.observations = original;
  }
});

test("start checks geometry then completability then reachability before any write or entry", () => {
  // MUTATION: skip/reorder any obligation, or persist an unusable hand. Each guard is the sole
  // refusing guard in one case; earlier refusal must never even call a later obligation.
  for (const failure of ["geometry", "completion", "reachability", null]) {
    const g = fresh(), d = defOf(g), calls = [], rng = g.questRng;
    if (failure === "geometry") d.setup = { ...d.setup, count: 5, minGap: 8, edgeMargin: 8 };
    g.QUEST_DEFINITIONS = { [d.id]: d };
    g.questRng = () => rng("fixture-4");
    g.questSetupCompletable = () => { calls.push("completion"); return failure === "completion" ? "completion-refused" : null; };
    g.questSetupRoutesReachable = () => { calls.push("reachability"); return failure === "reachability" ? "reachability-refused" : null; };
    g.saveQuestRuns = runs => { calls.push("save"); return runs; };
    g.enterQuestRun = () => { calls.push("enter"); return { ok: true }; };
    const before = g.activeScope, result = g.startQuestRun(d.id);
    assert.deepEqual([...new Set(calls)], failure === "geometry" ? [] : failure === "completion" ? ["completion"]
      : failure === "reachability" ? ["completion", "reachability"] : ["completion", "reachability", "save", "enter"]);
    // …and the re-dealing is BOUNDED: twelve attempts, then it gives up carrying the last reason.
    assert.strictEqual(calls.length, failure === "geometry" ? 0 : failure === "completion" ? 12
      : failure === "reachability" ? 24 : 4);
    if (failure) {
      assert.deepEqual(result, { ok: false, code: "setup-unusable", extra: failure === "geometry" ? "wrong-count" : failure + "-refused" });
      assert.deepEqual(Object.keys(g.QUEST_RUNS), []);
      assert.strictEqual(g.activeScope, before);
    } else assert.strictEqual(result.ok, true);
  }
});

test("a hand the search cannot vouch for is re-dealt, not refused in the child's face", () => {
  // MUTATION: refuse the first unvouched hand instead of dealing another, or let the retry run for ever.
  // Obligation three is a SEARCH, and a search that finds no way has not shown there is none. Refusing
  // on it means a child presses Begin and nothing happens, which is the worst outcome available here —
  // so an unvouched hand is quietly replaced, and only a rule that cannot produce one in a dozen tries
  // is reported as the bug it is.
  const g = fresh(), d = defOf(g);
  g.QUEST_DEFINITIONS = { [d.id]: d };
  const real = g.questSetupRoutesReachable;
  let asked = 0;
  g.questSetupRoutesReachable = (def, inst) => (++asked <= 3 ? "one-contour-family-only" : real(def, inst));
  const r = g.startQuestRun(d.id);
  assert.strictEqual(r.ok, true, r.code + " " + r.extra);
  assert.strictEqual(asked, 4, "three hands set aside, the fourth kept");

  const g2 = fresh(), d2 = defOf(g2);
  g2.QUEST_DEFINITIONS = { [d2.id]: d2 };
  let tries = 0;
  g2.questSetupRoutesReachable = () => { tries++; return "one-contour-family-only"; };
  assert.deepEqual(g2.startQuestRun(d2.id),
    { ok: false, code: "setup-unusable", extra: "one-contour-family-only" });
  assert.strictEqual(tries, 12, "bounded: it gives up rather than dealing for ever");
  assert.deepEqual(Object.keys(g2.QUEST_RUNS), []);
});

test("the hand that used to be refused for a search's shortcoming now launches", () => {
  // MUTATION: narrow the search back to one note per region, or drop the re-deal from startQuestRun.
  // GPT's tester found this hand: legal geometry, a completable task, and ready songs producing rise,
  // fall and arc — yet the search saw only arc and refused. One deal in fifteen died that way, which a
  // child would have met as a Begin button that did nothing.
  const g = fresh(), d = defOf(g), rng = g.questRng;
  const inst = g.QUEST_SETUP_KINDS.waypoints.generate(d.setup, d, rng("attack-28"));
  assert.strictEqual(g.QUEST_SETUP_KINDS.waypoints.validateInstance(inst, d.setup, d), null);
  assert.strictEqual(g.questSetupCompletable(d, inst), null);
  assert.deepEqual([...g.questSetupReachableFamilies(d, inst)].sort(), ["arc", "fall", "rise"]);
  assert.strictEqual(g.questSetupRoutesReachable(d, inst), null);

  g.questRng = () => rng("attack-28");
  assert.strictEqual(g.startQuestRun(d.id).ok, true);
});

test("independent witnesses agree with the search on the hand that exposed it", t => {
  // MUTATION: corrupt row projection so the concrete independent rise witness stops producing rise, or
  // narrow the search so it stops agreeing with witnesses built without it.
  // These three songs are built by hand, not by the search, so they are evidence about the HAND rather
  // than a restatement of the strategy. They are what showed the old search was refusing legal deals.
  const g = fresh(), d = defOf(g), inst = instOf([4, 7, 4]);
  const rise = completion(g, d, inst, [4, 0, 0, 0]);
  const arc = completion(g, d, inst, [0, 3, 0, 0]);
  const fall = completion(g, d, inst, [0, 4, 0, 3]);
  for (const [song, family] of [[rise, "rise"], [arc, "arc"], [fall, "fall"]]) {
    assert.strictEqual(g.questWorkspaceMismatch(song, d), null);
    assert.deepEqual(missing(g, d, inst, song), []);
    assert.ok(g.songEvidence(song).contourFamilies.includes(family));
  }
  // The search must find at least what an independent hand-built witness found. It is still a LOWER
  // bound — finding nothing proves nothing — which is why a hand it cannot vouch for is re-dealt rather
  // than refused.
  const reported = g.questSetupReachableFamilies(d, inst);
  for (const family of ["rise", "arc", "fall"])
    assert.ok(reported.includes(family), "search missed a family an independent witness reaches: " + family);
});
