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
test("TUN-84: a link carrying 100,000 notes loads quickly, one note per seed at most", () => {
  const notes = [];
  for (let i = 0; i < 100000; i++) notes.push([60 + (Math.floor(i / 960) % 40), i % 960, 8]);   // 38,400 distinct, the rest repeats
  const s = g.decodeSong(link([3, "pentatonic", 960, 108, 0, "", notes, notes.map(([, c], i) => [i % 3, c])]));
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
