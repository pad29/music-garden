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

1. **open — the reload choice.** After a reload on a level with an opening melody, it plays once at the first tap,
   press or click (today's behaviour, kept), or stays silent until 🔊 Listen. The owner (2026-11-25, 3:57 PM PT,
   through the coordinator) will playtest it and decide. The current behaviour stays until then.
2. **open — the round-3 fixes are unreviewed.** The skill allows three PR review rounds; all are used. Either a
   fourth GPT round on the round-3 delta, or a hand-off for playtest on my verification alone.
