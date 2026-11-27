// ---------- The quest shell ----------
// The MODEL is pure and takes the live-only facts as an argument, so what a child is told can be
// tested without a browser; the renderer below is deliberately dumb. Q5 rule 7: one intention, not a
// checklist — there are no per-observation tick boxes here and nothing that could carry a score.
// The two sentences that are always on screen while a quest is open. The way out is NAMED rather than
// gestured at, because the world-map button lives behind the ☰ menu and is not visible until you open
// it — and the saved half has to be able to be false, or it is a sentence that says nothing.
// It named the ☰ menu because the map button is hidden behind it, and after a playtest that sentence
// was the longest thing on a line a child reads every render. What has to be visible is that stopping
// is free and that the work is safe; the route is discoverable and, once found, known.
const QUEST_EXIT_TEXT="You can leave any time — your quest is saved.";
// Every quest's last phase shows it, so it names neither a quest's version ("path", "walk") nor its
// button — each phase-3 intention already says what comes next. What it adds is the one fact a child
// cannot see: the version being held is still theirs to change.
const QUEST_EDITABLE_TEXT="The one lit below is the one you are holding — you can still change it.";
// It still names the route. Q11/A5 asks for the exit to be visible at ALL times, and swapping the
// whole line for a warning took the one instruction a child needs in order to leave at all.
const QUEST_UNSAVED_TEXT="Your last change could not be saved, so it would be lost if you left now. Make one more edit and the garden will try again.";
const QUEST_RANGE_TEXT="You listened to the selected bars. To count a full play-through, clear the bar selection and play from the beginning.";
const QUEST_CURSOR_TEXT="This play started at the cursor. Play the whole song from the beginning when you are ready to continue.";
const questSentence=parts=>{ const t=parts.join(" with ")+"."; return t.charAt(0).toUpperCase()+t.slice(1); };
let questLastRendered=null;   // the model the shell last painted — the only handle a Node test has on it

// What the STORE says about this run's song, never an inference from having tried to write it. Pure:
// the saves list is an argument, so the same question can be asked in a test without a browser.
function questSavedState(saves, run){
  const id=run && run.artifact && run.artifact.artifactId;
  if(!id) return { present:false, title:null };
  const s=(saves||[]).find(x=>x && x.meta && x.meta.localId===id);
  return s ? { present:true, title:(s.meta.title||"") } : { present:false, title:null };
}

// The finale. A pure model; the party it sets off is the caller's business, and the caller fires it
// once per finalisation rather than once per render.
//
// Present exactly when the run has completed AND has an artifact record. Note what it does NOT do:
// it never reads the live document, and it takes the saved state as an argument — so "Saved to your
// songs" can say the opposite when the player has since deleted the song from their melodies.
function questFinaleModel(run, def, view){
  if(!run || !def || run.status!=="completed" || !run.artifact) return null;
  const v=view||{}, saved=v.saved || { present:false, title:null };
  // The song's name wins. The run's copy is a record of what was asked for, and after a half-finished
  // rename the two disagree — the player must be shown the name their song actually has.
  const title = saved.present ? saved.title : (run.artifact.title||"");
  return {
    questId:def.id, title:def.title,
    completionText:def.completion.completionText,
    songTitle:title, artifactId:run.artifact.artifactId, versionId:run.artifact.versionId,
    saved:saved.present,
    savedText: saved.present
      ? "Saved to your songs as \u201C"+title+"\u201D."
      : "This song is not in your melodies any more — it was removed from this device.",
    // They dance; they do not narrate the ending. The completion sentence is the garden's own line,
    // and putting it in a friend's mouth would make them the ones approving of the song.
    voices:questCastVoices(def, [], v.stages),
    nameField:{ value:title, maxLength:80, enabled:saved.present },
    // The two records disagree: the song was renamed and the run's copy never caught up. Naming it
    // again with the same text is what repairs it, so the button stays useful rather than a no-op.
    stale: !!(saved.present && run.artifact.title!==saved.title),
    actions:[{ id:"name-song", label:"Save this name", enabled:saved.present },
             { id:"open-studio", label:"Studio", enabled:true },
             { id:"back-to-map", label:"Map", enabled:true }],
  };
}

