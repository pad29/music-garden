// Progress API: GET/PUT the caller's own progress record.
// The HTTP API's JWT authorizer has already validated the Cognito ID token; we read the user id from the
// token claims (`sub`), so a caller can only ever touch their own row.
//
// The logic, without the AWS SDK: progress.mjs passes in `db` ({ get, put } over plain DocumentClient
// parameter objects) so tests/backend-handlers.test.mjs can drive it. What progress may hold is
// validate.mjs's alone (TUN-83).
import { checkProgress, MAX_PROGRESS_BYTES } from "./validate.mjs";
import { reply, serverError, refuse, readJson, stored } from "./http.mjs";

// …except that a player's name saved before TUN-93 never leaves the server again: the name stays on the device.
// Only the top-level `name` goes; everything else, and an explicit null, is returned as stored.
function withoutName(p) {
  if (!p || typeof p !== "object" || Array.isArray(p) || !Object.hasOwn(p, "name")) return p;
  const { name, ...rest } = p;
  return rest;
}

export function makeProgressHandler(db, { table, now = Date.now } = {}) {
  return async (event) => {
    const sub = event?.requestContext?.authorizer?.jwt?.claims?.sub;
    const method = event?.requestContext?.http?.method;
    if (!sub) return reply(401, { error: "unauthorized" });
    try {
      if (method === "GET") {   // never validated: a row from before TUN-83 loads as it did…
        const r = await db.get({ TableName: table, Key: { userId: sub } });
        return reply(200, withoutName(r.Item ? stored(r.Item.data) ?? null : null));
      }
      if (method === "PUT") {
        const body = readJson(event, MAX_PROGRESS_BYTES);
        if (!body.ok) return refuse("PUT /progress", body);
        const p = checkProgress(body.value);
        if (!p.ok) return refuse("PUT /progress", p);
        await db.put({ TableName: table, Item: { userId: sub, data: p.text, updated: now() } });
        return reply(200, { ok: true });
      }
      return reply(405, { error: "method not allowed" });
    } catch (e) {
      return serverError("progress", e);
    }
  };
}
