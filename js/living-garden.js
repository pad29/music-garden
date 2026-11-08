// ---------- Living garden: per-note flowers bloom on play, bouquets for chords, a growing flower bed ----------
const NOTE_FLOWER={0:"🌸",2:"🌼",4:"🌷",5:"🪻",7:"🌻",9:"🌺",11:"🌹"};   // C D E F G A B — one flower per note (F & B are the diatonic "new colors")
const noteFlower=r=>NOTE_FLOWER[((MIDI[r]%12)+12)%12]||"🌷";
const colFlower=c=>{ const rows=[]; for(let r=0;r<ROWS;r++) if(grid[r][c]) rows.push(r);
  return rows.length===0?null : rows.length>=2?"💐" : noteFlower(rows[0]); };   // same flower the cell blooms
const gardenbed=document.getElementById("gardenbed");
function bloom(el,emoji){ if(!el) return; const b=el.getBoundingClientRect(); const p=document.createElement("div");
  p.className="bloom"; p.textContent=emoji||"🌷";
  p.style.left=(b.left+b.width/2-9)+"px"; p.style.top=b.top+"px";
  document.body.appendChild(p); setTimeout(()=>p.remove(),1300); }
function updateGarden(){ gardenbed.innerHTML="";
  for(let c=0;c<COLS;c++){ const fl=colFlower(c); if(!fl) continue;
    const f=document.createElement("span"); f.className="flower"; f.textContent=fl; gardenbed.appendChild(f); } }

