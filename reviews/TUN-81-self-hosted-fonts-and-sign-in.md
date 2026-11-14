# TUN-81 — Load the fonts and the sign-in library from our own site

Branch `ao/tun-81/root` · PR (not yet)

**Size: M, not the ticket's S.** The ticket says to work it as M if the test harness needs a new rule for
vendored scripts, and it does: `tests/helpers/game-scripts.mjs` treats every local `<script src>` as a game
script, so a local copy of the library would become the first "game script", ahead of `js/load-gate.js`.

## Plan (Claude)

**What exists today.** `index.html` `<head>` preconnects to `fonts.googleapis.com` and `fonts.gstatic.com`
and links Google's CSS for Fredoka 400/500/600 and Nunito 400/600/700/800. The last `<script>` block starts
with `https://cdn.jsdelivr.net/npm/amazon-cognito-identity-js@6/dist/amazon-cognito-identity.min.js`, then
`js/load-gate.js`. The harness skips that tag only because its `src` is absolute ("CDN, not ours"), and
`js/load-gate.js` ignores its errors because its URL is outside the page's `js/` folder, so a missing library
leaves the game guest-only (`cognitoReady()` false in `js/cloud.js`).

**Measured before planning (2026-11-14):**
- jsDelivr's `@6` resolves to **6.3.22** (`x-jsd-version`), which is also npm's `latest`. The npm tarball
  matches the registry's integrity (`sha512-FcBgh4QS…J2Qiw==`), and its
  `dist/amazon-cognito-identity.min.js` is byte-identical to jsDelivr's file: SHA-256
  `32811f694592e437391fe040d836a474d75f54108cfa5123d67e8a4d30283901`, 112,313 bytes, no
  `sourceMappingURL`. Its only network host is `https://cognito-idp.` + region. Apache-2.0, with
  `LICENSE.txt` and `NOTICE.txt` in the tarball.
- Google's CSS (Chrome user agent) declares 29 `@font-face` rules over **8 variable `woff2` files**:
  Fredoka latin, latin-ext, hebrew; Nunito latin, latin-ext, cyrillic, cyrillic-ext, vietnamese — each
  file repeated once per weight, with `unicode-range` per subset. About 180 KB in all; a browser fetches
  only the subsets the text on screen needs.
- **`file://` works for fonts in Chrome 157:** a probe page linking `vendor/fonts/fonts.css`, whose
  `url()`s point into subfolders, reported `Fredoka 600 loaded | Nunito 400 loaded` from headless Chrome
  opened on `file:///…/index.html`. So plain `woff2` files are enough; no base64.

**Layout — one new top-level runtime folder, `vendor/`:**
```
vendor/README.md                     what is here, versions, sources, licences, how to update
vendor/SHA256SUMS                    every other file in vendor/, in `sha256sum` format
vendor/cognito/amazon-cognito-identity.min.js   6.3.22, byte-identical to the npm release
vendor/cognito/LICENSE.txt, NOTICE.txt           from the same tarball (Apache-2.0 asks for both)
vendor/fonts/fonts.css               Google's CSS, rule for rule, with local url()s
vendor/fonts/fredoka/{latin,latin-ext,hebrew}.woff2 + OFL.txt
vendor/fonts/nunito/{latin,latin-ext,cyrillic,cyrillic-ext,vietnamese}.woff2 + OFL.txt
```
Outside `js/` on purpose: the load gate keeps treating the library as optional, exactly as it treats the
CDN script now (a missing or broken copy leaves the game guest-only rather than refusing to start).

