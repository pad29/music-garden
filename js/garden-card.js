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
  madeNotIn:"Your account is made. Keep your card: you can press Try again, or sign in with it on Home later, and your garden goes up then.",
  noRandom:"🌱 This browser can't make a garden name. Keep playing as a guest: your garden is saved on this device.",
  pictureAsked:"🖼️ Your browser should have saved the picture. Open it and check the words before you tick the box.",
  pictureFailed:"That didn't work here. Print the card, or copy the words onto paper.",
};
const GARDEN_NUMBER_TRIES=5;   // taken names in a row that keep the child's two words before a new pair is rolled

// One go at making an account: the name and words on the card, and what has happened so far. `uncertain`: a
// sign-up was sent and its answer lost, so the account may exist; it is settled by signing in before anything
// else is sent.
function gardenAttempt(name,words){
  return { name, words, tried:new Set([name]), taken:0, uncertain:false, made:false, signedIn:false }; }
// A taken name: a new number (never one already tried for these words), keeping the child's words; on every
// GARDEN_NUMBER_TRIES-th, or when the pair has no number left, a whole new name with a different pair. The secret
// words stay the same; the card is shown again and must be kept again.
function nextGardenName(a,pick=gardenPick){ a.taken++;
  const [adj,noun]=a.name.split("-"), pair=adj+"-"+noun;
  const triedHere=[...a.tried].filter(id=>id.startsWith(pair+"-")).map(id=>+id.slice(pair.length+1));
  const num=a.taken%GARDEN_NUMBER_TRIES===0 ? null : rollGardenNumber(pick,triedHere);
  let id=num===null ? null : pair+"-"+num;
  while(id===null || a.tried.has(id)) id=rollGardenName(pick,pair);
  a.tried.add(id); a.name=id; return id; }

// A refusal that settles it: these words do not open an account of this name — it does not exist, or someone
// else's does (the pool answers both the same way). A lockout ("attempts exceeded") or any other failure settles
// nothing.
const wordsDontOpenIt=e=> authCode(e)==="NotAuthorizedException" && !/attempts exceeded/i.test(String((e&&e.message)||""));

// Makes the account on the card, signs in, uploads. Resumable: called again after a failure, it skips what is
// done. { ok:true, saved } when signed in (saved: this device's current garden reached the cloud); { ok:false,
// renamed } when the name is someone else's (a.name is new: show the card again); { ok:false, stop, msg } when
// sign-ups are closed or full and this card's account was not made; { ok:false, msg } for anything else, to try
// again with the same card.
async function createGarden(a,say=()=>{},pick=gardenPick){
  const password=a.words.join("-");
  if(!a.made && a.uncertain){ say("🌱 Checking your garden…");
    try{ await cogSignIn(a.name,password); a.made=a.signedIn=true; a.uncertain=false; }
    catch(e){ if(!wordsDontOpenIt(e)) return { ok:false, msg:authOffline(e) ? GARDEN_SAYS.offline : friendlyAuthError(e,"in") };
      a.uncertain=false; } }   // not this card's: it was never made, or the name is someone else's — sign-up says which
  if(!a.made){ say("🌱 Making your garden…");
    try{ await cogSignUp(a.name,password); a.made=true; }
    catch(e){
      if(authCode(e)==="UsernameExistsException"){ nextGardenName(a,pick); return { ok:false, renamed:true }; }
      if(signUpTriggerFailed(e)) return { ok:false, stop:true, msg:friendlyAuthError(e,"up") };   // refused: nothing was made
      a.uncertain=true;   // a lost answer or a service failure: the account may exist
      return { ok:false, msg:authOffline(e) ? GARDEN_SAYS.offline : friendlyAuthError(e,"up") }; } }
  if(a.signedIn && !currentUserIs(a.name)) a.signedIn=false;   // another tab signed someone else in, or out
  if(!a.signedIn){ say("🌱 Opening your garden…");
    try{ await cogSignIn(a.name,password); a.signedIn=true; }
    catch(e){ return { ok:false, msg:friendlyAuthError(e,"in") }; } }
  say("☁️ Saving your garden to the cloud…");
  const saved=(await onSignedIn(true,a.name))===true;   // only this card's account, with its own token
  if(!saved && !currentUserIs(a.name)) a.signedIn=false;
  return { ok:true, saved }; }

