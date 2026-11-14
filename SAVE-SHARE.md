# Tune Garden — Save / Share Redesign

*Durable, pitch-based song format + dedicated Studio + cloud song storage.*
Status: **IMPLEMENTED — P1+P2+P3 all shipped (2026-06-19/20)**; P4 (public gallery + `private`) deferred pending moderation. Spec locked 2026-06-19; supersedes the prototype save/share described in DESIGN §10/§12. This doc remains the format's source of truth — read §3 before touching `currentSong`/`applySong`.
Owner decisions baked in: **full forward-compatible container** (sparse fill), **cloud storage in scope**, spec lives here with a pointer from DESIGN §11.
Quests reuse the v3 container for their musical payloads only; `QuestDefinition` and `QuestRun` are **parallel** containers, never embedded in a song — see `QUESTS.md` Q8.
A quest offering saves an **ordinary v3 song** carrying two extra `meta` fields (2026-09-06): `localId` (`quest-run:<runId>`, which makes the write an upsert so a retried finalisation cannot duplicate it) and `source:{kind:"quest",runId,questId,definitionVersion}` — a pointer, never embedded quest content. Packed `#s=` links omit metadata beyond their wire fields, so sharing one is unchanged.

---

## 1. Why this exists

The shipped save/share (song format **v2**, `index.html` ~L2208) was a quick prototype bolted onto the intro's free-play finale. It works for simple pentatonic melodies but is structurally unable to carry the game forward.

**Today (v2):**
```js
{ v:2, palette, cols, notes:[[row,col]], drums:[[lane,col]], groove, tempo, voice }
```
- **Transport:** URL hash `#s=` (URL-encoded JSON) + a localStorage `"saves"` library. No backend.
- **Lives in:** package free-play finales (not a dedicated place).
- **Core defect:** `notes` are `[row, col]`, and **row is a palette-relative index**. Row 5 = `A4` in pentatonic but `D5` in diatonic. v2 tags the palette and `applySong` calls `setPalette` before placing rows, so a song round-trips *only if* (a) the palette loads correctly and (b) the row tables never change. It breaks on cross-palette open, on any future edit to the `PALETTES` layout, and on adding palettes. This is why **diatonic free-play is currently local-save-only with no share button**.

**Four things v2 structurally cannot do:**
1. Survive palette / row-table evolution (every saved song silently re-pitches if rows move).
2. Hold a **diatonic** share link.
3. Hold anything **complex** — note durations/rests, multiple voices, or long pieces (URL hashes overflow fast).
4. Support **cloud** persistence or **public** sharing.

---

## 2. Principles

- **Store pitch, not row.** Notes carry absolute MIDI pitch; rows are a *rendering* concern resolved at load against the active palette. This is the durable fix — pitch is palette-independent and absolute.
- **One song object, many transports.** `currentSong()` / `applySong()` stay the single choke point; URL link, localStorage, and cloud are just encoders/loaders behind it.
- **Design the container for the whole roadmap, fill it sparsely.** Ship the full v3 shape (tracks, durations, per-voice instruments) now, but only populate what the engine uses today, so we never re-version the format again.
- **Clean break — no back-compat.** The game has only had a handful of testers and was never widely distributed, so v3 simply replaces v2; we do **not** carry forward old `#s=` links or v2 localStorage saves (decided 2026-06-19).
- **Designed-for, gated-off.** The model accommodates public galleries; we do not ship them until a moderation plan exists (COPPA).

---

## 3. Format v3 — the song container

```js
{
  v: 3,
  meta:    { title, created, updated, author? },   // author = Cognito sub when signed in; absent for guests
  palette: "diatonic",                              // authoring palette: edit/visual context + cross-open fallback
  time:    { cols, tempo, groove, swing?, meter?, origin? },   // meter/origin ONLY when the song has bars
  tracks: [
    { kind:"melody", voice:"pluck",
      notes:[ { p:72, c:0, len:1 }, … ] },          // p = MIDI pitch (absolute), c = start column, len = duration in columns
    { kind:"drums",
      hits:[ { lane:0, c:0 }, … ] }                 // lane = DRUMS index, c = step (0..15)
  ]
}
```

**Field-by-field, and what each reserves:**

| Field | Today | Reserves (roadmap) |
|---|---|---|
| `meta.title/created/updated` | set on save | library/cloud/gallery keys |
| `meta.author` | Cognito sub if signed in | ownership for cloud + galleries |
| `palette` | `"pentatonic"` / `"diatonic"` | chromatic / style / multi-instrument palettes (DESIGN §11) |
| `time.cols/tempo/groove` | as v2 | — |
| `time.swing` | unused | per-song swing (R-tier rhythm) |
| `tracks[]` | exactly one `melody` + one `drums` | multi-voice editing (gates Region 6) |
| `track.voice` | the single global instrument | per-voice instruments |
| `note.p` | MIDI pitch from `MIDI[row]` | absolute pitch, palette-independent |
| `note.len` | always `1` | note duration / rests (parked "bars & plots") |
| `note.vel?` | unused | velocity / articulation (rhythm tier R4) |

