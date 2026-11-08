// ---------- Levels ----------
function colCount(c){ let n=0; for(let r=0;r<ROWS;r++) if(grid[r][c]) n++; return n; }
function lastCol(){ for(let c=COLS-1;c>=0;c--) if(colCount(c)>0) return c; return -1; }
function gridState(){
  let placed=0,pair=false,chord=false;
  for(let c=0;c<COLS;c++){ const n=colCount(c); placed+=n; if(n>=2) pair=true; if(n>=3) chord=true; }
  const lc=lastCol(); let home=false;
  if(lc>=0) for(let r=0;r<ROWS;r++) if(grid[r][lc]&&isTonic(r)){ home=true; break; }
  return {placed,pair,chord,home};
}
function wipe(){ modelClearMelody();
  cells.flat().forEach(e=>e.classList.remove("on")); renderVines(); }   // the stems and their grips belong to the notes — they go too
function freshEv(){ return {played:false,craftedPair:false,craftedTower:false,craftedWobbler:false,
  stampedTool:false,previewed:false,previewedTower:false,previewedWobbler:false,jammed:false,choicePick:-1,
  pairKinds:[],pairs:[],lastPairKind:null,towerSigs:[]}; }
// Twin Blooms goal helpers — read this-stage crafts (ev.pairs) by real semitone gap; widthBand defined up top
const craftedClose  = () => (ev.pairs||[]).some(p=>p.gap<=2);
const craftedBright = () => (ev.pairs||[]).some(p=>p.gap>=3 && p.gap<=4);
const craftedOpen   = () => (ev.pairs||[]).some(p=>p.gap>=5);
const craftedSpanBand = (span,band) => (ev.pairs||[]).some(p=>p.span===span && widthBand(p.gap)===band);
const distinctBands = () => new Set((ev.pairs||[]).map(p=>widthBand(p.gap))).size;
// for levels that PLACE pairs on the grid: classify each 2-note column by width band, then tally
function colBand(c){ const rows=[]; for(let r=0;r<ROWS;r++) if(grid[r][c]) rows.push(r);
  return rows.length===2 ? widthBand(Math.abs(MIDI[rows[0]]-MIDI[rows[1]])) : null; }
function countColBands(){ const n={close:0,bright:0,open:0}; for(let c=0;c<COLS;c++){ const b=colBand(c); if(b) n[b]++; } return n; }
// ---------- Twin Blooms Plus: TENSION pairs + their pull to resolution (package, diatonic) ----------
// Only possible once diatonic adds F & B: a minor 2nd (gap 1) or major 7th (gap 11) CLASHES; the tritone (gap 6)
// is the restless "spooky" pair. All are dissonant and want to RESOLVE — to step out to a restful (consonant) pair.
function pairTension(gap){ const g=(((gap%12)+12)%12); return g===6 ? "tritone" : (g===1||g===11) ? "clash" : null; }
const isTensePair = gap => pairTension(gap)!==null;
const craftedTense   = () => (ev.pairs||[]).some(p=>isTensePair(p.gap));
const craftedTritone = () => (ev.pairs||[]).some(p=>pairTension(p.gap)==="tritone");
const craftedClash   = () => (ev.pairs||[]).some(p=>pairTension(p.gap)==="clash");
const craftedRestful = () => (ev.pairs||[]).some(p=>p.gap>0 && !isTensePair(p.gap));
// placement versions: classify each 2-note column by its real semitone gap
function colGap(c){ const rows=[]; for(let r=0;r<ROWS;r++) if(grid[r][c]) rows.push(r);
  return rows.length===2 ? Math.abs(MIDI[rows[0]]-MIDI[rows[1]]) : null; }
