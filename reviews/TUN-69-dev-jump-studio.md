# TUN-69 — Stop the ?dev package jump from throwing when Studio is picked

Branch `ao/dev-package-jump/root` · PR pending

## Plan (Claude)

- **Cause:** `#devpkg` lists every key of `PACKAGES`, `studio` included, and its handler in
  `js/boot.js` calls `openPkg(id, 0)` for any pick. `openPkg` asks `setPlayScope` for a package scope,
  which refuses `studio` (a hidden non-DAG node, not a package) and throws.
- **Fix:** in the `#devpkg` handler only, send `studio` to `openStudio()` — the same entry the map's
  `▶ Open Studio` uses — and every other id to `openPkg(id, 0)` as today. The ticket's decision holds:
  route around `studio`, don't make it a package. `populateDevJump()` already handles a Studio scope
  (`scopeCatalogId()` is `"studio"`), so the level list follows on its own.
- **Tests** (`tests/dev-jump.test.mjs`): boot `js/boot.js` with `?dev` and drive the real `#devpkg`
  handler. Picking `studio` lands in a Studio scope with the palette and voice `openStudio()` gives (a
  second, plain load calling `openStudio()` is the reference); picking a real package lands on its first
  level and `#devjump` lists its levels. The harness gets a remembering `<select>` for `#devpkg` (its
  `makeSelect`, per `tests/README.md`), since the generic stub swallows the `onchange` assignment.
  The Studio case fails against today's code (it throws).
- **Out of scope:** the rest of the dev bar; any player-facing Studio entry.

## Owner's decisions

None asked: size S, not `needs-owner`, no open question at the design checkpoint.

## Tests

- `tests/dev-jump.test.mjs` (2 tests) — both fail on `main` with `setPlayScope: not a package: studio`
  (checked by reverting `js/boot.js`), both pass with the fix. Full suite green.
- Browser (AO preview of this worktree, `js/boot.js` byte-checked against the server): `?dev`, pick
  *Studio* → level "1. Studio", voice Guitar, the guitar discovery card, no page errors; then pick
  *Footsteps* → "Level 1/9: Wake the Path", `#devjump` lists its nine levels, no page errors.
- Not verified: production (`tunegarden.game/?dev`) — after the merge.

## PR review, round 1 (`gpt-6.2-astra`, through `ask.sh`) — on `87703b7`

<details><summary>GPT's review, verbatim</summary>

1. **Verdict: CHANGES REQUESTED** on `87703b723c083294bec2a31211deffb2aa3173c8`. The runtime fix is correct. The issues are in the test harness and regression coverage.

2. **Required changes**

   1. **Medium — `tests/dev-jump.test.mjs:61`.** The real-package case selects `intro`, the same package whose levels populated `#devjump` at boot. A handler that always opens `intro` for every real-package pick would pass. So would a level list that never refreshed after boot. Use a distinct destination such as `footsteps` and check the list on both sides of the Studio → Footsteps transition.
   2. **Low — `tests/harness.mjs:230`.** The new `devpkg` branch takes precedence over `elements.devpkg`, so `loadGame` silently discards a caller-supplied recording element that worked before this PR. Use `makeSelect("")` as the default for `devpkg` and honor the explicit override.

3. **Missing tests**

   1. Strengthen the existing round-trip case. Supply a recording `devpkg` select, verify that `studio` and `footsteps` are actual options, and drive its installed handler. After selecting Studio, expect its single level. After selecting Footsteps, expect active package `footsteps`, `levelIdx === 0`, and the Footsteps option values and labels in order. This also exercises the harness override. The current stub accepts `pkg.value = "studio"` even if Studio is absent from the dropdown.

4. **Notes**

   The new branch calls the map's `openStudio()` function. A quest's `scopeCatalogId()` is `null`, so the current-scope guard permits that transition. Both destination functions retain their `authBusy` checks, and boot loads after their declarations. `git diff --check` passed. I reviewed the code statically and relied on your reported suite and browser results.

</details>

**My answers**

1. **Medium — real-package case picks `intro`.** Agreed: `find()` took the first key, `intro`, which is also the boot package. The round-trip test now goes boot → Studio → `footsteps`, asserts the boot package is neither, and checks `#devjump`'s values and labels after each jump.
2. **Low — harness `devpkg` overrides `elements.devpkg`.** Agreed: the `devpkg` default now sits after the `elements` lookup, so a caller's own element wins.
3. **Missing test — recording `#devpkg` round trip.** Added as asked: the round-trip test brings its own recording `#devpkg`, asserts `studio` and `footsteps` are among its options, asserts the harness hands back that element, and drives its handler. The Studio test keeps the harness's default `#devpkg`, so both paths are covered.

Checked by mutation, each turning a test red: `main`'s `js/boot.js` (both fail); a handler stuck on `openPkg("intro", 0)`; a `#devjump` list that never refreshes after boot; the harness's `devpkg` default ahead of `elements`. Suite 1107/1107.
