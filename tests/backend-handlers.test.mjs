// The backend's handlers (TUN-83), driven without the AWS SDK: backend/src/songs-api.mjs and
// progress-api.mjs take their DynamoDB access as four plain functions, and here those are an in-memory
// table that records every write. songs.mjs and progress.mjs only wire the real SDK into them.
import { test } from "node:test";
import assert from "node:assert";
import { makeSongsHandler } from "../backend/src/songs-api.mjs";
import { makeProgressHandler } from "../backend/src/progress-api.mjs";
import * as V from "../backend/src/validate.mjs";
import { MAX_SONG_BODY_BYTES, MAX_PROGRESS_BYTES, MAX_PER_USER } from "../backend/src/validate.mjs";
import { clientGame, clientSongs, playedThroughProgress } from "./helpers/backend-fixtures.mjs";

const clone = x => JSON.parse(JSON.stringify(x));
// The handlers log every refusal and failure for CloudWatch. Keep those lines out of the test output, and
// keep them, so a test can check what a 500 logged.
const logged = [];
console.log = (...a) => logged.push(["log", ...a]);
console.error = (...a) => logged.push(["error", ...a]);
const SECRET = "arn:aws:dynamodb:us-east-1:123456789012:table/SECRET-internal";

/**
 * An in-memory table keyed by `key`, with a byOwner query that pages every `pageSize` rows the way
 * DynamoDB does: in (updated, songId) order, each page's LastEvaluatedKey the last row's index and table
 * keys, and the next page starting after the row an ExclusiveStartKey names. `starts` records every
 * ExclusiveStartKey the handler sent, and `pagesOut` every LastEvaluatedKey it was given.
 */
function memoryDb(key, { pageSize = 1000, fail = null } = {}) {
  const rows = new Map(), writes = [], starts = [], pagesOut = [];
  const boom = op => { if (fail && fail(op)) throw new Error("ValidationException: " + SECRET); };
  const matches = (cond, it, vals) => {
    if (!cond) return true;
    if (cond === "attribute_not_exists(songId)") return !it;
    if (cond === "attribute_exists(songId) AND ownerId = :o") return !!it && it.ownerId === vals[":o"];
    throw new Error("unknown condition " + cond);
  };
  return { rows, writes, starts, pagesOut, db: {
    async get(p) { boom("get"); return { Item: rows.has(p.Key[key]) ? clone(rows.get(p.Key[key])) : undefined }; },
    async put(p) {
      boom("put");
      const id = p.Item[key];
      if (!matches(p.ConditionExpression, rows.get(id), p.ExpressionAttributeValues || {})) {
        const e = new Error("The conditional request failed"); e.name = "ConditionalCheckFailedException"; throw e; }
      writes.push(clone(p)); rows.set(id, clone(p.Item)); return {};
    },
    async del(p) { boom("del"); writes.push({ delete: p.Key[key] }); rows.delete(p.Key[key]); return {}; },
    async query(p) {
      boom("query");
      const mine = [...rows.values()].filter(it => it.ownerId === p.ExpressionAttributeValues[":o"])
        .sort((a, b) => (a.updated ?? 0) - (b.updated ?? 0) || String(a.songId).localeCompare(String(b.songId)));
      let from = 0;
      if ("ExclusiveStartKey" in p) {
        starts.push(clone(p.ExclusiveStartKey));
        const k = p.ExclusiveStartKey;
        from = mine.findIndex(it => it.songId === k.songId && it.ownerId === k.ownerId && it.updated === k.updated) + 1;
        if (from === 0) throw new Error("ValidationException: The provided starting key is invalid");
      }
      const page = mine.slice(from, from + pageSize), last = page.at(-1);
      const more = from + pageSize < mine.length ? { ownerId: last.ownerId, updated: last.updated, songId: last.songId } : undefined;
      if (more) pagesOut.push(clone(more));
      return p.Select === "COUNT" ? { Count: page.length, LastEvaluatedKey: more } : { Items: clone(page), LastEvaluatedKey: more };
    },
  } };
}

