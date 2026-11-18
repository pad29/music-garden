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
| Email addresses | none personal: `you@`/`new@`/`parent@`/`x@example.com` placeholders in `backend/`, `tests/`; `owner@example.org` in `tests/backend-template.test.mjs:467–469`, the mutation cases proving the template refuses a real-looking address; `@aws.com` names AWS's sender | **Left** — placeholders, which `tests/backend-template.test.mjs` requires, and its own test inputs. |
| `dmitriev`, `pad29` | nowhere outside history on `main`; **this PR adds** `pad29` in `README.md`'s clone URL | **Kept** — it is the repository's own address, which a visitor needs. |
| History | machine paths in 12 `reviews/` files; "pavel" on 113 lines of `reviews/` and `REVIEW-LOG.md`; `example.org`/`example.com` in `reviews/TUN-82…` | **Left as written** (ticket; `CLAUDE.md`). The commit history's email address: the owner accepted it (2026-11-13). |

## Build

- **Screenshot** — this worktree's own server (`ao preview start`, its `README.md` byte-compared with the
  file): Start playing → Sprout → 💡 Hint on *Wake the Seeds*, 1600×900 cropped to 1600×760, lossless
  (327 KB; a 256-colour palette was a sixth of that but flattened the garden panel's gradient). Shown at
  480 px wide (640 at first; round 1 below) so the opening fits one screen.
- **The two commands** — `npx http-server <folder> -p … -c-1`, run from another directory, served the
  folder: `/` answered 200 and `index.html` byte-matched. The clone URL is this repository's; it works
  for strangers once TUN-103 makes it public.
- **Dangling until they merge:** `LICENSE`, `CREDITS.md` (TUN-89) and `CONTRIBUTING.md` (TUN-92).
- **No repository-map row for `.github/`** — TUN-92's issue and pull request templates make it a folder
  worth a row, and two parallel rows at the map's end would collide; that ticket adds it.

## PR review — round 1 (Astra, `ask.sh`, on 10fb07b)

<details><summary>GPT's review, verbatim</summary>

## 1. **Changes required**

1. **Should-fix — `README.md:5`: Account functionality is understated.** “An account only saves your progress across devices” is false: `js/save-share.js:163–169` requires sign-in to share songs exceeding the inline-link limit, and accounts provide cloud-song listing and deletion. Replace the parenthetical with “an optional account enables progress sync and cloud song sharing,” or remove it.

2. **Nit — `reviews/TUN-98-readme-for-visitors.md:50–51`: Complete the audit with the final branch’s results.** The explicitly dated baseline correctly has no `pad29` outside history, but this PR introduces it in `README.md:12`. Add a post-change note retaining it as the repository’s clone URL. The email inventory also omits `owner@example.org` in `tests/backend-template.test.mjs:467–469`; record those as intentional test placeholders. I found no unreported personal email address.

The remaining source checks hold: developer sections and anchors are preserved; package status agrees with `PACKAGES.md`; the AO wording identifies the same first-listed checkout and retains the prohibition; the screenshot matches its description and is excluded from deployment. No runtime invariant was changed.

## 2. **Missing tests**

- **Manual GitHub rendering check:** Open this head’s rendered README, verify the screenshot loads, and check the “first screen” requirement at a recorded desktop viewport—including the run commands, licence and contribution link. The record explicitly leaves this unverified; my browser attempt was blocked by an unavailable browser host.
- **No new automated tests needed:** the changes are prose and a repository screenshot. Syntax checking passed. My full-suite run encountered `EPERM` creating temporary directories in this read-only environment, so I could not independently reproduce the reported 913/913 pass.

## 3. **Verdict**

**CHANGES REQUESTED** for head `10fb07bf9ce11d36b95f6c72cea600b2c5e22418`.

The pending `LICENSE`, `CREDITS.md` and `CONTRIBUTING.md` links are acknowledged cross-ticket dependencies, not additional defects here. TUN-89/TUN-92 still require a merged README check: preserve this opening, reconcile the licence summary with the final licence choice, and retain their contributor/template links. A clean textual merge alone would not establish that integration is correct.

</details>

1. **Should-fix — the account parenthetical.** **Agreed** — `shareSong` asks a signed-out player to sign
   in for a song too big for a `#s=` link. Now: "an optional account syncs your progress across devices
   and shares songs too big for a link".
2. **Nit — the audit's final state.** **Agreed** — the table now records `pad29` in the clone URL (kept)
   and `owner@example.org` in `tests/backend-template.test.mjs` (test inputs, left).
3. **Missing test — GitHub rendering at a recorded viewport.** **Added, as far as it can be reached
   here:** GitHub's own renderer (`POST /markdown`, `gfm`, this repository as context) keeps
   `<img … width>` (adding `max-width: 100%`) and the three relative links. That HTML, in an 830 px
   GitHub-style column with the real screenshot, at AO's panel — 1280×720 CSS pixels (1600×900 at
   125%) — first showed the screenshot at 640 px pushing *Licence* and *Contribute* below the fold. So:
   the screenshot is now 480 px wide, the Licence line shorter, and "then open…" folded into the run
   line. At that viewport the title, pitch, *Play it*, screenshot, *Run it yourself* and both commands
   are on screen, *Licence* starts at the bottom edge, and *Contribute* is one line below it. (Round 1's
   answer added "a 1920×1080 window at 100% shows all of it": that was inferred, not measured — AO's
   panel cannot change its size or zoom.) The page GitHub itself serves (private repository, AO's
   browser not signed in) stays on the owner's playtest list.
