// ---------- Grid ----------
const gridEl=document.getElementById("grid"), scroller=document.getElementById("scroller");
const cells=[];
function buildGrid(){
  gridEl.style.gridTemplateColumns=`repeat(${COLS},34px)`; gridEl.innerHTML="";
  for(let r=0;r<ROWS;r++){ cells[r]=[];
    for(let c=0;c<COLS;c++){
      const el=document.createElement("div");
      el.className="cell"+(isTonic(r)?" tonicRow":"")+(grid[r][c]?" on":"");
      el.dataset.note=NOTE_NAMES[((MIDI[r]%12)+12)%12];   // letter name for the hover tooltip (no octave clutter)
      el.addEventListener("mousedown",()=>cellClick(r,c,el));
      gridEl.appendChild(el); cells[r][c]=el;
    }
  }
}
buildGrid();
// ---- hover tooltip: show a cell's note name only after the cursor pauses on it (requirement #6) ----
let noteTipEl=null, noteTipTimer=null;
function hideNoteTip(){ if(noteTipTimer){ clearTimeout(noteTipTimer); noteTipTimer=null; }
  if(noteTipEl){ noteTipEl.remove(); noteTipEl=null; } }
gridEl.addEventListener("mouseover",e=>{ const cell=e.target.closest(".cell"); if(!cell||!cell.dataset.note){ hideNoteTip(); return; }
  hideNoteTip();                                                              // entering a (new) cell: clear any tip/timer
  noteTipTimer=setTimeout(()=>{                                               // ~450ms pause → name appears (not while sweeping across)
    const b=cell.getBoundingClientRect();
    noteTipEl=document.createElement("div"); noteTipEl.className="notetip"; noteTipEl.textContent=cell.dataset.note;
    noteTipEl.style.left=(b.left+b.width/2)+"px"; noteTipEl.style.top=(b.top-6)+"px";
    document.body.appendChild(noteTipEl); }, 450); });
gridEl.addEventListener("mouseleave",hideNoteTip);                            // left the field entirely
scroller.addEventListener("scroll",hideNoteTip);                              // don't leave a stale tip when the field scrolls
// ---------- The camera: one law for following the playhead AND the cursor ----------
// What was here before was a fixed 16-column page-turn that assumed the viewport was exactly 16 columns wide.
// It never is — 19 columns at 1280px, 6.9 on a 390px phone — so on a phone the playhead was off-screen for
// nine columns out of every sixteen. On desktop it wrote to a scroller that could not scroll at all (see .main
// in the CSS), so nothing followed anything, and cursorIntoView was dead the day it was written. One function
// now, so the cursor and the playhead can never disagree about what "in view" means.
// W/SW are CACHED, not read per column: camEnsure runs from paintCol, which has just dirtied layout by adding
// .col-playing to a column of cells, so a live clientWidth read would force a reflow on every step of every
// song. Only two things can change them — the box (ResizeObserver) and the field's length (camReseed).
const CAM={ expect:0, raf:0, yielded:false, W:0, SW:0 };
function camMeasure(){ CAM.W=scroller.clientWidth; CAM.SW=scroller.scrollWidth; }
function camGeom(){ const W=CAM.W||scroller.clientWidth, S=Math.max(0,(CAM.SW||scroller.scrollWidth)-W);
  const vis=Math.max(1,Math.floor((W-TRAY_PAD)/TRAY_CW));      // geometry is READ, never assumed: ＋room, a palette
  return { W, S, vis,                                          // swap and a window resize each change it
    behind:Math.max(1,Math.round(vis*0.20)),                   // keep this much of where we came from…
    ahead: Math.max(2,Math.round(vis*0.30)) }; }               // …and this much of where we are going
