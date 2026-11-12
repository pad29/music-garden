# TUN-74 — Give every Tune Garden ticket a Size label the owner can filter on

Branch `ao/size-label-docs/root` · PR #95

Started by `music-garden-11` (the plan, the Linear group and the labelling); taken over by
`music-garden-14`, which verified the Linear side and finished the docs and the test.

## Plan (Claude)

Size S: docs and Linear data, no new mechanism.

- **Linear:** a team label group `Size`, single-select like `Area`, with labels `S`, `M`, `L`; each label's
  description is its line from `file-ticket` § Size. Then every open ticket (Backlog, Todo, In Progress,
  Needs Input, In Review) gets the label matching its `## Size` section, through `addLabels` only — never
  `labels`, which would replace the set — and no state or order change. Tickets with no `## Size` stay
  unlabelled and are listed below for the owner. Done and Canceled are left alone.
- **Docs:** `file-ticket` § Where it goes requires one `Size` label matching `## Size`, and § Size says both
  are set. `work-ticket`'s opening on size and `CLAUDE.md` § The loop, by size name the label, with the
  tie-break: label and section disagree → the larger size, said in the hand-off (as § 4's "work it at the
  larger size"). An unlabelled ticket is still read from its section, and with neither is worked as M.
- **Tests:** `tests/workflow-refs.test.mjs` gains a check that the three docs keep naming the `Size` label
  and the larger-size rule, so a later edit cannot quietly drop it.

**Amended on takeover:** the docs now say outright that label or section *alone* is the size, and only
a ticket with neither is M. The patch left that implicit ("no size → M"), which a reader could take as
"no label → M" for a ticket whose `## Size` says L.

## Tickets labelled

Verified 2026-11-12 in Linear (per-label lists) and against each ticket's `## Size` section (the GitHub
issue mirror's bodies, all 69 open issues): every open ticket carries exactly one Size label, and it
matches its section. Linear's open set is 65 Backlog, 0 Todo, 4 started — 69 in all. No Done or Canceled
ticket carries one.

- **S (21):** TUN-8, 9, 11, 12, 14, 15, 16, 17, 20, 21, 23, 28, 29, 68, 69, 70, 72, 73, 74, 75, 76
- **M (17):** TUN-10, 13, 18, 22, 26, 27, 38, 43, 54, 55, 56, 60, 62, 63, 64, 66, 71
- **L (31):** TUN-19, 24, 25, 30, 31, 32, 33, 34, 35, 36, 37, 39, 40, 41, 42, 44, 45, 46, 47, 48, 49,
  50, 51, 52, 53, 57, 58, 59, 61, 65, 67

## Left unsized — for the owner to size

None: every open ticket has a `## Size` section.

## Owner's decisions

None needed: the ticket listed no open questions, and the build raised none.

## PR review (temporarily GPT through `ask.sh`)

(pending)

**665 tests pass** (`tools/check-syntax.mjs` clean). The new test was mutation-checked: dropping
`CLAUDE.md`'s "larger wins" and `file-ticket`'s "`addLabels`, never `labels`" each fail it. Nothing
in the game changed, so there is no browser check.
