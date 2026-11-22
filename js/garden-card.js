// ---------- Making a garden: the name roller and the garden card (TUN-93) ----------
// The child types nothing. Home's "Create account" shows a generated garden name with 🎲 Roll again; "Make my
// garden" rolls four secret words and shows the garden card, which can be printed or saved as a picture. Only
// once the child ticks "I've kept my card" does "Go to my garden" make the account, sign in and upload this
// device's garden, saying which of those happened. So no account ever exists without a card that was kept, and
// a reload before the tick loses nothing but an account never made. The card is shown once: the secret words
// are never stored anywhere, so they cannot be shown again (DESIGN.md §11b).
const cardoverlay=document.getElementById("cardoverlay"), gardencard=document.getElementById("gardencard");
const GARDEN_SAYS={
  taken:"Someone just took that name, so here is your new card. Keep this one.",
  offline:"☁️ Can't reach the garden just now. Keep your card, and press Try again.",
  saved:"☁️ Your garden is saved in the cloud ✓",
  notSaved:"Your account is made, but your garden isn't in the cloud yet. Keep this page open and press Try again.",
  noRandom:"🌱 This browser can't make a garden name. Keep playing as a guest: your garden is saved on this device.",
  pictureSaved:"🖼️ Saved. Look for the picture in your downloads.",
  pictureFailed:"That didn't work here. Print the card, or copy the words onto paper.",
};
const GARDEN_NUMBER_TRIES=5;   // taken names in a row that keep the child's two words before a new pair is rolled

// One go at making an account: the name and words on the card, and what has happened so far.
function gardenAttempt(name,words){
  return { name, words, tried:new Set([name]), taken:0, uncertain:false, made:false, signedIn:false }; }
// A taken name: a new number (never one already tried), keeping the child's words; after GARDEN_NUMBER_TRIES of
// those, a whole new name. The words stay the same; the card is shown again and must be kept again.
function nextGardenName(a,pick=gardenPick){ a.taken++;
  const [adj,noun]=a.name.split("-");
  for(;;){ const id=a.taken%GARDEN_NUMBER_TRIES===0 ? rollGardenName(pick) : adj+"-"+noun+"-"+rollGardenNumber(pick);
    if(!a.tried.has(id)){ a.tried.add(id); a.name=id; return id; } } }

// Makes the account on the card, signs in, uploads. Resumable: called again after a failure, it skips what is
// done. { ok:true, saved } when signed in (saved: this device's garden reached the cloud); { ok:false, renamed }
// when the name was taken (a.name is new: show the card again); { ok:false, stop, msg } when sign-ups are closed
// or full (no account was made); { ok:false, msg } for anything else, to try again with the same card.
async function createGarden(a,say=()=>{},pick=gardenPick){
  const password=a.words.join("-");
  if(!a.made){ say("🌱 Making your garden…");
    try{ await cogSignUp(a.name,password); a.made=true; a.uncertain=false; }
    catch(e){
      // The answer was lost: the account may or may not exist. Keep the card; the next try finds out.
      if(authOffline(e)){ a.uncertain=true; return { ok:false, msg:GARDEN_SAYS.offline }; }
      if(authCode(e)==="UsernameExistsException"){
        // After a lost answer the "someone else" may be this very card: its words open it if so.
        if(a.uncertain){
          try{ await cogSignIn(a.name,password); a.made=a.signedIn=true; a.uncertain=false; }
          catch(e2){ if(authOffline(e2)) return { ok:false, msg:GARDEN_SAYS.offline }; a.uncertain=false; } }
        if(!a.made){ nextGardenName(a,pick); return { ok:false, renamed:true }; } }
      else if(signUpTriggerFailed(e)) return { ok:false, stop:true, msg:friendlyAuthError(e,"up") };
      else return { ok:false, msg:friendlyAuthError(e,"up") }; } }
  if(!a.signedIn){ say("🌱 Opening your garden…");
    try{ await cogSignIn(a.name,password); a.signedIn=true; }
    catch(e){ return { ok:false, msg:friendlyAuthError(e,"in") }; } }
  say("☁️ Saving your garden to the cloud…");
  const saved=(await onSignedIn(true))===true;
  return { ok:true, saved }; }

function showGardenRoller(){ authbox.innerHTML=""; _authShowsSignedIn=false;
  let id; try{ id=rollGardenName(); }catch(e){ authbox.textContent=GARDEN_SAYS.noRandom; return; }
  const wrap=document.createElement("div"); wrap.className="authform gardenroll";
  const lead=document.createElement("div"); lead.className="hint";
  lead.textContent="Nothing to type: the game makes up your garden name. Roll again until you like it.";
  const name=document.createElement("div"); name.className="gardenname"; name.textContent=gardenDisplayName(id);
  const roll=mkBtn("🎲 Roll again",()=>{ id=rollGardenName(); name.textContent=gardenDisplayName(id); });
  const make=mkBtn("Make my garden →",()=>{ renderAuth(); showGardenCard(gardenAttempt(id,rollPassphrase())); });
  const cancel=mkBtn("Cancel",renderAuth);
  const actions=document.createElement("div"); actions.className="pkgactions"; actions.append(roll,make,cancel);
  wrap.append(lead,name,actions); authbox.appendChild(wrap); }

