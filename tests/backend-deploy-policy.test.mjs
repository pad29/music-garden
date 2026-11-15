// The `mg-deploy` policy in backend/README.md § One-time setup must cover what deploying backend/template.yaml
// needs, and nothing that reaches players' data or the rest of the account (TUN-113).
//
// Why a test: nobody can run the policy here — the owner pastes it into IAM Identity Center, and a missing
// action shows up only as a production deploy that fails and rolls back. The policy scopes resources by
// name (`music-garden-*`), so a template change that adds a new kind of resource, or names one outside that
// prefix, would break the next deploy silently.
//
// How: a small IAM evaluator — Allow and Deny, Action, Resource and NotResource with `*` and `?`, and the
// conditions this policy uses (StringEquals, ArnEquals on aws:RequestedRegion, iam:PassedToService,
// iam:PolicyARN). Anything else in a condition is reported, not guessed at. Each request is evaluated
// with its context (region us-east-1 unless the case says otherwise). The actions listed per resource type
// in NEEDS are this test's model of what CloudFormation's handlers and SAM call — written from AWS's
// authorization reference and the handlers' permission lists, not proof of them: the owner's deploys are
// (backend/README.md § Moving off a root access key). The mutation cases at the end keep the checker
// from going blind.
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
const STACK = SAMCONFIG.match(/^stack_name\s*=\s*"([^"]+)"/m)?.[1];
const rand = "AbC123XyZ";         // CloudFormation's suffix on a generated name
const BASIC_LOGGING = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole";
const KNOWN_PREFIXES = ["cloudformation", "iam", "s3", "lambda", "dynamodb", "cognito-idp", "apigateway", "sns",
  "ssm", "budgets", "polly"];
// What a statement on Resource "*" may allow: lookups, and what has no resource to scope to.
const STAR_OK = ["cloudformation:ValidateTemplate", "cloudformation:GetTemplateSummary", "cloudformation:ListStacks",
  "iam:ListPolicies", "cognito-idp:CreateUserPool", "polly:SynthesizeSpeech"];

function policyText(readme = README) {
  const at = readme.indexOf("#### The `mg-deploy` policy");
  if (at < 0) throw new Error("backend/README.md has no `mg-deploy` policy heading");
  const m = readme.slice(at).match(/```json\n([\s\S]*?)\n```/);
  if (!m) throw new Error("no ```json block follows the policy heading");
  return m[1];
}
const POLICY_TEXT = policyText();
const POLICY = JSON.parse(POLICY_TEXT);

