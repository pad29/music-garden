// Integration coverage for the raw-width pair-band change.
//
// These deliberately exercise the stateful paths the unit tests do not: crafting, stamping,
// placed-column classification, level goals, and a persisted (unsorted) toolbox tool.

import { test } from "node:test";
import assert from "node:assert";
import { loadGame } from "./harness.mjs";

function readyGame() {
  const g = loadGame({ fresh: true });
  // The live Craft button initializes audio before reaching craftFromCells/fusePick/fuseField.
  // Do the same here; the harness absorbs sound, but craftFromCells reads actx.currentTime.
  g.initAudio();
  return g;
}

function clearMelody(g) {
  g.modelClearMelody();
}

function put(g, r, c) {
  g.modelSetCell(r, c, true);
}

test("crafting records raw pair spans and keeps pair bookkeeping in goal bands", () => {
  const g = readyGame();

  // C4–B5 is a compound major 7th: spatially open, but it was formerly recorded as octave.
  g.craftFromCells([{ r: 0, c: 0 }, { r: 9, c: 0 }]);
  assert.deepEqual(g.ev.pairs, [{ span: 9, kind: "open", gap: 21 }]);
  assert.deepEqual(g.ev.pairKinds, ["open"]);
  assert.strictEqual(g.ev.lastPairKind, "open");
  assert.strictEqual(g.toolbox.length, 1);
  assert.deepEqual(g.toolbox[0].offs, [0, 9]);
  assert.deepEqual(g.toolbox[0].midis, [60, 81]);

  // An exact octave remains a display subtype but joins the same goal band and event kind.
  g.craftFromCells([{ r: 9, c: 1 }, { r: 4, c: 1 }]);
  assert.deepEqual(g.ev.pairs[1], { span: 5, kind: "open", gap: 12 });
  assert.deepEqual(g.ev.pairKinds, ["open", "open"]);
  assert.strictEqual(g.distinctBands(), 1, "Octave twins is not a fourth crafted band");
  assert.strictEqual(g.toolMeta(g.toolbox[1].offs, g.toolbox[1].midis).name, "Octave twins");
});

test("Fuse finds one field stack, but defers an ambiguous field to Scoop", () => {
  const one = readyGame();
  put(one, 9, 2);
  put(one, 0, 2);
  one.fuseField();
  assert.deepEqual(one.ev.pairs, [{ span: 9, kind: "open", gap: 21 }]);
  assert.strictEqual(one.toolbox.length, 1);

  const many = readyGame();
  put(many, 9, 0);
  put(many, 8, 0);
  put(many, 9, 1);
  put(many, 0, 1);
  many.fuseField();
  assert.strictEqual(many.ev.pairs.length, 0, "ambiguous stacks must not craft an arbitrary pair");
  assert.strictEqual(many.trayMode, true, "ambiguous stacks should arm Scoop");
});

test("Fuse uses the Scoop selection rather than another stack in the field", () => {
  const g = readyGame();
  // Two stacks exist; choose only the compound pair in column 1.
  put(g, 9, 0);
  put(g, 8, 0);
  put(g, 9, 1);
  put(g, 0, 1);
  g.trayMode = true;
  g.traySel = g.melTrack().notes.filter((n) => g.noteCol(n) === 1).map((n) => n.id);

  g.fusePick();

  assert.deepEqual(g.ev.pairs, [{ span: 9, kind: "open", gap: 21 }]);
  assert.deepEqual(g.toolbox[0].midis, [60, 81]);
});

test("stamping an octave twin creates an OPEN placed column", () => {
  const g = readyGame();
  g.craftFromCells([{ r: 9, c: 0 }, { r: 4, c: 0 }]);
  const octaveTool = g.toolbox[0];

  clearMelody(g);
  g.activeTool = octaveTool;
  g.stampTool(9, 3);

  assert.strictEqual(g.colBand(3), "open");
  assert.deepEqual(g.countColBands(), { close: 0, bright: 0, open: 1 });
  assert.strictEqual(g.ev.stampedTool, true);
});

