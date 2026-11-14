# TUN-76 — Remove the retired music-garden.netlify.app origin from the backend's CORS list

Branch `ao/tun-76-ticket/root` · Size S

## Plan (Claude)

Measured first (2026-11-14, `origin/main` 269b8e2): `https://music-garden.netlify.app/` answers 404,
`https://tunegarden.game/` 301 (to `www`). A CORS preflight (`OPTIONS /songs/x`) to the live API from
`Origin: https://music-garden.netlify.app` gets `access-control-allow-origin: https://music-garden.netlify.app`
back; from `tunegarden.game` and `www.tunegarden.game` it echoes those; from an unknown origin it gets none.

- **`backend/template.yaml`** — drop `https://music-garden.netlify.app` and its "Transition fallback"
  comment from `Api.Properties.CorsConfiguration.AllowOrigins`. Nothing else changes.
- **`tests/backend-template.test.mjs`** — `templateProblems` also checks that `AllowOrigins`, at its effective
  path, is exactly `tunegarden.game` + `www.tunegarden.game`, with mutation cases: the retired origin put
  back, a deploy-preview origin added (the ticket: not without asking), `*`, and the list moved under
  `Metadata`. A later backend ticket (TUN-83, TUN-87, TUN-88) that brings the origin back now fails.
- **Docs** — `README.md` § Backend: drop the "also still allows" note; `backend/README.md` § CORS
  (`+ the Netlify fallback origin`) and the deploy check gain the preflight above, so the owner can see
  the removal took effect. Found while building: `tests/README.md` (what the template test pins) and
  `SAVE-SHARE.md`'s CORS note (+ Netlify fallback) also get a line; the template gains a comment saying
  the test holds the list and that adding an origin is the owner's call.
- **Left alone:** deploy-preview and `tunegarden.netlify.app` origins (ticket's *Out of scope*); Cognito
  (its hosted UI is not used, so it has no callback URLs naming the retired host — checked).
- **Tests:** syntax check, the suite, the new mutation cases. No browser change: the client is untouched.

## Owner's decisions

None needed — no `needs-owner` label, no open question.
