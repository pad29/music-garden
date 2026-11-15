// Cost switch Lambda (template.yaml: CloudSwitchFn, Handler cloud-switch.handler). Only the AWS SDK wiring
// lives here; what it does is in cloud-switch-api.mjs, tested without the SDK. Every call retries at most
// 3 times with a 5-second request timeout; the handler caps each step besides (TUN-87).
import { LambdaClient, GetFunctionConcurrencyCommand, PutFunctionConcurrencyCommand } from "@aws-sdk/client-lambda";
import { ApiGatewayV2Client, GetApiCommand, UpdateApiCommand } from "@aws-sdk/client-apigatewayv2";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { makeCloudSwitchHandler } from "./cloud-switch-api.mjs";

const opts = { maxAttempts: 3, requestHandler: { connectionTimeout: 3000, requestTimeout: 5000 } };
const lambda = new LambdaClient(opts), apigw = new ApiGatewayV2Client(opts), sns = new SNSClient(opts);
const env = process.env;

export const handler = makeCloudSwitchHandler({
  getConcurrency: async fn => (await lambda.send(new GetFunctionConcurrencyCommand({ FunctionName: fn }))).ReservedConcurrentExecutions,
  putConcurrency: (fn, n) => lambda.send(new PutFunctionConcurrencyCommand({ FunctionName: fn, ReservedConcurrentExecutions: n })),
  getEndpointDisabled: async () => (await apigw.send(new GetApiCommand({ ApiId: env.API_ID }))).DisableExecuteApiEndpoint === true,
  setEndpointDisabled: disabled => apigw.send(new UpdateApiCommand({ ApiId: env.API_ID, DisableExecuteApiEndpoint: disabled })),
  notify: (subject, message) => sns.send(new PublishCommand({ TopicArn: env.NOTICE_TOPIC_ARN, Subject: subject, Message: message })),
  now: () => Date.now(),
}, {
  functions: [env.PROGRESS_FN, env.SONGS_FN, env.PRESIGNUP_FN],
  onConcurrency: Number(env.ON_CONCURRENCY),
  alarmTopicArn: env.ALARM_TOPIC_ARN,
  staleMs: 3600e3,   // = EventInvokeConfig.MaximumEventAgeInSeconds
  stepMs: 15e3,      // writes, read-back and email: 45 s at most, inside the 60-second Timeout
});
