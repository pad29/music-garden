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

## PR review — round 1 (GPT 6.2 Astra, `ask.sh`) — head `63fd024`

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

## Owner's decisions

1. *`gpt-6.2-astra` is refused for this ChatGPT account through the Codex CLI (0.155.1). What next?* —
   **A: update the CLI and probe again**: the owner, through the orchestrator, 2026-11-19. The owner
   updated it to 0.171.0 (npm global).
2. *Switch AO's native reviewer to `gpt-6.2-astra` too?* — **yes**: the owner, through the orchestrator,
   2026-11-19. The orchestrator changed the config.
