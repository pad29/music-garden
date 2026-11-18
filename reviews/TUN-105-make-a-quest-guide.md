# TUN-105 — Write a "make a quest" guide for contributors

Branch `ao/tun-105/root` · Size **M** (label and `## Size` agree) · not `needs-owner`

## Plan (Claude)

**What a contributor faces today.** A quest is one entry in `BUILTIN_QUEST_CATALOG_JSON`, the last line
of `js/quest-engine.js`: a single JS string literal holding the whole catalog as JSON with every quote
escaped. Nothing extracts it, re-encodes it, or prints the validator's errors; one bad definition
empties the *whole* registry (`loadQuestCatalog` is all-or-nothing), so in the browser a mistake looks
like "both quests vanished". The validator is three layers: the grammar (`QT` specs in
`js/quest-catalog.js`), `questCrossRefs`, then `questSemantics` (registries, Q5's route rules, and the
witness songs run through the real analyzers).

### Deliverables

1. **`MAKING-QUESTS.md`** (repo root, beside `QUESTS.md`). Sections, in the ticket's order:
   1. *What a quest is and is not* — one paragraph, links to `QUESTS.md` Q1, Q3, Q7, Q8.
   2. *The definition, field by field* — *The Waking Woods* as the worked example: the definition
      as JSON with each witness's `songs` elided, then a table per block (`brief`, `prerequisites`,
      `workspace`, `setup`, `phases[]`, `challenge`/`routes`/`observations`, `procedure`,
      `reflection`, `completion`, `presentation`, `cast`, `witnesses`) giving each field's type and
      bound (text lengths, int ranges, array sizes — from the `QT` specs) and what it does in play.
      Schema versions: new quests use `v: 3`; one line on what 1 and 2 were. `author.kind` must be
      `official` (the built-in catalog is loaded as official).
   3. *The closed lists* — every registry an id resolves against, its current entries and its file:
      capabilities (+ which package earns each), musical analyzers (phase types, required controls,
      `taughtByPackageIds`, allowed `way-` descriptor, params), procedural gates, `way-` descriptors
      and their text, controls, tools (empty — so `toolGrants` must be `[]`), transitions (+ the
      phase type each ends), completion actions, payoffs, themes, grooves, setup kinds (+ the
      `waypoints` bounds), regions with a friend (for `cast`) and all map regions (for
      `presentation.regionId`). Packages and palettes: where to look, not a copy. Adding to a
      registry is engine work — out of scope for a data-only quest, and said so.
   4. *Witnesses* — what they prove (each route satisfiable, and distinguishable from every other
      route by at least one witness), that they are v3 songs (`SAVE-SHARE.md`), the workspace
      equivalence they are held to (`questWorkspaceMismatch`: palette, columns, groove, pitches on
      the ladder, no long notes without `grow`, no drums without `drums`), and how to get one.
   5. *Checking it* — the tool (below), what the common error codes mean, and the tests to run
      (the whole suite; the quest files by name).
   6. *Trying it in a browser* — `ao preview`/`http-server`, `?dev`, 🗝️ Unlock quests, 🧹 Clear quest
      runs, where the card appears (one quest surfaced at a time, by `presentation.priority`; the
      rest on the quest trail), and that an empty quest trail means the catalog failed to load.
   7. *What makes a good quest* — routes, not a checklist (Q5); offer anyway (Q6); calm and finite,
      10–15 minutes (Q12); no clutter on the map (Q22); the wording rule from Step G (task-tier
      lines literal and in the taught names, story-tier lines may use story words) and Q14's two
      surfaces; Q5's "describe, never judge".
   8. *What a contributor cannot do alone* — the owner playtests and judges the musical feel; a
      real quest is a `needs-owner` content ticket (open an issue first); text safety
      (`QUEST_TEXT_BANNED`, no markup, never `innerHTML` — the comment above `setStatusText` in
      `js/helpers.js`); quest ids are permanent slugs; **narration** — see *Correction* below.
2. **`tools/quest-catalog.mjs`** — zero-dependency, loads the game the way `gen-voice.mjs` does
   (`tests/helpers/game-scripts.mjs` / the test harness):
   - `extract <file>` writes the built-in catalog, pretty-printed, to a JSON file to edit;
   - `check <file>` loads that file through the real `loadQuestCatalog(…, "official")` and prints
     every error as `code  path  extra`, or a one-line summary per quest on success; exit 1 on errors;
   - `write <file>` runs `check`, and only on success re-encodes the catalog into the last line of
     `js/quest-engine.js` in the existing format (`JSON.stringify(JSON.stringify(cat, null, 1))`).
   No engine change.
3. **Pointers** — one line each, kept small for parallel merges: `AGENTS.md` § Where to find things,
   a `README.md` repository-map row, `QUESTS.md` (a pointer in § 4 beside Q7/Q9), `tests/README.md`
   if the tool or a test needs mentioning there. `CONTRIBUTING.md` **does not exist yet** — it is
   TUN-92, in Backlog. No stub (it would collide with TUN-92 and its open questions); a comment on
   TUN-92 asks it to link the guide.

### Tests

- `tests/quest-guide.test.mjs` — the drift guard. The guide's registry lists are compared with the
  registries' keys (and analyzer → descriptor / phase / control metadata); the worked example's JSON
  block equals the shipped *Waking Woods* with witness songs elided; every key in the `QT` shapes
  appears in a field table; the stated text/int/array bounds match the specs. Prose is not tested.
