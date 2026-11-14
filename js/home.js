// ---------- Home / profile + package graph ----------
const homeBtn=document.getElementById("home"), homeoverlay=document.getElementById("homeoverlay"),
  pname=document.getElementById("pname"), pkglist=document.getElementById("pkglist");
// A quest's own Leave button is gone (Q11/A5), so the menu's map button is the ONLY way out — and it
// has to do what that button did. openHome() alone left the playback running, left the completion
// session open, and left a half-pressed confirmation behind for the next visit.
homeBtn.onclick=()=>{ if(isQuestScope()) leaveQuest(); else openHome(); };
document.getElementById("homeclose").onclick=()=>homeoverlay.style.display="none";
homeoverlay.onclick=e=>{ if(e.target===homeoverlay) homeoverlay.style.display="none"; };
pname.oninput=()=>{ savePlayerName(pname.value.trim()); updateTitle(); };
function updateTitle(){ const n=(progress.name||"").trim();
  document.getElementById("title").textContent = "🌱 " + (n ? n+"'s Tune Garden" : "Tune Garden"); }
function openHome(){ pname.value=progress.name||""; renderAuth(); renderPkgs(); renderQuestHome();
  homeoverlay.style.display="flex"; }
let questTrailOpen=false;
// textContent throughout — a quest title is authored text, and this is the second place it could have
// reached innerHTML.
function renderQuestHome(){
  const box=document.getElementById("questhome"); if(!box) return;
  box.textContent="";
  const card=questHomeCard(QUEST_DEFINITIONS, progress, QUEST_RUNS, QUEST_HISTORY);
  const trail=questTrailModel(QUEST_DEFINITIONS, progress, QUEST_RUNS, QUEST_HISTORY);
  if(!card && !Object.keys(QUEST_DEFINITIONS).length) return;
  const line=(cls,text)=>{ if(!text) return; const d=document.createElement("div"); d.className=cls;
    d.textContent=text; box.appendChild(d); };
  const act=(label,fn,cls)=>{ const b=document.createElement("button"); b.textContent=label;
    if(cls) b.className=cls; b.onclick=fn; box.appendChild(b); return b; };

  if(card){
    line("qname", (card.icon?card.icon+" ":"")+card.title);
    line("qsub", card.subtitle);
    line("qmeta", card.meta);
    act(card.label, ()=>{ homeoverlay.style.display="none";
      if(card.kind==="begin") startQuestRun(card.questId);
      else { enterQuestRun(card.runId); if(card.kind==="retry") performQuestAction("retry-offer"); } });
  }
  // A fixed, unbadged link. It says the same thing whether there is one quest behind it or ten.
  {
    act(questTrailOpen ? "Hide the quest trail" : "Quest trail",
      ()=>{ questTrailOpen=!questTrailOpen; renderQuestHome(); }, "secondary");
    // The OTHERS. The quest on the card is not repeated below it: one invitation at a time is the
    // whole of Q22, and a list that echoes the card is a second invitation wearing a different hat.
    const others=trail.filter(r=>!r.surfaced);
    if(questTrailOpen && !others.length) line("qsub", card
      ? "Every quest you can reach is on the map right now."
      : "No quests are open yet — they arrive as the garden grows.");
    if(questTrailOpen) for(const row of others){
      line("qname", (row.icon?row.icon+" ":"")+row.title);
      act(row.label, ()=>{ if(!row.enabled) return; homeoverlay.style.display="none";
        if(row.action==="continue") enterQuestRun(questEligibility(QUEST_DEFINITIONS, progress, QUEST_RUNS, QUEST_HISTORY)
          .find(x=>x.questId===row.questId).liveRunId);
        else startQuestRun(row.questId);       // begin AND replay: a new run, and a new artifact id
      }, row.enabled?"":"secondary").disabled=!row.enabled;
    }
  }
}
function openPkg(id,lvl){ setPlayScope({kind:"package", packageId:id}, {levelIdx:lvl||0});
  narrateReady=true;   // opening a package is a deliberate entry into a level — narration is welcome
  homeoverlay.style.display="none";
  applyRegionInstrument(regionOf(id));   // region default voice + first-visit discovery card (before renderLevel so the card's narration wins)
  renderLevel(); }
