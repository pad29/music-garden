# Cloudflare Pages build for Tune Garden (TUN-80). The Pages project `music-garden` runs it from its
# dashboard settings: build command `sh cloudflare-build.sh`, build output directory `site`. Those two
# settings live only in the dashboard; this file is the part the repository can pin.
#
# It copies the page and the folders the game loads at run time into a clean `site/`, and nothing else:
# no docs but CREDITS.md and the two licence files, and no backend/, tests/, tools/, reviews/, spike/ or
# .claude/. (CREDITS.md is published because the map footer links it: CC BY asks that a sample pack's credit
# reach its listeners. It links LICENSE and LICENSE-CC-BY-SA.md, so they are published too. TUN-89.) (vendor/ is the fonts and the sign-in
# library the page loads from this site rather than a third party, TUN-81. _headers is the security and
# caching headers, which Pages reads from site/ and does not serve, TUN-86.) If you add a folder the game loads
# at run time, add it here (and to the list in tests/cloudflare-publish.test.mjs, and a cache rule in _headers).
# tests/cloudflare-publish.test.mjs holds this file to a strict form: `set -eu`, then only
# `rm -rf site`, `mkdir site` and `cp [-r] <name> site/<name>` steps joined by `&&`, all on ONE line.
# It refuses anything else, so keep to that form. One line matters: under `set -e` a failure inside an
# `&&` list does not stop the script, so a second line would run, and the build pass, after a failed copy.
#
# A path that is not a real file: with no 404.html in site/, Pages treats the project as a single-page
# app and serves index.html in its place. So a missing js/ file is not a 404: the browser
# gets HTML where it asked for JavaScript, and the game never starts. A 404.html anywhere in site/
# would change that for its folder, and the test refuses one.
set -eu
rm -rf site && mkdir site && cp index.html site/index.html && cp _headers site/_headers && cp CREDITS.md site/CREDITS.md && cp LICENSE site/LICENSE && cp LICENSE-CC-BY-SA.md site/LICENSE-CC-BY-SA.md && cp -r js site/js && cp -r voice site/voice && cp -r samples site/samples && cp -r vendor site/vendor
