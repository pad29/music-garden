// ---------- What the engine knows how to look for ----------
// Quest data names primitives; this is where the primitives live. The split is the whole point of the
// declarative format: a definition may reference `pulse.even-walk`, but only engine code decides what
// an even walk IS. A Questmaker can therefore be given the registry as a palette without ever being
// given the power to define a new musical rule.

// The four shipped contour detectors and the three shipped steady pulses, as SETS rather than an
// invented "primary" label — one melody can legitimately be both a hover and an arc, and picking a
// winner between them would be an engine opinion the player never agreed to.
const QUEST_CONTOUR_FAMILIES=Object.freeze(["rise","fall","hover","arc"]);
const QUEST_PULSE_FAMILIES=Object.freeze(["main-beat-kicks","even-kick-walk","hat-shimmer"]);

// Is there anything here a player would actually HEAR? Counting note-list entries is not the same
// question: a v3 document may carry a note at column 16 of a 16-column song, which applySong drops and
// nobody ever hears. Two places used to answer this differently, so a version could hold the playback
// gate open while analysing as silent. Found by GPT's tester.
const songIsAudible = song => { const e=songEvidence(song); return e.valid===true && e.nonempty===true; };

// Pure. It NEVER calls applySong(): applySong rewrites the live document to inspect it, which would
// destroy the player's current work just to answer a question about a snapshot.
function songEvidence(song){
  const no=code=>({ valid:false, code });
  if(!song || typeof song!=="object" || song.v!==3) return no("not-v3");
  if(!Array.isArray(song.tracks)) return no("bad-tracks");
  const t=(song.time && typeof song.time==="object") ? song.time : {};
  // 256 is a resource bound at this seam — the projection allocates rows x span. It is the one limit
  // applySong does not share, because applySong never allocates anything this analysis has to.
  if(Number.isInteger(t.cols) && t.cols>256) return no("too-many-columns");
  // setPalette falls back to pentatonic for a missing or unknown id, and applySong widens any column
  // count to the editor's floor of 16. Refusing here what the game opens without complaint would judge
  // a song "empty" that a player just heard — so the fallbacks are copied, and REPORTED rather than
  // hidden, since authored content has no business relying on them.
  // ONE deliberate divergence from applySong: note length is ignored here. Every onset is one column,
  // because every question this evidence answers is about pitch and placement and no shipped analyzer
  // asks about duration. When one does, the projection has to carry duration and these two must be
  // reconciled — until then, questWorkspaceMismatch() is what holds authored songs to the real editor.
  const declared=typeof song.palette==="string" ? song.palette : null;
  const palId=(declared && Object.prototype.hasOwnProperty.call(PALETTES,declared)) ? declared : "pentatonic";
  const mel=song.tracks.find(x=>x&&x.kind==="melody"), dr=song.tracks.find(x=>x&&x.kind==="drums");
  const notes=mel?mel.notes:[], hits=dr?dr.hits:[];
  if(!Array.isArray(notes) || !Array.isArray(hits)) return no("bad-track-shape");
  if(notes.length>1024 || hits.length>1024) return no("too-many-events");
  // The SAME span applySong would use. A v3 document may declare cols:1 while carrying events out at
  // column 12; applySong widens it to the editor's 16-column floor and those events come back. Reading
  // the declared width instead would make evidence describe a song the player never sees — a rise over
  // clean main-beat kicks would analyse as no contour and no pulse at all.
  const span=Math.max(16, (Number.isInteger(t.cols) && t.cols>0) ? t.cols : 16), docNotes=[], docHits=[];
  // A malformed EVENT is a refusal, but an out-of-span one is dropped — exactly what applySong's own
  // filter does, so evidence sees the same song the editor would have loaded.
  for(const n of notes){
    if(!n || typeof n!=="object" || !Number.isInteger(n.p) || !Number.isInteger(n.c) || n.p<0 || n.p>127) return no("bad-note");
    if(n.c<0 || n.c>=span) continue;
    docNotes.push({ pitch:n.p, startTick:n.c*TICKS_PER_COL, durationTicks:TICKS_PER_COL, velocity:1 }); }
  for(const h of hits){
    if(!h || typeof h!=="object" || !Number.isInteger(h.lane) || !Number.isInteger(h.c) || h.lane<0 || h.lane>=DRUMS.length) return no("bad-hit");
    if(h.c<0 || h.c>=span) continue;
    docHits.push({ pitch:h.lane, startTick:h.c*TICKS_PER_COL, durationTicks:TICKS_PER_COL, velocity:1 }); }
  let projected;
  try{ projected=projectTracks([{role:"melody",notes:docNotes},{role:"drums",notes:docHits}], palId, span); }
  catch(e){ return no("projection-failed"); }
  const seq=contourSeqFromGrid(projected.grid, projected.rows, projected.span);
  const contourFamilies=[];
  if(isRising(seq))   contourFamilies.push("rise");
  if(isFalling(seq))  contourFamilies.push("fall");
  if(isHovering(seq)) contourFamilies.push("hover");
  if(isArch(seq))     contourFamilies.push("arc");
  const dg=projected.drumG, steadyPulseFamilies=[];
  // The SPAN, not 16: this evidence may describe a song wider than the editor's floor, and a pulse that
  // stops before the end of it is not the steady pulse the descriptor claims.
  if(pulseMainBeats(dg,span))  steadyPulseFamilies.push("main-beat-kicks");
  if(pulseEvenWalk(dg,span))   steadyPulseFamilies.push("even-kick-walk");
  if(pulseHatShimmer(dg,span)) steadyPulseFamilies.push("hat-shimmer");
  // Onsets are counted off the PROJECTION, not the note list: two notes that snap to one cell are one
  // thing the player hears, and every other analyzer reads the projection too.
  let melodyOnsetCount=0, drumOnsetCount=0;
  for(let r=0;r<projected.rows;r++) for(let c=0;c<span;c++) if(projected.grid[r][c]) melodyOnsetCount++;
  for(let d=0;d<dg.length;d++) for(let c=0;c<span;c++) if(dg[d][c]) drumOnsetCount++;
  // The main beats — every fourth column, the grid pulseMainBeats and setBeatGuide already use — and how
  // many of them the tune lands on. Distinct COLUMNS: two notes stacked on one beat are one beat landed on.
  let beatCount=0, melodyBeatsHit=0;
  for(let c=0;c<span;c+=4){ beatCount++;
    for(let r=0;r<projected.rows;r++) if(projected.grid[r][c]){ melodyBeatsHit++; break; } }
  return { valid:true, paletteId:palId, paletteFallback:palId!==declared, columns:span,
    nonempty:melodyOnsetCount>0||drumOnsetCount>0,
    melodyOnsetCount, drumOnsetCount, projected, contourFamilies, steadyPulseFamilies, beatCount, melodyBeatsHit };
}

// ---- parameter schemas: the engine owns implication, not the author ----
// There are no author-written "implies" declarations anywhere in the grammar. A definition that could
// assert its own two routes were different would make the alternatives check decorative.
const QP={ none:()=>({k:"none"}),
  enumSet:(field,values,min,max)=>({k:"enum-set",field,values,min,max}),
  snapshot:()=>({k:"snapshot"}),
  minimum:(field,min,max)=>({k:"minimum",field,min,max}) };

function questNormalizeParams(schema, params){
  const no=code=>({ ok:false, code });
  if(!params || typeof params!=="object" || Array.isArray(params)) return no("params-not-object");
  const keys=Object.keys(params);
  switch(schema.k){
    case "none":
      return keys.length ? no("params-unexpected") : { ok:true, value:Object.freeze({}) };
    case "enum-set": {
      if(keys.length!==1 || keys[0]!==schema.field) return no("params-shape");
      const v=params[schema.field];
      if(!Array.isArray(v) || v.length<schema.min || v.length>schema.max) return no("params-set-size");
      if(new Set(v).size!==v.length) return no("params-set-duplicate");
      for(const x of v) if(schema.values.indexOf(x)<0) return no("params-unknown-value");
      // sorted, so two authors who typed the same set in different orders produce the same canonical route
      return { ok:true, value:Object.freeze({ [schema.field]:Object.freeze([...v].sort()) }) }; }
    case "snapshot": {
      if(keys.length!==1 || keys[0]!=="snapshotVersionId") return no("params-shape");
      const v=params.snapshotVersionId;
      if(v!=="A" && v!=="B") return no("params-bad-version");
      return { ok:true, value:Object.freeze({ snapshotVersionId:v }) }; }
    case "minimum": {
      if(keys.length!==1 || keys[0]!==schema.field) return no("params-shape");
      const v=params[schema.field];
      if(!Number.isInteger(v) || v<schema.min || v>schema.max) return no("params-range");
      return { ok:true, value:Object.freeze({ [schema.field]:v }) }; }
  }
  return no("params-unknown-schema");
}

// The six relations. `unknown` is not a shrug — it REJECTS the definition when two analyzers meet in
// the same capability slot of competing routes, because a relation nobody declared is a relation the
// alternatives check cannot make.
const QREL={ EQ:"equivalent", LR:"left-implies-right", RL:"right-implies-left",
  DISJOINT:"disjoint", OVERLAP:"overlap", UNKNOWN:"unknown" };
const questFlipRel=r=> r===QREL.LR?QREL.RL : r===QREL.RL?QREL.LR : r;

function questRelateParams(schema, a, b){
  switch(schema.k){
    case "none": return QREL.EQ;
    case "snapshot": return a.snapshotVersionId===b.snapshotVersionId ? QREL.EQ : QREL.UNKNOWN;
    case "enum-set": {
      const A=new Set(a[schema.field]), B=new Set(b[schema.field]);
      const aInB=[...A].every(x=>B.has(x)), bInA=[...B].every(x=>A.has(x));
      if(aInB && bInA) return QREL.EQ;
      if(aInB) return QREL.LR;            // asking for LESS is the stronger demand: it implies the wider one
      if(bInA) return QREL.RL;
      return [...A].some(x=>B.has(x)) ? QREL.OVERLAP : QREL.DISJOINT; }
    case "minimum": {
      const x=a[schema.field], y=b[schema.field];
      // a higher floor is the stronger demand: "at least 8" implies "at least 4"
      return x===y ? QREL.EQ : (x>y ? QREL.LR : QREL.RL); }
  }
  return QREL.UNKNOWN;
}

// Cross-analyzer relations are ENGINE knowledge, declared once. Anything absent is `unknown`.
// Every registry below is looked up by an id that came out of a FILE. A plain object literal answers
// `registry["constructor"]` with a function off Object.prototype, so an authored id could name a kind,
// analyzer or descriptor that does not exist and still find something truthy — which surfaced as a parse
// failure rather than the refusal it should have been. Prototype-less, so a lookup can only find what
// was actually registered. Found by GPT's tester, on the setup kinds; it was true of all of them.
const questRegistry = obj => deepFreezeQuest(Object.assign(Object.create(null), obj));

const QUEST_CROSS_RELATIONS=questRegistry({
  "contour.same-family-as-snapshot|contour.differs-from-snapshot":QREL.DISJOINT,
  "pulse.same-steady-family-as-snapshot|pulse.differs-steady-family-from-snapshot":QREL.DISJOINT,
  // different lanes cannot both be the kick pattern, but a kick pattern and a hi-hat shimmer coexist
  "pulse.kick-on-main-beats|pulse.even-walk":QREL.DISJOINT,
  "pulse.kick-on-main-beats|pulse.hat-shimmer":QREL.OVERLAP,
  "pulse.even-walk|pulse.hat-shimmer":QREL.OVERLAP,
});

function questRelate(leftId, leftParams, rightId, rightParams){
  const L=QUEST_PRIMITIVES[leftId], R=QUEST_PRIMITIVES[rightId];
  if(!L || !R) return QREL.UNKNOWN;
  if(leftId===rightId) return questRelateParams(L.parameterSchema, leftParams, rightParams);
  const fwd=QUEST_CROSS_RELATIONS[leftId+"|"+rightId];
  if(fwd) return fwd;
  const rev=QUEST_CROSS_RELATIONS[rightId+"|"+leftId];
  return rev ? questFlipRel(rev) : QREL.UNKNOWN;
}

// ---- the primitives: musical analyzers and procedural gates in ONE id space ----
// One space, two kinds, because Q5 rule 6 says a procedural fact may never be dressed up as a musical
// one. Keeping them apart in separate maps would make that rule true by accident; keeping them together
// with a `kind` makes it a check that can actually fail.
// ---- what the engine is allowed to SAY ----
// Slot values are enum ids resolved to labels here, never authored strings: a definition cannot smuggle
// wording into a sentence the engine speaks. Descriptions come from the FACTS, not from which analyzer
// happened to ask — so a "differs from the snapshot" clause that did NOT match still says the lights
// kept their shape, which is what was true, rather than a negation of the question.
const QUEST_ENUM_LABELS=questRegistry({
  rise:"Rise", fall:"Fall", hover:"Hover", arc:"Arc",
  "main-beat-kicks":"main-beat kicks", "even-kick-walk":"even kick walk",
  "hat-shimmer":"hi-hat shimmer",
});
// Canonical order, not alphabetical accident: when a song lands on more than one family, the sentence
// has to name ONE of them, and it must name the same one every time it is rendered.
const questFirstOf=(order,set)=>{ for(const f of order) if(set.indexOf(f)>=0) return f; return null; };
const questTok=(id,slots)=>slots?{ id, slots }:{ id };

// The closed set of things each analyzer is able to report. Declared, not inferred: the receipt
// reducer refuses any token a phase's own analyzers could not have produced, and a test walks every
// family combination to prove describe() never leaves this list.
const QUEST_HEARD_CONTOUR=["heard-contour-rise","heard-contour-fall","heard-contour-hover",
  "heard-contour-arc","heard-contour-unnamed"];
const QUEST_HEARD_CONTOUR_PAIR=QUEST_HEARD_CONTOUR.concat(["heard-contour-kept","heard-contour-changed"]);
const QUEST_HEARD_PULSE=["heard-pulse-main-kicks","heard-pulse-even-kicks","heard-pulse-hat-shimmer",
  "heard-pulse-none","heard-pulse-unnamed"];
const QUEST_HEARD_PULSE_PAIR=QUEST_HEARD_PULSE.concat(["heard-pulse-kept","heard-pulse-changed"]);
const QUEST_HEARD_BEATS=["heard-tune-every-beat","heard-tune-some-beats","heard-tune-between-beats"];

const QUEST_CONTOUR_TOKEN={ rise:"heard-contour-rise", fall:"heard-contour-fall",
  hover:"heard-contour-hover", arc:"heard-contour-arc" };
const QUEST_PULSE_TOKEN={ "main-beat-kicks":"heard-pulse-main-kicks",
  "even-kick-walk":"heard-pulse-even-kicks", "hat-shimmer":"heard-pulse-hat-shimmer" };

const describeContour=fams=> fams.length ? fams.map(f=>questTok(QUEST_CONTOUR_TOKEN[f])) : [questTok("heard-contour-unnamed")];
// Silent drums and unnamed drums are different facts, so the describers are told how many hits there
// were. Callers that do not say fall back to "silent", which is what the old sentence assumed.
const questPulseUnnamed=onsets=>[questTok(onsets ? "heard-pulse-unnamed" : "heard-pulse-none")];
const describePulse  =(fams,onsets)=> fams.length ? fams.map(f=>questTok(QUEST_PULSE_TOKEN[f])) : questPulseUnnamed(onsets);
function describeContourPair(cur, snap){
  if(!cur.length) return [questTok("heard-contour-unnamed")];
  if(!snap.length) return describeContour(cur);                       // nothing named to compare against
  const shared=questFirstOf(QUEST_CONTOUR_FAMILIES, cur.filter(f=>snap.indexOf(f)>=0));
  if(shared) return [questTok("heard-contour-kept",{ contour:shared })];
  return [questTok("heard-contour-changed",{ oldContour:questFirstOf(QUEST_CONTOUR_FAMILIES,snap),
                                        newContour:questFirstOf(QUEST_CONTOUR_FAMILIES,cur) })];
}
function describePulsePair(cur, snap, onsets){
  if(!cur.length) return questPulseUnnamed(onsets);
  if(!snap.length) return describePulse(cur, onsets);
  const shared=questFirstOf(QUEST_PULSE_FAMILIES, cur.filter(f=>snap.indexOf(f)>=0));
  if(shared) return [questTok("heard-pulse-kept",{ pulse:shared })];
  return [questTok("heard-pulse-changed",{ oldPulse:questFirstOf(QUEST_PULSE_FAMILIES,snap),
                                      newPulse:questFirstOf(QUEST_PULSE_FAMILIES,cur) })];
}

// Where the tune's notes fell against the main beats. Exclusive, in this order: no tune says nothing at
// all, then every beat, some, none. Placement only — a tune between the beats can be perfectly in time.
function describeBeats(f){
  if(!f.onsets) return [];
  if(f.hit===f.beats) return [questTok("heard-tune-every-beat")];
  return [questTok(f.hit>0 ? "heard-tune-some-beats" : "heard-tune-between-beats")];
}

