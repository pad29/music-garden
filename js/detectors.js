// ---------- Follow the Fireflies: melodic contour (package PS-1) ----------
// contour = a melody's shape over time; read the TOP note per occupied column as a height (0=low … ROWS-1=high)
// Pure: the caller supplies the grid, so a quest can read the shape of a SAVED song without loading it
// into the editor. The live reader is now a wrapper — one contour rule, two callers, and every shipped
// level keeps reading exactly what it read before.
function contourSeqFromGrid(g, rows, span){ const seq=[];
  for(let c=0;c<span;c++){ for(let r=0;r<rows;r++){ if(g[r][c]){ seq.push((rows-1)-r); break; } } } return seq; }
function contourSeq(){ return contourSeqFromGrid(grid, ROWS, COLS); }
const netRise = seq => seq.length<2?0:seq[seq.length-1]-seq[0];
function dirSteps(seq){ let up=0,down=0; for(let i=1;i<seq.length;i++){ if(seq[i]>seq[i-1])up++; else if(seq[i]<seq[i-1])down++; } return {up,down}; }
function maxDrop(seq){ let m=0; for(let i=1;i<seq.length;i++) m=Math.max(m,seq[i-1]-seq[i]); return m; }
function maxRise(seq){ let m=0; for(let i=1;i<seq.length;i++) m=Math.max(m,seq[i]-seq[i-1]); return m; }
// significant turning points (prominence>=prom merges tiny wiggles): one hill = ['peak'], two hills = ['peak','valley','peak']
function extrema(seq, prom=2){ const res=[]; if(seq.length<2) return res; let dir=0, ext=seq[0];
  for(let i=1;i<seq.length;i++){ const v=seq[i];
    if(dir===1){ if(v>ext) ext=v; else if(ext-v>=prom){ res.push("peak"); dir=-1; ext=v; } }
    else if(dir===-1){ if(v<ext) ext=v; else if(v-ext>=prom){ res.push("valley"); dir=1; ext=v; } }
    else { if(v-ext>=1){ dir=1; ext=v; } else if(ext-v>=1){ dir=-1; ext=v; } } }
  return res; }
const hillCount = seq => extrema(seq).filter(x=>x==="peak").length;
const isRising  = seq => seq.length>=3 && netRise(seq)>=3 && dirSteps(seq).up>dirSteps(seq).down;   // lenient: allows wiggle
const isFalling = seq => seq.length>=3 && netRise(seq)<=-3 && dirSteps(seq).down>dirSteps(seq).up;
const isHovering= seq => seq.length>=4 && (Math.max(...seq)-Math.min(...seq))<=2 && Math.abs(netRise(seq))<=1; // level, several notes, ends near start (no sneaky descent)
const isArch    = seq => seq.length>=4 && hillCount(seq)===1;                                       // exactly one hill
const isTwoArcs = seq => seq.length>=5 && hillCount(seq)>=2;                                        // two hills in a row (harder)
const isSmoothRise = seq => seq.length>=3 && netRise(seq)>=3 && maxDrop(seq)<=1;                    // a clean climb (repair)
const isSmoothFall = seq => seq.length>=3 && netRise(seq)<=-3 && maxRise(seq)<=1;                   // a clean descent (repair)
const isJourney = seq => seq.length>=6 && extrema(seq).length>=2;                                   // a real journey: 2+ turns

// ---------- Stepping Stones: stepwise motion vs leaps (package PS-2) ----------
// motion = the row-distance between consecutive notes: 1 rung = a step, 2 = small leap, 3+ = a big/bold leap
function motionsOf(){ const s=contourSeq(); const m=[]; for(let i=1;i<s.length;i++) m.push(s[i]-s[i-1]); return m; }   // signed
const absMo = () => motionsOf().map(Math.abs);
function isStepwise(){ const s=contourSeq(); if(s.length<4) return false; const a=absMo(); return a.every(d=>d<=1) && a.filter(d=>d===1).length>=2; }      // only steps
function isOneJump(){ const s=contourSeq(); if(s.length<4) return false; const a=absMo(); return a.filter(d=>d>=3).length===1 && a.every(d=>d>=3||d<=1); }  // one big leap, rest steps
function isGentle(){ const s=contourSeq(); if(s.length<4) return false; const a=absMo(); return a.every(d=>d<=2) && a.filter(d=>d<=1).length>=Math.ceil(a.length/2); }  // smooth: no big leaps, mostly steps
function isBold(){ const s=contourSeq(); if(s.length<4) return false; return absMo().filter(d=>d>=2).length>=2; }                                          // bold: 2+ leaps
function isStaircase(){ const m=motionsOf(); let best=0,run=0,prev=0; for(const d of m){ if(d===1||d===-1){ if(d===prev) run++; else { run=1; prev=d; } } else { run=0; prev=0; } if(run>best) best=run; } return best>=4; }  // 4+ steps in a row, same way
function isLandSoftly(){ const m=motionsOf(); for(let i=0;i<m.length-1;i++) if(Math.abs(m[i])>=3 && Math.abs(m[i+1])===1 && Math.sign(m[i+1])===-Math.sign(m[i])) return true; return false; }  // a big leap, then a step back the other way
function isRiverCrossing(){ const s=contourSeq(); if(s.length<5) return false; const a=absMo(); return a.filter(d=>d>=3).length>=1 && a.filter(d=>d<=1).length>=Math.ceil(a.length/2); }  // mostly steps + one bold leap

// ---------- Tiny Motifs: a short idea, repeated & varied (package PS-4) ----------
// A "motif" is a small run of notes read as a WINDOW of columns. We compare windows by their
// interval signature (row-to-row moves) so "the same idea" is recognized wherever it sits or however it's tinted.
const MOTIF_W = 4;                                    // motif window = 4 columns
// heights (0..ROWS-1) of the top note per column in [lo,hi); null for an empty column (position-aware, unlike halfSeq)
function windowHeights(lo,hi){ const out=[]; for(let c=lo;c<hi;c++){ let h=null; for(let r=0;r<ROWS;r++){ if(grid[r][c]){ h=(ROWS-1)-r; break; } } out.push(h); } return out; }
const windowNotes = w => windowHeights(w*MOTIF_W,(w+1)*MOTIF_W).filter(h=>h!==null);   // just the notes, gaps dropped
const windowCount = w => windowNotes(w).length;
const intervalsOf = hs => { const m=[]; for(let i=1;i<hs.length;i++) m.push(hs[i]-hs[i-1]); return m; };  // signed row-moves
const sameArr = (a,b) => a.length===b.length && a.every((x,i)=>x===b[i]);
const signArr = a => a.map(Math.sign);
// two windows share a motif at three strictness levels (each needs the SAME note-count, ≥3 notes)
function motifExactRepeat(a,b){ const A=windowNotes(a),B=windowNotes(b); return A.length>=3 && sameArr(A,B); }               // identical notes
function motifEcho(a,b){ const A=windowNotes(a),B=windowNotes(b);                                                            // same intervals, shifted in pitch (transposed echo)
  return A.length>=3 && A.length===B.length && sameArr(intervalsOf(A),intervalsOf(B)) && A[0]!==B[0]; }