const ev = (method, { sub = "user-1", id, body, base64 = false } = {}) => ({
  requestContext: { http: { method }, authorizer: sub ? { jwt: { claims: { sub } } } : undefined },
  pathParameters: id ? { id } : undefined,
  body: body === undefined ? undefined : base64 ? Buffer.from(body).toString("base64") : body,
  isBase64Encoded: base64,
});
const json = r => JSON.parse(r.body);
let ids = 0;
const songsApi = (opts) => { const m = memoryDb("songId", opts); return { ...m, call: makeSongsHandler(m.db, { table: "Songs", now: () => 1000, newId: () => "id" + (++ids) }) }; };
const progressApi = (opts) => { const m = memoryDb("userId", opts); return { ...m, call: makeProgressHandler(m.db, { table: "Progress", now: () => 2000 }) }; };
const SONGS = clientSongs();
const aSong = () => clone(SONGS["currentSong, a planted Studio"]);

// ---------- songs ----------

test("a song the real client sends is stored, opens through GET, and loads into the same Studio", async () => {
  const api = songsApi();
  const { g, requests } = clientGame();
  for (const name of ["a quest's saved song", "a metered song with a pickup", "a song with long vines", "famousToSong chopsticks"]) {
    const song = SONGS[name];
    await g.cloudSongCreate(clone(song), song.meta && song.meta.title, "unlisted");   // what js/cloud.js really sends
    const sent = requests.at(-1);
    const r = await api.call(ev("POST", { body: sent.body }));
    assert.strictEqual(r.statusCode, 200, name + ": " + r.body);
    const { id, title } = json(r);
    assert.strictEqual(typeof api.rows.get(id).payload, "string", "stored as JSON text: the cap is the size");
    const got = json(await api.call(ev("GET", { sub: null, id })));   // a friend, signed out
    assert.strictEqual(got.title, title);
    assert.strictEqual(got.song.meta.title, title || null, name + ": no second title in the payload");
    const studio = s => { g.openStudioWith(clone(s)); const c = clone(g.currentSong()); delete c.meta; return c; };
    assert.deepStrictEqual(studio(got.song), studio(song), name);
  }
});

test("a share link made before TUN-83 still opens, whatever its row holds", async () => {
  const api = songsApi();
  const legacy = { v: 3, palette: "pentatonic", x: "free text a new write would refuse", time: { cols: 16 }, tracks: [] };
  api.rows.set("old1", { songId: "old1", ownerId: "someone", title: "Old", visibility: "unlisted", palette: "pentatonic", payload: legacy, created: 1, updated: 1 });
  const r = await api.call(ev("GET", { sub: null, id: "old1" }));
  assert.strictEqual(r.statusCode, 200);
  assert.deepStrictEqual(json(r).song, legacy, "an old row's map comes back exactly");
});