4. GPT's note that TUN-89 and TUN-92 must check the merged README, not just merge cleanly — recorded in
   the pointer left on TUN-92, and in the hand-off for TUN-89.

## PR review — round 2 (Astra, `ask.sh`, on 61aa0cf)

<details><summary>GPT's review, verbatim</summary>

1. **Changes required**

None in the textual delta. The account parenthetical and both audit additions resolve the round-1 findings. The shortened licence wording preserves its meaning, and the merged run sentence preserves both launch options.

2. **Missing tests**

- **Actual GitHub rendering remains unverified** (`reviews/TUN-98-readme-for-visitors.md:97–110`). Open this head’s README on authenticated github.com, record the viewport and zoom, and verify the screenshot loads and the complete opening—including commands, licence and contribution link—fits the first screen. GitHub’s Markdown API plus a simulated column establishes only partial evidence: the recorded 1280×720 check still clips the opening, while the 1920×1080 pass excludes GitHub’s surrounding page layout. Adjust the opening if the actual check fails, and record the result.
- No new automated tests are needed for this prose-only delta.

3. **Verdict**

**CHANGES REQUESTED** for head `61aa0cf28436f8ceb4766eb424f50cd6f9cb6c6d`. The textual findings are resolved; the round-1 rendering check remains outstanding.

</details>

1. **Missing test — the real github.com rendering.** **Agreed that it is unverified; it cannot be done
   here**: the repository is private, AO's browser is not signed in to GitHub, and `browser.md` forbids
   pointing the game's checks at the owner's own Chrome. GPT is right that the 1920×1080 line was not
   evidence — corrected above. Whether the opening must also clear the fold on a small laptop is a
   judgment of the page as the owner sees it → *Owner's decisions*, question 1.

## Owner's decisions

1. **A — good enough as it is**: the owner, in the AO session, 2026-11-18 ("1A"). This settles GPT's
   round-2 request for the real github.com check: the owner judges the opening as it renders. The
   question, as asked: *GPT's outstanding check: the real github.com rendering of the opening.* On github.com the
   README sits below the file list on the repository's home page, so no arrangement fits a literal first
   browser screen there; on the file's own page (PR #151 → Files → `README.md` → rich view, or the
   branch's `README.md`), measured in a GitHub-like column at 1280×720 CSS px, *Licence* starts at the
   fold and *Contribute* is one line below. **A)** good enough as it is · **B)** move *Licence* and
   *Contribute* above the screenshot, so the text clears the fold and the picture follows · **C)**
   something else (smaller screenshot, a different picture). Claude's pick: **A**.

**913 tests pass** after the fixes; syntax check clean. Not verified: the README as github.com serves it.
