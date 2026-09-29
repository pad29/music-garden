// ---------- Jam backing: drums + bass + chords (C – G – Am – F) ----------
// dest defaults to jamBus (the band); the drum sequencer passes drumBus so its pads mix separately
function bTone(t,freq,dur,type,peak,att,dest){ att=att||0.02; const o=actx.createOscillator(); o.type=type; o.frequency.value=freq;
  const g=actx.createGain(); g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(peak,t+att);
  g.gain.exponentialRampToValueAtTime(0.0001,t+dur); o.connect(g); g.connect(dest||jamBus); o.start(t); o.stop(t+dur+0.03); }
function kick(t,peak,dest){ const o=actx.createOscillator(),g=actx.createGain();
  o.frequency.setValueAtTime(150,t); o.frequency.exponentialRampToValueAtTime(50,t+0.12);
  g.gain.setValueAtTime(peak||0.9,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.16);
  o.connect(g); g.connect(dest||jamBus); o.start(t); o.stop(t+0.18); }
function noiseHit(t,dur,type,freq,peak,dest){ const len=Math.max(1,(actx.sampleRate*dur)|0);
  const b=actx.createBuffer(1,len,actx.sampleRate),d=b.getChannelData(0);
  for(let i=0;i<len;i++) d[i]=Math.random()*2-1;
  const n=actx.createBufferSource(); n.buffer=b;
  const f=actx.createBiquadFilter(); f.type=type; f.frequency.value=freq;
  const g=actx.createGain(); g.gain.setValueAtTime(peak,t); g.gain.exponentialRampToValueAtTime(0.001,t+dur);
  n.connect(f); f.connect(g); g.connect(dest||jamBus); n.start(t); n.stop(t+dur); }
const snare=(t,peak,dest)=>noiseHit(t,0.16,"bandpass",1800,peak||0.4,dest);
const hat=(t,peak,dest)=>noiseHit(t,0.04,"highpass",8000,peak||0.18,dest);
const ch=(bass,chord)=>({bass,chord});
const GROOVES=[                                                  // swing 0 = straight … ~0.33 = full triplet shuffle
 {name:"🎵 Pop",     bpm:116, swing:0,    drums:"rock", bass:"drive",  prog:[ch(36,[60,64,67]),ch(43,[55,59,62]),ch(45,[57,60,64]),ch(41,[53,57,60])]}, // C  G  Am F
 {name:"💗 Ballad",  bpm:78,  swing:0,    drums:"soft", bass:"half",   prog:[ch(45,[57,60,64]),ch(41,[53,57,60]),ch(36,[60,64,67]),ch(43,[55,59,62])]}, // Am F  C  G
 {name:"🕺 Doo-wop", bpm:104, swing:0.33, drums:"rock", bass:"bounce", prog:[ch(36,[60,64,67]),ch(45,[57,60,64]),ch(41,[53,57,60]),ch(43,[55,59,62])]}, // C  Am F  G
 {name:"🌙 Lo-fi",   bpm:82,  swing:0.25, drums:"lofi", bass:"sparse", prog:[ch(45,[57,60,64]),ch(38,[57,62,65]),ch(43,[55,59,62]),ch(48,[60,64,67])]}, // Am Dm G  C
 {name:"🤠 Folk",    bpm:100, swing:0.12, drums:"soft", bass:"root5",  prog:[ch(36,[60,64,67]),ch(41,[53,57,60]),ch(36,[60,64,67]),ch(43,[55,59,62])]}, // C  F  C  G
 // --- the dances. APPENDED, never inserted: grooveIdx is song state (time.groove, snapState, packSong
 // slot 4), so index 2 has to stay Doo-wop forever, the same discipline packSong's slot 8 follows.
 // `cycle` is the whole repeat in COLUMNS — 24 = four six-column bars — and `bar` is what the patterns
 // key off, which is how a waltz and a jig can share a bar width and still be different dances.
 // `meter` says which presets they belong to; an untagged groove is one of the five above.
 {name:"💃 Waltz",   bpm:144, swing:0,    drums:"waltz", bass:"waltz", comp:"oompah", bar:6, cycle:24, meter:["3/4"],
  prog:[ch(36,[60,64,67]),ch(45,[57,60,64]),ch(38,[57,62,65]),ch(43,[55,59,62])]},   // C  Am Dm G
 // 180 quarter-BPM is 120 dotted quarters a minute - a textbook session jig. It first shipped at 138,
 // which is 92 a minute and a lilt; I blamed the 170 ceiling for that and was wrong, since 170 gives 113
 // a minute and would have been a real jig too. The ceiling went up because 120 is the round number a
 // jig is actually described by, not because 138 was forced on anyone.
 {name:"🍀 Jig",     bpm:180, swing:0,    drums:"jig",   bass:"jig",   comp:"pulse",  bar:6, cycle:24, meter:["6/8"],
  prog:[ch(36,[60,64,67]),ch(41,[53,57,60]),ch(36,[60,64,67]),ch(43,[55,59,62])]},   // C  F  C  G
];
// Which grooves can play against a meter. An untagged groove is one of the five that shipped, and its
// 16-column cycle divides a 4/4 bar (8) and a 2/4 bar (4) exactly — and nothing else, which is why waltz
// and jig had to bring their own rather than borrow.
function grooveFits(G, presetId){
  if(!G) return false;
  if(G.meter) return G.meter.indexOf(presetId)>=0;
  return !presetId || presetId==="4/4" || presetId==="2/4"; }
