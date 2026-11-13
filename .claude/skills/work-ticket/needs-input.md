# Stopping for the owner — Needs Input

Read this when `work-ticket` § 7 says to stop. **Write the hand-off for a stranger:** if the owner answers
more than an hour after it, the orchestrator does not wake you — it starts a fresh worker on your PR
(`CLAUDE.md` § AO), which knows only what the ticket, the PR and the reviews file say. Anything not
written down is lost.

1. List each question under *Owner's decisions* in the reviews file, marked **open**. Commit everything
   you have — at the design checkpoint, the reviews file alone — and push, so nothing lives only in this
   worktree. Open a **draft** PR against `main` (or keep the PR you have): Netlify builds a preview for
   the phone, and a later session can claim the PR. **Never request a review on a draft.**
2. Comment on the ticket in the format below — the same text in the draft PR's body under its PR-format
   headings (`handoff.md`), or as a PR comment if the PR body is already in use — and end with the same
   text as your last message. File its short form (under 1,000 characters; `handoff.md` says how) with
   `ao report --needs-input`.
3. Move the ticket to **Needs Input** and end your turn.

No ticket: the PR and AO get the hand-off.

**A size question** (`work-ticket` § 4, *No size*) comes before anything exists to commit: skip step 1's
commit, push and PR. Ask on the ticket and through `ao report --needs-input`, in the format below without
the PR and preview, with your proposed size and its reasoning as the question, *Resume state*'s branch
line saying nothing is pushed, and its *Next step* saying to set the confirmed size and start
`work-ticket` § 4. Then move the ticket to **Needs Input**. With no ticket, AO alone gets it.

## Needs Input — the ticket comment

```markdown
**Needs your input** · Draft PR #<n> · Preview: <URL> · Session: ao://sessions/music-garden/<session-id>

**Where it stands**
Two or three lines: what is done, what is waiting on you. At the design checkpoint, say there is no
playable change yet, link the design record (`reviews/<ID>-<slug>.md` on the branch), and leave out the
preview.

**Questions**
1. The question, answerable in a word or a line.
   - **A)** … · **B)** … — **I'd pick A**, because …
2. …

**Try this first**
<the checklist (`handoff.md`) — only what informs the answers; may be left out when the questions need
no playtest>

**How to answer:** reply here — "1A, 2: keep it" is enough — then move the ticket back to **Todo**; the
orchestrator takes it to the right session, and the work resumes where this stopped. Within the hour you
may answer in the AO session linked above instead; after that, answer here — a fresh session may already
own the PR.

<details><summary>Resume state — for the session that picks this up</summary>

- **Branch:** `<headRefName>` at `<full head SHA>`; everything committed and pushed. Size: S / M / L
  (the larger, and why, if label and section disagree; "none — S / M / L proposed" at a size question).
- **Phase:** design checkpoint · building · PR review round N of 3 · … — and what is finished.
- **Decisions so far:** each with who made it and where it is recorded (the reviews file's sections).
- **GPT's findings:** each design-review, test-pass or PR-review finding still in play, with its
  severity and what was done — fixed in `<sha>`, disputed (why), or open.
- **Last review:** the head SHA GPT last reviewed and its verdict (none yet: say so). Review rounds used: N.
- **Verified:** N/N tests and the browser checks, on `<sha>`; not verified: …
- **Next step:** exactly what to do once the questions are answered — for each likely answer, if it
  matters.

</details>
```
