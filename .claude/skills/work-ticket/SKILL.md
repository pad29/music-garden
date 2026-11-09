---
name: work-ticket
description: Carry a Tune Garden Linear ticket from GPT's design to a pull request AO's reviewer has approved, as an AO worker. Use when given a ticket ("work on TUN-12"), or, with none named, to take the top of Todo.
---

Ticket: $ARGUMENTS (empty means: take the top of Todo)

You are an AO worker: AO made this worktree and its branch, the orchestrator spawned you, and the owner
reads what you hand off. The whole lifecycle, in Linear states: **Todo → In Progress → (Needs Input ⇄
In Progress) → In Review → Done.** You move a ticket as far as In Review. Only the owner moves tickets
into Todo, and only the owner merges.

**Whether to stop for the owner once the design exists is decided in one place: § 5, the design
checkpoint.** § 7 says how to stop.

**No ticket** — ad-hoc work the owner asked for: skip every Linear step (§§ 1–2, ticket comments, state
moves) and the `Closes` line; the review record is `reviews/<date>-<slug>.md`, and hand-offs go to the
PR and AO. **A trivial change** — a typo, a comment, formatting: skip §§ 4–5 and GPT's test pass, and
write *"not required — trivial change"* in the hand-off's design and test lines. AO's review runs on
every PR either way.

## 1. Choose the ticket

- **A ticket was named** — in your spawn prompt, or by the owner. In Todo, claim it (§ 2). Already
  **In Progress**: its live claim (§ 2) names the AO session that holds it.
  - **This session** (you are coming back to it): carry on where you stopped.
  - **Another session, and your instructions say to take it over:** comment *"Taken over from
    `<old-session>` by AO session `<session-id>`"*, and continue it as a resumed ticket (§ 3).
  - **Another session, otherwise:** stop — `ao report --needs-input --note "<ID> is held by <session>"`.
- **None named:** list team **Tune Garden** issues in **Todo**, in Linear's own order (the owner's drag
  order), and take the first. If Todo is empty: `ao report --done --note "Nothing in Todo."` and stop.
  Never take Backlog, Needs Input or In Review tickets on your own.

## 2. Claim it

Re-read the ticket's state immediately before claiming. If it is no longer Todo, another session got
there first: back to § 1. Otherwise move it to **In Progress** and comment *"Picked up by AO session
`<session-id>` — ao://sessions/music-garden/<session-id>"*. Your ID is `$AO_SESSION_ID`; the link opens
only inside the AO app, so the ID is what identifies you.

**The comment is the lock — once you have checked it.** Two workers can both read Todo before either
moves the ticket. So after posting, list the ticket's comments and look for another session's **live**
claim posted before yours. A claim stays live until its own session hands off (a Needs Input or In
Review comment) or yields, or another session's takeover comment names it — so a session that stopped at
Needs Input earlier does not block you. If there is one, that session holds the ticket: comment that you
yield to it, `ao report --checkpoint --note "<ID>: yielded to <session>"`, and go back to § 1.

Then `ao report --checkpoint --note "Claimed <ID> <title>"`, and, if you chose the ticket yourself,
`ao session rename "$AO_SESSION_ID" "<ID> <title>"` so the owner's sidebar says what you are on.

## 3. Your worktree — AO already made it

- You are in it: check `git status` and `git branch --show-current`. Never `EnterWorktree`, never make
  another worktree, never rename the branch, and never edit AO's project checkout
  (`C:\Users\pavel\ao\projects\music-garden`), which stays on `main`.
- The branch is `claude/<id>-<slug>` when the orchestrator knew the ticket at spawn, otherwise AO's
  default, `ao/<session-id>/root`. Either is fine: Linear links the PR through the ticket ID in its title
  and the `Closes <ID>` line in its body. AO's branch tracks `origin/main`, so push with
  `git push -u origin HEAD` — never a bare `git push`.
- **Resumed ticket** — it already has an open PR (the ticket's GitHub link, or
  `gh pr list --state open --search "<ID> in:title"`), and you are a new session: the orchestrator could
  not bring the owner's answer back to the session that asked. Take the PR over without touching that
  session's worktree, which may still have its branch checked out — and only from an untouched branch:
  ```bash
  ao session claim-pr <pr-url> --no-takeover                # refuses if a live session owns it: stop there
  gh pr view <n> --json headRefName,headRefOid              # the PR's branch and full head SHA
  git fetch origin main <headRefName>
  git status --short                                        # must print nothing: no edits of yours
  git merge-base --is-ancestor HEAD origin/main             # must succeed: no commits of yours either
  git switch -C "$(git branch --show-current)" <headRefOid> # this session's branch, moved to the PR head
  git status; git branch --show-current; git rev-parse HEAD # HEAD must equal headRefOid
  ```
  If HEAD already equals `headRefOid`, the takeover is done: skip the commands. If a check fails, stop —
  resetting would throw work away. Never check out `FETCH_HEAD`. Run the last line even when a command
  before it failed, and stop on anything unexpected. From then on push with
  **`git push origin HEAD:<headRefName>`** — the PR's own branch, the one exception to
  `git push -u origin HEAD`.
  Then read every comment on the ticket and the PR, and the ticket's `reviews/<ID>-*.md`. You are
  continuing someone's work, not starting over: carry on from § 7, *Continuing* — not from § 4.