function questShellModel(run, def, view){
  if(!run || !def) return null;
  const p=def.phases[run.phase];
  if(!p) return null;
  const v=view||{};
  const versionId = p.type==="compare-offer" ? (run.selection || run.draft) : p.versionId;
  const ev=questEvaluateRun(run, def);
  const proc=ev.ok ? ev.procedural : null;
  const label=id=>{ const c=p.reflection && p.reflection.choices.find(x=>x.id===id); return c?c.label:id; };
  const auditioned=id=>{ const x=run.versions[id]; return !!x && x.auditionedRev===x.editRev; };
  const compared=!!(proc && proc.comparedCurrentRevisions);

  const actions=[];
  const unsaved=!!v.unsaved;
  const finished = run.status==="completed";
  const stuck = run.status==="offering";
  if(finished){
    // Nothing to press but the way out. Leaving the offer button lit after the song is saved invites a
    // child to press it again and watch nothing happen.
  } else if(stuck){
    // The write did not land — usually a full disk. Nothing was saved, so say so and offer the retry,
    // which is the same recovery the next load would run by itself.
    actions.push({ id:"retry-offer", label:"Try saving it again", enabled:true });
  } else if(p.type==="compare-offer"){
    // No title field here any more. The song is saved under the definition's default name and the
    // player names it in the finale, holding the thing they are naming.
    // An outstanding edit closes this too. Q6 keeps the final offer free of MUSICAL judgement, and it
    // still is — this is not a verdict on the song but the plain fact that the version on disk is not
    // the one on the field, so offering would save music the child is not looking at.
    actions.push({ id:"offer", label:def.completion.label,
                   enabled:!!(proc && proc.canOffer) && !unsaved });
  } else {
    // An unsaved edit closes the door as well as the button. Advancing would fork the stored version
    // and repaint the field from it, which is the moment the child's unsaved note disappears — so the
    // button goes dark and the controller refuses, both reading the same fact.
    const can=!!(proc && proc.canAdvance) && !unsaved;
    actions.push({ id:"continue", label:p.procedure.buttonLabel || "Continue", enabled:can });
  }
  // No Leave button. It sat beside the phase's own button and read as a decision with consequences —
  // "it is not clear what choosing 'Keep this path' vs 'Leave for now' would do" — when leaving has
  // never cost anything. QUESTS.md Q11/A5: the shell must make the exit and the saved state visible,
  // not carry a particular control.

  // The range explanation is never a nag: it appears only when a partial selection is actually set,
  // it says WHICH thing is in the way, and it comes with the one tap that fixes it. A loop over part
  // of a song can never become a full pass — it wraps back to the selection — so "wait for another
  // lap" would be a lie, and the wording must not imply it.
  let notice=null;
  const purpose = p.type==="compare-offer" ? "audition" : "play";
  if(finished || stuck) notice=null;              // a bar selection is not what is in the way here
  else if(v.partialRange) notice={ kind:"range", text:QUEST_RANGE_TEXT,
    action:{ id:"play-whole", label:"Play the whole song", enabled:true, versionId, purpose } };
  else if(v.partialCursor) notice={ kind:"cursor", text:QUEST_CURSOR_TEXT,
    action:{ id:"play-whole", label:"Play the whole song", enabled:true, versionId, purpose } };

  const obs=questObservationFor(run, p.id);
  // The paths, as a row under the field rather than four buttons in the card. Tapping one hears it AND
  // holds it, so "heard" and "chosen" are one fact about one thing instead of two rows of buttons.
  // …and they go once the song is put away. Leaving them up after the quest is finished invites a
  // child to tap a path and watch nothing happen, which is why the offer button goes too.
  const paths = (p.type==="compare-offer" && !finished && !stuck)
    ? p.versionIds.map(id=>({ versionId:id, label:label(id),
        selected:run.selection===id, heard:auditioned(id),
        // A switch would discard the edit that failed to save, so it is refused — and a control that
        // refuses under the finger is the defect this whole step began with. It goes dark instead.
        enabled: !unsaved || run.draft===id })) : [];
  return {
    paths,
    // Validated by the catalog since D1 and rendered nowhere until now. The toggles are what answer it.
    reflectionPrompt: p.reflection ? p.reflection.promptText : "",
    questId:def.id, title:def.title, phaseId:p.id,
    // The phases by name, with where you are. "Phase 2 of 3" is a number a child has to translate;
    // the names are already authored and already validated, so the step you are on can simply be said.
    steps:def.phases.map((x,i)=>({ name:x.name,
      state: i<run.phase ? "done" : i===run.phase ? "current" : "todo" })),
    exitText: unsaved ? QUEST_UNSAVED_TEXT : QUEST_EXIT_TEXT,
    // The status bar's line, which in a quest was still the package's "plant seeds, press play" —
    // advice that is wrong here (there is no Hint and no Fuse) and that says nothing about the task.
    // The phase's own intention, then the fact that stopping costs nothing.
    statusText: p.intentionText + "  " + (unsaved ? QUEST_UNSAVED_TEXT : QUEST_EXIT_TEXT),
    unsaved,
    worldText:p.worldText, intentionText:p.intentionText,
    ways:p.challenge ? questWays(def, p.id).map(w=>questSentence(w.phrases)) : [],
    missing:(ev.ok && ev.readiness ? ev.readiness.missing : [])
      .map(x=>{ const d=QUEST_DESCRIPTORS[x.descriptorId]; return d && d.kind==="missing" ? d.text : null; })
      .filter(Boolean),
    // What each friend heard, and what nobody claimed. The friends carry the sentences their own
    // capability produced; everything else stays in the garden's voice, exactly where it was before.
    voices: obs ? questCastVoices(def, obs.descriptorTokens, v.stages) : questCastVoices(def, [], v.stages),
    heard:obs ? questNarratorTokens(def, obs.descriptorTokens).map(t=>t.text) : [],
    // The last phase has no readiness to report, so the line above the field says the one thing a
    // child cannot see: that the path they are holding is still theirs to work on. Engine words — it
    // is a fact about what the editor allows, not something an author should be able to promise.
    editableText: (p.type==="compare-offer" && !finished && !stuck) ? QUEST_EDITABLE_TEXT : "",
    // The same persistence fact the finale uses, so the two surfaces cannot disagree about whether
    // the song is really there.
    saved: finished ? (def.completion.completionText
             + ((v.saved && v.saved.present) ? "" : " (The song is not in your melodies any more.)"))
         : stuck    ? "The garden could not put your song away just now — nothing is lost, try again." : "",
    versionId, notice, actions,
  };
}

