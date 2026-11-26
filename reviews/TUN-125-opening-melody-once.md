# TUN-125 — Play a level's opening melody once, not twice

Branch `ao/melody-once/root` · PR #178 · Size S

## Diagnosis (Claude)

Reproduced in Node (`tests/opening-melody.test.mjs`). AO's browser can neither run page code nor play sound, so the
reproduction uses a fake `AudioContext` that follows the browsers' autoplay rule: a context made before the page's
first user gesture starts **suspended**, with its clock frozen at 0, and `resume()` starts it only once the page has
had a gesture. Every note the game books is recorded, and a booked note is never cancelled, so a note booked is a
note heard.

Two causes, and both are in `renderStage` (`js/level-engine.js`), which books the melody on a bare
`setTimeout(…, 350)` each time it draws a stage (the `st.echo` line and the `st.call` line):

1. **Every draw books its own copy, and nothing cancels the timer.** Two draws in a row (the cloud load's
   `applyProgress → renderLevel` right after the boot draw), a re-draw, or a **Next** inside the 350 ms each leave a
   timer behind. `playCall` reads the stage when its timer fires, so both copies are the *new* step's call. Echo
   timers capture the phrase at the draw, so a quick Next plays the old step's phrase as well as the new one.
2. **Notes booked before the page's first gesture wait on a frozen clock.** `playPhrase` books against
   `actx.currentTime`. On a page load the boot draw's timer fires before any gesture, so it creates the context
   suspended and books the melody at 0.12 s on a clock that is not running. Those notes are not lost: they all sound
   together the moment the clock runs, on top of whatever is booked then. Cancelling the timer cannot reach them.

| Path (Question & Answer 6/9 unless named) | Today | Cause |
|---|---|---|
| Signed-in reload: boot draw, then the cloud load's draw, then the first tap | **twice**, the second over the first | 2 |
| Signed-in reload on 6/9 whose cloud save is on an echo level | **6/9's call plays on the echo level**, with the echo | 2 |
| Sign in from the landing page, fresh profile | once — the boot level (Garden Basics 1/13) has no melody, and the cloud level's draw comes after a gesture | — |
| A level drawn twice in a row, the page already unlocked (a call level and an echo level) | **twice** | 1 |
| Guest reload, then **🔊 Listen** as the first gesture | **twice**, together | 2 |
| Guest reload, then a tap on the field | once, at the tap (late, but once) | — |
| Guest reload, then Home → another package with no melody | **6/9's call plays in the other package** at the first gesture | 2 |
| *Forced* (the dev bar's jump, or Next's handler while the button is hidden) to 6/9's second step inside 350 ms | **twice** (step 2's call) | 1 |
| *Forced* through an echo level's steps inside 350 ms | **both steps' phrases** | 1 |
| *Forced* from an echo level to another package inside 350 ms | **the echo plays in the other package** | 1 |
| Guest: Home → Q&A onto 6/9; a player's Next 6/9 step 1 → step 2 → 7/9 | once each | — |
| Signed-in reload, a tap before the cloud answers (found by GPT, round 1) | **twice**: the cloud's redraw of the same stage plays it again | 1 |

*Forced* rows are not player paths: Next shows only once a step's goals are met, long after 350 ms (GPT, round 1).
They show that no earlier stage's timer survives a transition.
| Guest: first level after the landing screen and the buddy picker | nothing — Garden Basics 1/13 has no melody | — |

"Play as a guest and then sign in" doubles only when the page was loaded on a melody level and the sign-in is its
first gesture: that is cause 2 (the boot draw's notes wait, then the cloud level's booking starts the clock).

## Plan (Claude)

- `js/level-engine.js`: one opening-melody slot. `renderStage` calls `scheduleOpening(notes)` (the stage's `echo`
  or `call`, taken at the draw) instead of the two bare timers; `scheduleOpening` cancels any earlier one first, and
  `resetTransient` cancels it too, so leaving a step, level or package drops it.
- When the timer fires: if the audio clock runs, play the phrase now. If it is still suspended (no gesture yet),
  book nothing; keep the phrase waiting and play it once when the context's `statechange` says it runs — the first
  gesture — unless a re-draw, **Listen** or **▶ Play** came first. This keeps a reload's call heard once, at the
  first gesture, as today, but only the current stage's and only once.
- **🔊 Listen** (`js/playback.js`) drops a waiting or pending opening melody, then plays as before: it is heard
  every press.
- `placeCall` still runs on every draw. `playCall` (`js/detectors.js`) loses its last caller and goes.
- Nothing in `js/cloud.js`, `js/boot.js` or `tests/harness.mjs` changes.
- Tests: `tests/opening-melody.test.mjs`, one per path in the table, plus every stage with an opening melody
  booking it once, Listen every press, and ▶ Play before the unlock.

## Build and tests

