# TUN-14 — Stop a lost Scoop pointer from freezing the camera

Branch `ao/scoop-pointer/root` · Size S · AO session `music-garden-58`

## Plan (Claude)

- **Approach.** One idempotent release in `js/tray.js`, `trayPtrsDrop()`: when the Scoop's pointer set
  is empty and no gesture is in flight it does nothing; otherwise it empties `trayPtrs` and runs
  `trayCancelGesture()` — the marquee box goes, the move ghosts go, `trayDrag` is cleared — and never
  commits. It leaves `traySel` (the pick), `trayPlace` (an armed copy) and `trayMode` alone, which is the
  ticket's decision already made (the spike rule, EDITOR-DESIGN §16).
- **Its exits** — the same ones `pinchDrop()` uses, registered beside the Scoop's own pointer listeners:
  `visibilitychange` (when hidden), `pagehide`, `blur`; `resetTransient` (which already runs `exitTray()`,
  so this call is belt-and-braces); and `lostpointercapture` on `trackEl`, **only for a pointer still in
  the set**. A normal release fires `pointerup` and then `lostpointercapture`; by then `trayUp` has
  deleted the pointer, so the guard makes the ordinary path a no-op and nothing a release just committed
  (a placed copy's ghost, a fresh pick) is touched.
- **No `camReseed()`.** An ordinary `trayUp` does not reseed either; the camera's take-the-wheel and
  deadband rules are out of scope.
- **Tests** (`tests/scoop-pointer.test.mjs`): the game loads with recording `addEventListener`s on the
  window, the document and `#track`, so the real handlers run. For each exit — `blur`, `pagehide`, a
  hidden `visibilitychange`, `lostpointercapture`, `resetTransient` — a pointer pressed in the Scoop and
  never released leaves `camBusy()` true, and the exit makes it false, with the pick, the armed copy and
  Scoop mode kept and the marquee gone. Plus: a visible `visibilitychange` does nothing; the release is
  idempotent; `lostpointercapture` after an ordinary `pointerup` commits the marquee pick and does not
  undo it; a second finger's lost capture ends the two-finger pan as well.
- **Found in the build:** the load gate (`js/load-gate.js`) lists every input event the game listens for,
  and its tests fail on a new one. `lostpointercapture` joins `LOAD_GATE_EVENTS` beside `pointerup` and
  `pointercancel`: before the game has loaded there is no Scoop press to strand, so swallowing it loses
  nothing.
- **Checked the tests bite:** with the fix reverted, 8 of the 12 fail (the 4 that pass are the "does
  nothing" cases, and `resetTransient`, which `exitTray()` already covered); dropping the
  `lostpointercapture` guard fails the foreign-pointer test; a release that clears the set but not the
  gesture fails 6; one that clears `trayDrag` but leaves the marquee box and the move ghosts fails 5.
- **Added while waiting for GPT:** an interrupted move — the late `pointerup` moves no seed, the ghosts are
  cleared, the pick is kept (13 tests).