// The paths, in the row the "choose the matching path" levels already use — the same idiom a child has
// met before, doing the same thing: tap one to hear it, and the one lit is the one you are holding.
// Built here rather than through the lesson picker's showChoices(), which writes through tx() and
// belongs to a lesson's own answer bookkeeping.
// The growth stage of every friend a definition casts, read once and handed to the pure model — the
// same shape questEligibility takes progress in, so nothing inside the model reads live progress.
function questRegionStages(def){
  const out=Object.create(null);
  for(const c of ((def && def.cast) || [])) out[c.regionId]=regionStage(c.regionId);
  return out;
}
function questRenderPaths(m){
  const row=document.getElementById("choiceRow"); if(!row) return;
  if(!m || !m.paths || !m.paths.length){ row.style.display="none"; row.innerHTML=""; return; }
  row.style.display="flex"; row.innerHTML="";
  for(const path of m.paths){
    const b=document.createElement("button");
    b.className="secondary toggle"+(path.selected?" on":"");
    b.textContent="🎵 "+path.label+(path.heard?" ✓":"");
    b.disabled=path.enabled===false;
    b.onclick=()=>{ const r=performQuestAction("pick", { versionId:path.versionId });
      if(!r.ok) setStatus(questRefusalText(r.code)); };
    row.appendChild(b);
  }
}

