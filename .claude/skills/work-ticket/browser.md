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
- Once the PR exists, its Cloudflare preview opens the same way. The *Cloudflare Pages* check's link in
  `gh pr checks <n>` opens the owner's Cloudflare dashboard, not the preview: the URLs are in the comment
  Cloudflare posts on the PR and rewrites on each push — a *Preview URL* per commit and a *Branch
  Preview URL* that follows the branch (the branch name's `/` becomes `-`). This waits for that check on
  the PR's head — that check alone: a bare `gh pr checks --watch` waits on every check — then prints
  `preview <branch preview URL>` from the comment that names the head:

  ```bash
  pr=<n>; head=$(gh pr view "$pr" --json headRefOid --jq .headRefOid) || { echo "error: gh pr view failed"; exit 1; }
  short=${head:0:7}; st=; err=$(mktemp)
  for i in $(seq 40); do      # the Cloudflare Pages check on the head: up to 20 minutes
    if ! st=$(gh pr checks "$pr" --json name,bucket --jq '.[] | select(.name == "Cloudflare Pages") | .bucket' 2>"$err"); then
      grep -q "no checks reported" "$err" || { echo "error: gh pr checks: $(head -c 300 "$err")"; exit 1; }; st=
    fi
    case "$st" in pass|fail|cancel|skipping) break ;; esac; sleep 30
  done
  case "$st" in
    pass) ;;
    fail|cancel|skipping) echo "check $st on $short: see gh pr checks $pr"; exit 1 ;;
    pending) echo "check still pending on $short after 20 minutes"; exit 1 ;;
    *) fork=$(gh pr view "$pr" --json isCrossRepository --jq .isCrossRepository) || { echo "error: gh pr view failed"; exit 1; }
       [ "$fork" = true ] && { echo "fork PR: Cloudflare builds no preview for it"; exit 3; }
       echo "no Cloudflare Pages check on $short after 20 minutes"; exit 1 ;;
  esac
  for i in $(seq 5); do       # the comment, rewritten for the head: up to 2 minutes more
    bodies=$(gh pr view "$pr" --json comments --jq '.comments[] | select(.author.login == "cloudflare-workers-and-pages") | .body | gsub("\n"; " ")') \
      || { echo "error: gh pr view comments failed"; exit 1; }
    url=$(printf '%s\n' "$bodies" | grep -F "<code>$short</code>" \
      | awk 'match($0, /Branch Preview URL:/) { s = substr($0, RSTART); if (match(s, /https:\/\/[a-z0-9.-]+\.pages\.dev/)) print substr(s, RSTART, RLENGTH) }' \
      | grep -E '^https://[a-z0-9-]+\.music-garden\.pages\.dev$' | tail -n 1)
    [ -n "$url" ] && { echo "preview $url"; exit 0; }; sleep 30
  done
  echo "no Cloudflare comment names $short"; exit 1
  ```

  - **Exit 0** — `preview <URL>`: the URL hand-offs quote.
  - **Exit 3** — `fork PR: …` (GitHub says the PR comes from a fork, and it has no Cloudflare check):
    hand off with *Preview: none — fork PR*.
  - **Exit 1** — anything else, and the line says which. `check fail|cancel|skipping`: the build did
    not deploy — look at the check and fix it before the hand-off. `still pending` or `no Cloudflare
    Pages check` on a branch of this repository: Cloudflare is not building it — run once more, then
    `ao report --stuck` with the line. `error: …`: `gh` broke — `CLAUDE.md` § When something external
    breaks. `no Cloudflare comment names …` after a passing check: run once more, then hand off with
    *Preview: none — <the line>*, and say so.

  `tests/workflow-scripts.test.mjs` runs this block. Cloud sync and cloud songs fail on every preview —
  the API's CORS list allows only `tunegarden.game` — so sign-in is checked on production after the
  merge, not here.