const questShare=(a,b)=>a.some(x=>b.indexOf(x)>=0);          // the two family sets intersect
const questBothNamed=(a,b)=>a.length>0 && b.length>0;        // both songs landed on a family we can name
const QUEST_PRIMITIVES=questRegistry({
  // --- musical: they read evidence and nothing else ---
  "contour.any-of":{ kind:"musical", capabilityId:"melodic-contour", subject:"current",
    requiredControlIds:[], allowedPhaseTypes:["compose"], parameterSchema:QP.enumSet("families",QUEST_CONTOUR_FAMILIES,1,4),
    allowedDescriptorIds:["way-contour-any"], heardDescriptorIds:QUEST_HEARD_CONTOUR,
    evaluate:(cur,snap,p)=>({ ok:questShare(cur.contourFamilies,p.families), facts:{ families:cur.contourFamilies } }),
    describe:f=>describeContour(f.families) },
  "contour.same-family-as-snapshot":{ kind:"musical", capabilityId:"melodic-contour", subject:"snapshot-pair",
    requiredControlIds:[], allowedPhaseTypes:["transform"], parameterSchema:QP.snapshot(),
    allowedDescriptorIds:["way-contour-kept"], heardDescriptorIds:QUEST_HEARD_CONTOUR_PAIR,
    evaluate:(cur,snap)=>({ ok:questBothNamed(cur.contourFamilies,snap.contourFamilies) && questShare(cur.contourFamilies,snap.contourFamilies),
      facts:{ families:cur.contourFamilies, snapshotFamilies:snap.contourFamilies } }),
    describe:f=>describeContourPair(f.families, f.snapshotFamilies) },
  "contour.differs-from-snapshot":{ kind:"musical", capabilityId:"melodic-contour", subject:"snapshot-pair",
    requiredControlIds:[], allowedPhaseTypes:["transform"], parameterSchema:QP.snapshot(),
    allowedDescriptorIds:["way-contour-changed"], heardDescriptorIds:QUEST_HEARD_CONTOUR_PAIR,
    evaluate:(cur,snap)=>({ ok:questBothNamed(cur.contourFamilies,snap.contourFamilies) && !questShare(cur.contourFamilies,snap.contourFamilies),
      facts:{ families:cur.contourFamilies, snapshotFamilies:snap.contourFamilies } }),
    describe:f=>describeContourPair(f.families, f.snapshotFamilies) },
  // Each reads its own NAMED family off the evidence. The even walk is eight kicks in lane 0; the
  // shimmer is lane 2. Conflating those two cost a design round, so they never share a code path.
  "pulse.kick-on-main-beats":{ kind:"musical", capabilityId:"steady-pulse", subject:"current",
    requiredControlIds:["drums"], allowedPhaseTypes:["compose"], parameterSchema:QP.none(),
    allowedDescriptorIds:["way-pulse-main-kicks"], heardDescriptorIds:QUEST_HEARD_PULSE,
    evaluate:cur=>({ ok:cur.steadyPulseFamilies.indexOf("main-beat-kicks")>=0, facts:{ families:cur.steadyPulseFamilies, drumOnsets:cur.drumOnsetCount } }),
    describe:f=>describePulse(f.families, f.drumOnsets) },
  "pulse.even-walk":{ kind:"musical", capabilityId:"steady-pulse", subject:"current",
    requiredControlIds:["drums"], allowedPhaseTypes:["compose"], parameterSchema:QP.none(),
    allowedDescriptorIds:["way-pulse-even-kicks"], heardDescriptorIds:QUEST_HEARD_PULSE,
    evaluate:cur=>({ ok:cur.steadyPulseFamilies.indexOf("even-kick-walk")>=0, facts:{ families:cur.steadyPulseFamilies, drumOnsets:cur.drumOnsetCount } }),
    describe:f=>describePulse(f.families, f.drumOnsets) },
  "pulse.hat-shimmer":{ kind:"musical", capabilityId:"steady-pulse", subject:"current",
    requiredControlIds:["drums"], allowedPhaseTypes:["compose"], parameterSchema:QP.none(),
    allowedDescriptorIds:["way-pulse-hat-shimmer"], heardDescriptorIds:QUEST_HEARD_PULSE,
    evaluate:cur=>({ ok:cur.steadyPulseFamilies.indexOf("hat-shimmer")>=0, facts:{ families:cur.steadyPulseFamilies, drumOnsets:cur.drumOnsetCount } }),
    describe:f=>describePulse(f.families, f.drumOnsets) },
  "pulse.same-steady-family-as-snapshot":{ kind:"musical", capabilityId:"steady-pulse", subject:"snapshot-pair",
    requiredControlIds:["drums"], allowedPhaseTypes:["transform"], parameterSchema:QP.snapshot(),
    allowedDescriptorIds:["way-pulse-kept"], heardDescriptorIds:QUEST_HEARD_PULSE_PAIR,
    evaluate:(cur,snap)=>({ ok:questBothNamed(cur.steadyPulseFamilies,snap.steadyPulseFamilies) && questShare(cur.steadyPulseFamilies,snap.steadyPulseFamilies),
      facts:{ families:cur.steadyPulseFamilies, snapshotFamilies:snap.steadyPulseFamilies,
             drumOnsets:cur.drumOnsetCount } }),
    describe:f=>describePulsePair(f.families, f.snapshotFamilies, f.drumOnsets) },
  "pulse.differs-steady-family-from-snapshot":{ kind:"musical", capabilityId:"steady-pulse", subject:"snapshot-pair",
    requiredControlIds:["drums"], allowedPhaseTypes:["transform"], parameterSchema:QP.snapshot(),
    allowedDescriptorIds:["way-pulse-changed"], heardDescriptorIds:QUEST_HEARD_PULSE_PAIR,
    evaluate:(cur,snap)=>({ ok:questBothNamed(cur.steadyPulseFamilies,snap.steadyPulseFamilies) && !questShare(cur.steadyPulseFamilies,snap.steadyPulseFamilies),
      facts:{ families:cur.steadyPulseFamilies, snapshotFamilies:snap.steadyPulseFamilies,
             drumOnsets:cur.drumOnsetCount } }),
    describe:f=>describePulsePair(f.families, f.snapshotFamilies, f.drumOnsets) },
  "phrase.minimum-onsets":{ kind:"musical", capabilityId:"melody-making", subject:"current",
    requiredControlIds:[], allowedPhaseTypes:["compose","transform"], parameterSchema:QP.minimum("minimum",1,64),
    allowedDescriptorIds:["way-enough-notes"], heardDescriptorIds:[],
    evaluate:(cur,snap,p)=>({ ok:cur.melodyOnsetCount>=p.minimum, facts:{ onsets:cur.melodyOnsetCount } }),
    // No heard-* descriptor ships for onset counting, so it contributes nothing to what the garden says.
    // An empty list is the honest answer; inventing wording here would be the engine editorialising.
    describe:()=>[] },
  // Footsteps' "On the Beat", asked of the whole song: a melody onset on EVERY main beat. A stone on a beat
  // counts — it is part of the tune — and notes between the beats neither help nor hurt, because readiness
  // asks for a note in every stretch and some stretches hold no beat at all.
  //   taughtByPackageIds — the capability is melody-making, earned by intro, but this IDEA is taught by
  //     footsteps; a definition whose prerequisites never taught it may not name it (A2).
  //   fieldGuide — the columns it is about glow on the field, as they did when footsteps taught it.
  //   reach — its own proof: given a song that completes the dealt task, add a note to each empty beat.
  "phrase.on-every-beat":{ kind:"musical", capabilityId:"melody-making", subject:"current",
    requiredControlIds:[], taughtByPackageIds:["footsteps"], fieldGuide:"beats",
    allowedPhaseTypes:["compose","transform"], parameterSchema:QP.none(),
    allowedDescriptorIds:["way-tune-on-beats"], heardDescriptorIds:QUEST_HEARD_BEATS,
    evaluate:cur=>({ ok:cur.melodyOnsetCount>0 && cur.melodyBeatsHit===cur.beatCount,
      facts:{ onsets:cur.melodyOnsetCount, beats:cur.beatCount, hit:cur.melodyBeatsHit } }),
    describe:f=>describeBeats(f),
    reach:(def, song)=>{ const ladder=PALETTES[def.workspace.paletteId].MIDI, p=ladder[Math.floor(ladder.length/2)];
      const notes=song.tracks[0].notes;
      for(let c=0;c<def.workspace.columns;c+=4) if(!notes.some(n=>n.c===c)) notes.push({ p, c, len:1 });
      return song; } },

  // --- procedural: they read the RUN, never the music, and are legal only in phase.procedure ---
  "playback.complete-since-last-edit":{ kind:"procedural",
    gate:(run,versionId)=>playbackCompleteSinceLastEdit(run,versionId) },
  "edit.after-fork":{ kind:"procedural",
    gate:(run,versionId)=>{ const v=run&&run.versions&&run.versions[versionId];
      return !!v && !!v.forkedFrom && v.editRev>0; } },
  "comparison.auditioned-both":{ kind:"procedural",
    gate:run=>{ const c=run&&run.comparison; if(!c) return false;
      return c.versionIds.every(id=>{ const v=run.versions[id];
        return !!v && v.editRev===c.revs[id] && v.auditionedRev===v.editRev; }); } },
  "comparison.chosen":{ kind:"procedural",
    // No separate "is there a selection" clause: indexOf refuses a missing one anyway, and a guard
    // that can never be the one to fire makes the check behind it impossible to test. Since picking a
    // path is what records an audition, a comparison cannot exist without a selection in any case.
    gate:run=>{ const c=run&&run.comparison; if(!c) return false;
      if(c.versionIds.indexOf(run.selection)<0) return false;
      return c.versionIds.every(id=>{ const v=run.versions[id]; return !!v && v.editRev===c.revs[id]; }); } },
});

// Who says a sentence, worked out from the registry rather than stored on it. Every musical primitive
// already declares the heard descriptors it may emit, so a descriptor id ALREADY determines the
// capability that produced it. Deriving it means no new field on a persisted token, no migration for
// the observations already on disk, and no way for a wrong value to be carried in from storage.
//
// A descriptor claimed by TWO capabilities belongs to neither: it falls to the garden's own voice
// rather than being handed to whichever primitive happened to be declared first. Nothing ships in that
// state, and a test pins it — this index is load-bearing for attribution now, so the disjointness it
// rests on is an invariant rather than something you could check by reading.
const QUEST_DESCRIPTOR_CAPABILITY=(()=>{
  const owner=Object.create(null);
  for(const id of Object.keys(QUEST_PRIMITIVES)){
    const p=QUEST_PRIMITIVES[id];
    if(p.kind!=="musical" || !p.capabilityId) continue;
    for(const d of (p.heardDescriptorIds||[])){
      if(!Object.prototype.hasOwnProperty.call(owner,d)) owner[d]=p.capabilityId;
      else if(owner[d]!==p.capabilityId) owner[d]=null; } }
  return Object.freeze(owner);
})();
// The one contested-descriptor report, so the invariant above can be asserted rather than assumed.
const questDescriptorConflicts = () => Object.keys(QUEST_DESCRIPTOR_CAPABILITY)
  .filter(d=>QUEST_DESCRIPTOR_CAPABILITY[d]===null);

// GROOVES is an array whose indices are song state forever, so a definition names a FEEL and the
// engine resolves it. Unknown ids are a catalog error rather than a silent fall back to index 0: a
// quest that asked for a shuffle and got a straight eighth would teach the wrong thing.
const QUEST_GROOVES=questRegistry({ straight:0 });

const QUEST_CAPABILITIES=questRegistry({
  "melodic-contour":{ earnedByPackageIds:["follow-the-fireflies"] },
  "steady-pulse":{ earnedByPackageIds:["footsteps"] },
  "melody-making":{ earnedByPackageIds:["intro"] },
});

// ---- what a definition's remaining ids resolve to ----
// Every id a definition writes must name something the engine can look up. An id that resolved to
// NOTHING was a promise the validator could not keep: a definition naming an invented transition, an
// invented tool and a control it never opened published with zero catalog errors, opened, and dead
// ended on its first button. Official content passed only because a human happened to write the right
// words — which is a quieter form of the privileged trust the whole format exists to remove.

// The controls a workspace may open. Only what renderLevel() and scopeFeatures() actually honour is
// listed: the pitch grid, the transport, undo and the voice picker are the floor EVERY scope gets, and
// naming them as grants would be a definition taking credit for what it did not give.
const QUEST_CONTROLS=questRegistry({
  drums:{ opens:"the drum bed" },
  // The ＋/－ beside the cursor INSERT AND REMOVE TIME, sliding every note and beat sideways. D7 closed
  // the ids that resolved to nothing and missed these two entirely: they were gated by nothing at all,
  // so every quest has always granted time surgery it never declared. A quest whose task is pinned to
  // columns cannot afford that quietly.
  room: { opens:"the ＋/－ room controls at the cursor" },
  loop: { opens:"looping, on from the first bar" },   // renderLevel sets `looping`; the button is always there
  jam:  { opens:"the band and the groove picker" },
  fuse: { opens:"the toolbox and Fuse" },
  more: { opens:"the More menu" },
  grow: { opens:"grow and trim" },
});

// Q10's Quest Tray. Nothing is grantable in this build, and an EMPTY registry is the honest way to say
// so: a definition listing a tool grant is refused, rather than opening a quest whose promised stamp
// never arrives. Adding the first grantable stamp is an entry here, not a change to the grammar.
const QUEST_TOOLS=questRegistry({});

// What a phase's button does BESIDES moving the phase on. The id dispatches — there is no switch on a
// phase number anywhere — and each entry names the one phase type it may end, so a definition cannot
// fork from a comparison or offer from a compose.
const QUEST_TRANSITIONS=questRegistry({
  "fork-version":{ phaseType:"compose", ops:(def,run,at)=>{
    const p=def.phases[run.phase], next=def.phases[run.phase+1];
    if(!next || !next.versionId) return null;                 // a fork with nowhere to fork TO
    const v=run.versions[p.versionId]; if(!v) return null;
    return [{ type:"forkFrom", sourceVersionId:p.versionId, sourceRev:v.editRev,
              newVersionId:next.versionId, at }]; } },
  "advance":{ phaseType:"transform", ops:()=>[] },
  // Offering is not a phase move: the offer action finalises the run, so there is nowhere to advance to.
  "offer":{ phaseType:"compare-offer", ops:null },
});

// The completion action names the transition that ENDS the quest; the payoff names what finalisation
// writes. Both are looked up rather than assumed, so an invented one is a catalog error instead of a
// button that quietly does nothing.
const QUEST_COMPLETION_ACTIONS=questRegistry({ "offer-song":{ transitionId:"offer" } });
const QUEST_PAYOFFS=questRegistry({ "saved-song":{ finalize:run=>questArtifactUpsert(run) } });

// A theme is the quest's face on the Home card. ONE token, not two: an icon id beside a theme id was a
// second name for the same look, and only one of them was ever read.
const QUEST_THEMES=questRegistry({
  "night-meadow":{ icon:"✨" },
  "deep-woods":  { icon:"🌲" },
});

// ---- generated tasks ----
// The first quest data that is not fixed when the quest is written. The definition declares a bounded
// RULE; the run stores the concrete INSTANCE it was dealt and never regenerates it; the evaluator takes
// that instance as an argument and stays pure. A closed registry, not a context bag: a kind declares the
// shape of its rule, how to deal an instance, how to check one, what the field opens with, and which
// controls it cannot survive.
//
// `room` is the control it cannot survive: the ＋/－ beside the cursor insert and remove TIME, sliding
// every note sideways, and a task pinned to columns would quietly stop matching the music.

// Deterministic from a seed string, so a run resumes onto the same field forever and a test can ask for
// the same deal twice. mulberry32 over a cheap string hash — this decides where seeds land, not anything
// anyone could lose money on.
function questRng(seed){
  let h=2166136261>>>0;
  for(let i=0;i<seed.length;i++){ h^=seed.charCodeAt(i); h=Math.imul(h,16777619)>>>0; }
  return ()=>{ h=(h+0x6D2B79F5)>>>0; let t=h;
    t=Math.imul(t^(t>>>15), t|1); t^=t+Math.imul(t^(t>>>7), t|61);
    return ((t^(t>>>14))>>>0)/4294967296; };
}

// 2: slack is shared with the stretch after the last landmark, so that landmark stops always landing
// on the upper bound. Stored instances are authoritative and never regenerated, so runs dealt under 1
// keep the hand they were given.
const QUEST_SETUP_GENERATOR_VERSION=2;

