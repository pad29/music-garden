# Tune Garden — Save / Share Redesign

*Durable, pitch-based song format + dedicated Studio + cloud song storage.*
Status: **SPEC** (locked 2026-06-19). Supersedes the prototype save/share described in DESIGN §10/§12.
Owner decisions baked in: **full forward-compatible container** (sparse fill), **cloud storage in scope**, spec lives here with a pointer from DESIGN §11.

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
  time:    { cols, tempo, groove, swing? },
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

- `GET /songs/{id}` is the one **unauthenticated** route (per-route `Auth: Authorizer: NONE` override on the otherwise-default Cognito authorizer) so a friend can open a link without an account — the same openness as today's `#s=`, but server-stored. Long random ids make enumeration infeasible; `private` songs never return unauthenticated.
- **Visibility today:** only `private` and `unlisted` (link-only). `public` / gallery listing is **not** built (see §7).
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

- **P1 — durable client format (the core).** v3 pitch-based `currentSong`/`applySong`; packed URL form + size ceiling; v3-only localStorage library (no v2 migration). **Ships diatonic sharing.** No backend.
- **P2 — Studio.** Dedicated sandbox entry from Home; widest-unlocked palette; finale "Keep building in the Studio" deep-links.
- **P3 — cloud songs.** `music-garden-songs` table + `POST/GET/PUT/DELETE /songs` + `GET /songs?mine`; `#song=<id>` links; cross-device library; unauth `GET /songs/{id}` for link resolution; caps/throttle/title filter.
- **P4 — public gallery (DEFERRED, gated on moderation).** Flip `visibility:"public"`, add a listing endpoint, title moderation, report/takedown flow.

---

## 10. Open questions for build time

- **Packed URL encoding** exact scheme + the precise size ceiling (measure real songs).
- **Nearest-pitch snapping** UX when a song is opened in a narrower palette than authored (only matters once palettes that aren't strict supersets exist).
- **Guest → account song migration:** when an anonymous user with localStorage songs signs up, do we bulk-upload them to cloud (mirrors the progress-sync first-login upload)? Lean yes, on explicit action.
- **Studio palette selector:** auto-widest-unlocked vs. a per-creation chooser.
