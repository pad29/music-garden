// ---------- The level engine: a level's layout and stages, its goals, rewards, the world strip and companions ----------
const pitchArea=document.getElementById("pitchArea"), drumArea=document.getElementById("drumArea"),
  toolboxCard=document.getElementById("toolboxCard");
// ---- A stage's opening melody (an echo level's phrase, a Question & Answer call), heard ONCE per entry (TUN-125) ----
// An ENTRY, not a draw: openingStage is the stage whose entry has used its melody — pending, held, played or
// silenced. A redraw of that same stage (a sign-in's cloud load landing on the level the player is on, early or
// late) keeps it as it is; drawing another stage frees it. 🔊 Listen (from the press: pointer or key) and the ▶ Play
// button spend it (a scripted start() — a reveal, Jam — does not).
// The page's OWN draws never play it: the boot's, and a signed-in reload's cloud load, wherever it lands. Until the
// player navigates — a package or the Studio from Home, Next, a quest — or signs in themselves (authBusy: the
// sign-in form's load, which also gives a stage the reload silenced its entry back), every entry is silent, and
// 🔊 Listen is how it is heard. The owner, 2026-11-25, after playtesting a build that played a reload's melody at the
// first tap: "it feels strange that it plays together with me planting a seed"; then "let's just say always
// silence. Otherwise the behavior may be different depending on the browser."
// Notes are booked only on a RUNNING clock: notes booked on a frozen one are not lost, they wait and sound together
// later, over whatever is booked then. So when its 350 ms are up and the clock is not running, nothing is booked and
// the melody WAITS: a suspended clock gets resume() and half a second — after that it would arrive with some
// unrelated later tap, so it is dropped and Listen is how it is heard; an interrupted clock (iOS) waits for the
// system to give it back. Behind 🏠 Home it is held, and leaving Home (any way) starts the 350 ms pause afresh,
// which a Listen press cancels. (Notes already booked on a running clock are left to finish.)
let openingTimer=null, openingNotes=null, openingWaits=null, openingUntil=0, openingHooked=null,
  openingStage=null, openingSilenced=false, openingQuiet=true;
function cancelOpening(){ clearTimeout(openingTimer); openingTimer=null; openingNotes=null; openingWaits=null; }   // spent: Listen, ▶ Play
function leaveOpening(){ cancelOpening(); openingStage=null; openingSilenced=false; }   // left: the next entry plays anew
function playerEnters(){ openingQuiet=false; leaveOpening(); }   // the player's own navigation: a package, the Studio, Next, a quest
function openingSoon(notes){ clearTimeout(openingTimer); openingNotes=notes;
  openingTimer=setTimeout(()=>{ openingTimer=null; openingNotes=null; openingDue(notes); }, 350); }
function openingFor(st,notes){
  if(st===openingStage && !(openingSilenced && authBusy)) return;   // a redraw of the entered stage: as it was
  leaveOpening(); if(!notes || !notes.length) return;
  openingStage=st;
  if(openingQuiet && !authBusy){ openingSilenced=true; return; }   // the page's own draw: silent until Listen
  openingSoon(notes); }
const homeUp=()=>homeoverlay.style.display==="flex";
function openingDue(notes){ initAudio();
  if(actx.state==="closed") return;
  if(homeUp()){ openingWaits=notes; openingUntil=Infinity; return; }   // behind Home: held until it is left
  if(actx.state===undefined || actx.state==="running"){ playPhrase(notes); return; }   // (an old context with no state: it runs)
  openingWaits=notes; openingUntil = actx.state==="suspended" ? performance.now()+500 : Infinity;
  if(openingHooked!==actx){ openingHooked=actx; actx.addEventListener("statechange",clockStarted); }
  if(actx.state==="suspended") actx.resume(); }   // the page has had a click (a navigation, a sign-in): this starts it
function clockStarted(){ if(!openingWaits || actx.state!=="running" || homeUp()) return;
  const n=openingWaits; openingWaits=null;
  if(performance.now()<=openingUntil) playPhrase(n); }   // too late: it would come with an unrelated tap — dropped
function releaseOpening(){ const n=openingWaits || openingNotes; if(!n) return;   // every way off Home: the pause starts now
  openingWaits=null; openingSoon(n); }
