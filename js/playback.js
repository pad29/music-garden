// ---------- Playback ----------
const instrEl=document.getElementById("instr"), tempoEl=document.getElementById("tempo");
// A famous tune's tempo is a LOAN: it has to play (and ▶ replays the arrangement at it), but it is not
// something the child chose. This once had to survive saveProgress firing on level completion and package
// entry, which would otherwise leave the game stuck at Taps' 40 BPM on every reload; since the persistence
// split only saveUserSettings() snapshots the dial, and only from an explicit change. The loan still governs
// LIVE tempo, which is its own job. Holds the child's own tempo until they set one themselves.
let tempoOnLoan=null;
const playerTempo=()=>tempoOnLoan!==null ? tempoOnLoan : +tempoEl.value;
// set the melody voice by id — retired ids fall back (synth pluck → its sampled successor the
// guitar; warm pad → the music box via the missing-option check), sampled ids start fetching
function setVoice(v){ if(v==="pluck") v="guitar";
  instrEl.value=v||"musicbox"; if(!instrEl.value) instrEl.value="musicbox";
  if(SAMPLED[instrEl.value]) loadSamples(instrEl.value); }
// ---- Gradual instrument reveal: each region gifts its instrument on first entry ----
// The region's instrument is also the DEFAULT voice for every package in that region (openPkg
// sets it); the player can still switch among unlocked voices mid-session. The Studio gifts the
// guitar — the creator's instrument for the creative sandbox.
const REGION_INSTR={ "first-garden":"musicbox", "paths-of-song":"kalimba", "stone-chorus-canyon":"piano",
  "pulse-woods":"marimba", "color-spring":"harp", "weather-of-wanting":"vibraphone",
  "twin-gardens":"glockenspiel", "studio":"guitar" };