// A live gesture always wins. Correctness, not manners: the vine pull measures against the FIELD, so a field
// that slid under a held finger would lengthen a note nobody dragged.
let pinch=null;                        // declared up here so camBusy() below can never read it in the temporal dead zone
function camBusy(){ return !!(pull || trayDrag || trayPtrs.size || cursorStripEl._drag || pinch); }
function camStop(){ if(CAM.raf){ cancelAnimationFrame(CAM.raf); CAM.raf=0; playhead.style.transition=""; } }
function camReseed(){ camMeasure(); CAM.expect=scroller.scrollLeft; camEdges(); }   // after ±room or a rebuild, the browser's own clamp is not the child
// ---------- Zoom: step back to see a tall palette whole ----------
// Read LIVE from the DOM rather than trusted from a variable: offsetWidth is layout px and getBoundingClientRect
// is visual px, so their ratio IS the zoom — and on a browser that ignores `zoom` the ratio is 1 and every
// conversion below degrades to a true no-op instead of silently doubling.
const zoomOf=()=>{ const w=gridEl.offsetWidth; return w ? gridEl.getBoundingClientRect().width/w : 1; };
const ZOOM_PLANT=0.8, ZOOM_LOOK=0.6;   // 0.8 = 27x24px cells, the last EDITABLE stop (24px is the target floor); 0.6 = 20x18, look-only
const ZOOM_STOPS=[1, ZOOM_PLANT, ZOOM_LOOK];
let fieldZoom=1;
// Below the midpoint the squares are 20x18 and a fingertip covers three of them: the field becomes something to
// LOOK at. Everything that aims at a square asks this first, so "look-only" is one fact, not a class name copied around.
const lookOnly=()=>fieldZoom<0.7;
// …and a tap that zooms us back IN must not also leave a seed. Planting fires on mousedown, the tap on pointerup —
// and on TOUCH the browser's synthesized mousedown arrives AFTER pointerup, by which time the zoom has already
// changed and lookOnly() is false again. So the tap books a swallow for exactly ONE mousedown: its own.
// One-shot, not a dead window — the child's very next press plants at once, which is what lets the deadline be
// generous enough to survive a main thread too busy to synthesize on time. A mouse never needs it at all.
let swallowTapUntil=0;
const zoomBlocksEdit=()=>{ if(lookOnly()) return true;
  if(swallowTapUntil && performance.now()<swallowTapUntil){ swallowTapUntil=0; return true; }
  return false; };
// Tap the look-only garden to step back in far enough to work — a child who is stuck small must never have to
// find the menu again. Only from look-only, and only as far as ZOOM_PLANT: at a stop where you CAN plant, a tap is
// a plant. Returning to full size stays the 🔍 button's job, never a stray finger's.
// One finger, one bed, and NO clock. A pan travels (>8px); a pinch brings a second finger; and Chrome fires
// pointercancel the moment it takes the touch over for its own scrolling — each of those disarms, and disarming
// must release the listener or a stale closure revives on somebody else's pointerup. What is left is a press that
// went nowhere: a child's careful slow press has to count exactly as much as a quick one.
let zoomTap=null;                      // the single pointer we are watching — shared across BOTH beds
function zoomTapDrop(){ if(!zoomTap) return;
  zoomTap.el.removeEventListener("pointerup",zoomTap.end);
  zoomTap.el.removeEventListener("pointercancel",zoomTap.end);
  zoomTap=null; }
function armZoomTap(el){ if(!el) return;
  el.addEventListener("pointerdown",e=>{
    // A bar chip is a CONTROL, not garden to tap your way back from. #cursorStrip is a child of #scroller
    // and its handler calls preventDefault but not stopPropagation, so without this a chip tap at
    // look-only zoom both set the loop range AND zoomed back in. Only the chip band is excluded: tapping
    // the stake's rail still returns you to editing size, which is shipped behaviour.
    if(e.target && e.target.closest && e.target.closest("#barchips")) return;
    if(zoomTap){ zoomTapDrop(); return; }      // a second finger is down: pan or pinch, never a tap
    if(!lookOnly()||trayMode) return;          // (while a pick is armed the Scoop owns the pointer)
    const t={ el, id:e.pointerId, x:e.clientX, y:e.clientY, touch:e.pointerType!=="mouse" };
    t.end=u=>{ if(u.pointerId!==t.id) return;
      const tap = u.type==="pointerup" && Math.hypot(u.clientX-t.x,u.clientY-t.y)<=8;
      zoomTapDrop();
      if(!tap) return;
      initAudio(); actx.resume();              // a child's first gesture is too precious to spend without unlocking sound
      if(t.touch) swallowTapUntil=performance.now()+900;
      setFieldZoom(ZOOM_PLANT); };
    zoomTap=t;
    el.addEventListener("pointerup",t.end);
    el.addEventListener("pointercancel",t.end); }); }
