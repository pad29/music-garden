// Does cloudflare-build.sh publish exactly what the game loads, and the same folders as netlify.toml?
// Used by tests/cloudflare-publish.test.mjs (TUN-80).
//
// Unlike the Netlify checker, which picks out the `cp` steps it recognises and ignores the rest, this
// one is STRICT: a step it cannot read is refused, never skipped. Skipping is how `cp -R spike
// site/spike`, `cp -r backend site` or an `exit 0 &&` in front would slip past a check that claims
// "exactly" (GPT's design review of TUN-80, finding 1). The script's allowed form:
//
//   set -eu
//   rm -rf site && mkdir site && cp <name> site/<name> && cp -r <dir> site/<dir> ...
//
// Comment lines and blank lines are ignored; a `#` anywhere else, or any other command, is refused.
// Exactly ONE chain line: under `set -e`, a failure inside an `&&` list does not stop the script —
// only the list's last command does — so a second line would run, and the build "succeed", after a
// copy on the first line failed (GPT's PR review of TUN-80, finding 3).
//
// netlify.toml's commands go through the same strict chain parser for the parity check (they start
// with `mkdir -p site` instead), so a Netlify command with a step it can't read is refused too
// (finding 1). The lenient Netlify checker in netlify-publish.mjs keeps its own narrower contract.

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { buildCommands, copyGaps, publishDirs } from "./netlify-publish.mjs";

const CP = /^cp( -r)? ([A-Za-z0-9_][A-Za-z0-9._-]*) site\/([A-Za-z0-9_][A-Za-z0-9._-]*)$/;

/** One `&&` chain: the exact `head` steps, then only plain copies ({ copies, refused }). */
export function parseChain(chain, head) {
  const steps = chain.split("&&").map((s) => s.trim());
  if (head.some((h, i) => steps[i] !== h))
    return { copies: [], refused: steps.slice(0, head.length).join(" && ") || "(no build steps)" };
  const copies = [];
  for (const step of steps.slice(head.length)) {
    const m = step.match(CP);
    if (!m) return { copies, refused: step || "(an empty step)" };
    copies.push({ src: m[2], dst: m[3], recursive: !!m[1] });
  }
  return { copies, refused: null };
}

/** The script's copies, or the first line or step it refuses ({ copies, refused }). */
export function parseBuildScript(text) {
  const live = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  if (live[0] !== "set -eu") return { copies: [], refused: live[0] ?? "(an empty script)" };
  if (live.length < 2) return { copies: [], refused: "(no build steps)" };
  if (live.length > 2) return { copies: [], refused: `a second command line: ${live[2]}` };
  return parseChain(live[1], ["rm -rf site", "mkdir site"]);
}

// A line that sets `command` or `publish` in any TOML spelling: bare, quoted, or dotted
// (`production.command = …` under [context], `build.publish = …` at the top level).
const SETS_KEY = /^\s*(?:[\w."'-]*\.)?["']?(command|publish)["']?\s*=/;

/** Lines that can set a deploy's command or publish directory: top level, [build], [context…]. */
function settingLines(toml) {
  let table = null, n = 0;
  for (const line of toml.split(/\r?\n/)) {
    const header = line.match(/^\s*\[\[?\s*([^\]]+?)\s*\]\]?\s*(?:#.*)?$/);
    if (header) { table = header[1]; continue; }
    if (SETS_KEY.test(line) && (table === null || table === "build" || table === "context" || table.startsWith("context.")))
      n++;
  }
  return n;
}

export const showCopy = (c) => `cp ${c.recursive ? "-r " : ""}${c.src} site/${c.dst}`;

/**
 * Everything wrong with the Cloudflare publish config, as readable lines ([] when it is right):
 * a refused step; a script the page loads that would not be published at its path; a copy outside
 * `allowed` or an allowed one missing; a Netlify build command ([build] or any [context.*]) whose
 * copies differ from Cloudflare's; a Netlify publish directory other than site.
 */
export function cloudflareProblems({ script, toml, scripts, allowed }) {
  const { copies, refused } = parseBuildScript(script);
  if (refused !== null) return [`cloudflare-build.sh: refused "${refused}"`];
  const problems = copyGaps(copies, scripts).map((g) => `cloudflare-build.sh does not publish ${g}`);
  const mine = new Set(copies.map(showCopy));
  for (const c of mine) if (!allowed.includes(c)) problems.push(`cloudflare-build.sh publishes more than the game loads: ${c}`);
  for (const c of allowed) if (!mine.has(c)) problems.push(`cloudflare-build.sh does not run: ${c}`);
  const commands = buildCommands(toml), dirs = publishDirs(toml);
  // Every line that sets a command or publish directory must be one the readers above understood:
  // one they can't read is refused, never treated as absent (GPT's PR review, finding 2).
  const setting = settingLines(toml);
  if (setting !== commands.length + dirs.length)
    problems.push(`netlify.toml: ${setting - commands.length - dirs.length} command/publish line(s) in a form this check can't read`);
  if (!commands.some((c) => c.table === "build")) problems.push("netlify.toml has no [build] command");
  for (const { table, command } of commands) {
    const { copies: copied, refused: no } = parseChain(command, ["mkdir -p site"]);
    if (no !== null) { problems.push(`netlify.toml [${table}]: refused "${no}"`); continue; }
    const theirs = new Set(copied.map(showCopy));
    for (const c of theirs) if (!mine.has(c)) problems.push(`netlify.toml [${table}] runs ${c}; cloudflare-build.sh does not`);
    for (const c of mine) if (!theirs.has(c)) problems.push(`cloudflare-build.sh runs ${c}; netlify.toml [${table}] does not`);
  }
  for (const { table, dir } of dirs)
    if (dir !== "site") problems.push(`netlify.toml [${table}] publishes "${dir}", not "site"`);
  if (!dirs.some((p) => p.table === "build")) problems.push("netlify.toml [build] sets no publish directory");
  return problems;
}

/**
 * The files `copies` would put under site/, run against the folder `root`: a Map from the path under
 * site/ to the source file. What a copy of a missing source would do is left to the shell (cp fails).
 */
export function publishedTree(root, copies) {
  const out = new Map();
  const walk = (src, dst) => {
    if (statSync(src).isDirectory()) {
      for (const name of readdirSync(src)) walk(join(src, name), `${dst}/${name}`);
    } else out.set(dst, src);
  };
  for (const c of copies) {
    const src = join(root, c.src);
    if (statSync(src).isDirectory() && !c.recursive) continue;   // cp without -r refuses a folder
    walk(src, c.dst);
  }
  return out;
}

/** Published paths named 404.html: one would take Pages out of single-page-app mode for its folder. */
export const custom404s = (tree) => [...tree.keys()].filter((p) => p.split("/").pop() === "404.html");
