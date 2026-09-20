// Step E: generated tasks, geometry, construction and durable instances.
// No assertions here use rendered output or pretend the VM can hear audio.
import { test } from "node:test";
import assert from "node:assert";
import { loadGame } from "./harness.mjs";
import { continueQuest } from "./helpers/quest-fixtures.mjs";

const clone = value => JSON.parse(JSON.stringify(value));
const fresh = () => loadGame({ fresh: true });
const definition = (g, id = "firefly-crossing") => clone(g.QUEST_DEFINITIONS[id]);
const RULE = { kind: "waypoints", count: 3, minGap: 4, edgeMargin: 2, rowMargin: 1, minRowSpread: 2, maxRowSpread: 4 };
const instance = (cols = [3, 7, 12], rows = [2, 3, 4]) => ({
  kind: "waypoints", generatorVersion: 1,
  waypoints: cols.map((col, i) => ({ row: rows[i], col })),
});
function catalog(g, def) {
  g.loadQuestCatalog(JSON.stringify({ v: 1, definitions: [def] }), "official");
  return g.QUEST_CATALOG_ERRORS;
}
function accepts(g, def) {
  assert.deepEqual(catalog(g, def), []);
  assert.deepEqual(Object.keys(g.QUEST_DEFINITIONS), [def.id]);
}
function rejects(g, def, code, path) {
  const errors = catalog(g, def);
  assert.deepEqual(Object.keys(g.QUEST_DEFINITIONS), []);
  assert.ok(errors.some(e => e.code === code && (!path || e.path === path)),
    JSON.stringify({ wanted: { code, path }, errors }));
}
const melody = song => song.tracks.find(t => t.kind === "melody").notes;
const drums = song => song.tracks.find(t => t.kind === "drums").hits;
const enoughRoom = (rule, width) => 2 * rule.edgeMargin + 1 + (rule.count - 1) * rule.minGap <= width;
// Independent minimum columns and a band whose endpoints attain the spread floor.
const legalInstance = rule => instance(
  Array.from({ length: rule.count }, (_, i) => rule.edgeMargin + i * rule.minGap),
  Array.from({ length: rule.count }, (_, i) => rule.rowMargin + (i === 0 ? rule.minRowSpread : 0)));
function schemaErrors(g, rule) {
  const errors = [];
  g.questCheck(rule, g.QUEST_SETUP_KINDS.waypoints.parameterSchema, "$.setup", errors);
  return errors;
}
function* rules(allRows = true) {
  for (let count = 2; count <= 5; count++)
    for (let minGap = 2; minGap <= 8; minGap++)
      for (let edgeMargin = 1; edgeMargin <= 8; edgeMargin++)
        for (let maxRowSpread = 0; maxRowSpread <= 4; maxRowSpread++)
          for (const rowMargin of allRows ? [0,1,2,3,4] : [1])
            for (const minRowSpread of allRows ? [0,1,2,3,4] : [Math.min(2, maxRowSpread)])
              yield { kind: "waypoints", count, minGap, edgeMargin, rowMargin, minRowSpread, maxRowSpread };
}
function launch(g, id = "firefly-crossing") {
  // Stable valid deal; seed-space refusal is tested separately from persistence.
  const rng = g.questRng;
  g.questRng = seed => rng("fixture-4");
  const result = g.startQuestRun(id);
  assert.strictEqual(result.ok, true, JSON.stringify(result));
  return result.runId;
}

test("RNG pins version-one sequences, including the empty seed and UTF-16 input", () => {
  // MUTATION: change the seed hash, PRNG constants, or unsigned conversion; same-seed equality alone
  // would still pass if EVERY existing seed quietly changed its meaning.
  const g = fresh();
  const vectors = [
    ["", [2625274932, 2119670693, 3324411561, 1770755366, 3488654967, 245707362]],
    ["crossing", [3477334855, 2433527828, 7742185, 1590241946, 1784438388, 2315084445]],
    ["\ud83c\udf31", [869759000, 3347916169, 983109867, 3503406782, 3040106024, 2156308975]],
  ];
  for (const [seed, expected] of vectors) {
    const rng = g.questRng(seed);
    assert.deepEqual(expected.map(() => rng() * 2 ** 32), expected, seed);
  }
  const seeds = ["", "a", "b", "\u0000", "\ud83c\udf31", "x".repeat(1024)];
  const other = fresh();
  g.__window.Math = Object.assign(Object.create(Math), {
    random() { throw new Error("questRng must not consult ambient randomness"); },
  });
  const signatures = new Set();
  for (const seed of seeds) {
    const a = g.questRng(seed), b = other.questRng(seed), distraction = g.questRng("unrelated");
    const values = [];
    for (let i = 0; i < 1024; i++) {
      distraction();
      const value = a();
      assert.strictEqual(value, b(), seed + ": " + i);
      assert.ok(Number.isFinite(value) && value >= 0 && value < 1);
      values.push(value);
    }
    signatures.add(JSON.stringify(values));
  }
  assert.strictEqual(signatures.size, seeds.length, "a constant seed hash is not deterministic dealing");
});