function showGardenRoller(){ authbox.innerHTML=""; _authShowsSignedIn=false;
  let id; try{ id=rollGardenName(); }catch(e){ authbox.textContent=GARDEN_SAYS.noRandom; return; }
  const wrap=document.createElement("div"); wrap.className="authform gardenroll";
  const lead=document.createElement("div"); lead.className="hint";
  lead.textContent="Nothing to type: the game makes up your garden name. Roll again until you like it.";
  const name=document.createElement("div"); name.className="gardenname"; name.setAttribute("aria-live","polite");
  name.textContent=gardenDisplayName(id);
  const roll=mkBtn("🎲 Roll again",()=>{ id=rollGardenName(); name.textContent=gardenDisplayName(id); });
  const make=mkBtn("Make my garden →",()=>{ renderAuth(); showGardenCard(gardenAttempt(id,rollPassphrase())); });
  const cancel=mkBtn("Cancel",renderAuth);
  const actions=document.createElement("div"); actions.className="pkgactions"; actions.append(roll,make,cancel);
  wrap.append(lead,name,actions); authbox.appendChild(wrap); roll.focus(); }

function gardenCardFace(a){ const face=document.createElement("div"); face.className="gcface";
  const line=(cls,text)=>{ const d=document.createElement("div"); d.className=cls; d.textContent=text; face.appendChild(d); return d; };
  line("gctitle","🌱 Tune Garden").id="gctitle";
  line("gclabel","Your garden name"); line("gcname",gardenDisplayName(a.name)); line("gcnote","It's OK to share this.");
  line("gclabel","Your secret words"); line("gcwords",a.words.join("  "));
  line("gcnote","Don't share these. With your garden name, they open your garden on any device.");
  line("gcsite","tunegarden.game");
  return face; }

// The card is a modal dialog (index.html: role="dialog", aria-modal): while it is up, everything else on the
// page is inert — no Home button behind it can be reached by Tab or pressed — and focus stays inside it.
let _gardenCard=null;   // the attempt the card shows; null when the card is closed
let _cardInerted=[];
function setCardModal(on){
  for(const el of _cardInerted) el.inert=false; _cardInerted=[];
  if(on) for(const el of Array.from(document.body.children||[])) if(el!==cardoverlay && !el.inert && el.tagName!=="SCRIPT"){ el.inert=true; _cardInerted.push(el); } }

