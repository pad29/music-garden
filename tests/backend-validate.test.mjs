// The backend's validator (TUN-83): backend/src/validate.mjs, an ES module with no AWS SDK, imported
// directly. Three kinds of test:
//   1. ACCEPTED — every song and progress the real client writes (tests/helpers/backend-fixtures.mjs makes
//      them by running the game), and the stored song loads back to the same Studio.
//   2. REFUSED — each with the reason it was refused (`why`), so a test cannot pass for the wrong reason.
//   3. DRIFT — every closed list and limit in validate.mjs against the client it describes. When the game
//      grows (a new voice, package, region, meter, or enough content to outgrow a size cap), these fail:
//      change validate.mjs in the same PR and deploy the backend first (backend/README.md).
import { test } from "node:test";
import assert from "node:assert";
import * as V from "../backend/src/validate.mjs";
import { clientGame, clientSongs, playedThroughProgress, fusePackages, selectOptions, inputAttr, INDEX_HTML } from "./helpers/backend-fixtures.mjs";

const clone = x => JSON.parse(JSON.stringify(x));
const SONGS = clientSongs();
const base = () => clone(SONGS["currentSong, a planted Studio"]);
const refusedSong = (s, why) => {
  const r = V.checkSong(s, "t");
  assert.strictEqual(r.ok, false, "should be refused: " + why);
  assert.strictEqual(r.why, why);
};
const refusedProgress = (p, why) => {
  const r = V.checkProgress(p);
  assert.strictEqual(r.ok, false, "should be refused: " + why);
  assert.strictEqual(r.why, why);
};

// ---------- 1. accepted ----------

test("every song the client writes is accepted, and loads back to the same Studio", () => {
  const { g } = clientGame();
  const studioOf = s => { g.openStudioWith(clone(s)); const c = clone(g.currentSong()); delete c.meta; return { c, voice: g.instrEl.value }; };
  assert.ok(Object.keys(SONGS).length >= 20, "the fixtures include every Jukebox tune");
  for (const [name, song] of Object.entries(SONGS)) {
    const r = V.checkSong(song, "A title");
    assert.ok(r.ok, `${name}: refused (${r.why})`);
    assert.deepStrictEqual(JSON.parse(r.text), r.value, name);
    assert.ok(r.bytes <= V.MAX_SONG_BYTES, name);
    // notes, holds, drums, voice, tempo, groove, meter and pickup all come back as the original's did
    assert.deepStrictEqual(studioOf(r.value), studioOf(song), name);
  }
});

test("the stored song keeps only the title as text: meta's ids, author and source are dropped", () => {
  const quest = SONGS["a quest's saved song"];
  assert.ok(quest.meta.localId && quest.meta.source, "the fixture carries a quest's provenance");
  const r = V.checkSong(quest, "The Crossing");
  assert.ok(r.ok, r.why);
  assert.deepStrictEqual(Object.keys(r.value.meta), ["title", "created", "updated"]);
  assert.strictEqual(r.value.meta.title, "The Crossing");
  const famous = V.checkSong(SONGS["famousToSong mary"], "");
  assert.deepStrictEqual(Object.keys(famous.value.meta).sort(), ["created", "title", "updated"]);
  assert.strictEqual(famous.value.meta.title, null, "an empty stored title is null, not a second title");
  for (const k of ["author", "famous", "localId", "source", "cloudId"]) assert.ok(!r.text.includes(`"${k}"`), k);
});

test("meta.title in the payload always equals the stored title", () => {
  const s = base(); s.meta.title = "something else entirely";
  assert.strictEqual(V.checkSong(s, "Mine").value.meta.title, "Mine");
  // today's precedence: the request's title, else the one inside the song; both sanitised
  assert.strictEqual(V.chooseTitle("  Req\u0007 ", s), "Req");
  assert.strictEqual(V.chooseTitle(null, s), "something else entirely");
  assert.strictEqual(V.chooseTitle("", { meta: { title: 42 } }), "");
  assert.strictEqual(V.chooseTitle(null, null), "");
  const long = "🎵".repeat(200);   // a long title is cut, as before — never refused (GPT finding 5)
  assert.strictEqual(V.chooseTitle(long, null).length, V.TITLE_MAX);
});

