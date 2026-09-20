// The quest shell.
//
// The model is pure and takes the live-only facts as an argument, so what a child is TOLD can be
// tested without a browser; the renderer is deliberately dumb, and the browser pins the DOM.
//
// Q5 rule 7 is the shape being defended here: one intention, not a checklist. There are no
// per-observation tick boxes, nothing that ranks the routes, and nothing that could carry a score.
//
// Each test names the mutation it must catch.

import { test } from "node:test";
import assert from "node:assert";
import { loadGame } from "./harness.mjs";

const RISE = [[60, 0], [62, 2], [64, 4], [67, 6]];
const FALL = [[67, 0], [64, 2], [62, 4], [60, 6]];
const MAIN = [[0, 0], [0, 4], [0, 8], [0, 12]];
const EVEN = [0, 2, 4, 6, 8, 10, 12, 14].map(c => [0, c]);
const SPAN = { start: 0, end: 16 };

const song = (mel, hits) => ({
  v: 3, meta: { title: null, created: 0, updated: 0, author: null },
  palette: "pentatonic", time: { cols: 16, tempo: 108, groove: 0 },
  tracks: [
    { kind: "melody", voice: "musicbox", notes: mel.map(([p, c]) => ({ p, c, len: 1 })) },
    { kind: "drums", hits: hits.map(([lane, c]) => ({ lane, c })) },
  ],
});

function launched() {
  const g = loadGame({ fresh: true });
  const r = g.startQuestRun("firefly-crossing");
  assert.strictEqual(r.ok, true, r.code);
  return { g, runId: r.runId, def: g.QUEST_DEFINITIONS["firefly-crossing"] };
}
const runOf = (g, id) => g.QUEST_RUNS[id];
const alwaysStop = (t, g) => t.after(() => { try { if (g.playing) g.stop(); } catch (e) { /* down already */ } });
const edit = (g, s) => { g.applySong(s); g.noteEdit("test-edit"); };
const credit = (g, runId, versionId, sessionId) => {
  const v = runOf(g, runId).versions[versionId];
  const r = g.transactQuestRun(runId, [{ type: "completePass", versionId, editRev: v.editRev,
    sessionId, at: Date.now() }]);
  assert.strictEqual(r.ok, true, r.code);
};
const model = (g, runId, def, view) => g.questShellModel(runOf(g, runId), def, view);
const action = (m, id, versionId) => m.actions.find(a => a.id === id && (!versionId || a.versionId === versionId));

// ============================ one intention, not a checklist ============================

test("the shell states one intention and never ticks the routes off", () => {
  // MUTATION: add a per-observation list, a matched-route badge, or anything that ranks the ways.
  const { g, runId, def } = launched();
  edit(g, song(RISE, MAIN));
  const m = model(g, runId, def, {});

  assert.strictEqual(m.title, "The Firefly Crossing");
  assert.strictEqual(m.phaseLabel, "Phase 1 of 3");
  assert.strictEqual(m.intentionText, def.phases[0].intentionText);
  assert.strictEqual(m.worldText, def.phases[0].worldText);

  const flat = JSON.stringify(m).toLowerCase();
  for (const w of ["score", "percent", "grade", "matched", "correct", "wrong", "best", "closest"])
    assert.strictEqual(flat.includes(w), false, "the shell must not say " + w);
  assert.strictEqual("matchedRouteIds" in m, false, "which routes matched is not the child's business");
});

test("the ways are one sentence per route, in the engine's own words", () => {
  // MUTATION: render one way per observation, or read authored text instead of the descriptors.
  const { g, runId, def } = launched();
  assert.deepEqual(model(g, runId, def, {}).ways, [
    "A Rise, Fall, Hover, or Arc path with a clean kick on every main beat.",
    "A Rise, Fall, Hover, or Arc path with an even kick walk, all the way across.",
    "A Rise, Fall, Hover, or Arc path with a steady hi-hat shimmer, all the way across.",
  ]);
  assert.strictEqual(model(g, runId, def, {}).ways.length, def.phases[0].challenge.routes.length);
});

test("the compare phase offers no ways, because it judges no music", () => {
  // MUTATION: show the previous phase's ways on a phase that has no challenge.
  const { g, runId, def } = atCompare();
  assert.deepEqual(model(g, runId, def, {}).ways, []);
});

// ============================ the buttons ============================

