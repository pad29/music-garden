# TUN-85 — Retire Netlify once tunegarden.game points at Cloudflare

Branch `ao/cloudflare-migration/root` · Size S (label `S`, `## Size` S) · `needs-owner`

## The precondition (Claude, 2026-11-14)

- **Nameservers:** `tunegarden.game` NS are `jay.ns.cloudflare.com` and `keira.ns.cloudflare.com`
  (`nslookup -type=NS … 1.1.1.1`). Both `tunegarden.game` and `www.tunegarden.game` resolve to Cloudflare's
  `104.21.75.12` / `172.67.166.65` at 1.1.1.1 and 8.8.8.8.
- **Headers:** both names answer `200` with `Server: cloudflare` and a `CF-RAY`, and send `_headers`'
  content security policy. (The first `curl -I` of `www` from this machine still got `Server: Netlify`,
  `X-Nf-Request-Id` — a stale local DNS cache; pinned to Cloudflare's address with `--resolve`, it answers
  from Cloudflare like the bare name.) Neither name redirects to the other.
- **The game loads:** `/` has the game's `<title>`; `js/boot.js` is `200 application/javascript`,
  `vendor/SHA256SUMS` `200`.
- **Sign-in and cloud sync:** the owner checked that the game loads and sign-in works on the custom
  domains (relayed in this session's spawn prompt). Without touching the owner's accounts, what I can
  check: a CORS preflight to the songs API from `https://tunegarden.game` and `https://www.tunegarden.game`
  each gets its own origin back in `access-control-allow-origin` (`204`), so the API answers both hosts
  whichever server sends the page.

## Owner's decisions

1. *Has the owner moved the domain to Cloudflare?* (the ticket's open question) — **Yes** (relayed by the
   orchestrator in the spawn prompt, 2026-11-14): nameservers switched to Cloudflare, the domain is
   Active, `tunegarden.game` and `www.tunegarden.game` added as custom domains on the Pages project
   `music-garden`, and the owner checked the game loads and sign-in works. This answer is the ticket's
   `needs-owner` checkpoint; no other question is open.

## Plan (Claude)

Measured first: Cloudflare's PR check is named **Cloudflare Pages**, and its link opens the owner's
Cloudflare dashboard, not the preview (PR #139: `dash.cloudflare.com/…/pages/view/music-garden/cb6e2c72-…`).
The previews are in the comment Cloudflare's app (`cloudflare-workers-and-pages`) posts on the PR: a
*Preview URL* per commit (`https://cb6e2c72.music-garden.pages.dev`) and a *Branch Preview URL* that
follows the branch (`https://ao-tun-86-headers-root.music-garden.pages.dev`). The workflow docs say so.

- **Delete** `netlify.toml`, `tests/netlify-publish.test.mjs`, `tests/netlify-publish-review.test.mjs`,
  `tests/helpers/netlify-publish.mjs`.
- **`tests/helpers/cloudflare-publish.mjs`** takes `copyGaps` (the "is every script at its path" rule) from
  the Netlify helper and drops the parity half: `cloudflareProblems({ script, scripts, allowed })`, no
  TOML reader. **`tests/cloudflare-publish.test.mjs`** drops `REAL_TOML` and the five Netlify-only tests
  (parity, publish dir, strict Netlify commands, quoted keys, other TOML spellings), keeps the allowlist,
  refusal, real-run and 404 tests, and gains the one Netlify-review case that still applies to the shared
  rule: a root script, a nested script and a `spike/` script, each reported alone when its own copy is
  dropped (TUN-6's GPT test pass, retargeted at `copyGaps`). The two other review cases (a shell `#`, a
  `[context.*]` command) test Netlify's lenient reader, which is gone; the strict parser already refuses
  `#` (`anything that is not a plain copy is refused`).
- **`tests/site-headers.test.mjs`**: `_headers` is published by the one build; the `netlify.toml` assertion
  goes.
- **Comments:** `_headers`, `cloudflare-build.sh`, `.gitignore`, `js/quest-catalog.js`,
  `tests/helpers/site-headers.mjs`, `tests/helpers/vendor.mjs` stop naming `netlify.toml` or "both hosts".
- **Docs:** `README.md` (the *Live* line, repository map, the build-order paragraph, *Platform & polish
  shipped*, § Deployment, § Backend's CORS sentence), `AGENTS.md` (*Live at*, the asset-folder invariant),
  `DESIGN.md`'s *Live* line (current state, not the dated log), `tests/README.md`, `backend/README.md`'s
  CORS note, `vendor/README.md`. `backend/template.yaml`'s only host comment ("a deploy preview, say") is
  already host-neutral and stays.
- **Workflow:** `work-ticket/SKILL.md` § 8 step 6, `browser.md`, `handoff.md`, `needs-input.md`: wait for
  the *Cloudflare Pages* check; take the preview from Cloudflare's PR comment (the branch alias, after
  checking its *Latest commit* is the head); fork PRs get none. `file-ticket/SKILL.md`'s *Constraints and
  traps*: "asset folders in `cloudflare-build.sh`". Followed once on this PR before the hand-off.
- **Tests:** syntax check, the whole suite (it runs blocks from the workflow docs), the mutation that
  each retargeted case still catches. No game code changes, so no browser check of gameplay; the PR's
  own Cloudflare preview is opened once to prove the new instructions find it.

## Build (Claude)

As planned, plus two found along the way: `tests/backend-template.test.mjs`'s "deploy-preview origin"
mutation now adds a Cloudflare preview origin (`https://ao-x-root.music-garden.pages.dev`) instead of a
Netlify one — the template and its CORS list are untouched — and `README.md` § Deployment gains a line
saying Netlify served the site until TUN-85, so a reader of the older records knows where
`deploy-preview-<n>--tunegarden.netlify.app` went.

- Syntax check OK; the whole suite 766/766, and 791/791 after merging `origin/main` (01c6267, TUN-106).
- Mutations, each restored: `copyGaps` ignoring the `-r` flag → `cloudflare-publish.test.mjs` 1 red (the
  retargeted path-rule test); a `spike/` script counted as covered by `js/` → 2 red.
- The new `browser.md` command, run on PR #139: prints `d3dd7c1` (its head), the commit preview
  `cb6e2c72.music-garden.pages.dev` and the branch preview `ao-tun-86-headers-root.music-garden.pages.dev`.

### Where "netlify" still appears (`git grep -il netlify`), and why

| File | Why it stays |
|---|---|
| `REVIEW-LOG.md`, `reviews/2026-11-08-ao-gpt-workflow.md`, `reviews/TUN-6-…`, `TUN-7-…`, `TUN-9-…`, `TUN-76-…`, `TUN-80-…`, `TUN-81-…`, `TUN-86-…` | History: records are not edited (`CLAUDE.md` § The loop, by size). |
| `reviews/TUN-85-retire-netlify.md` | This record. |
| `DESIGN.md` | Line 204 is the dated feature log (2026-06-21), not edited. The *Live* line now names Cloudflare, and says Netlify served the site until TUN-85. |
| `README.md` | § Deployment's one line recording that Netlify served the site until TUN-85, and where its preview URLs went. |
| `SAVE-SHARE.md` | The CORS note's history (the Netlify fallback origin, removed by TUN-76), already annotated as removed. |
| `backend/README.md` | The CORS note: the retired `music-garden.netlify.app` cannot call the API (TUN-76's record). |
| `tests/README.md`, `tests/cloudflare-publish.test.mjs`, `tests/helpers/site-headers.mjs` | One clause each, saying Netlify's config and checker went with TUN-85, or why a rule was written as it was. |
| `tests/backend-template.test.mjs` | TUN-76's guard: re-adding the retired `music-garden.netlify.app` origin must fail. |
| `tests/load-gate-continuation-review.test.mjs` | A fixture body (`Netlify fallback`) standing for "a host served HTML for a missing script"; the text is not read. |
| `tools/goldens/playback.json` | Dated capture notes (TUN-6, TUN-7) — history. |
