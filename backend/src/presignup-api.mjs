// Cognito's Pre sign-up trigger (template.yaml: PreSignUpFn): auto-confirm each new account — no email step —
// and, since TUN-88, refuse sign-ups past DAILY_SIGNUP_LIMIT a UTC day. Since TUN-93 an account holds nothing
// personal: its username must be a generated garden name, and a sign-up carrying an email, a phone number or a
// free-text profile attribute is refused — the game's own sign-up and the owner's AdminCreateUser alike, both
// before anything is counted. The logic, without the AWS SDK:
// presignup.mjs passes in `counter` ({ add(params, signal) } over a plain DocumentClient UpdateItem parameter
// object), so tests/backend-presignup.test.mjs can drive it. backend/README.md § The daily sign-up limit is
// the runbook; reviews/TUN-88-daily-signup-limit.md the design and the arithmetic.
//
// Cognito hands a thrown error's message to the browser as "PreSignUp failed with error <message>.", so a
// refusal's message is always one of the fixed tokens below, never an AWS error (those go to CloudWatch).
// js/cloud.js shows FULL as "the garden is full today"; every other refusal as "not taking new accounts".
import { isGardenName } from "./garden-words.mjs";

export const FULL = "daily-signup-limit";
export const UNAVAILABLE = "signup-counter-unavailable";
export const UNSUPPORTED = "signup-source-unsupported";
export const NOT_GARDEN_NAME = "signup-not-garden-name";
export const HAS_ATTRIBUTES = "signup-has-attributes";
// Cognito's standard attributes that hold something a person could type, or that identify them. Named, rather
// than "any key at all", so an attribute Cognito itself puts in the event can never refuse every sign-up.
export const REFUSED_ATTRIBUTES = Object.freeze(["email", "phone_number", "name", "given_name", "family_name",
  "middle_name", "nickname", "preferred_username", "profile", "picture", "website", "gender", "birthdate",
  "address", "zoneinfo", "locale"]);

const DAY_MS = 86_400_000;
export const KEEP_DAYS = 3;          // a day's counter row expires (DynamoDB TTL) 3 days after the day starts
// Cognito waits 5 s for the trigger and may retry it. One attempt (a retried increment would count twice),
// short socket timeouts, and an overall deadline well inside the 5 s.
export const DEADLINE_MS = 2500;
export const CLIENT_OPTIONS = { maxAttempts: 1, requestHandler: { connectionTimeout: 1000, requestTimeout: 1500, throwOnRequestTimeout: true } };

export const utcDay = ms => new Date(ms).toISOString().slice(0, 10);

// The deploy settings. Anything but a whole number ≥ 0 and a table name is a broken deploy: every sign-up is
// then refused UNAVAILABLE (failing closed — a broken deploy must not switch the limit off unseen).
export function signUpConfig(env = {}) {
  const raw = env.DAILY_SIGNUP_LIMIT, table = env.SIGNUP_COUNT_TABLE;
  const limit = typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(limit) || typeof table !== "string" || !table.trim()) return { ok: false };
  return { ok: true, limit, table };
}

// One atomic UpdateItem: add 1 to the day's count unless it has reached the limit. The expiry is set once,
// from the day itself, so every write to a day's row agrees on it.
export function counterParams(table, limit, ms) {
  const dayStart = Math.floor(ms / DAY_MS) * DAY_MS;
  return {
    TableName: table,
    Key: { day: utcDay(ms) },
    UpdateExpression: "SET #e = if_not_exists(#e, :exp) ADD #n :one",
    ConditionExpression: "attribute_not_exists(#n) OR #n < :max",
    ExpressionAttributeNames: { "#n": "signups", "#e": "expiresAt" },
    ExpressionAttributeValues: { ":one": 1, ":max": limit, ":exp": dayStart / 1000 + KEEP_DAYS * 86_400 },
  };
}

