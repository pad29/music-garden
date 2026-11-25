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

None needed — the ticket has no open questions and the level check found nothing.

## PR review

(pending)
