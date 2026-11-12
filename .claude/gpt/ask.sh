#!/usr/bin/env bash
# Ask GPT (OpenAI Codex CLI) a question and print its reply on stdout.
#
#   ask.sh <fresh|thread> <read-only|workspace-write> <model> <prompt-file>
#
#   fresh   start a new GPT thread
#   thread  continue this worktree's thread (falls back to fresh if there isn't one, or if the
#           resume fails — it says so on stderr)
#
# This script owns thread continuity, sandbox policy, and credentials so the briefs that call
# it (.claude/gpt/briefs/) don't have to. GPT's reply goes to stdout; diagnostics (token usage,
# thread id, errors) go to stderr, so `$(ask.sh ...)` captures only the answer.
#
# Exit status:
#   0    GPT answered; the answer is on stdout
#   1    codex failed (its exit status and error messages, or its last events, on stderr), or it
#        exited 0 with no answer ("GPT returned no message")
#   2    bad arguments, or a missing or empty prompt file
#   69   the ChatGPT usage limit: one stderr line, with the reset time when codex gave one. Never
#        retried, waited out or sent to another model — CLAUDE.md § When something external breaks
#   127  no codex CLI on PATH
# (gpt-lock.sh's busy is 75; 69 is its sysexits neighbour, EX_UNAVAILABLE.)
#
# Thread state lives beside this script, inside the worktree, so every AO session gets its own
# GPT thread automatically. Delete .thread-id before a session starts a second task.
set -euo pipefail

usage() { echo "usage: ask.sh <fresh|thread> <read-only|workspace-write> <model> <prompt-file>" >&2; exit 2; }
[ $# -eq 4 ] || usage

MODE="$1"; SANDBOX="$2"; MODEL="$3"; PROMPT_FILE="$4"

case "$MODE" in fresh|thread) ;; *) echo "ask.sh: bad mode '$MODE'" >&2; usage ;; esac
case "$SANDBOX" in read-only|workspace-write) ;; *) echo "ask.sh: bad sandbox '$SANDBOX'" >&2; usage ;; esac
[ -f "$PROMPT_FILE" ] || { echo "ask.sh: prompt file not found: $PROMPT_FILE" >&2; exit 2; }
[ -s "$PROMPT_FILE" ] || { echo "ask.sh: prompt file is empty: $PROMPT_FILE" >&2; exit 2; }

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ID_FILE="$DIR/.thread-id"
EVENTS="$DIR/.last-events.jsonl"
OUT="$DIR/.last-message.txt"
AWS_ENV="${HOME}/.codex/tunegarden-aws.env"

command -v codex >/dev/null || { echo "ask.sh: codex CLI not on PATH" >&2; exit 127; }

# `codex exec` takes --profile/--sandbox. `codex exec resume` takes NEITHER — it accepts only
# -c/-m/--json/-o. So the profile's settings are mirrored as -c overrides for the resume path.
# Keep these in sync with ~/.codex/claudecollab.config.toml if you change it.
PROFILE_C=( -c model_reasoning_effort=high -c memories.use_memories=false -c memories.generate_memories=false )

COMMON=( --json -m "$MODEL" -o "$OUT" )
FRESH_ARGS=( --profile claudecollab --sandbox "$SANDBOX" "${COMMON[@]}" )
RESUME_ARGS=( "${PROFILE_C[@]}" -c "sandbox_mode=$SANDBOX" "${COMMON[@]}" )

# Network and AWS credentials go ONLY to workspace-write calls (the tester). The design
# reviewer and the author are read-only and stay offline — they have no reason to reach the
# internet, and an adversarial reviewer that cannot fetch is one less thing to reason about.
if [ "$SANDBOX" = "workspace-write" ]; then
  FRESH_ARGS+=( -c sandbox_workspace_write.network_access=true )
  RESUME_ARGS+=( -c sandbox_workspace_write.network_access=true )
  if [ -f "$AWS_ENV" ]; then
    set -a; . "$AWS_ENV"; set +a
    echo "ask.sh: AWS credentials loaded (Polly-only IAM user)" >&2
  else
    echo "ask.sh: no $AWS_ENV — GPT will run without AWS access" >&2
  fi
fi

run_codex() {
  if [ "$1" = "resume" ]; then
    codex exec resume "$(cat "$ID_FILE")" "${RESUME_ARGS[@]}" - < "$PROMPT_FILE" > "$EVENTS"
  else
    codex exec "${FRESH_ARGS[@]}" - < "$PROMPT_FILE" > "$EVENTS"
  fi
}