function motifVariation(a,b){ const A=windowNotes(a),B=windowNotes(b);                                                       // same up/down contour, but genuinely reshaped (not an exact repeat, not a pure transposition/echo)
  if(A.length<3 || A.length!==B.length) return false;
  const ia=intervalsOf(A), ib=intervalsOf(B);
  return sameArr(signArr(ia),signArr(ib)) && !sameArr(ia,ib); }                                                              // same directions, different step sizes
function motifInversion(a,b){ const A=windowNotes(a),B=windowNotes(b);                                                       // flipped contour: every move reversed (up↔down)
  const ia=intervalsOf(A), ib=intervalsOf(B); return A.length>=3 && ia.length===ib.length && ia.length>0 && ia.every((x,i)=>x===-ib[i]); }
// a target motif can be pre-planted (setup) in window 0; these read it back for comparisons
const motifRef = () => windowNotes(0);
// count how many later windows (1..3) echo/repeat/vary the motif in window 0
function motifFamilyCount(kind){ let n=0; for(let w=1;w<Math.floor(COLS/MOTIF_W);w++){
  const ok = kind==="repeat"?motifExactRepeat(0,w) : kind==="echo"?motifEcho(0,w) : kind==="vary"?motifVariation(0,w)
    : (motifExactRepeat(0,w)||motifEcho(0,w)||motifVariation(0,w)); if(ok) n++; } return n; }
// a worked-example motif + a transposed echo of it (for 💡 Hint / setup), placed from a heights array at window w
function placeMotif(heights, w){ tx("place",()=>{ const base=w*MOTIF_W; heights.forEach((h,i)=>{ if(h==null) return; const r=(ROWS-1)-h; if(grid[r]&&base+i<COLS) setCell(r,base+i,true); }); }); }
// tint alternating 4-column "windows" so the player can see the motif groupings (Tiny Motifs)
function setMotifGuide(on){ for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){ const el=cells[r]&&cells[r][c]; if(!el) continue;
  el.classList.toggle("motifwin", !!on && Math.floor(c/MOTIF_W)%2===1); } }

// a worked example melody matching a contour (for 💡 Hint)
function placeContour(type){ wipe(); const top=ROWS-1, N=(type==="twohills"||type==="journey")?8:6;
  for(let i=0;i<N;i++){ const t=i/(N-1); let f;
    if(type==="rise") f=0.15+0.70*t;
    else if(type==="fall") f=0.85-0.70*t;
    else if(type==="hover") f=0.5+0.08*Math.sin(t*Math.PI*2);
    else if(type==="twohills") f=0.18+0.64*(0.5-0.5*Math.cos(t*Math.PI*4));
    else if(type==="journey") f=0.5-0.34*Math.cos(t*Math.PI*3);
    else f=0.15+0.70*Math.sin(t*Math.PI);   // arch
    setCell(Math.max(0,Math.min(top, Math.round(top-f*top))), i, true); }
  checkLevel(); }
// glowing target path drawn over the grid (guidance only — players match the SHAPE, never exact cells)
function contourGhostPts(type){ const top=ROWS-1, N=11, span=Math.min(COLS,8), pts=[];
  for(let i=0;i<N;i++){ const t=i/(N-1); let f;
    if(type==="rise") f=0.18+0.64*t;
    else if(type==="fall") f=0.82-0.64*t;
    else if(type==="hover") f=0.5+0.06*Math.sin(t*Math.PI*3);
    else if(type==="twohills") f=0.2+0.6*(0.5-0.5*Math.cos(t*Math.PI*4));
    else if(type==="journey") f=0.5-0.32*Math.cos(t*Math.PI*3);
    else f=0.2+0.62*Math.sin(t*Math.PI);   // arch
    pts.push({x:27+38*(0.4+t*(span-0.8)), y:25+34*(top-f*top)}); }
  return pts; }
function drawContourGhost(type){ const svg=document.getElementById("contourGhost"); if(!svg) return;
  if(!type){ svg.style.display="none"; svg.innerHTML=""; return; }
  const W=gridEl.offsetWidth||624, H=gridEl.offsetHeight||356;
  svg.setAttribute("width",W); svg.setAttribute("height",H); svg.setAttribute("viewBox",`0 0 ${W} ${H}`); svg.style.display="";
  const pts=contourGhostPts(type), d=pts.map((p,i)=>(i?"L":"M")+p.x.toFixed(1)+" "+p.y.toFixed(1)).join(" ");
  const dots=pts.map((p,i)=>`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" class="fdot" style="animation-delay:${(i*0.16).toFixed(2)}s"/>`).join("");
  svg.innerHTML=`<path d="${d}" class="cpath"/>${dots}`; }
const clearContourGhost=()=>drawContourGhost(null);
// "choose the matching path" levels (the `compare` pattern)
let choiceOpts=null, choiceAnswer=-1, choiceViewed=[];
let choiceStatus=null;   // a picker owns the status line: renderStage sets it AFTER setup(), and would otherwise clobber the prompt
function showChoices(opts,answer,prompt){ choiceOpts=opts; choiceAnswer=answer; choiceViewed=opts.map(()=>false); ev.choicePick=-1;
  const row=document.getElementById("choiceRow"); if(!row) return; row.style.display="flex"; row.innerHTML="";
  opts.forEach((_,i)=>{ const b=document.createElement("button"); b.className="secondary toggle";
    b.textContent="🎵 Path "+String.fromCharCode(65+i); b.onclick=()=>pickChoice(i); row.appendChild(b); });
  setStatus(prompt||"Tap each path to hear and see it — listen to <b>all three</b> first, then choose the one that traces the glowing arc."); }
function hideChoices(){ const row=document.getElementById("choiceRow"); if(row){ row.style.display="none"; row.innerHTML=""; } choiceOpts=null; choiceAnswer=-1; choiceViewed=[]; choiceStatus=null; }
function pickChoice(i){ if(!choiceOpts) return;
  tx("choice",()=>{ wipe(); placeTune(choiceOpts[i].map((r,c)=>[r,c])); });
  initAudio(); actx.resume(); const t0=actx.currentTime+0.05, sd=stepDur()/1000;
  choiceOpts[i].forEach((r,c)=>voice(instrEl.value, midiToFreq(MIDI[r]), t0+c*sd));
  choiceViewed[i]=true;
  const row=document.getElementById("choiceRow"); if(row) [...row.children].forEach((b,bi)=>b.classList.toggle("on", bi===i));
  if(!choiceViewed.every(Boolean)){ ev.choicePick=-1;             // can't pick until all three are heard
    const left=choiceViewed.filter(x=>!x).length;
    setStatus(`Good — keep listening: hear all three paths first (${left} to go).`); checkLevel(); return; }
  ev.choicePick=i; checkLevel();
  setStatus(i===choiceAnswer ? "✨ That path matches the glowing arc!" : "Not the match — tap the path that traces the arc above."); }

