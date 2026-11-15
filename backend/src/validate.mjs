// The ONE place on the server that knows the song and progress formats (TUN-83). Pure: no imports, no AWS
// SDK, so tests/backend-*.test.mjs load it with nothing installed. Each checker takes what JSON.parse gave
// and returns { ok:true, value, text, bytes } — value REBUILT from the fields named here and nothing else,
// text its JSON (what the handlers store), bytes its UTF-8 size — or { ok:false, error, why }: `error` is
// the fixed message the API answers with, `why` a fixed-vocabulary path for logs and tests, never input.
//
// The rule both formats follow: accept everything any version of the game has written, refuse anything
// else. A refused PROGRESS save is worse than a failed one: sign-in replaces local progress with the cloud
// copy (js/cloud.js onSignedIn), so a frozen cloud copy comes back over newer play. Every list below is
// tied to the client by tests/backend-validate.test.mjs, which fails when the game grows past it.
//
// Changing the song or progress format, adding a package, region, voice or companion: change this file in
// the same PR, and DEPLOY THE BACKEND BEFORE THE CLIENT MERGES — an older client never sends the new value,
// but a newer client against this file would be refused (backend/README.md § What the API accepts).

// ---- caps (the owner, 2026-11-14: both 16 KB; reviews/TUN-83-real-songs-and-progress.md) ----
export const MAX_SONG_BYTES = 16 * 1024;           // the stored song, UTF-8; ~700 notes and hits
export const MAX_SONG_BODY_BYTES = 17 * 1024;      // the request: the song, its title and discarded meta
export const MAX_PROGRESS_BYTES = 16 * 1024;       // the request and the stored progress; real max 13,457
export const MAX_PER_USER = 50;                    // cloud songs per account — a SOFT cap (songs-api.mjs)
export const TITLE_MAX = 60;
export const NAME_MAX = 20;                        // #pname maxlength, unchanged in all of history
export const MAX_NOTES = 1000;                     // more than 16 KB can hold; checked first, cheaply
export const MAX_HITS = 1000;

// ---- closed lists: today's values plus every retired one a saved song or progress may still carry ----
const set = (...a) => new Set(a);                  // Set.has, never `in`: "constructor" is in every object
export const PALETTES = set("pentatonic", "diatonic");
// #instr's options, plus the retired synth voices `pluck` and `pad`: setVoice() still plays them (as the
// guitar and the music box) but never rewrites progress.settings.voice, so old settings keep sending them.
export const VOICES = set("musicbox", "piano", "marimba", "kalimba", "guitar", "harp", "vibraphone",
  "glockenspiel", "pluck", "pad");
export const METER_BAR_COLS = { "4/4": 8, "3/4": 6, "6/8": 6, "2/4": 4 };   // barTicks(METERS[id]) / 48
const METERS = new Set(Object.keys(METER_BAR_COLS));
export const GROOVE_COUNT = 7;                     // GROOVES.length; appended to, never reordered
export const DRUM_LANES = 3;                       // DRUMS.length
export const MAX_VINE = 8;
export const MIN_COLS = 16, MAX_COLS = 1920;       // MAX_COLS: the Studio's ceiling since TUN-84
// What a SAVED song may claim. Before TUN-84 the Studio grew without limit (addColumns), so a song in My
// Melodies can be wider than MAX_COLS, and shareSong sends it as saved; applySong clamps it on load. A
// number, never text, and the byte cap bounds the song whatever it claims (GPT's PR review, round 1).
export const SONG_COLS_LIMIT = 100000;
export const TEMPO_MIN = 40, TEMPO_MAX = 180;      // #tempo's widest range in history
// Package slugs are stable forever (AGENTS.md); none has ever been retired.
export const PACKAGES = set("intro", "follow-the-fireflies", "footsteps", "stepping-stones", "twin-blooms",
  "twin-blooms-plus", "shifting-shadows", "soft-wobble-strong-wobble", "standing-towers",
  "question-and-answer", "tiny-motifs", "wind-and-gaps", "off-the-path", "two-kinds-of-walking",
  "two-new-colors", "ways-home", "river-turns", "pull-of-the-moon", "false-doors", "sun-and-moon-garden",
  "studio");
