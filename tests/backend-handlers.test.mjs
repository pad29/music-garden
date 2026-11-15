// The backend's handlers (TUN-83), driven without the AWS SDK: backend/src/songs-api.mjs and
// progress-api.mjs take their DynamoDB access as four plain functions, and here those are an in-memory
// table that records every write. songs.mjs and progress.mjs only wire the real SDK into them.
import { test } from "node:test";
import assert from "node:assert";
import { makeSongsHandler } from "../backend/src/songs-api.mjs";
import { makeProgressHandler } from "../backend/src/progress-api.mjs";
import { MAX_SONG_BODY_BYTES, MAX_PROGRESS_BYTES, MAX_PER_USER } from "../backend/src/validate.mjs";
import { clientGame, clientSongs, playedThroughProgress } from "./helpers/backend-fixtures.mjs";

const clone = x => JSON.parse(JSON.stringify(x));
// The handlers log every refusal and failure for CloudWatch. Keep those lines out of the test output, and
// keep them, so a test can check what a 500 logged.
const logged = [];
console.log = (...a) => logged.push(["log", ...a]);
console.error = (...a) => logged.push(["error", ...a]);
const SECRET = "arn:aws:dynamodb:us-east-1:123456789012:table/SECRET-internal";

/** An in-memory table keyed by `key`, with a byOwner query that pages every `pageSize` rows. */
function memoryDb(key, { pageSize = 1000, fail = null } = {}) {
  const rows = new Map(), writes = [];
  const boom = op => { if (fail && fail(op)) throw new Error("ValidationException: " + SECRET); };
  const matches = (cond, it, vals) => {
    if (!cond) return true;
    if (cond === "attribute_not_exists(songId)") return !it;
    if (cond === "attribute_exists(songId) AND ownerId = :o") return !!it && it.ownerId === vals[":o"];
    throw new Error("unknown condition " + cond);
  };
  return { rows, writes, db: {
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
      const mine = [...rows.values()].filter(it => it.ownerId === p.ExpressionAttributeValues[":o"]);
      const from = p.ExclusiveStartKey ? p.ExclusiveStartKey.i : 0, page = mine.slice(from, from + pageSize);
      const more = from + pageSize < mine.length ? { i: from + pageSize } : undefined;
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

test("the per-account cap counts every page, and stops at 50", async () => {
  for (const [have, status] of [[MAX_PER_USER - 1, 200], [MAX_PER_USER, 409], [MAX_PER_USER + 7, 409]]) {
    const api = songsApi({ pageSize: 7 });   // the old single COUNT query would have seen 7
    for (let i = 0; i < have; i++) api.rows.set("s" + i, { songId: "s" + i, ownerId: "user-1", payload: "{}" });
    api.rows.set("other", { songId: "other", ownerId: "user-2", payload: "{}" });
    const r = await api.call(ev("POST", { body: JSON.stringify({ song: aSong() }) }));
    assert.strictEqual(r.statusCode, status, `${have} songs`);
    if (status === 409) assert.deepStrictEqual(json(r), { error: "song limit reached" });
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
  for (const op of ["get", "put", "query"]) {
    const api = songsApi({ fail: o => o === op });
    for (const event of [ev("POST", { body: JSON.stringify({ song: aSong() }) }), ev("GET", { id: "x" }), ev("GET", {})]) {
      const r = await api.call(event);
      if (r.statusCode !== 500) continue;   // this route did not reach the failing call
      assert.deepStrictEqual(json(r), { error: "server error" });
      assert.ok(!r.body.includes("SECRET") && !r.body.includes("ValidationException"), op);
    }
  }
  const p = progressApi({ fail: () => true });
  logged.length = 0;
  const r = await p.call(ev("PUT", { body: JSON.stringify({ v: 1, packages: {} }) }));
  assert.deepStrictEqual([r.statusCode, json(r)], [500, { error: "server error" }]);
  assert.ok(logged.some(([kind, , e]) => kind === "error" && String(e).includes("SECRET")),
    "the real error still reaches the logs (CloudWatch), just not the caller");
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
