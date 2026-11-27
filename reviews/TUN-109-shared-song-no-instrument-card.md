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
</content>
</invoke>
