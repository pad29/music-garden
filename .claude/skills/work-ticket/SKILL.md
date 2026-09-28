---
name: work-ticket
description: Pick up a Tune Garden Linear ticket and carry it to a pull request, in its own worktree. Use when asked to work on a ticket ("work on TUN-12"), and from the scheduled dispatcher, which names no ticket and takes the top of Todo.
---

Ticket: $ARGUMENTS (empty means: take the top of Todo)

The whole lifecycle, in Linear states: **Todo → In Progress → (Needs Input ⇄ In Progress) → In Review →
Done.** You move a ticket as far as In Review. Only the owner moves tickets into Todo, and only the owner
merges.

## 1. Choose the ticket

- **A ticket was named:** use it. If it is already In Progress and this session did not claim it,
  another session probably holds it. Stop and ask, unless the owner named it to you in this conversation.
- **None named (the scheduler):** list team **Tune Garden** issues in **Todo**, in Linear's own order
  (the owner's drag order), and take the first. If Todo is empty, stop with one line: "Nothing in Todo."
  Never take Backlog, Needs Input or In Review tickets on your own.

## 2. Claim it — the claim is the lock

Re-read the ticket's state immediately before claiming. If it is no longer Todo, another session got
there first: go back to step 1 for the next one. Otherwise move it to **In Progress** and comment
*"Picked up by session <title> — <link>"*. `get_session("self")` gives your title and link.

## 3. Get into its worktree

Never work in the main checkout (`C:\Claude\MusicTheory`); it stays on `main`, unedited.

- **Fresh ticket:** `EnterWorktree` with `name: <id>-<slug>` (lower case, e.g. `tun-12-sixteenth-grid`).
  It branches from `origin/main`. Then rename the branch so Linear's GitHub integration links it:
  `git branch -m claude/<id>-<slug>`.
- **Resumed ticket** (it was in Needs Input and came back to Todo): look for an existing
  `origin/claude/<id>-*` branch and open PR. `git worktree add .claude/worktrees/<id>-<slug> <branch>`,
  then `EnterWorktree` with that `path`. Read every comment on the ticket, the PR, and its
  `reviews/<id>-*.md` before doing anything. You are continuing someone's work, not starting over.

## 4. Do the work

- Read the whole ticket, then `AGENTS.md`, `CLAUDE.md`, and everything its **Read first** names.
- Follow `CLAUDE.md`'s default loop in full, including both GPT rounds. The review record goes in
  `reviews/<ID>-<slug>.md` (see `reviews/README.md`), not in `REVIEW-LOG.md`.
- **Decisions already made** in the ticket are not yours to reopen. If the work shows one is wrong, that
  is a Needs Input question, not a quiet change.
- Verify in the browser as `CLAUDE.md` and `AGENTS.md` require. Check that the preview serves THIS
  worktree (look for a string you changed); if it serves the main checkout instead, say so in your report.
  Don't burn turns fighting it.

## 5. Stop for the owner when you should — Needs Input

Stop when either is true:
- **A decision is the owner's:** anything under the ticket's *Open questions*, anything labelled
  `needs-owner` once you have a proposal, or a new fork where the readings lead to materially different
  work.
- **The owner should try it before it is worth finishing:** music, feel, pacing, anything visual or
  audible that tests cannot judge.

Then:
1. Commit what you have and push the branch. Open a **draft** PR against `main`, so Netlify builds a
   deploy preview the owner can try on the phone.
2. Comment on the ticket: what is done; each question with its options and your recommendation; and
   exactly how to try it — the Netlify preview URL, and this worktree's `index.html` for `file://`.
3. Move the ticket to **Needs Input** and end your turn.

The owner answers either here, in this session, or on the ticket, moving it back to Todo. Either way,
work continues on the same branch.

## 6. Finish

1. Update the docs, per `CLAUDE.md` § Docs.
2. **Bring the branch up to date:** merge `origin/main` into it, resolve conflicts, and re-run the syntax
   check and the whole suite. Parallel tickets mostly collide in `index.html`, so resolve those by reading
   both sides, never by picking one.
3. Commit in the repo's style (a short imperative subject that says what changes for the player, a body
   that says why), push, and open the PR against `main`, or mark the draft ready. Put the ticket ID in the
   title: *"TUN-12 Let the free tunes carry sixteenth-note bars"*.
4. The PR body: what changes for the player; what GPT flagged and what you did, including any
   disagreement verbatim; tests; what is still unverified; how to try it.
5. Wait for Netlify's deploy preview (`gh pr checks`). Comment on the ticket with the PR link, the preview
   URL and a three-line summary. Move it to **In Review**. Report the same in this session.

## Never

- Never merge a PR or push to `main` — every push to `main` deploys to production. Merging happens
  only when the owner explicitly says so in this session.
- Never move a ticket into Todo, or out of anyone else's In Progress.
- Never delete a worktree or a branch that holds unmerged work.
- Never force-push.
