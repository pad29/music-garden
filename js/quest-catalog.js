// ---------- The sealed quest catalog ----------
// Quest definitions are DATA, never code: the level format is 247 chk closures and an authoring UI
// cannot emit JavaScript, so a player-facing Questmaker is only reachable if official quests travel
// the same declarative path from the start. Everything below is that path's front door.
//
// Loading is an inline JSON string parsed at boot. Not fetch — AGENTS.md forbids it for local assets
// and the game must survive being double-clicked; not a new folder — that would need adding to the
// cloudflare-build.sh copy or it goes missing silently in production.
const QUEST_TEXT_MAX=240, QUEST_JSON_MAX=262144, QUEST_DEPTH_MAX=12, QUEST_NODES_MAX=10000;
const QUEST_NUM_MAX=1000000000;
const QUEST_SLUG=/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const QUEST_PRIMITIVE_ID=/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;
const QUEST_DANGEROUS_KEY=new Set(["__proto__","prototype","constructor"]);
// Authored prose never becomes markup. The renderer must use textContent — this is the lexical belt
// beside that brace, not a substitute for it. levelTitle.innerHTML (see renderStage) is exactly the
// path a quest title would otherwise reach.
const QUEST_TEXT_BANNED=/[<>{}\\\u0000-\u001F\u007F\u202A-\u202E\u2066-\u2069]|javascript:|data:|file:|https?:|www\.|url\(|@import|\.\.?\//i;
const QUEST_ASSET_SUFFIX=/\.(?:mp3|wav|ogg|png|jpe?g|svg|webp|gif|css|js|json|html?)\b/i;

// The gate. JSON.parse output cannot carry a function, getter, symbol or cycle — but it CAN carry an
// own "__proto__" key, and it can be arbitrarily deep or large. The descriptor walk also means the
// same gate works unchanged when a future import hands it something that was not parsed.
function assertPlainJsonTree(root){
  let nodes=0;
  const walk=(v, depth, path)=>{
    if(++nodes>QUEST_NODES_MAX) throw new QuestLoadError("too-many-values", path);
    if(depth>QUEST_DEPTH_MAX) throw new QuestLoadError("too-deep", path);
    if(v===null || typeof v==="boolean") return;
    if(typeof v==="number"){
      if(!Number.isFinite(v)) throw new QuestLoadError("non-finite-number", path);
      if(Math.abs(v)>QUEST_NUM_MAX) throw new QuestLoadError("number-out-of-range", path);
      return; }
    if(typeof v==="string") return;
    if(typeof v!=="object") throw new QuestLoadError("not-plain-json", path);   // function, symbol, bigint, undefined
    const proto=Object.getPrototypeOf(v);
    if(Array.isArray(v)){
      if(proto!==Array.prototype) throw new QuestLoadError("bad-prototype", path);
      for(let i=0;i<v.length;i++){
        if(!Object.prototype.hasOwnProperty.call(v,i)) throw new QuestLoadError("array-hole", path+"["+i+"]");
        walk(v[i], depth+1, path+"["+i+"]"); }
      return; }
    if(proto!==Object.prototype && proto!==null) throw new QuestLoadError("bad-prototype", path);
    if(Object.getOwnPropertySymbols(v).length) throw new QuestLoadError("symbol-key", path);
    const descs=Object.getOwnPropertyDescriptors(v);
    for(const k of Object.keys(descs)){
      if(QUEST_DANGEROUS_KEY.has(k)) throw new QuestLoadError("dangerous-key", path+"."+k);
      const d=descs[k];
      if(d.get || d.set) throw new QuestLoadError("accessor", path+"."+k);   // never evaluated to find out
      walk(d.value, depth+1, path+"."+k); }
  };
  walk(root, 0, "$");
  return root;
}
function QuestLoadError(code, path){ this.code=code; this.path=path;
  this.message=code+" at "+path; }
QuestLoadError.prototype=Object.create(Error.prototype);
QuestLoadError.prototype.constructor=QuestLoadError;

// ---- the closed grammar, as a spec the checker walks: unknown keys reject for free ----
const QT={
  lit:(...vals)=>({k:"lit",vals}),
  text:(min,max)=>({k:"text",min,max:max||QUEST_TEXT_MAX}),
  slug:()=>({k:"slug"}),
  primitiveId:()=>({k:"primitiveId"}),
  int:(min,max)=>({k:"int",min,max}),
  arr:(of,min,max,unique)=>({k:"arr",of,min,max,unique:!!unique}),
  obj:(shape,optional)=>({k:"obj",shape,optional:optional||[]}),
  opaque:()=>({k:"opaque"}),         // analyzer params + witness songs: shape is D2's registry to judge
};
function questCheck(v, spec, path, errs){
  const bad=(code,extra)=>{ errs.push({code, path, extra}); return false; };
  switch(spec.k){
    case "lit": return spec.vals.includes(v) || bad("not-allowed-value", spec.vals.join("|"));
    case "text": {
      if(typeof v!=="string") return bad("not-text");
      const t=v.normalize("NFC");
      if(t.length<(spec.min||1) || t.length>spec.max) return bad("text-length");
      if(QUEST_TEXT_BANNED.test(t)) return bad("unsafe-text");
      if(QUEST_ASSET_SUFFIX.test(t)) return bad("asset-looking-text");
      return true; }
    case "slug": return (typeof v==="string" && v.length<=64 && QUEST_SLUG.test(v)) || bad("not-slug");
    case "primitiveId": return (typeof v==="string" && v.length<=64 && QUEST_PRIMITIVE_ID.test(v)) || bad("not-primitive-id");
    case "int": return (Number.isInteger(v) && v>=spec.min && v<=spec.max) || bad("int-range", spec.min+".."+spec.max);
    case "opaque": return true;
    case "arr": {
      if(!Array.isArray(v)) return bad("not-array");
      if(v.length<spec.min || v.length>spec.max) return bad("array-length", spec.min+".."+spec.max);
      let ok=true;
      v.forEach((item,i)=>{ if(!questCheck(item, spec.of, path+"["+i+"]", errs)) ok=false; });
      if(spec.unique && new Set(v.map(x=>typeof x==="string"?x:JSON.stringify(x))).size!==v.length) { bad("not-unique"); ok=false; }
      return ok; }
    case "obj": {
      if(!v || typeof v!=="object" || Array.isArray(v)) return bad("not-object");
      let ok=true;
      for(const key of Object.keys(v)) if(!(key in spec.shape)) { errs.push({code:"unknown-key", path:path+"."+key}); ok=false; }
      for(const key of Object.keys(spec.shape)){
        if(!(key in v)){ if(spec.optional.indexOf(key)<0){ errs.push({code:"missing-key", path:path+"."+key}); ok=false; } continue; }
        if(!questCheck(v[key], spec.shape[key], path+"."+key, errs)) ok=false; }
      return ok; }
  }
  return bad("unknown-spec");
}

const QUEST_OBSERVATION=QT.obj({ analyzerId:QT.primitiveId(), params:QT.opaque(), descriptorId:QT.slug() });
const QUEST_CHALLENGE=QT.obj({ id:QT.slug(), capabilityIds:QT.arr(QT.slug(),2,2,true),
  routes:QT.arr(QT.obj({ id:QT.slug(), observations:QT.arr(QUEST_OBSERVATION,1,2),
                         witnessIds:QT.arr(QT.slug(),1,8,true) }),2,4) });
const QUEST_PROCEDURE=QT.obj({ gateIds:QT.arr(QT.primitiveId(),1,4,true), transitionId:QT.slug(),
  buttonLabel:QT.text(1,60) }, ["buttonLabel"]);
const QUEST_PHASE_COMMON={ id:QT.slug(), name:QT.text(1,60), worldText:QT.text(1,240),
  intentionText:QT.text(1,160), procedure:QUEST_PROCEDURE };

// One shape, two versions. v2 adds the generated task; everything else is the same grammar, so the two
// cannot drift apart into a v1 that quietly permits something v2 forbids.
const QUEST_SHAPE_COMMON={
  id:QT.slug(),
  author:QT.obj({ kind:QT.lit("official","player"), id:QT.slug() }),
  kind:QT.lit("guided-commission"),
  title:QT.text(1,80),
  brief:QT.obj({ worldText:QT.text(1,240), intentionText:QT.text(1,160) }),
  prerequisites:QT.obj({ earnedByPackageIds:QT.arr(QT.slug(),1,8,true) }),
  capabilityIds:QT.arr(QT.slug(),2,2,true),
  workspace:QT.obj({ paletteId:QT.slug(), columns:QT.int(16,64), grooveId:QT.slug(),
    controlIds:QT.arr(QT.slug(),0,16,true),
    toolGrants:QT.arr(QT.obj({ toolId:QT.primitiveId(), capabilityId:QT.slug() }),0,16) }),
  phases:QT.arr(QT.opaque(),3,3),        // per-type shapes checked below, since they differ
  completion:QT.obj({ actionId:QT.slug(), payoffId:QT.slug(), label:QT.text(1,60),
    defaultTitle:QT.text(1,80), completionText:QT.text(1,240) }),
  presentation:QT.obj({ themeId:QT.slug(), regionId:QT.slug(),
    cardText:QT.text(1,60),        // the invitation, not the instruction: what the map card says
    estimateMinutes:QT.int(1,60), priority:QT.int(0,999) }),
  witnesses:QT.arr(QT.obj({ id:QT.slug(), phaseId:QT.slug(), currentVersionId:QT.lit("A","B"),
    // A witness for a generated task carries the instance it was proved under, so "this song matches
    // that route" is a claim about a task a child could actually be dealt.
    setup:QT.opaque(),
    songs:QT.obj({ A:QT.opaque(), B:QT.opaque() }, ["B"]) }, ["setup"]),2,24),
  // Who is on screen while the quest is played. Authored data, never derived from the prerequisite
  // packages: two capabilities can share a region and one can span several, so deriving it would put
  // the wrong friend in front of a child. Optional, because requiring it would change the v2 grammar
  // retroactively and the only honest way to do that is a version bump — which refuses every run in
  // progress for the sake of presentation. A quest with no cast simply has nobody on screen.
  cast:QT.arr(QT.obj({ regionId:QT.slug(), capabilityId:QT.slug() }),1,8),
  starterSong:QT.opaque(),
};
const QUEST_SCHEMA_V1=QT.obj(Object.assign({ v:QT.lit(1) }, QUEST_SHAPE_COMMON), ["starterSong","cast"]);
// `setup` is opaque to the grammar and checked against its KIND in questSemantics, exactly as
// `starterSong` is: only the registry knows what a waypoints rule is allowed to say.
const QUEST_SCHEMA_V2=QT.obj(Object.assign({ v:QT.lit(2), setup:QT.opaque() }, QUEST_SHAPE_COMMON),
  ["starterSong","setup","cast"]);

const QUEST_PHASE_SHAPES={
  compose:QT.obj(Object.assign({}, QUEST_PHASE_COMMON, { type:QT.lit("compose"),
    versionId:QT.lit("A"), challenge:QUEST_CHALLENGE })),
  transform:QT.obj(Object.assign({}, QUEST_PHASE_COMMON, { type:QT.lit("transform"),
    sourceVersionId:QT.lit("A"), versionId:QT.lit("B"), challenge:QUEST_CHALLENGE })),
  "compare-offer":QT.obj(Object.assign({}, QUEST_PHASE_COMMON, { type:QT.lit("compare-offer"),
    versionIds:QT.arr(QT.lit("A","B"),2,2,true),
    reflection:QT.obj({ promptText:QT.text(1,160),
      choices:QT.arr(QT.obj({ id:QT.lit("A","B"), label:QT.text(1,40) }),2,2) }) })),
};

// Version dispatch is an own-property lookup: an unknown version is REFUSED, never quietly treated as
// the newest one we happen to understand.
const QUEST_SCHEMA_VALIDATORS=Object.create(null);
const questSchemaValidator = shape => function(def, errs){
  if(!questCheck(def, shape, "$", errs)) return false;
  let ok=true;
  const order=["compose","transform","compare-offer"];
  def.phases.forEach((p,i)=>{
    const want=order[i];
    if(!p || p.type!==want){ errs.push({code:"phase-order", path:"$.phases["+i+"]", extra:want}); ok=false; return; }
    if(!questCheck(p, QUEST_PHASE_SHAPES[want], "$.phases["+i+"]", errs)) ok=false; });
  return ok;
};
QUEST_SCHEMA_VALIDATORS[1]=questSchemaValidator(QUEST_SCHEMA_V1);
QUEST_SCHEMA_VALIDATORS[2]=questSchemaValidator(QUEST_SCHEMA_V2);
// 3: a dealt task may include an opening drum fragment that readiness asks to be kept and carried on.
// The grammar is v2's; the version moves because what a dealt task MEANS moved, and runs made against
// v2 are refused by the definition-changed path rather than opened without the opening they lack.
const QUEST_SCHEMA_V3=QT.obj(Object.assign({ v:QT.lit(3), setup:QT.opaque() }, QUEST_SHAPE_COMMON),
  ["starterSong","setup","cast"]);
QUEST_SCHEMA_VALIDATORS[3]=questSchemaValidator(QUEST_SCHEMA_V3);

// Structural cross-references — ids that point at other parts of the SAME definition, plus packages and
// palettes. Everything that needs the engine registries (analyzers, descriptors, capabilities, gates)
// lives in questSemantics() below, which runs after this one.
function questCrossRefs(def, errs){
  let ok=true;
  const err=(code,path,extra)=>{ errs.push({code,path,extra}); ok=false; };
  for(const id of def.prerequisites.earnedByPackageIds){
    if(id==="studio" || !Object.prototype.hasOwnProperty.call(PACKAGES,id)) err("no-such-package","$.prerequisites",id);
    else if(PACKAGES[id].hidden) err("hidden-package","$.prerequisites",id); }
  if(!Object.prototype.hasOwnProperty.call(PALETTES,def.workspace.paletteId)) err("no-such-palette","$.workspace",def.workspace.paletteId);
  if(!Object.prototype.hasOwnProperty.call(QUEST_GROOVES,def.workspace.grooveId)) err("no-such-groove","$.workspace",def.workspace.grooveId);
  const phaseIds=new Set(), routeIds=new Set(), witnessIds=new Set();
  for(const w of def.witnesses){ if(witnessIds.has(w.id)) err("duplicate-witness","$.witnesses",w.id); witnessIds.add(w.id); }
  def.phases.forEach((p,i)=>{
    if(phaseIds.has(p.id)) err("duplicate-phase","$.phases["+i+"]",p.id);
    phaseIds.add(p.id);
    if(p.challenge){
      // Rule 4's shape, as far as D1 can see it: the challenge must claim exactly what the quest does.
      const a=[...def.capabilityIds].sort().join(","), b=[...p.challenge.capabilityIds].sort().join(",");
      if(a!==b) err("challenge-capabilities","$.phases["+i+"].challenge",b);
      for(const r of p.challenge.routes){
        if(routeIds.has(r.id)) err("duplicate-route","$.phases["+i+"]",r.id);
        routeIds.add(r.id);
        for(const wid of r.witnessIds){
          if(!witnessIds.has(wid)) err("no-such-witness","$.phases["+i+"].routes."+r.id,wid); } } }
    if(p.type==="compare-offer"){
      const ids=p.reflection.choices.map(c=>c.id).sort().join(",");
      if(ids!==[...p.versionIds].sort().join(",")) err("reflection-mismatch","$.phases["+i+"].reflection",ids); } });
  for(const w of def.witnesses) if(!phaseIds.has(w.phaseId)) err("no-such-phase","$.witnesses."+w.id,w.phaseId);
  return ok;
}