function resetTransient(){ cancelCompletionSession("reset");   // wipe playback/modes/grids/flags so a level or step starts clean
  pendingReveal=null; revealRestore=null; revealHarm=revealSync=false;   // drop any reveal in flight
  clearContourGhost(); hideChoices(); setBeatGuide(false); setPhraseGuide(false); setDensityMeter(false); setColorReveal(null); setMood(null); setMotifGuide(false); setFeelRow(false); setWobbleMeter(false);   // drop any contour/pulse/phrase/density/color-reveal/mood/motif/feel/wobble UI
  clearFamousTimers(); pendingFamous=null;   // cancel any in-flight famous-tune flashes / pending reveal (the grid is about to be rebuilt)
  if(playing) stop();
  jamMode=false; jamBtn.classList.remove("on"); jamStartedPlayback=false;
  activeTool=null; exitTray();
  // §17's quarantine: a Studio meter must NEVER reach a level. Clearing the MODEL is not enough — the
  // barlines, the bar chips, the 36px rail and the drum pads' tint are all DRAWN state, and nothing else
  // on this path redraws them. Measured leaking into `stepping-stones` straight from a 4/4 Studio: the
  // model came back unmetered while the picture stayed in 4/4, bars and all. This is the claim a design
  // review said resetTransient could not carry on its own, and it was right.
  if(doc.meterMap.length){ doc.meterMap.length=0; _tintKey=null;   // the pulse memo is keyed on the meter
    syncMeterUI(); rebuildField(); }                               // controls + overlays, then the pads, which bake their tint at build time
  // …and the GROOVE, which is session-global and was walking straight through this quarantine: a Studio
  // waltz stayed selected into a level, where a scripted runReveal({jam:true}) would have played it on a
  // six-column band. Only an incompatible groove moves, so a player's Ballad still follows them in.
  if(normalizeGroove()) renderGrooveOptions();
  cursorCol=0; cursorPinned=false; loopStart=0; loopEnd=0; syncCursor();   // every level/step starts with the cursor at the top, unpinned, looping from the top
  zoomTapDrop(); pinchDrop(); swallowTapUntil=0;   // …with no half-finished gesture and no pending swallow carried across the seam
  if(fieldZoom!==1) setFieldZoom(1);   // …and at full size: zoom is a way of LOOKING at one garden, never a saved setting
  ev=freshEv(); wipe(); wipeDrums(); renderBag();
  if(COLS>16) removeColumns(COLS-16);   // a long Jukebox/famous tune may have widened the field — every level starts at its base length (a reveal that needs room re-widens itself)
  step=0; playhead.classList.remove("on"); camStop(); scroller.scrollLeft=0; camReseed(); CAM.yielded=false; litEls.length=0;
}
function renderLevel(){   // level-wide setup (unlocks, layout), then render its first stage
  const L=currentLevel(), U=scopeFeatures();
  document.body.dataset.region = scopeVisualRegion();   // per-region land tint (bed + page edge via CSS vars)
  setPalette(scopePalette());                          // swap pitch set + rebuild grid (per-scope palette)
  if(scopeToolboxOwner()!==toolboxOwner) loadScopeToolbox();   // one bag per scope — never inherit another's tools
  carriedDrums=null;   // a fresh level never inherits a carried beat (only step→step within a level does)
  jamBtn.style.display=U.has("jam")?"":"none";
  grooveCtlEl.style.display=U.has("jam")?"":"none";   // the LABEL, not the select — groove now lives in the settings row, and hiding only the select would leave the word "Groove" behind
  songLoadToken++;                                   // any level entry cancels a cloud song still in flight (see the #song= bootstrap)
  syncMeterUI();                                     // Studio-only meter controls, and the bars that go with them
  craftBtn.style.display=U.has("fuse")?"":"none"; toolboxCard.style.display=U.has("fuse")?"":"none";
  moreMenu.style.display=U.has("more")?"":"none";
  roomGroup.style.display=U.has("room")?"":"none";
  const drumsUnlocked=U.has("drums");
  drumsOn = drumsUnlocked && (!!L.rhythm || !!L.drums);
  drumBtn.style.display=(drumsUnlocked && !L.rhythm)?"":"none";
  drumBtn.classList.toggle("on",drumsOn);
  showDrumArea(drumsOn); pitchArea.style.display="";
  looping=!!L.rhythm || !!L.loop; loopBtn.classList.toggle("on",looping);
  if(L.unlock && L.unlock.length) toast("🔓 Unlocked: "+L.unlock.map(featName).join(", "));
  renderStage(); if(isPackageScope()) savePackageProgress(); renderWorld();   // entry sets the step; render must not reset it, or quest resume dies
  companionStageShown=friendStage(); syncCompanion(); greetRegionFriend();   // show this region's friend; greet new ones
  // entering the goal-less finale IS its completion moment (skipped when opening a shared song)
  if(!finaleQuiet && isPackageScope() && levelIdx===activeStages().length-1 && !(curStage().goals||[]).length){
    const id=requirePackageId(), pp=pkgProg(id), n=activeStages().length;
    if((pp.done||0)<n){ pp.done=n; savePackageProgress(); renderWorld(true);
      showCongrats(id, L.power); checkEvolve(); } }
}
let finaleQuiet=false;   // suppress the finale power card when jumping to Free Play for a shared song
let songLoadToken=0;     // bumped by renderLevel — an async cloud song must not land in a level the player walked into
function renderStage(){   // render the current step (or the whole level if it has no steps)
  // ONE quest branch, and it is the first line: everything below is the package/Studio lesson panel,
  // which a quest has no goals, hint or "Next level" for.
  // The status line is written by renderQuestShell, which questPaintField ends by calling: it says what
  // this phase is for and that leaving is free, instead of "press Play" and a Hint that does not exist.
  if(isQuestScope()){ playerEnters(); questPaintField(activeScope.runId); renderVines(); populateDevJump();
    if(speakOn && narrateReady && !instrCardUp()) narrate(curStage().intro||""); else stopSpeech();
    return; }
  const L=currentLevel(), st=curStage(), U=scopeFeatures();
  { const lc=document.getElementById("levelCard"); if(lc) lc.style.display="";
    const q=document.getElementById("questCard"); if(q) q.style.display="none"; }
  resetTransient();
  levelDone=false; stepDone=false; nextBtn.style.display="none";
  const tag=L.steps?` &nbsp;(${currentStepIndex()+1}/${L.steps.length})`:"";
  levelTitle.innerHTML=`Level ${levelIdx+1}/${activeStages().length}: ${L.name}${tag}`;
  levelIntro.textContent=st.intro||"";
  const teachTxt = st.teach || L.teach || "";                            // the theory "why" — a quiet aside, story+task stay the focus
  levelTeach.textContent = teachTxt ? ("🎓 "+teachTxt) : "";
  levelTeach.style.display = teachTxt ? "" : "none";
  if(speakOn && narrateReady && !instrCardUp()) narrate(st.intro||""); else if(!speakOn || !instrCardUp()) stopSpeech();  // narrate the story (baked clip → browser-voice fallback) — but not on the landing screen, and not over an instrument-discovery card
  const goals=st.goals||[]; goalList.innerHTML="";
  goals.forEach(g=>{ const li=document.createElement("li"); li.id="goal-"+g.id; li.textContent="◻ "+g.label; goalList.appendChild(li); });
  goalHint.innerHTML = goals.length ? "" : "Sandbox mode — no goals, just create. 🎶";
  hintBtn.style.display = st.hint?"":"none";
  listenBtn.style.display = (st.echo||st.call)?"":"none";
  openingFor(st, st.echo || st.call);                    // play the phrase / the call once per entry (TUN-125)
  if(drumsOn && st.carryDrums && carriedDrums){ placeDrums(carriedDrums); carriedDrums=null; }   // reuse the player's beat from the previous step
  else if(drumsOn && st.drumSetup) st.drumSetup();                                                // otherwise the fixed starting pattern
  if(st.setup) st.setup();
  drawContourGhost(st.contour);                                          // glowing target path (contour packages)
  setBeatGuide(!!st.beatGuide);                                          // tinted beat columns (pulse packages)
  const phraseOn = !!(L.phrase || st.phrase);                            // flag may sit on the level OR a step (multi-step Q&A levels)
  if(phraseOn && COLS>16) removeColumns(COLS-16);                        // Q&A assumes a single 16-col bar (call 0–7 / answer 8–15)
  setPhraseGuide(phraseOn);                                              // split the field into call / answer halves (Q&A package)
  setDensityMeter(!!(L.density || st.density));                          // airy↔crowded readout (Wind & Gaps package)
  setColorReveal(st.colors || L.colors || null);                         // staged F/B reveal — lock undiscovered notes (Two New Colors)
  setMood(st.mood || L.mood || null);                                    // sun (C major / bright) or moon (A minor / wistful) field wash (Sun & Moon Garden)
  setMotifGuide(!!(st.motif || L.motif));                                // tint alternating 4-col windows (Tiny Motifs)
  setFeelRow(!!(st.feel || L.feel));                                     // straight ↔ swing switch (Off the Path)
  setWobbleMeter(!!(st.wobble || L.wobble));                             // the weather glass — graded-tension gauge (Soft Wobble)
  if(st.call) placeCall(st.call);                                        // pre-place the call — every draw, a redraw too
  setStatus( choiceStatus ? choiceStatus                                 // a picker's own prompt survives — setup() runs BEFORE this line
    : L.rhythm ? "Tap the 🥁 pads below to build a beat, then press <b>▶ Play</b>."
    : U.has("fuse") ? "Plant seeds 🌱 &nbsp;·&nbsp; craft a tool: stack <b>2–3 seeds in one column</b>, then press <b>🔨 Fuse</b>."
    : "Plant seeds 🌱 — click squares, then press <b>▶ Play</b>. Need an idea? Try <b>💡 Hint</b>." );
  document.body.classList.toggle("growing", canGrow());   // the Studio, and any package that unlocks "grow" — Two Kinds of Walking teaches it
  renderVines();
  populateDevJump();
  journalClear();   // undo spans the PLAYER's edits only — never the stage's own setup (calls, starter beats, pre-placed seeds)
  checkLevel();
}
// dev jump dropdowns: a package selector (any package, ignoring lock state) + a level selector that refreshes per package
let devJumpPkg=null;
function populateDevJump(){ const bar=document.getElementById("devbar"); if(!bar || bar.style.display==="none") return;
  const pkgSel=document.getElementById("devpkg"), sel=document.getElementById("devjump");
  if(pkgSel && !pkgSel.options.length){ Object.keys(PACKAGES).forEach(id=>{    // package list is static — build once
    const o=document.createElement("option"); o.value=id; o.textContent=PACKAGES[id].name; pkgSel.appendChild(o); }); }
  const cat=scopeCatalogId();
  if(pkgSel) pkgSel.value=cat||"";
  if(devJumpPkg!==cat){ devJumpPkg=cat; sel.innerHTML="";
    if(cat) (activeStages()||[]).forEach((L,i)=>{ const o=document.createElement("option"); o.value=i; o.textContent=`${i+1}. ${L.name}`; sel.appendChild(o); }); }
  sel.value=levelIdx;
}
function checkLevel(){
  updateWobbleMeter();                                             // the weather glass tracks every edit (no-op when hidden)
  const st=curStage(), s=gridState(), goals=st.goals||[];
  // a "play:true" goal only counts once every OTHER goal is done AND Play was pressed (after the last edit)
  const othersDone=goals.filter(g=>!g.play).every(g=>g.chk(s,ev));
  let all=true;
  goals.forEach(g=>{ const ok = g.play ? (othersDone && ev.played) : g.chk(s,ev);
    const li=document.getElementById("goal-"+g.id);
    if(li){ li.textContent=(ok?"✅ ":"◻ ")+g.label; li.classList.toggle("done",ok); }
    if(!ok) all=false; });
  if(goals.length && all && !stepDone){ stepDone=true; stageComplete(); }
  updateGarden(); updateDensityMeter();
}
function stageComplete(){ confetti(); const L=currentLevel();
  if(L.steps && !isQuestScope() && lessonStepIdx<L.steps.length-1){
    toast("🎉 Nice — next one!"); nextBtn.textContent="Next ▶"; nextBtn.style.display="";
    goalHint.innerHTML="Great! Press <b>Next ▶</b> to continue."; return; }
  levelDone=true; markPackageLevelDone();
  if(levelIdx<activeStages().length-1){
    nextBtn.textContent="Next level ▶"; nextBtn.style.display="";
    goalHint.innerHTML="Great work! Press <b>Next level ▶</b> when you're ready."
      +(L.intent?`<br><span class="intent">✨ ${L.intent}</span>`:""); }
  else toast("🌟 You did it — the whole garden is awake!");
  pendingReveal=L.reveal||null;                       // surprise reveal fires after the card is claimed
  const fam=(curStage().famous)||L.famous;            // a famous example? reveal it as the reward, after the power card
  if(fam){ pendingFamous=fam; if(!L.power) setTimeout(()=>{ const id=pendingFamous; pendingFamous=null; revealFamous(id); }, 700); }
  if(L.power) showPower(L.power); else toast("🎉 Level complete!");
  checkEvolve();                                      // arc complete? companion evolves (deferred behind the card)
}
// "done" = levels COMPLETED in this package (maxLevel = levels reached) — drives the world strip
function markPackageLevelDone(){ if(!isPackageScope()) return;   // the Studio and quests have no package to advance
  const pp=pkgProg(requirePackageId());
  if((pp.done||0)<levelIdx+1){ pp.done=levelIdx+1; savePackageProgress(); renderWorld(true); } }
