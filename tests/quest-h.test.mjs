// Step H: pure evidence, catalog contracts and effect-boundary wiring. No claims about pixels/audio.
import { test } from "node:test";
import assert from "node:assert";
import vm from "node:vm";
import { loadQuestGame } from "./helpers/quest-fixtures.mjs";
import { launch, compare, clone } from "./helpers/quest-e6-fixtures.mjs";

const fresh = () => loadQuestGame({ fresh: true });
const primitive = g => g.QUEST_PRIMITIVES["phrase.on-every-beat"];
const song = (cols, notes = []) => ({ v:3, meta:{title:null,created:0,updated:0,author:null},
  palette:"pentatonic", time:{cols,tempo:108,groove:0}, tracks:[
    {kind:"melody",voice:"musicbox",notes:notes.map(([p,c,len=1])=>({p,c,len}))},
    {kind:"drums",hits:[]} ] });
const onBeats = width => Array.from({length:Math.ceil(width/4)},(_,i)=>[60,i*4]);
const freeze = x => { if(x && typeof x==="object") { Object.values(x).forEach(freeze); Object.freeze(x); } return x; };
const observation = {analyzerId:"phrase.on-every-beat",params:{},descriptorId:"way-tune-on-beats"};
function hand(g,d,cols=[4,8,12],index=0) {
  return {kind:"waypoints",generatorVersion:g.QUEST_SETUP_GENERATOR_VERSION,
    waypoints:cols.map((col,i)=>({col,row:[1,3,2][i]})),
    fragment:{index,hits:clone(d.setup.fragments[index])}};
}

test("beat evidence counts distinct projected onset columns across the effective song span", () => {
  // MUTATIONS: count stacked seeds/duplicates, use raw cols or 16 forever, count every second column,
  // include off-span notes or sustained tails, consult live state, or require no notes between beats.
  const g=fresh(),p=primitive(g);
  g.applySong(song(32,onBeats(32))); // unrelated live song must never supply evidence
  const cases=[
    [16,[],0,4,0,false], [1,[[60,0],[60,12]],2,4,2,false],
    [16,[[60,0],[64,0],[67,0],[72,0]],4,4,1,false],
    [16,[[60,0],[60,0],[60,0],[60,16],[60,-1]],1,4,1,false],
    [16,[[60,1,8]],1,4,0,false],
    [16,[[60,1],[64,2],[67,3],[72,15]],4,4,0,false],
    [16,onBeats(16),4,4,4,true],
    [16,[...onBeats(16),[64,2],[67,7]],6,4,4,true],
    [32,onBeats(16),4,8,4,false], [32,onBeats(32),8,8,8,true],
    [17,onBeats(16),4,5,4,false], [17,onBeats(17),5,5,5,true],
  ];
  for(const [cols,notes,onsets,beats,hit,ok] of cases) {
    const s=freeze(song(cols,notes)),ev=g.songEvidence(s);
    assert.strictEqual(ev.valid,true);
    assert.deepEqual([ev.melodyOnsetCount,ev.beatCount,ev.melodyBeatsHit],[onsets,beats,hit]);
    const before=JSON.stringify(ev);freeze(ev);
    assert.deepEqual(p.evaluate(ev,null,{}),{ok,facts:{onsets,beats,hit}});
    assert.strictEqual(JSON.stringify(ev),before);
  }
  // Every subset, not merely the first half: catches a missed last beat or one special-cased column.
  for(const width of [16,32])for(let mask=0;mask<2**(width/4);mask++) {
    const notes=onBeats(width).filter((_,i)=>mask & (1<<i));
    const ev=g.songEvidence(song(width,notes));
    assert.strictEqual(ev.melodyBeatsHit,notes.length);
    assert.strictEqual(p.evaluate(ev,null,{}).ok,notes.length===width/4);
  }
  const d=g.QUEST_DEFINITIONS["waking-woods"],inst=hand(g,d);
  const stones=g.QUEST_SETUP_KINDS.waypoints.startingSong(d,inst);
  stones.tracks[0].notes.push({p:60,c:0,len:1});
  assert.strictEqual(p.evaluate(g.songEvidence(stones),null,{}).ok,true,"three beat stones and one player onset");
});

