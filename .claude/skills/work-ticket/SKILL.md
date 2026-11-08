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
- Verify in the browser as `CLAUDE.md` and `AGENTS.md` require. **The preview server serves the main
  checkout**, even after `EnterWorktree` (measured 2026-09-27) — but worktrees live inside it, so this
  worktree is at **`http://localhost:<port>/.claude/worktrees/<name>/index.html`**, and its relative
  assets (`samples/`, `voice/`) resolve to the worktree's own copies. `preview_start` with the
  `music-garden` config, then `navigate` there. If that path 404s, the server is this worktree's own
  (a session the app launched inside it): use `/`. Either way, confirm with something only this branch
  has before trusting what you see.
- Every preview shares one origin, so **`localStorage` — saves, progress, settings — is shared** with
  the main checkout's preview and every other worktree's. A ticket that changes stored data must test on
  a clean profile and say so; never clear storage the owner may be using.

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
2. Comment on the ticket in the **Needs Input** format (§ Hand-off formats), and post the same text
   in this session.
3. Move the ticket to **Needs Input** and end your turn.

The owner answers either here, in this session, or on the ticket, moving it back to Todo. Either way,
work continues on the same branch.

## 6. Finish

1. Update the docs, per `CLAUDE.md` § Docs.
2. **Bring the branch up to date:** merge `origin/main` into it, resolve conflicts, and re-run the syntax
   check and the whole suite. Parallel tickets mostly collide in the `js/` files they share (`js/packages.js`
   above all, since every new level lands there), so resolve those by reading both sides, never by picking one.
3. Commit in the repo's style (a short imperative subject that says what changes for the player, a body
   that says why), push, and open the PR against `main`, or mark the draft ready. Put the ticket ID in the
   title: *"TUN-12 Let the free tunes carry sixteenth-note bars"*.
4. Write the PR body in the **PR** format (§ Hand-off formats).
5. Wait for Netlify's deploy preview (`gh pr checks`), then comment on the ticket in the **In Review**
   format, with the preview URL filled in. Move the ticket to **In Review**, and post the same comment
   in this session as your report.

## Hand-off formats

Every hand-off goes to three places: the ticket, the PR and this session. Use these shapes exactly,
headings included, so the owner always knows where to look. Leave a section out only when the template
says it may be left out.

### The playtest checklist — the heart of every hand-off

This is how the owner spends his time, so it must be honest and short.

- **Each item is where → do → expect**, and "expect" names something the owner could see or hear go
  WRONG: *"three clicks a bar, the first one accented"*, never *"it works"* or *"check the bars"*.
- **Build it from three sources, in this order:**
  1. each *Done looks like* criterion in the ticket that the tests cannot judge;
  2. everything you could not verify yourself: sound by ear, the phone, touch gestures, feel, pacing;
  3. one or two **regression** checks on neighbouring features the diff touched.
- **Leave out anything a test or your browser check already proved.** Padding the list teaches the owner
  to skim it. If nothing needs his eyes or ears, say so in one line instead of inventing items.
- Tag each item 📱 phone, 🖥 desktop or 👆 touch where the device matters. Most important first; about
  eight items at most. If there are more, the ticket was too big — say so.
- Give each item a step count or a time ("~2 min") only when it is long.

```markdown
- [ ] **Jukebox → The Moldau**, Click set to *Count in + tick*, press ▶ — expect two clicks, then the
      low E pick-up landing on the last eighth; the bar chips read 1–9, with 9 five columns wide.
- [ ] 📱 **Same, on the phone preview** — expect the bar chips not to overlap the pads at the smallest zoom.
- [ ] **Regression: Stepping Stones' reward** — finish level 1; expect Mary to play flat and without bars,
      exactly as before.
```

### In Review — the ticket comment

```markdown
**Ready for review** · PR #<n> · Preview: <netlify deploy-preview URL> · Session: <session link>

**What changed for you**
- One to three bullets, in the player's terms.

**Please playtest**
<the checklist>

**Choices I made that you might overrule**
- Anything you decided that the ticket did not settle, one line each, with the alternative.
  (May be left out when there were none.)

**Review and tests**
- GPT: one line per finding — severity, the finding, agreed or disagreed, what you did. Full record:
  `reviews/<ID>-<slug>.md`.
- Verified: N/N tests; what you checked in the browser.
- Not verified: what you could not reach.
```

### Needs Input — the ticket comment

```markdown
**Needs your input** · Draft PR #<n> · Preview: <URL> · Session: <session link>

**Where it stands**
Two or three lines: what is done, what is waiting on you.

**Questions**
1. The question, answerable in a word or a line.
   - **A)** … · **B)** … — **I'd pick A**, because …
2. …

**Try this first**
<the checklist — only what informs the answers; may be left out when the questions need no playtest>

**How to answer:** reply here — "1A, 2: keep it" is enough — then move the ticket back to **Todo**, and
the next session picks it up where this one stopped. Or answer in the session linked above, if it is
still open.
```

### The PR body

```markdown
Closes <ID>.

## What changes for the player
One short paragraph, or bullets.

## Please playtest
<the same checklist as the ticket>

## Review
GPT's findings with severity and your verdict, including any disagreement in GPT's own words. Which of
GPT's test files were kept or deleted, and why.

## Tests
N/N pass; mutation audits run; what the browser check covered; what remains unverified.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

## Never

- Never merge a PR or push to `main` — every push to `main` deploys to production. Merging happens
  only when the owner explicitly says so in this session.
- Never move a ticket into Todo, or out of anyone else's In Progress.
- Never delete a worktree or a branch that holds unmerged work.
- Never force-push.
