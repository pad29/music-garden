import { test } from "node:test";
import assert from "node:assert";
import vm from "node:vm";
import { loadGame } from "./harness.mjs";
import { launch, clone } from "./helpers/quest-e6-fixtures.mjs";
import { withBeatNotes } from "./helpers/quest-h-fixtures.mjs";

const fresh = () => loadGame({fresh:true});
const defOf = g => clone(g.QUEST_DEFINITIONS["firefly-crossing"]);
// The two official quests: their pools and rules are content, pinned by id. Every other assertion runs
// over whatever ships, each quest under its own rule, so a contributor's quest is proved without anyone
// editing this file (TUN-105).
const OFFICIAL = ["firefly-crossing","waking-woods"];
const shipsOfficial = g => { for(const id of OFFICIAL) assert.ok(g.QUEST_DEFINITIONS[id],id); };
const pool = [ [[0,0],[1,2]], [[0,0],[1,3]], [[1,1],[1,2]], [[0,0],[2,1]],
  [[2,0],[2,1],[1,3]], [[0,0],[2,2],[2,3]] ].map(f=>f.map(([lane,c])=>({lane,c})));
const codes = xs => Array.from(xs,x=>x.code).sort();
const freeze = x => { if(x && typeof x==="object") { Object.values(x).forEach(freeze); Object.freeze(x); } return x; };
const union = (...lists) => [...new Map(lists.flat().map(h=>[`${h.lane}:${h.c}`,{...h}])).values()];
const beat = (lane,step,width) => Array.from({length:Math.ceil(width/step)},(_,i)=>({lane,c:i*step}));
function song(g,d,hits) { const s=g.emptyQuestSong(d); s.tracks[1].hits=clone(hits); return s; }

test("fragment grammar and catalog refuse malformed pools and composite single attacks", () => {
  // MUTATIONS: relax any bound/closed shape, omit either semantic check, or never call checkRule.
  const g=fresh(), d=defOf(g), k=g.QUEST_SETUP_KINDS.waypoints;
  assert.strictEqual(g.QUEST_FRAGMENT_SPAN,4);
  for(const value of [null,{},[],Array(13).fill(pool[0]),[[]],[[pool[0][0]]],
    [[...pool[0],{lane:2,c:1},{lane:2,c:3}]],[[{lane:-1,c:0},{lane:1,c:2}]],
    [[{lane:3,c:0},{lane:1,c:2}]],[[{lane:0,c:-1},{lane:1,c:2}]],
    [[{lane:0,c:4},{lane:1,c:2}]],[[{lane:0,c:0.5},{lane:1,c:2}]],
    [[{lane:0,c:0,extra:true},{lane:1,c:2}]],[[{c:0},{lane:1,c:2}]]]) {
    const errors=[];
    assert.strictEqual(g.questCheck({...d.setup,fragments:value},k.parameterSchema,"$.setup",errors),false,JSON.stringify(value));
  }
  for(const fragments of [undefined,pool.slice(0,1),pool,Array(12).fill(pool[0])]) {
    const rule={...d.setup}; if(fragments)rule.fragments=fragments;else delete rule.fragments;
    assert.strictEqual(g.questCheck(rule,k.parameterSchema,"$.setup",[]),true);
  }
  for(const [frag,code] of [
    [[{lane:0,c:0},{lane:0,c:0},{lane:1,c:2}],"fragment-duplicate-hit"],
    [[{lane:0,c:0},{lane:1,c:0},{lane:2,c:0}],"fragment-one-attack"],
    [[{lane:0,c:0},{lane:0,c:2}],"fragment-blocks-route"]]) {
    const bad=clone(d);bad.setup.fragments=[...pool,frag];
    g.loadQuestCatalog(JSON.stringify({v:1,definitions:[bad]}),"official");
    assert.ok(g.QUEST_CATALOG_ERRORS.some(e=>e.code===code),JSON.stringify(g.QUEST_CATALOG_ERRORS));
    assert.strictEqual(g.QUEST_DEFINITIONS[d.id],undefined);
  }
});

