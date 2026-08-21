# Multi-model workflow

Project facts live in `AGENTS.md` — read it. This file is orchestration policy only, and it
is Claude-only (Codex never sees it).

GPT (via the `gpt-*` subagents) is a **mandatory participant, not an optional one**. The
point is *independent* review: GPT is a counterparty, not a collaborator. Where the two of
you disagree, **the disagreement is the product** — surface it, don't resolve it silently.

## Default loop — non-trivial changes

1. Draft a design. **Do not implement yet.**
2. Invoke `gpt-design-reviewer`. Address or explicitly reject each finding, with reasoning.
   Show the owner both — the findings and what you did about them.
3. Implement. Run the syntax check and `node --test "tests/*.test.mjs"`.
4. Invoke `gpt-tester`, telling it exactly what you already tested and what you couldn't reach.
5. Fix what it found. Re-run.
6. Append a summary to `REVIEW-LOG.md`: what GPT flagged, what you did.
7. Report to the owner **before committing**. Every push to `main` deploys to production.

Trivial changes — typos, comments, formatting — skip this. **When in doubt, run the loop.**

## Explicit delegation

When the owner says any of these, route to GPT and do **not** do the work yourself:

- "ask GPT to…" / "have GPT write…" → `gpt-author`
- "get GPT's take on…" → `gpt-design-reviewer`
- "have GPT test…" → `gpt-tester`
- "critique GPT's…" → the owner has given you GPT's output; review it as an adversary. Be as
  hard on it as `gpt-design-reviewer` is on you.

## Branches

**Start new work on a branch, not on `main`.** Two sessions ran in parallel on 2026-08-20 — one
fixing `widthBand`, one on the field zoom — and both landed uncommitted in the same `index.html`,
so shipping either meant hand-splitting the file. A branch per task costs nothing and makes that
impossible.

`main` is the deploy branch: every push to it goes to production. Merge to `main` when the owner
says the work is done, not when the code compiles.

## Rules

- **GPT never edits source.** It reviews, tests, and authors. It may write files under
  `tests/`; review them before keeping them.
- Pass file paths and diffs, not conversation history. GPT can read the repo itself.
- Read `REVIEW-LOG.md` before a design review.
- **Report GPT's findings verbatim.** Never soften or summarize away a disagreement.
- Don't tell the owner GPT agreed when it didn't, and don't tell them it objected to
  something it merely noted. Severity is part of the finding.

## Cost

ChatGPT Plus limits are per rolling 5-hour window: roughly 10–100 messages on Sol, 25–200 on
Terra, 250–2,000 on Luna. The design reviewer runs on Sol and is the expensive call — if the
owner is hitting limits, switching it to Terra is the first lever, and reserving Sol for
genuinely hard architecture decisions is the second. Say so rather than downgrading silently.

Resuming a thread replays the whole transcript, so review #5 costs more than review #1.
`ask.sh` prints token usage to stderr — watch it. Delete `.claude/gpt/.thread-id` when a task
ships to start the next one clean.

`AGENTS.md` rides along on **every** Codex call. Keep it lean.
