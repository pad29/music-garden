// ---------- Phase 1: the seed tray — select / move / copy / delete / transpose + time surgery ----------
// A one-shot MODE like Fuse (tap-to-plant stays untouched): 🧺 Scoop arms it (button morphs to ✕ Done),
// drag a marquee to pick melody seeds (marquees UNION, a tap toggles one seed), then drag the pick to
// move — vertical = scale-degree transpose, sounded live via the anchor seed. Design-panel rules baked in:
// armed modes must still pan (two fingers pan, the pick survives; in copy-place a drag pans, a tap places),
// locked rows refuse tray drops, horizontal moves never touch true pitch, pointercancel discards.
// Selection = doc note IDs (§4c earning its keep) — it survives moves, resizes, and reprojection.
let trayMode=false, traySel=[];
let trayDrag=null, trayGhosts=[], trayMarqEl=null, trayPlace=null;
const trackEl=document.getElementById("track"), trayBtn=document.getElementById("trayBtn");
const TRAY_CW=38, TRAY_CH=34, TRAY_PAD=10;                 // grid geometry: 34px cell + 4px gap, 10px pad
function trayNotes(){ const t=melTrack(); return traySel.map(id=>t.notes.find(n=>n.id===id)).filter(Boolean); }
function trayCellOf(n){ return {r:projRow(n.pitch), c:noteCol(n)}; }
function trayPaint(){
  document.querySelectorAll(".cell.tsel").forEach(e=>e.classList.remove("tsel"));
  document.querySelectorAll(".dcell.tband").forEach(e=>e.classList.remove("tband"));
  const ns=trayNotes();
  ns.forEach(n=>{ const q=trayCellOf(n); if(cells[q.r]&&cells[q.r][q.c]) cells[q.r][q.c].classList.add("tsel"); });
  if(ns.length && drumsOn){                    // time operations touch the WHOLE column span — show it on the beat lane too
    const cs=ns.map(n=>trayCellOf(n).c), c0=Math.min(...cs), c1=Math.max(...cs);
    for(let d=0;d<DRUMS.length;d++) for(let c=c0;c<=c1;c++) if(dcells[d]&&dcells[d][c]) dcells[d][c].classList.add("tband");
  }
  renderVines();                               // stems follow the pick's highlight
  if(trayMode) trayBtn.textContent = ns.length ? `✕ Done (${ns.length})` : "✕ Done";   // the single exit carries the count
  const dis=!ns.length;
  ["trayCopy","trayDel"].forEach(id=>{ const b=document.getElementById(id); if(b) b.disabled=dis; });
}
function trayPrune(){ if(!traySel.length) return; const t=melTrack();
  traySel=traySel.filter(id=>t.notes.some(n=>n.id===id)); if(trayMode) trayPaint(); }
