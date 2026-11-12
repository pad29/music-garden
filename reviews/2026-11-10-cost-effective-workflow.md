# 2026-11-10 — Size the workflow's loop and cut its token cost

Branch `claude/cost-effective-workflow` · ad-hoc work the owner approved directly (no ticket), 2026-11-10 ·
AO sessions `music-garden-4`, then `music-garden-6` (GPT's PR review and its fixes), then
`music-garden-7` (took the PR over 2026-11-11; GPT's round 2 and its fixes) · **Medium**
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

## Takeover, round 2 (session `music-garden-7`)

**Takeover** (2026-11-11): `ao session claim-pr 88` answered *claimed*; `ao session ls` then listed PR #88
against `music-garden-7` only, none against `music-garden-6`. Takeover comment on the PR. I did not use
`resume.md` § 1's block as written: I ran `git checkout -B claude/cost-effective-workflow <headRefOid>`,
which Git refused because `music-garden-6`'s worktree still has that branch checked out — nothing
changed — and then worked detached at `2b44a4c`, pushing `HEAD:claude/cost-effective-workflow`. The
documented block (`git switch -C "$(git branch --show-current)" <headRefOid>`) moves the session's own
branch instead, and would not have hit this.

**Found on the takeover — the suite failed on this worktree.** `core.autocrlf=true` and `* text=auto` check
the docs out with CRLF here; `music-garden-6`'s worktree had LF. `workflow-scripts.test.mjs`'s
`` ```bash\n `` regex then missed `pr-review.md`'s poller block, the module threw at load, and its 12 lock
and poller tests never ran: 646/647, one file-level failure, where `2b44a4c`'s record says 658/658. Fixed
before GPT's round 2 (and shown to it): both workflow test files read the docs with CRLF normalised to LF.
Then 658/658.

### Round 2 on the delta `cee6a86..2b44a4c` — Changes requested

Fresh, read-only, `ask.sh`, GPT lock taken (`acquired`) and released (`released`, then `free`); the delta
plus the uncommitted CRLF fix; round 1's verdict quoted verbatim; the owner's decisions 3–5 below given as
binding. **904k input tokens (816k cached), 10.1k out.**

<details><summary>GPT's round-2 review, verbatim</summary>

Reviewed `cee6a86..2b44a4c0e5e2a7d2a2e298d12642cad69e9288d5`, plus the working-tree CRLF fixes and recorded owner decisions. No files edited. The CRLF normalization is appropriate.

**Round-1 findings**

| # | Status | Assessment |
|---|---|---|
| 1 | Partly | Atomic acquisition fixes the original race; stale recovery still permits overlapping jobs. |
| 2 | Partly | The owner-approved routing is preserved, but step 0 also matches the replacement’s own takeover comment. |
| 3 | Partly | Malformed JSON now produces a nonzero poller result, and polling failure stops re-requesting; permanent errors still retry, and releasing an uncertain run’s lock breaks exclusivity. |
| 4 | Resolved | M prompts explicitly require the complete ticket and owner answers. |
| 5 | Resolved | The resume entry identifies PR records and explicitly skips Linear for ad-hoc work. |
| 6 | Partly | Exit status and session-specific logs are fixed; diagnostics remain truncated. |
| 7 | Resolved | `needs-owner` overrides triviality in both instructions and table. |
| 8 | Resolved | S consistently has Claude’s short plan without GPT design review. |
| 9 | Resolved | The cited repository paths and extracted section references are corrected. |

**Round-1 missing tests**

| # | Status | Assessment |
|---|---|---|
| 1 | Partly | Concurrent acquisition is tested, but stale recovery’s dangerous interleaving is not controlled or tested. |
| 2 | Resolved | Walkthrough 10 covers the ownership cases and hour boundaries under the owner-approved policy. |
| 3 | Resolved | Walkthrough 11 describes PR-based recovery without Linear operations. |
| 4 | Resolved | Walkthrough 12 supplies the omitted binding decision independently. |
| 5 | Resolved | Walkthrough 13 covers S and trivial `needs-owner` checkpoints. |
| 6 | Partly | Basic failures are tested; permanent-error handling and exclusion across sessions after polling failure are missing. |
| 7 | Partly | A manual failing-command check is recorded; complete diagnostics and simultaneous log isolation are untested. |
| 8 | Resolved | Walkthrough 15 preserves the exhausted review budget. |
| 9 | Partly | Tests cover paths and selected sections, but do not validate step numbers or all named procedure headings. |
| 10 | Not resolved | CLI help is recorded, but the requested live ownership/retirement/push walkthrough is not demonstrated. |

**Findings on the delta**

1. **High — [gpt-lock.sh:43](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-7/.claude/gpt/gpt-lock.sh:43): stale recovery still breaks mutual exclusion.**  
   Two contenders observe stale holder S. A removes S’s directory, acquires a new lock and starts GPT. B, acting on its earlier observation, moves **A’s live lock** aside. Before B restores it, C acquires the vacant path and starts GPT. The post-move ownership check detects the mistake only after exposing the gap. The admitted window therefore defeats the core guarantee. **Require recovery serialized with acquisition, or disable automatic breaking until recovery can safely exclude contenders.**

2. **High — [pr-review.md:65](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-7/.claude/skills/work-ticket/pr-review.md:65): polling failure releases a potentially active job’s lock.**  
   Worker A’s review remains running while `ao review ls` fails twice. The documented outcome releases A’s lock; waiting worker B can immediately acquire it and launch another GPT job. “Never request another review” constrains A, not B. The repeated-timeout path reaches the same outcome. **Keep the reservation until termination is established, or cancel and confirm termination before releasing; stopping observation is not job completion.**

3. **Medium — [resume.md:59](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-7/.claude/skills/work-ticket/resume.md:59): the ownership check also rejects the replacement.**  
   Section 1 requires `Taken over from old by AO session new`. That comment names **both** sessions. Step 0’s alternative condition—“a takeover comment … names you”—therefore matches `new`, even when AO correctly assigns it the PR. **Specify that the comment identifies this session as the relinquishing/replaced owner, not the acquiring owner.** This concerns step 0’s implementation, not the accepted late-reply policy.

4. **Medium — [pr-review.md:47](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-7/.claude/skills/work-ticket/pr-review.md:47): permanent errors still receive an unconditional retry.**  
   Authentication failure, permission denial or an unsupported command all enter the same `error:*` branch, sleep and retry. `CLAUDE.md` permits a retry only for a **clearly transient** failure. **Classify failures conservatively: stop immediately on permanent or unclassified errors; permit one retry for an identified transient error.** Round-1 finding 3 explicitly requested this distinction.

5. **Medium — [CLAUDE.md:143](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-7/CLAUDE.md:143): the verification recipe still hides failure diagnostics.**  
   `grep -A12` prints only twelve lines following each failure marker. A longer assertion diff or stack loses its remaining diagnostic content; `tail -n 8` generally supplies the suite summary, not that missing content. **Print the complete log on failure, retaining the saved exit status.** Extracting and testing this recipe would test behavior, just as extracting the poller already does.

6. **Medium — [workflow-scripts.test.mjs:48](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-7/tests/workflow-scripts.test.mjs:48): the fake commands are not executable on POSIX.**  
   `writeFileSync` creates `ao`, `gh` and `sleep` without executable permissions. The suite explicitly selects ordinary Bash on non-Windows systems, where these files cannot execute; command lookup selects installed commands or fails the sandbox assertion. **Create the fakes with executable permissions and verify that all three command lookups resolve to the expected fake files.**

7. **Medium — [gpt-lock.sh:31](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-7/.claude/gpt/gpt-lock.sh:31): filesystem failures are reported as successful acquisition/release or ordinary contention.**  
   Failure to write `owner` does not prevent `acquired`/exit 0. Failure of `rm -rf` at line 72 still ends with `released`/exit 0. A failed `mkdir` without an existing lock returns busy, potentially producing ninety minutes of retries for a filesystem error. **Check these operations, return a nonzero error for filesystem failures, and report acquisition only after publishing a valid claim.**

**Missing tests required**

1. **Automatable under `tests/`:** force two stale-recovery contenders and a third acquirer through finding 1’s ordering using barriers; assert that an active holder’s lock cannot be displaced and only one job starts.
2. **Written walkthrough:** A’s review remains active after polling errors or repeated timeout; B attempts acquisition. B must remain blocked until A’s run is confirmed ended.
3. **Written walkthrough:** after `Taken over from A by B`, A stops and B continues through step 0.
4. **Automatable under `tests/`:** permanent error → one poll; identified transient error → at most two; malformed output → nonzero failure with the documented retry policy.
5. **Automatable under `tests/`:** extract the trimming recipe; a failing command emits diagnostics longer than twelve lines, including a late sentinel. Require exit 1 and the sentinel; run two session IDs concurrently and verify separate logs.
6. **Automatable under `tests/`:** execute the fake-command fixtures on POSIX as well as Git Bash; fail setup if path conversion or any fake-command lookup fails.
7. **Automatable under `tests/`:** inject failed directory creation, owner-file publication and removal; require truthful nonzero results and preserved ownership information.
8. **Automatable under `tests/`:** mutate a valid reference to `work-ticket § 8 step 99` and a nonexistent named procedure heading; require reference validation to fail.
9. **Written live AO walkthrough:** demonstrate `--claim-pr` ownership transfer, retirement of the old owner and a push targeting the existing PR branch.

Syntax checking passed. The full suite exited nonzero because this read-only sandbox denied temporary fixture creation (`EPERM`), including all twelve workflow shell tests; I cannot independently certify 658/658 here. No real GPT lock or AO session names were touched.

**Changes requested**

</details>

### My answers to round 2

1. **High — stale recovery still breaks mutual exclusion.** **Agreed.** The move-aside / check / put-back
   acted on the path, not on the holder: a late breaker could move a live lock aside and open the gap.
   Rebuilt: a break of holder S first takes `<lock>.break.S` (`mkdir`, atomic), then **re-reads the
   holder under it** and removes the lock only if it is still S and AO still doesn't list S. While the key
   is held nothing else can change the lock — S is dead, other breakers of S are shut out, acquirers fail
   on the existing directory — so a session acting on an old view can no longer remove a lock taken since.
   No move-aside, no put-back. Exposed as `gpt-lock.sh break <id>`, which `acquire` uses, so the late
   breaker can be tested directly. **New residual, documented in the script:** a breaker that dies while
   holding the key (a window of one `ao session ls`) leaves the key behind, and that lock stays
   unbreakable until someone removes the key by hand; `status` shows it. It fails closed — waiters stay
   busy — rather than letting two jobs run.
2. **High — polling failure releases a lock a live run may still need.** **Agreed.** `pr-review.md`:
   on **`error`**, keep the lock, report `--stuck` saying you hold it, and release only once
   `ao review ls` shows the run ended (or `ao review cancel` ended it and `ao review ls` confirms); a
   session that is ended instead stops being listed, so the next `acquire` breaks its lock. Failed /
   cancelled / `timeout`: release once the run has ended, never while it may still run. `CLAUDE.md`
   § Cost says the same.
3. **Medium — step 0 also matches the replacement's own takeover comment.** **Agreed.** Step 0 now stops
   only on a comment saying the PR was taken over *from* you, and says why being named as the new owner
   is no reason to stop.
4. **Medium — permanent errors still get an unconditional retry.** **Disagreed; not changed.** What the
   poller retries is `ao review ls`, a local, side-effect-free status read: no GPT call, no review, no
   write. One extra read 60 s later costs nothing, and after it the poller stops — it never loops. Telling
   "permanent" from "transient" would mean matching `ao`'s error texts, which nothing documents and which
   change with AO releases; GPT's own conservative rule ("stop on unclassified errors") would then stop
   on every blip, and a stopped poller now means a `--stuck` session holding the GPT lock (finding 2) —
   the costlier failure. I read `CLAUDE.md` § When something external breaks as aimed at actions that
   spend or loop. If the owner reads it as covering this read too, the fix is one line (`fails -ge 1`).
   Round 1's finding 3 asked for this distinction; round 1's answer said "Agreed" and did not build it —
   this answer replaces that one for this part.
5. **Medium — the recipe still truncates diagnostics.** **Agreed**, and with GPT's point that extracting
   it makes it testable. `CLAUDE.md` § Working lean now prints it as a fenced block: on success the last
   8 lines; on failure the whole log except passing (`✔`) lines — every diagnostic kept, the passing lines
   dropped. Tested by running that block (missing test 5).
6. **Medium — the fakes are not executable on POSIX.** **Agreed.** Written with mode `0755`, and the
   sandbox now requires all three lookups to resolve, each to the fake (a missing one used to pass).
   Not run on a POSIX machine: there is none here.
7. **Medium — filesystem failures look like success or contention.** **Agreed.** `acquire`: a failed
   owner write removes the lock and exits 1, and the owner file is read back before `acquired`; a `mkdir`
   that fails twice with no lock present exits 1 with its error (so `wait` stops at once, not after 90
   tries). `release` and a break exit 1 if the directory survives `rm -rf`. Also: on Git Bash the script
   now converts the lock path with `cygpath -u`, so a `C:\…` `GPT_LOCK_DIR` globs correctly in `status`.

### Missing tests, round 2

1. **Stale-recovery interleaving — added**, automated: a breaker acting on an old view (`break
   music-garden-3` after another session broke it and took the lock) → 75, the lock untouched and still
   excluding a third session; a listed holder is never broken; a break already in progress → acquire busy,
   `status` shows it, and the key is given back; six sessions breaking the same stale lock at once →
   exactly one holds it (three rounds). The exact three-party timing GPT describes isn't reproducible
   without hooks in the script; the late-breaker test is the step that interleaving needs, made directly.
2. **Active review after polling errors — written walkthrough** 16.
3. **Takeover comment A → B — written walkthrough** 17.
4. **Permanent vs transient poll errors — not added** (answer 4).
5. **Test-output recipe — added**, automated: the block extracted from `CLAUDE.md`, the suite replaced by a
   fake that fails with 40 diagnostic lines and a late sentinel → exit 1, the sentinel printed, no passing
   lines; a pass → at most 9 lines, exit 0; two sessions at once → separate logs, neither with the
   other's output.
6. **POSIX fakes — partly**: the setup now fails if any fake isn't the one found (answer 6); not run on
   POSIX here.
7. **Filesystem failures — partly**: a lock it can't create → `acquire` and `wait` exit 1 at once,
   automated. A failed owner write and a failed removal are not injectable on Windows without ACL changes;
   checked by reading.
8. **Step numbers — added**, automated: every `work-ticket` § n step m (and m–k) must be a numbered step of
   that section. Named procedure headings (*The limit*, *`error`*) are **not** validated.
9. **Live AO takeover — partly, by this session**: the claim moved ownership (AO lists the PR against
   `music-garden-7` only), the takeover comment was posted, and the push targets the existing PR branch.
   Not shown: `ao spawn --claim-pr` itself (I claimed with `ao session claim-pr`), or a woken old session
   running step 0.

**Mutation audit** (each applied, run, reverted; files compared byte-for-byte after): no holder re-check
under the break key → 1 test fails; a `mkdir` failure reported as busy → 1; no break key at all → 1; the
recipe back to `grep -A12` → 1; the recipe losing its exit status → 2; a `work-ticket` § 8 step 9
reference → 1.

## Walkthroughs, round 2

16. **A's review may still run when its poller fails.** A holds the lock and triggered AO's review;
    `ao review ls` fails twice → `error:`, exit 1 → `pr-review.md` *`error`*: A keeps the lock and reports
    `--stuck`, saying so. B runs `acquire` → busy (`held by A`), then `wait`. B gets the lock only when A
    releases it after `ao review ls` shows the run ended, or when A is terminated and AO stops listing it —
    then B's next try breaks the lock. If B gives up after 90 minutes it reports busy; the owner sees
    `[GPT]` on A's name and A's `--stuck`. *(Round 3, finding 2: A being terminated is no longer
    enough — walkthrough 18.)*
17. **Takeover comment A → B.** B posts *"Taken over from `A` by AO session `B`"* and claims the PR. The
    owner messages A: step 0 — `ao session ls` lists the PR against B, and the comment says it was taken
    over from A → A writes nothing and stops. The owner's answer reaches B: `ao session ls` lists the PR
    against B; the comment names B only as the session it was taken over *by* → B continues.

## Takeover, round 3 (session `music-garden-8`)

**Takeover** (2026-11-11): spawned by the orchestrator with PR #88 already claimed (`ao session ls` listed
#88 against `music-garden-8` only). Takeover comment on the PR. `resume.md` § 1's block as written, without
the claim line: the session branch was untouched, so `git switch -C <session-branch> d755a98` moved it to
the PR head; pushes go to `HEAD:claude/cost-effective-workflow`. Owner decisions 6 and 7 recorded below.
On `d755a98`: syntax check passes, 665/665 tests (CRLF checkout).

### Round 3 on the delta `2b44a4c..d755a98` — Changes requested

Fresh, read-only, `ask.sh`, GPT lock taken (`acquired`) and released (`released`, then `free`); the delta
plus the uncommitted record of decisions 6–7; round 2's verdict quoted verbatim; decisions 5–7 given as
binding, finding 4 closed by the owner. **850k input tokens (770k cached), 6.3k out.** The last round the
budget allows (decision 6).

<details><summary>GPT's round-3 review, verbatim</summary>

Reviewed only `2b44a4c..d755a98`, plus the uncommitted owner decisions. No files edited. Two exclusivity defects remain.

Round-2 findings:

| # | Status | Assessment |
|---|---|---|
| 1 | Partly | The break key serializes competing breakers, but a normal release can still replace the lock between the holder check and deletion. |
| 2 | Partly | Polling errors now retain the lock; the session-termination exception still permits recovery without confirming the review ended. |
| 3 | Resolved | Step 0 distinguishes the relinquishing owner (“from”) from the replacement (“by”). |
| 4 | Closed by owner | Decision 7 accepts one retry. No further change or tests requested. |
| 5 | Resolved | The recipe preserves exit status and removes the twelve-line diagnostic limit. |
| 6 | Resolved | Fakes receive executable permissions, and setup requires all three command lookups. POSIX execution remains unverified. |
| 7 | Partly | Acquisition/publication/removal errors are checked; errors creating or removing the new break key remain suppressed. |

Round-2 missing tests:

| # | Status | Assessment |
|---|---|---|
| 1 | Partly | Late-breaker, existing-key and concurrent-break tests exist; no barriers control an actual in-flight break, and release during its AO read is uncovered. |
| 2 | Partly | Walkthrough 16 covers polling errors, but treats worker termination as sufficient recovery; repeated timeout is not traced explicitly. |
| 3 | Resolved | Walkthrough 17 demonstrates A stopping and B continuing after the takeover comment. |
| 4 | Closed by owner | Decision 7 applies. |
| 5 | Resolved | Extracted recipe tests cover long diagnostics, late sentinel, exit status and concurrent session-log isolation. |
| 6 | Partly | Executable fixtures and lookup checks are added; no POSIX run is recorded. |
| 7 | Partly | Directory-creation failure is tested; publication and removal failures, including preservation of ownership information, are not. |
| 8 | Partly | Step references are validated and a mutation is recorded; named procedure headings remain unchecked. |
| 9 | Partly | Live claim transfer and branch-targeted push are recorded; the requested spawn path and a live old-owner retirement check are not demonstrated. |

New findings on the delta:

1. **High — [gpt-lock.sh:46](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-8/.claude/gpt/gpt-lock.sh:46): a release can invalidate the holder check under the break key.**

   B acquires `.break.S` and reads holder S. B pauses before its AO query. S finishes, releases normally, and A acquires the lock and starts GPT. S then terminates. B’s AO query reports S absent, so line 49 deletes **A’s live lock**. Another acquisition can now start overlapping work.

   The key excludes other breakers of S; `release` and fresh acquisition do not honor it. The comment that the holder is already dead when checked is therefore incorrect.

   **Required fix:** establish S’s death before the final holder reread under the key, with no intervening path that can replace the validated lock, or serialize release, recovery and acquisition through a common guard. An additional reread without a valid exclusion argument is insufficient.

   I reproduced the ordering using the actual extracted `break_stale` function with in-memory command doubles: it removed replacement owner A and returned success. No filesystem lock was touched.

2. **High — [pr-review.md:69](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-8/.claude/skills/work-ticket/pr-review.md:69): ending the worker bypasses the terminal-review requirement.**

   A starts an AO review, loses polling visibility, retains the lock and reports stuck. A is subsequently terminated. The newly documented exception lets B reclaim the reservation solely because AO no longer lists A. `break_stale` checks only session presence; it never checks the review run. If that review remains active, B starts overlapping GPT work.

   Neither this implementation nor walkthrough 16 establishes that ending the requesting worker synchronously ends its reviewer. The explicit “run shown ended” requirement is therefore bypassed precisely when visibility is uncertain.

   **Required fix:** preserve the reservation across worker termination until the associated run is confirmed terminal. Recovery needs sufficient job identity to perform that check and must fail closed when it cannot. Alternatively, establish and verify an AO lifecycle guarantee that terminates the reviewer before allowing this recovery path.

3. **Low, non-blocking — [gpt-lock.sh:45](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-8/.claude/gpt/gpt-lock.sh:45): break-key filesystem errors still masquerade as contention.**

   With a stale lock present, deny creation of its break key. `mkdir` fails although no competing key exists, but the script returns 75; `wait` repeats ordinary contention for up to ninety minutes. Likewise, failed key removal at line 54 is ignored and can leave recovery blocked.

   **Fix requested:** distinguish an existing key from creation failure, and report unsuccessful key cleanup as an error with its path.

The documented abandoned-key residual itself is acceptable: while the stale holder’s lock remains, an abandoned key prevents recovery and fails closed. It does not cause finding 1; the unguarded release does.

Remaining tests for this delta:

- **Automatable under `tests/`:** barrier-controlled break/release ordering from finding 1. Pause the AO lookup, release S, acquire A, remove S from the fake session list, then resume B; A must retain ownership and exclude another contender.
- **Automatable plus written AO walkthrough:** keep a review active while its requesting session disappears. Recovery must remain blocked until terminal confirmation. Include repeated timeout, and verify any claimed AO termination guarantee live.
- **Automatable:** inject owner-publication, lock-removal, break-key creation and cleanup failures. Assert truthful results and recoverable ownership information; command doubles can cover these without Windows ACL changes.
- **Automatable:** reject a nonexistent named procedure heading.
- **Execution/walkthrough still pending:** run fixtures on POSIX and complete the live spawn/takeover/old-owner-stop/push sequence.

Verification: game syntax checking, `bash -n`, both changed test files’ `node --check`, and all six reference tests passed. The full suite reported **611 passed, 54 failed**, with failures reporting denied temporary-directory creation (`EPERM`), including all 18 workflow shell tests. I cannot independently certify the author’s 665/665 result or the live AO lifecycle behavior here.

**Changes requested**

</details>

### My answers to round 3

1. **High — a release can invalidate the holder check under the break key.** **Agreed.** Under the key,
   the old code read the holder *before* asking AO whether it was dead; GPT's sequence (S releases, A
   acquires, S ends, all during B's `ao session ls`) then removes A's live lock. The comment claiming the
   holder was already dead at the re-read was wrong. Fixed by the order GPT asks for: under the key, first
   establish that S is dead (AO no longer lists it, and finding 2's run check), **then** re-read the holder
   and remove the lock only if it is still S. A dead S can no longer release, other breakers are shut out
   by the key, and acquirers fail on the existing directory, so nothing can replace the validated lock
   between the re-read and the `rm`. **Residual, documented in the script:** a holder *restored*
   (`ao session restore`) inside that window of milliseconds could release in it; a restore takes far
   longer.
2. **High — ending the worker bypasses the terminal-review requirement.** **Agreed.** A break now also
   requires `ao review ls <holder> --json` to show none of the holder's review runs queued, pending or
   running (the poller's in-progress states). It fails closed: if `ao review ls` fails or its output
   can't be read, the run counts as going and the lock stays. Checked live first: `ao review ls <id>
   --json` answers for terminated and merged sessions (exit 0) and exits 1 for an unknown id. So
   recovery is identified by the holder's session; no job identity needs storing in the lock.
   `pr-review.md` *`error`*, `CLAUDE.md` § Cost and `tests/README.md` say the same. **Not addressed:**
   whether ending a session kills an `ask.sh` (codex) process it started in the background. GPT did not
   raise it, and AO has no record of such a job to check.
3. **Low — break-key filesystem errors masquerade as contention.** **Agreed.** A key that can't be created
   and isn't a directory already is `error: could not create the break key …`, exit 1, so `wait` stops at
   once. A key that can't be removed afterwards is `error: could not remove the break key …; remove it by
   hand`, exit 1.

### Missing tests, round 3

- **Break/release ordering — added, automated.** The fake `ao` now runs a one-shot hook during
  `session ls`: while B (holding S's key) waits on AO, S releases, A takes the lock, and S drops out of
  AO's list. B's break → 75, A still holds the lock and still excludes a third session.
- **A review that outlives its session — added, automated:** a dead holder with a `running`, `queued` or
  `pending` run, a failing `ao review ls`, or unreadable output → not broken; once the run has `failed` →
  broken. **Written walkthrough 18** below, including the repeated `timeout`. Not verified live: that AO
  keeps listing a run after its session ends.
- **Filesystem failures — partly.** Break-key creation failure is automated: a file in the key's way →
  `acquire` and `wait` exit 1 at once. Owner-publication, lock-removal and key-cleanup failures are not
  injectable here without restructuring the script around command doubles; checked by reading.
- **A nonexistent named procedure heading — not added** (named headings are still not validated).
- **POSIX run and the live `ao spawn --claim-pr` takeover — not done.** There is no POSIX machine here;
  this session was itself spawned with the PR claimed, so the claim side of the spawn path ran live, but
  no old session was woken to run step 0.

**Mutation audit** (each applied, run, reverted; the script compared byte-for-byte after): the holder re-read
before the AO check, the old order → 1 test fails; no review-run check → 1; a break-key `mkdir` failure
counted as a break in progress → 1; `running` not counted as in progress → 1. 4/4 caught.

## Walkthroughs, round 3

18. **A's session ends while its review may still run.** A holds the lock, triggered AO's review, and its
    poller ended `error` (or `timeout` twice): A keeps the lock and reports `--stuck`. The owner ends A.
    B runs `acquire`: AO no longer lists A, but `ao review ls A --json` shows A's run `running` → busy;
    B's `wait` keeps trying. When the run ends (`ao review ls A` shows it `failed`, or approved), B's
    next try breaks A's lock and takes it. If `ao review ls A` itself fails, the lock stays and B gives up
    busy after 90 minutes. The owner then sees `held by A` in `gpt-lock.sh status`, and A's `--stuck`
    note saying it holds the lock.

## Round 4 — owner-granted, beyond the budget (session `music-garden-8`)

### Round 4 on the delta `d755a98..8e04005` — Changes requested

A one-off round beyond the 3-round budget, **granted by the owner** (decision 8, B). Fresh, read-only,
`ask.sh`, GPT lock taken (`acquired`) and released (`released`, then `free`); the delta plus the
uncommitted record of decision 8; round 3's verdict quoted verbatim; decisions 5, 7 and 8 given as
binding. **357k input tokens (293k cached), 3.7k out.**

<details><summary>GPT's round-4 review, verbatim</summary>

Reviewed only `d755a98..8e04005`, with owner decision 8 as context. No files edited. Two correctness gaps remain.

Round 3 findings:

| # | Status | Assessment at `8e04005` |
|---|---|---|
| 1 | Partly | Moving the holder reread fixes the reported release/replacement sequence, but restoration still invalidates the exclusion argument. |
| 2 | Partly | Recovery checks the holder’s reviews and blocks on command/JSON errors, but incomplete or unrecognized review data permits recovery. |
| 3 | Resolved | Break-key creation and cleanup failures now return 1 with the affected path; existing directories remain contention. |

Round 3’s remaining tests:

| Requested coverage | Status | Assessment |
|---|---|---|
| Controlled break/release ordering | Resolved | The synchronous `on-ls` hook deterministically inserts replacement during the AO read. It models filesystem effects rather than invoking actual release/acquire commands. |
| Review outliving its session, repeated timeout, AO walkthrough | Partly | Busy states, command failure, invalid JSON and terminal recovery are covered; walkthrough 18 includes repeated timeout. Live post-termination run visibility remains unverified. |
| Publication, lock removal, break-key creation and cleanup failures | Partly | Break-key creation is covered; publication, lock removal and cleanup failure injection remain absent. |
| Nonexistent named procedure heading | Not resolved | No named-heading validation or negative test was added. |
| POSIX execution and live spawn/takeover/old-owner-stop/push | Partly | Spawn with claim and branch-targeted pushing are recorded; POSIX execution and live old-owner retirement remain unverified. |

The three new tests **would fail on the old code**: the ordering test receives success after deleting A’s lock; the active-review test acquires instead of returning busy; the key-creation test receives 75 instead of 1. I independently reproduced the first difference using extracted functions and in-memory command doubles. The reported 4/4 mutation audit does not cover cleanup errors.

New findings on the delta:

1. **High — [gpt-lock.sh:68–70](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-8/.claude/gpt/gpt-lock.sh:68): restoration defeats the revised exclusion argument.**

   B takes S’s break key and observes S absent. While B’s review query is in flight, the owner restores S. After the query has captured an empty/terminal review list, S reacquires its existing reservation—the “already yours” path ignores the break key—and starts GPT. B receives the query result, rereads holder S, and removes S’s active reservation. Another worker can now acquire and overlap.

   Restoration need not start and finish between the final reread and deletion. It can begin earlier and complete during the AO queries. The header’s “milliseconds versus restore duration” argument therefore does not establish exclusion.

   With the actual extracted `break_stale` and command doubles, making S active before the final holder read still produced removal and exit 0. This is a modeled interleaving, not a live AO reproduction.

   **Required fix:** serialize recovery with acquisition—including “already yours”—and release through a common guard. Ensure restored workers cannot resume using a reservation that recovery can revoke; use an incarnation/lease check if necessary. Another unsynchronized reread or timing assumption is insufficient.

2. **Medium — [gpt-lock.sh:53](/C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-8/.claude/gpt/gpt-lock.sh:53): `no_run_left` fails open on structurally invalid or unknown review data.**

   S disappears while its review remains active. If `ao review ls S --json` exits successfully with `{}`, `{"reviews":null}`, or `{"reviews":[{"latestRun":{}}]}`, the new parser returns 0. Recovery then removes the reservation despite having no usable evidence that the run ended. An unrecognized status also returns 0.

   I executed the extracted parser against those inputs: all were accepted. Invalid JSON correctly returned 1. The recognized busy prefixes—`running`, `queued`, `pending`—match the poller exactly; the defect is treating everything else as sufficient terminal evidence.

   **Required fix:** validate the response structure and run status. Accept an explicit empty review array and documented no-run representations; require recognized terminal states for existing runs. Missing, malformed or unknown values must retain the reservation. This concerns the new recovery parser, not the owner-accepted poller retry.

Missing tests for this delta:

- **Automatable under `tests/`:** restoration during recovery, including the existing-owner acquisition path; assert that no active reservation is removed.
- **Automatable:** missing/null/wrong-type `reviews`, missing/unknown run status, mixed terminal and busy reviews, and documented terminal/no-run representations.
- **Automatable:** break-key cleanup failure and the outstanding publication/removal failures, using command doubles; verify exit status, diagnostics and surviving ownership information.
- **Automatable:** nonexistent named procedure headings.
- **Live execution with a written record:** POSIX fixtures, AO run visibility after session termination, and old-owner retirement following takeover. The latter gaps remain outstanding verification, not additional delta findings.

Verification: game syntax check, `bash -n`, both workflow test files’ `node --check`, and `git diff --check` passed. All six reference tests passed. All 21 shell tests failed during setup because the sandbox denied `mkdtemp` with `EPERM`; their assertions did not execute. I did not rerun the full suite or independently certify the author’s 668/668 result. No round 5 is authorized.

**Changes requested**

</details>

### My answers to round 4

1. **High — restoration defeats the revised exclusion argument.** **Agreed.** "Already yours" and
   `release` ignored the break key, so a holder restored while a breaker held its key could re-acquire the
   lock the breaker was about to remove. My round-3 "milliseconds against a restore" argument was a timing
   assumption, as GPT says. Fixed with the common guard GPT asks for: every change to a held lock now goes
   through its holder's key, `<lock>.break.<holder>`. That covers a break, and the holder's own "already
   yours" and `release`, which try the key five times a second apart and otherwise answer busy (acquire,
   75) or error (release, 1). While a breaker holds S's key, S cannot touch its lock, whether dead,
   alive or restored; other breakers are shut out; acquirers fail on the existing directory. So the
   exclusion no longer rests on S being dead — the dead-first order stays as a cheap extra. No incarnation
   or lease was needed: a restored S that asks for the lock mid-break gets busy, then takes the lock afresh
   once the break is done. **Residuals:** a session that dies holding a key now blocks the holder's own
   release as well as breaks (it fails closed; `status` shows the key; removed by hand). And a restored
   session that runs GPT *without* calling `acquire` is outside the lock, as before — the docs require
   `acquire` before every GPT job.
2. **Medium — `no_run_left` fails open on invalid or unknown review data.** **Agreed.** It now requires
   `reviews` to be an array; a review with no run (`latestRun` absent or null) is fine; a run counts as
   ended only if its status is a string, not queued/pending/running, and is `failed` or `cancelled` (the
   end states AO's docs name) or the run carries a verdict (`approved`, `changes_requested`). Anything
   else — `{}`, `reviews: null`, a non-object, a run with no status, an unknown status — keeps the lock.
   The cost: if a submitted run reports a status this list doesn't know *and* no verdict, a dead holder's
   lock stays until removed by hand. A submitted run's fields have never been seen here (AO's reviewer
   can't submit; `reviews/2026-11-08-ao-gpt-workflow.md`), so this fails closed by design.

### Missing tests, round 4

- **Restoration during recovery — added, automated.** While B holds S's key and asks AO, the fake `ao`'s
  hook runs the real `gpt-lock.sh acquire` as S: S gets 75 (`busy: a break of your lock is running`),
  B's break succeeds, the key is given back, and S then acquires afresh. A second test: with S's key held,
  live S can neither re-acquire nor release, and the lock stays; with it free, "already yours" and
  `release` work and leave no key behind.
- **Review data shapes — added, automated:** nine shapes that keep the lock (`{}`, null, wrong types, a run
  with no or an unknown status, a busy status with a verdict, a mix of ended and queued) and six that let
  it go (no reviews, no run, null run, cancelled + failed, a verdict with an unknown status).
- **Key cleanup failure — added, automated:** something lands in the key while the breaker asks AO → exit
  1, `could not remove the key …; remove it by hand`, and `status` shows the key left behind.
- **Owner-publication and lock-removal failure injection — not added**; checked by reading.
- **Named procedure headings — not added.**
- **POSIX run, AO run visibility after termination, live old-owner retirement — not done** (no POSIX
  machine; no live run can be made to outlive a session here).

**Mutation audit** (each applied, run, reverted; the script compared byte-for-byte after): "already yours"
without the key → 2 tests fail; `release` without the key → 1; round 3's loose parser → 1; an unknown
status counted as ended → 1; a key-cleanup failure ignored → 1; no holder re-read under the key → 2.
6/6 caught.

## Owner's decisions

1. *Medium = Claude plans, GPT reviews the plan* — **confirmed** by the owner, 2026-11-11 (relayed to
   session `music-garden-6` by the orchestrator): no design change.
2. *Wait for the limit to reset (02:49, 2026-11-11) and run the one GPT PR review, or hand off without
   it* — **A, run it** (owner, 2026-11-11, same relay). Run as round 1 above.
3. *GPT's round 1 asked for changes, and they are fixed on a new head GPT has not seen — the lock script
   above all. Run round 2 on the delta, or hand off as is?* — **A, run it**: one fresh read-only `ask.sh`
   review of the delta `cee6a86..2b44a4c` only, the GPT lock taken first; findings plus missing tests; at
   the ChatGPT limit, no retry — stop and report (owner, 2026-11-11, relayed by the orchestrator in the
   spawn prompt of session `music-garden-7`, which took the PR over from `music-garden-6`). Run as round 2
   above.
4. *The atomic GPT lock (`gpt-lock.sh`) replaces the `[GPT]` name marker you were asked to confirm; the
   name prefix stays, for visibility* — **confirmed**: the lock replaces the marker, and `[GPT]` stays as
   a label (owner, 2026-11-11, same relay).
5. *Round 1's finding 2 (a late direct reply can wake the retired worker), agreed only in part* — **stays
   as built, no further change** (owner, 2026-11-11, same relay): *Continuing* step 0's ownership check,
   no forced orchestrator routing.
6. *GPT's round 2 asked for changes; they are fixed on a new head GPT has not seen — the stale-lock break
   above all, rebuilt. Run round 3 on that delta (the last round the budget allows), or hand off as is?* —
   **A, run it**: one fresh read-only `ask.sh` review of the delta `2b44a4c..d755a98`, quoting round 2's
   verdict and these decisions, the GPT lock taken first and released after; findings on the delta plus
   missing tests; at the ChatGPT limit, no retry — stop and report. If it approves, hand off; if it asks for
   changes, fix what is agreed, push once, and stop at Needs Input: the budget is spent (owner, 2026-11-11,
   relayed by the orchestrator in the spawn prompt of session `music-garden-8`, which took the PR over from
   `music-garden-7`).
7. *Round 2's finding 4 — the poller retries any `ao review ls` failure once; GPT wants permanent errors
   to stop at once — disputed (my answer 4)* — **A, keep the one retry as built, no change** (owner,
   2026-11-11, same relay).
8. *GPT's round 3 asked for changes (2 High, 1 Low); all three are agreed and fixed, on a head GPT has not
   seen, and the review budget is spent. Grant a round 4 on round 3's fixes, or hand off as is?* —
   **B, grant round 4** — a one-off round beyond the 3-round budget, **owner-granted**: one fresh
   read-only `ask.sh` review of the delta `d755a98..8e04005` only, quoting round 3's verdict and these
   decisions, the GPT lock taken first and released after; findings on the delta plus missing tests; at
   the ChatGPT limit, no retry — stop and report. If it asks for changes, fix what is agreed, push once,
   and stop at Needs Input: no round 5 without the owner (owner, 2026-11-11, relayed by the orchestrator
   `music-garden-5` to session `music-garden-8`).
9. *GPT's round 4 (owner-granted) asked for changes (1 High, 1 Medium); both are agreed and fixed, on a head
   GPT has not seen. No round 5 without the owner: grant one on round 4's fixes, or hand off as is?* —
   **open** (PR #88).
