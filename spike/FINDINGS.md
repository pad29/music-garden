# Editor Spike — Findings

*The Spike phase from `EDITOR-DESIGN.md` §16: decide by building throwaways. Everything in `spike/` is disposable — only this document and the addenda it feeds back into `EDITOR-DESIGN.md` survive. Started 2026-07-19.*

**Prototypes** (deployed at `tunegarden.game/spike/…` once pushed; all run from `file://` too):

| Page | Gate it serves |
|---|---|
| `lattice-touch.html` | §5a slim-row touch gate — 4 strategies, target-practice scoring |
| `gestures.html` | §10 gesture grammar — full candidate grammar on a tick-based model |
| `scheduler.html` | §12 scheduler skeleton + benchmark; DOM render bench for budgets |

Status: ✅ = decided by this spike · 🧪 = instrumented, awaiting the owner's phone test.

---

## 1. PPQ ratification — ✅ PPQ = 96

Divisibility of 96 per quarter note: 16ths = 24, 32nds = 12, 8th-triplets = 32, 16th-triplets = 16, dotted anything = exact. Not representable: quintuplets (96/5) and septuplets (96/7).

**Ratified: PPQ = 96, smallest supported subdivision = 32nd note and 16th-triplet.** Quintuplets/septuplets are out of scope for the §1 ceiling (we are not a notation app); if MIDI export wants the standard 480 PPQ, multiply by 5 losslessly at export time. v3 songs convert exactly (`col · 48`). Nothing in the benchmarks pushed back on integer ticks.

## 2. Gesture grammar — 🧪 table written, prototype passes on desktop

The input-state table (the §10 deliverable). SLOP = 8 px, LONG_PRESS = 350 ms.

