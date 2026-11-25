// TUN-125: a level's opening melody — the call a Question & Answer level plays on entry, the phrase an echo level
// plays — is heard once, however the level was opened or re-drawn. The game runs in the harness with a fake
// AudioContext that follows the browser's autoplay rule: a context made before the page has had a user gesture
// starts suspended, its clock frozen at 0, and resume() starts it only once the page has had one (sticky
// activation). Notes booked on a frozen clock are not lost: they all sound together the moment it runs. Every note
// the game books is recorded, so "heard" is "booked" — nothing the game booked is ever cancelled.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame } from "./harness.mjs";

const tick = () => new Promise(r => setImmediate(r));
const clone = x => JSON.parse(JSON.stringify(x));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const QA = "question-and-answer", CALM_BOLD = 5;   // Question & Answer 6/9, "Calm Reply, Bold Reply": two steps, a call each
const ECHO_PKG = "intro", ECHO_LVL = 4;            // Garden Basics 5/13, "Answer the Garden": three steps, an echo each

/** Anything at all: every property, call and construction is another one. Stands in for audio nodes. */
const any = () => new Proxy(function () {}, {
  get: (t, p) => (p === Symbol.toPrimitive ? () => 0 : p === "then" ? undefined : any()),
  apply: () => any(), construct: () => any(), set: () => true });

