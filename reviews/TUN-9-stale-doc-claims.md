# TUN-9 — Correct stale claims in AGENTS.md and README.md

Branch `claude/tun-9-correct-stale-claims` · Size S

## Plan (Claude)

Measured first (2026-11-12, `origin/main` 698210d): `FAMOUS` 18, `JUKEBOX_FAMOUS` 16 (README's list
misses *Swing Low, Sweet Chariot*); `PACKAGES` 20 + the Studio, matching README and `PACKAGES.md`;
`node tools/gen-voice.mjs --dry` reports 248 clips (README says 182, AGENTS.md "~180"); 60 test files;
the scripts total ~8.7k lines, so `tests/harness.mjs`'s "~8.6k" already stands; PR #85 already removed
the "no test suite yet" bullet and README's "no automated tests yet". Meter and bars ship in the Studio
(`DESIGN.md` Phase 2j, 2026-08-28; Waltz and Jig grooves 2k), but no package teaches them.

- **`AGENTS.md` § Current reality** — the `EDITOR-DESIGN.md` bullet says notes-as-objects and duration
  are not built and the grid is "fixed 8th-note steps". Rewrite it shorter: phases 0–2 are built (note
  objects, undo and the seed tray, duration vines, meter and bars in the Studio); dynamics, multi-voice,
  sections and the chromatic lattice are not. § Regenerators' "~180 clips" → "~250".
