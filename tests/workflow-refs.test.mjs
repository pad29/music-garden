// The workflow docs' cross-references resolve: a cold AO worker follows them, and a pointer to a file
// or a section that isn't there leaves it guessing. Checked: backticked file paths, `CLAUDE.md` § <heading>
// references (and bare § <heading> inside CLAUDE.md), `work-ticket` § <n> references, and the rule that
// work-ticket's procedure files qualify every § number (they have no numbered sections of their own).
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const rel = p => join(root, p);
const read = p => readFileSync(rel(p), "utf8").replace(/\r\n/g, "\n");   // CRLF checkouts (autocrlf)
const mdIn = dir => readdirSync(rel(dir)).filter(f => f.endsWith(".md")).map(f => `${dir}/${f}`);

const workTicket = ".claude/skills/work-ticket";
const files = [
  "CLAUDE.md", "AGENTS.md", "README.md", "reviews/README.md",
  ...readdirSync(rel(".claude/skills")).map(s => `.claude/skills/${s}/SKILL.md`).filter(p => existsSync(rel(p))),
  ...mdIn(workTicket).filter(p => !p.endsWith("SKILL.md")),
  ...mdIn(".claude/gpt/briefs"),
];

const flat = text => text.replace(/\s*\n\s*/g, " ");          // references wrap across lines
const headings = (text, level = "##") =>
  [...text.matchAll(new RegExp(`^${level} (.+)$`, "gm"))].map(m => m[1].trim());

test("every backticked file path in the workflow docs exists", () => {
  const missing = [];
  for (const file of files) {
    for (const [, path] of read(file).matchAll(/`([^`\s<>*]+\.(?:md|sh|mjs|json))`/g)) {
      if (/^(\/|[A-Za-z]:)/.test(path) || path.includes("$")) continue;     // absolute, or a variable
      // A bare name (`ask.sh`, `gen-voice.mjs`) is a name, not a path — except inside work-ticket,
      // where a bare `resume.md` means the file beside it. Examples of a naming pattern are skipped.
      if (!path.includes("/") && !file.startsWith(`${workTicket}/`)) continue;
      if (file === "reviews/README.md" && /^reviews\/(TUN-12|2026-09-28-short)/.test(path)) continue;
      const candidates = [rel(path), join(dirname(rel(file)), path), rel(`.claude/gpt/${path}`)];
      if (!candidates.some(existsSync)) missing.push(`${file}: \`${path}\``);
    }
  }
  assert.deepStrictEqual(missing, []);
});

