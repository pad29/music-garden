// Step E5: controller/model evidence only. The harness neither draws nor produces audible sound.
import { test } from "node:test";
import assert from "node:assert";
import { loadQuestGame, completeDealtSong, continueQuest } from "./helpers/quest-fixtures.mjs";

const clone = x => JSON.parse(JSON.stringify(x));
const music = s => ({ palette:s.palette, time:s.time, tracks:s.tracks });
function fixture(t, questId = "firefly-crossing", customize) {
  const g = loadQuestGame({ fresh:true });
  t.after(() => { if (g.playing) g.stop(); clearTimeout(g.autosaveT); });
  if (customize) {
    const d = customize(clone(g.QUEST_DEFINITIONS[questId]));
    g.loadQuestCatalog(JSON.stringify({ v:1, definitions:[d] }), "official");
    assert.deepEqual(g.QUEST_CATALOG_ERRORS, []);
    questId = d.id;
  }
  const begun = g.startQuestRun(questId);
  assert.strictEqual(begun.ok, true, begun.code);
  const id = begun.runId, run = () => g.QUEST_RUNS[id], def = g.QUEST_DEFINITIONS[questId];
  const receipt = (versionId, purpose = "audition") => {
    const v = run().versions[versionId];
    g.onCompletePass({ runId:id, versionId, editRev:v.editRev,
      sessionId:`receipt-${versionId}-${v.editRev}`, purpose });
  };
  for (const phase of [0, 1]) {
    const vid = run().draft, s = clone(run().versions[vid].song);
    s.tracks[1].hits = [{ lane:phase, c:phase + 1 }]; // distinct, audible, deliberately unmatched
    g.applySong(completeDealtSong(g, s)); g.noteEdit("fixture"); receipt(vid, "play");
    assert.strictEqual(continueQuest(g).ok, true);
  }
  const pick = versionId => {
    const r = g.performQuestAction("pick", { versionId });
    assert.strictEqual(r.ok, true, r.code);
    return r;
  };
  return { g, id, run, def, receipt, pick };
}

test("pick stops the old session and binds the visible held path to its revision", t => {
  // MUTATIONS: omit selectDraft, paint the wrong song, omit stop/start, or omit audition purpose.
  for (const questId of ["firefly-crossing", "waking-woods"]) {
    const {g, id, run, pick} = fixture(t, questId);
    assert.strictEqual(run().comparison, null);
    const versions = clone(run().versions);
    const realStop = g.stop, realStart = g.start;
    const calls = [];
    g.stop = (...args) => { calls.push("stop"); return realStop(...args); };
    g.start = (...args) => { calls.push("start"); return realStart(...args); };
    let previous;
    for (const vid of ["A", "B", "A"]) {
      calls.length = 0;
      assert.deepEqual(pick(vid), {ok:true, versionId:vid});
      assert.deepEqual(calls, previous ? ["stop", "start"] : ["start"]);
      assert.strictEqual(run().draft, vid);
      assert.strictEqual(run().selection, vid);
      assert.deepEqual(music(g.currentSong()), music(versions[vid].song));
      assert.deepEqual(run().versions, versions, "listening changes no song or evidence");
      assert.strictEqual(g.playing, true);
      const s = g.completionState.active;
      assert.ok(s);
      assert.strictEqual(s.runId, id);
      assert.strictEqual(s.versionId, vid);
      assert.strictEqual(s.editRev, versions[vid].editRev);
      assert.strictEqual(s.purpose, "audition");
      assert.notStrictEqual(s.sessionId, previous);
      previous = s.sessionId;
    }
  }
});

