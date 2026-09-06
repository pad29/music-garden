# Tune Garden — Quests

*Requirements for the quest play mode. Last updated: 2026-09-06.*

> **This is a plan, not current state.** No quest exists in `index.html` today. Like
> `EDITOR-DESIGN.md`, this document states intent; `README.md` § Current status remains the
> record of what actually ships.

---

## 0. How this document was produced

Drafted through an adversarial multi-model loop (see `CLAUDE.md`), recorded here because the
disagreements shaped the result:

1. Claude and GPT independently enumerated what quests could be for, neither seeing the other's
   answer. GPT produced 41 purposes, 15 shapes, 42 failure modes and 20 tensions, closing with a
   reduction to **seven independent branch points**. Claude produced 20 purposes and 8 shapes.
2. The owner chose GPT's seven-dimension framing as the spine: *pick a value on each dimension;
   that coordinate defines one kind of quest; build it; later kinds open further values.*
3. GPT authored a requirements draft; Claude reviewed it adversarially; the owner decided nine
   questions, modifying three along Claude's lines.
4. GPT revised; Claude reviewed again; the owner decided four more.
5. Claude applied three amendments (**A1–A3**, marked inline) and wrote this document.

Where the two models disagreed, §9 records who won and why. Working files live in
`.claude/gpt/` (gitignored).

### Amendments applied after the final GPT round

- **A1 — Phase budget rebalanced.** Draft 2's phase estimates summed to 8–15 min while its own
  acceptance gate demanded a 10–15 min novice median. Rebalanced to sum correctly (§2.2).
- **A2 — Phase 2's contrast named in earned vocabulary.** Draft 2 asked the player to "make the
  same crossing feel different" — too abstract to act on. Claude first proposed the shipped
  *gentle/bold* framing, then found that pair is taught by `stepping-stones`, which is **not** a
  prerequisite here. Phase 2 instead names its two levers in the vocabulary this quest's own
  prerequisites teach (§2.2).
- **A3 — Map presentation constrained.** Neither draft bounded where quests appear, despite GPT's
  own failure mode *"the quest board becomes map clutter."* Added as **Q22**.

---

## 1. Vocabulary

### Q1. "Quest" has one meaning

A **quest** is a finite, 10–20-minute creative activity in which the player applies powers from
multiple completed packages to one musical brief, works in a guided Studio workspace, listens and
revises, and finishes with a saveable musical artifact.

A quest is **not** a package, level or capstone; not fiction wrapped around one detector; not a
generic Studio prompt; not a branch of mandatory curriculum progression.

**Reason:** `DESIGN.md` promises a distinct middle play mode and says quests combine several
packages. Using one word for both that and package fiction makes the distinction meaningless.

**Verification:** Browser navigation and copy must consistently distinguish packages, quests and
Studio. Repository searches must find no catalog or template label contradicting this definition.

### Q2. The 28 existing hooks become "World hooks"

Every `- **Quest:**` hook in `PACKAGES.md` becomes `- **World hook:**`, text and names unchanged.
The package-spec template's `- Quest hook:` line becomes `- World hook:`.

A **world hook** is fiction or a possible setting associated with a package. It does not imply an
implemented quest exists, and receives no quest ID or completion state until promoted into a real
quest definition. *The Lantern Meadow* stays the world hook for `follow-the-fireflies`; *The Root
Path* for `footsteps`; *The Broken Causeway* for `standing-towers`; *The Weather Shrine* for
`soft-wobble-strong-wobble`. Package finales remain **capstones**.

**Reason:** The hooks are good fiction seeds, but most describe package-local applications.
Renaming preserves the work without claiming 28 quests exist.

**Verification:** Pin each form separately so deletions cannot masquerade as success:

```bash
rg -n '^- \*\*World hook:\*\*' PACKAGES.md   # exactly 28
```
```bash
rg -n '^- \*\*Quest:\*\*|^- Quest hook:' PACKAGES.md   # no matches
```

These deliberately do not match the package name *Question and Answer*.

---

## 2. The first quest kind

### Q3. Build a Guided Commission first

| Dimension | First value |
|---|---|
| **Scope** | Cross-package commission |
| **Completion contract** | Objective ingredients plus player interpretation |
| **Progression role** | Optional power application |
| **Content model** | Authored, reusable declarative constraint |
| **Primary payoff** | Saved musical artifact |
| **Tone** | Layered child adventure + creator-facing commission |
| **Studio relationship** | Guided entry into the Studio workspace |