- **`README.md`** — Quick start's "A young suite: it covers detectors and pure logic" → what it covers;
  § Current status: Jukebox 16, clips 248, and *Next up* item 1 no longer says the meter engine is
  missing; `FAMOUS` landmark: 16 Jukebox songs of 18; § Deployment's site name → `tunegarden.netlify.app`
  (the owner's comment on the ticket, measured 2026-11-08).
- **Sibling docs carrying the same false claims** — `tests/README.md` § Scope "This suite is young";
  `EDITOR-DESIGN.md`'s header "nothing here is built yet" (its own §16 marks phases 0–2 built);
  `PACKAGES.md`'s `march-and-waltz` "Blocked on that engine work".
- **Tests:** docs only — syntax check and the suite, to show nothing moved. No new test.
- **Left alone:** `DESIGN.md`'s dated feature log (history, not a current claim); the backend CORS
  origin (needs a backend deploy — the ticket comment puts it out of scope).

## Takeover (music-garden-15, 2026-11-12)

`music-garden-12` went idle before committing; its edits were saved as a patch and re-applied cleanly
on `origin/main` 698210d. Its branch name is still checked out in its retired worktree, so this one is
`claude/tun-9-correct-stale-claims`. Every claim was re-measured rather than trusted: `FAMOUS` 18,
`JUKEBOX_FAMOUS` 16 (Swing Low the missing title), `PACKAGES` 20 + the Studio over the 7 `REGION_MAP`
regions, matching README's table and `PACKAGES.md`'s 19 `BUILT ✅` + intro; intro 13 levels; the two
built-in quests; `gen-voice.mjs --dry` 248 clips; the 29 scripts total 8,665 lines (harness's "~8.6k"
stands); `EDITOR-DESIGN.md` §16 marks phases 0–2 `✅ BUILT`; `template.yaml` still allows
`music-garden.netlify.app`; live, `tunegarden.netlify.app` answers 200 and `music-garden.netlify.app`
404. Nothing in the patch needed changing.

**Tests:** syntax check (29 scripts) and the suite, 664/664 — docs only, no new test.

## PR review — round 1 (Astra, `ask.sh`, on 14db8c8; one call reviewed this PR and TUN-70's #96)

<details><summary>GPT's findings for this PR, verbatim</summary>

**PR A — #94, head `14db8c83a00df50f51b78d3f8878eeefa5a6a248`**

Changes required:

1. **Should-fix — `PACKAGES.md:466`:** "What remains … is **meter/bars** … which still gates `march-and-waltz`…" This current dependency list contradicts the corrected package entry. Meter, bar controls, loop ranges and count-in already exist in `js/doc-model.js`, `js/cursor.js` and `js/playback.js`. Distinguish remaining teaching/content work from implemented engine features.

2. **Should-fix — `README.md:173`:** The seven sampled voices are described as "revealed **gradually, one per region**." `REGION_INSTR` assigns six sampled voices to regions; the First Garden uses synthesized music box, and `openStudio()` gifts the seventh sampled voice, guitar. Correct this distribution.

3. **Should-fix — `PACKAGES.md:443`:** "generalizes the existing **5-groove system**." `GROOVES` contains **seven** entries, including Waltz and Jig—the additions this PR expressly documents elsewhere.

4. **Should-fix — `PACKAGES.md:469`:** "**World-map UI** … (current Home screen is package cards); separate workstream." The continent map already ships through `renderPkgs()` in `js/home.js`. This remains a false current-state dependency in a touched sibling document.

Missing tests: **none**. These require prose corrections, not new runtime tests.

Verified: 18 famous pieces, 16 Jukebox entries, 20 packages plus Studio, seven regions, 13 intro levels/four arcs, two quests, seven sampled voices, and 248 narration hashes with matching files. The harness's approximate line count is acceptable. AGENTS.md remains the same length in lines; its small wording expansion is not a concern.

**Verdict: CHANGES REQUESTED**

(On the pair: "Both patches merge cleanly in either order under read-only three-way merge inspection. Their nearest README hunks have three untouched lines between them.")

</details>

My answers — all four agreed, each checked against the code first:

1. **Agreed.** `loopStart/loopEnd` and `applyRange()` (`js/cursor.js`) and `clickMode`'s count-in
   (`js/playback.js`) ship. §8 item 1 now says meter and bars shipped (2026-08-28) and that what remains
   is the `march-and-waltz` package; `rain-and-sun` waits on dynamics (its own entry says velocity),
   Region 7 on sections.
2. **Agreed.** `REGION_INSTR` gives the First Garden `musicbox`; `openStudio()` gifts the guitar.
   README now says so.
3. **Agreed.** `GROOVES` has five styles plus 💃 Waltz and 🍀 Jig. "7-groove system", naming them.
4. **Agreed.** Struck through and marked resolved, as item 1 is; dated 2026-07-05 from `DESIGN.md`'s
   continent-map entry.

**Tests:** syntax check (29 scripts) and the suite, 664/664, after the fixes.

## PR review — round 2 (Astra, `ask.sh`, on 813e01f; one call reviewed this PR and TUN-70's #96; session `music-garden-18`)

<details><summary>GPT's findings for this PR, verbatim</summary>

**PR #94 — reviewed `813e01f63c8033d92bf4319685af1a878f25e9c2`**

Changes required:

1. **Should-fix — `README.md:167`, `PACKAGES.md:5,137`:** Pulse Woods still says “region complete” / “4 built — COMPLETE.” `js/packages.js` contains its four shipped packages but no `march-and-waltz`. The revised `PACKAGES.md:256` explicitly identifies that fifth package as remaining work. Remove or qualify these completion claims consistently.

2. **Nit — `PACKAGES.md:256,466`:** “shipped … (2026-08-28): … Waltz and … Jig grooves” incorrectly groups the grooves under the meter release date; the dependency summary similarly groups count-in beneath that date. `DESIGN.md` dates meter/bars to **August 28**, dance grooves to **August 29**, and count-in to **September 5**. Separate the dates or omit the grouped dating. All these features exist in the code.

The other round-1 corrections check out: voice distribution, seven grooves, the continent map and its July 5 date, and dynamics/sections phase dependencies.

Missing tests: **none** — these are prose corrections verifiable against existing code and the feature log.

**Verdict: CHANGES REQUESTED.**

(On the pair: "Read-only three-way merge checks found **no conflicts in either order**.")

</details>

My answers — both agreed, checked against the code and `DESIGN.md` first:

1. **Agreed.** `PACKAGES` has the four Pulse Woods packages and no `march-and-waltz` (PW-5, planned for
   that region). README's table row and `PACKAGES.md`'s region table now say `march-and-waltz` is still
   to come; the header no longer counts Pulse Woods as complete (Wave A still is — its list never held
   `march-and-waltz`). **Found while fixing it:** the same header said the 20 packages were "every Wave
   A–D package", but Wave D's `secret-doors` and `mist-paths` are unbuilt. It now names what the 20 are —
   the intro, Waves A–C, the ★ milestone and `sun-and-moon-garden` — measured against `PACKAGES` (20 +
   the Studio).
2. **Agreed.** `DESIGN.md` 2j (bars) 2026-08-28, 2k (grooves) 2026-08-29, 2l (count-in) 2026-09-05. Both
   lines now date each; the loop range is left undated.

**Tests:** syntax check (29 scripts) and the suite, 664/664, after the fixes.

## Owner's decisions

1. *GPT's round-2 PR review hit the ChatGPT usage limit* (2026-11-12, 15:34 local: "You've hit your
   usage limit … try again at 8:25 PM"). Wait for the reset and run round 2 then, or merge on round 1's
   fixes without it? — **A: wait and run round 2** (owner, through the orchestrator's spawn of `music-garden-18`, 2026-11-12 after the 8:25 PM reset). Round 2 ran on 813e01f; two rounds of three are used.
