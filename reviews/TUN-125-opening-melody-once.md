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

## Owner's decisions

None asked.
