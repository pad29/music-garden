# Tune Garden — Long-Term Editor Design

*Companion to `DESIGN.md` (vision), `PACKAGES.md` (content DAG), and `SAVE-SHARE.md` (song format). This document is the source of truth for how the **editing surface** evolves as the remaining systems land (meter, duration, dynamics, multi-voice, sections, chromatic). Drafted 2026-07-16 from the owner + Claude design session.*

**Status: DESIGN — nothing here is built yet.** Build phases at the bottom; each phase ships value on its own.

---

## 0. Why now

Every remaining package wave is gated on an editor capability (meter → `two-kinds-of-walking`; duration → R3/Region 7; dynamics → `rain-and-sun`; multi-voice → Region 6; sections → Region 7; chromatic → Wave D). Designing the editor once, now, means each of those systems lands as a planned part of one architecture instead of four bolted-on rebuilds.

## 1. Principles (non-negotiable)

1. **It stays a garden.** Seeds, plots, blooms, tools, creatures. Every new power arrives as a metaphor (vines, watering can, seed tray), never as DAW chrome. Can't-sound-bad remains the *default* experience; danger is opt-in and earned.
2. **One editor everywhere.** Levels and the Studio share a single engine; levels *constrain* it (the per-level `unlock` system generalizes into per-level lens/tool configuration). No separate "pro editor."
3. **Notes are objects; the grid is a lens.** The model is a list of notes `{pitch, start, len, vel, voice}` (the v3 save format already stores exactly this). The visible field is one of several *lenses* rendering that model. Every requirement below becomes a view/tool question, not a data question.
4. **The model is chromatic; the lens does the filtering.** Twelve semitones per octave is the data truth (it already is — all physics run on MIDI). Palettes, keys, and "can't-sound-bad" are *lighting*, applied by the lens.
5. **Touch-first.** Every interaction is designed on a phone mockup first; hover-only affordances get tap-hold twins; targets ≥ 40px.
6. **Never break shipped content.** 19 packages of goal detectors, the FAMOUS library, saved songs, and share links keep working at every phase (see §8).

## 2. Requirements catalog

Gathered 2026-07-15/16 (owner items 1–5, jointly extended). **P** column = build phase (§9).

| # | Requirement | Notes | P |
|---|---|---|---|
| R1 | Chromatic pitch without a 24-row wall | → the lattice + lenses (§3) | 6 |
| R2 | Meter and bars | per-song time signature, framed as dance feels | 2 |
| R3 | Dynamics (louder/softer) | per-note velocity, watering-can tool | 3 |
| R4 | Editing ergonomics | undo/redo, insert/delete columns, select/copy/paste | 1 |
| R5 | Multiple voices | layers over one field, per-voice instrument | 4 |
| R6 | Note duration | `len` exists in v3 but is ignored; vines UI | 2 |
| R7 | Undo/redo | called out from R4 — the single biggest pain reliever | 1 |
| R8 | Horizontal scale & navigation | bar paging, zoom, minimap; structural fix is R9 | 2/5 |
| R9 | Sections and repeats (form) | A/B blocks + arrangement strip; gates Region 7 | 5 |
| R10 | Selection model | one gesture (seed tray) shared by copy/move/delete/transpose | 1 |
| R11 | Touch-first interaction | no hover-only affordances; 40px+ targets | all |
| R12 | Playback tools | play-from-here, loop selection, per-voice mute/solo | 2/4 |
| R13 | Level-detector compatibility | grid-projection adapter (§8) | 0 |
| R14 | Garden identity | see Principles 1 | all |
| R15 | Save format v4 + share compat | §7; old links keep loading | 0+ |
| R16 | Vertical scroll of the pitch field | the range window pans; home stays findable | 6 |
| R17 | Home + mode as direct controls | draggable HOME marker + a separate major/minor (later modal) switch — never a "key list" | 6 |

## 3. The pitch system: chromatic lattice + lighting

### 3a. The lattice

The field is a **12-semitone-per-octave lattice**. Rows come in two visual classes:

- **Wide rows** — the 7 pitch classes lit by the current lighting pattern (the palette). Full-height plots, bright, guaranteed-good. These carry the layout, like a piano's white keys.
- **Slim rows** — the 5 unlit pitch classes ("the cracks"). Visually narrow (~⅓ height), darker, initially **locked**; they unlock at the chromatic milestone (Wave D `secret-doors`), where planting in a crack is framed as *borrowed color / rare magic*.

Two octaves ≈ 14 wide + 10 slim rows ≈ barely taller than today's diatonic field. Where B–C and E–F meet there is visibly *no crack* — semitone geography becomes readable at a glance (fixes the Soft Wobble TODO structurally).

