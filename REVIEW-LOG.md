# Review log

What GPT flagged during cross-model review, and what was done about it. Newest last.

The design reviewer reads this before every review, so past findings carry forward instead of
being re-litigated. Keep entries short: the finding, the verdict, the outcome. Record
disagreements as disagreements — an entry that says "GPT was wrong, here's why" is more useful
later than one that quietly drops the objection.

Format:

```
## <date> — <branch or task>
**Design review (<model>)**
1. [severity] <finding> → <accepted / rejected + reasoning> 
**Cross-testing (<model>)**
- <what it tested> → <pass/fail, what got fixed>
```

---

## 2026-08-20 — widthBand: "Octave twins" mislabel (first cross-model run)

**Design review (gpt-5.6-sol, read-only)** — 10 findings. Raw output kept in the session; the
substantive ones:

1. [High] Option B (raw width) more consistent than folding by octave — **accepted**, and its
   reasoning was better than mine: `intervalName` already preserves compoundness, and
   `isTonic`/`chordName` fold to pitch class only because they answer *harmonic* questions.
2. [High] **The finding that changed the design, and I had missed it entirely.** `craftedOpen()`
   thresholds the raw gap (`>=5`, so an octave counts) while `countColBands()` filed an octave
   under `octave` — so the same pair passed "Craft an OPEN pair" and failed "Plant an OPEN
   pair". Option B alone would not have fixed it. **Accepted**; owner chose "Octave twins" as a
   display name rather than a fourth band, so `widthBand` now returns only close/bright/open.
3. [Med] The existing detector test pinned gap 13 → `octave` — **accepted**, fair hit. My own
   test had encoded the bug, with a comment contradicting its own assertion.
4. [Med] Pentatonic is affected too, not just diatonic — **accepted**, verified: 10 pentatonic
   and 21 diatonic pairs change band. Twin Blooms is shipped and pentatonic, so my "future
   palette only" framing was wrong.
5. [Low] Broader placement goals shouldn't hurt the ramp — **accepted**, with its caveat that
   only listening can confirm.
6. [Med] Behaviour is inherited prototype logic, not deliberate simplification — **accepted**.
   Decisive evidence, which GPT found and I hadn't: PACKAGES-DETAILED.md records a 2026-06-14
   playtest fix for the *same root cause* ("open" was a 4th only, so wider pairs failed).
7. [Med] Width and tension are separate axes — **partially rejected.** Correct observation, but
   `pairTension` already is separate in code; only my prose conflated them. Fixed the comment,
   not the architecture.
8. [Med] Undefined domain / ordering contracts — **accepted, downgraded to Low.** Added
   `pairSpan` (min/max) and defined behaviour for 0 and negatives. The unsorted-saved-toolbox
   path is theoretical: arrays are sorted at craft time.
9. [Low] Toolbox label vs. transposed stamp mismatch — **accepted but deferred.** Real,
   pre-existing, unrelated to banding. Spawned as its own task.
10. [Med] Implementation checklist — **accepted**, followed.

**Cross-testing (gpt-5.6-terra, workspace-write)** — wrote `tests/pair-integration.test.mjs`
(8 tests, all passing, kept). Covered the gaps I named: real crafting via `craftFromCells` /
`fuseField` / `fusePick`, octave stamping, placed-column counting, Twin Blooms L4/L7/L8 goals,
an unsorted persisted tool, and diatonic compound-tension crafting.

Found one real bug, reproduced independently: **`stampTool` can stamp a truncated tool as a
single note.** A 9-rung pair stamped at row 1 flips to `[1,10]`, filters off-grid, plants only
row 1 — but still reports "Stamped! 🌸" and sets `ev.stampedTool`, while `colBand` is `null`.
Pre-existing, but this change increases exposure. Deferred to its own task, not bundled.

**Disagreements worth remembering:** GPT rated #7 and #8 Medium; I hold they're Low and
scope-creep as stated. It was right about #2, #4 and #6 and I was wrong — in each case because
it read the repo's history and docs more thoroughly than I did.

**Cost:** design review 846k input tokens (763k cached) / 12k out, ~11 min on Sol. Cross-test
2.19M input (1.98M cached) / 24k out on Terra. Naming tighter doc *sections* is the lever
before downgrading models.

---

## 2026-08-20 — field zoom: the tap must not fight the plant

