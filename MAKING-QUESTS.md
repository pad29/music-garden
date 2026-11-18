# Making a quest

This guide takes you from nothing to a pull request that adds one **quest** to Tune Garden: a short,
three-part musical commission a child plays from the world map. A quest is **data, not code**. You
write one JSON definition, check it with the game's own validator, try it in a browser, and open a
pull request. You do not touch the engine.

`QUESTS.md` is the design document behind all of this, and it is long. This guide links into it
rather than repeating it. Tables marked as generated from the engine are checked against the code by
`tests/quest-guide.test.mjs`, so they are current whenever the tests pass.

**Before you start, open an issue.** A new quest is new content for children, and only the owner
decides what ships. Describe the idea in a few lines — which two powers it combines, which land it
belongs to, what the child makes — and wait for a yes before you spend an evening on witnesses.

You need Node.js (any current version) and a browser. There is nothing to install and no build step.

## Contents

1. [What a quest is, and is not](#1-what-a-quest-is-and-is-not)
2. [The workflow](#2-the-workflow)
3. [The definition, field by field](#3-the-definition-field-by-field)
4. [The closed lists](#4-the-closed-lists)
5. [Routes and witnesses](#5-routes-and-witnesses)
6. [The dealt task: `setup`](#6-the-dealt-task-setup)
7. [Checking it](#7-checking-it)
8. [Trying it in a browser](#8-trying-it-in-a-browser)
9. [What makes a good quest](#9-what-makes-a-good-quest)
10. [What you cannot do alone](#10-what-you-cannot-do-alone)
11. [The pull request](#11-the-pull-request)

## 1. What a quest is, and is not

A quest is an optional commission that asks a child to **combine two powers** they have already earned
in packages — say, a melody that lands on the beat (taught in *Footsteps*) over a steady drum pulse (also
*Footsteps*). It always has three phases: **compose** a version A, **transform** it into a version B,
then **compare** the two, choose one and **offer** it. The chosen song is saved as an ordinary song the
child owns. There is no score, no stars, no failure: the garden describes what it heard, and the child
can always offer what they made. Today's only kind is the *Guided Commission* (kind 1); the other eight
kinds in `QUESTS.md` § 8 are not built.

A quest is **not** a package or a level (those are code in `js/packages.js`); it cannot add a new
detector, a new sentence the garden says, a new control, or a new reward — those are closed lists the
engine owns (§ 4). It cannot contain code, HTML, links or asset paths. Read `QUESTS.md` Q1 (what
"quest" means), Q3 (the Guided Commission), Q7 (why quests are data) and Q8 (definition, run and song
are separate) for the reasoning.

The two quests that ship are *The Firefly Crossing* (`firefly-crossing`) and *The Waking Woods*
(`waking-woods`). This guide uses *The Waking Woods* as its example.

## 2. The workflow

1. **Get the catalog out.** Every quest lives in one escaped string, `BUILTIN_QUEST_CATALOG_JSON`, on
   the last line of `js/quest-engine.js`. Don't edit it by hand. Extract it to a file you can edit:

   ```bash
   node tools/quest-catalog.mjs extract my-quest.json
   ```

   Keep `my-quest.json` **outside** `js/` (the repository root is fine; don't commit it).
2. **Copy *The Waking Woods*** — the last entry in `definitions` — to a new entry after it, and give it a
   new `id`. Change one thing at a time, checking as you go.
3. **Check it** (§ 7):

   ```bash
   node tools/quest-catalog.mjs check my-quest.json
   ```

   It prints `ok — 3 quests: …`, or every error with its code and where it is.
4. **Install it** once it checks clean. This rewrites only the catalog literal in
   `js/quest-engine.js`, and only if the whole catalog passes:

   ```bash
   node tools/quest-catalog.mjs write my-quest.json
   ```
5. **Run the tests** (§ 7), then **play it in a browser** (§ 8).
6. **Open the pull request** (§ 11).

## 3. The definition, field by field

### The example: *The Waking Woods*

Here is the whole definition, as it ships, with each witness's songs left out (§ 5 shows one in full).
The tables below explain every field.

<!-- example:waking-woods -->
```json
{
  "v": 3,
  "id": "waking-woods",
  "author": {"kind": "official", "id": "tune-garden"},
  "kind": "guided-commission",
  "title": "The Waking Woods",
  "brief": {
    "worldText": "Hopper says the woods are still asleep. Three stones mark the way, and a tune has to reach every one.",
    "intentionText": "Make a tune that lands on the beat, then make a second walk and choose the one to give the woods."
  },
  "prerequisites": {"earnedByPackageIds": ["intro", "footsteps"]},
  "capabilityIds": ["melody-making", "steady-pulse"],
  "workspace": {
    "paletteId": "pentatonic",
    "columns": 16,
    "grooveId": "straight",
    "controlIds": ["drums", "loop"],
    "toolGrants": []
  },
  "setup": {
    "kind": "waypoints",
    "count": 3,
    "minGap": 4,
    "edgeMargin": 2,
    "rowMargin": 1,
    "minRowSpread": 2,
    "maxRowSpread": 4,
    "fragments": [
      [{"lane": 0, "c": 0}, {"lane": 1, "c": 2}],
      [{"lane": 0, "c": 0}, {"lane": 1, "c": 3}],
      [{"lane": 1, "c": 1}, {"lane": 1, "c": 2}],
      [{"lane": 0, "c": 0}, {"lane": 2, "c": 1}],
      [{"lane": 2, "c": 0}, {"lane": 2, "c": 1}, {"lane": 1, "c": 3}],
      [{"lane": 0, "c": 0}, {"lane": 2, "c": 2}, {"lane": 2, "c": 3}]
    ]
  },
  "phases": [
    {
      "id": "wake-the-woods",
      "name": "Wake the woods",
      "type": "compose",
      "versionId": "A",
      "worldText": "Three stones wait under the trees, and Hopper has taken the first few steps. Make a tune that reaches all three stones, stepping in time with Hopper's footsteps.",
      "intentionText": "Keep the ringed stones and Hopper's opening drum hits. Put notes around the stones, with one on every glowing column, and carry the drums on in your own way.",
      "procedure": {
        "gateIds": ["playback.complete-since-last-edit"],
        "transitionId": "fork-version",
        "buttonLabel": "Give the woods a second walk"
      },
      "challenge": {
        "id": "tune-over-footsteps",
        "capabilityIds": ["melody-making", "steady-pulse"],
        "routes": [
          {
            "id": "walk-on-main-beats",
            "witnessIds": ["woods-main-beats"],
            "observations": [
              {
                "analyzerId": "phrase.on-every-beat",
                "params": {},
                "descriptorId": "way-tune-on-beats"
              },
              {
                "analyzerId": "pulse.kick-on-main-beats",
                "params": {},
                "descriptorId": "way-pulse-main-kicks"
              }
            ]
          },
          {
            "id": "walk-the-even-eight",
            "witnessIds": ["woods-even-eight"],
            "observations": [
              {
                "analyzerId": "phrase.on-every-beat",
                "params": {},
                "descriptorId": "way-tune-on-beats"
              },
              {
                "analyzerId": "pulse.even-walk",
                "params": {},
                "descriptorId": "way-pulse-even-kicks"
              }
            ]
          },
          {
            "id": "walk-under-shimmer",
            "witnessIds": ["woods-shimmer"],
            "observations": [
              {
                "analyzerId": "phrase.on-every-beat",
                "params": {},
                "descriptorId": "way-tune-on-beats"
              },
              {
                "analyzerId": "pulse.hat-shimmer",
                "params": {},
                "descriptorId": "way-pulse-hat-shimmer"
              }
            ]
          }
        ]
      }
    },
    {
      "id": "walk-it-again",
      "name": "Walk it again",
      "type": "transform",
      "sourceVersionId": "A",
      "versionId": "B",
      "worldText": "The woods know that walk now. Show them a second one over the same stones.",
      "intentionText": "Keep the ringed stones and Hopper's opening drum hits. Change the tune, the drums after the opening, or both. Try a note on every glowing column.",
      "procedure": {
        "gateIds": ["edit.after-fork", "playback.complete-since-last-edit"],
        "transitionId": "advance",
        "buttonLabel": "Compare both walks"
      },
      "challenge": {
        "id": "same-woods-new-walk",
        "capabilityIds": ["melody-making", "steady-pulse"],
        "routes": [
          {
            "id": "kept-the-beat",
            "witnessIds": ["woods-kept-the-beat"],
            "observations": [
              {
                "analyzerId": "phrase.on-every-beat",
                "params": {},
                "descriptorId": "way-tune-on-beats"
              },
              {
                "analyzerId": "pulse.same-steady-family-as-snapshot",
                "params": {"snapshotVersionId": "A"},
                "descriptorId": "way-pulse-kept"
              }
            ]
          },
          {
            "id": "changed-the-beat",
            "witnessIds": ["woods-changed-the-beat"],
            "observations": [
              {
                "analyzerId": "phrase.on-every-beat",
                "params": {},
                "descriptorId": "way-tune-on-beats"
              },
              {
                "analyzerId": "pulse.differs-steady-family-from-snapshot",
                "params": {"snapshotVersionId": "A"},
                "descriptorId": "way-pulse-changed"
              }
            ]
          }
        ]
      }
    },
    {
      "id": "choose-the-walk",
      "name": "Choose the walk",
      "type": "compare-offer",
      "versionIds": ["A", "B"],
      "worldText": "Both walks are awake. Tap each one to hear it, and keep the walk the woods should have.",
      "intentionText": "Tap a walk to hear it — the one lit is the one you are holding. Play it right through, then give it to the woods.",
      "procedure": {
        "gateIds": ["comparison.auditioned-both", "comparison.chosen", "playback.complete-since-last-edit"],
        "transitionId": "offer"
      },
      "reflection": {
        "promptText": "Which walk sounds more like the woods waking up?",
        "choices": [{"id": "A", "label": "Walk A"}, {"id": "B", "label": "Walk B"}]
      }
    }
  ],
  "completion": {
    "actionId": "offer-song",
    "payoffId": "saved-song",
    "label": "Give this walk to the woods",
    "defaultTitle": "The Waking Woods",
    "completionText": "Hopper takes your walk into the trees, and the woods keep it."
  },
  "presentation": {
    "themeId": "deep-woods",
    "regionId": "pulse-woods",
    "cardText": "A walk to wake the woods",
    "estimateMinutes": 10,
    "priority": 20
  },
  "cast": [{"regionId": "pulse-woods", "capabilityId": "steady-pulse"}],
  "witnesses": [
    {"id": "woods-main-beats", "phaseId": "wake-the-woods", "currentVersionId": "A", "songs": "…"},
    {"id": "woods-even-eight", "phaseId": "wake-the-woods", "currentVersionId": "A", "songs": "…"},
    {"id": "woods-shimmer", "phaseId": "wake-the-woods", "currentVersionId": "A", "songs": "…"},
    {"id": "woods-kept-the-beat", "phaseId": "walk-it-again", "currentVersionId": "B", "songs": "…"},
    {
      "id": "woods-changed-the-beat",
      "phaseId": "walk-it-again",
      "currentVersionId": "B",
      "songs": "…"
    }
  ]
}
```
<!-- /example -->

### Rules the grammar enforces

Every field below, and **no other**: an unknown key is refused (`unknown-key`), a missing required one
too (`missing-key`). Text fields are plain text within the stated length, and must pass the text-safety
rule in § 9. A **slug** is lowercase words joined by hyphens (`waking-woods`, `walk-it-again`), at most
64 characters. A **dotted id** is a slug-like name with at least one dot (`pulse.even-walk`).

Paths: `$.` is the definition; `phase.` is any phase; `compose.`, `transform.` and `compare-offer.` are
the fields only that phase type has; `challenge.` and `procedure.` are those blocks wherever they
appear; `setup.` is the `waypoints` rule (§ 6). `[]` means each item of a list.

<!-- fields -->
| Field | Type | | What it does |
|---|---|---|---|
| `$.v` | 3 | required | The schema version. Use 3. (1 had no dealt task; 2 added one; 3 added the drum opening.) |
| `$.setup` | any JSON (see the section) | optional | The task the game deals each run: the ringed stones and the drum opening. § 6. |
| `$.id` | slug | required | The quest's permanent id. Saved runs refer to it: never change it once shipped. |
| `$.author` | object | required | Who wrote it. |
| `$.author.kind` | "official" or "player" | required | Must be `"official"`: the built-in catalog is loaded as official, and a definition that says otherwise is refused (`author-kind-mismatch`). |
| `$.author.id` | slug | required | Both shipped quests say `tune-garden`. Ask in your issue if you want something else. |
| `$.kind` | "guided-commission" | required | The quest kind. Only kind 1 exists. |
| `$.title` | text, 1–80 characters | required | The quest's name, on the card and at the top of the quest. |
| `$.brief` | object | required | The two-line brief shown when the quest opens. |
| `$.brief.worldText` | text, 1–240 characters | required | The story: who wants what, in the world's words. |
| `$.brief.intentionText` | text, 1–160 characters | required | The same task in plain musical words. |
| `$.prerequisites` | object | required | Who may begin it. |
| `$.prerequisites.earnedByPackageIds` | list of slug, 1–8, unique | required | Packages the child must have **completed**. Must include the package that earns each capability (§ 4) and teaches each analyzer you use. |
| `$.capabilityIds` | list of slug, exactly 2, unique | required | The two powers the quest combines (§ 4). |
| `$.workspace` | object | required | The editor the child gets. |
| `$.workspace.paletteId` | slug | required | Which notes the field offers: `pentatonic` or `diatonic` (`js/palettes.js`). |
| `$.workspace.columns` | whole number, 16–64 | required | How wide the field is. Four columns are one beat. Every witness song must have this width. |
| `$.workspace.grooveId` | slug | required | The feel (§ 4). |
| `$.workspace.controlIds` | list of slug, 0–16, unique | required | Extra controls the quest opens (§ 4). The pitch grid, play, undo and the voice picker are always there. |
| `$.workspace.toolGrants` | list, 0–16 | required | Stamps the quest lends. Nothing is grantable today: use `[]`. |
| `$.workspace.toolGrants[]` | object | required | — |
| `$.workspace.toolGrants[].toolId` | dotted id | required | — |
| `$.workspace.toolGrants[].capabilityId` | slug | required | — |
| `$.phases` | list of any JSON (see the section), exactly 3 | required | In this order: a `compose`, a `transform`, a `compare-offer`. |
| `$.completion` | object | required | The ending. |
| `$.completion.actionId` | slug | required | `offer-song` (§ 4). |
| `$.completion.payoffId` | slug | required | `saved-song` (§ 4). |
| `$.completion.label` | text, 1–60 characters | required | The offer button: "Give this walk to the woods". |
| `$.completion.defaultTitle` | text, 1–80 characters | required | The saved song's title until the child renames it. |
| `$.completion.completionText` | text, 1–240 characters | required | The garden's last line. |
| `$.presentation` | object | required | How it appears on Home. |
| `$.presentation.themeId` | slug | required | The card's look and icon (§ 4). |
| `$.presentation.regionId` | slug | required | The land it belongs to (§ 4). |
| `$.presentation.cardText` | text, 1–60 characters | required | The invitation on the card — not the instruction. |
| `$.presentation.estimateMinutes` | whole number, 1–60 | required | Shown as "About N minutes". Be honest: Q12 aims at 10–15. |
| `$.presentation.priority` | whole number, 0–999 | required | Lower comes first when several fresh quests could be offered (§ 8). |
| `$.witnesses` | list, 2–24 | required | Example songs that prove each route can be reached (§ 5). |
| `$.witnesses[]` | object | required | One witness. |
| `$.witnesses[].id` | slug | required | Named by `challenge.routes[].witnessIds`. |
| `$.witnesses[].phaseId` | slug | required | The phase it belongs to (`compose` or `transform`). |
| `$.witnesses[].currentVersionId` | "A" or "B" | required | Which song is "now": `A` in a compose phase, `B` in a transform phase. |
| `$.witnesses[].setup` | any JSON (see the section) | optional | A dealt task to check it against. § 6; the shipped quests leave it out. |
| `$.witnesses[].songs` | object | required | The songs, by version. |
| `$.witnesses[].songs.A` | any JSON (see the section) | required | A v3 song (§ 5). |
| `$.witnesses[].songs.B` | any JSON (see the section) | optional | The transformed song — needed for a transform phase witness. |
| `$.cast` | list, 1–8 | optional | Which friend speaks for which power while the quest is played. |
| `$.cast[]` | object | required | One speaker. |
| `$.cast[].regionId` | slug | required | A land with a fixed friend (§ 4). Each land at most once. |
| `$.cast[].capabilityId` | slug | required | One of the quest's two capabilities. Each at most once. A capability nobody speaks for is said in the garden's own voice. |
| `$.starterSong` | any JSON (see the section) | optional | A v3 song the field opens with. Not allowed together with `setup`. |
| `phase.id` | slug | required | Unique within the quest. |
| `phase.name` | text, 1–60 characters | required | The phase's heading. |
| `phase.worldText` | text, 1–240 characters | required | The story line for this phase (read aloud). |
| `phase.intentionText` | text, 1–160 characters | required | What to do, in plain musical words (read aloud after the story). |
| `phase.procedure` | procedure | required | How the phase ends. |
| `compose.type` | "compose" | required | — |
| `compose.versionId` | "A" | required | Compose makes version A. |
| `compose.challenge` | challenge | required | The routes (§ 5). |
| `transform.type` | "transform" | required | — |
| `transform.sourceVersionId` | "A" | required | Transform starts from a copy of A… |
| `transform.versionId` | "B" | required | …and makes B. |
| `transform.challenge` | challenge | required | The routes (§ 5). |
| `compare-offer.type` | "compare-offer" | required | — |
| `compare-offer.versionIds` | list of "A" or "B", exactly 2, unique | required | `["A", "B"]`. |
| `compare-offer.reflection` | object | required | The question asked while choosing. It never changes the outcome. |
| `compare-offer.reflection.promptText` | text, 1–160 characters | required | "Which walk sounds more like the woods waking up?" |
| `compare-offer.reflection.choices` | list, exactly 2 | required | One choice per version. |
| `compare-offer.reflection.choices[]` | object | required | — |
| `compare-offer.reflection.choices[].id` | "A" or "B" | required | Must match `versionIds`. |
| `compare-offer.reflection.choices[].label` | text, 1–40 characters | required | "Walk A". |
| `challenge.id` | slug | required | — |
| `challenge.capabilityIds` | list of slug, exactly 2, unique | required | The same two as `$.capabilityIds`. |
| `challenge.routes` | list, 2–4 | required | Alternative ways through (§ 5). |
| `challenge.routes[]` | object | required | One route. |
| `challenge.routes[].id` | slug | required | Unique across the whole quest. |
| `challenge.routes[].observations` | list, 1–2 | required | Exactly one per capability — so, in practice, two. |
| `challenge.routes[].observations[]` | object | required | One thing the garden listens for. |
| `challenge.routes[].observations[].analyzerId` | dotted id | required | A musical analyzer (§ 4). |
| `challenge.routes[].observations[].params` | any JSON (see the section) | required | The analyzer's parameters (§ 4); `{}` when it takes none. |
| `challenge.routes[].observations[].descriptorId` | slug | required | How the route is described before the child starts: the analyzer's one `way-` descriptor (§ 4). |
| `challenge.routes[].witnessIds` | list of slug, 1–8, unique | required | Witnesses for this phase that prove the route (§ 5). |
| `procedure.gateIds` | list of dotted id, 1–4, unique | required | Procedural gates that must all be open (§ 4). |
| `procedure.transitionId` | slug | required | What the button does (§ 4). |
| `procedure.buttonLabel` | text, 1–60 characters | optional | The button's words, for compose and transform. The offer button uses `$.completion.label`. |
| `setup.kind` | "waypoints" | required | The only setup kind. |
| `setup.count` | whole number, 2–5 | required | How many ringed stones. |
| `setup.minGap` | whole number, 2–8 | required | Fewest columns between two stones. |
| `setup.edgeMargin` | whole number, 1–8 | required | Free columns kept at each end of the field. |
| `setup.rowMargin` | whole number, 0–4 | required | Rows kept free at the top and bottom of the ladder. |
| `setup.minRowSpread` | whole number, 0–4 | required | The stones span at least this many rows… |
| `setup.maxRowSpread` | whole number, 0–4 | required | …and at most this many. |
| `setup.fragments` | list, 1–12 | optional | A pool of short drum openings; each run is dealt one. |
| `setup.fragments[]` | list, 2–3 | required | One opening: two or three hits. |
| `setup.fragments[][]` | object | required | One hit. |
| `setup.fragments[][].lane` | whole number, 0–2 | required | 0 kick, 1 snare, 2 hi-hat. |
| `setup.fragments[][].c` | whole number, 0–3 | required | Its column, inside the first beat. |
<!-- /fields -->

### Rules beyond the grammar

The validator then checks the definition against itself and the engine:

- Phases are in the order compose, transform, compare-offer, with unique ids.
- Every `challenge.capabilityIds` equals `$.capabilityIds`.
- Route ids are unique across the quest; every `witnessIds` entry names a witness of **that** phase.
- `compare-offer.reflection.choices` ids are exactly its `versionIds`.
- The packages exist and are not hidden (`studio` is hidden); the palette and groove exist.
- The completion action's transition is carried by some phase (the compare-offer's `offer`).

## 4. The closed lists

Every id in a definition must name an entry in one of these engine registries. They are closed on
purpose: a definition can only ask for what the engine knows how to do, so a quest can never strand a
child on a button that does nothing (`QUESTS.md` Q7, Q9). **Adding an entry is engine work**, not a
quest: propose it in an issue.

All registries are in `js/quest-engine.js` unless noted. These tables are checked against the code.

**Capabilities** (`QUEST_CAPABILITIES`) — the powers a quest can combine, and the package that earns
each. That package must be in `$.prerequisites.earnedByPackageIds`.

<!-- registry:capabilities -->
| Capability | Earned by |
|---|---|
| `melodic-contour` | `follow-the-fireflies` |
| `steady-pulse` | `footsteps` |
| `melody-making` | `intro` |
<!-- /registry -->

**Musical analyzers** (`QUEST_PRIMITIVES`, kind `musical`) — what the garden can listen for, used in
`challenge.routes[].observations[]`. Each belongs to one capability, works only in the phase types
listed, needs any listed control in `$.workspace.controlIds`, needs any "taught by" package in the
prerequisites (`analyzer-not-taught` otherwise), and has exactly one `way-` descriptor.

<!-- registry:analyzers -->
| Analyzer | Capability | Phases | Needs | Taught by | Descriptor | Params |
|---|---|---|---|---|---|---|
| `contour.any-of` | `melodic-contour` | `compose` | — | — | `way-contour-any` | `{"families": [...]}`: 1–4 of `rise`, `fall`, `hover`, `arc` |
| `contour.same-family-as-snapshot` | `melodic-contour` | `transform` | — | — | `way-contour-kept` | `{"snapshotVersionId": "A"}` |
| `contour.differs-from-snapshot` | `melodic-contour` | `transform` | — | — | `way-contour-changed` | `{"snapshotVersionId": "A"}` |
| `pulse.kick-on-main-beats` | `steady-pulse` | `compose` | `drums` | — | `way-pulse-main-kicks` | `{}` |
| `pulse.even-walk` | `steady-pulse` | `compose` | `drums` | — | `way-pulse-even-kicks` | `{}` |
| `pulse.hat-shimmer` | `steady-pulse` | `compose` | `drums` | — | `way-pulse-hat-shimmer` | `{}` |
| `pulse.same-steady-family-as-snapshot` | `steady-pulse` | `transform` | `drums` | — | `way-pulse-kept` | `{"snapshotVersionId": "A"}` |
| `pulse.differs-steady-family-from-snapshot` | `steady-pulse` | `transform` | `drums` | — | `way-pulse-changed` | `{"snapshotVersionId": "A"}` |
| `phrase.minimum-onsets` | `melody-making` | `compose`, `transform` | — | — | `way-enough-notes` | `{"minimum": N}`, N 1–64 |
| `phrase.on-every-beat` | `melody-making` | `compose`, `transform` | — | `footsteps` | `way-tune-on-beats` | `{}` |
<!-- /registry -->

What they hear, in short (the detectors are in `js/detectors.js`; § 5 has more):

- **Contour families** read the tune's shape left to right, from the **highest note in each column that
  has one** (in ladder steps). `rise`: at least three such columns, the last at least three steps above
  the first, and more steps up than down. `fall`: the same, downwards. `hover`: at least four columns,
  all within two steps of each other, ending within one step of the start. `arc`: at least four columns
  and exactly one hill. A tune can be in more than one family — check yours with `evidence` (§ 5).
- **Pulse families** read the drums: `main-beat-kicks` is a kick on every main beat (columns 0, 4, 8, …)
  and no other kick; `even-kick-walk` is a kick on every second column; `hat-shimmer` is a hi-hat on
  every second column. "Every" means all the way across the field.
- `phrase.on-every-beat` asks for a melody note on every main beat. `phrase.minimum-onsets` counts notes.
- The `snapshot` analyzers compare the current song (B) with the version it was copied from (A), so in
  a transform phase their params are always `{"snapshotVersionId": "A"}` (`snapshot-not-source`
  otherwise).

**Analyzer relations** (`QUEST_CROSS_RELATIONS`) — when two routes use **different** analyzers for the
same capability, the engine must know how the two relate, or the definition is refused
(`relation-unknown`). These are the only declared pairs:

<!-- registry:relations -->
| Pair | Relation |
|---|---|
| `contour.same-family-as-snapshot` · `contour.differs-from-snapshot` | disjoint |
| `pulse.same-steady-family-as-snapshot` · `pulse.differs-steady-family-from-snapshot` | disjoint |
| `pulse.kick-on-main-beats` · `pulse.even-walk` | disjoint |
| `pulse.kick-on-main-beats` · `pulse.hat-shimmer` | overlap |
| `pulse.even-walk` · `pulse.hat-shimmer` | overlap |
<!-- /registry -->

The same analyzer in two routes relates through its params: `contour.any-of` with `["rise"]` **implies**
`contour.any-of` with `["rise", "fall"]` (asking for less is the stronger demand); a higher `minimum`
implies a lower one; analyzers with no params are equal.

**Procedural gates** (`QUEST_PRIMITIVES`, kind `procedural`) — facts about what the child *did*, never
about the music. Used only in `procedure.gateIds`.

<!-- registry:gates -->
| Gate | Open when |
|---|---|
| `playback.complete-since-last-edit` | the current version has been played right through since its last edit |
| `edit.after-fork` | version B has been edited since it was copied from A |
| `comparison.auditioned-both` | both versions have been heard as they are now |
| `comparison.chosen` | the child is holding one of the two versions |
<!-- /registry -->

Use them as the shipped quests do: compose `["playback.complete-since-last-edit"]`; transform
`["edit.after-fork", "playback.complete-since-last-edit"]`; compare-offer
`["comparison.auditioned-both", "comparison.chosen", "playback.complete-since-last-edit"]`.

**Way descriptors** (`QUEST_DESCRIPTORS`, kind `way`) — the phrase that describes a route in "ways this
could work". You don't choose freely: each analyzer allows exactly one (see the analyzers table). The
text is fixed and does not change with params — `contour.any-of` says "a Rise, Fall, Hover, or Arc
path" whatever families you give it (`QUESTS.md` Q9), so don't vary routes by params alone.

<!-- registry:descriptors -->
| Descriptor | Says |
|---|---|
| `way-contour-any` | a Rise, Fall, Hover, or Arc path |
| `way-pulse-main-kicks` | a clean kick on every main beat |
| `way-pulse-even-kicks` | an even kick walk, all the way across |
| `way-pulse-hat-shimmer` | a steady hi-hat shimmer, all the way across |
| `way-contour-changed` | a different recognized shape |
| `way-contour-kept` | the same recognized shape |
| `way-pulse-kept` | the same steady heartbeat |
| `way-pulse-changed` | a different steady heartbeat |
| `way-enough-notes` | enough notes to make a phrase |
| `way-tune-on-beats` | a tune that lands on every beat |
<!-- /registry -->

**Controls** (`QUEST_CONTROLS`) — what `$.workspace.controlIds` may open.

<!-- registry:controls -->
| Control | Opens |
|---|---|
| `drums` | the drum bed — required by every `pulse.*` analyzer |
| `room` | the ＋/－ controls that insert and remove time — **not allowed with `setup`** (they would slide the stones) |
| `loop` | looping, on from the first bar (the ↻ button is always there; this only turns it on) |
| `jam` | the band and the groove picker |
| `fuse` | the toolbox and Fuse |
| `more` | the More menu |
| `grow` | grow and trim — needed before any witness may hold a note longer than one column |
<!-- /registry -->

**Tools** (`QUEST_TOOLS`) — nothing is grantable yet, so `$.workspace.toolGrants` must be `[]`.

<!-- registry:tools -->
| Tool | |
|---|---|
<!-- /registry -->

**Transitions** (`QUEST_TRANSITIONS`) — what a phase's button does; each ends one phase type only.

<!-- registry:transitions -->
| Transition | Ends |
|---|---|
| `fork-version` | `compose` — copies A into B and moves on |
| `advance` | `transform` — moves on to the comparison |
| `offer` | `compare-offer` — offers the chosen version and ends the quest |
<!-- /registry -->

**Completion actions** (`QUEST_COMPLETION_ACTIONS`), **payoffs** (`QUEST_PAYOFFS`), **grooves**
(`QUEST_GROOVES`) and **setup kinds** (`QUEST_SETUP_KINDS`):

<!-- registry:completion-actions -->
| Completion action | Transition |
|---|---|
| `offer-song` | `offer` |
<!-- /registry -->

<!-- registry:payoffs -->
| Payoff | Gives |
|---|---|
| `saved-song` | the chosen song, saved as the child's own |
<!-- /registry -->

<!-- registry:grooves -->
| Groove | Feel |
|---|---|
| `straight` | even eighths |
<!-- /registry -->

<!-- registry:setup-kinds -->
| Setup kind | |
|---|---|
| `waypoints` | ringed stones, and optionally a drum opening (§ 6) |
<!-- /registry -->

**Themes** (`QUEST_THEMES`) — the card's look:

<!-- registry:themes -->
| Theme | Icon |
|---|---|
| `night-meadow` | ✨ |
| `deep-woods` | 🌲 |
<!-- /registry -->

**Lands.** `$.presentation.regionId` is any land on the world map (`REGION_MAP` in
`js/level-engine.js`). `$.cast[].regionId` must be a land with a fixed friend (`REGIONS`, same file) —
not `first-garden`, whose friend is whichever companion the child picked.

<!-- registry:map-regions -->
| Land | Friend (for `cast`) |
|---|---|
| `first-garden` | — |
| `paths-of-song` | Flutter |
| `pulse-woods` | Hopper |
| `stone-chorus-canyon` | Geo |
| `color-spring` | Prism |
| `weather-of-wanting` | Sol |
| `twin-gardens` | Solune |
<!-- /registry -->

**Packages and palettes** are not copied here; they grow. Package ids are the keys of `PACKAGES` in
`js/packages.js` (every one except the hidden `studio`); `README.md` § Current status lists them by land.
Palettes are `PALETTES` in `js/palettes.js`; each one's `MIDI` list is its ladder of pitches, **top row
first** — `pentatonic` is `[81, 79, 76, 74, 72, 69, 67, 64, 62, 60]` (A5 down to C4).

## 5. Routes and witnesses

This is the hard part, and the part the validator checks hardest.

### Routes

A phase's **challenge** offers two to four **routes**: alternative ways the music could go. Each route
has one observation per capability — so a route is one melody idea **and** one drum idea. The child is
never told whether a route matched; routes are suggestions read before starting ("ways this could
work"), and the friends then describe what they heard (`QUESTS.md` Q5, Q6). The validator insists that
the routes are **real alternatives**:

- at least two, and no two the same (`duplicate-route-observations`);
- no route **implies** another — if every song that matches A must also match B, they are not
  alternatives (`route-implies-route`). Witnesses cannot fix this; change the routes;
- two different analyzers in the same capability slot must have a declared relation (§ 4,
  `relation-unknown`);
- every route is **reachable**: one of its witnesses matches it (`route-unsatisfiable`);
- every route is **distinguishable** from every other: for each ordered pair A, B, some witness of A
  matches A and not B (`no-distinguishing-witness`).

The easy pattern: **keep one slot the same in every route and vary the other.** Both shipped quests'
compose phases do it — *The Waking Woods*' routes all ask for `phrase.on-every-beat` and differ in the
drums: clean main-beat kicks, an even kick walk, or a hi-hat shimmer — and so does Woods' transform
phase, which keeps the tune clause and asks for the same heartbeat as A or a different one. *The Firefly
Crossing*'s transform phase shows the other way: its three routes vary both slots (new shape, same
heartbeat; same shape, new heartbeat; both new).

**Which two capabilities pair well, today.** Pair `steady-pulse` with `melodic-contour` or with
`melody-making`: the pulse analyzers give compose routes three distinct drum ideas with distinct
wording. `melodic-contour` with `melody-making` cannot give two compose routes distinct wording: the
only compose contour analyzer, `contour.any-of`, describes itself the same way whatever families it is
given, and the two phrase analyzers have no declared relation (`relation-unknown`).

### Witnesses

A **witness** is an example song that proves a route can be reached, in the workspace the child is
given. It is checked with the same analyzers the game uses on the child's music. For a compose phase a
witness has one song, `A`, with `currentVersionId: "A"`; for a transform phase it has `A` (the
snapshot) **and** `B` (the transformed song), with `currentVersionId: "B"`.

Here is one in full — the witness for *The Waking Woods*' first route:

<!-- example:witness -->
```json
{
  "id": "woods-main-beats",
  "phaseId": "wake-the-woods",
  "currentVersionId": "A",
  "songs": {
    "A": {
      "v": 3,
      "meta": {"title": null, "created": 0, "updated": 0, "author": null},
      "palette": "pentatonic",
      "time": {"cols": 16, "tempo": 108, "groove": 0},
      "tracks": [
        {
          "kind": "melody",
          "voice": "musicbox",
          "notes": [
            {"p": 60, "c": 0, "len": 1},
            {"p": 64, "c": 2, "len": 1},
            {"p": 67, "c": 4, "len": 1},
            {"p": 72, "c": 6, "len": 1},
            {"p": 72, "c": 8, "len": 1},
            {"p": 72, "c": 12, "len": 1}
          ]
        },
        {
          "kind": "drums",
          "hits": [{"lane": 0, "c": 0}, {"lane": 0, "c": 4}, {"lane": 0, "c": 8}, {"lane": 0, "c": 12}]
        }
      ]
    }
  }
}
```
<!-- /example -->

A song is the game's ordinary **v3 song** (`SAVE-SHARE.md`): `notes` are `{p, c, len}` — MIDI pitch,
column, length in columns; `hits` are `{lane, c}` — lane 0 kick, 1 snare, 2 hi-hat. `meta` can be all
nulls and zeros, `voice` any instrument (`musicbox` is fine), `tempo` anything sensible. A witness must
be a song the child could build in **this** quest (`witness-unreachable` otherwise):

- `palette` is `$.workspace.paletteId`, and every `p` is on that palette's ladder;
- `time.cols` is `$.workspace.columns`, and `time.groove` is the groove's number (`straight` is 0);
- every `len` is 1 unless the workspace grants `grow`;
- no drum hits unless the workspace grants `drums`.

This is how *The Waking Woods*' witnesses divide its routes — each witness matches exactly one route,
which is what makes every pair distinguishable:

| Phase | Witness | Its drums | Contour heard | Matches |
|---|---|---|---|---|
| compose | `woods-main-beats` | kick on 0, 4, 8, 12 | rise | `walk-on-main-beats` only |
| compose | `woods-even-eight` | kick on every second column | fall | `walk-the-even-eight` only |
| compose | `woods-shimmer` | hi-hat on every second column | rise, arc | `walk-under-shimmer` only |
| transform | `woods-kept-the-beat` | A: main-beat kicks → B: main-beat kicks | fall | `kept-the-beat` only |
| transform | `woods-changed-the-beat` | A: main-beat kicks → B: even kick walk | rise | `changed-the-beat` only |

Every one of them has a note on every main beat, so each also satisfies the tune clause the routes share.

**Making a witness.** The songs are small; writing them by hand is usually quickest. Start from the
Woods witnesses, change the drums or the tune, and ask the tool what the analyzers hear:

```bash
node tools/quest-catalog.mjs evidence my-song.json
```

where `my-song.json` holds one song. It prints the contour families, pulse families, beats landed on
and note count. To capture a song you played instead: open the game with `?dev` (§ 8), build it in the
Studio or in a quest with the same palette and width, then type `JSON.stringify(currentSong())` in the
browser's developer console and copy the result.

**When a witness fails**, the error says which: `route-unsatisfiable` — none of that route's witnesses
matches it, so check its evidence against both observations; `no-distinguishing-witness` — a witness
matches, but also matches the other route named, so add or change a witness that matches one and not
the other; `witness-unreachable` — the song breaks the workspace, and the code after the colon says how
(`palette:`, `columns:`, `groove:`, `pitch:`, `length-not-granted:`, `drums-not-granted`).

## 6. The dealt task: `setup`

Both shipped quests deal each run a small task, so no two children start from the same field: a few
**ringed stones** (melody notes the child must keep) and, optionally, a short **drum opening** to carry
on. The rule is `$.setup`, kind `waypoints`; the game deals a fresh instance from it for each run and
never re-deals it.

- **Stones.** `count` stones, at least `minGap` columns apart, never in the first or last `edgeMargin`
  columns, on rows inside the ladder minus `rowMargin` at each end, spanning between `minRowSpread` and
  `maxRowSpread` rows. If they cannot fit the field, the definition is refused (`setup-rule-infeasible`).
- **The opening.** `fragments` is a pool of openings of two or three drum hits, all inside the first
  beat (columns 0–3), on at least two different columns (`fragment-one-attack` otherwise). The engine
  proves that no opening **closes** one of your routes: a kick off the main beat — say `{lane: 0, c: 2}`
  — makes "a clean kick on every main beat" impossible, so in a quest with that route it is refused
  (`fragment-blocks-route`).
- **What the child must do before moving on** (phases 1 and 2): keep every stone, put a note of their
  own in every stretch before, between and after the stones, keep the opening and carry the beat on past
  it (or, with no opening, have some beat at all). The game shows one plain sentence for what is still
  missing; nothing else gates them (`QUESTS.md` Q6).
- With `setup`, the quest may not grant `room` (`setup-forbids-control`) or have a `starterSong`
  (`setup-with-starter-song`).
- A witness may carry a `setup` instance to be checked against the rule (`witness-setup-invalid` if it
  breaks it). This checks the instance's geometry only, not that the witness songs keep its stones;
  the shipped quests leave it out. The tests check separately that every route can still be reached
  under every opening your pool can deal (§ 7).

## 7. Checking it

`node tools/quest-catalog.mjs check my-quest.json` runs your whole catalog through the game's own loader,
exactly as the game does at start-up. **One bad definition empties the whole catalog** — the game
then shows no quests at all — so a clean check matters more than it looks.

The commonest refusals, and what to change:

<!-- error-codes -->
| Code | Means | Fix |
|---|---|---|
| `unknown-key`, `missing-key`, `not-allowed-value`, `text-length`, `int-range`, `array-length` | the grammar (§ 3) | the field at the path shown |
| `unsafe-text`, `asset-looking-text` | the text-safety rule (§ 9) | reword |
| `no-such-package`, `no-such-palette`, `no-such-groove`, `no-such-control`, `no-such-tool`, `no-such-transition`, `no-such-gate`, `no-such-analyzer`, `no-such-descriptor`, `no-such-theme`, `no-such-region`, `no-such-cast-region` | an id not in its list (§ 4) | use a listed id |
| `capability-not-earned` | a capability whose package is not a prerequisite | add the package from the capabilities table |
| `analyzer-not-taught` | an analyzer whose "taught by" package is not a prerequisite | add it (a capability and an idea inside it can be taught by different packages) |
| `analyzer-control-not-granted` | a `pulse.*` analyzer without `drums` | add `drums` to `controlIds` |
| `analyzer-wrong-phase`, `transition-wrong-phase`, `musical-as-gate`, `procedural-in-route` | something used in the wrong place | see the tables in § 4 |
| `route-capability-span` | a route without exactly one observation per capability | one melody clause, one drum clause |
| `snapshot-not-source` | a transform analyzer not comparing with `"A"` | `{"snapshotVersionId": "A"}` |
| `descriptor-not-allowed`, `descriptor-wrong-kind` | the wrong descriptor for an analyzer | the one in the analyzers table |
| `route-implies-route`, `duplicate-route-observations`, `relation-unknown` | the routes are not real alternatives | § 5 — change the routes |
| `route-unsatisfiable`, `no-distinguishing-witness`, `witness-unreachable`, `witness-song-invalid` | the witnesses | § 5 |
| `setup-rule-infeasible`, `fragment-blocks-route`, `fragment-one-attack`, `setup-forbids-control` | the dealt task | § 6 |
| `author-kind-mismatch` | `author.kind` is not `"official"` | `"official"` |
| `source-too-large` | the whole catalog is over 262,144 characters as installed | smaller witnesses, or fewer |
<!-- /error-codes -->

Then run the tests — all of them; they take a few minutes:

```bash
node tools/check-syntax.mjs
node --test "tests/*.test.mjs"
```

You don't need to write a test for a new quest: the existing ones already run over every quest in the
catalog. Loading it proves, for **every** opening in its pool, that no opening makes a drum route
impossible. Beyond that, the tests **sample**: `tests/questsetup.test.mjs` deals 512 runs per quest and
checks each is legal and completable, and `tests/quest-fragments.test.mjs` checks, for every opening
under one representative layout of stones, that each route can be reached by a song that also completes
the dealt task. Sampled is not exhaustive — so also play several fresh runs (§ 8). To run just the quest
tests while you work: `node --test "tests/quest*.test.mjs"`.

## 8. Trying it in a browser

A clean check proves the data is legal, not that the quest is good to play. Play it.

1. **Serve the game**: `npx http-server -p 8377 -c-1 .` and open `http://localhost:8377/?dev`
   (or open `index.html` directly and add `?dev` to the address).
2. On a first visit the landing card and then the friend picker cover the page: press **▶ Start
   playing** and pick a friend first. Then, in the dev bar at the top, press **🗝️ Unlock quests**. It marks every quest's prerequisite packages
   as completed in this browser's saved progress — an ordinary progress record, as if they had been
   played. **🧹 Clear quest runs** forgets every quest run and completion, so the quests are unplayed
   again; it does not undo the unlock.
3. Go **Home**: the ☰ menu, then 🗺️ (the world map). Below the map is **one** quest card at a time (`QUESTS.md` Q22): a quest
   already being played comes first, then a fresh one — the lowest `presentation.priority`, ties broken
   by quest id. Other quests are on the **quest trail** beneath the card. To reach yours first, play it
   from the trail, or give it a lower priority while you test (and put it back).
4. **Play all three phases.** In phase 1, keep the ringed stones, fill every stretch, carry the drums
   on, and play the song right through; the button then moves on. In phase 2, change something and play
   it through again. In phase 3, tap each version to hear it, keep one, and offer it. Then open the
   🎵 Jukebox from the ☰ menu: your song is at the bottom, under *My Melodies*. Load it and play it.
5. **Try leaving.** Go Home mid-phase and reload the page; the card should say Continue and bring you
   back where you were.

**If your quest is not there:** the dev bar's unlock writes progress, so first check your catalog —
`node tools/quest-catalog.mjs check` must say `ok`, and if the game shows **no** quest at all, the
installed catalog failed to load (in the developer console, `QUEST_CATALOG_ERRORS` lists why). Then
check prerequisites (press Unlock again after installing a quest with new ones), then whether a saved
run of another quest is being shown first (Clear quest runs), then the trail.

## 9. What makes a good quest

The validator checks that a quest is legal. These are the project's own tests of whether it is good;
the owner applies them when playing it.

- **Routes, not a checklist** (`QUESTS.md` Q5). The routes are different musical ideas a child might
  try, not boxes to tick. Never write text that lists requirements one by one.
- **Offer anyway** (Q6). Whatever the child made, they can offer it, with the same reward. Never write
  text that implies a wrong answer, a score, or a "try again".
- **Calm and finite** (Q12). About 10–15 minutes over three phases. No timers, no streaks, no friend in
  distress. If a first play takes three minutes, it is too thin, whatever the estimate says.
- **No clutter on the map** (Q22). Your quest gets the same single card and trail row as every other.
  Ask for nothing more.
- **Name a real musical idea for each half** (`REVIEW-LOG.md`, "Step H"). *The Waking Woods* first asked
  for "enough notes", which every finished task already had, so the melody half meant nothing. It now
  asks for footsteps' own idea, a tune that lands on every beat. Choose analyzers whose idea the
  prerequisites actually teach, and that make the garden say something about what the child did.
- **Two kinds of line** (`QUESTS.md` Q14; `REVIEW-LOG.md`, "Step G"). Story lines — `worldText`,
  `completionText` — may use the quest's world ("Hopper says the woods are still asleep"), with a clear
  subject. Task lines — `intentionText`, button labels — say literally what to do, in the words the
  packages taught ("notes", "tune", "beat", "drum hits"; "even kick walk" is a taught name). Both must
  describe the same task.
- **Describe, never judge** (Q5). The engine says what it heard — the notes climbed, the drums walked
  evenly — never that something is beautiful or sad. Keep your own text the same.

**Text safety.** Quest text is shown with `textContent`, never as HTML — a quest's strings must never
reach `innerHTML` (the comment above `setStatusText` in `js/helpers.js`). The validator also refuses
text containing `<`, `>`, `{`, `}`, `\`, control or direction-override characters, `http:`, `https:`,
`www.`, `javascript:`, `data:`, `file:`, `url(`, `@import`, `./` or `../`, and anything that looks like
a file name (`.mp3`, `.png`, `.js`, `.json`, `.html` and similar).

**Ids are permanent.** Once a quest ships, its `id`, its phase ids and its version are what saved runs
refer to; changing them strands children mid-quest. Choose them carefully.

## 10. What you cannot do alone

- **The owner judges the music and the feel.** Whether the routes are musically interesting, whether the
  wording is clear to a child, and whether it takes the right time are decided by playing it. Expect the
  owner to playtest and to ask for changes.
- **Narration.** With read-aloud on, each phase's `worldText` and `intentionText` are read out. Package
  stories are read by a recorded narrator, from clips made with `tools/gen-voice.mjs`, which needs the
  owner's AWS account. **Quest text has no recorded clips today**: the generator does not read the quest
  catalog, so every quest — the shipped two included — is read aloud in the browser's own voice.
  Don't add clips under `voice/` yourself; the generator deletes clips it did not make. Recording quest
  text is TUN-116; the owner decides how it sounds.
- **New vocabulary.** A new analyzer, descriptor, control, theme, payoff or setup kind is engine work
  (§ 4). Propose it in an issue first.
- **Changing a shipped quest** is the owner's call, and may strand saved runs.

## 11. The pull request

Your pull request should contain:

- the one-line change to `js/quest-engine.js` made by `tools/quest-catalog.mjs write` — not
  `my-quest.json`;
- your quest's name added to `README.md` § Current status, "Quests shipped";
- in the description: the issue it answers, what the quest asks for in two lines, the commands you ran
  (`check`, the syntax check, the tests) and what you saw when you played it through (§ 8).

Only the owner merges, and merging deploys the game. See `AGENTS.md` for the project's rules.
