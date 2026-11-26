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
function browserAudio(w, { pendingResume, noUserActivation }) {
  const page = { activated: false, contexts: [] };
  class FakeAudioContext {
    constructor() { this.state = page.activated ? "running" : "suspended"; this.currentTime = 0; this.ls = []; this.wants = false; page.contexts.push(this); }
    run() { this.state = "running"; this.wants = false;
      Promise.resolve().then(() => { for (const fn of this.ls) fn({ type: "statechange" }); }); }
    resume() { if (!("state" in this)) return Promise.resolve();   // a context too old to have a state has no statechange either
      if (this.state === "running" || this.state === "interrupted") return Promise.resolve();   // iOS: only the system ends an interruption
      if (page.activated) this.run(); else if (pendingResume) this.wants = true;
      return Promise.resolve(); }
    addEventListener(type, fn) { if (type === "statechange") this.ls.push(fn); }
    removeEventListener(type, fn) { this.ls = this.ls.filter(f => f !== fn); }
    interrupt() { this.state = "interrupted"; for (const fn of this.ls) fn({ type: "statechange" }); }
    recover() { this.run(); }
  }
  w.AudioContext = new Proxy(FakeAudioContext, { construct: (T, a) => new Proxy(new T(...a), {
    get: (o, p) => (p in o || p === "state" ? o[p] : any()), set: (o, p, v) => { o[p] = v; return true; } }) });
  w.webkitAudioContext = w.AudioContext;
  page.gesture = () => { page.activated = true; for (const c of page.contexts) if (c.wants) c.run(); };
  if (!noUserActivation) w.navigator = { ...w.navigator, userActivation: { get hasBeenActive() { return page.activated; } } };
  return page;
}

/**
 * The 350 ms timers (the opening's, and the power card's reveal), on a clock of their own: `advance(ms)` runs those
 * due by then, in deadline order; `fire()` runs every one, including any a run sets. Other timers run as usual.
 */
function openingTimers(w) {
  let q = [], now = 0; const real = { set: w.setTimeout, clear: w.clearTimeout };
  w.setTimeout = (fn, ms, ...a) => { if (ms !== 350) return real.set(fn, ms, ...a);
    const t = { fn, a, due: now + ms, live: true }; q.push(t); return t; };
  w.clearTimeout = t => { if (t && q.includes(t)) t.live = false; else real.clear(t); };
  const advance = ms => { const end = now + ms;
    for (;;) { const t = q.filter(x => x.live && x.due <= end).sort((x, y) => x.due - y.due)[0];
      if (!t) break; now = t.due; t.live = false; t.fn(...t.a); }
    now = end; q = q.filter(x => x.live); };
  return { advance, fire() { for (let i = 0; i < 20 && q.some(x => x.live); i++) advance(1e6); } };
}

const progressOn = (pkg, level, extra = {}) => ({ v: 1, name: "Ann", current: pkg, updatedAt: 1, companion: { type: "sprout" },
  packages: { [pkg]: { level, maxLevel: level, completed: false } }, settings: { speak: false }, ...extra });
const button = () => { const ls = {};
  return { onclick: null, style: {}, textContent: "", classList: { toggle() {}, add() {}, remove() {} },
    addEventListener(type, fn) { (ls[type] ||= []).push(fn); }, fire(type) { for (const fn of ls[type] || []) fn({ type }); } }; };

/**
 * A page load. `progress` is the save on this device (none: a fresh visitor). `session` stands in a signed-in
 * session at load, whose cloud pull waits for `cloud.resolve(progress)`. Returns the game, the page's audio, the
 * opening timers, the Listen / Next / Home / Loop buttons and `notes` — every note booked, as `{ freq, t, state }`.
 */
