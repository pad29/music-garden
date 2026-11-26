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
let _authForm=null;   // the sign-in form the panel shows, if it shows one (TUN-128): only its own sign-in may redraw over it
let _authFormBusy=null;   // …and the form whose sign-in is out, while it is
// A sign-in form waiting for its answer holds the panel: reopening Home leaves it, its words and its message alone.
const signInFormBusy=()=> !!_authForm && _authForm===_authFormBusy;
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
// Who the shared storage says is signed in right now, read without the network (TUN-128): the stored user's name,
// and the name and sub in its cached ID token, expired or not; null when nobody is. A decision made after an await
// asks this — never getSession, which may refresh, and so describe a moment that has already passed.
function cachedAccount(){ const u=userPool&&userPool.getCurrentUser(); if(!u) return null;
  let p={}; try{ const jwt=u.storage && u.storage.getItem("CognitoIdentityServiceProvider."+AUTH.clientId+"."+u.getUsername()+".idToken");
    if(jwt) p=new AmazonCognitoIdentity.CognitoIdToken({ IdToken:jwt }).payload||{}; }catch(e){}
  return { name:String(u.getUsername()).toLowerCase(), tokenName:String(p["cognito:username"]||"").toLowerCase(), sub:p.sub||null }; }
// Is the shared session still this account, by name and by sub?
function accountIs(name,sub){ const c=cachedAccount(); return !!(c && name && sub && c.name===name && c.tokenName===name && c.sub===sub); }
// The account a sign-in authenticated (TUN-128): its ID token's name and sub, or null when either is missing.
function sessionAccount(s){ let p={}; try{ p=s.getIdToken().payload||{}; }catch(e){}
  const name=String(p["cognito:username"]||"").toLowerCase(), sub=p.sub;
  return name && sub ? { name, sub:String(sub) } : null; }
// { token, sub }; { mismatch:true } when the stored user or the token's own claims are not `name` / `sub`;
// { gone:true } when nobody is signed in — none was stored, or a refresh the service refused signed the browser out
// (the library clears it); {} when someone is but the session can't be refreshed now (offline: the cloud is
// resting, the account is not lost). Without name or sub, that part is not checked (the song calls).
function freshId(name,sub){ return new Promise(res=>{ const u=userPool&&userPool.getCurrentUser(); if(!u) return res({ gone:true });
  if(name && String(u.getUsername()).toLowerCase()!==name) return res({ mismatch:true });
  u.getSession((err,sess)=>{ if(err||!sess||!sess.isValid()){ const c=cachedAccount();
      // Can't refresh. Offline only while the cache still names this very account (an expired token names it as well as
      // a fresh one); nobody at all is gone; anything else — another sub, a token naming someone else or no one — is
      // not this account.
      return res(!c ? { gone:true } : !name || (c.name===name && c.tokenName===name && (!sub || c.sub===sub)) ? {} : { mismatch:true }); }
    const id=sess.getIdToken(), p=(id&&id.payload)||{};
    if(name && String(p["cognito:username"]||"").toLowerCase()!==name) return res({ mismatch:true });
    if(sub && p.sub!==sub) return res({ mismatch:true });
    res({ token:id.getJwtToken(), sub:p.sub||null }); }); }); }
function freshToken(name,sub){ return freshId(name,sub).then(r=>r.token||null); }
let _syncUser=null, _syncSub=null;   // the account this tab's sync belongs to; null when it belongs to none
const lostId=id=> !!(id.gone||id.mismatch);
// The account changed under this run, or left: no more writes, and the panel stops saying it syncs, until a sign-in
// reads again. It ends the run too, so every call of it still out does nothing when it returns (TUN-128).
function dropSync(){ _cloudRun++; cloudSync="off"; cloudOn=false; _syncUser=_syncSub=null; clearTimeout(_pushT); }
function loseSync(){ dropSync(); if(_authShowsSignedIn) renderAuth(); }
// { ok:true, progress } — progress is null when nothing is saved yet; { ok:false } when it could not be read
// (no token, 429, 5xx, a network error, a body that is not JSON). Never confuse the two: see onSignedIn, which also
// treats a 200 that is neither null nor loadable progress as a failed load. acct: the run's { run, name, sub }.
// { lost:true } when the account left or changed — at the lookup, or by the time the answer came (TUN-128): then
// nothing is reported, not even to the panel. { stale:true }: a newer run. After every await: the run, then the account.
async function cloudPull(acct){ const done=cloudCall(); const id=await freshId(acct.name,acct.sub);
  if(acct.run!==_cloudRun) return { stale:true };
  // Not this run's account — the token, or the offline answer, may still be its own while the cache now names another:
  // nothing is sent, and no outage is reported.
  if(lostId(id) || !accountIs(acct.name,acct.sub)) return { lost:true };
  const t=id.token; if(!t){ done(false); return { ok:false }; }   // signed in, but offline: the cloud is resting
  let r=null, ok=false, progress;
  try{ r=await fetch(AUTH.apiUrl+"/progress",{headers:{Authorization:"Bearer "+t}}); }catch(e){}
  if(acct.run!==_cloudRun) return { stale:true };
  if(!accountIs(acct.name,acct.sub)) return { lost:true };   // when the answer starts…
  if(r && r.ok){ try{ progress=await r.json(); ok=true; }catch(e){}
    if(acct.run!==_cloudRun) return { stale:true };
    if(!accountIs(acct.name,acct.sub)) return { lost:true }; }   // …and once its body is in
  done(ok); return ok ? { ok:true, progress } : { ok:false }; }
