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
  session's to release. Linux/macOS only, so not run against `e047c66`: by reading, its `rmdir` (and
  `origin/main`'s `rm -rf`) removes that empty directory, which the test asserts is still there.
- *A claim created but not written*: `owner` a symlink to `/dev/full`, so it opens and takes no bytes
  — `acquire` and `wait` exit 1, no `[GPT]` rename, the lock free, a fresh session acquires.
  Linux/macOS only. The partial-claim variant (`"<session> "` written, then failure) runs the same
  branch — any failed write removes the claim, whatever it holds — and can't be staged.
- **Not added:** forcing a hand-off *between* the two claim reads of finding 4. There is now one
  read, so there is no "between"; staging it would need a hook inside the script.

## Tests

- CI (`ubuntu-26.04`), heads `5decc25` and `eb8c021`: 1264/1265, one skipped (the Windows-only
  busy-directory release) — with the many-at-once test at 200 rounds and the fake-`mkdir` test's
  concurrent part at 200 rounds, every round passing. Without the fix (head `ffe99e4`, run
  46045638364): 3 failed. Round 2's head: on PR #190.
- Git Bash on Windows, after round 2: the gpt-lock tests 14/16, the two Linux-only ones skipped; the
  release-race tests fail on `e047c66`, the cut-short and still-being-written ones on `eb8c021`. The
  many-round Windows loop's result is on PR #190.
