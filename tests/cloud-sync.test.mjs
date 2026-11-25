// TUN-106: a failed progress load must never let this device overwrite the player's cloud copy.
// The game runs in the harness with stub Cognito users (not the SDK) and a per-test fetch that answers
// GET/PUT /progress as each test says. The save timer (scheduleCloud's 900 ms debounce) is caught, not
// waited on, and run by runSaves().
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame, FakeIdToken, cachedIdToken, signedInSession } from "./harness.mjs";

const clone = x => JSON.parse(JSON.stringify(x));
const LOCAL = { v: 1, name: "Ann", current: "intro", updatedAt: 1,
  packages: { intro: { level: 1, maxLevel: 1, completed: false } }, settings: {} };
const CLOUD = { v: 1, name: "Cloud Ann", current: "intro", updatedAt: 2,
  packages: { intro: { level: 3, maxLevel: 3, completed: false } }, settings: {} };
// TUN-87 reworded it in the garden's voice; the facts are TUN-106's: nothing goes up, play stays on this device, and
// a load once the cloud answers again replaces it.
// Which copy was applied is told by the intro package's level (this device's 1, the cloud's 3): not by the name,
// which since TUN-93 stays on this device whichever copy is applied.
const lvl = p => p.packages.intro.level;
const withLevel = (p, level) => ({ ...p, packages: { ...p.packages, intro: { ...p.packages.intro, level } } });
const UNREACHABLE = /the cloud is resting just now\. Your cloud garden is safe there, and what you play now is kept on this device\. When the cloud wakes, reloading brings your cloud garden back in its place\./;

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
// claimOf(name): the account a session's ID token names (TUN-93's token check); extraSetup(window): more page set-up.
// subOf(name): the account's permanent id in its tokens; setSubOf changes it mid-test (a deleted name reused).
function cloudGame({ local = LOCAL, bootUser = null, answer = null, elements = {}, claimOf = n => n, extraSetup = null,
  subOf = n => "sub-" + n } = {}) {
  let subNow = subOf;
  // bootUser: a session already stored when the page loads, so boot resumes it (answer: the network from the start).
  const net = { requests: [], answer: answer || (() => { throw new Error("no answer set for this request"); }) };
  let current = bootUser; const holds = new Map(), offline = new Set(), revoked = new Set();
  const saves = new Map(); let serial = 1e6;
  const authbox = { kids: [], set innerHTML(v) { this.kids = []; }, get innerHTML() { return ""; },
    appendChild(c) { this.kids.push(c); return c; },
    get textContent() { return this.kids.map(k => k.textContent ?? "").join(""); } };
  const userNamed = name => ({ getUsername: () => name, signOut() { if (current === name) current = null; },
    storage: cachedIdToken(() => ({ "cognito:username": claimOf(name), sub: subNow(name) })),
    getSession(cb) {
      const give = () => cb(null, { isValid: () => true, getIdToken: () => ({ payload: { "cognito:username": claimOf(name), sub: subNow(name) }, getJwtToken: () => "token-" + name + ":" + subNow(name) }) });
      // offline: can't refresh, still signed in; revoked: the service refuses the refresh, and the library clears the session
      const go = () => (offline.has(name) ? cb(new Error("Network error"))
        : revoked.has(name) ? (current === name && (current = null), cb({ code: "NotAuthorizedException" })) : give());
      const h = holds.get(name); if (h) h.then(go); else go();
    } });
  const g = loadGame({ fresh: true, elements: { authbox, ...elements }, setup: w => {
    w.localStorage.setItem("mg_progress", JSON.stringify(local));
    if (extraSetup) extraSetup(w);
    w.AmazonCognitoIdentity = { CognitoIdToken: FakeIdToken, CognitoUserPool: class { getCurrentUser() { return current ? userNamed(current) : null; } } };
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
  current = bootUser || "ann";   // now the player has a stored session, as on a reload or after cogSignIn
  const runSaves = async () => { const fns = [...saves.values()]; saves.clear(); for (const f of fns) await f(); };
  const holdTokens = name => { let release; holds.set(name, new Promise(r => { release = r; })); return () => { holds.delete(name); release(); }; };
  return { g, net, runSaves, queuedSaves: () => saves.size, panel: () => authbox.textContent, authbox,
    signIn: name => { current = name; }, holdTokens, setSubOf: f => { subNow = f; },
    offline: (name, on = true) => { if (on) offline.add(name); else offline.delete(name); },
    revoke: name => { revoked.add(name); } };
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
  assert.equal(lvl(g.progress), 3);
  assert.equal(g.cloudSync, "ready");
  assert.match(panel(), /Signed in as ann — progress syncs across your devices\. — loaded from cloud/);
  g.progress.packages.intro.level = 4;
  g.commitProgress(); await runSaves();
  const put = net.requests.at(-1);
  assert.equal(put.method, "PUT");
  assert.deepEqual(JSON.parse(put.body), clone(g.cloudCopy(g.progress)), "the save sends the whole progress but the name");
  assert.ok(!("name" in JSON.parse(put.body)), "the name stays on this device (TUN-93)");
});

test("a pull that returns 200 null (nothing saved yet) pushes this device's progress", async () => {
  const { g, net, panel } = cloudGame();
  net.answer = answers(() => reply(200, null));
  await g.onSignedIn(false);
  assert.deepEqual(methods(net), ["GET", "PUT"]);
  assert.equal(lvl(JSON.parse(net.requests[1].body)), 1);
  assert.ok(!("name" in JSON.parse(net.requests[1].body)), "the name stays on this device (TUN-93)");
  assert.equal(g.cloudSync, "ready");
  assert.match(panel(), /progress syncs across your devices\. — saved to cloud/);
});

for (const [name, fail] of Object.entries(FAILURES)) {
  test(`a pull that fails with ${name} pushes nothing, now or on a later save, and says the cloud is unreachable`, async () => {
    const { g, net, runSaves, panel, queuedSaves } = cloudGame();
    net.answer = answers(fail, () => assert.fail("a PUT after a failed pull"));
    await g.onSignedIn(false);
    assert.deepEqual(methods(net), ["GET"], "no PUT after the failed pull");
    assert.equal(lvl(g.progress), 1, "the player keeps this device's progress");
    assert.equal(g.cloudSync, "unreachable");
    assert.match(panel(), /Signed in as ann — /);
    assert.match(panel(), UNREACHABLE);
    assert.doesNotMatch(panel(), /syncs across|saved to cloud/);

    g.progress.packages.intro.level = 6;
    g.commitProgress();
    assert.equal(queuedSaves(), 0, "scheduleCloud queues no push");
    await runSaves();
    assert.equal(lvl(g.Store.get("progress")), 6, "the save still lands on this device");
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
  assert.equal(lvl(JSON.parse(net.requests[0].body)), 1);
  assert.ok(!("name" in JSON.parse(net.requests[0].body)), "the name stays on this device (TUN-93)");
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
  assert.equal(lvl(g.progress), 3);
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
  g.progress.packages.intro.maxLevel = 7;
  g.commitProgress(); await runSaves();
  assert.deepEqual(methods(net).slice(before), ["PUT"], "one PUT, answered 429");
  await runSaves();
  assert.equal(net.requests.length, before + 1, "and no retry");

  putStatus = 200;
  g.progress.packages.intro.level = 4;
  g.commitProgress(); await runSaves();
  const put = net.requests.at(-1);
  assert.equal(net.requests.length, before + 2);
  assert.deepEqual(JSON.parse(put.body), clone(g.cloudCopy(g.progress)), "the whole progress, the 429'd change included");
  assert.equal(JSON.parse(put.body).packages.intro.maxLevel, 7);
});

// ---- Runs: a load or push begun for one sign-in must not act after sign-out or another sign-in (GPT, PR review) ----

for (const late of ["null", "progress"]) {
  test(`ann's load answering ${late} after she signed out and bea's load failed changes nothing`, async () => {
    const { g, net, runSaves, signIn, panel } = cloudGame();
    const annGet = deferred();
    net.answer = answers(req => req.token === "token-ann:sub-ann" ? annGet.promise : reply(429, {}),
      () => assert.fail("no PUT may be sent"));
    const annSignIn = g.onSignedIn(false);
    await tick();
    g.doSignOut(); signIn("bea");
    await g.onSignedIn(false);
    assert.equal(g.cloudSync, "unreachable");

    annGet.resolve(reply(200, late === "null" ? null : clone(CLOUD)));
    await annSignIn;
    assert.equal(lvl(g.progress), 1, "ann's cloud progress is not applied to bea's visit");
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
  assert.equal(lvl(g.progress), 1, "the signed-out visit keeps this device's progress");
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
  net.answer = answers(req => reply(200, withLevel(clone(CLOUD), req.token === "token-bea:sub-bea" ? 5 : 3)));
  await g.onSignedIn(false); await runSaves();
  const before = net.requests.length;
  g.commitProgress();
  const release = holdTokens("ann");
  const saving = runSaves();   // the push has asked for ann's token
  g.doSignOut(); signIn("bea");
  await g.onSignedIn(false);   // bea is signed in, loaded and "ready" before ann's token comes back
  assert.equal(lvl(g.progress), 5);
  assert.equal(g.cloudSync, "ready");
  release(); await saving;
  const sent = net.requests.slice(before);
  assert.deepEqual(sent.map(r => [r.method, r.token]), [["GET", "token-bea:sub-bea"]],
    "only bea's load — no PUT with ann's token, and none of bea's progress into ann's account");
});

test("ann's sign-up whose token comes back after bea's failed load changes nothing (round 2)", async () => {
  const { g, net, runSaves, holdTokens, signIn, panel } = cloudGame();
  net.answer = answers(() => reply(429, {}), () => assert.fail("no PUT may be sent"));
  const release = holdTokens("ann");
  const annSignUp = g.onSignedIn(true);   // waiting for ann's token
  g.doSignOut(); signIn("bea");
  await g.onSignedIn(false);
  const shown = panel();
  assert.equal(g.cloudSync, "unreachable");
  release(); await annSignUp;
  assert.equal(g.cloudSync, "unreachable", "the stale sign-up does not turn saving on for bea");
  assert.equal(panel(), shown);
  assert.equal(lvl(g.progress), 1);
  g.commitProgress(); await runSaves();
  assert.deepEqual(puts(net), []);
});

test("ann's sign-up push finishing after bea's failed load leaves bea's panel alone (round 2)", async () => {
  const { g, net, runSaves, signIn, panel } = cloudGame();
  const annPut = deferred(); let putCount = 0;
  net.answer = answers(() => reply(429, {}), () => { putCount++; return annPut.promise; });
  const annSignUp = g.onSignedIn(true);
  await tick();
  assert.equal(putCount, 1, "ann's sign-up push is out");
  g.doSignOut(); signIn("bea");
  await g.onSignedIn(false);
  const shown = panel();
  annPut.resolve(reply(200, { ok: true }));
  await annSignUp;
  assert.equal(panel(), shown);
  assert.doesNotMatch(panel(), /saved to cloud/);
  assert.match(panel(), UNREACHABLE);
  assert.equal(g.cloudSync, "unreachable");
  g.commitProgress(); await runSaves();
  assert.equal(putCount, 1, "no PUT after ann's");
});

// ---------- TUN-87: while the cloud rests, the panel never claims "syncs across your devices" ----------
const SYNCS = /progress syncs across your devices\./;
const RESTING_SAVE = /the cloud is resting just now\. What you play is kept on this device, and goes up with your next save after it wakes, while this page stays open\. Opening the game again after it wakes brings your cloud garden back in its place\./;
// GET /progress answers `get`, PUT /progress `put`, anything under /songs `songs`.
const routes = ({ get = () => reply(200, clone(CLOUD)), put = () => reply(200, { ok: true }), songs = () => reply(200, { songs: [] }) } = {}) =>
  req => (/\/progress$/.test(req.url) ? (req.method === "PUT" ? put(req) : get(req)) : songs(req));

test("TUN-87: a failed save stops the panel claiming sync; the next good save brings the claim back", async () => {
  for (const fail of [() => reply(503, {}), () => reply(429, {}), () => { throw new TypeError("Failed to fetch"); }, () => reply(404, { message: "Not Found" })]) {
    const { g, net, runSaves, panel } = cloudGame();
    let put = fail;
    net.answer = routes({ put: r => put(r) });
    await g.onSignedIn(false);
    assert.match(panel(), SYNCS);
    g.commitProgress(); await runSaves();
    assert.doesNotMatch(panel(), SYNCS); assert.match(panel(), RESTING_SAVE);
    g.renderAuth();
    assert.match(panel(), RESTING_SAVE, "a plain renderAuth() keeps saying it");
    assert.equal(g.cloudSync, "ready", "saving stays allowed: the cloud copy was read");
    put = () => reply(200, { ok: true });
    g.commitProgress(); await runSaves();
    assert.match(panel(), SYNCS); assert.doesNotMatch(panel(), RESTING_SAVE);
  }
});

test("TUN-87: a sign-up whose first save fails says the cloud is resting, never 'cloud sync failed'", async () => {
  const { g, net, panel } = cloudGame();
  net.answer = routes({ put: () => reply(503, {}) });
  await g.onSignedIn(true);
  assert.match(panel(), RESTING_SAVE);
  assert.doesNotMatch(panel(), /⚠️|sync failed|syncs across/);
});

test("TUN-87: within one sign-in, the newer save's result wins whichever finishes first", async () => {
  // an older save succeeding late does not hide a newer failure…
  { const { g, net, runSaves, panel } = cloudGame();
    const slow = deferred(); let n = 0;
    net.answer = routes({ put: () => (++n === 1 ? slow.promise : reply(503, {})) });
    await g.onSignedIn(false);
    g.commitProgress(); const first = runSaves(); await tick();
    g.commitProgress(); await runSaves();
    assert.match(panel(), RESTING_SAVE);
    slow.resolve(reply(200, { ok: true })); await first;
    assert.match(panel(), RESTING_SAVE, "the old success is ignored"); }
  // …and an older failure arriving late does not hide a newer success.
  { const { g, net, runSaves, panel } = cloudGame();
    const slow = deferred(); let n = 0;
    net.answer = routes({ put: () => (++n === 1 ? slow.promise : reply(200, { ok: true })) });
    await g.onSignedIn(false);
    g.commitProgress(); const first = runSaves(); await tick();
    g.commitProgress(); await runSaves();
    assert.match(panel(), SYNCS);
    slow.resolve(reply(503, {})); await first;
    assert.match(panel(), SYNCS, "the old failure is ignored"); }
});

test("TUN-87: a save from before a sign-out cannot change what the next player's panel says", async () => {
  for (const [annSays, beaPut, expect] of [[reply(503, {}), () => reply(200, { ok: true }), SYNCS], [reply(200, { ok: true }), () => reply(503, {}), RESTING_SAVE]]) {
    const { g, net, runSaves, panel, signIn } = cloudGame();
    const annPut = deferred(); let who = "ann";
    net.answer = routes({ put: () => (who === "ann" ? annPut.promise : beaPut()) });
    await g.onSignedIn(false);
    g.commitProgress(); const annSave = runSaves(); await tick();
    g.doSignOut(); signIn("bea"); who = "bea";
    await g.onSignedIn(false);
    g.commitProgress(); await runSaves();
    assert.match(panel(), expect);
    annPut.resolve(annSays); await annSave;
    assert.match(panel(), expect, "ann's late result is not bea's");
  }
});

test("TUN-87: a save whose session can't be refreshed counts as the cloud not answering, and the next one goes", async () => {
  const { g, net, runSaves, offline, panel } = cloudGame();
  net.answer = routes();
  await g.onSignedIn(false);
  offline("ann");   // ann is still signed in; her session just can't be refreshed now
  g.commitProgress(); await runSaves();
  assert.equal(g.cloudResting, true);
  assert.equal(g.cloudSync, "ready", "not a lost account: still allowed to write");
  assert.match(panel(), /cloud is resting/);
  assert.deepEqual(puts(net), [], "and nothing is sent");
  offline("ann", false);
  g.commitProgress(); await runSaves();
  assert.equal(puts(net).length, 1, "the next save goes up");
  assert.equal(g.cloudResting, false);
});

test("TUN-128: a save that finds nobody signed in ends this tab's sync; writing again needs a fresh load", async () => {
  const { g, net, runSaves, signIn, panel } = cloudGame();
  net.answer = routes();
  await g.onSignedIn(false);
  signIn(null);   // another tab signed out
  g.commitProgress(); await runSaves();
  assert.deepEqual(puts(net), [], "nothing is sent");
  assert.equal(g.cloudSync, "off", "the run's right to write is gone");
  assert.equal(g.cloudResting, false, "nobody signed in is not the cloud resting");
  assert.doesNotMatch(panel(), /Signed in as|syncs across/);
  signIn("ann");   // ann signs back in, in the other tab
  g.commitProgress(); await runSaves(); assert.equal(await g.cloudPush(), false);
  assert.deepEqual(puts(net), [], "not without reading the cloud copy first");
  await g.onSignedIn(false);
  assert.equal(net.requests.at(-1).method, "GET", "a sign-in reads first");
  g.commitProgress(); await runSaves();
  assert.equal(puts(net).length, 1);
});

test("TUN-87: a failed song call also stops the sync claim, and a good one brings it back; the failed-load state is untouched", async () => {
  const { g, net, panel } = cloudGame();
  let songs = () => reply(503, {});
  net.answer = routes({ songs: r => songs(r) });
  await g.onSignedIn(false);
  assert.equal(await g.cloudSongList(), null);
  assert.match(panel(), RESTING_SAVE);
  songs = () => reply(200, { songs: [] });
  assert.deepEqual(await g.cloudSongList(), []);
  assert.match(panel(), SYNCS);
  // after a failed load, a song call that works must not turn saving on or change the load's message
  const f = cloudGame();
  f.net.answer = routes({ get: () => reply(503, {}) });
  await f.g.onSignedIn(false);
  assert.match(f.panel(), UNREACHABLE);
  await f.g.cloudSongList();
  assert.equal(f.g.cloudSync, "unreachable"); assert.match(f.panel(), UNREACHABLE);
  f.g.commitProgress(); await f.runSaves();
  assert.deepEqual(puts(f.net), []);
});

test("TUN-87: the song calls tell 'no such song' from 'the cloud did not answer'", async () => {
  const { g, net } = cloudGame();
  const SONG = { id: "s1", song: { v: 3, tracks: [] } };
  const cases = [
    [reply(200, SONG), SONG], [reply(404, { error: "not found" }), null],
    [reply(404, { message: "Not Found" }), false], [reply(503, {}), false], [reply(200, null), false], [reply(200, { id: "s1" }), false],
  ];
  for (const [answer, want] of cases) {
    net.answer = () => answer;
    assert.deepEqual(await g.cloudSongGet("s1"), want, JSON.stringify(answer.status) + " " + JSON.stringify(want));
  }
  net.answer = () => { throw new TypeError("Failed to fetch"); };
  assert.equal(await g.cloudSongGet("s1"), false);
  for (const [answer, want] of [[reply(204, null), true], [reply(404, { error: "not found" }), true], [reply(404, { message: "Not Found" }), false], [reply(503, {}), false]]) {
    net.answer = () => answer;
    assert.equal(await g.cloudSongDelete("s1"), want, String(answer.status));
  }
});

test("TUN-87: ann's save failing while bea's load is still out does not mark bea's cloud resting", async () => {
  const { g, net, runSaves, signIn, holdTokens } = cloudGame();
  const annPut = deferred(); let who = "ann";
  net.answer = routes({ put: () => annPut.promise });
  await g.onSignedIn(false);
  g.commitProgress(); const annSave = runSaves(); await tick();
  g.doSignOut(); signIn("bea"); who = "bea";
  const release = holdTokens("bea");
  const beaLoad = g.onSignedIn(false);   // bea's load waits for her token: the newest call, still out
  annPut.resolve(reply(503, {})); await annSave;
  assert.equal(g.cloudResting, false, "ann's failure is not bea's");
  release(); await beaLoad;
});

test("TUN-87: a share the cloud answers without an id counts as not answering", async () => {
  const { g, net } = cloudGame();
  net.answer = routes();
  await g.onSignedIn(false);
  net.answer = () => reply(200, {});
  assert.equal(await g.cloudSongCreate({ v: 3 }, "t", "unlisted"), null);
  assert.equal(g.cloudResting, true);
  net.answer = () => reply(200, { id: "s1" });
  assert.deepEqual(await g.cloudSongCreate({ v: 3 }, "t", "unlisted"), { id: "s1" });
  assert.equal(g.cloudResting, false);
});

// ---------- PR review round 1 (TUN-87) ----------
test("TUN-87: a cloud result never redraws over a sign-in form", async () => {
  const { g, net, signIn, authbox } = cloudGame();
  const list = deferred();
  net.answer = routes({ songs: () => list.promise });
  await g.onSignedIn(false);
  const pending = g.cloudSongList(); await tick();
  signIn(null);   // the stored session is gone (signed out in another tab); cloudOn is still true
  g.renderAuth(); g.showSignInForm();
  const form = authbox.kids[0], shown = authbox.textContent;
  assert.equal(authbox.kids.length, 1);
  list.resolve(reply(503, {})); await pending;
  assert.equal(g.cloudResting, true, "the result still counts");
  assert.equal(authbox.kids[0], form, "the form the player is typing into is the same element");
  assert.equal(authbox.textContent, shown);
});

test("TUN-87: a sign-up's first save succeeding after a newer save failed does not say 'saved to cloud'", async () => {
  const { g, net, runSaves, panel } = cloudGame();
  const first = deferred(); let n = 0;
  net.answer = routes({ put: () => (++n === 1 ? first.promise : reply(503, {})) });
  const signUp = g.onSignedIn(true); await tick();
  assert.equal(n, 1, "the first save is out");
  g.commitProgress(); await runSaves();
  first.resolve(reply(200, { ok: true })); await signUp;
  assert.match(panel(), RESTING_SAVE);
  assert.doesNotMatch(panel(), /saved to cloud/);
});

test("TUN-87: a stored session resumed at page load against a resting cloud keeps this device's progress and pushes nothing", async () => {
  const { g, net, runSaves, panel } = cloudGame({ bootUser: "ann", answer: routes({ get: () => reply(503, {}), put: () => assert.fail("no PUT") }) });
  await tick(); await tick();
  assert.deepEqual(methods(net), ["GET"], "boot's resume read, and nothing else");
  assert.equal(g.cloudSync, "unreachable");
  assert.equal(lvl(g.progress), 1, "this device's progress stays");
  assert.match(panel(), UNREACHABLE);
  g.commitProgress(); await runSaves();
  assert.deepEqual(puts(net), []);
});

test("TUN-87: signing in from the landing screen against a resting cloud keeps this device's progress and pushes nothing", async () => {
  const field = value => ({ value, focus() {}, addEventListener() {}, setAttribute() {} });
  const msg = { textContent: "" };
  const { g, net, runSaves, panel } = cloudGame({ elements: { landingUser: field("ann"), landingPass: field("password1"), landingMsg: msg } });
  net.answer = routes({ get: () => { throw new TypeError("Failed to fetch"); }, put: () => assert.fail("no PUT") });
  g.cogSignIn = async () => signedInSession({ "cognito:username": "ann", sub: "sub-ann" });   // ann's own session
  await g.doLandingSignIn();
  assert.deepEqual(methods(net), ["GET"]);
  assert.equal(g.cloudSync, "unreachable");
  assert.equal(lvl(g.progress), 1);
  assert.match(panel(), UNREACHABLE);
  assert.equal(msg.textContent, "", "no error on the landing screen");
  g.commitProgress(); await runSaves();
  assert.deepEqual(puts(net), []);
});

// ---------- PR review round 2 (TUN-87) ----------
test("TUN-87: a sign-up's first save never says 'saved to cloud' once a newer save began, even if the cloud answers again", async () => {
  const { g, net, runSaves, panel } = cloudGame();
  const first = deferred(); let n = 0;
  net.answer = routes({ put: () => (++n === 1 ? first.promise : reply(503, {})), songs: () => reply(200, { songs: [] }) });
  const signUp = g.onSignedIn(true); await tick();
  g.progress.packages.intro.level = 8; g.commitProgress(); await runSaves();   // B: the changed progress, refused
  assert.deepEqual(await g.cloudSongList(), []);                           // the cloud answers again
  first.resolve(reply(200, { ok: true }));
  assert.equal((await signUp).saved, false, "nor does it tell the garden card it was (TUN-93)");    // A: the old progress, stored
  assert.doesNotMatch(panel(), /saved to cloud/, "the changed progress was never saved");
  // and the plain case still says it
  const fresh = cloudGame();
  fresh.net.answer = routes();
  await fresh.g.onSignedIn(true);
  assert.match(fresh.panel(), /progress syncs across your devices\. — saved to cloud/);
});

// ---------- PR review round 3 (TUN-87) ----------
test("TUN-87: a save queued while the sign-up's first save is out stops it saying 'saved to cloud'", async () => {
  const { g, net, runSaves, panel, queuedSaves } = cloudGame();
  const first = deferred(), second = deferred(); let n = 0;
  net.answer = routes({ put: () => (++n === 1 ? first.promise : second.promise) });
  const signUp = g.onSignedIn(true); await tick();
  g.progress.packages.intro.level = 8; g.commitProgress();
  assert.equal(queuedSaves(), 1, "the changed progress waits on the debounce");
  first.resolve(reply(200, { ok: true }));
  assert.equal((await signUp).saved, false, "the garden card is told the same (TUN-93)");
  assert.doesNotMatch(panel(), /saved to cloud/, "the changed progress is not in the cloud yet");
  const queued = runSaves(); await tick();
  assert.equal(n, 2, "the queued save is out, and hangs");
  assert.doesNotMatch(panel(), /saved to cloud/);
  second.resolve(reply(200, { ok: true })); await queued;
});

// ---------- PR review round 4 (TUN-87) ----------
test("TUN-87: a 'saved to cloud' already shown goes away once newer progress is queued, and stays away while it hangs", async () => {
  for (const [what, signUp, get] of [["sign-up", true, undefined], ["sign-in to an empty account", false, () => reply(200, null)]]) {
    const { g, net, runSaves, panel } = cloudGame();
    const pending = deferred(); let n = 0;
    net.answer = routes({ get, put: () => (++n === 1 ? reply(200, { ok: true }) : pending.promise) });
    await g.onSignedIn(signUp);
    assert.match(panel(), /saved to cloud/, what);
    g.progress.packages.intro.level = 8; g.commitProgress();
    assert.doesNotMatch(panel(), /saved to cloud/, `${what}: gone before the debounce fires`);
    assert.match(panel(), SYNCS, `${what}: the sync line stays`);
    const queued = runSaves(); await tick();
    assert.equal(n, 2); assert.doesNotMatch(panel(), /saved to cloud/, `${what}: still gone while the save hangs`);
    pending.resolve(reply(200, { ok: true })); await queued;
  }
});

test("TUN-87: queuing a save never redraws over a sign-in form", async () => {
  const { g, net, signIn, authbox } = cloudGame();
  net.answer = routes({ get: () => reply(200, null) });
  await g.onSignedIn(false);
  assert.match(authbox.textContent, /saved to cloud/);
  signIn(null); g.renderAuth(); g.showSignInForm();
  const form = authbox.kids[0];
  g.commitProgress();
  assert.equal(authbox.kids[0], form, "the form is the same element");
});

// ---------- TUN-93: the player's name stays on this device ----------
test("a pull keeps this device's name, ignores a name the cloud copy still holds, and the title still reads it", async () => {
  const title = { textContent: "" };
  const { g, net } = cloudGame({ elements: { title } });
  net.answer = answers(() => reply(200, clone(CLOUD)));   // CLOUD holds "Cloud Ann", as a copy saved before TUN-93 may
  await g.onSignedIn(false);
  assert.equal(lvl(g.progress), 3, "the cloud copy was applied");
  assert.equal(g.progress.name, "Ann", "…with this device's name");
  assert.equal(g.Store.get("progress").name, "Ann", "…and so it is stored");
  assert.equal(title.textContent, "🌱 Ann's Tune Garden");
});

test("an empty name on this device stays empty after a pull; a cloud copy with no name keeps this device's", async () => {
  const { g, net } = cloudGame({ local: { ...clone(LOCAL), name: "" } });
  net.answer = answers(() => reply(200, clone(CLOUD)));
  await g.onSignedIn(false);
  assert.equal(g.progress.name, "");
  const second = cloudGame();
  const { name, ...nameless } = clone(CLOUD);
  second.net.answer = answers(() => reply(200, nameless));
  await second.g.onSignedIn(false);
  assert.equal(second.g.progress.name, "Ann");
});

test("a name typed while the pull is out is the one kept when it lands", async () => {
  const { g, net } = cloudGame();
  const get = deferred();
  net.answer = answers(() => get.promise);
  const signingIn = g.onSignedIn(false); await tick();
  g.savePlayerName("Annie");
  get.resolve(reply(200, clone(CLOUD))); await signingIn;
  assert.equal(lvl(g.progress), 3);
  assert.equal(g.progress.name, "Annie");
});

test("saving the name keeps it on this device and schedules no cloud save", async () => {
  const { g, net, queuedSaves, runSaves } = cloudGame();
  net.answer = answers(() => reply(200, clone(CLOUD)));
  await g.onSignedIn(false); await runSaves();
  const before = net.requests.length, stamp = g.progress.updatedAt;
  g.savePlayerName("Pasha");
  assert.equal(g.Store.get("progress").name, "Pasha", "saved on this device");
  assert.equal(queuedSaves(), 0, "no cloud save queued");
  await runSaves();
  assert.equal(net.requests.length, before, "nothing sent");
  assert.equal(g.progress.updatedAt, stamp, "the progress is not marked newer");
  g.commitProgress(); await runSaves();   // the next real save goes up without it
  assert.ok(!("name" in JSON.parse(net.requests.at(-1).body)));
});

test("signing out, and another account signing in, keep this device's name", async () => {
  const { g, net, signIn } = cloudGame();
  net.answer = answers(req => reply(200, withLevel(clone(CLOUD), req.token === "token-bea:sub-bea" ? 5 : 3)));
  await g.onSignedIn(false);
  g.doSignOut();
  assert.equal(g.progress.name, "Ann");
  signIn("bea"); await g.onSignedIn(false);
  assert.equal(lvl(g.progress), 5);
  assert.equal(g.progress.name, "Ann");
});

test("a sign-up uploads this device's garden without its name, and says whether it went up", async () => {
  const { g, net } = cloudGame();
  net.answer = answers(() => assert.fail("no pull"), () => reply(200, { ok: true }));
  assert.deepEqual({ ...await g.onSignedIn(true) }, { signedIn: true, saved: true });
  assert.ok(!("name" in JSON.parse(puts(net)[0].body)));
  const failed = cloudGame();
  failed.net.answer = answers(() => assert.fail("no pull"), () => reply(503, {}));
  assert.deepEqual({ ...await failed.g.onSignedIn(true) }, { signedIn: true, saved: false }, "a failed upload is reported, for the garden card — and is still a sign-in");
});

test("the garden card's upload (onlyFor) never reaches another account: not after another sign-in, not over its failed load", async () => {
  // ann's card: her first upload fails.
  const { g, net, signIn, holdTokens } = cloudGame();
  let putOk = false;
  net.answer = answers(() => reply(503, {}), () => reply(putOk ? 200 : 503, {}));
  assert.deepEqual({ ...await g.onSignedIn(true, "ann") }, { signedIn: true, saved: false });
  // Another tab signs bea in; bea's load fails, so bea's cloud copy must not be written.
  g.doSignOut(); signIn("bea"); await g.onSignedIn(false);
  assert.equal(g.cloudSync, "unreachable");
  const before = net.requests.length;
  putOk = true;
  assert.equal((await g.onSignedIn(true, "ann")).signedIn, false, "ann's card's Try again does nothing while bea is signed in");
  assert.equal(net.requests.length, before, "no request at all, with anyone's token");
  assert.notEqual(g.cloudSync, "ready", "bea stays blocked (TUN-128: the card's attempt ended bea's run before it found bea)");
  // Signed in as ann again (the card signs in with its words), the retry uploads with ann's token only.
  g.doSignOut(); signIn("ann");
  assert.deepEqual({ ...await g.onSignedIn(true, "ann") }, { signedIn: true, saved: true });
  assert.deepEqual(puts(net).slice(-1).map(r => r.token), ["token-ann:sub-ann"]);
  // A switch while ann's token is being fetched: the push asks for ann's token and gets none once bea is in.
  const h = cloudGame();
  h.net.answer = answers(() => reply(200, null), () => reply(200, { ok: true }));
  const release = h.holdTokens("ann");
  const pending = h.g.onSignedIn(true, "ann"); await tick();
  h.g.doSignOut(); h.signIn("bea"); release();
  assert.equal((await pending).signedIn, false);
  assert.deepEqual(puts(h.net), [], "nothing pushed with anyone's token");
});

test("the name through Home's box, a reload and a nameless pull: the box, the title and the stored name agree", async () => {
  const title = { textContent: "" }, pname = { value: "", focus() {}, addEventListener() {} };
  const first = cloudGame({ elements: { title, pname } });
  pname.value = " Pasha "; pname.oninput();   // home.js wired Home's box at load
  assert.equal(first.g.Store.get("progress").name, "Pasha");
  assert.equal(title.textContent, "🌱 Pasha's Tune Garden");
  // A reload: the same storage, then the cloud answers a copy with no name (since TUN-93, every copy).
  const stored = first.g.Store.get("progress");
  const title2 = { textContent: "" }, pname2 = { value: "", focus() {}, addEventListener() {} };
  const second = cloudGame({ local: stored, elements: { title: title2, pname: pname2 } });
  const { name, ...nameless } = clone(CLOUD);
  second.net.answer = answers(() => reply(200, nameless));
  await second.g.onSignedIn(false);
  second.g.openHome();
  assert.deepEqual([pname2.value, title2.textContent, second.g.Store.get("progress").name, lvl(second.g.progress)],
    ["Pasha", "🌱 Pasha's Tune Garden", "Pasha", 3]);
});

test("another tab signing someone else in leaves this tab's saves unsent, the debounced ones included, until it signs in and loads", async () => {
  const { g, net, runSaves, signIn, panel } = cloudGame();
  net.answer = answers(() => reply(200, clone(CLOUD)), () => reply(200, { ok: true }));
  await g.onSignedIn(false); await runSaves();
  const before = net.requests.length;
  signIn("bea");   // only the storage every tab shares changes — no doSignOut in this tab
  g.progress.packages.intro.level = 9; g.commitProgress(); await runSaves();
  assert.equal(await g.cloudPush(), false);
  assert.equal(net.requests.length, before, "no PUT: not with bea's token, not at all");
  assert.doesNotMatch(panel(), /saved to cloud/);
  // This tab's own sign-in as bea reads bea's copy first, and only then saves to it.
  await g.onSignedIn(false); await runSaves();
  g.commitProgress(); await runSaves();
  const after = net.requests.slice(before);
  assert.deepEqual(after[0] && [after[0].method, after[0].token], ["GET", "token-bea:sub-bea"], "bea's copy is read first");
  assert.ok(after.length > 1 && after.every(r => r.token === "token-bea:sub-bea"), "then saves go to bea, and only with bea's token");
});

test("a session whose token names another account is no session: nothing is read or written with it", async () => {
  const { g, net } = cloudGame({ claimOf: n => (n === "ann" ? "bea" : n) });
  net.answer = answers(() => reply(200, clone(CLOUD)), () => reply(200, { ok: true }));
  assert.equal((await g.onSignedIn(false)).signedIn, false);
  assert.equal((await g.onSignedIn(true, "ann")).signedIn, false);
  assert.equal(await g.cloudPush(), false);
  assert.deepEqual(net.requests, [], "no request carried the mismatched token");
  assert.equal(g.cloudOn, false);
});

for (const accept of [true, false]) {
  test(`the name after ?reset ${accept ? "accepted" : "declined"}, a nameless pull and Home: the box, the title and the stored name agree`, async () => {
    const title = { textContent: "" }, pname = { value: "", focus() {}, addEventListener() {} };
    const { g, net } = cloudGame({ elements: { title, pname }, extraSetup: w => { w.location.search = "?reset"; w.confirm = () => accept; } });
    const want = accept ? "" : "Ann";
    assert.equal(g.progress.name, want);
    const { name, ...nameless } = clone(CLOUD);
    net.answer = answers(() => reply(200, nameless));
    await g.onSignedIn(false);
    g.openHome();
    assert.deepEqual([pname.value, title.textContent, g.Store.get("progress").name],
      [want, accept ? "🌱 Tune Garden" : "🌱 Ann's Tune Garden", want]);
  });
}

// ---------- PR review round 3 (TUN-93): one account by name and by sub, read and write ----------
test("an account switched while this run's session or load is out: the other copy never lands, nothing becomes writable", async () => {
  const BEA = withLevel(clone(CLOUD), 5);
  // 1) While ann's session is being fetched.
  const a = cloudGame();
  a.net.answer = answers(req => reply(200, req.token.startsWith("token-bea") ? clone(BEA) : clone(CLOUD)), () => reply(200, { ok: true }));
  const release = a.holdTokens("ann");
  const signing = a.g.onSignedIn(false); await tick();
  a.signIn("bea");   // another tab, mid-sign-in
  release();
  const r = await signing;
  assert.equal(r.signedIn, false);
  assert.notEqual(lvl(a.g.progress), 5, "bea's garden never lands in ann's run");
  assert.notEqual(lvl(a.g.Store.get("progress")), 5);
  assert.deepEqual(puts(a.net), []);
  a.g.commitProgress(); await a.runSaves();
  assert.deepEqual(puts(a.net), [], "and nothing is writable");
  // 2) While ann's GET is out (TUN-128): not even ann's own copy lands once bea holds the tab's session, and nothing
  // becomes writable — before any later save could find out.
  const b = cloudGame();
  const get = deferred();
  b.net.answer = answers(() => get.promise, () => reply(200, { ok: true }));
  const signing2 = b.g.onSignedIn(false); await tick();
  b.signIn("bea");
  get.resolve(reply(200, withLevel(clone(CLOUD), 6)));
  assert.equal((await signing2).signedIn, false);
  assert.notEqual(lvl(b.g.progress), 6, "ann's copy never lands under bea");
  assert.notEqual(lvl(b.g.Store.get("progress")), 6);
  assert.equal(b.g.cloudSync, "off", "nothing is writable, before any save");
  b.g.commitProgress(); await b.runSaves();
  assert.deepEqual(puts(b.net), [], "and nothing is written");
});

test("the same name with a different sub (a deleted name reused) is another account: no write, and writing needs a fresh load", async () => {
  const { g, net, runSaves, setSubOf, panel } = cloudGame();
  net.answer = answers(() => reply(200, clone(CLOUD)), () => reply(200, { ok: true }));
  await g.onSignedIn(false); await runSaves();
  const before = puts(net).length;
  setSubOf(n => "sub-" + n + "-new");
  g.progress.packages.intro.level = 7; g.commitProgress(); await runSaves();
  assert.equal(puts(net).length, before, "no PUT to the new account's row");
  assert.equal(g.cloudSync, "off", "readiness revoked");
  assert.doesNotMatch(panel(), /saved to cloud|syncs across/);
  setSubOf(n => "sub-" + n);   // the old account back in the store: still no write without a load
  g.commitProgress(); await runSaves(); assert.equal(await g.cloudPush(), false);
  assert.equal(puts(net).length, before);
  await g.onSignedIn(false);
  assert.equal(net.requests.at(-1).method, "GET", "a sign-in reads first");
  g.commitProgress(); await runSaves();
  assert.equal(puts(net).length, before + 1);
  // The garden card's own check: an id from sign-up that the session does not carry is no session.
  const c = cloudGame();
  c.net.answer = answers(() => assert.fail("no pull"), () => reply(200, { ok: true }));
  assert.equal((await c.g.onSignedIn(true, "ann", "sub-someone-else")).signedIn, false);
  assert.deepEqual(puts(c.net), []);
});

// ---------- TUN-128: a tab's sync stays on the account its sign-in authenticated ----------
const ANN = { "cognito:username": "ann", sub: "sub-ann" };
// Every panel the game draws from now on, as text: a premature redraw is caught, not only the last one.
const panelHistory = t => { const shown = [], render = t.g.renderAuth; t.g.renderAuth = s => { render(s); shown.push(t.panel()); }; return shown; };

test("TUN-128 (48, 54): a sign-in syncs the account it authenticated, never the one the shared storage names by then", async () => {
  for (const [what, change] of [
    ["another account", t => t.signIn("bea")],
    ["the same name with another sub", t => { t.signIn("ann"); t.setSubOf(n => "sub-" + n + "-reused"); }],
  ]) {
    const t = cloudGame(); const { g, net } = t;
    net.answer = routes();
    t.signIn(null);
    g.cogSignIn = async () => { change(t); return signedInSession(ANN); };   // ann authenticated; another tab acted first
    const r = await g.signInWith("ann", "acorn map tulip wren");
    assert.equal(r.ok, false, `${what}: not a successful sign-in`);
    assert.deepEqual(net.requests, [], `${what}: no request with anyone's token`);
    assert.notEqual(g.cloudSync, "ready", what);
  }
  // A session that names no account is no sign-in either.
  const u = cloudGame(); u.net.answer = routes();
  u.g.cogSignIn = async () => signedInSession({ "cognito:username": "ann" });
  const warned = [], warn = console.warn; console.warn = (...a) => warned.push(a.join(" "));
  try { assert.equal((await u.g.signInWith("ann", "acorn map tulip wren")).ok, false); } finally { console.warn = warn; }
  assert.deepEqual(u.net.requests, []);
  assert.deepEqual(warned, [], "refused as no account, not by a failure along the way");
  // And when the storage agrees: the authenticated account's load.
  const v = cloudGame(); v.net.answer = routes();
  v.g.cogSignIn = async () => signedInSession(ANN);
  assert.equal((await v.g.signInWith("ann", "acorn map tulip wren")).ok, true);
  assert.deepEqual(v.net.requests.map(r => [r.method, r.token]), [["GET", "token-ann:sub-ann"]]);
});

test("TUN-128 (49, 54): a load that returns after another tab changed the account is thrown away: not stored, applied, shown or read aloud", async () => {
  const BEA = withLevel(clone(CLOUD), 5);
  for (const [what, change, answer] of [
    ["bea signed in", t => t.signIn("bea"), () => reply(200, clone(BEA))],
    ["ann's name with another sub", t => t.setSubOf(n => "sub-" + n + "-reused"), () => reply(200, clone(BEA))],
    ["nobody signed in", t => t.signIn(null), () => reply(200, clone(BEA))],
    ["bea signed in, and the load failed", t => t.signIn("bea"), () => reply(503, {})],
    ["nobody signed in, and the load failed", t => t.signIn(null), () => reply(503, {})],
  ]) {
    const t = cloudGame(); const { g, net } = t;
    const get = deferred(); net.answer = answers(() => get.promise);
    const before = JSON.stringify(g.progress), stored = g.__window.localStorage.getItem("mg_progress");
    let applied = 0; const apply = g.applyProgress; g.applyProgress = () => { applied++; apply(); };
    const narrate = g.narrateReady;
    const signing = g.onSignedIn(false); await tick();   // boot's resume: the loading row is up
    assert.match(t.panel(), /loading your progress/, `${what}: the loading row`);
    const shown = panelHistory(t);
    change(t); get.resolve(answer());
    const r = await signing; await tick();
    assert.deepEqual({ ...r }, { signedIn: false, saved: false }, what);
    assert.equal(JSON.stringify(g.progress), before, `${what}: progress unchanged`);
    assert.equal(g.__window.localStorage.getItem("mg_progress"), stored, `${what}: the stored copy unchanged`);
    assert.equal(applied, 0, `${what}: nothing applied`);
    assert.equal(g.narrateReady, narrate, `${what}: the narration block never entered`);
    assert.equal(g.cloudSync, "off", `${what}: not writable`);
    assert.equal(g.cloudResting, false, `${what}: no cloud failure reported`);
    for (const p of shown) assert.doesNotMatch(p, /\bbea\b|Signed in as|loaded from cloud|resting/i, `${what}: nothing shown for this load`);
    g.commitProgress(); await t.runSaves();
    assert.deepEqual(puts(net), [], `${what}: nothing written`);
  }
});

test("TUN-128 (50): nobody signed in at the load's own lookup ends the sign-in, even if the account is back before it would return", async () => {
  const t = cloudGame(); const { g, net } = t; net.answer = routes();
  const release = t.holdTokens("ann");
  const signing = g.onSignedIn(false); await tick();
  release(); t.signIn(null);   // the first lookup answers for ann; by the load's own lookup, nobody is signed in
  await tick(); t.signIn("ann");   // …and ann is back
  assert.deepEqual({ ...await signing }, { signedIn: false, saved: false });
  assert.deepEqual(net.requests, [], "no load");
  assert.equal(g.cloudSync, "off");
  assert.equal(g.cloudResting, false, "not the cloud resting");
});

test("TUN-128 (50, 55): after a failed card upload, a save that meets another sub, or nobody, sends nothing; writing again needs a fresh load", async () => {
  for (const [what, change] of [["a replacement sub", t => t.setSubOf(n => "sub-" + n + "-new")], ["nobody signed in", t => t.signIn(null)]]) {
    const t = cloudGame(); const { g, net } = t;
    net.answer = answers(() => assert.fail("a card reads nothing"), () => reply(503, {}));
    assert.deepEqual({ ...await g.onSignedIn(true, "ann", "sub-ann") }, { signedIn: true, saved: false }, "the card's upload failed");
    assert.equal(g.cloudSync, "ready");
    g.commitProgress();   // an ordinary save, queued
    change(t); await t.runSaves();
    assert.equal(puts(net).length, 1, `${what}: no second PUT`);
    assert.equal(g.cloudSync, "off", `${what}: readiness revoked`);
    assert.doesNotMatch(t.panel(), /saved to cloud|syncs across|resting/, what);
    // ann back as she was: still nothing until a sign-in has read the cloud copy.
    t.setSubOf(n => "sub-" + n); t.signIn("ann");
    g.commitProgress(); await t.runSaves(); assert.equal(await g.cloudPush(), false);
    assert.equal(puts(net).length, 1, `${what}: nothing without a fresh load`);
    net.answer = routes();
    await g.onSignedIn(false);
    assert.equal(net.requests.at(-1).method, "GET", `${what}: a sign-in reads first`);
    g.commitProgress(); await t.runSaves();
    assert.equal(puts(net).length, 2, `${what}: then saves go up again`);
  }
  // A 503 with ann still signed in is a cloud failure, not a lost account: still writable, and it says so.
  const t = cloudGame(); const { g, net } = t;
  let ok = false; net.answer = answers(() => reply(200, clone(CLOUD)), () => reply(ok ? 200 : 503, {}));
  await g.onSignedIn(false);
  g.commitProgress(); await t.runSaves();
  assert.equal(g.cloudSync, "ready"); assert.equal(g.cloudResting, true);
  assert.match(t.panel(), /Signed in as .*resting/);
  ok = true; g.commitProgress(); await t.runSaves();
  assert.equal(g.cloudResting, false);
});

test("TUN-128 (49, 55): a save that succeeds after another tab changed the account is never credited to it", async () => {
  for (const how of ["a sign-up's first save", "an ordinary save"]) {
    const t = cloudGame(); const { g, net } = t;
    const put = deferred();
    net.answer = answers(() => reply(200, clone(CLOUD)), () => put.promise);
    if (how === "an ordinary save") await g.onSignedIn(false);
    const shown = panelHistory(t);
    const saving = how === "a sign-up's first save" ? g.onSignedIn(true, "ann", "sub-ann") : (g.commitProgress(), t.runSaves());
    await tick();
    assert.equal(puts(net).length, 1, `${how}: sent, with ann's token`);
    t.signIn("bea");
    put.resolve(reply(200, { ok: true }));
    const r = await saving; await tick();
    if (how === "a sign-up's first save") assert.deepEqual({ ...r }, { signedIn: false, saved: false }, how);
    assert.equal(g.cloudSync, "off", `${how}: this run ends`);
    for (const p of [...shown, t.panel()]) assert.doesNotMatch(p, /\bbea\b|saved to cloud|syncs across/i, `${how}: never credited to bea`);
  }
});

test("TUN-128: a save from a run that ended while it was out leaves the newer run alone", async () => {
  // ann's save waits for its final check; meanwhile ann signs in again here (a newer run) and loads.
  const t = cloudGame(); const { g, net } = t;
  const put = deferred(); let first = true;
  net.answer = answers(() => reply(200, clone(CLOUD)), () => (first ? (first = false, put.promise) : reply(200, { ok: true })));
  await g.onSignedIn(false);
  g.commitProgress(); const saving = t.runSaves(); await tick();
  t.signIn("bea"); await g.onSignedIn(false);   // a newer run, bea's, loaded and ready
  assert.equal(g.cloudSync, "ready");
  put.resolve(reply(200, { ok: true })); await saving; await tick();
  assert.equal(g.cloudSync, "ready", "ann's old save did not revoke bea's run");
  assert.match(t.panel(), /Signed in as bea/);
  g.commitProgress(); await t.runSaves();
  assert.equal(puts(net).at(-1).token, "token-bea:sub-bea", "bea can still save");
});

test("TUN-128 (50): a refresh the service refuses signs the browser out — a lost account; an offline refresh does not", async () => {
  const t = cloudGame(); const { g, net } = t; net.answer = routes();
  await g.onSignedIn(false);
  t.revoke("ann");   // the library clears the session when the refresh is refused
  g.commitProgress(); await t.runSaves();
  assert.deepEqual(puts(net), []);
  assert.equal(g.cloudSync, "off", "revoked: the run ends");
  assert.equal(g.cloudResting, false, "and it is not the cloud resting");
});

test("TUN-128 (50): a sign-in that fails its first check leaves no older writer behind", async () => {
  // ann's tab is synced and has a save queued; this tab signs ann in again, but another tab signs out first.
  const t = cloudGame(); const { g, net } = t; net.answer = routes();
  await g.onSignedIn(false); const before = puts(net).length;
  g.commitProgress();   // queued
  g.cogSignIn = async () => { t.signIn(null); return signedInSession(ANN); };
  assert.equal((await g.signInWith("ann", "acorn map tulip wren")).ok, false);
  t.signIn("ann");   // ann back, from the other tab
  await t.runSaves(); g.commitProgress(); await t.runSaves();
  assert.equal(puts(net).length, before, "the old run's queued save, and any later one, wait for a fresh load");
  assert.notEqual(g.cloudSync, "ready");
});

test("TUN-128 (50): once a save finds the account lost, the run's other calls still out end with it", async () => {
  // The sign-up's first save is out; an ordinary save meets bea and ends the run; ann is back when the first save returns.
  const t = cloudGame(); const { g, net } = t;
  const put = deferred(); let first = true;
  net.answer = answers(() => assert.fail("no read"), () => (first ? (first = false, put.promise) : reply(200, { ok: true })));
  const signingUp = g.onSignedIn(true, "ann", "sub-ann"); await tick();
  g.commitProgress(); t.signIn("bea"); await t.runSaves();
  assert.equal(g.cloudSync, "off");
  t.signIn("ann"); put.resolve(reply(200, { ok: true }));
  assert.deepEqual({ ...await signingUp }, { signedIn: false, saved: false }, "the ended run's first save is not a sign-in");
  assert.equal(g.cloudSync, "off");
  assert.equal(puts(net).length, 1);
});