// each instrument's intro field is narrated on the reveal card — tools/gen-voice.mjs bakes a
// Polly clip for it (same scan as level stories), so re-run it after editing any of these lines.
const INSTR_INFO={
  musicbox:    { em:"🎵", name:"The Music Box",
    intro:"A tiny comb of steel teeth, plucked by pins on a turning drum. Wind it up and it plays all by itself — the sound this garden first grew from." },
  kalimba:     { em:"🪕", name:"The Kalimba",
    intro:"The kalimba is an African thumb piano — springy metal tines on a little wooden board, plucked with two thumbs. Listen closely: your music box was secretly a kalimba played by a machine!" },
  piano:       { em:"🎹", name:"The Piano",
    intro:"The piano hides a harp inside a big wooden case: press a key and a soft felt hammer taps a steel string. It can whisper or thunder — one note or ten at once." },
  marimba:     { em:"🪵", name:"The Marimba",
    intro:"The marimba is a giant wooden cousin of the xylophone, born in Africa and beloved in Central America. Under every wooden bar hangs a tube that makes the note ring warm and round." },
  guitar:      { em:"🎸", name:"The Guitar",   // em is the fallback; the card shows the svg — there is no CLASSICAL guitar emoji (🎸 is electric, wrong for our nylon-string samples)
    svg:'<svg viewBox="0 0 64 64" width="56" height="56" style="vertical-align:middle"><rect x="28" y="2" width="8" height="9" rx="2" fill="#6B4226"/><circle cx="29.5" cy="5" r="1.1" fill="#F4C95D"/><circle cx="34.5" cy="5" r="1.1" fill="#F4C95D"/><circle cx="29.5" cy="8.5" r="1.1" fill="#F4C95D"/><circle cx="34.5" cy="8.5" r="1.1" fill="#F4C95D"/><rect x="29.5" y="10" width="5" height="21" fill="#8B5E3C"/><rect x="28.8" y="12.5" width="6.4" height="1.2" fill="#5C3A1E"/><rect x="28.8" y="17" width="6.4" height="1.2" fill="#5C3A1E"/><rect x="28.8" y="21.5" width="6.4" height="1.2" fill="#5C3A1E"/><ellipse cx="32" cy="36" rx="10.5" ry="8" fill="#C98A4B"/><ellipse cx="32" cy="48.5" rx="13.5" ry="11" fill="#C98A4B"/><circle cx="32" cy="41" r="4.6" fill="#4A2E14"/><circle cx="32" cy="41" r="4.6" fill="none" stroke="#F4C95D" stroke-width="0.9"/><rect x="25.5" y="52" width="13" height="3" rx="1.2" fill="#6B4226"/><line x1="30.4" y1="10" x2="30.4" y2="52.8" stroke="#F7EFD8" stroke-width="0.7"/><line x1="32" y1="10" x2="32" y2="52.8" stroke="#F7EFD8" stroke-width="0.7"/><line x1="33.6" y1="10" x2="33.6" y2="52.8" stroke="#F7EFD8" stroke-width="0.7"/></svg>',
    intro:"Six nylon strings stretched over a wooden echo box — the Spanish classical guitar. It is the instrument people carry everywhere: the whole world's campfire friend." },
  harp:        { em:"🪄", name:"The Harp",
    intro:"The harp is one of the oldest instruments on Earth — a sail of strings you lean against your shoulder and pluck like ripples of water. This one is a Celtic harp with thirty-four strings." },
  vibraphone:  { em:"✨", name:"The Vibraphone",
    intro:"The vibraphone is the marimba's shiny metal cousin, played with soft round mallets. Its silvery bars hum long and dreamy — jazz musicians love its shimmer." },
  glockenspiel:{ em:"🔔", name:"The Glockenspiel",
    intro:"Glockenspiel means bell-play in German — a case of tiny steel bars that ring like stars. It sings two whole octaves above the notes you plant, higher than any other voice in the garden." },
};
// unlocked-instrument state lives in progress.instruments; older saves get it derived once from
// which regions they've already visited (a package entry in progress.packages = a visit).
function ensureInstruments(){
  if(!Array.isArray(progress.instruments)){
    const un=new Set(["musicbox"]);
    for(const id in progress.packages){ const inst=REGION_INSTR[regionOf(id)]; if(PACKAGES[id]&&inst) un.add(inst); }
    if(progress.packages.intro && (progress.packages.intro.completed || progress.packages.intro.done)) un.add("guitar");   // pre-reveal players always had the guitar
    const sv=progress.settings&&progress.settings.voice;
    if(sv==="pluck") un.add("guitar"); else if(sv&&INSTR_INFO[sv]) un.add(sv);   // grandfather whatever they were playing
    progress.instruments=[...un];
  }
  if(!progress.instruments.includes("musicbox")) progress.instruments.push("musicbox");
  refreshVoices();
}
const instrUnlocked = id => Array.isArray(progress.instruments) && progress.instruments.includes(id);
// locked voices are hidden from the picker but stay settable by code — a shared song or old save
// still PLAYS with its author's voice; discovery only gates what the player can browse.
function refreshVoices(){ [...instrEl.options].forEach(o=>{ o.hidden=!instrUnlocked(o.value); }); }
// entering a region: its instrument becomes the voice; first time ever → the discovery card
const instroverlay=document.getElementById("instroverlay");
const instrCardUp = () => instroverlay.style.display==="flex";
function applyRegionInstrument(reg){
  const inst=REGION_INSTR[reg]; if(!inst||!INSTR_INFO[inst]) return;
  if(!instrUnlocked(inst)){
    progress.instruments.push(inst);
    commitProgress();                                         // persist even if no level gets saved this session
    refreshVoices(); showInstrCard(inst);
  }
  setVoice(inst);
}
function showInstrCard(id){ const info=INSTR_INFO[id];
  const em=document.getElementById("instrEm");
  if(info.svg) em.innerHTML=info.svg; else em.textContent=info.em;   // guitar: custom classical-guitar art (no matching emoji)
  document.getElementById("instrName").textContent=info.name;
  document.getElementById("instrLine").textContent=info.intro;
  instroverlay.style.display="flex";
  if(speakOn){ narrateReady=true; narrate(info.intro); }      // renderStage skips the level story while the card is up
}
function closeInstrCard(){ instroverlay.style.display="none"; stopSpeech();
  initAudio();                                                // the claim click is our user gesture — let the new voice introduce itself
  const t=actx.currentTime+0.05;
  [0,4,7,12].forEach((st,i)=>voice(instrEl.value, midiToFreq(60+st), t+i*0.22));
  setTimeout(()=>{ if(speakOn) narrate(curStage().intro||""); }, 1400);   // then the level story gets its turn
}
document.getElementById("instrClose").onclick=closeInstrCard;
const playBtn=document.getElementById("play"), loopBtn=document.getElementById("loop");
const craftBtn=document.getElementById("craft"), jamBtn=document.getElementById("jam"), drumBtn=document.getElementById("beat");
const playhead=document.getElementById("playhead");
let playing=false, step=0, looping=false;
// ---------- Transport: the lookahead scheduler (EDITOR-DESIGN §12; spike/scheduler.html) ----------
// WHY: sound must be BOOKED against AudioContext.currentTime ~120ms early. A setInterval that also plays
// is at the mercy of every layout the main thread does (measured 13–20ms of drift, tools/goldens/README).
// So audio and pixels stop being one event: bookColumn() owns sound, paintCol() owns pixels, and the paint
// queue carries the UNSWUNG column time because that is exactly where today's picture already lands.
const LOOK_ON=0.12, WAKE_ON=25, LOOK_HID=1.5, WAKE_HID=250, ANCHOR_PAD=0.03;
let look=LOOK_ON, wake=WAKE_ON, paintRaf=0;
const nowSec=()=>actx.currentTime;                 // the ONLY clock read in the engine
const stepDur=()=>60000/tempoEl.value/2;           // ms per column — unchanged; playPhrase/famous/jam still use it
const secPerTick=()=>stepDur()/1000/TICKS_PER_COL; // === 60/bpm/96 — one source of truth with stepDur
let anchorTime=0, anchorTick=0, anchorSPT=0;       // anchorSPT is FROZEN at anchor time: reading tempo live here
const tick2time=tk=>anchorTime+(tk-anchorTick)*anchorSPT;   // would retroactively rewrite the sound time of every
const time2tick=s=>anchorTick+(s-anchorTime)/anchorSPT;     // note already booked — a garble on the tempo drag
let bookTick=0, bookCol=0, endTime=Infinity;
const paintQ=[], colGains=[], litEls=[];
const GC_TAIL=3;      // seconds a sampled voice can still ring PAST its own note (conditionSample's ceiling is ~2.88s)
// ---------- The click: a count-in, and a metronome (§12 R12) ----------
// "off" | "in" (count-in only) | "both". A PLAYER PREFERENCE, not song state: it is not in snapState, not
// in currentSong, and not in a share link — a way of listening, like the field zoom and the loop range.
let clickMode="off";
// Both need a declared pulse, and unmetered there is not one: the pads tint every 4 columns while the
// tempo box treats a column as an eighth. Picking one would answer §17 §5's still-open question audibly,
// on every shipped level. So the click needs a meter — AND the Studio, because gating on the meter alone
// would ship a level feature with no level UI the moment a package gains one.
const clickOn      = () => inStudio() && !!meterAt() && clickMode!=="off";
const metronomeOn  = () => clickOn() && clickMode==="both";
// A short pitched blip, higher and louder on a barline — an accent is what makes a metronome say WHERE you
// are and not merely how fast. Deliberately not `hat`, which is the drum lane's own hi-hat: a click that
// can be mistaken for the child's pattern is no use to them.
function clickAt(t, accent){
  bTone(t, accent?1600:1100, 0.045, "square", accent?0.30:0.17, 0.002, clickBus); }
