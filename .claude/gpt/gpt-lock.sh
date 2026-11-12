#!/usr/bin/env bash
# One GPT job at a time across every session on this machine (CLAUDE.md § Cost).
#
#   gpt-lock.sh acquire     take the lock now        exit 0 = yours; 75 = busy (holder printed); 1 = error
#   gpt-lock.sh wait        acquire, re-trying each minute for up to 90 minutes (run it in the background)
#   gpt-lock.sh release     give it back             exit 0 = released; 1 = not yours, or an error
#   gpt-lock.sh status      who holds it, and any break in progress
#   gpt-lock.sh break <id>  remove the lock if <id> still holds it, AO no longer lists <id>, and no
#                           review run of <id>'s is still going
#                           exit 0 = broken; 75 = not broken (see below); 1 = error. `acquire` does this
#                           by itself; by hand it is only for recovery.
#
# The lock is a directory: mkdir is atomic, so of two sessions acquiring at once exactly one wins —
# unlike a session name, which two sessions can both set. While held, the session's AO name carries a
# [GPT] prefix, so the owner sees who is using GPT. A lock is stale, and the next acquire breaks it,
# when AO no longer lists its holder (terminated) AND `ao review ls <holder>` shows none of the holder's
# review runs still queued or running — a run can outlive the session that asked for it. If `ao` can't
# answer either question, the holder counts as live.
#
# Breaking is serialised per holder: a breaker first takes "<lock>.break.<holder>" (mkdir again), then
# establishes that the holder is dead, and only then re-reads who holds the lock. In that order nothing
# can change the lock between the re-read and the removal: the holder is dead, so it can't release;
# other breakers of it are shut out by the key; acquirers fail on the existing directory. A session acting
# on an old view of the lock can never remove a lock someone else has taken since — even one the holder
# released, and someone else took, while the breaker was asking AO.
# Residuals: a breaker that dies holding the key leaves it behind, and that holder's lock then stays
# unbreakable — `status` shows the key; remove it by hand once you have checked no break is running.
# And a holder restored (`ao session restore`) between the re-read and the removal could release in that
# gap — milliseconds, against a restore that takes far longer.
set -u
lock="${GPT_LOCK_DIR:-$HOME/.music-garden-gpt-lock}"
command -v cygpath >/dev/null 2>&1 && lock=$(cygpath -u "$lock")   # Git Bash: C:\x → /c/x, so globs work
me="${AO_SESSION_ID:-}"
[ -n "$me" ] || { echo "error: AO_SESSION_ID is not set" >&2; exit 1; }

sessions() { ao session ls --project music-garden --all --json 2>/dev/null; }

# field <id> <displayName|status>: prints the field, or exits 1 if the session isn't listed; 2 if ao failed
field() {
  local out; out=$(sessions) || return 2
  printf '%s' "$out" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
    let s;try{s=(JSON.parse(d).data||[]).find(x=>x.id===process.argv[1])}catch(e){process.exit(2)}
    if(!s)process.exit(1);console.log(s[process.argv[2]]||"")})' "$1" "$2"
}

holder() { cut -d' ' -f1 "$lock/owner" 2>/dev/null; }

# no_run_left <id>: exit 0 only if `ao review ls <id>` shows none of <id>'s review runs queued, pending
# or running (the poller's in-progress states, pr-review.md); exit 1 if one is, or if ao can't say.
no_run_left() {
  local out; out=$(ao review ls "$1" --json 2>/dev/null) || return 1
  printf '%s' "$out" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
    try{const busy=(JSON.parse(d).reviews||[]).some(r=>r.latestRun&&/^(running|queued|pending)/.test(r.latestRun.status));
    process.exit(busy?1:0)}catch(e){process.exit(1)}})'
}