test("selectDraft is pure and needs an active existing version but no comparison", t => {
  // MUTATIONS: restore choose's comparison prerequisite, omit either identity, or mutate input.
  const {g, run} = fixture(t), before = clone(run());
  const freeze = x => { if (x && typeof x === "object") { Object.values(x).forEach(freeze); Object.freeze(x); } return x; };
  const frozen = freeze(clone(before));
  const r = g.reduceQuestRun(frozen, {type:"selectDraft", versionId:"A", at:99});
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.run.draft, "A"); assert.strictEqual(r.run.selection, "A");
  assert.deepEqual(frozen, before); assert.deepEqual(r.run.versions, before.versions);
  // …and against a MUTABLE copy as well. Assigning to a frozen object fails SILENTLY in this script,
  // so a freeze-only purity check cannot see an in-place write to the input — it sees the write it
  // suppressed. This caught a reducer that set run.selection on its way to building the new run.
  const mutable = clone(before);
  g.reduceQuestRun(mutable, {type:"selectDraft", versionId:"A", at:99});
  assert.deepEqual(mutable, before);
  for (const [input, versionId, code] of [[frozen,"missing","no-version"],
    ...["offering","completed","abandoned"].map(status=>[{...frozen,status},"A","not-active"])]) {
    const refused = g.reduceQuestRun(input, {type:"selectDraft",versionId,at:100});
    assert.strictEqual(refused.code, code); assert.strictEqual(refused.run, input);
  }
  assert.strictEqual(g.reduceQuestRun(frozen,{type:"choose",versionId:"A",at:100}).ok,false);
});

test("removed actions cannot select play or compare behind the new controls", t => {
  // MUTATION: retain an alias for any removed action.
  const {g,run}=fixture(t), before=clone(run()), field=music(g.currentSong());
  for(const action of ["audition","choose","compare"]){
    assert.strictEqual(g.performQuestAction(action,{versionId:"A"}).code,"unknown-action");
    assert.deepEqual(run(),before); assert.deepEqual(music(g.currentSong()),field);
    assert.strictEqual(g.playing,false);
  }
});

test("failed selectDraft leaves the field run storage and undo target untouched", t => {
  // MUTATIONS: paint or clear the journal on a refused transaction, or publish failed writes.
  const {g,run,pick}=fixture(t); pick("B");
  const unedited=clone(g.currentSong().tracks);
  g.modelSetCell(0,9,true);
  const before=clone(run()), field=music(g.currentSong()), stored=clone(g.Store.get("questRuns"));
  const realSet=g.Store.set; let writes=0;
  g.Store.set=(key,value)=>{ if(key==="questRuns"){writes++;return false;} return realSet(key,value); };
  try {
    assert.strictEqual(g.performQuestAction("pick",{versionId:"A"}).code,"store-failed");
    assert.strictEqual(writes,1);
    assert.deepEqual(run(),before); assert.deepEqual(music(g.currentSong()),field);
    assert.deepEqual(g.Store.get("questRuns"),stored);
    assert.strictEqual(g.playing,false);
    assert.strictEqual(g.activeCompletionSessionId(),null);
  } finally {g.Store.set=realSet;}
  g.undoEdit(); assert.deepEqual(g.currentSong().tracks,unedited);
  assert.deepEqual(run().versions.B.song.tracks,unedited);
});

test("switching paths clears both undo and redo from the previous version", t => {
  // MUTATION: omit the conditional journalClear on a document switch.
  const {g,run,pick}=fixture(t); pick("A");
  g.modelSetCell(0,9,true); g.modelSetCell(1,10,true); g.undoEdit();
  const a=clone(run().versions.A), b=clone(run().versions.B);
  pick("B");
  for(const action of ["redoEdit","undoEdit","undoEdit","redoEdit"]){
    g[action](); assert.deepEqual(run().versions.A,a); assert.deepEqual(run().versions.B,b);
    assert.deepEqual(music(g.currentSong()),music(b.song));
  }
});

test("one undo after re-tapping the held path takes back the last musical edit", t => {
  // REGRESSION: applySong journals a fresh set of note ids even on the same path.
  // One Undo must undo the child's edit, not a musically invisible document load.
  const {g,run,pick}=fixture(t); pick("A");
  const before=clone(g.currentSong().tracks);
  g.modelSetCell(0,9,true); assert.notDeepEqual(g.currentSong().tracks,before);
  pick("A"); g.undoEdit();
  assert.deepEqual(g.currentSong().tracks,before);
  assert.deepEqual(run().versions.A.song.tracks,before);
});

