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
  `www.tunegarden.game` each print `game scripts: 29 injected: 0`.
- The same grep on two sample lines — RUM's beacon tag and Rocket Loader's `/cdn-cgi/` script — counts 2,
  so the check does catch an injection.
- The suite: 913 tests, 913 pass (`node --test "tests/*.test.mjs"`).
- **Unverified:** the dashboard locations themselves. Only the RUM path comes from the owner's own finding
  (on the ticket); the others are where Cloudflare documented them, and Auto Minify may be gone from the
  dashboard (Cloudflare announced its retirement in 2024). The owner confirms the names in the playtest.
