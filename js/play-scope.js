// ---------- The play scope: one authoritative runtime identity ----------
// `currentPkg` used to be identity, progress key, toolbox key and control gate at once, and `LEVELS`
// was a second mutable global that could disagree with it. A quest can be neither: as a package id it
// would write a quest tray into progress.packages and cloud-sync a quest slug; as "studio" nothing
// would persist at all, killing resume. One frozen descriptor instead, assigned in exactly one place,
// carrying identity AND stages together so they cannot drift.
let activeScope=null;   // initialised below, once levelIdx/lessonStepIdx exist

function setPlayScope(next, position){
  cancelCompletionSession("navigation");   // evidence never crosses a scope change

  const p=position||{};
  if(!next || typeof next!=="object") throw new Error("setPlayScope: no scope given");
  if(next.kind==="package"){
    const id=next.packageId;
    if(id==="studio" || !PACKAGES[id]) throw new Error("setPlayScope: not a package: "+id);
    activeScope=Object.freeze({ kind:"package", packageId:id, stages:PACKAGES[id].levels });
  } else if(next.kind==="studio"){
    activeScope=Object.freeze({ kind:"studio", stages:PACKAGES.studio.levels });
  } else if(next.kind==="quest"){
    // The quest loader (step d) builds the envelope: ONE level whose steps are the phases, so the
    // shipped indexed-stage engine is reused rather than duplicated.
    if(!next.questId || !next.runId || !Array.isArray(next.stages) || !next.stages.length)
      throw new Error("setPlayScope: incomplete quest identity");
    activeScope=Object.freeze({ kind:"quest", questId:next.questId, runId:next.runId,
      stages:next.stages, palette:next.palette||"pentatonic", features:next.features||[] });
  } else throw new Error("setPlayScope: unknown scope kind: "+next.kind);
  levelIdx = Math.max(0, Math.min(p.levelIdx||0, activeScope.stages.length-1));
  lessonStepIdx = isQuestScope() ? 0 : (p.stepIdx||0);   // quests read their phase from the run
  return activeScope;
}

const activeStages    = () => activeScope && activeScope.stages;
const currentLevel    = () => activeStages()[levelIdx];
const isPackageScope  = () => !!activeScope && activeScope.kind==="package";
const isStudioScope   = () => !!activeScope && activeScope.kind==="studio";
const isQuestScope    = () => !!activeScope && activeScope.kind==="quest";
const activePackageId = () => isPackageScope() ? activeScope.packageId : null;
function requirePackageId(){ const id=activePackageId();
  if(!id) throw new Error("package scope required, got: "+(activeScope&&activeScope.kind));
  return id; }
// Dev UI and the map still think in catalog terms; nothing else may.
const scopeCatalogId  = () => isPackageScope() ? activeScope.packageId : (isStudioScope() ? "studio" : null);
const scopeKey        = () => isPackageScope() ? "pkg:"+activeScope.packageId
                            : isStudioScope()  ? "studio" : "quest:"+activeScope.runId;
const scopeToolboxOwner = () => scopeKey();
// The autosave context keeps its shipped values ("intro", "studio") so existing rescues still match.
const scopeAutosaveContext = () => isQuestScope() ? "quest:"+activeScope.runId : scopeCatalogId();
// A quest is tinted by the land it belongs to, named in its presentation. The fallback keeps the page
// painted rather than throwing on the render path if the definition has gone.
const questScopeRegion = () => { const d=QUEST_DEFINITIONS[activeScope.questId];
  return (d && d.presentation.regionId) || "first-garden"; };
const scopeVisualRegion    = () => isQuestScope() ? questScopeRegion() : regionOf(scopeCatalogId());
const scopeCompanionRegion = () => isQuestScope() ? null : regionOf(scopeCatalogId());
function scopePalette(){
  if(isStudioScope()) return widestPalette();          // computed, not written into PACKAGES.studio
  if(isQuestScope())  return activeScope.palette;
  const L=currentLevel();
  return PACKAGES[activeScope.packageId].palette || (L&&L.palette) || "pentatonic"; }
// Controls a scope may show. Packages accumulate them level by level; the Studio has everything;
// a quest gets only what its workspace granted — never inherited from a prerequisite package.
function scopeFeatures(){
  if(isQuestScope()) return new Set(activeScope.features);
  // A package has always had the cursor room controls, and its progression never unlocked them — so
  // they are granted here rather than written into 247 levels. A quest gets them only by declaring them.
  const s=unlockedSet(levelIdx); s.add("room"); if(isStudioScope()) s.add("grow"); return s; }

