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