test("every `CLAUDE.md` § reference names a CLAUDE.md heading", () => {
  const claudeHeadings = headings(read("CLAUDE.md"));
  const resolves = ref => claudeHeadings.some(h => ref.startsWith(h) || h.startsWith(ref));
  const bad = [];
  for (const file of files) {
    const text = flat(read(file));
    const refs = [...text.matchAll(/`CLAUDE\.md`\s*§\s*([^,.;:()`*—]+)/g)].map(m => m[1].trim());
    if (file === "CLAUDE.md") refs.push(...[...text.matchAll(/(?<!`[^`]*`\s*)§\s*([A-Z][^,.;:()`*—]+)/g)].map(m => m[1].trim()));
    for (const ref of refs) if (!resolves(ref)) bad.push(`${file}: § ${ref}`);
  }
  assert.deepStrictEqual(bad, []);
});

test("every `work-ticket` § number is a section of work-ticket/SKILL.md", () => {
  const sections = headings(read(`${workTicket}/SKILL.md`)).map(h => h.match(/^(\d+)\./)?.[1]).filter(Boolean);
  const bad = [];
  for (const file of files) {
    for (const [, n] of flat(read(file)).matchAll(/`work-ticket`\s*§\s*(\d+)/g)) {
      if (!sections.includes(n)) bad.push(`${file}: § ${n}`);
    }
  }
  assert.ok(sections.length >= 8, "work-ticket keeps its numbered sections");
  assert.deepStrictEqual(bad, []);
});

test("work-ticket's procedure files qualify every § number they cite", () => {
  const bad = [];
  for (const file of files.filter(f => f.startsWith(`${workTicket}/`) && !f.endsWith("SKILL.md"))) {
    for (const m of flat(read(file)).matchAll(/(.{0,20})§§?\s*\d+/g)) {
      if (!/`(work-ticket|SKILL\.md|file-ticket)`\s*$/.test(m[1])) bad.push(`${file}: …${m[0]}`);
    }
  }
  assert.deepStrictEqual(bad, []);
});

test("the GPT lock is what the docs tell sessions to take, and the old name marker is gone", () => {
  const cost = flat(read("CLAUDE.md")).split("## Cost")[1] ?? "";
  assert.match(cost, /\.claude\/gpt\/gpt-lock\.sh acquire/);
  assert.match(cost, /gpt-lock\.sh release/);
  for (const file of files) {
    assert.doesNotMatch(read(file), /`\[GPT\]` marker/, `${file} still says to take the [GPT] marker`);
  }
});

test("a ticket's size is its Size label and its ## Size section, the larger when they disagree", () => {
  // TUN-74: the label lets the owner filter Todo by size; the section carries the reason. A later edit that
  // drops either, or the tie-break, would leave workers reading the size two ways.
  const section = (file, name) => flat(read(file)).split(/(?:^| )## /).find(s => s.startsWith(name)) ?? "";
  const loop = section("CLAUDE.md", "The loop, by size");
  const opening = flat(read(`${workTicket}/SKILL.md`)).split(" ## 1.")[0];
  const goes = section(".claude/skills/file-ticket/SKILL.md", "Where it goes");
  const size = section(".claude/skills/file-ticket/SKILL.md", "Size — ");
  for (const [where, text] of [["CLAUDE.md § The loop, by size", loop], ["work-ticket's opening", opening],
                               ["file-ticket § Size", size]]) {
    assert.match(text, /`Size` label/, `${where} names the Size label`);
    assert.match(text, /`## Size` section/, `${where} names the ## Size section`);
    // Each rule is matched inside the one clause that states it (no `.` or `;` between its words): a bare
    // "M" or "larger" also occurs in the loop table, the size bullets and "larger than L".
    assert.match(text, /disagree[^.;]*\blarger\b/, `${where} says the larger size wins a disagreement`);
    assert.match(text, /\bneither\b[^.;]*\bM\b/, `${where} says a ticket with neither is M`);
    // Pinned to the words of the rule: a looser match ran on into "as § 4 does for a size", so "either
    // alone means M" passed (GPT's PR review of ebe5bcb).
    assert.match(text, /\b(?:[Ee]ither alone is|only one of them takes) (?:the|that) size\b/,
                 `${where} says either alone is the size`);
  }
  // The tie-break is said in the hand-off: CLAUDE.md and work-ticket's opening address the worker
  // (file-ticket § Size addresses the filer). work-ticket's opening stops before § 4's own wording.
  for (const [where, text] of [["CLAUDE.md § The loop, by size", loop], ["work-ticket's opening", opening]]) {
    assert.match(text, /disagree[^.;]*\blarger\b[^.;]*\bhand-off\b/, `${where} says the hand-off reports a disagreement`);
  }
  assert.match(goes, /One label from the `Size` group[^.]*same letter as the ticket's `## Size` section/,
               "file-ticket § Where it goes requires a Size label matching the ## Size section");
  assert.match(goes, /`addLabels`, never `labels`/, "file-ticket warns that `labels` replaces the set");
  // The template keeps its ## Size block (owner, 2026-11-12), and ties the label to it.
  const template = read(".claude/skills/file-ticket/SKILL.md").match(/```markdown\n([\s\S]*?)\n```/)?.[1] ?? "";
  assert.match(template, /^## Size$/m, "file-ticket's template keeps its ## Size section");
  assert.match(template, /Size label carries the same letter/, "file-ticket's template ties the Size label to it");
  // The hand-off format has a place for the disagreement the rule says it reports.
  const handoffSize = flat(read(`${workTicket}/handoff.md`)).match(/- Size: .*?(?= - Design:)/)?.[0] ?? "";
  assert.match(handoffSize, /`Size` label[^.]*disagree[^.]*larger/, "handoff.md's Size line names a disagreement");
});

test("every `work-ticket` § n step m names a numbered step of that section", () => {
  const skill = read(`${workTicket}/SKILL.md`);
  const steps = n => {
    const body = skill.split(/^## /m).find(s => s.startsWith(`${n}.`)) ?? "";
    return [...body.matchAll(/^(\d+)\. /gm)].map(m => m[1]);
  };
  assert.ok(steps(8).includes("6"), "work-ticket § 8 keeps its numbered steps");
  const bad = [];
  let seen = 0;
  for (const file of files) {
    for (const m of flat(read(file)).matchAll(/`work-ticket`\s*§\s*(\d+),?\s+steps?\s+(\d+)(?:[–-](\d+))?/g)) {
      seen++;
      for (const s of [m[2], m[3]].filter(Boolean)) if (!steps(m[1]).includes(s)) bad.push(`${file}: § ${m[1]} step ${s}`);
    }
  }
  assert.ok(seen >= 3, `the step references are found (${seen})`);
  assert.deepStrictEqual(bad, []);
});
