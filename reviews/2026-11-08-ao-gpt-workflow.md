# 2026-11-08 — Run the Claude/GPT workflow through AO, with GPT designing each ticket

Branch `claude/ao-gpt-workflow` · ad-hoc work the owner approved directly (no ticket) · AO session
`music-garden-2`

Docs and skills only. The owner moved the repo onto Agent Orchestrator and changed the division of
labour: GPT designs each ticket and Claude critiques it; Claude implements and tests; GPT adds tests
against its design; Claude opens the PR; AO's native reviewer (Codex on Astra) reviews it; the owner
merges. This change itself ran under the **old** loop — Claude designed, GPT reviewed the design —
because the new one did not exist yet.

## Measured before designing (this AO worker, 2026-11-08)

- `ao preview index.html` and bare `ao preview` exited 0, but the agent's browser tab stayed on
  `about:blank`. The route that worked: `npx --yes http-server -p 8378 -c-1 -a 127.0.0.1 .` in the
  worktree, the served `index.html` byte-identical to disk, then `ao browser open
  "http://127.0.0.1:8378/index.html?dev"` — the game loaded with no page errors and the `?dev`
  controls present.
- AO reports page URLs with query values redacted (`?dev=%5Bredacted%5D`), though the real query reached
  the page.
- `ao browser open file:///…` is refused: `BROWSER_URL_FORBIDDEN`.
- A setting changed in the game (Voice → Piano) survived a reload; AO's `browser.md` gives every worker
  its own isolated, ephemeral profile. The old warning that `localStorage` is shared between previews is
  false under AO.
- Found while implementing: `ao browser` has **no way to run page JavaScript** (no evaluate, no console
  input — `ao browser --help`). Workers cannot run the playback goldens' console capture. Filed as
  **TUN-71** (Backlog, `needs-owner`).

## Design review (Astra)

GPT, overall: *"I would revise this before implementation. The main problems are review completion,
ticket ownership, and recovery—not the division of labour."* It could not run `ao` (not on its PATH),
so it judged the AO commands from the guides. All ten findings were taken.

1. **High — the review wait did not identify which result counts.** *"An old approval, an absent result,
   or a polling error must never become approval of the current PR head. Leaving the JSON fields until
   the first production run leaves the central gate undesigned."* **Agreed** — `work-ticket` § 8 waits
   for the verdict on the PR's current head; an older head's verdict, a missing run or an `ao` error is
   not an approval; the wait gives up after an hour; the hand-off re-checks that the approved head is
   still the PR's head. The exact `ao review ls --json` poll is filled in from this PR's first AO
   review run.
2. **High — the round cap turned unresolved work into completion.** *"A third round finding a real bug
   is materially different from repeatedly requesting a change Claude disputes. Both currently reach In
   Review and `ao report --done`."* **Agreed** — a round where Claude disputes everything, or three
   rounds without approval, end in Needs Input, *"not In Review, and not `--done`"*; failed or cancelled
   runs are retried at most twice, then `--stuck`; a run that fails on the ChatGPT limit is
   `--needs-input`, with no reviewer switch.
3. **High — the Linear claim is not a lock.** *"Two unnamed workers can both read Todo before either
   updates it … Re-reading narrows the race; it does not prevent it."* It also caught that the named-ticket
   rule dropped the case of a ticket held by this same session. **Agreed** — § 2 is claim-then-verify:
   after posting the claim, list the comments; an earlier claim by another session wins and the later
   one yields. § 1 separates this session, an authorised takeover, and another session. `CLAUDE.md`
   has the orchestrator name the ticket whenever it can.
4. **High — continuing a PR in a new session fails while the old worktree holds the branch.**
   *"`claim-pr` changes ownership metadata only. The subsequent `git switch <headRefName>` can fail
   because the old AO worktree still holds that branch."* **Agreed** — the orchestrator first brings the
   owner's answer back to the session that asked, restoring it if terminated; a new worker claims with
   `--no-takeover`, moves its *own* branch to the PR's verified head SHA (`git switch -C`), checks
   status, branch and HEAD even after a failure, and pushes with `git push origin HEAD:<headRefName>`.
5. **Medium — "stops once" needed a durable record of what the owner resolved.** **Agreed** — the
   reviews template gains *Owner's decisions*; the checkpoint stops for `needs-owner` only while its
   questions are unanswered there; each answer is recorded with where and when; a revised design is a
   new section and the original is never edited.
