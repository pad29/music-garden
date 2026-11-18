// TUN-105: run the actual existing tests with in-memory source mutations. No guide/game file writes.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { loadGame } from "./harness.mjs";
import { ROOT, findLiteral, readEmbedded, canonicalText } from "../tools/quest-catalog.mjs";

const CHILD = `
import fs from 'node:fs';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
const config = JSON.parse(fs.readFileSync(0, 'utf8'));
registerHooks({load(url, context, next) {
  const result = next(url, context);
  if (url.endsWith('/tests/helpers/game-scripts.mjs') && config.source) {
    const src = String(result.source), needle = 'return { html, scripts, vendored };';
    if (src.split(needle).length !== 2) throw Error('script reader hook anchor changed');
    return {...result, source:src.replace(needle, () => 'return {html, scripts:applyPatches(scripts, ' + JSON.stringify(config.source) + '), vendored};')};
  }
  if (url.endsWith('/tests/harness.mjs')) {
    const src = String(result.source), needle = 'const scripts = loaded;';
    if (src.split(needle).length !== 2) throw Error('audit hook anchor changed');
    return {...result, source:src.replace(needle, () => 'const scripts = applyPatches(loaded, ' + JSON.stringify(config.game || []) + ');')};
  }
  if (url.endsWith('/tests/quest-guide.test.mjs')) {
    let src = String(result.source);
    const needle = 'const g = loadGame();';
    if (src.split(needle).length !== 2) throw Error('guide hook anchor changed');
    src = src.replace('const GUIDE =', 'let GUIDE =');
    const edits = 'for (const [from,to] of ' + JSON.stringify(config.guide || []) + ') { if(GUIDE.split(from).length !== 2) throw Error("guide mutation anchor changed"); GUIDE = GUIDE.replace(from, () => to); }';
    return {...result, source:src.replace(needle, () => edits + '\\n' + needle)};
  }
  return result;
}});
// An initialization failure is an invalid experiment, not a caught behavioral mutation.
const {loadGame} = await import(pathToFileURL(config.harness));
const g = loadGame({fresh:true});
if(g.QUEST_CATALOG_ERRORS.length) throw Error('mutant catalog rejected: ' + JSON.stringify(g.QUEST_CATALOG_ERRORS));
if(config.probe && !g.QUEST_DEFINITIONS[config.probe]) throw Error('third quest was not installed');
await import(pathToFileURL(config.file));
`;

