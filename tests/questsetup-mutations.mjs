// Optional, dependency-free proof audit (Node >=22.15): node tests/questsetup-mutations.mjs
// Each green test is run once unchanged, then against its named fault IN MEMORY.
// A syntax/load failure or a test that was already red is never counted as a mutation kill.
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { fragmentMutations } from "./helpers/quest-fragment-mutations.mjs";
import { e6Mutations } from "./helpers/quest-e6-mutations.mjs";
import { playtestMutations } from "./helpers/quest-playtest-mutations.mjs";
import { gMutations } from "./helpers/quest-g-mutations.mjs";
import { hMutations } from "./helpers/quest-h-mutations.mjs";
import { gameScripts, applyPatches, countAcross, checkSyntax } from "./helpers/game-scripts.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
// The game's scripts, in document order. Anchors are unique across all of them and patched where they live.
const { scripts } = gameScripts();
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const evidenceLoop = 'function questEvaluateRun(run, def){\n  const versions={};\n  for(const id of Object.keys(run.versions)) versions[id]=songEvidence(run.versions[id].song);';
const testFiles = ["quest-h.test.mjs", "quest-g.test.mjs", "questauthoring.test.mjs", "questauthoring-d7-review.test.mjs", "quest-fragments.test.mjs", "questsetup.test.mjs", "questsetup-readiness.test.mjs", "questavailability.test.mjs", "quest-playtest.test.mjs", "questpick.test.mjs", "questcontroller.test.mjs", "questcontroller-d4-review.test.mjs", "questshell.test.mjs", "questshell-d5-review.test.mjs", "questfinale.test.mjs", "questcast.test.mjs", "quest-e6-review.test.mjs", "questlisten.test.mjs"]
  .map(name => ({ path: "tests/" + name, source: readFileSync(new URL("./" + name, import.meta.url), "utf8") }));
