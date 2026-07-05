# Tune Garden — Detailed Package Specs (all shipped expansion packages)

*Production-oriented, level-by-level specs. Sibling to PACKAGES.md (the catalog/DAG + template + standards). Each package is designed against the difficulty-ramp doctrine below. §§1–8 were written as pre-build specs and updated as-built; §§9–13 are as-built records of the packages that followed. The `two-new-colors` ★ milestone's level list lives in PACKAGES.md §6 (it's an engine milestone more than a level design).*
Last updated: 2026-07-05 — all 14 expansion packages currently in the game are documented here or in PACKAGES.md.

---

## 0. The difficulty-ramp doctrine (applies to every package)

Learned from building & playtest-tuning **Follow the Fireflies**: a package's ~8 levels must *escalate*, not repeat. The shape:

| Ramp stage | Levels (typical) | What it does | Success logic |
|---|---|---|---|
| **Teach the atoms** | 1–2 (–4) | introduce each basic element in isolation, forgiving | broad → targeted |
| **Combine / contrast** | 3–4 | put atoms together, or set them against each other | targeted |
| **Apply / repair** | ~5 | use the skill under a constraint, or fix something broken | targeted |
| **Recognize / compare** | ~6 | discriminate by ear/eye — *must force exploration before the reward* (the L6-Fireflies bug) | targeted |
| **Compound challenge** | ~7 | a genuinely harder combination: two-of-a-thing, a sequence, or both-at-once | targeted |
| **Capstone** | 8 | integrate everything in a freer, creative goal | broad |

Rules that fell out of the Fireflies playtest:
- **Tolerances must tighten as levels climb.** Early detectors are lenient (expression leakage is good); later ones demand real structure. Don't let a trivial input satisfy a late goal.
- **Recognition/compare levels must require auditioning *all* options before a pick counts.**
- **Keep success `broad` by default;** use `targeted` for the structural middle; reserve `exact` for ear-training echo only.
- **No two levels should feel identical.** If level X = "level A then level B," cut it and replace with a compound that teaches something new.
- **Repair levels can multi-step** to drill each atom once — e.g. Fireflies' "Fix the Flight" is one level with 4 steps (fix a broken rise, fall, hover, arch), reinforcing all four shapes via the repair pattern.
- **Every package ends with an optional free-play finale.** A goal-less sandbox level (`goals:[]`, `loop:true`) themed to the package. It is the package's *completion moment*: entering it triggers a **congrats overlay** (package name + final-power emoji + the names of any newly-unlocked packages, or a "more coming" line) with **🏡 Home** / **✨ Keep playing** buttons. No goal = the player can leave to another package immediately, or stay and create. Region-companion growth (and the starter's final evolution) defers behind this congrats and plays on dismiss. (`showCongrats`/`newlyUnlocked`/`dismissCongrats`; `rewardOverlayUp()` gates the companion evolve.)

Per-level notation below: **Ln — Name** *(level_pattern · success_logic · ramp-stage)* — goal / mechanic.

---

## 1. `follow-the-fireflies` — Follow the Fireflies  [PS-1]  ✅ BUILT (reference)

- **Region / cluster:** Paths of Song / voice · **Palette:** pentatonic · **Prereqs:** garden-basics · **Build:** shipped & playtest-tuned.
- **Fantasy:** "Guide the fireflies through the night sky." Rising melody = climb, falling = descend, hovering = float.
- **Capability:** shape a melodic line intentionally (contour). **Hidden theory:** melodic contour, directional phrasing.
- **New systems:** contour detector (`contourSeq` + `isRising/isFalling/isHovering/isArch/isTwoArcs/isJourney` with prominence-based peak counting); glowing target-path SVG overlay; compare-picker.
- **Ramp shape:** four shape-atoms → apply (repair) → recognize (compare) → compound (two hills) → capstone (multi-turn journey).

| # | Level *(pattern · success · stage)* | Goal |
|---|---|---|
| 1 | Wake the Trail *(match_feel · targeted · teach)* | a rising line |
| 2 | Come Back Down *(match_feel · targeted · teach)* | a falling line |
| 3 | Hovering Lights *(match_feel · targeted · teach)* | ≥4 notes staying level (tightened: must end near start) |
| 4 | Arc Across the Pond *(match_feel · targeted · combine)* | one arch (up-and-over = first compound of rise+fall) |
| 5 | Fix the Flight *(repair · targeted · apply)* | **4 steps** — mend a broken rise, fall, hover, then arch (one each) |
| 6 | Choose the Best Path *(compare · targeted · recognize)* | hear all 3, pick the arc |
| 7 | Over the Twin Hills *(build_constraint · targeted · compound)* | two hills in a row |
| 8 | Night Meadow Song *(capstone · broad · capstone)* | a journey: climb + turn ≥2× |
| 9 | Free Flight 🌙 *(— · none · finale)* | optional free-play sandbox; entering it = package complete → congrats + unlocks |

- **Quest:** *The Lantern Meadow* — guide scattered lights home by contour. **Sandbox:** contour glow + rise/fall/hover/arc/journey prompt cards.
- **Validation focus (carry to all packages):** replayability, expression leakage (meaningful "wrong" answers allowed), transfer (player shapes melodies in Free Play afterward).

---

## 2. `footsteps` — Footsteps  [PW-1]  ✅ BUILT (2026-06-13) — pentatonic · R1

- **Region / cluster:** Pulse Woods / pulse · **Palette:** pentatonic (pitch-independent) · **Rhythm tier:** R1 · **Prereqs:** garden-basics · **Build:** now (reuses drum sequencer + field; +beat-stability eval).
- **Fantasy:** "Wake the path with steady footsteps." Roots, stones, creatures pulse in time.
- **Capability:** create and *feel* a stable pulse; lock melody to the beat. **Hidden theory:** beat stability, simple subdivision, melody↔beat alignment.
- **New systems:** beat-stability evaluation (kicks on strong beats; melody notes landing on beat columns 0/4/8/12); pulse visualizer; stronger pulse→world coupling. Mostly reuses the drum lane.
- **Ramp shape:** one pulse → fill the beats → add a backbeat layer → align melody to beat → repair drift → compare steadiness → build a full groove → integrate melody over a held groove.

