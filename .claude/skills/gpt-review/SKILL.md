---
name: gpt-review
description: Ad-hoc GPT review of whatever is currently in the working tree.
---

Get GPT to review the current uncommitted state of the working tree. Focus, if the owner gave
one: $ARGUMENTS

First run `git status --short` and `git diff` (plus `git diff --staged`) so you know what
actually changed. If the diff is large, summarize the shape of it rather than pasting all of
it — GPT can read the files itself.

Then run GPT's review yourself, with the design-reviewer brief (`.claude/gpt/briefs/design-reviewer.md`;
`CLAUDE.md` § Calling GPT), framing the prompt as a review of work already done rather than a plan:
what changed, why, and what you're unsure about. Point it at the specific files. Run it `fresh`;
`thread` only for a second round of the same review.

Report its findings as a numbered list with severity, saying for each whether you agree and
why. Fix nothing until the owner has seen the findings.

This is the ad-hoc gate — it doesn't replace the default loop in `CLAUDE.md`, or AO's review of the
PR. If this review turns up something substantive, record it in the ticket's `reviews/` file (see
`reviews/README.md`).
