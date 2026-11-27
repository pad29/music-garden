// TUN-135: while a sign-in is out (authBusy), the Studio can't be entered (TUN-93), so no ordinary way of
// opening a song into it may touch the level on screen. A saved melody's ▶ Load, a cloud song's ▶ Load whose
// fetch returns mid-sign-in, the Jukebox's ▶ Play, a package finale's 🎵 Studio and a quest finale's Studio
// button each: keep the level's tracks and undo history, leave the Studio shut, keep their own list or card
// up, claim nothing — and say why, above the overlays. Once the sign-in is over, each opens the Studio with
// the song, as before. The shared-link path is TUN-109's (tests/shared-link-instrument.test.mjs).
// Every sign-in here is the real signInWith, held on its account check: production holds authBusy, not the test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadGame } from "./harness.mjs";
import { completed, clone } from "./helpers/quest-e6-fixtures.mjs";

const up = () => ({ style: { display: "flex" } });   // a list or card the player is looking at
// Built in this realm: the game's own arrays come from its vm context, and deepStrictEqual compares prototypes.
const melody = song => Array.from(song.tracks.find(t => t.kind === "melody").notes, n => n.p + "@" + n.c).sort();
// The undo history, as the player sees it: syncUndoUI enables ↶ Undo while the journal holds an edit. (The
// harness can't hand back `journal` itself: it shares a line with JOURNAL_MAX.)

/** A booted game on its first package level, with one real edit in its undo history. */
function game(t, extra = {}) {
  const els = { moverlay: up(), congratsoverlay: up(), congratsStudio: {}, undoBtn: {}, ...extra };
  const g = loadGame({ fresh: true, elements: els });
  t.after(() => { if (g.playing) g.stop(); clearTimeout(g.autosaveT); });
  return { g, els, w: watch(g, els.undoBtn) };
}
/** Records toasts (↑: raised above the overlays), status lines, starts and undo clears; makes one real edit. */
function watch(g, undoBtn) {
  const toasts = [], statuses = [], starts = [], clears = [];
  g.toast = (m, above) => toasts.push((above === true ? "↑" : "") + m);
  g.setStatus = m => statuses.push(m); g.start = o => starts.push(o);
  const clear = g.journalClear; g.journalClear = () => { clears.push(1); clear(); };
  g.modelSetCell(g.ROWS - 1, 2, !g.grid[g.ROWS - 1][2]);   // through the editor's own transaction
  assert.equal(undoBtn.disabled, false, "fixture: the level has an undo history");
  return { toasts, statuses, starts, clears, undoBtn };
}
/**
 * Starts a real sign-in — the landing's (no form) or Home's (a form) — held on its account check. Returns a
 * function that lets it fail and waits for it to finish, so authBusy is released by production's own finally.
 */
function signingIn(g, form) {
  let fail; g.cogSignIn = () => new Promise((_, no) => { fail = no; });
  const r = g.signInWith("brave-otter-42", "acorn map tulip wren", form);
  assert.equal(g.authBusy, 1, "fixture: the sign-in is out");
  return async () => { fail(new Error("test: the account check gave up")); await r; assert.equal(g.authBusy, 0); };
}
function snapshot(g, w) {
  w.clears.length = 0; w.toasts.length = 0;
  return { tracks: JSON.stringify(g.currentSong().tracks), scope: g.activeScope.kind, w };
}
function untouched(g, before, what) {
  assert.equal(g.isStudioScope(), false, what + ": the Studio did not open");
  assert.equal(g.activeScope.kind, before.scope, what + ": the player stays where they were");
  assert.equal(JSON.stringify(g.currentSong().tracks), before.tracks, what + ": the level on screen is untouched");
  assert.equal(before.w.clears.length, 0, what + ": its undo history is never cleared");
  assert.equal(before.w.undoBtn.disabled, false, what + ": ↶ Undo still has the player's edit");
  assert.deepEqual(before.w.toasts, ["↑" + g.STUDIO_WAITS_FOR_SIGNIN], what + ": says why, once, above the overlays");
}