- Not verified: the Linux-only read-only-directory test against the old script (by reading only); a
  partial write staged for real (the reader's rule is tested with a cut-short file); a release between
  a lost exclusive create and the check after it.
- Second GPT round: run on the owner's yes — below; a third, on the owner's yes, after it.

## PR review, round 2 (`gpt-6.2-astra`, `ask.sh` fresh read-only) — head `eb8c021`

The owner's yes (D3). The GPT lock taken with origin/main's script and released after; exit 0. The prompt carried round 1 verbatim, what changed, and the delta `e047c66..eb8c021`. Verdict: **Changes requested**.

<details><summary>GPT's review, verbatim</summary>

1. **High — `.claude/gpt/gpt-lock.sh:56` — A failed writer can still remove another session’s directory.** A creates the directory and pauses before opening `owner`. B’s racing `mkdir` also returns 0. B creates `owner`, its write fails, and line 56 removes both the file and **A’s directory**. A resumes and cannot create its claim. This needs neither a release nor a third session. Creating `owner` proves ownership of that file only. The decision at line 79 to leave an unclaimed directory in place is correct. Apply the same ownership rule at line 56.

2. **High — `.claude/gpt/gpt-lock.sh:85` — Another invocation can accept a partial claim before cleanup.** Suppose a failed write for `music-garden-10` leaves `music-garden-1` on disk. Before line 56 unlinks it, an acquire by `music-garden-1` reads those bytes, recognizes itself, and returns `acquired (already yours)`. Cleanup then frees the lock while that session believes it holds it. A partial `"<session> "` likewise fools a concurrent retry by that session. Line 103 also accepts the partial ID for release. Publish a complete claim atomically, or require evidence of a complete record before granting either ownership operation. The failed writer itself now exits 1 correctly.

3. **High — `.claude/gpt/gpt-lock.sh:114` — Failed release can give hand-clear instructions for the wrong session.** A’s removal fails after unlinking `owner`. B wins the exclusive open and pauses before writing its ID. A’s recovery open fails, its one read sees an empty file, and it tells the operator to clear the lock once **A** is gone. B can finish acquiring and still be running when that condition is met. An unreadable or incomplete claim must not authorize clearing based on A’s identity. The `released` result at line 113 is correct when a complete claim identifies B. The successful-`rm` branch and the single-read busy/status messages also fix their round-1 findings.

4. **Medium — `.claude/gpt/gpt-lock.sh:79` — Ordinary contention can terminate `wait` with a filesystem error.** B loses the exclusive open to A’s regular `owner`. A releases before B reaches the existence check. B now reports `could not write` and `wait` exits 1 even though the lock is free. Preserve the distinction between a lost exclusive create and a genuine creation error. Looking up the pathname afterward cannot recover the original reason.

5. **Medium — `tests/workflow-scripts.test.mjs:249` — The write-failure test rewards deleting an entry the acquire did not create.** The fixture creates the `owner` symlink before calling `acquire`. Bash opens the existing character device without `O_EXCL`, sets `made=1`, and the test requires cleanup to unlink the fixture’s symlink. It never exercises exclusive creation of a regular file or a partial write. Against `e047c66`, the old holder read can also hang reading `/dev/full`, which supplies zero bytes indefinitely. Replace the fixture with a bounded write failure on a newly created regular file. The read-only-directory test, by contrast, does catch the old `rmdir` because its parent is writable. [Bash `noclobber_open`](https://sources.debian.org/src/bash/5.2.37-2/redir.c/#L664) · [Linux `full(4)`](https://man7.org/linux/man-pages/man4/full.4.html)

The brace group itself is sound in Bash 5.x, including Git Bash. A failed fd 3 redirection skips the group, so `made` stays empty. Every normal return passes through `set +C`. That does clear an *inherited* `noclobber` setting for the rest of the script, but executing the script cannot change the invoking shell’s setting. I reviewed `eb8c021` against `f565da9` by source inspection. I did not run tests or access AO or the real lock.

**Missing tests**

- Pause A after its real `mkdir`. Give B the false-success `mkdir` and inject a zero-byte write failure after B creates a regular `owner`. Assert B exits 1 without renaming, A’s directory survives, and A finishes acquiring. Exercise `wait` as well as `acquire`.
- Use a sandbox `BASH_ENV` wrapper for the claim’s `printf` to write a partial ID, signal a barrier, and return failure. While paused, try `acquire` and `release` as the matching shorter session. Repeat with `"<session> "` and a same-session retry. Neither may claim ownership. Verify a fresh session can acquire after cleanup.
- During failed release, pause B after its exclusive open and before its write. Assert A’s diagnostic never directs clearing based on A being gone, then let B finish and verify its claim survives.
- Let A release after B loses the exclusive open and before B checks the pathname. Assert B’s `wait` can acquire on retry. Keep the genuine creation-error case exiting 1.
- In both release-race tests, save B’s exact claim **inside the `rm` hook**, immediately after B acquires. Compare those bytes after A returns. Both tests catch the `e047c66` overwrite, but the current byte-for-byte baseline at line 202 is taken after release has already returned.
- For busy `acquire` and `status`, have sandbox `cat`/`cut` wrappers change the fixture from A to B immediately after serving the first owner read. Assert the displayed holder and the session named in the hand-clear instruction agree. This catches reintroduction of the two-read bug without a production hook.

**Changes requested**

</details>

### My answers

1. **High — a failed writer can still remove another session's directory. Agreed; fixed.** A claim
   created but not written removes only its own `owner` file, never the directory. Cost: on a full
   disk with a correct `mkdir`, the empty directory stays and reads as *still writing its claim*,
   cleared by hand (decision 9).
2. **High — another invocation can accept a partial claim. Agreed; fixed** by requiring evidence of a
   complete record: `read_claim` — bash's `read`, which succeeds only on a newline-terminated line,
   holding `<session> <time>` — is the only way any command learns the holder, so a claim cut short
   names nobody: not *already yours*, not releasable, *still writing its claim*.
3. **High — a failed release can give hand-clear instructions for the wrong session. Agreed; fixed.**
   After a failed removal, any `owner` file that is not this session's complete claim — complete or
   still being written — means this session holds nothing: `released`, no hand-clearing lines.
4. **Medium — ordinary contention can end `wait` with a filesystem error. Agreed; fixed** without
   errno: a claim not created, with no claim there, retries the whole acquire once. The race GPT
   describes (the winner released already) then acquires or answers busy; a real creation error fails
   twice and exits 1, as the read-only-directory test shows.
5. **Medium — the write-failure test rewards deleting an entry the acquire did not create. Agreed;
   replaced.** A file-size limit of 0 (`ulimit -f 0`, `SIGXFSZ` ignored) lets bash create a regular
   `owner` with `O_EXCL` and fails its write; no `/dev/full`.

**Missing tests — added:** a failed writer (file-size limit 0, `acquire` and `wait`) leaves the other
session's directory, removes only its own file, renames nothing, and the other session finishes
acquiring (Linux/macOS); a claim cut short (`music-garden-1` of `music-garden-10`, and
`"music-garden-10 "`) is never *already yours* nor releasable; a failed release that finds a claim
still being written says `released` and never names itself to clear; both release-race tests now save
the successor's claim inside the `rm` hook. The cut-short and still-being-written tests fail on
`eb8c021` (run on Git Bash). **Not added:** a release between a lost exclusive create and the check
after it — no outside command runs between them to hook (the claim's `date` runs only after the open
succeeds); `cat`/`cut` wrappers for the two-read bug — the claim is now read once, by the `read`
builtin.

## PR review, round 3 (`gpt-6.2-astra`, `ask.sh` fresh read-only) — head `39a4600`

The owner's yes (D8). The GPT lock taken with origin/main's script (`wait`), released after; exit 0. The prompt carried rounds 1 and 2 verbatim, what changed, and the delta `eb8c021..1ac8fc9`. Verdict: **Changes requested**.

<details><summary>GPT's review, verbatim</summary>

1. **Blocker — `.claude/gpt/gpt-lock.sh:115` — Two releases by the same session can delete a successor’s live lock.** Both releases can pass the ownership check at line 111 before either reaches `rm`. The first removes A’s lock, B acquires and starts work, then A’s delayed second `rm -rf` removes B’s lock. C can now acquire while B is running. This predates the round-2 delta and works with a correct `mkdir` on either platform. The destructive step needs to apply only to the claim that the release validated.

2. **High — `.claude/gpt/gpt-lock.sh:118` — Failed-release recovery can claim a later session’s directory.** Start with the failed-removal handoff already modeled at `tests/workflow-scripts.test.mjs:217`. B acquires after A’s `rm` unlinks `owner`. Pause A before recovery, let B release, then let C create a fresh directory and pause before opening `owner`. A resumes and successfully writes **A’s** claim into **C’s** directory. C gets `busy`, and the lock again names A even though B already acquired and released it. Exclusive creation protects an existing file. Recovery also needs to establish that it is acting on the directory whose removal failed.

3. **Medium — `.claude/gpt/gpt-lock.sh:85` — The retry still confuses contention and filesystem errors in both directions.** With an ordinary `mkdir`, B can create the directory and then fail to create `owner` with `ENOSPC`. The recursive call gets `EEXIST` on B’s empty directory and returns 75. `wait` can spend its entire budget on a write error. The read-only-directory test masks this path by making **every** `mkdir` return success. Conversely, two successive holders can each release between B’s lost exclusive open and line 84, making the second handoff exit 1 at line 86. Even with a correct `mkdir`, a single release between the existence checks at lines 72 and 90 can terminate `wait` with exit 1. The recursion is bounded and propagates its result without a second acquire or rename. The remaining defect is how it determines the reason for failure.

4. **Medium — `.claude/gpt/gpt-lock.sh:122` — Release can report success after restoring its own claim.** Line 118 discards `claim`’s return value. For example, A can acquire normally, then release under `umask 0777`. If removal fails after unlinking `owner`, recovery can create a mode-`000` file and write A’s complete claim through the open descriptor. For an unprivileged user, `read_claim` then fails, `[ -e "$lock/owner" ]` succeeds, and A prints `released`. Other sessions remain blocked. Preserve the recovery result and distinguish a failed read from an observed successor writing its claim.

Round 2 did fix the partial-ID case. The old writer supplied the terminating newline, and a CR in a CRLF record comes after the timestamp, outside the session ID. Line 33 checks for a space and a newline, so `"<session> \n"` also passes, but a truncated prefix of the normal record cannot supply that final newline. Removing only the failed writer’s regular file and leaving the directory for hand clearing is consistent with decision 9.

**Missing tests**

- Pause one A release after its ownership check, finish a second A release, and acquire as B. Resume the first release. Assert B’s exact claim survives and C receives 75.
- Extend the partial-`rm` hook so B acquires **and releases**, then pause C after its real `mkdir`. Resume A’s recovery. Assert C finishes acquiring and A cannot release C’s lock.
- Have the first real `mkdir` create a non-writable directory and retain ordinary `EEXIST` behavior afterward. As a non-root user, assert both `acquire` and `wait` exit 1 immediately. Separately, force consecutive handoffs before the owner checks and assert `wait` retries and renames the eventual winner once.
- Run failed-release recovery under `umask 0777` as a non-root user. Assert it exits 1, then restore read permission in the fixture and verify the claim still names A.
- In the mid-claim test, keep the successor’s file descriptor open across A’s recovery, then finish writing through it and release as B. The current fixture verifies that an empty file remains at the pathname. The `ulimit -f 0` and cut-short fixtures do exercise their respective zero-byte write and reader cases.

I reviewed `39a4600` by source inspection. I did not run tests, invoke AO, or access the real lock.

**Changes requested**

</details>

### My answers (work in progress when the owner stopped it)

All four agreed. Committed as work in progress on the branch, **never reviewed by GPT**:

1. **Blocker — two releases by one session can delete a successor's lock. Agreed.** It **predates this
   PR**: `origin/main`'s release (`h=$(holder)` … `rm -rf "$lock"`) has the same window. Release now
   takes the lock off its path in one step (`mv -T "$lock" "$lock.released.<me>.<pid>"`, a rename),
   then reads the claim it took; if that claim is another session's, it renames it back. Test: *two
   releases by one session never take the next holder's lock* (a hook inside `ao session rename`).
2. **High — failed-release recovery can claim a later session's directory. Agreed;** gone with the
   recovery itself: a release that cannot rename the lock (Windows' busy directory — checked: Git
   Bash's `mv -T` exits 1 and moves nothing) has changed nothing, so it reports *still held* and never
   writes a claim.
3. **Medium — the retry confuses contention and filesystem errors. Agreed.** A claim not made, with
   the lock still there, is now an error at once (no retry); with the lock gone, one retry, then busy
   75. The same once-more applies when `mkdir` failed and the lock vanished before the check. Test
   (Linux/macOS): an ordinary `mkdir` whose directory refuses files — `acquire` and `wait` exit 1 at
   once.
4. **Medium — release can report success after restoring its own claim. Agreed;** gone with the
   recovery (no claim is ever restored).

Missing tests: 1 and 3 (the first half) added as above, plus *a release whose leftover can't be
deleted still releases*. Not added: 2, 4 and 5 (their code path no longer exists); the consecutive
hand-offs of 3 (no outside command to hook between the steps).

## Where this stands (2026-11-27, 11:37 AM PT)

**The owner's decision (D11, A, through the coordinator): "stop patching and restart TUN-123 from a
design review."** No fourth GPT round; no further changes to `gpt-lock.sh` today; PR #190 does not
merge — it is a draft. The work restarts another day from a GPT design review of the lock.

- **Settled and evidenced:** the cause (§ Cause) and the core fix — a claim created with `O_EXCL`
  decides who holds the lock, not `mkdir`. Rounds 1–3 found nothing wrong with that; every finding was
  in the paths around it.
- **Fixed and reviewed:** round 1's four findings, re-reviewed in round 2; round 2's five, re-reviewed
  in round 3 (round 3: "Round 2 did fix the partial-ID case"; leaving the directory after a failed
  write "is consistent with decision 9").
- **Fixed, not reviewed:** round 3's four, above (work in progress on the branch).
- **Open:** every round found new interleavings in release and in the failure paths — round 3's
  Blocker among them, which predates this PR — because each fix is a path-based step on a directory
  other sessions can remove and recreate. That is a design question, not a patch.

**What the design review should start from:** this file; the cause; the `O_EXCL` claim as the one
mechanism that has held; the thirteen findings of rounds 1–3, most of them interleavings, as the
requirements a design must survive (a test each); decision 9 (no automatic break); both platforms
(Git Bash's GNU tools; uutils on `ubuntu-26.04`); and the question it never answered — whether the
lock should be a **file** with an atomic claim (no directory to remove and recreate), or keep the
directory and make every removal a rename aside, as the work in progress began to.

**Windows 200-round loop:** never completed. It was stopped twice — once because the script was
about to change under it, once when round 2's fixes changed it again — and was not restarted after
round 3. The 200-round evidence is Linux CI's (heads `e047c66`, `5decc25`, `eb8c021`, `39a4600`).
