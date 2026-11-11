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
  // ao session ls → $state/sessions.json (exit 1 if $state/ao-fails exists); ao session rename → log;
  // ao review ls → $state/review<N>.json, N counting calls (the last one repeats); *.fail → exit 1.
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
`);
  writeFileSync(join(bin, "gh"), `#!/usr/bin/env bash\necho "\${FAKE_HEAD:-abc123}"\n`);
  writeFileSync(join(bin, "sleep"), `#!/usr/bin/env bash\nexit 0\n`);
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
  assert.ok(which.split("\n").filter(Boolean).every(l => l.startsWith(env.FAKE_BIN + "/")), "fakes first on PATH: " + which);
  return { dir, state, env, sessions, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

// bash -c, with the fake bin put first on PATH inside bash itself (Git's bin/bash.exe wrapper puts
// /usr/bin first, so a PATH set from outside loses to the real sleep), then the script or snippet.
const PRELUDE = 'PATH="$FAKE_BIN:$PATH"; ';
const runScript = (script, ...args) => ["-c", PRELUDE + 'exec "$BASH" "$@"', "_", script, ...args];

function lock(sb, session, cmd) {
  const r = spawnSync(bash, runScript(lockScript, cmd), { env: { ...sb.env, AO_SESSION_ID: session }, encoding: "utf8" });
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
  const doc = readFileSync(join(root, ".claude/skills/work-ticket/pr-review.md"), "utf8");
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