**`index.html`:** drop both preconnects and Google's `<link>`; add `<link rel="stylesheet"
href="vendor/fonts/fonts.css">`; the script tag becomes `<script src="vendor/cognito/amazon-cognito-identity.min.js">`
in the same place, before `js/load-gate.js`. `--font-display`/`--font-body` stay as they are.

**`fonts.css` keeps Google's 29 per-weight rules** rather than collapsing to one `font-weight: 400 800`
range per file. A range would change rendering: Nunito has no 500 face, so today `font-weight:500` on
body text matches the 400 face; with a range it would render at a true 500. Keeping the rules keeps
font matching identical. `font-display: swap` stays.

**The harness rule** (`tests/helpers/game-scripts.mjs`): a local `<script src>` under `vendor/` is not a game
script. `gameScripts()` keeps it out of `scripts` — so the syntax check, the vm harness, the load-order
tests, the mutation audits and `tools/gen-voice.mjs` see exactly what they see today — and returns it in a
new `vendored` array (`{ name, line }`). The type/async/defer/nomodule checks still apply to it first: the
library must run synchronously, before `js/cloud.js` reads `AmazonCognitoIdentity` at load. `load-gate.js`
stays `scripts[0]`. Running the real library in the vm harness was rejected: it would change every test's
cloud state (a real `CognitoUserPool` instead of `null`) for no gain.

**Build:** `cp -r vendor site/vendor` added to `netlify.toml`'s command and `cloudflare-build.sh`; `vendor` added
to `tests/cloudflare-publish.test.mjs`'s `ALLOWED` and its top-level-folders and per-folder mutation lists.

**Tests:**
1. `tests/game-scripts.test.mjs` — a `vendor/` script is skipped from `scripts`, listed in `vendored`, still
   refused when `async`/`defer`/`type=module`, and a non-`vendor/` local script (`vendorx/a.js`,
   `js/vendor/a.js`) is still a game script.
2. New `tests/vendor.test.mjs`:
   - every file under `vendor/` except `SHA256SUMS` itself is listed in `SHA256SUMS`, every listed file
     exists, and each hash matches (so a changed or extra file fails);
   - `vendor/README.md` states the library's version and its SHA-256, and that hash equals `SHA256SUMS`';
   - the page links `vendor/fonts/fonts.css` and the vendored script, each exactly once, the script before
     `js/cloud.js`;
   - every `url()` in `fonts.css` names a file listed in `SHA256SUMS`; every font file is used;
   - **no third-party reference:** `index.html` (comments included — strict on purpose) and `fonts.css` contain
     no `src=`/`href=`/`url()`/`@import` whose target has a scheme or starts with `//`, except `data:`;
     `<a href>` links are excluded (a link is not a request until clicked) — today there are none. Each
     clause has a mutation in the test.
3. Publish tests: `tests/netlify-publish.test.mjs` and `tests/cloudflare-publish.test.mjs` check the vendored
   files too — `[...scripts, ...vendorFiles]` as `{ name, inline:false }`, from `SHA256SUMS` — so dropping
   `cp -r vendor site/vendor` from either config fails, naming the files. Mutations: the step dropped, copied
   to the wrong place, without `-r`.
4. `tests/load-gate.test.mjs` — the two fixtures that use the CDN URL become the same-origin
   `…/vendor/cognito/amazon-cognito-identity.min.js`: an error from it is not a game-script failure. That is
   the new real case (same origin, outside `js/`).

**Docs:** comments in `index.html`, `js/load-gate.js` (its "own CDN script" sentence), `netlify.toml`,
`cloudflare-build.sh`; `README.md` (code organisation, repository map row for `vendor/`); `AGENTS.md`
(runtime asset folders, the build-config invariant, Where to find things → `vendor/README.md`);
`tests/README.md` ("CDN tags skipped" → also `vendor/`). The credits file stays TUN-89's.

**Browser checks:**
- AO's browser on the local preview, network capture on: the list of hosts the page requests, as a guest
  and after a sign-in attempt — pasted here. Fonts render (snapshot/screenshot compared with `main`).
- `file://`: AO's browser refuses it, so headless Chrome on this machine, as in the probe above, on the real
  `index.html`: every face the page uses reports `loaded`, and `AmazonCognitoIdentity` is defined.
- Sign-in: **no account is created in the production user pool.** A sign-in with a made-up username on the
  local preview must come back with Cognito's own answer ("Incorrect username or password" / "User does not
  exist"), which proves the library loaded and reached `cognito-idp.us-east-1.amazonaws.com`. A real
  sign-up and sign-in, and cloud sync on production, go on the owner's list.

**Risks:** the vendored file goes stale on security fixes (no update automation — `vendor/README.md` says how
to update, and the hash test makes an update deliberate). Firefox and Safari on `file://` are not checked
here (only Chrome is installed); Firefox allows fonts from the page's own folder and below, which is this
layout.

**Owner questions:** none. The no-test-account choice is mine; the owner may overrule it.

## Design review (Astra)
<details><summary>GPT's design review of the plan, verbatim (2026-11-14)</summary>

1. **High — A rejected login does not satisfy the authentication acceptance criterion.**  
   The plan deliberately replaces successful sign-up/sign-in with a made-up username. That proves endpoint reachability, but not successful authentication, session/token handling, or the expected “cloud sync failed” state. Those paths are distinct in `js/cloud.js`, as TUN-80 already established.

   **Change:** plan a successful account flow on the local preview using a designated test account, including sign-up coverage. If credentials or account creation cannot be arranged, explicitly leave these acceptance checks pending before merge. “The owner may overrule” is not an agreed exception.

2. **Medium — Raw-byte checksums conflict with this repository’s line-ending configuration.**  
   [.gitattributes](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-27/.gitattributes:1) specifies `* text=auto`; this checkout has `core.autocrlf=true`. The proposed SDK, licences, CSS and README therefore inherit automatic conversion. A manifest generated here can fail after a Linux checkout—or after a fresh Windows checkout—even though nobody changed the content. Conversion can also break the promised upstream byte identity.

   **Change:** define Git attributes before importing and hashing files. Preserve upstream bytes for copied artifacts, and establish consistent line endings for authored text. Validate hashes against a fresh checkout. Do not normalize bytes inside the checksum test while continuing to claim upstream byte identity.

