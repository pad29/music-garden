// TUN-93: making a garden (js/garden-card.js) and signing in (js/cloud.js signInWith, js/boot.js doLandingSignIn).
// The game runs in the harness with Cognito stubbed at the game's own seams (cogSignUp, cogSignIn, onSignedIn), and
// a small DOM of its own for the card's elements: the harness's stub elements forget every property set on them,
// and these tests press the card's buttons and read what it says. What Cognito itself sends and answers is
// cloud-resting.test.mjs's (the vendored library), and the upload is cloud-sync.test.mjs's.
import { test } from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { loadGame, FakeIdToken, cachedIdToken, signedInSession } from "./harness.mjs";

// An element that keeps what is set on it, its children, and its place in the tree.
function el(tag = "div") {
  const e = { tagName: tag.toUpperCase(), kids: [], style: {}, attrs: {}, listeners: {}, parent: null,
    disabled: false, checked: false, value: "", type: "", className: "", _text: "",
    append(...c) { for (const k of c) { if (k && typeof k === "object") { if (k.parent) k.remove(); k.parent = e; } e.kids.push(k); } },
    appendChild(c) { e.append(c); return c; },
    remove() { if (e.parent) { e.parent.kids = e.parent.kids.filter(k => k !== e); e.parent = null; } },
    setAttribute(k, v) { e.attrs[k] = String(v); }, removeAttribute(k) { delete e.attrs[k]; },
    addEventListener(t, f) { (e.listeners[t] ||= []).push(f); },
    focus() {}, classList: { add() {}, remove() {} },
    get textContent() { return e._text + e.kids.map(k => k.textContent ?? "").join(""); },
    set textContent(v) { for (const k of e.kids) if (k && typeof k === "object") k.parent = null; e._text = String(v); e.kids = []; },
    get innerHTML() { return ""; },
    // The map is SVG markup (home.js renderPkgs): stand in an <svg> that keeps its listeners, so a test can press a land.
    set innerHTML(v) { e.textContent = "";
      if (/^\s*<svg/.test(String(v))) { const svg = el("svg"); svg.html = String(v); svg.querySelectorAll = () => []; svg.querySelector = () => null;
        svg.getBoundingClientRect = () => ({ top: 0, height: 0 }); e.append(svg); } },
    get firstElementChild() { return e.kids.find(k => k && k.tagName); } };
  return e;
}
const all = (root, out = []) => { for (const k of root.kids || []) if (k && typeof k === "object" && k.tagName) { out.push(k); all(k, out); } return out; };
const button = (root, label) => all(root).find(e => e.tagName === "BUTTON" && e.textContent === label);
const byClass = (root, cls) => all(root).find(e => e.className.split(" ").includes(cls));
const checkbox = root => all(root).find(e => e.tagName === "INPUT" && e.type === "checkbox");
const tick = () => new Promise(r => setImmediate(r));

const CANT_CHECK = "🌱 The garden couldn't check your account just now. Keep this same card, and press Try again.";
const CLOSED = "🌱 The garden isn't taking new accounts just now. Keep playing as a guest — your garden is saved on this device — and try again another day.";
const FULL = "🌱 So many new gardeners joined today that the garden is full! Keep playing as a guest — your garden is saved on this device — and make your account tomorrow.";

/** A game with the card's elements real enough to press; `cognito` records the calls the card makes. */
// extra: more elements, there before boot (so the game wires them); realMap: keep the real renderPkgs (the map).
function cardGame({ signUp = async () => {}, signIn = async () => {}, upload = async () => true, landing = false, extra = {}, realMap = false } = {}) {
  const authbox = el(), cardoverlay = el(), gardencard = el(), homeoverlay = el();
  const elements = { authbox, cardoverlay, gardencard, homeoverlay, ...extra };
  if (landing) for (const id of ["landingUser", "landingPass", "landingShow", "landingMsg", "landingLost", "landingBack"]) elements[id] = el(["landingShow", "landingBack"].includes(id) ? "button" : id.includes("Msg") || id.includes("Lost") ? "div" : "input");
  // Who the pool says is signed in: the session in the storage every tab shares. A sign-in sets it; a test may
  // change it, as another tab would. subOf(name): that account's permanent id, in its tokens and its sign-in session.
  // afterLookup: called once a session has been handed out (another tab may act between two lookups).
  const session = { user: null, broken: false, brokenHits: 0, requests: [], subOf: n => "sub-" + n, afterLookup: null,
    api: method => ({ ok: true, status: 200, json: async () => (method === "GET" ? null : { ok: true }) }) };
  const g = loadGame({ fresh: true, elements, setup: w => {
    w.crypto = webcrypto; w.Uint32Array = Uint32Array;
    w.AmazonCognitoIdentity = { CognitoIdToken: FakeIdToken, CognitoUserPool: class { getCurrentUser() {
      const name = session.user;
      return name ? { getUsername: () => name, signOut() { session.user = null; },
        storage: cachedIdToken(() => ({ "cognito:username": name, sub: session.subOf(name) })),
        getSession(cb) {
          if (session.broken) { session.brokenHits++; cb(new Error("the session could not be refreshed")); if (session.afterLookup) session.afterLookup(); return; }
          cb(null, { isValid: () => true, getIdToken: () => ({ payload: { "cognito:username": name, sub: session.subOf(name) }, getJwtToken: () => "token-" + name + ":" + session.subOf(name) }) });
          if (session.afterLookup) session.afterLookup(); } } : null; } } };
    w.fetch = async (url, opts = {}) => { session.requests.push({ url: String(url), method: opts.method || "GET", token: String(opts.headers?.Authorization || "") });
      return session.api(opts.method || "GET"); };
  } });
  const doc = g.__window.document;
  Object.defineProperty(doc, "createElement", { value: tag => el(tag), configurable: true });
  Object.defineProperty(doc, "createTextNode", { value: t => ({ textContent: String(t) }), configurable: true });
  const cognito = { signUps: [], signIns: [], uploads: 0 };
  g.cogSignUp = async (u, p) => { cognito.signUps.push([u, p]); return signUp(u, p); };
  g.cogSignIn = async (u, p) => { cognito.signIns.push([u, p]); await signIn(u, p); session.user = u; session.broken = false;
    return signedInSession({ "cognito:username": u, sub: session.subOf(u) }); };   // the session Cognito answers with
  const realOnSignedIn = g.onSignedIn;
  g.onSignedIn = async (up, onlyFor) => {
    assert.equal(up, true, "a new garden uploads this device's");
    assert.equal(onlyFor, session.user, "only to the account the card signed in to");
    cognito.uploads++; return { signedIn: true, saved: await upload() }; };
  if (!realMap) g.renderPkgs = () => {};
  return { g, authbox, cardoverlay, gardencard, cognito, elements, session, realOnSignedIn };
}
// Home → Create account → Make my garden: the card for the name the roller showed.
function openCard(t) {
  t.g.showGardenRoller();
  const shown = byClass(t.authbox, "gardenname").textContent;
  button(t.authbox, "Make my garden →").onclick();
  return shown;
}
const keep = t => { const box = checkbox(t.gardencard); box.checked = true; box.onchange(); };
const go = async t => { const b = button(t.gardencard, "Go to my garden") || button(t.gardencard, "Try again"); await b.onclick(); };
const said = t => byClass(t.gardencard, "authmsg").textContent;
const face = t => byClass(t.gardencard, "gcface");

test("the roller shows a garden name in title case, and rolls another; nothing is typed", () => {
  const t = cardGame();
  t.g.showGardenRoller();
  const first = byClass(t.authbox, "gardenname").textContent;
  assert.match(first, /^[A-Z][a-z]+-[A-Z][a-z]+-\d\d$/);
  assert.ok(t.g.isGardenName(first.toLowerCase()));
  const seen = new Set([first]);
  for (let i = 0; i < 20; i++) { button(t.authbox, "🎲 Roll again").onclick(); seen.add(byClass(t.authbox, "gardenname").textContent); }
  assert.ok(seen.size > 1, "rolling again changes the name");
  assert.equal(all(t.authbox).filter(e => e.tagName === "INPUT").length, 0, "no box to type in");
  assert.deepEqual(t.cognito.signUps, [], "rolling makes nothing");
});

