// The `mg-deploy` policy in backend/README.md § One-time setup must cover what deploying backend/template.yaml
// needs, and nothing that reaches players' data or the rest of the account (TUN-113).
//
// Why a test: nobody can run the policy here — the owner pastes it into IAM Identity Center, and a missing
// action shows up only as a production deploy that fails and rolls back. The policy scopes resources by
// name (`music-garden-*`), so a template change that adds a new kind of resource, or names one outside that
// prefix, would break the next deploy silently.
//
// How: a small IAM evaluator — Allow and Deny, Action, Resource and NotResource with `*` and `?`, and the
// conditions this policy uses (StringEquals; ArnEquals and ArnLike with wildcards; on aws:RequestedRegion, iam:PassedToService,
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
// StringEquals is literal; ArnEquals and ArnLike both take `*` and `?` (AWS's condition operators).
const OPS = { StringEquals: (want, got) => want === got, ArnEquals: resourceMatches, ArnLike: resourceMatches };
const KEYS = ["aws:RequestedRegion", "iam:PassedToService", "iam:PolicyARN"];

// Every operator and key is checked before anything is evaluated, so nothing hides behind a failed match.
function validateCondition(cond) {
  for (const [op, kv] of Object.entries(cond ?? {})) {
    if (!OPS[op]) throw new Error(`unsupported condition operator ${op}`);
    for (const key of Object.keys(kv)) if (!KEYS.includes(key)) throw new Error(`unsupported condition key ${key}`);
  }
}
function conditionHolds(cond, ctx) {
  validateCondition(cond);
  return Object.entries(cond ?? {}).every(([op, kv]) => Object.entries(kv).every(([key, want]) =>
    key in ctx && list(want).some((w) => OPS[op](w, ctx[key]))));
}
// Is `action` on `arn` allowed? An explicit Deny wins; otherwise some Allow must apply.
function allowed(policy, action, arn, extra = {}) {
  const ctx = { "aws:RequestedRegion": REGION, ...extra };
  for (const s of policy.Statement) validateCondition(s.Condition);
  const applies = (s) => list(s.Action).some((a) => actionMatches(a, action)) &&
    (s.Resource ? list(s.Resource).some((r) => resourceMatches(r, arn))
      : !list(s.NotResource).some((r) => resourceMatches(r, arn))) &&
    conditionHolds(s.Condition, ctx);
  if (policy.Statement.some((s) => s.Effect === "Deny" && applies(s))) return false;
  return policy.Statement.some((s) => s.Effect === "Allow" && applies(s));
}

