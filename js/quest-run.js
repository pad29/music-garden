// ---------- QuestRun: the durable owner of a quest's versions, phase and tray ----------
// A completion receipt from the reducer above is only a claim about what was heard. Nothing becomes
// quest evidence until it survives a persisted transaction here — so a lost write can never leave the
// game believing a pass happened. Runs live at their own Store key and NEVER inside `progress`:
// cloudPush() PUTs the whole progress object, and a run holds two full songs.
const QUEST_RUN_MAX=12, QUEST_RUN_CHARS=1500000;
const jclone = v => JSON.parse(JSON.stringify(v));
// A song's identity for "did this actually change?", ignoring the timestamps every serialise rewrites.
function songIdentity(song){ if(!song) return "";
  const c=jclone(song); if(c.meta){ delete c.meta.created; delete c.meta.updated; } return JSON.stringify(c); }

function newQuestRun(o){
  const at=(o&&o.at)||0;
  return { v:1, runId:o.runId, questId:o.questId, definitionVersion:o.definitionVersion|0,
    // Authoritative, not reproducible-on-demand: the seed rides along for diagnosis, and nothing ever
    // deals this run a second hand.
    setup:o.setup ? jclone(o.setup) : null,
    status:"active", phase:0, draft:"A", selection:null,
    versions:{ A:{ song:jclone(o.song), span:jclone(o.span), editRev:0,
      lastCompletePlayRev:null, lastCompletePlaySessionId:null,
      auditionedRev:null, auditionedSessionId:null, forkedFrom:null } },
    comparison:null, tray:[], evidence:{}, pendingOffer:null, artifact:null,
    createdAt:at, updatedAt:at, abandonedAt:null };
}