/** The browser's audio, as the autoplay policy has it. `page.gesture()` is the page's first user activation. */
function browserAudio(w) {
  const page = { activated: false, contexts: [] };
  class FakeAudioContext {
    constructor() { this.state = page.activated ? "running" : "suspended"; this.currentTime = 0; this.ls = []; page.contexts.push(this); }
    resume() { if (page.activated && this.state !== "running") { this.state = "running";
      Promise.resolve().then(() => { for (const fn of this.ls) fn({ type: "statechange" }); if (this.onstatechange) this.onstatechange({ type: "statechange" }); }); }
      return Promise.resolve(); }
    addEventListener(type, fn) { if (type === "statechange") this.ls.push(fn); }
    removeEventListener(type, fn) { this.ls = this.ls.filter(f => f !== fn); }
  }
  w.AudioContext = new Proxy(FakeAudioContext, { construct: (T, a) => new Proxy(new T(...a), {
    get: (o, p) => (p in o ? o[p] : any()), set: (o, p, v) => { o[p] = v; return true; } }) });
  w.webkitAudioContext = w.AudioContext;
  page.gesture = () => { page.activated = true; };
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

/**
 * A page load. `progress` is the save on this device (none: a fresh visitor). `session` stands in a signed-in
 * session at load, whose cloud pull waits for `cloud.resolve(progress)`. Returns the game, the page's audio, the
 * opening timers, the Listen button and `notes` — every note booked, as `{ freq, t, state }`.
 */
function pageLoad({ progress = null, session = false } = {}) {
  const listen = { onclick: null, style: {} }, next = { onclick: null, style: {} }, cloud = deferred(); let page, timers;
  const g = loadGame({ fresh: true, elements: { listen, nextBtn: next }, setup: w => {
    page = browserAudio(w); timers = openingTimers(w);
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
  return { g, page, timers, listen, next, notes, cloud, tap };
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
const settle = async () => { for (let i = 0; i < 6; i++) await tick(); };
const openOn = (g, pkg, level, step = 0) => { g.setPlayScope({ kind: "package", packageId: pkg }, { levelIdx: level }); g.lessonStepIdx = step; };

// ---- Re-drawing a level ------------------------------------------------------------------------------------------

test("a level drawn twice in a row (as a sign-in's cloud load does) plays its opening call once", async () => {
  const { g, timers, notes, tap } = pageLoad({ progress: progressOn("intro", 0) });
  tap(); timers.fire(); notes.length = 0;
  openOn(g, QA, CALM_BOLD); g.renderLevel(); g.renderLevel();
  timers.fire(); await settle();
  assert.equal(copies(g, notes, g.curCall()), 1);
});

test("an echo level drawn twice in a row plays its phrase once", async () => {
  const { g, timers, notes, tap } = pageLoad({ progress: progressOn("intro", 0) });
  tap(); timers.fire(); notes.length = 0;
  openOn(g, ECHO_PKG, ECHO_LVL); g.renderLevel(); g.renderLevel();
  timers.fire(); await settle();
  assert.equal(copies(g, notes, g.curStage().echo), 1);
});

// ---- Reloading the page, before any gesture -----------------------------------------------------------------------

test("a signed-in reload on Question & Answer 6/9: the call is heard once, at the first tap", async () => {
  // The boot draw (this device's save) and the cloud load's draw (the account's) are both on 6/9, and both come
  // before the page has had a gesture: the context is suspended, its clock frozen.
  const save = progressOn(QA, CALM_BOLD);
  const { g, page, timers, notes, cloud, tap } = pageLoad({ progress: save, session: true });
  await settle(); timers.fire();
  cloud.resolve({ ...save, updatedAt: 2 }); await settle();
  assert.equal(g.cloudSync, "ready", "the cloud progress loaded");
  timers.fire(); await settle();
  assert.equal(page.contexts.every(c => c.state === "suspended"), true, "no gesture yet: nothing can sound");
  tap(); await settle();
  assert.equal(copies(g, notes, g.curCall()), 1);
});

test("a guest's reload on Question & Answer 6/9, then Listen as the first gesture: the call once", async () => {
  const { g, page, timers, notes, listen } = pageLoad({ progress: progressOn(QA, CALM_BOLD) });
  timers.fire(); await settle();
  page.gesture(); listen.onclick(); await settle();
  assert.equal(copies(g, notes, g.curCall()), 1);
});

test("a guest's reload on Question & Answer 6/9, then a tap on the field: the call is heard once, at the tap", async () => {
  const { g, timers, notes, tap } = pageLoad({ progress: progressOn(QA, CALM_BOLD) });
  timers.fire(); await settle();
  assert.equal(notes.filter(n => n.state === "running").length, 0, "nothing heard before the gesture");
  tap(); await settle();
  assert.equal(copies(g, notes, g.curCall()), 1);
});

test("a guest's reload on Question & Answer 6/9, then another package from Home: 6/9's call never plays there", async () => {
  const { g, timers, notes, tap } = pageLoad({ progress: progressOn(QA, CALM_BOLD) });
  timers.fire(); await settle();
  g.openPkg("intro", 0);                 // Garden Basics 1/13: no opening melody
  timers.fire(); tap(); await settle();
  assert.deepEqual(notes, [], "no call from the level the player left");
});

test("a signed-in reload on 6/9 whose cloud save is on another level: only that level's melody, once", async () => {
  const { g, timers, notes, cloud, tap } = pageLoad({ progress: progressOn(QA, CALM_BOLD), session: true });
  await settle(); timers.fire();
  cloud.resolve(progressOn(ECHO_PKG, ECHO_LVL, { updatedAt: 2 })); await settle();
  timers.fire(); tap(); await settle();
  assert.equal(g.levelIdx, ECHO_LVL, "the cloud's level");
  assert.equal(copies(g, notes, g.curStage().echo), 1);
});

// ---- Moving on before the melody starts ------------------------------------------------------------------------

test("Next to the second step of 6/9 before the first step's call starts: the second step's call, once", async () => {
  const { g, timers, notes, tap, next } = pageLoad({ progress: progressOn("intro", 0) });
  tap(); timers.fire(); notes.length = 0;
  openOn(g, QA, CALM_BOLD); g.renderLevel();
  next.onclick();                    // a quick Next, inside the 350 ms
  assert.equal(g.lessonStepIdx, 1);
  timers.fire(); await settle();
  assert.equal(copies(g, notes, g.curCall()), 1);
});

test("Next through an echo level's steps before the phrase starts: only the current step's phrase", async () => {
  const { g, timers, notes, tap, next } = pageLoad({ progress: progressOn("intro", 0) });
  tap(); timers.fire(); notes.length = 0;
  openOn(g, ECHO_PKG, ECHO_LVL); g.renderLevel();
  next.onclick();
  timers.fire(); await settle();
  assert.equal(copies(g, notes, g.curStage().echo), 1);
});

test("leaving an echo level for another package before its phrase starts: nothing plays", async () => {
  const { g, timers, notes, tap } = pageLoad({ progress: progressOn("intro", 0) });
  tap(); timers.fire(); notes.length = 0;
  openOn(g, ECHO_PKG, ECHO_LVL); g.renderLevel();
  g.openPkg(QA, 1);                       // Question & Answer 2/9: no opening melody
  timers.fire(); await settle();
  assert.deepEqual(notes, []);
});

// ---- The paths that already played once, and Listen ------------------------------------------------------------------

test("a guest on paths with one draw: the melody once each — Home → package, Next onto a call level, each step of 6/9", async () => {
  const { g, timers, notes, tap, next } = pageLoad({ progress: progressOn("intro", 0) });
  tap(); timers.fire(); notes.length = 0;
  g.openPkg(QA, CALM_BOLD); timers.fire(); await settle();
  assert.equal(copies(g, notes, g.curCall()), 1, "6/9 step 1 from Home"); notes.length = 0;
  next.onclick(); timers.fire(); await settle();
  assert.equal(g.lessonStepIdx, 1);
  assert.equal(copies(g, notes, g.curCall()), 1, "6/9 step 2"); notes.length = 0;
  g.openPkg(QA, 1); timers.fire(); next.onclick();   // 2/9 → Next → 3/9, "Complete the Conversation"
  timers.fire(); await settle();
  assert.equal(g.levelIdx, 2);
  assert.equal(copies(g, notes, g.curCall()), 1, "3/9 reached with Next");
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

test("every stage with an opening melody plays it once on entry, and placeCall still pre-places each call", async () => {
  const { g, timers, notes, tap } = pageLoad({ progress: progressOn("intro", 0) });
  tap(); timers.fire();
  let seen = 0;
  for (const [id, P] of Object.entries(g.PACKAGES)) P.levels.forEach((L, i) => (L.steps || [L]).forEach((s, j) => {
    if (!s.echo && !s.call) return;
    notes.length = 0; openOn(g, id, i, j); g.renderLevel(); g.renderLevel(); timers.fire();
    assert.equal(copies(g, notes, s.echo || s.call), 1, `${P.name} ${i + 1} step ${j + 1}`);
    if (s.call) assert.ok(s.call.every(([r, c]) => g.grid[r][c]), `${P.name} ${i + 1}: the call is on the field`);
    seen++;
  }));
  assert.equal(seen, 10, "the ten stages with an opening melody (Garden Basics 5, Question & Answer 1, 3–7)");
});

test("a guest's reload on 6/9, then ▶ Play as the first gesture: the waiting call does not play over the sweep", async () => {
  const { g, timers, page } = pageLoad({ progress: progressOn(QA, CALM_BOLD) });
  timers.fire(); await settle();
  const phrases = []; const real = g.playPhrase; g.playPhrase = n => { phrases.push(n); real(n); };
  page.gesture(); g.start(); await settle();
  g.stop(); await settle();
  assert.deepEqual(phrases, [], "the sweep plays the call on the field; no opening copy on top");
});

test("▶ Play pressed before the opening call starts: the sweep plays the call, no opening copy on top", async () => {
  const { g, timers, tap } = pageLoad({ progress: progressOn("intro", 0) });
  tap(); timers.fire();
  openOn(g, QA, CALM_BOLD); g.renderLevel();
  const phrases = []; const real = g.playPhrase; g.playPhrase = n => { phrases.push(n); real(n); };
  g.start(); timers.fire(); await settle(); g.stop();
  assert.deepEqual(phrases, []);
});

test("scheduleOpening keeps one melody: a second schedule replaces the first", async () => {
  const { g, timers, notes, tap } = pageLoad({ progress: progressOn("intro", 0) });
  tap(); timers.fire(); notes.length = 0;
  g.scheduleOpening([[3, 0]]); g.scheduleOpening([[5, 0]]); timers.fire();
  assert.deepEqual(notes.map(n => n.freq), [g.midiToFreq(g.MIDI[5])]);
});