Built as planned. `js/level-engine.js`: `scheduleOpening`, `playOpening`, `cancelOpening` beside `resetTransient`,
which now calls `cancelOpening`; `renderStage` schedules through them. `js/playback.js`: Listen calls
`cancelOpening` first. `js/detectors.js`: `playCall` removed (no caller left). `tests/load-gate.test.mjs`:
`statechange` (the AudioContext's own event) declared not-input, as that test asks of every new listener.

- `tests/opening-melody.test.mjs`, 17 tests at round 1 (28 since; see round 2 below). On the code before the fix,
  12 failed; all 17 passed with it.
- Mutation checks, each run by hand against the file: dropping the cancel in `resetTransient`, in `scheduleOpening`
  or in Listen, the `playing` check at the timer or at the unlock, or booking whatever the clock's state — each fails
  at least one test.
- Full suite green (one run failed only on `load-gate`'s listener scan before `statechange` was declared).
- Browser (AO's, this worktree's server): Question & Answer 6/9 loads with 🔊 Listen and no page errors. AO's
  browser plays no sound and runs no page code, so **not verified: what is heard** — the owner's playtest, signed
  in and as a guest, on production. Not verified on `file://` (no asset loading changed).

## Choices I made that you might overrule

- **A melody whose timer finds the page not yet unlocked plays at the first gesture**, once, if the player is still
  on that stage and pressed neither Listen nor ▶ Play. That is today's single-reload behaviour, kept: the ticket's
  playtest expects the call heard after a reload. The alternative is silence until Listen.

## PR review — round 1 (gpt-6.2-astra, through `ask.sh`), on 5f161b0

<details><summary>GPT's review, verbatim</summary>

**Changes requested on PR #178, head `5f161b0`.** The fix handles two draws before the first timer fires. A signed-in reload can still play the Q&A call twice when the cloud response arrives after the first booking.

| Severity | Finding | Regression test to add |
|---|---|---|
| **Blocker** | **A late redraw replays an opening that already started.** Reload signed in with both saves on Q&A 6/9. Let the local timer fire at 350 ms on a running clock, then let the cloud answer at 500 ms. The first call is already booked. The cloud redraw places the call again and schedules a second copy at 850 ms, overlapping the first. A field tap before the cloud answer is enough to reach this state. Desktop Chrome can also grant autoplay before any tap. The engine needs to remember that this stage entry used its opening while still placing the call on every draw. `js/level-engine.js:13`, `js/level-engine.js:16`, `js/level-engine.js:118`, `js/cloud.js:151`. [Chrome’s Web Audio autoplay policy](https://developer.chrome.com/blog/web-audio-autoplay) | Hold the cloud response, let the local call book on a running clock, resolve the same-stage save, then fire the second timer. Expect one call total and a freshly placed call on the grid. Then go to step two and expect another call there. The two steps deliberately use identical notes (`js/packages.js:773`, `js/packages.js:778`). |
| **High** | **A guest can hear the old level’s entire phrase after leaving.** With audio running, let an echo level’s timer fire at 350 ms, then open another package at 400 ms. `playPhrase` has booked every note, but the first is due only at 470 ms. The reset clears an empty slot, and the whole echo starts in the new package. This requires neither sign-in nor an interruption. `js/level-engine.js:11`, `js/level-engine.js:16`, `js/goal-helpers.js:84`. | Advance a running clock past the timer, change to a melody-free package before the first note is due, then advance through the phrase. Expect zero old-stage note starts. The current navigation test always changes packages **before** firing the timer (`tests/opening-melody.test.mjs:179`). |
| **High** | **An interrupted iOS audio context takes the playback branch.** If the timer expires while `state === "interrupted"`, the `!== "suspended"` check calls `playPhrase`. That function requests a resume and immediately books the notes. A redraw during the interruption can therefore queue two copies for recovery, recreating the frozen-clock bug. The transport already checks explicitly for `"running"`. `js/level-engine.js:16`, `js/goal-helpers.js:84`, `js/playback.js:193`. [WebKit interruption behavior](https://bugs.webkit.org/show_bug.cgi?id=276016) | Start running, interrupt the context, fire the opening timer, redraw, and fire it again. Expect zero bookings during interruption and one current-stage phrase after recovery. |
| **Medium** | **Play followed quickly by Stop leaves the opening armed.** Press Play at 100 ms and Stop at 200 ms. At 350 ms `playing` is false again, so the automatic call starts after Stop. The same race exists if the opening is waiting and the `statechange` event arrives after Stop. The README says Play drops the opening. `js/level-engine.js:14`, `js/level-engine.js:20`, `js/playback.js:302`, `js/playback.js:331`, `README.md:150`. | Press Play and Stop before firing the timer. Repeat with a pending unlock and deliver `statechange` after Stop. Expect zero automatic `playPhrase` calls in both cases. The existing tests keep playback active through the decisive event (`tests/opening-melody.test.mjs:234`, `tests/opening-melody.test.mjs:244`). |
| **Medium** | **Opening Home leaves the level’s pending melody live.** On an unlocked page, enter a call level and open the world map within 350 ms. Leave the map open. `openHome()` displays it without clearing the timer, so the call starts while the player is looking at Home. `js/home.js:18`, `js/level-engine.js:13`. | Open Home through its button and fire the timer while the map is visible. Expect silence. Repeat with a waiting opening and deliver the unlock while Home is visible. The test labeled “from Home” skips the map and calls `openPkg` directly (`tests/opening-melody.test.mjs:138`). |

**Two tests give false confidence about the reproduction.**

- The guest-reload test passes if the old implementation books the entire call while suspended. Its pre-tap assertion counts only notes labeled `"running"`, and its post-tap assertion counts all notes regardless of when they were booked. Assert `notes.length === 0` before the tap, then exactly one phrase booked while running afterward. Also exercise a first gesture such as Loop through its actual handler. The test helper explicitly calls `resume()` on every simulated tap, while Loop only toggles a flag. A browser may keep an early `resume()` pending. `tests/opening-melody.test.mjs:27`, `tests/opening-melody.test.mjs:72`, `tests/opening-melody.test.mjs:133`, `js/playback.js:339`. [Web Audio `resume()` algorithm](https://webaudio.github.io/web-audio-api/#dom-audiocontext-resume)
- The quick-Next cases invoke `next.onclick()` immediately after rendering, while the real button is hidden. They demonstrate that a stale timer can survive a forced transition. They do not establish the player steps claimed in the diagnosis. Add a guest case that completes the goal, presses Play, verifies Next is visible, and advances through it. Record the forced-transition cases separately from the player reproduction. `tests/opening-melody.test.mjs:161`, `tests/opening-melody.test.mjs:171`, `js/level-engine.js:90`, `js/level-engine.js:156`, `reviews/TUN-125-opening-melody-once.md:34`.

This was a read-only source review. I did not execute the PR or independently verify its reported green suite or audible behavior.

</details>

### My answers

1. **Blocker — a late redraw replays an opening that already started. Agreed.** The slot now belongs to the stage's
   *entry*: `openingFor(st, notes)` does nothing when `st` is the stage whose entry already used its melody (pending,
   waiting or played), so a redraw of that stage, the cloud load's at any time, neither replays nor drops it. Another
   stage, or `openHome`, frees it. `resetTransient` no longer touches it, because it also runs on a redraw. That
   departs from the ticket's pointer to `resetTransient`, which assumed a redraw should cancel. Keyed on the stage
   object, so 6/9's two steps (the same notes) each play their own. Test added as GPT described it.
2. **High — a guest can hear the old level's whole phrase after leaving. Disagreed.** That needs a level change in
   the ~120 ms between the booking and its first note. Those notes are already on the audio clock. The ticket rules
   this out: "The fix has to stop the second scheduling (or cancel the pending 350 ms timer), not try to silence notes
   already on the audio clock". Taking booked notes back would mean making `playPhrase`'s voices cancellable, which
   would change Listen and every other phrase too. The ticket's "never leaves an earlier level's melody still
   scheduled" is met for everything not yet booked. The code comment now says booked notes are left to finish.
3. **High — iOS "interrupted" takes the playback branch. Agreed.** It plays now only when the state is `"running"`
   (or a context too old to report one). Anything else waits for `statechange` to running. Test added: interrupt, a
   redraw, recovery → once, and a second interruption does not bring it back.
4. **Medium — Play then Stop leaves the opening armed. Agreed.** `start()` now spends it (`cancelOpening`), instead
   of the two `playing` checks, which are gone. Tests added for both races.
5. **Medium — opening Home leaves the pending melody live. Agreed.** `openHome()` frees it (`leaveOpening`), and
   coming back to the level plays it anew. Tests added through the Home button: a pending call, a waiting one.
6. **Tests — the guest-reload test passes with the bug. Agreed.** The reload tests now assert nothing is booked
   before the gesture and one copy, every note on a running clock, after it. They run under both resume behaviours:
   an early `resume()` dropped, and one that waits for the next gesture. 🔁 Loop as the first gesture is added
   through its real handler.
7. **Tests — the quick-Next cases force a hidden button. Agreed.** They are relabelled *forced* in the table and the
   tests. A player's path is added: Hint and ▶ Play complete each step, Next is visible, and 6/9 step 1 → step 2 →
   7/9 each play their opening once.

Also: the quest branch's `leaveOpening` I first added was redundant (every quest is entered from Home), so it went.

### Round-2 tests

`tests/opening-melody.test.mjs`, 28 tests. On `origin/main`'s code, 23 fail. On round 1's head, the seven covering
findings 1, 3, 4, 5 fail. All 28 pass. Mutation checks, run by hand: dropping the same-stage keep, the leave on a
new stage, the leave in `openHome`, the cancel in `start` or Listen, the clear of the waiting melody at unlock,
`leaveOpening` forgetting the stage, or going back to round 1's `!== "suspended"` check — each fails at least one
test.

## PR review — round 2 (gpt-6.2-astra, through `ask.sh`), on 67fd410

<details><summary>GPT's review, verbatim</summary>

**Changes requested on PR #178, head `67fd410`.** The late same-stage redraw is fixed, and `placeCall` still runs on every draw. The remaining high-severity issue is that a cloud redraw can arm a new opening while Home is visible, even after `openHome()` correctly cancelled the previous one.

### Finding 2 ruling — resolved, High withdrawn

I accept the ticket’s booking boundary. If `playPhrase` books the notes at 350 ms on a running clock and the player leaves at 400 ms, the first note can sound at 470 ms in the next package. Those notes are already on the audio clock. The ticket explicitly allows them to finish and requires cancellation of work that can still schedule a phrase. My round‑1 expectation of zero note starts after departure was incorrect. The Home and quest failure below occurs **before booking** and falls within the ticket. `js/goal-helpers.js:84`, `js/level-engine.js:13–24`.

### Other round‑1 findings

| Finding | Ruling |
|---|---|
| **1. Late same-stage redraw** | **Resolved.** Package restoration reuses `PACKAGES[id].levels`, and `curStage()` returns the catalog level or step itself. A redraw therefore retains the entry, while the two Q&A 6/9 steps have distinct identities despite their identical notes. `placeCall` remains outside the identity check. `js/play-scope.js:17`, `js/play-scope.js:102`, `js/level-engine.js:105`, `js/level-engine.js:120`. |
| **3. Interrupted audio** | **Resolved.** An interrupted context stores the phrase without booking it. The listener checks for `running` and clears the waiting phrase before playing it. A later recovery cannot replay the same phrase. `js/level-engine.js:18–24`. |
| **4. Play then Stop** | **Resolved.** `start()` clears both the timer and the waiting phrase. Stop cannot re-arm either. The tests cover Stop before the timer and before delivery of `statechange`. `js/playback.js:302`, `tests/opening-melody.test.mjs:233`, `tests/opening-melody.test.mjs:245`. |
| **5. Home** | **Not fully resolved.** Opening Home cancels everything outstanding at that instant. A subsequent cloud draw can schedule the melody again while the map stays open. Conversely, closing the map directly can lose an unheard opening. |
| **6. Guest-reload test** | **Resolved for the original false positive.** The field-tap test now requires zero bookings before activation and exactly one phrase booked while running afterward. Loop uses its actual handler under both resume models. The separate Listen event-order gap is below. `tests/opening-melody.test.mjs:177–193`. |
| **7. Quick Next** | **Resolved.** The forced cases are labeled. The new player-path test completes the goals, asserts Next is visible, and advances through both 6/9 steps to 7/9. `tests/opening-melody.test.mjs:108–111`, `tests/opening-melody.test.mjs:271–285`. |

### Findings and missing regression cases

| Severity | Concrete failure | Regression case |
|---|---|---|
| **High** | **A cloud redraw re-arms playback behind Home, and the call can follow the player into a quest.** Open Home while a signed-in reload is pending, then let the cloud restore Q&A 6/9. `applyProgress()` draws the level while the map stays visible. `openHome()` has cleared the stage key, so this draw starts a fresh 350 ms timer. Staying on the map plays the call there. Entering an eligible quest before the timer fires also leaves it live, because the quest branch returns before `openingFor()`. This also applies to signing in through Home’s own form, which stays open after success. `js/home.js:18`, `js/cloud.js:121`, `js/cloud.js:256`, `js/level-engine.js:85`, `js/level-engine.js:105`. | Hold the cloud response, open Home, then resolve a save on 6/9 with a quest unlocked. In one run, stay on Home past 350 ms. In another, enter the quest before 350 ms. Expect zero call bookings in both. In a third, choose Continue on 6/9 and expect one call after entry. |
| **Medium** | **Closing Home directly loses an unheard opening.** Enter 6/9, open Home before the timer fires, then use **Close** or the backdrop. `leaveOpening()` discarded the timer. `closeHome()` only hides the overlay, so the player returns to the untouched level and hears zero calls. The “coming back” test passes because it calls `openPkg()`, which redraws the level. `js/home.js:11–18`, `tests/opening-melody.test.mjs:216–223`. | Open Home before booking, let the timer deadline pass, then dismiss via Close or backdrop. Expect silence on Home and one call after returning, with the player’s grid preserved. |
| **Medium** | **Listen as the first gesture can still double the call under the PR’s pending-resume model.** With a call waiting, press and hold the mouse on Listen. Mouse-down grants activation. If the running `statechange` is delivered before release, the listener books the automatic call. Release then invokes `onclick`, which books the manual copy. The test puts `page.gesture()` and `listen.onclick()` in the same turn, forcing cancellation to win. `js/level-engine.js:22–23`, `js/playback.js:345`, `tests/opening-melody.test.mjs:173`. [HTML activation event ordering](https://html.spec.whatwg.org/multipage/interaction.html#activation-triggering-input-event) | Set `pendingResume: true`, fire the opening timer, deliver mouse-down activation on Listen, let `statechange` run, then deliver the click. Expect one phrase for that press. This checks prevention of a duplicate booking. |
| **Medium** | **A delayed reveal can spend the next stage’s opening.** Claim the Garden Basics “Call the Band” power card while a cloud pull is outstanding. Closing the card schedules `runReveal` for 350 ms. If the cloud restores “Answer the Garden” before then, the old callback survives the redraw and calls `start()` on the new stage. That cancels its opening, and the echo target is absent from the empty grid the reveal plays. The player hears zero copies without pressing Play, Jam, or Listen on that stage. `js/level-engine.js:184`, `js/packages.js:18`, `js/playback.js:302`, `js/packages.js:82`. | Queue the old reveal, restore the echo stage, then fire the reveal and opening timers in deadline order. Expect no old-stage transport start and exactly one echo. |

Jam warrants a separate test because it deliberately starts the current transport. On an empty echo stage, **Jam on → Jam off before 350 ms** now permanently spends the prompt, although the backing played none of its notes. If Jam is intended to have Play’s override, pin that expectation explicitly. Jukebox playback enters Studio before `start()`, and the famous-tune reward checks that it still belongs to the current level. `js/playback.js:349–354`, `js/save-share.js:181–184`, `js/famous.js:301–303`.

One further test can pass with the wrong stage playing. The forced 6/9 step-change test counts a single copy of a phrase shared by both steps. Keeping step one’s timer and dropping step two’s produces the same result. Advance partway through step one’s delay, transition, then check **zero** bookings at the old deadline and **one** at the new deadline. `tests/opening-melody.test.mjs:286–294`.

This was a read-only source review. I did not run the PR or independently verify the reported suite or audible browser behavior.

</details>

**On the High I had declined (round 1, finding 2), GPT withdrew it:** "I accept the ticket's booking boundary. [...]
My round‑1 expectation of zero note starts after departure was incorrect."

### My answers

1. **High — a cloud redraw re-arms playback behind Home, and the call can follow the player into a quest. Agreed.**
   The root cause was round 2's own fix, which made Home *drop* the opening. Now Home *holds* it instead.
   `openingDue` books nothing while 🏠 Home is up, and keeps the melody waiting. `closeHome()` (Close, the
   backdrop) lets it play. `openPkg()` is a fresh entry (`leaveOpening`). The quest branch of `renderStage` frees it
   again (the line round 2 had removed as redundant was not). Tests added for all three runs GPT described: stay on
   Home, enter a quest the way Home's row does (`leaveHome`, then the run), and Continue on 6/9.
2. **Medium — closing Home directly loses an unheard opening. Agreed**, same change: Close and the backdrop each
   play it once, with the player's field kept. A melody already heard is not replayed by Home and back. Tests added.
3. **Medium — Listen as the first gesture can still double under pending resume. Agreed.** A melody released by
   the clock starting, or by Home closing, now plays after the same 350 ms pause as on entry (`openingSoon`). A
   Listen click inside that pause cancels it. Test added: activation at pointer-down, `statechange`, then the click
   → one copy. (A press held longer than 350 ms would still give two. That is the limit of this approach. Every
   other way would mean taking back notes already on the clock.)
4. **Medium — a delayed reveal's `start()` spends the next stage's opening; Jam too. Agreed.** Only the ▶ Play
   button spends it now (`playBtn.onclick`), not `start()`. A scripted start, a leftover power-card reveal, or Jam on
   and off leaves the opening to play once. Tests added for all three. A reveal that outlives its level and plays on
   the next is older than this PR and outside the ticket; it is not changed here.
5. **Test — the forced step-change test could not tell which timer survived. Agreed.** The test timers now run on a
   clock of their own (`advance`). The test moves on 200 ms in and checks there is nothing at step 1's deadline and
   one call at step 2's.

Also from my mutation checks: two lines were redundant and went — `openingSoon`'s own `clearTimeout`, and
`openStudio`'s `leaveOpening` (the Studio is another stage). `releaseOpening` no longer checks Home itself, since
`openingDue` looks again. A new test covers drawing a stage with no melody while the old stage's echo is pending or
held.

### Round-3 tests

`tests/opening-melody.test.mjs`, 35 tests, all pass. On round 2's head, the eight covering findings 1–4 fail. A
mutation check run by hand on each line of the round-3 code fails at least one test. The lines checked:
- Home holding the melody;
- the release's pause, and that it clears the held melody;
- the quest branch, and the leave on a new stage;
- the same-stage keep;
- the interrupted state;
- Close's release, and `openPkg`'s fresh entry;
- the Play button's and Listen's cancel.

## PR review — round 3 (gpt-6.2-astra, through `ask.sh`), on 3ca520d — the last round the skill allows

<details><summary>GPT's review, verbatim</summary>

**Changes requested on PR #178, head `3ca520d`.** The round‑2 high finding is resolved. A cloud redraw can no longer book the opening on the map or carry it through a successful quest entry. The remaining issues include a duplicate from a single Listen press and a held opening that can be stranded when quest entry fails.

### Round‑2 rulings

| Finding | Ruling |
|---|---|
| 1. Cloud redraw behind Home or into a quest | **Resolved.** `openingDue` checks Home at booking time. Successful quest entry clears both held notes and the timer. Studio draws a different, melody-free stage. Package Play, Continue, and Replay start a fresh entry. `placeCall` still runs on every Q&A draw. `js/level-engine.js:18`, `:23`, `:89`, `:124`, `js/home.js:62`, `:70` |
| 2. Close or backdrop loses an unheard opening | **Resolved on a running clock.** Both exits preserve the field and release the held call. An already-heard call stays spent. **Still incomplete on a suspended clock** under one of the PR’s two resume models, as detailed below. `js/home.js:11–14`, `js/level-engine.js:27` |
| 3. Listen as the first gesture doubles the call | **Not resolved.** The delay protects clicks that finish before the deadline. A press that starts before booking and finishes after it still produces two copies. `js/level-engine.js:17`, `:28`, `js/playback.js:345` |
| 4. A reveal or Jam spends the next echo | **Resolved for the reported missing echo.** Neither scripted `start()` nor Jam on/off consumes it. The same change exposes a duplicate when the destination has a **pre-placed call**. `js/playback.js:302`, `:336`, `:351`, `js/level-engine.js:124` |
| 5. Forced step change could pass with the old timer | **Resolved.** The test advances 200 ms before changing steps and requires silence at step one’s deadline. Keeping step one’s timer now fails even though both steps use identical notes. `tests/opening-melody.test.mjs:357–366` |

### Must change before merge

| Severity | Concrete failure and regression case |
|---|---|
| **Medium** | **One Listen press can still book two calls.** On a guest Q&A reload with a held call and pending resume, press Listen, deliver the running `statechange`, hold for 400 ms, then release. The timer books the automatic call at 350 ms. The click books the manual copy. Even a short press can cross the **original** entry deadline on a running clock, for example down at 340 ms and click at 370 ms. Expect one booking for either press. The existing test yields between down and click but advances its virtual clock by **zero**. The press begins while cancellation is still possible, so handling press intent before `click` can fix this within the ticket’s booking boundary. `js/level-engine.js:17`, `:23`, `:28`, `js/playback.js:345`, `tests/opening-melody.test.mjs:179–187` |
| **Medium** | **A failed quest entry strands the held call on the level the player returns to.** With audio running, open Home on Q&A, let the timer expire, then choose an eligible quest with storage full. The card or trail row hides Home first. `startQuestRun()` returns `store-failed` before changing scope. The original field is visible, `openingWaits` still holds its call, and nothing schedules it. Exercise the actual row with a failed quest write and expect one call on the retained level, zero while Home is visible. The current test calls `leaveHome()` and `startQuestRun()` directly, supplies no completed quest prerequisites, and exercises only success. `js/home.js:38–40`, `:54–57`, `js/quest-shell.js:435–438`, `tests/opening-melody.test.mjs:262–275` |
| **Medium** | **Close can leave the call waiting for another gesture.** In the suite’s `pendingResume: false` model, reload Q&A and let the opening timer expire before any gesture. Use the menu to open Home, then dismiss via Close or backdrop. None of those controls calls `resume()`. `releaseOpening()` sees `suspended` and returns, so waiting on the visible level produces silence until some later audio action. Repeat the test using just the real controls and expect one running-clock booking after dismissal. The current Home test calls `unlock()`, which explicitly resumes the context on the player’s behalf. `js/home.js:7–19`, `js/level-engine.js:26–28`, `tests/opening-melody.test.mjs:93–95`, `:252–258` |
| **Medium** | **A stale reveal now plays a Q&A call twice.** Claim “Call the Band,” then let a pending cloud pull restore Q&A 6/9 before the reveal’s 350 ms callback. The redraw places the call in the grid. The old reveal starts the transport on that grid, and the destination timer independently books the same call through `playPhrase`. The stale reveal predates this PR. The **second booking** is the difference from round 2. Test with the actual reveal and a pre-placed call, let the transport reach the call columns, and expect one rendition. The current test substitutes an immediate `start(); stop()` on an empty echo field. Guarding the old reveal before it starts would also preserve the empty-echo fix. `js/level-engine.js:109`, `:124`, `:188`, `js/packages.js:18`, `js/playback.js:182`, `:302`, `tests/opening-melody.test.mjs:317–324` |
| **Medium** | **Unlock behind Home can consume nearly the entire advertised post-Close pause.** With a call held behind Home, deliver the running `statechange` at time 0. It clears `openingWaits` and starts a timer while Home is still visible. Close at 340 ms. Close finds nothing to release, and the call books at 350 ms, **10 ms after dismissal**. A Listen click 50 ms after dismissal then books a second copy despite falling inside the documented pause. Test those deadlines and expect silence until 350 ms after Close, with an intervening Listen replacing the opening. The present test drains the timer while Home is still up, which hides this ordering. `js/level-engine.js:23–28`, `js/home.js:12`, `README.md:150`, `tests/opening-melody.test.mjs:252–258` |

### Lower-severity coverage and compatibility

- **Low — inconsistent legacy fallback.** `openingDue` treats `actx.state === undefined` as running, but `releaseOpening` requires the literal `"running"`. On a context using that fallback, let a call become held behind Home and close it. The call stays held. The same running predicate should govern booking and release. `js/level-engine.js:22–27`
- **Re-armed timer coverage.** Hold a call, unlock, advance 200 ms, then separately redraw the same stage, advance to the next step, or enter Studio. Expect the original deadline to survive the redraw, silence at that deadline after Next followed by one new-step call, and silence in Studio. The current forced-transition tests exercise entry timers or held notes before recovery. `tests/opening-melody.test.mjs:357–388`
- **Player-path test.** `finishStep()` calls `g.start()` directly. Since the Play button now owns distinct behavior, the “player’s Next” test can still pass if that button fails to start playback. Use its actual Play and Stop clicks before asserting that Next appears. `tests/opening-melody.test.mjs:118–121`, `:342–352`

This was a read-only source review of `c4f85c6` and `3ca520d`. I excluded the TUN‑69 merge and did not execute the PR, its tests, or browser audio.

</details>

### My answers — all agreed; the fixes are in the commit after 3ca520d, **not reviewed by GPT** (three rounds used)

1. **Medium — one Listen press can still book two calls. Agreed.** Listen now cancels the opening from the press
   itself (`pointerdown`), as well as on click, so a press that spans the deadline (down at 340 ms, click at 370
   ms; or held 400 ms through an unlock) books Listen's copy only. Test added for both cases.
2. **Medium — a failed quest entry strands the held call. Agreed.** Every way off Home now releases it:
   `leaveHome()` calls `releaseOpening()`, not only `closeHome()`. A choice that draws another stage (a package,
   the Studio, a quest that starts) drops it in the same turn. A quest that fails to start leaves the call to play
   once on the level the player is left on. Test added: `store-failed`, through `leaveHome` then `startQuestRun`, as
   Home's row does. It does not click the row itself, which the harness cannot build.
3. **Medium — Close can leave the call waiting for another gesture. Agreed.** `releaseOpening()` on a clock that is
   not running now calls `resume()`. From Close or the backdrop that is a click, so the clock starts, and its
   `statechange` releases the call. Test added with no `unlock()`: the real Home and Close only.
4. **Medium — a stale reveal now plays a Q&A call twice. Agreed.** `closePow()` remembers the stage its reveal
   belongs to and skips it if a different stage has been drawn by then (a cloud load). This touches the reveal's
   behaviour, which is older than this PR. It is the guard GPT suggested, and nothing else about reveals changes.
   Test added with Call the Band's real reveal and 6/9's pre-placed call: no transport start, the call once.
5. **Medium — an unlock behind Home eats the post-Close pause. Agreed.** `releaseOpening()` keeps the call held
   while Home is up, so the 350 ms pause starts when Home is left. Test added with GPT's deadlines: running at 0,
   Close at 340, nothing 50 ms later, Listen's copy the only one.
6. **Low — inconsistent fallback for a context with no state. Agreed.** One predicate, `clockRuns()`, for booking
   and release. Test added. It needed the fake fixed twice: its proxy hid a deleted `state`, and its `resume()`
   gave a stateless context a state machine it would not have.
7. **Tests — re-armed timer coverage. Added**: hold, unlock, 200 ms, then a redraw (the deadline survives), a Next
   (nothing at the old deadline, the new step's call at its own) or the Studio (nothing).
8. **Tests — the player's path pressed `start()` directly. Fixed**: it presses the real ▶ and ■ (Play button),
   and asserts the field started.

### Round-4 verification (mine; no GPT round)

`tests/opening-melody.test.mjs`, 42 tests, all pass; on 3ca520d's code the five covering findings 1–5 fail. Each
new line was mutation-checked by hand: the `pointerdown` cancel, `leaveHome`'s release, the release's `resume()`,
the release's Home check, the reveal guard, the no-state fallback. Removing any one fails at least one test. Full
suite 1149/1149.

## Owner's decisions

1. **The reload choice — silence, not the first tap.** The owner playtested 8d4b4cf and answered on 2026-11-25 at
   5:08 PM PT, relayed by the coordinator. In the owner's words: "it feels strange that it plays together with me
   planting a seed... I think it should either play once on refresh, or not play at all."
2. **Corrected — always silence after a reload.** The owner, 5:12 PM PT, relayed by the coordinator, replacing the
   coordinator's first reading ("if the clock already runs, it plays once then"): "in this case let's just say always
   silence. Otherwise the behavior may be different depending on the browser." So after a reload, the level's
   opening never plays on its own, in any browser, whether the clock is running or suspended. It is silent until
   🔊 Listen. Entering a level by the player's own navigation (Next, a package's Play, Continue, Replay) still plays
   it once. The coordinator: the decision is about the reload/boot draw only, and if it should reach further, say so
   rather than guess.
3. **A fourth GPT round — yes.** Also relayed at 5:08 PM PT: run it after this change is pushed, on `3ca520d..` the
   new head. No fifth round. Do not merge.
4. **Answered in 7 below: round 4's fixes are unreviewed.** The owner allowed no fifth round. Either hand off for
   playtest on my verification, or allow one more review of `1dae9d4..` the new head.
5. **D7: the scope of "always silence" is confirmed.** The owner, 2026-11-25, 9:32 PM PT, relayed by the coordinator:
   "always silence" covers the reload draw only. Entering a level by the player's own navigation still plays the
   opening once.
6. **D12: a late cloud load after the player has navigated plays.** This was the second question in the round-4
   hand-off, GPT's boundary note. The case: a signed-in reload, the player opens a level from Home before the
   account's progress arrives, and the progress lands them on a different level. The owner chose option A, play
   that level's opening once (9:32 PM PT, relayed by the coordinator). In the owner's words: "I think it should
   play. What I objected is not that it starts without an action, but that if it starts on tap it felt like the
   wrong time to start." 43e0943 already does this (`playerEnters()` clears `openingQuiet`).
7. **D11: one more GPT review, the fifth, on `1dae9d4..43e0943`.** The owner, 9:32 PM PT, relayed by the coordinator,
   with a stated bar: "block only on High or Blocker and ticket the rest." No sixth round without the owner.

## The owner's reload decision, built (Claude)

**The page's own draws are silent until the player navigates.** `openingQuiet` is set at load. While it is set, an
entry's opening is not scheduled at all, though the entry still counts as used, so a redraw does not bring it back.
That covers the boot's draw, and a signed-in reload's cloud load wherever it lands (before or after the player's
first tap). `playerEnters()` clears it, and starts a fresh entry, on the player's own navigation:
- `openPkg()` (Play, Continue, Replay, Restart from Home);
- Next, to a step or a level;
- entering a quest.

The Studio has no melody and is reached only from Home, so it needs nothing.

**One place where the decision could reach further, flagged as the coordinator asked: a sign-in.** A sign-in the
player makes through the form (landing screen, Home, the garden card) loads the account's progress and draws its
level. I treat that as the player's own action, so it plays once. That is the ticket's own signed-in playtest ("sign
in with an account whose current level is Question & Answer 6/9, and hear the call once"). `signInWith` holds
`authBusy` while the load lands; the boot's automatic session restore does not hold it, and stays silent. If the
owner wants a sign-in silent too, the change is one condition in `openingFor`.

**Browser differences.** The rule no longer asks the browser anything: the round-before's `navigator.userActivation`
clause is gone. A navigated entry always follows a click, so `playPhrase`'s `resume()` starts the clock in every
browser. An interrupted (iOS) or closed clock still drops the melody, because notes booked then would wait and sound
together later. Behind Home it is held, and every way off Home plays it after the 350 ms pause, as before.

**Tests** (`tests/opening-melody.test.mjs`, 46): the reload tests expect silence through the first tap, Loop, Home
and Close, under both resume behaviours, and even when the browser runs the clock at once. Listen plays it once. A
reload then Next (to a step, or a level) plays the new stage's opening. A player's sign-in, from the landing screen
or through Home's form, plays the account's level once (held behind Home; never in a quest). A signed-in reload whose
cloud lands on another level stays silent. Tests that start mid-game now begin with a real navigation (`played()`:
the first tap, then Garden Basics from Home). Mutation checks, run by hand, each fail at least one test: the quiet
check, its `authBusy` exception, each `playerEnters()` (step Next, level Next, `openPkg`, the quest branch),
`playerEnters` clearing the flag, the interrupted drop, and every round-3 line again. Full suite below.

## PR review — round 4 (gpt-6.2-astra, through `ask.sh`), on 1dae9d4 — the owner's extra, last round

(A first round-4 run on cb6abfd was stopped unfinished when the owner corrected the decision; it produced nothing.)

<details><summary>GPT's review, verbatim</summary>

**Changes requested on PR #178 at `1dae9d4`.** The owner’s silent-reload rule works on the ordinary guest and signed-in restore paths. The remaining failures concern deliberate entries, including the owner’s fresh-window sign-in playtest.

### Must change before merge

| Severity | Failure and regression test |
|---|---|
| **High** | **A slow form sign-in can still queue two calls on a frozen clock.** In a fresh window, submit the landing form and delay the Q&A 6/9 cloud response until transient activation expires. `openingDue()` accepts `suspended`, and `playPhrase()` requests `resume()` and immediately books every note. On a browser that still requires activation, the player hears silence. Pressing Listen then unlocks the queued call and books a second one. Test the real sign-in with a delayed response and a context whose resume stays pending. Expect one opening on a running clock and zero bookings while suspended. The current fake makes activation permanent, and the landing test explicitly starts audio before signing in. [js/level-engine.js:28](js/level-engine.js#L28) · [js/goal-helpers.js:84](js/goal-helpers.js#L84) · [tests/opening-melody.test.mjs:600](tests/opening-melody.test.mjs#L600) · [WebKit’s activation check](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/Modules/webaudio/AudioContext.cpp#L92-L100) |
| **Medium** | **A form sign-in to the same silently restored stage produces zero calls.** Reload as a guest on Q&A 6/9, leave Listen untouched, sign in through Home to an account also on 6/9, then close Home. Boot recorded the stage as used. The cloud draw returns on stage identity before it reaches the `authBusy` exception. Nothing is held for Close. Under the PR’s explicit-sign-in interpretation, expect one call after Close. Keep the companion case where the opening already played before sign-in and the total stays at one. [js/level-engine.js:23](js/level-engine.js#L23) · [tests/opening-melody.test.mjs:158](tests/opening-melody.test.mjs#L158) |
| **Medium** | **An interruption now permanently drops a player-chosen opening.** Enter a melody level through Continue or Next, interrupt audio before 350 ms, then recover on that same level. The timer returns, the entry remains spent, and the player hears zero. Round 3 retained the unbooked phrase until recovery. The owner changed reload behavior only. Expect zero bookings during interruption, one after recovery on the same entry, and zero stale bookings if the player left first. The revised test explicitly expects the regression. [js/level-engine.js:29](js/level-engine.js#L29) · [tests/opening-melody.test.mjs:360](tests/opening-melody.test.mjs#L360) |
| **Medium** | **A keyboard Listen press can still span the deadline and play twice.** With a navigated opening pending and Listen focused, press Space at 340 ms and release at 370 ms. The timer books at 350 ms. The native button click on keyup books the manual copy. Expect one call for that press. The new test covers `pointerdown` only. [js/playback.js:345](js/playback.js#L345) · [tests/opening-melody.test.mjs:489](tests/opening-melody.test.mjs#L489) · [Space activation ordering](https://github.com/whatwg/html/issues/10301) |
| **Medium** | **Closing Home before the first deadline can still erase most of the post-Close pause.** Sign in through Home to a different melody stage. Close 340 ms after the cloud draw. `openingWaits` is still empty because the original timer has yet to inspect Home. The call books 10 ms after Close, and Listen at +50 ms books another. Expect silence through +50 ms and one manual copy. The existing test fires the original timer while Home is visible, guaranteeing that it exercises only the already-held case. [js/level-engine.js:22](js/level-engine.js#L22) · [js/home.js:11](js/home.js#L11) · [tests/opening-melody.test.mjs:537](tests/opening-melody.test.mjs#L537) |

### Round-3 rulings

| # | Ruling |
|---|---|
| 1. Listen spanning the deadline | **Resolved for pointer activation. Still open for keyboard activation**, as above. |
| 2. Failed quest entry strands a held call | **Resolved.** `leaveHome()` releases before the quest write can fail. Successful quest entry clears the release timer. The test still bypasses the actual card or trail button. |
| 3. Close on a suspended reload | **Superseded. I agree.** A quiet reload creates nothing for Close to release. |
| 4. Stale reveal plays the destination call | **Resolved.** The delayed callback checks its stage before starting the transport. The regression uses the real Call the Band reveal. [js/level-engine.js:193](js/level-engine.js#L193) |
| 5. Unlock consumes the post-Close pause | **Superseded for the reported reload/unlock sequence. I agree.** An already-held call gets the full pause. The pending-timer case above still fails. |
| 6. Stateless-context fallback | **Resolved.** Release no longer requires a literal `"running"` state. |
| 7. Re-armed timer coverage | **Resolved.** The post-Close tests distinguish the old and new deadlines for redraw, Next, and Studio. [tests/opening-melody.test.mjs:571](tests/opening-melody.test.mjs#L571) |
| 8. Player-path Play test | **Resolved.** `finishStep()` uses the real Play/Stop handler and verifies playback started and Next became visible. [tests/opening-melody.test.mjs:133](tests/opening-melody.test.mjs#L133) |

**Reload and navigation.** With no player navigation or explicit sign-in, I found no route from boot, automatic cloud restore, redraw, a field gesture, or Home and back that schedules the opening. A saved quest is hydrated at boot, and the game restores the last package. Leaving a live quest opens Home. Both Next branches and all four Home package actions start fresh entries. `placeCall` still runs on every Q&A draw. One boundary worth making explicit is that if the player navigates *before* the boot cloud pull finishes, `openingQuiet` has already cleared, so a late restore to a different stage can play that stage’s opening. [js/boot.js:32](js/boot.js#L32) · [js/quest-shell.js:401](js/quest-shell.js#L401) · [js/home.js:290](js/home.js#L290) · [js/level-engine.js:129](js/level-engine.js#L129) · [js/level-engine.js:317](js/level-engine.js#L317)

**Sign-in.** I agree that submitting the form counts as deliberate entry for the owner’s fresh-window playtest. `authBusy` is reliably positive during that draw. `signInWith()` increments it before authentication, awaits `onSignedIn(false)` through the synchronous `applyProgress()` render, and decrements it in `finally`. Automatic session restore calls `onSignedIn(false)` directly. The test helper increments `authBusy` itself, so it would pass even if the production form released the counter too early. The garden-card creation flow uploads local progress and takes a separate path. [js/cloud.js:219](js/cloud.js#L219) · [js/cloud.js:149](js/cloud.js#L149) · [js/boot.js:137](js/boot.js#L137) · [js/garden-card.js:66](js/garden-card.js#L66) · [tests/opening-melody.test.mjs:123](tests/opening-melody.test.mjs#L123)

**Low severity.** A secondary-button `pointerdown` on Listen spends a pending opening even though the context-menu action produces no Listen click. Also, the reload-test comment still states the superseded rule that an already-running clock plays on reload. [js/playback.js:346](js/playback.js#L346) · [tests/opening-melody.test.mjs:177](tests/opening-melody.test.mjs#L177)

This was a read-only source review of `3ca520d..1dae9d4`. I did not execute the PR or independently verify browser audio.

</details>

GPT on the owner's rule: "With no player navigation or explicit sign-in, I found no route from boot, automatic cloud
restore, redraw, a field gesture, or Home and back that schedules the opening." On the sign-in reading: "I agree that
submitting the form counts as deliberate entry for the owner's fresh-window playtest. `authBusy` is reliably positive
during that draw."

### My answers — all agreed; fixed in the commit after 1dae9d4, **not reviewed by GPT** (no fifth round)

1. **High — a slow form sign-in can queue the call on a frozen clock. Agreed.** `openingDue` no longer books on a
   clock that is not running. A suspended clock gets `resume()` and half a second: if its "running" comes inside
   that, the call plays once (`clockStarted`). After that it is dropped, so it never arrives with an unrelated later
   tap, and 🔊 Listen plays it. Test added with the real `signInWith`: the cloud is slow, the click's activation has
   expired (WebKit's rule), and a resume is left pending. Nothing is booked while suspended. Listen a second later
   gives Listen's copy only; a tap a second later gives nothing.
2. **Medium — a form sign-in onto the stage a reload silenced plays nothing. Agreed.** An entry the page's own draw
   silenced is marked (`openingSilenced`). A sign-in through the form onto that same stage is a new entry: held
   behind Home, once after Close. A stage whose call was already heard stays at one. Tests added for both, and for a
   reload, then Continue (heard), then a sign-in.
3. **Medium — an interruption now permanently drops a player-chosen opening. Agreed.** An interrupted clock waits,
   with no deadline, until the system gives it back. Leaving the level first drops it. Tests added for both.
4. **Medium — a keyboard Listen spanning the deadline plays twice. Agreed.** Listen cancels on Space and Enter
   `keydown` too. Test added.
5. **Medium — Close just before the first deadline leaves only 10 ms of pause. Agreed.** Leaving Home restarts a
   pending timer as well as a held melody (`releaseOpening` uses `openingNotes`), so the pause always runs from Close.
   Test added with GPT's timings.
6. **Low — a right-click on Listen spends the opening. Agreed:** only a primary-button `pointerdown` cancels. Test
   added.
7. **Low — a stale reload-test comment. Fixed.**
8. **Test — the sign-in helper set `authBusy` itself. Agreed:** it now drives the real `signInWith` with
   `cogSignIn` stubbed, so a form that released `authBusy` too early would fail the tests.

GPT's boundary note ("if the player navigates *before* the boot cloud pull finishes ... a late restore to a different
stage can play that stage's opening"): left as it is. The player has navigated by then, so the page is past its own
silent draws, and the cloud moving them to a new level is a new entry. If the owner wants that silent too, the
condition is in `openingFor`.

The statechange listener is back, only for waiting on a clock that is not running, and so is `load-gate`'s
`statechange` entry.

### Final verification (mine)

`tests/opening-melody.test.mjs`, 55 tests, all pass; on 1dae9d4's code the six covering findings 1–6 fail. The test
fakes' clocks are virtual: the 350 ms timers, and `performance.now()` for the half-second window. Every line of the
fix was mutation-checked by hand, 30 mutations in all, and each fails at least one test.

## PR review — round 5 (gpt-6.2-astra, through `ask.sh`), on 43e0943 — the owner's last round (D11)

The owner's bar, given to GPT in the prompt: "block only on High or Blocker and ticket the rest." GPT was asked for
honest severities, with the verdict "changes requested" only on a High or Blocker.

<details><summary>GPT's review, verbatim</summary>

**One High remains.** The delta prevents the frozen-clock double booking, but a slow sign-in from a fresh window can still produce **zero automatic openings** on Q&A 6/9. D7 requires one. The new regression test accepts silence on that path.

### Round-4 rulings

| Round-4 finding | Ruling at `43e0943` |
|---|---|
| **High — slow form sign-in** | **Still open against the round-4 acceptance test.** The running-state check fixes the duplicate. The landing handler passes the submit gesture into `signInWith()`, which awaits authentication without starting audio. If activation expires during the pull, the first audio request comes 350 ms after the cloud draw. The clock can stay suspended and the opening expires. The new test explicitly expects zero notes before a later Listen or tap. **Regression to add:** submit the actual landing form with audio untouched, delay the pull past activation, return Q&A 6/9, and make no further gesture. Require one complete call booked while running and zero notes booked while suspended. The submit gesture is available to start the clock before the first `await`. [js/boot.js:125](https://github.com/pad29/music-garden/blob/43e0943/js/boot.js#L125-L133) · [js/cloud.js:219](https://github.com/pad29/music-garden/blob/43e0943/js/cloud.js#L219-L229) · [js/level-engine.js:35](https://github.com/pad29/music-garden/blob/43e0943/js/level-engine.js#L35-L44) · [tests/opening-melody.test.mjs:638](https://github.com/pad29/music-garden/blob/43e0943/tests/opening-melody.test.mjs#L638-L658) |
| **Medium — sign-in to the same silently restored stage** | **Resolved for the reported sequence.** With Listen untouched, `openingSilenced && authBusy` lets the same-stage cloud draw schedule the opening. Home holds it until Close. The tests also cover an opening already heard through Continue. [js/level-engine.js:29](https://github.com/pad29/music-garden/blob/43e0943/js/level-engine.js#L28-L37) · [tests/opening-melody.test.mjs:661](https://github.com/pad29/music-garden/blob/43e0943/tests/opening-melody.test.mjs#L661-L682) · [tests/opening-melody.test.mjs:711](https://github.com/pad29/music-garden/blob/43e0943/tests/opening-melody.test.mjs#L711-L720) |
| **Medium — interruption drops a chosen opening** | **Resolved for the reported sequence.** An interruption already in effect at the 350 ms deadline gets an unlimited wait. Recovery consumes it once. Leaving first clears it. Both paths have tests. [js/level-engine.js:23](https://github.com/pad29/music-garden/blob/43e0943/js/level-engine.js#L23-L25) · [js/level-engine.js:39](https://github.com/pad29/music-garden/blob/43e0943/js/level-engine.js#L39-L44) · [tests/opening-melody.test.mjs:367](https://github.com/pad29/music-garden/blob/43e0943/tests/opening-melody.test.mjs#L367-L390) |
| **Medium — keyboard Listen spans the deadline** | **Resolved.** Space keydown at 340 ms cancels the pending opening before the click at 370 ms. The test exercises that ordering. Enter is also handled. [js/playback.js:345](https://github.com/pad29/music-garden/blob/43e0943/js/playback.js#L345-L347) · [tests/opening-melody.test.mjs:684](https://github.com/pad29/music-garden/blob/43e0943/tests/opening-melody.test.mjs#L684-L690) |
| **Medium — early Home Close shortens the pause** | **Resolved.** `releaseOpening()` now finds the still-pending notes, and `openingSoon()` clears the original timer. The new test closes at 340 ms, verifies silence 50 ms later, then presses Listen and counts one copy. [js/level-engine.js:26](https://github.com/pad29/music-garden/blob/43e0943/js/level-engine.js#L26-L27) · [js/level-engine.js:45](https://github.com/pad29/music-garden/blob/43e0943/js/level-engine.js#L45-L46) · [tests/opening-melody.test.mjs:700](https://github.com/pad29/music-garden/blob/43e0943/tests/opening-melody.test.mjs#L700-L709) |
| **Low — right-click spends the opening** | **Resolved.** A secondary-button `pointerdown` leaves the pending opening intact. The regression sends `button: 2` and requires one automatic call. [js/playback.js:346](https://github.com/pad29/music-garden/blob/43e0943/js/playback.js#L346) · [tests/opening-melody.test.mjs:692](https://github.com/pad29/music-garden/blob/43e0943/tests/opening-melody.test.mjs#L692-L698) |
| **Low — stale reload-test comment** | **Resolved.** The comment now says reload stays silent even on a running clock. [tests/opening-melody.test.mjs:185](https://github.com/pad29/music-garden/blob/43e0943/tests/opening-melody.test.mjs#L183-L186) |
| **Test finding — helper sets `authBusy`** | **Resolved.** `playerSignIn()` now calls production `signInWith()`. Production owns the increment and decrement through the cloud draw. The separate gap in the landing-form audio test is covered in the High above. [tests/opening-melody.test.mjs:129](https://github.com/pad29/music-garden/blob/43e0943/tests/opening-melody.test.mjs#L129-L137) · [js/cloud.js:222](https://github.com/pad29/music-garden/blob/43e0943/js/cloud.js#L222-L230) |

### New findings and regression cases

| Severity | Failure, expected behavior, and test to add |
|---|---|
| **Medium** | **Listen after a quiet reload leaves the stage eligible to replay on sign-in.** Reload on Q&A 6/9, press Listen and hear the call, then sign in through Home to an account on the same stage and close Home. Listen calls `cancelOpening()`, which leaves `openingSilenced` true. The cloud redraw consequently schedules a second call. Add this exact sequence and require the total to stay at one after Close. The current “already heard” cases both use package navigation, which clears the flag before playback. [js/playback.js:345](https://github.com/pad29/music-garden/blob/43e0943/js/playback.js#L345) · [js/level-engine.js:23](https://github.com/pad29/music-garden/blob/43e0943/js/level-engine.js#L23-L32) |
| **Medium** | **An unrelated field tap can still start the opening inside the 500 ms window.** Let the opening request a blocked resume at 350 ms, then plant a seed at 450 ms. If that gesture starts the clock, `clockStarted()` accepts it and books the call alongside the seed. The current test waits a full second, outside the window. Add the 450 ms case and require the field gesture to produce only its own feedback. Separately verify that a resume started by the entry itself can play the opening once without a second gesture. [js/level-engine.js:39](https://github.com/pad29/music-garden/blob/43e0943/js/level-engine.js#L39-L44) · [tests/opening-melody.test.mjs:649](https://github.com/pad29/music-garden/blob/43e0943/tests/opening-melody.test.mjs#L649-L656) |
| **Medium** | **Home can revive an expired opening.** Let the suspended wait exceed 500 ms without a running notification. Open Home, deliver the running notification while Home is visible, then close it. The listener returns before clearing the expired notes, and `releaseOpening()` gives them a new 350 ms timer. Add that sequence and require silence after Close. A phrase held because Home was already open at its original deadline should retain its existing post-Close behavior. [js/level-engine.js:42](https://github.com/pad29/music-garden/blob/43e0943/js/level-engine.js#L42-L46) |
| **Medium** | **An interruption beginning during a suspended wait inherits the wrong deadline.** Start the 500 ms wait on a suspended clock, transition to `interrupted` before it expires, then recover on the same stage after it expires. `clockStarted()` ignores the interruption and applies the original cutoff on recovery. Add that sequence and require zero bookings during interruption and one on recovery. The existing recovery test starts with a clock that is already interrupted. [js/level-engine.js:39](https://github.com/pad29/music-garden/blob/43e0943/js/level-engine.js#L39-L44) · [tests/opening-melody.test.mjs:367](https://github.com/pad29/music-garden/blob/43e0943/tests/opening-melody.test.mjs#L367-L378) |
| **Low** | **An abandoned keyboard Listen press spends the opening.** Focus Listen, press Space at 340 ms, move focus away with Tab, then release Space. Keydown has permanently canceled the opening and Listen receives no click. Add an aborted-press case requiring one automatic call on the same entry. Keep the completed-press case at one manual call. [js/playback.js:347](https://github.com/pad29/music-garden/blob/43e0943/js/playback.js#L347) · [tests/opening-melody.test.mjs:684](https://github.com/pad29/music-garden/blob/43e0943/tests/opening-melody.test.mjs#L684-L690) |
| **Low** | **An overlapping failed form sign-in can make an automatic same-stage restore audible.** Delay the boot session lookup long enough to open Home’s guest sign-in form. Submit it, hold authentication pending, let the boot restore draw the same Q&A stage, then fail authentication and close Home. The new same-stage exception sees the form’s global `authBusy` and grants the boot draw an opening. Add this ordering with independently deferred session and authentication responses. Expect the reload to remain silent after Close. [js/cloud.js:131](https://github.com/pad29/music-garden/blob/43e0943/js/cloud.js#L131-L151) · [js/cloud.js:222](https://github.com/pad29/music-garden/blob/43e0943/js/cloud.js#L222-L229) · [js/level-engine.js:29](https://github.com/pad29/music-garden/blob/43e0943/js/level-engine.js#L28-L33) |

### Additional missing tests

- **Medium — D12, navigation before automatic restore.** Hold the signed-in boot pull, open a melody level through Home, then resolve the pull onto a different melody stage before the first stage’s 350 ms deadline. Require exactly the destination phrase once and zero notes from the departed stage. `playerEnters()` implements the owner’s decision. The existing delayed-pull test performs only a field tap and correctly expects silence. [js/level-engine.js:25](https://github.com/pad29/music-garden/blob/43e0943/js/level-engine.js#L25-L33) · [tests/opening-melody.test.mjs:242](https://github.com/pad29/music-garden/blob/43e0943/tests/opening-melody.test.mjs#L242-L253)
- **Low — Listen while a real suspended wait is live.** Let a deliberate entry reach `openingDue()` on a suspended clock. Press Listen during its 500 ms window, deliver `running` between pointerdown and click, then release. Require one manual phrase. The existing press-through-unlock case starts from a quiet reload, which creates no waiting phrase. [tests/opening-melody.test.mjs:505](https://github.com/pad29/music-garden/blob/43e0943/tests/opening-melody.test.mjs#L505-L521)
- **Low — Enter activation.** Focus Listen, press Enter just before 350 ms, dispatch its native click on keydown, and advance past the deadline. Require one complete phrase. The new keyboard regression covers Space’s release-time click. [js/playback.js:347](https://github.com/pad29/music-garden/blob/43e0943/js/playback.js#L345-L347) · [tests/opening-melody.test.mjs:684](https://github.com/pad29/music-garden/blob/43e0943/tests/opening-melody.test.mjs#L684-L690)

Read-only source review of `1dae9d4..43e0943`. No files changed. I did not execute the PR tests or verify browser audio.

Changes requested at 43e0943f07c1fb0e8ee66b55458a5dbb6b16e094

</details>

GPT's round-4 rulings: every finding but the High is "Resolved".

### My answers — the High fixed in the commit after 43e0943, **not reviewed by GPT** (no sixth round, D11)

1. **High — a slow form sign-in plays nothing. Agreed.** Nothing on the sign-in path started the audio clock: the
   only page-wide unlock is a tap on the field (`grid.js`). So the clock was first asked to start 350 ms after the
   cloud draw, long after the click. A browser that needs a recent activation (WebKit) keeps it suspended, and the
   half-second wait then dropped the call. `signInWith()` now starts the clock (`initAudio(); actx.resume()`)
   synchronously on the Sign in click or Enter, before its first `await`. That covers the landing form and Home's
   form. GPT's regression is added: the real landing form handler, audio untouched, the activation gone by the first
   `await`, the cloud slow, no further gesture. It expects one whole call booked on a running clock, under both resume
   behaviours. Round 4's guard is kept as its own test: a sign-in whose click could not start the clock books
   nothing on the frozen clock, Listen gives one copy, and a later tap gives nothing. Mutations: no unlock, and the
   unlock moved after the first `await`, each fail the new test.
2. **Missing test, Medium — D12. Agreed; added after GPT's review** (the coordinator agreed: test only, no source
   change; GPT has not seen it). A signed-in reload on 6/9 is silent; the player opens 6/9 from Home; the account's
   progress lands on the echo level inside the 350 ms. It expects the echo once and not a note of 6/9's call. It
   fails if `playerEnters()` stops clearing `openingQuiet`.
3. **M2 — a field tap inside the 500 ms window brings the opening with the seed. Not fixed; it goes to the owner**
   (the coordinator: the owner's reload objection was exactly an opening that starts together with planting a seed).
   It needs a player-chosen entry (Next, or a package from Home; not a reload, which never schedules it) whose own
   `resume()` at the 350 ms deadline is refused. A sign-in no longer gets there, because its click now starts the
   clock. In Chrome the deadline's `resume()` succeeds after any earlier click, so I do not expect it there. The tap
   must land within 500 ms after the deadline, about 0.35–0.85 s after the level appears or Home closes. Checked by
   hand: a tap 100 ms after the deadline books the whole call at the tap, and a tap 600 ms after books nothing. What
   the player hears is the whole call or phrase starting about 0.1 s after the tap, over the seed's own note. The
   fix is small (S): start the clock on the navigation click itself, as the sign-in now does, and drop the half-second
   wait, so an opening that finds the clock not running is left to Listen.
4. **M1, M3, M4, L1, L2, and the Low test gaps (a Listen during a live suspended wait; Enter activation): not fixed
   here, by the owner's bar.** Filed as one Backlog ticket, TUN-132 (M; blocked by TUN-125). M2 is not in it.

### Verification (mine)

`tests/opening-melody.test.mjs`, 57 tests, all pass. The full suite is in the PR hand-off.
