# Security

Thank you for looking. If you have found a security problem in Tune Garden, please tell the owner
privately, and never in a public issue, pull request or discussion: a public report shows the problem
to everyone before it is fixed.

## How to report

1. **Use GitHub's private reporting.** Open
   [Report a vulnerability](https://github.com/pad29/music-garden/security/advisories/new) (or the
   repository's **Security** tab → **Report a vulnerability**). Only the owner sees what you write.
2. **If that button is unavailable**, email **conduct@tunegarden.game**, with "Security" in the subject.

Please include what you found, where (a URL, a file, an API call), how to reproduce it, and what an
attacker could do with it. A short report is fine; you do not need a fix.

## What is in scope

- The game at https://tunegarden.game, and what this repository publishes there.
- The backend this repository deploys: the progress and songs API, and account sign-in (`backend/`).
- Shared-song links (`#s=` and `#song=`), which anyone can send to a stranger.
- This repository's GitHub Actions workflow (`.github/workflows/checks.yml`).

Only the live site and the `main` branch are supported: there are no older releases to patch.

Please do not test against other people's accounts or data, run load or denial-of-service tests, or
send social-engineering attempts. The hosts themselves (GitHub, Cloudflare, Amazon Web Services) have
their own reporting programmes.

## What happens next

Tune Garden is a small project with one owner, so replies are on a best-effort basis. You will get an
answer as soon as the owner can read the report; a fix ships when it is ready, and the advisory is
published after that. Say in your report if you would like to be credited.

This file covers security problems only. For behaviour in the community, see
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md); for everything else, [CONTRIBUTING.md](CONTRIBUTING.md).
