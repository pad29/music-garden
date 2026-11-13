# TUN-73 — Make ask.sh say why a GPT call failed, and tell the usage limit apart

Branch `claude/tun-73-ask-sh-failure-reasons` · Size S

## Plan (Claude)

**Cause, confirmed on `698210d`:** under `set -euo pipefail`, `run_codex fresh` is a plain command, so
codex's non-zero exit ends `ask.sh` on that line with codex's status. Nothing after it runs — not the
usage line, not the `GPT returned no message. Last events:` block. With `--json`, codex puts the error
on stdout as an event, which `run_codex` sends to `.last-events.jsonl`; stderr stays empty.

**Approach** (`.claude/gpt/ask.sh` only):

- Run codex as `run_codex fresh || status=$?`, so a failure is caught rather than ending the script.
  `thread` mode keeps `run_codex resume || { …; run_codex fresh; }`, with the fallback caught the same
  way.
- A new `failure_report` (node, JSONL on stdin like `jsonl_field`) reads the error messages from any
  error-like event: a `type` naming an error or a failure (`error`, `turn.failed`), its `message` or
  `error.message`, and an `item.*` event whose item is an error. Messages are de-duplicated, because
  codex repeats the same message in `error` and `turn.failed`. A message containing "usage limit" makes
  it a limit, and the reset time is the text after "try again at|in".
- **Exit 69 at the limit** (sysexits' `EX_UNAVAILABLE`, next to `gpt-lock.sh`'s 75, `EX_TEMPFAIL`), with
  one stderr line: `ask.sh: usage limit — try again at <time> (codex exit N)`, or *"codex gave no reset
  time"* plus the message. No retry, no wait, no other model.
- **Any other codex failure: exit 1**, with `codex failed (exit N):` and each error message on stderr.
  When there is no error event, the last 5 events instead, so a failure is never silent.
- Codex exits 0 with no answer: today's `GPT returned no message. Last events:` path, exit 1 — except
  that a limit message in the events still means exit 69.
- Success is unchanged. The exit codes go in the header comment.

