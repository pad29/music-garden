# TUN-114 — Document the Cloudflare settings that must stay off, so a new deploy doesn't print a CSP error

Branch `ao/tun-114/root` · Size **S** (label and `## Size` agree) · docs only

## Plan (Claude)

- **Approach.** README § Deployment already ends its *To change them* paragraph with one sentence:
  "Keep Cloudflare's script-injecting features off". Replace that sentence with a short sub-block of its
  own, **Cloudflare settings that must stay off**, inside § Deployment, so the edit stays local while other
  phase-2 tickets touch README. It lists the five settings from *Done looks like* (Real User Monitoring,
  Web Analytics in both places, Rocket Loader, Auto Minify, Email Address Obfuscation), each with where its
  switch was on 2026-11-15 and a warning that labels move; says why (the policy blocks an injected script,
  so the page works but logs a violation; a rewrite can break the policy or the `js/` load order); and
  gives a terminal check with browser-like headers that greps for `cloudflareinsights`, warning that a
  plain `curl` gets no injection and so can say "clean" falsely.
- **Sibling docs.** `reviews/TUN-86-security-cache-headers.md` § Risks names three of the features and says
  "none is on today" — RUM was in fact on. Add a dated one-line note under it pointing at README
  § Deployment as the full, current list (the reverse pointer the ticket allows; the README is the living
  doc, so a reader of the record is sent there, not the other way round). `AGENTS.md` already points at
  README § Deployment for the policy: no change.
- **Not touched:** `_headers` (ticket constraint), the CSP, Cloudflare itself.
- **Tests.** No code changes. The suite must stay green (`workflow-refs` and the docs tests read README).
  Run the documented check command against `tunegarden.game`, `www.tunegarden.game` and
  `music-garden.pages.dev` and confirm it prints the expected result today (clean: the owner turned RUM
  off on 2026-11-15). Done 2026-11-17 before writing: all three pages, 77 307 bytes, no
  `cloudflareinsights`, no `cdn-cgi`.

**Checkpoint (§ 5):** no `needs-owner` label; no musical or player-facing question; no fork. Build. The
ticket's last *Done* item — the owner confirms the names match the dashboard — goes in the playtest
checklist.

## Verification (Claude, 2026-11-17)

- README's check block, extracted from the file and run as written: `tunegarden.game` and
  `www.tunegarden.game` each print `game scripts: 29 injected: 0` (on `47788ff`; after round 1's fixes,
  `clean: <url> (game scripts: 29, injected lines: 0)`).
- The same grep on two sample lines — RUM's beacon tag and Rocket Loader's `/cdn-cgi/` script — counts 2,
  so the check does catch an injection.
- The suite: 913/913 on `47788ff`; 917/917 after round 1 (four new tests); 918/918 after rounds 2, 3 and 4 (`node --test "tests/*.test.mjs"`).
- **Unverified:** the dashboard locations themselves. Only the RUM path comes from the owner's own finding
  (on the ticket); the others are where Cloudflare documented them, and Auto Minify may be gone from the
  dashboard (Cloudflare announced its retirement in 2024). The owner confirms the names in the playtest.

## PR review — round 1 (Astra, through `ask.sh`, on `47788ff`)

<details><summary>GPT's review, verbatim</summary>

