// TUN-93: the garden-name and passphrase generators (js/garden-words.js) and the backend's copy of the name lists
// (backend/src/garden-words.mjs). A garden name is public — a friend who opens a shared song sees it — so every
// name the generator can make is enumerated here, not sampled, and checked; so is every pair of passphrase words
// a card can show side by side. The blocklists are a safety net: the real guarantee is that every word was
// hand-picked and the owner approved the lists (reviews/TUN-93-garden-name-accounts.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { webcrypto } from "node:crypto";
import { loadGame } from "./harness.mjs";
import { ROOT } from "./helpers/game-scripts.mjs";
import * as B from "../backend/src/garden-words.mjs";

const g = loadGame();
const ADJ = [...g.GARDEN_ADJECTIVES], NOUN = [...g.GARDEN_NOUNS], NUM = [...g.GARDEN_NUMBERS], WORDS = [...g.PASSPHRASE_WORDS];
const BANNED = [...g.GARDEN_BANNED_PAIRS];

// The blocklists, ROT13-encoded so this public file does not spell them out. rot13() decodes them.
const rot13 = s => s.replace(/[a-z]/g, c => String.fromCharCode((c.charCodeAt(0) - 97 + 13) % 26 + 97));
// Substrings: crude and sexual words, slurs, hate, violence, drugs and insults.
const BLOCKED = ["nefr", "nff", "nany", "nahf", "ovgpu", "obbo", "ohgg", "pbpx", "penc", "phz", "qnza", "qvpx", "qvyqb", "snt",
  "sneg", "shpx", "uryy", "ubzb", "ubeal", "wvmm", "xvax", "xabo", "zvys", "anmv", "avtt", "ahqr", "betl", "cravf",
  "cvff", "cbb", "cbbc", "cbea", "cevpx", "chor", "chff", "encr", "erpghz", "fpebg", "frzra", "frk", "fuvg",
  "fyhg", "fzhg", "fchax", "gvg", "gheq", "gjng", "gjvax", "intvan", "jnax", "juber", "yrm", "qlxr", "genaal",
  "ergneq", "fcnm", "pbba", "puvax", "tbbx", "xvxr", "fcvp", "jbc", "cnxv", "qnexvr", "ubaxl", "arteb", "xxx",
  "uvgyre", "urvy", "vfvf", "wvunq", "xvyy", "qrnq", "qrngu", "oybbq", "tha", "xavsr", "obzo", "qeht", "jrrq",
  "penpx", "zrgu", "pbxr", "orre", "jvar", "ibqxn", "obbmr", "qehax", "fzbxr", "cbvfba", "fynir", "ungr", "htyl",
  "sng", "fghcvq", "qhzo", "vqvbg", "ybfre", "ones", "ibzvg", "crr", "ubr", "wnc", "gubg", "fvzc", "vapry"].map(rot13);
// Two-word phrases with a crude, racist or alarming meaning.
const PHRASES = new Set(["whatyr ohaal", "zbba pevpxrg", "cbpxrg ebpxrg", "zhfuebbz pybhq", "cbepu zbaxrl", "gne onol", "pnzry gbr",
  "tbyqra fubjre", "pbggba cvpxre", "orrs phegnva", "zhssva gbc", "fhtne qnqql", "grn ont", "fghq zhssva",
  "punfvat qentba", "frk xvggra", "ubarl cbg", "wryyl ebyy", "pernz cvr", "oebja rlr", "oyhr jnssyr", "fabj ohaal",
  "qentba ynql", "cvyybj cevaprff", "jvmneq fyrrir", "gebhfre fanxr", "evpr ebpxrg", "fnaq avawn", "ahg wbo",
  "eht eng", "qveg ont", "fphz ont"].map(rot13));
// Whole list words that contain a blocked string and were read and kept: [word, the string it contains].
const REVIEWED = [["butterfly", rot13("ohgg")]];

