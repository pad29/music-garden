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
