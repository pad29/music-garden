# TUN-80 — Serve the site from Cloudflare alongside Netlify, with a preview for every pull request

Branch `ao/tun-80-ticket/root` · PR pending · Size **M**, labelled `needs-owner`

## Plan (Claude) — first version, before GPT's review; superseded where the revised plan below differs

### Evidence from Cloudflare's docs (read 2026-11-13)

| | **A) Pages + Git integration** | **B) Workers static assets + Workers Builds** |
|---|---|---|
| Preview per PR | *"Every time you open a new pull request on your GitHub repository, Cloudflare Pages will create a unique preview URL, which will stay updated as you continue to push new commits to the branch."* Also a stable alias `<branch>.<project>.pages.dev`. | *"Preview builds run for branches that are not your production branch."* The Builds page names the preview command `npx wrangler preview`; the Version URLs page knows only `wrangler versions upload`. The two pages disagree. |
| Status check on the PR | GitHub check runs, documented. | GitHub check runs, documented, plus *"Cloudflare will automatically post a comment on the pull request with the status of the build."* |
| Fork PRs | *"preview URLs will not be created for pull requests created from forks of your repository."* | Not documented. Builds come from the connected repo's branches, so assume the same as Pages until proven otherwise. |
| A path that is not a file | *"If your project does not include a top-level `404.html` file, Pages assumes that you are deploying a single-page application"*, and serves the root. Implicit. The status code is not documented. | `"not_found_handling": "single-page-application"` serves `/index.html` *"with a `200 OK` status"* for any unmatched request. Explicit, in a committed file. |
| Where the publish config lives | Build command and output folder: **dashboard only**. A Wrangler file can set `pages_build_output_dir`, but not the build command. | A `wrangler.jsonc` is **required** (its `name` must match the dashboard, *"or the build will fail"*). The asset folder and SPA mode live in it. Its `build.command` runs on `wrangler deploy`. No doc says it runs for an assets-only Worker or for preview uploads. |
| Free-plan cost | Static requests are free and unlimited. 500 builds a month, 1 at a time, 20,000 files, 25 MiB per file. | *"Requests to static assets are free and unlimited."* 3,000 build minutes a month, 1 at a time. |
| Build-time tools | `sh` and `cp` in the build image. Nothing else is needed. | Deploys run `npx wrangler …`. With no `package.json` here, npx fetches Wrangler at build time. That is Cloudflare's own tool, not a build step of ours, but it is one more moving part. |

**Recommendation: A, Pages.** The ticket's test is "PR previews with a status check for the least
configuration". On Pages, per-PR previews and check runs are the core, documented feature. Nothing new
lands in the repo except the build script below, and nothing extra runs at build time. On Workers, the
preview path is mid-rename in Cloudflare's own docs, so it would be verified on our first PR rather than
read off the docs. B's real advantage is that the SPA fallback is explicit in a committed file. Under A
I pin that with a test instead (no `404.html` is ever published). The ticket says Cloudflare recommends
Workers for new projects. I could not find that sentence in the pages I read, so I don't rely on it.
If Pages is retired, Cloudflare has a *Migrate from Pages* guide, and it would be a later ticket.

### Approach (A)

1. **`cloudflare-build.sh`** at the repo root, beside `netlify.toml`. It holds Cloudflare's whole copy
   step as one `&&` chain, in the same form as Netlify's command, with a comment block saying why:

   ```sh
   set -eu
   mkdir -p site && cp index.html site/index.html && cp -r js site/js && cp -r voice site/voice && cp -r samples site/samples
   ```

   The dashboard's build command is `sh cloudflare-build.sh` and its output folder is `site`. The build
   command lives only in the dashboard, so the script is the only part the repo can pin. Copying only,
   with no `package.json` and nothing installed, keeps the "no build step" rule.
2. **`netlify.toml`**: drop `&& cp -r spike site/spike` (owner, 2026-11-13). Its comment says a new
   runtime folder goes into `cloudflare-build.sh` too. Nothing else changes.
3. **Tests.**
   - `tests/helpers/netlify-publish.mjs`: split out `commandGaps(command, scripts)` (what `publishGaps`
     already does per command) and add `shellCommand(text)`, which turns a script's live lines
     (comments, blank lines and `set …` dropped, CRLF tolerated) into one `&&` chain for
     `publishCopies`. `publishGaps` keeps its behaviour, so the Netlify tests stay as they are.
   - New `tests/cloudflare-publish.test.mjs`:
     1. `cloudflare-build.sh` publishes `index.html` and every script the page loads, at the page's
        paths (no gaps).
     2. It publishes **exactly** `index.html`, `js/`, `voice/`, `samples/`, each to the same path under
        `site/`. A copy of `spike/`, `tests/` or anything else fails.
     3. **Parity:** `netlify.toml`'s `[build]` copies the same set. A folder added to one config and
        not the other fails here, which is the invariant the docs state "while both exist".
     4. No file named `404.html` sits in `index.html`'s folder or under `js/`, `voice/`, `samples/`.
        One would switch Pages out of SPA mode for that subtree.
     5. Mutations, kept as tests, the way `netlify-publish.test.mjs` keeps them: `js/` dropped, `js/`
        copied to the wrong place, `js/` copied without `-r`, `index.html` dropped, the chain
        commented out, and a line after a `#` comment.
   - The existing Netlify tests pass unchanged after the `spike/` removal. Their anchors don't
     touch it.
