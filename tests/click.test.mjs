// The count-in and the metronome.
//
// Two findings from the design review shape this file more than the feature does:
//   1. The count-in must be phased on `originTick`, not on transport tick zero — with a one-column
//      pickup those differ by half a beat, and a count-in landing you on the wrong beat has no other job.
//   2. The preference must persist from the STUDIO, where the old package save (`saveProgress()`, split
//      into `saveUserSettings()` and `savePackageProgress()` on the quest branch) returned immediately. The
//      test I had originally planned poked `progress.settings` directly and would have passed while the
//      feature was completely broken. So the persistence tests below go through the control's own handler
//      and read `Store` — the thing the real code writes — never the in-memory object.

import { test } from "node:test";
import assert from "node:assert";
import { loadGame } from "./harness.mjs";

const g = loadGame();
const TPC = g.TICKS_PER_COL;

const unmeter = () => { g.doc.meterMap = []; g._tintKey = null; };
const meter = (preset, originCols = 0) => {
  g.doc.meterMap = [{ tick: 0, preset, originTick: originCols * TPC }];
  g._tintKey = null;
};
// Scope is set through the one setter — production has no writable currentPkg since the quest branch,
// so a test must not keep a back door to one (the same helper as dance.test.mjs).
const inScope = (scope, fn) => {
  const was = g.scopeCatalogId();
  g.setPlayScope(scope);
  try { return fn(); }
  finally { g.setPlayScope(was === "studio" ? { kind: "studio" } : { kind: "package", packageId: was || "intro" }); }
};
const asStudio = fn => inScope({ kind: "studio" }, fn);
const asLevel  = fn => inScope({ kind: "package", packageId: "stepping-stones" }, fn);

// ---------------------------------------------------------------- the count-in's shape

test("a count-in is exactly one bar, however many beats that is", () => {
  g.step = 0;
  for (const [preset, clicks] of [["4/4", 4], ["3/4", 3], ["6/8", 2], ["2/4", 2]]) {
    meter(preset, 0);
    assert.strictEqual(g.countInPulses().length, clicks, `${preset}: one bar is ${clicks} clicks`);
  }
  unmeter();
  assert.deepEqual(g.countInPulses(), [], "no meter, no pulse to count");
});

// The rule this replaced said "two bars when one gives fewer than three clicks", which at the 40 BPM
// floor made a 6/8 count-in nine seconds long. A bar is however long a bar is.
test("no count-in is longer than one bar, at any tempo the dial allows", () => {
  const tempo = g.__document.getElementById("tempo");
  const was = tempo.value;
  g.step = 0;
  for (const bpm of [+tempo.min, 108, +tempo.max]) {
    tempo.value = bpm;
    const colMs = 60000 / bpm / 2;
    for (const preset of Object.keys(g.METERS)) {
      meter(preset, 0);
      const pre = g.countInPulses();
      const spanCols = -pre[0].rel / TPC;
      const seconds = spanCols * colMs / 1000;
      assert.strictEqual(spanCols, g.barTicks(g.METERS[preset]) / TPC, `${preset}: one bar of columns`);
      assert.ok(seconds <= 6.01, `${preset} at ${bpm} BPM: ${seconds.toFixed(1)}s is longer than a bar`);
    }
  }
  tempo.value = was; unmeter();
});

