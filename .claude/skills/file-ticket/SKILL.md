---
name: file-ticket
description: File a Tune Garden work item in Linear, shaped so an AO worker that starts cold can act on it. Use when planning (the AO orchestrator's job), and whenever work turns up that should not be done now (a noted-not-fixed bug, a deferred idea, an out-of-scope finding).
---

File this as a Linear issue: $ARGUMENTS

A ticket is read by a worker that has **none of this conversation**, and pasted verbatim into the brief
from which GPT designs the work. Everything they need must be in the ticket or in a file the ticket
names. "As discussed" and "the approach we agreed" are useless to them.

## Before filing

1. **Search Linear first** (team **Tune Garden**, all states) for an issue covering the same thing. If
   one exists, add a comment or tighten its description instead of filing a duplicate.
2. Read enough of the repo to name the right functions, files and doc sections. Name **functions and
   section headings, not line numbers** — line numbers are stale by the time the ticket is picked up.

## Where it goes

- Team **Tune Garden**, state **Backlog**. Never Todo: moving a ticket to Todo is the owner's decision,
  and the order of Todo is the order of work.
- **One label from the `Area` group** (Linear allows only one): `audio` (scheduler, voices, mixer), `editor` (field, tools, gestures, Studio),
  `content` (levels, packages, famous tunes, narration), `quests`, `infra` (tests, tooling, build,
  deploy, repo structure), `docs`.
- **`needs-owner`** when only the owner can validate the result: anything musical (score-checked tunes,
  feel, sound), a design decision with more than one defensible answer, or a change to player-facing
  pacing. A worker stops on these once GPT's design and its critique exist, and asks — and it applies
  this same test to questions the design turns up (`work-ticket` § 5).
- **One type label:** `Bug` when something shipped behaves wrongly, `Feature` for something new, `Improvement`
  for making something that exists better — a refactor or a chore is an `Improvement`.
- **Blocked by**: link any ticket that must land first (a refactor of shared files blocks the work
  that edits them while it is in flight).

## Title

Imperative, and player-facing when there is a player: *"Let the free tunes carry sixteenth-note bars"*,
not *"16th grid support"*. For a pure chore, say what changes: *"Split index.html's script into files"*.

## Description — use this template, every heading, in this order

```markdown
## Why
What the player (or the owner, for tooling) experiences today, and what should change. One paragraph.

## Done looks like
- Observable, checkable criteria. Prefer "the Moldau opens with bars" over "meter is loaded".
- Include the owner's check when there is one: "Owner playtests X on the phone".

## Read first
- The doc sections that own this (`EDITOR-DESIGN.md` §17 "FAMOUS ENTRIES", `PACKAGES-DETAILED.md` …).
- The functions and files involved (`famousToSong` in `js/save-share.js`, `placeFamous` in `js/famous.js`).
- Prior reviews: `reviews/TUN-…md` files or `REVIEW-LOG.md` entries on this area, by heading.

## Decisions already made
Quote them, with who and when: *"Capstone rewards stay bar-less" — EDITOR-DESIGN §17, 2026-08*.
Neither GPT's design nor the worker may reopen these.

## Constraints and traps
The `AGENTS.md` invariants this touches (the `file://` rule, score-validated FAMOUS melodies, stable
slugs, generated files, per-package toolbox, netlify.toml asset folders), plus any known trap.

## Open questions
Decisions only the owner can make, each with the options you see. Empty is fine. Anything here means
the ticket also gets `needs-owner`.

## Out of scope
What a session might be tempted to do alongside this and should not.

## Size
S (an hour or two) · M (a session) · L (several sessions — consider splitting it).
```

## After filing

Report the issue ID, its title and its labels, one line each. When filing several from a planning
session, finish with the list in the order you would suggest working them, and say which ones block
others. Do not move anything to Todo.
