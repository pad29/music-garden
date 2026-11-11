#!/usr/bin/env bash
# One GPT job at a time across every session on this machine (CLAUDE.md § Cost).
#
#   gpt-lock.sh acquire     take the lock now        exit 0 = yours; 75 = busy (holder printed); 1 = error
#   gpt-lock.sh wait        acquire, re-trying each minute for up to 90 minutes (run it in the background)
#   gpt-lock.sh release     give it back             exit 0 = released; 1 = not yours, or an error
#   gpt-lock.sh status      who holds it, and any break in progress
#   gpt-lock.sh break <id>  remove the lock if <id> still holds it and AO no longer lists <id>
#                           exit 0 = broken; 75 = not broken (see below); 1 = error. `acquire` does this
#                           by itself; by hand it is only for recovery.
#
# The lock is a directory: mkdir is atomic, so of two sessions acquiring at once exactly one wins —
# unlike a session name, which two sessions can both set. While held, the session's AO name carries a
# [GPT] prefix, so the owner sees who is using GPT. A lock whose holder AO no longer lists (terminated)
# is stale and is broken by the next acquire; if `ao` can't answer, the holder counts as live.
#
# Breaking is serialised per holder: a breaker first takes "<lock>.break.<holder>" (mkdir again), and
# only then re-reads who holds the lock. Nothing else can change the lock while that key is held — its
# holder is dead, other breakers of it are shut out, and acquirers fail on the existing directory — so a
# session acting on an old view of the lock can never remove a lock someone else has taken since.
# Residual: a breaker that dies holding the key leaves it behind, and that holder's lock then stays
# unbreakable — `status` shows the key; remove it by hand once you have checked no break is running.
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

# break_stale <id>: 0 = broken; 75 = not broken (another session holds the lock now, <id> is still
# listed, ao failed, or another break of <id> is running); 1 = the lock could not be removed.
break_stale() {
  local h="$1" key="$lock.break.$1" rc=75
  mkdir "$key" 2>/dev/null || return 75
  if [ "$(holder)" = "$h" ]; then
    field "$h" status >/dev/null
    if [ $? -eq 1 ]; then
      if rm -rf "$lock" 2>/dev/null && [ ! -e "$lock" ]; then
        echo "broke a stale lock held by $h" >&2; rc=0
      else echo "error: could not remove the stale lock $lock" >&2; rc=1; fi
    fi
  fi
  rmdir "$key" 2>/dev/null
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
    [ $rc -eq 75 ] && echo "not broken: held by ${h:-nobody}; $2 no longer holds it, AO still lists $2 (or ao failed), or another break of it is running"
    exit $rc ;;
  *) echo "usage: gpt-lock.sh acquire|wait|release|status|break <id>" >&2; exit 1 ;;
esac
