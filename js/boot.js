// ---------- Boot: the load-time sequence, the LAST game script ----------
// Everything the game does once at load, in order, after every other script has declared what it needs. First
// it asks the load gate (js/load-gate.js) whether all of them arrived and ran: if one did not, the game must
// not start — and above all must not save — around the missing piece. The throw ends this script here.
if(!gameScriptsLoaded()) throw new Error("Tune Garden: a game script failed to load, so the garden is not starting (the error above names it).");
// restore saved progress (Phase A: local; later synced to the account). ?reset wipes it for testing.
if(/[?&]reset\b/i.test(location.search)){ Store.set("progress",null); progress={ v:1, name:"", current:"intro", packages:{}, settings:{}, updatedAt:0 };
  Store.set("questRuns",null); QUEST_RUNS=Object.create(null); QUEST_HISTORY=Object.create(null); }   // a reset wipes quest drafts and history too
ensureInstruments();   // derive the unlocked-instrument set for saves that predate the gradual reveal
if(progress.settings && progress.settings.voice) setVoice(progress.settings.voice);
if(progress.settings && progress.settings.tempo) tempoEl.value=progress.settings.tempo;
if(progress.settings && progress.settings.mix) mix=Object.assign(mix, progress.settings.mix);
if(progress.settings && progress.settings.click) clickMode=progress.settings.click;
speakOn = !(progress.settings && progress.settings.speak===false); renderSpeak();   // read-aloud ON by default (unless turned off)
loadQuestCatalog(BUILTIN_QUEST_CATALOG_JSON, "official");   // all-or-nothing: a bad definition publishes an EMPTY registry
hydrateQuestRuns();  // drafts live at their own Store key; a malformed run is dropped, never guessed at
recoverQuestOfferings();   // a crash mid-offering finishes here: the artifact is written before the run completes
toolboxOwner=null;   // per-scope now; the renderLevel below loads the resumed package's own tools
restoreLastPackage();

renderBag(); buildDrums(); renderLevel(); updateTitle();   // renderLevel syncs the region companion

