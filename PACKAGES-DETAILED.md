# Music Garden — Detailed Package Specs (first 8)

*Production-oriented, level-by-level specs for the first expansion wave. Sibling to PACKAGES.md (the catalog/DAG + template + standards). Each package is designed against the difficulty-ramp doctrine below.*
Last updated: 2026-06-13

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

## 3. `stepping-stones` — Stepping Stones  [PS-2]  — pentatonic · buildable now

- **Region / cluster:** Paths of Song / voice · **Palette:** pentatonic *(ladder steps are uneven in semitones — embodied smooth/leap feel reads fine; true diatonic steps arrive later)* · **Prereqs:** garden-basics, follow-the-fireflies · **Build:** now (step/leap detector over row-adjacency; builds on contour).
- **Fantasy:** "Cross the water by choosing smooth steps or bold leaps." Stepwise = close stones; leaps = long jumps.
- **Capability:** choose whether a line moves gently (steps) or dramatically (leaps). **Hidden theory:** stepwise motion vs. skips/leaps; interval size as expressive choice.
- **New systems:** "mostly stepwise vs. contains leaps" detector (adjacent-row = step, skip ≥2 rows = leap); phrase motion tags (smooth / bold / jumpy / gliding); stone-spacing visual.
- **Ramp shape:** steps → one leap → smooth feel → bold feel → repair over-jumpy → compare → produce *both* styles → integrate steps + a leap in one phrase.

| # | Level *(pattern · success · stage)* | Goal |
|---|---|---|
| 1 | Small Steps *(build_constraint · targeted · teach)* | cross using mostly adjacent stones (stepwise) |
| 2 | One Big Jump *(build_constraint · targeted · teach)* | reach the far pad with one clear leap in a smooth line |
| 3 | Gentle Path *(match_feel · broad · combine)* | a phrase that "feels easy to walk" (smooth-tagged) |
| 4 | Bold Path *(match_feel · broad · combine)* | a phrase for a daring creature (more leaps) |
| 5 | Fix the Broken Bridge *(repair · targeted · apply)* | repair a line that jumps too wildly (smooth one or two notes) |
| 6 | Choose the Better Route *(compare · targeted · recognize)* | hear both, pick the smooth crossing |
| 7 | Two Travelers *(build_constraint · targeted · compound)* | make a cautious path (steps) **and** a brave path (leaps) — two distinct phrases |
| 8 | River Crossing Song *(capstone · broad · capstone)* | a melody that uses both steps **and** one dramatic leap |

- **Quest:** *Crossing the Silver Stream* — careful creature needs steps, adventurous creature needs leaps. **Sandbox:** motion tags + optional step-bias / leap-bias assist; "make it gentle / make it daring" cards.
- **Ramp note:** L7 (produce both styles) is the compound; L8 asks for controlled mixing — a real composing choice, not just "more notes."

---

## 4. `twin-blooms` — Twin Blooms  [SC-1]  — pentatonic (early stage) · buildable now

- **Region / cluster:** Stone Chorus Canyon / shape · **Palette:** pentatonic *(open/bright/close-ish pairs only; true tense pairs need diatonic → `twin-blooms-plus`)* · **Prereqs:** garden-basics · **Build:** now (pair-personality labels over the existing Fuse/interval recognizer).
- **Fantasy:** "Discover how two blooms can belong together." Two flowers resonate differently per pair.
- **Capability:** hear & choose between *kinds* of note-pairs by personality (open / bright / calm / close). **Hidden theory:** interval families, consonance contrast.
- **New systems:** pair "personality" descriptors mapped from the existing semitone-gap classifier (neighbors / bright / open / strong / wide); a pair-collection shelf.
- **Ramp shape:** any pair → open → close → bright → match-to-mood → produce two contrasting → sort/classify → an intentional pair set.

| # | Level *(pattern · success · stage)* | Goal |
|---|---|---|
| 1 | First Bond *(discover · broad · teach)* | fuse any pleasant pair; "a pair has a feeling" |
| 2 | Wide Sky *(discover · targeted · teach)* | find an **open** pair (4th/5th) |
| 3 | Close Whisper *(discover · targeted · teach)* | make a **close** pair (a 2nd) *(as close as pentatonic gets — true tension later)* |
| 4 | Bright Bloom *(discover · targeted · combine)* | make a **bright** pair (a 3rd) |
| 5 | Find the Match *(match_feel · targeted · apply)* | give a creature the pair that fits its mood (shy / bright / peaceful) |
| 6 | Pair Sorting *(classify · targeted · recognize)* | sort discovered pairs into calm / bright / open |
| 7 | Two Gardens *(build_constraint · targeted · compound)* | one pair for the sunny bed, a *different* pair for the shaded bed |
| 8 | The Twin Bloom Archive *(capstone · broad · capstone)* | discover two distinct pair types that serve different purposes |

- **Quest:** *The Shrine of Two Flowers* — each side responds to a fitting pair-bond. **Sandbox:** expanded pair library, non-theory personality labels, pair collection shelf.
- **Palette flag:** "Close Whisper" tops out at a major 2nd in pentatonic; `twin-blooms-plus` (post-`two-new-colors`) adds real semitone tension and strong pull — presented as the shelf *growing*, not changing.

---

## 5. `standing-towers` — Standing Towers  [SC-2]  — pentatonic-thin · buildable now