// ---------- Footsteps: pulse helpers (package PW-1) ----------
// count melody seeds that land on the strong-beat columns (0,4,8,12,…)
function gridNotesOnBeats(){ let n=0; for(let c=0;c<COLS;c+=4) for(let r=0;r<ROWS;r++) if(grid[r][c]) n++; return n; }
// drum-pattern checks (lane 0=kick, 1=snare, 2=hat); "clean" = on the right spots AND nothing off-beat
// Each takes an OPTIONAL grid, defaulting to the live one, so the same shipped rule can judge a saved
// song without loading it into the editor. `dg` must be forwarded through every nested call: defaulting
// only the outer function leaves the inner one reading the global, so the "pure" form silently consults
// live state while looking correct. Every shipped caller passes nothing and is unaffected.
// ONE pure pattern helper with an explicit span, and two families of caller. A lesson is checked across
// 16 columns and always has been, so its wrapper hardcodes 16 and keeps its old name and signature. A
// quest passes the width of its OWN field, because on a wider field "a walk that stops two thirds of the
// way across" must not still count as a walk. Widening the field used to be invisible to these: every
// one of them read fixed positions in the first 16 columns.
const laneEvery = (dg, lane, step, span) => { const row=dg[lane]||[];
  for(let i=0;i<span;i+=step) if(!row[i]) return false; return true; };
// …and nothing OFF the pattern, anywhere in the lane. This is what keeps the clean four disjoint from
// the even walk — the walk tolerates extra hits and the clean four does not — and the quest's route
// alternatives depend on that distinction, so it is swept over the whole lane rather than the span.
const laneOnlyEvery = (dg, lane, step) => (dg[lane]||[]).every((on,i)=>!on||i%step===0);

// span-explicit, for anything that knows how wide its field is
const pulseMainBeats  = (dg, span) => laneEvery(dg,0,4,span) && laneOnlyEvery(dg,0,4);
const pulseEvenWalk   = (dg, span) => laneEvery(dg,0,2,span);
const pulseHatShimmer = (dg, span) => laneEvery(dg,2,2,span);

// the lesson wrappers — 16 columns, exactly as before, names unchanged for the 247 goal closures
const kickOn4 = (dg=drumG) => laneEvery(dg,0,4,16);
const kickClean = (dg=drumG) => pulseMainBeats(dg,16);
// the even walk — eight KICKS, one every other step. Lane 0, not the hi-hat shimmer below: they are
// different lanes and different lessons, and conflating them cost a design round.
const kickWalk8 = (dg=drumG) => pulseEvenWalk(dg,16);
// The snare pair stays at fixed positions: no quest analyzer reads it yet, so giving it a span would be
// a generalisation nothing has asked for and nothing could test.
const snareBackbeat = (dg=drumG) => dg[1][4]&&dg[1][12];
const snareBackbeatClean = (dg=drumG) => snareBackbeat(dg) && dg[1].every((on,i)=>!on||i===4||i===12);
const hat8ths = (dg=drumG) => pulseHatShimmer(dg,16);
// tint the beat columns on the field so the player can land a melody "on the beat"
function setBeatGuide(on){ for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++) if(cells[r]&&cells[r][c])
  cells[r][c].classList.toggle("beatcol", !!on && c%4===0); }

// ---------- Wind and Gaps: rhythmic density & rests (package PW-2) ----------
// "density" = total drum hits in the first bar (16 steps). Sparse = breathing room; busy = crowded.
const STRONG=[0,4,8,12], OFFBEATS=[2,6,10,14];
function drumHits(){ let n=0; for(let d=0;d<DRUMS.length;d++) for(let c=0;c<16;c++) if(drumG[d][c]) n++; return n; }
function laneHits(d){ let n=0; for(let c=0;c<16;c++) if(drumG[d][c]) n++; return n; }
const offbeatHits = () => OFFBEATS.filter(c=>[0,1,2].some(d=>drumG[d][c])).length;   // distinct off-beat steps that have any hit
const strongHits  = () => STRONG.filter(c=>[0,1,2].some(d=>drumG[d][c])).length;
// L1/L3 repair (remove-to-improve): start crowded, get below a threshold but keep SOME pulse alive
const isBreathing  = () => drumHits()>0 && drumHits()<=6;
const isVerySparse = () => drumHits()>0 && drumHits()<=4;
// L5 groove-from-gaps: at least 2 off-beat hits AND the off-beats outnumber the strong beats (space makes the bounce)
const isSyncopated = () => offbeatHits()>=2 && offbeatHits()>strongHits() && drumHits()<=8;
// optional density meter under the drum lanes (a little "airy ↔ crowded" bar)
function setDensityMeter(on){ const m=document.getElementById("densityMeter"); if(!m) return;
  m.style.display = on ? "" : "none"; if(on) updateDensityMeter(); }
function updateDensityMeter(){ const m=document.getElementById("densityMeter"); if(!m||m.style.display==="none") return;
  const h=drumHits(), pct=Math.min(100, Math.round(h/12*100));
  const word = h===0?"silent" : h<=4?"airy" : h<=6?"breathing" : h<=9?"full" : "crowded";
  m.querySelector(".dmfill").style.width=pct+"%";
  m.querySelector(".dmlabel").textContent=`density: ${word} (${h} hit${h===1?"":"s"})`; }
// drum compare picker that auditions FULL multi-lane patterns (not just kicks) — for "sparse vs busy"
let patternMsgs=null;   // optional {yes,no} verdict texts per level (default = Wind & Gaps' breathing pair)
function showPatternChoices(opts,answer,prompt,msgs){ choiceOpts=opts; choiceAnswer=answer; choiceViewed=opts.map(()=>false); ev.choicePick=-1; patternMsgs=msgs||null;
  const row=document.getElementById("choiceRow"); if(!row) return; row.style.display="flex"; row.innerHTML="";
  opts.forEach((_,i)=>{ const b=document.createElement("button"); b.className="secondary toggle";
    b.textContent="🥁 Pattern "+String.fromCharCode(65+i); b.onclick=()=>pickPatternChoice(i); row.appendChild(b); });
  setStatus(prompt||"Tap each pattern to hear it — listen to <b>all</b> of them first, then pick the right one."); }
