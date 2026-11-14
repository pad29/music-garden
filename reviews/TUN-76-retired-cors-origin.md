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

## PR review

### Round 1 (Astra via `ask.sh`, on bb6e069) — changes requested

<details><summary>GPT's review, verbatim</summary>

**Changes requested on `bb6e069`.**

1. **Medium — [tests/backend-template.test.mjs:153](C:/Users/pavel/.ao/data/worktrees/music-garden/music-garden-28/tests/backend-template.test.mjs:153): the CORS comparison accepts an incorrect list.** Replacing both production entries with this single entry makes `templateProblems()` return `[]`:

   ```yaml
   AllowOrigins:
     - https://tunegarden.game,https://www.tunegarden.game
   ```

   Both arrays produce the same `.join()` result, although one contains a single string and the other contains two origins. The guard therefore cannot guarantee that the production origins remain allowed. Compare array lengths and individual values after sorting.

**Missing test:** add that single-entry mutation and require the CORS diagnostic. Keep the existing reversed-order/quoted-origin passing case.

Other checks:

- The only effective template change is removing the retired origin. No resource replacement is implied; AWS documents API definition/CORS updates as requiring [no interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-apigatewayv2-api.html). The actual change set remains an owner check.
- No additional required documentation changes found.
- Focused tests: **4/4 passed**. Syntax: **29 scripts passed**. SAM lint reports a valid template, with sandbox errors accessing SAM metadata.
- Full suite: **654 passed, 72 failed**, all failures from denied temporary-directory creation.

**Review limitation:** I could not retrieve the PR body through CLI, web, or browser, so its checklist remains unverified. Against the source, “Save melody” is local-only, short shares use `#s=`, and successful sign-in alone does not prove progress sync. The owner’s deploy and live checks remain pending.

No files changed.

</details>

My answers:

1. **Medium — `.join()` lets one entry "a,b" pass as two origins.** Agreed. The check now compares the
   sorted lists element by element (`JSON.stringify`); a non-string entry is stringified, so it fails too.
   **Missing test added:** "both origins in one entry" must draw the CORS diagnostic. Audit: with the old
   `.join()` comparison put back, that case fails. Reordered/quoted variant kept.
- *Note (no severity): sign-in alone does not prove progress sync.* Agreed — progress is also kept
  locally, so a reload proves nothing. The checklist now loads progress in a fresh private window (no
  local copy) instead. *"Save melody" is local-only, short shares use `#s=`*: the checklist claims
  neither; its cloud-song item uses the Jukebox's ☁️ In the cloud list and `#song=` links.
- GPT's 72 suite failures are its sandbox refusing temp directories; here the suite is 726/726.

### Round 2 (Astra via `ask.sh`, on 4301d18) — changes requested (checklist only)

<details><summary>GPT's review, verbatim</summary>

**Changes requested on `4301d18` — checklist only. Round 1’s code finding is resolved.** The comparison preserves array boundaries, the regression case is present, and restoring `.join()` in memory makes that case fail.

1. **Medium — checklist items 1–2: replay cannot prove a new save.** An already-completed level remains completed in the old cloud record even if every new write fails. Completion only advances `done` when necessary (`js/level-engine.js:152–154`). Require completing a **previously unfinished level**, allow the 900 ms save debounce and request to finish, then verify that new completion in the fresh private session.

2. **Medium — checklist item 3: the empty-list expectation can pass during a cloud failure.** `cloudSongList()` returns `[]` for failed requests (`js/cloud.js:29–30`), which displays “Nothing here yet.” This path never displays “Couldn't reach the cloud”; that warning belongs to song creation. Require a known existing cloud song to appear, or verify a successful `GET /songs` response when testing an empty account.

3. **Low — checklist item 3: “▶ Load … should play it” contradicts the UI.** The cloud button calls `loadSong()`, which loads into Studio and instructs the player to press Play (`js/save-share.js:181–182,239–240`). Change the instruction to **Load, then press ▶ Play**.

**Missing tests:** No additional automated regression cases required for this delta. The manual checklist needs the concrete new-completion save/load case and successful cloud-list case described above.

The deployment instructions match the documented procedure; stopping on any replacement is stricter than the documentation.

Verified: focused tests **4/4**, syntax **29 scripts**, and the in-memory mutation audit. I did not rerun the full suite or perform deployment/live playtesting. No files changed.

</details>

My answers (each claim checked in the source first):

1. **Medium — a replay cannot prove a new save.** Agreed: `markPackageLevelDone` (`js/level-engine.js:152`)
   only advances `done` past the old value. Checklist item 1 now asks for a level not finished before,
   and a few seconds' wait for the 900 ms save debounce (`js/cloud.js:21`).
2. **Medium — "Nothing here yet" can hide a cloud failure.** Agreed: `cloudSongList` returns `[]` on any
   failure (`js/cloud.js:29–30`), and "Couldn't reach the cloud" is song creation's warning, not the
   list's. Item 3 now wants a known cloud song listed, or else the `songs` request's status 200 in the
   browser's Network tab.
3. **Low — Load does not play.** Agreed: `loadSong` opens the Studio and says to press ▶ Play
   (`js/save-share.js:181–182`). Item 3 now says Load, then ▶ Play.

No missing automated tests listed. The checklist lives in the PR body (edited, not a commit); this
commit records the round.
