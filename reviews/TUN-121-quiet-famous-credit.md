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

## Tests

- `tests/narration.test.mjs`, three new cases on a real famous capstone with every timer held: left on → the
  credit's clip once; off during the tune → no clip, no browser voice, the toggle cancels none of the tune's
  timers and the camera still follows the sweep; off then on → the story is the only clip, still current and
  sounding. Mutations checked by hand: the old unguarded callback fails the two toggle cases; a `speakOn`-only
  guard fails the off-then-on case.
- Whole suite green. Browser: the page loads this branch's `js/famous.js` (byte-compared) with no errors or
  console output. **Not verified:** anything audible — AO's browser can neither hear nor run page code; that is
  the owner's playtest.
