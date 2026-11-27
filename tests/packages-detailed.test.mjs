// PACKAGES-DETAILED.md's summary claims (TUN-119): which packages it covers and how many are built.
//
// Why a test: CONTRIBUTING.md § 2 sends a newcomer fixing a level to PACKAGES-DETAILED.md, and its summary
// lines went stale in silence — the title claimed "all shipped expansion packages" while two are specified
// in PACKAGES.md § 6, the opening said 14 built and § 14 said 18 while README said 20, and § 14 listed
// `two-kinds-of-walking` as not yet built a month after it shipped. Here every count and list in those
// summaries is read against the `PACKAGES` object in js/packages.js, the runtime truth, so a package that
// ships without its docs fails. Whether a spec is *right* stays a human review.
//
// The checks are one pure function over the texts, so each mutation case — the stale text this ticket
// replaced, among others — runs on every suite run and must produce the problem it names.
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadGame } from "./harness.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = p => readFileSync(join(root, p), "utf8").replace(/\r\n/g, "\n");   // CRLF checkouts (autocrlf)

const g = loadGame();
// The hidden `studio` entry is the Studio's one-level sandbox, not a package (README counts 20, not 21).
const PKG = Object.fromEntries(Object.entries(g.PACKAGES).filter(([, p]) => !p.hidden)
  .map(([id, p]) => [id, { levels: p.levels.length }]));

const DOCS = { detailed: read("PACKAGES-DETAILED.md"), packages: read("PACKAGES.md"), readme: read("README.md"),
  contributing: read("CONTRIBUTING.md"), design: read("DESIGN.md") };

// The text under the `## ` heading starting with `title`, heading line included, up to the next `## `.
function section(text, title) {
  const lines = text.split("\n");
  const at = lines.findIndex(l => l.startsWith(`## ${title}`));
  if (at < 0) return null;
  const end = lines.findIndex((l, i) => i > at && l.startsWith("## "));
  return lines.slice(at, end < 0 ? undefined : end).join("\n");
}
const ticked = s => [...s.matchAll(/`([a-z0-9-]+)`/g)].map(m => m[1]);
const same = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