// Pure. Reads no globals, never writes Store, and on failure returns the ORIGINAL run reference so a
// rejected op cannot half-mutate anything.
function reduceQuestRun(run, op){
  const no = code => ({ ok:false, run, effects:[], code });
  if(!run || !op || typeof op!=="object") return no("bad-input");
  const active = run.status==="active";
  const V = id => run.versions && run.versions[id];
  const touch = next => { next.updatedAt = Number.isFinite(op.at) ? op.at : run.updatedAt; return next; };

  if(op.type==="edit" && op.target==="tray"){
    if(!active) return no("not-active");   // an offering run is frozen until finalisation succeeds
    if(!Array.isArray(op.tray)) return no("bad-tray");
    // A tray change is NOT a song change: crafting a stamp must not invalidate playback of an
    // unchanged song, or a child would have to replay after opening their own toolbox.
    return { ok:true, run:touch(Object.assign({}, run, { tray:jclone(op.tray) })), effects:[] };
  }

  if(op.type==="edit"){
    if(!active) return no("not-active");
    const v=V(op.versionId); if(!v) return no("no-version");
    if(op.versionId!==run.draft) return no("not-draft");
    if(op.baseRev!==v.editRev) return no("stale-base");
    if(!op.song || !op.span || op.span.start!==0 || op.span.end!==(op.song.time&&op.song.time.cols)) return no("bad-span");
    if(songIdentity(op.song)===songIdentity(v.song) && v.span.end===op.span.end) return no("no-change");
    const nv=Object.assign({}, v, { song:jclone(op.song), span:jclone(op.span), editRev:v.editRev+1 });
    // lastCompletePlayRev/auditionedRev are deliberately KEPT: they simply stop being equal to editRev,
    // which is the whole gate. Clearing them would lose the audit trail for no gain.
    return { ok:true, run:touch(Object.assign({}, run, { versions:Object.assign({}, run.versions, {[op.versionId]:nv}) })), effects:[] };
  }

  if(op.type==="completePass"){
    if(!active) return no("not-active");
    const v=V(op.versionId); if(!v) return no("no-version");
    if(typeof op.sessionId!=="string" || !op.sessionId) return no("no-session");
    if(op.editRev!==v.editRev) return no("stale-rev");     // second defence: even if cancellation wiring failed
    if(!songIsAudible(v.song)) return no("empty-song");
    const nv=Object.assign({}, v, { lastCompletePlayRev:op.editRev, lastCompletePlaySessionId:op.sessionId });
    return { ok:true, run:touch(Object.assign({}, run, { versions:Object.assign({}, run.versions, {[op.versionId]:nv}) })), effects:[] };
  }

  if(op.type==="audition"){
    if(!active) return no("not-active");
    const v=V(op.versionId); if(!v) return no("no-version");
    if(v.lastCompletePlayRev!==op.editRev || v.lastCompletePlaySessionId!==op.sessionId) return no("not-heard");
    const nv=Object.assign({}, v, { auditionedRev:op.editRev, auditionedSessionId:op.sessionId });
    return { ok:true, run:touch(Object.assign({}, run, { versions:Object.assign({}, run.versions, {[op.versionId]:nv}) })), effects:[] };
  }

  // The observation rides in the SAME transaction as the playback credit that earned it, so the
  // description a child reads always belongs to the revision and session that produced it. If the
  // write fails, neither the credit nor the description publishes.
  if(op.type==="recordObservation"){
    if(!active) return no("not-active");
    const v=V(op.versionId); if(!v) return no("no-version");
    if(op.editRev!==v.editRev) return no("stale-rev");
    if(v.lastCompletePlayRev!==op.editRev || v.lastCompletePlaySessionId!==op.sessionId) return no("not-heard");
    // The frozen catalog, looked up by the id the run already carries. This is immutable engine data,
    // not live state: a description may only name routes and descriptors its own definition declares.
    const def=QUEST_DEFINITIONS[run.questId];
    if(!def || def.v!==run.definitionVersion) return no("no-definition");
    // The receipt is for the phase the run is ON, and for that phase's own version. A phase-1 pass
    // could otherwise write a phase-3 observation before B exists — a description of something that
    // has not happened. Found by GPT's tester.
    const ph=def.phases[run.phase];
    if(!ph || ph.id!==op.phaseId) return no("wrong-phase");
    if(!ph.challenge) return no("no-challenge");            // nothing musical is judged in a compare phase
    if(op.versionId!==ph.versionId) return no("wrong-version");
    const ids=(op.matchedRouteIds||[]), toks=(op.descriptorTokens||[]);
    if(!Array.isArray(ids) || ids.length>4 || !Array.isArray(toks) || toks.length>8) return no("bad-payload");
    const known=ph.challenge.routes.map(r=>r.id);
    for(const id of ids) if(known.indexOf(id)<0) return no("unknown-route");
    // Only what THIS phase's analyzers could have said. A compose phase has no snapshot, so a forged
    // "the second path changed" receipt has no way in.
    const sayable=Object.create(null);
    for(const r of ph.challenge.routes) for(const o of r.observations){
      const prim=QUEST_PRIMITIVES[o.analyzerId];
      for(const d of (prim && prim.heardDescriptorIds) || []) sayable[d]=1; }
    const clean=[];
    for(const t of toks){
      if(!t || typeof t!=="object" || !QUEST_DESCRIPTORS[t.id] || QUEST_DESCRIPTORS[t.id].kind!=="heard") return no("unknown-descriptor");
      if(!sayable[t.id]) return no("descriptor-unreachable");
      if(t.slots!==undefined && (!t.slots || typeof t.slots!=="object" || Array.isArray(t.slots))) return no("bad-slots");
      const declared=QUEST_DESCRIPTORS[t.id].slots||[];
      for(const k of Object.keys(t.slots||{})){
        if(declared.indexOf(k)<0) return no("unknown-slot");    // a key the wording never reads
        if(!QUEST_ENUM_LABELS[t.slots[k]]) return no("bad-slot-value"); }
      for(const k of declared) if(!(t.slots && t.slots[k])) return no("missing-slot");
      clean.push(t.slots ? { id:t.id, slots:Object.assign({}, t.slots) } : { id:t.id }); }
    const entry={ versionId:op.versionId, editRev:op.editRev, sessionId:op.sessionId,
      matchedRouteIds:ids.slice(), descriptorTokens:clean, at:op.at };
    const evidence=Object.assign({}, run.evidence);
    evidence.observations=Object.assign({}, evidence.observations, { [op.phaseId]:entry });
    return { ok:true, run:touch(Object.assign({}, run, { evidence })), effects:[] };
  }

  if(op.type==="forkFrom"){
    if(!active) return no("not-active");
    const src=V(op.sourceVersionId); if(!src) return no("no-source");
    if(op.sourceRev!==src.editRev) return no("stale-source");
    if(!op.newVersionId || V(op.newVersionId)) return no("bad-new-id");
    const nv={ song:jclone(src.song), span:jclone(src.span), editRev:0,
      lastCompletePlayRev:null, lastCompletePlaySessionId:null, auditionedRev:null, auditionedSessionId:null,
      forkedFrom:{ versionId:op.sourceVersionId, editRev:op.sourceRev } };
    return { ok:true, run:touch(Object.assign({}, run, {
      versions:Object.assign({}, run.versions, {[op.newVersionId]:nv}),
      draft:op.newVersionId, selection:null, comparison:null })), effects:[] };
  }

  if(op.type==="compare"){
    if(!active) return no("not-active");
    const l=V(op.leftVersionId), r=V(op.rightVersionId);
    if(!l || !r || op.leftVersionId===op.rightVersionId) return no("bad-pair");
    if(l.auditionedRev!==l.editRev || r.auditionedRev!==r.editRev) return no("not-auditioned");
    const comparison={ versionIds:[op.leftVersionId, op.rightVersionId],
      revs:{ [op.leftVersionId]:l.editRev, [op.rightVersionId]:r.editRev }, comparedAt:op.at };
    return { ok:true, run:touch(Object.assign({}, run, { comparison })), effects:[] };
  }

  // Tapping a path is how a child hears it, and the path they are hearing is the one they are holding:
  // selection and draft move together. It waits for no comparison — the comparison is a CONSEQUENCE of
  // having heard both, recorded on the receipts, and gating the pick on it made the first tap
  // impossible. What the comparison still gates is the OFFER, which is where it belongs.
  if(op.type==="selectDraft"){
    if(!active) return no("not-active");
    if(!V(op.versionId)) return no("no-version");
    return { ok:true, run:touch(Object.assign({}, run, { selection:op.versionId, draft:op.versionId })), effects:[] };
  }

  if(op.type==="offer"){
    if(!active) return no("not-active");
    const id=run.selection; if(!id) return no("no-selection");
    const v=V(id); if(!v) return no("no-version");
    // NO route match is consulted, and there is no input here that could carry one. That is what
    // structurally preserves Q6's "offer anyway": the only bars are a real artifact and a real listen.
    if(!songIsAudible(v.song)) return no("empty-song");
    if(v.lastCompletePlayRev!==v.editRev) return no("not-heard");
    return { ok:true, run:touch(Object.assign({}, run, { status:"offering",
      pendingOffer:{ artifactId:"quest-run:"+run.runId, versionId:id, editRev:v.editRev,
                     title:op.title||"", offeredAt:op.at } })), effects:[] };
  }

  if(op.type==="saveAs"){
    if(run.status!=="offering" || !run.pendingOffer) return no("not-offering");
    if(op.artifactId!==run.pendingOffer.artifactId) return no("wrong-artifact");
    const p=run.pendingOffer;
    return { ok:true, run:touch(Object.assign({}, run, { status:"completed", pendingOffer:null,
      artifact:{ artifactId:p.artifactId, versionId:p.versionId, editRev:p.editRev,
                 title:p.title, savedAt:op.savedAt } })), effects:[] };
  }

  // The run's copy of the song's name, brought back into line. The SONG is authoritative — it is the
  // payoff and it is what the player will see in their melodies — so this op only ever records what
  // the store already says. It is also the repair path: two Store keys cannot be written together, so
  // a crash between them leaves the run stale and this is what fixes it.
  if(op.type==="rename"){
    if(run.status!=="completed" || !run.artifact) return no("not-completed");
    if(typeof op.title!=="string" || !op.title) return no("bad-title");
    return { ok:true, run:touch(Object.assign({}, run,
      { artifact:Object.assign({}, run.artifact, { title:op.title }) })), effects:[] };
  }

  // Private: only advanceQuestPhase() may submit this, which is what makes it the sole phase writer.
  if(op.type==="_phase"){
    if(!active) return no("not-active");
    if(!Number.isInteger(op.to) || op.to!==run.phase+1) return no("bad-phase-step");
    return { ok:true, run:touch(Object.assign({}, run, { phase:op.to })), effects:[] };
  }

  if(op.type==="abandon"){
    if(!active) return no("not-active");
    return { ok:true, run:touch(Object.assign({}, run, { status:"abandoned", abandonedAt:op.at })), effects:[] };
  }

  return no("unknown-op");
}