// The count-in, in ticks RELATIVE to the song's first column. One bar, phased on the downbeat by asking
// the planner rather than counting back from tick zero — with a one-column pickup those differ by half a
// beat, and a count-in that lands you on the wrong beat has no other job to fail at.
// One bar exactly, never two: an earlier rule said "two bars when one gives fewer than three clicks",
// which at the 40 BPM floor made a 6/8 count-in NINE SECONDS long. A bar is however long a bar is.
function countInPulses(){
  const m=meterAt(), P=m&&meterDef(m.preset); if(!P) return [];
  const startTick=step*TICKS_PER_COL, bt=barTicks(P);
  return pulsesIn(m, startTick-bt, startTick).map(u=>({rel:u.tick-startTick, kind:u.kind}));
}
let countInGain=null, countInTimers=[];
function clearCountIn(){
  if(countInGain){ try{ countInGain.gain.setValueAtTime(0, nowSec()); }catch(e){} countInGain=null; }
  countInTimers.forEach(clearTimeout); countInTimers.length=0; }
// Booked through ONE gain of its own rather than pushed into colGains: appending an entry whose `when` is
// earlier than a stale hidden-tab booking would break that ledger's FIFO order, and this needs no ledger.
function bookCountIn(pre){
  countInGain=actx.createGain(); countInGain.connect(clickBus);
  const was=clickBus; clickBus=countInGain;                     // clickAt reads clickBus at call time
  try{ pre.forEach((u,i)=>{
    const t=tick2time(u.rel);
    clickAt(t, u.kind==="bar");
    // …and the same count on screen. NOT optional: at the 40 BPM floor a bar is six seconds, and the
    // playhead cannot move yet because paintCol is its only writer and no column has sounded.
    const label=pre.slice(0,i+1).map((_,k)=>k+1).join(" · ");
    countInTimers.push(setTimeout(()=>{ if(playing) setStatus("🥁 Counting you in… <b>"+label+"</b>"); },
      Math.max(0,(t-nowSec())*1000))); }); }
  finally{ clickBus=was; } }
// Swing is a PLAYBACK LENS — it never touches note.startTick (§4b). Same branch order as the old tick(),
// so the jam/levelSwing overlap resolves identically and tools/goldens/playback.json holds by construction.
function swingTicks(col){
  if(jamMode && col%2===1) return GROOVES[grooveIdx].swing*TICKS_PER_COL;
  if(levelSwing && col%4===2) return TICKS_PER_COL;          // the "ands" land one WHOLE column late
  return 0; }
// A vine EXTENDS a note; it never truncates one. Every shipped level, every FAMOUS entry and every saved
// song is exactly one column long, and one column is 278ms at 108 BPM against a music-box ring of 1.1s —
// honoring one-column durations symmetrically would make the whole game dry and clicky at once, on content
// nobody thought they had touched. The > gate keeps every shipped note on the byte-identical old path.
// anchorSPT (frozen) is deliberate: a tempo drag mid-vine must not stretch a note already booked.
const MAX_VINE=8;                                            // a whole note — and the ceiling every sampled voice can actually deliver
const holdOf=(r,c)=>{ const n=gridNote[r]&&gridNote[r][c];
  return (n && n.durationTicks>TICKS_PER_COL) ? n.durationTicks*anchorSPT : 0; };
