// Regressions discovered during E6 review. Keep real failures visible; source is owner-only.
import { test } from "node:test";
import assert from "node:assert";
import { compare, failEdit, clone } from "./helpers/quest-e6-fixtures.mjs";

test("a failed comparison edit cannot be offered as an older saved document", t=>{
  const f=compare(t), {g,run}=f, {field}=failEdit(f);
  assert.strictEqual(g.questLastRendered.unsaved,true);
  // Independent checks: neither an enabled button nor the door may promise to save this live edit.
  const enabled=g.questLastRendered.actions.find(a=>a.id==="offer").enabled;
  const result=g.performQuestAction("offer");
  assert.deepEqual({enabled,result},{enabled:false,result:{ok:false,code:"unsaved-edit"}});
  assert.strictEqual(run().status,"active");
  assert.deepEqual(g.currentSong().tracks,field);
});

test("switching paths cannot silently discard a failed edit", t=>{
  const f=compare(t),{g,run}=f,{field}=failEdit(f);
  const before=clone(run());
  const result=g.performQuestAction("pick",{versionId:"A"});
  // A refused switch is the existing unsaved-edit policy; an explicit saved recovery could also work,
  // but this controller performs neither. The stored B and the live B must not both lose the note.
  assert.deepEqual(result,{ok:false,code:"unsaved-edit"});
  assert.deepEqual(run(),before);assert.deepEqual(g.currentSong().tracks,field);
  // …and the toggle that would have discarded it goes dark, rather than refusing under the finger.
  // A lit control that says no is the defect this whole step started from.
  assert.deepEqual(g.questLastRendered.paths.map(p=>[p.versionId,p.enabled]),[["A",false],["B",true]]);
});

test("the unsaved exit explanation still says the change was not saved", t=>{
  // The line named the ☰ menu until the third playtest, when the owner asked for the route back out
  // of it — "the player already knows it, and it makes the line too long" (QUESTS.md Q11/A5, refined).
  // What must survive is the honesty: a warning that does not say a write failed is worse than none,
  // and it must still tell the player that leaving is a thing they may do.
  const f=compare(t);failEdit(f);
  assert.match(f.g.questLastRendered.exitText,/could not be saved/);
  assert.match(f.g.questLastRendered.exitText,/lost if you left/);
});