function pickPatternChoice(i){ if(!choiceOpts) return; wipeDrums();
  placeDrums(choiceOpts[i]);
  initAudio(); actx.resume(); const t0=actx.currentTime+0.05, sd=stepDur()/1000;
  choiceOpts[i].forEach(([d,c])=>DRUMS[d].play(t0+c*sd));
  choiceViewed[i]=true;
  const row=document.getElementById("choiceRow"); if(row) [...row.children].forEach((b,bi)=>b.classList.toggle("on", bi===i));
  if(!choiceViewed.every(Boolean)){ ev.choicePick=-1;
    const left=choiceViewed.filter(x=>!x).length;
    setStatus(`Keep listening — hear all the patterns first (${left} to go).`); checkLevel(); return; }
  ev.choicePick=i; checkLevel();
  setStatus(i===choiceAnswer ? (patternMsgs&&patternMsgs.yes||"✨ That's the one that breathes!")
                             : (patternMsgs&&patternMsgs.no ||"That one's crowded — find the pattern with room to breathe.")); }
// The DURATION audition. showChoices places one note per column and sounds each with no hold, so it
// physically cannot present a long note; showPatternChoices is drums-only. Options here are [row,col,len]
// triples, and A KICK WALKS UNDER EVERY ONE — without a reference pulse "all long" is heard as "slower",
// which is the one thing a duration package must never teach.
const LEN_BEATS=[0,4,8,12];
function showLenChoices(opts,answer,prompt,msgs){
  choiceOpts=opts; choiceAnswer=answer; choiceViewed=opts.map(()=>false); ev.choicePick=-1; patternMsgs=msgs||null;
  const row=document.getElementById("choiceRow"); if(!row) return; row.style.display="flex"; row.innerHTML="";
  opts.forEach((_,i)=>{ const b=document.createElement("button"); b.className="secondary toggle";
    b.textContent="🚶 Walk "+String.fromCharCode(65+i); b.onclick=()=>pickLenChoice(i); row.appendChild(b); });
  choiceStatus = prompt || "Tap each walk to hear it — listen to <b>all three</b> first, then pick.";
  setStatus(choiceStatus); }
function pickLenChoice(i){ if(!choiceOpts) return;
  setMelodyLens(choiceOpts[i]);                              // the picture matches the sound — stems and all
  initAudio(); actx.resume(); const t0=actx.currentTime+0.05, sd=stepDur()/1000;
  choiceOpts[i].forEach(([r,c,L])=>voice(instrEl.value, midiToFreq(MIDI[r]), t0+c*sd, (L||1)>1 ? (L||1)*sd : 0));
  LEN_BEATS.forEach(c=>DRUMS[0].play(t0+c*sd));              // the ruler: the SAME pulse under all three
  choiceViewed[i]=true;
  const row=document.getElementById("choiceRow"); if(row) [...row.children].forEach((b,bi)=>b.classList.toggle("on", bi===i));
  if(!choiceViewed.every(Boolean)){ ev.choicePick=-1;
    const left=choiceViewed.filter(x=>!x).length;
    setStatus(`Keep listening — hear all three walks first (${left} to go).`); checkLevel(); return; }
  ev.choicePick=i; checkLevel();
  setStatus(i===choiceAnswer ? (patternMsgs&&patternMsgs.yes||"✨ That's the one that walks!")
                             : (patternMsgs&&patternMsgs.no ||"Not that one — find the walk that mixes long steps and quick ones.")); }

// ---------- Off the Path: syncopation & swing (package PW-3) ----------
// Vocabulary on the 16-step bar: beats = 0,4,8,12 · off-beats ("ands") = 2,6,10,14 · odd steps = the cracks.
// The package's core truth: a surprise only lands AGAINST something steady — so most goals pair an
// anchored kick with accents (snare/hat) that live off the beat columns.
const anchorKick = () => drumG[0][0] && drumG[0][8];                          // kick holds at least beats 1 & 3 — the walk survives
function accentSteps(){ const s=new Set(); for(let d=1;d<DRUMS.length;d++) for(let c=0;c<16;c++) if(drumG[d][c]) s.add(c); return s; }
const offAccents = () => [...accentSteps()].filter(c=>c%4!==0).length;        // snare/hat steps that land OFF the beat columns
const PUSH_STEPS=[3,7,11,15];                                                 // the crack right before each beat — a hit there arrives "early"
const pushHits = () => PUSH_STEPS.filter(c=>[0,1,2].some(d=>drumG[d][c])).length;
// melody seeds that land off the beat columns (the melodic mirror of gridNotesOnBeats)
function gridNotesOffBeats(){ let n=0; for(let c=0;c<COLS;c++){ if(c%4===0) continue; for(let r=0;r<ROWS;r++) if(grid[r][c]) n++; } return n; }

// ---------- Two Kinds of Walking: note DURATION (package PW-4) ----------
// grid[r][c] is ONSET-ONLY by invariant — it marks where a note STARTS and never the cells it covers — so it
// structurally cannot see a hold. Every detector here reads the real note objects instead.
// vineLen(n) is length in COLUMNS: 1 = a plain quick seed, MAX_VINE = 8. One beat = 4 columns.
function melNotes(){ return melTrack().notes.filter(n=>{ const c=noteCol(n); return c>=0 && c<COLS; }); }
const longCount   = (min=2) => melNotes().filter(n=>vineLen(n)>=min).length;   // notes holding >= min steps
const shortCount  = ()      => melNotes().filter(n=>vineLen(n)===1).length;    // plain quick seeds
const longestVine = ()      => melNotes().reduce((m,n)=>Math.max(m,vineLen(n)),0);   // 0 on an empty field
// ONE note spans columns a..b end to end — a real hold, never a row of re-struck seeds faking one
const heldThrough = (a,b)   => melNotes().some(n=>noteCol(n)<=a && noteCol(n)+vineLen(n)-1>=b);
// the tune LANDS: something starts at the last occupied column, and everything starting there is long.
// .every() and not .some(), so a stray quick note stacked on the ending fails honestly instead of hiding.
function endsLong(min=3){ const c=lastCol(); if(c<0) return false;
  const at=melNotes().filter(n=>noteCol(n)===c);
  return at.length>0 && at.every(n=>vineLen(n)>=min); }
// Feel switch: 🚶 straight vs 🕺 swing. Swing delays the mid-point off-beats (steps 2,6,10,14) by ~a
// triplet — same notes, different feel. tick() applies it to melody AND drums; jam keeps its own swing.
let levelSwing=0;
function setFeelRow(on){ const el=document.getElementById("feelRow"); if(!el) return;
  el.style.display=on?"flex":"none"; if(!on) levelSwing=0; syncFeelBtns(); applySwingVisual(); }
