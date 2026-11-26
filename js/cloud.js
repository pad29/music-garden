// ---------- Cloud accounts & sync (AWS Cognito + progress API) ----------
const AUTH={ region:"us-east-1", userPoolId:"us-east-1_Ikzq1qoTI", clientId:"44vulb0g89acopnl86svibaitf",
  apiUrl:"https://xush1pnxc7.execute-api.us-east-1.amazonaws.com" };
const cognitoReady=()=> typeof AmazonCognitoIdentity!=="undefined";
let userPool = cognitoReady() ? new AmazonCognitoIdentity.CognitoUserPool({ UserPoolId:AUTH.userPoolId, ClientId:AUTH.clientId }) : null;
let cloudOn=false;
// Whether this device may write the cloud copy (TUN-106). "off": not signed in. "loading": signed in, the
// pull is in flight. "ready": the cloud copy was read (or the account is brand new). "unreachable": the pull
// failed. A push replaces the whole cloud copy, so only "ready" may send one — never a copy the game never read.
let cloudSync="off";
let _cloudRun=0;   // bumped by every sign-in and sign-out: a load or push begun in an earlier run must not act when it returns
// Whether the cloud is answering (TUN-87): the last cloud call to finish, in start order, failed. It changes only
// what the panel and messages SAY — never cloudSync, so it grants no write and never turns "unreachable" into
// "ready". The game cannot tell a cloud switched off at the month's budget from a busy one (backend/README.md
// § The cost switch), so both are "the cloud is resting".
let cloudResting=false, _callSeq=0, _seenSeq=0;
// Call at the START of a cloud call; call what it returns with true/false when the call ends. A result applies
// only in the run it began in and only if no later-started call has already reported, so a slow old success
// cannot hide a newer failure, nor an old failure a newer success. The panel is redrawn only while it shows the
// signed-in row: never over a sign-in form the player may be typing into.
let _authShowsSignedIn=false, _authSaysSaved=false;   // the panel shows the signed-in row; …and "saved to cloud" in it
function cloudCall(){ const run=_cloudRun, seq=++_callSeq;
  return ok=>{ if(run!==_cloudRun || seq<=_seenSeq) return; _seenSeq=seq;
    if(cloudResting===!ok) return; cloudResting=!ok; if(_authShowsSignedIn) renderAuth(); }; }
const CLOUD_RESTING={
  load:" — ☁️ the cloud is resting just now. Your cloud garden is safe there, and what you play now is kept on this device. When the cloud wakes, reloading brings your cloud garden back in its place.",
  save:" — ☁️ the cloud is resting just now. What you play is kept on this device, and goes up with your next save after it wakes, while this page stays open. Opening the game again after it wakes brings your cloud garden back in its place.",
  songLink:"☁️ The cloud is resting just now, so this song can't open yet. Try the link again later.",
  share:"☁️ The cloud is resting just now — try sharing this song again later.",
  song:"☁️ The cloud is resting just now — try again later.",
  list:"☁️ The cloud is resting just now — your cloud songs are safe there. Try again in a moment.",
  signUp:"🌱 The garden isn't taking new accounts just now. Keep playing as a guest — your garden is saved on this device — and try again another day.",
};
// What a load may apply: an object with a packages object. Anything else but an explicit null is a failed load.
const loadableProgress=p=> !!p && typeof p==="object" && !Array.isArray(p) && !!p.packages && typeof p.packages==="object" && !Array.isArray(p.packages);
// An account is a garden name and a passphrase, nothing else (TUN-93): no attributes, no validation data. The
// library's signUp takes them by position: (username, password, attributes, validationData, callback).
function cogSignUp(username,password){ return new Promise((res,rej)=>{
  userPool.signUp(username,password,[],null,(err,r)=>err?rej(err):res(r)); }); }
function cogSignIn(username,password){ return new Promise((res,rej)=>{
  const u=new AmazonCognitoIdentity.CognitoUser({Username:username,Pool:userPool});
  const d=new AmazonCognitoIdentity.AuthenticationDetails({Username:username,Password:password});
  u.authenticateUser(d,{ onSuccess:s=>res(s), onFailure:e=>rej(e) }); }); }
