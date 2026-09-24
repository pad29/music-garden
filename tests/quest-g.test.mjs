// Step G: shared copy must travel between quests; loop defaults must not change listening evidence.
// These inspect text and drive session events, not rendered pixels or audible transport timing.
import { test } from "node:test";
import assert from "node:assert";
import { loadQuestGame, continueQuest } from "./helpers/quest-fixtures.mjs";
import { launch } from "./helpers/quest-e6-fixtures.mjs";

test("shared missing and editable sentences use task nouns rather than a quest story", () => {
  // MUTATIONS: restore any pre-G engine sentence, or leak a quest noun into another missing notice.
  // This is a vocabulary boundary, not a snapshot of approved prose. Ways and heard lines are not
  // included: an even kick WALK is a taught pattern, and friends may use story words explicitly.
  const g = loadQuestGame({ fresh: true });
  const missing = Object.entries(g.QUEST_DESCRIPTORS).filter(([, d]) => d.kind === "missing");
  assert.ok(missing.length > 0);
  for (const [id, text] of missing.map(([id, d]) => [id, d.text])
    .concat([["editable", g.QUEST_EDITABLE_TEXT]])) {
    assert.ok(text.trim(), id + " must explain something");
    assert.doesNotMatch(text, /\b(?:paths?|crossings?|walks?|offers?|stepping)\b/i, id);
  }
  // The opening notice must identify the missing drum hits, not call them ambiguous "steps".
  assert.match(g.QUEST_DESCRIPTORS["missing-fragment"].text, /\bdrum hits?\b/i);
});

test("Woods loop auditions credit complete current versions and reopen offer after an edit", t => {
  // MUTATIONS: credit booking before audible time, fail to rearm a loop, classify Play as non-audition,
  // ignore an audition receipt, or suppress audition sessions in Woods. Selection is already made;
  // the edited version's receipt is the only missing evidence at the final blocked offer.
  const f = launch(t, "waking-woods"), { g, run, def } = f;
  for (const phase of [0, 1]) {
    f.ready();
    assert.strictEqual(continueQuest(g).ok, true);
  }
  assert.strictEqual(run().phase, 2);
  assert.strictEqual(g.looping, true, "the catalog, not the test, turns the loop on");

  // Replace the audio boundary only. Pick still stops/selects/repaints and creates the real session;
  // books and clock events below pass through completionDispatch and the ordinary receipt sink.
  g.start = opts => { g.playing = true; g.beginCompletionSession(opts); };
  const unheard = vid => assert.notStrictEqual(run().versions[vid].auditionedRev,
    run().versions[vid].editRev, vid + " must not be credited yet");
  const heard = vid => assert.strictEqual(run().versions[vid].auditionedRev,
    run().versions[vid].editRev, vid + " heard at its current revision");
  const bookLap = (at, from = 0) => {
    const sessionId = g.activeCompletionSessionId();
    assert.ok(sessionId);
    for (let col = from; col < g.COLS; col++) g.completionDispatch({ type: "book", sessionId, col });
    g.completionDispatch({ type: "boundary", sessionId, at, loops: g.looping });
  };
  const clock = now => g.completionDispatch({ type: "clock", now });
  const offerEnabled = () => g.questShellModel(run(), def).actions.find(a => a.id === "offer").enabled;

  assert.strictEqual(g.performQuestAction("pick", { versionId: "A" }).ok, true);
  bookLap(10); clock(9.999); unheard("A");
  clock(10); heard("A"); unheard("B");
  assert.strictEqual(offerEnabled(), false);
  assert.strictEqual(g.performQuestAction("offer").code, "gate-closed");

  assert.strictEqual(g.performQuestAction("pick", { versionId: "B" }).ok, true);
  // A partial first lap earns nothing; a full subsequent lap of the SAME session must count.
  bookLap(20, 8); clock(20); unheard("B");
  bookLap(30); clock(29.999); unheard("B");
  clock(30); heard("B");
  assert.strictEqual(offerEnabled(), true);
  const untouched = JSON.stringify(run().versions.A);

  g.modelSetCell(g.ROWS - 1, 3, !g.grid[g.ROWS - 1][3]);
  unheard("B");
  assert.strictEqual(offerEnabled(), false);
  assert.strictEqual(g.performQuestAction("offer").code, "gate-closed");
  // Restart as the main Play control does, without an explicit purpose. Do not manufacture a receipt.
  g.stop(); g.start();
  bookLap(40); clock(39.999); unheard("B");
  clock(40); heard("B");
  assert.strictEqual(JSON.stringify(run().versions.A), untouched, "no need to re-hear the untouched song");
  assert.strictEqual(offerEnabled(), true);
  assert.strictEqual(g.performQuestAction("offer").ok, true);
  assert.strictEqual(run().status, "completed");
});