// Cancellation with no node ledger: voiceBus/jamBus/drumBus/reverb are module-level lets that EVERY audio
// factory reads at call time, so borrowing them for the length of one booking routes that whole column —
// samples, reverb send, jam, drums — through four gains we can zero on Stop. No factory is touched.
function bookColumn(col,tk){
  const t=tick2time(tk+swingTicks(col));
  step=col;                                                  // detectors + the goldens harness read bare `step`
  const V=voiceBus,J=jamBus,D=drumBus,R=reverb,C=clickBus;
  const gv=actx.createGain(),gj=actx.createGain(),gd=actx.createGain(),gr=actx.createGain(),gc=actx.createGain();
  gv.connect(V); gj.connect(J); gd.connect(D); gr.connect(R); gc.connect(C);
  voiceBus=gv; jamBus=gj; drumBus=gd; reverb=gr; clickBus=gc;
  try{                                                       // same ORDER as the old tick() — golden event order
    // The metronome marks the TRUE beat, so it books at the UNSWUNG tick. `t` above may be swung — jam
    // pushes odd columns, levelSwing delays 2/6/10/14 — and a swung click is not a metronome, it is a
    // third rhythm arguing with the other two.
    if(metronomeOn()){ const k=pulseKindAt(col); if(k) clickAt(tick2time(tk), k==="bar"); }
    if(jamMode) jamStep(col,t);
    for(let r=0;r<ROWS;r++) if(grid[r][col]) playRow(r,t,holdOf(r,col));
    if(revealHarm) for(let r=0;r<ROWS;r++) if(grid[r][col]){ const h=r+2;
      if(h<ROWS) bTone(t+0.02, midiToFreq(MIDI[h]), 0.5, "triangle", 0.14, 0.03); }
    if(drumsOn) for(let d=0;d<DRUMS.length;d++) if(drumG[d][col]) DRUMS[d].play(t);
  } finally{ voiceBus=V; jamBus=J; drumBus=D; reverb=R; clickBus=C; }   // ALWAYS restore: applyMix and every preview read these live
  colGains.push({when:t, g:[gv,gj,gd,gr,gc]});
}

