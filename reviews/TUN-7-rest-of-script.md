# TUN-7 — Move the rest of the script out, leaving index.html as markup and styles

Branch `claude/tun-7-rest-of-script` · PR #82

The inline script (old `index.html` L993–L8862, everything from `// ---------- Grid ----------` on) moved
line for line into 23 classic scripts cut at the section landmarks, the last of them `js/boot.js`, the
load-time sequence. One block moved: the surprise reveals (`runReveal`, `structureReveal`, `bigRise` and
their `let`s) now open `js/packages.js`, because `PACKAGES` names `structureReveal` while it loads. A new
first game script, `js/load-gate.js`, came out of the design review (below). Apart from it, boot's guard
and three comment headers, every file is the old script byte for byte.

**How the cuts were checked before any code moved.** A scope-resolving checker (acorn, bundled with Node)
listed every load-time reference that would reach a later file — directly, through synchronous calls,
through object-literal methods, and through arrows handed to synchronous calls — plus reads inside `try`
and `typeof` probes. It found two real hazards, and both shaped the layout: `PACKAGES`' bare
`reveal:structureReveal` (→ the one reorder), and `questRegistry(…)`, which runs at load and calls
`deepFreezeQuest` from the "What the garden says back" section (→ those two sections stay one file,
`js/quest-engine.js`). What it still flags is dead at load: the `setPlayScope(…)` call at load cancels an
empty completion session, whose reducer returns no effects, so `onCompletePass` and everything behind it
never run. The tools live in the session's scratch space, not the repo.

## Design review (Astra)

GPT: *"I would not accept R1 unchanged. I reproduced partial-load failures, including a click that mutates
the song before throwing. Otherwise, the proposed synchronous ordering looks sound: I found no additional
required reorder."*

1. **Medium — R1: a partially initialized, mutable game between files.** *"After `playback.js`:
   `cellClick()` creates one note and one undo entry, then throws because `bloom` is undefined."* The
   browser handles input while a later script is still arriving; one inline script never allowed it.
   **Agreed** — `js/load-gate.js`, the first game script, swallows every kind of player input at the
   window, in the capture phase, until the page has loaded. Browser defaults are left alone, which is
   exactly the silence of a page with no handlers yet.