// An opening drum fragment lives in the first two beats and nowhere else. The grammar bounds a hit's
// column by this, which is what makes "short" an engine guarantee rather than an authoring habit — the
// owner's condition for the whole idea was that there are still many ways to go on from it.
const QUEST_FRAGMENT_SPAN=4;
// The plainest pattern of each named heartbeat, across a given width. Used only to PROVE that a dealt
// opening leaves a heartbeat reachable, by building one and reading it back through songEvidence —
// never to judge a player's drums, which are read by the detectors themselves.
const QUEST_PULSE_CANON=Object.freeze({
  "main-beat-kicks": w=>{ const h=[]; for(let c=0;c<w;c+=4) h.push({ lane:0, c }); return h; },
  "even-kick-walk":  w=>{ const h=[]; for(let c=0;c<w;c+=2) h.push({ lane:0, c }); return h; },
  "hat-shimmer":     w=>{ const h=[]; for(let c=0;c<w;c+=2) h.push({ lane:2, c }); return h; },
});

const QUEST_SETUP_KINDS=questRegistry({
  waypoints:{
    // The authored rule. Bounds are the engine's, so an author cannot ask for landmarks that leave no
    // room to compose between them.
    parameterSchema:QT.obj({ kind:QT.lit("waypoints"), count:QT.int(2,5), minGap:QT.int(2,8),
      edgeMargin:QT.int(1,8), rowMargin:QT.int(0,4),
      // A floor as well as a ceiling. Without one the dealer could put every stone on the same row —
      // legal, dull, and less to connect. rowMargin keeps the band off the top and bottom of the
      // ladder so there is somewhere to go in both directions.
      minRowSpread:QT.int(0,4), maxRowSpread:QT.int(0,4),
      // Optional: a pool of short authored drum openings, one dealt per run. Authored rather than
      // generated, because a random scatter of hits is not a rhythmic idea — and a generated kick off
      // the main-beat grid silently makes "a clean kick on every main beat" impossible for the run.
      fragments:QT.arr(QT.arr(QT.obj({ lane:QT.int(0,2), c:QT.int(0,QUEST_FRAGMENT_SPAN-1) }),2,3),1,12) },
      ["fragments"]),
    forbidsControlIds:["room"],
    // What the grammar cannot say about a pool. A fragment needs two onset COLUMNS, not two hits —
    // kick, snare and hat on one column is a single composite attack, not an opening (found by GPT's
    // review). And no fragment may close a route the quest declares, proved over the whole pool.
    checkRule(rule, def){
      const out=[];
      (rule.fragments||[]).forEach((frag,i)=>{
        const keys=frag.map(h=>h.lane+":"+h.c);
        if(new Set(keys).size!==keys.length) out.push({ code:"fragment-duplicate-hit", extra:i });
        if(new Set(frag.map(h=>h.c)).size<2) out.push({ code:"fragment-one-attack", extra:i }); });
      if(out.length) return out;
      for(const b of questFragmentBlocks(def, rule))
        out.push({ code:"fragment-blocks-route", extra:b.index+":"+b.routeId+":"+b.analyzerId });
      return out;
    },

    // ONE piece of arithmetic, used by the dealer and by the feasibility check, so the two can never
    // disagree about what fits. `lo`/`hi` keep a free column at each edge; `step` is the author's gap
    // but never less than two, because a gap of one leaves nowhere to compose between the landmarks.
    // Dealing evenly and hoping was the first version, and it dealt hands its own validator refused.
    bounds(rule, def){
      const span=def.workspace.columns;
      const lo=Math.max(rule.edgeMargin, 1), hi=span-1-Math.max(rule.edgeMargin, 1);
      const step=Math.max(rule.minGap, 2), slack=(hi-lo)-(rule.count-1)*step;
      return slack<0 ? null : { lo, hi, step, slack };
    },
    // The rows the band may occupy, once the margins are taken off both ends.
    rowBounds(rule, def){
      const rows=PALETTES[def.workspace.paletteId].MIDI.length;
      const lo=rule.rowMargin, hi=rows-1-rule.rowMargin;
      return (hi-lo)<rule.maxRowSpread || rule.minRowSpread>rule.maxRowSpread ? null : { lo, hi };
    },
    feasible(rule, def){ const K=QUEST_SETUP_KINDS.waypoints;
      return !!K.bounds(rule, def) && !!K.rowBounds(rule, def); },

    // Deal one. Every region — before the first landmark, between each pair, after the last — gets at
    // least one free column, and the SPARE width is scattered across ALL of them.
    //
    // It used to be scattered across the lead-in and the gaps only, with no share for the stretch after
    // the last landmark — so every column of slack was spent before it and the final landmark landed on
    // the upper bound in EVERY deal. Measured: 4000 hands of the shipped rule put the third stone on
    // column 13 four thousand times. Its ROW still varied, so the deal was never identical — but the last
    // stretch was always the narrowest the rule allows. Found by GPT reading the arithmetic.
    generate(rule, def, rng){
      const b=QUEST_SETUP_KINDS.waypoints.bounds(rule, def);
      if(!b) return { kind:"waypoints", generatorVersion:QUEST_SETUP_GENERATOR_VERSION, waypoints:[] };
      // count+1 buckets: one per gap AND one for the trailing stretch, whose share is simply left
      // unspent, which is what lets the last landmark fall short of the bound.
      const extra=new Array(rule.count+1).fill(0);
      for(let i=0;i<b.slack;i++) extra[Math.floor(rng()*(rule.count+1))]++;
      const cols=[]; let col=b.lo+extra[0]; cols.push(col);
      for(let i=1;i<rule.count;i++){ col+=b.step+extra[i]; cols.push(col); }
      // Rows inside one narrow band. The band is what keeps every contour family reachable: a player can
      // always leave a band, and can never shrink one.
      const rb=QUEST_SETUP_KINDS.waypoints.rowBounds(rule, def);
      const room=rb.hi-rb.lo;
      const spread=Math.min(rule.minRowSpread+Math.floor(rng()*(rule.maxRowSpread-rule.minRowSpread+1)), room);
      const base=rb.lo+Math.floor(rng()*(room-spread+1));
      const rowsPick=cols.map(()=>base+Math.floor(rng()*(spread+1)));
      // …and two of them are pinned to the ends of the band, so the spread the rule asked for is the
      // spread the player is actually handed rather than one the dice merely allowed.
      const pinLo=Math.floor(rng()*rule.count);
      let pinHi=Math.floor(rng()*rule.count); if(pinHi===pinLo) pinHi=(pinLo+1)%rule.count;
      rowsPick[pinLo]=base; rowsPick[pinHi]=base+spread;
      const waypoints=cols.map((col,i)=>({ row:rowsPick[i], col }));
      const inst={ kind:"waypoints", generatorVersion:QUEST_SETUP_GENERATOR_VERSION, waypoints };
      // The opening is drawn after every melodic draw, so adding a pool never moves anyone's stones.
      if(rule.fragments){ const i=Math.floor(rng()*rule.fragments.length);
        inst.fragment={ index:i, hits:rule.fragments[i].map(h=>({ lane:h.lane, c:h.c })) }; }
      return inst;
    },

    // Geometry. Checked for a generated instance, an authored witness instance and a hydrated run alike,
    // because a run that came back off disk is no more trustworthy than one that arrived in a file.
    validateInstance(inst, rule, def){
      if(!inst || inst.kind!=="waypoints" || !Array.isArray(inst.waypoints)) return "not-waypoints";
      const w=inst.waypoints, span=def.workspace.columns;
      const rows=PALETTES[def.workspace.paletteId].MIDI.length;
      if(w.length!==rule.count) return "wrong-count";
      let prev=-1;
      for(const p of w){
        if(!p || !Number.isInteger(p.row) || !Number.isInteger(p.col)) return "bad-waypoint";
        if(p.row<0 || p.row>=rows) return "row-off-ladder";
        if(p.col<=prev) return "columns-not-ascending";
        prev=p.col; }
      if(w[0].col<rule.edgeMargin) return "no-room-before";
      if(w[w.length-1].col>span-1-rule.edgeMargin) return "no-room-after";
      for(let i=1;i<w.length;i++) if(w[i].col-w[i-1].col<rule.minGap) return "gap-too-narrow";
      const rs=w.map(p=>p.row);
      const spread=Math.max(...rs)-Math.min(...rs);
      if(spread>rule.maxRowSpread) return "row-spread-too-wide";
      if(spread<rule.minRowSpread) return "row-spread-too-narrow";
      if(Math.min(...rs)<rule.rowMargin || Math.max(...rs)>rows-1-rule.rowMargin) return "row-off-band";
      // Byte for byte. The catalog proves the pool it was given; a hydrated run carrying any other
      // opening would be carrying one nothing ever checked.
      if(rule.fragments){
        const f=inst.fragment;
        if(!f || !Number.isInteger(f.index) || f.index<0 || f.index>=rule.fragments.length) return "bad-fragment";
        const want=rule.fragments[f.index];
        if(!Array.isArray(f.hits) || f.hits.length!==want.length
          || want.some((h,i)=>!f.hits[i] || f.hits[i].lane!==h.lane || f.hits[i].c!==h.c)) return "fragment-mismatch";
      } else if(inst.fragment!==undefined) return "unexpected-fragment";
      return null;
    },

    // The four-region division the task is about: before the first landmark, between each pair, after
    // the last. Columns only — what fills them is the player's business.
    regions(inst, def){
      const w=inst.waypoints, span=def.workspace.columns, out=[];
      out.push({ from:0, to:w[0].col-1 });
      for(let i=1;i<w.length;i++) out.push({ from:w[i-1].col+1, to:w[i].col-1 });
      out.push({ from:w[w.length-1].col+1, to:span-1 });
      return out;
    },

    // What the field opens with: the landmarks, and nothing else.
    startingSong(def, inst){
      const song=emptyQuestSong(def);
      const ladder=PALETTES[def.workspace.paletteId].MIDI;
      song.tracks[0].notes=inst.waypoints.map(p=>({ p:ladder[p.row], c:p.col, len:1 }));
      if(inst.fragment) song.tracks[1].hits=inst.fragment.hits.map(h=>({ lane:h.lane, c:h.c }));
      return song;
    },
  },
});

// Obligation two of three, and it is deliberately not obligation three. Geometry says the instance is
// LEGAL; this says the task it sets is COMPLETABLE — there is a song, buildable in the declared
// workspace, that keeps every landmark and puts something of the player's own in every region. Whether
// each advertised ROUTE stays reachable under the instance is a third question, and answering the second
// does not answer it; that check arrives with readiness, which is what defines a completing song.
function questSetupCompletion(def, inst){
  const kind=QUEST_SETUP_KINDS[inst && inst.kind];
  if(!kind) return null;
  const song=kind.startingSong(def, inst);
  const ladder=PALETTES[def.workspace.paletteId].MIDI;
  const row=inst.waypoints[0].row;
  for(const r of kind.regions(inst, def)){
    if(r.to<r.from) return null;                       // a region with nowhere to put anything
    song.tracks[0].notes.push({ p:ladder[row], c:Math.floor((r.from+r.to)/2), len:1 }); }
  for(let c=0;c<def.workspace.columns;c+=4)
    if(!song.tracks[1].hits.some(h=>h.lane===0 && h.c===c)) song.tracks[1].hits.push({ lane:0, c });
  return song;
}
// The contour families a player can still reach once the landmarks are fixed. Built by CONSTRUCTION —
// each strategy fills the regions and the answer is whatever songEvidence then reports, so a family is
// only claimed when a real song produced it. Row 0 is the top of the ladder, so a rise means falling
// row indices.
function questSetupReachableFamilies(def, inst){
  const K=QUEST_SETUP_KINDS[inst && inst.kind];
  if(!K || !K.regions) return [];
  const ladder=PALETTES[def.workspace.paletteId].MIDI, bottom=ladder.length-1;
  const mid=Math.round(bottom/2), clamp=r=>Math.max(0, Math.min(bottom, Math.round(r)));
  const regions=K.regions(inst, def).filter(r=>r.to>=r.from);
  if(!regions.length) return [];
  const slots=[]; for(const r of regions) for(let c=r.from;c<=r.to;c++) slots.push(c);
  // Row 0 is the TOP of the ladder, so a rise is a falling row index. `t` runs 0..1 along the path.
  const shapes={
    rise:  t=> bottom-t*bottom,
    fall:  t=> t*bottom,
    hover: ()=> mid,
    arc:   t=> t<0.5 ? bottom-(t/0.5)*bottom : ((t-0.5)/0.5)*bottom,
  };
  const found=[];
  const attempt=picks=>{
    const song=K.startingSong(def, inst);
    for(const [row,c] of picks) song.tracks[0].notes.push({ p:ladder[row], c, len:1 });
    const ev=songEvidence(song);
    if(ev.valid) for(const f of ev.contourFamilies) if(found.indexOf(f)<0) found.push(f); };
  const along=(list,f)=>list.map((x,i)=>[clamp(f(list.length<2 ? 0 : i/(list.length-1))), x]);
  for(const name of Object.keys(shapes)){
    // DENSE: a note in every free column. The stones sit at fixed heights and interrupt the shape, and
    // one note per region left too few steps of the player's own to outweigh them — a rise the player
    // could plainly make read as no rise at all, and the hand was refused for it.
    attempt(along(slots, shapes[name]));
    // SPARSE: one note per region, which still finds shapes a dense fill smooths away.
    attempt(along(regions, shapes[name]).map(([row,r])=>[row, Math.floor((r.from+r.to)/2)]));
  }
  return found;
}

// A hand that leaves a route unreachable is a hand that advertises a way nobody can take. Two distinct
// families must also stay open, because the transform phase asks a player to keep one shape or change
// it and cannot do either if only one is available.
function questSetupRoutesReachable(def, inst){
  const reach=questSetupReachableFamilies(def, inst);
  if(reach.length<2) return "one-contour-family-only";
  for(const p of def.phases){
    if(!p.challenge) continue;
    for(const r of p.challenge.routes) for(const o of r.observations){
      const prim=QUEST_PRIMITIVES[o.analyzerId];
      if(!prim || prim.subject!=="current") continue;
      if(prim.reach){ if(questProveReach(def, inst, prim, o)) return "route-unreachable:"+r.id; continue; }
      const sch=prim.parameterSchema;
      if(!sch || sch.k!=="enum-set" || sch.values!==QUEST_CONTOUR_FAMILIES) continue;
      const want=(o.params && o.params[sch.field]) || [];
      if(!want.some(f=>reach.indexOf(f)>=0)) return "route-unreachable:"+r.id; } }
  return null;
}

// A primitive's own construction, held to everything a player's song is held to: the workspace, the
// readiness of the dealt task, and the REAL analyzer. Scoped to the primitive that supplies it — one
// construction is a proof for the clause it was written for, not a search for every melody clause.
function questProveReach(def, inst, prim, obs){
  const base=questSetupCompletion(def, inst);
  if(!base) return "no-completion";
  const song=prim.reach(def, base);
  if(questWorkspaceMismatch(song, def)) return "workspace";
  const ev=songEvidence(song);
  if(!ev.valid) return "invalid";
  const rd=QUEST_READINESS[inst.kind];
  if(rd && rd.missing(def, inst, ev).length) return "not-ready";
  const np=questNormalizeParams(prim.parameterSchema, obs.params);
  if(!np.ok) return "params";
  return prim.evaluate(ev, null, np.value).ok ? null : "analyzer";
}

function questSetupCompletable(def, inst){
  const song=questSetupCompletion(def, inst);
  if(!song) return "region-has-no-room";
  const ev=songEvidence(song);
  if(!ev.valid) return "completion-invalid:"+ev.code;
  const m=questWorkspaceMismatch(song, def);
  if(m) return "completion-unreachable:"+m;
  // …and it actually COMPLETES the task, which until now was only true by construction and checked by
  // nothing. GPT's probe: replace questSetupCompletion with a function returning an empty legal song and
  // this still reported success, because every check above asks whether the song is a legal song in
  // this workspace rather than whether it finishes the crossing. The readiness rule is the same one the
  // player is held to, asked of the engine's own answer.
  const rd=QUEST_READINESS[def.setup && def.setup.kind];
  if(rd){ const missing=rd.missing(def, inst, ev);
    if(missing.length) return "completion-incomplete:"+missing[0].code; }
  return null;
}

