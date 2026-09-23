import { loadGame } from "../harness.mjs";

// One press means one action. Never retry or synthesize the removed A7 confirmation fork.
export function continueQuest(g) {
  return g.performQuestAction("continue");
}

// Controller/shell fixtures need a reproducible usable hand. Dealer coverage uses the real
// seed space in questsetup*.test.mjs; a random refused hand must not mask a controller assertion.
export function loadQuestGame(options) {
  const g = loadGame(options), rng = g.questRng;
  g.questRng = () => rng(options?.questSeed || "fixture-4");
  return g;
}

// Complete the dealt task independently of questSetupCompletion/readiness. Preserve the fixture's
// beat and metadata; retain the opening and add a continuation without naming a pulse.
// Only early phases need adapting. Comparison edits deliberately remain free under Q6.
export function completeDealtSong(g, input) {
  const run = g.QUEST_RUNS[g.activeScope.runId];
  if (!run?.setup || run.phase === 2) return input;
  const def = g.QUEST_DEFINITIONS[run.questId], song = JSON.parse(JSON.stringify(input));
  const ladder = g.PALETTES[def.workspace.paletteId].MIDI;
  const notes = song.tracks.find(t => t.kind === "melody").notes;
  const falling = notes.length > 1 && notes[0].p > notes.at(-1).p;
  const cuts = [-1, ...run.setup.waypoints.map(p => p.col), def.workspace.columns];
  const filled = run.setup.waypoints.map(p => ({ p: ladder[p.row], c: p.col, len: 1 }));
  for (let i = 0; i < cuts.length - 1; i++) {
    const fraction = i / (cuts.length - 2);
    const row = Math.round((falling ? fraction : 1 - fraction) * (ladder.length - 1));
    filled.push({ p: ladder[row], c: Math.floor((cuts[i] + cuts[i + 1]) / 2), len: 1 });
  }
  song.tracks.find(t => t.kind === "melody").notes = filled;
  const hits = song.tracks.find(t => t.kind === "drums").hits;
  for (const hit of run.setup.fragment?.hits || [])
    if (!hits.some(h => h.lane === hit.lane && h.c === hit.c)) hits.push({ ...hit });
  if (!hits.some(h => h.c >= 4)) hits.push({ lane: 1, c: 5 });
  return song;
}