test("beat descriptions are exclusive silent when empty and confined to declared tokens", () => {
  // MUTATIONS: give silence a sentence, invert some/none, call partial coverage every, or drop a token.
  const g=fresh(),p=primitive(g),seen=new Set();
  for(const beats of [4,8])for(let hit=0;hit<=beats;hit++)for(const extra of [0,1,7]) {
    const f=freeze({onsets:hit+extra,beats,hit});
    const expected=!f.onsets ? [] : [{id:hit===beats ? "heard-tune-every-beat"
      : hit ? "heard-tune-some-beats" : "heard-tune-between-beats"}];
    for(const got of [g.describeBeats(f),p.describe(f)]) {
      assert.deepEqual(got,expected);
      for(const token of got) { seen.add(token.id);assert.ok(p.heardDescriptorIds.includes(token.id)); }
    }
  }
  assert.deepEqual([...seen].sort(),[...p.heardDescriptorIds].sort());
  assert.deepEqual(g.questRenderTokens([...seen].map(id=>({id}))).map(t=>t.text).sort(),[
    "The tune landed on every beat.","The tune landed on some of the beats.",
    "The tune landed between the beats."].sort());
  assert.strictEqual(g.QUEST_DESCRIPTORS["way-tune-on-beats"].text,"a tune that lands on every beat");
});

test("Woods melody receipts reach the garden while Hopper keeps only the drums", t => {
  // MUTATIONS: misattribute melody tokens, omit heardDescriptorIds, omit primitive.describe, or hide
  // unmatched observations. Real receipts pass through persistence, rendering and the shell model.
  const f=launch(t,"waking-woods"),{g,def,run}=f;
  for(const phase of [0,1]) {
    for(const [notes,text] of [[onBeats(16),"The tune landed on every beat."],
      [[[60,0]],"The tune landed on some of the beats."],
      [[[60,1]],"The tune landed between the beats."],[[],null]]) {
      const s=song(16,notes);s.tracks[1].hits=onBeats(16).map(([,c])=>({lane:0,c}));
      g.applySong(s);g.noteEdit("heard-melody");f.receipt();
      const m=g.questShellModel(run(),def),hopper=m.voices.find(v=>v.name==="Hopper");
      assert.ok(hopper);assert.ok(hopper.lines.length>0);
      assert.ok(hopper.lines.every(line=>!line.includes("The tune")));
      assert.deepEqual(m.heard,text ? [text] : []);
      if(text) {
        const token=g.questObservationFor(run(),def.phases[phase].id).descriptorTokens.find(x=>x.text===text);
        assert.ok(token);assert.strictEqual(g.QUEST_DESCRIPTOR_CAPABILITY[token.descriptorId],"melody-making");
      }
    }
    if(phase===0) { f.ready();assert.strictEqual(g.performQuestAction("continue").ok,true); }
  }
});

// A fully valid melody+contour definition isolates the NEW taught prerequisite from capability earning.
// Neither capability needs footsteps. The positive control adds it, without changing anything else.
function melodyContour(g) {
  const d=clone(g.QUEST_DEFINITIONS["waking-woods"]);d.id="authored-melody-contour";
  delete d.setup;delete d.cast;
  d.capabilityIds=["melody-making","melodic-contour"];
  d.prerequisites.earnedByPackageIds=["intro","follow-the-fireflies"];
  const rise=song(16,[60,64,67,72].map((p,i)=>[p,i*4]));
  const fall=song(16,[72,67,64,60].map((p,i)=>[p,i*4]));
  d.witnesses=[];
  for(const phase of [0,1]) {
    const p=d.phases[phase];p.challenge.capabilityIds=clone(d.capabilityIds);
    p.challenge.routes=[0,1].map(i=>{
      const id=`melody-${phase}-${i}`,other=phase ? {
        analyzerId:i ? "contour.differs-from-snapshot" : "contour.same-family-as-snapshot",
        params:{snapshotVersionId:"A"},descriptorId:i ? "way-contour-changed" : "way-contour-kept"
      } : {analyzerId:"contour.any-of",params:{families:[i ? "fall" : "rise"]},descriptorId:"way-contour-any"};
      d.witnesses.push({id,phaseId:p.id,currentVersionId:phase ? "B" : "A",
        songs:phase ? {A:clone(rise),B:clone(i ? fall : rise)} : {A:clone(i ? fall : rise)}});
      return {id,witnessIds:[id],observations:[clone(observation),other]};
    });
  }
  return d;
}

