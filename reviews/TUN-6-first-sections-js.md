# TUN-6 — Move the first sections of the script into js/ files

Branch `claude/tun-6-first-sections-js` · PR #79

The top 749 lines of `index.html`'s inline script — everything before `// ---------- Grid ----------` —
moved byte for byte into five classic scripts loaded by `<script src>` tags where that code was:
`js/palettes.js`, `js/audio.js`, `js/band.js`, `js/drums.js`, `js/doc-model.js`. The cut stops at Grid
because that is where load-time DOM wiring (`buildGrid();`) begins, which is TUN-7's.

## Design review (Astra)

GPT: *"The cut points look sound. I found no High-severity blocker, but several verification claims
need narrowing."* It re-ran the six proposed parts in memory through the harness (993 bindings
survived; the four golden-wrapped functions stayed `window` properties) and agreed the rest-script's
hoisting is unchanged, the names and granularity are right ("Keep these five files and names"), both
test edits are correct, and there is no hard-invariant conflict.

1. **Medium — nested URLs.** *"Visiting `/anything/` serves `index.html`, but `js/palettes.js` resolves
   to `/anything/js/palettes.js`. That missing path receives HTML through the catch-all … after this
   split, essential game code fails."* **Agreed.** Measured on the deploy preview: `/anything/` gives five
   `Unexpected token '<'` and `COLS is not defined` — a dead page — where production today starts with
   its samples silently broken; `/anything` (no slash) works. What such URLs should do is a product
   decision, so it is **TUN-68** (needs-owner) rather than a redirect change inside a pure move; the
   `netlify.toml` comment that called the rewrite "harmless" now says this.
2. **Medium — release consistency.** *"Atomic deploys and revalidation do not guarantee a page uses one
   release"* (new HTML + a rollback before its script requests land). **Agreed it is real; accepted as
   residual risk**: the window is the milliseconds between the page and its script requests, and the
   fix (content-hashed file names) needs the build step the project rules out. Not ticketed.
3. **Medium — failure behaviour differs.** A missing or failing file no longer stops the scripts after
   it. **Partly agreed.** The claim is now *successful-load* equivalence, and the failure mode was
   characterised in production conditions (item 1 is exactly "every `js/` file answered with HTML").
   **Disagreed** on a throttled-load test: synchronous classic scripts execute in document order however
   slowly they arrive; throttling can only lengthen the time before the page is wired.
4. **Medium — the goldens can't hear the band or the sampled voices.** *"Concrete false pass: a sample
   pack never becomes ready … while every golden remains identical."* **Agreed.** Added: all seven sample
   packs decoded on the preview; the band's own `kick`/`bTone`/`noiseHit` calls captured for every groove
   on both builds and compared; mixer bus gains; Studio edits, meter, undo/redo, save/reload; a quest
   edited, forked, compared and offered. Listening is on the owner's playtest list.
5. **Low — the netlify test's contract.** *"`cp -r js site/scripts` copies the directory but leaves every
   declared script URL broken."* **Agreed** — the check requires the exact source→destination mapping,
   `-r` for folders, and `index.html`, with those mutations as tests. The deployed check fetched every
   script URL the served page references and compared bytes, not just MIME types.
6. **Low — "same test count".** **Agreed**: reported as the 600 existing tests plus the new ones.