### 3b. Lighting = tonality (no key names, ever)

A "key" is two independent, physical controls — never a list of 24 key names:

- **HOME** (R17): a draggable marker on the row gutter (or tap a row label). The home rows tint grass-green — exactly today's tonic-row grammar. Dragging home re-tints instantly; the melody does not move.
- **MODE**: a separate toggle — **major / minor** at first (sun/moon iconography, reusing the Sun & Moon Garden language), later extensible to modal lighting patterns (`mist-paths`: each mode = a different 7-of-12 pattern, i.e., a different *atmosphere*).

Lighting is derived: `lit pitch-classes = pattern(mode) rotated to home`. Consequences the player can *discover*:

- Slide home by a fifth → **exactly one lit row changes** (the circle of fifths as a physical fact, not a diagram).
- Major ↔ relative minor → **zero rows change width; only the green home rows move** (the relative-major/minor truth, visible).
- Transposition = drag the melody (or the lighting) up/down; same shape, same sound. This also resolves DESIGN §11's tool-transposition fork: on the lattice, shape-based and fixed-quality stamping are the same operation.

`setMood` (sun/moon) and `setColorReveal` (F/B staged reveal) are early, hard-coded special cases of this general lighting system and fold into it.

### 3c. The three lenses (one model, three views)

| Lens | Shows | Who/when |
|---|---|---|
| **Garden** (default, teaching) | Only the lit rows — pixel-for-pixel today's pentatonic/diatonic fields. Cracks hidden entirely. | All current levels, beginners. Nothing about the early game changes. |
| **Lattice** (main composing view) | All rows, wide + slim as above. | Studio + post-chromatic-unlock levels. |
| **Piano roll** (the lab) | 12 equal-height rows, pinch-zoom, geometrically exact distances. | Optional per-level/Studio toggle; the Soft Wobble revisit; Secret Doors. |

A chromatic note viewed through the Garden lens renders as a "visitor" seed pinned between rows (it exists in the model; the lens just has no row for it).

### 3d. Vertical scroll (R16)

The pitch window pans vertically over a larger range (e.g., C3–C7 eventually). Default window ≈ 2 octaves centered on home; drag/swipe the row gutter to pan; a slim overview ribbon marks home and any off-screen seeds. Levels pin the window (teaching stays framed); the Studio frees it. On phones the window narrows (≈ 1.5 octaves) rather than shrinking row heights below touch size.

## 4. The time system

- **Meter & bars (R2):** per-song time signature chosen as a *dance feel* (march 4s · waltz 3s · lopsided 2+3 later). Bar lines render as fence posts; the beat guide generalizes (`beatcol` logic derives from meter, not hard-coded %4). Snap, paging, and the playhead loop respect bars. `two-kinds-of-walking` = this system's teaching package.
- **Duration (R6):** planting stays tap = 1 step. **Drag a planted seed rightward and it grows a vine** — length renders as a rounded pill across cells; the player hears sustain (needs a sustain-capable envelope per voice; plucked voices max out at their natural ring). `len` already exists in v3; the editor and the tick scheduler start honoring it.
- **Zoom & navigation (R8):** pinch/buttons switch column zoom (8th-note vs bar-level); a minimap strip appears for songs > 2 bars — which grows into the section strip:
- **Sections (R9):** a piece = a sequence of **fields** (sections). Each section is edited as today's single field; above the editor a **path strip** shows tiles (🌸 A · 🌙 B · 🌸 A) that can be reordered, repeated, and cloned-then-varied. "The path loops back through the meadow." This is the structural answer to long pieces (verse/chorus = 3 sections + arrangement, not 200 columns) and gates Region 7.

## 5. Dynamics (R3)

Per-note velocity, no numbers ever: the **watering can / pruning shears** tools. Tap notes (or drag across a run) with the can → louder; shears → softer. Rendering: louder = larger, more saturated bloom; softer = smaller, paler. Audio: velocity → per-note gain (the synth/sample chain already takes a gain). `rain-and-sun` = the teaching package; crescendo prompts ("water the whole climb") come free.

## 6. Multi-voice (R5)

- **Layers over one field**, like translucent sheets: the active voice renders full-color; other voices ghost at ~35% behind it. Tap a voice chip to switch. (Drum lanes stay their own thing — they already work.)
- Per-voice: **instrument** (the existing sampled-voice picker), **mute/solo**, and its own velocity. v3 tracks already carry `voice`.
- Garden framing: voices are *creatures/species* — the roots (bass), the canopy birds (melody) — matching `deep-roots-high-birds`. Layer count starts at 2, caps at ~4.
- Playback: `tick()` iterates tracks; the mixer (already shipped) gets per-voice strips.

