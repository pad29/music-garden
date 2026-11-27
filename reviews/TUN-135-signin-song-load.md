# TUN-135 — Don't load a song into the level on screen while a sign-in is still out

Branch `ao/signin-song-load/root` · PR #194 · Size **S** (label and `## Size` agree)

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

My first analysis (on `abca131`) said only the Jukebox was reachable and the landing screen and both finales
were not. GPT's PR review showed that wrong for all three; corrected here. All overlays share z-index 70, so
DOM order decides which is on top: Home comes last; the landing screen comes first, under everything. Home
doesn't make the page inert (only the garden card does), so Tab reaches what lies under it.

- **Jukebox ▶ Load / ▶ Play, during Home's sign-in:** Tab to ☰ under Home, then 🎵 Jukebox; it opens behind
  Home, and Tab and Enter reach its rows. Reachable, blind.
- **Jukebox ▶ Play / ▶ Load, during the landing's sign-in:** ☰ stays in the tab order; the Jukebox opens
  *above* the landing, so a fresh visitor can click ▶ Play (▶ Load needs a saved melody or a rescued sprout).
  Reachable, visible.
- **The cloud list's ▶ Load:** it awaits `cloudSongGet`, so a song asked for before a sign-in can return
  during one. Reachable on a slow network.
- **The congratulations card's 🎵 Studio:** opening Home from the ☰ menu leaves the card displayed under it;
  during Home's sign-in, Tab reaches its Studio button. Reachable, blind.
- **The quest finale's Studio button:** with an Offer enabled, Home can be opened over the quest; during its
  sign-in, Offer activated by keyboard behind Home opens the finale (GPT checked this in its VM), and its
  Studio button is then reachable. Reachable, blind.

None of these can be staged by hand: the sign-in is out for about a second, and works only on production.
The tests below cover each.

## PR review

### Round 1 (`gpt-6.2-astra`, `ask.sh`, on `abca131`) — changes requested

<details><summary>GPT's findings, verbatim</summary>

1. **High — Make the refusal visible.** `studioWaitsForSignIn()` sends the only explanation to `.toast` at `z-index:60`. Home, the Jukebox, and both finales sit at `70`, so an opaque card can cover the message. This matters most when a cloud Load returns after the player has closed the list. Show the reason above the active overlay or inside it. Add a browser check with a sign-in held pending and assert the message is visible while the overlay stays open. The current toast spy passes even when the card hides every word. [Toast styling](index.html:396) · [Refusal handler](js/home.js:95)
2. **Medium — Correct the landing-screen reachability finding.** The review correctly identifies Home’s blind keyboard route to Menu → Jukebox. The landing form also leaves the menu toggle in the tab order. Pressing Enter on Jukebox opens it **above** landing, so a fresh visitor can then **click Play**. Load is available if a saved melody or rescued sprout exists, including after a progress reset that preserved melodies. Add this case using the landing form, native keyboard navigation to Jukebox, and a pointer click on Play. Assert the list stays visible, playback stays stopped, and the level and undo history survive. [Overlay order](index.html:889) · [Menu handlers](js/cursor.js:137) · [Jukebox rows](js/save-share.js:205)
3. **Medium — Correct both finale findings.** For a **package**, leave congratulations open and use the keyboard menu to open Home. `openHome()` leaves congratulations displayed underneath. Start sign-in, then Tab to its Studio button and press Enter. For a **quest**, open Home with an enabled Offer. `leaveQuest()` hides the finale and stops playback but retains the active quest. During sign-in, keyboard-activate Offer behind Home, then activate the newly displayed finale’s Studio button. I verified in the VM that Offer succeeds and the finale opens with Home visible and `authBusy=1`. Add these setups to the reachability checks. The existing tests start with the cards already displayed. [Home entry](js/home.js:20) · [Quest exit](js/quest-shell.js:402) · [Offer handler](js/quest-run.js:492)
4. **Medium — Test the cloud Load across its actual `await`.** Click a rendered cloud row with `authBusy=0` and `cloudSongGet` held on a deferred promise. Close the list, start a sign-in, then resolve the song. Assert Home stays open, the refusal is visible, the tracks and undo history survive, and no loaded status appears. Finish sign-in and verify that only a **fresh** Load opens the song. Calling `loadSong()` directly with `authBusy` already set misses this ordering. [Cloud row callback](js/save-share.js:241) · [Current Load test](tests/signin-song-load.test.mjs:49)

Reviewed `abca131a013ad5b38a85adcd6f5b880d536aa28e`. Syntax and all 15 focused tests passed. Browser access was unavailable, so the keyboard routes and toast visibility were traced from the DOM, CSS, and handlers.

</details>

My answers:

1. **High, the refusal hidden under the overlays — agreed.** `.toast` is z-index 60 and every overlay 70.
   `toast(msg, above)` now sets an `above` class on its element (z-index 75: over the overlays, under a map
   tip at 80 and the garden card at 90), and only the refusal asks for it; every other toast is unchanged.
   Not done: a browser check with a sign-in held pending — AO's browser can't run page code to hold one,
   and sign-in works only on production. Instead the tests assert the refusal is raised, and that
   `.toast.above` stacks over `.overlay` in `index.html`.
2. **Medium, the landing screen is reachable — agreed**; the analysis above is corrected. The ▶ Play test
   now runs during the landing's own sign-in (the real `signInWith`, with no form).
3. **Medium, both finales are reachable — agreed**; corrected above. Their tests now run during Home's real
   sign-in. They still start with the card already up: how it got there (a keyboard route under Home)
   doesn't reach the code under test.
4. **Medium, the cloud Load across its `await` — agreed, added:** the row is pressed with no sign-in out,
   the list closed, Home opened and a sign-in started, then the fetch returns. Nothing lands, Home stays up,
   nothing claims a load; after the sign-in a fresh Load opens the song.

Every test now holds a real `signInWith` pending, so `authBusy` comes from production's own count. A second
GPT round needs the owner's yes (one round today).

## Tests

- `tests/signin-song-load.test.mjs` — 7 tests. Mutation check by hand: removing each caller's check,
  restoring the old `openStudioWith`, leaving the refusal's toast unraised, raising every toast, or putting
  `.toast.above` under the overlays each fails its own test.
- `tests/famous-meter-mutations.mjs` (optional audit): its `loadSong`, `playSong` and `openStudioWith`
  anchors follow the new code, and one anchor TUN-84 had already left stale (`time.origin=meter[1]`) is
  updated; the audit runs green again.
- Unverified by hand: the sign-in window is about a second and works only on production, so the
  mid-sign-in paths are covered by the tests above, not a playtest.