- `tests/quest-catalog-tool.test.mjs` — `extract` then `write` leaves `js/quest-engine.js`
  byte-identical (run against a temp copy, never the real file); `check` reports a known error with
  its code and path and exits 1; `write` refuses a failing catalog and leaves the file untouched.
- **The cold-reader trial** (the ticket's proof by use): GPT, read-only, with only the guide as
  briefing, writes a small throwaway quest; I run it through the tool and the **whole suite** with it
  added, then discard it. Every place it went wrong or had to look beyond the guide is recorded here
  and fixed in the guide. Known in advance: `tests/quest-fragments.test.mjs` asserts *exactly two*
  quests (three places) and that every shipped quest shares one fragment pool — a third valid quest
  fails it for reasons unrelated to its validity. Those assertions get loosened so they keep their
  guarantee (non-vacuous loop, the official quests present) without pinning the catalog's size;
  anything that must genuinely change per new quest is documented in the guide instead.

### Correction to the ticket (my call — listed for the owner to overrule)

The ticket says *"spoken lines need the owner's narration clips"* and *"changed narration text needs new
clips"*. For quests that is not so: `tools/gen-voice.mjs` bakes only `intro:"…"` and `credit:"…"`
strings, and `js/quest-run.js` (`questEnvelope`) says *"No baked clip exists for authored quest text"*
— a phase's world + intention text is read in the browser's own voice. The guide states that, and that
the owner decides how it sounds (including whether quest text should ever get baked clips — a separate
ticket). A contributor still cannot regenerate clips; the guide says so for package text.

### Risks

- The guide drifts from the engine → the drift-guard test.
- The tool's `write` corrupts the engine file → it re-checks first, round-trip test, and the suite's
  own catalog tests (`questcatalog.test.mjs` etc.) load the result.
- Parallel phase-2 tickets touch `README.md` / `AGENTS.md` → one-line edits, merge `origin/main`
  before the PR.

### Questions only the owner can answer

None blocking. Overrulable calls: the tool (vs. documented one-liners), the narration correction, no
`CONTRIBUTING.md` stub, the file name, and `author.id` for a contributor's quest (`tune-garden`, as
both shipped quests — the contributor is credited in the PR/commit, not the data).

## Design review (Astra)
<details><summary>GPT's design review of the plan, verbatim (ask.sh fresh read-only, gpt-6-astra, 2026-11-17)</summary>

1. **High — `write` can validate successfully and install an unloadable catalog.** The plan checks the input, then reformats it ([plan:54](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-40/reviews/TUN-105-make-a-quest-guide.md:54)). The loader limits the **decoded JSON string** to 262,144 characters, permits at most 32 definitions, and separately enforces depth/value limits ([quest-engine.js:1289](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-40/js/quest-engine.js:1289)). I reproduced this with 14 valid definitions: compact input **137,027 characters, accepted**; planned one-space formatting **263,400 characters, rejected as `source-too-large`**.  
   **Change:** validate both the supplied text and the exact canonical JSON that will be embedded, through `loadQuestCatalog(text, "official")`. Inspect `QUEST_CATALOG_ERRORS`; an empty returned registry is truthy. Never replace this with per-definition validation or direct registry assignment.

2. **High — the writer’s file-editing contract is underspecified.** The current double-`JSON.stringify` expression reproduces the catalog literal correctly, but this Windows checkout uses CRLF and ends with blank lines. The shared script reader normalizes CRLF ([game-scripts.mjs:89](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-40/tests/helpers/game-scripts.mjs:89)); writing its source back would alter unrelated bytes. “Replace the last line” is unsafe. A replacement-string implementation also interprets legal authored text such as `$&` or `$'`.  
   **Change:** read the raw engine file separately; require exactly one complete, recognized catalog declaration; replace only its literal using offsets or a replacement callback; preserve surrounding bytes and final newlines; compile and verify the candidate before atomic replacement. Refuse missing/duplicate anchors and input/output path collisions. Resolve validation and writing against the same checkout. Use a fresh harness—the generator scans scripts; it does **not** execute the game.  
   **Alternative:** keep the small helper rather than distribute fragile shell one-liners. If safe writing exceeds this ticket’s scope, ship `extract`/`check` and an explicit reviewed installation procedure.

3. **High — the third-quest test impact is substantially larger than the plan identifies.** With an in-memory, validator-accepted Woods clone named `a-review-probe`, priority 10, **10 tests failed across six inspected files; all 110 passed without it**:
   - `questcatalog.test.mjs`, **“the shipped catalog validates, loads and is deep-frozen”**, pins exactly two IDs ([line 25](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-40/tests/questcatalog.test.mjs:25)).
   - `questsetup.test.mjs`, **“shipped deals are repeatable, varied, versioned and valid across 512 seeds per quest”**, pins IDs, 16 columns, one geometry and six fragments ([line 132](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-40/tests/questsetup.test.mjs:132)).
   - The three identified fragment tests fail their count assertions.
   - `questhome.test.mjs` selects eligibility with `[0]`; the earlier-sorting ID breaks **“every prerequisite…”**, **“a package half-played…”**, **“a run already going…”**, and **“a quest already finished…”** ([line 40](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-40/tests/questhome.test.mjs:40)).
   - `questauthoring.test.mjs`, **“two quests share one surface…”**, pins the winning card and exact trail contents ([line 442](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-40/tests/questauthoring.test.mjs:442)).

   Other Home assertions become fragile when the third quest shares Firefly prerequisites: **“a run whose quest the build no longer ships…”** expects a one-entry trail, and **“a finished quest lives in the trail…”** expects no remaining invitation.  
   **Change:** distinguish fixed content fixtures from generic engine tests; select rows by quest ID. Add explicit fresh-quest priority ties and insertion-order independence—the existing Home tie test covers **runs**, not fresh invitations. I found no test directly exercising `devquestunlock`; test its real handler with an added definition.