test("continue carries the definition's own label, and lights only when its gates open", () => {
  // MUTATION: invent a label, or enable the button on a route match.
  const { g, runId, def } = launched();
  edit(g, song([[60, 0], [60, 4]], []));                 // matches no route at all
  const shut = model(g, runId, def, {});
  assert.strictEqual(action(shut, "continue").label, def.phases[0].procedure.buttonLabel);
  assert.strictEqual(action(shut, "continue").enabled, false);

  credit(g, runId, "A", "s1");
  const open = model(g, runId, def, {});
  assert.strictEqual(action(open, "continue").enabled, true,
    "a song matching nothing still moves the quest on — that is the whole shape of this quest");
});

test("every action the model emits says out loud whether it can be pressed", () => {
  // MUTATION: leave `enabled` off an action and let the renderer guess.
  // It does not guess — it disables anything that does not say. That is how the one-tap fix for a
  // partial selection shipped as a dead button, and a per-action check is the only thing that stops
  // the next action added here from repeating it.
  const cases = [];
  const { g, runId, def } = launched();
  cases.push(model(g, runId, def, {}), model(g, runId, def, { partialRange: true }),
             model(g, runId, def, { partialCursor: true }));
  const c = atCompare();
  cases.push(model(c.g, c.runId, c.def, {}), model(c.g, c.runId, c.def, { partialRange: true }));
  for (const m of cases) {
    const all = m.actions.concat(m.notice ? [m.notice.action] : []);
    assert.strictEqual(all.length > 0, true);
    for (const a of all) {
      assert.strictEqual(typeof a.enabled, "boolean", a.id + " does not say whether it is enabled");
      assert.strictEqual(typeof a.label, "string", a.id + " has no label");
      assert.strictEqual(a.label.length > 0, true);
    }
  }
});

test("leaving is offered in every phase", () => {
  // MUTATION: show it only on the last one, or drop it when a gate is open.
  const { g, runId, def } = launched();
  assert.strictEqual(action(model(g, runId, def, {}), "leave").enabled, true);
  const c = atCompare();
  assert.strictEqual(action(model(c.g, c.runId, c.def, {}), "leave").enabled, true);
});

/** Drive a fresh run to the compare phase: A rises over main kicks, B falls over an even walk. */
function atCompare() {
  const { g, runId, def } = launched();
  edit(g, song(RISE, MAIN));
  credit(g, runId, "A", "s1");
  assert.strictEqual(g.performQuestAction("continue").ok, true);
  edit(g, song(FALL, EVEN));
  credit(g, runId, "B", "s2");
  assert.strictEqual(g.performQuestAction("continue").ok, true);
  assert.strictEqual(runOf(g, runId).phase, 2);
  return { g, runId, def };
}

test("choosing waits for both paths to have been heard", () => {
  // MUTATION: enable choose before there is a comparison behind it.
  const { g, runId, def } = atCompare();
  const before = model(g, runId, def, {});
  assert.deepEqual(before.actions.filter(a => a.id === "audition").map(a => a.label),
    ["Hear Path A", "Hear Path B"], "the labels are the definition's own choice text");
  for (const a of before.actions.filter(a => a.id === "choose")) assert.strictEqual(a.enabled, false);
  assert.strictEqual(action(before, "offer").enabled, false);

  for (const id of ["A", "B"]) {
    const v = runOf(g, runId).versions[id];
    g.transactQuestRun(runId, [{ type: "audition", versionId: id, editRev: v.editRev,
      sessionId: v.lastCompletePlaySessionId, at: Date.now() }]);
  }
  assert.strictEqual(g.performQuestAction("compare").ok, true);
  const after = model(g, runId, def, {});
  for (const a of after.actions.filter(a => a.id === "choose")) assert.strictEqual(a.enabled, true);
  assert.strictEqual(action(after, "offer").enabled, false, "chosen is still missing");

  assert.strictEqual(g.performQuestAction("choose", { versionId: "B" }).ok, true);
  const chosen = model(g, runId, def, {});
  assert.strictEqual(action(chosen, "choose", "B").done, true);
  assert.strictEqual(action(chosen, "offer").enabled, true);
  assert.strictEqual(action(chosen, "offer").label, def.completion.label);
  assert.strictEqual(action(chosen, "offer").defaultTitle, def.completion.defaultTitle);
});

