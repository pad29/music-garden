// TUN-106: a failed progress load must never let this device overwrite the player's cloud copy.
// The game runs in the harness with a stub Cognito user (not the SDK) and a per-test fetch that answers
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

const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const notJson = () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("Unexpected token <"); } });
const FAILURES = {
  "429": () => reply(429, { message: "Too Many Requests" }),
  "500": () => reply(500, { error: "server error" }),
  "503": () => reply(503, { message: "Service Unavailable" }),
  "a network error": () => { throw new TypeError("Failed to fetch"); },
  "a 200 that is not JSON": notJson,
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
 * A fresh game whose player is not signed in at load (so boot's resume path stays quiet), with `local` as
 * this device's progress. `net.answer(req)` answers each request; `net.requests` records them.
 */
function cloudGame({ local = LOCAL } = {}) {
  const net = { requests: [], answer: () => { throw new Error("no answer set for this request"); } };
  const user = { signedIn: false };
  const saves = new Map(); let serial = 1e6;
  const authbox = { kids: [], set innerHTML(v) { this.kids = []; }, get innerHTML() { return ""; },
    appendChild(c) { this.kids.push(c); return c; },
    get textContent() { return this.kids.map(k => k.textContent ?? "").join(""); } };
  const g = loadGame({ fresh: true, elements: { authbox }, setup: w => {
    w.localStorage.setItem("mg_progress", JSON.stringify(local));
    const cognitoUser = { getUsername: () => "ann", signOut() { user.signedIn = false; },
      getSession(cb) { cb(null, { isValid: () => true, getIdToken: () => ({ getJwtToken: () => "test-token" }) }); } };
    w.AmazonCognitoIdentity = { CognitoUserPool: class { getCurrentUser() { return user.signedIn ? cognitoUser : null; } } };
    w.fetch = async (url, opts = {}) => {
      const req = { url: String(url), method: opts.method || "GET", body: opts.body };
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
  user.signedIn = true;   // now the player has a stored session, as on a reload or after cogSignIn
  const runSaves = async () => { const fns = [...saves.values()]; saves.clear(); for (const f of fns) await f(); };
  const panel = () => authbox.textContent;
  return { g, net, runSaves, panel, queuedSaves: () => saves.size, signOutUser: () => { user.signedIn = false; } };
}

// GET /progress answers `get`; PUT /progress answers `put` (default 200).
const answers = (get, put = () => reply(200, { ok: true })) => req =>
  /\/progress$/.test(req.url) ? (req.method === "PUT" ? put(req) : get(req)) : (() => { throw new Error("unexpected " + req.url); })();
const methods = net => net.requests.map(r => r.method);

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
    assert.match(panel(), /Signed in as ann — couldn't reach the cloud just now\. Your cloud progress is safe; reload the page later to load it\./);
    assert.doesNotMatch(panel(), /syncs across|saved to cloud/);

    g.progress.name = "Ann, offline";
    g.commitProgress();
    assert.equal(queuedSaves(), 0, "scheduleCloud queues no push");
    await runSaves();
    assert.equal(g.Store.get("progress").name, "Ann, offline", "the save still lands on this device");
    assert.equal(await g.cloudPush(), false);
    assert.deepEqual(methods(net), ["GET"], "neither a save nor a direct cloudPush sends anything");
    g.renderAuth();   // openHome re-renders the panel with no status
    assert.match(panel(), /couldn't reach the cloud just now/);
  });
}

test("a save made while the pull is still in flight sends nothing", async () => {
  const { g, net, runSaves, panel } = cloudGame();
  let finish; const pending = new Promise(r => { finish = r; });
  net.answer = answers(() => pending, () => assert.fail("a PUT before the pull came back"));
  const signingIn = g.onSignedIn(false);
  await new Promise(r => setImmediate(r));
  assert.equal(g.cloudSync, "loading");
  assert.match(panel(), /Signed in as ann — loading your progress…/);
  g.commitProgress(); await runSaves();
  assert.deepEqual(methods(net), ["GET"]);
  finish(reply(429, {}));
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
  const { g, net, runSaves, signOutUser } = cloudGame();
  net.answer = answers(() => reply(200, clone(CLOUD)));
  await g.onSignedIn(false);
  const before = net.requests.length;
  g.commitProgress();   // queued, not yet sent
  g.doSignOut(); signOutUser();
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
