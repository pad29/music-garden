# TUN-16 — Hide vine grips while the Scoop is armed

Branch `ao/hide-vine-grips/root` · Size S · AO session `music-garden-61`

## Plan (Claude)

- **Approach.** One condition in `renderVines()` (`js/grid.js`): a grip is drawn only when
  `body.growing && !trayMode && !choiceUp()`. `!trayMode` alone — not `growOn()` — because `growOn()` also
  ANDs `!activeTool`, and the ticket is about the Scoop; the drag path (`growOn()` in the `#vines`
  pointerdown) is not touched.
- **No new render call.** `enterTray()` flips `trayMode` and then calls `trayPaint()`, which calls
  `renderVines()`; `exitTray()` flips it back and calls `renderVines()`. So arming hides the grips and
  ✕ Done (the button, or Esc) brings them back through renders that already exist — and nothing new runs
  `renderVines()` from inside a pull (the ticket's trap, §16 2c). A pull cannot start while the Scoop is
  armed (`growOn()`), and `exitTray()` returns early when it is not, so ✕ Done can never land mid-pull.
- **Untouched by design:** stems and a picked stem's `.tsel` (drawn above the grip branch); 🌿 Grow /
  ✂ Trim, which gate on `canGrow()`/`body.growing` only (`growTrim()` repaints through `trayPaint()` while
  armed, which now draws no grip — correct).
- **Tests** (`tests/vine-grips-scoop.test.mjs`): the game loads with a recording `#vines`, a real
  `body.classList`, a write-keeping `createElement` and `#trayBtn`, and enters the real Studio
  (`openStudio()` sets `growing` itself). Grips on every seed idle; none after `enterTray()`, stems kept;
  a picked vine's stem stays `stem tsel` with no grip; an edit while armed (`setCell`) re-renders with no
  grip; `exitTray()` and the 🧺/✕ button both bring all grips back; a grip pull after ✕ Done commits
  exactly one `tx("grow")` and lengthens the vine; 🌿/✂ while armed act on the pick, one `tx("grow")` per
  press, no grip; a press on a stale grip while armed is still refused by `growOn()`.
- **Checked the tests bite:** with `!trayMode` removed, 5 of the 9 fail; the 4 that pass are the idle,
  ✕ Done, pull and refusal cases, which are unchanged behaviour.
- **Docs:** EDITOR-DESIGN §17's deferred item gets a *Fixed 2026-11-27, TUN-16* note, as TUN-14's did.

## Owner's decisions
None needed — the ticket had no open questions, and none came up.

## Choices I made that you might overrule
- `!trayMode`, not `growOn()`: grips stay drawn while a 🎒 bag tool is armed (`activeTool`), where the drag
  is also refused. That is the same visible-but-inert shape, but outside this ticket's words: filed as
  TUN-137 (Backlog) rather than folded in.

## PR review, round 1 — GPT (gpt-6.2-astra, `ask.sh fresh read-only`), on `c16e751`

Verbatim:

1. **High — Arming Scoop can detach a grip mid-pull.** In Studio, keyboard-focus Scoop, drag a grip two steps, and press Enter before releasing the pointer. `enterTray()` sets `trayMode` while `pull` is live. Its `trayPaint()` removes the captured grip, so releasing over the grid can miss `#vines` entirely. The note keeps its provisional duration, no grow reaches undo, and `growTrim()` keeps returning because `pull` is still set. This path already exists on the base and contradicts the PR’s claim about capture. Guard Scoop entry while a pull owns the grip, including entry through Fuse. Add a test that activates Scoop mid-pull, checks the original grip stays attached through the move, releases it, and then successfully arms Scoop. The current fake delivers `pointerup` directly to `#vines` even if the grip was detached. [tray.js:37](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-61/js/tray.js:37) · [pull test](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-61/tests/vine-grips-scoop.test.mjs:207)

2. **Medium — The pull test can pass with nothing to undo.** `txLog()` counts calls before the journal compares snapshots. Remove the rewind to `p.base` on release and the test still sees `["grow"]` and a five-step note, but the journal gets no entry. In the existing post-Done test, assert one new journal entry labeled `grow`, then undo and look the note up by ID to verify its original three-step duration. [pull test](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-61/tests/vine-grips-scoop.test.mjs:199)

3. **Medium — The Grow/Trim test can pass when the buttons ignore the pick.** The picked vine and the Studio cursor are both at column 0, and the test calls `growTrim()` directly. Move the cursor to the unpicked seed at column 5 and invoke the recorded Grow and Trim button handlers. After each press, assert the picked vine changed, the cursor seed kept its duration, the selected stem stayed highlighted, and there are zero grips. This also catches grips reappearing on Grow and disappearing again on Trim. [Grow/Trim test](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-61/tests/vine-grips-scoop.test.mjs:217)

4. **Low — The armed-edit test can pass without a repaint.** It starts with zero grips, adds a single-step seed with no visible stem, and checks only that there are still zero grips. Remove the existing held note through `setCell(..., false)` instead. Assert its stem disappears and grips stay absent. [armed-edit test](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-61/tests/vine-grips-scoop.test.mjs:170)

5. **Low — Cover the exit paths that distinguish the rendering rule.** Add two cases to `vine-grips-scoop.test.mjs`. With a vine picked, the first Esc should clear `.tsel` while grips stay absent, and the next Esc should restore the grips. Separately, arm a stamp through `toggleStamp(tool)` while scooping and assert the exit restores grips while the stamp is active. That case catches an accidental substitution of `growOn()` for `!trayMode` and preserves the recorded stamp decision. [Esc ladder](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-61/js/playback.js:453) · [stamp transition](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-61/js/editing.js:238)

Static review of `c16e751`. Both `trayMode` transitions repaint after assignment. `renderVines()` is the sole grip creator. The pull handler and pinch filter also read `.grip`. I found no AGENTS.md hard-invariant conflict. I did not execute the PR or edit files.

**CHANGES REQUESTED**

### My answers (fixed in the next commit)

1. **High — agreed, fixed.** Real, and it is the ticket's own trap (§16 2c): a 🧺 activation by Enter, or 🔨 Fuse's
   `fuseField()`, while a pointer still holds a grip ran `enterTray()` → `trayPaint()` → `renderVines()` and
   detached the captured grip. It predates this PR (`trayPaint()` always re-rendered), but this PR is where the
   rule "never render mid-pull" is claimed, so it is fixed here: `enterTray()` now refuses while `pull` is set and
   returns whether the Scoop is armed; `fuseField()` says its "scoop the seeds" line only when it is. Test: a pull
   in flight, then the 🧺 handler and a direct `enterTray()` — both refused, the grip still attached to `#vines`,
   the pull live; the release ends it and one undo restores the 3-step vine; then 🧺 arms with no grip.
2. **Medium — agreed, fixed.** The pull test now undoes once and looks the note up by id: the 3-step vine comes
   back and nothing else changes. With the release's rewind removed, it fails (checked).
3. **Medium — agreed, fixed.** The cursor is pinned on the other seed (column 5), and the test presses the
   recorded `#growBtn` / `#trimBtn` handlers; after each press the picked vine changed, the cursor seed did not,
   `.tsel` stayed, no grip. With `growTargets()` ignoring the pick, it fails (checked).
4. **Low — agreed, fixed.** The armed edit now digs up the vine with `setCell(..., false)`: its stem goes, no grip
   appears. With `setCell`'s `renderVines()` removed, it fails (checked).
5. **Low — agreed, both added.** Esc through the real keydown ladder: the first drops the pick (no `.tsel`, no
   grip), the second leaves and restores the grips. And `toggleStamp()` while scooping: the Scoop exits, the
   stamp is armed, the grips are drawn — the test names TUN-137, which will flip that assertion. With
   `growOn()` substituted for `!trayMode`, it fails (checked).

Mutation checks after the round: no `pull` guard → 1 fails; no rewind on release → 2; pick ignored → 1;
`setCell` without a render → 1; `growOn()` for `!trayMode` → 1. 12/12 pass on the fix.