// power card: each completed level awards a named "power" (unlocks re-framed as abilities)
const powoverlay=document.getElementById("powoverlay");
function showPower(p){ document.getElementById("powem").textContent=p.em;
  document.getElementById("powname").textContent=p.name;
  document.getElementById("powline").textContent=p.line;
  powoverlay.style.display="flex"; }
function closePow(){ powoverlay.style.display="none";
  if(pendingEvolve){ pendingEvolve=false; playEvolve(); }                  // companion grows after the card is claimed
  if(pendingReveal){ const r=pendingReveal, at=curStage(); pendingReveal=null; setTimeout(()=>{ if(curStage()===at) r(); },350); }   // not on a stage drawn since (a cloud load): it would play that field over its opening melody (TUN-125)
  if(pendingFamous){ const id=pendingFamous; pendingFamous=null; setTimeout(()=>revealFamous(id),450); } }   // famous example plays as the reward, after the card
document.getElementById("powclose").onclick=closePow;
powoverlay.onclick=e=>{ if(e.target===powoverlay) closePow(); };
// package-complete congrats (shown on the goal-less free-play finale): names newly unlocked packages
const congratsoverlay=document.getElementById("congratsoverlay");
const rewardOverlayUp = () => powoverlay.style.display==="flex" || congratsoverlay.style.display==="flex";
function newlyUnlocked(pkgId){ return Object.keys(PACKAGES).filter(id => id!==pkgId
  && (PACKAGES[id].requires||[]).flat().includes(pkgId) && isPkgUnlocked(id) && !pkgProg(id).completed); }