function pageLoad({ progress = null, session = false, pendingResume = false, noUserActivation = false } = {}) {
  const listen = button(), next = button(), home = button(), loop = button(), play = button(), jam = button(), homeclose = button();
  const homeoverlay = { style: { display: "none" }, onclick: null };
  const cloud = deferred(); let page, timers;
  const g = loadGame({ fresh: true, elements: { listen, nextBtn: next, home, loop, play, jam, homeclose, homeoverlay }, setup: w => {
    page = browserAudio(w, { pendingResume, noUserActivation }); timers = openingTimers(w);
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
  /** The first tap, and then the opening's pause after the clock starts. */
  const unlock = async () => { tap(); await settle(); timers.fire(); await settle(); };
  return { g, page, timers, listen, next, home, loop, play, jam, homeclose, homeoverlay, notes, cloud, tap, unlock };
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
async function settle() { for (let i = 0; i < 6; i++) await tick(); }
const openOn = (g, pkg, level, step = 0) => { g.setPlayScope({ kind: "package", packageId: pkg }, { levelIdx: level }); g.lessonStepIdx = step; };
/** Finish the current Question & Answer step the way a player does: its worked answer (Hint), then ▶ Play and ■ Stop. */
function finishStep(g, next, notes, play) {
  g.curStage().hint(); play.onclick(); assert.equal(g.playing, true, "▶ started the field"); play.onclick(); g.checkLevel();
  assert.equal(next.style.display, "", "Next is showing");
  notes.length = 0;   // the sweep's own notes
}

// ---- Re-drawing a level ------------------------------------------------------------------------------------------

test("a level drawn twice in a row (as a sign-in's cloud load does) plays its opening call once, and the call is on the field", async () => {
  const { g, timers, notes, unlock } = pageLoad({ progress: progressOn("intro", 0) });
  await unlock(); notes.length = 0;
  openOn(g, QA, CALM_BOLD); g.renderLevel(); g.renderLevel();
  timers.fire(); await settle();
  onceRunning(g, notes, g.curCall());
  assert.ok(callOnField(g, g.curCall()));
});

test("an echo level drawn twice in a row plays its phrase once", async () => {
  const { g, timers, notes, unlock } = pageLoad({ progress: progressOn("intro", 0) });
  await unlock(); notes.length = 0;
  openOn(g, ECHO_PKG, ECHO_LVL); g.renderLevel(); g.renderLevel();
  timers.fire(); await settle();
  onceRunning(g, notes, g.curStage().echo);
});

test("a signed-in reload, a tap before the cloud answers: the call already played is not played again by the cloud's redraw", async () => {
  // The clock runs (the tap, or a browser that allows autoplay), the local draw's call plays at 350 ms, and the cloud
  // answer lands later on the same stage. Its redraw places the call again and plays nothing; step 2 — the same notes,
  // another stage — still plays its own.
  const save = progressOn(QA, CALM_BOLD);
  const { g, timers, notes, cloud, tap, next, play } = pageLoad({ progress: save, session: true });
  await settle(); tap(); timers.fire(); await settle();
  onceRunning(g, notes, g.curCall());
  cloud.resolve({ ...save, updatedAt: 2 }); await settle();
  assert.equal(g.cloudSync, "ready", "the cloud progress loaded");
  timers.fire(); await settle();
  onceRunning(g, notes, g.curCall());
  assert.ok(callOnField(g, g.curCall()), "the redraw placed the call again");
  finishStep(g, next, notes, play); next.onclick(); timers.fire(); await settle();
  assert.equal(g.lessonStepIdx, 1);
  onceRunning(g, notes, g.curCall());
});

// ---- Reloading the page, before any gesture -----------------------------------------------------------------------

// The owner, 2026-11-25, after playtesting the first build of this: "it feels strange that it plays together with me
// planting a seed... I think it should either play once on refresh, or not play at all." So after a reload the
// opening plays only if the clock already runs; otherwise it stays silent, and no later tap or click starts it.
for (const [mode, pendingResume] of RESUME_MODES) {
  test(`a signed-in reload on Question & Answer 6/9: the boot's and the cloud's draws, then a tap — silent; Listen once (${mode})`, async () => {
    // Both draws come before the page has had a gesture: the context is suspended, its clock frozen.
    const save = progressOn(QA, CALM_BOLD);
    const { g, page, timers, notes, cloud, unlock, listen } = pageLoad({ progress: save, session: true, pendingResume });
    await settle(); timers.fire();
    cloud.resolve({ ...save, updatedAt: 2 }); await settle();
    assert.equal(g.cloudSync, "ready", "the cloud progress loaded");
    timers.fire(); await settle();
    assert.equal(page.contexts.every(c => c.state === "suspended"), true, "no gesture yet: nothing can sound");
    await unlock();
    assert.deepEqual(notes, [], "the first tap does not start the opening");
    listen.onclick(); await settle();
    onceRunning(g, notes, g.curCall());
  });

  test(`a guest's reload on Question & Answer 6/9, then Listen as the first gesture: the call once (${mode})`, async () => {
    // A press: activation comes at pointer-down, and the clock may start before the click lands.
    const { g, page, timers, notes, listen } = pageLoad({ progress: progressOn(QA, CALM_BOLD), pendingResume });
    timers.fire(); await settle();
    assert.deepEqual(notes, []);
    listen.fire("pointerdown"); page.gesture(); await settle();
    listen.onclick(); await settle();
    timers.fire(); await settle();
    assert.equal(copies(g, notes, g.curCall()), 1);
  });

  test(`a guest's reload on Question & Answer 6/9, then a tap on the field, ▶ Loop or a seed: the call stays silent (${mode})`, async () => {
    const { g, page, timers, notes, loop, unlock } = pageLoad({ progress: progressOn(QA, CALM_BOLD), pendingResume });
    timers.fire(); await settle();
    assert.deepEqual(notes, [], "nothing booked before the gesture");
    page.gesture(); loop.onclick(); await settle(); timers.fire(); await settle();
    await unlock();
    assert.deepEqual(notes, [], "nothing at the first gesture, nor later");
  });

  test(`a guest's reload on 6/9, then Home → another package: 6/9's call never plays there (${mode})`, async () => {
    const { g, timers, notes, home, unlock } = pageLoad({ progress: progressOn(QA, CALM_BOLD), pendingResume });
    timers.fire(); await settle();
    home.onclick(); g.openPkg("intro", 0);   // Garden Basics 1/13: no opening melody
    await unlock();
    assert.deepEqual(notes, [], "no call from the level the player left");
  });
}

test("a reload where the browser lets the clock run at once (autoplay allowed): the call plays once, with no tap", async () => {
  const { g, page, timers, notes } = pageLoad({ progress: progressOn(QA, CALM_BOLD) });
  g.initAudio(); page.contexts[0].state = "running";             // the browser started it
  timers.fire(); await settle();
  onceRunning(g, notes, g.curCall());
});

test("a signed-in reload on 6/9, a tap, then the cloud save lands on another level: that level's melody, once", async () => {
  const { g, timers, notes, cloud, tap } = pageLoad({ progress: progressOn(QA, CALM_BOLD), session: true });
  await settle(); timers.fire();                                  // 6/9's call: dropped, before any gesture
  tap(); await settle();
  cloud.resolve(progressOn(ECHO_PKG, ECHO_LVL, { updatedAt: 2 })); await settle();
  timers.fire(); await settle();
  assert.equal(g.levelIdx, ECHO_LVL, "the cloud's level");
  onceRunning(g, notes, g.curStage().echo);
});

// ---- 🏠 Home ----------------------------------------------------------------------------------------------------

test("🏠 Home opened before the call starts: silence on the map; Close brings the player back to it, once, field as it was", async () => {
  const { g, timers, notes, home, homeclose, unlock } = pageLoad({ progress: progressOn("intro", 0) });
  await unlock(); notes.length = 0;
  g.openPkg(QA, CALM_BOLD); g.setCell(3, 12, true); home.onclick();   // a seed of the player's, then the map, inside the 350 ms
  timers.fire(); await settle();
  assert.deepEqual(notes, [], "nothing while Home is up");
  homeclose.onclick(); timers.fire(); await settle();
  onceRunning(g, notes, g.curCall());
  assert.ok(g.grid[3][12] && callOnField(g, g.curCall()), "the field as the player left it");
  home.onclick(); homeclose.onclick(); timers.fire(); await settle();
  onceRunning(g, notes, g.curCall());   // heard already: Home and back does not replay it
});

test("🏠 Home, then the backdrop, or the same level again from Home: the call once each", async () => {
  const { g, timers, notes, home, homeoverlay, unlock } = pageLoad({ progress: progressOn("intro", 0) });
  await unlock(); notes.length = 0;
  g.openPkg(QA, CALM_BOLD); home.onclick(); timers.fire();
  homeoverlay.onclick({ target: homeoverlay }); timers.fire(); await settle();
  onceRunning(g, notes, g.curCall()); notes.length = 0;
  home.onclick(); g.openPkg(QA, CALM_BOLD); timers.fire(); await settle();
  onceRunning(g, notes, g.curCall());   // opening the package from Home is a new entry
});

test("a reload on 6/9, then 🏠 Home and Close (clicks): still silent — Home is not the opening's cue; Listen plays it", async () => {
  for (const pendingResume of [false, true]) {
    const { g, page, timers, notes, home, homeclose, listen } = pageLoad({ progress: progressOn(QA, CALM_BOLD), pendingResume });
    timers.fire(); await settle();
    page.gesture(); home.onclick(); page.gesture(); homeclose.onclick(); await settle(); timers.fire(); await settle();
    assert.deepEqual(notes, [], pendingResume ? "an early resume() kept pending" : "an early resume() dropped");
    listen.onclick(); await settle();
    assert.equal(copies(g, notes, g.curCall()), 1);
  }
});

for (const then of ["stays on Home", "enters a quest", "continues 6/9 from Home"]) {
  test(`a cloud load lands on 6/9 behind an open Home, and the player ${then}: never on the map, never in the quest`, async () => {
    const { g, timers, notes, cloud, home, tap } = pageLoad({ progress: progressOn("intro", 0), session: true });
    await settle(); tap(); timers.fire(); await settle();
    home.onclick();
    cloud.resolve(progressOn(QA, CALM_BOLD, { updatedAt: 2 })); await settle();
    assert.equal(g.levelIdx, CALM_BOLD, "the cloud's level is drawn behind Home");
    if (then === "enters a quest") {
      const rng = g.questRng; g.questRng = () => rng("fixture-4");
      g.leaveHome();                       // what Home's quest row does before it starts the run
      assert.equal(g.startQuestRun("firefly-crossing").ok, true);
    }
    if (then === "continues 6/9 from Home") g.openPkg(QA, CALM_BOLD);
    timers.fire(); await settle();
    if (then === "continues 6/9 from Home") onceRunning(g, notes, g.curCall());
    else assert.deepEqual(notes, []);
  });
}

// ---- ▶ Play, Jam, a scripted start, and an interrupted clock --------------------------------------------------------

test("the ▶ Play button pressed before the opening call starts — kept playing, or stopped again: no opening copy", async () => {
  for (const stopFirst of [false, true]) {
    const { g, timers, play, unlock } = pageLoad({ progress: progressOn("intro", 0) });
    await unlock();
    openOn(g, QA, CALM_BOLD); g.renderLevel();
    const phrases = []; const real = g.playPhrase; g.playPhrase = n => { phrases.push(n); real(n); };
    play.onclick(); if (stopFirst) play.onclick();
    timers.fire(); await settle(); g.stop();
    assert.deepEqual(phrases, [], stopFirst ? "Play then Stop inside the 350 ms" : "Play inside the 350 ms");
  }
});

test("the ▶ Play button as the first gesture while the call waits — kept playing, or stopped again: no opening copy", async () => {
  for (const stopFirst of [false, true]) {
    const { g, timers, page, play } = pageLoad({ progress: progressOn(QA, CALM_BOLD) });
    timers.fire(); await settle();
    const phrases = []; const real = g.playPhrase; g.playPhrase = n => { phrases.push(n); real(n); };
    page.gesture(); play.onclick(); if (stopFirst) play.onclick();   // the statechange to running lands after this
    await settle(); timers.fire(); await settle(); g.stop(); await settle();
    assert.deepEqual(phrases, [], stopFirst ? "Play then Stop" : "Play");
  }
});

test("a scripted start (a power card's reveal) or 🎸 Jam on and off does not spend the opening: the echo once", async () => {
  for (const how of ["scripted start", "jam"]) {
    const { g, timers, notes, jam, unlock } = pageLoad({ progress: progressOn("intro", 0) });
    await unlock();
    openOn(g, ECHO_PKG, ECHO_LVL); g.renderLevel();
    if (how === "jam") { jam.onclick(); jam.onclick(); } else { g.start(); g.stop(); }
    await settle(); notes.length = 0;          // the transport's own notes
    timers.fire(); await settle();
    onceRunning(g, notes, g.curStage().echo);
  }
});

test("a power card's reveal left over from the level before, firing on the echo stage: the echo still once", async () => {
  const { g, timers, notes, unlock } = pageLoad({ progress: progressOn("intro", 0) });
  await unlock();
  g.pendingReveal = () => { g.start(); g.stop(); }; g.closePow();   // its 350 ms reveal is queued…
  openOn(g, ECHO_PKG, ECHO_LVL); g.renderLevel();                    // …and the cloud draws the echo stage
  notes.length = 0;
  timers.fire(); await settle();
  onceRunning(g, notes, g.curStage().echo);
});

test("an interrupted clock (iOS): the opening is dropped, a redraw does not bring it back, nor does the recovery; Listen plays it", async () => {
  const { g, page, timers, notes, listen, unlock } = pageLoad({ progress: progressOn("intro", 0) });
  await unlock(); notes.length = 0;
  page.contexts[0].interrupt();
  openOn(g, QA, CALM_BOLD); g.renderLevel(); timers.fire(); await settle();
  g.renderLevel(); timers.fire(); await settle();
  assert.deepEqual(notes, [], "nothing booked on an interrupted clock");
  page.contexts[0].recover(); await settle(); timers.fire(); await settle();
  assert.deepEqual(notes, [], "the recovery is not the opening's cue");
  listen.onclick(); await settle();
  onceRunning(g, notes, g.curCall());
});

// ---- Moving on, the way a player does — and forced transitions ---------------------------------------------------

test("a player's Next: 6/9 step 1 → step 2 (the same notes) → Next level onto 7/9, each opening once", async () => {
  const { g, timers, notes, next, play, unlock } = pageLoad({ progress: progressOn("intro", 0) });
  await unlock(); notes.length = 0;
  g.openPkg(QA, CALM_BOLD); timers.fire(); await settle();
  onceRunning(g, notes, g.curCall());
  finishStep(g, next, notes, play); next.onclick(); timers.fire(); await settle();
  assert.equal(g.lessonStepIdx, 1);
  onceRunning(g, notes, g.curCall());
  finishStep(g, next, notes, play); next.onclick(); timers.fire(); await settle();
  assert.equal(g.levelIdx, CALM_BOLD + 1, "7/9, Fix the Mismatch");
  onceRunning(g, notes, g.curCall());
});

// A player cannot reach the next stage inside 350 ms: Next shows only once the step's goals are met. These force the
// transition (the dev bar's jump, or the hidden button's handler) to show that no earlier stage's timer survives one.
test("a forced move to 6/9's second step 200 ms in: nothing at step 1's deadline, step 2's call once at its own", async () => {
  const { g, timers, notes, next, unlock } = pageLoad({ progress: progressOn("intro", 0) });
  await unlock(); notes.length = 0;
  openOn(g, QA, CALM_BOLD); g.renderLevel();
  timers.advance(200); next.onclick();
  assert.equal(g.lessonStepIdx, 1);
  timers.advance(150); await settle();
  assert.deepEqual(notes, [], "step 1's deadline: nothing");
  timers.advance(200); await settle();
  onceRunning(g, notes, g.curCall());
});

test("a forced move through an echo level's steps inside the 350 ms: only the current step's phrase", async () => {
  const { g, timers, notes, next, unlock } = pageLoad({ progress: progressOn("intro", 0) });
  await unlock(); notes.length = 0;
  openOn(g, ECHO_PKG, ECHO_LVL); g.renderLevel();
  next.onclick();
  timers.fire(); await settle();
  onceRunning(g, notes, g.curStage().echo);
});

test("a forced draw of a stage with no melody, while the echo is pending or waiting: nothing plays", async () => {
  for (const waiting of [false, true]) {
    const { g, page, timers, notes, unlock } = pageLoad({ progress: progressOn("intro", 0) });
    await unlock(); notes.length = 0;
    openOn(g, ECHO_PKG, ECHO_LVL); g.renderLevel();
    if (waiting) { page.contexts[0].interrupt(); timers.fire(); }   // held: the clock is not running
    openOn(g, QA, 1); g.renderLevel();                               // the dev bar's jump to Question & Answer 2/9
    if (waiting) page.contexts[0].recover();
    await settle(); timers.fire(); await settle();
    assert.deepEqual(notes, [], waiting ? "the held echo" : "the pending echo");
  }
});

test("a forced move from an echo level to another package inside the 350 ms: nothing plays", async () => {
  const { g, timers, notes, unlock } = pageLoad({ progress: progressOn("intro", 0) });
  await unlock(); notes.length = 0;
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
  const { g, timers, notes, unlock } = pageLoad({ progress: progressOn("intro", 0) });
  await unlock(); notes.length = 0;
  const a = {}, b = {};
  g.openingFor(a, [[3, 0]]); g.openingFor(a, [[4, 0]]); timers.fire();
  assert.deepEqual(notes.map(n => n.freq), [g.midiToFreq(g.MIDI[3])], "a redraw of the same stage: the first, once");
  notes.length = 0;
  g.openingFor(b, [[5, 0]]); g.openingFor(a, [[6, 0]]); timers.fire();
  assert.deepEqual(notes.map(n => n.freq), [g.midiToFreq(g.MIDI[6])], "another stage drops the pending one");
});

// ---- Round 3 of GPT's PR review ------------------------------------------------------------------------------------

test("one Listen press that spans the opening's deadline books one call — a running clock, and a held call with pending resume", async () => {
  {   // down at 340 ms, the click at 370 ms
    const { g, timers, notes, listen, unlock } = pageLoad({ progress: progressOn("intro", 0) });
    await unlock(); notes.length = 0;
    openOn(g, QA, CALM_BOLD); g.renderLevel();
    timers.advance(340); listen.fire("pointerdown"); timers.advance(30); listen.onclick(); timers.fire(); await settle();
    assert.equal(copies(g, notes, g.curCall()), 1, "running clock");
  }
  {   // a reload: down is the first gesture, the clock starts, the press is held 400 ms
    const { g, page, timers, notes, listen } = pageLoad({ progress: progressOn(QA, CALM_BOLD), pendingResume: true });
    timers.fire(); await settle();
    listen.fire("pointerdown"); page.gesture(); await settle();
    timers.advance(400); listen.onclick(); timers.fire(); await settle();
    assert.equal(copies(g, notes, g.curCall()), 1, "held through the unlock");
  }
});

test("a quest that fails to start from Home (storage full) leaves the player on 6/9: the held call plays there, once", async () => {
  const { g, timers, notes, home, unlock, page } = pageLoad({ progress: progressOn("intro", 0) });
  await unlock(); notes.length = 0;
  g.openPkg(QA, CALM_BOLD); home.onclick(); timers.fire(); await settle();
  assert.deepEqual(notes, [], "held behind Home");
  g.saveQuestRuns = () => false;                      // the store refuses the run
  const rng = g.questRng; g.questRng = () => rng("fixture-4");
  g.leaveHome();                                      // what Home's quest row does first…
  assert.equal(g.startQuestRun("firefly-crossing").code, "store-failed");   // …then the run fails to start
  assert.equal(g.levelIdx, CALM_BOLD); void page;
  timers.fire(); await settle();
  onceRunning(g, notes, g.curCall());
});

test("the page has been clicked but its clock never started (a reload, then Home → a melody level): the opening plays once", async () => {
  // A reload on 6/9 made the audio context, suspended, and dropped 6/9's call. The player then clicks through Home —
  // a gesture, but nothing resumes the clock — and opens Garden Basics 5/13: a deliberate entry, so its echo plays.
  const { g, page, timers, notes, home } = pageLoad({ progress: progressOn(QA, CALM_BOLD) });
  timers.fire(); await settle();
  page.gesture(); home.onclick(); g.openPkg(ECHO_PKG, ECHO_LVL); timers.fire(); await settle();
  assert.equal(copies(g, notes, g.curStage().echo), 1);
  assert.equal(page.contexts[0].state, "running");
});

test("…and in a browser without navigator.userActivation the same entry stays silent; 🔊 Listen plays it", async () => {
  const { g, page, timers, notes, home, listen } = pageLoad({ progress: progressOn(QA, CALM_BOLD), noUserActivation: true });
  timers.fire(); await settle();
  page.gesture(); home.onclick(); g.openPkg(ECHO_PKG, ECHO_LVL); timers.fire(); await settle();
  assert.deepEqual(notes, []);
  listen.onclick(); await settle();
  assert.equal(copies(g, notes, g.curStage().echo), 1);
});

test("the pause runs from leaving Home: nothing 50 ms after Close, and a Listen then is the only copy", async () => {
  const { g, timers, notes, home, homeclose, listen, unlock } = pageLoad({ progress: progressOn("intro", 0) });
  await unlock(); notes.length = 0;
  g.openPkg(QA, CALM_BOLD); home.onclick(); timers.fire(); await settle();   // held behind Home
  timers.advance(1000); assert.deepEqual(notes, []);
  homeclose.onclick(); timers.advance(50);
  assert.deepEqual(notes, [], "nothing 50 ms after Close");
  listen.onclick(); timers.fire(); await settle();
  assert.equal(copies(g, notes, g.curCall()), 1, "Listen's copy only");
});

test("a power card's reveal (Call the Band's) left over when a cloud load draws 6/9: no transport on the new field, the call once", async () => {
  const { g, timers, notes, unlock } = pageLoad({ progress: progressOn("intro", 0) });
  await unlock(); notes.length = 0;
  openOn(g, "intro", 2); g.renderLevel();
  g.pendingReveal = g.currentLevel().reveal; assert.equal(typeof g.pendingReveal, "function", "Call the Band has a reveal");
  g.closePow();                                       // its 350 ms reveal is queued…
  openOn(g, QA, CALM_BOLD); g.renderLevel();          // …and the cloud draws 6/9, the call on its field
  let started = 0; const real = g.start; g.start = o => { started++; real(o); };
  timers.fire(); await settle(); g.stop();
  assert.equal(started, 0, "the old level's reveal does not start the transport here");
  onceRunning(g, notes, g.curCall());
});

test("a context too old to report a state: a call held behind Home plays once when Home closes", async () => {
  const { g, page, timers, notes, home, homeclose, unlock } = pageLoad({ progress: progressOn("intro", 0) });
  await unlock(); notes.length = 0;
  delete page.contexts[0].state;
  g.openPkg(QA, CALM_BOLD); home.onclick(); timers.fire(); await settle();
  assert.deepEqual(notes, []);
  homeclose.onclick(); timers.fire(); await settle();
  assert.equal(copies(g, notes, g.curCall()), 1);
});

test("the pause after Close, 200 ms in: a redraw keeps its deadline; a Next moves it to the new step's; the Studio drops it", async () => {
  for (const then of ["redraw", "next", "studio"]) {
    const { g, timers, notes, next, home, homeclose, unlock } = pageLoad({ progress: progressOn("intro", 0) });
    await unlock(); notes.length = 0;
    g.openPkg(QA, CALM_BOLD); home.onclick(); timers.fire();   // held behind Home
    homeclose.onclick();                                         // its 350 ms pause starts
    timers.advance(200);
    if (then === "redraw") g.renderLevel(); else if (then === "next") next.onclick(); else g.openStudio();
    timers.advance(150); await settle();
    if (then === "redraw") { onceRunning(g, notes, g.curCall()); continue; }
    assert.deepEqual(notes, [], `${then}: nothing at the first deadline`);
    timers.advance(200); await settle();
    if (then === "next") { assert.equal(g.lessonStepIdx, 1); onceRunning(g, notes, g.curCall()); }
    else assert.deepEqual(notes, [], "the Studio: nothing");
  }
});
