# Tests

```bash
node --test "tests/*.test.mjs"
```

Zero dependencies — Node's built-in test runner, matching the game's own no-dependency rule.
Nothing to install.

## What this can and can't test

The whole game is one `<script>` tag inside `index.html`, and that script does a lot of DOM
wiring the moment it loads. `harness.mjs` runs it inside a `node:vm` context with stubbed
browser globals, then hands back every top-level binding it declared (~690 of them).

That makes the **pure logic** testable — and that's most of the interesting code:

- contour and motion detectors (`contourSeq`, `isRising`, `extrema`, `isStepwise`, …)
- interval / chord / cadence helpers (`widthBand`, `stableMidis`, `chordSyms`, `hasChordRun`, …)
- palette maths (`setPalette`, `MIDI`/`NAMES`/`ROWS`)
- the song save/share format, density and rhythm detectors, level goal `chk` functions

It does **not** make rendering or audio testable. The DOM and Web Audio stubs absorb calls and
return more stubs; nothing is drawn and nothing is heard. Never write a test asserting on what
got rendered or played — verify that in a real browser (AGENTS.md § "How changes are verified").

## Writing a test

```js
import { test } from "node:test";
import assert from "node:assert";
import { loadGame, plant } from "./harness.mjs";

const g = loadGame();

test("a rising line reads as rising", () => {
  const seq = plant(g, [0, 1, 2, 3, 4]);   // ladder rows, 0 = bottom; null = empty column
  assert.strictEqual(g.isRising(seq), true);
});
```

`plant(g, rows)` clears the melody grid, plants one note per column, and returns the resulting
contour. Use it instead of poking `g.grid` directly.

## Gotchas that will bite you

- **Use `node:assert`, not `node:assert/strict`, for deep comparisons.** Arrays and objects
  created inside the vm carry the vm realm's prototypes, so `deepStrictEqual` fails on values
  that are structurally identical. `assert.deepEqual` ignores prototypes and is correct here.
  `strictEqual` is fine for primitives.
- **The game is one big shared state.** `loadGame()` is cached per test file, so tests in the
  same file see each other's grid. Call `plant()` at the start of every test. If a test mutates
  something global and hard to undo — `setPalette`, progress, the toolbox — use
  `loadGame({ fresh: true })` to get an unmutated copy.
- **Detector signatures are inconsistent by design.** Contour detectors take a `seq`
  (`isRising(seq)`); motion detectors read the grid themselves (`isStepwise()`). Check the
  source before assuming.
- **`fetch`/`XMLHttpRequest` are deliberately absent from the harness.** `index.html` must never
  use them for local assets (AGENTS.md hard invariant). If a test dies on a missing `fetch`,
  that is a real bug in the game, not a missing stub.
- **If the harness throws on load** because the game touched a browser API that isn't stubbed,
  add the stub to `harness.mjs`. Do not weaken `index.html` to satisfy the harness.

## Scope

This suite is young. It covers the detectors, and the pure seams under the quest work — the
projection (`projectTracks`) and the pulse helpers' explicit-grid forms. It is not a substitute for playing the game —
it catches silent logic regressions, which are the ones runtime inspection is worst at finding.