## 4. Design — GPT designs, you critique

Not for a resumed ticket: its design exists (§ 7, *Continuing*).

- Read the whole ticket and its comments, then `AGENTS.md`, `CLAUDE.md`, everything its **Read first**
  names, and the `reviews/` files for the area.
- Run the **`gpt-design`** skill with the ticket ID. GPT designs (`ask.sh fresh`: the thread § 6's test
  pass resumes), you critique, and both go into `reviews/<ID>-<slug>.md`, separate and verbatim.
- **Decisions already made** in the ticket bind GPT's design and your critique alike.
- No code yet.

## 5. The design checkpoint — stop or build?

GPT's design and your critique exist; no code does. Decide here.

**Stop at Needs Input (§ 7) if any of these holds:**

1. **The ticket is labelled `needs-owner` and has not been through a checkpoint with the owner yet.**
   Every `needs-owner` ticket stops at its first checkpoint, whether or not it lists questions, and
   *Owner's decisions* in the reviews file records the owner's answer. After that, it stops only for a
   question still open there, or a new one.
2. **The design or the critique raised a question that would have earned the ticket `needs-owner` had
   it been known at filing.** That is `file-ticket`'s test — only the owner can validate the result:
   anything musical (score-checked tunes, feel, sound), player-facing pacing, or a design decision with
   more than one defensible answer.
3. **§ 7's standing rule applies:** a new fork where the readings lead to materially different work, or
   a decision already made in the ticket that the work shows is wrong.

**Otherwise, build.** Smaller calls are yours: make them, and list each under *Choices I made that you
might overrule* in the hand-off.

**Where GPT's design and your critique disagree, you decide** — with your reasoning, and both sides
reported verbatim — **unless the disagreement is itself one of the owner decisions above. Then stop.**

## 6. Build and test

- Build GPT's design as your critique amended it. Syntax check and `node --test "tests/*.test.mjs"`
  after every edit.
- **The browser is AO's, serving this worktree.** `ao preview` did not drive the agent's browser in an
  unattended worker (measured 2026-11-08), so serve the worktree yourself, as a background command:
  ```bash
  PORT=$((8400 + ${AO_SESSION_ID##*-}))                # first candidate: music-garden-7 → 8407
  npx --yes http-server -p $PORT -c-1 -a 127.0.0.1 .   # background; if it can't bind, try the next port
  ( set -o pipefail; curl -fsS "http://127.0.0.1:$PORT/<a file this branch changed>" | cmp - "<that file>" )
  ao browser open "http://127.0.0.1:$PORT/index.html?dev"
  ```
  The `curl … | cmp` line must succeed. **A screenshot is not evidence unless you know which files
  produced it**: the port may be answered by another session's server, which is what the byte comparison
  catches. Stop the server when you are done.
  - AO redacts query values in the URLs it reports (`?dev=[redacted]`): judge the page, not `get url`.
  - **`file://` is out of reach** — AO's browser refuses it. A change that touches asset loading puts a
    `file://` check on the owner's playtest list and under *Not verified*.
  - **AO's browser cannot run JavaScript in the page** — there is no console input and no evaluate.
    Verify through what the page shows (`snapshot`, `act`, `console`, `errors`) and prove logic in Node
    tests. A check that needs page code — a `window.` probe, the playback goldens' console capture in
    `tools/goldens/README.md` — goes under *Not verified*, and on the owner's list when it matters.
  - **This worker's browser profile is its own** (AO isolates each worker's), so `localStorage` — saves,
    progress, settings — starts with none of the owner's. To test against stored data, create it in this
    browser first (play to it, or use the `?dev` buttons) and say so. Never point the game at
    `ao browser target chrome`: that is the owner's own Chrome and profile.
  - Once the PR exists, its Netlify deploy preview opens the same way. Take its URL from the
    deploy-preview check's link in `gh pr checks <n>` (for PR #82 it was
    `https://deploy-preview-82--tunegarden.netlify.app`).
- **GPT's test pass** — the tester brief, `ask.sh thread workspace-write`. The prompt must stand alone
  (`CLAUDE.md` § Calling GPT): point GPT at the reviews file and the ticket's *Done looks like*, say what
  you tested and what you could not reach, and list **where the build departs from its design, and
  why**, so it tests the departures as deliberate — and can object to them. If `ask.sh` reports that the
  resume failed, GPT worked from the prompt alone: say so in the record. Review every file it adds before
  keeping it. Fix what it found, and re-run everything the fixes touched.

