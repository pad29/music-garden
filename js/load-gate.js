// ---------- The load gate: no input reaches the game until all of its scripts have run ----------
// The game is a run of classic scripts, and the browser goes on handling input BETWEEN them: while a later file
// is still arriving, a tap or a key can reach a half-loaded game — TUN-7's design review planted a seed that way,
// with an undo entry, and then threw. When the whole game was one inline script that could not happen, because
// nothing was wired until everything was. This restores it: input is swallowed at the window, in the capture
// phase, before any of the game's own handlers can see it, which is exactly the silence of a page that has no
// handlers yet. Browser defaults (scrolling, focus, a <select> opening) are left alone, as they were then.
// It must stay the FIRST game script, so that nothing is wired before it.
//
// It also restores the single script's all-or-nothing failure. A game script that fails to arrive, arrives as
// something other than JavaScript, or throws while loading no longer stops the files after it — so the gate
// remembers, js/boot.js asks before it does anything, and the game does not start at all rather than boot, and
// save progress, around a missing piece. The gate then stays shut. Only the game's own js/ files count: the
// Cognito SDK (its own CDN script, optional since the start) and anything else on the page are ignored here.
// Every kind of player input the game listens for (tests/load-gate.test.mjs fails if a new one is wired unlisted).
const LOAD_GATE_EVENTS=["pointerdown","pointermove","pointerup","pointercancel","pointerleave","mousedown","mouseup",
  "mouseover","mouseleave","click","touchstart","touchmove","touchend","touchcancel","keydown","keyup","input","change"];
let gameScriptFailed=false, gameScriptsChecked=false, loadGateOpen=false;
function loadGateSwallow(e){ e.stopImmediatePropagation(); }
for(const t of LOAD_GATE_EVENTS) window.addEventListener(t, loadGateSwallow, {capture:true, passive:true});
// Which script an error came from: a <script> that failed to load is the event's target; a script that threw
// while running is still document.currentScript while its error is reported, which also covers file://, where
// an error from another file has its details (and its filename) hidden.
function isGameScriptError(e){
  const base=location.href.replace(/[?#].*$/,"").replace(/[^/]*$/,"")+"js/";
  const t=e.target, cs=document.currentScript;
  const src=(t && t.tagName==="SCRIPT") ? t.src : ((cs && cs.src) || e.filename || "");
  return typeof src==="string" && src.startsWith(base); }
window.addEventListener("error", e=>{ if(!gameScriptsChecked && isGameScriptError(e)) gameScriptFailed=true; }, true);
// js/boot.js asks exactly once, as its first act. From then on the load is over, and an error is an ordinary
// runtime error: a boot that throws part-way leaves the game running, as the single script's tail used to.
function gameScriptsLoaded(){ gameScriptsChecked=true; return !gameScriptFailed; }
function openLoadGate(){ if(loadGateOpen) return; loadGateOpen=true;
  for(const t of LOAD_GATE_EVENTS) window.removeEventListener(t, loadGateSwallow, {capture:true}); }
// Every game script has run by DOMContentLoaded (they are all parser-blocking), whether or not one of them threw.
document.addEventListener("DOMContentLoaded", ()=>{ if(gameScriptsChecked && !gameScriptFailed) openLoadGate(); });
