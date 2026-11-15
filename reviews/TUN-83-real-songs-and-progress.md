# TUN-83 — Accept only real songs and real progress in the API

Branch `ao/tun-83/root` · Size **M** (label and `## Size` agree) · phase 1 (TUN-77)

## Plan (Claude)

### What I measured first (the real client, through `tests/harness.mjs`)

- **No Jukebox tune is ever stored in the cloud.** The biggest, `chopsticks`, is 2,430 bytes of v3 JSON
  and packs to a 1,240-character link, under `SHARE_MAX` (1,800). Every one shares as `#s=`. So the
  cloud only ever holds Studio-made songs bigger than a link — from `currentSong()`, or a My Melodies
  save (which may be a quest's saved song).
- **A song costs about 23 bytes per note or hit** (`{"p":72,"c":100,"len":1},`). A 16 KB song holds
  about 700 of them: a melody note in every column for 88 bars of 4/4, about three minutes at 108 BPM.
  One note and one hit in every column of a full 1,920-column field is 86 KB.
- **`meta` carries more than `SAVE-SHARE.md` § 3 lists.** The client writes `title`, `created`,
  `updated`, `author` (`currentSong`: `null`; `famousToSong`: `"Tune Garden"`), `famous` (a FAMOUS id),
  `localId` and `source` (`{kind:"quest", runId, questId, definitionVersion}`, `questArtifactUpsert`),
  and `cloudId`. A quest's saved song reaches `POST /songs` when the player shares it from My Melodies.
- **Progress:** the keys any client version has written (git history of `js/` and `index.html`) are
  `v`, `name`, `current`, `packages`, `settings`, `updatedAt`, `instruments`, `metRegions`,
  `companion`, `colors`, and the retired root `toolbox`. A package entry is `level`, `maxLevel`, `done`,
  `completed`, `toolbox`; a tool is `{offs, midis}`, two or three seeds (`craftFromCells`), at most ~91
  distinct per package. `settings` is `voice`, `tempo`, `mix {voice, band, drums}` (0–2), `speak`,
  `click` (`off | in | both`). A played-through progress with all 21 packages and 8 tools in each is
  9.1 KB; a realistic one (tools only in the crafting packages) is well under 8 KB.
- **The client never calls `PUT /songs/{id}`** (`js/cloud.js` has create, get, list, delete).
- **On sign-in the cloud copy replaces local progress** (`onSignedIn`: `progress=cloud`). A refused
  progress write therefore freezes the cloud copy, and the next sign-in elsewhere brings the frozen
  copy back over newer play. The validator must accept everything every client version writes; a
  false refusal is data loss, not just a failed save.
- **A bug the caps must fix:** `POST /songs` counts the owner's songs with one `Select: COUNT` query,
  which stops at 1 MB of read data. With 100 KB songs it counts at most ~10, so `MAX_PER_USER` = 200
  is never reached and an account can store without limit.

### Approach

1. **`backend/src/validate.mjs` — the one place on the server that knows the formats.** Pure, no
   imports. `checkSong(raw)` and `checkProgress(raw)` return `{ ok: true, value }` with a **rebuilt**
   object — only the fields named below, copied in the client's key order — or `{ ok: false, error }`
   with a fixed code. Nothing from the input is stored except what the rebuild copies. Also exports
   the caps and `sanitizeTitle` (moved here unchanged).
2. **Handlers split from the SDK for testing.** `songs-api.mjs` and `progress-api.mjs` export
   `makeHandler(db)`, where `db` is `{ get, put, query, del }` over plain DynamoDB parameter objects.
   `songs.mjs` and `progress.mjs` keep their names and `handler` export (the template is unchanged) and
   only wire the AWS SDK into `makeHandler`. Tests drive the real handlers with an in-memory `db`.
3. **Every write route:** if `isBase64Encoded`, decode; refuse a body over its byte cap (UTF-8, by
   `Buffer.byteLength`) with 413 **before** `JSON.parse`; a body that does not parse is 400
   `bad json`; a body that fails the validator is 400 with its fixed code. The catch-all is 500
   `{ error: "server error" }`, with the exception logged to CloudWatch (`console.error`) — never in
   the response.

### The song rules (`checkSong`)

Unknown keys are refused at every level. Numbers are JSON numbers, never strings.

| Field | Rule |
|---|---|
| top level | keys ⊆ `v, meta, palette, time, tracks`; `v` = 3; `palette`, `time`, `tracks` required |
| `meta` | optional object, keys ⊆ `title, created, updated, author, famous, localId, source, cloudId`; each a string, number, `null` or (for `source`) a flat object of those, under 200 chars a string. **None is stored**: the rebuilt meta is `{ title, created, updated }` with `title` = the stored title (or `null`) and the times copied when they are finite numbers |
| `palette` | `pentatonic` or `diatonic` |
| `time` | keys ⊆ `cols, tempo, groove, meter, origin`; `cols` integer 16–1,920 (`MAX_COLS`); `tempo` number 40–180 (the slider); `groove` integer 0–6 (`GROOVES`); `meter` one of `4/4, 3/4, 6/8, 2/4`, `origin` integer 0 ≤ origin < the bar's columns, both or neither (`origin` alone refused) |
| `tracks` | array of 1–2, kinds `melody` and `drums`, each at most once |
| melody | keys ⊆ `kind, voice, notes`; `voice` one of the eight `#instr` voices, or `""` (`packSong`'s fallback); `notes` array of ≤ 1,000 |
| note | keys ⊆ `p, c, len`; `p` integer 0–127; `c` integer 0 ≤ c < cols; `len` integer 1–8 (`MAX_VINE`) |
| drums | keys ⊆ `kind, hits`; `hits` array of ≤ 1,000 |
| hit | keys ⊆ `lane, c`; `lane` integer 0–2 (`DRUMS`); `c` integer 0 ≤ c < cols |
| size | the rebuilt song ≤ **16 KB** (16,384 bytes, UTF-8); the request body ≤ 17 KB |

1,000 notes or hits cannot fit in 16 KB anyway; the counts are checked first so a stuffed body fails
on a cheap test. Duplicates (same pitch and column) are not refused: `applySong` drops them on load,
and refusing them would add a rule the client never needed.

**Title:** `sanitizeTitle(body.title ?? meta.title)`, unchanged (control characters stripped, trimmed,
60 UTF-16 units). The stored `meta.title` is set to it, so the payload never carries a second title.

**Request body (`POST`, `PUT`):** keys ⊆ `song, title, visibility`; `title` a string or `null`;
`visibility` one of `unlisted, private, public` or absent, and ignored as today (always `unlisted`).

**`PUT /songs/{id}`:** `song` absent means a rename — the stored payload is put through `checkSong`
too, so an old row that fails it cannot be renamed (400) but is never altered. Unused by the client.

**Caps:** `MAX_SONG_BYTES` 100 KB → **16 KB**; `MAX_PER_USER` 200 → **50**. The count query pages
through `LastEvaluatedKey` until it reaches 50 or runs out, so the cap holds for old accounts with big
rows too. **Per-account storage ceiling: 50 × 16 KB = 800 KB of song payload** (stored twice: the
table and the ALL-projection `byOwner` index), so one count query reads at most one 1 MB page.

### The progress rules (`checkProgress`)

Unknown keys are refused, except the retired root `toolbox`, which is dropped (a pre-June-2026 local
progress can still carry it on a sign-up push, which does not go through `commitProgress`).

| Field | Rule |
|---|---|
| top level | an object; `v` = 1 and `packages` required; the rest optional |
| `name` | string ≤ 20 UTF-16 units (`#pname` `maxlength`), control characters refused |
| `current` | a slug: `^[a-z0-9]+(-[a-z0-9]+)*$`, ≤ 40 chars |
| `packages` | object of ≤ 64 entries, each key a slug; each value keys ⊆ `level, maxLevel, done, completed, toolbox`; `level`, `maxLevel`, `done` integers 0–200; `completed` boolean; `toolbox` array ≤ 100 of `{ offs, midis }`, each an array of 1–8 integers 0–127 |
| `settings` | keys ⊆ `voice, tempo, mix, speak, click`; `voice` a voice; `tempo` number 40–180; `mix` keys ⊆ `voice, band, drums`, numbers 0–2; `speak` boolean; `click` `off, in, both` |
| `instruments` | array ≤ 8 of voices |
| `metRegions` | array ≤ 32 of slugs |
| `companion` | `{ type }`, one of `sprout, chirpy, twinkle` |
| `colors` | array ≤ 2 of `F`, `B` |
| `updatedAt` | finite number ≥ 0 |
| size | the request body ≤ **8 KB** (8,192 bytes, UTF-8) |

**Why package and region keys are slugs, not a closed list:** packages are added with content, and the
game deploys on every merge while the backend deploys by hand. A closed list would refuse every
progress save from a player who enters a new package until the owner deploys — and the sign-in
overwrite above turns that refusal into lost progress. A slug carries no more than a 40-character
lowercase key in the player's own private row (`GET /progress` is owner-only), never on a public
route. Voices, companions, click modes, palettes, meters and colours stay closed lists, because the
ticket names them so and they change rarely; a drift test ties each to the client.

### Tests (all under `node --test "tests/*.test.mjs"`, nothing to install)

- `tests/backend-validate.test.mjs`
  - **Accepted, from the real client** (`loadGame()`): `currentSong()` on an empty and a planted
    Studio; every `famousToSong(id)` in `FAMOUS`; a quest's saved song (`questArtifactUpsert`'s
    `meta`); a metered song with a pickup (`time.meter`, `origin`); a song with 8-column vines; a song
    unpacked from a `#s=` link (`voice:""` path); a played-through progress (every package entered and
    completed through `savePackageProgress`, tools crafted, settings saved, companion picked, regions
    met, colors set); a fresh guest progress; progress with the legacy root `toolbox`.
  - **Rebuild:** the stored song has no `localId`, `source`, `author`, `famous`, `cloudId`;
    `meta.title` equals the stored title; `applySong` loads the rebuilt song to the same notes.
  - **Refused, each with its code:** an extra string field (top level, `time`, a note, `meta`, a
    progress package); 10,000 notes; a non-numeric pitch (`"72"`); a body over the cap; `v` = 2 or
    `"3"`; also an unknown palette, voice, meter; an origin without a meter or ≥ the bar; `c` ≥ cols;
    `len` 9; a `__proto__` package key; a 9 KB progress; a non-object progress; a 21-char name.
  - **Drift:** the server's voices = `#instr`'s options; palettes = `PALETTES`; meters = `METERS`;
    groove count = `GROOVES.length`; lanes = `DRUMS.length`; `MAX_VINE`, `MAX_COLS`; the tempo range =
    `#tempo`; click modes = `#click`; companions = `COMPANIONS`; every `PACKAGES` and `REGIONS` key is a
    slug and fits the counts.
- `tests/backend-handlers.test.mjs` (in-memory `db`)
  - malformed JSON → 400 `bad json`; oversized → 413 before parse; a validator refusal → 400; a thrown
    `db` error → 500 `server error`, and no response body ever contains the thrown message;
  - `POST` stores the rebuilt song and returns the title; `meta.title` in the payload is overwritten;
  - the count cap: 50 existing (across two pages) → 409; 49 → 200;
  - `GET /songs/{id}` returns an old row that the validator would refuse, unchanged (share links made
    before the deploy keep opening);
  - `PUT` validates; a rename of an invalid old row is refused and the row is untouched;
  - `PUT /progress` stores the rebuilt object; `GET /progress` returns an old oversized row unchanged.

### Docs

`backend/README.md` (a section on what the API accepts, the caps and ceiling, and the rule that a
change to the song or progress format changes `validate.mjs` first and deploys the backend before the
client), `SAVE-SHARE.md` § 3 (the `meta` keys the client really writes) and § 6 (limits),
`tests/README.md` (the backend tests and how they load ES modules), and the README map row for
`backend/src`. **Added to the ticket after the claim** (owner, 2026-11-14, via music-garden-28):
`backend/README.md` § Future deploys lists the change-set rows that are normal even when `src/` is
unchanged — `PreSignUpFn`, `ProgressFn`, `SongsFn` *Modify* / *False* (`sam build` re-zips, new
timestamps, new upload key), `UserPool` *Modify* / *False* (its trigger refers to `PreSignUpFn`'s
ARN), `PreSignUpPermission` *Conditional* (refers to `PreSignUpFn`, which isn't replaced) — and keeps
the stop rule for *True* on `UserPool`, `ProgressTable` or `SongsTable`.

### Deploy order

The client does not change. The new backend accepts everything today's and older cached clients write,
so the owner can deploy it before or after the merge. For **future** format changes the order is
backend first, then the client: an older client never sends the new field, and a newer client against
an older backend would be refused.

### Risks

- A real progress the rules refuse is lost progress (sign-in overwrite). Mitigated by the fixtures from
  the real client and the history of keys; residual risk is a value range I misread.
- A Studio song over 16 KB (≈ 700 notes and hits) can no longer be cloud-shared, and the player sees
  "⚠️ Couldn't reach the cloud — please try again." — misleading. A Backlog ticket for a clear message.
- Rows already stored keep loading (reads are never validated), but a rename of one that fails is
  refused.

### Questions only the owner can answer

None, I believe. The calls I am making and the owner might overrule: the caps (16 KB songs and 8 KB
progress, as the TUN-82 arithmetic assumed; 50 songs per account), slug keys instead of a closed
package list, and dropping rather than refusing `meta`'s ids.

## Design review (Astra)

`ask.sh fresh read-only gpt-6-astra`, 2026-11-14, on the plan above. Usage: in 1,708,258 (cached 1,598,720), out 10,080.

<details><summary>GPT's design review, verbatim</summary>

1. **High — The 8 KiB progress cap rejects legitimate current-client progress.**  
   [Plan:25–26](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-29/reviews/TUN-83-real-songs-and-progress.md:25) already measures a 9.1 KB example, then dismisses it as unrealistic. I reproduced **13,303 bytes** using completed-package state and legal two-/three-seed combinations through the real crafting and persistence functions: 45 tools each in `intro`, `twin-blooms`, and `standing-towers`; 91 each in `twin-blooms-plus` and `two-new-colors`. These are precisely the packages that expose Fuse. See `js/editing.js:157–178` and `js/persistence.js:38–45`.

   Rejection persists on every subsequent save; sign-in can then replace newer local progress with the stale cloud copy (`js/cloud.js:47`). **Change:** measure the reachable maximum, including legacy inventories, and choose a cap with headroom—or introduce a lossless compact format. Do not truncate inventories or make the toolbox global. The earlier cost review explicitly calls 8/16 KB **placeholders**, not immutable requirements (`reviews/TUN-82-throttle-budget-data-protection.md:104`).

2. **High — The voice allowlist breaks legacy progress that today’s client still sends.**  
   [Plan:64 and 99](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-29/reviews/TUN-83-real-songs-and-progress.md:64) permits only current instrument options. Historical clients wrote `"pluck"` and `"pad"`; both appear in `c1c602c^:index.html`. Current `setVoice()` translates/falls back for playback, but does **not** update `progress.settings.voice` (`js/playback.js:10–13`). I seeded `"pluck"`, loaded today’s client, and saved a name: both live and persisted settings still contained `"pluck"`.

   Old local songs also reach `shareSong()` directly, without passing through `applySong()` (`js/save-share.js:227`). Historical time insertion could produce `len > 8` (`1b75d05^:index.html`, `modelInsertTime`), another counterexample to the blanket compatibility claim.

   **Change:** maintain explicit legacy input aliases and documented migration rules, separately from canonical stored values. Test raw legacy progress on sign-up and subsequent commits, and raw legacy My Melodies songs. Do not use “current HTML options equal accepted voices” as the compatibility oracle.

3. **High — Pagination does not enforce the promised 50-song ceiling.**  
   [Plan:83–86](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-29/reviews/TUN-83-real-songs-and-progress.md:83) fixes truncated counting but retains count-then-create. Two requests can both count 49 and both succeed. Additionally, `byOwner` is eventually consistent; pagination cannot make recent writes visible. [AWS documents asynchronous GSI propagation](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/GSI.html).

   There is another quota escape to address during the handler rewrite: `updateSong()` reads an item, then performs an unconditional `Put` (`backend/src/songs.mjs:89–100`). A concurrent delete and replacement create can let that delayed update resurrect an additional song.

   **Change:** use atomic quota enforcement, such as a transactionally maintained owner counter, with correct initialization for existing accounts and idempotent deletion handling. Updates must condition on continued existence and ownership. Add interleaving and stale-index tests. If retaining the simpler paginated query, explicitly call the quota **soft**, not a storage ceiling. Existing oversized/over-quota accounts also remain exceptions; “one page” is not true for them.

4. **Medium — Slugs remain free text, and one accepted slug crashes restoration.**  
   [Plan:97–113](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-29/reviews/TUN-83-real-songs-and-progress.md:97) permits arbitrary text such as `"my-name-is-jane"` in `current`, package keys, and `metRegions`. Private storage still violates the stated policy; `name` is the explicitly deferred exception.

   Moreover, `"constructor"` passes this slug grammar. I reproduced a `TypeError` restoring `{v:1,current:"constructor",packages:{}}`: `restoreLastPackage()` and `setPlayScope()` accept inherited `PACKAGES.constructor`, then access its nonexistent stages (`js/play-scope.js:16–28,87–90`). Testing only `"__proto__"` misses this.

   **Change:** use closed, append-only sets containing current and historical identifiers, checked with own-property membership. Package additions then follow the same backend-first deployment rule already required for new voices and meters. If arbitrary slugs are retained, that needs an explicit policy exception and prototype-name rejection.

5. **Medium — The metadata string limit rejects titles that the actual client accepts.**  
   [Plan:60](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-29/reviews/TUN-83-real-songs-and-progress.md:60) rejects metadata strings of 200 characters or more before applying the existing 60-unit title sanitizer. The save prompt has no length limit (`js/save-share.js:176–178`), and My Melodies sends that title unchanged. A 201-character title therefore turns an otherwise small, valid cloud song into a refusal, although today’s backend truncates it successfully.

   **Change:** sanitize the selected title before constructing metadata; do not apply the discarded-metadata limit to `meta.title`. Dropping `author`, IDs, and quest provenance is appropriate here—validating their contents exhaustively buys little once the request is bounded and they are discarded. Test title precedence, empty/null titles, long Unicode titles, and rename-only requests. Define PUT’s “title omitted” behavior explicitly so it preserves the existing stored title.

6. **Medium — JSON byte caps are not the stated DynamoDB cost caps.**  
   [Plan:68 and 105](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-29/reviews/TUN-83-real-songs-and-progress.md:68) measures serialized JSON, while the handlers store nested DynamoDB maps/lists (`backend/src/progress.mjs:25`, `backend/src/songs.mjs:62`). Those have different size accounting. For example, two packages containing 100 and 50 permitted tools, each with eight numeric offsets and MIDI values, fit in **8,120 JSON bytes**. Using AWS’s documented calculation, the wrapped item is approximately **10,556 bytes**, or 11 write units. [AWS item-size rules](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/CapacityUnitCalculations.html).

   Legacy replacement also matters: replacing an old 400 KB progress item is charged using the larger old/new item; deleting old songs and updating their GSI entries remain expensive until those rows are replaced or removed. [AWS write accounting](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/read-write-operations.html).

   **Change:** retain request limits, but calculate a conservative bound for the complete stored item and index entries. Recompute the budget for that bound and any transactional quota implementation. Separate transitional legacy costs from steady-state costs. The recurring 400 KB progress-write problem is closed—including sign-up, which uses the same PUT—but **$107/month is already superseded by $119.62** in the corrected review, before these adjustments (`reviews/TUN-82-throttle-budget-data-protection.md:192`). Neither is a guaranteed monthly maximum.

7. **Medium — “Finite number” permits timestamps DynamoDB cannot store.**  
   [Plan:60 and 104](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-29/reviews/TUN-83-real-songs-and-progress.md:104) accepts finite timestamps such as `1e300`; positive `updatedAt` also accepts `1e-200`. Both are valid JSON numbers but outside DynamoDB’s supported numeric range. They pass the proposed validator and fail downstream, producing a 500 rather than a validation response. An in-memory database will conceal this. [AWS numeric limits](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Constraints.html).

   **Change:** give retained timestamps a safe-integer millisecond range. Validate every retained number before SDK access. Test out-of-range finite exponents as well as overflow-to-Infinity, direct-function NaN, and the chosen normalization of `-0`.

8. **Medium — The fixture and handler tests do not yet prove the promised compatibility.**  
   [Plan:118–142](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-29/reviews/TUN-83-real-songs-and-progress.md:118) needs two corrections beyond the cases above.

   First, the default harness returns `""` for `#instr`; it only supplies stateful tempo/click controls (`tests/harness.mjs:223–230`). Default `currentSong()` fixtures exercise the empty-voice exception, and `saveUserSettings()` fixtures can contain an impossible ordinary picker value. Supply a stateful instrument control populated from actual options, and round-trip drums, durations, voice, tempo, groove, meter, and pickup—not merely “same notes.”

   Second, add a handler matrix for **POST song, PUT replacement, PUT rename, and PUT progress**: base64 bodies; multibyte exact-limit/over-limit inputs; absent/empty/null/scalar bodies; explicitly present `song:null`; unknown/prototype keys at nested levels; deeply nested discarded metadata; and fixed error responses. Assert rejected requests perform no writes. Test sign-up’s raw `cloudPush()` separately from `commitProgress()`, using the existing per-test cloud-only fetch seam—not a global harness fetch.

9. **Medium — The hand-off lacks deployment acceptance and rollback criteria.**  
   [Plan:154–157](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-29/reviews/TUN-83-real-songs-and-progress.md:154) declares compatibility that findings 1–2 disprove. A mocked GET of an old row also does not establish that a pre-deploy cloud link opens through the deployed Lambda packaging and public route.

   **Change:** require owner-run checks of a captured old `#song=` link while signed out, a new cloud-sized song, and a newly advanced progress value loaded in a fresh browser session after a successful PUT. Local “Save melody,” inline links, and replaying an already-completed level cannot establish those results. Preserve table/pool identities and inspect the SAM change set.

   State rollback behavior explicitly: reverting to today’s backend restores arbitrary payload storage and large writes. Future format changes require additive backend acceptance first; rolling the backend back after the client ships can strand that client’s saves. Keep backward acceptance or provide a compatible rollback release. These browser checks should remain pending until performed, as AGENTS.md requires.

Questions only the owner can answer:

- For valid progress exceeding 8 KiB, should this ticket raise the measured cap and revise the budget, or expand scope to introduce lossless compaction?
- Is refusing otherwise valid songs above 16 KiB an approved product restriction despite “everything today’s game writes still saves and loads,” and may the misleading retry message remain deferred?

No files were changed.

</details>

## My answers (Claude)

1. **High — the 8 KiB progress cap refuses real progress. Agreed.** I measured it myself through the
   real palettes and `craftFromCells`'s rule: Fuse unlocks in five packages (`intro`, `twin-blooms`,
   `standing-towers` on pentatonic, 45 distinct tools each; `twin-blooms-plus`, `two-new-colors` on
   diatonic, 91 each). With every one of them crafted, every package completed and every other field at
   its widest, progress is **13,457 bytes**. A realistic player (8 tools in each Fuse package) is 3,621.
   The 8 KB cap is the owner's accepted number (TUN-82 comment), so this goes to the owner: **open
   question 1**. Not truncating inventories, not making the toolbox global — agreed.
2. **High — old voices. Agreed.** History has `pluck` and `pad` in `#instr`; `setVoice` maps `pluck` →
   guitar for playback but never rewrites `progress.settings.voice`, and an old My Melodies song goes to
   `shareSong` raw. The voice list becomes today's eight plus `pluck` and `pad` (and `""` in a song
   track), accepted and stored as sent. **Note length:** GPT cites the retired `modelInsertTime` as able
   to write `len > 8`; I take that as true rather than re-derive it, and accept `len` as an integer 1 to
   1,920 (`MAX_COLS`). It is a number, not text, and `applySong` clamps it on load. Tempo was always
   within 40–180 (`#tempo` min 40/60/70, max 170/180 in history) and the name within 20 (`#pname`
   `maxlength` has always been 20), so those stand.
