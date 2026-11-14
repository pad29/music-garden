// ---------- The cursor: WHERE in time (2026-07-27 redesign) ----------
// A stake on the strip under the field. Play starts here; ＋/－ column surgery works here —
// one column per press, no selection needed. The Scoop stays purely about SEEDS.
// The cursor moves for two different reasons and they must not be treated alike. It follows your HAND when you
// plant (incidental), and it is PINNED when you put it somewhere deliberately — the strip or the arrow keys.
// ▶ starts at the pin if there is one and at loopStart otherwise, so plain ▶ still plays the whole path even
// though planting now moves the cursor. Planting clears the pin, because once you are editing elsewhere that
// intent is stale. Consequence the owner accepted: play-from-here becomes a deliberate gesture, not the default.
let cursorCol=0, cursorPinned=false;
// The loop's return point. A VARIABLE rather than a hardcoded 0 so Phase 2's loop range is this gaining a UI
// rather than a rewrite. It used to be the cursor, which the owner never wanted ("I never actually needed
// looping back to the cursor") and which also meant nudging the cursor mid-song silently moved the wrap point.
let loopStart=0, loopEnd=0;                 // loopEnd 0 = "to the end of the field" = exactly today
const rangeOn=()=>loopEnd>0;
const loopA=()=>Math.max(0,Math.min(COLS-1,loopStart));
// Exclusive, and never <= loopA: loopStart>=loopEnd would turn the wrap into an infinite tight loop on a
// single column. Unmetered both reduce to 0 and COLS, so the pump's test below is byte-identical to the
// `bookCol>=COLS` it replaces.
const loopB=()=>Math.max(loopA()+1, Math.min(COLS, loopEnd||COLS));
// A range is a way of LISTENING, not part of the song — like the field zoom, which resetTransient returns
// to 1.0 and never writes to Store. It is not in snapState, not in currentSong, and never shared.
function clearLoopRange(){ loopStart=0; loopEnd=0; if(typeof renderBars==="function") renderBars(); }
const cursorStripEl=document.getElementById("cursorStrip"), cursorKnobEl=document.getElementById("cursorKnob"),
      cursorColEl=document.getElementById("cursorCol");
function syncCursor(){ cursorCol=Math.max(0,Math.min(COLS-1,cursorCol));
  cursorStripEl.style.width=(COLS*38+16)+"px";               // match the grid: 10px pad ×2 + cols×38 − last gap
  const x=10+cursorCol*38;
  cursorKnobEl.style.left=x+"px"; cursorColEl.style.left=x+"px";
  if(drumCursorEl){ drumCursorEl.style.left=x+"px";          // the beat lane carries the same slot — and now at the SAME x, since the labels moved out of the bed and the two beds share a left edge
    const a=dcells[0]&&dcells[0][0], z=dcells[DRUMS.length-1]&&dcells[DRUMS.length-1][0];
    if(a&&z&&z.offsetHeight){ drumCursorEl.style.top=(a.offsetTop-4)+"px";        // measure the real pads: a round pad needs the frame to clear it, not sit on its edge
      drumCursorEl.style.height=(z.offsetTop+z.offsetHeight-a.offsetTop+8)+"px"; } } }
function setCursor(c){ cursorCol=Math.max(0,Math.min(COLS-1,c)); syncCursor(); }
function pinCursor(c){ cursorPinned=true; setCursor(c); }    // deliberate: the strip, the arrow keys — ▶ will honour it
function followCursor(c){ cursorPinned=false; setCursor(c); }  // incidental: your hand just worked here, so the tools should too
function stripCol(e){ const b=cursorStripEl.getBoundingClientRect();
  return Math.floor(((e.clientX-b.left)/zoomOf()-10)/38); }   // divide BEFORE subtracting the pad — it is a field-pixel quantity
// The chip band is the top 16 field-px of the rail, and exists only when the song has a meter. §17's
// first slice wants bar numbers and a loop range on this rail, and this rail is also the only place they
// are SAFE: #cursorStrip already carries touch-action:none, the inverse-zoom sizing, armPinch's own
// exclusion, and the single pointer latch camBusy() reads. A separate ruler inside .scroller would have
// inherited none of that and become pinch-eligible on the first two-finger gesture.
function inChipBand(e){ if(!meterAt()) return false;
  const b=cursorStripEl.getBoundingClientRect();
  // VIEWPORT px, deliberately NOT divided by the zoom — the same rule the marquee's tap test and the
  // vine pull's arming threshold already follow. The band is sized `calc(16px / var(--fz))` INSIDE a
  // zoomed container, so it is 16 VISUAL px at every stop; dividing here compared a field-px offset
  // against a visual-px height and, measured at zoom 0.6, dropped the band's bottom 40% through to the
  // cursor rail — a chip tap at 14px became a cursor move.
  return (e.clientY-b.top) < 16; }
function cursorFromEvent(e){ pinCursor(stripCol(e)); }   // putting the stake down by hand IS the deliberate act
function barSegAt(col){ for(const s of meterLayout(COLS,meterAt()).segs)
  if(col>=s.c0 && col<s.c0+s.cols) return s;
  return null; }