**Reason:** The highest-value player problem is the blank Studio page. Transfer across
capabilities is the essential learning result, but a mastery check is not a sufficient reason to
play. A Guided Commission gives a finite reason to create while inviting — and describing — powers
learned in separate packages. A prompt alone is not a quest: the phased revision journey, saved
artifact, completion ritual, session boundary and world context supply the ending a Studio prompt
lacks.

**Verification:** In a real browser the activity must launch from Home as a quest, open the shared
editor with a finite phase journey, and end with a normal v3 song that saves and replays. Unit
tests must prove every suggested route draws on analyzer vocabulary from more than one package.

### Q4. The first shipped quest is *The Firefly Crossing*

Unlocks when both `follow-the-fireflies` and `footsteps` are complete.

> Flutter's lights can see the crossing, but Hopper's roots need a heartbeat. Shape a path over a
> steady pulse, then find another way across. You decide which path becomes theirs.

Uses only shipped capabilities: pentatonic palette, one fixed-step melody, the drum grid, contour
detection from `follow-the-fireflies`, pulse patterns from `footsteps`, current playback, Studio
editing and v3 saving. It must **not** depend on durations, sections, multiple melodic voices,
notes-as-objects UI, dynamics, chromatic editing, or any other planned `EDITOR-DESIGN.md`
capability.

#### Phase 1 — Light the first path *(4–6 min)*

The player creates **version A**: a melody over a pulse. The commission presents one intention —
*"Give the lights a clear path and the roots a heartbeat"* — not a row of goals.

The challenge offers several valid routes, for example: any recognized contour over clean kicks on
the four main beats; any recognized contour over the even eight-step walk; any recognized contour
over the steady hi-hat shimmer. The player is not asked to complete all three — they are different
ways the same commission can work.

After a full playback the world describes what it heard. The player continues whether or not a
suggested route matched.

#### Phase 2 — Another way across *(3–5 min)*

The engine preserves version A and creates editable **version B** from it.

**Amendment A2.** The phase names its two levers using vocabulary these prerequisites actually
teach — `follow-the-fireflies` gives **Rise, Fall, Hover, Arc** (each with its own power card);
`footsteps` gives the steady pulse, the backbeat and the hi-hat shimmer:

> The lights know this path now. Show them another way across — give it a **different shape**, or
> give the roots a **different heartbeat**.

Valid routes accordingly: change the contour family while retaining any steady pulse; **or** retain
a recognized contour while changing to a different steady pulse family.