// Descriptors return TEXT, never markup. The braces are slots the shell fills from analyzer facts, and
// they are engine strings — they never pass through the authored-text guard, which bans braces exactly
// so that no authored string can pretend to be one of these.
const QUEST_DESCRIPTORS=questRegistry({
  "way-contour-any":{ kind:"way", text:"a Rise, Fall, Hover, or Arc path" },
  "way-pulse-main-kicks":{ kind:"way", text:"a clean kick on every main beat" },
  "way-pulse-even-kicks":{ kind:"way", text:"an even kick walk, all the way across" },
  "way-pulse-hat-shimmer":{ kind:"way", text:"a steady hi-hat shimmer, all the way across" },
  "way-contour-changed":{ kind:"way", text:"a different recognized shape" },
  "way-contour-kept":{ kind:"way", text:"the same recognized shape" },
  "way-pulse-kept":{ kind:"way", text:"the same steady heartbeat" },
  "way-pulse-changed":{ kind:"way", text:"a different steady heartbeat" },
  "way-enough-notes":{ kind:"way", text:"enough notes to make a phrase" },
  "way-tune-on-beats":{ kind:"way", text:"a tune that lands on every beat" },
  // What is still missing from a dealt task. A third kind, because these are neither a way through nor
  // something the garden heard — they are the task itself, unfinished. Every quest shows them, so they
  // use no quest's own nouns (path, crossing, walk) and say what to fix in plain words: notes, beat,
  // drum hits, and the ringed stones every task line already names.
  "missing-landmark":{ kind:"missing", text:"One of the ringed stones is missing." },
  "missing-region":{ kind:"missing", text:"One stretch of the field has none of your notes in it." },
  "missing-beat":{ kind:"missing", text:"There is no beat yet." },
  "missing-fragment":{ kind:"missing", text:"One of the opening drum hits is missing." },
  "missing-beat-continues":{ kind:"missing", text:"The beat stops at its opening." },
  "heard-contour-rise":{ kind:"heard", text:"The notes climbed." },
  "heard-contour-fall":{ kind:"heard", text:"The notes came down." },
  "heard-contour-hover":{ kind:"heard", text:"The notes hovered." },
  "heard-contour-arc":{ kind:"heard", text:"The notes arched over and came back." },
  "heard-contour-unnamed":{ kind:"heard", text:"The notes made a shape the garden has not named yet." },
  "heard-pulse-main-kicks":{ kind:"heard", text:"The drum stepped on every main beat." },
  "heard-pulse-even-kicks":{ kind:"heard", text:"The drum walked evenly, all the way across." },
  "heard-pulse-hat-shimmer":{ kind:"heard", text:"The hi-hat kept a steady shimmer." },
  "heard-pulse-none":{ kind:"heard", text:"The drums were silent." },
  "heard-pulse-unnamed":{ kind:"heard", text:"The drums played a pattern the garden has no name for." },
  "heard-tune-every-beat":{ kind:"heard", text:"The tune landed on every beat." },
  "heard-tune-some-beats":{ kind:"heard", text:"The tune landed on some of the beats." },
  "heard-tune-between-beats":{ kind:"heard", text:"The tune landed between the beats." },
  "heard-contour-changed":{ kind:"heard", text:"The shape changed from {oldContour} to {newContour}.", slots:["oldContour","newContour"] },
  "heard-contour-kept":{ kind:"heard", text:"The notes kept their {contour} shape.", slots:["contour"] },
  "heard-pulse-changed":{ kind:"heard", text:"The drums changed from {oldPulse} to {newPulse}.", slots:["oldPulse","newPulse"] },
  "heard-pulse-kept":{ kind:"heard", text:"The drums kept their {pulse}.", slots:["pulse"] },
});

// ---- readiness: has the player engaged with the task they were set? ----
// Neither a musical route nor a procedural gate, and deliberately not smuggled into either: a route
// describes an optional way through, a gate reads the run, and this reads the SONG against the task the
// run was dealt. Bound to the setup kind, never to a quest id — a phase with no dealt task has no
// readiness, which is why it cannot quietly become "the Firefly's two checks, applied to everything".
//
// It answers with at most one sentence per kind of thing, not a tally. Four region ticks and a drum
// light would be the checklist Q5 rule 7 forbids, wearing different clothes.
const QUEST_READINESS=questRegistry({
  waypoints:{
    missing(def, inst, ev){
      const out=[], K=QUEST_SETUP_KINDS.waypoints, g=ev.projected.grid, rows=ev.projected.rows;
      const lit=(row,col)=> !!(g[row] && g[row][col]);
      if(inst.waypoints.some(p=>!lit(p.row,p.col)))
        out.push({ code:"landmark-gone", descriptorId:"missing-landmark" });
      const empty=K.regions(inst, def).some(r=>{
        for(let c=r.from;c<=r.to;c++) for(let row=0;row<rows;row++) if(lit(row,c)) return false;
        return true; });
      if(empty) out.push({ code:"region-empty", descriptorId:"missing-region" });
      // With an opening dealt, the bed can never be empty while it is kept, so "no beat" would be a
      // check that cannot fail — it is not asked then. A rule with no pool keeps it exactly as before.
      if(inst.fragment) for(const m of questDrumMissing(inst.fragment, ev)) out.push(m);
      else if(ev.drumOnsetCount===0) out.push({ code:"no-beat", descriptorId:"missing-beat" });
      return out;
    },
  },
});

// The drum half of a dealt task: the opening is still there, and something follows it. ANYWHERE after
// it, in any lane — not "near the end". A final-quarter rule was drafted and withdrawn on review: it
// added nothing for any recognised heartbeat (every one already fills the last quarter) and fell
// entirely on the patterns it could not name, refusing a groove with a deliberate rest at the end while
// accepting one hat on the last column. This is a floor for engagement, and says so; whether the beat
// was DEVELOPED is for a playtest to observe, not for another positional proxy to guess.
function questDrumMissing(frag, ev){
  const dg=ev.projected.drumG, out=[];
  const on=(l,c)=>!!(dg[l] && dg[l][c]);
  if(frag.hits.some(h=>!on(h.lane,h.c))) out.push({ code:"fragment-gone", descriptorId:"missing-fragment" });
  let goes=false;
  for(let l=0;l<dg.length && !goes;l++) for(let c=QUEST_FRAGMENT_SPAN;c<ev.columns;c++) if(on(l,c)){ goes=true; break; }
  if(!goes) out.push({ code:"beat-stops", descriptorId:"missing-beat-continues" });
  return out;
}

// The proof that no opening in a pool closes a declared route. For each fragment, build its union with
// the plainest pattern of every named heartbeat, keep only the songs that satisfy the drum readiness
// they would be held to, and EXECUTE every drum-reading observation in every route against them — the
// real analyzer, on real evidence; for a snapshot pair, against every ordered pair. Exhaustive, because
// the pool is finite. It is complete for the detectors as they are: the walk and the shimmer require
// hits and tolerate extras, so the plain pattern supplies whatever they need; the clean main beat
// forbids other kicks, so a fragment that breaks it cannot be repaired by adding anything.
// It proves the detectors can still be satisfied. It does not prove an opening is musically open.
function questFragmentProbes(def, frag){
  return QUEST_PULSE_FAMILIES.map(f=>{
    const song=emptyQuestSong(def), hits=frag.map(h=>({ lane:h.lane, c:h.c }));
    for(const h of QUEST_PULSE_CANON[f](def.workspace.columns))
      if(!hits.some(x=>x.lane===h.lane && x.c===h.c)) hits.push(h);
    song.tracks[1].hits=hits;
    return song; });
}
function questFragmentBlocks(def, rule){
  const out=[];
  (rule.fragments||[]).forEach((frag,index)=>{
    const evs=questFragmentProbes(def, frag).map(songEvidence)
      .filter(ev=>ev.valid && !questDrumMissing({ hits:frag }, ev).length);
    for(const p of def.phases) if(p.challenge) for(const r of p.challenge.routes) for(const o of r.observations){
      const prim=QUEST_PRIMITIVES[o.analyzerId];
      if(!prim || prim.kind!=="musical" || (prim.requiredControlIds||[]).indexOf("drums")<0) continue;
      const np=questNormalizeParams(prim.parameterSchema, o.params);
      if(!np.ok) continue;                                   // a bad parameter is reported by its own rule
      const reachable = prim.subject==="snapshot-pair"
        ? evs.some(b=>evs.some(a=>prim.evaluate(b, a, np.value).ok===true))
        : evs.some(c=>prim.evaluate(c, null, np.value).ok===true);
      if(!reachable) out.push({ index, routeId:r.id, analyzerId:o.analyzerId }); } });
  return out;
}

// Pure, and empty for a quest that deals no task. A version whose song evidence will not even parse is
// reported as unfinished rather than thrown about: the shell has to say something either way.
function questReadinessMissing(def, run, versionId){
  if(!def || def.setup===undefined || !run || !run.setup) return [];
  const rd=QUEST_READINESS[def.setup.kind];
  const v=run.versions && run.versions[versionId];
  if(!rd || !v || !v.song) return [];
  const ev=songEvidence(v.song);
  if(!ev.valid) return [{ code:"song-invalid", descriptorId:"missing-region" }];
  return rd.missing(def, run.setup, ev);
}

// ---- the friends, and what they heard ----
// Pure. The cast comes from the definition, the sentences from tokens already rendered, and the growth
// stages arrive as an argument — the same shape questEligibility uses for progress, so nothing here
// reads live state.
//
// A friend with nothing attributed to it SAYS NOTHING. It gets no "still listening for…" line, and
// that is deliberate: the comparison phase records no observations at all, one shipped analyzer
// describes nothing by design, and "heard-pulse-none" already reads "The drums have not caught one of
// the steady heartbeats yet" — so a listening line would have put a "not yet" in a friend's mouth in
// three separate reachable states, including while they dance at the end. They describe; they never
// assess. Nothing here can branch on whether a route matched, because no route information is passed.
function questCastVoices(def, tokens, stages){
  if(!def || !Array.isArray(def.cast)) return [];
  const out=[];
  for(const c of def.cast){
    const reg=Object.prototype.hasOwnProperty.call(REGIONS,c.regionId) ? REGIONS[c.regionId] : null;
    const friend=reg && reg.friend;
    if(!friend) continue;               // the catalog refuses this; the shell does not draw a blank
    const want=(stages && Number.isInteger(stages[c.regionId])) ? stages[c.regionId] : 0;
    const stage=Math.max(0, Math.min(friend.stages.length-1, want));
    out.push({ capabilityId:c.capabilityId, regionId:c.regionId, name:friend.name,
      emoji:friend.stages[stage], stage,
      lines:(tokens||[]).filter(t=>QUEST_DESCRIPTOR_CAPABILITY[t.descriptorId]===c.capabilityId)
                        .map(t=>t.text) }); }
  return out;
}
// What is left for the garden's own voice: a fact no speaker claims — including every sentence saved
// before there was a cast to claim it.
function questNarratorTokens(def, tokens){
  const spoken=new Set(((def && def.cast) || []).map(c=>c.capabilityId));
  return (tokens||[]).filter(t=>!spoken.has(QUEST_DESCRIPTOR_CAPABILITY[t.descriptorId]));
}

// ---- evaluating one observation against a pair of songs ----
// The context is TWO evidences and which one is "current", so the same code judges a witness at load
// time and a player's real A/B at play time. Nothing here reads live state.
function questEvaluateObservation(obs, ctx){
  const a=QUEST_PRIMITIVES[obs.analyzerId];
  if(!a || a.kind!=="musical") return { ok:false, code:"no-such-analyzer" };
  const p=questNormalizeParams(a.parameterSchema, obs.params);
  if(!p.ok) return { ok:false, code:p.code };
  const cur=ctx.byVersion[ctx.currentVersionId];
  if(!cur || !cur.valid) return { ok:false, code:"no-current-evidence" };
  let snap=null;
  if(a.subject==="snapshot-pair"){
    snap=ctx.byVersion[p.value.snapshotVersionId];
    if(!snap || !snap.valid) return { ok:false, code:"no-snapshot-evidence" }; }
  const r=a.evaluate(cur, snap, p.value);
  return { ok:r.ok===true, facts:r.facts };
}
const questRouteMatches=(route, ctx)=>route.observations.every(o=>questEvaluateObservation(o, ctx).ok);

// Satisfiability is not reachability. A witness proves a route CAN be matched; this proves the song
// that matches it is one a child could build in the workspace the definition opens. A witness leaning
// on drums the quest withholds, or on a pitch the palette cannot place, proves nothing about the quest
// as played — the route would be provably reachable and unreachable at the same time.
// Called only for songs songEvidence() has already accepted, so the shapes below are known good.
function questWorkspaceMismatch(song, def){
  const t=(song.time && typeof song.time==="object") ? song.time : {};
  if(song.palette!==def.workspace.paletteId) return "palette:"+song.palette;
  if(t.cols!==def.workspace.columns) return "columns:"+t.cols;
  if(t.groove!==QUEST_GROOVES[def.workspace.grooveId]) return "groove:"+t.groove;
  const mel=song.tracks.find(x=>x&&x.kind==="melody"), dr=song.tracks.find(x=>x&&x.kind==="drums");
  const ladder=new Set(PALETTES[def.workspace.paletteId].MIDI);
  const canGrow=def.workspace.controlIds.indexOf("grow")>=0;
  for(const n of (mel?mel.notes:[])){
    if(!ladder.has(n.p)) return "pitch:"+n.p;
    // Duration. songEvidence IGNORES note length — no shipped analyzer asks about it — but applySong
    // does not: it loads `(n.len||1)` straight onto the field. So a witness holding a long note in a
    // workspace with no grow/trim is claiming a song the child could not have built, and a length that
    // is not a positive integer reaches the field as a NaN duration. Neither is a completion bypass
    // today; both are the workspace equivalence this function exists to assert. Found by GPT's tester.
    // MAX_VINE and the column bound are the editor's OWN ceiling, taken from where it grows a note.
    const len=(n.len===undefined) ? 1 : n.len;
    if(!Number.isInteger(len) || len<1) return "length:"+n.len;
    if(len>1 && !canGrow) return "length-not-granted:"+len;
    if(len>Math.min(MAX_VINE, def.workspace.columns-n.c)) return "length-past-reach:"+len; }
  if(dr && dr.hits.length && def.workspace.controlIds.indexOf("drums")<0) return "drums-not-granted";
  return null;
}

