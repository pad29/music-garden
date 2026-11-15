// The sign-up trigger's daily limit (TUN-88), driven without the AWS SDK: backend/src/presignup-api.mjs takes
// its DynamoDB access as one plain function, and here that is an in-memory table that applies the conditional
// ADD the way DynamoDB does — atomically — and refuses any expression it was not written for, so a typo in the
// handler's UpdateItem fails here instead of passing against a fake that guesses. It cannot prove DynamoDB's
// syntax, IAM or Cognito's error shape: the owner's playtest does (reviews/TUN-88-daily-signup-limit.md).
import { test } from "node:test";
import assert from "node:assert";
import {
  makePreSignUpHandler, signUpConfig, counterParams, sdkAdapter, utcDay,
  FULL, UNAVAILABLE, UNSUPPORTED, KEEP_DAYS, DEADLINE_MS, CLIENT_OPTIONS,
} from "../backend/src/presignup-api.mjs";

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 10, 15, 12, 0, 0);          // 2026-11-15 12:00 UTC
const MIDNIGHT = Date.UTC(2026, 10, 16);               // 2026-11-16 00:00 UTC
const TABLE = "music-garden-signup-count";
const SECRET = "arn:aws:dynamodb:us-east-1:123456789012:table/SECRET-internal";
const cfg = (limit) => ({ ok: true, limit, table: TABLE });
const signUp = (email) => ({ triggerSource: "PreSignUp_SignUp", userName: "kid", request: { userAttributes: email ? { email } : {} }, response: {} });

function quietLog() {
  const lines = [];
  return { lines, log: { log: (...a) => lines.push(["log", ...a]), error: (...a) => lines.push(["error", ...a]) } };
}
const conditionFailed = () => Object.assign(new Error("The conditional request failed"), { name: "ConditionalCheckFailedException" });

/** An in-memory day table. `add` accepts only the exact UpdateItem the handler is meant to send. */
function memoryTable({ before } = {}) {
  const rows = new Map(), calls = [];
  const apply = (p) => {
    const want = counterParams(TABLE, p.ExpressionAttributeValues[":max"], 0);   // the shape, for any day
    for (const k of ["UpdateExpression", "ConditionExpression"]) if (p[k] !== want[k]) throw new Error(`unsupported ${k}: ${p[k]}`);
    if (JSON.stringify(p.ExpressionAttributeNames) !== JSON.stringify({ "#n": "signups", "#e": "expiresAt" })) throw new Error("unsupported names");
    if (p.TableName !== TABLE || Object.keys(p.Key).join() !== "day") throw new Error("wrong table or key");
    const v = p.ExpressionAttributeValues;
    if (Object.keys(v).sort().join() !== ":exp,:max,:one" || v[":one"] !== 1) throw new Error("unsupported values");
    const row = rows.get(p.Key.day);
    if (!(row === undefined || row.signups === undefined || row.signups < v[":max"])) throw conditionFailed();
    rows.set(p.Key.day, { day: p.Key.day, signups: (row ? row.signups : 0) + 1, expiresAt: row ? row.expiresAt : v[":exp"] });
  };
  return { rows, calls, counter: { async add(p, signal) {
    calls.push({ p, signal });
    if (before) await before(p, signal);
    await Promise.resolve();   // an async gap, so concurrent calls really interleave
    apply(p);                  // …and each applies atomically, as DynamoDB does
    return {};
  } } };
}
async function outcome(h, event) {
  try { const r = await h(event); return r.response.autoConfirmUser === true ? "ok" : "unconfirmed"; }
  catch (e) { return e.message; }
}

test("a sign-up is counted against its UTC day and confirmed as before; an email is auto-verified", async () => {
  const t = memoryTable(), { log } = quietLog();
  const h = makePreSignUpHandler(t.counter, { config: cfg(100), now: () => T0, log });
  const r = await h(signUp("parent@example.com"));
  assert.equal(r.response.autoConfirmUser, true);
  assert.equal(r.response.autoVerifyEmail, true);
  const r2 = await h(signUp());
  assert.equal(r2.response.autoConfirmUser, true);
  assert.equal(r2.response.autoVerifyEmail, undefined, "no email, nothing to verify");
  assert.deepStrictEqual(t.rows.get("2026-11-15"), { day: "2026-11-15", signups: 2, expiresAt: Date.UTC(2026, 10, 15) / 1000 + KEEP_DAYS * 86400 });
  assert.equal(t.calls.length, 2);
  assert.ok(t.calls[0].signal instanceof AbortSignal, "every counter call carries the deadline's signal");
});

