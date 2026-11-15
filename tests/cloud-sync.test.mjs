// TUN-106: a failed progress load must never let this device overwrite the player's cloud copy.
// The game runs in the harness with stub Cognito users (not the SDK) and a per-test fetch that answers
// GET/PUT /progress as each test says. The save timer (scheduleCloud's 900 ms debounce) is caught, not
// waited on, and run by runSaves().
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame } from "./harness.mjs";

const clone = x => JSON.parse(JSON.stringify(x));
const LOCAL = { v: 1, name: "Ann", current: "intro", updatedAt: 1,
  packages: { intro: { level: 1, maxLevel: 1, completed: false } }, settings: {} };
const CLOUD = { v: 1, name: "Cloud Ann", current: "intro", updatedAt: 2,
  packages: { intro: { level: 3, maxLevel: 3, completed: false } }, settings: {} };
const UNREACHABLE = /couldn't reach the cloud just now\. Your cloud progress is safe, but what you play now stays on this device: reloading later loads your cloud progress in its place\./;

const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const notJson = () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("Unexpected token <"); } });
// Every answer to GET /progress that is not a load: it must leave the cloud copy alone.
const FAILURES = {
  "429": () => reply(429, { message: "Too Many Requests" }),
  "500": () => reply(500, { error: "server error" }),
  "503": () => reply(503, { message: "Service Unavailable" }),
  "a network error": () => { throw new TypeError("Failed to fetch"); },
  "a 200 that is not JSON": notJson,
  "a 200 of {}": () => reply(200, {}),
  "a 200 of an array": () => reply(200, [clone(CLOUD)]),
  "a 200 of a number": () => reply(200, 5),
  "a 200 whose packages is a string": () => reply(200, { ...clone(CLOUD), packages: "intro" }),
  "a 200 whose packages is an array": () => reply(200, { ...clone(CLOUD), packages: [] }),
};

// An element that keeps its children and text, and is the harness's stub for everything else.
function recording(stub) {
  const kids = []; let text = "";
  return new Proxy(stub, {
    get(t, p) {
      if (p === "appendChild") return c => (kids.push(c), c);
      if (p === "append") return (...c) => { kids.push(...c); };
      if (p === "textContent") return text + kids.map(k => k.textContent ?? "").join("");
      return Reflect.get(t, p);
    },
    set(t, p, v) {
      if (p === "textContent") { text = String(v); kids.length = 0; }
      if (p === "innerHTML") { text = ""; kids.length = 0; }
      return true;
    },
  });
}

/**
 * A fresh game nobody is signed in to at load (so boot's resume path stays quiet), with `local` as this
 * device's progress; then `ann` signs in. `net.answer(req)` answers each request; `net.requests` records
 * them, with the token each was sent with. `signIn(name)` switches the stored user; `holdTokens(name)` makes
 * that user's sessions asked for from then on wait until the function it returns is called.
 */
