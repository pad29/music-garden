// TUN-125: a level's opening melody — the call a Question & Answer level plays on entry, the phrase an echo level
// plays — is heard once per entry, however the level was opened or re-drawn. The game runs in the harness with a
// fake AudioContext that follows the browser's autoplay rule: a context made before the page has had a user gesture
// starts suspended, its clock frozen at 0, and resume() starts it only once the page has had one (sticky
// activation). Notes booked on a frozen clock are not lost: they all sound together the moment it runs. Every note
// the game books is recorded with the clock's state at booking, and nothing the game booked is ever cancelled, so
// "heard" is "booked".
//
// Two browser behaviours are modelled where they differ: `pendingResume` — a resume() called before any gesture
// stays pending and starts the clock at the next gesture (the Web Audio spec's pending resume promises; Chrome) —
// and without it, the clock starts only at a resume() made after a gesture. Tests that depend on it run in both.
// `interrupt()` / `recover()` stand in for iOS's "interrupted" state (a call, another app's audio).
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame } from "./harness.mjs";

const tick = () => new Promise(r => setImmediate(r));
const clone = x => JSON.parse(JSON.stringify(x));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const QA = "question-and-answer", CALM_BOLD = 5;   // Question & Answer 6/9, "Calm Reply, Bold Reply": two steps, the same call in each
const ECHO_PKG = "intro", ECHO_LVL = 4;            // Garden Basics 5/13, "Answer the Garden": three steps, an echo each
const RESUME_MODES = [["resume() before a gesture is dropped", false], ["resume() before a gesture waits for one", true]];

/** Anything at all: every property, call and construction is another one. Stands in for audio nodes. */
const any = () => new Proxy(function () {}, {
  get: (t, p) => (p === Symbol.toPrimitive ? () => 0 : p === "then" ? undefined : any()),
  apply: () => any(), construct: () => any(), set: () => true });

/** The browser's audio, as the autoplay policy has it. `page.gesture()` is a user activation (sticky). */
function browserAudio(w, { pendingResume }) {
  const page = { activated: false, contexts: [] };
  class FakeAudioContext {
    constructor() { this.state = page.activated ? "running" : "suspended"; this.currentTime = 0; this.ls = []; this.wants = false; page.contexts.push(this); }
    run() { this.state = "running"; this.wants = false;
      Promise.resolve().then(() => { for (const fn of this.ls) fn({ type: "statechange" }); }); }
    resume() { if (this.state === "running" || this.state === "interrupted") return Promise.resolve();   // iOS: only the system ends an interruption
      if (page.activated) this.run(); else if (pendingResume) this.wants = true;
      return Promise.resolve(); }
    addEventListener(type, fn) { if (type === "statechange") this.ls.push(fn); }
    removeEventListener(type, fn) { this.ls = this.ls.filter(f => f !== fn); }
    interrupt() { this.state = "interrupted"; for (const fn of this.ls) fn({ type: "statechange" }); }
    recover() { this.run(); }
  }
  w.AudioContext = new Proxy(FakeAudioContext, { construct: (T, a) => new Proxy(new T(...a), {
    get: (o, p) => (p in o ? o[p] : any()), set: (o, p, v) => { o[p] = v; return true; } }) });
  w.webkitAudioContext = w.AudioContext;
  page.gesture = () => { page.activated = true; for (const c of page.contexts) if (c.wants) c.run(); };
  return page;
}

/** The 350 ms opening timers, held until the test lets them fire; every other timer runs as usual. */
function openingTimers(w) {
  const q = [], real = { set: w.setTimeout, clear: w.clearTimeout };
  w.setTimeout = (fn, ms, ...a) => { if (ms !== 350) return real.set(fn, ms, ...a);
    const t = { fn, a, live: true }; q.push(t); return t; };
  w.clearTimeout = t => { if (t && q.includes(t)) t.live = false; else real.clear(t); };
  return { fire() { const due = q.splice(0); for (const t of due) if (t.live) t.fn(...t.a); } };
}

const progressOn = (pkg, level, extra = {}) => ({ v: 1, name: "Ann", current: pkg, updatedAt: 1, companion: { type: "sprout" },
  packages: { [pkg]: { level, maxLevel: level, completed: false } }, settings: { speak: false }, ...extra });
const button = () => ({ onclick: null, style: {}, textContent: "", classList: { toggle() {}, add() {}, remove() {} } });

