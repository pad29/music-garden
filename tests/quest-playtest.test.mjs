// A7/A8, after the owner's second playtest. Models, effects and source contracts only:
// these tests make no claim about layout, gradient painting or audible narration.
import { test } from "node:test";
import assert from "node:assert";
import { launch, compare, completed, clone, failEdit } from "./helpers/quest-e6-fixtures.mjs";
import { loadQuestGame, completeDealtSong } from "./helpers/quest-fixtures.mjs";
import { withBeatNotes } from "./helpers/quest-h-fixtures.mjs";

const modelKeys = ["paths", "reflectionPrompt", "questId", "title", "phaseId", "steps",
  "exitText", "statusText", "unsaved", "worldText", "intentionText", "ways", "missing",
  "voices", "heard", "editableText", "saved", "versionId", "notice", "actions"].sort();
const beats = (lane, stride) => Array.from({length:16 / stride}, (_, i) => ({lane,c:i*stride}));

test("shell availability consumes the shared procedural answer in every phase", t => {
  // MUTATION: rebuild evaluation in the shell or call the seam but ignore its answer.
  // This green half is audited separately while the retained controller seam regression is red.
  const {g,run,def}=compare(t),evaluate=g.questEvaluateRun;
  for(const phase of [0,1,2])for(const allowed of [false,true]) {
    const r=clone(run());r.phase=phase;
    const calls=[];
    g.questEvaluateRun=(input,d)=>{
      assert.strictEqual(input,r);assert.strictEqual(d,def);calls.push(phase);
      const ev=evaluate(input,d);
      return {...ev,procedural:{...ev.procedural,canAdvance:allowed,canOffer:allowed}};
    };
    const m=g.questShellModel(r,def);
    assert.deepEqual(calls,[phase]);
    assert.strictEqual(m.actions.find(a=>a.id===(phase===2?"offer":"continue")).enabled,allowed);
  }
  g.questEvaluateRun=evaluate;
});

test("equal tokens make matched and unmatched songs indistinguishable throughout the shell model", t => {
  // MUTATIONS: expose verdict fields, condition ANY model field on current or persisted matches,
  // or let the renderer add a verdict outside the model. Compare the entire model, not just voices.
  for (const questId of ["firefly-crossing", "waking-woods"]) {
    const f=compare(t,questId), {g,def,run}=f;
    for (const phase of [0,1,2]) {
      const base=clone(run()); base.phase=phase; base.draft=phase ? "B" : "A";
      base.selection=phase===2 ? "B" : null;
      const vid=phase ? "B" : "A";
      // Both keep the same complete melody and receipts. Only the pulse family changes.
      if (questId === "waking-woods") for (const v of Object.values(base.versions))
        v.song = withBeatNotes(v.song);
      base.versions.A.song.tracks[1].hits=[...clone(base.setup.fragment.hits),...beats(0,4)];
      base.versions.B.song.tracks[1].hits=[...clone(base.setup.fragment.hits),...beats(0,2)];
      for(const p of def.phases) {
        const obs=base.evidence.observations[p.id];
        if(obs)obs.matchedRouteIds=(p.challenge?.routes||[]).map(r=>r.id);
      }
      const unmatch=clone(base); unmatch.versions[vid].song.tracks[1].hits=[...clone(base.setup.fragment.hits),{lane:1,c:5}];
      if(phase<2) {
        assert.ok(g.questEvaluateRun(base,def).musical.matchedRouteIds.length>0);
        assert.deepEqual(g.questEvaluateRun(unmatch,def).musical.matchedRouteIds,[]);
      }
      // Persisted route metadata is independently varied, with identical descriptor tokens.
      for(const obs of Object.values(unmatch.evidence.observations)) obs.matchedRouteIds=[];
      for(const unsaved of [false,true]) for(const partialRange of [false,true]) {
        const view={unsaved,partialRange,stages:{"paths-of-song":2,"pulse-woods":1}};
        const a=g.questShellModel(base,def,view), b=g.questShellModel(unmatch,def,view);
        assert.deepEqual(Object.keys(a).sort(),modelKeys);
        assert.deepEqual(b,a,`${questId} phase ${phase}, same tokens and procedural facts`);
        assert.ok(!a.actions.some(x=>x.id==="shape-more"));
      }
    }
    // No consumer is allowed to inspect musical verdicts even if it hides their field names.
    const evaluate=g.questEvaluateRun;
    g.questEvaluateRun=(r,d)=>{
      const ev=evaluate(r,d);
      Object.defineProperty(ev,"musical",{get(){assert.fail("shell read a route verdict");}});
      return ev;
    };
    g.questShellModel(run(),def,{});
    g.renderQuestShell();
    assert.deepEqual(Object.keys(g.questLastRendered).sort(),modelKeys);
  }
});

