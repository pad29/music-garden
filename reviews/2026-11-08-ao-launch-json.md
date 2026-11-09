# 2026-11-08 — Serve the game with `ao preview start`

Branch `claude/ao-launch-json`, stacked on PR #85 (`claude/ao-gpt-workflow`) · ad-hoc work the owner
approved directly (no ticket) · AO session `music-garden-3`

Config and docs only. PR #85 removed `.claude/launch.json` and left *"Add `.ao/launch.json`, so `ao
preview start` runs the dev server?"* open for the owner; the owner said yes, as a separate PR. This adds
`.ao/launch.json`, makes `ao preview start` the primary route in `work-ticket` § 6 with #85's manual
http-server route kept as the fallback, and points README and AGENTS.md at it.

## Measured (this AO worker, AO 0.14.10, Windows 11, 2026-11-08)

Every number below is from this session, on the config as committed unless a probe is named.

- **`npx` launches as is.** AO resolves `runtimeExecutable: "npx"` through `PATHEXT` to
  `C:\Program Files\nodejs\npx.cmd` and runs it as `cmd.exe /d /s /c "…npx.cmd" …` itself; no `npx.cmd` or
  shell wrapper is needed in the config. The tree under `ao.exe daemon` is four processes: `cmd.exe` →
  `node npx-cli.js` → `cmd.exe /d /s /c http-server …` → `node …\http-server`.
- **Start:** `ready game http://127.0.0.1:<port>/index.html?dev` in 1.6 s with the warm npx cache (http-server
  14.1.1), about 3 s with a cold one (`npm_config_cache` pointed at an empty folder — probe only). The
  first cold attempt died mid-download (`read ECONNRESET`, AO: `PREVIEW_EXITED`); the retry worked, so a
  network blip, not AO's environment. With no `port` and `autoPort: true`, AO picked a different
  ephemeral port at every one of eleven starts (49193–65082).
- **It serves this worktree:** `curl | cmp` byte-identical for `.ao/launch.json` (which existed only in this
  worktree, uncommitted), `index.html`, `js/boot.js`, a `reviews/` file, and later `README.md`.
- **The game itself loads:** the server's log shows AO's browser (Electron 44) fetching `index.html?dev`
  and all 29 `js/` files; no page errors; the snapshot has the `?dev` bar (package and level jump,
  relock, quest buttons — wired by `js/boot.js` after the load gate passes) and the landing screen;
  *Start playing* opens *Meet your garden friend*.
- **Stop:** `ao preview stop` in 5.5 s; the port refuses connections and all four processes are gone.
  A start that fails readiness also leaves no process behind.
- **The agent's tab follows only the first start.** The session's first `ao preview start` navigated the
  agent's tab. Five later starts, checked each time, did not: two after a stop, two replacing a running
  server (one of them after `ao preview clear`, which did not clear the tab either), and one with a new
  `about:blank` tab active. Meanwhile the tab went on rendering the page of a server that had stopped.
  `ao browser open "<the printed URL>"` worked every time.
- **A start while one runs replaces it** — new port, old port refused, still four processes.
- **AO's readiness check passes on any HTTP answer:** a probe whose `url` is a 404 reported `ready`. The
  default wait is 30 s (`PREVIEW_NOT_READY` from a process that never listens); `readyTimeoutMs` may be at
  most 55000.
- **AO validates the whole file:** one configuration with `readyTimeoutMs` out of range made every start
  fail with `PREVIEW_CONFIG_INVALID`, the valid configurations included. With several configurations, a
  bare `ao preview start` fails with `PREVIEW_CONFIGURATION_REQUIRED`.
- A missing executable fails at once: `exec: "…": executable file not found in %PATH%`
  (`PREVIEW_START_FAILED`), exit 1.
- `netstat` and `Get-NetTCPConnection` list no listener for ports `curl` reaches, in this environment —
  so ports were judged by `curl` and processes by `Win32_Process`, never by a port listing.

## Design (Claude, from the owner's brief)

GPT did not design this one: the owner's brief fixed the shape (the old config's command, loopback, a
port AO allocates), and the orchestrator held every GPT call until 05:45Z so that #85's review could use
the reset ChatGPT limit first. So the build and the measurements came first, and GPT was asked to review
the result — a call the limit cut short (below).

- **One configuration, `game`**: `npx --yes http-server -p ${PORT} -a 127.0.0.1 -c-1 .`, `cwd: "."`,
  `autoPort: true`, `targetKind: "app"`.
- **No preferred `port`.** AO allocates freely, and a worker never takes 8377, the port README's manual
  command uses.
- **`url` carries `?dev`.** It only reveals the dev bar (`js/boot.js`); a worker needs it to jump to a
  level, and a player's view is `ao browser open` without it.