// All-or-nothing: a candidate is built up and thrown away whole if any op fails.
function reduceQuestTransaction(run, ops){
  let cand=run; const effects=[];
  for(const op of (ops||[])){
    const r=reduceQuestRun(cand, op);
    if(!r.ok) return { ok:false, run, effects:[], code:r.code, failedOp:op.type };
    cand=r.run; effects.push(...r.effects);
  }
  return { ok:true, run:cand, effects };
}

// ---- persistence: own key, capped, pruned, published only after the write lands ----
// Runs are capped and pruned; a COMPLETION is not. Finishing a quest and then starting twelve more
// would otherwise erase the record that you ever finished it — the run carrying the evidence is the
// same object the cap throws away. One small record per quest, outside the cap, in the same write.
let QUEST_HISTORY=Object.create(null);
function questRunEnvelope(runs, hist){ return { v:2, runs, completed:hist||QUEST_HISTORY }; }
function questHistoryEntry(run){
  return { questId:run.questId, definitionVersion:run.definitionVersion,
           lastRunId:run.runId, artifactId:run.artifact&&run.artifact.artifactId,
           completedAt:(run.artifact&&run.artifact.savedAt)||run.updatedAt }; }
const questCompleted = questId => !!QUEST_HISTORY[questId];
function pruneQuestRuns(runs, keepId){
  let out=Object.assign({}, runs);
  const terminal = st => st==="abandoned" || st==="completed";
  const order = () => Object.keys(out).filter(id=>id!==keepId && terminal(out[id].status))
    .sort((a,b)=>({abandoned:0,completed:1})[out[a].status]-({abandoned:0,completed:1})[out[b].status]
              || (out[a].updatedAt||0)-(out[b].updatedAt||0));
  const tooMany = () => Object.keys(out).length>QUEST_RUN_MAX;
  const tooBig  = () => JSON.stringify(questRunEnvelope(out)).length>QUEST_RUN_CHARS;
  while(tooMany() || tooBig()){
    const victims=order(); if(!victims.length) break;      // never prune an active or offering run
    delete out[victims[0]];
  }
  return out;
}
// Returns false rather than throwing: a full disk must surface as a failed transaction, not a silent loss.
function saveQuestRuns(runs, hist){
  const pruned=pruneQuestRuns(runs, null);
  const env=questRunEnvelope(pruned, hist);
  if(JSON.stringify(env).length>QUEST_RUN_CHARS) return false;
  return Store.set("questRuns", env) ? pruned : false;
}
function hydrateQuestRuns(){
  const env=Store.get("questRuns", null);
  const out=Object.create(null), hist=Object.create(null);
  // v1 profiles carry no completion map, so derive one from whatever completed runs survived the cap.
  // Migration is in-memory: the next ordinary quest write saves v2 rather than forcing one now.
  if(env && (env.v===1 || env.v===2) && env.runs && typeof env.runs==="object"){
    for(const id of Object.keys(env.runs)){ const r=env.runs[id];
      // A malformed run is ignored, never repaired into plausible state — a wrong phase is worse than none.
      if(r && r.runId===id && r.versions && Number.isInteger(r.phase) && r.phase>=0 && typeof r.status==="string")
        out[id]=r; }
    if(env.v===2 && env.completed && typeof env.completed==="object"){
      for(const q of Object.keys(env.completed)){ const c=env.completed[q];
        if(c && c.questId===q && typeof c.lastRunId==="string") hist[q]=c; }
    } else {
      for(const id of Object.keys(out)) if(out[id].status==="completed") hist[out[id].questId]=questHistoryEntry(out[id]);
    }
  }
  QUEST_RUNS=out; QUEST_HISTORY=hist; return out;
}