// ---- the finale ----
// Fired ONCE per finalisation, and only in the foreground. `start()` plays the live grid — the
// versionId it takes only reaches the completion session's bookkeeping — so a celebration is only
// honest where the offered song is already the document on the field, which is true here and nowhere
// else. In particular recoverQuestOfferings() runs at boot in the last package's scope, before the
// field is rebuilt, so it finalises SILENTLY: the song is saved and the quest reads as completed. A
// celebration is a response to an act, not a recording of one.
let questFinaleShown=null;       // once per page session; nothing can re-enter a completed run
let questFinaleRendered=null;    // the model the overlay last painted — a Node test's only handle
// The run the finale was shown for: a sign-in's pull can replace the quest scope under the card (TUN-135 review),
// and its Studio button must still hand over that run's song, not an empty Studio.
let questFinaleRun=null;
function questShowFinale(runId){
  const run=QUEST_RUNS[runId], def=run && QUEST_DEFINITIONS[run.questId];
  if(!run || !def || run.status!=="completed" || !run.artifact) return false;
  const key=runId+"|"+run.artifact.artifactId+"|"+run.artifact.savedAt;
  if(questFinaleShown===key) return false;
  questFinaleShown=key;          // claimed BEFORE start(), which calls renderQuestShell synchronously
  questFinaleRun=runId;
  renderQuestFinale();
  confetti();
  if(playing) stop();
  // The whole song, once, from the top: a pinned cursor or a bar selection would otherwise start the
  // party two thirds of the way in, and Firefly grants the loop, which would never let it end.
  looping=false; loopBtn.classList.toggle("on",false);
  clearLoopRange(); cursorPinned=false; setCursor(0);
  start({ versionId:run.artifact.versionId, purpose:"finale" });
  return true;
}
function renderQuestFinale(){
  const el=document.getElementById("questfinale"); if(!el) return;
  const run=isQuestScope() ? QUEST_RUNS[activeScope.runId] : null;
  const def=run && QUEST_DEFINITIONS[run.questId];
  const m=questFinaleModel(run, def, { saved:questSavedState(getSaves(), run), stages:questRegionStages(def) });
  questFinaleRendered=m;
  if(!m){ el.style.display="none"; return; }
  el.style.display="flex";
  document.getElementById("finText").textContent=m.completionText;
  document.getElementById("finSaved").textContent=m.savedText;
  const fr=document.getElementById("finFriends"); fr.textContent="";
  m.voices.forEach((v,i)=>{ const sp=document.createElement("span");
    sp.textContent=v.emoji; sp.title=v.name; sp.className="dance";
    sp.style.animationDelay=(i*0.14)+"s"; fr.appendChild(sp); });
  const inp=document.getElementById("finName");
  if(document.activeElement!==inp) inp.value=m.nameField.value;   // never yank a name out from under a typist
  inp.disabled=!m.nameField.enabled;
  document.getElementById("finNameBtn").disabled=!m.nameField.enabled;
}
// Both ways out commit the name first. There is no rename anywhere else in the game, so a name left
// in the box when the overlay closes would be a name the player could never give again. A refusal
// does not trap anyone in here: the song keeps the name it has and the status line says so.
function questFinaleLeave(then){
  const inp=document.getElementById("finName");
  const typed=(inp && inp.value || "").trim();
  if(typed){ const r=performQuestAction("name-song", { title:typed });
    if(!r.ok && r.code!=="no-artifact")
      setStatus("That name could not be saved — your song is safe under the name it has."); }
  document.getElementById("questfinale").style.display="none";
  then();
}
document.getElementById("finNameBtn").onclick=()=>{
  const inp=document.getElementById("finName");
  const r=performQuestAction("name-song", { title:inp?inp.value:"" });
  if(r.ok) setStatus(r.partial ? "Your song is named — the quest's own record will catch up."
                               : "Named ✨");
  else questExplainRefusal(r.code);
};
document.getElementById("finStudio").onclick=()=>{
  if(studioWaitsForSignIn()) return;   // the finale stays, its typed name with it (TUN-135)
  const run=QUEST_RUNS[isQuestScope() ? activeScope.runId : questFinaleRun] || null;
  const v=run && run.artifact && run.versions[run.artifact.versionId];
  const song=v ? jclone(v.song) : null;
  questFinaleLeave(()=>{ if(song) openStudioWith(song); else openStudio(); });
};
document.getElementById("finMap").onclick=()=>questFinaleLeave(()=>leaveQuest());

