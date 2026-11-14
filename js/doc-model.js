// ---------- The document model (EDITOR-DESIGN §4, Phase 0) ----------
// Notes are objects with IDs and TICK time; the boolean grid/drumG are DERIVED PROJECTIONS,
// recomputed on every mutation, so every shipped detector keeps reading grid[r][c] unchanged.
// The doc keeps the TRUE pitch even when the active palette can't show it — the lens snaps, the data doesn't.
const TG_PPQ=96, TICKS_PER_COL=48;             // canonical time: integer ticks; one column = an 8th = 48 ticks
// The longest a field grows: 240 bars of 4/4, about nine minutes at 108. Loading costs about 0.2 ms a
// column (measured in the browser, TUN-84), so this loads in half a second where a crafted link claiming a
// million columns froze the tab. A multiple of 48, so every meter's bar (4, 6 or 8 columns) and the
// unmetered 16 divide it. The Studio stops growing here and applySong clamps here — one line, so a song a
// player built always loads back whole.
const MAX_COLS=1920;
let _noteSeq=1; const newNoteId=()=>_noteSeq++;
function freshDoc(){ return { version:1, ppq:TG_PPQ,
  tempoMap:[], meterMap:[], tonalityMap:[],    // reserved seams (§4f) — stay empty until a phase needs them
  tracks:[ {id:"melody", role:"melody", notes:[]},   // note: {id,pitch,startTick,durationTicks,velocity}
           {id:"drums",  role:"drums",  notes:[]} ], // drum note: pitch = lane (0 kick · 1 snare · 2 hat)
  sections:[], arrangement:[] }; }
let doc=freshDoc();
function melTrack(){ return doc.tracks.find(t=>t.role==="melody"); }
function drumTrack(){ return doc.tracks.find(t=>t.role==="drums"); }
// ---------- Meter: what a bar is, and how it is FELT (EDITOR-DESIGN §17, owner 2026-08-27) ----------
// A meter is TWO facts, not one, and that is the whole reason this took two design rounds to settle:
// 3/4 and 6/8 are the SAME 288 ticks and differ only in GROUPING, so no single "columns per bar" number
// can express both. beats[] is therefore AUTHORED per preset and never derived (§17(5)) — derivation
// cannot separate 3/4 from 6/8 and fails outright on 5/8 and 7/8. `pulse` is what a BEAT is for a
// count-in and for reading a tempo: a jig's felt pulse is a dotted quarter, not an eighth.
const METERS={
  "4/4":{ num:4, den:4, beats:[96,96,96,96], pulse:96,  label:"March · 4/4" },
  "3/4":{ num:3, den:4, beats:[96,96,96],    pulse:96,  label:"Waltz · 3/4" },
  "6/8":{ num:6, den:8, beats:[144,144],     pulse:144, label:"Jig · 6/8" },
  "2/4":{ num:2, den:4, beats:[96,96],       pulse:96,  label:"Quick march · 2/4" } };
