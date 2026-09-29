// ---------- Persistence: one Store seam (localStorage now → cloud/Cognito later) ----------
const Store={ get(k,def){ try{ const v=localStorage.getItem("mg_"+k); return v==null?def:JSON.parse(v); }catch(e){ return def; } },
  // returns false on quota/serialisation failure: a quest transaction must be able to fail closed
  // rather than believe a write landed. Existing callers ignore the value and behave as before.
  set(k,v){ try{ localStorage.setItem("mg_"+k, JSON.stringify(v)); return true; }catch(e){ return false; } } };
let progress = Object.assign({ v:1, name:"", current:"intro", packages:{}, settings:{}, updatedAt:0 }, Store.get("progress",{}));
if(!progress.packages || typeof progress.packages!=="object") progress.packages={};
function pkgProg(id){ return progress.packages[id] || (progress.packages[id]={ level:0, maxLevel:0, completed:false }); }
// saveProgress() used to do three unrelated jobs in one call: snapshot whatever was sitting in the
// global controls, advance the current package, and serialise the lot. The snapshot was the dangerous
// part. A control's live value is often something the GAME set — a package's entry default, a groove's
// tempo, the Studio's unconditional guitar — not something the child chose, and because saveProgress
// also fired on package entry and level completion, any of those could be laundered into
// progress.settings as though they had chosen it. `tempoOnLoan` below is a scar from exactly that:
// it exists to stop a famous tune's 40 BPM surviving a reload. Split by owner instead.
//
// commitProgress() is the ONLY sink, and it never reads a live control — it serialises what is already
// in `progress`. That is what makes the guarantee structural rather than a rule to remember.
function commitProgress(){
  delete progress.toolbox;              // vestigial root bag from the pre-2026-06-20 global design; nothing reads it
  progress.updatedAt=Date.now();
  Store.set("progress", progress); scheduleCloud(); }

// The ONLY function that snapshots the settings controls. Call it from an explicit player action and
// NOWHERE else — not a render, not a scope entry, not applyRegionInstrument or setVoice, not a groove
// or a famous-tune tempo loan, not song loading, not a package save.
// The Studio's click is a player preference like the others, and it comes through here from its own
// change handler. It could never have reached the store through the old package save, which returned
// early in the Studio, where the click control lives.
function saveUserSettings(){
  progress.settings={voice:instrEl.value, tempo:playerTempo(), mix:mix, speak:speakOn, click:clickMode};
  commitProgress(); }

function savePlayerName(name){ progress.name=name; commitProgress(); }

// Package advancement. Deliberately does NOT touch progress.settings — that is the whole point of the
// split, and re-adding a snapshot here would reopen the laundering path.
function savePackageProgress(){
  const id=requirePackageId();
  progress.current=id; const pp=pkgProg(id);
  pp.level=levelIdx; pp.maxLevel=Math.max(pp.maxLevel||0, levelIdx);
  if(levelIdx>=activeStages().length-1) pp.completed=true;   // reached the final level → package complete
  if(id==="two-new-colors"){ progress.colors=["F","B"]; }    // persistent: the world has discovered F & B
  pp.toolbox=toolbox.map(t=>({offs:t.offs.slice(),midis:t.midis.slice()}));   // per-package, never global
  commitProgress(); }

// Crafting is not always package advancement. The Studio persists no inventory, exactly as before —
// the old saveProgress returned early for it. B2 routes a quest tray through here too.
function saveActiveInventory(){
  if(isPackageScope()) return void savePackageProgress();
  if(isQuestScope()) transactQuestRun(activeScope.runId,
    [{ type:"edit", target:"tray", tray:toolbox.map(t=>({offs:t.offs.slice(),midis:t.midis.slice()})), at:Date.now() }]);
  // the Studio keeps persisting nothing, exactly as before
}
// Load this package's OWN saved tools (or start empty). The toolbox no longer carries across packages — a fresh
// lesson shouldn't open with another lesson's bag (and old pentatonic tools have the wrong notes in a diatonic package).
function loadScopeToolbox(){ toolbox.length=0;
  const id=activePackageId();
  const qrun = isQuestScope() && QUEST_RUNS[activeScope.runId];
  const saved = qrun ? (qrun.tray||[])
              : (id && progress.packages[id] && progress.packages[id].toolbox) || [];
  if(Array.isArray(saved)) saved.forEach(t=>{ if(t&&t.offs&&t.midis) toolbox.push({offs:t.offs.slice(),midis:t.midis.slice()}); });
  toolboxOwner=scopeToolboxOwner(); renderBag(); }