// ---------- Pinch: two fingers walk the same ladder the 🔍 button walks ----------
// Only the two BEDS. They are the only elements carrying `touch-action: pan-x pan-y`, which is what stops the
// browser page-zooming a touch that starts there; #fieldbar is an absolutely positioned SIBLING of #scroller,
// not a descendant, so a finger on the rail is still the browser's to scale.
// Best-effort on purpose. Chrome makes touchmove non-cancelable the moment it has begun scrolling, and no
// amount of preventDefault takes a gesture back after that — so when we cannot have it we let go completely
// rather than own half of it. And we never preventDefault the touchSTART, which leaves the synthesized
// mousedown that planting rides on exactly as it was.
const PINCH_IN=1.22, PINCH_OUT=0.82, PINCH_MIN=32, PINCH_CLAIM=10;
// Which way are the two fingers going? This is the whole difference between a pinch and a pan, and it is
// readable within a few pixels — which matters, because preventing the FIRST touchmove is the only moment
// the gesture can still be taken. Comparing spread against how far the midpoint has moved is not good
// enough: at the start of a pan the midpoint has barely moved either, so finger wobble reads as a pinch,
// the first move gets prevented, and Chrome cancels scrolling for the whole gesture. That is a pan that
// does nothing at all, which is exactly what the Pixel reported.
function movingTogether(d1, d2){
  const m1=Math.hypot(d1.x,d1.y), m2=Math.hypot(d2.x,d2.y);
  if(m1<6 || m2<6) return false;                     // one finger resting while the other slides is a fine pinch
  return (d1.x*d2.x + d1.y*d2.y)/(m1*m2) > 0.5; }    // both travelling the same way: a PAN, and it stays one   // ratio each way, plus an absolute floor so a narrow grip
                                                     // cannot trip on jitter and a wide one need not travel absurdly
// Pure, so the arithmetic is testable without a browser (the harness has no touches).
function nextPinchStop(cur, ratio){                  // which stop a spread ratio selects, or null for "not decisive"
  if(ratio<PINCH_IN && ratio>PINCH_OUT) return null;
  const i=ZOOM_STOPS.indexOf(cur), at=(i<0?0:i);
  const next = ratio>=PINCH_IN ? at-1 : at+1;        // ZOOM_STOPS is [1, .8, .6] — index 0 IS full size, so IN means DOWN
  return (next>=0 && next<ZOOM_STOPS.length) ? ZOOM_STOPS[next] : null; }
function anchoredScroll(sl, cx, left, z, left2, z2){ // keep the field point under the fingers where it is
  return (sl + (cx-left)/z) - (cx-left2)/z2; }       // scrollLeft is FIELD px under CSS zoom; rect.left is VISUAL px
const pinchDist=p=>Math.hypot(p[0].clientX-p[1].clientX, p[0].clientY-p[1].clientY);
function pinchEligible(t){                           // a bed, and not a control that already owns its own pointer
  const el=t&&t.target;
  if(!el||typeof el.closest!=="function") return false;
  if(el.closest("#cursorStrip")||el.closest(".grip")) return false;
  return !!(el.closest("#scroller")||el.closest("#drumArea")); }
function pinchPair(e){                               // OUR two touches — e.touches is document-wide, so filter it
  const out=[]; for(const t of e.touches) if(pinchEligible(t)) out.push(t);
  return out.length===2 ? out : null; }
function pinchDrop(){ if(!pinch) return;             // idempotent: every exit, including the ones with no touchend
  const moved=!!(pinch.done||pinch.moved);           // two fingers that only RESTED changed nothing —
  if(pinch.el && pinch.move) pinch.el.removeEventListener("touchmove", pinch.move);
  pinch=null;
  camReseed();                                       // the anchor moved the box out from under CAM.expect
  if(moved) CAM.yielded=true; }                      // …so only a real zoom takes the camera off the playhead
