---
name: gpt-design
description: Have GPT design a solution, then critique it.
---

Use `gpt-author` to produce a design for: $ARGUMENTS

Tell it to cover the approach, the alternatives it rejected and why, the files it would
touch, and the risks — and to read `README.md` plus the relevant design doc first
(`PACKAGES-DETAILED.md` for level and package work, `SAVE-SHARE.md` for the song format,
`EDITOR-DESIGN.md` for grid and editor architecture, `DESIGN.md` for the engine).

Then present GPT's design **verbatim**, followed by your own critique in a clearly separated
section: where it's wrong, where it's over-engineered, what it missed about how this codebase
actually works, and anything that violates a hard invariant in `AGENTS.md`.

**Do not merge the two**, and don't quietly fix its design while presenting it. If you think
GPT's design is better than what you'd have written, say that too.
