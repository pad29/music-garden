// Reads `_headers`, the response-header rules Cloudflare Pages and Netlify both take from site/ (TUN-86),
// and checks them. Used by tests/site-headers.test.mjs.
//
// STRICT, like the Cloudflare build checker: a line it cannot read is refused, never skipped. The form
// it accepts is the part of the format the two hosts share and this file needs:
//
//   # a comment (a line whose first non-space character is #)
//   /path/or/prefix/*            <- a rule: starts at column 0 with "/"; `*` matches the rest of a path
//     Header-Name: value         <- indented, belongs to the rule above
//
// Refused: an indented line before any rule; a rule line that is not a path (Cloudflare also accepts
// full URLs, keyed by host); a `:placeholder` in a path (the hosts spell and bound placeholders
// differently); a detach line (`! Name`, Cloudflare only); a header line with no `Name:`; a rule with
// no headers.
//
// The two hosts' matching agrees for these paths: every rule that matches a request applies, and `*`
// takes everything after it, slashes included. What they do when two matching rules set the SAME
// header is where they differ — Cloudflare joins the values with a comma, Netlify's docs do not say —
// so headersFor() reports that as a problem instead of picking a winner.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./game-scripts.mjs";

const NAME = /^[A-Za-z0-9-]+$/;

/** { rules: [{ path, line, headers: [[name, value]] }], refused: [text], lines } */
export function parseHeaders(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const rules = [], refused = [];
  let rule = null;
  lines.forEach((raw, i) => {
    const line = raw.replace(/\s+$/, ""), n = i + 1;
    if (!line.trim() || line.trim().startsWith("#")) return;
    if (!/^\s/.test(line)) {
      if (!line.startsWith("/")) refused.push(`line ${n}: not a path: ${line}`);
      else if (/\s/.test(line)) refused.push(`line ${n}: a path with a space: ${line}`);
      else if (line.includes(":")) refused.push(`line ${n}: a placeholder or URL in a path: ${line}`);
      else if (line.split("*").length > 2) refused.push(`line ${n}: more than one * in a path: ${line}`);
      rule = { path: line, line: n, headers: [] };
      rules.push(rule);
      return;
    }
    const body = line.trim();
    if (!rule) return refused.push(`line ${n}: a header before any path: ${body}`);
    if (body.startsWith("!")) return refused.push(`line ${n}: a detach line: ${body}`);
    const at = body.indexOf(":");
    const name = at > 0 ? body.slice(0, at).trim() : "";
    const value = at > 0 ? body.slice(at + 1).trim() : "";
    if (!NAME.test(name) || !value) return refused.push(`line ${n}: not a "Name: value" header: ${body}`);
    rule.headers.push([name, value]);
  });
  for (const r of rules) if (!r.headers.length) refused.push(`line ${r.line}: a rule with no headers: ${r.path}`);
  return { rules, refused, lines };
}

/** Does a rule's path match a request path? `*` matches any run of characters, `/` included. */
export function matches(pattern, path) {
  const re = new RegExp("^" + pattern.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$");
  return re.test(path);
}

/** Every header a request path gets: { headers: Map(lowercase name → value), twice: [problem] }. */
export function headersFor(rules, path) {
  const headers = new Map(), from = new Map(), twice = [];
  for (const r of rules) {
    if (!matches(r.path, path)) continue;
    for (const [name, value] of r.headers) {
      const key = name.toLowerCase();
      if (headers.has(key)) twice.push(`${path} gets ${name} from both ${from.get(key)} and ${r.path}`);
      else { headers.set(key, value); from.set(key, r.path); }
    }
  }
  return { headers, twice };
}

/** A Content-Security-Policy as Map(directive → [sources]). */
export function parseCsp(value) {
  const out = new Map();
  for (const part of value.split(";")) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name) out.set(name.toLowerCase(), sources);
  }
  return out;
}

/** AUTH's region and API origin, read from js/cloud.js — the two the policy's connect-src must allow. */
export function authEndpoints(cloudJs = readFileSync(join(ROOT, "js", "cloud.js"), "utf8")) {
  const m = cloudJs.match(/const AUTH=\{[^}]*\}/);
  if (!m) throw new Error("js/cloud.js: no `const AUTH={…}`");
  const field = (k) => {
    const f = m[0].match(new RegExp(`\\b${k}:"([^"]+)"`));
    if (!f) throw new Error(`js/cloud.js: AUTH has no ${k}`);
    return f[1];
  };
  return { api: new URL(field("apiUrl")).origin, cognito: `https://cognito-idp.${field("region")}.amazonaws.com` };
}

// What the policy may allow: the site itself, nothing at all, and — for connections only — the backend
// and Cognito. Styles alone may be inline (the page's <style> block and style= attributes; TUN-86 accepts it).
const LOCAL = ["'self'"], NONE = ["'none'"];
export const EXPECTED_CSP = ({ api, cognito }) => new Map([
  ["default-src", LOCAL], ["script-src", LOCAL], ["style-src", ["'self'", "'unsafe-inline'"]],
  ["font-src", LOCAL], ["media-src", LOCAL], ["connect-src", [api, cognito]],
  ["object-src", NONE], ["base-uri", NONE], ["form-action", NONE], ["frame-ancestors", NONE],
]);

/** Problems with one CSP value: a directive missing, extra, or allowing other sources than expected. */
export function cspProblems(value, endpoints) {
  const got = parseCsp(value), want = EXPECTED_CSP(endpoints), out = [];
  for (const [d, sources] of want) {
    const have = got.get(d);
    if (!have) out.push(`CSP has no ${d}`);
    else if ([...have].sort().join(" ") !== [...sources].sort().join(" "))
      out.push(`CSP ${d} is "${have.join(" ")}", expected "${sources.join(" ")}"`);
  }
  for (const d of got.keys()) if (!want.has(d)) out.push(`CSP has an unexpected directive: ${d}`);
  return out;
}

/** max-age in seconds, or null. */
export const maxAge = (cacheControl) => {
  const m = /(?:^|,)\s*max-age=(\d+)\s*(?:,|$)/i.exec(cacheControl || "");
  return m ? Number(m[1]) : null;
};
