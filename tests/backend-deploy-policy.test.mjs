// The `mg-deploy` policy in backend/README.md § One-time setup must cover what deploying backend/template.yaml
// needs, and nothing that reaches players' data or the rest of the account (TUN-113).
//
// Why a test: nobody can run the policy here — the owner pastes it into IAM Identity Center, and a missing
// action shows up only as a production deploy that fails and rolls back. The policy scopes resources by
// name (`music-garden-*`), so a template change that adds a new kind of resource, or a resource named
// outside that prefix, would break the next deploy silently. This is a static check of the README's JSON
// with a small IAM matcher (Allow statements, wildcards in Action and Resource); it does not evaluate
// conditions, which are checked by shape instead. It is not proof that AWS accepts the policy: the owner's
// deploys are (backend/README.md § Moving off a root access key).
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./helpers/game-scripts.mjs";

const README = readFileSync(join(ROOT, "backend", "README.md"), "utf8").replace(/\r/g, "");
const TEMPLATE = readFileSync(join(ROOT, "backend", "template.yaml"), "utf8").replace(/\r/g, "");
const SAMCONFIG = readFileSync(join(ROOT, "backend", "samconfig.toml"), "utf8").replace(/\r/g, "");

const ACCOUNT = "123456789012";   // a stand-in: the policy itself names no account
const REGION = "us-east-1";

function policyText() {
  const at = README.indexOf("#### The `mg-deploy` policy");
  assert.ok(at >= 0, "backend/README.md has the `mg-deploy` policy heading");
  const m = README.slice(at).match(/```json\n([\s\S]*?)\n```/);
  assert.ok(m, "a ```json block follows the policy heading");
  return m[1];
}
const POLICY = JSON.parse(policyText());
const list = (v) => (Array.isArray(v) ? v : [v]);
const STATEMENTS = POLICY.Statement.map((s) => ({ ...s, Action: list(s.Action), Resource: list(s.Resource) }));

const glob = (pattern, flags) =>
  new RegExp("^" + pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$", flags);
const actionMatches = (pattern, action) => glob(pattern, "i").test(action);
const resourceMatches = (pattern, arn) => glob(pattern, "").test(arn);

// The statements that allow `action` on `arn` (conditions not evaluated).
const allowing = (action, arn) =>
  STATEMENTS.filter((s) => s.Effect === "Allow" &&
    s.Action.some((a) => actionMatches(a, action)) && s.Resource.some((r) => resourceMatches(r, arn)));
const allows = (action, arn) => allowing(action, arn).length > 0;

// --- what the template deploys, read from its text ---
const STACK = SAMCONFIG.match(/^stack_name\s*=\s*"([^"]+)"/m)?.[1];
const RESOURCES = [...TEMPLATE.matchAll(/^  ([A-Za-z0-9]+):\n((?:    .*\n|\n)*)/gm)]
  .map(([, name, body]) => ({ name, body, type: body.match(/^    Type: (AWS::[A-Za-z0-9:]+)/m)?.[1] }))
  .filter((r) => r.type);
const prop = (r, key) => r.body.match(new RegExp(`^      ${key}: ([^\\s#]+)`, "m"))?.[1];
const rand = "AbC123XyZ";   // CloudFormation's suffix on a generated name

// A generated name is <stack>-<logical id>-<suffix>; an explicit one is used as written.
const nameOf = (r, key, suffix = "") => prop(r, key) ?? `${STACK}-${r.name}${suffix}-${rand}`;

