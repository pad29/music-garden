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

**Round 0 — no review ran.** PR #85's first two runs on `7f03771` (`9f6e89fa`, `b9bafeb6`) each failed
within a minute: *"reviewer Chat turn ended without submitting a result"*. That text does not say why; a
one-word `codex exec` on `gpt-6-astra` did: *"You've hit your usage limit … try again at 11:25 PM"*
(05:25Z) — the account-wide ChatGPT limit, from whose 5-hour window this change's two `ask.sh` calls had
read 2.16M input tokens (1.95M cached). Following the rule this change writes (`work-ticket` § 8.5): no
third run, no other reviewer agent, model or effort — reported to the orchestrator as Needs Input; after
the reset it answered (2026-11-09): request it once more on the next head, same reviewer. Both
runs did prove the documented poll: it caught the terminal run on its first poll, and its exit woke the
worker. That poll, and the way to tell a limit failure from another, went into § 8 before any review
had completed, so they cost no extra round.

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
- **Not verified:** a completed AO review — the status and verdict an approval or a change request
  reports — until the limit resets; `ao session claim-pr --no-takeover` and the § 3 takeover in a real
  second session (GPT ran the git half in throwaway repositories); the § 2 claim race; Linear moves and
  comments in the new formats.

## Follow-ups

- **TUN-71** (Backlog, `needs-owner`) — a playback-goldens capture an AO worker can run.
- **TUN-9** — comment: README's stale Netlify site name, and the dead CORS origin beside it.
- **`.ao/launch.json`** — a separate PR stacked on this one, `claude/ao-launch-json` (owner's decision 3).
- For the orchestrator: the `needs-owner` label's description in Linear still says a session "stops at a
  proposal".
