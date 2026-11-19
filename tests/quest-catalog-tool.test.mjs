// tools/quest-catalog.mjs — the contributor's way into the built-in quest catalog (MAKING-QUESTS.md).
// Every write here goes to a temporary copy of index.html + js/, never to the checkout's own engine file.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ROOT, ENGINE_REL, ANCHOR, extract, check, write, evidence, findLiteral, spliceCatalog, readEmbedded,
  canonicalText } from "../tools/quest-catalog.mjs";

function tempRoot(t, { lf = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quest-catalog-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.copyFileSync(path.join(ROOT, "index.html"), path.join(dir, "index.html"));
  fs.cpSync(path.join(ROOT, "js"), path.join(dir, "js"), { recursive: true });
  const engine = path.join(dir, ENGINE_REL);
  // The checkout may be CRLF (Windows) or LF; each test states which it wants rather than inheriting it.
  const text = fs.readFileSync(engine, "utf8").replace(/\r\n/g, "\n");
  fs.writeFileSync(engine, lf ? text : text.replace(/\n/g, "\r\n"));
  return { dir, engine, json: path.join(dir, "catalog.json") };
}
const readCat = file => JSON.parse(fs.readFileSync(file, "utf8"));
const writeCat = (file, cat, compact = false) => fs.writeFileSync(file, compact ? JSON.stringify(cat) : canonicalText(cat));
const outsideLiteral = text => { const at = findLiteral(text); return text.slice(0, at.start) + text.slice(at.end); };

test("extract then write leaves the engine file byte-identical", t => {
  const r = tempRoot(t), before = fs.readFileSync(r.engine);
  const shipped = JSON.parse(readEmbedded(fs.readFileSync(r.engine, "utf8"))).definitions.length;
  assert.ok(shipped >= 2);
  assert.equal(extract(r.json, { root: r.dir }).count, shipped);
  assert.equal(readCat(r.json).definitions.length, shipped);
  const out = write(r.json, { root: r.dir });
  assert.equal(out.ok, true); assert.equal(out.written, false); assert.equal(out.unchanged, true);
  assert.deepEqual(fs.readFileSync(r.engine), before);
});

test("the shipped literal is exactly the canonical encoding the tool writes", () => {
  const engine = fs.readFileSync(path.join(ROOT, ENGINE_REL), "utf8");
  const text = readEmbedded(engine);
  assert.equal(canonicalText(JSON.parse(text)), text);
  assert.equal(spliceCatalog(engine, text), engine);
});

for (const lf of [false, true]) test(`a valid change replaces the literal and no other byte (${lf ? "LF" : "CRLF"})`, t => {
  const r = tempRoot(t, { lf }), before = fs.readFileSync(r.engine, "utf8");
  extract(r.json, { root: r.dir });
  const cat = readCat(r.json);
  // Replacement-string metacharacters are legal authored text and must arrive as text.
  cat.definitions[1].brief.worldText = "Hopper counts $& and $' and $1 stones.";
  writeCat(r.json, cat);
  const out = write(r.json, { root: r.dir });
  assert.equal(out.ok, true, JSON.stringify(out.errors)); assert.equal(out.written, true);
  const after = fs.readFileSync(r.engine, "utf8");
  assert.equal(outsideLiteral(after), outsideLiteral(before));
  assert.equal(after.includes("\r\n"), !lf);
  assert.equal(JSON.parse(readEmbedded(after)).definitions[1].brief.worldText, "Hopper counts $& and $' and $1 stones.");
  assert.equal(check(r.json, { root: r.dir }).ok, true);
});

test("a refused catalog is reported with codes and paths, and nothing is written", t => {
  const r = tempRoot(t), before = fs.readFileSync(r.engine);
  extract(r.json, { root: r.dir });
  const cat = readCat(r.json);
  cat.definitions[1].workspace.controlIds.push("telescope");
  writeCat(r.json, cat);
  const c = check(r.json, { root: r.dir });
  assert.equal(c.ok, false); assert.deepEqual(c.ids, []);
  assert.ok(c.errors.some(e => e.code === "no-such-control" && e.path === "$.workspace.controlIds" && e.extra === "telescope"),
    JSON.stringify(c.errors));
  const w = write(r.json, { root: r.dir });
  assert.equal(w.ok, false); assert.equal(w.written, false);
  assert.deepEqual(fs.readFileSync(r.engine), before);
});

test("the size cap is judged on the text that would be installed, not the file as typed", t => {
  const r = tempRoot(t), before = fs.readFileSync(r.engine);
  extract(r.json, { root: r.dir });
  const cat = readCat(r.json), woods = cat.definitions[1];
  for (let i = 0; i < 14; i++) cat.definitions.push({ ...JSON.parse(JSON.stringify(woods)), id: "woods-copy-" + i });
  writeCat(r.json, cat, true);                       // compact on disk: well under the cap as typed
  assert.ok(fs.statSync(r.json).size < 262144);
  const c = check(r.json, { root: r.dir });
  assert.ok(c.bytes > 262144, String(c.bytes));
  assert.deepEqual(c.errors.map(e => e.code), ["source-too-large"]);
  assert.equal(write(r.json, { root: r.dir }).written, false);
  assert.deepEqual(fs.readFileSync(r.engine), before);
});

test("the catalog is checked as official, as the game loads it", t => {
  const r = tempRoot(t);
  extract(r.json, { root: r.dir });
  const cat = readCat(r.json);
  cat.definitions[0].author.kind = "player";
  writeCat(r.json, cat);
  assert.ok(check(r.json, { root: r.dir }).errors.some(e => e.code === "author-kind-mismatch"));
});

test("bad input never writes: invalid JSON, or the engine file named as input", t => {
  const r = tempRoot(t), before = fs.readFileSync(r.engine);
  fs.writeFileSync(r.json, "{ \"v\": 1, \"definitions\": [ ");
  assert.throws(() => write(r.json, { root: r.dir }), /not valid JSON/);
  assert.throws(() => write(r.engine, { root: r.dir }), /quest-engine\.js itself/);
  assert.throws(() => extract(r.engine, { root: r.dir }), /refusing to overwrite/);
  assert.deepEqual(fs.readFileSync(r.engine), before);
});

test("the declaration must be found exactly once, as one closed double-quoted literal", () => {
  const lit = JSON.stringify("{}");
  assert.match(findLiteral("let x = 1;\n").error, /no `const BUILTIN_QUEST_CATALOG_JSON =` declaration/);
  assert.match(findLiteral(ANCHOR + lit + ";\n" + ANCHOR + lit + ";\n").error, /two/);
  assert.match(findLiteral(ANCHOR + "`{}`;\n").error, /double-quoted/);
  assert.match(findLiteral(ANCHOR + "\"{\n}\";\n").error, /one line/);
  assert.match(findLiteral(ANCHOR + lit + "\n").error, /followed by `;`/);
  assert.throws(() => spliceCatalog("nothing here", "{}"), /no `const/);
  // An escaped quote inside the literal is not its end.
  const tricky = ANCHOR + JSON.stringify("{\"a\":\"say \\\"hi\\\"\"}") + ";\nafter();\n";
  assert.equal(spliceCatalog(tricky, "{}"), ANCHOR + JSON.stringify("{}") + ";\nafter();\n");
});

test("evidence reports what the analyzers hear in a witness song, and refuses what the game cannot read", t => {
  const r = tempRoot(t), woods = JSON.parse(readEmbedded(fs.readFileSync(r.engine, "utf8"))).definitions
    .find(d => d.id === "waking-woods");
  const songFile = path.join(r.dir, "song.json");
  fs.writeFileSync(songFile, JSON.stringify(woods.witnesses.find(w => w.id === "woods-main-beats").songs.A));
  const e = evidence(songFile, { root: r.dir });
  assert.deepEqual(e, { valid: true, palette: "pentatonic", paletteFallback: false, columns: 16,
    contourFamilies: ["rise"], pulseFamilies: ["main-beat-kicks"], beatsHit: 4, beats: 4, notes: 6, drumHits: 4 });
  fs.writeFileSync(songFile, JSON.stringify(woods.witnesses.find(w => w.id === "woods-shimmer").songs.A));
  assert.deepEqual(evidence(songFile, { root: r.dir }).pulseFamilies, ["hat-shimmer"]);
  fs.writeFileSync(songFile, JSON.stringify({ v: 2, tracks: [] }));
  assert.deepEqual(evidence(songFile, { root: r.dir }), { valid: false, code: "not-v3" });
});
