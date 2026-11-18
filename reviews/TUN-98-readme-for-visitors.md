# TUN-98 — Rewrite the README's opening for visitors, and remove the local machine path

Branch `ao/tun-98/root` · Size S · session `music-garden-38`

## Plan (Claude)

Measured on `origin/main` ccc1eb9. TUN-89 (`LICENSE`, `CREDITS.md`) and TUN-92 (`CONTRIBUTING.md`) are
still in Backlog, not merged: the opening links to those files by the names their tickets fix, and the
links resolve once they land (TUN-103, publishing, waits on all three). The licence words come from the
owner's decision both tickets record (2026-11-13): AGPL-3.0 for the code, CC BY-SA 4.0 for the narration
and the docs, the name and logo not licensed. "Only" or "or later" is TUN-89's open question, so the
opening says neither.

- **`README.md` opening** — above the first `---`: what Tune Garden is (the existing pitch), **Play it**
  (`tunegarden.game`, no account needed), one screenshot, **Run it locally** in two commands
  (`git clone …` then `npx http-server music-garden -p 8377 -c-1`, or double-click `index.html`), a
  one-line **Licence** summary linking `LICENSE` and `CREDITS.md`, and **Contribute** linking
  `CONTRIBUTING.md` without restating it. The developer status paragraph moves below the opening, under a
  short "For developers" lead-in. Every section below it, and every heading (so every anchor), stays.
- **Screenshot** — `.github/screenshot.png`, taken from this worktree's preview. `.github/` is GitHub's
  folder for repository files that are not the product (TUN-92's issue templates go there too), and the
  build copies only `index.html`, `_headers`, `js/`, `voice/`, `samples/`, `vendor/`
  (`cloudflare-build.sh`), so it is never published. Kept small.
- **§ Dev workflow we use** — a lead paragraph: the project is built with AI agents (Claude and GPT,
  through Agent Orchestrator and Linear), and a human contributor needs none of it — `CONTRIBUTING.md`
  says what a contributor does. The numbered checks stay.
- **Machine path** — `CLAUDE.md` § AO, tickets and branches and `work-ticket` § 3 name the place instead
  of the path: AO's project checkout, the clone AO makes every worktree from (`git worktree list` shows
  it first), which stays on `main`. The rule (never edit it) is unchanged.
- **Current status** — already agrees with `PACKAGES.md` and the code: 20 packages in 7 regions,
  `march-and-waltz` the one Pulse Woods package still to come, 248 clips (`voice/*.mp3`), Jukebox 16
  (`JUKEBOX_FAMOUS`). No change.
- **Tests:** docs only — syntax check and the suite. `tests/workflow-scripts.test.mjs` runs `CLAUDE.md`'s
  log block, which this does not touch; no test reads the README's opening. No new test: the ticket's
  checks are text a reader judges.
- **Merges:** README and AGENTS.md are touched by parallel phase-2 tickets. The README edits are the
  opening and one paragraph in § Dev workflow; no repository-map row (see the audit, `.github/`).

## The `git grep` audit (tracked files, `origin/main` ccc1eb9)

Searched for machine paths (`C:\Users`, `C:/Users`, `/Users/…`, `/home/…`, `AppData`), user names
(`pavel`, `dmitriev`, `pad29`) and email addresses.

| Found | Where | Done |
|---|---|---|
| `C:\Users\pavel\ao\projects\music-garden` | `CLAUDE.md:102`, `.claude/skills/work-ticket/SKILL.md:63` | **Changed** — named as AO's project checkout (above). |
| `C:\Users\pavel\AppData\Roaming\GitHub CLI\config.yml` | `.claude/skills/work-ticket/pr-review.md:10`, the diagnosis of AO's reviewer | **Changed** to `%APPDATA%\GitHub CLI\config.yml` — the same file on any Windows machine; the file is live procedure, not history. |
| `/home/` | `EDITOR-DESIGN.md:181` | **Left** — a false match ("lit/unlit/home/velocity"). |
| "Pavel" (the owner's first name) | `DESIGN.md` (2 lines), `PACKAGES.md` (3), `PACKAGES-DETAILED.md` (4), `js/famous.js` (11 comments) | **Left** — all but one credit the owner's score checks of the famous melodies ("Pavel's save-link version"), which is what makes them trustworthy; `DESIGN.md:384` uses the name as an example ("this sounds like Pavel's style"). The owner published the repository as it is (2026-11-13), and `js/famous.js` sits beside the `FAMOUS` data no ticket edits. |
| Email addresses | none personal: `you@`/`new@`/`parent@`/`x@example.com` placeholders in `backend/`, `tests/`; `@aws.com` names AWS's sender | **Left** — placeholders, which `tests/backend-template.test.mjs` requires. |
| `dmitriev`, `pad29` | nowhere outside history | — |
| History | machine paths in 12 `reviews/` files; "pavel" on 113 lines of `reviews/` and `REVIEW-LOG.md`; `example.org`/`example.com` in `reviews/TUN-82…` | **Left as written** (ticket; `CLAUDE.md`). The commit history's email address: the owner accepted it (2026-11-13). |

## Build

- **Screenshot** — this worktree's own server (`ao preview start`, its `README.md` byte-compared with the
  file): Start playing → Sprout → 💡 Hint on *Wake the Seeds*, 1600×900 cropped to 1600×760, lossless
  (327 KB; a 256-colour palette was a sixth of that but flattened the garden panel's gradient). Shown at
  640 px wide so the opening fits one screen.
- **The two commands** — `npx http-server <folder> -p … -c-1`, run from another directory, served the
  folder: `/` answered 200 and `index.html` byte-matched. The clone URL is this repository's; it works
  for strangers once TUN-103 makes it public.
- **Dangling until they merge:** `LICENSE`, `CREDITS.md` (TUN-89) and `CONTRIBUTING.md` (TUN-92).
- **No repository-map row for `.github/`** — TUN-92's issue and pull request templates make it a folder
  worth a row, and two parallel rows at the map's end would collide; that ticket adds it.

**913 tests pass**; syntax check clean. Not verified: the README as GitHub renders it (checked on the
PR's branch view once pushed).