# Parse the JSONL on STDIN, never as a path argument: Git Bash rewrites POSIX paths when
# handing them to native Windows node (/tmp/x.jsonl becomes C:\tmp\x.jsonl), which silently
# yields an empty thread id and turns every "resume" into an unnoticed fresh session.
jsonl_field() {  # $1 = event type, $2 = field
  node -e '
    let d = "";
    process.stdin.on("data", c => d += c).on("end", () => {
      for (const line of d.split("\n")) {
        if (!line.trim()) continue;
        try { const o = JSON.parse(line); if (o.type === process.argv[1] && o[process.argv[2]]) { console.log(o[process.argv[2]]); break; } } catch {}
      }
    });
  ' "$1" "$2" 2>/dev/null || true
}

# Why codex failed, from its events on STDIN. With --json codex reports an error as an event on
# stdout, not on stderr, and its event types for errors aren't documented: so any event whose type
# names an error or a failure (`error`, `turn.failed`) counts, and an item that is an error. When a
# message names the usage limit, prints "LIMIT " and the one line to report, with the reset time
# when codex gave one; otherwise each distinct message on its own line, as "ask.sh:   <message>"
# (codex repeats one in `error` and `turn.failed`).
failure_report() {  # $1 = codex's exit status
  node -e '
    let d = "";
    process.stdin.on("data", c => d += c).on("end", () => {
      const msgs = [];
      const add = m => { if (typeof m !== "string") return; m = m.replace(/\s+/g, " ").trim(); if (m && !msgs.includes(m)) msgs.push(m); };
      for (const line of d.split("\n")) {
        let o; try { o = JSON.parse(line); } catch { continue; }
        if (!o || typeof o !== "object") continue;
        if (/error|fail/i.test(String(o.type))) { add(o.message); add(o.error); add(o.error && o.error.message); }
        if (o.item && o.item.type === "error") add(o.item.message);
      }
      const limit = msgs.find(m => /usage limit/i.test(m));
      if (limit) {
        const reset = (limit.match(/try again ((?:at|in) .*?)(?:\.(?:\s|$)|$)/i) || [])[1];
        const exit = `(codex exit ${process.argv[1]})`;
        console.log("LIMIT usage limit — " + (reset ? `try again ${reset} ${exit}` : `codex gave no reset time ${exit}: ${limit}`));
      } else msgs.forEach(m => console.log("ask.sh:   " + m));
    });
  ' "$1" 2>/dev/null || true
}

# Report a failed call on stderr and exit: 69 at the usage limit, otherwise 1.
fail() {  # $1 = codex's exit status (0: it exited cleanly but left no answer). Never returns.
  local status="$1" report
  report="$(failure_report "$status" < "$EVENTS")"
  case "$report" in
    "LIMIT "*) echo "ask.sh: ${report#LIMIT }" >&2; exit 69 ;;
  esac
  if [ "$status" -eq 0 ]; then
    echo "ask.sh: GPT returned no message. Last events:" >&2
    tail -5 "$EVENTS" >&2 || true
  elif [ -n "$report" ]; then
    echo "ask.sh: codex failed (exit $status):" >&2
    printf '%s\n' "$report" >&2
  else
    echo "ask.sh: codex failed (exit $status) with no error event. Last events:" >&2
    tail -5 "$EVENTS" >&2 || true
  fi
  exit 1
}

# Catch codex's exit status: under `set -e` a bare failing call would end the script silently,
# before anything below could say why.
: > "$OUT"
STATUS=0
if [ "$MODE" = "thread" ] && [ -s "$ID_FILE" ]; then
  run_codex resume || {
    echo "ask.sh: resume failed (stale thread id?) — starting a fresh thread" >&2
    run_codex fresh || STATUS=$?
  }
else
  run_codex fresh || STATUS=$?
fi
[ "$STATUS" -eq 0 ] || fail "$STATUS"

# Only a fresh run emits thread.started; a resume keeps the existing id, so don't clobber it.
NEW_ID="$(jsonl_field thread.started thread_id < "$EVENTS")"
[ -n "$NEW_ID" ] && printf '%s' "$NEW_ID" > "$ID_FILE"

# Token usage to stderr. Resuming replays the whole transcript, so this is the early warning
# that a thread has grown long enough to be worth retiring.
node -e '
  let d = "";
  process.stdin.on("data", c => d += c).on("end", () => {
    for (const line of d.split("\n")) {
      if (!line.trim()) continue;
      try {
        const o = JSON.parse(line);
        if (o.type === "turn.completed" && o.usage) {
          const u = o.usage;
          console.error(`ask.sh: usage in=${u.input_tokens} (cached ${u.cached_input_tokens}) out=${u.output_tokens}`);
        }
      } catch {}
    }
  });
' < "$EVENTS" || true

[ -s "$OUT" ] || fail 0

cat "$OUT"
echo