// The friends, with whatever they heard. A friend with nothing to say is still here — they are in the
// garden with you, not a status light that comes on when you have done enough.
function questRenderVoices(voices){
  const card=document.getElementById("questFriendsCard"); if(!card) return;
  const row=document.getElementById("questFriendsRows");
  row.textContent="";
  card.style.display=(voices && voices.length)?"":"none";
  if(!voices || !voices.length) return;
  document.getElementById("questFriendsTitle").textContent=voices.map(v=>v.name).join(" & ");
  for(const v of voices){
    const wrap=document.createElement("div"); wrap.className="qvoice";
    const em=document.createElement("span"); em.className="qvem"; em.textContent=v.emoji; em.title=v.name;
    const info=document.createElement("div"); info.className="compinfo";
    const name=document.createElement("div"); name.className="qvname"; name.textContent=v.name;
    const said=document.createElement("div"); said.className="qvsaid";
    said.textContent=v.lines.length ? v.lines.join(" ") : "";
    info.appendChild(name); info.appendChild(said);
    wrap.appendChild(em); wrap.appendChild(info); row.appendChild(wrap); }
}

// The field, from scratch, with the run's draft back on it. resetTransient() is what a level uses to
// start clean, and a quest phase needs the same — but it also empties the grid, so the draft has to go
// straight back, and neither half may reach the run.
function questPaintField(runId){
  const run=QUEST_RUNS[runId], def=run && QUEST_DEFINITIONS[run.questId];
  if(!run || !def || !run.versions[run.draft]) return;
  const was=questPainting; questPainting=true;
  try{ resetTransient(); applySong(run.versions[run.draft].song); }
  finally{ questPainting=was; }
  // The stage's guides and the dealt rings, through the one path every rebuild uses. A step's beatGuide
  // reached nothing here before: the quest branch of renderStage returns before the lesson path sets it.
  applyStageDecor();
  journalClear();          // the repaint is not a step anyone can take back
  renderQuestShell();
}

// The stones the run was dealt, ringed on the field so they read as given rather than as something the
// player put there. A rebuild drops the class with the cells, so this runs after every repaint.
function questMarkLandmarks(run, def){
  for(let r=0;r<cells.length;r++) for(let c=0;c<(cells[r]||[]).length;c++)
    if(cells[r][c]) cells[r][c].classList.remove("landmark");
  for(let d=0;d<dcells.length;d++) for(let c=0;c<(dcells[d]||[]).length;c++)
    if(dcells[d][c]) dcells[d][c].classList.remove("landmark");
  if(!def || def.setup===undefined || !run || !run.setup || !Array.isArray(run.setup.waypoints)) return;
  for(const p of run.setup.waypoints)
    if(cells[p.row] && cells[p.row][p.col]) cells[p.row][p.col].classList.add("landmark");
  // …and the opening beat, on the drum pads, in the same idiom: given, not yours.
  if(run.setup.fragment) for(const h of run.setup.fragment.hits)
    if(dcells[h.lane] && dcells[h.lane][h.c]) dcells[h.lane][h.c].classList.add("landmark");
}