6. **Medium — thread continuity was treated as more reliable than `ask.sh` makes it.** *"O1 should be an
   optimization and source of context, never the only way the tester receives its specification."*
   **Agreed** — the test-pass prompt must stand alone and point at the reviews file; a failed resume is
   visible on stderr and recorded. The idea of parking `.thread-id` under another name was dropped.
7. **Medium — verification ran before the changes that can invalidate it.** **Agreed** —
   `git fetch origin` before merging `main`; syntax, suite and affected browser checks re-run after the
   merge and after every fix round; the hand-off names the head that was verified.
8. **Medium — "have GPT review the PR" was routed too broadly.** *"The latter must not use `ao review
   trigger` or claim the target."* **Agreed** — only this session's own PR; any other PR goes to a
   review-only worker the orchestrator provides.
9. **Medium — `file://` hand-off vs. `AGENTS.md`'s definition of done.** **Agreed** — one tool-neutral
   sentence in `AGENTS.md` § What "done" means: a required check you could not run is reported as
   pending and stays the owner's to verify before merge.
10. **Low — the port formula is a candidate, not an allocation.** **Agreed** — 8400 + the session number
    is the first candidate; the full command carries `--yes` and `-a 127.0.0.1`; a port that will not
    bind moves on; the byte comparison (`cmp`, not length) stays.

