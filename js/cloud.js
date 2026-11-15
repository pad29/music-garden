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
function cogSignUp(username,password,email){ return new Promise((res,rej)=>{
  const attrs=[]; if(email) attrs.push(new AmazonCognitoIdentity.CognitoUserAttribute({Name:"email",Value:email}));
  userPool.signUp(username,password,attrs,null,(err,r)=>err?rej(err):res(r)); }); }
function cogSignIn(username,password){ return new Promise((res,rej)=>{
  const u=new AmazonCognitoIdentity.CognitoUser({Username:username,Pool:userPool});
  const d=new AmazonCognitoIdentity.AuthenticationDetails({Username:username,Password:password});
  u.authenticateUser(d,{ onSuccess:s=>res(s), onFailure:e=>rej(e) }); }); }
function doSignOut(){ const u=userPool&&userPool.getCurrentUser(); if(u) u.signOut(); cloudOn=false; cloudSync="off"; clearTimeout(_pushT); renderAuth(); }
function freshToken(){ return new Promise(res=>{ const u=userPool&&userPool.getCurrentUser(); if(!u) return res(null);
  u.getSession((err,sess)=>res((err||!sess||!sess.isValid())?null:sess.getIdToken().getJwtToken())); }); }
// { ok:true, progress } — progress is null when nothing is saved yet; { ok:false } when it could not be read
// (no token, 429, 5xx, a network error, a body that is not JSON). Never confuse the two: see onSignedIn.
async function cloudPull(){ const t=await freshToken(); if(!t) return { ok:false };
  try{ const r=await fetch(AUTH.apiUrl+"/progress",{headers:{Authorization:"Bearer "+t}}); if(!r.ok) return { ok:false };
    return { ok:true, progress:await r.json() }; }catch(e){ return { ok:false }; } }
async function cloudPush(){ if(cloudSync!=="ready") return false;   // never over a cloud copy we haven't read
  const t=await freshToken(); if(!t) return false;
  try{ const r=await fetch(AUTH.apiUrl+"/progress",{method:"PUT",headers:{Authorization:"Bearer "+t,"content-type":"application/json"},body:JSON.stringify(progress)}); return r.ok; }catch(e){ return false; } }
let _pushT; function scheduleCloud(){ if(!cloudOn||cloudSync!=="ready") return; clearTimeout(_pushT); _pushT=setTimeout(()=>cloudPush(),900); }
// ---- Cloud songs (SAVE-SHARE.md P3): store/share creations in DynamoDB via the /songs API ----
const signedIn = () => !!(userPool && userPool.getCurrentUser());
async function cloudSongCreate(song,title,visibility){ const t=await freshToken(); if(!t) return null;
  try{ const r=await fetch(AUTH.apiUrl+"/songs",{method:"POST",headers:{Authorization:"Bearer "+t,"content-type":"application/json"},
    body:JSON.stringify({song,title,visibility:visibility||"unlisted"})}); return r.ok?await r.json():null; }catch(e){ return null; } }
async function cloudSongGet(id){ const t=await freshToken(); const headers=t?{Authorization:"Bearer "+t}:{};   // public read; token only needed for private/mine
  try{ const r=await fetch(AUTH.apiUrl+"/songs/"+encodeURIComponent(id),{headers}); return r.ok?await r.json():null; }catch(e){ return null; } }
async function cloudSongList(){ const t=await freshToken(); if(!t) return [];
  try{ const r=await fetch(AUTH.apiUrl+"/songs",{headers:{Authorization:"Bearer "+t}}); if(!r.ok) return []; return (await r.json()).songs||[]; }catch(e){ return []; } }
