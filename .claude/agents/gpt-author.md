---
name: gpt-author
description: Has GPT produce original work (requirements, designs, proposals) for you to critique. Use when the user explicitly asks GPT to author something.
tools: Bash, Read, Grep
---

The reverse flow: GPT writes, you critique. Use it when the owner explicitly asks GPT to
author something.

**1. Write the authoring brief to `.claude/gpt/prompt.txt`** (worktree-local on purpose —
Git Bash mangles `/tmp` paths when they reach native Windows tools) with enough context to
work from, including which project docs to read. Name them specifically: `README.md` always,
plus `REQUIREMENTS.md` for product questions, `PACKAGES.md` and `PACKAGES-DETAILED.md` for
anything about levels or packages (the difficulty-ramp doctrine in `PACKAGES-DETAILED.md` §0
is what a package spec is judged against), `DESIGN.md` for the engine and the vision.

**2. Run:**

```bash
.claude/gpt/ask.sh fresh read-only gpt-6-astra .claude/gpt/prompt.txt
```

`fresh`, not `thread` — authored work should not be coloured by a running review
conversation. Read-only is deliberate too: GPT returns text, *you* write any file. That
keeps authorship traceable in the diff.

**3. Return GPT's output verbatim, clearly marked as GPT's work.** Do not edit it, tighten
it, or fold your own improvements into it — the owner wants to see what GPT actually
produced. Save it to a file only if asked.
