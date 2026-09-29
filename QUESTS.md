# Tune Garden — Quests

*Requirements for the quest play mode. Last updated: 2026-09-07.*

> **Kind 1 ships, in two quests. Kinds 2–9 are still intent.** *The Firefly Crossing* and *The
> Waking Woods* are playable from the world map: the sealed catalog, the analyzer and descriptor
> registries, the semantic validator, the evaluator, the QuestRun, the phase controller, the shell
> and the Home card all exist in the game's `js/` files (`js/completion.js` and `js/quest-*.js`; the
> map is `README.md` § How the game's code is organized). Everything below about the later kinds states intent,
> the way `EDITOR-DESIGN.md` does; `README.md` § Current status remains the record of what ships.
>
> The engine was built in six steps (D1–D6) against this document, each one design-reviewed,
> mutation-tested and browser-verified — `REVIEW-LOG.md` records what each round found, including
> the four rounds where the independent reviewer found a defect the tests had not. A seventh step
> (D7) answered the whole-slice design review: it closed the ids a definition could invent, and
> wrote the second commission that Q9's acceptance test asks for.

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

### Amendments applied after the first playtest (2026-09-20)

The owner played the built quest on 2026-09-19. Three amendments follow from it, each marked inline.
None reverses a decision; each narrows one that turned out to permit something nobody wanted.

- **A4 — "Nonempty" was not a composition.** One seed and no drums completed the quest. Phases 1 and 2
  now require the dealt landmark task to be engaged; the final offer keeps Q6 unchanged (§3, Q6).
- **A5 — The exit is visible, the control is not specified.** A *Leave for now* button beside the
  phase's own button read as a consequential choice. The requirement is now that the shell make the way
  out and the saved state plain, not that it carry a particular button (§6, Q11).
- **A6 — The playtest gate's first result, recorded.** Under thirty seconds against a 10–15 minute band,
  and the landmark commission that answers it is written down as a **hypothesis** the five-novice median
  still has to settle (§2, Q4).

### Amendments applied after the second playtest (2026-09-21)

- **A7 — The shell stops reporting whether a route matched.** A4's confirmation fork was built as
  specified and playtested badly: it hijacked the button the player pressed, and told a child who had
  revised *more* than asked that nothing came out. Removed; the friends' descriptions are the whole
  response (§3, Q6).
