# TUN-103 — Publish the repository

Branch `ao/publish-checklist/root` · Size **S** (label and section agree) · `needs-owner` · AO session
`music-garden-45`. Picked up from **Backlog**, not Todo: the owner named it for this session through the
orchestrator (2026-11-20).

## Plan (Claude)

No code. Run the ticket's *Before publishing* checks against `origin/main` and against everything else
GitHub will expose, record the results and the scan's patterns here, write the owner's publishing
checklist, and stop at the design checkpoint (`needs-owner`). The owner performs every publishing step;
no agent changes visibility, branch protection or any repository setting. After the owner publishes,
this session runs *After publishing* and corrects the docs in this same PR.

## Before publishing — the checks (2026-11-20, `origin/main` = `a56e55d`)

### 1. Hardening and phase 2 tickets: merged, and deployed where they have a backend part

Each PR's merge commit was checked to be an ancestor of `origin/main` (`git merge-base --is-ancestor`).
All are.

| Ticket | PR | Merged (UTC) | Backend part deployed? |
|---|---|---|---|
| TUN-80 Cloudflare alongside Netlify | #128 | 11-14 | no backend part |
| TUN-81 Self-hosted fonts and sign-in library | #133 | 11-15 | no backend part |
| TUN-82 Throttle, $30 email, data protection | #129 | 11-14 | yes — *Owner's review — the deploy (2026-11-14)* in its record |
| TUN-83 Real songs and progress only | #137 | 11-15 | yes — *Owner's review — the deploy (2026-11-14)* in its record |
| TUN-84 Hostile links harmless | #130 | 11-14 | no backend part |
| TUN-85 Retire Netlify | #141 | 11-15 | no backend part |
| TUN-86 Security and caching headers | #139 | 11-15 | no backend part |
| TUN-87 Cost switch at $30 | #143 | 11-15 | yes — *Owner's review — the deploy and the trip by hand (2026-11-15)* |
| TUN-88 100 sign-ups a day | #147 | 11-16 | yes — the owner deployed `a23ac09` (*Owner's review — the deploy and the playtest*, 2026-11-15) |
| TUN-76 Drop the retired Netlify CORS origin | #135 | 11-15 | yes — its record has no deploy section of its own, but `a23ac09` (TUN-88's deploy) contains #135, as it contains #129, #137 and #143 |
| TUN-113 Deploy as `mg-deploy`, retire the root key | #146 | 11-18 | yes — first real deploy as `mg-deploy`, root key deactivated and deleted (*Owner's review — the move off the root key*, 2026-11-15 to 11-17) |
| TUN-106 Keep cloud progress on a failed load | #140 | 11-15 | client only |
| TUN-89 Licences and credits | #154 | 11-20 | — |
| TUN-90 CI on every pull request | #150 | 11-19 | — |
| TUN-91 Rule for outside pull requests | #159 | 11-20 | — |
| TUN-92 Contributor guide, conduct, security contact | #157 | 11-20 | — |
| TUN-98 README for visitors, no machine path | #151 | 11-19 | — |
| TUN-105 Make-a-quest guide | #152 | 11-19 | — |
| TUN-114 Cloudflare settings that stay off | #149 | 11-19 | — |
| TUN-120 GPT 6.2 Astra | #161 | 11-20 | — |

**The owner's deploys carry every backend change on `main`:** `git diff a23ac09 origin/main -- backend/`
touches only `backend/README.md`. TUN-88's record has the owner deploying `a23ac09`; TUN-113's records a
**later** successful deploy as `mg-deploy`, from the project checkout on `main`. Either way the deployed
source carries every backend change on `main`. This is the records and Git, not a query of AWS: no
session read the live stack's state.

**Not done, in the hardening phase (TUN-77):** **TUN-115** *Stop the deploy identity from giving itself
more power through a Lambda role* (M, `needs-owner`, Backlog). It is not among TUN-103's blockers —
question 2 below.

### 2. Secret scan of the whole history

**What was scanned:** everything GitHub will expose, not only `main` — the 45 branches and the 45
`refs/pull/*/head` refs (`git ls-remote origin`, 91 lines with `HEAD`; sha256 prefix of that listing
`6d0aa60ebda74d90`), before this PR's branch existed; the branch was scanned the same way once pushed
(*The scan, again* below). That is **356 commits**: every one of their **1,929 blobs** (1,415 text, 514
binary — samples, fonts, images), read whole with `git cat-file --batch` rather than through diffs, so
merge resolutions and deleted files are covered, and all 356 commit messages. The script was a one-off
in the system temp directory (Node, no dependencies), not committed.

These are the first scan's patterns, as run. PR review round 1 added more and re-ran every snapshot
(*The expanded scan*, below).

**Patterns — strict, run on every blob, binary included, and on every commit message:**

| Name | Regex |
|---|---|
| AWS access key ID | `\b(?:A3T[A-Z0-9]\|AKIA\|ASIA\|ABIA\|ACCA\|AGPA\|AIDA\|AROA\|AIPA\|ANPA\|ANVA\|APKA)[A-Z0-9]{16}\b` |
| Private key block | `-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----\|PuTTY-User-Key-File` |
| GitHub token | `\b(?:gh[pousr]_[A-Za-z0-9]{36,}\|github_pat_[A-Za-z0-9_]{22,})` |
| OpenAI / Anthropic key | `\bsk-(?:ant-\|proj-)?[A-Za-z0-9_-]{32,}` |
| Slack token or webhook | `\bxox[abprs]-[A-Za-z0-9-]{10,}\|hooks\.slack\.com/services/T[A-Za-z0-9]+` |
| Google API key, OAuth secret | `\bAIza[0-9A-Za-z_-]{35}\b\|\bGOCSPX-[A-Za-z0-9_-]{20,}` |
| Stripe key | `\b[rs]k_(?:live\|test)_[0-9A-Za-z]{20,}` |
| Linear, npm, Netlify token | `\blin_(?:api\|oauth)_[A-Za-z0-9]{20,}\|\bnpm_[A-Za-z0-9]{36}\b\|\bnfp_[A-Za-z0-9]{30,}` |
| SendGrid key | `\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b` |
| JWT | `\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}` |

**Patterns — loose, run on text blobs and commit messages (not binary blobs), every hit read by hand**
(case-insensitive):

