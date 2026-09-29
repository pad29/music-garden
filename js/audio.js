// ---------- Audio (unchanged engine) ----------
let actx, master, limiter, reverb, voiceBus, jamBus, drumBus, clickBus;
// the mixer: three player-controllable buses (×base gain) under master — Melody / Band / Drums
let mix={voice:1, band:1, drums:1};
function applyMix(){ if(!actx) return;
  if(voiceBus) voiceBus.gain.value=1.0*mix.voice;     // base gains chosen so 100% = the original balance
  if(jamBus)   jamBus.gain.value =0.45*mix.band;
  if(drumBus)  drumBus.gain.value=0.45*mix.drums; }
function initAudio(){
  if(actx) return;
  actx=new (window.AudioContext||window.webkitAudioContext)();
  // A safety limiter on the sum, because the garden lets you stack notes freely and the voices were only
  // ever level-matched one at a time: ONE music-box note peaks ~0.58, but a three-note chord measured 1.68
  // — 68% past full scale, so it clipped. That was always true; held notes just made the overload last long
  // enough to hear as a buzz rather than a click (and a phone's output stage shows it far more than a laptop's).
  // Threshold sits above a single note, so solo playing is untouched and only genuine pile-ups are caught.
  // Measured (music box, peak at the output): 1 note 0.58 · 3 notes 1.68 · 4 notes higher still. These
  // settings land 3 notes at 0.96 and 4 at 0.98 — under full scale for the first time — while a single
  // note keeps its level, so solo playing is unchanged and only pile-ups are held back.
  limiter=actx.createDynamicsCompressor();
  limiter.threshold.value=-6; limiter.knee.value=0; limiter.ratio.value=20;
  limiter.attack.value=0.002; limiter.release.value=0.15;
  limiter.connect(actx.destination);
  master=actx.createGain(); master.gain.value=0.85; master.connect(limiter);
  voiceBus=actx.createGain(); voiceBus.connect(master);   // player melody / previews / echo
  jamBus=actx.createGain(); jamBus.connect(master);       // jam band: bass + chords + jam's own drums
  drumBus=actx.createGain(); drumBus.connect(master);     // the player's drum sequencer
  // The click gets its own bus rather than riding the drums. A first draft put it on drumBus because "a
  // click is percussion" — a label argument: source calls drumBus "the player's drum sequencer" and the
  // band's own kit goes to jamBus, so the Drums slider means "my pads", not "all percussion". A child who
  // asked to be counted in should not be silenced by muting their own drums. Quiet by design instead of
  // by mixer, and deliberately NOT a fourth slider.
  clickBus=actx.createGain(); clickBus.gain.value=0.35; clickBus.connect(master);
  applyMix();
  reverb=actx.createConvolver();
  const len=actx.sampleRate*1.6, buf=actx.createBuffer(2,len,actx.sampleRate);
  for(let ch=0;ch<2;ch++){ const d=buf.getChannelData(ch);
    for(let i=0;i<len;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/len,2.5); }
  reverb.buffer=buf;
  const rg=actx.createGain(); rg.gain.value=0.22; reverb.connect(rg); rg.connect(master);
}
function env(p,now,a,peak,sustain,dur){
  p.cancelScheduledValues(now); p.setValueAtTime(0,now);
  p.linearRampToValueAtTime(peak*0.5,now+a);
  p.exponentialRampToValueAtTime(Math.max(sustain,0.001)*0.5+0.0005,now+dur*0.8);
  p.linearRampToValueAtTime(0.0001,now+dur);
}
// ---- Sampled voices: real recordings, pitch-shifted at playback (the music box stays synth — it's the brand sound) ----
// Piano = Salamander Grand Piano by Alexander Holm (CC-BY), sampled every 3rd semitone over the game's
// C4–B5 world, so any note is at most 1 semitone of playbackRate shift — below the "chipmunk" threshold.
// Marimba = VCSL (Versilian Community Sample Library, CC0) — sampled every ~5 semitones (all VCSL offers),
// up to ±3 semitones of shift; marimba's near-sinusoidal timbre takes that gracefully.
// Kalimba = FreePats kalimba (CC0) — a clean modern kalimba, 7 tines tuning-corrected at build
// time (real tines run up to 40 cents off; the game's pitch grid can't absorb that). Its top tine
// is C#5, so the highest rows stretch further than any other voice — the FreePats SFZ does the same.
// No synth branch of its own: the music box covers the first note while the pack loads.
// Guitar = FreePats Spanish Classical Guitar (CC0) — near-chromatic source, so it matches the
// piano's every-3rd-semitone layout (≤1 semitone of shift). Replaces the synth "pluck" voice,
// which lives on only as the guitar's loading fallback (setVoice maps old "pluck" saves here).
// Harp = Etherealwinds Harp II CE (CC-BY — credit in .mapcred, like the piano): Jordi Francis's
// 34-string Iona Celtic Harp, chromatic, so piano layout again. NB the library labels notes one
// octave above MIDI (its "C3" file is our MIDI 60); mp3s are trimmed to 3.2s at conversion
// (the conditioner only keeps 3s). Music box covers the first note while the pack loads.
// Vibraphone = VCSL soft mallets (CC0) — 8 bars, ≤2 semitones of shift; VCSL labels vibes an
// octave BELOW sounding pitch (measured, not assumed). Long rings trimmed like the harp's.
// Glockenspiel = VCSL medium mallets (CC0) — a real glock sounds 2 octaves above written pitch
// and its bars start at G5, so this voice carries `up:24`: the grid note is transposed up two
// octaves (authentic orchestration; octaves keep the harmony intact) landing the whole game
// range inside the instrument's true G5–C8 bars. Buffers are keyed by SOUNDING midi (79–108).
// Samples ship as base64 inside samples/<instr>.js (built by tools/build-samples.mjs) and load via a
// <script> tag, NOT fetch — the game must keep working when index.html is opened via file://.
const SAMPLED={ piano:{ src:"samples/piano.js", gain:0.6 },
                marimba:{ src:"samples/marimba.js", gain:0.95 },
                kalimba:{ src:"samples/kalimba.js", gain:1.15 },
                guitar:{ src:"samples/guitar.js", gain:0.95 },
                harp:{ src:"samples/harp.js", gain:0.95 },
                vibraphone:{ src:"samples/vibraphone.js", gain:0.95 },
                glockenspiel:{ src:"samples/glockenspiel.js", gain:0.95, up:24 } };