// The renderer. textContent everywhere — the authored-text guard in the catalog is the belt, and this
// is the brace: no quest string ever reaches innerHTML, whatever the guard let through.
function renderQuestShell(){
  if(!isQuestScope()) return;
  const run=QUEST_RUNS[activeScope.runId], def=run && QUEST_DEFINITIONS[run.questId];
  const partialRange = rangeOn() && (loopA()!==0 || loopB()!==COLS);
  const m=questShellModel(run, def, { partialRange,
    partialCursor: !partialRange && cursorPinned && cursorCol!==0,
    unsaved: !!run && questHasUnsavedEdit(activeScope.runId, run.draft),
    // The card reads the store for the same reason the finale does. Without this the model saw no
    // evidence of the song — which it correctly reports as "not there" — so a successful offer
    // announced that the song had been deleted, in the same breath as saving it.
    saved: questSavedState(getSaves(), run),
    stages: questRegionStages(def) });
  const card=document.getElementById("questCard");
  if(!card) return;
  if(!m){ card.style.display="none"; questRenderPaths(null); questRenderVoices(null);
    const prog=document.getElementById("questProgress"); if(prog) prog.style.display="none"; return; }
  { const lc=document.getElementById("levelCard"); if(lc) lc.style.display="none"; }
  card.style.display="";
  document.getElementById("questTitle").textContent=m.title;
  const stepRow=document.getElementById("questPhase");
  stepRow.textContent="";
  m.steps.forEach((st,i)=>{
    if(i) stepRow.appendChild(document.createTextNode(" › "));
    const el=document.createElement("span");
    el.className="qstep "+st.state; el.textContent=st.name; stepRow.appendChild(el); });
  document.getElementById("questWorld").textContent=m.worldText;
  document.getElementById("questIntention").textContent=m.intentionText;

  const ways=document.getElementById("questWays"), list=document.getElementById("questWaysList");
  ways.style.display=m.ways.length?"":"none";
  // Closed by default again. Opening it made the card taller than the field, which is the opposite of
  // the simplification this round is for — the routes are an optional aid, not the instruction.
  list.textContent="";
  for(const w of m.ways){ const li=document.createElement("li"); li.textContent=w; list.appendChild(li); }

  document.getElementById("questReflect").textContent=m.reflectionPrompt;
  questRenderPaths(m);
  questRenderVoices(m.voices);
  document.getElementById("questHeard").textContent=m.heard.join(" ");
  { const prog=document.getElementById("questProgress");
    const line=m.missing.join(" ") || m.editableText;
    prog.textContent=line; prog.style.display=line?"":"none"; }
  setStatusText(m.statusText);
  document.getElementById("questSaved").textContent=m.saved;
  const notice=document.getElementById("questNotice");
  notice.textContent=m.notice?m.notice.text:"";

  questLastRendered=m;
  const row=document.getElementById("questActions");
  row.textContent="";
  const button=(a,cls)=>{ const b=document.createElement("button");
    b.textContent=a.label + (a.done?" ✓":"");
    if(cls) b.className=cls;
    b.disabled=!a.enabled;
    // The shell throws the party, because the shell is where imperative things belong. The controller
    // only reports that the quest ended.
    b.onclick=()=>{ const r=performQuestAction(a.id, a);
      if(!r.ok) questExplainRefusal(r.code);
      else if(r.finale) questShowFinale(activeScope.runId); };
    row.appendChild(b); return b; };
  if(m.notice) button(m.notice.action, "secondary");
  // The unlabelled name box that used to sit in this row is gone with the rest of the clutter: the
  // song is named in the finale, where the question has a label and the song exists to be named.
  for(const a of m.actions) button(a, a.id==="audition" ? "secondary" : "");
}
// A refusal explains itself in the words the design chose, and a shut gate under a partial selection
// says WHY it is shut rather than "play it through" — which is exactly the advice that does not work.
// Split so the CHOICE of words can be tested without a screen: this one decides, and the caller shows.
// A control that changes the SONG rather than a preference. Deliberately quest-only: routing every
// package tempo change through noteEdit would start scheduling autosaves that today it does not, and
// that is a different change from this one.
const questCommitSetting = label => { if(isQuestScope()) noteEdit(label); };
function questRefusalText(code){
  if(code!=="gate-closed") return "Not yet — "+code;
  if(rangeOn() && (loopA()!==0 || loopB()!==COLS)) return QUEST_RANGE_TEXT;
  if(cursorPinned && cursorCol!==0) return QUEST_CURSOR_TEXT;
  return "Play your song all the way through first — the garden has to hear it.";
}
function questExplainRefusal(code){ setStatus(questRefusalText(code)); }