function showCongrats(pkgId, finalPower){
  document.getElementById("congratsEm").textContent=(finalPower&&finalPower.em)||"🎉";
  document.getElementById("congratsName").textContent="You completed "+PACKAGES[pkgId].name+"!";
  const u=newlyUnlocked(pkgId);
  document.getElementById("congratsLine").innerHTML = u.length
    ? "🔓 New path"+(u.length>1?"s":"")+" unlocked: <b>"+u.map(id=>PACKAGES[id].name).join(", ")+"</b><br>Find "+(u.length>1?"them":"it")+" on the 🏡 Home screen."
    : "This whole path is yours to wander now. More gardens are growing — check back soon! 🌱";
  congratsoverlay.style.display="flex"; }
function dismissCongrats(goHome){ congratsoverlay.style.display="none";
  if(pendingEvolve){ pendingEvolve=false; setTimeout(playEvolve,250); }
  if(goHome) openHome(); }
document.getElementById("congratsHome").onclick=()=>dismissCongrats(true);
document.getElementById("congratsStay").onclick=()=>dismissCongrats(false);
// carry this finale's creation straight into the Studio (widest unlocked palette)
document.getElementById("congratsStudio").onclick=()=>{ const s=currentSong();
  congratsoverlay.style.display="none"; pendingEvolve=false; openStudioWith(s); };