const barTicks=P=>P.beats.reduce((a,b)=>a+b,0);   // 384 · 288 · 288 · 192 ticks = 8 · 6 · 6 · 4 columns
// EVERY lookup goes through here, and it is an OWN-property test on purpose: `METERS[id]` alone accepts
// "toString", "constructor", "valueOf" and "__proto__", which are inherited, truthy, and have no .beats —
// so a crafted #s= link reached barTicks(P) and threw. That throw landed INSIDE applySong's tx, after the
// palette, COLS and both tracks had been written and before reproject/rebuildField, leaving the Studio
// holding a stranger's notes behind a stale grid. decodeSong's try/catch is upstream and never saw it.
function meterDef(id){ return (typeof id==="string" && Object.prototype.hasOwnProperty.call(METERS,id)) ? METERS[id] : null; }
// meterMap [] means UNMETERED — no bars, exactly today's picture on every shipped level. A LIST and not a
// scalar because §4f reserved meterMap as a map: mid-song meter changes are out of scope by the owner's
// call rather than nailed shut.
function meterAt(){ return doc.meterMap.length ? doc.meterMap[0] : null; }
function meterPreset(){ const m=meterAt(); return m ? meterDef(m.preset) : null; }
const barCols=()=>{ const P=meterPreset(); return P ? barTicks(P)/TICKS_PER_COL : 16; };   // unmetered: today's 16
// (cols, meter) -> {segs, marks}. PURE — no DOM, no globals beyond the constants — because NO GOLDEN CAN
// SEE A BARLINE. All nine playback goldens pin scheduling and are completely blind to drawing, so unit
// tests over this function are the only place bar positions are ever actually checked.
//   segs  = the strip's chips, CLIPPED TO COLS. A 16-column waltz's last bar really is 4 columns wide, and
//           an unclipped chip would push .scroller's scrollable area past the grid, desyncing the camera.
//   marks = {c,kind} for both overlays AND the drum pad tint, so three renderers cannot disagree.
// EVERY PULSE THE METER PUTS IN A TICK RANGE. Pure, in TICKS rather than columns, defined for NEGATIVE
// ticks, and phased on the DOWNBEAT rather than on tick 0 — the three properties a count-in needs and
// meterLayout could not offer, since it clips to `c>=0 && c<cols` and so cannot describe the region
// before a song starts at all.
//
// **Phased on originTick, and that is the whole point.** A first draft of the count-in positioned its
// clicks relative to transport tick zero while the bars are phased on the origin, which for a one-column
// pickup counts you in exactly half a beat wrong — a count-in landing you on the wrong beat has no other
// job to fail at. §17(4) made originTick mandatory for precisely this class of error; bar phase now has
// ONE owner, and meterLayout below is a projection of it rather than a second opinion.
function pulsesIn(m, fromTick, toTick){
  const P=m && meterDef(m.preset); if(!P) return [];
  const bt=barTicks(P), o=m.originTick||0;
  const out=[];
  // start at the bar CONTAINING fromTick — floor, so it is the bar at or before it even when negative
  for(let i=Math.floor((fromTick-o)/bt); ; i++){
    const barAt=o+i*bt;
    if(barAt>=toTick) break;                                  // its beats are later still, so nothing is missed
    if(barAt>=fromTick) out.push({tick:barAt, kind:"bar", bar:i+1});   // bar 1 starts at the origin
    let t=0;
    for(let k=0;k<P.beats.length-1;k++){ t+=P.beats[k];       // beat 1 IS the barline; emit 2..n
      const at=barAt+t;
      if(at>=fromTick && at<toTick) out.push({tick:at, kind:"beat", bar:i+1}); } }
  return out;
}
function meterLayout(cols, m){
  const P=m && meterDef(m.preset); if(!P) return {segs:[], marks:[]};
  const bc=barTicks(P)/TICKS_PER_COL, oc=Math.round(m.originTick/TICKS_PER_COL);
  // The pickup is bar 0 and goes UNNUMBERED: a child counting "one" on the downbeat has to be right, and
  // a chip labelled "0" teaches the opposite. §17(4) makes originTick mandatory precisely because Moldau's
  // downbeat is at column 1 and Amazing Grace and Taps open with pickups — without an origin the barlines
  // are wrong even when the signature is right.
  const segs=[];
  if(oc>0) segs.push({n:0, c0:0, cols:Math.min(oc,cols), pickup:true});
  for(let c0=oc, i=1; c0<cols; c0+=bc, i++)
    segs.push({n:i, c0, cols:Math.min(bc,cols-c0), partial:c0+bc>cols});
  // …and the marks are simply the pulses of the field's own tick span, projected onto columns. Every
  // preset's bar and beat lengths are whole multiples of TICKS_PER_COL, which is what makes that a
  // division rather than a rounding — asserted rather than assumed, because 6/16 would break it.
  const marks=pulsesIn(m, 0, cols*TICKS_PER_COL).map(u=>({c:u.tick/TICKS_PER_COL, kind:u.kind}));
  return {segs, marks};
}
// Which columns carry the pulse, AND which kind. Memoised because buildDrums asks once PER PAD — three
// lanes × COLS — and a metronome will ask once per column inside the booking loop. A Map rather than a
// Set because an accent needs to know a barline from a beat; `has` reads the same either way.
let _tintKey=null, _tintMap=null;
function beatColMap(){ const m=meterAt(), key=m ? COLS+"|"+m.preset+"|"+m.originTick : "";
  if(key!==_tintKey){ _tintKey=key;
    _tintMap = m ? new Map(meterLayout(COLS,m).marks.map(k=>[k.c,k.kind])) : null; }
  return _tintMap; }
