// E6: pure contracts and imperative boundary ordering, never pixel/audio assertions.
import { test } from "node:test";
import assert from "node:assert";
import { launch, compare, completed, failEdit, clone } from "./helpers/quest-e6-fixtures.mjs";
import { continueQuest } from "./helpers/quest-fixtures.mjs";

test("failed edits close the button and door even after receipts and hydration", t=>{
  // MUTATIONS: drop the failure marker, clear it on unrelated writes, or omit either guard.
  for(const phase of [0,1]) {
    const f=launch(t), {g,id,run,def}=f;
    if(phase===1){ f.ready(); assert.strictEqual(continueQuest(g).ok,true); }
    f.ready();
    assert.strictEqual(g.questEvaluateRun(run(),def).procedural.canAdvance,true);
    const {field,marker}=failEdit(f);
    assert.deepEqual(g.questUnsavedEdit,marker);
    for(const write of [()=>f.receipt(),()=>g.hydrateQuestRuns(),
      ()=>g.transactQuestRun(id,[{type:"selectDraft",versionId:run().draft,at:101}])]){
      write(); g.renderQuestShell();
      assert.deepEqual(g.questUnsavedEdit,marker);
      assert.strictEqual(g.questLastRendered.unsaved,true);
      assert.strictEqual(g.questLastRendered.actions.find(a=>a.id==="continue").enabled,false);
      assert.deepEqual(g.performQuestAction("continue"),{ok:false,code:"unsaved-edit"});
      assert.strictEqual(run().phase,phase);
      assert.deepEqual(g.currentSong().tracks,field,"refusing must preserve the child's note");
    }
    g.noteEdit("explicit later edit");
    assert.strictEqual(g.questUnsavedEdit,null);
    assert.deepEqual(run().versions[run().draft].song.tracks,field);
    f.receipt(); g.renderQuestShell();
    assert.strictEqual(g.questLastRendered.actions.find(a=>a.id==="continue").enabled,true);
    assert.strictEqual(continueQuest(g).ok,true);
    assert.deepEqual(run().versions.B.song.tracks,field);
  }
});

test("only a successful edit for the outstanding run and version clears its marker", t=>{
  // MUTATIONS: clear any run's marker, ignore version identity, clear before persistence succeeds.
  const f=compare(t),{g,id,run}=f, {marker}=failEdit(f);
  g.performQuestAction("pick",{versionId:"B"}); // same path: a successful selection is not an edit
  assert.deepEqual(g.questUnsavedEdit,marker);
  // Switching away is refused now — that refusal is what stops the failed edit being discarded — so
  // an edit on the OTHER version of this run is unreachable while the marker stands. The refusal is
  // the guarantee; version identity is still pinned by the questHasUnsavedEdit checks below.
  assert.deepEqual(g.performQuestAction("pick",{versionId:"A"}),{ok:false,code:"unsaved-edit"});
  assert.deepEqual(g.questUnsavedEdit,marker);
  const other=g.startQuestRun("waking-woods"); assert.strictEqual(other.ok,true);
  g.modelSetCell(g.ROWS-1,3,!g.grid[g.ROWS-1][3]);
  assert.deepEqual(g.questUnsavedEdit,marker);
  assert.strictEqual(g.questHasUnsavedEdit(other.runId,"B"),false);
  assert.strictEqual(g.questHasUnsavedEdit(id,"A"),false);
  assert.strictEqual(g.questHasUnsavedEdit(id,"B"),true);
  assert.strictEqual(g.enterQuestRun(id).ok,true);
  g.performQuestAction("pick",{versionId:"B"});
  const set=g.Store.set; g.Store.set=(k,v)=>k==="questRuns"?false:set(k,v);
  g.noteEdit("fails again"); assert.deepEqual(g.questUnsavedEdit,marker); g.Store.set=set;
  g.modelSetCell(g.ROWS-1,3,!g.grid[g.ROWS-1][3]); assert.strictEqual(g.questUnsavedEdit,null);
  assert.strictEqual(run().draft,"B");
});

test("a phase transaction cannot discharge the outstanding edit", t=>{
  // MUTATION: treat a successful phase write as saving the document.
  const f=launch(t); f.ready(); const {marker}=failEdit(f),{g,id,run,def}=f;
  const result=g.advanceQuestPhase({runId:id,expectedPhase:0,gate:()=>true,
    ops:g.questTransitionOps(def,run(),100)});
  assert.strictEqual(result.ok,true);
  assert.deepEqual(g.questUnsavedEdit,marker);
});