function pinchZoom(z2, cx){
  const z=zoomOf(), r=scroller.getBoundingClientRect();      // the LIVE zoom, never the requested one: on a browser
  const sl=scroller.scrollLeft;                              // that ignores `zoom` both reads are 1 and this is a no-op
  setFieldZoom(z2);                                          // (its own camEnsure is inert - camBusy() sees the pinch)
  const r2=scroller.getBoundingClientRect();
  scroller.scrollLeft=anchoredScroll(sl, cx, r.left, z, r2.left, zoomOf());   // the browser clamps at both ends for us
  camReseed(); }
function armPinch(el){ if(!el) return;
  const move=e=>{
    if(!pinch) return;                               // the cheap exit: this is every one-finger scroll
    const p=pinchPair(e);
    if(!p || !pinch.ids.includes(p[0].identifier) || !pinch.ids.includes(p[1].identifier)){ pinchDrop(); return; }
    const q = p[0].identifier===pinch.ids[0] ? p : [p[1],p[0]];   // same order as the start positions
    const d1={x:q[0].clientX-pinch.s0[0].x, y:q[0].clientY-pinch.s0[0].y};
    const d2={x:q[1].clientX-pinch.s0[1].x, y:q[1].clientY-pinch.s0[1].y};
    const d=pinchDist(p), spread=Math.abs(d-pinch.d0);
    const cx=(q[0].clientX+q[1].clientX)/2;
    const together=movingTogether(d1,d2);
    // Two fingers are doing one of two things, and the garden owns BOTH. A phone reported two-finger
    // panning doing nothing at all — neither zoom nor scroll — and a bed that says `pan-x pan-y` has
    // already told the browser it may not pinch there, so two fingers can fall between the two and move
    // nothing. Rather than work out whose fault that is, the garden moves itself, the way the Scoop
    // already does for its own two-finger pan.
    if(!together && spread<PINCH_CLAIM) return;      // still ambiguous — nobody owns it yet
    // Whether Chrome will still let go of the scroll decides who PANS, and nothing else. Abandoning the
    // whole gesture here is what made both pinch and two-finger pan do nothing at all on the phone — and a
    // zoom never needed the browser's permission in the first place. So: take the scroll when it is offered,
    // and zoom either way.
    const took=e.cancelable;
    if(took) e.preventDefault();
    if(together){
      if(!took) return;                              // Chrome kept the scroll, so it is already panning: do not double-move
      scroller.scrollLeft -= (cx-pinch.lastCx)/zoomOf();   // scrollLeft is FIELD px, the finger is viewport px
      pinch.lastCx=cx; pinch.moved=true;             // (the beat lane mirrors this scroller on its own)
      camReseed(); return; }
    if(pinch.done || spread<PINCH_MIN) return;
    const z2=nextPinchStop(fieldZoom, d/pinch.d0);
    if(z2==null) return;
    pinchZoom(z2, cx);
    pinch.lastCx=cx;                                 // a pinch that becomes a pan must not jump on its first drag
    pinch.done=true; };                              // ONE stop per gesture: two is not reachable one-handed on a phone
  // The listener is born when the SECOND finger lands, and dies with the gesture. Registering it at load
  // instead was tried on a Pixel 10a and was strictly worse: a blocking listener present from the first
  // finger down makes Chrome ask the main thread on the very first move, we decline to prevent it (one
  // finger is a scroll), Chrome commits to scrolling, and every later move of that sequence is
  // non-cancelable — so the second finger arrives into a gesture already spoken for. Both pinch and
  // two-finger pan did nothing at all. Born late, the listener is what makes Chrome reconsider.
  // One-finger scrolling therefore never has a blocking listener, which is also why it stayed smooth.
  el.addEventListener("touchstart",e=>{
    // ANY contact arriving mid-gesture ends it — including one we filter out. #cursorStrip and the grips
    // live INSIDE #scroller, so a third finger there bubbles here, and re-arming on the surviving pair
    // would hand the gesture a fresh one-stop budget.
    if(pinch){ pinchDrop(); return; }
    if(trayMode || pull || cursorStripEl._drag===true) return;   // the Scoop, a vine being pulled, and the stake each own their own fingers
    const p=pinchPair(e);
    if(!p) return;                                   // one finger, or a touch off the beds: not ours
    pinch={ el, move, d0:pinchDist(p), done:false, moved:false,
            lastCx:(p[0].clientX+p[1].clientX)/2,
            ids:[p[0].identifier, p[1].identifier],
            s0:[{x:p[0].clientX,y:p[0].clientY},{x:p[1].clientX,y:p[1].clientY}] };
    el.addEventListener("touchmove",move,{passive:false}); },{passive:true});
  el.addEventListener("touchend",e=>{ if(pinch && !pinchPair(e)) pinchDrop(); },{passive:true});
  el.addEventListener("touchcancel",()=>pinchDrop(),{passive:true}); }
  //  ^ cancellation is TERMINAL. Chrome may still list the pair in e.touches, so a remaining-touch test
  //    would leave the gesture armed — and an armed pinch holds camBusy() true for the rest of the level.