**Renderer contract (load):**
1. `setPalette(song.palette || "pentatonic")`.
2. For each `note.p`, find the row where `MIDI[row] === p`.
3. If a pitch is **not present** in the active palette (cross-palette open), fall back in order: (a) the song's own `palette`; (b) the chromatic superset (once it exists); (c) snap to nearest in-palette pitch as a last resort, flagged in UI. Today's two palettes never need (c) because diatonic ⊇ pentatonic by pitch.

---

## 4. Transports

The same v3 object serializes three ways; the UI picks by size/scope.

| Transport | Use | Mechanism | Limit |
|---|---|---|---|
| **URL link** `#s=` | small, simple songs — the instant P2P loop | **packed** compact form (arrays, not pretty JSON; short keys) → `base64url` | enforce a **size ceiling** (~1.5–2 KB encoded). Over the ceiling, UI says *"Too big to link — save to your garden to share."* |
| **localStorage** | personal "My Melodies" | unchanged `Store` seam, v3 payload | browser quota |
| **Cloud** `#song=<id>` | complex / long / multi-voice / cross-device / shareable | `songs` API; link carries a short server **id**, resolved via `fetch` | payload cap (§6) |

**Packed URL form:** a deterministic compact encoding (positional arrays + single-letter keys) keeps simple songs linkable. This is purely a wire format for `#s=`; the in-memory object is always the readable v3 above.

The packed array is **positional**: `[3, palette, cols, tempo, groove, voice, notes, hits]`, with meter
appended as **slot 8** — `[meter, origin]` — and *only when the song is metered*. Three rules, each
load-bearing (`EDITOR-DESIGN.md` §17):

- **Append, never insert.** A new field goes on the end or every link ever shared decodes wrong.
- **Omit, never `undefined`.** `a[8] = undefined` serialises as `null`, which lengthens every existing
  link by five characters against `SHARE_MAX = 1800`. The code `push`es, and a test asserts that an
  unmetered song still packs to exactly eight slots with no `null` on the wire.
- **Absence reads as unmetered.** Decoding a missing slot 8 as an explicit 4/4 would give every song
  written before bars existed a set of barlines it was never composed against.

**Slot 4, the groove, is an INDEX into `GROOVES`,** so that array is append-only for the same reason: index
2 has to stay Doo-wop in every link ever shared. Grooves added since carry a `meter` tag saying which
presets they can play. A song whose saved groove cannot play its saved meter **migrates on load** rather
than being rejected — songs written between the meter slice and the dance grooves legitimately pair a 3/4
meter with one of the older grooves, because `currentSong` has always written `grooveIdx` whether or not
the band could use it. The migration must not overwrite the tempo the song carries.

A share link is untrusted input, so `validMeter()` normalises an unknown preset, a negative, fractional
or non-finite origin, or an origin at/past the bar's own length to **unmetered** rather than throwing —
a link we cannot trust is a link with no meter. A *missing* origin still means "no pickup", which is the
ordinary case; only a present-but-unusable one rejects the meter with it.

The same rule covers the rest of the song, in **one gate, `applySong()`**, which every path a song
arrives by goes through — `#s=`, `#song=`, My Melodies, the rescued sprout, quest drafts (TUN-84). A
`#s=` link never touches the server, so the client defends itself whatever the backend checks. The gate
**clamps, never refuses**: the columns to 16…`MAX_COLS` (1920, `js/doc-model.js` — 240 bars of 4/4; a
million-column link used to freeze the tab); the tempo, when it is a finite number, to the slider's
range, and anything else leaves the tempo alone; notes to whole MIDI pitches 0–127 at whole in-range
columns, one per (pitch, column), each held 1…`MAX_VINE`, and no more than the song's own field has
seeds (`ROWS × COLS`); drum hits to whole lanes and columns, one per cell. A song cut at the ceiling
loads its beginning, and the status line says so. The Studio's ＋ patch and ＋ room stop at the same
`MAX_COLS`, so a song a player built always loads back whole. A title is the player's or a stranger's
text: it is shown with `textContent`, or escaped (`escapeHtml`) where it sits inside `setStatus` markup.

---

## 5. Dedicated Studio

Save/share moves **out of package finales** into a first-class **Studio** reached from Home:
- Full toolbox, drums, mixer, save/share — and the **widest palette the player has unlocked** (reads `progress.colors` / unlocked palettes).
- Package free-play finales become a **"✨ Keep building in the Studio"** deep-link that hands their current content over pre-loaded (via the in-memory song seam, `finaleQuiet`-style entry).
- This is what cleanly retires "diatonic = local-only": the Studio supports any unlocked palette and shares through the v3 format.

---

## 6. Cloud song storage (in scope)

New serverless storage alongside the existing progress API (same `music-garden` SAM stack; infra IDs keep the `music-garden` name — branding is "Tune Garden", wiring is not).

