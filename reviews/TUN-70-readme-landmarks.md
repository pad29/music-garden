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
