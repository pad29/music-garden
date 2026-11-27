# TUN-123 — Stop two sessions from both taking the GPT lock at the same instant

Branch `ao/gpt-lock-race/root` · Size S

## Cause (as found, 2026-11-27)

`try_acquire` let whoever's `mkdir "$lock"` exited 0 write its claim, trusting `mkdir` to be atomic —
of two sessions, exactly one exit 0. On GitHub's `ubuntu-latest` it is not:

1. Every failing run (44834473078 on 2026-11-20, 44994059550, 45719118471, 45940498646 on 2026-11-27)
   ran on the runner image **`ubuntu-26.04`** (release `ubuntu26/20261116.202`).
2. Ubuntu 26.04's default `coreutils` is uutils' Rust rewrite: package `rust-coreutils`
   `0.10.0-1ubuntu2~26.04.1` (and `0.8.0-0ubuntu3`), per Launchpad.
3. uutils `mkdir` 0.10.0 (`src/uu/mkdir/src/mkdir.rs`) checks `path.exists()` first and fails *File
   exists* if so; otherwise it calls `mkdir(2)`, and on **any** error, `Err(_) if path.is_dir() =>
   Ok(())`. Two processes both pass the `exists()` check; one's `mkdir(2)` creates the directory, the
   other's gets `EEXIST`, sees a directory, and **exits 0 too**.
4. Upstream: uutils issue #13970, *"mkdir: exits 0 despite EEXIST from the kernel under concurrent
   invocation (breaks mkdir-as-mutex)"*, reported on Ubuntu 26.04's 0.8.0; fixed by commit `bf423f388`
   (2026-08-28, *"mkdir: do not ignore EEXIST on non-recursive creation"*), first released in 0.11.0.
   GitHub's compare shows the fix is not in 0.10.0 or 0.8.0.

Then the logs follow. Both "winners" write `$lock/owner` (`>` truncates), so the claims overwrite each
other: in run 44994059550 each read back its own name and both printed `acquired` (a loser's
`holder()` read 11, its `cat` then read 10). In runs 44834473078 and 45719118471 a winner read back
someone else's name, took the failure path, and `rm -rf "$lock"` removed the lock the other winner held
— which then failed to write `$lock/name` (*"line 48: …/lock/name: No such file or directory"*) and
still printed `acquired`, with no lock behind it.

Not the cause: Git Bash on Windows, whose `mkdir` is GNU coreutils (MSYS2) and atomic; the `[ ! -e ]`
retry, which still calls `mkdir`; the test, whose sandboxes are separate directories per round.

## Plan (Claude)

- **Don't trust any external `mkdir` to pick the winner.** The claim decides: write `$lock/owner` with
  bash's own `noclobber` (`set -C`), which opens with `O_CREAT|O_EXCL` — atomic in the kernel on Linux,
  and through Cygwin/MSYS2 on Windows — and needs no outside binary. Of any number of sessions whose
  `mkdir` exited 0, exactly one creates `owner`; the rest find it there and answer busy (75).
- `mkdir` still makes the directory, and only a session whose `mkdir` exited 0 tries to claim: a
  directory with no claim stays *held by a session still writing its claim*, as now — never taken over.
- **The failure path removes only an unclaimed lock.** If the claim fails and no `owner` exists (a real
  write error), `rmdir` — which removes an empty directory only — instead of `rm -rf`. A claimed lock is
  never removed by `acquire`; the old post-write `holder` check goes (`O_EXCL` makes it redundant).
- An empty `owner` (the instant between its creation and the write) reads as *still writing its claim*.
- Tests (`tests/workflow-scripts.test.mjs`): a fake `mkdir` that exits 0 on an existing directory, as
  uutils 0.10.0 can — concurrent and sequential sessions, exactly one gets the lock and its claim is
  never overwritten or removed (fails on the old script every time); the many-at-once test runs 200
  rounds on CI (Linux), 3 locally; an empty `owner` reads as held; a claim that cannot be written is an
  error that leaves nothing behind.