// The player's name stays on this device (TUN-93): what goes up is progress without it, and what comes down
// keeps this device's name — a copy saved before TUN-93 may still hold one, and it is never applied.
function cloudCopy(p){ const c=Object.assign({},p); delete c.name; return c; }
function keepLocalName(cloud){ const c=cloudCopy(cloud); c.name=progress.name||""; return c; }
let _pushSeq=0;   // counts progress saves queued or begun: a save's success says "saved" only if no newer one came since
// The run's account is taken once, at the start; after each await the run is checked first, then the account, and
// only then is anything reported — so a save never credits, or revokes, whoever came after it (TUN-128).
async function cloudPush(){ if(cloudSync!=="ready") return false;   // never over a cloud copy we haven't read
  _pushSeq++; const acct={ run:_cloudRun, name:_syncUser, sub:_syncSub }; const done=cloudCall(); const id=await freshId(acct.name,acct.sub);
  if(acct.run!==_cloudRun || cloudSync!=="ready") return false;   // signed out, or someone else signed in, in this tab
  // Another account in this one's place, or nobody — the token, or the offline answer, may still be this run's while
  // the cache names another: nothing is sent, no outage is reported, and this run may not write again.
  if(lostId(id) || !accountIs(acct.name,acct.sub)){ loseSync(); return false; }
  const t=id.token; if(!t){ done(false); return false; }   // signed in, but offline: the cloud is resting
  let ok=false;
  try{ const r=await fetch(AUTH.apiUrl+"/progress",{method:"PUT",headers:{Authorization:"Bearer "+t,"content-type":"application/json"},body:JSON.stringify(cloudCopy(progress))});
    ok=r.ok; }catch(e){}
  if(acct.run!==_cloudRun) return false;
  if(!accountIs(acct.name,acct.sub)){ loseSync(); return false; }   // whatever it did, it is not this account's to report now
  done(ok); return ok; }
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
    speakOn=progress.settings.speak!==false; renderSpeak(); }   // read-aloud ON by default (unless turned off)
  // A profile saved before the count-in has no click: that means the default, "off", as on a fresh page —
  // never the live mode a previous profile left behind (TUN-12). renderLevel's syncMeterUI shows it in #click.
  clickMode=clickModeFrom(progress.settings);
  toolbox.length=0; toolboxOwner=null;   // force a per-scope toolbox reload on the renderLevel below
  restoreLastPackage();
  renderBag(); renderLevel(); updateTitle();     // renderLevel now syncs the region companion
  renderQuestHome(); }   // …and Home may still be open behind the pull: the card reads package completion
// uploadLocal=true on sign-UP (push guest progress up); false on sign-IN/reload (pull cloud down).
// A failed load (TUN-106) pushes nothing — not now, not on a later save — and the player plays on this device's
// progress; the next onSignedIn (the next page load or sign-in) tries the load again. Each call is a new run
// (_cloudRun): when an await returns into a run that sign-out or another sign-in has replaced, it does nothing.
// onlyFor / onlySub: the account a sign-in authenticated (TUN-128: Home's and the landing's, from cogSignIn's own
// session; the garden card's, by its name and id) — the run is that account's, whoever the shared storage names
// meanwhile, and does nothing for any other. Without them (boot's resume), the stored account's.
// opts.form: a sign-in form waits for the outcome — Home's form element, or true for the landing's. The panel is not
// redrawn to "loading", so the form stays up, with its words, until the outcome is known; and no redraw here ever
// replaces a sign-in form that another sign-in put up (_authForm).
// Returns { signedIn, saved }. signedIn: this run had a usable session for its account and was not replaced (a
// failed load or save is still a sign-in; the panel says the cloud is resting). saved: the CURRENT progress is in
// the cloud — loaded from it, or pushed with no newer save since (the same test as "saved to cloud").
// The run still looking up, loading or saving (TUN-128) — a form's sign-in, boot's resume or the card's upload; 0 when
// none is. A sign-in that begins ends it there and then, so nothing it loads afterwards lands under the new sign-in.
let _syncRunOut=0;
async function onSignedIn(uploadLocal,onlyFor,onlySub,opts={}){
  const out=signedInRun(uploadLocal,onlyFor,onlySub,opts), run=_cloudRun;   // the run starts before its first await
  _syncRunOut=run;
  try{ return await out; } finally{ if(_syncRunOut===run) _syncRunOut=0; } }