// ---- the semantic validator: Q5's rules, checked against the registries and against real songs ----
function questSemantics(def, errs){
  let ok=true;
  const err=(code,path,extra)=>{ errs.push({code,path,extra}); ok=false; };
  const has=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
  const granted=new Set(def.workspace.controlIds);
  const earned=new Set(def.prerequisites.earnedByPackageIds);
  for(const cap of def.capabilityIds){
    if(!has(QUEST_CAPABILITIES,cap)){ err("no-such-capability","$.capabilityIds",cap); continue; }
    // A quest may only claim a power its OWN prerequisites teach. Claiming steady-pulse behind the
    // intro package alone would put a child in front of a drum bed they have never been shown.
    for(const pkg of QUEST_CAPABILITIES[cap].earnedByPackageIds)
      if(!earned.has(pkg)) err("capability-not-earned","$.capabilityIds",cap+" needs "+pkg); }
  for(const c of def.workspace.controlIds)
    if(!has(QUEST_CONTROLS,c)) err("no-such-control","$.workspace.controlIds",c);
  for(const t of def.workspace.toolGrants){
    if(!has(QUEST_TOOLS,t.toolId)) err("no-such-tool","$.workspace.toolGrants",t.toolId);
    // Q10: a grant names the COMPLETED capability that authorises it. That need not be one of the two
    // the quest is about — its example grants a stable-tower stamp after `standing-towers` — but the
    // player must have earned it, or the quest hands out a tool for a lesson they have never had.
    if(!has(QUEST_CAPABILITIES,t.capabilityId)) err("no-such-capability","$.workspace.toolGrants",t.capabilityId);
    else for(const pkg of QUEST_CAPABILITIES[t.capabilityId].earnedByPackageIds)
      if(!earned.has(pkg)) err("tool-capability-not-earned","$.workspace.toolGrants",t.capabilityId+" needs "+pkg); }
  const endAction=QUEST_COMPLETION_ACTIONS[def.completion.actionId];
  if(!endAction) err("no-such-completion-action","$.completion",def.completion.actionId);
  // The action names the transition that ENDS the quest. If no phase carries it, the last button in
  // the quest leads nowhere and the child's song can never be put away.
  else if(!def.phases.some(p=>p.procedure.transitionId===endAction.transitionId))
    err("completion-unreachable","$.completion",def.completion.actionId);
  if(!has(QUEST_PAYOFFS,def.completion.payoffId)) err("no-such-payoff","$.completion",def.completion.payoffId);
  if(!has(QUEST_THEMES,def.presentation.themeId)) err("no-such-theme","$.presentation",def.presentation.themeId);
  // REGION_MAP is declared further down the file; reading it here is safe because a catalog is only
  // ever loaded after the whole script has run.
  if(!REGION_MAP.some(r=>r.id===def.presentation.regionId))
    err("no-such-region","$.presentation",def.presentation.regionId);

  // The cast's ids resolve, and each capability has EXACTLY ONE speaker. Unique regions plus matching
  // capability SETS is not enough: Flutter for the shape, Hopper for the beat and Geo for the shape
  // again satisfies both and gives one musical fact two voices. Both uniqueness rules are needed, and
  // each is separately testable. Note this reads REGIONS, not REGION_MAP: the map's lands include the
  // First Garden, whose friend is whichever companion the player picked rather than a fixed one, and
  // a speaker has to be someone the quest can name.
  if(def.cast!==undefined){
    const regions=new Set(), caps=new Set();
    for(const c of def.cast){
      if(!has(REGIONS,c.regionId) || !REGIONS[c.regionId].friend)
        err("no-such-cast-region","$.cast",c.regionId);
      if(regions.has(c.regionId)) err("duplicate-cast-region","$.cast",c.regionId);
      regions.add(c.regionId);
      if(caps.has(c.capabilityId)) err("duplicate-cast-capability","$.cast",c.capabilityId);
      caps.add(c.capabilityId); }
    // A capability may go unspoken. The draft asked for a speaker per claimed capability, and one
    // shipped quest cannot satisfy it: melody-making is taught by the First Garden, whose friend is
    // whichever companion the player picked rather than a fixed one, so nobody can be cast for it.
    // Nothing is lost by allowing it — a fact no speaker claims is said in the garden's own voice,
    // which is exactly where every sentence lived before there was a cast at all.
    for(const cap of caps)
      if(def.capabilityIds.indexOf(cap)<0) err("cast-capability-unclaimed","$.cast",cap); }

  if(def.setup!==undefined){
    const kind=QUEST_SETUP_KINDS[def.setup && def.setup.kind];
    if(!kind) err("no-such-setup-kind","$.setup",def.setup && def.setup.kind);
    else {
      if(!questCheck(def.setup, kind.parameterSchema, "$.setup", errs)) ok=false;
      else {
        // A generated task pinned to columns cannot share a field with controls that move columns.
        for(const c of kind.forbidsControlIds)
          if(granted.has(c)) err("setup-forbids-control","$.setup",c);
        // …and a rule whose landmarks cannot fit the field it is dealt into is refused HERE, where an
        // author can still fix it, rather than at the moment a child presses Begin.
        if(kind.feasible && !kind.feasible(def.setup, def))
          err("setup-rule-infeasible","$.setup",def.workspace.columns+" columns");
        else if(kind.checkRule)
          for(const e of kind.checkRule(def.setup, def)) err(e.code,"$.setup.fragments",e.extra);
        for(const w of def.witnesses) if(w.setup!==undefined){
          const bad=kind.validateInstance(w.setup, def.setup, def);
          if(bad) err("witness-setup-invalid","$.witnesses",w.id+":"+bad); }
      } }
    // Two starting points, one field. Which notes are the player's own would stop being answerable by
    // "the ones that are not landmarks", and that is what makes authorship tags unnecessary.
    if(def.starterSong!==undefined) err("setup-with-starter-song","$.setup","both"); }
  else for(const w of def.witnesses) if(w.setup!==undefined)
    err("witness-setup-unexpected","$.witnesses",w.id);

  if(def.starterSong!==undefined){
    const ev=songEvidence(def.starterSong);
    if(!ev.valid) err("starter-song-invalid","$.starterSong",ev.code);
    else if(ev.paletteFallback) err("starter-palette-unusable","$.starterSong",def.starterSong.palette);
    else { const m=questWorkspaceMismatch(def.starterSong, def);
           if(m) err("starter-unreachable","$.starterSong",m); } }

  const byWitnessId=Object.create(null);
  for(const w of def.witnesses) byWitnessId[w.id]=w;
  const evidenceCache=Object.create(null);
  const witnessCtx=(w,path)=>{
    if(Object.prototype.hasOwnProperty.call(evidenceCache,w.id)) return evidenceCache[w.id];
    const byVersion=Object.create(null);
    let good=true;
    for(const vid of Object.keys(w.songs)){
      const ev=songEvidence(w.songs[vid]);
      if(!ev.valid){ err("witness-song-invalid",path,w.id+"."+vid+":"+ev.code); good=false; continue; }
      if(ev.paletteFallback){ err("witness-palette-unusable",path,w.id+"."+vid); good=false; continue; }
      const m=questWorkspaceMismatch(w.songs[vid], def);
      if(m){ err("witness-unreachable",path,w.id+"."+vid+":"+m); good=false; continue; }
      byVersion[vid]=ev; }
    if(good && !byVersion[w.currentVersionId]){ err("witness-missing-current",path,w.id); good=false; }
    return (evidenceCache[w.id]= good ? { byVersion, currentVersionId:w.currentVersionId } : null); };

  def.phases.forEach((p,i)=>{
    const at="$.phases["+i+"]";
    const tr=QUEST_TRANSITIONS[p.procedure.transitionId];
    if(!tr) err("no-such-transition",at+".procedure",p.procedure.transitionId);
    else if(tr.phaseType!==p.type) err("transition-wrong-phase",at+".procedure",p.procedure.transitionId+" in "+p.type);
    // Rule 6: a procedural fact may never masquerade as a musical one, in either direction.
    for(const g of p.procedure.gateIds){
      const prim=QUEST_PRIMITIVES[g];
      if(!prim) err("no-such-gate",at+".procedure",g);
      else if(prim.kind!=="procedural") err("musical-as-gate",at+".procedure",g); }
    const ch=p.challenge;
    if(!ch) return;

    const canon=[];
    ch.routes.forEach((r,ri)=>{
      const rat=at+".routes["+ri+"]";
      const caps=[], parts=[];
      for(const obs of r.observations){
        const prim=QUEST_PRIMITIVES[obs.analyzerId];
        if(!prim){ err("no-such-analyzer",rat,obs.analyzerId); continue; }
        if(prim.kind!=="musical"){ err("procedural-in-route",rat,obs.analyzerId); continue; }
        if(prim.allowedPhaseTypes.indexOf(p.type)<0) err("analyzer-wrong-phase",rat,obs.analyzerId+" in "+p.type);
        if(ch.capabilityIds.indexOf(prim.capabilityId)<0) err("analyzer-capability-not-claimed",rat,prim.capabilityId);
        // The route asks the child for a heartbeat; the workspace decides whether they have a drum to
        // make one with. A quest that asked without granting was enterable and unfinishable.
        for(const c of prim.requiredControlIds)
          if(!granted.has(c)) err("analyzer-control-not-granted",rat,obs.analyzerId+" needs "+c);
        // …and the idea it names must be one the prerequisites taught (A2). A capability is earned by one
        // package, but an idea inside it can be taught by another: "on the beat" is melody, and footsteps
        // teaches it, not intro. Checked against the same earned set as the capabilities.
        for(const pkg of (prim.taughtByPackageIds||[]))
          if(!earned.has(pkg)) err("analyzer-not-taught",rat,obs.analyzerId+" needs "+pkg);
        caps.push(prim.capabilityId);
        const np=questNormalizeParams(prim.parameterSchema, obs.params);
        if(!np.ok){ err(np.code,rat+".params",obs.analyzerId); continue; }
        // A snapshot clause must look at what the phase FORKED FROM. Pointed at the phase's own
        // version it asks whether a song differs from itself — never true, or trivially true, and
        // either way a question no player could act on.
        if(prim.subject==="snapshot-pair" && np.value.snapshotVersionId!==p.sourceVersionId)
          err("snapshot-not-source",rat,np.value.snapshotVersionId+" vs "+p.sourceVersionId);
        const d=QUEST_DESCRIPTORS[obs.descriptorId];
        if(!d) err("no-such-descriptor",rat,obs.descriptorId);
        else if(d.kind!=="way") err("descriptor-wrong-kind",rat,obs.descriptorId);
        else if(prim.allowedDescriptorIds.indexOf(obs.descriptorId)<0) err("descriptor-not-allowed",rat,obs.descriptorId);
        parts.push(obs.analyzerId+"("+JSON.stringify(np.value, Object.keys(np.value).sort())+")"); }
      // Rule 4: exactly one observation per claimed capability, and every claimed capability covered.
      if(caps.length!==r.observations.length || new Set(caps).size!==caps.length
         || [...caps].sort().join(",")!==[...ch.capabilityIds].sort().join(","))
        err("route-capability-span",rat,caps.join(","));
      canon.push(parts.sort().join(" & ")); });

    // Rule 2: duplicates are decided by the canonical form, not by author ids or key order.
    for(let a=0;a<canon.length;a++) for(let b=a+1;b<canon.length;b++)
      if(canon[a] && canon[a]===canon[b]) err("duplicate-route-observations",at,ch.routes[a].id+"="+ch.routes[b].id);

    // Rule 5, part one: no route may imply another. Implication means an A-without-B song cannot exist,
    // so the two were never alternatives however different their ids looked.
    const clauseOf=(r,cap)=>r.observations.find(o=>{ const q=QUEST_PRIMITIVES[o.analyzerId];
      return q && q.kind==="musical" && q.capabilityId===cap; });
    // Params that failed their schema above have already been reported. They are skipped here rather
    // than fed to the relation algebra: comparing a clause nobody could evaluate would be an answer
    // invented about a definition that is already refused, and it once threw a TypeError instead.
    const normOf=o=>{ const q=QUEST_PRIMITIVES[o.analyzerId];
      const n=q ? questNormalizeParams(q.parameterSchema, o.params) : { ok:false };
      return n.ok ? n.value : null; };
    for(const A of ch.routes) for(const B of ch.routes){
      if(A===B) continue;
      let implies=true;
      for(const cap of ch.capabilityIds){
        const x=clauseOf(A,cap), y=clauseOf(B,cap);
        if(!x || !y){ implies=false; continue; }
        const px=normOf(x), py=normOf(y);
        if(!px || !py){ implies=false; continue; }
        const rel=questRelate(x.analyzerId, px, y.analyzerId, py);
        if(rel===QREL.UNKNOWN){ err("relation-unknown",at,x.analyzerId+" vs "+y.analyzerId); implies=false; continue; }
        if(rel!==QREL.EQ && rel!==QREL.LR) implies=false; }
      if(implies) err("route-implies-route",at,A.id+" implies "+B.id); }

    // Rule 5, part two: EXECUTED songs. Derived implication proves containment; witnesses prove that
    // each route is reachable and observably distinct under the real detectors.
    const ctxOf=r=>r.witnessIds.map(wid=>{
      const w=byWitnessId[wid];
      if(!w) return null;                                       // D1 already reported the dangling id
      if(w.phaseId!==p.id){ err("witness-wrong-phase",at,wid); return null; }
      return witnessCtx(w,at); }).filter(Boolean);
    const ctxs=new Map();
    for(const r of ch.routes) ctxs.set(r, ctxOf(r));
    for(const A of ch.routes){
      if(!ctxs.get(A).some(c=>questRouteMatches(A,c))){ err("route-unsatisfiable",at,A.id); continue; }
      for(const B of ch.routes){
        if(A===B) continue;
        if(!ctxs.get(A).some(c=>questRouteMatches(A,c) && !questRouteMatches(B,c)))
          err("no-distinguishing-witness",at,A.id+" without "+B.id); } }
  });
  return ok;
}

// ---------- What the garden says back ----------
// Tokens are stored as an id plus enum slots and rendered fresh every time, so a later copy edit reaches
// runs that were saved before it. The rendered text is a plain string built by concatenation — never
// markup — and an unresolvable token yields null rather than a sentence with a hole in it.
function questTokenText(t){
  const d=t && QUEST_DESCRIPTORS[t.id];
  if(!d || d.kind!=="heard") return null;
  if(!d.slots || !d.slots.length) return d.text;
  let out=d.text;
  for(const name of d.slots){
    const v=t.slots && t.slots[name];
    const label=QUEST_ENUM_LABELS[v];
    if(!label) return null;                      // a slot we cannot fill is a sentence we do not say
    out=out.split("{"+name+"}").join(label); }
  return out;
}
// Keyed on the slots the descriptor actually declares, so a token carrying an extra key the wording
// never reads is the SAME fact, not a second one. Keying on the raw slots object said "The lights
// climbed." twice. Found by GPT's tester.
function questTokenKey(t){
  const d=QUEST_DESCRIPTORS[t.id];
  if(!d) return t.id+"|?";
  return t.id+"|"+(d.slots||[]).map(n=>String(t.slots && t.slots[n])).join(",");
}
function questRenderTokens(list){
  const seen=Object.create(null), out=[];
  for(const t of list){                          // each distinct musical fact ONCE, however many routes named it
    const k=questTokenKey(t); if(seen[k]) continue; seen[k]=1;
    const text=questTokenText(t);
    if(text) out.push({ descriptorId:t.id, slots:t.slots||null, text }); }
  return out;
}
// "Ways this could work": one entry per route, its descriptors in the order the author wrote them.
// The engine supplies the phrases; joining them into a sentence is the shell's business.
function questWays(def, phaseId){
  const p=def && def.phases && def.phases.find(x=>x.id===phaseId);
  if(!p || !p.challenge) return [];
  return p.challenge.routes.map(r=>({ routeId:r.id,
    phrases:r.observations.map(o=>{ const d=QUEST_DESCRIPTORS[o.descriptorId];
      return d && d.kind==="way" ? d.text : null; }).filter(Boolean) }));
}

// The evaluator. It reads NOTHING live: no DOM, grid, audio, clock, Store, progress or active scope.
// Everything it needs arrives as the definition, pre-extracted evidence, and the run.
function evaluateQuest(def, evidence, run){
  const no=(code,extra)=>({ ok:false, code, extra });
  if(!def || !run || !evidence || !evidence.versions) return no("bad-input");
  if(run.questId!==def.id) return no("wrong-quest", run.questId);
  if(run.definitionVersion!==def.v) return no("wrong-definition-version", run.definitionVersion);
  const p=def.phases[run.phase];
  if(!Number.isInteger(run.phase) || !p) return no("no-phase", run.phase);

  const current = p.type==="compare-offer" ? (run.selection || run.draft) : p.versionId;
  const need=[current].concat(p.type==="transform" ? [p.sourceVersionId]
                            : p.type==="compare-offer" ? p.versionIds : []);
  for(const vid of need){
    const ev=evidence.versions[vid];
    if(!ev || !ev.valid) return no("no-evidence", vid); }

  const ctx={ byVersion:evidence.versions, currentVersionId:current };
  const routes=[], matchedRouteIds=[], allTokens=[];
  if(p.challenge) for(const r of p.challenge.routes){
    const observations=r.observations.map(o=>{
      const prim=QUEST_PRIMITIVES[o.analyzerId];
      const res=questEvaluateObservation(o, ctx);
      const facts=res.facts||null;
      const toks=(facts && prim && prim.describe) ? prim.describe(facts) : [];
      for(const t of toks) allTokens.push(t);
      return { analyzerId:o.analyzerId, matched:res.ok===true, descriptorTokens:questRenderTokens(toks) }; });
    const matched=observations.every(o=>o.matched);
    if(matched) matchedRouteIds.push(r.id);
    routes.push({ routeId:r.id, matched, observations }); }

  // Procedural facts, every one of them read off the run. "nonempty" is REPORTED, not gated on:
  // completePass already refuses an empty song and an edit that empties one bumps editRev, so gating
  // it here would be a condition that cannot be false whenever the playback gate is open.
  const gate=(id,vid)=>{ const g=QUEST_PRIMITIVES[id];
    if(!g || g.kind!=="procedural") return false;
    try{ return g.gate(run, vid)===true; }catch(e){ return false; } };   // a throwing gate is a closed gate
  // Readiness sits ABOVE the declared gates, so it has to reach the button too: questPhaseGate refuses
  // without it, and a lit button that then does nothing is the defect D5 found in another costume.
  const missing = p.type==="compare-offer" ? [] : questReadinessMissing(def, run, current);
  const c=run.comparison;
  const blockers=[];
  for(const id of p.procedure.gateIds) if(!gate(id, current)) blockers.push(id);
  const gatesOpen = blockers.length===0;
  const procedural={
    nonempty: evidence.versions[current].nonempty===true,
    completeSinceLastEdit: playbackCompleteSinceLastEdit(run, current),
    editedAfterFork: gate("edit.after-fork", current),
    auditionedBoth: gate("comparison.auditioned-both", current),
    comparedCurrentRevisions: !!c && c.versionIds.every(id=>{ const v=run.versions[id];
      return !!v && v.editRev===c.revs[id]; }),
    chosen: gate("comparison.chosen", current),
    // The DOOR's own answer, not a second computation of it. `gatesOpen` and `missing` above are
    // reported for diagnosis; what decides the button is the same function advanceQuestPhase is handed,
    // so the two cannot drift apart. Until the confirmation fork was removed the controller happened to
    // call this evaluation on its way through, and the seam was held by that accident — GPT's tester
    // caught the accident ending when the fork did.
    canAdvance: p.type!=="compare-offer" && questPhaseGate(def, run.phase, current)(run)===true,
    canOffer:  p.type==="compare-offer" && gatesOpen,
    blockers,
  };
  return { ok:true, questId:def.id, definitionVersion:def.v, phaseId:p.id, currentVersionId:current,
    musical:{ routes, matchedRouteIds, descriptorTokens:questRenderTokens(allTokens) },
    readiness:{ ok:missing.length===0, missing:missing.slice() },
    procedural };
}

// Evidence for every version, then the evaluation. Extracted because the shell and the controller both
// need it and were each building it themselves — and the fork below only works if what the card shows
// and what the button does are the same answer to the same question.
function questEvaluateRun(run, def){
  const versions={};
  for(const id of Object.keys(run.versions)) versions[id]=songEvidence(run.versions[id].song);
  return evaluateQuest(def, { versions }, run);
}