// TUN-15: a stamp is the whole tool or nothing. Each case records the status line, the journal, the
// column and the goal flag, because the old bug got every one of them wrong at once.
function stampProbe(g) {
  const said = [], txs = [];
  g.setStatus = (html) => said.push(html);
  // The journal opens only through tx, and only an OUTERMOST tx makes an entry (setCell nests its own).
  const realTx = g.tx;
  let depth = 0;
  g.tx = (label, fn) => {
    if (depth === 0) txs.push(label);
    depth++;
    try { return realTx(label, fn); } finally { depth--; }
  };
  return { said, txs };
}
function column(g, c) {
  const lit = [];
  for (let r = 0; r < g.ROWS; r++) if (g.grid[r][c]) lit.push(r);
  return lit;
}

test("TUN-15: a 9-rung pair stamped at row 1 refuses instead of planting one seed", () => {
  const g = readyGame();
  g.craftFromCells([{ r: 0, c: 0 }, { r: 9, c: 0 }]);   // C4–A5, offsets [0, 9] on the 10-row field
  const tall = g.toolbox[0];
  clearMelody(g);
  g.ev.stampedTool = false;
  g.activeTool = tall;
  const { said, txs } = stampProbe(g);

  g.stampTool(1, 3);   // up: [1,-8] → flipped down: [1,10] — row 10 doesn't exist

  assert.deepEqual(column(g, 3), [], "nothing is planted");
  assert.deepEqual(txs, [], "a refusal writes no journal entry");
  assert.strictEqual(g.ev.stampedTool, false, "a refused stamp is not a stamp");
  assert.strictEqual(said.at(-1), g.STAMP_COPY.room, "the status line names the reason");
  assert.strictEqual(g.activeTool, tall, "the tool stays armed to try elsewhere");

  // …and the same tool stamps whole where it fits.
  g.stampTool(9, 3);
  assert.deepEqual(column(g, 3), [0, 9]);
  assert.deepEqual(txs, ["stamp"], "one stamp = one journal entry");
  assert.strictEqual(g.ev.stampedTool, true);
  assert.match(said.at(-1), /^Stamped!/);
});

test("TUN-15: a stamp that fits — upward, and flipped down off the top — is unchanged", () => {
  const g = readyGame();
  g.craftFromCells([{ r: 9, c: 0 }, { r: 7, c: 0 }, { r: 5, c: 0 }]);   // C4 E4 A4 on the pentatonic field, offsets [0,2,4]
  const tower = g.toolbox[0];
  clearMelody(g);
  g.activeTool = tower;

  g.stampTool(6, 2);   // upward from row 6: rows 6, 4, 2
  assert.deepEqual(column(g, 2), [2, 4, 6]);
  g.stampTool(1, 4);   // up runs off the top → flips down: rows 1, 3, 5
  assert.deepEqual(column(g, 4), [1, 3, 5]);
  assert.strictEqual(g.ev.stampedTool, true);
});

test("TUN-15: a stamp that would land on a sleeping color refuses, as cellClick does", () => {
  const g = readyGame();
  g.setPalette("diatonic");                                  // rows: 0 B5 … 7 B4 … 9 G4, 11 E4, 13 C4
  g.craftFromCells([{ r: 13, c: 0 }, { r: 11, c: 0 }, { r: 9, c: 0 }]);   // C4 E4 G4, offsets [0,2,4]
  const tower = g.toolbox[0];
  clearMelody(g);
  g.setColorReveal(["F"]);                                   // B is still asleep: rows 0 and 7
  g.ev.stampedTool = false;
  g.activeTool = tower;
  const { said, txs } = stampProbe(g);

  g.stampTool(11, 2);   // E4 G4 B4 — the tapped row is awake, the top of the shape is not
  assert.deepEqual(column(g, 2), []);
  assert.deepEqual(txs, []);
  assert.strictEqual(g.ev.stampedTool, false);
  assert.strictEqual(said.at(-1), g.STAMP_COPY.sleep);

  g.stampTool(13, 2);   // C4 E4 G4 — all awake
  assert.deepEqual(column(g, 2), [9, 11, 13]);
  assert.strictEqual(g.ev.stampedTool, true);
});