| Name | Regex |
|---|---|
| AWS secret key assignment | `aws.{0,20}secret.{0,20}[:=]\s*['"]?[A-Za-z0-9/+]{40}\b` |
| Cloudflare token assignment | `(?:cf\|cloudflare)[_-]?(?:api)?[_-]?(?:token\|key)\s*[:=]\s*['"]?[A-Za-z0-9_-]{30,}` |
| Generic secret assignment | `\b(?:password\|passwd\|secret\|api[_-]?key\|access[_-]?token\|auth[_-]?token\|client[_-]?secret)\b["']?\s*[:=]\s*["'][^"'\s]{8,}["']` |
| Credentials in a URL | `\b[a-z][a-z0-9+.-]*://[^/\s:@"'<>]+:[^/\s:@"'<>]+@[^\s"'<>]+` |

**File names ever committed**, checked against
`(^|/)(\.env(\..*)?|id_[rd]sa|id_ecdsa|id_ed25519|credentials|\.npmrc|\.netrc|.*\.(pem|key|p12|pfx|jks|keystore|tfstate|ppk))$`
over all **603 file paths** in those commits. (The first count, 643, also counted 39 directories and the
root — GPT's round 1 finding 2.)

**Positive control:** the same script on a throwaway repository holding AWS's documented example key
(`AKIA` followed by `IOSFODNN7EXAMPLE`; split here so this record does not match its own scan), an `OPENSSH PRIVATE KEY` header, a `ghp_` token and a `password = "…"` line
reported all four.

**Result: no unexplained match.** No strict hit; no risky file name. The loose patterns' 5 hits are one test fixture
in five versions of `tests/backend-handlers.test.mjs` and `tests/backend-presignup.test.mjs` —
`SECRET = "arn:aws:dynamodb:us-east-1:123456789012:table/SECRET-internal"`, a fake ARN in AWS's
documentation account. The only AWS account IDs anywhere in history are AWS's documentation examples
(`123456789012`, `444455556666`, `1111-2222-3333`). `backend/samconfig.toml` holds the stack name and
region, no credentials.

**Commit identities:** authors and committers are the owner's own address (in the commit metadata,
accepted by the owner, 2026-11-13; deliberately not copied here) and `noreply@github.com`; co-author
trailers are only `noreply@anthropic.com`.

**Also scanned — the GitHub issues and pull requests, which go public too:** 116 issues and 45 PRs —
titles, bodies, comments and reviews, 566 texts (authors `pad29`, `linear-code`, `netlify`,
`cloudflare-workers-and-pages`) — with the same patterns, plus email addresses and machine paths.
No credential. The 34 JWTs are Netlify's QR-code image tokens in its old deploy-preview comments;
each payload is only `{"url":"https://deploy-preview-<n>--tunegarden.netlify.app"}`. Emails:
`conduct@tunegarden.game` and the `owner@example.org` test placeholder only. Machine paths: AO worktree
paths (`C:/Users/pavel/.ao/…`) in 13 PR comments and 2 issue bodies, and AO's project checkout path in
issue #119 and a PR #151 comment — the same kind `reviews/` keeps.

**The scan, again — this PR's head.** Before its first push, the same script ran over all 91 remote
refs plus this branch's commits: no unexplained match. Besides the same five fixture hits, it matched
only this record quoting itself — the strict pattern on `PuTTY-User-Key-File` in its own pattern table,
and the loose one on the fixture's `SECRET = "arn:…"` line quoted above. Its PR head is therefore covered too; any later head is re-scanned under step A1.

### 3. Machine paths and personal email in tracked files, against TUN-98's record

TUN-98's audit (`reviews/TUN-98-readme-for-visitors.md` § The `git grep` audit, at `ccc1eb9`) repeated
with its own search terms on `a56e55d`:

- **Machine paths outside `reviews/`:** none. `%APPDATA%\GitHub CLI\config.yml` in
  `.claude/skills/work-ticket/pr-review.md:10` and the false match in `EDITOR-DESIGN.md:181` are as
  TUN-98 left them.
- **Machine paths in `reviews/`:** 18 files now, TUN-98 counted 12; the six more are records written
  since (TUN-90, 91, 92, 98, 105, 114), with the same kind of path (`C:/Users/pavel/.ao/…`, AO's
  worktrees). Left as written, as TUN-98 decided for history.
- **`pavel`, `dmitriev`, `pad29` outside `reviews/`:** as TUN-98 recorded (`DESIGN.md`, `PACKAGES*.md`,
  `js/famous.js`, the README's clone URL), plus files merged after it, every one deliberate: the
  repository's own URL (`.github/ISSUE_TEMPLATE/config.yml`, `CONTRIBUTING.md`, `SECURITY.md`,
  `README.md`'s badge, `tests/contributing.test.mjs`), the copyright line (`CREDITS.md`,
  `LICENSE-CC-BY-SA.md`), and `pad29` as the account sessions post as (`CLAUDE.md`,
  `tests/workflow-refs.test.mjs`).