function setFeel(sw){ levelSwing=sw?1:0; syncFeelBtns(); applySwingVisual();
  setStatus(sw ? "🕺 Swing feel on — the in-between steps now arrive fashionably late. Press <b>▶</b> to hear it skip."
               : "🚶 Straight feel — every step lands right on its mark. Press <b>▶</b> to hear it march."); }
function syncFeelBtns(){ const s=document.getElementById("feelStraight"), w=document.getElementById("feelSwing");
  if(s) s.classList.toggle("on", !levelSwing); if(w) w.classList.toggle("on", !!levelSwing); }
// the picture matches the sound: with swing on, every "and" pad (cols 2,6,10,14) slides one full column,
// landing on the crack just before the next beat — exactly where the delayed hit now sounds
function applySwingVisual(){ for(let d=0;d<dcells.length;d++){ const row=dcells[d]||[];
  for(let c=0;c<row.length;c++) if(row[c]) row[c].classList.toggle("swung", !!levelSwing && c%4===2); } }
document.getElementById("feelStraight").onclick=()=>setFeel(false);
document.getElementById("feelSwing").onclick=()=>setFeel(true);

// ---------- Two New Colors: staged reveal of F then B on the diatonic grid (palette milestone) ----------
// On a diatonic palette, F (pc 5) and B (pc 11) are the "new colors". A level reveals a subset; the rest stay
// dimmed & locked (un-clickable) so the one-at-a-time reveal feels physical without needing a third palette.
const NEW_PC = { F:5, B:11 };
let revealedPCs = null;   // null = no restriction (all notes free); otherwise a Set of new-note pitch-classes that ARE revealed
function setColorReveal(list){   // list e.g. ["F"] or ["F","B"]; null/undefined removes all locks
  revealedPCs = list ? new Set(list.map(n=>NEW_PC[n])) : null;
  applyColorLocks(); }
function isLockedRow(r){ if(!revealedPCs) return false; const pc=((MIDI[r]%12)+12)%12;
  return (pc===NEW_PC.F || pc===NEW_PC.B) && !revealedPCs.has(pc); }   // a new note that hasn't been revealed yet
function applyColorLocks(){ for(let r=0;r<ROWS;r++){ const locked=isLockedRow(r);
  const pc=((MIDI[r]%12)+12)%12;
  const justRevealed = !!revealedPCs && (pc===NEW_PC.F||pc===NEW_PC.B) && revealedPCs.has(pc);
  for(let c=0;c<COLS;c++){ const el=cells[r]&&cells[r][c]; if(!el) continue;
    el.classList.toggle("lockednote", locked);
    el.classList.toggle("newcolor", justRevealed); } } }
// goal helpers: did the player PLACE a given pitch-class on the grid?
function placedPC(pc){ for(let r=0;r<ROWS;r++) if(((MIDI[r]%12)+12)%12===pc) for(let c=0;c<COLS;c++) if(grid[r][c]) return true; return false; }
const placedF = () => placedPC(NEW_PC.F);
const placedB = () => placedPC(NEW_PC.B);
const placedNewColor = () => placedF() || placedB();
// a column whose 3 notes form a standing triad that USES F or B (impossible in pentatonic — the payoff of widening)
function colStandsWithNew(c){ const rows=[]; for(let r=0;r<ROWS;r++) if(grid[r][c]) rows.push(r);
  if(rows.length!==3) return false; const ms=rows.map(r=>MIDI[r]).sort((a,b)=>a-b);
  const usesNew = rows.some(r=>{ const pc=((MIDI[r]%12)+12)%12; return pc===NEW_PC.F||pc===NEW_PC.B; });
  return usesNew && stableMidis(ms); }
const countColStandsWithNew = () => { let n=0; for(let c=0;c<COLS;c++) if(colStandsWithNew(c)) n++; return n; };
// L5: a B immediately followed (next column) by a C — the leading-tone pull resolving up to home
function bThenC(){ for(let c=0;c<COLS-1;c++){
  let hasB=false; for(let r=0;r<ROWS;r++) if(grid[r][c] && ((MIDI[r]%12)+12)%12===NEW_PC.B) hasB=true;
  if(!hasB) continue;
  for(let r=0;r<ROWS;r++) if(grid[r][c+1] && ((MIDI[r]%12)+12)%12===0) return true;   // C in the very next column
} return false; }
// L6: this stage crafted a standing triad (tower) that uses a new color — read ev.towerSigs (midi-note signatures)
function craftedNewTriad(){ return (ev.towerSigs||[]).some(sig=>{
  const ms=sig.split("-").map(Number); if(ms.length!==3) return false;
  return ms.some(m=>{ const pc=((m%12)+12)%12; return pc===NEW_PC.F||pc===NEW_PC.B; }); }); }
// drum version of the compare picker: options are kick-step patterns, played on the kick lane
function showDrumChoices(opts,answer){ choiceOpts=opts; choiceAnswer=answer; choiceViewed=opts.map(()=>false); ev.choicePick=-1;
  const row=document.getElementById("choiceRow"); if(!row) return; row.style.display="flex"; row.innerHTML="";
  opts.forEach((_,i)=>{ const b=document.createElement("button"); b.className="secondary toggle";
    b.textContent="🥁 Walk "+String.fromCharCode(65+i); b.onclick=()=>pickDrumChoice(i); row.appendChild(b); });
  setStatus("Tap each walk to hear it — listen to <b>all</b> of them first, then pick the one that stays steady."); }
function pickDrumChoice(i){ if(!choiceOpts) return; wipeDrums();
  placeDrums(choiceOpts[i].map(s=>[0,s]));
  initAudio(); actx.resume(); const t0=actx.currentTime+0.05, sd=stepDur()/1000;
  choiceOpts[i].forEach(s=>kick(t0+s*sd, 1.0, drumBus));
  choiceViewed[i]=true;
  const row=document.getElementById("choiceRow"); if(row) [...row.children].forEach((b,bi)=>b.classList.toggle("on", bi===i));
  if(!choiceViewed.every(Boolean)){ ev.choicePick=-1;
    const left=choiceViewed.filter(x=>!x).length;
    setStatus(`Keep listening — hear all the walks first (${left} to go).`); checkLevel(); return; }
  ev.choicePick=i; checkLevel();
  setStatus(i===choiceAnswer ? "✨ That's the steady walk!" : "That one wobbles — find the even, steady walk."); }
