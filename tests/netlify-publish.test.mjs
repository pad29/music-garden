// netlify.toml must publish every script the page loads, at the path the page asks for it.
//
// Why a test: the catch-all rewrite in netlify.toml serves index.html for any path that is not a real
// file, so a js/ file missing from the publish dir is not a 404 — the browser gets HTML where it asked
// for JavaScript, fails to parse it, and the game never starts. Nothing local shows that: http-server and
// file:// both serve the repository itself. The deploy preview is the real proof; this is the static
// half, so the mistake is caught before a deploy.
//
// Scope, deliberately narrow: the page's static local <script src> files (as tests/helpers/game-scripts.mjs
// reads them) and index.html itself. It does not cover folders the game loads at run time by other means
// (samples/ through script tags it creates, voice/ through Audio elements), and it does not run the
// command — it reads its `cp` steps, which is how this build is written.
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gameScripts, ROOT } from "./helpers/game-scripts.mjs";

/** The `cp` steps of netlify.toml's build command, as { src, dst, recursive } (dst relative to site/). */
function publishCopies(toml) {
  const m = toml.match(/^[ \t]*command[ \t]*=[ \t]*"([^"]*)"/m);   // a real line, never a # comment
  if (!m) return null;
  return m[1].split("&&").map((s) => s.trim())
    .map((s) => s.match(/^cp\s+(-r\s+)?(\S+)\s+site\/(\S+)$/))
    .filter(Boolean)
    .map((c) => ({ src: c[2], dst: c[3], recursive: !!c[1] }));
}

/**
 * What the publish dir would lack: every path the page needs that no `cp` step puts at the SAME path
 * under site/. A local script is covered by copying its top folder recursively (js → site/js), or by
 * copying the file itself when it sits at the root.
 */
function publishGaps(toml, scripts) {
  const copies = publishCopies(toml);
  if (!copies) return ["netlify.toml has no build command"];
  const at = (path, dir) => copies.some((c) => c.src === path && c.dst === path && c.recursive === dir);
  const gaps = [];
  if (!at("index.html", false)) gaps.push("index.html");
  for (const s of scripts.filter((s) => !s.inline)) {
    const [top, ...rest] = s.name.split("/");
    if (!(rest.length ? at(top, true) : at(top, false))) gaps.push(s.name);
  }
  return [...new Set(gaps)];
}

const REAL_TOML = readFileSync(join(ROOT, "netlify.toml"), "utf8");

test("netlify.toml publishes index.html and every script the page loads, at the paths the page uses", () => {
  const { scripts } = gameScripts();
  assert.ok(scripts.some((s) => !s.inline), "the page loads at least one local script file");
  assert.deepEqual(publishGaps(REAL_TOML, scripts), []);
});

// The checker's own mutations, kept as tests so the guard cannot quietly go blind: each variant is the
// real command with one mistake the production failure mode needs.
test("the publish check refuses a dropped folder, a wrong destination, and a dropped index.html", () => {
  const { scripts } = gameScripts();
  const external = scripts.filter((s) => !s.inline);
  const variant = (from, to) => {
    assert.strictEqual(REAL_TOML.split(from).length, 2, "variant anchor occurs once: " + from);
    return REAL_TOML.replace(from, to);
  };
  // js/ never copied: every external script is a gap.
  assert.deepEqual(publishGaps(variant(" && cp -r js site/js", ""), scripts), external.map((s) => s.name));
  // copied, but to the wrong place: the page asks for js/…, the publish dir has scripts/…
  assert.deepEqual(publishGaps(variant("cp -r js site/js", "cp -r js site/scripts"), scripts), external.map((s) => s.name));
  // copied without -r: cp refuses a directory, so nothing arrives.
  assert.deepEqual(publishGaps(variant("cp -r js site/js", "cp js site/js"), scripts), external.map((s) => s.name));
  // the page itself missing.
  assert.deepEqual(publishGaps(variant("cp index.html site/index.html && ", ""), scripts), ["index.html"]);
  // a commented-out command is no command.
  assert.deepEqual(publishGaps(REAL_TOML.replace(/^([ \t]*)command/m, "$1# command"), scripts), ["netlify.toml has no build command"]);
});