// ---------- The gate, the phase, and the offering ----------
// The whole of QUESTS.md Q6's "played completely since its latest edit" is this equality. It reads no
// live document, no paint state, no clock and no transport session — only two numbers the QuestRun
// already owns, which is why it can be trusted after a reload.
function playbackCompleteSinceLastEdit(run, versionId){
  const v = run && run.versions && run.versions[versionId];
  return !!v && v.lastCompletePlayRev===v.editRev; }

// The ONLY post-construction writer of run.phase. Everything else — the lesson engine, the next
// button, stageComplete — is structurally unable to move a quest on, which is the anti-drift rule
// the scope migration established applied to the phase.
function advanceQuestPhase(o){
  const fail = code => ({ ok:false, code });
  if(!o || !isQuestScope() || activeScope.runId!==o.runId) return fail("wrong-scope");
  if(levelIdx!==0) return fail("bad-level");                       // a quest is ONE level; its steps are the phases
  const run=QUEST_RUNS[o.runId];
  if(!run || run.status!=="active") return fail("no-run");
  if(run.phase!==o.expectedPhase) return fail("stale-phase");
  const steps=(currentLevel()&&currentLevel().steps)||[];
  if(!steps[o.expectedPhase+1]) return fail("no-next-phase");
  if(typeof o.gate!=="function") return fail("no-gate");
  let open=false;
  try{ open = o.gate(run)===true; }catch(e){ return fail("gate-threw"); }   // a throwing gate is a closed gate
  if(!open) return fail("gate-closed");
  // The preparatory ops and the phase step land in ONE persisted transaction: a fork that succeeded
  // while the phase move failed would leave the run with a version nothing points at.
  const r=transactQuestRun(o.runId, (o.ops||[]).concat([{ type:"_phase", to:o.expectedPhase+1, at:Date.now() }]));
  return r.ok ? { ok:true, phase:QUEST_RUNS[o.runId].phase } : fail(r.code||"transaction-failed");
}

