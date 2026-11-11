# Resuming a ticket

Read this when `work-ticket` sends you here: the ticket already has an open PR and you are a new
session, or the owner has answered your own Needs Input (*Continuing*, below).

**Who you are.** Either the orchestrator spawned you to resume — the owner answered more than an hour
after the Needs Input, so it did not wake the session that asked (`CLAUDE.md` § AO) — or your
instructions say to take over a ticket another session holds. You are continuing someone's work, not
starting over: never re-run the design, and never touch the old session's worktree, which may still have
the branch checked out.

## 1. Take the PR over

On the ticket, comment *"Taken over from `<old-session>` by AO session `<session-id>`"* — that retires the
old session's claim (`work-ticket` § 2). Then move this worktree's branch to the PR's head — only from an
untouched branch. If your spawn already claimed the PR (`ao spawn --claim-pr`; your prompt says so, or
`ao session ls` lists the PR against your session), drop the `ao session claim-pr … &&` line; otherwise
keep it — it refuses while a live session owns the PR, and then you stop and report it:

```bash
gh pr view <n> --json headRefName,headRefOid              # the PR's branch and full head SHA
ao session claim-pr <pr-url> --no-takeover &&             # refuses if a live session owns it
git fetch origin main <headRefName> &&
st=$(git status --short) &&                               # a status that fails stops it too
if [ -n "$st" ]; then echo "STOP: edits of your own; not resetting"
elif ! git merge-base --is-ancestor HEAD origin/main; then echo "STOP: commits of your own; not resetting"
else git switch -C "$(git branch --show-current)" <headRefOid>   # this branch, moved to the PR head
fi
git status; git branch --show-current; git rev-parse HEAD # HEAD must equal headRefOid
```

The reset runs only when the claim (if kept), the fetch and `git status` all succeeded, nothing is
uncommitted, and the branch has no commits of its own; otherwise stop — resetting would throw work away.
If HEAD already equals `headRefOid`, the takeover is done: skip the block. Never check out `FETCH_HEAD`.
The last line runs whatever happened before it; stop on anything unexpected. From then on push with
**`git push origin HEAD:<headRefName>`** — the PR's own branch, the one exception to
`git push -u origin HEAD`.

## 2. Read the hand-off — and only what it needs

In this order: the last **Needs Input** comment and its *Resume state*; every ticket and PR comment
after it (the owner's answer is there); the ticket's *Done looks like* and *Decisions already made*; the
reviews file, by section. **Recover documented facts before asking** — a hand-off written before
*Resume state* existed can still be rebuilt from the reviews file and the comments. Ask the owner (Needs
Input) only about a real gap: a decision nowhere recorded, or a state you cannot verify.

Respect what the record says: the size and the loop it chose; the design checkpoint already passed; the
review rounds already used (the third-round limit counts them); and an approval only for the SHA it
names — never for the head you are on unless they match. Re-run the suite on the head you start from.

## Continuing — the owner answered

1. Move the ticket back to **In Progress** — from Todo, claim it again as `work-ticket` § 2 says — and
   record each answer under *Owner's decisions*: the answer, and where and when it was given.
2. Keep the design you have. Only if an answer changes it materially, revise it — by size: **S**, you
   revise your plan; **M**, you revise your plan and GPT reviews the revision (fresh, read-only); **L**,
   GPT revises its design (`gpt-design`, *A revision*) and you critique it. Every GPT prompt stands alone
   (the reviews file's design and *Owner's decisions*, and what changed). Add the revision to the reviews
   file as a new section — never edit the original.
3. Pass `work-ticket` § 5 again, then carry on with § 6 — or with § 8 if the PR review was under way — on
   the same branch and PR.
