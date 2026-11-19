// MAKING-QUESTS.md against the engine. The guide's field tables, closed lists and worked examples are
// facts about the code; these tests fail when the code moves and the guide does not. They check the
// marked sections only — <!-- fields -->, <!-- registry:NAME -->, <!-- example:NAME -->,
// <!-- error-codes --> — never prose, order of sections or wording. Clarity is the owner's to judge.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { loadGame } from "./harness.mjs";
import { gameScripts, joinScripts } from "./helpers/game-scripts.mjs";
import { questFields } from "./helpers/quest-guide-fields.mjs";

const ROOT = path.join(import.meta.dirname, "..");
const GUIDE = fs.readFileSync(path.join(ROOT, "MAKING-QUESTS.md"), "utf8").replace(/\r\n/g, "\n");
const g = loadGame();
const plain = x => JSON.parse(JSON.stringify(x));          // out of the game's realm, for deepEqual
const ticks = cell => [...cell.matchAll(/`([^`]+)`/g)].map(m => m[1]);
const sorted = xs => [...xs].sort();

function section(open, close) {
  const parts = GUIDE.split(open);
  assert.equal(parts.length, 2, `exactly one ${open} in MAKING-QUESTS.md`);
  const end = parts[1].indexOf(close);
  assert.ok(end >= 0, `${open} is closed by ${close}`);
  return parts[1].slice(0, end);
}
// Table rows of a marked section whose first cell is backticked; cells trimmed.
const rows = text => text.split("\n").filter(l => /^\|\s*`/.test(l))
  .map(l => l.split("|").slice(1, -1).map(c => c.trim()));
// JavaScript source without its comments. Strings ('', "", ``) and regex literals are copied whole, so a
// "//" inside "https://" or /\/\// is not taken for a comment. A "/" starts a regex where an operand is
// expected — after an operator or bracket, or at the start — and is division after a value.
function stripComments(src) {
  let out = "", i = 0, prev = "";
  const copyQuoted = q => { let j = i + 1; while (j < src.length && src[j] !== q) j += src[j] === "\\" ? 2 : 1; out += src.slice(i, j + 1); i = j + 1; };
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (c === '"' || c === "'" || c === "`") { copyQuoted(c); prev = "a"; continue; }
    // A postfix ++ or -- leaves a value behind: "x++ / 2" is division (round 2 of the PR review).
    if ((c === "+" || c === "-") && d === c && prev === "a") { out += c + d; i += 2; continue; }
    if (c === "/" && d === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (c === "/" && d === "*") { const e = src.indexOf("*/", i + 2); i = e < 0 ? src.length : e + 2; out += " "; continue; }
    if (c === "/" && (prev === "" || /[(,=:[!&|?{};+\-*%<>~^]/.test(prev))) {
      let j = i + 1, cls = false;
      while (j < src.length && src[j] !== "\n" && (cls || src[j] !== "/")) { if (src[j] === "\\") j++; else if (src[j] === "[") cls = true; else if (src[j] === "]") cls = false; j++; }
      out += src.slice(i, j + 1); i = j + 1; prev = "a"; continue;
    }
    out += c; i++;
    if (!/\s/.test(c)) prev = /[\w$)\]]/.test(c) ? "a" : c;
  }
  return out;
}
const registry = name =>rows(section(`<!-- registry:${name} -->`, "<!-- /registry -->"));
const ids = name => registry(name).map(r => ticks(r[0])[0]);
const example = name => {
  const body = section(`<!-- example:${name} -->`, "<!-- /example -->");
  const m = body.match(/^\n```json\n([\s\S]*)\n```\n$/);
  assert.ok(m, `example:${name} is exactly one json block`);
  return JSON.parse(m[1]);
};

test("the field tables name every field of the newest schema, with its type and whether it is required", () => {
  // MUTATIONS: a field added to or removed from QT, a bound changed, optional made required.
  const want = questFields(g);
  const documented = rows(section("<!-- fields -->", "<!-- /fields -->")).map(r => ticks(r[0])[0]);
  // A second row for a path could hide a wrong first one; each field is documented once (GPT's tester).
  assert.deepEqual(documented.filter((p, i) => documented.indexOf(p) !== i), [], "duplicate field rows");
  const got = new Map(rows(section("<!-- fields -->", "<!-- /fields -->")).map(r => [ticks(r[0])[0], { type: r[1], required: r[2] === "required" }]));
  for (const r of rows(section("<!-- fields -->", "<!-- /fields -->")))
    assert.ok(r[2] === "required" || r[2] === "optional", `${r[0]}: "${r[2]}"`);
  assert.deepEqual(sorted(got.keys()), sorted(want.keys()), "the same paths");
  for (const [p, spec] of want) assert.deepEqual(got.get(p), spec, p);
  assert.ok(want.size > 80, "the walk must reach the nested blocks");
});