function doSignOut(){ const u=userPool&&userPool.getCurrentUser(); if(u) u.signOut(); _cloudRun++; cloudOn=false; cloudSync="off"; _syncUser=_syncSub=null; cloudResting=false; clearTimeout(_pushT); renderAuth(); }
// Whose garden this is (TUN-93). The session lives in storage the browser's tabs share, so another tab can sign
// someone else in at any time — and once an account is deleted, its name can come back as a different account.
// So a sync run belongs to one account by name AND by `sub` (Cognito's permanent id, which keys the cloud rows):
// its read and every write check both on the very token they send, and an observed change ends the run's right
// to write — the next sign-in reads the cloud copy before it saves.
const currentUserName=()=>{ const u=userPool&&userPool.getCurrentUser(); return u ? String(u.getUsername()).toLowerCase() : null; };
const currentUserIs=name=>currentUserName()===name;
// { token, sub }; { mismatch:true } when the stored user or the token's own claims are not `name` / `sub`; {} when
// there is no usable session. Without name or sub, that part is not checked (the song calls).
function freshId(name,sub){ return new Promise(res=>{ const u=userPool&&userPool.getCurrentUser(); if(!u) return res({});
  if(name && String(u.getUsername()).toLowerCase()!==name) return res({ mismatch:true });
  u.getSession((err,sess)=>{ if(err||!sess||!sess.isValid()) return res({});
    const id=sess.getIdToken(), p=(id&&id.payload)||{};
    if(name && String(p["cognito:username"]||"").toLowerCase()!==name) return res({ mismatch:true });
    if(sub && p.sub!==sub) return res({ mismatch:true });
    res({ token:id.getJwtToken(), sub:p.sub||null }); }); }); }
function freshToken(name,sub){ return freshId(name,sub).then(r=>r.token||null); }
let _syncUser=null, _syncSub=null;   // the account this tab's sync belongs to; null when it belongs to none
// The account changed under this run: no more writes, and the panel stops saying it syncs, until a sign-in reads again.
function loseSync(){ cloudSync="off"; cloudOn=false; _syncUser=_syncSub=null; clearTimeout(_pushT); if(_authShowsSignedIn) renderAuth(); }
// { ok:true, progress } — progress is null when nothing is saved yet; { ok:false } when it could not be read
// (no token, 429, 5xx, a network error, a body that is not JSON). Never confuse the two: see onSignedIn, which also
// treats a 200 that is neither null nor loadable progress as a failed load.
async function cloudPull(name,sub){ const done=cloudCall(); const id=await freshId(name,sub);
  if(id.mismatch) return { ok:false, mismatch:true };   // not this run's account: no cloud failure to report
  const t=id.token; if(!t){ done(false); return { ok:false }; }
  try{ const r=await fetch(AUTH.apiUrl+"/progress",{headers:{Authorization:"Bearer "+t}}); if(!r.ok){ done(false); return { ok:false }; }
    const progress=await r.json(); done(true); return { ok:true, progress }; }catch(e){ done(false); return { ok:false }; } }
// The player's name stays on this device (TUN-93): what goes up is progress without it, and what comes down
// keeps this device's name — a copy saved before TUN-93 may still hold one, and it is never applied.
function cloudCopy(p){ const c=Object.assign({},p); delete c.name; return c; }
function keepLocalName(cloud){ const c=cloudCopy(cloud); c.name=progress.name||""; return c; }
let _pushSeq=0;   // counts progress saves queued or begun: a save's success says "saved" only if no newer one came since
async function cloudPush(onlyFor){ if(cloudSync!=="ready") return false;   // never over a cloud copy we haven't read
  _pushSeq++; const run=_cloudRun; const done=cloudCall(); const id=await freshId(onlyFor||_syncUser,_syncSub);
  if(run!==_cloudRun || cloudSync!=="ready") return false;   // signed out, or someone else signed in, while the token came
  if(id.mismatch){ loseSync(); return false; }   // another account in this one's place: this run may not write again
  const t=id.token; if(!t){ done(false); return false; }
  try{ const r=await fetch(AUTH.apiUrl+"/progress",{method:"PUT",headers:{Authorization:"Bearer "+t,"content-type":"application/json"},body:JSON.stringify(cloudCopy(progress))});
    done(r.ok); return r.ok; }catch(e){ done(false); return false; } }