4. **High — loosening fragment assertions can discard content guarantees, not merely remove an arbitrary count.** The draw test pins the actual shipped pool ([quest-fragments.test.mjs:129](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-40/tests/quest-fragments.test.mjs:129)). The playable-route test hardcodes six entries from a separate pool and proves **readiness plus the complete route conjunction** ([line 262](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-40/tests/quest-fragments.test.mjs:262)). Dropping pool equality while leaving that loop intact would test the wrong openings for a new quest. The exhaustive fragment test also assumes every tested definition declares clean main-beat kicks.

   **Change:** preserve the two existing quests’ reviewed pool expectations in explicit content tests. Generic tests should enumerate each applicable definition’s actual pool and routes, with non-vacuity assertions. Keep the independent conjunction proof; `fragment-blocks-route` checks drum observations individually and is not its replacement. Rerun the recorded fragment mutations, especially omitted openings, misbuilt pulse patterns, skipped observations and ordered snapshot pairs ([mutation definitions:101](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-40/tests/helpers/quest-fragment-mutations.mjs:101)).

5. **High — the guide’s hardest authoring step remains a promise: “how to get” witnesses.** Eliding every song and linking to the v3 format does not teach someone to construct evidence ([plan:19](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-40/reviews/TUN-105-make-a-quest-guide.md:19)). The validator executes the songs cited by each route, and requires an **A-without-B witness for every ordered route pair**; mere differences between JSON definitions are insufficient ([quest-engine.js:1118](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-40/js/quest-engine.js:1118)).

   **Change:** specify a reproducible capture/construction recipe, one complete compose witness and one complete transform A/B pair, plus a route-by-witness result table. Explain repairs separately:
   - `route-unsatisfiable`: none of that route’s cited witnesses matches.
   - `no-distinguishing-witness`: it matches, but the supplied evidence does not separate it from another route.
   - `witness-unreachable`: palette, projected width, groove, pitches, durations or drum grants disagree with the workspace.
   - `snapshot-not-source`: transform comparison must reference source **A**, with suitable A and B songs.
   - `route-implies-route`: redesign the alternatives; adding witnesses cannot repair mathematical containment.
   - `capability-not-earned` versus `analyzer-not-taught`: capability prerequisites and the package teaching a particular idea are separate requirements.

   Also explain that optional `witness.setup` is validated as an instance; catalog witness matching does **not** establish that its songs satisfy dealt-task readiness. Setup feasibility, runtime deal reachability and ready playable route examples are separate checks ([quest-engine.js:991](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-40/js/quest-engine.js:991)). Include the geometry constraints, the `room` prohibition, setup/starter-song exclusion, and an off-main-beat kick example that produces `fragment-blocks-route`.

6. **High — the narration correction is factually useful but cannot silently replace the ticket’s owner requirement.** The generator really does scan literal `intro:"…"` and `credit:"…"` strings ([gen-voice.mjs:74](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-40/tools/gen-voice.mjs:74)). Quest intros are assembled dynamically ([quest-run.js:342](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-40/js/quest-run.js:342)). All six current phase hashes lack clips. However, `narrate()` **always attempts the hashed MP3 first**, falling back on an error or rejected playback ([play-scope.js:135](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-40/js/play-scope.js:135)). This is not a quest-specific browser-voice policy.

   **Change:** document that implementation gap accurately while retaining owner responsibility for narration approval. Do not declare the ticket’s requirement unnecessary or deferred by reviewer fiat. Ordinary generation currently will not bake these lines; manually supplied quest clips would also be considered orphans by its pruning pass ([gen-voice.mjs:97](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-40/tools/gen-voice.mjs:97)). Record that unresolved discrepancy explicitly; do not add unrequested narration-engine work or recommend paid regeneration.

7. **Medium — browser troubleshooting and completion instructions need correction.** “An empty quest trail means the catalog failed to load” is false ([plan:40](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-40/reviews/TUN-105-make-a-quest-guide.md:40)): locked quests are filtered out ([quest-run.js:640](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-40/js/quest-run.js:640)). Priority only orders eligible, unplayed invitations; pending offerings and active runs take precedence, and fresh ties use quest ID ([line 594](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-40/js/quest-run.js:594)).

   **Change:** give a diagnostic sequence using catalog errors, prerequisite completion, saved runs/history and trail navigation. Explain that Unlock quests writes ordinary package completion records; Clear quest runs clears runs/history, not prerequisite progress ([boot.js:73](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-40/js/boot.js:73)). Include the current Q6 contract: engage the dealt task, finish playback after the last edit, edit B after the fork, then hear both current versions and offer. “Offer anyway” does not mean bypassing those requirements. Explain the always-available loop button versus the `loop` default grant.

