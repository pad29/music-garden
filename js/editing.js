// ---------- Pulling a vine (EDITOR-DESIGN §6) ----------
// Studio-only for now (owner, 2026-08-10) — the one surface with no goal detector and no narrated rest a
// held note could contradict. Which package TEACHES duration is parked in §17.
let pull=null;
const growPkg=()=>unlockedSet(levelIdx).has("grow");   // a package that TEACHES duration keeps the tool for the rest of itself
const canGrow=()=>scopeFeatures().has("grow") || !!(curStage()&&curStage().grow);
const growOn=()=>document.body.classList.contains("growing") && !trayMode && !activeTool;
function vineMax(n){ const c=noteCol(n), r=projRow(n.pitch);
  let stop=Math.min(COLS, c+MAX_VINE);                              // a vine stops when it meets a seed on its OWN row —
  for(let k=c+1;k<stop;k++) if(grid[r]&&grid[r][k]){ stop=k; break; }  // kid-legible, and it prevents same-pitch overlap
  return Math.max(1, stop-c); }
if(vinesEl){
  vinesEl.addEventListener("pointerdown",e=>{
    const g=e.target.closest && e.target.closest(".grip"); if(!g||!growOn()) return;
    const n=melTrack().notes.find(q=>q.id===+g.dataset.id); if(!n) return;
    e.preventDefault(); e.stopPropagation();
    try{ g.setPointerCapture(e.pointerId); }catch(x){}
    const r=projRow(n.pitch), c=noteCol(n), L=vineLen(n);
    let s=vinesEl.querySelector('.stem[data-id="'+n.id+'"]');       // pre-make the stem so the drag can grow it
    if(!s){ s=document.createElement("div"); s.className="stem"; s.dataset.id=n.id;   // WITHOUT a re-render, which would
      s.style.left=stemLeft(c)+"px"; s.style.top=stemTop(r)+"px";                     // destroy the element holding capture
      s.style.width="0px"; s.style.display="none"; vinesEl.appendChild(s); }
    // Anchor in FIELD coordinates, re-read per event the way trayGridPos and cursorFromEvent already do. A raw
    // viewport delta was the one gesture in the file that could not survive the field moving under the finger —
    // and now the camera, a two-finger pan and the beat-lane sync can all move it mid-pull.
    pull={id:n.id, base:n.durationTicks, x0:(e.clientX-gridEl.getBoundingClientRect().left)/zoomOf(), len:L, armed:false, stem:s, grip:g, c, r};
    initAudio(); actx.resume(); });
  vinesEl.addEventListener("pointermove",e=>{ if(!pull) return;
    const n=melTrack().notes.find(q=>q.id===pull.id); if(!n){ pull=null; return; }
    const z=zoomOf(), dx=(e.clientX-gridEl.getBoundingClientRect().left)/z-pull.x0;
    if(!pull.armed){ if(Math.abs(dx*z)<=TRAY_SLOP) return; pull.armed=true; }   // 8px — the spike's threshold, kept in VIEWPORT px so it feels the same at any zoom
    const len=Math.max(1, Math.min(vineMax(n), Math.round(pull.base/TICKS_PER_COL + dx/TRAY_CW)));
    if(len===pull.len) return;
    pull.len=len; n.durationTicks=len*TICKS_PER_COL;                 // mutate live for the ear; the JOURNAL entry is written on release
    pull.stem.style.display = len>1?"block":"none";
    pull.stem.style.width=stemW(len)+"px";
    pull.grip.style.left=gripLeft(pull.c,len)+"px";
    playRow(pull.r, actx.currentTime, len>1?len*TICKS_PER_COL*secPerTick():0);   // ears first, exactly like a tray move
    setStatus(len>1?`🌿 Vine — this note holds for <b>${len}</b> steps. Pull back to shorten it.`
                   :"🌱 Back to a single seed — one short note."); });
  const endPull=(commit)=>{ if(!pull) return; const p=pull; pull=null;
    const n=melTrack().notes.find(q=>q.id===p.id);
    if(n){ const finalTicks=n.durationTicks; n.durationTicks=p.base;  // rewind, then let tx() snapshot the REAL before-state
      if(commit && p.armed && finalTicks!==p.base){
        tx("grow",()=>{ n.durationTicks=finalTicks; reproject(); });
        ev.played=false; checkLevel(); } }
    renderVines(); };
  vinesEl.addEventListener("pointerup",()=>endPull(true));
  vinesEl.addEventListener("pointercancel",()=>endPull(false));
}
// ---------- Grow / Trim: duration WITHOUT a drag (EDITOR-DESIGN §6) ----------
// The drag is a lovely gesture and a terrible only-way: a 14px grip is the smallest target in the game, a
// keyboard can't perform it at all, and it can only ever lengthen ONE note. These two buttons are the other
// path, and they gate on canGrow()/body.growing ONLY — deliberately NOT on growOn(), which ANDs !trayMode and
// would switch them off exactly while the Scoop is armed, deleting the many-at-once case they exist for.
const GROW_COPY = {
  one:      len => `🌿 Vine — this note holds for <b>${len}</b> steps. Press ✂ to let it go sooner.`,
  oneSeed:  "🌱 Back to a single seed — one short note.",              // verbatim from the drag, so both paths say the same thing
  chord:    (k,len) => `🌿 The whole stack holds for <b>${len}</b> steps — it breathes as one.`,
  many:     k => `🌿 <b>${k}</b> seeds holding a step longer — all together.`,
  manyTrim: k => `✂ <b>${k}</b> seeds letting go a step sooner.`,
  someGrew:    (k,b) => `🌿 <b>${k}</b> grew — <b>${b}</b> had something in the way 🌱.`,
  someTrimmed: (k,b) => `✂ <b>${k}</b> got shorter — <b>${b}</b> ${b===1?"was":"were"} already as short as a seed 🌱.`,
  wall: {   // three different walls, three different answers — Math.min() in vineMax throws the reason away
    ceiling: "🌿 Eight steps is as long as a vine grows — that's two whole beats of holding.",
    edge:    "🌿 The field ends here — press <b>＋ room</b> to make more, then try again.",
    seed:    "🌿 It bumped into the next seed on its own line 🌱 — a vine can't grow through a seed."
  },
  floor: "🌱 These are already as short as a seed gets.",
  none:  "🌱 No seed <b>starts</b> under the green dashes — slide the 🔻 to one (or 🧺 Scoop some), then press 🌿."
};
// The pick is WHAT, the cursor is WHERE — the same doctrine the rest of the rail runs on. Branch on the
// RESOLVED notes, not traySel.length, so a pruned id can never produce a phantom target.
function growTargets(){
  const picked=trayNotes();
  const set = picked.length ? picked : melTrack().notes.filter(n=>noteCol(n)===cursorCol);
  return set.filter(n=>!isLockedRow(projRow(n.pitch))); }
