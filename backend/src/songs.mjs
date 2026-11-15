// Songs API Lambda (template.yaml: Handler songs.handler). Only the AWS SDK wiring lives here; the routes
// are in songs-api.mjs and what a song may hold is in validate.mjs (TUN-83), both testable without the SDK.
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { makeSongsHandler } from "./songs-api.mjs";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = makeSongsHandler({
  get:   p => ddb.send(new GetCommand(p)),
  put:   p => ddb.send(new PutCommand(p)),
  query: p => ddb.send(new QueryCommand(p)),
  del:   p => ddb.send(new DeleteCommand(p)),
}, { table: process.env.SONGS_TABLE });
