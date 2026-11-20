// TUN-112: the level story is read once, in one voice. narrate() plays the baked clip and uses the browser voice only
// when that clip is missing — never because a newer narrate() or stopSpeech() silenced it, and never because the
// browser refused to play it. The game runs in the harness with a fake Audio that behaves as Edge did when measured
// (2026-11-20): pausing a clip whose play() is still pending rejects that promise with AbortError. speechSynthesis
// records what it is asked to say instead of saying it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame } from "./harness.mjs";

const tick = () => new Promise(r => setImmediate(r));
const named = (name, msg = name) => Object.assign(new Error(msg), { name });
const clone = x => JSON.parse(JSON.stringify(x));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

/** Install the fake voices on a game window (before or after load). Returns the log: every clip made, every line spoken. */
function voices(w) {
  const log = { clips: [], spoken: [] };
  class FakeAudio {
    constructor(src) { this.src = src; this.paused = true; this.ls = {}; log.clips.push(this); }
    addEventListener(type, fn) { (this.ls[type] ||= []).push(fn); }
    emit(type) { for (const fn of this.ls[type] || []) fn({ type }); }
    play() { this.paused = false; return new Promise((res, rej) => { this.res = res; this.rej = rej; }); }
    settle(err) { const { res, rej } = this; this.res = this.rej = null; if (err) rej?.(err); else res?.(); }
    start() { this.settle(); }                                   // the clip loaded and is sounding
    // A 404 or an unreachable file, as Edge reports it (measured 2026-11-20): error code 4, play() → NotSupportedError.
    missing() { this.paused = true; this.error = { code: 4 }; this.settle(named("NotSupportedError")); this.emit("error"); }
    breaks(code) { this.paused = true; this.error = { code }; this.emit("error"); }   // a clip that stops mid-play
    pause() { this.paused = true; this.settle(named("AbortError", "The play() request was interrupted by a call to pause()")); }
  }
  w.Audio = FakeAudio;
  w.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  w.speechSynthesis = { getVoices: () => [], cancel() {}, speak(u) { log.spoken.push(u.text); } };
  return log;
}
const game = (opts = {}) => { const g = loadGame({ fresh: true, ...opts }); return { g, log: voices(g.__window) }; };
const sounding = log => log.clips.filter(c => !c.paused);
const clipOf = (g, text) => "voice/" + g.voiceHash(g.toSpeech(text)) + ".mp3";

test("two narrate calls in a row: the second clip plays, and the first does not turn into the browser voice", async () => {
  const { g, log } = game();
  g.narrate("The garden is asleep."); g.narrate("The garden is asleep.");
  await tick();
  log.clips[1].start(); await tick();
  assert.equal(log.clips.length, 2);
  assert.deepEqual(sounding(log), [log.clips[1]], "one clip sounding: the newest");
  assert.deepEqual(log.spoken, [], "no browser voice over the clip");
});

test("a different story replacing a loading one: only the new clip, no browser voice for the old text", async () => {
  const { g, log } = game();
  g.narrate("A new instrument!"); g.narrate("The level story.");
  await tick();
  assert.deepEqual(log.spoken, []);
  assert.equal(g.curClip, log.clips[1]);
});

test("Read aloud turned off while the clip is still loading: silence, not the browser voice", async () => {
  const { g, log } = game();
  g.narrate("The garden is asleep."); g.stopSpeech();
  await tick();
  assert.deepEqual(sounding(log), []);
  assert.deepEqual(log.spoken, []);
});

test("a replaced clip whose file turns out missing stays silent", async () => {
  const { g, log } = game();
  g.narrate("Old text."); g.narrate("New text.");
  log.clips[0].error = { code: 4 }; log.clips[0].emit("error"); await tick();   // the old request's 404 lands after the new narrate
  assert.deepEqual(log.spoken, []);
  assert.equal(g.curClip, log.clips[1], "the current clip is untouched");
});

test("a missing clip still falls back to the browser voice, once (quest text has no baked clip)", async () => {
  const { g, log } = game();
  g.narrate("Quest text with no clip.");
  log.clips[0].missing(); await tick();
  assert.deepEqual(log.spoken, ["Quest text with no clip."]);
  assert.equal(g.curClip, null);
});

test("only the missing-clip error event, on its own, is enough to fall back once", async () => {
  const { g, log } = game();
  g.narrate("Quest text.");
  log.clips[0].error = { code: 4 }; log.clips[0].emit("error"); await tick();
  assert.deepEqual(log.spoken, ["Quest text."]);
});

