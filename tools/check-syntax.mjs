#!/usr/bin/env node
// Syntax-check every script the game loads — index.html's inline <script> and each local
// <script src> file — as a classic script, without running any of it. Run after every edit:
//
//   node tools/check-syntax.mjs
//
// It checks each file's own grammar. It cannot see two files that both declare the same top-level
// name, or load-time code calling a function from a file that hasn't run yet; the test suite runs
// the scripts in order and catches those.

import { gameScripts, checkSyntax } from "../tests/helpers/game-scripts.mjs";

try {
  const { scripts } = gameScripts();
  checkSyntax(scripts);
  console.log(`syntax OK (${scripts.length} script${scripts.length === 1 ? "" : "s"}: ${scripts.map((s) => s.name).join(", ")})`);
} catch (err) {
  // vm puts "file:line" and a caret on the first line of the stack for a SyntaxError.
  console.error(err.stack || String(err));
  process.exit(1);
}
