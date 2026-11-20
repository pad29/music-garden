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

## Probe — the one-line call (2026-11-19, 23:08 America/Chicago)

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

## Owner's decisions

1. *`gpt-6.2-astra` is refused for this ChatGPT account through the Codex CLI (0.155.1). What next?* —
   **open**.