test("analyzer teaching is enforced independently of capability prerequisites for authored quests", () => {
  // MUTATIONS: omit taught metadata/check, consult intro, check only compose, or special-case Woods.
  const g=fresh(),d=melodyContour(g);
  const load=x=>{g.loadQuestCatalog(JSON.stringify({v:1,definitions:[x]}),"official");return g.QUEST_CATALOG_ERRORS;};
  const errors=load(d);
  assert.strictEqual(errors.length,4,JSON.stringify(errors));
  assert.ok(errors.every(e=>e.code==="analyzer-not-taught" && e.extra.includes("footsteps")));
  assert.strictEqual(g.QUEST_DEFINITIONS[d.id],undefined);
  d.prerequisites.earnedByPackageIds.push("footsteps");
  assert.deepEqual(load(d),[]);assert.ok(g.QUEST_DEFINITIONS[d.id]);
});

test("minimum onset quests still validate without the new teaching guide or reach construction", () => {
  // MUTATIONS: require footsteps for every melody primitive, give every quest a guide, remove minimum,
  // or run the on-beat reach proof for primitives which did not declare it.
  const g=fresh(),d=melodyContour(g);
  for(const p of d.phases)for(const r of p.challenge?.routes||[]) {
    r.observations[0]={analyzerId:"phrase.minimum-onsets",params:{minimum:4},descriptorId:"way-enough-notes"};
  }
  g.loadQuestCatalog(JSON.stringify({v:1,definitions:[d]}),"official");
  assert.deepEqual(g.QUEST_CATALOG_ERRORS,[]);assert.ok(g.QUEST_DEFINITIONS[d.id]);
  assert.ok(g.questEnvelope(d)[0].steps.every(s=>!s.beatGuide));
  const p=g.QUEST_PRIMITIVES["phrase.minimum-onsets"];
  assert.strictEqual(p.evaluate(g.songEvidence(song(16,[[60,1],[64,2],[67,3],[72,5]])),null,{minimum:4}).ok,true);
  assert.strictEqual(p.evaluate(g.songEvidence(song(16,[[60,1]])),null,{minimum:4}).ok,false);
  const w=clone(JSON.parse(g.BUILTIN_QUEST_CATALOG_JSON).definitions.find(x=>x.id==="waking-woods"));
  for(const phase of w.phases)for(const route of phase.challenge?.routes||[])
    route.observations[0]={analyzerId:"phrase.minimum-onsets",params:{minimum:64},descriptorId:"way-enough-notes"};
  // This tests proof dispatch, not witness validity (the stock witnesses do not have 64 onsets).
  g.questProveReach=()=>assert.fail("minimum-onsets did not declare a construction");
  assert.strictEqual(g.questSetupRoutesReachable(w,hand(g,w)),null);
});