## 7. Stop for the owner — Needs Input

**When:** § 5 says so; § 8's review loop ends here; or, later in the work, a decision turns out to be the
owner's (§ 5's tests), or **the owner should try it before it is worth finishing**: music, feel, pacing,
anything visual or audible that tests cannot judge. The standing rule holds at any point: a new fork
where the readings lead to materially different work, or a decision already made in the ticket that the
work shows is wrong, is a question for the owner, never a quiet change.

Then:
1. List each question under *Owner's decisions* in the reviews file, marked open. Commit what you have —
   at the design checkpoint, the reviews file alone — and push. Open a **draft** PR against `main` (or
   keep the PR you have): Netlify builds a preview for the phone, and a later session can claim the PR.
   **Never request AO's review on a draft.**
2. Comment on the ticket in the **Needs Input** format (§ Hand-off formats). File the same text with
   `ao report --needs-input` — § Hand-off formats shows how to keep it literal — and end with it as your
   last message.
3. Move the ticket to **Needs Input** and end your turn.

**Continuing.** The owner answers in this AO session, or on the ticket, moving it back to Todo; the
orchestrator brings the answer back to this session, or to a new one (§ 3). Either way:
1. Move the ticket back to **In Progress** — from Todo, claim it again as § 2 says — and record each
   answer under *Owner's decisions*: the answer, and where and when it was given.
2. Keep the design you have. Only if an answer changes it materially, have GPT revise it, with a prompt
   that stands alone (the reviews file's design and *Owner's decisions*, and what changed); add the
   revision to the reviews file as a new section — never edit the original — and critique it.
3. Pass § 5 again, then carry on with § 6, on the same branch and PR.

## 8. Finish — the PR and AO's review

1. Update the docs, per `CLAUDE.md` § Docs.
2. **Bring the branch up to date:** `git fetch origin`, merge `origin/main`, resolve conflicts, then re-run
   the syntax check, the whole suite, and any browser check the merge could have changed. Parallel
   tickets mostly collide in the `js/` files they share (`js/packages.js` above all, since every new level
   lands there), so resolve those by reading both sides, never by picking one.
3. Commit in the repo's style (a short imperative subject that says what changes for the player, a body
   that says why), push, and open the PR against `main` **ready for review** — or `gh pr ready` the draft.
   Ticket ID in the title: *"TUN-12 Let the free tunes carry sixteenth-note bars"*. Body in the **PR**
   format.
4. **Request AO's review:** `ao review trigger --pr <url>` the first time, `ao review trigger` after that;
   if it answers that the head was already reviewed right after a push, wait a few seconds and retry.
   Then wait for the verdict on the PR's **current head** — in the background, because an approval posts
   no comment for you to notice: poll `ao review ls --json` about once a minute in a background command
   that exits when the run for this head has finished, or after an hour (the harness wakes you when it
   exits). A verdict for an older head, or an error from `ao`, is not an approval.
5. **Read the verdict, then act:**
   - **Approved on the current head** → step 6.
   - **Failed or cancelled, no verdict within the hour, or no run for the head** → request the review
     again. After two such retries, stop: `ao report --stuck` with what failed; the ticket stays In
     Progress. A failure on the ChatGPT limit is not retried, and the reviewer's agent or model is never
     switched: that is Needs Input (§ 7), and the owner decides whether to wait.
   - **Changes requested** → its inline comments are in this session. Answer each: **agree** → fix it;
     **disagree** → reply on its thread with your reasoning and leave the thread open. Then:
     - **You disagreed with every finding:** nothing changed, so there is nothing new to review → Needs
       Input (§ 7), with the open findings quoted against your reasons. The owner decides.
     - **Otherwise:** re-run whatever the fixes touched, the browser included where it matters, and
       record the round in the reviews file **in the same commit as the fixes** — a commit after an
       approval would be a new head, and another review. Push once, and resolve the threads you fixed
       (`ao pr resolve-comments <n> <comment-ids>`). **If that was the third round, stop** → Needs Input
       (§ 7) without a fourth review: the fixes awaiting review, the disputed findings, and the decision
       you need. Otherwise, back to step 4.

   A review loop that ends in Needs Input is not In Review, and not `--done`.