test("the setup registry, rule grammar and forbidden controls are deeply frozen", () => {
  // MUTATION: shallow-freeze the registry, allowing a caller to rewrite a rule bound or generator.
  const g = fresh();
  const registry = g.QUEST_SETUP_KINDS;
  assert.deepEqual(Object.keys(registry), ["waypoints"]);
  assert.deepEqual(registry.waypoints.forbidsControlIds, ["room"]);
  function frozen(value) {
    if (!value || typeof value !== "object") return;
    assert.strictEqual(Object.isFrozen(value), true);
    Object.values(value).forEach(frozen);
  }
  frozen(registry);
  assert.strictEqual(g.QUEST_SETUP_GENERATOR_VERSION, 1);
});

test("rule grammar accepts every bounded tuple and rejects malformed parameters", () => {
  // MUTATION: widen/narrow any bound, make a key optional, or silently accept an extra rule key.
  const g = fresh();
  let tuples = 0;
  for (const rule of rules()) { assert.deepEqual(schemaErrors(g, rule), []); tuples++; }
  assert.strictEqual(tuples, 28000);
  for (const [key, low, high] of [["count", 2, 5], ["minGap", 2, 8],
    ["edgeMargin", 1, 8], ["rowMargin", 0, 4], ["minRowSpread", 0, 4], ["maxRowSpread", 0, 4]]) {
    for (const value of [low - 1, high + 1, low + 0.5, String(low), null, true]) {
      const rule = { ...RULE, [key]: value };
      assert.ok(schemaErrors(g, rule).some(e => e.code === "int-range"), JSON.stringify(rule));
    }
  }
  for (const key of Object.keys(RULE)) {
    const rule = { ...RULE }; delete rule[key];
    assert.ok(schemaErrors(g, rule).some(e => e.code === "missing-key" && e.path === "$.setup." + key));
  }
  assert.ok(schemaErrors(g, { ...RULE, surprise: 1 }).some(e => e.code === "unknown-key"));
  assert.ok(schemaErrors(g, { ...RULE, kind: "unknown" }).some(e => e.code === "not-allowed-value"));
});

test("shipped deals are repeatable, varied, versioned and valid across 512 seeds per quest", () => {
  // MUTATION: ignore the injected RNG, fix the seed, omit generatorVersion, or mutate the rule.
  const g = fresh();
  assert.deepEqual(g.QUEST_CATALOG_ERRORS, []);
  assert.deepEqual(Object.keys(g.QUEST_DEFINITIONS).sort(), ["firefly-crossing", "waking-woods"]);
  for (const def of Object.values(g.QUEST_DEFINITIONS)) {
    assert.strictEqual(def.v, 2);
    assert.strictEqual(def.workspace.columns, 16);
    assert.deepEqual(def.setup, RULE);
    const before = clone(def), positions = new Set(), columns = new Set();
    const k = g.QUEST_SETUP_KINDS.waypoints;
    for (let i = 0; i < 512; i++) {
      const seed = "shipped-" + i;
      const a = k.generate(def.setup, def, g.questRng(seed));
      const b = k.generate(def.setup, def, g.questRng(seed));
      assert.deepEqual(a, b);
      assert.notStrictEqual(a.waypoints, b.waypoints);
      assert.strictEqual(a.generatorVersion, 1);
      assert.strictEqual(k.validateInstance(a, def.setup, def), null, seed);
      assert.strictEqual(g.questSetupCompletable(def, a), null, seed);
      positions.add(JSON.stringify(a.waypoints));
      columns.add(JSON.stringify(a.waypoints.map(p => p.col)));
    }
    assert.ok(positions.size > 1, "new seeds must change the deal");
    assert.ok(columns.size > 1, "changing only rows is not varying landmark columns");
    assert.deepEqual(def, before);
  }
});