async function cloudSongDelete(id){ const t=await freshToken(); if(!t) return false;
  try{ const r=await fetch(AUTH.apiUrl+"/songs/"+encodeURIComponent(id),{method:"DELETE",headers:{Authorization:"Bearer "+t}}); return r.ok; }catch(e){ return false; } }
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
// A failed pull (TUN-106) pushes nothing — not now, not on a later save — and the player plays on this device's
// progress; the next onSignedIn (the next page load or sign-in) tries the pull again.
async function onSignedIn(uploadLocal){ cloudSync="off"; clearTimeout(_pushT);   // a save queued for whoever was here before
  const t=await freshToken(); if(!t){ cloudOn=false; renderAuth(); return; } cloudOn=true;
  if(!uploadLocal){ cloudSync="loading"; renderAuth();
    const pull=await cloudPull();
    if(!pull.ok){ cloudSync="unreachable"; renderAuth(); return; }
    cloudSync="ready"; const cloud=pull.progress;
    if(cloud && typeof cloud==="object" && cloud.packages){ progress=cloud; Store.set("progress",progress); applyProgress(); enterPlay(); renderAuth("loaded from cloud"); return; } }
  cloudSync="ready";   // a new account, or one with nothing saved yet: this device's progress becomes the cloud copy
  renderAuth((await cloudPush()) ? "saved to cloud" : "⚠️ cloud sync failed"); }
const authbox=document.getElementById("authbox");
function renderAuth(status){ if(!authbox) return; authbox.innerHTML="";
  if(!cognitoReady()){ const d=document.createElement("div"); d.className="hint";
    d.textContent="Cloud sign-in unavailable right now — your progress is still saved on this device."; authbox.appendChild(d); return; }
  const u=userPool.getCurrentUser();
  if(u && cloudOn){ const row=document.createElement("div"); row.className="authrow";
    row.appendChild(document.createTextNode("☁️ Signed in as ")); const b=document.createElement("b"); b.textContent=u.getUsername();
    row.appendChild(b); row.appendChild(document.createTextNode(
      cloudSync==="ready" ? " — progress syncs across your devices."
      : cloudSync==="unreachable" ? " — couldn't reach the cloud just now. Your cloud progress is safe; reload the page later to load it."
      : " — loading your progress…"));
    if(status){ const s=document.createElement("span"); s.className="hint"; s.textContent=" — "+status; row.appendChild(s); }
    authbox.appendChild(row); authbox.appendChild(mkBtn("Sign out",doSignOut)); return; }
  const hint=document.createElement("div"); hint.className="hint";
  hint.textContent="Playing as a guest (saved on this device). Make an account to sync across devices."; authbox.appendChild(hint);
  const row=document.createElement("div"); row.className="pkgactions";
  row.append(mkBtn("Create account",()=>showAuthForm("up")), mkBtn("Sign in",()=>showAuthForm("in")));
  authbox.appendChild(row); }
function showAuthForm(mode){ authbox.innerHTML="";
  const form=document.createElement("div"); form.className="authform";
  const user=document.createElement("input"); user.placeholder="Username"; user.maxLength=24;
  const pass=document.createElement("input"); pass.placeholder="Password (8+ characters)"; pass.type="password";
  form.append(user,pass);
  let email=null; if(mode==="up"){ email=document.createElement("input"); email.placeholder="Email (optional — for password recovery)"; email.type="email"; form.append(email); }
  const msg=document.createElement("div"); msg.className="authmsg hint";
  const go=mkBtn(mode==="up"?"Create account":"Sign in",()=>submitAuth(mode,user.value.trim(),pass.value,email?email.value.trim():"",msg));
  const cancel=mkBtn("Cancel",renderAuth);
  const actions=document.createElement("div"); actions.className="pkgactions"; actions.append(go,cancel);
  form.append(msg,actions); authbox.appendChild(form); user.focus(); }
async function submitAuth(mode,username,password,email,msg){
  if(!username||!password){ msg.textContent="Enter a username and password."; return; }
  msg.textContent="Working…";
  try{ if(mode==="up") await cogSignUp(username,password,email);
    await cogSignIn(username,password); await onSignedIn(mode==="up"); pname.value=progress.name||""; renderPkgs(); }
  catch(e){ msg.textContent="⚠️ "+((e&&e.message)||e); } }