- **Email addresses:** TUN-98's placeholders (`you@`, `new@`, `parent@`, `x@example.com`,
  `owner@example.org`), plus `conduct@tunegarden.game` (TUN-92's contact) and `roberto@zenvoid.org` in
  `CREDITS.md:64` — the FreePats guitar's author credit as FreePats publishes it (TUN-89). No personal
  address.

**Matches TUN-98's record**, apart from the additions above, all of which are intended.

### 4. CI on `main`

Green. `a56e55d`: *Checks* → **Syntax check and tests** success, **Cloudflare Pages** success. The last
seven pushes to `main` all passed. The workflow's job name — the status check to require — is
**`Syntax check and tests`** (`.github/workflows/checks.yml`, workflow *Checks*).

### 5. The `conduct@tunegarden.game` alias

Set up and tested by the owner on 2026-11-20 (Active in Cloudflare Email Routing; a test email from
another account arrived) — noted on the ticket. Re-test on the day: step A3 below.

### 6. The repository today (read-only `gh api`, nothing changed)

- Private; no description, website or topics; wiki and discussions off, issues and projects on.
- **No Actions secrets, variables or environments; no deploy keys; no webhooks.** Workflows get a
  read-only `GITHUB_TOKEN` and cannot approve pull requests. So a fork's workflow run has nothing to
  steal.
- Branch protection and rulesets: GitHub refuses even to read them on a private free-plan repository
  (HTTP 403). The first-time-contributor approval setting likewise (HTTP 422, "not allowed for private
  repositories"): both can only be set after the click.
- No open pull requests. 88 open issues of 116 — all synced from Linear.
- 45 branches, most of them merged work (`delete_branch_on_merge` is off); all of them were in the scan
  and all become public. Nothing to do; noted so it is not a surprise.

### 7. Docs that call the repository private

None on `main`: no doc says the repository *is* private. One line is written for before the click —
`CLAUDE.md:137`, "Once the repository is public, anyone can open a pull request…" — which *After
publishing* puts in the present tense.

## The owner's publishing checklist

Everything here is the owner's, in the GitHub web UI. GitHub's labels are given as they were on
2026-11-20 and may move; the setting's meaning is what matters.

**A. Before the click**

1. **Tell this session you are about to publish** (`ao://sessions/music-garden/music-garden-45`, or
   through the orchestrator). If anything has been pushed to GitHub since the scan above — a new branch,
   a new PR head, a merge — it re-runs the secret scan on the new refs first and tells you the result.
   (It compares `git ls-remote origin` with the refs scanned above and, if any differ, scans every
   ref again with the same patterns — seconds, not minutes.)
2. **Linear tickets → GitHub issues.** All 116 synced issues and their comment threads become public
   with the repository, and so do the 45 pull requests' bodies and comments. The scan found no
   credential and no personal address in them. What it cannot judge is content: anything about a
   person, money, plans or accounts you would not post publicly. Skim the issue list
   (<https://github.com/pad29/music-garden/issues?q=is%3Aissue>) or Linear's synced tickets. If one
   holds something private, edit or delete it **before** the click.
3. **Re-test the conduct alias:** send an email to `conduct@tunegarden.game` from an account other than
   your own inbox, and check it arrives. `CODE_OF_CONDUCT.md` and `SECURITY.md` both send people there.
4. **Answer the open questions below** (TUN-117, TUN-115) — both are about whether something must happen
   first.

**B. The click** — Settings → General → *Danger Zone* → **Change repository visibility** → **Make
public**, and confirm. This cannot be cleanly undone: forks and clones can exist within minutes.

**C. Straight after** — `main` is unprotected until C1 is saved, as it is today.

1. **Protect `main`** — Settings → Branches → **Add classic branch protection rule** (a classic rule,
   so `gh api repos/pad29/music-garden/branches/main/protection` shows it; a ruleset would not).
   Branch name pattern `main`, then:
   - ☑ **Require a pull request before merging** — and then **untick *Require approvals*** (GitHub
     ticks it, with 1 approval, as soon as you tick the parent). Sessions open PRs from your own
     account, and GitHub never lets an author approve their own PR: with approvals required, nothing
     could merge.
   - ☑ **Require status checks to pass before merging** → search for and add **`Syntax check and
     tests`** (source *GitHub Actions*). **Only that one** — not *Cloudflare Pages*, which never runs on
     a fork's PR, so requiring it would block every outside contribution. Leave **Require branches to
     be up to date before merging** unticked (choice 2 below).
   - ☑ **Do not allow bypassing the above settings** (choice 1 below).
   - ☐ *Allow force pushes* and ☐ *Allow deletions* stay **unticked** — that is what blocks them.
   - Leave the rest off (*Require conversation resolution*, *signed commits*, *linear history* — the
     repository merges with merge commits —, *deployments*, *Lock branch*).
   - **Create**.
2. **Security** — Settings → *Advanced Security* (called *Code security* in older layouts):
   - **Private vulnerability reporting → Enable.** `SECURITY.md`'s "Report a vulnerability" link
     (`/security/advisories/new`) only works once this is on.
   - **Secret scanning → Enable**, then **Push protection → Enable**. (GitHub may already have switched
     them on for a public repository; make sure both say *enabled*.)
3. **First-time contributors' workflow runs** — Settings → Actions → General → *Approval for running
   fork pull request workflows from contributors*: **keep the default, *Require approval for
   first-time contributors*** (or stricter). Change nothing else on that page: the workflow's
   read-only token is set there and must stay read-only.
4. **About** — the gear beside *About* on the repository's front page:
   - Description, for example: *A music game where kids learn to read and write melodies by planting a
     garden. Plain HTML and JavaScript, no build step.* (your words win)
   - Website: `https://tunegarden.game`
   - Topics, for example: `music-education`, `game`, `kids`, `javascript`, `web-audio`, `html5-game`,
     `open-source`.

**D. Tell this session it is published.** It then runs *After publishing* below and reports back.

**For later — looking at an outside contribution.** Cloudflare Pages builds **no preview for a pull
request from a fork**, and no agent session checks one out or runs it (`CLAUDE.md` § Outside
contributions). The *Checks* workflow does run its tests, on GitHub's machines with no secrets — after
your approval, the first time that contributor opens one. To see it in a browser, run it on your own
machine yourself, after reading the whole diff. Pushing a fork's branch into this repository to get a
Cloudflare preview would run that branch's `cloudflare-build.sh` on Cloudflare: read that file in the
diff first if you ever do it.

## The re-scan before the click (2026-11-20)

The orchestrator said the owner was about to publish, had reviewed the synced issues and PRs (nothing
private) and re-tested `conduct@tunegarden.game` (it works). Fetched and compared `git ls-remote origin`
with the first scan's listing: **94 refs, 91 before**. The three new ones were this PR's own —
`refs/heads/ao/publish-checklist/root` and `refs/pull/162/head` at `f69301d`, and GitHub's test merge
`refs/pull/162/merge` at `80e1003` (fetched by SHA). `main` had not moved (`a56e55d`); no other ref
changed. The four new commits (`05fdd5d`, `12fa98b`, `f69301d`, `80e1003`) add this record and nothing
else.

- **Secret scan, all 94 refs, the patterns above:** 360 commits, 1,932 blobs (1,418 text, 514 binary),
  604 file paths (reported to the orchestrator as 644, which counted directories). No risky file name
  and **no unexplained match**. The strict pattern matched `PuTTY-User-Key-File` 5 times — this
  record's own pattern table, in its three versions (`05fdd5d`, `12fa98b`, `f69301d`); the loose hits
  are the fake-ARN fixture and this record quoting it. (Reported then as "no strict hit", wrongly — GPT's
  round 1 finding 2.)
- **Paths and addresses in the new commits:** only what this record reports (AO worktree paths, the
  owner's accepted commit address, placeholders, `conduct@`, FreePats' credit). Identities as before.
- **Issues and PRs again** (116 issues, 46 PRs, 570 texts): no credential; the same findings, plus the
  TUN-103 hand-offs naming `conduct@`.
- **`main`:** *Syntax check and tests* and *Cloudflare Pages* green on `a56e55d`; `backend/` still
  differs from the deployed `a23ac09` only in `backend/README.md`.

**Clean** — reported to the orchestrator before the click. Not committed then, so that no ref moved after
the scan the owner relied on.

## Owner's review — publishing (2026-11-20)

The owner made the repository public and went through every step of section C, telling this session
afterwards.

## After publishing — this session verified (2026-11-20)

1. **`main`'s protection** (`gh api …/branches/main/protection`): `required_status_checks.contexts`
   exactly `["Syntax check and tests"]`, bound to GitHub Actions (`app_id` 15368), `strict: false`;
   `required_pull_request_reviews` present with `required_approving_review_count: 0` (no code-owner,
   stale-dismissal or last-push rules); `enforce_admins: true`; `allow_force_pushes: false`;
   `allow_deletions: false`; linear history, conversation resolution, signatures and lock all off. No
   rulesets (`…/rulesets` is empty, `…/rules/branches/main` is `[]`). **As the checklist asked.**
2. **The repository:** `visibility: "public"`; `secret_scanning` and `secret_scanning_push_protection`
   `enabled`; private vulnerability reporting `enabled: true`; fork PR approval
   `first_time_contributors`; workflow token still `read`, and workflows still cannot approve PRs.
   GitHub detects the licence as AGPL-3.0. **About:** description *"A game that teaches how music works
   without notation"*, topics `music-game` and `music-learning` — the owner's own, which win over the
   checklist's suggestions; website `https://www.tunegarden.game` rather than the checklist's apex. Both
   hosts answer 200 with the game, and `www` is on the backend's CORS list (`backend/template.yaml`), so
   a visitor who arrives by that link can sign in too. Nothing to change.
3. **Signed out** (`curl`, no credentials): the repository page, the API and the raw `SECURITY.md`
   answer 200. `SECURITY.md`'s advisory link answers 302 — GitHub sends a signed-out visitor to sign in,
   because a private report needs an account. Expected.
4. **An agent session can still push its own branch:** verified — `835cf28` pushed to
   `ao/publish-checklist/root` after the click, and PR #162's checks ran on it. **…and open a PR:**
   **not yet shown.** PR #162 was opened before the click and only marked ready after it; the next PR a
   session opens is the evidence. **The owner can still merge one:** **not yet shown** — this PR, when
   the owner merges it, is the proof: it needs *Syntax check and tests* green and no approval. This
   session never pushed `main` to "test" the protection: had the rule been wrong, that push would have
   deployed.
5. **The docs**, in `835cf28`, corrected in the commit that answers PR review round 1:
   - `CLAUDE.md` § Outside contributions opens in the present tense ("The repository is public (since
     2026-11-20): …"). § AO, tickets and branches says what GitHub enforces — for every account,
     `pad29` included, a change reaches `main` through a pull request whose check passed, so an ordinary
     direct push is refused — and that it cannot tell whether the owner agreed, which stays the
     workflow's rule. (`835cf28` said "a push to `main` is refused", too broadly: GitHub accepts a
     locally merged push that satisfies the rule — round 1 finding 4.)
   - `README.md` § Deployment records the protection and the security settings, with why no approval is
     required and why *Cloudflare Pages* is not a required check; § Current status records the
     repository as public, with its licences (AGPL-3.0-or-later, as `CREDITS.md` states) and contributor
     docs, and its preview line now says previews are for branches of this repository, none for a fork
     (round 1 finding 7).
   - `CONTRIBUTING.md` § 8: the owner merges only once the automatic checks have passed.
   - No doc called the repository private (§ 7 above).

## PR review — round 1 (`gpt-6.2-astra`, `ask.sh fresh read-only`, on `835cf28`)

Verdict: **CHANGES REQUESTED** — one high, four medium, three low, and one missing test.

<details><summary>GPT's review, verbatim</summary>

1. **High — `reviews/TUN-103-publish-the-repository.md:82`.** Expand the secret scan and rerun it. The Cloudflare rule misses standalone `cfut_`, `cfat_`, and `cfk_` credentials. The GitHub rule misses current `ghs_APPID_JWT` installation tokens, and the JWT rule’s leading word boundary misses the JWT after the underscore. The assignment rules also miss `AWS_SESSION_TOKEN` and opaque Cognito `RefreshToken` values. Apply the strict patterns to commit messages explicitly. Report the result as “no unexplained matches” and distinguish GitHub’s enabled setting from an actual check of its alerts. [Cloudflare credential formats](https://developers.cloudflare.com/changelog/post/2026-04-14-cloudflare-api-token-detections/) · [GitHub installation token format](https://github.blog/changelog/2026-10-02-stateless-github-app-installation-tokens-rolled-out/) · [GitHub secret-scanning scope](https://docs.github.com/en/code-security/reference/secret-security/secret-scanning-scope)

2. **Medium — `reviews/TUN-103-publish-the-repository.md:252`.** Correct the scan accounting. I reproduced the initial 356 commits and 1,929 blobs, and the pre-click 360 commits and 1,932 blobs, from local Git objects. The two snapshots contain **603 and 604 distinct file paths**. The reported 643 and 644 include 39 directories and the root. Applying the written patterns also produced **three strict matches** before the click, one in each version of the record quoting `PuTTY-User-Key-File`. All three are explained. Finally, `835cf28` adds one commit and four blobs beyond that scan. Preserve the pre-click result under its actual SHA and record the expanded scan against the reviewed head in the handoff.

3. **Medium — `reviews/TUN-103-publish-the-repository.md:101`.** Remove the owner’s literal personal email from the new record. The owner accepted its presence in commit metadata. Copying it into a tracked Markdown file creates a new hit in the very search this ticket must reconcile with TUN-98. “The owner’s accepted commit address” records the result without republishing the address. No history rewrite is needed.

4. **Medium — `CLAUDE.md:134`, `README.md:254`.** Separate GitHub’s merge conditions from the owner’s authorization to deploy. The recorded rule applies to `pad29`, requires a PR with the named check, and requires zero approving reviews. GitHub cannot tell whether the owner authorized an agent using that account. “A push to `main` is refused” is also too broad. GitHub documents that a qualifying, up-to-date PR can be merged locally and pushed. Say that an ordinary direct change is blocked and retain the owner’s explicit-permission rule. Correct the same claim in the review record at lines 297 and 330. I could verify the workflow’s check name locally, but the live protection endpoint was unreachable from this session. [GitHub’s required-check behavior](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks)

5. **Medium — `reviews/TUN-103-publish-the-repository.md:289`.** Mark **post-publication PR creation** pending alongside the owner’s merge. Pushing `835cf28` demonstrates branch push access. Marking an existing draft ready does not demonstrate opening a PR after protection took effect. Record the next ordinary session-created PR and the owner’s eventual merge as separate evidence. The expected wait for CI on #162 is not a defect.

6. **Low — `reviews/TUN-103-publish-the-repository.md:45`.** Correct the deploy attribution. TUN-88 records the `a23ac09` deploy. TUN-113 records a **later** successful deploy from merged `main` as `mg-deploy`. The Git comparison supports the conclusion that the owner deployed every backend source change required by this ticket. It does not independently establish the live stack’s current state.

7. **Low — `README.md:198`.** Replace “a preview per pull request” with “a preview for branches pushed to this repository,” and use the project’s declared **AGPL-3.0-or-later** identifier. The current summary contradicts the fork guidance in Deployment and drops the licence choice stated in `CREDITS.md:14`. I found no other current operating document describing the repository as private. The remaining pre-publication wording is in dated review history.

8. **Low — `reviews/TUN-103-publish-the-repository.md:340`.** Record the actual passing test count and the head or CI run that produced it. “The whole suite pass[es]” omits the count in the review format. Add this first PR-review round and its dispositions with the fixes, as §8 specifies. The short S plan and owner checkpoint are already present.

**Missing tests**

- **Scan positive control:** Use dummy values for a standalone Cloudflare token, a current GitHub installation token, `AWS_SESSION_TOKEN`, and an opaque `RefreshToken`. Put one value only in a commit message and another only in a deleted blob reachable through a PR ref. Require the scan to identify each location without printing the value.
- **Game tests:** None. This diff changes documentation and a publication record.

**CHANGES REQUESTED**

</details>

### My answers

1. **High — expand the scan.** **Agreed**, all but one clause, and done (*The expanded scan*, below):
   standalone Cloudflare tokens (`cfut_`, `cfat_`, `cfk_`), GitHub tokens with `_`, `.` and `-` after
   the prefix (the stateless `ghs_` shape), JWTs after a word character, AWS session tokens (the value's
   own prefixes, and `AWS_SESSION_TOKEN=` assignments), JWE-shaped tokens such as Cognito's refresh
   token, and `refresh`/`id`/`session` token assignments. The result is worded "no unexplained match".
   GitHub's side is now checked, not just enabled: **0 secret-scanning alerts**, open or resolved, on
   2026-11-20 after publishing; its scan-history endpoint needs paid Advanced Security ("Advanced Security
   is disabled on this repository", HTTP 404), so whether GitHub's own backfill had finished is
   **unknown**. **Disagreed on one clause** — "apply the strict patterns to commit messages explicitly":
   the script already ran strict and loose patterns over every commit message; the record's headings
   hid that, and now say it.
2. **Medium — the scan accounting.** **Agreed and corrected:** 603 / 604 file paths (my 643 / 644
   counted directories), and the pre-click strict matches — 5 occurrences of `PuTTY-User-Key-File`, in the
   three versions of this record — are now stated instead of "no strict hit". The pre-click result stays
   under its SHAs; the expanded scan names the head it covers.
3. **Medium — the literal address.** **Agreed:** removed from this record (*Commit identities*). It
   remains in the earlier versions of this file in Git history, as it remains in every commit's metadata.
4. **Medium — what GitHub enforces vs. the owner's authority.** **Agreed:** `CLAUDE.md` and README now
   say GitHub enforces the mechanics for every account, refuses an ordinary direct push, and cannot tell
   whether the owner agreed — that rule stays the workflow's. The record's *After publishing* item 5 says
   the same.
5. **Medium — opening a PR after protection is not shown.** **Agreed:** item 4 now marks it, and the
   owner's merge, **not yet shown**.
6. **Low — the deploy attribution.** **Agreed:** § 1 now names TUN-113's later deploy from `main`, and
   says the conclusion comes from the records and Git, not from AWS.
7. **Low — README's preview line and licence id.** **Agreed and fixed:** "a preview for every branch
   pushed to this repository — none for a fork's pull request", and AGPL-3.0-or-later.
8. **Low — test count, head, and this round.** **Agreed:** *Tests* below names both; this section is the
   round's record, in the same commit as its fixes.

**Missing test — the scan's positive control. Added, as a control run** (the scanner is a one-off in
the system temp directory, not part of the repository, so not a suite test): a throwaway repository
with a standalone `cfut_` Cloudflare token and a stateless `ghs_…` GitHub token **only in a commit
message**, and an `AWS_SESSION_TOKEN=IQoJb3JpZ2luX2Vj…` line and a JWE `"RefreshToken"` **only in a blob
that a later commit deletes, reachable only through a `refs/pull/1/head` ref**. The expanded scan found
all four, at their locations — 7 matches (the `ghs_` token also as a JWT, both blob values also by
their assignment patterns) — and printed none of the values (each match is shown as its first six
characters and its length). **Game tests:** none, as GPT says; no code changed.

### The expanded scan

The patterns above, **plus** these (strict: every blob and every commit message; loose: text blobs and
commit messages), with the strict patterns refusing to start right after a letter or digit
(`(?<![A-Za-z0-9])`) rather than at a `\b` word boundary, so a token after `_` is found. **Not quite
every one, as run** (GPT's round 3 finding 2): the AWS access key rule kept its `\b` boundaries until
round 3, and the Google, npm and SendGrid rules lost their trailing `\b` without this saying so. The
exact expressions finally run are in *PR review — round 3*:

| Kind | Name | Regex |
|---|---|---|
| strict | GitHub token (replaces the first) | `(?<![A-Za-z0-9])(?:gh[pousr]_[A-Za-z0-9_.-]{30,}\|github_pat_[A-Za-z0-9_]{22,})` |
| strict | Cloudflare token | `(?<![A-Za-z0-9])cf(?:ut\|at\|k)_[A-Za-z0-9_-]{20,}` |
| strict | AWS session token value | `(?<![A-Za-z0-9/+])(?:FwoGZXIvYXdzE\|IQoJb3JpZ2luX2Vj)[A-Za-z0-9/+=]{50,}` |
| strict | JWT (replaces the first) | `(?<![A-Za-z0-9])eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}` |
| strict | JWE, e.g. a Cognito refresh token | `(?<![A-Za-z0-9])eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}` |
| loose | AWS session token assignment | `aws_?session_?token["']?\s*[:=]\s*["']?[A-Za-z0-9/+=]{40,}` |
| loose | Generic secret assignment (replaces the first) | adds `refresh[_-]?token`, `id[_-]?token`, `session[_-]?token` to its list of names |

Run over three snapshots of everything GitHub exposes:

| Snapshot | Refs | Commits | Blobs | File paths | Matches | Unexplained |
|---|---|---|---|---|---|---|
| First scan (`main` `a56e55d`, before this PR) | 91 | 356 | 1,929 | 603 | 5 loose — the fake-ARN fixture | **none** |
| Before the click (PR head `f69301d`) | 94 | 360 | 1,932 | 604 | 5 strict + 8 loose — this record quoting itself, and the fixture | **none** |
| After publishing (PR head `835cf28`, test merge `d35aa5c`) | 94 | 361 | 1,936 | 604 | 7 strict + 9 loose — the same | **none** |

The issues and pull requests again (116 issues, 46 PRs, 570 texts), with the expanded patterns: the same
34 Netlify QR-code JWTs and nothing else. No risky file name in any snapshot. The commit that answers this
round, `581e930`, changes this record and two other docs (`CLAUDE.md`, `README.md`); it was scanned with
these patterns before it was pushed: 5 strict and 1 loose occurrence, all in its new version of this
record, all this record quoting itself. (Round 2 widened the patterns again — *PR review — round 2*.)

## PR review — round 2 (`gpt-6.2-astra`, `ask.sh fresh read-only`, on the delta `835cf28..581e930`)

Verdict: **CHANGES REQUESTED** — one medium, two low, one nit, and two missing controls. GPT accepted
the round 1 disagreement ("I accept the commit-message disagreement"), reproduced the three snapshot rows,
and found findings 3, 5, 6 and 8 answered.

<details><summary>GPT's review, verbatim</summary>

1. **Medium — `reviews/TUN-103-publish-the-repository.md:409`.** The refresh-token assignment rule still requires a quoted value. I reproduced zero matches for a dummy opaque value in `grant_type=refresh_token&refresh_token=…`, the form Cognito documents. The quoted JWE control misses this case because it satisfies two detectors. The strict JWE rule at line 407 also requires a nonempty second segment, which direct-encryption JWE leaves empty. Cover both cases and rerun the expanded scan. [Cognito refresh request](https://docs.aws.amazon.com/cognito/latest/developerguide/token-endpoint.html) · [RFC 7516 §5.1](https://www.rfc-editor.org/rfc/rfc7516.html#section-5.1)

2. **Low — `reviews/TUN-103-publish-the-repository.md:461`.** “Before each push, the expanded scan ran” backdates the expanded rules to pushes made before round 1. Record the original pre-push scans, the retrospective rescans, and the pre-push scan of `581e930` separately. Correct line 421 alongside it. `581e930` changed the record and **two** other docs. I reproduced five strict occurrences and one loose occurrence in its new record blob, all explained. Line 102 should likewise say “no unexplained matches” in place of “nothing.”

3. **Low — `reviews/TUN-103-publish-the-repository.md:449`.** Round 1 explicitly called out this sentence, and it still says a push requires “a merged PR.” A qualifying **open** PR can be merged locally and the result pushed. Use the ordinary-direct-push wording already corrected in `CLAUDE.md`, `README.md` and line 313. [GitHub’s required-check behavior](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks)

4. **Nit — `README.md:198`.** Change “every branch” to “every non-production branch.” The Deployment section at line 252 correctly identifies `main` as production and every other repository branch as a preview branch.

The three snapshot rows reproduce, including **five** pre-click strict occurrences across **three** blobs. The Markdown table escapes render as regex alternation. I accept the commit-message disagreement. The corrected headings state the scope, and the commit-message-only control exercises it. The alert result distinguishes zero alerts from unknown backfill completion. Findings 3, 5, 6 and 8 are answered, as is the licence part of finding 7. [GitHub Flavored Markdown table escaping](https://github.github.com/gfm/#example-200)

**Missing tests**

- Put an unquoted `refresh_token=` form field with a dummy opaque, non-JWE value in a text blob. Require an assignment match at that location.
- Put a standalone dummy direct-encryption JWE with an empty second segment in a commit message. Require a strict match at that location. Both controls should redact the value. A throwaway-repository run is sufficient for this one-off scanner. No game test is missing.

**CHANGES REQUESTED**

</details>

### My answers

1. **Medium — unquoted token assignments and direct-encryption JWE.** **Agreed, and fixed.** The JWE
   rule's second segment may now be empty, and a new loose rule catches an unquoted assignment:

   | Kind | Name | Regex |
   |---|---|---|
   | strict | JWE (replaces round 1's) | `(?<![A-Za-z0-9])eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}` |
   | loose | Token assignment, unquoted | `\b(?:refresh\|id\|access\|session\|auth)[_-]?token\b["']?\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{20,}` (case-insensitive) |

   Re-run over four snapshots — the three of round 1 and the PR head `581e930` (test merge `aa691b1`;
   94 refs, 362 commits, 1,939 blobs, 604 file paths). **No unexplained match in any.** The only new
   matches are 25 in `vendor/cognito/amazon-cognito-identity.min.js` (one version in all of history),
   each read by hand: property names set from calls — `AccessToken:this.signInUserSession.getAccessToken`
   (×20, and two more of that shape), `AccessToken:`, `IdToken:` and `RefreshToken:this.storage.getItem` —
   library code, no value. Issues and pull requests again: the same 34 Netlify JWTs, nothing else —
   in the texts `gh issue list` / `gh pr list` return, which leave out inline review comments (round
   3 finding 1, answered there).
2. **Low — the scans backdated, line 421's count, line 102's wording.** **Agreed:** *Tests* now separates
   each pre-push scan, with the patterns of its time, from the retrospective re-scans — and admits that
   `f69301d` was pushed unscanned (covered by the re-scan before the click). Round 1's closing paragraph
   names `581e930`'s files (the record and two docs) and its own pre-push result (5 strict, 1 loose, all
   self-quotes); line 102 says "no unexplained match".
3. **Low — "a merged PR" in *Choices* 1.** **Agreed:** it now uses the ordinary-direct-push wording.
4. **Nit — "every non-production branch".** **Agreed**, in README § Current status.

**Missing controls — added, as a throwaway-repository run**, as GPT allows: `grant_type=refresh_token&
client_id=abc&refresh_token=<48 random characters>` in a text blob, and a standalone direct-encryption
JWE (`eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIn0..<iv>.<ciphertext>.<tag>`, random parts) **only** in a commit
message. Round 2's patterns found both at their locations — `token-assignment-unquoted` in `form.txt`,
`jwe-eg-cognito-refresh-token` in the commit message — printed as six characters and a length; round 1's
patterns, on the same repository, found **neither**, which confirms the finding.

## PR review — round 3 (`gpt-6.2-astra`, `ask.sh fresh read-only`, on the delta `581e930..0598d0f`)

Verdict: **CHANGES REQUESTED** — one medium, two low, and two missing controls. GPT reproduced the four
snapshots ("0/30, 5/33, 7/34 and 12/35" strict/loose) and the round 2 controls, and found the
direct-push and preview wording correct. **This was the third and last review round** (`work-ticket`
§ 8): its fixes are below and pushed, and there is **no fourth review** — the owner decides.

<details><summary>GPT's review, verbatim</summary>

1. **Medium — `reviews/TUN-103-publish-the-repository.md:467`.** The 570 exported texts reproduce the 34 Netlify JWTs, but the export omits inline PR review comments. PR #95 had a resolved thread on `tests/workflow-refs.test.mjs`, documented in `reviews/TUN-74-size-label.md:112`. The scanner received the top-level review bodies and conversation comments only. Scan the paginated review-comment bodies and record their count and findings separately. [GitHub’s review-comments endpoint](https://docs.github.com/en/rest/pulls/comments#list-review-comments-in-a-repository)

2. **Low — `reviews/TUN-103-publish-the-repository.md:398`.** The recorded boundary change does not match the scanner that ran. Both expanded scanner versions retain a leading `\b` for AWS access-key IDs. An underscore followed by AWS’s documented example ID matched the written rule and missed the actual one. The Google, npm and SendGrid rules also dropped trailing `\b` assertions without recording that change. Document the exact expressions used. The differences did not change the four snapshot totals.

3. **Low — `reviews/TUN-103-publish-the-repository.md:525`.** “Each found only this record quoting itself” still overstates the first pre-push result. Lines 122–125 say that scan covered the remote history and also found five existing fixture occurrences. Say that only the **new** matches were self-quotes. The chronology now correctly identifies the unscanned `f69301d` push.

Both round 2 controls passed at their specified locations and missed under the old rules. The four snapshots reproduced, in order, with strict/loose occurrence counts of **0/30, 5/33, 7/34 and 12/35**. The `0598d0f` delta added **5 strict and 3 loose**, all in the record. The ordinary-direct-push and non-production-preview wording is correct.

**Missing tests**

- Verify that the review-comment scan retrieves PR #95’s known inline thread and passes its body to the scanner.
- Exercise the documented AWS boundary with an underscore immediately before the dummy access-key ID. Require the recorded and executed patterns to agree. No game test is missing.

**CHANGES REQUESTED**

</details>

### My answers

1. **Medium — inline review comments were never scanned.** **Agreed, and done.** Every inline PR review
   comment in the repository (`gh api --paginate repos/pad29/music-garden/pulls/comments`) and every
   commit comment (`…/comments`): **2 review comments, 0 commit comments** — the 2 are PR #95's thread
   on `tests/workflow-refs.test.mjs` (`pad29`'s finding and reply), the one `reviews/TUN-74-size-label.md`
   records. Their bodies, with the final patterns plus email addresses and machine paths: **no match.**
2. **Low — the boundary claim vs. what ran.** **Agreed.** The AWS access key rule now uses the
   lookaround boundaries too, and the record's round 1 paragraph says what actually ran until now. The
   exact expressions are below, copied from the script, not retyped — so they cannot drift from it
   again.
3. **Low — "each found only this record quoting itself".** **Agreed:** *Tests* now says the only **new**
   matches were self-quotes, and that the first scan also met the five fixture occurrences.

**Missing controls — added, as throwaway-repository runs:**
- **PR #95's inline thread:** the fetch above returned both of its comments, by path, and their bodies
  went to the scanner (2 texts, 0 matches).
- **The AWS boundary:** `key_` followed by AWS's documented example access key ID in a text blob. The
  final patterns matched it (`aws-access-key-id`, printed as six characters and its length, 20); the
  round 2 scanner, on the same repository, did not — confirming the finding.

### The final patterns, exactly as run

Strict: every blob, binary included, and every commit message. Loose: text blobs and commit messages
(not binary blobs). Every loose match is read by hand. Matches are printed as six characters and a length,
never whole. These are the script's own lines:

```js
const STRICT = {
  'aws-access-key-id': /(?<![A-Za-z0-9])(?:A3T[A-Z0-9]|AKIA|ASIA|ABIA|ACCA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|APKA)[A-Z0-9]{16}(?![A-Za-z0-9])/g,
  'aws-session-token-value': /(?<![A-Za-z0-9\/+])(?:FwoGZXIvYXdzE|IQoJb3JpZ2luX2Vj)[A-Za-z0-9\/+=]{50,}/g,
  'private-key-block': /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----|PuTTY-User-Key-File/g,
  'github-token': /(?<![A-Za-z0-9])(?:gh[pousr]_[A-Za-z0-9_.-]{30,}|github_pat_[A-Za-z0-9_]{22,})/g,
  'cloudflare-token': /(?<![A-Za-z0-9])cf(?:ut|at|k)_[A-Za-z0-9_-]{20,}/g,
  'openai-anthropic-key': /(?<![A-Za-z0-9])sk-(?:ant-|proj-)?[A-Za-z0-9_-]{32,}/g,
  'slack-token-or-webhook': /(?<![A-Za-z0-9])xox[abprs]-[A-Za-z0-9-]{10,}|hooks\.slack\.com\/services\/T[A-Za-z0-9]+/g,
  'google-api-key-or-oauth-secret': /(?<![A-Za-z0-9])AIza[0-9A-Za-z_-]{35}|(?<![A-Za-z0-9])GOCSPX-[A-Za-z0-9_-]{20,}/g,
  'stripe-key': /(?<![A-Za-z0-9])[rs]k_(?:live|test)_[0-9A-Za-z]{20,}/g,
  'linear-npm-netlify-token': /(?<![A-Za-z0-9])(?:lin_(?:api|oauth)_[A-Za-z0-9]{20,}|npm_[A-Za-z0-9]{36}|nfp_[A-Za-z0-9]{30,})/g,
  'sendgrid-key': /(?<![A-Za-z0-9])SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}/g,
  'jwt': /(?<![A-Za-z0-9])eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  'jwe-eg-cognito-refresh-token': /(?<![A-Za-z0-9])eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g,
};
const LOOSE = {
  'aws-secret-assignment': /aws.{0,20}secret.{0,20}[:=]\s*['"]?[A-Za-z0-9\/+]{40}\b/gi,
  'aws-session-token-assignment': /aws_?session_?token["']?\s*[:=]\s*["']?[A-Za-z0-9\/+=]{40,}/gi,
  'token-assignment-unquoted': /\b(?:refresh|id|access|session|auth)[_-]?token\b["']?\s*[:=]\s*["']?[A-Za-z0-9._~+\/=-]{20,}/gi,
  'cloudflare-token-assignment': /(?:cf|cloudflare)[_-]?(?:api)?[_-]?(?:token|key)\s*[:=]\s*['"]?[A-Za-z0-9_-]{30,}/gi,
  'generic-secret-assignment': /\b(?:password|passwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|refresh[_-]?token|id[_-]?token|session[_-]?token|client[_-]?secret)\b["']?\s*[:=]\s*["'][^"'\s]{8,}["']/gi,
  'credentials-in-url': /\b[a-z][a-z0-9+.-]*:\/\/[^\/\s:@"'<>]+:[^\/\s:@"'<>]+@[^\s"'<>]+/gi,
};
```

File names checked in every snapshot, unchanged:
`(^|/)(\.env(\..*)?|id_[rd]sa|id_ecdsa|id_ed25519|credentials|\.npmrc|\.netrc|.*\.(pem|key|p12|pfx|jks|keystore|tfstate|ppk))$`.

### Every snapshot, with the final patterns

| Snapshot | Refs | Commits | Blobs | File paths | Strict / loose | Where | Unexplained |
|---|---|---|---|---|---|---|---|
| First scan (`main` `a56e55d`, before this PR) | 91 | 356 | 1,929 | 603 | 0 / 30 | the fixture; the Cognito library | **none** |
| Before the click (PR head `f69301d`) | 94 | 360 | 1,932 | 604 | 5 / 33 | + this record | **none** |
| After publishing (`835cf28`) | 94 | 361 | 1,936 | 604 | 7 / 34 | the same | **none** |
| Round 2 (`581e930`) | 94 | 362 | 1,939 | 604 | 12 / 35 | the same | **none** |
| Round 3 (`0598d0f`, test merge `b4f82a9`) | 94 | 363 | 1,941 | 604 | 17 / 38 | the same | **none** |

"The fixture" is the fake-ARN line in `tests/backend-handlers.test.mjs` and
`tests/backend-presignup.test.mjs`; "the Cognito library" is the 25 property-name expressions in
`vendor/cognito/amazon-cognito-identity.min.js` (round 2); "this record" is its pattern tables and
its quotations of those two. No risky file name in any snapshot. The texts of the 116 issues and 46 PRs
(570) again: the 34 Netlify QR-code JWTs and nothing else; the 2 inline review comments: nothing.
GitHub's own secret scanning: 0 alerts (round 1).

## Owner's decisions

Answered **1A, 2A, 3A** — the owner, relayed by the orchestrator (`music-garden-5`) to this session,
2026-11-20.

1. *Design checkpoint (`needs-owner`)* — **A: publish per the checklist as written**, the two choices
   below included. The owner performs every publishing step; no session changes visibility, branch
   protection or any repository setting.
2. *TUN-117 open question 2: must the Jukebox's Faber-derived accompaniment be replaced before the
   repository goes public?* — **A: no.** TUN-117 stays in Backlog, for after publishing. My reasoning
   at the checkpoint: replacing it first does not take it out of public view: the
   arrangement is in the git history either way, and rewriting history is out of this ticket's scope
   (decision of 2026-11-13: publish as it is). What changes is only whether the published `main` still
   plays it. I'd say **no — publish, and let TUN-117 land after**, as the owner's TUN-89 decision
   ("replace later") already reads.
3. *TUN-115 (the deploy identity can create a stronger Lambda role) is the one hardening ticket not done
   — must it land first?* — **A: no.** TUN-115 stays in Backlog. My reasoning at the checkpoint: it is
   not among TUN-103's blockers. The gap only matters to
   someone who already holds `mg-deploy`'s credentials (IAM Identity Center, on the owner's machine);
   publishing exposes the policy's text (`backend/README.md`, already describing the gap under *Its
   limits*), not the credentials. I'd say **no — publish, and keep TUN-115 in Backlog.**
4. *The PR review's budget is spent (three rounds, `work-ticket` § 8): round 3's fixes are not reviewed by
   GPT. Accept them and merge, or ask for a fourth round?* — **open.** No finding is disputed: every
   finding of all three rounds was agreed and fixed. Round 3's fixes touch only this record and the
   scan behind it — no doc a player or contributor reads. I'd say **accept and merge**.

## Choices I made that you might overrule

1. **Do not allow bypassing** (C1). Every session pushes as `pad29`, your admin account. Without this
   box, protection does not apply to admins, so a session's stray `git push origin main` would still
   go through and deploy. With it, the rule binds every account, yours included: an ordinary direct push
   to `main` is refused, and a change reaches it through a pull request whose check passed. In an
   emergency you can untick it for a minute.
2. **Branches need not be up to date before merging** (C1). Ticked, every merge would force every open
   PR to merge `main` again — a new head, and a new GPT review under `CLAUDE.md` § Cost. Sessions
   already merge a fresh `origin/main` before opening a PR.
3. **A classic branch protection rule, not a ruleset** — the ticket's verification reads the classic
   endpoint.

## Tests

No code changed. **1030/1030 tests and the syntax check pass** locally on `835cf28` (after merging
`origin/main` at `a56e55d`, which had not moved), and again on the commits answering rounds 1, 2 and 3; *Checks*
runs on each pushed head. **Which scan ran when:**
- **Before its push, with the patterns of its time:** `05fdd5d`/`12fa98b` and `835cf28` with the first
  patterns; `581e930` with round 1's (*The expanded scan*); the commit answering round 2 with round 2's
  (*PR review — round 2*); the commit answering round 3 with the final patterns. In each, the only
  **new** matches were this record quoting itself (the first, over the whole history, also met the
  five known fixture occurrences). **Not** `f69301d` (the owner's
  answers): it was pushed unscanned while the repository was still private, and the re-scan before the
  click covered it.
- **Retrospectively:** round 1's patterns over the first, pre-click and post-publishing snapshots; round
  2's over all four snapshots, `581e930` included. No unexplained match in any.

*After publishing* items 1–3 and 5 are verified above. **Still unverified:** a
session opening a new PR under the protection, and the owner's merge under it (item 4).