// Quest phase position belongs to the QuestRun, never to a second mutable index — the same drift this
// scope exists to prevent. Step (c) owns this store; B2 needs only enough of it to be testable, and
// ships no quest entry point.
let QUEST_RUNS=Object.create(null);
// Returns -1 rather than throwing when a run is missing or unusable: curStage() sits on the paint
// path, so a throw here would be a crash rather than a wrong answer. Exactly one caller — the quest
// entry/resume path — treats -1 as "decline to enter quest scope"; rendering falls back to phase 0.
const QUEST_PHASE_INVALID=-1;
function questPhaseIndex(runId){
  const r=QUEST_RUNS[runId];
  if(!r || (r.status!=="active" && r.status!=="offering")) return QUEST_PHASE_INVALID;
  return (Number.isInteger(r.phase) && r.phase>=0) ? r.phase : QUEST_PHASE_INVALID; }
function currentStepIndex(){
  if(!isQuestScope()) return lessonStepIdx;
  const p=questPhaseIndex(activeScope.runId);
  return p===QUEST_PHASE_INVALID ? 0 : p; }   // render something rather than throw; entry refuses the bad run

// Both restoration paths (cloud apply and local bootstrap) resume the same way. progress.current is
// the last PACKAGE to resume — never the Studio, never a quest; a resumable run is offered separately.
function restoreLastPackage(){
  const c=progress.current;
  const id=(c && c!=="studio" && PACKAGES[c]) ? c : "intro";
  setPlayScope({kind:"package", packageId:id}, {levelIdx:pkgProg(id).level||0}); }
// unlock is DERIVED from the DAG, never stored. `requires` entries: id = AND; nested [id,id] = OR-group (future).
const isPkgCompleted = id => !!(progress.packages[id] && progress.packages[id].completed);
const reqMet = r => Array.isArray(r) ? r.some(isPkgCompleted) : isPkgCompleted(r);
const isPkgUnlocked = id => ((PACKAGES[id]&&PACKAGES[id].requires)||[]).every(reqMet);
function unlockedSet(idx){ const s=new Set(); const st=activeStages()||[];
  for(let i=0;i<=idx && i<st.length;i++) (st[i].unlock||[]).forEach(f=>s.add(f)); return s; }
function featName(f){ return {jam:"🎸 Jam — call the band",fuse:"🔨 Fuse & 🎒 Toolbox — bind voices",
  drums:"🥁 Drums — the heartbeat",more:"➕ More room — grow the garden",
  grow:"🌿 Grow & ✂ Trim — hold a note longer"}[f]||f; }
let levelIdx=0, levelDone=false, lessonStepIdx=0, stepDone=false;   // lessonStepIdx is package/Studio only
setPlayScope({kind:"package", packageId:"intro"});                  // the first scope; bootstrap may replace it
const curStage=()=>{ const L=currentLevel(); return L.steps?L.steps[currentStepIndex()]:L; };   // a level is either single or a list of steps
const levelTitle=document.getElementById("levelTitle"), levelIntro=document.getElementById("levelIntro"),
  levelTeach=document.getElementById("levelTeach"),
  goalList=document.getElementById("goalList"), goalHint=document.getElementById("goalHint"),
  nextBtn=document.getElementById("nextBtn");
// ---- Read-aloud (TTS): narrate the level's STORY for pre-readers. Web Speech API — free, offline, on/off, persisted.
let speakOn=false;
const speakBtn=document.getElementById("speak");
// Normalize text for ANY speech engine: turn arrows into "to" and chord numerals into words FIRST (so "V → I" is
// "the five chord to the one chord", not "vi"), then drop emoji/symbols (▶, ✨…). Reusable if we move to a neural voice.
const SPEAK_CHORD={I:"the one chord",II:"the two chord",III:"the three chord",IV:"the four chord",V:"the five chord",VI:"the six chord",VII:"the seven chord"};
const toSpeech = s => (s||"")
  .replace(/\s*(?:->|→|➜|➡|⟶)\s*/g," to ")
  .replace(/▶️?/g," Play ")
  .replace(/[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}\u{2190}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{200D}]/gu," ")
  .replace(/\b(VII|IV|VI|V|III|II|I)\b/g, m=>SPEAK_CHORD[m])
  .replace(/\b(vii|iv|vi|v|iii|ii)\b/g, m=>SPEAK_CHORD[m.toUpperCase()])
  .replace(/\s+([.,!?;:])/g,"$1").replace(/\s+/g," ").trim();