What GPT called right as proposed: the design checkpoint *"faithfully placed and easy to find"*; a
design-only draft PR as the Needs Input hand-off (*"it should clearly say there is no new playable
behaviour yet"* — now in the template); resuming the design thread for the test pass, as long as it is
not the only channel; GPT's design verbatim in `reviews/`; moving the briefs and deleting
`.claude/launch.json` (*"These changes remove misleading executable workflow affordances"*); AO-native
review, isolated browser profiles, explicit pushes.

**Cost:** 375,883 input tokens (312,960 cached), 5,548 out.

## Owner's decisions

1. *Does GPT design a ticket at pickup, inside the worker, or when it is filed?* — **At pickup, in the
   worker** (option A): the owner, relayed by the orchestrator, 2026-11-08.
2. *When does a worker stop after the design?* — the owner's rule, now `work-ticket` § 5: stop when the
   ticket is `needs-owner`, when the design or critique raises a question that would have earned
   `needs-owner` at filing, or when the standing Needs Input rule applies; smaller calls go under
   *Choices I made that you might overrule*; a GPT-vs-Claude disagreement is Claude's to resolve, with
   reasoning, unless it is itself an owner decision. Relayed 2026-11-08.
3. *Add `.ao/launch.json`, so `ao preview start` runs the dev server?* — **Yes, as a separate PR stacked
   on this one**: AO session `music-garden-3` builds it on `claude/ao-launch-json`. The owner, relayed by
   the orchestrator, 2026-11-09. This PR keeps `work-ticket` § 6's measured http-server route, which works
   either way.
4. *Does GPT's test pass resume the design thread?* — **No: it starts fresh** (`ask.sh fresh
   workspace-write`), with a prompt that hands GPT its own design and Claude's critique verbatim from the
   reviews file. The owner, relayed by the orchestrator, 2026-11-09. The reason: this change's resumed
   test pass read 1.78M of its ~2.2M GPT input tokens, and the ChatGPT 5-hour limit has become the
   bottleneck. Applied to `CLAUDE.md`, `work-ticket` § 6, `gpt-design`, the tester and author briefs —
   and, since nothing resumes the design thread for testing any more, `gpt-review` and the
   design-reviewer brief go back to `fresh`, with `thread` only for a second round.
5. *At what effort does AO's reviewer run?* — **High, not ultra.** The owner, relayed by the orchestrator,
   2026-11-09; the orchestrator changed the project config to Codex, `gpt-6-astra`, effort high.
   Sessions keep the reviewer settings they were spawned with, so this one passes `--effort high`
   explicitly; `CLAUDE.md` § Calling GPT and `work-ticket` § 8 now say to pass changed settings when the
   orchestrator reports them, and never settings of one's own.
6. *AO's reviewer reviews but cannot submit — what now?* — **Option 2, with a temporary fallback**: take
   the verdict the AO run on `7370181` reached (below), apply its hardening, and, until an AO review run
   submits, have GPT review PRs through `ask.sh` instead — a fresh, read-only `gpt-6-astra` thread whose
   self-contained prompt carries the PR's diff against `origin/main`, or the delta since GPT's last
   approval; the verdict verbatim in the PR body, under § 8's approved-head checks. The owner, relayed by
   the orchestrator, 2026-11-09. Written into `work-ticket` § 8 (*Temporary*), `CLAUDE.md` and the
   design-reviewer brief, each marked temporary with its cause and the condition for removing it.

## Test pass (Astra)

Resumed the design-review thread (no "resume failed" on stderr). Docs only, so the test pass was an audit:
scenario dry-runs against the text of `d59732f`, every command checked against AO's guides and `gh`'s
installed help, and the riskiest shell steps reproduced in throwaway repositories. GPT changed no files
and added no tests. Its verdict: *"Not ready to call complete. The ordinary path is clearer, but
resumption and review termination still have defects."* All ten findings were taken.

1. **High — historical claims blocked legitimate resumption.** *"Worker A claims a ticket, stops at Needs
   Input, and disappears. The owner answers and returns it to Todo. Worker B claims it, reads A's earlier
   comment, and must yield."* **Agreed** — only **live** claims count: a claim ends when its session hands
   off or yields, or a takeover names it.
2. **High — a `needs-owner` label no longer guaranteed the first checkpoint.** *"'Questions … not all
   answered' can be false for an empty list, allowing implementation without the first stop."*
   **Agreed** — every `needs-owner` ticket stops at its first checkpoint, questions or not, and *Owner's
   decisions* records the answer (template updated).
3. **Medium — the review procedure requested another review before checking whether to stop.**
   **Agreed** — § 8 now reads the verdict first and dispatches: approved → hand off; failed → retry path;
   changes requested → the all-disputed and third-round exits come before any new request.
4. **Medium — the polling and operational-failure exits were incomplete.** **Agreed** — a timeout, a
   missing run or a failed run takes the retry path (*two retries*, then `--stuck`, ticket stays In
   Progress); a ChatGPT-limit failure goes through the full Needs Input procedure. **Still open:** the
   exact `ao review ls --json` poll, filled in from this PR's first AO review run.
5. **Medium — resumption fell through into designing the ticket again.** **Agreed** — § 3 and § 4 send a
   resumed ticket to § 7's new *Continuing*: back to In Progress, record the answers, keep the design,
   revise only on a material change (a self-contained prompt, now also in `gpt-design`), pass § 5 again.
6. **Medium — report examples could alter verbatim findings through shell substitution.** *"I reproduced
   this with a harmless mock: the received note differed from the supplied Markdown."* **Agreed** — the
   hand-off formats now give the literal recipe: a `<<'EOF'` heredoc into a variable, then
   `--note "$note"`; PR bodies through `--body-file -`.
7. **Medium — a clean working status did not make the branch reset lossless.** *"`git status --short` is
   empty, but `git switch -C … <headRefOid>` moves its branch backwards … I reproduced this."*
   **Agreed** — the takeover also requires `git merge-base --is-ancestor HEAD origin/main` (no commits of
   the session's own), and stops instead of resetting when either check fails.
8. **Medium — the Netlify steps hard-coded a deployment identity that README contradicts.** **Agreed in
   part.** The hard-coded values were measured, not guessed: PR #82's checks show
   `netlify/tunegarden/deploy-preview` and `https://deploy-preview-82--tunegarden.netlify.app`, and today
   `tunegarden.netlify.app` answers 200 while `music-garden.netlify.app` answers 404 — so README's site
   name is the stale one. But reading the URL from the check's link is sturdier than building it, so the
   skill now does that, and waits with `gh pr checks --watch` (bare `gh pr checks` does not wait). The
   stale site name is pre-existing drift outside this change, and TUN-9 (*Correct stale claims in
   AGENTS.md and README.md*) already owns that kind of fix: added there as a comment, with the dead
   `music-garden.netlify.app` CORS origin in `backend/template.yaml` noted alongside.
9. **Low — trivial and ticketless work had no executable exceptions.** **Agreed** — `work-ticket` opens
   with both: no ticket skips the Linear steps and the `Closes` line; a trivial change skips §§ 4–5 and the
   test pass and says *"not required — trivial change"*; AO's review runs either way.
10. **Low — the byte comparison could pass on an HTTP failure.** *"I reproduced `curl -s … | cmp -
    empty-file` exiting 0."* **Agreed** — `( set -o pipefail; curl -fsS "…" | cmp - "<file>" )`.

GPT's verdict on the design-review findings as first implemented: 4 (takeover), 6, 7, 8 and 9 fixed; 10
*"mostly fixed"*; 1, 2, 3 and 5 *partial* — their remaining parts are findings 1–5 above.

**Cost:** 1,779,858 input tokens (1,639,168 cached), 17,394 out — the resumed thread replays the design
review.

## PR review (AO: Codex, Astra)

**Round 0 — no verdict arrived.** PR #85's first two runs on `7f03771` (`9f6e89fa`, `b9bafeb6`) each failed
within a minute: *"reviewer Chat turn ended without submitting a result"*. That text does not say why; a
one-word `codex exec` on `gpt-6-astra` did: *"You've hit your usage limit … try again at 11:25 PM"*
(05:25Z) — the account-wide ChatGPT limit, from whose 5-hour window this change's two `ask.sh` calls had
read 2.16M input tokens (1.95M cached). Following the rule this change writes (`work-ticket` § 8.5): no
third run, no other reviewer agent, model or effort — reported to the orchestrator as Needs Input; after
the reset it answered (2026-11-09): request it once more on the next head, same reviewer. Both
runs did prove the documented poll: it caught the terminal run on its first poll, and its exit woke the
worker. That poll, and the way to tell a limit failure from another, went into § 8 before any review
had completed, so they cost no extra round.

The third run, on `2216b63` at 15:04Z (`98e55751`, same reviewer, effort ultra), failed the same way.
The § 8.5 check said why: the limit had run out again — *"try again at 2:04 PM"*, 20:04Z — though this
session had made no ChatGPT call since the reset. Needs Input again, and a stop, as the orchestrator
had asked. The owner then decided 4 and 5 above; the next request runs at effort high.

On `7370181`, at effort high, with the limit reset: three more runs (`bfe6f81c`, then retries `26e9f2ef`
and `23665af5`, 20:25–20:28Z) failed the same way, within a minute each. **This time the limit was not the
cause**: the one-word `codex exec` answered at 20:26Z and 20:29Z, and so did one run inside this worktree
at effort high, with `AGENTS.md` loaded. Codex works; AO's review run never reaches `ao review submit`, and
the earlier failures may share that cause. After two retries § 8.5 says stop: reported **stuck**, no
reviewer switch. That report found one more defect: `ao report` refuses a note over 1,000 characters,
so `work-ticket` now sends AO a short form of each hand-off, and keeps the full text on the ticket, the PR
and the last message.

**What the runs actually did** (found in the Codex session files by the orchestrator, 2026-11-09):
AO's reviewer *did* review. It runs in Codex's sandbox, where `gh` could not read
`C:\Users\pavel\AppData\Roaming\GitHub CLI\config.yml` (*Access is denied*) and `ao` was not on PATH, so
its verdicts never reached AO or GitHub; `ao doctor` also warns `codex-launch-flags` (codex-cli 0.155.1
rejects AO's launch flags). So "within a minute" was the submission failing, not the review — and the
15:04Z run on `2216b63` reviewed too, so the limit was not its whole story.

The verdict on `7370181` (run `23665af5`, 20:28Z; `~/.codex/sessions/2026/11/08/rollout-2026-11-08T22-40-11-01a1be9b-4d7f-7430-b852-22cc5ee7ce74.jsonl`),
verbatim:

> Approved / ready: no required changes found in the reviewed diff from origin/main
> (d8e389d81775e91e1ca0d9cfb3c0cafa9f76b6c5) to 73701816fb520c6a232d4bfd8a408fe5056ded44. The checkout
> and target commit are unchanged since the completed static review. Reviewed ticket claiming and
> continuation, current-head approval, retry and handoff behavior, moved briefs, and fresh-thread
> test-pass instructions. Optional hardening: explicitly gate git switch -C in the takeover Bash block on
> a clean status and successful ancestry check, so running the whole block enforces its stop-on-failure
> prose. No project programs, tests, or builds were run; no checkout files were changed. Live PR metadata
> could not be refreshed because GitHub CLI cannot read its configuration in this environment.

followed by its note on the submission: *"GitHub submission failed before contacting the provider: access
to the GitHub CLI configuration was denied. No review ID was created."*

1. **Optional (not required) — gate the takeover reset.** **Agreed** — done, with the finding below.

A sub-reviewer during the 15:05Z attempt on `2216b63` rated the same issue higher
(`~/.codex/sessions/2026/11/09/rollout-2026-11-09T09-05-17-01a1c0d7-980f-7c83-a584-342fe17c18b9.jsonl`),
verbatim:

> **[P2] Make the takeover guards prevent the branch reset.** The Bash block runs `git switch -C`
> unconditionally after `git status --short` and `git merge-base --is-ancestor`. In ordinary Bash, dirty
> status output or the ancestry check returning 1 does not stop the following command. A worker running
> the supplied block on a clean branch with its own unmerged commits therefore resets that branch despite
> the documented protection. Check that status output is empty and explicitly gate the reset on both
> successful checks.
>
> The surrounding prose says to stop on failed checks, which reduces confidence if these commands are
> intended to run individually. No other high-confidence required changes found in §§1–5 or 7.

2. **P2 — the takeover guards did not prevent the reset.** **Agreed** — `work-ticket` § 3's block now
   runs `git switch -C` only inside `claim-pr && fetch && if …`: an empty `git status --short` and a
   successful `merge-base --is-ancestor`, each failure printing why. Tested in throwaway repositories: a
   clean untouched branch moves to the PR head; uncommitted edits, a commit of the session's own, or a
   refused claim each leave HEAD where it was.

**Fallback round 1 — GPT's PR review through `ask.sh`** (decision 6; a fresh read-only thread on the
delta `7370181..01c1e2d`, told of its approval at `7370181`). Changes requested, two findings, both taken:

1. **Medium — the cleanliness guard ignored `git status`'s exit status.** *"If it fails with empty stdout,
   `[ -n "$(git status --short)" ]` evaluates false and the reset remains reachable. In-memory Bash mocks
   confirmed `git switch -C` runs after a status failure; the other failed guards correctly block it, and
   the clean case succeeds. **Fix:** capture status in an assignment whose success gates the remaining
   checks, such as `takeover_status=$(git status --short) && if …`, then test its contents. Preserve the
   final diagnostic commands."* **Agreed** — `st=$(git status --short) &&` now gates the `if`. Re-tested in
   throwaway repositories with a mocked failing `git status --short`: the new block leaves HEAD alone, and
   the previous block, run the same way, resets — GPT's finding reproduced. The clean, dirty, own-commit and
   refused-claim cases still behave.
2. **Low — the removal instruction's cleanup list was incomplete.** *"Following it leaves dangling
   references in step 5, both hand-off templates, and the design-reviewer brief. The review record's
   follow-up mentions the brief but still omits step 5 and the templates."* **Agreed** — the *Temporary*
   section now lists every active reference, and `git grep -in temporar -- CLAUDE.md .claude/` finds them
   all; the follow-up below points there.

**Cost:** 242,477 input tokens (201,088 cached), 1,796 out.

## Verification

- `node tools/check-syntax.mjs` OK (29 scripts); `node --test "tests/*.test.mjs"` 636/636. No game code
  changed, so this shows only that nothing broke.
- A grep of every `*.md`, `*.sh` and `.gitignore` outside the history files for the old workflow's
  terms (`.claude/agents`, the old brief names, `launch.json`, `EnterWorktree`, `preview_start`,
  `get_session`, `MusicTheory`, the dispatcher, the preview pane, `.claude/worktrees`, subagents,
  `claude/…` branches, "no automated tests"): what remains is the deliberate "never" lines.
- `git check-ignore`: the briefs are tracked; `prompt.txt` and `.thread-id` stay ignored. Claude Code
  re-read the skills' frontmatter after the edit.
- Measured on this PR: the shape of `ao review ls --json` (`reviews[].latestRun` with `targetSha`,
  `status`, `verdict`, `body`); the § 8 poll, run from the skill's own text, catching a failed run; a
  background command's exit waking the worker; a plain `ao review trigger` starting a new run after a
  failed one; `ao report --needs-input` with a multi-line note from a quoted heredoc.
- **Not verified:** an AO review run that submits — none can here yet (decision 6), so the status and
  verdict fields of a submitted run are unseen; `ao session claim-pr --no-takeover` and the § 3 takeover in a real
  second session (GPT ran the git half in throwaway repositories); the § 2 claim race; Linear moves and
  comments in the new formats.

## Follow-ups

- **TUN-71** (Backlog, `needs-owner`) — a playback-goldens capture an AO worker can run.
- **TUN-9** — comment: README's stale Netlify site name, and the dead CORS origin beside it.
- **`.ao/launch.json`** — a separate PR stacked on this one, `claude/ao-launch-json` (owner's decision 3).
- **AO's reviewer sandbox** (`gh` config access, `ao` on PATH, `ao doctor`'s `codex-launch-flags`) — for
  the orchestrator. Once an AO review run submits, remove `work-ticket` § 8's *Temporary* section and
  every active reference it lists (`git grep -in temporar -- CLAUDE.md .claude/`).
- For the orchestrator: the `needs-owner` label's description in Linear still says a session "stops at a
  proposal".
