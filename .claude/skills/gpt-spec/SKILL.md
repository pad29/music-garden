---
name: gpt-spec
description: Have GPT write requirements for a feature, then critique them.
---

Have GPT produce requirements, using the author brief (`.claude/gpt/briefs/author.md`) and calling
`ask.sh` yourself as `CLAUDE.md` § Calling GPT describes. The requirements are for: $ARGUMENTS

Tell it to include functional requirements, non-functional requirements, edge cases, and open
questions — and to read `README.md`, `REQUIREMENTS.md`, and (for anything about levels or
packages) `PACKAGES.md` plus the difficulty-ramp doctrine in `PACKAGES-DETAILED.md` §0 first.

Then present GPT's output **verbatim**, followed by your own critique in a clearly separated
section: what's missing, what's over-specified, what conflicts with `AGENTS.md`, and what
assumes a feature this repo hasn't built (`EDITOR-DESIGN.md` describes a plan, not the
current editor).

**Do not merge the two.** The owner wants to see what GPT actually produced and what you
actually think of it, side by side.