function run(title, patches = []) {
  let candidate = scripts;
  for (const [from, to] of patches) {
    assert.strictEqual(countAcross(candidate, from), 1, "unique mutation anchor: " + from);
    candidate = applyPatches(candidate, [[from, to]]);
  }
  checkSyntax(candidate); // A syntax error is not a caught behavioral mutation.
  const matches = testFiles.filter(f => f.source.includes('test("' + title + '"'));
  assert.ok(matches.length <= 1, "ambiguous mutation test: " + title);
  // questsetup also generates test titles in loops; the baseline TAP assertion below proves
  // that the exact title ran, so a typo can never count as a green test or a caught mutation.
  const file = matches[0]?.path || "tests/questsetup.test.mjs";
  const result = spawnSync(process.execPath, ["--import", "./tests/helpers/questsetup-mutation-hook.mjs",
    "--test", "--test-reporter=tap", "--test-name-pattern=^" + escape(title) + "$",
    file], { cwd: root, encoding: "utf8", timeout: 20000,
    env: { ...process.env, QUEST_SETUP_MUTATIONS: JSON.stringify(patches) } });
  assert.ifError(result.error);
  assert.strictEqual(result.signal, null);
  return result;
}
const mutations = [
  // ---- two shipped defects GPT found while reviewing a proposal that was not built ----
  // Every spare column was spent before the last landmark, so it fell on the bound in every deal.
  ["the slack reaches the stretch after the last landmark, so that landmark moves",
    "const extra=new Array(rule.count+1).fill(0);\n      for(let i=0;i<b.slack;i++) extra[Math.floor(rng()*(rule.count+1))]++;",
    "const extra=new Array(rule.count).fill(0);\n      for(let i=0;i<b.slack;i++) extra[Math.floor(rng()*rule.count)]++;"],
  // Obligation two asked whether the constructed song was legal, never whether it finished anything.
  ["a completion that completes nothing is refused",
    '  const rd=QUEST_READINESS[def.setup && def.setup.kind];\n  if(rd){ const missing=rd.missing(def, inst, ev);\n    if(missing.length) return "completion-incomplete:"+missing[0].code; }\n', ""],

  // ---- the four defects GPT's tester found in commit 6, each with the fault that brings it back ----
  // Offering saved the STORED version while the field held an edit that never reached the store.
  ["a failed comparison edit cannot be offered as an older saved document",
    '    if(questHasUnsavedEdit(runId, run.selection)) return fail("unsaved-edit");\n', ""],
  ["a failed comparison edit cannot be offered as an older saved document",
    "enabled:!!(proc && proc.canOffer) && !unsaved", "enabled:!!(proc && proc.canOffer)"],
  // Switching paths repainted from the other version, taking the unsaved note with it for good.
  ["switching paths cannot silently discard a failed edit",
    '    if(o.versionId!==run.draft && questHasUnsavedEdit(runId, run.draft)) return fail("unsaved-edit");\n', ""],
  ["switching paths cannot silently discard a failed edit",
    "enabled: !unsaved || run.draft===id })) : [];", "enabled: true })) : [];"],
  // The card read no saved state at all, so it announced the song deleted in the breath that saved it.
  ["the screen speaks the moment the song is saved",
    "    saved: questSavedState(getSaves(), run),\n", ""],
  // A warning that does not say a write failed is worse than no warning at all.
  ["the unsaved exit explanation still says the change was not saved",
    "Your last change could not be saved, so it would be lost if you left now.",
    "Your last change is safe."],

  ["RNG pins version-one sequences, including the empty seed and UTF-16 input", "h=2166136261>>>0", "h=2166136260>>>0"],
  ["the setup registry, rule grammar and forbidden controls are deeply frozen",
    "const questRegistry = obj => deepFreezeQuest(Object.assign(Object.create(null), obj));",
    "const questRegistry = obj => Object.freeze(Object.assign(Object.create(null), obj));"],
  ...[["count:QT.int(2,5)", "count:QT.int(1,5)"], ["minGap:QT.int(2,8)", "minGap:QT.int(1,8)"],
    ["edgeMargin:QT.int(1,8)", "edgeMargin:QT.int(0,8)"], ["rowMargin:QT.int(0,4)", "rowMargin:QT.int(0,5)"],
    ["minRowSpread:QT.int(0,4)", "minRowSpread:QT.int(0,5)"], ["maxRowSpread:QT.int(0,4)", "maxRowSpread:QT.int(0,5)"]]
    .map(([from, to]) => ["rule grammar accepts every bounded tuple and rejects malformed parameters", from, to]),
  ["shipped deals are repeatable, varied, versioned and valid across 512 seeds per quest", "generate(rule, def, rng){", "generate(rule, def, rng){ rng=questRng('constant');"],
  ["shipped deals are repeatable, varied, versioned and valid across 512 seeds per quest",
    'const inst={ kind:"waypoints", generatorVersion:QUEST_SETUP_GENERATOR_VERSION, waypoints };',
    'const inst={ kind:"waypoints", generatorVersion:0, waypoints };'],

  // ---- the three defects GPT found, each with the fault that brings it back ----
  ["every horizontal rule at every width generates legal geometry on both ladders",
    "const lo=Math.max(rule.edgeMargin, 1), hi=span-1-Math.max(rule.edgeMargin, 1);",
    "const lo=1, hi=span-2;"],
  ["every horizontal rule at every width generates legal geometry on both ladders",
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
    "no-room-after", "gap-too-narrow", "row-spread-too-wide", "row-spread-too-narrow", "row-off-band"].map(code => [
    "instance validation specifically rejects " + code, 'return "' + code + '";', "return null;",
  ]),
  ["geometry accepts exact bounds and uses the definition's ladder, not the live palette", "if(w[0].col<rule.edgeMargin)", "if(w[0].col<=rule.edgeMargin)"],
  ["regions exactly partition free columns and the starting song contains only landmarks", "to:w[0].col-1", "to:w[0].col"],
  ["regions exactly partition free columns and the starting song contains only landmarks", "({ p:ladder[p.row], c:p.col, len:1 })", "({ p:ladder[0], c:p.col, len:1 })"],
  ["constructed completions preserve landmarks and fill every region throughout the workspace range", "for(const r of kind.regions(inst, def)){", "for(const r of kind.regions(inst, def).slice(1)){"],
  ["constructed completions preserve landmarks and fill every region throughout the workspace range", "for(let c=0;c<def.workspace.columns;c+=4)\n    if(!song.tracks[1].hits", "for(let c=0;c<16;c+=4)\n    if(!song.tracks[1].hits"],
  ["a missing region cannot be repaired into a completion by putting a note on a landmark", "if(r.to<r.from) return null;", "if(false) return null;"],
  ["legal geometry does not bypass completion reachability in a workspace with no drums",
    'if(m) return "completion-unreachable:"+m;', "if(false) return m;"],
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
  ["setup is a v2 and v3 definition key and unsupported versions never dispatch",
    'QUEST_SCHEMA_V1=QT.obj(Object.assign({ v:QT.lit(1) }, QUEST_SHAPE_COMMON), ["starterSong","cast"])',
    'QUEST_SCHEMA_V1=QT.obj(Object.assign({ v:QT.lit(1), setup:QT.opaque() }, QUEST_SHAPE_COMMON), ["starterSong","cast","setup"])'],
  ["newQuestRun deeply owns its instance, including one supplied by a frozen definition", "setup:o.setup ? jclone(o.setup) : null", "setup:o.setup ? Object.assign({},o.setup) : null"],
  ["start stores the seeded instance and opens exactly its landmarks, never the constructed completion", "song=kind.startingSong(def, setup);", "song=questSetupCompletion(def, setup);"],
  ["impossible rule-width combinations are refused before persisting or entering a run",
    "kind.validateInstance(hand, def.setup, def) || questSetupCompletable(def, hand)", "questSetupCompletable(def, hand)"],
  ["start refuses legal geometry whose constructed completion is unreachable",
    "kind.validateInstance(hand, def.setup, def) || questSetupCompletable(def, hand)", "kind.validateInstance(hand, def.setup, def)"],
  // the re-deal itself: a search is a lower bound, so an unvouched hand must be replaced, not refused
  ["a hand the search cannot vouch for is re-dealt, not refused in the child's face",
    "for(let attempt=0; attempt<12 && !setup; attempt++){", "for(let attempt=0; attempt<1 && !setup; attempt++){"],
  ["a hand the search cannot vouch for is re-dealt, not refused in the child's face",
    "for(let attempt=0; attempt<12 && !setup; attempt++){", "for(let attempt=0; attempt<9999 && !setup; attempt++){"],
  ["the hand that used to be refused for a search's shortcoming now launches",
    "attempt(along(slots, shapes[name]));", ";"],
  ["a failed setup-run write publishes neither a run nor a new play scope", 'if(!saved) return { ok:false, code:"store-failed" };    // a full disk must not produce a run nothing saved', 'if(!saved) { QUEST_RUNS=cand; return { ok:false, code:"store-failed" }; }'],
  ["leave, hydrate in a fresh VM, edit and fork preserve the authoritative deal without RNG", "function enterQuestRun(runId){", "function enterQuestRun(runId){ questRng(runId);"],
  ["leave, hydrate in a fresh VM, edit and fork preserve the authoritative deal without RNG", "function hydrateQuestRuns(){", "function hydrateQuestRuns(){ questRng('hydrate');"],
  ["replay deals a new instance without overwriting the earlier run", "kind.generate(def.setup, def, questRng(seed))", "kind.generate(def.setup, def, questRng('previous-run'))"],
  ["v1 runs without tasks still launch and resume with setup null", "setup:o.setup ? jclone(o.setup) : null", "setup:o.setup ? jclone(o.setup) : {}"],

  // ---- Step E commit 3: row bands, readiness, Q6, and the third obligation ----
  ...[
    ["return !!K.bounds(rule, def) && !!K.rowBounds(rule, def);", "return !!K.bounds(rule, def);"],
    ["(hi-lo)<rule.maxRowSpread || rule.minRowSpread>rule.maxRowSpread", "(hi-lo)<rule.maxRowSpread"],
    ["(hi-lo)<rule.maxRowSpread || rule.minRowSpread>rule.maxRowSpread", "rule.minRowSpread>rule.maxRowSpread"],
    ["(hi-lo)<rule.maxRowSpread || rule.minRowSpread>rule.maxRowSpread", "(hi-lo)<=rule.maxRowSpread || rule.minRowSpread>rule.maxRowSpread"],
    ["const lo=rule.rowMargin, hi=rows-1-rule.rowMargin;", "const lo=rule.rowMargin, hi=ROWS-1-rule.rowMargin;"],
  ].map(([from, to]) => ["row bounds and feasibility reject every impossible band independently of column fit", from, to]),
  ...[
    ["rowsPick[pinLo]=base; rowsPick[pinHi]=base+spread;", "rowsPick[pinHi]=base+spread;"],
    ["rowsPick[pinLo]=base; rowsPick[pinHi]=base+spread;", "rowsPick[pinLo]=base;"],
    ["if(pinHi===pinLo) pinHi=(pinLo+1)%rule.count;", "if(false) pinHi=(pinLo+1)%rule.count;"],
    ["rule.minRowSpread+Math.floor(rng()*(rule.maxRowSpread-rule.minRowSpread+1))", "rule.minRowSpread+Math.floor(rng()*(rule.maxRowSpread-rule.minRowSpread+2))"],
    ["const base=rb.lo+Math.floor(rng()*(room-spread+1));", "const base=Math.floor(rng()*(room-spread+1));"],
    ["const base=rb.lo+Math.floor(rng()*(room-spread+1));", "const base=rb.lo+Math.floor(rng()*(room-spread+2));"],
  ].map(([from, to]) => ["all 28000 schema tuples honor both spread bounds and margins across seeds", from, to]),
  ...[
    ['if(inst.waypoints.some(p=>!lit(p.row,p.col)))', 'if(false)'],
    ['if(empty) out.push({ code:"region-empty", descriptorId:"missing-region" });', 'if(false) out.push({ code:"region-empty", descriptorId:"missing-region" });'],
    ['if(ev.drumOnsetCount===0) out.push', 'if(false) out.push'],
    ['if(empty) out.push({ code:"region-empty", descriptorId:"missing-region" });', 'if(empty) for(const r of K.regions(inst, def)) out.push({ code:"region-empty", descriptorId:"missing-region" });'],
    ['out.push({ code:"landmark-gone", descriptorId:"missing-landmark" });', 'out.push({ code:"landmark-gone", descriptorId:"missing-landmark", count:1 });'],
    ['const lit=(row,col)=> !!(g[row] && g[row][col]);', 'const lit=(row,col)=> g.some(r=>!!r[col]);'],
    ['for(let c=r.from;c<=r.to;c++) for(let row=0;row<rows;row++) if(lit(row,c)) return false;', 'for(let c=r.from-1;c<=r.to+1;c++) for(let row=0;row<rows;row++) if(lit(row,c)) return false;'],
    ['"missing-region":{ kind:"missing",', '"missing-region":{ kind:"heard",'],
  ].map(([from, to]) => ["readiness is one missing sentence per kind across every missing-region subset", from, to]),
  ["drum evidence counts projected onsets on all lanes and clips out-of-span and duplicate hits",
    "melodyOnsetCount, drumOnsetCount, projected, contourFamilies", "melodyOnsetCount, projected, contourFamilies"],
  ["drum evidence counts projected onsets on all lanes and clips out-of-span and duplicate hits",
    "for(let d=0;d<dg.length;d++) for(let c=0;c<span;c++) if(dg[d][c]) drumOnsetCount++;",
    "for(let c=0;c<span;c++) if(dg[0][c]) drumOnsetCount++;"],
  ...[
    ['const rd=QUEST_READINESS[def.setup.kind];', 'const rd=def.id==="firefly-crossing" ? QUEST_READINESS[def.setup.kind] : null;'],
    ['const v=run.versions && run.versions[versionId];', 'const v=run.versions && run.versions.A;'],
    ['if(!ev.valid) return [{ code:"song-invalid", descriptorId:"missing-region" }];', 'if(!ev.valid) return [];'],
    ['if(!def || def.setup===undefined || !run || !run.setup) return [];', 'if(!def || !run || !run.setup) return [];'],
  ].map(([from, to]) => ["readiness dispatch uses setup kind and version, with safe no-task and invalid-song paths", from, to]),
  ["missing descriptors and setup kinds cannot be smuggled into procedure gateIds",
    '"playback.complete-since-last-edit":{ kind:"procedural",',
    '"readiness.waypoints":{ kind:"procedural", gate:()=>true }, "playback.complete-since-last-edit":{ kind:"procedural",'],
  ...[
    ['if(p.type!=="compare-offer" && questReadinessMissing(def, run, versionId).length) return false;', 'if(false) return false;'],
    ['if(p.type!=="compare-offer" && questReadinessMissing(def, run, versionId).length) return false;', 'if(p.type==="compose" && questReadinessMissing(def, run, versionId).length) return false;'],
    ['if(p.type!=="compare-offer" && questReadinessMissing(def, run, versionId).length) return false;', 'if(p.type!=="compare-offer" && questReadinessMissing(def, run, "A").length) return false;'],
  ].map(([from, to]) => ["each readiness kind blocks phases one and two after all procedural gates are open", from, to]),
  ...[
    ['if(p.type!=="compare-offer" && questReadinessMissing(def, run, versionId).length) return false;', 'if(questReadinessMissing(def, run, versionId).length) return false;'],
    ['const missing = p.type==="compare-offer" ? [] : questReadinessMissing(def, run, current);', 'const missing = questReadinessMissing(def, run, current);'],
  ].map(([from, to]) => ["Q6 permits a final offer that fails every readiness kind and matches no route", from, to]),
  ...[
    ['const missing = p.type==="compare-offer" ? [] : questReadinessMissing(def, run, current);', 'const missing = [];'],
    ['function evaluateQuest(def, evidence, run){', 'function evaluateQuest(def, evidence, run){ run.readinessProbe=true;'],
  ].map(([from, to]) => ["evaluateQuest reports readiness without mutating frozen inputs or consulting live state", from, to]),
  ["readiness exemptions follow phase type and absent setup rather than phase position or quest id",
    'if(p.type!=="compare-offer" && questReadinessMissing(def, run, versionId).length) return false;',
    'if(phaseIdx!==2 && questReadinessMissing(def, run, versionId).length) return false;'],
  ...[
    ['if(ev.valid) for(const f of ev.contourFamilies) if(found.indexOf(f)<0) found.push(f);', 'if(found.indexOf(name)<0) found.push(name);'],
    ['if(ev.valid) for(const f of ev.contourFamilies) if(found.indexOf(f)<0) found.push(f);', 'for(const f of ev.contourFamilies) if(found.indexOf(f)<0) found.push(f);'],
    ['if(ev.valid) for(const f of ev.contourFamilies) if(found.indexOf(f)<0) found.push(f);', 'if(ev.valid) for(const f of ev.contourFamilies) found.push(f);'],
    ['if(ev.valid) for(const f of ev.contourFamilies) if(found.indexOf(f)<0) found.push(f);', 'if(ev.valid) for(const f of ev.contourFamilies.slice(0,1)) if(found.indexOf(f)<0) found.push(f);'],
    ['for(const name of Object.keys(shapes)){', 'for(const name of Object.keys(shapes).slice(0,3)){'],
    // the dense fill is what made the search stop refusing legal hands; dropping it must be caught
    ['attempt(along(slots, shapes[name]));', ';'],
    ['attempt(along(regions, shapes[name]).map(([row,r])=>[row, Math.floor((r.from+r.to)/2)]));', ';'],
  ].map(([from, to]) => ["reachable families are exactly the evidence of real constructed songs, never strategy names", from, to]),
  ...[
    ['if(reach.length<2) return "one-contour-family-only";', 'if(false) return "one-contour-family-only";'],
    ['if(!want.some(f=>reach.indexOf(f)>=0)) return "route-unreachable:"+r.id;', 'if(false) return "route-unreachable:"+r.id;'],
    ['if(!want.some(f=>reach.indexOf(f)>=0)) return "route-unreachable:"+r.id;', 'if(!want.every(f=>reach.indexOf(f)>=0)) return "route-unreachable:"+r.id;'],
    ['for(const p of def.phases){\n    if(!p.challenge) continue;', 'for(const p of def.phases.slice(0,1)){\n    if(!p.challenge) continue;'],
  ].map(([from, to]) => ["route reachability checks each declared contour alternative after the two-family floor", from, to]),
  ["start checks geometry then completability then reachability before any write or entry",
    '|| questSetupRoutesReachable(def, hand);', ';'],
  ["start checks geometry then completability then reachability before any write or entry",
    'kind.validateInstance(hand, def.setup, def) || questSetupCompletable(def, hand)\n        || questSetupRoutesReachable(def, hand)',
    'questSetupRoutesReachable(def, hand) || questSetupCompletable(def, hand) || kind.validateInstance(hand, def.setup, def)'],
  ["independent witnesses agree with the search on the hand that exposed it",
    'if(isRising(seq))   contourFamilies.push("rise");', 'if(false) contourFamilies.push("rise");'],

  // ---- Surviving availability, purity and closed-grammar guarantees (A7) ----
  // These used to mutate the model's own copy of "gates open and nothing missing". That copy is gone:
  // the button now reads questPhaseGate, the same function the door is handed, so the readiness and
  // gate halves are mutated where they actually live. Both surfaces move together or the sweep fails.
  ...[
    ['if(p.type!=="compare-offer" && questReadinessMissing(def, run, versionId).length) return false;',
     'if(false) return false;'],
    ['if(p.type!=="compare-offer" && questReadinessMissing(def, run, versionId).length) return false;',
     'if(p.type!=="compare-offer" && !questReadinessMissing(def, run, versionId).length) return false;'],
    ['      if(g.gate(run, versionId)!==true) return false; }', '      if(false) return false; }'],
    ['const can=!!(proc && proc.canAdvance) && !unsaved;', 'const can=!!proc && !unsaved;'],
    ['const can=!!(proc && proc.canAdvance) && !unsaved;', 'const can=false;'],
  ].map(([from, to]) => ["readiness and declared gate sweeps agree between evaluator model and controller gate", from, to]),
  ...[
    [evidenceLoop, evidenceLoop.replace('Object.keys(run.versions)', '[run.draft]')],
    [evidenceLoop, evidenceLoop.replace('Object.keys(run.versions)', '["A", "B"]')],
    [evidenceLoop, evidenceLoop.replace('run.versions[id].song', 'run.versions.A.song')],
    [evidenceLoop, evidenceLoop.replace('run.versions[id].song', 'currentSong()')],
    ['function questEvaluateRun(run, def){', 'function questEvaluateRun(run, def){ run.evaluationProbe=true;'],
  ].map(([from, to]) => ["questEvaluateRun builds all version evidence and stays detached and pure", from, to]),
  ["confirmation is not an authorable procedural gate",
    '"playback.complete-since-last-edit":{ kind:"procedural",',
    '"confirmation.required":{ kind:"procedural", gate:()=>true }, "playback.complete-since-last-edit":{ kind:"procedural",'],
  ["comparison offer availability follows its gates across all readiness combinations",
    'canOffer:  p.type==="compare-offer" && gatesOpen,',
    'canOffer:  p.type==="compare-offer" && gatesOpen && questReadinessMissing(def, run, current).length===0,'],

  // ---- Step E commit 5: one pick hears and holds; only receipts compare ----
  ...[
    ['selection:op.versionId, draft:op.versionId', 'selection:op.versionId, draft:run.draft'],
    ['selection:op.versionId, draft:op.versionId', 'selection:run.selection, draft:op.versionId'],
    ['applySong(QUEST_RUNS[runId].versions[o.versionId].song)', 'applySong(QUEST_RUNS[runId].versions.B.song)'],
    ['start({ versionId:o.versionId, purpose:"audition" });', ';'],
    ['start({ versionId:o.versionId, purpose:"audition" });', 'start({ versionId:o.versionId, purpose:"play" });'],
    ['start({ versionId:o.versionId, purpose:"audition" });', 'start({ versionId:"B", purpose:"audition" });'],
    ['const was=run.draft;\n    if(playing) stop();', 'const was=run.draft;'],
  ].map(([from,to])=>["pick stops the old session and binds the visible held path to its revision",from,to]),
  ...[
    ['if(op.type==="selectDraft"){', 'if(op.type==="selectDraft"){ if(!run.comparison) return no("not-compared");'],
    ['if(op.type==="selectDraft"){\n    if(!active) return no("not-active");', 'if(op.type==="selectDraft"){'],
    ['if(op.type==="selectDraft"){\n    if(!active) return no("not-active");\n    if(!V(op.versionId)) return no("no-version");',
      'if(op.type==="selectDraft"){\n    if(!active) return no("not-active");'],
    ['selection:op.versionId, draft:op.versionId', 'selection:(run.selection=op.versionId), draft:op.versionId'],
    ['if(op.type==="selectDraft"){', 'if(op.type==="selectDraft" || op.type==="choose"){'],
  ].map(([from,to])=>["selectDraft is pure and needs an active existing version but no comparison",from,to]),
  ...["audition","choose","compare"].map(id=>[
    "removed actions cannot select play or compare behind the new controls",
    'if(actionId==="pick"){', `if(actionId==="pick" || actionId==="${id}"){`,
  ]),
  ...[
    ['if(!r.ok) return r;                                   // a refused write leaves the field as it was',
      'if(!r.ok) { applySong(run.versions[o.versionId].song); return r; }'],
    ['if(!r.ok) return r;                                   // a refused write leaves the field as it was',
      'if(!r.ok) { journalClear(); return r; }'],
    ['if(!r.ok) return r;                                   // a refused write leaves the field as it was',
      'if(!r.ok) { start({versionId:o.versionId,purpose:"audition"}); return r; }'],
  ].map(([from,to])=>["failed selectDraft leaves the field run storage and undo target untouched",from,to]),
  ["switching paths clears both undo and redo from the previous version",
    "journalClear();                                     // the other path's history is not this one's", ";"],
  // re-tapping the held path must not reload it: applySong rebuilds every note id, so tx() journals a
  // musically invisible entry that eats the child's undo
  ["one undo after re-tapping the held path takes back the last musical edit",
    'if(was!==o.versionId){', 'if(true){'],
  ["painting a pick never increments editRev even through palette clearing",
    'const wasPainting=questPainting; questPainting=true;', 'const wasPainting=questPainting;'],
  ...[
    ['if(p && p.type==="compare-offer")\n      transactQuestRun(runId, [{ type:"compare",',
      'if(false)\n      transactQuestRun(runId, [{ type:"compare",'],
    ['if(p && p.type==="compare-offer")\n      transactQuestRun(runId, [{ type:"compare",',
      'if(p && p.type==="compare-offer" && !run.comparison)\n      transactQuestRun(runId, [{ type:"compare",'],
    ['if(fx.purpose==="audition") ops.push', 'if(false) ops.push'],
  ].map(([from,to])=>["receipts refresh comparison after editing either held path and stale receipts cannot help",from,to]),
  ...[
    ['const saved=QUEST_RUNS[runId];', 'const saved=run;'],
    ['if(!questPhaseGate(def, run.phase, run.selection)(run)) return fail("gate-closed");', ';'],
    ['if(c.versionIds.indexOf(run.selection)<0) return false;', ';'],
  ].map(([from,to])=>["offer needs both current auditions and a selection and returns the saved artifact id",from,to]),
  // a finished quest keeps no path toggles: nothing left to tap
  ["offer needs both current auditions and a selection and returns the saved artifact id",
    'const paths = (p.type==="compare-offer" && !finished && !stuck)', 'const paths = (p.type==="compare-offer")'],
  ...[
    ['if(actionId==="pick"){', 'if(actionId==="pick" && run.questId==="firefly-crossing"){'],
    ['p.versionIds.map(id=>({ versionId:id, label:label(id),', '["A","B"].map(id=>({ versionId:id, label:label(id),'],
    ['reflectionPrompt: p.reflection ? p.reflection.promptText : ""', 'reflectionPrompt: ""'],
    ['versionId:id, label:label(id),', 'versionId:id, label:id,'],
    ['selected:run.selection===id, heard:auditioned(id)', 'selected:run.draft!==id, heard:auditioned(id)'],
    ['selected:run.selection===id, heard:auditioned(id)', 'selected:run.selection===id, heard:false'],
    ['paths,\n    // Validated by the catalog', 'paths:[],\n    // Validated by the catalog'],
  ].map(([from,to])=>["pick and shell use authored ids labels and reflection without consulting live evidence",from,to]),
  ["a stale audition stops counting as heard",
    'return !!x && x.auditionedRev===x.editRev;', 'return !!x && x.auditionedRev!==null;'],
  ...[
    ['function choiceUp(){ return !!choiceOpts; }', 'function choiceUp(){ return document.getElementById("choiceRow").style.display!=="none"; }'],
    ['function choiceUp(){ return !!choiceOpts; }', 'function choiceUp(){ return false; }'],
  ].map(([from,to])=>["Grow and Trim use lesson picker state while quest paths remain editable",from,to]),
  ["a field click during a pick edits the held path immediately",
    'function cellClick(r,c,el){', 'function cellClick(r,c,el){ if(isQuestScope()) return;'],
  ["a drum click during a pick edits the held path immediately",
    'function drumClick(d,c){', 'function drumClick(d,c){ if(isQuestScope()) return;'],
  ...[
    ['function undoEdit(){', 'function undoEdit(){ if(isQuestScope()) return;'],
    ['function redoEdit(){', 'function redoEdit(){ if(isQuestScope()) return;'],
    ['if(questPainting) return;', 'if(questPainting || (isQuestScope() && QUEST_RUNS[activeScope.runId].phase===2)) return;'],
  ].map(([from,to])=>["undo and redo during a pick restore the held version and leave its sibling alone",from,to]),
];

mutations.push(...fragmentMutations);
mutations.push(...e6Mutations);
mutations.push(...playtestMutations);
mutations.push(...gMutations);
mutations.push(...hMutations);
const green = new Set();
// A focused rerun is useful while developing new faults; the default always runs the full audit.
for(const arg of process.argv.slice(2))
  assert.ok(["--e6-only", "--playtest-only", "--fragments-only", "--g-only", "--h-only"].includes(arg), "unknown audit selector: " + arg);
const selectedMutations = process.argv.includes("--h-only") ? hMutations
  : process.argv.includes("--g-only") ? gMutations
  : process.argv.includes("--fragments-only") ? fragmentMutations
  : process.argv.includes("--e6-only") ? e6Mutations
  : process.argv.includes("--playtest-only") ? playtestMutations : mutations;
// Catch stale anchors before spending minutes running the full sweep.
for(const [,from,to] of selectedMutations){
  assert.strictEqual(countAcross(scripts,from),1,"unique mutation anchor: "+from);
  checkSyntax(applyPatches(scripts,[[from,to]]));
}
for (const [title, from, to] of selectedMutations) {
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
console.log(`${selectedMutations.length} mutations caught across ${green.size} green tests. No source files changed.`);
