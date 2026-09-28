// Optional proof audit: node tests/famous-meter-mutations.mjs
// Reuses the repository's in-memory hook. Never changes index.html, a script file or the harness on disk.
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { gameScripts, applyPatches, countAcross, checkSyntax } from "./helpers/game-scripts.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
// The game's scripts, in document order. Anchors are unique across all of them and patched where they live.
const { scripts } = gameScripts();
const title = suffix => "famous review: " + suffix;
const faults = [
  ["loaded songs survive slot-eight encoding and reopening without semantic drift",
    "if(s.time.meter) a.push([s.time.meter, s.time.origin||0]);",
    "a.push(s.time.meter ? [s.time.meter, s.time.origin||0] : null);"],
  ["every Jukebox button loads before starting and clears stale playback state",
    'mkBtn("▶ Play",()=>playSong(famousToSong(id)))',
    'mkBtn("▶ Play",()=>playSong(famousToSong("mary")))'],
  ["every Jukebox button loads before starting and clears stale playback state",
    "function playSong(s){ loadSong(s); start();", "function playSong(s){ start(); loadSong(s);"],
  ["every Jukebox button loads before starting and clears stale playback state",
    "function playSong(s){ loadSong(s); start();", "function playSong(s){ loadSong(s); start({countIn:true});"],
  ["loaded songs survive slot-eight encoding and reopening without semantic drift",
    "time.origin=+meter[1]||0;", "time.origin=0;"],
  ["loaded songs survive slot-eight encoding and reopening without semantic drift",
    "const notes=(mel.notes||[]).map(n=> n.len===1?[n.p,n.c]:[n.p,n.c,n.len]);",
    "const notes=(mel.notes||[]).map(n=> [n.p,n.c]);"],
  ["old famous saves and eight-slot links are not silently upgraded from the catalog",
    'function loadSong(s){ overlay.style.display="none";',
    'function loadSong(s){ if(s.meta && s.meta.famous) s=famousToSong(s.meta.famous); overlay.style.display="none";'],
  ["loading clears history but later edits undo and redo around the held metered song",
    "function openStudioWith(song){ openStudio(); if(song) applySong(song); journalClear(); }",
    "function openStudioWith(song){ openStudio(); if(song) applySong(song); }"],
  ["loading clears history but later edits undo and redo around the held metered song",
    "doc.meterMap = Array.isArray(s.meter) ? s.meter : [];", "doc.meterMap = [];"],
  ["loaded pickups count in on the correct phase and selected bars count from their downbeat",
    "return [{tick:0, preset, originTick:o*TICKS_PER_COL}];", "return [{tick:0, preset, originTick:0}];"],
  ["loaded pickups count in on the correct phase and selected bars count from their downbeat",
    "step = rangeOn() ? loopA() : Math.max(0,Math.min(COLS-1, cursorPinned?cursorCol:loopStart));",
    "step = Math.max(0,Math.min(COLS-1, cursorPinned?cursorCol:loopStart));"],
  ["the real scheduler keeps clicks and accents continuous across two full loops",
    'moldau: { title:"The Moldau", cols:54,', 'moldau: { title:"The Moldau", cols:52,'],
  ["the real scheduler keeps clicks and accents continuous across two full loops",
    'if(k) clickAt(tick2time(tk), k==="bar");', 'if(k) clickAt(tick2time(tk), false);'],
  ["entering each actual capstone clears a loaded meter before reveal and undo",
    "if(doc.meterMap.length){ doc.meterMap.length=0;", "if(false){ doc.meterMap.length=0;"],
  ["entering each actual capstone clears a loaded meter before reveal and undo",
    "if((curStage().famous||currentLevel().famous)!==id) return;", "if(false) return;"],
  ["transitive eligibility retains chord holds and ownerless entries use the fallback",
    "(f.chords||[]).forEach(([ms,col,len])=>ms.forEach(m=>hold(m,col,len)));",
    "(f.chords||[]).forEach(([ms,col,len])=>ms.forEach(m=>hold(m,col,1)));"],
  ["transitive eligibility retains chord holds and ownerless entries use the fallback",
    ".some(q=>vinesTaughtBy(q,seen))", '.some(q=>q==="two-kinds-of-walking")'],
  ["transitive eligibility retains chord holds and ownerless entries use the fallback",
    "n.durationTicks=Math.min(len, MAX_VINE, COLS-col)*TICKS_PER_COL;",
    "n.durationTicks=Math.min(len, MAX_VINE)*TICKS_PER_COL;"],
];
function run(name, patches = []) {
  let candidate = scripts;
  for (const [from, to] of patches) {
    assert.strictEqual(countAcross(candidate, from), 1, "unique mutation anchor: " + from);
    candidate = applyPatches(candidate, [[from, to]]);
  }
  checkSyntax(candidate);
  const pattern = "^" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$";
  const result = spawnSync(process.execPath, ["--import", "./tests/helpers/questsetup-mutation-hook.mjs",
    "--test", "--test-reporter=tap", "--test-name-pattern=" + pattern,
    "tests/famous-meter-integration.test.mjs"], {
    cwd: root, encoding: "utf8", timeout: 20000,
    env: { ...process.env, QUEST_SETUP_MUTATIONS: JSON.stringify(patches) },
  });
  assert.ifError(result.error);
  assert.strictEqual(result.signal, null);
  return result;
}
const green = new Set();
for (const [suffix, from, to] of faults) {
  const name = title(suffix);
  if (!green.has(name)) {
    const base = run(name);
    assert.strictEqual(base.status, 0, base.stdout + base.stderr);
    assert.ok(base.stdout.includes("ok 1 - " + name), "the exact baseline test must run: " + name);
    green.add(name);
  }
  const bad = run(name, [[from, to]]);
  assert.notStrictEqual(bad.status, 0, "surviving fault: " + from);
  assert.ok(bad.stdout.includes("not ok 1 - " + name), bad.stdout + bad.stderr);
  assert.ok(bad.stdout.includes("ERR_ASSERTION"), "a crash is not a behavioral assertion: " + bad.stdout + bad.stderr);
  console.log("Caught: " + suffix + " / " + from);
}
console.log(`Caught ${faults.length} faults across ${green.size} green tests. No source files mutated.`);