test("every horizontal rule at every width generates legal geometry on both ladders", t => {
  // MUTATION: ignore minGap/edgeMargin, use the live ladder/width, or overshoot
  // the row band. Check independent inequalities as well as the production validator; they must not
  // validate each other's mistake. Finish the sweep before failing so narrow widths cannot hide 64.
  const g = fresh(), def = definition(g), k = g.QUEST_SETUP_KINDS.waypoints;
  const failures = {}, examples = {};
  let checked = 0, impossible = 0;
  for (const rule of rules(false)) {
    assert.deepEqual(schemaErrors(g, rule), []);
    for (let width = 16; width <= 64; width++) {
      if (!enoughRoom(rule, width)) { impossible++; continue; }
      for (const paletteId of ["pentatonic", "diatonic"]) {
        def.workspace = { ...def.workspace, columns: width, paletteId };
        for (const seed of ["", "sweep-1", "sweep-2", "sweep-3", "rng-zero", "rng-top"]) {
          const rng = seed === "rng-zero" ? () => 0 : seed === "rng-top" ? () => 1 - 2 ** -32 : g.questRng(seed);
          const inst = k.generate(rule, def, rng), w = inst.waypoints;
          const bad = [];
          if (inst.kind !== "waypoints" || inst.generatorVersion !== 1) bad.push("envelope");
          if (w.length !== rule.count) bad.push("count");
          if (w.some(p => !Number.isInteger(p.row) || !Number.isInteger(p.col) || p.row < 0 ||
            p.row >= g.PALETTES[paletteId].MIDI.length)) bad.push("ladder");
          if (w[0].col < rule.edgeMargin || w.at(-1).col >= width - rule.edgeMargin) bad.push("edges");
          if (w.some((p, i) => i && p.col - w[i - 1].col < rule.minGap)) bad.push("gaps");
          if (Math.max(...w.map(p => p.row)) - Math.min(...w.map(p => p.row)) > rule.maxRowSpread) bad.push("spread");
          const boundaries = [-1, ...w.map(p => p.col), width];
          if (boundaries.some((c, i) => i && c - boundaries[i - 1] < 2)) bad.push("empty-region");
          const error = k.validateInstance(inst, rule, def);
          if (error !== null) bad.push("validator:" + error);
          for (const reason of bad) {
            failures[reason] = (failures[reason] || 0) + 1;
            examples[reason] ||= { rule, width, paletteId, seed, inst };
          }
          checked++;
        }
      }
    }
  }
  t.diagnostic(JSON.stringify({ checked, impossibleRuleWidths: impossible, failures, examples }));
  assert.deepEqual(failures, {}, "all mathematically feasible rules must honor their authored bounds");
});

for (const [name, rule, legalColumns] of [
  ["gap", { ...RULE, count: 2, minGap: 8, edgeMargin: 1, rowMargin: 0, minRowSpread: 0, maxRowSpread: 0 }, [1, 9]],
  ["margin", { ...RULE, count: 2, minGap: 2, edgeMargin: 6, rowMargin: 0, minRowSpread: 0, maxRowSpread: 0 }, [6, 8]],
]) {
  test("a feasible non-default " + name + " rule must not be refused by the dealer", () => {
    // MUTATION: divide spare columns evenly without reserving the authored gap/margins.
    // These are catalog-accepted rules WITH explicit legal witnesses, not impossible demands.
    const g = fresh(), def = definition(g), k = g.QUEST_SETUP_KINDS.waypoints;
    def.setup = rule;
    accepts(g, def);
    const proof = instance(legalColumns, [0, 0]);
    assert.strictEqual(k.validateInstance(proof, rule, def), null);
    assert.strictEqual(g.questSetupCompletable(def, proof), null);
    g.questRng = () => () => 0;
    const result = g.startQuestRun(def.id);
    assert.strictEqual(result.ok, true, "a legal deal exists: " + JSON.stringify(result));
  });
}

const invalidInstances = [
  ["not-waypoints", () => null],
  ["not-waypoints", x => ({ ...x, kind: "other" })],
  ["not-waypoints", x => ({ ...x, waypoints: {} })],
  ["wrong-count", x => ({ ...x, waypoints: x.waypoints.slice(1) })],
  ["bad-waypoint", x => { x.waypoints[1] = null; return x; }],
  ["bad-waypoint", x => { x.waypoints[1].row = 2.5; return x; }],
  ["bad-waypoint", x => { x.waypoints[1].col = "7"; return x; }],
  ["row-off-ladder", x => { x.waypoints[1].row = -1; return x; }],
  ["row-off-ladder", x => { x.waypoints[1].row = 10; return x; }],
  ["columns-not-ascending", x => { x.waypoints[1].col = 3; return x; }],
  ["columns-not-ascending", x => { x.waypoints.reverse(); return x; }],
  ["no-room-before", x => { x.waypoints[0].col = 1; return x; }],
  ["no-room-after", x => { x.waypoints[2].col = 14; return x; }],
  ["gap-too-narrow", x => { x.waypoints[1].col = 6; return x; }],
  ["row-spread-too-narrow", x => { x.waypoints.forEach(p => p.row = 3); return x; }],
  ["row-off-band", x => { x.waypoints[0].row = 0; return x; }],
  ["row-off-band", x => { x.waypoints.forEach((p,i) => p.row = [7,8,9][i]); return x; }],
  ["row-spread-too-wide", x => { x.waypoints[2].row = 7; return x; }],
];
for (const code of new Set(invalidInstances.map(([code]) => code))) {
  test("instance validation specifically rejects " + code, () => {
    // MUTATION: remove the named validateInstance guard, or collapse its error into another code.
    const g = fresh(), def = definition(g), k = g.QUEST_SETUP_KINDS.waypoints;
    assert.strictEqual(k.validateInstance(instance(), RULE, def), null);
    for (const [want, mutate] of invalidInstances.filter(([want]) => want === code)) {
      const value = mutate(instance());
      const before = clone(value);
      assert.strictEqual(k.validateInstance(value, RULE, def), want, JSON.stringify(value));
      assert.deepEqual(value, before, "validation must not repair input");
    }
  });
}

