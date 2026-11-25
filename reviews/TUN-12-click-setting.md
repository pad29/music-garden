# TUN-12 — Stop an older cloud profile keeping the live click setting

Branch `ao/click-setting/root` · PR (not yet)

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

## Filed

- **TUN-129** (Backlog, `needs-owner`, S) — a cloud profile with no `settings` object keeps this device's
  voice, tempo, mix and read-aloud. Whether "absent" should mean the defaults or the device's own choices
  has two defensible answers, so it is the owner's.

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

(pending)
