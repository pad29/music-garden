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

### 2026-08-20, same task — what the Pixel 10a said

Two device findings, both from the owner's run against deploy-preview-1. No GPT call: these are measurements,
not opinions, and both fixes follow from them directly.

**1. A blocking `touchmove` registered mid-sequence is IGNORED.** The A/B was unambiguous: lazy
(added when the second finger lands, which is what shipped) came back **not cancelable**; at load came back
**cancelable**. GPT's cross-test finding A called this exactly, and it was the one thing neither of us could
settle by argument — which is why the probe existed. **Registered at load now.** The cost is real and is
being paid knowingly: one-finger scrolling waits on a main-thread handler whose first line is
`if(!pinch) return`. That was the property I had been protecting, and the device says it buys nothing
because the feature does not work without it.

**2. Two-finger panning did nothing at all — neither zoom nor scroll.** I could not reproduce the cause:
synthesized touch events never drive native scrolling, so a desktop cannot tell whether Chrome declines to
two-finger-scroll a `pan-x pan-y` bed or whether the old latch was eating it. Both fixed at once:

- The claim test is now **direction**, not spread-versus-midpoint-travel. `movingTogether(d1,d2)` compares
  the two fingers' own displacement vectors; a pan vetoes outright. The old test could read finger wobble as
  a pinch on the FIRST touchmove, and preventing the first touchmove is what makes Chrome cancel scrolling
  for the whole gesture — a pan that does nothing, exactly as reported. A resting finger is exempt from the
  veto (one anchored finger and one sliding one is a perfectly good pinch).
- **The garden now pans itself.** Rather than establish whose fault the dead pan was, two fingers travelling
  as one drag the field 1:1, the way the Scoop's own two-finger pan already does. Verified: 50 viewport px
  at 0.8 zoom scrolls exactly 63 field px, and continues tracking without a jump.

**This reverses GPT design finding #9 part one** — "claiming every two-finger gesture makes panning a dead
gesture." Correct as a warning, and the answer turned out to be *own the pan too* rather than *never claim*.
A gesture that starts as a pan and then spreads still zooms; a pan never spends the one-stop budget.

**Contract change, recorded because it invalidates tests:** the move listener is permanent, so the assertions
counting listeners were rewritten to prove the listener is INERT between gestures rather than absent. GPT's
pan test was rewritten from "never claimed" to "claimed and panned, never zooms."

**Result:** suite 59/59. Browser-verified after reload. One scare that was not real: the beat lane appeared to
stop mirroring the seed lane — it is the known Browser-pane artifact (no compositing means no `scroll` events
are dispatched at all); dispatching one by hand mirrors correctly.

### 2026-08-20, third device round — the at-load registration was wrong, and so was my reading of the probe

Owner: one-finger scrolling great; **neither pinch nor two-finger pan does anything.** A regression — pinch
worked in `243fd1f`. Four observations only fit one story:

| | |
|---|---|
| `243fd1f` (lazy) | pinch worked, two-finger pan dead |
| `e579eeb` (at load) | both dead, one-finger scrolling fine |
| probe A/B | lazy “not cancelable”, at-load “cancelable” |
| both builds | identical `!e.cancelable → pinchDrop()` line |

Since `243fd1f` zoomed on the device, its two-finger moves **were** cancelable — with the lazy listener. So
the probe's A/B did not measure what I read into it (its box leads with *first move*, and the first gesture
on a fresh page is the one case where nothing has taught Chrome about the handler yet). **I over-trusted a
summary line over the behaviour of the actual build**, and shipped a change on it.

Mechanism, which fits everything: with a blocking listener present from the FIRST finger down, Chrome asks
the main thread on the first move; one finger is a scroll so we decline to prevent; Chrome commits to
scrolling; every later move is non-cancelable; the second finger arrives into a sequence already spoken for,
and the `!cancelable` branch abandoned it. Born late, the listener is exactly what makes Chrome reconsider.

And `243fd1f`'s dead two-finger pan is explained by the OLD latch: spread-versus-travel claimed the wobble on
the first move and prevented it, with no pan implemented to take its place. Two independent causes, one
symptom — which is why the direction latch alone did not fix it.

**Fixes:**
1. **Back to lazy registration.** One-finger scrolling also goes back to costing nothing, which it did not
   need to pay for.
2. **Never abandon on `!e.cancelable`.** That branch turned “we cannot stop the scroll” into “nothing happens
   at all”. Cancelability decides who PANS and nothing else — a zoom never needed the browser's permission.
   Non-cancelable now: zoom anyway, and leave the pan to the browser rather than double-moving it.
3. `pinchLost` and its status line are gone: there is no longer a case where a gesture silently does nothing.

**Result:** 60/60. Verified in-browser both cancelable and not: pan tracks 1:1 both directions and clamps at
the field edge, pinch steps both ways with the anchor, a non-cancelable pinch still zooms, a non-cancelable
pan is left alone, third finger still ends the gesture, level seam still clears it, tap and planting unchanged.

**Lesson worth keeping:** the probe answered a narrower question than its headline suggested. When a shipped
build and an instrument disagree, the build is the evidence — I had both and believed the instrument.

---

## 2026-08-20 — the garden sat left while every card centred (branch `field-centering`)

**No GPT call, deliberately.** Three lines of CSS whose only real risk is this file's recurring source-order
trap, and the evidence that settles it is measured computed geometry at four widths and three zoom stops —
which a code read cannot produce and a reviewer cannot see. Said here rather than skipped silently.

**The report:** on the phone every box centres except the field and drums, and it looks worst zoomed out.

**Measured, and the reason it is invisible in portrait:** at 390px every box is 18..372, identical — there is
nothing to see. The defect needs a stacked layout WIDER than the card cap: `.sidebar .card` is capped at
34rem (544px) and centres itself, while `.fieldcol` is `width:100%`. At **915px — this phone in landscape**
— the level card sat at 178..722 while the field ran 18..714, and at 60% zoom the field stopped at **464
with 418px of empty page beside a centred card**. Zooming out shrinks the bed but not its column, so the gap
grows: exactly the "especially when I zoom out" in the report.

**Fix:** `.stage, .drumstage { width:max-content; max-width:100%; margin-inline:auto; }` inside the existing
≤1000px query, authored LAST in the stylesheet. Notes for the next reader:
- The 72px rail is `position:absolute` inside `.stage`, so shrinking the stage carries the rail with it.
  Centring the scroller alone would have stranded the rail at the page edge.
- Both beds resolve to the same max-content width (rail + identical column count), so they stay locked to
  each other under one cursor — verified equal at every stop, not assumed.
- `max-width:100%` is load-bearing: without it a field wider than the phone overflows the page instead of
  scrolling inside itself.

**Verified:** centred with equal margins at 915px (84/84, 146/146, 209/209 at the three stops) and both beds
aligned; unchanged at 390px where the field still fills and scrolls, with no sideways page scroll; desktop
>1000px untouched. Cell and pad hit-testing correct at all three zooms, planting and beats land on the
column aimed at, the pinch anchor still holds at 0 field px drift now that `rect.left` has moved, and the
cursor strip still aims true. 60/60.

**Two scares that were not real:** a cell hit-test failed because the cell had scrolled under the sticky
transport band, and a plant did nothing because row 0 is locked on that level.
---

## 2026-08-26/27 — the meter decision: two design reviews, both "replace"

Design-only. Nothing implemented. Outcome is `EDITOR-DESIGN.md` §17.

