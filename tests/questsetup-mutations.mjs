// Optional, dependency-free proof audit (Node >=22.15): node tests/questsetup-mutations.mjs
// Each green test is run once unchanged, then against its named fault IN MEMORY. Existing red
// regressions are never counted as mutation kills. Temporary repair experiments below establish
// that those tests can pass; they do not change source or the ordinary suite's expected failures.
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = readFileSync(new URL("../index.html", import.meta.url), "utf8").match(/<script>([\s\S]*?)<\/script>/)[1];
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function run(title, patches = []) {
  let candidate = source;
  for (const [from, to] of patches) {
    assert.strictEqual(candidate.split(from).length, 2, "unique mutation anchor: " + from);
    candidate = candidate.replace(from, to);
  }
  new Function(candidate); // A syntax error is not a caught behavioral mutation.
  const result = spawnSync(process.execPath, ["--import", "./tests/helpers/questsetup-mutation-hook.mjs",
    "--test", "--test-reporter=tap", "--test-name-pattern=^" + escape(title) + "$",
    "tests/questsetup.test.mjs"], { cwd: root, encoding: "utf8", timeout: 20000,
    env: { ...process.env, QUEST_SETUP_MUTATIONS: JSON.stringify(patches) } });
  assert.ifError(result.error);
  assert.strictEqual(result.signal, null);
  return result;
}
const mutations = [
  ["RNG pins version-one sequences, including the empty seed and UTF-16 input", "h=2166136261>>>0", "h=2166136260>>>0"],
  ["the setup registry, rule grammar and forbidden controls are deeply frozen",
    "const questRegistry = obj => deepFreezeQuest(Object.assign(Object.create(null), obj));",
    "const questRegistry = obj => Object.freeze(Object.assign(Object.create(null), obj));"],
  ...[["count:QT.int(2,5)", "count:QT.int(1,5)"], ["minGap:QT.int(2,8)", "minGap:QT.int(1,8)"],
    ["edgeMargin:QT.int(1,8)", "edgeMargin:QT.int(0,8)"], ["maxRowSpread:QT.int(0,4)", "maxRowSpread:QT.int(0,5)"]]
    .map(([from, to]) => ["rule grammar accepts every bounded tuple and rejects malformed parameters", from, to]),
  ["shipped deals are repeatable, varied, versioned and valid across 512 seeds per quest", "generate(rule, def, rng){", "generate(rule, def, rng){ rng=questRng('constant');"],
  ["shipped deals are repeatable, varied, versioned and valid across 512 seeds per quest",
    'return { kind:"waypoints", generatorVersion:QUEST_SETUP_GENERATOR_VERSION, waypoints };',
    'return { kind:"waypoints", generatorVersion:0, waypoints };'],

  // ---- the three defects GPT found, each with the fault that brings it back ----
  ["every feasible schema rule at every width generates legal geometry on both ladders",
    "const lo=Math.max(rule.edgeMargin, 1), hi=span-1-Math.max(rule.edgeMargin, 1);",
    "const lo=1, hi=span-2;"],
  ["every feasible schema rule at every width generates legal geometry on both ladders",
    "const step=Math.max(rule.minGap, 2), slack=(hi-lo)-(rule.count-1)*step;",
    "const step=2, slack=(hi-lo)-(rule.count-1)*step;"],
  ["hydrated generated runs with missing or illegal instances must not resume",
    "if(kind.validateInstance(run.setup, def.setup, def) || questSetupCompletable(def, run.setup))",
    "if(false)"],
  ["prototype property names are unknown setup kinds, not an exception in the schema walker",
    "const questRegistry = obj => deepFreezeQuest(Object.assign(Object.create(null), obj));",
    "const questRegistry = obj => deepFreezeQuest(Object.assign({}, obj));"],
  ["a rule whose landmarks cannot fit its own field is refused by the catalog",
    'if(kind.feasible && !kind.feasible(def.setup, def))', "if(false)"],
  ...["not-waypoints", "wrong-count", "bad-waypoint", "row-off-ladder", "columns-not-ascending", "no-room-before",
    "no-room-after", "gap-too-narrow", "row-spread-too-wide"].map(code => [
    "instance validation specifically rejects " + code, 'return "' + code + '";', "return null;",
  ]),
  ["geometry accepts exact bounds and uses the definition's ladder, not the live palette", "if(w[0].col<rule.edgeMargin)", "if(w[0].col<=rule.edgeMargin)"],
  ["regions exactly partition free columns and the starting song contains only landmarks", "to:w[0].col-1", "to:w[0].col"],
  ["regions exactly partition free columns and the starting song contains only landmarks", "({ p:ladder[p.row], c:p.col, len:1 })", "({ p:ladder[0], c:p.col, len:1 })"],
  ["constructed completions preserve landmarks and fill every region throughout the workspace range", "for(const r of kind.regions(inst, def)){", "for(const r of kind.regions(inst, def).slice(1)){"],
  ["constructed completions preserve landmarks and fill every region throughout the workspace range", "for(let c=0;c<def.workspace.columns;c+=4) song.tracks[1]", "for(let c=0;c<16;c+=4) song.tracks[1]"],
  ["a missing region cannot be repaired into a completion by putting a note on a landmark", "if(r.to<r.from) return null;", "if(false) return null;"],
  ["legal geometry does not bypass completion reachability in a workspace with no drums", 'return m ? "completion-unreachable:"+m : null;', "return null;"],
  ["an invalid constructed song is refused even when geometry was legal", 'if(!ev.valid) return "completion-invalid:"+ev.code;', "if(false) return null;"],
  ["catalog reaches no-such-setup-kind through an otherwise valid definition", 'if(!kind) err("no-such-setup-kind","$.setup",def.setup && def.setup.kind);', "if(!kind) {}"],
  ["catalog reaches setup-forbids-control through an otherwise valid definition", 'if(granted.has(c)) err("setup-forbids-control","$.setup",c);', "if(false) {}"],
  ["catalog reaches setup-with-starter-song through an otherwise valid definition", 'if(def.starterSong!==undefined) err("setup-with-starter-song","$.setup","both");', "if(false) {}"],
  ["catalog reaches witness-setup-invalid through an otherwise valid definition", 'if(bad) err("witness-setup-invalid","$.witnesses",w.id+":"+bad);', "if(false) {}"],
  ["catalog reaches witness-setup-unexpected through an otherwise valid definition", 'err("witness-setup-unexpected","$.witnesses",w.id);', ";"],
  ["catalog validates the bounded rule and accepts optional valid witness instances", 'if(!questCheck(def.setup, kind.parameterSchema, "$.setup", errs)) ok=false;', "if(false) ok=false;"],
  ["v1 and v2 reject the same malformed common fields, including nested phase and witness fields",
    'Object.assign({ v:QT.lit(2), setup:QT.opaque() }, QUEST_SHAPE_COMMON)',
    'Object.assign({ v:QT.lit(2), setup:QT.opaque() }, QUEST_SHAPE_COMMON, { title:QT.opaque() })'],
  ["setup is a v2-only definition key and unsupported versions never dispatch as v2",
    'QUEST_SCHEMA_V1=QT.obj(Object.assign({ v:QT.lit(1) }, QUEST_SHAPE_COMMON), ["starterSong"])',
    'QUEST_SCHEMA_V1=QT.obj(Object.assign({ v:QT.lit(1), setup:QT.opaque() }, QUEST_SHAPE_COMMON), ["starterSong","setup"])'],
  ["newQuestRun deeply owns its instance, including one supplied by a frozen definition", "setup:o.setup ? jclone(o.setup) : null", "setup:o.setup ? Object.assign({},o.setup) : null"],
  ["start stores the seeded instance and opens exactly its landmarks, never the constructed completion", "song=kind.startingSong(def, setup);", "song=questSetupCompletion(def, setup);"],
  ["impossible rule-width combinations are refused before persisting or entering a run", "kind.validateInstance(setup, def.setup, def) || questSetupCompletable(def, setup)", "questSetupCompletable(def, setup)"],
  ["start refuses legal geometry whose constructed completion is unreachable", "kind.validateInstance(setup, def.setup, def) || questSetupCompletable(def, setup)", "kind.validateInstance(setup, def.setup, def)"],
  ["a failed setup-run write publishes neither a run nor a new play scope", 'if(!saved) return { ok:false, code:"store-failed" };    // a full disk must not produce a run nothing saved', 'if(!saved) { QUEST_RUNS=cand; return { ok:false, code:"store-failed" }; }'],
  ["leave, hydrate in a fresh VM, edit and fork preserve the authoritative deal without RNG", "function enterQuestRun(runId){", "function enterQuestRun(runId){ questRng(runId);"],
  ["leave, hydrate in a fresh VM, edit and fork preserve the authoritative deal without RNG", "function hydrateQuestRuns(){", "function hydrateQuestRuns(){ questRng('hydrate');"],
  ["replay deals a new instance without overwriting the earlier run", "kind.generate(def.setup, def, questRng(runId))", "kind.generate(def.setup, def, questRng('previous-run'))"],
  ["v1 runs without tasks still launch and resume with setup null", "setup:o.setup ? jclone(o.setup) : null", "setup:o.setup ? jclone(o.setup) : {}"],
];

const green = new Set();
for (const [title, from, to] of mutations) {
  if (!green.has(title)) {
    const baseline = run(title);
    assert.strictEqual(baseline.status, 0, "not a green baseline: " + title + "\n" + baseline.stdout + baseline.stderr);
    assert.ok(baseline.stdout.includes("ok 1 - " + title), "test pattern selected no test");
    green.add(title);
  }
  const mutant = run(title, [[from, to]]);
  assert.notStrictEqual(mutant.status, 0, "SURVIVED: " + title + " / " + from);
  assert.ok(mutant.stdout.includes("not ok 1 - " + title), "failed outside the intended test:\n" + mutant.stdout + mutant.stderr);
  assert.ok(!mutant.stdout.includes("Harness source extraction changed") && !mutant.stdout.includes("Mutation anchor must occur once"));
  console.log("caught: " + title + " / " + from);
}

// The five regressions this audit was written alongside are now ordinary green tests: the dealer reads
// its own bounds, a hydrated instance is re-validated, and an inherited property name finds nothing.
// Their repair experiments are gone with the defects; the faults above are what keeps them honest.
console.log(`${mutations.length} mutations caught across ${green.size} green tests. No source files changed.`);
