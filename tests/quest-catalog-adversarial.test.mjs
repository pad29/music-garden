// TUN-105 tester: all installation/CLI writes use disposable copies, never the checkout.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ROOT, ENGINE_REL, extract, check, write, evidence, canonicalText, readEmbedded } from "../tools/quest-catalog.mjs";

function fixture(t, cli = false) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tun105-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.copyFileSync(path.join(ROOT, "index.html"), path.join(root, "index.html"));
  fs.cpSync(path.join(ROOT, "js"), path.join(root, "js"), { recursive: true });
  if (cli) {
    for (const rel of ["tools/quest-catalog.mjs", "tests/harness.mjs", "tests/helpers/game-scripts.mjs"]) {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.copyFileSync(path.join(ROOT, rel), path.join(root, rel));
    }
  }
  const engine = path.join(root, ENGINE_REL), json = path.join(root, "draft catalog.json");
  extract(json, { root });
  const catalog = JSON.parse(fs.readFileSync(json, "utf8"));
  const save = () => fs.writeFileSync(json, canonicalText(catalog));
  const cliRun = (...args) => {
    const result = spawnSync(process.execPath, ["tools/quest-catalog.mjs", ...args], {
      cwd: root, encoding: "utf8", timeout: 30000,
    });
    assert.ifError(result.error);
    assert.equal(result.signal, null);
    return { ...result, output: result.stdout + result.stderr };
  };
  return { root, engine, json, catalog, save, cliRun };
}

test("BOM input is accepted by check, write and evidence instead of being rejected as JSON", t => {
  // MUTATION: omit BOM removal in either file reader.
  const f = fixture(t);
  f.catalog.definitions.find(d => d.id === "waking-woods").title = "BOM garden";
  fs.writeFileSync(f.json, "\ufeff" + canonicalText(f.catalog));
  assert.equal(check(f.json, f).ok, true);
  assert.equal(write(f.json, f).written, true);
  const song = f.catalog.definitions[0].witnesses[0].songs.A;
  fs.writeFileSync(f.json, "\ufeff" + JSON.stringify(song));
  assert.equal(evidence(f.json, f).valid, true);
});

test("comments and trailing commas are refused without installing partial input", t => {
  // MUTATION: permit JS object syntax or write before JSON parsing has succeeded.
  const f = fixture(t), before = fs.readFileSync(f.engine);
  for (const raw of ["/* comment */" + canonicalText(f.catalog), canonicalText(f.catalog).replace(/}\s*$/, ",}")]) {
    fs.writeFileSync(f.json, raw);
    assert.throws(() => check(f.json, f), /not valid JSON/);
    assert.throws(() => write(f.json, f), /not valid JSON/);
    assert.ok(fs.readFileSync(f.engine).equals(before));
  }
});

test("invalid envelopes and a thirty-third definition are refused before any write", t => {
  // MUTATION: validate definitions individually while ignoring the enclosing catalog contract.
  const f = fixture(t), before = fs.readFileSync(f.engine);
  for (const [value, code] of [
    [{ v: 1, definitions: [] }, "bad-envelope"],
    [{ v: 2, definitions: f.catalog.definitions }, "bad-envelope"],
    [{ v: 1, definitions: Array.from({length:33}, () => ({})) }, "bad-envelope"],
    [{ ...f.catalog, extra: true }, "unknown-envelope-key"],
  ]) {
    fs.writeFileSync(f.json, JSON.stringify(value));
    const result = write(f.json, f);
    assert.equal(result.written, false);
    assert.deepEqual(result.errors.map(e => e.code), [code]);
    assert.ok(fs.readFileSync(f.engine).equals(before));
  }
});

test("case and relative aliases cannot bypass the engine filename guard", t => {
  // MUTATION: compare raw names or compare resolved Windows names case-sensitively.
  const f = fixture(t), before = fs.readFileSync(f.engine);
  for (const alias of [f.engine.toUpperCase(), path.relative(process.cwd(), f.engine)]) {
    assert.throws(() => extract(alias, f), /refusing to overwrite/);
    assert.throws(() => write(alias, f), /quest-engine\.js itself/);
  }
  assert.ok(fs.readFileSync(f.engine).equals(before));
});

test("extract replaces an existing destination with complete JSON and leaves the engine alone", t => {
  // MUTATION: append to the destination or retain stale trailing bytes.
  const f = fixture(t), before = fs.readFileSync(f.engine);
  fs.writeFileSync(f.json, "stale".repeat(30000));
  extract(f.json, f);
  assert.deepEqual(JSON.parse(fs.readFileSync(f.json, "utf8")), f.catalog);
  assert.ok(fs.readFileSync(f.engine).equals(before));
});

