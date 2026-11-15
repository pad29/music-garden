// The cost switch (TUN-87), driven without AWS: backend/src/cloud-switch-api.mjs takes its AWS calls as plain
// functions, and here they are a fake account that records every change and email. cloud-switch.mjs only
// imports the SDK. What it must do: at a message on the alarm topic, switch OFF — the three game functions to
// concurrency 0 and the API's default endpoint disabled — and email; switch ON only when the owner sends
// {"switch":"on"}, recording when; ignore a trip published before that switch-on; report, never act, on
// "status"; stop a step at its deadline; and fail visibly when anything did not take.
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeCloudSwitchHandler, readCommand, sdkAdapter, switchConfig, CLIENT_OPTIONS, COMMAND } from "../backend/src/cloud-switch-api.mjs";

const logged = [];
console.log = (...a) => logged.push(["log", ...a]);
console.error = (...a) => logged.push(["error", ...a]);

const FNS = ["music-garden-ProgressFn-A", "music-garden-SongsFn-B", "music-garden-PreSignUpFn-C"];
const ALARM = "arn:aws:sns:us-east-1:123456789012:music-garden-CloudSwitchAlarmTopic-X";
const T0 = Date.parse("2026-11-20T12:00:00Z");
const CFG = { functions: FNS, onConcurrency: 2, alarmTopicArn: ALARM, stepMs: 50, graceMs: 30 };
const iso = ms => new Date(ms).toISOString();
const sns = (over = {}, rec = {}) => ({ Records: [{ EventSource: "aws:sns", ...rec,
  Sns: { TopicArn: ALARM, Timestamp: iso(T0), Subject: "AWS Budgets: budget has exceeded your alert threshold", Message: "…", ...over } }] });

/**
 * A fake account: every function at `start` concurrency, the endpoint enabled, the switch-on time `onAt`.
 * `fail` / `hang` name calls to break; a hung call honours its AbortSignal (as the SDK does) and records it.
 * `clock.now` is the time the handler sees.
 */
// `late` names calls AWS had already received when the deadline aborted them: they apply 10 ms after the abort,
// and only then does the client's promise reject.
function account({ start = 2, endpointDisabled = false, onAt = "never", fail = {}, hang = {}, late = {} } = {}) {
  const a = { conc: Object.fromEntries(FNS.map(f => [f, start])), endpointDisabled, onAt, writes: [], mails: [], aborted: [], events: [], clock: { now: T0 + 60e3 } };
  const act = (key, fn, signal) => {
    if (late[key]) return new Promise((_, rej) => { signal.addEventListener("abort", () => setTimeout(() => { fn(); a.events.push("settled " + key); rej(signal.reason); }, 10)); });
    if (hang[key]) return new Promise((_, rej) => { signal && signal.addEventListener("abort", () => { a.aborted.push(key); rej(signal.reason); }); });
    if (fail[key]) return Promise.reject(new Error(`${key} denied`));
    return Promise.resolve().then(fn);
  };
  a.aws = {
    getConcurrency: (fn, s) => act("get:" + fn, () => a.conc[fn], s),
    putConcurrency: (fn, n, s) => act("put:" + fn, () => { a.writes.push(["put", fn, n]); a.conc[fn] = n; }, s),
    getEndpointDisabled: s => act("getApi", () => (a.events.push("read api"), a.endpointDisabled), s),
    setEndpointDisabled: (d, s) => act("setApi", () => { a.writes.push(["api", d]); a.endpointDisabled = d; }, s),
    getOnAt: s => act("getOnAt", () => a.onAt, s),
    setOnAt: (v, s) => act("setOnAt", () => { a.writes.push(["onAt", v]); a.onAt = v; }, s),
    notify: (subject, message, s) => act("notify", () => { a.mails.push({ subject, message }); }, s),
    now: () => a.clock.now,
  };
  return a;
}
const OFF_WRITES = [...FNS.map(f => ["put", f, 0]), ["api", true]];
const onWrites = at => [...FNS.map(f => ["put", f, 2]), ["api", false], ["onAt", iso(at)]];

test("a message on the alarm topic switches every lever off and emails what it did", async () => {
  const a = account();
  const r = await makeCloudSwitchHandler(a.aws, CFG)(sns());
  assert.deepEqual(a.writes, OFF_WRITES);
  assert.equal(r.done, true); assert.equal(r.cloud, "off"); assert.equal(r.endpoint, "disabled");
  assert.deepEqual(Object.values(r.functions), [0, 0, 0]);
  assert.equal(a.mails.length, 1);
  assert.equal(a.mails[0].subject, "Tune Garden: the cloud is switched OFF");
  assert.match(a.mails[0].message, /AWS Budgets: budget has exceeded/);
  for (const f of FNS) assert.match(a.mails[0].message, new RegExp(`${f}: reserved concurrency 0`));
  assert.match(a.mails[0].message, /API default endpoint: disabled/);
  assert.ok(a.mails[0].message.includes(COMMAND.on), "the email carries the switch-on command");
  assert.ok(a.mails[0].subject.length <= 100, "SNS subjects are at most 100 characters");
});

