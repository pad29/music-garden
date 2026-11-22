// backend/template.yaml must keep TUN-82's cost limits and data protection, TUN-76's CORS origins, TUN-87's
// cost switch and TUN-88's daily sign-up limit, and the repository must never hold the budget's email address.
//
// Why a test: the backend has no deploy preview and the worker that edits the template has no AWS
// credentials, so a dropped throttle, a lost Retain or a committed address would first show up in
// production — or on a public repository. Later backend tickets (TUN-76, TUN-83, TUN-87, TUN-88) all edit
// this template. This is a static check, not CloudFormation validation: the owner's deploy runs
// `sam validate --lint` and reads the change set (backend/README.md § Future deploys).
//
// Every setting is checked at its EFFECTIVE path (Resources.<Name>.DeletionPolicy, …Properties.Events.<E>
// .Properties.RouteSettings, …), so the same text under Metadata or anywhere else does not count. The
// parser is a small one for the block-style YAML subset this template uses (maps, lists, scalars, quotes,
// comments, short-form tags kept as strings): no YAML library is installed, and tests here run with
// nothing to install. It throws on anything it does not understand rather than guessing.
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./helpers/game-scripts.mjs";

const TEMPLATE = readFileSync(join(ROOT, "backend", "template.yaml"), "utf8").replace(/\r/g, "");
const SAMCONFIG = readFileSync(join(ROOT, "backend", "samconfig.toml"), "utf8").replace(/\r/g, "");

// The approved configuration (owner, TUN-82, 2026-11-13): route → [nominal rate/s, burst]. The rates sum to
// 5 requests a second. Change these only with the arithmetic in reviews/TUN-82-*.md redone.
const ROUTES = {
  "PUT /progress": [2, 10],
  "GET /progress": [1, 5],
  "GET /songs/{id}": [1, 5],
  "POST /songs": [0.25, 2],
  "GET /songs": [0.25, 2],
  "PUT /songs/{id}": [0.25, 2],
  "DELETE /songs/{id}": [0.25, 2],
};
const DEFAULT_ROUTE = [0.25, 2];
const RESERVED_CONCURRENCY = 2;
const ALERTS = ["ACTUAL 100", "ACTUAL 50", "ACTUAL 80", "FORECASTED 100"];
// The browser origins the API answers (TUN-76, 2026-11-14): the production site only. The retired
// music-garden.netlify.app is gone; deploy previews are the owner's call, not a worker's.
const ORIGINS = ["https://tunegarden.game", "https://www.tunegarden.game"];
const ORIGIN_LINES = "          - https://tunegarden.game\n          - https://www.tunegarden.game\n";   // as template.yaml lists them
const ALLOWED_EMAIL = /@example\.com$/i;   // documentation placeholders only (you@ / new@example.com)

