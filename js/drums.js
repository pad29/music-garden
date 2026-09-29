// ---------- Rhythm: a 16-step drum sequencer (kick / snare / hi-hat) ----------
const DRUMS=[{name:"Kick",emoji:"🥁",play:t=>kick(t,1.0,drumBus)},
             {name:"Snare",emoji:"👏",play:t=>snare(t,0.7,drumBus)},
             {name:"Hi-hat",emoji:"🎩",play:t=>hat(t,0.4,drumBus)}];
let drumG=DRUMS.map(()=>Array(COLS).fill(false)); const dcells=[]; let drumsOn=false; let drumCursorEl=null, drumBarsEl=null;
function buildDrums(){ const rows=document.getElementById("drumrows"); rows.innerHTML="";
  const bar=document.getElementById("drumbar"); if(bar) bar.innerHTML="";   // the labels live OUTSIDE the scroller now — one per row, same order, same heights
  DRUMS.forEach((dm,d)=>{ dcells[d]=[];
    if(bar){ const lab=document.createElement("div"); lab.className="drumlabel";
      lab.textContent=`${dm.emoji} ${dm.name}`; bar.appendChild(lab); }
    const row=document.createElement("div"); row.className="drumrow";
    const g=document.createElement("div"); g.className="dcellgrid"; g.style.gridTemplateColumns=`repeat(${COLS},34px)`;
    for(let c=0;c<COLS;c++){ const el=document.createElement("div");
      el.className="dcell"+(beatTintAt(c)?" beat":"")+(drumG[d][c]?" on":"");
      el.addEventListener("mousedown",()=>drumClick(d,c)); g.appendChild(el); dcells[d][c]=el; }
    row.appendChild(g); rows.appendChild(row); });
  drumCursorEl=document.createElement("div"); drumCursorEl.id="drumCursorCol";   // innerHTML="" above ate the old rail — the cursor lives in BOTH lanes, so re-hang it
  rows.appendChild(drumCursorEl);
  drumBarsEl=document.createElement("div"); drumBarsEl.id="drumBarlines";        // …and so do the bars, for exactly the same reason. The beat lane is where
  rows.appendChild(drumBarsEl);                                                  // grouping is most directly useful, so it cannot be the lane without bars.
  applySwingVisual();   // a rebuild makes fresh cells — re-mark the swung "and" pads if swing is on
  if(typeof syncCursor==="function") syncCursor();
}
function drumClick(d,c){ if(zoomBlocksEdit()) return;   // same as the melody bed: at 60% a tap zooms in, it does not lay a beat
  initAudio(); actx.resume();
  followCursor(c);                 // the beat lane is the same timeline — tapping a pad is working at that column too
  const on=!drumG[d][c];
  modelSetDrum(d,c,on); dcells[d][c].classList.toggle("on",on);
  if(on) DRUMS[d].play(actx.currentTime+0.01);
  ev.played=false;                 // editing means "Play" must be pressed again to count
  checkLevel(); }
function wipeDrums(){ modelClearDrums();
  dcells.forEach(row=>row&&row.forEach(e=>e.classList.remove("on"))); }
function placeDrums(list){ modelPlaceDrums(list.filter(([d,c])=>d>=0&&d<DRUMS.length&&c>=0&&c<COLS));
  list.forEach(([d,c])=>{ if(dcells[d]&&dcells[d][c]) dcells[d][c].classList.add("on"); }); }
function snapshotDrums(){ const out=[]; for(let d=0;d<DRUMS.length;d++) for(let c=0;c<COLS;c++) if(drumG[d][c]) out.push([d,c]); return out; }
let carriedDrums=null;   // a drum pattern carried from one step to the next (e.g. Wind & Gaps "Two Versions")