1. **Medium — Reject failed downloads before reporting counts.** [README.md:253](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-39/README.md:253) discards `curl`’s exit status. I ran the extracted block with a stub returning the page’s 29 game-script tags followed by exit **18** (partial transfer): it printed `game scripts: 29 injected: 0` and exited **0**. A transfer truncated before the injected footer therefore satisfies the documented clean result. Handle transfer failures explicitly and reject HTTP errors before inspecting the body; `--fail` alone does not preserve the ignored exit status. [curl documents these failure codes](https://curl.se/docs/manpage.html).

2. **Medium — Distinguish blocked beacons from allowed same-origin injections.** [README.md:242](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-39/README.md:242) says an injected script is blocked because scripts must come from the site itself. That conclusion does not hold for scripts served from the site’s `/cdn-cgi/` paths: `_headers` permits same-origin external scripts. Scope “game still works, console logs a violation” to the observed cross-origin RUM beacon. At line 259, also explain that a quiet console does **not** establish that injection or rewriting is disabled. Append the same qualification to TUN-86’s historical blanket claim. Cloudflare documents its [same-origin endpoints](https://developers.cloudflare.com/fundamentals/reference/cdn-cgi-endpoint/) and [injected email decoder](https://developers.cloudflare.com/waf/tools/scrape-shield/email-address-obfuscation/).

3. **Medium — Correct the switch guidance and its claimed verification date.** [README.md:242](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-39/README.md:242) presents every location as observed on November 15, while the new review record says only RUM was owner-verified. Cloudflare currently documents Rocket Loader under **Speed → Settings → Content Optimization**, rather than **Speed → Optimization**. Update the path and distinguish documented locations from owner observations. Also clarify that an absent Auto Minify toggle does not establish that legacy minification is disabled: Cloudflare retains instructions for disabling legacy settings through its API. Linking that guidance requires no API automation in this PR. [Rocket Loader instructions](https://developers.cloudflare.com/speed/optimization/content/rocket-loader/enable/), [legacy Auto Minify guidance](https://developers.cloudflare.com/speed/optimization/content/troubleshooting/disable-auto-minify/).

4. **Low — Scope the request/domain claims to the observed incident.** [README.md:249](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-39/README.md:249) makes “plain curl gets no injection” and “only … custom domains” sound universal. Pages-project Web Analytics separately adds its snippet to the Pages site on deployment. State that the **November 15 zone-level RUM incident** was absent from plain-curl responses and the Pages hostname; do not imply Pages hostnames cannot contain analytics. [Cloudflare Pages documentation](https://developers.cloudflare.com/pages/how-to/web-analytics/).

Missing verification cases to add:

- Run the documented block against a partial body containing all game-script tags with curl exit 18; require an explicit failed/inconclusive result.
- Check empty transport failure and HTTP-error responses; neither should produce an accepted clean result.
- Retain clean and injected fixtures, including single-line HTML. `grep -c` counts matching **lines**, but that is sufficient for the documented zero/nonzero thresholds.
- Record the owner’s dashboard confirmation, including absent/retired settings. It remains outstanding.

No gameplay tests are needed for this documentation-only change. I reproduced the shell cases in Git’s `sh`; macOS was not available. Live fetches and GitHub PR access were blocked here, so I could not independently confirm those checks. No files changed.

**Changes requested** on `47788ff1c4b048d60f5158d809f5b8677c4b9749`.

</details>

**My answers** — checked against Cloudflare's docs (Rocket Loader, Auto Minify, Email Address
Obfuscation and Pages Web Analytics pages) before agreeing:

1. **Medium — curl's exit status discarded. Agreed.** The block now runs `curl -fsS` inside
   `if ! page=$(…)`, so an HTTP error, a lost connection or a cut-off transfer prints `FAILED` and no
   counts. Each line leads with a verdict: `clean`, `INJECTED`, `NOT THE GAME PAGE` or `FAILED`.
2. **Medium — same-origin `/cdn-cgi/` scripts are allowed, not blocked. Agreed** (I had suspected
   this while writing and still wrote "blocked" for all of them). README now splits the two kinds: the
   cross-origin beacon is blocked and logs a violation; same-origin scripts run silently, so a quiet
   console proves nothing. TUN-86's dated note says the same.
3. **Medium — Rocket Loader's path, "observed" date, Auto Minify. Agreed.** Rocket Loader → Speed →
   Settings → Content Optimization; Email Address Obfuscation → Security → Settings (Cloudflare's page
   says so too). The lead-in now says RUM's location is the owner's 2026-11-15 finding and the rest are
   Cloudflare's docs in November 2026. Auto Minify: the dashboard may not show it, a zone can still
   minify, so check `settings/minify` through the API (linked to Cloudflare's guide; no automation).
4. **Low — plain-curl and Pages-hostname claims too broad. Agreed.** Both are now stated as what was
   seen on 2026-11-15; the Web Analytics bullet says the Pages-project switch adds the beacon to every
   deploy, `*.music-garden.pages.dev` included.

**Missing tests — all added**, in `tests/workflow-scripts.test.mjs` (the README block run as printed,
`curl` replaced by a fixture function): the real `index.html` reads `clean`; the beacon, Rocket
Loader's `/cdn-cgi/` script and a one-line page with the beacon read `INJECTED`; curl exit 18 on a page
cut before `</body>`, exit 22 and exit 6 read `FAILED`; an error page and an empty 200 read
`NOT THE GAME PAGE`; curl gets `-fsS`, `Accept: text/html`, `Sec-Fetch-Dest: document`,
`Sec-Fetch-Mode: navigate` and a browser User-Agent. The owner's dashboard confirmation stays in the
playtest checklist. **Mutation audits** (each on a temporary README, restored): dropping `-f`, ignoring
the fetch failure, or dropping `cdn-cgi` from the grep each fail one of the four tests.

## PR review — round 2 (Astra, through `ask.sh`, on `e349794`)

<details><summary>GPT's review, verbatim</summary>

1. **Medium — Remove the claim that the terminal check proves the settings are off.** [README.md:242](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-39/README.md:242) says “the check below does,” but line 246 correctly acknowledges that minification leaves no detectable marker. Also, Pages Web Analytics can be enabled before its next deployment adds the beacon. A `clean` result establishes only that those markers were absent from the fetched response. Require dashboard/settings verification separately. [Cloudflare’s Pages documentation](https://developers.cloudflare.com/pages/how-to/web-analytics/) confirms the deployment delay.

2. **Low — Validate curl arguments per invocation, including header flags and destination.** [tests/workflow-scripts.test.mjs:730](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-39/tests/workflow-scripts.test.mjs:730) checks only whether header strings occur somewhere in the combined argument log. I reproduced that removing **every `-H`**, or removing **`"$u"` from curl**, still satisfies these assertions and produces fixture-based `clean` results. Check each call’s URL and actual `-H`/value pairs; the fake currently returns the page regardless of malformed arguments.

Missing tests to add:

- Remove an individual `-H` while retaining its header string: argument validation must fail.
- Omit the URL, or fetch the apex URL during both iterations: validation must fail.
- Return different fixtures for the two requested domains—clean for one, injected or failed for the other—and assert the corresponding verdicts.

The four original findings are addressed in the delta; the remaining documentation overclaim is newly introduced. Owner dashboard confirmation remains explicitly pending.

The extracted block passed clean, injected, single-line, partial-transfer, HTTP-error, DNS-error, and invalid-page cases under Git’s Bash and `sh`. `if ! page=$(…)`, numeric comparisons, and the literal-newline `printf` formats are valid POSIX syntax. Native macOS/BSD execution was unavailable. The committed tests could not run because temporary-directory creation hit sandbox `EPERM`; syntax checking passed. No files changed.

**Changes requested** on `e349794fcefd454f60c34a4a729e85ebc9cb4ed0`.

</details>

**My answers:**

1. **Medium — "the check below does" prove the switches are off. Agreed:** I had overclaimed, in the
   same paragraph that says minifying leaves no marker. README now says neither the console nor the
   check proves a switch is off — the check finds only the markers in the page served now; minifying
   leaves none and Pages Web Analytics shows only from the next deploy — so **look at each switch
   itself**. `clean` is defined as "none of those markers is in the page that domain serves now".
2. **Low — the test pooled every call's arguments. Agreed.** The fake `curl` logs each call
   separately and serves a fixture and exit code per host. The test now requires exactly two calls,
   each fetching its own domain and nothing else, with `-fsS` and each header as the value of its own
   `-H`.

**Missing tests — all added:** a dropped `-H` that keeps its string, a dropped URL, and the apex
fetched twice are all caught by the per-call test. A new test gives the two domains different fixtures:
apex clean and `www` injected reads `clean`, `INJECTED`; apex cut off (exit 18) and `www` clean reads
`FAILED`, `clean`. **Mutation audits** (temporary README, restored): no `-f`; failure ignored; no
`cdn-cgi`; one `-H` dropped with its string kept; `"$u"` dropped; apex twice. Each fails at least one
of the five tests.

## PR review — round 3 (Astra, through `ask.sh`, on `4c68119`)

<details><summary>GPT's review, verbatim</summary>

1. **Low — Validate the URL as a destination, not merely a matching argument.** In [tests/workflow-scripts.test.mjs:748](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-39/tests/workflow-scripts.test.mjs:748), inserting `-H` before `"$u"` still passes the exact committed argument assertions. The fake also treats that header value as the requested host. Real curl rejects those same arguments with exit **2**, “no URL specified.” Consume option values before identifying destinations, or validate the complete supported argument structure. [`-H` consumes its following argument](https://curl.se/docs/manpage.html#-H).

Round-2 finding **1 is resolved**: README explicitly requires separate settings verification. Finding **2 is partially resolved**: dropped headers, omitted URLs and fetching apex twice are now rejected, but the destination-validation hole above remains. The mixed-domain fixtures cover the requested verdict separation. I found no additional disagreement between README, the TUN-86 correction and the review record.

Missing tests:

- Insert `-H` immediately before `"$u"` while retaining all existing headers; require argument validation to fail.

Syntax checking passed. The five committed injection tests could not execute because temporary-directory creation hit sandbox `EPERM`; the argument reproductions above ran in memory. Dashboard confirmation remains pending. No files changed.

**Changes requested** on **4c6811926862b5f79cd469a6aeb38bcf0d55469d**.

</details>

**My answer:**

1. **Low — an `-H` inserted before `"$u"` swallows the URL, yet the test passed. Agreed.** The test
   now reads each call's arguments with `-H` taking the next one as curl does (not wholly as curl does —
   round 4 found other options still slipped through): `-H` takes the next argument as its value, other `-…`
   are flags, and what is left is the destination, which must be exactly that call's domain. The fake's
   host lookup skips `-H` values the same way.

**Missing test — added** as a mutation, not a new test: the per-call test fails on it. **Mutation
audits** (temporary README, restored), all seven caught: no `-f`; failure ignored; no `cdn-cgi`; one
`-H` dropped with its string kept; `"$u"` dropped; apex twice; `-H` inserted before `"$u"`.

**Third round** (`work-ticket` § 8): this fix is pushed **without a fourth review**, and the ticket
stops at Needs Input for the owner to decide whether it gets one.

## PR review — round 4 (Astra, through `ask.sh`, on `50e2a21`; the owner asked for it)

<details><summary>GPT's review, verbatim</summary>

1. **Low — Reject unsupported options and missing option values.** In [tests/workflow-scripts.test.mjs:756](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-39/tests/workflow-scripts.test.mjs:756), every option except `-H` is treated as a standalone flag. Inserting `--header` or `-o` before `"$u"` passes the extracted committed assertions, and the fake still selects that host; real curl exits **2**, “no URL specified.” Appending a dangling `-H` also passes, while curl rejects its missing parameter. Validate a restricted supported argument structure, rejecting unknown options and missing values; the fake should reject these malformed calls too. A full curl parser is unnecessary. Update the review record’s “as curl does” claim accordingly. [curl’s option documentation](https://curl.se/docs/manpage.html#-H).

Missing tests:

- Insert `--header` immediately before `"$u"`, retaining existing headers; require argument validation to fail. Repeat with `-o`.
- Append `-H` without a value; require validation to fail.

The exact round-3 `-H "$u"` reproduction **is resolved**. The owner-decision record matches your instructions, and dashboard confirmation remains explicitly pending.

Syntax checking passed. The five committed tests were blocked by sandbox `EPERM` during temporary-directory creation; the reproductions above ran in memory against the extracted assertions and actual curl. No files changed.

**Changes requested** on **50e2a21d43f33fe390e473d1afd5ca152d937149**.

</details>

**My answer:**

1. **Low — options other than `-H`, and a dangling `-H`, still passed. Agreed.** The test and the
   fake `curl` now accept only what README uses — `-fsS`, `--compressed`, `-H <value>` and one
   `https://` URL — and refuse anything else: another option, a `-H` with no value, a second URL or
   none (the fake exits 2, as curl does). My round-3 answer's "as curl does" is corrected above.

**Missing tests — added** as mutations the tests now catch. **Mutation audits** (temporary README,
restored), all ten caught: no `-f`; failure ignored; no `cdn-cgi`; one `-H` dropped with its string
kept; `"$u"` dropped; apex twice; `-H` before `"$u"`; `--header` before `"$u"`; `-o` before `"$u"`;
a dangling `-H`.

**After round 4:** this fix is pushed unreviewed, and the ticket stops at Needs Input again — round 5,
or take it as it stands.

## Owner's decisions

1. *After three review rounds, the round-3 fix (a Low, test-only change) is pushed without a review:
   run a fourth GPT round on it, or take the PR to playtest as it stands?* — **a fourth round**: the
   owner, relayed by the orchestrator to this session, 2026-11-18.
2. *Do the dashboard locations in README § Deployment match what Cloudflare shows today?* —
   **they match**: the owner checked all four dashboard items, in the AO session, 2026-11-19.
3. *After round 4, its fix (Low, test-only) is pushed unreviewed: run round 5, or take the PR as it
   stands?* — **take it as it stands** (1B): the owner, in the AO session, 2026-11-19.

## Owner's review

- **Playtest, 2026-11-19:** all four dashboard checks match the README. The terminal check printed the
  two `clean` lines exactly. The owner ran it in Windows PowerShell through `curl.exe`, because Smart
  App Control blocked Git Bash. The PowerShell form is not in the README (a possible follow-up).
- **After the owner's 1B, without review:** the README's check block had two lines mangled by my own
  scripted edit (round 1): the `\` continuing the curl line was lost, and `printf '%s\n'` held a real
  line break instead of `\n`. Both forms ran the same, which is why the tests, the live runs and GPT's
  round 2 ("the literal-newline `printf` formats are valid POSIX syntax") all passed them. Restored to
  the intended text; the five injection tests pass, and the no-`cdn-cgi` and dangling-`-H` mutations
  still fail them. Both shells print `clean` on both domains.
