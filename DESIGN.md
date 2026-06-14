# Music Garden — High-Level Design

*How we satisfy the requirements. Companion to REQUIREMENTS.md.*
Last updated: 2026-06-11

---

## 1. The core idea: "musical physics"

The whole game sits on one engine:

> **The world has "musical physics": a constraint system (a current key, scale, rhythmic grid, and chord context) that makes anything the player does sound good.**

Like Minecraft blocks that always snap and never look broken, notes here snap to a musical context, so within the rails **every placement is consonant and musical**. The engine quietly handles the parts a beginner can't (voice-leading, staying in key).

This single idea resolves the hardest requirements at once:

- **Fun + function-first (#2, #6):** you learn the rules by *feeling* what the physics allow — tension/resolution becomes "gravity," not a definition.
- **Novices producing real music (#4):** you can't make ugly mistakes, so you experiment freely.
- **Styles & Eras (#11, #12):** a style or era is simply **a different physics preset** — a palette of scales, chord vocabularies, voice-leading rules, rhythmic feels, and instruments. *Build the engine once; styles, eras, lessons, and quests become data on top of it.* This is what gives the game Minecraft-scale content without infinite engineering.

**Mental model:** *Learning = mastering the current physics. Progress = the physics loosening (more freedom) + traveling to new worlds with new physics.*

### Rigor grows with the player

The same engine widens its rails over time (satisfying "toy → rigorous", #5):

| Stage | Palette (physics) | Why it fits the stage |
|---|---|---|
| First minutes | **Pentatonic** (5 notes) | No "wrong" combinations exist — pure toy, instant success |
| Early | **Diatonic** (7 notes, one key) | Introduces notes that *want* to resolve — tension appears |
| Mid | **Chromatic** + key changes | Color, surprise, "wrong" notes used on purpose |
| Advanced | **Voice-leading / style rules**, then breakable | Real freedom *and* real responsibility — the "instrument" |

---

## 2. The spine: a music crafting tree

The progression that drives the game (and satisfies #4, #8) is a **crafting tree**, mirroring Minecraft's mine → craft loop applied to music:

```
single notes  →  combine 2 that belong together  →  INTERVAL  (saved as a tool)
intervals     →  stack into a shape that stands up →  CHORD     (saved as a tool)
chords        →  arrange in sequence              →  PROGRESSION (saved as a tool)
notes/scales  →  walk a path with a step-pattern   →  SCALE/MODE (saved as a tool)
progression + melody  →  combine                   →  a PHRASE / section
... → styles → eras
```

- A **tool** isn't just inventory; it's a **reusable object you stamp down as one piece**, so you stop thinking in notes and start operating on chords, then progressions — exactly the "operate increasingly complex structures" goal.
- The growing **toolbox** is a visible tech tree: players chase the next unlock (retention, #8).
- The order matches how real musicians actually internalize theory.

---

## 2b. Hidden curriculum, visible powers — the three-layer architecture *(decided 2026-06-11)*

The theory/package DAG is the **internal** backbone, never the player's mental model. The trap to avoid: "a game that teaches music theory systematically" — progression-as-curriculum-completion is exactly where competitors plateau.

| Layer | Audience | Contents |
|---|---|---|
| **1. World** (player-facing) | what players see | worlds/biomes (styles/eras), regions ("Rhythm Forest", "Harmony Valley"), nodes = puzzles/quests/challenges/discoveries, characters, powers |
| **2. Capabilities** (game mechanics) | what players gain | abilities/"powers": *build stable structures, create tension, resolve phrases, color your sound, bend the rules* |
| **3. Theory graph** (hidden) | what we build | the package DAG (§11b) — drives gating, progression, and content reuse; players never see "scales-1" |

Consequences:

- **Packages represent capabilities, not topics** — "Create tension" (dissonance), not "intervals-2". Each capability = 1+ packages internally.
- **Four parallel motivation tracks share the same packages:** **Learning** (lessons/puzzles, tight scaffolding), **Exploration** (new worlds = new physics presets, unlocked by capability mastery), **Creation** (songs/gardens/performances → identity & expression), **Social** (remix, co-create, showcase). One package unlocks progress on all four.
- **Quests are not longer lessons** — they are goal-driven *expressive* challenges combining several packages ("make this world feel calm again" = resolution + rhythm + chord choices).
- **Sandbox is where packages become powers** — everything learned must transfer there and feel like power, not constraint.
- **Level systems over level design** *(future, for scale)*: a package defines concept + skill + mechanic + 3–5 level **templates** ("finish the phrase", "resolve tension", "match feel", "build under constraint") that generate variations, instead of 10–20 hand-built levels.
- Progression reads as *unlocking abilities, opening regions, upgrading tools* — never "completing the curriculum."

---

## 3. Social & co-op

Social (especially co-op composing) is a primary retention lever and is intended from early on. One important reframing:

> **Not live, millisecond-synchronized "jamming"** (internet latency makes that brutal) **— instead a shared, *looping* musical world that players edit together.**

A loop plays and repeats; players add/move/remove elements, and everyone hears the updated version on the next pass. It feels alive and collaborative ("a shared garden that's always singing") but is **edit-synchronized, not audio-synchronized**, so latency stops mattering.

**Roles make co-op musically coherent** (and satisfy #7): each player tends a complementary voice — **bass / melody / rhythm / harmony**. This is how bands actually work, teaches arrangement and texture wordlessly, and stops everyone from fighting over the same notes. In solo play, you switch roles yourself or let the physics auto-fill the rest.

---

## 4. Symbolic ↔ notation: one data, many lenses

We don't force a choice between "game world" and "notation":

> **It's all one underlying musical data, viewed through different lenses.**

- **Default lens:** the lush symbolic world — melody horizontal (time), harmony vertical (pitch); scales as paths, chords as shapes/constellations, tension as weather/tilt/light.
- **Optional "score lens":** a toggle that fades the world toward real notation for players crossing into "serious composing" — same notes, formal rendering. Notation becomes a *destination you grow into*, and discovering "what I built is real sheet music" is itself a motivating reveal.

---

## 5. Play modes (one shared world & engine)

| Mode | Length | Purpose | Serves |
|---|---|---|---|
| **Lessons / Puzzles** | 2–5 min | Learn one new thing; ramp difficulty | #5, mobile-friendly later |
| **Quests** | 10–20 min | Apply skills to a themed goal; explore a style/era | #11, #12, narrative pull |
| **Open World / Sandbox** | endless | Build, collaborate, share, show off | #1 broad appeal, #8 retention, the "Minecraft" core |

**The Minecraft loop:** puzzles and quests **unlock tools and physics presets** that you then bring into the sandbox — learning feels like acquiring power, not homework.

---

## 6. How concepts map to mechanics

| Music concept | Game mechanic |
|---|---|
| Two dimensions of music | Horizontal = time/melody, vertical = pitch/harmony |
| 12 notes / octave | A bounded set of rows/positions; the octave as a closed loop |
| Scale step-patterns | Spacing of stepping stones / terrain you traverse |
| Chord construction | Stacking notes into a shape that "stands up" vs. "wobbles" |
| Tension & resolution | Weather/tilt/light; a note or chord that "wants" to go home; the world *settles* on resolution |
| Instruments / timbre | Voices/characters you assign lines to |
| Dynamics *(parked idea)* | Watering/fertilizing a seed → louder/softer note |
| Ear-training | Diegetic challenges (navigate by ear at "night"), never quizzes |

---

## 7. Technical architecture (direction)

- **Client:** all real-time work in the browser — audio synthesis/playback, game logic, the constraint engine. Start dependency-free; adopt a framework/audio library (e.g. Web Audio + a thin layer) as needed.
- **Audio:** Web Audio API. Prototype uses lightweight oscillator synthesis with a generated-impulse reverb; production plan is a small curated set of **sampled** instruments, cached client-side.
- **Data model:** the unit is musical data (notes/intervals/chords as pitch + time + voice), modeled so the **score lens**, **tools**, and **shared looping world** all read the same structure. Design it social-ready even while v1 is solo.
- **Backend (AWS):** accounts/auth, save/load progress, later social/collaboration & sharing. Keep it thin; computation stays client-side.
- **Key engineering principle (learned from a prototype bug):** **the engine reasons in real pitch (semitones) even while the player thinks in friendly "ladder steps."** The pentatonic ladder is a *useful lie* — its rungs are uneven (C→D = 2 semitones, but A→C = 3), so ladder-adjacency is a false signal for consonance. Measuring real pitch keeps results correct (e.g. chord inversions agree on whether they "stand up"). This seam is exactly where the physics later widen from pentatonic to the full 12 notes.

---

## 8. Competitive positioning

Existing products each occupy **one** bucket; none combine them:

| Bucket | Examples | Strength | Gap |
|---|---|---|---|
| Toys / sandboxes | Chrome Music Lab Song Maker, Incredibox, Groove Pizza | Instant fun | No progression/goals/learning |
| Gamified theory drills | Hooktheory, Theta Music Trainer | Real theory | You answer, don't create |
| Learn-to-play | Yousician, Simply Piano | Strong retention | Reproduce, not compose |
| Guided lessons | Ableton Learning Music | Function-first, beautiful | Not a game; not for young kids |
| Creation tools | Soundtrap, BandLab, MuseScore | Real music, some collab | Intimidating; no scaffolding/fun |

The closest neighbor to our **crafting tree** is a *research* prototype, **ArchiTone** (LEGO-style blocks → chords across leveled stages) — unpolished, single-player, no world or social.

**Our moat is the intersection no one occupies:** real game progression (crafting tree) **+** function-first "musical physics" that scales toy→rigor **+** actual composition **+** co-op persistent world with styles/eras. The model to emulate is **DragonBox / Prodigy**, which beat "drill apps" in math by being *real games that happen to teach*. Nobody has done the DragonBox-for-music.

The visible things that move us out of the "toy" category: the **growing toolbox**, **goals with a win**, and a **map of styles/eras** to travel through.

---

## 9. Scope & roadmap

**Principle: design for everything, build a thin slice.** Building the engine first makes later content cheap (it's mostly data).

- **v1 — prove the core (solo "wow"):** constraint engine + 2D world + quick-puzzle mode + ~one physics preset (pentatonic) + audio playback + accounts/save. Data modeled for social. No social yet.
- **v2:** sandbox mode + async social (share/remix a loop) + first real "styles" (more physics presets).
- **v3:** co-op shared looping world (roles) + the "score lens" + style/era progression as an explorable map.
- **Later:** mobile app, deeper notation export, creator/community features.

---

## 10. Prototype status (as of 2026-06-07)

A working, dependency-free, single-file browser prototype: `index.html` (vanilla Web Audio).
**Live (temporary): https://music-garden.netlify.app/** — deployable as a static site with **no backend** (Netlify Drop; the `site/` folder holds the deploy copy of `index.html`). Validated: share-links open the exact melody on any device.

**Implemented:**
- Pentatonic grid — horizontal = time, vertical = pitch; click to hear instantly.
- 4 instrument voices; loop toggle; tempo. Toolbar split into an **action row** (Play/Loop/Jam/Fuse/Hint/Clear/More) and a **settings row** (Voice/Tempo); the Fuse button has a fixed width so toggling 🔨 Fuse ↔ ✓ Save doesn't reflow the layout.
- Tonic ("home") rows highlighted; the world **settles** when a tonic plays (felt resolution).
- Note names on hover only.
- **Crafting tree rungs 1–3:** Fuse 2 seeds → an **interval** tool; 3 seeds → a **chord** tool. Crafting is **restricted to a single column** (harmony = vertical = same time; across columns = melody/time) — both an interaction rule and a teaching invariant.
- **One-mode UX:** the player lives in "plant" mode; Fuse and Stamp are one-shot actions (the 🔨 Fuse button itself toggles on → ✓ Save; fusing/stamping auto-returns to planting).
- **Toolbox:** each tool shows a **mini diagram of its own shape**; click a tool to **hear it** (block chord); real interval/chord names on hover (major/minor/sus2/sus4/dim/aug recognizer).
- **Stand-up vs. wobble:** chords/pairs with notes a 3rd-or-wider apart "stand"; 2nds "wobble" — measured in **real pitch (semitones)** so inversions agree.
- **Stamp** a tool to place a whole interval/chord as one unit (stays in-scale via ladder-step placement).
- **🎸 Jam mode (pure-play):** a looping backing groove (drums + bass + sustained chords) plays while the player taps melody that fits automatically; the grid also loops, so you build a melody over the groove live. **5 selectable grooves** (Pop / Ballad / Doo-wop / Lo-fi / Folk), each with its own **chord progression, per-groove tempo, bass pattern, drum kit, and swing/shuffle feel** — switchable live. Mixed under the player on a separate backing bus. (This is the seed of the eventual Styles & Eras system: a style ≈ progression + bass feel + drums + tempo + swing + instruments.)
- **Expandable canvas + paged scroll:** **➕ / −** (right edge of the field) add/remove a bar (16 cols, min one bar); **the drum lane extends/shrinks with the field** (drums span the whole field, column-aligned); the grid scrolls horizontally and the playhead view turns one 16-column "page" at a time during playback.
- **🥁 Rhythm / drum sequencer:** a 16-step, 3-lane sequencer (Kick / Snare / Hi-hat, reusing the jam drum sounds) shown **below the seed field** (layered on top, not instead of it); beats loop, main beats are visually marked. Drum cells are **round "pads" in a distinct palette** (steel-blue → warm-orange when hit) so they read as beats, not seed/note tiles, and are **column-aligned with the field** (the field gained a matching left label gutter). Clear also clears drums when they're visible. A **🥁 Beat toggle** controls the lane: forced-on in rhythm levels (toggle hidden), on-by-default in the capstone and **Free Play**, and an opt-in elsewhere — so a player can layer their own beat under a melody in any unlocked level. **Free Play is now a mini-studio** (melody + own beat + jam groove + chords, looping by default); the crafting levels stay decluttered (beat off unless toggled).
- **💡 Context-aware Hint:** replaces the old "Surprise me" — drops in an *example relevant to the current level* (a melody on field levels, the correct note on "Finish the Song", kick/snare/hat patterns on rhythm levels, an interval/tower/wobbler shape on craft levels). Hidden on levels with no hint (e.g. the capstone). Per-level `hint()` function.
- **💾 Save / 🔗 Share / 📂 My Melodies (client-side, no backend):** a versioned **song format** `{v,cols,notes,drums,groove,tempo,voice}`. Share encodes the song into the URL hash (`#s=…`) and copies a link (which strips any `?dev`/`#dev`); opening such a link lands in the **editable Free Play studio** with the melody loaded and a "from a friend" banner. Save stores melodies in `localStorage`; My Melodies (top-right 📂) lists them with Load / copy-link / delete. The three actions live in a **top-right icon strip** (icon-only, hover labels) to keep the toolbar clean.
- **➕ More room** is a tall muted button on the **right edge of the field** (relocated from the toolbar; shown only where unlocked — Free Play).
- **🗺️ World map (Home screen, 2026-06-14):** the 🏡 Home screen ("Your World") is now a **region map** instead of a flat package list. An ordered `REGION_MAP` renders each region as a themed biome panel (emoji + name + blurb + colored left border): **The First Garden** (intro), **Paths of Song**, **Pulse Woods**, plus "coming soon ✨" teasers for future regions (Stone Chorus Canyon, Weather of Wanting) to show the world is bigger. Each open region shows **its companion friend at its current growth stage** (emoji + dots) — so the friend referenced in the in-game card is now visible on the map and tied to its region. Packages are nodes under their region (progress bar, lock state with "Finish first: X", Play/Resume/Restart). A header shows total **"powers earned"** (completed levels across all packages) for a sense of journey. Region/friend helpers generalized: `regionFriend(reg)`/`regionStage(reg)`/`arcEndsFor(levels)` work for any region (the in-game `currentFriend`/`friendStage` are now thin wrappers). **Future:** spatial map with connecting paths, region "awakened" bloom states, a companion collection view.
- **🌱 Landing / welcome screen (2026-06-14):** first-load gate so returning account-holders aren't dropped straight into level 1 + the companion picker. Shows a short game description + **▶ Start playing** (→ companion picker → play as guest) and **☁️ Sign in to resume** (inline username/password → `cogSignIn` → `onSignedIn` pulls cloud progress → resumes). First-load logic: shared `#s=` link → studio; an existing Cognito session → auto-resume; else a brand-new/signed-out visitor (no `progress.companion`) → landing. Returning guests with local progress skip the landing and resume directly. (`showLanding`/`hideLanding`/`doLandingSignIn`.)
- **🎚️ Mixer (2026-06-12):** a single 🎚️ icon in the top-right utility strip opens a small panel with three live sliders — **Melody / Band / Drums** (0–200%, default 100%) — so players can fix the relative balance (a daughter playtest ask). Audio is split into three buses under `master`: `voiceBus` (player melody/previews/echo), `jamBus` (jam band: bass + chords + jam's own drums), `drumBus` (the drum sequencer pads); the shared drum primitives (`kick`/`snare`/`hat`/`noiseHit`/`bTone`) take an optional destination defaulting to `jamBus`, and the sequencer passes `drumBus`. `mix={voice,band,drums}` multipliers × base gains (1.0 / 0.45 / 0.45 — so 100% reproduces the original balance) via `applyMix()`; stored in `progress.settings.mix` (cloud-synced), live-applied on slide, Reset returns to 100%. **The redundant static instructions blurb under the title was removed** (the level card already carries the how-to).
- **Dev-only level jump:** add `?dev` (or `#dev`) to the URL to reveal a "jump to level" dropdown for testing — hidden from real users, and never included in share-links.
- **Action-based goals:** goals check what the player *did* (placed/crafted/previewed/stamped/jammed/drummed), never accidental grid state. A `play:true` goal ("Press ▶") only completes once **all other goals in the level are done AND** Play was pressed; "played" resets on any edit, so it always means "play your finished version." "Finish the Song" requires the exact correct note in the exact spot.
- **Progressive unlocks:** features stay hidden until the level that introduces them, then remain available (cumulative). Jam unlocks at "Jam Along", Drums at "Feel the Beat", Fuse+Toolbox at "Craft a Pair", More-room at "Free Play"; an unlock toast announces each. (Per-level `unlock:[...]`, accumulated by `unlockedSet`.)
- **🔊 Listen & Echo (call-and-response ear-training):** a 🔊 Listen button plays a short pentatonic phrase (auto-plays once on entry); the player reproduces it by ear on the field (clicking cells gives pitch feedback to match). Goal checks an exact match of the placed notes vs. the target; Hint reveals the phrase. Three tunes via the step engine. Visual-first principle preserved — it's diegetic ear-training, not a "name that interval" quiz.
- **Multi-step levels (`steps:[…]`):** a level can be a sequence of stages, each with its own `intro`/`setup`/`drumSetup`/`goals`/`hint`. The engine renders one stage at a time with an `(n/total)` indicator, resets the canvas cleanly between stages, advances step-by-step, then completes the level after the last. Reusable scaffolding for future complex lessons (verse → chorus → arrange). (`renderLevel` = level-wide setup/unlocks; `renderStage` = current stage; `curStage()` resolves stage vs. single level.)
- **Guided campaign (13 levels), field-first with layered drums — restructured 2026-06-11 into four player-facing "awakening arcs"** (powers, not lessons; the fiction: a dormant garden wakes as you play): **Arc I — Voice** 🎤: Wake the Seeds (plant & play) → Find Home (tonic/settle) → **Call the Band** (Jam — *moved up to level 3* so the most game-like fun arrives while curiosity is highest) → **Finish the Path** (3 tunes, multi-step: Mary Had a Little Lamb → Hot Cross Buns → Au clair de la lune — relight each tune's dark final stone; exact-match kept, language reframed as restoration not test-taking) → **Answer the Garden** (ear-training: a creature calls, answer it — 3 calls). **Arc II — Pulse** 💓: Wake the Heartbeat (kick on 4 beats; unlock Drums) → Make It March (backbeat) → Hold the Pulse (hi-hats). **Arc III — Shape** 🔗: **Bind Two Voices** (unlock Fuse/Toolbox; 2 steps: a pair, then a *different* pair) → **Raise a Chorus** (Towers, 2 steps) → **Wake the Storm** (Wobblers, 2 steps). **Arc IV — Weaving** 🪄: **Make the Garden Sing** (capstone reframed as *restoring the last clearing*: groove + heartbeat + stamped structure + end home) → **Your Garden** (Free Play with creative spark prompts; unlock More room). The "different X" steps are enforced by the toolbox only keeping distinct shapes (`countTools` by type). The seed field is always present so the main canvas never changes function; goals check the *action taken* (drums placed / crafted / previewed / stamped / jammed), not accidental grid state. Every level/stage fully resets transient state on entry (playback/jam/modes/grids); the toolbox persists across levels.
- **Companion / identity thread (2026-06-12):** at first launch (no `progress.companion` yet, skipped for `#s=` share visitors) a **picker** offers three garden friends — Sprout 🌱→🌿→☘️→🪴→🌳, Chirpy 🥚→🐣→🐤→🐦→🕊️, Twinkle ✨→💫→⭐→🌟→🌠 (`COMPANIONS` map, 5 stages each = base + one per arc). The chosen friend lives in a **Companion card** atop the right sidebar (visible from level 1, above the Toolbox), shows stage dots, and **bobs to the music** (`compReact()` on each note played/planted). It **evolves one stage per completed arc**: `companionStage()` counts how many `arcEnds()` thresholds (levels 5/8/11/13 for intro) the package's `done` count has passed. Evolution is **deferred behind the power card** — `checkEvolve()` sets `pendingEvolve` while the card is up, and `closePow()` fires `playEvolve()` (emoji swap + grow animation + "✨ Sprout grew into 🌿!" toast) once claimed, so it never collides with the reveal. Stored in `progress.companion` (syncs via the cloud Store seam like all progress); `?reset` clears it → picker returns. Future: signature musical-style fingerprint, naming, quality-driven reactions.
- **Per-arc surprise reveals (2026-06-12) — "wait, I made THAT?":** one per arc, fired right after the player claims the arc-moment level's power card (`reveal:` on the level; `pendingReveal` → runs ~350ms after the card closes). **Arc I** (Call the Band): the player's melody replays over the jam groove with a gentle in-key harmony line added (a soft triangle 3rd, two ladder rungs below, on the backing bus). **Arc II** (Hold the Pulse): their groove replays while the whole garden pulses on the beat (field + drum lanes scale-pulse every 4 steps). **Arc III** (Raise a Chorus): their first Tower *rises* — arpeggio up, then the chord stands as one, with a big 🏛️ rising on screen. **Arc IV** (Make the Garden Sing): the full piece replays with jam + harmony + sync — "your music in full bloom." Implementation: `runReveal({jam,harm,sync,msg})` replays the player's own creation once (loop off) with temporary enhancement flags read by `tick()`, then `stop()` runs a restore closure (flags cleared, loop/jam state restored, "🤩 You made that!" toast); `resetTransient` drops any reveal in flight; `structureReveal()` is the custom Arc III moment. The 🎒 Toolbox bag also became scrollable (max-height ~3 rows) so a growing tool collection no longer pushes the Garden card off-screen.
- **Power cards & persistent world consequence (2026-06-11):** every level defines `power:{em,name,line}` — completing it pops a collectible **power card** overlay (NEW POWER · emoji · name · one fantasy sentence, e.g. *GROOVE — "You can call the band and play inside its motion."*). A **world strip** under the toolbar shows one emblem per level, permanently lighting up as levels complete (tracked as `pp.done` = levels *completed*, alongside `maxLevel` = levels *reached*) — a thin first slice of "every level visibly changes the world." Levels also carry an optional `intent:` prompt ("✨ Can you make it feel complete?") shown ungraded after the goals are done — the seed of intent-based goals. Unlock toasts use power language ("🎸 Jam — call the band"); the arc tag (Arc I · 🎤 Voice) shows above the level title. Opening a shared `#s=` link suppresses the finale power card (`finaleQuiet`).

**Direction (2026-06-07): FUN-FIRST.** Prioritize playability/engagement over musical depth for now — perfect the simple beginner experience before adding complex theory (the real competitor is Roblox). Front-load creative "playing" levels over instructional ones; give players musical targets to reduce "random clicking to pass goals."

**Not yet built:** accounts/save, sampled audio, social/co-op, score lens, diatonic/chromatic widening — plus the prioritized fun backlog in §12.

---

## 11. Open decisions

- **Tool transposition model — RESOLVED 2026-06-13 as a phased hybrid** (see PACKAGES.md §1a): *shape-based* (current; always in key) stays the default through pentatonic + early diatonic; *mid-diatonic* adds a soft per-tool toggle — "keep this sound" vs "adapt to place" (no theory terms exposed); full *fixed-quality* transposition arrives at mastery, when intentional tension is the point. The original fork was shape-based (in key, quality drifts) vs fixed-quality (names hold, notes can leave key).
- **Diatonic transition — RESOLVED 2026-06-13 as a progressive reveal** (PACKAGES.md §1a), not an on/off switch: Phase 1 hidden color (the engine already plays F & B in jam backing) → Phase 2 guided one-note-at-a-time (F then B) → Phase 3 free diatonic. Preserves can't-sound-bad and player intuition across the cliff.
- Audio: confirm the sampled-instrument set and delivery/caching strategy.
- Exactly how/when names are surfaced as the game gets more advanced.

---

## 11b. Accounts, profiles & progress — the platform step (in progress)

**Goal:** sign-in, a profile, and progress that's saved and (eventually) follows the player across devices — the foundation for adding more **packages** (level sets) to complete/unlock. **No public gallery, no friends — sharing stays P2P** via the existing `#s=` links.

**Account model (decided):** anonymous-first → optional upgrade to **username + password (no PII, no email)** for cross-device. Recovery is the thing to design for (no email = no reset): give a **recovery code** at upgrade, plus an *optional* parent email **for recovery only**. Pseudonymous + no PII + no social keeps COPPA exposure minimal *(not legal advice; verify before launch; reassess if usernames could be real names or PII/social is added)*. Spam isn't a blocker (no public surface for spam accounts to exploit) — handle with signup rate-limiting/CAPTCHA if needed.

**Auth/stack (decided): AWS Cognito** — natively supports username+password without email (clean, vs. the email-as-username hack Firebase/Supabase require). Backend: Cognito (auth) + a small API + a DB (e.g. DynamoDB) holding one progress record per user. Client stays static; **all persistence goes through one `Store` seam** so localStorage → cloud is a swap with no game-code changes.

**Packages = a dependency GRAPH (DAG), not a tree or list.** Topics (chords, scales, intervals, rhythm…) each have ordered packages (chords-1, chords-2…), and a package can require *multiple* prerequisites across topics (chords-2 ← chords-1 AND intervals-2 AND scales-1). Built to scale to hundreds–thousands and eventually user-curated content. Chosen representation:
- **Flat catalog keyed by stable string IDs:** `PACKAGES = { "<id>": { id, name, topic, desc, requires:[ids], version, author, levels:[…] } }`. Edges live on nodes via `requires`. IDs are the contract (referenced by deps *and* by saved progress) — **never renumber**; use slugs; namespace user content (`user:alice/slug`).
- **Unlock is derived, never stored:** `isPkgUnlocked(id) = requires.every(reqMet)`. `requires` entries: a bare id = AND; a nested `[id,id]` = OR-group (supported now for the future).
- **Progress keyed by package ID** (map, never an index): `progress.packages[id] = { level, maxLevel, completed }`; plus global `progress.toolbox` (crafting inventory spans packages), `progress.current`, `progress.settings`.
- **Catalog vs. content split (for scale):** the small graph (ids/names/topic/requires) loads up front to draw the skill-tree and compute unlocks; heavy per-package `levels`/assets are **fetched on demand** when a package opens. Today the one `intro` node is inline; the `levels` slot becomes a lazy load later — same shape.

The current 13-level campaign is the `intro` node ("🌱 Garden Basics", `requires:[]`). Completing packages will later unlock cosmetics/voices.

**Package catalog → `PACKAGES.md` (started 2026-06-13).** The full map is designed in a dedicated `PACKAGES.md` (the design layer; compiles to the `PACKAGES` data object later). It holds: the finalized **package spec template**, shared **controlled vocabularies** (level-pattern types, difficulty tiers 1–5, and a required per-level **success-logic** field — broad/targeted/exact — the anti-quiz guardrail), 8 player-facing **regions** + 10 capability-cluster **tags**, and **24 high-level package specs** sequenced into build waves. Two foundational decisions (2026-06-13) drive the sequencing:
- **Palette-widening milestone:** the engine is pentatonic-only today, which *blocks* most harmony/function/color content (no leading tone, no F, only 2 clean triads, no semitones, no modes). Decision: ship **melody + rhythm packages first on the current pentatonic engine**, then a diegetic milestone node **`two-new-colors`** widens the engine to diatonic (adds F & B) and gates Regions 4–7. This is also where the §11 tool-transposition fork must be resolved. Waves: A Voice&Pulse (pentatonic) → B First Structures (pentatonic-thin) → ★ `two-new-colors` → C Harmony&Function → D Color → E Weaving&Story → bridge Style worlds.
- **IDs are slugs** (`follow-the-fireflies`), never positional codes; the `PS-1`/`PW-2` shorthands are display metadata only (applies the §11b "never renumber" rule).

Next-step plan (chosen 2026-06-13): finalize template → 24 high-level specs [done in PACKAGES.md] → **build `follow-the-fireflies` end-to-end** [DONE ✅ 2026-06-13] → then 8 detailed specs.

**`follow-the-fireflies` shipped (2026-06-13) — the second package, validating the multi-package DAG + a new mechanic.** It's a melodic-**contour** package (PS-1): the player shapes a line that rises / falls / hovers / arcs. New engine pieces, all reusing the existing level/goal/step system: a **contour detector** (`contourSeq` reads the top note per column as a height; `isRising`/`isFalling`/`isHovering`/`isArch`/`isSmoothRise`/`seqHasRiseReturn`, tuned lenient for broad success and stricter for the repair level); a **glowing target-path SVG overlay** (`#contourGhost`, drawn per stage from `st.contour` — guidance only, players match the *shape* not exact cells, preserving non-exact success); and a **compare-level picker** (`#choiceRow` + `showChoices`/`pickChoice`, the `compare` pattern). 8 levels: Wake the Trail (rise) → Come Back Down (fall) → Hovering Lights (hover) → Arc Across the Pond (arch) → Fix the Flight (repair a broken climb) → Choose the Best Path (compare 3) → Two Skies (2-step transform rise→hover) → Night Meadow Song (capstone: a rise *and* a return). Per-level power cards + 8-emblem world strip reuse the intro reward loop; jam/fuse/drums stay hidden (clean melody-only UI via the per-package `unlock` system); requires `intro` complete (DAG gating works via the Home screen). Validated in preview: all detectors, the ghost overlay geometry, the compare picker, completion → `pp.completed`, and ghost/choice cleanup on package switch — zero console errors.

**Presentation rule (2026-06-11, see §2b):** package *IDs* stay topic-slugs internally, but packages are *presented* as capabilities/powers ("Create tension", "Resolve phrases"), surfaced through a world map of regions and nodes — never as a visible curriculum list.

**Phased build:**
- **Phase A (no backend, local) — DONE ✅:** `Store` seam (localStorage now → cloud later); progress persists/resumes across reloads (current package/level, toolbox, settings); levels generalized into the **package DAG**; **🏡 Home screen** = editable profile name + package cards (progress bar, lock state via `requires`, Resume/Restart); **personalized title** ("Pasha's Music Garden" once a name is set). `?reset` wipes local progress for testing.
- **Phase B (Cognito) — SCAFFOLDED, awaiting deploy:** serverless architecture = **Cognito User Pool** (username+password, email optional for recovery; PreSignUp Lambda auto-confirms) → **API Gateway HTTP API** (built-in Cognito JWT authorizer) → **one Lambda** (`GET/PUT /progress`) → **DynamoDB** (one row per user, PK = `sub`). Anonymous = local-only (today's behavior); creating an account turns on **cloud sync** (local-first: load on login, debounced push; first sign-up uploads guest progress). Client stays a single static file (Cognito via `amazon-cognito-identity-js` CDN + `fetch` with the **ID token**). IaC lives in `backend/` (`template.yaml` SAM + `src/*.mjs` Lambdas + `README.md` deploy guide). **Remaining:** user runs `sam deploy`, sends the 4 outputs (Region/UserPoolId/ClientId/ApiUrl); then wire the client auth UI (in 🏡 Home) + flip the `Store` seam to sync. Hosting can move Netlify → AWS later (static file).

## 12. Parked ideas (backlog)

**Done ✅ (built since the 2026-06-07 fun-first pivot):** Jam mode with 5 grooves (tempo/bass/drums/swing per style); "Finish the Song" level (Mary Had a Little Lamb); "Jam Along" intro level; expandable canvas + paged horizontal scroll; pluck/pad volume balance; **rhythm drum sequencer + 3 rhythm-first levels**; **🥁 Beat toggle (drums layerable in Free Play/capstone/opt-in) — Free Play is now a mini-studio**; context-aware 💡 Hint; action-based `play:true` goals; toolbar reorg; drum-pad alignment & distinct styling.

**Save & Share — SHIPPED ✅ (client-side, no backend), and the app is DEPLOYED** at https://music-garden.netlify.app/ (temporary, Netlify Drop). Versioned song format, share-via-`#s=` link, localStorage library, "My Melodies" panel. Validated: links open the exact melody on any device — the growth loop works end-to-end.

**Now that sharing is validated, the next big fork is the backend** (only build if sharing catches on): accounts/sign-in, **cloud save** (melodies follow you across devices), lesson-progress persistence, and eventually a **gallery**. A public gallery for under-13 triggers **COPPA/moderation** obligations, so keep it friend-to-friend links until there's a moderation plan. Hosting can move from Netlify to AWS later (it's just a static file) when a backend is added.

**Near-term fun-first backlog (still to do):**
- **More "Finish the Song" tunes:** pentatonic-friendly familiar melodies (Mary Had a Little Lamb [built], Hot Cross Buns). *Note: Happy Birthday and Twinkle need notes outside pentatonic — revisit when the palette widens.*
- **Collectible voices/grooves & cosmetics** (achiever/collector appeal); **more grooves → real Styles system**; **living garden** (blooms as you compose). *(call-and-response/echo — done ✅)*
- **More grooves / styles** (and eventually wire grooves into a real Styles system).
- **Call-and-response / echo:** the garden sings a phrase, the player answers it.
- **Collection & cosmetics:** unlock instrument voices, seed/flower skins, garden decorations (Roblox-style collect/customize loop).
- **Living garden:** the scene visibly grows/blooms as you compose.

**Accepted from the 2026-06-11 feedback round (not yet built — roughly in priority order):**
- **Living responsive world:** garden visuals driven by *musical* state — consonance → stable growth, tension → flicker/lean/wind, resolution → bloom; a world "mood" (calm/tense/joyful) driven by chord function, tempo, density. Drum lanes get meaning: kick = roots pulse, snare = petals snap, hi-hat = fireflies shimmer. (World strip is the thin slice already shipped.)
- **Intent-based goals with loose evaluation:** "make it feel like night / build anticipation / make it dance" — partially guided, loosely graded. (Ungraded `intent:` prompts already shipped; grading is the open design problem.)
- ~~**Surprise reveals ("wait, I made THAT?")**~~ — **BUILT ✅ (2026-06-12, see §10):** one per arc, fired after the power card is claimed. Still open from the original idea: *naming* what the player did ("you wrote a I–V–vi–IV") — revisit with layer peel-back.
- ~~**Identity thread**~~ — **BUILT ✅ (2026-06-12) + extended to per-region friends (2026-06-13):** the companion model is now **one friend per region, each growing as you complete that region's packages** (depth + collection combo). First Garden (intro) friend = player-picked starter (grows through the 4 intro arcs); every later region has its own signature friend (Paths of Song = **Flutter** 🥚→🐛→🌿→🦋→🦋✨) that matures one stage per completed package, met via a greeting toast on first entry (`progress.metRegions`). Players keep their main friend (no swapping — preserves attachment); the per-region roster is the collection. Packages carry a `region` field; `REGIONS[id].friend` defines non-intro friends. **TODO:** a collection/menagerie view on 🏡 Home (card currently shows only the current region's friend); plus the still-open signature *style* fingerprint, naming, and quality-driven reactions.
- **Tool evolution + rare discoveries:** tools level up with use and evolve variants (jazzy chord, ornamented interval); hidden combinations unlock rare finds ("ancient scale", "mystery chord") with no instructions — the Minecraft exploration loop.
- **Micro-loops & daily novelty:** 30-second hooks (complete this pattern / make it resolve); daily surprises without FOMO (a new groove appears, "only 3 notes today" constraint days).
- **Physics mutations (musical power-ups):** temporary rule changes — gravity flips, scale warps, timing shifts.
- **Leave something growing:** the garden keeps evolving between sessions; on return it changed and invites continuation ("your garden remembered your song", "this wants a chorus…").
- **Layer peel-back (mastery made visible):** chord names / scale degrees / structure revealed progressively, anchored to *what the player already built*; advanced sandbox lets players break the rules on purpose.
- **Social gravity (beyond sharing):** remix battles (take a loop, each remixes, others emote — no winners), cooperative community goals (grow a biome together), signature-style identity ("this sounds like Pavel's style").
- **Narrative quests & character reactions:** light fiction where music *does* something ("help this world wake up"); creatures and environments respond.
- **World map prototype:** 2–3 regions, 5–10 nodes each — the first player-facing surface of the §2b layer model.

**Longer-term:**
- **Rhythm & structure editing — bars and plots:** treat the timeline as **bars ("flower beds")**, each splittable into different-size **cells ("plots")** to represent note durations (held vs. short notes — the dimension our equal-step grid can't show yet). Enables Excel-style **insert/delete/move a column or bar** (e.g. drop a pause into the middle without re-planting everything), editing within a bar, and rearranging sections. Pairs with rhythm levels and "dynamics via gardening" (a seed stretched across plots = a longer note). *(User idea, 2026-06-07.)*
- **Dynamics via gardening:** water/fertilize a seed to make its note louder/softer (bigger/brighter = louder). Makes dynamics tactile and visible; pairs with the stand/wobble "tending" metaphor; later enables crescendo (a row watered progressively) and accents. *(User idea, 2026-06-07.)*
- "Night / blind" diegetic ear-training challenges (navigate by ear).
- Wobbly clusters generating *tension* the world wants resolved — a bridge to teaching chord function.
- **Import & remix a favorite song:** "land inside" a song the player loves and edit it from within the world — a strong emotional on-ramp (start from something you care about) and a natural teacher (discover *why* a chorus works by poking at it). An imported song should be **rendered at the player's level** (ties into "rigor grows with you", §1): beginners get just the melody + simplified chords inside the forgiving (e.g. pentatonic) physics; advanced players unlock the full multi-instrument arrangement close to the real performance. Same song scaled to the player — and hearing the fuller version as you level up is its own reward. Open questions: **copyright/licensing** (cover-song mechanical licenses, user-provided MIDI vs. audio, melody-extraction); technically likely starts from MIDI/structured input rather than raw audio. Revisit when we reach it. *(User idea, 2026-06-07.)*