// What the picker OFFERS, which is wider than what fits musically. With no meter there is no bar drawn
// for a dance to contradict and no lesson to confuse, so the Studio offers every groove — the owner's call,
// 2026-09-05: "I don't see why not."
// **Gated on the STUDIO and not on the absence of a meter, which is the whole subtlety: every shipped
// level is unmetered too.** `grooveFits(G, null)` is exactly the test resetTransient uses to decide
// whether a groove may follow the player out of the Studio, so widening THAT would have put a waltz into
// a package, where a scripted runReveal({jam:true}) plays its reveal on whatever band is selected. That
// hole was found by a design review and closed a week ago; this keeps it closed.
function inStudio(){ return isStudioScope(); }   // a quest shares the editor but never inherits Studio policy
function grooveOffered(G, presetId){
  return grooveFits(G, presetId) || (!presetId && !!G.meter && inStudio()); }
function grooveChoices(){ const m=(typeof meterAt==="function")?meterAt():null, id=m?m.preset:null;
  const out=[]; GROOVES.forEach((G,i)=>{ if(grooveOffered(G,id)) out.push({G,i}); }); return out; }
// Move to a groove that can play the current meter, and report whether anything moved. Callers that
// journal MUST run this inside their own transaction — grooveIdx is part of snapState, so normalising
// outside one lets undo restore the old meter beside the new groove.
function normalizeGroove(){
  const m=(typeof meterAt==="function")?meterAt():null;
  // OFFERED, not merely fits: a waltz chosen in the free Studio must survive the next redraw, while the
  // same waltz must still be moved off the moment the player walks into a package.
  if(grooveOffered(GROOVES[grooveIdx], m?m.preset:null)) return false;
  const c=grooveChoices(); if(!c.length) return false;
  grooveIdx=c[0].i; return true; }
