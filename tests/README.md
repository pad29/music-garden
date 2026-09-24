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

## Quest setup and playtest mutation audit

```bash
node tests/questsetup-mutations.mjs
node tests/questsetup-mutations.mjs --e6-only
node tests/questsetup-mutations.mjs --playtest-only
node tests/questsetup-mutations.mjs --fragments-only
node tests/questsetup-mutations.mjs --g-only
```

`quest-fragments.test.mjs` covers step F's opening drum fragment: the pool grammar and the refusal of a
composite single attack, the catalog's proof (exhaustive over every legal short fragment at every legal
width, executing the real drum predicates on every ordered snapshot pair), the draw coming last so a pool
never moves a seed's stones, instance integrity against a tampered hydrated run, the drum readiness
(an ending rest is allowed; column 3 is not a continuation), silent versus unnamed drums, and the ring
wiring on `.dcell` pads. `completeDealtSong` restores the dealt opening and adds one continuation snare
that names no pulse family, so fixtures written to be unmatched stay unmatched — it completes the task
the player is held to rather than loosening it. `helpers/quest-fragment-mutations.mjs` supplies the faults.

Step G extends both authoring workspace tests with `loadNoLoopWoods`: a uniquely named Woods clone,
loaded alongside the official definitions through `loadQuestCatalog`. The tests enter Firefly, the
clone, then Woods (loop on → off → on), checking scope features, the level envelope and the actual
loop default. Official land, cast, prerequisites and analyzer checks remain. Both tests are audited
against a copied Firefly envelope/features, forced loop booleans and retained loop state.

`quest-g.test.mjs` tests the shared missing/editable vocabulary boundary without snapshotting its
sentences, including an explicit drum-hit subject for the missing-opening notice. Every old sentence
has a restoration fault. Woods' individual intention wording remains **content review**: keyword
presence cannot establish clear instructions, and the generic boundary does not apply to authored
story nouns in every quest. The reviewed lines name notes/tune and beat without footsteps/walk;
taught "even kick walk" and friends' story-tier descriptions are deliberately outside this check.

The second G test drives loop booking/clock events through the real completion session and receipt
sink in Woods: partial laps earn nothing, complete laps count at audible time, both auditions are
needed, and replaying an edited held version restores offer without re-hearing its sibling. Its audio
start boundary is replaced, so this does **not** prove scheduler wiring or audible playback. The
existing finale effect test now runs for both official quests with their actual loop-on defaults;
a Firefly-only loop reset is an audited fault. Narration still uses the existing both-quest envelope
test, with the two Woods "Keep" → "Move" mutation anchors updated. `helpers/quest-g-mutations.mjs`
joins the full audit; `--g-only` runs just these new faults.

Step G verification (2026-09-23): **510 tests pass; 406 mutations caught across 133 green tests**,
including 22 step G mutations across five tests. No game or design source was edited by this tester.

Requires Node >=22.15 for the module loader hook. The default runs the complete audit; the optional
flags select commit 6, the A7/A8 playtest, fragment, or step G faults. Each fault must have a green unmodified test and
make that exact test fail. Mutations affect the harness's script string in memory only. Syntax errors,
initialization failures, ambiguous source anchors, and missing test titles fail the audit rather than
counting as caught faults.

`questavailability.test.mjs` retains all five non-fork guarantees from the former
`questconfirm.test.mjs`: readiness/declared-gate sweeps, comparison-offer gate sweeps,
`questEvaluateRun` evidence construction and purity, the shared shell/controller evaluation seam,
and rejection of authorable confirmation gates. `continueQuest()` is now exactly one action call;
it never retries a refusal or manufactures the removed confirmation state.

`quest-playtest.test.mjs` covers whole-model route invisibility with identical descriptor tokens,
independently varied live and persisted matches, immediate matched/unmatched progression and equal
payoff, renamed quest ids, all three exclusive transform witnesses and the four keep/change
combinations, final-offer readiness exemption after an actual edit, phase/status text, the text-only
status sink, friend/path render boundaries, narration envelopes, landmark wording, and finale naming.
`helpers/quest-playtest-mutations.mjs` supplies a fault for each new guarantee. The source/sink tests
check wiring and text assignment; they do not infer rendering, audio, or background paint from stubs.

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

## A7/A8 migration record (2026-09-22)

The supplied working tree reproduced **16 failures out of 493**, rather than 17. Its pre-existing
`questsemantics.test.mjs` edit already added `second-fall-new-shimmer` to the expected witness list;
that mechanical update was preserved. The other mechanical audit updates are the rename label's
new spelling and the unsaved-edit fault's anchor after `questConfirm` was removed.

**Removed subjects:** twelve tests in `questconfirm.test.mjs` exercised the deleted fork itself:
asking once; matched-path confirmation exemption; the two prompt actions and cancellation;
confirmation-key fields; phase identity; edit/undo invalidation; leave/reload invalidation;
pick invalidation; new-run identity; gate closure while an answer was pending; comparison's
confirmation exemption; and refusing to ask before readiness/playback. Their confirmation faults
and the confirmation-only selector were deleted because A7 removes the behavior, not because they
were failing. The old controller test requiring an explicit choice now requires one press.
The former unmatched-path test's **equal-payoff guarantee** survives in the new end-to-end test.

**Preserved subjects:** the five availability/purity/grammar tests above remain. Their fixtures
no longer call `ask()` or assert `asking`/`confirmText`. The readiness and comparison sweeps keep
their combinations and button/door assertions. The shared-seam test now tests procedural shell
availability and a pre-transition controller consultation, without making route matches a gate.

**Outstanding source regression:** `the shell and controller both consume the shared evaluation seam`
is intentionally red. The shell still calls `questEvaluateRun`; `performQuestAction("continue")`
no longer does. Suppressing `questPaintField` in the test prevents a post-transition repaint from
masquerading as the controller consultation. The same migrated test was executed against pre-playtest
`HEAD:index.html` in memory and passed. This is an architectural regression in the explicitly retained
guarantee; the ordinary readiness/gate sweeps agree, and this is not evidence of a normal player's
button disagreeing with the door. No source was changed to resolve it or disguise it in a helper.

The green shell half is separately mutation-audited. The red controller regression has no green
baseline on current source and is therefore not counted as a mutation kill or silently skipped in
the normal suite. A successful mutation audit is not a claim that the full suite is green.

Verification: syntax passes; **490 of 491 tests pass**, with only the retained controller-seam
regression failing (zero skips). The complete audit catches **307 faults across 111 green tests**;
the A7/A8 subset catches **44 faults across all 10 new tests**. The pre-existing semantics fixture
change is included in these counts. `git diff --check` passes.

Read-aloud **input** is covered; actual narration, voice assets, `file://` playback, sidebar/progress
placement, collapsed ways, and gradient tiling still require real-browser observation/listening.
The owner supplied the layout verification; this tests-only round does not re-certify it or the
unheard/unseen audio and paint changes. No game, design, generated asset, or review-history file was
edited, and nothing was committed or pushed.
