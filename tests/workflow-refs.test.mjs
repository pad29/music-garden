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
const read = p => readFileSync(rel(p), "utf8");
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
