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
  profile too, and to `boot.js`'s page-load read of the click, which is as unvalidated as the one this
  PR fixed (that file is another worker's today, TUN-69, so it is not touched here).

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
