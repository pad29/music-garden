# TUN-92 — Write the contributor guide, code of conduct and security contact

Branch `ao/contributor-guide/root` · size **M** (label and § Size agree) · `needs-owner`

## Plan (Claude)

Measured on `origin/main` c37f39c. Already merged and only linked, never restated: TUN-89 (`LICENSE`,
`LICENSE-CC-BY-SA.md`, `CREDITS.md`), TUN-98 (README opening — its **Contribute** line and § Dev workflow
already link `CONTRIBUTING.md` by name), TUN-105 (`MAKING-QUESTS.md`, which deferred its pointer to
`CONTRIBUTING.md` to this ticket — `reviews/TUN-105-make-a-quest-guide.md`, finding 10). TUN-91 (how
agents treat outside pull requests) runs next: this ticket says what a contributor **sees**, never what an
agent does. No edit to `CLAUDE.md` or `.claude/`.

### What a newcomer faces

A visitor who wants to help finds a README that sends them to a `CONTRIBUTING.md` that does not exist,
600 KB of design docs, and an agent workflow they are told they do not need — and nothing on how to propose
a change, whether a level idea is welcome, the sign-off, what happens to their pull request, or where to
report a security hole without making it public.

### Files

1. **`CONTRIBUTING.md`** (new, ~150 lines, second person, short sections):
   1. *What Tune Garden is* — two sentences, link to the README; "you need Node.js 22.15+ and Git; nothing
      to install".
   2. *Run it and test it* — clone; open `index.html` or `npx http-server -p 8377 -c-1 .`; `?dev`;
      `node tools/check-syntax.mjs`; `node --test "tests/*.test.mjs"`; the expected result (all pass,
      one Windows-only skip on other systems). Commands copied verbatim from `AGENTS.md` § Commands.
   3. *Where to read, by kind of change* — a short table: a bug in a level → README § How the game's code
      is organized + `PACKAGES-DETAILED.md`; a quest → `MAKING-QUESTS.md`; a test → `tests/README.md`;
      songs and links → `SAVE-SHARE.md`; samples, fonts, credits → `CREDITS.md`, `vendor/README.md`;
      the backend → `backend/README.md`. Says plainly that `CLAUDE.md`, `.claude/` and `reviews/` are the
      agents' and can be ignored.
   4. *Rules the code must keep* — the `AGENTS.md` hard invariants in plain words (works from `file://`;
      no third-party requests; never hand-edit generated files; never rename level/package IDs; famous
      melodies never rewritten; toolbox per package; backend refuses what it does not know; new asset
      folders go in the build), with a link to `AGENTS.md` § Hard invariants as the authority.
   5. *Proposing a change* — GitHub issues are where to start (the project tracks work in Linear, which
      mirrors to GitHub issues; the owner decides what is worked on and when). A bug fix may go straight
      to a pull request; anything larger opens an issue first and waits for a yes. **What is in scope at
      first — open question 2.** Comment on an issue before starting it, so two people don't do it.
   6. *The sign-off* — every commit carries `Signed-off-by: Name <email>` (`git commit -s`), certifying the
      [Developer Certificate of Origin](https://developercertificate.org/); no contributor agreement.
      Contributions come in under the project's licences — link to `CREDITS.md` § Licences at a glance,
      no restating.
   7. *What happens to your pull request* — the *Checks* workflow runs the syntax check and the tests
      (a first-time contributor's run waits for the owner to approve it); Cloudflare builds **no preview
      for a pull request from a fork**, so the owner plays it locally; the owner reviews, and may have the
      project's AI reviewer read the change too — you need no AI tool, account or workflow file, and the
      owner decides what is asked of you; the owner playtests anything you can hear or see. Nothing about
      what agents may run — that is TUN-91.
   8. *What you cannot do yourself* — narration clips (`tools/gen-voice.mjs` needs the owner's AWS
      account: change the text, say so in the PR, never touch `voice/`); deploying the backend; famous
      melodies (score-checked; a new one needs a real score and a `CREDITS.md` row, and is never
      rewritten by ear); the musical judgment of a level or quest.
   9. *Who merges* — only the owner; `main` deploys https://tunegarden.game on every push.
   10. *Conduct and security* — one line each, linking the two files.
2. **`CODE_OF_CONDUCT.md`** — Contributor Covenant 2.1, verbatim from contributor-covenant.org, with only
   the `[INSERT CONTACT METHOD]` placeholder filled (**open question 1**). Its text is CC BY 4.0, not the
   project's: `CREDITS.md`'s "Quotations inside the docs … stay their owners'" list gains one bullet
   naming it (the only `CREDITS.md` change).
3. **`SECURITY.md`** — report privately through GitHub's private vulnerability reporting (the *Report a
   vulnerability* button under *Security*, link to `…/security/advisories/new`), never in a public issue;
   what is in scope (the site, the backend API, sign-in, the shared-song links) and what to include; that a
   one-person project answers on a best-effort basis (no promised SLA); the fallback address from
   **open question 1** if the button is unavailable. Private vulnerability reporting is turned on at
   publishing (TUN-103's checklist), so the file says nothing about that order.
4. **`.github/ISSUE_TEMPLATE/`** — issue forms `bug.yml` (what happened, steps, browser/device, level)
   and `idea.yml` (what the player would experience; which kind: fix / quest / level or package / other),
   and `config.yml`: `blank_issues_enabled: false`, contact links to the security advisory form and to
   `CONTRIBUTING.md`.
5. **`.github/pull_request_template.md`** — the issue it answers; what changes for the player; checks
   run (syntax check, tests, browser, `file://` if assets); the sign-off reminder; anything that needs
   the owner (narration clips, backend deploy).
6. **Pointers:**
   - `README.md`: extend the existing **Contribute** line to name `CODE_OF_CONDUCT.md` and `SECURITY.md`
     (no parallel list — TUN-98's request); one repository-map row for the three new files; the
     `.github/workflows/checks.yml` row becomes a **`.github/`** row (the workflow as now, the issue and
     PR templates, `screenshot.png` — TUN-98 left this row to this ticket).
   - `AGENTS.md` § Where to find things: **one pointer line** — "How a person contributes, the code of
     conduct and security reports → `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`
     (`CONTRIBUTING.md` restates § Commands and § Hard invariants in plain words: change it with them)".
     Nothing in § What "done" means — the owner's instruction is a pointer only; the drift test below
     carries what that entry would have.
   - `MAKING-QUESTS.md`: the deferred pointer — in the opening's "Before you start, open an issue" and in
     § 11's last line (which today says "See `AGENTS.md` for the project's rules"), naming the sign-off.
     Also correct its "Node.js (any current version)" to 22.15+, which the suite needs (`AGENTS.md`).
   - `tests/README.md`: one line for the new test file.

### Tests — `tests/contributing.test.mjs`

1. Every relative link in `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, the PR template and the
   issue forms resolves to a file, and every `#anchor` to a heading in it.
2. The commands `CONTRIBUTING.md` gives (syntax check, test run, serve) appear verbatim in `AGENTS.md`
   § Commands, and its Node minimum matches `AGENTS.md`'s — a changed command fails here, not in a
   newcomer's terminal.
3. `CONTRIBUTING.md` links `AGENTS.md` § Hard invariants, and names one plain-word rule per invariant
   bullet — count match, so a new invariant fails the test until the guide says it.
4. `CODE_OF_CONDUCT.md` is Contributor Covenant 2.1 byte for byte once the contact is put back to the
   placeholder (SHA-256 pinned, as `licences.test.mjs` pins `LICENSE`); the contact is filled.
5. The same contact appears in `SECURITY.md` as its fallback; `SECURITY.md` links the advisory form.
6. The PR template asks for `Signed-off-by` and both check commands; `config.yml` disables blank issues
   and links the advisory form; each form has a name, description and body.
7. README's **Contribute** line links all three files; `AGENTS.md` has the pointer; `MAKING-QUESTS.md`
   links `CONTRIBUTING.md`.

Whole suite, syntax check (unchanged scripts, but run). No browser check — no file the page loads
changes; the rendered Markdown is checked on GitHub's preview of the pushed branch.

**Cold-reader check:** GPT (`ask.sh fresh workspace-write`), given only `CONTRIBUTING.md`'s path and told
to act as a newcomer: clone this branch into a scratch folder, follow the guide to a passing test run,
and list every step where it had to guess. I then follow it literally myself on a fresh clone. Both go
into this file.

### Risks

- **Drift**: `CONTRIBUTING.md` restates commands and invariants. Mitigated by tests 2–3 and the
  `AGENTS.md` pointer's clause.
- **Overlap with TUN-91**: kept to what a contributor sees; no rule about checking out or running code.
- **A dead contact**: an alias that is not yet set up would swallow reports — the owner creates it
  before publishing (TUN-103); the hand-off says so.
- **Linear sync**: these docs' issue forms shape the GitHub issues Linear mirrors; forms render as
  Markdown headings in the body, which Linear shows as-is.
- The DCO is asked for, not enforced (CI is out of scope); the owner checks it at review. GitHub's
  "require sign-off on web-based commits" setting would help — a note for TUN-103, not this ticket.

### Questions only the owner can answer

*As first framed, and as GPT reviewed them. GPT's findings 1, 3 and 9 changed them: the questions put to
the owner are under* Owner's decisions *below.*

1. **The contact for conduct and security reports.**
   **A)** a forwarding alias on the project's domain — e.g. `conduct@tunegarden.game` — set up with
   Cloudflare Email Routing (the domain's nameservers are already Cloudflare's; free; forwards to any
   inbox, the owner's address never shown). Security goes through GitHub's private reporting first, the
   same alias as fallback. · **B)** two aliases, `conduct@` and `security@`. · **C)** GitHub only: no
   email; conduct reports by GitHub's private reporting too (it is meant for vulnerabilities, so this
   bends it). · **D)** the owner's personal address. **I'd pick A**: one address to watch, private, and
   it outlives any change of inbox.