const beatColSet=beatColMap;                       // the old name, for anything that only asks `has`
function pulseKindAt(c){ const t=beatColMap(); return t ? (t.get(c)||null) : null; }
// The pads have tinted every 4th column since the rhythm packages shipped, and UNMETERED that stays
// exactly, byte-identically true on every level. Metered, the tint follows the bar's own authored pulse —
// because the Studio opens with drums ON, so melody beat marks every 2 columns beside a pad tint every 4
// would put BOTH conventions on one screen, which is precisely what §17's first review round killed a
// draft for. Only the Studio can set a meter, so no shipped level reaches the metered branch.
const beatTintAt=c=>{ const t=beatColMap(); return t ? t.has(c) : c%4===0; };
// row for a pitch in a GIVEN palette's pitch set: exact match, else nearest.
// Pure: the caller supplies the ladder, so a saved song can be projected under the palette it was
// written in rather than whichever one happens to be loaded.
function projRowIn(p, midi){ let best=null,bd=Infinity;
  for(let r=0;r<midi.length;r++){ const d=Math.abs(midi[r]-p); if(d===0) return r; if(d<bd){ bd=d; best=r; } }
  return best; }
// row for a pitch in the ACTIVE palette: exact match, else nearest (cross-palette songs snap for display only)
function projRow(p){ return projRowIn(p, MIDI); }
function noteCol(n){ return Math.round(n.startTick/TICKS_PER_COL); }
// doc tracks → the legacy boolean grids, under a NAMED palette and column span, reading nothing global.
// This is the seam that lets a quest analyse a saved A/B snapshot: applySong() would rewrite the live
// document to inspect it, destroying the player's current work, so analysis must never go through it.
// The palette is a parameter because a v3 song carries its own — projecting one song's notes under
// another's ladder snaps pitches to different rows and silently changes what the detectors see.
function projectTracks(tracks, palId, span){
  const pal=PALETTES[palId]; if(!pal) throw new Error("projectTracks: unknown palette "+palId);
  const midi=pal.MIDI, rows=midi.length;
  const grid=Array.from({length:rows},()=>Array(span).fill(false));
  const gridNote=Array.from({length:rows},()=>Array(span).fill(null));
  const drumG=DRUMS.map(()=>Array(span).fill(false));
  const mel=tracks.find(t=>t.role==="melody"), dr=tracks.find(t=>t.role==="drums");
  // ONSET-ONLY, and it must stay that way: a vine changes note-OFF, never note-ON, so every shipped
  // detector keeps reading exactly what it reads today. gridNote rides along in the same sweep as the
  // note behind each lit cell — the duration lookup at play time, and the vine layer's hit test.
  if(mel) for(const n of mel.notes){ const r=projRowIn(n.pitch, midi), c=noteCol(n);
    if(r!=null&&c>=0&&c<span){ grid[r][c]=true; gridNote[r][c]=n; } }
  if(dr) for(const n of dr.notes){ const c=noteCol(n);
    if(n.pitch>=0&&n.pitch<DRUMS.length&&c>=0&&c<span) drumG[n.pitch][c]=true; }
  return { grid, gridNote, drumG, rows, span, palette:palId };
}
function reproject(){                          // doc → the legacy boolean grids (the detector adapter, §15)
  const p=projectTracks(doc.tracks, paletteId, COLS);
  grid=p.grid; gridNote=p.gridNote; drumG=p.drumG;
}
// Every mutation is a transaction: a snapshot journal feeds undo/redo + autosave. Snapshots carry
// palette + COLS too, so undoing a resize (or any op near one) restores the whole editing surface.
const JOURNAL_MAX=100; let journal=[], journalRedo=[];
// tempo + groove are SONG state (v3 time.tempo/groove) — they snapshot and restore with the notes,
// which is what makes undoing a famous reveal also return the player's tempo.
// meter rides along too (§17's own trap note: "meter must join it or undo silently fails to restore a
// meter change"). Snapshots are in-memory only — nothing persisted reads this shape — so the extra field
// costs no compatibility.
function snapState(){ return JSON.stringify({palette:paletteId, cols:COLS, tempo:+tempoEl.value, groove:grooveIdx, meter:doc.meterMap, tracks:doc.tracks}); }
// scripted placements (level setup, reveals, choices, song loads) journal for undo but must NEVER
// claim the player's autosave slot — the rescued sprout holds PLAYER work only.
const SCRIPTED_TX=new Set(["place","famous","choice","load-song","palette"]);
let _txDepth=0, _txBefore=null, _txLabel=null;
function tx(label,fn){
  if(_txDepth===0){ _txBefore=snapState(); _txLabel=label; }
  _txDepth++; try{ fn(); } finally{ _txDepth--; }
  if(_txDepth===0){ const after=snapState();
    if(after!==_txBefore){ journal.push({label:_txLabel,before:_txBefore,after});
      if(journal.length>JOURNAL_MAX) journal.shift();
      journalRedo=[]; if(!SCRIPTED_TX.has(_txLabel)) noteEdit(_txLabel); syncUndoUI(); } }
}
// Set while the player is listening to a version that is NOT the draft — the comparison phase applies
// A and B in turn to hear them. Declared here, immediately above its only reader, because an edit is
// the one thing that must never happen through it: writing the applied song back would persist A over
// draft B. The shell locks the grid on top of this; this is the floor underneath that lock.
// The listening lock is gone with step E: a path being heard is the path being held, so the state it
// guarded — one version on the grid while another was the write target — cannot occur. Undo is
// ordinary again here, which was the remedy I argued against in D5 and is now simply true.
// Set while the GAME is arranging the field — clearing it, re-applying a draft — rather than the
// player editing it. resetTransient() wipes and re-truncates through tx(), so without this a repaint
// would land in the run as a real edit.
let questPainting=false;
// The edit that did not reach the store. noteEdit used to throw its transaction's answer away, so a
// failed write left the live field one edit ahead of the run in total silence — and then advancing
// forks the STORED version and repaints, taking the child's note with it.
//
// It is keyed to the run and version it happened on, and only another EDIT write for that same pair
// can discharge it: an edit carries the whole current song, so a later one saves what the failed one
// could not. A playback receipt or a path selection succeeding says nothing about this note, and a
// single boolean cleared by any successful write would announce "saved" over it.
let questUnsavedEdit=null;
const questHasUnsavedEdit = (runId, versionId) => !!questUnsavedEdit
  && questUnsavedEdit.runId===runId && questUnsavedEdit.versionId===versionId;