**DynamoDB — `music-garden-songs`** (PAY_PER_REQUEST):
- PK `songId` (short random url-safe id, ~10 chars, collision-checked; **random not sequential** so ids aren't enumerable).
- Attributes: `ownerId` (Cognito sub), `title`, `visibility` (`private | unlisted`), `palette`, `payload` (v3 JSON, capped), `created`, `updated`.
- GSI `byOwner` (`ownerId` HASH, `updated` RANGE) for "my cloud songs" listing.

**API (HTTP API, reuses the Cognito JWT authorizer):**
| Route | Auth | Purpose |
|---|---|---|
| `POST /songs` | required | create; body = v3 song + title + visibility; returns `{ id }` |
| `GET /songs/{id}` | **none** | resolve a share link; returns the song if `visibility !== private`, else owner-only |
| `PUT /songs/{id}` | required | owner-only update |
| `DELETE /songs/{id}` | required | owner-only delete |
| `GET /songs?mine` | required | list caller's songs via `byOwner` |

- `GET /songs/{id}` is the one **unauthenticated** route (per-route `Auth: Authorizer: NONE` override on the otherwise-default Cognito authorizer) so a friend can open a link without an account — the same openness as today's `#s=`, but server-stored. Long random ids make enumeration infeasible.
- **Visibility — P3 ships `unlisted` only** (link-shareable). *Finding during build (2026-06-20):* `private` (owner-only read) can't be served on the public `GET /songs/{id}` route because that route has **no authorizer**, so it has no identity to recognize the owner. Owner-only reads need an identity-aware read route, which is exactly what the gallery (`public`) also needs — so **`private` and `public` both defer to P4**. P3 coerces every create/update to `unlisted`; the `visibility` column stays in the schema for forward-compat.
- **CORS:** add the `songs` routes to the same allow-list already tightened to `https://tunegarden.game` (+ `www`, + Netlify fallback).

**Limits / abuse:**
- Payload cap (e.g. ≤ 100 KB; DynamoDB item limit is 400 KB — stay well under).
- Per-user song-count cap; create-rate throttle.
- Title: length cap + profanity filter (it's the only free-text field — the real moderation surface).

---

## 7. Public galleries — designed-for, gated-off

The audience skews under-13, so DESIGN §12's COPPA caveat governs:
- The record carries `visibility`; **`public`** (gallery-listed) is **deliberately unimplemented**. **`unlisted`** (link-only) gives the full P2P sharing loop with **no public surface to moderate**.
- Shipping `public` later requires: title moderation (pre- or post-queue), a **report** flow, and a takedown path. Music itself is low-risk; **text is the surface** (titles, profile names).
- Until then: private library + unlisted links only. No listing endpoint exists to enumerate others' songs.

---

## 8. Migration — clean break (no back-compat)

The game was never widely distributed (a few testers only), so **v3 simply replaces v2 — no legacy decoders, no migration path** (decided 2026-06-19).
- Old `#s=` links and any v2 localStorage saves are **not** supported and may stop loading. Acceptable given the tiny tester pool; testers re-create anything they want to keep.
- `applySong` may keep a trivial guard (ignore an unrecognized `v`) so a stale v2 link fails gracefully rather than throwing — but no attempt is made to *interpret* it.
- **Regression check (still required):** a round-trip in v3 must reopen **pitch-identical** for both pentatonic and diatonic — save → reload → same pitches, tempo, groove, voice, drums. (This is a v3 correctness test, not a back-compat test.)

---

## 9. Phasing

In-scope this effort: **P1 + P2 + P3**. P4 deferred.

- **P1 — durable client format (the core). ✅ SHIPPED 2026-06-19.** v3 pitch-based `currentSong`/`applySong`; packed URL form + size ceiling; v3-only localStorage library (no v2 migration). **Ships diatonic sharing.** No backend.
- **P2 — Studio. ✅ SHIPPED 2026-06-19.** Dedicated sandbox entry from Home (a hidden `PACKAGES.studio` node — never on the map/DAG); widest-unlocked palette (`widestPalette()` reads `progress.colors`); finale "Keep building in the Studio" deep-links. On the world map the Studio is the little gold island.
- **P3 — cloud songs. ✅ SHIPPED 2026-06-20.** `music-garden-songs` table + `POST/GET/PUT/DELETE /songs` + `GET /songs` (list mine); `#song=<id>` links; cross-device "☁️ In the cloud" section in My Melodies; unauth `GET /songs/{id}` for link resolution; per-user cap (200) + payload cap (100 KB) + title sanitize. Share flow: small songs → inline `#s=`; big songs → cloud `#song=<id>` (sign-in required). **Unlisted-only** (see §6 finding).
- **P4 — public gallery + private (DEFERRED, gated on moderation).** Add an identity-aware read path (enables owner-only `private` reads), `visibility:"public"` + a listing endpoint, title moderation, report/takedown flow.

---

## 10. Open questions for build time

- **Packed URL encoding** exact scheme + the precise size ceiling (measure real songs).
- **Nearest-pitch snapping** UX when a song is opened in a narrower palette than authored (only matters once palettes that aren't strict supersets exist).
- **Guest → account song migration:** when an anonymous user with localStorage songs signs up, do we bulk-upload them to cloud (mirrors the progress-sync first-login upload)? Lean yes, on explicit action.
- **Studio palette selector:** auto-widest-unlocked vs. a per-creation chooser.
