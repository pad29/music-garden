// TUN-112: the level story is read once, in one voice. narrate() plays the baked clip and falls back to the
// browser voice only when that clip is missing — never because a newer narrate() or stopSpeech() silenced it.
// The game runs in the harness with a fake Audio that behaves as Edge did when measured (2026-11-20): pausing a
// clip whose play() is still pending rejects that promise with AbortError. speechSynthesis records what it is
// asked to say instead of saying it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame } from "./harness.mjs";

const tick = () => new Promise(r => setImmediate(r));
const named = (name, msg = name) => Object.assign(new Error(msg), { name });

/** Swap in the fake voices. Returns the log: every clip made, and every line the browser voice spoke. */
function voices(g) {
  const w = g.__window, log = { clips: [], spoken: [] };
  class FakeAudio {
    constructor(src) { this.src = src; this.paused = true; this.ls = {}; log.clips.push(this); }
    addEventListener(type, fn) { (this.ls[type] ||= []).push(fn); }
    emit(type) { for (const fn of this.ls[type] || []) fn({ type }); }
    play() { this.paused = false; return new Promise((res, rej) => { this.res = res; this.rej = rej; }); }
    settle(err) { const { res, rej } = this; this.res = this.rej = null; if (err) rej?.(err); else res?.(); }
    start() { this.settle(); }                                   // the clip loaded and is sounding
    missing() { this.paused = true; this.settle(named("NotSupportedError")); this.emit("error"); }   // a 404
    pause() { this.paused = true; this.settle(named("AbortError", "The play() request was interrupted by a call to pause()")); }
  }
  w.Audio = FakeAudio;
  w.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  w.speechSynthesis = { getVoices: () => [], cancel() {}, speak(u) { log.spoken.push(u.text); } };
  return log;
}
const sounding = log => log.clips.filter(c => !c.paused);

test("two narrate calls in a row: the second clip plays, and the first does not turn into the browser voice", async () => {
  const g = loadGame({ fresh: true }), log = voices(g);
  g.narrate("The garden is asleep."); g.narrate("The garden is asleep.");
  await tick();
  log.clips[1].start(); await tick();
  assert.equal(log.clips.length, 2);
  assert.deepEqual(sounding(log), [log.clips[1]], "one clip sounding: the newest");
  assert.deepEqual(log.spoken, [], "no browser voice over the clip");
});

test("a different story replacing a loading one: only the new clip, no browser voice for the old text", async () => {
  const g = loadGame({ fresh: true }), log = voices(g);
  g.narrate("A new instrument!"); g.narrate("The level story.");
  await tick();
  assert.deepEqual(log.spoken, []);
  assert.equal(g.curClip, log.clips[1]);
});

test("Read aloud turned off while the clip is still loading: silence, not the browser voice", async () => {
  const g = loadGame({ fresh: true }), log = voices(g);
  g.narrate("The garden is asleep."); g.stopSpeech();
  await tick();
  assert.deepEqual(sounding(log), []);
  assert.deepEqual(log.spoken, []);
});

test("a replaced clip whose file turns out missing stays silent", async () => {
  const g = loadGame({ fresh: true }), log = voices(g);
  g.narrate("Old text."); g.narrate("New text.");
  log.clips[0].emit("error"); await tick();   // the old request's 404 lands after the new narrate
  assert.deepEqual(log.spoken, []);
  assert.equal(g.curClip, log.clips[1], "the current clip is untouched");
});

test("a missing clip still falls back to the browser voice, once (quest text has no baked clip)", async () => {
  const g = loadGame({ fresh: true }), log = voices(g);
  g.narrate("Quest text with no clip.");
  log.clips[0].missing(); await tick();
  assert.deepEqual(log.spoken, ["Quest text with no clip."]);
  assert.equal(g.curClip, null);
});

test("a clip the browser refuses to play while it is current still falls back", async () => {
  const g = loadGame({ fresh: true }), log = voices(g);
  g.narrate("Story.");
  log.clips[0].settle(named("NotAllowedError")); await tick();
  assert.deepEqual(log.spoken, ["Story."]);
});

// The sign-in: a cloud load that succeeds runs applyProgress() (whose renderStage narrates when narrateReady is set)
// and then enterPlay(). Stub only the network side of onSignedIn.
const CLOUD = { v: 1, name: "Cloud Ann", current: "intro", updatedAt: 2,
  packages: { intro: { level: 0, maxLevel: 0, completed: false } }, settings: {} };
function signInGame({ narrateReady }) {
  const g = loadGame({ fresh: true }), log = voices(g);
  g.freshToken = async () => "token-ann";
  g.cloudPull = async () => ({ ok: true, progress: JSON.parse(JSON.stringify(CLOUD)) });
  g.renderAuth = () => {};
  g.speakOn = true; g.narrateReady = narrateReady;
  return { g, log };
}

for (const [how, narrateReady] of [["after picking a buddy as a guest", true], ["straight from the landing screen", false]]) {
  test(`signing in ${how}: the loaded level's story is read once, in one voice`, async () => {
    const { g, log } = signInGame({ narrateReady });
    await g.onSignedIn(false); await tick();
    assert.equal(g.cloudSync, "ready", "the cloud progress loaded");
    const story = g.curStage().intro;
    assert.ok(story, "the loaded level has a story to read");
    assert.equal(log.clips.length, 1, "one narrate for the loaded level");
    log.clips[0].start(); await tick();
    assert.deepEqual(sounding(log), [log.clips[0]]);
    assert.deepEqual(log.spoken, []);
    assert.equal(g.narrateReady, true, "narration is on for the rest of play");
  });
}

test("Read aloud off then on, while the story is still loading, reads the current story once", async () => {
  const speak = { onclick: null, textContent: "", title: "", classList: { toggle() {} } };   // the 🔊 button
  const g = loadGame({ fresh: true, elements: { speak } }), log = voices(g);
  g.speakOn = true; g.enterPlay();
  speak.onclick(); assert.equal(g.speakOn, false);   // off, before the first clip has started…
  speak.onclick(); assert.equal(g.speakOn, true);    // …and on again
  await tick();
  assert.equal(log.clips.length, 2);
  log.clips[1].start(); await tick();
  assert.deepEqual(sounding(log), [log.clips[1]]);
  assert.match(log.clips[1].src, /^voice\/[0-9a-f]+\.mp3$/);
  assert.deepEqual(log.spoken, []);
});