2. **What outside contributors may propose at first.**
   **A)** fixes, quests, tests and docs by pull request; new levels and packages as **issues only** —
   ideas welcome, a pull request only when the owner invites one. · **B)** anything, issue first.
   · **C)** fixes only, quests included once the first few have gone well. **I'd pick A**: a quest is
   data, checked by `tools/quest-catalog.mjs` and the guide; a package needs narration clips (the owner's
   AWS), a backend change deployed first (`validate.mjs`), the difficulty-ramp doctrine and the owner's
   musical judgment — work a newcomer cannot finish alone.
3. **The guide's voice.** **A)** plain and warm, second person, short sentences — the voice of
   `MAKING-QUESTS.md`, so the two read as one. · **B)** neutral and formal, like most project
   guides. · **C)** playful, in the game's own voice. **I'd pick A.** A sample of A:

   > Thanks for wanting to help. Tune Garden is a small project with one owner, so here is how to make
   > your time count: open an issue before anything bigger than a bug fix, and wait for a yes. The owner
   > decides what ships, and playtests everything a child would hear or see.

## Design review (Astra)

`ask.sh fresh read-only gpt-6-astra`, 2026-11-19, on the plan above (origin/main c37f39c + this file).

<details><summary>GPT's design review, verbatim</summary>

