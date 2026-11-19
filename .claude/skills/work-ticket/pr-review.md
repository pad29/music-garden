# AO's reviewer, and the limit

Read this when `work-ticket` § 8 sends you here: to tell the ChatGPT limit from a fault, or once AO's
reviewer is back in service.

## Why the PR review is temporarily GPT's through `ask.sh` (owner, 2026-11-09)

AO's reviewer reviews but cannot submit here: its runs end with *"reviewer Chat turn ended without
submitting a result"* while a one-word `codex exec` answers. AO runs it in Codex's sandbox, where `gh`
cannot read its configuration (`%APPDATA%\GitHub CLI\config.yml`: *Access is
denied*) and `ao` is not on PATH; `ao doctor` also warns `codex-launch-flags` — codex-cli 0.155.1 rejects
AO's launch flags. Each such run spends the ChatGPT limit on a verdict that never arrives. So until the
conditions below are met, **don't request one**: `work-ticket` § 8, steps 4–5, run the review through
`ask.sh`.

**Back to AO's reviewer only when both hold:** an AO review run has submitted a result, **and** the owner
has decided how Small and Medium tickets get their list of missing tests, which AO's reviewer is not
asked for — today the `ask.sh` review is their only independent test-gap check. Then remove every
active reference to the temporary route — `git grep -in temporar -- CLAUDE.md .claude/` lists them: this
section; `work-ticket` § 8 step 4 and the review lines of `handoff.md`'s templates (*In Review* and the
PR body); in `CLAUDE.md`, the roles list, *Explicit delegation* and *Calling GPT*; and the
design-reviewer brief's opening. The review records keep their history.

## The AO route

Take the GPT lock first (`CLAUDE.md` § Cost). `ao review trigger --pr <url>` the first time,
`ao review trigger` after that — after a failed run too. If it answers that the head was already reviewed
right after a push, wait a few seconds and retry once. The reviewer is the one the orchestrator
configured (`CLAUDE.md` § AO); if it tells you the settings changed since you were spawned, pass the new
ones (`--model`, `--effort`) — never settings of your own. Never on a draft PR.

Then wait for the verdict on the PR's **current head**. An approval posts no comment for you to notice,
so run this as a background command; the harness wakes you when it exits. It prints one line —
`<status> <verdict> <run-id>` for the run on the current head, exit 0; or, exit 1, `error: <message>`
when `ao review ls` failed, or gave output it couldn't read, twice in a row, or `timeout` after about an
hour:

```bash
pr=<n>; head=$(gh pr view "$pr" --json headRefOid -q .headRefOid) || { echo "error: gh pr view"; exit 1; }
err="${TMPDIR:-/tmp}/ao-review-${AO_SESSION_ID:-$$}.err"; fails=0
for i in $(seq 60); do
  if out=$(ao review ls --json 2>"$err"); then
    r=$(printf '%s' "$out" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
      try{const[pr,head]=process.argv.slice(1);const rv=(JSON.parse(d).reviews||[]).find(x=>String(x.prNumber)===pr);
      const run=rv&&rv.latestRun;if(!run||run.targetSha!==head)return console.log("none");
      console.log(run.status+" "+(run.verdict||"-")+" "+run.id)}catch(e){console.log("error: "+e.message)}})' "$pr" "$head")
  else r="error: $(head -c 300 "$err")"; fi
  case "$r" in
    error:*) fails=$((fails+1)); [ $fails -ge 2 ] && { echo "$r"; exit 1; } ;;
    running*|queued*|pending*|none) fails=0 ;;
    *) echo "$r"; exit 0 ;;
  esac
  sleep 60
done
echo timeout; exit 1
```

`none` (no run on this head yet) keeps it waiting; it is never an approval, and nor is a verdict for an
older head. `ao review ls --json` holds the run's full record. Then:

- **Approved on the current head** → `work-ticket` § 8, step 6.
- **Changes requested** → its inline comments are in this session; `work-ticket` § 8 step 5's rules
  apply. Reply on the thread of each finding you disagree with, and leave it open; after pushing the
  fixes, resolve the threads you fixed (`ao pr resolve-comments <n> <comment-ids>`).
- **`error`** → the poller could not see the review, which may still be running: **keep the GPT lock** —
  released, it would let another session start a GPT job beside a run that may still be going — and
  stop: `ao report --stuck`, quoting the error and saying you hold the lock. **Never request another
  review** on a run you could not see. Release the lock only once `ao review ls --json` shows the run
  ended — or `ao review cancel` ended it and `ao review ls` confirms. If the session is ended instead,
  its lock stays: nothing breaks it automatically. The owner clears it by hand, with the command
  `gpt-lock.sh status` prints, once `ao review ls <session>` shows none of its runs still going — a
  run can outlive its session.
- **Failed or cancelled, or `timeout`** → `ao review ls --json` must show the head's run ended, or no
  run for it; if one is still running, keep the lock and run the poller once more, then stop as for
  `error`. Then rule out the limit (below). At the limit → Needs Input, with the reset time. Otherwise
  request the review again, **once**; if that fails too, stop: `ao report --stuck` with what failed and
  the error. The ticket stays In Progress. Release the lock once the run has ended, whichever way —
  never while it may still be running.

## The limit

**A failed `ask.sh` call names the limit itself:** it exits **69** with one stderr line, *"ask.sh: usage
limit — try again at <time> (codex exit N)"*, or, when codex gave no reset time, *"codex gave no reset
time"* and codex's message. Any other codex failure exits 1 with codex's exit status and its error
messages — or, when codex left none, its last events — on stderr; a bad call exits 2, and no codex on
PATH 127. Exit codes: `ask.sh`'s header comment. No probe needed.

**A failed AO reviewer run doesn't say why:** its `body`, *"reviewer Chat turn ended without submitting
a result"*, came on 2026-11-08 with the limit spent, and on 2026-11-09 with it available. A one-word call
shows the limit (it is a GPT job: take the GPT lock):

```bash
codex exec --skip-git-repo-check --sandbox read-only -m gpt-6-astra "Reply with one word: ok"
```

It answers *"You've hit your usage limit … try again at <time>"* when it is spent. At the limit, either
way: no retry, and never another reviewer agent, model or effort — Needs Input, with the reset time; the
owner decides whether to wait.
