// The workflow's shell scripts, run for real under bash with fake `ao`, `gh`, `sleep` and `codex` on
// PATH: `.claude/gpt/gpt-lock.sh` (one GPT job at a time, CLAUDE.md § Cost), the review poller in
// `.claude/skills/work-ticket/pr-review.md`, extracted from the doc so the doc is what is tested, and
// `.claude/gpt/ask.sh`'s exit statuses and stderr (a stub codex — never the real one).
// Skipped when no bash is found (on Windows, Git Bash — never WSL's bash.exe).
import { test } from "node:test";
import assert from "node:assert";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, existsSync, statSync, mkdirSync, rmSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const lockScript = join(root, ".claude/gpt/gpt-lock.sh");

// On Windows, Git's own bash: found from `git --exec-path` (<git>/mingw64/libexec/git-core), so
// wherever Git is installed — never the WSL `bash.exe` that PATH may offer first.
function gitBashes() {
  const r = spawnSync("git", ["--exec-path"], { encoding: "utf8" });
  const gitRoot = r.status === 0 ? join(r.stdout.trim(), "..", "..", "..") : null;
  return [process.env.GIT_BASH, gitRoot && join(gitRoot, "bin", "bash.exe"), gitRoot && join(gitRoot, "usr", "bin", "bash.exe"),
    "C:/Program Files/Git/bin/bash.exe"];
}

function findBash() {
  const candidates = process.platform === "win32" ? gitBashes() : ["bash"];
  for (const c of candidates.filter(Boolean)) {
    if (process.platform === "win32" && !existsSync(c)) continue;
    const r = spawnSync(c, ["-c", "echo ok"], { encoding: "utf8" });
    if (r.status === 0 && r.stdout.trim() === "ok") return c;
  }
  return null;
}
const bash = findBash();
// A Windows path as this bash sees it (C:/x as /c/x), for PATH entries.
const posix = p => process.platform === "win32" && bash
  ? spawnSync(bash, ["-c", 'cygpath -u "$1"', "_", p], { encoding: "utf8" }).stdout.trim() : p;
const skip = bash ? false : "no bash found";

