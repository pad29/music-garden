# Playback goldens

`playback.json` pins what the engine **sounds**, so a change to the audio scheduler can be proved
inaudible. It exists because Phase 2 replaces the step-timer with a lookahead scheduler, and a
mistake there is audible on *every* level rather than in one corner of the UI.

The asserted invariant is **musical, not wall-clock**: for every step that sounds, which melody rows
and which drum lanes fire, and at which ideal step position (`at`). Level swing delays the "ands" by
one whole step, so step 2 sounds at 3 — that mapping is part of the golden.

`beforeDriftMs` records how far the *old* step-timer actually landed from that ideal (max 13–20 ms).
It is a reference point, not a pass condition: the lookahead scheduler must keep every `steps` entry
identical and should drive drift toward zero.

`D_jam` is a content-only case. Jam adds a groove-dependent shuffle to odd steps that `at` doesn't
model, so its drift figure is model mismatch rather than jitter.

## Re-capturing

Serve the app (`.claude/launch.json` → "music-garden", port 8377) or open `index.html` directly, then
in the console:

```js
// 1. instrument — wrap every scheduling call so we see what got booked, and for when.
//    THE THIRD ARGUMENT MATTERS: playRow(r,t,hold) carries a vine's length in seconds, and the
//    wrapper this file shipped until 2026-08-28 was `(r,t) => origPlayRow(r,t)` — a two-arg arrow
//    that dropped it both from the recording AND from the call. Any golden captured with it would
//    have played, and pinned, staccato. Forward every argument you are not deliberately reading.
const origPlayRow = playRow, origJam = jamStep, origBook = bookColumn, origVoice = voice,
      origDrum = DRUMS.map(d => d.play);
window.__install = () => { window.__cap = { ev: [], t0: null, voices: false };
  const rel = t => { const c = window.__cap; if (c.t0 === null) c.t0 = t;
                     return +((t - c.t0) * 1000).toFixed(2); };
  window.playRow = (r, t, hold) => { const c = window.__cap;
    if (c) c.ev.push({ k:'n', step, r, h:+(+(hold||0)).toFixed(5), dt:rel(t) });
    return origPlayRow(r, t, hold); };                       // ← forward `hold`
  window.jamStep = (s, t) => { const c = window.__cap;
    if (c) c.ev.push({ k:'j', step:s, dt:rel(t) }); return origJam(s, t); };
  // bookColumn: which COLUMNS were booked, and at which tick. The loop wrap books a column whether
  // or not anything sounds in it, so a loop golden that records only notes cannot see the wrap.
  window.bookColumn = (col, tk) => { const c = window.__cap;
    if (c) c.ev.push({ k:'b', col, tk }); return origBook(col, tk); };
  // voice(): playFamous sounds its sweep through voice() DIRECTLY, never through playRow — so
  // without this the famous reveal is invisible to the harness. Opt in with __cap.voices = true,
  // or every ordinary note is recorded twice.
  window.voice = (i, f, t, hold) => { const c = window.__cap;
    if (c && c.voices) c.ev.push({ k:'v', f:+f.toFixed(2), h:+(+(hold||0)).toFixed(5), dt:rel(t) });
    return origVoice(i, f, t, hold); };
  DRUMS.forEach((d, i) => { d.play = t => { const c = window.__cap;
    if (c) c.ev.push({ k:'d', step, d:i, dt:rel(t) }); return origDrum[i](t); }; }); };
window.__uninstall = () => { window.playRow = origPlayRow; window.jamStep = origJam;
  window.bookColumn = origBook; window.voice = origVoice;
  DRUMS.forEach((d, i) => d.play = origDrum[i]); };

// 2. run one configuration for real time, then read window.__cap.ev
```

Gotchas that have each cost a round:

- `step` is a script-scope `let`, so it is **not** on `window` — reference it bare, as above.
- `playRow`, `jamStep`, `bookColumn` and `voice` are all function *declarations*, so reassigning
  `window.<name>` really does intercept them. `stepDur` and `tick2time` are `const` arrows and are
  **not** on `window` — those you can only read the results of, never intercept.
- The Studio loops, so a run longer than `cols * stepDur` replays step 0. Keep only the first pass
  (`dt < cols * stepDur - 1`) or the reduction merges two passes into one step.
- Pick a **synth** voice (`musicbox`) before capturing. A sampled voice loads its pack asynchronously
  and can race the first column of the run.

## The nine configurations

A–E (2026-07-27) are melody-only, melody+drums, level swing, jam and a fast tempo — between them they
exercise straight timing, both swing paths, the drum lane, and tempo scaling.

F–I (2026-08-28) were added *before* the meter/bars work, because `EDITOR-DESIGN.md` §17 found the
original five blind to exactly the class of change meter introduces — "a snap change can leave every
recorded wall-clock step identical while turning two bars into one":

- **`F_vine_holds`** — held notes. The one thing the broken wrapper could never have seen.
- **`G_loop_wrap`** — booked columns across the loop wrap, from `loopStart` 0 and 8. Its finding is
  worth reading even if you never re-capture it: **`bookTick` is monotonic across the wrap and never
  resets**, so a loop's tick timeline stays continuous while only the column jumps back.
- **`H_short_field`** — `COLS = 12`, a length that is a multiple of neither 16 nor 8.
- **`I_famous_sweep`** — `playFamous("swinglow")`, the reveal's own scheduler, which no golden had
  ever touched.

Each F–I entry records its own `setup` line, so it can be re-captured without guessing the bed. A–E
do not, and were reconstructed from the code when this note was written; if you re-capture one, record
its setup the same way.

**What no golden here can do.** Two blind spots, and the second was found the hard way.

They pin *scheduling* — which rows and lanes fire, when, and for how long — and are completely blind to
*drawing*. A barline at the wrong column, a bar numbered wrong, or a beat mark at the wrong density is
invisible to all nine. Use unit tests and a browser for that, and never let a green golden run stand in
for looking at the field.

**They are also blind to what the BAND plays** (recorded 2026-08-29). `D_jam` looks like groove coverage
and is not: the wrapper records only that `jamStep` was called, and a groove's own `kick`/`snare`/`hat`
go straight onto `jamBus` rather than through `DRUMS[i].play`, which is the only percussion intercepted
here. That is why every `D_jam` step reads `drums: []` while a drum kit is audibly playing. **A complete
rewrite of the groove content re-captures `D_jam` byte-identically** — a design review caught a proposed
refactor that would have quadrupled every groove's chord cycle and offered this golden as the proof it
was safe. It would have agreed.

What the band plays is pinned instead by `tests/groove.test.mjs`, against `groovePlan` — a pure function
extracted for exactly that reason, with a verbatim copy of the shipped logic kept in the test as its
oracle. **The general lesson, which is the same one `meterLayout` taught:** when a golden cannot see a
thing, the answer is to make that thing a pure function and compare it, not to trust the golden harder.
