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