test("geometry accepts exact bounds and uses the definition's ladder, not the live palette", () => {
  // MUTATION: replace a strict boundary with an inclusive rejection, or use global ROWS.
  const g = fresh(), def = definition(g), k = g.QUEST_SETUP_KINDS.waypoints;
  const rule = { ...RULE, count: 2, minGap: 8, edgeMargin: 3, rowMargin: 0, maxRowSpread: 4 };
  assert.strictEqual(k.validateInstance(instance([3, 12], [0, 4]), rule, def), null);
  assert.strictEqual(k.validateInstance(instance([3, 11], [9, 5]), rule, def), null);
  def.workspace.paletteId = "diatonic";
  assert.strictEqual(k.validateInstance(instance([3, 12], [13, 9]), rule, def), null);
  assert.strictEqual(k.validateInstance(instance([3, 12], [14, 10]), rule, def), "row-off-ladder");
  const flat = { ...RULE, rowMargin: 0, minRowSpread: 0, maxRowSpread: 0 };
  assert.strictEqual(k.validateInstance(instance([2, 6, 13], [0, 0, 0]), flat, definition(g)), null);
});

test("regions exactly partition free columns and the starting song contains only landmarks", () => {
  // MUTATION: include a landmark in a region, omit an edge region, invert ladder rows, add a drum
  // bed to startingSong, or share mutable song/instance data between calls.
  const g = fresh(), k = g.QUEST_SETUP_KINDS.waypoints;
  for (const paletteId of ["pentatonic", "diatonic"]) {
    const def = definition(g); def.workspace.paletteId = paletteId;
    const inst = instance(), before = clone({ def, inst });
    assert.deepEqual(k.regions(inst, def), [{ from: 0, to: 2 }, { from: 4, to: 6 },
      { from: 8, to: 11 }, { from: 13, to: 15 }]);
    const song = k.startingSong(def, inst);
    assert.strictEqual(song.v, 3);
    assert.strictEqual(song.palette, paletteId);
    assert.deepEqual(song.time, { cols: 16, tempo: 108, groove: 0 });
    assert.deepEqual(melody(song), inst.waypoints.map(p => ({ p: g.PALETTES[paletteId].MIDI[p.row], c: p.col, len: 1 })));
    assert.deepEqual(drums(song), []);
    assert.strictEqual(song.tracks.length, 2);
    assert.strictEqual(g.songEvidence(song).valid, true);
    assert.strictEqual(g.questWorkspaceMismatch(song, def), null);
    melody(song)[0].p = 999;
    const next = k.startingSong(def, inst);
    assert.notStrictEqual(melody(next)[0].p, 999);
    assert.deepEqual({ def, inst }, before);
  }
});

test("constructed completions preserve landmarks and fill every region throughout the workspace range", () => {
  // MUTATION: omit a region/landmark/drum, use column 16 as the end, return only the starting song,
  // or read the live pentatonic ladder when the definition is diatonic.
  const g = fresh(), k = g.QUEST_SETUP_KINDS.waypoints;
  for (const paletteId of ["pentatonic", "diatonic"])
    for (let width = 16; width <= 64; width++)
      for (let count = 2; count <= 5; count++) {
        const def = definition(g);
        def.workspace = { ...def.workspace, columns: width, paletteId };
        def.setup = { ...RULE, count, minGap: 2, edgeMargin: 1 };
        const inst = legalInstance(def.setup), before = clone({ inst, def });
        assert.strictEqual(k.validateInstance(inst, def.setup, def), null);
        const song = g.questSetupCompletion(def, inst);
        assert.ok(song);
        const notes = melody(song), ladder = g.PALETTES[paletteId].MIDI;
        assert.strictEqual(notes.length, 2 * count + 1);
        for (const p of inst.waypoints)
          assert.ok(notes.some(n => n.c === p.col && n.p === ladder[p.row] && n.len === 1));
        const boundaries = [-1, ...inst.waypoints.map(p => p.col), width];
        for (let i = 1; i < boundaries.length; i++)
          assert.strictEqual(notes.filter(n => n.c > boundaries[i - 1] && n.c < boundaries[i]).length, 1);
        assert.strictEqual(new Set(notes.map(n => n.c)).size, notes.length);
        assert.deepEqual(drums(song), Array.from({ length: Math.ceil(width / 4) }, (_, i) => ({ lane: 0, c: i * 4 })));
        assert.strictEqual(g.songEvidence(song).valid, true);
        assert.strictEqual(g.questWorkspaceMismatch(song, def), null);
        assert.strictEqual(g.questSetupCompletable(def, inst), null);
        assert.deepEqual({ inst, def }, before);
      }
});

test("a missing region cannot be repaired into a completion by putting a note on a landmark", () => {
  // MUTATION: remove the empty-region guard; midpoint rounding otherwise plants an overlapping note.
  const g = fresh(), def = definition(g);
  for (const cols of [[0, 7, 12], [3, 4, 12], [3, 7, 15]]) {
    const inst = instance(cols);
    assert.strictEqual(g.questSetupCompletion(def, inst), null);
    assert.strictEqual(g.questSetupCompletable(def, inst), "region-has-no-room");
  }
  assert.strictEqual(g.questSetupCompletion(def, { kind: "unregistered" }), null);
});

