// Completion sessions: proving a pass was HEARD, not merely started.
//
// `ev.played` is set inside start() before a single column has sounded — it means "playback was
// started from column 0". Q6 needs the opposite: that one revision of one version traversed its
// whole span at audible time. The pump books ahead of the audio clock, paintDue() admits entries
// 20ms early and coalesces a backlog, and stop() cannot tell a finished pass from an abandoned one.
// These tests pin the reducer that sidesteps all three.

import { test } from "node:test";
import assert from "node:assert";
import { loadGame } from "./harness.mjs";

const g = loadGame();
const SPAN = { start: 0, end: 16 };

const startEv = (over = {}) => ({
  type: "start", sessionId: "s1", runId: "r1", versionId: "A", editRev: 2,
  purpose: "play", span: SPAN, ...over,
});

/** Drive the pure reducer over a list of events, collecting every effect. */
function drive(events, state = g.completionInit()) {
  let s = state;
  const effects = [];
  for (const e of events) { const r = g.reduceCompletionSession(s, e); s = r.state; effects.push(...r.effects); }
  return { state: s, effects };
}

/** Book a full traversal of the span, then hit a boundary at `at`. */
function fullPass(at, { loops = false, sessionId = "s1", from = 0 } = {}) {
  const evs = [];
  for (let c = from; c < SPAN.end; c++) evs.push({ type: "book", sessionId, col: c });
  evs.push({ type: "boundary", sessionId, at, loops });
  return evs;
}

test("a booked boundary is not credited until the audio clock reaches it", () => {
  const before = drive([startEv(), ...fullPass(10), { type: "clock", now: 9.999 }]);
  assert.deepEqual(before.effects, [], "the lookahead books ahead of audible time — 1ms early is still early");

  const at = drive([startEv(), ...fullPass(10), { type: "clock", now: 10 }]);
  assert.strictEqual(at.effects.length, 1);
  assert.deepEqual(at.effects[0], { type: "completePass", runId: "r1", versionId: "A", editRev: 2, sessionId: "s1", purpose: "play" });
});