**Redesigned 2026-06-14** after playtest: the first cut re-taught the intro's rhythm levels (kick-on-beats + backbeat) and felt too easy. Now it teaches genuinely *new* rhythm: subdivision, three snare feels, three hi-hat patterns, multi-lane repair. Many levels are multi-step to drill each idea.

| # | Level *(pattern · success · stage)* | Goal |
|---|---|---|
| 1 | Wake the Path **[2 steps]** *(build_constraint · targeted · teach)* | 4-beat kick → then a walking 8th-note kick (subdivision) |
| 2 | Find the Backbeat **[3 steps]** *(build_constraint · targeted · combine)* | snare on 2&4 → **half-time** (snare on beat 3 only) → a **pushed** snare (2,4 + the last "and") |
| 3 | Heartbeat & Melody *(build_constraint · targeted · combine)* | place melody notes *on* the beats (melody↔pulse alignment) |
| 4 | Hi-hat Shimmer **[3 steps]** *(build_constraint · targeted · combine)* | steady 8th hats → **offbeat** hats only → busy **16th** hats |
| 5 | Fix the Drift **[3 steps]** *(repair · targeted · apply)* | fix 2 drifted kicks → 2 drifted snares → a tangled kick+snare groove (move multiple) |
| 6 | Choose the Steady Walk *(compare · targeted · recognize)* | hear all 3 walks, pick the even one |
| 7 | Build the Groove *(build_constraint · targeted · compound)* | full kick + backbeat + steady 8th-note hi-hats |
| 8 | The Long Walk *(capstone · targeted/broad · capstone)* | build a FULL 3-lane groove **and** an on-beat melody (4+ seeds, 3 on beats) |
| 9 | Free Path 🌲 *(— · none · finale)* | optional free-play groove+melody sandbox; entering it = package complete → congrats |

*As built:* region friend **Hopper** 🥚→🟢→🐸→🐸✨→👑🐸 (Pulse Woods). Helpers: `gridNotesOnBeats()`, `setBeatGuide()`+`.beatcol` tint (the `beatGuide` flag), `showDrumChoices`/`pickDrumChoice` (drum compare picker), and drum-pattern checks `kickOn4/kickClean/snareBackbeat/snareBackbeatClean/hat8ths`. Repair steps drift **2+ hits** and require "right spots AND nothing off-beat." Lesson: an expansion package must teach *new* skill, not re-skin the intro — depth came from multi-step levels + new concepts (subdivision / snare feels / hat patterns / multi-lane repair).

- **Quest:** *The Root Path* — dormant roots wake only when the pulse is steady. **Sandbox:** pulse visualizer, clearer beat guides, prompt cards (steady / walking / grounded / marching).
- **Ramp note:** complexity climbs from 1 lane → 3 lanes → 3 lanes + coordinated melody. Tolerances: L1 allows extra hits; L7 requires all three lanes present and on-grid.

---

## 3. `stepping-stones` — Stepping Stones  [PS-2]  ✅ BUILT (2026-06-14) — pentatonic

- **Region / cluster:** Paths of Song / voice · **Palette:** pentatonic *(ladder steps are uneven in semitones — embodied smooth/leap feel reads fine; true diatonic steps arrive later)* · **Prereqs:** garden-basics, follow-the-fireflies · **Build:** now (step/leap detector over row-adjacency; builds on contour).
- **Fantasy:** "Cross the water by choosing smooth steps or bold leaps." Stepwise = close stones; leaps = long jumps.
- **Capability:** choose whether a line moves gently (steps) or dramatically (leaps). **Hidden theory:** stepwise motion vs. skips/leaps; interval size as expressive choice.
- **New systems:** "mostly stepwise vs. contains leaps" detector (adjacent-row = step, skip ≥2 rows = leap); phrase motion tags (smooth / bold / jumpy / gliding); stone-spacing visual.
- **Ramp shape:** steps → one leap → smooth feel → bold feel → repair over-jumpy → compare → produce *both* styles → integrate steps + a leap in one phrase.

*As built (2026-06-14), enriched past the original draft (per the Footsteps lesson) with multi-step levels and two genuinely musical ideas — scale runs and leap-resolution:*

| # | Level *(pattern · success · stage)* | Goal |
|---|---|---|
| 1 | Small Steps *(build_constraint · targeted · teach)* | cross by steps only (no leaps) — `isStepwise` |
| 2 | One Big Jump *(build_constraint · targeted · teach)* | one big leap in an otherwise smooth line — `isOneJump` |
| 3 | Gentle & Bold **[2 steps]** *(match_feel · broad · combine)* | make a gentle path, then a bold path — `isGentle` / `isBold` |
| 4 | Climb the Stairs *(build_constraint · targeted · compound)* | a staircase: 4+ steps in a row, same direction (scale run) — `isStaircase` |
| 5 | Land Softly *(build_constraint · targeted · apply)* | a leap, then a step back the *other* way (leap-resolution) — `isLandSoftly` |
| 6 | Fix the Broken Bridge **[2 steps]** *(repair · targeted · apply)* | smooth a wildly-jumping line — 1 culprit, then 2 — `isGentle` |
| 7 | Choose the Smooth Crossing *(compare · targeted · recognize)* | hear all 3, pick the stepwise one (reuses melody `showChoices`) |
| 8 | River Crossing Song *(capstone · broad · capstone)* | mostly steps with one bold leap — `isRiverCrossing` |
| 9 | Free Steps 🪨 *(— · none · finale)* | free-play sandbox → completion congrats |

