// Cost switch Lambda (template.yaml: CloudSwitchFn, Handler cloud-switch.handler). Only the AWS SDK imports
// live here; what it does, the calls it makes and its settings are in cloud-switch-api.mjs, tested without
// the SDK (TUN-87).
import { LambdaClient, GetFunctionConcurrencyCommand, PutFunctionConcurrencyCommand } from "@aws-sdk/client-lambda";
import { ApiGatewayV2Client, GetApiCommand, UpdateApiCommand } from "@aws-sdk/client-apigatewayv2";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { SSMClient, GetParameterCommand, PutParameterCommand } from "@aws-sdk/client-ssm";
import { makeCloudSwitchHandler, sdkAdapter, switchConfig, CLIENT_OPTIONS } from "./cloud-switch-api.mjs";

const clients = { lambda: new LambdaClient(CLIENT_OPTIONS), apigw: new ApiGatewayV2Client(CLIENT_OPTIONS),
  sns: new SNSClient(CLIENT_OPTIONS), ssm: new SSMClient(CLIENT_OPTIONS) };
const commands = { GetFunctionConcurrencyCommand, PutFunctionConcurrencyCommand, GetApiCommand, UpdateApiCommand,
  PublishCommand, GetParameterCommand, PutParameterCommand };

export const handler = makeCloudSwitchHandler(sdkAdapter(clients, commands, process.env), switchConfig(process.env));