// For each resource type: the actions CloudFormation calls to create, update and delete it, with a sample
// ARN of the resource this template would get. Delete is needed even for an update: a deploy that fails
// rolls back by deleting what it created.
const NEEDS = {
  "AWS::Serverless::Function": (r) => {
    const fn = `arn:aws:lambda:${REGION}:${ACCOUNT}:function:${nameOf(r, "FunctionName")}`;
    const role = `arn:aws:iam::${ACCOUNT}:role/${STACK}-${r.name}Role-${rand}`;
    return [
      ...["CreateFunction", "UpdateFunctionCode", "UpdateFunctionConfiguration", "DeleteFunction", "GetFunction",
        "PutFunctionConcurrency", "DeleteFunctionConcurrency", "PutFunctionEventInvokeConfig",
        "UpdateFunctionEventInvokeConfig", "DeleteFunctionEventInvokeConfig", "TagResource", "ListTags"]
        .map((a) => [`lambda:${a}`, fn]),
      ...["CreateRole", "DeleteRole", "GetRole", "TagRole", "PutRolePolicy", "DeleteRolePolicy", "GetRolePolicy",
        "AttachRolePolicy", "DetachRolePolicy", "PassRole"].map((a) => [`iam:${a}`, role]),
    ];
  },
  "AWS::Lambda::Permission": () => {
    const fn = `arn:aws:lambda:${REGION}:${ACCOUNT}:function:${STACK}-SomeFn-${rand}`;
    return ["AddPermission", "RemovePermission", "GetPolicy"].map((a) => [`lambda:${a}`, fn]);
  },
  "AWS::Serverless::HttpApi": () => ["GET", "POST", "PUT", "PATCH", "DELETE"].flatMap((v) => [
    [`apigateway:${v}`, `arn:aws:apigateway:${REGION}::/apis`],
    [`apigateway:${v}`, `arn:aws:apigateway:${REGION}::/apis/a1b2c3d4e5/stages/$default`],
  ]),
  "AWS::DynamoDB::Table": (r) => {
    const t = `arn:aws:dynamodb:${REGION}:${ACCOUNT}:table/${nameOf(r, "TableName")}`;
    return ["CreateTable", "UpdateTable", "DeleteTable", "DescribeTable", "DescribeTimeToLive", "UpdateTimeToLive",
      "DescribeContinuousBackups", "UpdateContinuousBackups", "TagResource", "ListTagsOfResource"]
      .map((a) => [`dynamodb:${a}`, t]);
  },
  "AWS::Cognito::UserPool": () => [
    ["cognito-idp:CreateUserPool", "*"],
    ...["UpdateUserPool", "DescribeUserPool", "DeleteUserPool", "SetUserPoolMfaConfig", "GetUserPoolMfaConfig",
      "TagResource"].map((a) => [`cognito-idp:${a}`, `arn:aws:cognito-idp:${REGION}:${ACCOUNT}:userpool/${REGION}_AbCdEfGhI`]),
  ],
  "AWS::Cognito::UserPoolClient": () => ["CreateUserPoolClient", "UpdateUserPoolClient", "DescribeUserPoolClient",
    "DeleteUserPoolClient"].map((a) => [`cognito-idp:${a}`, `arn:aws:cognito-idp:${REGION}:${ACCOUNT}:userpool/${REGION}_AbCdEfGhI`]),
  "AWS::SNS::Topic": (r) => ["CreateTopic", "DeleteTopic", "GetTopicAttributes", "SetTopicAttributes", "Subscribe",
    "TagResource"].map((a) => [`sns:${a}`, `arn:aws:sns:${REGION}:${ACCOUNT}:${nameOf(r, "TopicName")}`]),
  "AWS::SNS::TopicPolicy": () => ["SetTopicAttributes", "GetTopicAttributes"]
    .map((a) => [`sns:${a}`, `arn:aws:sns:${REGION}:${ACCOUNT}:${STACK}-SomeTopic-${rand}`]),
  "AWS::SNS::Subscription": () => [
    ["sns:Subscribe", `arn:aws:sns:${REGION}:${ACCOUNT}:${STACK}-SomeTopic-${rand}`],
    ["sns:Unsubscribe", `arn:aws:sns:${REGION}:${ACCOUNT}:${STACK}-SomeTopic-${rand}:0a1b2c3d-1111-2222-3333-444455556666`],
    ["sns:GetSubscriptionAttributes", `arn:aws:sns:${REGION}:${ACCOUNT}:${STACK}-SomeTopic-${rand}:0a1b2c3d-1111-2222-3333-444455556666`],
  ],
  "AWS::SSM::Parameter": (r) => {
    const name = prop(r, "Name");
    assert.ok(name?.startsWith("/"), `${r.name}: an SSM parameter has an explicit Name starting with /`);
    return ["PutParameter", "GetParameter", "GetParameters", "DeleteParameter", "AddTagsToResource"]
      .map((a) => [`ssm:${a}`, `arn:aws:ssm:${REGION}:${ACCOUNT}:parameter${name}`]);
  },
  "AWS::Budgets::Budget": () => ["ModifyBudget", "ViewBudget"]
    .map((a) => [`budgets:${a}`, `arn:aws:budgets::${ACCOUNT}:budget/MonthlyBudget-${REGION}-${rand}`]),
};