test("matched and unmatched paths advance once and receive identical completion payoffs even under a new quest id", t => {
  // MUTATIONS: restore needs-confirm, route-gate continue/offer, key an action on a shipped id,
  // or diminish the unmatched payoff. The alias goes through the real catalog, not a fake registry.
  for(const original of ["firefly-crossing","waking-woods"]) {
    const outcomes=[];
    for(const matched of [false,true]) {
      const g=loadQuestGame({fresh:true}), d=clone(g.QUEST_DEFINITIONS[original]);
      d.id="authored-"+original;
      g.loadQuestCatalog(JSON.stringify({v:1,definitions:[d]}),"official");
      assert.deepEqual(g.QUEST_CATALOG_ERRORS,[]);
      const begun=g.startQuestRun(d.id); assert.strictEqual(begun.ok,true,begun.code);
      t.after(()=>{if(g.playing)g.stop();clearTimeout(g.autosaveT);});
      const run=()=>g.QUEST_RUNS[begun.runId];
      g.start=()=>{};
      const receipt=(vid,purpose="play")=>g.onCompletePass({runId:begun.runId,versionId:vid,
        editRev:run().versions[vid].editRev,sessionId:vid+"-"+run().versions[vid].editRev,purpose});
      for(const phase of [0,1]) {
        const vid=run().draft, s=clone(run().versions[vid].song);
        s.tracks[1].hits=matched ? beats(0,phase ? 2 : 4) : [{lane:1,c:phase+1}];
        const ready = completeDealtSong(g, s);
        g.applySong(original === "waking-woods" ? withBeatNotes(ready) : ready);
        g.noteEdit("A7-real-edit"); receipt(vid);
        const ev=g.questEvaluateRun(run(),d);
        assert.strictEqual(ev.musical.matchedRouteIds.length>0,matched);
        assert.strictEqual(g.questShellModel(run(),d).actions[0].enabled,true);
        assert.strictEqual(g.performQuestAction("continue").ok,true);
        assert.strictEqual(run().phase,phase+1);
      }
      for(const versionId of ["A","B"]) {
        assert.strictEqual(g.performQuestAction("pick",{versionId}).ok,true); receipt(versionId,"audition");
      }
      const offered=clone(run().versions.B.song.tracks);
      assert.strictEqual(g.performQuestAction("offer").ok,true);
      assert.strictEqual(run().status,"completed");assert.strictEqual(g.questCompleted(d.id),true);
      assert.strictEqual(g.getSaves().length,1);assert.strictEqual(g.getSaves()[0].v,3);
      assert.deepEqual(g.getSaves()[0].tracks,offered);
      const view={saved:g.questSavedState(g.getSaves(),run())};
      const finale=g.questFinaleModel(run(),d,view);
      assert.strictEqual(finale.artifactId,run().artifact.artifactId);
      // Runs must own distinct saved artifacts; compare the payoff independently of that identity.
      delete finale.artifactId;
      outcomes.push({shell:g.questShellModel(run(),d,view),finale,
        historyKeys:Object.keys(g.QUEST_HISTORY[d.id]).sort(),artifactKeys:Object.keys(run().artifact).sort()});
    }
    assert.deepEqual(outcomes[0],outcomes[1]);
  }
});

function witnessRun(g,d,w) {
  const r=g.newQuestRun({runId:"witness",questId:d.id,definitionVersion:d.v,song:w.songs.A,
    span:{start:0,end:d.workspace.columns},at:1});
  r.phase=1;r.draft="B";
  r.versions.B={...clone(r.versions.A),song:clone(w.songs.B),editRev:1,lastCompletePlayRev:1,
    forkedFrom:{versionId:"A",editRev:0}};
  return r;
}