let _voicePick=null;
function pickVoice(){ if(!("speechSynthesis" in window)) return null;
  const vs=speechSynthesis.getVoices()||[]; if(!vs.length) return _voicePick;
  const pref=[/natural/i,/google.*(us|uk|english)/i,/\b(aria|jenny|libby|sonia|samantha)\b/i];   // prefer higher-quality voices when present
  for(const re of pref){ const v=vs.find(v=>/^en/i.test(v.lang)&&re.test(v.name)); if(v) return (_voicePick=v); }
  return (_voicePick=vs.find(v=>/^en-US/i.test(v.lang))||vs.find(v=>/^en/i.test(v.lang))||vs[0]); }
if("speechSynthesis" in window){ try{ speechSynthesis.onvoiceschanged=()=>{ _voicePick=null; pickVoice(); }; }catch(e){} }
function speakStory(text){ if(!("speechSynthesis" in window)) return;
  try{ speechSynthesis.cancel(); const t=toSpeech(text); if(!t) return;
    const u=new SpeechSynthesisUtterance(t); u.rate=0.95; u.pitch=1.05;
    const v=pickVoice(); if(v) u.voice=v; speechSynthesis.speak(u); }catch(e){} }
// Pre-baked narration: play voice/<key>.mp3 (a warm Amazon Polly clip keyed by the spoken text); fall back to the
// browser voice if the clip isn't baked yet. voiceHash MUST stay in sync with tools/gen-voice.mjs so keys line up.
const voiceHash = s => { let h=5381; for(let i=0;i<s.length;i++) h=((h*33)^s.charCodeAt(i))>>>0; return h.toString(16); };
let curClip=null, narrateReady=false;   // narrateReady: stay silent until the player actually enters a level (no narration on the landing / companion-picker screen)
let narrateSeq=0;   // counts narrate calls: a delayed narration (the instrument card's) skips itself if anything spoke since
// The browser voice stands in only for a MISSING clip, and only while that clip is still the current one (TUN-112).
// Missing is what Edge reports for a 404 or an unreachable file (measured 2026-11-20): the error event with
// MEDIA_ERR_SRC_NOT_SUPPORTED (4), and play() rejecting with NotSupportedError. Nothing else is: a clip that
// stopSpeech or a newer narrate replaced stays silent — pausing a clip whose play() is still pending rejects it with
// AbortError, and reading that as "no clip" put the browser voice over the next clip, two voices half a second apart
// on a cold cache — and so does a clip the browser refuses to play before a gesture (NotAllowedError), or one that
// breaks off mid-play (a network or decode error): the clip exists, and the robot voice would restart the story.
function narrate(text){ narrateSeq++; const t=toSpeech(text); stopSpeech(); if(!t) return;
  const a=new Audio("voice/"+voiceHash(t)+".mp3"); curClip=a; let fb=false;
  const missing=()=>{ if(fb || curClip!==a) return; fb=true; curClip=null; speakStory(text); };
  a.addEventListener("error",()=>{ if(a.error && a.error.code===4) missing(); });
  const p=a.play(); if(p&&p.catch) p.catch(e=>{ if(e && e.name==="NotSupportedError") missing(); }); }
function stopSpeech(){ if("speechSynthesis" in window){ try{ speechSynthesis.cancel(); }catch(e){} }
  if(curClip){ try{ curClip.pause(); }catch(e){} curClip=null; } }
// The player has reached a level (picked a buddy / signed in / opened a package) — let narration begin and speak the current story.
function enterPlay(){ narrateReady=true; if(speakOn) narrate(curStage().intro||""); }
function renderSpeak(){ if(!speakBtn) return; speakBtn.classList.toggle("on",speakOn);
  speakBtn.textContent=speakOn?"🔊":"🔇"; speakBtn.title=speakOn?"Read aloud: ON":"Read aloud: OFF";
  const lb=document.getElementById("speakLabel"); if(lb) lb.textContent="Read aloud: "+(speakOn?"on":"off"); }
if(speakBtn) speakBtn.onclick=()=>{ speakOn=!speakOn; renderSpeak();
  if(speakOn){ narrateReady=true; narrate(curStage().intro||""); } else stopSpeech();
  saveUserSettings(); };                                     // an explicit toggle: the player chose this