// A sandbox: a bin dir with fake `ao`, `gh` and `sleep` first on PATH, and a state dir they read.
function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), "wf-"));
  const bin = join(dir, "bin"), state = join(dir, "state");
  mkdirSync(bin); mkdirSync(state);
  // ao session ls → $state/sessions.json (exit 1 if $state/ao-fails exists); ao session rename → log;
  // ao review ls --json (the poller's) → $state/review<N>.json, N counting calls (the last one
  // repeats); *.fail → exit 1.
  writeFileSync(join(bin, "ao"), `#!/usr/bin/env bash
s="$FAKE_STATE"
case "$1 $2" in
  "session ls") [ -e "$s/ao-fails" ] && { echo "ao: daemon down" >&2; exit 1; }; cat "$s/sessions.json" ;;
  "session rename") printf '%s|%s\\n' "$3" "$4" >> "$s/renames.log" ;;
  "review ls")
    n=$(( $(cat "$s/n" 2>/dev/null || echo 0) + 1 )); echo $n > "$s/n"
    while [ $n -gt 1 ] && [ ! -e "$s/review$n.json" ] && [ ! -e "$s/review$n.fail" ]; do n=$((n-1)); done
    [ -e "$s/review$n.fail" ] && { cat "$s/review$n.fail" >&2; exit 1; }
    cat "$s/review$n.json" ;;
  *) echo "fake ao: unexpected $*" >&2; exit 2 ;;
esac
`, { mode: 0o755 });
  writeFileSync(join(bin, "gh"), `#!/usr/bin/env bash\necho "\${FAKE_HEAD:-abc123}"\n`, { mode: 0o755 });
  writeFileSync(join(bin, "sleep"), `#!/usr/bin/env bash\nexit 0\n`, { mode: 0o755 });
  const env = {
    ...process.env,
    FAKE_BIN: posix(bin),
    FAKE_STATE: state,
    GPT_LOCK_DIR: join(dir, "lock"),
    GPT_LOCK_SLEEP: "0",
    TMPDIR: dir,
  };
  const sessions = ids => writeFileSync(join(state, "sessions.json"),
    JSON.stringify({ data: ids.map(id => ({ id, displayName: `name of ${id}`, status: "working" })), meta: {} }));
  const which = spawnSync(bash, ["-c", PRELUDE + "command -v sleep ao gh"], { env, encoding: "utf8" }).stdout;
  // all three found, each the fake (on POSIX, a fake without its x bit would be passed over or missing)
  const found = which.split("\n").filter(Boolean);
  assert.ok(found.length === 3 && found.every(l => l.startsWith(env.FAKE_BIN + "/")), "fakes first on PATH: " + which);
  return { dir, state, env, sessions, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

// bash -c, with the fake bin put first on PATH inside bash itself (Git's bin/bash.exe wrapper puts
// /usr/bin first, so a PATH set from outside loses to the real sleep), then the script or snippet.
const PRELUDE = 'PATH="$FAKE_BIN:$PATH"; ';
const runScript = (script, ...args) => ["-c", PRELUDE + 'exec "$BASH" "$@"', "_", script, ...args];

function lock(sb, session, cmd, ...args) {
  const r = spawnSync(bash, runScript(lockScript, cmd, ...args), { env: { ...sb.env, AO_SESSION_ID: session }, encoding: "utf8" });
  return { code: r.status, out: (r.stdout + r.stderr).trim() };
}

function lockAsync(sb, session, cmd) {
  return new Promise(resolve => {
    const p = spawn(bash, runScript(lockScript, cmd), { env: { ...sb.env, AO_SESSION_ID: session } });
    let out = "";
    p.stdout.on("data", d => out += d); p.stderr.on("data", d => out += d);
    p.on("close", code => resolve({ session, code, out: out.trim() }));
  });
}

// Six sessions acquire at once, `rounds` times, each round on a fresh lock: exactly one wins, the rest
// are busy, and the winner's lock is really there — status names it and its release succeeds (TUN-123:
// a loser's `rm -rf` once left a winner printing "acquired" with no lock behind it).
async function acquireAtOnce(sb, rounds) {
  const ids = Array.from({ length: 6 }, (_, i) => `music-garden-${10 + i}`);
  sb.sessions(ids);
  for (let round = 0; round < rounds; round++) {
    sb.env.GPT_LOCK_DIR = join(sb.dir, `lock${round}`);
    const results = await Promise.all(ids.map(id => lockAsync(sb, id, "acquire")));
    const at = `round ${round + 1}/${rounds}: ${JSON.stringify(results)}`;
    const winners = results.filter(r => r.code === 0);
    assert.strictEqual(winners.length, 1, at);
    assert.strictEqual(winners[0].out, "acquired", at);
    assert.ok(results.filter(r => r.code !== 0).every(r => r.code === 75 && /^busy: held by /.test(r.out)), at);
    assert.match(lock(sb, ids[0], "status").out, new RegExp(`^held by ${winners[0].session} `), at);
    assert.strictEqual(lock(sb, winners[0].session, "release").out, "released", at);
  }
}

// 3 rounds locally (Git Bash spawns slowly); 200 on CI, whose Linux is where the race showed
// (GPT_LOCK_ROUNDS overrides both, for a loop by hand).
const atOnceRounds = Number(process.env.GPT_LOCK_ROUNDS) || (process.env.CI ? 200 : 3);

test("gpt-lock: of many sessions acquiring at the same instant, exactly one gets the lock", { skip }, async () => {
  const sb = sandbox();
  try { await acquireAtOnce(sb, atOnceRounds); } finally { sb.cleanup(); }
});

// uutils' mkdir up to 0.10.0 — Ubuntu 26.04's default, so GitHub's ubuntu-latest runner — exits 0 when
// mkdir(2) says EEXIST and the path is a directory (uutils issue #13970): two sessions racing for the
// lock both "make" it. This fake does that every time, not only in the race, by running the real mkdir
// (the PATH without the fake bin) and exiting 0 whenever the directory then exists.
function eexistIgnoringMkdir(sb) {
  writeFileSync(join(sb.dir, "bin", "mkdir"), `#!/usr/bin/env bash
PATH="\${PATH#"$FAKE_BIN:"}" mkdir "$@" 2>/dev/null || [ -d "\${!#}" ]
`, { mode: 0o755 });
}

test("gpt-lock: with a mkdir that exits 0 on an existing directory, exactly one session gets the lock, and its claim stands", { skip }, async () => {
  const sb = sandbox();
  try {
    eexistIgnoringMkdir(sb);
    sb.sessions(["music-garden-4", "music-garden-6"]);
    assert.strictEqual(lock(sb, "music-garden-6", "acquire").out, "acquired");
    const owner = join(sb.env.GPT_LOCK_DIR, "owner");
    const claim = readFileSync(owner, "utf8");
    const late = lock(sb, "music-garden-4", "acquire");                // its mkdir "succeeds" too
    assert.strictEqual(late.code, 75, late.out);
    assert.match(late.out, /^busy: held by music-garden-6 /);
    assert.strictEqual(readFileSync(owner, "utf8"), claim, "the holder's claim is never overwritten");
    assert.strictEqual(readFileSync(join(sb.env.GPT_LOCK_DIR, "name"), "utf8"), "name of music-garden-6",
      "nor its lock removed");
    assert.strictEqual(lock(sb, "music-garden-4", "release").code, 1);
    assert.strictEqual(lock(sb, "music-garden-6", "release").out, "released");
    // and all at once: every round, every session's mkdir "succeeds", so the claim alone decides
    await acquireAtOnce(sb, Number(process.env.GPT_LOCK_ROUNDS) || (process.env.CI ? 200 : 2));
  } finally { sb.cleanup(); }
});

test("gpt-lock: a claim that cannot be written is an error, and leaves no lock behind", { skip }, () => {
  const sb = sandbox();
  try {
    sb.sessions(["music-garden-6"]);
    writeFileSync(join(sb.dir, "bin", "mkdir"), "#!/usr/bin/env bash\nexit 0\n", { mode: 0o755 }); // makes nothing
    const r = lock(sb, "music-garden-6", "acquire");
    assert.strictEqual(r.code, 1, r.out);
    assert.match(r.out, /^error: could not write .*owner$/);
    assert.strictEqual(lock(sb, "music-garden-6", "status").out, "free");
  } finally { sb.cleanup(); }
});

// A fake rm for release's `rm -rf "$lock"`: removes the whole lock (or, with { partial }, only its owner
// file, failing as Windows does on a busy directory), then — once — lets a successor in before release
// reads anything back: music-garden-9 acquiring (its claim saved to $FAKE_STATE/successor.claim on the
// spot), or, with { midClaim }, a session that has created its claim file and not yet written it.
function rmLettingASuccessorIn(sb, { partial = false, midClaim = false } = {}) {
  if (partial) writeFileSync(join(sb.state, "rm-partial"), "");
  if (midClaim) writeFileSync(join(sb.state, "rm-midclaim"), "");
  writeFileSync(join(sb.state, "rm-hook"), "");
  writeFileSync(join(sb.dir, "bin", "rm"), `#!/usr/bin/env bash
real() { PATH="\${PATH#"$FAKE_BIN:"}" command rm "$@"; }
lk="\${!#}"
if [ -e "$FAKE_STATE/rm-partial" ]; then real -f "$lk/owner"; s=1; else real "$@"; s=$?; fi
if [ -e "$FAKE_STATE/rm-hook" ]; then
  real -f "$FAKE_STATE/rm-hook" "$FAKE_STATE/rm-partial"
  if [ -e "$FAKE_STATE/rm-midclaim" ]; then real -f "$FAKE_STATE/rm-midclaim"; : > "$lk/owner"
  else
    AO_SESSION_ID=music-garden-9 "$BASH" "$LOCK_SCRIPT" acquire > "$FAKE_STATE/successor.out" 2>&1
    cat "$lk/owner" > "$FAKE_STATE/successor.claim"
  fi
fi
exit $s
`, { mode: 0o755 });
  sb.env.LOCK_SCRIPT = lockScript;
}

test("gpt-lock: a release never overwrites the claim of a session that took the lock meanwhile", { skip }, () => {
  const sb = sandbox();
  try {
    sb.sessions(["music-garden-6", "music-garden-9"]);
    assert.strictEqual(lock(sb, "music-garden-6", "acquire").code, 0);
    rmLettingASuccessorIn(sb);                                         // 9 acquires right after the removal
    const rel = lock(sb, "music-garden-6", "release");
    assert.strictEqual(readFileSync(join(sb.state, "successor.out"), "utf8").trim(), "acquired");
    assert.strictEqual(rel.code, 0, rel.out);
    assert.strictEqual(rel.out, "released");
    const owner = join(sb.env.GPT_LOCK_DIR, "owner");
    const claim = readFileSync(join(sb.state, "successor.claim"), "utf8");   // as 9 wrote it
    assert.match(claim, /^music-garden-9 /);
    assert.strictEqual(readFileSync(owner, "utf8"), claim, "the successor's claim stands, byte for byte");
    const again = lock(sb, "music-garden-6", "acquire");
    assert.strictEqual(again.code, 75, again.out);
    assert.match(again.out, /^busy: held by music-garden-9 /);
    assert.strictEqual(readFileSync(owner, "utf8"), claim);
  } finally { sb.cleanup(); }
});

test("gpt-lock: a release that fails puts its claim back only where no other session has claimed", { skip }, () => {
  const sb = sandbox();
  try {
    eexistIgnoringMkdir(sb);                     // so 9 can claim inside the directory rm could not remove
    sb.sessions(["music-garden-6", "music-garden-9"]);
    assert.strictEqual(lock(sb, "music-garden-6", "acquire").code, 0);
    rmLettingASuccessorIn(sb, { partial: true });
    const rel = lock(sb, "music-garden-6", "release");
    assert.strictEqual(readFileSync(join(sb.state, "successor.out"), "utf8").trim(), "acquired");
    assert.strictEqual(rel.code, 0, rel.out);                          // 6 holds nothing any more
    const claim = readFileSync(join(sb.state, "successor.claim"), "utf8");
    assert.match(claim, /^music-garden-9 /);
    assert.strictEqual(readFileSync(join(sb.env.GPT_LOCK_DIR, "owner"), "utf8"), claim, "byte for byte");
    assert.match(lock(sb, "music-garden-6", "status").out, /^held by music-garden-9 /);
    assert.strictEqual(lock(sb, "music-garden-9", "release").out, "released");
  } finally { sb.cleanup(); }
});

test("gpt-lock: a failed release that finds a claim still being written holds nothing, and never names itself to clear", { skip }, () => {
  const sb = sandbox();
  try {
    sb.sessions(["music-garden-6"]);
    assert.strictEqual(lock(sb, "music-garden-6", "acquire").code, 0);
    rmLettingASuccessorIn(sb, { partial: true, midClaim: true });      // owner gone; another's created, empty
    const rel = lock(sb, "music-garden-6", "release");
    assert.strictEqual(rel.code, 0, rel.out);
    assert.strictEqual(rel.out, "released");
    assert.doesNotMatch(rel.out, /music-garden-6 is gone/);
    assert.strictEqual(readFileSync(join(sb.env.GPT_LOCK_DIR, "owner"), "utf8"), "", "the other's claim file is left alone");
  } finally { sb.cleanup(); }
});

test("gpt-lock: a claim cut short names nobody — never \"already yours\", never releasable", { skip }, () => {
  const sb = sandbox();
  try {
    sb.sessions(["music-garden-1", "music-garden-10"]);
    mkdirSync(sb.env.GPT_LOCK_DIR);
    // music-garden-10's write stopped after "music-garden-1"; then after "music-garden-10 "
    for (const [partial, reader] of [["music-garden-1", "music-garden-1"], ["music-garden-10 ", "music-garden-10"]]) {
      writeFileSync(join(sb.env.GPT_LOCK_DIR, "owner"), partial);
      const a = lock(sb, reader, "acquire");
      assert.strictEqual(a.code, 75, a.out);
      assert.match(a.out, /^busy: held by a session still writing its claim\n  stuck\? once <holder> is gone/);
      assert.strictEqual(lock(sb, reader, "release").code, 1);
      assert.match(lock(sb, reader, "status").out, /^held by a session still writing its claim\n/);
    }
  } finally { sb.cleanup(); }
});

// Linux and macOS: a read-only directory, and a file-size limit of 0, are how a claim's creation, or
// its write, fails.
const posixOnly = skip || (process.platform === "win32" && "needs a read-only directory and ulimit -f")
  || (process.getuid?.() === 0 && "root ignores a read-only directory");

test("gpt-lock: a claim that cannot be created removes nothing — the directory may be another session's", { skip: posixOnly }, () => {
  const sb = sandbox();
  try {
    eexistIgnoringMkdir(sb);
    sb.sessions(["music-garden-6"]);
    mkdirSync(sb.env.GPT_LOCK_DIR, { mode: 0o555 });                   // another session's, not yet claimed
    const r = lock(sb, "music-garden-6", "acquire");                   // its mkdir "succeeds"; its claim can't be made
    assert.strictEqual(r.code, 1, r.out);
    assert.match(r.out, /^error: could not write .*owner$/);
    assert.ok(existsSync(sb.env.GPT_LOCK_DIR), "the other session's directory is still there");
    assert.match(lock(sb, "music-garden-6", "status").out, /^held by a session still writing its claim\n/);
    assert.strictEqual(lock(sb, "music-garden-6", "release").code, 1, "and it is not this session's");
  } finally { spawnSync("chmod", ["755", sb.env.GPT_LOCK_DIR]); sb.cleanup(); }
});

// As on a full disk: a file-size limit of 0 lets bash create the claim file — a regular one, with
// O_EXCL — and fails its write (EFBIG; SIGXFSZ ignored, so the write fails rather than the process).
function fullDisk(sb, session, cmd) {
  const r = spawnSync(bash, ["-c", PRELUDE + 'trap "" XFSZ; ulimit -f 0; exec "$BASH" "$@"', "_", lockScript, cmd],
    { env: { ...sb.env, AO_SESSION_ID: session }, encoding: "utf8" });
  return { code: r.status, out: (r.stdout + r.stderr).trim() };
}

test("gpt-lock: a claim created but not written is an error that removes only that file", { skip: posixOnly }, () => {
  const sb = sandbox();
  try {
    sb.sessions(["music-garden-6", "music-garden-7"]);
    mkdirSync(sb.env.GPT_LOCK_DIR);              // 7's: made, its claim not yet written
    eexistIgnoringMkdir(sb);                     // 6's mkdir "succeeds" on it too
    for (const cmd of ["acquire", "wait"]) {
      sb.env.GPT_LOCK_TRIES = "3";
      const r = fullDisk(sb, "music-garden-6", cmd);
      assert.strictEqual(r.code, 1, r.out);
      assert.match(r.out, /^error: could not write .*owner$/);
      assert.ok(existsSync(sb.env.GPT_LOCK_DIR), "7's directory is still there");
      assert.ok(!existsSync(join(sb.env.GPT_LOCK_DIR, "owner")), "6's own claim file is gone");
    }
    assert.ok(!existsSync(join(sb.state, "renames.log")), "no [GPT] rename");
    assert.strictEqual(lock(sb, "music-garden-7", "acquire").out, "acquired", "7 can still finish acquiring");
  } finally { sb.cleanup(); }
});

test("gpt-lock: a session holding the lock keeps it against a later, lower-numbered session", { skip }, () => {
  // The interleaving the [GPT]-name marker lost: 6 holds and is running; 4 arrives late.
  const sb = sandbox();
  try {
    sb.sessions(["music-garden-4", "music-garden-6"]);
    assert.strictEqual(lock(sb, "music-garden-6", "acquire").code, 0);
    const late = lock(sb, "music-garden-4", "acquire");
    assert.strictEqual(late.code, 75);
    assert.match(late.out, /held by music-garden-6/);
    const mine = lock(sb, "music-garden-6", "acquire");
    assert.strictEqual(mine.code, 0, "re-acquiring your own lock is a no-op");
    assert.strictEqual(mine.out, "acquired (already yours)");
  } finally { sb.cleanup(); }
});

test("gpt-lock: release gives it back, renames restore, and only the holder may release", { skip }, () => {
  const sb = sandbox();
  try {
    sb.sessions(["music-garden-4", "music-garden-6"]);
    assert.strictEqual(lock(sb, "music-garden-6", "acquire").code, 0);
    const refused = lock(sb, "music-garden-4", "release");
    assert.strictEqual(refused.code, 1);
    assert.match(refused.out, /not yours: held by music-garden-6/);
    assert.strictEqual(lock(sb, "music-garden-6", "release").code, 0);
    assert.strictEqual(lock(sb, "music-garden-6", "status").out, "free");
    assert.strictEqual(lock(sb, "music-garden-4", "acquire").code, 0, "free again for the next session");
    const renames = readFileSync(join(sb.state, "renames.log"), "utf8").trim().split("\n");
    assert.deepStrictEqual(renames.slice(0, 2), [
      "music-garden-6|[GPT] name of music-garden-6",
      "music-garden-6|name of music-garden-6",
    ]);
  } finally { sb.cleanup(); }
});

// A lock left by a session that died holding it, as its acquire wrote it.
const deadLock = (sb, holder) => {
  mkdirSync(sb.env.GPT_LOCK_DIR);
  writeFileSync(join(sb.env.GPT_LOCK_DIR, "owner"), `${holder} 2026-11-11T00:00:00Z\n`);
};
const clearCommand = out => (out.match(/^ *(rm -rf ".*")$/m) || [])[1];

test("gpt-lock: a dead holder's lock is never broken automatically; busy, status and wait print how to clear it", { skip }, () => {
  const sb = sandbox();
  try {
    sb.sessions(["music-garden-6"]);                                  // 3 has ended: AO no longer lists it
    deadLock(sb, "music-garden-3");
    const busy = lock(sb, "music-garden-6", "acquire");
    assert.strictEqual(busy.code, 75, busy.out);
    assert.match(busy.out, /^busy: held by music-garden-3 2026-11-11T00:00:00Z\n  stuck\? once music-garden-3 is gone from `ao session ls` and `ao review ls music-garden-3` shows no run still going, clear it:\n  rm -rf "/);
    const status = lock(sb, "music-garden-6", "status");
    assert.match(status.out, /^held by music-garden-3 /);
    assert.strictEqual(clearCommand(status.out), clearCommand(busy.out));
    sb.env.GPT_LOCK_TRIES = "3";
    const w = lock(sb, "music-garden-6", "wait");
    assert.strictEqual(w.code, 75, w.out);
    assert.match(w.out, /rm -rf ".*"\ngave up after 3 tries$/);
    assert.ok(existsSync(join(sb.env.GPT_LOCK_DIR, "owner")), "still there after every try");
    // the owner clears it by hand, with the printed command
    const rm = spawnSync(bash, ["-c", clearCommand(status.out)], { env: sb.env, encoding: "utf8" });
    assert.strictEqual(rm.status, 0, rm.stderr);
    assert.strictEqual(lock(sb, "music-garden-6", "status").out, "free");
    assert.strictEqual(lock(sb, "music-garden-6", "acquire").out, "acquired");
  } finally { sb.cleanup(); }
});

test("gpt-lock: a lock whose claim is not yet written reads as held, never free, and is not yours", { skip }, () => {
  const sb = sandbox();
  try {
    sb.sessions(["music-garden-6"]);
    mkdirSync(sb.env.GPT_LOCK_DIR);                                   // mkdir done, owner not yet written
    assert.match(lock(sb, "music-garden-6", "status").out, /^held by a session still writing its claim\n/);
    const busy = lock(sb, "music-garden-6", "acquire");
    assert.strictEqual(busy.code, 75, busy.out);
    assert.match(busy.out, /^busy: held by a session still writing its claim\n/);
    assert.strictEqual(lock(sb, "music-garden-6", "release").code, 1);
    writeFileSync(join(sb.env.GPT_LOCK_DIR, "owner"), "");             // claim created, not yet written
    assert.match(lock(sb, "music-garden-6", "status").out, /^held by a session still writing its claim\n/);
    assert.match(lock(sb, "music-garden-6", "acquire").out, /^busy: held by a session still writing its claim\n/);
  } finally { sb.cleanup(); }
});

// Windows refuses to remove a directory that a running process has as its working directory.
test("gpt-lock: a release that cannot remove the lock exits 1, and the lock still names its holder", {
  skip: skip || (process.platform !== "win32" && "a busy directory blocks removal only on Windows"),
}, async () => {
  const sb = sandbox();
  let squatter;
  try {
    sb.sessions(["music-garden-6", "music-garden-9"]);
    assert.strictEqual(lock(sb, "music-garden-6", "acquire").code, 0);
    squatter = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], { cwd: sb.env.GPT_LOCK_DIR, stdio: "ignore" });
    await new Promise(r => squatter.once("spawn", r));
    const r = lock(sb, "music-garden-6", "release");
    assert.strictEqual(r.code, 1, r.out);
    assert.match(r.out, /error: could not remove .*; it is still held by music-garden-6/);
    assert.match(lock(sb, "music-garden-9", "status").out, /^held by music-garden-6 /);
    assert.strictEqual(lock(sb, "music-garden-9", "acquire").code, 75);
    squatter.kill(); await new Promise(r => squatter.once("exit", r)); squatter = null;
    assert.strictEqual(lock(sb, "music-garden-6", "release").code, 0, "and once nothing holds it open, it releases");
  } finally { if (squatter) squatter.kill(); sb.cleanup(); }
});

