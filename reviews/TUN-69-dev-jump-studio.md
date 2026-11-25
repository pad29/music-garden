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
