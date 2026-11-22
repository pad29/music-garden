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
    setAttribute(k, v) { e.attrs[k] = String(v); },
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
  const authbox = el(), cardoverlay = el(), gardencard = el();
  const elements = { authbox, cardoverlay, gardencard };
  if (landing) for (const id of ["landingUser", "landingPass", "landingShow", "landingMsg", "landingLost"]) elements[id] = el(id === "landingShow" ? "button" : id.includes("Msg") || id.includes("Lost") ? "div" : "input");
  const g = loadGame({ fresh: true, elements, setup: w => {
    w.crypto = webcrypto; w.Uint32Array = Uint32Array;
    w.AmazonCognitoIdentity = { CognitoUserPool: class { getCurrentUser() { return null; } } };
  } });
  const doc = g.__window.document;
  Object.defineProperty(doc, "createElement", { value: tag => el(tag), configurable: true });
  Object.defineProperty(doc, "createTextNode", { value: t => ({ textContent: String(t) }), configurable: true });
  const cognito = { signUps: [], signIns: [], uploads: 0 };
  g.cogSignUp = async (u, p) => { cognito.signUps.push([u, p]); return signUp(u, p); };
  g.cogSignIn = async (u, p) => { cognito.signIns.push([u, p]); return signIn(u, p); };
  g.onSignedIn = async up => { assert.equal(up, true, "a new garden uploads this device's"); cognito.uploads++; return upload(); };
  g.renderPkgs = () => {};
  return { g, authbox, cardoverlay, gardencard, cognito, elements };
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

test("taken names: a number is never tried twice, and after five a whole new name is rolled", () => {
  const t = cardGame();
  const a = t.g.gardenAttempt("brave-otter-42", ["acorn", "map", "tulip", "wren"]);
  // pick() scripted: numbers by index into GARDEN_NUMBERS, and for the fifth a new pair.
  const NUM = [...t.g.GARDEN_NUMBERS], ADJ = [...t.g.GARDEN_ADJECTIVES], NOUN = [...t.g.GARDEN_NOUNS];
  const ix = x => NUM.indexOf(x);
  // 1st: 42 is the name already tried, so 50. 2nd: 42 and 50 tried, so 51. 3rd: 52. 4th: 53. 5th: a new pair and number.
  const script = [ix(42), ix(50), ix(42), ix(50), ix(51), ix(52), ix(53), ADJ.indexOf("calm"), NOUN.indexOf("wren"), ix(10)];
  let i = 0; const pick = () => script[i++];
  const names = [];
  for (let k = 0; k < 5; k++) names.push(t.g.nextGardenName(a, pick));
  assert.deepEqual(names, ["brave-otter-50", "brave-otter-51", "brave-otter-52", "brave-otter-53", "calm-wren-10"]);
  assert.equal(i, script.length, "every draw used: the tried numbers were drawn and thrown back");
  assert.equal(a.name, "calm-wren-10");
  assert.equal(a.taken, 5);
});

test("a lost answer keeps the card; trying again with the same card finds out whether the account was made", async () => {
  // 1) lost, then "taken": the card's own words open it, so it was this card's account all along.
  let n = 0;
  const t = cardGame({ signUp: async () => { if (++n === 1) throw new TypeError("Failed to fetch"); throw { code: "UsernameExistsException" }; } });
  const shown = openCard(t);
  keep(t); await go(t);
  assert.equal(said(t), "☁️ Can't reach the garden just now. Keep your card, and press Try again.");
  assert.equal(byClass(face(t), "gcname").textContent, shown, "the same card");
  assert.ok(button(t.gardencard, "Try again"), "Try again, with the same words");
  assert.ok(button(t.gardencard, "Cancel"), "not made as far as anyone knows: still cancellable");
  await go(t);
  assert.equal(t.cognito.signUps.length, 2);
  assert.equal(t.cognito.signIns.length, 1, "one sign-in, which proved the account");
  assert.equal(t.cognito.uploads, 1);
  assert.equal(said(t), "☁️ Your garden is saved in the cloud ✓");

  // 2) lost, then "taken", and the card's words do not open it: someone else has the name.
  let m = 0;
  const u = cardGame({ signUp: async () => { if (++m === 1) throw { code: "NetworkError", message: "Network error" }; if (m === 2) throw { code: "UsernameExistsException" }; },
    signIn: async () => { if (u.cognito.signIns.length === 1) throw { code: "NotAuthorizedException", message: "Incorrect username or password." }; } });
  const first = openCard(u);
  keep(u); await go(u); await go(u);
  assert.notEqual(byClass(face(u), "gcname").textContent, first, "a new number");
  assert.equal(byClass(u.gardencard, "gcnotice").textContent, "Someone just took that name, so here is your new card. Keep this one.");
  assert.equal(u.cognito.uploads, 0);
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
  assert.equal(t.cognito.signIns.length, 1, "nor signed into twice");
  assert.equal(t.cognito.uploads, 2);
  assert.equal(said(t), "☁️ Your garden is saved in the cloud ✓");
  assert.equal(all(t.gardencard).filter(e => e.tagName === "BUTTON" && e.textContent === "Done").length, 1, "one Done button");
});

test("a sign-in that fails after the account was made tries only the sign-in again", async () => {
  let n = 0;
  const t = cardGame({ signIn: async () => { if (++n === 1) throw new TypeError("Load failed"); } });
  openCard(t); keep(t); await go(t);
  assert.equal(said(t), "☁️ Can't reach the garden just now. Your garden is still saved on this device.");
  assert.equal(button(t.gardencard, "Cancel"), undefined);
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