test("POST /songs refuses, with fixed messages and no write, everything that is not a real song", async () => {
  const cases = [
    [ev("POST", { body: "{not json" }), 400, "bad json"],
    [ev("POST", {}), 400, "bad json"],
    [ev("POST", { body: "" }), 400, "bad json"],
    [ev("POST", { body: "null" }), 400, "bad request"],
    [ev("POST", { body: "[]" }), 400, "bad request"],
    [ev("POST", { body: "7" }), 400, "bad request"],
    [ev("POST", { body: JSON.stringify({ song: aSong(), extra: "x" }) }), 400, "bad request"],
    [ev("POST", { body: '{"__proto__":{"x":1},"song":null}' }), 400, "bad request"],
    [ev("POST", { body: JSON.stringify({ song: aSong(), title: 7 }) }), 400, "bad request"],
    [ev("POST", { body: JSON.stringify({ song: aSong(), visibility: "everyone" }) }), 400, "bad request"],
    [ev("POST", { body: JSON.stringify({ title: "no song" }) }), 400, "bad song"],
    [ev("POST", { body: JSON.stringify({ song: null }) }), 400, "bad song"],
    [ev("POST", { body: JSON.stringify({ song: { ...aSong(), v: 2 } }) }), 400, "bad song"],
    [ev("POST", { body: JSON.stringify({ song: aSong(), title: "x".repeat(MAX_SONG_BODY_BYTES) }) }), 413, "too large"],
    [ev("POST", { body: JSON.stringify({ song: aSong(), title: "一".repeat(6000) }) }), 413, "too large"],   // 18 KB of UTF-8, 6 K code units
    [ev("POST", { body: JSON.stringify({ song: aSong(), title: "x".repeat(MAX_SONG_BODY_BYTES) }), base64: true }), 413, "too large"],
    [ev("POST", { sub: null, body: JSON.stringify({ song: aSong() }) }), 401, "unauthorized"],
  ];
  for (const [event, status, error] of cases) {
    const api = songsApi();
    const r = await api.call(event);
    assert.deepStrictEqual([r.statusCode, json(r)], [status, { error }], String(event.body).slice(0, 60));
    assert.strictEqual(api.writes.length, 0, "a refused request writes nothing");
  }
  // deep nesting inside meta (whose values are never stored) is bounded by the body cap and parses fine
  const deep = aSong(); deep.meta.source = JSON.parse("[".repeat(3000) + "]".repeat(3000));
  const api = songsApi();
  const r = await api.call(ev("POST", { body: JSON.stringify({ song: deep }) }));
  assert.strictEqual(r.statusCode, 200);
  assert.ok(!api.rows.get(json(r).id).payload.includes("[[["));
});

test("a base64 body and a multibyte title at the limit are read as the client meant", async () => {
  const api = songsApi();
  const r = await api.call(ev("POST", { body: JSON.stringify({ song: aSong(), title: "Été 🎵" }), base64: true }));
  assert.strictEqual(r.statusCode, 200, r.body);
  assert.strictEqual(json(r).title, "Été 🎵");
  // exactly at the body cap is accepted; one byte over is not
  const bodyOf = n => { const b = { song: aSong(), title: "" }; const pad = MAX_SONG_BODY_BYTES - Buffer.byteLength(JSON.stringify(b)) + n; b.title = "é".repeat(pad >> 1) + "x".repeat(pad & 1); return JSON.stringify(b); };
  assert.strictEqual(Buffer.byteLength(bodyOf(0)), MAX_SONG_BODY_BYTES);
  assert.strictEqual((await api.call(ev("POST", { body: bodyOf(0) }))).statusCode, 200);
  assert.strictEqual((await api.call(ev("POST", { body: bodyOf(1) }))).statusCode, 413);
});

test("the per-account cap counts every page, forwarding DynamoDB's keys unchanged, and stops at 50", async () => {
  for (const [have, status] of [[MAX_PER_USER - 1, 200], [MAX_PER_USER, 409], [MAX_PER_USER + 7, 409]]) {
    const api = songsApi({ pageSize: 7 });   // the old single COUNT query would have seen 7
    for (let i = 0; i < have; i++)
      api.rows.set("s" + i, { songId: "s" + i, ownerId: "user-1", updated: 100 + (i % 5), payload: "{}" });
    api.rows.set("other", { songId: "other", ownerId: "user-2", updated: 1, payload: "{}" });
    const r = await api.call(ev("POST", { body: JSON.stringify({ song: aSong() }) }));
    assert.strictEqual(r.statusCode, status, `${have} songs`);
    // every ExclusiveStartKey sent is exactly a LastEvaluatedKey received, in order
    assert.deepStrictEqual(api.starts, api.pagesOut.slice(0, api.starts.length), `${have}: keys forwarded unchanged`);
    assert.ok(api.starts.length >= Math.min(have, MAX_PER_USER) / 7 - 1, `${have}: it paged`);
    for (const k of api.starts) assert.deepStrictEqual(Object.keys(k).sort(), ["ownerId", "songId", "updated"]);
    if (status === 409) {
      assert.deepStrictEqual(json(r), { error: "song limit reached" });
      assert.strictEqual(api.writes.length, 0, "a refused create writes nothing");
    } else assert.strictEqual(api.writes.length, 1);
  }
});