**No design review.** The owner specified the behaviour from a Pixel 10a playtest ("tap should only
change the zoom when it's at 60, and go 60 to 80"), so a design review would have re-litigated their
decision. Went straight to implement + cross-test. Two scope calls I made beyond the literal ask are
flagged to the owner, not to GPT: the beat lane got the same tap, and the 60% status copy now
advertises the tap.

**Found before GPT saw it (my own browser run):** the `lookOnly()` guard alone does not close the
hole on TOUCH. Planting fires on `mousedown`, the tap on `pointerup`, and the browser's synthesized
mousedown arrives *after* pointerup — by then the zoom has changed and the guard is false again.
Reproduced: seeds 0 → 1 on the tap that was only supposed to zoom. First fix was a 400ms time latch.

**Cross-testing (gpt-5.6-terra, workspace-write)** — wrote `tests/field-zoom.test.mjs`, did not touch
`index.html`. Two failures it left deliberately failing, both of which I re-verified:

1. [Med] **`pointercancel` leaks the pending `pointerup` listener** → **accepted, fixed.** Decisive
   point I had missed: `#scroller`/`#drumArea` are `touch-action:pan-x pan-y`, so Chrome cancelling a
   touch is the *common* path, not the exotic one — and every other pointer gesture in the file
   (lines 1456, 1773, 1848) already handles it. A cancelled pan could be revived by an unrelated
   later pointerup and zoom the field.
2. [Low] **`resetTransient()` reset the zoom but not the latch** → **accepted, fixed** (also drops a
   half-finished tap at the seam).
3. [Med] **A legitimate fast edit is swallowed for 400ms**, desktop included → **accepted, fixed by
   redesign**, see below.
4. [Med] **The 400ms window is not guaranteed by spec** (Pointer Events §13 leaves compat-mouse
   timing to the UA; a busy main thread could exceed it) → **accepted, fixed by the same redesign.**
5. [Med] **Two-finger pan with one stationary finger zooms** — GPT reasoned it, then upgraded it to
   reproduced → **accepted, fixed** (a second pointer down disarms the tap).
6. [Low] Cursor-strip tap at 60% moves the cursor *and* zooms → **noted, not changed.** Unchanged
   from the shipped commit, and landing the cursor where you tapped before zooming in is arguably
   the nicer behaviour. Flagged to the owner.
7. [Low] The first 60% tap never unlocked audio → **accepted, fixed** (`initAudio(); actx.resume()`
   in the tap).

**The redesign 3 and 4 forced:** the time latch became a **one-shot swallow** — the tap books the
right to eat exactly ONE mousedown, and the next press plants immediately. That removes the dead
window entirely (3) and, because one-shot costs nothing when generous, lets the deadline go to 900ms
to survive a slow main thread (4). Only touch books it at all; a mouse never needed it.

**What I found that GPT missed:** the inherited `performance.now()-t0 < 400` press-duration test meant
**a slow deliberate press at 60% did nothing at all** — no zoom, no seed, no feedback. Harmless in the
old handler; not harmless now that tap is the only advertised way back to planting. Dropped the clock
entirely and kept only the 8px slop: a pan travels, a pinch brings a second finger, and `pointercancel`
covers browser-initiated scrolling, so nothing is left that a clock still had to catch.

**Disagreements:** none material. GPT's Scoop verdict (keep it editable at 60% rather than strand a
child mid-pick) I agree with and adopted. I hold #6 is not a defect.

**Result:** suite 35/35 (12 new zoom tests; I rewrote GPT's two latch tests to the one-shot contract
and added coverage for multi-touch, pointercancel listener release, the slow press, the mouse path,
and the level seam). Browser-verified at 390x640 on a 14-row diatonic level. Goldens not re-run —
nothing here touches the scheduler.

**Cost:** cross-test 1.48M input (1.38M cached) / 15k out on Terra, ~6 min. No design-review call.

---

## 2026-08-20 — pinch to zoom the field (branch `pinch-zoom`)

**Design review (gpt-5.6-sol)** — 13 findings, verdict **"Replace this design. Do not build it as written."**
Design doc was scratchpad-only; the amended design is what shipped.

1. [Critical] `preventDefault()` on a two-finger `touchmove` cannot take the gesture back once Chrome has
   begun scrolling → **accepted as a platform fact, severity rejected.** In a real pinch both fingers land
   within ~50ms with no intervening move, so nothing has begun scrolling. Confined to "one finger already
   panning, then a second lands." Design now abandons the whole gesture when `!e.cancelable`. GPT could not
   answer the second half (does cancelling `touchstart` kill the compat `mousedown` planting rides on) —
   **sidestepped entirely: we never preventDefault the touchstart.**
2. [High] `.fieldcol` is the wrong listener boundary → **accepted, fixed.** Only `#scroller` / `#drumArea`
   carry `touch-action:pan-x pan-y`; `#fieldbar` is an absolutely positioned SIBLING. My doc listed the
   wider coverage as a feature; it was a liability. Single most concrete error in the design.
3. [High] The cursor strip and grips own their own pointer gestures → **accepted, fixed** (excluded from
   eligibility; `cursorStripEl._drag===true` also blocks arming).
4. [High] "A pinch books nothing" was an assumption → **accepted**, and mooted by never cancelling touchstart.
5. [High] The anchor write poisons `CAM.expect`, so the end-of-gesture `camEnsure` silently does nothing
   → **accepted.** The design defeated its own recovery step.
6. [High] Recentring at gesture end contradicts the focal anchor it just promised → **accepted, fixed by
   DELETING the step.** Made the design smaller.
