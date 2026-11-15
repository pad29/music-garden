// Songs API (SAVE-SHARE.md § 6): cloud storage for shareable creations.
//   POST   /songs        create (auth)           -> { id, title, visibility }
//   GET    /songs        list the caller's songs (auth)
//   GET    /songs/{id}   resolve a share link (NO auth; private songs owner-only)
//   PUT    /songs/{id}   update (auth, owner-only) — the game never calls it
//   DELETE /songs/{id}   delete (auth, owner-only)
// One DynamoDB row per song (PK = random songId; GSI byOwner for listing). Songs are unlisted only.
//
// The logic, without the AWS SDK: songs.mjs passes in `db`, four functions over plain DynamoDB
// DocumentClient parameter objects — get, put, query, del — so tests/backend-handlers.test.mjs can drive
// this with an in-memory table. What a song may hold is validate.mjs's alone (TUN-83).
import { checkSong, checkSongRequest, chooseTitle, sanitizeTitle, MAX_SONG_BODY_BYTES, MAX_PER_USER } from "./validate.mjs";
import { reply, serverError, refuse, readJson, stored } from "./http.mjs";
import { randomBytes } from "node:crypto";

const newSongId = () => randomBytes(8).toString("base64url");   // ~11 url-safe chars, not enumerable
const conditionFailed = e => e && e.name === "ConditionalCheckFailedException";

export function makeSongsHandler(db, { table, now = Date.now, newId = newSongId } = {}) {
  return async (event) => {
    const method = event?.requestContext?.http?.method;
    const sub = event?.requestContext?.authorizer?.jwt?.claims?.sub || null;   // null on the public GET
    const id = event?.pathParameters?.id;
    try {
      if (method === "POST"   && !id) return await createSong(event, sub);
      if (method === "GET"    &&  id) return await getSong(id, sub);
      if (method === "GET"    && !id) return await listMine(sub);
      if (method === "PUT"    &&  id) return await updateSong(event, id, sub);
      if (method === "DELETE" &&  id) return await deleteSong(id, sub);
      return reply(405, { error: "method not allowed" });
    } catch (e) {
      return serverError("songs", e);
    }
  };

  // The owner's songs, counted page by page: one COUNT query stops at 1 MB of read data, so a single
  // page under-counted any account with big songs. A SOFT cap: two creates at once can both count 49,
  // and the byOwner index is eventually consistent, so an account can briefly pass it by one or two.
  async function countMine(sub) {
    let count = 0, start;
    do {
      const params = { TableName: table, IndexName: "byOwner", KeyConditionExpression: "ownerId = :o",
        ExpressionAttributeValues: { ":o": sub }, Select: "COUNT" };
      if (start) params.ExclusiveStartKey = start;
      const r = await db.query(params);
      count += r.Count || 0; start = r.LastEvaluatedKey;
    } while (start && count < MAX_PER_USER);
    return count;
  }

  async function createSong(event, sub) {
    if (!sub) return reply(401, { error: "unauthorized" });
    const body = readJson(event, MAX_SONG_BODY_BYTES);
    if (!body.ok) return refuse("POST /songs", body);
    const req = checkSongRequest(body.value);
    if (!req.ok) return refuse("POST /songs", req);
    const title = chooseTitle(req.title, req.song);
    const song = checkSong(req.song, title);              // no song at all is refused here too: "bad song"
    if (!song.ok) return refuse("POST /songs", song);

    if ((await countMine(sub)) >= MAX_PER_USER) return reply(409, { error: "song limit reached" });
    const t = now();
    const visibility = "unlisted";   // private and public both need an identity-aware read route (P4)
    for (let attempt = 0; attempt < 3; attempt++) {     // retry the (astronomically unlikely) id collision
      const songId = newId();
      try {
        await db.put({ TableName: table,
          Item: { songId, ownerId: sub, title, visibility, palette: song.value.palette, payload: song.text, created: t, updated: t },
          ConditionExpression: "attribute_not_exists(songId)" });
        return reply(200, { id: songId, title, visibility });
      } catch (e) { if (!conditionFailed(e)) throw e; }
    }
    return reply(500, { error: "could not allocate id" });
  }

  // Never validated: a link made before TUN-83 opens exactly as it did.
  async function getSong(id, sub) {
    const r = await db.get({ TableName: table, Key: { songId: id } });
    const it = r.Item;
    if (!it) return reply(404, { error: "not found" });
    if (it.visibility === "private" && it.ownerId !== sub) return reply(404, { error: "not found" });
    return reply(200, { id: it.songId, title: it.title, palette: it.palette, visibility: it.visibility,
      updated: it.updated, song: stored(it.payload), mine: !!sub && it.ownerId === sub });
  }

  async function listMine(sub) {
    if (!sub) return reply(401, { error: "unauthorized" });
    const r = await db.query({ TableName: table, IndexName: "byOwner",
      KeyConditionExpression: "ownerId = :o", ExpressionAttributeValues: { ":o": sub }, ScanIndexForward: false });
    const songs = (r.Items || []).map(it => ({ id: it.songId, title: it.title, palette: it.palette, visibility: it.visibility, updated: it.updated }));
    return reply(200, { songs });
  }

  // A new song, a new title, or both. With no song it is a rename, and the stored song goes through the
  // same check: a row that fails it (from before TUN-83) cannot be renamed, and is never altered.
  async function updateSong(event, id, sub) {
    if (!sub) return reply(401, { error: "unauthorized" });
    const r = await db.get({ TableName: table, Key: { songId: id } });
    const it = r.Item;
    if (!it) return reply(404, { error: "not found" });
    if (it.ownerId !== sub) return reply(403, { error: "forbidden" });
    const body = readJson(event, MAX_SONG_BODY_BYTES);
    if (!body.ok) return refuse("PUT /songs", body);
    const req = checkSongRequest(body.value);
    if (!req.ok) return refuse("PUT /songs", req);
    const title = req.title !== null ? sanitizeTitle(req.title) : it.title;
    const song = checkSong(req.song !== null ? req.song : stored(it.payload), title);
    if (!song.ok) return refuse("PUT /songs", song);
    try {
      // Conditional, so an update racing a delete cannot bring the song back past the count.
      await db.put({ TableName: table,
        Item: { ...it, title, visibility: "unlisted", palette: song.value.palette, payload: song.text, updated: now() },
        ConditionExpression: "attribute_exists(songId) AND ownerId = :o", ExpressionAttributeValues: { ":o": sub } });
    } catch (e) {
      if (conditionFailed(e)) return reply(404, { error: "not found" });
      throw e;
    }
    return reply(200, { ok: true });
  }

  async function deleteSong(id, sub) {
    if (!sub) return reply(401, { error: "unauthorized" });
    const r = await db.get({ TableName: table, Key: { songId: id } });
    const it = r.Item;
    if (it && it.ownerId !== sub) return reply(403, { error: "forbidden" });
    await db.del({ TableName: table, Key: { songId: id } });
    return reply(200, { ok: true });
  }
}
