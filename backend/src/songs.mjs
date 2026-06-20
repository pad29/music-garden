// Songs API (SAVE-SHARE.md P3): cloud storage for shareable creations.
//   POST   /songs        create (auth)           -> { id }
//   GET    /songs        list the caller's songs (auth)
//   GET    /songs/{id}   resolve a share link (NO auth; private songs owner-only)
//   PUT    /songs/{id}   update (auth, owner-only)
//   DELETE /songs/{id}   delete (auth, owner-only)
// One DynamoDB row per song (PK = random songId; GSI byOwner for listing). Songs are private/unlisted only —
// a public gallery (and its moderation) is deferred to P4. Title is the only free-text field; it's length-capped
// and control-char-stripped here (full profanity moderation lands with the gallery).
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { randomBytes } from "crypto";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.SONGS_TABLE;
const JSON_HEADERS = { "content-type": "application/json" };
const MAX_BYTES = 100 * 1024;   // payload size cap (DynamoDB item limit is 400KB — stay well under)
const MAX_PER_USER = 200;       // soft per-user song cap (abuse/storage guard)
const TITLE_MAX = 60;

export const handler = async (event) => {
  const method = event?.requestContext?.http?.method;
  const sub = event?.requestContext?.authorizer?.jwt?.claims?.sub || null;   // null on the unauthenticated GET /songs/{id}
  const id = event?.pathParameters?.id;
  try {
    if (method === "POST"   && !id) return await createSong(event, sub);
    if (method === "GET"    &&  id) return await getSong(id, sub);
    if (method === "GET"    && !id) return await listMine(sub);
    if (method === "PUT"    &&  id) return await updateSong(event, id, sub);
    if (method === "DELETE" &&  id) return await deleteSong(id, sub);
    return reply(405, { error: "method not allowed" });
  } catch (e) {
    return reply(500, { error: String((e && e.message) || e) });
  }
};

// strip control chars (code < 32) without a regex literal, then cap length
const sanitizeTitle = t => (typeof t === "string" ? t : "").split("").filter(ch => ch.charCodeAt(0) >= 32).join("").trim().slice(0, TITLE_MAX);
const newId = () => randomBytes(8).toString("base64url");   // ~11 url-safe chars, not enumerable

async function createSong(event, sub) {
  if (!sub) return reply(401, { error: "unauthorized" });
  const body = event.body ? JSON.parse(event.body) : null;
  const song = body && body.song;
  if (!song || song.v !== 3) return reply(400, { error: "bad song" });
  const payload = JSON.stringify(song);
  if (payload.length > MAX_BYTES) return reply(413, { error: "song too large" });

  const cnt = await ddb.send(new QueryCommand({ TableName: TABLE, IndexName: "byOwner",
    KeyConditionExpression: "ownerId = :o", ExpressionAttributeValues: { ":o": sub }, Select: "COUNT" }));
  if ((cnt.Count || 0) >= MAX_PER_USER) return reply(409, { error: "song limit reached" });

  const now = Date.now();
  const title = sanitizeTitle(body.title || (song.meta && song.meta.title));
  // P3 ships UNLISTED only (link-shareable). "private" (owner-only read) and "public" (gallery) both need an
  // identity-aware read route — the public GET /songs/{id} has no authorizer — so they land together in P4.
  const visibility = "unlisted";
  for (let attempt = 0; attempt < 3; attempt++) {     // retry the (astronomically unlikely) id collision
    const songId = newId();
    try {
      await ddb.send(new PutCommand({ TableName: TABLE,
        Item: { songId, ownerId: sub, title, visibility, palette: song.palette || "pentatonic", payload: song, created: now, updated: now },
        ConditionExpression: "attribute_not_exists(songId)" }));
      return reply(200, { id: songId, title, visibility });
    } catch (e) { if (e.name !== "ConditionalCheckFailedException") throw e; }
  }
  return reply(500, { error: "could not allocate id" });
}

async function getSong(id, sub) {
  const r = await ddb.send(new GetCommand({ TableName: TABLE, Key: { songId: id } }));
  const it = r.Item;
  if (!it) return reply(404, { error: "not found" });
  if (it.visibility === "private" && it.ownerId !== sub) return reply(404, { error: "not found" });
  return reply(200, { id: it.songId, title: it.title, palette: it.palette, visibility: it.visibility,
    updated: it.updated, song: it.payload, mine: !!sub && it.ownerId === sub });
}

async function listMine(sub) {
  if (!sub) return reply(401, { error: "unauthorized" });
  const r = await ddb.send(new QueryCommand({ TableName: TABLE, IndexName: "byOwner",
    KeyConditionExpression: "ownerId = :o", ExpressionAttributeValues: { ":o": sub }, ScanIndexForward: false }));
  const songs = (r.Items || []).map(it => ({ id: it.songId, title: it.title, palette: it.palette, visibility: it.visibility, updated: it.updated }));
  return reply(200, { songs });
}

async function updateSong(event, id, sub) {
  if (!sub) return reply(401, { error: "unauthorized" });
  const r = await ddb.send(new GetCommand({ TableName: TABLE, Key: { songId: id } }));
  const it = r.Item;
  if (!it) return reply(404, { error: "not found" });
  if (it.ownerId !== sub) return reply(403, { error: "forbidden" });
  const body = event.body ? JSON.parse(event.body) : {};
  const song = body.song || it.payload;
  if (song.v !== 3) return reply(400, { error: "bad song" });
  const payload = JSON.stringify(song);
  if (payload.length > MAX_BYTES) return reply(413, { error: "song too large" });
  const title = body.title != null ? sanitizeTitle(body.title) : it.title;
  await ddb.send(new PutCommand({ TableName: TABLE,
    Item: { ...it, title, visibility: "unlisted", palette: song.palette || it.palette, payload: song, updated: Date.now() } }));
  return reply(200, { ok: true });
}

async function deleteSong(id, sub) {
  if (!sub) return reply(401, { error: "unauthorized" });
  const r = await ddb.send(new GetCommand({ TableName: TABLE, Key: { songId: id } }));
  const it = r.Item;
  if (it && it.ownerId !== sub) return reply(403, { error: "forbidden" });
  await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { songId: id } }));
  return reply(200, { ok: true });
}

function reply(statusCode, body) { return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) }; }