8. **Medium — the wording guidance omits the lesson that actually changed Woods.** The plan names Step G but not Step H/A11. Literal wording alone still produced a quest whose melody instruction meant “anything”; raising note counts was explicitly rejected as a substitute for a musical idea ([REVIEW-LOG.md:2455](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-40/REVIEW-LOG.md:2455), [2513](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-40/REVIEW-LOG.md:2513)).

   **Change:** require each musical half to name an idea its prerequisites teach and produce a meaningful descriptive response. Include A10’s distinction between authored story vocabulary and neutral shared engine sentences, the taught “even kick walk” exception, and explicit story subjects ([QUESTS.md:550](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-40/QUESTS.md:550)). Warn that parameter changes do not automatically change fixed way-descriptor wording. Keep clarity and musical feel as human review, not keyword tests.

9. **Medium — the drift guard needs a defined machine-readable boundary.** “Every key appears in a field table” can pass when a key occurs in the wrong block; repeated names such as `id`, `kind` and `versionId` make substring matching especially weak ([plan:67](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-40/reviews/TUN-105-make-a-quest-guide.md:67)). QT alone also leaves analyzer parameters, setup and songs opaque.

   **Change:** use explicitly marked Markdown sections and qualified field paths, recording required/optional status, literals, bounds and uniqueness. Traverse the relevant schema objects and parameter registries. Identify exactly one parseable worked-example block; define song elision precisely and compare it structurally. Pin closed registry membership and meaningful metadata, not prose layout, table order, line numbers or incidental whitespace. Do not pretend this test proves clarity, narration, playability or a successful contributor workflow.

10. **Medium — the cold-reader and pointer deliverables remain incomplete.** The planned trial ends with validation and tests ([plan:74](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-40/reviews/TUN-105-make-a-quest-guide.md:74)); that does not prove a working quest or a working PR. Prior review history documents browser-only defects missed by passing logic tests ([REVIEW-LOG.md:1856](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-40/REVIEW-LOG.md:1856)).

    **Change:** have the cold reader follow the documented workflow through installation, browser entry, all three phases, save/replay and a reviewable diff. Record assistance and failures, revise the guide, and retry affected steps. Remove the throwaway definition and artifacts before delivery. Keep README/AGENTS edits to single lines. `CONTRIBUTING.md` is absent from the available `origin/main` tree; avoiding a competing stub is sensible, but a future TUN-92 comment is a **deferred acceptance item**, not a completed pointer. Do not prescribe contributor identity/contact policy or force `author.id: "tune-garden"` merely because shipped definitions use it.

Tests I would require:

- Syntax check and the full suite after implementation; the review itself ran only the six-file, 110-test baseline and in-memory third-quest probes described above.
- Writer tests for exact serialized-size validation, envelope/count limits, official-source mismatch, invalid-input no-write, LF/CRLF preservation, missing/duplicate declarations, replacement metacharacters, and loading the resulting file through the real script-order harness.
- Third-definition tests covering different IDs, priority ties, prerequisites, optional/different setup pools, trail behavior and the actual dev handlers.
- Relevant fragment/setup mutation audits after changing their assertions.
- Cold-reader browser completion, resume, unmatched offering and saved-song replay; explicitly record remaining narration verification.

**Build with the changes above**

</details>

## My answers

Both of GPT's load-bearing claims were re-checked here, not taken on trust: a Woods clone added as a
third quest (`a-review-probe`, priority 10) fails **exactly the 10 tests** finding 3 names, across
`questcatalog`, `questsetup`, `quest-fragments`, `questhome` and `questauthoring` (engine file restored
from git after); and `tools/gen-voice.mjs` prunes every `voice/*.mp3` not keyed by an `intro:`/`credit:`
string (finding 6). `js/quest-engine.js` is CRLF in this checkout (finding 2).

1. **High — `write` validates one text and installs another.** **Agreed.** `check` and `write` run
   `loadQuestCatalog(text, "official")` on the exact canonical text to be embedded, and read
   `QUEST_CATALOG_ERRORS`, never the returned (truthy) registry.
2. **High — the file-editing contract.** **Agreed.** Raw read of the engine file, exactly one
   `const BUILTIN_QUEST_CATALOG_JSON = ` declaration (refuse none or two), splice by offsets (no
   replacement strings), every other byte kept (CRLF, trailing blank lines), the candidate loaded in a
   fresh harness before an atomic rename, input path ≠ engine path. Tests for each.
3. **High — a third quest breaks 10 tests.** **Agreed and reproduced.** How to answer it is a fork with
   materially different work → **owner question 1** below.
4. **High — loosening fragment assertions discards content guarantees.** **Agreed.** If the tests are
   decoupled (question 1, A): the two shipped quests keep their pools, geometry and IDs as explicit
   content pins selected by id; generic loops enumerate each definition's *own* pool and routes with a
   non-vacuity assertion; the conjunction proof stays; the fragment and setup mutation audits are re-run.
5. **High — witnesses are a promise, not a recipe.** **Agreed.** The guide gets a capture recipe
   (compose in the quest with `?dev`, `JSON.stringify(currentSong())` in the console), one complete
   compose witness and one transform A/B pair, a route × witness table showing each A-without-B
   separation, and a repair section per error code GPT lists, plus the setup notes (instance-only
   validation of `witness.setup`, geometry, `room`, setup vs. `starterSong`, an off-beat-kick fragment
   that yields `fragment-blocks-route`).
