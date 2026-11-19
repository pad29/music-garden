// The checker behind tests/ci-workflow.test.mjs: reads a GitHub Actions workflow and says everything that
// would make it unsafe for a fork's pull request, or stop .github/workflows/checks.yml from checking every
// pull request (TUN-90).
//
// No YAML library — the suite has no dependencies — so it parses a small, defined subset of YAML and
// reports anything outside it, instead of guessing (GPT's PR review 1, finding 2: a regex checker passed
// quoted keys, flow mappings and `secrets['X']` it could not read). The subset: block mappings with plain
// keys, block sequences, plain, single-quoted or escape-free double-quoted scalars, `[a, b]` flow
// sequences of scalars, `|` / `>` block scalars, and comments (an inline one only after an unquoted
// value). Not in it, and reported: quoted or complex keys, flow mappings, anchors, aliases, merge keys,
// tags, tabs, document markers, duplicate keys, backslash escapes — and any `${{ }}` expression (or `if:`)
// that is not a plain property path such as `github.ref`.
//
// The rules then run on the parsed workflow; checks.yml's are allowlists (its top-level keys, its job's
// keys, its four steps and their inputs), so a key nobody thought of is a problem, not a pass.

/** Parse the subset into plain objects, arrays and strings; `errors` lists everything it cannot read. */
export function parseWorkflow(text) {
  const errors = [];
  const raw = text.replace(/\r\n/g, "\n").split("\n");
  // Lines as { n, indent, body }, comments removed — block scalars' lines kept raw, joined into one line.
  const lines = [];
  for (let i = 0; i < raw.length; i++) {
    const n = i + 1, line = raw[i];
    if (/^\s*$/.test(line) || /^\s*#/.test(line)) continue;
    if (/^ *\t/.test(line)) { errors.push(`line ${n}: a tab in the indentation`); continue; }
    if (/^(---|\.\.\.)(\s|$)/.test(line)) { errors.push(`line ${n}: a document marker`); continue; }
    let body = line;
    const hash = body.search(/\s#/);
    if (hash >= 0) {
      if (/["']/.test(body.slice(0, hash))) errors.push(`line ${n}: an inline comment after a quoted value`);
      body = body.slice(0, hash);
    }
    body = body.replace(/\s+$/, "");
    const indent = body.match(/^ */)[0].length;
    const blockScalar = body.match(/^(.*:)\s*[|>][-+]?$/);
    if (blockScalar) {
      // The content is what is indented past the key's own column — for `- name: |`, the column of
      // `name`, not of the dash (GPT's PR review 2, finding 1: a sibling `uses:` read as the name's text).
      const keyCol = indent + body.slice(indent).match(/^(?:-\s+)*/)[0].length;
      const content = [];
      while (i + 1 < raw.length && (/^\s*$/.test(raw[i + 1]) || raw[i + 1].match(/^ */)[0].length > keyCol)) {
        content.push(raw[++i].trim());
      }
      lines.push({ n, indent, body: blockScalar[1].slice(indent), block: content.filter(Boolean).join("\n") });
    } else lines.push({ n, indent, body: body.slice(indent) });
  }

  let pos = 0;
  const scalar = (s, n) => {
    // Escapes are outside the subset: `\u0063` would spell what the checker looks for (PR review 2, finding 2).
    if (/^"[^"]*"$/.test(s) && s.includes("\\")) { errors.push(`line ${n}: a backslash escape in a double-quoted value`); return s; }
    if (/^"[^"\\]*"$/.test(s)) return s.slice(1, -1);
    if (/^'(?:[^']|'')*'$/.test(s)) return s.slice(1, -1).replace(/''/g, "'");
    if (/^["']/.test(s)) { errors.push(`line ${n}: an unterminated quoted value`); return s; }
    if (/^[&*!%@`|>{?]/.test(s)) { errors.push(`line ${n}: unsupported value ${s}`); return s; }
    // `${{ … }}` expressions are the only braces a plain value may hold; `: ` would be a nested mapping.
    const bare = s.replace(/\$\{\{[^}]*\}\}/g, "");
    if (/[{}]/.test(bare)) errors.push(`line ${n}: a flow mapping or stray brace: ${s}`);
    if (/:\s/.test(bare)) errors.push(`line ${n}: a mapping inside a value: ${s}`);
    return s;
  };
  const value = (rest, n) => {
    if (rest.startsWith("[")) {
      if (!rest.endsWith("]")) { errors.push(`line ${n}: an unterminated flow sequence`); return []; }
      const inner = rest.slice(1, -1).trim();
      if (/[[\]{}]/.test(inner)) { errors.push(`line ${n}: a nested flow collection`); return []; }
      return inner === "" ? [] : inner.split(",").map((x) => scalar(x.trim(), n));
    }
    return scalar(rest, n);
  };

  // A block at `indent`: a sequence if its first line is a `- ` item, otherwise a mapping.
  function block(indent) {
    const first = lines[pos];
    return /^-( |$)/.test(first.body) ? sequence(indent) : mapping(indent);
  }
  function mapping(indent) {
    // No prototype: a job named `__proto__` must stay an own key, not vanish (PR review 2, finding 3).
    const out = Object.create(null);
    while (pos < lines.length && lines[pos].indent === indent && !/^-( |$)/.test(lines[pos].body)) {
      const { n, body, block: text } = lines[pos++];
      const m = body.match(/^([A-Za-z_][\w.-]*):(?:\s+(.*))?$|^([A-Za-z_][\w.-]*):$/);
      if (!m) { errors.push(`line ${n}: not a plain \`key: value\`: ${body}`); skipChildren(indent); continue; }
      const key = m[1] || m[3], rest = (m[2] || "").trim();
      if (Object.hasOwn(out, key)) errors.push(`line ${n}: duplicate key ${key}`);
      if (text !== undefined) out[key] = text;
      else if (rest !== "") out[key] = value(rest, n);
      else if (pos < lines.length && lines[pos].indent > indent) out[key] = block(lines[pos].indent);
      else if (pos < lines.length && lines[pos].indent === indent && /^-( |$)/.test(lines[pos].body)) {
        out[key] = sequence(indent); // a sequence may sit at its key's own indentation
      } else out[key] = null;
    }
    if (pos < lines.length && lines[pos].indent > indent) {
      errors.push(`line ${lines[pos].n}: unexpected indentation`); skipChildren(indent);
    }
    return out;
  }
  function sequence(indent) {
    const out = [];
    while (pos < lines.length && lines[pos].indent === indent && /^-( |$)/.test(lines[pos].body)) {
      const line = lines[pos];
      const rest = line.body.slice(1).trimStart();
      if (rest === "") { pos++; out.push(pos < lines.length && lines[pos].indent > indent ? block(lines[pos].indent) : null); continue; }
      if (/^[A-Za-z_][\w.-]*:(\s|$)/.test(rest) || /^["'][^"']*["']\s*:/.test(rest)) {
        // `- key: v` opens a mapping whose keys sit at the column of `key`.
        const col = indent + (line.body.length - rest.length);
        lines[pos] = { ...line, indent: col, body: rest };
        out.push(mapping(col));
      } else { pos++; out.push(value(rest, line.n)); }
    }
    return out;
  }
  function skipChildren(indent) { while (pos < lines.length && lines[pos].indent > indent) pos++; }

  let doc = Object.create(null);
  if (lines.length) {
    if (lines[0].indent !== 0) errors.push(`line ${lines[0].n}: the document does not start at column 0`);
    doc = mapping(lines[0].indent);
    if (pos < lines.length) errors.push(`line ${lines[pos].n}: unexpected content`);
  }
  return { doc, errors };
}

const isMap = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const SHA_PIN = /^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/;
// GitHub-hosted runners only: a self-hosted runner would run a fork's code on the owner's machine.
const HOSTED = /^(ubuntu|windows|macos)-[\w.]+$/;
// The only `${{ }}` expressions the checker can judge: a plain property path. A function call, an index
// or an operator could reach a secret or the token in a form it cannot see (PR review 2, finding 4:
// `SECRETS.X`, `github['token']`) — so it is reported, not guessed at.
const PLAIN_PATH = /^[A-Za-z_][\w-]*(?:\.[A-Za-z_][\w-]*)+$/;

/** Every string in the document, keys included, with its path. */
function* strings(v, path = "") {
  if (typeof v === "string") yield [path, v];
  else if (Array.isArray(v)) for (let i = 0; i < v.length; i++) yield* strings(v[i], `${path}[${i}]`);
  else if (isMap(v)) for (const [k, x] of Object.entries(v)) { yield [`${path}.${k}#key`, k]; yield* strings(x, `${path}.${k}`); }
}
const jobsOf = (doc) => (isMap(doc.jobs) ? Object.entries(doc.jobs) : []);
const stepsOf = (job) => (isMap(job) && Array.isArray(job.steps) ? job.steps : []);
const triggers = (on) => (typeof on === "string" ? [on] : Array.isArray(on) ? on : isMap(on) ? Object.keys(on) : []);

/** Problems with one `${{ }}` expression (or an `if:`, which is an expression without the braces). */
function expressionProblems(expr, where) {
  const e = expr.trim();
  if (!PLAIN_PATH.test(e)) return [`cannot read: an expression it cannot check at ${where}: ${e}`];
  const [context, prop] = e.toLowerCase().split(".");
  if (context === "secrets") return [`uses a secret at ${where}: ${e}`];
  if (context === "github" && prop === "token") return [`uses the job's token at ${where}: ${e}`];
  return [];
}

/** What makes any workflow unsafe for a fork's pull request. */
export function safetyProblems(text) {
  const { doc, errors } = parseWorkflow(text);
  const out = errors.map((e) => "cannot read: " + e);
  for (const t of triggers(doc.on)) {
    if (t === "pull_request_target" || t === "workflow_run") out.push(`trigger ${t} runs with secrets and a write token`);
  }
  for (const [path, s] of strings(doc)) {
    if (path.endsWith(".secrets#key")) out.push(`uses a secret: ${path}`);
    if (/github_token/i.test(s)) out.push(`uses the job's token: ${path}`);
    let rest = s, i;
    while ((i = rest.indexOf("${{")) >= 0) {
      const end = rest.indexOf("}}", i);
      if (end < 0) { out.push(`cannot read: an unterminated expression at ${path}`); break; }
      out.push(...expressionProblems(rest.slice(i + 3, end), path));
      rest = rest.slice(end + 2);
    }
    if (/\.if$/.test(path) && !s.includes("${{")) out.push(...expressionProblems(s, path));
  }
  // Read-only, explicitly: a workflow with no `permissions` gets the repository's default, which may
  // write (PR review 2, finding 7). So the top level restricts them, or else every job does.
  const jobs = jobsOf(doc);
  const perms = [["top level", doc.permissions], ...jobs.map(([id, j]) => [`job ${id}`, isMap(j) ? j.permissions : undefined])];
  if (doc.permissions === undefined && (jobs.length === 0 || jobs.some(([, j]) => !isMap(j) || j.permissions === undefined))) {
    out.push("permissions not restricted: no top-level permissions, and a job without its own");
  }
  for (const [where, p] of perms) {
    if (p === undefined) continue;
    if (isMap(p)) { for (const [k, v] of Object.entries(p)) if (v !== "read" && v !== "none") out.push(`asks for ${k}: ${v} at ${where}`); }
    else if (typeof p === "string") out.push(`blanket permissions at ${where}: ${p}`);
    else out.push(`permissions at ${where} it cannot read`);
  }
  for (const [id, job] of jobs) {
    if (!isMap(job)) { out.push(`job ${id} it cannot read`); continue; }
    if (job["runs-on"] !== undefined && !(typeof job["runs-on"] === "string" && HOSTED.test(job["runs-on"]))) {
      out.push(`job ${id} runs on ${JSON.stringify(job["runs-on"])}, not a GitHub-hosted runner`);
    }
    const steps = stepsOf(job);
    const uses = [...(job.uses !== undefined ? [["job", job.uses]] : []),
      ...steps.map((s, i) => [`step ${i}`, isMap(s) ? s.uses : null]).filter(([, u]) => u !== undefined)];
    for (const [where, u] of uses) {
      if (typeof u !== "string") out.push(`job ${id} ${where}: a step or uses it cannot read`);
      else if (!u.startsWith("./") && !SHA_PIN.test(u)) out.push(`action not pinned to a commit: ${u}`);
    }
    for (const s of steps) {
      if (isMap(s) && typeof s.uses === "string" && /^actions\/checkout@/i.test(s.uses)
        && !(isMap(s.with) && s.with["persist-credentials"] === "false")) {
        out.push(`job ${id}: a checkout keeps the token in .git/config (no persist-credentials: false)`);
      }
    }
  }
  return out;
}

// The suite's floor: `node:module`'s registerHooks (backend-presignup, game-scripts-hook-review, the
// questsetup mutation hook) arrived in Node 22.15.0 and 23.5.0 (PR review 1, finding 1); `node --test`
// with a glob, in 21. A bare major means its latest release, which setup-node installs.
export function nodeMeetsFloor(v) {
  const m = String(v).match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?$/);
  if (!m) return false;
  const maj = Number(m[1]);
  const min = m[2] === undefined ? Infinity : Number(m[2]);
  const patch = m[3] === undefined ? Infinity : Number(m[3]);
  const atLeast = (b, c) => min > b || (min === b && patch >= c);
  if (maj >= 24) return true;
  if (maj === 23) return atLeast(5, 0);
  if (maj === 22) return atLeast(15, 0);
  return false;
}

export const COMMANDS = ["node tools/check-syntax.mjs", 'node --test "tests/*.test.mjs"'];
// Case-insensitive, as GitHub reads owner and repository names (PR review 3, finding 1).
const CHECKOUT = /^actions\/checkout@/i, SETUP_NODE = /^actions\/setup-node@/i;

/** Everything wrong with checks.yml: the safety rules, plus what it must run, when, and how. */
export function workflowProblems(text) {
  const out = safetyProblems(text);
  const { doc } = parseWorkflow(text);
  // Allowlists, so a key nobody thought of — `env` setting NODE_OPTIONS, `defaults` replacing the shell,
  // a job-level `concurrency` (PR review 2, finding 5) — is reported rather than passed.
  for (const k of Object.keys(doc)) {
    if (!["name", "on", "permissions", "concurrency", "jobs"].includes(k)) out.push(`the workflow sets ${k}`);
  }
  const on = doc.on;
  if (!isMap(on)) out.push("no `on:` mapping it can read");
  else {
    const keys = Object.keys(on).sort().join(",");
    if (keys !== "pull_request,push") out.push(`triggers are not exactly pull_request and push: ${keys}`);
    if (!("pull_request" in on)) out.push("not triggered by pull_request");
    else if (on.pull_request !== null) out.push("pull_request is filtered — every pull request must run");
    const push = on.push;
    if (!(isMap(push) && Object.keys(push).join() === "branches" && Array.isArray(push.branches) && push.branches.join() === "main")) {
      out.push("not triggered by every push to main, unfiltered");
    }
  }
  const p = doc.permissions;
  if (p === undefined) out.push("no top-level permissions block");
  else if (!(isMap(p) && Object.keys(p).length === 1 && p.contents === "read")) out.push("top-level permissions are not exactly contents: read");
  const group = isMap(doc.concurrency) ? doc.concurrency.group : undefined;
  if (doc.concurrency !== undefined && !(typeof group === "string" && /\$\{\{\s*github\.ref\s*\}\}/.test(group))) {
    out.push("the concurrency group is not per ref — unrelated runs would cancel each other");
  }

  const jobs = jobsOf(doc).filter(([, j]) => isMap(j));
  if (jobs.length === 0) out.push("no jobs it can read");
  const runs = [];
  const seen = { checkout: 0, node: 0 };
  let node;
  for (const [id, job] of jobs) {
    for (const k of Object.keys(job)) {
      if (!["name", "runs-on", "timeout-minutes", "steps"].includes(k)) out.push(`job ${id} sets ${k}`);
    }
    for (const s of stepsOf(job)) {
      if (!isMap(s)) { out.push(`a step in job ${id} it cannot read`); continue; }
      const use = typeof s.uses === "string" ? s.uses : "";
      const allowed = CHECKOUT.test(use) || SETUP_NODE.test(use) ? ["name", "uses", "with"] : ["name", "run"];
      for (const k of Object.keys(s)) if (!allowed.includes(k)) out.push(`a step in job ${id} sets ${k}`);
      const withKeys = isMap(s.with) ? Object.keys(s.with).join() : "";
      if (CHECKOUT.test(use)) {
        seen.checkout++;
        // The event's own revision: `ref: main` would test main and pass a failing PR (PR review 2, finding 6).
        if (withKeys !== "persist-credentials") out.push(`checkout takes inputs other than persist-credentials: ${withKeys}`);
      } else if (SETUP_NODE.test(use)) {
        seen.node++;
        node = isMap(s.with) ? s.with["node-version"] : undefined;
        if (withKeys !== "node-version") out.push(`setup-node takes inputs other than node-version: ${withKeys}`);
      } else if (s.uses !== undefined) out.push(`a step in job ${id} uses an action other than checkout and setup-node: ${use}`);
      else if (typeof s.run === "string") runs.push(s.run.trim());
    }
  }
  if (seen.checkout !== 1) out.push(`${seen.checkout} checkout steps; exactly one`);
  if (seen.node !== 1) out.push(`${seen.node} setup-node steps; exactly one`);
  for (const cmd of COMMANDS) if (!runs.includes(cmd)) out.push(`does not run: ${cmd}`);
  // Only what executes: a name like "Checks without npm" is not an install (PR review 2, finding 8).
  for (const r of runs) {
    if (/\b(npm|yarn|pnpm|npx|apt-get|apt|pip3?|brew|choco)\b/.test(r)) out.push(`installs something: ${r}`);
    else if (!COMMANDS.includes(r)) out.push(`runs something other than the two checks: ${r}`);
  }
  if (node === undefined) out.push("Node version not stated");
  else if (!nodeMeetsFloor(node)) out.push(`Node ${node} is below the suite's floor (22.15 / 23.5)`);
  return out;
}
