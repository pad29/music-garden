# 2026-11-10 — Size the workflow's loop and cut its token cost

Branch `claude/cost-effective-workflow` · ad-hoc work the owner approved directly (no ticket), 2026-11-10 ·
AO sessions `music-garden-4`, then `music-garden-6` (GPT's PR review and its fixes) · **Medium**
under the new rules: my plan, GPT's design review, GPT's PR review; no separate test pass.

Workflow docs only — `CLAUDE.md`, `AGENTS.md`, the skills, GPT's briefs, `reviews/README.md`,
`README.md`. No game file changes.

## Plan (Claude)

The plan GPT reviewed is the prompt of the design review below; in short: key the loop off file-ticket's
`## Size` (Linear has no size labels — only the Area group, `needs-owner`, Bug/Feature/Improvement);
Small and Medium drop GPT's test pass and have the PR review list missing tests; split work-ticket's rarely
needed procedures into files beside it; a fresh worker resumes a Needs Input answered after more than an
hour; planning moves to an Opus planning session; every GPT call `fresh`; one retry at most when an
external tool breaks. `ask.sh` already supports `fresh workspace-write` — unchanged.

Settings checked against AO, not just copied from the brief (`ao project get music-garden --json`,
2026-11-10): workers `claude-code` / `claude-opus-5-5` / high; orchestrator `claude-code` /
`claude-sonnet-5-5` / high; reviewer `codex` / `gpt-6-astra` / high.

## Design review (Astra) — fresh, read-only, 259k input tokens (199k cached), 3.4k out

<details><summary>GPT's review of the plan, verbatim</summary>

1. **High — Medium should mean (i): Claude plans, GPT independently reviews.** That matches “GPT design review” and the owner’s instruction for this change. Independence survives because GPT attacks the plan in a fresh thread. The measured savings support removing the separate test pass; they do **not** establish that Claude authoring is cheaper than GPT authoring. Keep Claude’s plan short. Explicitly supersede `CLAUDE.md` § Calling GPT’s blanket authoring rule for S/M. If you still consider this unsettled, resolve it **before implementation**, not as a choice to overrule in the finished PR.

2. **High — E does not enforce one GPT job at a time.** Two workers can inspect the same idle status and both launch; AO also cannot identify the `ask.sh` jobs you need to serialize. Use an orchestrator-controlled reservation: request, grant to one session, release on completion/failure, reconcile abandoned reservations. Include planning-session GPT calls, native reviews, and the one-word limit probe. Status inspection alone cannot satisfy the binding rule.

3. **High — F preserves an hour-long failure loop.** `work-ticket` § 8’s poller suppresses stderr and treats `error` as “sleep and retry,” up to 60 times. Reducing review-*launch* retries leaves that intact. Distinguish healthy pending work from command failures, retain the actual error, and apply the one-transient-retry ceiling to failures. Also reconcile `CLAUDE.md` § Cost’s “finish the verification yourself rather than stall” with the newly required stop; both cannot remain unconditional.

4. **High — C weakens the takeover guard while leaving the old worker available.** Existing § 3 uses `claim-pr --no-takeover`, refusing a live owner. Your spawn claims first and skips that guard without establishing that the old worker has yielded and cannot resume writing. Explicitly retire its ownership and route subsequent answers only to the replacement. Use the Needs Input hand-off timestamp for the hour threshold: `ACTIVITY` is not established here as cache activity, and unrelated activity could defeat the owner’s fresh-worker rule.

5. **High — Deferring missing-test coverage until AO returns creates a known regression.** The temporary section currently says to remove it once an AO review submits successfully. Under A, that event would remove S/M’s only independent test-gap check. Successful submission is insufficient: restoring native review must also require verified missing-test coverage. Until that contract exists, retain the authorized `ask.sh` review.

6. **Medium — The cold-start record needs workflow state, not just branch state.** Preserve the selected size, current phase, completed design checkpoint, review rounds already consumed, outstanding/disputed findings, last reviewed SHA and verdict, and verification results tied to a SHA. Otherwise a replacement can reset the three-round budget or treat an old approval as current. It must also read the ticket’s acceptance criteria and binding decisions. Existing § 3 permits reconstructing from ticket/PR comments; asking the owner whenever a new field is absent creates unnecessary stops for legacy hand-offs. Recover documented facts first; ask about genuine gaps.

7. **Medium — The retained resume procedure reinstates GPT authoring on S/M.** `work-ticket` § 7, *Continuing*, says a material owner answer causes **GPT to revise the design**, followed by Claude’s critique. Moving that unchanged into `resume.md` contradicts both new loops. Make revisions size-aware: Claude revises S; Claude revises and GPT reviews M; GPT revises L. Preserve original plans, findings, and answers as separate records.

8. **Medium — “Plan + PR review sections only” loses required records.** `reviews/README.md` also requires *Owner’s decisions*, including the first `needs-owner` checkpoint, and accommodates owner playtest corrections and unverified checks. These apply to S/M too. Likewise, `work-ticket`’s In Review and PR templates currently assert GPT authored the design and performed a test pass. Make those lines size-aware, and retain verbatim GPT findings separately from Claude’s responses. Audit **all** briefs, skills, and templates—not only the three files named in H. The author/reviewer brief openings and `file-ticket`’s `needs-owner` description also become false.

9. **Medium — A omits the operational default.** Making `## Size` mandatory for newly filed tickets does not cover existing tickets or ad-hoc work, which `work-ticket` explicitly supports. State “missing size → Medium” in the worker’s routing rules, including no-ticket work. Keep the triviality decision separate: S is still non-trivial. Also specify that a `needs-owner` checkpoint overrides any shortcut that would otherwise skip it.

10. **Medium — Two of the five extracted files remain routine context.** Every completed PR needs `pr-review.md` and `handoff.md`; most game changes need `browser.md`. Extracting them delays their loading but does not remove them from later turns’ context. The better split puts the **currently active** review procedure in a small normal path and quarantines dormant native-review machinery, diagnostics, takeover, and Needs Input procedures. Keep one authoritative size table; duplicating it in `CLAUDE.md` and the skill adds both tokens and drift.

11. **Medium — G contradicts the current documentation rule.** `CLAUDE.md` § Docs says every new doc earns an AGENTS pointer, README row, and place in “done”; it does not exempt skill procedures. I agree that five Claude-only procedure pointers do not belong in AGENTS, but explicitly scope that rule to project documentation and define the skill-index alternative. Simply omitting the pointers leaves an active contradiction. Also update README’s `reviews/` row and its browser-procedure references, not just the two locations listed in G.

12. **Medium — H tests the game, not the changed workflow.** Add focused walkthroughs for S/M/L, absent size, `needs-owner`, late/no-ticket resume, exhausted review rounds, competing GPT requests, and external failure. Verify configured model/effort settings rather than merely listing them. Run required checks **after** merging `origin/main` into the worker branch, as existing § 8 requires. The local Node 24 dot reporter does emit failure details; blanket `| tail` guidance is riskier—it can hide diagnostics and mask command failure without pipeline-status handling. Never apply output trimming to GPT findings that must be preserved verbatim.

</details>

## My answers to the design review

1. **High — Medium = Claude plans, GPT reviews.** **Agreed**, and settled before implementing, as GPT
   asks — not left as a choice to overrule. `CLAUDE.md` now says that for Small and Medium the plan is
   Claude's, superseding the 2026-09 "design authoring goes to GPT" rule for those sizes only.
2. **High — a status check cannot enforce one GPT job at a time.** **Agreed that it can't** —
   confirmed: `ao session ls --json` carries no report notes, so nothing in it shows an `ask.sh` call.
   **Disagreed with the remedy** (an orchestrator-granted reservation): the owner named `ao session ls`
   as the check, and a grant/release round trip through the orchestrator for every GPT call adds
   orchestrator turns and stalls whenever the orchestrator is busy or at its own limit — the rework
   this change is meant to cut. Built instead, inside the owner's check: a session prefixes its AO
   display name with `[GPT]` for the length of any GPT job (an `ask.sh` call, an AO review, the
   one-word limit probe; planning sessions included), then re-reads `ao session ls` and backs off if
   another session carries the marker — the same claim-then-check as the Linear lock. Released on
   finish or failure. A race inside the re-check window remains possible; noted, not solved.
3. **High — the review poller retries `error` for an hour.** **Agreed.** The poller now counts
   failures: `error` twice in a row prints the error and exits (one retry). And § Cost's "finish the
   verification yourself rather than stall" is reconciled with the new stop: finish what doesn't need
   the broken tool, never stand in for a required GPT step, then stop.
4. **High — the fresh-worker resume skips the takeover guard.** **Agreed on the clock**: the hour
   counts from the Needs Input hand-off, not `ACTIVITY`. **Agreed in part on retirement**: the
   orchestrator spawns with `--claim-pr` (AO moves ownership), notes the hand-over on the ticket, and
   never routes anything to the old session again; the new worker's takeover comment retires the old
   claim under § 2's lock rule. Not built: killing the old session — it holds nothing unpushed at Needs
   Input, it is idle until messaged, and killing removes an AO worktree, which is the owner's/AO's call.
   Worker-initiated takeovers keep `claim-pr --no-takeover`.
5. **High — removing the temporary review loses Small/Medium's missing-tests check.** **Agreed.** The
   temporary `ask.sh` PR review now ends only when an AO run submits **and** the owner has decided how
   Small/Medium get their missing-tests list.
6. **Medium — the cold-start hand-off needs workflow state.** **Agreed.** The Needs Input template now
   carries size, phase, checkpoint status, review rounds used, the last reviewed SHA and its verdict,
   open/disputed findings, verification tied to a SHA; the resuming worker reads the ticket's *Done
   looks like* and *Decisions already made*, recovers documented facts first, and asks only about real
   gaps.
7. **Medium — *Continuing* reinstates GPT authoring on S/M.** **Agreed.** Revisions are size-aware: S —
   Claude revises; M — Claude revises, GPT reviews the revision; L — GPT revises, Claude critiques.
   Originals are never edited.
8. **Medium — S/M records and templates.** **Agreed.** `reviews/README.md` keeps *Owner's decisions*,
   *Owner's review* and the unverified line for every size; the hand-off templates' design and test lines
   are size-aware; the author and design-reviewer brief openings and file-ticket's `needs-owner` line
   are corrected.
9. **Medium — the default for tickets without a size.** **Agreed.** No `## Size` (older tickets,
   no-ticket work) → Medium; Small is still non-trivial; a `needs-owner` checkpoint is never skipped.
10. **Medium — two extracted files are routine context.** **Agreed in part.** The active review route
    (`ask.sh`) is back in the core § 8; only the dormant AO-reviewer machinery and the limit diagnosis
    are in `pr-review.md`. **Kept extracted:** `handoff.md` (read once, at the end: every earlier turn
    is spared it) and `browser.md` (never read on docs, infra or test-only tickets). One size table, in
    `CLAUDE.md`; work-ticket points to it.
11. **Medium — § Docs' new-doc rule.** **Agreed.** Scoped to project docs; a skill's procedure files get
    a pointer in their `SKILL.md` and a mention in README's `.claude/` row. README's `reviews/` row and
    browser references updated too.
12. **Medium — verification.** **Agreed**, except where noted: written walkthroughs below; settings
    verified against AO (above); checks run after merging `origin/main`. On output trimming:
    the rule is now "keep the exit status" (`> log; echo exit $?; tail -n 8 log`), never a bare
    `| tail`, and never trimming GPT's findings.

## Walkthroughs (on the docs as committed)

Each traced through the committed text, as a cold worker would read it.

1. **S ticket.** `work-ticket` § 4 *S*: a few-line plan in the reviews file, no GPT call → § 5 (stops
   only for `needs-owner` or an owner question) → § 6: build, own tests, `browser.md` if the game
   changed → § 8 step 4: `[GPT]` marker, `ask.sh fresh read-only` PR review asking for missing tests →
   step 5: a missing-tests list is *changes requested*, so the tests are added in the fix round and
   the next round reviews the delta → approval on the current head → `handoff.md`: *Design: not
   required — S*, *test pass: not run — S*, the missing tests listed and added.
2. **M ticket.** § 4 *M*: Claude's plan → design-reviewer brief, fresh → *My answers* per finding,
   separate from GPT's verbatim text → § 5 → build → the same PR review. This change was run this way.
3. **L ticket.** § 4 *L*: `gpt-design` → critique → § 5 → build → § 6's test pass, `ask.sh fresh
   workspace-write` (supported by `ask.sh` as is) → PR review. Unchanged but for `fresh` everywhere.
4. **No size; no ticket.** `CLAUDE.md` § The loop, by size and `work-ticket`'s *No ticket*: both M.
5. **`needs-owner`, size S.** § 5 rule 1 applies "whatever its size": stops on Claude's short plan.
6. **Late answer.** Needs Input at 10:00 (`needs-input.md`, with *Resume state*); the owner answers at
   13:00 → `CLAUDE.md` § AO: more than an hour from the hand-off → `ao spawn --claim-pr … --prompt
   "Resume … work-ticket/resume.md"`, ticket comment naming both sessions; the old session gets
   nothing more. The new worker: `resume.md` § 1 — takeover comment (retires the old claim), drops the
   claim line (its spawn claimed), moves its branch to the PR head, pushes to `HEAD:<headRefName>` →
   § 2 reads the hand-off, the answer, *Done looks like*, *Decisions already made*, the reviews file;
   keeps the rounds used and the last approved SHA → *Continuing*: size-aware revision → § 5 → § 6 or § 8.
7. **Review budget spent.** § 8 step 5: the third round's fixes go to Needs Input without a fourth
   review; *Resume state* records "rounds used: 3", so a fresh worker cannot reset the count.
8. **Two GPT jobs at once.** Both sessions read `ao session ls`; each renames itself `[GPT] …` and
   re-checks; each sees the other → the lower-numbered session keeps the turn, the other drops the
   prefix and waits on a background re-check. (Found while writing this walkthrough: without the
   tie-break both backed off — fixed in `CLAUDE.md` § Cost.)
9. **External failure.** `ask.sh` fails on a network error → one retry → fails again → finish own
   verification → `ao report --stuck`, quoting the error. Fails with a limit message → `pr-review.md`
   *The limit*: no retry, Needs Input with the reset time. AO's poller: one failed `ao review ls` is
   tolerated, two in a row print `error: …` and exit — exercised with a fake `ao` (one failure then an
   approval → `completed approved r1`; two failures → `error: boom…`; a verdict on an older head →
   keeps waiting; running then failed → `failed - r1`).

## Rule audit

Every rule phrase from the old `CLAUDE.md`, `work-ticket`, `AGENTS.md` and the briefs (81 distinctive
phrases) was checked for presence across the new set with line breaks collapsed: none missing. The
deliberate changes, all from the owner's 2026-11-10 list: GPT designs only L tickets; every GPT call is
`fresh` (no `thread` for revisions or second rounds); one retry, not two, for a failed AO review run;
planning moved from the orchestrator to a planning session; a Needs Input answered after an hour goes to
a fresh worker. One narrowing of mine: a resuming worker reads the comments **after** the Needs Input
hand-off, plus earlier ones only where the record has gaps — the old § 3 said "every comment". Removed as
false: `AGENTS.md`'s "the suite is young and covers the detectors" (641 tests).

Size, in characters (the always-loaded files): `CLAUDE.md` 12,758 → about the same, with the size table,
planning, working-lean, stop-early and `[GPT]` rules added; `AGENTS.md` 7,335 → 7,240; `work-ticket`
`SKILL.md` 26,840 → about 12,900. Together −30%. The moved procedures (`resume.md`, `browser.md`,
`needs-input.md`, `pr-review.md`, `handoff.md`) load only when their step comes up.

## PR review (Astra, through `ask.sh`)

**Attempt on `dcc03fc`** (session `music-garden-4`; fresh, read-only, `[GPT]` marker taken and released):
**no verdict — the ChatGPT limit ran out mid-review.** The events file ends *"You've hit your usage limit
… try again at Nov 11th, 2026 2:49 AM."* GPT had read the review record and the diff (16 commands) and said
it was checking "whether the `[GPT]` marker prevents overlapping jobs, whether a late reply can wake the old
worker, and whether the poller stops within the retry limit" — no findings were emitted. Per the new rule:
no retry, no other model; Needs Input with the reset time. Noticed on the way: `ask.sh` exited 1 with an
**empty stderr**, though its failure branch echoes the last events there — the reason was only in
`.claude/gpt/.last-events.jsonl`. Not investigated (out of scope; `ask.sh` unchanged).

### Round 1 on `cee6a86` — Changes requested

Session `music-garden-6`, 2026-11-11, after the owner chose to run it (*Owner's decisions* 2). Fresh,
read-only, `[GPT]` marker taken and released. **937k input tokens (840k cached), 8.2k out.** The prompt
asked for findings on the 12 design-review answers, lost rules, contradictions, cold-worker usability,
shell snippets, and missing tests.

<details><summary>GPT's PR review, verbatim</summary>

Reviewed `origin/main...HEAD` at `cee6a86cba9c08f18a53be3fc54d727977718500`. No files edited.

Design-answer audit: **#1, #5, #7, #10 and #11 are implemented.** **#6** adds the promised state, but leaves a cold-resume gap. **#2, #3, #4, #8, #9 and #12** remain partly implemented or introduce problems below. Medium’s confirmed design is not disputed.

1. **High — `CLAUDE.md:184–189`: the marker permits overlapping GPT jobs.**  
   “The lower-numbered session keeps the turn” handles simultaneous re-checks, but cannot distinguish an acquiring worker from one already running GPT. Concrete sequence: sessions 4 and 6 both see no marker; 6 marks, re-checks and starts; delayed session 4 marks, sees 6, wins by number and starts too. Session 6 has no further check. The marker works for uncontended requests, but does not enforce exclusivity. **Require an exclusive acquisition mechanism shared across worktrees, with demonstrated mutual exclusion; retain names as visibility if useful.** This is the unresolved operational defect in answer #2.

2. **High — `needs-input.md:39–40`, `resume.md:51–61`: late replies can reactivate the retired worker.**  
   The template still invites: “Or answer in the AO session linked above, if it is still open.” That worker follows *Continuing*, which checks neither elapsed time nor replacement ownership before resuming. Thus the owner can follow the documented instructions and bypass the new fresh-worker rule—or restart the old writer after its replacement has claimed the PR. Orchestrator routing alone does not prevent this. **Require an ownership/retirement check before continuation, and route late direct replies through the orchestrator. Update the answer instructions accordingly.** Answer #4 is incomplete.

3. **Medium — `pr-review.md:40–47,59–61`: the failure path still exceeds the stop-early contract.**  
   The poller retries every command failure, including permanent errors. After two failures, the following instructions say “Otherwise request the review again, once,” even though polling failure does not establish that the existing GPT run ended. This can spend another GPT call after the tool’s retry budget is exhausted. Separately, malformed JSON prints `error: …` and exits **0**; I reproduced that in Git Bash. **Distinguish polling failure from review failure, stop after the permitted transient retry, return nonzero for parser failures, and establish that the previous run ended before launching another GPT job or probe.** Answer #3 is only partial.

4. **Medium — `work-ticket/SKILL.md:73–76`, `briefs/design-reviewer.md:15–29`: M loses the complete-ticket requirement.**  
   The former route invoked `gpt-design`, which requires pasting the ticket **verbatim**, including binding decisions, questions and exclusions. M now follows a brief containing the problem, approach, alternatives and repository paths, without requiring the ticket or its acceptance criteria. GPT can therefore approve a plan without seeing a decision or constraint the plan omitted. This is an unreported weakening beyond changing who authors the design. **Require the M review prompt to include the complete ticket and relevant owner decisions, or an explicitly identified repository copy containing them.**

5. **Medium — `CLAUDE.md:118–119`, `resume.md:14,41–54`: the standalone resume entry does not handle no-ticket work.**  
   The spawn prompt sends the replacement directly to `resume.md`. Its first action is “On the ticket, comment,” followed by mandatory ticket comments, acceptance criteria and state moves. The no-ticket exception exists only in the core `SKILL.md`, which this entry never explicitly requires the replacement to read. A cold worker resuming this very ad-hoc PR must guess which steps to omit and where to record ownership. **Make the resume entry self-contained for no-ticket work: identify the PR as the record, skip Linear actions, and specify where takeover and owner answers are recorded.** This limits answer #6 despite the improved state template.

6. **Medium — `CLAUDE.md:139–140`: the trimming recipe does not preserve command failure.**  
   “Exit status kept” is implemented as `echo "exit $?"; tail …`. It displays the test status, but the shell command returns `tail`’s status. A failing-command reproduction printed `exit 1` and returned **0**. The fixed `/tmp/t.log` also lets parallel workers overwrite each other’s verification output. **Capture the status, print full diagnostics on failure, return that status, and use a session-specific log.** Answer #12’s shell safeguard is incomplete.

7. **Medium — `work-ticket/SKILL.md:22–24`: triviality still bypasses `needs-owner`.**  
   “A trivial change … skip §§ 4–5” is unconditional. It conflicts with `CLAUDE.md`’s rule that a `needs-owner` ticket stops “whatever its size.” A worker classifying a labelled wording change as trivial never reaches the checkpoint that enforces the exception. **Explicitly make `needs-owner` override the trivial shortcut, including the table’s checkpoint entry.** Answer #9 fixes the default size, but not this bypass.

8. **Low — `briefs/author.md:3–5`, `file-ticket/SKILL.md:28–29`, `handoff.md:72–74`: S remains inconsistently described.**  
   The author brief says S and M plans receive GPT review; file-ticket waits for “the plan and its review (S, M).” Both contradict S’s “No GPT call” design stage. Meanwhile, the hand-off says S’s design is “not required,” although a short Claude plan is required. **Describe S consistently as Claude’s short plan, without GPT design review; reserve “not required” for trivial changes.** Answer #8’s brief/template audit missed these cases.

9. **Low — `CLAUDE.md:119`, README browser pointers, `pr-review.md:13,55–56`: extracted references are not fully resolvable as written.**  
   `work-ticket/resume.md` and `work-ticket/browser.md` are not repository paths; the actual files are under `.claude/skills/work-ticket/`. The extracted review procedure also retains unqualified “§ 8” references, although it has no section 8. **Use repository-relative links in root documents and spawn prompts, and qualify the moved references as `SKILL.md` § 8.** This removes avoidable discovery work for cold workers.

**Missing tests**

1. **Competing acquisitions:** both workers observe idle; the higher-numbered worker starts before the lower-numbered worker re-checks → exactly one GPT job runs. Include the reverse ordering. **Automatable under `tests/` once acquisition is executable; otherwise a written interleaving walkthrough.**

2. **Late direct reply:** owner answers the old session after 61 minutes, both before and after replacement ownership is recorded → the old worker does not resume writes. Include 59-minute and exactly-one-hour boundaries. **Written walkthrough.**

3. **Cold no-ticket resume:** provide only `CLAUDE.md`, `AGENTS.md`, the resume entry and an ad-hoc PR hand-off → no Linear operations; ownership, decisions, size and review budget recovered from PR/repository records. **Written walkthrough.**

4. **M review input:** a plan omits a binding ticket decision or acceptance criterion → the review prompt still supplies that requirement independently. **Written walkthrough; a future prompt builder could make this automatable.**

5. **S and trivial checkpoints:** S with `needs-owner`, and a trivial change carrying `needs-owner` → owner checkpoint occurs; S receives no GPT design review and its hand-off identifies Claude’s plan. **Written walkthrough.**

6. **Poller failures:** permanent command error, two transient failures, malformed JSON, and polling failure while GPT remains running → appropriate nonzero failure, bounded retries, no replacement GPT launch while the first run may remain active. **Automatable with fake `ao`, `gh` and `sleep` commands under `tests/`.**

7. **Trimmed verification:** command exits 1 → wrapper exits 1 and exposes diagnostics; two simultaneous sessions → separate logs. **Automatable with Git Bash subprocess tests under `tests/`.**

8. **Exhausted-budget resume:** hand-off records three consumed rounds; owner answers a substantive question without authorizing more reviews → replacement preserves the exhausted budget rather than automatically starting round four. **Written walkthrough.** The existing walkthrough stops before this continuation.

9. **Reference validation:** every procedure link and section/step reference → existing file and heading, including references after extraction. **Automatable under `tests/`.**

10. **Actual AO takeover:** late resume through `ao spawn --claim-pr` → replacement owns the PR, old ownership is retired, and the documented branch/push procedure targets the existing PR. **Live AO walkthrough.** AO was unavailable on PATH here, so flag compatibility remains unverified.

Syntax and diff whitespace checks passed. The Git Bash probes above exercised shell behavior; they do not validate live AO behavior.

**Changes requested**

</details>

### My answers to round 1

1. **High — the marker permits overlapping jobs.** **Agreed.** The interleaving is real: a late,
   lower-numbered session wins the tie against a holder that is already running. My answer to #2 said a
   race "remains possible"; this is no narrow window, it is a rule that hands the turn away. Built:
   **`.claude/gpt/gpt-lock.sh`** (`acquire` / `wait` / `release` / `status`). The lock is a directory —
   `mkdir` is atomic, so exactly one session gets it — shared by every worktree (`~/.music-garden-gpt-lock`).
   It still puts `[GPT]` on the holder's AO name, for the owner's sidebar. A lock whose holder AO no longer
   lists is stale and the next `acquire` breaks it (moves it aside, checks it was the stale holder's, else
   puts it back); if `ao` can't answer, the holder counts as live. This is still not GPT's
   orchestrator-granted reservation: no orchestrator round trip, which was my objection in the design
   review. **Residual:** the stale-break path has a window — a third session can `mkdir` between another's
   break and its put-back — only after a holder has died, and only within milliseconds. `CLAUDE.md`
   § Cost and every "take the marker" line now say "take the GPT lock".
2. **High — a late reply can wake the retired worker.** **Agreed in part.** Built: *Continuing* now starts
   with step 0 — if `ao session ls` lists the PR against another session, or a takeover comment names you,
   write nothing, push nothing, report and stop. The Needs Input template's *How to answer* now says the
   AO session is for answers within the hour; after that, on the ticket. **Not built:** forcing a direct
   late reply through the orchestrator when no replacement exists yet. The hour rule exists because waking
   a session re-saves its expired cache; once the owner has messaged the old session directly, that cost
   is paid, and continuing there is cheaper than a fresh spawn. The ownership check is what stops two
   writers, and that is the part that matters.
3. **Medium — the poller's failure path.** **Agreed.** The poller now treats unreadable `ao review ls`
   output as a failure (`error:` exits **1**, not 0), resets the count only on a healthy read, writes
   stderr to a per-session file, and still stops after two failures in a row. The outcomes are split:
   **`error`** → the run may still be going, so `ao report --stuck` and **never request another review**;
   **failed, cancelled or `timeout`** → `ao review ls` must show the run ended before a re-request; then the
   limit check, then one re-request. The lock is released whichever way it ends.
4. **Medium — M's review loses the complete ticket.** **Agreed** — a real weakening I hadn't listed.
   `work-ticket` § 4 *M* and the design-reviewer brief now require the **whole ticket verbatim** and any
   owner answers in the prompt.
5. **Medium — resume doesn't handle no-ticket work.** **Agreed** (this PR is the case). `resume.md` has a
   *No ticket* paragraph: the PR is the record; skip Linear; takeover comment on the PR; answers recorded
   under *Owner's decisions*. The spawn prompt in `CLAUDE.md` § AO now says "run the work-ticket skill,
   then follow .claude/skills/work-ticket/resume.md; your spawn claimed the PR", and the comment naming
   both sessions goes on the PR when there is no ticket.
6. **Medium — the trimming recipe loses the failure.** **Agreed.** It now writes a per-session log
   (`test-$AO_SESSION_ID.log`), saves the status, prints the failures in full when there are some, and ends
   with `(exit $s)`. Checked with a deliberately failing test: it printed the assertion and `exit 1`, and
   returned 1.
7. **Medium — triviality bypasses `needs-owner`.** **Agreed.** `work-ticket`'s *trivial* line now says
   "unless the ticket is labelled `needs-owner`: then § 5's rule 1 still stops it"; the size table's
   checkpoint row reads "`needs-owner` only" under Trivial.
8. **Low — S described inconsistently.** **Agreed.** Author brief: "on M, GPT reviews the plan …, and S
   has no GPT design step"; `file-ticket`: "GPT's design (L), the plan and GPT's review of it (M), or the
   short plan (S)"; `handoff.md`: S — "my short plan, no GPT design review — S", trivial — "not required —
   trivial change".
9. **Low — references don't resolve.** **Agreed.** `CLAUDE.md`, `README.md` and `gpt-design` now use
   `.claude/skills/work-ticket/…`; `pr-review.md` and `resume.md` qualify every `§` as `work-ticket` § n.
   Now enforced by a test (missing test 9).

### Missing tests

1. **Competing acquisitions — added**, automated (`tests/workflow-scripts.test.mjs`): six sessions
   `acquire` at the same instant → exactly one gets 0, the rest 75 (three rounds); and GPT's interleaving —
   6 holds, 4 arrives late → 4 is refused. Plus release (only the holder; names restored), stale breaking
   (only when AO no longer lists the holder; not when `ao` fails), and `wait`.
2. **Late direct reply — written walkthrough** 10 below.
3. **Cold no-ticket resume — written walkthrough** 11.
4. **M review input — written walkthrough** 12.
5. **S and trivial checkpoints — written walkthrough** 13.
6. **Poller failures — added**, automated: the poller block is read out of `pr-review.md` and run with fake
   `ao`/`gh`/`sleep` — approval; waiting through running / none / an older head's verdict; a failed run;
   one failure tolerated, two exit 1 with no third call; unreadable output twice → exit 1, once → retried;
   failures separated by a healthy read don't add up; no run → `timeout`, exit 1. "Polling failure while
   GPT is still running → no replacement launch" is a rule for the worker, not the script: covered by the
   `error` outcome's text and walkthrough 14.
7. **Trimmed verification — checked by hand, not automated** (answer 6). It is a one-line recipe in a
   policy doc, not a script anything calls; a test would pin the doc's wording rather than behaviour.
8. **Exhausted-budget resume — written walkthrough** 15, and `resume.md` now says a spent budget stays
   spent unless the owner's answer grants more rounds.
9. **Reference validation — added**, automated (`tests/workflow-refs.test.mjs`): backticked paths resolve;
   `CLAUDE.md` § names match a heading; `work-ticket` § numbers exist; work-ticket's procedure files qualify
   every `§`; the docs name the lock, not the marker.
10. **Live AO takeover — not verifiable here** (it needs a live late resume). Checked what can be: `ao spawn
    --help` on this machine lists `--claim-pr` ("Claim PR ownership metadata only for the spawned
    session") and `--no-takeover`.

**Mutation audit of the new tests** (each applied, run, reverted; files compared byte-for-byte after):
poller `error:` exits 0 at once → 3 tests fail; no reset on a healthy read → 1; check-then-create
instead of atomic `mkdir` → the six-way race fails; never break a stale lock → 1; break it when `ao`
fails → 1; anyone may release → 1; an unqualified `§ 8` and a `work-ticket/pr-review.md` path → 2; a
`CLAUDE.md` § name that isn't a heading → 1. A CRLF checkout of `gpt-lock.sh` (`autocrlf` is on) runs
under Git Bash.

## Walkthroughs, round 1 (on the fixed docs)

10. **Late direct reply.** Needs Input at 10:00; at 13:00 the owner messages the old session directly.
    It runs *Continuing* step 0: `ao session ls` — if the orchestrator already spawned a replacement with
    `--claim-pr`, the PR is listed against that session → report and stop, nothing written. If not, it
    owns the PR and carries on (the cache cost is already paid). At 10:59 or 11:00 the same: the clock
    decides only where the orchestrator routes, never whether the owner of record may continue.
11. **Cold no-ticket resume** (this PR). The spawn prompt names PR #88 and `resume.md`; the work-ticket
    skill loads with it (*No ticket*: skip Linear). `resume.md` *No ticket*: takeover comment on the PR;
    hand-off from the PR body's *Resume state*; answers in the PR comments or the spawn prompt; decisions
    in this file. § 1's block: the claim line dropped (the spawn claimed); branch moved to `headRefOid`;
    push to `HEAD:claude/cost-effective-workflow`.
12. **M plan omits a binding decision.** The ticket says *Decisions already made: keep the old save
    format*; the plan doesn't mention it. § 4 *M*: the prompt carries the whole ticket verbatim, so GPT sees
    the decision independently of the plan and can flag the gap.
13. **S and trivial with `needs-owner`.** S: short plan, no GPT call → § 5 rule 1 stops it ("whatever its
    size"); hand-off: "my short plan, no GPT design review — S". A trivial wording change labelled
    `needs-owner`: the *trivial* line sends it to § 5 anyway; the table's checkpoint row says the same.
14. **Poller fails while the review may still run.** `ao review ls` fails twice → `error: …`, exit 1 →
    `pr-review.md` *`error`*: release the lock, `ao report --stuck`, no new review requested.
15. **Spent budget, owner answers.** *Resume state*: "rounds used: 3", fixes awaiting review. The owner
    answers a design question without granting more rounds → `resume.md` § 2: the budget stays spent →
    the fix goes in, and the PR goes back to Needs Input for the owner to grant a fourth round or accept.

## Owner's decisions

1. *Medium = Claude plans, GPT reviews the plan* — **confirmed** by the owner, 2026-11-11 (relayed to
   session `music-garden-6` by the orchestrator): no design change.
2. *Wait for the limit to reset (02:49, 2026-11-11) and run the one GPT PR review, or hand off without
   it* — **A, run it** (owner, 2026-11-11, same relay). Run as round 1 above.
3. *GPT's round 1 asked for changes, and they are fixed on a new head GPT has not seen — the lock script
   above all. Run round 2 on the delta, or hand off as is?* — **open** (PR #88).
4. *The atomic GPT lock (`gpt-lock.sh`) replaces the `[GPT]` name marker you were asked to confirm; the
   name prefix stays, for visibility* — **open** for the owner to confirm (PR #88).