congratsoverlay.onclick=e=>{ if(e.target===congratsoverlay) dismissCongrats(false); };

// world strip: the garden visibly "wakes" — one glowing emblem per completed level (persistent)
const worldEl=document.getElementById("world");
function renderWorld(popLast){ worldEl.innerHTML="";
  if(!isPackageScope()){ worldEl.style.display="none"; return; }   // the power strip is a package artefact
  const stages=PACKAGES[requirePackageId()].levels;
  if(!stages.some(L=>L.power)){ worldEl.style.display="none"; return; }
  worldEl.style.display="flex";
  const pp=pkgProg(requirePackageId()), done=pp.completed?stages.length:(pp.done||0);
  stages.forEach((L,i)=>{ if(!L.power) return; const s=document.createElement("span");
    s.textContent=L.power.em; s.title=L.power.name+" — "+L.name;
    if(i<done){ s.classList.add("lit"); if(popLast&&i===done-1) s.classList.add("pop"); }
    worldEl.appendChild(s); });
}

// ---- Companions: ONE friend per region; it grows as you complete that region's packages ----
// First Garden (intro) friend = the player's PICKED starter, grown through the intro's arcs.
const COMPANIONS={
  sprout: {name:"Sprout",  stages:["🌱","🌿","☘️","🪴","🌳"]},
  chirpy: {name:"Chirpy",  stages:["🥚","🐣","🐤","🐦","🕊️"]},
  twinkle:{name:"Twinkle", stages:["✨","💫","⭐","🌟","🌠"]},
};
// Every later region has one signature friend that grows one stage per completed package in that region.
const REGIONS={
  "paths-of-song": { name:"Paths of Song", friend:{ name:"Flutter", stages:["🥚","🐛","🌿","🦋","🦋✨"] } },
  "pulse-woods":   { name:"Pulse Woods",   friend:{ name:"Hopper",  stages:["🥚","🟢","🐸","🐸✨","👑🐸"] } },
  "stone-chorus-canyon": { name:"Stone Chorus Canyon", friend:{ name:"Geo", stages:["🪨","🔸","🔶","💎","💎✨"] } },
  "color-spring":  { name:"The Color Spring", friend:{ name:"Prism", stages:["🌫️","💧","🔷","🌈","🌈✨"] } },
  "weather-of-wanting": { name:"Weather of Wanting", friend:{ name:"Sol", stages:["☁️","🌥️","⛅","🌤️","☀️"] } },
  "twin-gardens":  { name:"The Twin Gardens", friend:{ name:"Solune", stages:["🌑","🌙","🌗","🌅","🌞"] } },
};
const compoverlay=document.getElementById("compoverlay");
const regionOf = id => (PACKAGES[id]&&PACKAGES[id].region) || "first-garden";
const pkgFullyDone = id => { const p=PACKAGES[id]; return !!p && (pkgProg(id).done||0) >= p.levels.length; };
// the player-facing world map: ordered regions (incl. teasers for ones with no packages yet)
const REGION_MAP=[
  {id:"first-garden",        emoji:"🌱", name:"The First Garden",    blurb:"Where every gardener begins.",            color:"#44A35F"},
  {id:"paths-of-song",       emoji:"🎶", name:"Paths of Song",       blurb:"Shape melodies that feel alive.",          color:"#5AA9E6"},
  {id:"pulse-woods",         emoji:"🥁", name:"Pulse Woods",         blurb:"Make the forest walk, march, and dance.",  color:"#F28C8C"},
  {id:"stone-chorus-canyon", emoji:"🏛️", name:"Stone Chorus Canyon", blurb:"Build harmonies that stand tall.",         color:"#7A93B0"},
  {id:"color-spring",        emoji:"🌈", name:"The Color Spring",      blurb:"Discover two new colors — the world widens.", color:"#D678A8"},
  {id:"weather-of-wanting",  emoji:"🌦️", name:"Weather of Wanting",  blurb:"Make music long for home.",                color:"#63B0B0"},
  {id:"twin-gardens",        emoji:"🌗", name:"The Twin Gardens",     blurb:"The same notes, bright or wistful — day and night.", color:"#8A6FE8"},
];
// arc-end thresholds for a level set (count of levels) — the starter's stage = number of intro arcs fully completed
function arcEndsFor(levels){ const ends=[]; for(let i=0;i<levels.length;i++){ const a=levels[i].arc; if(a==null) continue;
  if(i===levels.length-1 || levels[i+1].arc!==a) ends.push(i+1); } return ends; }