// metRegions holds each package's `region`, which includes "first-garden" (not a REGIONS key).
export const REGIONS = set("first-garden", "paths-of-song", "pulse-woods", "stone-chorus-canyon",
  "color-spring", "weather-of-wanting", "twin-gardens");
export const COMPANIONS = set("sprout", "chirpy", "twinkle");
export const CLICK_MODES = set("off", "in", "both");
export const COLORS = set("F", "B");
// Keys the client writes into a song's meta: title (currentSong, saves), created/updated, author
// (null, or "Tune Garden" from famousToSong), famous, localId and source (questArtifactUpsert), cloudId.
// Only the title survives, as the stored title; the times are kept when they are plain timestamps.
const META_KEYS = set("title", "created", "updated", "author", "famous", "localId", "source", "cloudId");

// ---- helpers ----
const isObj = x => x !== null && typeof x === "object" && !Array.isArray(x);
const int = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
const num = (x, lo, hi) => typeof x === "number" && Number.isFinite(x) && x >= lo && x <= hi;
const stamp = x => Number.isSafeInteger(x) && x >= 0;
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const onlyKeys = (o, allowed) => Object.keys(o).every(k => allowed.has(k));
export const byteLength = s => Buffer.byteLength(s, "utf8");
const fail = (error, why) => ({ ok: false, error, why });
function done(value, cap) {
  const text = JSON.stringify(value), bytes = byteLength(text);
  return bytes > cap ? fail("too large", "stored size") : { ok: true, value, text, bytes };
}
// strip control chars (code < 32), trim, cap length — today's title rule, unchanged (TUN-83 keeps it)
const stripControls = t => t.split("").filter(ch => ch.charCodeAt(0) >= 32).join("");
export const sanitizeTitle = t => stripControls(typeof t === "string" ? t : "").trim().slice(0, TITLE_MAX);

// ---- songs (SAVE-SHARE.md § 3) ----
const SONG_KEYS = set("v", "meta", "palette", "time", "tracks");
const TIME_KEYS = set("cols", "tempo", "groove", "meter", "origin");
const MELODY_KEYS = set("kind", "voice", "notes"), DRUM_KEYS = set("kind", "hits");
const NOTE_KEYS = set("p", "c", "len"), HIT_KEYS = set("lane", "c");

