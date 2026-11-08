// ---------- Completion sessions: proving a pass was HEARD, not merely started ----------
// `ev.played` means "playback was STARTED from column 0" — it is set inside start() before a single
// column has sounded, which is fine for a listen-goal and useless for QUESTS.md Q6, which needs proof
// that one revision of one version traversed its whole span at AUDIBLE time. Three traps sit between:
//   • the pump books AHEAD of the audio clock by a lookahead window, so the loop wrap at
//     `bookCol=loopA()` happens before the player has heard the end of the pass;
//   • paintDue() admits entries at ct+0.02 and coalesces a backlog to the LAST due entry, so it can
//     credit ~20ms early and can miss a wrap entirely under a delayed drain;
//   • stop() is called both by the natural end and by the player pressing ■, so it cannot tell a
//     finished pass from an abandoned one.
// So completion rides the audio clock on its own queue, and the reducer proves traversal from the
// ACTUAL booking sequence rather than trusting a fullPass flag handed in by the transport.
const completionInit = () => ({ active:null, queue:[] });

function drainCompletionQueue(S, now){
  if(!Number.isFinite(now)) return { state:S, effects:[] };
  const kept=[], effects=[];
  for(const e of S.queue){
    if(e.at<=now){                       // no allowance: paintDue's +0.02 is a DISPLAY tolerance, not an audible one
      if(e.fullPass && S.active && S.active.sessionId===e.sessionId)
        effects.push({ type:"completePass", runId:S.active.runId, versionId:e.versionId,
                       editRev:e.editRev, sessionId:e.sessionId, purpose:S.active.purpose });
    } else kept.push(e);                 // and no coalescing: three overdue wraps emit three receipts
  }
  return { state:{ active:S.active, queue:kept }, effects };
}

// Pure. Reads no globals, no DOM, no transport, no clock — every identity and time arrives in the event.
function reduceCompletionSession(state, ev){
  const S = state || completionInit();
  const none = { state:S, effects:[] };
  if(!ev || typeof ev!=="object") return none;

  if(ev.type==="start"){
    const ok = typeof ev.sessionId==="string" && ev.sessionId
      && typeof ev.runId==="string" && ev.runId
      && typeof ev.versionId==="string" && ev.versionId
      && Number.isInteger(ev.editRev) && ev.editRev>=0
      && (ev.purpose==="play" || ev.purpose==="audition")
      && ev.span && Number.isInteger(ev.span.start) && Number.isInteger(ev.span.end)
      && ev.span.start===0 && ev.span.end>ev.span.start;
    if(!ok) return { state:completionInit(), effects:[] };   // an invalid start leaves NO session: fail closed
    return { state:{ active:{ sessionId:ev.sessionId, runId:ev.runId, versionId:ev.versionId,
      editRev:ev.editRev, purpose:ev.purpose, span:{ start:ev.span.start, end:ev.span.end },
      acceptingBooks:true, pass:{ firstPending:true, tracking:false, nextCol:null } }, queue:[] }, effects:[] };
  }

  if(ev.type==="cancel"){
    if(ev.sessionId && (!S.active || S.active.sessionId!==ev.sessionId)) return none;
    return { state:completionInit(), effects:[] };
  }

  // Retiming anchors the next unbooked tick at its old scheduled time and leaves booked timestamps
  // alone, so it cannot make or break a pass. Explicit, and pinned by a test, so nobody "fixes" it.
  if(ev.type==="retime") return none;

  const A=S.active;
  if(!A || ev.sessionId!==A.sessionId) return ev.type==="clock" ? drainCompletionQueue(S, ev.now) : none;

  if(ev.type==="book"){
    if(!A.acceptingBooks || !Number.isInteger(ev.col)) return none;
    const p=A.pass; let pass;
    if(p.firstPending){
      // A pass counts only if it BEGINS at the span's first column: a cursor start or a bar range
      // beginning anywhere else is a partial listen, however far it then runs.
      pass = ev.col===A.span.start ? { firstPending:false, tracking:true, nextCol:ev.col+1 }
                                   : { firstPending:false, tracking:false, nextCol:null };
    } else if(p.tracking){
      pass = (ev.col===p.nextCol && ev.col<A.span.end) ? { firstPending:false, tracking:true, nextCol:ev.col+1 }
                                                       : { firstPending:false, tracking:false, nextCol:null };
    } else return none;                  // already broken; nothing to do until the next boundary
    return { state:{ active:Object.assign({},A,{pass}), queue:S.queue }, effects:[] };
  }

  if(ev.type==="boundary"){
    if(!Number.isFinite(ev.at)) return none;
    const fullPass = !!(A.pass.tracking && A.pass.nextCol===A.span.end);
    const entry={ at:ev.at, sessionId:A.sessionId, versionId:A.versionId, editRev:A.editRev, fullPass };
    // A loop rearms for another candidate pass; a non-looping boundary is the last one this session sees.
    const pass = ev.loops ? { firstPending:true, tracking:false, nextCol:null } : A.pass;
    return { state:{ active:Object.assign({},A,{ acceptingBooks:!!ev.loops, pass }),
                     queue:S.queue.concat([entry]) }, effects:[] };
  }

  if(ev.type==="clock") return drainCompletionQueue(S, ev.now);
  return none;
}

