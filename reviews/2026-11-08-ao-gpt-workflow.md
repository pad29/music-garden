# 2026-11-08 — Run the Claude/GPT workflow through AO, with GPT designing each ticket

Branch `claude/ao-gpt-workflow` · ad-hoc work the owner approved directly (no ticket) · AO session
`music-garden-2`

Docs and skills only. The owner moved the repo onto Agent Orchestrator and changed the division of
labour: GPT designs each ticket and Claude critiques it; Claude implements and tests; GPT adds tests
against its design; Claude opens the PR; AO's native reviewer (Codex on Astra) reviews it; the owner
merges. This change itself ran under the **old** loop — Claude designed, GPT reviewed the design —
because the new one did not exist yet.

## Measured before designing (this AO worker, 2026-11-08)

- `ao preview index.html` and bare `ao preview` exited 0, but the agent's browser tab stayed on
  `about:blank`. The route that worked: `npx --yes http-server -p 8378 -c-1 -a 127.0.0.1 .` in the
  worktree, the served `index.html` byte-identical to disk, then `ao browser open
  "http://127.0.0.1:8378/index.html?dev"` — the game loaded with no page errors and the `?dev`
  controls present.
- AO reports page URLs with query values redacted (`?dev=%5Bredacted%5D`), though the real query reached
  the page.
- `ao browser open file:///…` is refused: `BROWSER_URL_FORBIDDEN`.
- A setting changed in the game (Voice → Piano) survived a reload; AO's `browser.md` gives every worker
  its own isolated, ephemeral profile. The old warning that `localStorage` is shared between previews is
  false under AO.
- Found while implementing: `ao browser` has **no way to run page JavaScript** (no evaluate, no console
  input — `ao browser --help`). Workers cannot run the playback goldens' console capture. Filed as
  **TUN-71** (Backlog, `needs-owner`).

## Design review (Astra)

GPT, overall: *"I would revise this before implementation. The main problems are review completion,
ticket ownership, and recovery—not the division of labour."* It could not run `ao` (not on its PATH),
so it judged the AO commands from the guides. All ten findings were taken.

1. **High — the review wait did not identify which result counts.** *"An old approval, an absent result,
   or a polling error must never become approval of the current PR head. Leaving the JSON fields until
   the first production run leaves the central gate undesigned."* **Agreed** — `work-ticket` § 8 waits
   for the verdict on the PR's current head; an older head's verdict, a missing run or an `ao` error is
   not an approval; the wait gives up after an hour; the hand-off re-checks that the approved head is
   still the PR's head. The exact `ao review ls --json` poll is filled in from this PR's first AO
   review run.
2. **High — the round cap turned unresolved work into completion.** *"A third round finding a real bug
   is materially different from repeatedly requesting a change Claude disputes. Both currently reach In
   Review and `ao report --done`."* **Agreed** — a round where Claude disputes everything, or three
   rounds without approval, end in Needs Input, *"not In Review, and not `--done`"*; failed or cancelled
   runs are retried at most twice, then `--stuck`; a run that fails on the ChatGPT limit is
   `--needs-input`, with no reviewer switch.
3. **High — the Linear claim is not a lock.** *"Two unnamed workers can both read Todo before either
   updates it … Re-reading narrows the race; it does not prevent it."* It also caught that the named-ticket
   rule dropped the case of a ticket held by this same session. **Agreed** — § 2 is claim-then-verify:
   after posting the claim, list the comments; an earlier claim by another session wins and the later
   one yields. § 1 separates this session, an authorised takeover, and another session. `CLAUDE.md`
   has the orchestrator name the ticket whenever it can.
4. **High — continuing a PR in a new session fails while the old worktree holds the branch.**
   *"`claim-pr` changes ownership metadata only. The subsequent `git switch <headRefName>` can fail
   because the old AO worktree still holds that branch."* **Agreed** — the orchestrator first brings the
   owner's answer back to the session that asked, restoring it if terminated; a new worker claims with
   `--no-takeover`, moves its *own* branch to the PR's verified head SHA (`git switch -C`), checks
   status, branch and HEAD even after a failure, and pushes with `git push origin HEAD:<headRefName>`.
5. **Medium — "stops once" needed a durable record of what the owner resolved.** **Agreed** — the
   reviews template gains *Owner's decisions*; the checkpoint stops for `needs-owner` only while its
   questions are unanswered there; each answer is recorded with where and when; a revised design is a
   new section and the original is never edited.
6. **Medium — thread continuity was treated as more reliable than `ask.sh` makes it.** *"O1 should be an
   optimization and source of context, never the only way the tester receives its specification."*
   **Agreed** — the test-pass prompt must stand alone and point at the reviews file; a failed resume is
   visible on stderr and recorded. The idea of parking `.thread-id` under another name was dropped.
7. **Medium — verification ran before the changes that can invalidate it.** **Agreed** —
   `git fetch origin` before merging `main`; syntax, suite and affected browser checks re-run after the
   merge and after every fix round; the hand-off names the head that was verified.
8. **Medium — "have GPT review the PR" was routed too broadly.** *"The latter must not use `ao review
   trigger` or claim the target."* **Agreed** — only this session's own PR; any other PR goes to a
   review-only worker the orchestrator provides.
9. **Medium — `file://` hand-off vs. `AGENTS.md`'s definition of done.** **Agreed** — one tool-neutral
   sentence in `AGENTS.md` § What "done" means: a required check you could not run is reported as
   pending and stays the owner's to verify before merge.
10. **Low — the port formula is a candidate, not an allocation.** **Agreed** — 8400 + the session number
    is the first candidate; the full command carries `--yes` and `-a 127.0.0.1`; a port that will not
    bind moves on; the byte comparison (`cmp`, not length) stays.

What GPT called right as proposed: the design checkpoint *"faithfully placed and easy to find"*; a
design-only draft PR as the Needs Input hand-off (*"it should clearly say there is no new playable
behaviour yet"* — now in the template); resuming the design thread for the test pass, as long as it is
not the only channel; GPT's design verbatim in `reviews/`; moving the briefs and deleting
`.claude/launch.json` (*"These changes remove misleading executable workflow affordances"*); AO-native
review, isolated browser profiles, explicit pushes.

**Cost:** 375,883 input tokens (312,960 cached), 5,548 out.

## Owner's decisions

1. *Does GPT design a ticket at pickup, inside the worker, or when it is filed?* — **At pickup, in the
   worker** (option A): the owner, relayed by the orchestrator, 2026-11-08.
2. *When does a worker stop after the design?* — the owner's rule, now `work-ticket` § 5: stop when the
   ticket is `needs-owner`, when the design or critique raises a question that would have earned
   `needs-owner` at filing, or when the standing Needs Input rule applies; smaller calls go under
   *Choices I made that you might overrule*; a GPT-vs-Claude disagreement is Claude's to resolve, with
   reasoning, unless it is itself an owner decision. Relayed 2026-11-08.
3. *Add `.ao/launch.json`, so `ao preview start` runs the dev server?* — **open**: with the owner via the
   orchestrator. Not added; `work-ticket` § 6 documents the measured http-server route, which works
   either way.