// Open the free-play Studio (widest unlocked palette, every tool on). finaleQuiet suppresses the package-complete congrats.
function openStudio(){
  setPlayScope({kind:"studio"});
  narrateReady=true;   // deliberate entry into the studio
  homeoverlay.style.display="none";
  applyRegionInstrument("studio");   // the Studio gifts the guitar on first visit
  finaleQuiet=true; renderLevel(); finaleQuiet=false;
  setStatus("🎵 <b>Studio</b> — build anything, then 💾 Save or 🔗 Share it."); }
function openStudioWith(song){ openStudio(); const cut=!!(song && applySong(song)); journalClear(); return cut; }   // cut: applySong left part of the song behind   // carry a finale's creation into the Studio; undo starts fresh from the loaded song
// ---------- The continent: a fictional world map (the Home menu) ----------
// Each region is a hand-drawn land (blob polygon); its packages get territories by auto-splitting the land.
//   ADD A PACKAGE  → nothing to do here: the region's land re-splits into one territory per package.
//   ADD A REGION   → draw one blob + (optionally) a label anchor; grow the viewBox if the continent needs room.
// The lands tile ONE connected continent: every internal border is a shared point sequence between its two
// neighbours (junctions M,N,O,P,Q,R + one wavy midpoint per border), so the coastline is the only water edge.
const CONTINENT={
  viewBox:"0 0 460 478",
  // The journey radiates from the middle: First Garden at the heart; the three regions the intro
  // unlocks ring it (Paths of Song W · Stone Chorus Canyon E · Pulse Woods S); the later regions
  // arc across the north — Color Spring (NE, grown out of Stone Chorus), Weather of Wanting (NW),
  // and the Twin Gardens crowning the top between the two lands that unlock them.
  // Internal borders are SHARED point sequences (byte-identical in every land that lists them);
  // triple junctions: [228,192] [281,283] [199,290] (First Garden corners) · [201,118] paths/stone/twin ·
  // [310,98] stone/twin/color-spring · [168,132] paths/twin/weather.
  lands:{
    "first-garden":        [[228,192],[272,204],[290,242],[281,283],[240,300],[199,290],[178,250],[189,211]],
    "paths-of-song":       [[201,118],[209,155],[228,192],[189,211],[178,250],[199,290],[150,310],[105,330],[82,300],[64,262],[98,220],[110,170],[168,132],[186,124]],
    "stone-chorus-canyon": [[201,118],[262,102],[310,98],[368,168],[434,206],[436,252],[414,298],[378,332],[330,305],[281,283],[290,242],[272,204],[228,192],[209,155]],
    "pulse-woods":         [[199,290],[240,300],[281,283],[330,305],[378,332],[388,372],[368,412],[318,440],[252,452],[186,446],[128,420],[92,378],[105,330],[150,310]],
    "color-spring":        [[334,40],[392,58],[428,90],[446,136],[434,206],[368,168],[310,98],[324,70]],
    "weather-of-wanting":  [[44,58],[96,34],[150,30],[158,80],[168,132],[110,170],[98,220],[64,262],[40,220],[34,160],[36,104]],
    "twin-gardens":        [[150,30],[210,20],[268,20],[318,26],[334,40],[324,70],[310,98],[262,102],[201,118],[186,124],[168,132],[158,80]],
  },
  labels:{ "first-garden":[234,228,1], "paths-of-song":[144,214,1], "stone-chorus-canyon":[344,200,1],   // [x, y, wrap?] — wrap splits a long name onto two lines; fitLabels() nudges every label (+ friend) fully INSIDE its land
           "pulse-woods":[240,384], "color-spring":[390,112,1], "weather-of-wanting":[96,68,1],
           "twin-gardens":[245,60] },
  studio:{ poly:[[398,420],[430,412],[452,430],[446,456],[416,464],[396,446]], label:[424,406] },
};
// tiny polygon toolkit for the map
const polyArea=p=>{ let a=0; for(let i=0;i<p.length;i++){ const[x1,y1]=p[i],[x2,y2]=p[(i+1)%p.length]; a+=x1*y2-x2*y1; } return a/2; };
const polyCentroid=p=>{ let a=0,cx=0,cy=0; for(let i=0;i<p.length;i++){ const[x1,y1]=p[i],[x2,y2]=p[(i+1)%p.length];
  const c=x1*y2-x2*y1; a+=c; cx+=(x1+x2)*c; cy+=(y1+y2)*c; } a*=3; return [cx/a,cy/a]; };
