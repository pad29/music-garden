# Multi-model workflow

Project facts live in `AGENTS.md` — read it. This file is orchestration policy only, and it
is Claude-only (Codex never sees it).

GPT is a **mandatory participant, not an optional one**. The
point is *independent* review: GPT is a counterparty, not a collaborator. Where the two of
you disagree, **the disagreement is the product** — surface it, don't resolve it silently.

## Default loop — non-trivial changes

1. Draft a design. **Do not implement yet.**
2. Get GPT's design review (**§ Calling GPT**, the design-reviewer brief). Address or explicitly
   reject each finding, with reasoning. Show the owner both — the findings and what you did.
3. Implement. Run the syntax check and `node --test "tests/*.test.mjs"`.
4. Get GPT's test pass (the tester brief), telling it exactly what you already tested and what you
   couldn't reach. Review every file it adds before keeping it.
5. Fix what it found. Re-run.
6. Write the review record to `reviews/<TICKET-ID>-<slug>.md` — what GPT flagged, what you did. See
   `reviews/README.md`. (`REVIEW-LOG.md` is the closed archive; never append to it.)
7. Review the docs — see **§ Docs**. The capability isn't done until they describe it.
8. Commit and push **this session's own branch**, open a PR, and report — in the PR, on the ticket,
   and to the owner — using the hand-off formats in the `work-ticket` skill, **playtest checklist
   included**, even in a session that has no ticket. **Never merge and never push `main`** unless the owner says so in this session:
   every push to `main` deploys to production.

Trivial changes — typos, comments, formatting — skip this. **When in doubt, run the loop.**

## Explicit delegation

When the owner says any of these, route to GPT and do **not** do the work yourself:

- "ask GPT to…" / "have GPT write…" → the author brief
- "get GPT's take on…" → the design-reviewer brief
- "have GPT test…" → the tester brief
- "critique GPT's…" → the owner has given you GPT's output; review it as an adversary. Be as
  hard on it as GPT's design review is on you.

## Calling GPT

Every role runs on **Astra (`gpt-6-astra`)** through `.claude/gpt/ask.sh`, and you call the script
**yourself** — not through a Claude subagent, which spends Claude credits relaying it. The owner's call
(2026-09): Claude credits are the scarcer budget, so review, test writing and mutation audits go to GPT,
and Claude keeps design drafts, source edits, and reviewing what GPT produced.

The three files in `.claude/agents/` are the **brief formats** — what to put in the prompt, what to ask
for, how to report back. Follow them; where their model or invocation disagrees with this section,
this section wins.

```bash
.claude/gpt/ask.sh fresh  read-only       gpt-6-astra .claude/gpt/prompt.txt   # design review, authoring
.claude/gpt/ask.sh thread workspace-write gpt-6-astra .claude/gpt/prompt.txt   # test pass (may write tests/)
```

Run it in the background; a review takes minutes. The thread lives in `.claude/gpt/.thread-id` inside
the worktree, so each ticket gets its own GPT thread without trying. Verify what GPT claims — re-run the
suite and its mutation audits yourself — before reporting it as fact.

## Worktrees, tickets and branches

**Every session works in its own worktree, never in the main checkout.** Two sessions ran in
parallel on 2026-08-20 — one fixing `widthBand`, one on the field zoom — and both landed uncommitted
in the same `index.html`, so shipping either meant hand-splitting the file. A branch per task stopped
that by convention; a worktree per session stops it physically. The main checkout
(`C:\Claude\MusicTheory`) stays on `main` and is never edited. Worktrees live in
`.claude/worktrees/<name>`. If a session did not start in one, `EnterWorktree` before touching a file.
The preview pane still serves the main checkout; a worktree is at
`/.claude/worktrees/<name>/index.html` on the same server (details in the `work-ticket` skill).

**Work is tracked in Linear** (team *Tune Garden*):
**Backlog → Todo → In Progress → Needs Input / In Review → Done.**
- **Planning sessions** file tickets with the `file-ticket` skill, always into Backlog.
- **The owner alone moves tickets into Todo**, and the order of Todo is the order of work.
- **Ticket sessions** follow the `work-ticket` skill. The scheduled dispatcher starts one with no ticket
  named, and it takes the top of Todo; the owner can also start one by hand ("work on TUN-12").
- **Needs Input** is how a session asks: when a decision is the owner's, or the owner should try the
  work before it is worth finishing. It pushes, opens a draft PR for the Netlify preview, asks on the
  ticket, and stops.
- Work found along the way that is out of scope becomes a Backlog ticket (`file-ticket`), not a detour.

**Branches** are `claude/<ticket-id>-<slug>` (`claude/tun-12-sixteenth-grid`), so Linear's GitHub
integration links the PR and closes the ticket on merge. Ad-hoc work without a ticket uses
`claude/<slug>`. A session may commit, push its own branch and open PRs. **`main` is the deploy branch**:
only the owner merges — or a session does, when the owner says so in that session. Merge when the
owner says the work is done, not when the code compiles. Before a PR is finished, merge `origin/main`
into it and re-run the suite: parallel tickets collide in `index.html`.

## Docs

**A capability isn't merged until the docs describe it.** When work lands, review every doc it
touches — not only the one you happened to be writing in:

- The doc that owns the feature records what shipped.
- A **new** doc earns three things: a pointer in `AGENTS.md` § Where to find things, a row in
  `README.md`'s repository map, and a place in `AGENTS.md` § What "done" means.
- `README.md` § Current status is the record of what actually ships — reconcile its counts and
  its "next up" list against `PACKAGES.md`.
- Sibling docs describing adjacent systems get a cross-reference.
- Anything the change made false is corrected in the **same commit**.

Adding `QUESTS.md` (2026-09-06) is the worked example: it needed the `AGENTS.md` pointer, a
`README.md` repo-map row, and cross-references from `DESIGN.md`, `PACKAGES.md` and
`SAVE-SHARE.md` — none of which the new document itself would have prompted.

Drift is silent, and the cost lands on whoever comes next. `README.md` spent weeks saying "no test
suite yet" with eleven test files on disk, and a package count that README and PACKAGES.md
disagreed about sent a design review down the wrong path — the reviewer had to refuse the numbers
it was handed before the work could proceed.

## Rules

- **GPT never edits source.** It reviews, tests, and authors. It may write files under
  `tests/`; review them before keeping them.
- Pass file paths and diffs, not conversation history. GPT can read the repo itself.
- Before a design review, read the `reviews/` files for the area you're touching, and
  `REVIEW-LOG.md` for anything older than 2026-09-28.
- **Report GPT's findings verbatim.** Never soften or summarize away a disagreement.
- Don't tell the owner GPT agreed when it didn't, and don't tell them it objected to
  something it merely noted. Severity is part of the finding.

## Cost

The ChatGPT limit is account-wide and per rolling 5-hour window, and **parallel ticket sessions share
it** — as they share the owner's Claude plan limits. If a limit runs out mid-task, finish the
verification yourself rather than stall, and say so. Never switch models silently.

Resuming a thread replays the whole transcript, so review #5 costs more than review #1 (the
famous-meter test pass read 3.4M tokens, mostly cached). `ask.sh` prints token usage to stderr — watch
it. Delete `.claude/gpt/.thread-id` when a task ships to start the next one clean.

`AGENTS.md` rides along on **every** Codex call. Keep it lean.
