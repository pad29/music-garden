// Does cloudflare-build.sh publish exactly what the game loads, at the paths the page asks for it?
// Used by tests/cloudflare-publish.test.mjs (TUN-80) and tests/site-headers.test.mjs.
//
// Pages serves index.html for any path that is not a real file, so a js/ file missing from site/ is not
// a 404: the browser gets HTML where it asked for JavaScript, fails to parse it, and the game never
// starts. Nothing local shows that — http-server and file:// both serve the repository itself.
//
// The checker is STRICT: a step it cannot read is refused, never skipped. Skipping is how `cp -R spike
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

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

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

/**
 * What one list of copies would lack: `index.html` and every local script the page loads, each
 * needing a copy that puts it at the SAME path under site/. A script is covered by copying its top
 * folder recursively (js → site/js), or by copying the file itself when it sits at the root.
 */
export function copyGaps(copies, scripts) {
  const at = (path, dir) => copies.some((c) => c.src === path && c.dst === path && c.recursive === dir);
  const gaps = [];
  if (!at("index.html", false)) gaps.push("index.html");
  for (const s of scripts.filter((s) => !s.inline)) {
    const [top, ...rest] = s.name.split("/");
    if (!(rest.length ? at(top, true) : at(top, false))) gaps.push(s.name);
  }
  return gaps;
}

export const showCopy = (c) => `cp ${c.recursive ? "-r " : ""}${c.src} site/${c.dst}`;

/**
 * Everything wrong with the Cloudflare publish config, as readable lines ([] when it is right):
 * a refused step; a script the page loads that would not be published at its path; a copy outside
 * `allowed` or an allowed one missing.
 */
export function cloudflareProblems({ script, scripts, allowed }) {
  const { copies, refused } = parseBuildScript(script);
  if (refused !== null) return [`cloudflare-build.sh: refused "${refused}"`];
  const problems = copyGaps(copies, scripts).map((g) => `cloudflare-build.sh does not publish ${g}`);
  const mine = new Set(copies.map(showCopy));
  for (const c of mine) if (!allowed.includes(c)) problems.push(`cloudflare-build.sh publishes more than the game loads: ${c}`);
  for (const c of allowed) if (!mine.has(c)) problems.push(`cloudflare-build.sh does not run: ${c}`);
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
