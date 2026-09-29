// ---------- Save & Share (client-side, P2P links — no backend) ----------
const saveBtn=document.getElementById("save"), shareBtn=document.getElementById("share"), melodiesBtn=document.getElementById("melodies");
// --- Song format v3 (see SAVE-SHARE.md): notes store ABSOLUTE MIDI PITCH, not palette-relative row index. ---
// A forward-compatible container (tracks[]/note.len/per-voice) is shipped now but only sparsely filled by today's
// engine (one melody track + one drums track, len always 1). No back-compat with the v2 prototype (clean break).
function currentSong(){
  // serialize from the DOC (true pitch, honest len) — ordered exactly like the old grid sweep
  // (row-major: top row first, then column) so existing links/saves stay byte-identical
  const notes=melTrack().notes
    .filter(n=>{ const c=noteCol(n); return c>=0&&c<COLS; })
    .map(n=>({p:n.pitch,c:noteCol(n),len:Math.max(1,Math.round(n.durationTicks/TICKS_PER_COL)),_r:projRow(n.pitch)}))
    .sort((a,b)=>a._r-b._r||a.c-b.c||b.p-a.p);
  notes.forEach(n=>delete n._r);
  const hits=drumTrack().notes
    .filter(n=>{ const c=noteCol(n); return n.pitch>=0&&n.pitch<DRUMS.length&&c>=0&&c<COLS; })
    .map(n=>({lane:n.pitch,c:noteCol(n)}))
    .sort((a,b)=>a.lane-b.lane||a.c-b.c);
  const now=Date.now();
  const m=meterAt(), time={ cols:COLS, tempo:+tempoEl.value, groove:grooveIdx };
  // meter/origin appear ONLY when the song has them, so every song written before this slice — every save,
  // every share link, every Jukebox entry — still serialises byte-identically.
  if(m){ time.meter=m.preset; time.origin=Math.round(m.originTick/TICKS_PER_COL); }
  return { v:3,
    meta:{ title:null, created:now, updated:now, author:null },   // author filled when cloud storage lands (P3)
    palette:paletteId,
    time,
    tracks:[ { kind:"melody", voice:instrEl.value, notes },
             { kind:"drums",  hits } ] };
}
function applySong(s){
  if(!s||s.v!==3) return;                                   // clean break: only v3 loads; stale links fail gracefully
  setPalette(s.palette||"pentatonic");                      // sets MIDI/NAMES/ROWS for the song's authoring palette
  const mel=(s.tracks||[]).find(t=>t.kind==="melody")||{notes:[]};
  const dr =(s.tracks||[]).find(t=>t.kind==="drums") ||{hits:[]};
  COLS=Math.max(16,(s.time&&s.time.cols)||16);
  tx("load-song",()=>{                                      // rebuild the DOC from the song; projection derives the grids
    melTrack().notes=(mel.notes||[]).filter(n=>n.c>=0&&n.c<COLS)
      .map(n=>({id:newNoteId(),pitch:n.p,startTick:n.c*TICKS_PER_COL,durationTicks:(n.len||1)*TICKS_PER_COL,velocity:1}));
    drumTrack().notes=(dr.hits||[]).filter(h=>h.lane>=0&&h.lane<DRUMS.length&&h.c>=0&&h.c<COLS)
      .map(h=>({id:newNoteId(),pitch:h.lane,startTick:h.c*TICKS_PER_COL,durationTicks:TICKS_PER_COL,velocity:1}));
    const t=s.time||{};                                     // tempo/groove are song state — set INSIDE the tx so redo restores them too
    if(typeof t.groove==="number"&&GROOVES[t.groove]){ grooveIdx=t.groove; grooveEl.value=t.groove; }
    if(t.tempo) tempoEl.value=t.tempo;
    // Meter is the FIRST field that is legitimately ABSENT, so it must not copy the conditional pattern
    // above: loading an unmetered song has to actively CLEAR a meter, not merely decline to set one, or a
    // stale meter (and its bars) survives over the freshly loaded song.
    doc.meterMap = validMeter(t.meter, t.origin);
    // The groove was assigned above, before the meter existed; normalise now that it does. Note this must
    // NOT call applyGrooveTempo() — the song carries its own tempo and a fallback must not overwrite it.
    // Songs saved between the meter slice and the dances legitimately pair a 3/4 meter with one of the old
    // grooves, because currentSong has always written grooveIdx whether or not Jam could use it; those
    // MIGRATE to the dance groove here rather than being treated as corrupt.
    normalizeGroove();
    reproject(); });
  clearLoopRange(); _tintKey=null; syncMeterUI();
  rebuildField();   // build the pitch grid + drum lane together at the new COLS (a song may have widened it) — always aligned
  if(mel.voice) setVoice(mel.voice);
  updateGarden();
}
// --- Packed wire form for #s= links: short positional arrays → base64url. Keeps simple songs linkable; big/complex
// songs exceed SHARE_MAX and must be saved (cloud links arrive in P3). The in-memory object is always the v3 above. ---
const SHARE_MAX=1800;   // encoded-char ceiling for a shareable link
// A share link is UNTRUSTED input. An unknown preset, a negative or fractional origin, or an origin at or
// past a bar's own length all normalise to UNMETERED rather than throwing inside barTicks(METERS[id]) —
// §17 says absence must read as unmetered, and a link we cannot trust is a link with no meter.
function validMeter(preset, originCols){
  const P=meterDef(preset); if(!P) return [];
  const bc=barTicks(P)/TICKS_PER_COL;
  // A MISSING origin means "no pickup" and is the ordinary case; a PRESENT but UNUSABLE one (NaN,
  // Infinity, "abc", negative, or as long as the bar itself) is corruption, and a corrupt origin puts
  // bar 1 in the wrong place, which is worse than no bars at all. `+x||0` would have quietly turned NaN
  // into a valid downbeat. Anything that does coerce to a whole in-range column is ACCEPTED, "2" and 1.5
  // included — they name a real pickup, and rejecting a link over its JSON number type helps nobody.
  const o = (originCols===undefined||originCols===null||originCols==="") ? 0 : Math.round(Number(originCols));
  if(!Number.isFinite(o) || o<0 || o>=bc) return [];   // an origin as long as the bar is not a pickup, it is a mislabelled bar
  return [{tick:0, preset, originTick:o*TICKS_PER_COL}]; }