test("a fresh page restores only the persisted document and never invents the failed note", t=>{
  // This is a LIMIT, not a rescue claim: the marker is page-local; reload loses the unsaved note.
  // MUTATION: persist the failed candidate, or manufacture edit data during hydration.
  const f=launch(t); f.ready(); const {before,field}=failEdit(f);
  const env=clone(f.g.Store.get("questRuns")), fresh=launch(t).g;
  fresh.Store.set("questRuns",env); fresh.hydrateQuestRuns();
  assert.strictEqual(fresh.enterQuestRun(f.id).ok,true);
  assert.deepEqual(fresh.currentSong().tracks,before.versions.A.song.tracks);
  assert.notDeepEqual(fresh.currentSong().tracks,field);
  assert.strictEqual(fresh.questUnsavedEdit,null);
});

test("saved state and finale use the song title and distinguish deletion from a missing artifact record", t=>{
  // MUTATIONS: infer saved from status, use stale run title, permit active/no-artifact finale.
  const {g,run,def}=completed(t), r=clone(run()), saves=clone(g.getSaves());
  saves.unshift({meta:{localId:"unrelated-song",title:"Wrong song"}});
  saves.find(s=>s.meta.localId===r.artifact.artifactId).meta.title="Song wins";
  const view={saved:g.questSavedState(saves,r),stages:{"paths-of-song":3,"pulse-woods":2}};
  assert.deepEqual(view.saved,{present:true,title:"Song wins"});
  const m=g.questFinaleModel(r,def,view);
  assert.strictEqual(m.songTitle,"Song wins"); assert.strictEqual(m.stale,true);
  assert.deepEqual(m.nameField,{value:"Song wins",maxLength:80,enabled:true});
  assert.strictEqual(m.saved,true); assert.ok(m.savedText.includes("Song wins"));
  assert.deepEqual(m.voices.map(v=>[v.stage,v.lines]),[[3,[]],[2,[]]]);
  assert.deepEqual(m.actions.map(a=>a.id),["name-song","open-studio","back-to-map"]);
  assert.strictEqual(g.questShellModel(r,def,view).saved,def.completion.completionText);
  const deleted=g.questFinaleModel(r,def,{saved:g.questSavedState([],r)});
  assert.strictEqual(deleted.saved,false); assert.strictEqual(deleted.nameField.enabled,false);
  assert.strictEqual(deleted.actions[0].enabled,false);
  assert.ok(deleted.actions.slice(1).every(a=>a.enabled));
  assert.strictEqual(deleted.songTitle,r.artifact.title);
  assert.match(deleted.savedText,/not in your melodies/);
  assert.match(g.questShellModel(r,def,{saved:g.questSavedState([],r)}).saved,/not in your melodies/);
  for(const status of ["active","offering","abandoned"])
    assert.strictEqual(g.questFinaleModel({...r,status},def,view),null);
  for(const artifact of [null,undefined]){
    assert.strictEqual(g.questFinaleModel({...r,artifact},def,view),null);
    assert.deepEqual(g.questSavedState(saves,{...r,artifact}),{present:false,title:null});
  }
  assert.strictEqual(g.questFinaleModel(null,def,view),null);
  assert.strictEqual(g.questFinaleModel(r,null,view),null);
  assert.deepEqual(g.questSavedState([null,{}, {meta:{localId:"someone-else"}}],r),{present:false,title:null});
});

test("rename saves the song first and same-text retry repairs partial success without rewriting the song", t=>{
  // MUTATIONS: run-first ordering, discard setSaves failure, ignore partial failure, skip stale repair.
  const {g,run}=completed(t), old=clone(run()), oldSaves=clone(g.getSaves());
  const set=g.Store.set, writes=[]; let fail="saves";
  g.Store.set=(k,v)=>{
    if(k==="saves" || k==="questRuns") writes.push(k);
    if(k===fail)return false;
    if(k==="questRuns") assert.strictEqual(g.getSaves()[0].meta.title,"New song","song lands first");
    return set(k,v);
  };
  assert.deepEqual(g.performQuestAction("name-song",{title:" New song "}),{ok:false,code:"rename-failed"});
  assert.deepEqual(writes,["saves"]); assert.deepEqual(run(),old); assert.deepEqual(g.getSaves(),oldSaves);
  writes.length=0; fail="questRuns";
  assert.deepEqual(g.performQuestAction("name-song",{title:"New song"}),{ok:true,partial:"run-not-updated",title:"New song"});
  assert.deepEqual(writes,["saves","questRuns"]); assert.deepEqual(run(),old);
  assert.strictEqual(g.questFinaleRendered.songTitle,"New song"); assert.strictEqual(g.questFinaleRendered.stale,true);
  writes.length=0; fail=null;
  assert.deepEqual(g.performQuestAction("name-song",{title:"New song"}),{ok:true,title:"New song"});
  assert.deepEqual(writes,["questRuns"]); assert.strictEqual(run().artifact.title,"New song");
  assert.strictEqual(g.questFinaleRendered.stale,false);
  writes.length=0;
  assert.strictEqual(g.performQuestAction("name-song",{title:"New song"}).ok,true);
  assert.deepEqual(writes,[]);
  assert.deepEqual(run().versions,old.versions,"naming is not editing the music");
});

