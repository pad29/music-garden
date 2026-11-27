# TUN-119 — Make PACKAGES-DETAILED.md say truthfully which packages it covers and how many are built

Size **S** (label and `## Size` agree). Docs only. Source of the finding: `reviews/TUN-92-contributor-guide.md`
§ Cold-reader check.

## Plan (Claude)

Checked against `js/packages.js` (loaded through `tests/harness.mjs`): `PACKAGES` has 21 keys — `intro`,
19 expansion packages and the hidden one-level `studio` entry (the Studio, not a package). README § Current
status says 20 packages built (the intro + 19): it agrees. `PACKAGES-DETAILED.md` has sections for 17 of
the 19; `two-new-colors` and `two-kinds-of-walking` are specified only in `PACKAGES.md` § 6, the intro only
in `DESIGN.md` § 10 (*Guided campaign*).

- **`PACKAGES-DETAILED.md`:** the title drops "all shipped"; the opening says it covers 17 of the 19
  expansion packages, names the two that live in `PACKAGES.md` § 6 and the intro's `DESIGN.md` § 10 entry,
  and replaces the stale "Last updated 2026-07-05 — all 14" with the count README gives. § 14: the heading
  loses "18 … (as of 2026-07-13)" for the count; the build history and the *DAG as built* line gain
  `two-kinds-of-walking` (its `requires` checked against the runtime); *Not yet built* drops it and names
  `march-and-waltz`. Per-package "BUILT (date)" stamps untouched.
- **Docs that describe the file** (`CLAUDE.md` § Docs): README's repository-map row ("every shipped
  expansion package"), `PACKAGES.md` § 3's "the first 8 detailed specs", and `PACKAGES.md`'s `tiny-motifs`
  pointer (PACKAGES-DETAILED § 14 — the build order; its spec is § 15). `CONTRIBUTING.md` § 2's level row
  ("most packages … `PACKAGES.md` § 6 for a few others … `DESIGN.md` § 10") already matches: unchanged.
- **Test** `tests/packages-detailed.test.mjs`: the opening's counts, README's count and § 14's heading
  against `PACKAGES`; every expansion package specified in exactly one place the opening names; *Not yet
  built* naming nothing in `PACKAGES`; the build history and DAG line naming every expansion package;
  `PACKAGES.md`'s "as-built spec in PACKAGES-DETAILED §N" pointers landing on that package's section.
  Each with its mutation applied and seen to fail. `tests/README.md` gets a paragraph.

## Build

As planned, plus what the new test caught in my own first draft: § 14's DAG line wrote `fireflies` for
`follow-the-fireflies` (now the ID), and my *Not yet built* note backticked `two-kinds-of-walking` as the
source of `march-and-waltz`'s material (reworded, so the list names only unbuilt IDs). Run against `main`'s
docs (the three files checked out from HEAD), the test reports the ticket's findings: the "all shipped"
title, no coverage or status line, § 14's "18 … (as of 2026-07-13)" heading, the build history short of
`two-kinds-of-walking`, and it listed as not yet built.

**Choices I made that you might overrule:**

- The counts are written out (17 of 19, 20 built) and the test holds them to `PACKAGES`, so the next
  package to ship fails the suite until this file, README and `PACKAGES.md` say so. The alternative — no
  counts in the file — would rot less but leave the newcomer guessing again.
- § 14's heading carries no "as of" date: the count is checked; a date was what went stale.
- I fixed `PACKAGES.md`'s `tiny-motifs` pointer (§14 → §15) and its "first 8 detailed specs" line, and
  README's map row: each described this file wrongly. None moves a spec.

## Owner's decisions

None needed — the ticket has no open questions.

## Tests

`node tools/check-syntax.mjs` OK. `tests/packages-detailed.test.mjs`: 9 pass, including 7 mutation tests
that run every time. Full suite: see the PR. Nothing in the game changes, so there is no browser check.
