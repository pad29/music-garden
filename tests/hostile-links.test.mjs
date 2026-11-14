// TUN-84 — a link is something a stranger can send a child. These pin the three things a hostile link
// could do: freeze the tab with a huge song, erase a garden through ?reset, and run script through a title.
import { test } from "node:test";
import assert from "node:assert";
import { loadGame } from "./harness.mjs";

// A tiny recording DOM for the elements a title can reach. The harness's stubs swallow every write, so
// without these a title test could not see what the game put on the page. An innerHTML write is where a
// browser would create elements, so every one is recorded and its tags read back.
const htmlWrites = [];
function el(tag, id) {
  let text = "", html = "";
  const e = {
    tag, id, children: [], className: "", style: {}, dataset: {}, onclick: null,
    get textContent() { return text; }, set textContent(v) { text = String(v); e.children = []; },
    get innerHTML() { return html; },
    set innerHTML(v) { html = String(v); htmlWrites.push({ on: id || tag, html }); e.children = []; },
    appendChild(c) { e.children.push(c); c.parent = e; return c; },
    remove() { if (e.parent) e.parent.children = e.parent.children.filter(x => x !== e); },
    addEventListener() {}, removeEventListener() {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  };
  return e;
}
const status = el("div", "status"), mlist = el("div", "mlist");
const g = loadGame({ fresh: true, elements: { status, mlist } });
Object.defineProperty(g.__document, "createElement", {
  value: tag => el(String(tag).toLowerCase()), configurable: true });
g.start = () => {};   // playSong starts the loop; no audio clock here

const TITLE = '<img src=x onerror="globalThis.pwned=1">';
const tagsIn = html => [...html.matchAll(/<\s*\/?\s*([a-zA-Z][^\s/>]*)/g)].map(m => m[1].toLowerCase());
const shown = html => html.replace(/<\/?b>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
const all = (e, out = []) => { out.push(e); e.children.forEach(c => all(c, out)); return out; };
// createElement cannot be steered by a title — the game names every tag itself — so the one way a title
// becomes an element is markup in an innerHTML write, on #status, #mlist or anything the game created.
function noElementFromTitle(fromWrite) {
  for (const w of htmlWrites.slice(fromWrite))
    assert.deepEqual(tagsIn(w.html).filter(t => t !== "b"), [], `#${w.on} got markup beyond <b>: ${w.html}`);
}
const song = (over = {}) => {
  const s = g.currentSong();
  s.meta.title = TITLE; s.time.cols = 16;
  s.tracks[0].notes = [{ p: g.MIDI[0], c: 0, len: 1 }]; s.tracks[1].hits = [];
  return Object.assign(s, over);
};
const link = packed => g.b64url(JSON.stringify(packed));

// ---------- the title is text ----------

// Fault caught: playSong puts s.meta.title into setStatus's markup unescaped (the shipped code) — the
// title's <img> becomes an element.
test("TUN-84: playSong shows a title as text, inside its <b> only", () => {
  const w = htmlWrites.length;
  g.playSong(song());
  noElementFromTitle(w);
  assert.ok(shown(status.innerHTML).includes(TITLE), "the player sees the title, literally");
});

// Fault caught: a My Melodies row builds its name with innerHTML, or its Load path does.
test("TUN-84: a saved title in My Melodies, and loading it, create no element", async () => {
  g.Store.set("saves", [song()]);
  const w = htmlWrites.length;
  await g.openMelodies();
  const name = all(mlist).find(e => e.className === "mname" && e.textContent === TITLE);
  assert.ok(name, "the saved song's row shows its title as text");
  name.parent.children.find(e => e.tag === "button" && /Load/.test(e.textContent)).onclick();
  noElementFromTitle(w);
});

// Fault caught: the cloud list builds its name with innerHTML, or loading a cloud song shows its title as markup.
test("TUN-84: a cloud title, and loading it, create no element", async () => {
  const pool = g.userPool, list = g.cloudSongList, get = g.cloudSongGet;
  g.userPool = { getCurrentUser: () => ({}) };
  g.cloudSongList = async () => [{ id: "c1", title: TITLE }];
  g.cloudSongGet = async () => ({ id: "c1", song: song() });
  try {
    g.Store.set("saves", []);
    const w = htmlWrites.length;
    await g.openMelodies();
    const name = all(mlist).find(e => e.className === "mname" && e.textContent === TITLE + " ☁️");
    assert.ok(name, "the cloud row shows its title as text");
    await name.parent.children.find(e => e.tag === "button" && /Load/.test(e.textContent)).onclick();
    noElementFromTitle(w);
  } finally { g.userPool = pool; g.cloudSongList = list; g.cloudSongGet = get; }
});

// ---------- a song's length ----------

// Fault caught: songCols without the ceiling, or without the finite check (Math.max(16, "abc") is NaN).
// Absurd values are checked here, on the pure gate, so a regression fails instead of hanging the suite.
test("TUN-84: songCols clamps every column count to [16, MAX_COLS]", () => {
  const M = g.MAX_COLS;
  assert.strictEqual(M, 1920);
  for (const [cols, want] of [[1e9, M], [M + 1, M], [M, M], [-5, 16], [0, 16], ["abc", 16], [null, 16],
    [undefined, 16], [Infinity, 16], [NaN, 16], [{}, 16], [40.4, 40], ["48", 48]])
    assert.strictEqual(g.songCols(cols), want, `cols ${String(cols)}`);
});

// Fault caught: applySong assigning COLS=Math.max(16, cols) (the shipped code) instead of songCols, or
// not reporting the cut. Twice the maximum keeps that failure fast.
test("TUN-84: a link longer than MAX_COLS loads its first MAX_COLS columns and says so", () => {
  const M = g.MAX_COLS, p = g.MIDI[0];
  const s = g.decodeSong(link([3, "pentatonic", 2 * M, 108, 0, "", [[p, 0], [p, M - 1], [p, M]], [[0, M - 1], [0, M]]]));
  assert.strictEqual(g.applySong(s), true, "a cut song is reported");
  assert.strictEqual(g.COLS, M);
  assert.deepEqual(g.melTrack().notes.map(g.noteCol), [0, M - 1]);
  assert.deepEqual(g.drumTrack().notes.map(g.noteCol), [M - 1]);
  const w = htmlWrites.length;
  g.loadSong(s);
  assert.ok(htmlWrites.slice(w).some(x => x.html.includes("only its beginning came along")), "the player is told");
});

// Fault caught: an off-by-one at the ceiling — songCols clamping to MAX_COLS-1, or the gate dropping a note
// in the last column — so a song the Studio built right up to MAX_COLS would not come back whole.
test("TUN-84: a song at MAX_COLS round-trips whole", () => {
  const M = g.MAX_COLS, p = g.MIDI[2];
  assert.strictEqual(g.applySong(song({ time: { cols: M, tempo: 108, groove: 0 },
    tracks: [{ kind: "melody", voice: "musicbox", notes: [{ p, c: M - 1, len: 1 }] }, { kind: "drums", hits: [] }] })), false);
  const back = g.currentSong();
  assert.strictEqual(back.time.cols, M);
  assert.deepEqual(back.tracks[0].notes, [{ p, c: M - 1, len: 1 }]);
});

// Fault caught: the old `if(t.tempo) tempoEl.value=t.tempo` — a range input turns "abc" into a tempo the
// song never had. A real number is clamped to the slider; anything else leaves the tempo alone.
test("TUN-84: tempo from a song is a clamped whole number, or nothing", () => {
  for (const [tempo, want] of [["abc", "100"], [Infinity, "100"], [{}, "100"], [0, "100"], [-50, "40"],
    [1e9, "180"], [99.6, "100"], ["120", "120"]]) {
    g.tempoEl.value = 100;
    g.applySong(song({ time: { cols: 16, tempo, groove: 0 } }));
    assert.strictEqual(g.tempoEl.value, want, `tempo ${String(tempo)}`);
  }
});

// Fault caught: applySong keeping every note (the shipped code kept all 100,000, each held note a stem
// <div>), dropping the duplicate check, or the cap.
// A link this big is refused before it is decoded (the SHARE_IN_MAX tests below); a save or a cloud row has
// no such ceiling, so the song itself must still load within bounds.
test("TUN-84: a song carrying 100,000 notes loads quickly, one note per seed at most", () => {
  const notes = [];
  for (let i = 0; i < 100000; i++) notes.push([60 + (Math.floor(i / 960) % 40), i % 960, 8]);   // 38,400 distinct, the rest repeats
  const packed = [3, "pentatonic", 960, 108, 0, "", notes, notes.map(([, c], i) => [i % 3, c])];
  assert.ok(g.decodeSong(link(packed)) === null, "as a link it is too long to read");
  const s = g.unpackSong(packed);   // the same song as a save or a cloud row would carry it
  const t = performance.now();
  const cut = g.applySong(s);
  const ms = performance.now() - t;
  assert.ok(ms < 3000, `applySong took ${Math.round(ms)} ms`);
  assert.strictEqual(cut, true, "notes past the cap are reported as cut");
  assert.ok(g.melTrack().notes.length <= g.ROWS * g.COLS, `${g.melTrack().notes.length} notes`);
  assert.ok(g.drumTrack().notes.length <= g.DRUMS.length * g.COLS);
});

// Fault caught: dropping the whole-number checks (a "60" pitch or a 1.5 column reaches the doc), the
// MAX_VINE clamp (a vine as long as the song), or the (pitch, column) and (lane, column) de-duplication.
test("TUN-84: only whole, in-range notes and hits load, once each, held at most MAX_VINE", () => {
  const p = g.MIDI[0], q = g.MIDI[1];
  g.applySong(song({ time: { cols: 16, tempo: 108, groove: 0 }, tracks: [
    { kind: "melody", voice: "musicbox", notes: [
      { p, c: 0, len: 1e9 }, { p, c: 0, len: 2 }, { p: q, c: 0, len: "abc" }, { p: q, c: 1, len: -3 },
      { p: "60", c: 2 }, { p: 60.5, c: 2 }, { p: -1, c: 2 }, { p: 128, c: 2 }, null,
      { p, c: 1.5 }, { p, c: "3" }, { p, c: -1 }, { p, c: 16 }] },
    { kind: "drums", hits: [{ lane: 0, c: 0 }, { lane: 0, c: 0 }, { lane: 1.5, c: 1 }, { lane: "1", c: 1 },
      { lane: g.DRUMS.length, c: 1 }, { lane: 1, c: 2 }] }] }));
  const mel = g.melTrack().notes.map(n => [n.pitch, g.noteCol(n), n.durationTicks / g.TICKS_PER_COL]);
  assert.deepEqual(mel, [[p, 0, g.MAX_VINE], [q, 0, 1], [q, 1, 1]]);
  assert.deepEqual(g.drumTrack().notes.map(n => [n.pitch, g.noteCol(n)]), [[0, 0], [1, 2]]);
});

// Fault caught: applySong throwing on a song whose parts are the wrong type (tracks.find is not a function).
test("TUN-84: a song with the wrong shapes loads as an empty field", () => {
  assert.doesNotThrow(() => g.applySong({ v: 3, palette: "pentatonic", time: "x", tracks: "y" }));
  assert.strictEqual(g.COLS, 16);
  assert.doesNotThrow(() => g.applySong({ v: 3, time: { cols: 16 }, tracks: [null, { kind: "melody", notes: "z" }, { kind: "drums", hits: 7 }] }));
  assert.strictEqual(g.melTrack().notes.length, 0);
});

// ---------- the Studio stops at the same line ----------

// Fault caught: addColumns growing past MAX_COLS — a song a player builds there would lose its end on reload.
test("TUN-84: ＋ more stops at MAX_COLS", () => {
  const M = g.MAX_COLS;
  g.applySong(song({ time: { cols: M - 8, tempo: 108, groove: 0 } }));
  const w = htmlWrites.length;
  assert.strictEqual(g.addColumns(16), false);
  assert.strictEqual(g.COLS, M - 8);
  assert.ok(htmlWrites.slice(w).some(x => /as long as a garden grows/.test(x.html)), "the player is told why");
  assert.strictEqual(g.addColumns(8), true);
  assert.strictEqual(g.COLS, M);
  assert.strictEqual(g.addColumns(1), false);
  assert.strictEqual(g.COLS, M);
});

// Fault caught: ＋ room inserting time past MAX_COLS. Its handler is wired on a stub the harness cannot
// click, so this reads the handler: the ceiling check comes before the time is inserted.
test("TUN-84: ＋ room asks fieldCanGrow before it inserts time", () => {
  const src = g.__scripts.find(s => s.name === "js/cursor.js").src;
  const h = src.slice(src.indexOf('getElementById("colPlus").onclick'), src.indexOf('getElementById("colMinus")'));
  assert.ok(h.length > 0, "the ＋ room handler was found");
  const ask = h.indexOf("if(!fieldCanGrow(1)) return;"), insert = h.indexOf("modelInsertTime(");
  assert.ok(ask >= 0 && insert > ask, "fieldCanGrow(1) guards modelInsertTime");
});

// ---------- ?reset asks first ----------

function resetWorld(search) {
  const asked = [], urls = [];
  const w = g.__window, saved = { location: w.location, confirm: w.confirm, history: w.history };
  w.location = { ...w.location, search, pathname: "/index.html", hash: "#s=abc" };
  w.history = { state: null, replaceState(_s, _t, url) { urls.push(url); } };
  const restore = () => Object.assign(w, saved);
  return { asked, urls, restore, answer(yes) { w.confirm = msg => { asked.push(msg); return yes; }; } };
}
function plantGarden() {
  g.progress.name = "Robin"; g.progress.packages = { intro: { done: true } }; g.commitProgress();
  g.Store.set("questRuns", { r1: { id: "r1" } }); g.Store.set("saves", [song()]);
}

// Fault caught: ?reset wiping without asking (the shipped code), or wiping when the player says no.
test("TUN-84: ?reset declined keeps the garden, and leaves the address bar", () => {
  plantGarden();
  const r = resetWorld("?dev&reset"); r.answer(false);
  try {
    assert.strictEqual(g.resetFromUrl(), false);
    assert.strictEqual(r.asked.length, 1, "it asked");
    assert.match(r.asked[0], /your name/); assert.match(r.asked[0], /every package/);
    assert.match(r.asked[0], /instruments/); assert.match(r.asked[0], /settings/);
    assert.match(r.asked[0], /quest drafts and history/); assert.match(r.asked[0], /saved melodies stay/);
    assert.strictEqual(g.progress.name, "Robin");
    assert.strictEqual(g.Store.get("progress", {}).name, "Robin");
    assert.deepEqual(Object.keys(g.Store.get("questRuns", {})), ["r1"]);
    assert.deepEqual(r.urls, ["/index.html?dev#s=abc"], "reset is gone; ?dev and the link stay");
  } finally { r.restore(); }
});

// Fault caught: the confirmed reset no longer wiping (testing still needs it), touching saved melodies,
// or leaving ?reset in the URL so a reload wipes again.
test("TUN-84: ?reset accepted wipes progress and quest runs, keeps melodies, and leaves the address bar", () => {
  plantGarden();
  const r = resetWorld("?reset=1"); r.answer(true);
  try {
    assert.strictEqual(g.resetFromUrl(), true);
    assert.strictEqual(g.progress.name, "");
    assert.strictEqual(g.Store.get("progress", "gone"), null);
    assert.strictEqual(g.Store.get("questRuns", "gone"), null);
    assert.strictEqual(Object.keys(g.QUEST_RUNS).length, 0);
    assert.strictEqual(g.Store.get("saves", []).length, 1, "saved melodies are not part of a reset");
    assert.deepEqual(r.urls, ["/index.html#s=abc"]);
  } finally { r.restore(); }
});

// Fault caught: asking on every load, not only under ?reset.
test("TUN-84: without ?reset nothing is asked", () => {
  const r = resetWorld("?dev&resets"); r.answer(true);
  try {
    assert.strictEqual(g.resetFromUrl(), false);
    assert.deepEqual(r.asked, []);
    assert.deepEqual(r.urls, []);
  } finally { r.restore(); }
});

// ---------- TUN-84 review round 1: what GPT's PR review found still got through ----------

// Boot the real js/boot.js with a URL and a saved profile — the way a link actually reaches the game.
// loadGame throws if any script, boot included, throws while loading, so returning at all is "boot completed".
function boot({ hash = "", search = "", store = {}, confirm = false, cloud = null } = {}) {
  const texts = [], asked = [], requests = [];
  const game = loadGame({ setup: w => {
    // The toast is a <div> js/helpers.js creates at load: every element stays the harness's stub, but the
    // text the game writes into one is recorded.
    const create = w.document.createElement;
    Object.defineProperty(w.document, "createElement", { configurable: true, value: tag => new Proxy(create(tag), {
      set(t, k, v) { if (k === "textContent") texts.push(String(v)); return true; } }) });
    w.location = { ...w.location, hash, search, pathname: "/index.html" };
    w.history = { state: null, replaceState() {} };
    for (const [k, v] of Object.entries(store)) w.localStorage.setItem("mg_" + k, JSON.stringify(v));
    w.confirm = msg => { asked.push(msg); return confirm; };
    if (cloud) w.fetch = async url => {   // the cloud songs API only: any other fetch is still a bug
      if (!/\/songs\/[^/]+$/.test(String(url))) throw new Error("fetch outside the cloud songs API: " + url);
      requests.push(String(url)); return { ok: true, json: async () => cloud }; };
  } });
  return { game, asked, requests, toast: () => texts.join(" | ") };
}
const ticks = () => new Promise(r => setTimeout(r, 20));
// The field the player sees must be the song the document holds: rows × COLS, every note inside it.
function consistent(game) {
  assert.strictEqual(game.grid.length, game.ROWS, "grid rows");
  for (const row of game.grid) assert.strictEqual(row.length, game.COLS, "grid columns");
  for (const n of game.melTrack().notes) assert.ok(n.startTick / game.TICKS_PER_COL < game.COLS, "a note past the field");
  assert.ok(Array.isArray(game.MIDI) && game.MIDI.length === game.ROWS, "a real palette");
}
const OBJ = { toString: 0 };   // Number() on this throws: no callable toString or valueOf
const deep = d => JSON.parse("[".repeat(d) + "]".repeat(d));

// Fault caught: Number() on an untrusted columns, tempo or length value (the round-1 code) — a link's
// {"toString":0} throws inside the boot, after the palette and COLS were already changed.
test("TUN-84 review: object-valued numbers in a #s= link load safely through the real boot", () => {
  const cases = [
    { packed: [3, "pentatonic", OBJ, 108, 0, "", [[60, 0]], []], cols: 16, note: 0 },
    { packed: [3, "pentatonic", 32, OBJ, 0, "", [[60, 20]], []], cols: 32, note: 20 },
    { packed: [3, "pentatonic", 16, 108, 0, "", [[60, 3, OBJ]], []], cols: 16, note: 3 },
  ];
  for (const { packed, cols, note } of cases) {
    const { game } = boot({ hash: "#s=" + link(packed) });
    assert.strictEqual(game.COLS, cols, JSON.stringify(packed));
    const ns = game.melTrack().notes;
    assert.deepEqual(ns.map(n => [n.pitch, n.startTick / game.TICKS_PER_COL, n.durationTicks / game.TICKS_PER_COL]), [[60, note, 1]]);
    assert.strictEqual(game.tempoEl.value, "108", "a bad tempo leaves the slider where it was");
    consistent(game);
  }
});

// Fault caught: the same coercions on a #song= response, which has no length ceiling — a deeply nested array
// overflows the stack in Number(); an object origin throws in validMeter; an object voice throws on the <select>.
test("TUN-84 review: object-valued and deeply nested fields in a #song= response load safely", async () => {
  const cloudSong = time => ({ id: "abc", song: { v: 3, meta: { title: "x" }, palette: "pentatonic", time,
    tracks: [{ kind: "melody", voice: OBJ, notes: [{ p: 60, c: 2, len: deep(5000) }] }, { kind: "drums", hits: [] }] } });
  for (const time of [{ cols: deep(5000), tempo: OBJ }, { cols: 24, tempo: deep(5000), meter: "4/4", origin: OBJ }]) {
    const b = boot({ hash: "#song=abc", cloud: cloudSong(time) });
    await ticks();
    assert.strictEqual(b.requests.length, 1, "the song was fetched");
    assert.match(b.toast(), /A song from a friend/, "the load finished");
    assert.strictEqual(b.game.COLS, time.cols === 24 ? 24 : 16);
    assert.deepEqual(b.game.melTrack().notes.map(n => n.durationTicks / b.game.TICKS_PER_COL), [1]);
    assert.strictEqual(b.game.doc.meterMap.length, 0, "an unusable origin is no meter");
    consistent(b.game);
  }
});

// Fault caught: PALETTES[id] reading an inherited member — "__proto__" finds Object.prototype, and setPalette
// leaves MIDI undefined, so the load throws and the field is unusable.
test("TUN-84 review: a palette name that is not one of PALETTES' own falls back to pentatonic", () => {
  for (const palette of ["__proto__", "constructor", "toString", "hasOwnProperty", ["__proto__"], OBJ, null]) {
    g.setPalette("diatonic");
    assert.doesNotThrow(() => g.applySong(song({ palette })), JSON.stringify(palette));
    assert.strictEqual(g.paletteId, "pentatonic", JSON.stringify(palette));
    assert.strictEqual(g.paletteDef(palette), g.PALETTES.pentatonic);
    consistent(g);
  }
  assert.strictEqual(g.paletteDef("diatonic"), g.PALETTES.diatonic, "a real palette still loads");
  const { game } = boot({ hash: "#s=" + link([3, "__proto__", 16, 108, 0, "", [[60, 0]], []]) });
  assert.strictEqual(game.paletteId, "pentatonic");
  consistent(game);
});

// Fault caught: dropping or loosening SHARE_IN_MAX, or checking it after decoding — a link of megabytes is
// base64-decoded, parsed and expanded into objects before applySong's gate sees a single note.
test("TUN-84 review: a link past SHARE_IN_MAX is refused before it is decoded; one at it still opens", () => {
  assert.strictEqual(g.SHARE_IN_MAX, 4 * g.SHARE_MAX);
  const padded = len => {   // a valid link of exactly `len` characters, padded with an unused voice string
    for (let k = 0; k < 4 * len; k++) { const s = link([3, "pentatonic", 16, 108, 0, "x".repeat(k), [[60, 0]], []]); if (s.length === len) return s; }
    throw new Error("no link of length " + len); };
  const w = g.__window, atob = w.atob; let decoded = 0;
  w.atob = s => { decoded++; return atob(s); };
  try {
    assert.ok(g.decodeSong(padded(g.SHARE_IN_MAX)), "a link at the ceiling opens");
    assert.strictEqual(decoded, 1);
    const dupes = Array.from({ length: 2000 }, () => [60, 0]);
    const over = {
      "one past the ceiling": padded(g.SHARE_IN_MAX + 2),
      "duplicate notes": link([3, "pentatonic", 16, 108, 0, "", dupes, []]),
      "drums only": link([3, "pentatonic", 16, 108, 0, "", [], dupes.map(() => [0, 0])]),
      "an unused string": link([3, "pentatonic", 16, 108, 0, "x".repeat(6000), [], []]),
    };
    for (const [what, s] of Object.entries(over)) {
      assert.ok(s.length > g.SHARE_IN_MAX, what);
      decoded = 0;
      assert.ok(g.decodeSong(s) === null, `${what}: opened`);
      assert.strictEqual(decoded, 0, `${what}: decoded before it was refused`);
    }
  } finally { w.atob = atob; }
});

// Fault caught: a #s= link that cannot be opened failing silently, or loading something anyway.
test("TUN-84 review: a link too long to read tells the player, and opens nothing", () => {
  const b = boot({ hash: "#s=" + "A".repeat(g.SHARE_IN_MAX + 1) });
  assert.match(b.toast(), /didn't work/);
  assert.strictEqual(b.game.melTrack().notes.length, 0);
});

// Fault caught: reading every raw entry when only ROWS × COLS notes (DRUMS × COLS hits) can load — a save or
// a cloud row stuffed with repeats is scanned to its end.
test("TUN-84 review: applySong reads no more raw notes or hits than could load", () => {
  const touched = new Set();
  const spy = fields => { const p = new Proxy(fields, { get(t, k) { touched.add(p); return t[k]; } }); return p; };
  const notes = Array.from({ length: 50000 }, () => spy({ p: 60, c: 0, len: 1 }));
  const hits = Array.from({ length: 50000 }, () => spy({ lane: 0, c: 0 }));
  const s = song(); s.tracks[0].notes = notes; s.tracks[1].hits = hits;
  assert.strictEqual(g.applySong(s), true, "the entries it did not read are reported as cut");
  assert.ok(touched.size <= (g.ROWS + g.DRUMS.length) * g.COLS, `${touched.size} raw entries read`);
  assert.strictEqual(g.melTrack().notes.length, 1);
  assert.strictEqual(g.drumTrack().notes.length, 1);
});

// Fault caught: moving resetFromUrl() below the saved settings or the quest drafts in js/boot.js — an accepted
// reset then leaves the old settings (and a restored draft) in the running game.
test("TUN-84 review: ?reset runs before the boot reads settings and quest drafts", () => {
  const store = {
    progress: { v: 1, name: "Robin", current: "intro", packages: { intro: { level: 2, maxLevel: 2, completed: false } },
      settings: { tempo: 150 }, updatedAt: 1 },
    questRuns: { v: 2, runs: { r1: { runId: "r1", questId: "q", versions: {}, phase: 0, status: "active" } }, completed: {} },
  };
  const yes = boot({ search: "?reset", store, confirm: true });
  assert.strictEqual(yes.asked.length, 1);
  assert.strictEqual(yes.game.progress.name, "");
  assert.strictEqual(yes.game.tempoEl.value, "108", "the saved tempo is not restored after a reset");
  assert.deepEqual(Object.keys(yes.game.QUEST_RUNS), [], "no draft survives a reset");
  const no = boot({ search: "?reset", store, confirm: false });
  assert.strictEqual(no.asked.length, 1);
  assert.strictEqual(no.game.progress.name, "Robin");
  assert.strictEqual(no.game.tempoEl.value, "150", "declining keeps the saved tempo");
  assert.deepEqual(Object.keys(no.game.QUEST_RUNS), ["r1"], "declining keeps the draft");
});

// Fault caught: passing a song's voice to setVoice unchecked. A browser's <select> turns an object into a
// string and {"toString":0} throws there; the harness's stub select never does, so the call itself is pinned.
test("TUN-84 review: only a string voice reaches setVoice", () => {
  const real = g.setVoice, calls = [];
  g.setVoice = v => calls.push(v);
  try {
    for (const voice of [OBJ, ["piano"], 7]) {
      const s = song(); s.tracks[0].voice = voice; g.applySong(s);
    }
    assert.deepEqual(calls, [], "no voice that is not a string");
    const s = song(); s.tracks[0].voice = "piano"; g.applySong(s);
    assert.deepEqual(calls, ["piano"]);
  } finally { g.setVoice = real; }
});
