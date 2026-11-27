// TUN-109: a shared-song link (#s= / #song=) opens the Studio without introducing an instrument.
// Both link handlers in js/boot.js open the Studio, and opening the Studio normally gifts the guitar
// (REGION_INSTR.studio) with its discovery card. A friend who came to hear a song must get neither the
// card, its narration, nor the gift — and their first real entry must still show the card, once.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame } from "./harness.mjs";

const tick = () => new Promise(r => setTimeout(r, 20));
const ref = loadGame();   // the cached game: helpers only (b64url, unpackSong, voiceHash) — never booted with a link
const PACKED = [3, "pentatonic", 16, 108, 0, "musicbox", [[60, 0]], []];   // a music-box song: not the Studio's guitar
const INLINE = "#s=" + ref.b64url(JSON.stringify(PACKED));

/** Boot the real game with a URL and a saved profile. Records every instrument-card show and every voice line. */
function boot({ hash = "", store = null, cloud = null } = {}) {
  const shows = [], clips = [], spoken = [], requests = [];
  let display = "none";
  const instroverlay = { style: {
    get display() { return display; },
    set display(v) { display = v; if (v === "flex") shows.push(v); } } };
  // #instr: a select that keeps its value, one option per voice (refreshVoices hides the locked ones)
  const instr = { value: "", options: Object.keys(ref.INSTR_INFO).map(value => ({ value, hidden: false })) };
  let w;
  const g = loadGame({ fresh: true, elements: { instroverlay, instr }, setup: win => {
    w = win;
    win.location = { ...win.location, hash, pathname: "/index.html" };
    win.history = { state: null, replaceState() {} };
    if (store) win.localStorage.setItem("mg_progress", JSON.stringify(store));
    win.Audio = class { constructor(src) { this.src = src; clips.push(src); } addEventListener() {} play() { return new Promise(() => {}); } pause() {} };
    win.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    win.speechSynthesis = { getVoices: () => [], cancel() {}, speak(u) { spoken.push(u.text); } };
    if (cloud) win.fetch = async url => {   // the cloud songs API only: any other fetch is still a bug
      if (!/\/songs\/[^/]+$/.test(String(url))) throw new Error("fetch outside the cloud songs API: " + url);
      requests.push(String(url)); return { ok: true, json: async () => cloud }; };
  } });
  const cards = () => shows.length;
  const saved = () => JSON.parse(w.localStorage.getItem("mg_progress") || "null");
  const clipOf = text => "voice/" + g.voiceHash(g.toSpeech(text)) + ".mp3";
  return { g, w, cards, clips, spoken, requests, saved, clipOf, instroverlay };
}
const guitarIntro = b => b.clips.includes(b.clipOf(b.g.INSTR_INFO.guitar.intro)) || b.spoken.includes(b.g.INSTR_INFO.guitar.intro);

test("TUN-109: a fresh load with a #s= link shows no card, gifts nothing, narrates no intro, and plays the song's voice", async () => {
  const b = boot({ hash: INLINE });
  await tick();
  assert.equal(b.g.isStudioScope(), true, "the link opens the Studio");
  assert.equal(b.cards(), 0, "no instrument discovery card");
  assert.equal(b.instroverlay.style.display, "none");
  assert.deepEqual([...b.g.progress.instruments], ["musicbox"], "the guitar is not discovered");
  assert.ok(!(b.saved()?.instruments || []).includes("guitar"), "and nothing saved says it was");
  assert.equal(guitarIntro(b), false, "the guitar's intro is not narrated");
  assert.deepEqual(b.clips, [], "nothing narrates over the Studio");
  assert.deepEqual(b.spoken, []);
  assert.equal(b.g.instrEl.value, "musicbox", "the song plays in its own voice");
});