function audit(file, name, config = {}) {
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  const out = spawnSync(process.execPath, ["--test-reporter=tap", "--test-name-pattern=" + name,
    "--input-type=module", "--eval", CHILD], {
    cwd: ROOT, env, encoding: "utf8", timeout: 60000, maxBuffer: 2 * 1024 * 1024,
    input: JSON.stringify({ ...config, file: path.join(ROOT, "tests", file), harness: path.join(ROOT, "tests/harness.mjs") }),
  });
  assert.ifError(out.error); assert.equal(out.signal, null);
  const output = out.stdout + out.stderr;
  assert.doesNotMatch(output, /SyntaxError|ReferenceError|TypeError|anchor changed|mutant catalog rejected|third quest was not installed/);
  assert.match(output, /# tests [1-9]/, output);
  return { status: out.status, output };
}
const fieldTest = "the field tables name every field";
const guide = fs.readFileSync(path.join(ROOT, "MAKING-QUESTS.md"), "utf8").replace(/\r\n/g, "\n");
const widthRow = guide.split("\n").find(l => l.startsWith('| `$.workspace.columns` |'));

for (const [label, replacement] of [
  ["a field moved to the wrong root", widthRow.replace("$.workspace.columns", "setup.columns")],
  ["a changed numeric bound", widthRow.replace("16–64", "16–65")],
  ["a field moved outside the checked markers", ""],
]) test(`guide guard catches ${label}`, () => {
  // MUTATION: accept an unqualified field name, ignore bounds, or search outside the marked section.
  const edits = [[widthRow, replacement]];
  if (!replacement) edits.push(["<!-- /fields -->", "<!-- /fields -->\n" + widthRow]);
  const out = audit("quest-guide.test.mjs", fieldTest, { guide: edits });
  assert.equal(out.status, 1, out.output); assert.match(out.output, /ERR_ASSERTION/);
});

test("guide guard accepts the same field rows in a different order", () => {
  // MUTATION: pin line order instead of the documented field paths.
  const rows = guide.split("\n");
  const i = rows.indexOf(widthRow), next = rows[i + 1];
  const out = audit("quest-guide.test.mjs", fieldTest, { guide: [[widthRow + "\n" + next, next + "\n" + widthRow]] });
  assert.equal(out.status, 0, out.output);
});

test("guide guard rejects a contradictory duplicate field instead of silently keeping the last row", () => {
  // MUTATION: allow a false row to be hidden by a later correct row for the same path.
  const out = audit("quest-guide.test.mjs", fieldTest, {
    guide: [[widthRow, widthRow.replace("16–64", "1–999") + "\n" + widthRow]],
  });
  assert.equal(out.status, 1, "contradictory width rows must fail the drift guard");
});

test("guide guard rejects an extra unregistered analyzer parameter value", () => {
  // MUTATION: document a nonexistent contour family alongside all the real ones.
  const out = audit("quest-guide.test.mjs", "musical analyzers, with the metadata", {
    guide: [['1–4 of `rise`, `fall`, `hover`, `arc`', '1–4 of `rise`, `fall`, `hover`, `arc`, `spiral`']],
  });
  assert.equal(out.status, 1, "an unregistered family must fail the drift guard");
});

test("guide error guard rejects a code that occurs only in a source comment", () => {
  // MUTATION: an uncallable example in a comment masquerades as an emitted loader error.
  const out = audit("quest-guide.test.mjs", "every error code the guide explains", {
    guide: [["<!-- /error-codes -->", '| `never-emitted-review-code` | invented | impossible |\n<!-- /error-codes -->']],
    source: [['function questSemantics(def, errs){', '/* err("never-emitted-review-code", "$", "example only"); */\nfunction questSemantics(def, errs){']],
  });
  assert.equal(out.status, 1, "comment-only codes must fail the drift guard");
});

// Two extra definitions with different geometry/pools, plus a no-opening definition. No installation.
const engine = fs.readFileSync(path.join(ROOT, "js/quest-engine.js"), "utf8").replace(/\r\n/g, "\n");
const cat = JSON.parse(readEmbedded(engine));
const woods = cat.definitions.find(d => d.id === "waking-woods");
const third = structuredClone(woods);
third.id = "aa-contributor-probe";
third.presentation.priority = 0;
third.setup = { ...third.setup, count: 2, minGap: 3, edgeMargin: 3,
  fragments: [[{ lane: 1, c: 0 }, { lane: 1, c: 3 }], [{ lane: 2, c: 1 }, { lane: 1, c: 3 }]] };
const noOpening = structuredClone(third);
noOpening.id = "zz-contributor-no-opening"; delete noOpening.setup.fragments;
cat.definitions.unshift(third); cat.definitions.push(noOpening);
const at = findLiteral(engine);
const install = [engine.slice(at.start, at.end), JSON.stringify(canonicalText(cat))];
const withThird = game => ({ game: [install, ...game], probe: third.id });
const dealerTest = "shipped deals are repeatable, varied, versioned and valid";
const routesTest = "every shipped route has ready playable songs preserving every opening";

test("the existing dealer sweep detects a fault confined to a third quest's generated geometry", () => {
  // MUTATION: generate an invalid hand only for a non-official id; an official-only loop misses it.
  assert.equal(audit("questsetup.test.mjs", dealerTest, withThird([])).status, 0);
  const out = audit("questsetup.test.mjs", dealerTest, withThird([
    ['generate(rule, def, rng){', 'generate(rule, def, rng){ if(def.id === "aa-contributor-probe") return {kind:"waypoints",generatorVersion:2,waypoints:[]};'],
  ]));
  assert.equal(out.status, 1, out.output); assert.match(out.output, /wrong-count/);
});

test("the existing dealer sweep detects reusing the official fragment pool only for a third quest", () => {
  // MUTATION: substitute an official opening while leaving official quests' draws untouched.
  assert.equal(audit("questsetup.test.mjs", dealerTest, withThird([])).status, 0);
  const out = audit("questsetup.test.mjs", dealerTest, withThird([
    ['inst.fragment={ index:i, hits:rule.fragments[i].map(h=>({ lane:h.lane, c:h.c })) };',
     'inst.fragment={ index:i, hits:(def.id === "aa-contributor-probe" ? [{lane:0,c:0},{lane:1,c:2}] : rule.fragments[i]).map(h=>({lane:h.lane,c:h.c})) };'],
  ]));
  assert.equal(out.status, 1, out.output); assert.match(out.output, /fragment-mismatch/);
});

test("the existing route sweep detects a probe that drops the third quest's own opening", () => {
  // MUTATION: omit a fragment the official pools never contain. The renamed copy still owns its pool.
  assert.equal(audit("quest-fragments.test.mjs", routesTest, withThird([])).status, 0);
  const out = audit("quest-fragments.test.mjs", routesTest, withThird([
    ['function questFragmentProbes(def, frag){',
     'function questFragmentProbes(def, frag){ if(def.id === "renamed-playable" && frag.length === 2 && frag[0].lane === 1 && frag[0].c === 0) frag=[];'],
  ]));
  assert.equal(out.status, 1, out.output); assert.match(out.output, /fragment-gone/);
});

test("Home and authoring fixtures stay green with a new first catalog entry and a higher priority", () => {
  // MUTATION: tests select catalog index zero or let an added quest change the two-quest fixture.
  for (const file of ["questhome.test.mjs", "questauthoring.test.mjs"] ) {
    const out = audit(file, ".*", withThird([]));
    assert.equal(out.status, 0, out.output);
  }
});

test("an empty Home and trail can mean locked prerequisites with a completely healthy catalog", () => {
  // MUTATION: advertise locked quests, or conflate an empty visible list with catalog failure (§8).
  const g = loadGame({ fresh: true });
  assert.deepEqual(Array.from(g.QUEST_CATALOG_ERRORS), []);
  assert.ok(Object.keys(g.QUEST_DEFINITIONS).length >= 2);
  assert.equal(g.questHomeCard(g.QUEST_DEFINITIONS, { packages: {} }, {}, {}), null);
  assert.deepEqual(Array.from(g.questTrailModel(g.QUEST_DEFINITIONS, { packages: {} }, {}, {})), []);
});

// ---- from GPT's PR review (round 1) ----

// A valid quest whose melody clause counts notes: Woods with `phrase.minimum-onsets`, and witnesses
// thickened below each column's top note (same contour, same beats) until they have enough.
const LADDER = [81, 79, 76, 74, 72, 69, 67, 64, 62, 60];
const thicken = song => { const s = structuredClone(song), notes = s.tracks[0].notes, tops = new Map();
  for (const n of notes) { const r = LADDER.indexOf(n.p); if (!tops.has(n.c) || r < tops.get(n.c)) tops.set(n.c, r); }
  for (const [c, r0] of tops) for (let r = r0 + 1; r < LADDER.length; r++)
    if (!notes.some(n => n.c === c && n.p === LADDER[r])) notes.push({ p: LADDER[r], c, len: 1 });
  return s; };
const counter = structuredClone(woods);
counter.id = "counted-notes-probe";
for (const p of counter.phases) for (const r of p.challenge?.routes || [])
  r.observations[0] = { analyzerId: "phrase.minimum-onsets", params: { minimum: 0 }, descriptorId: "way-enough-notes" };
for (const w of counter.witnesses) for (const v of Object.keys(w.songs)) w.songs[v] = thicken(w.songs[v]);
// The highest floor every thickened witness clears — well above what a sparse completion reaches.
const floor = Math.min(...counter.witnesses.flatMap(w => Object.values(w.songs).map(s => s.tracks[0].notes.length)));
for (const p of counter.phases) for (const r of p.challenge?.routes || []) r.observations[0].params.minimum = floor;
const countedCat = structuredClone(JSON.parse(readEmbedded(engine))); countedCat.definitions.push(counter);
const withCounted = { game: [[engine.slice(at.start, at.end), JSON.stringify(canonicalText(countedCat))]], probe: counter.id };

test("the route sweep accepts a valid quest whose melody clause counts notes", () => {
  // MUTATION: build candidates only from the official quests' predicates (contour and on-beat songs),
  // so a quest asking `phrase.minimum-onsets` above a sparse completion's count is wrongly refused.
  assert.ok(floor >= 16, `the floor (${floor}) must exceed a sparse completion's notes`);
  const out = audit("quest-fragments.test.mjs", routesTest, withCounted);
  assert.equal(out.status, 0, out.output);
});

const minimumRow = '`{"minimum": N}`, N 1–64';
for (const [label, testName, config] of [
  ["a widened parameter range", "musical analyzers, with the metadata",
    { guide: [[minimumRow, minimumRow.replace("1–64", "1–640")]] }],
  ["a challenge field the engine made optional", fieldTest,
    { game: [["witnessIds:QT.arr(QT.slug(),1,8,true) }),2,4) });", "witnessIds:QT.arr(QT.slug(),1,8,true) }),2,4) }, [\"routes\"]);"]] }],
  ["a code that appears only after a value, in a line comment", "every error code the guide explains",
    { guide: [["<!-- /error-codes -->", "| `never-emitted-review-code` | invented | impossible |\n<!-- /error-codes -->"]],
      source: [["function questSemantics(def, errs){", '0//err("never-emitted-review-code", "$");\nfunction questSemantics(def, errs){']] }],
]) test(`guide guard catches ${label}`, () => {
  // MUTATION: substring range checks, hard-coded requiredness, or a comment regex that misses `0//`.
  const out = audit("quest-guide.test.mjs", testName, config);
  assert.equal(out.status, 1, out.output); assert.match(out.output, /ERR_ASSERTION/);
});