- **Region:** Paths of Song (2nd package there) — completing it grows **Flutter** 🐛→🌿. **Prereqs:** intro, follow-the-fireflies (builds on the contour detector / `contourSeq`).
- **New mechanic:** `motionsOf()` (signed row-moves) + detectors `isStepwise/isOneJump/isGentle/isBold/isStaircase/isLandSoftly/isRiverCrossing`. No ghost (motion *size* isn't a shape) — hints place worked-example melodies via `setMelody`.
- **Ramp note:** beyond the draft — added **Climb the Stairs** (sustained scale run) and **Land Softly** (a leap resolving by step the opposite way — a real melodic principle), so the package teaches *new* musical craft, not just "steps vs leaps."

---

## 4. `twin-blooms` — Twin Blooms  [SC-1]  ✅ BUILT (2026-06-14) — pentatonic (early stage)

- **Region / cluster:** Stone Chorus Canyon / shape · **Palette:** pentatonic *(open/bright/close-ish pairs only; true tense pairs need diatonic → `twin-blooms-plus`)* · **Prereqs:** garden-basics · **Build:** now (pair-personality labels over the existing Fuse/interval recognizer).
- **Fantasy:** "Discover how two blooms can belong together." Two flowers resonate differently per pair.
- **Capability:** hear & choose between *kinds* of note-pairs by personality (open / bright / calm / close). **Hidden theory:** interval families, consonance contrast.
- **New systems:** pair "personality" descriptors mapped from the existing semitone-gap classifier (neighbors / bright / open / strong / wide); a pair-collection shelf.
- **Ramp shape:** any pair → open → close → bright → match-to-mood → produce two contrasting → sort/classify → an intentional pair set.

*As built (2026-06-14) — first **harmony** package; opens the **Stone Chorus Canyon** region on the map (friend **Geo** 🪨→🔸→🔶→💎→💎✨):*

| # | Level *(pattern · success · stage)* | Goal |
|---|---|---|
| 1 | First Bond *(discover · broad · teach)* | fuse any pair + click it to hear ("a pair has a feeling") |
| 2 | Open & Close **[2 steps]** *(discover · targeted · teach)* | craft an **open** pair, then a **close** pair |
| 3 | Bright Bloom *(discover · targeted · combine)* | craft a **bright** pair (a 3rd) |
| 4 | Same Distance, New Feel **[2 steps]** *(discover · targeted · apply)* | craft a close 1-step pair, then a *bright* 1-step pair — same shape, different feel (the uneven-ladder insight) |
| 5 | Hear the Bloom *(compare · targeted · recognize)* | hear 3 pairs as block chords, pick the open one |
| 6 | Find the Match **[2 steps]** *(match_feel · targeted · apply)* | calm mole → close pair; soaring hawk → open pair |
| 7 | Two Gardens *(build_constraint · targeted · compound)* | **place** 3 close pairs + 3 open pairs (loop & hear the contrast) — *uses the toolbox* |
| 8 | The Twin Bloom Song *(capstone · targeted · capstone)* | **place** a sequence using a close, a bright, and an open pair (3 checkboxes) |
| 9 | Free Blooms 🌸 *(— · none · finale)* | free-craft sandbox → completion congrats |

- **Mechanic:** built on the intro's Fuse/Toolbox. `widthBand(gap)` classifies a pair into 4 clear bands — **close** (2nd) / **bright** (3rd) / **open** (a 4th *and wider* — 5ths/6ths count) / **octave twins**; `pairMeta`/`pairKind` both use it (so toolbox names match the goals). `fuse()` records each pair's gap/span into `ev.pairs`. Goal helpers `craftedClose`/`craftedBright`/`craftedOpen`/`craftedSpanBand`; `colBand`/`countColBands` classify *placed* pairs (for L7/L8). New `showPairChoices` (pair compare — plays a block chord). **Stamping is now repeatable** (pick a bloom, stamp it many times; re-click or Esc to stop) so the toolbox is actually useful. **Prereqs:** intro only.
- **Playtest fixes (2026-06-14):** "open" was a *perfect 4th only*, so wider pairs failed despite "far apart" wording → now open = a 4th and wider. L7/L8 rewritten to **place** pairs (use the toolbox), not just craft. Dev level-jump now rebuilds names per package.
- **Highlight — "Same Distance, New Feel":** teaches the engine's core truth playfully — two seeds *one ladder-step apart* can be **close** (C–D) or **bright** (E–G) because the pentatonic ladder is uneven. Real ear-opening, pentatonic-native.
- **Palette flag:** "close" tops out at a major 2nd here; `twin-blooms-plus` (post-`two-new-colors`) adds real semitone tension — presented as the shelf *growing*, not changing.

---

## 5. `standing-towers` — Standing Towers  [SC-2]  ✅ BUILT (2026-06-14) — pentatonic

- **Region / cluster:** Stone Chorus Canyon / shape · **Palette:** pentatonic *(only C-major & A-minor families stand cleanly — enough to teach, thin for variety; blooms to F/G-maj, D/E-min after `two-new-colors`)* · **Prereqs:** garden-basics, twin-blooms · **Build:** now (extends the intro Tower mechanic + stability preview).
- **Fantasy:** "Raise towers that hold the canyon together." Stable 3-note shapes power bridges & mechanisms.
- **Capability:** build stable 3-note harmonic shapes intentionally. **Hidden theory:** triad construction, stability, chord completion.
- **New systems:** stability preview / "stands vs wobbles" meter; chord-completion challenges; structure collection display.
- **Ramp shape:** one tower → complete a tower → a specific supporting tower → compare stand vs wobble → two *distinct* towers → repair a wobble → stamp/reuse a tower → a sequence of towers.

*As built (2026-06-14) — 2nd Stone Chorus Canyon package (grows **Geo** 🔸→🔶); builds on the intro's tower mechanic with completion / recognition / repair / **reuse**:*

| # | Level *(pattern · success · stage)* | Goal |
|---|---|---|
| 1 | Raise the First Tower *(build_constraint · targeted · teach)* | craft a standing 3-stack + hear it — `craftedTower` |
| 2 | Missing Stone **[2 steps]** *(finish · targeted · teach)* | add the missing stone so the column stands — `colStands` |
| 3 | Tower or Wobbler? *(compare · targeted · recognize)* | hear 3 three-note shapes, pick the one that stands (reuses `showPairChoices` w/ a "Shape" label) |
| 4 | Twin Towers *(build_constraint · targeted · compound)* | stand **two** different towers — `twinTowersCount()` accepts CRAFTED *or* PLACED standing columns, keyed by actual notes (placement-consistent with L2/L5/L7; offs would collide C-maj/A-min) |
| 5 | Repair the Ruin **[2 steps]** *(repair · targeted · apply)* | move the crammed stone so a wobbler stands — `colStands` |
| 6 | Stamp the Strong Shape *(build_constraint · targeted · apply)* | craft a tower, then **stamp** it onto the field (toolbox reuse) |
| 7 | Canyon Resonance *(capstone · targeted · capstone)* | stand 3+ towers across the field, loop & ring them — `countColStands>=3` |
| 8 | Free Towers 🏛️ *(— · none · finale)* | free-build sandbox → completion congrats |

- **Mechanic:** the intro's Fuse → tower/wobbler (`stableMidis`); new `colStands(c)`/`countColStands()` classify *placed* 3-note columns; `ev.towerSigs` tracks distinct towers crafted this stage; `showPairChoices` gained a `label` param (chord compare). Uses the new **repeatable stamping** for the placement levels. **Prereqs:** intro, twin-blooms.
- **Note:** pentatonic actually offers more than 2 standing shapes (C-maj & A-min triads *plus* quartal/6th stacks like D-G-C), so "two different towers" is comfortable. The major/minor *flavor* distinction is saved for a later package.

---

## 6. `question-and-answer` — Question and Answer  [PS-3]  ✅ BUILT (2026-06-18) — pentatonic · phrase A/B split

- **Region / cluster:** Paths of Song / voice · **Palette:** pentatonic · **Prereqs:** garden-basics, follow-the-fireflies · **Build:** done (added the phrase A/B split on the timeline; reuses the existing **home/tonic** concept for open-vs-closed).
- **Fantasy:** "Answer the garden when it calls." Birds/lanterns send a phrase; you reply.
- **Capability:** make one phrase that feels **open** (a question), and another that feels like an **answer** (closed). **Hidden theory:** antecedent/consequent, open vs. closed phrasing, musical syntax.
- **Key insight (pentatonic-native):** *open = ends away from HOME; closed = ends on HOME.* We already have tonic/home detection — so Q&A needs no new pitch system, only a **phrase A/B boundary** (e.g. columns 0–7 = call, 8–15 = answer) + the ability to replay phrase A.
- **New systems:** phrase A/B regions on the field; "ends-open vs ends-home" evaluation per phrase; replay-the-call button.
- **Ramp shape:** respond at all → recognize the closed ending → build a closed answer → match the call's tone → relate B to A *and* close → two different answers → repair a mismatch → compose a full Q&A pair.

| # | Level *(pattern · success · stage)* | Goal |
|---|---|---|
| 1 | The First Call *(answer · broad · teach)* | hear a call, place any answer in phrase B |
| 2 | Open and Closed *(compare · targeted · teach)* | choose which of two endings feels like a real answer (ends home) |
| 3 | Complete the Conversation *(finish · targeted · combine)* | finish phrase B so it lands on HOME (a closed answer) |
| 4 | Bird Across the Canyon *(match_feel · targeted · combine)* | reply that mirrors the call's shape *and* closes home |
| 5 | Same Thought, New Ending *(transform · targeted · apply)* | echo phrase A's opening, then answer it differently (closed) |
| 6 | Calm Reply / Bold Reply *(build_constraint · broad · recognize)* | make two *different* valid answers to the same call |
| 7 | Fix the Mismatch *(repair · targeted · compound)* | an answer that hangs open / clashes — repair it so it belongs |
| 8 | The Talking Tree *(capstone · broad · capstone)* | compose your own open call **and** closed answer that wake the tree |
| 9 | Free Talk 💬 *(— · none · finale)* | free-play sandbox → completion congrats |

- **Quest:** *Voices Across the Canyon* — a musical conversation between separated creatures. **Sandbox:** phrase-pair tool, call/response playback, "write a question, then answer it" prompt.
- **Ramp note:** the jump from "recognize closed" (L2) to "relate B to A" (L5) to "compose both halves" (L8) is the real escalation — formal phrase logic, taught entirely through feel.
- **As built (2026-06-18) — 3rd Paths of Song package (grows **Flutter** 🌿→🦋):** the new **phrase A/B split** is the package's mechanic — the 16-col field divides into a dim **call** half (cols 0–7) and a bright **answer** half (cols 8–15), with a gold edge on the boundary (`setPhraseGuide`, `.callcol`/`.answercol`/`.answeredge` CSS). A level carries `phrase:true` plus an optional `call:[[r,c]…]` that's pre-placed in phrase A and auto-played on entry; the 🔊 Listen button replays the call (`playCall`). Open/closed is read straight off the existing tonic rows — `answerEndsHome()`/`answerEndsOpen()` test whether the answer half's last occupied column lands on a HOME row. Detectors (all in the "Question & Answer" block): `answerCount`, `answerMirrorsCall` (L4: same direction + closes), `answerEchoesOpening` (L5: starts near the call's first note + closes), `answerCalm`/`answerBold` (L6: stepwise vs. leaping, both closed), and `callEndsOpen`+`callCount` for the L8 capstone where the player writes *both* halves. `showChoices` gained an optional `prompt` param (L2 reuses the melody picker — no phrase tint there since it wipes the whole field). On entry, a phrase level normalizes the field back to one 16-col bar (`removeColumns`) so the halves stay aligned. Reusable for `ways-home` (which grades the same open/closed seam by *degree* after the diatonic milestone). All eight goals + the L7 repair were verified against their hint melodies.

