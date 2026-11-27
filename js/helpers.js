// ---------- helpers ----------
const statusEl=document.getElementById("status");
function setStatus(html){ statusEl.innerHTML=html; }
// The same line, for text the player or an author wrote. setStatus takes markup, and a quest's strings
// are the one kind that must never reach innerHTML — the catalog guard is the belt, this is the brace.
function setStatusText(text){ statusEl.textContent=text; }
// For a line that is markup around someone's text — a song title inside <b> — escape the text first.
const escapeHtml=s=>String(s).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
let toastT; const toastEl=document.createElement("div"); toastEl.className="toast"; document.body.appendChild(toastEl);
// above: over the overlays too (.toast.above), for a word about the card the player is looking at (TUN-135).
function toast(msg, above){ toastEl.textContent=msg; toastEl.classList.toggle("above", above===true); toastEl.classList.add("show");
  clearTimeout(toastT); toastT=setTimeout(()=>toastEl.classList.remove("show"),2600); }
function confetti(){ const colors=["#F4C95D","#44A35F","#F28C8C","#5AA9E6","#8A6FE8"];
  for(let i=0;i<48;i++){ const d=document.createElement("div"); d.className="confetti";
    d.style.left=Math.random()*100+"vw"; d.style.background=colors[i%colors.length];
    d.style.animationDuration=(1.6+Math.random()*1.6)+"s"; d.style.animationDelay=(Math.random()*0.3)+"s";
    document.body.appendChild(d); setTimeout(()=>d.remove(),3600); } }

// ---------- starter content + per-level hints ----------
function setMelody(pairs){ tx("place",()=>{ wipe();
  pairs.forEach(([r,c])=>{ if(grid[r]&&c<COLS) setCell(r,c,true); }); }); checkLevel(); }
// setMelody's duration-aware sibling: [row,col] or [row,col,lengthInColumns]. Every scripted path — setMelody,
// placeTune, placeFamous, paste — creates notes exactly one column long, so without this NO level setup and no
// 💡 Hint could ever show a child a held note. Onsets go down FIRST so vineMax() sees the finished field before
// any length is clamped, and each note is found by (row,col) rather than through gridNote.
function setMelodyLens(list){
  tx("place",()=>{ wipe();
    list.forEach(([r,c])=>{ if(grid[r] && c>=0 && c<COLS) setCell(r,c,true); });
    const t=melTrack();
    list.forEach(([r,c,L])=>{ if(!L || L<2) return;
      const n=t.notes.find(q=>projRow(q.pitch)===r && noteCol(q)===c); if(!n) return;
      n.durationTicks = Math.max(1, Math.min(L, MAX_VINE, vineMax(n))) * TICKS_PER_COL; });   // never show what a child couldn't build
    reproject(); });
  renderVines(); checkLevel(); }                       // setCell's own renderVines ran before the lengths were written
function hintMelody(){ const pairs=[]; let r=Math.floor(Math.random()*ROWS);
  for(let c=0;c<COLS;c+=2){ r=Math.max(0,Math.min(ROWS-1,r+(Math.floor(Math.random()*3)-1)*(1+Math.floor(Math.random()*2)))); pairs.push([r,c]); }
  const tr=[...MIDI.keys()].filter(isTonic); pairs[pairs.length-1]=[tr[Math.floor(Math.random()*tr.length)],14];
  setMelody(pairs); }
function hintSeeds(pairs){ tx("place",()=>{ wipe(); pairs.forEach(([r,c])=>{ if(grid[r]&&c<COLS) setCell(r,c,true); }); }); }
const hintBtn=document.getElementById("hint");
hintBtn.onclick=()=>{ const st=curStage(); if(st.hint){ st.hint(); ev.played=false; checkLevel();
  setStatus("💡 Here's an example — now try it yourself!"); } };
