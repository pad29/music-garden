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
// 1. instrument — wrap every scheduling call so we see what got booked, and for when
const origPlayRow = playRow, origJam = jamStep, origDrum = DRUMS.map(d => d.play);
window.__install = () => { window.__cap = { ev: [], t0: null };
  window.playRow = (r, t) => { const c = window.__cap; if (c) { if (c.t0 === null) c.t0 = t;
    c.ev.push({ k:'n', step, r, dt:+((t - c.t0) * 1000).toFixed(2) }); } return origPlayRow(r, t); };
  window.jamStep = (s, t) => { const c = window.__cap; if (c) { if (c.t0 === null) c.t0 = t;
    c.ev.push({ k:'j', step:s, dt:+((t - c.t0) * 1000).toFixed(2) }); } return origJam(s, t); };
  DRUMS.forEach((d, i) => { d.play = t => { const c = window.__cap; if (c) { if (c.t0 === null) c.t0 = t;
    c.ev.push({ k:'d', step, d:i, dt:+((t - c.t0) * 1000).toFixed(2) }); } return origDrum[i](t); }; }); };
window.__uninstall = () => { window.playRow = origPlayRow; window.jamStep = origJam;
  DRUMS.forEach((d, i) => d.play = origDrum[i]); };

// 2. run one configuration for real time, then read window.__cap.ev
```

Two gotchas that cost time the first round:

- `step` is a script-scope `let`, so it is **not** on `window` — reference it bare, as above.
  `playRow`/`jamStep` *are* function declarations, so reassigning `window.playRow` really does
  intercept them.
- The Studio loops, so a run longer than `cols * stepDur` replays step 0. Keep only the first pass
  (`dt < cols * stepDur - 1`) or the reduction merges two passes into one step.

The five configurations are melody-only, melody+drums, level swing, jam, and a fast tempo — chosen so
that between them they exercise straight timing, both swing paths, the drum lane, and tempo scaling.
