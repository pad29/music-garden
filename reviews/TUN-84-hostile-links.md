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

**Test link for the owner's playtest** — a 1,912-column song, eight columns short of `MAX_COLS`; append to
the preview's address: `index.html#s=WzMsInBlbnRhdG9uaWMiLDE5MTIsMTA4LDAsIiIsW1s3MiwwXSxbNzQsMTkxMV1dLFtdXQ`

## PR review — round 1 (Astra, `ask.sh`): not run, usage limit

Prompt written for head `98333ac` (ticket verbatim, diff against `origin/main` ba365ee, this record). The
GPT lock was taken and released. `ask.sh` stopped at the ChatGPT limit: *"ask.sh: usage limit — try again
at Nov 14th, 2026 1:59 AM (codex exit 1)"* — 2026-11-13 11:51 PM Central. No retry (`CLAUDE.md` § When
something external breaks); review rounds used: 0 of 3.

## PR review — round 1 (Astra, `ask.sh`), head `d439426`: CHANGES REQUESTED

Run 2026-11-14 by session `music-garden-25`, which took the PR over from `music-garden-24` after the owner
answered 1A; fresh thread, read-only, ticket verbatim, diff against `origin/main` ba365ee. Usage: in 1,058,024
(cached 952,448), out 7,889. Review rounds used: **1 of 3**. GPT's review, verbatim (only its absolute
file links shortened to repo paths):

> 1. **Major — Numeric coercion can still abort boot and leave inconsistent song state.** [js/save-share.js:38](js/save-share.js:38), also lines 52 and 67.
>
>    `Number()` can throw on JSON values; the subsequent finite check does not protect it. I reproduced failures through real `#s=` boot with `{"toString":0}` as columns or tempo. The same value as note length also throws. A 5,000-level nested array produces `RangeError`.
>
>    For tempo, packed input `[3,"pentatonic",32,{"toString":0},0,"",[[60,20]],[]]` leaves `COLS=32`, a 16-column grid, and a document note at column 20 before aborting boot.
>
>    **Required:** validate supported primitive types before coercion and normalize the complete input before mutating live state. Malformed fields must fall back safely without throwing or leaving a partial load.
>
> 2. **Major — An inherited palette name bypasses the gate and corrupts global palette state.** [js/save-share.js:42](js/save-share.js:42), through [js/palettes.js:25](js/palettes.js:25).
>
>    Packed input `[3,"__proto__",16,108,0,"",[[60,0]],[]]` decodes successfully. `PALETTES[id]` accepts the inherited property, then `setPalette` assigns undefined to `paletteId` and `MIDI` before throwing. `"constructor"` also reproduces this. These are short links that abort boot despite the new hardening.
>
>    **Required:** require a string naming an own property of `PALETTES`, otherwise use the documented fallback. Perform that validation before calling `setPalette`.
>
> 3. **Major — The output cap does not bound input processing.** [js/save-share.js:125](js/save-share.js:125), with expansion at line 120 and scanning at lines 49–58.
>
>    Incoming links have no size limit before base64 decoding and JSON parsing. `unpackSong` allocates an object for every supplied note and hit before the cap runs. Duplicate or invalid notes can require scanning the entire input; drum hits always do. Large unused strings also pass through decoding unchecked. `SHARE_MAX` protects outgoing links only.
>
>    The performance test starts its stopwatch **after decoding** and uses a stub DOM, so it establishes neither bounded ingestion nor acceptable browser rendering.
>
>    **Required:** impose a documented incoming payload limit before decoding, bound raw collection processing, and handle oversized input with a friendly outcome. Preserve legitimate generated links.
>
> **Missing tests**
>
> - **Malformed numeric fields:** load the object and nested-array inputs above through actual `#s=` boot and a resolved `#song=` response. Expect no exception, completed boot, and consistent document/grid dimensions. Catches unchecked coercion and mutation before validation.
> - **Palette inheritance:** exercise `"__proto__"`, `"constructor"`, `"toString"`, and `["__proto__"]`. Expect the fallback palette and a usable editor. Catches ordinary property lookup replacing an own-property/type check.
> - **Complete ingestion budget:** test the incoming limit and one character above it; include oversized duplicate-note, drum-only, and unused-string payloads. Expect rejection before decoding/expansion. Catches removal or late placement of the input limit. Also verify the supported 100,000-note case and dense maximum-width vines in a real browser, including decoding and rendering.
> - **Reset boot ordering:** seed distinctive settings and a valid quest draft, then boot with reset accepted and declined. Expect defaults and no restored draft after acceptance; preserved settings and draft after cancellation. Catches moving `resetFromUrl()` below settings restoration or quest hydration.
>
> Syntax checking and all 27 targeted hostile-link/load-gate tests passed. The full suite encountered temporary-file permission failures under the read-only sandbox. No files were changed; browser performance remains unverified.
>
> **CHANGES REQUESTED**

### Claude's answers

1. **Agree (Major).** Reproduced by reading: `Number({toString:0})` throws, and `songCols`, the note
   length, the tempo (inside the `tx`, after the notes were written) and `validMeter`'s origin all called
   it on raw values. Fixed with `num()` (`js/save-share.js`): a number stays a number, a string goes
   through `Number()`, anything else is `NaN`, which every caller already reads as "not given". And
   `applySong` now reads and normalises the whole song — palette, columns, notes, hits, groove, tempo,
   meter, voice — **before** it changes anything: `setPalette`, `COLS` and the `tx` come after. Found
   beside it and fixed too: `setVoice(mel.voice)` hands an object to a `<select>`, which stringifies it
   and throws the same way; only a string voice now reaches it.
