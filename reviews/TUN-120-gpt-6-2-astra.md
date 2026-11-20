# TUN-120 — Run every GPT call on GPT 6.2 Astra

Branch `ao/gpt-astra/root` · Size S (label and section agree)

## Plan (Claude)

Prove the id first — one read-only `ask.sh` call — and edit nothing unless it answers from the new model.
Then replace `gpt-6-astra` with `gpt-6.2-astra` everywhere outside `reviews/` and `REVIEW-LOG.md`:

- `CLAUDE.md` § Calling GPT (the "Both routes run **Astra**" line, with a dated note for the change, and
  the two example commands) and § AO's *Model settings* line.
- `.claude/gpt/briefs/{author,design-reviewer,tester}.md` (the `ask.sh` examples; the ticket's
  `.claude/agents/gpt-*.md` paths have since moved here).
- `.claude/skills/gpt-design/SKILL.md`, `.claude/skills/work-ticket/SKILL.md` § 8 and `pr-review.md`'s
  limit probe.
- `tests/workflow-scripts.test.mjs` — two calls pass the id to a stubbed codex; the suite proves nothing
  else breaks.

`ask.sh` passes the model straight to `codex -m`, with no default or check of its own, so it needs no
edit. `AGENTS.md` gets no model name (ticket constraint).

## Probe 1 — refused (2026-11-19, 23:08 America/Chicago, Codex CLI 0.155.1)

GPT lock taken and released around it. Prompt: *"Reply with one line: the exact model id you are running
as. Do not read any files."*

```
.claude/gpt/ask.sh fresh read-only gpt-6.2-astra .claude/gpt/prompt.txt   → exit 1
ask.sh: codex failed (exit 1):
ask.sh:   Configured service tier `priority` is not advertised as supported for model `gpt-6.2-astra` and will be omitted from requests.
ask.sh:   Model metadata for `gpt-6.2-astra` not found. Defaulting to fallback metadata; this can degrade performance and cause issues.
ask.sh:   {"type":"error","status":400,"error":{"type":"invalid_request_error","message":"The 'gpt-6.2-astra' model is not supported when using Codex with a ChatGPT account.","code":"model_not_found"}}
```

No other id was tried (ticket, *Open questions*). Local evidence, no GPT call:

- The model list the Codex CLI fetched during that call (`~/.codex/models_cache.json`, client 0.155.1,
  05:08 UTC) offers `gpt-6-astra`, `gpt-6-sol`, `gpt-6-luna`, `gpt-5.6-{sol,terra,luna}` — no 6.2, and
  no Astra but `gpt-6-astra`.
- The Codex desktop app's list (`models_cache.codex_work_desktop.json`, client **0.169.0**, fetched
  2026-11-15) also has `gpt-6.1-sol` and `gpt-6.1-terra`, which the CLI's does not — the server's list
  depends on the client version. It has no `gpt-6.2-astra` either, but it is five days old.

So the id may be right and the CLI too old to be offered it, or the id may be wrong. Nothing was edited.

## Probe 2 — answered (2026-11-19, 23:41 America/Chicago, Codex CLI 0.171.0)

After the owner updated the CLI (decision 1): the same command and prompt, under the GPT lock. Exit 0,
`usage in=24318 (cached 0) out=56`. GPT's reply, verbatim:

> I’m Codex, based on GPT-6. My exact model ID isn’t available to me.

The model cannot name itself, so the record of which model ran is Codex's own, read from local files:

- **The model that ran:** the session log for the call
  (`~/.codex/sessions/2026/11/19/rollout-2026-11-19T23-41-10-01a1f779-….jsonl`, cwd this worktree)
  records `"model":"gpt-6.2-astra"` on all seven of its turn records, and no error.
- **The models on offer:** the list the 0.171.0 CLI fetched during the call (05:41 UTC) now has
  `gpt-6.2-astra` — *"GPT-6.2-Astra"* — and `gpt-6.2-sol`, beside the older ones. So the CLI's version was
  why probe 1 was refused.

## Build

The plan, as written: `gpt-6-astra` → `gpt-6.2-astra` at every site listed, one line each. The two wording
edits: `CLAUDE.md` § Calling GPT now reads *"Both routes run **GPT 6.2 Astra (`gpt-6.2-astra`)** at effort
high (owner, 2026-11-20)"*, and the design-reviewer brief *"Every role runs on GPT 6.2 Astra (owner,
2026-09; 6.2 since 2026-11-20; …)"*. `git grep -n "gpt-6-astra"` outside `reviews/` and `REVIEW-LOG.md`
now finds nothing.

