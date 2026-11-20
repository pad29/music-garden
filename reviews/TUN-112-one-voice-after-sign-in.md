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

## PR review — round 1 (gpt-6.2-astra, through `ask.sh`), on 252cbaf

<details><summary>GPT's review, verbatim</summary>

**CHANGES REQUESTED** on `252cbaf160e552b0ca01a97f66cbab3a09cae833`.

The clip identity check fixes the measured race. A late rejection or `error` from a replaced clip can no longer start the browser voice. Three narration paths still need changes.

| Severity | Required change |
|---|---|
| **High** | **Keep autoplay refusal from selecting the browser voice.** `narrate()` still sends every rejection from the *current* clip to `speakStory()`. The new test at `tests/narration.test.mjs:75` explicitly requires that behavior for `NotAllowedError`. On a signed-in reload, playback can be denied before a user gesture even when the Polly file exists. Preserve the current-clip check, distinguish playback denial from a missing source, and retain the missing-clip fallback for quests. [js/play-scope.js:140](./js/play-scope.js#L140) |
| **Medium** | **Give the instrument card and the loaded story one turn each.** If a cloud pull finishes while a discovery card is visible, `renderStage()` respects the card, but `enterPlay()` immediately cuts off its introduction and starts the loaded story. Closing the card stops that story and requests it again 1,400 ms later. Closing the card *just before* the pull finishes also leaves a timer that restarts the newly loaded story. Use one narration point for a successful load. Setting `narrateReady=true` before `applyProgress()` and letting `renderStage()` handle the story would reuse its card check. Also invalidate a pending card-close callback when a newer level takes over, and silence the card if the loaded preference is Read aloud off. [js/cloud.js:111](./js/cloud.js#L111) · [js/level-engine.js:78](./js/level-engine.js#L78) · [js/playback.js:81](./js/playback.js#L81) |
| **Medium** | **Honor Read aloud off for a queued famous-tune credit.** `revealFamous()` checks `speakOn` when scheduling the credit. Turning narration off before the callback fires still lets it start a fresh clip. Turning it off and back on lets that callback interrupt the current story. Invalidate the pending spoken credit on mute while preserving the tune’s visual timers. The cloud-load render already clears famous timers, so this finding concerns the toggle path. [js/famous.js:305](./js/famous.js#L305) · [js/play-scope.js:150](./js/play-scope.js#L150) |

**Missing cases in `tests/narration.test.mjs`**

1. Replace the `NotAllowedError` expectation with zero browser utterances for a denied baked clip. Keep the existing missing-source case that expects exactly one utterance.
2. Finish a deferred cloud pull with a discovery card open. With Read aloud on, assert that the card keeps its voice and the loaded story starts exactly once after dismissal. With cloud `settings.speak=false`, assert that the card stops and dismissal stays silent.
3. Close the card, finish the cloud pull, then fire the captured 1,400 ms callback. Assert that the loaded story’s clip was requested once and remains current.
4. Schedule a famous credit, toggle Read aloud off, and fire the callback. Assert silence. Repeat with off then on and assert that the current story remains the sole new clip.
5. Exercise the actual signed-in boot gate with voice recording installed **before** boot and the cloud response held pending. Use different local and cloud levels. Assert zero requests before the pull resolves, then exactly `voice/<hash of the cloud story>.mp3` afterward. The current sign-in tests install recording after boot, set `narrateReady` directly, and count clips without checking which story was requested. [tests/narration.test.mjs:86](./tests/narration.test.mjs#L86) · [js/boot.js:127](./js/boot.js#L127)

I found no change to sign-up, explicit-null, failed-load, or stale-run behavior. This was a read-only review of the full diff. The reported Edge and suite results are the PR author’s verification.

</details>

**My answers**

1. **High — a refused clip (`NotAllowedError`) fell back to the browser voice. Agreed.** The ticket's
   *Decisions already made* says the browser voice is used only when the clip doesn't exist; my first
   round's test pinned the opposite. Now only a missing clip (its `error` event, or `play()` rejecting
   with anything but `NotAllowedError`) falls back, and only while current. The test now expects silence.
2. **Medium — the instrument card and the loaded story. Agreed, and GPT's form taken over mine.** The
   cloud load now sets `narrateReady=true` and lets `applyProgress()`'s `renderStage` read the story —
   one narration point, which already waits for an open card — instead of `narrateReady=false` plus
   `enterPlay()`, which read the story over the card. `closeInstrCard`'s 1,400 ms story skips itself if
   anything has narrated since (`narrateSeq`), so a cloud load just after closing a card is not
   restarted. `renderStage` now stops speech when Read aloud is off even with a card up, so a cloud load
   whose saved setting is off silences the card.
3. **Medium — a queued famous-tune credit ignores Read aloud off. Disagreed on scope, not on the bug.**
   It is a toggle bug in `revealFamous`, not sign-in, and not two voices at once (off → on gives one
   voice, switching). Filed as **TUN-121** (Backlog), with GPT's missing test 4 as its test.

**Missing tests:** 1 (refused clip → silence), 2 (cloud load with a card up, Read aloud on and off),
3 (card closed just before the load, timer fired after) and 5 (the real signed-in boot gate, voices
recorded from before boot, cloud answer held, local and cloud on different levels, the clip's source
checked) — **added**. 4 (famous credit) — moved to TUN-121 with the bug.

**Tests after the round:** `tests/narration.test.mjs` 13 cases; mutation audit — each change undone on
its own fails tests (current-clip guard: 6, `NotAllowedError` check: 1, single narration on cloud load:
2, `renderStage` stop when off: 1, card timer `narrateSeq`: 1). Syntax OK; suite 1043/1043. Edge probe
re-run on the new code: guest-then-sign-in and landing sign-in one `play()` each, no browser voice;
off-while-loading silent.
