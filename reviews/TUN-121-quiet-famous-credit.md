# TUN-121 — Keep a famous tune's spoken credit quiet once Read aloud is turned off

Branch `ao/quiet-tune-credit/root` · Size S · labels `audio`, `Bug` · found by the PR review of TUN-112
(`reviews/TUN-112-one-voice-after-sign-in.md`)

## Plan (Claude)

1. **The guard** (`js/famous.js`, `revealFamous`): remember `narrateSeq` when the credit is scheduled, and
   have the credit's callback speak only if Read aloud is still on **and** nothing has narrated since —
   the pattern `closeInstrCard`'s delayed story already uses (TUN-112). Off during the tune: `speakOn` is
   false, silence. Off then on: turning it on narrates the level story, which bumps `narrateSeq`, so the
   credit skips itself and the story is not cut off. Left on: nothing narrates between the level's
   completion and the credit (the power card and the companion's evolve are silent; leaving the level runs
   `renderLevel`, which clears `famousTimers`), so the credit is still read once, as today.
2. **Nothing else moves:** the credit's timer stays in `famousTimers` (a level change still clears it), and
   the visual timers are not touched. No change to credit text, `voiceHash`, or `narrate`.
3. **Tests** (`tests/narration.test.mjs`, the TUN-112 fakes): reveal a real famous capstone with every
   `setTimeout` held, then — left on: one new clip, the credit's; off during the tune: no clip, no browser
   voice; off then on: the story is the only new clip and stays current; and the visual timers are all
   still booked and run after either toggle.

**Choice — the credit after a restarted story:** when Read aloud is turned off and back on during the tune,
the credit is **dropped, not queued** after the story. The ticket leaves this to the worker. Queuing it
would need a new mechanism (chaining on the story clip's `ended`, plus its browser-voice fallback) for an
S ticket that says "no new mechanism", and the credit's text is written to the status line as the tune starts, by
`playFamous` (`setStatus(f.credit)`). The owner may overrule.

## Owner's decisions

None asked: the ticket has no open questions and is not `needs-owner`.

1. *The credit after Read aloud off-then-on: dropped, not queued after the story* — **accepted, no code change
   wanted**: the owner, relayed by the orchestrator in the AO session, 2026-11-26.

## PR review (`gpt-6.2-astra`, `ask.sh` in place of AO's reviewer) — round 1, on `9a7786f`

<details><summary>GPT's review, verbatim</summary>

## Required changes

1. **Medium — Make the timer tests honor deadlines and cancellation.** The tests call the real `revealFamous()` and toggle handler. The credit is the last timer booked synchronously at this head, so the tests do exercise the intended callback. But all three would still pass if its delay changed from `durMs + 900` to `0`. The visual check has a similar blind spot. A toggle that calls `famousTimers.forEach(clearTimeout)` would freeze the camera in the browser while preserving the array length. The test would still move the camera because `runVisual()` invokes the captured callbacks directly. Use a fake clock that honors both `setTimeout` and `clearTimeout`, and advance it through the reveal. Each case already gets a fresh game VM, so I found no shared game-state leak. [Timer fixture](./tests/narration.test.mjs#L285) · [Left-on assertion](./tests/narration.test.mjs#L299) · [Camera assertion](./tests/narration.test.mjs#L308)

I found no production change to require. On an uninterrupted capstone, the power card, companion evolution, and camera sweep do not request narration. The authored `pendingReveal` actions belong to other levels. A step change, successful cloud load, quest entry, or Studio/Jukebox playback clears the old reveal timers. Instrument discovery occurs on region entry. Its delayed story is the one independent narration callback worth distinguishing: if it overlaps a reveal, the sequence guard lets the newer story keep the voice. Turning Read aloud back on likewise increments `narrateSeq`, which is why checking `speakOn` alone would reintroduce the interruption. The existing guard is sufficient, and the diff changes no credit text, voice hash, or asset loading. [Completion and reward order](./js/level-engine.js#L178) · [Stage reset](./js/level-engine.js#L47) · [Quest field reset](./js/quest-shell.js#L289) · [Instrument-card callback](./js/playback.js#L81) · [Read-aloud toggle](./js/play-scope.js#L156)

## Missing tests

- **Credit timing and count.** Reveal a capstone with Read aloud on → advance through the first sweep and stop just before `durMs + 900` → expect zero credit clips. Cross the deadline and drain the remaining timers → expect exactly one clip for that tune’s credit.
- **Camera continuity across either toggle.** Record the camera columns for an uninterrupted reveal → repeat with Read aloud turned off midway, then in a separate run with it turned off and back on → expect the same remaining camera columns in the same order. Retain the existing silence and surviving-story assertions.

## Verdict

**CHANGES REQUESTED** on `9a7786f2cfc8bc78f3340ba0d14a7ba0ab2dfaed`. This was a read-only source review against `d31900a`. I did not execute PR code or independently verify audible playback.

</details>

**My answers**
1. **Medium — the timer tests ignore deadlines and cancellation.** **Agreed.** The tests now run the reveal on a
   fake clock that honours `setTimeout` and `clearTimeout`, advancing through it instead of calling the held
   callbacks directly.
- **Missing test, credit timing and count — added.** Nothing before the last column's time + one column + 900 ms
  (`durMs+900`, derived from the camera's own timestamps and `stepDur()`, not from the timer list); exactly one
  credit clip after.
- **Missing test, camera continuity across either toggle — added** to both toggle cases: the camera columns equal
  an uninterrupted reveal's, in order, with the toggle landing mid-sweep (asserted).
- Mutation audit, run by hand on the new tests: credit delay `0` → all three fail; Read aloud off calling
  `clearFamousTimers()` → both toggle cases fail; the old unguarded callback → both toggle cases fail; a
  `speakOn`-only guard → off-then-on fails; a `narrateSeq`-only guard → off fails. Control (the credit
  clearing timers once the sweep is over) → all pass.

One round, as tonight's instructions say: no second GPT review; the fixes are tests only.

## Tests

- `tests/narration.test.mjs`, three cases on a real famous capstone, run on a fake clock: left on → the credit's
  clip once, not before `durMs+900`; off mid-tune → no clip, no browser voice, the camera visits every column an
  uninterrupted reveal does; off then on mid-tune → the story is the only clip, still current and sounding, and
  the same camera columns. Mutation audit: § PR review.
- Whole suite green (1227/1227). Browser: the page loads this branch's `js/famous.js` (byte-compared) with no errors
  or console output; the branch preview serves the head's `js/famous.js`. **Not verified:** anything audible —
  AO's browser can neither hear nor run page code; that is the owner's playtest.