test("TUN-15: a refused stamp through cellClick leaves notes, cursor pin, journal, goals and sound alone", () => {
  const g = readyGame();
  g.craftFromCells([{ r: 0, c: 0 }, { r: 9, c: 0 }]);   // offsets [0, 9]
  const tall = g.toolbox[0];
  clearMelody(g);
  put(g, 5, 3);                    // a seed already in the destination column
  g.pinCursor(6);                  // a deliberate pin: ▶ starts here
  g.ev.stampedTool = false;
  g.ev.played = true;              // a prior goal flag a stamp would reset
  g.activeTool = tall;
  const { said, txs } = stampProbe(g);
  const sounds = [], blooms = [], saves = [];
  g.playRow = (r) => sounds.push(r);
  g.bloom = (...a) => blooms.push(a);
  g.noteEdit = (label) => saves.push(label);   // the autosave hook every journalled player edit calls

  g.cellClick(1, 3, {});

  assert.deepEqual(column(g, 3), [5], "the existing seed stays and nothing is added");
  assert.strictEqual(g.cursorPinned, true, "a refusal must not unpin the cursor");
  assert.strictEqual(g.cursorCol, 6, "a refusal must not move the cursor");
  assert.deepEqual(txs, []);
  assert.deepEqual(saves, [], "no autosave");
  assert.deepEqual(sounds, [], "no stamp sound");
  assert.deepEqual(blooms, [], "no bloom");
  assert.strictEqual(g.ev.stampedTool, false);
  assert.strictEqual(g.ev.played, true);
  assert.strictEqual(said.at(-1), g.STAMP_COPY.room);

  g.cellClick(9, 3, {});   // fits: both rows land, and now the cursor follows the hand

  assert.deepEqual(column(g, 3), [0, 5, 9]);
  assert.strictEqual(g.cursorPinned, false);
  assert.strictEqual(g.cursorCol, 3);
  assert.deepEqual(txs, ["stamp"]);
  assert.deepEqual(saves, ["stamp"]);
  assert.strictEqual(sounds.length, 2);
  assert.strictEqual(g.ev.stampedTool, true);
  assert.strictEqual(g.ev.played, false);
});

test("TUN-15: a damaged saved tool refuses without planting or throwing; a valid unsorted one stamps whole", () => {
  const g = readyGame();
  clearMelody(g);
  g.ev.stampedTool = false;
  const { said, txs } = stampProbe(g);

  for (const offs of [[], [0, "bad"], [0, 0], ["x", 2], [0, 1.5]]) {
    g.activeTool = { offs, midis: [] };
    assert.doesNotThrow(() => g.stampTool(9, 3), `offs ${JSON.stringify(offs)}`);
    assert.deepEqual(column(g, 3), [], `offs ${JSON.stringify(offs)} planted something`);
    assert.strictEqual(said.at(-1), g.STAMP_COPY.broken, `offs ${JSON.stringify(offs)}`);
  }
  g.activeTool = { offs: [], midis: [] };
  assert.doesNotThrow(() => g.cellClick(4, 3, {}), "the same through cellClick");
  assert.deepEqual(txs, []);
  assert.strictEqual(g.ev.stampedTool, false);

  g.activeTool = { offs: [9, 0], midis: [81, 60] };   // a persisted tool, unsorted
  g.stampTool(9, 3);
  assert.deepEqual(column(g, 3), [0, 9]);
  assert.strictEqual(g.ev.stampedTool, true);
});

test("TUN-15: a shape taller than the whole field refuses at both edges, without edge advice", () => {
  const g = readyGame();
  g.setPalette("diatonic");                                   // 14 rows
  g.craftFromCells([{ r: 13, c: 0 }, { r: 0, c: 0 }]);        // C4–B5, offsets [0, 13]
  const huge = g.toolbox.find((t) => Math.max(...t.offs) === 13);
  g.setPalette("pentatonic");                                 // the Studio can switch palettes under a kept toolbox
  g.ev.stampedTool = false;
  g.activeTool = huge;
  const { said, txs } = stampProbe(g);

  for (const r of [0, 9, 4]) {
    g.stampTool(r, 3);
    assert.deepEqual(column(g, 3), [], `row ${r} planted something`);
    assert.strictEqual(said.at(-1), g.STAMP_COPY.tooTall, `row ${r} gave edge advice`);
  }
  assert.deepEqual(txs, []);
  assert.strictEqual(g.ev.stampedTool, false);
});

