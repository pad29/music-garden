// Progress API: GET/PUT the caller's own progress record.
// The HTTP API's JWT authorizer has already validated the Cognito ID token; we read the
// user id from the token claims (`sub`), so a caller can only ever touch their own row.
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TABLE_NAME;
const JSON_HEADERS = { "content-type": "application/json" };

export const handler = async (event) => {
  const sub = event?.requestContext?.authorizer?.jwt?.claims?.sub;
  const method = event?.requestContext?.http?.method;
  if (!sub) return reply(401, { error: "unauthorized" });

  try {
    if (method === "GET") {
      const r = await ddb.send(new GetCommand({ TableName: TABLE, Key: { userId: sub } }));
      return reply(200, r.Item?.data ?? null);
    }
    if (method === "PUT") {
      const data = event.body ? JSON.parse(event.body) : null;
      await ddb.send(new PutCommand({
        TableName: TABLE,
        Item: { userId: sub, data, updated: Date.now() },
      }));
      return reply(200, { ok: true });
    }
    return reply(405, { error: "method not allowed" });
  } catch (e) {
    return reply(500, { error: String(e && e.message || e) });
  }
};

function reply(statusCode, body) {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) };
}
