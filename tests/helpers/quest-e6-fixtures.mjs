import assert from "node:assert";
import { loadQuestGame, completeDealtSong, continueQuest } from "./quest-fixtures.mjs";

export const clone = x => JSON.parse(JSON.stringify(x));
export function launch(t, questId="firefly-crossing") {
  const g=loadQuestGame({fresh:true});
  t.after(()=>{ if(g.playing)g.stop(); clearTimeout(g.autosaveT); });
  const begun=g.startQuestRun(questId); assert.strictEqual(begun.ok,true,begun.code);
  const id=begun.runId, def=g.QUEST_DEFINITIONS[questId], run=()=>g.QUEST_RUNS[id];
  const receipt=(vid=run().draft,purpose="play")=>{
    const v=run().versions[vid];
    g.onCompletePass({runId:id,versionId:vid,editRev:v.editRev,sessionId:`${vid}-${v.editRev}`,purpose});
  };
  const ready=()=>{
    const s=clone(run().versions[run().draft].song);
    s.tracks[1].hits=[{lane:1,c:run().phase+1}];
    g.applySong(completeDealtSong(g, s)); g.noteEdit("fixture"); receipt();
  };
  return {g,id,def,run,receipt,ready};
}
export function compare(t,questId) {
  const f=launch(t,questId);
  for(const phase of [0,1]) { f.ready(); assert.strictEqual(continueQuest(f.g).ok,true); }
  // Transport is a boundary spy here: fixtures issue receipts explicitly, never synthesize audio.
  f.g.start=()=>{};
  for(const versionId of ["A","B"]) {
    assert.strictEqual(f.g.performQuestAction("pick",{versionId}).ok,true);
    f.receipt(versionId,"audition");
  }
  return f;
}
export function completed(t,questId) {
  const f=compare(t,questId), result=f.g.performQuestAction("offer");
  assert.strictEqual(result.ok,true,result.code);
  return {...f,result};
}
export function failEdit(f) {
  const {g,run}=f, before=clone(run()), set=g.Store.set;
  g.Store.set=(k,v)=>k==="questRuns"?false:set(k,v);
  // Choose a free column and toggle an actual note through the editor's transaction.
  const col=2, row=g.ROWS-1;
  g.modelSetCell(row,col,!g.grid[row][col]);
  g.Store.set=set;
  assert.deepEqual(run(),before,"failed edit must not publish a run");
  assert.notDeepEqual(g.currentSong().tracks,before.versions[before.draft].song.tracks);
  return {before,field:clone(g.currentSong().tracks),marker:{runId:f.id,versionId:before.draft}};
}
