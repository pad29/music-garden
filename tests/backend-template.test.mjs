// backend/template.yaml must keep TUN-82's cost limits and data protection, and the repository must never
// hold the budget's email address.
//
// Why a test: the backend has no deploy preview and the worker that edits the template has no AWS
// credentials, so a dropped throttle, a lost Retain or a committed address would first show up in
// production — or on a public repository. Later backend tickets (TUN-76, TUN-83, TUN-87, TUN-88) all edit
// this template. This is a static check of the text, not a CloudFormation validation: the owner's deploy
// runs `sam validate --lint` and reads the change set (backend/README.md § Future deploys).
//
// The parser is deliberately tiny: it reads blocks by indentation, which is all this template needs. No
// YAML library is installed, and tests here run with nothing to install.
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./helpers/game-scripts.mjs";

const TEMPLATE = readFileSync(join(ROOT, "backend", "template.yaml"), "utf8").replace(/\r/g, "");
const SAMCONFIG = readFileSync(join(ROOT, "backend", "samconfig.toml"), "utf8").replace(/\r/g, "");

// The nominal steady-state rate of the whole API, in requests/second: the sum of the route limits the owner
// chose (TUN-82, 2026-11-13). Change it only with the arithmetic in reviews/TUN-82-*.md redone.
const API_RATE = 5;
const ROUTES = 7;

const lines = (text) => text.replace(/\r/g, "").split("\n");
const indentOf = (line) => line.length - line.trimStart().length;

// The lines under `key:` at exactly `indent` spaces (the first match after `from`), up to the next line at
// that indent or less. Comments and blank lines are kept; callers match on content.
function block(text, key, indent, from = 0) {
  const ls = lines(text);
  const pad = " ".repeat(indent);
  for (let i = from; i < ls.length; i++) {
    if (ls[i].startsWith(pad + key + ":") && indentOf(ls[i]) === indent) {
      const out = [ls[i]];
      for (let j = i + 1; j < ls.length; j++) {
        const l = ls[j];
        if (l.trim() !== "" && !l.trimStart().startsWith("#") && indentOf(l) <= indent) break;
        out.push(l);
      }
      return out.join("\n");
    }
  }
  return null;
}
const value = (blk, key) => {
  const m = blk && blk.match(new RegExp("^\\s*" + key + ":\\s*([^#\\n]*?)\\s*(?:#.*)?$", "m"));
  return m ? m[1] : null;
};
const code = (blk) => blk.split("\n").filter((l) => !l.trimStart().startsWith("#")).join("\n");

export function templateProblems(template, samconfig) {
  const problems = [];
  const resources = block(template, "Resources", 0);
  if (!resources) return ["no Resources section"];
  const resource = (name) => block(resources, name, 2);

  // Throttles: every HttpApi event carries its own RouteSettings; the rates add up to API_RATE.
  let rateSum = 0, routes = 0;
  const ls = lines(resources);
  ls.forEach((l, i) => {
    if (!/^\s*Type:\s*HttpApi\s*$/.test(l)) return;
    routes++;
    const ev = block(resources, lines(resources)[i - 1].trim().replace(/:$/, ""), indentOf(ls[i - 1]), i - 1);
    const rs = ev && block(ev, "RouteSettings", indentOf(ls[i]) + 2);
    const rate = Number(value(rs, "ThrottlingRateLimit"));
    const burst = Number(value(rs, "ThrottlingBurstLimit"));
    const name = ev ? ev.split("\n")[0].trim() : `line ${i}`;
    if (!rs) problems.push(`route ${name} has no RouteSettings`);
    else if (!(rate > 0) || !(burst >= 1) || !Number.isInteger(burst)) problems.push(`route ${name} has no positive rate and burst`);
    else rateSum += rate;
  });
  if (routes !== ROUTES) problems.push(`expected ${ROUTES} HttpApi routes, found ${routes}`);
  if (Math.abs(rateSum - API_RATE) > 1e-9) problems.push(`route rates sum to ${rateSum}/s, not ${API_RATE}/s`);
  const def = block(resource("Api") || "", "DefaultRouteSettings", 6);
  if (!(Number(value(def, "ThrottlingRateLimit")) > 0)) problems.push("Api has no DefaultRouteSettings throttle");

  // Reserved concurrency: a positive integer in Globals (0 would switch every function off).
  const rce = value(block(template, "Globals", 0), "ReservedConcurrentExecutions");
  if (!(Number.isInteger(Number(rce)) && Number(rce) >= 1)) problems.push("Globals has no positive ReservedConcurrentExecutions");

  // Data protection.
  for (const name of ["UserPool", "ProgressTable", "SongsTable"]) {
    const r = resource(name);
    if (!r) { problems.push(`${name} is missing`); continue; }
    if (value(r, "DeletionPolicy") !== "Retain") problems.push(`${name} lacks DeletionPolicy: Retain`);
    if (value(r, "UpdateReplacePolicy") !== "Retain") problems.push(`${name} lacks UpdateReplacePolicy: Retain`);
  }
  if (value(resource("UserPool"), "DeletionProtection") !== "ACTIVE") problems.push("UserPool lacks DeletionProtection: ACTIVE");
  for (const name of ["ProgressTable", "SongsTable"]) {
    const r = resource(name) || "";
    if (value(r, "DeletionProtectionEnabled") !== "true") problems.push(`${name} lacks DeletionProtectionEnabled`);
    if (value(block(r, "PointInTimeRecoverySpecification", 6), "PointInTimeRecoveryEnabled") !== "true") problems.push(`${name} lacks point-in-time recovery`);
  }

  // Budget: $30 a month, account-wide, four alerts, all to the BudgetEmail parameter, no fixed name.
  const budget = code(resource("MonthlyBudget") || "");
  if (!/Type:\s*AWS::Budgets::Budget/.test(budget)) problems.push("MonthlyBudget is missing");
  else {
    if (value(budget, "Amount") !== "30" || value(budget, "Unit") !== "USD" || value(budget, "TimeUnit") !== "MONTHLY") problems.push("the budget is not $30 a month");
    if (/BudgetName:/.test(budget)) problems.push("the budget has a fixed BudgetName (a new address replaces it, and the name would collide)");
    if (/CostFilters:/.test(budget)) problems.push("the budget has cost filters; it must cover the whole account");
    const alerts = [...budget.matchAll(/NotificationType:\s*(\w+)\s*\n\s*ComparisonOperator:\s*GREATER_THAN\s*\n\s*Threshold:\s*(\d+)\s*\n\s*ThresholdType:\s*PERCENTAGE/g)]
      .map((m) => `${m[1]} ${m[2]}`).sort();
    if (alerts.join() !== ["ACTUAL 100", "ACTUAL 50", "ACTUAL 80", "FORECASTED 100"].join()) problems.push(`budget alerts are ${alerts.join(", ") || "none"}`);
    const addresses = [...budget.matchAll(/Address:\s*(.*)/g)].map((m) => m[1].trim());
    if (addresses.length !== 4 || addresses.some((a) => a !== "!Ref BudgetEmail")) problems.push("every budget alert must go to !Ref BudgetEmail");
  }
  const param = block(block(template, "Parameters", 0) || "", "BudgetEmail", 2);
  if (!param) problems.push("the BudgetEmail parameter is missing");
  else {
    if (value(param, "NoEcho") !== "true") problems.push("BudgetEmail is not NoEcho");
    if (/^\s*Default:/m.test(param)) problems.push("BudgetEmail has a Default (the address would be committed)");
  }

  // No address in the repository's backend config: only example.com, and only in comments.
  for (const [file, text] of [["template.yaml", template], ["samconfig.toml", samconfig]]) {
    for (const m of code(text).matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) problems.push(`${file} contains an email address: ${m[0]}`);
  }
  if (/parameter_overrides/.test(samconfig)) problems.push("samconfig.toml has parameter_overrides (it is public; pass BudgetEmail on the command line)");
  return problems;
}