test("re-tapping cannot evict a still-undoable edit from the bounded journal", t => {
  // REGRESSION: repeated same-path loads fill JOURNAL_MAX and evict real work.
  const {g,run,pick}=fixture(t); pick("A");
  const before=clone(g.currentSong().tracks); g.modelSetCell(0,9,true);
  for(let i=0;i<=g.JOURNAL_MAX;i++) pick("A");
  for(let i=0;i<=g.JOURNAL_MAX;i++) g.undoEdit();
  assert.deepEqual(g.currentSong().tracks,before);
  assert.deepEqual(run().versions.A.song.tracks,before);
});

test("re-tapping after undo preserves the held path redo", t => {
  // REGRESSION: tx(load-song) clears journalRedo despite an unchanged held path.
  const {g,run,pick}=fixture(t); pick("A");
  g.modelSetCell(0,9,true); const edited=clone(g.currentSong().tracks);
  g.undoEdit(); pick("A"); g.redoEdit();
  assert.deepEqual(g.currentSong().tracks,edited);
  assert.deepEqual(run().versions.A.song.tracks,edited);
});

test("painting a pick never increments editRev even through palette clearing", t => {
  // MUTATION: omit questPainting around applySong. Different palettes force its non-scripted tx.
  const {g,run,pick,receipt}=fixture(t);
  pick("A");receipt("A");pick("B");receipt("B");g.stop();
  const versions=clone(run().versions), comparison=clone(run().comparison);
  // Simulate an intervening editor palette, under the existing paint guard, without touching the run.
  g.questPainting=true;g.setPalette("diatonic");g.modelSetCell(0,0,true);g.questPainting=false;
  pick("A");
  assert.deepEqual(run().versions,versions);assert.deepEqual(run().comparison,comparison);
  assert.strictEqual(g.questPainting,false);
  assert.deepEqual(music(g.currentSong()),music(versions.A.song));
  assert.strictEqual(g.questEvaluateRun(run(),g.QUEST_DEFINITIONS[run().questId]).procedural.canOffer,true);
});

test("receipts refresh comparison after editing either held path and stale receipts cannot help", t => {
  // MUTATIONS: remove automatic compare or record it only while comparison is null.
  for(const edited of ["A","B"]){
    const {g,id,run,def,pick,receipt}=fixture(t);
    pick("A");receipt("A");assert.strictEqual(run().comparison,null);
    pick("B");receipt("B");const old=clone(run().comparison);
    pick(edited);const oldRev=run().versions[edited].editRev;
    g.modelSetCell(0,9,true);
    assert.strictEqual(g.activeCompletionSessionId(),null);
    assert.strictEqual(g.performQuestAction("offer").code,"gate-closed");
    g.onCompletePass({runId:id,versionId:edited,editRev:oldRev,sessionId:"late",purpose:"audition"});
    assert.deepEqual(run().comparison,old);
    assert.strictEqual(g.questEvaluateRun(run(),def).procedural.canOffer,false);
    pick(edited);receipt(edited);
    assert.strictEqual(run().comparison.revs[edited],oldRev+1);
    assert.strictEqual(g.questEvaluateRun(run(),def).procedural.canOffer,true);
    assert.strictEqual(g.performQuestAction("offer").ok,true);
  }
});