function clipHalf(poly,[px,py],[dx,dy]){    // keep the part LEFT of the directed line through (px,py) along (dx,dy)
  const out=[], side=([x,y])=>dx*(y-py)-dy*(x-px);
  for(let i=0;i<poly.length;i++){ const A=poly[i], B=poly[(i+1)%poly.length], sa=side(A), sb=side(B);
    if(sa>=0) out.push(A);
    if((sa>0&&sb<0)||(sa<0&&sb>0)){ const t=sa/(sa-sb); out.push([A[0]+t*(B[0]-A[0]), A[1]+t*(B[1]-A[1])]); } }
  return out;
}
function splitPolyN(poly,n,seed){           // recursive area bisection with gently tilted cuts → territory-like pieces
  if(n<=1) return [poly];
  const k=Math.floor(n/2), frac=k/n;
  const xs=poly.map(p=>p[0]), ys=poly.map(p=>p[1]);
  const wide=(Math.max(...xs)-Math.min(...xs)) >= (Math.max(...ys)-Math.min(...ys));
  const skew=((seed%2)?1:-1)*0.22;                       // ~12° tilt so borders don't look ruler-drawn
  const d=wide?[skew,1]:[1,skew];
  const total=Math.abs(polyArea(poly));
  let lo=wide?Math.min(...xs):Math.min(...ys), hi=wide?Math.max(...xs):Math.max(...ys), piece=poly, rest=[];
  for(let it=0;it<22;it++){ const m=(lo+hi)/2, pt=wide?[m,0]:[0,m];
    piece=clipHalf(poly,pt,d); rest=clipHalf(poly,pt,[-d[0],-d[1]]);
    const fa=Math.abs(polyArea(piece))/total;
    if((fa>frac)===wide) hi=m; else lo=m; }
  return [...splitPolyN(piece,k,seed*2+1), ...splitPolyN(rest,n-k,seed*2+2)];
}
const hex2rgb=h=>[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];
const mixhex=(h1,h2,t)=>{ const a=hex2rgb(h1), b=hex2rgb(h2);
  return "#"+a.map((v,i)=>Math.round(v+(b[i]-v)*t).toString(16).padStart(2,"0")).join(""); };
const pathD=poly=>"M"+poly.map(p=>p[0].toFixed(1)+" "+p[1].toFixed(1)).join("L")+"Z";
const pointInPoly=(x,y,poly)=>{ let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){ const[xi,yi]=poly[i],[xj,yj]=poly[j];
    if((yi>y)!==(yj>y) && x<(xj-xi)*(y-yi)/(yj-yi)+xi) inside=!inside; }
  return inside; };
const boxInPoly=(x,y,hw,hh,poly)=>pointInPoly(x-hw,y-hh,poly)&&pointInPoly(x+hw,y-hh,poly)
  &&pointInPoly(x-hw,y+hh,poly)&&pointInPoly(x+hw,y+hh,poly)&&pointInPoly(x,y,poly);
const rectsOverlap=(a,b)=>a[0]<b[2]&&b[0]<a[2]&&a[1]<b[3]&&b[1]<a[3];
const splitLabel=txt=>{ const w=txt.split(" "), cut=Math.ceil(w.length*2/3);
  return [w.slice(0,cut).join(" "), w.slice(cut).join(" ")]; };