test("three transform routes have exclusive real witnesses and no route implies another", () => {
  // MUTATIONS: omit route 3, require same contour/pulse there, drop a differs clause,
  // or make either earlier route unreachable. A witness for i but not j disproves i => j.
  const g=loadQuestGame({fresh:true}),d=g.QUEST_DEFINITIONS["firefly-crossing"];
  assert.deepEqual(g.QUEST_CATALOG_ERRORS,[]);
  const ids=["new-shape-same-heartbeat","same-shape-new-heartbeat","new-shape-new-heartbeat"];
  assert.deepEqual(d.phases[1].challenge.routes.map(r=>r.id),ids);
  const witnesses=["second-fall-same-main","second-rise-even-walk","second-fall-new-shimmer"];
  for(let i=0;i<3;i++) {
    assert.deepEqual(d.phases[1].challenge.routes[i].witnessIds,[witnesses[i]]);
    const w=d.witnesses.find(w=>w.id===witnesses[i]);assert.ok(w);
    for(const song of Object.values(w.songs))assert.strictEqual(g.questWorkspaceMismatch(song,d),null);
    const ev=g.questEvaluateRun(witnessRun(g,d,w),d);
    assert.strictEqual(ev.ok,true);assert.deepEqual(ev.musical.matchedRouteIds,[ids[i]]);
    for(let j=0;j<3;j++)assert.strictEqual(ev.musical.routes[j].matched,i===j,`${ids[i]} without ${ids[j]}`);
    const authored=clone(d);authored.id="another-crossing";
    assert.deepEqual(g.questEvaluateRun(witnessRun(g,authored,w),authored).musical.matchedRouteIds,[ids[i]]);
  }
  const w=d.witnesses.find(w=>w.id===witnesses[2]),r=witnessRun(g,d,w);
  assert.deepEqual(g.songEvidence(w.songs.A).contourFamilies,["rise"]);
  assert.deepEqual(g.songEvidence(w.songs.B).contourFamilies,["fall"]);
  assert.deepEqual(w.songs.A.tracks[1].hits,beats(0,4));
  assert.deepEqual(w.songs.B.tracks[1].hits,beats(2,2));
  // Complete independent 2x2: keep/change each lever, including neither.
  for(const shape of [false,true])for(const pulse of [false,true]) {
    r.versions.B.song=clone(w.songs.A);
    if(shape)r.versions.B.song.tracks[0]=clone(w.songs.B.tracks[0]);
    if(pulse)r.versions.B.song.tracks[1]=clone(w.songs.B.tracks[1]);
    const expected=shape ? (pulse ? ids[2] : ids[0]) : pulse ? ids[1] : null;
    assert.deepEqual(g.questEvaluateRun(r,d).musical.matchedRouteIds,expected ? [expected] : []);
  }
});

test("the final offer in either quest remains free of every readiness requirement after a last edit", t => {
  // MUTATION: extend early-phase readiness to the final offer, or reuse stale comparison receipts.
  for(const questId of ["firefly-crossing","waking-woods"]) {
    const f=compare(t,questId),{g,def,run}=f,song=clone(run().versions.B.song);
    song.tracks[0].notes=[{p:60,c:0,len:1}];song.tracks[1].hits=[];
    g.applySong(song);g.noteEdit("free-final-offer");
    assert.strictEqual(g.questReadinessMissing(def,run(),"B").length,4);
    assert.strictEqual(g.questShellModel(run(),def).actions[0].enabled,false,"an edit still requires hearing it");
    assert.strictEqual(g.performQuestAction("offer").code,"gate-closed");
    f.receipt("B","audition");
    assert.deepEqual(g.questEvaluateRun(run(),def).readiness,{ok:true,missing:[]});
    assert.deepEqual(g.questEvaluateRun({...run(),phase:1},def).musical.matchedRouteIds,[]);
    assert.strictEqual(g.questShellModel(run(),def).actions[0].enabled,true);
    assert.strictEqual(g.performQuestAction("offer").ok,true);
    assert.deepEqual(g.getSaves()[0].tracks,song.tracks);
  }
});

test("the rearranged shell forwards attributed friend voices and current paths to their render boundaries", t => {
  // MUTATIONS: stop forwarding voices, pass narrator tokens as voices, or lose path toggles.
  // Spies verify the adapter contract, not sidebar placement or drawn controls.
  for(const questId of ["firefly-crossing","waking-woods"]) {
    const f=launch(t,questId),{g,run,def}=f;f.ready();
    const voices=[],paths=[];
    g.questRenderVoices=v=>voices.push(clone(v));g.questRenderPaths=m=>paths.push(clone(m.paths));
    const expected=g.questShellModel(run(),def,{stages:g.questRegionStages(def)});
    assert.ok(expected.voices.some(v=>v.lines.length),"fixture must have spoken observations");
    g.renderQuestShell();
    assert.deepEqual(voices,[expected.voices]);assert.deepEqual(paths,[expected.paths]);
    g.performQuestAction("continue");f.ready();g.performQuestAction("continue");
    voices.length=0;paths.length=0;g.renderQuestShell();
    assert.deepEqual(paths,[g.questShellModel(run(),def).paths]);assert.strictEqual(paths[0].length,2);
    assert.deepEqual(voices,[g.questShellModel(run(),def,{stages:g.questRegionStages(def)}).voices]);
  }
});

