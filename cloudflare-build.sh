# Cloudflare Pages build for Tune Garden (TUN-80). The Pages project `tunegarden` runs it from its
# dashboard settings: build command `sh cloudflare-build.sh`, build output directory `site`. Those two
# settings live only in the dashboard; this file is the part the repository can pin.
#
# It copies the page and the folders the game loads at run time into a clean `site/`, and nothing else:
# no docs, backend/, tests/, tools/, reviews/, spike/ or .claude/. If you add a folder the game loads
# at run time, add it here AND to netlify.toml's build command while both hosts exist.
# tests/cloudflare-publish.test.mjs holds this file to a strict form: `set -eu`, then only
# `rm -rf site`, `mkdir site` and `cp [-r] <name> site/<name>` steps joined by `&&`. It refuses
# anything else, so keep to that form.
#
# A path that is not a real file: with no 404.html in site/, Pages treats the project as a single-page
# app and serves index.html in its place. So a missing js/ file is not a 404 here either: the browser
# gets HTML where it asked for JavaScript, and the game never starts. A 404.html anywhere in site/
# would change that for its folder, and the test refuses one.
set -eu
rm -rf site && mkdir site && cp index.html site/index.html && cp -r js site/js && cp -r voice site/voice && cp -r samples site/samples
