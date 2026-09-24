// Step G faults. Only the harness's source string changes; index.html is never written.
const faults = (title, pairs) => pairs.map(([from, to]) => [title, from, to]);
export const gMutations = [
  ...[
    "the second commission is data: a different land, different powers, no engine branch",
    "each official workspace is the only feature set and envelope that enters its run",
  ].flatMap(title => faults(title, [
    ['function questEnvelope(def){', 'function questEnvelope(def){ def=QUEST_DEFINITIONS["firefly-crossing"];'],
    ['loop: def.workspace.controlIds.indexOf("loop")>=0,', 'loop: true,'],
    ['loop: def.workspace.controlIds.indexOf("loop")>=0,', 'loop: false,'],
    ['palette:def.workspace.paletteId, features:def.workspace.controlIds',
      'palette:def.workspace.paletteId, features:QUEST_DEFINITIONS["firefly-crossing"].workspace.controlIds'],
    ['looping=!!L.rhythm || !!L.loop;', 'looping=looping || !!L.rhythm || !!L.loop;'],
  ])),
  ...faults("shared missing and editable sentences use task nouns rather than a quest story", [
    ['One of the ringed stones is missing.', 'One of the stepping stones is missing from the path.'],
    ['One stretch of the field has none of your notes in it.', 'There is a stretch of the path with nothing of yours in it.'],
    ['There is no beat yet.', 'There is no beat under the path yet.'],
    ['One of the opening drum hits is missing.', 'The opening beat is missing a step.'],
    ['The one lit below is the one you are holding — you can still change it.',
      'The path lit below is the one you are holding — change it as much as you like, then offer it.'],
    ['The beat stops at its opening.', 'The walk stops at its opening.'],
  ]),
  ...faults("Woods loop auditions credit complete current versions and reopen offer after an edit", [
    ['if(e.at<=now){', 'if(e.at<=now+0.02){'],
    ['const pass = ev.loops ? { firstPending:true, tracking:false, nextCol:null } : A.pass;',
      'const pass = A.pass;'],
    ['|| ((phase && phase.type==="compare-offer") ? "audition" : "play")', '|| "play"'],
    ['if(fx.purpose==="audition") ops.push', 'if(false) ops.push'],
    ['function beginCompletionSession(opts){',
      'function beginCompletionSession(opts){ if(isQuestScope() && QUEST_RUNS[activeScope.runId].questId==="waking-woods") return null;'],
  ]),
  ...faults("finale claims its key before reentrant start and clears playback constraints once", [
    ['looping=false; loopBtn.classList.toggle("on",false);',
      'if(def.id==="firefly-crossing") looping=false; loopBtn.classList.toggle("on",false);'],
  ]),
];