## 7. Editing tools & the toolbox (R4, R7, R10)

- **Undo/redo (R7):** every mutation goes through a command journal (place/remove/move/resize/paint-velocity/paste/section ops). Two buttons + two-finger-tap gesture. Depth ~100. Ships first; instantly heals the "one mistake = redo everything" pain.
- **Seed tray (R10):** drag-select a rectangle → seeds lift into a floating tray → **move** (drag), **copy** (tray keeps a copy), **delete**, **transpose** (drag the tray up/down — on the lattice this is real transposition), **stamp elsewhere**.
- **Column surgery:** insert/remove a column (bar-aware) at the playhead — the other half of the "fix a mistake mid-melody" pain.
- **Toolbox unification:** a tray selection can be **saved to the crafting toolbox as a stamp** — chords today, melodic fragments tomorrow. The toolbox becomes the scalability engine (write a motif once, stamp it everywhere — Tiny Motifs' lesson turned into a power tool). Stamps store *pitch-relative* content and transpose on placement.

## 8. Compatibility & migration (R13, R15)

- **Detector adapter:** goal-checkers keep reading `grid[r][c]`. After the model flip, `grid` becomes a **projection** of the note model through the current lens (recomputed on mutation). Every shipped detector — `colWobble`, `motifEcho`, `chordSyms`, contour, density — works unchanged. New systems (len/vel/voice/section) get new detector families as their packages need them.
- **Levels constrain the editor:** each level declares its lens (garden/lattice/roll), pitch window, meter, available tools, and voice count — the generalization of today's `unlock`/`palette`/flag fields. All shipped levels default to exactly today's configuration.
- **Save format v4** = v3 + honored `len`, new `vel`, `meter`, `sections:[{id, bars, tracks}]` + arrangement list, per-track instrument (already there). v3 links load forever (v3 → v4 up-conversion = one section, vel=default, meter 4/4). The wire format stays the packed positional array with new optional tail fields.
- **FAMOUS library:** unchanged short-term; long-term wins — real held notes end the "re-strike ties" workaround, and drum-famous entries gain meter.

## 9. Build phases (each ships alone; package unlocks in parentheses)

0. **Model flip** — notes-as-objects inside; grid becomes a projection; detector adapter; invisible to players. *The prerequisite for everything.*
1. **Ergonomics** — undo/redo, seed tray (select/move/copy/paste/transpose), insert/delete column. No visual redesign. *Biggest immediate QoL win — worth shipping fast.*
2. **Duration + meter** — vines, fence-post bars, dance-feel picker, generalized beat guide, play-from-here (→ `two-kinds-of-walking`, full `wind-and-gaps`, R3 tier).
3. **Dynamics** — watering can / shears, velocity rendering + gain (→ `rain-and-sun`).
4. **Multi-voice** — layers, voice chips, per-voice instrument + mute/solo (→ Region 6: `deep-roots-high-birds`, `lantern-chorus`).
5. **Sections** — path strip, repeats, section-aware playback + minimap (→ Region 7: `rooms-and-paths`, `return-of-the-meadow`).
6. **Chromatic lattice** — wide/slim rows, lighting system (draggable HOME + mode switch), crack unlock, vertical scroll, piano-roll lens (→ Wave D: `secret-doors`, `mist-paths`; Soft Wobble visual revisit; full transposition).

Order rationale: 1 pays down today's pain; 2–5 unblock content waves in DAG order; 6 is last because Wave D is last *and* the lattice benefits from every earlier tool existing (tray-transpose is what makes lighting-slides fun).

## 10. Open questions

1. **Crack interaction pre-unlock:** invisible (garden lens) vs. visible-but-locked (lattice) — probably level-configurable; what does *tapping* a locked crack do (gentle shimmer + "not yet discovered"?).
2. **Vine audio on plucked voices:** sustain is real for synth pads but a fiction for kalimba/glock — accept natural decay (a vine = "let it ring", no re-strike), or add a gentle loop-sustain per sample?
3. **Phone portrait:** commit to landscape-first with a portrait "listen + light edits" mode, or invest in a true portrait layout (rotated field)?
4. **Section variation:** is "clone section then edit" enough (risk: divergence chores), or do sections support a shared-motif reference (edit once, updates everywhere)? Start with clone; revisit at Region 7.
5. **Velocity on drums:** same watering can on the pads? (Probably yes, later — accents are an R4-tier rhythm concept.)
6. **How far does the range scroll go** before it hurts can't-sound-bad (muddy bass / shrill top)? Start C3–C7, tune by ear.

---

*Update this file as phases land; log shipped phases in `DESIGN.md`'s feature log as usual.*
