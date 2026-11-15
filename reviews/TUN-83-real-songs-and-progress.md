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

1. **open** — *The progress cap.* The reachable maximum is 13,457 bytes; 8 KB refuses it, and a refused
   save freezes the cloud copy, which the next sign-in or reload brings back over newer play.
2. **open** — *The song cap of 16 KB*, and whether the misleading "Couldn't reach the cloud" message for
   a too-big song may wait for its own ticket.