test("reach construction covers every legal stone column layout at 16 and 32 with every opening", t => {
  // MUTATIONS: omit any beat, overwrite a stone, use only 16 columns, or replace the completing base.
  // Exhaustive COLUMN layouts and fragments; representative legal rows. Pitch does not affect beat
  // membership. Independent expected sets verify the constructor before the actual analyzer reads it.
  const g=fresh(),d=clone(g.QUEST_DEFINITIONS["waking-woods"]),p=primitive(g),K=g.QUEST_SETUP_KINDS.waypoints;
  let checks=0,beatless=0;
  for(const width of [16,32]) {
    d.workspace.columns=width;
    for(let a=2;a<=width-11;a++)for(let b=a+4;b<=width-7;b++)for(let c=b+4;c<=width-3;c++)
      for(let index=0;index<d.setup.fragments.length;index++) {
        const inst=hand(g,d,[a,b,c],index);assert.strictEqual(K.validateInstance(inst,d.setup,d),null);
        const base=g.questSetupCompletion(d,inst),before=clone(base),s=p.reach(d,base),ev=g.songEvidence(s);
        for(const note of before.tracks[0].notes)assert.ok(s.tracks[0].notes.some(n=>n.p===note.p&&n.c===note.c));
        assert.deepEqual(s.tracks[1],before.tracks[1]);
        for(let col=0;col<width;col+=4)assert.ok(s.tracks[0].notes.some(n=>n.c===col),`${width}/${a},${b},${c}/${col}`);
        for(let col=0;col<width;col+=4)assert.strictEqual(s.tracks[0].notes.filter(n=>n.c===col).length,
          Math.max(1,before.tracks[0].notes.filter(n=>n.c===col).length),"occupied beats need no extra seed");
        assert.strictEqual(ev.melodyBeatsHit,width/4);assert.strictEqual(p.evaluate(ev,null,{}).ok,true);
        assert.deepEqual(g.QUEST_READINESS.waypoints.missing(d,inst,ev),[]);
        assert.strictEqual(g.questProveReach(d,inst,p,observation),null);
        if(K.regions(inst,d).some(r=>!Array.from({length:r.to-r.from+1},(_,i)=>r.from+i).some(c=>c%4===0)))beatless++;
        checks++;
      }
  }
  assert.strictEqual(checks,9360);assert.ok(beatless>0);
  t.diagnostic(`${checks} column-layout/opening combinations; ${beatless} include a beatless region`);
});

test("reach proof refuses constructions that fail readiness workspace evidence params or the analyzer", () => {
  // MUTATIONS: skip each proof obligation, or accept a constructor's claim without executing evaluate.
  const g=fresh(),d=g.QUEST_DEFINITIONS["waking-woods"],inst=hand(g,d),p=primitive(g);
  assert.strictEqual(g.questProveReach(d,inst,p,observation),null);
  for(const [reason,change] of [
    ["analyzer",s=>{s.tracks[0].notes=s.tracks[0].notes.filter(n=>n.c!==0);} ],
    ["not-ready",s=>{s.tracks[0].notes=s.tracks[0].notes.filter(n=>n.c<5||n.c>7);} ],
    ["not-ready",s=>{s.tracks[1].hits=[];} ],
    ["workspace",s=>{s.time.cols=32;} ],
    ["invalid",s=>{s.v=99;} ],
  ]) {
    const bad={...p,reach:(def,s)=>{const result=p.reach(def,s);change(result);return result;}};
    const s=bad.reach(d,g.questSetupCompletion(d,inst));
    if(reason==="not-ready")assert.strictEqual(p.evaluate(g.songEvidence(s),null,{}).ok,true,"isolate readiness");
    if(reason==="analyzer")assert.deepEqual(g.QUEST_READINESS.waypoints.missing(d,inst,g.songEvidence(s)),[],"isolate analyzer");
    assert.strictEqual(g.questProveReach(d,inst,bad,observation),reason);
  }
  assert.strictEqual(g.questProveReach(d,inst,p,{...observation,params:{unexpected:1}}),"params");
  const real=g.questSetupCompletion;g.questSetupCompletion=()=>null;
  assert.strictEqual(g.questProveReach(d,inst,p,observation),"no-completion");g.questSetupCompletion=real;
  let called=0;
  assert.strictEqual(g.questProveReach(d,inst,{...p,evaluate:(ev,snap,params)=>{
    called++;assert.strictEqual(ev.valid,true);assert.strictEqual(snap,null);assert.deepEqual(params,{});return {ok:false};
  }},observation),"analyzer");
  assert.strictEqual(called,1);
});