// The confirmation fork is gone (playtest, 2026-09-21). It was Q6's "shape it more, or keep it anyway"
// built literally, and built wrong: pressing a button labelled "Compare both paths" produced two
// different buttons, and the sentence above them said none of the suggested ways came out — which read
// as a failure notice for work that Q6 says is complete. The owner changed both shape and beat, did
// MORE than either route asked, and was told nothing came out.
//
// What replaces it is nothing. A matched route is no longer reported to the shell at all: the friends
// say what they heard either way, which is the descriptive response Q6 asked for in the first place,
// and the route list stays where it belongs as an optional aid before you start.

// The persisted observation, rendered. A resumed run shows what it last heard until a newer completed
// playback replaces it — so the description a child left the garden with is the one they come back to.
function questObservationFor(run, phaseId){
  const o=run && run.evidence && run.evidence.observations && run.evidence.observations[phaseId];
  if(!o) return null;
  return { versionId:o.versionId, editRev:o.editRev, at:o.at,
    matchedRouteIds:(o.matchedRouteIds||[]).slice(),
    descriptorTokens:questRenderTokens(o.descriptorTokens||[]) };
}

function deepFreezeQuest(v){
  if(v && typeof v==="object" && !Object.isFrozen(v)){
    Object.freeze(v);
    for(const k of Object.keys(v)) deepFreezeQuest(v[k]); }
  return v; }

// All-or-nothing: one malformed definition publishes an EMPTY registry rather than a partial catalog,
// because a half-installed quest is a quest that can strand a child mid-way.
let QUEST_DEFINITIONS=Object.freeze(Object.create(null));
let QUEST_CATALOG_ERRORS=Object.freeze([]);
// The source context is an argument, not a default. A definition calls itself official; only the path
// it arrived on can know whether that is true, and a player's import must not be able to promote
// itself by writing a word. There is no shorter path for the built-in catalog: it declares the same
// field and is checked against the same claim.
function loadQuestCatalog(jsonText, sourceKind){
  const errs=[];
  try{
    if(sourceKind!=="official" && sourceKind!=="player") throw new QuestLoadError("no-source-kind","$");
    if(typeof jsonText!=="string") throw new QuestLoadError("not-a-string","$");
    if(jsonText.length>QUEST_JSON_MAX) throw new QuestLoadError("source-too-large","$");
    const env=assertPlainJsonTree(JSON.parse(jsonText));
    if(!env || env.v!==1 || !Array.isArray(env.definitions) || !env.definitions.length || env.definitions.length>32)
      throw new QuestLoadError("bad-envelope","$");
    for(const k of Object.keys(env)) if(k!=="v" && k!=="definitions") throw new QuestLoadError("unknown-envelope-key","$."+k);
    const out=Object.create(null);
    for(const def of env.definitions){
      const validate=Object.prototype.hasOwnProperty.call(QUEST_SCHEMA_VALIDATORS, def && def.v)
        && QUEST_SCHEMA_VALIDATORS[def.v];
      if(!validate){ errs.push({code:"unsupported-schema-version", path:"$", extra:def&&def.v}); continue; }
      if(!validate(def, errs)) continue;
      if(def.author.kind!==sourceKind){
        errs.push({code:"author-kind-mismatch", path:"$.author", extra:def.author.kind}); continue; }
      if(!questCrossRefs(def, errs)) continue;
      if(!questSemantics(def, errs)) continue;
      if(out[def.id]){ errs.push({code:"duplicate-quest-id", path:"$", extra:def.id}); continue; }
      out[def.id]=deepFreezeQuest(def); }
    if(errs.length) throw new QuestLoadError("invalid-catalog","$");
    QUEST_DEFINITIONS=Object.freeze(out); QUEST_CATALOG_ERRORS=Object.freeze([]);
    return QUEST_DEFINITIONS;
  }catch(e){
    QUEST_DEFINITIONS=Object.freeze(Object.create(null));
    QUEST_CATALOG_ERRORS=Object.freeze(errs.length?errs:[{code:e.code||"parse-failed", path:e.path||"$"}]);
    return QUEST_DEFINITIONS; }
}