async function signedInRun(uploadLocal,onlyFor,onlySub,opts){ const NO={ signedIn:false, saved:false };
  // A new run, before anything is checked: whatever this tab synced before stops here — its queued save dropped,
  // its right to write gone — so a sign-in that turns out not to work never leaves an older writer behind.
  const run=++_cloudRun; cloudSync="off"; cloudOn=false; _syncUser=_syncSub=null; cloudResting=false; clearTimeout(_pushT);
  const mayDraw=()=> !_authForm || _authForm===opts.form;
  // Not signed in: a sign-in form that asked stays as it is, its words in it, to say so and try again.
  const notIn=()=>{ if(_authShowsSignedIn && mayDraw()) renderAuth(); return NO; };
  // The run's account: the one the sign-in authenticated, or — boot's resume — the one the cache names, by name and sub.
  let who=onlyFor, sub=onlySub;
  if(!who){ const c=cachedAccount(); if(!c || !c.sub || c.tokenName!==c.name) return notIn(); who=c.name; sub=c.sub; }
  const id=await freshId(who,sub); if(run!==_cloudRun) return NO;
  if(!id.token || !id.sub || !accountIs(who,id.sub)) return notIn();
  sub=id.sub; _syncUser=who; _syncSub=sub; cloudOn=true;
  const owns=()=> run===_cloudRun && accountIs(who,sub);   // checked where a result is used, not only where it came
  // The outcome: drawn only while this run still holds the tab and its account. If the redraw itself finds the account
  // lost (renderAuth ends the run), there was no sign-in, and the form that asked is put back as it was, words and all.
  const finish=(status,result)=>{ if(!owns()){ loseSync(); return NO; }
    if(!mayDraw()) return result;
    const form=_authForm; renderAuth(status);
    if(run===_cloudRun) return result;
    if(form){ authbox.innerHTML=""; authbox.appendChild(form); _authForm=form; }
    return NO; };
  if(!uploadLocal){ cloudSync="loading"; if(!opts.form && mayDraw()) renderAuth();
    const pull=await cloudPull({ run, name:who, sub }); if(run!==_cloudRun) return NO;
    // The account left or changed, before the GET, while it was out, or since: its answer is not applied, stored, shown
    // or read aloud, and this run may not write (TUN-128) — all decided before TUN-112's block below.
    if(pull.lost || !owns()){ loseSync(); return NO; }
    const cloud=pull.ok ? pull.progress : undefined;
    if(cloud!==null && !loadableProgress(cloud)){ cloudSync="unreachable"; return finish(undefined,{ signedIn:true, saved:false }); }   // only an explicit null means "nothing saved yet"
    cloudSync="ready";
    // the loaded level is where play resumes: its render reads the story, once, and waits for an instrument card that
    // is up (TUN-112: a further enterPlay() read it a second time, under the first, and over the card). Not while the
    // buddy picker is up: then picking a buddy (enterPlay) reads it — or, when the loaded save already has one and its
    // render closed the picker, play resumes here and enterPlay reads it now. The name is this device's (TUN-93).
    if(cloud){ progress=keepLocalName(cloud); Store.set("progress",progress);
      const pickerUp=()=>compoverlay.style.display==="flex";
      narrateReady=!pickerUp(); applyProgress(); if(!narrateReady && !pickerUp()) enterPlay();
      return finish("loaded from cloud",{ signedIn:true, saved:true }); } }
  cloudSync="ready";   // a new account, or one with nothing saved yet: this device's progress becomes the cloud copy
  const push=_pushSeq+1; const ok=await cloudPush();
  if(run!==_cloudRun) return NO;   // replaced, or the push found another account, or nobody, in this one's place (loseSync)
  if(!owns()){ loseSync(); return NO; }
  // "saved to cloud" only for the newest progress save: once a newer one is queued or begun, this success no longer says
  // the current progress is in the cloud. A failure needs no word here: cloudResting already says so, calmly.
  const saved=ok && _pushSeq===push;
  return finish(saved ? "saved to cloud" : undefined,{ signedIn:true, saved }); }