// THE defect. A count-in relative to tick zero is wrong by exactly the pickup.
test("the count-in is phased on the downbeat, so a pickup moves it", () => {
  g.step = 0;
  for (let originCols = 0; originCols <= 3; originCols++) {
    meter("4/4", originCols);
    const rel = g.countInPulses().map(u => u.rel);
    // ticks BEFORE the song's first column, and the last click is one beat before the downbeat
    assert.ok(rel.every(r => r < 0), `pickup ${originCols}: a count-in happens before the song`);
    const origin = originCols * TPC;
    // Every click sits on the meter's OWN pulse grid, which is the whole claim. With a pickup the song's
    // first column is mid-bar, so the last click is not a fixed distance from it — it is wherever the
    // meter's last beat before it falls.
    const grid = new Set(g.pulsesIn(g.meterAt(), -1000, 1000).map(u => u.tick));
    for (const r of rel) assert.ok(grid.has(r), `pickup ${originCols}: a click at ${r} is off the meter's grid`);
    // …and against the naive tick-zero version, which is what a first draft did. The DOWNBEAT is the
    // sharpest place to catch it: it moves with the origin, always.
    const barRel = g.countInPulses().find(u => u.kind === "bar").rel;
    assert.strictEqual(barRel, -384 + origin,
      `pickup ${originCols}: the count's downbeat must move with the origin`);
    // Worth knowing why this is asserted on the accent and not on the tick list: a 2-column pickup in
    // 4/4 shifts by exactly one BEAT, so the click times coincide with the naive version and only the
    // accent moves. A naive count-in would sound almost right there while being wrong about where
    // "one" is — which is the harder bug to notice, not the easier one.
    if (originCols === 2) assert.deepEqual(rel, [-384, -288, -192, -96],
      "the ticks really do coincide at a whole-beat pickup");
  }
  unmeter();
});

test("the first click of a count-in is a downbeat and the rest are beats", () => {
  g.step = 0; meter("3/4", 0);
  const pre = g.countInPulses();
  assert.strictEqual(pre[0].kind, "bar", "…so it can be accented");
  assert.ok(pre.slice(1).every(u => u.kind === "beat"));
  unmeter();
});

// Counting a child into a bar loop they deliberately chose is what a count-in is FOR (owner, 2026-09-05).
test("a count-in works from a mid-song start, still on the meter's own beats", () => {
  meter("4/4", 0);
  g.step = 8;                                   // as a selected bar range would set it
  const pre = g.countInPulses();
  assert.strictEqual(pre.length, 4, "still one bar");
  assert.deepEqual(pre.map(u => u.rel), [-384, -288, -192, -96], "relative to where it will start");
  assert.strictEqual(pre[0].kind, "bar", "and column 8 is a barline in 4/4, so the count is a whole bar");
  g.step = 0; unmeter();
});

// ---------------------------------------------------------------- when it is allowed to click at all

test("the click needs a meter AND the Studio", () => {
  for (const mode of ["in", "both"]) {
    g.clickMode = mode;
    asStudio(() => { unmeter(); assert.strictEqual(g.clickOn(), false, `${mode}: no meter, no pulse`); });
    asStudio(() => { meter("4/4"); assert.strictEqual(g.clickOn(), true, `${mode}: metered Studio clicks`); });
    asLevel(() => { meter("4/4"); assert.strictEqual(g.clickOn(), false, `${mode}: a level never clicks`); });
  }
  g.clickMode = "off";
  asStudio(() => { meter("4/4"); assert.strictEqual(g.clickOn(), false, "off is off"); });
  unmeter();
});

test("the tick is the second mode only; the count-in comes with both", () => {
  asStudio(() => {
    meter("4/4");
    g.clickMode = "in";
    assert.strictEqual(g.clickOn(), true, "counted in");
    assert.strictEqual(g.metronomeOn(), false, "…but not ticking over the music");
    g.clickMode = "both";
    assert.strictEqual(g.metronomeOn(), true);
  });
  g.clickMode = "off"; unmeter();
});

// ---------------------------------------------------------------- persistence, the honest way

test("a preference set in the Studio really reaches Store, where saveProgress would have dropped it", () => {
  const clickEl = g.__document.getElementById("click");
  asStudio(() => {
    meter("4/4");
    clickEl.value = "both";
    clickEl.onchange();                                   // the control's OWN handler, not a poke
  });
  const stored = g.Store.get("progress", {});
  assert.strictEqual(stored.settings && stored.settings.click, "both",
    "the setting must survive in Store, not merely in the in-memory object");
  // …and it survives the saves that are NOT about settings. Since the quest branch split progress by
  // owner, only saveUserSettings snapshots a control; every other save serialises what is already there.
  // A non-settings save that rebuilt progress.settings without `click` would silently drop it.
  asStudio(() => { g.clickMode = "in"; g.savePlayerName("tester"); });
  assert.strictEqual(g.Store.get("progress", {}).settings.click, "both",
    "a non-settings save keeps the stored click and does not snapshot the live control");
  asStudio(() => { clickEl.value = "in"; clickEl.onchange(); });
  assert.strictEqual(g.Store.get("progress", {}).settings.click, "in", "…and the next explicit change lands");
  g.clickMode = "off"; unmeter();
});

