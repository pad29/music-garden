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
