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
  is also refused. That is the same visible-but-inert shape, but outside this ticket's words; noted for a
  Backlog ticket rather than folded in.