**Round 1 (gpt-5.6-sol, 18 findings, verdict "replace").** It destroyed the draft's central claim and the
sentence everything rested on — *"none of this is audible-wrong today; it is named wrong."* Nine citations
showed four-columns-per-beat is **drawn, narrated and animated** on shipped levels (`beat` tint on pads,
`beatGuide`, "eight times across the bar", "the first bar (16 steps)", the ＋ tooltip, Off the Path sliding
2,6,10,14). It audited all 18 `FAMOUS` entries from **note positions rather than comments** and found both
conventions in frozen content. **Accepted essentially in full.** It also caught that my §6 contradicted a
standing owner rule in `DESIGN.md` I had not read, that `{beats,unit,group}` cannot express a pickup
(Moldau's downbeat is at column 1), that `meterMap` already exists as the seam a scalar `time.meter` would
bypass, and that dance feel ≠ meter because `jamStep` is fixed to a 16-column four-step cycle.

**Round 2 (gpt-5.6-sol, verdict "replace" again).** It killed v2's new mechanism — snap-derived `stepDur`
plus "declare a level 16th-snap and halve its tempo" — as a self-contradiction (ticks declared canonical,
then columns held fixed while ticks moved). **I verified the operational half in source and it is worse than
its finding said: §5(a) has no mechanism at all.** No level sets tempo; it is one global player setting; the
required values are below the slider's `min="60"`; and `applyGrooveTempo()` overwrites them regardless. Its
constructive answer — **snap is editor/session state and never touches playback time** — dissolved four
findings at once, and the fix was a subtraction rather than more design.

**Disagreements.** GPT rated "no sound changes" High; I held Medium and it conceded (the claim was sound for
meter-as-metadata; the defect was framing). I challenged its `bodiddley` reading as eighth-clave-plus-16th-hats
and **I was wrong — it is uniform 16ths, the odd kick position 3 forces the fine grid, and its original call
stood.** It conceded `joy` is indeterminate from repository positions alone, and conceded my §4 over-applied
the legacy no-bars quarantine to the Jukebox, which has no level to collide with.

**Found in passing, each its own task, neither caused by this design:** `FAMOUS_TEMPO.taps=40` clamps against
the slider's `min="60"`, so **Taps has never played at its declared tempo**; and `placeFamous` closes its
`tx()` before the tempo is set, so **redo of a famous reveal replays at the player's tempo, not the tune's**.

**Left deliberately open** in §17: the four-column beat on shipped levels. `swingTicks` carries both
conventions in adjacent lines — `jamMode` swing is coherent only at eighths, `levelSwing` only at 16ths —
so the `beatGuide`-only packages can be fixed with words while the `feel:true` ones cannot. Splitting them is
the answer; declaring one number for the whole game is what both dead drafts tried to do.

**The repeated failure, now twice in this log:** comments and labels treated as stronger evidence than
behaviour. The widthBand round recorded it first. Draft 1 was built out of code comments.

**Cost:** 5.25M input (5.01M cached) / 35k out, then 3.35M (3.0M cached) / 27k out — both Sol, ~13 and ~11
min. Owner checked quota before round 2: 96% weekly and 75% of the 5-hour window remaining. Round 2 ran as a
**fresh thread** because `.thread-id` had been deleted, so GPT could not see its own round-1 findings; the
prompt was made self-contained instead. Worth knowing: deleting the thread id between rounds of the SAME
decision loses continuity, while keeping it would have replayed ~5.3M tokens.

---

## 2026-08-27 — two small tempo bugs, and the two more they were hiding (branch `tempo-fixes`)

Both originals were found in passing during the meter design review, neither caused by it.

**Fix 1 — Taps had never played at its declared tempo.** `FAMOUS_TEMPO.taps = 40` against
`<input type="range" min="60">`, and a range input silently clamps a value assigned below its minimum.
Measured: **500ms per column against its true 750** — half again too fast, on every play since it shipped.
Floor lowered to 40; it is the only entry that was ever out of range.

**Fix 2 — redo of a famous reveal replayed at the player's tempo.** `playFamous` set the tempo *after*
`placeFamous`'s `tx()` had closed, and `tx()` snapshots when the callback returns, so the tune's tempo was
never in the journal entry. Measured before: reveal→undo→redo gave 108/108/108 with the arrangement restored
at the wrong speed. The tempo is set inside the transaction now.

**Cross-testing (gpt-5.6-terra)** — wrote `tests/tempo-fixes.test.mjs` (5 tests) and, necessarily, a
stateful `#tempo` stub in `harness.mjs`: without it the DOM proxy swallowed writes, `stepDur()` returned
`Infinity` and `snapState()` always reported `"tempo":0`, so **neither fix was observable in the harness at
all**. Confirmed the new tests fail against the pre-fix file. One assertion deleted on review — it asserted
`min === "40"` literally, a restatement of the attribute the fix changed, replaced with the behavioural
invariant that every `FAMOUS_TEMPO` value *and* every `GROOVES[].bpm` survives assignment unclamped.

**Fix 3 — GPT found that fix 1 makes a latent bug reachable, and it was right.** `pump()` garbage-collects
each column's wrapper gains at `colGains[0].when < ct-4`, and every voice connects through them — so the GC
severs a note that is still ringing. That flat 4 seconds was **exactly an 8-column vine at 60 BPM**: the old
tempo floor sat precisely on the boundary, which is why it never fired. At 40 BPM the same vine is 6s and 2s
of it is cut. Verified arithmetic: 8-column vines truncate below 60 BPM, 6-column below 53. The window is
derived from `MAX_VINE * stepDur() + GC_TAIL` now, so the two ceilings cannot drift apart again.
**I rated this Medium against GPT's High:** no shipped content triggers it — only `swinglow` has vines at
all (8 cols at 88 BPM = 2727ms, safe) and Taps has none — so it needs a player to drag to ≤53 and grow a
near-maximum vine. Fixed regardless, because fix 1 is what opened the door.

**Fix 4 — a famous tune's tempo leaked into the child's saved settings.** Pre-existing, worsened by fix 1
(60→40) and given a second route in by fix 2 (redo now also leaves the tune's tempo). `saveProgress` fires on
level completion, a voice change, the mixer, read-aloud — and wrote whatever tempo happened to be live, so
watching Taps left the game **stuck at 40 BPM on every reload**. A famous tempo is now a *loan*: it plays, ▶
replays the arrangement at it, and `saveProgress` persists the child's own instead. Every deliberate route —
moving the slider, picking a groove — hands the loan back. Deliberately scoped to the famous path only, so
groove and song-load behaviour is untouched.

**Verified:** 65/65 (up from 60). In-browser, all 18 famous entries: correct live tempo, correct undo (the
player's) and redo (the tune's), and **no leak into the saved setting** on any of them. Taps at 750ms/column
with a 9s GC window against a 6s longest note. GC window stays ahead of the longest note at 40/53/60/108/170.
Plain edits, grooves and the two entries with no declared tempo all unchanged. No console errors.

**Goldens not re-captured** — GPT agreed with the reasoning and named what would have made it wrong: the five
configurations run at 108/120/160, all valid before and after; no hunk touches scheduler logic; no capture
invokes a famous tempo change. **Still unverified, needs ears:** the truncation itself, and everything at
750ms/column that Node cannot hear.

**Thread note:** `.thread-id` still held the meter design-review thread (Sol, 3.35M in). Rather than resume an
unrelated transcript or delete it, it was parked as `.thread-id.meter-design-round2` and this ran fresh.
Cost: 1.47M in (1.26M cached) / 20k out on Terra.

### Same branch, after the owner's device test — the flat 3s trim was seven different lies

**Owner, testing fix 3 on the Studio at 40 BPM with an 8-column vine:** *"Music Box rings all the way till
the end, while Guitar stopped ringing half way."* Both halves of that sentence were informative.

**The music box ringing all six seconds is the proof fix 3 worked** — before it, the collector severed that
note at four. The guitar was a different and older limit, and the owner's question (is the 3s cap per
instrument, or one global number?) was the right one: it is **global**, `Math.min(buf.length, rate*3)`, plus
a flat `src.stop(now+2.9)`. Measured the true recordings by decoding each payload before conditioning:

| voice | recorded | median | lost to the 3s trim |
|---|---|---|---|
| piano | **16.19s** | 13.32 | 13s, on all 9 notes |
| harp / vibraphone / glockenspiel | ~3.24 | 3.24 | a quarter second |
| kalimba | 2.93 | 2.76 | nothing |
| marimba | 2.51 | 2.19 | nothing |
| guitar | 4.15 | **1.67** | nothing on the median note |

So **the guitar fading halfway through a slow whole note is a guitar being a guitar** — and the design comment
already said so (*"a long vine simply runs out of recording and is honestly over"*). But the piano doing the
same thing was us discarding the tape. Each voice keeps its own length now, capped at `VOICE_MAX_SEC=7` — the
longest note the game can request (MAX_VINE at 40 BPM is 6s) plus release. Loudness is still measured over the
first 3s so no voice changes level; a note stops at whichever comes first, the note asked for or the end of the
recording.

**The actual defect was the picture, not the sound.** §2c's rule is that a stem lights for exactly as long as
it rings, but the timeout was computed from `n.durationTicks*anchorSPT` — the NOTATION — so at 40 BPM a guitar
stem glowed green for 6000ms over 4.4s of silence. `ringCeiling(instr, pitch)` now bounds it, **per note**
rather than per voice, because a sample transposed up plays faster and runs out sooner. Guitar 6000→1593ms;
piano stays 6000 because it can now genuinely hold it; synth voices return `Infinity` and are unaffected.

**The cost, surfaced to the owner rather than absorbed:** 41.5MB of decoded audio with all seven voices
loaded, of which the piano is 20.9MB (stereo, 3s→7s). The old trim existed for memory, so this is a real
trade. Voices load on demand, so only a child who tries all seven in one session reaches it. `VOICE_MAX_SEC`
is the dial if a phone complains.

**Lesson worth keeping: "every voice is trimmed to 3s" read as one honest constraint and was seven.** The
short instruments were never affected by it and the piano was crippled by it, and nothing in the code said so
— the only way to find out was to decode the recordings and look.

## 2026-08-28 — meter slice 1: design review (branch `meter-bars`)

Design-only so far. `gpt-5.6-sol`, fresh thread, read-only. **Verdict: REPLACE.** I verified its evidence
against source; the citations hold up.

**The fact table survived, which is the thing I most wanted checked.** The design's §0 listed 24
load-bearing claims with line numbers precisely so the review could attack them, given that this log
records twice — widthBand, then meter round 1 — that *comments and labels treated as stronger evidence
than behaviour* is this project's recurring failure. GPT: *"The fact table is materially accurate. I found
no false behavioral claim in it."* Five line numbers drift by 1–2; nothing material. **One citation
OUTSIDE the table was wrong and it caught it:** I attributed "bar numbers + loop range on the cursor
strip" to §17. That wording is not in §17 — it is at `EDITOR-DESIGN.md:201` and `DESIGN.md:225`. Its
conclusion is the sharp part: *"The design cites the wrong authority but still violates the actual
standing architecture."*

**Findings I accepted in full.**

1. *(GPT: High; I rank it Critical, and said so)* **The proposed loop cannot reliably loop the selected
   bar.** A one-sided `bookCol >= loopEnd` test does not enforce a range: pin column 2, select the bar at
   `[8,16)`, press play, and `start()` seeds `step=2` (4993) while `Transport.begin()` books from it (4968)
   — fourteen columns play, not the bar. The range must override the pin and clamp both ends. §17's whole
   point is *"bars must do something"*, so this is the load-bearing defect, not a High.
2. **`#barRuler` is the wrong mechanism.** My argument was that a new node has "no existing pointer
   contract"; that is exactly backwards — `#cursorStrip` has an *explicit* one (four exclusion sites
   written for it), a new node has an implicit one it fails silently. Concretely: pinch eligibility is
   `el.closest("#scroller")` minus the strip and grips (1424–1428), **so a ruler inside `.scroller` is
   pinch-eligible** — the identical cross-bed leak `REVIEW-LOG.md:187` already records; `camBusy()` (1345)
   knows only `cursorStripEl._drag`; `armZoomTap(scroller)` (5031) receives its bubbled pointerdowns, so at
   look-only zoom a chip tap both sets a range and zooms; and it inherits neither `touch-action:none` nor
   the `calc(20px / var(--fz))` inverse sizing (276–286), so its chips shrink to 60% at 0.6. Plus geometry
   I had not thought about: a 16-column 3/4 song's last bar spans columns 12–15, but a `barCols*38` chip
   runs to 17 and **absolute overflow can enlarge the scroller's scrollable area beyond the grid**,
   corrupting camera and drum sync.
3. **`resetTransient` is not sufficient to protect shipped levels**, which was my claimed guard. The
   `#song=` bootstrap (5688–5692) opens the Studio, then calls `applySong` when the network returns, with
   no reset in front of it — so entering a package while that request is in flight injects the song into a
   shipped level. Pre-existing; my design would have made it carry `doc.meterMap` and draw bars there.
4. **Drum-lane barlines are a real gap, not a saving** — I asked the question and the answer is gap. The
   Studio opens with `drums:true` (4412) so `drumsOn` is true (4500); meter through the melody field alone
   leaves the surface where beat grouping matters most barless. Cheap to fix: one shared mark list, two
   overlays.
5. **No meter-control synchronization contract.** Undo can restore the picture while the select still
   reports the undone meter. Sharper than it looks: `applySong` sets tempo/groove *conditionally*
   (5191–5192), harmless only because `currentSong()` always emits both — **meter is the first field that
   is legitimately absent**, so copying that pattern leaks a stale meter across a load.
6. *(Medium, not High as filed)* **Jam.** My mitigation was a status line; it is worthless — `jamStep`
   is `%16` with chords by `(s/4)|0` (1117), and the line is overwritten by Jam itself (5025/5027) or by
   Groove (5035). But GPT's remedy (disable Jam for incompatible meters) is a product decision, not a
   defect fix, and §17 already accepted that grooves lag meter.
7. **My reasoning for keeping `removeColumns`'s 16 floor was false** — I found this myself before the
   review returned. Both cited call sites compute their own `COLS-16` delta (4486, 4539), so neither needs
   the floor. GPT supplied better reasons (`hintMelody` hardcodes column 14 at 5127; one-step surgery
   independently refuses below 16 at 2070) **and a defect neither of us had: the floor can silently turn a
   full-bar removal into a partial one** — an 18-column 3/4 song minus a 6-column bar becomes 16, removing
   two columns. Patch removal must be all-or-nothing.
8. **The share extension is correct** — the one part it endorsed. *"Appending only when metered preserves
   every existing packed link byte-for-byte."* Its addition: validate hostile input, since a crafted `#s=`
   link with `["9/7",0]` in slot 8 throws in `barTicks(METERS[id])` today.