// open a shared creation if the URL carries one — land in the editable Studio.
// #s=<packed>  = an inline (small) song;  #song=<id> = a cloud-stored song fetched via the /songs API.
(function(){
  const inline=(location.hash||"").match(/(?:^#|&)s=([^&]+)/);
  if(inline){ const s=decodeSong(inline[1]); if(!s) return;
    openStudioWith(s);
    setStatus("🎵 A melody from a friend — press <b>▶ Play</b> to listen, then remix it!"); toast("🎵 A melody from a friend!"); return; }
  const cloud=(location.hash||"").match(/(?:^#|&)song=([^&]+)/);
  if(cloud){ openStudio(); const tok=songLoadToken;
    cloudSongGet(decodeURIComponent(cloud[1])).then(res=>{
      // The player can walk into a package while this request is still in flight, and renderLevel bumps
      // the token on every entry. Landing a stranger's song — and now its BARS — in the level they chose
      // to open is worse than dropping it, so drop it. Re-opening the Studio over them would be worse yet.
      if(tok!==songLoadToken || !isStudioScope()) return;
      if(res&&res.song){ if(res.song.meta) res.song.meta.cloudId=res.id; applySong(res.song); journalClear();   // the async load must not be the first undoable "edit"
        setStatus("🎵 A song from a friend — press <b>▶ Play</b> to listen, then remix it!"); toast("🎵 A song from a friend!"); }
      else toast("⚠️ That song link didn't work — it may have been deleted."); }); }
})();

// ---------- dev-only jump (enable by adding ?dev or #dev to the URL) ----------
if(/(?:[?&]|#)dev/i.test(location.search+location.hash)){
  document.getElementById("devbar").style.display="";
  // package selector jumps to any package's first level (ignores lock state — dev only)
  document.getElementById("devpkg").onchange=e=>{ if(e.target.value!==scopeCatalogId()) openPkg(e.target.value,0); };
  document.getElementById("devjump").onchange=e=>{ levelIdx=+e.target.value; renderLevel(); };
  // Quest testing needs a profile that has EARNED the prerequisites, which is otherwise several
  // packages of real play. Dev-only, behind the same ?dev flag as the jump above, and it writes the
  // ordinary progress record rather than a special case — so what it produces is a profile the game
  // could have reached on its own.
  document.getElementById("devquestunlock").onclick=()=>{
    const need=new Set();
    for(const id of Object.keys(QUEST_DEFINITIONS))
      for(const p of QUEST_DEFINITIONS[id].prerequisites.earnedByPackageIds) need.add(p);
    const named=[];
    for(const id of need){ const pk=PACKAGES[id]; if(!pk) continue;
      const n=pk.levels.length;
      progress.packages[id]=Object.assign(pkgProg(id), { level:0, maxLevel:n-1, done:n, completed:true });
      named.push(pk.name); }
    progress.updatedAt=Date.now(); Store.set("progress", progress);
    renderWorld(); if(homeoverlay.style.display!=="none"){ renderPkgs(); renderQuestHome(); }
    toast(named.length ? "🗝️ Completed: "+named.join(", ") : "No quests need unlocking");
  };
  document.getElementById("devquestclear").onclick=()=>{
    if(isQuestScope()) restoreLastPackage();          // never strand the scope on a run about to vanish
    const saved=saveQuestRuns(Object.create(null), Object.create(null));
    if(saved===false){ toast("⚠️ Could not clear quest runs"); return; }
    QUEST_RUNS=saved; QUEST_HISTORY=Object.create(null);
    renderLevel();
    if(homeoverlay.style.display!=="none") renderQuestHome();
    toast("🧹 Quest runs cleared — every quest is unplayed again");
  };
  // relock every instrument but keep all progress — entering each region replays its discovery
  // card, so the gradual reveal is testable without wiping a real save (?reset stays the big hammer)
  document.getElementById("devrelock").onclick=()=>{ progress.instruments=["musicbox"];
    setVoice("musicbox"); refreshVoices(); commitProgress();
    toast("🔒 Instruments relocked — enter a region to rediscover its voice"); };
  populateDevJump();                                  // populate both dropdowns (refreshes on package change)
}

// ---------- Landing / welcome screen ----------
const landingoverlay=document.getElementById("landingoverlay");
const landingMain=document.getElementById("landingmain"), landingAuth=document.getElementById("landingauth");
function showLanding(){ landingMain.style.display=""; landingAuth.style.display="none";
  document.getElementById("landingSignin").style.display = cognitoReady() ? "" : "none";   // hide sign-in if cloud unavailable
  landingoverlay.style.display="flex"; }
function hideLanding(){ landingoverlay.style.display="none"; }
document.getElementById("landingStart").onclick=()=>{ hideLanding(); showCompPicker(); };
document.getElementById("landingSignin").onclick=()=>{ landingMain.style.display="none"; landingAuth.style.display="";
  document.getElementById("landingUser").focus(); };
document.getElementById("landingBack").onclick=()=>{ landingAuth.style.display="none"; landingMain.style.display=""; };
async function doLandingSignIn(){
  const u=document.getElementById("landingUser").value.trim(), p=document.getElementById("landingPass").value;
  const msg=document.getElementById("landingMsg");
  if(!u||!p){ msg.textContent="Enter your username and password."; return; }
  msg.textContent="Signing in…";
  try{ await cogSignIn(u,p); await onSignedIn(false);            // pulls cloud progress → applyProgress resumes the game
    pname.value=progress.name||""; renderPkgs(); hideLanding(); }
  catch(e){ msg.textContent="⚠️ "+((e&&e.message)||e); } }
document.getElementById("landingDo").onclick=doLandingSignIn;
document.getElementById("landingPass").addEventListener("keydown",e=>{ if(e.key==="Enter") doLandingSignIn(); });

// First-load gate: shared link → straight to the studio; signed-in session → resume; else fresh visitor → landing.
(function(){ if(/[#&](?:s|song)=/.test(location.hash)) return;
  if(cognitoReady() && userPool && userPool.getCurrentUser()){ onSignedIn(false); return; }   // resume an existing session (narration starts after the cloud load)
  if(!progress.companion){ showLanding(); return; }                                            // brand-new / signed-out visitor → wait on the landing screen (no narration yet)
  enterPlay();                                                                                 // returning local player lands straight on a level → narrate it now
})();