function growWall(n){ const c=noteCol(n), len=vineLen(n);
  if(len>=MAX_VINE) return "ceiling";                 // ceiling FIRST: at the field's end with a full vine both
  if(c+len>=COLS)   return "edge";                    // are true, and ＋ room would not help
  return "seed"; }
function cursorIntoView(){ CAM.yielded=false; camEnsure(cursorCol,{instant:true}); }   // an arrow key is a deliberate act: take the wheel back
function growTrim(dir){
  if(pull) return;                                                  // a grip drag owns the note right now
  if(growBlocked()) return;                                         // …and this covers the G/T keys too — growTrim is the single entry point
  if(trayPlace||trayDrag){ setStatus("Put the copy down first ⧉ — or press <b>Esc</b> to put it away."); return; }
  const set=growTargets();
  if(!set.length){ setStatus(GROW_COPY.none); return; }
  const moved=[], blocked=[];
  for(const n of set){
    const len=vineLen(n), max=vineMax(n);
    // NEVER Math.min(max,len+1): vineMax is a POSITION cap read from the onset and never looks at
    // durationTicks, so len>max is reachable (＋ room inside a full vine; a seed planted inside one) and
    // clamping there would AMPUTATE a note the player never asked to shorten. Grow only ever grows.
    const tgt = dir>0 ? (len>=max ? len : len+1) : Math.max(1,len-1);
    if(tgt===len) blocked.push(n); else moved.push({n,tgt}); }
  if(!moved.length){                                                // pure refusal — no transaction, no journal entry
    blocked.slice(0,3).forEach(n=>{ const r=projRow(n.pitch), c=noteCol(n);
      if(cells[r]&&cells[r][c]) anim(cells[r][c],"wob"); });
    setStatus(dir>0 ? GROW_COPY.wall[growWall(blocked[0])] : GROW_COPY.floor); return; }
  tx("grow",()=>{ moved.forEach(m=>{ m.n.durationTicks=m.tgt*TICKS_PER_COL; }); reproject(); });
  initAudio(); actx.resume();                                       // ears first, like every other edit
  moved.slice().sort((a,b)=>a.n.pitch-b.n.pitch).slice(0,3)         // 3 lowest — every voice rings 0.6s+ whatever the hold
    .forEach(m=>playRow(projRow(m.n.pitch), actx.currentTime, m.tgt>1 ? m.tgt*TICKS_PER_COL*secPerTick() : 0));
  if(trayMode) trayPaint(); else renderVines();                     // trayPaint repaints the stems AND keeps ✕ Done (n) honest
  ev.played=false; checkLevel();
  const k=moved.length, b=blocked.length;
  if(b) setStatus(dir>0 ? GROW_COPY.someGrew(k,b) : GROW_COPY.someTrimmed(k,b));
  else if(k===1) setStatus(moved[0].tgt>1 ? GROW_COPY.one(moved[0].tgt) : GROW_COPY.oneSeed);
  else { const cols=new Set(moved.map(m=>noteCol(m.n))), lens=new Set(moved.map(m=>m.tgt));
    setStatus(cols.size===1 && lens.size===1 ? GROW_COPY.chord(k,moved[0].tgt)
            : dir>0 ? GROW_COPY.many(k) : GROW_COPY.manyTrim(k)); } }