function clearGhosts(){ trayGhosts.forEach(e=>e.classList.remove("tghost")); trayGhosts=[]; }
function syncCellDOM(){   // repaint .on from the projection without rebuilding DOM (no flicker mid-gesture)
  for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++) if(cells[r]&&cells[r][c]) cells[r][c].classList.toggle("on",grid[r][c]);
  for(let d=0;d<DRUMS.length;d++) for(let c=0;c<COLS;c++) if(dcells[d]&&dcells[d][c]) dcells[d][c].classList.toggle("on",drumG[d][c]);
  renderVines();
}
function trayCommitDone(msg){ clearGhosts(); syncCellDOM(); trayPaint(); ev.played=false; checkLevel(); if(msg) setStatus(msg); }
function enterTray(){ if(trayMode) return; trayMode=true; initAudio(); actx.resume();
  activeTool=null; renderBag();
  trayBtn.classList.add("on"); trayBtn.textContent="✕ Done"; document.body.classList.add("scooping");
  gridEl.classList.add("traymode"); trackEl.classList.add("traymode"); scroller.style.touchAction="none";
  trayPaint(); setStatus("🧺 <b>Scoop</b>: drag a box around seeds to pick them up — then drag the pick to move it, ⧉ Copy, 🗑 Dig up, or 🔨 Fuse it.");
}
function exitTray(){ if(!trayMode) return; trayMode=false; traySel=[]; trayDrag=null; trayPlace=null; trayPtrs.clear();
  clearGhosts(); document.querySelectorAll(".cell.tsel").forEach(e=>e.classList.remove("tsel"));
  renderVines();   // a stem's highlight is baked in from traySel when it is drawn, so emptying the pick must redraw them
                   // too — stripping .cell.tsel alone left a held note's stem outlined after ✕ Done
  document.querySelectorAll(".dcell.tband").forEach(e=>e.classList.remove("tband"));
  if(trayMarqEl){ trayMarqEl.remove(); trayMarqEl=null; }
  trayBtn.classList.remove("on"); trayBtn.textContent="🧺 Scoop"; document.body.classList.remove("scooping");
  gridEl.classList.remove("traymode"); trackEl.classList.remove("traymode"); scroller.style.touchAction="";
}
trayBtn.onclick=()=>{ if(trayMode){ exitTray(); setStatus("Plant seeds 🌱, or 🔨 Fuse to craft."); } else enterTray(); };
function trayGridPos(e){ const b=gridEl.getBoundingClientRect(), z=zoomOf();   // → FIELD px, so trayPosCell, the marquee box and the move ghost all stay in one space
  return {x:(e.clientX-b.left)/z, y:(e.clientY-b.top)/z}; }
function trayPosCell(p){ return { r:Math.max(0,Math.min(ROWS-1,Math.floor((p.y-TRAY_PAD)/TRAY_CH))),
                                  c:Math.max(0,Math.min(COLS-1,Math.floor((p.x-TRAY_PAD)/TRAY_CW))) }; }
function trayMarqUpdate(){ if(!trayMarqEl||!trayDrag) return;
  const x0=Math.min(trayDrag.from.x,trayDrag.to.x), y0=Math.min(trayDrag.from.y,trayDrag.to.y);
  trayMarqEl.style.left=x0+"px"; trayMarqEl.style.top=y0+"px";
  trayMarqEl.style.width=Math.abs(trayDrag.to.x-trayDrag.from.x)+"px";
  trayMarqEl.style.height=Math.abs(trayDrag.to.y-trayDrag.from.y)+"px"; }
function trayAutoScroll(e){ const sb=scroller.getBoundingClientRect();
  if(e.clientX>sb.right-30) scroller.scrollLeft+=14; else if(e.clientX<sb.left+30) scroller.scrollLeft-=14; }
function trayClampD(ns,dr,dc){ const rs=ns.map(n=>trayCellOf(n).r), cs=ns.map(n=>trayCellOf(n).c);
  return [ Math.max(-Math.min(...rs), Math.min(ROWS-1-Math.max(...rs), dr)),
           Math.max(-Math.min(...cs), Math.min(COLS-1-Math.max(...cs), dc)) ]; }
function trayTargetsLocked(ns,dr,dc){ return ns.some(n=>{ const q=trayCellOf(n); return isLockedRow(q.r+dr); }); }
function trayMove(dr,dc,msg){ const ns=trayNotes(); if(!ns.length) return;
  [dr,dc]=trayClampD(ns,dr,dc); if(!dr&&!dc) return;
  if(dr && trayTargetsLocked(ns,dr,dc)){ setStatus("That color isn't awake yet 🔒 — the pick can't land there."); clearGhosts(); return; }
  tx("move",()=>{ const t=melTrack();
    ns.forEach(n=>{ const q=trayCellOf(n);
      if(dr) n.pitch=MIDI[q.r+dr];                          // vertical = scale-degree transpose (snaps a visitor pitch)
      n.startTick=(q.c+dc)*TICKS_PER_COL; });               // horizontal-only moves never touch true pitch
    const seen=new Map();                                   // moved exactly onto a twin seed → they merge (selected one wins)
    for(const n of t.notes){ const k=n.pitch+":"+n.startTick; const p=seen.get(k);
      if(!p) seen.set(k,n); else if(traySel.includes(n.id)&&!traySel.includes(p.id)) seen.set(k,n); }
    t.notes=[...seen.values()]; reproject(); });
  if(dr){ const q=trayCellOf(trayNotes()[0]||{pitch:MIDI[0],startTick:0}); playRow(q.r, actx.currentTime); }
  trayCommitDone(msg); }
