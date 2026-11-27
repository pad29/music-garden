#!/usr/bin/env bash
# One GPT job at a time across every session on this machine (CLAUDE.md § Cost).
#
#   gpt-lock.sh acquire   take the lock now      exit 0 = yours; 75 = busy (holder printed); 1 = error
#   gpt-lock.sh wait      acquire, re-trying each minute for up to 90 minutes (run it in the background)
#   gpt-lock.sh release   give it back           exit 0 = released; 1 = not yours, or an error
#   gpt-lock.sh status    who holds it, and how to clear it by hand
#
# The lock is a directory holding its holder's claim, `owner`. The claim decides who holds it, not mkdir:
# bash's noclobber creates `owner` with O_EXCL, so of any number of sessions acquiring at once exactly
# one wins — unlike a session name, which two sessions can both set. mkdir alone can't be trusted with
# that: uutils' mkdir up to 0.10.0 (Ubuntu 26.04's default) exits 0 when the directory already exists
# under a race, so two sessions could both "make" the lock (TUN-123). While held, the session's AO name
# carries a [GPT] prefix, so the owner sees who is using GPT.
#
# A lock is never broken automatically (owner, 2026-11-11, PR #88 decision 9): every automatic break GPT
# reviewed could, in some interleaving, remove a live holder's lock. A lock whose holder has died stays
# until someone clears it by hand — `status`, and a busy `acquire` or `wait`, print the command. Clear
# it only once the holder is gone from `ao session ls` and `ao review ls <holder>` shows none of its
# review runs still going: a run can outlive the session that asked for it.
set -u
lock="${GPT_LOCK_DIR:-$HOME/.music-garden-gpt-lock}"
command -v cygpath >/dev/null 2>&1 && lock=$(cygpath -u "$lock")   # Git Bash: C:\x → /c/x
me="${AO_SESSION_ID:-}"
[ -n "$me" ] || { echo "error: AO_SESSION_ID is not set" >&2; exit 1; }

# read_claim: the claim and who it names, from one read, so a message never names two sessions. A claim
# counts only once complete — "<session> <time>" and its newline, which `read` needs to succeed — so a
# write cut short ("music-garden-1" of music-garden-10) names nobody. Missing, empty or incomplete: a
# claim still being written.
read_claim() {
  local line=
  if IFS= read -r line 2>/dev/null < "$lock/owner" && [ "${line#* }" != "$line" ]; then
    claim_text=$line; claimant=${line%% *}
  else claim_text="a session still writing its claim"; claimant=; fi
}

# How to clear a stuck lock by hand, for status and busy messages.
how_to_clear() {
  local h="${1:-<holder>}"
  echo "  stuck? once $h is gone from \`ao session ls\` and \`ao review ls $h\` shows no run still going, clear it:"
  echo "  rm -rf \"$lock\""
}

# displayName <id>: the session's AO name, or nothing if ao can't say.
display_name() {
  ao session ls --project music-garden --all --json 2>/dev/null | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
    try{const s=(JSON.parse(d).data||[]).find(x=>x.id===process.argv[1]);console.log(s&&s.displayName||"")}catch(e){}})' "$1"
}

# claim: write my claim, only if there is none. noclobber (set -C) makes bash open the file with
# O_CREAT|O_EXCL, so of any number of sessions claiming at once exactly one creates it.
#   0  mine
#   1  not created: another session's claim is there, or the file could not be made — nothing here is
#      mine, so nothing is removed
#   2  created but not written (a full disk): the file is mine, so it is removed again — the file only,
#      as the directory may be another session's whose mkdir exited 0 too
claim() {
  local made=
  set -C
  { made=1; printf '%s %s\n' "$me" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >&3; } 2>/dev/null 3>"$lock/owner"
  local s=$?
  set +C
  [ $s -eq 0 ] && return 0
  [ -n "$made" ] || return 1
  rm -f "$lock/owner"; return 2
}

# try_acquire [again]
try_acquire() {
  local err
  if err=$(mkdir "$lock" 2>&1) || { [ ! -e "$lock" ] && err=$(mkdir "$lock" 2>&1); }; then
    claim; case $? in
      0) local name; name=$(display_name "$me")
         case "$name" in "[GPT]"*) name=${name#"[GPT] "} ;; esac
         printf '%s' "$name" > "$lock/name"
         ao session rename "$me" "[GPT] ${name:-$me}" >/dev/null 2>&1
         echo "acquired"; return 0 ;;
      2) echo "error: could not write $lock/owner" >&2; return 1 ;;
    esac
    # Not created. With a claim there, another session's mkdir exited 0 too: contention, below. With
    # none, either the claim it lost to was released already — so try once more — or the file could not
    # be made, and the directory, which may be another session's about to claim, is left alone.
    if [ ! -e "$lock/owner" ]; then
      [ -z "${1:-}" ] && { try_acquire again; return; }
      echo "error: could not write $lock/owner" >&2; return 1
    fi
  else
    # mkdir failed twice and there is still no lock: not contention, a filesystem error
    [ -e "$lock" ] || { echo "error: could not create $lock: $err" >&2; return 1; }
  fi
  local claim_text claimant; read_claim
  if [ "$claimant" = "$me" ]; then echo "acquired (already yours)"; return 0; fi
  echo "busy: held by $claim_text"
  how_to_clear "$claimant"
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
    echo "$out"; echo "gave up after $tries tries"; exit 75 ;;
  release)
    read_claim
    [ "$claimant" = "$me" ] || { echo "not yours: held by ${claimant:-nobody}"; exit 1; }
    name=$(cat "$lock/name" 2>/dev/null)
    ao session rename "$me" "${name:-$me}" >/dev/null 2>&1
    # Once rm -rf has succeeded the lock is gone: whatever is there afterwards is the next holder's.
    if rm -rf "$lock" 2>/dev/null; then echo "released"; exit 0; fi
    # It failed (Windows won't remove a directory a process is in), perhaps after taking the owner file:
    # put my claim back, only where no claim is — never over a session that has taken the lock since.
    [ -d "$lock" ] && claim
    read_claim
    if [ "$claimant" = "$me" ]; then echo "error: could not remove $lock; it is still held by $me" >&2; exit 1; fi
    # Another session's claim is there, complete or still being written: this session holds nothing.
    if [ -e "$lock/owner" ]; then echo "released"; exit 0; fi
    echo "error: could not remove $lock, nor put the claim back" >&2; exit 1 ;;
  status)
    if [ -d "$lock" ]; then
      read_claim
      echo "held by $claim_text"
      how_to_clear "$claimant"
    else echo "free"; fi ;;
  *) echo "usage: gpt-lock.sh acquire|wait|release|status" >&2; exit 1 ;;
esac
