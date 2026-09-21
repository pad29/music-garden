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

## Every test names the bug it catches

The standard this suite holds itself to: **a test that passes against the correct code AND against the
bug it claims to catch is a false proof.** Write the mutation into a comment above the test, then
actually apply it and watch the test fail. Doing that has caught four false proofs and one real shipped
defect (`setSaves` discarding `Store.set`'s return, so an artifact write could fail in silence).

## Scope

This suite is young. It covers the detectors; the pure seams under the quest work — the projection
(`projectTracks`), the pulse helpers' explicit-grid forms and `contourSeqFromGrid`; and the quest
engine itself — the play scope, persistence, the completion session, the QuestRun reducer, phases and
history, the sealed catalog, and the analyzer registries and semantic validator. It is not a substitute
for playing the game — it catches silent logic regressions, which are the ones runtime inspection is
worst at finding.

## Quest setup and confirmation mutation audit

```bash
node tests/questsetup-mutations.mjs
node tests/questsetup-mutations.mjs --confirm-only
node tests/questsetup-mutations.mjs --e6-only
```

Requires Node >=22.15 for the module loader hook. The default runs the complete audit; the optional
flag selects the Step E commit 4 confirmation tests. Each fault must have a green unmodified test and
make that exact test fail. Mutations affect the harness's script string in memory only. Syntax errors,
initialization failures, ambiguous source anchors, and missing test titles fail the audit rather than
counting as caught faults.

`questconfirm.test.mjs` covers the two-press unmatched-path choice, one-press matched paths, identical
completion payoff, all five confirmation key fields, edits/undo, leaving/resume, auditions, new runs,
readiness/gate combinations, comparison exemptions, and the shared evaluation seam's purity. It checks
shell models and controller state; it does not claim to verify drawn buttons or audible playback.

Older controller fixtures use `continueQuest()` when their assertion concerns something beyond the
choice. It retries exactly once for `needs-confirm`, preserving other failures. Tests of the choice
itself call `performQuestAction()` directly. The former one-press unmatched-path assertion was deliberately
changed to require the question followed by advancement, as specified by Q6.

Step E commit 6 coverage is in `questcast.test.mjs` and `questfinale.test.mjs`. It covers cast
validation and derived attribution, persisted tokens, unsaved-edit guards, rename ordering and
repair, pure models, and finale effect boundaries. `helpers/quest-e6-mutations.mjs` contributes
its faults to the same default audit; `--e6-only` selects them while developing. All anchors and
mutant syntax are checked before the sweep starts.

The harness exposes `__script`, the exact script it compiled (including in-memory audit mutations).
The collision test executes the actual descriptor-index initializer with synthetic primitives in an
isolated VM. It does not copy the indexing algorithm or change the production registry. Finale tests
spy on the transport/confetti boundaries and invoke navigation with explicit input; they do not prove
drawn overlays, focus, confetti, audible playback, or real menu routing.

`quest-e6-review.test.mjs` holds the source regressions the E6 tester found — an offer that could save a
document the store had just refused, and a path switch that discarded it. They were left **red** by the
tester rather than hidden, and are green now that the source is fixed; the saved-message regression it
found lives in `questshell.test.mjs`. `REVIEW-LOG.md` § *Step E* records what was found and what was done
about it.