test("the card shows the name, the four words and what each is for; nothing is sent until the card is kept", async () => {
  const t = cardGame();
  const shown = openCard(t);
  assert.equal(t.cardoverlay.style.display, "flex");
  const text = face(t).textContent;
  assert.ok(text.includes(shown), "the name the roller showed");
  assert.match(text, /It's OK to share this\./);
  assert.match(text, /Don't share these\. With your garden name, they open your garden on any device\./);
  assert.match(text, /tunegarden\.game/);
  const words = byClass(face(t), "gcwords").textContent.split(/\s+/);
  assert.equal(words.length, 4);
  for (const w of words) assert.ok(t.g.PASSPHRASE_WORDS.includes(w), w);
  const goBtn = button(t.gardencard, "Go to my garden");
  assert.equal(goBtn.disabled, true, "Go waits for the box");
  await goBtn.onclick();
  assert.deepEqual(t.cognito.signUps, [], "pressing Go before the box is ticked makes nothing");
  keep(t);
  assert.equal(goBtn.disabled, false);
  await go(t);
  assert.deepEqual(t.cognito.signUps, [[shown.toLowerCase(), words.join("-")]], "the account is the card's name and words");
  assert.deepEqual(t.cognito.signIns, [[shown.toLowerCase(), words.join("-")]]);
  assert.equal(t.cognito.uploads, 1);
  assert.equal(said(t), "☁️ Your garden is saved in the cloud ✓");
  assert.equal(button(t.gardencard, "Cancel"), undefined, "nothing to cancel once the account exists");
  button(t.gardencard, "Done").onclick();
  assert.equal(t.cardoverlay.style.display, "none");
  assert.equal(t.gardencard.kids.length, 0, "the card, and its words, are gone from the page");
});

test("a taken name gets a new number, keeps the child's words and secret words, and must be kept again", async () => {
  let n = 0;
  const t = cardGame({ signUp: async () => { if (++n === 1) throw { code: "UsernameExistsException", name: "UsernameExistsException", message: "User already exists" }; } });
  const shown = openCard(t);
  const words = byClass(face(t), "gcwords").textContent;
  keep(t); await go(t);
  assert.deepEqual(t.cognito.signIns, [], "no sign-in for a name someone else has");
  const now = byClass(face(t), "gcname").textContent;
  assert.notEqual(now, shown);
  assert.equal(now.replace(/-\d\d$/, ""), shown.replace(/-\d\d$/, ""), "the same two words");
  assert.equal(byClass(face(t), "gcwords").textContent, words, "the same secret words");
  assert.equal(byClass(t.gardencard, "gcnotice").textContent, "Someone just took that name, so here is your new card. Keep this one.");
  assert.equal(checkbox(t.gardencard).checked, false, "kept again, for the new card");
  assert.equal(button(t.gardencard, "Go to my garden").disabled, true);
  keep(t); await go(t);
  assert.deepEqual(t.cognito.signUps.map(s => s[0]), [shown.toLowerCase(), now.toLowerCase()]);
  assert.equal(said(t), "☁️ Your garden is saved in the cloud ✓");
});

test("taken names: a number is never tried twice, the fifth gets a different pair, and a pair with no number left is left", () => {
  const t = cardGame();
  const ADJ = [...t.g.GARDEN_ADJECTIVES], NOUN = [...t.g.GARDEN_NOUNS], NUM = [...t.g.GARDEN_NUMBERS];
  // pick() answers from a script, then 0: "the first of what is left".
  const scripted = xs => { const q = [...xs]; return n => { const v = q.length ? q.shift() : 0; assert.ok(v < n); return v; }; };
  const a = t.g.gardenAttempt("brave-otter-42", ["acorn", "map", "tulip", "wren"]);
  // The fifth draws brave-otter again first: it must be drawn over.
  const pick = scripted([0, 0, 0, 0, ADJ.indexOf("brave"), NOUN.indexOf("otter"), ADJ.indexOf("calm"), NOUN.indexOf("wren"), 0]);
  const names = []; for (let k = 0; k < 5; k++) names.push(t.g.nextGardenName(a, pick));
  assert.deepEqual(names, ["brave-otter-10", "brave-otter-11", "brave-otter-15", "brave-otter-16", "calm-wren-10"],
    "the numbers left, in order (42 was tried first); then a new pair, never the crowded one");
  assert.equal(a.taken, 5);
  // A pair whose every number was tried goes to a new pair at once.
  const b = t.g.gardenAttempt("brave-otter-42", ["acorn", "map", "tulip", "wren"]);
  for (const n of NUM) b.tried.add(`brave-otter-${n}`);
  const next = t.g.nextGardenName(b, scripted([ADJ.indexOf("brave"), NOUN.indexOf("otter"), ADJ.indexOf("zippy"), NOUN.indexOf("wren"), 0]));
  assert.equal(next, "zippy-wren-10");
});

test("a lost answer keeps the card; the retry signs in with it before sending another sign-up", async () => {
  // 1) The account was made, its answer lost: the retry's sign-in finds it. No second sign-up.
  let n = 0;
  const t = cardGame({ signUp: async () => { if (++n === 1) throw new TypeError("Failed to fetch"); } });
  const shown = openCard(t);
  keep(t); await go(t);
  assert.equal(said(t), "☁️ Can't reach the garden just now. Keep your card, and press Try again.");
  assert.equal(byClass(face(t), "gcname").textContent, shown, "the same card");
  assert.ok(button(t.gardencard, "Try again"));
  assert.ok(button(t.gardencard, "Cancel"), "not known to be made: still cancellable");
  await go(t);
  assert.equal(t.cognito.signUps.length, 1, "no second sign-up");
  assert.deepEqual(t.cognito.signIns.map(s => s[0]), [shown.toLowerCase()], "the card's own name and words opened it");
  assert.equal(t.cognito.uploads, 1);
  assert.equal(said(t), "☁️ Your garden is saved in the cloud ✓");

  // 2) The request never reached Cognito: the sign-in is refused, so the sign-up is sent again, and makes it.
  let m = 0;
  const u = cardGame({ signUp: async () => { if (++m === 1) throw { code: "NetworkError", message: "Network error" }; },
    signIn: async () => { if (u.cognito.signIns.length === 1) throw { code: "NotAuthorizedException", message: "Incorrect username or password." }; } });
  const first = openCard(u);
  keep(u); await go(u); await go(u);
  assert.equal(u.cognito.signUps.length, 2);
  assert.equal(byClass(face(u), "gcname").textContent, first, "the same name: it was free");
  assert.equal(said(u), "☁️ Your garden is saved in the cloud ✓");

  // 3) A real collision: the card's words don't open it, and the name is taken — only now a new name.
  let k = 0;
  const v = cardGame({ signUp: async () => { if (++k === 1) throw new TypeError("Load failed"); throw { code: "UsernameExistsException" }; },
    signIn: async () => { throw { code: "NotAuthorizedException", message: "Incorrect username or password." }; } });
  const before = openCard(v);
  keep(v); await go(v); await go(v);
  assert.notEqual(byClass(face(v), "gcname").textContent, before);
  assert.equal(byClass(v.gardencard, "gcnotice").textContent, "Someone just took that name, so here is your new card. Keep this one.");
});

test("while it is unsettled whether the card's account exists, nothing withdraws or renames the card", async () => {
  const warn = console.warn; console.warn = () => {};
  try {
    for (const [what, err] of [["a lockout", { code: "NotAuthorizedException", message: "Password attempts exceeded" }],
      ["a throttle", { code: "TooManyRequestsException", message: "Rate exceeded" }],
      ["an internal error", { code: "InternalErrorException", message: "x" }], ["no network again", new TypeError("Failed to fetch")]]) {
      const t = cardGame({ signUp: async () => { throw new TypeError("Failed to fetch"); }, signIn: async () => { throw err; } });
      const shown = openCard(t);
      keep(t); await go(t); await go(t);
      assert.equal(t.cognito.signUps.length, 1, `${what}: no second sign-up while it is unsettled`);
      assert.equal(byClass(face(t), "gcname").textContent, shown, `${what}: the same card`);
      assert.ok(button(t.gardencard, "Try again"), what);
      assert.doesNotMatch(said(t), /Exception|Rate exceeded/, what);
    }
    // A sign-up refused for the day after an ambiguous one is believed only once the card's words are refused.
    let n = 0;
    const t = cardGame({ signUp: async () => { if (++n === 1) throw { code: "InternalErrorException", message: "x" };
      throw { code: "UserLambdaValidationException", message: "PreSignUp failed with error daily-signup-limit." }; },
      signIn: async () => { throw { code: "NotAuthorizedException", message: "Incorrect username or password." }; } });
    openCard(t); keep(t); await go(t);
    assert.ok(face(t), "the first, ambiguous failure keeps the card");
    await go(t);
    assert.deepEqual(t.cognito.signIns.length, 1, "the words were tried first");
    assert.equal(said(t), FULL);
    assert.equal(face(t), undefined, "and only then is the card withdrawn");
  } finally { console.warn = warn; }
});

test("sign-ups closed or full: the card is withdrawn, nothing signs in, and Close is all that is left", async () => {
  for (const [message, want] of [["PreSignUp failed with error daily-signup-limit.", FULL], ["PreSignUp failed with error signup-counter-unavailable.", CLOSED]]) {
    const t = cardGame({ signUp: async () => { throw { code: "UserLambdaValidationException", message }; } });
    openCard(t); keep(t); await go(t);
    assert.equal(said(t), want);
    assert.equal(face(t), undefined, "no card: it opens nothing");
    assert.doesNotMatch(t.gardencard.textContent, /share these/);
    assert.deepEqual(t.cognito.signIns, []);
    assert.equal(button(t.gardencard, "Go to my garden"), undefined);
    button(t.gardencard, "Close").onclick();
    assert.equal(t.cardoverlay.style.display, "none");
  }
});

test("an account made but not uploaded says so; Try again uploads again; once made there is no Cancel", async () => {
  let n = 0;
  const t = cardGame({ upload: async () => ++n > 1 });
  openCard(t); keep(t); await go(t);
  assert.equal(said(t), "Your account is made, but your garden isn't in the cloud yet. Keep this page open and press Try again.");
  assert.equal(button(t.gardencard, "Cancel"), undefined);
  assert.ok(button(t.gardencard, "Done"), "the child may still go on: the next save uploads");
  await go(t);
  assert.equal(t.cognito.signUps.length, 1, "the account is not made twice");
  assert.equal(t.cognito.signIns.length, 2, "signed in again with the card before the retry: its session may have gone");
  assert.equal(t.cognito.uploads, 2);
  assert.equal(said(t), "☁️ Your garden is saved in the cloud ✓");
  assert.equal(all(t.gardencard).filter(e => e.tagName === "BUTTON" && e.textContent === "Done").length, 1, "one Done button");
});

test("a sign-in that fails after the account was made tries only the sign-in again, and the child can leave", async () => {
  let n = 0;
  const t = cardGame({ signIn: async () => { if (++n === 1) throw new TypeError("Load failed"); } });
  openCard(t); keep(t); await go(t);
  assert.match(said(t), /^☁️ Can't reach the garden just now\. Your garden is still saved on this device\. Your account is made, but your garden isn't in the cloud yet\. Keep your card, and press Try again on this device/);
  assert.equal(button(t.gardencard, "Cancel"), undefined);
  assert.ok(button(t.gardencard, "Done"), "a way out: the account exists, and the card signs in later");
  await go(t);
  assert.equal(t.cognito.signUps.length, 1);
  assert.equal(t.cognito.signIns.length, 2);
  assert.equal(said(t), "☁️ Your garden is saved in the cloud ✓");
});

test("Go can't be pressed twice while it works, and Cancel makes nothing and clears the card", async () => {
  let release; const held = new Promise(r => { release = r; });
  const t = cardGame({ signUp: () => held });
  openCard(t); keep(t);
  const b = button(t.gardencard, "Go to my garden");
  const first = b.onclick(); await tick();
  assert.equal(b.disabled, true);
  await b.onclick();
  assert.equal(t.cognito.signUps.length, 1, "one sign-up");
  release(); await first;

  const c = cardGame();
  openCard(c);
  button(c.gardencard, "Cancel").onclick();
  assert.equal(c.cardoverlay.style.display, "none");
  assert.equal(c.gardencard.kids.length, 0);
  assert.deepEqual(c.cognito.signUps, []);
});

test("a browser without randomness can't make a name, and says so calmly", () => {
  const t = cardGame();
  t.g.__window.crypto = undefined;
  t.g.showGardenRoller();
  assert.equal(t.authbox.textContent, "🌱 This browser can't make a garden name. Keep playing as a guest: your garden is saved on this device.");
});

test("signing in: forgiving boxes, one attempt, and a child never sees Cognito's words", async () => {
  const cases = [
    [{ code: "NotAuthorizedException", message: "Incorrect username or password." }, "🌱 That garden name and those secret words don't match. Check your card: capitals and spaces don't matter."],
    [{ code: "UserNotFoundException", message: "User does not exist." }, "🌱 That garden name and those secret words don't match. Check your card: capitals and spaces don't matter."],
    [{ code: "NotAuthorizedException", message: "Password attempts exceeded" }, "🌱 Too many tries. Wait a few minutes, then try again."],
    [{ code: "LimitExceededException", message: "Attempt limit exceeded, please try after some time." }, "🌱 Too many tries. Wait a few minutes, then try again."],
    [{ code: "TooManyRequestsException", message: "Rate exceeded" }, "🌱 Too many tries. Wait a few minutes, then try again."],
    [new TypeError("Failed to fetch"), "☁️ Can't reach the garden just now. Your garden is still saved on this device."],
    [{ code: "NetworkError", message: "Network error" }, "☁️ Can't reach the garden just now. Your garden is still saved on this device."],
    [{ code: "InternalErrorException", message: "An internal error occurred at arn:aws:..." }, "🌱 Something went wrong just now. Your garden is still saved on this device: try again in a moment."],
    [{}, "🌱 Something went wrong just now. Your garden is still saved on this device: try again in a moment."],
  ];
  const warn = console.warn; console.warn = () => {};
  try {
    for (const [err, want] of cases) {
      const t = cardGame({ signIn: async () => { throw err; } });
      const r = await t.g.signInWith(" Brave otter 42 ", "Acorn MAP tulip  wren");
      assert.deepEqual({ ...r }, { ok: false, msg: want }, JSON.stringify(err));
      assert.deepEqual(t.cognito.signIns, [["brave-otter-42", "acorn-map-tulip-wren"]], "one attempt, forgiven");
    }
  } finally { console.warn = warn; }
  const t = cardGame();
  assert.deepEqual({ ...await t.g.signInWith("", "") }, { ok: false, msg: "Type your garden name and the four secret words from your card." });
  assert.deepEqual(t.cognito.signIns, []);
});

test("Home's sign-in form and the landing screen's: no length limit, help for a lost card, the same forgiving sign-in", async () => {
  const t = cardGame({ landing: true, signIn: async () => { throw { code: "NotAuthorizedException" }; } });
  const { landingUser, landingPass, landingShow, landingMsg, landingLost } = t.elements;
  assert.equal(landingUser.attrs.maxlength, undefined); assert.notEqual(landingUser.maxLength, 24);
  assert.equal(landingUser.autocomplete, "username"); assert.equal(landingPass.autocomplete, "current-password");
  assert.equal(landingPass.type, "password");
  landingShow.onclick(); assert.equal(landingPass.type, "text", "the words can be shown to check them"); landingShow.onclick();
  assert.equal(landingLost.kids.length, 1, "boot put the lost-card help on the landing screen");   // built before this DOM was in place
  const lost = t.g.lostCardLink();
  assert.match(lost.textContent, /Without the card, that account can't be opened\./);
  assert.equal(byClass(lost, "hint").style.display, "none", "folded until asked for");
  button(lost, "Lost your card?").onclick();
  assert.equal(byClass(lost, "hint").style.display, "");
  landingUser.value = "BRAVE-OTTER-42"; landingPass.value = "acorn map tulip wren";
  await t.g.doLandingSignIn();
  assert.deepEqual(t.cognito.signIns, [["brave-otter-42", "acorn-map-tulip-wren"]]);
  assert.match(landingMsg.textContent, /don't match/);

  t.g.showSignInForm();
  const inputs = all(t.authbox).filter(e => e.tagName === "INPUT");
  assert.equal(inputs.length, 2);
  assert.ok(inputs.every(i => !i.maxLength && !i.attrs.maxlength), "no length limit");
  assert.match(t.authbox.textContent, /Lost your card\?/);
  assert.match(t.authbox.textContent, /On the device where you played, your garden may still be there/);
  inputs[0].value = "brave otter 42"; inputs[1].value = "ACORN MAP TULIP WREN";
  await button(t.authbox, "Sign in").onclick();
  assert.deepEqual(t.cognito.signIns.at(-1), ["brave-otter-42", "acorn-map-tulip-wren"]);
  assert.match(t.authbox.textContent, /don't match/);
  assert.doesNotMatch(t.authbox.textContent, /⚠️|Exception|Incorrect/);
});

test("the tick is held once Go is pressed: unticking mid-request can't strand Try again; the box is locked meanwhile", async () => {
  let release; const held = new Promise(r => { release = r; });
  let n = 0;
  const t = cardGame({ upload: async () => { if (++n === 1) { await held; return false; } return true; } });
  openCard(t); keep(t);
  const box = checkbox(t.gardencard);
  const pressing = go(t); await tick();
  assert.equal(box.disabled, true, "the box can't be changed while it works");
  box.checked = false; box.onchange();   // a child unticks it anyway
  release(); await pressing;
  const retry = button(t.gardencard, "Try again");
  assert.equal(retry.disabled, false, "Try again stays usable");
  await retry.onclick();
  assert.equal(said(t), "☁️ Your garden is saved in the cloud ✓");
});

test("the card uploads only to its own account: another tab's sign-in, or a sign-out, sends it back to its card", async () => {
  let n = 0;
  const t = cardGame({ upload: async () => ++n > 1 });
  const shown = openCard(t); keep(t); await go(t);
  assert.match(said(t), /isn't in the cloud yet/);
  t.session.user = "someone-else";   // another tab signed someone else in
  await go(t);
  assert.deepEqual(t.cognito.signIns.map(s => s[0]), [shown.toLowerCase(), shown.toLowerCase()], "the card signed in again, as itself");
  assert.equal(t.cognito.uploads, 2, "and only then uploaded (the fake upload checks the account)");
  // The real onSignedIn's own refusal, and its token check, are cloud-sync.test.mjs's.
});

test("the card is a modal dialog: the page behind is inert while it is up, and given back when it closes", () => {
  const t = cardGame();
  const behind = [el(), el()], before = el(); before.inert = true;   // one already inert stays inert
  const body = el("body"); body.children = [...behind, before, t.cardoverlay];
  Object.defineProperty(t.g.__window.document, "body", { value: body, configurable: true });
  openCard(t);
  assert.ok(behind.every(e => e.inert === true), "Home and the game can't be reached behind the card");
  assert.equal(t.cardoverlay.inert, undefined);
  button(t.gardencard, "Cancel").onclick();
  assert.ok(behind.every(e => e.inert === false));
  assert.equal(before.inert, true, "what was inert before stays inert");
});

test("the sign-in forms: busy forms can't be dismissed; every way out empties and hides the passphrase", async () => {
  let release; const held = new Promise(r => { release = r; });
  const t = cardGame({ landing: true, signIn: () => held });
  const { landingUser, landingPass, landingShow, landingBack } = t.elements;
  // boot wired these before the test's DOM existed: wire them the way it does, then exercise.
  t.g.setUpSignInBoxes(landingUser, landingPass, landingShow);
  landingShow.onclick(); assert.equal(landingPass.type, "text");
  landingPass.value = "acorn map tulip wren";
  t.g.clearPassBox(landingPass, landingShow);
  assert.deepEqual([landingPass.value, landingPass.type, landingShow.textContent], ["", "password", "👁️ Show"]);

  // Home's form: Cancel and Home's Close do nothing while the sign-in is out.
  t.g.onSignedIn = async () => ({ signedIn: true, saved: true });   // a sign-in's pull; cloud-sync.test.mjs has the real one
  t.g.showSignInForm();
  const [user, pass] = all(t.authbox).filter(e => e.tagName === "INPUT");
  user.value = "brave-otter-42"; pass.value = "acorn map tulip wren";
  const signing = button(t.authbox, "Sign in").onclick(); await tick();
  assert.equal(t.g.authBusy, 1);
  assert.equal(button(t.authbox, "Cancel").disabled, true);
  button(t.authbox, "Cancel").onclick();
  assert.equal(pass.value, "acorn map tulip wren", "Cancel did nothing mid-sign-in");
  t.elements.homeoverlay.style.display = "flex"; t.g.closeHome();
  assert.equal(t.elements.homeoverlay.style.display, "flex", "Home stays open until the sign-in is answered");
  release(); await signing;
  assert.equal(t.g.authBusy, 0);
  assert.equal(pass.value, "", "emptied once signed in");
  t.g.closeHome();
  assert.equal(t.elements.homeoverlay.style.display, "none", "and Home closes once it is answered");

  // A failing session lookup still gives the form back.
  const u = cardGame({ signIn: async () => {} });
  u.g.onSignedIn = async () => { throw new Error("storage refused"); };
  const warn = console.warn; console.warn = () => {};
  try { assert.deepEqual({ ...await u.g.signInWith("brave-otter-42", "acorn map tulip wren") }, { ok: false, msg: "🌱 Something went wrong just now. Your garden is still saved on this device: try again in a moment." }); }
  finally { console.warn = warn; }
  assert.equal(u.g.authBusy, 0);
});

test("an unfamiliar refusal after a lost answer settles nothing: one sign-up, the same card, Try again", async () => {
  const warn = console.warn; console.warn = () => {};
  try {
    for (const message of ["A challenge took too long to answer.", undefined, ""]) {
      let ins = 0;
      const t = cardGame({ signUp: async () => { throw new TypeError("Failed to fetch"); },
        signIn: async () => { if (++ins === 1) throw { code: "NotAuthorizedException", message }; } });
      const shown = openCard(t), words = byClass(face(t), "gcwords").textContent;
      keep(t); await go(t); await go(t);
      assert.equal(said(t), CANT_CHECK, `${JSON.stringify(message)}: keep this same card, and try again`);
      assert.equal(t.cognito.signUps.length, 1, `${JSON.stringify(message)}: no second sign-up`);
      assert.deepEqual([byClass(face(t), "gcname").textContent, byClass(face(t), "gcwords").textContent], [shown, words]);
      assert.equal(button(t.gardencard, "Try again").disabled, false);
      await go(t);   // now the card's words open it: it was made after all
      assert.equal(t.cognito.signUps.length, 1);
      assert.equal(t.cognito.uploads, 1);
      assert.equal(said(t), "☁️ Your garden is saved in the cloud ✓");
    }
  } finally { console.warn = warn; }
});

test("Done waits while a retry is out; pressed when idle it closes the card and leaves this device's garden as it was", async () => {
  let ins = 0, release; const held = new Promise(r => { release = r; });
  const t = cardGame({ signIn: async () => { ins++; if (ins === 1) throw new TypeError("Failed to fetch"); if (ins === 2) await held; } });
  openCard(t); keep(t); await go(t);
  const done = button(t.gardencard, "Done");
  const retry = go(t); await tick();
  assert.equal(done.disabled, true, "Done is off while the retry works");
  done.onclick();
  assert.equal(t.cardoverlay.style.display, "flex", "the card stays");
  release(); await retry;
  const u = cardGame({ signIn: async () => { throw new TypeError("Failed to fetch"); } });
  openCard(u); keep(u); await go(u);
  const garden = JSON.stringify(u.g.progress);
  button(u.gardencard, "Done").onclick();
  assert.equal(u.cardoverlay.style.display, "none");
  assert.equal(JSON.stringify(u.g.progress), garden, "this device's garden untouched");
});

test("the wired exits: the landing's Show then Back empties and hides the words; leaving Home mid-sign-in does nothing, idle it clears the form", async () => {
  let release; const held = new Promise(r => { release = r; });
  const t = cardGame({ landing: true, signIn: () => held });
  const { landingPass, landingShow, landingBack } = t.elements;   // boot wired these at load
  landingPass.value = "acorn map tulip wren";
  landingShow.onclick(); assert.equal(landingPass.type, "text");
  landingBack.onclick();
  assert.deepEqual([landingPass.value, landingPass.type, landingShow.textContent], ["", "password", "👁️ Show"]);
  t.g.onSignedIn = async () => ({ signedIn: true, saved: true });
  t.g.showSignInForm();
  const [user, pass] = all(t.authbox).filter(e => e.tagName === "INPUT");
  user.value = "brave-otter-42"; pass.value = "acorn map tulip wren";
  const signing = button(t.authbox, "Sign in").onclick(); await tick();
  t.elements.homeoverlay.style.display = "flex";
  const scope = JSON.stringify(t.g.activeScope);
  assert.equal(t.g.leaveHome(), false);
  t.g.openPkg("intro", 0); t.g.openStudio();
  assert.equal(t.elements.homeoverlay.style.display, "flex", "no package, Studio or quest while the sign-in is out");
  assert.equal(JSON.stringify(t.g.activeScope), scope);
  release(); await signing;
  t.g.showSignInForm();
  const [, pass2] = all(t.authbox).filter(e => e.tagName === "INPUT");
  pass2.value = "acorn map tulip wren";
  assert.equal(t.g.leaveHome(), true);
  assert.equal(all(t.authbox).filter(e => e.tagName === "INPUT").length, 0, "the form, and its words, are gone");
});

test("a sign-in whose session is gone before it can be used is not a sign-in: the landing form stays, with its words", async () => {
  const t = cardGame({ landing: true });
  t.g.onSignedIn = t.realOnSignedIn;   // the real one, which finds no usable session
  t.g.userPool = { getCurrentUser: () => ({ getUsername: () => "brave-otter-42", getSession: cb => cb(new Error("no session")) }) };
  const { landingUser, landingPass, landingMsg } = t.elements;
  landingUser.value = "brave-otter-42"; landingPass.value = "acorn map tulip wren";
  await t.g.doLandingSignIn();
  assert.equal(landingMsg.textContent, "🌱 Something went wrong just now. Your garden is still saved on this device: try again in a moment.");
  assert.equal(landingPass.value, "acorn map tulip wren", "kept, to try again");
});

test("a refused sign-up's screen keeps the dialog's name", async () => {
  const t = cardGame({ signUp: async () => { throw { code: "UserLambdaValidationException", message: "PreSignUp failed with error daily-signup-limit." }; } });
  openCard(t);
  assert.equal(t.gardencard.attrs["aria-labelledby"], "gctitle");
  keep(t); await go(t);
  assert.equal(face(t), undefined);
  assert.equal(t.gardencard.attrs["aria-labelledby"], undefined, "not pointing at a title that is gone");
  assert.equal(t.gardencard.attrs["aria-label"], "Tune Garden: no new account");
  button(t.gardencard, "Close").onclick();
  openCard(t);
  assert.deepEqual([t.gardencard.attrs["aria-labelledby"], t.gardencard.attrs["aria-label"]], ["gctitle", undefined], "a new card is named by its title again");
});

// ---------- PR review round 3 (TUN-93) ----------
test("an unsettled check says to keep the same card and try again — never that the words don't match", async () => {
  for (const message of ["A challenge took too long to answer.", undefined]) {
    const t = cardGame({ signUp: async () => { throw new TypeError("Failed to fetch"); },
      signIn: async () => { throw { code: "NotAuthorizedException", message }; } });
    openCard(t); keep(t); await go(t); await go(t);
    assert.equal(said(t), "🌱 The garden couldn't check your account just now. Keep this same card, and press Try again.");
    assert.doesNotMatch(said(t), /don't match/);
  }
});

test("through the real sync path: a session that can't be used makes the card sign in again with its words, and upload once", async () => {
  const t = cardGame({ signUp: async u => ({ userSub: "sub-" + u + "-1" }) });   // TUN-128: one name, subjects told apart
  t.session.subOf = n => "sub-" + n + "-1";
  t.g.onSignedIn = t.realOnSignedIn;
  openCard(t); keep(t);
  // Signed in, but the session breaks before the upload asks for it.
  const signIn = t.g.cogSignIn;
  t.g.cogSignIn = async (u, p) => { const s = await signIn(u, p); t.session.broken = true; return s; };
  await go(t);
  assert.match(said(t), /isn't in the cloud yet/);
  assert.ok(t.session.brokenHits > 0, "it got as far as the session that couldn't be used");
  assert.equal(t.session.requests.length, 0, "nothing was sent without a usable session");
  t.g.cogSignIn = signIn;
  await go(t);
  assert.equal(t.cognito.signUps.length, 1);
  const [name, password] = t.cognito.signUps[0];
  assert.equal(password, byClass(face(t), "gcwords").textContent.split(/\s+/).join("-"), "the card's own words");
  assert.deepEqual(t.cognito.signIns, [[name, password], [name, password]], "signed in again with the card's name and words");
  assert.deepEqual(t.session.requests.map(r => [r.method, r.token]), [["PUT", "Bearer token-" + name + ":sub-" + name + "-1"]], "one PUT, to the card's own account");
  assert.equal(said(t), "☁️ Your garden is saved in the cloud ✓");
});

test("the forms tell three outcomes apart: no session keeps Home's form and its words; a failed save is still a sign-in", async () => {
  // Home: the session can't be used after the sign-in — the form, its words and the message stay, Sign in usable.
  const t = cardGame();
  t.g.onSignedIn = t.realOnSignedIn;
  const signIn = t.g.cogSignIn;
  t.g.cogSignIn = async (u, p) => { const s = await signIn(u, p); t.session.broken = true; return s; };
  t.g.showSignInForm();
  const [user, pass] = all(t.authbox).filter(e => e.tagName === "INPUT");
  user.value = "brave-otter-42"; pass.value = "acorn map tulip wren";
  await button(t.authbox, "Sign in").onclick();
  assert.ok(t.session.brokenHits > 0, "it got as far as the session that couldn't be used");
  assert.ok(pass.parent, "the form is still on the page");
  assert.equal(pass.value, "acorn map tulip wren");
  assert.match(t.authbox.textContent, /Something went wrong just now/);
  assert.equal(button(t.authbox, "Sign in").disabled, false);
  // Landing: GET null, then the seed PUT refused — signed in, so the landing closes; the panel says the cloud is resting.
  const u = cardGame({ landing: true });
  u.g.onSignedIn = u.realOnSignedIn;
  u.session.api = method => (method === "GET" ? { ok: true, status: 200, json: async () => null } : { ok: false, status: 503, json: async () => ({}) });
  let hidden = 0; u.g.hideLanding = () => { hidden++; };
  u.elements.landingUser.value = "brave-otter-42"; u.elements.landingPass.value = "acorn map tulip wren";
  await u.g.doLandingSignIn();
  assert.equal(hidden, 1, "signed in: the landing goes");
  assert.equal(u.elements.landingPass.value, "", "and its words with it");
  assert.equal(u.elements.landingMsg.textContent, "");
  assert.match(u.authbox.textContent, /Signed in as .*the cloud is resting just now\. What you play is kept on this device/, "the panel shows the save failure");
});

test("the wired controls: Home's Close and backdrop wait for a sign-in; the landing reopens empty and masked; an older sign-in can't unlock a newer one", async () => {
  const homeclose = el("button");
  let release1, release2; const held1 = new Promise(r => { release1 = r; }), held2 = new Promise(r => { release2 = r; });
  let n = 0;
  const t = cardGame({ landing: true, signIn: () => (++n === 1 ? held1 : held2) });
  // homeclose is wired at load; this game's was a stub, so wire the fake the same way home.js does.
  homeclose.onclick = t.g.closeHome;
  t.g.onSignedIn = async () => ({ signedIn: true, saved: true });
  t.elements.homeoverlay.style.display = "flex";
  const first = t.g.signInWith("brave-otter-42", "acorn map tulip wren");
  const second = t.g.signInWith("calm-wren-10", "fig map oak ivy");
  await tick();
  assert.equal(t.g.authBusy, 2);
  homeclose.onclick(); t.elements.homeoverlay.onclick({ target: t.elements.homeoverlay });
  assert.equal(t.elements.homeoverlay.style.display, "flex", "Close and the backdrop wait");
  release1(); await first;
  assert.equal(t.g.authBusy, 1, "the older sign-in finishing doesn't unlock Home");
  homeclose.onclick();
  assert.equal(t.elements.homeoverlay.style.display, "flex");
  release2(); await second;
  t.elements.homeoverlay.onclick({ target: t.elements.homeoverlay });
  assert.equal(t.elements.homeoverlay.style.display, "none", "the backdrop closes Home once nothing is out");
  // The landing: Show, Back, then opened again — empty and masked.
  const { landingPass, landingShow, landingBack } = t.elements;
  landingPass.value = "acorn map tulip wren"; landingShow.onclick(); landingBack.onclick();
  t.g.__window.document.getElementById("landingSignin").onclick();
  assert.deepEqual([landingPass.value, landingPass.type], ["", "password"]);
});

// ---------- TUN-128: a tab's sync stays on the account its sign-in authenticated ----------
const inputs = root => all(root).filter(e => e.tagName === "INPUT");
// Home's panel: the guest row's Sign in opens the form; fill it and press its Sign in. { user, pass, done }.
function submitHome(t, name, words) {
  button(t.authbox, "Sign in").onclick();
  const [user, pass] = inputs(t.authbox); user.value = name; pass.value = words;
  return { user, pass, done: button(t.authbox, "Sign in").onclick() };
}
const SOMETHING = /Something went wrong just now/;

test("TUN-128 (48, 56): a lost sign-up's recovery keeps the sub it found; a replacement under the same name gets nothing", async () => {
  const t = cardGame({ signUp: async () => { throw new TypeError("Failed to fetch"); } });
  t.g.onSignedIn = t.realOnSignedIn;
  openCard(t); keep(t); await go(t);   // the sign-up's answer is lost
  // The recovery sign-in answers with the card's account; by the upload, the name is someone else's account.
  const signIn = t.g.cogSignIn;
  t.g.cogSignIn = async (u, p) => { const s = await signIn(u, p); t.session.subOf = n => "sub-" + n + "-reused"; return s; };
  await go(t);
  assert.ok(face(t), "the card survives");
  assert.equal(t.cognito.signIns.length, 2, "it noticed before uploading, and signed in again with its own words");
  assert.match(said(t), /isn't in the cloud yet/, "success withheld");
  assert.deepEqual(t.session.requests, [], "no PUT to the replacement");
  // Try again: the session and the storage now agree on the replacement — still not the card's account.
  t.g.cogSignIn = signIn;
  await go(t);
  assert.equal(said(t), CANT_CHECK + " " + "Your account is made, but your garden isn't in the cloud yet. Keep your card, and press Try again on this device to send your garden up.");
  assert.deepEqual(t.session.requests, [], "nothing sent to it on the retry either");
  assert.equal(t.cognito.signUps.length, 1);
});

test("TUN-128 (56): a recovery whose session names no account settles nothing; a sign-up's id the session contradicts uploads nothing", async () => {
  // Recovery: signed in, but the session says no name or sub — still uncertain: the same card, Cancel, no "made".
  const t = cardGame({ signUp: async () => { throw new TypeError("Failed to fetch"); } });
  openCard(t); keep(t); await go(t);
  const signIn = t.g.cogSignIn;
  t.g.cogSignIn = async (u, p) => { await signIn(u, p); return signedInSession({}); };
  await go(t);
  assert.equal(said(t), CANT_CHECK);
  assert.ok(button(t.gardencard, "Cancel"), "the account isn't known to exist: Cancel stays");
  assert.equal(button(t.gardencard, "Done"), undefined);
  assert.equal(t.cognito.uploads, 0);
  t.g.cogSignIn = signIn;
  await go(t);   // the session names it now: made, uploaded, one sign-up
  assert.equal(t.cognito.signUps.length, 1);
  assert.equal(t.cognito.uploads, 1);
  // Sign-up names one id; the sign-in's session another: no upload.
  const u = cardGame({ signUp: async n => ({ userSub: "sub-" + n + "-made" }) });
  openCard(u); keep(u); await go(u);
  assert.equal(u.cognito.uploads, 0, "not the account sign-up made");
  assert.match(said(u), /couldn't check your account/);
});

test("TUN-128 (51, 57): Home's form keeps its words, its message and Sign in when the account is lost after the first lookup", async () => {
  for (const when of ["at the load's own lookup", "while the load is out"]) {
    const t = cardGame();
    t.g.onSignedIn = t.realOnSignedIn;
    let release; const held = new Promise(r => { release = r; });
    if (when === "while the load is out") t.session.api = method => (method === "GET" ? held : { ok: true, status: 200, json: async () => ({ ok: true }) });
    else t.session.afterLookup = () => { t.session.afterLookup = null; t.session.user = null; };   // signed out between the two lookups
    t.g.renderAuth();
    const { user, pass, done } = submitHome(t, "brave-otter-42", "acorn map tulip wren");
    await tick();
    if (when === "while the load is out") {
      assert.ok(pass.parent, "the form stays up while the load is out");
      t.session.user = "calm-wren-10";   // another tab
      release({ ok: true, status: 200, json: async () => null });
    }
    await done;
    assert.ok(pass.parent, `${when}: the form is still on the page`);
    assert.deepEqual([user.value, pass.value], ["brave-otter-42", "acorn map tulip wren"], when);
    assert.match(byClass(t.authbox, "authmsg").textContent, SOMETHING, when);
    assert.equal(button(t.authbox, "Sign in").disabled, false, `${when}: Sign in usable`);
    assert.equal(t.g.cloudSync, "off");
    assert.equal(t.session.requests.filter(r => r.method === "PUT").length, 0);
  }
});

test("TUN-128 (51, 57; round 1, 4 and 6): reopening Home keeps a waiting form; a newer sign-in wins, and the older one leaves the form alone", async () => {
  let releaseA; const heldA = new Promise(r => { releaseA = r; });
  const t = cardGame({ landing: true });
  t.g.onSignedIn = t.realOnSignedIn;
  // A's authentication answers late, and (as GPT's case has it) with B still the stored account.
  const stub = t.g.cogSignIn;
  t.g.cogSignIn = async (u, p) => { if (u !== "brave-otter-42") return stub(u, p);
    await heldA; return signedInSession({ "cognito:username": u, sub: "sub-" + u }); };
  t.g.renderAuth();
  const a = submitHome(t, "brave-otter-42", "acorn map tulip wren"); await tick();
  // Home's button again, while A's sign-in waits: the same form, its words, its message, its buttons off, Home locked.
  t.g.openHome();
  assert.ok(a.pass.parent, "the waiting form is still the one on the page");
  assert.equal(inputs(t.authbox)[1], a.pass);
  assert.deepEqual([a.user.value, a.pass.value], ["brave-otter-42", "acorn map tulip wren"]);
  assert.equal(byClass(t.authbox, "authmsg").textContent, "Signing in…");
  assert.deepEqual([button(t.authbox, "Sign in").disabled, button(t.authbox, "Cancel").disabled], [true, true]);
  t.elements.homeoverlay.style.display = "flex";
  assert.equal(t.g.leaveHome(), false, "Home stays locked");
  // A newer sign-in (the landing's) begins after A's and finishes first: the tab is B's, and B's run doesn't draw over A's form.
  t.elements.landingUser.value = "calm-wren-10"; t.elements.landingPass.value = "fig map oak ivy";
  await t.g.doLandingSignIn();
  assert.equal(t.g.cloudSync, "ready");
  assert.equal(t.session.user, "calm-wren-10");
  assert.ok(a.pass.parent, "A's form is not replaced by B's panel");
  t.g.commitProgress();
  const before = JSON.stringify(t.g.progress), requests = t.session.requests.length;
  // A's authentication comes back last (with B still the stored account): it claims nothing.
  releaseA(); await a.done; await tick();
  assert.equal(t.g.cloudSync, "ready", "B's sync stands");
  assert.equal(JSON.stringify(t.g.progress), before);
  assert.equal(t.session.requests.length, requests, "nothing loaded or sent for A");
  assert.ok(a.pass.parent, "A's form stays, its words in it, to try again");
  assert.equal(byClass(t.authbox, "authmsg").textContent, REPLACED, "and says the newer sign-in took over");
  assert.deepEqual([a.user.value, a.pass.value], ["brave-otter-42", "acorn map tulip wren"]);
  assert.equal(button(t.authbox, "Sign in").disabled, false);
  assert.equal(t.g.authBusy, 0);
});

test("TUN-128 (50, 57): the landing's sign-in whose first save meets a lost account keeps its words; an offline one is still a sign-in", async () => {
  const landingGame = () => { const u = cardGame({ landing: true }); u.g.onSignedIn = u.realOnSignedIn; let hidden = 0; u.g.hideLanding = () => { hidden++; };
    u.elements.landingUser.value = "brave-otter-42"; u.elements.landingPass.value = "acorn map tulip wren"; return { u, hidden: () => hidden }; };
  // Nothing saved yet, so the first save goes up; nobody is signed in by the time it fails.
  { const { u, hidden } = landingGame();
    let release; const held = new Promise(r => { release = r; });
    u.session.api = method => (method === "GET" ? { ok: true, status: 200, json: async () => null } : held);
    const signing = u.g.doLandingSignIn(); for (let i = 0; i < 3; i++) await tick();
    u.session.user = null; release({ ok: false, status: 503, json: async () => ({}) });
    await signing;
    assert.equal(hidden(), 0, "the landing stays");
    assert.equal(u.elements.landingPass.value, "acorn map tulip wren", "with its words");
    assert.match(u.elements.landingMsg.textContent, SOMETHING);
    assert.equal(u.g.cloudSync, "off"); }
  // Still signed in, but the session can't be refreshed for the save: a sign-in; the panel says the cloud is resting.
  { const { u, hidden } = landingGame();
    u.session.api = method => { if (method === "GET") { u.session.broken = true; return { ok: true, status: 200, json: async () => null }; } return assert.fail("no PUT without a token"); };
    await u.g.doLandingSignIn();
    assert.equal(hidden(), 1);
    assert.equal(u.elements.landingPass.value, "");
    assert.match(u.authbox.textContent, /cloud is resting just now\. What you play is kept on this device/);
    assert.equal(u.g.cloudSync, "ready", "offline is not a lost account"); }
});

test("TUN-128 (58): the controls the game wires — Home's Close, backdrop, a package and the Studio, busy and idle; the landing's Show, Back and reopen", async () => {
  const homeclose = el("button"), pkglist = el(), landingSignin = el("button"), landingmain = el(), landingauth = el();
  let release; const held = new Promise(r => { release = r; });
  let n = 0;
  const t = cardGame({ landing: true, realMap: true, signIn: () => (++n === 1 ? held : undefined),
    extra: { homeclose, pkglist, landingSignin, landingmain, landingauth } });
  t.g.onSignedIn = async () => ({ signedIn: true, saved: true });
  const { landingPass, landingShow, landingBack } = t.elements;
  // The landing: Sign in shows the form; Show, Back, Sign in again — empty and masked, the main row back between.
  landingSignin.onclick();
  assert.deepEqual([landingmain.style.display, landingauth.style.display], ["none", ""]);
  landingPass.value = "acorn map tulip wren"; landingShow.onclick(); assert.equal(landingPass.type, "text");
  landingBack.onclick();
  assert.deepEqual([landingmain.style.display, landingauth.style.display], ["", "none"]);
  landingSignin.onclick();
  assert.deepEqual([landingmain.style.display, landingauth.style.display], ["none", ""]);
  assert.deepEqual([landingPass.value, landingPass.type, landingShow.textContent], ["", "password", "👁️ Show"]);
  // Home, with the map the game draws: a land's box carries the package's and the Studio's own buttons.
  t.g.openHome();
  // the map drawn last (Home redraws it on every opening)
  const press = id => { const svg = all(pkglist).find(e => e.tagName === "SVG");
    assert.ok(svg.html.includes(`data-pkg="${id}"`), `the map draws ${id}`);
    const cells = [...svg.html.matchAll(/data-pkg="([^"]+)"/g)].map(m => m[1]);
    const target = { closest: sel => (sel === "[data-pkg]" && cells.includes(id) ? { dataset: { pkg: id } } : null) };
    return svg.listeners.click[0]({ target, clientY: null }); };
  const studioBtn = () => { press("__studio"); return button(pkglist, "▶ Open Studio"); };
  const introBtn = () => { press("intro"); return all(pkglist).find(e => e.tagName === "BUTTON" && /^▶ (Play|Continue|Replay)$/.test(e.textContent)); };
  const scope = () => JSON.stringify(t.g.activeScope);
  // Busy: a Home sign-in is out. Nothing leaves Home; the form and its words stay.
  t.g.renderAuth();
  const { pass, done } = submitHome(t, "brave-otter-42", "acorn map tulip wren"); await tick();
  t.g.setPlayScope({ kind: "package", packageId: "footsteps" });   // neither the Studio nor the package pressed, so opening either would show
  const before = scope();
  for (const [what, press1] of [["Close", () => homeclose.onclick()], ["the backdrop", () => t.elements.homeoverlay.onclick({ target: t.elements.homeoverlay })],
    ["the Studio", () => studioBtn().onclick()], ["a package", () => introBtn().onclick()]]) {
    press1();
    assert.equal(t.elements.homeoverlay.style.display, "flex", `${what} waits`);
    assert.equal(scope(), before, `${what}: the scope is unchanged`);
  }
  assert.ok(pass.parent); assert.equal(pass.value, "acorn map tulip wren");
  release(); await done;
  // Idle: each way out leaves Home, takes the form and its words, and the form reopens empty and masked.
  const idle = (leave, check) => {
    t.g.openHome(); t.g.renderAuth(); button(t.authbox, "Sign in").onclick();
    const [, p] = inputs(t.authbox); p.value = "acorn map tulip wren"; p.type = "text";
    leave();
    assert.equal(t.elements.homeoverlay.style.display, "none");
    assert.equal(inputs(t.authbox).length, 0, "the form, and its words, are gone");
    if (check) check();
    t.g.openHome(); t.g.renderAuth(); button(t.authbox, "Sign in").onclick();
    const [, again] = inputs(t.authbox);
    assert.deepEqual([again.value, again.type], ["", "password"], "reopened empty and masked");
  };
  idle(() => homeclose.onclick());
  idle(() => t.elements.homeoverlay.onclick({ target: t.elements.homeoverlay }));
  idle(() => studioBtn().onclick(), () => assert.equal(t.g.activeScope.kind, "studio"));
  idle(() => introBtn().onclick(), () => assert.deepEqual([t.g.activeScope.kind, t.g.activeScope.packageId], ["package", "intro"]));
});

test("TUN-128 (53): the quest card and a quest-trail row on Home wait for a sign-in, and open their quest when idle", async () => {
  const QUESTS = ["intro", "footsteps", "follow-the-fireflies"];   // the profile tests/questauthoring.test.mjs offers two quests with
  for (const [what, quest, find] of [
    ["the quest card", "firefly-crossing", box => all(box).find(e => e.tagName === "BUTTON")],
    ["the quest-trail row", "waking-woods", box => {
      if (!all(box).some(k => /Waking Woods/.test(k.textContent || ""))) button(box, "Quest trail").onclick();
      const kids = box.kids, row = kids.findIndex(k => /Waking Woods/.test(k.textContent || ""));
      return kids.slice(row + 1).find(k => k.tagName === "BUTTON"); }],
  ]) {
    const questhome = el();
    let release; const held = new Promise(r => { release = r; });
    const t = cardGame({ signIn: () => held, extra: { questhome } });
    t.g.onSignedIn = async () => ({ signedIn: true, saved: true });
    // Opening a quest paints the grid, which this DOM has none of: only the painting is stood in.
    t.g.questPaintField = () => {};
    for (const id of QUESTS) t.g.progress.packages[id] = Object.assign(t.g.progress.packages[id] || {}, { completed: true });
    t.g.openHome(); t.elements.homeoverlay.style.display = "flex";
    assert.deepEqual(Object.keys(t.g.QUEST_RUNS), [], "no quest run yet");
    // Busy: a Home sign-in is out.
    t.g.renderAuth();
    const { done } = submitHome(t, "brave-otter-42", "acorn map tulip wren"); await tick();
    const before = JSON.stringify(t.g.activeScope);
    const btn = find(questhome);
    assert.ok(btn && !btn.disabled, `${what}: rendered and enabled`);
    btn.onclick();
    assert.equal(t.elements.homeoverlay.style.display, "flex", `${what}: Home stays open`);
    assert.equal(JSON.stringify(t.g.activeScope), before, `${what}: the scope is unchanged`);
    assert.deepEqual(Object.keys(t.g.QUEST_RUNS), [], `${what}: no quest run`);
    release(); await done;
    // Idle, with the words shown in Home's form: the same button opens the quest, and the form goes with Home.
    t.g.renderAuth(); button(t.authbox, "Sign in").onclick();
    const [, pass] = inputs(t.authbox); pass.value = "acorn map tulip wren"; pass.type = "text";
    find(questhome).onclick();
    assert.equal(t.elements.homeoverlay.style.display, "none", `${what}: Home closes`);
    const runs = Object.values(t.g.QUEST_RUNS);
    assert.deepEqual(runs.map(r => r.questId), [quest], `${what}: its quest's run`);
    assert.deepEqual([t.g.activeScope.kind, t.g.activeScope.questId, t.g.activeScope.runId], ["quest", quest, runs[0].runId], `${what}: and its scope`);
    t.g.openHome(); t.g.renderAuth(); button(t.authbox, "Sign in").onclick();
    const [, again] = inputs(t.authbox);
    assert.deepEqual([again.value, again.type], ["", "password"], `${what}: the form reopens empty and masked`);
  }
});

// ---------- TUN-128, PR review round 1 ----------
test("TUN-128 round 1 (6): reopening Home while the form's load is out keeps that form through a lost account; its retry then signs in", async () => {
  const t = cardGame();
  t.g.onSignedIn = t.realOnSignedIn;
  let release; const held = new Promise(r => { release = r; });
  let gets = 0;
  t.session.api = method => (method !== "GET" ? { ok: true, status: 200, json: async () => ({ ok: true }) }
    : ++gets === 1 ? held : { ok: true, status: 200, json: async () => null });
  t.g.renderAuth();
  const { user, pass, done } = submitHome(t, "brave-otter-42", "acorn map tulip wren"); await tick();
  t.g.openHome();   // Home's button, while the load is out
  assert.ok(pass.parent, "the form, not a loading row");
  t.session.user = "calm-wren-10";   // another tab
  release({ ok: true, status: 200, json: async () => null });
  await done;
  assert.ok(pass.parent, "still the child's form");
  assert.deepEqual([user.value, pass.value], ["brave-otter-42", "acorn map tulip wren"]);
  assert.match(byClass(t.authbox, "authmsg").textContent, SOMETHING);
  const retry = button(t.authbox, "Sign in");
  assert.equal(retry.disabled, false);
  await retry.onclick();   // the same form, pressed again
  assert.match(t.authbox.textContent, /Signed in as Brave-Otter-42/, "its own sign-in draws the signed-in row");
  assert.equal(t.g.cloudSync, "ready");
});

test("TUN-128 round 1: a session naming another account, with a sub, settles nothing on recovery and uploads nothing after sign-up", async () => {
  // Recovery after a lost sign-up answer: the words opened something, but its token names another account.
  const t = cardGame({ signUp: async () => { throw new TypeError("Failed to fetch"); } });
  openCard(t); keep(t); await go(t);
  const signIn = t.g.cogSignIn;
  t.g.cogSignIn = async (u, p) => { await signIn(u, p); return signedInSession({ "cognito:username": "someone-else-1", sub: "sub-someone-else" }); };
  await go(t);
  assert.equal(said(t), CANT_CHECK);
  assert.ok(button(t.gardencard, "Cancel"), "still uncertain: Cancel stays");
  assert.equal(t.cognito.uploads, 0);
  // A confirmed sign-up: its id is kept, and a sign-in whose token names another account sends nothing.
  const u = cardGame({ signUp: async n => ({ userSub: "sub-" + n }) });
  u.g.onSignedIn = u.realOnSignedIn;
  const signIn2 = u.g.cogSignIn;
  u.g.cogSignIn = async (n, p) => { await signIn2(n, p); return signedInSession({ "cognito:username": "someone-else-1", sub: "sub-" + n }); };
  openCard(u); keep(u); await go(u);
  assert.match(said(u), /couldn't check your account/);
  assert.deepEqual(u.session.requests, [], "nothing sent");
  u.g.cogSignIn = signIn2;
  await go(u);   // the card's own account now: one PUT, with the sub sign-up gave
  const name = u.cognito.signUps[0][0];
  assert.deepEqual(u.session.requests.map(r => [r.method, r.token]), [["PUT", "Bearer token-" + name + ":sub-" + name]]);
});

// ---------- TUN-128, PR review round 2 ----------
const REPLACED = "🌱 A newer sign-in took over. To open this garden instead, press Sign in again.";

test("TUN-128 round 2 (2): an older sign-in at its load when a newer one begins applies nothing, and leaves the newer form and the lock alone", async () => {
  // A: Home's form, its GET held. B: the landing's sign-in, held in authentication. (While A loads, Home shows A's
  // loading row, so a newer sign-in can only come from the landing.)
  const t = cardGame({ landing: true });
  t.g.onSignedIn = t.realOnSignedIn;
  let releaseGet; const heldGet = new Promise(r => { releaseGet = r; });
  t.session.api = method => (method === "GET" ? heldGet : { ok: true, status: 200, json: async () => ({ ok: true }) });
  let releaseB; const heldB = new Promise(r => { releaseB = r; });
  const stub = t.g.cogSignIn;
  t.g.cogSignIn = async (u, p) => { if (u === "calm-wren-10") await heldB; return stub(u, p); };
  const before = JSON.stringify(t.g.progress), narrate = t.g.narrateReady;
  let applied = 0; const apply = t.g.applyProgress; t.g.applyProgress = () => { applied++; apply(); };
  t.g.renderAuth();
  const a = submitHome(t, "brave-otter-42", "acorn map tulip wren"); for (let i = 0; i < 3; i++) await tick();
  const { landingUser, landingPass, landingMsg, landingBack } = t.elements;
  landingUser.value = "calm-wren-10"; landingPass.value = "fig map oak ivy";
  const b = t.g.doLandingSignIn(); await tick();
  releaseGet({ ok: true, status: 200, json: async () => ({ v: 1, packages: { intro: { level: 9 } } }) });
  await a.done; await tick();
  assert.equal(JSON.stringify(t.g.progress), before, "A's load not applied");
  assert.equal(applied, 0); assert.equal(t.g.narrateReady, narrate);
  assert.equal(t.session.requests.filter(r => r.method === "PUT").length, 0, "no first save for A");
  assert.equal(byClass(t.authbox, "authmsg").textContent, REPLACED, "A's form says what happened");
  assert.deepEqual([a.user.value, a.pass.value], ["brave-otter-42", "acorn map tulip wren"]);
  assert.deepEqual([landingUser.value, landingPass.value, landingMsg.textContent], ["calm-wren-10", "fig map oak ivy", "Signing in…"], "B's form untouched");
  assert.equal(landingBack.disabled, true, "B's Back still off");
  t.elements.homeoverlay.style.display = "flex";
  assert.equal(t.g.leaveHome(), false, "Home stays locked while B is out");
  releaseB(); await b;
  assert.equal(t.g.cloudSync, "ready");
  assert.equal(t.session.user, "calm-wren-10");
});

test("TUN-128 round 2 (2): a superseded sign-in's form says the newer one took over, whether its words were refused or accepted", async () => {
  for (const outcome of ["refused", "accepted"]) {
    const t = cardGame({ landing: true });
    t.g.onSignedIn = t.realOnSignedIn;
    let releaseA; const heldA = new Promise(r => { releaseA = r; });
    const stub = t.g.cogSignIn;
    t.g.cogSignIn = async (u, p) => { if (u !== "brave-otter-42") return stub(u, p);
      await heldA; if (outcome === "refused") throw { code: "NotAuthorizedException", message: "Incorrect username or password." };
      return signedInSession({ "cognito:username": u, sub: "sub-" + u }); };
    t.g.renderAuth();
    const a = submitHome(t, "brave-otter-42", "acorn map tulip wren"); await tick();
    t.elements.landingUser.value = "calm-wren-10"; t.elements.landingPass.value = "fig map oak ivy";
    await t.g.doLandingSignIn();
    releaseA(); await a.done;
    assert.equal(byClass(t.authbox, "authmsg").textContent, REPLACED, outcome);
    assert.deepEqual([a.user.value, a.pass.value], ["brave-otter-42", "acorn map tulip wren"], outcome);
    assert.equal(button(t.authbox, "Sign in").disabled, false, outcome);
    assert.equal(t.g.cloudSync, "ready", `${outcome}: the newer sign-in's sync stands`);
  }
});

test("TUN-128 round 2 (3): Home's form, offline at its load's lookup and then another account: the form, its words and its retry stay", async () => {
  const t = cardGame();
  t.g.onSignedIn = t.realOnSignedIn;
  // The first lookup answers; the load's own lookup is offline (still this account); then another tab switches.
  t.session.afterLookup = () => { t.session.broken = true; t.session.afterLookup = () => { t.session.afterLookup = null; t.session.user = "calm-wren-10"; }; };
  t.g.renderAuth();
  const { user, pass, done } = submitHome(t, "brave-otter-42", "acorn map tulip wren");
  await done;
  assert.ok(t.session.brokenHits > 0, "the load's lookup was the offline one");
  assert.ok(pass.parent);
  assert.deepEqual([user.value, pass.value], ["brave-otter-42", "acorn map tulip wren"]);
  assert.match(byClass(t.authbox, "authmsg").textContent, SOMETHING);
  assert.equal(button(t.authbox, "Sign in").disabled, false);
  assert.equal(t.g.cloudSync, "off");
});

test("TUN-128 round 2 (4): a loss only the final redraw finds puts Home's form back, words and retry, and the card credits nothing", async () => {
  const t = cardGame();
  t.g.onSignedIn = t.realOnSignedIn;
  t.session.api = method => { if (method === "GET") {   // a failed load; the redraw that would show it is the first to see the switch
      const render = t.g.renderAuth; t.g.renderAuth = s => { t.g.renderAuth = render; t.session.user = "calm-wren-10"; render(s); };
      return { ok: false, status: 503, json: async () => ({}) }; }
    return { ok: true, status: 200, json: async () => ({ ok: true }) }; };
  t.g.renderAuth();
  const { user, pass, done } = submitHome(t, "brave-otter-42", "acorn map tulip wren");
  await done;
  assert.ok(pass.parent, "the form is back on the page");
  assert.deepEqual([user.value, pass.value], ["brave-otter-42", "acorn map tulip wren"]);
  assert.match(byClass(t.authbox, "authmsg").textContent, SOMETHING);
  assert.equal(button(t.authbox, "Sign in").disabled, false);
  assert.equal(t.g.cloudSync, "off");
  // The garden card: its first save goes up, then the redraw finds another account — "not saved", Try again.
  const u = cardGame();
  u.g.onSignedIn = u.realOnSignedIn;
  u.session.api = method => { if (method === "PUT") {
      const render = u.g.renderAuth; u.g.renderAuth = s => { u.g.renderAuth = render; u.session.user = "calm-wren-10"; render(s); }; }
    return { ok: true, status: 200, json: async () => ({ ok: true }) }; };
  openCard(u); keep(u); await go(u);
  assert.match(said(u), /isn't in the cloud yet/, "no credit for a run the game ended");
});