test("saving settings does not disturb the rest of progress", () => {
  const before = JSON.parse(JSON.stringify(g.Store.get("progress", {})));
  asStudio(() => { g.clickMode = "both"; g.saveUserSettings(); });
  const after = g.Store.get("progress", {});
  assert.deepEqual(after.packages, before.packages, "package progress is untouched");
  assert.strictEqual(after.current, before.current, "…and so is the current package");
  assert.strictEqual(after.settings.click, "both");
  g.clickMode = "off";
});

// ---------------------------------------------------------------- a cloud profile arriving (TUN-12)

// applyProgress() runs when a signed-in pull lands. A profile saved before the count-in shipped has no
// settings.click, and that must mean the default — not the live "count in + tick" the last profile left.
// Each case gets a fresh game: applyProgress reloads the package scope and the toolbox.
function liveBoth() {
  const f = loadGame({ fresh: true });
  const el = f.__document.getElementById("click");
  f.setPlayScope({ kind: "studio" });
  f.doc.meterMap = [{ tick: 0, preset: "4/4", originTick: 0 }]; f._tintKey = null;
  el.value = "both"; el.onchange();                       // the control's OWN handler, not a poke
  assert.strictEqual(f.clickMode, "both", "precondition: the live preference is count in + tick");
  assert.strictEqual(f.metronomeOn(), true, "precondition: …and the metered Studio ticks");
  // …then the child walks into a level, where the pull lands. No meter there, so nothing on the way in
  // redraws the meter controls but applyProgress's own renderLevel — the path the control must follow.
  f.doc.meterMap = []; f._tintKey = null;
  f.setPlayScope({ kind: "package", packageId: "stepping-stones" });
  assert.strictEqual(f.clickMode, "both", "precondition: the preference follows the child out of the Studio");
  return { f, el };
}
// The profile as it was on that device: everything this one has, minus whatever `edit` takes away.
const arriving = (f, edit) => { const p = JSON.parse(JSON.stringify(f.progress)); edit(p); return p; };
const studioClicks = f => {
  f.setPlayScope({ kind: "studio" });
  f.doc.meterMap = [{ tick: 0, preset: "4/4", originTick: 0 }]; f._tintKey = null;
  return f.clickOn();
};

test("a cloud profile with settings but no click resets the live click to off, control included", () => {
  // MUTATION: keep `if(progress.settings.click) clickMode=…` (the old line) — the live "both" survives.
  const { f, el } = liveBoth();
  f.progress = arriving(f, p => { delete p.settings.click; });
  assert.ok(f.progress.settings && "mix" in f.progress.settings && !("click" in f.progress.settings),
    "the profile really has settings, just no click");
  f.applyProgress();
  assert.strictEqual(f.clickMode, "off", "the preference is the default, as on a fresh page");
  assert.strictEqual(el.value, "off", "…and the control says so, rather than the mode the game left");
  assert.strictEqual(studioClicks(f), false, "…so the metered Studio no longer counts in");
});

test("a cloud profile with no settings at all resets the live click too", () => {
  // MUTATION: put the reset inside `if(progress.settings)` — a settings-less profile keeps "both".
  const { f, el } = liveBoth();
  f.progress = arriving(f, p => { delete p.settings; });
  f.applyProgress();
  assert.strictEqual(f.clickMode, "off");
  assert.strictEqual(el.value, "off");
});