test("status and editability follow phase type lifecycle and unsaved state without hiding the menu exit", t => {
  // MUTATIONS: omit intention or menu warning, show editable in an early/finished phase,
  // key it on index 2 or a quest id, or replace the prose with a no-op action.
  for(const questId of ["firefly-crossing","waking-woods"]) {
    const {g,run,def}=compare(t,questId);
    for(const phase of [0,1,2])for(const status of ["active","offering","completed"])
      for(const unsaved of [false,true]) {
        const r=clone(run());r.phase=phase;r.status=status;
        const m=g.questShellModel(r,def,{unsaved});
        assert.strictEqual(m.statusText,def.phases[phase].intentionText+"  "+(unsaved?g.QUEST_UNSAVED_TEXT:g.QUEST_EXIT_TEXT));
        // A5 (refined 2026-09-22) no longer requires the route be named — only that stopping reads as
        // free and the work's state is told truthfully.
        assert.match(m.statusText,/leave any time|left now/i);
        if(unsaved)assert.match(m.statusText,/could not be saved/);
        assert.strictEqual(m.editableText,phase===2&&status==="active"?g.QUEST_EDITABLE_TEXT:"");
        if(m.editableText)assert.match(m.editableText,/edit|change|work/i);
        assert.strictEqual("phaseLabel" in m,false);
        assert.deepEqual(m.steps,def.phases.map((p,i)=>({name:p.name,state:i<phase?"done":i===phase?"current":"todo"})));
        assert.ok(m.actions.every(a=>["continue","offer","retry-offer"].includes(a.id)));
      }
    const d=clone(def),r=clone(run());d.id=r.questId="unlisted-commission";
    d.phases[0]=clone(d.phases[2]);r.phase=0;
    assert.strictEqual(g.questShellModel(r,d).editableText,g.QUEST_EDITABLE_TEXT);
    d.phases[2]=clone(def.phases[0]);r.phase=2;
    assert.strictEqual(g.questShellModel(r,d).editableText,"");
  }
});

test("the renderer passes current status and save failure through the text-only status boundary", t => {
  // MUTATIONS: retain package status, pass exitText alone, omit unsaved view wiring,
  // or use innerHTML in the status sink. This is a call/source contract, not a DOM render assertion.
  const f=launch(t),{g,def,run}=f;f.ready();
  let calls=[];g.setStatusText=text=>calls.push(text);
  g.renderQuestShell();assert.deepEqual(calls,[g.questShellModel(run(),def).statusText]);
  failEdit(f);calls=[];g.renderQuestShell();
  assert.deepEqual(calls,[g.questShellModel(run(),def,{unsaved:true}).statusText]);
  const sink=g.__script.match(/function setStatusText\(text\)\{([^}]+)\}/)?.[1];
  assert.ok(sink);assert.match(sink,/statusEl\.textContent\s*=\s*text/);assert.doesNotMatch(sink,/innerHTML/);
});

test("phase envelopes supply both authored sentences to narration and retain the ringed-stone instruction", t => {
  // MUTATIONS: omit intro, narrate just one sentence, reuse phase one, or remove the keep instruction.
  // The envelope is tested; speaking, voice assets and file:// still require listening in a browser.
  for(const questId of ["firefly-crossing","waking-woods"]) {
    const {g,def}=launch(t,questId),envelope=g.questEnvelope(def);
    assert.strictEqual(envelope[0].steps.length,def.phases.length);
    for(const [i,p] of def.phases.entries()) {
      assert.strictEqual(envelope[0].steps[i].intro,p.worldText+" "+p.intentionText);
      if(i<2)assert.match(p.intentionText,/keep the ringed stones/i);
    }
    const d=clone(def);d.id="new-narrated-quest";
    d.phases.forEach((p,i)=>{p.worldText=`Story ${i}`;p.intentionText=`Intention ${i}`;});
    assert.deepEqual(g.questEnvelope(d)[0].steps.map(s=>s.intro),["Story 0 Intention 0","Story 1 Intention 1","Story 2 Intention 2"]);
  }
});

test("the finale names its commit action Save this name while retaining rename and exit behavior", t => {
  // MUTATIONS: restore Name it, relabel another action, bypass naming, or remove an exit.
  for(const questId of ["firefly-crossing","waking-woods"]) {
    const {g,run,def}=completed(t,questId),view=()=>({saved:g.questSavedState(g.getSaves(),run())});
    assert.deepEqual(g.questFinaleModel(run(),def,view()).actions,[
      {id:"name-song",label:"Save this name",enabled:true},
      {id:"open-studio",label:"Studio",enabled:true},{id:"back-to-map",label:"Map",enabled:true}]);
    assert.strictEqual(g.performQuestAction("name-song",{title:"My renamed crossing"}).ok,true);
    assert.strictEqual(g.questFinaleModel(run(),def,view()).nameField.value,"My renamed crossing");
    assert.strictEqual(g.getSaves().length,1);assert.strictEqual(run().artifact.title,"My renamed crossing");
  }
});
