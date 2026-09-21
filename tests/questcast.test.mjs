import { test } from "node:test";
import assert from "node:assert";
import vm from "node:vm";
import { launch, completed, clone } from "./helpers/quest-e6-fixtures.mjs";
import { loadQuestGame } from "./helpers/quest-fixtures.mjs";

test("cast catalog rules independently reject duplicate regions capabilities unclaimed powers and friendless regions", ()=>{
  // MUTATIONS: remove each individual semantic guard. Every specimen has exactly one error.
  const g=loadQuestGame({fresh:true}), original=clone(g.QUEST_DEFINITIONS["firefly-crossing"]);
  const cases=[
    ["duplicate-cast-region",d=>{d.cast[1].regionId=d.cast[0].regionId;}],
    ["duplicate-cast-capability",d=>{d.cast.push({regionId:"stone-chorus-canyon",capabilityId:"melodic-contour"});}],
    ["cast-capability-unclaimed",d=>{d.cast[1].capabilityId="melody-making";}],
    ["no-such-cast-region",d=>{d.cast[0].regionId="first-garden";}],
    ["no-such-cast-region",d=>{d.cast[0].regionId="constructor";}],
  ];
  for(const [code,mutate] of cases){
    const d=clone(original);mutate(d);
    g.loadQuestCatalog(JSON.stringify({v:1,definitions:[d]}),"official");
    assert.deepEqual(g.QUEST_CATALOG_ERRORS.map(e=>e.code),[code],code);
    assert.strictEqual(g.QUEST_DEFINITIONS[d.id],undefined);
  }
  // A resolvable region WITHOUT a friend distinguishes has(REGIONS) from the friend guard.
  const region=g.REGIONS[original.cast[0].regionId],friend=region.friend;delete region.friend;
  const errors=[]; g.questSemantics(original,errors); region.friend=friend;
  assert.deepEqual(errors.map(e=>e.code),["no-such-cast-region"]);
});

test("cast is optional and partial casts publish while malformed cast shapes do not", ()=>{
  // MUTATIONS: require cast, require every capability to speak, or weaken its closed grammar.
  const g=loadQuestGame({fresh:true}), d=clone(g.QUEST_DEFINITIONS["firefly-crossing"]);
  for(const variant of [()=>{delete d.cast;},()=>{d.cast=[{regionId:"pulse-woods",capabilityId:"steady-pulse"}];}]){
    variant();g.loadQuestCatalog(JSON.stringify({v:1,definitions:[d]}),"official");
    assert.deepEqual(g.QUEST_CATALOG_ERRORS,[]);assert.ok(g.QUEST_DEFINITIONS[d.id]);
  }
  for(const cast of [null,[],{},[{regionId:"pulse-woods"}],
    [{regionId:"pulse-woods",capabilityId:"steady-pulse",mood:"happy"}]]){
    g.loadQuestCatalog(JSON.stringify({v:1,definitions:[{...d,cast}]}),"official");
    assert.ok(g.QUEST_CATALOG_ERRORS.length);assert.strictEqual(g.QUEST_DEFINITIONS[d.id],undefined);
  }
});

test("descriptor ownership is uncontested and every contour and pulse fact stays with its own speaker", ()=>{
  // MUTATIONS: claim a descriptor for another capability, invert attribution, trust stored cap.
  const g=loadQuestGame({fresh:true}),d=g.QUEST_DEFINITIONS["firefly-crossing"];
  assert.deepEqual(g.questDescriptorConflicts(),[]);
  const owners=new Map();
  for(const p of Object.values(g.QUEST_PRIMITIVES)) if(p.kind==="musical" && p.capabilityId)
    for(const id of p.heardDescriptorIds||[]){
      if(!owners.has(id))owners.set(id,new Set());owners.get(id).add(p.capabilityId);
    }
  for(const [id,caps] of owners){assert.strictEqual(caps.size,1,id);assert.strictEqual(g.QUEST_DESCRIPTOR_CAPABILITY[id],[...caps][0]);}
  assert.ok(Object.isFrozen(g.QUEST_DESCRIPTOR_CAPABILITY));
  for(const [ids,cap,opposite] of [[g.QUEST_HEARD_CONTOUR_PAIR,"melodic-contour","steady-pulse"],
    [g.QUEST_HEARD_PULSE_PAIR,"steady-pulse","melodic-contour"]]){
    const tokens=ids.map(id=>({descriptorId:id,text:`fact ${id}`,cap:opposite,capabilityId:opposite}));
    const voices=g.questCastVoices(d,tokens,{});
    assert.deepEqual(voices.find(v=>v.capabilityId===cap).lines,tokens.map(t=>t.text));
    assert.deepEqual(voices.find(v=>v.capabilityId===opposite).lines,[]);
    assert.deepEqual(g.questNarratorTokens(d,tokens),[]);
  }
});

