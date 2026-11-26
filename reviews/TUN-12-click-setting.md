# TUN-12 — Stop an older cloud profile keeping the live click setting

Branch `ao/click-setting/root` · PR #174

## Plan (Claude)

Size **S** (label and `## Size` agree). The finding is `REVIEW-LOG.md` § "Merging `main` into `quests`…
(2026-09-26)", Low.

- **Approach:** in `applyProgress()` (`js/cloud.js`), set `clickMode` from `progress.settings.click` when
  it is there and to the default `"off"` when it is not — **outside** the `if(progress.settings)` block, so a
  profile with no `settings` at all resets the click too (it has no `settings.click` either, and a fresh
  page would read "off"). Then write `clickMode` back to the `#click` control (`clickEl.value`), as
  `syncMeterUI()` does, so the select never shows a mode the game is no longer in.
- **Tests** (`tests/click.test.mjs`, through the real `#click` handler — never a poke at `clickMode`,
  `tests/README.md`): set "both" with `clickEl.onchange()` in a metered Studio; apply a profile whose
  `settings` lack `click` → preference and control read "off", and a metered Studio no longer clicks;
  the same for a profile with no `settings` at all; a profile with `click: "in"` still wins.
- **Scope:** `applyProgress` only (TUN-128 is changing the rest of `js/cloud.js` today). `boot.js` is not
  touched: on a page load the live value *is* the default, so it already behaves.