3. **Medium — Excluding the SDK from VM execution is appropriate; excluding it from syntax checking violates AGENTS.md.**  
   The plan explicitly removes it from both. AGENTS.md requires checking **each local `<script src>` file**. Compilation does not execute Cognito or change the harness’s cloud state, so the reason for excluding execution does not justify excluding compilation.

   **Change:** retain the separate `vendored` collection, but give the syntax checker access to those files and compile them as classic scripts too. Keep them excluded from game execution, narration scanning and game-only mutation audits. Add a malformed-vendor-script case proving the syntax command fails.

4. **Medium — The publish-test changes omit the execution fixture.**  
   The proposed allowlist and manifest checks are sensible, but [the Cloudflare scratch fixture](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-27/tests/cloudflare-publish.test.mjs:202) creates no `vendor/`. Adding the real copy command without updating that fixture makes the successful-build test fail and makes missing-source tests fail for an unrelated missing folder.

   **Change:** add nested SDK, CSS, font and licence fixture files; verify their published bytes; add `vendor` to the missing-source execution cases. Preserve TUN-80’s strict parser, single command chain and context-parity checks. If the shared script reader starts reading vendored sources, also update tests that copy the real HTML and only `scripts` into temporary repositories.

5. **Medium — Localhost network capture cannot establish the deployed privacy requirement.**  
   The static scan covers only two files, and the browser plan covers only the local server. Past records already identify hosting additions: TUN-7 observed Netlify’s injected drawer snippet; TUN-80 recorded a Cloudflare Turnstile script error. These are reasons to inspect actual deployed requests, not proof that either currently violates this ticket.

   **Change:** capture page requests on both hosted previews as well as locally, with initiators to distinguish page traffic from browser tooling. Record guest and successfully authenticated host lists. Investigate any injected third-party request rather than excluding it because the repository did not author it. Describe the static test as a markup/CSS guard, not a comprehensive network guarantee.

6. **Medium — The `file://` check proves asset availability, not the required appearance and working game.**  
   Loaded font faces and a defined `AmazonCognitoIdentity` global do not establish that the real page looks unchanged or that boot completed. Only the HTTP check currently includes a visual comparison.

   **Change:** add a screenshot comparison of equivalent UI states over `file://`, after fonts finish loading, plus a short interaction smoke test and console check. Use a fresh browser context with network unavailable to substantiate offline loading. Chrome-only coverage is acceptable if other browsers remain explicitly unverified.

The core design is **fine as it stands**: one `vendor/` tree, local CSS/font URLs, the exact pinned SDK release, adjacent licences and provenance, synchronous loading before `cloud.js`, and keeping the SDK outside the load gate’s essential `js/` boundary. Keeping the existing per-weight font rules is appropriate for preserving rendering. Both build configurations are correctly identified; no dependency installation or local-asset `fetch()` is proposed.

The ticket’s “Done looks like” still needs explicit coverage for:

- Successful sign-up/sign-in and the expected local-preview sync failure.
- Network-host evidence after successful authentication, including hosted-page verification.
- Visual equivalence and functioning gameplay on `file://`.
- Running and recording both `node tools/check-syntax.mjs` and `node --test "tests/*.test.mjs"`; the plan describes tests but never explicitly schedules the complete required runs.

**Overall verdict: build with the listed changes.**

</details>

## My answers

1. **High — a rejected login does not prove sign-in.** **Disagreed in part.** I will not create an account in
   the production user pool (`us-east-1_Ikzq1qoTI` is the live pool, and the owner has not asked for test
   accounts in it); that is an outward action on production data, not a call for a worker. **Agreed** that a
   rejected login proves only that the library loads and reaches Cognito: the hand-off lists a real sign-up
   and sign-in, with the expected "cloud sync failed" on a preview origin, as **pending before merge** on the
   owner's checklist, not as verified. The owner can run it on the PR's deploy preview with their own account.
2. **Medium — checksums vs. line endings.** **Agreed** (confirmed: `.gitattributes` is `* text=auto`, this
   checkout has `core.autocrlf=true`). `.gitattributes` gets `vendor/** -text` before any file is added, so
   every vendored file is stored and checked out byte for byte; the authored `vendor/README.md` and
   `fonts.css` are written with LF. The hash test reads raw bytes, and I verify it on a fresh clone.
