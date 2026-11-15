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
  whichever server sends the page. **Not verified by me: an authenticated progress write and read on
  the custom domains** (GPT's PR review, finding 3) — it needs a signed-in account, and this session
  does not touch the owner's. It is the first item of the owner's playtest checklist.

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
| `tests/workflow-scripts.test.mjs` | The preview finder's comment: its `--jq` filters were checked on live PRs that carry Netlify's checks beside Cloudflare's (added in round 1). |
| `tests/load-gate-continuation-review.test.mjs` | A fixture body (`Netlify fallback`) standing for "a host served HTML for a missing script"; the text is not read. |
| `tools/goldens/playback.json` | Dated capture notes (TUN-6, TUN-7) — history. |

**This PR (#141), the new instructions followed once:** the *Cloudflare Pages* check passed on `b9f98d6`;
Cloudflare's comment named `b9f98d6`, commit preview `https://9867f21c.music-garden.pages.dev`, branch
preview `https://ao-cloudflare-migration-root.music-garden.pages.dev`. On the branch preview `/` is the
game, `js/boot.js` is `200 application/javascript`, and `/backend/template.yaml`, `/reviews/…`,
`/README.md`, `/netlify.toml` each answer with the page, so none is published. Netlify still built
`deploy-preview-141--tunegarden.netlify.app` with no `netlify.toml`: `/` answers, but `js/boot.js` and every
repository file are `404`, so the page cannot start and nothing of the repository leaks. The same will
happen to `tunegarden.netlify.app` after the merge until the owner disconnects the site; no player is
pointed at it (DNS moved, and TUN-76 removed it from the API's CORS list).

## PR review (GPT through `ask.sh`, Astra — AO's reviewer is out of service)

### Round 1 — on `b9f98d6`: changes requested

<details><summary>GPT's PR review, verbatim</summary>

**Changes required** on `b9f98d654538c77828a2d4cba8c58e27fa0b01da`.

1. **Medium — The hand-off still waits for Netlify.**  
   [.claude/skills/work-ticket/SKILL.md:184](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-32/.claude/skills/work-ticket/SKILL.md:184)  
   `gh pr checks <n> --watch` watches all checks; changing the surrounding prose does not restrict it to Cloudflare. A pending Netlify check can still block this migration’s hand-off and existing PRs after disconnection. Poll the named Cloudflare check on the current head, handling failure and absence explicitly. [GitHub CLI documentation](https://cli.github.com/manual/gh_pr_checks)

2. **Medium — Preview discovery has no reliable completion or failure path.**  
   [.claude/skills/work-ticket/browser.md:51](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-32/.claude/skills/work-ticket/browser.md:51)  
   `[-1]` selects the last matching comment, not the comment matching the current head and project. With several comments, it can select a stale one even when another contains the current deployment. The manual head comparison prevents accepting that stale result, but gives no recovery procedure. With no comment, the pipeline produces nothing and succeeds: I reproduced exit **0** for both empty input and `null` through the documented `grep … | uniq` stages. Upstream failures are likewise masked without `pipefail`.

   Select a head-matching project comment, preserve command failures, and define bounded retries followed by an explicit unavailable/Needs Input outcome. Also reconcile [handoff.md:58](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-32/.claude/skills/work-ticket/handoff.md:58) and [needs-input.md:10](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-32/.claude/skills/work-ticket/needs-input.md:10): they require or promise a preview without an exception for forks, which receive none. [Cloudflare documentation](https://developers.cloudflare.com/pages/configuration/preview-deployments/)

3. **Medium — The cloud-sync precondition remains unverified.**  
   [reviews/TUN-85-retire-netlify.md:16](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-32/reviews/TUN-85-retire-netlify.md:16)  
   The evidence establishes owner-tested sign-in and successful CORS preflights to the songs API. Neither demonstrates an authenticated progress write and subsequent read. A broken progress-sync path would pass those checks, contrary to the ticket’s explicit prerequisite. Append actual sync verification on the custom domains, or clearly record this prerequisite as outstanding.

4. **Low — Two current descriptions still assume both hosting providers.**  
   [tests/README.md:62](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-32/tests/README.md:62) and [_headers:24](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-32/_headers:24)  
   “The way both hosts do” and “Both hosts send this by default” remain current-tense descriptions. They contradict the migration’s single-provider documentation and preserve an obsolete maintenance assumption. Update these current descriptions; historical records should remain untouched.

**Missing tests to add:**

- **Check selection:** Cloudflare succeeds while Netlify remains pending or fails. The Cloudflare preview gate must complete; Cloudflare failure or absence must not count as success.
- **Comment selection:** Supply multiple bot comments with the current-head deployment before a stale comment, plus an unrelated project comment. Select only the current-head `music-garden` deployment.
- **Unavailable preview:** Supply stale-only comments, no comments, and a failed `gh` invocation. Require explicit waiting/error outcomes, never successful empty output. Include a fork case that reaches a documented hand-off without inventing a URL.
- **Destination coverage:** In the retargeted `copyGaps` fixture, independently change the destination of `boot.js`, `js`, `spike`, and `index.html`; expect exactly the affected path as missing. Removing `c.dst === path` in memory leaves all seven non-filesystem Cloudflare publish tests green. The deleted Netlify tests previously asserted destination-specific gaps.
- **Manual acceptance:** Verify a progress change survives a fresh authenticated load. Exercise the revised preview procedure on **PR #141**; the committed record currently documents its execution on #139.

The retargeted `copyGaps` test is meaningful. I found no lost acceptance check that now lets an invalid `cloudflare-build.sh` escape the remaining allowlist and execution guards. The Netlify inventory covers the `git grep -il netlify` results; no protected historical entry or CORS list was changed.

Syntax and diff-whitespace checks passed. The suite returned **716 passed, 75 failed**, all failures caused by sandbox-denied temporary-directory creation. GitHub CLI configuration access was denied, so I could not verify the live PR hand-off. Before completion, that hand-off must explicitly request Netlify disconnection and plan cancellation after merge, and warn that existing Netlify previews stop updating. No files were edited.

</details>

**My answers (Claude):**

1. **Agreed — fixed.** `browser.md`'s preview script polls only the *Cloudflare Pages* check's bucket
   on the head (`gh pr checks --json name,bucket`, at most 40 polls 30 s apart), stops on `pass` or
   `fail`, and exits 3 when there is none; SKILL.md § 8 step 6 runs it instead of `--watch`.
2. **Agreed — fixed.** It takes only the Cloudflare app's comment whose `<code>` names the head's short
   SHA, and from it the URL after *Branch Preview URL*; retries five times; and never exits 0 without a
   URL: a failed check exits 1, no comment for the head exits 1, a `gh` failure on the head exits 1, no
   check (a fork PR) exits 3. `browser.md` says what each exit means for the hand-off; `handoff.md`
   allows *Preview: none — <why>*; `needs-input.md` notes that a fork PR has none. One case GPT asked
   for is not tested — "an unrelated project comment": the `cloudflare-workers-and-pages` app posts one
   comment per Pages project, only `music-garden` builds this repository, and the URL pattern accepts
   only `*.music-garden.pages.dev`.
3. **Partly agreed — recorded, not verified.** I cannot sign in without the owner's accounts, and the
   ticket's own wording made the owner's check the evidence. The precondition section now says plainly
   that an authenticated progress write and read was not verified by me, and it heads the playtest list.
   It does not block the build: the API, Cognito and the page's code are unchanged, the CSP that reaches
   players (`_headers`, served by Cloudflare — verified above) still allows both, and CORS answers both
   names.
4. **Agreed — fixed.** `tests/README.md` ("the way Cloudflare Pages does") and `_headers` ("Cloudflare
   Pages sends this by default"). `tests/helpers/site-headers.mjs` keeps one clause saying the form was
   chosen while two hosts served the site — history, not a current claim.

**Missing tests:**
- *Check selection, comment selection, unavailable preview, fork* — **added**: six cases in
  `tests/workflow-scripts.test.mjs` run the `browser.md` block, taken from the doc, against a fake `gh`:
  a pending check waited out; a failed check (exit 1, no comment read); no check, and one still pending
  at the end (exit 3); a stale comment only, and no comment (exit 1 after five reads); a stale comment
  replaced by the head's on a retry (taken); the head's comment before or after a stale one (the head's
  branch preview, never the commit preview); `gh` failing on the head (exit 1). The fake answers what
  the `--jq` filters print, so the filters themselves — Netlify's checks ignored, the bot's comments
  picked — were checked on live PRs: on #141 and #139, both carrying Netlify's checks, the block printed
  `preview https://ao-cloudflare-migration-root.music-garden.pages.dev` and
  `preview https://ao-tun-86-headers-root.music-garden.pages.dev`, exit 0. Mutations of the doc's block,
  each restored: the head filter dropped → 2 red; the *Branch Preview URL* filter dropped (the commit
  preview taken) → 3 red; "no check" treated as success → 1 red.
- *Destination coverage* — **added** to the path-rule test: each of `boot.js`, `js`, `spike`,
  `index.html` copied to another destination reports exactly its own path. With `c.dst === path`
  removed, 1 red (green before, as GPT found).
- *Manual acceptance* — the procedure on #141: above. The authenticated sync: the owner's checklist.

After the fixes: syntax check OK, the whole suite 797/797.
