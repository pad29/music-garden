const grammar="fragment grammar and catalog refuse malformed pools and composite single attacks";
const proof="every legal short fragment is proved against every shipped drum observation at every width";
const predicates="fragment proof executes arbitrary drum predicates and every ordered snapshot pair";
const filters="fragment proof rejects invalid and unready probes and checks every pool entry";
const draw="fragment draw is last and never moves stones for any pool length";
const integrity="fragment instance integrity refuses tampering before a hydrated run can enter";
const start="starting drums own precisely the opening and completion never doubles its kick";
const ready="fragment readiness keeps every opening hit and accepts any later lane including ending rests";
const words="both pulse describers distinguish silence from unnamed drums and Hopper owns both sentences";
const pure="fragment evaluation is pure with frozen explicit evidence under unrelated live state";
const routes="every shipped route has ready playable songs preserving every opening";
const schema="v3 owns its schema and rejects malformed common and nested fields";
const rings="landmark wiring addresses and clears every dealt drum pad";
const faults=(title,pairs)=>pairs.map(([from,to])=>[title,from,to]);
// Step H adds the same observation traversal for field guides. Keep these faults on the drum proof.
const proofLoop='.filter(ev=>ev.valid && !questDrumMissing({ hits:frag }, ev).length);\n    for(const p of def.phases) if(p.challenge) for(const r of p.challenge.routes) for(const o of r.observations){';
export const fragmentMutations=[
  ...faults(grammar,[
    ['lane:QT.int(0,2), c:QT.int(0,QUEST_FRAGMENT_SPAN-1)','lane:QT.int(-1,2), c:QT.int(0,QUEST_FRAGMENT_SPAN-1)'],
    ['lane:QT.int(0,2), c:QT.int(0,QUEST_FRAGMENT_SPAN-1)','lane:QT.int(0,3), c:QT.int(0,QUEST_FRAGMENT_SPAN-1)'],
    ['c:QT.int(0,QUEST_FRAGMENT_SPAN-1)','c:QT.int(-1,QUEST_FRAGMENT_SPAN-1)'],
    ['c:QT.int(0,QUEST_FRAGMENT_SPAN-1)','c:QT.int(0,QUEST_FRAGMENT_SPAN)'],
    ['}),2,3),1,12)','}),1,3),1,12)'],
    ['}),2,3),1,12)','}),2,4),1,12)'],
    ['}),2,3),1,12)','}),2,3),0,12)'],
    ['}),2,3),1,12)','}),2,3),1,13)'],
    ['if(new Set(keys).size!==keys.length)','if(false)'],
    ['if(new Set(frag.map(h=>h.c)).size<2)','if(false)'],
    ['else if(kind.checkRule)','else if(false)'],
    ['for(const b of questFragmentBlocks(def, rule))','for(const b of [])'],
  ]),
  ...faults(proof,[
    ['(rule.fragments||[]).forEach((frag,index)=>{','(rule.fragments||[]).slice(0,1).forEach((frag,index)=>{'],
    [proofLoop,proofLoop.replace('r.observations','r.observations.slice(0,1)')],
    ['if(!reachable) out.push({ index, routeId:r.id, analyzerId:o.analyzerId });','if(false) out.push({ index, routeId:r.id, analyzerId:o.analyzerId });'],
  ]),
  ...faults(predicates,[
    ['(prim.requiredControlIds||[]).indexOf("drums")<0','!o.analyzerId.startsWith("pulse.")'],
    ['evs.some(b=>evs.some(a=>prim.evaluate(b, a, np.value).ok===true))','evs.some(b=>evs.some(a=>!questShare(b.steadyPulseFamilies,a.steadyPulseFamilies)))'],
    ['evs.some(b=>evs.some(a=>prim.evaluate(b, a, np.value).ok===true))','evs.some(b=>prim.evaluate(b, b, np.value).ok===true)'],
    ['evs.some(b=>evs.some(a=>prim.evaluate(b, a, np.value).ok===true))','evs.some((b,j)=>evs.slice(j+1).some(a=>prim.evaluate(b, a, np.value).ok===true))'],
    ['prim.evaluate(b, a, np.value).ok===true','prim.evaluate(b, a, {}).ok===true'],
    ['prim.evaluate(c, null, np.value).ok===true','prim.evaluate(c, null, {}).ok===true'],
    ['evs.some(c=>prim.evaluate(c, null, np.value).ok===true)','evs.some(c=>c.steadyPulseFamilies.length>0)'],
  ]),
  ...faults(filters,[
    [proofLoop,proofLoop.replace('p.challenge.routes','p.challenge.routes.slice(0,1)')],
    ['.filter(ev=>ev.valid && !questDrumMissing({ hits:frag }, ev).length);','.filter(ev=>ev.valid);'],
    ['.filter(ev=>ev.valid && !questDrumMissing({ hits:frag }, ev).length);',';'],
  ]),
  ...faults(draw,[
    ['generate(rule, def, rng){','generate(rule, def, rng){ if(rule.fragments) rng();'],
    ['const i=Math.floor(rng()*rule.fragments.length);','const i=0;'],
    ['inst.fragment={ index:i, hits:rule.fragments[i].map(h=>({ lane:h.lane, c:h.c })) };','inst.fragment={ index:i, hits:rule.fragments[i] };'],
    ['if(rule.fragments){ const i=Math.floor','if(false){ const i=Math.floor'],
  ]),
  ...faults(integrity,[
    ['return "bad-fragment";','return null;'],
    ['return "fragment-mismatch";','return null;'],
    ['return "unexpected-fragment";','return null;'],
    ['f.hits.length!==want.length','f.hits.length<want.length'],
    ['f.hits[i].lane!==h.lane','false'],
    ['f.hits[i].c!==h.c','false'],
    ['kind.validateInstance(run.setup, def.setup, def) || questSetupCompletable(def, run.setup)','questSetupCompletable(def, run.setup)'],
  ]),
  ...faults(start,[
    ['if(inst.fragment) song.tracks[1].hits=inst.fragment.hits.map(h=>({ lane:h.lane, c:h.c }));','if(false) song.tracks[1].hits=inst.fragment.hits.map(h=>({ lane:h.lane, c:h.c }));'],
    ['if(inst.fragment) song.tracks[1].hits=inst.fragment.hits.map(h=>({ lane:h.lane, c:h.c }));','if(inst.fragment) song.tracks[1].hits=inst.fragment.hits;'],
    ['if(!song.tracks[1].hits.some(h=>h.lane===0 && h.c===c)) song.tracks[1].hits.push({ lane:0, c });','song.tracks[1].hits.push({ lane:0, c });'],
  ]),
  ...faults(ready,[
    ['if(frag.hits.some(h=>!on(h.lane,h.c)))','if(frag.hits.slice(0,1).some(h=>!on(h.lane,h.c)))'],
    ['if(frag.hits.some(h=>!on(h.lane,h.c)))','if(false)'],
    ['for(let c=QUEST_FRAGMENT_SPAN;c<ev.columns;c++)','for(let c=QUEST_FRAGMENT_SPAN-1;c<ev.columns;c++)'],
    ['for(let c=QUEST_FRAGMENT_SPAN;c<ev.columns;c++)','for(let c=Math.floor(ev.columns*0.75);c<ev.columns;c++)'],
    ['for(let l=0;l<dg.length && !goes;l++)','for(let l=0;l<1 && !goes;l++)'],
    ['if(!goes) out.push({ code:"beat-stops"','if(false) out.push({ code:"beat-stops"'],
    ['else if(ev.drumOnsetCount===0) out.push','if(ev.drumOnsetCount===0) out.push'],
    ['else if(ev.drumOnsetCount===0) out.push','else if(false) out.push'],
    ['code:"fragment-gone", descriptorId:"missing-fragment"','code:"fragment-gone", descriptorId:"missing-beat"'],
    ['code:"beat-stops", descriptorId:"missing-beat-continues"','code:"beat-stops", descriptorId:"missing-beat"'],
  ]),
  ...faults(words,[
    ['const questPulseUnnamed=onsets=>[questTok(onsets ? "heard-pulse-unnamed" : "heard-pulse-none")];','const questPulseUnnamed=onsets=>[questTok("heard-pulse-none")];'],
    ['const questPulseUnnamed=onsets=>[questTok(onsets ? "heard-pulse-unnamed" : "heard-pulse-none")];','const questPulseUnnamed=onsets=>[questTok("heard-pulse-unnamed")];'],
    ['if(!cur.length) return questPulseUnnamed(onsets);','if(!cur.length) return questPulseUnnamed(0);'],
    ['"heard-pulse-none","heard-pulse-unnamed"];','"heard-pulse-none"];'],
    ['text:"The drums were silent."','text:"Not yet."'],
    ['text:"The drums played a pattern the garden has no name for."','text:"Not yet."'],
    ...["main-beat-kicks","even-kick-walk","hat-shimmer"].map(f=>[
      `ok:cur.steadyPulseFamilies.indexOf("${f}")>=0, facts:{ families:cur.steadyPulseFamilies, drumOnsets:cur.drumOnsetCount }`,
      `ok:cur.steadyPulseFamilies.indexOf("${f}")>=0, facts:{ families:cur.steadyPulseFamilies }`]),
    ...["questShare","!questShare"].map(share=>[
      `&& ${share}(cur.steadyPulseFamilies,snap.steadyPulseFamilies),\n      facts:{ families:cur.steadyPulseFamilies, snapshotFamilies:snap.steadyPulseFamilies,\n             drumOnsets:cur.drumOnsetCount }`,
      `&& ${share}(cur.steadyPulseFamilies,snap.steadyPulseFamilies),\n      facts:{ families:cur.steadyPulseFamilies, snapshotFamilies:snap.steadyPulseFamilies }`]),
  ]),
  ...faults(pure,[
    ['if(inst.fragment) for(const m of questDrumMissing(inst.fragment, ev)) out.push(m);','if(inst.fragment && def.id==="firefly-crossing") for(const m of questDrumMissing(inst.fragment, ev)) out.push(m);'],
    ['const dg=ev.projected.drumG, out=[];','const dg=drumG, out=[];'],
  ]),
  ...faults(routes,[
    ['const song=emptyQuestSong(def), hits=frag.map(h=>({ lane:h.lane, c:h.c }));','const song=emptyQuestSong(def), hits=[];'],
    ['"main-beat-kicks": w=>{ const h=[]; for(let c=0;c<w;c+=4)','"main-beat-kicks": w=>{ const h=[]; for(let c=0;c<w;c+=8)'],
    ['"even-kick-walk":  w=>{ const h=[]; for(let c=0;c<w;c+=2)','"even-kick-walk":  w=>{ const h=[]; for(let c=0;c<w;c+=4)'],
    ['"hat-shimmer":     w=>{ const h=[]; for(let c=0;c<w;c+=2)','"hat-shimmer":     w=>{ const h=[]; for(let c=0;c<w;c+=4)'],
  ]),
  ...faults(schema,[
    ['QUEST_SCHEMA_VALIDATORS[3]=questSchemaValidator(QUEST_SCHEMA_V3);','QUEST_SCHEMA_VALIDATORS[3]=questSchemaValidator(QUEST_SCHEMA_V2);'],
    ['Object.assign({ v:QT.lit(3), setup:QT.opaque() }, QUEST_SHAPE_COMMON)','Object.assign({ v:QT.lit(3), setup:QT.opaque() }, QUEST_SHAPE_COMMON, {title:QT.opaque()})'],
  ]),
  ...faults(rings,[
    ['if(run.setup.fragment) for(const h of run.setup.fragment.hits)','if(false) for(const h of run.setup.fragment.hits)'],
    ['dcells[h.lane][h.c].classList.add("landmark");','dcells[h.lane][0].classList.add("landmark");'],
    ['if(dcells[d][c]) dcells[d][c].classList.remove("landmark");','if(false) dcells[d][c].classList.remove("landmark");'],
  ]),
];