test("gpt-lock: a lock it cannot create is an error, not contention — acquire and wait exit 1 at once", { skip }, () => {
  const sb = sandbox();
  try {
    sb.sessions(["music-garden-6"]);
    sb.env.GPT_LOCK_DIR = join(sb.dir, "no-such-dir", "lock");
    const r = lock(sb, "music-garden-6", "acquire");
    assert.strictEqual(r.code, 1, r.out);
    assert.match(r.out, /^error: could not create /);
    sb.env.GPT_LOCK_TRIES = "3";
    const w = lock(sb, "music-garden-6", "wait");
    assert.strictEqual(w.code, 1, w.out);
    assert.doesNotMatch(w.out, /gave up/);
  } finally { sb.cleanup(); }
});

test("gpt-lock: wait acquires once the holder releases, and gives up busy after its tries", { skip }, () => {
  const sb = sandbox();
  try {
    sb.sessions(["music-garden-4", "music-garden-6"]);
    assert.strictEqual(lock(sb, "music-garden-4", "acquire").code, 0);
    sb.env.GPT_LOCK_TRIES = "3";                      // 90 in use; 3 here, for speed
    const gaveUp = lock(sb, "music-garden-6", "wait");
    assert.strictEqual(gaveUp.code, 75);
    assert.match(gaveUp.out, /gave up after 3 tries/);
    lock(sb, "music-garden-4", "release");
    assert.strictEqual(lock(sb, "music-garden-6", "wait").code, 0);
  } finally { sb.cleanup(); }
});

// --- the review poller, as pr-review.md prints it ---

const poller = (() => {
  // autocrlf checks the doc out with CRLF on Windows; the block must still be found, and run as LF
  const doc = readFileSync(join(root, ".claude/skills/work-ticket/pr-review.md"), "utf8").replace(/\r\n/g, "\n");
  const m = doc.match(/```bash\n(pr=<n>;[\s\S]*?)```/);
  assert.ok(m, "pr-review.md holds the poller block");
  return m[1].replace("pr=<n>;", "pr=88;");
})();

const review = (status, verdict, sha = "abc123", pr = 88) =>
  JSON.stringify({ reviews: [{ prNumber: pr, latestRun: { id: "r1", status, verdict, targetSha: sha } }] });

function poll(responses, script = poller) {
  const sb = sandbox();
  try {
    responses.forEach((r, i) => {
      const n = i + 1;
      if (r.fail) writeFileSync(join(sb.state, `review${n}.fail`), r.fail);
      else writeFileSync(join(sb.state, `review${n}.json`), r);
    });
    const res = spawnSync(bash, ["-c", PRELUDE + script], { env: { ...sb.env, AO_SESSION_ID: "music-garden-6" }, encoding: "utf8" });
    const calls = Number(readFileSync(join(sb.state, "n"), "utf8"));
    return { code: res.status, out: res.stdout.trim(), calls };
  } finally { sb.cleanup(); }
}

test("poller: an approval on the current head prints its status line and exits 0", { skip }, () => {
  assert.deepStrictEqual(poll([review("completed", "approved")]), { code: 0, out: "completed approved r1", calls: 1 });
});

test("poller: running, then none, then a verdict on an older head keep it waiting", { skip }, () => {
  const r = poll([review("running"), JSON.stringify({ reviews: [] }), review("completed", "approved", "old999"),
    review("completed", "changes_requested")]);
  assert.deepStrictEqual(r, { code: 0, out: "completed changes_requested r1", calls: 4 });
});

test("poller: a failed run is reported, not waited on", { skip }, () => {
  assert.deepStrictEqual(poll([review("running"), review("failed")]), { code: 0, out: "failed - r1", calls: 2 });
});

test("poller: one ao failure is tolerated; two in a row exit 1 with the error", { skip }, () => {
  assert.strictEqual(poll([{ fail: "blip" }, review("completed", "approved")]).out, "completed approved r1");
  const r = poll([{ fail: "boom one" }, { fail: "boom two" }]);
  assert.strictEqual(r.code, 1);
  assert.match(r.out, /^error: boom two/);
  assert.strictEqual(r.calls, 2, "no third call after the retry");
});

test("poller: unreadable output counts as a failure — nonzero after two in a row", { skip }, () => {
  const r = poll(["not json", "still not json"]);
  assert.strictEqual(r.code, 1);
  assert.match(r.out, /^error: /);
  assert.strictEqual(poll(["not json", review("completed", "approved")]).code, 0, "a single bad read is retried");
});

test("poller: failures separated by a healthy read do not add up", { skip }, () => {
  const r = poll([{ fail: "a" }, review("running"), { fail: "b" }, review("completed", "approved")]);
  assert.deepStrictEqual(r, { code: 0, out: "completed approved r1", calls: 4 });
});

test("poller: no run for the head within the hour times out with exit 1", { skip }, () => {
  assert.ok(poller.includes("for i in $(seq 60); do"), "about an hour: 60 polls a minute apart");
  const short = poller.replace("seq 60", "seq 4");    // the same loop, shortened for speed
  assert.deepStrictEqual(poll([JSON.stringify({ reviews: [] })], short), { code: 1, out: "timeout", calls: 4 });
});

// --- the test-output recipe, as CLAUDE.md § Working lean prints it ---