test("backend/template.yaml keeps the throttles, reserved concurrency, budget and data protection; no address is committed", () => {
  assert.deepEqual(templateProblems(TEMPLATE, SAMCONFIG), []);
});

// The checker's own mutations, kept as tests so the guard cannot quietly go blind: each variant is the real
// template or config with one of the mistakes this test exists for.
test("the template check refuses each mistake it guards against", () => {
  const cases = [
    ["a route without its throttle", TEMPLATE.replace(/(Path: \/progress\n\s*Method: PUT)\n\s*RouteSettings:[^\n]*\n\s*ThrottlingRateLimit: 2\n\s*ThrottlingBurstLimit: 10/, "$1"), /PUT|route rates sum/],
    ["a raised route rate", TEMPLATE.replace("ThrottlingRateLimit: 2\n", "ThrottlingRateLimit: 20\n"), /sum to/],
    ["no default throttle", TEMPLATE.replace(/      DefaultRouteSettings:\n[^\n]*\n[^\n]*\n/, ""), /DefaultRouteSettings/],
    ["reserved concurrency 0", TEMPLATE.replace("ReservedConcurrentExecutions: 2", "ReservedConcurrentExecutions: 0"), /ReservedConcurrentExecutions/],
    ["a table without Retain", TEMPLATE.replace(/(SongsTable:\n\s*Type: AWS::DynamoDB::Table\n)\s*DeletionPolicy: Retain\n/, "$1"), /SongsTable lacks DeletionPolicy/],
    ["a pool replaced without Retain", TEMPLATE.replace(/(UserPool:\n\s*Type: AWS::Cognito::UserPool\n\s*DeletionPolicy: Retain\n)\s*UpdateReplacePolicy: Retain\n/, "$1"), /UserPool lacks UpdateReplacePolicy/],
    ["pool deletion protection off", TEMPLATE.replace("DeletionProtection: ACTIVE", "DeletionProtection: INACTIVE"), /UserPool lacks DeletionProtection/],
    ["no point-in-time recovery", TEMPLATE.replace("PointInTimeRecoveryEnabled: true", "PointInTimeRecoveryEnabled: false"), /point-in-time/],
    ["a fixed budget name", TEMPLATE.replace("        BudgetType: COST", "        BudgetName: tune-garden\n        BudgetType: COST"), /BudgetName/],
    ["a dropped alert", TEMPLATE.replace("Threshold: 80", "Threshold: 90"), /budget alerts are/],
    ["a committed address", TEMPLATE.replace("Address: !Ref BudgetEmail", "Address: owner@example.org"), /email address|BudgetEmail/],
    ["a default address", TEMPLATE.replace("    NoEcho: true\n", "    NoEcho: true\n    Default: owner@example.org\n"), /Default|email address/],
  ];
  for (const [what, mutated, expect] of cases) {
    assert.notEqual(mutated, TEMPLATE, `the "${what}" mutation must change the template`);
    const problems = templateProblems(mutated, SAMCONFIG);
    assert.ok(problems.some((p) => expect.test(p)), `"${what}" should be refused; got ${JSON.stringify(problems)}`);
  }
  const leaked = SAMCONFIG + '\nparameter_overrides = "BudgetEmail=owner@example.org"\n';
  assert.ok(templateProblems(TEMPLATE, leaked).some((p) => /samconfig/.test(p)), "an address in samconfig.toml should be refused");
});