test("TUN-135: a saved melody's ▶ Load waits for Home's sign-in, keeps the list up, then loads", async t => {
  const { g, els, w } = game(t);
  const song = g.famousToSong("mary");
  const letGo = signingIn(g, {}), before = snapshot(g, w);
  assert.equal(g.loadSong(clone(song)), null, "reports the refusal");
  untouched(g, before, "▶ Load");
  assert.equal(els.moverlay.style.display, "flex", "the list stays up, so the player still has it");
  assert.ok(!w.statuses.some(s => /Loaded into the Studio/.test(s)), "claims nothing was loaded");
  await letGo();

  g.loadSong(clone(song));   // the sign-in is over
  assert.equal(g.isStudioScope(), true, "the Studio opens");
  assert.deepEqual(melody(g.currentSong()), melody(song), "with the song");
  assert.equal(w.undoBtn.disabled, true, "undo starts fresh from the loaded song");
  assert.equal(els.moverlay.style.display, "none", "the list closes");
  assert.match(w.statuses.at(-1), /Loaded into the Studio/);
});

// GPT's PR review: the landing screen's form leaves ☰ in the tab order, and the Jukebox opens ABOVE the
// landing (DOM order), so a fresh visitor can reach ▶ Play while the landing's sign-in is out.
test("TUN-135: the Jukebox's ▶ Play during the landing's sign-in neither loads, starts nor says Now playing", async t => {
  const { g, els, w } = game(t);
  const song = g.famousToSong("mary");
  const letGo = signingIn(g), before = snapshot(g, w);   // the landing's call: no form
  g.playSong(clone(song));
  untouched(g, before, "▶ Play");
  assert.equal(w.starts.length, 0, "nothing starts playing");
  assert.ok(!w.statuses.some(s => /Now playing|Loaded into the Studio/.test(s)), "claims nothing");
  assert.equal(els.moverlay.style.display, "flex");
  await letGo();

  g.playSong(clone(song));
  assert.equal(g.isStudioScope(), true);
  assert.deepEqual(melody(g.currentSong()), melody(song));
  assert.equal(w.starts.length, 1, "and plays it");
  assert.match(w.statuses.at(-1), /Now playing/);
});

// GPT's PR review: Load awaits its fetch, so the click is allowed and the song can return after the player has
// closed the list, opened Home and started a sign-in. It must land nowhere; a fresh Load afterwards opens it.
test("TUN-135 review: a cloud song whose fetch returns mid-sign-in lands nowhere; a fresh ▶ Load after it opens it", async t => {
  const homeoverlay = { style: { display: "none" } };
  const { g, els, w } = game(t, { homeoverlay });
  const song = g.famousToSong("mary");
  const rows = []; g.mkBtn = (label, fn) => { rows.push({ label, fn }); return {}; };
  g.userPool = { getCurrentUser: () => ({ signOut() {} }) };   // signedIn(): the cloud rows are listed
  g.cloudSongList = async () => [{ id: "c1", title: "Cloud tune" }];
  let answer; g.cloudSongGet = () => new Promise(r => { answer = r; });
  await g.openMelodies();
  const load = rows.filter(r => r.label === "▶ Load").at(-1);   // the cloud row's: listed last
  assert.ok(load, "fixture: the cloud row has a ▶ Load");

  const out = load.fn();                       // no sign-in out: the click is allowed, and its fetch goes
  els.moverlay.style.display = "none";         // the player closes the list…
  homeoverlay.style.display = "flex";          // …opens Home…
  const letGo = signingIn(g, {}), before = snapshot(g, w);   // …and signs in
  answer({ id: "c1", song: clone(song) }); await out;
  untouched(g, before, "the cloud Load");
  assert.equal(homeoverlay.style.display, "flex", "Home stays up, its sign-in with it");
  assert.ok(!w.statuses.some(s => /Loaded into the Studio/.test(s)), "claims nothing was loaded");
  await letGo();
  assert.equal(g.isStudioScope(), false, "the refused song is not queued for later");

  els.moverlay.style.display = "flex"; rows.length = 0; await g.openMelodies();   // the player opens the list again
  const fresh = rows.filter(r => r.label === "▶ Load").at(-1);
  const again = fresh.fn(); answer({ id: "c1", song: clone(song) }); await again;
  assert.equal(g.isStudioScope(), true, "a fresh Load opens the Studio");
  assert.deepEqual(melody(g.currentSong()), melody(song), "with the cloud song");
});