2. **Agree (Major).** `PALETTES["__proto__"]` is `Object.prototype`. Fixed where the lookup lives, not only
   in `applySong`: `paletteDef(id)` in `js/palettes.js` accepts only `PALETTES`' own string keys, as
   `meterDef` already does, and `setPalette` and `restoreSnapshot` use it. (`songEvidence` in
   `js/quest-engine.js` already checked own keys.)
3. **Agree, in part (Major).** Agreed and fixed: an incoming `#s=` ceiling, `SHARE_IN_MAX = 4 × SHARE_MAX`
   (7,200 characters), checked in `decodeSong` **before** `atob` — `shareSong` is the only writer of `#s=`
   links and never writes one past `SHARE_MAX`, which has been 1,800 since the code moved into `js/`; a
   refused or unreadable link now says so ("⚠️ That song link didn't work…") instead of failing
   silently. And `applySong` reads at most `ROWS × COLS` raw notes and `DRUMS × COLS` raw hits — a song
   the Studio wrote has no repeats or junk, so this costs it nothing — and reports the rest as cut.
   **Disagreed:** "impose a documented incoming payload limit before decoding" cannot cover `#song=`:
   `cloudSongGet` gets the row through `fetch(...).json()`, parsed before any game code sees it. Bounding
   a cloud row's size belongs to the server validation the ticket puts out of scope (its own ticket); on
   the client, the raw-entry budget bounds what is processed after the parse. GPT's "the performance test
   … uses a stub DOM": true, and the harness says so (`tests/harness.mjs` cannot render). The 100,000-note
   case is now a refusal before decoding as a link (Node test); as a save or cloud row it goes through the
   budgeted gate (Node test, timed).

**Missing tests — all four added** (`tests/hostile-links.test.mjs`, "TUN-84 review: …"), through the real
boot where GPT asked for it. The harness gains a `setup(window)` option (`tests/harness.mjs`, documented
in `tests/README.md`), run before any script, so a test boots `js/boot.js` with a URL, a saved profile,
an answer to `confirm`, or a `fetch` for the cloud songs API only.

- Malformed numbers: `{"toString":0}` as columns, tempo and note length through `#s=` boot; a
  5,000-deep array as columns, tempo and length, and an object origin and voice, through a `#song=`
  response. Each boots, the field is rows × `COLS` with every note inside it, and the tempo stays put.
- Palette inheritance: `"__proto__"`, `"constructor"`, `"toString"`, `"hasOwnProperty"`, `["__proto__"]`,
  an object and `null` load as pentatonic from a diatonic field; one through `#s=` boot.
- Ingestion: a link of exactly `SHARE_IN_MAX` opens; one two past it, and over-long duplicate-note,
  drums-only and unused-string links, are refused with `atob` never called; an over-long link through the
  boot shows the toast and loads nothing; `applySong` touches no more raw entries than could load.
- Reset order: a profile with a saved tempo and a valid quest draft, booted with `?reset` accepted
  (defaults, no draft) and declined (tempo and draft kept).
- Added beyond GPT's list: only a string voice reaches `setVoice` (the harness's stub `<select>` never
  stringifies, so the call is pinned instead).

**Mutation audit** (each applied alone, the file run, the source restored): `num` → `Number`; the
inherited `PALETTES[id]` lookup; no `SHARE_IN_MAX` check; the ceiling at 40 × `SHARE_MAX`; the failed-link
toast removed; no note budget; no hit budget; an unchecked voice; `resetFromUrl()` moved below the saved
settings — **9 of 9 fail a named test**. The no-ceiling mutation first crashed the file (out of memory
printing a diff of a 100,000-note song); both refusal assertions are now plain booleans, and it fails
two named tests.

**Browser** (AO's, this worktree, the four changed `js/` files compared byte for byte; a fresh load per
link): a `#s=` link with tempo `{"toString":0}` opens the Studio 32 columns wide, tempo unchanged, no page
errors; a `"__proto__"` palette with an object voice opens pentatonic (64 fewer cells than the same field
diatonic), no errors; an ordinary diatonic link at tempo 120 opens as before; a 7,300-character link
leaves the player on the intro level, no errors (the toast is too brief to snapshot — the Node test pins
it). **Not verified:** a dense 10 × 1,920 field rendering in a browser — it can no longer arrive as a
link (far past `SHARE_IN_MAX`), AO's browser cannot run page code to load one from a save, and the Studio
would need ~19,000 plantings.

Suite after the fixes: 705/705 (eight new tests), syntax check clean.

## Owner's decisions

1. Run GPT's PR review round 1 after the 1:59 AM reset? **1A — yes** (the owner, relayed by the
   orchestrator in session `music-garden-25`'s spawn prompt, 2026-11-14). Run on head `d439426`, the
   current head (only this record had changed since `98333ac`).
2. **Open:** run GPT's PR review round 2 on the fixes (`3f9ecff` and this record), as the delta since
   `d439426` with round 1's findings quoted? Session `music-garden-25` was scoped to one round, so it stops
   here. (Recommended: yes — the fixes are unreviewed, and only GPT's approval on the current head hands
   the PR to In Review. Rounds left: 2 of 3.)
