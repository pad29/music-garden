# 🌱 Music Garden

A browser game that teaches music theory through play — **"Minecraft for music."** Players compose real-sounding music by placing simple visual elements and *feel* musical concepts (tension, resolution, harmony, contour, pulse) long before they meet the names. Audience skews to children 8+, but is meant to appeal broadly.

**Live (temporary, Netlify Drop):** https://music-garden.netlify.app/

> Status: working single-file prototype, in active development. Three packages built (the 13‑level intro + two expansion packages), backend deployed, package roadmap specced. See **[Current status](#current-status--whats-next)**.

---

## Quick start

The whole game is one dependency-free file: **`index.html`** (vanilla JS + Web Audio, no build step).

- **Run it:** open `index.html` directly in a browser, **or** serve the folder:
  ```bash
  npx http-server -p 8377 -c-1 .
  # then open http://localhost:8377
  ```
  (A `.claude/launch.json` is included so the Claude Code preview tool serves it on :8377.)
- **Syntax-check the inline script** (no test suite yet — this is the smoke test we run after every edit):
  ```bash
  node -e "new Function(require('fs').readFileSync('index.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1]); console.log('syntax OK')"
  ```
- **Dev URL flags:** append `?dev` to reveal a level-jump dropdown; `?reset` wipes local progress.

---

## Repository map

| Path | What it is |
|---|---|
| **`index.html`** | The entire game (HTML + CSS + JS, ~3000 lines). The source of truth for the app. |
| **`REQUIREMENTS.md`** | Product requirements & pillars. |
| **`DESIGN.md`** | High-level design — the "musical physics" engine, crafting tree, play modes, the full feature log (everything built, dated). |
| **`PACKAGES.md`** | The package **catalog / dependency graph (DAG)**: regions, capability clusters, the spec template, shared vocabularies, and 24 high-level package specs. |
| **`PACKAGES-DETAILED.md`** | Level-by-level detailed specs for the first 8 packages, plus the **difficulty-ramp doctrine** every package follows. |
| **`backend/`** | AWS SAM backend (Cognito auth + per-user progress API on DynamoDB). `template.yaml`, `src/*.mjs`, `README.md` (deploy guide), `samconfig.toml`. |
| `.claude/launch.json` | Dev-preview server config. |
| `site/` *(gitignored)* | Generated deploy copy of `index.html` for Netlify Drop. Regenerate: `cp index.html site/index.html`. |
| `*.docx` *(gitignored)* | Feedback/brainstorm source docs — design decisions from them are already folded into the `.md` files. |

**Read order for picking up development:** this README → `DESIGN.md` (vision + what's built) → `PACKAGES.md` (the map & conventions) → `PACKAGES-DETAILED.md` (the next packages to build) → then the `index.html` sections you're touching.

---

## How `index.html` is organized

It's one file, but cleanly sectioned. Key landmarks (search for these):

**Data model**
- `MIDI` / `NAMES` — the pentatonic pitch set (C D E G A across octaves). The engine reasons in **real semitones**, even though the player thinks in even "ladder steps" (see the architectural note in `DESIGN.md` §7).
- `PACKAGES = { <id>: { id, name, region, requires:[…], levels:[…] } }` — the flat catalog keyed by **stable slug IDs**; dependencies form a DAG via `requires`. Currently holds `intro`, `follow-the-fireflies`, `footsteps`.
- A **level** is a data object: `{ name, intro, goals:[{id,label,chk,play}], hint, setup, power, … }`. Multi-step levels use `steps:[…]`. Levels can carry flags like `contour`, `beatGuide`, `rhythm`, `drums`, `unlock:[…]`, `loop`.
- `REGIONS = { <id>: { name, friend:{name,stages} } }` — per-region companion creatures.

**Engine**
- `renderLevel()` → sets up unlocks/layout for a level, then `renderStage()` renders the current step; `checkLevel()` evaluates goals; `stageComplete()` advances. `resetTransient()` wipes playback/UI between stages.
- Goals are **action-based**: `chk(state, ev)` reads what the player *did* (`ev` flags) or the grid state, never accidental state. A `play:true` goal only completes after all other goals are met **and** Play was pressed.

**Audio** (Web Audio, synthesized)
- `initAudio()` builds three mixer buses under `master`: `voiceBus` (melody), `jamBus` (backing band), `drumBus` (drum sequencer). `applyMix()` applies the player's 🎚️ Mixer settings.

**Mechanics / detectors** (these are the reusable building blocks for packages)
- **Contour** (melody shape): `contourSeq()`, `isRising/isFalling/isHovering/isArch/isTwoArcs/isJourney`, `extrema()` (prominence-based peak counting), the `#contourGhost` SVG target-path overlay.
- **Pulse/rhythm**: the drum sequencer (`DRUMS`, `drumG`, `buildDrums`, `placeDrums`), `gridNotesOnBeats()`, `setBeatGuide()` (the `.beatcol` field tint).
- **Compare picker** (the recognition pattern): `showChoices`/`pickChoice` (melodies) and `showDrumChoices`/`pickDrumChoice` (drum patterns). Both require **auditioning all options** before a pick counts.
- **Crafting**: `fuse()` (combine seeds → interval/chord tools), `stampTool()`, the 🎒 Toolbox.

**Progression & meta**
- **Power cards** (`showPower`), the **world strip** (`renderWorld` — one emblem per completed level), **companions** (`syncCompanion`/`checkEvolve`/`friendStage` — one friend per region, grows per completed package), the **package-complete congrats** (`showCongrats`/`newlyUnlocked`).

**Persistence** — everything goes through one **`Store` seam** (`Store.get/set`) so localStorage ↔ cloud is a swap with no game-code changes. `saveProgress()` writes progress; signed-in users sync to the cloud (debounced, newest-wins). Save/Share is client-side via `#s=` URL hashes (no backend needed).

---

## Key conventions (follow these when adding content)

- **Hidden curriculum, visible powers.** Internally a theory DAG; to the player it's regions, powers, and discoveries — never "scales-7." (`DESIGN.md` §2b.)
- **The difficulty-ramp doctrine** (`PACKAGES-DETAILED.md` §0): every ~8-level package escalates — teach the atoms → combine → apply/repair → recognize/compare → a harder *compound* challenge → an integrative capstone — and ends with an **optional free-play finale** that fires the completion congrats. Tolerances tighten as levels climb.
- **Success logic per level:** `broad` by default (many valid answers — expression leakage is good), `targeted` for the structural middle, `exact` almost never (echo/ear-training only). No quizzes.
- **Palette staging:** the engine is **pentatonic** today (can't-sound-bad). Harmony/function/modes need a future **`two-new-colors`** milestone that progressively widens to diatonic (add F, then B). Melody & rhythm packages ship on the current engine; cadence-style packages are gated. (`PACKAGES.md` §1a.)
- **IDs are stable slugs**, never positional codes — referenced by both `requires` and saved progress. Never renumber.
- **Companions:** one friend per region; you pick a starter for the intro; each later region has its own creature that grows one stage per completed package. Players don't swap their main friend.

---

## Current status & what's next

**Built & shipped:**
- **Intro — `intro` "🌱 Garden Basics"** (13 levels, 4 "awakening arcs": Voice / Pulse / Shape / Weaving). Plant, home/resolution, jam grooves, drum sequencer, crafting (intervals/chords), power cards, per-arc surprise reveals, starter companion.
- **`follow-the-fireflies`** (Paths of Song region, 9 levels) — melodic **contour**: rise/fall/hover/arc → repair (4 steps) → compare → two-hills → journey capstone → free-play finale. Companion: Flutter 🦋.
- **`footsteps`** (Pulse Woods region, 9 levels) — steady **pulse**: 4-beat → walking subdivision → backbeat → melody-on-beat → repair the drift → drum-compare → full groove → groove+melody capstone → finale. Companion: Hopper 🐸.
- **`stepping-stones`** (Paths of Song, 9 levels) — melodic **motion**: steps vs. leaps, staircases (scale runs), leap-then-step landings, smooth-the-bridge repair, compare, steps+leap capstone.
- **`twin-blooms`** (Stone Chorus Canyon, 9 levels) — interval/**pair personality**: close / bright / open pairs, the "same distance, new feel" uneven-ladder insight, pair compare, mood-matching, contrasting beds. Companion: Geo 💎.
- **`standing-towers`** (Stone Chorus Canyon, 9 levels) — **triads / stable shapes**: build, complete, recognize stand-vs-wobble, twin towers, repair, stamp/reuse, ring a canyon.
- **`question-and-answer`** (Paths of Song, 9 levels) — phrase **open/closed**: a call/answer timeline split (cols 0–7 = call, 8–15 = answer); reply → recognize the closed ending → land home → mirror the call → same-thought-new-ending → calm vs. bold answers → repair an open answer → compose both halves.
- **Platform:** profiles + progress persistence (local-first, `Store` seam); **AWS backend deployed** (Cognito username+password, no email required; per-user progress on DynamoDB); 🗺️ Home **world map** (regions + companions + lock state from the DAG); landing/welcome screen; Save/Share via `#s=` links; 🎚️ Mixer.

**Next up (build order, per `PACKAGES-DETAILED.md`):**
1. `wind-and-gaps` — rests & rhythmic space (R2-lite on the drum grid)
2. **`two-new-colors` milestone** — the pentatonic→diatonic widening (engine work; also resolves the tool-transposition model)
3. `ways-home` — cadence strength (requires the diatonic milestone; grades the same open/closed seam by *degree*)

The bigger long-term threads (logged in `DESIGN.md` §12): a player-facing **world-map UI**, a **collection/menagerie view** for companions, living-world visuals, the **bars & plots** duration editor, multi-voice arrangement, and the Styles/Eras "Atlas of Styles."

---

## Backend

Deployed serverless stack (`music-garden`, us-east-1): Cognito User Pool → API Gateway (JWT authorizer) → one Lambda (`GET/PUT /progress`) → DynamoDB (one row per user). The client embeds the **public** Cognito/API IDs (safe to commit). Anonymous play is fully local; creating an account turns on cloud sync.

To redeploy backend changes:
```bash
cd backend
sam build && sam deploy
```
See `backend/README.md` for the full first-time setup (IAM key → AWS CLI → SAM CLI). CORS is scoped to the Netlify origin; remaining pre-launch TODO: AWS budget alert.

---

## Deployment

Static site — currently **Netlify Drop**. Refresh the deploy copy and drag the `site/` folder (or just `index.html`) to https://app.netlify.com/drop:
```bash
cp index.html site/index.html   # (PowerShell: Copy-Item index.html site/index.html -Force)
```
Can move to AWS hosting later (it's a single static file).

---

## Dev workflow we use

1. Edit `index.html`.
2. Syntax-check the inline script (command above).
3. Verify behavior in a browser / the preview tool (no automated tests yet; we test via runtime inspection).
4. Refresh `site/index.html` before deploying.
5. Keep the design docs (`DESIGN.md`, `PACKAGES*.md`) updated as features land — they are the durable record that lets development resume cleanly.

🤖 Built collaboratively with Claude Code.