function applyRange(a,b){ loopStart=Math.min(a.c0,b.c0);
  loopEnd=Math.max(a.c0+a.cols, b.c0+b.cols);
  // Choosing bars to loop IS asking for them to loop. Without this the pump's `if(!looping)` played the
  // selection once and stopped, while the chip sat there lit green and named .inloop.
  if(!looping){ looping=true; loopBtn.classList.add("on"); }
  renderBars(); }
let rangeAnchor=null, rangeBefore=null;
// ONE delegated state machine, and the mode is decided ONCE at pointerdown and held for the whole
// gesture: a drag that starts on a chip stays a range drag even when the finger wanders down onto the
// rail, and a cursor drag stays a cursor drag when it wanders up. Deciding per-move is how one drag
// becomes two half-gestures. Pointer capture retargets moves to the strip, so the chip under the finger
// is found by COORDINATE rather than by event target.
cursorStripEl.addEventListener("pointerdown",e=>{ e.preventDefault();
  if(cursorStripEl._drag) return;      // a SECOND finger must not overwrite the live gesture's mode and anchor
  try{ cursorStripEl.setPointerCapture(e.pointerId); }catch(err){}
  cursorStripEl._drag=true; cursorStripEl._moved=false; cursorStripEl._pid=e.pointerId;
  cursorStripEl._x=e.clientX; cursorStripEl._y=e.clientY;
  cursorStripEl._mode = inChipBand(e) ? "range" : "cursor";
  if(cursorStripEl._mode==="cursor"){ cursorFromEvent(e); return; }   // …and KEEPS bubbling: tap-to-return from the rail is shipped behaviour
  // A chip tap stops here. Excluding it inside armZoomTap by `e.target.closest("#barchips")` was not
  // enough and the reason is worth keeping: this handler re-renders the chips, so by the time the event
  // reached #scroller its own target had been REPLACED and `closest` on a detached node returns null.
  // Measured: the tap set the range and still zoomed. The guard in armZoomTap stays as well — it is
  // correct whenever the node survives — but the event not arriving at all is what actually settles it.
  e.stopPropagation();
  rangeBefore=[loopStart,loopEnd]; rangeAnchor=barSegAt(stripCol(e));
  if(rangeAnchor) applyRange(rangeAnchor,rangeAnchor); });
cursorStripEl.addEventListener("pointermove",e=>{
  if(!cursorStripEl._drag || e.pointerId!==cursorStripEl._pid) return;
  // 8px of slop, the same figure armZoomTap and the vine pull already use. Without it a single pixel of
  // finger jitter counted as a drag, and "tap the lit bar again to release the loop" was unreachable on
  // touch — which is the only place the release gesture is actually needed.
  if(Math.hypot(e.clientX-cursorStripEl._x, e.clientY-cursorStripEl._y)>8) cursorStripEl._moved=true;
  if(cursorStripEl._mode==="range"){ const s=rangeAnchor && barSegAt(stripCol(e)); if(s) applyRange(rangeAnchor,s); }
  else cursorFromEvent(e); });
function stripUp(e){
  // Scoped to the finger that STARTED it: with two on the rail, the first release used to drop
  // camBusy()'s only latch while the second was still dragging, handing the camera back mid-gesture.
  if(e && e.pointerId!==undefined && cursorStripEl._pid!==null && e.pointerId!==cursorStripEl._pid) return;
  // Tapping the bar that IS the whole loop releases it — one gesture both ways, so a child never has to
  // hunt for a second control to stop looping. Only on a TAP: a drag that happens to end where it began
  // is still a drag, and must not undo itself.
  if(cursorStripEl._mode==="range" && !cursorStripEl._moved && rangeAnchor && rangeBefore
     && rangeBefore[0]===rangeAnchor.c0 && rangeBefore[1]===rangeAnchor.c0+rangeAnchor.cols) clearLoopRange();
  cursorStripEl._drag=false; cursorStripEl._mode=null; cursorStripEl._pid=null;
  rangeAnchor=null; rangeBefore=null; }