let _pushT; function scheduleCloud(){ if(!cloudOn||cloudSync!=="ready") return; _pushSeq++; clearTimeout(_pushT); _pushT=setTimeout(()=>cloudPush(),900);
  if(_authSaysSaved && _authShowsSignedIn) renderAuth(); }   // newer progress is pending: "saved to cloud" no longer holds (TUN-87)
// ---- Cloud songs (SAVE-SHARE.md P3): store/share creations in DynamoDB via the /songs API ----
const signedIn = () => !!(userPool && userPool.getCurrentUser());
async function cloudSongCreate(song,title,visibility){ const done=cloudCall(); const t=await freshToken(); if(!t){ done(false); return null; }
  try{ const r=await fetch(AUTH.apiUrl+"/songs",{method:"POST",headers:{Authorization:"Bearer "+t,"content-type":"application/json"},
    body:JSON.stringify({song,title,visibility:visibility||"unlisted"})}); const res=r.ok?await r.json():null;
    const ok=isObj(res) && !!res.id; done(ok); return ok ? res : null; }catch(e){ done(false); return null; } }
// The API's own "no such song": a 404 whose body is {"error":"not found"} (backend/src/songs-api.mjs). A
// switched-off API answers 404 too, with API Gateway's body, so the status alone proves nothing (TUN-87).
async function songGone(r){ if(r.status!==404) return false; try{ const b=await r.json(); return !!b && b.error==="not found"; }catch(e){ return false; } }
const isObj=x=> !!x && typeof x==="object" && !Array.isArray(x);
// The song ({ id, song, … }) when it loads; null when the cloud says there is no such song; false when the cloud
// could not be asked or answered anything else — so only null may say the song may have been deleted (TUN-87).
async function cloudSongGet(id){ const done=cloudCall(); const t=await freshToken(); const headers=t?{Authorization:"Bearer "+t}:{};   // public read; token only needed for private/mine
  try{ const r=await fetch(AUTH.apiUrl+"/songs/"+encodeURIComponent(id),{headers});
    if(await songGone(r)){ done(true); return null; }
    if(!r.ok){ done(false); return false; }
    const res=await r.json(); const ok=isObj(res) && isObj(res.song); done(ok); return ok ? res : false; }catch(e){ done(false); return false; } }
// The signed-in player's cloud songs (an array, maybe empty), or null when they could not be listed (TUN-107,
// taken into TUN-87): Melodies must not say "Nothing here yet" over songs it simply could not reach.
async function cloudSongList(){ const done=cloudCall(); const t=await freshToken(); if(!t){ done(false); return null; }
  try{ const r=await fetch(AUTH.apiUrl+"/songs",{headers:{Authorization:"Bearer "+t}}); if(!r.ok){ done(false); return null; }
    const b=await r.json(); const ok=isObj(b) && Array.isArray(b.songs); done(ok); return ok ? b.songs : null; }catch(e){ done(false); return null; } }
// true when the song is gone: deleted now, or already gone (the API's own 404).
async function cloudSongDelete(id){ const done=cloudCall(); const t=await freshToken(); if(!t){ done(false); return false; }
  try{ const r=await fetch(AUTH.apiUrl+"/songs/"+encodeURIComponent(id),{method:"DELETE",headers:{Authorization:"Bearer "+t}});
    const gone=r.ok || await songGone(r); done(gone); return gone; }catch(e){ done(false); return false; } }
function applyProgress(){   // re-apply the progress object to the running game
  ensureInstruments();   // cloud progress may predate the gradual reveal — derive/refresh the unlocked set
  if(progress.settings){ if(progress.settings.voice) setVoice(progress.settings.voice); if(progress.settings.tempo) tempoEl.value=progress.settings.tempo;
    if(progress.settings.mix) mix=Object.assign({voice:1,band:1,drums:1}, progress.settings.mix); applyMix();
    if(progress.settings.click) clickMode=progress.settings.click;
    speakOn=progress.settings.speak!==false; renderSpeak(); }   // read-aloud ON by default (unless turned off)
  toolbox.length=0; toolboxOwner=null;   // force a per-scope toolbox reload on the renderLevel below
  restoreLastPackage();
  renderBag(); renderLevel(); updateTitle();     // renderLevel now syncs the region companion
  renderQuestHome(); }   // …and Home may still be open behind the pull: the card reads package completion