3. **High — the 50-song cap is not atomic. Partly agreed.** The update resurrection is real and cheap
   to close: `PUT` becomes a conditional put on `attribute_exists(songId) AND ownerId = :sub`. An atomic
   counter I **disagree** with for this ticket: it needs a new attribute or table, a transaction on every
   create and delete (twice the write units), and a migration for existing accounts — more cost and
   more ways to break than the overshoot it prevents. Reserved concurrency is 2 per function, so two
   creates can both count 49: the overshoot is one song per race, plus whatever the index has not yet
   propagated (normally well under a second). I will call it a **soft cap of 50** in the docs and state
   the ceiling as "about 50 × 16 KB"; accounts already over it stay over it.
4. **Medium — slugs are free text, and `"constructor"` crashes the restore. Agreed; I was wrong.** The
   owner's rule is "no free text except a checked title"; a slug pattern is free text in a costume, and
   `constructor` passes it. Package keys, `current` and `metRegions` become **closed lists** checked by
   own-property membership: today's 21 package slugs (sampled history shows none retired — `AGENTS.md`
   keeps slugs stable) and the regions as packages name them, which include `first-garden` (not a
   `REGIONS` key — I would have missed it). The cost, which I named in the plan, is real: **a new
   package or region must reach the backend before the client**, or every progress save from a player
   who enters it is refused. A drift test fails the suite when `PACKAGES` gains a slug the validator
   lacks, and its message and the docs say to deploy the backend first.
