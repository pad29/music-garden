# Hand-off formats

Read this when you hand off: In Review (`work-ticket` § 8), or Needs Input (`needs-input.md`, which has
its own template).

Every hand-off goes in full to the ticket, the PR, and your last message in this session. Use these
shapes exactly, headings included, so the owner always knows where to look. Leave a section out only
when the template says it may be left out. **No ticket:** no ticket comment and no `Closes` line; the
PR and AO get the hand-off.

AO gets the short form: **`ao report` notes are capped at 1,000 characters** (a longer one is refused —
measured 2026-11-09). So its note says in a few lines where things stand and what is needed — the
questions, or the verdict — with the PR attached (`--pr-created <url>`); the full text is on the ticket
and the PR.

Hand-off text is full of backticks, which the shell would run. Pass it literally — a quoted heredoc into
a variable, then the variable:

```bash
note=$(cat <<'EOF'
<the short form, under 1,000 characters>
EOF
)
ao report --done --note "$note" --pr-created <url>
```

PR bodies the same way: `gh pr create … --body-file -` or `gh pr edit <n> --body-file -`, fed by a
`<<'EOF'` heredoc.

## The playtest checklist — the heart of every hand-off

This is how the owner spends his time, so it must be honest and short.

- **Each item is where → do → expect**, and "expect" names something the owner could see or hear go
  WRONG: *"three clicks a bar, the first one accented"*, never *"it works"* or *"check the bars"*.
- **Build it from three sources, in this order:**
  1. each *Done looks like* criterion in the ticket that the tests cannot judge;
  2. everything you could not verify yourself: sound by ear, the phone, touch gestures, feel, pacing —
     and `file://`, which AO's browser cannot open, whenever asset loading changed;
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

## In Review — the ticket comment

```markdown
**Ready for review** · PR #<n> · Preview: <netlify deploy-preview URL> · Session: ao://sessions/music-garden/<session-id>

**What changed for you**
- One to three bullets, in the player's terms.

**Please playtest**
<the checklist>

**Choices I made that you might overrule**
- Anything you decided that the ticket did not settle, one line each, with the alternative.
  (May be left out when there were none.)

**Review and tests**
- Size: S / M / L (or trivial), and so which loop ran — and, if the `Size` label and the `## Size`
  section disagree or the size looked wrong, the larger one worked and why; if the ticket had neither,
  the size the owner confirmed.
- Design: L — GPT designed it; my critique, one line per point: severity, the point, what was built
  instead. M — my plan; GPT's design review, one line per finding: severity, the finding, agreed or
  disagreed, what you did. S — "my short plan, no GPT design review — S". Trivial — "not required —
  trivial change".
- GPT's test pass: L — what it found, and which of its test files were kept. S/M — "not run — <size>";
  the missing tests GPT's PR review listed, and which you added.
- AO's review (Codex, Astra) — temporarily (`work-ticket` § 8), GPT's PR review through
  `ask.sh`: **approved** on `<short sha>` after N rounds — one line per finding: severity, the finding,
  agreed or disagreed, what you did. Full record: `reviews/<ID>-<slug>.md`.
- Verified: N/N tests; what you checked in the browser, on which head.
- Not verified: what you could not reach — `file://` among them whenever asset loading changed.
```

## The PR body

```markdown
Closes <ID>.

## What changes for the player
One short paragraph, or bullets.

## Please playtest
<the same checklist as the ticket>

## Review
The size and the loop it got. The design in brief — GPT's design and my critique (L), or my plan and
GPT's design review (M) — in full in the reviews file. GPT's test findings (L), and which of its test
files were kept or deleted, and why; or the missing tests the PR review listed (S/M), and which were
added. AO's review (temporarily, GPT's `ask.sh` PR review — `work-ticket` § 8): each
finding with severity and my verdict, including any disagreement in the reviewer's own words — and,
once it lands, the verdict, verbatim.

## Tests
N/N pass; mutation audits run; what the browser check covered, on which head; what remains unverified.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

With no ticket, leave out the `Closes` line.