2. **Medium — R2: persistent writes after an essential script fails.** *"Boot continued, wrote
   `mg_progress`, then failed with `scheduleCloud is not defined`."* **Agreed** — the gate records any error
   from one of the page's own `js/` scripts (a `<script>` that failed to load, or one that threw — found via
   `document.currentScript` too, since `file://` hides the filename), and `js/boot.js` asks it as its first
   act and throws if anything failed. A broken load starts nothing and saves nothing; the gate stays shut.
   **One deliberate difference from GPT's wording** ("releasing it only after successful boot"): the gate
   opens at DOMContentLoaded once boot has *started* with every script loaded, even if boot throws later.
   With one inline script, a throw in the boot tail left the game wired and interactive; closing the gate on
   it would make that failure a dead page. GPT accepted this in the test pass (*"I accept your boot-tail
   compatibility decision"*), and a test pins it.
3. **Medium — the TDZ argument is not a proof.** A caught read (`try { typeof later } catch {}`) or a
   read that lands on a window named property behaves differently once split. **Agreed** — the claim is
   now bounded to what the checker follows, and the checker was extended: `try` blocks, `typeof` probes and
   `X.m()` calls on top-level object literals, plus an exact rule for callbacks (a reference counts as
   load-time only if every enclosing function is an argument to a synchronous call). Result on the final
   tree: 0 caught reads, 0 probes, no hoisted forward reference outside the dead path above. The browser
   pass met the named-property trap for real: with `js/boot.js` missing, `typeof landingoverlay` is
   "object" — the element, via `window`.
4. **Medium — a same-origin before/after comparison shares state.** **Agreed**, and moot: an unattended run
   cannot start the local server. Everything was checked on the deploy preview, a fresh origin, against
   `playback.json`; TUN-6's sample-pack checks were kept.
5. **Low — R3/R4 claims stronger than their guarantees.** **Agreed** — measured instead (Verification).
6. **Low — names hide ownership.** **Agreed**: `goals.js` became `js/goal-helpers.js`; the README map calls
   out that `js/play-scope.js` also holds narration, `js/helpers.js` the starter content and 💡 Hint, and
   that `js/packages.js` opens with the reveals (a header comment there says why). No further reorders.

## Test pass (Astra)

Briefed as in TUN-5/TUN-6: new test files only, no edits to the harness, helpers, existing tests or game
source; `gen-voice` only with `--dry`. **It complied.** Its run: *"634 passed, 2 failed … Both failures are
new regression tests, left red."* Its findings:

1. **Medium — failure of `load-gate.js` itself exposes partially initialized editing.** With the gate file
   missing or served as HTML, a cell press after `playback.js` planted a note and an undo entry, then threw.
   GPT: *"make the initial input barrier independent of a successful external gate request—for example, the
   ticket-permitted tiny inline bootstrap. Otherwise, explicitly accept this exception."* **Accepted as an
   exception, not fixed.** An inline barrier would put a script back into the page this ticket empties, for
   one file of 29 failing on its own; and when it does, boot still refuses — its guard calls
   `gameScriptsLoaded`, which then does not exist — so nothing is saved. GPT's two red tests asserted the
   barrier; they were rewritten to pin the half that holds (boot throws at its guard, zero storage writes
   even under `?reset`), each rejecting a "defensive" guard that would skip the check when the gate is
   absent. The owner may overrule this (hand-off).
2. **Low — the coverage test misses computed and variable event registrations.** **Agreed** — GPT's
   runtime check (every listener that actually registers must be gated or declared automatic) is kept
   beside the static scan. It found no current gap; the static scan had already caught one while writing
   the gate — the Home map's `pointerleave` — before the gate shipped.
3. **Low — `<base href>` classification.** Found by both of us at once: my browser experiment needed a
   `srcdoc` copy of the page, where `location.href` is `about:srcdoc`, and the gate now resolves the page's
   `js/` folder from `document.baseURI` (commit 531bfbd). GPT's tests pass on it and fail on the revert.

**Files kept:** `tests/load-gate-url-review.test.mjs` (4 tests: page URLs, queries, encoded `file://`
paths, `<base>`, lookalike folders, foreign origins, which error source wins), unchanged;
`tests/load-gate-continuation-review.test.mjs` (12 tests: a loader that carries on after a failed file —
missing, HTML-served, throwing, at the first, middle and penultimate positions — plus masked `file://`
errors, a missing boot, the boot-tail decision, real early cell input, runtime registration coverage,
automatic callbacks, timers and promise jobs between files, and the `?dev` / `?reset` / `#s=` / `#song=` /
stored-profile / signed-in / no-speech / no-storage branches), with the two red tests rewritten as above.
Every test in both files applies its own fault and requires the failure.

## Verification

- **Suite:** 636/636, 0 skipped — the 614 pre-existing tests (the TUN-5 audit test keeps its title; since
  there is no inline script left to relocate, it copies the real page and all its scripts, and checks the
  audit left every file unchanged) plus 6 of mine in `tests/load-gate.test.mjs` and GPT's 16. The 13 faults
  named in `load-gate.test.mjs`'s comments were each applied on disk and caught.
- **Mutation audits,** sorted "caught" lines identical to the pre-split baseline: questsetup 472 mutations
  across 146 green tests; famous-meter 18 faults across 8.
- **`gen-voice --dry`:** 230 stories + 18 credits → 248 clips, 0 to generate, 0 pruned.
- **Byte identity:** each new file equals its original lines; the ranges tile L993–L8862 exactly once; the
  page equals the old one outside the script block except the gate's tag; the only added lines are the
  gate file, boot's 4-line header plus guard, and comment headers on `js/packages.js` (3) and
  `js/level-engine.js` (1).
- **Deploy preview (https, Chromium):** every script served `application/javascript`, byte-identical to the
  commit; `index.html` identical once Netlify's 221-byte drawer snippet is removed. No console errors on
  load. Real clicks: the landing screen, the sign-in form and back, the companion picker, level 1 planted
  and played to its power card. `?dev` (21 packages, a jump into Footsteps with the marimba card). The
  Firefly Crossing end to end with real playback each phase, through its own buttons: compose, fork, edit,
  compare both paths by tapping them, offer — finale shown, run completed, song saved to My Melodies.
  Studio: planting through the real cell handlers, undo/redo, 3/4 and 6/8, save → reload → load. The
  Jukebox (Swing Low at 88). A `#s=` link (fresh tab: clean console). A returning profile skips the
  landing. `?reset`. All seven sample packs decoded.
- **The gate in a real browser:** a same-origin `srcdoc` copy of the page with one script broken. Control:
  gate open, boot ran, ▶ and the mixer respond. A missing `js/quest-engine.js` (Netlify answers with the
  page), a dropped `js/palettes.js` (later files throw), a missing `js/living-garden.js`, a missing
  `js/boot.js`: every time the gate stayed shut, **nothing was written to storage**, and clicks on ▶ and
  the mixer reached nothing.
- **Goldens:** all nine re-captured on the preview: A–F, H, I content-identical to `playback.json`; G 37
  and 30 bookings, prefixes of the recorded 41 and 34 with ticks +48 — TUN-6's counts. D ran at Pop's own
  116 BPM (`applyGrooveTempo`), not the 120 TUN-6's note gives; its steps are in columns and match. The band:
  `jamStep` over 48 columns for all seven grooves, `bTone`/`kick`/`noiseHit` recorded unsounded —
  hash-identical between the pre-split build (loaded in Node from main's page) and the preview. Recorded in
  `playback.json` `_RESULT_2026_09_29`.
- **Startup (R4), measured on the preview over HTTP/2:** 29 scripts, 726 KB decoded / 243 KB transferred;
  a first load reached DOMContentLoaded at 2.0 s; a revalidating load got 29 × 304 (8.7 KB) and
  DOMContentLoaded at 0.18 s. No pre-split baseline (next point).

**Not verified by me:** `file://` — the browser pane renders a `file://` page as a static snapshot, so no
script ran; Firefox and Safari; the phone; anything by ear. A `#song=` link with a real cloud song: on a
deploy preview the songs API refuses the origin (CORS is scoped to tunegarden.game), so the game showed its
"link didn't work" toast — graceful, but it cannot reach a song there. No production capture: running the
golden capture script on tunegarden.game was refused by the session's safety check as changing a shared
browser profile, so `playback.json` is the only old-build baseline for the goldens.

## Owner's review

Pending.