// `title` is the stored title, already sanitised by the caller; it becomes meta.title, so the payload
// never carries a second one.
export function checkSong(s, title) {
  const bad = why => fail("bad song", why);
  if (!isObj(s)) return bad("song");
  if (!onlyKeys(s, SONG_KEYS)) return bad("song key");
  if (s.v !== 3) return bad("v");
  if (!PALETTES.has(s.palette)) return bad("palette");
  // meta: known keys only; their values are never stored, so they are not inspected — the body cap bounds them
  const meta = { title: title || null };
  if (has(s, "meta") && s.meta !== null) {
    if (!isObj(s.meta) || !onlyKeys(s.meta, META_KEYS)) return bad("meta key");
    if (stamp(s.meta.created)) meta.created = s.meta.created;
    if (stamp(s.meta.updated)) meta.updated = s.meta.updated;
  }
  const t = s.time;
  if (!isObj(t) || !onlyKeys(t, TIME_KEYS)) return bad("time key");
  if (!int(t.cols, MIN_COLS, SONG_COLS_LIMIT)) return bad("time.cols");
  const time = { cols: t.cols };
  if (has(t, "tempo")) { if (!num(t.tempo, TEMPO_MIN, TEMPO_MAX)) return bad("time.tempo"); time.tempo = t.tempo; }
  if (has(t, "groove")) { if (!int(t.groove, 0, GROOVE_COUNT - 1)) return bad("time.groove"); time.groove = t.groove; }
  if (has(t, "meter")) {
    if (!METERS.has(t.meter)) return bad("time.meter");
    time.meter = t.meter;
    if (has(t, "origin")) {
      if (!int(t.origin, 0, METER_BAR_COLS[t.meter] - 1)) return bad("time.origin");
      time.origin = t.origin;
    }
  } else if (has(t, "origin")) return bad("time.origin without meter");
  if (!Array.isArray(s.tracks) || s.tracks.length < 1 || s.tracks.length > 2) return bad("tracks");
  const tracks = [], kinds = new Set();
  for (const tr of s.tracks) {
    if (!isObj(tr) || kinds.has(tr.kind)) return bad("track");
    kinds.add(tr.kind);
    if (tr.kind === "melody") {
      if (!onlyKeys(tr, MELODY_KEYS)) return bad("melody key");
      const out = { kind: "melody" };
      if (has(tr, "voice")) { if (tr.voice !== "" && !VOICES.has(tr.voice)) return bad("voice"); out.voice = tr.voice; }
      if (has(tr, "notes")) {
        if (!Array.isArray(tr.notes) || tr.notes.length > MAX_NOTES) return bad("notes");
        out.notes = [];
        for (const n of tr.notes) {
          if (!isObj(n) || !onlyKeys(n, NOTE_KEYS)) return bad("note key");
          if (!int(n.p, 0, 127)) return bad("note.p");
          if (!int(n.c, 0, t.cols - 1)) return bad("note.c");
          const note = { p: n.p, c: n.c };
          // up to the widest saved field: a retired time-insert could stretch a vine past 🌿 Grow's 8, and
          // applySong clamps it on load. A number, never text.
          if (has(n, "len")) { if (!int(n.len, 1, SONG_COLS_LIMIT)) return bad("note.len"); note.len = n.len; }
          out.notes.push(note);
        }
      }
      tracks.push(out);
    } else if (tr.kind === "drums") {
      if (!onlyKeys(tr, DRUM_KEYS)) return bad("drums key");
      const out = { kind: "drums" };
      if (has(tr, "hits")) {
        if (!Array.isArray(tr.hits) || tr.hits.length > MAX_HITS) return bad("hits");
        out.hits = [];
        for (const h of tr.hits) {
          if (!isObj(h) || !onlyKeys(h, HIT_KEYS)) return bad("hit key");
          if (!int(h.lane, 0, DRUM_LANES - 1)) return bad("hit.lane");
          if (!int(h.c, 0, t.cols - 1)) return bad("hit.c");
          out.hits.push({ lane: h.lane, c: h.c });
        }
      }
      tracks.push(out);
    } else return bad("track.kind");
  }
  return done({ v: 3, meta, palette: s.palette, time, tracks }, MAX_SONG_BYTES);
}

// The body of POST /songs and PUT /songs/{id}: { song, title, visibility } (js/cloud.js cloudSongCreate).
// visibility is accepted and ignored — every song is stored unlisted (SAVE-SHARE.md § 6).
const REQUEST_KEYS = set("song", "title", "visibility"), VISIBILITY = set("unlisted", "private", "public");
export function checkSongRequest(b) {
  const bad = why => fail("bad request", why);
  if (!isObj(b) || !onlyKeys(b, REQUEST_KEYS)) return bad("request key");
  if (b.title != null && typeof b.title !== "string") return bad("title");
  if (b.visibility != null && !VISIBILITY.has(b.visibility)) return bad("visibility");
  return { ok: true, song: b.song == null ? null : b.song, title: b.title == null ? null : b.title };
}
// Today's precedence (songs.mjs before TUN-83): the request's title, else the one inside the song.
export const chooseTitle = (reqTitle, song) =>
  sanitizeTitle(reqTitle || (isObj(song) && isObj(song.meta) ? song.meta.title : ""));

// ---- progress (js/persistence.js commitProgress, saveUserSettings, savePackageProgress) ----
// `toolbox` at the top is the retired global bag; commitProgress deletes it, but sign-up pushes the local
// progress without committing first, so an old guest's may still carry one. It is dropped, not refused.
const PROGRESS_KEYS = set("v", "name", "current", "packages", "settings", "updatedAt", "instruments",
  "metRegions", "companion", "colors", "toolbox");
const PACKAGE_KEYS = set("level", "maxLevel", "done", "completed", "toolbox");
const TOOL_KEYS = set("offs", "midis");
const SETTINGS_KEYS = set("voice", "tempo", "mix", "speak", "click");
const MIX_KEYS = set("voice", "band", "drums");
export const MAX_TOOLS = 100;                      // a package holds at most 91 distinct tools (diatonic)
const LEVEL_MAX = 200;
const smallInts = a => Array.isArray(a) && a.length >= 1 && a.length <= 8 && a.every(x => int(x, 0, 127));
const listOf = (a, allowed, max) => Array.isArray(a) && a.length <= max && a.every(x => allowed.has(x));