// pair version of the compare picker: options are note-pairs played as a block chord (Twin Blooms)
function showPairChoices(opts,answer,prompt,label){ choiceOpts=opts; choiceAnswer=answer; choiceViewed=opts.map(()=>false); ev.choicePick=-1;
  const row=document.getElementById("choiceRow"); if(!row) return; row.style.display="flex"; row.innerHTML="";
  opts.forEach((_,i)=>{ const b=document.createElement("button"); b.className="secondary toggle";
    b.textContent=(label||"🌸 Pair ")+String.fromCharCode(65+i); b.onclick=()=>pickPairChoice(i); row.appendChild(b); });
  setStatus(prompt||"Tap each one to hear it — listen to <b>all</b> of them, then pick the right one."); }
function pickPairChoice(i){ if(!choiceOpts) return; wipe();
  const p=choiceOpts[i]; p.forEach(r=>setCell(r,0,true));
  initAudio(); actx.resume(); const t=actx.currentTime+0.03; p.forEach(r=>voice(instrEl.value,midiToFreq(MIDI[r]),t));
  choiceViewed[i]=true;
  const row=document.getElementById("choiceRow"); if(row) [...row.children].forEach((b,bi)=>b.classList.toggle("on", bi===i));
  if(!choiceViewed.every(Boolean)){ ev.choicePick=-1;
    const left=choiceViewed.filter(x=>!x).length;
    setStatus(`Keep listening — hear all of them first (${left} to go).`); checkLevel(); return; }
  ev.choicePick=i; checkLevel();
  setStatus(i===choiceAnswer ? "✨ That's the one!" : "Not that one — listen again."); }

// ---------- Question & Answer: phrase A (call) / phrase B (answer) split (package PS-3) ----------
// The field splits in two: cols 0–7 = the CALL (phrase A), cols 8–15 = your ANSWER (phrase B).
// "open" = a phrase ends AWAY from HOME (a question); "closed" = it lands on HOME/tonic (an answer).
// Reuses the intro's home/tonic concept — no new pitch system, just a timeline boundary.
const PHRASE_SPLIT = 8;
function setPhraseGuide(on){ for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){ const el=cells[r]&&cells[r][c]; if(!el) continue;
  el.classList.toggle("callcol",   !!on && c<PHRASE_SPLIT);
  el.classList.toggle("answercol", !!on && c>=PHRASE_SPLIT);
  el.classList.toggle("answeredge",!!on && c===PHRASE_SPLIT); } }
const curCall = () => curStage().call || [];
function placeCall(notes){ tx("place",()=>notes.forEach(([r,c])=>{ if(grid[r]&&c<PHRASE_SPLIT) setCell(r,c,true); })); }   // pre-place the call in phrase A
function placeAnswer(notes){ tx("place",()=>notes.forEach(([r,c])=>{ if(grid[r]&&c>=PHRASE_SPLIT&&c<COLS) setCell(r,c,true); })); checkLevel(); }  // worked-example answers (hints), leaves the call intact
// top-note height per occupied column, restricted to one half (like contourSeq)
function halfSeq(lo,hi){ const seq=[]; for(let c=lo;c<hi;c++){ for(let r=0;r<ROWS;r++){ if(grid[r][c]){ seq.push((ROWS-1)-r); break; } } } return seq; }
const answerSeq = () => halfSeq(PHRASE_SPLIT, COLS);
const callSeq   = () => { const c=curCall().slice().sort((a,b)=>a[1]-b[1]); return c.map(([r])=>(ROWS-1)-r); };  // the displayed call's shape
function lastColIn(lo,hi){ for(let c=hi-1;c>=lo;c--) if(colCount(c)>0) return c; return -1; }
function colHome(c){ if(c<0) return false; for(let r=0;r<ROWS;r++) if(grid[r][c]&&isTonic(r)) return true; return false; }
function countIn(lo,hi){ let n=0; for(let c=lo;c<hi;c++) n+=colCount(c); return n; }
// answer-half (phrase B) readouts
const answerCount   = () => countIn(PHRASE_SPLIT, COLS);
const answerEndsHome= () => { const lc=lastColIn(PHRASE_SPLIT,COLS); return lc>=0 && colHome(lc); };   // closed
const answerEndsOpen= () => { const lc=lastColIn(PHRASE_SPLIT,COLS); return lc>=0 && !colHome(lc); };  // open / hanging
function answerMotions(){ const s=answerSeq(); const m=[]; for(let i=1;i<s.length;i++) m.push(Math.abs(s[i]-s[i-1])); return m; }
const answerDir = () => { const s=answerSeq(); return s.length>=2?Math.sign(s[s.length-1]-s[0]):0; };
const callDir   = () => { const s=callSeq();   return s.length>=2?Math.sign(s[s.length-1]-s[0]):0; };
// L4: an answer that echoes the call's direction and then lands home
const answerMirrorsCall = () => answerSeq().length>=3 && answerEndsHome() && (callDir()===0 || answerDir()===callDir());
// L5: an answer that starts like the call's opening, but resolves home (same thought, new ending)
const answerEchoesOpening = () => { const cs=callSeq(), as=answerSeq(); return cs.length>=1 && as.length>=3 && Math.abs(as[0]-cs[0])<=1 && answerEndsHome(); };
// L6: two genuinely different closed answers — a calm (stepwise) one and a bold (leaping) one
const answerCalm = () => { const m=answerMotions(); return answerSeq().length>=3 && m.length>0 && m.every(d=>d<=2) && answerEndsHome(); };
const answerBold = () => { const m=answerMotions(); return answerSeq().length>=3 && m.filter(d=>d>=3).length>=1 && answerEndsHome(); };
// L8 capstone: the player builds BOTH halves — an open call and a closed answer
const callCount    = () => countIn(0, PHRASE_SPLIT);
const callEndsOpen = () => { const lc=lastColIn(0,PHRASE_SPLIT); return lc>=0 && !colHome(lc); };

// ---------- Ways Home: cadence strength — how firmly a melody comes home (package WW-1, diatonic) ----------
// Melodic closure: end on C (home) = arrived; end on G (dominant) = paused; B→C = the strongest "pull home" (needs diatonic).
function occColsList(){ const a=[]; for(let c=0;c<COLS;c++) if(colCount(c)>0) a.push(c); return a; }
function topPCat(c){ for(let r=0;r<ROWS;r++) if(grid[r][c]) return ((MIDI[r]%12)+12)%12; return null; }
function endPC(){ const cs=occColsList(); return cs.length?topPCat(cs[cs.length-1]):null; }
function approachPC(){ const cs=occColsList(); return cs.length>=2?topPCat(cs[cs.length-2]):null; }
const endsHome    = () => endPC()===0;                       // lands on C (home) — arrived
const fullArrival = () => endPC()===0 && approachPC()===11;  // B→C leading-tone pull — the strongest arrival
const softArrival = () => endPC()===0 && approachPC()!==11;  // home, but gently (not via the leading tone)
const halfClose   = () => endPC()===7;                       // ends on G (the dominant) — paused, "not yet"

