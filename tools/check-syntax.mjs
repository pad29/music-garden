#!/usr/bin/env node
// Syntax-check every script the game loads — each local <script src> file index.html names (and any
// inline <script>, though since TUN-7 there is none) — as a classic script, without running any of
// it. Run after every edit:
//
//   node tools/check-syntax.mjs
//
// It checks each file's own grammar. It cannot see two files that both declare the same top-level
// name, or load-time code calling a function from a file that hasn't run yet; the test suite runs
// the scripts in order and catches those.

// An optional folder argument checks the index.html in that folder instead (the tests use it).

import { resolve } from "node:path";
import { gameScripts, checkSyntax, vendoredSources, ROOT } from "../tests/helpers/game-scripts.mjs";

try {
  // The vendored library under vendor/ (TUN-81) too: not a game script, but a file the page runs.
  const { scripts, vendored } = gameScripts(process.argv[2] ? resolve(process.argv[2]) : ROOT);
  checkSyntax([...vendoredSources(vendored), ...scripts]);
  const names = (list) => list.map((s) => s.name).join(", ");
  console.log(`syntax OK (${scripts.length} script${scripts.length === 1 ? "" : "s"}: ${names(scripts)}` +
    (vendored.length ? `; vendored: ${names(vendored)})` : ")"));
} catch (err) {
  // vm puts "file:line" and a caret on the first line of the stack for a SyntaxError.
  console.error(err.stack || String(err));
  process.exit(1);
}
