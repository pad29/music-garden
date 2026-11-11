# 2026-11-10 — Size the workflow's loop and cut its token cost

Branch `claude/cost-effective-workflow` · ad-hoc work the owner approved directly (no ticket), 2026-11-10 ·
AO session `music-garden-4` · **Medium** under the new rules: my plan, GPT's design review, GPT's PR
review; no separate test pass.

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