// ---------- Sun & Moon Garden: mood — major (bright) vs minor (wistful) (package CC-1, diatonic) ----------
// Same 7 notes, two feelings: the SUN garden centers on C (major/bright), the MOON garden on A (minor/wistful) —
// the relative major/minor truth. A triad's THIRD sets its mood: a major 3rd (+4) is bright, a minor 3rd (+3) is wistful.
// setMood shifts HOME (which row glows) + washes the field warm/cool; it's an authoring lens, not stored in the song.
let moodKey=null;   // null | "sun" | "moon"
function setMood(m){
  moodKey = (m==="sun"||m==="moon") ? m : null;
  TONIC_PC = moodKey==="moon" ? 9 : ((PALETTES[paletteId]&&PALETTES[paletteId].tonicPC)||0);   // moon → A is home; else palette default (C)
  if(pitchArea){ pitchArea.classList.toggle("sunmood", moodKey==="sun"); pitchArea.classList.toggle("moonmood", moodKey==="moon"); }
  for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){ const el=cells[r]&&cells[r][c]; if(!el) continue;
    el.classList.toggle("tonicRow", isTonic(r)); }   // refresh which rows glow as HOME under the new center
}
function colMidisSorted(c){ const ms=[]; for(let r=0;r<ROWS;r++) if(grid[r][c]) ms.push(MIDI[r]); return ms.sort((a,b)=>a-b); }
// classify 3 notes as bright (major 0-4-7) or wistful (minor 0-3-7) by real semitones — inversion-proof, like stableMidis
function triadMood(midis){ if(midis.length!==3) return null;
  const pcs=[...new Set(midis.map(m=>((m%12)+12)%12))].sort((a,b)=>a-b); if(pcs.length!==3) return null;
  for(const root of pcs){ const k=pcs.map(p=>((p-root)%12+12)%12).sort((a,b)=>a-b).join(",");
    if(k==="0,4,7") return "bright"; if(k==="0,3,7") return "wistful"; } return null; }
const colMood = c => triadMood(colMidisSorted(c));
const countBrightChords  = () => { let n=0; for(let c=0;c<COLS;c++) if(colMood(c)==="bright")  n++; return n; };
const countWistfulChords = () => { let n=0; for(let c=0;c<COLS;c++) if(colMood(c)==="wistful") n++; return n; };
const restsAtHome = () => endPC()===TONIC_PC;   // the tune comes to rest on this garden's HOME note (sun→C, moon→A)

// ---------- Weather of Wanting II: chord PROGRESSIONS (River Turns / Pull of the Moon / False Doors, diatonic) ----------
// Read each column as a diatonic triad and name its scale degree in C major (I ii iii IV V vi vii). The harmony
// vocabulary the whole sub-region shares: V (G major) is the "dominant" — the chord of longing that pulls home to I;
// the plagal IV→I is a gentler pull; vi (A minor) is the "false door" (deceptive landing). Reasons in real semitones.
const DEGREE_OF = {0:"I",2:"ii",4:"iii",5:"IV",7:"V",9:"vi",11:"vii"};
const CHORDS = { I:[13,11,9], ii:[12,10,8], iii:[11,9,7], IV:[10,8,6], V:[9,7,5], vi:[8,6,4], vii:[7,5,3] };   // row-sets (root position, low octave)
function placeProg(specs){ tx("place",()=>{ wipe(); specs.forEach(([rows,col])=>rows.forEach(r=>{ if(grid[r]&&col<COLS) setCell(r,col,true); })); }); }   // specs: [[rows,col],…]
function colChordRoot(c){ const ms=colMidisSorted(c); if(ms.length<3) return null;
  const pcs=[...new Set(ms.map(m=>((m%12)+12)%12))].sort((a,b)=>a-b); if(pcs.length!==3) return null;
  for(const root of pcs){ const k=pcs.map(p=>((p-root)%12+12)%12).sort((a,b)=>a-b).join(",");
    if(k==="0,4,7"||k==="0,3,7"||k==="0,3,6") return root; }   // a major / minor / diminished triad → its root pitch-class
  return null; }
const colDegree = c => { const r=colChordRoot(c); return r==null?null:(DEGREE_OF[r]||null); };
function chordSyms(){ const s=[]; for(let c=0;c<COLS;c++){ const d=colDegree(c); if(d) s.push(d); } return s; }   // placed chords in column order
const distinctChordCount = () => new Set(chordSyms()).size;
function hasChordRun(target){ const s=chordSyms();   // does the chord sequence contain this run of degrees, consecutively among placed chords?
  for(let i=0;i+target.length<=s.length;i++){ let ok=true;
    for(let j=0;j<target.length;j++) if(s[i+j]!==target[j]){ ok=false; break; } if(ok) return true; }
  return false; }
const endsOnDegree   = d => { const s=chordSyms(); return s.length>0 && s[s.length-1]===d; };
const startsOnDegree = d => { const s=chordSyms(); return s.length>0 && s[0]===d; };
// tendency tones read on the TOP line (soprano): the leading tone B→C, and the 4th F→E — harmony's "secret pulls".
// Looks across consecutive OCCUPIED columns (gaps between chords are fine) and requires a real semitone STEP — so it's
// an audible climb/fall (B4→C5), not just any B-then-C where the B could sit an octave away and actually drop.
function topMidiAt(c){ for(let r=0;r<ROWS;r++) if(grid[r][c]) return MIDI[r]; return null; }
function topStep(fromPC,delta){ let prev=null;
  for(let c=0;c<COLS;c++){ const m=topMidiAt(c); if(m==null) continue;
    if(prev!=null && (((prev%12)+12)%12)===fromPC && m===prev+delta) return true; prev=m; }
  return false; }
const leadingToneResolves = () => topStep(11,+1);   // B → C, a semitone UP on top (the audible leading-tone climb)
const fourToThree         = () => topStep(5,-1);    // F → E, a semitone DOWN on top
// compare-picker for PROGRESSIONS: each option is a list of chord row-sets, auditioned as a sequence of block chords
function showProgChoices(opts,answer,prompt,label){ choiceOpts=opts; choiceAnswer=answer; choiceViewed=opts.map(()=>false); ev.choicePick=-1;
  const row=document.getElementById("choiceRow"); if(!row) return; row.style.display="flex"; row.innerHTML="";
  opts.forEach((_,i)=>{ const b=document.createElement("button"); b.className="secondary toggle";
    b.textContent=(label||"🎵 Path ")+String.fromCharCode(65+i); b.onclick=()=>pickProgChoice(i); row.appendChild(b); });
  setStatus(prompt||"Tap each path to hear it — listen to <b>all</b> of them, then pick the right one."); }
