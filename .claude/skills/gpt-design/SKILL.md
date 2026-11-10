---
name: gpt-design
description: Have GPT design a ticket or a change, then critique the design. Step 1 of CLAUDE.md's default loop (work-ticket § 4), and what "have GPT design…" means.
---

Have GPT design: $ARGUMENTS (a Linear ticket ID, or a description of the change)

GPT designs; you critique. Neither edits the other's words.

1. **Gather what GPT needs.** For a ticket, read it in Linear with its comments, and paste it into the
   brief **verbatim** — every section, *Decisions already made*, *Open questions* and *Out of scope*
   included: GPT designs from what you paste. Read the `reviews/` files for the area (and
   `REVIEW-LOG.md` for anything before 2026-09-28), and name them in the brief.
2. **Write the author brief** (`.claude/gpt/briefs/author.md`) to `.claude/gpt/prompt.txt`. Ask for the
   approach; the alternatives it rejected and why; the files and functions it would touch; the tests
   that would prove it; the risks; and every question only the owner can answer — as a question with
   options, never decided. Tell it that *Decisions already made* are fixed, *Out of scope* is out, and
   the `AGENTS.md` hard invariants hold; and to read `README.md` plus the relevant design doc first
   (`PACKAGES-DETAILED.md` for level and package work, `SAVE-SHARE.md` for the song format,
   `EDITOR-DESIGN.md` for grid and editor architecture, `DESIGN.md` for the engine, `QUESTS.md` for
   quests).
3. **Run** `.claude/gpt/ask.sh fresh read-only gpt-6-astra .claude/gpt/prompt.txt` in the background.
   GPT's test pass later starts a thread of its own and learns the design only from the reviews file,
   so step 5's verbatim record is what it will test against.
4. **Present GPT's design verbatim**, then your own critique in a clearly separated section: where it
   is wrong, where it is over-engineered, what it missed about how this codebase actually works, and
   anything that violates a hard invariant in `AGENTS.md`. Give each point a severity and say what you
   will build instead. If GPT's design is better than what you would have written, say that too.
5. **Record both** in `reviews/<ID>-<slug>.md` (no ticket: `reviews/<date>-<slug>.md`): GPT's design
   verbatim inside a `<details>` block, then your critique. `reviews/README.md` has the shape.

**Do not merge the two**, and don't quietly fix its design while presenting it. In a ticket session the
design checkpoint comes next: `work-ticket` § 5.

**A revision** — the owner's answer changed the design (`work-ticket` § 7): run `ask.sh thread`, with a
prompt that stands alone — the reviews file's design and *Owner's decisions*, and what changed — so it
works even when the resume falls back to a fresh thread. Add the revision as a new section, never
editing the original, and critique it the same way.