function cloudGame({ local = LOCAL } = {}) {
  const net = { requests: [], answer: () => { throw new Error("no answer set for this request"); } };
  let current = null; const holds = new Map();
  const saves = new Map(); let serial = 1e6;
  const authbox = { kids: [], set innerHTML(v) { this.kids = []; }, get innerHTML() { return ""; },
    appendChild(c) { this.kids.push(c); return c; },
    get textContent() { return this.kids.map(k => k.textContent ?? "").join(""); } };
  const userNamed = name => ({ getUsername: () => name, signOut() { if (current === name) current = null; },
    getSession(cb) {
      const give = () => cb(null, { isValid: () => true, getIdToken: () => ({ getJwtToken: () => "token-" + name }) });
      const h = holds.get(name); if (h) h.then(give); else give();
    } });
  const g = loadGame({ fresh: true, elements: { authbox }, setup: w => {
    w.localStorage.setItem("mg_progress", JSON.stringify(local));
    w.AmazonCognitoIdentity = { CognitoUserPool: class { getCurrentUser() { return current ? userNamed(current) : null; } } };
    w.fetch = async (url, opts = {}) => {
      const req = { url: String(url), method: opts.method || "GET", body: opts.body,
        token: String(opts.headers?.Authorization || "").replace("Bearer ", "") };
      net.requests.push(req);
      return net.answer(req);
    };
    const realSet = w.setTimeout, realClear = w.clearTimeout;
    w.setTimeout = (fn, ms, ...a) => ms === 900 ? (saves.set(++serial, fn), serial) : realSet(fn, ms, ...a);
    w.clearTimeout = id => saves.has(id) ? saves.delete(id) : realClear(id);
  } });
  const doc = g.__window.document, make = doc.createElement;
  Object.defineProperty(doc, "createElement", { value: (...a) => recording(make(...a)), configurable: true });
  Object.defineProperty(doc, "createTextNode", { value: t => ({ textContent: String(t) }), configurable: true });
  current = "ann";   // now the player has a stored session, as on a reload or after cogSignIn
  const runSaves = async () => { const fns = [...saves.values()]; saves.clear(); for (const f of fns) await f(); };
  const holdTokens = name => { let release; holds.set(name, new Promise(r => { release = r; })); return () => { holds.delete(name); release(); }; };
  return { g, net, runSaves, queuedSaves: () => saves.size, panel: () => authbox.textContent,
    signIn: name => { current = name; }, holdTokens };
}

// GET /progress answers `get`; PUT /progress answers `put` (default 200).
const answers = (get, put = () => reply(200, { ok: true })) => req =>
  /\/progress$/.test(req.url) ? (req.method === "PUT" ? put(req) : get(req)) : (() => { throw new Error("unexpected " + req.url); })();
const methods = net => net.requests.map(r => r.method);
const puts = net => net.requests.filter(r => r.method === "PUT");
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const tick = () => new Promise(r => setImmediate(r));

test("a pull that returns progress loads it, says so, and later saves push the loaded progress", async () => {
  const { g, net, runSaves, panel } = cloudGame();
  net.answer = answers(() => reply(200, clone(CLOUD)));
  await g.onSignedIn(false);
  assert.deepEqual(methods(net), ["GET"], "the sign-in itself only reads");
  assert.equal(g.progress.name, "Cloud Ann");
  assert.equal(g.cloudSync, "ready");
  assert.match(panel(), /Signed in as ann — progress syncs across your devices\. — loaded from cloud/);
  g.progress.name = "Cloud Ann, later";
  g.commitProgress(); await runSaves();
  const put = net.requests.at(-1);
  assert.equal(put.method, "PUT");
  assert.deepEqual(JSON.parse(put.body), clone(g.progress), "the save sends the whole progress");
});

test("a pull that returns 200 null (nothing saved yet) pushes this device's progress", async () => {
  const { g, net, panel } = cloudGame();
  net.answer = answers(() => reply(200, null));
  await g.onSignedIn(false);
  assert.deepEqual(methods(net), ["GET", "PUT"]);
  assert.equal(JSON.parse(net.requests[1].body).name, "Ann");
  assert.equal(g.cloudSync, "ready");
  assert.match(panel(), /progress syncs across your devices\. — saved to cloud/);
});

for (const [name, fail] of Object.entries(FAILURES)) {
  test(`a pull that fails with ${name} pushes nothing, now or on a later save, and says the cloud is unreachable`, async () => {
    const { g, net, runSaves, panel, queuedSaves } = cloudGame();
    net.answer = answers(fail, () => assert.fail("a PUT after a failed pull"));
    await g.onSignedIn(false);
    assert.deepEqual(methods(net), ["GET"], "no PUT after the failed pull");
    assert.equal(g.progress.name, "Ann", "the player keeps this device's progress");
    assert.equal(g.cloudSync, "unreachable");
    assert.match(panel(), /Signed in as ann — /);
    assert.match(panel(), UNREACHABLE);
    assert.doesNotMatch(panel(), /syncs across|saved to cloud/);

    g.progress.name = "Ann, offline";
    g.commitProgress();
    assert.equal(queuedSaves(), 0, "scheduleCloud queues no push");
    await runSaves();
    assert.equal(g.Store.get("progress").name, "Ann, offline", "the save still lands on this device");
    assert.equal(await g.cloudPush(), false);
    assert.deepEqual(methods(net), ["GET"], "neither a save nor a direct cloudPush sends anything");
    g.renderAuth();   // openHome re-renders the panel with no status
    assert.match(panel(), UNREACHABLE);
  });
}

