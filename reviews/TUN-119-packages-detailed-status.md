# TUN-119 — Make PACKAGES-DETAILED.md say truthfully which packages it covers and how many are built

Size **S** (label and `## Size` agree). Docs only. Source of the finding: `reviews/TUN-92-contributor-guide.md`
§ Cold-reader check.

## Plan (Claude)

Checked against `js/packages.js` (loaded through `tests/harness.mjs`): `PACKAGES` has 21 keys — `intro`,
19 expansion packages and the hidden one-level `studio` entry (the Studio, not a package). README § Current
status says 20 packages built (the intro + 19): it agrees. `PACKAGES-DETAILED.md` has sections for 17 of
the 19; `two-new-colors` and `two-kinds-of-walking` have their specs in `PACKAGES.md` § 6 (`DESIGN.md` § 10 also
records Walking's level sequence), the intro only in `DESIGN.md` § 10 (*Guided campaign*).

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

## PR review, round 1 (`gpt-6.2-astra`, `ask.sh fresh read-only`, on `0f8b461`)

GPT's findings and missing tests, verbatim (file links stripped; its acceptance-criteria table, which
passed every criterion but left the full suite "Unverified", is omitted):

<details><summary>GPT's review</summary>

## Findings

1. **High — §14 omits direct prerequisites for six packages.** The new `off-the-path → two-kinds-of-walking` edge is real, but `two-kinds-of-walking` also directly requires `intro` and `footsteps`. The same two edges are missing for `off-the-path`. `stepping-stones`, `question-and-answer`, `standing-towers` and `wind-and-gaps` each omit a direct `intro` edge. The other prerequisite sets agree with the runtime, reading `Q&A` as `question-and-answer`. These omissions preserve reachability during normal progression, but §14 explicitly identifies the line with `PACKAGES[*].requires`, and the unlock code checks every direct entry. Use one package and its exact prerequisite set per row. The test currently discards `requires` and checks only that every name occurs somewhere.

2. **High — a correctly documented package release still breaks the suite.** The mutation tests search the *live documents* for literal `17 of the 19`, `20 packages`, and the current README total. The simulated release also assumes `march-and-waltz` is unbuilt. When that package ships, adding it to `PKG` again changes no keys. Even with every document correct, the tests fail on missing mutation anchors or missing expected errors. Failing CI when a published count becomes false is appropriate. Use a small stable fixture for the mutation cases, or derive mutations from current data and use a fresh synthetic slug. Keep one integration test against the real documents.

3. **Medium — the catalog still tells newcomers the first eight detailed specs are forthcoming.** This is in §6, the destination the new opening explicitly tells them to visit. Replace “come in the next pass for the first 8” with the current coverage pointer from §3. The adjacent heading also says “The 24 packages” above 29 package entries, including planned packages. Drop that numeral or identify it as the original plan. The catalog opening’s unqualified “holds the as-built level-by-level specs” would also be clearer with a pointer to the exceptions in §3.

4. **Medium — the pointer checks can pass when following a link takes the reader to the wrong place.** The opening check accepts `[DESIGN.md](README.md) §10`. It finds *Guided campaign* anywhere in DESIGN and accepts any level count there. Likewise, it accepts a `BUILT` heading anywhere in PACKAGES as proof of a spec in §6. The CONTRIBUTING check does not require the `PACKAGES.md` or `DESIGN.md` link targets at all. Conversely, wrapping the opening paragraph or writing `§ 6` can fail a truthful document. Check the actual link destinations and the contents of the named sections, allowing ordinary Markdown whitespace.

5. **Medium — coverage counts headings, and the future-package check reads one line.** A duplicate package section can inflate the numerator because the checker counts headings without requiring unique expansion IDs or section numbers. An empty heading also counts as a spec. Meanwhile a built candidate on a continuation line escapes the *Not yet built* check, and a backticked `studio` or misspelled candidate passes. Use unique expansion IDs for coverage. Read candidate entries through the end of the list and resolve them against the catalog and the **full** runtime key set. Keep the hidden-Studio exclusion specific to campaign counts.

6. **Low — the new historical summary overstates what the dates establish.** The opening says §§1–8 were pre-build specs and that each section has a shipment-date stamp. The earliest tracked version already describes Fireflies as the playtested reference and Footsteps as built. Fireflies’ heading still says `BUILT (reference)`. Describe the first eight as the original group and refer to dates *where present*. Two older notes also call `soft-wobble-strong-wobble` and `tiny-motifs` “not built” without saying “at the time.” Qualifying those notes would preserve their rationale and the historical stamps.

7. **Low — one newly recommended spec gives the wrong level count.** The `two-new-colors` entry says **9 levels**, lists eight, and the runtime has those same eight, from *A Hint of More* through *Free Colors*. Change the catalog numeral to eight. For `two-kinds-of-walking`, §6 is the correct high-level spec, and DESIGN §10 also records the nine-level sequence. The review record’s word “only” obscures that useful distinction.