// uploadLocal=true on sign-UP (push guest progress up); false on sign-IN/reload (pull cloud down).
// A failed load (TUN-106) pushes nothing — not now, not on a later save — and the player plays on this device's
// progress; the next onSignedIn (the next page load or sign-in) tries the load again. Each call is a new run
// (_cloudRun): when an await returns into a run that sign-out or another sign-in has replaced, it does nothing.
// onlyFor / onlySub (the garden card, TUN-93): run only for that account, and push only with its token.
// Returns { signedIn, saved }. signedIn: this run had a usable session for its account and was not replaced (a
// failed load or save is still a sign-in; the panel says the cloud is resting). saved: the CURRENT progress is in
// the cloud — loaded from it, or pushed with no newer save since (the same test as "saved to cloud").
async function onSignedIn(uploadLocal,onlyFor,onlySub){ const NO={ signedIn:false, saved:false };
  if(onlyFor && !currentUserIs(onlyFor)) return NO;
  const who=currentUserName();   // this run's account: its pull, its pushes
  const run=++_cloudRun; cloudSync="off"; _syncUser=who; _syncSub=null; cloudResting=false; clearTimeout(_pushT);   // drop a save queued for whoever was here before
  const id=await freshId(who,onlySub); if(run!==_cloudRun) return NO;
  // No session: a sign-in form that asked stays as it is, its words in it, to say so and try again.
  if(!id.token){ cloudOn=false; if(_authShowsSignedIn) renderAuth(); return NO; }
  cloudOn=true; _syncSub=id.sub;
  if(!uploadLocal){ cloudSync="loading"; renderAuth();
    const pull=await cloudPull(who,_syncSub); if(run!==_cloudRun) return NO;
    if(pull.mismatch){ loseSync(); renderAuth(); return NO; }   // another account took this one's place mid-load
    const cloud=pull.ok ? pull.progress : undefined;
    if(cloud!==null && !loadableProgress(cloud)){ cloudSync="unreachable"; renderAuth(); return { signedIn:true, saved:false }; }   // only an explicit null means "nothing saved yet"
    cloudSync="ready";
    // the loaded level is where play resumes: its render reads the story, once, and waits for an instrument card that
    // is up (TUN-112: a further enterPlay() read it a second time, under the first, and over the card). Not while the
    // buddy picker is up: then picking a buddy (enterPlay) reads it — or, when the loaded save already has one and its
    // render closed the picker, play resumes here and enterPlay reads it now. The name is this device's (TUN-93).
    if(cloud){ progress=keepLocalName(cloud); Store.set("progress",progress);
      const pickerUp=()=>compoverlay.style.display==="flex";
      narrateReady=!pickerUp(); applyProgress(); if(!narrateReady && !pickerUp()) enterPlay();
      renderAuth("loaded from cloud"); return { signedIn:true, saved:true }; } }
  cloudSync="ready";   // a new account, or one with nothing saved yet: this device's progress becomes the cloud copy
  const push=_pushSeq+1; const ok=await cloudPush(who); if(run!==_cloudRun) return NO;
  // "saved to cloud" only for the newest progress save: once a newer one is queued or begun, this success no longer says
  // the current progress is in the cloud. A failure needs no word here: cloudResting already says so, calmly.
  if(cloudSync!=="ready") return NO;   // the push found another account in this one's place (loseSync)
  const saved=ok && _pushSeq===push;
  renderAuth(saved ? "saved to cloud" : undefined);
  return { signedIn:true, saved }; }