test("a played-through progress is accepted, and the largest one the game can write fits with room", () => {
  const some = playedThroughProgress({ tools: "some" }).progress;
  const r = V.checkProgress(some);
  assert.ok(r.ok, r.why);
  assert.deepStrictEqual(r.value, some, "a real progress is stored exactly as the game wrote it");
  for (const k of ["v", "name", "current", "packages", "settings", "updatedAt", "instruments", "companion", "metRegions", "colors"])
    assert.ok(k in some, "the fixture exercises " + k);

  // THE CONTENT-GROWTH GUARD (the owner, 2026-11-14): every package completed, and every distinct tool
  // crafted in every package that has Fuse, through the real craftFromCells. A new Fuse package, a wider
  // palette or a longer progress makes this grow; when it no longer fits the cap with 10% to spare, raise
  // MAX_PROGRESS_BYTES and redo the cost arithmetic (backend/README.md § What the API accepts).
  const every = playedThroughProgress({ tools: "every" }).progress;
  const max = V.checkProgress(every);
  assert.ok(max.ok, `the largest real progress is refused (${max.why}, ${max.bytes ?? "?"} bytes)`);
  assert.ok(max.bytes <= 0.9 * V.MAX_PROGRESS_BYTES,
    `the largest real progress is ${max.bytes} bytes, within 10% of MAX_PROGRESS_BYTES (${V.MAX_PROGRESS_BYTES}): raise the cap`);
});

test("a fresh guest's progress and an old guest's are accepted (the sign-up push skips commitProgress)", async () => {
  const fresh = clientGame();
  await fresh.g.cloudPush();
  const sent = JSON.parse(fresh.requests.at(-1).body);
  assert.ok(V.checkProgress(sent).ok, V.checkProgress(sent).why);

  // What an older client left in localStorage: the retired global toolbox, and the retired synth voice
  // `pluck`, which setVoice plays as the guitar but never rewrites (GPT finding 2).
  const old = { v: 1, name: "Ann", current: "twin-blooms", updatedAt: 1750000000000,
    packages: { intro: { level: 3, maxLevel: 3, completed: true, done: 4, toolbox: [{ offs: [0, 4], midis: [60, 67] }] },
                "twin-blooms": { level: 1, maxLevel: 1, completed: false } },
    settings: { voice: "pluck", tempo: 120, mix: { voice: 1, band: 1, drums: 1 }, speak: true },
    toolbox: [{ offs: [0, 2], midis: [60, 64] }] };
  const { g, requests } = clientGame({ local: old });
  g.ensureInstruments();
  await g.cloudPush();
  const r = V.checkProgress(JSON.parse(requests.at(-1).body));
  assert.ok(r.ok, r.why);
  assert.ok(!("toolbox" in r.value), "the retired root toolbox is dropped, not stored");
  assert.strictEqual(r.value.settings.voice, "pluck");
  assert.ok(V.checkProgress({ ...old, settings: { voice: "pad" } }).ok, "the retired pad voice too");
});

test("the name is cut to its cap and stripped of control characters, never refused for them", () => {
  const p = { v: 1, packages: {}, name: "a\u0000b" + "c".repeat(40) };
  const r = V.checkProgress(p);
  assert.ok(r.ok);
  assert.strictEqual(r.value.name, "ab" + "c".repeat(V.NAME_MAX - 2));
});

// ---------- 2. refused ----------

test("the ticket's five refusals", () => {
  const extra = base(); extra.tracks[0].notes[0].label = "hello";
  refusedSong(extra, "note key");                                      // an extra string field
  const many = base(); many.time.cols = 1920;
  many.tracks[0].notes = Array.from({ length: 10000 }, (_, i) => ({ p: 60 + (i % 12), c: i % 1920, len: 1 }));
  refusedSong(many, "notes");                                          // 10,000 notes
  const pitch = base(); pitch.tracks[0].notes[0].p = "72";
  refusedSong(pitch, "note.p");                                        // a non-numeric pitch
  const big = base(); big.time.cols = 1920;                            // oversized: valid, but over 16 KB
  big.tracks[0].notes = Array.from({ length: 999 }, (_, i) => ({ p: 60, c: i, len: 1 }));
  big.tracks[1].hits = Array.from({ length: 999 }, (_, i) => ({ lane: i % 3, c: i }));
  const r = V.checkSong(big, "t");
  assert.deepStrictEqual([r.ok, r.error], [false, "too large"]);
  for (const v of [2, "3", 4, undefined]) { const s = base(); s.v = v; refusedSong(s, "v"); }   // a wrong v
  refusedProgress({ v: 2, packages: {} }, "v");
  refusedProgress({ v: "1", packages: {} }, "v");
});