test("a save made while the pull is still in flight sends nothing", async () => {
  const { g, net, runSaves, panel } = cloudGame();
  const get = deferred();
  net.answer = answers(() => get.promise, () => assert.fail("a PUT before the pull came back"));
  const signingIn = g.onSignedIn(false);
  await tick();
  assert.equal(g.cloudSync, "loading");
  assert.match(panel(), /Signed in as ann — loading your progress…/);
  g.commitProgress(); await runSaves();
  assert.deepEqual(methods(net), ["GET"]);
  get.resolve(reply(429, {}));
  await signingIn;
  assert.deepEqual(methods(net), ["GET"]);
});

test("signing up pushes the guest's progress without reading the cloud first", async () => {
  const { g, net, panel } = cloudGame();
  net.answer = answers(() => assert.fail("sign-up must not pull"));
  await g.onSignedIn(true);
  assert.deepEqual(methods(net), ["PUT"]);
  assert.equal(JSON.parse(net.requests[0].body).name, "Ann");
  assert.equal(g.cloudSync, "ready");
  assert.match(panel(), /progress syncs across your devices\. — saved to cloud/);
});

test("the next sign-in after a failed pull tries again, and a success turns saving back on", async () => {
  const { g, net, runSaves, panel } = cloudGame();
  net.answer = answers(FAILURES["429"]);
  await g.onSignedIn(false);
  assert.equal(g.cloudSync, "unreachable");
  net.answer = answers(() => reply(200, clone(CLOUD)));
  await g.onSignedIn(false);   // what the next page load (boot's resume path) or sign-in does
  assert.deepEqual(methods(net), ["GET", "GET"]);
  assert.equal(g.progress.name, "Cloud Ann");
  assert.match(panel(), /progress syncs across your devices/);
  g.commitProgress(); await runSaves();
  assert.equal(net.requests.at(-1).method, "PUT");
});

test("signing out stops saves reaching the cloud, and drops a save already queued", async () => {
  const { g, net, runSaves } = cloudGame();
  net.answer = answers(() => reply(200, clone(CLOUD)));
  await g.onSignedIn(false);
  const before = net.requests.length;
  g.commitProgress();   // queued, not yet sent
  g.doSignOut();
  assert.equal(g.cloudSync, "off");
  await runSaves();
  g.commitProgress(); await runSaves();
  assert.equal(net.requests.length, before, "nothing sent after signing out");
});

test("a save answered 429 is not retried, and the next save sends the whole progress again", async () => {
  const { g, net, runSaves } = cloudGame();
  let putStatus = 200;
  net.answer = answers(() => reply(200, clone(CLOUD)), () => reply(putStatus, {}));
  await g.onSignedIn(false);
  await runSaves();   // anything the load itself queued
  const before = net.requests.length;

  putStatus = 429;
  g.progress.name = "Bea";
  g.commitProgress(); await runSaves();
  assert.deepEqual(methods(net).slice(before), ["PUT"], "one PUT, answered 429");
  await runSaves();
  assert.equal(net.requests.length, before + 1, "and no retry");

  putStatus = 200;
  g.progress.packages.intro.level = 4;
  g.commitProgress(); await runSaves();
  const put = net.requests.at(-1);
  assert.equal(net.requests.length, before + 2);
  assert.deepEqual(JSON.parse(put.body), clone(g.progress), "the whole progress, the 429'd change included");
  assert.equal(JSON.parse(put.body).name, "Bea");
});