document.getElementById("growBtn").onclick=()=>growTrim(+1);
document.getElementById("trimBtn").onclick=()=>growTrim(-1);
function rebuildField(){ buildGrid(); buildDrums(); trayPrune(); syncCursor(); renderVines(); renderBars(); camReseed(); }   // pitch grid + drum lane are ALWAYS rebuilt together, so they stay the SAME width (COLS) — never let them drift apart; the tray re-anchors, the cursor re-clamps, and the camera re-seeds so a shrinking field's own scroll clamp is not mistaken for the child
// The field stops at MAX_COLS, the line applySong clamps a loaded song to, so a song a player built always
// loads back whole (TUN-84). ＋ more and ＋ room both ask here, as － room asks about the 16-column floor.
function fieldCanGrow(n){ if(COLS+n<=MAX_COLS) return true;
  setStatus("The field is as long as a garden grows 🌱 — no more room after this."); return false; }
function addColumns(n){ if(!fieldCanGrow(n)) return false; modelSetCols(COLS+n); rebuildField(); return true; }
// The 16-column floor is STRUCTURAL, not a preference, and the reason is not the one the old comment
// gave: COLS is assigned in five places and NOTHING ever grows it back — resetTransient only ever shrinks
// (`if(COLS>16) removeColumns(COLS-16)`), so a Studio waltz trimmed to 6 columns would render every level
// entered afterwards at 6. hintMelody also hardcodes its final tonic at column 14.
// Metered, removal is ALL-OR-NOTHING: an 18-column waltz minus a 6-column bar would clamp to 16 and take
// only two, leaving a partial bar — a "－ patch" that removes a third of a patch is a lie. Unmetered keeps
// today's clamp exactly, because that is shipped behaviour in every package with ＋/－ unlocked.
function removeColumns(n){
  if(meterAt()){ if(COLS-n<16) return; modelSetCols(COLS-n); rebuildField(); updateGarden(); return; }
  const c2=Math.max(16, COLS-n); if(c2===COLS) return;
  modelSetCols(c2); rebuildField(); updateGarden(); }