1. **High — The recommended contact option makes a false privacy promise.** Question 1A says Cloudflare Email Routing means “the owner’s address never shown.” Replies sent from the destination inbox expose that address; forwarding alone provides no outbound alias. This materially misinforms the owner’s choice. **Instead:** distinguish receiving from replying, remove the guarantee, and require a verified reply configuration before claiming address privacy. [Cloudflare’s documented limitation](https://developers.cloudflare.com/email-service/reference/postmaster/#sending-or-replying-to-an-email-from-your-cloudflare-domain).

2. **High — The proposed security-report link targets a repository file, not GitHub’s reporting endpoint.** In `SECURITY.md`, `./security/advisories/new` is a relative document link. GitHub resolves such links within the repository’s file tree. Test 1 would also reject it because no corresponding file exists. **Instead:** use `https://github.com/pad29/music-garden/security/advisories/new` consistently, distinguish website routes from local document links in tests, and record an external-contributor check after TUN-103 enables reporting. [GitHub relative-link behavior](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax#relative-links).

3. **Medium — The contact options contradict the implementation and test contract.** Question 1B offers separate conduct/security addresses, but test 5 requires the same contact. Option C removes email entirely, while `SECURITY.md` requires an email fallback. C also routes harassment reports into a vulnerability-advisory workflow that requests technical vulnerability information and creates advisory collaboration/credit records. **Instead:** validate each document against the owner’s selected contact arrangement, without requiring equality. Offer a suitable private conduct channel; do not present vulnerability reporting as a general private mailbox. [GitHub’s reporting workflow](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/report-privately).

4. **Medium — The cold-reader experiment is neither isolated nor sufficiently reproducible.** `ask.sh fresh workspace-write` starts a fresh conversation, but `AGENTS.md` still supplies the commands and invariants being tested. The wrapper also conditionally loads AWS credentials. “Clone this branch” does not specify how the reader obtains the branch containing the guide; following the eventual public clone command would initially retrieve `main`, which lacks it. The author’s subsequent run is useful verification, but not independent comprehension evidence. **Instead:** provide an exact candidate revision as test setup, use a reader without injected project instructions or owner credentials, and record environment, assistance, guesses, exits and skips. Revise the guide and repeat affected steps. If isolation is unavailable, explicitly qualify the result.

5. **Medium — The invariant-count test cannot establish the promised drift protection.** Removing the asset cache-rule requirement, changing the backend deployment order, or replacing a rule with unrelated prose leaves the bullet count unchanged. Conversely, splitting one rule into two bullets breaks it harmlessly. The plan also lists eight rules together while the ninth—owner-only merging—appears elsewhere. **Instead:** use an explicit coverage checklist with individually identified obligations and human review of their meaning. Any automated guard should demonstrate that deleting an obligation fails. Preserve the substantive details: `_headers` cache rules, validator changes and backend-first deployment, vendoring/hash requirements, and cloud-request exceptions.

6. **Medium — The issue-form checks can pass forms GitHub will not display.** Having `name`, `description` and `body` does not establish valid YAML or a valid GitHub form. A malformed body, unsupported field type, or missing field attributes can satisfy that test. Checking rendered Markdown on a pushed branch does not exercise the issue chooser: templates and `config.yml` become active from the default branch. **Instead:** validate the actual supported form structure and test rendering in an appropriate staging repository, or leave activation verification explicitly pending. Simpler Markdown issue templates would also meet the ticket without introducing a form-schema validator. [GitHub’s template requirements and activation rules](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/configuring-issue-templates-for-your-repository).

7. **Medium — The setup requirements and expected result are inaccurate.** “Node.js 22.15+” includes unsupported Node 23.0–23.4; the repository explicitly requires 22.15+ **or 23.5+**. The promised single non-Windows skip also assumes Bash is available: workflow and publication tests skip additional cases without it. “Nothing to install” obscures that the optional `npx http-server` route may download a package. **Instead:** recommend Node 24, matching CI; document Bash/Git Bash for full verification; distinguish no project dependency installation from the optional server download; and explain skip reasons without freezing their count. Apply the same version correction to `MAKING-QUESTS.md`.

8. **Medium — The guide omits important author responsibilities while concentrating on owner review.** The planned reading path has no entry for product/design changes, package architecture, editor work or playback scheduling. The contribution steps omit updating affected design documents, rebuilding sample packs, and capturing playback goldens before and after scheduler changes. These are existing completion requirements, not agent machinery. **Instead:** add a compact change-specific checklist linking the owning documents and procedures. Keep narration generation and backend deployment with the owner, but distinguish those from checks and documentation contributors must supply.

9. **Low — The contribution-scope question mixes independent policy choices.** Option A allows fixes directly by PR, while B says “anything, issue first,” implicitly changing the bug-fix exception. C’s “fixes only” also appears to exclude tests and documentation. The justification groups new levels with new packages, although a level in an existing package does not inherently require a new backend allowlist entry. **Instead:** hold the established bug-fix exception constant and ask separately whether quests, levels within existing packages, and new packages are eligible for implementation after owner approval.

What the plan gets right:

- Keeps `CLAUDE.md` and `.claude/` untouched and limits `AGENTS.md` to a pointer.
- Preserves TUN-98’s contribution entry and supplies the deferred reciprocal quest-guide links.
- Uses per-commit DCO sign-off without adding a contributor agreement or expanding CI.
- Correctly anticipates first-time workflow approval and absent Cloudflare fork previews. [GitHub](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/approve-runs-from-forks), [Cloudflare](https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/).
- Keeps owner contact, contribution scope and tone open for the required design checkpoint.

</details>

## My answers

Every finding is agreed, at least in part; the plan is built as amended here.

1. **High — the contact's privacy promise. Agreed.** Cloudflare Email Routing only receives: a reply sent
   from the inbox it forwards to shows that inbox's address. The question now says so, and adds a real
   mailbox on the domain as the option that keeps replies private too.
2. **High — the advisory link. Agreed.** A relative `security/advisories/new` resolves inside the file
   tree. `SECURITY.md`, `config.yml` and `CONTRIBUTING.md` use the absolute
   `https://github.com/pad29/music-garden/security/advisories/new`; the link test checks relative links
   only, as `licences.test.mjs` does. Whether the button works is checked once TUN-103 turns reporting
   on — the hand-off and TUN-103 get that line.
3. **Medium — the contact options against the tests. Agreed.** GitHub's private reporting is a
   vulnerability workflow and no channel for conduct: that option is dropped. Test 5 becomes "each file
   names the contact the owner chose", not "the same contact".
4. **Medium — the cold reader. Agreed in part.** Run `ask.sh` from an empty scratch folder outside any
   repository, so codex starts with no `AGENTS.md`; the prompt gives only the exact revision —
   `git clone <this worktree> <scratch>/music-garden && git checkout <sha>` — and the guide's file name,
   and asks for its environment (OS, Node, Bash), every command and its exit, every skip and its reason,
   and every place it guessed. Not reachable: `ask.sh` loads its Polly-only AWS credentials on every
   workspace-write call, and I keep source edits out of `ask.sh`; the prompt forbids the regenerators
   and the record says the reader held credentials it was told not to use. My own literal run on a fresh
   clone is recorded as verification, not as a cold reading. The guide is revised and the changed steps
   re-run.
5. **Medium — the invariant-count test. Agreed.** Replaced by an explicit map in the test: each
   `AGENTS.md` hard-invariant bullet, identified by its opening words, → the phrases `CONTRIBUTING.md`
   must carry for it (the cache rule in `_headers`; `validate.mjs` and backend-first; vendoring and
   `SHA256SUMS`; the cloud-API and backend/Cognito exceptions; owner-only merging). A new or reworded
   invariant fails the test until a person updates the map and the guide; a mutation case deletes one
   obligation from the guide and requires the failure.
6. **Medium — issue forms. Agreed.** Plain Markdown templates (`bug.md`, `idea.md`, front matter
   `name`/`about` only) instead of YAML forms — they meet the ticket with no schema to validate. Templates
   and `config.yml` become active only from `main`, so the issue chooser is an owner check after merge,
   listed as pending.
7. **Medium — setup and the expected result. Agreed.** "Node.js 24, as CI runs; at least 22.15 on 22, or
   23.5+"; Git Bash on Windows for the full suite (without Bash, the workflow-script and publish tests
   skip and say why); `npx http-server` downloads a small server the first time, and double-clicking
   `index.html` needs nothing; skips explained, never counted. `MAKING-QUESTS.md`'s "any current version"
   gets the same correction.
8. **Medium — author responsibilities. Agreed.** A short "if you change X, also do Y" list, one line each,
   linking the owning doc: design docs updated (`DESIGN.md`, `PACKAGES*.md`, `SAVE-SHARE.md`,
   `QUESTS.md`); a sample pack → `tools/build-samples.mjs` and a `CREDITS.md` row; scheduler code →
   playback goldens before and after (`tools/goldens/README.md`); assets → test `file://` too. The
   reading path gains the design docs (`DESIGN.md`, `PACKAGES.md`, `EDITOR-DESIGN.md`). Narration clips
   and backend deploys stay the owner's.
9. **Low — the scope question. Agreed.** The bug-fix exception is now constant (fixes, tests and docs go
   straight to a pull request), and the question asks only which larger kinds a contributor may *build*
   after the owner's yes on an issue: quests, levels inside an existing package, new packages. The
   validator knows package IDs, not level IDs (`backend/src/validate.mjs`), so a level needs no backend
   change — but it does need a narration clip and a place in its package's difficulty ramp.

## Owner's decisions

Answered by the owner through the orchestrator (AO session `music-garden-5`), 2026-11-19: **1A, 2C, 3A**.

1. *Design checkpoint (`needs-owner`)* — **build it per the plan as amended by** *My answers*.
2. *The contact for conduct reports, and the fallback for security reports* (security goes through
   GitHub's private reporting first either way) — **A: `conduct@tunegarden.game`**, a Cloudflare Email
   Routing forwarding alias; security reports through GitHub's private reporting first, the alias as
   fallback; the owner's personal address is never published. The alias must exist before the repository
   goes public (owner's note for TUN-103's checklist).
   **A)** one forwarding alias on the domain, e.g. `conduct@tunegarden.game`, by Cloudflare Email Routing
   (free; the domain is already on Cloudflare). Reports reach your inbox without your address being
   published, but a reply from that inbox shows your address unless you also set up sending as the alias.
   · **B)** a real mailbox on the domain from a mail provider: receive and reply as the alias; more setup,
   possibly a fee. · **C)** two aliases, `conduct@` and `security@`, as A. · **D)** your personal
   address. **I'd pick A** to start, replying from your own address only when you choose to; **B** if
   replies must never show it.
