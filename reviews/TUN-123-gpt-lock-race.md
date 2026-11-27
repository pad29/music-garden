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