function pump(){
  clearTimeout(Transport.timer); Transport.timer=null;       // every caller re-arms through here — one chain, never N
  if(!playing) return;
  if(!actx || actx.state!=="running"){ Transport.timer=setTimeout(pump,wake); return; }   // iOS suspend freezes currentTime
  const ct=nowSec(), horizon=ct+look;
  while(endTime===Infinity && tick2time(bookTick)<horizon){
    // BOTH ends, because a one-sided test cannot enforce a range: pin column 2, select the bar at [8,16),
    // press ▶, and start() seeds step=2 while begin() books from it — fourteen columns would play, not the
    // bar. The `< loopA()` half is not redundant either: setting a range mid-playback leaves bookCol
    // outside it, and this snaps the next booking in rather than running to the end of the field.
    if(bookCol<loopA() || bookCol>=loopB()){
      // The boundary is discovered at BOOKING time, which leads audible time by the lookahead — so it
      // is only recorded here, with the timestamp it will become true at, never credited here.
      completionDispatch({ type:"boundary", sessionId:activeCompletionSessionId(),
                           at:tick2time(bookTick), loops:!!looping });
      if(!looping){ endTime=tick2time(bookTick); break; }     // the phantom column after the last
      bookCol=loopA();                                        // …to the START of the loop, not to the cursor
      CAM.yielded=false; }                                    // a wrap is a landmark — the camera comes back for it
    bookColumn(bookCol,bookTick);
    completionDispatch({ type:"book", sessionId:activeCompletionSessionId(), col:bookCol });
    paintQ.push({col:bookCol, at:tick2time(bookTick)});       // UNSWUNG — today's picture, unchanged
    bookTick+=TICKS_PER_COL; bookCol++; }
  completionDispatch({ type:"clock", now:ct });   // audible time — and before the stop() below, which cancels
  paintDue(ct);
  // This window must outlive the LONGEST note that can still be sounding: every voice connects through its
  // column's gains, so disconnecting them severs a note that is still ringing. It used to be a flat 4 seconds
  // — which happened to be EXACTLY an 8-column vine at 60 BPM, the old tempo floor, so the bug sat on the
  // boundary and never fired. Dropping that floor to 40 for Taps made the same vine 6s and the cut audible.
  // Derived now, so the two ceilings can never drift apart again: 8 columns below 60 BPM, 6 below 53.
  const gcLag=MAX_VINE*stepDur()/1000+GC_TAIL;
  while(colGains.length && colGains[0].when<ct-gcLag){ const e=colGains.shift();
    e.g.forEach(g=>{ try{ g.disconnect(); }catch(x){} }); }   // or a ten-minute loop grows the graph forever
  if(ct>=endTime){ stop(); return; }
  Transport.timer=setTimeout(pump,wake);
}
function paintDue(ct){
  let last=null, stale=false;
  while(paintQ.length && paintQ[0].at<=ct+0.02){ const p=paintQ.shift();
    if(paintQ.length && paintQ[0].at<=ct-0.12) stale=true;    // back from a hidden tab: coalesce the backlog
    last=p; }
  if(last) paintCol(last.col, stale);
}
function paintCol(col,stale){
  if(col>=COLS || !cells[0] || col>=cells[0].length) return;  // a queued paint can outlive a rebuildField (song load,
  for(const el of litEls) el.classList.remove("col-playing"); // palette swap) — the old tick() was atomic against that
  litEls.length=0;
  const onRows=[];
  for(let r=0;r<ROWS;r++){ const el=cells[r]&&cells[r][col]; if(!el) continue;
    if(grid[r][col]){ onRows.push(r); if(!stale) flash(el,r); }
    el.classList.add("col-playing"); litEls.push(el); }
  if(!stale){
    // a vine lights up for as long as it actually rings — and bloom() still fires ONCE, at the head, so a
    // four-column vine drops one flower where four seeds would drop four. That contrast IS the lesson.
    for(const r of onRows){ const n=gridNote[r]&&gridNote[r][col];
      if(n && n.durationTicks>TICKS_PER_COL){ const st=vinesEl&&vinesEl.querySelector('.stem[data-id="'+n.id+'"]');
        if(st){ st.classList.add("ringing");
          // §2c's rule is that the stem lights for exactly as long as it RINGS. At a slow tempo a whole note
          // outlasts a short recording — a guitar's median is 1.67s against a 6s note at 40 BPM — and the stem
          // used to keep glowing over silence. It stops when the sound does now, whichever comes first.
          const notated=n.durationTicks*anchorSPT*1000;
          setTimeout(()=>st.classList.remove("ringing"),
            Math.min(notated, ringCeiling(instrEl.value, n.pitch)*1000)); } } }
    if(onRows.length===1) bloom(cells[onRows[0]][col], noteFlower(onRows[0]));
    else if(onRows.length>=2) bloom(cells[onRows[0]][col], "💐");
    if(onRows.length) compReact();
    if(revealSync && col%4===0) [gridEl,document.getElementById("drumrows")].forEach(el=>{
      el.classList.remove("gpulse"); void el.offsetWidth; el.classList.add("gpulse"); }); }
  if(drumsOn) for(let d=0;d<DRUMS.length;d++){ const el=dcells[d]&&dcells[d][col];
    if(el){ el.classList.add("col-playing"); litEls.push(el); } }
  playhead.style.left=(10+col*38)+"px";
  camEnsure(col,{instant:stale});                             // stale = back from a hidden tab, so cut rather than pan
}
function paintLoop(){ if(!playing){ paintRaf=0; return; } paintDue(nowSec()); paintRaf=requestAnimationFrame(paintLoop); }
const Transport={ timer:null,
  begin(countIn){ this.end();
    bookCol=Math.max(0,Math.min(COLS-1,step)); bookTick=0; endTime=Infinity;   // start() has already decided WHERE — booking must not re-derive it from the cursor, which no longer always agrees
    anchorTick=0; anchorSPT=secPerTick();
    this.anchor(countIn ? countInPulses() : []);
    pump(); if(!paintRaf) paintRaf=requestAnimationFrame(paintLoop); },
  // A count-in is just the tick region BEFORE the song, so the only thing that changes is that tick 0
  // happens later. tick2time is a straight line with no clamp at zero, so no other part of the transport
  // has to know this feature exists — pump() simply finds its horizon short of tick 0 and books nothing
  // until the count is nearly over.
  anchor(pre){
    const preTicks = pre.length ? -pre[0].rel : 0;
    anchorTime=nowSec()+ANCHOR_PAD+preTicks*anchorSPT;
    if(pre.length) bookCountIn(pre); },
  end(){ clearTimeout(this.timer); this.timer=null;
    clearCountIn();                                           // ■ during a count stops the count
    if(paintRaf){ cancelAnimationFrame(paintRaf); paintRaf=0; }
    if(actx){ const ct=nowSec();                              // 120ms of sound is ALREADY booked; without this, ■ Stop
      for(const e of colGains) if(e.when>ct)                  // plays on for a beat and a level change bleeds the old
        e.g.forEach(g=>g.gain.setValueAtTime(0,ct)); }        // song over the new intro. Sounding notes still ring out.
    paintQ.length=0; litEls.length=0; },
  // Tempo (per slider pixel) / groove mid-play: re-anchor at the next UNBOOKED column. Nothing past bookTick
  // is booked, so there is nothing to cancel, ticks stay integral, and no column can re-fire.
  retime(){ if(!playing) return;
    // A tempo change DURING the count would otherwise count you in at one tempo and start the song at
    // another. Nothing desynchronises — it is worse than that: the count-in's whole job is to state the
    // tempo, so a stale count is a LIE about the one thing it exists to say. While the song has booked
    // nothing, lay the count out again at the new tempo; once a column is booked the count is over and
    // the ordinary re-anchor applies. (An earlier draft said it would "measure this rather than reason
    // about it" — but it is a policy hole, and policy is decidable on paper.)
    if(bookTick===0 && countInGain){ clearCountIn(); anchorSPT=secPerTick(); this.anchor(countInPulses()); return; }
    anchorTime=tick2time(bookTick); anchorTick=bookTick; anchorSPT=secPerTick(); } };
document.addEventListener("visibilitychange",()=>{            // spike: hidden tabs throttle timers to ≥1s unless
  look=document.hidden?LOOK_HID:LOOK_ON;                      // audibly playing — stretch the horizon anyway
  wake=document.hidden?WAKE_HID:WAKE_ON;
  if(!playing) return;
  if(document.hidden){ if(paintRaf){ cancelAnimationFrame(paintRaf); paintRaf=0; } camStop(); }   // …and drop any camera tween: it cannot advance while hidden
  else if(!paintRaf) paintRaf=requestAnimationFrame(paintLoop);
  pump(); });