cursorStripEl.addEventListener("pointerup",stripUp);
cursorStripEl.addEventListener("pointercancel",stripUp);
// ---- drawing: chips on the rail, lines over BOTH beds, every one of them from the same layout ----
// getElementById rather than the module consts, because rebuildField can run during load, before those
// consts have initialised — a bare reference would be a temporal-dead-zone throw at startup.
function renderBars(){
  const m=meterAt(), L=meterLayout(COLS,m);
  document.body.classList.toggle("metered", !!m);
  const fill=host=>{ if(!host) return; host.innerHTML="";
    for(const k of L.marks){ const d=document.createElement("div");
      d.className = k.kind==="bar" ? "bl" : "bt";
      d.style.left=(10+k.c*38-1)+"px"; host.appendChild(d); } };
  fill(document.getElementById("barlines"));
  fill(drumBarsEl);
  const strip=document.getElementById("cursorStrip"); if(!strip) return;
  let chips=document.getElementById("barchips");
  if(!chips){ chips=document.createElement("div"); chips.id="barchips"; strip.appendChild(chips); }
  const a=loopStart, b=loopEnd;                       // read once: the chips must agree with each other
  const lit=d=>{ const c0=+d.dataset.c0, w=+d.dataset.cols;
    d.classList.toggle("inloop", b>0 && c0>=a && c0+w<=b); };
  // REBUILD only when the bars themselves changed. A range drag re-renders on every pointermove, and
  // replacing the chips underneath a live gesture detaches the very node the event is travelling from —
  // which is what defeated armZoomTap's exclusion above. Retinting in place also stops the whole rail
  // being rebuilt dozens of times during one drag.
  const key=L.segs.map(sg=>sg.c0+":"+sg.cols+":"+sg.n).join("|");
  if(chips.dataset.key!==key){ chips.dataset.key=key; chips.innerHTML="";
    for(const sg of L.segs){ const d=document.createElement("div"); d.className="barseg";
      d.dataset.c0=sg.c0; d.dataset.cols=sg.cols;
      d.style.left=(10+sg.c0*38)+"px"; d.style.width=Math.max(0,sg.cols*38-2)+"px";
      d.textContent = sg.pickup ? "" : String(sg.n);  // the pickup is bar 0 and stays unnumbered
      chips.appendChild(d); } }
  for(const d of chips.children) lit(d);
}
// seeds and beat are ONE timeline: two independent scrollers could hold different columns under the same
// cursor (and playback's auto-scroll only ever moved the seed lane). Mirror them, with a re-entrancy guard.
// ---- the ☰ menu (world map / mix / save / share / jukebox / read-aloud) ----
const sideToggle=document.getElementById("sidetoggle"), sideTools=document.getElementById("sidetools");
function setSideMenu(open){ sideTools.hidden=!open; sideToggle.classList.toggle("on",open);
  sideToggle.setAttribute("aria-expanded", open?"true":"false"); }
sideToggle.addEventListener("click",e=>{ e.stopPropagation(); setSideMenu(sideTools.hidden); });
sideTools.addEventListener("click",()=>setSideMenu(false));      // picking anything closes the menu behind you
document.addEventListener("pointerdown",e=>{                     // …and so does a tap anywhere else
  if(!sideTools.hidden && !sideTools.contains(e.target) && !sideToggle.contains(e.target)) setSideMenu(false); });

// the fixed top-right buttons sit OUTSIDE the document flow, so nothing insets them past the page
// scrollbar — measure it and let CSS subtract it. Re-measured on resize (zoom changes the bar's width).
function syncScrollbarWidth(){ const w=window.innerWidth-document.documentElement.clientWidth;
  document.documentElement.style.setProperty("--sbw", Math.max(0,w)+"px"); }
syncScrollbarWidth(); window.addEventListener("resize",()=>{ syncScrollbarWidth(); camReseed(); });   // a resize changes how many columns fit — the camera's whole geometry
let _scrollSync=false;
[["scroller","drumArea"],["drumArea","scroller"]].forEach(([a,b])=>{
  const A=document.getElementById(a), B=document.getElementById(b); if(!A||!B) return;
  A.addEventListener("scroll",()=>{ if(_scrollSync) return;
    _scrollSync=true;                                   // clear it SYNCHRONOUSLY — a throttled tab may never run a rAF,
    if(B.scrollLeft!==A.scrollLeft) B.scrollLeft=A.scrollLeft;   // and a stuck flag would silently unlock the lanes forever.
    _scrollSync=false; });                              // the reflected event then finds the lanes equal and stops there
});
// A display:none element cannot hold a scrollLeft and fires no scroll event, so the mirror above cannot repair
// the beat lane by itself: every path that reveals it has to hand it the field's position back, or the two
// lanes show different columns under one cursor the moment the field is scrolled.
function showDrumArea(on){ const st=document.getElementById("drumStage");
  if(st) st.style.display=on?"flex":"none";                 // the STAGE toggles now — the labels have to come and go with the pads
  if(on) drumArea.scrollLeft=scroller.scrollLeft; }
// one column of surgery per press, at the cursor — melody AND beat move together
document.getElementById("colPlus").onclick=()=>{ if(traySurgeryBlocked()) return;
  if(!fieldCanGrow(1)) return;                              // the same ceiling ＋ more stops at (TUN-84)
  if(playing) stop();
  modelInsertTime(cursorCol*TICKS_PER_COL, TICKS_PER_COL);
  rebuildField(); applyStageDecor(); trayPaint(); ev.played=false; checkLevel();
  setStatus("＋ Room for one more step, right at the cursor 🌱 (everything after slid along, beat too). Press again for more — undo brings it back."); };
document.getElementById("colMinus").onclick=()=>{ if(traySurgeryBlocked()) return;
  if(COLS<=16){ setStatus("The field is at its smallest 🌱 — one bar always stays."); return; }
  if(playing) stop();
  modelRemoveTime(cursorCol*TICKS_PER_COL, TICKS_PER_COL);
  rebuildField(); applyStageDecor(); trayPaint(); ev.played=false; checkLevel();
  setStatus("－ The cursor's step closed up ✂ (the rest pulled together, beat too). Undo brings it back."); };