**Outside the repo:** AO's project config ran the native reviewer on `gpt-6-astra`. That setting
belongs to the orchestrator (`CLAUDE.md` § Calling GPT), so I asked it to change it. It asked the owner
(decision 2), then changed it. I checked it with `ao project get music-garden`: reviewer `codex`, model
`gpt-6.2-astra`, effort high. **Caveat:** AO runs its own copy of Codex, 0.167.0. 6.2 is proven only on
the global CLI, 0.171.0, so the native reviewer is untested on the new model. If it refuses the model,
the orchestrator reverts the setting and tells the owner. `CLAUDE.md`'s *Model settings* line says so.
The reviewer is out of service either way (`pr-review.md`).

## PR review — round 1 (gpt-6.2-astra, `ask.sh`) — head `63fd024`

<details><summary>GPT's review, verbatim</summary>

**Changes requested** on `63fd024acbc3da592044ef4fb598e4260eadad22`.

- **Medium** — `CLAUDE.md:69,104–105` says both routes run 6.2 and attributes that setting to November 10. The owner chose 6.2 on November 20, and AO still has the prior reviewer setting. Asking the orchestrator to change it was correct. Describe 6.2 as the target for the disabled AO reviewer until the orchestrator confirms the change.
- **Medium** — `.claude/skills/work-ticket/pr-review.md:93` still tells a worker to call `codex exec` directly. Route this diagnostic through `ask.sh fresh read-only gpt-6.2-astra` and document its exit 69 for a usage limit.
- **Low** — `.claude/skills/work-ticket/handoff.md:80` and `reviews/README.md:30–31,43,60,63` still label model-specific work simply “Astra.” Update these templates so future records identify the version that actually ran. Existing review records can stay as written.

**Missing tests** — Add a static case that checks the model argument in every active role command and diagnostic example. At `tests/workflow-scripts.test.mjs:407`, use the stub’s recorded arguments to assert that a model refusal produces exactly one call with `-m gpt-6.2-astra`, surfaces the error, and exits nonzero.

The exact old ID has no matches outside `reviews/`. The recorded real probe identifies `gpt-6.2-astra` in the Codex session log. The worker’s test log reports 1,028 passed and zero skipped. I did not rerun the suite during this read-only review.

</details>

**My answers**

1. **Medium, `CLAUDE.md` date and AO setting.** *Agreed on the date; the rest is overtaken.* Since the
   review ran, the orchestrator has changed and confirmed the config (above), so the line names the real
   setting. It now carries the date, *"(AO project config, 2026-11-10; the reviewer's model,
   2026-11-20)"*, and the caveat that the reviewer is untested on 6.2. Line 69 already says
   *"(owner, 2026-11-20)"*.
2. **Medium, `pr-review.md`'s probe.** *Agreed:* the ticket's decision says every role runs through
   `ask.sh`, and `ask.sh` already names the limit with exit 69. The probe is now a one-word
   `prompt.txt` sent through `ask.sh fresh read-only gpt-6.2-astra`, and the text says it exits 69 when
   the limit is spent.
3. **Low, an unversioned "Astra" in `handoff.md` and `reviews/README.md`.** *Disagreed.* In those
   templates, "Astra" names the GPT family doing the job, and that stays true across model changes. A
   version there would be one more hand-written place to update at every change, which is the problem
   this ticket's *Why* names. The version that ran is recorded where it is a fact: `CLAUDE.md` § Calling
   GPT is dated, and each reviews file is dated. Nothing changed.
4. **Missing tests, both added** to `tests/workflow-scripts.test.mjs`:
   - *"ask.sh: a model refusal exits 1 with codex's error, after one call on the model it was given"* uses
     the stub, with the real `model_not_found` message from probe 1. It checks: exit 1, the error on
     stderr, no usage-limit verdict, exactly one codex call, and that call's only `-m` is
     `gpt-6.2-astra`.
   - *"every GPT command and setting in the docs names the model CLAUDE.md § Calling GPT names"* reads the
     id from `CLAUDE.md` § Calling GPT instead of hard-coding it. It then checks every `ask.sh` command,
     every `codex exec … -m`, and the reviewer setting in `CLAUDE.md`, `AGENTS.md` and `.claude/**/*.md`.
     There are at least nine, so a pattern that stopped matching anything can't pass.
   - Mutations, each run and then reverted: with `gpt-6-astra` back in `tester.md`, the static test fails
     and names `tester.md:42`. With `ask.sh` sending `-m gpt-6-astra` instead of `$MODEL`, the refusal test
     fails.

## PR review — round 2 (gpt-6.2-astra, `ask.sh`) — head `7eb2912`, the delta from `63fd024`

<details><summary>GPT's review, verbatim</summary>

**Changes requested** on `7eb29120525a861f4f5a032f08df393839c2304e`.