// ---- a minimal block-YAML parser --------------------------------------------------------------------
const KEY = /^([^\s#'"\-][^:]*?|"[^"]*"|'[^']*'):(?:\s+(.*))?$/;
// A scalar is a string, or — for an UNQUOTED short-form tag — an object: `!Ref X` is { Ref: "X" }, the same
// shape as the block form `Ref: X`, and `!Sub …` is { "Fn::Sub": "…" }. A QUOTED "!Ref X" stays a plain
// string, as CloudFormation reads it: a literal, not a reference. Syntax this parser does not implement
// (flow collections, anchors, aliases, block scalars, tags it does not know) throws rather than being
// misread as a string.
const TAGS = { "!Ref": "Ref", "!GetAtt": "Fn::GetAtt", "!Sub": "Fn::Sub" };
function scalar(v) {
  v = v.trim();
  if (v[0] === '"') {
    let end = 1;
    while (end < v.length && v[end] !== '"') end += v[end] === "\\" ? 2 : 1;
    if (end >= v.length) throw new Error(`unterminated quote: ${v}`);
    try { return JSON.parse(v.slice(0, end + 1)); }   // YAML's double-quoted escapes, as far as JSON shares them
    catch { throw new Error(`unsupported YAML escape: ${v}`); }
  }
  if (v[0] === "'") {
    const m = v.match(/^'((?:[^']|'')*)'/);
    if (!m) throw new Error(`unterminated quote: ${v}`);
    return m[1].replace(/''/g, "'");
  }
  const hash = v.search(/(^|\s)#/);   // `key:   # comment` has no value
  v = (hash >= 0 ? v.slice(0, hash) : v).trim();
  if (/^[{[&*|>?]/.test(v)) throw new Error(`unsupported YAML syntax: ${v}`);
  if (v[0] === "!") {
    const [tag, ...rest] = v.split(/\s+/);
    if (!TAGS[tag]) throw new Error(`unsupported YAML tag: ${tag}`);
    return { [TAGS[tag]]: scalar(rest.join(" ")) };
  }
  return v;
}
const isRef = (v, name) => !!v && typeof v === "object" && Object.keys(v).length === 1 && v.Ref === name;
export function parseYaml(text) {
  const L = text.split("\n")
    .map((raw) => ({ ind: raw.length - raw.trimStart().length, s: raw.trim() }))
    .filter((l) => l.s && !l.s.startsWith("#"));
  let i = 0;
  const isItem = (l) => l.s === "-" || l.s.startsWith("- ");
  const block = (ind) => (isItem(L[i]) ? list(ind) : map(ind));
  function map(ind) {
    const o = {};
    while (i < L.length && L[i].ind >= ind) {
      if (L[i].ind > ind) throw new Error(`unexpected indent: ${L[i].s}`);
      if (isItem(L[i])) break;
      const m = L[i].s.match(KEY);
      if (!m) throw new Error(`not a key: ${L[i].s}`);
      i++;
      const key = scalar(m[1]), rest = m[2] === undefined ? "" : scalar(m[2]);
      if (rest !== "") o[key] = rest;
      else if (i < L.length && (L[i].ind > ind || (L[i].ind === ind && isItem(L[i])))) o[key] = block(L[i].ind);
      else o[key] = null;
    }
    return o;
  }
  function list(ind) {
    const a = [];
    while (i < L.length && L[i].ind === ind && isItem(L[i])) {
      const rest = L[i].s.slice(1).trimStart();
      if (!rest) { i++; a.push(block(L[i].ind)); continue; }
      if (KEY.test(rest)) { L[i] = { ind: ind + (L[i].s.length - rest.length), s: rest }; a.push(map(L[i].ind)); }
      else { a.push(scalar(rest)); i++; }
    }
    return a;
  }
  const doc = map(0);
  if (i < L.length) throw new Error(`could not parse from: ${L[i].s}`);
  return doc;
}

// ---- the cost switch (TUN-87) -----------------------------------------------------------------------
// Its whole delivery path, its timing, and a role that may touch exactly the three game functions, this one
// API and its own notice topic — compared as exact JSON, so an extra action, a `*`, a quoted (literal)
// reference or the switch naming itself is a difference. backend/README.md § The cost switch.
const SWITCH_CONCURRENCY = 1;
const SWITCH_INVOKE = { MaximumEventAgeInSeconds: "21600", MaximumRetryAttempts: "2" };   // a late real trip still lands; a failed one is retried
const STATE_NAME = "/music-garden/cloud-switch/on-at";
// Everything CloudSwitchFn may set: no Role (it would bypass the checked Policies), no Events, no FunctionUrlConfig.
const SWITCH_PROPS = ["CodeUri", "Environment", "EventInvokeConfig", "FunctionName", "Handler", "Policies", "ReservedConcurrentExecutions", "Timeout"];
const ref = (n) => ({ Ref: n }), att = (s) => ({ "Fn::GetAtt": s }), sub = (s) => ({ "Fn::Sub": s });
const SWITCH_ENV = {
  PROGRESS_FN: ref("ProgressFn"), SONGS_FN: ref("SongsFn"), PRESIGNUP_FN: ref("PreSignUpFn"), API_ID: ref("Api"),
  ON_CONCURRENCY: String(RESERVED_CONCURRENCY), ALARM_TOPIC_ARN: ref("CloudSwitchAlarmTopic"), NOTICE_TOPIC_ARN: ref("CloudSwitchNoticeTopic"),
  STATE_PARAM: ref("CloudSwitchState"),
};
const SWITCH_POLICY = [{ Statement: [
  { Effect: "Allow", Action: ["lambda:GetFunctionConcurrency", "lambda:PutFunctionConcurrency"],
    Resource: [att("ProgressFn.Arn"), att("SongsFn.Arn"), att("PreSignUpFn.Arn")] },
  { Effect: "Allow", Action: ["apigateway:GET", "apigateway:PATCH"], Resource: sub("arn:aws:apigateway:${AWS::Region}::/apis/${Api}") },
  { Effect: "Allow", Action: "sns:Publish", Resource: ref("CloudSwitchNoticeTopic") },
  { Effect: "Allow", Action: ["ssm:GetParameter", "ssm:PutParameter"], Resource: sub("arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter" + STATE_NAME) },
] }];
const BUDGETS_PUBLISH = { Version: "2012-10-17", Statement: [{
  Sid: "BudgetsPublish", Effect: "Allow", Principal: { Service: "budgets.amazonaws.com" }, Action: "SNS:Publish",
  Resource: ref("CloudSwitchAlarmTopic"),
  Condition: { StringEquals: { "aws:SourceAccount": ref("AWS::AccountId") }, ArnLike: { "aws:SourceArn": sub("arn:aws:budgets::${AWS::AccountId}:*") } },
}] };
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === "object"
  ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));   // key order is formatting
function switchProblems(t) {
  const problems = [], R = t.Resources || {};
  const P = (n) => (R[n] || {}).Properties || {};
  const need = (cond, msg) => { if (!cond) problems.push(msg); };
  need((R.CloudSwitchAlarmTopic || {}).Type === "AWS::SNS::Topic", "CloudSwitchAlarmTopic is not an SNS topic");
  need(!("KmsMasterKeyId" in P("CloudSwitchAlarmTopic")), "CloudSwitchAlarmTopic is encrypted (Budgets cannot publish to it)");
  need(!("Subscription" in P("CloudSwitchAlarmTopic")), "CloudSwitchAlarmTopic has inline subscriptions");
  const tp = P("CloudSwitchAlarmTopicPolicy");
  need((R.CloudSwitchAlarmTopicPolicy || {}).Type === "AWS::SNS::TopicPolicy" && same(tp.Topics, [ref("CloudSwitchAlarmTopic")])
    && same(tp.PolicyDocument, BUDGETS_PUBLISH), "CloudSwitchAlarmTopicPolicy must let only Budgets, from this account, publish");
  need((R.CloudSwitchAlarmSubscription || {}).Type === "AWS::SNS::Subscription" && same(P("CloudSwitchAlarmSubscription"),
    { TopicArn: ref("CloudSwitchAlarmTopic"), Protocol: "lambda", Endpoint: att("CloudSwitchFn.Arn") }), "CloudSwitchAlarmSubscription must deliver the alarm topic to CloudSwitchFn");
  need((R.CloudSwitchAlarmPermission || {}).Type === "AWS::Lambda::Permission" && same(P("CloudSwitchAlarmPermission"),
    { Action: "lambda:InvokeFunction", FunctionName: ref("CloudSwitchFn"), Principal: "sns.amazonaws.com", SourceArn: ref("CloudSwitchAlarmTopic") }),
    "CloudSwitchAlarmPermission must let only the alarm topic invoke CloudSwitchFn");
  const dep = (R.MonthlyBudget || {}).DependsOn;
  need(Array.isArray(dep) && ["CloudSwitchAlarmTopicPolicy", "CloudSwitchAlarmSubscription", "CloudSwitchAlarmPermission"].every((d) => dep.includes(d)),
    "MonthlyBudget must DependsOn the switch's topic policy, subscription and permission");
  need((R.CloudSwitchNoticeTopic || {}).Type === "AWS::SNS::Topic" && same(P("CloudSwitchNoticeTopic").Subscription,
    [{ Protocol: "email", Endpoint: ref("BudgetEmail") }]), "CloudSwitchNoticeTopic must email exactly !Ref BudgetEmail");
  const f = P("CloudSwitchFn");
  need((R.CloudSwitchFn || {}).Type === "AWS::Serverless::Function" && f.Handler === "cloud-switch.handler" && f.CodeUri === "src/"
    && f.FunctionName === "music-garden-cloud-switch", "CloudSwitchFn is not the switch (music-garden-cloud-switch, cloud-switch.handler)");
  need(num(f.Timeout) === 60, `CloudSwitchFn timeout is ${f.Timeout}, approved 60`);
  need(num(f.ReservedConcurrentExecutions) === SWITCH_CONCURRENCY, `CloudSwitchFn reserved concurrency is ${f.ReservedConcurrentExecutions}, approved ${SWITCH_CONCURRENCY}`);
  need(same(f.EventInvokeConfig, SWITCH_INVOKE), "CloudSwitchFn's EventInvokeConfig must be exactly a 21600-second event age and 2 retries");
  need(!("Events" in f), "CloudSwitchFn has Events (its only trigger is CloudSwitchAlarmSubscription)");
  const extra = Object.keys(f).filter((k) => !SWITCH_PROPS.includes(k));
  need(!extra.length, `CloudSwitchFn sets ${extra.join(", ")} (only ${SWITCH_PROPS.join(", ")} are checked)`);
  need((R.CloudSwitchState || {}).Type === "AWS::SSM::Parameter" && same(P("CloudSwitchState"), { Name: STATE_NAME, Type: "String", Value: "never",
    Description: P("CloudSwitchState").Description }), "CloudSwitchState must be the String parameter " + STATE_NAME);
  const gf = (t.Globals || {}).Function || {};
  for (const k of ["Role", "FunctionUrlConfig", "Events", "Policies"]) need(!(k in gf), `Globals.Function sets ${k}`);
  for (const [name, r] of Object.entries(R)) {
    if (r.Type === "AWS::Lambda::Url" || (r.Properties || {}).FunctionUrlConfig) problems.push(`${name} gives a function a public URL`);
    if (r.Type === "AWS::Serverless::Function" && "Role" in (r.Properties || {})) problems.push(`${name} sets an explicit Role`);
  }
  need(same((f.Environment || {}).Variables, SWITCH_ENV), "CloudSwitchFn's environment is not exactly the three functions, Api, ON_CONCURRENCY = Globals and its topics");
  need(same(f.Policies, SWITCH_POLICY), "CloudSwitchFn's role must be exactly: concurrency of the three game functions, GET/PATCH on Api, publish to its notice topic");
  for (const [name, r] of Object.entries(R)) {
    if (r.Type === "AWS::Lambda::Permission" && !/\.amazonaws\.com$/.test(String((r.Properties || {}).Principal))) problems.push(`${name} lets ${(r.Properties || {}).Principal} invoke a function`);
  }
  need(same(((t.Outputs || {}).CloudSwitchAlarmTopicArn || {}).Value, ref("CloudSwitchAlarmTopic")), "the CloudSwitchAlarmTopicArn output (for the rehearsal) is missing");
  return problems;
}

// ---- the daily sign-up limit (TUN-88) ---------------------------------------------------------------
// The approved limit (owner, 2026-11-15): 100 new accounts a UTC day. Change it only with the arithmetic in
// reviews/TUN-88-daily-signup-limit.md redone, and backend/README.md § The daily sign-up limit updated.
const DAILY_SIGNUP_LIMIT = "100";
// Everything PreSignUpFn may set: no Role, no Events, no FunctionUrlConfig, no concurrency of its own.
const PRESIGNUP_PROPS = ["CodeUri", "Environment", "Handler", "Policies"];
const PRESIGNUP_ENV = { DAILY_SIGNUP_LIMIT, SIGNUP_COUNT_TABLE: ref("SignUpCountTable") };
const PRESIGNUP_POLICY = [{ Statement: [{ Effect: "Allow", Action: "dynamodb:UpdateItem", Resource: att("SignUpCountTable.Arn") }] }];
const COUNT_TABLE = {
  TableName: "music-garden-signup-count", BillingMode: "PAY_PER_REQUEST",
  AttributeDefinitions: [{ AttributeName: "day", AttributeType: "S" }], KeySchema: [{ AttributeName: "day", KeyType: "HASH" }],
  TimeToLiveSpecification: { AttributeName: "expiresAt", Enabled: "true" },
};
function signUpLimitProblems(t) {
  const problems = [], R = t.Resources || {};
  const P = (n) => (R[n] || {}).Properties || {};
  const need = (cond, msg) => { if (!cond) problems.push(msg); };
  const f = P("PreSignUpFn");
  need((R.PreSignUpFn || {}).Type === "AWS::Serverless::Function" && f.Handler === "presignup.handler" && f.CodeUri === "src/",
    "PreSignUpFn is not the sign-up trigger (presignup.handler)");
  need(same((f.Environment || {}).Variables, PRESIGNUP_ENV),
    `PreSignUpFn's environment must be exactly DAILY_SIGNUP_LIMIT "${DAILY_SIGNUP_LIMIT}" (the approved limit) and SIGNUP_COUNT_TABLE !Ref SignUpCountTable`);
  need(same(f.Policies, PRESIGNUP_POLICY), "PreSignUpFn's role must be exactly dynamodb:UpdateItem on SignUpCountTable");
  const extra = Object.keys(f).filter((k) => !PRESIGNUP_PROPS.includes(k));
  need(!extra.length, `PreSignUpFn sets ${extra.join(", ")} (only ${PRESIGNUP_PROPS.join(", ")} are checked)`);
  need((R.SignUpCountTable || {}).Type === "AWS::DynamoDB::Table" && same(P("SignUpCountTable"), COUNT_TABLE),
    "SignUpCountTable must be exactly the on-demand, day-keyed music-garden-signup-count table with TTL on expiresAt");
  need(same(P("UserPool").LambdaConfig, { PreSignUp: att("PreSignUpFn.Arn") }), "UserPool's sign-up trigger must be exactly PreSignUpFn");
  need((R.PreSignUpPermission || {}).Type === "AWS::Lambda::Permission" && same(P("PreSignUpPermission"),
    { Action: "lambda:InvokeFunction", FunctionName: ref("PreSignUpFn"), Principal: "cognito-idp.amazonaws.com", SourceArn: att("UserPool.Arn") }),
    "PreSignUpPermission must let exactly this user pool invoke PreSignUpFn");
  // The trigger gives up on the counter at 2.5 s (DEADLINE_MS) and Cognito at 5 s: a Lambda timeout under 3 s
  // would kill it before it could refuse calmly. PreSignUpFn sets no Timeout of its own (PRESIGNUP_PROPS).
  const timeout = num(((t.Globals || {}).Function || {}).Timeout);
  need(timeout >= 3, `PreSignUpFn's timeout (Globals) is ${timeout} s; it must be at least 3, above the counter's 2.5 s deadline`);
  // It holds only the day's count and is deleted with the stack: no Retain, no deletion protection.
  const lifecycle = Object.keys(R.SignUpCountTable || {}).filter((k) => k !== "Type" && k !== "Properties");
  need(!lifecycle.length, `SignUpCountTable sets ${lifecycle.join(", ")}; it is meant to be deleted with the stack`);
  return problems;
}

// TUN-93: accounts hold nothing personal. No self-service recovery (there is no email to recover with), and the
// browser client may read and write one attribute that holds no typed text: left out, the lists would mean every
// standard attribute, so a signed-in page could add an email or a name after sign-up. And the properties Cognito
// fixes when a pool or client is made stay exactly as they are: changing one fails, or needs a new, empty pool
// (every account lost to the game) or a new client (a new client id, and every page broken).
const POOL_FIXED = { UserPoolName: "music-garden-users", UsernameConfiguration: { CaseSensitive: "false" } };
const POOL_UNSET = ["UsernameAttributes", "AliasAttributes", "Schema", "AutoVerifiedAttributes", "EmailConfiguration",
  "SmsConfiguration", "VerificationMessageTemplate", "UserAttributeUpdateSettings"];
function accountProblems(t) {
  const problems = [], R = t.Resources || {};
  const P = (n) => (R[n] || {}).Properties || {};
  const need = (cond, msg) => { if (!cond) problems.push(msg); };
  const pool = P("UserPool"), client = P("UserPoolClient");
  need(same(pool.AccountRecoverySetting, { RecoveryMechanisms: [{ Name: "admin_only", Priority: "1" }] }),
    "UserPool's recovery must be exactly admin_only: accounts have no email or phone");
  for (const [k, v] of Object.entries(POOL_FIXED)) need(same(pool[k], v), `UserPool's ${k} must stay ${JSON.stringify(v)} (fixed when the pool was made)`);
  for (const k of POOL_UNSET) need(!(k in pool), `UserPool sets ${k}: an account holds nothing personal, and some of these are fixed when the pool is made`);
  need((R.UserPoolClient || {}).Type === "AWS::Cognito::UserPoolClient", "UserPoolClient is missing");
  need(same(client.UserPoolId, ref("UserPool")) && client.GenerateSecret === "false",
    "UserPoolClient's UserPoolId and GenerateSecret must stay as they are (a change makes a new client)");
  need(same(client.ReadAttributes, ["updated_at"]) && same(client.WriteAttributes, ["updated_at"]),
    "UserPoolClient must read and write exactly [updated_at]: left out, every standard attribute is writable");
  return problems;
}

// ---- the checks -------------------------------------------------------------------------------------
const num =(v) => (v === null || v === undefined || v === "" ? NaN : Number(v));
const fmt = ([r, b]) => `${r}/s burst ${b}`;

export function templateProblems(template, samconfig) {
  const problems = [];
  let t;
  try { t = parseYaml(template); } catch (e) { return [`template does not parse: ${e.message}`]; }
  const R = t.Resources || {};
  const res = (name) => R[name] || {};
  const props = (name) => res(name).Properties || {};

  // Every API route is an HttpApi event on a function, on Api, with exactly the approved throttle.
  const found = {};
  for (const [name, r] of Object.entries(R)) {
    if (r.Type === "AWS::Serverless::HttpApi" && name !== "Api") problems.push(`a second HTTP API, ${name}: its routes are not throttled here`);
    if (/^AWS::ApiGatewayV2::(Route|Api)$/.test(r.Type)) problems.push(`${name} is an ${r.Type} outside the throttled Api`);
    if (r.Type !== "AWS::Serverless::Function") continue;
    for (const [ev, e] of Object.entries((r.Properties || {}).Events || {})) {
      if (e.Type !== "HttpApi") continue;
      const p = e.Properties || {};
      const id = `${String(p.Method || "ANY").toUpperCase()} ${p.Path || "(no path)"}`;
      if (!isRef(p.ApiId, "Api")) problems.push(`route ${id} (${name}.${ev}) is not on Api`);
      const rs = p.RouteSettings || {};
      found[id] = [num(rs.ThrottlingRateLimit), num(rs.ThrottlingBurstLimit)];
    }
  }
  for (const [id, want] of Object.entries(ROUTES)) {
    if (!found[id]) problems.push(`route ${id} is missing`);
    else if (found[id].join() !== want.join()) problems.push(`route ${id} throttle is ${fmt(found[id])}, approved ${fmt(want)}`);
  }
  for (const id of Object.keys(found)) if (!ROUTES[id]) problems.push(`route ${id} is not an approved route (add it to the arithmetic first)`);
  const d = props("Api").DefaultRouteSettings || {};
  const def = [num(d.ThrottlingRateLimit), num(d.ThrottlingBurstLimit)];
  if (def.join() !== DEFAULT_ROUTE.join()) problems.push(`default route throttle is ${fmt(def)}, approved ${fmt(DEFAULT_ROUTE)}`);

  // CORS: exactly the approved browser origins, in any order — compared entry by entry, so one entry holding
  // "a,b" is not mistaken for the two origins a and b (PR review, round 1).
  const ao = (props("Api").CorsConfiguration || {}).AllowOrigins;
  const origins = Array.isArray(ao) ? ao.map((o) => (typeof o === "string" ? o : JSON.stringify(o))).sort() : [];
  if (JSON.stringify(origins) !== JSON.stringify([...ORIGINS].sort())) problems.push(`CORS origins are [${origins.join(", ")}], approved [${ORIGINS.join(", ")}]`);

  // Reserved concurrency: the Globals value, and no function overriding it (0 would switch one off).
  const g = num(((t.Globals || {}).Function || {}).ReservedConcurrentExecutions);
  if (g !== RESERVED_CONCURRENCY) problems.push(`Globals reserved concurrency is ${g}, approved ${RESERVED_CONCURRENCY}`);
  for (const [name, r] of Object.entries(R)) {
    if (r.Type !== "AWS::Serverless::Function") continue;
    const own = (r.Properties || {}).ReservedConcurrentExecutions;
    const allowed = name === "CloudSwitchFn" ? SWITCH_CONCURRENCY : RESERVED_CONCURRENCY;   // TUN-87: one command at a time
    if (own !== undefined && num(own) !== allowed) problems.push(`${name} overrides reserved concurrency with ${own}`);
  }

  // Data protection, at the resource's own attributes and properties.
  for (const name of ["UserPool", "ProgressTable", "SongsTable"]) {
    if (!R[name]) { problems.push(`${name} is missing`); continue; }
    if (res(name).DeletionPolicy !== "Retain") problems.push(`${name} lacks DeletionPolicy: Retain`);
    if (res(name).UpdateReplacePolicy !== "Retain") problems.push(`${name} lacks UpdateReplacePolicy: Retain`);
  }
  if (props("UserPool").DeletionProtection !== "ACTIVE") problems.push("UserPool lacks DeletionProtection: ACTIVE");
  for (const name of ["ProgressTable", "SongsTable"]) {
    if (props(name).DeletionProtectionEnabled !== "true") problems.push(`${name} lacks DeletionProtectionEnabled`);
    if ((props(name).PointInTimeRecoverySpecification || {}).PointInTimeRecoveryEnabled !== "true") problems.push(`${name} lacks point-in-time recovery`);
  }

  // Budget: $30 a month, whole account, the four alerts, every one to BudgetEmail, no fixed name.
  const budgets = Object.entries(R).filter(([, r]) => r.Type === "AWS::Budgets::Budget");
  if (budgets.length !== 1 || budgets[0][0] !== "MonthlyBudget") problems.push("expected exactly one budget, MonthlyBudget");
  const bp = props("MonthlyBudget"), b = bp.Budget || {};
  const lim = b.BudgetLimit || {};
  if (b.BudgetType !== "COST" || b.TimeUnit !== "MONTHLY" || num(lim.Amount) !== 30 || lim.Unit !== "USD") problems.push("the budget is not a $30 monthly cost budget");
  if ("BudgetName" in b) problems.push("the budget has a fixed BudgetName (a new address replaces it, and the name would collide)");
  if ("CostFilters" in b || "FilterExpression" in b) problems.push("the budget is filtered; it must cover the whole account");
  const notes = Array.isArray(bp.NotificationsWithSubscribers) ? bp.NotificationsWithSubscribers : [];
  const alerts = notes.map((n) => {
    const x = n.Notification || {};
    const ok = x.ComparisonOperator === "GREATER_THAN" && x.ThresholdType === "PERCENTAGE";
    return ok ? `${x.NotificationType} ${num(x.Threshold)}` : "malformed";
  }).sort();
  if (alerts.join() !== ALERTS.join()) problems.push(`budget alerts are [${alerts.join(", ")}], approved [${ALERTS.join(", ")}]`);
  for (const n of notes) {
    const subs = Array.isArray(n.Subscribers) ? n.Subscribers : [];
    if (!subs.length || subs[0].SubscriptionType !== "EMAIL" || !isRef(subs[0].Address, "BudgetEmail")) {
      problems.push("every budget alert must email exactly !Ref BudgetEmail");
      break;
    }
  }
  // TUN-87: the ACTUAL 100 alert also reaches the cost switch; no other alert does, and nothing else is told.
  for (const n of notes) {
    const x = n.Notification || {}, subs = Array.isArray(n.Subscribers) ? n.Subscribers : [];
    const trip = x.NotificationType === "ACTUAL" && num(x.Threshold) === 100;
    const rest = subs.slice(1);
    const ok = trip ? rest.length === 1 && rest[0].SubscriptionType === "SNS" && isRef(rest[0].Address, "CloudSwitchAlarmTopic")
      : rest.length === 0;
    if (!ok) problems.push(trip ? "the ACTUAL 100 alert must also go to exactly !Ref CloudSwitchAlarmTopic (the cost switch)"
      : `the ${x.NotificationType} ${x.Threshold} alert has subscribers besides BudgetEmail`);
  }
  problems.push(...switchProblems(t));
  problems.push(...signUpLimitProblems(t));
  problems.push(...accountProblems(t));
  const pe =(t.Parameters || {}).BudgetEmail;
  if (!pe) problems.push("the BudgetEmail parameter is missing");
  else {
    if (pe.NoEcho !== "true") problems.push("BudgetEmail is not NoEcho");
    if ("Default" in pe) problems.push("BudgetEmail has a Default (the address would be committed)");
  }

  // No real address anywhere in the backend config — comments included: the repository is public.
  for (const [file, text] of [["template.yaml", template], ["samconfig.toml", samconfig]]) {
    for (const m of text.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) {
      if (!ALLOWED_EMAIL.test(m[0])) problems.push(`${file} contains an email address: ${m[0]}`);
    }
  }
  if (/^\s*parameter_overrides\b/m.test(samconfig)) problems.push("samconfig.toml has parameter_overrides (it is public; pass BudgetEmail on the command line)");
  return problems;
}

test("backend/template.yaml keeps the approved throttles, reserved concurrency, budget, data protection and CORS origins; no address is committed", () => {
  assert.deepEqual(templateProblems(TEMPLATE, SAMCONFIG), []);
});

// Formatting that changes nothing must not change the verdict: a quoted or commented Type, reordered event
// properties, and the block form of a reference (`Ref: BudgetEmail`, the same as `!Ref BudgetEmail`).
test("the template check is not fooled by harmless formatting", () => {
  const variants = [
    TEMPLATE.replace(/Type: HttpApi\n/g, 'Type: "HttpApi"\n'),
    TEMPLATE.replace(/Type: HttpApi\n/g, "Type: HttpApi   # a route\n"),
    TEMPLATE.replace(/(            ApiId: !Ref Api\n)(            Path: \/progress\n            Method: GET\n)/, "$2$1"),
    TEMPLATE.replace(/^( *)Address: !Ref BudgetEmail$/gm, "$1Address:\n$1  Ref: BudgetEmail"),
    TEMPLATE.replace(ORIGIN_LINES, "          - 'https://www.tunegarden.game'\n          - \"https://tunegarden.game\"\n"),
  ];
  for (const v of variants) {
    assert.notEqual(v, TEMPLATE);
    assert.deepEqual(templateProblems(v, SAMCONFIG), []);
  }
});

// The checker's own mutations, kept as tests so the guard cannot quietly go blind: each variant is the real
// template or config with one mistake, and must draw THE diagnostic for that mistake.
const NEW_ROUTE = `        Extra:
          Type: HttpApi   # new route
          Properties:
            ApiId: !Ref Api
            Path: /songs/extra
            Method: GET
`;
test("the template check refuses each mistake it guards against, with the right diagnostic", () => {
  const cases = [
    // Round 3: YAML this parser doesn't read must not hide a route — it is read correctly or refused.
    ["an inline-map route", TEMPLATE.replace("        ListMine:\n", "        Extra: {Type: HttpApi, Properties: {ApiId: !Ref Api, Path: /extra, Method: GET}}\n        ListMine:\n"), /template does not parse: unsupported YAML syntax/],
    ["an escaped Type", TEMPLATE.replace("        ListMine:\n", NEW_ROUTE.replace("Type: HttpApi   # new route", 'Type: "Http\\u0041pi"') + "        ListMine:\n"), /route GET \/songs\/extra is not an approved route/],
    ["a quoted, literal budget address", TEMPLATE.replace(/Address: !Ref BudgetEmail/g, 'Address: "!Ref BudgetEmail"'), /every budget alert must email exactly !Ref BudgetEmail/],
    ["a high function concurrency", TEMPLATE.replace("      Handler: progress.handler\n", "      Handler: progress.handler\n      ReservedConcurrentExecutions: 500\n"), /ProgressFn overrides reserved concurrency with 500/],
    ["a default throttle with no burst", TEMPLATE.replace(/(DefaultRouteSettings:\n\s*ThrottlingRateLimit: 0\.25\n)\s*ThrottlingBurstLimit: 2\n/, "$1"), /default route throttle is 0\.25\/s burst NaN/],
    ["a route without its throttle", TEMPLATE.replace(/(Method: PUT)\n\s*RouteSettings:[^\n]*\n\s*ThrottlingRateLimit: 2\n\s*ThrottlingBurstLimit: 10\n/, "$1\n"), /route PUT \/progress throttle is NaN\/s burst NaN/],
    ["a raised route rate", TEMPLATE.replace("ThrottlingRateLimit: 2\n", "ThrottlingRateLimit: 20\n"), /route PUT \/progress throttle is 20\/s/],
    ["an oversized burst", TEMPLATE.replace("ThrottlingBurstLimit: 10\n", "ThrottlingBurstLimit: 5000\n"), /route PUT \/progress throttle is 2\/s burst 5000/],
    ["an unthrottled new route", TEMPLATE.replace("        ListMine:\n", NEW_ROUTE + "        ListMine:\n"), /route GET \/songs\/extra is not an approved route/],
    ["a route on another API", TEMPLATE.replace("            ApiId: !Ref Api\n            Path: /songs\n            Method: POST", "            ApiId: !Ref Other\n            Path: /songs\n            Method: POST"), /route POST \/songs \(SongsFn\.Create\) is not on Api/],
    ["no default throttle", TEMPLATE.replace(/      DefaultRouteSettings:\n[^\n]*\n[^\n]*\n/, ""), /default route throttle is NaN/],
    ["a zero default burst", TEMPLATE.replace(/(DefaultRouteSettings:\n\s*ThrottlingRateLimit: 0\.25\n\s*)ThrottlingBurstLimit: 2/, "$1ThrottlingBurstLimit: 0"), /default route throttle is 0\.25\/s burst 0/],
    ["reserved concurrency 0", TEMPLATE.replace("ReservedConcurrentExecutions: 2", "ReservedConcurrentExecutions: 0"), /Globals reserved concurrency is 0/],
    ["a function switched off", TEMPLATE.replace("      Handler: songs.handler\n", "      Handler: songs.handler\n      ReservedConcurrentExecutions: 0\n"), /SongsFn overrides reserved concurrency with 0/],
    ["Retain moved under Metadata", TEMPLATE.replace(/(SongsTable:\n\s*Type: AWS::DynamoDB::Table\n)\s*DeletionPolicy: Retain\n\s*UpdateReplacePolicy: Retain\n/, "$1    Metadata:\n      DeletionPolicy: Retain\n      UpdateReplacePolicy: Retain\n"), /SongsTable lacks DeletionPolicy: Retain/],
    ["a pool replaced without Retain", TEMPLATE.replace(/(UserPool:\n\s*Type: AWS::Cognito::UserPool\n\s*DeletionPolicy: Retain\n)\s*UpdateReplacePolicy: Retain\n/, "$1"), /UserPool lacks UpdateReplacePolicy: Retain/],
    ["pool deletion protection off", TEMPLATE.replace("DeletionProtection: ACTIVE", "DeletionProtection: INACTIVE"), /UserPool lacks DeletionProtection: ACTIVE/],
    ["no point-in-time recovery", TEMPLATE.replace("PointInTimeRecoveryEnabled: true", "PointInTimeRecoveryEnabled: false"), /ProgressTable lacks point-in-time recovery/],
    ["a fixed budget name", TEMPLATE.replace("        BudgetType: COST", "        BudgetName: tune-garden\n        BudgetType: COST"), /fixed BudgetName/],
    ["a dropped alert", TEMPLATE.replace("Threshold: 80", "Threshold: 90"), /budget alerts are \[ACTUAL 100, ACTUAL 50, ACTUAL 90/],
    ["alerts moved under Metadata", TEMPLATE.replace("      NotificationsWithSubscribers:\n", "    Metadata:\n      NotificationsWithSubscribers:\n"), /budget alerts are \[\]/],
    ["an alert to someone else", TEMPLATE.replace("Address: !Ref BudgetEmail", "Address: !Ref OtherEmail"), /every budget alert must email exactly !Ref BudgetEmail/],
    ["a default address", TEMPLATE.replace("    NoEcho: true\n", "    NoEcho: true\n    Default: '!Ref Nothing'\n"), /BudgetEmail has a Default/],
    // TUN-76: the browser origins are exactly the production site's.
    ["the retired origin back", TEMPLATE.replace(ORIGIN_LINES, ORIGIN_LINES + "          - https://music-garden.netlify.app\n"), /CORS origins are \[.*https:\/\/music-garden\.netlify\.app.*\], approved/],
    ["a preview origin", TEMPLATE.replace(ORIGIN_LINES, ORIGIN_LINES + "          - https://ao-x-root.music-garden.pages.dev\n"), /CORS origins are \[.*ao-x-root\.music-garden\.pages\.dev.*\], approved/],
    ["any origin", TEMPLATE.replace(ORIGIN_LINES, "          - '*'\n"), /CORS origins are \[\*\], approved/],
    ["both origins in one entry", TEMPLATE.replace(ORIGIN_LINES, "          - https://tunegarden.game,https://www.tunegarden.game\n"), /CORS origins are \[https:\/\/tunegarden\.game,https:\/\/www\.tunegarden\.game\], approved/],
    ["a production origin dropped",TEMPLATE.replace("          - https://www.tunegarden.game\n", ""), /CORS origins are \[https:\/\/tunegarden\.game\], approved/],
    ["origins moved under Metadata", TEMPLATE.replace("      CorsConfiguration:\n", "    Metadata:\n      CorsConfiguration:\n"), /CORS origins are \[\], approved/],
    // TUN-87: the cost switch.
    ["the trip alert not reaching the switch", TEMPLATE.replace(/            - SubscriptionType: SNS[^\n]*\n              Address: !Ref CloudSwitchAlarmTopic\n/, ""), /the ACTUAL 100 alert must also go to exactly !Ref CloudSwitchAlarmTopic/],
    ["a quoted, literal switch topic", TEMPLATE.replace("Address: !Ref CloudSwitchAlarmTopic", 'Address: "!Ref CloudSwitchAlarmTopic"'), /the ACTUAL 100 alert must also go to exactly !Ref CloudSwitchAlarmTopic/],
    ["the switch on the 80 % alert", TEMPLATE.replace(/(Threshold: 80\n[^\n]*\n[^\n]*\n[^\n]*\n[^\n]*BudgetEmail\n)/, "$1            - SubscriptionType: SNS\n              Address: !Ref CloudSwitchAlarmTopic\n"), /the ACTUAL 80 alert has subscribers besides BudgetEmail/],
    ["the budget not waiting for the switch", TEMPLATE.replace("      - CloudSwitchAlarmPermission\n", ""), /MonthlyBudget must DependsOn/],
    ["an encrypted alarm topic", TEMPLATE.replace("      DisplayName: Tune Garden cost switch\n", "      DisplayName: Tune Garden cost switch\n      KmsMasterKeyId: alias/aws/sns\n"), /CloudSwitchAlarmTopic is encrypted/],
    ["anyone may publish", TEMPLATE.replace("              Service: budgets.amazonaws.com", "              AWS: '*'"), /CloudSwitchAlarmTopicPolicy must let only Budgets/],
    ["no source-account condition", TEMPLATE.replace(/              StringEquals:\n[^\n]*\n/, ""), /CloudSwitchAlarmTopicPolicy must let only Budgets/],
    ["any topic may invoke the switch", TEMPLATE.replace("      Principal: sns.amazonaws.com\n      SourceArn: !Ref CloudSwitchAlarmTopic\n", "      Principal: sns.amazonaws.com\n"), /CloudSwitchAlarmPermission must let only the alarm topic/],
    ["a public invoke", TEMPLATE.replace("      Principal: sns.amazonaws.com\n", "      Principal: '*'\n"), /CloudSwitchAlarmPermission lets \* invoke a function/],
    ["the switch subscribed to the wrong topic", TEMPLATE.replace("      TopicArn: !Ref CloudSwitchAlarmTopic\n", "      TopicArn: !Ref CloudSwitchNoticeTopic\n"), /CloudSwitchAlarmSubscription must deliver/],
    ["the email to someone else", TEMPLATE.replace("          Endpoint: !Ref BudgetEmail\n", "          Endpoint: !Ref OtherEmail\n"), /CloudSwitchNoticeTopic must email exactly !Ref BudgetEmail/],
    ["a wildcard function resource", TEMPLATE.replace("                - !GetAtt PreSignUpFn.Arn\n", "                - '*'\n"), /CloudSwitchFn's role must be exactly/],
    ["the switch able to change itself", TEMPLATE.replace("                - !GetAtt PreSignUpFn.Arn\n", "                - !GetAtt PreSignUpFn.Arn\n                - !GetAtt CloudSwitchFn.Arn\n"), /CloudSwitchFn's role must be exactly/],
    ["a broader API action", TEMPLATE.replace("                - apigateway:PATCH\n", "                - apigateway:PATCH\n                - apigateway:DELETE\n"), /CloudSwitchFn's role must be exactly/],
    ["every API in the account", TEMPLATE.replace("::/apis/${Api}\"", "::/apis/*\""), /CloudSwitchFn's role must be exactly/],
    ["a Cognito permission", TEMPLATE.replace("              Action: sns:Publish\n", "              Action:\n                - sns:Publish\n                - cognito-idp:UpdateUserPool\n"), /CloudSwitchFn's role must be exactly/],
    ["switching on to a different concurrency", TEMPLATE.replace('ON_CONCURRENCY: "2"', 'ON_CONCURRENCY: "5"'), /ON_CONCURRENCY = Globals/],
    ["a switch target on the wrong function", TEMPLATE.replace("          SONGS_FN: !Ref SongsFn\n", "          SONGS_FN: !Ref ProgressFn\n"), /CloudSwitchFn's environment is not exactly/],
    ["two switches at once", TEMPLATE.replace("      ReservedConcurrentExecutions: 1 ", "      ReservedConcurrentExecutions: 2 "), /CloudSwitchFn reserved concurrency is 2, approved 1/],
    ["a short switch timeout", TEMPLATE.replace("      Timeout: 60 ", "      Timeout: 10 "), /CloudSwitchFn timeout is 10, approved 60/],
    ["a shorter event age", TEMPLATE.replace("MaximumEventAgeInSeconds: 21600", "MaximumEventAgeInSeconds: 3600"), /EventInvokeConfig must be exactly/],
    ["no retries", TEMPLATE.replace("MaximumRetryAttempts: 2", "MaximumRetryAttempts: 0"), /EventInvokeConfig must be exactly/],
    ["an explicit role", TEMPLATE.replace("      Handler: cloud-switch.handler\n", "      Handler: cloud-switch.handler\n      Role: arn:aws:iam::123456789012:role/admin\n"), /CloudSwitchFn sets an explicit Role/],
    ["a public function URL", TEMPLATE.replace("      Handler: cloud-switch.handler\n", "      Handler: cloud-switch.handler\n      FunctionUrlConfig:\n        AuthType: NONE\n"), /CloudSwitchFn gives a function a public URL/],
    ["a public URL on a game function", TEMPLATE.replace("      Handler: songs.handler\n", "      Handler: songs.handler\n      FunctionUrlConfig:\n        AuthType: NONE\n"), /SongsFn gives a function a public URL/],
    ["a role from Globals", TEMPLATE.replace("    ReservedConcurrentExecutions: 2\n", "    ReservedConcurrentExecutions: 2\n    Role: arn:aws:iam::123456789012:role/admin\n"), /Globals\.Function sets Role/],
    ["the state parameter elsewhere", TEMPLATE.replace("parameter/music-garden/cloud-switch/on-at", "parameter/*"), /CloudSwitchFn's role must be exactly/],
    ["no switch-on state", TEMPLATE.replace("          STATE_PARAM: !Ref CloudSwitchState\n", ""), /CloudSwitchFn's environment is not exactly/],
    ["a renamed state parameter", TEMPLATE.replace("      Name: /music-garden/cloud-switch/on-at", "      Name: /other"), /CloudSwitchState must be the String parameter/],
    ["a second trigger", TEMPLATE.replace("      Handler: cloud-switch.handler\n", "      Handler: cloud-switch.handler\n      Events:\n        Daily:\n          Type: Schedule\n          Properties:\n            Schedule: rate(1 day)\n"), /CloudSwitchFn has Events/],
    ["no rehearsal output", TEMPLATE.replace(/  CloudSwitchAlarmTopicArn:\n[^\n]*\n[^\n]*\n/, ""), /CloudSwitchAlarmTopicArn output/],
    // TUN-88: the daily sign-up limit
    ["a different daily limit", TEMPLATE.replace('DAILY_SIGNUP_LIMIT: "100"', 'DAILY_SIGNUP_LIMIT: "500"'), /PreSignUpFn's environment must be exactly DAILY_SIGNUP_LIMIT "100"/],
    ["no daily limit", TEMPLATE.replace('          DAILY_SIGNUP_LIMIT: "100"\n', ""), /PreSignUpFn's environment must be exactly/],
    ["a counter in a players' table", TEMPLATE.replace("          SIGNUP_COUNT_TABLE: !Ref SignUpCountTable\n", "          SIGNUP_COUNT_TABLE: !Ref ProgressTable\n"), /PreSignUpFn's environment must be exactly/],
    ["the counter able to read", TEMPLATE.replace("              Action: dynamodb:UpdateItem\n", "              Action:\n                - dynamodb:UpdateItem\n                - dynamodb:Scan\n"), /PreSignUpFn's role must be exactly/],
    ["the counter writing every table", TEMPLATE.replace("              Resource: !GetAtt SignUpCountTable.Arn\n", "              Resource: '*'\n"), /PreSignUpFn's role must be exactly/],
    ["no counter permission", TEMPLATE.replace(/      Policies:\n        - Statement:\n            - Effect: Allow\n              Action: dynamodb:UpdateItem\n[^\n]*\n/, ""), /PreSignUpFn's role must be exactly/],
    ["a second trigger on the sign-up function", TEMPLATE.replace("      Handler: presignup.handler\n", "      Handler: presignup.handler\n      Events:\n        Daily:\n          Type: Schedule\n          Properties:\n            Schedule: rate(1 day)\n"), /PreSignUpFn sets Events/],
    ["no expiry on the count", TEMPLATE.replace("        Enabled: true\n", "        Enabled: false\n"), /SignUpCountTable must be exactly/],
    ["a provisioned counter table", TEMPLATE.replace("      TableName: music-garden-signup-count\n      BillingMode: PAY_PER_REQUEST\n", "      TableName: music-garden-signup-count\n      BillingMode: PROVISIONED\n"), /SignUpCountTable must be exactly/],
    ["the trigger pointed elsewhere", TEMPLATE.replace("        PreSignUp: !GetAtt PreSignUpFn.Arn\n", "        PreSignUp: !GetAtt SongsFn.Arn\n"), /UserPool's sign-up trigger must be exactly PreSignUpFn/],
    ["no invoke permission for the pool", TEMPLATE.replace(/  PreSignUpPermission:\n(?:    .*\n|      .*\n)+/, ""), /PreSignUpPermission must let exactly this user pool invoke PreSignUpFn/],
    ["the pool's permission on another function", TEMPLATE.replace("      FunctionName: !Ref PreSignUpFn\n", "      FunctionName: !Ref SongsFn\n"), /PreSignUpPermission must let exactly/],
    ["a timeout under the counter's deadline", TEMPLATE.replace("    Timeout: 10\n", "    Timeout: 2\n"), /PreSignUpFn's timeout \(Globals\) is 2 s/],
    // TUN-93: nothing personal in an account
    ["email recovery back", TEMPLATE.replace("          - Name: admin_only\n", "          - Name: verified_email\n"), /recovery must be exactly admin_only/],
    ["a second recovery", TEMPLATE.replace("          - Name: admin_only\n            Priority: 1\n", "          - Name: admin_only\n            Priority: 1\n          - Name: verified_email\n            Priority: 2\n"), /recovery must be exactly admin_only/],
    ["the client able to write every attribute", TEMPLATE.replace("      WriteAttributes:\n        - updated_at\n", ""), /read and write exactly \[updated_at\]/],
    ["the client able to write an email", TEMPLATE.replace("      WriteAttributes:\n        - updated_at\n", "      WriteAttributes:\n        - updated_at\n        - email\n"), /read and write exactly \[updated_at\]/],
    ["the client able to read every attribute", TEMPLATE.replace("      ReadAttributes:\n        - updated_at\n", ""), /read and write exactly \[updated_at\]/],
    ["a case-sensitive pool", TEMPLATE.replace("        CaseSensitive: false\n", "        CaseSensitive: true\n"), /UsernameConfiguration must stay/],
    ["a renamed pool", TEMPLATE.replace("      UserPoolName: music-garden-users\n", "      UserPoolName: music-garden-users-2\n"), /UserPoolName must stay/],
    ["email as the username", TEMPLATE.replace("      DeletionProtection: ACTIVE\n", "      DeletionProtection: ACTIVE\n      UsernameAttributes:\n        - email\n"), /UserPool sets UsernameAttributes/],
    ["an email verified automatically", TEMPLATE.replace("      DeletionProtection: ACTIVE\n", "      DeletionProtection: ACTIVE\n      AutoVerifiedAttributes:\n        - email\n"), /UserPool sets AutoVerifiedAttributes/],
    ["a schema attribute", TEMPLATE.replace("      DeletionProtection: ACTIVE\n", "      DeletionProtection: ACTIVE\n      Schema:\n        - Name: nickname\n          Required: true\n"), /UserPool sets Schema/],
    ["a client with a secret", TEMPLATE.replace("      GenerateSecret: false\n", "      GenerateSecret: true\n"), /UserPoolId and GenerateSecret must stay/],
    ["a kept counter table", TEMPLATE.replace("  SignUpCountTable:\n    Type: AWS::DynamoDB::Table\n", "  SignUpCountTable:\n    Type: AWS::DynamoDB::Table\n    DeletionPolicy: Retain\n"), /SignUpCountTable sets DeletionPolicy/],
  ];
  for (const [what, mutated, expect] of cases) {
    assert.notEqual(mutated, TEMPLATE, `the "${what}" mutation must change the template`);
    const problems = templateProblems(mutated, SAMCONFIG);
    assert.ok(problems.some((p) => expect.test(p)), `"${what}" should be refused with ${expect}; got ${JSON.stringify(problems)}`);
  }
});

// The address guard on its own: each of these is otherwise-valid configuration, so ONLY the email scan can
// refuse it — disabling that scan makes this test fail.
test("an email address anywhere in the backend config is refused, comments included", () => {
  const cases = [
    ["template comment", TEMPLATE + "# Budget contact: owner@example.org\n", SAMCONFIG, /template\.yaml contains an email address: owner@example\.org/],
    ["template description", TEMPLATE.replace("Description: Where AWS Budgets emails the monthly cost alerts.", "Description: Alerts go to owner@example.org."), SAMCONFIG, /template\.yaml contains an email address: owner@example\.org/],
    ["samconfig comment", TEMPLATE, SAMCONFIG + "# owner@example.org\n", /samconfig\.toml contains an email address: owner@example\.org/],
  ];
  for (const [what, tpl, cfg, expect] of cases) {
    const problems = templateProblems(tpl, cfg);
    assert.deepEqual(problems.filter((p) => !expect.test(p)), [], `"${what}" should draw only the address diagnostic`);
    assert.ok(problems.some((p) => expect.test(p)), `"${what}" should be refused; got ${JSON.stringify(problems)}`);
  }
  assert.ok(templateProblems(TEMPLATE, SAMCONFIG + '\nparameter_overrides = "X=1"\n').some((p) => /parameter_overrides/.test(p)));
});

// TUN-87: the runbook's payload files ask for exactly what they are named.
test("the cost switch's payload files match the runbook", () => {
  for (const action of ["on", "off", "status"]) {
    const text = readFileSync(join(ROOT, "backend", "events", `switch-${action}.json`), "utf8");
    assert.deepEqual(JSON.parse(text), { switch: action }, `switch-${action}.json`);
  }
});