// ---- offering: three ordered steps, replayable from any interruption ----
// localStorage cannot write two keys atomically, so finalisation is ordered so that every crash point
// is recoverable and a COMPLETED run can never exist without its artifact having been written first.
function questArtifactUpsert(run){
  const p=run.pendingOffer; if(!p) return false;
  const v=run.versions[p.versionId]; if(!v) return false;
  const song=jclone(v.song);
  song.meta=Object.assign({}, song.meta, { localId:p.artifactId, title:p.title,
    source:{ kind:"quest", runId:run.runId, questId:run.questId, definitionVersion:run.definitionVersion } });
  const saves=getSaves();
  const at=saves.findIndex(x=>x&&x.meta&&x.meta.localId===p.artifactId);
  if(at>=0) saves[at]=song; else saves.unshift(song);              // upsert, so a retry cannot duplicate
  return setSaves(saves);          // false on a full disk — finalisation stops here and the run stays offering
}
function finalizeQuestOffering(runId){
  const run=QUEST_RUNS[runId];
  if(!run || run.status!=="offering" || !run.pendingOffer) return { ok:false, code:"not-offering" };
  // The definition names the payoff, so the id selects what finalisation writes rather than being a
  // word nobody reads. With the definition gone there is nothing to read it from, and the saved song
  // is the only payoff this format has ever had — putting the song away beats stranding it.
  const def=QUEST_DEFINITIONS[run.questId];
  const payoff=QUEST_PAYOFFS[def ? def.completion.payoffId : "saved-song"];
  if(!payoff) return { ok:false, code:"no-payoff" };
  if(!payoff.finalize(run)) return { ok:false, code:"artifact-failed" };
  const r=transactQuestRun(runId, [{ type:"saveAs", artifactId:run.pendingOffer.artifactId, savedAt:Date.now() }]);
  // …read back AFTER the write: `run` is the pre-transaction reference, whose artifact is still null,
  // so this reported null every single time it succeeded.
  const saved=QUEST_RUNS[runId];
  return r.ok ? { ok:true, artifactId:saved && saved.artifact && saved.artifact.artifactId }
              : { ok:false, code:r.code };
}
// ---------- Entering a quest, and moving through it ----------
// ONE level whose steps are the phases, so the shipped indexed-stage engine is reused rather than
// duplicated. Deliberately NO `goals` on a step: checkLevel() cannot call stageComplete() on an empty
// goal list, which is what structurally stops the lesson engine from moving a quest on. Only
// advanceQuestPhase() may do that.
// The field guides a quest's analyzers declare. Read from what the routes NAME, never from what the song
// currently matches, and applied to every phase: the last one is still editable, and switching a guide off
// at the moment of choice would change the field under the child's hands.
function questFieldGuides(def){
  const out=new Set();
  for(const p of def.phases) if(p.challenge) for(const r of p.challenge.routes) for(const o of r.observations){
    const prim=QUEST_PRIMITIVES[o.analyzerId];
    if(prim && prim.fieldGuide) out.add(prim.fieldGuide); }
  return out;
}
function questEnvelope(def){
  const guides=questFieldGuides(def);
  return [Object.freeze({ id:def.id, name:def.title, quest:true,
    drums:def.workspace.controlIds.indexOf("drums")>=0,   // renderLevel opens the bed for a level that
    loop: def.workspace.controlIds.indexOf("loop")>=0,     // says so; a quest says so through its workspace
    steps:def.phases.map(p=>Object.freeze({ id:p.id, name:p.name, title:p.name, quest:true, phase:p,
      beatGuide:guides.has("beats"),
      // What the narrator says on arriving at a phase: the story, then what it is asking for. No baked
      // clip exists for authored quest text, so this takes narrate()'s browser-voice fallback — which
      // is also the only honest option for text a player could one day write themselves.
      intro:p.worldText+" "+p.intentionText })) })];
}

// The gate for a phase is the AND of the gate ids IT declares — no phase-specific branch anywhere, so
// a new phase type is data rather than code. A gate that throws is a closed gate: advanceQuestPhase
// catches it and reports gate-threw.
function questPhaseGate(def, phaseIdx, versionId){
  const p=def.phases[phaseIdx];
  return run=>{
    // Readiness first, and only where a task was set. The comparison phase never asks: Q6 keeps the
    // last step free, and the owner's amendment holds readiness to the phases before it.
    if(p.type!=="compare-offer" && questReadinessMissing(def, run, versionId).length) return false;
    for(const id of p.procedure.gateIds){
      const g=QUEST_PRIMITIVES[id];
      if(!g || g.kind!=="procedural") return false;
      if(g.gate(run, versionId)!==true) return false; }
    return true; };
}
// What a transition has to do BESIDES moving the phase, named by the definition rather than by a
// switch on the phase number.
function questTransitionOps(def, run, at){
  const t=QUEST_TRANSITIONS[def.phases[run.phase].procedure.transitionId];
  return (t && t.ops) ? t.ops(def, run, at) : null;
}

const QUEST_DEFAULT_TEMPO=108;
function emptyQuestSong(def){
  const now=Date.now();
  return { v:3, meta:{ title:null, created:now, updated:now, author:null },
    palette:def.workspace.paletteId,
    time:{ cols:def.workspace.columns, tempo:QUEST_DEFAULT_TEMPO,
           groove:QUEST_GROOVES[def.workspace.grooveId] },
    tracks:[{ kind:"melody", voice:"musicbox", notes:[] }, { kind:"drums", hits:[] }] };
}