This phase uses **revision, not accumulation** — it must not add requirements on top of version A.
After version B is played, the world describes the difference it detected ("The second path arches
where the first climbed"; "The lights kept their shape, but the roots began walking twice as
often"). The player may continue even if the change falls outside the suggested routes, provided
they made an edit and heard the complete version.

> *Why not "gentle and bold":* that pair is taught by `stepping-stones`, which is not a
> prerequisite here. A player can reach this quest never having met it. Naming a contrast the
> player has not earned would reintroduce the comprehension problem the amendment exists to fix.

#### Phase 3 — Choose the crossing *(3–4 min)*

The player auditions A and B, chooses one, and may make a final edit. The chosen version must be
played after its latest edit before it can be offered. The world asks a reflective question — *"Which
path feels more like the journey you wanted?"* — whose answer does not affect completion.
**Offer this crossing** saves the chosen version as the quest artifact.

#### Phase implementation

Quest phases must **reuse or extract the existing general `steps:` behaviour** — indexed stages,
per-phase intro, phase counter, generic advancement (`curStage()`, `index.html:4783`; counter at
`:4891`; advancement in `stageComplete()`, `:4953`). They must not be Firefly-specific screen
branches. Unlike package `goals[]`, quest phases consume declarative challenge routes and preserve
version snapshots in the QuestRun.

**Amendment A1 — session budget.** Phases sum to **10–15 minutes**, matching the gate below.
Draft 2's estimates summed to 8–13, undershooting their own acceptance band.

**Acceptance gate.** Across at least five target-age or genuine-novice playtests, the median first
completion must fall between 10 and 15 minutes. If it does not, **the content must be revised — it
must not be padded** with waiting, extra detector clauses or forced repetition.

**Reason:** One contour plus one pulse is a three-minute task. Composing once, transforming the
same material, comparing both and choosing an artifact creates the promised middle session while
teaching revision rather than first-pass correctness. The shipped *Calm Reply, Bold Reply* step
pattern (`question-and-answer` L6) establishes that contrasting work on shared material is already
legible in Tune Garden.

**Verification:** Pure tests cover eligibility, route evaluation, snapshot preservation, change
detection, phase advancement, version selection and playback invalidation after a final edit.
Browser testing covers the full arc, A/B playback, audio, narration, saving, leaving and resuming.
Playtests must produce at least three materially different offered artifacts.

---

## 3. Completion and grading

### Q5. Evaluate routes, not a checklist

Objective observations **guide rather than veto**. A quest phase contains one musical **challenge**,
not a `goals[]`-style list, and its schema carries two or more alternative solution routes:

```text
challenge
  ├─ route A: contour family + one steady-pulse strategy
  ├─ route B: contour family + another steady-pulse strategy
  └─ route C: another musically distinct route
```

For Guided Commissions the **validator enforces**:

1. Each musical phase has at most one challenge.
2. Each challenge has at least two normalized, non-duplicate routes.
3. Each route contains no more than two positive musical observations.
4. Each route spans the capabilities the phase claims to combine.
5. At least one analyzer or bounded parameter differs meaningfully between routes.
6. Procedural facts — edited, played, compared, selected — are stored separately from musical
   observations.
7. The primary UI renders the commission as one intention, not individual green checkboxes.

Analyzer metadata supplies capability tags, compatible parameters and strategy families, so the
validator can reject duplicate routes, hidden single-answer challenges, excessive conjunctions and
routes that do not actually combine the advertised packages.

The engine may describe facts — the pulse stayed steady; the melody climbed, fell, hovered or
arched; the second version changed contour; the ending reached or avoided Home. It must **not**
decide whether a result is truly "gentle", "brave", "sad", "beautiful" or otherwise aesthetically
correct.

> **Known limit, accepted:** rules 3 and 4 together mean a two-package route carries exactly one
> observation per package. Adequate for Kind 1; revisit when a quest spans three packages.

### Q6. Kind 1 always permits "offer anyway"

Once a nonempty composition has been played completely since its latest edit, **Offer this
crossing** is available **even if no suggested route matched**. The response stays descriptive:

> The lights made a path, but the roots did not catch a steady heartbeat. You can shape it again,
> or offer this crossing as yours.

Offering anyway completes the quest, saves the same artifact, and gives the **same payoff** — no
reduced score, badge or failure mark. The completion record may keep neutral observations for
resume and world-response purposes but must not label the result deficient.

Phases 1 and 2 follow the same principle. Phase 2 additionally requires at least one musical edit
after version A is copied — proving a revision occurred without dictating what it must mean.

**Reason:** A hard stop at the first quest's emotional peak would teach that the Studio accepts only
detector-approved music. Objective routes still make transfer visible and testable, but final
authorship belongs to the player. Kind 2 differs in that it proposes no routes at all.

No hidden criteria, percentages, scores, stars, letter grades, or comparison against an ideal.

**Verification:** `evaluateQuest(definition, evidence, runState)` must be pure and reachable through
`tests/harness.mjs`. Tests cover route matching, duplicate-route rejection, route breadth, edit/play
revisions, unmatched offerings, identical payoff for matched and unmatched, and that reflection
answers never alter completion.

---

## 4. Declarative content and future player authoring

### Q7. Official quests use the same data path a future player author will use

Quest definitions are versioned, JSON-serializable data containing: stable `id`, schema `v`,
`author`, kind, title, brief; prerequisite package or capability IDs; ordered phases; workspace
settings (palette, columns, groove, available controls); quest-scoped tool grants; optional starter
songs as v3 data; challenges as alternative routes of analyzer IDs plus bounded parameters;
descriptor IDs; permitted reflection choices; completion action; payoff and presentation tokens.

A definition must **not** contain `chk` functions or any executable callback; arbitrary JavaScript,
HTML, CSS, URLs or asset paths; direct reads of DOM, Web Audio, global progress or package-local
mutable state; or behaviour selected by checking a particular quest ID.

The engine owns a whitelist of stable primitives — `phrase.minimumOnsets`, `contour.anyOf`,
`contour.differsFromSnapshot`, `pulse.kickOnMainBeats`, `pulse.evenWalk`,
`playback.completeSinceLastEdit`, `comparison.auditionedBoth`. Each declares a player-facing name,
explanation, parameter bounds, capability tags, compatibility rules and strategy family. A future
authoring UI exposes this same vocabulary.

**Reason:** Bespoke JavaScript per quest is a dead end for player authoring — shipped levels are
**247 `chk:` closures** invoked at `index.html:4944`, and an authoring UI cannot emit JS. The first
implementation must establish the safe vocabulary and execution boundary even though no design area
ships yet. Note every package already carries `version:1, author:"official"` and **nothing reads
either field**; quest `author` and `v` must actually participate in validation and loading.

**Verification:** Node tests cover schema validation, JSON round-trips, author/version handling,
unknown-primitive rejection, bounded parameters, route normalization, stable-ID dispatch, and a
definition loaded entirely from serialized data. Searching quest definitions must find no
function-valued fields.

### Q8. Separate definition, run state and musical artifact

1. **QuestDefinition** — immutable, versioned brief and allowed mechanics.
2. **QuestRun** — per-player drafts, phase index, version snapshots, observations, edit/play
   revisions, quest-scoped tray, resume state.
3. **Song v3** — the musical input and output.

Quests reuse the v3 container for starter material, phase snapshots, drafts, completed music and
ordinary sharing; they do not turn a song into executable quest content. QuestDefinition and
QuestRun **parallel** v3 rather than embedding into it. A future shareable quest bundle may carry a
definition plus an optional v3 starter song, but ordinary `#s=` and `#song=<id>` links must keep
working without understanding quests.

Quest and run IDs are stable slugs once shipped. A run records the definition version it used, so
later edits cannot silently change the rules of an in-progress activity.

**Verification:** Node tests round-trip all three objects independently, preserve A/B snapshots
pitch-identically, reopen a draft, and prove quest loading and completion do not change normal v3
behaviour.

### Q9. What must be built now, and what may wait

**Now:** versioned QuestDefinition schema; pure validator and evaluator; stable analyzer and
descriptor registries; declarative route and phase support; QuestRun persistence through the
existing `Store` seam (`index.html:5560`); JSON export/import tests even without an import UI;
bounded whitelisted primitives; a generic quest renderer that knows no individual quest IDs;
official quests authored only through that schema.

**Deferred:** the player-facing design area; custom player prose and uploaded assets; cloud storage
or discovery for definitions; galleries, comments, rankings, search; moderation and takedown
tooling; arbitrary scripts, custom detectors, branching dialogue; live collaboration.

**Reason:** Authorability requires a clean data boundary now, not a premature authoring surface. A
Questmaker over the first five or six primitives would produce near-identical crossings and waste
the feature's first impression.

**Verification — the authorability acceptance test:** an engineer must be able to create a second
working Guided Commission by adding **only declarative data and no engine branch**.

---

## 5. Cross-package tools

### Q10. Quests use an isolated Quest Tray

The per-package toolbox invariant (`AGENTS.md`) remains absolute:
`progress.packages[packageId].toolbox` belongs only to that package; entering, editing, finishing,
abandoning or replaying a quest must never merge, move or mutate those bags; no global progression
toolbox may be reintroduced.

A quest receives tools through a declarative, quest-scoped **Quest Tray**. Its definition lists
tool-grant primitive IDs and the completed capability authorizing each; the runtime creates fresh
quest-local stamp instances. A later quest might grant a stable-tower stamp after `standing-towers`
and a tense-pair stamp after `twin-blooms-plus` — quest-local instances, never objects removed from
or written into either package bag.

The tray belongs to the QuestRun so it survives resume, and is discarded with the run or archived
inside its completed state. A future "bring one of my tools" mechanic may **copy** a selected tool
into the tray; copying must never establish shared mutable inventory.

The first quest needs no crafted stamps but must use this workspace scope, so later cross-package
quests need no architectural rewrite.

**Reason:** The shipped toolbox is an owner-keyed scope (`toolboxOwner`, `loadScopeToolbox` at
`index.html:5577`), not a technical wall — Studio already proves a non-package scope exists. A quest
becomes another scope key.

**Verification:** Fresh-VM tests snapshot two package bags, open and mutate a quest tray, finish and
abandon runs, and assert both package bags remain structurally identical. Use `assert.deepEqual`,
not `deepStrictEqual`, for objects crossing the VM realm (see `tests/README.md`).

---

## 6. Studio, progress and session shape

### Q11. Quests share the editor but remain a distinct play mode

A quest opens the Studio editor under a quest shell containing: one current phase intention; an
optional "ways this could work" affordance rather than a checklist; a phase counter; descriptive
observations after playback; visible save/resume state; and **Leave for now**, compare, continue and
final-offering actions as appropriate.

It must reuse the Studio's musical document, playback, mixer, undo behaviour and v3 save/share seam.
It must **not fork a second composition editor.**

Leaving preserves the complete QuestRun — phase, A/B snapshots, selected version, tray. Completing
produces a normal named v3 song and records quest completion separately. Replay creates a new run
and never overwrites an earlier song without explicit player action.

**Verification:** Node tests cover run persistence, snapshots and song round-trip. Browser tests
cover Home entry, phase rendering, A/B playback, leave/resume, undo, completion, saving, sharing,
and returning to ordinary Studio with no leaked quest UI, state or tray contents.

### Q12. Quests are optional and calmly finite

Quests never gate packages, palettes, instruments, essential controls or capability progression.
They may appear once prerequisites are complete; declining or abandoning carries no penalty.

The first quest targets 10–15 minutes through three meaningful phases (compose; transform; compare,
choose and offer) and displays a friendly estimate such as "about 10 minutes". No countdown, minimum
elapsed-time gate, streak, expiry, distressed-companion reminder or daily multiplier.

A complete QuestRun is saved after meaningful edits through existing autosave and `Store`. A child on
a shared device must be able to stop **after any phase**, return Home, and resume the same drafts and
state.

**Q4's playtest gate is authoritative:** if normal first completions take three minutes, the quest
has failed even if the UI calls it ten.

**Verification:** Browser testing includes leaving during every phase, reloading and resuming. Tests
use a fake Store to verify serialized run state. No completion test depends on wall-clock time.

### Q13. The first payoff is the composition, not another collection track

Finishing gives the chosen song, a name/save moment, a short world reaction describing what was
heard, and a completion record for replay and resume. **Matched and unmatched offerings receive the
same payoff.**

No generic currency, XP, loot rarity, badge inventory or collectible catalog. Famous-song reveals
remain package payoffs and are not duplicated as quest currency.

**Reason:** Tune Garden already has power cards, instruments, companion stages, package completion,
famous pieces and tool inventories. Another acquisition track would dilute those and shift
motivation away from creation.

---

## 7. Tone, presentation and content integrity

### Q14. Layer the presentation without duplicating the task

Each phase has one brief child-forward world sentence; one concise creator-facing statement of the
same musical intention; optional examples of alternative approaches, never a task checklist;
read-aloud behaviour consistent with existing narration; and theory terminology only in the existing
optional/layered tier. The two surfaces must describe the same task, never alternating between
patronizing fantasy and curriculum jargon.

Any new `intro:` or credit narration requires `node tools/gen-voice.mjs --dry`, then a real
regeneration when the implementation is intended to ship. `--force` remains prohibited without
explicit owner instruction.

**Verification:** Browser review at child-readable viewport sizes, read-aloud testing, voice-asset
checks. Rendering and narration cannot be accepted through the VM harness.

### Q22. Quests must not clutter the map *(Amendment A3)*

The continent Home screen already carries regions, package territories, lock states, companions,
Studio and progress. Quest presentation is therefore bounded:

1. **At most one quest is surfaced at a time** on the Home map, regardless of how many are eligible.
   Additional eligible quests are reachable but not simultaneously advertised.
2. A quest entry point must **not** use a generic attention marker (exclamation point, badge count,
   pulsing dot) replicated across territories.
3. A quest must never obscure or displace the map's existing functional job: answering *"what can I
   play next?"*
4. Eligible-but-unplayed quests must not nag — no recurring reminder, companion distress, or
   escalating prominence over time.
5. An in-progress QuestRun may show a single quiet "continue" affordance, since resuming is the one
   case where the player has already opted in.

**Reason:** GPT's own failure-mode analysis named *"the quest board becomes map clutter"* and
*"companions nag"*, and neither draft bounded presentation. The hidden-curriculum principle
(`REQUIREMENTS.md` §4) fails if the map turns into visible task management.

**Verification:** Browser inspection with several quests simultaneously eligible, at desktop and
narrow widths, confirming a single surfaced entry point and no generic markers.

---

## 8. Ordered quest-kind sequence

Each later kind reuses the same definition, evaluator, run, tray, phase and song seams. "Newly
opens" means a newly supported coordinate value, not a reskin.

| # | Kind | Newly opens | Principal engine work |
|---|---|---|---|
| 1 | **Guided Commission** | initial value on all seven | schema, disjunctive routes, analyzer registry, evaluator, phases + snapshots, QuestRun, Quest Tray, Studio shell, resume, completion, v3 handoff |
| 2 | **Open Offering** | completion contract → descriptive / self-declared | definitions with no target routes; only a nonempty artifact, full playback since last edit, and the offering action |
| 3 | **Remembered Restoration** | primary payoff → world change | whitelisted world-effect primitives, persistent map variants, replay/history separation |
| 4 | **Regional Finale** | scope → regional finale | regional eligibility, larger completion presentation, map choreography, companion-evolution integration |
| 5 | **Living Commission Board** | progression role → repeatable endgame | capability filtering, recent-history avoidance, difficulty bands, calm availability |
| 6 | **Generated Commission** | content model → generated combination | compatibility graph, feasibility checks, route composition, language templates, deterministic seeds, property tests |
| 7 | **Personal Questmaker** | content model → human-authored definition | private design area, primitive picker, route builder, compatibility guidance, preview/test, local library, safe text limits, export/import |
| 8 | **Shared Quest** | progression role → social · payoff → social response | bundles, ownership, unlisted links, remix ancestry, permissions, abuse limits, reports, takedown, child-safety review |
| 9 | **Contextual Style Journey** | content model → bespoke episode · payoff → physics preset | preset registry, contextual examples, provenance fields, episode sequencing, content review |

**Why Questmaker is 7th, not 3rd.** Authoring is only interesting over a rich vocabulary. Kinds 1–6
must first supply structural *and* descriptor-only completion contracts; composition, transformation
and comparison phases; a broader analyzer and strategy vocabulary; world-effect primitives; regional
and repeatable eligibility; and compatibility metadata proven by generation. Those make authorship
capable of producing meaningfully different quests rather than variations of *The Firefly Crossing*.
**The declarative architecture still begins at Kind 1** — only the surface waits.

**Why a regional finale is not first.** Its cost is persistent consequence and regional closure, not
detector reuse. Without those it is only a capstone with a larger label.

**Why styles and eras are last.** A scale, groove, instrument and visual skin can model musical
parameters but cannot represent a culture or historical period. The apparent technical cheapness *is*
the cultural-flattening hazard; research, specificity, attribution and consultation are release
gates, not polish.

**Deliberately never scheduled:** package-wrapper quests, mandatory certification, generic
collectible payoff, arbitrary custom code, a separate quest composition editor. Community-wide world
systems and branching companion dialogue remain beyond Kind 9 pending evidence their operating and
narrative costs are justified.

---

## 9. Disagreements resolved

| Question | Claude | GPT | Resolution |
|---|---|---|---|
| Highest-value purpose | sandbox on-ramp | transfer across capabilities | **Split** — on-ramp is the player-facing purpose; transfer is its required *design* result, not a per-player certification gate |
| Cheap first shape | region capstone, buildable now | "a narrative wrapper whose real cost is semantic" | **GPT** — deferred to Kind 4 |
| Collection as a purpose | include it | dilutes an already-crowded reward system | **GPT** — rejected (Q13) |
| Styles/eras | cheapest route to two unbuilt pillars | the cheapness is the hazard | **GPT** — deferred to Kind 9 with contextual review |
| Parent stopping points | required | absent from its list | **Claude** — accepted (Q12) |
| Toolbox invariant | a scope key, not a wall | a structural blocker | **Claude** — confirmed against source; Q10 built on the scope-key reading |
| First quest length | 3 min, not 10–15 | — | **Claude** — Q4 rebuilt as three phases with a playtest gate |
| Anti-checklist enforcement | must be schema-level | content-tuning note | **Claude** — Q5 rules 1–7 |
| Gated first offering | wrong at the emotional peak | completion requires all ingredients | **Claude** — Q6 "offer anyway" |
| Questmaker position | too early at Kind 3 | Kind 3 | **Claude** — moved to Kind 7 |

---

## 10. Verification

### Q19. Every quest change passes all applicable layers

1. **Syntax** — after every `index.html` edit:
   ```bash
   node -e "new Function(require('fs').readFileSync('index.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1]); console.log('syntax OK')"
   ```
2. **Pure logic** — `node --test "tests/*.test.mjs"`. Schema validation, route normalization,
   evidence extraction, analyzer dispatch, evaluation, eligibility, snapshot comparison, tool
   isolation, run serialization, completion state and v3 round-trips must be top-level pure
   functions reachable by the `node:vm` harness. Tests must not assert rendering or audio.
3. **Real browser** — `?dev` to exercise eligibility, entry, phases, layout, editing, A/B playback,
   narration, save/resume, matched *and* unmatched offerings, completion, replay, cleanup. Audio
   acceptance requires listening; rendering acceptance requires visual inspection at desktop and
   narrow widths.
4. **`file://`** — open `index.html` directly whenever quest work touches asset loading, definition
   loading or narration. Local quest data must not use `fetch()` or XHR.
5. **Content playtest** — complete each official quest with at least three materially different
   artifacts including different routes and an unmatched offer; challenge with trivial and
   adversarial inputs. Q4's novice median gate applies to the first quest.
6. **Narration** — if quest copy changes narrated text, dry-run then regenerate affected clips
   before shipping.

### Q21. Documentation and vestigial code corrected with the implementation

- `PACKAGES.md` — rename all 28 bold hook labels and the template label to `World hook`.
- `DESIGN.md` — record vocabulary, first coordinate, ordered kinds and the Quest Tray; **remove the
  stale claim at line 300 that `progress.toolbox` is global**, which contradicts line 205.
- `README.md` — treat `PACKAGES.md` as current, list `two-kinds-of-walking` as built, reconcile the
  count as the intro plus the 19 `BUILT ✅` entries, and drop the stale "no test suite yet" claim.
- `SAVE-SHARE.md` — state that quests reuse v3 for musical payloads while QuestDefinition and
  QuestRun remain parallel containers.
- `AGENTS.md` § Where to find things — add a pointer to this file.

**Dead code.** Remove the root `toolbox:[]` property from **both** progress-default literals:
`index.html:5563` and the `?reset` path at `index.html:6130`. Nothing reads it; live tools are at
`progress.packages[id].toolbox`. Therefore: no progress-version bump or data transformation; loading
an old profile deletes the dead root property from the in-memory object; the next normal save drops
it from storage and cloud state; cleanup must not force a cloud write merely to remove it; all
per-package toolboxes remain untouched.

**Verification:** Load a legacy progress fixture containing both root and per-package toolboxes;
assert the next serialized object omits the root property and preserves every per-package tool. The
Q2 searches must pass, and repository searches must confirm the count, test-suite, build-status and
toolbox contradictions are gone.

---

## 11. Non-goals for the first implementation

Package-local activities relabeled as quests · mandatory quests or certification gates · hard gating
on suggested routes · emotional or aesthetic pass/fail grading · flat detector checklists · scores,
stars, leaderboards, XP, currencies or loot · branching dialogue or bespoke quest JavaScript ·
durations, sections, multi-voice, dynamics or chromatic editing · generated quests · the
player-facing Questmaker · style or era simulation · Jukebox remixing · public sharing, galleries,
comments or collaboration · new runtime asset folders · changes to `FAMOUS` melodies · a second
composition editor.

---

## 12. Decision record

All thirteen decisions below were made by the owner (2026-09-05 / 2026-09-06). None are open.

| # | Decision | Outcome |
|---|---|---|
| 1 | Reserve "quest" for the cross-package mode; rename 28 hooks `World hook:` | Approved |
| 2 | Guided Commission as first coordinate; *The Firefly Crossing* as first slice | Approved — **must genuinely occupy 10–15 min** |
| 3 | Objective ingredients + ungraded interpretation as completion contract | Approved — **avoid checklists** |
| 4 | Isolated Quest Tray, never merging package bags | Approved |
| 5 | Parallel QuestDefinition/QuestRun, v3 for musical payloads only | Approved |
| 6 | Build schema, validator and generic renderer now; Questmaker UI deferred | Approved |
| 7 | Songs — not collection or unlocks — as the first payoff | Approved |
| 8 | Ordered sequence | Approved **with Questmaker deferred** to Kind 7 |
| 9 | Calm 10–15 min: autosave, exact resume, no timer, no expiry | Approved |
| 10 | Three-phase *Firefly Crossing* (compose → transform → compare) | Approved with A1, A2 |
| 11 | "Offer anyway" with identical payoff | Approved |
| 12 | Schema-level anti-checklist rules | Approved |
| 13 | Opportunistic removal of legacy root `progress.toolbox` | Approved |
