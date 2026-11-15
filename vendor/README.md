# vendor/ — third-party files the game serves from its own site

The page makes no third-party requests (owner, 2026-11-13; TUN-81). So the two things it once loaded from
other companies live here, copied byte for byte from their releases, and the site serves them itself:

| What | Files | Version | Where it came from | Licence |
|---|---|---|---|---|
| Cognito sign-in library | `cognito/amazon-cognito-identity.min.js` | **amazon-cognito-identity-js 6.3.22** | `dist/amazon-cognito-identity.min.js` from the npm tarball `https://registry.npmjs.org/amazon-cognito-identity-js/-/amazon-cognito-identity-js-6.3.22.tgz` (registry integrity `sha512-FcBgh4QS2OIusMak+YVgOQTvdhBDgz7uOkblRN5W8d8teWvCLdJ9uNVgwQ5ivDdlmUqR259JvKLido1X3J2Qiw==`) | Apache-2.0: `cognito/LICENSE.txt`, `cognito/NOTICE.txt`, from the same tarball |
| Fredoka 400/500/600 | `fonts/fredoka/*.woff2` | Google Fonts `fredoka/v17` | `fonts.gstatic.com`, the files Google's css2 API named on 2026-11-14 | SIL OFL 1.1: `fonts/fredoka/OFL.txt` (`google/fonts`, `ofl/fredoka/OFL.txt`) |
| Nunito 400/600/700/800 | `fonts/nunito/*.woff2` | Google Fonts `nunito/v32` | as above | SIL OFL 1.1: `fonts/nunito/OFL.txt` (`google/fonts`, `ofl/nunito/OFL.txt`) |

**The library's SHA-256:** `32811f694592e437391fe040d836a474d75f54108cfa5123d67e8a4d30283901` — the same bytes
jsDelivr served for `amazon-cognito-identity-js@6` on 2026-11-14, when `@6` resolved to 6.3.22.
`SHA256SUMS` lists every file here but itself and this README, in `sha256sum -c` format;
`tests/vendor.test.mjs` fails when a file changes, appears or goes missing without it. `.gitattributes`
keeps `vendor/` out of line-ending conversion, so a checkout on any OS has the released bytes.

`fonts/fonts.css` is Google's css2 response for the old `<link>`
(`family=Fredoka:wght@400;500;600&family=Nunito:wght@400;600;700;800&display=swap`), rule for rule, with each
`fonts.gstatic.com` URL replaced by the local file; the comment at its top says why the per-weight rules stay.

## How the page uses them

- `index.html` links `vendor/fonts/fonts.css` in `<head>`. Over `file://` too: a stylesheet and `@font-face`
  need no `fetch()`.
- `index.html` loads the library with a plain `<script src>` just before `js/load-gate.js`, so
  `AmazonCognitoIdentity` exists when `js/cloud.js` runs. It is **not a game script**: the test harness
  (`tests/helpers/game-scripts.mjs`) lists it apart, as `vendored` — `tools/check-syntax.mjs` still compiles
  it, but the vm harness never runs it — and the load gate ignores its errors because it is outside `js/`.
  So a missing or broken copy leaves the game guest-only, as the CDN being down always did.
- Both build configs copy `vendor/` (`netlify.toml`, `cloudflare-build.sh`), and both publish tests check
  every file in `SHA256SUMS` is published.

## Updating

Moving to a new major version of the library, or changing the fonts, is a ticket of its own. To take a
6.x fix: download the release tarball from the npm registry, check its integrity against
`npm view amazon-cognito-identity-js@<version> dist.integrity`, copy `package/dist/amazon-cognito-identity.min.js`
(and `LICENSE.txt`/`NOTICE.txt` if they changed) here, update the table and the hash above, and regenerate
`SHA256SUMS` from this folder:

```bash
find . -type f ! -name SHA256SUMS ! -name README.md | sed 's|^\./||' | LC_ALL=C sort | xargs sha256sum | sed 's/ \*/  /' > SHA256SUMS
```

A new build of the library must also live with the site's content security policy (`_headers`, TUN-86),
which allows no `eval` and no connection except to the backend and Cognito. `tests/site-headers.test.mjs`
scans the file for code built from strings, and allows only webpack's `globalThis` shim, by its exact
text. If a new build fails there, check that build on a preview with the console open before you loosen
anything.
