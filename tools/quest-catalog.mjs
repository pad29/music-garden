#!/usr/bin/env node
// Edit the built-in quest catalog without hand-escaping it. MAKING-QUESTS.md is the guide; this is its tool.
//
// The catalog is ONE string literal, `BUILTIN_QUEST_CATALOG_JSON`, in js/quest-engine.js: the whole
// catalog as JSON, every quote escaped (the comment above it says why it is JSON and not object
// literals). This tool moves it out to a file you can edit and back in again, and checks it with the
// game's own loader on the way.
//
//   node tools/quest-catalog.mjs extract <file.json>   # write the catalog, pretty-printed, to a file
//   node tools/quest-catalog.mjs check   <file.json>   # validate that file exactly as the game would
//   node tools/quest-catalog.mjs write   <file.json>   # check it, then install it in js/quest-engine.js
//   node tools/quest-catalog.mjs evidence <song.json>  # what the analyzers hear in one v3 song (a witness)
//
// Rules it keeps:
// - What is checked is what is installed. `check` and `write` validate the CANONICAL text (the file
//   re-serialised the way it will be embedded), because the loader's size cap counts that text, not the
//   file you typed (found by GPT's design review: 14 definitions passed compact and failed pretty).
// - The verdict is the game's: `loadQuestCatalog(text, "official")` then `QUEST_CATALOG_ERRORS`. The
//   returned registry is no verdict — a refused catalog returns an EMPTY registry, which is truthy.
// - `write` changes the literal and nothing else: one declaration found by its exact anchor (none or two
//   is refused), spliced by offsets (no replacement strings, so "$&" in a quest's text stays text), every
//   other byte kept (CRLF included). The result is reloaded from disk through the test harness; if that
//   load is not clean, the original bytes are put back.
// - It never decides who is official. The built-in catalog is loaded as "official" by js/boot.js, so it
//   is checked as official here — the same claim, through the same gate (QUESTS.md Q7).
//
// Zero dependencies. It loads the game through tests/harness.mjs, as the tests do.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadGame } from "../tests/harness.mjs";

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const ENGINE_REL = path.join("js", "quest-engine.js");
export const ANCHOR = "const BUILTIN_QUEST_CATALOG_JSON = ";

// The text the game would parse, from a catalog object: the format the shipped literal uses.
export const canonicalText = catalog => JSON.stringify(catalog, null, 1);

// Where the literal is: [start, end) of the quoted string, or an error message.
export function findLiteral(engineText) {
  const first = engineText.indexOf(ANCHOR);
  if (first < 0) return { error: "no `" + ANCHOR.trim() + "` declaration in js/quest-engine.js" };
  if (engineText.indexOf(ANCHOR, first + 1) >= 0) return { error: "two `" + ANCHOR.trim() + "` declarations in js/quest-engine.js" };
  const start = first + ANCHOR.length;
  if (engineText[start] !== '"') return { error: "the catalog is not a double-quoted string literal" };
  let i = start + 1;
  for (; i < engineText.length; i++) {
    const ch = engineText[i];
    if (ch === "\\") { i++; continue; }
    if (ch === '"') break;
    if (ch === "\n" || ch === "\r") return { error: "the catalog literal is not on one line" };
  }
  if (i >= engineText.length) return { error: "the catalog literal never closes" };
  const end = i + 1;
  if (engineText[end] !== ";") return { error: "the catalog literal is not followed by `;`" };
  return { start, end };
}

// The catalog text the engine file embeds (decoded once, as the game's parser would).
export function readEmbedded(engineText) {
  const at = findLiteral(engineText);
  if (at.error) throw new Error(at.error);
  return JSON.parse(engineText.slice(at.start, at.end));
}

// A new engine file: the same bytes, with only the literal replaced.
export function spliceCatalog(engineText, text) {
  const at = findLiteral(engineText);
  if (at.error) throw new Error(at.error);
  return engineText.slice(0, at.start) + JSON.stringify(text) + engineText.slice(at.end);
}

// Validate catalog TEXT through the real loader. Returns { ok, errors, ids }.
export function checkText(text, game = loadGame({ fresh: true })) {
  game.loadQuestCatalog(text, "official");
  const errors = [...game.QUEST_CATALOG_ERRORS].map(e => ({ code: e.code, path: e.path, extra: e.extra }));
  const ids = errors.length ? [] : Object.keys(game.QUEST_DEFINITIONS);
  return { ok: errors.length === 0, errors, ids, game };
}

// Read the file a contributor edited, and turn it into the canonical text. Throws on bad JSON.
export function canonicalFromFile(file) {
  const raw = fs.readFileSync(file, "utf8").replace(/^﻿/, "");
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch (e) { throw new Error(file + " is not valid JSON: " + e.message); }
  return canonicalText(parsed);
}

const sameFile = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

export function extract(file, { root = ROOT } = {}) {
  const engine = path.join(root, ENGINE_REL);
  if (sameFile(file, engine)) throw new Error("refusing to overwrite js/quest-engine.js — name a separate .json file");
  const text = readEmbedded(fs.readFileSync(engine, "utf8"));
  fs.writeFileSync(file, canonicalText(JSON.parse(text)) + "\n");
  return { count: JSON.parse(text).definitions.length };
}