/**
 * A page load. `progress` is the save on this device (none: a fresh visitor). `session` stands in a signed-in
 * session at load, whose cloud pull waits for `cloud.resolve(progress)`. Returns the game, the page's audio, the
 * opening timers, the Listen / Next / Home / Loop buttons and `notes` — every note booked, as `{ freq, t, state }`.
 */
function pageLoad({ progress = null, session = false, pendingResume = false } = {}) {
  const listen = button(), next = button(), home = button(), loop = button(), homeoverlay = { style: { display: "none" } };
  const cloud = deferred(); let page, timers;
  const g = loadGame({ fresh: true, elements: { listen, nextBtn: next, home, loop, homeoverlay }, setup: w => {
    page = browserAudio(w, { pendingResume }); timers = openingTimers(w);
    if (progress) w.localStorage.setItem("mg_progress", JSON.stringify(progress));
    w.localStorage.setItem("mg_settings", JSON.stringify({ speak: false }));
    if (session) {
      const user = { getUsername: () => "ann", signOut() {},
        getSession: cb => cb(null, { isValid: () => true, getIdToken: () => ({ payload: { "cognito:username": "ann", sub: "sub-ann" }, getJwtToken: () => "token-ann" }) }) };
      w.AmazonCognitoIdentity = { CognitoUserPool: class { getCurrentUser() { return user; } } };
      w.fetch = async () => { const p = await cloud.promise; return { ok: true, status: 200, json: async () => clone(p) }; };
    }
  } });
  const notes = [];
  g.voice = (instr, freq, t) => { notes.push({ freq, t, state: g.actx && g.actx.state }); };
  const tap = () => { page.gesture(); g.initAudio(); g.actx.resume(); };   // a tap on the field: grid.js's first-gesture unlock
  return { g, page, timers, listen, next, home, loop, homeoverlay, notes, cloud, tap };
}
/** How many whole copies of `phrase` the booked notes hold (and that they hold nothing else). */
function copies(g, notes, phrase) {
  const want = phrase.map(([r]) => g.midiToFreq(g.MIDI[r])).sort((a, b) => a - b);
  const got = notes.map(n => n.freq);
  const n = Math.floor(got.length / want.length);
  assert.equal(got.length, n * want.length, `only whole copies of the phrase were booked (got ${got.length} notes for a ${want.length}-note phrase)`);
  const sorted = got.slice().sort((a, b) => a - b), expect = [];
  for (const f of want) for (let i = 0; i < n; i++) expect.push(f);
  assert.deepEqual(sorted, expect.sort((a, b) => a - b), "the notes are the phrase's, nothing else");
  return n;
}
/** Exactly one copy, every note of it booked on a running clock. */
function onceRunning(g, notes, phrase) {
  assert.equal(copies(g, notes, phrase), 1);
  assert.deepEqual(notes.filter(n => n.state !== "running"), [], "nothing booked on a clock that was not running");
}
const callOnField = (g, call) => call.every(([r, c]) => g.grid[r][c]);
const settle = async () => { for (let i = 0; i < 6; i++) await tick(); };
const openOn = (g, pkg, level, step = 0) => { g.setPlayScope({ kind: "package", packageId: pkg }, { levelIdx: level }); g.lessonStepIdx = step; };
/** Finish the current Question & Answer step the way a player does: its worked answer (Hint), then ▶ Play. */
function finishStep(g, next, notes) {
  g.curStage().hint(); g.start(); g.stop(); g.checkLevel();
  assert.equal(next.style.display, "", "Next is showing");
  notes.length = 0;   // the sweep's own notes
}

// ---- Re-drawing a level ------------------------------------------------------------------------------------------

test("a level drawn twice in a row (as a sign-in's cloud load does) plays its opening call once, and the call is on the field", async () => {
  const { g, timers, notes, tap } = pageLoad({ progress: progressOn("intro", 0) });
  tap(); timers.fire(); notes.length = 0;
  openOn(g, QA, CALM_BOLD); g.renderLevel(); g.renderLevel();
  timers.fire(); await settle();
  onceRunning(g, notes, g.curCall());
  assert.ok(callOnField(g, g.curCall()));
});

test("an echo level drawn twice in a row plays its phrase once", async () => {
  const { g, timers, notes, tap } = pageLoad({ progress: progressOn("intro", 0) });
  tap(); timers.fire(); notes.length = 0;
  openOn(g, ECHO_PKG, ECHO_LVL); g.renderLevel(); g.renderLevel();
  timers.fire(); await settle();
  onceRunning(g, notes, g.curStage().echo);
});