// The built-in catalog, as JSON rather than object literals: the parse is the boundary a future
// Questmaker import crosses too, so official content must not get a shorter path to trust than a
// player's would. A backtick template is safe here — JSON.stringify escapes any backslash or
// backtick, and the plain-JSON gate re-checks everything the parse produces.
const BUILTIN_QUEST_CATALOG_JSON = "{\n \"v\": 1,\n \"definitions\": [\n  {\n   \"v\": 3,\n   \"id\": \"firefly-crossing\",\n   \"author\": {\n    \"kind\": \"official\",\n    \"id\": \"tune-garden\"\n   },\n   \"kind\": \"guided-commission\",\n   \"title\": \"The Firefly Crossing\",\n   \"brief\": {\n    \"worldText\": \"Flutter's lights can see three stepping stones, but Hopper's roots need a heartbeat.\",\n    \"intentionText\": \"Shape a path over a steady pulse, then make another version and choose the one to offer.\"\n   },\n   \"prerequisites\": {\n    \"earnedByPackageIds\": [\n     \"follow-the-fireflies\",\n     \"footsteps\"\n    ]\n   },\n   \"capabilityIds\": [\n    \"melodic-contour\",\n    \"steady-pulse\"\n   ],\n   \"workspace\": {\n    \"paletteId\": \"pentatonic\",\n    \"columns\": 16,\n    \"grooveId\": \"straight\",\n    \"controlIds\": [\n     \"drums\",\n     \"loop\"\n    ],\n    \"toolGrants\": []\n   },\n   \"setup\": {\n    \"kind\": \"waypoints\",\n    \"count\": 3,\n    \"minGap\": 4,\n    \"edgeMargin\": 2,\n    \"rowMargin\": 1,\n    \"minRowSpread\": 2,\n    \"maxRowSpread\": 4,\n    \"fragments\": [\n     [\n      {\n       \"lane\": 0,\n       \"c\": 0\n      },\n      {\n       \"lane\": 1,\n       \"c\": 2\n      }\n     ],\n     [\n      {\n       \"lane\": 0,\n       \"c\": 0\n      },\n      {\n       \"lane\": 1,\n       \"c\": 3\n      }\n     ],\n     [\n      {\n       \"lane\": 1,\n       \"c\": 1\n      },\n      {\n       \"lane\": 1,\n       \"c\": 2\n      }\n     ],\n     [\n      {\n       \"lane\": 0,\n       \"c\": 0\n      },\n      {\n       \"lane\": 2,\n       \"c\": 1\n      }\n     ],\n     [\n      {\n       \"lane\": 2,\n       \"c\": 0\n      },\n      {\n       \"lane\": 2,\n       \"c\": 1\n      },\n      {\n       \"lane\": 1,\n       \"c\": 3\n      }\n     ],\n     [\n      {\n       \"lane\": 0,\n       \"c\": 0\n      },\n      {\n       \"lane\": 2,\n       \"c\": 2\n      },\n      {\n       \"lane\": 2,\n       \"c\": 3\n      }\n     ]\n    ]\n   },\n   \"phases\": [\n    {\n     \"id\": \"light-first-path\",\n     \"name\": \"Light the first path\",\n     \"type\": \"compose\",\n     \"versionId\": \"A\",\n     \"worldText\": \"Three stones are glowing on the field, and Hopper has tapped out the start of a beat. Give Flutter's lights a way across the stones, and carry Hopper's beat along.\",\n     \"intentionText\": \"Keep the ringed stones and Hopper's opening beat. Add notes around the stones, and continue the beat in your own way.\",\n     \"procedure\": {\n      \"gateIds\": [\n       \"playback.complete-since-last-edit\"\n      ],\n      \"transitionId\": \"fork-version\",\n      \"buttonLabel\": \"Make another way across\"\n     },\n     \"challenge\": {\n      \"id\": \"shape-over-pulse\",\n      \"capabilityIds\": [\n       \"melodic-contour\",\n       \"steady-pulse\"\n      ],\n      \"routes\": [\n       {\n        \"id\": \"main-beat-crossing\",\n        \"witnessIds\": [\n         \"first-main-rise\"\n        ],\n        \"observations\": [\n         {\n          \"analyzerId\": \"contour.any-of\",\n          \"params\": {\n           \"families\": [\n            \"rise\",\n            \"fall\",\n            \"hover\",\n            \"arc\"\n           ]\n          },\n          \"descriptorId\": \"way-contour-any\"\n         },\n         {\n          \"analyzerId\": \"pulse.kick-on-main-beats\",\n          \"params\": {},\n          \"descriptorId\": \"way-pulse-main-kicks\"\n         }\n        ]\n       },\n       {\n        \"id\": \"even-walk-crossing\",\n        \"witnessIds\": [\n         \"first-even-fall\"\n        ],\n        \"observations\": [\n         {\n          \"analyzerId\": \"contour.any-of\",\n          \"params\": {\n           \"families\": [\n            \"rise\",\n            \"fall\",\n            \"hover\",\n            \"arc\"\n           ]\n          },\n          \"descriptorId\": \"way-contour-any\"\n         },\n         {\n          \"analyzerId\": \"pulse.even-walk\",\n          \"params\": {},\n          \"descriptorId\": \"way-pulse-even-kicks\"\n         }\n        ]\n       },\n       {\n        \"id\": \"shimmer-crossing\",\n        \"witnessIds\": [\n         \"first-shimmer-arc\"\n        ],\n        \"observations\": [\n         {\n          \"analyzerId\": \"contour.any-of\",\n          \"params\": {\n           \"families\": [\n            \"rise\",\n            \"fall\",\n            \"hover\",\n            \"arc\"\n           ]\n          },\n          \"descriptorId\": \"way-contour-any\"\n         },\n         {\n          \"analyzerId\": \"pulse.hat-shimmer\",\n          \"params\": {},\n          \"descriptorId\": \"way-pulse-hat-shimmer\"\n         }\n        ]\n       }\n      ]\n     }\n    },\n    {\n     \"id\": \"another-way-across\",\n     \"name\": \"Another way across\",\n     \"type\": \"transform\",\n     \"sourceVersionId\": \"A\",\n     \"versionId\": \"B\",\n     \"worldText\": \"The lights know this path now. Show them another way across — the same stones, a different journey.\",\n     \"intentionText\": \"Keep the ringed stones and the opening beat. Change the path's shape, or the beat after the opening — or both.\",\n     \"procedure\": {\n      \"gateIds\": [\n       \"edit.after-fork\",\n       \"playback.complete-since-last-edit\"\n      ],\n      \"transitionId\": \"advance\",\n      \"buttonLabel\": \"Compare both paths\"\n     },\n     \"challenge\": {\n      \"id\": \"retain-and-change\",\n      \"capabilityIds\": [\n       \"melodic-contour\",\n       \"steady-pulse\"\n      ],\n      \"routes\": [\n       {\n        \"id\": \"new-shape-same-heartbeat\",\n        \"witnessIds\": [\n         \"second-fall-same-main\"\n        ],\n        \"observations\": [\n         {\n          \"analyzerId\": \"contour.differs-from-snapshot\",\n          \"params\": {\n           \"snapshotVersionId\": \"A\"\n          },\n          \"descriptorId\": \"way-contour-changed\"\n         },\n         {\n          \"analyzerId\": \"pulse.same-steady-family-as-snapshot\",\n          \"params\": {\n           \"snapshotVersionId\": \"A\"\n          },\n          \"descriptorId\": \"way-pulse-kept\"\n         }\n        ]\n       },\n       {\n        \"id\": \"same-shape-new-heartbeat\",\n        \"witnessIds\": [\n         \"second-rise-even-walk\"\n        ],\n        \"observations\": [\n         {\n          \"analyzerId\": \"contour.same-family-as-snapshot\",\n          \"params\": {\n           \"snapshotVersionId\": \"A\"\n          },\n          \"descriptorId\": \"way-contour-kept\"\n         },\n         {\n          \"analyzerId\": \"pulse.differs-steady-family-from-snapshot\",\n          \"params\": {\n           \"snapshotVersionId\": \"A\"\n          },\n          \"descriptorId\": \"way-pulse-changed\"\n         }\n        ]\n       },\n       {\n        \"id\": \"new-shape-new-heartbeat\",\n        \"witnessIds\": [\n         \"second-fall-new-shimmer\"\n        ],\n        \"observations\": [\n         {\n          \"analyzerId\": \"contour.differs-from-snapshot\",\n          \"params\": {\n           \"snapshotVersionId\": \"A\"\n          },\n          \"descriptorId\": \"way-contour-changed\"\n         },\n         {\n          \"analyzerId\": \"pulse.differs-steady-family-from-snapshot\",\n          \"params\": {\n           \"snapshotVersionId\": \"A\"\n          },\n          \"descriptorId\": \"way-pulse-changed\"\n         }\n        ]\n       }\n      ]\n     }\n    },\n    {\n     \"id\": \"choose-crossing\",\n     \"name\": \"Choose the crossing\",\n     \"type\": \"compare-offer\",\n     \"versionIds\": [\n      \"A\",\n      \"B\"\n     ],\n     \"worldText\": \"Both crossings are glowing. Tap each one to hear it, and keep the path that feels like your journey.\",\n     \"intentionText\": \"Tap a path to hear it — the one lit is the one you are holding. Play it right through, then offer it.\",\n     \"procedure\": {\n      \"gateIds\": [\n       \"comparison.auditioned-both\",\n       \"comparison.chosen\",\n       \"playback.complete-since-last-edit\"\n      ],\n      \"transitionId\": \"offer\"\n     },\n     \"reflection\": {\n      \"promptText\": \"Which path feels more like the journey you wanted?\",\n      \"choices\": [\n       {\n        \"id\": \"A\",\n        \"label\": \"Path A\"\n       },\n       {\n        \"id\": \"B\",\n        \"label\": \"Path B\"\n       }\n      ]\n     }\n    }\n   ],\n   \"completion\": {\n    \"actionId\": \"offer-song\",\n    \"payoffId\": \"saved-song\",\n    \"label\": \"Offer this crossing\",\n    \"defaultTitle\": \"The Firefly Crossing\",\n    \"completionText\": \"Flutter's lights and Hopper's roots carry your crossing into the garden.\"\n   },\n   \"presentation\": {\n    \"themeId\": \"night-meadow\",\n    \"regionId\": \"paths-of-song\",\n    \"cardText\": \"A crossing for two powers\",\n    \"estimateMinutes\": 12,\n    \"priority\": 10\n   },\n   \"cast\": [\n    {\n     \"regionId\": \"paths-of-song\",\n     \"capabilityId\": \"melodic-contour\"\n    },\n    {\n     \"regionId\": \"pulse-woods\",\n     \"capabilityId\": \"steady-pulse\"\n    }\n   ],\n   \"witnesses\": [\n    {\n     \"id\": \"first-main-rise\",\n     \"phaseId\": \"light-first-path\",\n     \"currentVersionId\": \"A\",\n     \"songs\": {\n      \"A\": {\n       \"v\": 3,\n       \"meta\": {\n        \"title\": null,\n        \"created\": 0,\n        \"updated\": 0,\n        \"author\": null\n       },\n       \"palette\": \"pentatonic\",\n       \"time\": {\n        \"cols\": 16,\n        \"tempo\": 108,\n        \"groove\": 0\n       },\n       \"tracks\": [\n        {\n         \"kind\": \"melody\",\n         \"voice\": \"musicbox\",\n         \"notes\": [\n          {\n           \"p\": 60,\n           \"c\": 0,\n           \"len\": 1\n          },\n          {\n           \"p\": 62,\n           \"c\": 2,\n           \"len\": 1\n          },\n          {\n           \"p\": 64,\n           \"c\": 4,\n           \"len\": 1\n          },\n          {\n           \"p\": 67,\n           \"c\": 6,\n           \"len\": 1\n          }\n         ]\n        },\n        {\n         \"kind\": \"drums\",\n         \"hits\": [\n          {\n           \"lane\": 0,\n           \"c\": 0\n          },\n          {\n           \"lane\": 0,\n           \"c\": 4\n          },\n          {\n           \"lane\": 0,\n           \"c\": 8\n          },\n          {\n           \"lane\": 0,\n           \"c\": 12\n          }\n         ]\n        }\n       ]\n      }\n     }\n    },\n    {\n     \"id\": \"first-even-fall\",\n     \"phaseId\": \"light-first-path\",\n     \"currentVersionId\": \"A\",\n     \"songs\": {\n      \"A\": {\n       \"v\": 3,\n       \"meta\": {\n        \"title\": null,\n        \"created\": 0,\n        \"updated\": 0,\n        \"author\": null\n       },\n       \"palette\": \"pentatonic\",\n       \"time\": {\n        \"cols\": 16,\n        \"tempo\": 108,\n        \"groove\": 0\n       },\n       \"tracks\": [\n        {\n         \"kind\": \"melody\",\n         \"voice\": \"musicbox\",\n         \"notes\": [\n          {\n           \"p\": 67,\n           \"c\": 0,\n           \"len\": 1\n          },\n          {\n           \"p\": 64,\n           \"c\": 2,\n           \"len\": 1\n          },\n          {\n           \"p\": 62,\n           \"c\": 4,\n           \"len\": 1\n          },\n          {\n           \"p\": 60,\n           \"c\": 6,\n           \"len\": 1\n          }\n         ]\n        },\n        {\n         \"kind\": \"drums\",\n         \"hits\": [\n          {\n           \"lane\": 0,\n           \"c\": 0\n          },\n          {\n           \"lane\": 0,\n           \"c\": 2\n          },\n          {\n           \"lane\": 0,\n           \"c\": 4\n          },\n          {\n           \"lane\": 0,\n           \"c\": 6\n          },\n          {\n           \"lane\": 0,\n           \"c\": 8\n          },\n          {\n           \"lane\": 0,\n           \"c\": 10\n          },\n          {\n           \"lane\": 0,\n           \"c\": 12\n          },\n          {\n           \"lane\": 0,\n           \"c\": 14\n          }\n         ]\n        }\n       ]\n      }\n     }\n    },\n    {\n     \"id\": \"first-shimmer-arc\",\n     \"phaseId\": \"light-first-path\",\n     \"currentVersionId\": \"A\",\n     \"songs\": {\n      \"A\": {\n       \"v\": 3,\n       \"meta\": {\n        \"title\": null,\n        \"created\": 0,\n        \"updated\": 0,\n        \"author\": null\n       },\n       \"palette\": \"pentatonic\",\n       \"time\": {\n        \"cols\": 16,\n        \"tempo\": 108,\n        \"groove\": 0\n       },\n       \"tracks\": [\n        {\n         \"kind\": \"melody\",\n         \"voice\": \"musicbox\",\n         \"notes\": [\n          {\n           \"p\": 60,\n           \"c\": 0,\n           \"len\": 1\n          },\n          {\n           \"p\": 62,\n           \"c\": 2,\n           \"len\": 1\n          },\n          {\n           \"p\": 67,\n           \"c\": 4,\n           \"len\": 1\n          },\n          {\n           \"p\": 62,\n           \"c\": 6,\n           \"len\": 1\n          },\n          {\n           \"p\": 60,\n           \"c\": 8,\n           \"len\": 1\n          }\n         ]\n        },\n        {\n         \"kind\": \"drums\",\n         \"hits\": [\n          {\n           \"lane\": 2,\n           \"c\": 0\n          },\n          {\n           \"lane\": 2,\n           \"c\": 2\n          },\n          {\n           \"lane\": 2,\n           \"c\": 4\n          },\n          {\n           \"lane\": 2,\n           \"c\": 6\n          },\n          {\n           \"lane\": 2,\n           \"c\": 8\n          },\n          {\n           \"lane\": 2,\n           \"c\": 10\n          },\n          {\n           \"lane\": 2,\n           \"c\": 12\n          },\n          {\n           \"lane\": 2,\n           \"c\": 14\n          }\n         ]\n        }\n       ]\n      }\n     }\n    },\n    {\n     \"id\": \"second-fall-same-main\",\n     \"phaseId\": \"another-way-across\",\n     \"currentVersionId\": \"B\",\n     \"songs\": {\n      \"A\": {\n       \"v\": 3,\n       \"meta\": {\n        \"title\": null,\n        \"created\": 0,\n        \"updated\": 0,\n        \"author\": null\n       },\n       \"palette\": \"pentatonic\",\n       \"time\": {\n        \"cols\": 16,\n        \"tempo\": 108,\n        \"groove\": 0\n       },\n       \"tracks\": [\n        {\n         \"kind\": \"melody\",\n         \"voice\": \"musicbox\",\n         \"notes\": [\n          {\n           \"p\": 60,\n           \"c\": 0,\n           \"len\": 1\n          },\n          {\n           \"p\": 62,\n           \"c\": 2,\n           \"len\": 1\n          },\n          {\n           \"p\": 64,\n           \"c\": 4,\n           \"len\": 1\n          },\n          {\n           \"p\": 67,\n           \"c\": 6,\n           \"len\": 1\n          }\n         ]\n        },\n        {\n         \"kind\": \"drums\",\n         \"hits\": [\n          {\n           \"lane\": 0,\n           \"c\": 0\n          },\n          {\n           \"lane\": 0,\n           \"c\": 4\n          },\n          {\n           \"lane\": 0,\n           \"c\": 8\n          },\n          {\n           \"lane\": 0,\n           \"c\": 12\n          }\n         ]\n        }\n       ]\n      },\n      \"B\": {\n       \"v\": 3,\n       \"meta\": {\n        \"title\": null,\n        \"created\": 0,\n        \"updated\": 0,\n        \"author\": null\n       },\n       \"palette\": \"pentatonic\",\n       \"time\": {\n        \"cols\": 16,\n        \"tempo\": 108,\n        \"groove\": 0\n       },\n       \"tracks\": [\n        {\n         \"kind\": \"melody\",\n         \"voice\": \"musicbox\",\n         \"notes\": [\n          {\n           \"p\": 67,\n           \"c\": 0,\n           \"len\": 1\n          },\n          {\n           \"p\": 64,\n           \"c\": 2,\n           \"len\": 1\n          },\n          {\n           \"p\": 62,\n           \"c\": 4,\n           \"len\": 1\n          },\n          {\n           \"p\": 60,\n           \"c\": 6,\n           \"len\": 1\n          }\n         ]\n        },\n        {\n         \"kind\": \"drums\",\n         \"hits\": [\n          {\n           \"lane\": 0,\n           \"c\": 0\n          },\n          {\n           \"lane\": 0,\n           \"c\": 4\n          },\n          {\n           \"lane\": 0,\n           \"c\": 8\n          },\n          {\n           \"lane\": 0,\n           \"c\": 12\n          }\n         ]\n        }\n       ]\n      }\n     }\n    },\n    {\n     \"id\": \"second-rise-even-walk\",\n     \"phaseId\": \"another-way-across\",\n     \"currentVersionId\": \"B\",\n     \"songs\": {\n      \"A\": {\n       \"v\": 3,\n       \"meta\": {\n        \"title\": null,\n        \"created\": 0,\n        \"updated\": 0,\n        \"author\": null\n       },\n       \"palette\": \"pentatonic\",\n       \"time\": {\n        \"cols\": 16,\n        \"tempo\": 108,\n        \"groove\": 0\n       },\n       \"tracks\": [\n        {\n         \"kind\": \"melody\",\n         \"voice\": \"musicbox\",\n         \"notes\": [\n          {\n           \"p\": 60,\n           \"c\": 0,\n           \"len\": 1\n          },\n          {\n           \"p\": 62,\n           \"c\": 2,\n           \"len\": 1\n          },\n          {\n           \"p\": 64,\n           \"c\": 4,\n           \"len\": 1\n          },\n          {\n           \"p\": 67,\n           \"c\": 6,\n           \"len\": 1\n          }\n         ]\n        },\n        {\n         \"kind\": \"drums\",\n         \"hits\": [\n          {\n           \"lane\": 0,\n           \"c\": 0\n          },\n          {\n           \"lane\": 0,\n           \"c\": 4\n          },\n          {\n           \"lane\": 0,\n           \"c\": 8\n          },\n          {\n           \"lane\": 0,\n           \"c\": 12\n          }\n         ]\n        }\n       ]\n      },\n      \"B\": {\n       \"v\": 3,\n       \"meta\": {\n        \"title\": null,\n        \"created\": 0,\n        \"updated\": 0,\n        \"author\": null\n       },\n       \"palette\": \"pentatonic\",\n       \"time\": {\n        \"cols\": 16,\n        \"tempo\": 108,\n        \"groove\": 0\n       },\n       \"tracks\": [\n        {\n         \"kind\": \"melody\",\n         \"voice\": \"musicbox\",\n         \"notes\": [\n          {\n           \"p\": 60,\n           \"c\": 0,\n           \"len\": 1\n          },\n          {\n           \"p\": 62,\n           \"c\": 2,\n           \"len\": 1\n          },\n          {\n           \"p\": 64,\n           \"c\": 4,\n           \"len\": 1\n          },\n          {\n           \"p\": 67,\n           \"c\": 6,\n           \"len\": 1\n          }\n         ]\n        },\n        {\n         \"kind\": \"drums\",\n         \"hits\": [\n          {\n           \"lane\": 0,\n           \"c\": 0\n          },\n          {\n           \"lane\": 0,\n           \"c\": 2\n          },\n          {\n           \"lane\": 0,\n           \"c\": 4\n          },\n          {\n           \"lane\": 0,\n           \"c\": 6\n          },\n          {\n           \"lane\": 0,\n           \"c\": 8\n          },\n          {\n           \"lane\": 0,\n           \"c\": 10\n          },\n          {\n           \"lane\": 0,\n           \"c\": 12\n          },\n          {\n           \"lane\": 0,\n           \"c\": 14\n          }\n         ]\n        }\n       ]\n      }\n     }\n    },\n    {\n     \"id\": \"second-fall-new-shimmer\",\n     \"phaseId\": \"another-way-across\",\n     \"currentVersionId\": \"B\",\n     \"songs\": {\n      \"A\": {\n       \"v\": 3,\n       \"meta\": {\n        \"title\": null,\n        \"created\": 0,\n        \"updated\": 0,\n        \"author\": null\n       },\n       \"palette\": \"pentatonic\",\n       \"time\": {\n        \"cols\": 16,\n        \"tempo\": 108,\n        \"groove\": 0\n       },\n       \"tracks\": [\n        {\n         \"kind\": \"melody\",\n         \"voice\": \"musicbox\",\n         \"notes\": [\n          {\n           \"p\": 60,\n           \"c\": 0,\n           \"len\": 1\n          },\n          {\n           \"p\": 62,\n           \"c\": 2,\n           \"len\": 1\n          },\n          {\n           \"p\": 64,\n           \"c\": 4,\n           \"len\": 1\n          },\n          {\n           \"p\": 67,\n           \"c\": 6,\n           \"len\": 1\n          }\n         ]\n        },\n        {\n         \"kind\": \"drums\",\n         \"hits\": [\n          {\n           \"lane\": 0,\n           \"c\": 0\n          },\n          {\n           \"lane\": 0,\n           \"c\": 4\n          },\n          {\n           \"lane\": 0,\n           \"c\": 8\n          },\n          {\n           \"lane\": 0,\n           \"c\": 12\n          }\n         ]\n        }\n       ]\n      },\n      \"B\": {\n       \"v\": 3,\n       \"meta\": {\n        \"title\": null,\n        \"created\": 0,\n        \"updated\": 0,\n        \"author\": null\n       },\n       \"palette\": \"pentatonic\",\n       \"time\": {\n        \"cols\": 16,\n        \"tempo\": 108,\n        \"groove\": 0\n       },\n       \"tracks\": [\n        {\n         \"kind\": \"melody\",\n         \"voice\": \"musicbox\",\n         \"notes\": [\n          {\n           \"p\": 67,\n           \"c\": 0,\n           \"len\": 1\n          },\n          {\n           \"p\": 64,\n           \"c\": 2,\n           \"len\": 1\n          },\n          {\n           \"p\": 62,\n           \"c\": 4,\n           \"len\": 1\n          },\n          {\n           \"p\": 60,\n           \"c\": 6,\n           \"len\": 1\n          }\n         ]\n        },\n        {\n         \"kind\": \"drums\",\n         \"hits\": [\n          {\n           \"lane\": 2,\n           \"c\": 0\n          },\n          {\n           \"lane\": 2,\n           \"c\": 2\n          },\n          {\n           \"lane\": 2,\n           \"c\": 4\n          },\n          {\n           \"lane\": 2,\n           \"c\": 6\n          },\n          {\n           \"lane\": 2,\n           \"c\": 8\n          },\n          {\n           \"lane\": 2,\n           \"c\": 10\n          },\n          {\n           \"lane\": 2,\n           \"c\": 12\n          },\n          {\n           \"lane\": 2,\n           \"c\": 14\n          }\n         ]\n        }\n       ]\n      }\n     }\n    }\n   ]\n  },\n  {\n   \"v\": 3,\n   \"id\": \"waking-woods\",\n   \"author\": {\n    \"kind\": \"official\",\n    \"id\": \"tune-garden\"\n   },\n   \"kind\": \"guided-commission\",\n   \"title\": \"The Waking Woods\",\n   \"brief\": {\n    \"worldText\": \"Hopper says the woods are still asleep. Three stones mark the way, and a tune has to reach every one.\",\n    \"intentionText\": \"Make a tune that lands on the beat, then make a second walk and choose the one to give the woods.\"\n   },\n   \"prerequisites\": {\n    \"earnedByPackageIds\": [\n     \"intro\",\n     \"footsteps\"\n    ]\n   },\n   \"capabilityIds\": [\n    \"melody-making\",\n    \"steady-pulse\"\n   ],\n   \"workspace\": {\n    \"paletteId\": \"pentatonic\",\n    \"columns\": 16,\n    \"grooveId\": \"straight\",\n    \"controlIds\": [\n     \"drums\",\n     \"loop\"\n    ],\n    \"toolGrants\": []\n   },\n   \"setup\": {\n    \"kind\": \"waypoints\",\n    \"count\": 3,\n    \"minGap\": 4,\n    \"edgeMargin\": 2,\n    \"rowMargin\": 1,\n    \"minRowSpread\": 2,\n    \"maxRowSpread\": 4,\n    \"fragments\": [\n     [\n      {\n       \"lane\": 0,\n       \"c\": 0\n      },\n      {\n       \"lane\": 1,\n       \"c\": 2\n      }\n     ],\n     [\n      {\n       \"lane\": 0,\n       \"c\": 0\n      },\n      {\n       \"lane\": 1,\n       \"c\": 3\n      }\n     ],\n     [\n      {\n       \"lane\": 1,\n       \"c\": 1\n      },\n      {\n       \"lane\": 1,\n       \"c\": 2\n      }\n     ],\n     [\n      {\n       \"lane\": 0,\n       \"c\": 0\n      },\n      {\n       \"lane\": 2,\n       \"c\": 1\n      }\n     ],\n     [\n      {\n       \"lane\": 2,\n       \"c\": 0\n      },\n      {\n       \"lane\": 2,\n       \"c\": 1\n      },\n      {\n       \"lane\": 1,\n       \"c\": 3\n      }\n     ],\n     [\n      {\n       \"lane\": 0,\n       \"c\": 0\n      },\n      {\n       \"lane\": 2,\n       \"c\": 2\n      },\n      {\n       \"lane\": 2,\n       \"c\": 3\n      }\n     ]\n    ]\n   },\n   \"phases\": [\n    {\n     \"id\": \"wake-the-woods\",\n     \"name\": \"Wake the woods\",\n     \"type\": \"compose\",\n     \"versionId\": \"A\",\n     \"worldText\": \"Three stones wait under the trees, and Hopper has taken the first few steps. Make a tune that reaches all three stones, stepping in time with Hopper's footsteps.\",\n     \"intentionText\": \"Keep the ringed stones and Hopper's opening drum hits. Put notes around the stones, with one on every glowing column, and carry the drums on in your own way.\",\n     \"procedure\": {\n      \"gateIds\": [\n       \"playback.complete-since-last-edit\"\n      ],\n      \"transitionId\": \"fork-version\",\n      \"buttonLabel\": \"Give the woods a second walk\"\n     },\n     \"challenge\": {\n      \"id\": \"tune-over-footsteps\",\n      \"capabilityIds\": [\n       \"melody-making\",\n       \"steady-pulse\"\n      ],\n      \"routes\": [\n       {\n        \"id\": \"walk-on-main-beats\",\n        \"witnessIds\": [\n         \"woods-main-beats\"\n        ],\n        \"observations\": [\n         {\n          \"analyzerId\": \"phrase.on-every-beat\",\n          \"params\": {},\n          \"descriptorId\": \"way-tune-on-beats\"\n         },\n         {\n          \"analyzerId\": \"pulse.kick-on-main-beats\",\n          \"params\": {},\n          \"descriptorId\": \"way-pulse-main-kicks\"\n         }\n        ]\n       },\n       {\n        \"id\": \"walk-the-even-eight\",\n        \"witnessIds\": [\n         \"woods-even-eight\"\n        ],\n        \"observations\": [\n         {\n          \"analyzerId\": \"phrase.on-every-beat\",\n          \"params\": {},\n          \"descriptorId\": \"way-tune-on-beats\"\n         },\n         {\n          \"analyzerId\": \"pulse.even-walk\",\n          \"params\": {},\n          \"descriptorId\": \"way-pulse-even-kicks\"\n         }\n        ]\n       },\n       {\n        \"id\": \"walk-under-shimmer\",\n        \"witnessIds\": [\n         \"woods-shimmer\"\n        ],\n        \"observations\": [\n         {\n          \"analyzerId\": \"phrase.on-every-beat\",\n          \"params\": {},\n          \"descriptorId\": \"way-tune-on-beats\"\n         },\n         {\n          \"analyzerId\": \"pulse.hat-shimmer\",\n          \"params\": {},\n          \"descriptorId\": \"way-pulse-hat-shimmer\"\n         }\n        ]\n       }\n      ]\n     }\n    },\n    {\n     \"id\": \"walk-it-again\",\n     \"name\": \"Walk it again\",\n     \"type\": \"transform\",\n     \"sourceVersionId\": \"A\",\n     \"versionId\": \"B\",\n     \"worldText\": \"The woods know that walk now. Show them a second one over the same stones.\",\n     \"intentionText\": \"Keep the ringed stones and Hopper's opening drum hits. Change the tune, the drums after the opening, or both. Try a note on every glowing column.\",\n     \"procedure\": {\n      \"gateIds\": [\n       \"edit.after-fork\",\n       \"playback.complete-since-last-edit\"\n      ],\n      \"transitionId\": \"advance\",\n      \"buttonLabel\": \"Compare both walks\"\n     },\n     \"challenge\": {\n      \"id\": \"same-woods-new-walk\",\n      \"capabilityIds\": [\n       \"melody-making\",\n       \"steady-pulse\"\n      ],\n      \"routes\": [\n       {\n        \"id\": \"kept-the-beat\",\n        \"witnessIds\": [\n         \"woods-kept-the-beat\"\n        ],\n        \"observations\": [\n         {\n          \"analyzerId\": \"phrase.on-every-beat\",\n          \"params\": {},\n          \"descriptorId\": \"way-tune-on-beats\"\n         },\n         {\n          \"analyzerId\": \"pulse.same-steady-family-as-snapshot\",\n          \"params\": {\n           \"snapshotVersionId\": \"A\"\n          },\n          \"descriptorId\": \"way-pulse-kept\"\n         }\n        ]\n       },\n       {\n        \"id\": \"changed-the-beat\",\n        \"witnessIds\": [\n         \"woods-changed-the-beat\"\n        ],\n        \"observations\": [\n         {\n          \"analyzerId\": \"phrase.on-every-beat\",\n          \"params\": {},\n          \"descriptorId\": \"way-tune-on-beats\"\n         },\n         {\n          \"analyzerId\": \"pulse.differs-steady-family-from-snapshot\",\n          \"params\": {\n           \"snapshotVersionId\": \"A\"\n          },\n          \"descriptorId\": \"way-pulse-changed\"\n         }\n        ]\n       }\n      ]\n     }\n    },\n    {\n     \"id\": \"choose-the-walk\",\n     \"name\": \"Choose the walk\",\n     \"type\": \"compare-offer\",\n     \"versionIds\": [\n      \"A\",\n      \"B\"\n     ],\n     \"worldText\": \"Both walks are awake. Tap each one to hear it, and keep the walk the woods should have.\",\n     \"intentionText\": \"Tap a walk to hear it — the one lit is the one you are holding. Play it right through, then give it to the woods.\",\n     \"procedure\": {\n      \"gateIds\": [\n       \"comparison.auditioned-both\",\n       \"comparison.chosen\",\n       \"playback.complete-since-last-edit\"\n      ],\n      \"transitionId\": \"offer\"\n     },\n     \"reflection\": {\n      \"promptText\": \"Which walk sounds more like the woods waking up?\",\n      \"choices\": [\n       {\n        \"id\": \"A\",\n        \"label\": \"Walk A\"\n       },\n       {\n        \"id\": \"B\",\n        \"label\": \"Walk B\"\n       }\n      ]\n     }\n    }\n   ],\n   \"completion\": {\n    \"actionId\": \"offer-song\",\n    \"payoffId\": \"saved-song\",\n    \"label\": \"Give this walk to the woods\",\n    \"defaultTitle\": \"The Waking Woods\",\n    \"completionText\": \"Hopper takes your walk into the trees, and the woods keep it.\"\n   },\n   \"presentation\": {\n    \"themeId\": \"deep-woods\",\n    \"regionId\": \"pulse-woods\",\n    \"cardText\": \"A walk to wake the woods\",\n    \"estimateMinutes\": 10,\n    \"priority\": 20\n   },\n   \"cast\": [\n    {\n     \"regionId\": \"pulse-woods\",\n     \"capabilityId\": \"steady-pulse\"\n    }\n   ],\n   \"witnesses\": [\n    {\n     \"id\": \"woods-main-beats\",\n     \"phaseId\": \"wake-the-woods\",\n     \"currentVersionId\": \"A\",\n     \"songs\": {\n      \"A\": {\n       \"v\": 3,\n       \"meta\": {\n        \"title\": null,\n        \"created\": 0,\n        \"updated\": 0,\n        \"author\": null\n       },\n       \"palette\": \"pentatonic\",\n       \"time\": {\n        \"cols\": 16,\n        \"tempo\": 108,\n        \"groove\": 0\n       },\n       \"tracks\": [\n        {\n         \"kind\": \"melody\",\n         \"voice\": \"musicbox\",\n         \"notes\": [\n          {\n           \"p\": 60,\n           \"c\": 0,\n           \"len\": 1\n          },\n          {\n           \"p\": 64,\n           \"c\": 2,\n           \"len\": 1\n          },\n          {\n           \"p\": 67,\n           \"c\": 4,\n           \"len\": 1\n          },\n          {\n           \"p\": 72,\n           \"c\": 6,\n           \"len\": 1\n          },\n          {\n           \"p\": 72,\n           \"c\": 8,\n           \"len\": 1\n          },\n          {\n           \"p\": 72,\n           \"c\": 12,\n           \"len\": 1\n          }\n         ]\n        },\n        {\n         \"kind\": \"drums\",\n         \"hits\": [\n          {\n           \"lane\": 0,\n           \"c\": 0\n          },\n          {\n           \"lane\": 0,\n           \"c\": 4\n          },\n          {\n           \"lane\": 0,\n           \"c\": 8\n          },\n          {\n           \"lane\": 0,\n           \"c\": 12\n          }\n         ]\n        }\n       ]\n      }\n     }\n    },\n    {\n     \"id\": \"woods-even-eight\",\n     \"phaseId\": \"wake-the-woods\",\n     \"currentVersionId\": \"A\",\n     \"songs\": {\n      \"A\": {\n       \"v\": 3,\n       \"meta\": {\n        \"title\": null,\n        \"created\": 0,\n        \"updated\": 0,\n        \"author\": null\n       },\n       \"palette\": \"pentatonic\",\n       \"time\": {\n        \"cols\": 16,\n        \"tempo\": 108,\n        \"groove\": 0\n       },\n       \"tracks\": [\n        {\n         \"kind\": \"melody\",\n         \"voice\": \"musicbox\",\n         \"notes\": [\n          {\n           \"p\": 72,\n           \"c\": 0,\n           \"len\": 1\n          },\n          {\n           \"p\": 67,\n           \"c\": 2,\n           \"len\": 1\n          },\n          {\n           \"p\": 64,\n           \"c\": 4,\n           \"len\": 1\n          },\n          {\n           \"p\": 60,\n           \"c\": 6,\n           \"len\": 1\n          },\n          {\n           \"p\": 60,\n           \"c\": 8,\n           \"len\": 1\n          },\n          {\n           \"p\": 60,\n           \"c\": 12,\n           \"len\": 1\n          }\n         ]\n        },\n        {\n         \"kind\": \"drums\",\n         \"hits\": [\n          {\n           \"lane\": 0,\n           \"c\": 0\n          },\n          {\n           \"lane\": 0,\n           \"c\": 2\n          },\n          {\n           \"lane\": 0,\n           \"c\": 4\n          },\n          {\n           \"lane\": 0,\n           \"c\": 6\n          },\n          {\n           \"lane\": 0,\n           \"c\": 8\n          },\n          {\n           \"lane\": 0,\n           \"c\": 10\n          },\n          {\n           \"lane\": 0,\n           \"c\": 12\n          },\n          {\n           \"lane\": 0,\n           \"c\": 14\n          }\n         ]\n        }\n       ]\n      }\n     }\n    },\n    {\n     \"id\": \"woods-shimmer\",\n     \"phaseId\": \"wake-the-woods\",\n     \"currentVersionId\": \"A\",\n     \"songs\": {\n      \"A\": {\n       \"v\": 3,\n       \"meta\": {\n        \"title\": null,\n        \"created\": 0,\n        \"updated\": 0,\n        \"author\": null\n       },\n       \"palette\": \"pentatonic\",\n       \"time\": {\n        \"cols\": 16,\n        \"tempo\": 108,\n        \"groove\": 0\n       },\n       \"tracks\": [\n        {\n         \"kind\": \"melody\",\n         \"voice\": \"musicbox\",\n         \"notes\": [\n          {\n           \"p\": 60,\n           \"c\": 0,\n           \"len\": 1\n          },\n          {\n           \"p\": 67,\n           \"c\": 2,\n           \"len\": 1\n          },\n          {\n           \"p\": 60,\n           \"c\": 4,\n           \"len\": 1\n          },\n          {\n           \"p\": 67,\n           \"c\": 6,\n           \"len\": 1\n          },\n          {\n           \"p\": 67,\n           \"c\": 8,\n           \"len\": 1\n          },\n          {\n           \"p\": 67,\n           \"c\": 12,\n           \"len\": 1\n          }\n         ]\n        },\n        {\n         \"kind\": \"drums\",\n         \"hits\": [\n          {\n           \"lane\": 2,\n           \"c\": 0\n          },\n          {\n           \"lane\": 2,\n           \"c\": 2\n          },\n          {\n           \"lane\": 2,\n           \"c\": 4\n          },\n          {\n           \"lane\": 2,\n           \"c\": 6\n          },\n          {\n           \"lane\": 2,\n           \"c\": 8\n          },\n          {\n           \"lane\": 2,\n           \"c\": 10\n          },\n          {\n           \"lane\": 2,\n           \"c\": 12\n          },\n          {\n           \"lane\": 2,\n           \"c\": 14\n          }\n         ]\n        }\n       ]\n      }\n     }\n    },\n    {\n     \"id\": \"woods-kept-the-beat\",\n     \"phaseId\": \"walk-it-again\",\n     \"currentVersionId\": \"B\",\n     \"songs\": {\n      \"A\": {\n       \"v\": 3,\n       \"meta\": {\n        \"title\": null,\n        \"created\": 0,\n        \"updated\": 0,\n        \"author\": null\n       },\n       \"palette\": \"pentatonic\",\n       \"time\": {\n        \"cols\": 16,\n        \"tempo\": 108,\n        \"groove\": 0\n       },\n       \"tracks\": [\n        {\n         \"kind\": \"melody\",\n         \"voice\": \"musicbox\",\n         \"notes\": [\n          {\n           \"p\": 60,\n           \"c\": 0,\n           \"len\": 1\n          },\n          {\n           \"p\": 64,\n           \"c\": 2,\n           \"len\": 1\n          },\n          {\n           \"p\": 67,\n           \"c\": 4,\n           \"len\": 1\n          },\n          {\n           \"p\": 72,\n           \"c\": 6,\n           \"len\": 1\n          },\n          {\n           \"p\": 72,\n           \"c\": 8,\n           \"len\": 1\n          },\n          {\n           \"p\": 72,\n           \"c\": 12,\n           \"len\": 1\n          }\n         ]\n        },\n        {\n         \"kind\": \"drums\",\n         \"hits\": [\n          {\n           \"lane\": 0,\n           \"c\": 0\n          },\n          {\n           \"lane\": 0,\n           \"c\": 4\n          },\n          {\n           \"lane\": 0,\n           \"c\": 8\n          },\n          {\n           \"lane\": 0,\n           \"c\": 12\n          }\n         ]\n        }\n       ]\n      },\n      \"B\": {\n       \"v\": 3,\n       \"meta\": {\n        \"title\": null,\n        \"created\": 0,\n        \"updated\": 0,\n        \"author\": null\n       },\n       \"palette\": \"pentatonic\",\n       \"time\": {\n        \"cols\": 16,\n        \"tempo\": 108,\n        \"groove\": 0\n       },\n       \"tracks\": [\n        {\n         \"kind\": \"melody\",\n         \"voice\": \"musicbox\",\n         \"notes\": [\n          {\n           \"p\": 72,\n           \"c\": 0,\n           \"len\": 1\n          },\n          {\n           \"p\": 67,\n           \"c\": 2,\n           \"len\": 1\n          },\n          {\n           \"p\": 64,\n           \"c\": 4,\n           \"len\": 1\n          },\n          {\n           \"p\": 60,\n           \"c\": 6,\n           \"len\": 1\n          },\n          {\n           \"p\": 60,\n           \"c\": 8,\n           \"len\": 1\n          },\n          {\n           \"p\": 60,\n           \"c\": 12,\n           \"len\": 1\n          }\n         ]\n        },\n        {\n         \"kind\": \"drums\",\n         \"hits\": [\n          {\n           \"lane\": 0,\n           \"c\": 0\n          },\n          {\n           \"lane\": 0,\n           \"c\": 4\n          },\n          {\n           \"lane\": 0,\n           \"c\": 8\n          },\n          {\n           \"lane\": 0,\n           \"c\": 12\n          }\n         ]\n        }\n       ]\n      }\n     }\n    },\n    {\n     \"id\": \"woods-changed-the-beat\",\n     \"phaseId\": \"walk-it-again\",\n     \"currentVersionId\": \"B\",\n     \"songs\": {\n      \"A\": {\n       \"v\": 3,\n       \"meta\": {\n        \"title\": null,\n        \"created\": 0,\n        \"updated\": 0,\n        \"author\": null\n       },\n       \"palette\": \"pentatonic\",\n       \"time\": {\n        \"cols\": 16,\n        \"tempo\": 108,\n        \"groove\": 0\n       },\n       \"tracks\": [\n        {\n         \"kind\": \"melody\",\n         \"voice\": \"musicbox\",\n         \"notes\": [\n          {\n           \"p\": 60,\n           \"c\": 0,\n           \"len\": 1\n          },\n          {\n           \"p\": 64,\n           \"c\": 2,\n           \"len\": 1\n          },\n          {\n           \"p\": 67,\n           \"c\": 4,\n           \"len\": 1\n          },\n          {\n           \"p\": 72,\n           \"c\": 6,\n           \"len\": 1\n          },\n          {\n           \"p\": 72,\n           \"c\": 8,\n           \"len\": 1\n          },\n          {\n           \"p\": 72,\n           \"c\": 12,\n           \"len\": 1\n          }\n         ]\n        },\n        {\n         \"kind\": \"drums\",\n         \"hits\": [\n          {\n           \"lane\": 0,\n           \"c\": 0\n          },\n          {\n           \"lane\": 0,\n           \"c\": 4\n          },\n          {\n           \"lane\": 0,\n           \"c\": 8\n          },\n          {\n           \"lane\": 0,\n           \"c\": 12\n          }\n         ]\n        }\n       ]\n      },\n      \"B\": {\n       \"v\": 3,\n       \"meta\": {\n        \"title\": null,\n        \"created\": 0,\n        \"updated\": 0,\n        \"author\": null\n       },\n       \"palette\": \"pentatonic\",\n       \"time\": {\n        \"cols\": 16,\n        \"tempo\": 108,\n        \"groove\": 0\n       },\n       \"tracks\": [\n        {\n         \"kind\": \"melody\",\n         \"voice\": \"musicbox\",\n         \"notes\": [\n          {\n           \"p\": 60,\n           \"c\": 0,\n           \"len\": 1\n          },\n          {\n           \"p\": 64,\n           \"c\": 2,\n           \"len\": 1\n          },\n          {\n           \"p\": 67,\n           \"c\": 4,\n           \"len\": 1\n          },\n          {\n           \"p\": 72,\n           \"c\": 6,\n           \"len\": 1\n          },\n          {\n           \"p\": 72,\n           \"c\": 8,\n           \"len\": 1\n          },\n          {\n           \"p\": 72,\n           \"c\": 12,\n           \"len\": 1\n          }\n         ]\n        },\n        {\n         \"kind\": \"drums\",\n         \"hits\": [\n          {\n           \"lane\": 0,\n           \"c\": 0\n          },\n          {\n           \"lane\": 0,\n           \"c\": 2\n          },\n          {\n           \"lane\": 0,\n           \"c\": 4\n          },\n          {\n           \"lane\": 0,\n           \"c\": 6\n          },\n          {\n           \"lane\": 0,\n           \"c\": 8\n          },\n          {\n           \"lane\": 0,\n           \"c\": 10\n          },\n          {\n           \"lane\": 0,\n           \"c\": 12\n          },\n          {\n           \"lane\": 0,\n           \"c\": 14\n          }\n         ]\n        }\n       ]\n      }\n     }\n    }\n   ]\n  }\n ]\n}";