function colTension(c){ const g=colGap(c); return g==null?null:pairTension(g); }
const countTensePairs   = () => { let n=0; for(let c=0;c<COLS;c++) if(colTension(c)) n++; return n; };
const countTritonePairs = () => { let n=0; for(let c=0;c<COLS;c++) if(colTension(c)==="tritone") n++; return n; };
const countClashPairs   = () => { let n=0; for(let c=0;c<COLS;c++) if(colTension(c)==="clash") n++; return n; };
// the payoff: a tense pair immediately followed by a restful (consonant) pair = tension that RESOLVES (release)
function tensionThenRest(){
  for(let c=0;c<COLS;c++){
    if(!colTension(c)) continue;                              // a tense pair here…
    for(let d=c+1;d<COLS;d++){                                // …look ahead to the NEXT column that has any seeds (skip empty gaps)
      let occ=0; for(let r=0;r<ROWS;r++) if(grid[r][d]) occ++;
      if(!occ) continue;
      const g2=colGap(d);
      if(g2!=null && g2>0 && !isTensePair(g2)) return true;   // the next sound is a restful pair → tension resolves
      break;                                                  // next sound wasn't restful — try a later tense pair
    }
  }
  return false; }
// Standing Towers: a column "stands" if its 3 notes form a stable stack (each adjacent pair a 3rd or wider)
function colStands(c){ const rows=[]; for(let r=0;r<ROWS;r++) if(grid[r][c]) rows.push(r);
  return rows.length===3 && stableMidis(rows.map(r=>MIDI[r]).sort((a,b)=>a-b)); }
function countColStands(){ let n=0; for(let c=0;c<COLS;c++) if(colStands(c)) n++; return n; }
const colSig = c => { const rows=[]; for(let r=0;r<ROWS;r++) if(grid[r][c]) rows.push(r); return rows.map(r=>MIDI[r]).sort((a,b)=>a-b).join("-"); };
// "two different towers" — distinct standing towers whether CRAFTED (ev.towerSigs) or just PLACED on the field, keyed by actual notes
function twinTowersCount(){ const set=new Set(ev.towerSigs);
  for(let c=0;c<COLS;c++) if(colStands(c)) set.add(colSig(c)); return set.size; }
let ev=freshEv();

// hear a tool (block chord) — makes Tower vs Wobbler obvious by ear
function playChordMidis(midis){ initAudio(); actx.resume(); const t=actx.currentTime+0.01;
  midis.forEach(m=>voice(instrEl.value, midiToFreq(m), t)); }
function previewTool(tool){ playChordMidis(tool.midis); ev.previewed=true;
  if(tool.offs.length>=3){ stableMidis(tool.midis)?ev.previewedTower=true:ev.previewedWobbler=true; }
  checkLevel(); }

function placeTune(notes){ tx("place",()=>notes.forEach(([r,c])=>{ if(grid[r]&&c<COLS) setCell(r,c,true); })); }   // ONE journal entry — a scripted placement undoes in one step
// count DISTINCT tools in the toolbox by type (toolbox dedupes by shape, so these enforce "different")
const countTools=pred=>toolbox.filter(pred).length;
const isPairTool=t=>t.offs.length===2;
const isTowerTool=t=>t.offs.length>=3 && stableMidis(t.midis);
const isWobTool=t=>t.offs.length>=3 && !stableMidis(t.midis);
// ----- echo / call-and-response helpers -----
function gridMatches(t){ let n=0; for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++) if(grid[r][c]) n++;
  return n===t.length && t.every(([r,c])=>grid[r]&&grid[r][c]); }
const echoTarget=()=>curStage().echo||[];
const echoMatch=()=>gridMatches(echoTarget());
function echoHint(){ tx("place",()=>{ wipe(); echoTarget().forEach(([r,c])=>{ if(grid[r]&&c<COLS) setCell(r,c,true); }); }); }
function playPhrase(notes){ initAudio(); actx.resume(); const t0=actx.currentTime+0.12, sd=stepDur()/1000;
  notes.forEach(([r,c])=>voice(instrEl.value, midiToFreq(MIDI[r]), t0+c*sd)); }