test("PUT /songs validates a new song, renames only a valid stored one, and cannot resurrect a deleted one", async () => {
  const api = songsApi();
  const id = json(await api.call(ev("POST", { body: JSON.stringify({ song: aSong(), title: "First" }) }))).id;
  const bad = { ...aSong(), tracks: [{ kind: "melody", notes: [{ p: "72", c: 0 }] }] };
  assert.strictEqual((await api.call(ev("PUT", { id, body: JSON.stringify({ song: bad }) }))).statusCode, 400);
  assert.strictEqual((await api.call(ev("PUT", { id, sub: "user-2", body: JSON.stringify({ title: "Mine now" }) }))).statusCode, 403);

  // a rename keeps the song and rewrites meta.title; with no title the stored one stays
  assert.strictEqual((await api.call(ev("PUT", { id, body: JSON.stringify({ title: "Renamed\u0001" }) }))).statusCode, 200);
  let got = json(await api.call(ev("GET", { id })));
  assert.deepStrictEqual([got.title, got.song.meta.title], ["Renamed", "Renamed"]);
  assert.strictEqual((await api.call(ev("PUT", { id, body: JSON.stringify({ song: null }) }))).statusCode, 200);
  assert.strictEqual(json(await api.call(ev("GET", { id }))).title, "Renamed");

  // an old row that fails the check cannot be renamed, and is left exactly as it was
  const legacy = { v: 3, palette: "pentatonic", x: "free text", time: { cols: 16 }, tracks: [] };
  api.rows.set("old1", { songId: "old1", ownerId: "user-1", title: "Old", payload: legacy, updated: 1 });
  const before = clone(api.rows.get("old1"));
  assert.strictEqual((await api.call(ev("PUT", { id: "old1", body: JSON.stringify({ title: "New" }) }))).statusCode, 400);
  assert.deepStrictEqual(api.rows.get("old1"), before);

  // the update's put is conditional: a delete between its read and its write wins
  const realGet = api.db.get;
  api.db.get = async p => { const r = await realGet(p); api.rows.delete(id); return r; };
  const r = await api.call(ev("PUT", { id, body: JSON.stringify({ title: "Too late" }) }));
  api.db.get = realGet;
  assert.strictEqual(r.statusCode, 404);
  assert.ok(!api.rows.has(id), "the deleted song stayed deleted");
});

test("an unexpected failure answers a fixed 500 and never the error's message", async () => {
  // each route, with a failure in a call that route certainly makes (the row exists and is the caller's)
  const routes = [
    ["POST create", "query", () => ev("POST", { body: JSON.stringify({ song: aSong() }) })],
    ["POST create", "put", () => ev("POST", { body: JSON.stringify({ song: aSong() }) })],
    ["GET a song", "get", () => ev("GET", { id: "mine" })],
    ["GET my songs", "query", () => ev("GET", {})],
    ["PUT replace", "get", () => ev("PUT", { id: "mine", body: JSON.stringify({ song: aSong() }) })],
    ["PUT replace", "put", () => ev("PUT", { id: "mine", body: JSON.stringify({ song: aSong() }) })],
    ["DELETE", "get", () => ev("DELETE", { id: "mine" })],
    ["DELETE", "del", () => ev("DELETE", { id: "mine" })],
  ];
  for (const [name, op, event] of routes) {
    let armed = false;
    const api = songsApi({ fail: o => armed && o === op });
    api.rows.set("mine", { songId: "mine", ownerId: "user-1", title: "T", updated: 1, payload: JSON.stringify(aSong()) });
    armed = true;
    const r = await api.call(event());
    assert.deepStrictEqual([r.statusCode, json(r)], [500, { error: "server error" }], `${name}, ${op} fails`);
    assert.ok(!r.body.includes("SECRET") && !r.body.includes("ValidationException"), name);
  }
  const p = progressApi({ fail: () => true });
  logged.length = 0;
  const r = await p.call(ev("PUT", { body: JSON.stringify({ v: 1, packages: {} }) }));
  assert.deepStrictEqual([r.statusCode, json(r)], [500, { error: "server error" }]);
  assert.ok(logged.some(([kind, , e]) => kind === "error" && String(e).includes("SECRET")),
    "the real error still reaches the logs (CloudWatch), just not the caller");
});