test("legal geometry does not bypass completion reachability in a workspace with no drums", () => {
  // MUTATION: questSetupCompletable returns null after geometry without checking the constructed song.
  const g = fresh(), def = definition(g), inst = instance();
  def.workspace.controlIds = [];
  assert.strictEqual(g.QUEST_SETUP_KINDS.waypoints.validateInstance(inst, def.setup, def), null);
  assert.strictEqual(g.questSetupCompletable(def, inst), "completion-unreachable:drums-not-granted");
});

test("an invalid constructed song is refused even when geometry was legal", () => {
  // MUTATION: drop the songEvidence validity check in questSetupCompletable.
  // Fault injection at a mutable function binding; neither the frozen registry nor index.html changes.
  const g = fresh(), def = definition(g), real = g.questSetupCompletion;
  const broken = real(def, instance()); broken.v = 999;
  const evidence = g.songEvidence(broken);
  assert.strictEqual(evidence.valid, false);
  g.questSetupCompletion = () => broken;
  assert.strictEqual(g.questSetupCompletable(def, instance()), "completion-invalid:" + evidence.code);
});

for (const [code, mutate] of [
  ["no-such-setup-kind", d => { d.setup.kind = "missing-kind"; }],
  ["setup-forbids-control", d => { d.workspace.controlIds.push("room"); }],
  ["setup-with-starter-song", d => { d.starterSong = clone(d.witnesses[0].songs.A); }],
  ["witness-setup-invalid", d => { d.witnesses[0].setup = instance([3, 4, 12]); }],
  ["witness-setup-unexpected", d => { delete d.setup; d.witnesses[0].setup = instance(); }],
]) {
  test("catalog reaches " + code + " through an otherwise valid definition", () => {
    // MUTATION: remove this named semantic check; publication must fail, not merely log a warning.
    const g = fresh(), def = definition(g);
    accepts(g, def);
    mutate(def);
    rejects(g, def, code);
  });
}

test("prototype property names are unknown setup kinds, not an exception in the schema walker", () => {
  // MUTATION: resolve an authored kind via inherited properties instead of an own-property lookup.
  const g = fresh(), base = definition(g), failures = [];
  for (const kind of ["constructor", "toString", "__proto__"]) {
    const def = clone(base); def.setup.kind = kind;
    const errors = catalog(g, def);
    assert.deepEqual(Object.keys(g.QUEST_DEFINITIONS), []);
    if (!errors.some(e => e.code === "no-such-setup-kind")) failures.push({ kind, errors });
  }
  assert.deepEqual(failures, []);
});

test("catalog validates the bounded rule and accepts optional valid witness instances", () => {
  // MUTATION: skip parameterSchema, validate only the first witness, or require every ordinary
  // route witness to carry an optional setup instance.
  const g = fresh(), base = definition(g);
  accepts(g, base); // shipped witnesses intentionally have no setup yet
  for (const [key, value, code] of [["count", 1, "int-range"], ["count", 6, "int-range"],
    ["minGap", 9, "int-range"], ["edgeMargin", 0, "int-range"], ["maxRowSpread", 5, "int-range"],
    ["extra", 1, "unknown-key"]]) {
    const def = clone(base); def.setup[key] = value;
    rejects(g, def, code, "$.setup." + key);
  }
  const good = clone(base);
  good.witnesses.forEach(w => { w.setup = instance(); });
  accepts(g, good);
  good.witnesses.at(-1).setup.waypoints[0].row = 99;
  rejects(g, good, "witness-setup-invalid");
  const absent = clone(base); delete absent.setup;
  accepts(g, absent);
});

test("v1 and v2 reject the same malformed common fields, including nested phase and witness fields", () => {
  // MUTATION: relax a v2 common constraint or silently omit a common field while copying v1's shape.
  // Generate adversarial JSON from the FIXTURE, not from the production schema under test.
  const g = fresh(), base = definition(g); delete base.setup;
  const edits = [];
  function visit(value, path = []) {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      const at = [...path, key];
      // Song payloads and analyzer params are intentionally opaque to the outer grammar.
      if (key === "songs" || key === "params") continue;
      edits.push({ at, remove: true });
      for (const replacement of [null, false, 1.5, "", [], {}]) edits.push({ at, replacement });
      visit(child, at);
    }
    if (!Array.isArray(value)) edits.push({ at: [...path, "unknownField"], replacement: 1 });
  }
  visit(base);
  let refusals = 0;
  for (const edit of edits) {
    if (edit.at[0] === "v") continue;
    const def = clone(base);
    let target = def;
    for (const key of edit.at.slice(0, -1)) target = target[key];
    if (edit.remove) delete target[edit.at.at(-1)];
    else target[edit.at.at(-1)] = edit.replacement;
    const a = [], b = [];
    def.v = 1; const v1 = g.QUEST_SCHEMA_VALIDATORS[1](def, a);
    def.v = 2; const v2 = g.QUEST_SCHEMA_VALIDATORS[2](def, b);
    assert.strictEqual(v2, v1, JSON.stringify(edit));
    assert.deepEqual(b, a, JSON.stringify(edit));
    if (!v1) refusals++;
  }
  assert.ok(refusals > 500, "the corpus must actually exercise refusals");
  for (const v of [1, 2]) { const def = clone(base); def.v = v; accepts(g, def); }
});