test("rename validates boundaries and refuses deleted songs or unfinished runs without writes", t=>{
  // MUTATIONS: drop validation, rename non-completed runs, or write a run when its song is absent.
  const f=launch(t),{g}=f;
  assert.strictEqual(g.performQuestAction("name-song",{title:"A"}).code,"not-completed");
  const c=completed(t), writes=[],set=c.g.Store.set;
  c.g.Store.set=(k,v)=>{writes.push(k);return set(k,v);};
  for(const title of ["","   ","x".repeat(81)])
    assert.strictEqual(c.g.performQuestAction("name-song",{title}).code,"bad-title");
  assert.deepEqual(writes,[]);
  assert.strictEqual(c.g.performQuestAction("name-song",{title:"x".repeat(80)}).ok,true);
  assert.strictEqual(c.run().artifact.title.length,80);
  c.g.setSaves([]); writes.length=0;
  assert.strictEqual(c.g.performQuestAction("name-song",{title:"Gone"}).code,"no-artifact");
  assert.deepEqual(writes,[]);
});

test("rename reducer owns its artifact and refuses absent artifacts and unfinished runs", t=>{
  // MUTATIONS: mutate the old artifact, or remove the completed/artifact guards.
  const {g,run}=completed(t), r=clone(run()), before=clone(r);
  const next=g.reduceQuestRun(r,{type:"rename",title:"Reducer title",at:100});
  assert.strictEqual(next.ok,true); assert.strictEqual(next.run.artifact.title,"Reducer title");
  assert.deepEqual(r,before); assert.notStrictEqual(next.run.artifact,r.artifact);
  for(const bad of [{...r,status:"active"},{...r,artifact:null}])
    assert.strictEqual(g.reduceQuestRun(bad,{type:"rename",title:"Bad",at:100}).code,"not-completed");
  for(const title of [null,3,""])
    assert.strictEqual(g.reduceQuestRun(r,{type:"rename",title,at:100}).code,"bad-title");
});

test("offer retry and boot recovery return completion without starting the party", t=>{
  // MUTATIONS: fire finale from the controller/recovery, or omit the foreground finale signal.
  for(const retry of [false,true]){
    const f=compare(t),{g,id,run}=f, set=g.Store.set;
    g.questShowFinale=()=>assert.fail("controller must not throw the party");
    g.start=()=>assert.fail("controller started transport");
    g.confetti=()=>assert.fail("controller threw confetti");
    if(retry){
      g.Store.set=(k,v)=>k==="saves"?false:set(k,v);
      assert.strictEqual(g.performQuestAction("offer").ok,false); g.Store.set=set;
    }
    const result=g.performQuestAction(retry?"retry-offer":"offer");
    assert.strictEqual(result.ok,true); assert.strictEqual(result.finale,true);
    assert.strictEqual(result.artifactId,run().artifact.artifactId);
    assert.strictEqual(g.getSaves()[0].meta.title,f.def.completion.defaultTitle);
  }
  const f=compare(t),{g}=f, set=g.Store.set;
  g.Store.set=(k,v)=>k==="saves"?false:set(k,v); g.performQuestAction("offer"); g.Store.set=set;
  g.setPlayScope({kind:"package",packageId:"intro"});
  g.start=()=>assert.fail("boot started playback");
  g.questShowFinale=()=>assert.fail("boot presented finale");
  g.confetti=()=>assert.fail("boot celebrated");
  g.recoverQuestOfferings(); assert.strictEqual(f.run().status,"completed");
  assert.strictEqual(g.questFinaleShown,null);
});

