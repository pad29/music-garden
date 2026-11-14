// vendor/ (TUN-81): the third-party files the site serves itself — the Cognito sign-in library and the
// Fredoka/Nunito fonts — and the static half of "the page makes no third-party requests".
//
// vendor/SHA256SUMS is the list of what vendor/ holds, in `sha256sum -c` format: every file but itself and
// vendor/README.md. The tests read it for three jobs: the files are the released bytes (vendor.test.mjs),
// and both build configs publish every one of them (netlify-publish / cloudflare-publish).
//
// Zero dependencies, and no fetch: files are read from disk.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { ROOT } from "./game-scripts.mjs";

const SUMS_LINE = /^([0-9a-f]{64}) [ *]([^\s\\][^\\]*)$/;
const UNLISTED = new Set(["SHA256SUMS", "README.md"]);

/** vendor/SHA256SUMS as a Map of path (relative to vendor/, "/"-separated) → hash. Throws on a line it can't read. */
export function vendorSums(root = ROOT) {
  const sums = new Map();
  const text = readFileSync(join(root, "vendor", "SHA256SUMS"), "utf8");
  text.split("\n").forEach((line, i) => {
    if (line === "" && i === text.split("\n").length - 1) return; // the final newline
    const m = SUMS_LINE.exec(line);
    if (!m) throw new Error(`vendor/SHA256SUMS line ${i + 1}: can't read "${line}"`);
    if (m[2].split("/").some((p) => p === "" || p === "." || p === "..")) throw new Error(`vendor/SHA256SUMS line ${i + 1}: not a plain path "${m[2]}"`);
    if (sums.has(m[2])) throw new Error(`vendor/SHA256SUMS line ${i + 1}: "${m[2]}" listed twice`);
    sums.set(m[2], m[1]);
  });
  return sums;
}

/** Every listed vendored file as the publish checkers take a script: `{ name: "vendor/…", inline: false }`. */
export const vendorFiles = (root = ROOT) => [...vendorSums(root).keys()].map((p) => ({ name: "vendor/" + p, inline: false }));

function filesUnder(dir, prefix = "") {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name), rel = prefix ? `${prefix}/${name}` : name;
    if (statSync(full).isDirectory()) out.push(...filesUnder(full, rel)); else out.push(rel);
  }
  return out;
}

/** What is wrong with vendor/ against its SHA256SUMS: changed bytes, a listed file missing, a file not listed. */
export function vendorProblems(root = ROOT) {
  const sums = vendorSums(root), dir = join(root, "vendor"), problems = [];
  for (const [path, want] of sums) {
    const file = join(dir, path);
    if (!existsSync(file)) { problems.push(`vendor/${path} is listed but missing`); continue; }
    const got = createHash("sha256").update(readFileSync(file)).digest("hex");
    if (got !== want) problems.push(`vendor/${path} has SHA-256 ${got}, SHA256SUMS says ${want}`);
  }
  for (const path of filesUnder(dir).sort())
    if (!sums.has(path) && !UNLISTED.has(path)) problems.push(`vendor/${path} is not listed in SHA256SUMS`);
  return problems;
}

// ---- The static guard: nothing in the page's own markup or CSS names another host. ----
// It reads the places a page or a stylesheet names something the browser fetches by itself: a src, srcset,
// href (on anything but <a>/<area>, which fetch nothing until clicked), poster, data, action or formaction
// attribute, a CSS url() and an @import. HTML comments are read too, on purpose: a commented-out third-party
// tag is one edit from live. It is a markup/CSS guard, not a network trace: what scripts fetch at run time is
// the browser check's job (reviews/TUN-81-self-hosted-fonts-and-sign-in.md lists the hosts seen).

const FETCHING_ATTRS = "src|srcset|href|poster|data|action|formaction";
const TAG = /<([a-z][a-z0-9-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
const ATTR = new RegExp(`(?:^|\\s)(?:xlink:)?(${FETCHING_ATTRS})\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "gi");
const CSS_URL = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)"'\s]*))\s*\)/gi;
const CSS_IMPORT = /@import\s+(?:"([^"]*)"|'([^']*)')/gi;

/**
 * True for a reference that leaves the page's own origin: any scheme but data:/blob:, or a protocol-relative
 * "//…". Read as a browser's URL parser reads it: tabs and newlines anywhere are dropped, leading and trailing
 * spaces and control characters trimmed, and "\" counts as "/" (so "\\host/x" is "//host/x").
 */
export const leavesOrigin = (ref) => {
  const r = ref.replace(/[\t\n\r]/g, "").replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g, "");
  return /^[\\/]{2}/.test(r) || (/^[a-z][a-z0-9+.-]*:/i.test(r) && !/^(?:data|blob):/i.test(r));
};

// The character references this guard decodes in an attribute value: numeric ones, and the named ones a URL
// or a style is likely to be spelled with. Any other named reference — or one without its ";" — is not
// guessed at: the value is reported as unreadable, so an encoded host can never pass as local (GPT's PR review,
// finding 2). A browser decodes them all before it reads the URL or the CSS.
const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", colon: ":", sol: "/", bsol: "\\", period: ".",
  lpar: "(", rpar: ")", Tab: "\t", NewLine: "\n", nbsp: "\u00a0" };
/** An attribute value with its character references decoded, or null if it holds one this guard does not read. */
export function decodeRefs(value) {
  let unreadable = false;
  const text = value.replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[A-Za-z][A-Za-z0-9]*)(;?)/g, (m, ref, semi) => {
    if (ref[0] === "#") {
      const cp = /^#[xX]/.test(ref) ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : "\ufffd";
    }
    if (semi && Object.hasOwn(NAMED, ref)) return NAMED[ref];
    unreadable = true;
    return m;
  });
  return unreadable ? null : text;
}

/**
 * Every reference in CSS text (a stylesheet, a <style> body or a decoded style attribute) that leaves the
 * origin. A CSS escape ("\68ttps:") inside a url() or @import is refused — reported as it stands — rather
 * than decoded: the page has no reason to spell a URL that way.
 */
export function cssThirdParty(css) {
  const out = [];
  for (const re of [CSS_URL, CSS_IMPORT]) for (const m of css.matchAll(re)) {
    const ref = m[1] ?? m[2] ?? m[3] ?? "";
    if (ref.includes("\\") || leavesOrigin(ref)) out.push(ref.trim());
  }
  return out;
}

/** Every reference in HTML that makes the browser fetch from another origin, in document order. */
export function htmlThirdParty(html) {
  const out = [];
  for (const t of html.matchAll(TAG)) {
    const tag = t[1].toLowerCase();
    for (const a of t[2].matchAll(ATTR)) {
      const name = a[1].toLowerCase(), raw = a[2] ?? a[3] ?? a[4] ?? "";
      if (name === "href" && (tag === "a" || tag === "area")) continue;
      const value = decodeRefs(raw);
      if (value === null) { out.push("unreadable: " + raw.trim()); continue; }
      const refs = name === "srcset" ? value.split(",").map((c) => c.trim().split(/\s+/)[0]) : [value];
      for (const ref of refs) if (leavesOrigin(ref)) out.push(ref.trim());
    }
    const style = /(?:^|\s)style\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(t[2]);
    if (style) {
      const css = decodeRefs(style[1] ?? style[2]);
      if (css === null) out.push("unreadable: " + (style[1] ?? style[2]).trim()); else out.push(...cssThirdParty(css));
    }
  }
  for (const s of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)) out.push(...cssThirdParty(s[1]));
  return out;
}