test("the worked example is The Waking Woods as it ships, with only the witness songs left out", () => {
  const woods = plain(g.QUEST_DEFINITIONS["waking-woods"]);
  for (const w of woods.witnesses) w.songs = "…";
  assert.deepEqual(example("waking-woods"), woods);
});

test("the full witness examples are shipped witnesses, verbatim — one compose, one transform", () => {
  const woods = g.QUEST_DEFINITIONS["waking-woods"];
  const phaseType = id => woods.phases.find(p => p.id === id).type;
  for (const [name, type] of [["witness", "compose"], ["witness-transform", "transform"]]) {
    const shown = example(name);
    assert.deepEqual(shown, plain(woods.witnesses.find(w => w.id === shown.id)), name);
    assert.equal(phaseType(shown.phaseId), type, name);
  }
});

test("capabilities, and the package that earns each", () => {
  assert.deepEqual(sorted(ids("capabilities")), sorted(Object.keys(g.QUEST_CAPABILITIES)));
  for (const r of registry("capabilities"))
    assert.deepEqual(sorted(ticks(r[1])), sorted(g.QUEST_CAPABILITIES[ticks(r[0])[0]].earnedByPackageIds), r[0]);
});

test("musical analyzers, with the metadata the validator checks", () => {
  // MUTATIONS: an analyzer added, a phase type, control, teaching package or descriptor changed.
  const musical = Object.keys(g.QUEST_PRIMITIVES).filter(id => g.QUEST_PRIMITIVES[id].kind === "musical");
  assert.deepEqual(sorted(ids("analyzers")), sorted(musical));
  for (const [idCell, cap, phases, needs, taught, desc, params] of registry("analyzers")) {
    const p = g.QUEST_PRIMITIVES[ticks(idCell)[0]], at = idCell;
    assert.deepEqual(ticks(cap), [p.capabilityId], at);
    assert.deepEqual(sorted(ticks(phases)), sorted(p.allowedPhaseTypes), at);
    assert.deepEqual(sorted(ticks(needs)), sorted(p.requiredControlIds || []), at);
    assert.deepEqual(sorted(ticks(taught)), sorted(p.taughtByPackageIds || []), at);
    assert.deepEqual(ticks(desc), [...p.allowedDescriptorIds], at);
    const s = p.parameterSchema;
    // Every range the cell states, exactly — "1–640" must not pass for 1–64 (GPT's PR review).
    const ranges = [...params.matchAll(/(\d+)–(\d+)/g)].map(m => `${m[1]}–${m[2]}`);
    if (s.k === "none") assert.deepEqual(ticks(params), ["{}"], at);
    else if (s.k === "snapshot") assert.ok(params.includes('"snapshotVersionId": "A"'), at);
    else if (s.k === "enum-set") {
      assert.ok(params.includes(`"${s.field}"`), at);
      assert.deepEqual(ranges, [`${s.min}–${s.max}`], at);
      assert.deepEqual(sorted(ticks(params).filter(x => !x.startsWith("{"))), sorted(s.values), at);
    } else if (s.k === "minimum") {
      assert.ok(params.includes(`"${s.field}"`), at);
      assert.deepEqual(ranges, [`${s.min}–${s.max}`], at);
    } else assert.fail(`${at}: a parameter schema the guide does not describe: ${s.k}`);
  }
});

test("analyzer relations: every declared pair, and nothing else", () => {
  const got = registry("relations").map(r => [ticks(r[0]).join("|"), r[1]]);
  const want = Object.keys(g.QUEST_CROSS_RELATIONS).map(k => [k, g.QUEST_CROSS_RELATIONS[k]]);
  assert.deepEqual(sorted(got.map(x => x.join(" "))), sorted(want.map(x => x.join(" "))));
});

test("procedural gates, way descriptors and their words", () => {
  const procedural = Object.keys(g.QUEST_PRIMITIVES).filter(id => g.QUEST_PRIMITIVES[id].kind === "procedural");
  assert.deepEqual(sorted(ids("gates")), sorted(procedural));
  const ways = Object.keys(g.QUEST_DESCRIPTORS).filter(id => g.QUEST_DESCRIPTORS[id].kind === "way");
  assert.deepEqual(sorted(ids("descriptors")), sorted(ways));
  for (const r of registry("descriptors")) assert.equal(r[1], g.QUEST_DESCRIPTORS[ticks(r[0])[0]].text, r[0]);
});