// Leaving is not abandoning, and it loses nothing: every musical edit was already persisted by the
// transaction that made it, so there is no quest autosave to flush on the way out.
function leaveQuest(){
  if(playing) stop(); else cancelCompletionSession("navigation");
  { const fin=document.getElementById("questfinale"); if(fin) fin.style.display="none"; }
  if(typeof openHome==="function") openHome();
}

// The way in, until Home has a card for it (D6). A fresh run starts from the definition's starter song
// when it has one, and otherwise from an empty field the size its workspace asked for.
function startQuestRun(questId){
  const def=QUEST_DEFINITIONS[questId];
  if(!def) return { ok:false, code:"no-quest" };
  const runId="qr."+Date.now().toString(36)+"."+Math.floor(Math.random()*1679616).toString(36);
  let setup=null, song;
  if(def.setup!==undefined){
    const kind=QUEST_SETUP_KINDS[def.setup.kind];
    if(!kind) return { ok:false, code:"no-such-setup-kind" };
    // Geometry, completability, reachability — in that order, and the last of the three is a SEARCH.
    // A search that fails to find a way has not shown there is none, so a hand it cannot vouch for is
    // quietly re-dealt rather than refused in a child's face: pressing Begin and getting nothing is the
    // worst outcome available here. A generator that cannot produce a provable hand in a dozen tries is
    // a bug in the rule, and then it does refuse, carrying the last reason with it.
    let bad=null;
    for(let attempt=0; attempt<12 && !setup; attempt++){
      const seed=attempt ? runId+":"+attempt : runId;
      const hand=Object.assign({ seed }, kind.generate(def.setup, def, questRng(seed)));
      bad=kind.validateInstance(hand, def.setup, def) || questSetupCompletable(def, hand)
        || questSetupRoutesReachable(def, hand);
      if(!bad) setup=hand; }
    if(!setup) return { ok:false, code:"setup-unusable", extra:bad };
    song=kind.startingSong(def, setup);
  } else song=def.starterSong ? jclone(def.starterSong) : emptyQuestSong(def);
  const run=newQuestRun({ runId, questId, definitionVersion:def.v, song, setup,
    span:{ start:0, end:song.time.cols }, at:Date.now() });
  const cand=Object.assign({}, QUEST_RUNS); cand[runId]=run;
  const saved=saveQuestRuns(cand, QUEST_HISTORY);
  if(!saved) return { ok:false, code:"store-failed" };    // a full disk must not produce a run nothing saved
  QUEST_RUNS=saved;
  return enterQuestRun(runId);
}

// Any run left mid-offering by a crash or a failed write finishes on the next load. Idempotent: the
// artifact upsert replaces by id, and saveAs on an already-completed run is simply refused.
function recoverQuestOfferings(){
  const out=[];
  for(const id of Object.keys(QUEST_RUNS)) if(QUEST_RUNS[id].status==="offering") out.push([id, finalizeQuestOffering(id)]);
  return out;
}

// The one door for every persistent run change: reduce a candidate, persist it, and only then publish
// it and deliver effects. A failed reduction or a failed write leaves the visible run untouched.
function transactQuestRun(runId, ops){
  const cur=QUEST_RUNS[runId];
  if(!cur) return { ok:false, code:"no-run" };
  const r=reduceQuestTransaction(cur, ops);
  if(!r.ok) return r;
  const cand=Object.assign({}, QUEST_RUNS); cand[runId]=r.run;
  // A run that just completed writes its history record in the same Store.set, so the record can
  // never be lost to a crash between the two — and can never be pruned with the run either.
  let hist=QUEST_HISTORY;
  if(r.run.status==="completed" && cur.status!=="completed"){
    hist=Object.assign({}, QUEST_HISTORY); hist[r.run.questId]=questHistoryEntry(r.run); }
  const saved=saveQuestRuns(cand, hist);
  if(!saved) return { ok:false, code:"store-failed" };
  QUEST_RUNS=saved; QUEST_HISTORY=hist;
  return { ok:true, run:QUEST_RUNS[runId], effects:r.effects };
}


