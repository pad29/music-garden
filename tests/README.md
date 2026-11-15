# Tests

```bash
node --test "tests/*.test.mjs"
```

Zero dependencies — Node's built-in test runner, matching the game's own no-dependency rule.
Nothing to install.

## What this can and can't test

The game is the classic `<script src>` files in `js/` that `index.html` loads — since TUN-7 the page
holds no script of its own — and they do a lot of DOM wiring the moment they load. `harness.mjs`
runs them inside a `node:vm` context with stubbed browser globals, then hands back every top-level
binding they declared (about a thousand of them).

**The script list.** `helpers/game-scripts.mjs` is the one reader of the page: `gameScripts()` returns
every local `<script src>` and inline `<script>` in document order (CDN tags skipped, CRLF
normalised; a script under `vendor/` — third-party code the site serves itself — is listed apart, in
`vendored`, never run by the harness, but compiled by `tools/check-syntax.mjs` through `vendoredSources`), and the harness, both mutation audits, `tools/gen-voice.mjs` and
`tools/check-syntax.mjs` all go through it. Only synchronous classic scripts are allowed —
`type="module"`, `async`, `defer`, `nomodule` or an unknown `type` make it throw rather than skip.
`loadGame()` runs **each script as its own `vm.runInContext` call** in one context, as a browser does:
top-level `const`/`let` reach later files, but a function declared in a later file is *not* hoisted
into an earlier one, so load-time code that calls ahead throws here exactly where it throws in the
browser. Never concatenate them to run. `tests/game-scripts.test.mjs` covers the loader itself with
small throwaway pages. `tests/cloudflare-publish.test.mjs` checks that the deploy build, Cloudflare
Pages' `cloudflare-build.sh`, copies `index.html`, every folder the page loads a script from, and
every file in `vendor/` to the same path under `site/` — a file left out is served as `index.html` in
production, and the game never starts. The checker is `helpers/cloudflare-publish.mjs`, and it is
strict: the script must publish exactly `index.html`, `_headers`, `js/`, `voice/`, `samples/` and
`vendor/` in one `&&` chain, a step it cannot read is refused rather than skipped, no `404.html` may
be published, and the real script is run under bash in a scratch folder (skipped when no bash is found,
as in `workflow-scripts.test.mjs`). (Netlify's `netlify.toml` and its checker went with TUN-85.)

**The backend's code** (TUN-83). The Lambdas are ES modules, imported directly, with no `vm`. They need
no install because the code the tests reach imports no AWS SDK: `backend/src/validate.mjs` (the
formats), `http.mjs`, and `songs-api.mjs` / `progress-api.mjs`, which take their DynamoDB access as
four plain functions. `songs.mjs` and `progress.mjs` only wire the real SDK into those, and no test
loads them. `backend-validate.test.mjs` runs every song and progress the real client writes
through the validator. `helpers/backend-fixtures.mjs` makes them by running the game: `currentSong`,
every `famousToSong`, a quest's offering, `savePackageProgress` with every distinct tool crafted
through `craftFromCells`, `cloudPush` of an old guest's localStorage. A browser-like `#instr` select
is passed through `loadGame`'s `elements`, and a per-test `fetch` answers only the game's own API.
The file also checks each refusal by its reason (`why`), each closed list against the client it
describes, and that the largest real progress fits `MAX_PROGRESS_BYTES` with 10% to spare.
`backend-handlers.test.mjs` drives the real handlers against an in-memory table. It covers the
client's real `cloudSongCreate` body through `POST`, `GET` and back into the Studio, fixed error
messages and no write on every refusal, byte caps before parsing (base64 and multibyte), the paged
song count, the conditional `PUT`, and reads of old rows. The handlers' log lines are captured
there, not printed.

**No third-party requests (TUN-81).** `vendor.test.mjs` holds `vendor/` to `vendor/SHA256SUMS`
(`helpers/vendor.mjs`: a changed, added or missing file fails, byte for byte — `.gitattributes` keeps
`vendor/` out of line-ending conversion), checks `vendor/README.md` states the library's version and hash,
that `fonts.css` declares every weight the page used from listed files, and that the page links the
fonts and loads the library from `vendor/`. Its scanner refuses any `src`/`href`/`url()`/`@import` in
`index.html` or `fonts.css` that names another host — a markup/CSS guard, not a network trace — and
the game's own scripts may name only the backend. The network half is the browser check in
`reviews/TUN-81-self-hosted-fonts-and-sign-in.md`.

**The site's headers (TUN-86).** `site-headers.test.mjs` reads `_headers` the way Cloudflare Pages does
(`helpers/site-headers.mjs`, strict: a line it cannot read is refused) and works out the headers for
every file the build publishes. Each header must come from one rule per path (Cloudflare joins
duplicates with a comma). The policy may allow only the site itself, plus, for connections, the
backend and Cognito endpoint read from `js/cloud.js`, and may name each directive only once (a browser
obeys the first copy). Clips are cached for exactly 30 days (`public, max-age=2592000`), and everything
else is always re-checked. It also checks that the page has nothing
`script-src 'self'` would block: no inline script, no `on…=` attribute, no `eval`. The vendored Cognito
library's webpack `globalThis` shim is allowed once, by its exact text. The browser half, with the
`curl -I` output, is in `reviews/TUN-86-security-cache-headers.md`.

**Cloud progress sync (TUN-106).** `cloud-sync.test.mjs` signs a stub Cognito user in (a protocol stub,
not the SDK) and answers `GET`/`PUT /progress` with a per-test `fetch`: a load that returns progress, `null`,
429, 500, 503, a network error, a body that is not JSON, or a 200 that is not progress. A failed load must
send no `PUT` — not at sign-in, not on a later save, not from `cloudPush` — and the sign-in panel must say
the cloud couldn't be reached. Users can switch and their tokens can be held back, so a load or push that
returns after sign-out or another player's sign-in is shown to do nothing. `scheduleCloud`'s 900 ms timer is caught and run by hand, and the panel's text is read through
recording elements over the harness's stubs. Since TUN-87 it also holds the panel's "the cloud is resting"
line (`cloudResting`): a failed save or song call shows it, a good one clears it, the newest call to start
wins in either completion order, and a result from an earlier sign-in never moves it.

**The cloud resting (TUN-87).** `cloud-resting.test.mjs` answers every way a switched-off or busy API can
(429, 503, API Gateway's own 404, 403, a thrown fetch, bodies that are not the song) and checks the player
is told the cloud is resting — on a `#song=` link at boot, in Melodies' list, ▶ Load and 🗑, and when
sharing a big song — and that only the API's own `{"error":"not found"}` says a song may be deleted. It
also maps Cognito's sign-up trigger failures to the calm refusal. `backend-cloud-switch.test.mjs` drives
`backend/src/cloud-switch-api.mjs` against a fake account: off from any alarm-topic message, never on;
the owner's on/off/status; refusals; other topics ignored; a trip published before the owner's last
switch-on ignored, a later or late one acted on; failing, hanging (aborted) steps;
the read-back; a failed email; and the SDK adapter, with recording clients, sending each command with
the step's abort signal.

**The backend template.** `backend-template.test.mjs` (TUN-82) parses `backend/template.yaml` with a
small structural parser for its block-YAML subset and pins its cost limits and data protection, each
at its effective path, so the same text under `Metadata` doesn't count:

- every `HttpApi` event, discovered structurally, is an approved `METHOD /path` on `Api` with exactly
  its approved rate and burst;
- the default route throttle, and Globals reserved concurrency with no function overriding it;
- `Retain` and deletion protection on the user pool and both tables, and point-in-time recovery;
- the $30 account-wide budget with its four alerts to `!Ref BudgetEmail` and no fixed name;
- the API's CORS origins: exactly `tunegarden.game` and `www.tunegarden.game` (TUN-76);
- the cost switch (TUN-87): the 100 % alert's second subscriber is `CloudSwitchAlarmTopic` and no other
  alert has one; the budget `DependsOn` the topic policy, subscription and invoke permission; the topic
  policy, subscription, permission, notice topic, the switch's timeout, concurrency 1, event age,
  environment and role, each compared as exact JSON (key order aside), so an extra action, a `*`, the
  switch naming itself or a quoted reference is a difference; no function invokable by a non-AWS
  principal, no function URL, no explicit role; the SSM parameter holding the switch-on time; the payload
  files.

It also refuses any email address other than an `@example.com` placeholder in the template or
`samconfig.toml`, comments included: the repository is public. It is a static check, not
CloudFormation validation — the owner's deploy runs `sam validate --lint`. A raise the owner approves
means changing `ROUTES` and the arithmetic in the review record together. Its mutation cases, each
asserting its own diagnostic, and a harmless-formatting case are kept as tests, so the checker cannot
quietly go blind.

**Keep `template.yaml` in block style.** The parser refuses what it doesn't implement rather than
misreading it: flow collections (`{…}`, `[…]`), anchors, aliases, folded or literal block scalars
(`>`, `|`), and tags other than `!Ref`, `!GetAtt` and `!Sub`. Such a line fails with "unsupported
YAML". A reference keeps its meaning: `!Ref X` and the block form `Ref: X` both count, while a quoted
`"!Ref X"` is a literal string, as CloudFormation reads it.

**The deploy policy.** `backend-deploy-policy.test.mjs` (TUN-113) reads the `mg-deploy` IAM policy
from the JSON block in `backend/README.md` § One-time setup, and checks it against `template.yaml`
with a small IAM evaluator. The evaluator handles Allow and Deny (a Deny wins whatever the order),
`Resource` and `NotResource`, `*`, and the conditions the policy uses: `StringEquals`, and `ArnEquals`
/ `ArnLike` with wildcards, as AWS treats them. Any other operator or key is reported, and every
statement's conditions are validated before anything is evaluated. `problems()` lists everything wrong:

- for every resource in the template, the policy allows the actions in the test's `NEEDS` for its
  type, on the ARN the resource would get (`music-garden-*` names, from the stack name in
  `samconfig.toml`). `NEEDS` is the test's model of what CloudFormation's handlers call to create,
  read, update, delete and roll back, written from AWS's authorization reference. It is not proof;
- a new resource type fails until it is added to both the policy and `NEEDS`. The template's resources
  are read structurally, one map level at a time, with plain or quoted keys at whatever indentation the
  level uses. Anything else at that level is an error, never skipped. A resource without a readable
  `Type`, a name that is not a literal (`!Sub`, a block form), a name outside the prefix, an explicit
  function `Role`, or a `Lambda::Permission` whose `FunctionName` is not a literal or a `!Ref` /
  `!GetAtt …Arn` of a function in the template, is reported;
- SAM's own calls (change-set calls on the stack they authorize against, the Serverless transform, its
  bucket's creation and objects), the cost switch's runbook commands, and Polly for
  `tools/gen-voice.mjs`;
- what it must not allow: players' table items, Cognito users, **invoking any function but the cost
  switch**, EC2, IAM users and keys, roles or functions outside the prefix, us-east-1-only grants in
  another region, `PassRole` to anything but Lambda, and `AttachRolePolicy` for anything but Lambda's
  basic logging policy;
- no account ID (the repository is public), and both Identity Center inline-policy limits (32,768
  bytes, and 10,240 without whitespace), tested at their boundaries.

Its mutation cases, kept as tests, each break the policy or the template one way and require the
matching report. Harmless changes (quoting, deeper indentation, `!GetAtt` for `!Ref`, dropping the extra
change-set grant) must report nothing. An evaluator matrix pins Deny precedence in both orders, the cost
switch's exemption (unqualified, `$LATEST`, a version, an alias) against a look-alike name, and
missing condition keys. It cannot prove AWS accepts the policy: the owner's deploys do.

**The AO preview config.** `ao-launch.test.mjs` (GPT's test pass) pins what `work-ticket` § 6 relies on
in `.ao/launch.json`: one configuration, so a bare `ao preview start` works; `http-server` serving the
worktree uncached, bound to `127.0.0.1` on AO's `${PORT}`; the url on that same origin; and
`readyTimeoutMs`, if set, within AO's 0–55000 — one bad entry makes AO reject the whole file. It is a
static check: that AO really starts, serves and stops the server was measured, in
`reviews/2026-11-08-ao-launch-json.md`.

**The workflow's scripts and cross-references.** `workflow-scripts.test.mjs` runs `.claude/gpt/gpt-lock.sh`
(one GPT job at a time, `CLAUDE.md` § Cost), the review poller printed in
`.claude/skills/work-ticket/pr-review.md`, the preview finder in `work-ticket/browser.md` (TUN-85: it waits
for the *Cloudflare Pages* check alone, takes the branch preview only from the comment naming the head,
and never exits 0 without one — its `gh --jq` filters are not run by the fake, and were checked on live
PRs) and the test-output recipe in `CLAUDE.md` § Working lean — the last three taken from the docs, so
the docs are what is tested — under Git Bash (or bash), with fake `ao`,
`gh` and `sleep` first on PATH: of six sessions acquiring at once exactly one wins; a dead holder's lock
is never broken automatically, and `status`, a busy `acquire` and `wait` print the command that clears
it by hand, which works; a lock it can't create, or (on Windows, where a busy directory can't be
removed) can't release, is an error that keeps the holder's name on the lock, not "busy" or "released";
the poller exits 1 after two failed or unreadable reads in a row; the recipe prints every diagnostic line
of a failure and fails with it. Skipped where no bash is found. `workflow-refs.test.mjs` checks that the workflow docs'
file paths, `§` references and step numbers resolve, so a cold worker never follows a dead pointer.
Both from GPT's PR review of PR #88 (`reviews/2026-11-10-cost-effective-workflow.md`).
`workflow-refs.test.mjs` also checks that `CLAUDE.md`, `work-ticket` and `file-ticket` keep reading a
ticket's size from its `Size` label and its `## Size` section — either alone is the size, the larger
when they disagree, said in the hand-off — that `file-ticket`'s template keeps its `## Size` block, and
that a ticket with neither gets no default: the worker proposes a size and stops at Needs Input for the
owner to confirm it, on every path, with the old M default gone from every workflow doc (TUN-74,
`reviews/TUN-74-size-label.md`).

**The load-order guard (TUN-6).** One split bug gets past the harness: a script that, while loading,
*probes* a name only a later script declares — `typeof later`, `window.later`, `"later" in window` —
throws nowhere and simply behaves differently from one big script. `load-order-review.test.mjs` runs
the real harness under `helpers/load-order-observer.mjs`, which watches it through `node:vm` (a logging
global object, plus the Inspector to learn which script introduced each lexical name) and fails on any
load-time lookup of a later script's name. It sees only paths that run synchronously under the
harness's stubs — lexical reads, branches that don't run and browser callbacks are outside it.
`split-contract-review.test.mjs` pins that every `js/` file is loaded exactly once, and that the
goldens' wrappers still intercept `playRow`, `voice`, `jamStep` and `bookColumn` (turning one into a
`const` would silently hide it from them).

**The load gate (TUN-7).** A browser runs other work between two classic scripts — including player
input — and carries on past a script that failed, neither of which one inline script allowed.
`js/load-gate.js` (the first game script) swallows input until the page has loaded and records a
game script that failed; `js/boot.js` (the last) asks it before doing anything. `load-gate.test.mjs`
pins the order, runs the gate's logic against `EventTarget` stand-ins, checks that every kind of
input listener wired anywhere in the game is gated (a new one fails the test until it is listed or
declared not-input), and boots the real game through the harness with a failure recorded. The harness
itself stops at a load error, so `load-gate-continuation-review.test.mjs` (GPT's test pass) wraps it in
a loader that carries on the way a browser does: a missing, HTML-served or throwing file at the start,
middle or end of the list must stop boot with nothing written to storage and input still held; it
also fires the automatic callbacks (resize, scroll, ResizeObserver, voiceschanged, timers, promise
jobs) between files, walks the URL and stored-profile branches, and checks every input listener that
actually registers, which catches computed event names the static scan cannot. One exception is
accepted and pinned there: if `js/load-gate.js` itself never runs, input is not held, but boot still
refuses before any write. `load-gate-url-review.test.mjs` pins which errors count as the game's own.
The gate's real effect in a browser — swallowed clicks, a broken load that never saves — was checked
on the deploy preview (see `reviews/TUN-7-rest-of-script.md`).

That makes the **pure logic** testable — and that's most of the interesting code:

- contour and motion detectors (`contourSeq`, `isRising`, `extrema`, `isStepwise`, …)
- interval / chord / cadence helpers (`widthBand`, `stableMidis`, `chordSyms`, `hasChordRun`, …)
- palette maths (`setPalette`, `MIDI`/`NAMES`/`ROWS`)
- the song save/share format, density and rhythm detectors, level goal `chk` functions

It does **not** make rendering or audio testable. The DOM and Web Audio stubs absorb calls and
return more stubs; nothing is drawn and nothing is heard. Never write a test asserting on what
got rendered or played — verify that in a real browser (AGENTS.md § "How changes are verified").

## Writing a test

```js
import { test } from "node:test";
import assert from "node:assert";
import { loadGame, plant } from "./harness.mjs";

const g = loadGame();

test("a rising line reads as rising", () => {
  const seq = plant(g, [0, 1, 2, 3, 4]);   // ladder rows, 0 = bottom; null = empty column
  assert.strictEqual(g.isRising(seq), true);
});
```

`plant(g, rows)` clears the melody grid, plants one note per column, and returns the resulting
contour. Use it instead of poking `g.grid` directly.

## Gotchas that will bite you

- **Use `node:assert`, not `node:assert/strict`, for deep comparisons.** Arrays and objects
  created inside the vm carry the vm realm's prototypes, so `deepStrictEqual` fails on values
  that are structurally identical. `assert.deepEqual` ignores prototypes and is correct here.
  `strictEqual` is fine for primitives.
- **The game is one big shared state.** `loadGame()` is cached per test file, so tests in the
  same file see each other's grid. Call `plant()` at the start of every test. If a test mutates
  something global and hard to undo — `setPalette`, progress, the toolbox — use
  `loadGame({ fresh: true })` to get an unmutated copy.
- **Detector signatures are inconsistent by design.** Contour detectors take a `seq`
  (`isRising(seq)`); motion detectors read the grid themselves (`isStepwise()`). Check the
  source before assuming.
- **The DOM stub swallows `value` writes** and always reads back `""`. Two controls have real stubs
  because their behaviour is data-model behaviour: `#tempo` models a range input's clamping, and
  `#click` models a `<select>` that remembers what it was set to. Without the second, a control's own
  change handler cannot be exercised at all — and a test that pokes the module variable instead is a
  false oracle. That is exactly how the click preference's persistence bug hid: it is written from the
  Studio, where the old `saveProgress()` returned immediately, so only driving the real handler and then
  reading `Store` can tell you whether it works. (The quest branch split that function by owner; the
  handler now calls `saveUserSettings()`, the only settings sink, and the test still drives the handler.) Wire another control in `makeSelect` when you need to test ITS
  handler, not by default.
- **To see a write the stub swallows** — an `innerHTML` on `#status`, the rows `openMelodies` builds —
  pass your own recording element: `loadGame({ fresh: true, elements: { status: el } })` hands it to
  `getElementById("status")` (never cached). `hostile-links.test.mjs` does this, and defines
  `document.createElement` on `g.__document` to record what the game builds.
- **To run the boot with a URL or a saved profile** — `#s=`, `#song=`, `?reset` — pass
  `loadGame({ setup: w => { ... } })`: it gets the stubbed window before any script runs, so it can set
  `w.location`, seed `w.localStorage`, answer `w.confirm`, or give the cloud songs API a `w.fetch` (never
  cached). `hostile-links.test.mjs` boots this way. A `fetch` stub answers the cloud API only; anything
  else it is asked for must still fail, per the next point.
- **`fetch`/`XMLHttpRequest` are deliberately absent from the harness.** `index.html` must never
  use them for local assets (AGENTS.md hard invariant). If a test dies on a missing `fetch`,
  that is a real bug in the game, not a missing stub.
- **If the harness throws on load** because the game touched a browser API that isn't stubbed,
  add the stub to `harness.mjs`. Do not weaken `index.html` to satisfy the harness.

## Every test names the bug it catches

The standard this suite holds itself to: **a test that passes against the correct code AND against the
bug it claims to catch is a false proof.** Write the mutation into a comment above the test, then
actually apply it and watch the test fail. Doing that has caught four false proofs and one real shipped
defect (`setSaves` discarding `Store.set`'s return, so an artifact write could fail in silence).

## Scope

It covers the detectors and pulse helpers; meter, grooves, tempo and the click; persistence; pinch and
field zoom; the script list and its load order; the pure seams under the quest work — the projection
(`projectTracks`), the pulse helpers' explicit-grid forms and `contourSeqFromGrid`; and the quest
engine itself — the play scope, persistence, the completion session, the QuestRun reducer, phases and
history, the sealed catalog, and the analyzer registries and semantic validator; and what a hostile link
can do (`hostile-links.test.mjs`, TUN-84) — a huge or malformed song clamped by `applySong`, the Studio
stopping at the same `MAX_COLS`, `?reset` asking first, and a title `<img onerror>` creating no element
through `playSong`, My Melodies or the cloud list. The load-gate continuation sandbox answers `?reset`'s
question with yes, so its `?reset` loads still catch a boot that wrongly runs by its writes. It is not a substitute
for playing the game — it catches silent logic regressions, which are the ones runtime inspection is
worst at finding.

## Quest setup and playtest mutation audit

```bash
node tests/questsetup-mutations.mjs
node tests/questsetup-mutations.mjs --e6-only
node tests/questsetup-mutations.mjs --playtest-only
node tests/questsetup-mutations.mjs --fragments-only
node tests/questsetup-mutations.mjs --g-only
node tests/questsetup-mutations.mjs --h-only
```

`quest-fragments.test.mjs` covers step F's opening drum fragment: the pool grammar and the refusal of a
composite single attack, the catalog's proof (exhaustive over every legal short fragment at every legal
width, executing the real drum predicates on every ordered snapshot pair), the draw coming last so a pool
never moves a seed's stones, instance integrity against a tampered hydrated run, the drum readiness
(an ending rest is allowed; column 3 is not a continuation), silent versus unnamed drums, and the ring
wiring on `.dcell` pads. `completeDealtSong` restores the dealt opening and adds one continuation snare
that names no pulse family, so fixtures written to be unmatched stay unmatched — it completes the task
the player is held to rather than loosening it. `helpers/quest-fragment-mutations.mjs` supplies the faults.

Step G extends both authoring workspace tests with `loadNoLoopWoods`: a uniquely named Woods clone,
loaded alongside the official definitions through `loadQuestCatalog`. The tests enter Firefly, the
clone, then Woods (loop on → off → on), checking scope features, the level envelope and the actual
loop default. Official land, cast, prerequisites and analyzer checks remain. Both tests are audited
against a copied Firefly envelope/features, forced loop booleans and retained loop state.

`quest-g.test.mjs` tests the shared missing/editable vocabulary boundary without snapshotting its
sentences, including an explicit drum-hit subject for the missing-opening notice. Every old sentence
has a restoration fault. Woods' individual intention wording remains **content review**: keyword
presence cannot establish clear instructions, and the generic boundary does not apply to authored
story nouns in every quest. The reviewed lines name notes/tune and beat without footsteps/walk;
taught "even kick walk" and friends' story-tier descriptions are deliberately outside this check.

The second G test drives loop booking/clock events through the real completion session and receipt
sink in Woods: partial laps earn nothing, complete laps count at audible time, both auditions are
needed, and replaying an edited held version restores offer without re-hearing its sibling. Its audio
start boundary is replaced, so this does **not** prove scheduler wiring or audible playback. The
existing finale effect test now runs for both official quests with their actual loop-on defaults;
a Firefly-only loop reset is an audited fault. Narration still uses the existing both-quest envelope
test, with the two Woods "Keep" → "Move" mutation anchors updated. `helpers/quest-g-mutations.mjs`
joins the full audit; `--g-only` runs just these new faults.

Step G verification (2026-09-23): **510 tests pass; 406 mutations caught across 133 green tests**,
including 22 step G mutations across five tests. No game or design source was edited by this tester.

Requires Node >=22.15 for the module loader hook. The default runs the complete audit; the optional
flags select commit 6, the A7/A8 playtest, fragment, step G, or step H faults. Each fault must have a green unmodified test and
make that exact test fail. Mutations affect the harness's scripts in memory only: the hook
(`helpers/questsetup-mutation-hook.mjs`) rewrites the harness's `const scripts = loaded;` line to run
`applyPatches`, which requires each anchor to occur **exactly once across all the game's script files**
and patches it in the file that holds it. Syntax errors,
initialization failures, ambiguous source anchors, and missing test titles fail the audit rather than
counting as caught faults.

## Step H testing (2026-09-26)

The six stale Woods tests now use an explicit `withBeatNotes` fixture after readiness construction.
`completeDealtSong` is unchanged, so shared Firefly contours and deliberately unmatched fixtures retain
their meaning. The playable-route search keeps an independent on-beat melody after contour deduplication
and still executes the full route conjunction, workspace check, and readiness. Woods' authoring assertion
now names `phrase.on-every-beat`. Existing narration faults track the two new Woods task sentences;
three older mutation anchors are narrowed to distinguish the new loops from the original drum proofs.

`quest-h.test.mjs` covers distinct projected beat columns, duplicate/stacked notes, empty melody,
between-beat notes, stones on beats, sustained tails, the 16-column evidence floor, and 17/32-column
spans. All beat subsets at 16/32 are checked. Descriptions are exclusive, remain within declared token
ids, and travel through real receipts to the garden while Hopper keeps the drum descriptions.

An authored melody+contour quest isolates `analyzer-not-taught` from capability prerequisites: without
Footsteps its only errors are the new teaching errors; adding Footsteps accepts it. The old minimum-onset
primitive still accepts a no-task quest without Footsteps or a beat guide and has no reach construction.
Reach tests execute the constructor over all 9,360 legal stone-column-layout/opening combinations at
widths 16 and 32, using representative legal rows (not every pitch assignment); 2,928 cases have a region
without a beat column. Separate faults remove workspace, evidence, readiness, parameter, and analyzer
checks. Dispatch is exercised for every Woods route, including transform routes.

Guide tests inspect declared observations, renamed definitions, every phase including comparison,
entry/resume/stage painting, undo/redo, and leaving for an ordinary lesson or Studio. Landmark effect
spies verify both melody coordinates and drum coordinates. These assert calls and arguments, not visible
classes, CSS shadow order, rendered rings, or audible narration. Browser verification remains necessary.

**A source regression, found red and then fixed:** switching A/B versions in comparison called
`applySong` directly and never reapplied decorations. Both quests lost their melody/drum rings, and Woods
also lost its beat guide. The tester left the test red, recording both switch directions in both quests,
and did not edit `index.html`. The pick now calls `applyStageDecor()` after its load. The test is green
and audited: faults skip the redecoration, run it only for the Firefly, or run it before the rebuild.

The tester's own run, before the fix, was **522 passing and 1 failing**, and its complete audit caught
**469 mutations across 145 green tests**. The re-run after the fix is recorded in `REVIEW-LOG.md`
§ Step H.

`questavailability.test.mjs` retains all five non-fork guarantees from the former
`questconfirm.test.mjs`: readiness/declared-gate sweeps, comparison-offer gate sweeps,
`questEvaluateRun` evidence construction and purity, the shared shell/controller evaluation seam,
and rejection of authorable confirmation gates. `continueQuest()` is now exactly one action call;
it never retries a refusal or manufactures the removed confirmation state.

`quest-playtest.test.mjs` covers whole-model route invisibility with identical descriptor tokens,
independently varied live and persisted matches, immediate matched/unmatched progression and equal
payoff, renamed quest ids, all three exclusive transform witnesses and the four keep/change
combinations, final-offer readiness exemption after an actual edit, phase/status text, the text-only
status sink, friend/path render boundaries, narration envelopes, landmark wording, and finale naming.
`helpers/quest-playtest-mutations.mjs` supplies a fault for each new guarantee. The source/sink tests
check wiring and text assignment; they do not infer rendering, audio, or background paint from stubs.

Step E commit 6 coverage is in `questcast.test.mjs` and `questfinale.test.mjs`. It covers cast
validation and derived attribution, persisted tokens, unsaved-edit guards, rename ordering and
repair, pure models, and finale effect boundaries. `helpers/quest-e6-mutations.mjs` contributes
its faults to the same default audit; `--e6-only` selects them while developing. All anchors and
mutant syntax are checked before the sweep starts.

The harness exposes `__script`, every script it compiled joined in document order (including
in-memory audit mutations), and `__scripts`, the same as a per-file `{ name, src }` list. `__script`
is for slicing and searching only. `questcast.test.mjs` slices it from `const QUEST_DESCRIPTOR_CAPABILITY=`
to `// GROOVES is an array` (both in `js/quest-engine.js` since TUN-7), so a change that puts those
two in different files, or reorders them, has to move that test to a per-file lookup.
The collision test executes the actual descriptor-index initializer with synthetic primitives in an
isolated VM. It does not copy the indexing algorithm or change the production registry. Finale tests
spy on the transport/confetti boundaries and invoke navigation with explicit input; they do not prove
drawn overlays, focus, confetti, audible playback, or real menu routing.

`quest-e6-review.test.mjs` holds the source regressions the E6 tester found — an offer that could save a
document the store had just refused, and a path switch that discarded it. They were left **red** by the
tester rather than hidden, and are green now that the source is fixed; the saved-message regression it
found lives in `questshell.test.mjs`. `REVIEW-LOG.md` § *Step E* records what was found and what was done
about it.

## A7/A8 migration record (2026-09-22)

The supplied working tree reproduced **16 failures out of 493**, rather than 17. Its pre-existing
`questsemantics.test.mjs` edit already added `second-fall-new-shimmer` to the expected witness list;
that mechanical update was preserved. The other mechanical audit updates are the rename label's
new spelling and the unsaved-edit fault's anchor after `questConfirm` was removed.

**Removed subjects:** twelve tests in `questconfirm.test.mjs` exercised the deleted fork itself:
asking once; matched-path confirmation exemption; the two prompt actions and cancellation;
confirmation-key fields; phase identity; edit/undo invalidation; leave/reload invalidation;
pick invalidation; new-run identity; gate closure while an answer was pending; comparison's
confirmation exemption; and refusing to ask before readiness/playback. Their confirmation faults
and the confirmation-only selector were deleted because A7 removes the behavior, not because they
were failing. The old controller test requiring an explicit choice now requires one press.
The former unmatched-path test's **equal-payoff guarantee** survives in the new end-to-end test.

**Preserved subjects:** the five availability/purity/grammar tests above remain. Their fixtures
no longer call `ask()` or assert `asking`/`confirmText`. The readiness and comparison sweeps keep
their combinations and button/door assertions. The shared-seam test now tests procedural shell
availability and a pre-transition controller consultation, without making route matches a gate.

**Outstanding source regression:** `the shell and controller both consume the shared evaluation seam`
is intentionally red. The shell still calls `questEvaluateRun`; `performQuestAction("continue")`
no longer does. Suppressing `questPaintField` in the test prevents a post-transition repaint from
masquerading as the controller consultation. The same migrated test was executed against pre-playtest
`HEAD:index.html` in memory and passed. This is an architectural regression in the explicitly retained
guarantee; the ordinary readiness/gate sweeps agree, and this is not evidence of a normal player's
button disagreeing with the door. No source was changed to resolve it or disguise it in a helper.

The green shell half is separately mutation-audited. The red controller regression has no green
baseline on current source and is therefore not counted as a mutation kill or silently skipped in
the normal suite. A successful mutation audit is not a claim that the full suite is green.

Verification: syntax passes; **490 of 491 tests pass**, with only the retained controller-seam
regression failing (zero skips). The complete audit catches **307 faults across 111 green tests**;
the A7/A8 subset catches **44 faults across all 10 new tests**. The pre-existing semantics fixture
change is included in these counts. `git diff --check` passes.

Read-aloud **input** is covered; actual narration, voice assets, `file://` playback, sidebar/progress
placement, collapsed ways, and gradient tiling still require real-browser observation/listening.
The owner supplied the layout verification; this tests-only round does not re-certify it or the
unheard/unseen audio and paint changes. No game, design, generated asset, or review-history file was
edited, and nothing was committed or pushed.

## Famous-tune meter mutation audit

```bash
node tests/famous-meter-mutations.mjs
```

`famous-meter.test.mjs` pins the data contract (each declared meter, whole-bar fields so the Jukebox loop
keeps time, lengths that never run into the next note, reveals flat except where the vine is taught);
`famous-meter-integration.test.mjs` drives the real paths — the Jukebox buttons, share links, old saves,
the count-in on a pick-up, the scheduler across two loops, and entering each level that owns a reveal. The
audit re-runs each integration case against an in-memory fault (18 of them, reusing the quest audit's hook)
and requires a behavioural assertion failure, not a crash. Deliberately NOT here: any frozen checksum of the
tunes themselves. The owner corrects them against his scores, and a hash would fail every legitimate
correction without saying what changed — content is reviewed in `git diff`, not by a test.