7. [High] The anchor equation needs clamping; exact anchoring is impossible at the ends → **accepted,
   severity rejected (Medium):** the browser clamps `scrollLeft` itself. Its sub-point that we must read
   live `zoomOf()` rather than the requested `z` deserved higher billing than it got — that is the file's
   own doctrine. **Confirmed Q5: the anchor maths is correct and the `calc(72px / var(--fz))` margin does
   not break the re-read.**
8. [High] Document-wide `e.touches`, third-finger stale-`d0` resumption, and no pinch cleanup in
   `resetTransient()` → **accepted, fixed.** The last is a LITERAL repeat of this log's 2026-08-20
   field-zoom finding #2, same function, one commit later.
9. [High] "All two-finger gestures are pinch" costs the player a working two-finger pan → **part one
   accepted, fixed** (the latch only claims when spread change exceeds centroid travel). **Part two
   (TalkBack) severity rejected → Low:** GPT cited how the gesture works for the user, not what the page
   receives; with touch exploration on, Android intercepts at system level.
10. [Medium] Thresholds get harder with wide hand spacing → **accepted, severity RAISED to High:** walking
   two stops in needs a 354px final spread, impossible one-handed on a 390px phone. **Answers Q4: one stop
   per gesture.** Re-seeding `d0` was dropped.
11. [Medium] Non-passive listeners slow the compositor even when every branch returns → **accepted, fixed
   better than asked:** the blocking listener now exists only while two fingers are down. **Answers Q2:
   no Scoop interference — `enterTray()` already sets `touchAction:"none"`.**
12. [High] `pinching` can strand the camera permanently → **accepted, fixed.** Idempotent `pinchDrop()` from
   touchend, touchcancel, `visibilitychange`, `pagehide`, `blur`, `resetTransient`. **Answers Q6: yes.**
   GPT missed that `trayPtrs.size` in `camBusy()` has the identical latent failure today — **not fixed,
   pre-existing, logged here so the next reader finds it.**
13. [Medium] Untestable as written → **accepted:** `nextPinchStop` and `anchoredScroll` are pure and unit-tested.

**Verdict rejected.** GPT's own fallback option (a) — beds only, one stop, best-effort, abandon when Chrome
owns it — IS the amended design; its verdict word contradicted its own remedy. Its fallback reasoning
("the 🔍 button already delivers the owner's actual need") is not responsive to a reflex: the owner reached
for pinch instinctively and it did nothing. That is the same framing the game rejected when it added
tap-to-zoom-in. **Its one genuinely good process suggestion — a disposable device event-logger — was adopted
as `spike/pinch-probe.html`.**

**Cross-testing (gpt-5.6-terra)** — wrote `tests/pinch-integration.test.mjs` (9 tests), touched no source.

1. [Critical→High] Cross-bed listener leak: a third contact on `#cursorStrip` (a CHILD of `#scroller`)
   bubbles to the seed bed, `pinchPair` filters it out, and `touchstart` re-armed over the live gesture,
   stranding the other bed's blocking listener → **fixed:** any contact arriving mid-gesture now ends it.
   Severity lowered: the listener is inert and cleared by the next pinch on that bed.
2. [High] A pinch during a live vine `pull` silently changes a note's duration — `pull` is zoom-invariant
   only AT the centroid; 0.25 field px per px of separation at 1.0→0.8, so a grip 300px away jumps ~2
   columns → **accepted, I was wrong, fixed** with a `pull` guard.
3. [Medium→Low] `CAM.yielded=true` on every drop stopped the camera for two merely-resting fingers →
   **fixed:** only a pinch that committed a stop yields.
4. [Low] `touchcancel` was not terminal when its TouchList still named the pair → **fixed.**
5-6. [Low] `NaN`/non-finite guards → **rejected as unreachable**, tests deleted; reasoning in the task log.

**What I found that GPT missed:** the probe as first written could not answer the question it exists for.
The game attaches its blocking `touchmove` INSIDE the second finger's `touchstart`; the probe attached it at
load. If Chrome does not honour a mid-sequence registration, every move is non-cancelable and the pinch
silently never works. The probe now A/Bs exactly that, and the game now SAYS so once per session rather than
failing invisibly. Also: applying `zoom` to the grid rather than the scroller inverted what `scrollLeft`
meant, so the probe could not have validated the anchoring at all.

**GPT answered three of my untested items:** window `blur` is safe (it does not bubble; no iframes,
`window.open` or `showModal` in the file); a touch that starts on a bed and slides onto the strip stays
eligible because `Touch.target` is fixed at touchstart; and no path re-enters the touch handler.

**Result:** suite 52/52 (12 pure pinch tests + GPT's 7 integration tests, two of its nine deleted as mutually
unsatisfiable, two as unreachable). Browser-verified with real `Touch`/`TouchEvent` at 390x640; anchor drift
**0 field px**. Everything about whether Chrome yields the gesture is still a device fact.

**Cost:** design review 2.39M input (2.21M cached) / 20k out on Sol, ~18 min. Cross-test 4.94M (4.49M cached)
/ 40k out on Terra — double the previous, because resuming replayed the design-review transcript. Delete
`.claude/gpt/.thread-id` between tasks.
