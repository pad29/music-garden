# Tune Garden — Long-Term Editor Design (v2)

*Companion to `DESIGN.md` (vision), `PACKAGES.md` (content DAG), and `SAVE-SHARE.md` (song format). This document is the source of truth for how the **editing surface and its underlying document model** evolve as the remaining systems land (meter, duration, dynamics, multi-voice, sections, chromatic).*

*v1 drafted 2026-07-16 (owner + Claude). **v2 2026-07-19**: revised after expert review (`Feedback 2026-07-19.docx`) and owner decisions — see §18 for the changelog. Verdict adopted from the review: proceed with the v1 architecture, but make the **foundation more musically general than the initial UI**.*

**Status: DESIGN — nothing here is built yet.** Build phases in §16; each ships value on its own.

---

## 0. Why now

Every remaining package wave is gated on an editor capability (meter → `two-kinds-of-walking`; duration → R3/Region 7; dynamics → `rain-and-sun`; multi-voice → Region 6; sections → Region 7; chromatic → Wave D). Designing the editor once, now, means each of those lands as a planned part of one architecture instead of repeated rebuilds.

## 1. The ceiling (product destination) — DECIDED 2026-07-19

**Tune Garden becomes a serious musical composition and arrangement environment — not a DAW, and not a notation application.** Notation is an educational/export *lens*; detailed audio production happens in external tools.

In scope long-term: multi-part compositions, real form (sections/repeats/variation), dynamics and (later) articulation, changing keys and meters eventually, **MIDI export** (early), **rendered audio export**, **MusicXML export later** (only if/when notation semantics mature), MIDI keyboard *input* eventually, remix and collaboration.

Explicitly out of scope: audio recording, waveform editing, plug-ins/effects racks, automation lanes, mixing/mastering beyond the simple per-voice mixer. If a feature request looks like GarageBand/Ableton/MuseScore, the answer is an *export*, not a feature.

## 2. Principles (non-negotiable)

1. **It stays a garden.** Seeds, plots, blooms, tools, creatures. Every new power arrives as a metaphor; can't-sound-bad remains the *default* experience; danger is opt-in and earned.
2. **One engine and document model everywhere; workspaces adapt.** Levels, Studio, phone, and desktop share semantics, undo, playback, and persistence — but not necessarily identical controls or chrome. A level shows seeds and one new tool; an advanced Studio may show an inspector and shortcuts. There is no second engine.
3. **Notes are objects; every visible surface is a lens.** The model is a list of musical objects (§4); the field, the future score view, and the legacy grid are projections. Lenses control presentation — they never constrain what a song can represent.
4. **The model is chromatic and tick-based; friendly views never reduce musical precision.** Columns, vines, and lighting are views over exact musical data (12-semitone pitch, integer-tick time, continuous velocity).
5. **Names and numbers are never required — and never forbidden.** The beginner experience runs entirely on HOME, sun/moon, colors, and feel. Optional labels (note names, "C major", measure numbers, precise values) are available for those who want them — the same tiering philosophy as the dimmed teach-field.
6. **Touch-complete, keyboard-accessible, desktop-efficient.** Every operation is possible on touch; desktop adds keyboard navigation, shortcuts, marquee selection, and (eventually) computer-keyboard/MIDI note entry. No essential feature hides behind hover or an undiscoverable gesture.
7. **Every action is reversible and recoverable.** Undo/redo, frequent local autosave, crash recovery, and named checkpoints are core design rules, not features.
8. **Never break shipped content.** All packages' goal detectors, the FAMOUS library, saved songs, and share links keep working at every phase (§15).

## 3. Requirements catalog

Owner items 1–5; jointly extended 2026-07-15/16; expanded by the 2026-07-19 review. **P** = build phase (§16).

