# TUN-86 — Send security and caching headers with the site

Branch `ao/tun-86-headers/root` · Size **S** (label and `## Size` agree) · not `needs-owner`

## Plan (Claude)

**One `_headers` file at the repository root, copied into `site/` by both builds.** Cloudflare Pages
reads `_headers` from its build output folder, and so does Netlify from its publish folder, with the
same syntax: a path line, then indented `Name: value` lines. So one file serves both hosts. Each build
gets one more copy step, `cp _headers site/_headers`, and `tests/cloudflare-publish.test.mjs`'s list of
allowed copies gets the same line. **Which host:** both. Netlify serves `tunegarden.game` today, so the
headers reach players when this merges, not only after the DNS switch (TUN-85).

**Rules must not overlap on a header.** Cloudflare joins a header that two matching rules both set with
a comma (`max-age=0, must-revalidate, max-age=…` would be a broken `Cache-Control`). Netlify's docs do not
say what it does. So the security headers live in `/*` alone, and `Cache-Control` lives only in rules
whose paths never overlap: `/`, `/index.html`, `/js/*`, `/samples/*`, `/vendor/*`, `/voice/*`.

The policy, from what the page actually loads (searched, 2026-11-14):

| Directive | Value | Why |
|---|---|---|
| `default-src` | `'self'` | Fallback for everything not named (images: none, beyond the browser's own favicon request). |
| `script-src` | `'self'` | 30 `<script src>` files, all local; no inline `<script>`; every `on…` handler in `js/` is a DOM property (`el.onclick=`), not an HTML attribute; no `eval` or `new Function`. Sample packs load through `<script>` tags `js/audio.js` makes, from `samples/`. |
| `style-src` | `'self' 'unsafe-inline'` | The inline `<style>` block, the `style=` attributes and code-set styles. Accepted, as the ticket says. |
| `font-src` | `'self'` | `vendor/fonts/` (TUN-81). |
| `media-src` | `'self'` | Narration: `new Audio("voice/<hash>.mp3")`. |
| `connect-src` | `AUTH.apiUrl`, `https://cognito-idp.us-east-1.amazonaws.com` | `js/cloud.js`'s `fetch` calls, and the Cognito library's endpoint (`"https://cognito-idp."+region+".amazonaws.com/"`). Not `'self'`: nothing fetches from the site. |
| `object-src` | `'none'` | No plugins. |
| `base-uri` | `'none'` | No `<base>`. |
| `form-action` | `'none'` | No `<form>` anywhere (the sign-in form is plain inputs and buttons). |
| `frame-ancestors` | `'none'` | Other sites cannot frame the game. |

`blob:` and `data:`: none needed. Sample packs are base64 strings decoded with `atob` into an
`ArrayBuffer` for `decodeAudioData` — no URL. The Cognito library's one `blob:` match is a
`responseType` helper on its XHR, not a URL. Browser speech and Web Audio need no permission.

Also on `/*`: `X-Frame-Options: DENY` (older browsers), `X-Content-Type-Options: nosniff`,
`Referrer-Policy: no-referrer` (nothing the page calls needs a `Referer`; CORS uses `Origin`).

**Caching.** `/`, `/index.html`, `/js/*`, `/samples/*` and `/vendor/*`: `public, max-age=0,
must-revalidate` — what both hosts send by default, now written down so a later rule cannot quietly
change it. `/voice/*`: `public, max-age=2592000` (30 days), **not a year and not `immutable`**, for two
reasons the ticket did not have:

1. A clip's name is a hash of its **text only**. `tools/gen-voice.mjs --force` re-voices every clip
   under the same names (its own usage line: "re-generate every clip (e.g. after changing the voice)").
2. A clip that is not baked yet gets `index.html` back through the single-page fallback, with a 200.
   If `/voice/*`'s rule applies to that response too, a player's browser keeps the HTML under that clip's
   name, and keeps falling back to browser speech after the clip is baked — for as long as the cache
   lasts. The preview check below finds out whether the rule applies there.

Thirty days bounds both. If the preview shows the fallback does not get the rule, (2) goes away, but (1)
stays, so 30 days stays.

**Files:** `_headers` (new); `netlify.toml` and `cloudflare-build.sh` (one copy step each, and their
comments); `tests/cloudflare-publish.test.mjs` (`ALLOWED`, the published top-level names, the mutation
strings that quote the whole chain); a new `tests/site-headers.test.mjs`.

**Tests** (`tests/site-headers.test.mjs`): `_headers` exists and is published by both builds; it parses
(path lines, indented headers, comments), at most 100 rules and no line over 2,000 characters
(Cloudflare's limits); for the page (`/`, `/index.html`), one script, one sample pack, one vendored file
and one real clip, every matching rule taken together sets each header **at most once**, and the page,
the scripts and the clips each get the `Cache-Control` above; the CSP on `/*` has `script-src 'self'`
and nothing more, `frame-ancestors 'none'`, and a `connect-src` that is exactly `AUTH.apiUrl` plus
Cognito's endpoint for `AUTH.region`, both read from `js/cloud.js` — so moving the API breaks the test,
not the game. Also: the page has no inline `<script>` and no `on…=` attribute, the two things
`script-src 'self'` would block. Mutations of each kept as tests.

**Verification:** on the Cloudflare preview (and Netlify's, since it now gets the headers too), the six
flows from *Done looks like* with the console open; `curl -I` for the page, one script, one clip, and a
clip that does not exist. Cloud sync cannot be tested on a preview (the API's CORS refuses preview
origins); opening the sign-in form can, and a `connect-src` violation shows before CORS does.

**Risks.** Netlify's deploy previews inject Netlify's own review toolbar script; the policy will block it
there and the console will say so. That is a preview-only effect, not a production one. After the DNS
switch, any Cloudflare zone feature that injects a script (Web Analytics' automatic beacon, Rocket
Loader, Email Address Obfuscation) would be blocked or need the policy changed — none is on today.

**Checkpoint (§ 5):** no `needs-owner` label; no musical or player-facing question; no fork the ticket's
readings split on. Build.

## Verification (Claude, 2026-11-14)

On commit `825d7d1`, both previews: Cloudflare `https://ao-tun-86-headers-root.music-garden.pages.dev`
and Netlify `https://deploy-preview-139--tunegarden.netlify.app`.

### `curl -I` — the page, one script, one clip, on both hosts

Only the header lines that matter are kept (`grep -iE` on status, type, cache and the four security headers).

```text
$ curl -sI https://ao-tun-86-headers-root.music-garden.pages.dev/
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Cache-Control: public, max-age=0, must-revalidate
content-security-policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; media-src 'self'; connect-src https://xush1pnxc7.execute-api.us-east-1.amazonaws.com https://cognito-idp.us-east-1.amazonaws.com; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
referrer-policy: no-referrer
x-content-type-options: nosniff
x-frame-options: DENY

$ curl -sI https://ao-tun-86-headers-root.music-garden.pages.dev/js/boot.js
HTTP/1.1 200 OK
Content-Type: application/javascript
Cache-Control: public, max-age=0, must-revalidate
content-security-policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; media-src 'self'; connect-src https://xush1pnxc7.execute-api.us-east-1.amazonaws.com https://cognito-idp.us-east-1.amazonaws.com; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
referrer-policy: no-referrer
x-content-type-options: nosniff
x-frame-options: DENY

$ curl -sI https://ao-tun-86-headers-root.music-garden.pages.dev/voice/108fedab.mp3
HTTP/1.1 200 OK
Content-Type: audio/mpeg
Cache-Control: public, max-age=2592000
content-security-policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; media-src 'self'; connect-src https://xush1pnxc7.execute-api.us-east-1.amazonaws.com https://cognito-idp.us-east-1.amazonaws.com; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
referrer-policy: no-referrer
x-content-type-options: nosniff
x-frame-options: DENY

$ curl -sI https://deploy-preview-139--tunegarden.netlify.app/
HTTP/1.1 200 OK
Cache-Control: public,max-age=0,must-revalidate
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; media-src 'self'; connect-src https://xush1pnxc7.execute-api.us-east-1.amazonaws.com https://cognito-idp.us-east-1.amazonaws.com; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
Content-Type: text/html; charset=UTF-8
Referrer-Policy: no-referrer
X-Content-Type-Options: nosniff
X-Frame-Options: DENY

$ curl -sI https://deploy-preview-139--tunegarden.netlify.app/js/boot.js
HTTP/1.1 200 OK
Cache-Control: public,max-age=0,must-revalidate
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; media-src 'self'; connect-src https://xush1pnxc7.execute-api.us-east-1.amazonaws.com https://cognito-idp.us-east-1.amazonaws.com; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
Content-Type: application/javascript; charset=UTF-8
Referrer-Policy: no-referrer
X-Content-Type-Options: nosniff
X-Frame-Options: DENY

$ curl -sI https://deploy-preview-139--tunegarden.netlify.app/voice/108fedab.mp3
HTTP/1.1 200 OK
Cache-Control: public,max-age=2592000
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; media-src 'self'; connect-src https://xush1pnxc7.execute-api.us-east-1.amazonaws.com https://cognito-idp.us-east-1.amazonaws.com; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
Content-Type: audio/mpeg
Referrer-Policy: no-referrer
X-Content-Type-Options: nosniff
X-Frame-Options: DENY

```

Also checked: a clip that does not exist (`/voice/00000000.mp3`) gets `index.html` (`text/html`, 200)
with the **30-day** cache on both hosts. The single-page fallback takes the path's rules, as the plan
feared, which is why clips are not cached for a year. `_headers` itself is not served: Netlify answers
404, and Cloudflare answers with the fallback page. A nested `vendor/fonts/nunito/` path gets every
header once, on both hosts, so `*` crosses `/` on Netlify as it does on Cloudflare.

### The six flows, with the console

AO's Browser panel loaded the game with nothing in its console, but its console never shows CSP
reports, so it can't tell "no violations" from "nothing recorded". (Its click on the landing card's
*Sign in to resume* also did nothing, with or without the policy: on `music-garden.pages.dev`, which has
none, it behaved the same.) So the flows ran in headless Chrome over the DevTools protocol, driven by the
game's own functions (a scratch script outside the repository). Before any page script ran, a
`securitypolicyviolation` listener was installed, and every console message, page exception, blocked
load and request origin was recorded. Then three **controls** the policy must block, to prove the
recording works:

| Step | Cloudflare preview | Netlify preview | `music-garden.pages.dev` (no policy) |
|---|---|---|---|
| Load: fonts (5 faces loaded), Cognito library, landing screen | ✓ | ✓ | ✓ |
| Sign-in form opened; a sign-in attempt with a made-up user reaches Cognito and shows "Incorrect username or password." | ✓ | ✓ | ✓ |
| A level: Level 1/13 loaded and ▶ Play pressed; its story's clip `voice/b547890d.mp3` fetched and played (`audio/mpeg`, 200 or 206) | ✓ | ✓ | ✓ |
| Sample pack: Piano chosen, `samples/piano.js` loaded and decoded (`sampleBank.piano.ready`) | ✓ | ✓ | ✓ |
| The Studio (its clip `voice/a1eb81aa.mp3` fetched); a Jukebox tune (`fourchord`) playing | ✓ | ✓ | ✓ |
| A quest: `startQuestRun("firefly-crossing")` → `ok:true` | ✓ | ✓ | ✓ |
| A `#s=` link opened fresh → "Level 1/1: Studio" | ✓ | ✓ | ✓ |
| **Violations during all of the above** | **none** | **one, preview-only** (below) | none |
| Control: an inline `<script>` | blocked (`script-src-elem`, did not run) | blocked | ran |
| Control: a `data:` script | blocked (`script-src-elem`) | blocked | — |
| Control: `fetch("https://example.com/")` | blocked (`connect-src`) | blocked | sent (CORS refused it) |
| Origins contacted | the site, `cognito-idp.us-east-1.amazonaws.com`, `xush1pnxc7.execute-api.us-east-1.amazonaws.com` | same | same + `example.com` (the control) |

**The one Netlify violation** is Netlify's own review toolbar, which deploy previews add
(`/.netlify/scripts/cdp`, then a frame of `https://app.netlify.com`):
`Framing 'https://app.netlify.com/' violates the following Content Security Policy directive: "default-src 'self'"`.
Production does not have it: `curl -s https://tunegarden.game/ | grep -c netlify/scripts` → `0`.

**The API** (`cloudSongGet`) failed on CORS on all three hosts, as it must on a preview (the API allows
only `tunegarden.game`). It was a CORS refusal, not a CSP violation: the request was sent. Cloud sync
itself can't be tested on a preview.

### Tests

`node --test "tests/*.test.mjs"`: 747 pass, 0 fail. `node tools/check-syntax.mjs`: clean. Mutation audit
by hand on the real `_headers` (each run restored): `/js/*` renamed, `/voice/*` renamed,
`'unsafe-inline'` added to `script-src`, `X-Frame-Options` dropped, the API host changed, the `/*` rule
moved to `/index.html` — each turned `site-headers.test.mjs` red (3 to 5 failing tests each).

### Not verified

- The headers on `tunegarden.game` itself: they arrive when this merges (Netlify), and on Cloudflare
  after the DNS switch (TUN-85).
- Cloud sync and cloud songs with the policy on: previews can't reach the API (CORS). `connect-src`
  names exactly `AUTH.apiUrl`'s origin, the same origin the API calls use, and the sign-in reached
  Cognito under the policy.
- Firefox and Safari: the flows ran in Chrome only.

## PR review (GPT through `ask.sh`, Astra — AO's reviewer is out of service)

### Round 1 — on `d77c3fb`: changes requested

<details><summary>GPT's review, verbatim</summary>

**CHANGES REQUESTED on d77c3fb.**

I reproduced two false negatives in the new header checker using in-memory mutations. These findings concern the regression guards; the current `_headers` does not contain these faults.

1. **Medium — Duplicate CSP directives are interpreted backwards.**  
   [tests/helpers/site-headers.mjs:82](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-30/tests/helpers/site-headers.mjs:82)

   `Map.set()` keeps the **last** occurrence, whereas browsers use the **first** and ignore subsequent duplicates. [CSP parsing specification](https://www.w3.org/TR/CSP3/#parse-serialized-policy)

   Prepending any of these to the current policy makes the actual `problems()` checker return `[]`:

   ```text
   script-src * 'unsafe-inline' 'unsafe-eval';
   script-src 'none';
   connect-src *;
   ```

   The first permits external and inline scripts and eval; the second prevents the game loading; the third permits arbitrary connections. The later, expected directives conceal each fault from the checker.

   **Required change:** reject duplicate directive names, case-insensitively.

   **Missing tests:** prepend each example independently to the real CSP; expect a duplicate-directive diagnostic. Include `SCRIPT-SRC 'none';` to verify case normalization. The unchanged policy must remain accepted.

2. **Medium — The narration cache check accepts policies that disable caching or exceed the documented bound.**  
   [tests/site-headers.test.mjs:54](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-30/tests/site-headers.test.mjs:54)

   The check only requires `max-age >= WEEK` and absence of `immutable`. Replacing the voice cache value with any of these also makes `problems()` return `[]`:

   ```text
   public, max-age=2592000, no-store
   public, max-age=2592000, no-cache
   public, max-age=315360000
   ```

   `no-store` prohibits storage; unqualified `no-cache` requires validation before reuse, defeating the intended reduction in repeated requests. [HTTP caching specification](https://www.rfc-editor.org/rfc/rfc9111.html#section-5.2.2) The final example permits ten years, defeating the chosen limit for re-voiced clips and cached fallback HTML.

   **Required change:** pin the intended `public, max-age=2592000` policy, or validate equivalent semantics with an explicit upper bound and rejection of conflicting directives.

   **Missing tests:** substitute each value above into `/voice/*`; expect a cache-policy diagnostic. Keep `public, max-age=2592000` as the passing control.

Syntax checking and all **10 header tests passed**. The full suite encountered sandbox `EPERM` failures creating temporary fixtures, so I cannot independently confirm the recorded full-suite pass. I reviewed the supplied browser evidence but did not independently rerun those flows. No files were edited.

</details>

**My answers**

1. **Medium — a repeated CSP directive was read last-wins.** **Agreed.** A browser obeys the first copy,
   so a wrong directive put in front of the real one would have passed. `parseCsp` now keeps the first,
   as the browser does, and lists every repeat; `cspProblems` refuses one ("CSP repeats …"). New test
   with GPT's four cases (`script-src * 'unsafe-inline' 'unsafe-eval'`, `script-src 'none'`,
   `connect-src *`, `SCRIPT-SRC 'none'`), plus a repeat placed after the real one, and the unchanged
   policy as the control.
2. **Medium — the clip-cache check accepted `no-store`, `no-cache` and ten years.** **Agreed.** The check
   now pins the exact value, `public, max-age=2592000`, rather than a bound. Test: GPT's three values,
   plus `immutable`, `max-age=0` and one year, each refused; the real rule as the control. The unused
   `maxAge` helper is gone.

Both fixes were audited in reverse: putting back last-wins parsing, or the old "a week or more, not
immutable" check, turns the new test red. `_headers` is unchanged, so the preview verification above
still holds.

GPT noted that its sandbox could not run the full suite (`EPERM` creating temporary fixtures) and that it
did not rerun the browser flows; both stay my own evidence.