function setCell(r,c,on){ modelSetCell(r,c,on); cells[r][c].classList.toggle("on",on); renderVines(); }   // digging up a vined seed must take its stem with it
function flash(el,r){ el.classList.remove("pulse"); void el.offsetWidth; el.classList.add("pulse");
  if(isTonic(r)) settle(); }
function anim(el,cls){ el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
  setTimeout(()=>el.classList.remove(cls),600); }
let settleT;
function settle(){ document.body.classList.add("settle");
  clearTimeout(settleT); settleT=setTimeout(()=>document.body.classList.remove("settle"),420); }

// ---------- Interaction: plant / fuse / stamp ----------
// Fuse is an ACTION, not a mode (2026-07-27 redesign): it crafts the Scoop pick, or — with no pick —
// the field's single 2–3-seed stack directly (plant a stack, press Fuse: one step). An ambiguous
// field arms Scoop with a coaching line. The old click-seeds-then-Save picking mode is gone.
function cellClick(r,c,el){
  if(trayMode) return;   // the tray owns the field — its pointer handlers on the track do the work (also eats synthesized post-touch mousedowns)
  if(zoomBlocksEdit()) return;   // …and at 60% the tap is aimed at the ZOOM, not at a square: it must not leave a seed behind on the way in
  initAudio(); actx.resume(); hideNoteTip();
  if(isLockedRow(r)){ setStatus("That color isn't awake yet 🔒 — this level uses the colors you've discovered so far."); return; }
  followCursor(c);   // …and covers the stamp path below, which is only ever reached from here
  if(activeTool){ stampTool(r,c); return; }
  setCell(r,c,!grid[r][c]);
  if(grid[r][c]){ playRow(r,actx.currentTime); flash(el,r); bloom(el, noteFlower(r)); compReact(); }
  ev.played=false;                 // editing means "Play" must be pressed again to count
  checkLevel();
}
function craftFromCells(list){                     // list: [{r,c}] — same column, 2–3 seeds
  const rows=list.map(s=>s.r);
  const base=Math.max(...rows);                    // bottom note = lowest pitch
  const offs=[...new Set(rows.map(r=>base-r))].sort((a,b)=>a-b);
  const midis=[...new Set(rows.map(r=>MIDI[r]))].sort((a,b)=>a-b);
  if(offs.length<2){ setStatus("Fuse needs seeds at <b>different heights</b> 🎵 (not the same row)."); return; }
  const stable=stableMidis(midis);
  list.forEach((s,i)=>{ anim(cells[s.r][s.c], stable?"stand":"wob"); playRow(s.r,actx.currentTime+i*0.05); });
  // record what kind of thing was crafted (counts even if the shape is a duplicate)
  if(offs.length===2){ ev.craftedPair=true; const k=pairKind(midis); ev.lastPairKind=k;   // also track pair personality, ladder-span + real gap (Twin Blooms)
    ev.pairKinds.push(k); ev.pairs.push({span:offs[offs.length-1], kind:k, gap:pairSpan(midis)}); }
  else if(stable){ ev.craftedTower=true; ev.towerSigs.push(midis.join("-")); } else ev.craftedWobbler=true;  // distinct by actual NOTES (the uneven ladder makes offs collide)
  const m=toolMeta(offs,midis);
  if(!toolbox.some(t=>sig(t.offs)===sig(offs))){
    const tool={id:"t"+Date.now().toString(36)+Math.floor(Math.random()*1296).toString(36),offs,midis};   // stable tool id (§4c)
    toolbox.push(tool); renderBag(sig(offs));
    setStatus(`Crafted <b>${m.em} ${m.name}</b> — ${toolRealName(tool)}! Click it in your 🎒 Toolbox to hear it.`);
    toast(offs.length===2 ? `${m.em} New pair: ${m.name}!`
          : stable ? "🏛️ Tower — smooth & open!" : "🌀 Wobbler — tense & clashy!");
  } else setStatus(`That's a <b>${m.name}</b> — already in your toolbox.`);
  bloom(cells[Math.min(...rows)][list[0].c], "💐");   // crafted pair/chord → bouquet
  checkLevel(); saveActiveInventory();
}
function fusePick(){                               // Fuse pressed with a Scoop pick
  const ns=trayNotes();
  const colsIn=[...new Set(ns.map(n=>noteCol(n)))];
  if(colsIn.length>1){ setStatus("A chord lives in <b>one column</b> 📍 — scoop seeds stacked one above another."); return; }
  if(ns.length<2){ setStatus("Scoop <b>2–3 seeds</b> in one column 🧺, then press 🔨 Fuse."); return; }
  if(ns.length>3){ setStatus("Up to <b>3</b> seeds make a chord — scoop fewer (tap a seed to drop it from the pick)."); return; }
  craftFromCells(ns.map(n=>({r:projRow(n.pitch), c:noteCol(n)})));
}
function fuseField(){                              // Fuse pressed with no pick: find the stack, or coach
  const cand=[]; for(let c=0;c<COLS;c++) if(colCount(c)>=2) cand.push(c);
  if(!cand.length){ setStatus("Plant <b>2–3 seeds stacked in one column</b> 🌱 (one above another), then press 🔨 Fuse."); return; }
  if(cand.length===1 && colCount(cand[0])<=3){
    const c=cand[0], list=[]; for(let r=0;r<ROWS;r++) if(grid[r][c]) list.push({r,c});
    craftFromCells(list); return; }
  enterTray(); setStatus("A few stacks here — 🧺 <b>scoop the 2–3 seeds</b> you want to bond, then press <b>🔨 Fuse</b>.");
}
function stampTool(r,c){
  const offs=activeTool.offs;
  let rows=offs.map(o=>r-o);                        // stack upward from clicked cell
  if(rows.some(x=>x<0)) rows=offs.map(o=>r+o);      // flip downward if it runs off the top
  rows=rows.filter(x=>x>=0&&x<ROWS);
  if(!rows.length) return;
  tx("stamp",()=>rows.forEach(rr=>setCell(rr,c,true)));   // ONE journal entry — undo removes the whole stamped chord, not one seed of it
  rows.forEach((rr,i)=>playRow(rr,actx.currentTime+i*0.05));
  const stable=stableMidis(rows.map(r2=>MIDI[r2]).sort((a,b)=>a-b));
  rows.forEach(rr=>anim(cells[rr][c], stable?"stand":"wob"));
  if(isTonic(rows[rows.length-1])||isTonic(rows[0])) settle();
  bloom(cells[Math.min(...rows)][c], rows.length>=2?"💐":noteFlower(rows[0]));   // stamped interval/chord → bouquet
  ev.stampedTool=true; ev.played=false;
  // keep the tool active so you can stamp it again and again (click the tool again, or Esc, to stop)
  setStatus("Stamped! 🌸 Click the field again to stamp more — click the bloom again (or press Esc) to stop.");
  checkLevel();
}