4. **Docs** (same commit): `README.md` § Deployment (Cloudflare beside Netlify, the Pages project, the
   fork-PR limit, cloud sync failing off `tunegarden.game`), the *Live* line, and the repository map
   (a `cloudflare-build.sh` row; the `netlify.toml` and `site/` rows mention both). `AGENTS.md` § Hard
   invariants: a new runtime folder goes into **both** `netlify.toml` and `cloudflare-build.sh` while
   both exist. `.gitignore`'s `site/` comment names both builds.
5. **The real check, once the owner has connected the project** (`work-ticket` § 6):
   - **PR preview** (`<hash>.<project>.pages.dev` and `<branch>.<project>.pages.dev`): the game loads,
     a level plays, a narration clip plays, a sampled instrument loads, and a `#s=` share link opens.
     Every `js/` file is served as JavaScript and byte-identical to the commit. Cloud sign-in fails on
     CORS, as expected.
   - **Status of a miss**, measured with `curl -I`: `/no-such-page` and `/js/no-such-file.js`. I expect
     `index.html` (the same failure mode as Netlify), and I record the status code. `/spike/` and
     `/README.md` must not be served as files.
   - **Production** (`<project>.pages.dev`) gets its first deploy only when this PR merges, because
     `main` has no `cloudflare-build.sh` until then. The same checks run there after the merge (the
     owner's playtest list, or this session if it is still alive).

### Risks

- **Pages builds every pushed branch**, not only PR branches. AO sessions push many branches. 500
  builds a month is far above today's rate, but it is a cap. If it bites, *Preview branches: Custom*
  can limit previews to branches with PRs (a later change).
- **Previews are public by default**, like Netlify's today. Pages can restrict them to the Cloudflare
  account. That would also lock out anyone checking a PR without an account, so I leave them public
  (owner's call below).
- **The first production build fails** when the owner connects the project, because `main` lacks the
  script. Nothing is published, which fits "nothing unfinished may be published". After the merge,
  production builds normally.
- **Implicit SPA mode:** a future top-level `404.html` would quietly change what a miss returns. Test 4
  guards against it.
- **Fork PRs get no Cloudflare preview.** Netlify's deploy previews keep running until TUN-85 retires
  Netlify, and TUN-85 or TUN-103 must decide how outside contributors' PRs get checked. Recorded for
  them, not solved here.

### Questions only the owner can answer

1. **Which product?** **A) Pages** (recommended, above) or **B) Workers static assets with Workers
   Builds**. Under B the plan changes: a committed `wrangler.jsonc` (`name`, `compatibility_date`,
   `assets.directory: "./site"`, `not_found_handling: "single-page-application"`, and either
   `build.command` or a dashboard build command), and the tests pin that file instead of a script.
2. **Project name:** `tunegarden`, giving `tunegarden.pages.dev`, unless it is taken or you prefer
   another.
3. **Preview access:** public (recommended, as on Netlify today), or restricted to your Cloudflare
   account.

### The owner's steps (for A, Pages)

1. Sign up at https://dash.cloudflare.com/sign-up on the **Free** plan and verify the email. Turn on
   two-factor sign-in (*My Profile → Authentication*).
2. In the dashboard: **Workers & Pages → Create application → Pages → Import an existing Git
   repository**.
3. Choose **GitHub** and install the **Cloudflare Workers and Pages** GitHub app for `pad29`. Pick
   **Only select repositories → `music-garden`**.
4. Select `pad29/music-garden`, then set:
   - **Project name:** `tunegarden` (or your choice from question 2).
   - **Production branch:** `main`.
   - **Framework preset:** None.
   - **Build command:** `sh cloudflare-build.sh`
   - **Build output directory:** `site`
   - **Root directory:** leave empty. No environment variables. No API token.