const authbox=document.getElementById("authbox");
function renderAuth(status){ if(!authbox) return; authbox.innerHTML=""; _authShowsSignedIn=false; _authSaysSaved=false; _authForm=null;
  if(!cognitoReady()){ const d=document.createElement("div"); d.className="hint";
    d.textContent="Cloud sign-in unavailable right now — your progress is still saved on this device."; authbox.appendChild(d); return; }
  // This tab's sync is shown only while the shared session still names its account (TUN-128). One found gone or
  // replaced here ends, as a save would find it: the row never names another account, and nothing stays writable.
  if(cloudOn && !accountIs(_syncUser,_syncSub)) dropSync();
  if(cloudOn){ _authShowsSignedIn=true; _authSaysSaved=status==="saved to cloud"; const row=document.createElement("div"); row.className="authrow";
    row.appendChild(document.createTextNode("☁️ Signed in as ")); const b=document.createElement("b"); b.textContent=gardenDisplayName(_syncUser);
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
  replaced:"🌱 A newer sign-in took over. To open this garden instead, press Sign in again.",
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
// or { ok:false, msg } with words for a child. The boxes are forgiven as signInPair says. form: Home's form element
// (the landing passes none). The run is bound to the account cogSignIn authenticated (TUN-128), never to whoever
// the storage every tab shares names by the time sync starts.
// authBusy: how many sign-ins are out. While any is, its form can't be dismissed and Home can't be left (Close,
// the backdrop, a package, the Studio, a quest), so a sign-in the child thinks they left can never land in what
// they opened next. A count, so an older sign-in finishing can't unlock Home while a newer one is still out.
let authBusy=0;
// Sign-ins begun, in order (TUN-128): one that a newer one has followed never claims the tab, whichever finishes first.
let _signInSeq=0;
async function signInWith(nameText,passText,form){
  const { username, password }=signInPair(nameText,passText);
  if(!username || !password) return { ok:false, msg:AUTH_SAYS.empty };
  authBusy++; const mine=++_signInSeq;
  if(_syncRunOut && _syncRunOut===_cloudRun) dropSync();   // an older sign-in, or boot's resume, still out: this one replaces it now
  const replaced=()=> mine!==_signInSeq;   // a newer sign-in began meanwhile: it decides the tab's account
  try{
    let acct; try{ acct=sessionAccount(await cogSignIn(username,password)); }
    catch(e){ return { ok:false, msg:replaced() ? AUTH_SAYS.replaced : friendlyAuthError(e,"in") }; }
    if(replaced()) return { ok:false, msg:AUTH_SAYS.replaced };
    // Not signed in: the session named no account, or it was gone or replaced before it could be used, so the form
    // stays. A failed progress load or save is still a sign-in (the panel says the cloud is resting), and the form goes.
    if(!acct) return { ok:false, msg:AUTH_SAYS.other };
    const r=await onSignedIn(false,acct.name,acct.sub,{ form:form||true });
    if(replaced()) return { ok:false, msg:AUTH_SAYS.replaced };   // whatever this sign-in's sync did, the newer one decides
    if(!r.signedIn) return { ok:false, msg:AUTH_SAYS.other };
    return { ok:true }; }
  catch(e){ console.warn("Tune Garden: signing in failed", e); return { ok:false, msg:replaced() ? AUTH_SAYS.replaced : AUTH_SAYS.other }; }
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
  const go=mkBtn("Sign in",async()=>{ if(busy) return; busy=true; _authFormBusy=form; go.disabled=cancel.disabled=true; msg.textContent="Signing in…";
    let r; try{ r=await signInWith(user.value,pass.value,form); } finally{ busy=false; if(_authFormBusy===form) _authFormBusy=null; go.disabled=cancel.disabled=false; }
    if(!r.ok){ msg.textContent=r.msg; return; }
    clearPassBox(pass,show); renderPkgs(); });
  pass.addEventListener("keydown",e=>{ if(e.key==="Enter") go.onclick(); });
  const cancel=mkBtn("Cancel",()=>{ if(busy) return; clearPassBox(pass,show); renderAuth(); });
  const actions=document.createElement("div"); actions.className="pkgactions"; actions.append(go,cancel);
  form.append(user,passRow,msg,actions,lostCardLink()); authbox.appendChild(form); _authForm=form; user.focus(); }