test("every legal short fragment is proved against every shipped drum observation at every width", t => {
  // MUTATIONS: skip later fragments/routes/observations, accept off-grid kicks, or hard-code quest ids.
  // Enumerate all 2/3-hit subsets of the twelve pads, independently of the production probe builder.
  const g=fresh(), pads=Array.from({length:12},(_,i)=>({lane:Math.floor(i/4),c:i%4}));
  shipsOfficial(g);
  const fragments=[];
  for(let a=0;a<12;a++)for(let b=a+1;b<12;b++) {
    fragments.push([pads[a],pads[b]]);
    for(let c=b+1;c<12;c++)fragments.push([pads[a],pads[b],pads[c]]);
  }
  let checks=0;
  for(const original of Object.values(g.QUEST_DEFINITIONS))for(const width of [16,17,32,64]) {
    const d=clone(original);d.id="renamed-proof";d.workspace.columns=width;
    // An off-beat kick blocks a clean main beat — so only a quest that asks for one can be blocked by it.
    const asksMain=d.phases.some(p=>(p.challenge?.routes||[]).some(r=>r.observations.some(o=>o.analyzerId==="pulse.kick-on-main-beats")));
    for(const fragment of fragments.filter(f=>new Set(f.map(h=>h.c)).size>1)) {
      const evs=[[0,4],[0,2],[2,2]].map(([lane,step])=>g.songEvidence(song(g,d,union(fragment,beat(lane,step,width)))));
      const expected=[];
      for(const p of d.phases)for(const r of p.challenge?.routes||[])for(const o of r.observations) {
        const prim=g.QUEST_PRIMITIVES[o.analyzerId];if(!prim.requiredControlIds.includes("drums"))continue;
        const outcomes=prim.subject==="snapshot-pair"
          ? evs.flatMap(cur=>evs.map(snap=>prim.evaluate(cur,snap,o.params).ok))
          : evs.map(cur=>prim.evaluate(cur,null,o.params).ok);
        if(!outcomes.includes(true))expected.push({index:1,routeId:r.id,analyzerId:o.analyzerId});
      }
      assert.deepEqual(g.questFragmentBlocks(d,{...d.setup,fragments:[pool[0],fragment]}),expected);
      const mainBlocked=expected.some(x=>x.analyzerId==="pulse.kick-on-main-beats");
      assert.strictEqual(mainBlocked,asksMain && fragment.some(h=>h.lane===0 && h.c!==0));
      checks++;
    }
  }
  assert.ok(checks>0);
  t.diagnostic(`${checks} fragment/quest/width cases, including all ordered snapshot pairs`);
});

test("fragment proof executes arbitrary drum predicates and every ordered snapshot pair", () => {
  // MUTATIONS: substitute family-name comparison, restrict to unequal/unordered pairs, ignore params,
  // assume pulse.* ids, or inspect only the first observation. Synthetic registry is local to this VM.
  const g=fresh(), d=defOf(g), rule={...d.setup,fragments:[pool[0]]};
  const evs=g.questFragmentProbes(d,pool[0]).map(g.songEvidence);
  const key=ev=>JSON.stringify(ev.projected.drumG);
  const keys=evs.map(key);assert.strictEqual(new Set(keys).size,3);
  for(const subject of ["current","snapshot-pair"]) {
    const n=subject==="current"?3:9;
    for(let target=0;target<=n;target++) {
      const visited=[];
      const primitives={...g.QUEST_PRIMITIVES,"synthetic.drum-reader":{
        kind:"musical",subject,requiredControlIds:["drums"],parameterSchema:g.QP.minimum("minimum",1,64),
        evaluate:(cur,snap,p)=>{ assert.strictEqual(p.minimum,7); const a=keys.indexOf(key(cur));
          const b=snap===null?-1:keys.indexOf(key(snap)); visited.push([a,b]);
          return {ok:(subject==="current"?a:a*3+b)===target}; }
      }};
      d.phases=[{challenge:{routes:[{id:"probe",observations:[
        {analyzerId:"contour.any-of",params:{families:["rise"]}},
        {analyzerId:"synthetic.drum-reader",params:{minimum:7}}]}]}}];
      const proof=vm.runInNewContext(`(${g.questFragmentBlocks.toString()})`, {
        QUEST_PRIMITIVES:primitives, questFragmentProbes:g.questFragmentProbes,
        songEvidence:g.songEvidence, questDrumMissing:g.questDrumMissing,
        questNormalizeParams:g.questNormalizeParams, questShare:g.questShare });
      assert.strictEqual(proof(d,rule).length,target===n?1:0);
      if(target===n)assert.strictEqual(new Set(visited.map(JSON.stringify)).size,n);
    }
  }
});