function pickProgChoice(i){ if(!choiceOpts) return; wipe();
  const prog=choiceOpts[i]; prog.forEach((chord,ci)=>chord.forEach(r=>{ if(grid[r]) setCell(r,ci*2,true); }));   // show it: a chord every 2 columns
  initAudio(); actx.resume(); const t0=actx.currentTime+0.06, sd=Math.max(stepDur()/1000,0.26);
  prog.forEach((chord,ci)=>{ const t=t0+ci*sd*2; chord.forEach(r=>{ if(MIDI[r]!=null) voice(instrEl.value,midiToFreq(MIDI[r]),t); }); });
  choiceViewed[i]=true;
  const row=document.getElementById("choiceRow"); if(row) [...row.children].forEach((b,bi)=>b.classList.toggle("on",bi===i));
  if(!choiceViewed.every(Boolean)){ ev.choicePick=-1; const left=choiceViewed.filter(x=>!x).length;
    setStatus(`Keep listening — hear all of them first (${left} to go).`); checkLevel(); return; }
  ev.choicePick=i; checkLevel();
  setStatus(i===choiceAnswer ? "✨ That's the one!" : "Listen again — feel which path fits."); }

// ---------- Shifting Shadows: inversions & voicing (package SC-3) ----------
// A placed triad column already names its ROOT (colChordRoot, inversion-proof). These read which "turn"
// it stands in — whose note is on the BOTTOM — and the voice-leading payoffs that turning unlocks.
const colBassMidi = c => { const ms=colMidisSorted(c); return ms.length?ms[0]:null; };
function colInv(c){ const root=colChordRoot(c); if(root==null) return null;   // 0 = root on the bottom · 1 = third · 2 = fifth
  const off=((((colBassMidi(c)%12)+12)%12-root)%12+12)%12;
  return off===0?0 : (off===3||off===4)?1 : 2; }
const countInv      = k  => { let n=0; for(let c=0;c<COLS;c++) if(colInv(c)===k) n++; return n; };
const countInverted = () => { let n=0; for(let c=0;c<COLS;c++){ const i=colInv(c); if(i===1||i===2) n++; } return n; };
const anyChordCol   = pred => { for(let c=0;c<COLS;c++) if(colChordRoot(c)!=null && pred(c)) return true; return false; };
// the most voicings any ONE chord (same root) appears in — "the same stone, turned" counter
function voicingsOfOneChord(){ const byRoot={};
  for(let c=0;c<COLS;c++){ const r=colChordRoot(c); if(r==null) continue;
    (byRoot[r]=byRoot[r]||new Set()).add(colMidisSorted(c).join("-")); }
  let best=0; Object.values(byRoot).forEach(s=>{ if(s.size>best) best=s.size; }); return best; }
// two NEIGHBOURING chords (in column order), different roots, holding a shared stone in the same row
function sharedStoneCols(){ const cols=[]; for(let c=0;c<COLS;c++) if(colChordRoot(c)!=null) cols.push(c);
  for(let i=1;i<cols.length;i++){ const a=cols[i-1], b=cols[i];
    if(colChordRoot(a)===colChordRoot(b)) continue;
    const ma=new Set(colMidisSorted(a)); if(colMidisSorted(b).some(m=>ma.has(m))) return true; }
  return false; }
// the voice-leading payoff: 3+ chords (2+ different) whose BASS never moves more than a whole step
function smoothBassPath(minChords){ const seq=[];
  for(let c=0;c<COLS;c++) if(colChordRoot(c)!=null) seq.push({bass:colBassMidi(c), root:colChordRoot(c)});
  if(seq.length<(minChords||3)) return false;
  if(new Set(seq.map(x=>x.root)).size<2) return false;
  for(let i=1;i<seq.length;i++) if(Math.abs(seq[i].bass-seq[i-1].bass)>2) return false;
  return true; }

// ---------- Soft Wobble, Strong Wobble: graded tension (package SC-4) ----------
// Extends the binary stand/wobble (and Twin Blooms Plus' tense/restful) into a 4-grade WEATHER scale,
// by interval class: 0 still (3rds/4th/5th/6ths/octave) · 1 shimmer (a whole step, 2nd/7th) ·
// 2 restless (the tritone) · 3 storm (a half step — the sharpest clash). A column's grade = its
// roughest pair, so chords grade too (C-D-E → shimmer; anything with B+C in it → storm).
function wobbleOfGap(g){ const ic=((g%12)+12)%12;
  return (ic===1||ic===11)?3 : ic===6?2 : (ic===2||ic===10)?1 : 0; }
function colWobble(c){ const ms=colMidisSorted(c); if(ms.length<2) return null;
  let w=0; for(let i=0;i<ms.length;i++) for(let j=i+1;j<ms.length;j++) w=Math.max(w,wobbleOfGap(ms[j]-ms[i]));
  return w; }
const wobbleSeq       = () => { const s=[]; for(let c=0;c<COLS;c++){ const w=colWobble(c); if(w!=null) s.push(w); } return s; };
const countWobbleCols = k  => wobbleSeq().filter(w=>w===k).length;
const maxWobble       = () => Math.max(-1,...wobbleSeq());
const wobbleGrades    = () => new Set(wobbleSeq()).size;
// a rising storm: 3+ different grades, and the sequence never drops
const wobbleLadder = () => { const s=wobbleSeq(); if(new Set(s).size<3 || s.length<3) return false;
  for(let i=1;i<s.length;i++) if(s[i]<s[i-1]) return false; return true; };
// all FOUR grades climbed in order without ever dropping — the careful approach to the storm beast
const gentleApproach = () => wobbleLadder() && new Set(wobbleSeq()).size===4;
// the release: a restless/storm column later settles to a still one
const stormThenCalm = () => { const s=wobbleSeq(); let hi=-1;
  for(let i=0;i<s.length;i++) if(s[i]>=2){ hi=i; break; }
  return hi>=0 && s.slice(hi+1).some(w=>w===0); };
// the weather glass — a live gauge under the field (reuses the density meter's look)
const WOBBLE_WORDS=["still 🪞","shimmer 🌊","restless 🌀","storm ⛈️"];
function setWobbleMeter(on){ const m=document.getElementById("wobbleMeter"); if(!m) return;
  m.style.display = on ? "" : "none"; if(on) updateWobbleMeter(); }
function updateWobbleMeter(){ const m=document.getElementById("wobbleMeter"); if(!m||m.style.display==="none") return;
  const w=maxWobble(), lvl=Math.max(0,w);
  m.querySelector(".dmfill").style.width=(w<0?0:(lvl+1)/4*100)+"%";
  m.querySelector(".dmlabel").textContent="weather: "+(w<0?"silent":WOBBLE_WORDS[lvl]); }