// Saved songs as OLDER clients wrote them, sent raw — My Melodies' 🔗 passes the save to shareSong as it
// is, never through applySong — so today's clamping loader cannot have tidied them (GPT's PR review).
function oldSave({ cols, voice, longLen }) {
  const notes = [];
  for (let c = 0; c < cols; c += 8) notes.push({ p: [60, 62, 64, 67, 69][(c / 8) % 5], c, len: 1 });
  notes[0].len = longLen;                                    // a retired time-insert stretched it past 8
  return { v: 3, meta: { title: "Old one", created: 1700000000000, updated: 1700000000000, author: null },
    palette: "pentatonic", time: { cols, tempo: 108, groove: 0 },
    tracks: [{ kind: "melody", voice, notes }, { kind: "drums", hits: [{ lane: 0, c: 0 }, { lane: 2, c: cols - 1 }] }] };
}

test("a saved song from before TUN-84, shared from My Melodies, is stored as it was saved", async () => {
  const saved = [oldSave({ cols: 1928, voice: "pluck", longLen: 12 }), oldSave({ cols: 2400, voice: "pad", longLen: 30 })];
  const { g, requests, copied } = clientGame({ saves: saved });
  g.userPool = { getCurrentUser: () => ({}) };            // signed in, so shareSong may use the cloud
  const api = songsApi();
  for (const [i, raw] of saved.entries()) {
    const it = g.getSaves()[i];                           // My Melodies' row; its 🔗 runs shareSong(it)
    assert.deepStrictEqual(it, raw, "the save is read back as the older client wrote it");
    assert.ok(g.encodeSong(it).length > g.SHARE_MAX, "too big for a link, so it really goes to the cloud");
    const before = requests.length;
    await g.shareSong(it);
    assert.strictEqual(requests.length, before + 1, "shareSong sent one request");
    const sent = requests.at(-1);
    assert.deepStrictEqual([sent.method, /\/songs$/.test(sent.url)], ["POST", true]);
    const r = await api.call(ev("POST", { body: sent.body }));
    assert.strictEqual(r.statusCode, 200, `${raw.time.cols} columns, ${raw.tracks[0].voice}: ${r.body}`);
    const got = json(await api.call(ev("GET", { sub: null, id: json(r).id })));
    assert.deepStrictEqual(got.song.tracks, raw.tracks, "notes, retired voice and long holds stored as saved");
    assert.strictEqual(got.song.time.cols, raw.time.cols);
    assert.strictEqual(got.title, "Old one");
    assert.ok(copied.at(-1).endsWith("#song=fake-id"), "the player got a cloud link");
  }
});

test("PUT /songs replaces a song: base64 body, stored as text, title kept when omitted", async () => {
  const api = songsApi();
  const id = json(await api.call(ev("POST", { body: JSON.stringify({ song: aSong(), title: "Keep me" }) }))).id;
  const next = clone(SONGS["a metered song with a pickup"]);
  next.tracks[1].hits = [{ lane: 1, c: 3 }, { lane: 2, c: 7 }];
  const r = await api.call(ev("PUT", { id, body: JSON.stringify({ song: next }), base64: true }));
  assert.strictEqual(r.statusCode, 200, r.body);
  const row = api.rows.get(id);
  assert.strictEqual(typeof row.payload, "string");
  assert.deepStrictEqual([row.title, row.updated, row.palette], ["Keep me", 1000, next.palette]);
  const got = json(await api.call(ev("GET", { id })));
  assert.deepStrictEqual([got.song.tracks, got.song.time], [next.tracks, next.time]);
  assert.strictEqual(got.song.meta.title, "Keep me");
});