---

## 7. `wind-and-gaps` — Wind and Gaps  [PW-2]  ✅ BUILT (2026-06-18) — pentatonic · R2-lite (drum-grid density)

- **Region / cluster:** Pulse Woods / pulse · **Palette:** pentatonic · **Rhythm tier:** R2 *(lite version shipped on the on/off drum grid as density control; the full melodic note-duration/rest version still needs the R3 bars & plots editor)* · **Prereqs:** garden-basics, footsteps · **Build:** done (lite); R3 duration version deferred to the editor.
- **Fantasy:** "Use silence so the garden can breathe." Wind moves through the openings.
- **Capability:** use rests and rhythmic space intentionally — "not everything valuable is more notes." **Hidden theory:** rests, density, rhythmic breath, negative space.
- **New systems:** density evaluation; a "remove-to-improve" level style; world response to sparse vs. dense; (later) the rest tool on the melody grid.
- **Ramp shape:** remove to open → make a sparse pattern → repair an overfilled one → compare densities → strategic gaps (groove from space) → a specific sparse feel → crowded→improved transform → integrate sparse beat under melody.

| # | Level *(pattern · success · stage)* | Goal |
|---|---|---|
| 1 | Let the Wind Through *(repair · targeted · teach)* | remove beats from an overcrowded pattern so the breeze passes (drop below a density threshold) |
| 2 | Make It Breathe *(build_constraint · broad · teach)* | build a sparse rhythm with room between hits |
| 3 | Too Crowded *(repair · targeted · combine)* | repair an overfilled rhythm (remove to improve) |
| 4 | Sparse or Busy *(compare · targeted · recognize)* | hear both, pick the pattern that fits a calm night |
| 5 | Bounce from Space *(build_constraint · targeted · compound)* | make it groove by leaving the *right* gaps (syncopation via rests, specific steps) |
| 6 | Quiet Footsteps *(match_feel · targeted · apply)* | build a very sparse "sneaking" pattern |
| 7 | Two Versions *(transform · targeted · compound)* | make a crowded version, then improve it by removing |
| 8 | Breathing Grove *(capstone · broad · capstone)* | a pulse+melody texture that feels open and alive, not crowded |
| 9 | Free Air 🍃 *(— · none · finale)* | free-play rhythm+melody sandbox → completion congrats |

