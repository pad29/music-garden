#!/usr/bin/env bash
# One GPT job at a time across every session on this machine (CLAUDE.md § Cost).
#
#   gpt-lock.sh acquire   take the lock now          exit 0 = yours; 75 = busy (holder printed); 1 = error
#   gpt-lock.sh wait      acquire, re-trying each minute for up to 90 minutes (run it in the background)
#   gpt-lock.sh release   give it back               exit 0 = released; 1 = not yours
#   gpt-lock.sh status    who holds it
#
# The lock is a directory: mkdir is atomic, so of two sessions acquiring at once exactly one wins —
# unlike a session name, which two sessions can both set. While held, the session's AO name carries a
# [GPT] prefix, so the owner sees who is using GPT. A lock whose holder AO no longer lists (terminated)
# is stale and is broken by the next acquire; if `ao` can't answer, the holder counts as live.
set -u
lock="${GPT_LOCK_DIR:-$HOME/.music-garden-gpt-lock}"
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

try_acquire() {
  if mkdir "$lock" 2>/dev/null; then
    printf '%s %s\n' "$me" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$lock/owner"
    local name; name=$(field "$me" displayName) || name=""
    case "$name" in "[GPT]"*) name=${name#"[GPT] "} ;; esac
    printf '%s' "$name" > "$lock/name"
    ao session rename "$me" "[GPT] ${name:-$me}" >/dev/null 2>&1
    echo "acquired"; return 0
  fi
  local h; h=$(holder)
  if [ "$h" = "$me" ]; then echo "acquired (already yours)"; return 0; fi
  if [ -n "$h" ]; then
    field "$h" status >/dev/null; local rc=$?
    if [ $rc -eq 1 ]; then                        # AO no longer lists the holder: stale
      local tmp="$lock.stale.$$"
      if mv "$lock" "$tmp" 2>/dev/null; then
        if [ "$(cut -d' ' -f1 "$tmp/owner" 2>/dev/null)" = "$h" ]; then
          rm -rf "$tmp"; echo "broke a stale lock held by $h" >&2; try_acquire; return $?
        fi
        [ -e "$lock" ] || mv "$tmp" "$lock" 2>/dev/null   # we moved a fresh lock: put it back
      fi
    fi
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
    rm -rf "$lock"; echo "released" ;;
  status)
    if [ -d "$lock" ]; then echo "held by $(cat "$lock/owner" 2>/dev/null)"; else echo "free"; fi ;;
  *) echo "usage: gpt-lock.sh acquire|wait|release|status" >&2; exit 1 ;;
esac