test("songs: unknown keys anywhere, and every closed list", () => {
  const cases = [
    [s => { s.x = "hi"; }, "song key"],
    [s => { s.meta.note = "hello"; }, "meta key"],
    [s => { s.meta = "hello"; }, "meta key"],
    [s => { s.time.label = "x"; }, "time key"],
    [s => { s.time.swing = 0.2; }, "time key"],            // reserved in SAVE-SHARE § 3, never written
    [s => { s.tracks[0].name = "x"; }, "melody key"],
    [s => { s.tracks[1].hits[0].vel = 1; }, "hit key"],
    [s => { s.tracks[0].notes[0].vel = 1; }, "note key"],
    [s => { s.palette = "chromatic"; }, "palette"],
    [s => { s.palette = "constructor"; }, "palette"],
    [s => { s.tracks[0].voice = "kazoo"; }, "voice"],
    [s => { s.tracks[0].voice = "toString"; }, "voice"],
    [s => { s.time.meter = "5/8"; }, "time.meter"],
    [s => { s.time.meter = "__proto__"; }, "time.meter"],
    [s => { s.tracks[0].kind = "bass"; }, "track.kind"],
    [s => { s.tracks[1].kind = "melody"; }, "track"],      // two melodies
    [s => { s.tracks = []; }, "tracks"],
    [s => { s.tracks.push({ kind: "drums", hits: [] }); }, "tracks"],
    [s => { s.tracks = "x"; }, "tracks"],
    [s => { delete s.time; }, "time key"],
    [s => { s.time = []; }, "time key"],
  ];
  for (const [edit, why] of cases) { const s = base(); edit(s); refusedSong(s, why); }
  assert.strictEqual(V.checkSong(null, "t").why, "song");
  assert.strictEqual(V.checkSong([], "t").why, "song");
  assert.strictEqual(V.checkSong("song", "t").why, "song");
});

test("songs: numbers out of range, and numbers that are not plain numbers", () => {
  const cases = [
    [s => { s.time.cols = 15; }, "time.cols"], [s => { s.time.cols = 100001; }, "time.cols"],
    [s => { s.time.cols = 16.5; }, "time.cols"], [s => { s.time.cols = "16"; }, "time.cols"],
    [s => { s.time.tempo = 39; }, "time.tempo"], [s => { s.time.tempo = 181; }, "time.tempo"],
    [s => { s.time.tempo = "120"; }, "time.tempo"], [s => { s.time.tempo = 1e300; }, "time.tempo"],
    [s => { s.time.groove = 7; }, "time.groove"], [s => { s.time.groove = null; }, "time.groove"],
    [s => { s.time.origin = 0; }, "time.origin without meter"],
    [s => { s.time.meter = "3/4"; s.time.origin = 6; }, "time.origin"],     // a whole bar is not a pickup
    [s => { s.time.meter = "4/4"; s.time.origin = -1; }, "time.origin"],
    [s => { s.time.meter = "4/4"; s.time.origin = "2"; }, "time.origin"],
    [s => { s.tracks[0].notes[0].p = 128; }, "note.p"], [s => { s.tracks[0].notes[0].p = 60.5; }, "note.p"],
    [s => { s.tracks[0].notes[0].c = 16; }, "note.c"], [s => { s.tracks[0].notes[0].c = -1; }, "note.c"],
    [s => { s.tracks[0].notes[0].len = 0; }, "note.len"], [s => { s.tracks[0].notes[0].len = 100001; }, "note.len"],
    [s => { s.tracks[0].notes[0].len = null; }, "note.len"],
    [s => { s.tracks[1].hits[0].lane = 3; }, "hit.lane"], [s => { s.tracks[1].hits[0].c = 16; }, "hit.c"],
    [s => { s.tracks[0].notes[0] = [60, 0]; }, "note key"], [s => { s.tracks[0].notes[0] = null; }, "note key"],
    [s => { s.tracks[1].hits = Array.from({ length: 1001 }, () => ({ lane: 0, c: 0 })); }, "hits"],
  ];
  for (const [edit, why] of cases) { const s = base(); edit(s); refusedSong(s, why); }
});

