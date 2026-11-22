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

## PR review — round 2 (gpt-6.2-astra, through `ask.sh`), on fd5ffb1

<details><summary>GPT's review, verbatim</summary>

**CHANGES REQUESTED** on `fd5ffb17baace41a8f82d37b88da421143ea62ca`.

### Round 1

1. **Autoplay refusal — resolved for `NotAllowedError`.** A rejected `play()` with that name produces zero browser utterances. Other failures still violate the missing-clip rule, as described below.
2. **Instrument card and loaded story — resolved.** The successful pull has one narration point. An open card keeps its turn, a cloud preference of Read aloud off stops it, and a card closed just before the pull completes cannot restart the loaded story. Round-1 tests 1, 2, 3, and 5 are present.
3. **Famous-tune credit — scope call accepted.** The cloud-load render clears the famous-tune timers. The independent toggle bug and both variants of test 4 are recorded in the backlog ticket. [TUN-121](https://linear.app/pad29/issue/TUN-121/keep-a-famous-tunes-spoken-credit-quiet-once-read-aloud-is-turned-off)

### Required changes and missing tests

**Medium — An existing Polly clip can still restart in the browser voice.** The audio element sends every `error` event to `fallback()`, and the promise handler sends every rejection except `NotAllowedError` there too. A concrete case is a Polly clip that starts playing and then encounters a network or decoding error. The clip is still current, so `speakStory(text)` starts the same story from the beginning. Both errors can occur *after* the browser has established that the resource is usable. Gate both paths on whether the narration has a baked clip, preserving the quest fallback. The README and DESIGN currently promise this behavior. [js/play-scope.js:144](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-46/js/play-scope.js:144) · [HTML Standard, media errors](https://html.spec.whatwg.org/multipage/media.html#error-codes)

**Missing test:** Start a known baked story, resolve `play()`, then emit `error` with `MEDIA_ERR_NETWORK` or `MEDIA_ERR_DECODE`. Assert zero browser utterances. Separately reject a still-current baked clip with `AbortError` and assert silence. Keep the existing unbaked-text case expecting exactly one utterance.

**Medium — A successful pull can start the story while the buddy picker is still visible.** The landing form leaves Back enabled during sign-in. On a slow pull, the player can choose Back → Start playing and reach the picker. If the cloud returns valid First Garden progress without a companion, `onSignedIn()` enables narration, `renderStage()` requests the story, and `syncCompanion()` returns with the picker still open. Choosing a buddy then calls `enterPlay()` and requests the same story again. Even on the direct landing path, `hideLanding()` runs after the narration request. Make the transition into the visible level own the first read whenever either screen is up. [js/cloud.js:111](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-46/js/cloud.js:111) · [js/boot.js:110](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-46/js/boot.js:110) · [js/level-engine.js:249](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-46/js/level-engine.js:249)

**Missing test:** Drive `doLandingSignIn()` with a deferred pull. In the direct case, assert the landing overlay is hidden at the first `play()` call. In the Back → Start playing case, resolve First Garden progress without a companion, assert zero clips and utterances while the picker remains visible, then pick a buddy and assert exactly one request for the cloud level’s story.

I found no regression in quest or Studio restoration, stale-run handling, or TUN-106’s failed-load rules. This was a read-only source review. The suite and Edge results in the review record are the author’s runs.

</details>

**My answers**

1. **Round 1 — GPT: findings 1 and 2 resolved; the scope call on finding 3 (TUN-121) accepted.**
2. **Medium — an existing Polly clip can still restart in the browser voice. Agreed.** Measured first in
   headless Edge (2026-11-20) what "missing" looks like: a 404 *and* an unreachable file (offline) both
   give the `error` event with code 4 (`MEDIA_ERR_SRC_NOT_SUPPORTED`) and reject `play()` with
   `NotSupportedError`; a baked clip gives neither. So the browser voice now stands in on exactly those
   two signals, while the clip is current — not on a mid-play network or decode error (2, 3), not on
   `AbortError`, not on `NotAllowedError`. There is no list of baked clips in the client to gate on, and
   a lookup would be a new mechanism; the error kind carries the same fact. Re-checked in Edge: text
   with no clip is still read by the browser voice (`NotSupportedError` → speak at 7 ms).
3. **Medium — the story can start while the buddy picker is up. Disagreed.**
   - *The direct landing path:* `onSignedIn` resolves and `doLandingSignIn` hides the landing in the same
     task — no frame is drawn between the narration request and `hideLanding()`, so no player sees or
     hears the story on the landing screen.
   - *Back → Start playing during a slow pull:* it needs cloud progress **with no companion**.
     `loadableProgress` accepts that, but the game never writes it now — sign-up only exists in the
     World map, after a buddy is picked — so only a legacy save could carry it. Even then the result is
     the story starting under the picker and once more, in the same voice, when a buddy is picked: not
     two voices, and `main` behaves the same today (`enterPlay()` narrated there too). Fixing it means
     reworking the landing sign-in's hand-off to play (who calls `enterPlay`, on which outcome), which is
     TUN-106 territory and out of this ticket's scope. Recorded here for the owner; no ticket filed for a
     path no current save reaches.

**Missing tests:** mid-play network and decode errors → silence; the current clip's `AbortError` →
silence; each missing-clip signal alone → one utterance — **added**. The `doLandingSignIn` cases — not
added, with finding 3.

**Tests after the round:** `tests/narration.test.mjs` 18 cases; mutation audit — round 1's rule
restored: 3 fail; the error event taking any code: 2; either missing-clip branch dropped: 1 each; the
current-clip guard dropped: 1. Syntax OK; suite 1048/1048. Edge probe on the new code: guest-then-sign-in
and landing sign-in one `play()` each, no browser voice; off-while-loading silent; a missing clip read
once by the browser voice.

## PR review — round 3 (gpt-6.2-astra, through `ask.sh`), on 15d1a7e

<details><summary>GPT's review, verbatim</summary>

**CHANGES REQUESTED** on `15d1a7e110ca546be6807151108c9e64f3572315`.

### Round-2 findings

1. **Mid-play restart — resolved.** After `play()` succeeds, a network or decode error (code 2 or 3) leaves the browser voice silent. A still-current `AbortError` also stays silent. The delta adds all three cases and retains the once-only fallback for unbaked quest text. [Narration tests](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-46/tests/narration.test.mjs:73)

2. **Narration under the buddy picker — medium, still required.** I accept the same-task argument for direct landing sign-in and withdraw the test requiring `hideLanding()` to precede `play()`. The picker can stay visible indefinitely. A fresh visitor can open a shared song directly in Studio, open the World map, and create an account before choosing a buddy. Sign-up uploads that device’s progress, with `current:"intro"` and no companion. On a later landing sign-in, Back → Start playing during the pull leaves the picker open. When the pull completes, `renderStage()` requests the cloud story, `syncCompanion()` leaves the picker up, and choosing a buddy requests the story again. This reaches both ticket conditions on a save the current game can write. Defer the successful pull’s narration until buddy selection when the picker remains visible. TUN-106’s failed-load handling can stay as it is. [Shared-song boot](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-46/js/boot.js:43) · [World map](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-46/js/home.js:13) · [Cloud load and upload](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-46/js/cloud.js:111) · [Companion selection](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-46/js/level-engine.js:282)

### New required change

**Medium — A shipped clip that fails before playback still selects the browser voice.** The Edge offline measurement supplies the counterexample. On a cold cache, the shipped opening story, `voice/b547890d.mp3`, can be unreachable and produce exactly the two signals that call `missing()`. Code 4 describes an unusable source. Neither signal establishes that the build lacks the clip. Gate fallback on whether the spoken-text hash has a baked asset, for example with a generated set of shipped hashes. Keep the current-clip check and the unbaked quest fallback. [Opening story clip](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-46/voice/b547890d.mp3) · [Fallback handlers](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-46/js/play-scope.js:145) · [HTML Standard, media errors](https://html.spec.whatwg.org/multipage/media.html#error-codes)

### Missing tests

- Narrate the actual opening level’s `intro`. Deliver code 4 alone, then in a separate case reject `play()` with `NotSupportedError` alone. Assert zero browser utterances in each. Keep the corresponding unbaked-text tests expecting one utterance. The existing mid-play fixture uses the shortened `"The garden is asleep."`, whose hash has no shipped clip.
- Drive `doLandingSignIn()` with the cloud pull held pending. Choose Back → Start playing, then resolve the pull with First Garden progress containing no companion. Assert zero clips and zero utterances while the picker is visible. Choose a buddy and assert exactly one request for the cloud level’s story.

This was a read-only source review. The suite and Edge results in the review record are the author’s runs.

</details>

**My answers**

1. **Round 2 — GPT: the mid-play restart resolved; the same-task argument for the direct landing path
   accepted.**
2. **Medium — narration under the buddy picker. Agreed; my round-2 reasoning was wrong.** GPT showed a
   save the current game can write with no buddy: a fresh visitor opens a shared song (straight into the
   Studio), opens the World map and signs up before ever picking one. Now a successful cloud load leaves
   `narrateReady` false while the picker is up, so nothing is read under it, and picking a buddy
   (`enterPlay`) reads the loaded story once. Test added (the picker up, a held pull, a buddy-less cloud
   save: no clip until the pick, then one clip of the cloud level's story); it drives `onSignedIn` and
   `pickCompanion` rather than `doLandingSignIn`'s form, which the harness does not model — the two
   paths meet at `onSignedIn` with the picker up.
3. **Medium — an unreachable shipped clip still gets the browser voice. Disagreed for this PR.** It is
   true, and measured: Edge reports a 404 and an offline fetch identically. But it is not the two-voices
   bug (one voice, the robotic one, when the network fails), today's `main` behaves the same, and the fix
   GPT proposes — a generated list of shipped clip hashes kept in step with `tools/gen-voice.mjs` — is a
   new mechanism. Whether an offline player should hear the robotic voice or silence is a player-facing
   choice with two defensible answers: the owner's. Filed as **TUN-124** (`needs-owner`), carrying GPT's
   missing test for the real opening story.

**Missing tests:** the buddy-picker case — **added** (as above). The real opening story with each
missing-clip signal → moved to TUN-124 with its finding.

**CI:** head 15d1a7e's first run failed only `gpt-lock: of many sessions acquiring at the same instant,
exactly one gets the lock` — a race in `.claude/gpt/gpt-lock.sh` (a loser's `rm -rf` removes the
winner's lock), which this PR does not touch; the re-run passed. Evidence added to **TUN-123**, which
already tracks that race.

**Tests after the round:** `tests/narration.test.mjs` 19 cases; dropping the picker check fails 1.
Syntax OK; suite 1049/1049. Edge probe: guest-then-sign-in and landing sign-in one `play()` each, no
browser voice.

**Review rounds used: 3 of 3.** Round 3's fix is unreviewed: Needs Input, below.

## Owner's decisions

1. *GPT's round-3 finding on unreachable shipped clips (TUN-124): ship this PR without it?* — **A: ship
   without it; it stays with TUN-124 for the owner's decision**: the owner, relayed by the orchestrator
   (music-garden-5) to this session, 2026-11-21.
2. *Round 3's fix (the buddy-picker condition and its test) has had no GPT review: one more round, or
   hand off as it is?* — **A: one more GPT round (a fourth) on 15d1a7e..4f32607**, quoting round 3 and
   saying plainly that the test drives `onSignedIn` and `pickCompanion` rather than `doLandingSignIn`'s
   form, and why; if it requests changes again, fix what I agree with and stop at Needs Input — no fifth
   round: the owner, relayed by the orchestrator (music-garden-5), 2026-11-21.

## PR review — round 4 (gpt-6.2-astra, through `ask.sh`), on 3eaf3df — the owner's extra round

<details><summary>GPT's review, verbatim</summary>

**CHANGES REQUESTED**

**The buddy-less case is resolved, and I accept the test’s shape.** Back → Start playing opens the picker. Driving `onSignedIn(false)` and `pickCompanion()` directly covers the relevant behavior. The test checks silence while the picker stays open and exactly one request for the loaded level’s story after selection. [Landing handlers](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-46/js/boot.js:110) · [Regression test](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-46/tests/narration.test.mjs:210)

**Medium — A returning player’s saved buddy can close the picker and leave narration off.** Take the same Back → Start playing path on a fresh device, then let the pull return First Garden progress **with** a saved buddy. `onSignedIn()` sees the open picker and sets `narrateReady=false`. `renderLevel()` calls `renderStage()`, which skips the story, then `syncCompanion()`, which finds the saved buddy and hides the picker. The player is now looking at the loaded level. There is no buddy left to pick, so `enterPlay()` never runs and subsequent level renders also stay silent. Defer narration only when the picker will remain open after the loaded progress is applied. [Cloud-load decision](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-46/js/cloud.js:112) · [Render order](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-46/js/level-engine.js:49) · [Automatic picker dismissal](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-46/js/level-engine.js:247)

**Missing test — one case.** Use the same deferred-pull harness with the picker visible, `narrateReady=false`, and the existing `CLOUD` fixture, which already has a saved `sprout`. Resolve the pull without calling `pickCompanion()`. Assert that the picker closes, exactly one clip for the cloud level’s story is requested, no browser utterance is issued, and `narrateReady` is true for subsequent levels.

This was a read-only source review of `3eaf3dfe1967e587f06684813074c076d7b5817c`. The suite and Edge results in the review record are the author’s runs.

</details>

**My answers**

1. **Round 3's buddy-picker finding — GPT: resolved; the test's shape (driving `onSignedIn` and
   `pickCompanion` rather than `doLandingSignIn`) accepted.**
2. **Medium — a saved buddy closes the picker and leaves narration off. Agreed; my round-3 fix caused
   it.** Now, when the picker was up before the load and the loaded save's render closed it
   (`syncCompanion` found the buddy), play resumes there: `enterPlay()` reads the loaded story once and
   turns narration on. `enterPlay` now also waits for an open instrument card, as `renderStage` does,
   so this path can't talk over a card. GPT's missing test added (the picker up, the save with its
   buddy, no pick: the picker closes, one clip of the cloud story, no browser voice, `narrateReady`
   true), plus one for `enterPlay` with a card up.

**Tests after the round:** `tests/narration.test.mjs` 21 cases; dropping the resume fails 1, dropping
`enterPlay`'s card check fails 1. Syntax OK; suite 1051/1051. Edge (cache disabled): the round-4 path
(`showCompPicker()`, then a save with a buddy) closes the picker and plays one clip with narration on;
real clicks on *Start playing* and a buddy play the story once, no page errors; the sign-in and
off-while-loading probes unchanged.

**Review rounds used: 4** (the fourth authorized by the owner). Round 4's fix is unreviewed; per the
owner, no fifth round without them: Needs Input.

## Owner's decisions (continued)

3. *Round 4's fix (a saved buddy that closes the picker resumes play, and `enterPlay` waits for a card)
   has had no GPT review: hand off as it is, or one more round?* — **B: a fifth and last GPT round,
   scoped to 4f32607..94476d0**, telling GPT what rounds 1–4 settled; no sixth round without the owner:
   the owner, relayed by the orchestrator (music-garden-5), 2026-11-21. (I had suggested A.)

## PR review — round 5 (gpt-6.2-astra, through `ask.sh`), on 94476d0 — the owner's last round

<details><summary>GPT's review, verbatim</summary>

**Round-4 finding resolved.** With the picker open, `onSignedIn()` keeps narration silent while applying the cloud save. When the saved sprout closes the picker, `enterPlay()` enables narration and requests the loaded level’s story once. The new regression test verifies all four requested outcomes, including zero browser utterances, without calling `pickCompanion()`. [Cloud-load logic](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-46/js/cloud.js:115) · [Regression test](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-46/tests/narration.test.mjs:226)

I traced all three `enterPlay()` callers: buddy selection, returning-player boot, and the new cloud-load path. With an instrument card open, `enterPlay()` leaves `narrateSeq` untouched. `closeInstrCard()` captures the sequence at dismissal. After 1,400 ms it reads the current story if Read aloud is on and the sequence still matches. The existing tests cover both the deferred read and a newer story superseding the timer. [Entry guard](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-46/js/play-scope.js:152) · [Close timer](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-46/js/playback.js:81) · [Timer tests](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-46/tests/narration.test.mjs:172)

**Required changes:** None. **Missing tests:** None.

This was a read-only source review. The 1051/1051 suite result and Edge checks are the author’s runs.

**APPROVED on 94476d05e7314d653d4c3cd04aa196b28a727146**

</details>

**Verdict: APPROVED on `94476d05e7314d653d4c3cd04aa196b28a727146`** — no required changes, no missing
tests. Round 4's finding resolved; all three `enterPlay()` callers traced against the instrument card's
close timer. The commit that adds this section changes only this file, so the approved code is the
PR's code.

**Review rounds used: 5** (the fourth and fifth authorized by the owner). Final: suite 1051/1051 on
94476d0; CI green on 94476d0.