6. **High — the narration correction can't replace the ticket's requirement by fiat.** **Agreed.** Facts
   verified (above). `narrate()` does try `voice/<hash>.mp3` first for every line; no quest line has one,
   and none can survive `gen-voice.mjs` as it stands. That contradicts the ticket's *Done looks like* and
   *Constraints* → **owner question 2** below.
7. **Medium — browser troubleshooting.** **Agreed — my plan was wrong.** An empty trail does not mean a
   failed catalog: locked quests are filtered out. The guide gets a diagnostic sequence (catalog errors →
   prerequisites → runs/history → trail), what Unlock and Clear actually write, how priority ranks only
   fresh invitations behind offerings and active runs with ties on quest id, Q6's current contract, and
   loop-button vs. `loop` grant.
8. **Medium — the wording lesson that changed Woods (Step H / A11).** **Agreed.** Each musical half must
   name an idea the prerequisites teach and say something descriptive; A10's story vs. engine vocabulary;
   way-descriptor text does not follow parameters (Q9). Clarity stays human review.
9. **Medium — drift guard boundary.** **Agreed.** Marked sections, qualified field paths
   (`$.workspace.columns`, `$.phases[compose].challenge.routes[].observations[].analyzerId`) with
   required/optional, literals and bounds; exactly one parseable example block compared structurally
   with songs elided by a defined rule; registry membership and metadata pinned; no prose, order or
   whitespace.
10. **Medium — cold-reader trial and pointers incomplete.** **Agreed in part.** GPT through `ask.sh` cannot
    drive a browser, so the cold reader writes the quest and follows the install/check steps from the guide;
    I then follow the guide's browser steps *literally* with its quest — Unlock, all three phases, offer,
    replay the saved song, resume after reload — and record where the guide failed me; then remove it all.
    The TUN-92 pointer is a **deferred acceptance item**, recorded as such. `author.id`: not forced — the
    guide says both shipped quests use `tune-garden` and the owner decides at review.

## Owner's decisions

1. **A — decouple the tests in this ticket**: the owner, in the AO session, 2026-11-17. — *A valid third quest makes 10 existing tests fail (verified). Decouple them in this ticket,
   or document them?* **A)** Decouple here: content pins select the two shipped quests by id, generic
   loops use each quest's own pool and routes, Home tests select rows by id; re-run the fragment and setup
   mutation audits. Grows the ticket toward L. **B)** Leave the tests; the guide lists which tests a new
   quest must update and how; a Backlog ticket for the decoupling. — **Claude: A**, because B has a
   contributor hand-editing mutation-audited Home and fragment tests to add *data*, and the guide's
   "working pull request" is only honest with A.
2. **A — the guide says how quest text is really spoken; a Backlog ticket to bake quest narration**: the owner, in the AO session, 2026-11-17. — *The ticket says quest lines need the owner's narration clips; no quest line has or can get
   one today* (`gen-voice.mjs` bakes only `intro:`/`credit:` and prunes any other clip; quest text is
   always read in the browser's voice). **A)** The guide says so as it is, and that the owner approves how
   quest text sounds; a Backlog ticket "bake narration for quest text". **B)** The same guide, no ticket.
   **C)** Extend `gen-voice.mjs` in this ticket to bake quest text (the owner then runs a paid Polly
   generation). — **Claude: A**: the guide must be true, and baking is a separate, paid, owner-run change.

**Size after the answers.** With 1A the work is more than one session and adds a shared tool, so it is
worked as **L** from here (the label and section say M). The design stays as reviewed — the M plan, GPT's
design review and the owner's answers (`resume.md`: keep the design you have); L adds GPT's separate
test pass after the build.

## Cold-reader trial (Astra, as a reader with no context)

The ticket's proof by use. GPT (`ask.sh fresh workspace-write`), told to read only `MAKING-QUESTS.md` and the files it
points to, to log every other file it opened, and to stop before `write`, built a throwaway quest,
`pebble-postcards` (contour + steady pulse, no drum opening, its own transform routes: keep the shape or
change it over the same beat). **It passed `check` with no failed check along the way.**

<details><summary>GPT's report, verbatim</summary>

**A. RESULT**

Catalog: [pebble-postcards.json](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-40/tests/.cold-reader/pebble-postcards.json)  
Quest id: `pebble-postcards`

```text
ok — 3 quests: firefly-crossing, waking-woods, pebble-postcards (53110 of 262144 characters)
```

The child makes a shaped tune around three stones over an even kick walk or hi-hat shimmer.  
They revise its shape while keeping the steady pulse, compare both versions, and save their choice.

The transform routes differ from both shipped quests. All display text and four witness songs are newly authored. Nothing was installed. Browser playability and the ten-minute estimate remain unverified.

**B. THE RUN LOG**

Full command outputs and investigation notes are preserved in the [report](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-40/tests/.cold-reader/report.md), [command ledger](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-40/tests/.cold-reader/commands.json), and [notes](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-40/tests/.cold-reader/notes.md).

All filenames below are under `tests/.cold-reader/`.

