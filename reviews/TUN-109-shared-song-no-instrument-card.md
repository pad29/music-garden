# TUN-109 — Open a shared song without introducing an instrument the song doesn't use

Branch `ao/shared-song-open/root` · PR #(pending) · Size **S** (label and `## Size` agree)

## Plan (Claude)

**Where the card really comes from.** The ticket points at boot's `renderLevel()`, but `renderLevel`
never calls `applyRegionInstrument`. Both link handlers in `js/boot.js` open the Studio — `#s=` through
`openStudioWith(s)`, `#song=` through `openStudio()` — and `openStudio` calls
`applyRegionInstrument("studio")`, the Studio's gift of the **guitar** (`REGION_INSTR.studio`). For anyone
who has not found the guitar yet — every first-time visitor — that unlocks it, saves, and raises its card.
Same fix, one level down.

**Approach.**
- `applyRegionInstrument(reg, discover=true)` in `js/playback.js`: with `discover===false` it only sets
  the region's voice — no unlock, no save, no card.
- `js/home.js`: `openStudio()` and a new `openSharedStudio()` share one body (`enterStudio(discover)`);
  `openStudioWith(song, shared)` opens with `openSharedStudio` when `shared===true`. `openStudio` keeps
  its no-argument signature, because `mkBtn("▶ Open Studio", openStudio)` hands it a click event.
- `js/boot.js`: both link handlers use the shared entry. Nothing else in the boot changes.
- The voice a link plays in is unchanged (out of scope): the Studio's default is still set first, then
  `applySong` sets the song's own voice when it has one.
- Narration: with no card, `closeInstrCard`'s deferred "level story" never runs, and the Studio level has
  no `intro`, so `renderStage` narrates nothing over the Studio.
- The guitar stays undiscovered; the visitor's first real **▶ Open Studio** shows its card, once.
- TUN-108 (a link pasted into an open tab) can call the same `openSharedStudio` / `openStudioWith(s,true)`.

**Tests** (`tests/shared-link-instrument.test.mjs`, through the real boot):
1. Fresh load with a `#s=` link: no card, `progress.instruments` unchanged (memory and storage), no
   instrument intro narrated, the song's voice plays.
2. Fresh load with a `#song=` link, `fetch` stubbed per test: same.
3. Returning player (saved progress, no guitar) opens a link: no card, instruments unchanged.
4. After a link, the visitor's first ▶ Open Studio shows the guitar card once; a second entry does not.
5. Fresh load with no link, entering the first region and the Studio: the cards still appear, once.

## Owner's decisions

None needed: not `needs-owner`, no open question. The ticket's *Decisions already made* bound the work.

## PR review (`gpt-6.2-astra`, through `ask.sh`) — round 1, on `a1b35ab`

<details><summary>GPT's review, verbatim</summary>

**CHANGES REQUESTED** on `a1b35ab`.

### 1. Required changes

- **Medium** — Qualify the TUN-108 handoff. If a tab has a sign-in pending, `enterStudio()` returns early, but `openStudioWith(song, true)` still applies the song to the current field and clears its undo history. The current boot handlers avoid this case. Document that a future paste handler must honor refused entry, or make the helper stop when entry fails. [js/home.js:84] · [review plan:26]
- **Low** — Remove the stray `</content>` and `</invoke>` lines. They are committed as part of the ticket's review record. [review plan:35]

### 2. Missing tests

- **Undiscovered author voice.** Both link fixtures use `musicbox`, which every fresh profile owns. A regression that substitutes music box for every locked author voice would pass. Open a harp song through each link type and assert that harp is selected, its picker option remains hidden, memory and storage contain exactly `["musicbox"]`, and both narration recorders stay empty. [tests/shared-link-instrument.test.mjs:11]
- **Ordinary song-bearing Studio entry.** On a fresh profile, load a saved melody through `loadSong(song)`, then load it again after dismissing the card. Assert one guitar card total and a persisted guitar discovery. The existing normal-entry tests call `openStudio()` directly, so they would pass if `openStudioWith(song)` accidentally made every saved melody a quiet entry. [js/save-share.js:181]

Both boot link paths skip discovery. The first-load gate bypasses `enterPlay()`, the Studio has no intro, and neither path schedules the card-close narration. Boot **does** save package progress before opening the link, including any guitar already owed by legacy migration. I found no link-specific guitar grant or duplicate card. The no-link kalimba case is a valid first-discovery check.

Syntax and all seven new tests passed. I did not run the full suite. The private-window phone and desktop playback checks remain pending.

</details>

### My answers

1. **Medium, TUN-108 handoff — agreed, fixed.** `enterStudio` now returns whether the Studio opened, and
   `openStudioWith(song, true)` returns `false` without touching the field or its undo history when a
   pending sign-in refuses the entry. New test: *a shared song whose Studio entry is refused mid-sign-in
   lands nowhere*. The ordinary callers (`loadSong`, the finale's "Keep building", the quest finale)
   already apply a song when the entry is refused — that predates this ticket, so it is filed to Backlog
   rather than changed here.
2. **Low, stray lines — agreed, removed.**
3. **Missing test, undiscovered author voice — added** (harp, both link types).
4. **Missing test, ordinary song-bearing entry — added** (`loadSong` twice).

Mutation checks: dropping the refused-entry guard fails test 1's case; making every `openStudioWith`
quiet fails the `loadSong` case. The "boot saves package progress, including a guitar owed by legacy
migration" note is existing behaviour (`ensureInstruments` grandfathers a `pluck` voice), not a link grant.

One round, as tonight's brief allows (no High or Blocker); no second GPT round.