test("the README's mg-deploy policy is a valid policy document that names no account", () => {
  assert.equal(POLICY.Version, "2012-10-17");
  assert.ok(STATEMENTS.length > 0);
  for (const s of STATEMENTS) {
    assert.equal(s.Effect, "Allow", `${s.Sid}: Allow only`);
    assert.ok(s.Sid && /^[A-Za-z0-9]+$/.test(s.Sid), `every statement has an alphanumeric Sid (${s.Sid})`);
  }
  assert.equal(new Set(STATEMENTS.map((s) => s.Sid)).size, STATEMENTS.length, "Sids are unique");
  assert.doesNotMatch(policyText(), /\d{12}/, "no account ID in a public repository");
});

test("the stack and every resource in template.yaml fall inside the policy's names", () => {
  assert.equal(STACK, "music-garden", "samconfig.toml deploys the stack the policy is scoped to");
  assert.ok(RESOURCES.length >= 15, `the template parsed (${RESOURCES.length} resources)`);
  for (const r of RESOURCES) {
    for (const key of ["FunctionName", "TableName", "TopicName"]) {
      const v = prop(r, key);
      if (v && !v.startsWith("!")) assert.ok(v.startsWith(`${STACK}-`), `${r.name}: ${key} ${v} starts with ${STACK}-`);
    }
    if (r.type === "AWS::SSM::Parameter") assert.ok(prop(r, "Name").startsWith(`/${STACK}/`), `${r.name}: under /${STACK}/`);
  }
});

test("the policy allows every action a deploy of template.yaml makes, on that resource", () => {
  const missing = [];
  for (const r of RESOURCES) {
    const needs = NEEDS[r.type];
    if (!needs) { missing.push(`${r.name}: ${r.type} is new — add its actions to the policy and to NEEDS here`); continue; }
    for (const [action, arn] of needs(r)) if (!allows(action, arn)) missing.push(`${r.name}: ${action} on ${arn}`);
  }
  assert.deepEqual(missing, []);
});

test("SAM's own calls, the cost switch's runbook and the voice clips are allowed", () => {
  const stack = `arn:aws:cloudformation:${REGION}:${ACCOUNT}:stack/${STACK}/0a1b2c3d-1111-2222-3333-444455556666`;
  const samStack = `arn:aws:cloudformation:${REGION}:${ACCOUNT}:stack/aws-sam-cli-managed-default/0a1b2c3d-1111-2222-3333-444455556666`;
  const changeSet = `arn:aws:cloudformation:${REGION}:${ACCOUNT}:changeSet/samcli-deploy1731700000/0a1b2c3d-1111-2222-3333-444455556666`;
  const bucket = "arn:aws:s3:::aws-sam-cli-managed-default-samclisourcebucket-abc123xyz";
  const switchFn = `arn:aws:lambda:${REGION}:${ACCOUNT}:function:music-garden-cloud-switch`;
  const alarm = `arn:aws:sns:${REGION}:${ACCOUNT}:${STACK}-CloudSwitchAlarmTopic-${rand}`;
  for (const [action, arn] of [
    ["cloudformation:CreateChangeSet", stack], ["cloudformation:DescribeChangeSet", changeSet],
    ["cloudformation:ExecuteChangeSet", changeSet], ["cloudformation:DescribeStacks", stack],
    ["cloudformation:DescribeStackEvents", stack], ["cloudformation:ListChangeSets", stack],
    ["cloudformation:DeleteStack", stack], ["cloudformation:DescribeStacks", samStack],
    ["cloudformation:CreateChangeSet", `arn:aws:cloudformation:${REGION}:aws:transform/Serverless-2016-10-31`],
    ["s3:PutObject", `${bucket}/music-garden/0123abcd`], ["s3:GetObject", `${bucket}/music-garden/0123abcd.template`],
    ["s3:ListBucket", bucket],
    ["lambda:InvokeFunction", switchFn],   // status / on / off
    ["sns:Publish", alarm],                // the rehearsal
    ["polly:SynthesizeSpeech", "*"],       // tools/gen-voice.mjs (owner, TUN-113 Q3)
  ]) assert.ok(allows(action, arn), `${action} on ${arn}`);
});