function packSong(s){
  const mel=(s.tracks||[]).find(t=>t.kind==="melody")||{notes:[]};
  const dr =(s.tracks||[]).find(t=>t.kind==="drums") ||{hits:[]};
  const notes=(mel.notes||[]).map(n=> n.len===1?[n.p,n.c]:[n.p,n.c,n.len]);   // drop len when default (1)
  const hits =(dr.hits||[]).map(h=>[h.lane,h.c]);
  const a=[3, s.palette, s.time.cols, s.time.tempo, s.time.groove, mel.voice||"", notes, hits];
  // Slot 8, PUSHED and never assigned. a[8]=undefined serialises as null, which lengthens EVERY existing
  // link by five characters against SHARE_MAX and breaks byte-identity. Appended, never inserted (§17).
  if(s.time.meter) a.push([s.time.meter, s.time.origin||0]);
  return a;
}
function unpackSong(a){ const [,palette,cols,tempo,groove,voice,notes,hits,meter]=a; const now=Date.now();
  const time={cols,tempo,groove};
  if(Array.isArray(meter) && meter[0]){ time.meter=meter[0]; time.origin=+meter[1]||0; }   // absent = unmetered, so every old link stays bar-less
  return { v:3, meta:{title:null,created:now,updated:now,author:null}, palette, time,
    tracks:[ {kind:"melody",voice,notes:(notes||[]).map(n=>({p:n[0],c:n[1],len:n[2]||1}))},
             {kind:"drums", hits:(hits||[]).map(h=>({lane:h[0],c:h[1]}))} ] }; }
