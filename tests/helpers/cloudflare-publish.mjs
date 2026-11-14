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
// More than one chain line is allowed (with `set -e`, a new line is the same as `&&`); only the first
// may, and must, start with `rm -rf site && mkdir site`.

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { buildCommands, publishCopies, copyGaps, publishDirs } from "./netlify-publish.mjs";

const CP = /^cp( -r)? ([A-Za-z0-9_][A-Za-z0-9._-]*) site\/([A-Za-z0-9_][A-Za-z0-9._-]*)$/;

/** The script's copies, or the first line or step it refuses ({ copies, refused }). */
export function parseBuildScript(text) {
  const live = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  if (live[0] !== "set -eu") return { copies: [], refused: live[0] ?? "(an empty script)" };
  const steps = live.slice(1).flatMap((l) => l.split("&&").map((s) => s.trim()));
  if (steps[0] !== "rm -rf site" || steps[1] !== "mkdir site")
    return { copies: [], refused: steps.slice(0, 2).join(" && ") || "(no build steps)" };
  const copies = [];
  for (const step of steps.slice(2)) {
    const m = step.match(CP);
    if (!m) return { copies, refused: step || "(an empty step)" };
    copies.push({ src: m[2], dst: m[3], recursive: !!m[1] });
  }
  return { copies, refused: null };
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
  const commands = buildCommands(toml);
  if (!commands.some((c) => c.table === "build")) problems.push("netlify.toml has no [build] command");
  for (const { table, command } of commands) {
    const theirs = new Set(publishCopies(command).map(showCopy));
    for (const c of theirs) if (!mine.has(c)) problems.push(`netlify.toml [${table}] runs ${c}; cloudflare-build.sh does not`);
    for (const c of mine) if (!theirs.has(c)) problems.push(`cloudflare-build.sh runs ${c}; netlify.toml [${table}] does not`);
  }
  for (const { table, dir } of publishDirs(toml))
    if (dir !== "site") problems.push(`netlify.toml [${table}] publishes "${dir}", not "site"`);
  if (!publishDirs(toml).some((p) => p.table === "build")) problems.push("netlify.toml [build] sets no publish directory");
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
