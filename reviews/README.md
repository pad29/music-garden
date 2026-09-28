# Reviews

One file per ticket: what GPT flagged during cross-model review, and what was done about it. This
replaces appending to `REVIEW-LOG.md`, which is kept as the archive of everything up to 2026-09-27.

**Why a file per ticket:** tickets now run in parallel sessions, each in its own worktree. A single
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

```markdown
# TUN-12 — Let the free tunes carry sixteenth-note bars

Branch `claude/tun-12-sixteenth-grid` · PR #14

## Design review (Astra)
1. **High — …** *"quoted finding"* **Agreed** — what changed.
2. **Medium — …** **Disagreed** — why, in a sentence or two.

## Test pass (Astra)
What it tested, what it found, which of its test files were kept or deleted and why.

## Owner's review
What the owner corrected after playtesting, if anything.

**N tests pass.** Anything still unverified (audio, phone, rendering).
```

## Reading them

Before a design review, read the review files for the area you are touching (`grep -l` for the
function or feature name works well) and, for older history, `REVIEW-LOG.md`. The point is that past
findings carry forward instead of being re-litigated.