- **Medium** — `tests/workflow-scripts.test.mjs:848–854` counts a direct `codex exec -m gpt-6.2-astra` as a valid call. Restoring the exact round‑1 diagnostic would keep the count at nine and pass. Require the limit probe to use `ask.sh fresh read-only` with the configured model.
- **Low, retained** — `.claude/skills/work-ticket/handoff.md:80` and `reviews/README.md:30–31,43,60,63` use “Astra” where the completed record identifies which model did the work. Use `<model id used>` in the templates. That records the version without adding a hard-coded ID to maintain.

**Missing test** — Replace the corrected probe in `pr-review.md` with its round‑1 direct command, keeping the model ID correct. The static check must fail and identify the probe.

The AO setting and date, exit‑69 guidance, and single-call refusal test resolve the other findings. The worker reports 1030/1030 passing. I reviewed the delta without rerunning the suite.

</details>

**My answers**

1. **Medium, the static test accepts a direct `codex exec`.** *Agreed.* Any doc line that runs
   `codex exec … -m` now fails the test, whatever the model, and the failure names the line. The test is
   now *"every GPT command in the docs goes through ask.sh, and it and the reviewer setting name the
   model CLAUDE.md § Calling GPT names"*. `pr-review.md:9` still says in prose that a one-word
   `codex exec` answers. It has no `-m`, it is history rather than a command, and it is not flagged.
2. **Low, retained: "Astra" in the templates.** *Agreed, as amended.* `<model id>` meets my round-1
   objection: it records which model ran without a hard-coded id to maintain. The five labels in
   `reviews/README.md` (lines 30, 31, 43, 60 and 63) and `handoff.md:80` now say `<model id>`, and one
   sentence under the size list defines it. This record's own headings use the id.
3. **Missing test, the mutation itself.** *Run.* With round 1's command put back in `pr-review.md`,
   correct model id and all, the test fails with `.claude\skills\work-ticket\pr-review.md:94 runs codex
   directly`. With the file restored, it passes.

## PR review — round 3 (gpt-6.2-astra, `ask.sh`) — head `9ea6cf7`, the delta from `7eb2912`

<details><summary>GPT's review, verbatim</summary>

**Changes requested** on `9ea6cf73573591fae407cc2f30e9777f5c18f3d9`.

- **Medium — `tests/workflow-scripts.test.mjs:848`.** The guard catches the round‑1 direct command, but the limit probe still counts toward the required nine if changed to `fresh workspace-write`. That gives a one-word diagnostic write access. Check the probe itself for `ask.sh fresh read-only` and the configured model.
- **Low — `reviews/README.md:30–31` and `.claude/skills/work-ticket/handoff.md:80`.** Bare `<model id>` parses as an HTML tag and disappears in rendered Markdown. Use inline code for the placeholders outside fenced examples.

**Missing test:** Change only `read-only` to `workspace-write` at `pr-review.md:94`. The static check should fail and identify that line.

The worker reports 1030/1030 passing. I reviewed the delta without rerunning the suite.

</details>

**My answers**

1. **Medium, the probe could become `workspace-write`.** *Agreed, and made general.* Every `ask.sh`
   command in the docs must now be `read-only`, except L's test pass: the tester brief, and
   `CLAUDE.md`'s line commented *"L's test pass"*. A failure names the line. The test is renamed to
   *"every GPT command in the docs goes through ask.sh, read-only but for L's test pass, and it and the
   reviewer setting name the model CLAUDE.md § Calling GPT names"*.
2. **Low, a bare `<model id>` disappears when rendered.** *Agreed for `reviews/README.md:30–31`*, which
   now use inline code. *Not for `handoff.md:80`*, which is inside the fenced hand-off template, like
   README's lines 46, 63 and 66. The finding itself exempts fenced examples, and other placeholders in
   that template are bare too. Unchanged.
3. **Missing test, the mutation.** *Run.* With only `read-only` changed to `workspace-write` on
   `pr-review.md:94`, the test fails with `.claude\skills\work-ticket\pr-review.md:94 is workspace-write`.
   Round 2's mutation, a direct `codex exec`, still fails with `… pr-review.md:94 runs codex directly`.
   With the file restored, the test passes.

This was the third round, so the fixes go unreviewed: no fourth review without the owner (decision 3).

## Owner's decisions

1. *`gpt-6.2-astra` is refused for this ChatGPT account through the Codex CLI (0.155.1). What next?* —
   **A: update the CLI and probe again**: the owner, through the orchestrator, 2026-11-19. The owner
   updated it to 0.171.0 (npm global).
2. *Switch AO's native reviewer to `gpt-6.2-astra` too?* — **yes**: the owner, through the orchestrator,
   2026-11-19. The orchestrator changed the config.
3. *GPT's review budget of three rounds is spent, and the third round's fixes are unreviewed. Accept them
   as they are, or allow a fourth round?* — **open**.
