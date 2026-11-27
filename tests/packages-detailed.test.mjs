// PACKAGES-DETAILED.md's summary claims (TUN-119): which packages it covers and how many are built.
//
// Why a test: CONTRIBUTING.md § 2 sends a newcomer fixing a level to PACKAGES-DETAILED.md, and its summary
// lines went stale in silence — the title claimed "all shipped expansion packages" while two are specified
// in PACKAGES.md § 6, the opening said 14 built and § 14 said 18 while README said 20, and § 14 listed
// `two-kinds-of-walking` as not yet built a month after it shipped. Here every count, list and pointer in
// those summaries is read against the `PACKAGES` object in js/packages.js, the runtime truth, so a package
// that ships without its docs fails. Whether a spec is *right* stays a human review.
//
// The checks are one pure function over the texts and a package table, so each mutation case runs on every
// suite run and must produce the problem it names. The mutations are derived from the live data, never
// from today's numbers, and a truthful release of a made-up package must produce no problem at all — so
// shipping the next package truthfully never breaks this file.
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadGame } from "./harness.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = p => readFileSync(join(root, p), "utf8").replace(/\r\n/g, "\n");   // CRLF checkouts (autocrlf)
const flat = s => s.replace(/\s+/g, " ");                                        // paragraphs may reflow

const g = loadGame();
// Every runtime key, with `hidden` kept: the hidden `studio` entry is the Studio's one-level sandbox, not a
// package, so it is left out of the counts — but it is still a runtime ID, never a "not yet built" one.
const PKG = Object.fromEntries(Object.entries(g.PACKAGES).map(([id, p]) =>
  [id, { hidden: !!p.hidden, levels: p.levels.length, requires: [...(p.requires || [])] }]));

const DOCS = { detailed: read("PACKAGES-DETAILED.md"), packages: read("PACKAGES.md"), readme: read("README.md"),
  contributing: read("CONTRIBUTING.md"), design: read("DESIGN.md") };