test("the UpdateItem: one atomic conditional ADD, its expiry fixed by the day and set once", () => {
  const late = Date.UTC(2026, 10, 15, 23, 59, 59, 999);
  const p = counterParams(TABLE, 100, late);
  assert.deepStrictEqual(p, {
    TableName: TABLE, Key: { day: "2026-11-15" },
    UpdateExpression: "SET #e = if_not_exists(#e, :exp) ADD #n :one",
    ConditionExpression: "attribute_not_exists(#n) OR #n < :max",
    ExpressionAttributeNames: { "#n": "signups", "#e": "expiresAt" },
    ExpressionAttributeValues: { ":one": 1, ":max": 100, ":exp": Date.UTC(2026, 10, 18) / 1000 },
  });
  assert.deepStrictEqual(counterParams(TABLE, 100, Date.UTC(2026, 10, 15)).ExpressionAttributeValues[":exp"], p.ExpressionAttributeValues[":exp"],
    "the first and last millisecond of a day agree on its expiry");
  assert.equal(utcDay(MIDNIGHT - 1), "2026-11-15");
  assert.equal(utcDay(MIDNIGHT), "2026-11-16");
});

test("N sign-ups pass; the next is refused with exactly the daily-limit token, unconfirmed, with a one-line stack", async () => {
  const t = memoryTable(), { log } = quietLog();
  const h = makePreSignUpHandler(t.counter, { config: cfg(3), now: () => T0, log });
  for (let i = 0; i < 3; i++) assert.equal(await outcome(h, signUp()), "ok");
  const ev = signUp("x@example.com");
  await assert.rejects(h(ev), (e) => e.message === FULL && e.stack === `Error: ${FULL}`);
  assert.deepStrictEqual(ev.response, {}, "a refused sign-up is never given the confirm flags");
  assert.equal(t.rows.get("2026-11-15").signups, 3);
});

test("2N sign-ups at once: exactly N pass", async () => {
  const t = memoryTable(), { log } = quietLog();
  const h = makePreSignUpHandler(t.counter, { config: cfg(10), now: () => T0, log });
  const results = await Promise.all(Array.from({ length: 20 }, () => outcome(h, signUp())));
  assert.equal(results.filter((r) => r === "ok").length, 10);
  assert.equal(results.filter((r) => r === FULL).length, 10);
  assert.equal(t.rows.get("2026-11-15").signups, 10);
});

test("several containers share one count; a changed limit keeps today's count — raising it lets the difference through", async () => {
  const t = memoryTable(), { log } = quietLog();
  const a = makePreSignUpHandler(t.counter, { config: cfg(3), now: () => T0, log });
  const b = makePreSignUpHandler(t.counter, { config: cfg(3), now: () => T0, log });
  const got = [];
  for (const h of [a, b, a, b, a]) got.push(await outcome(h, signUp()));
  assert.deepStrictEqual(got, ["ok", "ok", "ok", FULL, FULL]);
  const higher = makePreSignUpHandler(t.counter, { config: cfg(5), now: () => T0, log });   // a redeploy with N = 5
  assert.deepStrictEqual([await outcome(higher, signUp()), await outcome(higher, signUp()), await outcome(higher, signUp())], ["ok", "ok", FULL]);
  const lower = makePreSignUpHandler(t.counter, { config: cfg(2), now: () => T0, log });     // lowering revokes nothing
  assert.equal(await outcome(lower, signUp()), FULL);
  assert.equal(t.rows.get("2026-11-15").signups, 5);
  assert.equal(await outcome(a, signUp()), FULL, "a container that saw the day full still refuses it");
});

test("a full day is remembered: later refusals that day make no DynamoDB call, and the next UTC day starts again", async () => {
  const t = memoryTable(), { log, lines } = quietLog();
  let now = MIDNIGHT - 2;
  const h = makePreSignUpHandler(t.counter, { config: cfg(1), now: () => now, log });
  assert.equal(await outcome(h, signUp()), "ok");
  assert.equal(await outcome(h, signUp()), FULL);
  const calls = t.calls.length;
  now = MIDNIGHT - 1;   // 23:59:59.999
  assert.equal(await outcome(h, signUp()), FULL);
  assert.equal(t.calls.length, calls, "refused from memory: no write");
  assert.equal(lines.filter((l) => l[0] === "log").length, 1, "a container logs a day's refusal once");
  now = MIDNIGHT;       // 00:00:00.000
  assert.equal(await outcome(h, signUp()), "ok");
  assert.equal(t.rows.get("2026-11-16").signups, 1);
  assert.equal(t.rows.get("2026-11-15").signups, 1);
});