test("setup is a v2-only definition key and unsupported versions never dispatch as v2", () => {
  // MUTATION: add setup to v1, or fall back to the newest validator for unknown versions.
  const g = fresh(), base = definition(g);
  const old = clone(base); old.v = 1;
  rejects(g, old, "unknown-key", "$.setup");
  accepts(g, base);
  for (const v of [0, 3, -1, 2.5, null, "constructor", "__proto__"]) {
    const def = clone(base); def.v = v;
    rejects(g, def, "unsupported-schema-version");
  }
});

test("newQuestRun deeply owns its instance, including one supplied by a frozen definition", () => {
  // MUTATION: store o.setup directly or shallow-copy it; frozen witness data would become the run's
  // frozen/shared waypoints, and later player state could alias catalog data.
  const g = fresh(), def = definition(g);
  def.witnesses[0].setup = instance();
  accepts(g, def);
  const frozen = g.QUEST_DEFINITIONS[def.id], setup = frozen.witnesses[0].setup;
  assert.strictEqual(Object.isFrozen(setup.waypoints[0]), true);
  const args = { runId: "owned", questId: def.id, definitionVersion: 2,
    song: g.QUEST_SETUP_KINDS.waypoints.startingSong(def, setup), span: { start: 0, end: 16 }, setup, at: 10 };
  const run = g.newQuestRun(args);
  assert.deepEqual(run.setup, setup);
  assert.notStrictEqual(run.setup, setup);
  assert.notStrictEqual(run.setup.waypoints, setup.waypoints);
  assert.notStrictEqual(run.setup.waypoints[0], setup.waypoints[0]);
  run.setup.waypoints[0].row = 0;
  assert.strictEqual(setup.waypoints[0].row, 2);
  const mutable = instance();
  const second = g.newQuestRun({ ...args, setup: mutable });
  mutable.waypoints[1].col = 99;
  assert.strictEqual(second.setup.waypoints[1].col, 7);
  const omitted = { ...args }; delete omitted.setup;
  assert.strictEqual(g.newQuestRun(omitted).setup, null);
  assert.strictEqual(g.newQuestRun({ ...args, setup: null }).setup, null);
});

test("start stores the seeded instance and opens exactly its landmarks, never the constructed completion", () => {
  // MUTATION: omit seed/setup from the run, open an empty song, or open questSetupCompletion instead.
  const g = fresh();
  for (const id of ["firefly-crossing", "waking-woods"]) {
    const def = g.QUEST_DEFINITIONS[id], before = clone(def), runId = launch(g, id);
    const run = g.QUEST_RUNS[runId], k = g.QUEST_SETUP_KINDS.waypoints;
    assert.deepEqual(run.setup, { seed: runId, ...k.generate(def.setup, def, g.questRng(runId)) });
    assert.strictEqual(run.definitionVersion, 2);
    assert.deepEqual(melody(run.versions.A.song), melody(k.startingSong(def, run.setup)));
    assert.deepEqual(drums(run.versions.A.song), []);
    assert.deepEqual(g.Store.get("questRuns").runs[runId].setup, run.setup);
    assert.deepEqual(def, before);
  }
});

test("impossible rule-width combinations are refused before persisting or entering a run", () => {
  // MUTATION: remove startQuestRun's geometry validation. Schema bounds alone cannot establish fit.
  const g = fresh(), def = definition(g), before = g.activeScope;
  let checked = 0;
  g.saveQuestRuns = () => { throw new Error("an impossible deal reached persistence"); };
  g.enterQuestRun = () => { throw new Error("an impossible deal reached entry"); };
  for (let width = 16; width <= 64; width++)
    for (const count of [2, 3, 4, 5])
      for (const minGap of [2, 3, 4, 5, 6, 7, 8])
        for (const edgeMargin of [1, 2, 3, 4, 5, 6, 7, 8]) {
          const rule = { ...RULE, count, minGap, edgeMargin };
          if (enoughRoom(rule, width)) continue;
          def.setup = rule; def.workspace.columns = width;
          g.QUEST_DEFINITIONS = { [def.id]: def };
          const result = g.startQuestRun(def.id);
          assert.strictEqual(result.ok, false);
          assert.strictEqual(result.code, "setup-unusable");
          assert.ok(result.extra);
          checked++;
        }
  assert.ok(checked > 1000);
  assert.deepEqual(Object.keys(g.QUEST_RUNS), []);
  assert.strictEqual(g.activeScope, before);
});

