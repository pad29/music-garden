// Does netlify.toml publish every script the page loads, at the path the page asks for it?
//
// The catch-all rewrite in netlify.toml serves index.html for any path that is not a real file, so a
// js/ file missing from the publish dir is not a 404: the browser gets HTML where it asked for
// JavaScript, fails to parse it, and the game never starts. Nothing local shows that — http-server and
// file:// both serve the repository itself. Used by tests/netlify-publish*.test.mjs, and by
// tests/helpers/cloudflare-publish.mjs for the check that Cloudflare's build copies the same folders.
//
// Deliberately narrow: it reads the `cp` steps of each build command, which is how this build is
// written, rather than parsing shell or TOML in general.

/**
 * Every build command netlify.toml can run, with the table it sits in: `[build]`, and each
 * `[context.*]` table, whose command REPLACES [build]'s for that deploy context — so a context command
 * that forgets js/ breaks that context however good [build]'s is.
 */
export function buildCommands(toml) {
  const out = [];
  let table = null;
  for (const line of toml.split(/\r?\n/)) {
    const header = line.match(/^\s*\[\[?\s*([^\]]+?)\s*\]\]?\s*(?:#.*)?$/);
    if (header) { table = header[1]; continue; }
    const m = line.match(/^\s*(?:command|"command"|'command')\s*=\s*(?:"([^"]*)"|'([^']*)')/);   // a real line, never a # comment
    if (m && table && (table === "build" || table.startsWith("context.")))
      out.push({ table, command: m[1] ?? m[2] });
  }
  return out;
}

/** The `cp` steps of one command, as { src, dst, recursive } (dst relative to site/). */
export function publishCopies(command) {
  // sh ignores the rest of a line from a word that starts with "#", however many && follow it.
  const live = command.replace(/(^|\s)#.*$/s, "$1");
  return live.split("&&").map((s) => s.trim())
    .map((s) => s.match(/^cp\s+(-r\s+)?(\S+)\s+site\/(\S+)$/))
    .filter(Boolean)
    .map((c) => ({ src: c[2], dst: c[3], recursive: !!c[1] }));
}

/**
 * What a publish dir would lack, per build command: every path the page needs that no `cp` step puts
 * at the SAME path under site/. A local script is covered by copying its top folder recursively
 * (js → site/js), or by copying the file itself when it sits at the root. Gaps in a context command
 * are prefixed with its table, e.g. "[context.production] js/audio.js".
 */
export function publishGaps(toml, scripts) {
  const commands = buildCommands(toml);
  if (!commands.some((c) => c.table === "build")) return ["netlify.toml has no [build] command"];
  const gaps = [];
  for (const { table, command } of commands) {
    const tag = table === "build" ? "" : `[${table}] `;
    for (const gap of copyGaps(publishCopies(command), scripts)) gaps.push(tag + gap);
  }
  return [...new Set(gaps)];
}

/**
 * What one list of copies would lack: `index.html` and every local script the page loads, each
 * needing a copy that puts it at the SAME path under site/. Shared with the Cloudflare check
 * (tests/helpers/cloudflare-publish.mjs).
 */
export function copyGaps(copies, scripts) {
  const at = (path, dir) => copies.some((c) => c.src === path && c.dst === path && c.recursive === dir);
  const gaps = [];
  if (!at("index.html", false)) gaps.push("index.html");
  for (const s of scripts.filter((s) => !s.inline)) {
    const [top, ...rest] = s.name.split("/");
    if (!(rest.length ? at(top, true) : at(top, false))) gaps.push(s.name);
  }
  return gaps;
}

/** Every `publish =` in [build] and the [context.*] tables, as { table, dir }. */
export function publishDirs(toml) {
  const out = [];
  let table = null;
  for (const line of toml.split(/\r?\n/)) {
    const header = line.match(/^\s*\[\[?\s*([^\]]+?)\s*\]\]?\s*(?:#.*)?$/);
    if (header) { table = header[1]; continue; }
    const m = line.match(/^\s*(?:publish|"publish"|'publish')\s*=\s*(?:"([^"]*)"|'([^']*)')/);
    if (m && table && (table === "build" || table.startsWith("context.")))
      out.push({ table, dir: m[1] ?? m[2] });
  }
  return out;
}