test("across midnight: a write begun on one day counts there, and a late refusal never marks the new day full", async () => {
  let release, now = MIDNIGHT - 100;
  const gate = new Promise((r) => { release = r; });
  const t = memoryTable({ before: (p) => (p.Key.day === "2026-11-15" ? gate : null) });
  const { log } = quietLog();
  // Yesterday is already full; a refusal for it is in flight when midnight passes.
  t.rows.set("2026-11-15", { day: "2026-11-15", signups: 1, expiresAt: 1 });
  const h = makePreSignUpHandler(t.counter, { config: cfg(1), now: () => now, log, deadlineMs: 10_000 });
  const pending = outcome(h, signUp());
  now = MIDNIGHT + 5;
  release();
  assert.equal(await pending, FULL, "refused against the day it began on");
  assert.equal(await outcome(h, signUp()), "ok", "the new day is not marked full by yesterday's refusal");
  assert.equal(t.rows.get("2026-11-16").signups, 1);

  // A success begun before midnight and finished after it counts against the day it began on.
  let release2; const gate2 = new Promise((r) => { release2 = r; });
  const t2 = memoryTable({ before: () => gate2 });
  now = MIDNIGHT - 100;
  const h2 = makePreSignUpHandler(t2.counter, { config: cfg(1), now: () => now, log, deadlineMs: 10_000 });
  const p2 = outcome(h2, signUp());
  now = MIDNIGHT + 5; release2();
  assert.equal(await p2, "ok");
  assert.deepStrictEqual([...t2.rows.keys()], ["2026-11-15"]);
});

test("a limit of 0 refuses every sign-up as full, without touching DynamoDB, whether or not today has a count", async () => {
  for (const existing of [false, true]) {
    const t = memoryTable(), { log } = quietLog();
    if (existing) t.rows.set("2026-11-15", { day: "2026-11-15", signups: 4, expiresAt: 1 });
    const h = makePreSignUpHandler(t.counter, { config: cfg(0), now: () => T0, log });
    assert.equal(await outcome(h, signUp()), FULL);
    assert.equal(t.calls.length, 0);
  }
});

test("only the game's sign-up is counted; the owner's AdminCreateUser is not; any other source is refused before a write", async () => {
  const t = memoryTable(), { log, lines } = quietLog();
  const h = makePreSignUpHandler(t.counter, { config: cfg(1), now: () => T0, log });
  const admin = await h({ triggerSource: "PreSignUp_AdminCreateUser", request: { userAttributes: {} }, response: {} });
  assert.equal(admin.response.autoConfirmUser, true);
  assert.equal(t.calls.length, 0, "AdminCreateUser is not counted");
  for (const source of ["PreSignUp_ExternalProvider", "PostConfirmation_ConfirmSignUp", "", undefined, null, 42]) {
    const ev = { triggerSource: source, request: { userAttributes: {} }, response: {} };
    await assert.rejects(h(ev), (e) => e.message === UNSUPPORTED, `source ${String(source)}`);
    assert.deepStrictEqual(ev.response, {});
  }
  await assert.rejects(h(undefined), (e) => e.message === UNSUPPORTED);
  assert.equal(t.calls.length, 0, "nothing written for a refused source");
  assert.ok(lines.some((l) => l[0] === "error" && /refused trigger source/.test(l[1])));
  assert.equal(await outcome(h, signUp()), "ok", "and the game's own sign-up still passes");
});

test("the deploy settings: a whole number ≥ 0 and a table name, or every sign-up is refused as unavailable", async () => {
  assert.deepStrictEqual(signUpConfig({ DAILY_SIGNUP_LIMIT: "100", SIGNUP_COUNT_TABLE: TABLE }), { ok: true, limit: 100, table: TABLE });
  assert.deepStrictEqual(signUpConfig({ DAILY_SIGNUP_LIMIT: "0", SIGNUP_COUNT_TABLE: TABLE }), { ok: true, limit: 0, table: TABLE });
  const bad = [undefined, "", " ", "-1", "1.5", "1e3", "0x10", "Infinity", "NaN", "100abc", " 100", "100 ", "9007199254740993"];
  for (const v of bad) assert.deepStrictEqual(signUpConfig({ DAILY_SIGNUP_LIMIT: v, SIGNUP_COUNT_TABLE: TABLE }), { ok: false }, `limit ${JSON.stringify(v)}`);
  for (const tb of [undefined, "", "  "]) assert.deepStrictEqual(signUpConfig({ DAILY_SIGNUP_LIMIT: "100", SIGNUP_COUNT_TABLE: tb }), { ok: false }, `table ${JSON.stringify(tb)}`);
  assert.deepStrictEqual(signUpConfig(), { ok: false });

  const t = memoryTable(), { log, lines } = quietLog();
  const h = makePreSignUpHandler(t.counter, { config: signUpConfig({}), now: () => T0, log });
  for (let i = 0; i < 2; i++) {
    const ev = signUp();
    await assert.rejects(h(ev), (e) => e.message === UNAVAILABLE);
    assert.deepStrictEqual(ev.response, {});
  }
  assert.equal(t.calls.length, 0);
  assert.ok(lines.some((l) => l[0] === "error" && /not set right/.test(l[1])));
  const none = makePreSignUpHandler(t.counter, { now: () => T0, log });
  await assert.rejects(none(signUp()), (e) => e.message === UNAVAILABLE, "no config at all");
});