test("start refuses legal geometry whose constructed completion is unreachable", () => {
  // MUTATION: call only validateInstance in startQuestRun, skipping obligation two.
  const g = fresh(), def = definition(g), scope = g.activeScope;
  // Isolate the launcher from catalog's separate analyzer/control constraints.
  def.workspace.controlIds = [];
  g.QUEST_DEFINITIONS = { [def.id]: def };
  g.saveQuestRuns = () => { throw new Error("unusable setup reached persistence"); };
  g.enterQuestRun = () => { throw new Error("unusable setup reached entry"); };
  assert.deepEqual(g.startQuestRun(def.id), { ok: false, code: "setup-unusable",
    extra: "completion-unreachable:drums-not-granted" });
  assert.deepEqual(Object.keys(g.QUEST_RUNS), []);
  assert.strictEqual(g.activeScope, scope);
});

test("a failed setup-run write publishes neither a run nor a new play scope", () => {
  // MUTATION: publish/enter the generated run before saveQuestRuns succeeds.
  const g = fresh(), scope = g.activeScope;
  const rng = g.questRng; g.questRng = () => rng("fixture-4");
  g.Store.set = () => false;
  assert.deepEqual(g.startQuestRun("firefly-crossing"), { ok: false, code: "store-failed" });
  assert.deepEqual(Object.keys(g.QUEST_RUNS), []);
  assert.strictEqual(g.activeScope, scope);
});

test("leave, hydrate in a fresh VM, edit and fork preserve the authoritative deal without RNG", t => {
  // MUTATION: reconstruct setup on enter/hydrate/phase advance or replace the edited draft with the
  // generated starting song. A different valid stored deal defeats same-seed regeneration false proofs.
  const first = fresh(), runId = launch(first), def = first.QUEST_DEFINITIONS["firefly-crossing"];
  const dealt = clone(first.QUEST_RUNS[runId].setup);
  const authoritative = { ...instance([2, 6, 13], [2, 3, 4]), seed: "archived-seed" };
  assert.notDeepEqual(authoritative.waypoints, dealt.waypoints);
  first.QUEST_RUNS[runId].setup = authoritative;
  const edited = first.questSetupCompletion(def, authoritative);
  melody(edited).push({ p: 72, c: 1, len: 1 });
  first.applySong(edited); first.noteEdit("setup-resume-fixture");
  assert.strictEqual(first.QUEST_RUNS[runId].versions.A.editRev, 1);
  assert.strictEqual(first.performQuestAction("leave").ok, true);
  const stored = clone(first.Store.get("questRuns"));
  const g = fresh();
  g.Store.set("questRuns", stored);
  g.questRng = () => { throw new Error("resuming must never request a deal"); };
  g.hydrateQuestRuns();
  assert.deepEqual(g.QUEST_RUNS[runId].setup, authoritative);
  assert.strictEqual(g.enterQuestRun(runId).ok, true);
  assert.deepEqual(g.QUEST_RUNS[runId].versions.A.song, stored.runs[runId].versions.A.song);
  const version = g.QUEST_RUNS[runId].versions.A;
  assert.strictEqual(g.transactQuestRun(runId, [{ type: "completePass", versionId: "A",
    editRev: version.editRev, sessionId: "setup-heard", at: 20 }]).ok, true);
  assert.strictEqual(continueQuest(g).ok, true);
  assert.strictEqual(g.QUEST_RUNS[runId].phase, 1);
  assert.deepEqual(g.QUEST_RUNS[runId].setup, authoritative);
  assert.deepEqual(g.QUEST_RUNS[runId].versions.B.song, version.song);
  g.performQuestAction("leave");
  g.hydrateQuestRuns();
  assert.strictEqual(g.enterQuestRun(runId).ok, true);
  assert.deepEqual(g.QUEST_RUNS[runId].setup, authoritative);
  assert.deepEqual(g.Store.get("questRuns").runs[runId].setup, authoritative);
  const revised = clone(g.QUEST_RUNS[runId].versions.B.song);
  melody(revised).push({ p: 74, c: 15, len: 1 });
  g.applySong(revised); g.noteEdit("second-path");
  const b = g.QUEST_RUNS[runId].versions.B;
  assert.strictEqual(g.transactQuestRun(runId, [{ type: "completePass", versionId: "B",
    editRev: b.editRev, sessionId: "b-heard", at: 30 }]).ok, true);
  assert.strictEqual(continueQuest(g).ok, true);
  assert.strictEqual(g.QUEST_RUNS[runId].phase, 2);
  g.performQuestAction("leave"); g.hydrateQuestRuns();
  assert.strictEqual(g.enterQuestRun(runId).ok, true);
  for (const versionId of ["A", "B"]) {
    const v = g.QUEST_RUNS[runId].versions[versionId];
    assert.strictEqual(g.transactQuestRun(runId, [{ type: "audition", versionId,
      editRev: v.editRev, sessionId: v.lastCompletePlaySessionId, at: 40 }]).ok, true);
  }
  g.questAfterReceipt(runId);
  t.after(() => { if (g.playing) g.stop(); });
  assert.strictEqual(g.performQuestAction("pick", { versionId: "B" }).ok, true);
  assert.strictEqual(g.performQuestAction("offer").ok, true);
  assert.strictEqual(g.QUEST_RUNS[runId].status, "completed");
  assert.deepEqual(g.QUEST_RUNS[runId].setup, authoritative);
  assert.deepEqual(g.Store.get("questRuns").runs[runId].setup, authoritative);
});

