# TUN-70 — Point README's key landmarks at functions that exist

Branch `claude/tun-70-readme-landmarks` · Size S · session `music-garden-15` (with TUN-9, PR #94)

## Plan (Claude)

Measured on `origin/main` 698210d: `speakLine()`, `fuse()` and `saveProgress()` exist nowhere in `js/`;
`narrate`, `stopSpeech`, `enterPlay`, `speakStory` are in `js/play-scope.js`; `fusePick`, `fuseField`,
`craftFromCells`, `stampTool` in `js/editing.js`; `commitProgress`, `saveUserSettings`,
`savePackageProgress`, `saveActiveInventory` in `js/persistence.js`.

- **README § How the game's code is organized** — the Narration, Crafting and Persistence landmarks
  name the real functions and their files, no line numbers. Persistence says which writer a new caller
  uses: its own field into `progress` then `commitProgress()` (as boot, met regions, the companion and
  playback already do), or the save that owns its data — never a fresh snapshot of the controls.
- **README § Dev workflow, step 3** — already done on `main` by PR #85: step 2 runs the tests, step 3
  keeps the browser and `file://` checks. No change.
- **Sibling doc** — `PACKAGES-DETAILED.md`'s Twin Blooms mechanic says `fuse()` records each pair;
  it is `craftFromCells()`. The other `saveProgress()` mentions (`EDITOR-DESIGN.md`'s dated review,
  `tests/README.md`'s "the old `saveProgress()`") are history and stay.
- **Overlap with TUN-9:** TUN-9's nearest README hunk (the `FAMOUS` landmark) is ten lines above these;
  no hunk touches or abuts another, so this branches from `origin/main`, not stacked.
- **Tests:** docs only — syntax check and the suite. No new test.

## PR review — round 1 (Astra, `ask.sh`, on 1efa9c7; one call reviewed this PR and TUN-9's #94)

<details><summary>GPT's findings for this PR, verbatim</summary>

**PR B — #96, head `1efa9c7512a2e445d21efd463b0e8ecefbeba703`**

Changes required:

1. **Should-fix — `README.md:141`:** "`commitProgress()` is the **only sink**." This repeats the persistence comment without accounting for `js/cloud.js:47`: `onSignedIn()` directly calls `Store.set("progress", progress)` when restoring cloud progress. Qualify the guarantee as the sink for gameplay progress mutations and document the cloud-restoration exception. This needs only a documentation correction.

Missing tests: **none**. Function locations, crafting behavior and save ownership are verifiable directly from the implementation.

The remaining narration/crafting descriptions, including `craftFromCells()` recording `ev.pairs`, match the code. Dev workflow already contains the test command and browser/`file://` checks.

**Verdict: CHANGES REQUESTED**

(On the pair: "Both patches merge cleanly in either order under read-only three-way merge inspection. Their nearest README hunks have three untouched lines between them.")

</details>

My answers:

1. **Agreed, and it went further than GPT said.** `Store.set("progress", …)` is called directly in
   three places besides `commitProgress()`: `onSignedIn()` (`js/cloud.js`, the one GPT named), and in
   `js/boot.js` the `?reset` wipe and the `?dev` "🗝️ Unlock quests" tool. README now calls
   `commitProgress()` the only sink *for gameplay writes* and names all three exceptions.

**Tests:** syntax check (29 scripts) and the suite, 664/664, after the fix.

## Owner's decisions

1. *GPT's round-2 PR review hit the ChatGPT usage limit* (2026-11-12, 15:34 local: "You've hit your
   usage limit … try again at 8:25 PM"). Wait for the reset and run round 2 then, or merge on round 1's
   fixes without it? — **open**. Round 2 never ran, so one round of three is used.
