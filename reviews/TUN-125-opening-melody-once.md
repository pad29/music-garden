# TUN-125 — Play a level's opening melody once, not twice

Branch `ao/melody-once/root` · PR pending · Size S

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
| **Next** to 6/9's second step inside 350 ms | **twice** (step 2's call) | 1 |
| **Next** through an echo level's steps inside 350 ms | **both steps' phrases** | 1 |
| An echo level, then another package, inside 350 ms | **the echo plays in the other package** | 1 |
| Guest: Home → Q&A onto 6/9; Next onto 3/9; 6/9 step 1 → step 2 at a normal pace | once each | — |
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

- `tests/opening-melody.test.mjs`, 17 tests. On the code before the fix, 12 fail — every doubling row in the table
  above, every-stage-once, ▶ Play inside the 350 ms, and `scheduleOpening` keeping one melody; all 17 pass with it. The ones that pass on both are guards for the new
  waiting melody (a tap, Listen, ▶ Play before and after the unlock) and the single-draw paths.
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

## Owner's decisions

None asked.
