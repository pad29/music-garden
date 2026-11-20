# Author brief — GPT writes, you critique

The reverse flow: GPT writes, you critique. It is step 1 of `CLAUDE.md`'s loop for **L** tickets — GPT
designs them, through the `gpt-design` skill (S and M tickets are planned by Claude; on M, GPT reviews
the plan with the design-reviewer brief, and S has no GPT design step) — and it is what `gpt-spec` and
"ask GPT to write…" use.

**1. Write the authoring brief to `.claude/gpt/prompt.txt`** (worktree-local on purpose —
Git Bash mangles `/tmp` paths when they reach native Windows tools) with enough context to
work from, including which project docs to read. Name them specifically: `README.md` always,
plus `REQUIREMENTS.md` for product questions, `PACKAGES.md` and `PACKAGES-DETAILED.md` for
anything about levels or packages (the difficulty-ramp doctrine in `PACKAGES-DETAILED.md` §0
is what a package spec is judged against), `DESIGN.md` for the engine and the vision. For a
ticket, paste the ticket itself, verbatim.

**2. Run:**

```bash
.claude/gpt/ask.sh fresh read-only gpt-6.2-astra .claude/gpt/prompt.txt
```

`fresh` — every GPT call is (`CLAUDE.md` § Calling GPT), and authored work should not be coloured by
a running review conversation. A revision of the design is a fresh call too, with a prompt that
stands alone. Read-only is deliberate too: GPT returns
text, *you* write any file. That keeps authorship traceable in the diff.

**3. Return GPT's output verbatim, clearly marked as GPT's work.** Do not edit it, tighten
it, or fold your own improvements into it — the owner wants to see what GPT actually
produced. A design goes into the ticket's `reviews/` file, as the `gpt-design` skill says;
anything else is saved to a file only if asked.