export function check(file, { root = ROOT } = {}) {
  const text = canonicalFromFile(file);
  const r = checkText(text, loadGame({ fresh: true, root }));
  return { ...r, bytes: text.length };
}

export function write(file, { root = ROOT } = {}) {
  const engine = path.join(root, ENGINE_REL);
  if (sameFile(file, engine)) throw new Error("the input file is js/quest-engine.js itself — name the .json file you edited");
  const text = canonicalFromFile(file);
  const verdict = checkText(text, loadGame({ fresh: true, root }));
  if (!verdict.ok) return { ...verdict, written: false, bytes: text.length };
  const before = fs.readFileSync(engine, "utf8");
  const after = spliceCatalog(before, text);
  if (readEmbedded(after) !== text) throw new Error("internal: the spliced literal does not decode to the checked text");
  if (after === before) return { ...verdict, written: false, unchanged: true, bytes: text.length };
  const tmp = engine + ".tmp-" + process.pid;
  fs.writeFileSync(tmp, after);
  fs.renameSync(tmp, engine);
  // The game as it now loads from disk: the same catalog, with no errors, or the original goes back.
  const g = loadGame({ fresh: true, root });
  const reloaded = [...g.QUEST_CATALOG_ERRORS];
  const want = verdict.ids.join(","), got = Object.keys(g.QUEST_DEFINITIONS).join(",");
  if (reloaded.length || want !== got) {
    fs.writeFileSync(engine, before);
    throw new Error("the written file did not load cleanly (" + JSON.stringify(reloaded) + "); js/quest-engine.js restored");
  }
  return { ...verdict, written: true, bytes: text.length };
}

// What the quest analyzers read off one song — the same songEvidence() the validator runs on a witness.
export function evidence(file, { root = ROOT } = {}) {
  let song;
  try { song = JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, "")); }
  catch (e) { throw new Error(file + " is not valid JSON: " + e.message); }
  const e = loadGame({ fresh: true, root }).songEvidence(song);
  if (!e.valid) return { valid: false, code: e.code };
  return { valid: true, palette: e.paletteId, paletteFallback: e.paletteFallback, columns: e.columns,
    contourFamilies: [...e.contourFamilies], pulseFamilies: [...e.steadyPulseFamilies],
    beatsHit: e.melodyBeatsHit, beats: e.beatCount, notes: e.melodyOnsetCount, drumHits: e.drumOnsetCount };
}

// ---- the command line ----
const report = r => {
  if (r.ok) {
    console.log(`ok — ${r.ids.length} quest${r.ids.length === 1 ? "" : "s"}: ${r.ids.join(", ")} (${r.bytes} of 262144 characters)`);
    return;
  }
  console.log(`refused — ${r.errors.length} error${r.errors.length === 1 ? "" : "s"}. One bad definition hides EVERY quest in the game.`);
  for (const e of r.errors) console.log(`  ${e.code}  ${e.path}${e.extra !== undefined ? "  " + JSON.stringify(e.extra) : ""}`);
  console.log("What each code means: MAKING-QUESTS.md § When the check says no.");
};

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const [cmd, file] = process.argv.slice(2);
  const usage = () => { console.error("usage: node tools/quest-catalog.mjs extract|check|write <file.json>  |  evidence <song.json>"); process.exit(2); };
  if (!file || !["extract", "check", "write", "evidence"].includes(cmd)) usage();
  try {
    if (cmd === "extract") {
      const r = extract(file);
      console.log(`wrote ${file} — ${r.count} quests. Edit it, then: node tools/quest-catalog.mjs check ${file}`);
    } else if (cmd === "evidence") {
      const e = evidence(file);
      if (!e.valid) { console.log(`not a song the game can read: ${e.code}`); process.exit(1); }
      const list = xs => xs.length ? xs.join(", ") : "none";
      console.log(`palette ${e.palette}${e.paletteFallback ? " (unknown or missing — the game falls back to it; a witness may not)" : ""}, ${e.columns} columns`);
      console.log(`contour families: ${list(e.contourFamilies)}`);
      console.log(`pulse families:   ${list(e.pulseFamilies)}`);
      console.log(`tune on the beat: ${e.beatsHit} of ${e.beats} main beats`);
      console.log(`notes: ${e.notes}, drum hits: ${e.drumHits}`);
    } else if (cmd === "check") {
      const r = check(file); report(r); process.exit(r.ok ? 0 : 1);
    } else {
      const r = write(file); report(r);
      if (r.written) console.log("installed in js/quest-engine.js. Now run the tests (MAKING-QUESTS.md § Checking it).");
      else if (r.unchanged) console.log("js/quest-engine.js already holds exactly this catalog — nothing written.");
      else console.log("js/quest-engine.js was not changed.");
      process.exit(r.ok ? 0 : 1);
    }
  } catch (e) { console.error("quest-catalog: " + e.message); process.exit(1); }
}