test("CLI extract, check and write honor relative paths with spaces and report no-op installs", t => {
  // MUTATION: resolve input relative to the tool, skip the CLI dispatch, or return failure on no-op.
  const f = fixture(t, true), file = path.basename(f.json);
  for (const cmd of ["extract", "check", "write"]) {
    const out = f.cliRun(cmd, file);
    assert.equal(out.status, 0, out.output);
    assert.match(out.output, cmd === "write" ? /nothing written/ : cmd === "check" ? /ok —/ : /wrote /);
  }
  f.catalog.definitions[0].title = "CLI garden"; f.save();
  const out = f.cliRun("write", file);
  assert.equal(out.status, 0, out.output);
  assert.match(out.output, /installed in js\/quest-engine.js/);
  const installed = JSON.parse(readEmbedded(fs.readFileSync(f.engine, "utf8")));
  assert.equal(installed.definitions.find(d => d.id === f.catalog.definitions[0].id).title, "CLI garden");
});

test("CLI usage exits 2 and rejected JSON or catalogs exit 1 without changing the engine", t => {
  // MUTATION: print a refusal but exit successfully, or write a rejected catalog.
  const f = fixture(t, true), before = fs.readFileSync(f.engine), file = path.basename(f.json);
  for (const args of [[], ["check"], ["unknown", file]]) {
    const out = f.cliRun(...args);
    assert.equal(out.status, 2, out.output); assert.match(out.output, /usage:/);
  }
  f.catalog.definitions[0].workspace.controlIds.push("telescope"); f.save();
  for (const cmd of ["check", "write"]) {
    const out = f.cliRun(cmd, file);
    assert.equal(out.status, 1, out.output);
    assert.match(out.output, /no-such-control\s+\$\.workspace.controlIds/);
  }
  fs.writeFileSync(f.json, "{");
  assert.equal(f.cliRun("write", file).status, 1);
  assert.ok(fs.readFileSync(f.engine).equals(before));
});

test("CLI evidence distinguishes a valid witness, invalid song and malformed JSON by exit status", t => {
  // MUTATION: evidence falls through catalog dispatch or returns success for unreadable songs.
  const f = fixture(t, true), file = path.basename(f.json);
  fs.writeFileSync(f.json, JSON.stringify(f.catalog.definitions[0].witnesses[0].songs.A));
  const out = f.cliRun("evidence", file);
  assert.equal(out.status, 0, out.output); assert.match(out.output, /contour families:/);
  fs.writeFileSync(f.json, '{"v":2}');
  const invalid = f.cliRun("evidence", file);
  assert.equal(invalid.status, 1); assert.match(invalid.output, /not-v3/);
  fs.writeFileSync(f.json, "{");
  assert.equal(f.cliRun("evidence", file).status, 1);
});

function reloadFixture(t, statement) {
  const f = fixture(t);
  // A real load-time dependency on the newly installed catalog, not a harness failure.
  // Initially false, so check() can load the old game and validate the new JSON successfully.
  fs.appendFileSync(f.engine, '\nif (JSON.parse(BUILTIN_QUEST_CATALOG_JSON).definitions.some(d => d.title === "Reload probe")) { ' + statement + ' }\n');
  f.catalog.definitions[0].title = "Reload probe"; f.save();
  assert.equal(check(f.json, f).ok, true);
  return f;
}

test("a candidate whose reload reports catalog errors never replaces the engine", t => {
  // MUTATION: skip the candidate load before replacing, or restore only the old literal.
  const f = reloadFixture(t, 'loadQuestCatalog = function() { QUEST_CATALOG_ERRORS = [{code:"reload-probe",path:"$"}]; QUEST_DEFINITIONS = {}; };');
  const before = fs.readFileSync(f.engine);
  assert.throws(() => write(f.json, f), /did not load cleanly.*not changed/);
  assert.ok(fs.readFileSync(f.engine).equals(before));
  assert.equal(fs.readdirSync(path.dirname(f.engine)).some(n => n.includes(".tmp-")), false);
});

test("a thrown reload also leaves the original engine instead of installing the broken candidate", t => {
  // MUTATION: handle error verdicts but omit exception-safe rollback around the fresh load.
  const f = reloadFixture(t, 'throw new Error("reload-probe-exception");');
  const before = fs.readFileSync(f.engine);
  assert.throws(() => write(f.json, f), /reload-probe-exception/);
  assert.ok(fs.readFileSync(f.engine).equals(before), "failed candidate must not remain installed");
});