// --- the template's resources, read structurally and fail-closed ---
// The template is block-style YAML. mapOf reads one map level: its keys (plain or quoted) at whatever
// indentation its first entry has, each with its inline value and the lines nested under it. Anything at
// that level that is not `key: value`, or that sits shallower, is an error — never silently skipped.
const indentOf = (l) => l.match(/^ */)[0].length;
const isContent = (l) => l.trim() !== "" && !l.trim().startsWith("#");
const KEY_LINE = /^ *(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9:]+)):(?:[ \t]+(.*))?$/;
function mapOf(lines, where) {
  const first = lines.find(isContent);
  if (!first) return {};
  const ind = indentOf(first);
  const out = {};
  let cur = null;
  for (const l of lines) {
    if (!isContent(l)) { cur?.lines.push(l); continue; }
    if (indentOf(l) < ind) throw new Error(`${where}: unreadable indentation at "${l.trim()}"`);
    if (indentOf(l) > ind) { cur.lines.push(l); continue; }
    const m = l.match(KEY_LINE);
    if (!m) throw new Error(`${where}: unreadable line "${l.trim()}"`);
    const key = m[1] ?? m[2] ?? m[3];
    if (key in out) throw new Error(`${where}: ${key} appears twice`);
    cur = out[key] = { raw: m[4] ?? "", lines: [] };
  }
  return out;
}
// A YAML scalar's literal value; { expr } for anything that is not a literal (a tag, a block form, a map).
function scalar(entry) {
  const v = entry.raw.replace(/\s+#.*$/, "").trim();
  if (v === "") return { expr: entry.lines.some(isContent) ? "(block)" : "(empty)" };
  if (/^[!{[&*|>]/.test(v)) return { expr: v };
  const q = v.match(/^"([^"]*)"$|^'([^']*)'$/);
  return q ? q[1] ?? q[2] : v;
}
function resources(template) {
  const lines = template.split("\n");
  const start = lines.indexOf("Resources:");
  if (start < 0) throw new Error("template.yaml has no Resources: section");
  const end = lines.findIndex((l, i) => i > start && /^[^\s#]/.test(l));
  return Object.entries(mapOf(lines.slice(start + 1, end < 0 ? undefined : end), "Resources")).map(([name, e]) => {
    if (e.raw.trim()) throw new Error(`${name}: a resource must be a block map`);
    const body = mapOf(e.lines, name);
    if (!body.Type) throw new Error(`${name}: no Type`);
    const type = scalar(body.Type);
    if (typeof type !== "string" || !/^AWS::[A-Za-z0-9]+::[A-Za-z0-9]+$/.test(type))
      throw new Error(`${name}: unreadable Type ${JSON.stringify(type)}`);
    const props = body.Properties ? mapOf(body.Properties.lines, `${name}.Properties`) : {};
    return { name, type, props };
  });
}
const prop = (r, key) => (r.props[key] ? scalar(r.props[key]) : undefined);

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
const fnName = (r) => literal(prop(r, "FunctionName"), generated(r));
// A Lambda::Permission's FunctionName: a literal name, or !Ref / !GetAtt …Arn of a function in this
// template. Anything else cannot be checked, and is reported.
function permissionTarget(r, rs) {
  const v = prop(r, "FunctionName");
  if (typeof v === "string") return { name: v };
  const m = v?.expr.match(/^!Ref\s+([A-Za-z0-9]+)$|^!GetAtt\s+([A-Za-z0-9]+)\.Arn$/);
  const target = m && rs.find((x) => x.name === (m[1] ?? m[2]) && x.type === "AWS::Serverless::Function");
  return target ? { name: fnName(target) } : { error: `${r.name}: FunctionName ${v?.expr ?? "(missing)"} is not a function in this template` };
}

const LAMBDA_FN_ACTIONS = ["CreateFunction", "UpdateFunctionCode", "UpdateFunctionConfiguration", "DeleteFunction",
  "GetFunction", "GetFunctionConfiguration", "PutFunctionConcurrency", "DeleteFunctionConcurrency",
  "GetFunctionConcurrency", "PutFunctionEventInvokeConfig", "UpdateFunctionEventInvokeConfig",
  "DeleteFunctionEventInvokeConfig", "GetFunctionEventInvokeConfig", "TagResource", "UntagResource", "ListTags",
  "GetFunctionCodeSigningConfig", "GetRuntimeManagementConfig", "PutRuntimeManagementConfig"].map((a) => `lambda:${a}`);
const DDB_TABLE_ACTIONS = ["CreateTable", "UpdateTable", "DeleteTable", "DescribeTable", "DescribeTimeToLive",
  "UpdateTimeToLive", "DescribeContinuousBackups", "UpdateContinuousBackups", "DescribeContributorInsights",
  "DescribeKinesisStreamingDestination", "GetResourcePolicy", "TagResource", "UntagResource", "ListTagsOfResource"]
  .map((a) => `dynamodb:${a}`);
// SNS authorizes subscription calls against the parent topic (AWS's authorization reference).
const SNS_TOPIC_ACTIONS = ["CreateTopic", "DeleteTopic", "GetTopicAttributes", "SetTopicAttributes", "Subscribe",
  "Unsubscribe", "ListSubscriptionsByTopic", "GetSubscriptionAttributes", "SetSubscriptionAttributes", "TagResource",
  "UntagResource", "ListTagsForResource", "GetDataProtectionPolicy", "PutDataProtectionPolicy"].map((a) => `sns:${a}`);
const S3_BUCKET_ACTIONS = ["CreateBucket", "DeleteBucket", "PutBucketPolicy", "GetBucketPolicy", "PutBucketVersioning",
  "PutEncryptionConfiguration", "PutBucketTagging", "PutBucketPublicAccessBlock", "GetBucketLocation", "ListBucket"]
  .map((a) => `s3:${a}`);
const S3_OBJECT_ACTIONS = ["s3:PutObject", "s3:GetObject", "s3:GetObjectVersion", "s3:DeleteObject"];

const NEEDS = {
  "AWS::Serverless::Function": (r) => {
    const fn = arn.fn(fnName(r));
    const role = arn.role(generated(r, "Role"));
    return [
      ...on(fn, LAMBDA_FN_ACTIONS),
      ["lambda:PutFunctionEventInvokeConfig", `${fn}:$LATEST`],
      ...on(role, ["CreateRole", "DeleteRole", "GetRole", "UpdateRole", "UpdateAssumeRolePolicy", "TagRole", "UntagRole",
        "ListRoleTags", "PutRolePolicy", "GetRolePolicy", "DeleteRolePolicy", "ListRolePolicies",
        "ListAttachedRolePolicies", "DetachRolePolicy"].map((a) => `iam:${a}`)),
      ["iam:AttachRolePolicy", role, { "iam:PolicyARN": BASIC_LOGGING }],
      ["iam:PassRole", role, { "iam:PassedToService": "lambda.amazonaws.com" }],
    ];
  },
  "AWS::Lambda::Permission": (r, rs) => {
    const t = permissionTarget(r, rs);
    return t.error ? [] : on(arn.fn(t.name), ["lambda:AddPermission", "lambda:RemovePermission", "lambda:GetPolicy"]);
  },
  "AWS::Serverless::HttpApi": () => ["GET", "POST", "PUT", "PATCH", "DELETE"].flatMap((v) => [
    `arn:aws:apigateway:${REGION}::/apis`, `arn:aws:apigateway:${REGION}::/apis/a1b2c3d4e5`,
    `arn:aws:apigateway:${REGION}::/apis/a1b2c3d4e5/stages/$default`,
    `arn:aws:apigateway:${REGION}::/apis/a1b2c3d4e5/routes/r1s2t3`,
    `arn:aws:apigateway:${REGION}::/tags/arn%3Aaws%3Aapigateway%3A${REGION}%3A%3A%2Fapis%2Fa1b2c3d4e5`,
  ].map((a) => [`apigateway:${v}`, a])),
  "AWS::DynamoDB::Table": (r) => on(arn.table(literal(prop(r, "TableName"), generated(r))), DDB_TABLE_ACTIONS),
  "AWS::Cognito::UserPool": () => [
    ["cognito-idp:CreateUserPool", "*"],
    ...on(arn.pool, ["UpdateUserPool", "DescribeUserPool", "DeleteUserPool", "SetUserPoolMfaConfig",
      "GetUserPoolMfaConfig", "AddCustomAttributes", "TagResource", "UntagResource", "ListTagsForResource"]
      .map((a) => `cognito-idp:${a}`)),
  ],
  "AWS::Cognito::UserPoolClient": () => on(arn.pool, ["CreateUserPoolClient", "UpdateUserPoolClient",
    "DescribeUserPoolClient", "DeleteUserPoolClient"].map((a) => `cognito-idp:${a}`)),
  "AWS::SNS::Topic": (r) => on(arn.topic(literal(prop(r, "TopicName"), generated(r))), SNS_TOPIC_ACTIONS),
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

// SAM's own calls (resolve_s3: its managed stack and bucket), and the README's runbook. Change-set calls
// authorize against the stack (AWS's authorization reference), so they are checked there; the policy's
// grant on changeSet/* is extra, and not required.
const SAM_AND_RUNBOOK = [
  ...[arn.stack(STACK), arn.stack("aws-sam-cli-managed-default")].flatMap((a) => on(a,
    ["CreateChangeSet", "DescribeChangeSet", "ExecuteChangeSet", "DeleteChangeSet", "ListChangeSets", "DescribeStacks",
      "DescribeStackEvents", "DescribeStackResource", "DescribeStackResources", "GetTemplate", "GetTemplateSummary",
      "ContinueUpdateRollback", "CreateStack", "UpdateStack", "DeleteStack"].map((x) => `cloudformation:${x}`))),
  ["cloudformation:CreateChangeSet", `arn:aws:cloudformation:${REGION}:aws:transform/Serverless-2016-10-31`],
  ["cloudformation:ValidateTemplate", "*"],
  ...on(arn.bucket, S3_BUCKET_ACTIONS),
  ...on(`${arn.bucket}/music-garden/0123abcd.template`, S3_OBJECT_ACTIONS),
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
  ...rs.filter((r) => r.type === "AWS::Serverless::Function" && fnName(r) !== "music-garden-cloud-switch")
    .flatMap((r) => ["lambda:InvokeFunction", "lambda:InvokeAsync"].flatMap((a) =>
      [[a, arn.fn(fnName(r))], [a, `${arn.fn(fnName(r))}:$LATEST`], [a, `${arn.fn(fnName(r))}:live`]])),
  ["lambda:InvokeFunction", arn.fn("music-garden-cloud-switch-copy")],
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
  const out = new Set();   // one report per distinct problem
  const say = (m) => out.add(m);
  if (policy.Version !== "2012-10-17") say("Version is not 2012-10-17");
  if (/\b\d{12}\b/.test(text)) say("an account ID is in the policy (the repository is public)");
  for (const m of sizeProblems(text)) say(m);
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
    try { validateCondition(s.Condition); } catch (e) { say(`${s.Sid}: ${e.message}`); }
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
      if (r.type === "AWS::Lambda::Permission") {   // its FunctionName points at a function
        if (key !== "FunctionName") continue;
        const t = permissionTarget(r, rs);
        if (t.error) say(t.error);
        else if (!t.name.startsWith(prefix)) say(`${r.name}: FunctionName ${t.name} is outside ${prefix}*`);
        continue;
      }
      const v = prop(r, key);
      if (v === undefined) { if (key === "Name" && r.type === "AWS::SSM::Parameter") say(`${r.name}: needs an explicit Name`); continue; }
      if (typeof v !== "string") say(`${r.name}: ${key} ${v.expr} is not a literal — the policy matches names, so spell it out`);
      else if (!v.startsWith(prefix)) say(`${r.name}: ${key} ${v} is outside ${prefix}*`);
    }
    if (r.type === "AWS::Serverless::Function" && prop(r, "Role") !== undefined)
      say(`${r.name}: an explicit Role is not created as ${STACK}-* — the policy cannot pass it`);
    for (const [action, resource, extra] of needs(r, rs))
      if (check(action, resource, extra) === false) say(`${r.name}: needs ${action} on ${resource}`);
  }
  for (const [action, resource, extra] of SAM_AND_RUNBOOK)
    if (check(action, resource, extra) === false) say(`SAM/runbook: needs ${action} on ${resource}`);
  for (const [action, resource, extra] of NEVER(rs))
    if (check(action, resource, extra)) say(`must not allow ${action} on ${resource} ${JSON.stringify(extra ?? {})}`);
  if (/^\s+["']?(Tracing|VpcConfig|Layers|ManagedPolicyArns|PermissionsBoundary)["']?:/m.test(template))
    say("the template attaches more to the functions' roles than Lambda's logging policy — widen AttachOnlyLambdaLogging");
  return [...out];
}

// IAM Identity Center's inline-policy limits: 32,768 bytes in all, and 10,240 bytes without whitespace.
function sizeProblems(text) {
  const out = [];
  if (Buffer.byteLength(text, "utf8") > 32768) out.push("over Identity Center's 32,768-byte inline policy limit");
  if (Buffer.byteLength(text.replace(/\s/g, ""), "utf8") > 10240)
    out.push("over Identity Center's 10,240-byte limit without whitespace");
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
  "AttachRolePolicy's ArnEquals gains a wildcard": [(p) => {
    stmt(p, "AttachOnlyLambdaLogging").Condition.ArnEquals["iam:PolicyARN"] = [BASIC_LOGGING, "arn:aws:iam::aws:policy/Admin*"];
  }, /must not allow iam:AttachRolePolicy .*AdministratorAccess/],
  "an unsupported operator after a supported condition that fails": [(p) => {
    p.Statement.push({ Sid: "Extra", Effect: "Allow", Action: "sns:Publish", Resource: "arn:aws:sns:us-east-1:*:music-garden-*",
      Condition: { StringEquals: { "iam:PassedToService": "nothing" }, StringLike: { "aws:RequestedRegion": "us-*" } } });
  }, /Extra: unsupported condition operator StringLike/],
  "an unsupported key in a supported operator": [(p) => {
    stmt(p, "VoiceClips").Condition.StringEquals["aws:SourceIp"] = "1.2.3.4";
  }, /VoiceClips: unsupported condition key aws:SourceIp/],
  "the music-garden stack grant is dropped": [(p) => {
    const s = stmt(p, "Stacks"); s.Resource = s.Resource.filter((r) => !r.includes("stack/music-garden/"));
  }, /needs cloudformation:ExecuteChangeSet on .*stack\/music-garden\//],
  "the SAM managed stack grant is dropped": [(p) => {
    const s = stmt(p, "Stacks"); s.Resource = s.Resource.filter((r) => !r.includes("aws-sam-cli-managed-default"));
  }, /needs cloudformation:DescribeStacks on .*stack\/aws-sam-cli-managed-default\//],
  "Lambda narrowed without the event-invoke read": [(p) => {
    stmt(p, "Functions").Action = LAMBDA_FN_ACTIONS.filter((a) => a !== "lambda:GetFunctionEventInvokeConfig")
      .concat(["lambda:AddPermission", "lambda:RemovePermission", "lambda:GetPolicy", "lambda:InvokeFunction"]);
  }, /needs lambda:GetFunctionEventInvokeConfig/],
  "Lambda narrowed without the configuration read": [(p) => {
    stmt(p, "Functions").Action = LAMBDA_FN_ACTIONS.filter((a) => a !== "lambda:GetFunctionConfiguration")
      .concat(["lambda:AddPermission", "lambda:RemovePermission", "lambda:GetPolicy", "lambda:InvokeFunction"]);
  }, /needs lambda:GetFunctionConfiguration/],
  "SNS narrowed without the data-protection read": [(p) => {
    stmt(p, "Topics").Action = SNS_TOPIC_ACTIONS.filter((a) => a !== "sns:GetDataProtectionPolicy").concat("sns:Publish");
  }, /needs sns:GetDataProtectionPolicy/],
  "DynamoDB without the backups read": [(p) => {
    const s = stmt(p, "TablesNotTheirData"); s.Action = s.Action.filter((a) => a !== "dynamodb:DescribeContinuousBackups");
  }, /needs dynamodb:DescribeContinuousBackups/],
  "the SAM bucket narrowed without versioning": [(p) => {
    stmt(p, "SamBucket").Action = S3_BUCKET_ACTIONS.filter((a) => a !== "s3:PutBucketVersioning").concat(S3_OBJECT_ACTIONS);
  }, /needs s3:PutBucketVersioning/],
};
for (const [name, [mutate, expected]] of Object.entries(MUTATIONS)) {
  test(`mutation reported: ${name}`, () => {
    const p = clone(); mutate(p);
    const found = problems(p, JSON.stringify(p, null, 2), TEMPLATE);
    assert.ok(found.some((m) => expected.test(m)), `expected ${expected} in:\n${found.join("\n")}`);
  });
}

test("dropping the extra change-set grant changes nothing: change-set calls authorize against the stack", () => {
  const p = clone();
  const s = stmt(p, "Stacks"); s.Resource = s.Resource.filter((r) => !r.includes(":changeSet/"));
  assert.equal(s.Resource.length, 2);
  assert.deepEqual(problems(p, JSON.stringify(p, null, 2), TEMPLATE), []);
});

test("the evaluator: Deny wins in either order, NotResource exempts, missing condition keys fail", () => {
  const fn = (n) => arn.fn(n);
  const allow = { Sid: "A", Effect: "Allow", Action: "lambda:*", Resource: ["arn:aws:lambda:us-east-1:*:function:music-garden-*",
    "arn:aws:lambda:us-east-1:*:function:music-garden-*:*"] };
  const deny = stmt(POLICY, "InvokeOnlyTheCostSwitch");
  for (const order of [[allow, deny], [deny, allow]]) {
    const p = { Version: "2012-10-17", Statement: order };
    for (const ok of ["music-garden-cloud-switch", "music-garden-cloud-switch:$LATEST", "music-garden-cloud-switch:3",
      "music-garden-cloud-switch:live"]) assert.ok(allowed(p, "lambda:InvokeFunction", fn(ok)), ok);
    for (const no of [`${STACK}-SongsFn-${rand}`, `${STACK}-SongsFn-${rand}:$LATEST`, `${STACK}-SongsFn-${rand}:7`,
      "music-garden-cloud-switch-copy", "music-garden-cloud-switch-copy:1"])
      assert.ok(!allowed(p, "lambda:InvokeFunction", fn(no)), no);
    assert.ok(allowed(p, "lambda:UpdateFunctionCode", fn(`${STACK}-SongsFn-${rand}`)), "the Deny spares management");
    assert.ok(!allowed(p, "lambda:InvokeAsync", fn(`${STACK}-SongsFn-${rand}`)), "InvokeAsync is denied too");
  }
  const pass = { Version: "2012-10-17", Statement: [stmt(POLICY, "PassRolesToLambdaOnly")] };
  const role = arn.role(`${STACK}-SongsFnRole-${rand}`);
  assert.ok(allowed(pass, "iam:PassRole", role, { "iam:PassedToService": "lambda.amazonaws.com" }));
  assert.ok(!allowed(pass, "iam:PassRole", role), "a missing condition key does not match");
  const attach = { Version: "2012-10-17", Statement: [{ ...stmt(POLICY, "AttachOnlyLambdaLogging"),
    Condition: { ArnEquals: { "iam:PolicyARN": "arn:aws:iam::aws:policy/service-role/*" } } }] };
  assert.ok(allowed(attach, "iam:AttachRolePolicy", role, { "iam:PolicyARN": BASIC_LOGGING }), "ArnEquals takes wildcards");
  assert.ok(!allowed(attach, "iam:AttachRolePolicy", role, { "iam:PolicyARN": "arn:aws:iam::aws:policy/AdministratorAccess" }));
});

test("both Identity Center size limits, at their boundaries", () => {
  const bytes = (t) => Buffer.byteLength(t, "utf8");
  const nonWs = bytes(POLICY_TEXT.replace(/\s/g, ""));
  assert.deepEqual(sizeProblems(POLICY_TEXT + "x".repeat(10240 - nonWs)), []);
  assert.deepEqual(sizeProblems(POLICY_TEXT + "x".repeat(10241 - nonWs)), ["over Identity Center's 10,240-byte limit without whitespace"]);
  assert.deepEqual(sizeProblems(POLICY_TEXT + " ".repeat(32768 - bytes(POLICY_TEXT))), []);
  assert.deepEqual(sizeProblems(POLICY_TEXT + " ".repeat(32769 - bytes(POLICY_TEXT))), ["over Identity Center's 32,768-byte inline policy limit"]);
  assert.ok(problems(POLICY, POLICY_TEXT + " ".repeat(32769), TEMPLATE).some((m) => /32,768-byte/.test(m)));
});

// Indents every line under `name`'s Properties two more spaces (still valid YAML).
function deeperProperties(template, name) {
  const lines = template.split("\n");
  const at = lines.indexOf(`  ${name}:`);
  let i = lines.indexOf("    Properties:", at) + 1;
  for (; i < lines.length && (lines[i].startsWith("      ") || lines[i].trim() === ""); i++)
    if (lines[i].trim()) lines[i] = "  " + lines[i];
  return lines.join("\n");
}

const TEMPLATE_MUTATIONS = {
  "a new resource type, quoted": [(t) => t.replace(/^Outputs:/m, '  NewRule:\n    Type: "AWS::Events::Rule"\n\nOutputs:'),
    /NewRule: AWS::Events::Rule is new/],
  "a resource with no Type": [(t) => t.replace(/^Outputs:/m, "  Orphan:\n    Properties:\n      X: 1\n\nOutputs:"),
    /Orphan: no Type/],
  "a table name with a quoted key": [(t) => t.replace("TableName: music-garden-songs", '"TableName": mg-songs'),
    /TableName mg-songs is outside music-garden-\*/],
  "a table's properties indented deeper": [(t) => deeperProperties(t, "SongsTable").replace("TableName: music-garden-songs", "TableName: mg-songs"),
    /SongsTable: TableName mg-songs is outside music-garden-\*/],
  "an explicit role with a quoted key": [(t) => t.replace("      Handler: songs.handler", '      Handler: songs.handler\n      "Role": arn:aws:iam::123456789012:role/other'),
    /SongsFn: an explicit Role/],
  "a permission for an unrelated function": [(t) => t.replace("FunctionName: !Ref PreSignUpFn", "FunctionName: other"),
    /PreSignUpPermission: FunctionName other is outside music-garden-\*/],
  "a permission for a missing resource": [(t) => t.replace("FunctionName: !Ref PreSignUpFn", "FunctionName: !Ref Nope"),
    /PreSignUpPermission: FunctionName !Ref Nope is not a function in this template/],
  "a permission target built by !Sub": [(t) => t.replace("FunctionName: !Ref PreSignUpFn", 'FunctionName: !Sub "${PreSignUpFn}"'),
    /PreSignUpPermission: FunctionName !Sub .* is not a function in this template/],
  "a line the reader cannot parse": [(t) => t.replace("      Handler: songs.handler", "      Handler: songs.handler\n      - stray"),
    /SongsFn.Properties: unreadable line "- stray"/],
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

test("harmless quoting, indentation and references in the template change nothing", () => {
  const t = deeperProperties(TEMPLATE, "ProgressTable")
    .replace("    Type: AWS::DynamoDB::Table", '    Type: "AWS::DynamoDB::Table"   # quoted')
    .replace("TableName: music-garden-songs", "'TableName': 'music-garden-songs'")
    .replace("FunctionName: !Ref PreSignUpFn", "FunctionName: !GetAtt PreSignUpFn.Arn");
  assert.notEqual(t, TEMPLATE);
  assert.deepEqual(problems(POLICY, POLICY_TEXT, t), []);
});

test("an account ID pasted into the policy is reported", () => {
  const text = POLICY_TEXT.replace("arn:aws:sns:us-east-1:*:music-garden-*", "arn:aws:sns:us-east-1:123456789012:music-garden-*");
  assert.notEqual(text, POLICY_TEXT);
  assert.ok(problems(JSON.parse(text), text, TEMPLATE).some((m) => /account ID/.test(m)));
});