test("finale claims its key before reentrant start and clears playback constraints once", t=>{
  // MUTATIONS: claim after start, omit a key field/reset, or turn looping off only for Firefly.
  for(const questId of ["firefly-crossing","waking-woods"]){
    const {g,id,run}=completed(t,questId), before=clone(run()); let starts=0, parties=0, reentry;
    g.confetti=()=>{parties++;};
    assert.strictEqual(g.looping,true,questId+" must reach the finale with its loop default still on");
    g.loopStart=4;g.loopEnd=12;g.pinCursor(7);
    g.start=opts=>{
      starts++;
      assert.deepEqual(opts,{versionId:run().artifact.versionId,purpose:"finale"});
      assert.strictEqual(g.looping,false);assert.strictEqual(g.rangeOn(),false);
      assert.strictEqual(g.cursorPinned,false);assert.strictEqual(g.cursorCol,0);
      // Guard the probe itself against infinite recursion in the deliberately broken mutant.
      if(starts===1){g.renderQuestShell();reentry=g.questShowFinale(id);}
    };
    assert.strictEqual(g.questShowFinale(id),true); assert.strictEqual(reentry,false);
    assert.strictEqual(starts,1);assert.strictEqual(parties,1);
    g.renderQuestFinale();g.renderQuestShell();
    assert.strictEqual(g.questShowFinale(id),false);
    assert.strictEqual(g.performQuestAction("retry-offer").ok,false);
    assert.strictEqual(g.questShowFinale(id),false);
    assert.deepEqual(run(),before,"party has no receipt or run write");
    // Isolate each component; normal new runs change all three and cannot prove all three matter.
    run().artifact.savedAt++; assert.strictEqual(g.questShowFinale(id),true);
    run().artifact.artifactId+="-other"; assert.strictEqual(g.questShowFinale(id),true);
    const other=clone(run()); other.runId=id+"-other";g.QUEST_RUNS[other.runId]=other;
    assert.strictEqual(g.questShowFinale(other.runId),true);
    assert.strictEqual(starts,4);assert.strictEqual(parties,4);
  }
});

test("finale refuses missing incomplete or unresolvable runs without effects", t=>{
  // MUTATION: party without a completed run, definition, or artifact.
  const {g,id,run}=launch(t);
  g.start=g.confetti=()=>assert.fail("invalid finale had effects");
  assert.strictEqual(g.questShowFinale("absent"),false);
  assert.strictEqual(g.questShowFinale(id),false);
  run().artifact={artifactId:"x",savedAt:1};
  assert.strictEqual(g.questShowFinale(id),false,"artifact alone does not mean completed");
  run().artifact=null;
  run().status="completed";
  assert.strictEqual(g.questShowFinale(id),false);
  run().artifact={artifactId:"x",savedAt:1};run().questId="withdrawn";
  assert.strictEqual(g.questShowFinale(id),false);
  assert.strictEqual(g.questFinaleShown,null);
});

test("completed finale playback cannot create a completion session or change receipts", t=>{
  // MUTATION: allow beginCompletionSession to record evidence for completed runs.
  const {g,id,run}=completed(t),before=clone(run()),stored=clone(g.Store.get("questRuns"));
  const writes=[],set=g.Store.set;g.Store.set=(k,v)=>{writes.push(k);return set(k,v);};
  assert.strictEqual(g.beginCompletionSession({versionId:run().artifact.versionId,purpose:"finale"}),null);
  assert.strictEqual(g.activeCompletionSessionId(),null);
  g.onCompletePass({runId:id,versionId:run().draft,editRev:run().versions[run().draft].editRev,
    sessionId:"late-finale",purpose:"finale"});
  assert.deepEqual(run(),before);assert.deepEqual(g.Store.get("questRuns"),stored);assert.deepEqual(writes,[]);
});

test("finale navigation commits the typed name before either exit and still exits on a refused name", t=>{
  // Boundary ordering only: no assertions about focus, DOM rendering, or what audio played.
  // MUTATIONS: skip naming, navigate first, or trap navigation on a failed rename.
  const {g}=completed(t),events=[];
  g.__window.document={getElementById:id=>id==="finName"?{value:"  My new title  "}:{style:{}}};
  g.setStatus=()=>{};
  for(const exit of ["studio","map"])for(const ok of [true,false]){
    events.length=0;
    g.performQuestAction=(id,opts)=>{events.push([id,opts]);return ok?{ok:true}:{ok:false,code:"rename-failed"};};
    g.questFinaleLeave(()=>events.push(exit));
    assert.deepEqual(events,[["name-song",{title:"My new title"}],exit]);
  }
});