// Would entering this run be refused? Home and the door must answer identically: D6 found a Continue
// button advertising a run the door would bounce, and a dealt task that no longer fits its rule is the
// same defect wearing the new field's clothes. Two places asking it separately is how they drift.
function questRunUnusable(def, run){
  if(!def || !run) return "no-definition";
  if(def.v!==run.definitionVersion) return "definition-changed";
  if(def.setup!==undefined){
    const kind=QUEST_SETUP_KINDS[def.setup.kind];
    if(!kind) return "no-such-setup-kind";
    if(kind.validateInstance(run.setup, def.setup, def) || questSetupCompletable(def, run.setup))
      return "unusable-setup";
  } else if(run.setup) return "unexpected-setup";
  return null;
}

// Resume. It resolves the run's OWN definition version and refuses rather than guessing: a run made
// against a definition the game no longer ships is not a run this build knows how to render.
function enterQuestRun(runId){
  const fail=code=>({ ok:false, code });
  const run=QUEST_RUNS[runId];
  if(!run) return fail("no-run");
  const phase=questPhaseIndex(runId);
  if(phase===QUEST_PHASE_INVALID) return fail("unusable-run");   // the -1 sentinel's one real caller
  const def=QUEST_DEFINITIONS[run.questId];
  if(!def) return fail("no-definition");
  const unusable=questRunUnusable(def, run);
  if(unusable) return fail(unusable);
  if(!def.phases[phase]) return fail("no-phase");
  const v=run.versions[run.draft];
  if(!v || !v.song) return fail("no-draft");
  // The workspace palette is fixed by the definition, and a definition change is already refused
  // above — so a draft in another ladder is a corrupt run, not a legitimate one.
  if(v.song.palette!==def.workspace.paletteId) return fail("palette-mismatch");
  setPlayScope({ kind:"quest", questId:run.questId, runId, stages:questEnvelope(def),
    palette:def.workspace.paletteId, features:def.workspace.controlIds });
  // renderLevel() applies the WORKSPACE — palette, toolbox, controls, the drum bed — and ends by
  // calling renderStage(), which branches to the quest shell and puts the draft back on the field.
  // setPalette() inside it clears the melody through tx(), so the whole thing is deaf to the run.
  const was=questPainting; questPainting=true;
  try{ renderLevel(); } finally{ questPainting=was; }
  return { ok:true, runId, questId:run.questId, phase, versionId:run.draft };
}