1. **Extract** → succeeded, two quests.
2. **Copy Woods, change quest id, check** → passed: three quests, 54,557 characters.
3. Considered contour + melody-making. Abandoned it after reconciling the fixed-descriptor warning and analyzer relations. Chose contour + steady-pulse; wrote the replacement content.
4. **Evidence: `rise.json`** → rise + even-kick-walk. Used for compose and transform A.
5. **Evidence: `fall.json`** → fall + hat-shimmer. Used for the other compose route.
6. **Evidence: `revised.json`** → rise + even-kick-walk. Used for keeping the shape in B.
7. **Evidence: `changed.json`** → fall + even-kick-walk. Used for changing the shape in B.
8. **Check finished catalog** → passed with the exact output in A. No repair needed.
9. **Syntax check** → passed.
10. **Full test suite** → **935 passed, one failed**. To obey the file boundary, I placed temporary files under `.cold-reader/`. One test then attempted to copy `tests/` into its own subdirectory, producing `ERR_FS_CP_EINVAL`. The [complete output](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-40/tests/.cold-reader/08-stdout.txt) preserves the exact failure. I changed nothing: relocating temporary files outside the permitted directory would violate the exercise. This is an exercise constraint, not a guide defect. These tests exercised the installed catalog, not my external draft.
11. **Evidence: `hover-neighbor.json`** → `hover`, despite ending one rung above its start.
12. **Evidence: `net-rise-with-descents.json`** → `arc`, without `rise`, despite climbing three rungs overall.
13. **Final catalog check** → passed unchanged; output in A.

**There were no failed catalog checks.** The two additional evidence probes verified documentation findings; they required no catalog changes.

**C. WHERE THE GUIDE FAILED YOU**

1. **High — §7 overstates test coverage.**  
   “Every deal its rule can make” promises exhaustive coverage. The installed-quest test samples **512 seeds per quest**. The route/opening test uses one `fixture-4` stone layout per opening. These do not prove every route under every possible deal.

   **Replace with:** “After installation, tests sample 512 deals per quest and check every route against every opening using a representative stone layout. These are sampled checks, not exhaustive proof; also play several fresh runs.”

2. **Medium — §4 gives an inaccurate contour recipe.**  
   Hover need not end exactly where it began. Rise/Fall additionally require a minimum sequence length and more directional moves toward the claimed direction than against it. The two evidence probes demonstrate these discrepancies.

   **Replace with:** “Contour reads the highest note in each occupied column. Rise/Fall require at least three occupied columns, net movement of at least three ladder steps, and more moves in that direction than against it. Hover requires at least four columns, a range of at most two steps, and an ending within one step of the start.”

3. **Medium — §§4–5 hide the practical limits on capability pairings.**  
   The three-capability menu suggests choosing any two. My first choice required cross-reading analyzer phases, relations, and descriptor limitations before discovering that the guide offered no way to give it two distinctly worded compose routes.

   **Add:** “For a first quest with today’s descriptors, pair steady-pulse with melodic-contour or melody-making. Contour plus melody-making cannot provide two distinctly worded compose routes with this vocabulary: contour parameter changes leave the displayed text unchanged, and the two phrase analyzers have no declared relation.”

4. **Low — §5 misdescribes its shipped example.**  
   The fixed-slot pattern is not used throughout both shipped quests. Firefly’s transform routes vary both contour and pulse.

   **Replace with:** “The simplest pattern, used by both compose phases and Woods’ transform phase, keeps one slot fixed. Firefly’s transform phase demonstrates varying both slots.”

**Access accounting:** No unreferenced source file was needed to produce the passing catalog. Afterward, I searched and read guide-named `js/detectors.js` and `js/quest-engine.js`, plus tests covered by its `tests/quest*.test.mjs` pointer: `questsetup`, `questsetup-readiness`, and `quest-fragments`; searches also touched `questauthoring*`. Every search and its reason is logged. These were documentation audits, not implementation workarounds. The guide should name the particular tests supporting its coverage claims.

**D. WHAT WORKED**

The extract/copy/check workflow worked without engine knowledge. The field tables, analyzer/descriptor mappings, prerequisite rules, and gate examples were sufficient. The complete witness example and `evidence` command made authoring songs straightforward.

Section 9 helped keep the story calm, task wording literal, and musical alternatives free of judgments or scoring.

**E. CLAIMS FALSE ABOUT THE CODE**

- **Hover “ends where it began”:** `isHovering` in [js/detectors.js:23](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-40/js/detectors.js:23) allows an endpoint difference of one rung.
- **The Rise/Fall description omits required conditions:** `isRising`/`isFalling` in [js/detectors.js:21](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-40/js/detectors.js:21) require length and directional-step conditions. `songEvidence` uses these detectors.
- **Both shipped quests follow the fixed-slot pattern:** Firefly’s transform definitions in `js/quest-engine.js`’s `BUILTIN_QUEST_CATALOG_JSON`, consumed by `loadQuestCatalog`, contradict this.
- **Tests prove every possible deal:** the callbacks in [questsetup.test.mjs:132](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-40/tests/questsetup.test.mjs:132) and [quest-fragments.test.mjs:273](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-40/tests/quest-fragments.test.mjs:273) perform the bounded checks described above.

</details>

**My answers** — each finding re-checked against the code first.

1. **High — § 7 overstated the tests' coverage.** **Agreed** (`tests/questsetup.test.mjs` samples 512 seeds;
   `tests/quest-fragments.test.mjs` uses one stone layout per opening; only the catalog load's
   `fragment-blocks-route` proof is exhaustive). § 7 now says which is which, names the tests, and tells
   the author to play several fresh runs.
