# TUN-112 — Read a level's story aloud once after signing in, not in two voices at once

Branch `ao/story-narration/root` · Size S · labels `audio`, `Bug`

## Diagnosis (Claude)

The ticket's hypothesis was unverified. It is now confirmed, both halves, in a real browser engine:
headless Edge driven over the DevTools protocol against this worktree, with the cache disabled (as in a
fresh InPrivate window). The probe ran exactly what a successful cloud load runs, `applyProgress();
enterPlay();`, with `speechSynthesis.speak` recorded instead of spoken.

- **Guest picks a buddy, then signs in** (`narrateReady` already true): `renderStage` (inside
  `applyProgress`) narrates the story, then `enterPlay` narrates it again 1 ms later. The second call's
  `stopSpeech()` pauses the first clip while its `play()` is still pending, so that promise rejects with
  `AbortError`, and `narrate`'s fallback reads the story in the **browser voice at 6 ms**. The second
  Polly clip starts at **543 ms**. Two voices, same text, about half a second apart — the owner's report.
- **Sign in straight from the landing screen** (`narrateReady` false): one clip, no browser voice.
  Reloading as a signed-in player takes the same path (boot's resume gate never calls `enterPlay`
  before the load), so it narrates once too.

The same fallback also fires when **Read aloud is turned off** while a clip is still loading (the off
toggle calls `stopSpeech`), and when an instrument card is closed before its clip starts: in both the
browser voice reads text the player just silenced.

## Plan (Claude)

1. **The fallback** (`js/play-scope.js`, `narrate`): fall back to the browser voice only while the clip
   is still the current one. A clip that `stopSpeech` or a newer `narrate` replaced is silent, whatever
   its rejection or `error` event says. A clip that is missing (404 → `error`, or `play()` rejected
   while current) still falls back — quest text has no baked clip.
2. **The double call** (`js/cloud.js`, `onSignedIn`): the cloud load renders quietly
   (`narrateReady=false` before `applyProgress`), and `enterPlay` reads the story once, as on the
   landing path. TUN-106's failed-load rules are untouched.

Either alone stops the two voices; the first is the cause, the second the trigger. Both are a line.

**Tests** (`tests/narration.test.mjs`, the game in the harness with a fake `Audio` whose `pause()`
rejects a pending `play()` with `AbortError`, as Edge does, and a recording `speechSynthesis`):
two `narrate` calls in a row → one clip playing, no browser voice; `stopSpeech` on a pending clip → no
browser voice; a missing clip → the browser voice once; a replaced clip's late `error` → nothing; and
`onSignedIn` loading cloud progress after a guest entered play → one clip, no browser voice, and the
landing case likewise.

**Not reachable here:** the sign-in itself (previews cannot reach the API). It is the owner's check
on production after the merge.

## Build and tests

Built as planned. **Tests:** `tests/narration.test.mjs`, 9 cases; on the unfixed code 6 fail, and each
fix alone is caught (guard reverted: 5 fail; the `onSignedIn` change reverted: the guest sign-in case
fails on its clip count). Syntax check OK; suite 1039/1039.

**Real engine (headless Edge, cache disabled, the real `onSignedIn` with only `freshToken`/`cloudPull`
stubbed in the page):** guest-then-sign-in and landing sign-in each make one `play()`, no browser
voice. Read aloud off while the clip loads: on the old code the browser voice read the story (`AbortError`
→ fallback); now silence. AO's browser: the game loads and enters play, no errors.

**Unverified:** the real sign-in and cloud load on production — the owner's playtest; real speakers
(the probe records `speechSynthesis.speak` instead of speaking).
