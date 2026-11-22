// TUN-93: making a garden (js/garden-card.js) and signing in (js/cloud.js signInWith, js/boot.js doLandingSignIn).
// The game runs in the harness with Cognito stubbed at the game's own seams (cogSignUp, cogSignIn, onSignedIn), and
// a small DOM of its own for the card's elements: the harness's stub elements forget every property set on them,
// and these tests press the card's buttons and read what it says. What Cognito itself sends and answers is
// cloud-resting.test.mjs's (the vendored library), and the upload is cloud-sync.test.mjs's.
import { test } from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { loadGame } from "./harness.mjs";

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
    get innerHTML() { return ""; }, set innerHTML(v) { e.textContent = ""; } };
  return e;
}
const all = (root, out = []) => { for (const k of root.kids || []) if (k && typeof k === "object" && k.tagName) { out.push(k); all(k, out); } return out; };
const button = (root, label) => all(root).find(e => e.tagName === "BUTTON" && e.textContent === label);
const byClass = (root, cls) => all(root).find(e => e.className.split(" ").includes(cls));
const checkbox = root => all(root).find(e => e.tagName === "INPUT" && e.type === "checkbox");
const tick = () => new Promise(r => setImmediate(r));

const CLOSED = "🌱 The garden isn't taking new accounts just now. Keep playing as a guest — your garden is saved on this device — and try again another day.";
const FULL = "🌱 So many new gardeners joined today that the garden is full! Keep playing as a guest — your garden is saved on this device — and make your account tomorrow.";

/** A game with the card's elements real enough to press; `cognito` records the calls the card makes. */
function cardGame({ signUp = async () => {}, signIn = async () => {}, upload = async () => true, landing = false } = {}) {
  const authbox = el(), cardoverlay = el(), gardencard = el(), homeoverlay = el();
  const elements = { authbox, cardoverlay, gardencard, homeoverlay };
  if (landing) for (const id of ["landingUser", "landingPass", "landingShow", "landingMsg", "landingLost", "landingBack"]) elements[id] = el(["landingShow", "landingBack"].includes(id) ? "button" : id.includes("Msg") || id.includes("Lost") ? "div" : "input");
  // Who the pool says is signed in: the session in the storage every tab shares. A sign-in sets it; a test may
  // change it, as another tab would.
  const session = { user: null };
  const g = loadGame({ fresh: true, elements, setup: w => {
    w.crypto = webcrypto; w.Uint32Array = Uint32Array;
    w.AmazonCognitoIdentity = { CognitoUserPool: class { getCurrentUser() {
      return session.user ? { getUsername: () => session.user, signOut() { session.user = null; } } : null; } } };
  } });
  const doc = g.__window.document;
  Object.defineProperty(doc, "createElement", { value: tag => el(tag), configurable: true });
  Object.defineProperty(doc, "createTextNode", { value: t => ({ textContent: String(t) }), configurable: true });
  const cognito = { signUps: [], signIns: [], uploads: 0 };
  g.cogSignUp = async (u, p) => { cognito.signUps.push([u, p]); return signUp(u, p); };
  g.cogSignIn = async (u, p) => { cognito.signIns.push([u, p]); await signIn(u, p); session.user = u; };
  const realOnSignedIn = g.onSignedIn;
  g.onSignedIn = async (up, onlyFor) => {
    assert.equal(up, true, "a new garden uploads this device's");
    assert.equal(onlyFor, session.user, "only to the account the card signed in to");
    cognito.uploads++; return upload(); };
  g.renderPkgs = () => {};
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
  t.g.onSignedIn = async () => {};   // a sign-in's pull; cloud-sync.test.mjs has the real one
  t.g.showSignInForm();
  const [user, pass] = all(t.authbox).filter(e => e.tagName === "INPUT");
  user.value = "brave-otter-42"; pass.value = "acorn map tulip wren";
  const signing = button(t.authbox, "Sign in").onclick(); await tick();
  assert.equal(t.g.authBusy, true);
  assert.equal(button(t.authbox, "Cancel").disabled, true);
  button(t.authbox, "Cancel").onclick();
  assert.equal(pass.value, "acorn map tulip wren", "Cancel did nothing mid-sign-in");
  t.elements.homeoverlay.style.display = "flex"; t.g.closeHome();
  assert.equal(t.elements.homeoverlay.style.display, "flex", "Home stays open until the sign-in is answered");
  release(); await signing;
  assert.equal(t.g.authBusy, false);
  assert.equal(pass.value, "", "emptied once signed in");
  t.g.closeHome();
  assert.equal(t.elements.homeoverlay.style.display, "none", "and Home closes once it is answered");

  // A failing session lookup still gives the form back.
  const u = cardGame({ signIn: async () => {} });
  u.g.onSignedIn = async () => { throw new Error("storage refused"); };
  const warn = console.warn; console.warn = () => {};
  try { assert.deepEqual({ ...await u.g.signInWith("brave-otter-42", "acorn map tulip wren") }, { ok: false, msg: "🌱 Something went wrong just now. Your garden is still saved on this device: try again in a moment." }); }
  finally { console.warn = warn; }
  assert.equal(u.g.authBusy, false);
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
  t.g.onSignedIn = async () => {};
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
