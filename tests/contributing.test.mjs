// The contributor docs (TUN-92): CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md and the GitHub templates.
//
// Why a test: CONTRIBUTING.md restates AGENTS.md's commands and hard invariants in plain words for people,
// and AGENTS.md changes far from it. Here the commands, the Node versions and the list of invariants are
// read from AGENTS.md itself, so a changed command or a new invariant fails until the guide says it too.
// Whether the plain words are *right* stays a human review — this checks that each obligation is there.
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname, posix } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = p => readFileSync(join(root, p), "utf8").replace(/\r\n/g, "\n");   // CRLF checkouts (autocrlf)
const flat = text => text.replace(/\s*\n\s*/g, " ");                           // phrases wrap across lines

// The text under a `## heading` that starts with `title`, up to the next `## `.
function section(text, title) {
  const at = text.split("\n").findIndex(l => l.startsWith(`## ${title}`));
  assert.ok(at >= 0, `no "## ${title}" section`);
  const rest = text.split("\n").slice(at + 1);
  const end = rest.findIndex(l => l.startsWith("## "));
  return (end < 0 ? rest : rest.slice(0, end)).join("\n");
}

const REPO_URL = "https://github.com/pad29/music-garden";
const ADVISORY_URL = `${REPO_URL}/security/advisories/new`;
const CONTACT = "conduct@tunegarden.game";
const DOCS = ["CONTRIBUTING.md", "CODE_OF_CONDUCT.md", "SECURITY.md", ".github/pull_request_template.md",
  ".github/ISSUE_TEMPLATE/bug.md", ".github/ISSUE_TEMPLATE/idea.md"];

// ---- links ----

// GitHub's heading anchors: lower case, punctuation dropped (backticks, dashes and dots included, but not
// `-` or `_`), each space a hyphen — "Hard invariants — never violate" → "hard-invariants--never-violate".
const slug = h => h.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, "").replace(/ /g, "-");
const anchors = text => new Set([...text.matchAll(/^#{1,6} (.+)$/gm)].map(m => slug(m[1])));

// The targets of inline links, reference definitions (`[name]: target`) and YAML `url:` lines; a
// `<REPO_URL>/blob/main/<path>` link counts as a repository path, any other URL is left to a person.
function links(text) {
  const out = [];
  for (const m of text.matchAll(/\]\(([^)\s]+)\)|^ {0,3}\[[^\]]+\]:\s*(\S+)|\burl: (\S+)/gm)) {
    const t = m[1] ?? m[2] ?? m[3];
    if (t.startsWith(`${REPO_URL}/blob/main/`)) out.push({ path: t.slice(`${REPO_URL}/blob/main/`.length), repo: true });
    else if (!/^[a-z]+:/i.test(t)) out.push({ path: t });
  }
  return out;
}

// Each link in `text` (the contents of `doc`) that lands on no file, or on a file without its anchor.
function brokenLinks(doc, text) {
  const broken = [];
  for (const { path, repo } of links(text)) {
    const [file, anchor] = path.split("#");
    const target = file === "" ? doc : repo ? file : posix.join(dirname(doc), file);
    if (!existsSync(join(root, target))) { broken.push(`${doc} → ${path} (no ${target})`); continue; }
    const headings = file === "" ? anchors(text) : anchors(read(target));
    if (anchor !== undefined && !headings.has(anchor)) broken.push(`${doc} → ${path} (no heading)`);
  }
  return broken;
}

test("every relative link in the contributor docs and templates lands on a file, and every anchor on a heading", () => {
  const broken = [...DOCS, ".github/ISSUE_TEMPLATE/config.yml"].flatMap(doc => brokenLinks(doc, read(doc)));
  assert.deepStrictEqual(broken, []);
});

test("mutation: a broken inline link, reference link, anchor or repository URL is caught", () => {
  const cases = {
    "[guide](missing-contribution-guide.md)": "no missing-contribution-guide.md",
    "[guide][missing]\n\n[missing]: missing-contribution-guide.md": "no missing-contribution-guide.md",
    "[readme][r]\n\n[r]: README.md#no-such-heading": "(no heading)",
    "[readme](README.md#no-such-heading)": "(no heading)",
    "[here](#no-such-section)": "(no heading)",
    [`url: ${REPO_URL}/blob/main/NO-SUCH-FILE.md`]: "no NO-SUCH-FILE.md",
  };
  for (const [text, says] of Object.entries(cases)) {
    const broken = brokenLinks("CONTRIBUTING.md", `# Contributing\n\n${text}\n`);
    assert.ok(broken.length === 1 && broken[0].includes(says), `${JSON.stringify(text)} → ${broken}`);
  }
  assert.deepStrictEqual(brokenLinks("CONTRIBUTING.md", "[ok][r]\n\n[r]: README.md#quick-start\n"), []);
});

