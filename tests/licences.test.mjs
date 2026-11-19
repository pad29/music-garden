// The licences and the credits (TUN-89): LICENSE is the AGPL-3.0 text, unaltered; CREDITS.md credits every
// famous tune and every sampled voice the game ships, with each field filled in; the licence files' links
// resolve; and the map footer still credits the two CC BY packs and links CREDITS.md.
//
// Why a test: a new FAMOUS tune or sampled voice is added in js/, far from CREDITS.md, and nothing else would
// notice it shipped uncredited. Whether a credit is *right* stays a human review — this checks it exists.
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { ROOT } from "./helpers/game-scripts.mjs";
import { loadGame } from "./harness.mjs";

// LF, as git stores them; a Windows checkout may hold CRLF (.gitattributes: text=auto).
const read = (p) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");

// SHA-256 of https://www.gnu.org/licenses/agpl-3.0.txt as fetched 2026-11-19 (34,523 bytes, LF endings).
// A changed clause, a dropped section or a line added on top (a copyright header) all change it.
const AGPL_SHA256 = "0d96a4ff68ad6d4b6f1f30f713b18d5184912ba8dd389f86aa7710db079abcb0";

test("LICENSE is the GNU AGPL-3.0 text, byte for byte once line endings are LF", () => {
  const text = read("LICENSE");
  assert.ok(text.startsWith("                    GNU AFFERO GENERAL PUBLIC LICENSE\n"), "nothing above the licence's title");
  assert.strictEqual(createHash("sha256").update(text, "utf8").digest("hex"), AGPL_SHA256);
});

// The rows of the Markdown table under a `## heading` (up to the next `## `), as arrays of trimmed cells.
function tableRows(md, heading) {
  const start = md.indexOf("\n## " + heading + "\n");
  assert.ok(start >= 0, "CREDITS.md has a section: " + heading);
  const end = md.indexOf("\n## ", start + 1);
  const section = md.slice(start, end < 0 ? undefined : end);
  const rows = section.split("\n").filter((l) => l.startsWith("|")).map((l) => l.slice(1, -1).split("|").map((c) => c.trim()));
  assert.ok(rows.length > 2, heading + " has a table");
  return { header: rows[0], body: rows.slice(2) };
}

const CREDITS = read("CREDITS.md");
const g = loadGame();

test("every FAMOUS tune has one row in CREDITS.md, with work, composer, year, status and a source", () => {
  const { header, body } = tableRows(CREDITS, "Famous melodies");
  assert.deepEqual(header, ["Key", "Work", "Composer or source", "Year", "Status", "Source"]);
  const keys = Object.keys(g.FAMOUS).filter((k) => !k.startsWith("__"));
  assert.ok(keys.length >= 18, "FAMOUS loaded");
  const byKey = new Map();
  for (const row of body) {
    const key = row[0].replace(/`/g, "");
    assert.ok(!byKey.has(key), "one row per tune: " + key);
    byKey.set(key, row);
  }
  for (const key of keys) {
    const row = byKey.get(key);
    assert.ok(row, "CREDITS.md credits FAMOUS." + key);
    assert.strictEqual(row.length, header.length, key + ": every column");
    row.forEach((cell, i) => assert.ok(cell.length > 0, `${key}: ${header[i]} is filled in`));
    assert.match(row[5], /\]\(https?:\/\//, key + ": the source is a link");
  }
  for (const key of byKey.keys()) assert.ok(keys.includes(key), "no row for a tune the game does not ship: " + key);
});

test("every sampled voice has one row in CREDITS.md, with pack, author, licence, source and changes", () => {
  const { header, body } = tableRows(CREDITS, "Instrument samples");
  assert.deepEqual(header, ["Voice", "Pack", "By", "Licence", "Source", "What we changed"]);
  const voices = Object.keys(g.SAMPLED);
  assert.ok(voices.length >= 7, "SAMPLED loaded");
  assert.deepEqual(body.map((r) => r[0]).sort(), [...voices].sort());
  for (const row of body) {
    assert.strictEqual(row.length, header.length, row[0] + ": every column");
    row.forEach((cell, i) => assert.ok(cell.length > 0, `${row[0]}: ${header[i]} is filled in`));
    assert.match(row[3], /^\[(CC BY \d\.\d|CC0 1\.0)\]\(https:\/\/creativecommons\.org\//, row[0] + ": a licence with its version and link");
  }
});

// Relative links only: an external URL is checked by a person, not by the suite.
test("the relative links in the licence files and the README's Licence line resolve", () => {
  const readmeLicence = read("README.md").split("\n").find((l) => l.startsWith("**Licence:**"));
  assert.ok(readmeLicence, "README has its one Licence line");
  assert.strictEqual(read("README.md").split("\n").filter((l) => l.startsWith("**Licence:**")).length, 1, "one Licence line, not two");
  for (const [file, text] of [["CREDITS.md", CREDITS], ["LICENSE-CC-BY-SA.md", read("LICENSE-CC-BY-SA.md")], ["README.md", readmeLicence]]) {
    const targets = [...text.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]).filter((t) => !/^[a-z]+:/.test(t));
    assert.ok(targets.length > 0, file + " links something");
    for (const t of targets) {
      const path = t.split("#")[0];
      if (path) assert.ok(existsSync(join(ROOT, dirname(file), path)), `${file} links ${t}, which exists`);
    }
  }
});

test("the README's Licence line names both licences and links both licence files", () => {
  const line = read("README.md").split("\n").find((l) => l.startsWith("**Licence:**"));
  assert.match(line, /\[GNU AGPL-3\.0-or-later\]\(LICENSE\)/);
  assert.match(line, /\[CC BY-SA 4\.0\]\(LICENSE-CC-BY-SA\.md\)/);
  assert.match(line, /\[CREDITS\.md\]\(CREDITS\.md\)/);
});

test("the map footer still credits both CC BY packs, with their versions, and links CREDITS.md", () => {
  const home = read("js/home.js");
  const at = home.indexOf('cred.className="mapcred"');
  assert.ok(at >= 0, "the footer is built in js/home.js");
  const block = home.slice(at, home.indexOf("pkglist.appendChild(cred)", at));
  assert.match(block, /Salamander Grand Piano by Alexander Holm \(CC BY 3\.0\)/);
  assert.match(block, /Etherealwinds Harp II CE by [^"]*\(CC BY 4\.0\)/);
  assert.match(block, /\.href="CREDITS\.md"/);
});