**Tests** (`tests/workflow-scripts.test.mjs`): a copy of `ask.sh` runs from a sandbox directory, so its
`.last-*` and `.thread-id` files never touch the worktree's, with a stub `codex` first on PATH that
plays back canned events, an answer and an exit status. Cases: the limit (69, the one line with the
reset time, one codex call); the limit with no reset time; another failure (1, its exit status and
message); a failure with no error event (1, the last events); success (stdout only the answer, usage on
stderr); an empty answer (1, today's message); `thread` mode, whose failed resume falls back to a fresh
call that succeeds, or that hits the limit.

**Docs:** `pr-review.md` § The limit, `work-ticket` § 8 step 4, and the design-reviewer brief's limit
line: a failed `ask.sh` names the limit itself (exit 69), and the one-word probe stays for a failed AO
reviewer run. The `CLAUDE.md` § Cost mention of the probe only says it takes the lock, which still holds.

**Built as planned**, with one fix the tests found: a tab-separated limit report collapsed an empty
reset time under `read`'s IFS, so `failure_report` now formats the limit line itself.

## Tests

`tests/workflow-scripts.test.mjs`, eight `ask.sh:` cases against a stub `codex`. Against `698210d`'s
`ask.sh`, the six failure cases fail (exit 1, mostly with an empty stderr, or codex's own 3). The success and
empty-answer cases pass there too: they pin behaviour the ticket keeps unchanged, so "each fails against
today's `ask.sh`" can't hold for them. Mutation audit, all caught: no status catch (fresh, or `thread`'s
fallback), no de-duplication, the limit exiting 1, the empty-answer path skipping the limit check, a
greedy reset-time capture, no last events on an unexplained failure. Syntax check and the whole suite
(672) pass.

**Unverified:** codex's real error events. The repo records only the message text of the 2026-11-10
limit failure, not its event types, so the stub uses `error` and `turn.failed`; the parser also accepts
any event type naming an error or a failure, and prints the last events when it finds no message.

## PR review (Astra, through `ask.sh`)

`music-garden-13` took the PR over from `music-garden-10` at `c8cece7` (the earlier session went idle
before its review).

### Round 1 — on `c8cece7`: changes requested

GPT, verbatim:

> Required changes:
>
> 1. **Major — [.claude/gpt/ask.sh:145](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-13/.claude/gpt/ask.sh:145): Check a failed resume for the limit before starting fresh.** Every nonzero resume currently triggers another Codex call, including an explicit usage-limit failure. That call overwrites the resume’s events, potentially losing its reset time and returning an unrelated failure—or success. This contradicts the new header’s “Never retried” guarantee. Preserve the stale-thread fallback, but stop with 69 when the resume reports the limit.
>
> 2. **Minor — [.claude/gpt/ask.sh:110](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-13/.claude/gpt/ask.sh:110): Preserve reset information across messages and punctuation.** The parser selects only the first limit message. An initial `"You've hit your usage limit."` followed by a detailed `turn.failed` message incorrectly produces “codex gave no reset time.” Separately, `try again at 2:49 a.m. CST on November 11, 2026.` is truncated to `try again at 2:49 a.m`, losing the timezone and date. Both results were reproduced using the actual parser in memory. Examine subsequent limit messages and preserve the full supplied reset information.
>
> 3. **Minor — [.claude/skills/work-ticket/pr-review.md:84](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-13/.claude/skills/work-ticket/pr-review.md:84), [SKILL.md:155](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-13/.claude/skills/work-ticket/SKILL.md:155), and [design-reviewer.md:42](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-13/.claude/gpt/briefs/design-reviewer.md:42): Qualify the documented guarantees.** “Any other failure exits 1” excludes the script’s actual 2 and 127 paths; restrict that statement to other Codex failures. The skill and brief promise a reset time unconditionally, although the implementation explicitly supports its absence. Say “when Codex supplies one.” The `one-word` references otherwise correctly distinguish AO failures from `ask.sh` failures.
>
> Missing tests to add in `tests/workflow-scripts.test.mjs`:
>
> 1. **Limit during resume:** Seed `.thread-id=t-old`. Resume emits an `error` containing the limit and reset time, then exits 1; configure fresh to succeed if mistakenly invoked. Expect exit **69**, empty stdout, one limit diagnostic containing the reset and `codex exit 1`, and **exactly one invocation**.
>
> 2. **Reset supplied in a later event:** Fresh emits an `error` with `"You've hit your usage limit."`, then `turn.failed.error.message` with the full reset-bearing message; exits 7. Expect **69**, empty stdout, and one stderr line containing the reset and `codex exit 7`, without “no reset time.”
>
> 3. **Reset containing abbreviated time punctuation:** Fresh emits an error saying `"Usage limit reached. Please try again at 2:49 a.m. CST on November 11, 2026."`; exits 1. Expect **69**, empty stdout, and stderr retaining the complete time, timezone, and date.
>
> 4. **Additional supported error shapes:** Independently test `item.completed` with `{type:"error", message:…}` and an unfamiliar error-like event such as `{type:"request.failed", error:…}`. Use mixed-case `"Usage Limit reached. Try again in 3 hours."`, exit 7. Each must return **69**, empty stdout, and one diagnostic containing `try again in 3 hours` and `codex exit 7`. The current tests never exercise these parser branches.
>
> 5. **Multiple distinct errors and a partial answer:** Fresh writes `"partial answer"` to `-o`, emits two different error messages plus a duplicate and malformed JSONL, and exits 42. Expect **1**, empty stdout, and stderr naming exit 42 and both distinct messages exactly once. This verifies that failure never publishes an answer and that deduplication does not discard different errors.
>
> 6. **Unparseable or empty event stream:** Parameterize fresh failure with malformed/plain-text events and with no events; exit 3. Expect **1**, empty stdout, and the exit-3 fallback diagnostic. For nonempty input, assert the actual last five lines appear on stderr.
>
> 7. **Successful thread paths:** With `t-old`, resume emits usage and an answer, exits 0, and emits no `thread.started`. Expect **0**, answer-only stdout, usage on stderr, one resume invocation, and the existing ID preserved. With no saved ID, expect the corresponding successful fresh invocation and new ID saved.
>
> 8. **Codex absent:** Use an isolated PATH that cannot resolve the real Codex; supply a valid prompt. No stub runs. Expect **127**, empty stdout, and `ask.sh: codex CLI not on PATH` on stderr.
>
> Validation: Bash syntax passed. The requested test command encountered `EPERM` creating temporary directories in all 25 cases, so its assertions could not run. Parser probes and an isolated, mocked execution of the resume control flow confirmed the findings above. No repository files were changed; real Codex was never invoked.
>
> **Changes requested**

**Claude's answers** — all agreed; fixed in the commit that records this round.

1. *Major, a limit on resume starts a fresh call* — **agreed.** That fresh call is a retry at the limit,
   which the header and `CLAUDE.md` § When something external breaks rule out. A failed resume now runs
   `failure_report` on its own events first, and a limit there exits 69 (`fail`) before the stale-thread
   fallback. Any other resume failure still falls back to a fresh call, as before.
2. *Minor, the reset time* — **agreed, both halves.** `failure_report` now prefers a limit message
   that names a reset time over one that doesn't, and the reset runs to the end of the message less one
   final period, so `2:49 a.m. CST on November 11, 2026` stays whole. A trade-off: a sentence that
   followed the time inside the same message would now ride along. Codex's recorded messages all end
   with the time.
3. *Minor, the docs over-promise* — **agreed.** `pr-review.md` now says *any other codex failure* exits
   1, and names exit 2 and 127. `SKILL.md` and the design-reviewer brief say the reset time comes *when
   codex gave one*. I also rejoined a line `pr-review.md` had left broken mid-sentence.

Missing tests — all eight added to `tests/workflow-scripts.test.mjs`:

1. Limit during resume → `a resume that hits the usage limit exits 69 without a fresh call`.
2. Reset in a later event → `a reset time in a later limit message wins over an earlier one without it`.
3. Abbreviated-time punctuation → `a reset time keeps its own periods, timezone and date`.
4. Other error shapes → `the limit is found in an error item, and in an unfamiliar failure event, in any
   case`. It covers `item.completed` with an error item, and `request.failed` with `error` both as a
   string and as `{message}`.
5. Distinct errors and a partial answer → `a failure prints each distinct error once, skips bad lines,
   and never the partial answer` (exit 42).
6. Unparseable or empty events → `a failure with unparseable or no events still says so, with the last
   five lines`. It asserts that lines 3–7 of seven appear and lines 1–2 don't.
7. Successful thread paths → `thread mode answers from a resume and keeps its id, or from a fresh call
   and saves the new one`. `ask()` now returns the saved `.thread-id`.
8. Codex absent → `with no codex on PATH it exits 127 and says so`. It runs on `PATH=/usr/bin:/bin` and
   first asserts that no `codex` resolves there.

On GPT's `EPERM`: its sandbox couldn't create temp directories, so it ran none of the tests. I ran
them: the whole suite passes, 680 tests.

**Mutation audit, round 1** (a script outside the repo mutates `ask.sh`, runs the `ask.sh:` tests and
restores the file). Each mutation is caught: the resume limit check removed (test 1); only the first
limit message read (test 2); a string `error` ignored, or the error-item branch removed (test 4);
`STATUS=0` dropped before the fallback (the existing thread test). Against `c8cece7`'s `ask.sh`, tests
1–3 fail. Its reset regex is the "stops at the first period" mutation. Tests 4–8 pin behaviour
`c8cece7` already had, so they pass on both.

### Round 2 — on `67fb320`: no verdict, the ChatGPT limit ran out

On 2026-11-12 at about 15:35 CST, `ask.sh fresh read-only` on the round-2 prompt (the delta
`c8cece7..67fb320`, with round 1 quoted) exited **69**. Its whole stderr was this PR's own one-line
report:

```
ask.sh: usage limit — try again at 8:25 PM (codex exit 1)
```

No retry (`CLAUDE.md` § When something external breaks). The round consumed no review, so the budget
still stands at one round used of three.

**It is also the first live run of the change, and it settles the open question about codex's event
types.** The real `.last-events.jsonl` held `thread.started`, `turn.started`, then
`{"type":"error","message":"You’ve hit your usage limit. Upgrade to Pro (…), visit … or try again at
8:25 PM."}` and `{"type":"turn.failed","error":{"message":<the same>}}`. Those are the shapes the stub
plays back. Codex writes a curly apostrophe ("You’ve"), which the `usage limit` match doesn't depend on.

### Round 2, second attempt — on `1527db0`: no verdict, the limit ran out again

`music-garden-17` took the PR over from `music-garden-13` at `1527db0` on the owner's answer 1A.
`origin/main` had not moved; the syntax check and the suite passed, 680/680. The GPT lock was held by
`music-garden-18`; `gpt-lock.sh wait` got it at 03:10 UTC on 2026-11-13 (9:10 PM CST, 2026-11-12). One
`ask.sh fresh read-only` call on the same round-2 prompt (the delta `c8cece7..HEAD`, round 1 quoted, the
answers summarised) exited **69** after about a minute. Its last stderr line:

```
ask.sh: usage limit — try again at Nov 13th, 2026 2:02 AM (codex exit 1)
```

(Above it, four `codex_models_manager … failed to refresh available models: timeout` lines that codex
writes to its own stderr; `ask.sh` passes them through.) The lock was released straight after. No
retry. This attempt consumed no review either: **one round used of three**.

**The second live run, and a new shape.** This time the limit hit **mid-turn**: the events hold
`thread.started`, `turn.started`, GPT's opening `agent_message` and four `command_execution` items (it had
begun reading the files), then the same `error` and `turn.failed` pair. The reset now carries a date,
`Nov 13th, 2026 2:02 AM`, and `resetOf` kept it whole. No answer reached stdout, as designed. The window
from the 8:25 PM reset was spent within about 45 minutes, most likely by other sessions' GPT jobs.

## Owner's decisions

1. (2026-11-12, Needs Input): GPT's round-2 PR review hit the limit, which resets at 8:25 PM
   CST, 2026-11-12. **A)** wait for the reset, then run round 2 on `67fb320` · **B)** hand off for
   review without GPT's round 2. The owner reviews the round-1 fixes.
   **Answer: A** — the owner, relayed by the orchestrator in `music-garden-17`'s spawn prompt on
   2026-11-12, after the reset: run round 2 now. The attempt hit the limit again (above).
2. **Open** (2026-11-12, Needs Input): round 2 hit the limit a second time; it resets at 2:02 AM,
   2026-11-13. **A)** run round 2 after the reset, from a fresh worker, on the current head · **B)** hand
   off for review without GPT's round 2; the owner reviews the round-1 fixes (`c8cece7..67fb320`).
