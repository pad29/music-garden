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
the reset ChatGPT limit first. So the build and the measurements came first, and GPT reviewed the result.

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
   owner, relayed by the orchestrator, 2026-11-08 (it was decision 3, left open, in
   `reviews/2026-11-08-ao-gpt-workflow.md`, which now records the answer).

## Review and test pass (Astra)

*Pending — one `ask.sh` call after 05:45Z.*

## PR review (AO: Codex, Astra)

*Pending.*

## Verification

- `node tools/check-syntax.mjs` OK (29 scripts); `node --test "tests/*.test.mjs"` 636/636. No game code
  changed, so this shows only that nothing broke.
- `work-ticket` § 6 run as written, on the committed config: start, `curl | cmp` on `README.md` and
  `.ao/launch.json`, `ao browser open`, the game with no page errors, stop, port refused.
- **Not verified:** that AO stops the preview when a session ends without `ao preview stop` (it cannot
  be tried without ending this session); `ao preview start` on macOS or Linux; whether the owner's view
  of the Browser panel follows a restart (only the agent's tab was observed).