// GPT's PR review: openHome() from the ☰ menu leaves the congratulations card displayed under Home, and Tab
// reaches its Studio button while Home's sign-in is out.
test("TUN-135: a finale's 🎵 Studio during Home's sign-in keeps its card, then carries the song", async t => {
  const { g, els, w } = game(t);
  const field = melody(g.currentSong());
  g.showCongrats("intro", null);   // the card, over the finale's field
  const letGo = signingIn(g, {}), before = snapshot(g, w);
  els.congratsStudio.onclick();
  untouched(g, before, "🎵 Studio");
  assert.equal(els.congratsoverlay.style.display, "flex", "the congratulations card stays, its buttons with it");
  await letGo();

  els.congratsStudio.onclick();
  assert.equal(g.isStudioScope(), true);
  assert.deepEqual(melody(g.currentSong()), field, "the finale's own creation comes along");
  assert.equal(w.undoBtn.disabled, true);
  assert.equal(els.congratsoverlay.style.display, "none");
});

// GPT's PR review: Offer, keyboard-activated behind Home, opens the finale while Home's sign-in is out.
test("TUN-135: a quest finale's Studio button during Home's sign-in keeps the finale and its typed name, then hands the song over", async t => {
  const finName = { value: "Firefly tune" };
  const els = { finStudio: {}, questfinale: up(), undoBtn: {} };
  const { g, id, run } = completed(t, undefined, { elements: { ...els, finName } });
  els.questfinale.style.display = "none";
  assert.equal(g.questShowFinale(id), true, "the finale, shown as the Offer button shows it");
  finName.value = "Firefly tune";   // the player types a name into it
  const named = []; const act = g.performQuestAction; g.performQuestAction = (id, o) => { named.push(id); return act(id, o); };
  const w = watch(g, els.undoBtn);
  const song = clone(run().versions[run().artifact.versionId].song);
  const letGo = signingIn(g, {}), before = snapshot(g, w);
  els.finStudio.onclick();
  untouched(g, before, "the finale's Studio button");
  assert.equal(g.isQuestScope(), true, "still in the quest");
  assert.equal(els.questfinale.style.display, "flex", "the finale stays up");
  assert.equal(finName.value, "Firefly tune", "with the name the player typed");
  assert.deepEqual(named, [], "the name is not committed by a refused exit");
  await letGo();

  els.finStudio.onclick();
  assert.deepEqual(named, ["name-song"], "the name is committed on the way out");
  assert.equal(g.isStudioScope(), true);
  assert.deepEqual(melody(g.currentSong()), melody(song), "with the quest's song");
  assert.equal(w.undoBtn.disabled, true);
  assert.equal(els.questfinale.style.display, "none");
});

test("TUN-135: openStudioWith itself lands nothing mid-sign-in, for any caller", async t => {
  const { g, w } = game(t);
  const letGo = signingIn(g, {}), before = snapshot(g, w);
  assert.equal(g.openStudioWith(g.famousToSong("mary")), false, "reports it did not open");
  before.w.toasts.push("↑" + g.STUDIO_WAITS_FOR_SIGNIN);   // the guard itself says nothing: its callers do
  untouched(g, before, "openStudioWith");
  await letGo();
});