test("replay deals a new instance without overwriting the earlier run", () => {
  // MUTATION: reuse a previous run's seed/instance when starting a new run of the same definition.
  const g = fresh(), rng = g.questRng, seen = [];
  let serial = 0;
  g.__window.Math = Object.assign(Object.create(Math), { random: () => ++serial / 100 });
  g.questRng = seed => { seen.push(seed); return rng("fixture-4"); };
  const a = g.startQuestRun("firefly-crossing").runId, before = clone(g.QUEST_RUNS[a]);
  g.performQuestAction("leave");
  const b = g.startQuestRun("firefly-crossing").runId;
  assert.notStrictEqual(a, b);
  assert.deepEqual(seen, [a, b]);
  assert.strictEqual(g.QUEST_RUNS[b].setup.seed, b);
  assert.notStrictEqual(g.QUEST_RUNS[a].setup, g.QUEST_RUNS[b].setup);
  assert.deepEqual(g.QUEST_RUNS[a], before);
  assert.deepEqual(g.Store.get("questRuns").runs[a], before);
  // Different seeds MAY collide geometrically; asserting unequal coordinates would be a flaky proof.
});

test("hydrated generated runs with missing or illegal instances must not resume", () => {
  // MUTATION: hydrate/enter trust the old run envelope and never validate its new setup field.
  // Refusal may happen at hydration OR entry; no error-code policy is invented for the repair.
  const first = fresh(), runId = launch(first), good = clone(first.Store.get("questRuns"));
  const failures = [];
  for (const [name, mutate] of [
    ["missing", run => { delete run.setup; }],
    ["null", run => { run.setup = null; }],
    ["wrong-kind", run => { run.setup.kind = "absent"; }],
    ["off-ladder", run => { run.setup.waypoints[0].row = 999; }],
    ["empty-region", run => { run.setup.waypoints[0].col = 0; }],
    ["wrong-count", run => { run.setup.waypoints.pop(); }],
  ]) {
    const g = fresh(), env = clone(good); mutate(env.runs[runId]);
    g.Store.set("questRuns", env);
    g.questRng = () => { throw new Error("corruption must not be repaired by redealing"); };
    g.hydrateQuestRuns();
    if (g.enterQuestRun(runId).ok) failures.push(name);
  }
  assert.deepEqual(failures, [], "invalid persisted task instances were accepted");
});

test("a rule whose landmarks cannot fit its own field is refused by the catalog", () => {
  // MUTATION: drop the feasibility check, leaving the refusal to startQuestRun.
  // Geometry that cannot fit is an authoring mistake, and the moment to say so is while a person is
  // still editing the file — not when a child presses Begin and gets a dead end.
  const wide = d => { d.setup = { ...RULE, count: 5, minGap: 8, edgeMargin: 4 }; };
  const g2 = fresh();
  const d = definition(g2);
  wide(d);
  g2.loadQuestCatalog(JSON.stringify({ v: 1, definitions: [d] }), "official");
  assert.strictEqual(g2.QUEST_CATALOG_ERRORS.map(e => e.code).includes("setup-rule-infeasible"), true,
    JSON.stringify(g2.QUEST_CATALOG_ERRORS));
  assert.deepEqual(Object.keys(g2.QUEST_DEFINITIONS), []);

  // …and the same rule in a field wide enough for it is accepted
  const g3 = fresh();
  const roomy = definition(g3);
  wide(roomy); roomy.workspace.columns = 48;
  for (const w of roomy.witnesses) for (const v of Object.keys(w.songs)) {
    const s = w.songs[v]; s.time.cols = 48;
    const hits = s.tracks[1].hits;
    if (hits.length) { const lane = hits[0].lane, step = hits.length > 4 ? 2 : 4;
      s.tracks[1].hits = []; for (let c = 0; c < 48; c += step) s.tracks[1].hits.push({ lane, c }); }
  }
  g3.loadQuestCatalog(JSON.stringify({ v: 1, definitions: [roomy] }), "official");
  assert.strictEqual(g3.QUEST_CATALOG_ERRORS.map(e => e.code).includes("setup-rule-infeasible"), false,
    JSON.stringify(g3.QUEST_CATALOG_ERRORS));
});

test("v1 runs without tasks still launch and resume with setup null", () => {
  // MUTATION: require/generated setup for every run, breaking the v1 no-task path.
  const g = fresh(), def = definition(g); delete def.setup; def.v = 1;
  accepts(g, def);
  g.questRng = () => { throw new Error("a static definition must not deal a task"); };
  const runId = launch(g);
  assert.strictEqual(g.QUEST_RUNS[runId].setup, null);
  assert.deepEqual(melody(g.QUEST_RUNS[runId].versions.A.song), []);
  g.performQuestAction("leave");
  g.hydrateQuestRuns();
  assert.strictEqual(g.enterQuestRun(runId).ok, true);
  assert.strictEqual(g.QUEST_RUNS[runId].setup, null);
});
