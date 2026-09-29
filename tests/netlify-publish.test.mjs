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
// command — tests/helpers/netlify-publish.mjs reads its `cp` steps, which is how this build is written.
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gameScripts, ROOT } from "./helpers/game-scripts.mjs";
import { publishGaps } from "./helpers/netlify-publish.mjs";

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
  assert.deepEqual(publishGaps(REAL_TOML.replace(/^([ \t]*)command/m, "$1# command"), scripts), ["netlify.toml has no [build] command"]);
});

// A [context.*] command REPLACES [build]'s for that deploy context, so a production or deploy-preview
// override that forgets js/ breaks exactly that context while [build] still looks fine. Mutation: read
// [build]'s command alone — this test then reports nothing for the override and fails.
test("a context command that replaces [build]'s must publish the scripts too", () => {
  const { scripts } = gameScripts();
  const external = scripts.filter((s) => !s.inline);
  const override = (cmd) => REAL_TOML + `\n[context.production]\n  command = "${cmd}"\n`;
  assert.deepEqual(publishGaps(override("mkdir -p site && cp index.html site/index.html && cp -r js site/js"), scripts), []);
  assert.deepEqual(publishGaps(override("mkdir -p site && cp index.html site/index.html"), scripts),
    external.map((s) => "[context.production] " + s.name));
});