// A gesture can end without a touchend — a phone call, the app backgrounded. Left armed, `pinch` would make
// camBusy() true forever and the camera would never move again for the rest of the level.
document.addEventListener("visibilitychange",()=>{ if(document.hidden) pinchDrop(); });
window.addEventListener("pagehide",pinchDrop);
window.addEventListener("blur",pinchDrop);
function setFieldZoom(z){
  fieldZoom=z;
  const fc=document.querySelector(".fieldcol"); if(fc) fc.style.setProperty("--fz", z);
  document.body.classList.toggle("lookonly", lookOnly());
  const lab=document.getElementById("zoomLabel");   // the menu label and the lit button live HERE, not at the call sites —
  if(lab) lab.textContent = z===1 ? "Whole garden: off" : "Whole garden: "+Math.round(z*100)+"%";   // a level change resets the zoom too
  const b=document.getElementById("zoomBtn"); if(b) b.classList.toggle("on", z!==1);
  syncCursor();                        // the stake's own size is 1/z, so it has to be re-laid out
  camReseed();                         // MANDATORY: the ResizeObserver on .scroller never fires for a zoom —
  camEnsure(playing?step:cursorCol,{instant:true});   // the box keeps its layout size, only its scale changes
  setStatus(z===1 ? "🔍 Back to full size — plant away."
    : lookOnly() ? "🔍 The whole garden, small. Lovely for listening — <b>tap the garden</b> when you want to plant again."
            : "🔍 Stepped back a little. You can still plant and pull vines here.");
}
function cycleZoom(){ const i=ZOOM_STOPS.indexOf(fieldZoom);
  setFieldZoom(ZOOM_STOPS[(i<0?0:i+1)%ZOOM_STOPS.length]); }
const stageEl=document.querySelector(".stage");
function camEdges(){ if(!stageEl) return;                      // the hidden scrollbars' replacement: light an edge only where there IS more
  const sl=scroller.scrollLeft, max=scroller.scrollWidth-scroller.clientWidth;
  stageEl.classList.toggle("moreleft", sl>1);
  stageEl.classList.toggle("moreright", sl<max-1); }
function camTo(x,instant){
  const g=camGeom();
  x=Math.max(0,Math.min(g.S,Math.round(x)));
  camStop();
  const from=scroller.scrollLeft, d=x-from;
  CAM.expect=x; if(!d) return;
  // document.hidden: a hidden tab does not run rAF at all, so a tween started there would never advance and
  // CAM.raf would stay armed forever — which also mutes the take-the-wheel detector below. Jump instead.
  if(instant || document.hidden || Math.abs(d)>g.W){ scroller.scrollLeft=x; return; }   // further than one view reads as a cut, not a pan
  // Hand-rolled, never scrollTo({behavior:"smooth"}): its duration is the browser's to choose, and it emits
  // scroll events the take-the-wheel detector below could not tell apart from a child's finger.
  const dur=Math.min(260, Math.max(120, Math.abs(d)*0.6), Math.max(60, stepDur()*0.9));   // never longer than one column
  const t0=performance.now();
  playhead.style.transition="none";                            // ONE clock — the blue bar must not ease while the field eases
  const frame=now=>{ const k=Math.min(1,(now-t0)/dur), e=1-Math.pow(1-k,3);
    scroller.scrollLeft=Math.round(from+d*e);
    if(k<1){ CAM.raf=requestAnimationFrame(frame); return; }
    CAM.raf=0; scroller.scrollLeft=x; CAM.expect=x; playhead.style.transition=""; };
  CAM.raf=requestAnimationFrame(frame); }