| # | Requirement | P |
|---|---|---|
| R1 | Chromatic pitch without a 24-row wall (lattice + lenses, §5) | 6 |
| R2 | Meter and bars (dance feels; snap resolution independent of meter) | 2 |
| R3 | Dynamics (continuous velocity; 4–5 kid-facing levels; crescendo paint later) | 3 |
| R4 | Editing ergonomics (selection, move/copy/paste, column/time surgery) | 1 |
| R5 | Multiple voices (tracks in the model from Phase 0; UI in Phase 4) | 4 |
| R6 | Note duration (vines = musical intent; instrument realizes it) | 2 |
| R7 | Undo/redo (transaction journal) | 1 |
| R8 | Horizontal scale & navigation (zoom, bar paging, minimap) | 2/5 |
| R9 | Sections and repeats (definitions + arrangement instances) | 5 |
| R10 | Selection model (seed tray; one unambiguous gesture grammar) | 1 |
| R11 | Touch-complete + keyboard-accessible + desktop-efficient | all |
| R12 | Playback tools (play-from, loop range, count-in/metronome, mute/solo) | 2/4 |
| R13 | Level-detector compatibility (projection adapter → query API, §15) | 0 |
| R14 | Garden identity | all |
| R15 | Save format v4 (ticks, IDs, sections) + eternal share compat | 0+ |
| R16 | Vertical scroll of the pitch window | 6 |
| R17 | HOME + mode as direct controls (drag marker + mode switch; never a key list) | 6 |
| R18 | Real audio scheduler (lookahead, note-off, seek, live-edit rescheduling) | 0/2 |
| R19 | Autosave, crash recovery, named checkpoints, cloud revisions | 0/1 |
| R20 | Accessibility (§13) | all |
| R21 | Performance budgets + viewport-based rendering (§12) | 0+ |
| R22 | Exports: MIDI early → rendered audio → MusicXML later (§1) | 3+ |

## 4. The document model (the heart of v2)

### 4a. Shape

```
project        { version, ppq, tempoMap, meterMap, tonalityMap, tracks[], sections[], arrangement[] }
track          { id, role, instrument, mixer }            // role: melody | support | drums | …
note           { id, pitch, startTick, durationTicks, velocity, spelling?, articulation? }
section        { id, name, lengthTicks, eventsByTrack }
arrangementItem{ id, sectionId, repeats, transpose? }
```

Optional fields (`spelling`, `articulation`, `transpose`) are **reserved seams**, not near-term work.

### 4b. Time is ticks, not columns

Canonical time is integer **ticks at PPQ = 96** — **RATIFIED by the 2026-07-19 spike** (`spike/FINDINGS.md` §1): smallest supported subdivision = 32nd note and 16th-triplet; quintuplets/septuplets out of scope per §1; MIDI export multiplies by 5 losslessly if 480 PPQ is wanted. (96 is divisible by 2/3/4/6/8/12/16/24/32 — 16ths, triplets, and finer are representable without floats.) Columns are a *grid projection at the current snap resolution*. Today's column = an 8th = 48 ticks; v3 songs convert exactly (`start = col·48`, `len = len·48`). This makes triplets, pickups/anacrusis, ties across bars, swing-as-view, snap changes, zoom, and future meter changes representable **without another migration** — none of them need UI yet.

### 4c. Stable IDs, from Phase 0

Notes, tracks, sections, arrangement items, and saved tools all carry IDs. Needed for reliable selection, undo, overlapping notes, section references, cloud revisions, remix provenance, and any future collaboration. Cheap at the model flip; brutal to retrofit.

### 4d. Three kinds of state, kept separate

- **Music document** — notes, tracks, sections, meter/tempo/tonality maps. The only thing saved in a song.
- **Editor/session state** — selection, active tool, lens, zoom, scroll, open section, Composer-mode flag. Never serialized into songs.
- **Derived projections** — the legacy boolean grid, visible cells, detector inputs. Recomputed, never stored.

### 4e. Pitch is musical (written) pitch