test("fragment proof rejects invalid and unready probes and checks every pool entry", () => {
  // MUTATIONS: omit either filter, return on the first good fragment, or assume any three probes suffice.
  const g=fresh(), d=defOf(g), real=g.questFragmentProbes;
  const rule={...d.setup,fragments:pool};
  for(let index=0;index<pool.length;index++)for(const mode of ["gone","stops","invalid"]) {
    g.questFragmentProbes=(def,frag)=> {
      const ss=real(def,frag);if(JSON.stringify(frag)!==JSON.stringify(pool[index]))return ss;
      for(const s of ss) {
        if(mode==="invalid")s.v=99;
        if(mode==="stops")s.tracks[1].hits=clone(frag);
        if(mode==="gone")s.tracks[1].hits=s.tracks[1].hits.filter(h=>h.lane!==frag[1].lane || h.c!==frag[1].c);
      }
      return ss;
    };
    const blocked=g.questFragmentBlocks(d,rule);
    const count=d.phases.flatMap(p=>p.challenge?.routes||[]).flatMap(r=>r.observations)
      .filter(o=>g.QUEST_PRIMITIVES[o.analyzerId].requiredControlIds.includes("drums")).length;
    assert.strictEqual(blocked.length,count,`${index}/${mode}`);
    assert.ok(blocked.every(b=>b.index===index));
  }
});

test("fragment draw is last and never moves stones for any pool length", () => {
  // MUTATIONS: consume an early draw, fix the fragment index, alias the pool, or omit the opening.
  const g=fresh(), k=g.QUEST_SETUP_KINDS.waypoints;
  shipsOfficial(g);
  for(const id of OFFICIAL){ const d=g.QUEST_DEFINITIONS[id]; assert.deepEqual(d.setup.fragments,pool);assert.strictEqual(d.v,3); }
  // The draw itself, under every dealing quest's own geometry, with this test's pool of known length.
  const dealing=Object.values(g.QUEST_DEFINITIONS).filter(d=>d.setup?.kind==="waypoints");
  assert.ok(dealing.length>=OFFICIAL.length);
  for(const d of dealing) {
    const plain=clone(d.setup);delete plain.fragments;
    const seen=new Set();
    for(let seed=0;seed<128;seed++)for(const size of [1,2,6,12]) {
      const rule={...plain,fragments:Array.from({length:size},(_,i)=>clone(pool[i%6]))};
      const rng=g.questRng(`draw-${seed}`),values=[];
      const a=k.generate(rule,d,()=>{const v=rng();values.push(v);return v;});
      const b=k.generate(plain,d,g.questRng(`draw-${seed}`));
      assert.deepEqual(a.waypoints,b.waypoints);
      assert.strictEqual(b.fragment,undefined);
      assert.strictEqual(a.fragment.index,Math.floor(values.at(-1)*size));
      assert.deepEqual(a.fragment.hits,rule.fragments[a.fragment.index]);
      assert.notStrictEqual(a.fragment.hits,rule.fragments[a.fragment.index]);
      assert.notStrictEqual(a.fragment.hits[0],rule.fragments[a.fragment.index][0]);
      if(size===6)seen.add(a.fragment.index);
    }
    assert.strictEqual(seen.size,6);
  }
});

test("fragment instance integrity refuses tampering before a hydrated run can enter", t => {
  // MUTATIONS: drop any fragment shape/range/equality check or trust persisted instances on entry.
  const f=launch(t),{g,def,id}=f, k=g.QUEST_SETUP_KINDS.waypoints;
  const original=clone(g.Store.get("questRuns"));
  const cases=[
    ["bad-fragment",i=>{delete i.fragment;}], ["bad-fragment",i=>{i.fragment=null;}],
    ...[-1,6,0.5,"0"].map(index=>["bad-fragment",i=>{i.fragment.index=index;}]),
    ["fragment-mismatch",i=>{i.fragment.hits=null;}],
    ["fragment-mismatch",i=>{i.fragment.hits.reverse();}],
    ["fragment-mismatch",i=>{i.fragment.hits.pop();}],
    ["fragment-mismatch",i=>{i.fragment.hits.push({lane:1,c:3});}],
    ["fragment-mismatch",i=>{i.fragment.hits[0].lane=2;}],
    ["fragment-mismatch",i=>{i.fragment.hits[0].c=3;}],
    ["fragment-mismatch",i=>{i.fragment.index=(i.fragment.index+1)%6;}],
  ];
  for(const [expected,tamper] of cases) {
    const stored=clone(original);tamper(stored.runs[id].setup);
    assert.strictEqual(k.validateInstance(stored.runs[id].setup,def.setup,def),expected);
    const h=fresh();h.Store.set("questRuns",stored);h.hydrateQuestRuns();
    assert.strictEqual(h.enterQuestRun(id).ok,false,expected);
  }
  const plain=clone(def);delete plain.setup.fragments;
  for(const value of [clone(original.runs[id].setup.fragment),null,{}]) {
    const inst={...clone(original.runs[id].setup),fragment:value};
    assert.strictEqual(k.validateInstance(inst,plain.setup,plain),"unexpected-fragment");
  }
  const h=fresh();h.Store.set("questRuns",original);h.hydrateQuestRuns();assert.strictEqual(h.enterQuestRun(id).ok,true);
  const old=clone(original);old.runs[id].definitionVersion=2;
  h.Store.set("questRuns",old);h.hydrateQuestRuns();assert.strictEqual(h.enterQuestRun(id).code,"definition-changed");
});