// Every button the quest shell will own, behind one door. The shell decides what to SHOW; what may
// happen, and in what order, is decided here and by the reducer beneath it.
function performQuestAction(actionId, opts){
  const fail=code=>({ ok:false, code });
  if(!isQuestScope()) return fail("wrong-scope");
  const runId=activeScope.runId, run=QUEST_RUNS[runId];
  if(!run) return fail("no-run");
  const def=QUEST_DEFINITIONS[run.questId];
  if(!def || def.v!==run.definitionVersion) return fail("no-definition");
  const p=def.phases[run.phase];
  if(!p) return fail("no-phase");
  const o=opts||{}, at=Date.now();

  if(actionId==="continue"){
    // The same fact the button read. Advancing repaints from the stored song, so doing it with an
    // edit still outstanding is the one move that can lose the child's work.
    if(questHasUnsavedEdit(runId, p.versionId)) return fail("unsaved-edit");
    const ops=questTransitionOps(def, run, at);
    if(!ops) return fail("not-a-transition");             // the compare phase offers; it does not advance
    const adv=advanceQuestPhase({ runId, expectedPhase:run.phase,
      gate:questPhaseGate(def, run.phase, p.versionId), ops });
    // A new phase is a new beginning: the previous phase's undo history would otherwise let a child
    // "make a second path" by pressing Undo, walking B back into an earlier A.
    if(adv.ok) questPaintField(runId);
    return adv;
  }

  // Hear, choose and compare were three buttons for one act. Tapping a path now puts it on the field,
  // makes it the one being held, and plays it — and because the path on the grid IS the draft, the
  // listening lock that used to guard the gap between them has nothing left to guard.
  if(actionId==="pick"){
    if(p.type!=="compare-offer" || p.versionIds.indexOf(o.versionId)<0) return fail("bad-version");
    if(!run.versions[o.versionId]) return fail("no-version");
    // Switching repaints the field from the OTHER version, so an edit that never reached the store is
    // gone for good — the marker survives but the note does not, and the next edit it promised to save
    // has nothing left to save. Re-tapping the path already showing is not a switch and stays allowed.
    if(o.versionId!==run.draft && questHasUnsavedEdit(runId, run.draft)) return fail("unsaved-edit");
    const was=run.draft;
    if(playing) stop();
    const r=transactQuestRun(runId, [{ type:"selectDraft", versionId:o.versionId, at }]);
    if(!r.ok) return r;                                   // a refused write leaves the field as it was
    // Only a SWITCH touches the document. Tapping the path already showing is just listening again, and
    // reloading it was quietly destructive: applySong rebuilds every note with a fresh id, so tx() saw
    // a changed document and journalled a musically invisible entry. One Undo then took back the load
    // instead of the child's work, redo was dropped, and enough taps pushed real edits out of the
    // bounded journal entirely. Found by GPT's tester, which left the regression red rather than hide it.
    // (`load-song` is a SCRIPTED_TX, so it never counted as an edit — only as journal noise.)
    if(was!==o.versionId){
      // The paint guard stays: applySong's own tx is scripted, but a palette that differs makes it
      // nest a NON-scripted one, and that would count the act of listening as an edit.
      const wasPainting=questPainting; questPainting=true;
      try{ applySong(QUEST_RUNS[runId].versions[o.versionId].song); } finally{ questPainting=wasPainting; }
      // applySong rebuilt the cells, and the rings and guides went with them: switching paths stripped the
      // dealt stones and opening of their rings in both quests. Found by GPT's tester.
      applyStageDecor();
      journalClear();                                     // the other path's history is not this one's
    }
    renderQuestShell();
    start({ versionId:o.versionId, purpose:"audition" });
    return { ok:true, versionId:o.versionId };
  }

  if(actionId==="offer"){
    const end=QUEST_COMPLETION_ACTIONS[def.completion.actionId];
    if(!end || p.procedure.transitionId!==end.transitionId) return fail("not-offerable");
    // The SAME version the offer reducer will use. `run.selection || run.draft` also worked, because
    // choose() sets both — but two expressions that happen to agree are one refactor away from not
    // agreeing, and the gate must be asked about the song that is actually going to be saved.
    if(!questPhaseGate(def, run.phase, run.selection)(run)) return fail("gate-closed");
    // …and the same question the button asked. Saving the stored version while the field holds an
    // edit that never reached the store would hand the child a song they never heard.
    if(questHasUnsavedEdit(runId, run.selection)) return fail("unsaved-edit");
    const r=transactQuestRun(runId, [{ type:"offer",
      title:(o.title||"").trim() || def.completion.defaultTitle, at }]);
    if(!r.ok) return r;
    const done=finalizeQuestOffering(runId);              // artifact first, then the run: ordering IS the recovery
    renderQuestShell();                                   // …and then SAY so: this is the moment the quest was for
    // The controller decides that the quest is over; it does not throw the party. Confetti, playback
    // and an overlay are the shell's business, and a controller that fired them would mean no test
    // could offer a song without starting the transport.
    return done.ok ? Object.assign({ finale:true }, done) : done;
  }

  // The one action that is pure presentation: it clears what is in the way and plays from the top.
  // It never discards the selection silently — the child asked for it, so a button asks back.
  if(actionId==="play-whole"){
    if(playing) stop();
    clearLoopRange(); cursorPinned=false; setCursor(0);
    renderQuestShell();
    start({ versionId:o.versionId||p.versionId, purpose:o.purpose||"play" });
    return { ok:true };
  }

  // Naming the song, in the only place the game has ever offered one: there is no rename anywhere
  // else, which is why both of the finale's exits commit whatever is in the field.
  if(actionId==="name-song"){
    const done=QUEST_RUNS[runId];
    if(!done || done.status!=="completed" || !done.artifact) return fail("not-completed");
    const title=(o.title||"").trim();
    if(!title || title.length>80) return fail("bad-title");
    const id=done.artifact.artifactId;
    const saves=getSaves();
    const idx=saves.findIndex(x=>x && x.meta && x.meta.localId===id);
    if(idx<0) return fail("no-artifact");
    // The song first. Two Store keys cannot be written atomically, so the ORDER decides what a crash
    // leaves behind: a renamed song with a stale run record is legible and repairable, while a run
    // claiming a name the song does not have is a lie nothing can detect later.
    if(saves[idx].meta.title!==title){
      const next=saves.slice();
      next[idx]=Object.assign({}, next[idx], { meta:Object.assign({}, next[idx].meta, { title }) });
      if(!setSaves(next)) return fail("rename-failed"); }     // nothing has changed
    // …and then the run. Reached with unchanged text too, which is what repairs a pair left stale by
    // an earlier half-success.
    if(done.artifact.title!==title){
      const rr=transactQuestRun(runId, [{ type:"rename", title, at }]);
      if(!rr.ok){ renderQuestFinale(); return { ok:true, partial:"run-not-updated", title }; } }
    renderQuestFinale();
    return { ok:true, title };
  }

  if(actionId==="retry-offer"){
    // No status check here: finalizeQuestOffering already refuses anything that is not mid-offering,
    // and a second guard nothing can tell apart from its absence is one nobody can trust either.
    const r=finalizeQuestOffering(runId);
    renderQuestShell();
    return r.ok ? Object.assign({ finale:true }, r) : r;
  }

  if(actionId==="abandon"){ const r=transactQuestRun(runId, [{ type:"abandon", at }]);
    if(r.ok) renderQuestShell();
    return r; }
  if(actionId==="leave"){ leaveQuest(); return { ok:true }; }
  return fail("unknown-action");
}

