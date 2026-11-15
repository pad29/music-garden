// The cost switch (TUN-87), driven without AWS: backend/src/cloud-switch-api.mjs takes its AWS calls as plain
// functions, and here they are a fake account that records every change and email. cloud-switch.mjs only
// wires the real SDK in. What it must do: at a message on the alarm topic, switch OFF — the three game
// functions to concurrency 0 and the API's default endpoint disabled — and email; switch ON only when the
// owner sends {"switch":"on"}; report, never act, on "status"; and fail visibly when a step did not take.
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeCloudSwitchHandler, readCommand, COMMAND } from "../backend/src/cloud-switch-api.mjs";

const logged = [];
console.log = (...a) => logged.push(["log", ...a]);
console.error = (...a) => logged.push(["error", ...a]);

const FNS = ["music-garden-ProgressFn-A", "music-garden-SongsFn-B", "music-garden-PreSignUpFn-C"];
const ALARM = "arn:aws:sns:us-east-1:123456789012:music-garden-CloudSwitchAlarmTopic-X";
const NOW = Date.parse("2026-11-20T12:00:00Z");
const CFG = { functions: FNS, onConcurrency: 2, alarmTopicArn: ALARM, staleMs: 3600e3, stepMs: 50 };
const sns = (over = {}, rec = {}) => ({ Records: [{ EventSource: "aws:sns", ...rec,
  Sns: { TopicArn: ALARM, Timestamp: new Date(NOW - 60e3).toISOString(), Subject: "AWS Budgets: budget has exceeded your alert threshold", Message: "…", ...over } }] });

/** A fake account: every function at `start` concurrency, the endpoint enabled. `fail` / `hang` name calls to break. */
function account({ start = 2, endpointDisabled = false, fail = {}, hang = {} } = {}) {
  const a = { conc: Object.fromEntries(FNS.map(f => [f, start])), endpointDisabled, writes: [], mails: [], reads: 0 };
  const act = (key, fn) => {
    if (hang[key]) return new Promise(() => {});
    if (fail[key]) return Promise.reject(new Error(`${key} denied`));
    return Promise.resolve().then(fn);
  };
  a.aws = {
    getConcurrency: fn => act("get:" + fn, () => { a.reads++; return a.conc[fn]; }),
    putConcurrency: (fn, n) => act("put:" + fn, () => { a.writes.push(["put", fn, n]); a.conc[fn] = n; }),
    getEndpointDisabled: () => act("getApi", () => { a.reads++; return a.endpointDisabled; }),
    setEndpointDisabled: d => act("setApi", () => { a.writes.push(["api", d]); a.endpointDisabled = d; }),
    notify: (subject, message) => act("notify", () => { a.mails.push({ subject, message }); }),
    now: () => NOW,
  };
  return a;
}
const OFF_WRITES = [...FNS.map(f => ["put", f, 0]), ["api", true]];
const ON_WRITES = [...FNS.map(f => ["put", f, 2]), ["api", false]];

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

test("the owner's on, off and status commands", async () => {
  const a = account({ start: 0, endpointDisabled: true });
  const h = makeCloudSwitchHandler(a.aws, CFG);
  const before = await h({ switch: "status" });
  assert.deepEqual(a.writes, []); assert.equal(a.mails.length, 0);
  assert.equal(before.cloud, "off");
  const on = await h({ switch: "on" });
  assert.deepEqual(a.writes, ON_WRITES);
  assert.equal(on.cloud, "on"); assert.equal(on.done, true);
  assert.equal(a.mails[0].subject, "Tune Garden: the cloud is switched back ON");
  assert.match(a.mails[0].message, /does not trip again this month/);
  a.writes.length = 0;
  const off = await h({ switch: "off" });
  assert.deepEqual(a.writes, OFF_WRITES); assert.equal(off.cloud, "off");
  assert.match(a.mails[1].message, /Why: the owner's command/);
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

test("a trip published over an hour ago cannot undo the owner's later switch-on", async () => {
  for (const ts of [new Date(NOW - 3600e3 - 1000).toISOString(), new Date(NOW - 3 * 86400e3).toISOString(), "not a date", undefined]) {
    const a = account();   // the owner switched back on; an old delivery arrives
    const r = await makeCloudSwitchHandler(a.aws, CFG)(sns({ Timestamp: ts }));
    assert.equal(r.ignored, "old message", String(ts));
    assert.deepEqual(a.writes, []);
    assert.equal(a.mails.length, 1); assert.match(a.mails[0].subject, /old cost-switch message was ignored/);
  }
  const fresh = account();
  await makeCloudSwitchHandler(fresh.aws, CFG)(sns({ Timestamp: new Date(NOW - 3600e3 + 1000).toISOString() }));
  assert.deepEqual(fresh.writes, OFF_WRITES, "just inside the hour still trips");
  const stale = account({ fail: { notify: true } });
  const r = await makeCloudSwitchHandler(stale.aws, CFG)(sns({ Timestamp: "2026-01-01T00:00:00Z" }));
  assert.equal(r.ignored, "old message", "an old message is not retried even when its email fails");
});

test("one failing or hanging step does not stop the others; the email says so and the call fails", async () => {
  for (const broken of [{ fail: { ["put:" + FNS[1]]: true } }, { hang: { setApi: true } }, { fail: { ["put:" + FNS[2]]: true }, hang: { ["put:" + FNS[0]]: true } }]) {
    const a = account(broken);
    await assert.rejects(makeCloudSwitchHandler(a.aws, CFG)(sns()), /not every setting took/, JSON.stringify(broken));
    const ok = OFF_WRITES.filter(([k, f]) => !(broken.fail || {})["put:" + f] && !(broken.hang || {})["put:" + f]
      && !(k === "api" && (broken.hang || {}).setApi));
    assert.deepEqual(a.writes, ok, "every other step still ran");
    assert.equal(a.mails.length, 1, "the email still went");
    assert.match(a.mails[0].subject, /OFF — NOT COMPLETE/);
    assert.match(a.mails[0].message, /Steps that failed:/);
    assert.ok(a.mails[0].message.includes(COMMAND.off), "it says how to try again");
  }
});

test("switching on reports a step that did not take, too", async () => {
  const a = account({ start: 0, endpointDisabled: true, fail: { setApi: true } });
  await assert.rejects(makeCloudSwitchHandler(a.aws, CFG)({ switch: "on" }), /not every setting took/);
  assert.match(a.mails[0].subject, /back ON — NOT COMPLETE/);
  assert.match(a.mails[0].message, /API default endpoint: disabled/);
});

test("a setting that cannot be read back counts as not done", async () => {
  const a = account({ fail: { getApi: true } });
  await assert.rejects(makeCloudSwitchHandler(a.aws, CFG)(sns()), /not every setting took/);
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

test("readCommand on its own: only a fresh alarm-topic record is off", () => {
  assert.equal(readCommand(sns(), CFG, NOW).action, "off");
  assert.equal(readCommand({ switch: "status" }, CFG, NOW).action, "status");
  assert.ok(readCommand(sns({ Timestamp: new Date(NOW + 5 * 60e3).toISOString() }), CFG, NOW).stale, "a timestamp far in the future is not trusted");
  assert.equal(readCommand(sns({ Timestamp: new Date(NOW + 30e3).toISOString() }), CFG, NOW).action, "off", "a little clock skew is");
});
