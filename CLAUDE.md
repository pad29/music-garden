# Multi-model workflow

Project facts live in `AGENTS.md` — read it. This file is orchestration policy only, and it
is Claude-only (Codex never sees it).

GPT is a **mandatory participant, not an optional one**. The
point is *independent* review: GPT is a counterparty, not a collaborator. Where the two of
you disagree, **the disagreement is the product** — surface it, don't resolve it silently.

This repo is worked through **Agent Orchestrator (AO)**, and only through it. Who does what:

- **The owner** decides what is next (the order of Linear's Todo), answers Needs Input, playtests,
  and merges.
- **Claude, as AO's orchestrator,** plans, files tickets, spawns a worker per ticket, and relays.
- **Claude, as an AO worker,** critiques GPT's design, implements, tests, fixes, and opens the PR.
- **GPT, through `ask.sh` inside the worker,** designs the ticket, then adds tests against its design.
- **GPT, as AO's native reviewer (Codex),** reviews the PR.

## Default loop — non-trivial changes

1. **GPT designs; you critique** — the `gpt-design` skill. GPT's design and your critique stay
   separate and verbatim. **Do not implement yet.**
2. **The design checkpoint** — `work-ticket` § 5 decides, before any code, whether to stop for the
   owner. Where GPT's design and your critique disagree, you decide, with reasoning, and report both
   sides verbatim — unless the disagreement is itself the owner's decision.
3. **Implement.** Run the syntax check and `node --test "tests/*.test.mjs"`, and check the browser as
   `work-ticket` § 6 describes.
4. **GPT's test pass** (the tester brief), in a fresh GPT thread: hand it its own design and your
   critique verbatim from the reviews file, what you tested, what you couldn't reach, and where the
   build departs from GPT's design and why. Review every file it adds before keeping it.
5. **Fix what it found.** Re-run.
6. **Write the review record** to `reviews/<TICKET-ID>-<slug>.md` — GPT's design, your critique, what
   GPT's test pass and AO's review flagged, what you did. See `reviews/README.md`. (`REVIEW-LOG.md` is
   the closed archive; never append to it.) Then **review the docs** — see **§ Docs**. The capability
   isn't done until they describe it.
7. **Open the PR, ready for review:** merge a freshly fetched `origin/main`, re-run, push **this
   session's own branch**, and open the PR against `main`.
8. **AO's review** (Codex, Astra): `ao review trigger`, fix, push, trigger again — until AO approves
   the PR's current head, or the review budget in `work-ticket` § 8 runs out, which is Needs Input.
   Then hand off — in the PR, on the ticket, and through `ao report` — using the formats in the
   `work-ticket` skill, **playtest checklist included**, even in a session that has no ticket.
   **Never merge and never push `main`** unless the owner says so in this session: every push to
   `main` deploys to production.

Show the owner both sides at every step: what GPT produced or flagged, and what you did with it.
Trivial changes — typos, comments, formatting — skip GPT's design and test pass and the review
record (steps 1–6); AO's review still runs on every PR. **When in doubt, run the loop.**

## Explicit delegation

When the owner says any of these, route to GPT and do **not** do the work yourself:

- "ask GPT to…" / "have GPT write…" / "have GPT design…" → the author brief (`gpt-design`, `gpt-spec`)
- "get GPT's take on…" → the design-reviewer brief (`gpt-review` for work already done)
- "have GPT test…" → the tester brief
- "have GPT review the PR" → for **this session's own PR**, `ao review trigger`. Any other PR is a
  review-only job for a separate worker: ask the orchestrator for one. Never run `ao review trigger`
  or `ao session claim-pr` on someone else's PR.
- "critique GPT's…" → the owner has given you GPT's output; review it as an adversary. Be as
  hard on it as GPT's reviews are on you.

## Calling GPT

GPT reaches this repo two ways, both on **Astra (`gpt-6-astra`)**:

- **`.claude/gpt/ask.sh`**, which you call **yourself** — never through a Claude subagent: AO workers
  may not use them, and a subagent spends Claude credits relaying. The owner's call (2026-09): Claude
  credits are the scarcer budget, so design authoring, test writing, review and mutation audits go to
  GPT, and Claude keeps critique, source edits, and reviewing what GPT produced.
- **AO's native reviewer** — Codex on `gpt-6-astra` at effort high (owner, 2026-11-09), configured by
  the orchestrator. You trigger it with `ao review trigger`; you never call it through `ask.sh`, and it
  never edits the branch. A session keeps the reviewer settings it was spawned with: if the orchestrator
  says they changed since, pass the new ones (`--model`, `--effort`) — never settings of your own.

The three files in `.claude/gpt/briefs/` are the **brief formats** for `ask.sh` — what to put in the
prompt, what to ask for, how to report back. Follow them; where their invocation disagrees with this
section, this section wins.

```bash
.claude/gpt/ask.sh fresh read-only       gpt-6-astra .claude/gpt/prompt.txt   # the design; an ad-hoc review
.claude/gpt/ask.sh fresh workspace-write gpt-6-astra .claude/gpt/prompt.txt   # test pass (may write tests/)
```

Run it in the background; a call takes minutes. The thread lives in `.claude/gpt/.thread-id` inside
the worktree, so every AO session starts without one. **Each role starts fresh** — the design, the test
pass, an ad-hoc review. `thread`, with the same sandbox, is only for a second round of the same
conversation: a revision of the design, a re-review. The test pass used to resume the design thread,
until one resumed pass read 1.78M of a ticket's ~2.2M GPT input tokens; it starts fresh since
2026-11-09 (owner). So every prompt stands on its own, and the test pass hands GPT its own design and
your critique verbatim from the reviews file. Nor would a `thread` call guarantee the context: `ask.sh`
falls back to a fresh thread when a resume fails (it says so on stderr), and any `fresh` call in
between has replaced `.thread-id`.

Verify what GPT claims — re-run the suite and its mutation audits yourself — before reporting it as fact.

## AO, tickets and branches

**Every session runs in its own AO worktree, never in the project checkout.** Two sessions ran in
parallel on 2026-08-20 and both landed uncommitted in the same `index.html`, so shipping either meant
hand-splitting the file; a worktree per session stops that physically. AO creates the worktree and its
branch when it spawns the session: never `EnterWorktree`, never make another worktree, never rename the
branch. AO's project checkout (`C:\Users\pavel\ao\projects\music-garden`) stays on `main` and is never
edited.

**Work is tracked in Linear** (team *Tune Garden*):
**Backlog → Todo → In Progress → Needs Input / In Review → Done.** AO has no Linear support: every
Linear read and state change is the agents' own, through Linear's MCP server.
- **The orchestrator** plans, files tickets with the `file-ticket` skill (always into Backlog), and
  spawns a worker per ticket in the owner's Todo order — naming the ticket whenever it can, so that
  workers do not race for the top of Todo.
- **The owner alone moves tickets into Todo**, and the order of Todo is the order of work.
- **Workers** follow the `work-ticket` skill: the ticket they were given, or else the top of Todo.
- **Needs Input** is how a worker asks: when a decision is the owner's, or the owner should try the
  work before it is worth finishing. It pushes, opens a draft PR, asks on the ticket and through
  `ao report --needs-input`, and stops. When the owner answers, the orchestrator takes the answer to
  the session that asked — restoring it if it was terminated (`ao session restore`). Only if that
  fails does a new worker claim the PR (`work-ticket` § 3).
- Work found along the way that is out of scope becomes a Backlog ticket (`file-ticket`), not a detour.

**Branches come from AO:** `claude/<ticket-id>-<slug>` (`claude/tun-12-sixteenth-grid`) when the
orchestrator knew the ticket at spawn, otherwise AO's default, `ao/<session-id>/root`. Linear links the
PR through the ticket ID in its title and the `Closes <ID>` line in its body, so the branch name does
not matter. AO's branch tracks `origin/main`: push with `git push -u origin HEAD`. A session may commit,
push its own branch and open PRs. **`main` is the deploy branch**: only the owner merges — or a session
does, when the owner says so in that session. Merge when the owner says the work is done, not when the
code compiles. Before a PR goes for review, merge a freshly fetched `origin/main` into it and re-run the
suite: parallel tickets still collide in the `js/` files they share — `js/packages.js` above all.

Workers report their milestones — claimed, Needs Input, done — with `ao report`; the hand-off formats
are in `work-ticket`.

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

- **GPT never edits source.** It designs, reviews, tests, and authors. Through `ask.sh` it may write
  files under `tests/`; review them before keeping them.
- Pass file paths and diffs, not conversation history. GPT can read the repo itself.
- Before GPT designs — and before any review — read the `reviews/` files for the area you're
  touching, and `REVIEW-LOG.md` for anything older than 2026-09-28, and point GPT at them.
- **Report GPT's work verbatim** — its design, its test findings, AO's review comments. Never soften
  or summarize away a disagreement.
- Don't tell the owner GPT agreed when it didn't, and don't tell them it objected to
  something it merely noted. Severity is part of the finding.

## Cost

The ChatGPT limit is account-wide and per rolling 5-hour window, and everything GPT does here draws
on it: every `ask.sh` call, **AO's reviewer**, and every parallel ticket session — as they all share
the owner's Claude plan limits — and it is the bottleneck. AO's reviewer runs once per PR head, so
batch each round's fixes into one push, never request a review on a draft, and don't push after an
approval without reason: a new head is a new review.

If a limit runs out mid-task, finish the verification yourself rather than stall, and say so. Never
switch models silently — AO's reviewer included (`--agent`, `--model`): a review that fails on the
limit is `ao report --needs-input`, and the owner decides.

Resuming a thread replays the whole transcript, so review #5 costs more than review #1 (the
famous-meter test pass read 3.4M tokens, mostly cached) — which is why every role now starts fresh.
`ask.sh` prints token usage to stderr — watch it. A session that moves on to a second task deletes
`.claude/gpt/.thread-id` first.

`AGENTS.md` rides along on **every** Codex call — `ask.sh`'s and AO's reviewer's. Keep it lean.