// GPT's PR review (High): a toast at its usual z-index sits under every overlay, so the only word of the refusal
// could be hidden by the card the player is looking at. The raised toast must sit above them.
test("TUN-135 review: the refusal's toast is raised above every overlay a song is opened from", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const z = sel => { const m = html.match(new RegExp(sel.replace(/[.#]/g, "\\$&") + "\\s*\\{[^}]*z-index:\\s*(\\d+)"));
    assert.ok(m, "a z-index for " + sel); return +m[1]; };
  assert.ok(z(".toast.above") > z(".overlay"), "above Home, the Jukebox, the congratulations card and the quest finale");
  // Round 2: the garden card (90) and a map tip (80) sit above the overlays too. Nothing on the page may cover it.
  const all = Array.from(html.matchAll(/z-index:\s*(\d+)/g), m => +m[1]);
  assert.equal(z(".toast.above"), Math.max(...all), "nothing on the page stacks above the refusal");
  assert.equal(all.filter(n => n === z(".toast.above")).length, 1, "and nothing shares its layer");
  assert.ok(z(".toast") < z(".overlay"), "an ordinary toast stays where it was");
  // toast's element is the harness's swallowing stub (and `toastEl` shares a line with `let toastT`, so it isn't
  // handed back): read toast's own text instead — it sets the class on every call, so the next toast drops it.
  const helpers = readFileSync(new URL("../js/helpers.js", import.meta.url), "utf8");
  assert.match(helpers, /function toast\(msg, above\)\{[^}]*classList\.toggle\("above", above===true\)/, "toast(msg, true) raises it, and only true");
});

// GPT's PR review, round 2 (High): a sign-in that SUCCEEDS redraws the game under a finale card that stays up —
// its pull (onSignedIn → applyProgress) restores the account's level and package scope. Told to try again, the
// player presses the card's Studio button: it must still carry the finale's own song, not the restored field and
// not an empty Studio. applyProgress here is exactly what the pull runs once the account's progress is loaded.
test("TUN-135 review: after a sign-in's pull redraws the level, the finale card's 🎵 Studio still carries the finale's song", async t => {
  const { g, els, w } = game(t);
  const field = melody(g.currentSong());
  g.showCongrats("intro", null);
  const letGo = signingIn(g, {}), before = snapshot(g, w);
  els.congratsStudio.onclick();
  untouched(g, before, "🎵 Studio");
  g.applyProgress();   // the account's progress lands: the level is drawn afresh
  assert.notDeepEqual(melody(g.currentSong()), field, "fixture: the pull replaced the field on screen");
  await letGo();
  assert.equal(els.congratsoverlay.style.display, "flex", "the card is still up");

  els.congratsStudio.onclick();
  assert.equal(g.isStudioScope(), true);
  assert.deepEqual(melody(g.currentSong()), field, "the finale's creation, not the restored level");
});

test("TUN-135 review: after a sign-in's pull leaves the quest, the quest finale's Studio button still hands over the quest's song", async t => {
  const els = { finStudio: {}, questfinale: up(), undoBtn: {} };
  const { g, id, run } = completed(t, undefined, { elements: { ...els, finName: { value: "" } } });
  els.questfinale.style.display = "none";
  assert.equal(g.questShowFinale(id), true, "the Offer button's own step: the shell throws the party");
  assert.equal(els.questfinale.style.display, "flex", "fixture: the finale is up");
  const w = watch(g, els.undoBtn);
  const song = clone(run().versions[run().artifact.versionId].song);
  const letGo = signingIn(g, {}), before = snapshot(g, w);
  els.finStudio.onclick();
  untouched(g, before, "the finale's Studio button");
  g.applyProgress();   // the pull: restoreLastPackage puts the player back on a package
  assert.equal(g.isQuestScope(), false, "fixture: the pull replaced the quest scope");
  await letGo();
  assert.equal(els.questfinale.style.display, "flex", "the finale is still up");

  els.finStudio.onclick();
  assert.equal(g.isStudioScope(), true);
  assert.ok(melody(song).length > 0, "fixture: the quest's song has notes");
  assert.deepEqual(melody(g.currentSong()), melody(song), "the quest's song, not an empty Studio");
});