function start(opts){ initAudio(); actx.resume(); stopSpeech(); clearFamousTimers(); playing=true;   // hush narration & any famous-tune flashes so they don't collide with the main sweep
  // ▶ starts at the cursor only if it was put there DELIBERATELY; otherwise at the loop's start. This replaces
  // 2d's `if(growPkg() && cursorCol!==0) setCursor(0)` walk-home, which is deleted rather than generalized:
  // that hack had ▶ DRAG the cursor to 0, so planting a seed and pressing 🌿 Grow afterwards grew whatever
  // started at column 0 — the "it grew an old seed" the owner reported. ▶ no longer moves the cursor at all.
  // A deliberately chosen bar range OVERRIDES the cursor pin — you asked to hear those bars, so ▶ starts
  // at their first column. Unreachable without a meter, so no shipped level's ▶ changes.
  step = rangeOn() ? loopA() : Math.max(0,Math.min(COLS-1, cursorPinned?cursorCol:loopStart));
  const fromTop=step===0;                                                      // capture BEFORE tick() advances the step
  playBtn.textContent="■ Stop"; playhead.classList.add("on");
  playhead.style.left=(10+step*38)+"px";   // AT the start column: paintCol is its only other writer and it
  // cannot run until a column actually sounds, which behind a count-in is a whole bar away — without this
  // the playhead sits lit wherever the last run happened to stop.
  CAM.yielded=false; camEnsure(step,{instant:true});          // ▶ is a deliberate act: take the wheel back and cut to the start
  beginCompletionSession(opts);                               // quest scope only; every other scope gets null
  // Count-in intent is PASSED, never inferred: start() is called by ▶, by Jam turning playback on, by a
  // scripted reveal and by the Jukebox, and only the first of those is a child asking to be counted in.
  Transport.begin(!!(opts&&opts.countIn) && clickOn());   // no synchronous first tick — begin() books it, and end() inside begin() would erase a pre-paint anyway
  if(fromTop){ ev.played=true; ev[levelSwing?"playedSwing":"playedStraight"]=true; }   // Off the Path L4 tracks hearing BOTH feels; a partial play from mid-field earns NO listen-goal credit
  checkLevel();
  // Refusing credit for a partial listen is honest, but silence about it is not: a child who parked the stake
  // on purpose would press ▶ and watch a goal simply not tick. Say why. AFTER checkLevel, which can clobber it.
  if(isQuestScope()){ renderQuestShell();
    // Said the moment it starts, not withheld until they press Continue and find it grey.
    if(rangeOn() && (loopA()!==0 || loopB()!==COLS)) setStatus(QUEST_RANGE_TEXT);
    else if(!fromTop) setStatus(QUEST_CURSOR_TEXT);
    return; }
  if(!fromTop && !ev.played && ((curStage().goals||[]).some(g=>g.play)))
    setStatus("▶ from the cursor 🔻 — this one only counts from the very beginning. Drag 🔻 back to the start and press ▶ again."); }
function stop(){ cancelCompletionSession("stop"); playing=false; Transport.end();
  playBtn.textContent="▶ Play"; playhead.classList.remove("on");
  document.querySelectorAll(".col-playing").forEach(e=>e.classList.remove("col-playing"));
  if(revealRestore) revealRestore();                  // a reveal just finished (or was interrupted) — restore state
}
playBtn.onclick=()=> playing?stop():start({countIn:true});
document.getElementById("undoBtn").onclick=undoEdit;
document.getElementById("redoBtn").onclick=redoEdit;
loopBtn.onclick=()=>{ looping=!looping; loopBtn.classList.toggle("on",looping); };
drumBtn.onclick=()=>{ drumsOn=!drumsOn; drumBtn.classList.toggle("on",drumsOn);
  showDrumArea(drumsOn);
  if(drumsOn) syncCursor();          // the lane was display:none, so its pads had no geometry — re-measure the cursor rail now that they do
  setStatus(drumsOn?"🥁 Beat lane on — tap the pads to add a beat under your melody.":"Beat lane off 🌱."); };
const listenBtn=document.getElementById("listen");
listenBtn.onclick=()=>playPhrase(curStage().call ? curCall() : echoTarget());
function applyGrooveTempo(){ tempoOnLoan=null;   // picking a groove is a choice too
  tempoEl.value=GROOVES[grooveIdx].bpm;
  Transport.retime(); }
jamBtn.onclick=()=>{ jamMode=!jamMode; jamBtn.classList.toggle("on",jamMode);
  if(jamMode){ initAudio(); actx.resume(); applyGrooveTempo(); ev.jammed=true;
    if(!playing){ looping=true; loopBtn.classList.add("on"); jamStartedPlayback=true; start(); }
    setStatus(`🎸 Jam on — <b>${GROOVES[grooveIdx].name}</b>! Tap the grid to play along; every note fits! 🎶`);
    checkLevel(); }
  else { setStatus("Jam off 🌱"); if(jamStartedPlayback){ jamStartedPlayback=false; stop(); } }
};
const grooveEl=document.getElementById("groove"), grooveCtlEl=document.getElementById("grooveCtl");
document.getElementById("zoomBtn").onclick=cycleZoom;
armZoomTap(scroller); armZoomTap(drumArea);   // both beds — the beat lane is the same garden
armPinch(scroller);   armPinch(drumArea);
GROOVES.forEach((g,i)=>{ const o=document.createElement("option"); o.value=i; o.textContent=g.name; grooveEl.appendChild(o); });
grooveEl.onchange=()=>{ grooveIdx=+grooveEl.value; applyGrooveTempo(); questCommitSetting("groove");
  if(jamMode) setStatus(`🎸 Groove: <b>${GROOVES[grooveIdx].name}</b> — keep jamming! 🎶`); };