5. **Medium — the 200-character meta limit refuses long titles. Agreed.** The title is chosen and
   sanitised first (`body.title || meta.title`, today's precedence), and the discarded meta keys are
   checked only for being known keys — their values are bounded by the body cap and never stored. Tests
   for precedence, `null`/empty, a long Unicode title, and a rename that omits the title (keeps the
   stored one).
6. **Medium — JSON bytes are not DynamoDB bytes. Agreed; simpler fix than GPT's.** Rather than compute
   DynamoDB's map/list accounting, the handlers store the rebuilt song and progress as a **JSON string**
   (`payload`, `data`): the stored size is then the measured UTF-8 size plus a few fixed attributes, so
   the cap is the cost. Reads accept both forms (a string is parsed; an old row's map is returned as
   is). The cost of this: rolling the backend back after the deploy would serve new rows as strings,
   which today's client cannot open — the rollback note says so. Legacy rows: replacing an old large
   progress is billed at the larger size once per row; three or four test accounts. I recompute the
   arithmetic with the chosen caps in the review record, and quote it against $119.62, not $107.
7. **Medium — finite numbers DynamoDB cannot store. Agreed.** With string storage the stored payload no
   longer hits DynamoDB's number range, but timestamps are still bounded: `meta.created`/`updated` and
   `updatedAt` must be safe integers ≥ 0, other numbers stay in their small ranges. Tests for `1e300`,
   `1e-200` and `-0`.
8. **Medium — the fixtures do not prove compatibility. Agreed.** The tests get a stateful `#instr`
   select built from `index.html`'s options; each accepted song is round-tripped through `applySong` and
   `currentSong` comparing notes, hits, lengths, voice, tempo, groove, meter and pickup; the handler
   matrix GPT lists is added, with "no write happened" on every refusal; and the sign-up push is tested
   raw — a legacy localStorage progress (old voice, root `toolbox`) captured from `cloudPush()` through a
   per-test fetch on the game's context, not a global harness fetch.
9. **Medium — deploy acceptance and rollback. Agreed.** The Needs Input hand-off for the deploy lists
   owner checks: an old `#song=` link opened signed out, a new cloud-sized song shared and opened, and a
   progress change surviving a reload in a fresh session; the change-set rule; and the rollback note
   from finding 6.

**GPT's two owner questions** are the open questions below, merged with what I found.

## Plan, revised after the design review

The approach and tests above stand, with these changes:

- **Storage:** rebuilt song and progress stored as JSON strings; reads accept strings and old maps.
- **Closed lists:** voices = today's eight + `pluck`, `pad` (+ `""` in a song); package slugs = today's
  21; regions = the packages' `region` values (7, with `first-garden`); companions, click modes,
  palettes, meters, colours as before — all own-property lookups.
- **Numbers:** `len` 1–1,920; timestamps safe integers ≥ 0.
- **Meta:** known keys only, values unchecked, never stored; the title is sanitised first.
- **Name:** a string, control characters stripped and cut to 20, rather than refused.
- **Songs:** `PUT` is a conditional put (still exists, still the caller's). `MAX_PER_USER` 50, called a
  soft cap. Song cap 16 KB unless the owner says otherwise (question 2).
- **Progress cap:** the owner's answer to question 1.

## Owner's decisions

1. *The progress cap* (the reachable maximum is 13,457 bytes; 8 KB refused it) — **A: 16 KB**
   (16,384 bytes): the owner, in the AO session, 2026-11-14. With it: **document that the caps must be
   checked, and raised if needed, as content is added.** Done in `backend/README.md` beside the caps,
   with a pointer from `AGENTS.md`'s package-adding rule, and enforced by a test that computes the
   reachable maximum from the real `PACKAGES` and fails if it no longer fits.
2. *The song cap* — **A: 16 KB** (16,384 bytes), and a Backlog ticket for the misleading "Couldn't
   reach the cloud" message on a too-big song: the owner, in the AO session, 2026-11-14.

## Build (Claude)

Built the revised plan with the owner's caps (both 16,384 bytes).

- `backend/src/validate.mjs`: `checkSong`, `checkSongRequest`, `chooseTitle`, `checkProgress`, the caps
  and closed lists. It is pure. Every refusal carries a fixed `error` and a fixed-vocabulary `why`.
- `backend/src/http.mjs`: `readJson` checks the UTF-8 size before `JSON.parse`, decoding base64 first
  with a length pre-check. `refuse` answers 413 or 400. `serverError` logs the exception and answers
  a fixed 500. `stored` reads either form of a row.
- `backend/src/songs-api.mjs` and `progress-api.mjs` hold the handlers over an injected `db`.
  `songs.mjs` and `progress.mjs` are SDK wiring only, and `template.yaml` is unchanged.
- **Departures from the revised plan:** the name is stripped and cut rather than refused, as planned.
  An explicit "no song" guard in `createSong` was removed as dead code: `checkSong(null)` refuses the
  same way, and a mutation proved them equivalent. `metRegions` never holds `first-garden` in practice
  (`greetRegionFriend` skips it), but the closed list keeps it because it is a package's `region`.
- **The content-growth rule** (owner, 2026-11-14): `AGENTS.md` § Hard invariants and `backend/README.md`
  § What the API accepts. The test that enforces it is in `tests/backend-validate.test.mjs`.
- **Filed:** TUN-111 (Backlog, S): "too big to share" and "cloud full" messages instead of "Couldn't
  reach the cloud". The 409 at 50 songs shows the same misleading line, so it is included.

## The arithmetic

Saturated-rate scenario, TUN-82's method and prices (`reviews/TUN-82-throttle-budget-data-protection.md`
§ The arithmetic). Every route runs at its nominal limit for 31 days. Per request there is a $1.62/M floor
(API Gateway plus 200 ms of Lambda). Writes are $0.625/M per 1 KB unit, and eventually consistent reads
$0.0625/M per 4 KB. Responses out are $0.09/GB. Free tiers are ignored. This is a scenario, not a
bound: the throttle measured about 5× looser than configured (`backend/README.md` § Limits and budget).

**Item sizes** (GPT's PR review round 1, finding 2):
- A full progress row is `userId` + `data` (16,384 bytes) + `updated`, about 16,450 bytes. That is
  **17 write units** and 2.5 read units.
- A full song row is the payload (16,384 bytes) plus `songId`, `ownerId`, a title of up to ~240
  bytes, `visibility`, `palette`, `created` and `updated`, about 16,600 bytes. That is **17 write
  units**, on the table and again on the ALL-projection `byOwner` index.

| Route | Limit | Requests/month | Per request | $ per million | $/month |
|---|---|---|---|---|---|
| `PUT /progress` | 2/s | 5.36M | floor + 17 WRU | $12.25 | $65.59 |
| `GET /progress` | 1/s | 2.68M | floor + 2.5 RRU + 16.4 KB out | $3.31 | $8.87 |
| `GET /songs/{id}` | 1/s | 2.68M | floor + 2.5 RRU + 16.6 KB out | $3.32 | $8.90 |
| `POST /songs` | 0.25/s | 0.67M | floor + count of 50 × 16.6 KB (101.5 RRU) + 17 + 17 WRU | $35.56 | $23.81 |
| `GET /songs` | 0.25/s | 0.67M | floor + 101.5 RRU + 7.5 KB out | $14.94 | $10.00 |
| `PUT /songs/{id}` | 0.25/s | 0.67M | floor + 2.5 RRU + 17 WRU + index delete and put (34 WRU) | $33.81 | $22.64 |
| `DELETE /songs/{id}` | 0.25/s | 0.67M | floor + 2.5 RRU + 17 + 17 WRU | $23.18 | $15.52 |
| **Total** | 5/s | 13.39M | | | **$155.33** |

Against TUN-82's corrected after-TUN-83 figure of $119.62 (8 KB progress, 16 KB songs, payload only),
the difference is $35.71. About $29 of it is the 16 KB progress cap. About $7 is each full item's overhead: $3.7 on progress and $3.3 on songs. The question-1 figure the owner
answered from (about $147) left out the overhead. Song storage growth is unchanged from TUN-82: up to
21.4 GB/month across accounts. Per account the ceiling is about 800 KB (50 × 16 KB), twice over with
the index.

## PR review

### Round 1 — head `5afee2b` (GPT, `ask.sh fresh read-only gpt-6-astra`, 2026-11-14)

Usage: in 2,179,156 (cached 2,048,000), out 10,055. **Verdict: Changes requested.**

<details><summary>GPT's PR review, verbatim</summary>

**Changes required**

1. **Medium — Legitimate legacy songs are rejected below the approved byte cap.**  
   Evidence: `backend/src/validate.mjs:97`; `js/save-share.js:169,227`. Before TUN-84, `addColumns()` had no upper bound (`0de071b:js/editing.js:116`). Using that implementation, I produced a 1,928-column song: **4,147 bytes**, 1,828 packed characters, therefore requiring cloud sharing. Today’s real `shareSong()` sends it unchanged; this handler returns **400 `bad song`**, reason `time.cols`.  
   Separate legacy input acceptance from the current editor’s `MAX_COLS`. Preserve strict numeric validation and byte caps while supporting previously written v3 songs. Add a historical fixture rather than deriving every compatibility fixture through today’s clamping loader.

2. **Medium — The $147 saturation estimate omits billable overhead and larger progress reads.**  
   Evidence: `backend/README.md:245`; `backend/src/progress-api.mjs:26`; `backend/src/songs-api.mjs:68,112`. A 16,384-byte JSON payload plus keys and other attributes exceeds 16 KiB: **17 write units and 2.5 eventually consistent read units** per full-sized item. String storage makes payload measurement straightforward, but does not eliminate wrapper attributes. AWS bills the complete item with size rounding. [Item sizing](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/CapacityUnitCalculations.html), [capacity accounting](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/read-write-operations.html).  
   Recalculate the route table, including GSI writes, queries and progress response transfer. Under TUN-82’s stated assumptions, the corrected scenario is approximately **$156/month**, not $147. Put the calculation in the review record—the README currently points there without a corresponding calculation.

**Missing tests**

1. **Historical sharing:** send the 1,928-column fixture above through My Melodies’ sharing path and POST. Expect successful storage within the byte cap. Also exercise raw saved songs with `pluck`, `pad`, and historical `len > 8`, without first passing them through `applySong()`.

2. **Successful PUT replacement:** replace an existing song with different notes, drums and meter using a base64 body. Expect 200, the replacement stored as JSON text, GET returning the replacement, and the existing title preserved when omitted. `tests/backend-handlers.test.mjs:149` currently tests invalid replacement and successful renaming, but no successful replacement.

3. **Song PUT refusal matrix:** on an existing owned row, submit absent/empty bodies, malformed JSON, `null`, arrays, scalars and unknown nested keys; expect the appropriate fixed 400 and no write. Test plain/base64 bodies at 17,408 and 17,409 bytes; expect acceptance and 413 respectively. Also test POST and replacement PUT with a valid rebuilt song exceeding 16,384 bytes while its request remains below 17,408; expect 413 and an unchanged database.

4. **Progress byte boundaries:** submit valid multibyte JSON at exactly 16,384 bytes and one byte over, both plain and base64 encoded. Expect 200 and 413 respectively, with no write on refusal. Existing progress tests do not establish these boundaries.

5. **Non-vacuous 500 assertions:** inject a failure into each operation that a selected route definitely executes, including replacement PUT and DELETE. Require exactly 500 `{"error":"server error"}`. The `continue` at `tests/backend-handlers.test.mjs:184` currently lets an incorrect non-500 response escape assertion.

6. **DynamoDB-shaped pagination:** return a `LastEvaluatedKey` containing `ownerId`, `updated` and `songId`; require its unchanged forwarding as `ExclusiveStartKey`. Across pages, expect 49 songs to permit creation and 50 to refuse without writing. The current stub only exercises its invented `{i:…}` cursor.

7. **Owner deployment acceptance, still pending:** verify an old cloud link while signed out, a newly created cloud-sized song, and newly advanced progress surviving a fresh-session reload. Record the change-set inspection and results. Harness fixtures do not satisfy these ticket and AGENTS.md acceptance checks.

The 24 new backend tests and syntax checks passed. The full suite encountered temporary-directory `EPERM` failures in the read-only sandbox. No static Lambda/DocumentClient wiring defect was found; AWS execution remains unverified. No files changed.

**Verdict**

Changes requested.

</details>

**My answers:**

1. **Medium — legacy songs wider than 1,920 columns are refused. Agreed.** I had taken `MAX_COLS` as a
   format limit, but before TUN-84 `addColumns` had none, and `shareSong` sends a saved song raw. Fixed:
   `SONG_COLS_LIMIT` = 100,000 bounds `cols` and `len`. `MAX_COLS` stays, as the Studio's ceiling, for
   the drift test. The byte cap bounds the song whatever it claims, and `applySong` clamps it on load.
2. **Medium — the $147 estimate omits item overhead and bigger progress reads. Agreed.** Recomputed in
   § The arithmetic above: **$155.33**, matching GPT's ~$156. `backend/README.md` now says $155 and
   points at the table. Owner question 1 was answered on "about $147". The difference is ~$8 in a
   flood scenario, so I report it rather than re-ask: the reason for 1A (no lost progress) is unchanged.

**Missing tests, each added** (`tests/backend-handlers.test.mjs`):
1. *Historical sharing*: 1,928- and 2,400-column saves with `pluck`/`pad` and `len` 12/30. They are
   built raw, too big for a link, sent through the real `cloudSongCreate` and stored exactly.
2. *Successful `PUT` replacement*: base64, a different meter and drums, stored as text, the title kept.
3. *`PUT` refusal matrix*: absent, empty, malformed, `null`, `[]`, scalar, an unknown nested key and
   an unknown body key, each answered 400 with no write. The body cap is exact at 17,408/17,409, plain
   and base64. Also *a valid song over 16 KB stored, under the body cap*: 413 on `POST` and `PUT`, with
   no write.
4. *Progress byte boundaries*: 16,384 accepted and 16,385 refused (413, no write), plain and base64.
5. *Non-vacuous 500s*: eight route-and-call pairs, each certain to reach the failing call, each
   exactly `500 {"error":"server error"}`.
6. *DynamoDB-shaped pagination*: the test table now pages by `(updated, songId)` and returns
   `{ownerId, updated, songId}` keys. The test asserts every `ExclusiveStartKey` equals a received
   `LastEvaluatedKey`, and that 49 creates while 50 refuses with no write.
7. *Owner deploy acceptance*: **agreed, not a code test.** These are the deploy checks in the Needs
   Input hand-off, which stay pending until the owner runs them.

**Mutation checks on the new tests, all caught:** a 1,920-column limit; a trimmed start key; a `PUT`
that stores the raw song; a body cap off by one; the stored cap equal to the body cap; a replacement
that drops the title.

**GPT's note** that the full suite hit `EPERM` in its read-only sandbox applies to its run only: the
suite passes here (Tests, below).

### Round 2 — head `0921c3c`, the delta since `5afee2b` (GPT, `ask.sh fresh read-only gpt-6-astra`, 2026-11-14)

Usage: in 598,817 (cached 517,120), out 3,475. **Verdict: Changes requested** (one missing test, no code change).

<details><summary>GPT's PR review, round 2, verbatim</summary>

**Changes required**

None in production code. The legacy-limit fix and revised cost estimate address round-1 findings 1–2; the item accounting matches [AWS’s rules](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/read-write-operations.html). Test items 2–6 are resolved.

**Missing tests**

1. **Medium — Historical sharing still bypasses the requested entry path.**  
   [tests/backend-handlers.test.mjs:246](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-29/tests/backend-handlers.test.mjs:246) calls `cloudSongCreate()` directly, never My Melodies or `shareSong()`. I replaced `shareSong()` with an unconditional exception **in memory**: all 15 handler tests still passed, including the historical-sharing test.

   Seed the raw historical fixtures into saved melodies, invoke their share button through the real `shareSong()`, and feed the resulting request into POST. Assert successful storage with columns, retired voices and long durations preserved. Do not normalize through `applySong()` first.

Owner deployment acceptance remains pending as recorded: change-set inspection, an old link opened signed out, a new cloud-sized song, and newly advanced progress surviving a fresh-session reload.

All 29 validator/handler tests and syntax checks passed. The full suite encountered temporary-directory `EPERM` failures in the read-only sandbox. No files changed.

**Verdict**

Changes requested.

</details>

**My answer:**

1. **Medium (missing test): historical sharing bypassed My Melodies and `shareSong`. Agreed.** GPT
   replaced `shareSong` with a throw and the test still passed. It now seeds the raw saves into My
   Melodies (`mg_saves`), reads each row back with `getSaves()`, and calls the real `shareSong(it)`,
   which is what the row's 🔗 calls. It then checks that one `POST /songs` was sent, that `POST` stored
   it, and that `GET` returns the columns, retired voice and long holds as saved. It also checks the
   player got a `#song=` link on the clipboard. `clientGame` gained `saves` and a recording clipboard.
   **Mutations, both caught:** `shareSong` throwing (GPT's probe), and `shareSong` normalising the song
   through `openStudioWith`/`currentSong` before sending.

Owner deploy acceptance stays pending, as GPT notes: it is in the deploy hand-off.

### Round 3 — head `e8b6bca`, the delta since `0921c3c` (GPT, `ask.sh fresh read-only gpt-6-astra`, 2026-11-14)

Usage: in 431,223 (cached 377,216), out 1,793.

<details><summary>GPT's PR review, round 3, verbatim</summary>

**Changes required:** None.

**Missing tests:** None. Round 2’s item is resolved in [tests/backend-handlers.test.mjs:242](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-29/tests/backend-handlers.test.mjs:242): raw historical saves pass through `getSaves()` → real `shareSong()` → POST → GET, preserving columns, retired voices and long holds. Both in-memory mutations—throwing from `shareSong()` and normalizing before sharing—correctly fail the test.

All 29 backend tests and syntax checks passed. The full suite encountered temporary-directory `EPERM` failures in the read-only sandbox. Owner deployment acceptance remains pending as previously recorded. No files changed.

**Verdict:** Approved at e8b6bca4f43eb0e4ae1d784f01ab1c0e2ec0f95d

</details>

The `EPERM` failures were GPT's read-only sandbox. The full suite passes here (§ Tests).

## Owner's review — the deploy (2026-11-14)

The owner deployed from this worktree at `e8b6bca` (`sam validate --lint`, `sam build`,
`sam deploy --confirm-changeset`).

- **Change set**, as the owner pasted it: Modify with Replacement `False` on `Api`, `PreSignUpFn`,
  `ProgressFn`, `SongsFn` and `UserPool`, and Modify `Conditional` on `PreSignUpPermission`. There
  were no adds or removes, and no table rows.
- **The `Api` row was not on my list.** The owner held the prompt while I read the pending change set
  (`describe-change-set`, read-only). `Api`'s `Body` was flagged *Dynamic* because it refers to
  `SongsFn.Arn` and `ProgressFn.Arn`; it is never recreated. That is the same mechanism as
  `UserPool` → `PreSignUpFn.Arn`. It went unlisted because TUN-76's deploy changed `Api` on purpose.
  The same read showed `PreSignUpPermission`'s *Conditional* comes from `SourceArn` → `UserPool.Arn`,
  not from `FunctionName` as the ticket's note said. `backend/README.md` § Future deploys now lists
  `Api`, corrects that reason, and says how to read a change set's details. The owner answered `y`.
- **Deployed:** the stack is `UPDATE_COMPLETE` at 03:37 UTC. `SongsFn` and `ProgressFn` were updated
  03:37:06 UTC on nodejs24.x, each zip 11,687 bytes (all the new modules). Checked by CLI.
- **Live checks (mine, no account, no data):**
  - `GET /songs/<made-up id>` answered `404 {"error":"not found"}`, from the new handler, so Lambda
    loads every module.
  - A CORS preflight from `https://www.tunegarden.game` is still allowed.
- **The owner's playtest on production** (www.tunegarden.game), all passed:
  1. A `#song=` link shared before the deploy opened and played, signed out.
  2. A new Studio song too big for a link was shared through the cloud, and opened and played.
  3. A progress change survived a reload.

  These close the ticket's "a cloud share link made before the deploy still opens" and GPT's round-1
  item 7.
- This record and the README rows are one docs-only commit on top of GPT's approved head `e8b6bca`.
  No code or test changed.

## Tests

`node --test "tests/*.test.mjs"`: 750/750 on the build, and **761/761** after merging `origin/main` (TUN-81's `vendor/`). **766/766** with PR review round 1's fixes (backend tests: 14 + 15), and again with round 2's. That includes the new
`backend-validate.test.mjs` (14) and `backend-handlers.test.mjs` (10). Syntax: `tools/check-syntax.mjs`,
plus `node --check` on every backend module.

**Mutation checks, run by hand and all caught:** dropping `pluck`; a 14 KB progress cap; dropping the
`studio` package; copying any `meta.created`; no column check; an uncapped name; any `meta` key; a
one-page count; an unconditional `PUT`; a 500 that echoes `e.message`; storing the raw song or the raw
progress; counting UTF-16 units; ignoring base64; a rename that drops the stored title. The only
survivor was the equivalent "no song" guard (above). A no-op control survived, as it should.

**No browser check:** the game's code does not change. The fixtures run the real client in the harness instead.

**Verified on AWS after the deploy:** see § Owner's review — the deploy.

**Not verified before the deploy:** anything against real AWS. Whether the SDK's DocumentClient accepts these
parameter objects, Lambda packaging of the four new files, and the live 413/400/500 responses are
the owner's deploy checks.