test("a signed-in reload, a tap before the cloud answers: the call already played is not played again by the cloud's redraw", async () => {
  // The clock runs (the tap, or a browser that allows autoplay), the local draw's call plays at 350 ms, and the cloud
  // answer lands later on the same stage. Its redraw places the call again and plays nothing; step 2 — the same notes,
  // another stage — still plays its own.
  const save = progressOn(QA, CALM_BOLD);
  const { g, timers, notes, cloud, tap, next } = pageLoad({ progress: save, session: true });
  await settle(); tap(); timers.fire(); await settle();
  onceRunning(g, notes, g.curCall());
  cloud.resolve({ ...save, updatedAt: 2 }); await settle();
  assert.equal(g.cloudSync, "ready", "the cloud progress loaded");
  timers.fire(); await settle();
  onceRunning(g, notes, g.curCall());
  assert.ok(callOnField(g, g.curCall()), "the redraw placed the call again");
  finishStep(g, next, notes); next.onclick(); timers.fire(); await settle();
  assert.equal(g.lessonStepIdx, 1);
  onceRunning(g, notes, g.curCall());
});

// ---- Reloading the page, before any gesture -----------------------------------------------------------------------

for (const [mode, pendingResume] of RESUME_MODES) {
  test(`a signed-in reload on Question & Answer 6/9: nothing before the first tap, then the call once (${mode})`, async () => {
    // The boot draw (this device's save) and the cloud load's draw (the account's) are both on 6/9, and both come
    // before the page has had a gesture: the context is suspended, its clock frozen.
    const save = progressOn(QA, CALM_BOLD);
    const { g, page, timers, notes, cloud, tap } = pageLoad({ progress: save, session: true, pendingResume });
    await settle(); timers.fire();
    cloud.resolve({ ...save, updatedAt: 2 }); await settle();
    assert.equal(g.cloudSync, "ready", "the cloud progress loaded");
    timers.fire(); await settle();
    assert.equal(page.contexts.every(c => c.state === "suspended"), true, "no gesture yet: nothing can sound");
    assert.deepEqual(notes, [], "nothing booked on the frozen clock");
    tap(); await settle();
    onceRunning(g, notes, g.curCall());
  });

  test(`a guest's reload on Question & Answer 6/9, then Listen as the first gesture: the call once (${mode})`, async () => {
    const { g, page, timers, notes, listen } = pageLoad({ progress: progressOn(QA, CALM_BOLD), pendingResume });
    timers.fire(); await settle();
    assert.deepEqual(notes, []);
    page.gesture(); listen.onclick(); await settle();
    assert.equal(copies(g, notes, g.curCall()), 1);
  });

  test(`a guest's reload on Question & Answer 6/9, then a tap on the field: nothing before, the call once at the tap (${mode})`, async () => {
    const { g, timers, notes, tap } = pageLoad({ progress: progressOn(QA, CALM_BOLD), pendingResume });
    timers.fire(); await settle();
    assert.deepEqual(notes, [], "nothing booked before the gesture");
    tap(); await settle();
    onceRunning(g, notes, g.curCall());
  });

  test(`a guest's reload on 6/9, then 🔁 Loop as the first gesture (it starts no audio): never two copies (${mode})`, async () => {
    // Loop only toggles a flag. Where an early resume() waits for a gesture, the clock starts at the Loop press and
    // the call plays then; where it does not, the call waits for the next gesture that starts the clock.
    const { g, page, timers, notes, loop, tap } = pageLoad({ progress: progressOn(QA, CALM_BOLD), pendingResume });
    timers.fire(); await settle();
    page.gesture(); loop.onclick(); await settle();
    if (pendingResume) onceRunning(g, notes, g.curCall()); else assert.deepEqual(notes, []);
    tap(); await settle();
    onceRunning(g, notes, g.curCall());
  });

  test(`a guest's reload on 6/9, then Home → another package: 6/9's call never plays there (${mode})`, async () => {
    const { g, timers, notes, home, tap } = pageLoad({ progress: progressOn(QA, CALM_BOLD), pendingResume });
    timers.fire(); await settle();
    home.onclick(); g.openPkg("intro", 0);   // Garden Basics 1/13: no opening melody
    timers.fire(); tap(); await settle();
    assert.deepEqual(notes, [], "no call from the level the player left");
  });
}