craftBtn.onclick=()=>{
  initAudio(); actx.resume();
  if(activeTool){ activeTool=null; renderBag(); }                 // drop any picked tool first
  if(trayMode && traySel.length){ fusePick(); return; }           // Fuse crafts the Scoop pick
  fuseField();                                                    // no pick: a lone 2–3-seed stack fuses in ONE press; an ambiguous field arms Scoop with a hint
};
tempoEl.oninput=()=>{ tempoOnLoan=null; Transport.retime(); };   // the child set it by hand: the loan is over
tempoEl.onchange=()=>{ saveUserSettings(); questCommitSetting("tempo"); };   // "change", not "input": a deliberate set, not a drag
instrEl.onchange=()=>{ if(SAMPLED[instrEl.value]) loadSamples(instrEl.value); saveUserSettings(); questCommitSetting("voice"); };
document.getElementById("clear").onclick=()=>{ tx("clear",()=>{ wipe(); if(drumsOn) wipeDrums(); }); checkLevel(); };   // one press = one undo step
// A patch is a BAR when the song has one, and 16 steps when it does not (today's behaviour, untouched).
const moreBtn=document.getElementById("more"); moreBtn.onclick=()=>addColumns(barCols());
const lessBtn=document.getElementById("less"); lessBtn.onclick=()=>removeColumns(barCols());
const meterEl=document.getElementById("meter"), meterCtlEl=document.getElementById("meterCtl"),
      pickupEl=document.getElementById("pickup"), pickupCtlEl=document.getElementById("pickupCtl"),
      clickEl=document.getElementById("click"), clickCtlEl=document.getElementById("clickCtl");
if(clickEl) clickEl.onchange=()=>{ clickMode=clickEl.value;
  // The settings sink, not a package save: this control only ever appears in the Studio, which has no
  // package to save, and the old package save returned there without persisting anything.
  saveUserSettings();                                        // an explicit change: the player chose this
  if(clickMode==="off") setStatus("Click off 🌱");
  else setStatus(clickMode==="both"
    ? "🥁 A count-in before ▶, then a tick on every beat."
    : "🥁 A count-in before ▶ — listen for the beat, then come in."); };
function setMeter(preset, originCols){
  // normalizeGroove runs INSIDE the transaction on purpose: grooveIdx is part of snapState, so a fallback
  // journalled outside it would let undo restore the old meter beside the new groove.
  let swapped=false;
  tx("meter",()=>{ doc.meterMap = validMeter(preset, originCols);       // one gate for the picker and for share links alike
    swapped=normalizeGroove(); });
  clearLoopRange(); _tintKey=null;   // the bars a range pointed at may be gone, and the pad-tint memo is keyed on the meter
  syncMeterUI(); rebuildField();     // the pad tint is baked at BUILD time, so the beat lane has to be rebuilt
  // Say it out loud. The band changing under you is the most surprising thing a meter change does, and a
  // silent swap reads as the game LOSING your choice rather than making one.
  if(swapped) setStatus("💃 The band changed to <b>"+GROOVES[grooveIdx].name+"</b> — that one knows the steps! 🎶"); }
// ONE function, and every path that can change the meter goes through it — setMeter, undo, song load,
// level entry. Without it, undo restores the PICTURE while the select still reports the undone meter.
function syncMeterUI(){ const m=meterAt(),
      studio=isStudioScope();
  if(meterCtlEl)  meterCtlEl.style.display = studio ? "" : "none";
  if(pickupCtlEl) pickupCtlEl.style.display = (studio && m) ? "" : "none";   // a pick-up is meaningless with no bars to come before
  if(meterEl)  meterEl.value  = m ? m.preset : "";
  if(pickupEl) pickupEl.value = m ? String(Math.round(m.originTick/TICKS_PER_COL)) : "0";
  if(clickCtlEl) clickCtlEl.style.display = (studio && m) ? "" : "none";   // a click needs a beat to sit on
  if(clickEl) clickEl.value = clickMode;
  renderGrooveOptions();                   // …and the band, which not every meter can borrow
  syncJamForMeter(); syncPatchCopy(); renderBars(); }
if(meterEl)  meterEl.onchange =()=>setMeter(meterEl.value, +pickupEl.value||0);
if(pickupEl) pickupEl.onchange=()=>setMeter(meterEl.value, +pickupEl.value||0);
// Jam was disabled for 3/4 and 6/8 from 2026-08-28 until the dances existed, because the shipped grooves
// are a 16-column cycle that crosses every barline of a six-column bar. Waltz and Jig now bring their own,
// so every meter has a band and the button is never dark. What remains is keeping the groove and the meter
// in step: normalizeGroove moves an incompatible pair, and the select lists only what can actually play.
function jamFitsMeter(){ return grooveChoices().length>0; }
function syncJamForMeter(){ jamBtn.disabled=false; jamBtn.title=""; }
// The <select> was built once at load; it is rebuilt whenever the meter changes. option.value stays the
// ARRAY INDEX and never the position in the filtered list — that index is what songs save.
function renderGrooveOptions(){
  if(!grooveEl) return;
  normalizeGroove();                       // …or grooveEl.value below would land on "" and show blank
  grooveEl.innerHTML="";
  for(const {G,i} of grooveChoices()){
    const o=document.createElement("option"); o.value=i; o.textContent=G.name; grooveEl.appendChild(o); }
  grooveEl.value=String(grooveIdx); }