// pointer flow: one finger = marquee / move / (in copy-place: tap places, drag pans);
// a SECOND finger = pan — the in-flight gesture cancels but the pick and armed mode survive (spike rule).
const trayPtrs=new Map(); const TRAY_SLOP=8;
function trayCancelGesture(){ if(trayMarqEl){ trayMarqEl.remove(); trayMarqEl=null; } clearGhosts(); trayDrag=null; }
trackEl.addEventListener("pointerdown",e=>{ if(!trayMode) return; e.preventDefault();
  try{ trackEl.setPointerCapture(e.pointerId); }catch(err){}
  trayPtrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(trayPtrs.size>=2){ trayCancelGesture(); return; }      // two fingers: pan mode until a finger lifts
  const p=trayGridPos(e), cell=trayPosCell(p);
  if(trayPlace){ trayDrag={mode:"placetap", from:{x:e.clientX,y:e.clientY}, cell, panned:false}; return; }
  const onSel=trayNotes().some(n=>{ const q=trayCellOf(n); return q.r===cell.r&&q.c===cell.c; });
  if(onSel){ trayDrag={mode:"move", from:cell, d:{r:0,c:0}, lastR:0}; }
  else { trayDrag={mode:"marquee", from:p, to:p};
    trayMarqEl=document.createElement("div"); trayMarqEl.className="marqueebox"; trackEl.appendChild(trayMarqEl); trayMarqUpdate(); }
});
trackEl.addEventListener("pointermove",e=>{ if(!trayMode) return;
  const prev=trayPtrs.get(e.pointerId);
  if(prev) trayPtrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(trayPtrs.size>=2){ if(prev) scroller.scrollLeft-=(e.clientX-prev.x)/zoomOf(); return; }   // two-finger pan — scrollLeft is FIELD px, the finger is viewport px
  if(trayDrag&&!prev) return;   // a gesture answers only to a finger it tracks: one trayPtrsDrop() let go of may still be down (TUN-14)
  if(trayPlace){
    if(trayDrag&&trayDrag.mode==="placetap"){
      if(Math.hypot(e.clientX-trayDrag.from.x,e.clientY-trayDrag.from.y)>TRAY_SLOP) trayDrag.panned=true;
      if(trayDrag.panned&&prev) scroller.scrollLeft-=(e.clientX-prev.x)/zoomOf();     // drag with a copy armed = pan
    } else trayPlacePreview(trayPosCell(trayGridPos(e)));                              // hover ghost (mouse/pen)
    return; }
  if(!trayDrag) return; e.preventDefault(); trayAutoScroll(e);
  const p=trayGridPos(e);
  if(trayDrag.mode==="marquee"){ trayDrag.to=p; trayMarqUpdate(); }
  else if(trayDrag.mode==="move"){ const cell=trayPosCell(p), ns=trayNotes();
    const [dr,dc]=trayClampD(ns, cell.r-trayDrag.from.r, cell.c-trayDrag.from.c);
    trayDrag.d={r:dr,c:dc}; clearGhosts();
    if(dr||dc) ns.forEach(n=>{ const q=trayCellOf(n); const el=cells[q.r+dr]&&cells[q.r+dr][q.c+dc];
      if(el){ el.classList.add("tghost"); trayGhosts.push(el); } });
    if(dr!==trayDrag.lastR){ trayDrag.lastR=dr;             // sound the transpose as it happens — ears first
      const q=trayCellOf(ns[0]); if(!isLockedRow(q.r+dr)) playRow(q.r+dr, actx.currentTime); } }
});
function trayUp(e){ trayPtrs.delete(e.pointerId);
  if(!trayMode||!trayDrag) return;
  if(trayPtrs.size>=1) return;                              // other finger still down (pan) — gesture already cancelled
  const d=trayDrag; trayDrag=null;
  if(d.mode==="placetap"){ if(!d.panned) trayPlaceCommit(d.cell); return; }
  if(d.mode==="marquee"){
    if(trayMarqEl){ trayMarqEl.remove(); trayMarqEl=null; }
    const z=zoomOf(), w=Math.abs(d.to.x-d.from.x)*z, h=Math.abs(d.to.y-d.from.y)*z;   // compare in VIEWPORT px: a tap is 6 real pixels at any zoom
    if(w<6&&h<6){                                           // a TAP: toggle one seed in/out of the pick, or coach
      const cell=trayPosCell(d.from);
      const hit=melTrack().notes.find(n=>{ const q=trayCellOf(n); return q.r===cell.r&&q.c===cell.c; });
      if(hit){ const i=traySel.indexOf(hit.id); if(i>=0) traySel.splice(i,1); else traySel.push(hit.id);
        trayPaint(); setStatus(traySel.length+" picked 🧺"); }
      else setStatus("Drag a <b>box</b> around your seeds to pick them up 🧺 — or press <b>✕ Done</b> to go back to planting.");
      return; }
    const c0=trayPosCell({x:Math.min(d.from.x,d.to.x), y:Math.min(d.from.y,d.to.y)});
    const c1=trayPosCell({x:Math.max(d.from.x,d.to.x), y:Math.max(d.from.y,d.to.y)});
    melTrack().notes.forEach(n=>{ const q=trayCellOf(n);    // marquees UNION — gather a wide passage screen by screen
      if(q.r>=c0.r&&q.r<=c1.r&&q.c>=c0.c&&q.c<=c1.c&&!traySel.includes(n.id)) traySel.push(n.id); });
    trayPaint();
    setStatus(traySel.length ? traySel.length+" seeds picked 🧺 — drag the pick to move it, or use the buttons under the field."
      : "Nothing in the box — drag around some planted seeds 🌱.");
  } else if(d.mode==="move"){
    if(d.d.r||d.d.c) trayMove(d.d.r, d.d.c, "Moved 🧺 — undo brings it back.");
    else { const hit=melTrack().notes.find(n=>{ const q=trayCellOf(n);   // a clean tap on a picked seed drops just it
        return q.r===d.from.r&&q.c===d.from.c&&traySel.includes(n.id); });
      if(hit){ traySel.splice(traySel.indexOf(hit.id),1); trayPaint(); setStatus(traySel.length+" picked 🧺"); }
      clearGhosts(); }
  } else clearGhosts();
}
function trayCancel(e){ if(trayPtrs.delete(e.pointerId) && trayMode) trayCancelGesture(); }   // interrupted gesture: discard, never commit
trackEl.addEventListener("pointerup",trayUp); trackEl.addEventListener("pointercancel",trayCancel);
// A pointer can go without its up or cancel ever reaching trackEl — the tab hidden or the window blurred
// mid-gesture, the capture lost. Left in trayPtrs, it holds camBusy() true and the camera stops following
// the playhead for the rest of the Scoop session (TUN-14; pinchDrop() in grid.js is the same fix for pinch).
// Idempotent, and it never commits: the in-flight marquee or move is discarded, the pick and an armed copy stay.
function trayPtrsDrop(){ if(!trayPtrs.size && !trayDrag) return; trayPtrs.clear(); trayCancelGesture(); }
// lostpointercapture also follows every ordinary pointerup, by which time trayUp has deleted the pointer —
// so only a pointer still in the set means the gesture was lost, and the release that just committed stands.
trackEl.addEventListener("lostpointercapture",e=>{ if(trayPtrs.has(e.pointerId)) trayPtrsDrop(); });
document.addEventListener("visibilitychange",()=>{ if(document.hidden) trayPtrsDrop(); });
window.addEventListener("pagehide",trayPtrsDrop);
window.addEventListener("blur",trayPtrsDrop);
document.getElementById("trayCopy").onclick=()=>{ const ns=trayNotes(); if(!ns.length) return;
  const qs=ns.map(n=>trayCellOf(n)), minR=Math.min(...qs.map(q=>q.r)), minC=Math.min(...qs.map(q=>q.c));
  trayPlace={ rel:qs.map((q,i)=>({dr:q.r-minR, dc:q.c-minC, dur:ns[i].durationTicks})),   // carry LENGTH: copying a vine must not flatten it
              h:Math.max(...qs.map(q=>q.r))-minR, w:Math.max(...qs.map(q=>q.c))-minC };
  trayPlacePreview({r:minR, c:minC});                        // ghost is visible immediately (touch has no hover)
  setStatus("⧉ Copied — <b>tap where the copy should grow</b> 🌱 (drag pans · Esc cancels).");
};
function trayPlaceClamp(cell){ return { r:Math.max(0,Math.min(ROWS-1-trayPlace.h,cell.r)),
                                        c:Math.max(0,Math.min(COLS-1-trayPlace.w,cell.c)) }; }