test("a cloud profile with an unknown click value resets to off, not to a count-in", () => {
  // MUTATION: keep `|| "off"` without checking the value — "bogus" is truthy, so clickOn() goes true
  // and the select shows no option. GPT's PR review, round 1.
  const { f, el } = liveBoth();
  f.progress = arriving(f, p => { p.settings.click = "bogus"; });
  f.applyProgress();
  assert.strictEqual(f.clickMode, "off", "only off / in / both are modes");
  assert.strictEqual(el.value, "off", "…and the control shows one of its own options");
  assert.strictEqual(studioClicks(f), false, "…so the metered Studio does not count in");
});

test("a cloud profile with an empty settings object resets the live click too", () => {
  // settings:{} is the shape a profile saves before any control changes (the progress default).
  const { f, el } = liveBoth();
  f.progress = arriving(f, p => { p.settings = {}; });
  f.applyProgress();
  assert.strictEqual(f.clickMode, "off");
  assert.strictEqual(el.value, "off");
});

test("a cloud profile WITH a click still wins over the live one", () => {
  // MUTATION: reset to "off" unconditionally — the profile's own "in" is lost.
  const { f, el } = liveBoth();
  f.progress = arriving(f, p => { p.settings.click = "in"; });
  f.applyProgress();
  assert.strictEqual(f.clickMode, "in", "the profile's own preference is applied");
  assert.strictEqual(el.value, "in", "…and shown");
  assert.strictEqual(studioClicks(f), true, "a count-in is still a click");
  assert.strictEqual(f.metronomeOn(), false, "…but no tick over the music");
});

test("a cloud profile's own count in + tick arrives on a game whose click is off", () => {
  // MUTATION: accept only "in" — the profile's "both" falls back to "off".
  const f = loadGame({ fresh: true }), el = f.__document.getElementById("click");
  assert.strictEqual(f.clickMode, "off", "precondition: a fresh game's click is off");
  f.progress = arriving(f, p => { p.settings = Object.assign({}, p.settings, { click: "both" }); });
  f.applyProgress();
  assert.strictEqual(f.clickMode, "both");
  assert.strictEqual(el.value, "both");
  assert.strictEqual(studioClicks(f) && f.metronomeOn(), true, "count in, and tick over the music");
});

// ---------------------------------------------------------------- the no-swing rule

// The metronome books at the unswung tick. The distinction only matters where swing is non-zero, so
// assert that such columns really exist rather than testing a rule with no teeth.
test("swing displaces columns the metronome must ignore", () => {
  const was = g.jamMode, wasG = g.grooveIdx;
  g.grooveIdx = g.GROOVES.findIndex(G => G.swing > 0);
  g.jamMode = true;
  const swung = [];
  for (let c = 0; c < 16; c++) if (g.swingTicks(c) !== 0) swung.push(c);
  assert.ok(swung.length > 0, "a swinging groove really does move columns");
  g.jamMode = false;
  g.levelSwing = true;
  const lswung = [];
  for (let c = 0; c < 16; c++) if (g.swingTicks(c) !== 0) lswung.push(c);
  assert.deepEqual(lswung, [2, 6, 10, 14], "and level swing moves these");
  g.levelSwing = false; g.jamMode = was; g.grooveIdx = wasG;
});

// A pickup puts every 4/4 beat on an ODD column, which is exactly where jam swing lives — so the
// metronome and the music genuinely disagree there. Recorded because the review found it and it is a
// pre-existing Jam phase bug the click merely makes audible.
test("with a pickup, the meter's beats land on the columns jam swing displaces", () => {
  const saved = g.COLS; g.COLS = 16;
  meter("4/4", 1);
  const beats = g.meterLayout(16, g.meterAt()).marks.map(k => k.c);
  assert.ok(beats.every(c => c % 2 === 1), "every beat of a 1-column-pickup 4/4 is on an odd column");
  const wasG = g.grooveIdx, wasJ = g.jamMode;
  g.grooveIdx = g.GROOVES.findIndex(G => G.swing > 0); g.jamMode = true;
  assert.ok(beats.every(c => g.swingTicks(c) !== 0),
    "…and jam swing displaces every one of them, while the click stays on the true beat");
  g.jamMode = wasJ; g.grooveIdx = wasG; g.COLS = saved; unmeter();
});