test("the policy reaches no player's data, and none of the usual abuse of a leaked key", () => {
  const table = `arn:aws:dynamodb:${REGION}:${ACCOUNT}:table/music-garden-songs`;
  const pool = `arn:aws:cognito-idp:${REGION}:${ACCOUNT}:userpool/${REGION}_AbCdEfGhI`;
  for (const a of ["GetItem", "Query", "Scan", "PutItem", "UpdateItem", "DeleteItem", "BatchGetItem",
    "BatchWriteItem", "ExportTableToPointInTime", "RestoreTableToPointInTime", "PartiQLSelect"])
    assert.ok(!allows(`dynamodb:${a}`, table), `dynamodb:${a} on a table`);
  for (const a of ["ListUsers", "AdminGetUser", "AdminCreateUser", "AdminDeleteUser", "AdminSetUserPassword",
    "AdminUpdateUserAttributes", "AdminInitiateAuth"])
    assert.ok(!allows(`cognito-idp:${a}`, pool), `cognito-idp:${a} on the user pool`);
  for (const [action, arn] of [
    ["ec2:RunInstances", "*"], ["iam:CreateUser", `arn:aws:iam::${ACCOUNT}:user/x`],
    ["iam:CreateAccessKey", `arn:aws:iam::${ACCOUNT}:user/x`], ["iam:CreateRole", `arn:aws:iam::${ACCOUNT}:role/other`],
    ["iam:PutRolePolicy", `arn:aws:iam::${ACCOUNT}:role/other`], ["account:CloseAccount", "*"],
    ["lambda:CreateFunction", `arn:aws:lambda:${REGION}:${ACCOUNT}:function:other`],
    ["lambda:CreateFunction", `arn:aws:lambda:eu-west-1:${ACCOUNT}:function:music-garden-x`],
    ["s3:GetObject", "arn:aws:s3:::someone-elses-bucket/x"],
  ]) assert.ok(!allows(action, arn), `${action} on ${arn}`);
  // No wildcard action anywhere, and "*" resources only for what cannot be scoped.
  for (const s of STATEMENTS) {
    assert.ok(!s.Action.some((a) => a === "*" || /^(iam|dynamodb|cognito-idp|sts|organizations|account):\*$/i.test(a)),
      `${s.Sid}: no wildcard over IAM, players' data or the account`);
    if (s.Resource.includes("*")) assert.deepEqual(
      s.Action.filter((a) => !["cloudformation:ValidateTemplate", "cloudformation:GetTemplateSummary",
        "cloudformation:ListStacks", "iam:ListPolicies", "cognito-idp:CreateUserPool", "polly:SynthesizeSpeech"].includes(a)),
      [], `${s.Sid}: only lookups, a new user pool and Polly may name every resource`);
  }
});

test("roles go only to Lambda, with only Lambda's logging policy attached", () => {
  const role = `arn:aws:iam::${ACCOUNT}:role/${STACK}-ProgressFnRole-${rand}`;
  const pass = allowing("iam:PassRole", role);
  assert.ok(pass.length > 0);
  for (const s of pass) assert.deepEqual(s.Condition, { StringEquals: { "iam:PassedToService": "lambda.amazonaws.com" } }, s.Sid);
  const attach = allowing("iam:AttachRolePolicy", role);
  assert.ok(attach.length > 0);
  for (const s of attach) assert.deepEqual(s.Condition,
    { ArnEquals: { "iam:PolicyARN": "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole" } }, s.Sid);
  // What SAM attaches is exactly that policy: no Tracing, VPC or other managed policy in the template.
  assert.doesNotMatch(TEMPLATE, /^\s+(Tracing|VpcConfig|Layers|ManagedPolicyArns|PermissionsBoundary):/m,
    "a new managed policy on the functions' roles needs a new ArnEquals entry in the policy");
  for (const s of STATEMENTS.filter((x) => x.Resource.includes("*") && x.Condition))
    assert.deepEqual(s.Condition, { StringEquals: { "aws:RequestedRegion": REGION } }, `${s.Sid}: us-east-1 only`);
});
