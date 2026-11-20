# Tester brief — GPT tests the build against its design

Step 4 of `CLAUDE.md`'s loop, for **L** tickets only, and "have GPT test…". GPT designed the change; now it adds
tests from that design and hunts for what your own testing missed. The value is in the gaps, so
be honest and specific about your coverage — a vague summary makes GPT repeat work you already
did and wastes the owner's usage limit.

**1. Write to `.claude/gpt/prompt.txt`** (worktree-local on purpose — Git Bash mangles `/tmp`
paths when they reach native Windows tools):

- What changed: paths and a summary
- **The spec, verbatim:** GPT's own design and your critique, pasted from the ticket's `reviews/`
  file as they stand there, with *Owner's decisions* and the ticket's *Done looks like*. The test
  pass runs in a fresh thread, so this prompt is all GPT knows of its design.
- **Where the build departs from GPT's design, and why** — so it tests the departures as
  deliberate rather than reporting them as bugs, and says plainly when it thinks one is wrong.
  Invite it to falsify its own design, not just to confirm that the code matches it.
- What you already tested, *exactly* how, and what passed. Name the test files and the cases.
- What you did NOT test, and why. Be explicit about anything you couldn't reach — rendering,
  audio, `file://` and real gameplay are invisible from Node.

**2. Tell it how testing works here**, or it will invent a framework this repo doesn't use:

- Run the suite with `node --test "tests/*.test.mjs"`. Zero dependencies — do not add any,
  and do not introduce a test framework.
- **Read `tests/README.md` before writing a test.** It documents the vm harness, `plant()`,
  and the realm gotcha that makes `deepStrictEqual` fail on structurally identical arrays.
- New tests go in `tests/` as `*.test.mjs` and are kept, not thrown away.
- The harness reaches pure logic only — detectors, goal `chk` functions, palette maths, the
  song format. It cannot see rendering or audio. Asserting on those is not possible; flag
  them for browser verification instead of faking a test.
- Never edit the game's source — `index.html` or anything in `js/` — to make a test pass. If the
  game is wrong, report it.

Ask GPT to add the tests its design implies — the cases it meant the design to handle — and to
focus on edge cases, error paths, boundary values, and integration points your coverage missed;
and to **run** the tests it writes and report actual results, not predicted ones.

**3. Run:**

```bash
.claude/gpt/ask.sh fresh workspace-write gpt-6.2-astra .claude/gpt/prompt.txt
```

`fresh`, like every GPT call (owner, 2026-11-09 and 2026-11-10): resuming a thread replays its whole
transcript — one resumed test pass read 1.78M of a ticket's ~2.2M GPT input tokens — and the ChatGPT
limit is the bottleneck. A second round is fresh too, with the first round's results in its prompt.
Take the GPT lock first (`CLAUDE.md` § Cost).
`workspace-write` is deliberate: a reviewer that can't write a test file can't test much.
It's safe because the session is in its own AO worktree and everything lands in the diff
before merge. This call also carries network access and the Polly-only AWS credentials — the
read-only calls don't.

**4. Report what GPT tested, what passed, and what failed.** Failures come back to you to
fix. **Review every file GPT added before keeping it** — check it tests real behavior rather
than restating the implementation, and that it follows `tests/README.md`. Delete anything
that doesn't earn its place, and say what you deleted.
