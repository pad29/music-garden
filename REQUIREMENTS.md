# Music Garden — Requirements

*A game that teaches music theory through play. "Minecraft for music."*
Last updated: 2026-06-11

---

## 1. Vision

A game that makes people **want** to learn music theory because playing it is genuinely fun — not a quiz or a drill wearing a game costume. Players compose real music by manipulating simple visual elements, and absorb the *function* of musical concepts (tension, resolution, harmony, chord construction) by feeling them in action, long before they meet the names.

The north star is **"Minecraft for music"**: a world with simple, consistent rules where complexity emerges from combination, anyone can build something they're proud of, creations persist, and people play together.

---

## 2. Audience

- **Primary:** children, roughly ages 8+.
- **Secondary:** adults — the game should appeal across a broad spectrum (the social element depends on broad appeal).
- **Assume zero prior knowledge** of music theory at the start.

---

## 3. Functional requirements

These are the original design pillars (numbered as first discussed), plus the two later additions.

| # | Requirement | Notes |
|---|---|---|
| 1 | Appeal to **both children and adults**, weighted toward children 8+ | Broad appeal is also a prerequisite for the social features |
| 2 | **Actually fun** — people return because they enjoy it, not just to study | The make-or-break requirement. If it isn't fun solo, social won't save it |
| 3 | **Organically + visually** teach music theory's structure | 2D nature (melody = horizontal/time, harmony = vertical/pitch); 12 notes/octave; scale step-patterns; chord construction; chord relationships (tension, resolution, function) |
| 4 | **Composing real passages** is part of the game | Players create, not just react or answer |
| 5 | **Progress simple → complex**, assuming zero starting knowledge | A real difficulty/concept ramp |
| 6 | **Function over names** — concepts taught by role, names not in your face | Names available on hover; introduced explicitly only when complexity demands it |
| 7 | Incorporate **different instruments** | Timbre as an expressive/learning dimension |
| 8 | **Retention** — elements that pull players back to keep learning | Progression, unlocks, collection, social |
| 9 | **Simple but fun, engaging graphics** | Content & accomplishment are the main draw, not art fidelity |
| 10 | **Browser first**; later mobile; **client-heavy**; **accounts + saved progress** | Backend on AWS; maximize in-browser computation |
| 11 | **Styles** — learn about and compose in different musical styles | Unlocked after basics |
| 12 | **Eras** — explore the music of different historical periods | Unlocked after basics |

---

## 4. Clarified product decisions

Decisions made during brainstorming that refine the requirements above:

- **Real music as the payoff.** Output should sound like genuine music, not just abstract patterns — increasingly important because of the social element.
- **Symbolic-first, with notation as a destination.** Keep play symbolic; real notation is an optional "lens" players grow into, not a mode-switch that hides the game. (See Design §4.)
- **Visual-first, audio-second** — but with *diegetic* ear-training (e.g. "it's night, navigate by ear"), never "name that interval" quizzes.
- **Social from early on, especially co-op composing** — players collaboratively build whole pieces by interacting with visual elements that turn into real music. (Reframed technically — see Design §3.)
- **Multiple play modes:** quick learning sessions, longer quests, and an open-world/sandbox mode for building, collaborating, and exploring.
- **Rigor grows with the player:** start as a forgiving "toy," become more theoretically rigorous and free over time — mirroring how real instrument learning works.
- **Hidden curriculum, visible powers** *(2026-06-11)*: the theory/package graph stays internal; players see a world of goals, powers, and discoveries — never "scales-1". Progression must read as *gaining abilities and opening regions*, not completing a curriculum. (Design §2b.)
- **Four motivation tracks** *(2026-06-11)*: learning (lessons), exploration (new worlds/physics), creation (identity & expression), and social (remix/co-create) — all driven by the same underlying packages.
- **World consequence** *(2026-06-11)*: completing things visibly and *persistently* changes the world (garden restoration), and every unlock is presented as a power, not a UI feature. The strongest analogy set: Minecraft (creation) + Roblox (identity/social) + GarageBand (musical payoff) + DragonBox (learning invisibility).

---

## 5. Technical requirements

- **Platform:** runs in a modern web browser (v1). Mobile app later, only if the game succeeds with early users.
- **Client-heavy:** push as much computation to the browser as possible (audio synthesis/playback, game logic). Minimize backend load.
- **Backend:** AWS. Responsibilities: user accounts/auth, saving & loading progress, and (later) social/sharing/collaboration data.
- **Accounts & persistence:** users can register so progress is saved and resumed across sessions.
- **Audio:** real-sounding instruments. Plan: a small curated set of good **sampled** instruments, cached client-side. (Prototype currently uses lightweight synthesis.)
- **Data modeling:** model musical data so social/collaboration can slot in later, even if v1 is solo.

---

## 6. Non-goals (for now)

- Not a notation editor or DAW (those are destinations/lenses, not the core).
- Not a performance/rhythm game (reacting to falling notes) — though a light rhythm minigame could be a reward later.
- Not a flashcard/quiz app.
- Mobile app, deep notation export, and large-scale community features are explicitly **later**, not v1.

---

## 7. Success criteria

- **v1 proves the solo "wow":** *"I placed simple things in a world, it sounded like real music, and learning it felt like play."*
- A first-time player with zero theory knowledge makes something that sounds good within ~60 seconds.
- Players feel they are **progressing** (acquiring tools/abilities), not being tested.
- Early testers want to come back. (Informal signal so far: an 11-year-old "liked it a lot"; a 15-year-old enjoyed it but noted it resembled existing toys — addressed by adding the crafting tree, goals, and progression that no toy has.)

---

## 8. Constraints & principles

- **Can't-sound-bad guarantee:** at the beginner stage, any player action must produce a pleasant, musical result. (Implemented via the "musical physics" constraint engine — see Design §2.)
- **Names not in your face:** terminology is optional/hover-only early, surfaced only as complexity demands.
- **Design for everything, build a thin slice:** the full vision informs the architecture, but v1 ships a small, proven core.