const authbox=document.getElementById("authbox");
function renderAuth(status){ if(!authbox) return; authbox.innerHTML=""; _authShowsSignedIn=false; _authSaysSaved=false;
  if(!cognitoReady()){ const d=document.createElement("div"); d.className="hint";
    d.textContent="Cloud sign-in unavailable right now — your progress is still saved on this device."; authbox.appendChild(d); return; }
  const u=userPool.getCurrentUser();
  if(u && cloudOn){ _authShowsSignedIn=true; _authSaysSaved=status==="saved to cloud"; const row=document.createElement("div"); row.className="authrow";
    row.appendChild(document.createTextNode("☁️ Signed in as ")); const b=document.createElement("b"); b.textContent=gardenDisplayName(u.getUsername());
    row.appendChild(b); row.appendChild(document.createTextNode(
      cloudSync==="ready" ? (cloudResting ? CLOUD_RESTING.save : " — progress syncs across your devices.")
      : cloudSync==="unreachable" ? CLOUD_RESTING.load
      : " — loading your progress…"));
    if(status){ const s=document.createElement("span"); s.className="hint"; s.textContent=" — "+status; row.appendChild(s); }
    authbox.appendChild(row); authbox.appendChild(mkBtn("Sign out",doSignOut)); return; }
  const hint=document.createElement("div"); hint.className="hint";
  hint.textContent="Playing as a guest (saved on this device). Make an account to sync across devices."; authbox.appendChild(hint);
  const row=document.createElement("div"); row.className="pkgactions";
  row.append(mkBtn("Create account",showGardenRoller), mkBtn("Sign in",showSignInForm));
  authbox.appendChild(row); }
// What a child is told when signing in, or making a garden, goes wrong (TUN-93): never Cognito's own words, which
// are not written for a child. The code goes to the console for whoever is helping.
const AUTH_SAYS={
  noMatch:"🌱 That garden name and those secret words don't match. Check your card: capitals and spaces don't matter.",
  tooMany:"🌱 Too many tries. Wait a few minutes, then try again.",
  offline:"☁️ Can't reach the garden just now. Your garden is still saved on this device.",
  other:"🌱 Something went wrong just now. Your garden is still saved on this device: try again in a moment.",
  empty:"Type your garden name and the four secret words from your card.",
};
const LOST_CARD="Without the card, that account can't be opened. On the device where you played, your garden may still be there: "+
  "open the game there and make a new account, and your progress goes up to the cloud again. Songs saved to the old account stay with it.";
const authCode=e=> String((e&&(e.code||e.name))||"");
// The library marks only some network failures NetworkError; others arrive as the browser's own fetch error.
const authOffline=e=> authCode(e)==="NetworkError" ||
  (!(e&&e.code) && /network|failed to fetch|load failed/i.test(String((e&&e.message)||"")));
// Cognito could not run the sign-up trigger: the cost switch has stopped it (TUN-87), or it failed, or it refused
// the sign-up. Cognito wraps a trigger's failure in its own words, never fit for a child, and the account was not
// made. The trigger's refusal past the day's limit (TUN-88) carries the token "daily-signup-limit" — Cognito's
// text is "PreSignUp failed with error daily-signup-limit." — and gets a message of its own; every other one says
// the garden isn't taking new accounts just now.
const SIGNUP_TRIGGER_CODES=["UnexpectedLambdaException","UserLambdaValidationException","InvalidLambdaResponseException"];
const signUpTriggerFailed=e=> !!e && (SIGNUP_TRIGGER_CODES.includes(e.code) || SIGNUP_TRIGGER_CODES.includes(e.name) || /PreSignUp/i.test(String(e.message||"")));
const signUpFullToday=e=> signUpTriggerFailed(e) && /\bdaily-signup-limit\b/.test(String(e.message||""));
const SIGNUP_FULL_TODAY="🌱 So many new gardeners joined today that the garden is full! Keep playing as a guest — your garden is saved on this device — and make your account tomorrow.";
// mode "up": making an account; "in": signing in.
function friendlyAuthError(e,mode){ const code=authCode(e);
  if(mode==="up" && signUpFullToday(e)) return SIGNUP_FULL_TODAY;
  if(mode==="up" && signUpTriggerFailed(e)) return CLOUD_RESTING.signUp;
  if(authOffline(e)) return AUTH_SAYS.offline;
  if(/^(LimitExceededException|TooManyRequestsException|TooManyFailedAttemptsException)$/.test(code) ||
     /attempts exceeded/i.test(String((e&&e.message)||""))) return AUTH_SAYS.tooMany;
  if(code==="NotAuthorizedException" || code==="UserNotFoundException") return AUTH_SAYS.noMatch;
  console.warn("Tune Garden: the sign-in service answered", code||"with no code");
  return AUTH_SAYS.other; }