test("songs: odd timestamps in meta are dropped, not stored and not a refusal", () => {
  for (const t of [1e300, 1e-200, -1, 1.5, "1700000000000", null]) {
    const s = base(); s.meta.created = t; s.meta.updated = t;
    const r = V.checkSong(s, "t");
    assert.ok(r.ok, String(t));
    assert.deepStrictEqual(Object.keys(r.value.meta), ["title"], String(t));
  }
  const z = base(); z.tracks[0].notes[0].c = -0;                       // -0 is column 0, stored as 0
  assert.ok(V.checkSong(z, "t").text.includes('"c":0'));
});

test("progress: unknown keys, closed lists and own-property lookups", () => {
  const ok = () => clone(playedThroughProgress({ tools: "some" }).progress);
  const cases = [
    [p => { p.diary = "dear diary"; }, "progress key"],
    [p => { p.settings.note = "x"; }, "settings key"],
    [p => { p.settings.mix.master = 1; }, "mix key"],
    [p => { p.packages.intro.note = "x"; }, "package key"],
    [p => { p.packages.intro.toolbox[0] = { offs: [0, 4], midis: [60, 67], name: "x" }; }, "tool"],
    [p => { p.packages["my-name-is-jane"] = {}; }, "package id"],            // a slug is still free text
    [p => { p.packages.constructor = {}; }, "package id"],
    [p => { p.packages = JSON.parse('{"__proto__":{}}'); }, "package id"],
    [p => { p.current = "constructor"; }, "current"],                       // GPT finding 4: crashed the restore
    [p => { p.current = "my-name-is-jane"; }, "current"],
    [p => { p.metRegions = ["hasOwnProperty"]; }, "metRegions"],
    [p => { p.companion = { type: "dragon" }; }, "companion"],
    [p => { p.companion = { type: "sprout", name: "Bob" }; }, "companion"],
    [p => { p.colors = ["F", "B", "F"]; }, "colors"], [p => { p.colors = ["G"]; }, "colors"],
    [p => { p.instruments = ["musicbox", "kazoo"]; }, "instruments"],
    [p => { p.settings.voice = "kazoo"; }, "settings.voice"],
    [p => { p.settings.click = "loud"; }, "settings.click"],
    [p => { p.settings.speak = "yes"; }, "settings.speak"],
    [p => { p.settings.tempo = 200; }, "settings.tempo"],
    [p => { p.settings.mix.voice = 3; }, "mix.voice"],
    [p => { p.packages.intro.level = -1; }, "package.level"],
    [p => { p.packages.intro.done = 1.5; }, "package.done"],
    [p => { p.packages.intro.completed = 1; }, "package.completed"],
    [p => { p.packages.intro.toolbox = Array.from({ length: 101 }, () => ({ offs: [0, 1], midis: [60, 62] })); }, "toolbox"],
    [p => { p.packages.intro.toolbox[0].midis = [60, 128]; }, "tool"],
    [p => { p.packages.intro.toolbox[0].offs = []; }, "tool"],
    [p => { p.updatedAt = 1e300; }, "updatedAt"], [p => { p.updatedAt = 1e-200; }, "updatedAt"],
    [p => { p.updatedAt = -1; }, "updatedAt"],
    [p => { p.name = 42; }, "name"],
    [p => { delete p.packages; }, "packages"], [p => { p.packages = []; }, "packages"],
  ];
  for (const [edit, why] of cases) { const p = ok(); edit(p); refusedProgress(p, why); }
  for (const p of [null, [], "progress", 1]) assert.strictEqual(V.checkProgress(p).why, "progress key");
});

test("progress over the cap is refused as too large", () => {
  // every field in range, but ten packages each holding 100 eight-note tools: ~67 KB
  const p = clone(playedThroughProgress({ tools: "some" }).progress);
  const fat = Array.from({ length: 100 }, () => ({ offs: [0, 1, 2, 3, 4, 5, 6, 7], midis: [100, 101, 102, 103, 104, 105, 106, 107] }));
  for (const id of Object.keys(p.packages).slice(0, 10)) p.packages[id].toolbox = fat;
  const r = V.checkProgress(p);
  assert.deepStrictEqual([r.ok, r.error], [false, "too large"]);
});