test("PUT /songs refuses, with fixed messages and no write, everything that is not a real song", async () => {
  const seeded = () => {
    const api = songsApi();
    api.rows.set("mine", { songId: "mine", ownerId: "user-1", title: "T", updated: 1, payload: JSON.stringify(V_SONG()) });
    return api;
  };
  const V_SONG = () => V.checkSong(aSong(), "T").value;
  const nested = aSong(); nested.time.extra = 1;
  const cases = [
    [{}, 400, "bad json"], [{ body: "" }, 400, "bad json"], [{ body: "{" }, 400, "bad json"],
    [{ body: "null" }, 400, "bad request"], [{ body: "[]" }, 400, "bad request"], [{ body: "3" }, 400, "bad request"],
    [{ body: JSON.stringify({ song: nested }) }, 400, "bad song"],
    [{ body: JSON.stringify({ song: aSong(), mood: "happy" }) }, 400, "bad request"],
  ];
  for (const [opts, status, error] of cases) {
    const api = seeded(), before = clone(api.rows.get("mine"));
    const r = await api.call(ev("PUT", { id: "mine", ...opts }));
    assert.deepStrictEqual([r.statusCode, json(r)], [status, { error }], String(opts.body));
    assert.deepStrictEqual([api.writes.length, api.rows.get("mine")], [0, before]);
  }
  // exactly at the body cap is read; one byte over is 413, plain and base64
  const bodyOf = n => { const b = { song: aSong(), title: "" }; const pad = MAX_SONG_BODY_BYTES - Buffer.byteLength(JSON.stringify(b)) + n; b.title = "é".repeat(pad >> 1) + "x".repeat(pad & 1); return JSON.stringify(b); };
  for (const base64 of [false, true]) {
    assert.strictEqual((await seeded().call(ev("PUT", { id: "mine", body: bodyOf(0), base64 }))).statusCode, 200);
    const over = seeded();
    assert.deepStrictEqual([(await over.call(ev("PUT", { id: "mine", body: bodyOf(1), base64 }))).statusCode, over.writes.length], [413, 0]);
  }
});

test("a valid song whose stored form is over 16 KB is 413, though its request is under the body cap", async () => {
  const big = aSong(); big.time.cols = 1920;
  big.tracks[0].notes = [];
  for (let c = 0; V.checkSong(big, "").ok; c++) big.tracks[0].notes.push({ p: 60 + (c % 24), c: c % 1920, len: 1 + (c % 8) });
  const r = V.checkSong(big, "");
  assert.deepStrictEqual([r.ok, r.error], [false, "too large"], "the song is valid but over the stored cap");
  const body = JSON.stringify({ song: big });
  assert.ok(Buffer.byteLength(body) <= MAX_SONG_BODY_BYTES, "and its request is not");
  const post = songsApi();
  assert.deepStrictEqual([(await post.call(ev("POST", { body }))).statusCode, post.writes.length], [413, 0]);
  const put = songsApi();
  put.rows.set("mine", { songId: "mine", ownerId: "user-1", title: "T", updated: 1, payload: "{}" });
  const before = clone(put.rows.get("mine"));
  assert.strictEqual((await put.call(ev("PUT", { id: "mine", body }))).statusCode, 413);
  assert.deepStrictEqual([put.writes.length, put.rows.get("mine")], [0, before]);
});

// ---------- progress ----------

