// Fixtures for the backend's tests (TUN-83), made by the REAL client code, never written by hand: the game
// runs in tests/harness.mjs, and every song and progress object here comes out of its own functions —
// currentSong, famousToSong, a quest's offering, savePackageProgress, saveUserSettings, cloudPush,
// cloudSongCreate. So when the game starts writing something new, these fixtures write it too, and the
// validator's tests fail until backend/src/validate.mjs accepts it.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadGame, FakeIdToken, cachedIdToken } from "../harness.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const INDEX_HTML = readFileSync(join(ROOT, "index.html"), "utf8");

/** The value="…" options of one <select id="…"> in index.html. */
export function selectOptions(id) {
  const m = INDEX_HTML.match(new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)</select>`));
  if (!m) throw new Error("no <select id=" + id + "> in index.html");
  return [...m[1].matchAll(/value="([^"]*)"/g)].map(x => x[1]);
}
/** An attribute of one <input id="…"> in index.html. */
export function inputAttr(id, attr) {
  const m = INDEX_HTML.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`));
  const a = m && m[0].match(new RegExp(`${attr}="([^"]*)"`));
  if (!a) throw new Error(`no ${attr} on #${id}`);
  return a[1];
}

// A <select> that behaves like the browser's: assigning a value it has no option for leaves it empty.
// The harness's default stub returns "" for #instr, which would make every fixture's voice "" — a value
// the real picker never holds (GPT's design review, finding 8).
function voiceSelect() {
  const options = selectOptions("instr");
  let current = options[0];
  return {
    get value() { return current; },
    set value(v) { current = options.includes(String(v)) ? String(v) : ""; },
    innerHTML: "", options: [], style: {}, dataset: {},
    appendChild() {}, removeChild() {}, querySelectorAll: () => [], querySelector: () => null,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, removeAttribute() {},
  };
}

/**
 * A fresh game whose cloud calls are recorded instead of sent. `local` seeds localStorage's progress and
 * `saves` its My Melodies (what an older client left behind). Only the game's own API is answered; any
 * other fetch throws. `copied` collects every link the game puts on the clipboard.
 */
export function clientGame({ local, saves } = {}) {
  const requests = [], copied = [];
  const g = loadGame({ fresh: true, elements: { instr: voiceSelect() }, setup: w => {
    if (local) w.localStorage.setItem("mg_progress", JSON.stringify(local));
    if (saves) w.localStorage.setItem("mg_saves", JSON.stringify(saves));
    w.navigator = { ...w.navigator, clipboard: { writeText: async url => { copied.push(url); } } };
    w.fetch = async (url, opts = {}) => {
      if (!/\/(songs|progress)(\/|$)/.test(String(url))) throw new Error("fetch outside the game's API: " + url);
      requests.push({ url: String(url), method: opts.method || "GET", body: opts.body });
      return { ok: true, json: async () => ({ id: "fake-id" }) };
    };
  } });
  g.freshId = async () => ({ token: "test-token", sub: "sub-test" });      // signed in, as far as the cloud calls can tell
  // …as the account this tab's sync belongs to, which the cached session still names (TUN-128 checks it around each request)
  g.__window.AmazonCognitoIdentity = { CognitoIdToken: FakeIdToken };
  g.userPool = { getCurrentUser: () => ({ getUsername: () => "test", storage: cachedIdToken({ "cognito:username": "test", sub: "sub-test" }) }) };
  g._syncUser = "test"; g._syncSub = "sub-test";
  g.cloudSync = "ready";                         // …with the cloud copy read, so cloudPush may send (TUN-106)
  g.initAudio();                                 // the Craft button does this before craftFromCells
  return { g, requests, copied };
}

const clone = x => JSON.parse(JSON.stringify(x));

/** Plant notes in the Studio: [[pitch, col, lenCols], …] on the melody, [[lane, col], …] on the drums. */
export function studioSong(g, { notes = [], hits = [], cols = 16, tempo, voice, meter, origin = 0 } = {}) {
  g.openStudioWith({ v: 3, palette: "diatonic", time: { cols, tempo: tempo || 108, groove: 0 },
    tracks: [{ kind: "melody", voice: voice || "piano", notes: notes.map(([p, c, len]) => ({ p, c, len: len || 1 })) },
             { kind: "drums", hits: hits.map(([lane, c]) => ({ lane, c })) }] });
  if (meter) { g.doc.meterMap = [{ tick: 0, preset: meter, originTick: origin * g.TICKS_PER_COL }]; }
  return clone(g.currentSong());
}