test("the GitHub advisory form is linked by its full URL, never as a relative path into the file tree", () => {
  for (const doc of ["SECURITY.md", ".github/ISSUE_TEMPLATE/config.yml"]) {
    assert.ok(read(doc).includes(ADVISORY_URL), `${doc} links ${ADVISORY_URL}`);
  }
  for (const doc of DOCS) {
    assert.ok(!/\]\((?!https:)[^)]*security\/advisories/.test(read(doc)), `${doc} has a relative advisory link`);
  }
});

// ---- the commands and the Node versions, read from AGENTS.md ----

const agents = read("AGENTS.md");
const guide = read("CONTRIBUTING.md");

function agentsCommands() {
  const cmds = section(agents, "Commands");
  const fenced = [...cmds.matchAll(/```bash\n([\s\S]*?)```/g)]
    .flatMap(m => m[1].split("\n")).map(l => l.replace(/\s+#.*$/, "").trim()).filter(Boolean);
  const serve = cmds.match(/Serve locally: `([^`]+)`/);
  assert.ok(serve, "AGENTS.md § Commands names a serve command");
  return [...fenced, serve[1]];
}

test("CONTRIBUTING.md gives every command in AGENTS.md § Commands verbatim, in a code block", () => {
  const blocks = [...guide.matchAll(/```bash\n([\s\S]*?)```/g)].flatMap(m => m[1].split("\n")).map(l => l.trim());
  const cmds = agentsCommands();
  assert.ok(cmds.length >= 3, `found ${cmds.length} commands in AGENTS.md`);
  for (const c of cmds) assert.ok(blocks.includes(c), `CONTRIBUTING.md has no code line \`${c}\``);
});

test("the Node versions in CONTRIBUTING.md and MAKING-QUESTS.md match AGENTS.md's minimums and CI's version", () => {
  const min = agents.match(/Node (\d+\.\d+)\+ or (\d+\.\d+)\+/);
  assert.ok(min, "AGENTS.md states the Node minimums");
  const ci = read(".github/workflows/checks.yml").match(/node-version: (\d+)/);
  assert.ok(ci, "the CI workflow pins a Node version");
  for (const doc of ["CONTRIBUTING.md", "MAKING-QUESTS.md"]) {
    const text = flat(read(doc));
    for (const v of [min[1], min[2], `Node ${ci[1]}`]) assert.ok(text.includes(v), `${doc} says ${v}`);
  }
  assert.ok(!read("MAKING-QUESTS.md").includes("any current version"), "MAKING-QUESTS.md still says any version will do");
});

// ---- the hard invariants ----

