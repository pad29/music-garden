// A7/A8 faults, applied to the harness string only. Every title has a green source baseline.
const faults=(title,pairs)=>pairs.map(([from,to])=>[title,from,to]);
export const playtestMutations=[
  // Listening in the comparison phase. The default purpose is the whole fix: only an audition records
  // auditionedRev, and nothing but the path toggle ever named one.
  ...faults("a session begun with no stated purpose auditions only in the comparison phase",[
    ['|| ((phase && phase.type==="compare-offer") ? "audition" : "play")', '|| "play"'],
    ['|| ((phase && phase.type==="compare-offer") ? "audition" : "play")', '|| "audition"'],
  ]),
  ...faults("hearing the path you hold is enough, and the path you did not touch stays heard",[
    ['|| ((phase && phase.type==="compare-offer") ? "audition" : "play")', '|| "play"'],
    // …and the other half of the promise: an edited path must still be re-heard. Anchored through the
    // audition op's own opening, because the identical line guards recordObservation a few lines down.
    ['if(op.type==="audition"){\n    if(!active) return no("not-active");\n    const v=V(op.versionId); if(!v) return no("no-version");\n    if(v.lastCompletePlayRev!==op.editRev || v.lastCompletePlaySessionId!==op.sessionId) return no("not-heard");',
     'if(op.type==="audition"){\n    if(!active) return no("not-active");\n    const v=V(op.versionId); if(!v) return no("no-version");\n    if(false) return no("not-heard");'],
  ]),
  // The seam the fork's removal broke: the button must read the DOOR's answer, not compute its own.
  ...faults("the shell and controller both consume the shared evaluation seam",[
    ['canAdvance: p.type!=="compare-offer" && questPhaseGate(def, run.phase, current)(run)===true,',
     'canAdvance: p.type!=="compare-offer" && gatesOpen && missing.length===0,'],
  ]),
  ...faults("shell availability consumes the shared procedural answer in every phase",[
    ['const ev=questEvaluateRun(run, def);\n  const proc=', 'const ev=evaluateQuest(def,{versions:Object.fromEntries(Object.entries(run.versions).map(([id,v])=>[id,songEvidence(v.song)]))},run);\n  const proc='],
    ['const can=!!(proc && proc.canAdvance) && !unsaved;','const can=questPhaseGate(def,run.phase,p.versionId)(run) && !unsaved;'],
    ['enabled:!!(proc && proc.canOffer) && !unsaved','enabled:questPhaseGate(def,run.phase,versionId)(run) && !unsaved'],
  ]),
  ...faults("equal tokens make matched and unmatched songs indistinguishable throughout the shell model",[
    ['paths,\n    // Validated by the catalog','matchedRouteIds:ev.musical.matchedRouteIds, paths,\n    // Validated by the catalog'],
    ['paths,\n    // Validated by the catalog','asking:false, confirmText:"", paths,\n    // Validated by the catalog'],
    ['ways:p.challenge ? questWays(def, p.id).map(w=>questSentence(w.phrases)) : [],','ways:ev.musical.matchedRouteIds.length ? [] : (p.challenge ? questWays(def,p.id).map(w=>questSentence(w.phrases)) : []),'],
    ['const can=!!(proc && proc.canAdvance) && !unsaved;','const can=!!(proc && proc.canAdvance) && !unsaved && ev.musical.matchedRouteIds.length>0;'],
    ['worldText:p.worldText, intentionText:p.intentionText,','worldText:obs && !obs.matchedRouteIds.length ? "None of the ways came out" : p.worldText, intentionText:p.intentionText,'],
    ['setStatusText(m.statusText);','setStatusText(m.statusText); questEvaluateRun(run,def).musical;'],
  ]),
  ...faults("matched and unmatched paths advance once and receive identical completion payoffs even under a new quest id",[
    ['if(actionId==="continue"){','if(actionId==="continue"){ if(!questEvaluateRun(run,def).musical.matchedRouteIds.length) return fail("needs-confirm");'],
    ['if(actionId==="continue"){','if(actionId==="continue"){ if(run.questId!=="firefly-crossing") return fail("wrong-quest");'],
    ['if(actionId==="offer"){','if(actionId==="offer"){ if(!questEvaluateRun({...run,phase:1},def).musical.matchedRouteIds.length) return fail("unmatched");'],
    ['completionText:def.completion.completionText,','completionText:questEvaluateRun({...run,phase:1},def).musical.matchedRouteIds.length ? def.completion.completionText : "Almost finished",'],
  ]),
  ...faults("three transform routes have exclusive real witnesses and no route implies another",[
    ['loadQuestCatalog(BUILTIN_QUEST_CATALOG_JSON, "official");','{ const c=JSON.parse(BUILTIN_QUEST_CATALOG_JSON); c.definitions[0].phases[1].challenge.routes.pop(); loadQuestCatalog(JSON.stringify(c), "official"); }'],
    ['loadQuestCatalog(BUILTIN_QUEST_CATALOG_JSON, "official");','{ const c=JSON.parse(BUILTIN_QUEST_CATALOG_JSON); c.definitions[0].witnesses.find(w=>w.id==="second-fall-new-shimmer").songs.B.tracks[1].hits[0].lane=0; loadQuestCatalog(JSON.stringify(c), "official"); }'],
    ['if(p.challenge) for(const r of p.challenge.routes){','if(p.challenge) for(const r of p.challenge.routes.slice(0,2)){'],
    ['const matched=observations.every(o=>o.matched);','const matched=observations.some(o=>o.matched);'],
    ['questBothNamed(cur.contourFamilies,snap.contourFamilies) && !questShare(cur.contourFamilies,snap.contourFamilies)','questBothNamed(cur.contourFamilies,snap.contourFamilies) && questShare(cur.contourFamilies,snap.contourFamilies)'],
    ['questBothNamed(cur.steadyPulseFamilies,snap.steadyPulseFamilies) && !questShare(cur.steadyPulseFamilies,snap.steadyPulseFamilies)','questBothNamed(cur.steadyPulseFamilies,snap.steadyPulseFamilies) && questShare(cur.steadyPulseFamilies,snap.steadyPulseFamilies)'],
  ]),
  ...faults("the final offer in either quest remains free of every readiness requirement after a last edit",[
    ['canOffer:  p.type==="compare-offer" && gatesOpen,','canOffer: p.type==="compare-offer" && gatesOpen && questReadinessMissing(def,run,current).length===0,'],
    ['if(p.type!=="compare-offer" && questReadinessMissing(def, run, versionId).length) return false;','if(questReadinessMissing(def, run, versionId).length) return false;'],
  ]),
  ...faults("the rearranged shell forwards attributed friend voices and current paths to their render boundaries",[
    ['questRenderVoices(m.voices);',';'],
    ['questRenderVoices(m.voices);','questRenderVoices([]);'],
    ['questRenderPaths(m);',';'],
  ]),
  ...faults("status and editability follow phase type lifecycle and unsaved state without hiding the menu exit",[
    ['statusText: p.intentionText + "  " + (unsaved ? QUEST_UNSAVED_TEXT : QUEST_EXIT_TEXT),','statusText: QUEST_EXIT_TEXT,'],
    ['statusText: p.intentionText + "  " + (unsaved ? QUEST_UNSAVED_TEXT : QUEST_EXIT_TEXT),','statusText: p.intentionText + "  " + QUEST_EXIT_TEXT,'],
    ['editableText: (p.type==="compare-offer" && !finished && !stuck) ? QUEST_EDITABLE_TEXT : "",','editableText: (run.phase===2 && !finished && !stuck) ? QUEST_EDITABLE_TEXT : "",'],
    ['editableText: (p.type==="compare-offer" && !finished && !stuck) ? QUEST_EDITABLE_TEXT : "",','editableText: (p.type==="compare-offer") ? QUEST_EDITABLE_TEXT : "",'],
    ['editableText: (p.type==="compare-offer" && !finished && !stuck) ? QUEST_EDITABLE_TEXT : "",','editableText: "",'],
    ['editableText: (p.type==="compare-offer" && !finished && !stuck) ? QUEST_EDITABLE_TEXT : "",','editableText: (def.id==="firefly-crossing" && p.type==="compare-offer" && !finished && !stuck) ? QUEST_EDITABLE_TEXT : "",'],
    ['const actions=[];\n  const unsaved=!!v.unsaved;','const actions=[{id:"edit-held-path",label:"Edit this path",enabled:true}];\n  const unsaved=!!v.unsaved;'],
    // The exit line stopped naming the ☰ route after the third playtest; what it must never stop
    // saying is that stopping is free, so that is what the fault removes now.
    ['const QUEST_EXIT_TEXT="You can leave any time — your quest is saved.";',
     'const QUEST_EXIT_TEXT="Your quest is saved.";'],
  ]),
  ...faults("the renderer passes current status and save failure through the text-only status boundary",[
    ['setStatusText(m.statusText);',';'],
    ['setStatusText(m.statusText);','setStatusText(m.exitText);'],
    ['unsaved: !!run && questHasUnsavedEdit(activeScope.runId, run.draft),','unsaved: false,'],
    ['function setStatusText(text){ statusEl.textContent=text; }','function setStatusText(text){ statusEl.innerHTML=text; }'],
  ]),
  ...faults("phase envelopes supply both authored sentences to narration and retain the ringed-stone instruction",[
    ['intro:p.worldText+" "+p.intentionText','intro:p.worldText'],
    ['intro:p.worldText+" "+p.intentionText','intro:p.intentionText'],
    ['intro:p.worldText+" "+p.intentionText','intro:def.phases[0].worldText+" "+def.phases[0].intentionText'],
    ...[
      "Keep the ringed stones and Hopper's opening beat. Add notes around the stones, and continue the beat in your own way.",
      "Keep the ringed stones and the opening beat. Change the path's shape, or the beat after the opening — or both.",
      "Keep the ringed stones and Hopper's opening footsteps. Put notes of your own around the stones, and carry the walk on in your own way.",
      "Keep the ringed stones and the opening footsteps. Change the tune between them, or the beat that follows.",
    ].map(text=>[text,text.replace('Keep the ringed stones','Move the ringed stones')]),
  ]),
  ...faults("the finale names its commit action Save this name while retaining rename and exit behavior",[
    ['{ id:"name-song", label:"Save this name", enabled:saved.present }','{ id:"name-song", label:"Name it", enabled:saved.present }'],
  ]),
];