/** Every song the client can send to POST /songs, by name. */
export function clientSongs() {
  const { g } = clientGame();
  const songs = {};
  g.openStudio();
  songs["currentSong, empty Studio"] = clone(g.currentSong());
  songs["currentSong, a planted Studio"] = studioSong(g, {
    notes: [[60, 0], [64, 1], [67, 2], [72, 3], [83, 15]], hits: [[0, 0], [1, 4], [2, 15]], tempo: 132, voice: "harp" });
  songs["a song with long vines"] = studioSong(g, { notes: [[60, 0, g.MAX_VINE], [64, 8, 8], [67, 16, 3]], cols: 32 });
  songs["a metered song with a pickup"] = studioSong(g, { notes: [[67, 0], [72, 2]], cols: 48, meter: "3/4", origin: 2 });
  songs["a 6/8 song"] = studioSong(g, { notes: [[60, 0]], cols: 24, meter: "6/8" });
  songs["a field at full width"] = studioSong(g, { notes: [[60, 0], [72, g.MAX_COLS - 1]], hits: [[2, g.MAX_COLS - 1]], cols: g.MAX_COLS });
  for (const id of Object.keys(g.FAMOUS)) { const s = g.famousToSong(id); if (s) songs["famousToSong " + id] = clone(s); }
  // A song unpacked from a #s= link with no voice: packSong writes "" for it.
  songs["a #s= link without a voice"] = clone(g.decodeSong(g.encodeSong({ ...songs["currentSong, a planted Studio"],
    tracks: [{ kind: "melody", voice: "", notes: [{ p: 60, c: 0, len: 1 }] }, { kind: "drums", hits: [] }] })));
  songs["a quest's saved song"] = questSavedSong(g);
  songs["a song saved to My Melodies"] = (() => { const s = studioSong(g, { notes: [[62, 1]] }); s.meta.title = "My melody"; return s; })();
  return songs;
}

/** Drive one quest to its offering, as tests/questhistory.test.mjs does, on a song the Studio made. */
export function questSavedSong(g) {
  const song = studioSong(g, { notes: [[60, 0], [62, 1]], hits: [[0, 0]] });
  g.QUEST_RUNS = Object.create(null);
  g.QUEST_RUNS.r1 = g.newQuestRun({ runId: "r1", questId: "firefly-crossing", definitionVersion: 2, song, span: { start: 0, end: 16 }, at: 1 });
  g.transactQuestRun("r1", [{ type: "completePass", versionId: "A", editRev: 0, sessionId: "s-r1", at: 2 }]);
  g.QUEST_RUNS.r1 = { ...g.QUEST_RUNS.r1, selection: "A" };
  g.transactQuestRun("r1", [{ type: "offer", title: "The Crossing", at: 3 }]);
  const r = g.finalizeQuestOffering("r1");
  if (!r.ok) throw new Error("the quest did not finish: " + r.code);
  const saved = g.getSaves().find(s => s.meta && s.meta.source && s.meta.source.kind === "quest");
  if (!saved) throw new Error("no quest song in My Melodies");
  return clone(saved);
}

/** Craft every distinct tool the active palette allows, in column 0, through the real craftFromCells. */
function craftEverything(g) {
  g.toolbox.length = 0;
  const R = g.ROWS;
  for (let a = 0; a < R; a++) for (let b = a + 1; b < R; b++) {
    g.craftFromCells([{ r: a, c: 0 }, { r: b, c: 0 }]);
    for (let c = b + 1; c < R; c++) g.craftFromCells([{ r: a, c: 0 }, { r: b, c: 0 }, { r: c, c: 0 }]);
  }
}
export const fusePackages = g => Object.keys(g.PACKAGES).filter(id => id !== "studio"
  && g.PACKAGES[id].levels.some(l => (l.unlock || []).includes("fuse")));

/**
 * A played-through progress, written by the game: every package entered and finished through
 * savePackageProgress, tools crafted (`tools`: "some" or "every" distinct one) in each Fuse package,
 * settings saved, a companion picked, regions met, F and B discovered, the longest name. `progress` is what the
 * game sends to the cloud — without the name, which stays on the device (TUN-93).
 */
export function playedThroughProgress({ tools = "some" } = {}) {
  const { g, requests } = clientGame();
  g.pickCompanion("chirpy");
  g.savePlayerName("x".repeat(Number(inputAttr("pname", "maxlength"))));
  for (const id of Object.keys(g.PACKAGES)) {
    if (id === "studio") continue;
    const last = g.PACKAGES[id].levels.length - 1;
    g.setPlayScope({ kind: "package", packageId: id }, { levelIdx: last });
    g.setPalette(g.PACKAGES[id].palette || "pentatonic");
    g.toolbox.length = 0;
    if (fusePackages(g).includes(id)) {
      if (tools === "every") craftEverything(g);
      else { g.craftFromCells([{ r: 0, c: 0 }, { r: 4, c: 0 }]); g.craftFromCells([{ r: 2, c: 0 }, { r: 5, c: 0 }, { r: 7, c: 0 }]); }
    }
    const pp = g.pkgProg(id); pp.done = last + 1;
    g.levelIdx = last; g.savePackageProgress();
    g.greetRegionFriend();                       // writes progress.metRegions, once per region
  }
  g.instrEl.value = "glockenspiel"; g.mix = { voice: 1.37, band: 0, drums: 2 }; g.speakOn = false; g.clickMode = "both";
  g.saveUserSettings();
  g.commitProgress();
  return { g, requests, progress: clone(g.cloudCopy(g.progress)) };
}
