# Checking the game in AO's browser

Read this before the first browser check of a session (`work-ticket` § 6).

**The browser is AO's, serving this worktree.** `.ao/launch.json` makes the server one command:

```bash
ao preview start     # first line: ready game http://127.0.0.1:<port>/index.html?dev
( set -o pipefail; curl -fsS "http://127.0.0.1:<port>/<a file this branch changed>" | cmp - "<that file>" )
ao browser open "http://127.0.0.1:<port>/index.html?dev"
```

`ao preview start` returns once the server answers — no background command: AO runs `http-server` in
this worktree on a loopback port it picks, a new one at every start, and a second start replaces the
running server. Start it once: the server caches nothing (`-c-1`), so an edit needs only a reload.
`ao preview status` shows the server's log, down to each file the browser fetched; `ao preview stop`
ends it, whole process tree included — do that when you are done. **Open the URL yourself after every
start**: only a session's first start moved the agent's tab, and a page whose server has stopped goes
on rendering (measured 2026-11-08). The `curl … | cmp` line must succeed — AO's own readiness check
passes on any HTTP answer, a 404 included. **A screenshot is not evidence unless you know which files
produced it.**

- **If `ao preview start` fails** — it exits non-zero and says why — serve the worktree yourself, as a
  background command, then run the `curl … | cmp` and `ao browser open` lines with its port:
  ```bash
  PORT=$((8400 + ${AO_SESSION_ID##*-}))                # first candidate: music-garden-7 → 8407
  npx --yes http-server -p $PORT -c-1 -a 127.0.0.1 .   # background; if it can't bind, try the next port
  ```
  Here the byte comparison also catches another session's server answering the port. Stop the server
  when you are done.
- AO redacts query values in the URLs it reports (`?dev=[redacted]`): `get url` shows the port, but
  judge the page by what it shows.
- **`file://` is out of reach** — AO's browser refuses it. A change that touches asset loading puts a
  `file://` check on the owner's playtest list and under *Not verified*.
- **AO's browser cannot run JavaScript in the page** — there is no console input and no evaluate.
  Verify through what the page shows (`snapshot`, `act`, `console`, `errors`) and prove logic in Node
  tests. A check that needs page code — a `window.` probe, the playback goldens' console capture in
  `tools/goldens/README.md` — goes under *Not verified*, and on the owner's list when it matters.
- **This worker's browser profile is its own** (AO isolates each worker's), so `localStorage` — saves,
  progress, settings — starts with none of the owner's. To test against stored data, create it in this
  browser first (play to it, or use the `?dev` buttons) and say so. Storage belongs to the origin, port
  included, so what you made before a restart of `ao preview start` stays behind with the old port:
  make it on the server you test it on (measured 2026-11-09). Never point the game at
  `ao browser target chrome`: that is the owner's own Chrome and profile.
- Once the PR exists, its Netlify deploy preview opens the same way. Take its URL from the
  deploy-preview check's link in `gh pr checks <n>` (for PR #82 it was
  `https://deploy-preview-82--tunegarden.netlify.app`).