function gardenCardFace(a){ const face=document.createElement("div"); face.className="gcface";
  const line=(cls,text)=>{ const d=document.createElement("div"); d.className=cls; d.textContent=text; face.appendChild(d); return d; };
  line("gctitle","🌱 Tune Garden");
  line("gclabel","Your garden name"); line("gcname",gardenDisplayName(a.name)); line("gcnote","It's OK to share this.");
  line("gclabel","Your secret words"); line("gcwords",a.words.join("  "));
  line("gcnote","Don't share these. With your garden name, they open your garden on any device.");
  line("gcsite","tunegarden.game");
  return face; }

let _gardenCard=null;   // the attempt the card shows; null when the card is closed
function showGardenCard(a,notice){ _gardenCard=a; gardencard.innerHTML="";
  const face=gardenCardFace(a);
  const note=document.createElement("div"); note.className="gcnotice"; note.textContent=notice||""; note.style.display=notice?"":"none";
  const msg=document.createElement("div"); msg.className="authmsg hint";
  const tools=document.createElement("div"); tools.className="pkgactions gctools";
  tools.append(mkBtn("🖨️ Print",()=>window.print()), mkBtn("💾 Save as a picture",()=>saveCardPicture(a,t=>{ msg.textContent=t; })));
  const kept=document.createElement("label"); kept.className="gckept";
  const box=document.createElement("input"); box.type="checkbox";
  kept.append(box,document.createTextNode(" I've kept my card"));
  const go=mkBtn("Go to my garden",null); go.disabled=true;
  const cancel=mkBtn("Cancel",closeGardenCard);
  const actions=document.createElement("div"); actions.className="pkgactions gcactions"; actions.append(go,cancel);
  let busy=false, done=null;
  const ready=()=>{ go.disabled=busy || !box.checked; };
  box.onchange=ready;
  go.onclick=async()=>{ if(busy || !box.checked || _gardenCard!==a) return;
    busy=true; ready(); cancel.disabled=true;
    let r; try{ r=await createGarden(a,t=>{ msg.textContent=t; }); }
    catch(e){ console.warn("Tune Garden: making a garden failed", e); r={ ok:false, msg:AUTH_SAYS.other }; }
    busy=false; if(_gardenCard!==a) return;   // closed meanwhile
    if(r.renamed){ showGardenCard(a,GARDEN_SAYS.taken); return; }
    if(r.stop){ face.remove(); tools.remove(); kept.remove(); note.style.display="none";   // no account: the card is no good now
      msg.textContent=r.msg; go.remove(); cancel.textContent="Close"; cancel.disabled=false; return; }
    if(!r.ok){ msg.textContent=r.msg; go.textContent="Try again"; ready();
      if(a.made) cancel.remove(); else cancel.disabled=false;   // once the account exists, there is nothing to cancel
      return; }
    kept.remove(); cancel.remove();
    if(r.saved){ msg.textContent=GARDEN_SAYS.saved; go.remove(); }
    else { msg.textContent=GARDEN_SAYS.notSaved; go.textContent="Try again"; ready(); }
    if(!done){ done=mkBtn("Done",closeGardenCard); actions.appendChild(done); } };
  gardencard.append(face,note,tools,kept,msg,actions);
  cardoverlay.style.display="flex"; document.body.classList.add("cardopen"); }
// Closing clears the card from the page: the words are on paper, in a picture, or nowhere.
function closeGardenCard(){ _gardenCard=null; gardencard.innerHTML=""; cardoverlay.style.display="none";
  document.body.classList.remove("cardopen"); renderAuth(); renderPkgs(); }

// The card as a PNG, drawn here (no library), downloaded by the browser; its address is let go once it has been.
function saveCardPicture(a,say){
  try{ const W=1000, H=620, c=document.createElement("canvas"); c.width=W; c.height=H; const x=c.getContext("2d");
    x.fillStyle="#FFFDF6"; x.fillRect(0,0,W,H); x.strokeStyle="#F4C95D"; x.lineWidth=12; x.strokeRect(6,6,W-12,H-12);
    x.fillStyle="#3E3A39"; x.textAlign="center"; x.textBaseline="alphabetic";
    const text=(t,y,size,style="")=>{ let s=size; do{ x.font=`${style} ${s}px system-ui, -apple-system, "Segoe UI", sans-serif`; s-=2; }
      while(x.measureText(t).width>W-80 && s>12); x.fillText(t,W/2,y); };
    text("🌱 Tune Garden",86,44,"bold");
    text("Your garden name",160,28); text(gardenDisplayName(a.name),236,64,"bold"); text("It's OK to share this.",280,24,"italic");
    text("Your secret words",356,28); text(a.words.join("   "),430,56,"bold");
    text("Don't share these. With your garden name, they open your garden on any device.",474,24,"italic");
    text("tunegarden.game",570,30,"bold");
    c.toBlob(blob=>{ if(!blob){ say(GARDEN_SAYS.pictureFailed); return; }
      const url=URL.createObjectURL(blob), link=document.createElement("a");
      link.href=url; link.download="tune-garden-card.png"; document.body.appendChild(link); link.click(); link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),60000); say(GARDEN_SAYS.pictureSaved); },"image/png"); }
  catch(e){ say(GARDEN_SAYS.pictureFailed); } }
