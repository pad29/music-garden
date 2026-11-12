// The workflow's shell scripts, run for real under bash with fake `ao`, `gh` and `sleep` on PATH:
// `.claude/gpt/gpt-lock.sh` (one GPT job at a time, CLAUDE.md § Cost) and the review poller in
// `.claude/skills/work-ticket/pr-review.md`, extracted from the doc so the doc is what is tested.
// Skipped when no bash is found (on Windows, Git Bash — never WSL's bash.exe).
import { test } from "node:test";
import assert from "node:assert";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
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
  // ao session ls → $state/sessions.json (exit 1 if $state/ao-fails exists), after running $state/on-ls
  // once if it exists (what other sessions do while this one waits on AO); ao session rename → log;
  // ao review ls <id> --json (the lock's) → $state/reviews-<id>.json, else no reviews; .fail → exit 1;
  // ao review ls --json (the poller's) → $state/review<N>.json, N counting calls (the last one
  // repeats); *.fail → exit 1.
  writeFileSync(join(bin, "ao"), `#!/usr/bin/env bash
s="$FAKE_STATE"
case "$1 $2" in
  "session ls")
    [ -e "$s/on-ls" ] && { mv "$s/on-ls" "$s/on-ls.ran"; bash "$s/on-ls.ran"; }
    [ -e "$s/ao-fails" ] && { echo "ao: daemon down" >&2; exit 1; }; cat "$s/sessions.json" ;;
  "session rename") printf '%s|%s\\n' "$3" "$4" >> "$s/renames.log" ;;
  "review ls")
    if [ "$3" != "--json" ]; then
      [ -e "$s/reviews-$3.fail" ] && { echo "ao: review ls failed" >&2; exit 1; }
      cat "$s/reviews-$3.json" 2>/dev/null || echo '{"reviews":[]}'; exit 0
    fi
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
    assert.strictEqual(lock(sb, "music-garden-6", "acquire").code, 0, "re-acquiring your own lock is a no-op");
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

test("gpt-lock: a lock held by a session AO no longer lists is broken; if ao fails, it is not", { skip }, () => {
  const sb = sandbox();
  try {
    sb.sessions(["music-garden-3", "music-garden-6"]);
    assert.strictEqual(lock(sb, "music-garden-3", "acquire").code, 0);
    writeFileSync(join(sb.state, "ao-fails"), "");
    assert.strictEqual(lock(sb, "music-garden-6", "acquire").code, 75, "ao down: the holder counts as live");
    rmSync(join(sb.state, "ao-fails"));
    assert.strictEqual(lock(sb, "music-garden-6", "acquire").code, 75, "holder still listed: busy");
    sb.sessions(["music-garden-6"]);                       // 3 terminated
    const r = lock(sb, "music-garden-6", "acquire");
    assert.strictEqual(r.code, 0, r.out);
    assert.match(r.out, /broke a stale lock held by music-garden-3/);
    assert.match(lock(sb, "music-garden-6", "status").out, /held by music-garden-6 /);
  } finally { sb.cleanup(); }
});

// A lock left by a dead session, as its acquire wrote it.
const staleLock = (sb, holder) => {
  mkdirSync(sb.env.GPT_LOCK_DIR);
  writeFileSync(join(sb.env.GPT_LOCK_DIR, "owner"), `${holder} 2026-11-11T00:00:00Z\n`);
};

test("gpt-lock: a breaker acting on an old view never removes a lock taken since", { skip }, () => {
  // GPT's round-2 interleaving: B saw music-garden-3's lock stale; A broke it and took the lock; B acts now.
  const sb = sandbox();
  try {
    sb.sessions(["music-garden-6", "music-garden-9"]);               // 3 terminated
    staleLock(sb, "music-garden-3");
    assert.strictEqual(lock(sb, "music-garden-6", "acquire").code, 0, "A breaks it and takes the lock");
    const late = lock(sb, "music-garden-9", "break", "music-garden-3");
    assert.strictEqual(late.code, 75, late.out);
    assert.match(lock(sb, "music-garden-9", "status").out, /^held by music-garden-6 /);
    assert.strictEqual(lock(sb, "music-garden-9", "acquire").code, 75, "and A's lock still excludes C");
    assert.strictEqual(lock(sb, "music-garden-9", "break", "music-garden-6").code, 75, "a listed holder is never broken");
  } finally { sb.cleanup(); }
});

test("gpt-lock: a holder that releases and ends while a breaker asks AO never costs the next holder its lock", { skip }, () => {
  // GPT's round-3 interleaving: B holds S's break key and is waiting on `ao session ls`; meanwhile S
  // releases, A takes the lock and starts GPT, and S ends. AO then says S is gone.
  const sb = sandbox();
  try {
    sb.sessions(["music-garden-3", "music-garden-6", "music-garden-9"]);
    assert.strictEqual(lock(sb, "music-garden-3", "acquire").code, 0);
    const after = JSON.stringify({ data: ["music-garden-6", "music-garden-9"].map(id => ({ id, displayName: id, status: "working" })) });
    writeFileSync(join(sb.state, "on-ls"), `L=$(cygpath -u "$GPT_LOCK_DIR" 2>/dev/null || echo "$GPT_LOCK_DIR")
rm -rf "$L"; mkdir "$L"; echo "music-garden-6 2026-11-11T00:00:00Z" > "$L/owner"
printf '%s' '${after}' > "$FAKE_STATE/sessions.json"
`);
    const late = lock(sb, "music-garden-9", "break", "music-garden-3");
    assert.ok(existsSync(join(sb.state, "on-ls.ran")), "the interleaving ran during the breaker's AO read");
    assert.strictEqual(late.code, 75, late.out);
    assert.match(lock(sb, "music-garden-9", "status").out, /^held by music-garden-6 /);
    assert.strictEqual(lock(sb, "music-garden-9", "acquire").code, 75, "and A's lock still excludes C");
  } finally { sb.cleanup(); }
});

test("gpt-lock: a dead holder's lock is not broken while a review run of its may still be going", { skip }, () => {
  // GPT's round-3 finding 2: the session ended, but the AO review it asked for may still run.
  const sb = sandbox();
  try {
    sb.sessions(["music-garden-6"]);                                  // 3 terminated
    staleLock(sb, "music-garden-3");
    const runs = status => writeFileSync(join(sb.state, "reviews-music-garden-3.json"),
      JSON.stringify({ reviews: [{ prNumber: 88, status: "needs_review", latestRun: { id: "r1", status } }] }));
    for (const s of ["running", "queued", "pending"]) {
      runs(s);
      assert.strictEqual(lock(sb, "music-garden-6", "acquire").code, 75, `a ${s} run keeps the lock`);
    }
    writeFileSync(join(sb.state, "reviews-music-garden-3.fail"), "");
    assert.strictEqual(lock(sb, "music-garden-6", "acquire").code, 75, "ao review ls fails: the run counts as going");
    rmSync(join(sb.state, "reviews-music-garden-3.fail"));
    writeFileSync(join(sb.state, "reviews-music-garden-3.json"), "not json");
    assert.strictEqual(lock(sb, "music-garden-6", "acquire").code, 75, "unreadable output: the run counts as going");
    assert.match(lock(sb, "music-garden-6", "status").out, /^held by music-garden-3 /);
    runs("failed");
    const r = lock(sb, "music-garden-6", "acquire");
    assert.strictEqual(r.code, 0, r.out);
    assert.match(r.out, /broke a stale lock held by music-garden-3/);
  } finally { sb.cleanup(); }
});

test("gpt-lock: a break key it cannot create is an error, not a break in progress", { skip }, () => {
  const sb = sandbox();
  try {
    sb.sessions(["music-garden-6"]);
    staleLock(sb, "music-garden-3");
    writeFileSync(`${sb.env.GPT_LOCK_DIR}.break.music-garden-3`, "");   // a file in the key's way
    const r = lock(sb, "music-garden-6", "acquire");
    assert.strictEqual(r.code, 1, r.out);
    assert.match(r.out, /error: could not create the break key /);
    sb.env.GPT_LOCK_TRIES = "3";
    const w = lock(sb, "music-garden-6", "wait");
    assert.strictEqual(w.code, 1, w.out);
    assert.doesNotMatch(w.out, /gave up/);
  } finally { sb.cleanup(); }
});

test("gpt-lock: while one break of a holder runs, no other session breaks or takes that lock", { skip }, () => {
  const sb = sandbox();
  try {
    sb.sessions(["music-garden-6"]);
    staleLock(sb, "music-garden-3");
    mkdirSync(`${sb.env.GPT_LOCK_DIR}.break.music-garden-3`);       // another session is mid-break
    assert.strictEqual(lock(sb, "music-garden-6", "acquire").code, 75);
    assert.match(lock(sb, "music-garden-6", "status").out, /held by music-garden-3 .*\nbreak in progress: music-garden-3/s);
    rmSync(`${sb.env.GPT_LOCK_DIR}.break.music-garden-3`, { recursive: true });
    assert.strictEqual(lock(sb, "music-garden-6", "acquire").code, 0);
    assert.ok(!existsSync(`${sb.env.GPT_LOCK_DIR}.break.music-garden-3`), "the break key is given back");
  } finally { sb.cleanup(); }
});

test("gpt-lock: of many sessions breaking the same stale lock at once, exactly one ends up holding it", { skip }, async () => {
  for (let round = 0; round < 3; round++) {
    const sb = sandbox();
    try {
      const ids = Array.from({ length: 6 }, (_, i) => `music-garden-${10 + i}`);
      sb.sessions(ids);
      staleLock(sb, "music-garden-3");
      const results = await Promise.all(ids.map(id => lockAsync(sb, id, "acquire")));
      const winners = results.filter(r => r.code === 0);
      assert.strictEqual(winners.length, 1, JSON.stringify(results));
      assert.ok(results.every(r => r.code === 0 || r.code === 75), JSON.stringify(results));
      assert.match(lock(sb, ids[0], "status").out, new RegExp(`^held by ${winners[0].session} `));
    } finally { sb.cleanup(); }
  }
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