2. **Medium — § 4's contour recipe was inaccurate.** **Agreed** (`isRising`, `isFalling`, `isHovering`, `isArch`
   and `contourSeqFromGrid` in `js/detectors.js`: hover may end one step from its start; rise and fall need
   three columns and more steps in their direction). Rewritten from the detectors, pointing at `evidence`.
3. **Medium — which capability pairs work was hidden.** **Agreed** (`contour.any-of`'s one descriptor ignores
   its params; `phrase.minimum-onsets` and `phrase.on-every-beat` have no declared relation). § 5 now says
   which pairs work today and why.
4. **Low — "both shipped quests keep one slot fixed" was false for Firefly's transform.** **Agreed.** Corrected.
- *The one failing test in its run* (`TUN-5 audit: questsetup G faults…`, `ERR_FS_CP_EINVAL`) came from the
  exercise: it pointed its temp files into `tests/.cold-reader/`, so a test that copies `tests/` copied it
  into itself. Not a defect; the suite passes here (below).

**What I ran with its quest installed** (`tools/quest-catalog.mjs write`, by me): syntax check, and the
whole suite — **936/936 pass** with three quests in the catalog. Then the guide's § 8, literally, in AO's
browser on a fresh profile: 🗝️ Unlock quests ("Completed: Follow the Fireflies, Footsteps, Garden
Basics" — the union of the three quests' prerequisites); Home showed Firefly's card (priority 10) and
the trail listed *Pebble Postcards* (✨) and *The Waking Woods*; begun from the trail, all three phases
played as the guide describes — readiness line, Flutter (cast) on the shape and the garden's own voice
on the drums, the transform's "kept their Arc shape", both auditions, the offer — and a reload
mid-phase-3 brought "Continue Pebble Postcards · Phase 3 of 3" ahead of Firefly's invitation, with both
auditions kept. The saved song loaded from the Jukebox's *My Melodies*. No page errors. The server log
showed the game asking for `voice/<hash>.mp3` and falling back, as § 10 says.

**Fixed in the guide from my own run:** a first visit's landing card and friend picker cover the dev
buttons (§ 8 step 2 says so); where the saved song is (🎵 Jukebox → *My Melodies*); how to reach Home
(☰ → 🗺️). The throwaway quest and GPT's scratch files are deleted; nothing of them is committed.

**Not verified:** the two console tips (`JSON.stringify(currentSong())`, `QUEST_CATALOG_ERRORS`) — AO's
browser cannot run page code. `currentSong` is a top-level function and `QUEST_CATALOG_ERRORS` a
top-level `let` of a classic script, so both are reachable from the console by construction.

## Test pass (Astra)

Worked as L after the owner's answer 1A, so GPT ran a separate test pass (`ask.sh fresh workspace-write`).
It added two files, 22 tests, four of them executable TODOs for its findings.

<details><summary>GPT's test-pass report, verbatim</summary>

Found **one High issue**: a thrown reload leaves the writer’s candidate installed. Added **22 tests: 18 pass; four executable TODO regressions fail as expected**.

Full suite: **958 total, 954 passed, four TODOs, zero unexpected failures**. Syntax check passed. Only two new test files were added.

**A. Tests added**

In [quest-catalog-adversarial.test.mjs](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-40/tests/quest-catalog-adversarial.test.mjs):

| Test name | Mutation targeted | Result |
|---|---|---|
| BOM input is accepted by check, write and evidence instead of being rejected as JSON | Missing BOM removal | Pass |
| comments and trailing commas are refused without installing partial input | Accepting non-JSON or writing before parsing | Pass |
| invalid envelopes and a thirty-third definition are refused before any write | Bypassing catalog envelope/count validation | Pass |
| case and relative aliases cannot bypass the engine filename guard | Comparing unresolved or case-sensitive paths | Pass |
| extract replaces an existing destination with complete JSON and leaves the engine alone | Appending or retaining stale bytes | Pass |
| CLI extract, check and write honor relative paths with spaces and report no-op installs | Wrong path resolution, dispatch, or installation | Pass |
| CLI usage exits 2 and rejected JSON or catalogs exit 1 without changing the engine | Successful exit on refusal or rejected writes | Pass |
| CLI evidence distinguishes a valid witness, invalid song and malformed JSON by exit status | Wrong evidence dispatch/status | Pass |
| a reload returning catalog errors restores the complete original engine bytes | Removing the existing rollback branch | Pass |
| a thrown reload also restores the original engine instead of leaving the broken candidate installed | Missing exception-safe rollback | **Fails; TODO** |

In [quest-contributor-audit.test.mjs](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-40/tests/quest-contributor-audit.test.mjs):

| Test name | Mutation targeted | Result |
|---|---|---|
| guide guard catches a field moved to the wrong root | Matching unqualified field names | Pass |
| guide guard catches a changed numeric bound | Ignoring bounds | Pass |
| guide guard catches a field moved outside the checked markers | Searching beyond the marked section | Pass |
| guide guard accepts the same field rows in a different order | Accidentally pinning table order | Pass |
| guide guard rejects a contradictory duplicate field instead of silently keeping the last row | Silently collapsing duplicate paths | **Fails; TODO** |
| guide guard rejects an extra unregistered analyzer parameter value | Checking membership incompletely | **Fails; TODO** |
| guide error guard rejects a code that occurs only in a source comment | Treating comments as emitted errors | **Fails; TODO** |
| the existing dealer sweep detects a fault confined to a third quest's generated geometry | Skipping non-official definitions | Pass |
| the existing dealer sweep detects reusing the official fragment pool only for a third quest | Reusing an official pool | Pass |
| the existing route sweep detects a probe that drops the third quest's own opening | Testing the wrong openings | Pass |
| Home and authoring fixtures stay green with a new first catalog entry and a higher priority | Depending on catalog order or the shipped winner | Pass |
| an empty Home and trail can mean locked prerequisites with a completely healthy catalog | Conflating visibility with catalog validity | Pass |

The mutation audits execute the existing tests against in-memory mutations. Installation tests use disposable copies. All 22 tests were run.

**B. Findings**

1. **High — thrown reloads bypass rollback.**  
   [tools/quest-catalog.mjs:119](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-40/tools/quest-catalog.mjs:119) replaces the engine before calling `loadGame()`. Restoration at line 125 handles returned errors, but an exception at line 121 escapes it.

   **Reproduction:** in a temporary engine, inject a load-time exception conditional on the incoming catalog’s title. `check` succeeds; `write` throws; the engine bytes remain changed. This uses the real harness unchanged. The equivalent returned-error case restores correctly.

   **Change:** verify the candidate before replacement, as the reviewed contract states, and provide exception-safe rollback around post-write verification.

2. **Medium — the drift guard accepts contradictory fields and invalid parameter values.**  
   [quest-guide.test.mjs:42](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-40/tests/quest-guide.test.mjs:42) builds a `Map`, silently discarding earlier duplicate paths. A false `$.workspace.columns` row saying `1–999`, followed by the correct row, passes.

   [Line 84](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-40/tests/quest-guide.test.mjs:84) checks that expected enum values occur, but allows extras. Adding `spiral` to the documented contour families passes.

   **Change:** reject duplicate paths before constructing the map; compare parameter value sets exactly.

3. **Low — comments can manufacture “emitted” error codes.**  
   [quest-guide.test.mjs:132](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-40/tests/quest-guide.test.mjs:132) scans raw source. Adding a comment containing `err("never-emitted-review-code", …)` makes a corresponding invented guide row pass.

   **Change:** exclude comments and distinguish loader errors from unrelated error-shaped literals, or verify documented codes through explicit loader cases.

4. **Low — browser troubleshooting still gives a false diagnosis and an incomplete command.**  
   [MAKING-QUESTS.md:824](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-40/MAKING-QUESTS.md:824) says no visible quest means the installed catalog failed. The new test demonstrates an error-free, populated catalog with both Home and trail empty because prerequisites are locked.

   The printed `node tools/quest-catalog.mjs check` command also lacks its required filename; it exits **2**, not `ok`.

   **Change:** print `check my-quest.json`; inspect catalog errors before diagnosing failure, then check unlock/progress and trail state.

5. **Medium — the promised complete transform witness is missing.**  
   [The accepted answer at review line 197](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-40/reviews/TUN-105-make-a-quest-guide.md:197) promises a complete compose witness **and** transform A/B pair. The guide’s [only full witness example](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-40/MAKING-QUESTS.md:655) is compose; transform songs remain elided.

   **Change:** include one complete transform witness with both songs and check it against the shipped witness.

**C. Guide claims contradicted**

- “No quest at all” does **not** establish catalog failure.
- The bare `check` command cannot produce the promised success result.
- The opening assurance that marked tables are current whenever tests pass is stronger than the guard supports: conflicting fields and invented enum values can pass.

The missing transform example is an acceptance gap rather than a false statement about runtime behavior.

**D. Not tested**

- Rendering, audible narration/playback, `file://`, phones, or the two browser-console tips.
- The standalone full 472-mutation audit; I ran focused third-quest mutation audits and the full ordinary suite.
- Crash/power-loss durability or filesystem failures during rollback.

The four TODO assertions remain unresolved; they were executed, not skipped.

</details>

**My answers.** Both files were reviewed and **kept**: they test behaviour through disposable copies and
in-memory mutations, name their mutations, and never write the checkout.

1. **High — a thrown reload bypassed rollback.** **Agreed**, reproduced by its test. `write` now loads the
   candidate engine file in a throwaway copy of the page *before* replacing anything (the plan's contract,
   which I had not kept), and wraps the post-write reload so a throw or a reported error restores the
   original. Its returned-error test now expects "not changed"; the thrown-reload TODO passes.
2. **Medium — the drift guard accepted duplicate fields and invented parameter values.** **Agreed.**
   Duplicate field paths now fail; analyzer parameter values are compared exactly. Both TODOs pass.
3. **Low — comment-only codes counted as emitted.** **Agreed.** Comments are stripped before the codes
   are collected. The TODO passes.
4. **Low — § 8's diagnosis was still wrong, and `check` lacked its file.** **Agreed.** Rewritten: check
   the file, reload and unlock again, and only an empty Home *after* unlocking means the catalog failed.
5. **Medium — the promised transform witness was missing.** **Agreed.** § 5 now shows
   `woods-changed-the-beat` in full (A and B), and the guard checks both full witnesses against the
   shipped ones and their phase types.

**958/958 tests pass, 0 TODO**; syntax check passes. Not verified: rendering beyond the playthrough
above, `file://`, a phone, sound; the guide's console tips.