// --- the evaluator ---
const list = (v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v]);
const glob = (pattern, flags) =>
  new RegExp("^" + pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$", flags);
const actionMatches = (pattern, action) => glob(pattern, "i").test(action);
const resourceMatches = (pattern, arn) => glob(pattern, "").test(arn);
const OPS = { StringEquals: (want, got) => want === got, ArnEquals: (want, got) => want === got };
const KEYS = ["aws:RequestedRegion", "iam:PassedToService", "iam:PolicyARN"];

function conditionHolds(cond, ctx) {
  for (const [op, kv] of Object.entries(cond ?? {})) {
    if (!OPS[op]) throw new Error(`unsupported condition operator ${op}`);
    for (const [key, want] of Object.entries(kv)) {
      if (!KEYS.includes(key)) throw new Error(`unsupported condition key ${key}`);
      if (!(key in ctx) || !list(want).some((w) => OPS[op](w, ctx[key]))) return false;
    }
  }
  return true;
}
// Is `action` on `arn` allowed? An explicit Deny wins; otherwise some Allow must apply.
function allowed(policy, action, arn, extra = {}) {
  const ctx = { "aws:RequestedRegion": REGION, ...extra };
  const applies = (s) => list(s.Action).some((a) => actionMatches(a, action)) &&
    (s.Resource ? list(s.Resource).some((r) => resourceMatches(r, arn))
      : !list(s.NotResource).some((r) => resourceMatches(r, arn))) &&
    conditionHolds(s.Condition, ctx);
  if (policy.Statement.some((s) => s.Effect === "Deny" && applies(s))) return false;
  return policy.Statement.some((s) => s.Effect === "Allow" && applies(s));
}

// --- the template's resources, read fail-closed ---
function resources(template) {
  const lines = template.split("\n");
  const start = lines.indexOf("Resources:");
  if (start < 0) throw new Error("template.yaml has no Resources: section");
  const end = lines.findIndex((l, i) => i > start && /^[^\s#]/.test(l));
  const out = [];
  for (const l of lines.slice(start + 1, end < 0 ? undefined : end)) {
    if (/^  [^\s#]/.test(l)) {
      const m = l.match(/^  ([A-Za-z0-9]+):\s*(#.*)?$/);
      if (!m) throw new Error(`unreadable resource line: ${l}`);
      out.push({ name: m[1], lines: [] });
    } else if (out.length) out.at(-1).lines.push(l);
  }
  for (const r of out) {
    const types = r.lines.filter((l) => /^    Type:/.test(l));
    if (types.length !== 1) throw new Error(`${r.name}: expected one Type line, found ${types.length}`);
    r.type = scalar(types[0].replace(/^    Type:/, ""));
    if (typeof r.type !== "string" || !/^AWS::[A-Za-z0-9]+::[A-Za-z0-9]+$/.test(r.type))
      throw new Error(`${r.name}: unreadable Type ${types[0].trim()}`);
  }
  return out;
}
// A YAML scalar's literal value; { expr } for anything that is not a literal (a tag, a block form, a map).
function scalar(raw) {
  const v = raw.replace(/\s+#.*$/, "").trim();
  if (v === "" || /^[!{[&*|>]/.test(v)) return { expr: v || "(block)" };
  const q = v.match(/^"([^"]*)"$|^'([^']*)'$/);
  return q ? q[1] ?? q[2] : v;
}
const prop = (r, key) => {
  const l = r.lines.find((x) => x.startsWith(`      ${key}:`));
  return l === undefined ? undefined : scalar(l.slice(`      ${key}:`.length));
};

// --- what a deploy calls, per resource type: [action, ARN, extra context] ---
const arn = {
  fn: (name) => `arn:aws:lambda:${REGION}:${ACCOUNT}:function:${name}`,
  role: (name) => `arn:aws:iam::${ACCOUNT}:role/${name}`,
  table: (name) => `arn:aws:dynamodb:${REGION}:${ACCOUNT}:table/${name}`,
  topic: (name) => `arn:aws:sns:${REGION}:${ACCOUNT}:${name}`,
  pool: `arn:aws:cognito-idp:${REGION}:${ACCOUNT}:userpool/${REGION}_AbCdEfGhI`,
  stack: (name) => `arn:aws:cloudformation:${REGION}:${ACCOUNT}:stack/${name}/0a1b2c3d-1111-2222-3333-444455556666`,
  changeSet: `arn:aws:cloudformation:${REGION}:${ACCOUNT}:changeSet/samcli-deploy1731700000/0a1b2c3d-1111-2222-3333-444455556666`,
  bucket: "arn:aws:s3:::aws-sam-cli-managed-default-samclisourcebucket-abc123xyz",
};
const generated = (r, suffix = "") => `${STACK}-${r.name}${suffix}-${rand}`;
const literal = (v, fallback) => (typeof v === "string" ? v : fallback);
const on = (resource, actions, extra) => actions.map((a) => [a, resource, extra]);

const NEEDS = {
  "AWS::Serverless::Function": (r) => {
    const fn = arn.fn(literal(prop(r, "FunctionName"), generated(r)));
    const role = arn.role(generated(r, "Role"));
    return [
      ...on(fn, ["CreateFunction", "UpdateFunctionCode", "UpdateFunctionConfiguration", "DeleteFunction", "GetFunction",
        "GetFunctionConfiguration", "PutFunctionConcurrency", "DeleteFunctionConcurrency", "GetFunctionConcurrency",
        "PutFunctionEventInvokeConfig", "UpdateFunctionEventInvokeConfig", "DeleteFunctionEventInvokeConfig",
        "GetFunctionEventInvokeConfig", "TagResource", "UntagResource", "ListTags", "GetFunctionCodeSigningConfig",
        "GetRuntimeManagementConfig", "PutRuntimeManagementConfig"].map((a) => `lambda:${a}`)),
      ["lambda:PutFunctionEventInvokeConfig", `${fn}:$LATEST`],
      ...on(role, ["CreateRole", "DeleteRole", "GetRole", "UpdateRole", "UpdateAssumeRolePolicy", "TagRole", "UntagRole",
        "ListRoleTags", "PutRolePolicy", "GetRolePolicy", "DeleteRolePolicy", "ListRolePolicies",
        "ListAttachedRolePolicies", "DetachRolePolicy"].map((a) => `iam:${a}`)),
      ["iam:AttachRolePolicy", role, { "iam:PolicyARN": BASIC_LOGGING }],
      ["iam:PassRole", role, { "iam:PassedToService": "lambda.amazonaws.com" }],
    ];
  },
  "AWS::Lambda::Permission": () =>
    on(arn.fn(`${STACK}-SomeFn-${rand}`), ["lambda:AddPermission", "lambda:RemovePermission", "lambda:GetPolicy"]),
  "AWS::Serverless::HttpApi": () => ["GET", "POST", "PUT", "PATCH", "DELETE"].flatMap((v) => [
    `arn:aws:apigateway:${REGION}::/apis`, `arn:aws:apigateway:${REGION}::/apis/a1b2c3d4e5`,
    `arn:aws:apigateway:${REGION}::/apis/a1b2c3d4e5/stages/$default`,
    `arn:aws:apigateway:${REGION}::/apis/a1b2c3d4e5/routes/r1s2t3`,
    `arn:aws:apigateway:${REGION}::/tags/arn%3Aaws%3Aapigateway%3A${REGION}%3A%3A%2Fapis%2Fa1b2c3d4e5`,
  ].map((a) => [`apigateway:${v}`, a])),
  "AWS::DynamoDB::Table": (r) => on(arn.table(literal(prop(r, "TableName"), generated(r))), ["CreateTable",
    "UpdateTable", "DeleteTable", "DescribeTable", "DescribeTimeToLive", "UpdateTimeToLive", "DescribeContinuousBackups",
    "UpdateContinuousBackups", "DescribeContributorInsights", "DescribeKinesisStreamingDestination",
    "GetResourcePolicy", "TagResource", "UntagResource", "ListTagsOfResource"].map((a) => `dynamodb:${a}`)),
  "AWS::Cognito::UserPool": () => [
    ["cognito-idp:CreateUserPool", "*"],
    ...on(arn.pool, ["UpdateUserPool", "DescribeUserPool", "DeleteUserPool", "SetUserPoolMfaConfig",
      "GetUserPoolMfaConfig", "AddCustomAttributes", "TagResource", "UntagResource", "ListTagsForResource"]
      .map((a) => `cognito-idp:${a}`)),
  ],
  "AWS::Cognito::UserPoolClient": () => on(arn.pool, ["CreateUserPoolClient", "UpdateUserPoolClient",
    "DescribeUserPoolClient", "DeleteUserPoolClient"].map((a) => `cognito-idp:${a}`)),
  // SNS authorizes subscription calls against the parent topic (AWS's authorization reference).
  "AWS::SNS::Topic": (r) => on(arn.topic(literal(prop(r, "TopicName"), generated(r))), ["CreateTopic", "DeleteTopic",
    "GetTopicAttributes", "SetTopicAttributes", "Subscribe", "Unsubscribe", "ListSubscriptionsByTopic",
    "GetSubscriptionAttributes", "TagResource", "UntagResource", "ListTagsForResource", "GetDataProtectionPolicy",
    "PutDataProtectionPolicy"].map((a) => `sns:${a}`)),
  "AWS::SNS::TopicPolicy": () => on(arn.topic(`${STACK}-SomeTopic-${rand}`), ["sns:SetTopicAttributes",
    "sns:GetTopicAttributes"]),
  "AWS::SNS::Subscription": () => on(arn.topic(`${STACK}-SomeTopic-${rand}`), ["Subscribe", "Unsubscribe",
    "GetSubscriptionAttributes", "SetSubscriptionAttributes", "ListSubscriptionsByTopic"].map((a) => `sns:${a}`)),
  "AWS::SSM::Parameter": (r) => on(`arn:aws:ssm:${REGION}:${ACCOUNT}:parameter${literal(prop(r, "Name"), "/x")}`,
    ["PutParameter", "GetParameter", "GetParameters", "DeleteParameter", "AddTagsToResource", "RemoveTagsFromResource",
      "ListTagsForResource"].map((a) => `ssm:${a}`)),
  "AWS::Budgets::Budget": () => on(`arn:aws:budgets::${ACCOUNT}:budget/MonthlyBudget-${REGION}-${rand}`,
    ["ModifyBudget", "ViewBudget", "TagResource", "UntagResource", "ListTagsForResource"].map((a) => `budgets:${a}`)),
};

// SAM's own calls (resolve_s3: its managed stack and bucket), the change set (checked against both the stack
// and the change set, since which one IAM authorizes differs by action), and the README's runbook.
const SAM_AND_RUNBOOK = [
  ...[arn.stack(STACK), arn.stack("aws-sam-cli-managed-default"), arn.changeSet].flatMap((a) => on(a,
    ["CreateChangeSet", "DescribeChangeSet", "ExecuteChangeSet", "DeleteChangeSet", "ListChangeSets", "DescribeStacks",
      "DescribeStackEvents", "DescribeStackResource", "DescribeStackResources", "GetTemplate", "GetTemplateSummary",
      "ContinueUpdateRollback", "CreateStack", "UpdateStack", "DeleteStack"].map((x) => `cloudformation:${x}`))),
  ["cloudformation:CreateChangeSet", `arn:aws:cloudformation:${REGION}:aws:transform/Serverless-2016-10-31`],
  ["cloudformation:ValidateTemplate", "*"],
  ...on(arn.bucket, ["CreateBucket", "DeleteBucket", "PutBucketPolicy", "GetBucketPolicy", "PutBucketVersioning",
    "PutEncryptionConfiguration", "PutBucketTagging", "PutBucketPublicAccessBlock", "GetBucketLocation", "ListBucket"]
    .map((a) => `s3:${a}`)),
  ...on(`${arn.bucket}/music-garden/0123abcd.template`, ["s3:PutObject", "s3:GetObject", "s3:GetObjectVersion",
    "s3:DeleteObject"]),
  ["lambda:InvokeFunction", arn.fn("music-garden-cloud-switch")],     // status / on / off
  ["sns:Publish", arn.topic(`${STACK}-CloudSwitchAlarmTopic-${rand}`)], // the rehearsal
  ["polly:SynthesizeSpeech", "*"],                                      // tools/gen-voice.mjs (owner, TUN-113 Q3)
];

// Never: players' data, the usual abuse of a leaked key, anything outside the names or the region.
const NEVER = (rs) => [
  ...["GetItem", "Query", "Scan", "PutItem", "UpdateItem", "DeleteItem", "BatchGetItem", "BatchWriteItem",
    "ExportTableToPointInTime", "RestoreTableToPointInTime", "PartiQLSelect"]
    .map((a) => [`dynamodb:${a}`, arn.table(`${STACK}-songs`)]),
  ...["ListUsers", "AdminGetUser", "AdminCreateUser", "AdminDeleteUser", "AdminSetUserPassword",
    "AdminUpdateUserAttributes", "AdminInitiateAuth"].map((a) => [`cognito-idp:${a}`, arn.pool]),
  // Invoking a game function directly skips the API's JWT authorizer (its handler trusts the claims it is given).
  ...rs.filter((r) => r.type === "AWS::Serverless::Function" && prop(r, "FunctionName") !== "music-garden-cloud-switch")
    .flatMap((r) => ["lambda:InvokeFunction", "lambda:InvokeAsync"].map((a) => [a, arn.fn(generated(r))])),
  ["ec2:RunInstances", "*"], ["iam:CreateUser", arn.role("x").replace(":role/", ":user/")],
  ["iam:CreateAccessKey", arn.role("x").replace(":role/", ":user/")], ["iam:CreateRole", arn.role("other")],
  ["iam:PutRolePolicy", arn.role("other")], ["account:CloseAccount", "*"],
  ["iam:PassRole", arn.role(`${STACK}-ProgressFnRole-${rand}`), { "iam:PassedToService": "ecs-tasks.amazonaws.com" }],
  ["iam:AttachRolePolicy", arn.role(`${STACK}-ProgressFnRole-${rand}`),
    { "iam:PolicyARN": "arn:aws:iam::aws:policy/AdministratorAccess" }],
  ["lambda:CreateFunction", arn.fn("other")],
  ["lambda:CreateFunction", arn.fn(`${STACK}-x`).replace(REGION, "eu-west-1"), { "aws:RequestedRegion": "eu-west-1" }],
  ["cognito-idp:CreateUserPool", "*", { "aws:RequestedRegion": "eu-west-1" }],
  ["polly:SynthesizeSpeech", "*", { "aws:RequestedRegion": "eu-west-1" }],
  ["s3:GetObject", "arn:aws:s3:::someone-elses-bucket/x"],
];

// Every problem with `policy` (and its text) against `template`; [] when all is well.
function problems(policy, text, template) {
  const out = [];
  const say = (m) => out.push(m);
  if (policy.Version !== "2012-10-17") say("Version is not 2012-10-17");
  if (/\b\d{12}\b/.test(text)) say("an account ID is in the policy (the repository is public)");
  if (text.replace(/\s/g, "").length > 10240) say("over Identity Center's 10,240-character inline policy limit");
  const sids = policy.Statement.map((s) => s.Sid);
  if (new Set(sids).size !== sids.length || sids.some((s) => !/^[A-Za-z0-9]+$/.test(s ?? ""))) say("Sids must be unique and alphanumeric");
  for (const s of policy.Statement) {
    if (!["Allow", "Deny"].includes(s.Effect)) say(`${s.Sid}: Effect ${s.Effect}`);
    if (!s.Resource === !s.NotResource) say(`${s.Sid}: exactly one of Resource and NotResource`);
    for (const a of list(s.Action) ?? []) {
      if (!/^[a-z0-9-]+:[A-Za-z*]+$/.test(a)) say(`${s.Sid}: malformed action ${a}`);
      else if (!KNOWN_PREFIXES.includes(a.split(":")[0])) say(`${s.Sid}: ${a} is a service this stack does not use`);
      if (a === "*" || /^(iam|dynamodb|cognito-idp|sts|organizations|account):\*$/i.test(a))
        say(`${s.Sid}: ${a} — no wildcard over IAM, players' data or the account`);
    }
    if (s.Effect === "Allow" && list(s.Resource)?.includes("*"))
      for (const a of list(s.Action)) if (!STAR_OK.includes(a)) say(`${s.Sid}: ${a} on every resource`);
    try { conditionHolds(s.Condition, {}); } catch (e) { say(`${s.Sid}: ${e.message}`); }
  }
  const check = (action, resource, extra) => {
    try { return allowed(policy, action, resource, extra); } catch (e) { say(e.message); return null; }
  };
  let rs = [];
  try { rs = resources(template); } catch (e) { say(e.message); }
  for (const r of rs) {
    const needs = NEEDS[r.type];
    if (!needs) { say(`${r.name}: ${r.type} is new — add its actions to the policy and to NEEDS here`); continue; }
    for (const [key, prefix] of [["FunctionName", `${STACK}-`], ["TableName", `${STACK}-`], ["TopicName", `${STACK}-`],
      ["Name", `/${STACK}/`]]) {
      if (key === "Name" && r.type !== "AWS::SSM::Parameter") continue;
      if (r.type === "AWS::Lambda::Permission") continue;   // its FunctionName points at another resource
      const v = prop(r, key);
      if (v === undefined) { if (key === "Name" && r.type === "AWS::SSM::Parameter") say(`${r.name}: needs an explicit Name`); continue; }
      if (typeof v !== "string") say(`${r.name}: ${key} ${v.expr} is not a literal — the policy matches names, so spell it out`);
      else if (!v.startsWith(prefix)) say(`${r.name}: ${key} ${v} is outside ${prefix}*`);
    }
    if (r.type === "AWS::Serverless::Function" && prop(r, "Role") !== undefined)
      say(`${r.name}: an explicit Role is not created as ${STACK}-* — the policy cannot pass it`);
    for (const [action, resource, extra] of needs(r))
      if (check(action, resource, extra) === false) say(`${r.name}: needs ${action} on ${resource}`);
  }
  for (const [action, resource, extra] of SAM_AND_RUNBOOK)
    if (check(action, resource, extra) === false) say(`SAM/runbook: needs ${action} on ${resource}`);
  for (const [action, resource, extra] of NEVER(rs))
    if (check(action, resource, extra)) say(`must not allow ${action} on ${resource} ${JSON.stringify(extra ?? {})}`);
  if (/^\s+(Tracing|VpcConfig|Layers|ManagedPolicyArns|PermissionsBoundary):/m.test(template))
    say("the template attaches more to the functions' roles than Lambda's logging policy — widen AttachOnlyLambdaLogging");
  return out;
}

test("the stack this policy is scoped to is the one samconfig.toml deploys", () => {
  assert.equal(STACK, "music-garden");
  assert.ok(resources(TEMPLATE).length >= 15, "the template's resources were read");
});

test("the README's mg-deploy policy covers template.yaml, SAM and the runbook, and reaches no player's data", () => {
  assert.deepEqual(problems(POLICY, POLICY_TEXT, TEMPLATE), []);
});

// --- mutation cases: each break must be reported ---
const clone = () => structuredClone(POLICY);
const stmt = (p, sid) => p.Statement.find((s) => s.Sid === sid);
const MUTATIONS = {
  "the invoke Deny is dropped": [(p) => { p.Statement = p.Statement.filter((s) => s.Effect !== "Deny"); },
    /must not allow lambda:InvokeFunction on .*ProgressFn/],
  "Polly loses its region condition": [(p) => { delete stmt(p, "VoiceClips").Condition; },
    /must not allow polly:SynthesizeSpeech .*eu-west-1/],
  "CreateUserPool loses its region condition": [(p) => { delete stmt(p, "NewUserPool").Condition; },
    /must not allow cognito-idp:CreateUserPool .*eu-west-1/],
  "the functions' grant is pinned to another region": [(p) => {
    stmt(p, "Functions").Condition = { StringEquals: { "aws:RequestedRegion": "eu-west-1" } };
  }, /needs lambda:CreateFunction/],
  "TTL updates are dropped": [(p) => {
    const s = stmt(p, "TablesNotTheirData"); s.Action = s.Action.filter((a) => a !== "dynamodb:UpdateTimeToLive");
  }, /needs dynamodb:UpdateTimeToLive/],
  "the tables get dynamodb:*": [(p) => { stmt(p, "TablesNotTheirData").Action = "dynamodb:*"; }, /no wildcard/],
  "PassRole loses its condition": [(p) => { delete stmt(p, "PassRolesToLambdaOnly").Condition; },
    /must not allow iam:PassRole .*ecs-tasks/],
  "AttachRolePolicy loses its condition": [(p) => { delete stmt(p, "AttachOnlyLambdaLogging").Condition; },
    /must not allow iam:AttachRolePolicy .*AdministratorAccess/],
  "SNS narrowed without the topic read handler's calls": [(p) => {
    stmt(p, "Topics").Action = ["CreateTopic", "DeleteTopic", "GetTopicAttributes", "SetTopicAttributes", "Subscribe",
      "Unsubscribe", "GetSubscriptionAttributes", "SetSubscriptionAttributes", "TagResource", "Publish"].map((a) => `sns:${a}`);
  }, /needs sns:ListSubscriptionsByTopic/],
  "role reads are dropped": [(p) => {
    const s = stmt(p, "FunctionRoles"); s.Action = s.Action.filter((a) => a !== "iam:ListAttachedRolePolicies");
  }, /needs iam:ListAttachedRolePolicies/],
  "budget tagging is dropped": [(p) => { stmt(p, "Budgets").Action = ["budgets:ViewBudget", "budgets:ModifyBudget"]; },
    /needs budgets:TagResource/],
  "the SAM bucket narrowed to objects": [(p) => {
    stmt(p, "SamBucket").Resource = "arn:aws:s3:::aws-sam-cli-managed-default-samclisourcebucket-*/*";
  }, /needs s3:CreateBucket/],
  "API tags left out": [(p) => {
    const s = stmt(p, "HttpApis"); s.Resource = s.Resource.filter((r) => !r.includes("/tags/"));
  }, /needs apigateway:\w+ on .*\/tags\//],
  "a statement grows a condition the checker cannot read": [(p) => {
    stmt(p, "Topics").Condition = { StringLike: { "aws:RequestedRegion": "us-*" } };
  }, /unsupported condition operator StringLike/],
  "EC2 is added": [(p) => { stmt(p, "ReadOnlyLookups").Action.push("ec2:DescribeInstances"); },
    /ec2:DescribeInstances is a service this stack does not use/],
};
for (const [name, [mutate, expected]] of Object.entries(MUTATIONS)) {
  test(`mutation reported: ${name}`, () => {
    const p = clone(); mutate(p);
    const found = problems(p, JSON.stringify(p, null, 2), TEMPLATE);
    assert.ok(found.some((m) => expected.test(m)), `expected ${expected} in:\n${found.join("\n")}`);
  });
}

const TEMPLATE_MUTATIONS = {
  "a new resource type, quoted": [(t) => t.replace(/^Outputs:/m, '  NewRule:\n    Type: "AWS::Events::Rule"\n\nOutputs:'),
    /NewRule: AWS::Events::Rule is new/],
  "a resource with no Type": [(t) => t.replace(/^Outputs:/m, "  Orphan:\n    Properties:\n      X: 1\n\nOutputs:"),
    /Orphan: expected one Type line, found 0/],
  "a table named outside the prefix": [(t) => t.replace("TableName: music-garden-songs", "TableName: mg-songs"),
    /TableName mg-songs is outside music-garden-\*/],
  "a table name built by !Sub": [(t) => t.replace("TableName: music-garden-songs", 'TableName: !Sub "${AWS::StackName}-songs"'),
    /TableName !Sub .* is not a literal/],
  "a table name in block form": [(t) => t.replace("TableName: music-garden-songs", 'TableName:\n        Fn::Sub: "x-songs"'),
    /TableName \(block\) is not a literal/],
  "a function with an explicit role": [(t) => t.replace("      Handler: songs.handler", "      Handler: songs.handler\n      Role: arn:aws:iam::123456789012:role/x"),
    /SongsFn: an explicit Role/],
  "a function with tracing": [(t) => t.replace("      Handler: songs.handler", "      Handler: songs.handler\n      Tracing: Active"),
    /widen AttachOnlyLambdaLogging/],
};
for (const [name, [mutate, expected]] of Object.entries(TEMPLATE_MUTATIONS)) {
  test(`template mutation reported: ${name}`, () => {
    const t = mutate(TEMPLATE);
    assert.notEqual(t, TEMPLATE, "the mutation applied");
    const found = problems(POLICY, POLICY_TEXT, t);
    assert.ok(found.some((m) => expected.test(m)), `expected ${expected} in:\n${found.join("\n")}`);
  });
}

test("harmless quoting in the template changes nothing", () => {
  const t = TEMPLATE.replace("    Type: AWS::DynamoDB::Table", '    Type: "AWS::DynamoDB::Table"   # quoted')
    .replace("TableName: music-garden-songs", "TableName: 'music-garden-songs'");
  assert.notEqual(t, TEMPLATE);
  assert.deepEqual(problems(POLICY, POLICY_TEXT, t), []);
});

test("an account ID pasted into the policy is reported", () => {
  const text = POLICY_TEXT.replace("arn:aws:sns:us-east-1:*:music-garden-*", "arn:aws:sns:us-east-1:123456789012:music-garden-*");
  assert.notEqual(text, POLICY_TEXT);
  assert.ok(problems(JSON.parse(text), text, TEMPLATE).some((m) => /account ID/.test(m)));
});
