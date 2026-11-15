// Cognito Pre-Sign-Up trigger (template.yaml: PreSignUpFn, Handler presignup.handler). Only the AWS SDK wiring
// lives here; what it does — auto-confirm, at most DAILY_SIGNUP_LIMIT new accounts a UTC day (TUN-88) — is in
// presignup-api.mjs, tested without the SDK.
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { makePreSignUpHandler, sdkAdapter, signUpConfig, CLIENT_OPTIONS } from "./presignup-api.mjs";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient(CLIENT_OPTIONS));

export const handler = makePreSignUpHandler(sdkAdapter(ddb, UpdateCommand), { config: signUpConfig(process.env) });