- **Quest:** *The Night Grove* — move through the garden in the spaces between sounds. **Sandbox:** rest tool, sparse/dense prompts, optional density meter; cards (airy / breathing / quiet / roomy).
- **Ramp note:** L5 (groove from *strategic* gaps) is the conceptual peak — absence creating rhythm — and is meaningfully harder than "just remove some."
- **As built (2026-06-18) — 2nd Pulse Woods package (grows **Hopper** 🐸→🐸✨):** "density" = total drum hits in the first 16-step bar. Detectors (in a new "Wind and Gaps" block): `drumHits()`, `isBreathing` (≤6 hits), `isVerySparse` (≤4), `isSyncopated` (≥2 off-beat hits, off-beats outnumber strong beats, total ≤8 — *groove from gaps*); `STRONG`/`OFFBEATS` step sets. The repair/transform levels pre-fill a crowded pattern via `drumSetup` and the player taps pads to **remove** hits (no new placement UI — reuses the drum sequencer's toggle). New **density meter** (`#densityMeter`, `setDensityMeter`/`updateDensityMeter`): a live airy↔crowded bar under the drum lanes, shown on `density:true` levels (flag resolves from level OR step, like the Q&A phrase flag), refreshed on every `checkLevel`. New `showPatternChoices`/`pickPatternChoice` — a compare picker that auditions **full multi-lane** patterns (vs. the kick-only `showDrumChoices`). **Prereqs:** intro, footsteps. All goals verified against their hint patterns; a fully-crowded control correctly fails the sparse checks.

---

## 8. `ways-home` — Ways Home  [WW-1]  ✅ BUILT (2026-06-18) — DIATONIC

- **Region / cluster:** Weather of Wanting / flow·home · **Palette:** **diatonic** *(cadence strength needs the leading tone B and the 4th — impossible in pentatonic; this package cannot ship until the `two-new-colors` milestone)* · **Prereqs:** two-new-colors, question-and-answer, standing-towers · **Build:** after the diatonic milestone.
- **Fantasy:** "Guide things home — sometimes gently, sometimes completely." Travelers/lanterns respond to how firmly you bring the music to rest.
- **Capability:** choose how complete / restful / open an ending feels. **Hidden theory:** cadence strength, closure types, rest vs. arrival.
- **New systems:** phrase-end evaluation across *multiple closure strengths* (strong authentic arrival vs. gentle vs. half-cadence "paused"); closure-strength visualizer/aura; nuanced ending prompts. Builds on `question-and-answer`'s open/closed seam, now graded by *degree*.
- **Ramp shape:** a gentle close → a strong arrival → a paused/half ending → compare → match closure to story-intent → repair a landing → two strengths side by side → multi-ending integration.

| # | Level *(pattern · success · stage)* | Goal |
|---|---|---|
| 1 | Soft Landing *(finish · targeted · teach)* | end settled but gentle (a soft close) |
| 2 | Full Arrival *(finish · targeted · teach)* | a strong, fully-resolved ending (the "really finished" cadence) |
| 3 | Not Yet *(finish · targeted · combine)* | end *paused*, not finished (half-cadence, hangs) |
| 4 | Choose the Better Ending *(compare · targeted · recognize)* | hear endings, pick the one that truly closes |
| 5 | Match the Story *(match_feel · targeted · apply)* | pick the ending that fits the moment (resting / continuing / returning / waiting) |
| 6 | Repair the Landing *(repair · targeted · apply)* | a phrase that doesn't land — fix the ending |
| 7 | Two Roads Home *(build_constraint · targeted · compound)* | make two versions: one gentle arrival, one strong arrival |
| 8 | Lantern Shore *(capstone · broad · capstone)* | bring several lanterns home with endings of *different* strengths, matched to each situation |

*As built (2026-06-18) — first **functional-harmony** package; opens the **Weather of Wanting** region (friend **Sol** ☁️→☀️, weather clearing as you master resolution). First diatonic package after `two-new-colors`.*

| # | Level *(pattern · success · stage)* | Goal |
|---|---|---|
| 1 | Soft Landing *(finish · targeted · teach)* | end the tune on HOME (C) — `endsHome` |
| 2 | Full Arrival *(finish · targeted · teach)* | end with **B→C** (leading-tone pull) — `fullArrival` |
| 3 | Not Yet *(finish · targeted · teach)* | end on **G** (paused/half-close) — `halfClose` |
| 4 | Choose the Better Ending *(compare · targeted · recognize)* | hear 3 endings, pick the one that truly closes |
| 5 | Match the Story **[2 steps]** *(match_feel · targeted · apply)* | resting fox → land home; traveler → leave it hanging |
| 6 | Repair the Landing *(repair · targeted · apply)* | move the last note onto home so it arrives |
| 7 | Two Roads Home **[2 steps]** *(build_constraint · targeted · compound)* | a gentle landing (no B→C), then a strong one (B→C) |
| 8 | Lantern Shore *(capstone · targeted · capstone)* | a 6+ note journey ending in a strong B→C arrival |
| 9 | Free Endings 🏮 *(— · none · finale)* | free-play sandbox → completion congrats |

- **Mechanic (melodic cadence):** `endPC()`/`approachPC()` read the tune's last two notes; `endsHome` (ends C) / `fullArrival` (B→C, the strongest — *needs the diatonic leading tone*) / `softArrival` (home but not via B) / `halfClose` (ends G, paused). Reuses `showChoices` for the compare. **Palette:** `diatonic`. **Prereqs:** two-new-colors, question-and-answer, standing-towers.
- **Ramp note:** turns the intro's intuitive "home" into *graded* closure (gentle/strong/paused) and is the first real payoff of the diatonic widening — the B→C leading tone learned in Two New Colors becomes "the strongest way home."

---

## 9. `twin-blooms-plus` — Twin Blooms Plus  [SC-1+]  ✅ BUILT (2026-06-20) — DIATONIC · tension

- **Region / cluster:** Stone Chorus Canyon / shape · **Palette:** **diatonic** *(real tension needs the semitones F & B bring)* · **Prereqs:** twin-blooms, two-new-colors.
- **Fantasy:** "Some pairs CLASH and feel restless — and the magic is how they pull, and finally release, into rest."
- **Capability:** the full pair-personality range — clash, tritone, and the pull toward release. **Hidden theory:** semitone dissonance (minor 2nd), the tritone, resolution of dissonance into consonance.
- **Presented as the twin-blooms shelf *growing***, not a new system — the same Fuse/pair mechanic, now with restless pairs (delivers the depth the pentatonic stage couldn't).

| # | Level *(pattern · success · stage)* | Goal |
|---|---|---|
| 1 | The Restless Pair *(discover · targeted · teach)* | fuse B+C (a minor-2nd CLASH) and hear it — `craftedTense` |
| 2 | Two Kinds of Restless **[2 steps]** *(discover · targeted · teach)* | craft a CLASH (neighbours), then the TRITONE (F with B) — `craftedClash`/`craftedTritone` |
| 3 | Tension Wants Home *(build_constraint · targeted · combine)* | a tritone (F+B) followed by a restful pair (E+C) — `tensionThenRest` |
| 4 | Find the Restless One *(compare · targeted · recognize)* | hear 3 pairs, pick the tense one (`showPairChoices`) |
| 5 | Match the Mood **[2 steps]** *(match_feel · targeted · apply)* | spooky ghost → tense pair; sleepy turtle → restful pair — `craftedTense`/`craftedRestful` |
| 6 | Resolve the Clash *(repair · targeted · apply)* | a tune ends on a hanging tritone — add the restful pair after it |
| 7 | Suspense & Release *(build_constraint · targeted · compound)* | a phrase with a tense pair that resolves — tension as storytelling |
| 8 | The Restless Song *(capstone · targeted · capstone)* | use tension **twice**, resolve at the end — `countTensePairs()>=2` + `tensionThenRest` · 🎧 famous: **Big Ben chimes** |
| 9 | Free Tension 🌶️ *(— · none · finale)* | free-play sandbox → completion congrats |

- **Mechanic:** tension detectors over the existing pair machinery — `craftedTense/craftedClash/craftedTritone/craftedRestful`, `countTensePairs()`, `tensionThenRest()` (a tense column later followed by a restful one; **can resolve across an empty column** — fixed 2026-06-27). Grows **Geo** 🔶→💎.
- **Shipped alongside the per-package toolbox fix:** each package now has its own crafting bag (a global bag let old tools satisfy "craft an X" goals; don't reintroduce it).

---

## 10. `river-turns` — River Turns  [WW-2]  ✅ BUILT (2026-06-22) — DIATONIC · chord progressions

- **Region / cluster:** Weather of Wanting / flow · **Palette:** **diatonic** · **Prereqs:** two-new-colors, ways-home.
- **Fantasy:** "Chords can travel like a river — out from home, and always finding a way back."
- **Capability:** move from one harmony to another on purpose; feel I / IV / V / vi as *places*. **Hidden theory:** diatonic function (tonic/subdominant/dominant), the I-IV-V-I journey, the four-chord pop progression.
- **New systems (the chord-progression machinery — reused by pull-of-the-moon & false-doors):** `CHORDS` (I, IV, V, vi as grid shapes), `placeProg()` (lay a progression on the timeline), `chordSyms()` (read placed columns back as roman degrees), `hasChordRun()` (ordered subsequence check), `startsOnDegree`/`endsOnDegree`, and `showProgChoices` (a compare picker that auditions two-chord moves).

| # | Level *(pattern · success · stage)* | Goal |
|---|---|---|
| 1 | Leave Home *(build_constraint · targeted · teach)* | place two different chords — `distinctChordCount()>=2` |
| 2 | Two Roads Out **[2 steps]** *(build_constraint · targeted · teach)* | I → IV (the bright road), then I → V (the tense road) |
| 3 | The Way Back *(build_constraint · targeted · combine)* | V → I — feel the dominant relax home |
| 4 | The River's Journey *(build_constraint · targeted · compound)* | build I → IV → V → I and loop it |
| 5 | Which Way Flows Home? *(compare · targeted · recognize)* | from V, hear V→I / V→vi / V→IV — pick the true way home |
| 6 | Reconnect the Villages *(repair · targeted · apply)* | a progression with a gap (I … V I) — add the missing IV |
| 7 | A River of Your Own *(build_constraint · broad · compound)* | start on I, wander through 3+ chords, end on I |
| 8 | The Famous River *(capstone · targeted · capstone)* | build **I → V → vi → IV** · 🎧 famous: **the four-chord song** |
| 9 | Free Rivers 🌊 *(— · none · finale)* | free-play sandbox → completion congrats |

- **Ramp note:** the compare (L5) is the functional-hearing moment; L7's broad "your own river" is the expression valve before the famous-progression capstone lands the "you've heard this in a thousand songs" reveal.

---

## 11. `pull-of-the-moon` — Pull of the Moon  [WW-3]  ✅ BUILT (2026-06-22) — DIATONIC · dominant

- **Region / cluster:** Weather of Wanting / flow·home · **Palette:** **diatonic** · **Prereqs:** two-new-colors, river-turns *(the planned `soft-wobble-strong-wobble` prereq was dropped — not built; `twin-blooms-plus` covers the tension groundwork)*.
- **Fantasy:** "The dominant chord aches to come home — build the longing, strong or gentle, then release it."
- **Capability:** command the *strength* of the pull home. **Hidden theory:** the dominant, authentic (V→I) vs. plagal (IV→I) cadence, the leading tone as the engine of the pull.
- **Reuses** the river-turns chord machinery; adds `leadingToneResolves()` (the top voice climbs B→C across V→I).

| # | Level *(pattern · success · stage)* | Goal |
|---|---|---|
| 1 | The Chord of Longing *(discover · targeted · teach)* | build V and feel it want more |
| 2 | The Strong Pull *(build_constraint · targeted · teach)* | V → I (authentic — full force home) |
| 3 | The Gentle Pull *(build_constraint · targeted · teach)* | IV → I (plagal — the soft "amen" landing) |
| 4 | Strong or Gentle? *(compare · targeted · recognize)* | hear V→I vs IV→I, pick the stronger pull |
| 5 | The Climbing Note *(discover · targeted · combine)* | a V→I whose **top voice climbs B→C** — hear the leading tone — `leadingToneResolves` |
| 6 | Match the Longing **[2 steps]** *(match_feel · targeted · apply)* | triumphant gates → strong V→I; drifting to sleep → gentle IV→I |
| 7 | Raise the Moon *(capstone · targeted · capstone)* | a 4+ chord progression released home with a final V→I · 🎧 famous: **Shave and a Haircut** |
| 8 | Free Moon 🌙 *(— · none · finale)* | free-play sandbox → completion congrats |

- **Ramp note:** L5 is the jewel — the same B→C pull learned melodically in `two-new-colors` and `ways-home` reappears *inside a chord*, unifying the three packages into one physical intuition.

---

## 12. `false-doors` — False Doors  [WW-4]  ✅ BUILT (2026-06-22) — DIATONIC · deception

- **Region / cluster:** Weather of Wanting / flow · **Palette:** **diatonic** · **Prereqs:** river-turns, pull-of-the-moon.
- **Fantasy:** "Set up the pull home — then surprise everyone with a door that isn't quite home, but still sounds lovely."
- **Capability:** subvert the expected landing coherently. **Hidden theory:** the deceptive cadence (V→vi), delayed resolution, ending on the relative minor.
- **Reuses** the chord machinery wholesale — no new systems; the design work is all in expectation-setting (L1 deliberately rebuilds the *expected* ending before breaking it).

| # | Level *(pattern · success · stage)* | Goal |
|---|---|---|
| 1 | The Door Everyone Expects *(build_constraint · targeted · teach)* | build the expected V → I (so we both know what to break) |
| 2 | The False Door *(discover · targeted · teach)* | V → vi — the lovely surprise |
| 3 | Expected or False? *(compare · targeted · recognize)* | hear V→I / V→vi / V→IV — pick the false door |
| 4 | Redirect the Landing *(repair/transform · targeted · apply)* | a placed V→I — swap the final I for vi |
| 5 | The Long Way Home *(build_constraint · targeted · compound)* | fake it (V→vi), wander, then truly arrive (… V→I) |
| 6 | A Door Left Open *(build_constraint · targeted · compound)* | a 3+ chord piece that **ends** on the false door — bittersweet, unresolved |
| 7 | Mirror Maze *(capstone · targeted · capstone)* | start on I, spring a V→vi twist, end with a true V→I · 🎧 famous: **Pachelbel's Canon** |
| 8 | Free Doors 🚪 *(— · none · finale)* | free-play sandbox → completion congrats |

- **Ramp note:** L5 vs L6 teach the two *uses* of deception — delay (sweeter arrival) and denial (bittersweet ending) — which is the "advanced composition fun" the catalog promised.

---

## 13. `sun-and-moon-garden` — Sun & Moon Garden  [CC-1 → region 🌗 The Twin Gardens]  ✅ BUILT (2026-06-20) — DIATONIC · major/minor mood

- **Region / cluster:** **The Twin Gardens** / color·mood *(moved out of the planned "Color Caverns" — the twin-biome fantasy earned its own region on the map)* · **Palette:** **diatonic** · **Prereqs:** two-new-colors, ways-home *(the planned `tiny-motifs` prereq was dropped — not built)*.
- **Fantasy:** "The same notes, two feelings — bright like sunlight (major) or wistful like moonlight (minor)."
- **Capability:** flip the same material bright vs. wistful. **Hidden theory:** major vs. minor triads (the 3rd), relative major/minor (C-home vs A-home over the same 7 notes), mode as mood.
- **New systems:** the **mood wash** — levels carry `mood:"sun"|"moon"` and `setMood()` tints the whole page (gold wash vs. twilight-purple); detectors `countBrightChords()`/`countWistfulChords()` (major/minor triad recognition over placed columns), `restsAtHome()` re-read against the moon's home A.

| # | Level *(pattern · success · stage)* | Goal |
|---|---|---|
| 1 | Sun Garden *(discover · targeted · teach)* | stack the bright chord (C-E-G) under the sun wash |
| 2 | Moon Garden *(discover · targeted · teach)* | stack the wistful chord (A-C-E) under the moon wash |
| 3 | Bright or Wistful? *(compare · targeted · recognize)* | hear 3 chords, pick the wistful one |
| 4 | Same Notes, Two Feelings **[2 steps]** *(discover · broad · combine)* | *listen*: the same path ending on C (bright), then nearly the same ending on A (wistful) — relative major/minor felt, zero jargon |
| 5 | Paint the Mood **[2 steps]** *(build_constraint · targeted · apply)* | a daytime scene around a major chord; a night scene around a minor one |
| 6 | Fix the Mood *(repair · targeted · apply)* | a moonlit tune that ends on C — move its last note home to A |
| 7 | Two Gardens *(build_constraint · targeted · compound)* | one song holding both — a major AND a minor chord |
| 8 | Twin Biomes *(capstone · targeted · capstone)* | a 6+ note tune traveling day→night with both chords · 🎧 famous: **The Moldau** |
| 9 | Free Light 🌗 *(— · none · finale)* | free-play sandbox → completion congrats |

- **Ramp note:** L4 is pure listening (two `play`-only steps) — deliberately, because relative major/minor is best *shown*; the player's hands take over from L5. Friend: **Solune** 🌑→🌞.

---

## 14. Build order & dependencies — ALL 14 EXPANSION PACKAGES BUILT ✅ (as of 2026-06-22)

Build history (alternating melody/rhythm/harmony to avoid fatigue):

1. **follow-the-fireflies** ✅ 2026-06-13 (contour)
2. **footsteps** ✅ 2026-06-13, redesigned 06-14 (pulse, R1)
3. **stepping-stones** ✅ 2026-06-14 (step/leap)
4. **twin-blooms** ✅ 2026-06-14 (pair color)
5. **standing-towers** ✅ 2026-06-14 (triads)
6. **question-and-answer** ✅ 2026-06-18 (phrase Q&A — the A/B timeline split)
7. **wind-and-gaps** ✅ 2026-06-18 (rests, R2-lite — density eval + meter)
8. **two-new-colors** ★ ✅ 2026-06-18 (the diatonic milestone: `PALETTES` + `setPalette`; staged F-then-B reveal; persistent `progress.colors`)
9. **ways-home** ✅ 2026-06-18 (melodic cadence strength)
10. **sun-and-moon-garden** ✅ 2026-06-20 (major/minor mood — opened The Twin Gardens region)
11. **twin-blooms-plus** ✅ 2026-06-20 (tension/tritone; + the per-package toolbox fix)
12. **river-turns** ✅ 2026-06-22 (chord progressions — the `CHORDS`/`placeProg`/`hasChordRun` machinery)
13. **pull-of-the-moon** ✅ 2026-06-22 (dominant pull, leading tone in chords)
14. **false-doors** ✅ 2026-06-22 (deceptive cadence)

**DAG as built** (runtime truth = `PACKAGES[*].requires` in `index.html`): intro → {fireflies → {stepping-stones, question-and-answer}, footsteps → wind-and-gaps, twin-blooms → standing-towers → **two-new-colors**}; (two-new-colors + Q&A + standing-towers) → **ways-home**; (two-new-colors + ways-home) → {**river-turns**, **sun-and-moon-garden**}; (two-new-colors + river-turns) → **pull-of-the-moon**; (river-turns + pull-of-the-moon) → **false-doors**; (twin-blooms + two-new-colors) → **twin-blooms-plus**.

Reusable systems unlocked along the way: **compare pickers** (fireflies → melodies; twin-blooms → pairs/chords; footsteps → drums; wind-and-gaps → full patterns; river-turns → progressions) — the recognition pattern now spans every domain; **phrase A/B split** (Q&A) → reused by ways-home; **chord-progression machinery** (river-turns) → reused by pull-of-the-moon + false-doors and ready for Region 6+; **mood wash** (sun-and-moon) → ready for modal "atmosphere world" packages; **🎧 famous-example rewards** on capstones (see DESIGN §10) → every future package should ship with one.

**Not yet built** (next candidates, per PACKAGES.md §5): `tiny-motifs`, `off-the-path`, `two-kinds-of-walking` (Wave A leftovers); `shifting-shadows`, `soft-wobble-strong-wobble` (Wave C leftovers); then the system-gated waves (duration editor / multi-voice / sections / styles).