test("starting drums own precisely the opening and completion never doubles its kick", () => {
  // MUTATIONS: don't plant/copy the fragment, replace it with a bed, or double K0 in the completion.
  const g=fresh(),d=defOf(g),k=g.QUEST_SETUP_KINDS.waypoints;
  for(let index=0;index<6;index++) {
    const i=k.generate(d.setup,d,g.questRng("opening"));i.fragment={index,hits:clone(pool[index])};
    const before=clone({d,i}),s=k.startingSong(d,i),c=g.questSetupCompletion(d,i);
    assert.deepEqual(s.tracks[1].hits,pool[index]);
    assert.notStrictEqual(s.tracks[1].hits[0],i.fragment.hits[0]);
    const expected=union(pool[index],beat(0,4,16));
    assert.deepEqual(c.tracks[1].hits,expected);
    assert.strictEqual(new Set(c.tracks[1].hits.map(h=>`${h.lane}:${h.c}`)).size,c.tracks[1].hits.length);
    assert.strictEqual(g.questSetupCompletable(d,i),null);
    assert.deepEqual({d,i},before);
  }
});

test("fragment readiness keeps every opening hit and accepts any later lane including ending rests", () => {
  // MUTATIONS: test only one dealt hit/lane, count c3, impose a final-quarter gate, or add redundant no-beat.
  const g=fresh(),d=defOf(g),k=g.QUEST_SETUP_KINDS.waypoints;
  for(const width of [16,17,64])for(let index=0;index<6;index++) {
    d.workspace.columns=width;
    const inst=k.generate(d.setup,d,g.questRng("ready"));inst.fragment={index,hits:clone(pool[index])};
    const base=g.questSetupCompletion(d,inst);
    const missing=hits=>{const s=clone(base);s.tracks[1].hits=clone(hits);return g.QUEST_READINESS.waypoints.missing(d,inst,g.songEvidence(s));};
    assert.deepEqual(codes(missing([])),["beat-stops","fragment-gone"]);
    assert.deepEqual(missing(pool[index]),[{code:"beat-stops",descriptorId:"missing-beat-continues"}]);
    for(let lane=0;lane<3;lane++) {
      assert.deepEqual(codes(missing(union(pool[index],[{lane,c:3}]))),["beat-stops"]);
      for(const c of [4,5,width-1])assert.deepEqual(missing(union(pool[index],[{lane,c} ])),[]);
      for(let removed=0;removed<pool[index].length;removed++) {
        const hits=pool[index].filter((_,i)=>i!==removed);
        assert.deepEqual(missing(union(hits,[{lane,c:4}])),[{code:"fragment-gone",descriptorId:"missing-fragment"}]);
      }
    }
    assert.deepEqual(codes(missing(union(pool[index],[{lane:1,c:width}]))),["beat-stops"]);
  }
  delete d.setup.fragments;
  const inst=k.generate(d.setup,d,g.questRng("plain")),s=g.questSetupCompletion(d,inst);s.tracks[1].hits=[];
  assert.deepEqual(g.QUEST_READINESS.waypoints.missing(d,inst,g.songEvidence(s)),[{code:"no-beat",descriptorId:"missing-beat"}]);
});

