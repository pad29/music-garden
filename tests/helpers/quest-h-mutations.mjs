// Step H faults. Mutations affect only the harness source string, never index.html.
const faults=(title,pairs)=>pairs.map(([from,to])=>[title,from,to]);
const pickDecor='      applyStageDecor();\n      journalClear();                                     // the other path';
const pickLoad='      try{ applySong(QUEST_RUNS[runId].versions[o.versionId].song); } finally{ questPainting=wasPainting; }\n'+
  '      // applySong rebuilt the cells, and the rings and guides went with them: switching paths stripped the\n'+
  '      // dealt stones and opening of their rings in both quests. Found by GPT\'s tester.\n';
const reachLine='for(let c=0;c<def.workspace.columns;c+=4) if(!notes.some(n=>n.c===c)) notes.push({ p, c, len:1 });';
const taught='for(const pkg of (prim.taughtByPackageIds||[]))';
const paint='  applyStageDecor();\n  journalClear();          // the repaint';
const repaintBlock=`  try{ resetTransient(); applySong(run.versions[run.draft].song); }
  finally{ questPainting=was; }
  // The stage's guides and the dealt rings, through the one path every rebuild uses. A step's beatGuide
  // reached nothing here before: the quest branch of renderStage returns before the lesson path sets it.
  applyStageDecor();`;