// A refusal: its message is all Cognito passes on, and a one-line stack keeps its log record small (a flood of
// refusals is billed per byte logged — the arithmetic in the review record).
function refusal(token) { const e = new Error(token); e.stack = `Error: ${token}`; return e; }

// The call gets `ms`; then its AbortSignal fires (the SDK drops the request) and the sign-up is refused. A write
// AWS had already received may still apply: that sign-up is counted but refused — the safe direction.
function withDeadline(fn, ms) {
  const ac = new AbortController(); let timer;
  const op = Promise.resolve().then(() => fn(ac.signal));
  op.catch(() => {});   // a failure after the deadline has nobody waiting for it
  const late = new Promise((_, reject) => {
    timer = setTimeout(() => { const e = new Error(`timed out after ${ms} ms`); e.name = "DeadlineExceeded"; ac.abort(e); reject(e); }, ms);
  });
  return Promise.race([op, late]).finally(() => clearTimeout(timer));
}

function confirm(event) {
  event.response = event.response || {};
  event.response.autoConfirmUser = true;
  return event;
}

// The account rules (TUN-93): the refusal's token, or null. The username is lower-cased first — Cognito hands a
// case-insensitive pool's triggers the lower-case form, and this check must not depend on that. Only attribute
// NAMES are logged, never their values.
function accountRuleBroken(event, log) {
  const name = typeof event.userName === "string" ? event.userName.toLowerCase() : "";
  if (!isGardenName(name)) return NOT_GARDEN_NAME;
  const attrs = event.request && event.request.userAttributes;
  const given = attrs && typeof attrs === "object" ? REFUSED_ATTRIBUTES.filter(k => Object.hasOwn(attrs, k)) : [];
  if (given.length) { log.log("presignup: refused attributes", given.join(",")); return HAS_ATTRIBUTES; }
  return null;
}

export function makePreSignUpHandler(counter, { config, now = Date.now, deadlineMs = DEADLINE_MS, log = console } = {}) {
  let fullDay = null;   // the UTC day this container last saw refused by the condition: later refusals skip DynamoDB
  return async (event) => {
    const ms = now();   // one clock read: the day counted, its expiry and the day marked full all come from it
    const source = event && event.triggerSource;
    // The game's sign-up and the owner's own AdminCreateUser are the only sources this pool should send; the
    // backend refuses what it doesn't know.
    if (source !== "PreSignUp_SignUp" && source !== "PreSignUp_AdminCreateUser") {
      log.error("presignup: refused trigger source", String(source).slice(0, 64));
      throw refusal(UNSUPPORTED);
    }
    const broken = accountRuleBroken(event, log);
    if (broken) throw refusal(broken);
    // AdminCreateUser (it needs IAM credentials) is not counted. Cognito ignores the confirm flags for it, as it
    // always did.
    if (source === "PreSignUp_AdminCreateUser") return confirm(event);
    if (!config || !config.ok) {
      log.error("presignup: DAILY_SIGNUP_LIMIT or SIGNUP_COUNT_TABLE is not set right; refusing every sign-up");
      throw refusal(UNAVAILABLE);
    }
    const day = utcDay(ms);
    if (config.limit === 0 || fullDay === day) throw refusal(FULL);
    try {
      await withDeadline(signal => counter.add(counterParams(config.table, config.limit, ms), signal), deadlineMs);
    } catch (e) {
      if (e && e.name === "ConditionalCheckFailedException") {
        fullDay = day;
        log.log(`presignup: ${day} has had its ${config.limit} sign-ups; refusing until the next UTC day`);
        throw refusal(FULL);
      }
      log.error("presignup: the sign-up counter failed; refusing", e && e.name, e && e.message);
      throw refusal(UNAVAILABLE);
    }
    return confirm(event);
  };
}

// The real SDK, in the shape the handler takes. Tests pass a recording client.
export function sdkAdapter(client, UpdateCommand) {
  return { add: (params, signal) => client.send(new UpdateCommand(params), { abortSignal: signal }) };
}
