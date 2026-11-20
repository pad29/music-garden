# Contributing to Tune Garden

Thanks for wanting to help. Tune Garden is a browser game that teaches music theory through play — a
child places glowing seeds on a grid and hears real music grow. It is a small project with one owner,
so this guide is about making your time count: what to read, what must never break, how to propose a
change, and what happens to your pull request.

In short: **open an issue before anything bigger than a bug fix, and wait for a yes.** The owner
decides what ships, and playtests everything a child would hear or see.

## Contents

1. [Run it and test it](#1-run-it-and-test-it)
2. [Where to read](#2-where-to-read)
3. [Rules the code must keep](#3-rules-the-code-must-keep)
4. [Proposing a change](#4-proposing-a-change)
5. [Making the change](#5-making-the-change)
6. [What the owner does for you](#6-what-the-owner-does-for-you)
7. [The sign-off](#7-the-sign-off)
8. [What happens to your pull request](#8-what-happens-to-your-pull-request)
9. [Conduct and security](#9-conduct-and-security)

## 1. Run it and test it

You need [Git](https://git-scm.com/) and [Node.js](https://nodejs.org/): **Node 24**, which is what the
project's automatic checks use (at least 22.15 on Node 22, or 23.5 on Node 23 — the test suite needs a
feature those versions added). On Windows, install Git with **Git Bash**, and run the commands below in
Git Bash: a few tests run shell scripts and skip, saying why, when no `bash` is found, and PowerShell may
refuse to run `npx`. There is no build step and no project dependency to install.

Fork the repository on GitHub, then clone your fork:

```bash
git clone https://github.com/<you>/music-garden.git
cd music-garden
```

**Play it.** Open `index.html` directly in a browser — the game is built to work from a file — or serve
the folder (the first time, `npx` asks before it downloads a small web server — answer `y`):

```bash
npx http-server -p 8377 -c-1 .
```

and open http://localhost:8377. The server keeps running until you press Ctrl+C, so use a second
terminal for the commands below. Add `?dev` to the address for a level-jump menu and other testing
shortcuts; README § [Quick start](README.md#quick-start) lists them. A quick check that it works: press
**▶ Start playing**, follow the first level's instructions to plant a few seeds on the grid, and press
**▶ Play** — you should hear them.

**Check it.** From the `music-garden` folder, run the syntax check of every script the game loads, then
the tests:

```bash
node tools/check-syntax.mjs
node --test "tests/*.test.mjs"
```

The tests take a few minutes. They should end with `fail 0`. Some tests skip on purpose, and each prints
its reason — one only means something on Windows, and a few need `bash`. To run one file:
`node --test tests/detectors.test.mjs`.

## 2. Where to read

The repository holds a lot of documentation. You need only the part for your change:

| You want to… | Read |
|---|---|
| Find the code for any part of the game | README § [How the game's code is organized](README.md#how-the-games-code-is-organized) — which `js/` file holds what |
| Fix or change a level | The levels' code is `js/packages.js`. Their specs are in [`PACKAGES-DETAILED.md`](PACKAGES-DETAILED.md) (most packages, and the difficulty ramp they all follow) or [`PACKAGES.md`](PACKAGES.md) § 6 (the intro and a few others): search both for the package's ID |
| Add a level or a package | [`PACKAGES.md`](PACKAGES.md) (the map of packages and its spec template), then `PACKAGES-DETAILED.md` |
| Add a quest | [`MAKING-QUESTS.md`](MAKING-QUESTS.md) — a quest is data, and this guide walks you through one |
| Understand what the game is for | [`REQUIREMENTS.md`](REQUIREMENTS.md), then [`DESIGN.md`](DESIGN.md) |
| Touch the note editor or the Studio | [`EDITOR-DESIGN.md`](EDITOR-DESIGN.md) |
| Touch saved songs and shared links | [`SAVE-SHARE.md`](SAVE-SHARE.md) |
| Write a test | [`tests/README.md`](tests/README.md) — read it first: the tests run the game without a browser, and it says what they can't reach |
| Touch samples, fonts or credits | [`CREDITS.md`](CREDITS.md), [`vendor/README.md`](vendor/README.md) |
| Touch the backend (accounts, cloud saves) | [`backend/README.md`](backend/README.md) |

**You can ignore** `CLAUDE.md`, `.claude/` and `reviews/`. The project is built mostly by AI agents, and
those are their instructions and their records. You don't need any of it, and you don't need to update
it. `AGENTS.md` is written for the agents too, but its [hard invariants](AGENTS.md#hard-invariants--never-violate)
are everyone's — the next section says them in plain words, and that is all you need to read of it.

## 3. Rules the code must keep

These hold for every change. [`AGENTS.md` § Hard invariants](AGENTS.md#hard-invariants--never-violate)
is the authority; if this list and that one ever differ, that one wins.

1. **It works from a file.** Double-clicking `index.html` must start the game, so the game never uses
   `fetch()` or XHR for its own files: data loads through `<script src>` tags and audio through `Audio`
   elements. The game's scripts in `js/` are classic scripts, never ES modules. Requests to the cloud
   API over https are fine.
2. **No third-party requests.** The page loads nothing from another site — no CDN script, no hosted
   font. A third-party file is copied into `vendor/` as released and pinned in `vendor/SHA256SUMS`. The
   only exceptions are the game's own backend and its sign-in service (Amazon Cognito). The site's
   content security policy (`_headers`) enforces this, and also forbids inline scripts, `eval` and
   `on…=` attributes.
3. **Never hand-edit generated files**: `samples/<instr>.js` (built from the mp3s beside it),
   `voice/*.mp3`, `site/`, `backend/.aws-sam/`.
4. **Never rename or renumber a package or level ID.** Saved progress and the links between packages
   refer to them.
5. **Famous melodies are never rewritten.** Every tune in `FAMOUS` was checked against a real score. You
   may shorten one; you may not "fix" it by ear.
6. **The crafting toolbox belongs to each package**, never to the whole game.
7. **The backend refuses what it doesn't know.** A new package, region, voice, companion, meter or saved
   field changes `backend/src/validate.mjs` in the same pull request, and the backend is deployed before
   the game.
8. **A new runtime asset folder goes in the build**, `cloudflare-build.sh`, and gets a cache rule in
   `_headers` — otherwise it is missing on the live site.
9. **Only the owner merges**, because every push to `main` deploys the live game at
   https://tunegarden.game.

## 4. Proposing a change

Everything starts on [GitHub issues](https://github.com/pad29/music-garden/issues). The owner tracks the
project's own work in Linear, which copies its tickets into GitHub issues — so many issues you see are
the owner's plans. **The owner decides what is worked on, and when.**

- **A bug fix, a test, or a docs correction:** open a pull request straight away. An issue first is
  welcome but not needed.
- **Anything larger — a quest, a level, a package, a new feature:** open an issue first, using the
  *Idea* template. Say what the player would experience, and wait for the owner's yes before you build
  it. All of these are welcome; the next sections say which parts the owner finishes for you.
- **An existing issue you'd like to take:** say so in a comment first, so two people don't do the same
  work. For anything larger than a bug fix, wait for the owner to say it's yours.

## 5. Making the change

Work on a branch of your fork. Keep a pull request to one change. Write commit subjects as a short
imperative that says what changes for the player ("Let the free tunes carry sixteenth-note bars").

Run the syntax check and the tests after every edit, and play the change in a real browser — the tests
can't hear audio or see the screen. Then, depending on what you touched:

- **Anything that loads files** (samples, narration, scripts): also test it by opening `index.html`
  directly, not only through the server. That is where a forbidden `fetch()` shows up.
- **Game logic** (detectors, goals, the song format): add or update a test (`tests/README.md`).
- **A design doc's subject**: update the doc that owns it — `DESIGN.md`, `PACKAGES.md`,
  `PACKAGES-DETAILED.md`, `SAVE-SHARE.md`, `QUESTS.md` or `MAKING-QUESTS.md`. The docs are how the next
  person understands your change.
- **Samples**: put the mp3s in `samples/<instr>/`, rebuild with `node tools/build-samples.mjs`, and add
  a credit — README § [Key conventions](README.md#key-conventions-follow-these-when-adding-content) and
  `CREDITS.md` say how.
- **When notes are played** (the audio scheduler): capture the playback goldens before and after
  (`tools/goldens/README.md`).
- **A vendored file**: update `vendor/README.md` and `vendor/SHA256SUMS`.

## 6. What the owner does for you

Some steps need the owner's accounts or judgment. Do everything else, and say in your pull request which
of these it needs:

- **Narration.** Story text — a level's `intro:` or `credit:`, an instrument's description — is read
  aloud from recorded clips. The clips are made with `node tools/gen-voice.mjs`, which needs the owner's
  Amazon Web Services account. Write the text; the owner records it before merging. You can run
  `node tools/gen-voice.mjs --dry` to see which clips your change needs — it costs nothing and calls
  nothing. Never add or edit files in `voice/`.
- **The backend.** If your change needs `backend/src/validate.mjs` changed (rule 7), make that change and
  its test; the owner deploys the backend before merging the game.
- **Famous melodies.** A new one needs a real score as its source, a public-domain status, and a row in
  `CREDITS.md` § Famous melodies. The owner checks it against the score.
- **The music.** Whether a quest, level or package feels right — its difficulty, its wording for a child,
  its sound — is decided by playing it. Expect the owner to ask for changes.

What that means for each kind of new content:

- **A quest** is data: you can finish it yourself, following `MAKING-QUESTS.md`. Quest text is spoken by
  the browser's own voice today, so it needs no clips.
- **A new level in an existing package** needs its narration recorded by the owner, and must fit its
  package's difficulty ramp (`PACKAGES-DETAILED.md` § 0).
- **A new package** needs its narration recorded, and its ID added to the backend, which the owner
  deploys first. Agree its place on the map with the owner in the issue before you start.

## 7. The sign-off

Every commit needs a sign-off line at the end of its message:

```text
Signed-off-by: Your Name <you@example.com>
```

It says you have the right to contribute the change, as set out in the
[Developer Certificate of Origin](https://developercertificate.org/). There is no contributor agreement
to sign. `git commit -s` adds the line for you, from your `git config user.name` and `user.email`. Forgot
it? `git commit --amend -s` fixes the last commit, and `git rebase --signoff HEAD~3` the last three (use
your count). Either rewrites those commits, so if you had already pushed them, push your branch again
with `git push --force-with-lease`.

Your contribution is licensed like the files it changes — code under the AGPL, docs and narration under
CC BY-SA. [`CREDITS.md` § Licences at a glance](CREDITS.md#licences-at-a-glance) says which is which.

## 8. What happens to your pull request

Open it against `main`. The pull request template asks for the issue it answers, what changes for the
player, and the checks you ran. Then:

- **Automatic checks.** GitHub runs the syntax check and the tests on your pull request. On your first
  pull request they wait until the owner approves the run.
- **No preview link.** The project's preview builds don't run for pull requests from forks, so the owner
  tries your change on their own machine.
- **The owner's review.** The owner reads the change, plays it, and may ask for changes. The owner may
  also have an AI reviewer read it, and you may see its findings in the review. You need no AI tool,
  account or workflow file to contribute; the owner decides what is asked of you.
- **Merging.** Only the owner merges, and merging deploys the game to https://tunegarden.game at once.
  So a pull request can wait until the owner is ready to ship it, and the owner may say no to a change
  that doesn't fit — the issue first is how you avoid that.

## 9. Conduct and security

Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md); report a problem to
conduct@tunegarden.game. Found a security hole? Don't open an issue — [`SECURITY.md`](SECURITY.md) says
how to report it privately.