// estimated keep-out boxes for a region's label + friend (glyph placement runs before text is measurable)
function labelBlocks(reg){
  const la=CONTINENT.labels[reg.id]; if(!la) return [];
  const txt=reg.emoji+" "+reg.name.toUpperCase();
  const lines=la[2]? splitLabel(txt) : [txt];
  const hw=Math.max(...lines.map(s=>[...s].length))*4.3+5;
  const fy=la[1]+(la[2]?46:34);
  return [[la[0]-hw, la[1]-10, la[0]+hw, la[1]+(la[2]?20:4)],
          [la[0]-16, fy-21, la[0]+16, fy+6]];
}
// where a territory's status glyph can sit: fully inside its own land, clear of the label + friend —
// spiral out from the centroid until both hold (relaxing the label rule before ever leaving the land)
function glyphSpot(poly,blocks){
  const [gx,gy]=polyCentroid(poly);
  const ok=(x,y)=>boxInPoly(x,y,9,9,poly)&&!blocks.some(b=>rectsOverlap([x-9,y-9,x+9,y+9],b));
  if(ok(gx,gy)) return [gx,gy];
  for(let r=6;r<=66;r+=6) for(let k=0;k<16;k++){ const a=k/16*2*Math.PI+r*.37;
    const x=gx+r*Math.cos(a), y=gy+r*Math.sin(a); if(ok(x,y)) return [x,y]; }
  for(let r=0;r<=66;r+=6) for(let k=0;k<16;k++){ const a=k/16*2*Math.PI+r*.37;
    const x=gx+r*Math.cos(a), y=gy+r*Math.sin(a); if(boxInPoly(x,y,7,7,poly)) return [x,y]; }
  return [gx,gy];
}
// after the SVG is live, measure each region's label + friend for real and nudge the pair until the
// whole block sits inside its land — actual emoji/text metrics vary by platform, so estimates aren't enough
function fitLabels(svg){
  REGION_MAP.forEach(reg=>{
    const land=CONTINENT.lands[reg.id]; if(!land) return;
    const els=[...svg.querySelectorAll(`[data-land="${reg.id}"]`)];
    if(!els.length||els[0].getBBox().width===0) return;      // overlay still hidden — remeasured on next open
    const [ccx,ccy]=polyCentroid(land);
    let dx=0,dy=0;
    for(let it=0;it<30;it++){
      let x1=1e9,y1=1e9,x2=-1e9,y2=-1e9;
      els.forEach(el=>{ const b=el.getBBox(); x1=Math.min(x1,b.x); y1=Math.min(y1,b.y);
        x2=Math.max(x2,b.x+b.width); y2=Math.max(y2,b.y+b.height); });
      x1+=dx-2; x2+=dx+2; y1+=dy-1; y2+=dy+1;
      const pts=[[x1,y1],[x2,y1],[x1,y2],[x2,y2],[(x1+x2)/2,y1],[(x1+x2)/2,y2],[x1,(y1+y2)/2],[x2,(y1+y2)/2]];
      if(pts.every(([x,y])=>pointInPoly(x,y,land))) break;
      const bx=(x1+x2)/2, by=(y1+y2)/2, d=Math.hypot(ccx-bx,ccy-by)||1;
      dx+=(ccx-bx)/d*3; dy+=(ccy-by)/d*3;
    }
    if(dx||dy) els.forEach(el=>el.setAttribute("transform",`translate(${dx.toFixed(1)} ${dy.toFixed(1)})`));
  });
}
// hover tooltip (name · progress · prerequisites)
let maptip=null;
function mapTipHTML(id){
  if(id==="__studio") return "<b>🎵 Studio</b><br>free play — build, save & share anything";
  const pk=PACKAGES[id], pp=pkgProg(id), total=pk.levels.length;
  if(!isPkgUnlocked(id)){ const reqs=(pk.requires||[]).filter(r=>!reqMet(r)).flat().map(r=>(PACKAGES[r]&&PACKAGES[r].name)||r).join(", ");
    return `<b>${pk.name}</b><br>🔒 finish first: ${reqs}`; }   // only the prerequisites still MISSING
  if(pp.completed) return `<b>${pk.name}</b><br>✓ complete — click to replay`;
  const reached=Math.min((pp.maxLevel||0)+1,total);
  return `<b>${pk.name}</b><br>${reached}/${total} levels — click to ${pp.level?"resume":"play"}`;
}
function renderPkgs(){ pkglist.innerHTML="";
  let powers=0; Object.keys(PACKAGES).forEach(id=>{ if(PACKAGES[id].hidden) return; powers+=Math.min(pkgProg(id).done||0, PACKAGES[id].levels.length); });
  const head=document.createElement("div"); head.className="maphead";
  head.textContent = powers ? `🌟 ${powers} power${powers>1?"s":""} earned on your journey` : "Your journey begins here 🌱";
  pkglist.appendChild(head);
  let cells="", borders="", marks="", labels="";
  REGION_MAP.forEach((reg,ri)=>{
    const land=CONTINENT.lands[reg.id]; if(!land) return;
    const pkgs=Object.keys(PACKAGES).filter(id=>regionOf(id)===reg.id && !PACKAGES[id].hidden);
    const open=reg.id==="first-garden" || pkgs.some(id=>isPkgUnlocked(id));
    const parts=splitPolyN(land, Math.max(pkgs.length,1), ri+3);
    const lblocks=labelBlocks(reg);
    pkgs.forEach((id,i)=>{
      const pk=PACKAGES[id], poly=parts[i], unlocked=isPkgUnlocked(id), pp=pkgProg(id);
      const done=pp.completed;
      const fill=unlocked ? mixhex(reg.color,"#FFFFFF", done?.10:.28+(i%3)*.13)
                          : mixhex(mixhex(reg.color,"#8C8880",.58),"#FFFFFF",.34);
      const [cx,cy]=glyphSpot(poly,lblocks);              // fully inside its territory, clear of the label + friend
      cells+=`<path d="${pathD(poly)}" class="mcell${unlocked?"":" mlocked"}${id===activePackageId()?" mcur":""}" data-pkg="${id}" fill="${fill}" stroke="${mixhex(reg.color,"#3E3A39",.35)}"/>`;
      // ONE status glyph per territory — lock WINS over a stale completed flag (dev-jump saves can hold both):
      // 🔒 locked · ✓ complete · ▶ open to play
      if(!unlocked) marks+=`<text x="${cx.toFixed(1)}" y="${(cy+5).toFixed(1)}" class="memoji">🔒</text>`;
      else if(done) marks+=`<text x="${cx.toFixed(1)}" y="${(cy+5).toFixed(1)}" class="mdone">✓</text>`;
      else marks+=`<text x="${cx.toFixed(1)}" y="${(cy+4).toFixed(1)}" class="mplay">▶</text>`;
    });
    borders+=`<path d="${pathD(land)}" class="mborder" stroke="${mixhex(reg.color,"#3E3A39",.62)}"/>`;
    const f=regionFriend(reg.id), st=regionStage(reg.id);
    const [lx,ly,wrap]=CONTINENT.labels[reg.id]||polyCentroid(land);
    const op=open?"":' opacity=".55"';
    if(wrap){ const [l1,l2]=splitLabel(reg.emoji+" "+reg.name.toUpperCase());
      labels+=`<text x="${lx}" y="${ly}" class="mlabel" data-land="${reg.id}"${op}><tspan x="${lx}">${l1}</tspan><tspan x="${lx}" dy="12">${l2}</tspan></text>`;
    } else labels+=`<text x="${lx}" y="${ly}" class="mlabel" data-land="${reg.id}"${op}>${reg.emoji} ${reg.name.toUpperCase()}</text>`;
    if(f&&open) labels+=`<text x="${lx}" y="${ly+(wrap?46:34)}" class="mfriend" data-land="${reg.id}">${f.stages[st]}</text>`;   // the region's friend, centered under the label with clear air below the text
  });
  // the Studio: a little free-play island off the coast
  cells+=`<path d="${pathD(CONTINENT.studio.poly)}" class="mcell" data-pkg="__studio" fill="${mixhex("#F4C95D","#FFFFFF",.25)}" stroke="${mixhex("#F4C95D","#3E3A39",.35)}"/>`;
  borders+=`<path d="${pathD(CONTINENT.studio.poly)}" class="mborder" stroke="${mixhex("#F4C95D","#3E3A39",.62)}"/>`;   // the island reads as a region, not a dashed package
  marks+=`<text x="${polyCentroid(CONTINENT.studio.poly)[0].toFixed(1)}" y="${(polyCentroid(CONTINENT.studio.poly)[1]+5).toFixed(1)}" class="memoji">🎵</text>`;
  labels+=`<text x="${CONTINENT.studio.label[0]}" y="${CONTINENT.studio.label[1]}" class="mlabel">STUDIO</text>`;
  const map=document.createElement("div");
  map.innerHTML=`<svg id="worldmap" viewBox="${CONTINENT.viewBox}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="460" height="478" rx="14" fill="#D9E8F0"/>
    <path d="M28 448 q10 -7 20 0 t20 0" fill="none" stroke="#B9D2E0" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M386 22 q10 -7 20 0 t20 0" fill="none" stroke="#B9D2E0" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M408 370 q9 -6 18 0 t18 0" fill="none" stroke="#B9D2E0" stroke-width="2.4" stroke-linecap="round"/>
    ${cells}${borders}${marks}${labels}</svg>`;
  const svg=map.firstElementChild;
  const wrap=document.createElement("div"); wrap.className="mapwrap";
  wrap.appendChild(svg); pkglist.appendChild(wrap);
  requestAnimationFrame(()=>fitLabels(svg));              // measure once the overlay is actually visible
  const cred=document.createElement("div"); cred.className="mapcred";
  cred.textContent="🎹 Piano: Salamander Grand Piano by Alexander Holm (CC-BY) · 🪄 Harp: Etherealwinds Harp II CE by Jordi Francis & Versilian Studios (CC-BY)";
  pkglist.appendChild(cred);
  // the territory box: click a land to read about it and Continue / Restart
  const mapbox=document.createElement("div"); mapbox.className="mapbox"; wrap.appendChild(mapbox);
  function showMapBox(id,clientY){
    // float the box over the half of the map the click did NOT happen in, so the clicked land stays visible
    const r=svg.getBoundingClientRect();
    if(clientY!=null && clientY < r.top+r.height/2){ mapbox.style.top="auto"; mapbox.style.bottom="16px"; }
    else { mapbox.style.top="16px"; mapbox.style.bottom="auto"; }
    svg.querySelectorAll(".msel").forEach(c=>c.classList.remove("msel"));
    const cell=svg.querySelector(`[data-pkg="${id}"]`); if(cell) cell.classList.add("msel");
    mapbox.innerHTML="";
    const nameEl=document.createElement("div"); nameEl.className="mb-name";
    const descEl=document.createElement("div"); descEl.className="mb-desc";
    const metaEl=document.createElement("div"); metaEl.className="mb-meta";
    const row=document.createElement("div"); row.className="mb-actions";
    if(id==="__studio"){
      nameEl.textContent="🎵 Studio";
      descEl.textContent="Free play — build, save, and share anything you like.";
      row.appendChild(mkBtn("▶ Open Studio",openStudio));
      mapbox.append(nameEl,descEl,row);
    } else {
      const pk=PACKAGES[id], pp=pkgProg(id), unlocked=isPkgUnlocked(id), total=pk.levels.length;
      nameEl.textContent=pk.name;
      descEl.textContent=pk.desc||"";
      if(!unlocked){
        const reqs=(pk.requires||[]).filter(r=>!reqMet(r)).flat().map(r=>(PACKAGES[r]&&PACKAGES[r].name)||r).join(", ");
        metaEl.textContent=`🔒 Finish first: ${reqs}`;
        mapbox.append(nameEl,descEl,metaEl);
      } else {
        const reached=pp.completed?total:Math.min((pp.maxLevel||0)+1,total);
        metaEl.textContent=pp.completed?`✓ complete — ${total} levels`:`${reached}/${total} levels`;
        row.appendChild(mkBtn(pp.completed?"▶ Replay":(pp.level?"▶ Continue":"▶ Play"),()=>openPkg(id, pp.completed?0:(pp.level||0))));
        if(!pp.completed && (pp.level||pp.maxLevel)) row.appendChild(mkBtn("↺ Restart",()=>openPkg(id,0)));
        mapbox.append(nameEl,descEl,metaEl,row);
      }
    }
    mapbox.style.display="block";
  }
  if(!maptip){ maptip=document.createElement("div"); maptip.className="maptip"; document.body.appendChild(maptip); }
  svg.addEventListener("pointermove",e=>{ const t=e.target.closest("[data-pkg]");
    if(!t){ maptip.style.display="none"; return; }
    maptip.innerHTML=mapTipHTML(t.dataset.pkg);
    maptip.style.left=e.clientX+"px"; maptip.style.top=(e.clientY-8)+"px"; maptip.style.display="block"; });
  svg.addEventListener("pointerleave",()=>{ maptip.style.display="none"; });
  svg.addEventListener("click",e=>{ const t=e.target.closest("[data-pkg]"); maptip.style.display="none";
    if(!t) return;                                        // (dismissal of the box is handled overlay-wide below)
    showMapBox(t.dataset.pkg, e.clientY); });             // locked lands open the box too — it explains the prerequisites
  // clicking anywhere OUTSIDE the box (and not on a land) dismisses it — single assignment, so re-renders don't stack
  homeoverlay.onpointerdown=e=>{ if(e.target.closest(".mapbox")||e.target.closest("[data-pkg]")) return;
    mapbox.style.display="none"; svg.querySelectorAll(".msel").forEach(c=>c.classList.remove("msel")); };
}