const ring='    questMarkLandmarks(run, run && QUEST_DEFINITIONS[run.questId]);';
const guideLoop='function questFieldGuides(def){\n  const out=new Set();\n  for(const p of def.phases) if(p.challenge) for(const r of p.challenge.routes) for(const o of r.observations){';
export const hMutations=[
  ...faults("beat evidence counts distinct projected onset columns across the effective song span",[
    ['if(projected.grid[r][c]){ melodyBeatsHit++; break; }','if(projected.grid[r][c]){ melodyBeatsHit++; }'],
    ['for(let c=0;c<span;c+=4){ beatCount++;','for(let c=0;c<16;c+=4){ beatCount++;'],
    ['for(let c=0;c<span;c+=4){ beatCount++;','for(let c=0;c<t.cols;c+=4){ beatCount++;'],
    ['for(let c=0;c<span;c+=4){ beatCount++;','for(let c=0;c<span;c+=2){ beatCount++;'],
    ['for(let c=0;c<span;c+=4){ beatCount++;','for(let c=4;c<span;c+=4){ beatCount++;'],
    ['if(projected.grid[r][c]){ melodyBeatsHit++; break; }','if(grid[r] && grid[r][c]){ melodyBeatsHit++; break; }'],
    ['cur.melodyBeatsHit===cur.beatCount','cur.melodyBeatsHit>=3'],
    ['cur.melodyBeatsHit===cur.beatCount','cur.melodyBeatsHit===cur.beatCount && cur.melodyOnsetCount===cur.beatCount'],
    ['facts:{ onsets:cur.melodyOnsetCount, beats:cur.beatCount, hit:cur.melodyBeatsHit }',
     'facts:{ onsets:cur.melodyOnsetCount, beats:4, hit:cur.melodyBeatsHit }'],
  ]),
  ...faults("beat descriptions are exclusive silent when empty and confined to declared tokens",[
    ['if(!f.onsets) return [];','if(!f.onsets) return [questTok("heard-tune-between-beats")];'],
    ['if(f.hit===f.beats) return [questTok("heard-tune-every-beat")];','if(f.hit>0) return [questTok("heard-tune-every-beat")];'],
    ['f.hit>0 ? "heard-tune-some-beats" : "heard-tune-between-beats"','f.hit>0 ? "heard-tune-between-beats" : "heard-tune-some-beats"'],
    ['describe:f=>describeBeats(f),','describe:f=>[],'],
    ['heardDescriptorIds:QUEST_HEARD_BEATS,','heardDescriptorIds:QUEST_HEARD_BEATS.slice(0,2),'],
    ['The tune landed on every beat.','The tune landed on some of the beats.'],
    ['a tune that lands on every beat','enough notes to make a phrase'],
  ]),
  ...faults("Woods melody receipts reach the garden while Hopper keeps only the drums",[
    ['owner[d]=p.capabilityId;','owner[d]=p.capabilityId==="melody-making" ? "steady-pulse" : p.capabilityId;'],
    ['describe:f=>describeBeats(f),','describe:f=>[],'],
    ['heardDescriptorIds:QUEST_HEARD_BEATS,','heardDescriptorIds:[],'],
    ['return (tokens||[]).filter(t=>!spoken.has(QUEST_DESCRIPTOR_CAPABILITY[t.descriptorId]));',
     'return [];'],
  ]),
  ...faults("analyzer teaching is enforced independently of capability prerequisites for authored quests",[
    [taught,'for(const pkg of [])'],
    [taught,'for(const pkg of (p.type==="compose" ? prim.taughtByPackageIds||[] : []))'],
    [taught,'for(const pkg of (def.id==="waking-woods" ? prim.taughtByPackageIds||[] : []))'],
    ['taughtByPackageIds:["footsteps"], fieldGuide:"beats"','taughtByPackageIds:["intro"], fieldGuide:"beats"'],
    ['if(!earned.has(pkg)) err("analyzer-not-taught",rat,obs.analyzerId+" needs "+pkg);',
     'if(earned.has(pkg)) err("analyzer-not-taught",rat,obs.analyzerId+" needs "+pkg);'],
  ]),
  ...faults("minimum onset quests still validate without the new teaching guide or reach construction",[
    [taught,'for(const pkg of (prim.capabilityId==="melody-making" ? ["footsteps"] : prim.taughtByPackageIds||[]))'],
    ['beatGuide:guides.has("beats"),','beatGuide:true,'],
    ['ok:cur.melodyOnsetCount>=p.minimum','ok:cur.melodyBeatsHit===cur.beatCount'],
    ['if(prim.reach){ if(questProveReach(def, inst, prim, o))','if(prim.capabilityId==="melody-making"){ if(questProveReach(def, inst, prim, o))'],
  ]),
  ...faults("reach construction covers every legal stone column layout at 16 and 32 with every opening",[
    [reachLine,reachLine.replace('c=0','c=4')],
    [reachLine,reachLine.replace('def.workspace.columns','16')],
    [reachLine,reachLine.replace('c+=4','c+=8')],
    [reachLine,reachLine.replace('if(!notes.some(n=>n.c===c))','')],
    ['const notes=song.tracks[0].notes;','const notes=song.tracks[0].notes=[];'],
    ['const base=questSetupCompletion(def, inst);','const base=emptyQuestSong(def);'],
  ]),
  ...faults("reach proof refuses constructions that fail readiness workspace evidence params or the analyzer",[
    ['if(questWorkspaceMismatch(song, def)) return "workspace";',';'],
    ['if(!ev.valid) return "invalid";',';'],
    ['if(rd && rd.missing(def, inst, ev).length) return "not-ready";',';'],
    ['if(!np.ok) return "params";',';'],
    ['return prim.evaluate(ev, null, np.value).ok ? null : "analyzer";','return null;'],
    ['if(!base) return "no-completion";','if(!base) return null;'],
  ]),
  ...faults("route reach dispatch executes each declared construction before the contour filter",[
    ['if(prim.reach){ if(questProveReach(def, inst, prim, o)) return "route-unreachable:"+r.id; continue; }',''],
    ['if(prim.reach){ if(questProveReach(def, inst, prim, o)) return "route-unreachable:"+r.id; continue; }',
     'if(prim.reach){ questProveReach(def, inst, prim, o); continue; }'],
    ['for(const p of def.phases){\n    if(!p.challenge) continue;',
     'for(const p of def.phases.slice(0,1)){\n    if(!p.challenge) continue;'],
    ['if(!p.challenge) continue;\n    for(const r of p.challenge.routes) for(const o of r.observations){',
     'if(!p.challenge) continue;\n    for(const r of p.challenge.routes.slice(0,1)) for(const o of r.observations){'],
  ]),
  ...faults("beat guides derive from declared analyzers on every phase independent of quest id or matches",[
    ['beatGuide:guides.has("beats"),','beatGuide:def.id==="waking-woods",'],
    ['beatGuide:guides.has("beats"),','beatGuide:!!p.challenge && guides.has("beats"),'],
    ['beatGuide:guides.has("beats"),','beatGuide:guides.has("beats") && songEvidence(currentSong()).melodyBeatsHit>0,'],
    [guideLoop,guideLoop.replace('def.phases','def.phases.slice(0,1)')],
    [guideLoop,guideLoop.replace('p.challenge.routes','p.challenge.routes.slice(0,1)')],
    ['if(prim && prim.fieldGuide) out.add(prim.fieldGuide);','if(prim && prim.fieldGuide) out.add("wrong-guide");'],
  ]),
  ...faults("quest repaint applies guides and rings after loading the song on entry resume and phase changes",[
    [paint,paint.replace('applyStageDecor();',';')],
    [paint,paint.replace('applyStageDecor();','if(def.id==="firefly-crossing") applyStageDecor();')],
    [repaintBlock,repaintBlock.replace('resetTransient(); applySong','resetTransient(); applyStageDecor(); applySong')
      .replace('  applyStageDecor();','  ;')],
    ['setBeatGuide(!!st.beatGuide); setPhraseGuide(!!(L.phrase||st.phrase));',
     'setBeatGuide(false); setPhraseGuide(!!(L.phrase||st.phrase));'],
  ]),
  ...faults("undo and redo redecorate both quests with the current melody stones and opening drum rings",[
    ['applyStageDecor();                         // the rebuilt cells need',
     ';                                         // the rebuilt cells need'],
    [ring,';'],
    [ring,'    if(run.questId==="firefly-crossing") questMarkLandmarks(run, run && QUEST_DEFINITIONS[run.questId]);'],
    [ring,'    questMarkLandmarks(run, QUEST_DEFINITIONS["firefly-crossing"]);'],
    ['for(const p of run.setup.waypoints)\n    if(cells[p.row]',
     'for(const p of [])\n    if(cells[p.row]'],
    ['if(run.setup.fragment) for(const h of run.setup.fragment.hits)',
     'if(false) for(const h of run.setup.fragment.hits)'],
  ]),
  // Red until the pick switch redecorated; now the switch path is audited like the others.
  ...faults("switching comparison versions reapplies the guide and both landmark sets after the load",[
    [pickDecor,pickDecor.replace('applyStageDecor();',';')],
    [pickDecor,pickDecor.replace('applyStageDecor();','if(def.id==="firefly-crossing") applyStageDecor();')],
    // Decorating BEFORE the load: the rebuild then strips what was just applied.
    [pickLoad+pickDecor, 'applyStageDecor();\n'+pickLoad+pickDecor.replace('applyStageDecor();',';')],
  ]),
  ...faults("leaving Woods for a lesson or Studio clears the guide and returning restores it",[
    ['setBeatGuide(!!st.beatGuide);                                          // tinted beat columns',
     'setBeatGuide(true);                                          // tinted beat columns'],
    [paint,paint.replace('applyStageDecor();',';')],
  ]),
];
