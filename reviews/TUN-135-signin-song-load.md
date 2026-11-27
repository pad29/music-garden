# TUN-135 — Don't load a song into the level on screen while a sign-in is still out

Branch `ao/signin-song-load/root` · PR #(pending) · Size **S** (label and `## Size` agree)

## Plan (Claude)

**Approach.** One guard where the song lands, and a check in each caller before it closes what the player
is looking at.

- `js/home.js`: `openStudioWith(song, shared)` enters through `openSharedStudio()` (shared) or
  `enterStudio(true)` (the rest) and returns `false`, touching nothing, when the entry is refused — the
  rule TUN-109 gave the shared path, now for every caller. `openStudio` keeps its no-argument signature.
- A new `studioWaitsForSignIn()`: while `authBusy`, it toasts *"☁️ Still signing in. Try again in a
  moment."* and answers `true`. `openStudioWith`'s `false` can't tell a refusal from "nothing was cut", and
  the callers must not hide their list or card before they know, so they ask this first:
  - `loadSong` (`js/save-share.js`, a saved melody, the rescued sprout and the cloud list's ▶ Load after
    its fetch): returns `null` and leaves the Jukebox open — the ticket's trap, no list, no song, no word.
  - `playSong` (the Jukebox's ▶ Play): also goes through `loadSong`, then `start()`s and says *Now
    playing*. Not named in the ticket, but the same caller one step out: on `null` it returns.
  - `congratsStudio` (`js/level-engine.js`): the congratulations card stays up.
  - `finStudio` (`js/quest-shell.js`): the finale stays up and its typed name is not committed yet.
- Messages: the toast is the only word. No caller claims "Loaded into the Studio" or "Now playing".

**Tests** (`tests/signin-song-load.test.mjs`): for each caller, with `authBusy` set — the level's tracks
unchanged, `journalClear` never called and ↶ Undo still enabled, the Studio shut, the list or card still
up, one toast, no claim; then with it cleared, the Studio opens with the song, undo starts fresh, the list
or card closes. Plus `openStudioWith` itself mid-sign-in. The quest fixtures (`launch` / `compare` /
`completed` in `tests/helpers/quest-e6-fixtures.mjs`) take optional load options, so a test can catch
`finStudio`'s handler.

## Which paths a player can reach mid-sign-in

All overlays share z-index 70, so DOM order decides which is on top: Home comes last and covers the
Jukebox, the congratulations card and the quest finale; the landing screen comes first, under all of them.

- **Home's sign-in form.** While it is out, Home can't be closed (TUN-93) and covers everything, so no
  click reaches a caller. **The keyboard does:** Home doesn't make the page inert (only the garden card
  does), so Tab reaches the ☰ menu's toggle under Home's overlay, then its 🎵 Jukebox; Enter opens the
  Jukebox *behind* Home, and Tab and Enter reach its ▶ Load and ▶ Play — `loadSong` and `playSong`,
  unseen. Reachable, blind.
- **The cloud list's ▶ Load** awaits `cloudSongGet` before it calls `loadSong`. A player who presses it,
  closes the Jukebox, opens Home, signs out and starts a sign-in before the fetch returns gets the song
  landing mid-sign-in. Reachable on a slow network, not by hand in practice.
- **The landing screen's form** shows only on a fresh visitor's first load, with nothing else open.
  Nothing is reachable from it.
- **The congratulations card (✨ Keep building) and the quest finale:** not reachable. Each appears only on
  entering a level or offering a quest's song, both refused mid-sign-in; the one draw a sign-in makes
  itself — its cloud load's `renderLevel` — finishes and releases `authBusy` in the same task, before any
  click can run. The guard covers them anyway, as the ticket asks.

## PR review

(pending)

## Tests

- `tests/signin-song-load.test.mjs` — 5 tests. Mutation check by hand: removing each caller's check, or
  restoring the old `openStudioWith`, fails exactly that caller's test.
- `tests/famous-meter-mutations.mjs` (optional audit): its `loadSong`, `playSong` and `openStudioWith`
  anchors follow the new code, and one anchor TUN-84 had already left stale (`time.origin=meter[1]`) is
  updated; the audit runs green again.
- Unverified by hand: the sign-in window is about a second and works only on production, so the
  mid-sign-in paths are covered by the tests above, not a playtest.
