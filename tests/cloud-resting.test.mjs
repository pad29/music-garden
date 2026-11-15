// TUN-87: when the cloud is switched off at the month's budget — or is just busy — the game says one calm thing,
// "the cloud is resting", and never claims a song was deleted, a list is empty, or an error happened.
// A switched-off API answers in ways the game cannot tell from a busy one: 503 (a function at concurrency 0),
// API Gateway's own 404 (the default endpoint disabled), 429, or a fetch that throws (no CORS headers). Only the
// API's own {"error":"not found"} means a song is gone. The panel's resting lines are in cloud-sync.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame } from "./harness.mjs";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./helpers/game-scripts.mjs";

const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const notJson = (status = 200) => ({ ok: status < 300, status, json: async () => { throw new SyntaxError("Unexpected token <"); } });
const SONG = () => ({ v: 3, meta: { title: "Hi", created: 1, updated: 1 }, palette: "pentatonic",
  time: { cols: 16, tempo: 108, groove: 0 }, tracks: [{ kind: "melody", voice: "musicbox", notes: [{ p: 60, c: 0, len: 1 }] }, { kind: "drums", hits: [] }] });
// Every answer that is NOT the song and NOT the API's own "no such song".
const RESTING = {
  "429": () => reply(429, { message: "Too Many Requests" }),
  "503 (a function switched off)": () => reply(503, { message: "Service Unavailable" }),
  "500": () => reply(500, { error: "server error" }),
  "API Gateway's 404 (endpoint disabled)": () => reply(404, { message: "Not Found" }),
  "a 404 that is not JSON": () => notJson(404),
  "403": () => reply(403, { message: "Forbidden" }),
  "a thrown fetch (no CORS headers)": () => { throw new TypeError("Failed to fetch"); },
  "a 200 that is not JSON": () => notJson(200),
  "a 200 of null": () => reply(200, null),
  "a 200 of {}": () => reply(200, {}),
  "a 200 whose song is not an object": () => reply(200, { id: "abc", song: "x" }),
};
const GONE = () => reply(404, { error: "not found" });
const DELETED = /may have been deleted/;
const RESTING_LINE = /☁️ The cloud is resting just now/;

// ---------- a #song= link at boot ----------
function bootLink(answer) {
  const texts = [], requests = [];
  const game = loadGame({ setup: w => {
    const create = w.document.createElement;
    Object.defineProperty(w.document, "createElement", { configurable: true, value: tag => new Proxy(create(tag), {
      set(t, k, v) { if (k === "textContent") texts.push(String(v)); return true; } }) });
    w.location = { ...w.location, hash: "#song=abc", search: "", pathname: "/index.html" };
    w.history = { state: null, replaceState() {} };
    w.fetch = async url => { requests.push(String(url)); return answer(); };
  } });
  return { game, requests, toast: () => texts.join(" | ") };
}
const ticks = () => new Promise(r => setTimeout(r, 20));