test("only play() rejecting with NotSupportedError, on its own, is enough to fall back once", async () => {
  const { g, log } = game();
  g.narrate("Quest text.");
  log.clips[0].settle(named("NotSupportedError")); await tick();
  assert.deepEqual(log.spoken, ["Quest text."]);
});

for (const [what, code] of [["a network error", 2], ["a decode error", 3]]) {
  test(`a baked clip that breaks off mid-play with ${what}: no browser voice restarts the story`, async () => {
    const { g, log } = game();
    g.narrate("The garden is asleep.");
    log.clips[0].start(); await tick();
    log.clips[0].breaks(code); await tick();
    assert.deepEqual(log.spoken, []);
  });
}

test("the current clip's play() rejected with AbortError: silence", async () => {
  const { g, log } = game();
  g.narrate("Story.");
  log.clips[0].settle(named("AbortError")); await tick();
  assert.equal(g.curClip, log.clips[0]);
  assert.deepEqual(log.spoken, []);
});

test("a clip the browser refuses to play (no gesture yet) exists: no browser voice stands in for it", async () => {
  const { g, log } = game();
  g.narrate("Story.");
  log.clips[0].settle(named("NotAllowedError")); await tick();
  assert.deepEqual(log.spoken, []);
});

test("Read aloud off then on, while the story is still loading, reads the current story once", async () => {
  const speak = { onclick: null, textContent: "", title: "", classList: { toggle() {} } };   // the 🔊 button
  const { g, log } = game({ elements: { speak } });
  g.speakOn = true; g.enterPlay();
  speak.onclick(); assert.equal(g.speakOn, false);   // off, before the first clip has started…
  speak.onclick(); assert.equal(g.speakOn, true);    // …and on again
  await tick();
  assert.equal(log.clips.length, 2);
  log.clips[1].start(); await tick();
  assert.deepEqual(sounding(log), [log.clips[1]]);
  assert.equal(log.clips[1].src, clipOf(g, g.curStage().intro));
  assert.deepEqual(log.spoken, []);
});

// ---- Signing in. A cloud load that succeeds runs applyProgress(), whose renderStage reads the loaded level's story.
// LOCAL and CLOUD sit on different levels of the intro, so the story asked for says which progress it came from.
const LOCAL = { v: 1, name: "Ann", current: "intro", updatedAt: 1, companion: { type: "sprout" },
  packages: { intro: { level: 0, maxLevel: 0, completed: false } }, settings: {} };
const CLOUD = { v: 1, name: "Cloud Ann", current: "intro", updatedAt: 2, companion: { type: "sprout" },
  packages: { intro: { level: 3, maxLevel: 3, completed: false } }, settings: {} };

/** A game whose cloud pull waits for `pull.resolve(progress)`. `timers` holds the instrument card's 1400 ms callbacks. */
function signInGame({ narrateReady, cloud = CLOUD, pickerUp = false }) {
  const timers = [];
  const instroverlay = { style: { display: "none" } }, compoverlay = { style: { display: pickerUp ? "flex" : "none" } };
  const g = loadGame({ fresh: true, elements: { instroverlay, compoverlay }, setup: w => {
    const real = w.setTimeout;
    w.setTimeout = (fn, ms, ...a) => ms === 1400 ? (timers.push(fn), 0) : real(fn, ms, ...a);
  } });
  const log = voices(g.__window), pull = deferred();
  g.freshToken = async () => "token-ann";
  g.cloudPull = async () => ({ ok: true, progress: clone(await pull.promise) });
  g.renderAuth = () => {};
  g.speakOn = true; g.narrateReady = narrateReady;
  const signIn = async () => { const done = g.onSignedIn(false); await tick(); pull.resolve(cloud); await done; await tick(); };
  return { g, log, timers, instroverlay, compoverlay, signIn, pull };
}
const cloudStory = g => { assert.equal(g.levelIdx, 3, "the cloud progress loaded"); return clipOf(g, g.curStage().intro); };

for (const [how, narrateReady] of [["after picking a buddy as a guest", true], ["straight from the landing screen", false]]) {
  test(`signing in ${how}: the loaded level's story is read once, in one voice`, async () => {
    const { g, log, signIn } = signInGame({ narrateReady });
    await signIn();
    assert.equal(g.cloudSync, "ready");
    assert.deepEqual(log.clips.map(c => c.src), [cloudStory(g)], "one narrate, of the loaded level's story");
    log.clips[0].start(); await tick();
    assert.deepEqual(sounding(log), [log.clips[0]]);
    assert.deepEqual(log.spoken, []);
    assert.equal(g.narrateReady, true, "narration is on for the rest of play");
  });
}