function camEnsure(col,opts){
  opts=opts||{};
  if(camBusy()) return;
  const g=camGeom(); if(g.S<=0){ camReseed(); return; }         // the whole song fits — there is nothing to follow
  const x=TRAY_PAD+col*TRAY_CW, sl=scroller.scrollLeft;         // same origin as playhead.style.left, so no 10px drift
  const inView = x-TRAY_CW*g.behind>=sl && x+TRAY_CW*(1+g.ahead)<=sl+g.W;
  // Hand-back is NOT on a timer. A timeout expires exactly when the child has stopped to look, and by then the
  // playhead may be a whole screen away — so resuming reads as a teleport, and repeats every few seconds. The
  // camera waits until the music comes back to where they are looking, or until they press something.
  if(CAM.yielded){ if(!inView) return; CAM.yielded=false; }
  if(inView) return;
  let want=TRAY_CW*(col-g.behind);
  for(const q of [TRAY_CW*8, TRAY_CW*4, TRAY_CW]){              // land on a musical boundary, not on the minimum fix:
    const s=Math.floor(want/q)*q;                               // six moves across a 66-column song instead of forty-eight
    if(x+TRAY_CW*(1+g.ahead) <= s+g.W){ want=s; break; } }
  camTo(want, !!opts.instant); }
// The child is detected by DISAGREEMENT — any scroll position that is not the one we last asked for is theirs.
// Our own tween is exempt (it records its landing value when it lands), and the beat lane mirroring us arrives
// here as an equal value, so the sync never registers as a person.
// The field's box can change without a scroll and without a rebuild — an overlay closing, the sidebar
// appearing, a palette swap — and the edges would keep whatever they were told last. Observe the box itself.
if(window.ResizeObserver) new ResizeObserver(()=>{ camMeasure(); camEdges(); }).observe(scroller);
scroller.addEventListener("scroll",()=>{ camEdges();
  if(CAM.raf) return;
  if(Math.abs(scroller.scrollLeft-CAM.expect)<=2) return;
  CAM.expect=scroller.scrollLeft; CAM.yielded=true; });
// The vine layer: one stem per held note, drawn over the grid from the tray's own geometry
// (34px cell + 4px gap, 10px pad). Inline left/top/width so it is assertable with no transition running.
const vinesEl=document.getElementById("vines");
const vineLen=n=>Math.max(1,Math.round(n.durationTicks/TICKS_PER_COL));
const stemLeft=c=>TRAY_PAD+c*TRAY_CW+26, stemTop=r=>TRAY_PAD+r*TRAY_CH+8, stemW=L=>(L-1)*TRAY_CW+8;
const gripLeft=(c,L)=>TRAY_PAD+(c+L-1)*TRAY_CW+24;
function renderVines(){ if(!vinesEl) return; vinesEl.innerHTML="";
  const grow=document.body.classList.contains("growing");
  for(const n of melTrack().notes){
    const r=projRow(n.pitch), c=noteCol(n); if(r==null||c<0||c>=COLS) continue;
    const L=Math.min(vineLen(n), COLS-c);
    if(L>1){ const s=document.createElement("div");                 // a plain seed has no stem
      s.className="stem"+(traySel.includes(n.id)?" tsel":""); s.dataset.id=n.id;
      s.style.left=stemLeft(c)+"px";                                // starts inside the seed's right edge, so it reads as growing OUT of it
      s.style.top=stemTop(r)+"px"; s.style.width=stemW(L)+"px";
      vinesEl.appendChild(s); }
    if(grow && !choiceUp()){ const g=document.createElement("div"); g.className="grip"; g.dataset.id=n.id;   // a picker's demo is to be HEARD, not edited
      g.style.left=gripLeft(c,L)+"px"; g.style.top=(TRAY_PAD+r*TRAY_CH)+"px";
      vinesEl.appendChild(g); } } }
