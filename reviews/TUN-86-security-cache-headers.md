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
