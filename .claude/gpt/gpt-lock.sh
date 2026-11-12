#!/usr/bin/env bash
# One GPT job at a time across every session on this machine (CLAUDE.md § Cost).
#
#   gpt-lock.sh acquire     take the lock now        exit 0 = yours; 75 = busy (holder printed); 1 = error
#   gpt-lock.sh wait        acquire, re-trying each minute for up to 90 minutes (run it in the background)
#   gpt-lock.sh release     give it back             exit 0 = released; 1 = not yours, or an error
#   gpt-lock.sh status      who holds it, and any key in use
#   gpt-lock.sh break <id>  remove the lock if <id> still holds it, AO no longer lists <id>, and every
#                           review run of <id>'s has ended
#                           exit 0 = broken; 75 = not broken (see below); 1 = error. `acquire` does this
#                           by itself; by hand it is only for recovery.
#
# The lock is a directory: mkdir is atomic, so of two sessions acquiring at once exactly one wins —
# unlike a session name, which two sessions can both set. While held, the session's AO name carries a
# [GPT] prefix, so the owner sees who is using GPT. A lock is stale, and the next acquire breaks it,
# when AO no longer lists its holder (terminated) AND `ao review ls <holder>` shows every one of the
# holder's review runs ended — a run can outlive the session that asked for it. If `ao` can't answer
# either question, or answers in a shape or status this script doesn't know, the holder counts as live.
#
# Every change to a held lock goes through its holder's key, "<lock>.break.<holder>" (mkdir again): a
# break of the holder, and the holder's own "already yours" and release. A breaker takes the key, checks
# that the holder is dead, re-reads who holds the lock, and removes it only if that is still the holder.
# While the key is held nothing can change the lock: the holder's own operations wait for the key (so a
# holder restored mid-break gets "busy", never "already yours" on a lock about to be removed), other
# breakers are shut out by it, and acquirers fail on the existing directory. So a session acting on an
# old view of the lock can never remove a lock someone else has taken since.
# Residual: a session that dies holding a key leaves it behind, and that holder's lock can then be
# neither broken nor released — `status` shows the key; remove it by hand once you have checked that
# nothing is using it.
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

# no_run_left <id>: exit 0 only if `ao review ls <id>` shows that every review run of <id>'s has ended:
# `reviews` is an array, and each review has no run (no `latestRun`, or null), or a run that is not
# queued, pending or running (the poller's in-progress states, pr-review.md) and is `failed` or
# `cancelled` or carries a verdict (`approved`, `changes_requested`) — the end states AO documents.
# Exit 1 on anything else: a run going, a missing or unknown status, a shape it doesn't know, or ao failing.
no_run_left() {
  local out; out=$(ao review ls "$1" --json 2>/dev/null) || return 1
  printf '%s' "$out" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
    try{const j=JSON.parse(d);if(!j||!Array.isArray(j.reviews))process.exit(1);
    const ended=r=>{if(!r||typeof r!=="object")return false;const run=r.latestRun;
      if(run===undefined||run===null)return true;
      if(typeof run!=="object"||typeof run.status!=="string")return false;
      if(/^(running|queued|pending)/.test(run.status))return false;
      return /^(failed|cancelled)$/.test(run.status)||/^(approved|changes_requested)$/.test(run.verdict||"")};
    process.exit(j.reviews.every(ended)?0:1)}catch(e){process.exit(1)}})'
}

# take_key <key>: 0 = taken; 75 = someone else holds it; 1 = it could not be created (an error).
take_key() {
  local err; err=$(mkdir "$1" 2>&1) && return 0
  [ -d "$1" ] && return 75
  echo "error: could not create the key $1: $err" >&2; return 1
}
drop_key() { rmdir "$1" 2>/dev/null || { echo "error: could not remove the key $1; remove it by hand" >&2; return 1; }; }

# own_key: this session's own key, for "already yours" and release. A break holds it only for two AO
# reads, so a few tries a second apart; 75 if it is still held after them.
own_key() {
  local i rc
  for i in 1 2 3 4 5; do take_key "$lock.break.$me"; rc=$?; [ $rc -ne 75 ] && return $rc; sleep 1; done
  return 75
}

# break_stale <id>: 0 = broken; 75 = not broken (another session holds the lock now, <id> is still
# listed or has a review run not shown ended, ao failed, or <id>'s key is in use); 1 = an error: the
# lock, or the key, could not be created or removed.
break_stale() {
  local h="$1" key="$lock.break.$1" rc
  take_key "$key"; rc=$?; [ $rc -eq 0 ] || return $rc
  rc=75
  field "$h" status >/dev/null
  if [ $? -eq 1 ] && no_run_left "$h" && [ "$(holder)" = "$h" ]; then
    if rm -rf "$lock" 2>/dev/null && [ ! -e "$lock" ]; then
      echo "broke a stale lock held by $h" >&2; rc=0
    else echo "error: could not remove the stale lock $lock" >&2; rc=1; fi
  fi
  drop_key "$key" || rc=1
  return $rc
}

try_acquire() {
  local err rc
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
  if [ "$h" = "$me" ]; then
    own_key; rc=$?
    [ $rc -eq 1 ] && return 1
    [ $rc -eq 75 ] && { echo "busy: a break of your lock is running ($lock.break.$me)"; return 75; }
    h=$(holder); drop_key "$lock.break.$me" || return 1
    [ "$h" = "$me" ] && { echo "acquired (already yours)"; return 0; }
    try_acquire; return $?                       # broken while this session looked: take it afresh
  fi
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
    own_key; rc=$?
    [ $rc -eq 75 ] && { echo "error: a break of your lock is running ($lock.break.$me); release again shortly" >&2; exit 1; }
    [ $rc -eq 1 ] && exit 1
    h=$(holder)
    if [ "$h" != "$me" ]; then drop_key "$lock.break.$me"; echo "not yours: held by ${h:-nobody}"; exit 1; fi
    name=$(cat "$lock/name" 2>/dev/null)
    ao session rename "$me" "${name:-$me}" >/dev/null 2>&1
    if rm -rf "$lock" 2>/dev/null && [ ! -e "$lock" ]; then drop_key "$lock.break.$me" || exit 1; echo "released"
    else drop_key "$lock.break.$me"; echo "error: could not remove $lock; it is still held" >&2; exit 1; fi ;;
  status)
    if [ -d "$lock" ]; then echo "held by $(cat "$lock/owner" 2>/dev/null)"; else echo "free"; fi
    for k in "$lock".break.*; do [ -d "$k" ] && echo "break in progress: ${k##*.break.}"; done; : ;;
  break)
    [ -n "${2:-}" ] || { echo "usage: gpt-lock.sh break <session-id>" >&2; exit 1; }
    break_stale "$2"; rc=$?
    h=$(holder)
    [ $rc -eq 75 ] && echo "not broken: held by ${h:-nobody}; $2 no longer holds it, AO still lists $2 or a review run of its is not shown ended (or ao failed), or $2's key is in use"
    exit $rc ;;
  *) echo "usage: gpt-lock.sh acquire|wait|release|status|break <id>" >&2; exit 1 ;;
esac