test("a signed-in reload on 6/9 whose cloud save is on another level: only that level's melody, once", async () => {
  const { g, timers, notes, cloud, tap } = pageLoad({ progress: progressOn(QA, CALM_BOLD), session: true });
  await settle(); timers.fire();
  cloud.resolve(progressOn(ECHO_PKG, ECHO_LVL, { updatedAt: 2 })); await settle();
  timers.fire(); tap(); await settle();
  assert.equal(g.levelIdx, ECHO_LVL, "the cloud's level");
  onceRunning(g, notes, g.curStage().echo);
});

// ---- Home, ▶ Play and an interrupted clock ------------------------------------------------------------------------

test("🏠 Home opened before the call starts: silence on the map, and coming back to the level plays it anew", async () => {
  const { g, timers, notes, home, tap } = pageLoad({ progress: progressOn("intro", 0) });
  tap(); timers.fire(); notes.length = 0;
  g.openPkg(QA, CALM_BOLD); home.onclick();   // inside the 350 ms, and the map stays open
  timers.fire(); await settle();
  assert.deepEqual(notes, [], "nothing while Home is up");
  g.openPkg(QA, CALM_BOLD); timers.fire(); await settle();
  onceRunning(g, notes, g.curCall());
});

test("🏠 Home opened while the call waits for the first gesture: the gesture on Home plays nothing", async () => {
  const { g, timers, notes, home, tap } = pageLoad({ progress: progressOn(QA, CALM_BOLD) });
  timers.fire(); await settle();
  home.onclick(); tap(); await settle();
  assert.deepEqual(notes, []);
});

test("▶ Play pressed before the opening call starts — kept playing, or stopped again: no opening copy either way", async () => {
  for (const stopFirst of [false, true]) {
    const { g, timers, tap } = pageLoad({ progress: progressOn("intro", 0) });
    tap(); timers.fire();
    openOn(g, QA, CALM_BOLD); g.renderLevel();
    const phrases = []; const real = g.playPhrase; g.playPhrase = n => { phrases.push(n); real(n); };
    g.start(); if (stopFirst) g.stop();
    timers.fire(); await settle(); g.stop();
    assert.deepEqual(phrases, [], stopFirst ? "Play then Stop inside the 350 ms" : "Play inside the 350 ms");
  }
});

test("▶ Play as the first gesture while the call waits — kept playing, or stopped again before the clock runs: no opening copy", async () => {
  for (const stopFirst of [false, true]) {
    const { g, timers, page } = pageLoad({ progress: progressOn(QA, CALM_BOLD) });
    timers.fire(); await settle();
    const phrases = []; const real = g.playPhrase; g.playPhrase = n => { phrases.push(n); real(n); };
    page.gesture(); g.start(); if (stopFirst) g.stop();   // the statechange to running lands after this
    await settle(); g.stop(); await settle();
    assert.deepEqual(phrases, [], stopFirst ? "Play then Stop" : "Play");
  }
});

test("an interrupted clock (iOS): nothing is booked during the interruption, even across a redraw; the call once after it", async () => {
  const { g, page, timers, notes, tap } = pageLoad({ progress: progressOn("intro", 0) });
  tap(); timers.fire(); notes.length = 0;
  page.contexts[0].interrupt();
  openOn(g, QA, CALM_BOLD); g.renderLevel(); timers.fire(); await settle();
  g.renderLevel(); timers.fire(); await settle();
  assert.deepEqual(notes, [], "nothing booked on an interrupted clock");
  page.contexts[0].recover(); await settle();
  onceRunning(g, notes, g.curCall());
  page.contexts[0].interrupt(); page.contexts[0].recover(); await settle();
  onceRunning(g, notes, g.curCall());   // a later interruption does not bring it back
});

// ---- Moving on, the way a player does — and forced transitions ---------------------------------------------------

test("a player's Next: 6/9 step 1 → step 2 (the same notes) → Next level onto 7/9, each opening once", async () => {
  const { g, timers, notes, tap, next } = pageLoad({ progress: progressOn("intro", 0) });
  tap(); timers.fire(); notes.length = 0;
  g.openPkg(QA, CALM_BOLD); timers.fire(); await settle();
  onceRunning(g, notes, g.curCall());
  finishStep(g, next, notes); next.onclick(); timers.fire(); await settle();
  assert.equal(g.lessonStepIdx, 1);
  onceRunning(g, notes, g.curCall());
  finishStep(g, next, notes); next.onclick(); timers.fire(); await settle();
  assert.equal(g.levelIdx, CALM_BOLD + 1, "7/9, Fix the Mismatch");
  onceRunning(g, notes, g.curCall());
});

