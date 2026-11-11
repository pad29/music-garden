---
name: work-ticket
description: Carry a Tune Garden Linear ticket from its design to a pull request GPT's review has approved, as an AO worker. Use when given a ticket ("work on TUN-12"), or, with none named, to take the top of Todo.
---

Ticket: $ARGUMENTS (empty means: take the top of Todo)

You are an AO worker: AO made this worktree and its branch, the orchestrator spawned you, and the owner
reads what you hand off. In Linear states: **Todo → In Progress → (Needs Input ⇄ In Progress) → In
Review → Done.** You move a ticket as far as In Review. Only the owner moves tickets into Todo, and only
the owner merges.

**The loop depends on the ticket's size** — the table in `CLAUDE.md` § The loop, by size. Whether to stop
for the owner once the design exists is decided in one place: § 5. § 7 says how to stop.

Files beside this one, read **only when their step comes up**: `resume.md` (taking over or resuming a
ticket), `browser.md` (the browser check), `needs-input.md` (stopping for the owner), `pr-review.md`
(AO's reviewer and the limit), `handoff.md` (the hand-off formats).

**No ticket** — ad-hoc work the owner asked for: skip every Linear step (§§ 1–2, ticket comments, state
moves) and the `Closes` line; size it M unless the owner gave a size; the review record is
`reviews/<date>-<slug>.md`, and hand-offs go to the PR and AO. **A trivial change** — a typo, a comment,
formatting: skip §§ 4–5, and write *"not required — trivial change"* in the hand-off's design and test
lines. The PR review runs on every PR either way.

## 1. Choose the ticket

- **A ticket was named** — in your spawn prompt, or by the owner. In Todo, claim it (§ 2). Already
  **In Progress**: its live claim (§ 2) names the AO session that holds it.
  - **This session** (you are coming back to it): carry on where you stopped.
  - **Another session, and your instructions say to take it over or resume it:** `resume.md`.
  - **Another session, otherwise:** stop — `ao report --needs-input --note "<ID> is held by <session>"`.
- **None named:** list team **Tune Garden** issues in **Todo**, in Linear's own order (the owner's drag
  order), and take the first. If Todo is empty: `ao report --done --note "Nothing in Todo."` and stop.
  Never take Backlog, Needs Input or In Review tickets on your own.

## 2. Claim it

Re-read the ticket's state immediately before claiming. If it is no longer Todo, another session got
there first: back to § 1. Otherwise move it to **In Progress** and comment *"Picked up by AO session
`<session-id>` — ao://sessions/music-garden/<session-id>"*. Your ID is `$AO_SESSION_ID`; the link opens
only inside the AO app, so the ID is what identifies you.

**The comment is the lock — once you have checked it.** Two workers can both read Todo before either
moves the ticket. So after posting, list the ticket's comments and look for another session's **live**
claim posted before yours. A claim stays live until its own session hands off (a Needs Input or In
Review comment) or yields, or another session's takeover comment names it — so a session that stopped at
Needs Input earlier does not block you. If there is one, that session holds the ticket: comment that you
yield to it, `ao report --checkpoint --note "<ID>: yielded to <session>"`, and go back to § 1.

Then `ao report --checkpoint --note "Claimed <ID> <title>"`, and, if you chose the ticket yourself,
`ao session rename "$AO_SESSION_ID" "<ID> <title>"` so the owner's sidebar says what you are on.

## 3. Your worktree — AO already made it

- You are in it: check `git status` and `git branch --show-current`. Never `EnterWorktree`, never make
  another worktree, never rename the branch, and never edit AO's project checkout
  (`C:\Users\pavel\ao\projects\music-garden`), which stays on `main`.
- The branch is `claude/<id>-<slug>` when the orchestrator knew the ticket at spawn, otherwise AO's
  default, `ao/<session-id>/root`. Either is fine: Linear
  links the PR through the ticket ID in its title and the `Closes <ID>` line in its body. AO's branch
  tracks `origin/main`, so push with `git push -u origin HEAD` — never a bare `git push`.