// A player edit. Outside a quest this is the shipped rolling autosave. Inside one, the run is the
// record instead: the completion session is forfeited (a pass booked from the old revision must not
// credit the new one) and the version's editRev advances, which is what makes the Q6 gate false again.
function noteEdit(label){
  if(!isQuestScope()){ scheduleAutosave(); return; }
  cancelCompletionSession("edit");
  if(questPainting) return;   // the game arranging the field is not the player editing it
  const run=QUEST_RUNS[activeScope.runId]; if(!run || run.status!=="active") return;
  const v=run.versions[run.draft]; if(!v) return;
  const song=currentSong();
  const r=transactQuestRun(activeScope.runId, [{ type:"edit", target:"song", versionId:run.draft,
    baseRev:v.editRev, song, span:{start:0,end:song.time.cols}, at:Date.now() }]);
  if(r.ok){ if(questHasUnsavedEdit(activeScope.runId, run.draft)) questUnsavedEdit=null; }
  else questUnsavedEdit={ runId:activeScope.runId, versionId:run.draft };
  renderQuestShell();   // an edit shuts the playback gate, so the button that was lit must go out
}
// undo/redo: restore a full snapshot (palette vars + COLS + tracks), reproject, rebuild, recheck.
// Never runs through tx() — an undo must not journal itself.
function restoreSnapshot(json){ const s=JSON.parse(json);
  if(s.palette!==paletteId){ const p=PALETTES[s.palette]||PALETTES.pentatonic;
    paletteId=p.id; MIDI=p.MIDI; NAMES=p.NAMES; TONIC_PC=p.tonicPC; ROWS=MIDI.length; }
  COLS=s.cols; doc.tracks=s.tracks;
  doc.meterMap = Array.isArray(s.meter) ? s.meter : [];
  clearLoopRange();                          // the bars a loop range pointed at may not exist in this snapshot
  if(typeof s.tempo==="number"){ tempoEl.value=s.tempo; Transport.retime(); }
  if(typeof s.groove==="number"&&GROOVES[s.groove]){ grooveIdx=s.groove; grooveEl.value=s.groove; }
  clearFamousTimers();                       // stale flash timers must not fire on the rebuilt field
  trayPlace=null; clearGhosts();             // an armed copy's geometry is stale against the restored field
  reproject(); rebuildField();               // rebuildField prunes the tray selection to surviving ids
  applyStageDecor();                         // the rebuilt cells need the stage's tints back (phrase split, beat guide, locks…)
  syncMeterUI();                             // …and the meter CONTROLS, or undo restores the picture while the select still reports the undone meter
  ev.played=false; noteEdit("undo"); syncUndoUI(); checkLevel(); updateGarden(); }