// Each AGENTS.md hard invariant, by its bold opening, → what CONTRIBUTING.md § 3 must say for it. A new or
// reworded invariant fails "every invariant is mapped" until a person maps it here and writes it there.
const INVARIANTS = {
  "No `fetch()` / XHR for local assets.":
    [/It works from a file/, /never uses `fetch\(\)` or XHR/, /classic scripts, never ES modules/, /cloud API over https are fine/],
  "The page makes no third-party requests":
    [/No third-party requests/, /copied into `vendor\/` as released/, /`vendor\/SHA256SUMS`/,
      /the game.s own backend and its sign-in service/, /content security policy \(`_headers`\)/, /inline scripts, `eval`/],
  "Never hand-edit generated files:":
    [/Never hand-edit generated files/, /`samples\/<instr>\.js`/, /`voice\/\*\.mp3`/, /`site\/`/, /`backend\/\.aws-sam\/`/],
  "Package and level IDs are stable slugs — never renumber or rename them.":
    [/Never rename or renumber a package or level ID/, /Saved progress/],
  "`FAMOUS` melodies are score-validated.":
    [/Famous melodies are never rewritten/, /`FAMOUS`/, /checked against a real score/, /may shorten one/, /"fix" it by ear/],
  "The crafting toolbox is per-package, never global.":
    [/crafting toolbox belongs to each package/],
  "The backend refuses what it doesn't know.":
    [/backend refuses what it doesn't know/, /`backend\/src\/validate\.mjs` in the same pull request/, /backend is deployed before the game/],
  "Any new runtime asset folder must be added to the build, `cloudflare-build.sh`":
    [/new runtime asset folder goes in the build/, /`cloudflare-build\.sh`/, /cache rule in `_headers`/],
  "Never push to `main` or merge a PR unless the owner explicitly asks.":
    [/Only the owner merges/, /every push to `main` deploys/],
};

const invariantKeys = agentsText =>
  [...section(agentsText, "Hard invariants").matchAll(/^- \*\*(.+?)\*\*/gm)].map(m => m[1]);

// Every obligation that is not met: an invariant with no entry in INVARIANTS, or a phrase § 3 lacks.
function missingObligations(guideText, agentsText) {
  const rules = flat(section(guideText, "3. Rules the code must keep"));
  const missing = [];
  for (const key of invariantKeys(agentsText)) {
    if (!INVARIANTS[key]) { missing.push(`unmapped invariant: ${key}`); continue; }
    for (const re of INVARIANTS[key]) if (!re.test(rules)) missing.push(`${key} → ${re}`);
  }
  for (const key of Object.keys(INVARIANTS)) {
    if (!invariantKeys(agentsText).includes(key)) missing.push(`mapped but no longer in AGENTS.md: ${key}`);
  }
  return missing;
}

test("every AGENTS.md hard invariant is mapped, and CONTRIBUTING.md § 3 says each of its obligations", () => {
  assert.ok(invariantKeys(agents).length >= 9, "AGENTS.md § Hard invariants has its bullets");
  assert.deepStrictEqual(missingObligations(guide, agents), []);
  assert.ok(section(guide, "3. Rules the code must keep").includes("(AGENTS.md#hard-invariants--never-violate)"),
    "§ 3 links AGENTS.md § Hard invariants as the authority");
});

test("mutation: an obligation dropped from the guide, or a new invariant in AGENTS.md, fails the check", () => {
  const rules = section(guide, "3. Rules the code must keep");
  for (const [key, patterns] of Object.entries(INVARIANTS)) {
    for (const re of patterns) {
      const said = flat(rules).match(re)[0];
      // The phrase as it sits in § 3, wherever it wraps; removed from § 3 only (some recur in later sections).
      const wrapped = new RegExp(said.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+"));
      assert.match(rules, wrapped);
      const mutated = guide.replace(rules, rules.replace(wrapped, ""));
      assert.ok(missingObligations(mutated, agents).some(m => m.startsWith(key)), `dropping "${said}" is caught`);
    }
  }
  const added = agents.replace("- **The crafting toolbox", "- **Never ship on a Friday.** Ever.\n- **The crafting toolbox");
  assert.ok(missingObligations(guide, added).includes("unmapped invariant: Never ship on a Friday."));
  const removed = agents.replace(/^- \*\*The crafting toolbox.*$/m, "");
  assert.ok(missingObligations(guide, removed).some(m => m.startsWith("mapped but no longer")));
});

// ---- the code of conduct and the contacts ----

// SHA-256 of the Contributor Covenant 2.1, https://www.contributor-covenant.org/version/2/1/code_of_conduct/
// code_of_conduct.md as fetched 2026-11-19 (5,480 bytes, LF), with its leading and trailing blank lines
// trimmed to one final newline. Only the contact may differ.
const COVENANT_21 = "369bf7301883368fc19203bd0f1233fed2b83f0378ad19c4d0708bf61925339b";

test("CODE_OF_CONDUCT.md is the Contributor Covenant 2.1 verbatim, with only the contact filled in", () => {
  const coc = read("CODE_OF_CONDUCT.md");
  assert.strictEqual(coc.split(CONTACT).length - 1, 1, `the contact ${CONTACT} appears once`);
  const original = coc.replace(CONTACT, "[INSERT CONTACT METHOD]");
  assert.strictEqual(createHash("sha256").update(original).digest("hex"), COVENANT_21);
});

test("SECURITY.md and CONTRIBUTING.md name the chosen contact, and no other address is published", () => {
  assert.ok(read("SECURITY.md").includes(CONTACT), "SECURITY.md gives the alias as its fallback");
  assert.ok(flat(section(guide, "9. Conduct and security")).includes(CONTACT), "CONTRIBUTING.md § 9 names it");
  const allowed = new Set([CONTACT, "you@example.com"]);
  for (const doc of [...DOCS, ".github/ISSUE_TEMPLATE/config.yml"]) {
    for (const [addr] of read(doc).matchAll(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g)) {
      assert.ok(allowed.has(addr), `${doc} publishes ${addr}`);
    }
  }
});

// ---- the templates ----

test("the pull request template asks for the sign-off, both checks from AGENTS.md, and what the owner must do", () => {
  const t = read(".github/pull_request_template.md");
  assert.ok(t.includes("Signed-off-by:") && t.includes("https://developercertificate.org/"));
  for (const c of agentsCommands().slice(0, 2)) assert.ok(t.includes(c), `the template names \`${c}\``);
  for (const need of ["Narration clips", "backend deploy", "famous melody"]) assert.ok(t.includes(need), need);
});

// Each issue template: its front matter, and the prompts its body must keep — a bug report needs the steps
// to reproduce it, an idea what the player would experience and whether its author will build it.
const TEMPLATES = {
  "bug.md": { name: "Bug", prompts: ["**What happened**", "**How to make it happen again**", "**Where**",
    "**Browser and device**", "git rev-parse --short HEAD", "SECURITY.md"] },
  "idea.md": { name: "Idea", prompts: ["**What kind**", "- [ ] A quest", "- [ ] A level in an existing package",
    "- [ ] A new package", "**What the player would experience**", "**Will you build it?**", "owner's yes"] },
};

function templateProblems(file, text) {
  const { name, prompts } = TEMPLATES[file];
  const front = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!front) return [`${file}: no front matter`];
  const problems = [];
  if (!new RegExp(`^name: ${name}$`, "m").test(front[1])) problems.push(`${file}: name is not ${name}`);
  if (!/^about: \S.*$/m.test(front[1])) problems.push(`${file}: no about`);
  for (const p of prompts) if (!front[2].includes(p)) problems.push(`${file}: body lacks ${p}`);
  return problems;
}

test("the issue chooser offers Bug and Idea, with blank issues off and the security and guide links", () => {
  const dir = ".github/ISSUE_TEMPLATE";
  assert.deepStrictEqual(readdirSync(join(root, dir)).sort(), ["bug.md", "config.yml", "idea.md"]);
  for (const file of Object.keys(TEMPLATES)) assert.deepStrictEqual(templateProblems(file, read(`${dir}/${file}`)), []);
  const config = read(`${dir}/config.yml`);
  assert.match(config, /^blank_issues_enabled: false$/m);
  assert.ok(config.includes(`url: ${ADVISORY_URL}`) && config.includes(`url: ${REPO_URL}/blob/main/CONTRIBUTING.md`));
});

test("mutation: an issue template with its body emptied, or one prompt dropped, fails", () => {
  for (const [file, { prompts }] of Object.entries(TEMPLATES)) {
    const text = read(`.github/ISSUE_TEMPLATE/${file}`);
    const emptied = text.replace(/(\n---\n)[\s\S]*$/, "$1");
    assert.strictEqual(templateProblems(file, emptied).length, prompts.length, `${file} emptied`);
    for (const p of prompts) {
      assert.deepStrictEqual(templateProblems(file, text.replace(p, "")), [`${file}: body lacks ${p}`], `${file} without ${p}`);
    }
  }
});

// ---- the pointers ----

test("the README's Contribute line, AGENTS.md and MAKING-QUESTS.md point at the contributor docs", () => {
  const contribute = read("README.md").split("\n").find(l => l.startsWith("**Contribute:**"));
  assert.ok(contribute, "README has its Contribute line");
  for (const f of ["CONTRIBUTING.md", "CODE_OF_CONDUCT.md", "SECURITY.md"]) {
    assert.ok(contribute.includes(`](${f})`), `the Contribute line links ${f}`);
    assert.ok(section(agents, "Where to find things").includes(`\`${f}\``), `AGENTS.md points at ${f}`);
  }
  assert.ok(read("MAKING-QUESTS.md").includes("`CONTRIBUTING.md`"), "MAKING-QUESTS.md points at CONTRIBUTING.md");
  assert.ok(guide.includes("](MAKING-QUESTS.md)"), "CONTRIBUTING.md's reading path links MAKING-QUESTS.md");
});