test("hearing a path is marked done, and only at its current revision", () => {
  // MUTATION: mark it done from any past audition, so an edit would not un-hear it.
  const { g, runId, def } = atCompare();
  const v = runOf(g, runId).versions.A;
  g.transactQuestRun(runId, [{ type: "audition", versionId: "A", editRev: v.editRev,
    sessionId: v.lastCompletePlaySessionId, at: Date.now() }]);
  assert.strictEqual(action(model(g, runId, def, {}), "audition", "A").done, true);
  assert.strictEqual(action(model(g, runId, def, {}), "audition", "B").done, false);
});

// ============================ what the garden said ============================

test("the shell repeats what was heard, and only for the phase it belongs to", () => {
  // MUTATION: show any stored observation, whatever phase recorded it.
  const { g, runId, def } = launched();
  edit(g, song(RISE, MAIN));
  g.onCompletePass({ runId, versionId: "A", editRev: 1, sessionId: "cs1", purpose: "play" });
  assert.deepEqual(model(g, runId, def, {}).heard,
    ["The notes climbed.", "The drum stepped on every main beat."]);

  assert.strictEqual(g.performQuestAction("continue").ok, true);
  assert.deepEqual(model(g, runId, def, {}).heard, [],
    "phase 2 has heard nothing yet, whatever phase 1 remembers");
});

test("the saved line appears only once the run really is saved", () => {
  // MUTATION: show it when the offer is made rather than when the write lands.
  const { g, runId, def } = atCompare();
  assert.strictEqual(model(g, runId, def, {}).saved, "");
  for (const id of ["A", "B"]) {
    const v = runOf(g, runId).versions[id];
    g.transactQuestRun(runId, [{ type: "audition", versionId: id, editRev: v.editRev,
      sessionId: v.lastCompletePlaySessionId, at: Date.now() }]);
  }
  g.performQuestAction("compare");
  g.performQuestAction("choose", { versionId: "B" });
  assert.strictEqual(model(g, runId, def, {}).saved, "");
  assert.strictEqual(g.performQuestAction("offer").ok, true);

  const done = model(g, runId, def, {});
  assert.strictEqual(done.saved, def.completion.completionText);
  // MUTATION: leave the offer button lit after the song is saved.
  // The whole quest was for this moment, and the screen said nothing: same six buttons, no line of
  // text, an offer button inviting a second press that does nothing.
  assert.deepEqual(done.actions.map(a => a.id), ["leave"],
    "a finished run has one thing left to do");
  assert.strictEqual(model(g, runId, def, { partialRange: true }).notice, null,
    "and nothing is in the way of a song already saved");
});

// ============================ the selected-range trap ============================

test("a partial selection is explained in the words that actually help", () => {
  // MUTATION: say "play it through". A loop over part of a song can NEVER complete — it wraps back to
  // the selection — so advice that implies another lap will help is advice that cannot work.
  const { g, runId, def } = launched();
  edit(g, song(RISE, MAIN));
  const m = model(g, runId, def, { partialRange: true });
  assert.strictEqual(m.notice.kind, "range");
  assert.strictEqual(m.notice.text,
    "You listened to the selected bars. To count a full play-through, clear the bar selection and play from the beginning.");
  assert.strictEqual(m.notice.action.id, "play-whole");
  assert.strictEqual(m.notice.action.label, "Play the whole song");
  assert.strictEqual(m.notice.action.versionId, "A");
  // The renderer disables any action that does not say it is enabled. Without this the child was shown
  // the explanation AND a dead button — which the pure test above could not see, because it checked
  // that the action existed rather than that it could be pressed. Found in the browser.
  assert.strictEqual(m.notice.action.enabled, true);
  assert.strictEqual(/another lap|again|wait/i.test(m.notice.text), false,
    "nothing may suggest that waiting for another lap will help");

  const cur = model(g, runId, def, { partialCursor: true });
  assert.strictEqual(cur.notice.kind, "cursor");
  assert.strictEqual(cur.notice.text,
    "This play started at the cursor. Play the whole song from the beginning when you are ready to continue.");

  assert.strictEqual(model(g, runId, def, {}).notice, null, "no nagging when nothing is in the way");
  assert.strictEqual(model(g, runId, def, { partialRange: true, partialCursor: true }).notice.kind, "range",
    "one thing is named, and it is the one the player set most recently");
});