// re-apply the current stage's per-cell decorations after any mid-stage rebuild (undo, time surgery)
function applyStageDecor(){ if(!activeScope||!currentLevel()) return;
  const L=currentLevel(), st=curStage();
  setBeatGuide(!!st.beatGuide); setPhraseGuide(!!(L.phrase||st.phrase));
  setColorReveal(st.colors||L.colors||null); setMood(st.mood||L.mood||null); setMotifGuide(!!(st.motif||L.motif));
  // A quest's rings are decoration of the same kind: a rebuild drops them with the cells. Undo rebuilt the
  // field and re-tinted it but never re-ringed it, so the dealt stones and opening read as the player's own
  // after a single undo. Found by GPT's review.
  if(isQuestScope()){ const run=QUEST_RUNS[activeScope.runId];
    questMarkLandmarks(run, run && QUEST_DEFINITIONS[run.questId]); } }
function undoEdit(){
  const e=journal.pop(); if(!e) return;
  if(playing) stop();                        // also unwinds a running reveal's restore hook safely
  journalRedo.push(e); restoreSnapshot(e.before); setStatus("↶ Undone — the garden stepped back 🌱"); }
// The same guard, which today cannot fire: tx() empties journalRedo on every commit, and applying the
// audition's song IS a commit, so the redo stack is always empty while a lock is held. Kept because it
// costs nothing and the day that stops being true is not a day anyone will remember to check — but no
// test asserts it, because no test could tell it from its absence.
function redoEdit(){
  const e=journalRedo.pop(); if(!e) return;
  if(playing) stop();
  journal.push(e); restoreSnapshot(e.after); setStatus("↷ Redone 🌱"); }
function journalClear(){ journal.length=0; journalRedo.length=0; syncUndoUI();
  clearTimeout(autosaveT); }   // every journalClear site means "this state is not player work" — a pending autosave must not claim the rescue slot
function syncUndoUI(){ const u=document.getElementById("undoBtn"), r=document.getElementById("redoBtn");
  if(u) u.disabled=!journal.length;
  if(r) r.disabled=!journalRedo.length; }   // redo is always THERE, just greyed until an undo makes it meaningful — same language as undo (a hidden button left a hole beside ↶)
// ---- model operations (the only writers; everything else reads the projection) ----
function modelSetCell(r,c,on){ tx(on?"plant":"unplant",()=>{ const t=melTrack();
  if(on){ if(!t.notes.some(n=>projRow(n.pitch)===r&&noteCol(n)===c))
    t.notes.push({id:newNoteId(),pitch:MIDI[r],startTick:c*TICKS_PER_COL,durationTicks:TICKS_PER_COL,velocity:1}); }
  else t.notes=t.notes.filter(n=>!(projRow(n.pitch)===r&&noteCol(n)===c));
  if(grid[r]) grid[r][c]=on;
  if(gridNote[r]) gridNote[r][c]=on?t.notes[t.notes.length-1]:null; }); }   // this path patches the projection instead of reprojecting — keep the twin in step
function modelClearMelody(){ tx("wipe",()=>{ melTrack().notes=[]; reproject(); }); }
function modelSetDrum(d,c,on){ tx(on?"drum-on":"drum-off",()=>{ const t=drumTrack();
  if(on){ if(!t.notes.some(n=>n.pitch===d&&noteCol(n)===c))
    t.notes.push({id:newNoteId(),pitch:d,startTick:c*TICKS_PER_COL,durationTicks:TICKS_PER_COL,velocity:1}); }
  else t.notes=t.notes.filter(n=>!(n.pitch===d&&noteCol(n)===c));
  drumG[d][c]=on; }); }