# break_stale <id>: 0 = broken; 75 = not broken (another session holds the lock now, <id> is still
# listed or has a review run going, ao failed, or another break of <id> is running); 1 = an error: the
# lock, or the break key, could not be created or removed.
break_stale() {
  local h="$1" key="$lock.break.$1" rc=75 err
  if ! err=$(mkdir "$key" 2>&1); then
    [ -d "$key" ] && return 75                   # another break of <id> is running
    echo "error: could not create the break key $key: $err" >&2; return 1
  fi
  # Dead first, holder second (see the header): once AO no longer lists <id>, <id> can't release, so the
  # holder read here still holds when the lock is removed.
  field "$h" status >/dev/null
  if [ $? -eq 1 ] && no_run_left "$h" && [ "$(holder)" = "$h" ]; then
    if rm -rf "$lock" 2>/dev/null && [ ! -e "$lock" ]; then
      echo "broke a stale lock held by $h" >&2; rc=0
    else echo "error: could not remove the stale lock $lock" >&2; rc=1; fi
  fi
  rmdir "$key" 2>/dev/null || { echo "error: could not remove the break key $key; remove it by hand" >&2; rc=1; }
  return $rc
}

try_acquire() {
  local err
  if err=$(mkdir "$lock" 2>&1) || { [ ! -e "$lock" ] && err=$(mkdir "$lock" 2>&1); }; then
    if ! printf '%s %s\n' "$me" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$lock/owner" 2>/dev/null \
       || [ "$(holder)" != "$me" ]; then
      rm -rf "$lock"; echo "error: could not write $lock/owner" >&2; return 1
    fi
    local name; name=$(field "$me" displayName) || name=""
    case "$name" in "[GPT]"*) name=${name#"[GPT] "} ;; esac
    printf '%s' "$name" > "$lock/name"
    ao session rename "$me" "[GPT] ${name:-$me}" >/dev/null 2>&1
    echo "acquired"; return 0
  fi
  # mkdir failed twice and there is still no lock: not contention, a filesystem error
  [ -e "$lock" ] || { echo "error: could not create $lock: $err" >&2; return 1; }
  local h; h=$(holder)
  if [ "$h" = "$me" ]; then echo "acquired (already yours)"; return 0; fi
  if [ -n "$h" ]; then
    break_stale "$h"
    case $? in 0) try_acquire; return $? ;; 1) return 1 ;; esac
  fi
  echo "busy: held by $(cat "$lock/owner" 2>/dev/null || echo "a session still writing its claim")"
  return 75
}

case "${1:-}" in
  acquire) try_acquire ;;
  wait)
    tries="${GPT_LOCK_TRIES:-90}"
    for _ in $(seq "$tries"); do
      out=$(try_acquire); rc=$?
      [ $rc -ne 75 ] && { echo "$out"; exit $rc; }
      sleep "${GPT_LOCK_SLEEP:-60}"
    done
    echo "$out (gave up after $tries tries)"; exit 75 ;;
  release)
    h=$(holder)
    [ "$h" = "$me" ] || { echo "not yours: held by ${h:-nobody}"; exit 1; }
    name=$(cat "$lock/name" 2>/dev/null)
    ao session rename "$me" "${name:-$me}" >/dev/null 2>&1
    if rm -rf "$lock" 2>/dev/null && [ ! -e "$lock" ]; then echo "released"
    else echo "error: could not remove $lock; it is still held" >&2; exit 1; fi ;;
  status)
    if [ -d "$lock" ]; then echo "held by $(cat "$lock/owner" 2>/dev/null)"; else echo "free"; fi
    for k in "$lock".break.*; do [ -d "$k" ] && echo "break in progress: ${k##*.break.}"; done; : ;;
  break)
    [ -n "${2:-}" ] || { echo "usage: gpt-lock.sh break <session-id>" >&2; exit 1; }
    break_stale "$2"; rc=$?
    h=$(holder)
    [ $rc -eq 75 ] && echo "not broken: held by ${h:-nobody}; $2 no longer holds it, AO still lists $2 or a review run of its may still be going (or ao failed), or another break of it is running"
    exit $rc ;;
  *) echo "usage: gpt-lock.sh acquire|wait|release|status|break <id>" >&2; exit 1 ;;
esac
