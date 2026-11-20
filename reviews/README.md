# Reviews

One file per ticket: the design — GPT's and Claude's critique (L), or Claude's plan and GPT's review of
it (M), or Claude's short plan (S) — what GPT's test pass (L) and the PR review flagged, what the owner
decided, and what was done about each. This replaces appending to
`REVIEW-LOG.md`, which is kept as the archive of everything up to 2026-09-27.

**Why a file per ticket:** tickets run in parallel AO sessions, each in its own worktree. A single
append-only log guaranteed a merge conflict between any two of them — both append to the same last
line. Separate files never collide.

## Naming

- `reviews/TUN-12-sixteenth-grid.md` — the Linear issue ID, then a short slug.
- Work with no ticket (an ad-hoc session): `reviews/2026-09-28-short-slug.md`.
- One file per ticket, however many review rounds it takes. A later round is a new section in the
  same file, not a new file.

## What goes in one

Keep entries short: the finding, its severity, the verdict, the outcome. Record disagreements as
disagreements — "GPT was wrong, here's why" is more useful later than an entry that quietly drops the
objection. Quote GPT's wording where the wording matters.

The one long part is GPT's design (L) or GPT's design review (M), kept **verbatim** inside a
`<details>` block so the file stays scannable. Never edit it afterwards: a revision is a new section.

**Sections by size** (`CLAUDE.md` § The loop, by size) — the example below is an L ticket:

- **L:** *Design (`<model id>`)*, *Critique (Claude)*, *Test pass (`<model id>`)*.
- **M:** *Plan (Claude)*, *Design review (`<model id>`)* — GPT's findings verbatim — and *My answers*, one per
  finding: agreed or disagreed, and what was done.
- **S:** *Plan (Claude)* — a few lines.
- **Every size:** *Owner's decisions* (a `needs-owner` ticket's first checkpoint included), *PR review*
  with the missing tests it listed and which were added, *Owner's review*, and the tests line with
  whatever is still unverified.

`<model id>` is the model that did the work: the id `ask.sh` was given, or AO's reviewer setting. That
way a record says which GPT ran, and the template never names one.

```markdown
# TUN-12 — Let the free tunes carry sixteenth-note bars

Branch `claude/tun-12-sixteenth-grid` · PR #14

## Design (<model id>)
<details><summary>GPT's design, verbatim</summary>

…GPT's output, unedited…

</details>

## Critique (Claude)
1. **High — …** what is wrong with the design, and what will be built instead.
2. **Low — …** **GPT's call stands** — why.

## Owner's decisions
1. *Design checkpoint (`needs-owner`)* — **build it as designed**: the owner, on the ticket, 2026-11-09.
   (A `needs-owner` ticket's first checkpoint is recorded here even when it raised no question.)
2. *The question, as asked* — **A**: the owner, in the AO session, 2026-11-09. (An unanswered one stays
   listed, marked **open**.)

## Test pass (<model id>)
What it tested, what it found, which of its test files were kept or deleted and why.

## PR review (AO: Codex, <model id> — temporarily GPT through `ask.sh`)
Round 1:
1. **Medium — …** *"quoted comment"* **Agreed** — fixed in `abc1234`.
2. **Low — …** **Disagreed** — why, in a sentence or two.

## Owner's review
What the owner corrected after playtesting, if anything.

**N tests pass.** Anything still unverified (audio, phone, rendering, `file://`).
```

The verdict that ends the PR review lives in the PR body and the hand-off, not here: a commit after an
approval would be a new head, and a new review.

## Reading them

Before GPT designs — and before any review — read the review files for the area you are touching
(`grep -l` for the function or feature name works well) and, for older history, `REVIEW-LOG.md`. The
point is that past findings carry forward instead of being re-litigated.