test("cast order growth and silence derive only from explicit inputs", ()=>{
  // MUTATIONS: sort voices by token arrival, read live stages, invent listening text, fail stage bounds.
  const g=loadQuestGame({fresh:true}),d=clone(g.QUEST_DEFINITIONS["firefly-crossing"]);
  d.id="a-different-commission";d.cast.reverse();
  const tokens=g.questRenderTokens([{id:"heard-contour-rise"}]);
  g.regionStage=()=>assert.fail("read live growth");
  for(const [stage,want] of [[undefined,0],[1.5,0],[-10,0],[2,2],[999,4]]){
    const stages={"pulse-woods":stage,"paths-of-song":3};
    const v=g.questCastVoices(d,tokens,stages);
    assert.deepEqual(v.map(v=>v.name),["Hopper","Flutter"]);
    assert.strictEqual(v[0].stage,want);assert.strictEqual(v[0].emoji,g.REGIONS["pulse-woods"].friend.stages[want]);
    assert.deepEqual(v[0].lines,[]);assert.deepEqual(v[1].lines,["The notes climbed."]);
  }
  assert.deepEqual(g.questCastVoices({},tokens,{}),[]);
  assert.deepEqual(g.questCastVoices({cast:[{regionId:"first-garden",capabilityId:"melody-making"}]},tokens,{}),[]);
  assert.deepEqual(g.questCastVoices(d,[],{}).map(v=>v.lines),[[],[]]);
  const woods=g.QUEST_DEFINITIONS["waking-woods"];
  assert.deepEqual(woods.cast,[{regionId:"pulse-woods",capabilityId:"steady-pulse"}]);
});

test("contested descriptor ownership stays null in either order and reaches only the narrator", ()=>{
  // MUTATIONS: first/last owner wins, null becomes owned again, or hide the conflict report.
  const g=loadQuestGame({fresh:true});
  const source=g.__script.slice(g.__script.indexOf("const QUEST_DESCRIPTOR_CAPABILITY="),
    g.__script.indexOf("// GROOVES is an array"));
  assert.ok(source.includes("const questDescriptorConflicts"));
  for(const owners of [["melodic-contour","steady-pulse","steady-pulse"],
    ["steady-pulse","melodic-contour","melodic-contour"]]){
    const primitives=Object.fromEntries(owners.map((capabilityId,i)=>[i,{kind:"musical",capabilityId,heardDescriptorIds:["shared"]}]));
    const result=vm.runInNewContext(source+"\n"+g.questCastVoices.toString()+"\n"+g.questNarratorTokens.toString()+
      '\n({owner:QUEST_DESCRIPTOR_CAPABILITY.shared,conflicts:questDescriptorConflicts(),voices:questCastVoices(def,tokens,{}),narrator:questNarratorTokens(def,tokens)})',
      {QUEST_PRIMITIVES:primitives,REGIONS:g.REGIONS,def:g.QUEST_DEFINITIONS["firefly-crossing"],tokens:[{descriptorId:"shared",text:"Contested fact"}]});
    assert.strictEqual(result.owner,null);assert.deepEqual(result.conflicts,["shared"]);
    assert.deepEqual(result.voices.map(v=>v.lines),[[],[]]);
    assert.deepEqual(result.narrator,[{descriptorId:"shared",text:"Contested fact"}]);
  }
});