test("a pass counts only when the booking sequence actually covered the span", () => {
  const cases = {
    "skipped a column": [0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    "duplicated one": [0, 1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    "went backwards": [0, 1, 2, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    "stopped short": [0, 1, 2, 3, 4, 5, 6, 7],
    "only the last column": [15],
  };
  for (const [label, cols] of Object.entries(cases)) {
    const evs = [startEv(), ...cols.map(col => ({ type: "book", sessionId: "s1", col })),
                 { type: "boundary", sessionId: "s1", at: 1 }, { type: "clock", now: 5 }];
    assert.deepEqual(drive(evs).effects, [], label);
  }
  // …and the honest traversal does count, so the cases above are not passing by accident.
  assert.strictEqual(drive([startEv(), ...fullPass(1), { type: "clock", now: 5 }]).effects.length, 1);
});

test("a pass that begins away from the span's start never counts, however far it runs", () => {
  // ▶ with a bar range selected seeds booking at loopA(), not at 0.
  const evs = [startEv(), ...fullPass(1, { from: 8 }), { type: "clock", now: 5 }];
  assert.deepEqual(drive(evs).effects, [], "a mid-span start is a partial listen");
});

test("a looping pass that starts mid-span still counts on its next lap", () => {
  const evs = [
    startEv(),
    ...fullPass(1, { from: 8, loops: true }),   // the first lap started at 8 — no credit
    ...fullPass(2, { loops: true }),            // the wrap put booking back at 0 — this one counts
    { type: "clock", now: 5 },
  ];
  const { effects } = drive(evs);
  assert.strictEqual(effects.length, 1, "exactly the complete lap, not the partial one");
});

test("overdue loop boundaries emit one receipt each, in order, never coalesced", () => {
  const evs = [startEv(),
    ...fullPass(1, { loops: true }), ...fullPass(2, { loops: true }), ...fullPass(3, { loops: true }),
    { type: "clock", now: 10 }];   // one late drain covering all three
  const { effects, state } = drive(evs);
  assert.strictEqual(effects.length, 3, "paintDue coalesces a backlog to the last entry; this must not");
  assert.deepEqual(state.queue, [], "…and every due entry leaves the queue");
});

test("an edit mid-flight forfeits a boundary that was already booked", () => {
  const evs = [startEv(), ...fullPass(10),
    { type: "cancel", reason: "edit" },          // the transport keeps playing; the evidence does not
    { type: "clock", now: 20 }];
  assert.deepEqual(drive(evs).effects, [], "a pass booked from the old revision cannot credit the new one");
});

test("every cancel reason clears the session, and its stragglers stay inert", () => {
  for (const reason of ["stop", "navigation", "reset", "range-change", "replace", "edit"]) {
    const { state, effects } = drive([startEv(), ...fullPass(10), { type: "cancel", reason }]);
    assert.strictEqual(state.active, null, reason);
    assert.deepEqual(state.queue, [], reason);
    // events carrying the dead session id do nothing
    const after = drive([{ type: "book", sessionId: "s1", col: 0 },
                         { type: "boundary", sessionId: "s1", at: 1 },
                         { type: "clock", now: 99 }], state);
    assert.deepEqual(after.effects, [], reason + ": stragglers");
  }
});

test("retiming neither completes nor invalidates a pass", () => {
  const evs = [startEv(),
    ...[0, 1, 2, 3, 4, 5, 6, 7].map(col => ({ type: "book", sessionId: "s1", col })),
    { type: "retime", sessionId: "s1" },
    ...[8, 9, 10, 11, 12, 13, 14, 15].map(col => ({ type: "book", sessionId: "s1", col })),
    { type: "boundary", sessionId: "s1", at: 1 }, { type: "clock", now: 5 }];
  assert.strictEqual(drive(evs).effects.length, 1, "a tempo change mid-pass must not break the traversal");
});

test("a frozen clock never completes anything", () => {
  const suspended = drive([startEv(), ...fullPass(10),
    { type: "clock", now: 4 }, { type: "clock", now: 4 }, { type: "clock", now: 4 }]);
  assert.deepEqual(suspended.effects, [], "iOS freezes currentTime; repeated reads must not accumulate credit");
  const resumed = drive([{ type: "clock", now: 10 }], suspended.state);
  assert.strictEqual(resumed.effects.length, 1, "…and the receipt survives to be paid when time moves again");
});

test("an invalid start leaves no session at all", () => {
  for (const bad of [{ sessionId: "" }, { editRev: -1 }, { editRev: 1.5 }, { purpose: "scrub" },
                     { span: { start: 8, end: 16 } }, { span: { start: 0, end: 0 } }, { runId: "" }]) {
    const { state } = drive([startEv(bad)]);
    assert.strictEqual(state.active, null, JSON.stringify(bad));
  }
});

test("the receipt carries the identity captured at booking, not at drain time", () => {
  // A second session replaces the first; the first's queued entry must not be paid to the second.
  const first = drive([startEv(), ...fullPass(10)]);
  const second = drive([startEv({ sessionId: "s2", versionId: "B", editRev: 5 }),
                        ...fullPass(11, { sessionId: "s2" }), { type: "clock", now: 20 }], first.state);
  assert.strictEqual(second.effects.length, 1);
  assert.strictEqual(second.effects[0].sessionId, "s2");
  assert.strictEqual(second.effects[0].versionId, "B");
  assert.strictEqual(second.effects[0].editRev, 5);
});

test("packages and the Studio never open a completion session", () => {
  const g2 = loadGame({ fresh: true });
  g2.setPlayScope({ kind: "package", packageId: "footsteps" });
  assert.strictEqual(g2.beginCompletionSession(), null, "a package has no run to credit");
  g2.setPlayScope({ kind: "studio" });
  assert.strictEqual(g2.beginCompletionSession(), null, "nor does the Studio");
  assert.strictEqual(g2.activeCompletionSessionId(), null);
});