const b64url  =str=>btoa(unescape(encodeURIComponent(str))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const unb64url=b64=>decodeURIComponent(escape(atob(b64.replace(/-/g,"+").replace(/_/g,"/"))));
const encodeSong=s=>b64url(JSON.stringify(packSong(s)));
const decodeSong=str=>{ try{ return unpackSong(JSON.parse(unb64url(str))); }catch(e){ return null; } };
function copyLink(url){ if(navigator.clipboard&&navigator.clipboard.writeText)
    navigator.clipboard.writeText(url).then(()=>toast("🔗 Link copied — paste it to a friend!"),()=>prompt("Copy this link:",url));
  else prompt("Copy this link:",url); }
const baseUrl  = () => location.href.split("#")[0].split("?")[0];   // drop ?dev / #dev from shared links
const inlineLink= enc => baseUrl()+"#s="+enc;
const cloudLink = id  => baseUrl()+"#song="+encodeURIComponent(id);
// Share a song: small songs get an instant inline #s= link (no account). Big songs need the cloud (sign-in).
// A song already pushed to the cloud (meta.cloudId) reuses its stable link.
async function shareSong(s){
  if(s.meta && s.meta.cloudId){ copyLink(cloudLink(s.meta.cloudId)); return; }
  const enc=encodeSong(s);
  if(enc.length<=SHARE_MAX){ copyLink(inlineLink(enc)); return; }
  if(!signedIn()){ toast("🌱 This song's too big for a link — sign in (🏡 Home) to share it from the cloud."); return; }
  toast("☁️ Saving to the cloud…");
  const res=await cloudSongCreate(s, s.meta&&s.meta.title, "unlisted");
  if(res&&res.id){ if(s.meta) s.meta.cloudId=res.id; copyLink(cloudLink(res.id)); }
  else toast("⚠️ Couldn't reach the cloud — please try again.");
}
shareBtn.onclick=()=>shareSong(currentSong());
function getSaves(){ return Store.get("saves",[]).filter(x=>x&&x.v===3); }   // clean break: ignore any v2 saves
function setSaves(a){ return Store.set("saves",a); }   // the return matters: a quest offering must not complete on a failed artifact write
saveBtn.onclick=()=>{ const n=(prompt("Name your melody:","My melody")||"").trim(); if(!n) return;
  const s=currentSong(); s.meta.title=n;
  const a=getSaves(); a.unshift(s); setSaves(a); toast("💾 Saved to My Melodies!"); };
const overlay=document.getElementById("moverlay"), mlist=document.getElementById("mlist");
function mkBtn(t,fn){ const b=document.createElement("button"); b.className="secondary"; b.textContent=t; b.onclick=fn; return b; }
function loadSong(s){ overlay.style.display="none"; openStudioWith(s); setStatus("Loaded into the Studio — press <b>▶ Play</b>!"); }
function playSong(s){ loadSong(s); start();                                    // jukebox: land in the Studio AND start looping it right away
  if(s.meta&&s.meta.title) setStatus("🎵 Now playing: <b>"+s.meta.title+"</b> — tinker freely, or press ■ to stop."); }
function mhint(text,top){ const e=document.createElement("div"); e.className="hint"; if(top) e.style.marginTop="10px"; e.textContent=text; return e; }
// --- Jukebox built-ins: the famous examples that are complete enough to "collect" as songs. (The thin teaching
// excerpts — Amazing Grace, Mountain King, Joy, Ode to Joy, Moldau — stay capstone-only until promoted to full
// versions; Blooms & the Four-Chord progression are constructs, not songs.) Each is just a v3 song. ---
const JUKEBOX_FAMOUS=["mary","swinglow","taps","amazinggrace","joy","odetojoy","bigben","shave","moldau","goinhome","igotrhythm","bachprelude","chopsticks","pachelbel","bodiddley","charleston"];
function famousPalette(id){ const pid=famousOwner(id); return pid ? (PACKAGES[pid].palette||"pentatonic") : "diatonic"; }
function famousToSong(id){ const f=FAMOUS[id]; if(!f) return null; const v=f.jukebox||f;   // the JUKEBOX gets the fuller version (e.g. all 4 verses) when an entry provides one; the capstone reward keeps the short teaching excerpt (top-level mel/chords)
  const notes=[]; (v.mel||[]).forEach(([p,c,len])=>notes.push({p,c,len:Math.max(1,Math.min(len||1,MAX_VINE))}));   // a saved famous tune keeps its holds
  (v.chords||[]).forEach(([ms,c,len])=>ms.forEach(p=>notes.push({p,c,len:Math.max(1,Math.min(len||1,MAX_VINE))})));   // chords = stacked notes in one column, held as long as the score says
  const hits=(v.drums||[]).map(([lane,c])=>({lane,c})); const now=Date.now();
  // Meter is hand-entered from the score on the block the Jukebox plays, and written ONLY when present, in the
  // same key order currentSong uses — so an unmetered entry serialises exactly as it always has. The capstone
  // path (placeFamous) never reads it: §17 keeps rewards bar-less.
  const time={cols:Math.max(16,v.cols||16),tempo:FAMOUS_TEMPO[id]||108,groove:0};
  if(v.meter){ time.meter=v.meter; time.origin=v.origin||0; }
  return { v:3, meta:{title:f.title,created:now,updated:now,author:"Tune Garden",famous:id},
    palette:famousPalette(id), time,
    tracks:[{kind:"melody",voice:"musicbox",notes},{kind:"drums",hits}] }; }
async function openMelodies(){ const a=getSaves(); mlist.innerHTML="";
  // --- Famous Songs (built-in) ---
  mlist.appendChild(mhint("🌟 Famous Songs"));
  JUKEBOX_FAMOUS.forEach(id=>{ const f=FAMOUS[id]; if(!f) return;
    const row=document.createElement("div"); row.className="mrow";
    const nm=document.createElement("span"); nm.className="mname"; nm.textContent=f.title; row.appendChild(nm);
    row.appendChild(mkBtn("▶ Play",()=>playSong(famousToSong(id)))); mlist.appendChild(row); });
  // --- On this device (localStorage) ---
  mlist.appendChild(mhint("🎵 My Melodies — on this device", true));
  // R19 recovery: the rolling autosave surfaces here as a "rescued sprout" — quiet, always reachable, never a modal
  const rescue=Store.get("autosave",null);
  if(rescue && rescue.song && rescue.song.v===3){
    const mins=Math.max(1,Math.round((Date.now()-(rescue.when||0))/60000));
    const when=mins<60?mins+" min ago":mins<60*24?Math.round(mins/60)+" h ago":Math.round(mins/1440)+" days ago";
    const row=document.createElement("div"); row.className="mrow";
    const nm=document.createElement("span"); nm.className="mname"; nm.textContent="🌱 Rescued sprout — auto-saved "+when; row.appendChild(nm);
    row.appendChild(mkBtn("▶ Load",()=>loadSong(rescue.song)));
    mlist.appendChild(row);
  }
  if(!a.length) mlist.appendChild(mhint("No saved melodies yet — make something, then press 💾 Save!"));
  a.forEach((it,i)=>{ const row=document.createElement("div"); row.className="mrow";
    const nm=document.createElement("span"); nm.className="mname"; nm.textContent=(it.meta&&it.meta.title)||"Untitled"; row.appendChild(nm);
    row.appendChild(mkBtn("▶ Load",()=>loadSong(it)));
    row.appendChild(mkBtn("🔗",async()=>{ await shareSong(it); setSaves(a); }));   // persist a cloudId if shareSong minted one
    row.appendChild(mkBtn("🗑",()=>{ const arr=getSaves(); arr.splice(i,1); setSaves(arr); openMelodies(); }));
    mlist.appendChild(row); });
  overlay.style.display="flex";
  // --- In the cloud (cross-device) — signed-in only ---
  if(signedIn()){
    mlist.appendChild(mhint("☁️ In the cloud", true));
    const loading=mhint("Loading…"); mlist.appendChild(loading);
    const cloud=await cloudSongList(); loading.remove();
    if(!cloud.length) mlist.appendChild(mhint("Nothing here yet — share a big song to store it in the cloud."));
    cloud.forEach(it=>{ const row=document.createElement("div"); row.className="mrow";
      const nm=document.createElement("span"); nm.className="mname"; nm.textContent=(it.title||"Untitled")+" ☁️"; row.appendChild(nm);
      row.appendChild(mkBtn("▶ Load",async()=>{ const res=await cloudSongGet(it.id);
        if(res&&res.song){ if(res.song.meta) res.song.meta.cloudId=it.id; loadSong(res.song); } else toast("⚠️ Couldn't load that song."); }));
      row.appendChild(mkBtn("🔗",()=>copyLink(cloudLink(it.id))));
      row.appendChild(mkBtn("🗑",async()=>{ if(await cloudSongDelete(it.id)) openMelodies(); else toast("⚠️ Couldn't delete."); }));
      mlist.appendChild(row); });
  }
}
melodiesBtn.onclick=openMelodies;
document.getElementById("mclose").onclick=()=>overlay.style.display="none";
overlay.onclick=e=>{ if(e.target===overlay) overlay.style.display="none"; };

// ---------- Mixer: one 🎚️ icon → Melody / Band / Drums sliders (live, persisted in settings) ----------
const mixoverlay=document.getElementById("mixoverlay");
const mixVoice=document.getElementById("mixVoice"), mixBand=document.getElementById("mixBand"), mixDrums=document.getElementById("mixDrums");
function mixLabels(){ document.getElementById("mixVoiceV").textContent=mixVoice.value+"%";
  document.getElementById("mixBandV").textContent=mixBand.value+"%";
  document.getElementById("mixDrumsV").textContent=mixDrums.value+"%"; }
function syncMixSliders(){ mixVoice.value=Math.round(mix.voice*100); mixBand.value=Math.round(mix.band*100);
  mixDrums.value=Math.round(mix.drums*100); mixLabels(); }
document.getElementById("mixer").onclick=()=>{ syncMixSliders(); mixoverlay.style.display="flex"; };
function onMixSlide(){ mix.voice=+mixVoice.value/100; mix.band=+mixBand.value/100; mix.drums=+mixDrums.value/100;
  initAudio(); applyMix(); mixLabels(); saveUserSettings(); }
[mixVoice,mixBand,mixDrums].forEach(s=>s.addEventListener("input",onMixSlide));
document.getElementById("mixReset").onclick=()=>{ mix={voice:1,band:1,drums:1}; syncMixSliders(); applyMix(); saveUserSettings(); };
document.getElementById("mixClose").onclick=()=>mixoverlay.style.display="none";
mixoverlay.onclick=e=>{ if(e.target===mixoverlay) mixoverlay.style.display="none"; };