// ---- the impure shell around it: one state cell, one dispatch, one cancel ----
let completionState=completionInit(), completionSeq=0;
// C2's sink: a receipt becomes evidence only if a persisted transaction accepts it. An audition
// records both facts in ONE transaction, so a half-credited audition cannot exist.
// The description of what was heard rides in the SAME transaction as the credit, so a child can never
// read a sentence about a pass the game did not record — nor lose the sentence for one it did. Returns
// [] when there is nothing to say; a missing description must never cost the player their credit.
function questObservationOps(run, fx, at){
  const def=run && QUEST_DEFINITIONS[run.questId];
  if(!def || def.v!==run.definitionVersion) return [];
  const p=def.phases[run.phase];
  if(!p || !p.challenge || p.versionId!==fx.versionId) return [];
  const versions={};
  for(const id of Object.keys(run.versions)) versions[id]=songEvidence(run.versions[id].song);
  // The run has not been credited yet, and it does not need to be: only the MUSICAL half of the
  // evaluation is read here, and no part of that depends on the playback gate.
  const e=evaluateQuest(def, { versions }, run);
  if(!e.ok) return [];
  return [{ type:"recordObservation", phaseId:p.id, versionId:fx.versionId, editRev:fx.editRev,
    sessionId:fx.sessionId, matchedRouteIds:e.musical.matchedRouteIds,
    descriptorTokens:e.musical.descriptorTokens.map(t=>t.slots?{ id:t.descriptorId, slots:t.slots }:{ id:t.descriptorId }),
    at }];
}
let onCompletePass=fx=>{
  const at=Date.now();
  const ops=[{ type:"completePass", versionId:fx.versionId, editRev:fx.editRev, sessionId:fx.sessionId, at }];
  if(fx.purpose==="audition") ops.push({ type:"audition", versionId:fx.versionId, editRev:fx.editRev, sessionId:fx.sessionId, at });
  const run=QUEST_RUNS[fx.runId];
  for(const op of questObservationOps(run, fx, at)) ops.push(op);
  transactQuestRun(fx.runId, ops);
  questAfterReceipt(fx.runId);
};
// Both versions heard at their current revisions IS the comparison — there is no third button to
// press for it, because pressing one would only ask a child to confirm what they just did.
function questAfterReceipt(runId){
  const run=QUEST_RUNS[runId], def=run && QUEST_DEFINITIONS[run.questId];
  if(run && def && def.v===run.definitionVersion){
    const p=def.phases[run.phase];
    // Re-recorded on every receipt, not only the first. A comparison stores the REVISIONS it compared,
    // so a final edit after choosing left it stale — and both comparison gates shut with no way to
    // reopen them, because nothing refreshed it. Offering became permanently impossible for a child who
    // added one more seed to the path they had just chosen. Replaying it now restores the comparison.
    if(p && p.type==="compare-offer")
      transactQuestRun(runId, [{ type:"compare", leftVersionId:p.versionIds[0],
        rightVersionId:p.versionIds[1], at:Date.now() }]);   // refused until both are heard; that is the reducer's call
  }
  if(isQuestScope() && activeScope.runId===runId) renderQuestShell();
}
function completionDispatch(ev){
  const r=reduceCompletionSession(completionState, ev);
  completionState=r.state;
  for(const fx of r.effects) if(fx.type==="completePass" && onCompletePass) onCompletePass(fx);
}
function cancelCompletionSession(reason){ completionDispatch({ type:"cancel", reason:reason||"unspecified" }); }
// Returns the new session id, or null when evidence must fail closed — which is every package and
// Studio play, since only a quest has a run to credit.
function beginCompletionSession(opts){
  cancelCompletionSession("replace");
  if(!isQuestScope()) return null;
  const run=QUEST_RUNS[activeScope.runId];
  if(!run || run.status!=="active") return null;
  const versionId=(opts&&opts.versionId)||run.draft;
  const v=run.versions&&run.versions[versionId];
  if(!v || !v.span || v.span.start!==0 || v.span.end!==COLS) return null;   // the live span must be the stored one
  // C2 adds the full live-document/stored-song comparison once the run store is real; the span check
  // is what C1 can honestly assert with a stub registry.
  const sessionId="cs"+(++completionSeq)+"."+Date.now();
  const def=QUEST_DEFINITIONS[run.questId], phase=def && def.phases[run.phase];
  const purpose=(opts&&opts.purpose)
    || ((phase && phase.type==="compare-offer") ? "audition" : "play");
  completionDispatch({ type:"start", sessionId, runId:activeScope.runId, versionId,
    editRev:v.editRev, purpose, span:{ start:0, end:COLS } });
  return sessionId;
}
const activeCompletionSessionId = () => completionState.active && completionState.active.sessionId;


