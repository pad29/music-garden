# TUN-74 — Give every Tune Garden ticket a Size label the owner can filter on

Branch `claude/tun-74-size-labels` (the same commits first went up as `ao/size-label-docs/root`, draft
PR #95, closed in favour of the PR from this branch so Linear links it by name)

Started by `music-garden-11` (the plan, the Linear group and the labelling); taken over by
`music-garden-14`, which verified the Linear side and finished the docs and the test; taken over again by
`music-garden-19` for the GPT PR review and its fixes.

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

The ticket listed no open questions, and the build raised none.

1. *The GPT PR review hit the ChatGPT usage limit (2026-11-12, reset "8:25 PM" local). Resume it after
   the reset, or something else?* — **A: run the one GPT PR review after the reset, S loop** (owner,
   relayed by the orchestrator in `music-garden-19`'s spawn prompt, 2026-11-12). The same instruction
   scoped the session to that one review: fix what it and Fable's review found, then push once to
   `claude/tun-74-size-labels` and open the PR from it.

## PR review (temporarily GPT through `ask.sh`)

Attempt 1, on `9b833b9` (2026-11-12): **no verdict.** `codex exec` stopped with *"You've hit your usage
limit … try again at 8:25 PM"* (`.claude/gpt/.last-events.jsonl`); `ask.sh` exited 1 without printing
it (TUN-73 fixes that). No findings, so no review round used.

### Round 1 — on `ebe5bcb` (2026-11-12, `music-garden-19`)

GPT's verdict, verbatim:

> Required changes:
>
> 1. **Minor — tests/workflow-refs.test.mjs:104:** The either-alone assertion still crosses clauses.
> Replacing work-ticket's `either alone is the size` with `either alone means M` passes: the regex
> consumes subsequent clauses through `as § 4 does for a size`. This permits exactly the incorrect
> default the change aims to prevent. Constrain the assertion to the actual either-alone rule.
>
> Missing tests:
>
> 1. **Either-alone inversion:** Assert that an available label or section supplies its own size. Add
> the mutation above as a failing case; I reproduced it passing.
> 2. **Disagreement disclosure:** Assert independently that CLAUDE.md's size paragraph and
> work-ticket's opening require reporting the disagreement in the hand-off. Removing `and the hand-off
> says so` or `and say so in the hand-off` currently passes. Work-ticket's separate § 4 wording must not
> satisfy this assertion.
>
> The nine reported clause-removal mutations are caught. Syntax and all seven workflow-reference tests
> pass. No files changed; AGENTS.md is untouched. The full suite and external Linear state were not
> independently reverified.
>
> CHANGES REQUESTED at ebe5bcbaee10970e939a38add33ac1e420fde593

Answers:

1. **Agreed.** The either-alone assertion now matches the rule's own words, `either alone is` / `only
   one of them takes` + `the|that size`; GPT's mutation fails it, and so do "either alone is not the
   size" and "only one of them takes M".
- Missing test 1: **agreed**, covered by the same assertion (the three mutations above).
- Missing test 2: **agreed.** A second loop over `CLAUDE.md` and `work-ticket`'s opening (which is cut
  before § 1, so § 4's wording cannot satisfy it) asserts `disagree … larger … hand-off` in one clause;
  removing either hand-off clause fails it.

This was review round 1 of 3. The fixes below were not re-reviewed by GPT: the session was scoped to one
GPT review (*Owner's decisions* 1).

## Owner's review

1. **The size test's `M` and `larger` checks were vacuous** (owner, PR #95 review comment on
   `tests/workflow-refs.test.mjs`, 2026-11-12): *"The word-bounded `M` check … is vacuous in all three
   texts"* (the loop table, the S/M bullets, work-ticket's *No ticket* paragraph), and *"`/larger/` … is
   vacuous for file-ticket § Size"* ("larger than L"); *"The mutation check in the PR body only covered
   CLAUDE.md."* **Agreed** — each rule is now matched inside the clause that states it (`disagree … larger`,
   `neither … M`, and, the same gap, `either alone` / `only one of them … size`, with no `.` or `;`
   between). Six mutations asked for, nine run: removing each doc's tie-break, neither-is-M and
   either-alone clause in turn fails the test every time, each on its own assertion.

## Fable's review (claude-fable-5-2, review-only, not independent of Claude)

`music-garden-16`, PR #95 comment on `ebe5bcb`, 2026-11-12: **changes requested** — finding 1 and
missing tests a–d; findings 3–6 optional. Its headings verbatim, with my answers:

1. *"Medium — Linear's `Size` group description states the rule the docs reject."* (*"… One per ticket;
   none means worked as M."*) **Agreed** — the group's description in Linear now ends *"One per ticket; a
   ticket with neither a label nor a ## Size section is worked as M."*
2. *"Medium — the owner's call, and not yet asked: "either alone is the size" rereads a Decision already
   made."* **Disagreed that it stops the PR; kept first under Choices you might overrule.** The reading
   was disclosed in PR #95's body and Needs Input hand-off, which the owner answered (A) without
   objecting; it follows the ticket's own *Done looks like* (a ticket with no `## Size` section is the
   one left unsized) and the decision's words "Every ticket gets a size; a ticket without one is worked
   as M"; and the literal reading would run a ticket whose section says L through the M loop. Fable
   itself judged the PR's reading the better one. If the owner prefers the literal reading, the change is
   the three size sentences and the test's either-alone assertion.
3. *"Low — the hand-off format does not carry what the rule says the hand-off says."* **Agreed** —
   `handoff.md`'s `Size:` line and `needs-input.md`'s resume state now ask for the larger size and why.
4. *"Low — a fact about Linear that will go stale silently."* **Agreed** — `file-ticket` § Size now says
   "change one, and change the other to match".
5. *"Low — wrapping and wording."* **Agreed** — `work-ticket` line 15 and `CLAUDE.md` line 25 rewrapped,
   `file-ticket` § Size's paragraph rejoined, `tests/README.md` names `workflow-refs.test.mjs`.
6. *"Low — the PR body is behind the head."* **Agreed** — the new PR's body is current.

Missing tests: **a** (the hand-off half of the tie-break) is GPT's missing test 2, above. **b** (the
template keeps `^## Size$` and "Size label carries the same letter"), **c** (§ Where it goes:
``One label from the `Size` group … same letter as the ticket's `## Size` section``), **d** (either
alone, loose in `work-ticket`; GPT's finding 1, fixed by matching the rule's words rather than Fable's
`[^.;,]*`, which would still pass "either alone is not the size") and **e** (`handoff.md`'s `Size:` line
names a disagreement): **all agreed, all added.**

## Verification

**665 tests pass** (`tools/check-syntax.mjs` clean) on the round-1 fixes. Mutation-checked, each failing
`workflow-refs.test.mjs`: the nine clause removals of `ebe5bcb`, dropping `file-ticket`'s "`addLabels`,
never `labels`", and nine more for round 1 — "either alone means M" (GPT's), "either alone is not the
size", "only one of them takes M", each doc's hand-off clause, § Where it goes' "same letter" clause, the
template's `## Size` heading, its label line, and `handoff.md`'s disagreement clause. Nothing in the game
changed, so there is no browser check.