test("route reach dispatch executes each declared construction before the contour filter", () => {
  // MUTATIONS: skip reach entirely, skip transform/later routes, swallow its refusal, or use quest ids.
  const g=fresh(),d=clone(g.QUEST_DEFINITIONS["waking-woods"]);d.id="authored-reach";
  const inst=hand(g,d),expected=d.phases.flatMap(p=>p.challenge?.routes||[]);
  for(const target of expected) {
    const visited=[];g.questProveReach=(def,setup,prim,obs)=>{
      assert.strictEqual(def,d);assert.strictEqual(setup,inst);assert.strictEqual(prim,primitive(g));
      visited.push(obs);return obs===target.observations[0] ? "analyzer" : null;
    };
    assert.strictEqual(g.questSetupRoutesReachable(d,inst),"route-unreachable:"+target.id);
    assert.strictEqual(visited.at(-1),target.observations[0]);
  }
});

test("beat guides derive from declared analyzers on every phase independent of quest id or matches", () => {
  // MUTATIONS: key on Woods, light only challenged phases, inspect only phase/route zero, or require a match.
  const g=fresh(),woods=g.QUEST_DEFINITIONS["waking-woods"],firefly=g.QUEST_DEFINITIONS["firefly-crossing"];
  for(const [d,on] of [[woods,true],[firefly,false]]) {
    assert.deepEqual([...g.questFieldGuides(d)],on ? ["beats"] : []);
    assert.deepEqual(g.questEnvelope(d)[0].steps.map(s=>s.beatGuide),[on,on,on]);
  }
  for(const phase of [0,1])for(const route of [0,1]) {
    const d=clone(woods);d.id="authored-guide";
    for(const p of d.phases)for(const r of p.challenge?.routes||[])
      r.observations[0]={analyzerId:"phrase.minimum-onsets",params:{minimum:4},descriptorId:"way-enough-notes"};
    assert.ok(g.questEnvelope(d)[0].steps.every(s=>!s.beatGuide));
    d.phases[phase].challenge.routes[route].observations[0]=clone(observation);
    g.questEvaluateRun=()=>assert.fail("guides must not evaluate matches");
    g.applySong(song(16)); // there is no tune to match
    assert.deepEqual(g.questEnvelope(d)[0].steps.map(s=>s.beatGuide),[true,true,true]);
  }
});

test("quest repaint applies guides and rings after loading the song on entry resume and phase changes", t => {
  // MUTATIONS: omit decoration, apply before the destructive rebuild, force the guide off, or only Firefly.
  for(const questId of ["firefly-crossing","waking-woods"]) {
    const g=fresh(),events=[],apply=g.applySong,decor=g.applyStageDecor,mark=g.questMarkLandmarks;
    const beat=g.setBeatGuide;
    g.applySong=s=>{const r=apply(s);events.push("loaded");return r;};
    g.applyStageDecor=()=>{events.push("decor");return decor();};
    g.setBeatGuide=on=>{events.push(["beat",on]);return beat(on);};
    g.questMarkLandmarks=(r,d)=>{assert.strictEqual(r,g.QUEST_RUNS[g.activeScope.runId]);
      assert.strictEqual(d,g.QUEST_DEFINITIONS[questId]);events.push("rings");return mark(r,d);};
    const begun=g.startQuestRun(questId);assert.strictEqual(begun.ok,true,begun.code);
    t.after(()=>{if(g.playing)g.stop();clearTimeout(g.autosaveT);});
    const check=()=>{
      assert.ok(events.indexOf("loaded")>=0);assert.ok(events.indexOf("decor")>events.indexOf("loaded"));
      assert.ok(events.indexOf("rings")>events.indexOf("decor"));
      assert.deepEqual(events.filter(e=>Array.isArray(e)&&e[0]==="beat").at(-1),["beat",questId==="waking-woods"]);
    };
    check();events.length=0;assert.strictEqual(g.enterQuestRun(begun.runId).ok,true);check();
    for(const phase of [1,2]) {
      const r=g.QUEST_RUNS[begun.runId];r.phase=phase;
      events.length=0;g.renderStage();check();
    }
  }
});