test("the one-tap fix clears what is in the way and plays from the top", t => {
  // MUTATION: start playback without clearing the range, or discard the selection silently on Play.
  const { g, runId } = launched();
  alwaysStop(t, g);
  edit(g, song(RISE, MAIN));
  g.loopStart = 4; g.loopEnd = 12;
  g.pinCursor(6);
  assert.strictEqual(g.rangeOn(), true);

  const r = g.performQuestAction("play-whole", { versionId: "A", purpose: "play" });
  assert.strictEqual(r.ok, true, r.code);
  assert.strictEqual(g.rangeOn(), false, "the bars were cleared, by a button the child pressed");
  assert.strictEqual(g.cursorPinned, false);
  assert.strictEqual(g.cursorCol, 0);
  assert.strictEqual(g.playing, true);
});

test("a shut gate under a partial selection says which thing is in the way", () => {
  // MUTATION: fall back to the generic "play it through" whatever is blocking.
  const { g } = launched();
  edit(g, song(RISE, MAIN));
  g.loopStart = 4; g.loopEnd = 12;
  assert.strictEqual(/selected bars/.test(g.questRefusalText("gate-closed")), true);

  g.clearLoopRange(); g.pinCursor(5);
  assert.strictEqual(/started at the cursor/.test(g.questRefusalText("gate-closed")), true);

  g.followCursor(0);
  assert.strictEqual(g.questRefusalText("gate-closed"),
    "Play your song all the way through first — the garden has to hear it.");
  assert.strictEqual(/play it through/i.test(g.questRefusalText("gate-closed")), false,
    "the one phrase the design forbids: it is the advice that does not work");
});

// ============================ both auditions ARE the comparison ============================

test("hearing both paths records the comparison without asking for it", () => {
  // MUTATION: require a separate Compare button, or record a comparison after only one audition.
  const { g, runId } = atCompare();
  for (const id of ["A", "B"]) {
    const v = runOf(g, runId).versions[id];
    g.transactQuestRun(runId, [{ type: "completePass", versionId: id, editRev: v.editRev,
      sessionId: "cs-" + id, at: Date.now() }]);
    if (id === "A") {
      g.transactQuestRun(runId, [{ type: "audition", versionId: id, editRev: v.editRev,
        sessionId: "cs-" + id, at: Date.now() }]);
      g.questAfterReceipt(runId);
      assert.strictEqual(runOf(g, runId).comparison, null, "one path heard is not a comparison");
    } else {
      g.transactQuestRun(runId, [{ type: "audition", versionId: id, editRev: v.editRev,
        sessionId: "cs-" + id, at: Date.now() }]);
      g.questAfterReceipt(runId);
    }
  }
  const c = runOf(g, runId).comparison;
  assert.notStrictEqual(c, null, "hearing both is the comparison; there is nothing else to press");
  assert.deepEqual(c.versionIds, ["A", "B"]);
});

test("entering a quest opens the workspace it declared, not the last level's", () => {
  // MUTATION: paint the shell without applying the workspace.
  // The Firefly asks for a heartbeat in its very first phase. Opening with the drum bed shut left a
  // child with no way to lay one — the controls were declared in the definition and never applied.
  const g = loadGame({ fresh: true });
  g.setPlayScope({ kind: "package", packageId: "intro" });   // a package with neither drums nor a loop
  g.renderLevel();
  assert.strictEqual(g.looping, false, "the fixture must start shut, or this proves nothing");

  const r = g.startQuestRun("firefly-crossing");
  assert.strictEqual(r.ok, true, r.code);
  const def = g.QUEST_DEFINITIONS["firefly-crossing"];

  // renderLevel() is what turns a feature set into a screen, and it reads these two off the LEVEL —
  // so the envelope has to carry what the workspace granted. `looping` is the observable half in
  // Node; the drum bed itself is pinned in the browser, where a bed can actually be looked at.
  assert.strictEqual(def.workspace.controlIds.includes("drums"), true);
  assert.strictEqual(g.currentLevel().drums, true, "a quest that asks for a heartbeat carries the bed");
  assert.strictEqual(g.currentLevel().loop, true);
  assert.strictEqual(g.looping, true, "and renderLevel actually ran, applying it");
  assert.strictEqual(g.paletteId, def.workspace.paletteId);
  assert.strictEqual(g.toolboxOwner, g.scopeToolboxOwner(), "with its own bag, not the package's");
});

