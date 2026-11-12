# Design-reviewer brief — GPT attacks a plan or finished work

For GPT's design review of Claude's plan on **M** tickets (`work-ticket` § 4); for ad-hoc reviews — the
`gpt-review` skill and "get GPT's take on…"; and, temporarily, for the PR review itself, while AO's
reviewer cannot submit (`work-ticket` § 8 — the review that also lists missing tests).

Get GPT to attack the work. GPT is a counterparty, not a collaborator — your job is to carry its
objections back intact, not to defend the design.

**1. Read the `reviews/` files for the area first** (and `REVIEW-LOG.md` for anything before
2026-09-28) so you know what GPT has already flagged on this codebase.
Don't re-ask a question that's already settled there; do mention it if this design repeats a
mistake the log records.

**2. Write the design to `.claude/gpt/prompt.txt`** (worktree-local on purpose — Git Bash
mangles `/tmp` paths when they reach native Windows tools). Frame it as:

- The problem being solved — what the player experiences, not just the code change
- For an M plan, the **whole ticket verbatim** and any owner answers (`work-ticket` § 4), so GPT
  can catch what the plan left out
- The proposed approach
- Alternatives considered, and why they were rejected
- Relevant file paths (GPT reads the repo itself — don't paste code it can open)
- Which project docs it should read first. Be specific and name them; that's cheaper than
  making `AGENTS.md` carry everything. For most game changes that's `README.md` plus the one
  relevant design doc — `PACKAGES-DETAILED.md` for level/package work, `SAVE-SHARE.md` for
  anything touching the song format, `EDITOR-DESIGN.md` for grid/editor architecture.

Ask GPT to identify: incorrect assumptions, missed edge cases, simpler alternatives, and
anything that conflicts with `AGENTS.md` — especially the hard invariants (the `file://`
constraint, stable slug IDs, generated files, score-validated melodies).

**3. Run:**

```bash
.claude/gpt/ask.sh fresh read-only gpt-6-astra .claude/gpt/prompt.txt
```

Every role runs on Astra (owner, 2026-09; see `CLAUDE.md` § Calling GPT), and every call is
`fresh` — a second round of the same review too: its prompt quotes the first round's findings and
gives the delta. Take the GPT lock first (`CLAUDE.md` § Cost). If the ChatGPT limit runs out —
`ask.sh` exits 69, naming the reset time when codex gave one — say so rather than silently switching models.

**4. Return findings as a numbered list with severity.** Fix nothing — report only.

For each finding, state whether you agree and why. **Where you disagree, say so plainly and
keep GPT's wording.** A disagreement between the two of you is the product of this whole
setup; never smooth one into "a minor point I'd already considered."