export function checkProgress(p) {
  const bad = why => fail("bad progress", why);
  if (!isObj(p) || !onlyKeys(p, PROGRESS_KEYS)) return bad("progress key");
  if (p.v !== 1) return bad("v");
  const out = { v: 1 };
  if (has(p, "name")) {   // still accepted for now (TUN-83 out of scope); cut, never refused for length
    if (typeof p.name !== "string") return bad("name");
    out.name = stripControls(p.name).slice(0, NAME_MAX);
  }
  if (has(p, "current")) { if (!PACKAGES.has(p.current)) return bad("current"); out.current = p.current; }
  if (!isObj(p.packages)) return bad("packages");
  out.packages = {};
  for (const id of Object.keys(p.packages)) {
    if (!PACKAGES.has(id)) return bad("package id");
    const pp = p.packages[id];
    if (!isObj(pp) || !onlyKeys(pp, PACKAGE_KEYS)) return bad("package key");
    const o = {};
    for (const k of ["level", "maxLevel", "done"]) if (has(pp, k)) {
      if (!int(pp[k], 0, LEVEL_MAX)) return bad("package." + k);
      o[k] = pp[k];
    }
    if (has(pp, "completed")) { if (typeof pp.completed !== "boolean") return bad("package.completed"); o.completed = pp.completed; }
    if (has(pp, "toolbox")) {
      if (!Array.isArray(pp.toolbox) || pp.toolbox.length > MAX_TOOLS) return bad("toolbox");
      o.toolbox = [];
      for (const tool of pp.toolbox) {
        if (!isObj(tool) || !onlyKeys(tool, TOOL_KEYS) || !smallInts(tool.offs) || !smallInts(tool.midis)) return bad("tool");
        o.toolbox.push({ offs: tool.offs.slice(), midis: tool.midis.slice() });
      }
    }
    out.packages[id] = o;
  }
  if (has(p, "settings")) {
    const s = p.settings;
    if (!isObj(s) || !onlyKeys(s, SETTINGS_KEYS)) return bad("settings key");
    const o = {};
    if (has(s, "voice")) { if (s.voice !== "" && !VOICES.has(s.voice)) return bad("settings.voice"); o.voice = s.voice; }
    if (has(s, "tempo")) { if (!num(s.tempo, TEMPO_MIN, TEMPO_MAX)) return bad("settings.tempo"); o.tempo = s.tempo; }
    if (has(s, "mix")) {
      if (!isObj(s.mix) || !onlyKeys(s.mix, MIX_KEYS)) return bad("mix key");
      o.mix = {};
      for (const k of Object.keys(s.mix)) { if (!num(s.mix[k], 0, 2)) return bad("mix." + k); o.mix[k] = s.mix[k]; }
    }
    if (has(s, "speak")) { if (typeof s.speak !== "boolean") return bad("settings.speak"); o.speak = s.speak; }
    if (has(s, "click")) { if (!CLICK_MODES.has(s.click)) return bad("settings.click"); o.click = s.click; }
    out.settings = o;
  }
  if (has(p, "updatedAt")) { if (!stamp(p.updatedAt)) return bad("updatedAt"); out.updatedAt = p.updatedAt; }
  if (has(p, "instruments")) { if (!listOf(p.instruments, VOICES, 16)) return bad("instruments"); out.instruments = p.instruments.slice(); }
  if (has(p, "metRegions")) { if (!listOf(p.metRegions, REGIONS, 16)) return bad("metRegions"); out.metRegions = p.metRegions.slice(); }
  if (has(p, "companion")) {
    if (!isObj(p.companion) || !onlyKeys(p.companion, set("type")) || !COMPANIONS.has(p.companion.type)) return bad("companion");
    out.companion = { type: p.companion.type };
  }
  if (has(p, "colors")) { if (!listOf(p.colors, COLORS, 2)) return bad("colors"); out.colors = p.colors.slice(); }
  return done(out, MAX_PROGRESS_BYTES);
}