3. *What a contributor may build after your yes on an issue* (bug fixes, tests and docs go straight to a
   pull request in every option) — **C: quests, levels and packages**, against my pick of A. The guide says honestly what a contributor can and cannot do alone in each case: the contributor proposes and builds the content; the owner makes the narration clips (AWS) and deploys any backend change; the owner decides what ships.
   **A)** quests only; levels and packages welcome as ideas in issues. · **B)** quests and new levels in
   an existing package; new packages as ideas only. · **C)** all three. **I'd pick A** at first: a quest
   is data, checked by `tools/quest-catalog.mjs` and `MAKING-QUESTS.md`; a level needs a narration clip
   from your AWS account and a place in its package's ramp, and a package also a backend change deployed
   first. Widen it once the first contributions have gone well.
4. *The guide's voice* — **A: plain and warm.** **A)** plain and warm, second person, short sentences — as
   `MAKING-QUESTS.md` (sample above) · **B)** neutral and formal · **C)** playful, the game's own voice.
   **I'd pick A.**

**Does 2C change the plan materially?** No — it was one of the plan's options, and the plan's structure
holds: § 5 of `CONTRIBUTING.md` says all three kinds may be built after a yes, and § 8 (*What you cannot
do yourself*) gains one line per kind. So no revised plan and no second GPT design review (`resume.md`,
*Continuing*, step 2); the PR review sees the result.