3. **Medium — syntax-check the vendored script.** **Agreed.** `gameScripts()` lists vendored scripts by name
   only (it does not read them, so the temporary-repository tests that copy `index.html` plus `scripts` are
   untouched); `tools/check-syntax.mjs` reads and compiles them too, and a test proves a malformed vendored
   file fails it. They stay out of the vm harness, narration scanning and the mutation audits.
4. **Medium — the Cloudflare scratch fixture.** **Agreed.** The scratch repository gains `vendor/` files
   (nested, binary and text), their published bytes are checked, and `vendor` joins the missing-source cases.
   TUN-80's strict parser, one-line chain and context-parity checks stay as they are.
5. **Medium — hosted previews.** **Agreed in part.** I capture the host list on the local preview and on the
   PR's Netlify deploy preview (and Cloudflare's, if its preview exists for the PR), and investigate any
   third-party host found there. The static test is described as a markup/CSS guard only. The signed-in host
   list waits on answer 1 and goes on the owner's list.
6. **Medium — `file://` appearance.** **Agreed.** Headless Chrome on the real `index.html` over `file://`:
   screenshots of the home screen on `main` (Google Fonts online) and on this branch with the network made
   unreachable (a dead proxy), compared; the DOM after load showing the game booted; the console checked for
   errors. A real interaction on `file://` I cannot drive beyond that, so it goes under *Not verified*.
   Firefox and Safari stay unverified.
- **The two required runs:** **agreed** — both are run after every edit and their results recorded below.

## Verification (Claude, 2026-11-14)

**Hosts the page requested — local preview** (AO's browser, network capture, this worktree served by
`ao preview start`; `index.html` and `vendor/fonts/fonts.css` byte-compared against the server first):
- *Guest, page load:* 34 requests, **one host: the page's own origin** (`http://127.0.0.1:59295`). Among them
  `vendor/fonts/fonts.css`, `vendor/cognito/amazon-cognito-identity.min.js`, `vendor/fonts/fredoka/latin.woff2`,
  `vendor/fonts/nunito/latin.woff2` — only the subsets the screen needs. No `fonts.googleapis.com`,
  `fonts.gstatic.com` or `cdn.jsdelivr.net`.
- *Sign-in with a made-up account* (`tun81-nobody-7f3q`): 3 requests, **one host:
  `https://cognito-idp.us-east-1.amazonaws.com`** (POST 200, OPTIONS 200, POST 400). The game showed Cognito's
  answer, "Incorrect username or password." Page errors: only that 400. So the vendored library loads and its
  sign-in round trip reaches Cognito from a non-`tunegarden.game` origin.
- *Signed in:* **not verified** — no account (answer 1). Expected hosts: own origin, Cognito, and the backend
  `xush1pnxc7.execute-api.us-east-1.amazonaws.com`, whose CORS refuses a preview origin, so sync fails there.

**Looks the same — pixel comparison** (headless Chrome 157, 1600×900, fresh profile each, 8 s virtual time):
| Compared | Pixels that differ (of 1,440,000) |
|---|---|
| `main` on `file://` with Google Fonts online ↔ this branch on `http://` | **0** |
| this branch on `file://` online ↔ the same, network unreachable (dead proxy) | **0** |
| `main` on `file://` online ↔ this branch on `file://` | 393, all inside the Voice `<select>`'s "Music box" text (672,149–732,160): the same face and weight, sub-pixel anti-aliasing only (crops compared at 8×) |
| control: `main` on `file://` online ↔ `main` offline (fallback fonts) | 259,697 — the comparison is sensitive |

**`file://`, network unreachable, over the DevTools protocol:** `AmazonCognitoIdentity` defined, `userPool`
built, the load gate open (every game script ran and boot completed), `document.fonts` ready with 0 faces
failed, and Fredoka 400/500/600 and Nunito 400/800 all load; **no network request at all; no console error
or exception.** The same script on `main` offline: `AmazonCognitoIdentity` undefined and a failed request to
`cdn.jsdelivr.net` — the old behaviour this ticket removes.

**Fresh clones:** with `core.autocrlf=true`, ordinary text files check out CRLF while every `vendor/` file
stays LF (`git ls-files --eol`: `attr/-text`), and `sha256sum -c SHA256SUMS` and `tests/vendor.test.mjs` pass;
the same in an LF clone.

**Mutations run by hand** (each restored): drop the vendor rule in `gameScripts` → 5 tests fail; match the src
text instead of the resolved path → 1; match `vendor` as a prefix → 1; leave `vendoredSources` out of
`tools/check-syntax.mjs` → 1. The scanner run on `main`'s `index.html` finds all four third-party references.

**Not verified here:** a real sign-up and sign-in, and the signed-in host list (answer 1 — the owner's
checklist, before merge); a click that changes the game on `file://` (the onboarding card took the clicks; boot
and the gate are verified, play is not); Firefox and Safari; the hosted previews (after the PR exists).