test("undo and redo redecorate both quests with the current melody stones and opening drum rings", t => {
  // MUTATIONS: omit restore decorations, ring only Firefly, forward the wrong setup, or omit either
  // set of landmark effects. Boundary spies check addresses/calls, never classList.contains or pixels.
  for(const questId of ["firefly-crossing","waking-woods"]) {
    const {g,run,def}=launch(t,questId),events=[],decor=g.applyStageDecor,mark=g.questMarkLandmarks;
    g.applyStageDecor=()=>{events.push("decor");return decor();};
    g.setBeatGuide=on=>events.push(["beat",on]);
    g.questMarkLandmarks=(r,d)=>{assert.strictEqual(r,run());assert.strictEqual(d,def);
      events.push(["rings",clone(r.setup)]);return mark(r,d);};
    g.journalClear();g.modelSetCell(0,0,true);
    for(const action of [g.undoEdit,g.redoEdit]) {
      events.length=0;action();
      assert.ok(events.includes("decor"));
      assert.deepEqual(events.find(e=>Array.isArray(e)&&e[0]==="beat"),["beat",questId==="waking-woods"]);
      assert.deepEqual(events.find(e=>Array.isArray(e)&&e[0]==="rings"),["rings",run().setup]);
    }
    const calls=[],grid=Array.from({length:g.ROWS},(_,row)=>Array.from({length:16},(_,col)=>({classList:{
      add:cls=>calls.push(["melody",row,col,cls]),remove:()=>{} }})));
    const pads=Array.from({length:3},(_,lane)=>Array.from({length:16},(_,col)=>({classList:{
      add:cls=>calls.push(["drums",lane,col,cls]),remove:()=>{} }})));
    const markEffects=vm.runInNewContext(`(${mark.toString()})`,{cells:grid,dcells:pads});
    markEffects(run(),def);
    assert.deepEqual(calls,[...run().setup.waypoints.map(p=>["melody",p.row,p.col,"landmark"]),
      ...run().setup.fragment.hits.map(h=>["drums",h.lane,h.c,"landmark"])]);
  }
});

test("leaving Woods for a lesson or Studio clears the guide and returning restores it", t => {
  // MUTATIONS: latch true guides, copy quest steps into another scope, or fail to repaint on return.
  const {g,id}=launch(t,"waking-woods"),calls=[],set=g.setBeatGuide;
  g.setBeatGuide=on=>{calls.push(on);return set(on);};
  for(const enter of [()=>g.openPkg("intro",0),()=>g.openStudio()]) {
    g.leaveQuest();calls.length=0;enter();
    assert.ok(calls.length);assert.ok(calls.every(on=>!on));
    assert.strictEqual(!!g.curStage().beatGuide,false);
    calls.length=0;assert.strictEqual(g.enterQuestRun(id).ok,true);
    assert.strictEqual(calls.at(-1),true);
  }
});

test("switching comparison versions reapplies the guide and both landmark sets after the load", t => {
  // MUTATIONS: skip the redecoration after a switch, run it before the rebuild, or ring only one quest.
  // Found red by the step H tester: pick called applySong directly and rebuilt away every decoration.
  const failures=[];
  for(const questId of ["waking-woods","firefly-crossing"]) {
    const {g}=compare(t,questId),events=[],rebuild=g.rebuildField;
    g.rebuildField=()=>{const r=rebuild();events.push("rebuilt");return r;};
    g.setBeatGuide=on=>events.push(["beat",on]);
    g.questMarkLandmarks=(r,d)=>events.push(["rings",r.questId,d.id]);
    for(const versionId of ["A","B"]) {
      events.length=0;assert.strictEqual(g.performQuestAction("pick",{versionId}).ok,true);
      assert.ok(events.includes("rebuilt"));
      const after=events.slice(events.lastIndexOf("rebuilt")+1);
      const expected=[["beat",questId==="waking-woods"],["rings",questId,questId]];
      if(JSON.stringify(after)!==JSON.stringify(expected))failures.push({questId,versionId,after,expected});
    }
  }
  assert.deepEqual(failures,[],"comparison switches must redecorate after the last rebuild");
});