test("controls, tools, transitions, completion actions, payoffs, grooves, setup kinds and themes", () => {
  for (const [name, reg] of [["controls", g.QUEST_CONTROLS], ["tools", g.QUEST_TOOLS],
    ["transitions", g.QUEST_TRANSITIONS], ["completion-actions", g.QUEST_COMPLETION_ACTIONS],
    ["payoffs", g.QUEST_PAYOFFS], ["grooves", g.QUEST_GROOVES], ["setup-kinds", g.QUEST_SETUP_KINDS],
    ["themes", g.QUEST_THEMES]])
    assert.deepEqual(sorted(ids(name)), sorted(Object.keys(reg)), name);
  for (const r of registry("transitions")) assert.equal(ticks(r[1])[0], g.QUEST_TRANSITIONS[ticks(r[0])[0]].phaseType, r[0]);
  for (const r of registry("completion-actions")) assert.equal(ticks(r[1])[0], g.QUEST_COMPLETION_ACTIONS[ticks(r[0])[0]].transitionId, r[0]);
  for (const r of registry("themes")) assert.equal(r[1], g.QUEST_THEMES[ticks(r[0])[0]].icon, r[0]);
});

test("lands, and which have a friend who can be cast", () => {
  assert.deepEqual(ids("map-regions"), plain(g.REGION_MAP.map(r => r.id)));
  for (const r of registry("map-regions")) {
    const reg = g.REGIONS[ticks(r[0])[0]];
    assert.equal(r[1], reg && reg.friend ? reg.friend.name : "—", r[0]);
  }
});

test("the pentatonic ladder the guide quotes is the palette's", () => {
  const m = GUIDE.match(/`pentatonic` is `(\[[\d, ]+\])`/);
  assert.ok(m, "the guide quotes the pentatonic ladder");
  assert.deepEqual(JSON.parse(m[1]), plain(g.PALETTES.pentatonic.MIDI));
});

test("every error code the guide explains is one the loader can report", () => {
  // The universe is read from the engine's own sources: every code literal handed to an error path.
  // Comments removed first: an example in a comment is not a code the loader can report (GPT's tester
  // and PR review — a regex missed `0//err(…)`, so this scans, skipping strings and regex literals).
  const src = stripComments(joinScripts(gameScripts(ROOT).scripts));
  const emitted = new Set([...src.matchAll(/\b(?:err|bad|no|QuestLoadError)\(\s*"([a-z][a-z0-9-]*)"/g)].map(m => m[1])
    .concat([...src.matchAll(/\bcode:\s*"([a-z][a-z0-9-]*)"/g)].map(m => m[1]))
    .concat([...src.matchAll(/errs\.push\(\{\s*code:\s*"([a-z][a-z0-9-]*)"/g)].map(m => m[1])));
  const documented = rows(section("<!-- error-codes -->", "<!-- /error-codes -->")).flatMap(r => ticks(r[0]));
  assert.ok(documented.length > 30);
  for (const code of documented) assert.ok(emitted.has(code), code);
});

test("the comment scanner removes comments and nothing else", () => {
  // MUTATION: treat "//" inside a string or regex as a comment, or miss a comment right after a value.
  const cases = [
    ['a = 1; // err("x")', "a = 1; "],
    ['0//err("never-emitted")', "0"],
    ['u = "https://x"; // c', 'u = "https://x"; '],
    ["t = `a // b`;", "t = `a // b`;"],
    [String.raw`ok = /\/\//.test(s); // c`, String.raw`ok = /\/\//.test(s); `],
    ["r = /[/]x/i;", "r = /[/]x/i;"],
    ["q = a / b / c;", "q = a / b / c;"],
    ["x = 1 /* err(\"y\") */ + 2;", "x = 1   + 2;"],
    ['s = "say \\"//\\" ok";', 's = "say \\"//\\" ok";'],
  ];
  for (const [input, want] of cases) assert.equal(stripComments(input), want, input);
});

test("the comment scanner treats a slash after a postfix increment as division", () => {
  // MUTATION: take "x++ /" for the start of a regex, so a comment after it survives.
  assert.equal(stripComments('let x=1; x++ / 2; //err("not-emitted")'), "let x=1; x++ / 2; ");
  assert.equal(stripComments("y-- / 3; // c"), "y-- / 3; ");
  assert.equal(stripComments("z = a + /re/.source; // c"), "z = a + /re/.source; ");
});