6. **Hand off.** Check that the approved head is still the PR's head (`gh pr view <n> --json
   headRefOid`). Edit the PR body's **Review** section to add the verdict — an edit is not a new head.
   Wait for Netlify (`gh pr checks <n> --watch`) and take the preview URL from the deploy-preview check's
   link. Comment on the ticket in the **In Review** format, move the ticket to **In Review**, file the
   same text with `ao report --done … --pr-created <url>`, and end with it as your last message.

## Hand-off formats

Every hand-off goes to three places: the ticket, the PR, and AO — `ao report` and your last message in
this session. Use these shapes exactly, headings included, so the owner always knows where to look. Leave
a section out only when the template says it may be left out.

The text is full of backticks, which the shell would run. Pass it literally — a quoted heredoc into a
variable, then the variable:

```bash
note=$(cat <<'EOF'
<the hand-off text>
EOF
)
ao report --done --note "$note" --pr-created <url>
```

PR bodies the same way: `gh pr create … --body-file -` or `gh pr edit <n> --body-file -`, fed by a
`<<'EOF'` heredoc.

### The playtest checklist — the heart of every hand-off

This is how the owner spends his time, so it must be honest and short.

- **Each item is where → do → expect**, and "expect" names something the owner could see or hear go
  WRONG: *"three clicks a bar, the first one accented"*, never *"it works"* or *"check the bars"*.
- **Build it from three sources, in this order:**
  1. each *Done looks like* criterion in the ticket that the tests cannot judge;
  2. everything you could not verify yourself: sound by ear, the phone, touch gestures, feel, pacing —
     and `file://`, which AO's browser cannot open, whenever asset loading changed;
  3. one or two **regression** checks on neighbouring features the diff touched.
- **Leave out anything a test or your browser check already proved.** Padding the list teaches the owner
  to skim it. If nothing needs his eyes or ears, say so in one line instead of inventing items.
- Tag each item 📱 phone, 🖥 desktop or 👆 touch where the device matters. Most important first; about
  eight items at most. If there are more, the ticket was too big — say so.
- Give each item a step count or a time ("~2 min") only when it is long.

```markdown
- [ ] **Jukebox → The Moldau**, Click set to *Count in + tick*, press ▶ — expect two clicks, then the
      low E pick-up landing on the last eighth; the bar chips read 1–9, with 9 five columns wide.
- [ ] 📱 **Same, on the phone preview** — expect the bar chips not to overlap the pads at the smallest zoom.
- [ ] **Regression: Stepping Stones' reward** — finish level 1; expect Mary to play flat and without bars,
      exactly as before.
```

### In Review — the ticket comment

```markdown
**Ready for review** · PR #<n> · Preview: <netlify deploy-preview URL> · Session: ao://sessions/music-garden/<session-id>

**What changed for you**
- One to three bullets, in the player's terms.

**Please playtest**
<the checklist>

**Choices I made that you might overrule**
- Anything you decided that the ticket did not settle, one line each, with the alternative.
  (May be left out when there were none.)

**Review and tests**
- Design: GPT designed it; my critique — one line per point: severity, the point, what was built instead.
- GPT's test pass: what it found, and which of its test files were kept.
- AO's review (Codex, Astra): **approved** on `<short sha>` after N rounds — one line per finding:
  severity, the finding, agreed or disagreed, what you did. Full record: `reviews/<ID>-<slug>.md`.
- Verified: N/N tests; what you checked in the browser, on which head.
- Not verified: what you could not reach — `file://` among them whenever asset loading changed.
```

### Needs Input — the ticket comment

```markdown
**Needs your input** · Draft PR #<n> · Preview: <URL> · Session: ao://sessions/music-garden/<session-id>

**Where it stands**
Two or three lines: what is done, what is waiting on you. At the design checkpoint, say there is no
playable change yet, link GPT's design and my critique (`reviews/<ID>-<slug>.md` on the branch), and
leave out the preview.

**Questions**
1. The question, answerable in a word or a line.
   - **A)** … · **B)** … — **I'd pick A**, because …
2. …

**Try this first**
<the checklist — only what informs the answers; may be left out when the questions need no playtest>

**How to answer:** reply here — "1A, 2: keep it" is enough — then move the ticket back to **Todo**; the
work resumes where this stopped. Or answer in the AO session linked above, if it is still open.
```

### The PR body

```markdown
Closes <ID>.

## What changes for the player
One short paragraph, or bullets.

## Please playtest
<the same checklist as the ticket>

## Review
GPT's design and my critique in brief (in full in the reviews file). GPT's test findings, and which of its
test files were kept or deleted, and why. AO's review: each finding with severity and my verdict,
including any disagreement in the reviewer's own words — and, once it lands, the verdict.

## Tests
N/N pass; mutation audits run; what the browser check covered, on which head; what remains unverified.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

With no ticket, leave out the `Closes` line.

## Never

- Never merge a PR or push to `main` — every push to `main` deploys to production. Merging happens
  only when the owner explicitly says so in this session.
- Never move a ticket into Todo, or out of anyone else's In Progress.
- Never request AO's review on a draft PR.
- Never delete a branch that holds unmerged work, and never remove or clean up AO worktrees or
  sessions — AO owns them.
- Never force-push.