// ---------- Toolbox UI ----------
const bagEl=document.getElementById("bag"), bagHint=document.getElementById("bagHint");
function renderBag(popSig){
  bagEl.innerHTML=""; bagHint.style.display=toolbox.length?"none":"block";
  toolbox.forEach(tool=>{ const m=toolMeta(tool.offs, tool.midis);
    const chip=document.createElement("button");
    chip.className="chip"+(activeTool&&sig(activeTool.offs)===sig(tool.offs)?" active":"")+(popSig===sig(tool.offs)?" pop":"");
    chip.title=`${m.name} · ${toolRealName(tool)}`;
    chip.innerHTML=`${miniSVG(tool.offs)}<span class="lbl">${m.name}</span>`;
    chip.onclick=()=>{ previewTool(tool); toggleStamp(tool); }; bagEl.appendChild(chip);
  });
}
function toggleStamp(tool){
  activeTool = (activeTool&&sig(activeTool.offs)===sig(tool.offs)) ? null : tool;
  exitTray(); renderBag();
  if(activeTool){ const m=toolMeta(tool.offs, tool.midis);
    setStatus(`Picked <b>${m.em} ${m.name}</b> (${toolRealName(tool)}) — click the grid to stamp it once.`);
  } else setStatus("Plant seeds 🌱, or 🔨 Fuse to craft.");
}

