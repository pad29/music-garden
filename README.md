# 🌱 Tune Garden

A browser game that teaches music theory through play — **"Minecraft for music."** Players compose real-sounding music by placing simple visual elements and *feel* musical concepts (tension, resolution, harmony, contour, pulse) long before they meet the names. Audience skews to children 8+, but is meant to appeal broadly.

**Live:** https://tunegarden.game/ (Netlify, auto-deploys from this repo on every push to `main`)

> Status: working browser game (no dependencies, no build step), in active development. **20 packages built** across 7 regions (the 13-level intro + 19 expansion packages, including the full Weather of Wanting harmony arc), the first two **quests** (*The Firefly Crossing*, *The Waking Woods*), Studio + cloud song sharing, spoken narration, a famous-melody Jukebox, an interactive world map, and seven sampled instrument voices. Backend deployed. See **[Current status](#current-status--whats-next)**.

---

## Quick start

The whole game is **`index.html`** — the page's markup and styles — and the classic scripts in **`js/`** that it loads, which hold all of the game's code (vanilla JS + Web Audio, no dependencies, no build step), plus two runtime asset folders (`voice/` narration clips, `samples/` instrument packs).

- **Run it:** open `index.html` directly in a browser (file:// works — the game is built to survive it), **or** serve the folder:
  ```bash
  npx http-server -p 8377 -c-1 .
  # then open http://localhost:8377
  ```
  In an AO session, `ao preview start` serves the session's worktree instead, on a loopback port AO picks (`.ao/launch.json`); `work-ticket` § 6 says how a worker opens and checks it.
- **Syntax-check the game's scripts** (the fastest check — run after every edit):
  ```bash
  node tools/check-syntax.mjs
  ```
- **Run the tests** (zero dependencies — Node's built-in runner, nothing to install):
  ```bash
  node --test "tests/*.test.mjs"
  ```
  A young suite: it covers detectors and pure logic by loading the game into a stubbed-DOM vm context, and cannot reach rendering or audio. Read `tests/README.md` before writing one.
- **Dev URL flags:** append `?dev` to reveal a level-jump dropdown, "🔒 Relock instruments" (replays the region discovery cards without touching progress), "🗝️ Unlock quests" (marks every quest's prerequisite packages complete, so its Home card appears without playing them) and "🧹 Clear quest runs" (deletes every quest run and completion record, so the quests are unplayed again); `?reset` wipes local progress.
- **⚠️ file:// constraint:** the game must keep working when `index.html` is double-clicked. That means **no `fetch()`/XHR for local assets** — runtime data loads via `<script src>` tags (see `samples/*.js`) or `Audio` elements (`voice/*.mp3`) — and the game's own code in `js/` is **classic scripts, never ES modules**, which do not load from file://. Cloud APIs (https) are exempt.

---

## Repository map

| Path | What it is |
|---|---|
| **`index.html`** | The page: markup and styles, and the `<script src>` tags that load the game's code from `js/`, in order. It holds no game code of its own. With `js/`, the source of truth for the app. |
| **`js/`** | The game's code: 29 classic scripts that `index.html` loads with `<script src>` tags, in order — `js/load-gate.js` first, `js/boot.js` last. See [How the game's code is organized](#how-the-games-code-is-organized) for which sections live in which file. |
| **`REQUIREMENTS.md`** | Product requirements & pillars. |
| **`DESIGN.md`** | High-level design — the "musical physics" engine, crafting tree, play modes, the full feature log (everything built, dated). |
| **`PACKAGES.md`** | The package **catalog / dependency graph (DAG)**: regions, capability clusters, the spec template, shared vocabularies, and the high-level package specs with build status. |
| **`PACKAGES-DETAILED.md`** | Level-by-level as-built specs for every shipped expansion package, plus the **difficulty-ramp doctrine** every package follows. |
| **`EDITOR-DESIGN.md`** | The **long-term editor design**: notes-as-objects + lens architecture, the chromatic lattice with lighting-as-tonality (draggable HOME + mode switch), duration/dynamics/multi-voice/sections plans, and the build phases that unblock the remaining package waves. |
| **`SAVE-SHARE.md`** | The save/share system spec (pitch-based v3 song format, Studio, cloud songs) — **implemented** (P1–P3). |
| **`QUESTS.md`** | The **quest play mode**: vocabulary, the declarative quest schema, the ordered quest kinds, and the decision record. **Kind 1 ships**, in two quests (*The Firefly Crossing*, *The Waking Woods*) — reachable from the world map. Kinds 2–9 are still intent. |
| **`voice/`** | Pre-baked narration mp3s (Amazon Polly), one per spoken line, keyed by text hash. Regenerate with `tools/gen-voice.mjs` after changing any `intro:`/`credit:` text. |
| **`samples/`** | Sampled-instrument packs. `samples/<instr>/*.mp3` are the source recordings; `samples/<instr>.js` is the base64 pack the game actually loads (script-tag, file://-safe). Rebuild with `tools/build-samples.mjs`. |
| **`tools/`** | Node build scripts: `gen-voice.mjs` (Polly narration clips — needs AWS creds), `build-samples.mjs` (packs sample mp3s into loadable JS), `check-syntax.mjs` (syntax-checks every script the game loads). |
| **`backend/`** | AWS SAM backend (Cognito auth + per-user progress API + cloud songs API on DynamoDB). `template.yaml`, `src/*.mjs`, `README.md` (deploy guide), `samconfig.toml`. |
| **`netlify.toml`** | Git-based deploy config: copies `index.html` + `js/` + `voice/` + `samples/` into a clean publish dir. **Add any new runtime asset folder here too** — a missing `js/` file is served as `index.html` and stops the game from starting (`tests/netlify-publish.test.mjs` checks the scripts). |
| **`reviews/`** | One file per ticket: GPT's design and Claude's critique, what GPT's test pass and AO's review flagged, and what was done. See `reviews/README.md`. |
| `REVIEW-LOG.md` | The same record for everything before 2026-09-28, in one file — closed, kept as history. |
| `.claude/` | The Claude/GPT workflow, run through Agent Orchestrator: the skills (`work-ticket`, `file-ticket`, `gpt-design`, `gpt-review`, `gpt-spec`), GPT's briefs and its `ask.sh` wrapper (`gpt/`). The policy is `CLAUDE.md`; what every agent must know is `AGENTS.md`. |
| `.ao/launch.json` | AO's preview config: `ao preview start` runs `http-server` in the session's worktree, bound to `127.0.0.1` on a port AO picks, and serves `index.html?dev`. Keep it to one configuration — with several, a bare `ao preview start` refuses to choose — and valid throughout: one bad entry makes AO reject them all. A worker's use of it: `work-ticket` § 6. |
| `site/` *(gitignored)* | Netlify's build output dir (generated by the netlify.toml command). |
| `archive/` *(gitignored)* | Feedback/brainstorm/brand source docs (`*.docx`) and finished hand-off briefs — decisions from them are folded into the `.md` files. Kept on disk, not in the repo. |

**Read order for picking up development:** this README → `DESIGN.md` (vision + what's built) → `PACKAGES.md` (the map & conventions) → `PACKAGES-DETAILED.md` (as-built level specs) → `SAVE-SHARE.md` (song format) → `EDITOR-DESIGN.md` (where the editor is headed) → then the `js/` files you're touching ([the map below](#how-the-games-code-is-organized) says which).

---

## How the game's code is organized

`index.html` is the page — markup and styles — and holds no game code. The game's code is one run of sections, each opened by a `// ---------- … ----------` landmark (search for these), split across classic script files in `js/` that `index.html` loads **in this order** (TUN-6 moved the first five out of the page's inline script, TUN-7 the rest):

| File | Sections |
|---|---|
| `js/load-gate.js` | **Must stay first.** The load gate: holds every kind of player input back until all the game's scripts have run, and notices one that failed to load (`LOAD_GATE_EVENTS`, `gameScriptsLoaded`, `openLoadGate`) |
| `js/palettes.js` | Music model: palettes (`PALETTES`, `setPalette`, `MIDI`/`NAMES`, `COLS`/`ROWS`, `grid`) · Tools (`widthBand`, `stableMidis`, `pairMeta`, `toolMeta`) with their real note/interval/chord names (`chordName`, `intervalName`) · the toolbox state |
| `js/audio.js` | The audio engine (`initAudio`, the mixer buses, `applyMix`) · sampled voices (`SAMPLED`, `loadSamples`, `sampleVoice`, `ringCeiling`) · `voice`, `playRow` |
| `js/band.js` | Jam backing (`bTone`/`kick`/`snare`/`hat`, `GROOVES`, `grooveFits`, `normalizeGroove`) · the band as data (`groovePlan`, `jamStep`) |
| `js/drums.js` | The drum sequencer (`DRUMS`, `drumG`, `buildDrums`, `drumClick`, `placeDrums`) |
| `js/doc-model.js` | The document model (`doc`, `freshDoc`, ticks and note IDs) · meter (`METERS`, `pulsesIn`, `meterLayout`, the beat tint) · the projection (`projectTracks`, `reproject`) · the undo journal (`tx`, `snapState`, `restoreSnapshot`, undo/redo) · model operations and time surgery · autosave |
| `js/grid.js` | The grid (`cells`, `buildGrid` — run once at load) · the hover note-name tip · the camera (`CAM`, `camEnsure`, `camTo`, `camReseed`) · zoom (`setFieldZoom`, `cycleZoom`, `lookOnly`) · pinch and the zoom tap (`armPinch`, `armZoomTap`) · the vine layer (`renderVines`) |
| `js/editing.js` | Pulling a vine · 🌿 Grow / ✂ Trim (`growTrim`) · field rebuilds (`rebuildField`, `addColumns`, `removeColumns`, `setCell`) · plant / fuse / stamp (`cellClick`, `craftFromCells`, `fusePick`, `fuseField`, `stampTool`) · the 🎒 Toolbox UI (`renderBag`, `toggleStamp`) |
| `js/tray.js` | The seed tray, 🧺 Scoop: select / move / copy / delete / transpose and time surgery (`enterTray`, `exitTray`, `trayMove`, `trayPaint`, `TRAY_CW`) |
| `js/cursor.js` | The cursor and the loop range (`cursorCol`, `loopStart`, `syncCursor`, `pinCursor`) · bar chips (`renderBars`) · the ☰ menu (`setSideMenu`) · the two lanes' scroll mirror, `showDrumArea` · ＋/－ room at the cursor |
| `js/goal-helpers.js` | The "Levels" landmark: what every goal's `chk(state, ev)` reads (`gridState`, `freshEv` and `ev`) · Twin Blooms (Plus) pair helpers (`pairTension`, `tensionThenRest`) · Standing Towers (`colStands`) · tool counts · echo / call helpers (`echoMatch`, `echoHint`, `playPhrase`) |
| `js/famous.js` | The famous library (`FAMOUS`, `FAMOUS_TEMPO`) and its capstone reveal (`placeFamous`, `playFamous`, `revealFamous`) |
| `js/detectors.js` | The per-package detectors, one landmark per package: contour (`contourSeq`, `isRising`…), motion, motifs, pulse and density (`setBeatGuide`, `drumHits`…), duration, the F/B colour reveal (`isLockedRow`), phrase Q&A, cadence, mood, progressions (`CHORDS`, `chordSyms`…), inversions, graded tension · the compare pickers (`showChoices`…) |
| `js/packages.js` | The surprise reveals the intro's arcs fire (`runReveal`, `structureReveal` — first, because `PACKAGES` names one as it loads) · `PACKAGES`, every package and level · `PACKAGES.studio` · `widestPalette` |
| `js/completion.js` | Completion sessions: proof that a pass was heard (`reduceCompletionSession`, `completionDispatch`, `beginCompletionSession`), and the quest receipt it hands on (`onCompletePass`) |
| `js/quest-catalog.js` | The sealed quest catalog: the plain-JSON gate and the closed grammar (`assertPlainJsonTree`, `QT`, `QUEST_SCHEMA_V1`…`V3`, `questCrossRefs`) |
| `js/quest-engine.js` | What the engine can look for (`songEvidence`, `questRegistry`, `QUEST_PRIMITIVES`, `QUEST_DESCRIPTORS`, the capability / control / tool / transition / payoff / theme registries, the generated tasks `QUEST_SETUP_KINDS`, readiness, `questSemantics`) · what the garden says back (`evaluateQuest`, `questRenderTokens`) · `loadQuestCatalog` and the built-in catalog JSON |
| `js/quest-run.js` | The QuestRun and its persistence (`reduceQuestRun`, `saveQuestRuns`, `hydrateQuestRuns`) · the phase gate and the offering (`questPhaseGate`, `finalizeQuestOffering`) · entering a quest (`enterQuestRun`, `performQuestAction`) · who may begin, and the Home card (`questEligibility`, `questHomeCard`) |
| `js/quest-shell.js` | The quest shell (`questShellModel`, `renderQuestShell`, `leaveQuest`, `startQuestRun`, `transactQuestRun`) · the finale |
| `js/play-scope.js` | The play scope (`setPlayScope` — first called at load — `activeScope`, `curStage`, `scopeFeatures`, `restoreLastPackage`, package unlocks) · **read-aloud narration** (`narrate`, `speakOn`, `voiceHash`, `enterPlay`) |
| `js/level-engine.js` | The level engine (`renderLevel`, `renderStage`, `checkLevel`, `stageComplete`, `resetTransient`) · power cards and the package-complete congrats · the world strip · companions (`COMPANIONS`, `REGIONS`, `REGION_MAP`) · the Next button |
| `js/playback.js` | Playback controls (`instrEl`, `tempoEl`, `setVoice`) · the gradual instrument reveal (`REGION_INSTR`, `INSTR_INFO` — narrated) · the Transport lookahead scheduler (`bookColumn`, `pump`, `start`, `stop`) · the click · the control wiring (▶, Jam, groove, meter…) · keyboard shortcuts |
| `js/helpers.js` | The status line (`setStatus`, `setStatusText`), `toast`, `confetti` · **starter content and the 💡 Hint button** (`setMelody`, `setMelodyLens`, `hintMelody`) |
| `js/persistence.js` | The `Store` seam, and `progress` (read from storage at load) · `commitProgress`, `saveUserSettings`, `savePackageProgress` · the per-scope toolbox (`loadScopeToolbox`) |
| `js/save-share.js` | Save & Share: the v3 song format (`currentSong`, `applySong`, `encodeSong` / `decodeSong`), share links, My Melodies and the Jukebox list (`JUKEBOX_FAMOUS`, `openMelodies`) · the 🎚️ Mixer |
| `js/home.js` | Home / profile (`openHome`, `renderQuestHome`, `openPkg`, `openStudio`) · the continent map (`CONTINENT`, `renderPkgs`, `splitPolyN`) |
| `js/cloud.js` | Cognito accounts and progress sync (`AUTH`, `userPool`, `onSignedIn`, `applyProgress`) · cloud songs (`cloudSongCreate` / `Get` / `List` / `Delete`) · the sign-in panel (`renderAuth`) |
| `js/living-garden.js` | Flowers that bloom as notes play (`bloom`, `noteFlower`) and the growing flower bed (`updateGarden`) |
| `js/boot.js` | **Must stay last.** The load-time sequence: it asks the load gate first, then `?reset`, the saved settings, the quest catalog and runs, `restoreLastPackage()`, the first render, a `#s=` / `#song=` link, the `?dev` bar, the landing screen and the first-load gate |

Every file is a classic script, so its top-level names are globals shared with every other script. **While loading, a script may use only what is already initialized and the functions declared in it or an earlier script; code that runs later, once everything has loaded, may call into any of them.** A load-time call ahead into a later file throws — in the browser and in the test harness alike (`tests/README.md`). The few load-time calls left mid-file (`buildGrid()`, `setPlayScope(…)`, the `progress` read) reach only earlier files; everything else that runs once at load is in `js/boot.js`.

**The browser runs other work between two scripts** — input, timers, a resize — which one inline script never allowed. That is why `js/load-gate.js` comes first: until the page has loaded, player input never reaches a half-loaded game, and a game script that fails to arrive or throws keeps `js/boot.js` from starting the game at all (it asks the gate before anything else, so a broken load never saves). The one gap, accepted on purpose: if `js/load-gate.js` itself fails to arrive, nothing holds input back — but boot still refuses, because the guard it calls does not exist. `tests/load-gate.test.mjs` fails if a new kind of input listener is wired without being added to the gate. A new file needs only its `<script src>` tag, at the right point in the order: `netlify.toml` copies all of `js/`, and the tests and tools read the page's script list.

Key landmarks:

**Data model**
- `PALETTES` / `setPalette()` (`js/palettes.js`) — the per-package pitch sets. `pentatonic` (10 rows: C D E G A) is the default; `diatonic` (14 rows: adds F & B) is the widened world from the `two-new-colors` milestone. A package declares `palette:"diatonic"`; `setPalette` swaps the active `MIDI`/`NAMES`/`ROWS`/`TONIC_PC` and rebuilds the grid on entry. The physics reason in **real semitones**, so they work for any palette unchanged (see `DESIGN.md` §11 "Palette-system architecture").
- `MIDI` / `NAMES` (`js/palettes.js`) — the **active** palette's pitch set (reassigned by `setPalette`). The player thinks in even "ladder steps" even though the rungs are uneven in semitones (see `DESIGN.md` §7).
- `PACKAGES = { <id>: { id, name, region, requires:[…], palette?, desc, levels:[…] } }` — the flat catalog keyed by **stable slug IDs**; dependencies form a DAG via `requires`. An optional `palette` widens that package's pitch set. `PACKAGES.studio` is a hidden non-DAG node (the free-play Studio).
- A **level** is a data object: `{ name, intro, teach?, goals:[{id,label,chk,play}], hint, setup, power, … }`. Multi-step levels use `steps:[…]`. Levels can carry flags like `contour`, `beatGuide`, `phrase`, `density`, `colors:[…]` (staged F/B reveal), `rhythm`, `drums`, `mood` (sun/moon wash), `famous` (capstone reward), `unlock:[…]`, `loop`.
- `REGIONS = { <id>: { name, friend:{name,stages} } }` — per-region companion creatures. `REGION_MAP` — the ordered player-facing region list (id, emoji, name, blurb, brand color) that drives the world map.
- `FAMOUS = { <id>: { title, credit, mel:[[midi,col]…], chords?, drums?, cols, jukebox? } }` — the score-validated famous-melody library ("🎧 Hear a famous one" capstone rewards + the Jukebox). `FAMOUS_TEMPO` maps each to its real ♩ BPM; `JUKEBOX_FAMOUS` lists the 15 Jukebox songs. **Melodies are validated against real scores** (several transcribed note-for-note by the owner via save-links) — don't "fix" them by ear.

**Engine**
- `renderLevel()` → sets up unlocks/layout for a level, then `renderStage()` renders the current step; `checkLevel()` evaluates goals; `stageComplete()` advances. `resetTransient()` wipes playback/UI between stages.
- Goals are **action-based**: `chk(state, ev)` reads what the player *did* (`ev` flags) or the grid state, never accidental state. A `play:true` goal only completes after all other goals are met **and** Play was pressed.

**Audio** (Web Audio)
- `initAudio()` (`js/audio.js`) builds three mixer buses under `master`: `voiceBus` (melody), `jamBus` (backing band), `drumBus` (drum sequencer). `applyMix()` applies the player's 🎚️ Mixer settings.
- `voice(instr,freq,t)` (`js/audio.js`) plays one melody note. One synth voice remains player-facing (music box — the default & brand sound) + **sampled voices** via `SAMPLED`/`loadSamples()`/`sampleVoice()`: real recordings (piano = Salamander Grand, CC-BY; marimba + vibraphone + glockenspiel = VCSL, CC0; kalimba + guitar = FreePats, CC0; harp = Etherealwinds Harp II CE, CC-BY); the glockenspiel is a transposing voice (`up:24` — sounds 2 octaves above the grid, like real orchestration). Samples ship as base64 in `samples/<instr>.js`, load lazily via a script tag (never fetch — file:// must work), get conditioned once at decode (trim/normalize/peak-cap), and fall back to a synth while loading (synth marimba backs marimba; synth pluck backs guitar). The "warm pad" and "pluck" voices were retired (old saves fall back via `setVoice`: pad → music box, pluck → guitar).
- **Gradual instrument reveal**: `REGION_INSTR` maps each region to its instrument (Studio → guitar); on first entry `applyRegionInstrument()` unlocks it with a discovery card (`INSTR_INFO` — each `intro:` line is narrated, so re-run `gen-voice.mjs` after editing) and every package entry defaults the voice to its region's instrument. Unlocks persist in `progress.instruments` (`ensureInstruments()` migrates older saves from visited regions). Locked voices are *hidden* in the picker but still settable by code, so shared songs always play with their author's voice.
- Narration: `speakLine()` plays a pre-baked Polly mp3 from `voice/` keyed by `voiceHash(toSpeech(text))`, falling back to browser speechSynthesis if a clip is missing (that fallback = the "wrong voice" symptom → run `node tools/gen-voice.mjs`).

**Mechanics / detectors** (these are the reusable building blocks for packages)
- **Quests** (declarative, data-not-code — a quest is JSON, never a `chk` closure, so a player-facing Questmaker stays reachable): `loadQuestCatalog(json, sourceKind)` → the plain-JSON gate + closed v1 grammar + `questCrossRefs()` + `questSemantics()`; the closed registries every id resolves against — `QUEST_PRIMITIVES` (musical analyzers and procedural gates in one id space), `QUEST_DESCRIPTORS`, `QUEST_CAPABILITIES`, `QUEST_CONTROLS`, `QUEST_TOOLS`, `QUEST_TRANSITIONS`, `QUEST_COMPLETION_ACTIONS`, `QUEST_PAYOFFS`, `QUEST_THEMES`, `QUEST_GROOVES`; `songEvidence()` + `questWorkspaceMismatch()` → `evaluateQuest()`; `reduceQuestRun()` / `transactQuestRun()`; `enterQuestRun()` / `performQuestAction()`; `questShellModel()` + `renderQuestShell()` (the `#questCard` panel); `questEligibility()` / `surfaceQuest()` / `renderQuestHome()` (the one calm card below the map). See `QUESTS.md`.
- **Contour** (melody shape): `contourSeqFromGrid()` (pure) with `contourSeq()` as its live-grid wrapper, `isRising/isFalling/isHovering/isArch/isTwoArcs/isJourney`, `extrema()` (prominence-based peak counting), the `#contourGhost` SVG target-path overlay.
- **Motion**: `motionsOf()` + `isStepwise/isOneJump/isGentle/isBold/isStaircase/isLandSoftly` (steps vs. leaps).
- **Pulse/rhythm**: the drum sequencer (`DRUMS`, `drumG`, `buildDrums`, `placeDrums` — `js/drums.js`), `gridNotesOnBeats()`, `setBeatGuide()`, density detectors (`drumHits/isBreathing/isSyncopated`) + the `#densityMeter`.
- **Harmony**: `widthBand()` pair personalities (close/bright/open) and `stableMidis` towers (both `js/palettes.js`), tension (`craftedTense/craftedClash/craftedTritone/tensionThenRest`), major/minor (`countBrightChords/countWistfulChords`), and the **chord-progression machinery** (`CHORDS` I/IV/V/vi grid shapes, `placeProg`, `chordSyms`, `hasChordRun`, `startsOnDegree/endsOnDegree`, `leadingToneResolves`) behind the Weather of Wanting packages.
- **Phrase**: the call/answer timeline split (`setPhraseGuide`, `answerEndsHome/answerEndsOpen`), cadence detectors (`endPC/approachPC`, `fullArrival/halfClose`).
- **Compare pickers** (the recognition pattern): `showChoices` (melodies), `showPairChoices` (intervals/chords), `showDrumChoices`/`showPatternChoices` (rhythm), `showProgChoices` (progressions). All require **auditioning all options** before a pick counts.
- **Crafting**: `fuse()` (combine seeds → interval/chord tools), `stampTool()`, the 🎒 Toolbox — **per-package** (each package has its own bag; don't reintroduce a global one).

**Progression & meta**
- **Power cards** (`showPower`), the **world strip** (`renderWorld`), **companions** (`syncCompanion`/`checkEvolve` — one friend per region, grows per completed package), the **package-complete congrats** (`showCongrats`/`newlyUnlocked`).
- **🎧 Hear a famous one:** a capstone level with `famous:"<id>"` offers a reward reveal — the player's just-learned construct alive in a real piece, planted on the grid and played at its real tempo, with a spoken credit.
- **🗺️ World map** (`CONTINENT` + `renderPkgs`): the Home screen is a hand-drawn SVG continent — one land per region, auto-split into one territory per package (`splitPolyN`), radiating outward from the First Garden in unlock order. Solid line = region, dashed = package; glyphs: 🔒 locked / ✓ complete / ▶ open. Labels/glyphs are auto-contained (`fitLabels`, `glyphSpot`). Internal borders are **shared point sequences** — to reshape, move a junction in every land that lists it.
- **🎵 Studio & Jukebox:** the Studio is the dedicated free-play sandbox (widest unlocked palette, full toolbox, save/share). The Jukebox plays the famous-melody library.
- **Narration/instruction tiering:** story + task text prominent, theory (`teach:`) dimmed; 🔊 read-aloud toggle (default ON) speaks the story text via the baked Polly clips.

**Persistence** — everything goes through one **`Store` seam** (`Store.get/set`) so localStorage ↔ cloud is a swap with no game-code changes. `saveProgress()` writes progress; signed-in users sync to the cloud (debounced, newest-wins). Songs use the **pitch-based v3 format** (`SAVE-SHARE.md`): small songs share via `#s=` links, big ones via cloud `#song=<id>` links.

---

## Key conventions (follow these when adding content)

- **Hidden curriculum, visible powers.** Internally a theory DAG; to the player it's regions, powers, and discoveries — never "scales-7." (`DESIGN.md` §2b.)
- **The difficulty-ramp doctrine** (`PACKAGES-DETAILED.md` §0): every ~8-level package escalates — teach the atoms → combine → apply/repair → recognize/compare → a harder *compound* challenge → an integrative capstone — and ends with an **optional free-play finale** that fires the completion congrats. Tolerances tighten as levels climb.
- **Success logic per level:** `broad` by default (many valid answers — expression leakage is good), `targeted` for the structural middle, `exact` almost never (echo/ear-training only). No quizzes.
- **Palette staging:** pentatonic (10 rows) is the default; the **`two-new-colors` milestone** widens to **diatonic** (14 rows, adds F then B). Palette is a per-package property; the physics already reason in real semitones so they need no change. Cadence/function packages are gated behind the diatonic milestone. (`PACKAGES.md` §1a; `DESIGN.md` §11.)
- **IDs are stable slugs**, never positional codes — referenced by both `requires` and saved progress. Never renumber.
- **Companions:** one friend per region; you pick a starter for the intro; each later region has its own creature that grows one stage per completed package. Players don't swap their main friend.
- **Famous melodies are score-validated.** Every `FAMOUS` entry was checked against a real score (several typed in note-for-note by the owner). 1 column = one 8th note; tied notes must be **re-struck** (plucked voices decay — a literal tie renders as silence). Shorten a piece if needed, but **never rewrite it** — if a passage can't render on the grid (accidentals, sub-8th rhythms), pick a different piece.
- **After changing narration text**, run `node tools/gen-voice.mjs` (changed text = new hash = missing clip = browser-TTS fallback that sounds wrong).
- **New sampled instrument:** put mp3s in `samples/<instr>/`, add it to `tools/build-samples.mjs`, run it, add a `SAMPLED` entry + `<option>`. Load via script tag only. Keep CC0/CC-BY sources and credit CC-BY in the map footer (`.mapcred`; CC0 like VCSL needs no credit). WAV sources (e.g. VCSL) convert with `tools/wav2mp3.mjs` (needs `npm install @breezystack/lamejs`).

---

## Current status & what's next

**Built & shipped (20 packages / 7 regions):**

| Region | Packages |
|---|---|
| 🌱 The First Garden | `intro` "Garden Basics" (13 levels, 4 awakening arcs) |
| 🎶 Paths of Song | `follow-the-fireflies` (contour) · `stepping-stones` (steps/leaps) · `question-and-answer` (phrase Q&A) · `tiny-motifs` (motif repeat/vary/flip) |
| 🥁 Pulse Woods | `footsteps` (pulse/subdivision) · `wind-and-gaps` (rests/density, R2-lite) · `off-the-path` (syncopation/push/swing feel) · `two-kinds-of-walking` (note duration, R3) — region complete |
| 🏛️ Stone Chorus Canyon | `twin-blooms` (interval personality) · `standing-towers` (triads) · `twin-blooms-plus` (tension/tritone, diatonic) · `shifting-shadows` (inversions/voicing, diatonic) · `soft-wobble-strong-wobble` (graded tension, diatonic) — region complete |
| 🌈 The Color Spring | `two-new-colors` ★ milestone (pentatonic→diatonic; F then B) |
| 🌦️ Weather of Wanting | `ways-home` (cadence strength) · `river-turns` (progressions, I-IV-V-vi) · `pull-of-the-moon` (dominant pull) · `false-doors` (deceptive cadence) |
| 🌗 The Twin Gardens | `sun-and-moon-garden` (major/minor mood) |

**Platform & polish shipped:** accounts + cloud progress sync (Cognito/DynamoDB, deployed); **save/share v3** (pitch-based; `#s=` + cloud `#song=<id>` links) + the **Studio**; **spoken narration** (182 pre-baked Polly clips, read-aloud default ON) with **instruction tiering** (story prominent, theory dimmed); **🎧 famous-example rewards** on capstones + the **Jukebox** (15 score-validated songs incl. Ode to Joy, Amazing Grace, The Moldau, Big Ben, Goin' Home, I Got Rhythm, Bach's Prelude in C, Chopsticks); the **Tune Garden light brand theme** (Fredoka/Nunito, token palette, per-region field colors); the **interactive continent map** Home screen; **seven sampled voices** — piano, marimba, kalimba, guitar, harp, vibraphone, glockenspiel (Salamander & Etherealwinds CC-BY / VCSL & FreePats CC0, lazy-loaded, synth fallbacks; warm pad + synth pluck retired) — revealed **gradually, one per region**, each with a narrated discovery card; 🎚️ Mixer; landing screen; `tunegarden.game` domain with git-based Netlify deploys.

**Quests shipped:** **Kind 1**, in two quests (see `QUESTS.md`). A quest is a cross-package commission
rather than a lesson: compose a path, make a second version of it, compare the two and offer the one you
choose. ***The Firefly Crossing*** asks for a shape over a steady pulse once `follow-the-fireflies` and
`footsteps` are complete; ***The Waking Woods*** asks for a tune that lands on the beat — Footsteps' own
melody idea, with the beat columns glowing — once `intro` and `footsteps` are. One appears as a calm card below the world map and the rest sit on the quest trail, and
each saves an ordinary v3 song you own. Quests are **declarative data** — the definition is validated
JSON with no executable callbacks anywhere, and **every id it writes resolves against a closed engine
registry**, so an author cannot name a control, tool, transition, payoff or theme the engine does not
have. The Waking Woods was added as data alone, with no engine branch: that is `QUESTS.md` Q9's
authorability acceptance test, and passing it is what keeps a player-facing Questmaker reachable.

Each run is **dealt its own task**: three landmark stones, spaced apart and away from the edges, planted
on the field before you start, and a short **opening drum fragment** — two or three hits in the first two
beats, drawn from a small authored pool — ringed on the drum pads. Keeping the stones and travelling
between them, and keeping the opening and carrying the beat on in your own way, is the commission, and a
phase will not move on until the crossing is that. The catalog *proves*, over the whole pool, that no
opening can make a suggested heartbeat impossible. One sentence above the field says which of those is still missing,
never a row of ticks — and **nothing ever tells you a way "did not come out"**: the engine evaluates its
routes, and the friends simply describe what they heard, which is Q5's anti-checklist rule and Q6's
descriptive response meeting in the same place. The last phase is two controls, not six: tap a path to
hear it and hold it, then offer the one you are holding. **Flutter and Hopper are on screen**, in the
sidebar the region companion grows in, carrying the observations in their own voices — who speaks is
worked out from the analyzer that produced each sentence, so a friend can only say what its own
capability heard, and never approves or disapproves of your music. Offering ends in a real finale: confetti, your chosen path
playing, both friends dancing, and the song named and saved to your melodies.

**Next up (see `PACKAGES.md` §5–6 for the full map):**
1. `march-and-waltz` (PW-5) — the parked meter material; needs triple groupings beyond fixed 4/4
2. Quest kinds 2–9 — `QUESTS.md` §8 has the order; the Questmaker is the last of them
3. Bigger systems: multi-voice (Region 6), sections (Region 7), Styles/Eras

The long-term threads live in `DESIGN.md` §12 (living-world visuals, collection view, remix/social, style worlds).

---

## Backend

Deployed serverless stack (`music-garden`, us-east-1): Cognito User Pool → API Gateway (JWT authorizer) → Lambdas → DynamoDB. Two APIs: `GET/PUT /progress` (per-user progress row) and the **songs API** (`POST/GET/PUT/DELETE /songs`, `GET /songs?mine` — cloud song storage; `GET /songs/{id}` is unauthenticated for link-resolution). The client embeds the **public** Cognito/API IDs (safe to commit). Anonymous play is fully local; creating an account turns on cloud sync. CORS is scoped to `tunegarden.game` (+ Netlify fallback).

To redeploy backend changes:
```bash
cd backend
sam build && sam deploy
```
See `backend/README.md` for first-time setup. Remaining pre-launch TODO: AWS budget alert.

---

## Deployment

**Git-based Netlify deploy** — push to `main` and Netlify builds automatically (`netlify.toml` copies `index.html` + `js/` + `voice/` + `samples/` into the publish dir). Domain: **https://tunegarden.game** (site name `music-garden.netlify.app` — infra IDs keep the old working name; branding is Tune Garden).

⚠️ If you add a runtime asset folder, **add it to the `netlify.toml` build command** or it silently won't exist in production (the game's fallbacks can mask this — e.g. missing samples just means the synth voice plays). Code is not silent: the catch-all rewrite serves `index.html` in place of a missing `js/` file, the browser cannot parse it, and the game never starts. The game also expects to live at the site root — at a nested path like `/a/` its relative `js/` URLs miss in the same way.

---

## Dev workflow we use

Work runs through **Agent Orchestrator (AO)**, one Linear ticket at a time: GPT designs it and Claude critiques the design → Claude implements and tests → GPT adds tests against its design → Claude opens a PR, which AO's reviewer (GPT) reviews → the owner playtests and merges. `CLAUDE.md` holds the loop; the `work-ticket` skill holds the steps. Every change passes the same checks:

1. Edit the `js/` file that holds the section you're changing ([the map](#how-the-games-code-is-organized) says which) — or `index.html` for markup and styles.
2. Syntax-check the game's scripts, then run the tests (commands above).
3. Verify behavior in a real browser — in an AO session, `ao preview start` (`work-ticket` § 6). **Also test the file:// path** for anything that loads assets.
4. If narration text changed: `node tools/gen-voice.mjs`. If samples changed: `node tools/build-samples.mjs`.
5. Push your own branch and open a PR. Only the owner merges — every push to `main` deploys to production.
6. Keep the design docs (`DESIGN.md`, `PACKAGES*.md`, `SAVE-SHARE.md`, `QUESTS.md`) updated as features land — they are the durable record that lets development resume cleanly.

🤖 Built collaboratively with Claude Code.
