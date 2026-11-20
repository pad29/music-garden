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

**The live backend matches `main`:** `git diff a23ac09 origin/main -- backend/` touches only
`backend/README.md`, so the stack the owner last deployed carries every backend change on `main`.

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

**Patterns — strict, run on every blob, binary included:**

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

**Patterns — loose, text blobs and commit messages only, every hit read by hand** (case-insensitive):

| Name | Regex |
|---|---|
| AWS secret key assignment | `aws.{0,20}secret.{0,20}[:=]\s*['"]?[A-Za-z0-9/+]{40}\b` |
| Cloudflare token assignment | `(?:cf\|cloudflare)[_-]?(?:api)?[_-]?(?:token\|key)\s*[:=]\s*['"]?[A-Za-z0-9_-]{30,}` |
| Generic secret assignment | `\b(?:password\|passwd\|secret\|api[_-]?key\|access[_-]?token\|auth[_-]?token\|client[_-]?secret)\b["']?\s*[:=]\s*["'][^"'\s]{8,}["']` |
| Credentials in a URL | `\b[a-z][a-z0-9+.-]*://[^/\s:@"'<>]+:[^/\s:@"'<>]+@[^\s"'<>]+` |

**File names ever committed**, checked against
`(^|/)(\.env(\..*)?|id_[rd]sa|id_ecdsa|id_ed25519|credentials|\.npmrc|\.netrc|.*\.(pem|key|p12|pfx|jks|keystore|tfstate|ppk))$`
over all 643 paths in those commits.

**Positive control:** the same script on a throwaway repository holding AWS's documented example key
(`AKIA` followed by `IOSFODNN7EXAMPLE`; split here so this record does not match its own scan), an `OPENSSH PRIVATE KEY` header, a `ghp_` token and a `password = "…"` line
reported all four.

**Result: nothing.** No strict hit; no risky file name. The loose patterns' 5 hits are one test fixture
in five versions of `tests/backend-handlers.test.mjs` and `tests/backend-presignup.test.mjs` —
`SECRET = "arn:aws:dynamodb:us-east-1:123456789012:table/SECRET-internal"`, a fake ARN in AWS's
documentation account. The only AWS account IDs anywhere in history are AWS's documentation examples
(`123456789012`, `444455556666`, `1111-2222-3333`). `backend/samconfig.toml` holds the stack name and
region, no credentials.

**Commit identities:** authors and committers are `pavel.dmitriev@gmail.com` (accepted by the owner,
2026-11-13) and `noreply@github.com`; co-author trailers are only `noreply@anthropic.com`.

**Also scanned — the GitHub issues and pull requests, which go public too:** 116 issues and 45 PRs —
titles, bodies, comments and reviews, 566 texts (authors `pad29`, `linear-code`, `netlify`,
`cloudflare-workers-and-pages`) — with the same patterns, plus email addresses and machine paths.
No credential. The 34 JWTs are Netlify's QR-code image tokens in its old deploy-preview comments;
each payload is only `{"url":"https://deploy-preview-<n>--tunegarden.netlify.app"}`. Emails:
`conduct@tunegarden.game` and the `owner@example.org` test placeholder only. Machine paths: AO worktree
paths (`C:/Users/pavel/.ao/…`) in 13 PR comments and 2 issue bodies, and AO's project checkout path in
issue #119 and a PR #151 comment — the same kind `reviews/` keeps.

**The scan, again — this PR's head.** Before its first push, the same script ran over all 91 remote
refs plus this branch's commits: nothing new. Besides the same five fixture hits, it matched only this
record quoting itself — `PuTTY-User-Key-File` in the pattern table, and the fixture's `SECRET = "arn:…"`
line quoted above. Its PR head is therefore covered too; any later head is re-scanned under step A1.

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

## After publishing — this session verifies (not yet run)

1. `gh api repos/pad29/music-garden/branches/main/protection`: `required_status_checks.contexts` is
   exactly `["Syntax check and tests"]` with `strict: false`; `required_pull_request_reviews` present
   with `required_approving_review_count: 0`; `enforce_admins.enabled: true`;
   `allow_force_pushes.enabled: false`; `allow_deletions.enabled: false`.
2. `gh api repos/pad29/music-garden` → `visibility: "public"`, the description, `homepage` and topics;
   `security_and_analysis.secret_scanning` and `…secret_scanning_push_protection` `enabled`;
   `gh api repos/pad29/music-garden/private-vulnerability-reporting` → `enabled: true`;
   `…/actions/permissions/fork-pr-contributor-approval` → `first_time_contributors` (or stricter);
   `…/actions/permissions/workflow` still `read`.
3. Anonymous access: the repository page and `SECURITY.md`'s advisory link answer without signing in.
4. **An agent session can still push its own branch and open a PR:** this session pushes the docs fix
   below to this PR's branch, and the PR's *Checks* run. **The owner can still merge one:** this PR,
   when the owner merges it, is the proof — it needs `Syntax check and tests` green and no approval.
   This session never pushes `main` to "test" the protection: if the rule were wrong, that push would
   deploy.
5. **The docs:** `CLAUDE.md:137` in the present tense ("The repository is public: anyone can open…"),
   the branch-protection settings recorded where the deploy rules live, and `README.md` § Current status
   reconciled — in this PR.

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

## Choices I made that you might overrule

1. **Do not allow bypassing** (C1). Every session pushes as `pad29`, your admin account. Without this
   box, protection does not apply to admins, so a session's stray `git push origin main` would still
   go through and deploy. With it, nobody — you included — pushes to `main` except by a merged PR whose
   check passed. In an emergency you can untick it for a minute.
2. **Branches need not be up to date before merging** (C1). Ticked, every merge would force every open
   PR to merge `main` again — a new head, and a new GPT review under `CLAUDE.md` § Cost. Sessions
   already merge a fresh `origin/main` before opening a PR.
3. **A classic branch protection rule, not a ruleset** — the ticket's verification reads the classic
   endpoint.

## Tests

No code changed; the suite was not needed for a reviews file and is run before the PR goes for review.
**Unverified until the owner publishes:** every item under *After publishing*.