// ============================ the shell repaints when the state moves ============================

test("the screen speaks the moment the song is saved", () => {
  // MUTATION: drop the repaint after a successful offer.
  // This shipped silent: the song was written, the run completed, and the panel still showed the same
  // six buttons and no line of text. The whole quest was for that moment. `questLastRendered` is the
  // only handle a Node test has on the renderer — the DOM itself is browser-only.
  const { g, runId, def } = atCompare();
  for (const id of ["A", "B"]) {
    const v = runOf(g, runId).versions[id];
    g.transactQuestRun(runId, [{ type: "audition", versionId: id, editRev: v.editRev,
      sessionId: v.lastCompletePlaySessionId, at: Date.now() }]);
  }
  g.performQuestAction("compare");
  g.performQuestAction("choose", { versionId: "B" });
  assert.strictEqual(g.performQuestAction("offer").ok, true);
  assert.strictEqual(g.questLastRendered.saved, def.completion.completionText);
  assert.deepEqual(g.questLastRendered.actions.map(a => a.id), ["leave"]);
});

test("an edit puts out the button it just invalidated", () => {
  // MUTATION: stop repainting from noteEdit. The gate shuts on an edit, and a Continue button left lit
  // is a promise the next press will break.
  const { g, runId } = launched();
  edit(g, song(RISE, MAIN));
  credit(g, runId, "A", "s1");
  g.renderQuestShell();
  assert.strictEqual(action(g.questLastRendered, "continue").enabled, true);

  edit(g, song(FALL, MAIN));      // the same act a child performs by moving one seed
  assert.strictEqual(action(g.questLastRendered, "continue").enabled, false,
    "the shell must have repainted itself, without anyone asking it to");
});

test("a last touch after choosing can still be offered", () => {
  // MUTATION: record the comparison only the first time both paths are heard.
  // A comparison stores the REVISIONS it compared. Adding one more seed to the path they had just
  // chosen left it stale, shut BOTH comparison gates, and nothing refreshed it — so offering became
  // permanently impossible, and replaying did not help. The design says a final edit invalidates the
  // playback gate and nothing else.
  const { g, runId, def } = atCompare();
  for (const id of ["A", "B"]) {
    const v = runOf(g, runId).versions[id];
    g.transactQuestRun(runId, [{ type: "audition", versionId: id, editRev: v.editRev,
      sessionId: v.lastCompletePlaySessionId, at: Date.now() }]);
  }
  g.performQuestAction("compare");
  g.performQuestAction("choose", { versionId: "B" });
  assert.strictEqual(action(model(g, runId, def, {}), "offer").enabled, true);

  edit(g, song([[67, 0], [64, 2], [62, 4], [60, 6], [60, 10]], MAIN));
  assert.strictEqual(runOf(g, runId).selection, "B", "the choice survives the edit");
  assert.strictEqual(action(model(g, runId, def, {}), "offer").enabled, false);

  // …and simply playing it again is the whole remedy
  const v = runOf(g, runId).versions.B;
  g.transactQuestRun(runId, [{ type: "completePass", versionId: "B", editRev: v.editRev,
    sessionId: "s9", at: Date.now() },
    { type: "audition", versionId: "B", editRev: v.editRev, sessionId: "s9", at: Date.now() }]);
  g.questAfterReceipt(runId);
  assert.strictEqual(action(model(g, runId, def, {}), "offer").enabled, true,
    "hearing the changed path again is all it should take");
  assert.strictEqual(g.performQuestAction("offer").ok, true);
});

test("a run stuck mid-offering offers the way out of it", () => {
  // MUTATION: treat "offering" as finished, so the child is told the song is safe and given only Leave.
  // Nothing was written — that is what "offering" means — and there was no way to try again.
  const { g, runId, def } = atCompare();
  for (const id of ["A", "B"]) {
    const v = runOf(g, runId).versions[id];
    g.transactQuestRun(runId, [{ type: "audition", versionId: id, editRev: v.editRev,
      sessionId: v.lastCompletePlaySessionId, at: Date.now() }]);
  }
  g.performQuestAction("compare");
  g.performQuestAction("choose", { versionId: "B" });

  const realSet = g.Store.set;
  g.Store.set = (k, v) => (k === "saves" ? false : realSet(k, v));
  assert.strictEqual(g.performQuestAction("offer").ok, false);
  assert.strictEqual(runOf(g, runId).status, "offering");

  const stuck = model(g, runId, def, {});
  assert.deepEqual(stuck.actions.map(a => a.id), ["retry-offer", "leave"]);
  assert.strictEqual(/nothing is lost/.test(stuck.saved), true, stuck.saved);
  assert.notStrictEqual(stuck.saved, def.completion.completionText,
    "a song that was not written must not be described as carried into the garden");

  g.Store.set = realSet;                                  // the disk frees up
  assert.strictEqual(g.performQuestAction("retry-offer").ok, true);
  assert.strictEqual(runOf(g, runId).status, "completed");
  assert.strictEqual(model(g, runId, def, {}).saved, def.completion.completionText);
  assert.strictEqual(g.getSaves()[0].meta.source.kind, "quest");
});

