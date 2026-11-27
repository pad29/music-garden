# TUN-134 — Make browsers re-check the game's scripts after every deploy on tunegarden.game

Size **S** (label and `## Size` agree). Bug, infra.

## Owner's decisions

Recorded in the ticket's *Decisions already made* (the owner, 2026-11-26), not reopened:

- "Browser Cache TTL was 4 hours; I set it to Respect Existing Headers." The live headers were measured
  afterwards and match `_headers` (ticket comment, 2026-11-26).
- The check on the live headers is a documented `curl` line in `README.md`, run by hand after any change
  to Cloudflare settings. No script under `tools/`, and no test that depends on the network ("A, the
  documented curl line").
- No agent session changes a Cloudflare or repository setting.
- On the night of 2026-11-26 (relayed by the orchestrator): no script, no network-dependent test; the
  check after the next deploy is the owner's, in the hand-off.

## Plan (Claude)

- `README.md` § Deployment, right after "Cloudflare settings that must stay off" (TUN-114): a paragraph
  that names **Browser Cache TTL** and its required value, **Respect Existing Headers**, where it is, and
  why (the script names don't change between deploys; the 4-hour default replaced `max-age=0` on the
  custom domains only, as measured on 2026-11-25).
- The check: a `sh` block in the same form as TUN-114's injection check. It does a `curl -fsSI` on both
  custom domains for `/` and one file per folder cache rule (`js/`, `samples/`, `vendor/`, `voice/`), and
  prints `ok` / `WRONG` (with what came) / `FAILED` per URL.
- Cross-references: the *Caching* bullet in README, and the comment above `/` in `_headers`.
- Tests in `tests/workflow-scripts.test.mjs`, beside the injection check's: the block is pulled out of
  README and run under bash with a fake `curl` (no network). Every file it asks for exists, each expected
  value is what `_headers` sets for that path, every `/<folder>/*` cache rule has a file in the check,
  correct headers read `ok`, the 4-hour value, a missing header and two headers read `WRONG`, and a
  failed fetch reads `FAILED`, only for its own URL.

## Tests

`node --test "tests/*.test.mjs"`, green. Mutations caught: the block reading `ok` on a mismatch; an
expected value that differs from `_headers`. Not verifiable here: what the live domains send. That is
the owner's check after the next deploy, with the README block.
