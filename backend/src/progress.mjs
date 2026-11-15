// Progress API Lambda (template.yaml: Handler progress.handler). Only the AWS SDK wiring lives here; the
// routes are in progress-api.mjs and what progress may hold is in validate.mjs (TUN-83), both testable
// without the SDK.
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { makeProgressHandler } from "./progress-api.mjs";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = makeProgressHandler({
  get: p => ddb.send(new GetCommand(p)),
  put: p => ddb.send(new PutCommand(p)),
}, { table: process.env.TABLE_NAME });