- **A ticket that already has an open PR** — you are resuming someone's work: `resume.md`, not § 4.

## 4. Design — by size

- Read the whole ticket and its comments, its **Read first**, and the `reviews/` files for the area —
  searching first, reading the sections that matter. **Decisions already made** in the ticket bind the
  design, the plan and the critique alike. No code yet. If the ticket's size looks wrong once you have
  read it, work it at the larger size and say why in the hand-off.
- **L** — run the **`gpt-design`** skill: GPT designs (`ask.sh fresh`), you critique, and both go into
  `reviews/<ID>-<slug>.md`, separate and verbatim — the record § 6's test pass hands back to GPT.
- **M** — write your plan into the reviews file: the approach, the files and functions, the tests that
  would prove it, the risks, and every question only the owner can answer, with options. Then get GPT's
  design review of it with the design-reviewer brief (`ask.sh fresh read-only`), and answer each
  finding — agreed or disagreed, and why — under GPT's findings, verbatim and separate.
- **S** — a short plan in the reviews file (a few lines: approach, files, tests). No GPT call.

## 5. The design checkpoint — stop or build?

The design (L) or the plan (S, M) exists; no code does. Decide here, and settle every open policy
question now — never halfway through the build.

**Stop at Needs Input (§ 7) if any of these holds:**

1. **The ticket is labelled `needs-owner` and has not been through a checkpoint with the owner yet** —
   whatever its size. Every `needs-owner` ticket stops at its first checkpoint, whether or not it lists
   questions, and *Owner's decisions* in the reviews file records the owner's answer. After that, it
   stops only for a question still open there, or a new one.
2. **The design, plan, critique or review raised a question that would have earned the ticket
   `needs-owner` had it been known at filing.** That is `file-ticket`'s test — only the owner can validate
   the result: anything musical (score-checked tunes, feel, sound), player-facing pacing, or a design
   decision with more than one defensible answer.
3. **§ 7's standing rule applies:** a new fork where the readings lead to materially different work, or
   a decision already made in the ticket that the work shows is wrong.
4. **The work is larger than L** (`file-ticket` § Size): propose the split instead of building it whole.

**Otherwise, build.** Smaller calls are yours: make them, and list each under *Choices I made that you
might overrule* in the hand-off.

**Where GPT and you disagree, you decide** — with your reasoning, and both sides reported verbatim —
**unless the disagreement is itself one of the owner decisions above. Then stop.**

## 6. Build and test

- Build the design as your critique amended it (L), or your plan as GPT's review amended it (M), or
  your plan (S). Syntax check and the suite after every edit (`CLAUDE.md` § Working lean for short
  output). Write the tests the change needs yourself — on S and M nobody else will until the PR review.
- **The browser:** read `browser.md` before the first browser check of the session. AO's browser serves
  this worktree through `ao preview start`; a screenshot is not evidence unless you know which files
  produced it.
- **L only — GPT's test pass:** the tester brief, `ask.sh fresh workspace-write`. The prompt hands GPT
  its own design and your critique verbatim from the reviews file, with *Owner's decisions* and the
  ticket's *Done looks like*; says what you tested and what you could not reach; and lists **where the
  build departs from its design, and why**, so it tests the departures as deliberate — and can object
  to them. Review every file it adds before keeping it. Fix what it found, and re-run everything the
  fixes touched.

## 7. Stop for the owner — Needs Input

**When:** § 5 says so; § 8's review loop ends here; an external tool broke on a limit
(`CLAUDE.md` § When something external breaks); or, later in the work, a decision turns out to be the
owner's (§ 5's tests), or **the owner should try it before it is worth finishing**: music, feel, pacing,
anything visual or audible that tests cannot judge. The standing rule holds at any point: a new fork
where the readings lead to materially different work, or a decision already made in the ticket that the
work shows is wrong, is a question for the owner, never a quiet change.