test("legacy id-only observations survive persistence rendering and narrator fallback", t=>{
  // MUTATIONS: require persisted cap, drop unclaimed tokens, or rewrite the saved token schema.
  const f=launch(t),{g,id,def,run}=f;f.ready();
  const phase=def.phases[0].id, raw=clone(run().evidence.observations[phase]);
  assert.ok(raw.descriptorTokens.length);
  for(const token of raw.descriptorTokens)assert.ok(Object.keys(token).every(k=>k==="id"||k==="slots"));
  g.hydrateQuestRuns();
  assert.deepEqual(run().evidence.observations[phase],raw);
  const tokens=g.questObservationFor(run(),phase).descriptorTokens;
  assert.ok(tokens.length);assert.ok(tokens.every(t=>t.text));
  // There is no persisted date/cap discriminator: legacy known ids now derive attribution too.
  // An old definition with NO cast keeps every sentence in the narrator, exactly as before.
  const noCast=clone(def);delete noCast.cast;
  assert.deepEqual(g.questShellModel(run(),noCast,{}).heard,tokens.map(t=>t.text));
  assert.deepEqual(g.questNarratorTokens(noCast,tokens),tokens);
  const partial={...def,cast:[def.cast[0]]}, unclaimed=tokens.filter(t=>t.descriptorId.startsWith("heard-pulse-"));
  assert.ok(unclaimed.length);assert.deepEqual(g.questNarratorTokens(partial,tokens),unclaimed);
  const unknown={descriptorId:"unclaimed-future-fact",text:"A retained sentence."};
  assert.deepEqual(g.questNarratorTokens(def,[unknown]),[unknown]);
  assert.deepEqual(g.questCastVoices(def,[unknown],{}).map(v=>v.lines),[[],[]]);
});

test("identical saved tokens produce identical voices for every route-success subset", t=>{
  // MUTATION: change a voice or narrator line according to matchedRouteIds, including the finale.
  const {g,run,def}=completed(t), r=clone(run()),phase=def.phases[0], reference=clone(r.evidence.observations[phase.id]);
  r.phase=0;r.status="active";
  const base=g.questShellModel(r,def,{stages:{"paths-of-song":4}});
  for(let bits=0;bits<(1<<phase.challenge.routes.length);bits++){
    r.evidence.observations[phase.id]={...reference,matchedRouteIds:phase.challenge.routes.filter((_,i)=>bits&(1<<i)).map(x=>x.id)};
    const m=g.questShellModel(r,def,{stages:{"paths-of-song":4}});
    assert.deepEqual(m.voices,base.voices);assert.deepEqual(m.heard,base.heard);
    const finale=g.questFinaleModel({...r,status:"completed"},def,{});
    assert.ok(finale.voices.every(v=>v.lines.length===0));
  }
});

test("shell finale and cast models neither read live state nor mutate mutable inputs", t=>{
  // MUTATIONS: read Store/progress/grid/clock, call currentSong, or mutate an input before returning.
  const {g,run,def}=completed(t),d=clone(def),view={saved:{present:true,title:"Explicit"},stages:{"pulse-woods":1}};
  // Build an untouched input: the live fixture has already passed through shell rendering, which
  // can seed an in-place mutation before the before/after snapshot and create a false proof.
  const r=g.newQuestRun({runId:"isolated",questId:d.id,definitionVersion:d.v,
    song:clone(run().versions.B.song),span:{start:0,end:d.workspace.columns},at:1});
  r.status="completed";r.artifact=clone(run().artifact);
  const tokens=g.questRenderTokens([{id:"heard-pulse-main-kicks"}]);
  const before=clone({r,d,view,tokens});
  const expected=[g.questShellModel(r,d,view),g.questFinaleModel(r,d,view),g.questCastVoices(d,tokens,view.stages)];
  const poison=new Proxy({}, {get(){assert.fail("read live state");},ownKeys(){assert.fail("read live state");}});
  for(const name of ["currentSong","getSaves","regionStage","questRegionStages"])
    g[name]=()=>assert.fail("live call: "+name);
  g.grid=poison;g.progress=poison;g.QUEST_RUNS=poison;g.activeScope=poison;
  g.Store.get=g.Store.set=()=>assert.fail("read or wrote Store");
  g.questUnsavedEdit={runId:r.runId,versionId:r.draft};
  // Poison the VM clock without modifying Node's shared Date object.
  g.__window.Date={now:()=>assert.fail("read clock")};
  assert.deepEqual([g.questShellModel(r,d,view),g.questFinaleModel(r,d,view),g.questCastVoices(d,tokens,view.stages)],expected);
  assert.deepEqual({r,d,view,tokens},before);
});