const sampleBank={};                                        // instr → { ready, buffers:{midi:AudioBuffer} }
// Condition a decoded recording once: keep what the instrument ACTUALLY recorded (up to a ceiling), even
// out note-to-note loudness (recordings vary), cap peaks below clipping, and bake in a tail fade.
// This used to trim every voice to a flat 3s, which was not one limit but seven different lies. Measured:
// piano rings to 16.19s and lost 13 of them; harp/vibraphone/glockenspiel are ~3.24s and lost a quarter of a
// second; marimba (2.51s), kalimba (2.93s) and guitar (median 1.67s) are naturally short and lost nothing.
// So a guitar fading halfway through a slow whole note is a guitar being a guitar — but a PIANO doing it was
// us throwing the recording away. The ceiling is the longest note the game can ever ask for: MAX_VINE (8
// columns) at the slowest tempo the control allows (40 BPM) is 6s, plus room for the release tail.
const VOICE_MAX_SEC=7;
function conditionSample(ctx,buf){
  const rate=buf.sampleRate, len=Math.min(buf.length,(rate*VOICE_MAX_SEC)|0), w=(rate*0.05)|0;
  // Loudness is still measured over the first 3s exactly as before, so no voice changes level just because
  // its tail is now kept. The attack is where the peak lives; only the quiet tail is new.
  const anaLen=Math.min(len,(rate*3)|0);
  let peak=0, win=0, s=0;
  const d0=buf.getChannelData(0);
  for(let i=0;i<anaLen;i++){ const a=Math.abs(d0[i]); if(a>peak) peak=a;
    s+=d0[i]*d0[i]; if(i>=w) s-=d0[i-w]*d0[i-w]; if(i>=w-1) win=Math.max(win,s/w); }
  const scale=Math.min(0.32/(Math.sqrt(win)||1), 0.95/(peak||1));
  const fade=(rate*0.12)|0, out=ctx.createBuffer(buf.numberOfChannels,len,rate);
  for(let ch=0;ch<buf.numberOfChannels;ch++){ const src=buf.getChannelData(ch), dst=out.getChannelData(ch);
    for(let i=0;i<len;i++) dst[i]=src[i]*scale*(i>len-fade?(len-i)/fade:1); }
  return out;
}
function loadSamples(instr){
  const spec=SAMPLED[instr]; if(!spec||sampleBank[instr]) return;
  const bank=sampleBank[instr]={ready:false, buffers:{}};
  const fail=()=>{ delete sampleBank[instr]; };             // missing/broken pack → the synth fallback keeps sounding
  const tag=document.createElement("script"); tag.src=spec.src; tag.onerror=fail;
  tag.onload=()=>{ tag.remove();
    const data=(window.SAMPLE_DATA||{})[instr]; if(!data) return fail();
    const dctx=new OfflineAudioContext(1,1,44100);          // decode-only context — legal before any user gesture
    Promise.all(Object.entries(data).map(([m,b64])=>{
      const bin=atob(b64), bytes=new Uint8Array(bin.length);
      for(let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
      return dctx.decodeAudioData(bytes.buffer).then(buf=>{ bank.buffers[m]=conditionSample(dctx,buf); });
    })).then(()=>{ bank.ready=true; delete SAMPLE_DATA[instr]; })   // drop the base64 copy once decoded
      .catch(fail);
  };
  document.head.appendChild(tag);
}
function sampleVoice(instr,freq,now,out,hold){
  const bank=sampleBank[instr]; if(!bank||!bank.ready) return false;
  const up=SAMPLED[instr].up||0;                            // transposing voices (glockenspiel sounds 2 octaves
  freq*=Math.pow(2,up/12);                                  // up, like real orchestration — its bars don't go lower)
  const midi=Math.round(69+12*Math.log2(freq/440));
  let best=null; for(const m in bank.buffers) if(best===null||Math.abs(m-midi)<Math.abs(best-midi)) best=+m;
  const src=actx.createBufferSource(); src.buffer=bank.buffers[best];
  src.playbackRate.value=freq/midiToFreq(best);
  // A vine just DELAYS the damping — same τ, so a held note is the same sound allowed to ring on, never a
  // looped or invented sustain (§6). A recording still runs out when it runs out, and that is honest: stop at
  // whichever comes first, the note we were asked for or the end of the tape. Was a flat 2.9s for every voice.
  src.connect(out); src.start(now);
  src.stop(now+Math.min(hold?hold+0.9:1.9, src.buffer.duration/src.playbackRate.value));
  out.gain.setValueAtTime(SAMPLED[instr].gain,now);         // let the strike speak, then damp it like an un-pedaled
  out.gain.setTargetAtTime(0.0001,now+(hold?Math.max(0.08,hold-0.15):0.08),0.38);   // note — the raw recording rings pedal-down for many bars
  return true;
}
// How long this voice can ACTUALLY ring for one note. A synth holds as long as it is asked (Infinity); a
// recording holds only as long as it was recorded — and a sample transposed UP runs out sooner, because it
// plays back faster. Mirrors sampleVoice's own nearest-sample choice, which is the only way to be right
// per-note rather than per-instrument.
function ringCeiling(instr, midiPitch){
  const S=SAMPLED[instr], bank=sampleBank[instr];
  if(!S || !bank || !bank.ready) return Infinity;
  const freq=midiToFreq(midiPitch)*Math.pow(2,(S.up||0)/12);
  const midi=Math.round(69+12*Math.log2(freq/440));
  let best=null; for(const m in bank.buffers) if(best===null||Math.abs(m-midi)<Math.abs(best-midi)) best=+m;
  const buf=bank.buffers[best];
  return buf ? buf.duration/(freq/midiToFreq(best)) : Infinity;
}
function voice(instr,freq,now,hold){
  const out=actx.createGain(); out.connect(voiceBus); out.connect(reverb);
  if(SAMPLED[instr]){
    if(sampleVoice(instr,freq,now,out,hold)) return;
    loadSamples(instr);                                     // not decoded yet — fetch, and sound the music box just this once
  }
  if(instr==="pluck"||instr==="guitar"){                    // synth pluck: now only the guitar's loading fallback
    const o=actx.createOscillator(); o.type="sawtooth"; o.frequency.value=freq;
    const lp=actx.createBiquadFilter(); lp.type="lowpass"; lp.frequency.setValueAtTime(4500,now);
    lp.frequency.exponentialRampToValueAtTime(700,now+0.4); o.connect(lp); lp.connect(out);
    const d=Math.max(0.8,hold?hold+0.15:0);                 // a plucked string's honest hold IS its decay — no sustain floor
    o.start(now); o.stop(now+d+0.1); env(out.gain,now,0.005,0.5,0.0,d);   // pluck: saw is bright — tame it
  } else if(instr==="marimba"){
    const o=actx.createOscillator(); o.type="triangle"; o.frequency.value=freq;
    const o2=actx.createOscillator(); o2.type="sine"; o2.frequency.value=freq*4;
    const g2=actx.createGain(); o2.connect(g2); g2.connect(out);
    const d=Math.max(0.6,hold?hold+0.15:0);
    const shim=hold?Math.max(0.25,d*0.5):0.25;              // same fix as the music box: fade the bar's ring, never cut it
    g2.gain.setValueAtTime(0.15,now); g2.gain.setValueAtTime(0.15,now+shim*0.6);
    g2.gain.exponentialRampToValueAtTime(0.0006,now+shim);
    o.connect(out); o.start(now); o.stop(now+d+0.1); o2.start(now); o2.stop(now+shim+0.05);
    env(out.gain,now,0.004,1.0,hold?0.12:0.0,d);            // bars ring — a small floor holds the tone under a vine
  } else {
    const o=actx.createOscillator(); o.type="sine"; o.frequency.value=freq;
    const o2=actx.createOscillator(); o2.type="sine"; o2.frequency.value=freq*2.01;
    const g2=actx.createGain(); o2.connect(g2); g2.connect(out);
    const d=Math.max(1.1,hold?hold+0.35:0);                 // the music box is the ONE voice whose hold is invented
    // The ×2.01 partial IS the music box's shimmer (it beats slowly against the fundamental). It used to be
    // cut dead at a FIXED now+0.6s, so a held note lost ~35dB of upper partial at the same wall-clock moment
    // however long it was — an audible change of tone around the third step. Now it fades, over a window
    // that scales with the note, so a vine keeps one voice from strike to silence.
    const shim=hold?Math.max(0.6,d*0.8):0.6;
    g2.gain.setValueAtTime(0.25,now); g2.gain.setValueAtTime(0.25,now+shim*0.7);
    g2.gain.exponentialRampToValueAtTime(0.0008,now+shim);
    o.connect(out); o.start(now); o.stop(now+d+0.1); o2.start(now); o2.stop(now+shim+0.05);
    env(out.gain,now,0.005,1.2,hold?0.22:0.0,d);
  }
}
function playRow(r,t,hold){ initAudio(); voice(instrEl.value, midiToFreq(MIDI[r]), t, hold); }