- **A8 — Phase 2 accepts changing both levers.** Its two routes were "new shape, same beat" and "same
  shape, new beat", so changing both matched neither. A third route makes the larger revision a
  recognised way across (§2, Q4's phase 2).

### Amendment applied after replaying the quest (2026-09-23)

- **A9 — The drums get an opening to develop.** A short authored drum fragment is dealt per run, to be
  kept and carried on. Recorded as option 1 of a two-arm playtest comparison, with the protocol that
  makes the comparison interpretable (§2, Q4). Q6's readiness is **restated whole** in one box rather
  than amended a fourth time (§3, Q6).

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

**Amendment A8 (2026-09-21).** A third route: **change both.** As first written the two routes each
asked the player to move exactly one lever, so a child who changed the shape *and* the heartbeat matched
neither — doing more counted as doing less, which the first playtest of the finished quest ran straight
into. Isolating one variable is still the clearer lesson and is still what the phase suggests; it is no
longer the only thing the garden can recognise.

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
per-phase intro, phase counter, generic advancement (`curStage()` in `js/play-scope.js`; the counter
in `renderStage()` and advancement in `stageComplete()`, both `js/level-engine.js`). They must not be Firefly-specific screen
branches. Unlike package `goals[]`, quest phases consume declarative challenge routes and preserve
version snapshots in the QuestRun.

**Amendment A1 — session budget.** Phases sum to **10–15 minutes**, matching the gate below.
Draft 2's estimates summed to 8–13, undershooting their own acceptance band.

**Acceptance gate.** Across at least five target-age or genuine-novice playtests, the median first
completion must fall between 10 and 15 minutes. If it does not, **the content must be revised — it
must not be padded** with waiting, extra detector clauses or forced repetition.

**Amendment A6 — the first playtest, and what has been done about it.** The owner played the quest on
2026-09-19 and finished it in **under thirty seconds**, with one seed and no drums. The gate above was
not merely missed; nothing in the build asked for a composition at all.

What ships in answer is the **landmark commission**: the run is dealt three stepping stones, spaced
apart and away from the edges, and the task is to keep them and travel between them — something of the
player's own before the first, between each pair, and after the last, over a beat. The stones are
generated per run, so the problem is not the same twice.

**This is a hypothesis, not a fix.** It is the reviewer's own standard and it is adopted verbatim:

> Also observe whether time is spent listening and revising, or locating missing regions and satisfying
> buttons. Ten minutes of the latter would miss the product goal.

The five-novice median still decides. A completion that takes ten minutes of hunting for an empty
stretch has failed this gate exactly as a thirty-second one did, and the remedy would again be content,
not padding.

**Amendment A9 — the drums get an opening, as one arm of a comparison (2026-09-23).** After replaying
the landmark quest several times the owner found the melody half well challenged and the drum half not:
the melody is dealt stones to connect, the drums only had to be non-empty. Two remedies were considered
and one was withdrawn on review — dealing snare presets with three drum regions to fill measured
*coverage*, not rhythm. What ships instead is **an opening drum fragment**: two or three hits in the first
two beats, dealt per run from a small authored pool, ringed like the stones, to be kept and carried on in
the player's own way. The owner's condition: *"careful to make it short, so that there is still many
different ways to extend it, rather than the only way is to repeat it."*

It is **option 1 of 2**. Option 2 — two dealt hits that always fall on a main beat — is to be compared
against it by playtest, and for that comparison to mean anything the two arms must share everything
else: the same continuation rule (keep what was dealt; something of your own after it), the same
descriptive feedback, width, tempo and phase wording; order balanced between players; the dealt fragment
recorded (the run stores it). Compare **listening, revision, unwanted repetition, refused endings and how
different the offered songs are** — not completion time alone. A shorter quest that children listen to
and revise is better evidence than a longer one produced by refusals.

*Settled 2026-09-26, by the owner: option 1 stays, and option 2 is not built.* The owner played the
opening in both quests over three rounds and was satisfied with it. They closed the comparison rather
than run the second arm. So the protocol above was **not** carried out, and nothing here claims that
option 1 beat option 2 under it. It is recorded in case the question reopens, for example if children in
a wider playtest turn out to repeat the opening instead of developing it.

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

> **The current contract, stated once (2026-09-23).** This section was amended four times in four days
> (A4, A5, A7 and now the drum opening). The amendments below are kept as the record of *why*; this box
> is what the engine implements, and it replaces reading them together.
>
> **Phases 1 and 2** move on when all of these hold, and only these: the **dealt task** is engaged — every
> landmark kept, every stretch between and around them holding a note of the player's own, and, where an
> opening drum fragment was dealt, that opening kept and the beat carried on past it (with no opening, the
> drum bed simply must not be empty); the version has been **played completely since its latest edit**;
> and, in phase 2, **a musical edit has been made since the fork**. Whether a suggested route matched
> **neither gates progress nor produces an approval or failure notice** — the friends describe what they
> heard, and that is the whole response.
>
> **Phase 3** permits final edits with **no** dealt-task readiness — the opening and the stones may be
> removed. It offers when both current versions have been heard at their current revisions and one is
> held, and the offer saves the audible chosen song with an **identical payoff** whatever it matched.
>
> An edit that failed to reach the store is a separate blocker in every phase, and a button's
> availability is read from the same authority as the transition it triggers.

Once a nonempty composition has been played completely since its latest edit, **Offer this
crossing** is available **even if no suggested route matched**. The response stays descriptive:

> The lights made a path, but the roots did not catch a steady heartbeat. You can shape it again,
> or offer this crossing as yours.

Offering anyway completes the quest, saves the same artifact, and gives the **same payoff** — no
reduced score, badge or failure mark. The completion record may keep neutral observations for
resume and world-response purposes but must not label the result deficient.

Phases 1 and 2 follow the same principle. Phase 2 additionally requires at least one musical edit
after version A is copied — proving a revision occurred without dictating what it must mean.

**Amendment A4 — what "nonempty" means in phases 1 and 2.** The first playtest (2026-09-19) completed
the whole quest in under thirty seconds with one note and no drums, because "nonempty" is satisfied by
a single seed. Phases 1 and 2 now require the **dealt task** to be engaged instead: every landmark the
run was dealt still present, every stretch between and around them carrying something of the player's,
and a beat under the path. That is a statement about the commission, not a grade — one sentence saying
what the crossing is still missing, never a tally, and the field itself shows where.

**The offer keeps Q6 exactly as written.** Readiness gates leaving phases 1 and 2 and nothing else:
the final offer asks for a playthrough and an audible song, as it always has.

**Amendment A7 — the response is descriptive, and only descriptive (2026-09-21).** A4 first built this
section's "you can shape it again, or offer this crossing as yours" as a literal fork: when readiness was
met and no route matched, the button asked once before advancing. Playtested, it was worse than the
problem. Pressing a button labelled *Compare both paths* produced two different buttons, and the sentence
above them announced that none of the suggested ways came out — read by the owner as a failure notice for
a revision that had changed **both** the shape and the beat, which is more than either route asked for.

**A matched route is no longer reported to the shell at all.** The friends describe what they heard
either way, the button does what its label says, and "ways this could work" stays an optional aid read
before you start rather than a score read afterwards. This is Q5's anti-checklist rule and Q6's
descriptive response arriving at the same place: the engine still evaluates routes, and nothing in the
interface ever tells a child their music did not count.

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

The engine owns a whitelist of stable primitives — `phrase.minimum-onsets`, `contour.any-of`,
`contour.differs-from-snapshot`, `pulse.kick-on-main-beats`, `pulse.even-walk`,
`playback.complete-since-last-edit`, `comparison.auditioned-both`. Each declares a player-facing name,
explanation, parameter bounds, capability tags, compatibility rules and strategy family. A future
authoring UI exposes this same vocabulary.

The IDs above are all-lowercase because that is what the grammar admits (`QUEST_PRIMITIVE_ID`). This
paragraph, and the design document it came from, both first wrote them in camelCase — and the shipped
validator rejected its own example. They live in ONE id space with musical analyzers and procedural
gates distinguished by a `kind` field, which is what lets rule 6 below be a check that can fail rather
than one that is true by accident.

**Reason:** Bespoke JavaScript per quest is a dead end for player authoring — shipped levels are
**247 `chk:` closures** invoked by `checkLevel()`, and an authoring UI cannot emit JS. The first
implementation must establish the safe vocabulary and execution boundary even though no design area
ships yet. Note every package already carries `version:1, author:"official"` and **nothing reads
either field**; quest `author` and `v` must actually participate in validation and loading.

Two things this needed that the first implementation did not have. **Every id must resolve.** Controls,
tool grants, transitions, the completion action, the payoff and the presentation tokens were accepted as
free slugs and looked up nowhere, so a definition inventing all of them published cleanly, opened,
withheld the drums its own routes needed and dead-ended on its first button — official content passing
only because a human wrote the right words is a quieter form of privileged trust. Each now names an
entry in a closed engine registry, an analyzer declares the controls it reads, and a quest may claim
only a capability its own prerequisites teach. **The source decides who is official.** `author.kind` is
self-asserted, so `loadQuestCatalog(json, sourceKind)` takes the context it arrived on and refuses a
definition that disagrees; the built-in catalog goes through the same check a player import would.

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
existing `Store` seam (`js/persistence.js`); JSON export/import tests even without an import UI;
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

**Result (2026-09-07):** passed, by ***The Waking Woods*** — a second land (Pulse Woods), other
prerequisites (`intro` + `footsteps`), a workspace that grants no loop, and routes carried by the pulse analyzers instead of the
contour ones. It needed no engine change. Two things the attempt exposed, and neither is fixed here:
a `way-` descriptor cannot express the PARAMETERS of the analyzer it describes (`contour.any-of` reads
"a Rise, Fall, Hover, or Arc path" whichever families it was given), so a commission that varies a
parameter would tell a child something untrue — the second quest therefore varies analyzers, not
parameters; and the descriptor vocabulary is small enough that its two transform routes divide on the
beat alone. Parameterised way-descriptors are the next vocabulary step.

**Since (2026-09-23, before its first playtest):** the loop difference is gone. *The Waking Woods* now
grants `loop` like the first quest. That grant was never access to looping; the ↻ button is always
there. It only means looping is on from the first bar. The Firefly playtests all ran with it on, and a
drum opening to carry on is heard best going round. The acceptance test keeps its proof with a
synthetic definition that grants no loop, not with the shipped data.

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

**Reason:** The shipped toolbox is an owner-keyed scope (`toolboxOwner` in `js/palettes.js`,
`loadScopeToolbox` in `js/persistence.js`), not a technical wall — Studio already proves a non-package scope exists. A quest
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

**Amendment A5 — the exit is visible; the control is not specified.** The shell must make two things
plain at all times: that the player may stop whenever they like, and whether their work is saved. It
must **not** be required to do that with a button. A *Leave for now* button was built and playtested,
and the owner's finding was that it reads as a decision with consequences beside the phase's own
button — "it is not clear what choosing 'Keep this path' vs 'Leave for now' would do". The shell says it
in words instead. The saved state is **read from the store**, not asserted: it must be able to say that
a write did not land.

*Refined 2026-09-22, after the third playtest.* The line first named the route as well — "the world map
is under the ☰ menu" — because that button is hidden behind the toggle. On screen every render, beside
the phase's own instruction, it was the longest thing on the line, and the owner asked for it back:
*"the player already knows it, and it makes the line too long."* What this requirement asks for is that
the player can see **that stopping is free and their work is safe**. Naming the route is one way to meet
that and not the only one; it is no longer required.

**Amendment A10 — the task line is literal (2026-09-23).** The Firefly's third playtest found that its
instructions never said the notes had to reach the stones. Before its first playtest, *The Waking Woods*
turned out to use "walk" for the melody, the drums and the whole song, and "footsteps" for both the
melody and the drum opening. So the shell's text has two tiers:

- **Task tier** — a phase's intention, the missing sentences, the editable line and the ways — is
  literal. The melody is **notes** or a **tune**, the drums are the **beat** or **drum hits**, and the
  dealt melody is the **ringed stones**. It keeps the names the prerequisites teach (A2), even when they
  sound like story: `footsteps` teaches the eight-kick pattern as a **walk**, so "an even kick walk"
  stays.
- **Story tier** — world text, and a friend's heard lines — may use the quest's own words, provided the
  subject is explicit ("The drum walked evenly…").

The engine's own sentences are shown in every quest, so they use no quest's nouns at all: not path,
crossing or walk, and not the quest's own name for offering. A test holds them to that.

**Amendment A11 — a task line names a musical idea (2026-09-26).** Played for the first time, *The
Waking Woods* read as "anything". Its melody clause, "enough notes to make a phrase", was already
guaranteed by readiness, and nothing ever said anything about the tune, so the owner had to open the
ways and still could not tell what was wanted. So each half of a commission's music has to name **one
idea its prerequisites taught**: in its ways, and in something that answers the child when they play. The
melody half of Woods had neither. It is still an invitation. A7 and Q6 stand, and no route gates
anything. The Firefly names its shapes in the ways and in Flutter's voice, but not in its task line.
Three playtests have not found that to be a problem, so it stays as it is. It is recorded here as the
difference to watch.

For *The Waking Woods* the idea is **on the beat**, as `footsteps` teaches it: *"Plant seeds RIGHT ON
the glowing beat columns so your melody walks in time."* The owner chose it over the intro package's
ending on a home row, because it ties the tune to the drums, and that tie is what this quest is about.

- `phrase.on-every-beat` matches when every main beat of the song (every fourth column) has a melody
  onset. A stone on a beat counts. Notes between the beats neither help nor hurt: readiness asks for a
  note in every stretch, and some stretches contain no beat at all.
- The garden, not Hopper, describes it: "The tune landed on every beat", "on some of the beats", or
  "between the beats". This is placement, not a judgment of timing.
- The beat columns glow for the whole quest. The analyzer declares the guide, and the quest lights it
  on every phase whose routes name it.
- The idea is melody-making, which `intro` earns, but `footsteps` teaches it. So a definition whose
  prerequisites never taught it may not name it (`analyzer-not-taught`). A capability says what is
  being observed; this says which lesson made the idea the child's own.
- It carries its own proof of reachability. The engine's completing song, plus a note on each empty
  beat, is held to the workspace and to readiness, and then the real analyzer is run on it.

`phrase.minimum-onsets` stays in the registry for quests with no dealt task, where it can fail. No
official quest uses it any more.

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

1. **Syntax** — after every edit to the game's scripts:
   ```bash
   node tools/check-syntax.mjs
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
the `progress` default (now in `js/persistence.js`) and the `?reset` path (now in `js/boot.js`). Nothing reads it; live tools are at
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

All thirteen decisions below were made by the owner (2026-09-05 / 2026-09-06). None are open. Two —
**#2** and **#11** — were **refined** on 2026-09-20 after the first playtest; the refinements narrow what
they permit and are recorded in the rows themselves. Neither is reversed.

| # | Decision | Outcome |
|---|---|---|
| 1 | Reserve "quest" for the cross-package mode; rename 28 hooks `World hook:` | Approved |
| 2 | Guided Commission as first coordinate; *The Firefly Crossing* as first slice | Approved — **must genuinely occupy 10–15 min**; refined 2026-09-20 (**A4/A6**): the first playtest took under 30 s, so the quest now deals a landmark commission. The band is unchanged and unmet — it is a hypothesis awaiting the five-novice median |
| 3 | Objective ingredients + ungraded interpretation as completion contract | Approved — **avoid checklists** |
| 4 | Isolated Quest Tray, never merging package bags | Approved |
| 5 | Parallel QuestDefinition/QuestRun, v3 for musical payloads only | Approved |
| 6 | Build schema, validator and generic renderer now; Questmaker UI deferred | Approved |
| 7 | Songs — not collection or unlocks — as the first payoff | Approved |
| 8 | Ordered sequence | Approved **with Questmaker deferred** to Kind 7 |
| 9 | Calm 10–15 min: autosave, exact resume, no timer, no expiry | Approved |
| 10 | Three-phase *Firefly Crossing* (compose → transform → compare) | Approved with A1, A2 |
| 11 | "Offer anyway" with identical payoff | Approved; refined 2026-09-20/21 (**A4/A5/A7**): readiness gates leaving phases 1 and 2 only, never the offer, and the shell never reports whether a route matched — the fork that asked "shape it more or keep it anyway" was built, playtested and removed as worse than silence. The payoff is still identical |
| 12 | Schema-level anti-checklist rules | Approved |
| 13 | Opportunistic removal of legacy root `progress.toolbox` | Approved |