9. *(Owner's call)* "Free (no bars)" cannot share a screen with "one more bar (16 steps)". Its neutral
   wording sidesteps §5 rather than answering it, which my caution had not considered.
10. Test plan missed the failure modes above, and **`F_vine_holds` could not have been captured with the
    documented wrapper at all** (see below).
11. Docs to update: `DESIGN.md`, `EDITOR-DESIGN.md`, `SAVE-SHARE.md`. It confirmed no hard invariant is
    touched — no new assets, so `netlify.toml` is unaffected.
12. `barOf()`'s normalized modulo is *"necessary and correct"*; it declined to drop 2/4.

**Three findings GPT did not make, from my own verification.**

- **A.** `COLS` is assigned in exactly five places (836, 1225, 1271, 1288, 5185) and **nothing ever grows
  it back to 16**: `resetTransient` only shrinks (4486). So lowering the floor is not a preference — a
  Studio waltz trimmed to 6 columns would render every subsequently entered level at 6.
- **B. The design claims neutrality on §17's open four-column-beat question, but its rendering answers
  it.** `stepDur()` is `60000/tempo/2` (4862), so a quarter is **2 columns** — measured, not inferred: at
  108 BPM a column is 277.78 ms and a quarter is 555.56 ms. `beats:[96,96,96,96]` therefore draws a beat
  mark every 2 columns, while `setBeatGuide` tints every 4 (2582) and shipped copy calls *that* the beat.
  §8 says "no `%4` touched" — true of the code, false of the picture. **Same shape as the finding that
  killed §17 round 1: drawn, not merely named.**
- **C.** Patch-add with a pickup lands the field mid-bar (origin 48, 4/4 gives bars at columns 1, 9, 17).
  §17(6) permits ending mid-bar, so not a bug, but "adds one bar" then drawing a partial one is the same
  small lie the design was trying to avoid.

**Scope.** Both of us landed on two PRs: goldens alone against untouched `d434ece`, then one atomic
feature PR. GPT: *"Do not split the second PR into 'format first' and 'behavior later.' That would violate
the settled first-slice requirement."*

**Cost:** in=1,772,734 (1,618,432 cached) / out=24,055, Sol, fresh thread.

### Same day — the goldens PR, and the instrument was broken

Captured F–I on the current engine before touching `index.html`, per §17's *"new goldens come first"*.

**The capture wrapper documented in `tools/goldens/README.md` was itself defective, and it mattered.**
`window.playRow = (r, t) => { …; return origPlayRow(r, t); }` is a two-arg arrow: it dropped `playRow`'s
third argument both from the recording **and from the forwarded call**. `F_vine_holds` exists to pin held
notes, and captured with the documented wrapper it would have recorded — and played — staccato. Fixed,
along with two additions the new cases needed: `bookColumn` (the loop wrap books columns whether or not
anything sounds in them, so a note-only recording cannot see it) and `voice` (`playFamous` sounds through
`voice()` directly, never `playRow`, which is why no golden had ever touched a single note of the reveal).

**What the new goldens found, beyond pinning:**

- `bookTick` is **monotonic across the loop wrap and never resets** — ticks run 0…720, then the wrapped
  column 0 books at 768. A bar loop range must preserve that; the tick timeline stays continuous while
  only the column jumps back. Nothing had recorded this.
- `loopStart=8` **already produces a real 8-column tail loop today** (booked 8..15 repeating). What is
  missing is only `loopEnd`.
- Holds land exactly on `durationTicks/48 × stepDur`: 0 for one column (the `>TICKS_PER_COL` gate keeps
  every shipped flat note on the byte-identical path), 0.55556 s for two, 1.11111 s for four.
- `I_famous_sweep` pins Swing Low's real note lengths (0.68182 / 1.02273 / 2.04545 s at 88 BPM) — the only
  place the length data in frozen, score-validated content is pinned against the engine that plays it.

**Honest limit, written into both files:** all nine cases pin *scheduling* and are completely blind to
*drawing*. A barline at the wrong column is invisible to every one of them.

---

### Same branch, the test round — four real defects, and the pad tint held

`gpt-5.6-terra`, resumed thread, workspace-write. It added one file, `tests/meter-edges.test.mjs`, and
edited no source (md5-verified). Five of its seven tests kept: one green, four red. **I reproduced every
finding against source before accepting it, and deleted two tests that asserted a policy rather than a
defect** — `validMeter("4/4","2")` and `validMeter("4/4",1.5)` both land on a usable pickup, so rejecting
a link over its JSON number type helps nobody; the comment claiming otherwise was mine and is now honest.

**The thing I most wanted attacked held.** Its quarantine sweep opens the Studio, sets 3/4 with a pickup,
enters *every level of every package*, and asserts `doc.meterMap` is empty, that `undoEdit()` cannot bring
it back, and that `beatTintAt(c) === (c%4===0)` for every column. That is the strongest evidence the
pad-tint switch — the only line in this slice shipped levels execute — is contained.

**HIGH — a crafted `#s=` link crashed song loading and left the Studio half-loaded.** `METERS[preset]`
accepts `"toString"`, `"constructor"`, `"valueOf"` and `"__proto__"`: inherited, truthy, and with no
`.beats`, so `barTicks` threw. The severity is in *where*: `decodeSong`'s try/catch is upstream, and the
throw landed **inside `applySong`'s `tx("load-song")`**, after the palette, `COLS` and both tracks were
written and before `reproject`/`rebuildField` — the Studio kept a stranger's notes behind a stale grid at
a `COLS` the DOM did not have. **This falsified my own test named "a hostile or malformed meter in a
share link normalises to unmetered, never throws".** Every lookup goes through `meterDef()` now, an
own-property gate, and `setMeter` routes through `validMeter` so the picker and a share link share one
door. Verified in the browser: all four keys return unmetered, and a crafted slot 8 through `applySong`
leaves `meterMap` empty with `COLS` and the grid still agreeing.

**MEDIUM-HIGH — `－ room` left a live range as a one-column loop.** `modelSetCols` got the shrink guard;
`modelRemoveTime` assigns `COLS` directly and got nothing. Its run, from `COLS=24` with a range on
`[16,24)` after seven presses: `COLS 17 · loopA 16 · loopB 17` — exactly the collapse `loopB()`'s own
comment claims to prevent. Both surgery ops now clear the range.

**MEDIUM-HIGH — time surgery moved the music but not the meter origin**, so the barlines detached from
the notes on the first `＋/－ room` in a metered Studio. `shiftMeterOrigin` travels with the edit, moves bar
1 only when the edit is at or before it, and **wraps modulo the bar** — an origin is a pickup, always a
fraction of a bar, never "bar 1 starts three bars in". GPT flagged the modulo need itself.

**MEDIUM — the chip tap was not isolated from `armZoomTap`, and my CSS comment said it was.** The comment
justifying chips-on-the-rail claimed it "already carries armPinch's exclusion, and the only pointer latch
camBusy() knows" — true for both, **false for `armZoomTap`**, which is armed on `#scroller`, the strip's
parent. At zoom 0.6 a chip tap set the range *and* zoomed back in: the same leak the design review filed
against the rejected `#barRuler`. The comment is corrected.

**And the first fix did not work, which is the interesting part.** Excluding `e.target.closest("#barchips")`
inside `armZoomTap` looked right and measured wrong: **the strip's own handler calls `renderBars()`, which
rebuilds `#barchips` during dispatch, so by the time the event bubbled to `#scroller` its target was
detached — and `closest` on a detached node returns null.** Two fixes, both kept: the chip band
`stopPropagation()`s (the cursor branch still bubbles, so tap-to-return from the rail stays shipped
behaviour), and `renderBars` now **retints in place and rebuilds only when the bars themselves change**,
which also stops the whole rail being rebuilt on every pointermove of a range drag.

**MEDIUM — the gesture was not pointer-ID scoped and its tap test had no slop.** `stripUp` took no event
and cleared `_drag` unconditionally, so with two fingers on the rail the first release dropped
`camBusy()`'s only latch while the second was still dragging; and `_moved` was set by *any* movement, so
one pixel of finger jitter defeated "tap the lit bar to release". Both fixed — 8px, the figure
`armZoomTap` and the vine pull already use. Verified: latch holds through a stranger finger's release,
and release-on-tap survives 3px of jitter.

**LOW, and a product call I made:** selecting bars did not turn 🔁 Loop on, so the pump's `if(!looping)`
played the selection once and stopped while the chip sat there lit green with the class `.inloop`.
Choosing bars to loop *is* asking for them to loop; `applyRange` turns it on.

**Gaps GPT named that neither of us had covered, now closed:** `bookTick` monotonicity across the
**two-sided** wrap (the goldens pin only the one-sided one) — verified monotonic; a range anchored on the
pickup bar and on the clipped partial final bar — both sane; `＋/－ patch` with a live range. Still open
and worth saying: `SHARE_MAX` overflow with a metered song at the boundary, the `songLoadToken` against a
genuinely slow fetch, and everything real-touch — GPT left a seven-item device checklist for the owner.

**Suite: 102 pass, 0 fail** (65 before this work → 93 with `meter.test.mjs` → 98 with GPT's edges → 102
with tests for this round's fixes). **Cost:** `in=5,014,972 (cached 4,573,440) / out=46,038`, Terra,
resumed thread — the resumed design thread is now large enough that it is worth deleting `.thread-id`
when this ships.

**Process note, not a code finding:** a patch script truncated `index.html` and later `DESIGN.md` to zero
bytes, because `io.open(p,"w")` truncates the moment it is evaluated and the `.encode()` inside the same
call raised afterwards. Both files were committed, so nothing was lost. Encode on its own line first.

---

## 2026-08-29 — the tool rail's scrollbar sat on the tools (branch `rail-scrollbar`)

**No GPT call**, and the reasoning matters more than the exemption: this is CSS with no logic, and the
question it turns on — how many pixels a scrollbar actually takes — is answerable only by measuring in a
browser, which is strictly better evidence than a paper review. Every number below was measured, and one
of them overturned my first fix.

**Owner, from a desktop screenshot he could not reproduce on purpose:** *"The vertical bar partially
covering the buttons doesn't look good. It is fine on the phone since there it is very thin, but on the
desktop it's thick."* He proposed leaving empty space beside the buttons for the bar to use.

**It was not intermittent — it is both zoom stops in the Studio on a desktop, every time.** `#fieldbar` is
`max-height:100%; overflow-y:auto`, and its tools need 324px against a stage of 306 at zoom 0.8 and 220 at
0.6. So the rail scrolls, and a classic 15px scrollbar took its width **out of the tools**: the content box
went 72 → 57. That is worse than cosmetic, because `.fbpair` is `34+4+34` — the gutter exactly — so at 57
the pairs no longer fit and the rail grew a **horizontal** scrollbar as well. Both bars are visible in the
owner's screenshot, which is what identified the mechanism. Phones never showed it: overlay scrollbars take
no layout width at all, so `clientWidth` stays 72 there.

**The space the owner asked for already existed.** `.grid`'s own 10px padding leaves exactly 10px of dead
ground between the rail's right edge and the first plot — measured, not assumed. The rail is now 82px
(72 + 10) with a thin styled bar, so the tools keep their full 72px and the bar parks in the gap. 82 is
chosen so that when the rail is *not* scrolling, its extra width is transparent overhang that stops
precisely where the first plot begins: measured `railRight - firstPlotLeft = 0` at zoom 1.

**My first attempt was 80px and it was wrong, for a reason worth recording: `scrollbar-width:thin` is the
standard property and Chrome honours it OVER `::-webkit-scrollbar{width}`.** I had assumed the webkit rule
would win and sized for 8px; the measured bar was 10, the content box came back 70, two short, and the
horizontal bar returned. `overflow-x:clip` is now the belt — a browser whose `thin` is wider than 10 loses
a pixel off a button's edge instead of growing a second scrollbar across the tools.

**A second, quieter bug in my own fix, caught by looking rather than measuring:** the thumb was `var(--line)`,
a cream on a cream page, so a scrolling rail became *invisible* — trading an ugly bar for a hidden one,
when the whole point is that there are tools below the fold. It is `--bedDeep`, the garden bed's own green,
with `--bedRing` on hover.

**The invariant I had to not break, verified rather than asserted:** the 72px gutter is what aligns the two
lanes, and `EDITOR-DESIGN` calls it load-bearing. Only the absolutely-positioned rail widened —
`.scroller`'s `margin-left` and `#drumbar`'s width are untouched — and both lanes' left edges and both
first-cell positions match to the pixel at zoom 1, 0.8 and 0.6, on desktop **and** on a 375×812 phone,
where the buttons stay left-aligned at 72 inside the 82px box (`align-items:flex-start`, added for exactly
that). Hit-tested too: `＋` and the right edge of `Clear` are still the topmost elements at their own
centres, and column 0's leftmost pixel still hit-tests as a cell at every zoom, so the overhang eats no
clicks.

**Left alone deliberately:** the rail still scrolls at 0.8 and 0.6, so 🔨 Fuse and undo/redo sit below the
fold on a short desktop window. That is pre-existing, it is what the zoom work traded for reclaiming the
lane's height, and gap-tightening cannot fix it — the rail is 104px short at 0.6. Worth its own task if the
owner finds it annoying in play; the bar being *visible* now at least makes the tools discoverable.

**Suite: 65 pass** (this branch is off `main`, so the meter tests are not on it).

---

## 2026-08-29 — dance grooves: design review (branch `dance-grooves`)

`gpt-5.6-sol`, fresh thread, read-only. **Verdict: REPLACE**, and it was right on the two that mattered.
I verified every citation against source before accepting.

**1. [Critical] My central arithmetic claim was false by a factor of four.** The design proposed
generalising `jamStep` as `bar=G.bar||16`, `cyc=bar*prog`, `seg=cyc/prog`, and asserted in its own comment
that "for them cyc IS 16". For the shipped grooves `bar*prog` is **64**, and `seg` is **16**. GPT's worked
cases all check out: at step 4 today's code plays chord 1 and the proposal plays chord 0; at step 16 today
wraps to chord 0 and the proposal advances to chord 1; lo-fi's hand-placed `s===6` bass never fires at
step 22 because `s` is 22 rather than 6. It also caught a second half I had missed entirely: **`seg`
already exists and is a duration in SECONDS** (`stepDur()*4/1000`), fed to the chord bed as its sustain —
redefining it as a column count would have held every chord for ~15 seconds.

**2. [Critical] The test I offered as proof could not have caught it.** I wrote "`D_jam` must come back
byte-identical, and that is the test." GPT: *"The capture wrapper logs only that `jamStep(s,t)` was
called... Consequently, the proposed broken 64-column cycle can re-capture `D_jam` byte-identically. The
design's principal test is a false oracle."* Verified: the band's `kick`/`snare`/`hat` go straight onto
`jamBus`, never through `DRUMS[i].play`, which is the only percussion the wrapper intercepts — which is
why **every `D_jam` step reads `drums: []` while a drum kit is audibly playing**, and why its own `_note`
concedes its value is "the fact that every step fires a jamStep". This is a re-run of the trap §17 already
records about goldens, and GPT's remedy — a pure event planner — is the same move `meterLayout` made.

**3. [High] My "prerequisite" was not one.** I argued that because 16 mod 6 = 4 and adding 6 preserves the
remainder, whole waltz bars are unreachable, so `＋ patch` had to change. **A bar loop range already loops
`[0,12)` cleanly in a 16-column 3/4 field** — two whole waltz bars, today, with the UI that shipped
yesterday. GPT also showed my completion formula ignored the pickup: with origin 1 the last bar starts at
13 and needs 3 columns, not 2, because completion is `(COLS − origin) mod barCols`. The button change is
dropped. *One correction to GPT's evidence, which I checked rather than passed on:* its suggested `＋ room`
route does not work as stated — `modelInsertTime` calls `shiftMeterOrigin`, so inserting at column 0 drags
the origin along and the final bar stays partial. Its second route needed nothing at all and is the one
that kills the framing.

**4. [High] Two containment holes I had claimed were closed.** `resetTransient` clears Jam and meter but
**never touches `grooveIdx`**, so a Studio waltz walks into a level and a scripted `runReveal({jam:true})`
would play on a 6-column band at the waltz's BPM. And filtering the groove list is a **migration, not a
validation**: since meter shipped, real 3/4 songs have been saving whichever groove was selected anyway,
because `currentSong` always writes `grooveIdx` — so `groove:0 + meter:"3/4"` is the normal saved state,
not a hostile link. **My own addition:** `setMeter` calls `syncMeterUI()` *outside* its `tx("meter",…)`
while `grooveIdx` is part of `snapState`, so any groove fallback there would journal the meter change
without the groove change and undo would restore a mismatched pair.

**5. [Medium] Two label-over-behaviour errors, the failure this log names twice.** I described a "brushed
hat" — `hat` is a 40 ms 8 kHz high-pass noise tick, not a brush. And the legacy chord bed fires
unconditionally at `s%4===0`, so a new `comp` style must be a mutually exclusive branch or the old bed
sounds underneath it, putting a chord on waltz beat 1 and contradicting "bass alone".

**6. [Medium] My tempo justification was empty.** I claimed raising the 170 cap for a session-speed jig
would threaten `conditionSample`'s ceiling. It cannot: that ceiling is derived from the SLOWEST tempo, and
raising the maximum makes notes shorter. `FAMOUS_TEMPO`'s largest value is 156. So the jig being capped
into a lilt is self-inflicted, not constrained — neither GPT nor my design said so; I add it.

**7. [Critical, process] Eight line numbers in my "verified from source" table were wrong.** `snapState`
is 1338 not 1207; `time.groove` 5485 not 5176; packed slot 4 is 5542 not 5201; the tempo input 634 not
585; `stepDur` 5133 not 5142; plus three more. **Cause: I reused numbers from before the meter work added
~300 lines and shifted the file.** Line numbers are only valid against a stated commit, and mine were from
`d434ece` while the design claimed `5cf8417`. The table also omitted the one fact that would have
prevented finding 5's error: `jamStep` has exactly one caller and its argument is the field COLUMN, which
jumps backwards at a loop wrap — so my appeal to the goldens' monotonic `bookTick` was a red herring,
since `jamStep` never sees `bookTick`.

**On my own self-assessment:** all four items in the design's "where this is most likely wrong" were real
and none was the weak point. GPT: *"Section 8 entirely misses this real weak point."* The weak point was
that **the proof and the test were wrong in the same direction** — the arithmetic offered for checking did
not hold, and the golden offered to catch that could not have.

**Cost:** in=1,284,813 (cached 1,168,384) / out=19,475, Sol, fresh thread.

### Same day — PR 1 of 2: the jam seam, behaviour-preserving

Split at GPT's seam, which I agree with: a behaviour-preserving refactor first, dance content second.

`groovePlan(G, step)` is now a pure function returning `{s, chordCols, chord, bass[], kick[], snare[],
hat[]}`, and `jamStep` is a thin renderer that books it. `cycle` defaults to 16 — **the groove's whole
repeat in columns, deliberately not `bar*prog`**, with the reason written at the call site so the next
reader cannot make the same mistake. Kick/snare/hat are lists because lo-fi fires kick from two separate
conditions; they never coincide, and a list means nothing depends on that.

**`tests/groove.test.mjs` holds a VERBATIM copy of the logic as it shipped, as its oracle**, and asserts
`groovePlan` matches it for all five grooves across steps −32..64 — 485 comparisons. Demonstrated that the
oracle bites: the rejected `bar*prog` derivation differs at 5 of 7 sampled steps, so the test would have
failed immediately where `D_jam` passed. Also pinned separately are the details a refactor is most likely
to smooth away: lo-fi's hand-placed `s===6`/`s===14` bass against its silent modulo twins, doo-wop's
octave bounce, folk's root–fifth, and that the gentle kit has no hats at all while the steady kit has one
on every column.

**Verified end to end in a browser, not just in the harness:** intercepting the real `bTone`, `kick` and
`noiseHit` and replaying every groove over steps −8..40 gives **240 comparisons, zero mismatches** — so
the renderer wiring is proved, not only the planner. *A probe artifact worth recording:* the first attempt
intercepted `snare` and `hat` directly and reported 96 false mismatches, because both are `const` arrows
and are not on `window` — exactly the gotcha the goldens README already documents for `stepDur`. Both
funnel through `noiseHit`, which is a declaration; distinguishing them by duration (0.16 vs 0.04) makes
the probe honest. Real playback under the transport still plays the band, at the right ratios.

**Documentation corrected, because it claimed coverage it does not have:** `D_jam`'s `_note` and the
goldens README now state plainly that no golden here can see what the band plays, with the general lesson
spelled out — when a golden cannot see a thing, make that thing a pure function and compare it, rather
than trusting the golden harder.

**Suite: 113 pass** (102 → 113). No groove DATA changed in this PR; a test asserts every shipped groove
still declares no `cycle`.

---

### Same branch — PR 2 of 2: the dances themselves

Every finding from the design review above is answered here; nothing was deferred.

**The content.** `💃 Waltz` (144, C–Am–Dm–G) and `🍀 Jig` (138, C–F–C–G), both `cycle:24` · `bar:6`,
appended and tagged `meter:["3/4"]` / `["6/8"]`. Measured through the real audio helpers, one bar each:

```
waltz   bass·kick   —   chord·hat   —   chord·hat   —
jig     chord·bass·kick·hat   hat   hat   chord·bass·kick·hat   hat   hat
```

Same six columns, nothing in common — which is §17's two-facts claim audible rather than drawn. **No snare
anywhere in the waltz**, asserted over the whole cycle, because a backbeat on two is what stops a waltz
being one. A comp is not a bed: the stab holds 2 columns against the jig pulse's 3 and the shipped
grooves' 4, so `chordHold` joined the plan and the comp branches REPLACE the legacy bed rather than
sounding over it — finding 5's point, which would otherwise have put a chord on waltz beat 1.

**The band follows the bars.** `jamStep` measures from `originTick`: the waltz's OOM lands exactly on the
drawn barline at pick-ups 0, 1 and 2 (band `[1,7,13]` against barlines `[1,7,13]` at pick-up 1). Unmetered
the offset is zero and the expression is the shipped one.

**Finding 3 confirmed by measurement, and the button left alone.** A bar loop range in the default
16-column field loops columns 0–11 forever — two whole waltz bars, six kicks, zero snares. My "＋ patch
must change or a dance can never loop cleanly" was simply false, and GPT's second route needed nothing at
all. Its completion formula would have been wrong regardless: completion is `(COLS − origin) mod barCols`.

**Finding 4's three holes, all closed and all verified in a browser.** `resetTransient` now normalises the
groove — Studio Waltz (index 5) → enter `stepping-stones` → groove is Pop, select lists 0–4, and a scripted
jam reveal there would apply 116 BPM on a 16-column band rather than a six-column one. Only an
incompatible groove moves, so a player's Ballad still follows them into a level. Loading migrates rather
than rejects, since `groove:0 + meter:"3/4"` is *normal* saved state for anything written in the last two
days — and the migration does not call `applyGrooveTempo()`, so a song carrying 96 BPM still loads at 96
and not at the jig's 138 (asserted). And `normalizeGroove()` runs **inside `setMeter`'s `tx`**, so undo
restores a coherent meter/groove pair rather than the old meter beside the new groove.

**Finding 6 acted on, in words rather than code.** The jig ships at 138 quarter-BPM — 92 dotted quarters, a
lilt, not a session jig, which would want 180 against a 170 cap. GPT was right that my reason for not
raising the cap was empty: the sample ceiling derives from the SLOWEST tempo, so raising the maximum only
makes notes shorter, and `FAMOUS_TEMPO` tops out at 156. Left as its own decision for the owner rather
than smuggled into a groove PR, but recorded as free rather than blocked.

**Finding 5's other half:** no "brushed hat" anywhere. The waltz's 2-and-3 ticks are described as what
`hat` actually is — a 40 ms 8 kHz noise blip, a closed hi-hat — because a label asserting a sound the code
does not make is this log's most-repeated entry.

**Suite: 129 pass** (113 → 129). The PR 1 oracle still holds unchanged across all five shipped grooves,
which is the evidence that adding two dances altered none of them; its `chordHold` field was added to the
legacy transcription as the literal 4 columns the shipped renderer hardcoded.

---

## 2026-08-29 — the tempo ceiling, and a jig that can reach its own name (branch `real-jig`)

**No design review.** The question had already been reviewed: finding 6 of the dance-grooves round
established that raising the cap is free, and the owner asked for it directly. What remained was
arithmetic and measurement, which is not what a paper review is good at.

`max="170"` → `max="180"`, and the Jig groove 138 → 180. **Measured from the engine, not asserted:** the
jig's bar is exactly 1000 ms — 60 bars a minute, **120 dotted quarters a minute**, which is a textbook
session jig — and 180 does not clamp when `applyGrooveTempo` assigns it.

**Why raising the ceiling is free, now pinned by a test rather than left in a comment.** The sampled-voice
ceiling `VOICE_MAX_SEC` is governed by the SLOWEST tempo, because that is where an 8-column vine is
longest: 8 columns at 40 BPM is 6 s against a 7 s ceiling. A faster *maximum* only ever makes notes
shorter. **Lowering the minimum is the change that would threaten it**, and the new test says so in those
terms so the next person to touch the dial reads the right warning.

**I overstated the case for my own change, and caught it before committing.** The first version of the
comment said "at 170 the Jig groove could only ever be a lilt". That is false: 170 gives **113** dotted
quarters a minute, which is a perfectly respectable jig. The ceiling bought the last 6%; **the reason the
jig shipped as a lilt was choosing 138 when 170 was already available** — I blamed the dial for my own
number. Both the markup comment and the groove comment now say that plainly, because a comment asserting
a constraint that does not exist is the same failure this log records against labels.

**And the test caught an arithmetic slip in the test.** My first helper computed the pulse rate as
`bpm/3`, which reported the finished jig as 60 a minute and failed. The dial is quarter-BPM and a column
is an EIGHTH, so a quarter is two columns and the field runs at `2*tempo` columns a minute — the rate is
`2*tempo/3`. Same family of slip as the one that made the jig slow in the first place, in the opposite
direction, which is why the helper now spells the derivation out.

**Suite: 132 pass** (129 → 132). No hard invariant touched; the pre-existing "every tempo the game assigns
survives the slider's range unclamped" test now covers 180 against a 180 ceiling, so a future groove that
overshoots the dial fails loudly.

---

### Same day — the free Studio may have any band (owner, 2026-09-05)

Owner: *"when no meter is selected (the free no bars setting), do you think we should make jig and waltz
available in the list of grooves? I don't see why not."* Agreed on the instinct — with no bars drawn
there is nothing for a dance to contradict — **but "unmetered" is the wrong predicate, and the reason is
one this branch already paid for.**

**Every shipped level is unmetered too.** `grooveFits(G, null)` is precisely the test `resetTransient`
uses to decide whether a groove may follow the player out of the Studio, so widening it would have put a
waltz into a package, where a scripted `runReveal({jam:true})` plays its reveal on whatever band is
selected — reopening the exact containment hole the design review found and this branch closed a week ago.

So the offer is gated on the **Studio**, not on the absence of a meter. `grooveOffered(G, preset)` =
`grooveFits(...) || (!preset && G.meter && inStudio())`, and `normalizeGroove` consults the same predicate
so a dance chosen in the free Studio survives a redraw there while still being moved off on the way into a
package. Verified in a browser: **7 grooves in the free Studio, 5 in `stepping-stones`, 7 again on
return**, with the level's groove asserted to carry neither `bar` nor `meter` nor a dance tempo.

**One honest wrinkle, measured rather than assumed.** A dance cycle is 24 columns and the default field is
16, so unmetered a waltz reaches only 3 of its 4 chords and restarts mid-cycle. That is not new — it is
equally true with a 3/4 meter set — and unmetered `＋ patch` adds 16, so 16 → 32 → **48** gives two whole
cycles and all four chords. Worth knowing rather than fixing: nothing here should round `COLS` on the
player's behalf.

**Suite: 137 pass** (132 → 137), the five new ones all about the gate and what it keeps out.

---

## 2026-09-06 — quests get a document, and the first seams under it (branch `quests`)

**Two design-review rounds before a line of code.** GPT's round 1 returned **11 blocking findings** on a
design I had already written; round 2 returned **9 more**, several of the form "only appears fixed." The
verdict both times was to replace rather than patch. Nothing was implemented until round 2, and what
landed is only the first of four sequenced steps GPT proposed when it judged the slice still too large.

**The findings that mattered most were all labels asserting behaviour the code does not have** — this
log's most-repeated entry, committed again by someone who had just read it.

- I named a primitive `pulse.evenWalk` and wired it to `hat8ths`. The even walk is eight **kicks**
  (lane 0, `index.html:3522`); `hat8ths` is the hi-hat shimmer (lane 2). Two of three routes were one
  idea twice. Worse than the review said: the even walk had **no named helper at all**, so the design's
  central claim — "reuse the shipped detector rather than a copy" — never covered it.
- I gated on `playedSinceEdit`. `ev.played` is set inside `start()` at **5376**, meaning *playback was
  started from column 0*, not *heard to the end*. `QUESTS.md` Q7 had already named the primitive
  `playback.completeSinceLastEdit`; shortening it to a bare string is where the semantics were lost.
- My anti-checklist rule compared a `family` string. With one family per analyzer over seven
  primitives, "different family" is true for any two different IDs — the rule collapsed into the
  duplicate check and added nothing. Round 2 found the replacement (`strategyId`) was the same stamp
  under a new name, with a clean counterexample: `contour.anyOf(["rise"])` versus
  `contour.anyOf(["rise","fall"])` over the same kicks — normalized params differ, yet every artifact
  satisfying the first satisfies the second.

**Three of GPT's positions I rejected, and it retracted or conceded all three:** that deferring the
renderer violated Q9 (Q9 scopes the first implementation, not commit 1 — *"I retract the claim"*); that
quest drafts needed identity namespacing (`progress` and `autosave` are already device-wide keys, so
this is pre-existing, not introduced); and that the pulse helpers wanted pure-first signatures plus
wrappers (that churns ~15 shipped `chk` closures for nothing a caller can observe). The transitive bug
inside that last one was real and is fixed: `kickClean(dg)` now calls `kickOn4(dg)`, because defaulting
only the outer function leaves the inner one reading the global while the whole thing looks pure.

### What actually shipped in this commit

Three behaviour-preserving seams, no quest logic: the six pulse helpers take an optional grid;
`kickWalk8` is extracted from the inline closure and the Footsteps goal now calls it; and
`projectTracks(tracks, palId, span)` is split out of `reproject()`, with `projRowIn(p, midi)` split out
of `projRow`. The projection takes its palette **by name** because a saved song carries its own — and a
quest must analyse an A/B snapshot without `applySong()` rewriting the live document, which would
destroy the player's work.

### The tests were the interesting part

GPT authored `tests/quest-seams.test.mjs` independently while I wrote the implementation; all 8 passed
first run, which is the point of splitting them.

**Then `gpt-tester` found the one I could not have found myself:** the `reproject()` agreement test
computes its expectation with `projectTracks()` and checks a wrapper that calls `projectTracks()`. It
proves assignment, not equivalence with the algorithm that shipped. `tests/quest-oracle.test.mjs` now
transcribes the old algorithm verbatim and diffs the two across both palettes, four spans, ties,
fractional and negative onsets, duplicate cells and out-of-range pitches — asserting `gridNote` **object
identity**, not just shape, since it feeds duration lookup and the vine hit test.

**Every test here was mutation-tested, because two of them were false proofs before that.** Reintroducing
the transitive bug fails the explicit-grid test while the "defaults agree" test still passes — so the
weaker one cannot substitute for it. Flipping the nearest-match tie-break from `<` to `<=` fails the
oracle and **nothing else**: 146 of 147 tests pass with a broken projection. That is the whole
justification for the oracle existing. Writing it also exposed that my first "nearest-match ties" case
contained no tie — 70 and 66 both have a strict nearest — so it was pinning nothing until the pitches
became 73 and 63, which are genuinely equidistant.

**One deliberate deviation, pinned rather than hidden.** The old `reproject()` called
`tracks.find(...).notes` unguarded and threw on a document missing a track; `projectTracks()` treats a
missing track as empty, because it also analyses saved songs, which may legitimately carry one. GPT
rated it Low and unreachable from the live path. A test asserts both the new tolerance and that the old
algorithm threw, so the deviation stays a decision.

### The preview server serves the wrong repository in a worktree

**`preview_list` says it plainly: `"cwd": "C:\\Claude\\MusicTheory"`.** The preview tool spawns servers
with cwd pinned to the session's LAUNCH directory, and `EnterWorktree` does not move it — so `"."` in
`.claude/launch.json` resolves to the main checkout, which here held the *other* session's uncommitted
`count-in` work. Cache-busting, `file://`, and a second named config all failed (one server per session,
reused regardless of the name passed). Editing `runtimeArgs` to an absolute worktree path failed too, and
the startup banner said why: **`Starting up http-server, serving .`** — the edited argument never reached
the process even on a genuinely fresh server.

**Measured, not assumed:** 545,418 chars served with no `projectTracks`, against 536,707 on disk with it.
Without that byte comparison the next step would have been loading someone else's code, seeing a working
garden, and reporting a verification that never happened. **A screenshot is not evidence unless you know
which file produced it.**

Worked around by serving the worktree on a spare port and pointing the pane at that URL. The underlying
tooling gap is unfixed and will bite every worktree session in every project.

### Verified in a real browser

Against the worktree's own bytes (fetched and compared to disk first — `identical: true`): the live
document agrees with `projectTracks(doc.tracks, paletteId, COLS)` on `grid`, `drumG`, and `gridNote`
**object identity**; a planted arc renders with model and DOM lit-cell coordinates matching exactly;
`contourSeq()` reads `[2,3,4,3,2]` and `isArch` is true; `kickWalk8()` returns true on the even walk while
`kickClean()` correctly returns false beside it; playback starts with no thrown error and no console
errors.

**Suite: 147 pass** (137 → 147). No hard invariant touched.

### Same day — B1: the persistence split, and a bug the codebase had already scarred over

Step (b) of the quest sequence, first of two changes. GPT authored the design this round and Claude
reviewed it — the reverse of the previous rounds. Two blocking findings came back, and the more
interesting one is why this entry exists.

**The design fixed a real bug and its fix would have shipped a worse one.** `saveProgress()` returned
early for the Studio, so voice, tempo, mixer and read-aloud never persisted there — change your
instrument in the Studio and it was gone on reload. The obvious fix is to let the Studio save its
settings. But `applyRegionInstrument` calls `setVoice(inst)` at **5229, outside** the
`if(!instrUnlocked(inst))` guard, so it is not a first-visit gift: **every** Studio entry forces the
voice to guitar. Persist that and one visit to the Studio silently overwrites the player's instrument
everywhere. The design named the hazard — *"the subsequent Studio render will now persist that
default"* — and assigned it to browser testing rather than solving it.

**The codebase had already been bitten by the same bug, in a different control, and patched the
symptom.** The comment above `tempoOnLoan` says it outright: *"saveProgress fires on level completion,
a voice change, the mixer, read-aloud — so without this, watching Taps left the game stuck at 40 BPM
on every reload."* A famous tune's tempo is a loan, and a loan mechanism exists because a package save
would otherwise launder it into `progress.settings`. That is the general bug; the tempo loan is one
instance of it wearing a bandage.

**The fix is a primitive, not a rule.** `commitProgress()` is the only sink and **never reads a live
control** — it serialises what is already in `progress`. `saveUserSettings()` is the only function that
samples the controls, and it is called from exactly four explicit player handlers (read-aloud, tempo
`change`, instrument `change`, mixer). `savePackageProgress()` advances a package and deliberately does
not touch settings. So `applyRegionInstrument`'s unconditional `setVoice` still changes the session's
sound and cannot reach saved state, because nothing on that path samples anything. Claude proposed
"persist only on explicit change"; GPT's separation of *commit* from *snapshot* is the better shape,
because it removes the path rather than adding a rule someone has to remember.

**Both halves verified in a browser, live state against stored state:**

```
fresh after ?reset                live musicbox   stored (unset)
entered Studio                    live guitar     stored (unset)   ← regression prevented
player explicitly picked musicbox live musicbox   stored musicbox  ← bug fixed
re-entered Studio                 live guitar     stored musicbox  ← choice survives
```

and the laundering path with it: a programmatic tempo change followed by a package save leaves stored
settings untouched, and the explicit choice survives a reload.

**The second blocking finding was the design contradicting its own principle.** It forbids a second
mutable package identity — *"there is no second variable with which the scope can disagree"* — then
specified that a quest's `stepIdx` mirrors the QuestRun phase while the generic stage engine stays free
to move it. Two writable sources for one fact. The revision resolves it structurally for B2: `stepIdx`
becomes lesson-only `lessonStepIdx`, `currentStepIndex()` reads the run without mirroring, and lesson
advancement asserts non-quest scope.

**Suite: 156 pass** (147 → 156). The nine new persistence tests were mutation-tested: re-adding the
settings snapshot to `savePackageProgress()` fails two of them. All 13 `saveProgress` call sites were
migrated by intent, and the only surviving `Store.set("progress"` sites are the sink itself, cloud-pull
installation, and `?reset` — the audit the design asks for. The vestigial root `progress.toolbox` is
gone from both default literals and is deleted from any legacy profile on load; every
`progress.packages[id].toolbox` is untouched.

`currentPkg` survives this change on purpose. B2 replaces it, along with the temporary
`requireCurrentPackageIdB1()` guard that exists only to make wrong calls loud in the meantime.

### Same day — B2: one authoritative play scope

`currentPkg` and `LEVELS` are gone. Not aliased, not deprecated — removed, with 34 and 26 reads
migrated to a single frozen descriptor assigned in exactly one place.

**Why an additive scope would not have done.** The first draft kept `currentPkg` beside a new scope
object, and the review's objection was that two mutable identities guarantee eventual drift. It is
right, and the concrete damage was already visible: as `currentPkg="firefly-crossing"` a quest would
write its tray into `progress.packages["firefly-crossing"].toolbox` and cloud-sync a quest slug — the
per-package toolbox invariant breached through the back door — while as `"studio"` nothing would
persist at all, killing resume. Neither default was safe, so the identity had to stop being a package
id at all.

**The same argument then caught the design contradicting itself.** It specified a quest's `stepIdx`
as mirroring the QuestRun phase while leaving the generic stage engine free to move it — two writable
sources for one fact, the very thing it forbade for `currentPkg`. Resolved structurally rather than by
convention: `stepIdx` is now `lessonStepIdx` and is package/Studio only; `currentStepIndex()` READS
the run in quest scope and never mirrors it back; the next-button path returns early for a quest, so
the lesson engine cannot advance a phase. A test pins the asymmetry — moving `lessonStepIdx` in quest
scope changes nothing, moving the run's phase changes `curStage()`, and the run is never written back.

**The quest envelope reuses shipped machinery instead of duplicating it.** A quest is ONE level whose
`steps` are its phases, so `levelIdx` is always 0 and the indexed-stage engine that already renders
"Calm Reply, Bold Reply" renders phases too. No second renderer.

**Two shipped defects fell out of the migration rather than being hunted.** `openStudio()` was
mutating the shipped catalog — `PACKAGES.studio.levels[0].palette = widestPalette()` — to smuggle a
value into a per-package lookup; `scopePalette()` computes it and the catalog entry stays clean. And
`renderLevel()` reset the step index unconditionally, which would have erased a resumed quest phase
the instant it drew; entry sets the step now, render does not.

**Verified in a browser, all 21 shipped packages plus the Studio through the real entry path:** every
one renders with the correct region tint, palette, row count, stage count and title, and no console
errors. Toolbox isolation holds across A → B → Studio → A with no leak and no `progress.packages.studio`.
The groove policy is untouched — **7 grooves in the Studio, 5 in a package**, the same numbers the
`real-jig` entry above recorded, which is the cheapest possible proof that this migration did not
quietly widen it.

**Suite: 166 pass** (156 → 166), including a differential oracle that walks every entry in `PACKAGES`
and asserts stages, first-level identity, region, companion region, palette, catalog id, toolbox owner
and level-0 features against the shipped definitions.

**The tests had a back door production code no longer has.** Three files assigned `g.currentPkg`
directly; they now go through `setPlayScope()`. That is worth more than the tidiness — a test that can
reach a state the game cannot is testing something the game does not do.

**No quest entry point ships here.** `QUEST_RUNS` exists only so quest scope is a tested contract;
step (c) owns the run store, its transitions, and the completion gates. Quest presentation fails closed
in the meantime: no companion, no inherited controls, no inherited palette, and `scopeCatalogId()`
returns null so a quest cannot appear in the dev package selector or the map.

### Same day — C1: proving a pass was heard, not merely started

First of three commits in step (c). GPT authored the design, Claude reviewed it.

**The shipped signal means the opposite of what the requirement needs.** `ev.played` is assigned inside
`start()` at `index.html:5478`, before a single column has sounded — it means *playback was started from
column 0*, which is right for a listen-goal and useless for `QUESTS.md` Q6, which needs proof that one
revision of one version traversed its whole span **at audible time**. Three traps sit between the two:

- the pump books **ahead** of the audio clock by a lookahead window, so the loop wrap at
  `bookCol=loopA()` happens before the player has heard the end of that pass;
- `paintDue()` admits entries at `ct+0.02` and coalesces a backlog to the **last** due entry, so it can
  credit ~20 ms early and can miss a wrap entirely under a delayed drain;
- `stop()` is called both by the natural end and by the player pressing ■, so it cannot tell a finished
  pass from an abandoned one.

Claude's first proposal — watch the painted column go backwards — walked into all three. GPT's demolition
of it is the useful artifact; the replacement rides the audio clock on its own queue, and the reducer
proves traversal from the **actual booking sequence** rather than trusting a `fullPass` flag handed in by
the transport. A pass counts only if bookings arrive as `0,1,2…end-1` with no gap, duplicate or reversal.

**Claude raised three objections; the measurement killed the one it called a risk.** The worry was that
persisting a whole run on every edit transaction would block the scheduler's thread, since the shipped
autosave is debounced at 1.5 s for that reason. Measured instead of argued: a run holding **two** full
16-column v3 songs is **2 KB** and writes in **0.01 ms**; the whole 12-run registry at the design's cap
is 26 KB and 0.04 ms. Three orders of magnitude below a frame. The assumption was that a v3 song is
bulky; it is about a kilobyte, because the field is small by design. Objection withdrawn, along with the
"owner decision" that had been invented on top of it.

The two surviving objections were applied as amendments rather than another review round: `questPhaseIndex`
returns a sentinel instead of throwing, because `curStage()` sits on the paint path and a throw there is a
crash rather than a wrong answer; and step (d) must surface the selected-range case, since `start()` seeds
`step = rangeOn() ? loopA() : …` — so with bars 8–16 selected no pass can ever begin at 0, and *Offer*
would tell a child to play it through when they just did.

**A TDZ crash caught by the suite, not by reading.** Installing the reducer above `pump()` put
`let completionState` after the load-time `setPlayScope()` call that now cancels sessions — every test
died with *"Cannot access 'completionState' before initialization"*. Moved above the scope model. Worth
recording because the failure was total and instant; a lazier wiring would have failed only in quest scope,
months later.

**Every test paired with the mutation it must catch.** Five mutations, each caught by the test that names
it: borrowing paintDue's 20 ms allowance; trusting the last column instead of the traversal; coalescing the
backlog as painting does; letting a mid-span start begin a tracked pass; and treating a retime as a wrap.

**The goldens.** `playback.json` is not read by any test — `meter.test.mjs` only mentions it in a comment —
so a green suite proves nothing about scheduling. `G_loop_wrap` was re-captured on the current build:
columns `0..15` then `0,1,2,3`, `tickBeforeWrap` 720, `tickAtWrappedZero` **768**, monotonic across the
wrap, exactly as its `_ASSERT` records. The other eight were not re-captured, and `_RESULT_2026_09_06`
says so.

**Browser proof of the whole point, in two numbers:** at 900 ms into a pass the pump had already booked
past the boundary and **zero** receipts existed; the receipt arrived at `3.061` against a boundary of
`3.000` — one pump tick after audible time, never before.

**Suite: 178 pass** (166 → 178). No quest entry point ships; `onCompletePass` is a null sink until C2
gives a receipt somewhere to go.

### Same day — C2: a receipt is a claim; only a persisted transaction is evidence

Second of three commits in step (c). C1 could prove a pass was heard; nothing could remember it.

**The rule this commit exists to enforce:** a completion receipt from the scheduler is only a claim
about what was heard, and becomes quest evidence only if a persisted transaction accepts it. So a lost
write can never leave the game believing a pass happened. `transactQuestRun()` reduces a candidate,
persists it, and publishes it **only after the write lands** — and `Store.set()` now returns a boolean
instead of swallowing quota failures, which is what lets a transaction fail closed at all.

**Two independent defences against a stale credit, deliberately.** An edit cancels the completion
session, so a boundary booked from the old revision is never dispatched; and `completePass` refuses a
receipt whose `editRev` no longer matches, so even a wiring failure cannot credit the wrong revision.
Either alone would look sufficient. A mutation test removes each separately and a different test fails.

**A tray change is not a song change.** Crafting a stamp writes `tray` and leaves every `editRev`
alone — otherwise opening your own toolbox would make you replay the piece you had just finished
playing. That distinction is a reducer branch, and a mutation that bumps the revision on a tray edit
is caught.

**Quest state never enters `progress`.** `cloudPush()` PUTs the whole progress object and a run holds
two full songs, so runs live at their own `mg_questRuns` key, capped at 12 and pruned abandoned-before-
completed, never pruning an active run. Verified in a browser: after a real edit and a real crafted
tool, `mg_progress` contains no trace of the run and `progress.packages` is untouched.

**Hydration drops a malformed run rather than repairing it.** A run whose `runId` disagrees with its
key, or whose phase is missing or negative, is ignored — because a wrong phase is worse than no run:
it would render a quest at the wrong step and look like progress.

**The whole chain, measured in a browser:** a real edit through `modelSetCell` moved `editRev` 0 → 1
and forfeited the live session; a real playback then produced an audible-time receipt that a persisted
transaction accepted, leaving `lastCompletePlayRev === editRev` **on disk**, not merely in memory; and
after a reload the run hydrated with its revision, its evidence and its tray intact while boot restored
the last *package*, since no quest entry point ships yet.

**Seven mutations, seven catches:** accepting a stale receipt; keeping the ops a failed transaction had
already applied; sharing the song object on a fork instead of copying it; publishing a candidate whose
write failed; burning a revision on a no-op edit; bumping the song revision on a tray change; and
hydrating a phaseless run as phase 0.

**Suite: 192 pass** (178 → 192). `EDITOR-DESIGN.md`'s claim that the rolling autosave "fires on every
transaction" is now false in quest scope and says so.

### Same day — C3: one writer for the phase, and an offering that cannot strand itself

Last of three commits in step (c). Step (b) established that a second mutable identity guarantees
drift; C3 applies that rule to the phase. `advanceQuestPhase()` is the only post-construction writer
of `run.phase`, and the reducer's phase step is private to it — the lesson engine, the next button and
`stageComplete()` are all structurally unable to move a quest on.

**The whole of Q6's "played completely since its latest edit" is two numbers:**
`v.lastCompletePlayRev === v.editRev`. No live document, no paint state, no clock, no transport
session — which is exactly why it can still be trusted after a reload.

**A gate that throws is a closed gate, not a crash**, and only the literal `true` opens one. Both are
mutation-tested, because "truthy" would let a gate returning a descriptive string wave a quest through.

**Ordering IS the recovery guarantee.** localStorage cannot write two keys atomically, so finalisation
runs artifact-first, then `saveAs`. A completed run can therefore never exist without its artifact, and
any run left mid-offering finishes on the next load.

**Two of my own tests were false proofs, and the mutation pass caught them.** The ordering test
asserted the end state — both the artifact and the completed run existed — which is true whichever
order they happen in. The upsert test never ran a second upsert at all, because the run had already
completed by the time the retry came round. Rewritten to test the property rather than the outcome:
one makes only the `saves` write fail and asserts the run stays `offering`; the other calls the upsert
three times directly and asserts one song.

**The rewritten ordering test then failed against the shipping code, which is the point of writing it
that way.** `questArtifactUpsert()` called `setSaves()`, which called `Store.set` and **discarded the
return value** — so on a full disk the artifact write failed silently and finalisation completed the
run anyway, stranding it exactly as the ordering exists to prevent. `setSaves()` now returns the store
result and the upsert propagates it. A real defect in shipped code, found by a test written to catch a
mutation rather than to demonstrate a feature.

**My own amendment to the design, applied here:** `questPhaseIndex()` returns a `-1` sentinel rather
than throwing for a missing or terminal run. `curStage()` sits on the paint path, so a throw there is a
crash rather than a wrong answer; exactly one caller — the entry/resume path — treats `-1` as "decline
to enter", and rendering degrades to phase 0. A mutation that defaults an unusable run to 0 is caught,
because a wrong phase renders as progress and is worse than no run at all.

**The full lifecycle, in a browser through real code paths:** advance before hearing → `gate-closed`;
a full pass → gate open; advance with a fork → phase 1, draft B, `curStage()` renders "phase 2"; edit
B → revision 1 and the gate shut again; play → open; offer → `offering`; finalise → `completed` with
exactly one saved artifact titled *The Firefly Crossing*.

**Suite: 205 pass** (192 → 205). Eight mutations, eight catches. `SAVE-SHARE.md` records the two `meta`
fields a quest artifact carries. Still no quest entry point and no renderer — step (d) consumes three
stable doors: `advanceQuestPhase()`, `start({versionId, purpose})` and `transactQuestRun()`.

### D1 — the sealed catalog

**The Firefly Crossing is now data.** 15.5 KB of JSON in `BUILTIN_QUEST_CATALOG_JSON`, parsed and
validated at boot by the same front door a future Questmaker import would use. Official content gets
no shorter path to trust than a player's would — which is the whole reason quests are declarative in
the first place. No analyzers, no evaluator, no UI; nothing player-visible yet.

**Inline JSON, not `fetch`.** It is the only loading strategy that satisfies all four constraints at
once: no network (an `AGENTS.md` invariant), survives `file://`, no `netlify.toml` change, and reachable
from the vm harness.

**`assertPlainJsonTree` refuses a getter by inspecting its descriptor, never by evaluating it** — a gate
that discovers an accessor by calling it has already run the code it exists to keep out. It also rejects
`__proto__` / `prototype` / `constructor` keys (`JSON.parse` creates a real own `__proto__` property —
the pollution route parsing genuinely leaves open), non-`Object.prototype` prototypes, array holes,
non-finite and out-of-range numbers, depth > 12 and > 10,000 nodes.

**The grammar spec gives unknown-key rejection for free**, at every level, because validation walks the
declared shape rather than the value. Schema dispatch is an own-property lookup on the version:
an unrecognised `v` is refused, never quietly handed to the newest validator.

**Cross-references are checked only where D1 can actually resolve them** — packages, palette, witness
and phase ids, challenge capability equality, reflection/`versionIds` agreement. Analyzer, descriptor
and capability ids are deliberately *not* checked here: their registries are D2's, and a lookup against
an empty registry is a check that always passes, which is worse than no check at all.

**GPT's design failed its own validator on the first run.** It specified an all-lowercase primitive-id
grammar and then used `contour.anyOf` as its own example id. Renamed to `contour.any-of`; there is now a
test asserting `contour.anyOf` is rejected, with the reason recorded in the test itself.

**A `grep` in `index.html` started returning "Binary file matches."** Literal bidi-override characters in
the text-safety regex made the one file this project searches constantly unsearchable. Rewritten with
`\uXXXX` escapes. `QUEST_TEXT_BANNED` exists because `renderStage` writes `levelTitle.innerHTML`, so an
authored title is exactly the string that reaches it.

**One more false proof of my own.** The prototype-lookup test probed with `"toString"` — whose capital S
fails the *slug* grammar first, so it never reached the cross-reference check it claimed to test. Now
`"constructor"`: all-lowercase, a valid slug, and on `Object.prototype`.

**Q5's ceiling of two observations per route is now structural** — a third is a schema error, not a
review note. So is "at least two routes": one alternative is a hidden single answer.

**Suite: 227 pass** (205 → 227). Sixteen mutations, sixteen catches — the last needed a second attempt,
because my *mutation* was wrong rather than the test: a `SyntaxError` from `JSON.parse` carries no
`.code`, so the rethrow I wrote never fired. Retried unconditionally: caught by 26 tests.

### D2 — the registries, and routes proved apart by songs

**Quest data names primitives; engine code decides what they mean.** `QUEST_PRIMITIVES` holds nine
musical analyzers and four procedural gates, `QUEST_CAPABILITIES` and `QUEST_DESCRIPTORS` the rest.
`songEvidence(song)` is pure and never calls `applySong` — loading a snapshot to inspect it would
destroy the player's current work to answer a question about a different song. `contourSeq()` is now a
three-argument wrapper around `contourSeqFromGrid`, so the 24 shipped levels and a quest read one rule.

**Analyzers and gates share ONE id space, distinguished by a `kind` field.** Separate maps would make
Q5's rule 6 — "procedural facts are separate" — true by accident. Together, a gate id inside a route is
`procedural-in-route` and an analyzer id in `procedure.gateIds` is `musical-as-gate`: two checks that
can actually fail, and both are mutation-tested.

**There are no author-written `implies[]` anywhere in the grammar**, because a definition that could
assert its own two routes were different would make the alternatives check decorative. Enum-set and
numeric-threshold implication are derived from the engine parameter schemas; cross-analyzer relations
are a declared table; anything undeclared is `unknown`, which rejects rather than shrugs.

**Rule 5 is enforced twice, by different means.** Derived implication rejects semantic containment —
`contour.any-of(["rise"])` really does imply `contour.any-of(["rise","fall"])` over the same kicks, and
the JSON looks nothing alike. Executable witnesses then prove each route reachable and observably
distinct: for every ordered pair, a witness **referenced by A** must match A and fail B. The mutation
that accepts a distinguishing witness in either direction is caught; so is the one that lets a route
borrow any witness in the definition.

**`kickClean` being strict is what makes phase 2 true.** The even walk lands on 0/4/8/12 as well, so a
permissive `kickOn4` would put both families on one song and "you changed the heartbeat" would silently
stop being a real observation. Mutation-tested.

**GPT's tester found a real defect, and I took the finding but not the remedy.** A v3 document may
declare `time.cols: 1` and still carry events out at column 12; `applySong` widens it to the editor's
16-column floor and every one of them comes back. Reading the declared width made a clear rise over
clean main-beat kicks analyse as **no contour and no pulse at all** — a quest would have refused a song
that visibly satisfied it. GPT proposed rejecting sub-16-column songs as malformed. I disagreed: the
evidence seam must not be stricter than the song loader, or a snapshot taken from ordinary saved or
shared v3 data would fail analysis the game is perfectly happy to open. `songEvidence` now uses
`Math.max(16, cols)` — the same span `applySong` computes — and the test asserts the two agree.
GPT also caught a flaky test of mine that compared two `currentSong()` JSON strings whose `meta.updated`
timestamps could differ by a millisecond; it now compares the music.

Everything else GPT was asked to attack, it cleared: per-capability implication is sound under rule 4;
ordered-pair witnesses are correct; canonicalisation is sufficient for the current schemas; differing
snapshot ids should stay `unknown`; and `songEvidence` reads no live grid or palette. It agreed
`unknown` is unreachable for valid v1 content and is a fail-closed guard for a future analyzer added to
an existing capability — which is the honest answer, and it is recorded in the test file rather than
papered over with a test that cannot fail.

**Two defects I found in my own code by reading it while GPT ran.** `questSemantics` threw a TypeError
on a definition whose analyzer params failed their schema — it fed un-normalized params to the relation
algebra. It failed *safe* only because the loader's catch happened to keep the errors already
collected; every check after the throw was skipped, and any caller outside that catch got a crash
instead of a report. And a snapshot clause could name the phase's own version, asking whether a song
differs from itself — never true, a route no player could finish, dressed as a real alternative. Now
`snapshot-not-source`. The registries are deep-frozen for the same reason quest definitions are: a
shallow freeze leaves every entry writable, so one assignment could redefine `pulse.even-walk` for
every quest at once, including one in progress.

**Suite: 258 pass** (227 → 258). Thirty-two mutations, thirty-two catches — one of them, deep-freezing
the registries, escaped until I wrote the test that names it, which is the point of running the pass at
all. `QUESTS.md` had the primitive whitelist written in camelCase, which the shipped ID grammar
rejects, and a stale `index.html:4944` line reference; both corrected. Browser-verified: the catalog
boots with zero errors, `questSemantics` passes the shipped quest over real songs, and "Make the melody
climb" still passes a climb and rejects a descent through its own `chk` closure.

### D3 — the evaluator, and what the garden says back

**`evaluateQuest(def, evidence, run)`** turns a definition, pre-extracted evidence and a run into an
answer, reading nothing live — no DOM, grid, audio, clock, Store, progress or scope. Its output carries
no score, grade, confidence or "closest route", and a test asserts none of those words appear anywhere
in it.

**Descriptions follow the facts, not the question.** A `contour.differs-from-snapshot` clause that did
NOT match still reports *"The lights kept their Rise shape."* — what was true — rather than a negation
of what was asked. That falls out of hanging `describe` on the facts instead of on the asking analyzer,
and it means the same music narrates identically whichever route inspected it. Slot values are enum ids
resolved to engine labels; a definition can choose which descriptors a route names but never the words.
When a song lands on two families — C-D-E-D-C is genuinely both a hover and an arc — the sentence names
the first in the ENGINE's canonical order, so the same music never renders two different ways.

**Observations persist as ids and slots, never rendered text**, so a later rewording reaches runs saved
before it. They ride in the SAME transaction as the playback credit that earned them.

**One copy change, found by reading the browser rather than a test.** The design's *"The roots kept the
{pulse} heartbeat."* rendered as *"The roots kept the main-beat kicks heartbeat."* — not a sentence to
read to a six-year-old. Now *"The roots kept their main-beat kicks."*, which works with all three labels.

**I argued `nonempty` should be reported rather than gated** — `completePass` already refuses an empty
song, and emptying a credited one bumps `editRev` and shuts the playback gate, so gating on it would be
a condition that cannot be false. I pinned that reasoning as a test rather than leaving it an argument.

#### GPT found four defects, and all four were real

1. **The receipt never recorded anything.** `onCompletePass` submitted `[completePass, (audition)]` and
   nothing else — the op existed, the sink never used it, so in real play no observation would ever have
   been written. D3 was incomplete and the unit tests could not see it, because they called the reducer
   directly.
2. **A phase-1 receipt could write a phase-3 observation**, and could carry any `heard-*` descriptor —
   including a forged *"the second path changed"* that no phase-1 analyzer can produce, since phase 1
   has no snapshot. Now the receipt must name the phase the run is ON, that phase's own version, and
   only descriptors its own analyzers declare they can say.
3. **The dedupe was not semantic.** Keyed on the raw slots object, `{id}` and `{id, slots:{ignored}}`
   were two facts, and *"The lights climbed."* was said twice. Now keyed on the slots the descriptor
   actually declares, and a slot key the wording never reads is refused outright.
4. **"Empty" meant two different things.** A note at column 16 of a 16-column song is dropped by
   `applySong` and heard by nobody, but `completePass` counted the array entry and handed out a playback
   credit for silence. This is the same bug class as GPT's D2 finding, one seam over.

That last one forced the rule to be stated properly rather than patched: **the evidence seam normalises
exactly as `applySong` does.** `setPalette` falls back to pentatonic for a missing or unknown id and
`applySong` widens any width to 16, so `songEvidence` now does both — refusing there what the game opens
without complaint would judge "empty" a song the player just heard, and a share link carrying a stale
palette would cost them a credit they earned. The fallback is reported, never hidden, and **authored
content is held to the higher standard the runtime cannot be**: a witness that leans on the palette
fallback is a catalog error, because a witness silently reinterpreted under a different ladder proves
the wrong thing about the route it exists to prove.

Fixing that exposed three test files whose v3 fixtures used `role:` where the format uses `kind:` — they
had been passing incidentally, against a shape the game never produces. Corrected.

Two of GPT's "is this fine?" answers were also useful: `evaluateQuest`'s whole helper chain is clean of
live reads, and `run.selection || run.draft` names the right version in every reachable phase-3 state.

**Two guards I added that no test could reach until I wrote one.** The receipt sink declines to describe
rather than declining to credit — a refusal inside a one-transaction receipt would take the playback
credit down with it, so auditioning A during phase 2, a pass in the compare phase, and a run whose
snapshot no longer analyses all credit the pass and say nothing. And a test now walks every family
combination of every analyzer to prove `describe()` can never emit a token outside its declared
`heardDescriptorIds` — otherwise that refusal would turn on the player and reject a real observation.

**Suite: 288 pass** (277 → 288). Thirty-four mutations, thirty-four catches. GPT's five adversarial
tests are kept as it wrote them, in `tests/quest-adversarial.test.mjs` — the value of an adversary's
test is that the person who wrote the code did not write it. Browser-verified: a full quest narrated
through the real receipt sink, phase 1's description still remembered at phase 2, the stored form
carrying ids and slots with no frozen wording, and the silent song refused a credit.

`README.md` still said quests were "A plan — nothing built yet" and that Firefly was "specced and
unbuilt"; both had been false since D1 and neither the new code nor the new document would have prompted
the fix, because they live in README's own status prose.

### D4 — the phase controller

**The first code a player could move through.** `enterQuestRun` resolves the run's own definition
version and refuses rather than guessing; `performQuestAction` is the single door for continue,
audition, compare, choose, offer, abandon and leave.

**It branches on data, never on phase number.** A phase's gate is the AND of the gate ids THAT PHASE
declares; what a transition does besides moving the phase is named by its `transitionId`. Mutations
that hardcode phase 1's gate, fork on every transition, or let the compare phase advance are all caught.

**A quest step carries no `goals` on purpose.** `checkLevel()` only calls `stageComplete()` when a goal
list is non-empty, so that absence is what structurally stops the lesson engine from moving a quest on.

**The audition lock.** The comparison applies A and B in turn, so the grid holds a version that is not
the draft; without a guard the next edit persists A over draft B. I checked the claim instead of
assuming it: there are exactly two producers of a run `edit` op, and the other writes the tray, which
the reducer keeps separate from the song.

**Two defects I found by attacking my own work.** A `starterSong` was unvalidated, and one narrower
than the workspace would give the run a span that never matches the field `applySong` builds — so
`beginCompletionSession` would refuse forever and the quest would open, look right, and never credit a
single playback, with nothing to say why. Four catalog checks now, all mutation-tested. And a listening
lock could outlive its comparison; it is cleared in `setPlayScope`, for the same reason a completion
session is.

#### GPT found two more, and the second one I fixed differently than it asked

1. **Undo lost quest work.** `restoreSnapshot()` called `scheduleAutosave()` — which is not the quest
   write door at all. An undo therefore changed only the live document: leave, come back, and the
   undone note was still there. It now calls `noteEdit()`, which is what already means "the document
   changed" in both scopes, so there is one door again rather than two, one of which quietly did
   nothing.
2. **Undo during an audition stranded the lock**, leaving the grid and the run out of step. GPT
   expected undo to release the lock and hand the draft back. **I disagreed:** undo is not a "stop
   listening" button anywhere else in this game, and during a comparison there is nothing of the
   player's to take back — only songs the game applied for them to hear. Instead: applies that are not
   player work no longer enter the journal (the rule `openStudioWith()` and the cloud load already
   follow), and undo refuses outright while a lock is held. The way back to the draft is choosing,
   which is the act that means "I have heard enough".

**Three of my own guards turned out to mask each other.** `journalClear()` after the audition apply,
`journalClear()` after choosing, and the undo lock guard each fixed the same case, so no mutation could
distinguish any of them. Belt and braces are only worth it when a mutation can still tell them apart:
the audition clear is gone, and the other two are now separately proven — one by asserting after EVERY
undo press rather than the last (keep pressing and the journal runs out back into a state that is also
B, so checking only the end proved nothing), one by pressing undo more times than there is history for.

**One guard is kept without a test, and said so out loud.** The matching guard in `redoEdit` cannot fire
today — `tx()` empties the redo stack on every commit, and applying the audition's song is a commit — so
a test would pass whether the guard were there or not. That is a false proof, and this project has
caught five. The reasoning lives beside the guard instead.

**Two mutations escaped, and both are equivalent rather than uncaught.** `gate(...) !== true` → `!gate(...)`
agrees under every shipped gate, so it is pinned from the other side by a test that each answers with a
real boolean; and `run.selection` → `run.draft` at offer time agrees because `choose()` sets both — I
changed the code to use `run.selection` alone anyway, matching the offer reducer, so there is one
expression rather than two that happen to.

**A test-hygiene bug worth remembering before D5.** The first mutation run HUNG. A test that calls
`start()` leaves the transport running, and when the assertion after it fails the test never reaches
its `stop()` — so a red test became a hung suite instead of a report. Every playing test now stops
through `t.after`, which runs on failure too.

**Suite: 310 pass** (306 → 310). Thirty-two mutations, twenty-nine caught, two equivalent, one kept
deliberately untested. Browser-verified twice: a full Firefly played end to end through
`performQuestAction` alone — gates shutting and opening at each phase, the draft surviving a stray poke
during both auditions, `gate-closed` until a version was chosen, one ordinary v3 song saved as *The
Firefly Crossing* — and then GPT's undo case, which now survives leave and resume.

`README.md` now says plainly that `startQuestRun("firefly-crossing")` from the console is the only door
and that the panel beside the field still shows whatever was there before. The shell is D5.

### D5 — the quest shell

**The DOM a child actually sees.** A separate `#questCard`, not a re-dressed `#levelCard` — goals, the
hint and "Next level" are package ideas, and blanking each one every render is how they come back.
`renderStage()` gains one quest branch as its first line. `questShellModel(run, def, view)` is pure and
takes the live-only facts as an argument, so what a child is TOLD is testable without a browser; the
renderer is deliberately dumb and writes textContent only.

**Q5 rule 7, made structural.** One intention, a collapsed "Ways this could work", neutral observations
after a completed playback, a saved line only once the write lands. A test asserts the model contains
none of *score, percent, grade, matched, correct, wrong, best, closest* — anywhere in its JSON.

**§8.8's selected-range trap**, in the design's exact words, shown the moment Play starts under a
partial selection AND repeated when a shut gate is pressed, with a one-tap **Play the whole song**.
`questRefusalText()` is split from the display so the choice of words is testable, and a test asserts
the phrase "play it through" never appears — a loop over part of a song can never complete, so advice
implying another lap will help is advice that cannot work.

#### Three defects the browser found that the pure tests could not

1. **`resetTransient()` wipes the field and truncates to 16 columns THROUGH `tx()`.** Painting a quest
   therefore rewrote the draft as an empty song and shut the playback gate on the way in. Hence
   `questPainting`, and one `questPaintField()` that resets and re-applies as a single deaf operation.
2. **The workspace was declared and never applied.** A quest opened with the drum bed shut — and the
   Firefly asks for a heartbeat in its first phase. `enterQuestRun` now calls `renderLevel()`, which is
   what turns a feature set into a screen, and the envelope carries the two flags it reads off a level.
3. **The one-tap fix shipped DISABLED.** The renderer disables any action that does not say `enabled`,
   and the notice's action did not say it. The pure test had checked the action existed, not that it
   could be pressed. There is now a test asserting every action the model emits declares a boolean
   `enabled` and a non-empty label, so the next action added cannot repeat it.

**And one the mutation pass found.** A guard I wrote as an optimisation — only record the comparison the
first time both paths are heard — turned out to be a dead end. A comparison stores the REVISIONS it
compared, so adding one more seed to the path they had just chosen left it stale, shut both comparison
gates, and nothing refreshed it: **offering became permanently impossible, and replaying did not help.**
The comparison is now re-recorded on every receipt and the reducer decides whether it is allowed.

#### GPT found two more, and a third in its answers

1. **The audition lock was too late.** `noteEdit` refused to persist, but `tx()` had already changed
   what the child could see and journaled it. The refusal belongs where the finger lands: `cellClick`
   and `drumClick` now decline first, and say why.
2. **Tempo, groove and voice never reached the run**, though `currentSong()` serialises all three — so
   the offered artifact could carry a different tempo from the one the child heard, with the playback
   gate still open. They commit on "change", not "input": a slider fires "input" per pixel of a drag,
   and one run transaction per pixel is not a revision history. Deliberately quest-only; a test pins
   that a Studio tempo change still schedules no autosave, because making packages start doing that is
   a different change from this one.
3. In its design answers: **"finished" wrongly included `offering`.** That is the state a failed
   artifact write leaves behind — nothing was saved — and the child was told the garden had carried
   their song away, with only "Leave for now" to press. It now says what is true and offers **Try
   saving it again**, the same recovery the next load runs by itself.

**Two guards removed for being untestable duplicates**, per the standing rule: the `every(...)`
precondition on the comparison (the reducer already refuses unless both are heard) and the status check
before a retry (`finalizeQuestOffering` already refuses anything not mid-offering).

`questLastRendered` is new: the model the shell last painted. The DOM is only inspectable in a browser,
so without it the repaints themselves are invisible to the suite — which is exactly how the completion
moment shipped silent.

**Suite: 335 pass** (326 → 335). Twenty-nine mutations, twenty-nine caught. Browser-verified end to end
through the shell's own buttons with real audio: a real playback credited and described, the fork,
phase 2's *"The second path changed from Rise to Fall. The roots kept their main-beat kicks."*, both
auditions putting the right song on the grid and recording the comparison unasked, the range notice with
its working one-tap fix, and one song saved as *Night Bridge* with the completion line beneath it.

### D6 — the way in

**A child can now reach a quest by clicking.** `questEligibility` is an AND over package completion and
nothing else — capabilities are never read from progress, and a quest gates no package, palette,
instrument, tool or Studio control. It is a door, not a fence.

**`surfaceQuest` returns at most one thing, and always the same thing.** A song stuck mid-save outranks
everything, because it was never written; then the most recently updated live run; then the
lowest-priority eligible quest never completed; then nothing. Ties break on quest id and then run id, so
two identical profiles surface identically whatever order the keys happen to be in.

**Q22's calm, tested.** One card below the map, outside the SVG. A test asserts the model contains no
"!" and none of *badge, new!, unread, reminder, expires, today, streak, don't miss*. A finished quest
leaves the map entirely and lives only in the trail, as **Start a new version** — and replay goes
through `startQuestRun`, so it gets a new run id and therefore a new artifact id. The first offered song
is never written over; there is a test that finishes the quest twice and checks both songs survive.

**The trail lists the OTHERS.** The quest already on the card is not repeated below it — one invitation
at a time is the whole of Q22, and a list that echoes the card is a second invitation wearing a
different hat. With nothing else to show it says so, and says which kind of nothing it is.

#### GPT found two defects, and two product points I acted on

1. **A run built against a definition version this build no longer has was advertised as Continue** —
   a button whose only possible outcome is `enterQuestRun` refusing it with `definition-changed`. The
   eligibility scan now asks the same question the door asks.
2. **The cloud pull replaced the whole profile without redrawing the card.** A signed-in child can sit
   on Home while the pull lands, and package completion is exactly what eligibility reads — so the card
   could be describing the profile they no longer have. `applyProgress()` now redraws it.

That second one is the answer to a question I had asked GPT directly ("is there a state change that
should refresh the card while Home is open?"), and it found one I had not.

It also raised two things that were product choices rather than bugs, and it was right about both.

**The card's subtitle was borrowing `brief.intentionText`** — a string written to be read INSIDE the
quest: an 88-character instruction, phase by phase, in the wrong register for an invitation. I had
argued a derived subtitle would be the engine editorialising; GPT's answer was better — *a separately
authored card blurb when the schema can support it*, and the schema is mine to extend. `presentation`
now carries a required `cardText`, validated by the same guard as every other authored string and held
to a card's length. The Firefly's is the design's own example: **"A crossing for two powers."**

**And I had the trail listing locked quests**, greyed, naming their prerequisites. GPT agreed that
escalates nothing, but noted it exceeds §9.4's "other eligible or completed quests" — a departure from
what the owner approved. It is reverted: every row in the trail is one that can be pressed, and an empty
trail now says which kind of empty it is ("No quests are open yet — they arrive as the garden grows"
versus "Every quest you can reach is on the map right now"). **This is a product choice, not a technical
one, and it is the owner's to make** — listing what a child could work towards is arguably kinder than
hiding it, and reinstating it is a two-line change.

**Suite: 352 pass** (350 → 352). Twenty mutations, twenty caught. Browser-verified: with the
prerequisites unfinished nothing is surfaced; finishing them shows the card; a real click on **Begin
quest** closed Home, entered quest scope, created the run, opened the workspace with the drum bed on and
painted Phase 1 of 3; leaving showed **Continue The Firefly Crossing / Phase 1 of 3 · saved on this
device**; finishing the quest emptied the map and left the trail offering a new version; a stale-version
run was stepped over; and the cloud pull redrew the card under an open Home.

`QUESTS.md`'s banner said "This is a plan, not current state. No quest exists in `index.html` today" —
the one line in it that was about state rather than intent, and the whole slice had made it false.
`README.md` now carries quests in its status blurb, its repo map, its engine map and a **Quests
shipped** paragraph, and the "next up" list points at kinds 2–9 rather than at the engine.

---

## The quest slice, in one place (D1–D6, 2026-09-06/07)

Six commits, each design-reviewed, mutation-tested and browser-verified. **352 tests** where the branch
started with 192. **150 mutations run across the six steps, all either caught or shown to be
equivalent** — and the pass earned its keep three times over, finding a dead end that made offering
permanently impossible, a `setSaves` return value that was silently discarded, and three of my own
guards that were masking each other.

**The independent reviewer found a real defect in four rounds of five**, every one of them something the
tests could not see:

| Round | What GPT found |
|---|---|
| D2 | `songEvidence` read `time.cols` where `applySong` widens to 16 — a rise over clean kicks analysed as no shape and no pulse |
| D3 | the completion receipt never recorded an observation at all; a phase-1 receipt could forge a phase-3 one; the dedupe keyed on the raw slots object; "empty" meant two different things |
| D4 | undo inside a quest scheduled the autosave quests do not use, so undoing a note changed only what you could see |
| D5 | the audition lock refused the write but not the interaction; tempo, groove and voice never reached the run; `offering` was wrongly treated as finished |
| D6 | a run from a replaced definition was advertised as Continue; the cloud pull left a stale card up |

Twice I took the finding and rejected the remedy, and said so in the code: the evidence seam must not be
stricter than the loader that feeds it, and undo is not a stop-listening button. Both disagreements are
recorded where the next reader will meet them.

**The browser found three things no pure test could**, all in D5: painting a quest went through the
ordinary edit path and emptied the song it was opening; the workspace was declared and never applied,
so the first phase asked for a heartbeat with the drums shut; and the one-tap fix for a partial
selection shipped disabled, because the test had checked the action existed rather than that it could
be pressed.