## Cold-reader check

**GPT (Astra), `ask.sh fresh workspace-write`, on `9482c63`, 2026-11-19.** Started in an empty scratch
folder outside every repository, so codex loaded no `AGENTS.md`; told to clone the exact revision from
this worktree's path, follow only `CONTRIBUTING.md`, and keep out of `AGENTS.md`, `CLAUDE.md`, `.claude/`
and `reviews/`. Two qualifications: `ask.sh` loaded its Polly-only AWS credentials (the prompt forbade
using them, and the report shows none used), and it ran on the owner's Windows machine, as the same
user family, in PowerShell. The first attempt never started — codex refuses a folder that is not a git
repository and `ask.sh` does not pass `--skip-git-repo-check` — so the scratch folder was made an empty
repository (still no `AGENTS.md`) and the call made once more.

<details><summary>GPT's cold-reader report, verbatim</summary>

**Verdict: yes for the automated checks, with Windows onboarding gaps.** At the requested revision, the guide’s exact syntax and test commands passed. The optional server command failed in PowerShell. Browser play was not tested, as requested. No project files were changed.

**1. Environment**

| Item | Observed |
|---|---|
| OS | Windows NT `10.0.26300.0` |
| Shell | Windows PowerShell `5.1.26100.9818`, Desktop edition |
| Node | `v24.15.0` |
| Git | `git version 2.56.1.windows.1` |
| Bash | Found at `C:\Git\usr\bin\bash.exe` |
| Revision | `9482c6370a7af9141f847e95d084fda59e6f7cab` |

The initial clone failed because the source repository belonged to a different Windows account. A command-scoped trust exception for the exact source path allowed cloning. This was a complication of the supplied local setup, not a contributor-guide defect.

**2. Every command run**

Folder abbreviations:

- **S:** `C:\Users\pavel\AppData\Local\Temp\tun92-cold`
- **R:** `C:\Users\pavel\AppData\Local\Temp\tun92-cold\music-garden`