**How:** `needs-input.md`. Its hand-off must let a fresh session resume cold — the orchestrator starts
one when the owner answers after more than an hour. **When the answer comes:** `resume.md`, *Continuing*.

## 8. Finish — the PR and its review

1. Update the docs, per `CLAUDE.md` § Docs.
2. **Bring the branch up to date:** `git fetch origin`, merge `origin/main`, resolve conflicts, then re-run
   the syntax check, the whole suite, and any browser check the merge could have changed. Parallel
   tickets mostly collide in the `js/` files they share (`js/packages.js` above all, since every new level
   lands there), so resolve those by reading both sides, never by picking one.
3. Commit in the repo's style (a short imperative subject that says what changes for the player, a body
   that says why), push, and open the PR against `main` **ready for review** — or `gh pr ready` the draft.
   Ticket ID in the title: *"TUN-12 Let the free tunes carry sixteenth-note bars"*. Body in `handoff.md`'s
   **PR** format.
4. **The PR review — temporarily GPT's, through `ask.sh`** (owner, 2026-11-09; AO's reviewer cannot
   submit — `pr-review.md` has the diagnosis, the AO route, and when this changes). Take the `[GPT]`
   marker first (`CLAUDE.md` § Cost). Write a self-contained prompt to `.claude/gpt/prompt.txt`, framed as
   a PR review in the design-reviewer brief's manner: the PR's diff against `origin/main` — or, once GPT
   has reviewed an earlier head, only the delta since that head, with that verdict and its findings
   quoted — plus the ticket and the reviews file by path. Ask for the changes it requires, each with a
   severity, **the tests it finds missing**, each as a case to add, or an approval that names the head
   SHA it reviewed. Run `.claude/gpt/ask.sh fresh read-only gpt-6-astra .claude/gpt/prompt.txt`.
   If the call fails: `CLAUDE.md` § When something external breaks; to tell a limit from a fault,
   `pr-review.md`, *The limit*.
5. **Read the verdict, then act:**
   - **Approved on the current head, no missing tests** → step 6.
   - **Changes requested, or missing tests listed** (a list of missing tests is a change requested, not
     an approval). Answer each finding: **agree** → fix it, or add the test; **disagree** → your
     reasoning, recorded in the reviews file (on an AO review, a reply on its thread, left open). Then:
     - **You disagreed with every finding:** nothing changed, so there is nothing new to review → Needs
       Input (§ 7), with the open findings quoted against your reasons. The owner decides.
     - **Otherwise:** re-run whatever the fixes touched, the browser included where it matters, and
       record the round in the reviews file **in the same commit as the fixes** — a commit after an
       approval would be a new head, and another review. Push once. **If that was the third round,
       stop** → Needs Input (§ 7) without a fourth review: the fixes awaiting review, the disputed
       findings, and the decision you need. Otherwise, back to step 4, on the new delta.

   A review loop that ends in Needs Input is not In Review, and not `--done`.
6. **Hand off** — read `handoff.md`. An approval counts only for the head it names: check it is still the
   PR's head (`gh pr view <n> --json headRefOid`). Put the verdict, verbatim, in the PR body's **Review**
   section — an edit is not a new head. Wait for Netlify (`gh pr checks <n> --watch`) and take the preview
   URL from the deploy-preview check's link. Comment on the ticket in the **In Review** format, move the
   ticket to **In Review**, end with the same text as your last message, and file its short form with
   `ao report --done … --pr-created <url>`.

## Never

- Never merge a PR or push to `main` — every push to `main` deploys to production. Merging happens
  only when the owner explicitly says so in this session.
- Never move a ticket into Todo, or out of anyone else's In Progress.
- Never request a review on a draft PR.
- Never delete a branch that holds unmerged work, and never remove or clean up AO worktrees or
  sessions — AO owns them.
- Never force-push.
- Never retry a broken external tool in a loop (`CLAUDE.md` § When something external breaks).