- **Region / cluster:** Stone Chorus Canyon / shape · **Palette:** pentatonic *(only C-major & A-minor families stand cleanly — enough to teach, thin for variety; blooms to F/G-maj, D/E-min after `two-new-colors`)* · **Prereqs:** garden-basics, twin-blooms · **Build:** now (extends the intro Tower mechanic + stability preview).
- **Fantasy:** "Raise towers that hold the canyon together." Stable 3-note shapes power bridges & mechanisms.
- **Capability:** build stable 3-note harmonic shapes intentionally. **Hidden theory:** triad construction, stability, chord completion.
- **New systems:** stability preview / "stands vs wobbles" meter; chord-completion challenges; structure collection display.
- **Ramp shape:** one tower → complete a tower → a specific supporting tower → compare stand vs wobble → two *distinct* towers → repair a wobble → stamp/reuse a tower → a sequence of towers.

| # | Level *(pattern · success · stage)* | Goal |
|---|---|---|
| 1 | Raise the First Tower *(build_constraint · targeted · teach)* | build any standing 3-stack |
| 2 | Missing Stone *(finish · targeted · teach)* | complete a tower with one note missing |
| 3 | Bridge Support *(build_constraint · targeted · combine)* | build a tower that powers a bridge (specific stable shape, world consequence) |
| 4 | Choose the Stronger Shape *(compare · targeted · recognize)* | hear several 3-note shapes, pick the one that *stands* (vs a wobbler) |
| 5 | Twin Towers *(build_constraint · targeted · compound)* | build **two different** standing shapes *(near the pentatonic ceiling — hint "new colors coming")* |
| 6 | Repair the Ruin *(repair · targeted · apply)* | fix a structure that wobbles too much |
| 7 | Stamp the Strong Shape *(build_constraint · targeted · compound)* | use a crafted tower as a reusable stamp in the right place |
| 8 | Canyon Resonance *(capstone · broad · capstone)* | build a *sequence* of standing structures across the field to wake the canyon |

- **Quest:** *The Broken Causeway* — canyon bridges powered by stable structures. **Sandbox:** stable-tower collection, richer chord stamps, structure decor; prompt cards (strong / grounded / supportive / rising).
- **Palette flag:** Twin Towers is deliberately at the pentatonic limit (~2 clean triads); it's the natural on-ramp to wanting `two-new-colors`.

---

## 6. `question-and-answer` — Question and Answer  [PS-3]  — pentatonic · needs phrase A/B system (M)

- **Region / cluster:** Paths of Song / voice · **Palette:** pentatonic · **Prereqs:** garden-basics, follow-the-fireflies · **Build:** soon (needs a phrase A/B split on the timeline; reuses the existing **home/tonic** concept for open-vs-closed).
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

- **Quest:** *Voices Across the Canyon* — a musical conversation between separated creatures. **Sandbox:** phrase-pair tool, call/response playback, "write a question, then answer it" prompt.
- **Ramp note:** the jump from "recognize closed" (L2) to "relate B to A" (L5) to "compose both halves" (L8) is the real escalation — formal phrase logic, taught entirely through feel.

---

## 7. `wind-and-gaps` — Wind and Gaps  [PW-2]  — pentatonic · R2-lite now (full R3 later)

- **Region / cluster:** Pulse Woods / pulse · **Palette:** pentatonic · **Rhythm tier:** R2 *(lite version ships now on the on/off drum grid as density control; the full melodic note-duration/rest version needs the R3 bars & plots editor)* · **Prereqs:** garden-basics, footsteps · **Build:** now (lite); flag R3 dependency for the full version.
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

- **Quest:** *The Night Grove* — move through the garden in the spaces between sounds. **Sandbox:** rest tool, sparse/dense prompts, optional density meter; cards (airy / breathing / quiet / roomy).
- **Ramp note:** L5 (groove from *strategic* gaps) is the conceptual peak — absence creating rhythm — and is meaningfully harder than "just remove some."

---

## 8. `ways-home` — Ways Home  [WW-1]  — ⚠️ DIATONIC (gated behind `two-new-colors`)

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

- **Quest:** *The Lantern Shore* — lanterns return only if endings fit the emotional situation. **Sandbox:** ending mood cards, closure-strength preview; cards (complete / resting / waiting / almost-home).
- **Ramp note:** this is the most advanced of the first 8 — it turns the intro's intuitive "home" into *graded* functional control, and is the payoff that justifies the diatonic widening.

---

## 9. Build order & dependencies (first 8)

Buildable on today's engine (pentatonic + small additions), in suggested order — alternating melody/rhythm/harmony to avoid fatigue:

1. **follow-the-fireflies** ✅ (contour) — built
2. **footsteps** (pulse, R1) — reuses drum lane + beat-stability eval
3. **stepping-stones** (step/leap) — step detector, builds on contour
4. **twin-blooms** (pair color) — labels over fuse recognizer
5. **standing-towers** (triads) — extends intro Tower + stability meter
6. **question-and-answer** (phrase Q&A) — *needs the phrase A/B timeline split*
7. **wind-and-gaps** (rests, R2-lite) — density eval on the drum grid

Then, after the **`two-new-colors`** milestone (diatonic widening):

8. **ways-home** (cadence strength) — closure-strength evaluation

DAG (per PACKAGES.md): garden-basics → {fireflies → {stepping-stones, question-and-answer}, footsteps → wind-and-gaps, twin-blooms → standing-towers}; (question-and-answer + standing-towers + two-new-colors) → ways-home.

Reusable systems unlocked along the way: **beat-stability eval** (footsteps) → reused by wind-and-gaps; **compare-picker** (fireflies) → reused everywhere; **phrase A/B split** (question-and-answer) → reused by ways-home; **stability meter** (standing-towers) → reused by later harmony packages.