test("TUN-109: a fresh load with a #song= link shows no card and gifts nothing, before and after the song arrives", async () => {
  const song = ref.unpackSong(PACKED);
  const b = boot({ hash: "#song=fixture", cloud: { id: "fixture", song } });
  assert.equal(b.cards(), 0, "no card while the song is in flight");
  for (let i = 0; i < 5; i++) await tick();
  assert.deepEqual(b.requests.map(u => u.replace(/^.*\/songs\//, "")), ["fixture"], "the song was fetched");
  assert.equal(b.g.isStudioScope(), true);
  assert.equal(b.cards(), 0, "no instrument discovery card");
  assert.deepEqual([...b.g.progress.instruments], ["musicbox"], "the guitar is not discovered");
  assert.ok(!(b.saved()?.instruments || []).includes("guitar"));
  assert.equal(guitarIntro(b), false);
  assert.deepEqual(b.clips, [], "nothing narrates over the Studio");
  assert.equal(b.g.instrEl.value, "musicbox", "the song plays in its own voice");
});

test("TUN-109: a song with no voice of its own still plays in the Studio's guitar, undiscovered", async () => {
  const b = boot({ hash: "#s=" + ref.b64url(JSON.stringify([3, "pentatonic", 16, 108, 0, "", [[60, 0]], []])) });
  await tick();
  assert.equal(b.g.instrEl.value, "guitar", "the voice a link plays in is unchanged");
  assert.equal(b.cards(), 0);
  assert.deepEqual([...b.g.progress.instruments], ["musicbox"]);
});

const RETURNING = { v: 1, name: "Ann", current: "intro", companion: "sprout", updatedAt: 1,
  packages: { intro: { level: 1, maxLevel: 1, done: 1 } }, settings: { speak: true }, instruments: ["musicbox", "kalimba"] };

test("TUN-109: a returning player who opens a link sees no card, and their instruments do not change", async () => {
  for (const hash of [INLINE, "#song=fixture"]) {
    const b = boot({ hash, store: structuredClone(RETURNING), cloud: { id: "fixture", song: ref.unpackSong(PACKED) } });
    for (let i = 0; i < 5; i++) await tick();
    assert.equal(b.cards(), 0, hash);
    assert.deepEqual([...b.g.progress.instruments], ["musicbox", "kalimba"], hash);
    assert.deepEqual(b.saved().instruments, ["musicbox", "kalimba"], `${hash}: nothing saved over them`);
  }
});

test("TUN-109: after a link, the visitor's first real Studio entry shows the guitar card, once", async () => {
  const b = boot({ hash: INLINE });
  await tick();
  b.g.openStudio();   // ▶ Open Studio from Home
  assert.equal(b.cards(), 1, "the card appears on the first real entry");
  assert.ok(b.g.progress.instruments.includes("guitar"));
  assert.ok(b.saved().instruments.includes("guitar"), "and the discovery is saved");
  assert.equal(guitarIntro(b), true, "its intro is narrated then");
  b.instroverlay.style.display = "none";   // the player closed it
  b.g.openStudio();
  assert.equal(b.cards(), 1, "never twice");
});

test("TUN-109: without a link, boot shows no card and each region's first entry still shows its card, once", async () => {
  const b = boot();
  await tick();
  assert.equal(b.cards(), 0, "boot alone introduces nothing (the first region's music box is never a card)");
  b.g.openPkg("follow-the-fireflies", 0);   // Paths of Song → the kalimba
  assert.equal(b.cards(), 1);
  assert.ok(b.g.progress.instruments.includes("kalimba"));
  b.instroverlay.style.display = "none";
  b.g.openStudio();                          // the Studio → the guitar
  assert.equal(b.cards(), 2);
  assert.ok(b.g.progress.instruments.includes("guitar"));
  b.instroverlay.style.display = "none";
  b.g.openPkg("follow-the-fireflies", 0); b.g.openStudio();
  assert.equal(b.cards(), 2, "neither card shows twice");
});

test("TUN-109: the ▶ Open Studio button's click event never makes it a quiet open", () => {
  const b = boot();
  b.g.openStudio({ type: "click", target: {} });   // what mkBtn hands its handler
  assert.equal(b.cards(), 1);
  assert.ok(b.g.progress.instruments.includes("guitar"));
});