I used the command tool’s working-directory setting to enter **R**, rather than issuing a separate `cd` command. Independent inspection commands were sometimes batched; the server, syntax check and test commands were launched in the guide’s order.

| # | Command | Folder | Exit | Output excerpt or result |
|---|---|---|---|---|
| 1 | `git clone C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-42 music-garden` | S | 1 | `fatal: detected dubious ownership in repository...` |
| 2 | `git -c safe.directory=C:/Users/pavel/ao/projects/music-garden/.git/worktrees/music-garden-42 clone C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-42 music-garden` | S | 0 | `done.` |
| 3 | `git checkout 9482c6370a7af9141f847e95d084fda59e6f7cab` | R | 0 | `HEAD is now at 9482c63 Tell a newcomer how to contribute, how to behave, and how to report a hole` |
| 4 | `Get-Content CONTRIBUTING.md` | R | 0 | `# Contributing to Tune Garden` — non-ASCII punctuation displayed incorrectly. |
| 5 | `[System.Environment]::OSVersion.VersionString; $PSVersionTable \| Format-List PSVersion, PSEdition; Get-Command bash -ErrorAction SilentlyContinue \| Format-List Source` | R | 0 | `Microsoft Windows NT 10.0.26300.0`; Bash path printed; shell-version fields did not. |
| 6 | `node --version` | R | 0 | `v24.15.0` |
| 7 | `git --version` | R | 0 | `git version 2.56.1.windows.1` |
| 8 | `npx http-server -p 8377 -c-1 .` | R | 1 | `npx.ps1 cannot be loaded because running scripts is disabled on this system.` |
| 9 | `Get-Content -Encoding UTF8 README.md` | R | 0 | `# 🌱 Tune Garden` |
| 10 | `node tools/check-syntax.mjs` | R | 0 | `syntax OK (29 scripts: ...; vendored: vendor/cognito/amazon-cognito-identity.min.js)` |
| 11 | `node --test "tests/*.test.mjs"` | R | 0 | `ℹ tests 1024` — complete summary below. |
| 12 | `Get-Content -Encoding UTF8 CONTRIBUTING.md` | R | 0 | `# Contributing to Tune Garden` — punctuation now readable. |
| 13 | `Get-Content -Encoding UTF8 SECURITY.md` | R | 0 | `# Security` |
| 14 | `Get-Content -Encoding UTF8 .github/pull_request_template.md` | R | 0 | `**The issue it answers:** #` |
| 15 | `rg --files .github/ISSUE_TEMPLATE` | R | 0 | Listed `idea.md`, `config.yml`, and `bug.md`. |
| 16 | `[Console]::WriteLine(('PowerShell {0}; edition {1}' -f $PSVersionTable.PSVersion, $PSVersionTable.PSEdition))` | R | 0 | `PowerShell 5.1.26100.9818; edition Desktop` |
| 17 | `Get-Content -Encoding UTF8 .github/ISSUE_TEMPLATE/bug.md` | R | 0 | `name: Bug` |
| 18 | `Get-Content -Encoding UTF8 .github/ISSUE_TEMPLATE/idea.md` | R | 0 | `name: Idea` |
| 19 | `Get-Content -Encoding UTF8 .github/ISSUE_TEMPLATE/config.yml` | R | 0 | `blank_issues_enabled: false` |
| 20 | `Get-Content -Encoding UTF8 MAKING-QUESTS.md` | R | 0 | `# Making a quest` |
| 21 | `Get-Content -Encoding UTF8 tests/README.md` | R | 0 | Explained the built-in runner, test harness and browser limitations. |
| 22 | `rg -n '^##\|^###\|narrat\|owner\|commit\|test\|AGENTS\|CLAUDE\|review' MAKING-QUESTS.md` | R | 0 | `12:**Before you start, open an issue.**` |
| 23 | `Get-Content -Encoding UTF8 PACKAGES-DETAILED.md -TotalCount 150` | R | 0 | `# Tune Garden — Detailed Package Specs (all shipped expansion packages)` |
| 24 | `Get-Content -Encoding UTF8 tests/README.md -TotalCount 135` | R | 0 | Described Linux/Windows checks and fake dependencies for shell tests. |
| 25 | `Get-Content -Encoding UTF8 CREDITS.md -TotalCount 85` | R | 0 | `# Credits and licences` |
| 26 | `Get-Content -Encoding UTF8 MAKING-QUESTS.md \| Select-Object -Skip 833` | R | 0 | `## 7. Checking it` — read through the PR instructions. |
| 27 | `rg -n '^##\|intro\|garden-basics\|two-new-colors\|sun-and-moon\|ways-home\|river-turns\|pull-of-the-moon\|false-doors' PACKAGES-DETAILED.md` | R | 0 | Included the pointer to `PACKAGES.md §6` for `two-new-colors`. |
| 28 | `rg -n -A 36 '^## Key conventions' README.md` | R | 0 | Included `After changing narration text`, followed by the generator command. |
| 29 | `git status --short` | R | 0 | No output: clean working tree. |

Some long document output exceeded the tool’s display limit; the targeted reads above recovered the relevant passages. Test-session polling retrieved output from the same run and did not launch additional commands.

The test run ended with:

```text
ℹ tests 1024
ℹ suites 0
ℹ pass 1024
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 203640.9887
```

**Skip reasons:** none; no tests skipped. The run did print `symlinks not permitted here; hard link only`, an informational coverage limitation rather than a skipped test.

**3. Where I guessed**

| Guide’s words | Uncertainty | What I did |
|---|---|---|
| “On Windows, install Git with **Git Bash**” | Does this mean run the instructions in Git Bash, or merely have Bash available for tests? | Used the supplied PowerShell shell, with Bash on PATH. The Node commands worked; `npx` was blocked by PowerShell’s execution policy. |
| “`npx http-server -p 8377 -c-1 .`” | What should a Windows contributor do when `npx.ps1` is blocked? | Recorded the failure and continued, as instructed. I did not switch shells, substitute `npx.cmd`, or change execution policy. |
| “and open http://localhost:8377” followed by “From the `music-garden` folder, run…” | If the server starts, should I stop it or open another terminal for tests? | This did not become an actual blocker because the server failed. A successful run would require an unstated terminal-management step. |
| “**Play it.** Open `index.html` directly…” | What constitutes a sufficient initial play check? No particular level, action sequence or expected result is specified. | I would open `index.html`, add `?dev`, start playing, choose a friend, place seeds and listen to playback. The guide explains how to launch and find shortcuts, but does not define a baseline smoke test. No browser was opened. |
| “**A bug fix, a test, or a docs correction:** open a pull request straight away” | How should I fill the PR template’s mandatory-looking “The issue it answers: #” without an issue? | For a hypothetical level bug fix, I would write “No issue; bug fix permitted by CONTRIBUTING §4.” The template does not say that. |
| “`AGENTS.md` is written for the agents too” and “if this list and that one ever differ, that one wins” | Can I rely on the contributor guide alone, or must I check another authority? | Relied on the contributor guide and did not open the excluded file. |

The initial PowerShell encoding problem was a reading-tool issue, not evidence of damaged documentation. Explicit UTF-8 decoding resolved it.

**4. Where I got stuck or would need a person**

- **Local cloning:** initially blocked by ownership. The narrowly scoped Git exception resolved it without changing global configuration.
- **Optional HTTP serving:** blocked by PowerShell’s execution policy. The guide supplied no remedy, but its direct-file alternative meant this did not block the automated checks.
- **Browser verification:** prohibited by this exercise, not blocked by the guide. I cannot certify appearance, interaction or audio.
- **New quest:** the owner’s approval is explicitly required before building. That is a clear, intentional dependency. The linked quest guide otherwise gives concrete extraction, validation, installation, playtest and PR instructions.
- **Level fix involving narration:** I would need the owner to generate clips. The README’s conflicting instruction makes the division of work less reliable.
- **Fixing an introductory or otherwise undocumented level:** I would need to locate or ask for its authoritative design specification; the advertised reference does not cover every shipped level.
- **No person was needed to obtain the passing automated test run.**

**5. Findings in the remaining guide, policy and templates**

Severity follows your definitions. These are documentation findings; I did not investigate implementation correctness.

| Severity | Location and quotation | Finding |
|---|---|---|
| **High** | CONTRIBUTING §6: “Write the text; the owner records it before merging.” README, Key conventions: “**After changing narration text**, run `node tools/gen-voice.mjs`” | **Conflicting narration responsibility.** A contributor following the linked README would attempt an owner-account operation that CONTRIBUTING delegates to the owner. Particularly relevant to a level-text fix. I followed CONTRIBUTING and your restriction; I did not run the generator. |
| **Medium** | CONTRIBUTING §§2–3: “the next section says them in plain words”; “if this list and that one ever differ, that one wins” | **The self-contained rules have an external override.** A newcomer cannot determine whether the restatement is sufficient without consulting the agent document or asking someone. The passing documentation tests offer reassurance, but do not remove the wording conflict. |
| **Medium** | CONTRIBUTING §2: “`PACKAGES-DETAILED.md` — every shipped level”; linked document: “all shipped expansion packages” and “The `two-new-colors` … level list lives in PACKAGES.md §6” | **The level-fix reading route overpromises coverage.** The linked document explicitly sends one package elsewhere and is scoped to expansion packages. Its headings also omit the README’s shipped `two-kinds-of-walking` package. The guide gives no corresponding route for introductory levels. |
| **Low** | `PACKAGES-DETAILED.md`: “Last updated: 2026-07-05 — all 14 expansion packages…”; later: “18 EXPANSION PACKAGES BUILT … as of 2026-07-13” | **The recommended reference has stale status text.** A newcomer must distinguish historical notes from current coverage. This matters when using the document to judge whether a level’s behavior is intentional. |
| **Medium** | CONTRIBUTING §4: “An existing issue you'd like to take: say so in a comment first”; also “wait for the owner's yes before you build it” | **Claiming existing work has an unclear approval boundary.** For an existing quest/feature issue, does commenting suffice, or must the owner explicitly approve this contributor taking it? I would ask before beginning substantial work. |
| **Medium** | CONTRIBUTING §7: “`git rebase --signoff main` fixes every commit on your branch” | **The bulk sign-off repair lacks prerequisites and recovery guidance.** It does not establish what local `main` should represent or explain what to do with conflicts or already-published commits. I would not treat this as an unconditional repair recipe. No history-changing command was run. |
| **Low** | PR template: “**The issue it answers:** #”; CONTRIBUTING §4: “An issue first is welcome but not needed.” | **The template lacks the documented no-issue option.** A legitimate bug-fix PR needs an invented placeholder or explanation. |
| **Low** | PR template: “Played it in a browser”; CONTRIBUTING §4 permits “a docs correction” | **Check applicability is unclear for non-runtime changes.** The template explains conditional direct-file testing, but not whether a docs-only PR may mark browser play as not applicable. |
| **Low** | Bug template: “the address you were on (tunegarden.game, a local copy, a file)” | **Local reproduction lacks a revision field.** The template asks for browser/device and location, but not the commit or branch of a local copy. Reports from different revisions could look identical. |
| **Medium** | SECURITY: “replies are on a best-effort basis”; “the advisory is published after that” | **No unanswered-report procedure.** The private reporting route and email fallback are clear, but the policy does not say when or how to follow up if there is no response, or how disclosure is coordinated in that case. This is a missing procedure, not a failed reporting attempt. |
| **Low** | Linked `tests/README.md`, historical A7/A8 record: “Outstanding source regression” and “is intentionally red” | **Historical failure language can be mistaken for current expectations.** The passage is under a migration record, but uses present tense. The actual requested revision passed all tests. |