function trayPlacePreview(cell){ clearGhosts(); const a=trayPlaceClamp(cell);
  trayPlace.rel.forEach(o=>{ const el=cells[a.r+o.dr]&&cells[a.r+o.dr][a.c+o.dc];
    if(el){ el.classList.add("tghost"); trayGhosts.push(el); } }); }
function trayPlaceCommit(cell){ const a=trayPlaceClamp(cell), made=[];
  if(trayPlace.w>COLS-1||trayPlace.h>ROWS-1){ setStatus("Not enough room for that copy here 🌱 — make the field bigger first."); trayPlace=null; clearGhosts(); return; }
  if(trayPlace.rel.some(o=>isLockedRow(a.r+o.dr))){ setStatus("That color isn't awake yet 🔒 — plant the copy somewhere else."); return; }
  tx("paste",()=>{ const t=melTrack();
    trayPlace.rel.forEach(o=>{ const pitch=MIDI[a.r+o.dr], tick=(a.c+o.dc)*TICKS_PER_COL;
      if(!t.notes.some(n=>n.pitch===pitch&&n.startTick===tick)){
        const dur=Math.min(o.dur||TICKS_PER_COL, (COLS-(a.c+o.dc))*TICKS_PER_COL);   // honour the source length, clipped at the field's end
        const n={id:newNoteId(),pitch,startTick:tick,durationTicks:dur,velocity:1};
        t.notes.push(n); made.push(n.id); } });
    reproject(); });
  trayPlace=null; if(made.length) traySel=made;               // the copy becomes the new pick — chained placing feels natural
  trayCommitDone("Planted a copy 🌱 — it's the new pick.");
}
document.getElementById("trayDel").onclick=()=>{ if(!traySel.length) return;
  tx("delete",()=>{ const t=melTrack(); t.notes=t.notes.filter(n=>!traySel.includes(n.id)); reproject(); });
  traySel=[]; trayCommitDone("Dug up 🗑 — undo if you change your mind.");
};
// time surgery is blocked on stages whose layout is scripted (Q&A call/answer split, pattern-choice stages)
function traySurgeryBlocked(){
  if(document.querySelector(".cell.callcol")){ setStatus("This level's path is split into call and answer — time can't stretch here 🌿."); return true; }
  const ch=document.getElementById("choiceRow");
  if(ch && ch.style.display!=="none"){ setStatus("This level lays out the choices itself — no time surgery here 🌿."); return true; }
  return false; }
// the same gate for DURATION (EDITOR-DESIGN §17's growBlocked, now that a package finally needs it): while a
// picker is up, its options are laid out for the EAR — editing one would leave choiceViewed/choicePick lying.
// Asked of the LESSON picker's own state, not of the row's visibility: a quest's path toggles share the
// row, and they must not switch off Grow — the whole point of the last phase is that the path showing
// is one you can still work on.
function choiceUp(){ return !!choiceOpts; }
function growBlocked(){ if(choiceUp()){
    setStatus("This level lays out the walks itself 👂 — tap each one, then pick."); return true; }
  return false; }