5. **Save and Deploy.** The first build **fails** (`main` doesn't have `cloudflare-build.sh` yet). That
   is expected and publishes nothing.
6. Leave **Settings → Builds → Branch control** at its default: production `main`, previews for all
   non-production branches.
7. Don't touch DNS: `tunegarden.game` stays at Spaceship and on Netlify (TUN-85 moves it).
8. Reply with the project's `*.pages.dev` address. I then push this branch so Cloudflare builds its
   first preview, run the checks above, and finish the PR.

## Design review (Astra)

`ask.sh fresh read-only gpt-6-astra`, 2026-11-13, on the plan above. Verdict: **sound with the changes
above**; GPT would also pick Pages.

<details><summary>GPT's design review, verbatim</summary>

I would not approve the plan unchanged. The main problems are false confidence in the publish tests, incomplete acceptance gates, and incorrect evidence in the product comparison.

I reviewed the requested files and current Cloudflare documentation. The six existing Netlify publish tests pass. I also reproduced additional checker false greens using in-memory inputs. No files were edited; no Cloudflare deployment was tested.

References below to “plan lines” mean [reviews/TUN-80-cloudflare-alongside-netlify.md](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-22/reviews/TUN-80-cloudflare-alongside-netlify.md).

1. **High — The proposed “exactly” test cannot establish what it claims.**  
   Plan lines 44–59 reuse `publishCopies`, but [tests/helpers/netlify-publish.mjs:30](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-22/tests/helpers/netlify-publish.mjs:30) silently discards commands outside its narrow regex.

   I verified that appending either `cp -R spike site/spike` or `cp -r backend site` leaves its recognized copy list **identical** to the approved list. Both would publish forbidden content. Prefixing `exit 0 &&` also preserves that list and produces no reported script gaps, although none of the copies executes.

   The existing checker deliberately promises only narrow coverage. Reusing it for an exclusion guarantee expands its contract without strengthening its implementation.

   **Required change:** either reject every unsupported live command under a deliberately restricted grammar, or execute the real script in an isolated fixture and inspect the resulting manifest. Prefer both a small static guard and one execution test. Never interpret “unrecognized” as “harmless.”

2. **High — Production acceptance is deferred without a completion gate.**  
   Plan lines 75–77 assign the production checks to the owner “or this session if it is still alive.” That is not a reliable completion plan. The ticket expressly requires production and PR-preview browser verification; `AGENTS.md` also puts outstanding required checks before merge.

   The initial failed build itself is reasonable: a missing shell script exits unsuccessfully, and Pages treats a nonzero build exit as failure. It does not demonstrate a working production deployment. [Pages build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/)

   **Required change:** explicitly obtain the owner’s acceptance of this sequencing exception at the checkpoint, assign the post-merge checks, and keep TUN-80 open until they pass. Alternatively, stage an owner-approved bootstrap deployment before final acceptance. Do not let merging automatically mean “done,” and do not push or merge `main` to resolve this without authorization.

3. **Medium — The Workers comparison contains material misreadings.**  
   Plan lines 11, 15 and 19–26 give the owner inaccurate reasons to prefer Pages:

   - Cloudflare’s [Pages overview](https://developers.cloudflare.com/pages/) explicitly says: “Start new projects with Workers.”
   - Workers Previews and Version URLs are distinct mechanisms, not evidence of a contradictory rename. The [Builds documentation](https://developers.cloudflare.com/workers/ci-cd/builds/) explicitly distinguishes them.
   - [Workers GitHub integration](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/) documents both PR preview comments and check runs.
   - The [custom-build documentation](https://developers.cloudflare.com/workers/wrangler/custom-builds/) lists `versions upload` among commands that can trigger a custom build. “No doc says” is therefore too broad.
   - More significantly, [Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/) warns that Builds does not honor Wrangler Custom Builds configuration. The fallback proposal at lines 98–101 should not offer `build.command` and the dashboard build command as interchangeable choices.

   **Required change:** rewrite the comparison. A defensible Workers option uses an explicit Builds copy command, a committed assets configuration, and the documented preview command. Pages can still win on this ticket’s configuration cost; it should not win through these inaccuracies.

4. **Medium — Parity checks recipes, misses deployment settings, and ignores context-specific asset omissions.**  
   Plan test 3 checks only Netlify’s `[build]` copy set. An override under `[context.production]` or `[context.deploy-preview]` that copies `index.html` and `js/` but omits `voice/` and `samples/` passes the existing script checker and the proposed base-command parity check. This repeats the context-selection lesson from TUN-6 at the asset level.

   I also verified that changing Netlify’s `publish` to `"."` produces no reported gaps. The helper assumes `site/`; it never validates the configured publish directory.

   **Required change:** check effective publish directories and required asset mappings for every applicable Netlify context. On Cloudflare, record and inspect the actual dashboard command, root and output directory. A correct script does not prove the dashboard invokes it.

   Keep an independent allowlist: parity alone permits both configurations to become identically wrong. Define “exactly” as the permitted root file and directory trees—the ticket explicitly includes all of `samples/`, including its source recordings.

5. **Medium — Test 4 checks the wrong filesystem boundary and overstates what it proves.**  
   Plan lines 55–56 scan the repository root for `404.html`, although the proposed command does **not** copy that file. An unpublished root `404.html` would cause a false failure.

   Conversely, checking only the current source locations is weaker than checking the actual publish tree. Future copy destinations or additional runtime directories could escape that scan.

   Keep the recursive prohibition **inside the published output**. It is useful: Pages documents nearest-ancestor custom 404 handling, and Cloudflare’s [shared Pages asset handler](https://github.com/cloudflare/workers-sdk/blob/main/packages/pages-shared/asset-server/handler.ts) searches ancestors before falling back to the root index. A nested custom 404 can therefore matter; reducing this to a root-only guard would be a mistake. [Serving Pages](https://developers.cloudflare.com/pages/configuration/serving-pages/)

   But absence of `404.html` is a precondition, not a test of deployed routing. The handler supports expecting a normal 200 response for the index fallback; record the actual hosted result rather than presenting it as measured.

6. **Medium — HEAD requests cannot prove fallback bodies or exclusion, and the player-visible case is missing.**  
   Plan lines 72–74 use `curl -I` to establish that misses return `index.html`. HEAD has no response body. A 200 HTML response could be the expected index, an error page, or something else.

   **Required change:** use GET requests, record status, content type and redirect behavior, and compare the response body with the deployed root page. Probe actual forbidden files such as `/backend/template.yaml`, `/tests/netlify-publish.test.mjs`, and an existing file under `/spike/`; checking `/spike/` alone does not prove its contents are absent.

   Also characterize both `/no-such-page` and `/no-such-page/` in a browser. TUN-6 already established why the trailing slash matters: relative script URLs resolve beneath the missing directory. TUN-68 owns the fix, but this ticket requires recording what the player sees.

7. **Medium — Several required verification steps are missing or insufficiently explicit.**  
   Plan lines 67–77 never explicitly verify a **Cloudflare check run on the PR’s current head commit**. A working branch URL is insufficient. Require evidence of the check, its linked deployment, and another push updating the preview without changing production.

   The audio checks also need evidence against fallbacks. `js/play-scope.js` substitutes browser speech when an MP3 fails; `js/audio.js` substitutes synthesized sound when a sample pack fails. Hearing narration and notes is insufficient. Verify a real narration MP3 plays and the selected sample bank finishes decoding.

   Finally, name the required syntax check, full Node suite, and `file://` smoke test—or explicitly record any unavailable check as pending. The plan changes asset publication and the checker’s logic; the repository’s verification rules still apply.

8. **Medium — “Custom branches” cannot automatically select branches with PRs.**  
   Plan lines 81–83 propose a nonexistent mitigation. Pages custom branch controls match branch names and wildcard patterns; they are not a predicate for “has an open pull request.” Narrowing them can exclude an otherwise eligible repository PR. Skipped builds can also leave no check run. [Branch deployment controls](https://developers.cloudflare.com/pages/configuration/branch-build-controls/), [GitHub integration](https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/)

   **Required change:** retain all non-production branches for this ticket and describe the build-budget tradeoff accurately. Any later filtering needs an explicit policy that preserves the promised PR coverage.

9. **Low — The copy script is not repeatable against an existing `site/`.**  
   Plan line 35 uses `mkdir -p` without cleaning or rejecting an existing output directory. On a second invocation, `cp -r js site/js` can create `site/js/js`; stale output such as `site/spike/` survives.

   A fresh hosted checkout may avoid this, but the proposed script itself does not guarantee a clean publish tree.

   **Required change:** make Cloudflare’s script clean or reject its dedicated output directory, or explicitly constrain it to a fresh-output precondition and test that condition. Keep cleanup strictly scoped. Do not silently expand the authorized Netlify change to solve this inherited issue.

10. **Low — The owner instructions need small corrections and a more accurate hand-off.**  
    Plan lines 111–128 should include these details:

    - The documented Pages route currently ends in **Connect to Git**; include that label alongside any observed dashboard wording. [Pages setup](https://developers.cloudflare.com/pages/get-started/git-integration/)
    - The GitHub app name and repository-only installation scope are correct. However, installing the app and authorizing the owner’s GitHub user are separate steps; explicitly include both. [GitHub integration](https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/)
    - After the expected failed first build, request the project identity/dashboard result, not a supposedly working production URL.
    - Use the preview alias supplied by Cloudflare. Branch names containing `/` are normalized; the literal branch name is not a hostname. [Preview aliases](https://developers.cloudflare.com/pages/configuration/preview-deployments/#preview-aliases)
    - Replace “Cloud sign-in fails on CORS” at line 70 with “backend sync and cloud-song operations fail.” In `js/cloud.js`, Cognito authentication and the API Gateway calls are separate. Authentication may succeed while synchronization fails. Preserve the distinction between local `#s=` links and backend-dependent cloud-song links.

The shell-only copy approach fits the repository’s no-build-step rule. Cloudflare documents an Ubuntu build environment, so `sh` and `cp` are a reasonable choice; no package manifest is necessary. The stated Pages limits also check out. [Build image](https://developers.cloudflare.com/pages/configuration/build-image/), [Pages limits](https://developers.cloudflare.com/pages/platform/limits/)

A shared copy script called by both hosts would reduce duplication, but it changes Netlify beyond removing `spike/` and changes the requested “both build configs” maintenance contract. I would not introduce that refactor implicitly. Two small copy configurations with meaningful guards are acceptable here.

**Additional concrete tests I would require:**

- Append `cp -R spike site/spike` and `cp -r backend site`; both must fail the exclusion guard.
- Prefix `exit 0`, or append a command deleting a required output file; neither may pass as a valid publication.
- Put a commented-out copy after `# &&` and a live copy on the following line; distinguish them correctly. Retain TUN-6’s unrelated-context-before-`[build]` regression.
- Drop, misplace, or remove recursion from `voice/` and `samples/` independently.
- Add production and deploy-preview overrides that retain scripts but omit runtime assets; both must fail.
- Change the effective Netlify publish directory to `"."` or another directory; require failure.
- Run the real Cloudflare copy script in an isolated fixture; compare recursive paths and file bytes with the allowed source trees.
- Run with a preexisting output containing stale `spike/` and old asset files; require clean output or explicit refusal.
- Place `404.html` in the published root and deep inside each published tree; require failure. An unpublished repository-root or documentation-tree `404.html` should not fail the publication guard.
- Add a new runtime folder to only one configuration; require failure. Adding it to both should still require an intentional allowlist update.
- On the hosted deployment, GET missing document, missing script and forbidden-file URLs and compare bodies; separately record the trailing-slash browser failure.
- Open a repository PR and push a second commit; verify the current-head check run, updated branch preview, matching deployment commit, and unchanged production.
- On both required origins, verify actual MP3 playback and a decoded sample bank, then run the local `file://` smoke test.

**Overall verdict: sound with the changes above.** I would pick **Pages** for this narrowly scoped ticket: its Git integration meets the preview/check requirement with fewer repository and deployment settings. That choice should explicitly acknowledge Cloudflare’s Workers recommendation and the corrected Workers capabilities. The current evidence does not justify treating Workers as an undocumented or contradictory preview path.

</details>

## My answers

I re-read the two Cloudflare pages GPT cites against me (finding 3). It is right on both: the Pages
overview's banner says *"Start new projects with Workers."*, and Workers Builds' configuration page says
*"Currently, Workers Builds does not honor the configurations set in Custom Builds within your Wrangler
configuration file."* GPT's other claims about the docs were not re-fetched. They are consistent with
what I read, and the build will test them.

1. **High — the "exactly" test reuses a checker that ignores what it can't parse.** **Agreed.** The
   Cloudflare script gets a strict grammar: every live line must be `set -eu` or a chain made **only**
   of `rm -rf site`, `mkdir site` and `cp [-r] <src> site/<dst>` steps. Any other word fails the test
   (`cp -R`, `exit 0`, `rm site/js/x.js`, `cp -r backend site`). Plus one **execution test**: run the
   real script under Git Bash (found the way `tests/workflow-scripts.test.mjs` finds it) in a temp
   fixture repo, and compare the resulting file tree with the allowed source trees, path by path and
   byte by byte.
2. **High — production checks deferred with no completion gate.** **Agreed.** This is the owner's call,
   so it is Q4 below. My pick: the PR says `Refs TUN-80`, not `Closes`, so the merge does not
   close the ticket. The ticket stays In Review until the production checks pass after the merge.
3. **Medium — the Workers comparison misread the docs.** **Agreed**, all five points. The comparison
   below is rewritten. Pages still wins on this ticket's own test, the least configuration for PR
   previews with a check. But Cloudflare's advice to start new projects on Workers is now stated
   plainly to the owner.
4. **Medium — parity checks only `[build]` and never the publish directory.** **Agreed.** Parity runs
   against every Netlify build command, `[build]` and each `[context.*]`, comparing the whole folder set,
   not only the scripts. `publish` must be `"site"`. The allowlist stays independent of parity. The
   Cloudflare dashboard settings can't be tested: the owner reports them, I record them here, and the
   preview deploying from `site/` is the proof.
5. **Medium — test 4 looked at the wrong place.** **Agreed.** The `404.html` ban applies to the
   published tree (the execution test's output), recursively, not to the repository root.
6. **Medium — `curl -I` proves nothing about bodies.** **Agreed.** I'll use GET and compare the body with
   the deployed `/`. Probes: `/no-such-page`, `/js/no-such-file.js`, `/backend/template.yaml`,
   `/tests/netlify-publish.test.mjs`, `/spike/pinch-probe.html`, `/README.md`. In the browser:
   `/no-such-page/` (trailing slash), and what a player sees there.
7. **Medium — verification steps missing.** **Agreed.** Added: the Cloudflare check run on the PR's
   current head; a second push that updates the preview and leaves production alone; a narration MP3
   served `200 audio/mpeg` and actually playing, not the speech fallback; a sample bank decoded, not the
   synth fallback; syntax check and the whole suite; `file://` on the owner's checklist (AO's browser
   can't open it).
8. **Medium — "Custom branches" can't select branches that have PRs.** **Agreed.** I dropped that
   mitigation. All non-production branches keep building; at today's push rate the 500-a-month cap is
   far off.
9. **Low — the script isn't repeatable.** **Agreed.** The script starts with `rm -rf site && mkdir site`,
   scoped to its own output folder. The execution test runs it twice, over a stale `site/spike/`.
   Netlify's command is left alone, as the ticket says.
10. **Low — corrections to the owner's steps.** **Agreed**, all of them: the *Connect to Git* label,
    installing and authorizing the GitHub app as two separate steps, asking for the project name rather
    than a working URL, using the preview alias Cloudflare prints, and "sync and cloud songs fail"
    rather than "sign-in fails".

GPT's extra tests are all in the revised plan. Two are covered differently: "append a command deleting
a required file" and "prefix `exit 0`" both fail the strict grammar, and the execution test backs that
up.

## Plan, revised after the design review (Claude)

### The product: what the docs say

| | **A) Pages + Git integration** | **B) Workers static assets + Workers Builds** |
|---|---|---|
| Cloudflare's own advice | The Pages overview's banner: *"Start new projects with Workers."* | Cloudflare's *"primary platform"*. |
| Preview per PR, and a check | A preview URL per PR, updated on each push. GitHub check runs. | A Preview per non-production branch (`npx wrangler preview`), a PR comment with its URL, and GitHub check runs. |
| Fork PRs | No previews (documented). | Not documented. |
| A path that is not a file | Implicit: with no `404.html` in the output, Pages serves the root. A nested `404.html` takes over its subtree. | Explicit: `not_found_handling: "single-page-application"` in a committed file, `/index.html` with `200`. |
| What the repo holds | `cloudflare-build.sh`. The build command and output folder are typed in the dashboard. | `cloudflare-build.sh` **and** `wrangler.jsonc` (`name`, `compatibility_date`, `assets`). The copy command is still typed in the dashboard, because Builds ignores Wrangler's `build.command`. |
| What runs at build time | `sh` and `cp`. | `sh` and `cp`, then `npx wrangler deploy` or `preview`, which fetches Wrangler with no `package.json`. |
| Cost | Static requests free and unlimited. 500 builds a month. | Static requests free and unlimited. 3,000 build minutes a month. |

**Recommendation: A, Pages** (GPT agrees). It meets this ticket's test with less: one script, no
committed Cloudflare config, nothing fetched at build time. **B is the defensible other answer:**
Cloudflare tells new projects to use Workers, B's SPA rule sits in a committed, tested file, and taking
A probably means a Pages-to-Workers move one day (a ticket of its own, with Cloudflare's migration
guide).

### What gets built (A)

1. **`cloudflare-build.sh`** (repo root): a comment block, then
   `set -eu` and
   `rm -rf site && mkdir site && cp index.html site/index.html && cp -r js site/js && cp -r voice site/voice && cp -r samples site/samples`.
2. **`netlify.toml`**: drop `cp -r spike site/spike`. Its comment names `cloudflare-build.sh` as the
   other place a new runtime folder goes.
3. **`tests/helpers/netlify-publish.mjs`**: per-command gap logic split out (`commandGaps`); the publish
   directory read from `netlify.toml`; a strict parser for the Cloudflare script that returns its copy
   steps **or** the first word it refuses.
4. **`tests/cloudflare-publish.test.mjs`**:
   - the script publishes `index.html` and every script the page loads, at the page's paths;
   - its copy set is exactly the allowlist `index.html`, `js/`, `voice/`, `samples/` (whole trees);
   - every Netlify build command (`[build]` and each `[context.*]`) copies the same set, and `publish`
     is `site`;
   - **execution:** the real script, run under Git Bash in a temp fixture repo that also holds
     `spike/`, `backend/`, `tests/`, docs and a root `404.html`, produces exactly the allowed trees,
     byte for byte, and no `404.html` anywhere; a second run over a stale `site/spike/` gives the same
     tree (skipped with a note when no bash is found, as in `workflow-scripts.test.mjs`);
   - **mutations**, each one a failing test: `js/`, `voice/` or `samples/` dropped, misplaced, or
     copied without `-r`; `index.html` dropped; `cp -R spike site/spike` or `cp -r backend site`
     appended; `exit 0 &&` prefixed; a command that deletes an output file; a copy commented out after
     `# &&` with a live copy on the next line; a Netlify `[context.production]` or
     `[context.deploy-preview]` override that keeps the scripts but drops `voice/`/`samples/`; `publish`
     set to `"."`; a new folder added to only one config; a `404.html` inside a published tree.
   - The existing Netlify tests stay as they are, TUN-6's regressions included.
5. **Docs**: as in the first plan (README § Deployment, the *Live* line and the repository map; AGENTS
   § Hard invariants; the `.gitignore` comment), plus the fork-PR limit, the build cap, and "sync and
   cloud songs fail on Cloudflare URLs until the domain moves".
6. **Verification once the owner has connected the project:**
   - **PR preview:** the Cloudflare check run on the current head; the preview's deployment matches the
     head commit; a second push updates the preview and production stays unchanged.
   - In the browser: the game loads, a level plays, a narration MP3 is served `200 audio/mpeg` and
     plays, a sample bank decodes, and a `#s=` link opens. Sync and cloud songs fail on CORS, as
     expected.
   - GET probes (status, content type, body against `/`): the six paths in answer 6. The trailing-slash
     page is checked in the browser, and what a player sees there is recorded.
   - **Production** (`<project>.pages.dev`): the same checks after the merge (question 4).
   - Locally: syntax check and the whole suite. `file://` goes on the owner's list.

### The owner's steps (A, Pages)

1. Sign up at https://dash.cloudflare.com/sign-up on the **Free** plan, verify the email, and turn on
   two-factor sign-in (*My Profile → Authentication*).
2. **Workers & Pages → Create application → Pages → Connect to Git** (the button may read *Import an
   existing Git repository*).
3. Choose **GitHub**. **Install** the *Cloudflare Workers and Pages* app on `pad29` with **Only select
   repositories → `music-garden`**, then **authorize** it for your GitHub user. These are two separate
   prompts.
4. Pick `pad29/music-garden` and set: **Project name** `tunegarden` (or your answer to Q2) ·
   **Production branch** `main` · **Framework preset** None · **Build command** `sh cloudflare-build.sh`
   · **Build output directory** `site` · **Root directory** empty · no environment variables, no API
   token.
5. **Save and Deploy.** This first build **fails**, because `main` has no `cloudflare-build.sh` yet.
   That is expected, and nothing is published.
6. Leave **Settings → Builds → Branch control** at its default (production `main`, previews for all
   non-production branches). Leave preview access public unless you answer otherwise on Q3.
7. Don't touch DNS: `tunegarden.game` stays at Spaceship and on Netlify until TUN-85.
8. Reply with the **project name** and what the dashboard shows for it (the failed first build is
   fine). I then push this branch, which starts the first preview, and carry on.

## Owner's decisions

1. *Design checkpoint (`needs-owner`)*: **build the revised plan**. The owner, in AO session
   `music-garden-22`, 2026-11-13 (CST).
2. *Q1 — Which product: A) Pages or B) Workers static assets + Workers Builds?* **A, Pages.** Same place
   and date.
3. *Q2 — The project name: `tunegarden` (→ `tunegarden.pages.dev`)?* **A, `tunegarden`.** Same.
4. *Q3 — Preview access: public or restricted to the Cloudflare account?* **A, public.** Same.
5. *Q4 — Production can only be checked after the merge.* **A:** the PR says `Refs TUN-80`, and the ticket
   stays open in In Review until the production checks pass after the merge. Same.
6. *Project created* — by the owner, 2026-11-14. Cloudflare's dashboard now reaches Pages through a
   "legacy Pages" switch, and that flow named the project **`music-garden`** with no choice offered
   (not `tunegarden`, Q2). It matches the repository, the AWS stack and the old Netlify site, so the
   docs say `music-garden.pages.dev`. Cloudflare Access was left off (Q3).

## Verification on Cloudflare (Claude, 2026-11-14)

On the commit preview `https://70f00f24.music-garden.pages.dev` (head `ed3c759`), built by the owner's Pages
project `music-garden`:

- **The PR check** is named **Cloudflare Pages** (app `cloudflare-workers-and-pages`): `success` on
  `ed3c759`. Cloudflare also posts a PR comment with the commit preview and the branch alias
  `ao-tun-80-ticket-root.music-garden.pages.dev` (the branch name's `/` became `-`).
- **GET probes**, bodies compared with the commit: `/` is byte-identical to `index.html`; all 29 `js/`
  files are `200 application/javascript` and byte-identical; `voice/108fedab.mp3` is `200 audio/mpeg` and
  `samples/glockenspiel.js` is `200 application/javascript`, both byte-identical.
- **A path that is not a file** — `/no-such-page`, `/no-such-page/`, `/js/no-such-file.js`,
  `/samples/piano/` — answers `200 text/html` with exactly the body of `/`. The same as Netlify: a
  missing `js/` file is served as the page, and the game would not start. (No redirect anywhere.)
- **Not published** — `/backend/template.yaml`, `/tests/netlify-publish.test.mjs`,
  `/spike/pinch-probe.html`, `/spike/`, `/README.md`, `/cloudflare-build.sh`, `/.claude/gpt/ask.sh`,
  `/netlify.toml` — each answers with the body of `/`, so none is served as a file.
- **In the browser** (AO's Chromium): the game loads; level 1 *Wake the Seeds* plays through (four seeds,
  ▶ Play, both goals ticked, *Next level*); with network capture on, a narration clip
  (`voice/b547890d.mp3`, `200 audio/mpeg`, media) and the Piano pack (`samples/piano.js`, `200`) load
  from Cloudflare; a `#s=` link opened fresh on the branch alias shows *"A melody from a friend"* in
  the Studio with the encoded notes. No page errors from the game; the only console error is
  Cloudflare's own Turnstile script, which the game does not load.
- **The backend refuses the origin:** a CORS preflight to the songs API from the preview origin gets
  no `Access-Control-Allow-Origin`; from `https://tunegarden.game` it gets one. Cloud sync and cloud
  songs fail on Cloudflare URLs, as the ticket expects.
- **Production** (`main` at `ba365ee`): the *Cloudflare Pages* check **failed** (*"Build failed."*),
  as expected, because `main` has no `cloudflare-build.sh` yet. **But `https://music-garden.pages.dev/`
  answers `200` with an unrelated "Welcome to Astro" starter page** (`lang="ja"`, no `js/boot.js`).
  Open question for the owner (dashboard): whose page that is.
- **Not verified:** the sound itself (by ear), that the Piano pack decodes rather than falling back to
  the synth (AO's browser can't run page code), the phone, `file://`, and production after the merge.

**The owner's answer on production** (AO session `music-garden-22`, 2026-11-14): **A**. The dashboard shows
the project's domain as `music-garden.pages.dev` and no production deployment. The Astro page is what the
hostname shows until the first production build. Checking production after the merge must confirm the game
replaces it.

## PR review (GPT through `ask.sh`, Astra — AO's reviewer is out of service)

### Round 1 — on `bc7fd42`: changes requested

<details><summary>GPT's PR review, verbatim</summary>

**Changes requested** for head `bc7fd428854d88830952231a9f2df10dbbbdb07e`. No files edited.

1. **Medium — Netlify parity still silently ignores commands that change publication.**  
   [tests/helpers/cloudflare-publish.mjs:56](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-22/tests/helpers/cloudflare-publish.mjs:56)

   The new parity guarantee reuses permissive `publishCopies`. I reproduced `cloudflareProblems(...) === []` after independently:
   - Appending `cp -R spike site/spike`.
   - Appending `cp -r backend site`.
   - Appending `rm site/js/boot.js`.
   - Prefixing the command with `exit 0 &&`.

   A production-context override containing the backend copy also passes. These configurations publish forbidden content, remove required code, or skip publication entirely. This contradicts README’s claim that the test fails when either host publishes outside its list.

   **Required:** validate every Netlify command used by the new parity check without silently discarding unsupported steps. Preserve the existing Netlify helper’s compatibility contract through a separate strict path if necessary.

   **Tests to add:** each mutation above in `[build]`, `[context.production]`, and `[context.deploy-preview]`; each must fail the new guard.

2. **Medium — Valid quoted TOML keys bypass publish-directory validation.**  
   [tests/helpers/netlify-publish.mjs:80](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-22/tests/helpers/netlify-publish.mjs:80)

   Appending this valid override returns no problems:

   ```toml
   [context.production]
   "publish" = "."
   ```

   Netlify would publish the repository root, while the checker assumes inherited `site`. The regex only recognizes the bare key. Quoted `command` keys similarly escape the command enumeration used by parity.

   **Required:** recognize equivalent quoted keys, or explicitly reject unsupported configuration syntax rather than treating it as absent.

   **Tests to add:** quoted `publish` overrides selecting `"."` and `"dist"`; quoted `command` overrides omitting runtime assets; positive controls using quoted keys with the correct configuration.

3. **Medium — Flattening separate command chains hides successful partial builds.**  
   [tests/helpers/cloudflare-publish.mjs:26](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-22/tests/helpers/cloudflare-publish.mjs:26), [tests/cloudflare-publish.test.mjs:208](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-22/tests/cloudflare-publish.test.mjs:208)

   The comment that a newline is equivalent to `&&` under `set -e` is incorrect. Replace the separator before the final samples copy with a newline:

   ```sh
   rm -rf site && mkdir site && cp index.html site/index.html && cp -r js site/js && cp -r voice site/voice
   cp -r samples site/samples
   ```

   The parser accepts it. With shell functions simulating a failed `js/` copy, I measured **exit 0**, with samples copied afterward and voice skipped. The original single-chain script returns **exit 1**.

   The execution test’s missing-`voice/` case does not catch this layout: voice is the final command of the first chain.

   **Required:** restrict accepted layouts to ones that preserve failure propagation, or validate their control flow correctly.

   **Tests to add:** this split-chain case with missing `js/` and missing `index.html`. Require parser rejection or a nonzero execution result. Retain successful supported multiline/comment cases.

4. **Medium — Complete the promised preview verification evidence.**  
   [reviews/TUN-80-cloudflare-alongside-netlify.md:398](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-22/reviews/TUN-80-cloudflare-alongside-netlify.md:398)

   The record proves a check/deployment for `ed3c759`, but does not record the promised second-push preview update with unchanged production. It records GET responses for trailing-slash misses, but no browser observation of their player-visible behavior.

   **Required manual checks:** attach current-head Cloudflare check/deployment evidence to the PR; establish that a subsequent push updates the branch preview without changing production; open both `/no-such-page` and `/no-such-page/` in a browser and record the outcome. Later commits only change the review record, so this does not require repeating every unchanged gameplay check.

   Actual narration playback, decoded Piano samples, and `file://` remain explicitly pending owner checks before merge. The owner-approved **production check after merge is acceptable**; keep `Refs TUN-80` and the ticket open.

The published-tree `404.html` boundary is appropriate, including nested files; this agrees with [Cloudflare’s routing documentation](https://developers.cloudflare.com/pages/configuration/serving-pages/). Netlify’s actual command changes only by removing `spike/`. I found no additional AGENTS.md invariant violation. Against the original ten findings, **1 and 4 remain incompletely guarded; 6 and 7 remain incompletely verified; 2, 3, 5, 8, 9 and 10 are addressed**.

Validation performed:

- `node tools/check-syntax.mjs`: **passed, 29 scripts**.
- `node --test "tests/netlify-publish*.test.mjs"`: **6/6 passed**.
- `node --test "tests/*.test.mjs"`: **not green in this environment**; temporary-fixture tests encounter sandbox `EPERM` on `mkdtemp`, including both new filesystem/execution tests.
- In-memory mutation probes and shell failure simulation reproduced findings 1–3.
- Live PR inspection through `gh` was blocked by denied access to its configuration; I could not independently establish current-head check status.

</details>

1. **Medium — parity still read Netlify's commands leniently.** **Agreed.** Every Netlify command now goes
   through the same strict chain parser as the script (`parseChain`, head `mkdir -p site`). A step it
   can't read is refused. The lenient `publishCopies` and the existing Netlify tests are unchanged.
   Tests added: each of GPT's four mutations in `[build]`, `[context.production]` and
   `[context.deploy-preview]`, plus a control.
2. **Medium — quoted keys bypassed the publish check.** **Agreed.** The Netlify readers accept `"command"`,
   `'command'`, `"publish"` and `'publish'`. Any `command`/`publish` line at top level or in a
   `[build]`/`[context…]` table that they still can't read (a dotted key) is refused instead of treated
   as absent. A `[dev]` command is not counted. Tests added: quoted `"."` and `"dist"`, a quoted command
   that drops assets, quoted controls, dotted keys, and a `[dev]` control.
3. **Medium — split chains hide failures.** **Agreed**, and my comment was wrong. Reproduced: with `js/`
   missing, a script with the chain split over two lines exits **0** and publishes `index.html` and
   `samples/` alone; the single chain exits **1**. The parser now requires exactly one chain line (a
   second command line is refused). The execution test runs the real script with each of `index.html`,
   `js/`, `voice/`, `samples/` missing and requires a non-zero exit. Header comments and
   `tests/README.md` corrected.
4. **Medium — verification evidence incomplete.** **Agreed.** Recorded below. The current head's check
   goes in the PR body after the push.

Mutation audit of the new guards (each restored afterwards): allowing a second line, dropping the strict
Netlify refusal, and ignoring unreadable keys each turn `tests/cloudflare-publish.test.mjs` red.

**Second push** (`531c1ef`, after `ed3c759`): the *Cloudflare Pages* check passed with a new commit
preview (`99b8487c.music-garden.pages.dev`; the first was `70f00f24`). The branch alias answered the
same game and still did not serve `reviews/…` as a file. Production `music-garden.pages.dev` was
unchanged (the Astro placeholder, no production deployment).

**Missing paths in the browser** (preview `99b8487c`):
- `/no-such-page`: the whole game loads and works (relative `js/` URLs still resolve at the root).
- `/no-such-page/`: the page shell shows (header, ▶ Play, an empty *Level* card, Toolbox, Garden), but there
  is no grid and nothing responds. Every script is refused: *"Refused to execute script from
  '…/no-such-page/js/load-gate.js' because its MIME type ('text/html') is not executable"*. This is the
  nested-path failure Netlify has too. TUN-68 owns it.

Still for the owner, before or at merge: narration and the piano by ear, `file://`. After the merge, the
production checks (Q4 = A).