let grooveIdx=0, jamMode=false, jamStartedPlayback=false;
// ---------- The band as DATA: what a groove plays at a given column ----------
// PURE — no audio nodes, no clock, nothing but the groove it is handed — and that is the entire point:
// **`D_jam` cannot see any of this.** The golden's capture wrapper records only THAT jamStep was called
// (`{k:'j',step,dt}`), and the band's own kick/snare/hat go straight to `jamBus` rather than through
// `DRUMS[i].play`, which is the only percussion it intercepts — which is why every D_jam step reads
// `drums: []` and its own note admits its value is "the fact that every step fires a jamStep". A total
// rewrite of the groove content would re-capture that golden byte-identically. So the golden is NOT an
// oracle for what the band plays; `tests/groove.test.mjs` is, and it holds a verbatim copy of the logic
// as it shipped to compare against.
//
// `cycle` is the groove's whole repeat in COLUMNS, defaulting to the 16 every shipped groove was written
// as. It is deliberately NOT `bar * prog.length`: for the shipped five that product is 64, which would
// quadruple the cycle and put the wrong chord under nearly every column — an error a first draft of this
// made, asserted was identical, and offered D_jam to prove. The golden would have agreed.
function groovePlan(G, step){
  const cyc=(G&&G.cycle)||16, s=((step%cyc)+cyc)%cyc;
  const chordCols=cyc/G.prog.length, c=G.prog[(s/chordCols)|0];
  const b=G.bar ? s%G.bar : s, barIdx=G.bar ? (s/G.bar)|0 : 0;   // position in the bar, and which bar
  const P={ s, chordCols, chordHold:chordCols, chord:null, bass:[], kick:[], snare:[], hat:[] };
  // The chord. A dance COMPS rather than laying a bed, so these branches REPLACE the legacy one rather
  // than adding to it — leaving the bed underneath would put a chord on waltz beat 1 and contradict the
  // one thing that makes a waltz a waltz.
  if(G.comp==="oompah"){ if(b===2||b===4){ P.chord=c.chord; P.chordHold=2; } }        // the pah-pah, a beat each
  else if(G.comp==="pulse"){ if(b===0||b===3){ P.chord=c.chord; P.chordHold=3; } }    // one per dotted-quarter pulse
  else if(s%chordCols===0) P.chord=c.chord;                                           // the shipped sustained bed
  // bass — pattern varies per style
  if(G.bass==="waltz"){ if(b===0) P.bass.push(barIdx%2 ? c.bass+7 : c.bass); }        // waltz: the OOM, root then fifth bar by bar
  else if(G.bass==="jig"){ if(b===0) P.bass.push(c.bass); else if(b===3) P.bass.push(c.bass+7); }  // jig: one per pulse
  else if(G.bass==="half"){ if(s%4===0) P.bass.push(c.bass); }                       // ballad: one note per chord
  else if(G.bass==="sparse"){ if(s%4===0||s===6||s===14) P.bass.push(c.bass); }      // lo-fi: laid-back
  else if(G.bass==="bounce"){ if(s%2===0) P.bass.push(s%4===0?c.bass:c.bass+12); }   // doo-wop: octave bounce
  else if(G.bass==="root5"){ if(s%4===0) P.bass.push(c.bass); else if(s%4===2) P.bass.push(c.bass+7); } // folk: root–fifth
  else { if(s%2===0) P.bass.push(c.bass); }                                          // pop: driving
  // drums (distinct per style). Lists rather than single values because "lofi" fires kick from two
  // separate conditions; they happen never to coincide, and a list means nothing depends on that.
  // A waltz has NO backbeat — a snare on 2 is what stops it being a waltz. The 2-and-3 ticks are `hat`,
  // which is a 40ms 8kHz noise blip: a closed hi-hat, not a brush. Calling it a brush would be a label
  // asserting a sound the code does not make, which is this project's most-repeated mistake.
  if(G.drums==="waltz"){ if(b===0) P.kick.push(0.34); else if(b===2||b===4) P.hat.push(0.10); }
  else if(G.drums==="jig"){ if(b===0||b===3) P.kick.push(0.36); P.hat.push(0.11); }        // two pulses over running eighths
  else if(G.drums==="soft"){ if(s%8===0) P.kick.push(0.34); if(s%8===4) P.snare.push(0.26); }   // gentle, no hats
  else if(G.drums==="lofi"){ if(s%4===0) P.kick.push(0.4); if(s%4===2) P.snare.push(0.28);
                             if(s%2===1) P.hat.push(0.12); if(s%8===6) P.kick.push(0.28); } // laid-back, offbeat hats
  else { if(s%4===0) P.kick.push(0.46); if(s%4===2) P.snare.push(0.3); P.hat.push(0.14); }  // pop/rock, steady hats
  return P;
}
// …and the thin renderer that books it. Every event of one column is scheduled at the SAME `t`, so the
// order below is immaterial to what is heard — it matches the old function's order anyway.
function jamStep(step,t){
  const G=GROOVES[grooveIdx], m=(typeof meterAt==="function")?meterAt():null;
  // The band follows the BARS the child can see: measuring from the downbeat means a pickup shifts the
  // band exactly as it shifts the barlines. Unmetered, and for any meter with no pickup, the offset is 0
  // and this is the expression that shipped.
  const oc = m ? Math.round(m.originTick/TICKS_PER_COL) : 0;
  const P=groovePlan(G, step-oc);
  const seg=stepDur()*P.chordHold/1000;                              // a bed lasts its region; a comp stab is shorter
  if(P.chord) P.chord.forEach(m=>bTone(t,midiToFreq(m),seg*0.95,"triangle",0.16,0.05));
  for(const m of P.bass) bTone(t,midiToFreq(m),0.26,"sawtooth",0.5);
  for(const pk of P.kick)  kick(t,pk);
  for(const pk of P.snare) snare(t,pk);
  for(const pk of P.hat)   hat(t,pk);
}