// a region's friend + its growth stage — works for ANY region (used both in-game and on the map)
function regionFriend(reg){ if(reg==="first-garden"){ const c=progress.companion; return (c&&COMPANIONS[c.type])||null; }
  return (REGIONS[reg]&&REGIONS[reg].friend)||null; }
function regionStage(reg){ const f=regionFriend(reg); if(!f) return 0; let s;
  if(reg==="first-garden"){ const pp=pkgProg("intro"), L=PACKAGES.intro.levels, done=pp.completed?L.length:(pp.done||0);
    s=arcEndsFor(L).filter(e=>done>=e).length; }                                       // intro: grow per arc
  else s=Object.keys(PACKAGES).filter(id=>regionOf(id)===reg && pkgFullyDone(id)).length;   // others: grow per completed package
  return Math.min(s, f.stages.length-1); }
const currentFriend = () => { const r=scopeCompanionRegion(); return r?regionFriend(r):null; };
const friendStage   = () => { const r=scopeCompanionRegion(); return r?regionStage(r):0; };
let companionStageShown=0, pendingEvolve=false;
function syncCompanion(){ const card=document.getElementById("compcard"); if(!card) return;
  const f=currentFriend();
  if(!f){ card.style.display="none"; return; }                          // first-garden, no starter picked yet → the picker handles it
  compoverlay.style.display="none";
  const stage=friendStage(); card.style.display="";
  document.getElementById("compname").textContent=f.name;
  document.getElementById("compem").textContent=f.stages[stage];
  const dots=document.getElementById("compdots"); dots.innerHTML="";
  for(let i=0;i<f.stages.length;i++){ const d=document.createElement("span"); if(i<=stage) d.className="on"; dots.appendChild(d); }
  const reg=scopeCompanionRegion(); if(!reg) return;
  document.getElementById("comphint").textContent = stage>=f.stages.length-1 ? f.name+" is fully grown! 🌟"
    : reg==="first-garden" ? "Grows as you complete each arc."
    : "Grows as you complete "+((REGIONS[reg]&&REGIONS[reg].name)||"this region")+" packages.";
}
function checkEvolve(){ if(!currentFriend()) return; const stage=friendStage();
  if(stage>companionStageShown){ companionStageShown=stage;
    if(rewardOverlayUp()) pendingEvolve=true;                          // wait until the power card / congrats is claimed
    else playEvolve(); }
  else syncCompanion(); }