test("PUT /progress stores the progress the real client pushes, and GET returns it", async () => {
  const api = progressApi();
  // the largest progress the game can write, pushed by its own cloudPush, as a save does 900 ms after a change
  const { g, requests } = playedThroughProgress({ tools: "every" });
  await g.cloudPush();
  const push = requests.at(-1);
  assert.deepStrictEqual([push.method, /\/progress$/.test(push.url)], ["PUT", true]);
  const body = push.body;
  assert.ok(Buffer.byteLength(body) <= MAX_PROGRESS_BYTES);
  const r = await api.call(ev("PUT", { body }));
  assert.strictEqual(r.statusCode, 200, r.body);
  assert.strictEqual(typeof api.rows.get("user-1").data, "string");
  const got = json(await api.call(ev("GET", {})));
  assert.deepStrictEqual(got, JSON.parse(body));
});

test("GET /progress returns an old row unchanged, and null when there is none", async () => {
  const api = progressApi();
  assert.strictEqual(json(await api.call(ev("GET", {}))), null);
  const legacy = { v: 1, packages: {}, anything: "x".repeat(50000) };
  api.rows.set("user-1", { userId: "user-1", data: legacy, updated: 1 });
  assert.deepStrictEqual(json(await api.call(ev("GET", {}))), legacy);
});

test("PUT /progress refuses, with fixed messages and no write, everything that is not real progress", async () => {
  const fine = JSON.stringify({ v: 1, packages: {} });
  const cases = [
    [ev("PUT", { body: "{" }), 400, "bad json"],
    [ev("PUT", {}), 400, "bad json"],
    [ev("PUT", { body: "null" }), 400, "bad progress"],
    [ev("PUT", { body: '"progress"' }), 400, "bad progress"],
    [ev("PUT", { body: JSON.stringify({ v: 1, packages: {}, note: "hi" }) }), 400, "bad progress"],
    [ev("PUT", { body: '{"v":1,"packages":{"__proto__":{}}}' }), 400, "bad progress"],
    [ev("PUT", { body: JSON.stringify({ v: 1, packages: {}, name: "x".repeat(MAX_PROGRESS_BYTES) }) }), 413, "too large"],
    [ev("PUT", { body: JSON.stringify({ v: 1, packages: {}, name: "一".repeat(6000) }) }), 413, "too large"],
    [ev("PUT", { body: fine, sub: null }), 401, "unauthorized"],
    [ev("POST", { body: fine }), 405, "method not allowed"],
  ];
  for (const [event, status, error] of cases) {
    const api = progressApi();
    const r = await api.call(event);
    assert.deepStrictEqual([r.statusCode, json(r)], [status, { error }], String(event.body).slice(0, 60));
    assert.strictEqual(api.writes.length, 0, "a refused request writes nothing");
  }
  const api = progressApi();
  assert.strictEqual((await api.call(ev("PUT", { body: fine, base64: true }))).statusCode, 200);
});

test("PUT /progress reads a body of exactly 16 KB and refuses one byte more, plain and base64", async () => {
  // multibyte padding in `name`, which the validator cuts to 20 characters — the BODY is what is measured
  const bodyOf = n => { const b = { v: 1, packages: { intro: { level: 1 } }, name: "" };
    const pad = MAX_PROGRESS_BYTES - Buffer.byteLength(JSON.stringify(b)) + n;
    b.name = "é".repeat(pad >> 1) + "x".repeat(pad & 1); return JSON.stringify(b); };
  assert.strictEqual(Buffer.byteLength(bodyOf(0)), MAX_PROGRESS_BYTES);
  for (const base64 of [false, true]) {
    const ok = progressApi();
    assert.strictEqual((await ok.call(ev("PUT", { body: bodyOf(0), base64 }))).statusCode, 200);
    assert.strictEqual(JSON.parse(ok.rows.get("user-1").data).name.length, 20);
    const over = progressApi();
    const r = await over.call(ev("PUT", { body: bodyOf(1), base64 }));
    assert.deepStrictEqual([r.statusCode, json(r), over.writes.length], [413, { error: "too large" }, 0]);
  }
});