## Without the fix, on CI

Head `ffe99e4` (the tests alone, on the old script), *Checks* run 46045638364, `ubuntu-26.04`: 1257/1261
— the three new tests fail. With the fake `mkdir`, the late session also got the lock (`actual: 0,
expected: 75`); an empty claim read as `held by ` with no name; a claim that could not be written leaked
bash's own *"line 42: …/owner: No such file or directory"* (a failed redirection is reported before its
`2>/dev/null` applies). The 200 real-race rounds **passed** (11.7 s): the race is rare — four failures
in the recorded runs of 3 rounds each — so the fake, which ignores `EEXIST` every time, is what shows the
mechanism; the 200 rounds guard against it coming back.

## PR review, round 1 (`gpt-6.2-astra`, `ask.sh` fresh read-only) — head `e047c66`

The GPT lock taken with `origin/main`'s `gpt-lock.sh` and released after; exit 0. Verdict: **Changes requested**.

<details><summary>GPT's review, verbatim</summary>

1. **Blocker — [.claude/gpt/gpt-lock.sh:90](.claude/gpt/gpt-lock.sh#L90). A release can overwrite the next holder’s claim.** A’s `rm -rf` succeeds. Before A checks `[ ! -e "$lock" ]`, B acquires the freed lock and starts its job. A now sees B’s directory, enters the recovery branch, and writes A’s ID over B’s `owner` at line 94. A’s next acquire returns `acquired (already yours)` while B is still running. This works with a correct `mkdir` on either platform. A successful removal must complete the release. Recovery after a genuine removal failure must also preserve any successor’s claim.

2. **High — [.claude/gpt/gpt-lock.sh:61](.claude/gpt/gpt-lock.sh#L61). A losing acquire can remove another session’s directory.** B gets the false-success `mkdir`, then loses the exclusive open to A. Pause B there. A releases, and C creates the directory for its next claim. Before C opens `owner`, B resumes, sees no `owner`, and successfully runs `rmdir` on **C’s** directory. C’s claim now fails. `rmdir` protects a published claim, but it does not establish who created an empty directory. This violates the ticket’s explicit cleanup requirement. Cleanup needs proof that the failed attempt owns the directory it removes.

3. **High — [.claude/gpt/gpt-lock.sh:44](.claude/gpt/gpt-lock.sh#L44). A failed claim write can be reported as contention or success.** The exclusive open can create `owner` and then `printf` can fail, for example when the filesystem is full. With an empty file, `acquire` reports busy and `wait` retries a lock nobody acquired. If a partial write contains the session ID and its following space, `holder` returns that ID and line 69 reports success. Distinguish losing the exclusive create from failing to publish a claim after winning it. The latter must exit 1 and clean up only state the attempt owns. The test at [tests/workflow-scripts.test.mjs:163](tests/workflow-scripts.test.mjs#L163) creates no directory, so it passes even if cleanup is deleted entirely.

4. **Medium — [.claude/gpt/gpt-lock.sh:68](.claude/gpt/gpt-lock.sh#L68). The hand-clear instructions can name a different session from the busy message.** If A releases and B acquires between `holder` and `claim_text`, the message says B holds the lock but tells the operator to check whether A is gone before clearing it. `status` makes the same two reads in reverse order at line 99. Derive the displayed claim and the session to check from one read. The manual-clear policy can stay as decided.

For the ordinary `owner` file, the platform premise checks out. Bash 5.x uses `O_EXCL` when the initial `stat` fails and rejects an existing regular file. Git for Windows’ MSYS2 runtime maps `O_CREAT|O_EXCL` to `FILE_CREATE`. The comment at line 42 overstates this for existing **nonregular** targets, which Bash can open without `O_EXCL`. None of the four findings depends on that exception. This was a source review of `e047c66` against `f565da9`. I did not run the tests. [Bash `noclobber_open`](https://sources.debian.org/src/bash/5.2.37-2/redir.c/#L664) · [Git for Windows MSYS2 file-open implementation](https://github.com/git-for-windows/msys2-runtime/blob/main/winsup/cygwin/fhandler/base.cc#L569-L574)

**Missing tests**

- Make a sandbox `rm` perform A’s real removal, acquire as B, then return success to A. Assert A reports `released`, B’s claim survives byte-for-byte, and A’s next acquire returns 75. Also exercise failed removal with a successor claim present before recovery. The Windows busy-directory test has no contender during recovery.
- Force the A/B/C ordering from finding 2 with barriers. Assert B leaves C’s directory intact, C can finish acquiring, and B cannot release C’s lock.
- Inject a write failure **after** exclusive creation in a real sandbox lock directory. Cover both zero bytes and a partial `"<session> "` claim. Assert `acquire` and `wait` exit 1, no `[GPT]` rename occurs, and a fresh session can subsequently acquire.
- Force a handoff between claim reads in busy `acquire` and `status`. Assert the holder shown and the session named in the manual-clear instructions always agree.

**Changes requested**

</details>

### My answers

1. **Blocker — a release can overwrite the next holder's claim. Agreed; fixed.** Pre-existing (the old
   script had the same `rm -rf … && [ ! -e ]` then `printf >`), and real with a correct `mkdir`.
   `release` now trusts `rm -rf`'s own exit status — once it succeeds, whatever is there is the next
   holder's — and, when it fails, puts the claim back through `claim` (`O_EXCL`), never over another
   session's. Git Bash's `rm -rf` on a busy directory exits 1 (checked: *"Device or resource busy"*,
   exit 1, the owner file already gone), so its status is reliable on Windows too. If the claim then
   names another session, this one holds nothing and gets `released`; if no claim could be put back,
   an error with the hand-clearing instructions.
2. **High — a losing acquire can `rmdir` another session's directory. Agreed; fixed.** A claim that was
   not created now removes nothing: with a claim there it is contention; with none, `error: could not
   write …` and exit 1, the directory left alone (it may be a session about to claim; if not, it reads
   as *still writing its claim* and is cleared by hand, as decision 9 has it).
3. **High — a claim created but not written reads as busy, or as success. Agreed; fixed.** `claim`
   opens the file (`3>`, under `set -C`) separately from writing it, so it knows whether it created
   the file: created but not written → it is this attempt's own, so it removes it, then the directory
   if that is then empty, and exits 1.
4. **Medium — busy and status read the claim twice. Agreed; fixed.** `read_claim` reads it once; the
   holder shown and the session named in the hand-clearing line come from that one read.

GPT's note that `noclobber` opens an existing **non-regular** file without `O_EXCL`: agreed, and the
comment now says "of any number of sessions claiming at once exactly one creates it", which holds for
the regular file the lock uses; nothing ever makes `owner` a FIFO or device but a test (below).

**Missing tests — added:**
- A release whose `rm` lets a successor in before it reads back: `released`, the successor's claim
  byte for byte, the next acquire busy — and the same with a failed removal (Windows-style: owner
  gone, directory left) and a successor claim present before recovery. Both fail on `e047c66`.
- *A claim that cannot be created removes nothing* (read-only directory standing for another
  session's, not yet claimed): exit 1, the directory intact, still *writing its claim*, not this
  session's to release. Fails on `e047c66` (its `rm -rf` removed the directory). Linux/macOS only.
- *A claim created but not written*: `owner` a symlink to `/dev/full`, so it opens and takes no bytes
  — `acquire` and `wait` exit 1, no `[GPT]` rename, the lock free, a fresh session acquires.
  Linux/macOS only. The partial-claim variant (`"<session> "` written, then failure) runs the same
  branch — any failed write removes the claim, whatever it holds — and can't be staged.
- **Not added:** forcing a hand-off *between* the two claim reads of finding 4. There is now one
  read, so there is no "between"; staging it would need a hook inside the script.
