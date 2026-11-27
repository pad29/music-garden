# Tune Garden — Package Catalog

*Design source-of-truth for the package DAG. Companion to DESIGN.md (§2b three-layer architecture, §11b package model) and REQUIREMENTS.md.*
*This markdown is the **design** layer; it later compiles into the `PACKAGES` data object in `js/packages.js`. Keep it out of code.*
Last updated: 2026-08-13 — **20 packages are BUILT** (the intro, every Wave A–C package, the ★ milestone and Wave D's `sun-and-moon-garden`; **Wave A, Stone Chorus Canyon and Wave C are COMPLETE**; Pulse Woods waits on its fifth package, `march-and-waltz`); statuses and as-built prereqs marked per package below. The `PACKAGES` object in `js/packages.js` is the runtime truth (it lived in `index.html` until TUN-7, 2026-09-29); `PACKAGES-DETAILED.md` holds the as-built level-by-level specs (all but two — §3 names them).

---

## 0. How to read this file

The game is a **hidden capability graph (DAG) wrapped in a player-facing world map** (DESIGN §2b). Four layers:

- **A — World map** (what the player sees): regions / biomes / powers / discoveries — never "scales-7".
- **B — Capability clusters** (what they're really gaining): Voice, Home, Pulse, Shape, Flow, Color, Weaving, Story, Travel, Mastery. *Treated as **tags**, not a hard layer — in this first wave they map ~1:1 to regions; promote to a real layer only when a cluster genuinely spans regions.*
- **C — Packages** (the unit of progression): ~8–12 levels each, one capability step, built from reusable level templates.
- **D — Hidden theory graph** (what we track internally): contour, scale degrees, meter, intervals, triads, cadence, function, modes, voice-leading, form…

**Litmus test for every package:** *What new power does the player feel they now have in the world?* — never "what theory concept was covered?"

---

## 1. Foundational decisions (these gate the map)

### 1a. The palette-widening milestone (decided 2026-06-13)

The engine today is **pentatonic-only** (C D E G A — no F, no B). That is the "can't-sound-bad" guarantee *and* a hard ceiling: a large fraction of harmony/function/color content is **impossible** in pentatonic (no leading tone B→C, no F→E pull, only two clean triads C-maj & A-min, no semitones for real tension, no modes). So the map is sequenced around a deliberate widening:

| Palette | Notes | Unlocks |
|---|---|---|
| **pentatonic** | C D E G A | melody contour, phrase, motif, all rhythm, open/bright interval pairs, 2 triads, relative-major/minor mood |
| **diatonic** | + F, B (full major scale) | real triad variety, cadences, functional pull, inversions, true dissonance gradation, parallel major/minor, modes |
| **chromatic** | + the 5 black keys | borrowed color, secret/altered notes, passing chromaticism |

**Decision:** ship **melody + rhythm packages first on the current pentatonic engine**, then widen to diatonic as a **progressive reveal, not an on/off switch** (refined 2026-06-13 after review) — to protect "can't-sound-bad" and keep the player's intuition intact across the transition:
- **Phase 1 — Hidden color:** the engine *already* uses F & B internally (the jam grooves' G and F chords contain B and F). Lean into it — backing harmony, NPC/creature melodies, jam — so the player *hears* "there is more color in the world" **before** they can place those notes.
- **Phase 2 — Guided exposure (`two-new-colors`):** unlock the new notes **one at a time — F first, then B** — each framed as "a new color the world discovered," can't-sound-bad rails still on.
- **Phase 3 — Free diatonic:** all 7 notes freely placeable.

> **Engine architecture for this — RESOLVED 2026-06-18 (see DESIGN §11 "Palette-system architecture").** Palette is **per-package/per-level** via a `PALETTES` table (the engine swaps the active `MIDI`/`NAMES`/`ROWS`/`TONIC_PC` + rebuilds the grid on entry); pentatonic packages stay on the 10-row world untouched, diatonic packages get a 14-row world (F between E–G, B between A–C). The physics (`isTonic`/`stableMidis`/`chordName`/`intervalName`) already reason in real semitones, so they need no change. Two palettes only — the F-then-B reveal is staged through level design + per-level row-dimming, not a third palette; a persistent `progress.colors` flag remembers discovered notes. No active rails (dissonance is the lesson). **Save/share does not support diatonic yet** (it stores palette-relative row indices) — see the deferred redesign in DESIGN §11/§12.

**Tool-transposition fork — RESOLVED as a phased hybrid** (was DESIGN §11's open "big one"):
- *Pentatonic + early diatonic →* **shape-based** stamping (current model; always in key; best for exploration/intuition).
- *Mid-diatonic →* add a **soft per-tool toggle** — *"keep this sound"* vs *"adapt to place"* (no theory terms exposed; default stays shape-based).
- *Advanced / mastery →* full **fixed-quality** transposition, now useful because tension is intentional.

### 1b. ID convention

**The persistent key is a slug** (`follow-the-fireflies`), never a positional code. Our rule (DESIGN §11b): *IDs are the contract — referenced by dependencies AND saved progress — never renumber.* The `PS-1` / `PW-2` shorthands below are **display/grouping labels only**, carried as metadata. Reorganizing the map must never change a slug. Namespace user content as `user:alice/slug`.

---

## 2. Shared standards (controlled vocabularies)

### 2a. Level pattern types
`finish` · `repair` · `transform` · `match_feel` · `discover` · `answer` · `build_constraint` · `arrange` · `navigate` · `restore` · `compare` · `classify` · `improvise_prompt` · `capstone`

### 2b. Difficulty / rigor tiers
1. **Toy exploration** — no bad outcomes, broad success.
2. **Guided control** — deliberate shaping, still forgiving, clear feedback.
3. **Intentional composition** — choices matter, multiple valid outcomes, internalizes prior ideas.
4. **Expressive nuance** — subtle control, interpretation, richer trade-offs.
5. **Advanced freedom** — rules can be bent, interacting systems, mastery.

### 2c. Success logic — **required per level** (the anti-quiz guardrail)
- **broad** — many valid solutions as long as some property holds (default; keep most of the game here).
- **targeted** — must satisfy a musical structure (rising contour, stable tower, soft landing).
- **exact** — reproduce precisely. *Use sparingly* — only where it's the point (echo/ear-training).

### 2d. Capability clusters (tags)
`voice` · `home` · `pulse` · `shape` · `flow` · `color` · `weaving` · `story` · `travel` · `mastery`

### 2e. Palette levels
`pentatonic` · `diatonic` · `chromatic`

### 2f. Rhythm capability tiers (system-readiness — mirrors the palette levels for pitch)
Make the rhythm system's evolution explicit so packages never depend on a tier that doesn't exist yet:
- **R1 — grid rhythm** *(current)*: on/off steps, drum lane, basic pulse.
- **R2 — spacing & rests**: density control, remove-to-improve (the `wind-and-gaps` "lite" version).
- **R3 — duration**: note length / phrasing — **requires the bars & plots editor** (DESIGN §12).
- **R4 — phrasing & articulation**: accents, tied notes, energy shapes (e.g. `rain-and-sun`).
Tag every rhythm-touching package with the tier it needs.

---

## 3. Package spec template (finalized — use for every package)

> The **high-level** form below uses §3's fields in compact bullet form. The **detailed** form (for packages in active design) expands §6 into a full level-by-level set with per-level success logic. **The detailed specs live in `PACKAGES-DETAILED.md`** (with the difficulty-ramp doctrine they all follow) — for every built expansion package except `two-new-colors` and `two-kinds-of-walking`, whose specs are in §6 below.

```
## <slug> — <Player-facing name>   [shorthand: PS-1]
### 1. Identity
- Slug (persistent key):
- Region / Capability cluster:
- Status: idea | draft | in-design | implemented | tuned
### 2. Player promise
- Fantasy:
- What the player can do after this:
- Why it's fun:
### 3. Design role
- Builds on:
- Unlocks next:
### 4. Hidden learning
- Internal concept(s) + theory tags:
- Difficulty tier (1–5):
- Palette required: pentatonic | diatonic | chromatic
- Prerequisite packages (slugs):
### 5. Mechanical focus
- Core mechanic introduced:
- New systems/UI needed + complexity (S/M/L):
- Reused systems:
### 6. Level design
- # of levels:
- Level patterns used (controlled vocab):
- Per-level success logic (broad/targeted/exact):
- Arc (start → mid → capstone):
### 7. Rewards
- Power unlocked:
- Sandbox unlock:
- World hook:
- Cosmetic / world-map consequence:
### 8. Success criteria
- Felt intuitively:
- Should NOT need names for yet:
- What mastery looks like in play:
### 9. Notes
- Open questions / future hooks / style connections:
```

---

## 4. Region map (player-facing)

| # | Region | Cluster focus | Palette | Status (2026-09-06) |
|---|---|---|---|---|
| 0 | 🌱 **The First Garden** (intro) | Voice · Home · Pulse · Shape | pentatonic | **built** (13 levels) |
| 1 | 🎶 **Paths of Song** | Voice | pentatonic | **4 built — COMPLETE** (fireflies, stepping-stones, Q&A, tiny-motifs) |
| 2 | 🥁 **Pulse Woods** | Pulse | pentatonic (pitch-independent) | **4 built** (footsteps, wind-and-gaps, off-the-path, two-kinds-of-walking); `march-and-waltz` still to come |
| 3 | 🏛️ **Stone Chorus Canyon** | Shape | pentatonic→diatonic | **5 built — COMPLETE** (twin-blooms, standing-towers, twin-blooms-plus, shifting-shadows, soft-wobble-strong-wobble) |
| 4 | 🌈 **The Color Spring** (`two-new-colors` ★ milestone — engine widens to diatonic) | Color | pentatonic→diatonic | **built** |
| 5 | 🌦️ **Weather of Wanting** | Flow / Home | diatonic | **4 built** (ways-home, river-turns, pull-of-the-moon, false-doors) |
| 6 | 🌗 **The Twin Gardens** | Color / mood | diatonic | **1 built** (sun-and-moon-garden — *moved here from the planned "Color Caverns"; each map region needs a land, and major/minor mood earned its own twin-biome region*) |
| 7 | **Color Caverns** (future) | Color | diatonic→chromatic | not started (`secret-doors`, `mist-paths`) |
| 8 | **Weavers' Grove** (future) | Weaving | diatonic (+ multi-voice system) | not started |
| 9 | **Story Mountain** (future) | Story | diatonic (+ section system) | not started |
| 10 | **Atlas of Styles** (future) | Travel | varies (reuses groove system) | not started |

> The player-facing map is now a **hand-drawn continent** (one land per region, one territory per package — DESIGN §10); adding a package re-splits its region's land, adding a region adds a land. Region ids/names in code: `REGION_MAP` in `js/level-engine.js`.

---

## 5. Build waves (palette-aware reorder of the original 24)

> Reordered from the brainstorm so each wave is **buildable when reached**. Melody + rhythm first (current engine); the `two-new-colors` milestone sits before harmony/function.

- **Wave A — Voice & Pulse** *(pentatonic):* follow-the-fireflies ✅, footsteps ✅, stepping-stones ✅, wind-and-gaps ✅, question-and-answer ✅, tiny-motifs ✅, off-the-path ✅, two-kinds-of-walking ✅ — **Wave A COMPLETE**
- **Wave B — First Structures** *(pentatonic-thin; richer post-widening):* twin-blooms ✅, standing-towers ✅
- **★ Milestone:** **two-new-colors** ✅ *(diatonic widening; tool-transposition deferred per §1a)*
- **Wave C — Harmony & Function** *(diatonic):* twin-blooms-plus ✅, ways-home ✅, river-turns ✅, pull-of-the-moon ✅, false-doors ✅, shifting-shadows ✅, soft-wobble-strong-wobble ✅ — **COMPLETE**
- **Wave D — Color** *(diatonic→chromatic):* sun-and-moon-garden ✅ (shipped early — it needed only the mood system, and gives the diatonic arc an emotional payoff) · remaining: secret-doors, mist-paths
- **Wave E — Weaving & Story** *(needs multi-voice + section systems):* deep-roots-high-birds, lantern-chorus, rain-and-sun, rooms-and-paths, return-of-the-meadow
- **Bridge style worlds** *(optional):* campfire-trails, city-lights

---

## 6. The packages — high-level specs

> Format per package: capability · hidden theory · palette · prereqs · level patterns · world hook · sandbox unlock · **system needs (complexity)** · why it matters. Detailed (level-by-level) as-built specs are in `PACKAGES-DETAILED.md` for every built expansion package except `two-new-colors` and `two-kinds-of-walking`, specified here (§3 says the same).

### REGION 1 — Paths of Song  *(cluster: voice · pentatonic)*

#### `follow-the-fireflies` — Follow the Fireflies  [PS-1]  — **BUILT ✅ (2026-06-13), playtest-tuned**
- **Capability:** shape a line that rises, falls, hovers, arcs, doubles, and journeys.
- **Playtest tuning (2026-06-13):** tightened hover (≥4 notes, must end near start — a short descent no longer passes); the compare level now requires hearing all 3 options before a pick counts; replaced the repetitive "Two Skies" (= L1+L3) with **Over the Twin Hills** (two hills in a row) and made the capstone a real multi-turn **journey** — adds a difficulty ramp via compound contours (peak/turn counting with prominence).
- **Theory:** melodic contour, directional phrasing. **Palette:** pentatonic. **Prereqs:** garden-basics.
- **Patterns:** match_feel, navigate, repair, transform, compare. **Success:** broad/targeted.
- **World hook:** *The Lantern Meadow* — guide scattered lights home by contour.
- **Sandbox:** contour glow on a phrase; rise/fall/hover/arc prompt cards.
- **System needs (S):** a **contour detector** (classify a placed melody's shape) + a ghost-path overlay on the grid. No new note systems.
- **Why:** first "melody as expression" package; biggest emotional step after the intro. **The validation build** for the template + level engine.
- **Validation focus (test while building):** (1) *replayability* — do levels invite redo / multiple valid solutions? (2) *expression leakage* — are "wrong" approaches still meaningful and allowed? (3) *transfer* — afterward, does the player spontaneously shape melodies in Free Play? If not, the package didn't teach a capability.

#### `stepping-stones` — Stepping Stones  [PS-2]  — **BUILT ✅ (2026-06-14)** *(as-built spec in PACKAGES-DETAILED §3)*
- **Capability:** move gently by steps or boldly by leaps, on purpose.
- **Theory:** stepwise motion vs. leaps (relative interval size). **Palette:** pentatonic *(steps are uneven — embodied feel reads fine; true diatonic steps arrive later)*. **Prereqs:** garden-basics, follow-the-fireflies.
- **Patterns:** navigate, build_constraint, transform, compare, repair. **Success:** broad/targeted.
- **World hook:** *Crossing the Silver Stream* — careful creature → steps, bold creature → leaps.
- **Sandbox:** phrase motion tags (smooth/bold/jumpy/gliding); optional step-bias assist.
- **System needs (S):** "mostly stepwise vs. contains leaps" detector; stone-spacing visual.
- **Why:** turns note choice into *movement style* — pairs with PS-1 to form the whole melody-writing basis.

#### `question-and-answer` — Question and Answer  [PS-3]  — **BUILT ✅ (2026-06-18)**
- **Capability:** make one phrase that feels open, and another that answers it.
- **Theory:** antecedent/consequent, open vs. closed phrasing. **Palette:** pentatonic. **Prereqs:** garden-basics, follow-the-fireflies.
- **Patterns:** answer, finish, compare, transform. **Success:** broad/targeted.
- **World hook:** *Voices Across the Canyon* — a musical conversation between separated creatures.
- **Sandbox:** phrase-pair tool; call/response playback; "write a question, then answer it" prompt.
- **System needs (M) — built:** **phrase A/B boundary** on the timeline (the field splits into a call half, cols 0–7, and an answer half, cols 8–15) + phrase-pair evaluation (open = ends away from HOME, closed = lands on HOME — reuses the existing tonic detection, no new pitch system). The phrase-split seam is reused by `ways-home`.
- **Why:** teaches deep formal logic intuitively; the first real bridge from melody toward form.

#### `tiny-motifs` — Tiny Motifs  [PS-4]  — **BUILT ✅ (2026-07-05)** *(as-built spec in PACKAGES-DETAILED §15)*
- **Capability:** turn a small idea into something memorable via repetition + variation.
- **Theory:** motif, repetition (repeat/sequence), variation, inversion. **Palette:** pentatonic. **Prereqs:** *(as built)* stepping-stones, question-and-answer.
- **Patterns:** build_constraint, transform, repair, compare, capstone. **Success:** broad/targeted.
- **World hook:** *Memory Stones* — a signature tune; the capstone grows one idea into a whole tune.
- **Sandbox:** motif windows; echo/vary/flip prompts.
- **System needs (M) — built:** a **motif window model** (4-column windows) + interval-signature similarity check — `windowNotes`/`intervalsOf` with `motifExactRepeat` / `motifEcho` (transposition) / `motifVariation` (same contour, reshaped) / `motifInversion` (flipped), plus `motifFamilyCount` for the capstone; a `motif:true` window-tint guide (`setMotifGuide`). Reuses `showChoices` for the recognition level. No `famous:` reward yet (needs a score-validated *pentatonic*, motif-driven public-domain tune — `odetojoy` etc. are diatonic).
- **Why:** major retention package — creates musical *identity* and recognizability. Completes Paths of Song.

### REGION 2 — Pulse Woods  *(cluster: pulse · pentatonic / pitch-independent)*

#### `footsteps` — Footsteps  [PW-1]  — **BUILT ✅ (2026-06-13, redesigned 2026-06-14)** *(as-built spec in PACKAGES-DETAILED §2)*
- **Capability:** create and feel a stable pulse; lock melody to it.
- **Theory:** beat stability, simple subdivision, melody/beat alignment. **Palette:** pentatonic. **Rhythm tier:** R1. **Prereqs:** garden-basics.
- **Patterns:** repair, build_constraint, match_feel, compare, restore. **Success:** broad/targeted.
- **World hook:** *The Root Path* — dormant roots wake only when the pulse is steady.
- **Sandbox:** pulse visualizer; clearer beat guides; first step toward note-length control.
- **System needs (S):** beat-stability evaluation + stronger pulse→world coupling. Builds on existing drum sequencer.
- **Why:** pulse is the fastest route to "this feels like real music"; foundational for every later style/quest.

#### `wind-and-gaps` — Wind and Gaps  [PW-2]  — **BUILT ✅ (2026-06-18, R2-lite)**
- **Capability:** use rests and space intentionally ("not everything valuable is more notes").
- **Theory:** rests, density, rhythmic breath, negative space. **Palette:** pentatonic. **Rhythm tier:** R2 (lite shipped on the R1 grid; full needs R3 duration). **Prereqs:** garden-basics, footsteps.
- **Patterns:** repair, transform, compare, match_feel, build_constraint. **Success:** broad/targeted.
- **World hook:** *The Night Grove* — move through the garden in the spaces between sounds.
- **Sandbox:** rest tool; sparse/dense prompts; optional density meter.
- **System needs (M–L) — lite built:** the **rhythm-density version shipped** on the on/off drum grid ("remove hits to breathe") + a live **density meter** + a full-pattern compare picker (`showPatternChoices`); the full **melodic note-duration / rest-as-object** version still needs the parked **bars & plots** editor (DESIGN §12) and is deferred to that build.
- **Why:** disproportionately improves the *maturity* of player creations without new theory.

#### `off-the-path` — Off the Path  [PW-3]  — **BUILT ✅ (2026-07-09)** *(as-built spec in PACKAGES-DETAILED §16)*
- **Capability:** make rhythm lively/surprising without losing the beat.
- **Theory:** syncopation, anticipation (the push), off-beat melody, swing feel. **Palette:** pentatonic. **Rhythm tier:** R1. **Prereqs:** *(as built)* garden-basics, footsteps, wind-and-gaps.
- **Patterns:** transform, match_feel, repair, compare, build_constraint, capstone. **Success:** broad.
- **World hook:** *The Dance Circle* in Pulse Woods — a trickster fox leads the player off the marked trail; the circle only spins for playful rhythm.
- **Sandbox:** the **Feel switch** (🚶 Straight ↔ 🕺 Swing) stays on in the capstone + finale.
- **System needs (S) — built:** off-beat/push detectors over the existing 16-step grid (`offAccents`/`pushHits`/`anchorKick`/`gridNotesOffBeats`) + a per-level **swing-feel toggle** (`feel:true` flag; tick() delays the "ands" a triplet's worth — the level-mode sibling of jam swing).
- **Famous reward:** `igotrhythm` — Gershwin's *I Got Rhythm* (1930, US public domain since 2026-01-01): pure-pentatonic melody that lands a beat behind a steady kick pulse. **Owner score-checked (Pavel's save-link version, 2026-07-10, ♩=156); 13th Jukebox song.**
- **Why:** first package whose replayability comes from *feel*, not correctness.

#### `two-kinds-of-walking` — Two Kinds of Walking  [PW-4]  — **BUILT ✅ (2026-08-13)**
- **Capability:** make notes hold — long steps and quick ones.
- **Theory:** note duration (long vs short), and that a gap can be silence *or* a note still singing. **Palette:** pentatonic. **Rhythm tier:** R3 (duration). **Prereqs:** *(as built)* `intro`, footsteps, off-the-path.
- **Patterns:** transform, compare, classify, build_constraint, capstone. **Success:** broad/targeted.
- **World hook:** *The Long Way Home* — walk a whole tune in two kinds of step and land it.
- **Sandbox:** Free Walk — quick steps, long holds, a beat if you want one.
- **Unlocks:** 🌿 **Grow & ✂ Trim** (`unlock:["grow"]` on L1 — the first package outside the Studio to render the duration tools) and 🥁 Drums on L4.
- **System needs (S) — BUILT:** the whole duration stack shipped in EDITOR-DESIGN Phase 2 (`durationTicks`, vines, `vineLen`, 🌿 Grow / ✂ Trim, `setMelodyLens`, `showLenChoices`).
- **Famous reward:** 🎧 **Swing Low, Sweet Chariot** on the capstone *(owner-scored 2026-08-13)* — the FIRST famous entry with real note lengths. Capstone = the first phrase, landing on the long fifth; the Jukebox/Studio version = both phrases, landing home on the long tonic. Traditional spiritual, public domain, transposed from the score's F major up a fifth into C so the whole tune sits inside the pentatonic palette and the C4–A5 field. **Policy set with it (owner):** note lengths appear in famous reveals **only from this package onward** — before a child is taught the vine a held note is an unexplained mystery, after it the lesson turns up in a real song. Existing capstone reveals stay flat; their **Jukebox** versions get true lengths in a later batched pass.
- **Why:** the first time in the game that doing *less* makes *more*; the misconception it defeats is "more notes = more music".

#### `march-and-waltz` — March and Waltz  [PW-5]  *(the parked meter material from PW-4)*
- **Capability:** make music march, sway, or spin (embodied meter feel).
- **Theory:** meter / grouping feel (2 vs 3 vs 4). **Palette:** pentatonic. **Rhythm tier:** R1 + meter extension. **Prereqs:** `intro`, footsteps, **two-kinds-of-walking**.
- **Patterns:** classify, transform, match_feel, build_constraint. **Success:** broad/targeted.
- **World hook:** *Waltz Garden / festival* — dance the correct step; gateway to folk/world styles.
- **Sandbox:** movement-feel presets; dance-style groove families.
- **System needs (M) — BUILT:** meter beyond fixed 4/4 (triple groupings) shipped in EDITOR-DESIGN Phase 2: Studio meters march, waltz, jig and quick march, with bar lines and beat marks (2026-08-28), then the 💃 Waltz and 🍀 Jig grooves (2026-08-29). What is left is the package itself, with its levels and the unlock that takes meter out of the Studio.
- **Why:** makes rhythm *embodied*; bridges into the style worlds. Duration is a genuine prerequisite, not a consolation — a waltz's identity is ONE-two-three, a long stressed beat and two short ones, so a child needs to hear length before they can feel a triple grouping.
- **Note when scheduling:** `regionStage()` caps a region friend at `stages.length-1`, and Hopper has five stages, so Pulse Woods' *fifth* package awards no companion growth. Acceptable (Stone Chorus Canyon already has that shape) but a stated decision, not a surprise.

### REGION 3 — Stone Chorus Canyon  *(cluster: shape · pentatonic→diatonic)*

#### `twin-blooms` — Twin Blooms  [SC-1]  *(two-stage package)* — **BUILT ✅ (2026-06-14)** *(as-built spec in PACKAGES-DETAILED §4)*
- **Capability:** hear and choose between *kinds* of note-pairs by personality.
- **Theory:** interval families, consonance contrast. **Palette:** pentatonic *(early stage)*. **Prereqs:** garden-basics.
- **Patterns:** discover, match_feel, compare, classify, build_constraint. **Success:** broad.
- **World hook:** *The Shrine of Two Flowers* — each side responds to a fitting pair-bond.
- **Sandbox:** expanded pair library; non-theory "personality" labels; pair collection shelf.
- **System needs (S):** pair-personality descriptors over existing fuse/interval recognizer.
- **Why:** deepens harmonic ears without names — the **early stage** teaches *pleasant vs. open* pairs only (all pentatonic can offer). The richer end (close tension, strong pull, real contrast) re-enters post-diatonic as `twin-blooms-plus`, so the player feels *"this system got richer,"* not *"this system changed."*

#### `twin-blooms-plus` — Twin Blooms (expanded)  [SC-1+]  *(post-diatonic re-entry, not a new numbered package)* — **BUILT ✅ (2026-06-20)** *(as-built spec in PACKAGES-DETAILED §9; shipped with the per-package toolbox fix)*
- **Capability:** the full pair-personality range — close tension, strong pull, real bright/dark contrast.
- **Theory:** semitone tension, leading-tone pull, full interval color. **Palette:** **diatonic**. **Prereqs:** twin-blooms, two-new-colors.
- **Patterns:** discover, compare, match_feel, classify. **Success:** broad/targeted.
- **Reward:** unlocks the tense/pull pairs in the same toolbox shelf (visibly "grows").
- **Why:** delivers the harmonic-ear depth the early stage couldn't, without a jarring system swap.

#### `standing-towers` — Standing Towers  [SC-2]  — **BUILT ✅ (2026-06-14)** *(as-built spec in PACKAGES-DETAILED §5)*
- **Capability:** build stable 3-note shapes intentionally.
- **Theory:** triad construction, stability, chord completion. **Palette:** pentatonic *(only C-maj & A-min stand cleanly — enough to teach, thin for variety; blooms after widening to F/G-maj, D/E-min)*. **Prereqs:** garden-basics, twin-blooms.
- **Patterns:** finish, build_constraint, repair, compare, restore. **Success:** targeted/broad.
- **World hook:** *The Broken Causeway* — canyon bridges powered by stable structures.
- **Sandbox:** stable-tower collection; richer chord stamps; structure decor.
- **System needs (S):** extends intro Tower mechanic + stability preview.
- **Why:** builds directly on our most differentiated mechanic; the natural pre-diatonic capstone.

### ★ MILESTONE

#### `two-new-colors` — Two New Colors  [palette milestone]  — **BUILT ✅ (2026-06-18)**
- **Capability:** the world gains two new notes — **F first, then B** (the full major scale opens) — via a progressive reveal (§1a Phase 2).
- **Theory:** diatonic scale; the 4th, then the leading tone. **Palette:** pentatonic → **diatonic** (staged). **Prereqs:** standing-towers.
- **Patterns:** discover, match_feel, transform. **Success:** broad.
- **World hook:** *(diegetic)* — the new "Color Spring" region; the world widens as each color is found.
- **Sandbox:** each new note becomes placeable as it is revealed (locked rows un-dim one at a time).
- **System needs (L) — built:** the **palette system** (§1a engine note) — a `PALETTES` table + `setPalette()` that swaps `MIDI`/`NAMES`/`ROWS`/`TONIC_PC` and rebuilds the grid per-package; the package runs on the new **14-row `diatonic`** palette. The staged gate is done via **per-level row-locking** (`colors:["F"]` → `["F","B"]`; `setColorReveal`/`isLockedRow` dim & block undiscovered notes) rather than a third palette. Detectors: `placedF`/`placedB`, `bThenC` (leading-tone pull), `craftedNewTriad` (a standing tower using F or B). Sets a persistent `progress.colors=["F","B"]` on completion (future sandbox reads it). The **phased transposition toggle is deferred** (shape-based default works unchanged on the diatonic grid); **no active rails** (dissonance is the lesson). Save/share does NOT support diatonic yet (see DESIGN §11/§12).
- **8 levels:** A Hint of More (hidden color via jam, both locked) → The First Color F → Sing with F (F + home) → The Second Color B → The Pull Home B→C (leading tone) → A Brand-New Tower (triad using F/B) → The Whole Scale (F + B + home) → Free Colors finale. Companion: **Prism** 🌫️→🌈✨ (The Color Spring region).
- **Why:** unblocks Regions 4–7. Framed as wonder, introduced one note at a time so intuition never breaks.

### REGION 4 — Weather of Wanting  *(cluster: flow/home · diatonic)*

#### `ways-home` — Ways Home  [WW-1]  — **BUILT ✅ (2026-06-18)** *(as-built spec in PACKAGES-DETAILED §8)*
- **Capability:** choose how complete / restful / open an ending feels.
- **Theory:** cadence strength, closure types. **Palette:** **diatonic** *(needs the leading tone — impossible in pentatonic)*. **Prereqs:** two-new-colors, question-and-answer, standing-towers.
- **Patterns:** finish, compare, match_feel, repair. **Success:** targeted/broad.
- **World hook:** *The Lantern Shore* — lanterns return only if the ending fits the emotional situation.
- **Sandbox:** ending mood cards; closure-strength preview.
- **System needs (M):** phrase-end evaluation across multiple closure strengths; "partial vs. full home" world feedback. Builds on intro "Find Home."
- **Why:** turns intuitive "home" into nuanced expressive control — the start of real functional power.

#### `river-turns` — River Turns  [WW-2]  — **BUILT ✅ (2026-06-22)** *(as-built spec in PACKAGES-DETAILED §10)*
- **Capability:** move from one harmony to another like travel.
- **Theory:** common progression motion. **Palette:** diatonic. **Prereqs:** *(as built)* two-new-colors, ways-home.
- **Patterns:** repair, finish, transform, navigate, compare. **Success:** broad/targeted.
- **World hook:** *Riverways* — navigate by harmonic flow; reconnect villages.
- **Sandbox:** progression-path tool; "next chord" route suggestions; journey prompts.
- **System needs (M):** chord-to-chord motion model over the existing jam progression engine.
- **Why:** the unlock that makes later song-building possible.

#### `shifting-shadows` — Shifting Shadows  [SC-3]  — **BUILT ✅ (2026-07-11)** *(as-built spec in PACKAGES-DETAILED §17)*
- **Capability:** keep a shape's identity while changing its balance.
- **Theory:** inversions / revoicing, common tones, smooth bass (first voice-leading). **Palette:** diatonic *(richer once more triads exist)*. **Prereqs:** two-new-colors, standing-towers.
- **Patterns:** transform, compare, repair, match_feel, build_constraint, capstone. **Success:** targeted/broad.
- **World hook:** *Rotate the stone columns* — turn towers so their shadows lighten and the canyon moths can cross; 4th canyon package (Geo reaches his final form).
- **System needs (S, as built — lighter than planned):** inversion detectors over the existing chord engine (`colInv`/`colBassMidi`/`countInverted`/`voicingsOfOneChord`) + the voice-leading payoffs (`sharedStoneCols`, `smoothBassPath`); no new UI needed — turning = replanting a stone an octave up.
- **Famous reward:** `bachprelude` — Bach's Prelude in C (BWV 846): chords turning over a barely-moving bass. **Owner-validated (Pavel's save-link, 2026-07-12): first four bars at full length**, the G7 bar's off-grid B3 bass read as a C pedal. **14th Jukebox song.**
- **Why:** musically deep yet beautifully tactile/visual.

#### `soft-wobble-strong-wobble` — Soft Wobble, Strong Wobble  [SC-4]  — **BUILT ✅ (2026-07-13)** *(as-built spec in PACKAGES-DETAILED §18)*
- **Capability:** use *degrees* of instability on purpose.
- **Theory:** consonance–dissonance gradation (4 grades: still · shimmer · restless · storm). **Palette:** diatonic *(the B/F semitones give the full ladder)*. **Prereqs:** *(as built)* two-new-colors, twin-blooms-plus — the tension intro (tritone/clash) comes from twin-blooms-plus, this package grades it.
- **⚠️ TODO (chromatic era):** on the 7-row diatonic field, half steps and whole steps are both *adjacent rows* — the grades sound different but look the same. Revisit/upgrade this package on the future **12-note chromatic field**, where the ladder becomes visible, not just audible (owner note, 2026-07-13).
- **Patterns:** discover, match_feel, compare, build_constraint, repair, capstone. **Success:** broad/targeted.
- **World hook:** *The canyon's Weather Shrine* responds to tension grade; wake the storm beast carefully (climb all four grades without dropping). 5th canyon package — completes Stone Chorus Canyon.
- **Sandbox:** the **weather glass** (live tension gauge under the field, `wobble:true` flag) stays on in the capstone + finale.
- **System needs (M) — built:** the tension-magnitude model — `wobbleOfGap` (interval class → grade 0–3), `colWobble` (a column's roughest pair, so chords grade too), sequence detectors `wobbleLadder`/`gentleApproach`/`stormThenCalm`, and the gauge UI.
- **Famous reward:** `chopsticks` — The Celebrated Chop Waltz (1877): the world's most famous soft wobble, melting by grades into a calm octave. **Owner-validated (Pavel's save-link, 2026-07-14), two-tier: full first section in the Jukebox (15th song), the second pass with the true ending on the capstone.**
- **Why:** the bridge from "shape" to "function."

#### `pull-of-the-moon` — Pull of the Moon  [WW-3]  — **BUILT ✅ (2026-06-22)** *(as-built spec in PACKAGES-DETAILED §11)*
- **Capability:** create stronger longing/pull before returning home.
- **Theory:** dominant gravity, tendency tones. **Palette:** diatonic. **Prereqs:** *(as built)* two-new-colors, river-turns — `soft-wobble-strong-wobble` was dropped from the chain (not built at the time); the tension groundwork comes from `twin-blooms-plus` instead.
- **Patterns:** transform, compare, finish, match_feel. **Success:** targeted/broad.
- **World hook:** *Raise the moon / celestial gates* open on strong pull + release.
- **Sandbox:** gravity visualization; "longing" intensity; strong-return templates.
- **System needs (M):** tendency-tone model (leading tone, 4→3) + tension visualizer.
- **Why:** where players start feeling harmony as *emotion*.

#### `false-doors` — False Doors  [WW-4]  — **BUILT ✅ (2026-06-22)** *(as-built spec in PACKAGES-DETAILED §12)*
- **Capability:** delay/redirect/surprise the expected landing — coherently.
- **Theory:** deceptive resolution. **Palette:** diatonic. **Prereqs:** *(as built)* river-turns, pull-of-the-moon.
- **Patterns:** transform, compare, build_constraint, restore. **Success:** targeted/broad.
- **World hook:** *Trickster forest / mirror maze* powered by misleading-but-coherent music.
- **Sandbox:** surprise-turn tool; suspense cards; alternate-ending generators.
- **System needs (M):** expectation model (what the listener expects) to subvert it.
- **Why:** first great "advanced composition fun" — surprise without randomness.

### REGION 5 — Color Caverns  *(cluster: color · diatonic→chromatic)*

#### `sun-and-moon-garden` — Sun Garden / Moon Garden  [CC-1]  — **BUILT ✅ (2026-06-20), in region 🌗 The Twin Gardens** *(as-built spec in PACKAGES-DETAILED §13; moved out of the planned Color Caverns into its own twin-biome region)*
- **Capability:** shift the same idea bright vs. wistful.
- **Theory:** major/minor & modal contrast (as built: relative major/minor — C-home vs A-home over the same diatonic notes). **Palette:** diatonic. **Prereqs:** *(as built)* two-new-colors, ways-home — `tiny-motifs` was dropped from the chain (not built at the time).
- **Patterns:** transform, match_feel, compare, repair. **Success:** broad/targeted.
- **World hook:** *Twin biomes* — day garden & night garden; a character's day-song vs. night-song.
- **Sandbox:** mood palette switch; bright/dusk/moonlit presets.
- **System needs (M):** mood/scale-tonic presets over the engine; reuses the existing tonic concept.
- **Why:** first "same structure, different emotional color" package.

#### `secret-doors` — Secret Doors  [CC-2]
- **Capability:** add a surprising note/color that opens the atmosphere, not breaks it.
- **Theory:** borrowed / non-diatonic color. **Palette:** **chromatic**. **Prereqs:** two-new-colors, sun-and-moon-garden, river-turns.
- **Patterns:** discover, compare, transform, repair. **Success:** broad/targeted.
- **World hook:** *Hidden shrine / secret passage* opens only with the right color.
- **Sandbox:** special color-note tool; rare-note cosmetics.
- **System needs (M):** controlled chromatic note set with safe-use rails (so it stays "magic," not "wrong").
- **Why:** introduces *magic* into the harmonic world — high delight.

#### `mist-paths` — Mist Paths  [CC-3]
- **Capability:** choose between distinct atmosphere-worlds, each a recognizable feel.
- **Theory:** modal palette families. **Palette:** diatonic (modal). **Prereqs:** two-new-colors, sun-and-moon-garden, two-kinds-of-walking.
- **Patterns:** match_feel, navigate, transform, classify, restore. **Success:** broad.
- **World hook:** *Fog worlds* that respond only to their own musical atmosphere.
- **Sandbox:** alternate color-physics presets; atmosphere browser; mood-tied biome visuals.
- **System needs (M):** mode presets (physics-preset system — the same machinery styles/eras will use).
- **Why:** begins turning theory into *world travel*; proves the physics-preset engine.

### REGION 6 — Weavers' Grove  *(cluster: weaving · diatonic + multi-voice)*

#### `deep-roots-high-birds` — Deep Roots, High Birds  [WG-1]
- **Capability:** separate bass-like support from melody-like expression.
- **Theory:** role separation by register/function. **Palette:** diatonic. **Prereqs:** two-new-colors, footsteps, standing-towers, river-turns.
- **Patterns:** arrange, repair, match_feel, transform, classify. **Success:** broad/targeted.
- **World hook:** *Grove of root-drums and canopy-singers*; prepare ensemble roles.
- **Sandbox:** role lanes (roots/sky/support); bass-helper patterns.
- **System needs (L):** **multiple simultaneous editable voices** — today there's one melody grid + drums + jam. Major new system; correctly far out.
- **Why:** where players begin sounding like *arrangers*.

#### `lantern-chorus` — Lantern Chorus  [WG-2]
- **Capability:** choose how harmony behaves underneath a line (pulse/float/shimmer/step).
- **Theory:** accompaniment textures. **Palette:** diatonic. **Prereqs:** two-new-colors, deep-roots-high-birds, off-the-path.
- **Patterns:** arrange, match_feel, transform, repair. **Success:** broad.
- **World hook:** *Lantern festival* — light it with the right moving accompaniment.
- **Sandbox:** accompaniment-pattern browser; texture presets; one-click support layers.
- **System needs (M, after WG-1):** accompaniment generators over the multi-voice system + jam engine.
- **Why:** huge retention — dramatically improves the payoff of player creations.

#### `rain-and-sun` — Rain and Sun  [WG-3]
- **Capability:** shape dynamics and emphasis over time.
- **Theory:** dynamics, accent, swell, phrase energy. **Palette:** diatonic. **Rhythm tier:** R4. **Prereqs:** two-new-colors, deep-roots-high-birds, tiny-motifs, wind-and-gaps.
- **Patterns:** transform, build_constraint, match_feel, repair. **Success:** broad.
- **World hook:** *Bring rain to a dry biome*; grow giant flowers with swell + release.
- **Sandbox:** **dynamics-gardening** (water/fertilize → louder/softer — the parked idea, DESIGN §12); accent + crescendo gestures.
- **System needs (M):** per-note velocity → gain (audio already supports it; needs UI + the gardening metaphor).
- **Why:** one of the most emotionally satisfying dimensions, no notation needed.

### REGION 7 — Story Mountain  *(cluster: story · diatonic + section system)*

#### `rooms-and-paths` — Rooms and Paths  [SM-1]
- **Capability:** build one section, then a contrasting second.
- **Theory:** A/B structure, sectional contrast. **Palette:** diatonic. **Prereqs:** two-new-colors, tiny-motifs, two-kinds-of-walking, river-turns.
- **Patterns:** build_constraint, transform, compare, repair, navigate. **Success:** broad/targeted.
- **World hook:** *Two-part temple*; a path from meadow to mountain with musical contrast.
- **Sandbox:** section arranger; scene markers / bar groups; A/B loop builder.
- **System needs (L):** **sections / multi-bar form** on the timeline (extends the parked bars & plots).
- **Why:** decisively shifts players from loops toward *piece-thinking*.

#### `return-of-the-meadow` — Return of the Meadow  [SM-2]
- **Capability:** bring something back, familiar but earned.
- **Theory:** repetition with variation, return logic. **Palette:** diatonic. **Prereqs:** two-new-colors, rooms-and-paths, tiny-motifs, ways-home.
- **Patterns:** transform, finish, compare, restore. **Success:** broad/targeted.
- **World hook:** *Reunion* — recall an ancient melody to heal a place.
- **Sandbox:** return/reprise tool; "bring back earlier idea" suggestions.
- **System needs (M, after SM-1):** reference/recall a prior section.
- **Why:** completes the first loop-to-story arc; sets up chorus/journey/style progression.

### REGION 8 — Atlas of Styles  *(cluster: travel · bridge worlds — optional)*

#### `campfire-trails` — Campfire Trails  [AS-1]
- **Capability:** compose inside a folk/communal/acoustic physics world.
- **Theory:** folk-like modal simplicity, drone, dance feel. **Palette:** diatonic (modal). **Prereqs:** question-and-answer, **march-and-waltz** *(repointed 2026-08-13 — this one wants the dance FEEL, which is meter, not duration)*, standing-towers, ways-home.
- **Patterns:** build_constraint, match_feel, arrange, restore. **Success:** broad.
- **World hook:** *Prepare a village gathering*; share songs by the fire.
- **Sandbox:** folk timbres; drone mode; campfire biome theme.
- **System needs (M):** a **style preset** (palette + groove + instruments + form constraints) — generalizes the existing 7-groove system (five styles plus the 💃 Waltz and 🍀 Jig dances) into the real Styles engine.
- **Why:** first proof that styles = physics presets; long-term retention engine.

#### `city-lights` — City Lights  [AS-2]
- **Capability:** turn ideas into hook-driven, groove-forward songcraft.
- **Theory:** pop songcraft (hook, lift, chorus). **Palette:** diatonic. **Prereqs:** tiny-motifs, off-the-path, river-turns, rooms-and-paths.
- **Patterns:** build_constraint, transform, arrange, capstone. **Success:** broad.
- **World hook:** *Festival parade anthem*; light a city district with a memorable chorus.
- **Sandbox:** pop groove kits; chorus enhancers; "radio garden" theme.
- **System needs (M):** style preset + section/chorus tools (needs SM-1).
- **Why:** the second style world; showcases hook/chorus mastery.

---

## 7. Package archetypes

Beyond the region/capability packages above, **constraint packages** are a first-class archetype where *the constraint itself is the mechanic* ("only 2 notes," "only upward motion," "only space-heavy rhythm"). They increase fun, creativity, and understanding; require **no new systems**; and scale infinitely — so they're cheap content between system-gated waves, and a natural home for the **Mastery** cluster. Backlog seeds: `two-note-tales` (only 2 pitches), `only-upward` (rising motion only), `breath-only` (max sparsity), `one-shape-world` (a single chord shape, everywhere). Build a couple once the level-template engine exists.

## 8. Open questions / system dependencies

**Resolved (this round):** tool-transposition → phased hybrid (§1a); diatonic transition → progressive reveal (§1a); rhythm readiness → tiers R1–R4 (§2f).

Still open:
1. ~~**Bars & plots / duration editor (R3)**~~ — **RESOLVED 2026-08-13**: duration shipped as EDITOR-DESIGN Phase 2 (vines + 🌿 Grow/✂ Trim) and is taught by `two-kinds-of-walking`. Meter and bars shipped too (2026-08-28), the dance grooves a day later and the count-in on 2026-09-05: dance feels, bar numbers, the loop range and the count-in all work in the Studio. What remains is content — the `march-and-waltz` package that teaches meter; `rain-and-sun` waits on dynamics (EDITOR-DESIGN Phase 3) and Region 7 on sections (Phase 5), not on meter.
2. **Multi-voice system** — gates all of Region 6. Largest new system in this map.
3. **Level-template / generator engine** — needed before 24 packages is realistic; validated by building `follow-the-fireflies` end-to-end first.
4. ~~**World-map UI**~~ — **RESOLVED 2026-07-05**: the interactive continent map is the Home screen (`renderPkgs()`; `DESIGN.md` § the continent map), one territory per package, driven by this DAG.
5. **Capability-awareness UI** *(from review)* — a lightweight panel/journal of earned "powers" (Voice ✓Shape ✓Motion ○Motif). Improves retention/identity/map-navigation **without** becoming a curriculum tree. Overlaps the existing power cards + world strip + companion — likely an aggregation of those rather than a new system. Near-term UI item, after the Fireflies pass.