| State | Event | Next state / action |
|---|---|---|
| IDLE | down on empty | DOWN_EMPTY (arm long-press timer) |
| IDLE | down on note | DOWN_NOTE |
| IDLE | down on handle (selected note's right edge) | DOWN_HANDLE |
| IDLE | second pointer down | PINCH_PAN |
| DOWN_EMPTY | up before slop/timer | **plant** (+ clear selection) → IDLE |
| DOWN_EMPTY | move > slop | PAN (one-finger pan on empty) |
| DOWN_EMPTY | 350 ms hold, < slop | MARQUEE (ring animation = the cue) |
| DOWN_NOTE | up before slop | **select** (tap again = deselect) → IDLE |
| DOWN_NOTE | move > slop | DRAG_NOTE (whole selection if note ∈ selection) |
| DOWN_HANDLE | move | **resize** (vine grows, min 1 column) |
| MARQUEE | move / up | stretch rect / **commit selection** → IDLE |
| DRAG_NOTE / DOWN_HANDLE / MARQUEE→ops | up | one journal transaction each |
| any | Esc | cancel to IDLE |
| STAMP (after Copy) | tap | **place fragment** → IDLE |

Desktop baseline in the prototype: Ctrl+Z/Y, Delete, Space = play, wheel = pan. All verified programmatically (plant/select/move/resize/marquee/group-delete/stamp/undo/redo/pan).

**Design finding — one-finger pan on empty works.** The candidate grammar in §10 said "two-finger or gutter drag = pan"; the prototype shows drag-on-empty = pan coexists cleanly with tap-to-plant (slop threshold separates them) and with marquee (long-press separates it). Two-finger pan also works. Both should ship; phone test to confirm the 350 ms / 8 px numbers feel right.

**Design finding — §5d is real, not theoretical.** The spike's stamp is a *literal-pitch* fragment; stamping it anchored off its home position on a diatonic field silently drops out-of-palette notes (verified: a 5-note motif stamped a third down landed 1 note). On the garden lens the default stamp mode must be **scale-degree**, with literal/exact as declared alternatives — exactly the §5d taxonomy.

## 3. Scheduler — ✅ architecture validated (desktop numbers)

Lookahead 120 ms, wake timer 25 ms, note-on **and** note-off, seek = re-anchor, loop wrap, live-edit rescheduling by re-anchoring the schedule window. Measured (desktop Chrome, hidden tab, real AudioContext):

| Test | Result |
|---|---|
| 2,000-note song, 4 voices + drums, 120 BPM | avg wake lateness **1.1 ms**, p99 **2.5 ms**, late notes **0** |
| 10 × 30 ms forced main-thread stalls during playback | max lateness 26.9 ms, late notes **0** (93 ms headroom held) |
| 10,000 notes at 200 BPM + live edits + stalls | p99 **3.2 ms**, max 7 notes scheduled per wake, late notes **0** |
| Seek to bar 9 / loop bars 1–4 / live tempo change | all clean — re-anchor pattern handles every case |

**Verdict: the §12 design (timers wake, `AudioContext.currentTime` owns) is comfortably sufficient.** 120 ms lookahead absorbs 30 ms UI stalls with ~4× margin; even a 90 ms GC pause would not drop a note.

**New requirement discovered — background-tab throttling.** Browsers throttle timers in hidden tabs to ≥1 s *unless the tab is audibly playing* (audio playback exempts it — which is why these hidden-tab numbers are clean). The dangerous case is playing **muted** in a background tab: timers throttle, 1 s ≫ 120 ms lookahead, playback starves. The production scheduler must listen to `visibilitychange` and stretch lookahead (~1.5 s) + wake interval when hidden, shrinking back on return. Add to §12.

## 4. Performance budgets — ✅ proposed

Measured DOM render bench (desktop; build = create + first layout, restyle = recolor ⅓ of cells):

| Grid | Cells | Build | Restyle |
|---|---|---|---|
| today's field (14×32) | 448 | 2.7 ms | 0.3 ms |
| 2-octave lattice, 8 bars (24×64) | 1,536 | 7.6 ms | 1.0 ms |
| worst case (25×128) | 3,200 | 14.6 ms | 2.4 ms |

Derating desktop ×10 for a low-end phone, proposed budgets (to §12):

- **Target device:** a ~4-year-old mid-range Android (2022 A-series class).
- **Visible cells ≤ ~1,800** (2 octaves × 8 bars at 8th snap). Beyond that, *windows*, not bigger DOM: horizontal paging/minimap (R8) and vertical pitch scroll (R16) keep the visible grid bounded. Full rebuild ≤ 100 ms on target; incremental restyle ≤ 16 ms (one frame).
- **Edit latency** (touch → visual) ≤ 50 ms; plant-to-sound ≤ 60 ms.
- **Notes:** ≤ 1,000 per section, ≤ 8,000 per song (10k benchmarked clean; 8k leaves margin), tracks ≤ 4 pitched + drums.
- **Scheduler:** lookahead 120 ms / wake 25 ms foreground; 1.5 s / 250 ms hidden; alarm if wake-lateness p99 > 80 ms.
- **Sample memory:** cap sample packs at today's footprint ×2 until measured on the target device.

## 5. Slim-row touch — 🧪 instrumented, needs the phone test (the real §5a gate)

Four strategies, all functional, switchable live in `lattice-touch.html`; target practice alternates wide/slim targets and scores accuracy, error, and time per strategy.

| | Strategy | Cost | Notes from desktop verification |
|---|---|---|---|
| A | Invisible ±9 px hit bands on cracks | a wide row between two cracks keeps only ~16 of its 34 px as its own — **wide rows get worse to protect slim ones** | hit-test works; the cost is invisible, which may make wide misses feel unfair |
| B | First tap opens the crack, second plants | two taps per crack note | never ambiguous; pre-unlock the same gesture naturally says "not yet"; crack auto-closes 2.6 s |
| C | Piano-style black-key chips (taller than the crack, horizontally inset, floating over the boundary) | chips occlude part of the wide rows | the piano industry's own answer; column-edge taps correctly fall through to wide rows |
| D | Cracks unplantable until zoom; tapping one auto-zooms 2× toward it | a mode + zoom-out step | everything ≥ 24 px while zoomed; pairs naturally with R16 vertical scroll |

**Gate criteria:** slim-row accuracy ≥ 90% in target practice on a phone, wide-row accuracy not degraded below ~95%, and it has to *feel* okay — B and D trade taps for certainty, A and C trade precision for directness. Hybrids are legal (e.g. C for look + B for pre-unlock cracks).

## 6. What feeds back into EDITOR-DESIGN.md

Now (this spike): PPQ 96 ratified (§4b) · input-state table adopted + one-finger-pan finding (§10) · stamp default = scale-degree on garden lens (§5d) · scheduler validated + **background-tab lookahead stretching** added (§12) · budget numbers (§12).

After the owner's phone test: the §5a strategy decision, the ratified touch thresholds (350 ms / 8 px), and the D-vs-scroll interaction if zoom wins.