test("placed columns count raw-width bands and ignore non-pairs", () => {
  const g = readyGame();
  // C4–D4 = close; C4–E4 = bright; C4–A5 = compound open; C4–C5 = octave/open.
  put(g, 9, 0); put(g, 8, 0);
  put(g, 9, 1); put(g, 7, 1);
  put(g, 9, 2); put(g, 0, 2);
  put(g, 9, 3); put(g, 4, 3);
  put(g, 9, 4);                         // one note: not a pair
  put(g, 9, 5); put(g, 8, 5); put(g, 7, 5); // three notes: not a pair

  assert.strictEqual(g.colBand(0), "close");
  assert.strictEqual(g.colBand(1), "bright");
  assert.strictEqual(g.colBand(2), "open");
  assert.strictEqual(g.colBand(3), "open");
  assert.strictEqual(g.colBand(4), null);
  assert.strictEqual(g.colBand(5), null);
  assert.deepEqual(g.countColBands(), { close: 1, bright: 1, open: 2 });
});

test("Twin Blooms goals recognize crafted and placed raw-width pairs", () => {
  const g = readyGame();
  const levels = g.PACKAGES["twin-blooms"].levels;
  const sameDistance = levels.find((l) => l.name === "Same Distance, New Feel");
  const gardens = levels.find((l) => l.name === "Two Gardens");
  const song = levels.find((l) => l.name === "The Twin Bloom Song");

  // One-rung close then bright crafts exercise both craftedSpanBand goals.
  g.craftFromCells([{ r: 9, c: 0 }, { r: 8, c: 0 }]);
  assert.strictEqual(sameDistance.steps[0].goals[0].chk(), true);
  g.craftFromCells([{ r: 7, c: 1 }, { r: 6, c: 1 }]);
  assert.strictEqual(sameDistance.steps[1].goals[0].chk(), true);

  clearMelody(g);
  // Three close pairs plus two compound opens and an exact octave: all six are placed columns.
  for (const c of [0, 1, 2]) { put(g, 9, c); put(g, 8, c); }
  put(g, 9, 3); put(g, 0, 3);
  put(g, 9, 4); put(g, 1, 4);
  put(g, 9, 5); put(g, 4, 5);
  assert.strictEqual(gardens.goals.find((goal) => goal.id === "close").chk(), true);
  assert.strictEqual(gardens.goals.find((goal) => goal.id === "open").chk(), true);

  clearMelody(g);
  put(g, 9, 0); put(g, 8, 0); // close
  put(g, 9, 1); put(g, 7, 1); // bright
  put(g, 9, 2); put(g, 4, 2); // exact octave, still open for the capstone
  for (const id of ["c", "b", "o"]) {
    assert.strictEqual(song.goals.find((goal) => goal.id === id).chk(), true, `capstone ${id}`);
  }
});

test("an unsorted saved pair survives persistence and still describes its real interval", () => {
  const g = readyGame();
  g.setPlayScope({ kind: "package", packageId: "twin-blooms" });
  g.levelIdx = 0;
  g.toolbox = [{ id: "temporary", offs: [0, 7], midis: [73, 60] }]; // C♯5/C4, deliberately descending

  g.savePackageProgress();   // package advancement owns the bag; settings are a separate owner now
  assert.deepEqual(g.progress.packages["twin-blooms"].toolbox, [{ offs: [0, 7], midis: [73, 60] }]);

  g.toolbox = [];
  g.loadScopeToolbox();   // one bag per scope now, not per package
  assert.deepEqual(g.toolbox, [{ offs: [0, 7], midis: [73, 60] }]);
  assert.strictEqual(g.pairKind(g.toolbox[0].midis), "open");
  assert.strictEqual(g.toolMeta(g.toolbox[0].offs, g.toolbox[0].midis).name, "Open pair");
  assert.strictEqual(g.chordName(g.toolbox[0].midis), g.chordName([60, 73]));
});

test("compound tense pairs retain their raw width after diatonic crafting", () => {
  const g = readyGame();
  g.setPalette("diatonic");
  // C4–B5 is a compound major 7th: open in spacing, clash in tension.
  g.craftFromCells([{ r: 13, c: 0 }, { r: 0, c: 0 }]);

  assert.deepEqual(g.ev.pairs, [{ span: 13, kind: "open", gap: 23 }]);
  assert.strictEqual(g.ev.lastPairKind, "open");
  assert.strictEqual(g.distinctBands(), 1);
  assert.strictEqual(g.craftedClash(), true);
  assert.strictEqual(g.toolMeta(g.toolbox[0].offs, g.toolbox[0].midis).name, "Open pair");
});