function problems(docs, pkg) {
  const out = [];
  const all = Object.keys(pkg), expansion = all.filter(id => id !== "intro");
  const { detailed, packages, readme, contributing, design } = docs;

  // ---- what the file covers ----
  const specs = [...detailed.matchAll(/^## (\d+)\. `([a-z0-9-]+)`/gm)].map(m => ({ n: +m[1], id: m[2] }));
  const specced = specs.map(s => s.id);
  for (const id of specced) if (!pkg[id]) out.push(`PACKAGES-DETAILED has a section for "${id}", which is not in PACKAGES`);
  const elsewhere = expansion.filter(id => !specced.includes(id));

  const title = detailed.split("\n")[0];
  if (/\ball\b/i.test(title)) out.push(`the title claims all packages: ${title}`);
  const opening = detailed.split("\n---\n")[0];
  const covers = opening.match(/\*\*What this file covers: (\d+) of the (\d+) expansion packages\*\*/);
  if (!covers) out.push("the opening does not say how many expansion packages it covers");
  else {
    if (+covers[1] !== specced.length) out.push(`the opening says it covers ${covers[1]}, it has ${specced.length} package sections`);
    if (+covers[2] !== expansion.length) out.push(`the opening says ${covers[2]} expansion packages, PACKAGES has ${expansion.length}`);
  }
  const where = opening.match(/\*\*Specified elsewhere:\*\*([^\n]*)/);
  if (!where) out.push("the opening does not say where the other packages are specified");
  else {
    const named = ticked(where[1]);
    if (!same(named, elsewhere)) out.push(`the opening names [${named}] as specified elsewhere; the packages with no section are [${elsewhere}]`);
    if (!/PACKAGES\.md\]?\(?[^)\s]*\)? §6/.test(where[1])) out.push("the opening does not point to PACKAGES.md §6");
    if (!/DESIGN\.md\]?\(?[^)\s]*\)? §10/.test(where[1]) || !/Guided campaign/.test(where[1]))
      out.push("the opening does not point to DESIGN.md §10's Guided campaign for the intro");
    const introLevels = where[1].match(/the intro's (\d+) levels/);
    if (!introLevels || +introLevels[1] !== pkg.intro.levels)
      out.push(`the opening's intro level count is not the intro's ${pkg.intro.levels} levels`);
  }
  for (const id of elsewhere) {
    if (!new RegExp(`^#### \`${id}\` .*BUILT ✅`, "m").test(packages)) out.push(`"${id}" has no BUILT spec in PACKAGES.md §6`);
  }
  if (!/^- \*\*Guided campaign \(\d+ levels/m.test(design)) out.push("DESIGN.md has no Guided campaign entry");

  // ---- how many are built ----
  const status = opening.match(/\*\*Status: (\d+) packages are built\*\* — the intro and (\d+) expansion packages/);
  if (!status) out.push("the opening has no status line");
  else if (+status[1] !== all.length || +status[2] !== expansion.length)
    out.push(`the opening says ${status[1]} built (${status[2]} expansion); PACKAGES has ${all.length} (${expansion.length})`);
  for (const [what, re] of [["README's status line", /\*\*(\d+) packages built\*\* across \d+ regions \(the \d+-level intro \+ (\d+) expansion packages/],
    ["README § Current status", /\*\*Built & shipped \((\d+) packages/]]) {
    const m = readme.match(re);
    if (!m) out.push(`${what} has no package count`);
    else if (+m[1] !== all.length || (m[2] && +m[2] !== expansion.length)) out.push(`${what} says ${m[1]} packages built; PACKAGES has ${all.length}`);
  }

  // ---- § 14, the build order ----
  const s14 = section(detailed, "14.");
  if (!s14) return [...out, "PACKAGES-DETAILED has no § 14"];
  const head = s14.split("\n")[0];
  const hm = head.match(/— (\d+) EXPANSION PACKAGES BUILT ✅ \(with the intro, (\d+)\)$/);
  if (!hm) out.push(`§ 14's heading has no count, or a dated one: ${head}`);
  else if (+hm[1] !== expansion.length || +hm[2] !== all.length) out.push(`§ 14's heading says ${hm[1]} (${hm[2]}); PACKAGES has ${expansion.length} (${all.length})`);
  const history = [...s14.matchAll(/^(\d+)\. \*\*([a-z0-9-]+)\*\*/gm)];
  if (history.some((m, i) => +m[1] !== i + 1)) out.push("§ 14's build history is not numbered 1, 2, 3, …");
  const built = history.map(m => m[2]);
  if (!same(built, expansion)) out.push(`§ 14's build history is [${built}]; the expansion packages are [${expansion}]`);
  const dag = (s14.match(/^\*\*DAG as built\*\*[^\n]*/m) || [""])[0];
  if (!dag) out.push("§ 14 has no DAG as built line");
  for (const id of all) if (dag && !new RegExp(`(^|[^a-z-])${id}([^a-z-]|$)`).test(dag)) out.push(`§ 14's DAG line leaves out "${id}"`);
  const notYet = (s14.match(/^\*\*Not yet built\*\*[^\n]*/m) || [""])[0];
  const future = ticked(notYet);
  if (!future.length) out.push("§ 14's Not yet built line names no package");
  for (const id of future) if (pkg[id]) out.push(`§ 14 lists "${id}" as not yet built, but it is in PACKAGES`);

  // ---- the docs that point at it ----
  for (const m of packages.matchAll(/^#### `([a-z0-9-]+)`.*as-built spec in PACKAGES-DETAILED §(\d+)/gm)) {
    const at = specs.find(s => s.n === +m[2]);
    if (!at || at.id !== m[1]) out.push(`PACKAGES.md points "${m[1]}" at PACKAGES-DETAILED §${m[2]}, which is ${at ? `"${at.id}"` : "no package"}`);
  }
  const here = (packages.match(/\*\*The detailed specs live in `PACKAGES-DETAILED\.md`\*\*[^\n]*/) || [""])[0];
  if (!here) out.push("PACKAGES.md does not say which specs live in PACKAGES-DETAILED.md");
  else if (!same(ticked(here.split("except")[1] || ""), elsewhere)) out.push(`PACKAGES.md's exceptions are not [${elsewhere}]`);
  const row = (readme.match(/^\| \*\*`PACKAGES-DETAILED\.md`\*\* \|[^\n]*/m) || [""])[0];
  if (!row || /\b(every|all)( \w+)? expansion package/i.test(row)) out.push(`README's repository map claims it covers every package: ${row}`);
  const level = (contributing.match(/^\| Fix or change a level \|[^\n]*/m) || [""])[0];
  for (const want of ["PACKAGES-DETAILED.md", "for most packages", "§ 6 for a few others", "*Guided campaign*", "§ 10"])
    if (!level.includes(want)) out.push(`CONTRIBUTING.md § 2's level row no longer says "${want}"`);
  return out;
}

test("PACKAGES-DETAILED.md's summaries agree with PACKAGES, README and PACKAGES.md", () => {
  assert.deepEqual(problems(DOCS, PKG), []);
});

test("the runtime has the shape the docs describe: intro + expansion packages, studio hidden", () => {
  assert.ok(PKG.intro && !PKG.studio && g.PACKAGES.studio, "studio is hidden, intro is not");
  assert.ok(Object.keys(PKG).length > 1);
});

// ---- mutation cases: each is a way the docs drift, and must be caught ----
const swap = (key, from, to) => {
  assert.ok(DOCS[key].includes(from), `mutation anchor missing in ${key}: ${from}`);
  return { ...DOCS, [key]: DOCS[key].replace(from, to) };
};
const expectProblem = (docs, re, pkg = PKG) => {
  const found = problems(docs, pkg);
  assert.ok(found.some(p => re.test(p)), `expected a problem matching ${re}, got ${JSON.stringify(found)}`);
};

test("mutation: the old title, opening and § 14 heading (the TUN-119 finding) fail", () => {
  expectProblem(swap("detailed", "(most built expansion packages)", "(all shipped expansion packages)"), /title claims all/);
  expectProblem(swap("detailed", "**What this file covers: 17 of the 19", "**What this file covers: 14 of the 19"), /covers 14/);
  expectProblem(swap("detailed", "**Status: 20 packages are built**", "**Status: 18 packages are built**"), /says 18 built/);
  const h = DOCS.detailed.match(/^## 14\.[^\n]*/m)[0];
  expectProblem(swap("detailed", h, "## 14. Build order & dependencies — 18 EXPANSION PACKAGES BUILT ✅ (as of 2026-07-13)"), /heading has no count, or a dated one/);
});

test("mutation: a built package listed as not yet built fails", () => {
  expectProblem(swap("detailed", "**Not yet built** (next candidates, per PACKAGES.md §§5–6): ",
    "**Not yet built** (next candidates, per PACKAGES.md §§5–6): `two-kinds-of-walking`; "), /"two-kinds-of-walking" as not yet built/);
});

test("mutation: a package missing from the build history or the DAG line fails", () => {
  const line = DOCS.detailed.match(/^19\. \*\*two-kinds-of-walking\*\*[^\n]*\n/m)[0];
  expectProblem(swap("detailed", line, ""), /build history is/);
  expectProblem(swap("detailed", " → **two-kinds-of-walking**", ""), /DAG line leaves out "two-kinds-of-walking"/);
});

test("mutation: a package that ships without its docs fails (a new expansion package in PACKAGES)", () => {
  const more = { ...PKG, "march-and-waltz": { levels: 9 } };
  // It is still listed as not yet built, has no section, is not named elsewhere, and every count is short.
  for (const re of [/"march-and-waltz" as not yet built/, /packages with no section are/, /opening says 19 expansion/,
    /README's status line says/, /§ 14's heading says/, /build history is/, /DAG line leaves out "march-and-waltz"/])
    expectProblem(DOCS, re, more);
});

test("mutation: a package specified elsewhere but not named in the opening fails", () => {
  expectProblem(swap("detailed", "`two-new-colors` (the ★ milestone", "two-new-colors (the ★ milestone"), /packages with no section are/);
  expectProblem(swap("detailed", "[DESIGN.md](DESIGN.md) §10", "DESIGN.md"), /DESIGN\.md §10's Guided campaign/);
});

test("mutation: a PACKAGES.md pointer to the wrong PACKAGES-DETAILED section fails (tiny-motifs said §14)", () => {
  expectProblem(swap("packages", "*(as-built spec in PACKAGES-DETAILED §15)*", "*(as-built spec in PACKAGES-DETAILED §14)*"),
    /points "tiny-motifs" at PACKAGES-DETAILED §14, which is no package/);
});

test("mutation: README's map row or count drifting fails", () => {
  expectProblem(swap("readme", "specs for most built expansion packages", "specs for every shipped expansion package"), /repository map claims/);
  expectProblem(swap("readme", "**Built & shipped (20 packages", "**Built & shipped (21 packages"), /Current status says 21/);
});
