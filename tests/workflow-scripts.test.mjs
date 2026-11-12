// The workflow's shell scripts, run for real under bash with fake `ao`, `gh`, `sleep` and `codex` on
// PATH: `.claude/gpt/gpt-lock.sh` (one GPT job at a time, CLAUDE.md § Cost), the review poller in
// `.claude/skills/work-ticket/pr-review.md`, extracted from the doc so the doc is what is tested, and
// `.claude/gpt/ask.sh`'s exit statuses and stderr (a stub codex — never the real one).
// Skipped when no bash is found (on Windows, Git Bash — never WSL's bash.exe).
import { test } from "node:test";
import assert from "node:assert";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync, rmSync, copyFileSync } from "node:fs";
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

test("gpt-lock: of many sessions acquiring at the same instant, exactly one gets the lock", { skip }, async () => {
  for (let round = 0; round < 3; round++) {
    const sb = sandbox();
    try {
      const ids = Array.from({ length: 6 }, (_, i) => `music-garden-${10 + i}`);
      sb.sessions(ids);
      const results = await Promise.all(ids.map(id => lockAsync(sb, id, "acquire")));
      const winners = results.filter(r => r.code === 0);
      assert.strictEqual(winners.length, 1, JSON.stringify(results));
      assert.ok(results.filter(r => r.code !== 0).every(r => r.code === 75 && /^busy: held by /.test(r.out)),
        JSON.stringify(results));
      assert.match(lock(sb, ids[0], "status").out, new RegExp(`held by ${winners[0].session} `));
    } finally { sb.cleanup(); }
  }
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
    const res = spawnSync(bash, runScript(join(gpt, "ask.sh"), mode, "read-only", "gpt-6-astra", posix(join(gpt, "prompt.txt"))),
      { env: sb.env, encoding: "utf8" });
    const callsFile = join(sb.state, "codex.calls");
    return {
      code: res.status, out: res.stdout, err: res.stderr.trim(),
      calls: existsSync(callsFile) ? readFileSync(callsFile, "utf8").split("\n").filter(Boolean) : [],
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