- **The other settings** (the ticket's *Constraints and traps*): `voice`, `tempo` and `mix` have been
  written together in `settings` since the first commit, and `speak` already falls back to its default.
  So inside a `settings` object only `click` can be missing. But a profile with **no `settings` object**
  keeps the live voice, tempo, mix **and** read-aloud — the same "absent means keep the live value"
  shape. Filed, not fixed here: see *Filed*.
  **Corrected after GPT's PR review, round 1:** that missed the commonest shape. The progress default
  (`js/persistence.js`) is `settings:{}`, so a profile pushed before any control changes carries an
  **empty** `settings` object: it keeps the live voice, tempo and mix, while read-aloud goes to on. A
  wholly absent `settings` keeps all four. TUN-129 now covers both.

## Filed

- **TUN-129** (Backlog, `needs-owner`, S) — a cloud profile with no `settings` object keeps this device's
  voice, tempo, mix and read-aloud. Whether "absent" should mean the defaults or the device's own choices
  has two defensible answers, so it is the owner's. Broadened after round 1 to the empty `settings:{}`
  profile too. (Round 1 also moved `boot.js`'s unvalidated click read there; round 2 brought it back
  into this PR, and TUN-129 no longer carries it.)

## Build

- `applyProgress()`: `clickMode=(progress.settings && progress.settings.click) || "off"`, after the settings
  block. **No explicit `clickEl.value` write**, though the plan had one: `renderLevel()`, which
  `applyProgress` always calls, runs `syncMeterUI()`, and that writes `clickEl.value=clickMode`
  unconditionally. The extra write was dead weight no test could tell from its absence.
- Tests: three in `tests/click.test.mjs` § "a cloud profile arriving (TUN-12)". The pull lands while the
  child is in a level (unmetered), so the only path that redraws `#click` is `applyProgress`'s own
  `renderLevel` — with the meter left on, `resetTransient` redraws it too and hides that path.
- Mutations, each run against `tests/click.test.mjs`: the old line restored → 2 fail; the reset moved inside
  `if(progress.settings)` is the same as the old line for the settings-less case → caught by the second
  test; unconditional `"off"` → 1 fails (the profile's own click is lost); `renderLevel` without its
  `syncMeterUI()` → 3 fail (the control keeps "both").
- Suite 1108/1108. Browser: the game loads from this worktree's `js/cloud.js` (served bytes compared) with
  no page errors. **Not verified:** a real sign-in — the cloud API's CORS list allows only production, so
  it is on the owner's playtest after merge.

## Owner's decisions

None asked — no `needs-owner` label and no open question.

## PR review

### Round 1 (`gpt-6.2-astra`, `ask.sh fresh read-only`) — on `cc4a7c1`: changes requested

<details><summary>GPT's review, verbatim</summary>

**Changes required on `cc4a7c1`**

1. **Low — An unknown stored click value enables a count-in and leaves `#click` blank.** I reproduced this with `settings.click: "bogus"`. `applyProgress()` keeps `"bogus"`, `clickOn()` returns `true` in a metered Studio, and the real select has no matching option. Current PUT validation rejects that value, but GET deliberately returns legacy rows without validation. Accept only `"off"`, `"in"`, and `"both"` when restoring the preference, with `"off"` as the fallback. Boot has the same unchecked read. `settings: null` and `settings.click: ""` already reset correctly. [Cloud restore](./js/cloud.js#L120) · [Boot restore](./js/boot.js#L29) · [Click gate](./js/playback.js#L117) · [Legacy GET](./backend/src/progress-api.mjs#L26)

2. **Low — The review notes and TUN-129 miss the ordinary `settings: {}` profile.** I confirmed that committing fresh progress before changing a setting persists `{}`, and the backend accepts it. Applying that profile keeps the live voice, tempo, and mix while setting read-aloud to on. A wholly absent `settings` object keeps all four. Correct the review notes and broaden TUN-129 to cover both shapes so the owner’s decision includes profiles the game actually writes. The other settings can stay in that follow-up. [Review notes](./reviews/TUN-12-click-setting.md#L21) · [Progress initializer](./js/persistence.js#L6) · [TUN-129](https://linear.app/pad29/issue/TUN-129/decide-what-a-cloud-profile-with-no-saved-settings-does-to-this)

**Missing test**

1. Set `"both"` through the real `#click` handler → apply a profile with `settings.click: "bogus"` → assert `clickMode` and `#click.value` are `"off"`, then enter a metered Studio and assert `clickOn()` is `false`.

The requested absent-field behavior works. Every applied pull reaches `renderLevel()` and its `syncMeterUI()` call, including when the control is hidden. Sign-out, failed pulls, and garden-card sign-up apply no incoming profile. All 14 click tests passed, and the three in-memory mutations reproduced the reported **2, 1, and 3** failures.

</details>

**My answers**

1. **Low — an unknown stored click value turns a count-in on and blanks `#click`.** **Agreed.**
   `applyProgress` now accepts only `"in"` and `"both"`, and anything else is `"off"`. Test added: a
   profile with `click:"bogus"` → `clickMode` and `#click` read "off" and a metered Studio does not count in.
   I also added a test where the profile's `"both"` reaches a game whose click is off, because accepting
   only `"in"` would otherwise have passed. **`boot.js`'s same read is not fixed here:** TUN-69 is working
   in `js/boot.js` today and this ticket keeps to `applyProgress`. It is in TUN-129 instead.
2. **Low — the review notes and TUN-129 miss the `settings:{}` profile.** **Agreed**, verified against the
   progress default in `js/persistence.js`. Notes corrected above (the original plan text is kept, with
   the correction under it); TUN-129 broadened. Test added for the click: an empty `settings` object resets
   it to "off".

**Missing test** — the bogus-click case: **added**, as GPT described it.

Mutations after the fixes, each against `tests/click.test.mjs` (17 tests): no value check → 1 fails (bogus);
accept only `"in"` → 1 fails (`"both"` arriving); unconditional `"off"` → 2 fail; the original line → 4 fail.

### Round 2 (`gpt-6.2-astra`, `ask.sh fresh read-only`) — on `a62852e`: changes requested

<details><summary>GPT's review, verbatim</summary>

**Changes required on `a62852e`**

1. **Low — Reloading restores the invalid click value from the same cloud profile.** I reproduced this through `onSignedIn(false)` with a legacy row containing `settings.click: "bogus"`. Sign-in set the live mode to `"off"` but stored `"bogus"` in `mg_progress`. A fresh boot from that copy restored `"bogus"`, leaving `#click` without a matching option and enabling the count-in in a metered Studio. Boot must apply the same fallback in this PR. Deferring it to TUN-129 leaves the round‑1 failure reachable after sign-out and reload. [Cloud profile write](https://github.com/pad29/music-garden/blob/a62852e/js/cloud.js#L152) · [Boot restore](https://github.com/pad29/music-garden/blob/a62852e/js/boot.js#L29) · [Count-in gate](https://github.com/pad29/music-garden/blob/a62852e/js/playback.js#L117)

**Missing test**

1. Pull a profile with `settings.click: "bogus"` through `onSignedIn(false)` → boot a fresh game from the resulting `mg_progress` with no signed-in session → assert `clickMode` and `#click.value` are `"off"`, then enter a metered Studio and assert `clickOn()` is `false`.

The review notes and TUN-129 now describe both `settings: {}` and absent `settings` correctly. All 17 click tests passed, and I reproduced the four mutation failure counts of **1, 1, 2, and 4**. I did not independently verify the reported full-suite result. [TUN-129](https://linear.app/pad29/issue/TUN-129/decide-what-a-cloud-profile-with-no-saved-settings-does-to-this)

</details>

**My answers**

1. **Low — a reload restores the invalid click from the same cloud profile.** **Agreed** — my round-1 answer
   was wrong to defer it: the pull stores the profile as it came (`Store.set` before `applyProgress`), so
   the page load is part of the same failure. Fixed here: one helper, `clickModeFrom(settings)` beside
   `clickMode` in `js/playback.js`, used by both `applyProgress` and `boot.js`'s page-load read, so the
   two restores cannot drift apart. The `boot.js` change is that one line, reported to the coordinator
   first because TUN-69 is working in that file today. I did not normalise the stored copy itself:
   changing what is saved back to the cloud is out of scope ("how settings sync").

**Missing test** — **added**, along GPT's path: the real `onSignedIn(false)` pulls a profile with
`click:"bogus"` (a small Cognito/fetch stand-in in `tests/click.test.mjs`, rather than editing
`cloud-sync.test.mjs`, TUN-128's today), then a fresh page boots from the `mg_progress` it stored →
`clickMode` and `#click` read "off", and a metered Studio does not count in. Also added: a page load still
restores a stored "both", so a "boot always off" fix would fail.

Mutations after the fixes, each against `tests/click.test.mjs` (19 tests): `boot.js`'s old read → 1 fails;
boot always "off" → 1; `applyProgress`'s original line → 5; unconditional "off" in `applyProgress` → 2;
the helper without its value check → 2; the helper accepting only "in" → 2.
