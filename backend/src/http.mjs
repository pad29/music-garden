// What every handler shares (TUN-83): a fixed-message reply, and reading a JSON body under a byte cap.
// Pure — no AWS SDK — so the tests load it with nothing installed.
const JSON_HEADERS = { "content-type": "application/json" };

export function reply(statusCode, body) { return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) }; }

// The catch-all for anything the handler did not expect. The exception goes to CloudWatch, never to the
// caller: an error's message can carry table names, keys or the SDK's internals.
export function serverError(where, e) {
  console.error(where, e);
  return reply(500, { error: "server error" });
}

// A refusal from validate.mjs: "too large" is 413, everything else 400. `why` is logged, not sent.
export function refuse(where, r) {
  console.log(where, "refused:", r.error, r.why);
  return reply(r.error === "too large" ? 413 : 400, { error: r.error });
}

// The size is checked BEFORE JSON.parse, so a huge body costs a length test, not a parse.
// { ok:true, value } or { ok:false, error, why }.
export function readJson(event, maxBytes) {
  let text = event && event.body;
  if (typeof text !== "string" || text === "") return { ok: false, error: "bad json", why: "no body" };
  if (event.isBase64Encoded) {
    if (text.length > Math.ceil(maxBytes / 3) * 4 + 4) return { ok: false, error: "too large", why: "body" };
    text = Buffer.from(text, "base64").toString("utf8");
  }
  if (Buffer.byteLength(text, "utf8") > maxBytes) return { ok: false, error: "too large", why: "body" };
  try { return { ok: true, value: JSON.parse(text) }; }
  catch { return { ok: false, error: "bad json", why: "parse" }; }
}

// Rows written since TUN-83 hold JSON text; older rows hold a DynamoDB map. Both read back the same.
export const stored = x => (typeof x === "string" ? JSON.parse(x) : x);