test("a cloud load while an instrument card is up: the card keeps its voice, and the story comes once after it", async () => {
  const { g, log, timers, instroverlay, signIn } = signInGame({ narrateReady: true });
  g.showInstrCard("kalimba"); assert.equal(instroverlay.style.display, "flex");
  const card = log.clips[0];
  await signIn();
  assert.deepEqual(log.clips, [card], "no story over the card");
  assert.equal(card.paused, false, "the card is still speaking");
  g.closeInstrCard();
  assert.equal(card.paused, true);
  assert.equal(timers.length, 1);
  timers[0]();
  assert.deepEqual(log.clips.slice(1).map(c => c.src), [cloudStory(g)], "the loaded story, once");
  assert.deepEqual(log.spoken, []);
});

test("a cloud load that turns Read aloud off while an instrument card speaks: the card stops, and closing it is silent", async () => {
  const { g, log, timers, signIn } = signInGame({ narrateReady: true, cloud: { ...CLOUD, settings: { speak: false } } });
  g.showInstrCard("kalimba");
  const card = log.clips[0];
  await signIn();
  assert.equal(g.speakOn, false);
  assert.equal(card.paused, true, "the card's voice stopped with Read aloud");
  g.closeInstrCard(); timers.forEach(fn => fn());
  assert.deepEqual(log.clips, [card], "nothing more was read");
  assert.deepEqual(log.spoken, []);
});

test("a card closed just before the cloud load: its delayed story does not restart the loaded one", async () => {
  const { g, log, timers, signIn } = signInGame({ narrateReady: true });
  g.showInstrCard("kalimba"); g.closeInstrCard();   // the 1400 ms story is now waiting
  await signIn();
  const story = log.clips.at(-1);
  assert.equal(story.src, cloudStory(g));
  timers.forEach(fn => fn());
  assert.equal(log.clips.at(-1), story, "no second request for the story");
  assert.equal(g.curClip, story);
});

test("a cloud save with no buddy yet, loaded while the buddy picker is up: silent until a buddy is picked, then the story once", async () => {
  // e.g. an account made from a shared song's Studio before any buddy was picked; on a later visit the player signs
  // in from the landing screen, goes Back → Start playing while the pull is out, and the picker is up when it lands.
  const noBuddy = clone(CLOUD); delete noBuddy.companion;
  const { g, log, compoverlay, signIn } = signInGame({ narrateReady: false, cloud: noBuddy, pickerUp: true });
  await signIn();
  assert.equal(g.cloudSync, "ready");
  assert.equal(compoverlay.style.display, "flex", "the picker is still up");
  assert.deepEqual(log.clips, [], "no story under the picker");
  assert.deepEqual(log.spoken, []);
  g.pickCompanion("sprout");
  assert.equal(compoverlay.style.display, "none");
  assert.deepEqual(log.clips.map(c => c.src), [cloudStory(g)], "the loaded story, once, after the pick");
  assert.deepEqual(log.spoken, []);
});

test("a signed-in reload: silent until the cloud answers, then the cloud level's story, once", async () => {
  // The real boot gate: a stored session at load, so boot.js calls onSignedIn(false) itself. Voices are recorded
  // from before boot; the cloud's answer is held until the test releases it.
  const answer = deferred(); let log;
  const user = { getUsername: () => "ann", signOut() {},
    getSession: cb => cb(null, { isValid: () => true, getIdToken: () => ({ getJwtToken: () => "token-ann" }) }) };
  const g = loadGame({ fresh: true, setup: w => {
    log = voices(w);
    w.localStorage.setItem("mg_progress", JSON.stringify(LOCAL));
    w.localStorage.setItem("mg_settings", JSON.stringify({ speak: true }));
    w.AmazonCognitoIdentity = { CognitoUserPool: class { getCurrentUser() { return user; } } };
    w.fetch = async () => answer.promise;
  } });
  await tick();
  assert.equal(g.cloudSync, "loading");
  assert.deepEqual(log.clips, [], "no story before the cloud answers");
  answer.resolve({ ok: true, status: 200, json: async () => clone(CLOUD) });
  for (let i = 0; i < 5; i++) await tick();
  assert.equal(g.cloudSync, "ready");
  assert.deepEqual(log.clips.map(c => c.src), [cloudStory(g)]);
  assert.deepEqual(log.spoken, []);
});