function playEvolve(){ const f=currentFriend(); if(!f) return; syncCompanion();
  const em=document.getElementById("compem"); em.classList.remove("evolve"); void em.offsetWidth; em.classList.add("evolve");
  toast("✨ "+f.name+" grew into "+f.stages[friendStage()]+"!"); }
function compReact(){ if(!currentFriend()) return; const em=document.getElementById("compem"); if(!em) return;
  em.classList.remove("bob"); void em.offsetWidth; em.classList.add("bob"); }
// greet a region's signature friend the first time you enter that region
function greetRegionFriend(){ const reg=scopeCompanionRegion(); if(!reg||reg==="first-garden"||!currentFriend()) return;
  progress.metRegions=progress.metRegions||[];
  if(!progress.metRegions.includes(reg)){ progress.metRegions.push(reg); commitProgress();
    toast("✨ A new friend joined your garden — "+currentFriend().name+"!"); } }
function showCompPicker(){ const wrap=document.getElementById("compchoices"); wrap.innerHTML="";
  Object.keys(COMPANIONS).forEach(type=>{ const def=COMPANIONS[type];
    const b=document.createElement("div"); b.className="compchoice";
    b.innerHTML=`<div class="ce">${def.stages[0]}</div><div class="cn">${def.name}</div><div class="cevo">${def.stages.join(" → ")}</div>`;
    b.onclick=()=>pickCompanion(type); wrap.appendChild(b); });
  compoverlay.style.display="flex"; }
function pickCompanion(type){ progress.companion={type}; commitProgress();
  companionStageShown=friendStage(); compoverlay.style.display="none"; syncCompanion();
  toast(COMPANIONS[type].name+" joined your garden! "+COMPANIONS[type].stages[0]);
  enterPlay(); }   // now that a buddy is chosen, the level is visible — start the narration here
nextBtn.onclick=()=>{ const L=currentLevel();
  if(isQuestScope()) return;   // a quest phase advances through its run, never through the lesson engine
  if(!levelDone && L.steps && lessonStepIdx<L.steps.length-1){
    carriedDrums = L.steps[lessonStepIdx+1].carryDrums ? snapshotDrums() : null;
    lessonStepIdx++; playerEnters(); renderStage(); }
  else if(levelIdx<activeStages().length-1){ levelIdx++; lessonStepIdx=0; playerEnters(); renderLevel(); } };

