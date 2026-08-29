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