const recipe = (() => {
  const doc = readFileSync(join(root, "CLAUDE.md"), "utf8").replace(/\r\n/g, "\n");
  const m = doc.match(/```bash\n((?: *log="\$\{TMPDIR[\s\S]*?))```/);
  assert.ok(m, "CLAUDE.md holds the test-output recipe");
  const block = m[1].replace(/^ {2}/gm, "");
  assert.ok(block.includes('node --test "tests/*.test.mjs"'), "the recipe runs the suite");
  return block.replace('node --test "tests/*.test.mjs"', "fake_suite");
})();

// fake_suite: 30 passing lines, then (when FAKE_FAIL is set) a failure whose diagnostics run 40 lines
// and end in a sentinel, then a summary; exit 1 on failure.
const FAKE_SUITE = `fake_suite() {
  for i in $(seq 30); do echo "✔ passing $i of $AO_SESSION_ID (1ms)"; done
  if [ -n "\${FAKE_FAIL:-}" ]; then
    echo "✖ the failing test"; for i in $(seq 40); do echo "  diagnostic line $i"; done
    echo "  LATE-SENTINEL $AO_SESSION_ID"; echo "ℹ pass 30"; echo "ℹ fail 1"; return 1
  fi
  echo "ℹ pass 30"; echo "ℹ fail 0"
}
`;

function runRecipe(sb, session, fail) {
  return new Promise(resolve => {
    const p = spawn(bash, ["-c", PRELUDE + FAKE_SUITE + recipe],
      { env: { ...sb.env, AO_SESSION_ID: session, ...(fail ? { FAKE_FAIL: "1" } : {}) } });
    let out = "";
    p.stdout.on("data", d => out += d); p.stderr.on("data", d => out += d);
    p.on("close", code => resolve({ code, out: out.trim() }));
  });
}

test("test-output recipe: a failure prints every diagnostic line and fails; a pass prints the summary", { skip }, async () => {
  const sb = sandbox();
  try {
    const bad = await runRecipe(sb, "music-garden-7", true);
    assert.strictEqual(bad.code, 1, bad.out);
    assert.match(bad.out, /diagnostic line 40\n {2}LATE-SENTINEL music-garden-7/);
    assert.doesNotMatch(bad.out, /✔/, "passing lines are left out");
    assert.match(bad.out, /exit 1$/);
    const good = await runRecipe(sb, "music-garden-7", false);
    assert.strictEqual(good.code, 0, good.out);
    assert.ok(good.out.split("\n").length <= 9, good.out);
    assert.match(good.out, /ℹ fail 0\nexit 0$/);
  } finally { sb.cleanup(); }
});

test("test-output recipe: two sessions at once write separate logs", { skip }, async () => {
  const sb = sandbox();
  try {
    const [a, b] = await Promise.all([runRecipe(sb, "music-garden-4", true), runRecipe(sb, "music-garden-6", false)]);
    assert.deepStrictEqual([a.code, b.code], [1, 0]);
    const logA = readFileSync(join(sb.dir, "test-music-garden-4.log"), "utf8");
    const logB = readFileSync(join(sb.dir, "test-music-garden-6.log"), "utf8");
    assert.ok(logA.includes("LATE-SENTINEL music-garden-4") && !logA.includes("music-garden-6"));
    assert.ok(!logB.includes("LATE-SENTINEL") && !logB.includes("music-garden-4"));
  } finally { sb.cleanup(); }
});

// --- ask.sh, against a stub codex: never the real one, whose every call spends the ChatGPT limit ---

const askScript = join(root, ".claude/gpt/ask.sh");
const events = (...objs) => objs.map(o => JSON.stringify(o)).join("\n") + "\n";
const LIMIT = "You've hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit "
  + "https://chatgpt.com/codex/settings/usage to purchase more credits or try again at Nov 11th, 2026 2:49 AM.";
const started = { type: "thread.started", thread_id: "t-new" };

// A copy of ask.sh runs from the sandbox, so its .last-* and .thread-id files never touch the
// worktree's. The stub codex logs each call, plays back $FAKE_STATE/<fresh|resume>.events on stdout,
// writes <kind>.answer to the -o file, and exits with <kind>.exit.
function ask({ mode = "fresh", fresh = {}, resume, threadId } = {}) {
  const sb = sandbox();
  try {
    writeFileSync(join(sb.dir, "bin", "codex"), `#!/usr/bin/env bash
s="$FAKE_STATE"; echo "$*" >> "$s/codex.calls"
kind=fresh; [ "$2" = "resume" ] && kind=resume
out=""; prev=""; for a in "$@"; do [ "$prev" = "-o" ] && out="$a"; prev="$a"; done
cat > /dev/null
[ -e "$s/$kind.events" ] && cat "$s/$kind.events"
[ -e "$s/$kind.answer" ] && cat "$s/$kind.answer" > "$out"
exit "$(cat "$s/$kind.exit" 2>/dev/null || echo 0)"
`, { mode: 0o755 });
    const which = spawnSync(bash, ["-c", PRELUDE + "command -v codex"], { env: sb.env, encoding: "utf8" }).stdout.trim();
    assert.strictEqual(which, sb.env.FAKE_BIN + "/codex", "the stub codex is first on PATH");
    for (const [kind, r] of Object.entries({ fresh, resume })) {
      if (!r) continue;
      if (r.events) writeFileSync(join(sb.state, `${kind}.events`), r.events);
      if (r.answer != null) writeFileSync(join(sb.state, `${kind}.answer`), r.answer);
      writeFileSync(join(sb.state, `${kind}.exit`), String(r.exit ?? 0));
    }
    const gpt = join(sb.dir, "gpt");
    mkdirSync(gpt);
    copyFileSync(askScript, join(gpt, "ask.sh"));
    writeFileSync(join(gpt, "prompt.txt"), "the prompt\n");
    if (threadId) writeFileSync(join(gpt, ".thread-id"), threadId);
    const res = spawnSync(bash, runScript(join(gpt, "ask.sh"), mode, "read-only", "gpt-6.2-astra", posix(join(gpt, "prompt.txt"))),
      { env: sb.env, encoding: "utf8" });
    const callsFile = join(sb.state, "codex.calls"), idFile = join(gpt, ".thread-id");
    return {
      code: res.status, out: res.stdout, err: res.stderr.trim(),
      calls: existsSync(callsFile) ? readFileSync(callsFile, "utf8").split("\n").filter(Boolean) : [],
      threadId: existsSync(idFile) ? readFileSync(idFile, "utf8") : null,
    };
  } finally { sb.cleanup(); }
}

test("ask.sh: at the usage limit it exits 69 with one stderr line naming the reset time, and calls codex once", { skip }, () => {
  const r = ask({ fresh: { exit: 1, events: events(started, { type: "turn.started" },
    { type: "error", message: LIMIT }, { type: "turn.failed", error: { message: LIMIT } }) } });
  assert.strictEqual(r.code, 69, r.err);
  assert.strictEqual(r.out, "");
  assert.strictEqual(r.err.split("\n").length, 1, "one line: " + r.err);
  assert.match(r.err, /^ask\.sh: usage limit — try again at Nov 11th, 2026 2:49 AM \(codex exit 1\)$/);
  assert.strictEqual(r.calls.length, 1, "no retry");
});