- **`readyTimeoutMs` left at AO's 30 s:** a cold start took about 3 s.
- **http-server stays unpinned,** as in the old `.claude/launch.json` and every manual command in the docs.

## Owner's decisions

1. *Add `.ao/launch.json`, so `ao preview start` runs the dev server?* — **Yes, in a separate PR**: the
   owner, relayed by the orchestrator in this session's brief, 2026-11-08. It was decision 3 in
   `reviews/2026-11-08-ao-gpt-workflow.md`, which records the answer as relayed to #85's session the next
   day.

## Review and test pass (Astra) — cut off by the ChatGPT limit

One `ask.sh thread workspace-write` call, briefed as the design review and the test pass at once, to spend
the limit once (no thread existed, so it started fresh). This session had stopped at 05:16Z on the owner's
Claude limit, so the call came only after that reset: #85's AO review started at 15:04Z and this call at
15:05Z, and at 15:06Z GPT's turn failed: *"You've hit your usage limit … try again at 2:04 PM"* (20:04Z).
No report came back, so GPT rated nothing, and `ask.sh` printed no token count. What it left, verbatim:

1. *"The measurements support explicitly opening the URL after every start and retaining the byte
   check."* — said in passing, before its report.
2. *"I'm checking two remaining risks: how changing ports affects saved test data, and whether the
   fallback instructions establish that the new server actually started."* The second it never concluded.
3. *"The clearest gap is persistence testing: a new port means a new browser origin, so data created
   before a preview restart will not appear afterward. The stored-data instructions omit that boundary."*
   No severity given. **Agreed, and measured** (2026-11-09): Voice → Piano on port 53380 survived a
   reload there; after `ao preview start` again, port 57153 opened on Music box. `work-ticket` § 6's
   stored-data bullet now says storage stays behind with the old port, and its main text says to start
   the server once — with `-c-1`, an edit needs only a reload.
4. **`tests/ao-launch.test.mjs`** — a static contract on `.ao/launch.json`: one configuration; `npx --yes
   http-server` with one `-p ${PORT}`, one `-a 127.0.0.1` and `-c-1`, serving `.` from `cwd: "."` with
   `autoPort`; a url using `${PORT}` once, on `http://127.0.0.1`; `readyTimeoutMs`, if set, an integer in
   0–55000. Its last test runs each check against faults on in-memory copies. **Kept**, after review: it
   pins what the docs and AO's measured behaviour depend on — a second configuration breaks a bare
   `ao preview start`, a bad `readyTimeoutMs` breaks every start, `-a 0.0.0.0` opens the worktree to the
   network — and it says plainly that it proves nothing about AO itself. My audit on the real file: ten
   faults written to `.ao/launch.json` one at a time (a second configuration, `-a 0.0.0.0`, no `-a`,
   `-p 8377`, a fixed url port, a `localhost` url, `readyTimeoutMs: 60000`, no `-c-1`, `cwd: ".."`, no
   `--yes`) — all ten red, the file restored to HEAD after each. `tests/README.md` now describes it.

Never reached: the rest of the design review — the preferred-port, `?dev`, pinning and timeout choices,
docs drift, security — and the scenario dry-runs. I finished the verification myself, as `CLAUDE.md`
§ Cost says, but that is no substitute for GPT's independent review: AO's review of the PR is the check
still to come.

## PR review (AO: Codex, Astra)

**Not requested yet.** The orchestrator holds every GPT call — `ask.sh` and AO's review alike — until #85's
AO review, next in line after the 20:04Z reset, has its verdict.

## Verification

On `a7b0e5d` — this branch with #85's `2216b63` merged in. The only commit after it is this record's.

- `node tools/check-syntax.mjs` OK (29 scripts); `node --test "tests/*.test.mjs"` 641/641: the 636
  before, which show only that nothing broke (no game code changed), and GPT's five.
- `work-ticket` § 6 run as written: `ao preview start` → `ready game http://127.0.0.1:52029/index.html?dev`;
  `curl | cmp` on `tests/ao-launch.test.mjs` and `.claude/skills/work-ticket/SKILL.md`; `ao browser
  open`; the game with its dev bar and no page errors; `ao preview stop`; the port refused, no process
  left. The first run of § 6, on `3b6aefd`, compared `README.md` and `.ao/launch.json` the same way.
- **Not verified:** that AO stops the preview when a session ends without `ao preview stop` (it cannot
  be tried without ending this session); `ao preview start` on macOS or Linux; whether the owner's view
  of the Browser panel follows a restart (only the agent's tab was observed); everything GPT's
  interrupted pass never reached (above).
