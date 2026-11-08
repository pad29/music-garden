# AGENTS.md — Tune Garden

A browser game that teaches music theory through play ("Minecraft for music") — aimed at
kids 8+ but meant to appeal broadly. The whole app is `index.html` (markup and styles) plus the
classic scripts in `js/` that it loads, which hold all of its code (vanilla JS + Web Audio, no
dependencies, no framework, no build step),
plus two runtime asset folders it loads at startup: `voice/` (narration mp3s) and `samples/`
(instrument packs). Live at https://tunegarden.game — every push to `main` deploys.

## Commands

There is **no build step** — `index.html` and `js/` are the artifact.

Syntax-check every script the game loads — each local `<script src>` file (run after every edit
to the game):

```bash
node tools/check-syntax.mjs
```

The game's scripts are **synchronous classic scripts, never ES modules** (`file://`). Every tool reads
them through `tests/helpers/game-scripts.mjs`, in document order. Initialization may use only
already-initialized bindings and functions declared in the current or an earlier script; deferred
calls may use later scripts once loaded. `js/load-gate.js` stays the first game script and
`js/boot.js` the last (`README.md` § How the game's code is organized says why).

Run the tests (zero dependencies, Node's built-in runner — nothing to install):

```bash
node --test "tests/*.test.mjs"
```

Single test file: `node --test tests/detectors.test.mjs`. The suite is young and covers the
detectors; it loads the game into a stubbed-DOM vm context. **Read `tests/README.md` before
writing a test** — it explains the harness, what it can't reach (rendering and audio), and the
realm gotcha that makes `deepStrictEqual` fail on structurally identical arrays.

Serve locally: `npx http-server -p 8377 -c-1 .` → http://localhost:8377
Dev URL flags: `?dev` (level-jump dropdown, "relock instruments", "unlock quests", "clear quest runs"), `?reset` (wipe progress).

Regenerators — slow, overwrite generated files, run only when their inputs changed:

- `node tools/gen-voice.mjs` — required after **any** change to `intro:` / `credit:` /
  `INSTR_INFO` text. Needs AWS credentials (Amazon Polly). Skipping it is invisible in code
  and audible in the game: the browser TTS fallback speaks in the wrong voice.
  **Default to `--dry`** (lists what would change, makes no AWS calls, costs nothing) and only
  run it for real when you intend to. **Never run `--force`** — it regenerates all ~180 clips
  on Polly's `generative` engine, which costs real money, unless the owner explicitly asks.
- `node tools/build-samples.mjs` — after changing anything under `samples/<instr>/`.

Backend (rarely touched): `cd backend && sam build && sam deploy`. Needs AWS credentials.

## Hard invariants — never violate

- **No `fetch()` / XHR for local assets.** `index.html` must keep working when
  double-clicked (`file://`). Runtime data loads via `<script src>` (`samples/*.js`) or
  `Audio` elements (`voice/*.mp3`). https cloud APIs are exempt.
- **Never hand-edit generated files:** `samples/<instr>.js` (built from
  `samples/<instr>/*.mp3`), `voice/*.mp3`, `site/`, `backend/.aws-sam/`.
- **Package and level IDs are stable slugs — never renumber or rename them.** Both
  `requires:` graphs and saved player progress reference them.
- **`FAMOUS` melodies are score-validated.** Never "fix" one by ear. Shortening a piece is
  allowed; rewriting it is not.
- **The crafting toolbox is per-package, never global.**
- **Any new runtime asset folder must be added to the `netlify.toml` build command**, or it is
  missing in production: an asset folder fails silently behind the game's fallbacks, and a `js/`
  file is served as `index.html` by the catch-all rewrite, which stops the game from starting.
- **Never push to `main` or merge a PR unless the owner explicitly asks.** Every push to `main`
  deploys to production. A Claude session may commit and push its own `claude/…` branch and open PRs.

## Where to find things

- What the game is, which `js/` file holds which section of its code (a file → sections map), repo
  map, conventions → `README.md` — **read this first, always**
- Product requirements and pillars → `REQUIREMENTS.md`
- Vision, the "musical physics" engine, dated feature log, palette architecture → `DESIGN.md`
- Package catalog + dependency DAG, spec template, shared vocabularies → `PACKAGES.md`
- As-built level specs + the difficulty-ramp doctrine every package follows → `PACKAGES-DETAILED.md`
- Song save/share format (pitch-based v3) and the Studio → `SAVE-SHARE.md`
- Where the editor is headed (notes-as-objects, lenses, chromatic lattice) → `EDITOR-DESIGN.md`
- How quests work, the ordered quest kinds, and the declarative quest schema → `QUESTS.md`
- Backend (Cognito + API Gateway + DynamoDB) → `backend/README.md`
- Audio-scheduler playback goldens and the console-capture procedure → `tools/goldens/README.md`
- What GPT flagged in each review and what was done → `reviews/` (one file per ticket; older history
  in `REVIEW-LOG.md`, closed 2026-09-27)

Read the relevant doc before designing. Don't infer intent from code alone — the rationale
lives in these docs, not in the code.

## Current reality vs. what the docs describe

The design docs state intent alongside fact. Where they differ, this is the reality:

- `EDITOR-DESIGN.md` is a **plan, not current state.** Notes-as-objects, lenses,
  duration/dynamics editing, multi-voice, and sections are **not built**. Today the grid is
  column-based, single-voice, fixed 8th-note steps.
- `PACKAGES.md` catalogs packages that are specced but not yet built. Only the packages
  listed as shipped in `README.md` § "Current status" exist in the game (`js/packages.js`).
- `README.md` says "no test suite yet" and calls the syntax check "the smoke test we run after
  every edit". A real `tests/` suite now exists (see § Commands) — but it is young and covers
  only detectors, so the syntax check plus browser verification is still the floor, not the
  ceiling.

## How changes are verified

Three layers, in order of cost:

1. **Syntax check** — always, after every edit.
2. **`node --test`** — for anything with logic behind it: detectors, goal `chk` functions,
   palette maths, the song format. If you changed pure logic and wrote no test, say so
   explicitly rather than letting it pass silently.
3. **A real browser** — the only way to verify rendering, audio, and whether a level is
   actually playable. Load the page, jump to the level with `?dev`, play it. Anything touching
   asset loading must **also** be tested on the `file://` path (open `index.html` directly) —
   that is where fetch-based mistakes surface.

`tools/goldens/playback.json` pins what the audio scheduler *sounds like* (which rows and drum
lanes fire, at which step). Re-capture per `tools/goldens/README.md` before and after touching
scheduling code.

## What "done" means

Syntax check passes → `node --test "tests/*.test.mjs"` passes → behavior verified in a real
browser (and on `file://` if assets are involved) → `gen-voice.mjs` re-run if narration text
changed → the design docs
(`DESIGN.md`, `PACKAGES*.md`, `SAVE-SHARE.md`, `QUESTS.md`) updated to record what landed → reported to
the owner. Merging to `main` happens only on the owner's explicit request.