## Missing tests

| Input mutation | Expected result |
|---|---|
| Remove only `footsteps` from Walking’s documented prerequisites, keeping every package name elsewhere in the DAG. | Report the missing direct edge `footsteps → two-kinds-of-walking`. |
| Ship `march-and-waltz` in a fixture and update its spec, history, DAG, candidate list and all counts truthfully. | No problems. The mutation tests themselves also stay green. |
| Append a second `footsteps` section and increase the stated coverage by one. Separately, leave a newly claimed spec with only a heading. | Report duplicate coverage or an empty spec, respectively. |
| Keep the `DESIGN.md` link text but target `README.md`. Separately, move *Guided campaign* outside §10, or change its count to 12. | Report the wrong destination, missing §10 entry, or mismatch with the 13 runtime levels. |
| Move the Walking `BUILT` heading outside PACKAGES §6 while leaving the opening intact. Swap the PACKAGES and DESIGN targets in CONTRIBUTING. | Report the missing §6 destination and the misdirected contributor link. |
| Put `two-kinds-of-walking` on a second candidate line. In separate cases, list `studio` or misspell `march-and-waltz`. | Report an already-present runtime ID or an unknown catalog candidate. |
| Retain the correct status line and append the old “all 14 … currently in the game” sentence. Change the title to “every shipped expansion package.” | Report the conflicting current count and the false coverage claim. Both evade the present `problems()` checks. |
| Change Walking’s history date to July 13 while preserving its ID and list position. Reflow a correct opening paragraph without changing its content. | Report the date disagreement with its catalog stamp. Accept the reflow. |

**Verdict: changes requested.**

</details>

**My answers:**

1. **High, DAG omits direct prerequisites — agree.** § 14 calls the line runtime truth, so it now has one
   row per package (`` - `id` ← `` its exact `requires`), generated from the runtime; the test compares
   every row edge for edge (missing and extra edges, missing and duplicate rows).
2. **High, a truthful release breaks the mutation tests — agree.** Every mutation now derives its anchors
   and numbers from the live data; the made-up release uses a fresh slug, and a new test updates every
   doc truthfully for it and expects no problem.
3. **Medium, PACKAGES.md § 6 "next pass for the first 8" — agree, fixed**, and its opening now says "all
   but two — §3 names them"; the test holds § 3's and § 6's exception lists to the runtime. **"The 24
   packages" heading — not changed:** it is the catalog's planned set (§ 5 is "reorder of the 24"), the
   ticket's *Read first* names it, and renaming it changes its anchor; out of scope.
4. **Medium, pointer checks too loose — agree.** The opening must link `PACKAGES.md` and `DESIGN.md`
   by target; the *Guided campaign* entry must be inside DESIGN § 10 with the intro's runtime level count;
   the BUILT heading inside PACKAGES § 6; CONTRIBUTING's row by its link targets; the opening is read
   with whitespace collapsed, so a reflow passes (tested).
5. **Medium, coverage counts headings; Not yet built reads one line — agree.** Coverage uses unique
   expansion IDs, duplicates and near-empty sections are reported, *Not yet built* is read to its
   paragraph's end and each ID resolved against every runtime key (hidden `studio` included) and the
   § 6 catalog.
6. **Low, the history overstates what the dates establish — agree, partly.** The opening now says §§1–8
   are "the original group of specs, updated as-built" and that a dated BUILT stamp is the ship date,
   notes "as of when written". **The old "not built" notes inside `pull-of-the-moon` and
   `sun-and-moon-garden` are left as they are:** they are per-package historical records, which the
   ticket says to keep; the new opening line covers them.
7. **Low, `two-new-colors` says 9 levels, lists 8 — agree, fixed** (the runtime has 8), and this file's
   "only" corrected.

**Missing tests — all eight added** as mutation cases in `tests/packages-detailed.test.mjs`: a dropped
direct edge; a truthful made-up release passing (and an undocumented one failing); a duplicate and an
empty section; a link retargeted to README, a *Guided campaign* count off by one, a § 6 BUILT heading
moved out of § 6, CONTRIBUTING's PACKAGES link retargeted; a built ID on a continuation line, `studio`,
a misspelt candidate; the old "all 14" sentence appended after a correct status line, an "every shipped"
title; a misdated history entry; a reflowed opening passing.

## Tests

`node tools/check-syntax.mjs` OK. `tests/packages-detailed.test.mjs`: 11 pass — one against the real docs,
ten mutation tests that run every time. Run against `main`'s docs, the real-docs test reports the
ticket's findings. Full suite: CI's *Syntax check and tests* on the PR head. Locally, with four sessions'
suites running at once, my run was stopped at 30 minutes inside `workflow-scripts.test.mjs`'s preview-poller
cases with no failure before it. Nothing in the game changes, so there is no browser check.