test("both pulse describers distinguish silence from unnamed drums and Hopper owns both sentences", () => {
  // MUTATIONS: omit drumOnsets from any primitive, conflate the descriptors, or omit their attribution.
  const g=fresh(),d=defOf(g),named=g.songEvidence(song(g,d,beat(0,4,16)));
  for(const [hits,id,text] of [ [[],"heard-pulse-none","The drums were silent."],
    [[{lane:1,c:1},{lane:1,c:5}],"heard-pulse-unnamed","The drums played a pattern the garden has no name for."] ]) {
    const cur=g.songEvidence(song(g,d,hits));assert.deepEqual(cur.steadyPulseFamilies,[]);
    for(const p of Object.values(g.QUEST_PRIMITIVES).filter(p=>p.capabilityId==="steady-pulse")) {
      for(const snap of [cur,named]) {
        const result=p.evaluate(cur,snap,{});assert.strictEqual(result.facts.drumOnsets,hits.length);
        const tokens=p.describe(result.facts);assert.deepEqual(tokens,[{id}]);
        assert.ok(p.heardDescriptorIds.includes(id));
        assert.strictEqual(g.QUEST_DESCRIPTOR_CAPABILITY[id],"steady-pulse");
        const rendered=g.questRenderTokens(tokens);assert.strictEqual(rendered[0].text,text);
        const hopper=g.questCastVoices(d,rendered,{}).find(c=>c.name==="Hopper");
        assert.deepEqual(hopper.lines,[text]);assert.deepEqual(g.questNarratorTokens(d,rendered),[]);
      }
    }
  }
});

test("fragment evaluation is pure with frozen explicit evidence under unrelated live state", () => {
  // MUTATIONS: read live drums, mutate the instance/evidence, or key fragment readiness on a quest id.
  const g=fresh(),d=defOf(g),k=g.QUEST_SETUP_KINDS.waypoints;d.id="another-garden";
  const inst=k.generate(d.setup,d,g.questRng("pure-fragment")),s=g.questSetupCompletion(d,inst);
  s.tracks[1].hits=clone(inst.fragment.hits);
  const run=g.newQuestRun({runId:"pure",questId:d.id,definitionVersion:d.v,setup:inst,song:s,span:{start:0,end:16},at:1});
  const evidence={versions:{A:g.songEvidence(s)}},before=JSON.stringify({d,run,evidence});
  const result=g.evaluateQuest(d,evidence,run);
  assert.deepEqual(result.readiness,{ok:false,missing:[{code:"beat-stops",descriptorId:"missing-beat-continues"}]});
  assert.strictEqual(JSON.stringify({d,run,evidence}),before);
  freeze(d);freeze(run);freeze(evidence);
  g.applySong(g.questSetupCompletion(d,inst));g.Store.set=()=>assert.fail("pure evaluator wrote storage");
  assert.deepEqual(g.evaluateQuest(d,evidence,run),result);
  assert.strictEqual(JSON.stringify({d,run,evidence}),before);
});