function modelClearDrums(){ tx("wipe-drums",()=>{ drumTrack().notes=[]; reproject(); }); }
function modelPlaceDrums(list){ tx("place-drums",()=>{ const t=drumTrack();
  list.forEach(([d,c])=>{ if(!t.notes.some(n=>n.pitch===d&&noteCol(n)===c))
    t.notes.push({id:newNoteId(),pitch:d,startTick:c*TICKS_PER_COL,durationTicks:TICKS_PER_COL,velocity:1});
    drumG[d][c]=true; }); }); }
function modelSetCols(cols){ tx("resize",()=>{ const lim=cols*TICKS_PER_COL;   // shrink truncates, like the old grid did
  melTrack().notes=melTrack().notes.filter(n=>n.startTick<lim);
  drumTrack().notes=drumTrack().notes.filter(n=>n.startTick<lim);
  for(const n of melTrack().notes) n.durationTicks=Math.max(TICKS_PER_COL,Math.min(n.durationTicks,lim-n.startTick));  // a vine can't hang past the field's end
  COLS=cols; reproject();
  if(loopEnd>COLS) clearLoopRange(); }); }   // a shrink can leave a loop range pointing past the field
// time surgery (R4): insert or remove a span of musical time — the WHOLE timeline shifts, drums included
// Time surgery moves the MUSIC; the meter has to come with it or the barlines detach from the notes on
// the first ＋/－ room. Only an edit at or before the downbeat moves bar 1 — one made after it leaves bar 1
// where it is. The modulo matters: an origin is a PICKUP, always a fraction of a bar, so it wraps rather
// than growing into "bar 1 starts three bars in".
function shiftMeterOrigin(atTick, delta){
  const m=meterAt(), P=meterPreset(); if(!m||!P) return;
  if(atTick>m.originTick) return;
  const bt=barTicks(P); m.originTick=((m.originTick+delta)%bt+bt)%bt; }
function modelInsertTime(atTick,ticks){ tx("insert-time",()=>{
  for(const t of doc.tracks) for(const n of t.notes){
    if(n.startTick>=atTick) n.startTick+=ticks;
    else if(t.role==="melody" && n.startTick+n.durationTicks>atTick)                            // ＋room INSIDE a vine stretches it rather than cutting it in half —
      n.durationTicks=Math.min(n.durationTicks+ticks, MAX_VINE*TICKS_PER_COL); }                // but never past the ceiling 🌿 Grow itself refuses to cross
  shiftMeterOrigin(atTick, ticks);
  COLS+=Math.round(ticks/TICKS_PER_COL); reproject(); clearLoopRange(); }); }   // the bars just moved: a range in bar coordinates is stale
function modelRemoveTime(atTick,ticks){ tx("remove-time",()=>{
  ticks=Math.min(ticks, Math.max(0, COLS*TICKS_PER_COL-atTick));   // a span can't overhang the timeline — otherwise notes before it get stranded past the shrunk COLS
  if(ticks<=0) return;
  for(const t of doc.tracks){
    t.notes=t.notes.filter(n=>n.startTick<atTick||n.startTick>=atTick+ticks);
    for(const n of t.notes){
      if(n.startTick>=atTick+ticks) n.startTick-=ticks;
      else if(t.role==="melody" && n.startTick+n.durationTicks>atTick)                    // －room INSIDE a vine shortens it,
        n.durationTicks=Math.max(TICKS_PER_COL, n.durationTicks-ticks); } }               // but never below its own onset column
  shiftMeterOrigin(atTick, -ticks);
  // － room assigns COLS directly, so modelSetCols's guard never runs: a range on the last bar survived
  // every press and collapsed to loopA()=16 / loopB()=17 — the one-column loop loopB()'s own comment
  // claims to prevent. Measured from COLS=24 with a range on [16,24) after seven presses.
  COLS=Math.max(16,COLS-Math.round(ticks/TICKS_PER_COL)); reproject(); clearLoopRange(); }); }
// R19 write side: a rolling autosave of the working song (the recovery UI lands in Phase 1)
let autosaveT=null;
function scheduleAutosave(){ clearTimeout(autosaveT); autosaveT=setTimeout(()=>{ try{
  const s=currentSong();
  if(!s.tracks[0].notes.length && !s.tracks[1].hits.length) return;      // nothing worth rescuing
  Store.set("autosave",{ when:Date.now(), context:(activeScope?scopeAutosaveContext():null), song:s });
}catch(e){} },1500); }