// ---------- Who may begin, and what Home shows ----------
// Pure: progress, the runs and the history all arrive as arguments. Eligibility is an AND over package
// completion and nothing else — capabilities are never read from progress, and a quest never gates a
// package, a palette, an instrument, a tool or a Studio control. It is a door, not a fence.
function questEligibility(defs, progress, runs, history){
  const done = id => !!(progress && progress.packages && progress.packages[id]
                        && progress.packages[id].completed);
  const out=[];
  for(const questId of Object.keys(defs).sort()){
    const d=defs[questId];
    const missing=d.prerequisites.earnedByPackageIds.filter(p=>!done(p));
    // "Live" is active OR offering: a run stuck mid-save is still this child's run, and offering them
    // a fresh Begin beside it would quietly abandon the song they have not managed to put away.
    let live=null;
    for(const runId of Object.keys(runs).sort()){
      const r=runs[runId];
      if(r.questId!==questId || (r.status!=="active" && r.status!=="offering")) continue;
      if(questRunUnusable(d, r)) continue;   // enterQuestRun would refuse it; do not advertise the refusal
      if(!live || (r.updatedAt||0)>(runs[live].updatedAt||0)) live=runId; }
    const completed=!!(history && history[questId]);
    out.push({ questId, eligible:missing.length===0, missing, liveRunId:live, completed,
      action: live ? "continue" : missing.length ? "locked" : completed ? "replay" : "begin",
      priority:d.presentation.priority, estimateMinutes:d.presentation.estimateMinutes });
  }
  return out;
}

// At most ONE thing, ever. A second quest is reachable through the trail, never advertised beside the
// first — two invitations at once is how a garden starts feeling like a list of chores.
function surfaceQuest(defs, progress, runs, history){
  const best=status=>{
    let pick=null;
    for(const runId of Object.keys(runs).sort()){
      const r=runs[runId];
      if(r.status!==status || !Object.prototype.hasOwnProperty.call(defs, r.questId)) continue;
      if(r.definitionVersion!==defs[r.questId].v) continue;   // …the same question the door asks
      if(!pick) { pick=runId; continue; }
      const p=runs[pick], a=(r.updatedAt||0), b=(p.updatedAt||0);
      // Ties break on quest id, then run id, so the same profile always surfaces the same thing.
      if(a>b || (a===b && (r.questId<p.questId || (r.questId===p.questId && runId<pick)))) pick=runId; }
    return pick; };
  const stuck=best("offering");
  if(stuck) return { kind:"retry", questId:runs[stuck].questId, runId:stuck };
  const going=best("active");
  if(going) return { kind:"continue", questId:runs[going].questId, runId:going };
  const fresh=questEligibility(defs, progress, runs, history)
    .filter(r=>r.action==="begin")
    .sort((a,b)=>a.priority-b.priority || (a.questId<b.questId?-1:1))[0];
  return fresh ? { kind:"begin", questId:fresh.questId } : null;
}

// What the card says. Separated from the drawing for the same reason the shell's model is: the words
// a child reads are the part worth testing.
// The one place a theme id turns into something a child sees. An unknown theme cannot reach here - the
// catalog refuses it - so the empty string is for a card drawn while the registry is still empty.
const questIcon = def => ((QUEST_THEMES[def.presentation.themeId]||{}).icon || "");
function questHomeCard(defs, progress, runs, history){
  const s=surfaceQuest(defs, progress, runs, history);
  if(!s) return null;
  const def=defs[s.questId];
  const icon=questIcon(def);
  if(s.kind==="begin") return { kind:"begin", questId:s.questId, title:def.title, icon,
    subtitle:def.presentation.cardText,
    meta:"About "+def.presentation.estimateMinutes+" minutes", label:"Begin quest" };
  const run=runs[s.runId];
  if(s.kind==="continue") return { kind:"continue", questId:s.questId, runId:s.runId, icon,
    title:"Continue "+def.title,
    subtitle:"Phase "+(run.phase+1)+" of "+def.phases.length+" · saved on this device",
    meta:"", label:"Continue" };
  return { kind:"retry", questId:s.questId, runId:s.runId, title:def.title, icon,
    subtitle:"Your song is still waiting to be put away.", meta:"", label:"Try saving it again" };
}

// The deliberate list: everything else, including what has been finished. Replay makes a NEW run, and
// therefore a new artifact id, so an earlier offered song is never written over.
function questTrailModel(defs, progress, runs, history){
  const surfaced=surfaceQuest(defs, progress, runs, history);
  return questEligibility(defs, progress, runs, history).filter(r=>r.action!=="locked").map(r=>{
    const def=defs[r.questId];
    return { questId:r.questId, title:def.title, icon:questIcon(def), action:r.action, missing:r.missing,
      surfaced: !!surfaced && surfaced.questId===r.questId,
      label: r.action==="continue" ? "Continue"
           : r.action==="replay"   ? "Start a new version" : "Begin quest",
      enabled: true };
  });
}

