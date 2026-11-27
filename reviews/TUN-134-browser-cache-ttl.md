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

## PR review, round 1 (`gpt-6.2-astra`, `ask.sh fresh read-only`, on `c87a60c`)

Verdict: **CHANGES REQUESTED**. GPT's findings, verbatim:

> 1. **Medium — `README.md:305–307`.** A `302` from `www` carrying the expected `Cache-Control` prints `ok`, even though the asset was never reached. The pipeline also reads headers from every response block, so a proxy or interim response can supply a header missing from the final response. Require a direct `200` and inspect only its headers. Describe `ok` as a check of the response at that URL, since the documented HTML fallback can also return `200`. [curl `--fail` documentation](https://curl.se/docs/manpage.html#-f)
> 2. **Low — `README.md:294`.** “Previews always show what `_headers` says” overstates the evidence. The `tunegarden.game` zone setting does not apply to `pages.dev`, but each preview serves its own deployment, and redirects take precedence over `_headers`. Limit the claim to the zone setting and the observed responses. [Pages previews](https://developers.cloudflare.com/pages/configuration/preview-deployments/) · [Pages header precedence](https://developers.cloudflare.com/pages/configuration/headers/#match-a-path)
> 3. **Low — `README.md:306`.** A correct HTTP/1.1 header with a tab after the colon or trailing spaces prints `WRONG`. Trim optional spaces and tabs at both ends of the field value before comparing. [RFC 9112 §5.1](https://www.rfc-editor.org/rfc/rfc9112.html#section-5.1)
> 4. **Low — `tests/workflow-scripts.test.mjs:908`.** `existsSync` accepts directories. An added `/js/` probe passes this assertion and matches the folder rule without identifying a script. Check membership in the published file list.
>
> ### Missing tests
>
> - Return `302` with the expected header on `www` and a valid `200` on apex. Only apex should print `ok`.
> - Put the expected header on an interim response, then omit it from the final `200`. Expect `WRONG`.
> - Return mixed-case `Cache-Control` with a leading tab and trailing space. Expect `ok`.
> - Add `/js/` as a probe and require the file check to reject it.
> - Emit matching headers, then have fake curl exit `18`. Expect `FAILED`. The current fake exits before emitting any headers.

My answers. I agreed with all of them, and all are fixed in the same commit as this record:

1. **Agreed.** The block keeps only the last response block (`awk` resets at each `HTTP/` line) and requires its status to be `200`. Anything else prints `FAILED: <url> (answered <status>, not 200)`. README now says `ok` means the URL answered `200` itself, and that the files are ones the build publishes, so a `200` is the file, not the `index.html` fallback.
2. **Agreed.** The claim now says only that the setting belongs to the `tunegarden.game` zone and does not touch `*.music-garden.pages.dev`, so those hosts can read right while the custom domains read wrong.
3. **Agreed.** The value is trimmed of spaces and tabs at both ends (`[[:space:]]`).
4. **Agreed.** `probeProblems` requires a regular file (`statSync().isFile()`) under a folder `cloudflare-build.sh` publishes (or `/`), and a value `_headers` sets. The test feeds it `/js/`, a missing file, `/README.md` and a wrong `voice/` value, and expects each to be refused.

Missing tests, all added: the `302` on `www` against `200` on apex; the header only on an interim block (`WRONG`), and only on the final one (`ok`); a response with no status line (`FAILED`); mixed case with a tab and trailing spaces (`ok`); the `/js/` probe refused; headers then exit 18 (`FAILED`). The fake `curl` now prints its fixture before exiting with the chosen code, so every failure case runs with the headers present.

One round, as tonight's instructions set. A second GPT round needs the owner's yes.

## Tests

`node --test "tests/*.test.mjs"`, green, after each round. Mutations caught: the block reading `ok` on a mismatch; an
expected value that differs from `_headers`. Not verifiable here: what the live domains send. That is
the owner's check after the next deploy, with the README block.