test("offer needs both current auditions and a selection and returns the saved artifact id", t => {
  // MUTATIONS: bypass offer gates or return artifactId from the pre-transaction run.
  const {g,id,run,pick,receipt}=fixture(t);
  assert.strictEqual(g.performQuestAction("offer").code,"gate-closed");
  // Receipts alone establish a comparison but do not make a reflection choice.
  receipt("A");receipt("B");assert.ok(run().comparison);
  assert.strictEqual(run().selection,null);
  assert.strictEqual(g.performQuestAction("offer").code,"gate-closed");
  // …and the BUTTON must be dark too. evaluateQuest asks the gates about `selection || draft`, so the
  // playback gate is satisfied by the draft here and this is the only gate still holding. A lit Offer
  // that then refuses with no-selection is the lit-button-that-does-nothing defect all over again.
  g.renderQuestShell();
  assert.strictEqual(g.questLastRendered.actions.find(a=>a.id==="offer").enabled,false);
  assert.strictEqual(g.questEvaluateRun(run(),g.QUEST_DEFINITIONS[run().questId]).procedural.canOffer,false);
  pick("A");g.modelSetCell(0,9,true);
  assert.strictEqual(g.performQuestAction("offer").code,"gate-closed");
  pick("A");receipt("A");
  const expected=clone(run().versions.A.song.tracks), result=g.performQuestAction("offer");
  assert.strictEqual(result.ok,true);
  assert.strictEqual(result.artifactId,"quest-run:"+id);
  assert.strictEqual(result.artifactId,run().artifact.artifactId);
  const saved=g.getSaves().find(s=>s.meta.localId===result.artifactId);
  assert.ok(saved);assert.deepEqual(saved.tracks,expected);
  // …and the toggles go with the offer button. A finished quest that still shows two paths invites a
  // tap that can do nothing — the same reason the offer button does not stay lit.
  g.renderQuestShell();
  assert.deepEqual(g.questLastRendered.paths,[]);
  assert.deepEqual(g.questLastRendered.actions,[]);
});

test("pick and shell use authored ids labels and reflection without consulting live evidence", t => {
  // MUTATIONS: branch on a shipped quest id, use literal A/B paths, or mutate evaluator inputs.
  const {g,run,def,pick,receipt}=fixture(t,"waking-woods",d=>{
    d.id="a-player-commission";d.phases[2].reflection.promptText="Which walk will you keep?";
    d.phases[2].reflection.choices[0].label="My quiet walk";
    d.phases[2].versionIds.reverse(); return d;
  });
  pick("B");receipt("B");pick("A");receipt("A");
  const before=clone(run()), definition=JSON.stringify(def);
  const expected=g.questEvaluateRun(run(),def);
  const oldCurrent=g.currentSong;g.currentSong=()=>{throw new Error("live evidence read");};
  try {
    const model=g.questShellModel(run(),def,{});
    assert.deepEqual(g.questEvaluateRun(run(),def),expected);
    assert.strictEqual(model.reflectionPrompt,"Which walk will you keep?");
    assert.deepEqual(model.paths,[{versionId:"B",label:def.phases[2].reflection.choices[1].label,selected:false,heard:true,enabled:true},
      {versionId:"A",label:"My quiet walk",selected:true,heard:true,enabled:true}]);
    assert.deepEqual(model.actions.map(a=>a.id),["offer"]);
    assert.deepEqual(run(),before);assert.strictEqual(JSON.stringify(def),definition);
  } finally {g.currentSong=oldCurrent;}
  assert.strictEqual(g.performQuestAction("offer").ok,true);
});

test("Grow and Trim use lesson picker state while quest paths remain editable", t => {
  // MUTATION: choiceUp reads choiceRow visibility instead of choiceOpts, or always returns false.
  const {g,run,pick}=fixture(t);pick("A");g.stop();
  assert.strictEqual(g.choiceOpts,null);
  assert.strictEqual(g.choiceUp(),false);
  g.modelSetCell(0,9,true);g.cursorCol=9;
  const length=()=>g.currentSong().tracks[0].notes.find(n=>n.p===g.MIDI[0]&&n.c===9).len;
  const rev=run().versions.A.editRev;
  g.growTrim(1);assert.strictEqual(length(),2);assert.strictEqual(run().versions.A.editRev,rev+1);
  g.growTrim(-1);assert.strictEqual(length(),1);
  g.choiceOpts=[];assert.strictEqual(g.choiceUp(),true);
  g.growTrim(1);assert.strictEqual(length(),1,"lesson picker still owns its demonstration");
  g.choiceOpts=null;
});