`note.pitch` is the musical pitch; **instrument playback transposition is a track/instrument property** (the glockenspiel's existing `up:24` is this concept — it graduates from playback hack to model field). Velocity is continuous internally (0–1); kid-facing UI exposes 4–5 named levels.

### 4f. Tonality is a map, not a constant

One HOME+mode per song initially, but the model reserves `tonalityMap` (per-section or per-range lighting) so modulation, key changes between sections, and borrowed-color contexts don't require a rebuild. No UI until a package needs it.

## 5. The pitch system: lattice + lighting

### 5a. The lattice

A **12-semitone-per-octave lattice**: 7 **wide** lit rows (the palette — full-height plots, guaranteed-good, carrying the layout like piano white keys) + 5 **slim** "crack" rows (unlit, darker, locked until the chromatic milestone, where planting one = *borrowed color magic*). Two octaves ≈ today's field height. B–C and E–F visibly touch (no crack) — semitone geography readable at a glance (fixes the Soft Wobble visual TODO structurally).

**✅ Gate closed (2026-07-19, two-round phone test — `spike/FINDINGS.md` §5):** the lattice ships **strategy A — compressed slim rows with an invisible ±5 px crack hit band** beyond each crack's visual edges (slim effective touch band 22 px; a wide row between two cracks keeps 24 of its 34 px). Owner-measured target practice: **wide 99% / slim 93%**; ±7 px flipped the trade the wrong way (92/97 — wide rows carry most planting), and ±9 over-served cracks (91/100). Benched alternatives: black-key chips (98/90, passed but visually busier — the fallback if real play disagrees); tap-opens-the-crack (never ambiguous — retained as the candidate *pre-unlock* "not yet" gesture); zoom-to-plant. The compressed-row look ships clean: nothing visible changes at the cracks.

### 5b. Lighting = tonality; names optional

- **HOME** (R17): a draggable marker on the row gutter (green rows follow). **MODE**: a separate major/minor switch (sun/moon), extending later to modal lighting patterns (`mist-paths`).
- Lighting is derived: `lit = pattern(mode) rotated to home`. Discoverables: home slid by a fifth changes exactly one lit row (the circle of fifths made physical); major↔relative minor changes only the green rows; major→minor *on the same home* changes several lit rows — a different, equally teachable move.
- Optional labels (per §2.5): row names, a "C major" readout, measure numbers — off by default, available in Studio/Composer mode.

### 5c. Distinct operations (each a future teaching mechanic — never conflated)

| Operation | What moves | What it means |
|---|---|---|
| Drag HOME (notes fixed) | lighting only | *reinterpretation* — same notes, new gravity |
| Drag notes (lighting fixed) | notes only | transposition **against** the key — relationships change |
| Drag both together | notes + lighting | conventional whole-piece transposition — same music, new height |
| Move by rows (lit) vs by semitones | — | scale-degree motion vs exact motion — different tools |

### 5d. Saved tools declare their transposition nature

A stamp is one of: **exact interval shape** (chromatic — keeps quality everywhere), **scale-degree pattern** (adapts to the lighting — a triad stamped on different degrees changes quality, correctly), or **literal pitch fragment**. Both stamping modes are musically valuable; the lattice makes both cleanly implementable. (Supersedes v1's claim that the DESIGN §11 fork "resolves" — it *separates*, which is better.) *Spike addendum:* the gesture prototype confirmed this empirically — a literal-pitch stamp anchored off its home position on a diatonic field silently drops out-of-palette notes, so **the default stamp mode on the garden lens is scale-degree**, with exact/literal as declared alternatives.

### 5e. Lenses and vertical scroll

| Lens | Shows | Who/when |
|---|---|---|
| **Garden** | Only lit rows — today's fields pixel-for-pixel; chromatic notes render as "visitor" seeds pinned between rows (inspectable/editable via tap → their crack breathes open) | all current levels, beginners |
| **Lattice** | wide + slim rows | Studio; post-chromatic levels |
| **Piano roll** | 12 equal rows, pinch-zoom, exact distances | the lab; Soft Wobble revisit; Secret Doors |

The pitch window pans vertically (R16): default ~2 octaves centered on home (range grows toward C3–C7; tune by ear), overview ribbon marks home + off-screen seeds; levels pin the window, Studio frees it.

## 6. The time system

- **Meter & bars (R2):** per-song time signature as a *dance feel* (march 4s · waltz 3s · lopsided later). Bar fence-posts; the beat guide derives from meter. **Snap resolution is independent of meter** (8ths default; 16ths/triplet snap unlockable). Pickups and ties across bars are representable (ticks) before they are teachable.
- **Duration (R6):** drag a seed rightward → it grows a **vine**. A vine means "*hold for this musical duration*" — each instrument realizes it honestly: pads sustain, piano decays undamped, kalimba rings its natural length; **no artificial loop-sustain** unless it genuinely sounds good. Score duration stays independent of acoustic decay.
- **Playback (R12):** play-from-playhead/selection, loop range, count-in + metronome (quiet, optional).
- **Navigation (R8):** column zoom + minimap strip for songs > 2 bars, growing into the section strip.

## 7. Dynamics (R3)

Tools: **sunlight / shade** (louder/softer) — *not* pruning shears (pruning reads as shortening; that's the vine's word). Tap or drag across notes; louder = bigger, more saturated bloom. 4–5 kid-facing levels over a continuous internal velocity; later, paint a crescendo across a selection in one gesture. Drum-pad accents come later (R4-tier rhythm), same model.

## 8. Multi-voice (R5)

Tracks exist in the **model from Phase 0** (today's melody/drums become two tracks); the *UI* ships in Phase 4: translucent layers over one field (active voice full-color, others ~35% ghost), voice chips to switch, per-voice instrument + mute/solo + velocity. Garden framing: voices are creatures/species (roots bass, canopy birds — `deep-roots-high-birds`). Start at 2 voices, cap ~4.

## 9. Sections & form (R9)

- A piece = **section definitions** + an **arrangement list of instances** (never physical copies). Three distinct actions, visible in the path strip: **repeat** (same section referenced again — editing updates all occurrences), **duplicate** (explicit independent copy), **variation** (duplicate, then diverge; a shared-motif reference model can come later if divergence chores hurt).
- The **path strip**: tiles (🌸 A · 🌙 B · 🌸 A) reordered, repeated, cloned. "The path loops back through the meadow." A′ is a duplicate with a tick — the strip labels it A′ automatically.
- Sections may later carry their own meter/tempo/tonality (the maps in §4 make this a data question, not a rebuild).

## 10. Editing, tools, and the gesture grammar

- **Transactions:** every mutation is a semantic operation (place/remove/move/resize/paint/paste/section ops) in a command journal → undo/redo (~100 deep), and later the journal is the seam for cloud revisions (not a CRDT — see §14).
- **Seed tray (R10):** select region → seeds lift into a tray → move / copy / delete / drag-transpose / **save to toolbox as a stamp** (declaring its §5d nature). The toolbox remains the scalability engine (Tiny Motifs' lesson as a power tool).
- **Time surgery:** insert/remove musical time (bar-aware), replacing "redo everything after the mistake."
- **Gesture grammar:** the **input-state table** is written and prototyped (`spike/FINDINGS.md` §2, `spike/gestures.html`): tap empty = plant · tap note = select + handles (tap again = deselect) · drag body = move (whole selection if selected) · drag end handle = resize (vine) · long-press empty (350 ms, 8 px slop) = marquee selection · **drag empty or two-finger = pan** (the spike showed one-finger pan on empty coexists cleanly with tap-plant and long-press-marquee — both pan forms ship). Thresholds (350 ms / 8 px) to be confirmed in the owner's phone test. *Phone-test addendum (2026-07-19):* **any armed/pending mode (stamp placement, and future tools that capture taps) must still route drags to pan**, with the pending action surviving the pan and re-arming on release — the owner hit exactly this dead-end in round 1; and the minimap/section strip is a **scrub control**, never a readout.
- **Desktop baseline (Phase 1):** arrow-key navigation, visible focus, shortcuts for undo/copy/paste/play, marquee select.
- **Inspector (Composer mode only):** a compact panel for the selection — start, duration, pitch/name, velocity, track. Numbers optional, never required.

## 11. Workspaces & capability gating — DECIDED 2026-07-19

- **Levels:** declare lens, pitch window, meter, tools, voice count (the generalization of `unlock`/`palette`/flags). All shipped levels = today's configuration.
- **Studio:** capabilities unlock **by progression** (the hidden-curriculum identity — powers are earned).
- **Composer mode:** an **off-by-default switch in settings** (per account) that unlocks *Studio tooling only* — inspector, all lenses, full range, keyboard entry, optional labels — for players who already know theory and want Tune Garden for composing. It never unlocks level content, famous reveals, or region progression: it opts out of *pacing*, not of the game.
- **Phone portrait = light mode:** listen, tweak, small edits. **Full authoring = landscape/desktop.** The Phase-1 gesture work targets this split explicitly.

## 12. Audio engine & performance (R18, R21)

- **Scheduler:** lookahead scheduling against `AudioContext.currentTime` (browser timers *wake* the scheduler; they never set sound time). Note-on **and note-off** (duration), cancellation/rescheduling on live edits, seek, deterministic loop boundaries, per-track buses feeding the existing mixer. Lands with Phase 0 as an abstraction; fully exercised by Phase 2 (duration) and 4 (voices). **Spike-validated 2026-07-19** (`spike/FINDINGS.md` §3): 10,000 notes at 200 BPM with live edits and forced 30 ms main-thread stalls → zero late notes, p99 wake lateness 3.2 ms, ~4× headroom under a 120 ms lookahead.
- **Background-tab throttling (spike discovery):** browsers throttle timers in hidden tabs to ≥1 s unless the tab is audibly playing; the starvation case is *muted playback in a background tab*. The scheduler must stretch lookahead/wake (~1.5 s / 250 ms) on `visibilitychange` and shrink back on return.
- **Budgets (set by the spike 2026-07-19, enforced after; details in `spike/FINDINGS.md` §4):** target device = ~4-year-old mid-range Android · visible cells ≤ ~1,800 (beyond that, window via R8/R16 paging and pitch scroll, don't grow the DOM) · full grid rebuild ≤ 100 ms on target, incremental restyle ≤ 16 ms · edit latency ≤ 50 ms, plant-to-sound ≤ 60 ms · ≤ 1,000 notes/section, ≤ 8,000 notes/song, ≤ 4 pitched tracks + drums · scheduler alarm if wake-lateness p99 > 80 ms · sample memory ≤ today ×2 until measured on target. Rendering stays DOM but **viewport-based**, so virtualization (or canvas) remains possible without a rewrite.

## 13. Accessibility (R20 — new in v2)

Complete keyboard operation; visible focus and sane focus order; screen-reader names for notes ("C5, bar 2, beat 3, loud") and controls; reduced-motion support; non-color indicators for lit/unlit/home/velocity (shape/size/texture already do much of this); high-contrast support; tap-hold twins for every hover affordance; narration (Polly) never colliding with editor feedback.

## 14. Persistence & sharing — DECIDED 2026-07-19

- **Local:** frequent autosave, crash/session recovery, named checkpoints ("versions" a child can understand and restore).
- **Cloud:** revision numbers per song; last-writer-wins with a revision check (two devices editing = second gets a gentle "newer version exists" fork prompt).
- **Sharing = snapshot + remix-with-ancestry.** A shared link opens an immutable snapshot; "remix" creates a copy carrying provenance (author chain). **Live co-editing is explicitly deferred** — the founding co-op vision stays on the map, and stable IDs + the transaction journal are the seams that make it feasible later, possibly as one of several modes. No CRDT now.

## 15. Compatibility & migration (R13, R15)

- **Detector strategy:** shipped detectors keep reading the projected `grid[r][c]` (recomputed on mutation) — but the projection is a **temporary adapter, not the permanent interface**. A small musical query API grows beside it: `notesStartingAt(t)`, `notesSoundingAt(t)`, `pitchesAt(t, track?)`, `onsetGrid({resolution, track})`, `notesInRange(r)`. New detector families (duration, dynamics, voices, sections) are built on queries from day one; old ones migrate opportunistically.
- **Save v4** = ticks (`ppq`), IDs, tracks, sections + arrangement, velocity, meter/tempo/tonality maps. v3 loads forever (up-convert: one section, one melody + one drum track, col·48 ticks, default velocity, 4/4). The packed wire format gains optional tail fields; old `#s=` links never break.
- **FAMOUS library:** unchanged short-term; real duration eventually ends the "re-strike ties" workaround (entries can then carry honest `len`).

## 16. Build phases (revised)

**Spike (before Phase 0) — decide by building throwaways:** ratify PPQ + document-model details; gesture-grammar input-state table + phone prototype; **slim-row touch prototype** (§5a gate); scheduler skeleton benchmark; performance budgets. Output: short addenda to this doc.
**✅ SPIKE COMPLETE 2026-07-19** (prototypes in `spike/`, deployed at `/spike/`; record in `spike/FINDINGS.md`). All five deliverables decided: PPQ 96 (§4b) · gesture grammar table + pan findings, thresholds 350 ms / 8 px phone-confirmed (§10) · scheduler validated + background-tab rule (§12) · budgets (§12) · garden-lens stamp default = scale-degree (§5d) · **slim-row touch = strategy A, ±5 px crack reach, phone-measured 99% wide / 93% slim** (§5a). Next: Phase 0.

0. **Foundation** — note objects with IDs + tick time; tracks in the model; transaction API; legacy grid projection; versioned serialization + v3 conversion; scheduler abstraction; local autosave. Invisible to players. **✅ BUILT 2026-07-19:** the doc (`{version, ppq:96, tempoMap/meterMap/tonalityMap seams, tracks, sections, arrangement}`) is the source of truth; `grid`/`drumG` are projections recomputed per transaction; all writers route through model ops (`modelSetCell`/`modelSetDrum`/`modelSetCols`/…); `tx()` journals snapshots (cap 100 — Phase 1's undo seam); `currentSong()` serializes from the doc **byte-identically** to the old grid sweep (golden-tested against pre-flip captures, incl. famous encodes and share round-trips); cross-palette songs now keep their TRUE pitch in the doc (the lens snaps, the data doesn't); crafted tools carry IDs; rolling local autosave (debounced 1.5 s, `Store` key `autosave`) fires on every transaction; `Transport` facade owns the playback wake timer (the §12 seam — lookahead engine swaps in behind it in Phase 2).
1. **Recovery & ergonomics** — undo/redo; seed tray (select/move/copy/delete/transpose); insert/delete time; keyboard + focus baseline; play-from-selection. *Biggest immediate QoL win.*
2. **Rhythm & duration** — meter/bars/dance feels; snap model; vines + duration-aware scheduling; loop range, count-in/metronome (→ `two-kinds-of-walking`, full `wind-and-gaps`).
3. **Dynamics + first export** — sunlight/shade, velocity rendering (→ `rain-and-sun`); **MIDI export** (cheap now: ticks + velocity + tracks exist).
4. **Multi-voice UI** — layers, chips, per-voice mixer strips (→ Region 6).
5. **Sections** — path strip, repeat/duplicate/variation, section-aware playback, minimap (→ Region 7); rendered-audio export.
6. **Chromatic lattice** — wide/slim rows (as prototyped), lighting system (HOME drag + mode switch), crack unlock, vertical scroll, piano-roll lens, optional labels (→ Wave D; Soft Wobble revisit). Chromatic UI last; chromatic *model* from Phase 0.

Score-lens/MusicXML: seams reserved (`spelling?`), UI unscheduled.

## 17. Decisions & open questions

**Decided (owner, 2026-07-19):** the §1 ceiling · Studio powers by progression + off-by-default Composer mode (tooling only) · sharing = snapshot + remix-ancestry, live co-edit later · portrait = light mode, full authoring landscape/desktop.

**Decided by the spike (2026-07-19, complete):** PPQ 96 + smallest subdivision (32nd, 16th-triplet) · the gesture grammar and its input-state table, thresholds 350 ms / 8 px phone-confirmed, armed-modes-must-pan rule · scheduler architecture + background-tab lookahead stretching · performance budgets · garden-lens stamp default (scale-degree) · **§5a slim-row touch = strategy A with ±5 px crack reach** (phone-measured 99% wide / 93% slim; black-key chips the benched fallback).

**Open:** crack-tap behavior pre-unlock (strategy B's "breathe open" gesture is a natural candidate for the "not yet" moment) · velocity level names/count (4 vs 5) · section-level meter/tempo divergence timing · scroll range limits by ear · when "can't-sound-bad" defaults start feeling restrictive (watch playtests; the Composer switch is one answer, earned dissonance is the in-game one).

## 18. v2 changelog (what the 2026-07-19 review changed)

**Adopted:** ticks-not-columns; stable IDs; three-state separation; grid-as-temporary-adapter + query API; sections as definitions/instances; principle rewordings (engine-not-editor; names optional-not-forbidden; touch-complete-not-touch-only); two new principles (reversibility; precision under friendliness); HOME/mode operation disambiguation; stamp transposition modes as declared tool properties; tonalityMap + written-vs-sounding-pitch seams; real scheduler; autosave/recovery; accessibility + performance-budget requirements; sun/shade replacing shears; 4–5 dynamic levels over continuous velocity; slim-row + gesture prototype gates; export sequence (MIDI early); spike-before-Phase-0; the §1 ceiling framing.

**Consciously diverged / scoped:** notation intent (spelling/beaming/voices) stays a *reserved seam*, not designed, until MusicXML is ratified as a goal; the inspector exists only behind Composer mode; live collaboration deferred without picking a mechanism; canvas rendering deferred behind viewport-based DOM.

---

*Update this file as phases land; log shipped phases in `DESIGN.md`'s feature log as usual.*