// Signing in, from Home's form or the landing screen's: { ok:true } once signed in and the cloud copy is loaded,
// or { ok:false, msg } with words for a child. The boxes are forgiven as signInPair says.
// authBusy: how many sign-ins are out. While any is, its form can't be dismissed and Home can't be left (Close,
// the backdrop, a package, the Studio, a quest), so a sign-in the child thinks they left can never land in what
// they opened next. A count, so an older sign-in finishing can't unlock Home while a newer one is still out.
let authBusy=0;
async function signInWith(nameText,passText){
  const { username, password }=signInPair(nameText,passText);
  if(!username || !password) return { ok:false, msg:AUTH_SAYS.empty };
  // The Sign in click (or Enter) is the player's gesture, and the account's level plays its opening once (TUN-125).
  // Start the clock NOW, before the first await: a slow sign-in can outlast the click's activation, and a browser
  // that needs a recent one (WebKit) would then keep the clock frozen and the opening would be dropped.
  initAudio(); actx.resume();
  authBusy++;
  try{
    try{ await cogSignIn(username,password); }catch(e){ return { ok:false, msg:friendlyAuthError(e,"in") }; }
    // Not signed in: the session was gone or replaced before it could be used, so the form stays. A failed
    // progress load or save is still a sign-in (the panel says the cloud is resting), and the form goes.
    if(!(await onSignedIn(false)).signedIn) return { ok:false, msg:AUTH_SAYS.other };
    return { ok:true }; }
  catch(e){ console.warn("Tune Garden: signing in failed", e); return { ok:false, msg:AUTH_SAYS.other }; }
  finally{ authBusy--; } }
// The passphrase box, emptied and hidden again: on every way out of a sign-in form.
function clearPassBox(pass,showBtn){ pass.value=""; pass.type="password"; if(showBtn) showBtn.textContent="👁️ Show"; }
// The two boxes' settings, shared by Home's form and the landing screen's (index.html): no length limit (a pasted
// name with spaces must not be cut before it is forgiven), no capitals or spelling help, and a browser may offer
// to remember the passphrase (a choice the owner may overrule: reviews/TUN-93-garden-name-accounts.md).
function setUpSignInBoxes(user,pass,showBtn){
  for(const el of [user,pass]){ el.setAttribute("autocapitalize","none"); el.setAttribute("autocorrect","off"); el.spellcheck=false; }
  user.type="text"; user.autocomplete="username"; user.placeholder="Garden name, like Brave-Otter-42";
  pass.type="password"; pass.autocomplete="current-password"; pass.placeholder="Your four secret words";
  showBtn.textContent="👁️ Show"; showBtn.type="button";
  showBtn.onclick=()=>{ const shown=pass.type==="text"; pass.type=shown?"password":"text"; showBtn.textContent=shown?"👁️ Show":"🙈 Hide"; }; }
function lostCardLink(){ const wrap=document.createElement("div"); wrap.className="lostcard";
  const note=document.createElement("div"); note.className="hint"; note.style.display="none"; note.textContent=LOST_CARD;
  const btn=mkBtn("Lost your card?",()=>{ note.style.display=note.style.display==="none"?"":"none"; });
  wrap.append(btn,note); return wrap; }
function showSignInForm(){ authbox.innerHTML=""; _authShowsSignedIn=false;
  const form=document.createElement("div"); form.className="authform";
  const user=document.createElement("input"), pass=document.createElement("input"), show=document.createElement("button");
  show.className="secondary"; setUpSignInBoxes(user,pass,show);
  const passRow=document.createElement("div"); passRow.className="passrow"; passRow.append(pass,show);
  const msg=document.createElement("div"); msg.className="authmsg hint";
  let busy=false;
  const go=mkBtn("Sign in",async()=>{ if(busy) return; busy=true; go.disabled=cancel.disabled=true; msg.textContent="Signing in…";
    let r; try{ r=await signInWith(user.value,pass.value); } finally{ busy=false; go.disabled=cancel.disabled=false; }
    if(!r.ok){ msg.textContent=r.msg; return; }
    clearPassBox(pass,show); renderPkgs(); });
  pass.addEventListener("keydown",e=>{ if(e.key==="Enter") go.onclick(); });
  const cancel=mkBtn("Cancel",()=>{ if(busy) return; clearPassBox(pass,show); renderAuth(); });
  const actions=document.createElement("div"); actions.className="pkgactions"; actions.append(go,cancel);
  form.append(user,passRow,msg,actions,lostCardLink()); authbox.appendChild(form); user.focus(); }