test("a failing counter refuses as unavailable, with no AWS text for the browser; it recovers, and never marks the day full", async () => {
  let failing = true;
  const t = memoryTable({ before: () => { if (failing) throw Object.assign(new Error("AccessDeniedException: " + SECRET), { name: "AccessDeniedException" }); } });
  const { log, lines } = quietLog();
  const h = makePreSignUpHandler(t.counter, { config: cfg(5), now: () => T0, log });
  await assert.rejects(h(signUp()), (e) => e.message === UNAVAILABLE && !e.stack.includes(SECRET));
  assert.ok(lines.some((l) => l[0] === "error" && l.includes("AccessDeniedException")), "the real error goes to CloudWatch");
  failing = false;
  assert.equal(await outcome(h, signUp()), "ok", "the next sign-up tries again");
});

test("a write that lands but whose answer is lost is refused and still counted — the safe direction", async () => {
  const t = memoryTable(), { log } = quietLog();
  const lost = { async add(p, signal) { await t.counter.add(p, signal); throw Object.assign(new Error("socket hang up"), { name: "TimeoutError" }); } };
  const h = makePreSignUpHandler(lost, { config: cfg(5), now: () => T0, log });
  assert.equal(await outcome(h, signUp()), UNAVAILABLE);
  assert.equal(t.rows.get("2026-11-15").signups, 1);
});

test("a counter that hangs is cut off at the deadline: refused promptly as unavailable, its signal aborted", { timeout: 5000 }, async () => {
  let seen;
  const hang = { add: (p, signal) => { seen = signal; return new Promise(() => {}); } };
  const { log } = quietLog();
  const h = makePreSignUpHandler(hang, { config: cfg(5), now: () => T0, log, deadlineMs: 20 });
  const started = Date.now();
  assert.equal(await outcome(h, signUp()), UNAVAILABLE);
  assert.ok(Date.now() - started < 1000, "refused promptly");
  assert.equal(seen.aborted, true, "the SDK request is told to stop");
});

test("the late answer of a timed-out call does not mark the day full in that same container", { timeout: 5000 }, async () => {
  let n = 0, finish;
  const counter = { add: () => (++n === 1 ? new Promise((res, rej) => { finish = rej; }) : Promise.resolve({})) };
  const { log } = quietLog();
  const h = makePreSignUpHandler(counter, { config: cfg(5), now: () => T0, log, deadlineMs: 20 });
  assert.equal(await outcome(h, signUp()), UNAVAILABLE);
  finish(conditionFailed());
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(await outcome(h, signUp()), "ok");
  assert.equal(n, 2);
});

test("the SDK settings answer well inside Cognito's 5 seconds, in one attempt", () => {
  assert.equal(CLIENT_OPTIONS.maxAttempts, 1, "a retried increment would count twice");
  const r = CLIENT_OPTIONS.requestHandler;
  assert.equal(r.throwOnRequestTimeout, true, "without it the SDK only warns on a request timeout");
  assert.ok(r.connectionTimeout + r.requestTimeout <= DEADLINE_MS);
  assert.ok(DEADLINE_MS <= 3000, "headroom under Cognito's 5 s");
});

test("sdkAdapter sends an UpdateCommand of the handler's parameters, with the deadline's signal", async () => {
  const sent = [];
  class UpdateCommand { constructor(input) { this.input = input; } }
  const client = { send: async (cmd, opts) => { sent.push({ cmd, opts }); return {}; } };
  const h = makePreSignUpHandler(sdkAdapter(client, UpdateCommand), { config: cfg(100), now: () => T0, log: quietLog().log });
  assert.equal(await outcome(h, signUp()), "ok");
  assert.equal(sent.length, 1);
  assert.ok(sent[0].cmd instanceof UpdateCommand);
  assert.deepStrictEqual(sent[0].cmd.input, counterParams(TABLE, 100, T0));
  assert.ok(sent[0].opts.abortSignal instanceof AbortSignal);
});