test("a #song= link the cloud cannot answer says it is resting, never that the song may be deleted", async () => {
  for (const [what, answer] of Object.entries(RESTING)) {
    const b = bootLink(answer);
    await ticks();
    assert.equal(b.requests.length, 1, what);
    assert.doesNotMatch(b.toast(), DELETED, what);
    assert.match(b.toast(), /The cloud is resting just now, so this song can't open yet\. Try the link again later\./, what);
    assert.doesNotMatch(b.toast(), /⚠️/, `${what}: no warning sign`);
    assert.equal(b.game.isStudioScope(), true, `${what}: the Studio is open to play in`);
  }
});

test("only the API's own not-found says the song may have been deleted; a real song opens", async () => {
  const gone = bootLink(GONE); await ticks();
  assert.match(gone.toast(), /That song link didn't work — it may have been deleted\./);
  assert.doesNotMatch(gone.toast(), RESTING_LINE);
  const ok = bootLink(() => reply(200, { id: "abc", song: SONG() })); await ticks();
  assert.match(ok.toast(), /A song from a friend/);
});

// ---------- Melodies' cloud section, and sharing a big song ----------
function el(tag) {
  let text = "";
  const e = { tag, children: [], className: "", style: {}, dataset: {}, onclick: null,
    get textContent() { return text; }, set textContent(v) { text = String(v); e.children = []; },
    get innerHTML() { return ""; }, set innerHTML(v) { e.children = []; },
    appendChild(c) { e.children.push(c); c.parent = e; return c; },
    remove() { if (e.parent) e.parent.children = e.parent.children.filter(x => x !== e); },
    addEventListener() {}, removeEventListener() {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false } };
  return e;
}
const toasts = [];
const mlist = el("div");
const g = loadGame({ fresh: true, elements: { mlist }, setup: w => { w.__answer = () => { throw new Error("no answer set"); };
  w.fetch = async (url, opts = {}) => w.__answer(String(url), opts.method || "GET"); } });
Object.defineProperty(g.__document, "createElement", { value: tag => el(String(tag).toLowerCase()), configurable: true });
g.toast = t => toasts.push(String(t));
g.copyLink = () => {};
g.userPool = { getCurrentUser: () => ({ getUsername: () => "ann",
  getSession: cb => cb(null, { isValid: () => true, getIdToken: () => ({ getJwtToken: () => "t" }) }) }) };
const answerWith = fn => { g.__window.__answer = fn; };
const texts = () => { const out = []; const walk = e => { out.push(e.textContent); e.children.forEach(walk); }; walk(mlist); return out.join(" | "); };
const button = (label) => { const out = []; const walk = e => { if (e.tag === "button" && e.textContent === label) out.push(e); e.children.forEach(walk); }; walk(mlist); return out[0]; };

test("Melodies says the cloud is resting, not 'Nothing here yet', when the list cannot be loaded", async () => {
  for (const [what, answer] of Object.entries({ ...RESTING, "a 200 whose songs is not a list": () => reply(200, { songs: "x" }) })) {
    if (what === "a 200 whose song is not an object") continue;
    answerWith(() => answer());
    await g.openMelodies();
    assert.match(texts(), /☁️ The cloud is resting just now — your cloud songs are safe there\. Try again in a moment\./, what);
    assert.doesNotMatch(texts(), /Nothing here yet/, what);
  }
  answerWith(() => reply(200, { songs: [] }));
  await g.openMelodies();
  assert.match(texts(), /Nothing here yet — share a big song/, "an empty list is still 'nothing here yet'");
  assert.doesNotMatch(texts(), RESTING_LINE);
});

test("Melodies' ▶ Load and 🗑 say the cloud is resting when it cannot be reached; a gone song is not 'resting'", async () => {
  const list = () => reply(200, { songs: [{ id: "c1", title: "Tune" }] });
  for (const [what, answer] of Object.entries(RESTING)) {
    answerWith((url, method) => (/\/songs$/.test(url) ? list() : answer()));
    await g.openMelodies();
    toasts.length = 0; await button("▶ Load").onclick();
    assert.deepEqual(toasts, ["☁️ The cloud is resting just now — try again later."], `load: ${what}`);
    if (what === "a 200 whose song is not an object" || /200/.test(what)) continue;   // a DELETE has no body to check
    toasts.length = 0; await button("🗑").onclick();
    assert.deepEqual(toasts, ["☁️ The cloud is resting just now — try again later."], `delete: ${what}`);
  }
  answerWith((url, method) => (/\/songs$/.test(url) ? list() : GONE()));
  await g.openMelodies();
  toasts.length = 0; await button("▶ Load").onclick();
  assert.deepEqual(toasts, ["⚠️ Couldn't load that song."], "a song the API says is gone");
  let listed = 0;
  answerWith((url, method) => (/\/songs$/.test(url) ? (listed++, list()) : GONE()));
  await g.openMelodies(); listed = 0;
  toasts.length = 0; await button("🗑").onclick(); await ticks();
  assert.deepEqual(toasts, [], "deleting a song that is already gone is not a failure");
  assert.equal(listed, 1, "Melodies reloads its list");
});

test("sharing a big song the cloud cannot take says it is resting", async () => {
  const big = SONG(); big.tracks[0].notes = Array.from({ length: 900 }, (_, i) => ({ p: 48 + (i % 24), c: i % 16, len: 1 }));
  for (const [what, answer] of Object.entries({ ...RESTING, "a 200 with no id": () => reply(200, { song: SONG() }) })) {
    if (what === "a 200 whose song is not an object") continue;   // it has an id: the song was stored
    answerWith(() => answer());
    toasts.length = 0; await g.shareSong(big);
    assert.equal(toasts.at(-1), "☁️ The cloud is resting just now — try sharing this song again later.", what);
  }
});

// ---------- making an account while sign-ups are switched off ----------
test("a sign-up the trigger refuses says the garden isn't taking new accounts, calmly; other errors are unchanged", async () => {
  const CLOSED = "🌱 The garden isn't taking new accounts just now. Keep playing as a guest — your garden is saved on this device — and try again another day.";
  const refusals = [
    { code: "UnexpectedLambdaException", name: "UnexpectedLambdaException", message: "PreSignUp invocation failed due to error TooManyRequestsException." },
    { code: "UserLambdaValidationException", message: "PreSignUp failed with error Rate exceeded." },
    { name: "InvalidLambdaResponseException", message: "Invalid lambda response" },
    { message: "PreSignUp invocation failed due to error AccessDeniedException." },
  ];
  const signUp = g.cogSignUp, signIn = g.cogSignIn;
  try {
    for (const err of refusals) {
      let signedIn = 0;
      g.cogSignUp = async () => { throw err; };
      g.cogSignIn = async () => { signedIn++; };
      const msg = { textContent: "" };
      await g.submitAuth("up", "kid", "password1", "", msg);
      assert.equal(msg.textContent, CLOSED, JSON.stringify(err));
      assert.equal(signedIn, 0, "no sign-in, no upload, after a refused sign-up");
    }
    g.cogSignUp = async () => { throw { code: "UsernameExistsException", message: "User already exists" }; };
    const msg = { textContent: "" };
    await g.submitAuth("up", "kid", "password1", "", msg);
    assert.equal(msg.textContent, "⚠️ User already exists");
    g.cogSignIn = async () => { throw { code: "UnexpectedLambdaException", message: "PreAuthentication failed" }; };
    const inMsg = { textContent: "" };
    await g.submitAuth("in", "kid", "password1", "", inMsg);
    assert.equal(inMsg.textContent, "⚠️ PreAuthentication failed", "the mapping is for sign-up only");
  } finally { g.cogSignUp = signUp; g.cogSignIn = signIn; }
});

// ---------- making an account once the day's limit is reached (TUN-88) ----------
test("a sign-up past the day's limit says the garden is full today; the trigger's other refusals keep TUN-87's line", async () => {
  const FULL = "🌱 So many new gardeners joined today that the garden is full! Keep playing as a guest — your garden is saved on this device — and make your account tomorrow.";
  const CLOSED = "🌱 The garden isn't taking new accounts just now. Keep playing as a guest — your garden is saved on this device — and try again another day.";
  const full = [   // Cognito's documented shape, and the same text on the error's name or message alone
    { code: "UserLambdaValidationException", name: "UserLambdaValidationException", message: "PreSignUp failed with error daily-signup-limit." },
    { name: "UserLambdaValidationException", message: "PreSignUp failed with error daily-signup-limit." },
    { message: "PreSignUp failed with error daily-signup-limit." },
  ];
  const closed = [   // the backend's other refusals, the cost switch, and a non-trigger error naming the token
    { code: "UserLambdaValidationException", message: "PreSignUp failed with error signup-counter-unavailable." },
    { code: "UserLambdaValidationException", message: "PreSignUp failed with error signup-source-unsupported." },
    { code: "UnexpectedLambdaException", message: "PreSignUp invocation failed due to error TooManyRequestsException." },
  ];
  const signUp = g.cogSignUp, signIn = g.cogSignIn;
  try {
    for (const [errs, want] of [[full, FULL], [closed, CLOSED]]) {
      for (const err of errs) {
        let signedIn = 0;
        g.cogSignUp = async () => { throw err; };
        g.cogSignIn = async () => { signedIn++; };
        const before = JSON.stringify(g.progress), msg = { textContent: "" };
        await g.submitAuth("up", "kid", "password1", "", msg);
        assert.equal(msg.textContent, want, JSON.stringify(err));
        assert.equal(signedIn, 0, "no sign-in, no upload, after a refused sign-up");
        assert.equal(JSON.stringify(g.progress), before, "the guest's garden is untouched");
        assert.equal(g.cloudSync, "off", "still a guest");
      }
    }
    g.cogSignUp = async () => { throw { code: "InvalidParameterException", message: "daily-signup-limit" }; };
    const msg = { textContent: "" };
    await g.submitAuth("up", "kid", "password1", "", msg);
    assert.equal(msg.textContent, "⚠️ daily-signup-limit", "only a trigger failure carrying the token is the daily limit");
  } finally { g.cogSignUp = signUp; g.cogSignIn = signIn; }
});

// The same refusals through the vendored Cognito library as released (vendor/, run in a context of its own) and
// the game's real cogSignUp and submitAuth: Cognito's HTTP answer is all that is synthetic. Each shape below is
// one the library meets; it turns each into the error object the game sees. The library gets the game's own
// localStorage — as in the browser, where both share the page's — so anything it did to storage would show.
function realCognito(answer, localStorage) {
  const calls = [];
  const ctx = { console, setTimeout, clearTimeout, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, DataView, crypto: globalThis.crypto,
    navigator: { userAgent: "node" }, localStorage,
    fetch: async (url, opts) => { calls.push(opts.headers["X-Amz-Target"]); return answer(); } };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(readFileSync(join(ROOT, "vendor", "cognito", "amazon-cognito-identity.min.js"), "utf8"), ctx);
  return { lib: ctx.AmazonCognitoIdentity, calls };
}
const cognitoSays = (body, errorType = null) => () => ({ ok: false, status: 400,
  headers: { get: (h) => (/x-amzn-errortype/i.test(h) ? errorType : null) },
  json: async () => { if (body === null) throw new SyntaxError("Unexpected end of JSON input"); return body; }, text: async () => "" });

test("through the real Cognito library: the day's limit says the garden is full; nothing signs in, uploads or changes the guest's garden", async () => {
  const FULL = "🌱 So many new gardeners joined today that the garden is full! Keep playing as a guest — your garden is saved on this device — and make your account tomorrow.";
  const CLOSED = "🌱 The garden isn't taking new accounts just now. Keep playing as a guest — your garden is saved on this device — and try again another day.";
  const LIMIT = "PreSignUp failed with error daily-signup-limit.";
  const cases = [
    ["__type", cognitoSays({ __type: "UserLambdaValidationException", message: LIMIT }), FULL],
    ["a namespaced __type", cognitoSays({ __type: "com.amazonaws.cognito.identity.idp.model#UserLambdaValidationException", message: LIMIT }), FULL],
    ["code", cognitoSays({ code: "UserLambdaValidationException", message: LIMIT }), FULL],
    ["the counter unavailable", cognitoSays({ __type: "UserLambdaValidationException", message: "PreSignUp failed with error signup-counter-unavailable." }), CLOSED],
    ["the error type in a header only (the message is lost)", cognitoSays(null, "UserLambdaValidationException:http://internal.amazon.com/coral/"), CLOSED],
  ];
  const pool = g.userPool, w = g.__window, hadLib = "AmazonCognitoIdentity" in w, lib = w.AmazonCognitoIdentity;
  const saved = () => JSON.stringify(Array.from({ length: w.localStorage.length }, (_, i) => [w.localStorage.key(i), w.localStorage.getItem(w.localStorage.key(i))]).sort());
  try {
    g.commitProgress();   // the guest's garden, saved on this device before they try to make an account
    assert.ok(w.localStorage.getItem("mg_progress"), "the guest's progress is in storage");
    for (const [what, answer, want] of cases) {
      const real = realCognito(answer, w.localStorage), api = [];
      w.AmazonCognitoIdentity = real.lib;
      g.userPool = new real.lib.CognitoUserPool({ UserPoolId: g.AUTH.userPoolId, ClientId: g.AUTH.clientId });
      assert.equal(g.userPool.storage, w.localStorage, "the library and the game share one storage");
      answerWith((url) => { api.push(url); throw new Error("no API call expected"); });
      const progress = JSON.stringify(g.progress), stored = saved(), guest = w.localStorage.getItem("mg_progress");
      const msg = { textContent: "" };
      await g.submitAuth("up", "kid", "password1", "parent@example.com", msg);
      assert.equal(msg.textContent, want, what);
      assert.deepEqual(real.calls, ["AWSCognitoIdentityProviderService.SignUp"], `${what}: Cognito saw the sign-up and nothing else — no sign-in`);
      assert.deepEqual(api, [], `${what}: no upload`);
      assert.equal(JSON.stringify(g.progress), progress, `${what}: the guest's garden is untouched`);
      assert.equal(w.localStorage.getItem("mg_progress"), guest, `${what}: the guest's saved progress is still there, unchanged`);
      assert.equal(saved(), stored, `${what}: nothing in storage changed`);
      assert.equal(g.cloudSync, "off", `${what}: still a guest`);
    }
  } finally {
    g.userPool = pool;
    if (hadLib) w.AmazonCognitoIdentity = lib; else delete w.AmazonCognitoIdentity;
  }
});
