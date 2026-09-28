// ---------- Music model: palettes (per-package pitch sets) ----------
// Palette is per-package/level, NOT a global mode (DESIGN §11 "Palette-system architecture").
// The physics (isTonic/stableMidis/chordName/intervalName) already reason in real semitones (MIDI[r]%12),
// so widening the palette is just swapping these arrays + rebuilding the grid — no physics changes.
const PALETTES = {
  // today's world — 10 rows, C D E G A across two octaves (A5..C4). The "can't-sound-bad" default.
  pentatonic: { id:"pentatonic", name:"Pentatonic", tonicPC:0,
    MIDI:[81,79,76,74,72, 69,67,64,62,60],
    NAMES:["A5","G5","E5","D5","C5","A4","G4","E4","D4","C4"] },
  // widened world — 14 rows, full C major (adds F & B), two octaves (B5..C4). Unlocks real triads/cadence/tension.
  diatonic: { id:"diatonic", name:"Diatonic", tonicPC:0,
    MIDI:[83,81,79,77,76,74,72, 71,69,67,65,64,62,60],
    NAMES:["B5","A5","G5","F5","E5","D5","C5","B4","A4","G4","F4","E4","D4","C4"] },
};
let paletteId="pentatonic";
let MIDI  = PALETTES.pentatonic.MIDI;     // current-palette pitch set (top→bottom); reassigned by setPalette()
let NAMES = PALETTES.pentatonic.NAMES;
let TONIC_PC = PALETTES.pentatonic.tonicPC;
let COLS = 16, ROWS = MIDI.length;        // ROWS is now palette-derived (was const) — future vertical expansion = a palette change
const midiToFreq = m => 440 * Math.pow(2,(m-69)/12);
const isTonic = r => MIDI[r]%12===TONIC_PC;
let grid = Array.from({length:ROWS},()=>Array(COLS).fill(false));
let gridNote = Array.from({length:ROWS},()=>Array(COLS).fill(null));   // the doc note behind each lit cell — duration lookup + vine hit test
// swap the active palette and rebuild the grid; no-op if already active (so it's cheap to call on every level entry)
function setPalette(id){ const p=PALETTES[id]||PALETTES.pentatonic;
  if(p.id===paletteId) return;
  paletteId=p.id; MIDI=p.MIDI; NAMES=p.NAMES; TONIC_PC=p.tonicPC; ROWS=MIDI.length;
  modelClearMelody();   // same semantics as the old grid rebind: switching palette clears the field (drums survive)
  buildGrid(); }

// ---------- Tools: defined by ladder-step offsets from the bottom note ----------
// pair => [0,g]; chord => [0,g1,g1+g2]. Staying on ladder keeps everything consonant.
const sig = offs => offs.join("-");
// "apartness" is measured in real pitch (semitones), NOT uneven ladder rungs:
// a 3rd-or-wider (>=3) stands; a 2nd (<=2) wobbles. So both inversions of a chord agree.
const stableMidis = midis => { for(let i=1;i<midis.length;i++) if(midis[i]-midis[i-1]<3) return false; return true; };
// A pair has TWO independent readings; don't confuse them:
//   WIDTH (here) - how far apart it looks on the ladder and sounds: close (2nd) / bright (3rd) / open (a 4th and wider).
//   TENSION (pairTension, below) - whether it clashes. That one folds to pitch class, so a compound minor 2nd is tense.
// Width reads the RAW gap and never folds by octave: two seeds an octave-and-a-2nd apart are visibly far apart, so they
// are open, not close. "Octave twins" is a DISPLAY NAME for an exact octave - a special-sounding OPEN pair, not a fourth
// band. Goals only ever ask for close/bright/open, and craftedOpen/countColBands must agree about that.
const pairSpan = midis => Math.abs(Math.max(...midis) - Math.min(...midis));   // order-independent: saved toolbox arrays aren't re-sorted on load
const isOctavePair = g => { const w=Math.abs(g); return w>0 && w%12===0; };
function widthBand(g){ const w=Math.abs(g); return w<=2?"close": w<=4?"bright":"open"; }   // w===0 (unison) bands close; not craftable from the grid
function pairMeta(g){ if(isOctavePair(g)) return {em:"🌟",name:"Octave twins"};
  const b=widthBand(g);
  return b==="close" ? {em:"🌿",name:"Close pair"} : b==="bright" ? {em:"🌸",name:"Bright pair"} : {em:"🍃",name:"Open pair"}; }
function pairKind(midis){ return widthBand(pairSpan(midis)); }
function toolMeta(offs, midis){
  if(offs.length===2) return pairMeta(pairSpan(midis));
  return stableMidis(midis) ? {em:"🏛️",name:"Tower"} : {em:"🌀",name:"Wobbler"};
}

// ---- real note/interval/chord names (computed from the actual crafted notes) ----
const NOTE_NAMES=["C","C♯","D","D♯","E","F","F♯","G","G♯","A","A♯","B"];
const INTERVALS={0:"unison",1:"minor 2nd",2:"major 2nd",3:"minor 3rd",4:"major 3rd",5:"perfect 4th",
  6:"tritone",7:"perfect 5th",8:"minor 6th",9:"major 6th",10:"minor 7th",11:"major 7th"};
const CHORD_TPL={"0,4,7":"major","0,3,7":"minor","0,2,7":"sus2","0,5,7":"sus4","0,3,6":"diminished","0,4,8":"augmented"};
function intervalName(g){ if(g>0&&g%12===0) return "octave";
  const oct=g>=12?" + octave":""; return (INTERVALS[g%12]||((g%12)+" semitones"))+oct; }
function chordName(midis){
  const pcs=[...new Set(midis.map(m=>((m%12)+12)%12))].sort((a,b)=>a-b);
  if(pcs.length<=1) return "unison";
  if(pcs.length===2){ const lo=Math.min(...midis), hi=Math.max(...midis);
    return intervalName(hi-lo)+" ("+NOTE_NAMES[lo%12]+"–"+NOTE_NAMES[hi%12]+")"; }
  for(const r of pcs){ const key=pcs.map(p=>((p-r)%12+12)%12).sort((a,b)=>a-b).join(",");
    if(CHORD_TPL[key]) return NOTE_NAMES[r]+" "+CHORD_TPL[key]; }
  let cluster=((pcs[0]+12)-pcs[pcs.length-1])<=2;
  for(let i=1;i<pcs.length;i++) if(pcs[i]-pcs[i-1]<=2) cluster=true;
  return cluster?"cluster voicing":"open / quartal voicing";
}
const toolRealName = tool => chordName(tool.midis);
// tiny stacked-dots picture of the tool's shape (root = teal, bottom)
function miniSVG(offs){
  const stepPx=4.5, pad=4, top=Math.max(...offs), h=top*stepPx+pad*2+2, w=16, cx=w/2;
  const y0=h-pad-1; let dots="";
  offs.forEach(o=>{ dots+=`<circle cx="${cx}" cy="${y0-o*stepPx}" r="3.1" fill="${o===0?'#44A35F':'#E0AD3C'}"/>`; });
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`
    +`<line x1="${cx}" y1="${y0}" x2="${cx}" y2="${y0-top*stepPx}" stroke="rgba(62,58,57,.22)" stroke-width="2"/>`
    +dots+`</svg>`;
}

let toolbox=[];          // array of {offs, midis} — PER-SCOPE (reloaded when the scope changes; see loadScopeToolbox)
let toolboxOwner=null;   // scopeKey() of the bag we hold: pkg:<id>, studio, or quest:<runId>. Never global.
let activeTool=null;     // {offs, midis} currently picked up