test("the lists: sizes, no repeats, lower-case letters only, short passphrase words", () => {
  assert.equal(ADJ.length, 64); assert.equal(NOUN.length, 64); assert.equal(WORDS.length, 256);
  for (const [what, list] of [["adjectives", ADJ], ["nouns", NOUN], ["passphrase words", WORDS]]) {
    assert.equal(new Set(list).size, list.length, `${what}: no repeats`);
    for (const w of list) assert.match(w, /^[a-z]{2,}$/, `${what}: ${w}`);
  }
  for (const w of WORDS) assert.ok(w.length <= 8, `${w}: at most 8 letters, to copy by hand`);
  assert.deepEqual(NUM, Array.from({ length: 90 }, (_, i) => i + 10).filter(n => ![12, 13, 14, 18, 28, 33, 38, 43, 69, 83, 88].includes(n)));
  assert.equal(NUM.length, 79);
  assert.deepEqual(BANNED.sort(), ["cozy-bear", "dancing-bear", "fancy-bear", "silver-fox", "sleepy-bear"]);
  for (const p of BANNED) { const [a, n] = p.split("-"); assert.ok(ADJ.includes(a) && NOUN.includes(n), `${p} is a pair the lists could make`); }
});

test("every name the generator can make is counted and checked: 323,189 of them, in both copies of the rule", () => {
  let count = 0;
  for (const a of ADJ) for (const n of NOUN) {
    const banned = BANNED.includes(`${a}-${n}`);
    for (let num = 0; num <= 100; num++) {
      const id = `${a}-${n}-${num}`, want = !banned && NUM.includes(num);
      assert.equal(g.isGardenName(id), want, id);
      assert.equal(B.isGardenName(id), want, `backend: ${id}`);
      if (want) count++;
    }
  }
  assert.equal(count, (64 * 64 - 5) * 79);
  assert.equal(count, 323189);
  for (const id of ["Brave-Otter-42", "brave-otter-042", "brave-otter-05", " brave-otter-42", "brave-otter-42 ", "brave_otter_42",
    "otter-brave-42", "brave-otter", "brave-otter-42-1", "", null, undefined, 42, "brave-otter-٤٢"]) {
    assert.equal(g.isGardenName(id), false, String(id)); assert.equal(B.isGardenName(id), false, `backend: ${String(id)}`);
  }
});

test("the backend's name lists are the game's, word for word", () => {
  assert.deepEqual([...B.ADJECTIVES], ADJ);
  assert.deepEqual([...B.NOUNS], NOUN);
  assert.deepEqual([...B.NUMBERS], NUM);
  assert.deepEqual([...B.BANNED_PAIRS].sort(), BANNED.sort());
});

test("no word holds a blocked string, unless it was read and kept; no name makes one across its join", () => {
  const holds = w => BLOCKED.filter(b => w.includes(b));
  const kept = new Map(REVIEWED);
  for (const w of [...ADJ, ...NOUN, ...WORDS]) {
    const hit = holds(w).filter(b => kept.get(w) !== b);
    assert.deepEqual(hit, [], `${w} holds a blocked string`);
  }
  for (const a of ADJ) for (const n of NOUN) {
    const joined = a + n;   // what a reader sees with the hyphen ignored
    for (const b of BLOCKED) {
      for (let i = joined.indexOf(b); i !== -1; i = joined.indexOf(b, i + 1))
        assert.ok(i + b.length <= a.length || i >= a.length, `${a}-${n}: a blocked string spans the join`);
    }
  }
});

test("no two passphrase words side by side make a blocked phrase: all 65,536 ordered pairs", () => {
  let pairs = 0;
  for (const a of WORDS) for (const b of WORDS) { pairs++; assert.ok(!PHRASES.has(`${a} ${b}`), "a blocked phrase can appear on a card"); }
  assert.equal(pairs, 65536);
  // The pairs GPT's design review found are gone because one word of each is: say so, so a list edit cannot bring one back.
  for (const p of PHRASES) { const [a, b] = p.split(" "); assert.ok(!(WORDS.includes(a) && WORDS.includes(b)), "a blocked phrase can be made"); }
});

test("names are made from the lists, never a banned pair; the number is redrawn alone", () => {
  // pick() is handed the size of the list it draws from: feed it a script of indexes.
  const script = xs => { let i = 0; return n => { const v = xs[i++]; assert.ok(v < n, `index ${v} for a list of ${n}`); return v; }; };
  const silver = ADJ.indexOf("silver"), fox = NOUN.indexOf("fox"), brave = ADJ.indexOf("brave"), otter = NOUN.indexOf("otter");
  assert.equal(g.rollGardenName(script([silver, fox, brave, otter, NUM.indexOf(42)])), "brave-otter-42", "silver-fox is drawn again");
  assert.equal(g.rollGardenNumber(script([0])), 10);
  assert.deepEqual([...g.rollPassphrase(script([0, 0, 255, 7]))], ["acorn", "acorn", "zipper", WORDS[7]], "four independent draws; a word may repeat");
});