// ---- Runs: a load or push begun for one sign-in must not act after sign-out or another sign-in (GPT, PR review) ----

for (const late of ["null", "progress"]) {
  test(`ann's load answering ${late} after she signed out and bea's load failed changes nothing`, async () => {
    const { g, net, runSaves, signIn, panel } = cloudGame();
    const annGet = deferred();
    net.answer = answers(req => req.token === "token-ann" ? annGet.promise : reply(429, {}),
      () => assert.fail("no PUT may be sent"));
    const annSignIn = g.onSignedIn(false);
    await tick();
    g.doSignOut(); signIn("bea");
    await g.onSignedIn(false);
    assert.equal(g.cloudSync, "unreachable");

    annGet.resolve(reply(200, late === "null" ? null : clone(CLOUD)));
    await annSignIn;
    assert.equal(g.progress.name, "Ann", "ann's cloud progress is not applied to bea's visit");
    assert.equal(g.cloudSync, "unreachable", "bea stays blocked");
    assert.match(panel(), /Signed in as bea — /);
    assert.match(panel(), UNREACHABLE);
    g.commitProgress(); await runSaves();
    assert.deepEqual(puts(net), []);
  });
}

test("a load that comes back after the player signed out applies nothing", async () => {
  const { g, net, runSaves } = cloudGame();
  const get = deferred();
  net.answer = answers(() => get.promise, () => assert.fail("no PUT may be sent"));
  const signingIn = g.onSignedIn(false);
  await tick();
  g.doSignOut();
  get.resolve(reply(200, clone(CLOUD)));
  await signingIn;
  assert.equal(g.progress.name, "Ann", "the signed-out visit keeps this device's progress");
  assert.equal(g.cloudSync, "off");
  g.commitProgress(); await runSaves();
  assert.deepEqual(puts(net), []);
});

test("an older load failing after a newer one succeeded leaves saving on", async () => {
  const { g, net, runSaves } = cloudGame();
  const first = deferred(); let n = 0;
  net.answer = answers(() => ++n === 1 ? first.promise : reply(200, clone(CLOUD)));
  const older = g.onSignedIn(false);
  await tick();
  await g.onSignedIn(false);   // e.g. the landing's sign-in while boot's resume load is still out
  assert.equal(g.cloudSync, "ready");
  first.resolve(reply(429, {}));
  await older;
  assert.equal(g.cloudSync, "ready");
  g.commitProgress(); await runSaves();
  assert.equal(net.requests.at(-1).method, "PUT");
});

test("a save waiting for its token when the player signs out sends nothing", async () => {
  const { g, net, runSaves, holdTokens } = cloudGame();
  net.answer = answers(() => reply(200, clone(CLOUD)));
  await g.onSignedIn(false); await runSaves();
  const before = net.requests.length;
  g.commitProgress();
  const release = holdTokens("ann");
  const saving = runSaves();   // the push has asked for ann's token
  g.doSignOut();
  release(); await saving;
  assert.equal(net.requests.length, before, "no PUT");
});

test("a save waiting for ann's token sends nothing once bea has signed in and loaded", async () => {
  const { g, net, runSaves, holdTokens, signIn } = cloudGame();
  net.answer = answers(req => reply(200, { ...clone(CLOUD), name: req.token === "token-bea" ? "Cloud Bea" : "Cloud Ann" }));
  await g.onSignedIn(false); await runSaves();
  const before = net.requests.length;
  g.commitProgress();
  const release = holdTokens("ann");
  const saving = runSaves();   // the push has asked for ann's token
  g.doSignOut(); signIn("bea");
  await g.onSignedIn(false);   // bea is signed in, loaded and "ready" before ann's token comes back
  assert.equal(g.progress.name, "Cloud Bea");
  assert.equal(g.cloudSync, "ready");
  release(); await saving;
  const sent = net.requests.slice(before);
  assert.deepEqual(sent.map(r => [r.method, r.token]), [["GET", "token-bea"]],
    "only bea's load — no PUT with ann's token, and none of bea's progress into ann's account");
});
