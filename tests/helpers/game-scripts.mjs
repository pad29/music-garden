// The game's scripts, as the page loads them: every local <script src> and every inline <script> in
// index.html, in document order. The one place that knows how to read them — the harness, the
// mutation audits, tools/gen-voice.mjs and tools/check-syntax.mjs all go through here, so the game
// can move code out of index.html into classic script files without any of them noticing.
//
// Only synchronous classic scripts are supported (the owner's decision: never ES modules, because
// index.html must keep working from file://). Anything that would run out of document order —
// type="module", async, defer, nomodule — throws instead of being quietly skipped, because a tool
// that silently drops a script tests less than it says (and gen-voice would prune its narration).
//
// Zero dependencies, and no fetch: files are read from disk.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import vm from "node:vm";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// The MIME types a browser runs as a classic script (HTML § "JavaScript MIME type"), plus no type.
const JS_TYPES = new Set(["", "text/javascript", "application/javascript", "application/ecmascript",
  "application/x-ecmascript", "application/x-javascript", "text/ecmascript", "text/javascript1.0",
  "text/javascript1.1", "text/javascript1.2", "text/javascript1.3", "text/javascript1.4",
  "text/javascript1.5", "text/jscript", "text/livescript", "text/x-ecmascript", "text/x-javascript"]);

function attrs(tag) {
  const out = {};
  for (const m of tag.matchAll(/([^\s"'=<>\/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g))
    out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  return out;
}

const lineAt = (text, index) => text.slice(0, index).split("\n").length;

// One left-to-right pass over the page, matching whichever comes first: an HTML comment, an element
// whose content is text rather than markup (so a "<script>" written inside a <style> or <textarea>
// is not a script), or a <script> element. An attribute value may contain ">", and "<script-notes>"
// is not a script.
const TAG_END = `(?=[\\s/>])((?:[^>"']|"[^"]*"|'[^']*')*)>`;
const PAGE_TOKENS = new RegExp(
  "<!--[\\s\\S]*?(?:-->|$)" +
  `|<(style|textarea|title|xmp|iframe|noembed|noframes|noscript)${TAG_END}[\\s\\S]*?(?:<\\/\\1\\s*>|$)` +
  `|<script${TAG_END}([\\s\\S]*?)<\\/script\\s*>`, "gi");

/**
 * index.html's scripts in document order: `{ html, scripts }`, each script `{ name, src, inline, line }`.
 * `line` is the 1-based line in `name` where `src` starts (pass `lineOffset: line - 1` to vm).
 * HTML comments and text-only elements (<style>, <textarea>, …) are skipped in the same left-to-right
 * pass, so a commented-out tag is not loaded and a `<!--` inside a script body is left alone. Local
 * src paths must be plain (no %-escapes or &-references). Every src is CRLF-normalised.
 */
export function gameScripts(root = ROOT, page = "index.html") {
  const html = readFileSync(join(root, page), "utf8").replace(/\r\n/g, "\n");
  const scripts = [];
  let inlineCount = 0;
  for (const m of html.matchAll(PAGE_TOKENS)) {
    if (m[0].startsWith("<!--") || m[1]) continue; // a comment, or a text-only element
    const a = attrs(m[3]);
    const body = m[4];
    const where = `${page}:${lineAt(html, m.index)}`;
    const src = a.src;
    if (src !== undefined && /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(src.trim())) continue; // CDN, not ours
    const type = (a.type ?? "").trim().toLowerCase();
    if (type === "module") throw new Error(`${where}: type="module" — the game loads classic scripts only (file:// must work)`);
    if (!JS_TYPES.has(type)) throw new Error(`${where}: unsupported script type "${a.type}"`);
    for (const flag of ["async", "defer", "nomodule"])
      if (flag in a) throw new Error(`${where}: "${flag}" runs out of document order; the tools assume synchronous scripts`);
    if (src !== undefined) {
      const rel = src.trim().replace(/[?#].*$/, "");
      if (!rel) throw new Error(`${where}: empty src`);
      // We write index.html: script paths are plain. Refuse rather than half-decode URL escapes or
      // HTML character references and read a different file than the browser would.
      if (/[%&]/.test(rel)) throw new Error(`${where}: src "${src}" is encoded — use a plain relative path`);
      const file = resolve(root, dirname(page), rel);
      let text;
      try { text = readFileSync(file, "utf8"); }
      catch (err) { throw new Error(`${where}: cannot read <script src="${src}">: ${err.message}`); }
      scripts.push({ name: rel, src: text.replace(/\r\n/g, "\n"), inline: false, line: 1 });
    } else {
      inlineCount++;
      const bodyStart = m.index + "<script".length + m[3].length + 1; // past the opening tag's ">"
      scripts.push({ name: inlineCount === 1 ? page : `${page}#${inlineCount}`, src: body, inline: true,
        line: lineAt(html, bodyStart) });
    }
  }
  if (!scripts.length) throw new Error(`No local scripts found in ${page}`);
  return { html, scripts };
}

/**
 * Apply mutation-audit patches `[[from, to], …]` in order. Each `from` must occur exactly once across
 * ALL scripts; it is replaced in the script that holds it. Returns new objects; the input is untouched.
 */
export function applyPatches(scripts, patches) {
  let out = scripts.map((s) => ({ ...s }));
  for (const [from, to] of patches) {
    const hits = out.map((s) => s.src.split(from).length - 1);
    if (hits.reduce((a, b) => a + b, 0) !== 1) throw new Error("Mutation anchor must occur once: " + from);
    const i = hits.indexOf(1);
    out[i] = { ...out[i], src: out[i].src.replace(from, () => to) };
  }
  return out;
}

/** How many times `text` occurs across all scripts (an audit's stale-anchor check wants exactly 1). */
export const countAcross = (scripts, text) =>
  scripts.reduce((n, s) => n + s.src.split(text).length - 1, 0);

/** Every script's source, in order, one after another. For slicing and searching, never for running. */
export const joinScripts = (scripts) => scripts.map((s) => s.src).join("\n");

/**
 * Compile (never run) each script as a classic script; throws naming the file and line. This checks
 * each file's own grammar, not conflicts BETWEEN files (two top-level `let x`) — only running them
 * in order in one context (the harness) catches those.
 */
export function checkSyntax(scripts) {
  for (const s of scripts) new vm.Script(s.src, { filename: s.name, lineOffset: s.line - 1 });
}