// The text under the `## ` heading starting with `title`, heading line included, up to the next `## `.
function section(text, title) {
  const lines = text.split("\n");
  const at = lines.findIndex(l => l.startsWith(`## ${title}`));
  if (at < 0) return "";
  const end = lines.findIndex((l, i) => i > at && l.startsWith("## "));
  return lines.slice(at, end < 0 ? undefined : end).join("\n");
}
const ticked = s => [...s.matchAll(/`([a-z0-9-]+)`/g)].map(m => m[1]);
const same = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function problems(docs, pkg) {
  const out = [];
  const all = Object.keys(pkg).filter(id => !pkg[id].hidden), expansion = all.filter(id => id !== "intro");
  const { detailed, packages, readme, contributing, design } = docs;
  const catalog = section(packages, "6.");                       // PACKAGES.md § 6, the high-level specs
  const catalogHead = id => (catalog.match(new RegExp(`^#### \`${esc(id)}\`[^\n]*`, "m")) || [""])[0];

  // ---- what the file covers ----
  const specs = [...detailed.matchAll(/^## (\d+)\. `([a-z0-9-]+)`/gm)].map(m => ({ n: +m[1], id: m[2] }));
  const specced = [...new Set(specs.map(s => s.id))];
  for (const s of specs) {
    if (!pkg[s.id] || pkg[s.id].hidden || s.id === "intro") out.push(`PACKAGES-DETAILED has a section for "${s.id}", which is not a built expansion package`);
    if (specs.filter(t => t.id === s.id).length > 1) out.push(`PACKAGES-DETAILED has a duplicate section for "${s.id}"`);
    const body = section(detailed, `${s.n}. \`${s.id}\``).split("\n").slice(1).filter(l => l.trim() && l.trim() !== "---");
    if (body.length < 3) out.push(`PACKAGES-DETAILED § ${s.n} ("${s.id}") is an empty spec`);
  }
  const covered = specced.filter(id => expansion.includes(id));
  const elsewhere = expansion.filter(id => !specced.includes(id));

  const title = detailed.split("\n")[0];
  if (/\b(all|every)\b/i.test(title)) out.push(`the title claims every package: ${title}`);
  const opening = flat(detailed.split("\n---\n")[0]);
  const covers = opening.match(/\*\*What this file covers: (\d+) of the (\d+) expansion packages\*\*/);
  if (!covers) out.push("the opening does not say how many expansion packages it covers");
  else {
    if (+covers[1] !== covered.length) out.push(`the opening says it covers ${covers[1]}, it has ${covered.length} expansion package sections`);
    if (+covers[2] !== expansion.length) out.push(`the opening says ${covers[2]} expansion packages, PACKAGES has ${expansion.length}`);
  }
  // Any other count in the opening — an old "all 14 … currently in the game" left behind — must be true too.
  const coversAt = covers ? [opening.indexOf(covers[0]), opening.indexOf(covers[0]) + covers[0].length] : [-1, -1];
  for (const m of opening.matchAll(/\b(\d+) (expansion )?packages\b/g)) {
    if (m.index >= coversAt[0] && m.index < coversAt[1]) continue;       // checked above
    const want = m[2] ? expansion.length : all.length;
    if (+m[1] !== want) out.push(`the opening says "${m[0]}"; PACKAGES has ${want}`);
  }
  const where = opening.match(/\*\*Specified elsewhere:\*\*(.*?)(?=\*\*Status|$)/);
  if (!where) out.push("the opening does not say where the other packages are specified");
  else {
    const named = ticked(where[1].split("[DESIGN.md]")[0]);
    if (!same(named, elsewhere)) out.push(`the opening names [${named}] as specified elsewhere; the packages with no section are [${elsewhere}]`);
    if (!/\[PACKAGES\.md\]\(PACKAGES\.md\) ?§ ?6\b/.test(where[1])) out.push("the opening does not link PACKAGES.md §6");
    if (!/\[DESIGN\.md\]\(DESIGN\.md\) ?§ ?10\b/.test(where[1]) || !/Guided campaign/.test(where[1]))
      out.push("the opening does not link DESIGN.md §10's Guided campaign for the intro");
    const introLevels = where[1].match(/the intro's (\d+) levels/);
    if (!introLevels || +introLevels[1] !== pkg.intro.levels)
      out.push(`the opening's intro level count is not the intro's ${pkg.intro.levels} levels`);
  }
  for (const id of elsewhere) if (!/BUILT ✅/.test(catalogHead(id))) out.push(`"${id}" has no BUILT spec in PACKAGES.md §6`);
  const campaign = section(design, "10.").match(/^- \*\*Guided campaign \((\d+) levels/m);
  if (!campaign) out.push("DESIGN.md §10 has no Guided campaign entry");
  else if (+campaign[1] !== pkg.intro.levels) out.push(`DESIGN.md §10's Guided campaign says ${campaign[1]} levels; the intro has ${pkg.intro.levels}`);

  // ---- how many are built ----
  const status = opening.match(/\*\*Status: (\d+) packages are built\*\* — the intro and (\d+) expansion packages/);
  if (!status) out.push("the opening has no status line");
  else if (+status[1] !== all.length || +status[2] !== expansion.length)
    out.push(`the opening says ${status[1]} built (${status[2]} expansion); PACKAGES has ${all.length} (${expansion.length})`);
  for (const [what, re] of [["README's status line", /\*\*(\d+) packages built\*\* across \d+ regions \(the (\d+)-level intro \+ (\d+) expansion packages/],
    ["README § Current status", /\*\*Built & shipped \((\d+) packages/]]) {
    const m = readme.match(re);
    if (!m) out.push(`${what} has no package count`);
    else if (+m[1] !== all.length || (m[2] && (+m[2] !== pkg.intro.levels || +m[3] !== expansion.length)))
      out.push(`${what} says ${m[1]} packages built; PACKAGES has ${all.length}`);
  }

  // ---- § 14, the build order ----
  const s14 = section(detailed, "14.");
  if (!s14) return [...out, "PACKAGES-DETAILED has no § 14"];
  const head = s14.split("\n")[0];
  const hm = head.match(/— (\d+) EXPANSION PACKAGES BUILT ✅ \(with the intro, (\d+)\)$/);
  if (!hm) out.push(`§ 14's heading has no count, or a dated one: ${head}`);
  else if (+hm[1] !== expansion.length || +hm[2] !== all.length) out.push(`§ 14's heading says ${hm[1]} (${hm[2]}); PACKAGES has ${expansion.length} (${all.length})`);
  const history = [...s14.matchAll(/^(\d+)\. \*\*([a-z0-9-]+)\*\*[^\n]*?(\d{4}-\d\d-\d\d)/gm)];
  if (history.some((m, i) => +m[1] !== i + 1)) out.push("§ 14's build history is not numbered 1, 2, 3, …");
  const built = history.map(m => m[2]);
  if (!same(built, expansion)) out.push(`§ 14's build history is [${built}]; the expansion packages are [${expansion}]`);
  for (const m of history) {
    const stamp = catalogHead(m[2]).match(/BUILT ✅ \((\d{4}-\d\d-\d\d)/) || section(detailed, `${(specs.find(s => s.id === m[2]) || {}).n}. \``).match(/BUILT \((\d{4}-\d\d-\d\d)/);
    if (stamp && stamp[1] !== m[3]) out.push(`§ 14 dates "${m[2]}" ${m[3]}; its BUILT stamp says ${stamp[1]}`);
  }
  // The DAG: one row per package, `- \`id\` ← prereq, prereq`, each exactly its runtime `requires`.
  const rows = new Map();
  for (const m of s14.matchAll(/^- `([a-z0-9-]+)` ← ([^\n]*)$/gm)) {
    if (rows.has(m[1])) out.push(`§ 14's DAG has two rows for "${m[1]}"`);
    rows.set(m[1], m[2].includes("*(none") ? [] : m[2].split(",").map(s => s.trim()).filter(Boolean));
  }
  if (!/^\*\*DAG as built\*\*/m.test(s14)) out.push("§ 14 has no DAG as built");
  for (const id of all) {
    if (!rows.has(id)) { out.push(`§ 14's DAG has no row for "${id}"`); continue; }
    const doc = rows.get(id), run = pkg[id].requires;
    for (const r of run) if (!doc.includes(r)) out.push(`§ 14's DAG is missing the edge ${r} → ${id}`);
    for (const r of doc) if (!run.includes(r)) out.push(`§ 14's DAG has an edge ${r} → ${id} the runtime does not`);
  }
  for (const id of rows.keys()) if (!all.includes(id)) out.push(`§ 14's DAG has a row for "${id}", which is not a built package`);
  // Not yet built: the whole paragraph, each ID a catalog entry with no runtime key (the hidden ones included).
  const from = s14.search(/^\*\*Not yet built\*\*/m);                   // through the paragraph's end
  const notYet = from < 0 ? "" : s14.slice(from).split(/\n\s*\n/)[0];
  const future = ticked(notYet);
  if (!future.length) out.push("§ 14's Not yet built names no package");
  for (const id of future) {
    if (pkg[id]) out.push(`§ 14 lists "${id}" as not yet built, but it is in PACKAGES`);
    else if (!catalogHead(id)) out.push(`§ 14 lists "${id}" as not yet built, but PACKAGES.md §6 has no such package`);
  }

  // ---- the docs that point at it ----
  for (const m of packages.matchAll(/^#### `([a-z0-9-]+)`.*as-built spec in PACKAGES-DETAILED §(\d+)/gm)) {
    const at = specs.find(s => s.n === +m[2]);
    if (!at || at.id !== m[1]) out.push(`PACKAGES.md points "${m[1]}" at PACKAGES-DETAILED §${m[2]}, which is ${at ? `"${at.id}"` : "no package"}`);
  }
  for (const [what, re] of [["PACKAGES.md §3", /\*\*The detailed specs live in `PACKAGES-DETAILED\.md`\*\*[^\n]*/],
    ["PACKAGES.md §6's format note", /^> Format per package:[^\n]*/m]]) {
    const line = (packages.match(re) || [""])[0];
    if (!line) out.push(`${what} does not say which specs live in PACKAGES-DETAILED.md`);
    else if (!same(ticked(line.split("except")[1] || ""), elsewhere)) out.push(`${what}'s exceptions are not [${elsewhere}]`);
  }
  const row = (readme.match(/^\| \*\*`PACKAGES-DETAILED\.md`\*\* \|[^\n]*/m) || [""])[0];
  if (!row || /\b(every|all)( \w+)? expansion package/i.test(row)) out.push(`README's repository map claims it covers every package: ${row}`);
  const level = (contributing.match(/^\| Fix or change a level \|[^\n]*/m) || [""])[0];
  for (const want of ["[`PACKAGES-DETAILED.md`](PACKAGES-DETAILED.md) for most packages", "[`PACKAGES.md`](PACKAGES.md) § 6 for a few others",
    "*Guided campaign* entry in [`DESIGN.md`](DESIGN.md) § 10"])
    if (!level.includes(want)) out.push(`CONTRIBUTING.md § 2's level row no longer says "${want}"`);
  return out;
}

test("PACKAGES-DETAILED.md's summaries agree with PACKAGES, README and PACKAGES.md", () => {
  assert.deepEqual(problems(DOCS, PKG), []);
});

// ---- mutation cases: each is a way the docs drift, and must be caught — all derived from live data ----
const visible = Object.keys(PKG).filter(id => !PKG[id].hidden);
const EXP = visible.length - 1;
const S14 = section(DOCS.detailed, "14.");
const HISTORY = [...S14.matchAll(/^(\d+)\. \*\*([a-z0-9-]+)\*\*[^\n]*\n/gm)];
// Guarded: on docs that have drifted, the first test must report the problems rather than this file crash.
const COVERS = DOCS.detailed.match(/\*\*What this file covers: (\d+) of the (\d+) expansion packages\*\*/) || ["", "0", "0"];
const ELSEWHERE = ticked((flat(DOCS.detailed.split("\n---\n")[0]).match(/\*\*Specified elsewhere:\*\*(.*?)\[DESIGN/) || ["", ""])[1]);

const swap = (docs, key, from, to) => {
  assert.ok(docs[key].includes(from), `mutation anchor missing in ${key}: ${from}`);
  return { ...docs, [key]: docs[key].replace(from, to) };
};
const expectProblem = (docs, re, pkg = PKG) => {
  const found = problems(docs, pkg);
  assert.ok(found.some(p => re.test(p)), `expected a problem matching ${re}, got ${JSON.stringify(found)}`);
};

test("mutation: the stale title, opening and § 14 heading this ticket replaced fail", () => {
  const h = S14.split("\n")[0];
  const title = DOCS.detailed.split("\n")[0];
  expectProblem(swap(DOCS, "detailed", title, "# Tune Garden — Detailed Package Specs (all shipped expansion packages)"), /title claims every/);
  expectProblem(swap(DOCS, "detailed", title, "# Tune Garden — Detailed Package Specs (every shipped expansion package)"), /title claims every/);
  expectProblem(swap(DOCS, "detailed", COVERS[0], COVERS[0].replace(`${COVERS[1]} of`, `${+COVERS[1] - 1} of`)), /opening says it covers/);
  expectProblem(swap(DOCS, "detailed", `**Status: ${visible.length} packages are built**`, `**Status: ${visible.length - 2} packages are built**`), /opening says \d+ built/);
  // A correct status line with the old sentence left behind it.
  expectProblem(swap(DOCS, "detailed", "\n---\n", "\nLast updated: 2026-07-05 — all 14 expansion packages currently in the game are documented here or in PACKAGES.md.\n\n---\n"),
    /opening says "14 expansion packages"/);
  expectProblem(swap(DOCS, "detailed", h, "## 14. Build order & dependencies — 18 EXPANSION PACKAGES BUILT ✅ (as of 2026-07-13)"), /heading has no count, or a dated one/);
});

test("mutation: a reflowed but truthful opening still passes", () => {
  const para = DOCS.detailed.match(/^\*\*What this file covers:[^\n]*/m)[0];
  assert.deepEqual(problems(swap(DOCS, "detailed", para, para.replace(/ of the /, " of\nthe ").replace(/ §6/, "\n§6")), PKG), []);
});

test("mutation: Not yet built naming a built, hidden, continued or unknown package fails", () => {
  const NY = S14.match(/^\*\*Not yet built\*\*[^\n]*/m)[0];
  const built = HISTORY.at(-1)[2];
  expectProblem(swap(DOCS, "detailed", NY, `${NY} \`${built}\`.`), new RegExp(`"${built}" as not yet built, but it is in PACKAGES`));
  expectProblem(swap(DOCS, "detailed", NY, `${NY}\nAlso \`${built}\`.`), new RegExp(`"${built}" as not yet built, but it is in PACKAGES`));
  expectProblem(swap(DOCS, "detailed", NY, `${NY} \`studio\`.`), /"studio" as not yet built, but it is in PACKAGES/);
  expectProblem(swap(DOCS, "detailed", NY, `${NY} \`march-and-walz\`.`), /"march-and-walz" as not yet built, but PACKAGES.md §6 has no such package/);
});

test("mutation: the build history missing a package, or misdating one, fails", () => {
  const last = HISTORY.at(-1);
  expectProblem(swap(DOCS, "detailed", last[0], ""), /build history is/);
  const date = last[0].match(/\d{4}-\d\d-\d\d/)[0];
  expectProblem(swap(DOCS, "detailed", last[0], last[0].replace(date, "2026-01-01")), new RegExp(`dates "${last[2]}" 2026-01-01`));
});

test("mutation: a DAG row missing one direct prerequisite, or missing entirely, fails", () => {
  const id = visible.find(i => PKG[i].requires.length >= 3) || visible.find(i => PKG[i].requires.length >= 2);
  const row = S14.match(new RegExp(`^- \`${id}\` ← [^\\n]*`, "m"))[0];
  const drop = PKG[id].requires[1];
  expectProblem(swap(DOCS, "detailed", row, row.replace(`, ${drop}`, "")), new RegExp(`missing the edge ${drop} → ${id}`));
  expectProblem(swap(DOCS, "detailed", row, row + ", intro-typo"), new RegExp(`edge intro-typo → ${id} the runtime does not`));
  expectProblem(swap(DOCS, "detailed", row + "\n", ""), new RegExp(`DAG has no row for "${id}"`));
});

test("mutation: a duplicate or an empty package section fails", () => {
  const first = DOCS.detailed.match(/^## (\d+)\. `([a-z0-9-]+)`/m);
  expectProblem(swap(DOCS, "detailed", "\n## 14.", `\n## 99. \`${first[2]}\` — again\n\n- one\n- two\n- three\n\n## 14.`), new RegExp(`duplicate section for "${first[2]}"`));
  expectProblem(swap(DOCS, "detailed", "\n## 14.", `\n## 99. \`${ELSEWHERE[0]}\` — claimed\n\n---\n\n## 14.`), /is an empty spec/);
});

test("mutation: a pointer to the wrong place fails — opening, DESIGN §10, PACKAGES §6, CONTRIBUTING", () => {
  expectProblem(swap(DOCS, "detailed", "[DESIGN.md](DESIGN.md) §10", "[DESIGN.md](README.md) §10"), /does not link DESIGN\.md §10/);
  expectProblem(swap(DOCS, "detailed", "[PACKAGES.md](PACKAGES.md) §6", "[PACKAGES.md](PACKAGES.md) §5"), /does not link PACKAGES\.md §6/);
  expectProblem(swap(DOCS, "detailed", `\`${ELSEWHERE[0]}\``, ELSEWHERE[0]), /packages with no section are/);
  const intro = PKG.intro.levels;
  expectProblem(swap(DOCS, "design", `**Guided campaign (${intro} levels`, `**Guided campaign (${intro - 1} levels`), /Guided campaign says/);
  const moved = DOCS.packages.match(new RegExp(`^#### \`${ELSEWHERE.at(-1)}\`[^\\n]*\\n`, "m"))[0];
  expectProblem({ ...swap(DOCS, "packages", moved, ""), packages: DOCS.packages.replace(moved, "") + "\n## 9. Moved\n\n" + moved },
    new RegExp(`"${ELSEWHERE.at(-1)}" has no BUILT spec in PACKAGES.md §6`));
  expectProblem(swap(DOCS, "contributing", "[`PACKAGES.md`](PACKAGES.md) § 6", "[`PACKAGES.md`](DESIGN.md) § 6"), /level row no longer says/);
  const ptr = DOCS.packages.match(/as-built spec in PACKAGES-DETAILED §(\d+)/);
  expectProblem(swap(DOCS, "packages", ptr[0], "as-built spec in PACKAGES-DETAILED §14"), /at PACKAGES-DETAILED §14, which is no package/);
});

test("mutation: README's map row or counts drifting fails", () => {
  expectProblem(swap(DOCS, "readme", "specs for most built expansion packages", "specs for every shipped expansion package"), /repository map claims/);
  expectProblem(swap(DOCS, "readme", `**Built & shipped (${visible.length} packages`, `**Built & shipped (${visible.length + 1} packages`), /Current status says/);
  expectProblem(swap(DOCS, "readme", `+ ${EXP} expansion packages`, `+ ${EXP - 1} expansion packages`), /README's status line says/);
});

// A made-up package shipping: with no doc change every summary must fail; with every doc updated truthfully,
// nothing may — so this file never stands in the way of the next package.
const NEW = "zz-made-up-package";
const released = { ...PKG, [NEW]: { hidden: false, levels: 9, requires: ["intro", HISTORY.at(-1)[2]] } };

test("mutation: a package that ships without its docs fails everywhere it should", () => {
  for (const re of [/packages with no section are/, /opening says \d+ expansion packages, PACKAGES has/, /README's status line says/,
    /README § Current status says/, /§ 14's heading says/, /build history is/, new RegExp(`DAG has no row for "${NEW}"`)])
    expectProblem(DOCS, re, released);
});

test("a package that ships with its docs updated truthfully passes", () => {
  const A = visible.length, n = HISTORY.length;
  let d = DOCS;
  d = swap(d, "detailed", COVERS[0], `**What this file covers: ${+COVERS[1] + 1} of the ${EXP + 1} expansion packages**`);
  d = swap(d, "detailed", `**Status: ${A} packages are built** — the intro and ${EXP} expansion packages`,
    `**Status: ${A + 1} packages are built** — the intro and ${EXP + 1} expansion packages`);
  d = swap(d, "detailed", S14.split("\n")[0], `## 14. Build order & dependencies — ${EXP + 1} EXPANSION PACKAGES BUILT ✅ (with the intro, ${A + 1})`);
  d = swap(d, "detailed", HISTORY.at(-1)[0], `${HISTORY.at(-1)[0]}${n + 1}. **${NEW}** ✅ 2026-12-01 (made up)\n`);
  const lastRow = d.detailed.match(/^- `[a-z0-9-]+` ← [^\n]*\n(?!- `)/m)[0];
  d = swap(d, "detailed", lastRow, `${lastRow}- \`${NEW}\` ← ${released[NEW].requires.join(", ")}\n`);
  d = swap(d, "detailed", "\n## 14.", `\n## 99. \`${NEW}\` — Made Up  ✅ BUILT (2026-12-01)\n\n- one\n- two\n- three\n\n## 14.`);
  d = swap(d, "readme", `**${A} packages built**`, `**${A + 1} packages built**`);
  d = swap(d, "readme", `+ ${EXP} expansion packages`, `+ ${EXP + 1} expansion packages`);
  d = swap(d, "readme", `**Built & shipped (${A} packages`, `**Built & shipped (${A + 1} packages`);
  assert.deepEqual(problems(d, released), []);
});