// ---------- 3. drift: each list in validate.mjs against the client ----------

test("the closed lists match the client they describe", () => {
  const { g } = clientGame();
  const keys = o => Object.keys(o).sort();
  for (const v of selectOptions("instr")) assert.ok(V.VOICES.has(v), `#instr voice ${v} is not in validate.mjs VOICES`);
  for (const v of Object.keys(g.INSTR_INFO)) assert.ok(V.VOICES.has(v), `instrument ${v} is not in validate.mjs VOICES`);
  assert.deepStrictEqual([...V.PALETTES].sort(), keys(g.PALETTES));
  assert.deepStrictEqual(Object.keys(V.METER_BAR_COLS).sort(), keys(g.METERS));
  for (const [id, P] of Object.entries(g.METERS)) assert.strictEqual(V.METER_BAR_COLS[id], g.barTicks(P) / g.TICKS_PER_COL, id);
  assert.strictEqual(V.GROOVE_COUNT, g.GROOVES.length);
  assert.strictEqual(V.DRUM_LANES, g.DRUMS.length);
  assert.strictEqual(V.MAX_VINE, g.MAX_VINE);
  assert.strictEqual(V.MAX_COLS, g.MAX_COLS);
  const tempo = INDEX_HTML.match(/id="tempo" min="(\d+)" max="(\d+)"/);
  assert.ok(+tempo[1] >= V.TEMPO_MIN && +tempo[2] <= V.TEMPO_MAX, "#tempo's range fits validate.mjs");
  for (const t of Object.values(g.FAMOUS_TEMPO)) assert.ok(t >= V.TEMPO_MIN && t <= V.TEMPO_MAX, "FAMOUS_TEMPO " + t);
  assert.deepStrictEqual([...V.CLICK_MODES].sort(), selectOptions("click").sort());
  assert.deepStrictEqual([...V.COMPANIONS].sort(), keys(g.COMPANIONS));
  assert.strictEqual(V.NAME_MAX, Number(inputAttr("pname", "maxlength")));
  for (const id of Object.keys(g.PACKAGES))
    assert.ok(V.PACKAGES.has(id), `package ${id} is not in validate.mjs PACKAGES: add it, and deploy the backend before the client`);
  for (const p of Object.values(g.PACKAGES)) if (p.region)
    assert.ok(V.REGIONS.has(p.region), `region ${p.region} is not in validate.mjs REGIONS: add it, and deploy the backend first`);
  for (const id of Object.keys(g.REGIONS)) assert.ok(V.REGIONS.has(id), "region " + id);
  for (const c of Object.values(g.PACKAGES).flatMap(p => p.levels.flatMap(l => l.colors || [])))
    assert.ok(V.COLORS.has(c), "colour " + c);
});

test("the count and size limits leave room for everything the game can hold", () => {
  const { g } = clientGame();
  const levels = Math.max(...Object.values(g.PACKAGES).map(p => p.levels.length));
  assert.ok(levels <= 200, "LEVEL_MAX holds every package's levels");
  const rows = Math.max(...Object.values(g.PALETTES).map(p => p.MIDI.length));
  const distinctTools = (rows - 1) + (rows - 1) * (rows - 2) / 2;   // offs {0,a} and {0,a,b}
  assert.ok(distinctTools <= V.MAX_TOOLS, `a ${rows}-row palette allows ${distinctTools} tools; MAX_TOOLS is ${V.MAX_TOOLS}`);
  assert.ok(fusePackages(g).length >= 1);
  // the note and hit counts never bind before the byte cap does: 1,000 of the smallest note overflow it
  const tiny = JSON.stringify(Array.from({ length: V.MAX_NOTES }, () => ({ p: 0, c: 0, len: 1 })));
  assert.ok(Buffer.byteLength(tiny) > V.MAX_SONG_BYTES);
  for (const s of Object.values(SONGS)) assert.ok(V.checkSong(s, "t").bytes < V.MAX_SONG_BYTES / 4, "real songs are far under the song cap");
});