test("every shipped route has ready playable songs preserving every opening", () => {
  // MUTATION: canonical probe deletes an opening, misbuilds a pulse, or leaves a route unreachable.
  // Prove the complete conjunction on songs, not each drum observation in isolation.
  const g=fresh(),k=g.QUEST_SETUP_KINDS.waypoints,analyze=g.songEvidence;
  shipsOfficial(g);
  // Each quest's OWN openings — or, for a rule that deals none, no opening at all.
  const cases=Object.values(g.QUEST_DEFINITIONS).filter(d=>d.setup?.kind==="waypoints")
    .flatMap(d=>(d.setup.fragments||[null]).map((hits,index)=>({original:d,index,hits})));
  assert.ok(cases.length>=12);
  for(const {original,index,hits} of cases) {
    const d=clone(original);d.id="renamed-playable";
    const inst=k.generate(d.setup,d,g.questRng("fixture-4"));
    if(hits)inst.fragment={index,hits:clone(hits)};else delete inst.fragment;
    const melodies=[];
    g.songEvidence=s=>{melodies.push(clone(s));return analyze(s);};
    g.questSetupReachableFamilies(d,inst);g.songEvidence=analyze;
    // Production's contour strategies can all share Arc. Search independently as well:
    // one freely chosen pitch and position in each open region, retaining the dealt landmarks.
    const rng=g.questRng("independent-route-search"),ladder=g.PALETTES[d.workspace.paletteId].MIDI;
    const cuts=[-1,...inst.waypoints.map(p=>p.col),d.workspace.columns];
    for(let trial=0;trial<512;trial++) {
      const s=k.startingSong(d,inst);
      for(let n=1;n<cuts.length;n++)s.tracks[0].notes.push({
        p:ladder[Math.floor(rng()*ladder.length)],c:cuts[n-1]+1+Math.floor(rng()*(cuts[n]-cuts[n-1]-1)),len:1 });
      melodies.push(s);
    }
    const distinct=[...new Map(melodies.map(s=>[JSON.stringify(analyze(s).contourFamilies),s])).values()];
    // An independent on-beat candidate, kept AFTER contour deduplication: equal contours need not
    // cover equal beats. The checks below still execute readiness and the complete route conjunction.
    distinct.push(withBeatNotes(g.questSetupCompletion(d,inst)));
    // Dense twins: every cell below each column's top note filled. The top notes (so the contour), the
    // beats and the stones are unchanged, so these reach routes that count notes — a valid quest asking
    // `phrase.minimum-onsets` 24 had no candidate (GPT's PR review). Readiness is still asserted below.
    for(const m of [...distinct]) {
      const s=clone(m),notes=s.tracks[0].notes,tops=new Map();
      for(const n of notes){ const r=ladder.indexOf(n.p); if(!tops.has(n.c)||r<tops.get(n.c))tops.set(n.c,r); }
      for(const [c,r0] of tops)for(let r=r0+1;r<ladder.length;r++)
        if(!notes.some(n=>n.c===c&&n.p===ladder[r]))notes.push({p:ladder[r],c,len:1});
      distinct.push(s);
    }
    const candidates=distinct.flatMap(m=>g.questFragmentProbes(d,hits||[]).map(dr=>{
      const s=clone(m);s.tracks[1]=clone(dr.tracks[1]);const ev=analyze(s);
      assert.deepEqual(g.QUEST_READINESS.waypoints.missing(d,inst,ev),[]);
      assert.strictEqual(g.questWorkspaceMismatch(s,d),null);
      return {s,ev};
    }));
    for(const [phase,p] of d.phases.entries())for(const route of p.challenge?.routes||[]) {
      let witness;
      for(const a of candidates)for(const b of phase?candidates:[a]) {
        if(g.questRouteMatches(route,{currentVersionId:phase?"B":"A",byVersion:{A:a.ev,B:b.ev}}))witness={a,b};
      }
      assert.ok(witness,`${original.id}/${index}/${route.id}`);
      const {a,b}=witness;
      const r=g.newQuestRun({runId:"route",questId:d.id,definitionVersion:d.v,setup:inst,song:a.s,span:{start:0,end:d.workspace.columns},at:0});
      r.phase=phase;r.draft=phase?"B":"A";r.versions.B={...clone(r.versions.A),song:b.s};
      const ev=g.evaluateQuest(d,{versions:{A:a.ev,B:b.ev}},r);
      assert.strictEqual(ev.ok,true);assert.strictEqual(ev.readiness.ok,true);
      assert.ok(ev.musical.matchedRouteIds.includes(route.id));
    }
  }
});

test("v3 owns its schema and rejects malformed common and nested fields", () => {
  // MUTATIONS: omit v3 dispatch, reuse v2 literal, or weaken a v3 common/phase constraint.
  const g=fresh(),d=defOf(g),validate=g.QUEST_SCHEMA_VALIDATORS[3];
  assert.strictEqual(typeof validate,"function");assert.notStrictEqual(validate,g.QUEST_SCHEMA_VALIDATORS[2]);
  for(const edit of [x=>{x.title=null;},x=>{x.phases[0].intentionText=null;},
    x=>{x.phases[0].procedure.gateIds="play";},x=>{x.workspace.columns=15;},
    x=>{x.v=2;},x=>{x.extra=true;}]) {
    const bad=clone(d);edit(bad);assert.strictEqual(validate(bad,[]),false);
  }
  assert.strictEqual(validate(d,[]),true);
});

test("landmark wiring addresses and clears every dealt drum pad", () => {
  // MUTATIONS: omit the drum call, swap lane/column, or leave old rings behind.
  // This checks effect arguments, not pixels: browser observation must establish the visible ring.
  const g=fresh(),calls=[];
  const pads=Array.from({length:3},(_,lane)=>Array.from({length:16},(_,c)=>({classList:{
    add:cls=>calls.push(["add",lane,c,cls]),remove:cls=>calls.push(["remove",lane,c,cls]) }})));
  const mark=vm.runInNewContext(`(${g.questMarkLandmarks.toString()})`,{cells:[],dcells:pads});
  for(const fragment of pool) {
    calls.length=0;mark({setup:{waypoints:[],fragment:{hits:fragment}}},{setup:{kind:"waypoints"}});
    assert.strictEqual(calls.filter(x=>x[0]==="remove").length,48);
    assert.deepEqual(calls.filter(x=>x[0]==="add"),fragment.map(h=>["add",h.lane,h.c,"landmark"]));
  }
  calls.length=0;mark(null,null);assert.strictEqual(calls.length,48);
});