// A player cannot reach the next stage inside 350 ms: Next shows only once the step's goals are met. These force the
// transition (the dev bar's jump, or the hidden button's handler) to show that no earlier stage's timer survives one.
test("a forced move to 6/9's second step inside the 350 ms: the second step's call, once", async () => {
  const { g, timers, notes, tap, next } = pageLoad({ progress: progressOn("intro", 0) });
  tap(); timers.fire(); notes.length = 0;
  openOn(g, QA, CALM_BOLD); g.renderLevel();
  next.onclick();
  assert.equal(g.lessonStepIdx, 1);
  timers.fire(); await settle();
  onceRunning(g, notes, g.curCall());
});

test("a forced move through an echo level's steps inside the 350 ms: only the current step's phrase", async () => {
  const { g, timers, notes, tap, next } = pageLoad({ progress: progressOn("intro", 0) });
  tap(); timers.fire(); notes.length = 0;
  openOn(g, ECHO_PKG, ECHO_LVL); g.renderLevel();
  next.onclick();
  timers.fire(); await settle();
  onceRunning(g, notes, g.curStage().echo);
});

test("a forced move from an echo level to another package inside the 350 ms: nothing plays", async () => {
  const { g, timers, notes, tap } = pageLoad({ progress: progressOn("intro", 0) });
  tap(); timers.fire(); notes.length = 0;
  openOn(g, ECHO_PKG, ECHO_LVL); g.renderLevel();
  g.openPkg(QA, 1);                       // Question & Answer 2/9: no opening melody
  timers.fire(); await settle();
  assert.deepEqual(notes, []);
});

// ---- The rest ----------------------------------------------------------------------------------------------------

test("a guest opening Question & Answer from Home onto 6/9: the call once", async () => {
  const { g, timers, notes, home, tap } = pageLoad({ progress: progressOn("intro", 0) });
  tap(); timers.fire(); notes.length = 0;
  home.onclick(); g.openPkg(QA, CALM_BOLD); timers.fire(); await settle();
  onceRunning(g, notes, g.curCall());
});

test("Listen plays the melody every time it is pressed", async () => {
  const { g, timers, notes, listen, tap } = pageLoad({ progress: progressOn(QA, CALM_BOLD) });
  tap(); timers.fire(); await settle();
  assert.equal(copies(g, notes, g.curCall()), 1, "the opening call");
  listen.onclick(); listen.onclick(); await settle();
  assert.equal(copies(g, notes, g.curCall()), 3, "and once per press");
});

test("a fresh visitor: nothing plays behind the landing screen and the buddy picker", async () => {
  const { g, timers, notes } = pageLoad();
  timers.fire(); await settle();
  g.pickCompanion("sprout"); timers.fire(); await settle();
  assert.deepEqual(notes, []);
});

test("every stage with an opening melody plays it once on entry, and every call is placed on the field", async () => {
  const { g, timers, notes, tap } = pageLoad({ progress: progressOn("intro", 0) });
  tap(); timers.fire();
  let seen = 0;
  for (const [id, P] of Object.entries(g.PACKAGES)) P.levels.forEach((L, i) => (L.steps || [L]).forEach((s, j) => {
    if (!s.echo && !s.call) return;
    notes.length = 0; openOn(g, id, i, j); g.renderLevel(); g.renderLevel(); timers.fire();
    assert.equal(copies(g, notes, s.echo || s.call), 1, `${P.name} ${i + 1} step ${j + 1}`);
    if (s.call) assert.ok(callOnField(g, s.call), `${P.name} ${i + 1}: the call is on the field`);
    seen++;
  }));
  assert.equal(seen, 10, "the ten stages with an opening melody (Garden Basics 5, Question & Answer 1, 3–7)");
});

test("openingFor: the same stage twice keeps one melody; another stage replaces it", async () => {
  const { g, timers, notes, tap } = pageLoad({ progress: progressOn("intro", 0) });
  tap(); timers.fire(); notes.length = 0;
  const a = {}, b = {};
  g.openingFor(a, [[3, 0]]); g.openingFor(a, [[4, 0]]); timers.fire();
  assert.deepEqual(notes.map(n => n.freq), [g.midiToFreq(g.MIDI[3])], "a redraw of the same stage: the first, once");
  notes.length = 0;
  g.openingFor(b, [[5, 0]]); g.openingFor(a, [[6, 0]]); timers.fire();
  assert.deepEqual(notes.map(n => n.freq), [g.midiToFreq(g.MIDI[6])], "another stage drops the pending one");
});