test("a message on the alarm topic always means off, whatever it says, and a repeat is harmless", async () => {
  for (const over of [{ Subject: undefined, Message: "rehearsal" }, { Subject: undefined, Message: '{"switch":"on"}' }, { Message: "" }]) {
    const a = account();
    const h = makeCloudSwitchHandler(a.aws, CFG);
    await h(sns(over));
    assert.deepEqual(a.writes, OFF_WRITES, JSON.stringify(over));
    await h(sns(over));   // tripped again while off: the same settings, still off
    assert.equal((await h({ switch: "status" })).cloud, "off");
  }
  const two = account(); const ev = sns(); ev.Records.push(sns().Records[0]);
  await makeCloudSwitchHandler(two.aws, CFG)(ev);
  assert.deepEqual(two.writes, OFF_WRITES, "several records still switch off once");
});

test("the owner's on, off and status commands; on records when", async () => {
  const a = account({ start: 0, endpointDisabled: true });
  const h = makeCloudSwitchHandler(a.aws, CFG);
  const before = await h({ switch: "status" });
  assert.deepEqual(a.writes, []); assert.equal(a.mails.length, 0);
  assert.equal(before.cloud, "off");
  const on = await h({ switch: "on" });
  assert.deepEqual(a.writes, onWrites(a.clock.now));
  assert.equal(on.cloud, "on"); assert.equal(on.done, true);
  assert.equal(a.mails[0].subject, "Tune Garden: the cloud is switched back ON");
  assert.match(a.mails[0].message, /If this month's \$30 alert has already fired, the budget will not trip the switch again until next month/);
  a.writes.length = 0;
  const off = await h({ switch: "off" });
  assert.deepEqual(a.writes, OFF_WRITES, "the owner's off does not touch the switch-on time"); assert.equal(off.cloud, "off");
  assert.match(a.mails[1].message, /Why: the owner's command/);
});

// Design review 7 / PR review round 1, finding 1: Lambda and SNS can deliver a message again after it was
// handled, hours later. Age cannot tell that from a late real trip; the owner's switch-on time can.
test("a trip delivered again after the owner switched on is ignored; a new alarm after it still trips", async () => {
  const a = account();
  const h = makeCloudSwitchHandler(a.aws, CFG);
  const trip = sns({ Timestamp: iso(T0) });
  a.clock.now = T0 + 60e3; await h(trip);                              // 12:01 off
  a.clock.now = T0 + 6 * 60e3; await h({ switch: "on" });              // 12:06 on
  assert.equal(a.onAt, iso(T0 + 6 * 60e3));
  a.writes.length = 0; a.mails.length = 0;
  a.clock.now = T0 + 7 * 60e3;
  const again = await h(trip);                                         // 12:07 the 12:00 message again
  assert.equal(again.ignored, "published before the last switch-on");
  assert.deepEqual(a.writes, [], "recovery stands");
  assert.equal((await h({ switch: "status" })).cloud, "on");
  assert.equal(a.mails.length, 1); assert.match(a.mails[0].subject, /old cost-switch message was ignored/);
  a.clock.now = T0 + 30 * 60e3;
  await h(sns({ Timestamp: iso(T0 + 29 * 60e3) }));                    // a new alarm, published after the switch-on
  assert.deepEqual(a.writes, OFF_WRITES);
});

test("a trip that arrives late, with no switch-on since, still trips; so does one whose switch-on time cannot be read", async () => {
  for (const [what, opts] of [["three hours late", {}], ["the state never written", { onAt: "never" }], ["the state unreadable", { fail: { getOnAt: true } }],
    ["the state hanging", { hang: { getOnAt: true } }], ["a switch-on long before", { onAt: iso(T0 - 86400e3) }]]) {
    const a = account(opts); a.clock.now = T0 + 3 * 3600e3;
    const r = await makeCloudSwitchHandler(a.aws, CFG)(sns({ Timestamp: iso(T0) }));
    assert.deepEqual(a.writes, OFF_WRITES, what); assert.equal(r.cloud, "off", what);
    if (opts.fail || opts.hang) assert.match(a.mails[0].message, /last switch-on time could not be read/, what);
  }
  const noTime = account({ onAt: iso(T0 + 3600e3) });
  await makeCloudSwitchHandler(noTime.aws, CFG)(sns({ Timestamp: undefined }));
  assert.deepEqual(noTime.writes, OFF_WRITES, "a record with no timestamp is not taken for an old one");
});

test("an ignored old trip whose notice cannot be sent fails, so it is retried and the owner hears of it", async () => {
  const a = account({ onAt: iso(T0 + 60e3), fail: { notify: true } });
  await assert.rejects(makeCloudSwitchHandler(a.aws, CFG)(sns({ Timestamp: iso(T0) })), /notify denied/);
  assert.deepEqual(a.writes, []);
});

test("status reports a function with no reservation, or a mixed state, and changes nothing", async () => {
  const a = account(); a.conc[FNS[1]] = undefined; a.endpointDisabled = true;
  const s = await makeCloudSwitchHandler(a.aws, CFG)({ switch: "status" });
  assert.equal(s.functions[FNS[1]], "unreserved"); assert.equal(s.cloud, "mixed");
  assert.deepEqual(a.writes, []); assert.equal(a.mails.length, 0);
});

test("anything else is refused and changes nothing", async () => {
  for (const ev of [{}, { switch: "ON" }, { switch: "on", extra: 1 }, { switch: ["on"] }, "on", null, [], { Records: "x" }, { switch: "toggle" }]) {
    const a = account({ start: 0, endpointDisabled: true });
    await assert.rejects(makeCloudSwitchHandler(a.aws, CFG)(ev), /refused/, JSON.stringify(ev));
    assert.deepEqual(a.writes, []); assert.equal(a.mails.length, 0);
  }
});

test("SNS records from another topic or source, or malformed ones, are ignored", async () => {
  const cases = [
    sns({ TopicArn: ALARM.replace("AlarmTopic", "NoticeTopic") }),
    sns({}, { EventSource: "aws:sqs" }),
    { Records: [] }, { Records: [null, {}, { EventSource: "aws:sns" }] },
  ];
  for (const ev of cases) {
    const a = account();
    const r = await makeCloudSwitchHandler(a.aws, CFG)(ev);
    assert.ok(r.ignored, JSON.stringify(ev)); assert.deepEqual(a.writes, []); assert.equal(a.mails.length, 0);
  }
});

test("one failing or hanging step does not stop the others; the email says so and the call fails", async () => {
  for (const broken of [{ fail: { ["put:" + FNS[1]]: true } }, { hang: { setApi: true } }, { fail: { ["put:" + FNS[2]]: true }, hang: { ["put:" + FNS[0]]: true } }]) {
    const a = account(broken);
    await assert.rejects(makeCloudSwitchHandler(a.aws, CFG)(sns()), /not everything took/, JSON.stringify(broken));
    const ok = OFF_WRITES.filter(([k, f]) => !(broken.fail || {})["put:" + f] && !(broken.hang || {})["put:" + f]
      && !(k === "api" && (broken.hang || {}).setApi));
    assert.deepEqual(a.writes, ok, "every other step still ran");
    assert.equal(a.mails.length, 1, "the email still went");
    assert.match(a.mails[0].subject, /OFF — NOT COMPLETE/);
    assert.match(a.mails[0].message, /Steps that failed:/);
    assert.ok(a.mails[0].message.includes(COMMAND.off), "it says how to try again");
  }
});

// PR review round 1, finding 2: a deadline must stop the call, not just stop waiting for it.
test("a step past its deadline is aborted, so it cannot land after a later command", async () => {
  for (const key of ["put:" + FNS[0], "setApi", "put:" + FNS[2]]) {
    const a = account({ start: 0, endpointDisabled: true, hang: { [key]: true } });
    const h = makeCloudSwitchHandler(a.aws, CFG);
    await assert.rejects(h({ switch: "on" }), /not everything took/);
    assert.deepEqual(a.aborted, [key], `${key}: its signal fired`);
  }
});

test("switching on reports a step that did not take, the switch-on time included", async () => {
  const a = account({ start: 0, endpointDisabled: true, fail: { setApi: true } });
  await assert.rejects(makeCloudSwitchHandler(a.aws, CFG)({ switch: "on" }), /not everything took/);
  assert.match(a.mails[0].subject, /back ON — NOT COMPLETE/);
  assert.match(a.mails[0].message, /API default endpoint: disabled/);
  const b = account({ start: 0, endpointDisabled: true, fail: { setOnAt: true } });
  await assert.rejects(makeCloudSwitchHandler(b.aws, CFG)({ switch: "on" }), /not everything took/);
  assert.match(b.mails[0].message, /the switch-on time: setOnAt denied/);
});

test("a setting that cannot be read back counts as not done", async () => {
  const a = account({ fail: { getApi: true } });
  await assert.rejects(makeCloudSwitchHandler(a.aws, CFG)(sns()), /not everything took/);
  assert.deepEqual(a.writes, OFF_WRITES);
  assert.match(a.mails[0].message, /API default endpoint: unknown \(getApi denied\)/);
  const s = account({ hang: { ["get:" + FNS[0]]: true } });
  const st = await makeCloudSwitchHandler(s.aws, CFG)({ switch: "status" });
  assert.match(String(st.functions[FNS[0]]), /^unknown \(timed out/); assert.equal(st.cloud, "mixed");
});

test("the switch still happens when the email fails, and the call fails so it is retried", async () => {
  const a = account({ fail: { notify: true } });
  await assert.rejects(makeCloudSwitchHandler(a.aws, CFG)(sns()), /switched, but the email failed/);
  assert.deepEqual(a.writes, OFF_WRITES);
});

test("a misconfigured switch changes nothing", async () => {
  for (const cfg of [{ ...CFG, onConcurrency: NaN }, { ...CFG, onConcurrency: 0 }, { ...CFG, functions: FNS.slice(0, 2) },
    { ...CFG, functions: [FNS[0], FNS[1], undefined] }, { ...CFG, alarmTopicArn: undefined }]) {
    const a = account();
    await assert.rejects(makeCloudSwitchHandler(a.aws, cfg)(sns()), /misconfigured/);
    assert.deepEqual(a.writes, []);
  }
});

test("readCommand on its own", () => {
  assert.equal(readCommand(sns(), CFG).action, "off");
  assert.equal(readCommand(sns(), CFG).publishedAt, T0);
  assert.ok(Number.isNaN(readCommand(sns({ Timestamp: "not a date" }), CFG).publishedAt));
  assert.equal(readCommand({ switch: "status" }, CFG).action, "status");
});

// PR review round 1, missing test 4: the real adapter, with recording SDK clients and command classes.
test("the SDK adapter sends the right commands, each with the step's abort signal", async () => {
  const sent = [];
  const client = name => ({ send: async (cmd, opts) => { sent.push({ client: name, cmd: cmd.constructor.name, input: cmd.input, signal: opts && opts.abortSignal });
    return { ReservedConcurrentExecutions: 0, DisableExecuteApiEndpoint: true, Parameter: { Value: "2026-11-20T12:06:00.000Z" } }; } });
  const C = Object.fromEntries(["GetFunctionConcurrencyCommand", "PutFunctionConcurrencyCommand", "GetApiCommand", "UpdateApiCommand",
    "PublishCommand", "GetParameterCommand", "PutParameterCommand"].map(n => [n, { [n]: class { constructor(input) { this.input = input; } } }[n]]));
  const env = { API_ID: "api1", NOTICE_TOPIC_ARN: "arn:notice", STATE_PARAM: "/music-garden/cloud-switch/on-at",
    PROGRESS_FN: FNS[0], SONGS_FN: FNS[1], PRESIGNUP_FN: FNS[2], ON_CONCURRENCY: "2", ALARM_TOPIC_ARN: ALARM };
  const aws = sdkAdapter({ lambda: client("lambda"), apigw: client("apigw"), sns: client("sns"), ssm: client("ssm") }, C, env);
  const sig = new AbortController().signal;
  assert.equal(await aws.getConcurrency("f", sig), 0);
  await aws.putConcurrency("f", 0, sig);
  assert.equal(await aws.getEndpointDisabled(sig), true);
  await aws.setEndpointDisabled(true, sig);
  assert.equal(await aws.getOnAt(sig), "2026-11-20T12:06:00.000Z");
  await aws.setOnAt("2026-11-20T13:00:00.000Z", sig);
  await aws.notify("s", "m", sig);
  assert.deepEqual(sent.map(x => [x.client, x.cmd, x.input]), [
    ["lambda", "GetFunctionConcurrencyCommand", { FunctionName: "f" }],
    ["lambda", "PutFunctionConcurrencyCommand", { FunctionName: "f", ReservedConcurrentExecutions: 0 }],
    ["apigw", "GetApiCommand", { ApiId: "api1" }],
    ["apigw", "UpdateApiCommand", { ApiId: "api1", DisableExecuteApiEndpoint: true }],
    ["ssm", "GetParameterCommand", { Name: "/music-garden/cloud-switch/on-at" }],
    ["ssm", "PutParameterCommand", { Name: "/music-garden/cloud-switch/on-at", Value: "2026-11-20T13:00:00.000Z", Overwrite: true }],
    ["sns", "PublishCommand", { TopicArn: "arn:notice", Subject: "s", Message: "m" }],
  ]);
  assert.ok(sent.every(x => x.signal === sig), "every call carries the abort signal");
  const cfg = switchConfig(env);
  assert.deepEqual(cfg.functions, FNS); assert.equal(cfg.onConcurrency, 2); assert.equal(cfg.alarmTopicArn, ALARM);
  assert.ok((cfg.stepMs + cfg.graceMs) * 4 < 60e3, "four rounds of steps, grace included, fit the function's 60-second timeout");
  assert.equal(CLIENT_OPTIONS.requestHandler.throwOnRequestTimeout, true, "a stalled request fails, not only warns");
  assert.equal(CLIENT_OPTIONS.maxAttempts, 3);
});

test("through the adapter, a deadline aborts the SDK call itself", async () => {
  const aborted = [];
  const hung = { send: (cmd, opts) => new Promise((_, rej) => opts.abortSignal.addEventListener("abort", () => { aborted.push(cmd.constructor.name); rej(new Error("aborted")); })) };
  const ok = { send: async () => ({ ReservedConcurrentExecutions: 2, DisableExecuteApiEndpoint: false, Parameter: { Value: "never" } }) };
  const C = Object.fromEntries(["GetFunctionConcurrencyCommand", "PutFunctionConcurrencyCommand", "GetApiCommand", "UpdateApiCommand",
    "PublishCommand", "GetParameterCommand", "PutParameterCommand"].map(n => [n, { [n]: class { constructor(input) { this.input = input; } } }[n]]));
  const aws = sdkAdapter({ lambda: ok, apigw: hung, sns: ok, ssm: ok }, C, { API_ID: "a" });
  await assert.rejects(makeCloudSwitchHandler(aws, CFG)({ switch: "on" }), /not everything took/);
  assert.ok(aborted.includes("UpdateApiCommand"), "the hung UpdateApi was aborted");
});

// PR review round 2, finding 1: a write AWS had already received is not undone by the abort. The step waits
// for the call to settle, so the read-back reports what really happened, the command is NOT COMPLETE, and the
// next command sets everything again — nothing lands after it.
test("a timed-out write AWS had already received shows in the read-back, and the next command still wins", async () => {
  for (const key of ["setApi", "put:" + FNS[0], "put:" + FNS[2]]) {
    const a = account({ start: 0, endpointDisabled: true, late: { [key]: true } });
    const h = makeCloudSwitchHandler(a.aws, CFG);
    await assert.rejects(h({ switch: "on" }), /not everything took/, key);
    if (key === "setApi") {
      assert.ok(a.events.indexOf("settled setApi") < a.events.lastIndexOf("read api"), "the read-back follows the call's settling");
      assert.match(a.mails[0].message, /API default endpoint: enabled/, "the email reports the write that landed");
    }
    assert.match(a.mails[0].subject, /NOT COMPLETE/);
    const landed = () => a.events.filter(e => e.startsWith("settled")).length, settled = landed();
    const off = await makeCloudSwitchHandler({ ...a.aws, setEndpointDisabled: (d, s) => (a.writes.push(["api", d]), Promise.resolve().then(() => { a.endpointDisabled = d; })),
      putConcurrency: (fn, n) => Promise.resolve().then(() => { a.conc[fn] = n; }) }, CFG)({ switch: "off" });
    assert.equal(off.cloud, "off", key);
    await new Promise(r => setTimeout(r, 40));
    assert.equal(landed(), settled, "nothing from the old command lands afterwards");
    assert.equal((await h({ switch: "status" })).cloud, "off", key);
  }
});

test("a partial shutdown retried hours later, with no switch-on between, finishes the job", async () => {
  const a = account({ fail: { ["put:" + FNS[1]]: true } });
  const h = makeCloudSwitchHandler(a.aws, CFG);
  const trip = sns({ Timestamp: iso(T0) });
  a.clock.now = T0 + 59 * 60e3;
  await assert.rejects(h(trip), /not everything took/);
  assert.equal(a.conc[FNS[1]], 2, "one lever failed");
  a.clock.now = T0 + 5 * 3600e3;   // Lambda's retry, long after
  const r = await makeCloudSwitchHandler({ ...a.aws, putConcurrency: (fn, n, s) => Promise.resolve().then(() => { a.writes.push(["put", fn, n]); a.conc[fn] = n; }) }, CFG)(trip);
  assert.equal(r.done, true); assert.equal(r.cloud, "off");
  assert.match(a.mails.at(-1).subject, /switched OFF$/);
});