test("ask.sh: a usage limit with no reset time still exits 69, and quotes codex's message", { skip }, () => {
  const r = ask({ fresh: { exit: 1, events: events(started, { type: "error", message: "You've hit your usage limit." }) } });
  assert.strictEqual(r.code, 69, r.err);
  assert.strictEqual(r.err.split("\n").length, 1, "one line: " + r.err);
  assert.match(r.err, /usage limit — codex gave no reset time \(codex exit 1\): You've hit your usage limit\.$/);
});

test("ask.sh: another codex failure exits 1 with codex's exit status and its error message, once", { skip }, () => {
  const msg = "stream disconnected before completion: connection reset";
  const r = ask({ fresh: { exit: 1, events: events(started, { type: "error", message: msg },
    { type: "turn.failed", error: { message: msg } }) } });
  assert.strictEqual(r.code, 1);
  assert.strictEqual(r.out, "");
  assert.match(r.err, /codex failed \(exit 1\)/);
  assert.strictEqual(r.err.split(msg).length - 1, 1, "the message, de-duplicated: " + r.err);
  assert.match(r.err, /^ask\.sh:   stream disconnected before completion: connection reset$/m);
  assert.doesNotMatch(r.err, /usage limit/);
});

test("ask.sh: a model refusal exits 1 with codex's error, after one call on the model it was given", { skip }, () => {
  // The refusal codex printed on 2026-11-19 for gpt-6.2-astra on CLI 0.155.1 (TUN-120): ask.sh must not
  // retry it or fall back to another model.
  const msg = JSON.stringify({ type: "error", status: 400, error: { type: "invalid_request_error",
    message: "The 'gpt-6.2-astra' model is not supported when using Codex with a ChatGPT account.", code: "model_not_found" } });
  const r = ask({ fresh: { exit: 1, events: events(started, { type: "error", message: msg },
    { type: "turn.failed", error: { message: msg } }) } });
  assert.strictEqual(r.code, 1, r.err);
  assert.strictEqual(r.out, "");
  assert.match(r.err, /codex failed \(exit 1\)/);
  assert.ok(r.err.includes("model_not_found") && r.err.includes("is not supported"), r.err);
  assert.doesNotMatch(r.err, /usage limit/);
  assert.strictEqual(r.calls.length, 1, "no retry: " + r.calls.join(" | "));
  assert.deepStrictEqual([...r.calls[0].matchAll(/(?:^| )(?:-m|--model) (\S+)/g)].map(m => m[1]), ["gpt-6.2-astra"]);
});

test("ask.sh: a codex failure with no error event exits 1 and prints the last events", { skip }, () => {
  const r = ask({ fresh: { exit: 3, events: events(started, { type: "turn.started" }) } });
  assert.strictEqual(r.code, 1, r.err);
  assert.match(r.err, /codex failed \(exit 3\)/);
  assert.match(r.err, /"turn\.started"/);
});

test("ask.sh: success prints only the answer on stdout, and the token usage on stderr", { skip }, () => {
  const r = ask({ fresh: { answer: "Approved on abc123.\nNo findings.", events: events(started,
    { type: "turn.completed", usage: { input_tokens: 100, cached_input_tokens: 40, output_tokens: 7 } }) } });
  assert.strictEqual(r.code, 0, r.err);
  assert.strictEqual(r.out, "Approved on abc123.\nNo findings.\n");
  assert.match(r.err, /ask\.sh: usage in=100 \(cached 40\) out=7/);
});

test("ask.sh: an empty answer with codex exiting 0 says GPT returned no message and exits 1", { skip }, () => {
  const r = ask({ fresh: { events: events(started, { type: "turn.completed", usage: {} }) } });
  assert.strictEqual(r.code, 1);
  assert.strictEqual(r.out, "");
  assert.match(r.err, /GPT returned no message\. Last events:\n[\s\S]*"turn\.completed"/);
});

test("ask.sh: thread mode falls back to a fresh call when the resume fails, and reports a limit there", { skip }, () => {
  const resume = { exit: 1, events: events({ type: "error", message: "thread not found" }) };
  const ok = ask({ mode: "thread", threadId: "t-old", resume, fresh: { answer: "fine", events: events(started) } });
  assert.strictEqual(ok.code, 0, ok.err);
  assert.strictEqual(ok.out, "fine\n");
  assert.match(ok.err, /resume failed/);
  assert.deepStrictEqual(ok.calls.map(c => c.split(" ").slice(0, 3).join(" ")), ["exec resume t-old", "exec --profile claudecollab"]);
  const limit = ask({ mode: "thread", threadId: "t-old", resume, fresh: { exit: 1, events: events({ type: "error", message: LIMIT }) } });
  assert.strictEqual(limit.code, 69, limit.err);
  assert.match(limit.err, /usage limit — try again at Nov 11th, 2026 2:49 AM/);
  assert.strictEqual(limit.calls.length, 2);
});

test("ask.sh: an empty answer whose events name the usage limit still exits 69", { skip }, () => {
  const r = ask({ fresh: { events: events(started, { type: "turn.failed", error: { message: LIMIT } }) } });
  assert.strictEqual(r.code, 69, r.err);
  assert.match(r.err, /^ask\.sh: usage limit — try again at Nov 11th, 2026 2:49 AM \(codex exit 0\)$/);
});

test("ask.sh: a resume that hits the usage limit exits 69 without a fresh call", { skip }, () => {
  const r = ask({ mode: "thread", threadId: "t-old", resume: { exit: 1, events: events({ type: "error", message: LIMIT }) },
    fresh: { answer: "should never run", events: events(started) } });
  assert.strictEqual(r.code, 69, r.err);
  assert.strictEqual(r.out, "");
  assert.strictEqual(r.err, "ask.sh: usage limit — try again at Nov 11th, 2026 2:49 AM (codex exit 1)");
  assert.deepStrictEqual(r.calls.map(c => c.split(" ").slice(0, 3).join(" ")), ["exec resume t-old"], "no fresh retry");
});

test("ask.sh: a reset time in a later limit message wins over an earlier one without it", { skip }, () => {
  const r = ask({ fresh: { exit: 7, events: events(started, { type: "error", message: "You've hit your usage limit." },
    { type: "turn.failed", error: { message: LIMIT } }) } });
  assert.strictEqual(r.code, 69, r.err);
  assert.strictEqual(r.out, "");
  assert.strictEqual(r.err, "ask.sh: usage limit — try again at Nov 11th, 2026 2:49 AM (codex exit 7)");
});

test("ask.sh: a reset time keeps its own periods, timezone and date", { skip }, () => {
  const r = ask({ fresh: { exit: 1, events: events(
    { type: "error", message: "Usage limit reached. Please try again at 2:49 a.m. CST on November 11, 2026." }) } });
  assert.strictEqual(r.code, 69, r.err);
  assert.strictEqual(r.out, "");
  assert.strictEqual(r.err, "ask.sh: usage limit — try again at 2:49 a.m. CST on November 11, 2026 (codex exit 1)");
});

test("ask.sh: the limit is found in an error item, and in an unfamiliar failure event, in any case", { skip }, () => {
  const msg = "Usage Limit reached. Try again in 3 hours.";
  for (const ev of [{ type: "item.completed", item: { type: "error", message: msg } },
    { type: "request.failed", error: msg }, { type: "request.failed", error: { message: msg } }]) {
    const r = ask({ fresh: { exit: 7, events: events(started, ev) } });
    assert.strictEqual(r.code, 69, JSON.stringify(ev) + ": " + r.err);
    assert.strictEqual(r.out, "");
    assert.strictEqual(r.err, "ask.sh: usage limit — try again in 3 hours (codex exit 7)", JSON.stringify(ev));
  }
});

test("ask.sh: a failure prints each distinct error once, skips bad lines, and never the partial answer", { skip }, () => {
  const a = "first problem", b = "second problem";
  const r = ask({ fresh: { exit: 42, answer: "partial answer",
    events: events(started, { type: "error", message: a }) + "not json\n" + events({ type: "error", message: b },
      { type: "turn.failed", error: { message: a } }) } });
  assert.strictEqual(r.code, 1, r.err);
  assert.strictEqual(r.out, "");
  assert.doesNotMatch(r.err, /partial answer/);
  assert.match(r.err, /^ask\.sh: codex failed \(exit 42\):$/m);
  for (const m of [a, b]) assert.strictEqual(r.err.split(m).length - 1, 1, m + ", once: " + r.err);
});

test("ask.sh: a failure with unparseable or no events still says so, with the last five lines", { skip }, () => {
  const lines = Array.from({ length: 7 }, (_, i) => `plain line ${i + 1}`);
  const r = ask({ fresh: { exit: 3, events: lines.join("\n") + "\n" } });
  assert.strictEqual(r.code, 1, r.err);
  assert.strictEqual(r.out, "");
  assert.match(r.err, /^ask\.sh: codex failed \(exit 3\) with no error event\. Last events:$/m);
  assert.ok(lines.slice(2).every(l => r.err.includes(l)) && !/plain line [12]$/m.test(r.err), r.err);
  const none = ask({ fresh: { exit: 3 } });
  assert.strictEqual(none.code, 1, none.err);
  assert.strictEqual(none.out, "");
  assert.strictEqual(none.err, "ask.sh: codex failed (exit 3) with no error event. Last events:");
});

test("ask.sh: thread mode answers from a resume and keeps its id, or from a fresh call and saves the new one", { skip }, () => {
  const usage = { type: "turn.completed", usage: { input_tokens: 9, cached_input_tokens: 4, output_tokens: 2 } };
  const resumed = ask({ mode: "thread", threadId: "t-old", resume: { answer: "resumed answer", events: events(usage) },
    fresh: { answer: "should never run", events: events(started) } });
  assert.strictEqual(resumed.code, 0, resumed.err);
  assert.strictEqual(resumed.out, "resumed answer\n");
  assert.match(resumed.err, /ask\.sh: usage in=9 \(cached 4\) out=2/);
  assert.deepStrictEqual(resumed.calls.map(c => c.split(" ").slice(0, 3).join(" ")), ["exec resume t-old"]);
  assert.strictEqual(resumed.threadId, "t-old");
  const first = ask({ mode: "thread", fresh: { answer: "fresh answer", events: events(started, usage) } });
  assert.strictEqual(first.code, 0, first.err);
  assert.strictEqual(first.out, "fresh answer\n");
  assert.deepStrictEqual(first.calls.map(c => c.split(" ").slice(0, 2).join(" ")), ["exec --profile"]);
  assert.strictEqual(first.threadId, "t-new");
});

test("ask.sh: with no codex on PATH it exits 127 and says so", { skip }, () => {
  const sb = sandbox();
  try {
    const gpt = join(sb.dir, "gpt");
    mkdirSync(gpt);
    copyFileSync(askScript, join(gpt, "ask.sh"));
    writeFileSync(join(gpt, "prompt.txt"), "the prompt\n");
    const bare = "PATH=/usr/bin:/bin; ";
    const which = spawnSync(bash, ["-c", bare + "command -v codex || echo none"], { env: sb.env, encoding: "utf8" }).stdout.trim();
    assert.strictEqual(which, "none", "no codex on the bare PATH");
    const r = spawnSync(bash, ["-c", bare + 'exec "$BASH" "$@"', "_", join(gpt, "ask.sh"), "fresh", "read-only", "gpt-6.2-astra",
      posix(join(gpt, "prompt.txt"))], { env: sb.env, encoding: "utf8" });
    assert.strictEqual(r.status, 127, r.stderr);
    assert.strictEqual(r.stdout, "");
    assert.strictEqual(r.stderr.trim(), "ask.sh: codex CLI not on PATH");
  } finally { sb.cleanup(); }
});

// --- the preview finder, as work-ticket/browser.md prints it (TUN-85) ---
// Its jq filters run inside gh, which this fake does not: they were run against live PRs (#139, #141,
// both with Netlify's checks beside Cloudflare's — reviews/TUN-85-retire-netlify.md). The fake answers
// what those filters print — the Cloudflare check's bucket, and one flattened body per Cloudflare
// comment — so what is tested here is the script's own logic: which check state ends the wait, which
// comment names the head, which URL is taken, and that no preview never exits 0.

const previewFinder = (() => {
  const doc = readFileSync(join(root, ".claude/skills/work-ticket/browser.md"), "utf8").replace(/\r\n/g, "\n");
  const m = doc.match(/```bash\n {2}(pr=<n>; head=[\s\S]*?)\n {2}```/);
  assert.ok(m, "browser.md holds the preview block");
  return m[1].replace(/^ {2}/gm, "").replace("pr=<n>;", "pr=141;") + "\n";
})();

const HEAD = "b9f98d654538c77828a2d4cba8c58e27fa0b01da";
// One Cloudflare comment, flattened as the filter prints it: commit, commit preview, branch preview.
const cfComment = (sha, hash, branch) => `## Deploying music-garden with Cloudflare Pages <table><tr><td><strong>Latest commit:</strong> </td><td> <code>${sha.slice(0, 7)}</code> </td></tr> <tr><td><strong>Preview URL:</strong></td><td> <a href='https://${hash}.music-garden.pages.dev'>https://${hash}.music-garden.pages.dev</a> </td></tr> <tr><td><strong>Branch Preview URL:</strong></td><td> <a href='https://${branch}.music-garden.pages.dev'>https://${branch}.music-garden.pages.dev</a> </td></tr> </table>`;

// What each fake gh call prints, per call (the last repeats): checks — the Cloudflare check's bucket
// ("" when there is none); comments — one flattened body per Cloudflare comment. "FAIL:<message>" makes
// that call print the message to stderr and exit 1, as gh does. fork — what isCrossRepository prints.
function findPreview({ checks = ["pass"], comments = [cfComment(HEAD, "9867f21c", "ao-x-root")], headFails = false, fork = "false", script = previewFinder }) {
  const sb = sandbox();
  try {
    writeFileSync(join(sb.dir, "bin", "gh"), `#!/usr/bin/env bash
s="$FAKE_STATE"
pick() { n=$(( $(cat "$s/$1.n" 2>/dev/null || echo 0) + 1 )); echo $n > "$s/$1.n"
  while [ $n -gt 1 ] && [ ! -e "$s/$1$n" ]; do n=$((n-1)); done
  if grep -q '^FAIL:' "$s/$1$n"; then sed 's/^FAIL://' "$s/$1$n" >&2; exit 1; fi; cat "$s/$1$n"; }
case "$1 $2 $5" in
  "pr view headRefOid") [ -e "$s/head.fail" ] && { echo "gh: boom" >&2; exit 1; }; echo "${HEAD}" ;;
  "pr view isCrossRepository") echo "$(cat "$s/fork")" ;;
  "pr view comments") pick comments ;;
  "pr checks name,bucket") pick checks ;;
  *) echo "fake gh: unexpected $*" >&2; exit 2 ;;
esac
`, { mode: 0o755 });
    checks.forEach((c, i) => writeFileSync(join(sb.state, `checks${i + 1}`), c ? c + "\n" : ""));
    comments.forEach((c, i) => writeFileSync(join(sb.state, `comments${i + 1}`), c ? c + "\n" : ""));
    writeFileSync(join(sb.state, "fork"), fork);
    if (headFails) writeFileSync(join(sb.state, "head.fail"), "");
    const res = spawnSync(bash, ["-c", PRELUDE + script], { env: sb.env, encoding: "utf8" });
    const calls = k => existsSync(join(sb.state, `${k}.n`)) ? Number(readFileSync(join(sb.state, `${k}.n`), "utf8")) : 0;
    return { code: res.status, out: res.stdout.trim(), checks: calls("checks"), comments: calls("comments") };
  } finally { sb.cleanup(); }
}
const short40 = () => { assert.ok(previewFinder.includes("for i in $(seq 40); do"), "about 20 minutes: 40 polls 30 s apart");
  return previewFinder.replace("seq 40", "seq 3"); };   // the same loop, shortened for speed
const NO_CHECKS = "FAIL:no checks reported on the 'feature' branch";

test("preview: waits out a pending check, then prints the branch preview of the comment naming the head", { skip }, () => {
  assert.deepStrictEqual(findPreview({ checks: ["pending", "pending", "pass"] }),
    { code: 0, out: "preview https://ao-x-root.music-garden.pages.dev", checks: 3, comments: 1 });
});

test("preview: a failed, cancelled or skipped Cloudflare build exits 1, says so, and reads no comment", { skip }, () => {
  for (const bucket of ["fail", "cancel", "skipping"])
    assert.deepStrictEqual(findPreview({ checks: ["pending", bucket] }),
      { code: 1, out: `check ${bucket} on b9f98d6: see gh pr checks 141`, checks: 2, comments: 0 });
});

test("preview: a check still pending at the end of the wait exits 1, never 3 or 0", { skip }, () => {
  assert.deepStrictEqual(findPreview({ checks: ["pending"], script: short40() }),
    { code: 1, out: "check still pending on b9f98d6 after 20 minutes", checks: 3, comments: 0 });
});

test("preview: no Cloudflare check is a fork PR (exit 3) only when GitHub says it is a fork", { skip }, () => {
  const script = short40();
  for (const checks of [[""], [NO_CHECKS]]) {   // other checks but no Cloudflare one; no checks at all
    assert.deepStrictEqual(findPreview({ checks, fork: "true", script }),
      { code: 3, out: "fork PR: Cloudflare builds no preview for it", checks: 3, comments: 0 });
    assert.deepStrictEqual(findPreview({ checks, fork: "false", script }),
      { code: 1, out: "no Cloudflare Pages check on b9f98d6 after 20 minutes", checks: 3, comments: 0 });
  }
});

test("preview: gh failing — on the head, the checks or the comments — exits 1 with an error, never a hand-off reason", { skip }, () => {
  assert.deepStrictEqual(findPreview({ headFails: true }), { code: 1, out: "error: gh pr view failed", checks: 0, comments: 0 });
  assert.deepStrictEqual(findPreview({ checks: ["pending", "FAIL:HTTP 502: Bad Gateway"] }),
    { code: 1, out: "error: gh pr checks: HTTP 502: Bad Gateway", checks: 2, comments: 0 });
  assert.deepStrictEqual(findPreview({ comments: ["FAIL:HTTP 502: Bad Gateway"] }),
    { code: 1, out: "error: gh pr view comments failed", checks: 1, comments: 1 });
});

test("preview: only a stale comment, or none, exits 1 — and a comment rewritten for the head on a retry is taken", { skip }, () => {
  const stale = cfComment("0123456789abcdef", "aaaa1111", "ao-x-root");
  assert.deepStrictEqual(findPreview({ comments: [stale] }), { code: 1, out: "no Cloudflare comment names b9f98d6", checks: 1, comments: 5 });
  assert.deepStrictEqual(findPreview({ comments: [""] }), { code: 1, out: "no Cloudflare comment names b9f98d6", checks: 1, comments: 5 });
  assert.deepStrictEqual(findPreview({ comments: [stale, cfComment(HEAD, "9867f21c", "ao-x-root")] }),
    { code: 0, out: "preview https://ao-x-root.music-garden.pages.dev", checks: 1, comments: 2 });
});

test("preview: of several comments, the head's music-garden comment wins, wherever it sits", { skip }, () => {
  const head = cfComment(HEAD, "9867f21c", "ao-head-root"), stale = cfComment("0123456789abcdef", "aaaa1111", "ao-old-root");
  // Another Pages project's comment naming the same commit (GPT's PR review, round 2, finding 2).
  const other = cfComment(HEAD, "bbbb2222", "ao-head-root").replaceAll("music-garden.pages.dev", "other-project.pages.dev");
  for (const order of [[head, stale], [stale, head], [head, other], [other, head], [stale, head, other]])
    assert.strictEqual(findPreview({ comments: [order.join("\n")] }).out, "preview https://ao-head-root.music-garden.pages.dev",
      order.length + " comments");
  assert.strictEqual(findPreview({ comments: [other] }).code, 1, "another project's comment alone is no preview");
});

// --- README § Deployment's check for scripts Cloudflare injects into the page (TUN-114) ---
// The block is run as README prints it, with `curl` replaced by a shell function that logs each
// call's arguments, prints the fixture page for the host it was asked for (page.<host>, else page) and
// exits with that host's chosen code (exit.<host>, else $FAKE_CURL_EXIT).

const injectionCheck = (() => {
  const doc = readFileSync(join(root, "README.md"), "utf8").replace(/\r\n/g, "\n");
  const m = doc.match(/\*\*To check from a terminal\*\*[^\n]*\n\n```sh\n([\s\S]*?)```/);
  assert.ok(m, "README § Deployment holds the injection check");
  assert.match(m[1], /curl /, "the check fetches with curl");
  return m[1];
})();

const FAKE_CURL = `curl() {
  printf '%s\n' "$@" "--end-of-call--" >> "$FAKE_STATE/curl-args"
  # only the arguments README uses: -fsS, --compressed, -H <value>, one https:// URL; anything else
  # (another option, a -H with no value, a second URL) is refused as real curl would, with exit 2
  _fh=""; _fv=""; for _fa in "$@"; do
    if [ -n "$_fv" ]; then _fv=""; continue; fi
    case "$_fa" in
      -H) _fv=1 ;;
      -fsS|--compressed) ;;
      https://*) [ -z "$_fh" ] || { echo "fake curl: two URLs" >&2; return 2; }; _fh=\${_fa#https://}; _fh=\${_fh%%/*} ;;
      *) echo "fake curl: unsupported argument $_fa" >&2; return 2 ;;
    esac
  done
  [ -z "$_fv" ] || { echo "fake curl: -H without a value" >&2; return 2; }
  [ -n "$_fh" ] || { echo "fake curl: no URL specified" >&2; return 2; }
  if [ -e "$FAKE_STATE/page.$_fh" ]; then cat "$FAKE_STATE/page.$_fh"; else cat "$FAKE_STATE/page"; fi
  if [ -e "$FAKE_STATE/exit.$_fh" ]; then return "$(cat "$FAKE_STATE/exit.$_fh")"; fi
  return "\${FAKE_CURL_EXIT:-0}"
}
`;

const gamePage = readFileSync(join(root, "index.html"), "utf8");
const beacon = `<script defer src="https://static.cloudflareinsights.com/beacon.min.js/vcd15cbe" data-cf-beacon='{"token":"x"}'></script>`;
const rocket = `<script src="/cdn-cgi/scripts/7d0fa10a/cloudflare-static/rocket-loader.min.js" defer></script>`;
const withBeforeBody = (page, tag) => page.replace("</body>", tag + "</body>");

// perHost: { "<host>": { page, exit } } overrides the shared page and exit code for that host.
function runCheck(sb, page, curlExit = 0, perHost = {}) {
  writeFileSync(join(sb.state, "page"), page);
  for (const f of ["curl-args", ...["tunegarden.game", "www.tunegarden.game"].flatMap(h => ["page." + h, "exit." + h])])
    rmSync(join(sb.state, f), { force: true });
  for (const [host, o] of Object.entries(perHost)) {
    if (o.page !== undefined) writeFileSync(join(sb.state, "page." + host), o.page);
    if (o.exit !== undefined) writeFileSync(join(sb.state, "exit." + host), String(o.exit));
  }
  const r = spawnSync(bash, ["-c", PRELUDE + FAKE_CURL + injectionCheck],
    { env: { ...sb.env, FAKE_CURL_EXIT: String(curlExit) }, encoding: "utf8" });
  const log = existsSync(join(sb.state, "curl-args")) ? readFileSync(join(sb.state, "curl-args"), "utf8") : "";
  // one array of arguments per curl call
  const calls = log.split("--end-of-call--\n").filter(Boolean).map(c => c.replace(/\n$/, "").split("\n"));
  return { code: r.status, lines: r.stdout.trim().split("\n"), err: r.stderr, calls };
}

const verdicts = res => res.lines.map(l => l.split(":")[0]);

test("injection check: the game page as deployed reads clean on both custom domains", { skip }, () => {
  const sb = sandbox();
  try {
    const res = runCheck(sb, gamePage);
    assert.deepStrictEqual(verdicts(res), ["clean", "clean"], res.lines.join("\n") + res.err);
    assert.match(res.lines[0], /^clean: https:\/\/tunegarden\.game\/ \(game scripts: [1-9]\d*, injected lines: 0\)$/);
    assert.match(res.lines[1], /^clean: https:\/\/www\.tunegarden\.game\//);
  } finally { sb.cleanup(); }
});

test("injection check: each domain is fetched once, as a browser does, failing on HTTP errors", { skip }, () => {
  const sb = sandbox();
  try {
    const { calls } = runCheck(sb, gamePage);
    assert.strictEqual(calls.length, 2, JSON.stringify(calls));
    ["https://tunegarden.game/", "https://www.tunegarden.game/"].forEach((url, i) => {
      const args = calls[i];
      // only the arguments README uses, read as curl reads them: -H takes the next one as its value;
      // -fsS and --compressed are flags; anything else that starts with - (another option, which may
      // swallow the URL) or a -H with nothing after it fails; what is left is the destination
      const headers = [], flags = [], destinations = [];
      for (let j = 0; j < args.length; j++) {
        if (args[j] === "-H") {
          assert.ok(j + 1 < args.length, `call ${i + 1}: -H without a value: ${JSON.stringify(args)}`);
          headers.push(args[++j]);
        } else if (args[j] === "-fsS" || args[j] === "--compressed") flags.push(args[j]);
        else if (args[j].startsWith("-")) assert.fail(`call ${i + 1}: unsupported option ${args[j]}: ${JSON.stringify(args)}`);
        else destinations.push(args[j]);
      }
      assert.deepStrictEqual(destinations, [url], `call ${i + 1} fetches ${url} only: ${JSON.stringify(args)}`);
      assert.ok(flags.includes("-fsS"), `call ${i + 1}: -fsS`);
      for (const want of ["Accept: text/html", "Sec-Fetch-Dest: document", "Sec-Fetch-Mode: navigate"])
        assert.ok(headers.includes(want), `call ${i + 1} sends -H '${want}': ${JSON.stringify(args)}`);
      assert.ok(headers.some(h => /^User-Agent: Mozilla\/5\.0 .*Chrome\//.test(h)), `call ${i + 1}: a browser User-Agent`);
    });
  } finally { sb.cleanup(); }
});

test("injection check: each domain gets its own verdict", { skip }, () => {
  const sb = sandbox();
  try {
    const injected = runCheck(sb, gamePage, 0, { "www.tunegarden.game": { page: withBeforeBody(gamePage, beacon) } });
    assert.deepStrictEqual(verdicts(injected), ["clean", "INJECTED"], injected.lines.join("\n"));
    assert.match(injected.lines[1], /^INJECTED: https:\/\/www\.tunegarden\.game\//);
    const failed = runCheck(sb, gamePage, 0, { "tunegarden.game": { exit: 18 } });
    assert.deepStrictEqual(verdicts(failed), ["FAILED", "clean"], failed.lines.join("\n"));
    assert.match(failed.lines[0], /^FAILED: https:\/\/tunegarden\.game\//);
  } finally { sb.cleanup(); }
});

test("injection check: RUM's beacon or a same-origin /cdn-cgi/ script reads INJECTED, single-line HTML too", { skip }, () => {
  const sb = sandbox();
  try {
    for (const [name, page] of [
      ["beacon", withBeforeBody(gamePage, beacon)],
      ["rocket loader", withBeforeBody(gamePage, rocket)],
      ["one-line page with beacon", withBeforeBody(gamePage, beacon).replace(/\r?\n/g, " ")],
    ]) {
      const res = runCheck(sb, page);
      assert.deepStrictEqual(verdicts(res), ["INJECTED", "INJECTED"], name + ": " + res.lines.join("\n"));
    }
  } finally { sb.cleanup(); }
});

test("injection check: a failed or partial fetch, or a page that is not the game, never reads clean", { skip }, () => {
  const sb = sandbox();
  try {
    // a transfer cut off after the game's scripts but before an injected footer (curl exit 18)
    const partial = runCheck(sb, gamePage.slice(0, gamePage.indexOf("</body>")), 18);
    assert.deepStrictEqual(verdicts(partial), ["FAILED", "FAILED"], partial.lines.join("\n"));
    // an HTTP error with -f: no body, exit 22; and a connection failure: exit 6
    for (const code of [22, 6])
      assert.deepStrictEqual(verdicts(runCheck(sb, "", code)), ["FAILED", "FAILED"], "curl exit " + code);
    // a 200 that is not the game: an error page, or nothing at all
    for (const page of ["<html><body>Error 1016</body></html>", ""])
      assert.deepStrictEqual(verdicts(runCheck(sb, page)), ["NOT THE GAME PAGE", "NOT THE GAME PAGE"], JSON.stringify(page));
  } finally { sb.cleanup(); }
});

// --- README § Deployment's check of the cache headers the custom domains send (TUN-134) ---
// The block is run as README prints it, with `curl` replaced by a shell function that logs each
// call's arguments, prints the header fixture for the URL it was asked for (h.<key>, the URL with
// every other character than a letter or digit turned into _) and exits with that URL's code
// (x.<key>, else $FAKE_CURL_EXIT). No network.

const cacheCheck = (() => {
  const doc = readFileSync(join(root, "README.md"), "utf8").replace(/\r\n/g, "\n");
  const m = doc.match(/\*\*To check the cache headers from a terminal\*\*[^\n]*\n\n```sh\n([\s\S]*?)```/);
  assert.ok(m, "README § Deployment holds the cache-header check");
  return m[1];
})();
const cacheHosts = (cacheCheck.match(/for h in ([^;]+);/) || [, ""])[1].trim().split(/\s+/);
const cachePairs = [...cacheCheck.matchAll(/"(\/[^"|]*)\|([^"]*)"/g)].map(m => ({ path: m[1], want: m[2] }));
const urlKey = u => u.replace(/[^A-Za-z0-9]/g, "_");

const FAKE_CURL_HEAD = `curl() {
  printf '%s\n' "$@" "--end-of-call--" >> "$FAKE_STATE/curl-args"
  # only the arguments README uses: -fsSI and one https:// URL; anything else is refused, exit 2
  _fu=""; for _fa in "$@"; do
    case "$_fa" in
      -fsSI) ;;
      https://*) [ -z "$_fu" ] || { echo "fake curl: two URLs" >&2; return 2; }; _fu=$_fa ;;
      *) echo "fake curl: unsupported argument $_fa" >&2; return 2 ;;
    esac
  done
  [ -n "$_fu" ] || { echo "fake curl: no URL specified" >&2; return 2; }
  _fk=$(printf '%s' "$_fu" | tr -c 'A-Za-z0-9' '_')
  [ -e "$FAKE_STATE/h.$_fk" ] || { echo "fake curl: no fixture for $_fu" >&2; return 7; }
  # the headers first, then the exit code: a transfer can fail after the headers have arrived
  cat "$FAKE_STATE/h.$_fk"
  if [ -e "$FAKE_STATE/x.$_fk" ]; then return "$(cat "$FAKE_STATE/x.$_fk")"; fi
  return "\${FAKE_CURL_EXIT:-0}"
}
`;

// An HTTP/2 response's headers as curl -I prints them: lower-case names, CRLF line ends.
const headResponse = (cacheControls, status = "HTTP/2 200") => [status, "content-type: text/javascript",
  ...cacheControls.map(v => "cache-control: " + v), "x-content-type-options: nosniff", "", ""].join("\r\n");

// over: { "<url>": { cc: [values], raw: "<whole response>", exit } } replaces the response _headers
// would give for that URL.
function runCacheCheck(sb, over = {}, curlExit = 0) {
  for (const f of readdirSync(sb.state)) rmSync(join(sb.state, f), { force: true });
  for (const h of cacheHosts) for (const { path, want } of cachePairs) {
    const u = "https://" + h + path, o = over[u] || {};
    writeFileSync(join(sb.state, "h." + urlKey(u)), o.raw ?? headResponse(o.cc || [want]));
    if (o.exit !== undefined) writeFileSync(join(sb.state, "x." + urlKey(u)), String(o.exit));
  }
  const r = spawnSync(bash, ["-c", PRELUDE + FAKE_CURL_HEAD + cacheCheck],
    { env: { ...sb.env, FAKE_CURL_EXIT: String(curlExit) }, encoding: "utf8" });
  const log = existsSync(join(sb.state, "curl-args")) ? readFileSync(join(sb.state, "curl-args"), "utf8") : "";
  const calls = log.split("--end-of-call--\n").filter(Boolean).map(c => c.replace(/\n$/, "").split("\n"));
  return { code: r.status, lines: r.stdout.trim().split("\n"), err: r.stderr, calls };
}

// The Cache-Control values _headers gives a path: every rule whose pattern matches it (`*` = the rest).
function headersCacheControl(path) {
  const rules = [];
  for (const line of readFileSync(join(root, "_headers"), "utf8").split(/\r?\n/)) {
    if (/^\//.test(line)) rules.push({ pattern: line.trim(), cc: [] });
    else if (/^\s+Cache-Control:/i.test(line) && rules.length) rules.at(-1).cc.push(line.replace(/^\s+Cache-Control:\s*/i, "").trim());
  }
  const matches = p => p.endsWith("*") ? path.startsWith(p.slice(0, -1)) : path === p;
  return { rules, values: rules.filter(r => matches(r.pattern)).flatMap(r => r.cc) };
}

// What is wrong with a probe: a path that is not a file the build publishes (cloudflare-build.sh's
// list), whose 200 would be the index.html fallback or a folder, or an expected value _headers does not set.
const PUBLISHED_FOLDERS = ["js", "voice", "samples", "vendor"];
function probeProblems({ path, want }) {
  const problems = [];
  const file = path === "/" ? "index.html" : path.slice(1);
  const published = path === "/" || PUBLISHED_FOLDERS.includes(file.split("/")[0]);
  const isFile = existsSync(join(root, file)) && statSync(join(root, file)).isFile();
  if (!published || !isFile) problems.push(`${path}: not a file the build publishes`);
  const values = headersCacheControl(path).values;
  if (values.length !== 1 || values[0] !== want) problems.push(`${path}: expects ${want}, _headers sets ${JSON.stringify(values)}`);
  return problems;
}

test("cache check: asks both custom domains, for published files, expecting what _headers sets for each", () => {
  assert.deepStrictEqual(cacheHosts, ["tunegarden.game", "www.tunegarden.game"]);
  assert.ok(cachePairs.some(p => p.path === "/"), "the page is checked");
  // the build's list, so a folder it starts publishing is checked here too
  const build = readFileSync(join(root, "cloudflare-build.sh"), "utf8");
  for (const f of PUBLISHED_FOLDERS) assert.match(build, new RegExp(`\\b${f}\\b`), `cloudflare-build.sh publishes ${f}/`);
  for (const p of cachePairs) assert.deepStrictEqual(probeProblems(p), [], JSON.stringify(p));
  // the probe check itself: a folder, a file the build leaves out, and a wrong value are refused
  const ok = "public, max-age=0, must-revalidate";
  assert.notDeepStrictEqual(probeProblems({ path: "/js/", want: ok }), [], "/js/ is a folder, not a script");
  assert.notDeepStrictEqual(probeProblems({ path: "/js/no-such-file.js", want: ok }), []);
  assert.notDeepStrictEqual(probeProblems({ path: "/README.md", want: ok }), [], "README.md is not published");
  assert.notDeepStrictEqual(probeProblems({ path: "/voice/108fedab.mp3", want: ok }), [], "voice/ is kept 30 days");
  // every folder's cache rule (/<folder>/*) has a file in the check, so a new folder rule earns a line
  for (const { pattern, cc } of headersCacheControl("/").rules.filter(r => /^\/[^/*]+\/\*$/.test(r.pattern) && r.cc.length))
    assert.ok(cachePairs.some(p => p.path.startsWith(pattern.slice(0, -1))), `${pattern} has a file in the check (${cc})`);
});

test("cache check: headers as _headers sets them read ok, each URL fetched once with -fsSI", { skip }, () => {
  const sb = sandbox();
  try {
    const res = runCacheCheck(sb);
    const urls = cacheHosts.flatMap(h => cachePairs.map(p => "https://" + h + p.path));
    assert.strictEqual(res.code, 0, res.err);
    assert.deepStrictEqual(res.lines.map(l => l.split(":")[0]), urls.map(() => "ok"), res.lines.join("\n") + res.err);
    assert.deepStrictEqual(res.lines[0], "ok: https://tunegarden.game/ (Cache-Control: public, max-age=0, must-revalidate)");
    assert.deepStrictEqual(res.calls, urls.map(u => ["-fsSI", u]));
  } finally { sb.cleanup(); }
});

test("cache check: Cloudflare's 4-hour Browser Cache TTL, no header, or two headers read WRONG and say what came", { skip }, () => {
  const sb = sandbox();
  try {
    const js = "https://tunegarden.game/js/cloud.js", voice = "https://www.tunegarden.game/voice/108fedab.mp3",
      vendor = "https://www.tunegarden.game/vendor/cognito/amazon-cognito-identity.min.js";
    const res = runCacheCheck(sb, {
      [js]: { cc: ["public, max-age=14400, must-revalidate"] },
      [voice]: { cc: [] },
      [vendor]: { cc: ["public, max-age=0, must-revalidate", "public, max-age=14400"] },
    });
    const line = u => res.lines.find(l => l.includes(" " + u + " "));
    assert.strictEqual(line(js), `WRONG: ${js} (Cache-Control: public, max-age=14400, must-revalidate)`);
    assert.strictEqual(line(voice), `WRONG: ${voice} (Cache-Control: none)`);
    assert.strictEqual(line(vendor), `WRONG: ${vendor} (Cache-Control: public, max-age=0, must-revalidate;public, max-age=14400)`);
    assert.strictEqual(res.lines.filter(l => l.startsWith("ok:")).length, res.lines.length - 3, res.lines.join("\n"));
  } finally { sb.cleanup(); }
});

test("cache check: a failed fetch reads FAILED, never ok, and only for its own URL", { skip }, () => {
  const sb = sandbox();
  try {
    // an HTTP error with -f (22), no connection (6), a transfer cut off (18)
    for (const code of [22, 6, 18]) {
      const res = runCacheCheck(sb, {}, code);
      assert.ok(res.lines.length === cacheHosts.length * cachePairs.length && res.lines.every(l => l.startsWith("FAILED: ")),
        `curl exit ${code}: ${res.lines.join("\n")}`);
    }
    const u = "https://www.tunegarden.game/samples/glockenspiel.js";
    const one = runCacheCheck(sb, { [u]: { exit: 22 } });
    assert.deepStrictEqual(one.lines.filter(l => !l.startsWith("ok:")), [`FAILED: ${u} (the fetch did not complete)`]);
    // the right headers arrive, then the transfer is cut off (curl exit 18)
    const cut = runCacheCheck(sb, { [u]: { exit: 18 } });
    assert.deepStrictEqual(cut.lines.filter(l => !l.startsWith("ok:")), [`FAILED: ${u} (the fetch did not complete)`]);
  } finally { sb.cleanup(); }
});

test("cache check: a redirect with the right header reads FAILED, never ok; only the final response counts", { skip }, () => {
  const sb = sandbox();
  try {
    const want = "public, max-age=0, must-revalidate";
    const apex = "https://tunegarden.game/js/cloud.js", www = "https://www.tunegarden.game/js/cloud.js";
    const redirected = runCacheCheck(sb, { [www]: { raw: headResponse([want], "HTTP/2 302").replace("\r\n", "\r\nlocation: https://tunegarden.game/js/cloud.js\r\n") } });
    const line = (res, u) => res.lines.find(l => l.includes(" " + u + " "));
    assert.strictEqual(line(redirected, apex), `ok: ${apex} (Cache-Control: ${want})`);
    assert.strictEqual(line(redirected, www), `FAILED: ${www} (answered 302, not 200)`);
    // the header only on an earlier response block (a proxy's), none on the final 200
    const interim = "HTTP/1.1 200 Connection established\r\ncache-control: " + want + "\r\n\r\n" + headResponse([]);
    const proxied = runCacheCheck(sb, { [apex]: { raw: interim } });
    assert.strictEqual(line(proxied, apex), `WRONG: ${apex} (Cache-Control: none)`);
    // a final response with the header and an earlier one without it reads ok
    const later = "HTTP/1.1 200 Connection established\r\n\r\n" + headResponse([want]);
    assert.strictEqual(line(runCacheCheck(sb, { [apex]: { raw: later } }), apex), `ok: ${apex} (Cache-Control: ${want})`);
    // no status line at all
    assert.strictEqual(line(runCacheCheck(sb, { [apex]: { raw: "cache-control: " + want + "\r\n\r\n" } }), apex),
      `FAILED: ${apex} (answered no status, not 200)`);
  } finally { sb.cleanup(); }
});

test("cache check: an HTTP/1.1 header in mixed case, with a tab after the colon and trailing spaces, reads ok", { skip }, () => {
  const sb = sandbox();
  try {
    const u = "https://www.tunegarden.game/voice/108fedab.mp3";
    const raw = "HTTP/1.1 200 OK\r\nContent-Type: audio/mpeg\r\nCache-CONTROL:\tpublic, max-age=2592000 \t\r\n\r\n";
    const res = runCacheCheck(sb, { [u]: { raw } });
    assert.ok(res.lines.every(l => l.startsWith("ok: ")), res.lines.join("\n") + res.err);
    assert.ok(res.lines.includes(`ok: ${u} (Cache-Control: public, max-age=2592000)`), res.lines.join("\n"));
  } finally { sb.cleanup(); }
});

// --- the GPT model: one id, named in CLAUDE.md § Calling GPT, and every command in the docs uses it ---

test("every GPT command in the docs goes through ask.sh, read-only but for L's test pass, and it and the reviewer setting name the model CLAUDE.md § Calling GPT names", () => {
  const model = readFileSync(join(root, "CLAUDE.md"), "utf8").match(/^Both routes run \*\*[^*\n]*\(`([^`]+)`\)\*\*/m)?.[1];
  assert.ok(model, "CLAUDE.md § Calling GPT names the model as **… (`<id>`)**");
  const files = ["CLAUDE.md", "AGENTS.md", ...readdirSync(join(root, ".claude"), { recursive: true })
    .filter(f => f.endsWith(".md")).map(f => join(".claude", f))];
  const uses = [], wrong = [];
  for (const f of files) readFileSync(join(root, f), "utf8").split("\n").forEach((line, i) => {
    const where = `${f}:${i + 1}`;
    for (const m of line.matchAll(/ask\.sh +(?:fresh|thread) +(read-only|workspace-write) +([^\s`]+) +\S*prompt/g)) {
      uses.push({ where, id: m[2] });
      // Only L's test pass may write (tests/): the tester brief, and CLAUDE.md's line for it. Anything
      // else, the limit probe included, is read-only.
      const testPass = /[\\/]briefs[\\/]tester\.md$/.test(f) || (f === "CLAUDE.md" && /test pass/.test(line));
      if (m[1] === "workspace-write" && !testPass) wrong.push(`${where} is workspace-write`);
    }
    for (const m of line.matchAll(/reviewer `codex` on `([^`]+)`/g)) uses.push({ where, id: m[1] });
    // Every GPT call goes through ask.sh (CLAUDE.md § Calling GPT), the limit probe included: a doc
    // that runs codex itself, on any model, is wrong.
    if (/\bcodex exec\b.*?(?:-m|--model) /.test(line)) wrong.push(`${where} runs codex directly`);
  });
  assert.deepStrictEqual(wrong, []);
  // CLAUDE.md's two commands and the reviewer setting, the three briefs, gpt-design, work-ticket § 8 and
  // pr-review.md's limit probe: a pattern that stopped matching would otherwise pass with nothing checked.
  assert.ok(uses.length >= 9, "found only: " + uses.map(u => u.where).join(", "));
  assert.deepStrictEqual(uses.filter(u => u.id !== model).map(u => `${u.where} names ${u.id}`), []);
});