test("a stale audition stops counting as heard", () => {
  // MUTATION: mark a path heard from any past audition.
  // After choosing, the chosen version becomes editable again — and an edit means the version that was
  // heard is not the version that would be offered. The tick has to go out with the gate.
  const { g, runId, def } = atCompare();
  for (const id of ["A", "B"]) {
    const v = runOf(g, runId).versions[id];
    g.transactQuestRun(runId, [{ type: "audition", versionId: id, editRev: v.editRev,
      sessionId: v.lastCompletePlaySessionId, at: Date.now() }]);
  }
  g.performQuestAction("compare");
  g.performQuestAction("choose", { versionId: "B" });
  assert.strictEqual(action(model(g, runId, def, {}), "audition", "B").done, true);

  edit(g, song([[60, 0], [62, 2], [64, 4], [67, 6], [67, 10]], MAIN));   // one more seed on the chosen path
  const after = model(g, runId, def, {});
  assert.strictEqual(action(after, "audition", "B").done, false,
    "what was heard is no longer what would be offered");
  assert.strictEqual(action(after, "offer").enabled, false);
});

test("the drum bed is locked while a path is playing back, just as the field is", t => {
  // MUTATION: guard only the melody bed. The heartbeat is half of what this quest is about, and a pad
  // press during an audition changed what the child saw while the run kept the other version.
  const { g, runId } = atCompare();
  alwaysStop(t, g);
  assert.strictEqual(g.performQuestAction("audition", { versionId: "A" }).ok, true);
  const music = () => { const s = g.currentSong(); delete s.meta; return JSON.stringify(s); };
  const before = music(), bBefore = JSON.stringify(runOf(g, runId).versions.B.song);

  g.drumClick(0, 9);
  assert.strictEqual(music(), before, "the pad press must be refused before it changes anything");
  assert.strictEqual(JSON.stringify(runOf(g, runId).versions.B.song), bBefore);
});

test("packages and the Studio behave exactly as they did", () => {
  // MUTATION: commit a setting change everywhere rather than only inside a quest.
  // Routing every tempo change through noteEdit would start scheduling autosaves that today it does
  // not — a different change from this one, and not one to make by accident on the way past.
  const g = loadGame({ fresh: true });
  const real = g.scheduleAutosave;
  let calls = 0;
  g.scheduleAutosave = () => { calls++; };
  try {
    g.setPlayScope({ kind: "studio" });
    g.tempoEl.value = 120;
    g.tempoEl.onchange();
    assert.strictEqual(calls, 0, "a Studio tempo change scheduled an autosave it never used to");
  } finally { g.scheduleAutosave = real; }
});

// ============================ repainting is not editing ============================

test("repainting the field never reaches the run", () => {
  // MUTATION: let questPaintField's reset and re-apply go through the ordinary edit path.
  // resetTransient() wipes the grid and truncates it back to 16 columns THROUGH tx() — so without the
  // guard, entering a quest rewrote the draft as an empty song and shut the playback gate on the way in.
  const { g, runId } = launched();
  edit(g, song(RISE, MAIN));
  credit(g, runId, "A", "s1");
  const before = JSON.stringify(runOf(g, runId));

  g.questPaintField(runId);
  assert.strictEqual(JSON.stringify(runOf(g, runId)), before, "the repaint wrote nothing at all");
  assert.strictEqual(g.playbackCompleteSinceLastEdit(runOf(g, runId), "A"), true,
    "and the gate the player earned is still open");
  assert.strictEqual(g.isRising(g.contourSeq()), true, "with the draft back on the field");
});
