# TUN-5 — Make the tests and tools load the game's scripts as a list

Branch `claude/tun-5-scripts-as-list` · PR (see below)

## Design review (Astra)

GPT: *"The shared-context VM approach is correct; the main weaknesses are extraction fidelity and the
generator's destructive behavior."* It independently confirmed on Node 24.15 that lexical bindings
reach later scripts, redeclaration throws, an early call cannot see a later function declaration, and
that a scripts-only narration scan finds the same 230/18/248 as the raw-HTML scan.

1. **High — `gen-voice` can read one worktree and prune another.** *"`gameScripts()` defaults to the
   helper's repository root, but … `OUT_DIR = "voice"` [is] relative to the working directory."*
   **Agreed** — `voice/` and the page now both resolve from the tool's own repo root. Verified: a
   `--dry` run from another directory reports 0/248/0 and creates no stray `voice/`.
2. **Medium — globally blanking HTML comments changes executable source** (`"<!-- audible -->"` in a
   JS string). **Agreed** (I had caught this independently) — one left-to-right pass matches comments
   and `<script>` elements, so a script body is kept verbatim. Test added.
3. **Medium — document order only models synchronous classic scripts** (`async`/`defer`/`nomodule`).
   **Agreed** — those attributes on a local script throw. Test added.
4. **Medium — the stated type handling silently excludes valid JavaScript** (`type=""`,
   `application/javascript`, case/space). **Agreed** — the browser's JavaScript MIME list is accepted,
   case- and space-insensitive; `module` and any other type throw rather than being skipped; the
   gen-voice prune guard checks `byKey.size === 0` after normalisation. Tests added.
5. **Medium — `new Function` checks the wrong grammar** (`return;`, `new.target` pass). **Agreed** —
   `checkSyntax` compiles with `new vm.Script(src, { filename, lineOffset })`. Tests added.
6. **Medium — the proposed proof leaves the new infrastructure largely untested.** **Agreed** —
   `tests/game-scripts.test.mjs` (10 tests) builds throwaway pages covering mixed inline/external
   order, cross-file `const`/`let`, live getters, early calls, conflicting declarations, missing files,
   comments, types, CRLF and line numbers, and `applyPatches`. The 565 game tests are counted
   separately and are unchanged. The browser half of the proof could not run (below).
7. **Low — the harness discarded the original error's stack.** **Agreed** — kept as `cause`; timeout kept.
8. **Low — `__script` compatibility is conditional on source placement** (`questcast.test.mjs` slices
   from `const QUEST_DESCRIPTOR_CAPABILITY=` to `// GROOVES is an array`). **Agreed** — recorded in
   `tests/README.md` for TUN-6/TUN-7; no code change in this ticket.

## Test pass (Astra)

Briefed per the ticket: add new test files only, never touch `tests/harness.mjs` or `tests/helpers/`,
run `gen-voice` only with `--dry`, never write to `voice/`. **It complied** — `git status` showed only
its two new files; `voice/` clean. It wrote 25 tests: 20 passed, 5 failed. GPT: *"All five are
failures in `game-scripts.mjs`, not mistakes in the tests."*

1. **Medium — a quoted `>` in an attribute** (`data-note="a > b" src=…`) ended the tag early and made
   an external script look inline, dropping its source *"including its narration"*. **Agreed** — the
   tag pattern now skips quoted values; the inline body offset no longer assumes no `>`. Fixed.
2. **Medium — `<script-notes>` matched as a script** (`\b` accepts the hyphen). **Agreed** — a tag name
   must be followed by whitespace, `/` or `>`. Fixed.
3. **Medium — `<script>` inside `<textarea>` was executed.** **Agreed** — the same pass now skips the
   content of text-only elements (`style`, `textarea`, `title`, `xmp`, `iframe`, `noembed`, `noframes`,
   `noscript`). Fixed; I added a `<style>` case of my own.
4. **Low — entity-encoded `src` (`js/a&#46;js`) not decoded.** **Disagreed** — we write `index.html`, so
   script paths stay plain; decoding HTML references and URL escapes is more surface to get wrong than
   the case is worth. It now refuses an encoded path by name (`… is encoded — use a plain relative
   path`) instead of an ENOENT. GPT's test was rewritten to assert the refusal.
5. **Low — percent-encoded `src` (`js/a%20b.js`) not decoded.** **Disagreed**, same reasoning and change.

It also proved, in child processes, that an anchor in an external file is patched under the real hook,
that missing/duplicate anchors, syntax and init failures, and a missing or duplicated hook needle fail
*before* the test body runs, and that the questsetup `--g-only` audit catches its faults when the whole
game is relocated into `js/game.js` (22 mutations across 5 green tests at the time).

**Files kept:** `tests/game-scripts-edge-review.test.mjs` (16 tests, after merging the two encoded-src
tests into one refusal test) and `tests/game-scripts-hook-review.test.mjs` (8 tests). Changed in the
latter: it asserted the real page has exactly one script — which would fail TUN-6 for no reason — so it
now relocates the first inline script; and its exact "22 mutations across 5" count became "audit
passed", so an unrelated future G-fault change can't break it.

**Mine:** a concatenating harness (all scripts run as one) turns 3 loader tests red, including the
early-call-across-files test — the invariant the ticket calls out.

## Verification

- Suite: 565 pre-existing tests unchanged and green, plus the loader's own tests.
- Mutation audits, before vs after, identical "caught" lines: famous-meter 18 faults / 8 tests;
  questsetup 472 mutations / 146 tests.
- `gen-voice --dry`: 230 stories + 18 credits → 248 clips, 0 to generate, 0 pruned.
- Throwaway proof (reverted): `playSong` and the `fourchord` FAMOUS entry (it holds a `credit:"…"`)
  moved into `js/probe.js` before the inline script → `check-syntax` OK on 2 scripts, gen-voice
  0/248/0, suite green, famous-meter audit 18/8 with its `playSong` anchors caught inside `probe.js`.
  A load-time call from `probe.js` to a function in the later inline script made the harness throw,
  naming `js/probe.js`.
- **Not verified:** the probe split in a real browser over HTTP and `file://` — this unattended
  dispatcher run could not start a preview server or open `file://`. The committed change does not
  touch `index.html`.