function showGardenCard(a,notice){ _gardenCard=a; gardencard.innerHTML="";
  const face=gardenCardFace(a);
  const note=document.createElement("div"); note.className="gcnotice"; note.setAttribute("role","alert");
  note.textContent=notice||""; note.style.display=notice?"":"none";
  const msg=document.createElement("div"); msg.className="authmsg hint"; msg.setAttribute("role","status"); msg.setAttribute("aria-live","polite");
  const tools=document.createElement("div"); tools.className="pkgactions gctools";
  const printBtn=mkBtn("🖨️ Print",()=>window.print());
  tools.append(printBtn, mkBtn("💾 Save as a picture",()=>saveCardPicture(a,t=>{ msg.textContent=t; })));
  const kept=document.createElement("label"); kept.className="gckept";
  const box=document.createElement("input"); box.type="checkbox";
  kept.append(box,document.createTextNode(" I've kept my card"));
  const go=mkBtn("Go to my garden",null); go.disabled=true;
  const cancel=mkBtn("Cancel",closeGardenCard);
  const actions=document.createElement("div"); actions.className="pkgactions gcactions"; actions.append(go,cancel);
  // `latched`: the child said this card is kept and pressed Go. It holds for this card from then on (a renamed
  // card is a new card, drawn afresh), so unticking the box mid-request can never strand Try again.
  let busy=false, latched=false, done=null;
  const ready=()=>{ go.disabled=busy || !(latched || box.checked); box.disabled=busy || latched; };
  const addDone=()=>{ if(!done){ done=mkBtn("Done",closeGardenCard); actions.appendChild(done); } };
  box.onchange=ready;
  go.onclick=async()=>{ if(busy || !(latched || box.checked) || _gardenCard!==a) return;
    busy=true; latched=true; ready(); cancel.disabled=true;
    let r; try{ r=await createGarden(a,t=>{ msg.textContent=t; }); }
    catch(e){ console.warn("Tune Garden: making a garden failed", e); r={ ok:false, msg:AUTH_SAYS.other }; }
    finally{ busy=false; }
    if(_gardenCard!==a) return;   // closed meanwhile
    if(r.renamed){ showGardenCard(a,GARDEN_SAYS.taken); return; }
    if(r.stop){ face.remove(); tools.remove(); kept.remove(); note.style.display="none";   // no account: the card is no good now
      msg.textContent=r.msg; go.remove(); cancel.textContent="Close"; cancel.disabled=false; cancel.focus(); return; }
    kept.remove(); ready();
    if(!r.ok){ go.textContent="Try again";
      if(a.made){ cancel.remove(); addDone(); msg.textContent=r.msg+" "+GARDEN_SAYS.madeNotIn; }   // nothing to cancel: the account exists
      else { cancel.disabled=false; msg.textContent=r.msg; }
      go.focus(); return; }
    cancel.remove(); addDone();
    if(r.saved){ msg.textContent=GARDEN_SAYS.saved; go.remove(); done.focus(); }
    else { msg.textContent=GARDEN_SAYS.notSaved; go.textContent="Try again"; go.focus(); } };
  gardencard.append(face,note,tools,kept,msg,actions);
  cardoverlay.style.display="flex"; document.body.classList.add("cardopen"); setCardModal(true);
  (notice ? box : printBtn).focus(); }
// Closing clears the card from the page: the words are on paper, in a picture, or nowhere.
function closeGardenCard(){ _gardenCard=null; gardencard.innerHTML=""; cardoverlay.style.display="none";
  document.body.classList.remove("cardopen"); setCardModal(false); renderAuth(); renderPkgs();
  const first=authbox.querySelector && authbox.querySelector("button"); if(first) first.focus(); }
// Tab stays inside the card while it is up (the page behind is inert as well, for browsers that know inert).
if(cardoverlay) cardoverlay.addEventListener("keydown",e=>{ if(e.key!=="Tab") return;
  const f=Array.from(gardencard.querySelectorAll("button:not([disabled]),input:not([disabled])"));
  if(!f.length) return; const first=f[0], last=f[f.length-1];
  if(e.shiftKey && document.activeElement===first){ last.focus(); e.preventDefault(); }
  else if(!e.shiftKey && document.activeElement===last){ first.focus(); e.preventDefault(); } });

// The card as a PNG, drawn here (no library), and handed to the browser to download. The browser may still ask,
// block it or be cancelled, so the card says to check the picture, never that it is safely kept. Its address is
// let go a minute later.
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
    c.toBlob(blob=>{ try{ if(!blob){ say(GARDEN_SAYS.pictureFailed); return; }
        const url=URL.createObjectURL(blob), link=document.createElement("a");
        link.href=url; link.download="tune-garden-card.png"; document.body.appendChild(link); link.click(); link.remove();
        setTimeout(()=>URL.revokeObjectURL(url),60000); say(GARDEN_SAYS.pictureAsked); }
      catch(e){ say(GARDEN_SAYS.pictureFailed); } },"image/png"); }
  catch(e){ say(GARDEN_SAYS.pictureFailed); } }