// §17's round-1 review found "one more bar (16 steps)" among nine places the four-column beat is asserted
// in shipped copy. Saying "steps" SIDESTEPS that open question rather than answering it — which is the
// point: the words-fix for those nine is its own scheduled job, not this slice's to do.
function syncPatchCopy(){ const m=meterAt(), k=barCols();
  if(moreBtn) moreBtn.title = m ? `Add one more bar (${k} steps) at the end`
                               : "Add a whole patch of room — 16 more steps at the end";
  if(lessBtn) lessBtn.title = m ? `Take back the last bar (${k} steps)`
                               : "Take back the last patch — 16 steps"; }
const moreMenu=document.getElementById("moremenu"), roomGroup=document.getElementById("roomgroup");
// ONE keyboard handler, a priority ladder — never two listeners fighting over the same key (design-panel rule).
function overlayUp(){ return ["powoverlay","congratsoverlay","moverlay","homeoverlay","landingoverlay","compoverlay","instroverlay","mixoverlay","questfinale","cardoverlay"]
  .some(id=>{ const el=document.getElementById(id); return el && getComputedStyle(el).display!=="none"; }); }
document.addEventListener("keydown",e=>{
  const t=e.target;
  if(t && (t.tagName==="INPUT"||t.tagName==="SELECT"||t.tagName==="TEXTAREA")) return;   // native editing wins
  if(e.key==="Escape"){
    if(!sideTools.hidden){ setSideMenu(false); return; }                                          // 0. close the ☰ menu
    if(trayPlace){ trayPlace=null; clearGhosts(); setStatus("Copy put away."); return; }          // 1. cancel a pending copy
    if(trayDrag){ trayCancelGesture(); return; }                                                  // 2. cancel the gesture, keep the pick
    if(trayMode && traySel.length){ traySel=[]; trayPaint(); setStatus("Pick emptied 🧺 — drag a new box, or press ✕ Done."); return; }  // 3. drop the pick
    if(trayMode){ exitTray(); setStatus("Plant seeds 🌱, or 🔨 Fuse to craft."); return; }        // 4. leave the tray
    activeTool=null; renderBag();                                                                 // 5. drop an armed stamp tool
    setStatus("Plant seeds 🌱, or 🔨 Fuse to craft."); return; }
  if(overlayUp()) return;                                    // shortcuts sleep while a card/menu is up
  if((e.ctrlKey||e.metaKey) && (e.key==="z"||e.key==="Z")){ e.shiftKey?redoEdit():undoEdit(); e.preventDefault(); return; }
  if((e.ctrlKey||e.metaKey) && (e.key==="y"||e.key==="Y")){ redoEdit(); e.preventDefault(); return; }
  // duration: plain letters, so nothing shipped loses a key. NOT Shift+Arrow — the tray rung below matches a
  // bare e.key with no modifier test, so Shift+ArrowRight ALREADY nudges a pick, and two behaviours
  // negotiating one key is the thing this ladder exists to prevent.
  if(canGrow() && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat){   // no auto-repeat: one press is one journal
    if(e.key==="g"||e.key==="G"){ growTrim(+1); e.preventDefault(); return; }   // entry, and JOURNAL_MAX is 100 — a
    if(e.key==="t"||e.key==="T"){ growTrim(-1); e.preventDefault(); return; } } // stuck key would roll away real edits
  if(trayMode && traySel.length){
    if(e.key==="Delete"||e.key==="Backspace"){ document.getElementById("trayDel").onclick(); e.preventDefault(); return; }
    const nudge={ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1]}[e.key];
    if(nudge){ trayMove(nudge[0],nudge[1]); e.preventDefault(); return; } }
  // the cursor, LAST so a pick keeps the plain arrows for nudging. Not gated on canGrow(): the cursor belongs
  // to every package (＋/－ room already work there), and #cursorStrip is pointer-only, so without this the
  // cursor is frozen at column 0 for anyone not using a mouse or a finger.
  if(!e.ctrlKey && !e.metaKey && !e.altKey && (e.key==="ArrowLeft"||e.key==="ArrowRight")){
    const c2=cursorCol+(e.key==="ArrowRight"?1:-1);
    if(c2<0||c2>COLS-1) return;                    // at either end, leave the browser its own scrolling
    pinCursor(c2); cursorIntoView(); e.preventDefault(); return; }   // driving the cursor by hand is deliberate — ▶ will start here
});
// A mouse click leaves the button FOCUSED, silently — Chrome hides the ring for pointer input. Then the
// first plain keypress flips it into keyboard mode and rings whatever still holds focus, so pressing → to
// move the cursor lit up ▶ Play, which had nothing to do with it. Drop focus after a POINTER click only:
// `detail` is 0 when Enter/Space fires the click from the keyboard, and THAT ring is telling the truth —
// it is the only way a Tab-ing player can see where they are. Selects keep focus too, since their own
// arrow-key behaviour is native and correct.
// Capture phase, because ☰ stops its click from propagating and would otherwise keep its ring; blurring
// mid-dispatch does not cancel anything, so the button's own handler still runs (and nothing in the file
// reads document.activeElement).
document.addEventListener("click",e=>{
  const b=e.target && e.target.closest && e.target.closest("button");
  if(b && e.detail>0) b.blur(); }, true);