Also taken: AGENTS.md's "`index.html` is the artifact" sentence, and GPT's wording for the load-order
rule (*"Initialization may use already-initialized bindings and functions declared in the current or
earlier scripts; deferred calls may use later scripts once loaded."*).

## Test pass (Astra)

Briefed per TUN-5's rules: new test files only, no edits to `tests/harness.mjs`, `tests/helpers/`, any
existing test or the game; `gen-voice` only with `--dry`. **It complied** — five new files, nothing else
touched, `voice/` clean. 12 tests, 10 green, **2 red — both real false greens in my publish checker**:

1. **Medium** — `echo publishing # && cp -r js site/js` counted the commented-out copy (the checker
   split on `&&` without honouring a shell comment). **Agreed, fixed.**
2. **Medium** — a `command` in a `[context.*]` table ahead of `[build]` hid a missing copy in `[build]`
   (the checker read the first `command =` in the file). **Agreed, fixed** — and widened: a context
   command *replaces* `[build]`'s for that deploy, so the checker now requires every build command to
   publish the scripts, with a test for a production override that forgets `js/`.

The checker moved into `tests/helpers/netlify-publish.mjs` so GPT's review test imports it instead of
slicing my test file's source text. Each part of the fix was mutation-checked: undoing the comment
handling, reading only the first command, and ignoring context tables each fail the test meant to
catch them.

**Kept:** `load-order-review.test.mjs` + its observer (moved to `tests/helpers/load-order-observer.mjs`)
— the permanent guard for silent `typeof`/`window.`/`in` probes of a later script's names, with positive
controls, which TUN-7 needs more than this ticket did; `split-contract-review.test.mjs` (every `js/`
file loaded exactly once; the four golden wrappers still intercept — a `const` fails it);
`netlify-publish-review.test.mjs` (root/nested/spike/CRLF coverage and the two regressions).
**Deleted:** `hook-copy-layout-review.test.mjs`. It re-ran the whole G audit twice (11 s, the slowest
test in the suite) to prove my temp-checkout copy loop handles a script outside `js/` — a failure that
already announces itself, because the TUN-5 G-audit test stops with "cannot read <path>" the moment
such a script isn't copied.

## Verification

- **Suite:** 614/614, 0 skipped — the 600 pre-existing tests (599 titles unchanged, one retitled because
  "today: one inline script" became false) plus 14 new (3 mine, 11 GPT's).
- **Mutation audits,** sorted "caught" lines identical to the pre-split baseline: questsetup 472
  mutations across 146 green tests; famous-meter 18 faults across 8. Eleven anchors now live in `js/`
  (10 in `doc-model.js`, 1 in `drums.js`), so the hook genuinely patched external files.
- **`gen-voice --dry`:** 230 stories + 18 credits → 248 clips, 0 to generate, 0 pruned; `voice/` clean.
- **Byte identity:** HEAD~1's inline script === the five files + the new inline script, joined; the page
  outside the script differs only by the five tags.
- **Load order:** each file run alone, in order, under a logging global: no load-time touch of a later
  script's name, no name declared twice; the only load-time global reads are `freshDoc` and `beatColMap`,
  both inside `doc-model.js`. Now also a permanent test (above).
- **Deploy preview (https, Chromium):** every `js/` file served `application/javascript; charset=UTF-8`,
  byte-identical to the commit; the served `index.html` identical to the commit once Netlify's 221-byte
  preview-only drawer snippet is removed. Emoji in moved code decode (drum labels, groove names). No
  console errors on load, the `?dev` jump (Footsteps, completed level 1), the Studio (edits, 3/4 and 6/8,
  undo/redo, mixer gains, all seven sample packs decoded, Jig with Jam, save → reload → load), a `#s=`
  link, and a quest played end to end (edit, fork, compare A/B with rings kept through undo, offer).
- **Goldens:** all nine re-captured with the README's recipe on the preview and, with the same setup, on
  production (the pre-split build, its `index.html` hash-identical to main's): content-identical to
  `playback.json` (G as a prefix — how many columns fit in 10 s is wall-clock) and hash-identical to
  each other. The band's own calls for all seven grooves: hash-identical between the builds. Recorded in
  `playback.json` `_RESULT_2026_09_28`.
- **Found, not caused:** the `?dev` package list's "Studio" throws `setPlayScope: not a package: studio`
  on production too → **TUN-69**.

**Not verified:** `file://` and a local http server — this unattended scheduled run may not start a dev
server, and the browser pane refused `file://` (as it did for TUN-5); Firefox and Safari; the phone;
anything by ear.
