# TUN-84 — Make hostile links harmless

Branch `ao/tun-84-ticket/root` · Size S · session `music-garden-24`

## Plan (Claude)

Measured on `origin/main` ba365ee, in AO's browser through `#s=` links: loading a song costs about
0.2 ms a column, linearly — 480 to 4,800 columns all load in under 2 s (panel overhead included),
19,200 in about 4 s, 48,000 in about 10 s. So a link claiming a million columns freezes the tab. In Node,
`applySong` takes 100,000 notes in about 0.25 s, but keeps all of them, and every held note becomes its
own stem `<div>` in `renderVines`.

1. **One gate in `applySong`** (`js/save-share.js`) — every path a song arrives by runs through it:
   `#s=`, `#song=`, My Melodies, the rescued sprout, cloud rows, quest drafts. It **clamps, never
   refuses**: the columns to `[16, MAX_COLS]`; the tempo, when it is a finite number, to the slider's
   own range (anything else leaves the tempo alone); notes to whole MIDI pitches 0–127 at whole
   in-range columns, one per (pitch, column), each held 1–`MAX_VINE` columns, and at most `ROWS × COLS`
   of them — one per seed the song's own field can show; drum hits to whole lanes at whole columns, one
   per cell. Clamping matches `validMeter`'s rule (a link we cannot trust degrades, it does not fail):
   the playable start of a long song survives, and a header we cannot trust costs nothing. Refusing
   would throw away a whole song over one bad number. `applySong` returns `true` when it left part of
   a song behind (columns past the maximum, or notes past the cap), and the loading paths add one
   sentence to their status line saying only the beginning came along.
   - **`MAX_COLS = 1920`** (`js/doc-model.js`): 240 bars of 4/4 (a column is an eighth), about nine
     minutes at 108; loads in about half a second. A multiple of 48, so every meter's bar (4, 6 or 8
     columns) and the unmetered 16 divide it. The longest built-in tune is 102 columns.
   - **The Studio stops at the same line**, so a song a player built always loads back whole: ＋ more
     (`addColumns`) and ＋ room (`colPlus`) refuse past `MAX_COLS` with a line in the game's voice, as
     － room already does at 16.
2. **`?reset` asks first** (`js/boot.js`): a native `confirm()` — the boot sequence is synchronous and the
   wipe must happen before the saved settings are read — naming what goes (name, every package's
   progress, instruments and friends found, settings, quest drafts and history) and what stays (saved
   melodies). Either answer then drops `reset` from the address bar (`history.replaceState`), so a
   reload neither asks again nor wipes again. Moved into a function, `resetFromUrl()`, so a test can
   drive it.
3. **Titles are text**: `escapeHtml()` beside `setStatus` in `js/helpers.js`; `playSong` escapes the title
   inside its `<b>`. The My Melodies and cloud rows already use `textContent`.

**Tests** (`tests/hostile-links.test.mjs`, each naming its mutation): absurd columns (huge, negative,
non-numeric, fractional, `Infinity`) and tempo; a `#s=` link of 100,000 notes decodes and loads within a
time bound, collapsed to at most `ROWS × COLS`; the Studio's growth stops at `MAX_COLS`; `?reset`
declined keeps everything, accepted wipes, both strip the URL; a title `<img src=x onerror=…>` through
`playSong`, a My Melodies row and its Load, and a cloud row and its Load creates no element — the
harness gains an `elements` option so the test records the real `#status` and `#mlist` writes.

**Out:** server validation, the title word check, security headers (their own tickets). TUN-8 is still
in Backlog, so nothing to deduplicate against yet.

**Built as planned**, with one addition: the load-gate continuation sandbox
(`tests/load-gate-continuation-review.test.mjs`) now answers `?reset`'s question with yes. Its `?reset`
loads exist to catch a boot that wrongly runs by its writes, and the harness's `confirm` says no.

## Tests

`tests/hostile-links.test.mjs`, 15 tests. Every named mutation was applied and failed its test (17 of
17, after relabelling the round-trip test: shrinking `MAX_COLS` is caught by the `songCols` test's
`MAX_COLS === 1920`, while the round-trip test catches an off-by-one at the ceiling — both checked).
Suite 697/697, syntax check clean.

**Browser** (AO's, this worktree, served files compared byte for byte): a `#s=` link claiming 10⁹ columns
and tempo `"abc"` opens in about 2.3 s (panel overhead included), 1920 columns wide, with the status line
"…It was longer than a garden can grow, so only its beginning came along." and the tempo unchanged; no
errors. `?dev&reset` loads to `?dev` alone, while `?dev&foo` keeps `foo`. The Jukebox's *Mary Had a
Little Lamb* shows its title bold in the status line, its vines and 4/4 bars intact.

**Not verified:** the `?reset` question's text on screen — AO's panel answers dialogs itself and does
not show them; the Node tests pin its wording and both answers. ＋ patch / ＋ room refusing at 1920 in
the browser — AO's snapshot and click tools fail on a page that wide (no page errors); the Node tests
cover `addColumns`, and `colPlus` by reading its handler. Rendering a full 14 × 1920 field of vines, or
the 100,000-note link, in the browser — the URLs are too long to pass to AO's browser, and a second local
server to redirect from was not allowed; in Node the gate takes the 100,000 notes to at most `ROWS × COLS`
in well under a second.
