# TUN-15 — Refuse to stamp a tool that doesn't fit, instead of planting one seed

Branch `ao/stamp-tool-fit/root` · Size S · AO session `music-garden-50`

## Level check (the ticket's first trap) — no level relies on the partial stamp

Two shipped goals read `ev.stampedTool`: `intro` › *Make the Garden Sing* ("Raise a structure from your
🎒 Toolbox") and `standing-towers` › *Stamp the Strong Shape* ("Stamp it onto the field"). Neither can
need a truncated stamp:

- A tool's offsets come from seeds on the field it was crafted on; the toolbox is per-package and the
  palette (so `ROWS`) is per-package. Every tool therefore fits at least where it was crafted.
- Sleeping rows (`colors:`, the staged F/B reveal) exist only in `two-new-colors`, which has no stamp
  goal.

So refusing is safe for every shipped level; no owner question.

The sleeping-row refusal is not reachable in a shipped level today either: the Toolbox and Fuse appear
only once a package's levels have unlocked `fuse` (`scopeFeatures` → `unlockedSet(levelIdx)`), and in
`two-new-colors` that is *A Brand-New Tower*, where F and B are both awake. It is a guard for later
levels and quests (which declare their own features), matching `cellClick`'s refusal of the tapped row.

## Plan (Claude)

- **Approach.** `stampTool` keeps its placement rule (stack upward from the tapped cell; flip downward if
  that runs off the top), but no longer filters: if **any** row of the placed shape is off the field, it
  refuses — plants nothing, opens no journal entry, plays nothing, leaves `ev.stampedTool` alone, keeps
  the tool armed, and names the reason in the status line. If any row lands on a **sleeping** 🔒 row
  (`isLockedRow`), it refuses the same way, matching `cellClick` (which already refuses the tapped row)
  and the tray's copy refusal (`tray.js`: "plant the copy somewhere else").
- **Copy** (a `STAMP_COPY` table beside `GROW_COPY`, each refusal naming its wall):
  - room — the shape is too tall for this spot; tap nearer the bottom or the top of the field.
  - sleep — part of the shape lands on a colour that isn't awake yet.
- **Files.** `js/editing.js` (`stampTool`, new `STAMP_COPY`); `tests/pair-integration.test.mjs`;
  `DESIGN.md` § the Stamp line.
- **Tests.** The 9-rung pair at row 1 on the 10-row field refuses (no seed, no journal entry,
  `ev.stampedTool` false, status = the room line, tool still armed); the same tool at row 9 stamps both
  rows; a 3-row tower's fitting stamp is unchanged; a stamp crossing a sleeping row refuses with the
  sleep line; the existing octave-stamping case still passes.
- **Risks.** None to levels (above). The status copy is player-facing wording — listed for the owner's
  playtest.

## Build

As planned. `stampTool` (`js/editing.js`) now refuses before `tx()`, so a refusal opens no
transaction at all; the copy lives in `STAMP_COPY` beside `GROW_COPY`. `DESIGN.md`'s Stamp line records
the rule.

**Tests** (`tests/pair-integration.test.mjs`, three new): the 9-rung pair at row 1 refuses — no seed, no
outermost `tx`, `ev.stampedTool` false, the room line, tool still armed — then stamps whole at row 9 with
exactly one `stamp` transaction; a 3-row tower stamps unchanged both upward and flipped down; on the
diatonic field with only F revealed, a C–E–G tower tapped at E4 (top lands on sleeping B4) refuses with
the sleep line, and stamps at C4. The octave-stamp case still passes. **Mutation check:** putting the old
filter back fails only the 9-rung test; dropping the sleeping-row check fails only the sleep test.
Suite: 1108/1108.

**Browser** (AO preview of this worktree, `js/editing.js` byte-compared): *Make the Garden Sing*, crafted
C4–A5 (Open pair), stamped at row 1 → status shows the room line, column empty, "Raise a structure" goal
unticked, chip still armed; stamped at row 9 → both seeds, "Stamped! 🌸", goal ticked. No page errors.
Not checked in the browser: the sleeping-row refusal (Node test only).

## Owner's decisions

No question at the design checkpoint — the ticket has no open questions and the level check found nothing.

1. *Round 1, finding 4: keep the level intro "Build once, place anywhere" and the armed-tool prompt, or
   change them (and regenerate the intro's narration) here?* — put to the owner by the coordinator,
   2026-11-25 — **pending**.
2. *Round 1, finding 2: refuse damaged shapes inside `stampTool` and file restore-time toolbox
   validation as a Backlog ticket, or validate restored shapes in `loadScopeToolbox` in this PR?* — put
   to the owner by the coordinator, 2026-11-25 — **pending**.

## PR review — round 1 (`gpt-6.2-astra`, through `ask.sh`, head `09e8618`)

**Verdict: Changes requested.** In 580k (519k cached) / out 2.6k.

<details><summary>GPT's review, verbatim</summary>

## Changes required

1. **Medium · `js/editing.js:150`** — `cellClick` calls `followCursor(c)` before `stampTool` checks the fit. A refused tap moves the cursor and clears an explicit playback pin, so the next ▶ starts at the loop start. Move cursor follow onto the successful stamp path, after both refusal checks. Keep ordinary planting unchanged.
2. **Medium · `js/editing.js:207`** — The new bounds check assumes valid offsets, but `js/persistence.js:64` restores local toolbox arrays unchecked. Empty offsets pass both `some` checks and later throw at `cells[Infinity][c]`. With `[0, "bad"]`, the second row becomes `NaN`, passes the bounds check, and can throw after the first seed is planted, before the journal commits. Validate restored shapes before use. Require two or three distinct nonnegative integer offsets including zero, in any order.
3. **Medium · `js/editing.js:200`** — “Tap nearer the bottom or the top … so every seed lands” can send a player looking for an impossible fit. Craft a `[0,13]` pair in the diatonic Studio, then load a pentatonic song in the same Studio. The toolbox survives, but neither edge of the ten-row field works. Use copy that names the lack of room without promising another row will work.
4. **Low · `js/packages.js:723`, `DESIGN.md:179`, `js/editing.js:237`** — The goals remain achievable, but *Stamp the Strong Shape* still teaches “Build once, place anywhere.” The design bullet and the armed-tool prompt also describe stamping as one-shot, although the tool stays armed after success and refusal. Correct the three lines to describe repeatable stamping wherever the whole shape fits, and regenerate the changed intro’s narration.

## Missing tests

- Pin column 6, arm `[0,9]`, and seed the destination column → call **`cellClick`** at row 1, column 3 → existing notes, pin, cursor, journal, and prior goal flags survive, with no stamp sound, bloom, or autosave. Retry at row 9 → both rows land and the cursor follows.
- Restore toolbox entries with `[]`, `[0,"bad"]`, and `[0,0]`, alongside a valid unsorted `[9,0]` → load the bag and use it → invalid entries cannot plant or earn credit, and the valid pair stamps both rows at the edge.
- Craft `[0,13]` in the diatonic Studio → load a pentatonic song in the same scope and try both edges → both taps refuse without planting, and the status gives no misleading edge advice.

## Verdict

**Changes requested**

</details>

### My answers

1. **Medium — cursor moves on a refused stamp. Agreed, fixed.** `cellClick` no longer calls
   `followCursor` on the stamp path; `stampTool` calls it after every refusal check, just before the
   journalled stamp (same order as before for a stamp that lands). Ordinary planting is unchanged.
2. **Medium — damaged saved offsets. Partly agreed.**
   - *Agreed and fixed:* my change made it worse — the old `filter` + `if(!rows.length) return` survived
     an empty shape, and the new code throws on it. `stampTool` now refuses any shape that is not at
     least two distinct whole rows (`[]`, `[0,"bad"]`, `[0,0]`, `["x",2]`, `[0,1.5]`) with a status line
     (`STAMP_COPY.broken`: craft it again), before anything is planted, so it can neither throw halfway
     nor earn credit.
   - **Rejected — "validate restored shapes before use" (`js/persistence.js:64`, `loadScopeToolbox`).**
     Reasoning: (a) the stamp is now safe against any shape, which is this ticket's whole concern; what
     remains is how the *bag* treats a damaged saved tool (`renderBag` → `miniSVG`/`toolMeta` with bad
     offsets), which is restore-time hardening of saved progress, not stamping; (b) `js/persistence.js`
     is next to TUN-12's `applyProgress` work running in parallel today, and the coordination rules keep
     each worker to its own ticket's code; (c) the input is the player's own saved progress, not an
     outside link, so it is not a TUN-84-class hostile input. Proposed instead: a Backlog ticket for
     restore-time toolbox validation. **Put to the owner by the coordinator, 2026-11-25 — answer
     pending** (see *Owner's decisions*).
3. **Medium — edge advice for a shape taller than the field. Agreed, fixed.** A shape whose span is
   at least the field's height now gets its own line (`STAMP_COPY.tooTall`: "taller than this whole
   field — there's nowhere here it can land in one piece"); the bottom/top advice is kept only where it
   is true. (On a field it fits, a shape with offset 0 always fits stacked up from the bottom row, and
   flipped down from the top row — so that advice is accurate whenever it is shown.)
4. **Low — stale "one-shot" wording. Partly agreed.**
   - *Agreed and fixed:* `DESIGN.md`'s One-mode UX bullet was false (it still described the pre-2026-07-27
     Fuse → ✓ Save mode, and stamping "auto-returning to planting"); rewritten to say a picked tool stays
     armed until clicked again or Esc.
   - **Rejected — the level intro "Build once, place anywhere" (`js/packages.js:723`).** Reasoning: it is
     player-facing teaching copy with recorded narration; changing it means regenerating the voice line,
     which is a generated-asset change and a wording decision for the owner, out of an S bug fix's scope.
     And the line is no less true than before: the tool still places anywhere it fits, and the refusal
     tells the player so at the moment it matters.
   - **Rejected — the armed-tool prompt "click the grid to stamp it once" (`js/editing.js`, `toggleStamp`).**
     Reasoning: it is accurate — one click stamps once — and the "Stamped!" line right after it tells the
     player to click again to stamp more. What a stamped tool is called and how the toolbox talks is
     another ticket's scope (the ticket's *Out of scope*).
   - Both rejections **put to the owner by the coordinator, 2026-11-25 — answer pending.**

**Missing tests — all three added** (`tests/pair-integration.test.mjs`): the `cellClick` refusal with a
pinned cursor, a seeded destination column and spies on sound, bloom and autosave (then the retry at
row 9, where the cursor follows); damaged shapes `[]`, `[0,"bad"]`, `[0,0]`, `["x",2]`, `[0,1.5]` refuse
without throwing or planting, through `stampTool` and `cellClick`, and a valid unsorted `[9,0]` stamps
both rows — directly as `activeTool`, not through a save restore (restore validation is the rejected part
of finding 2); a `[0,13]` diatonic shape on the pentatonic field refuses at rows 0, 9 and 4 with the
too-tall line. **Mutation check:** following the cursor before the check, dropping the damaged-shape
guard, and always giving edge advice each fail exactly their own test.