The **Idea template was actionable** for a new quest: it asks for the musical idea, player experience, map placement and willingness to build, and explicitly requires approval. I found no additional contradiction in it.

The quest guide also resolves several potential questions well: what file to commit, what temporary JSON not to commit, whether new quest-specific tests are necessary, how to unlock and find the quest, and why quest text needs no recorded narration clips.

**6. Final assessment**

A newcomer with the documented prerequisites can reach **a passing automated test run** using the guide’s exact check commands: this run proved that on Windows with Node 24 and Bash available.

The guide does **not** provide a fully literal, frictionless Windows walkthrough: it leaves the shell choice and server-to-tests transition implicit, and its linked contribution guidance contains a significant narration conflict and incomplete level-reference routing. Browser behavior remains unverified.

No fixes, commits or pushes were made. The checkout is clean.

</details>

**My answers** — each fixed in `91d717a` unless marked:

- *Guess: Git Bash, or only bash on the PATH?* § 1 now says to run the commands in Git Bash on Windows;
  PowerShell may refuse `npx`.
- *Guess: the server and the tests in one terminal?* § 1: the server runs until Ctrl+C — use a second
  terminal.
- *Guess: what counts as a play check?* § 1 names one, in the game's own words: **▶ Start playing**,
  plant a few seeds as the first level says, **▶ Play**, hear them.
- *Guess: the PR template's issue line for a bug fix with no issue.* It now offers "none — a bug fix".
- *Guess: `AGENTS.md` "wins".* Agreed in part: the authority stays (the test keeps the two in step), and
  § 2 now says § 3 is all a contributor needs to read of `AGENTS.md`.
- **High — narration: README's convention said to run `gen-voice.mjs`.** Agreed: README § Key
  conventions now says it needs the owner's AWS account and a contributor leaves the clips to the owner.
- **Medium — "every shipped level" overpromises.** Agreed: the route now names `js/packages.js` and both
  spec homes, `PACKAGES-DETAILED.md` and `PACKAGES.md` § 6 (the intro, `two-new-colors`,
  `two-kinds-of-walking`).
- **Low — `PACKAGES-DETAILED.md`'s stale status lines** ("all 14", "18 … as of 2026-07-13"). Real, and out
  of scope: noted for the owner, not fixed here.
- **Medium — taking an existing issue: does a comment suffice?** Agreed: for anything larger than a bug
  fix, wait for the owner to say it's yours.
- **Medium — `git rebase --signoff main`.** Agreed: now `git rebase --signoff HEAD~3` (your count), and
  `git push --force-with-lease` to your own branch if the commits were already pushed.
- **Low — docs-only PRs and the browser box.** Agreed: "not needed for a docs-only change".
- **Low — the bug form has no revision field.** Agreed: a local copy gives `git rev-parse --short HEAD`.
- **Medium — no follow-up procedure in `SECURITY.md`.** Agreed: follow up after two weeks, in the report
  or by email; keep it private until fixed or until a date is agreed. No fixed disclosure deadline — that
  would be the owner's policy to set.
- **Low — `tests/README.md`'s A7/A8 record reads as present tense.** Out of scope: a historical section,
  not a contributor's path. Not changed.

**My literal run, on `91d717a`** — verification, not a cold reading: a fresh `git clone` of this worktree,
Git Bash, Node v24.15.0; `npx --yes http-server -p 8377 -c-1 .` served the page (HTTP 200, the game's
title); `node tools/check-syntax.mjs` → `syntax OK (29 scripts …)`; `node --test "tests/*.test.mjs"` →
1024/1024, 0 skipped; the clone left clean. No browser was opened in either run.
