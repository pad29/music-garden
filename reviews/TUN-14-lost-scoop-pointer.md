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

## Owner's decisions
None needed — the ticket had no open questions, and none came up.

## PR review (AO: Codex, gpt-6.2-astra — temporarily GPT through `ask.sh`)
Round 1, on `eb7a98e` — **"Request changes on `eb7a98e`."** The only round (S: one round; a second needs the
owner's yes).

1. **Medium — a discarded finger can still edit the next gesture.** *"Start a two-finger Scoop pan, lose
   capture on finger B, and leave A down. Both IDs are cleared. Now press a picked seed with finger C and
   move A four columns right. A's `pointermove` still updates C's `trayDrag`, so lifting C can move the
   seed four columns. A late `pointercancel` from A can also discard C's move. Require a tracked pointer
   for active-drag updates and cancellation, while preserving idle copy hover."* **Agreed** — `pointermove`
   now returns for an untracked pointer while a gesture is in flight (an armed copy's hover ghost, with
   nothing pressed, still follows any pointer), and `trayCancel` cancels only for a pointer it was
   tracking. A matching guard in `trayUp` was tried and dropped: an untracked up already returns at
   `trayPtrs.size>=1`, and no state has a gesture with nothing tracked, so no test could tell it apart.

GPT also wrote: *"I found no ordinary release-order or load-gate defect. Implicit capture release follows
`pointerup` or `pointercancel`. The window's `blur` listener uses the bubbling phase, so an ordinary focus
change between page controls does not invoke it."*

**Missing tests it listed:**
1. *The A/B/C case — "Drag C one column, then move and cancel A. Assert C's drag stays active and C's up
   moves the seed exactly one column."* **Added** (also A's late `pointerup`), with a companion test that
   an untracked hovering pointer still draws an armed copy's ghost. Removing the `pointermove` guard, the
   `trayCancel` guard, or narrowing the guard to block hover each fails one test.
2. *"Arm Copy and start a two-finger pan. Lift B normally, then deliver B's `lostpointercapture`. Assert A
   stays tracked and `camBusy()` stays true until A lifts. The pick and armed copy should survive both
   lifts without planting."* **Added.**
3. *"Browser acceptance, unverified in this review"* — hold a marquee, switch tabs, return, press ▶, see
   the field scroll. **Not reachable here** (AO's browser has no press-and-hold, and cannot run page
   code): first item on the owner's playtest list.

## Owner's review
Pending the playtest.

**1240/1240 tests pass** (16 in `tests/scoop-pointer.test.mjs`). Not verified by me: the tab-switch repro
in a real browser, and touch on a phone.