test("pick() is uniform: values that would favour some answers are thrown away and drawn again", () => {
  const values = xs => { let i = 0; return () => xs[i++]; };
  const limit = n => 2 ** 32 - (2 ** 32 % n);
  for (const n of [64, 256]) {   // a power of two divides 2^32: every value is kept
    const pick = g.gardenPicker(values([2 ** 32 - 1, 5]));
    assert.equal(pick(n), (2 ** 32 - 1) % n, `n=${n}`);
  }
  for (const n of [3, 79, 100, 4091]) {
    const draws = [limit(n), 2 ** 32 - 1, n + 3];   // the first two are in the incomplete last run of n
    const src = values(draws); let used = 0;
    const pick = g.gardenPicker(() => { used++; return src(); });
    assert.equal(pick(n), (n + 3) % n, `n=${n}`);
    assert.equal(used, 3, `n=${n}: two values rejected`);
    assert.equal(g.gardenPicker(values([limit(n) - 1]))(n), (limit(n) - 1) % n, `n=${n}: the last value kept`);
  }
});

test("with the browser's real randomness: 20,000 rolls are all names the lists allow, and words from the list", () => {
  const ctx = { Object, Array, String, Math, Number, Uint32Array, crypto: webcrypto };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(join(ROOT, "js", "garden-words.js"), "utf8") + "\nthis.api={rollGardenName,rollPassphrase,isGardenName};", ctx);
  const seen = new Set();
  for (let i = 0; i < 20000; i++) {
    const id = ctx.api.rollGardenName(); assert.ok(ctx.api.isGardenName(id), id); seen.add(id.split("-")[0]);
    for (const w of ctx.api.rollPassphrase()) assert.ok(WORDS.includes(w), w);
  }
  assert.equal(seen.size, 64, "every adjective turns up");
});

test("the passphrase's strength: 256 words, four drawn independently, 32 bits", () => {
  assert.equal(Math.log2(WORDS.length ** 4), 32);
});

test("sign-in forgives capitals, spaces, hyphens and underscores in both boxes, by the name's shape, not today's lists", () => {
  const pair = (n, p) => ({ ...g.signInPair(n, p) });
  const want = { username: "brave-otter-42", password: "acorn-map-tulip-wren" };
  for (const [n, p] of [["Brave-Otter-42", "acorn map tulip wren"], ["  brave otter 42", "Acorn Map Tulip Wren"],
    ["BRAVE_OTTER-42", "ACORN-MAP-TULIP-WREN"], ["Brave  -  Otter 42 ", "  acorn   map_tulip--wren  "],
    ["brave\totter–42", "acorn‐map—tulip wren"]])
    assert.deepEqual(pair(n, p), want, JSON.stringify([n, p]));
  assert.deepEqual(pair("Ancient-Walrus-07", "Old Words Here Now"), { username: "ancient-walrus-07", password: "old-words-here-now" },
    "a card stays good if a word is ever retired from the lists");
  // Not shaped like a garden name: the owner's old test accounts (until TUN-101), sent exactly as typed.
  assert.deepEqual(pair("  Pasha ", " My Password1 "), { username: "Pasha", password: " My Password1 " });
  assert.deepEqual(pair("pasha-1", "x"), { username: "pasha-1", password: "x" });
  assert.deepEqual(pair("", ""), { username: "", password: "" });
  assert.equal(g.gardenDisplayName("brave-otter-42"), "Brave-Otter-42");
  assert.equal(g.gardenDisplayName("Pasha"), "Pasha", "an old account's name is shown as it is");
});

test("the passphrase is never stored: neither the generator nor the card touches storage", () => {
  for (const f of ["garden-words.js", "garden-card.js"]) {
    const src = readFileSync(join(ROOT, "js", f), "utf8").replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(src, /localStorage|sessionStorage|indexedDB|Store\.|document\.cookie|fetch\(/, f);
  }
});
