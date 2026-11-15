// The cost switch (TUN-87). At $30 of actual spend in a month, AWS Budgets publishes to the alarm topic and
// this switches the cloud OFF: the game's three functions to reserved concurrency 0 (no Lambda runs, no
// DynamoDB, no new accounts — Cognito cannot run the sign-up trigger) and the API's default endpoint
// disabled. The owner switches it back ON with a direct invoke; nothing here ever switches on by itself.
// Pure — the AWS calls come in as `aws` — so tests/backend-cloud-switch.test.mjs runs it with no AWS.
// Runbook: backend/README.md § "The cost switch". Design: reviews/TUN-87-cloud-switch.md.

export const ACTIONS = ["off", "on", "status"];
export const COMMAND = {
  on: "aws lambda invoke --function-name music-garden-cloud-switch --payload fileb://events/switch-on.json on.json",
  off: "aws lambda invoke --function-name music-garden-cloud-switch --payload fileb://events/switch-off.json off.json",
  status: "aws lambda invoke --function-name music-garden-cloud-switch --payload fileb://events/switch-status.json status.json",
};

// What the event asks for. An SNS record from the alarm topic always means OFF, whatever it says — a message
// can never switch the cloud on. A record published longer ago than `staleMs` is ignored: Lambda and SNS can
// redeliver hours later, and an old trip must not undo the owner's later switch-on. A direct invoke must be
// exactly {"switch":"off"|"on"|"status"}; anything else is refused and changes nothing.
export function readCommand(event, cfg, now) {
  if (event && typeof event === "object" && Array.isArray(event.Records)) {
    const ours = event.Records.filter(r => r && r.EventSource === "aws:sns" && r.Sns && r.Sns.TopicArn === cfg.alarmTopicArn);
    if (!ours.length) return { ignore: "no record from the alarm topic" };
    const age = r => now - Date.parse(r.Sns.Timestamp);
    const fresh = ours.filter(r => age(r) >= -60e3 && age(r) <= cfg.staleMs);   // a minute of clock skew either way
    if (!fresh.length) return { stale: ours.map(r => String(r.Sns.Timestamp)) };
    const s = fresh[0].Sns;
    const said = String(s.Subject || s.Message || "").replace(/\s+/g, " ").slice(0, 200);
    return { action: "off", why: `a message on the alarm topic (the $30 budget, or a rehearsal): "${said}"` };
  }
  if (event && typeof event === "object" && !Array.isArray(event)) {
    const keys = Object.keys(event);
    if (keys.length === 1 && keys[0] === "switch" && ACTIONS.includes(event.switch)) return { action: event.switch, why: "the owner's command" };
  }
  return { refuse: true };
}

// A step that hangs must not stop the others, or the email: each is capped at `ms`.
function capped(fn, ms) {
  let timer;
  const limit = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`timed out after ${ms} ms`)), ms); });
  return Promise.race([Promise.resolve().then(fn), limit]).finally(() => clearTimeout(timer));
}
const why = e => (e && e.message) || String(e);

export function makeCloudSwitchHandler(aws, cfg) {
  const step = fn => capped(fn, cfg.stepMs);
  const want = action => action === "off" ? { concurrency: 0, endpointDisabled: true }
    : { concurrency: cfg.onConcurrency, endpointDisabled: false };

  // Every setting, read back. A value that could not be read is an error string, never a guess.
  async function readState() {
    const [fns, ep] = await Promise.all([
      Promise.allSettled(cfg.functions.map(fn => step(() => aws.getConcurrency(fn)))),
      Promise.allSettled([step(() => aws.getEndpointDisabled())]),
    ]);
    const functions = {};
    cfg.functions.forEach((fn, i) => {
      const r = fns[i];
      functions[fn] = r.status === "rejected" ? `unknown (${why(r.reason)})`
        : Number.isInteger(r.value) ? r.value : "unreserved";
    });
    const e = ep[0];
    const endpoint = e.status === "rejected" ? `unknown (${why(e.reason)})` : e.value === true ? "disabled" : "enabled";
    return { functions, endpoint };
  }
  const matches = (state, w) => Object.values(state.functions).every(n => n === w.concurrency)
    && state.endpoint === (w.endpointDisabled ? "disabled" : "enabled");
  const verdict = state => matches(state, want("off")) ? "off" : matches(state, want("on")) ? "on" : "mixed";
  const describe = state => [
    ...Object.entries(state.functions).map(([fn, n]) => `  ${fn}: reserved concurrency ${n}`),
    `  API default endpoint: ${state.endpoint}`,
  ].join("\n");

  return async function handler(event) {
    const configured = cfg.functions.length === 3 && cfg.functions.every(f => typeof f === "string" && f)
      && Number.isInteger(cfg.onConcurrency) && cfg.onConcurrency > 0 && !!cfg.alarmTopicArn;
    if (!configured) throw new Error("the switch is misconfigured (its environment); nothing was changed");
    const at = new Date(aws.now()).toISOString();
    const cmd = readCommand(event, cfg, aws.now());
    if (cmd.ignore) { console.log("ignored:", cmd.ignore); return { ignored: cmd.ignore }; }
    if (cmd.refuse) throw new Error('refused: send exactly {"switch":"off"}, {"switch":"on"} or {"switch":"status"}; nothing was changed');
    if (cmd.stale) {
      console.log("ignored an old trip message:", cmd.stale);
      try {
        await step(() => aws.notify("Tune Garden: an old cost-switch message was ignored",
          `At ${at} the cost switch received a trip message published at ${cmd.stale.join(", ")}, more than an hour ago, `
          + `and ignored it, so it cannot undo a later switch-on. Nothing was changed.\n\nTo see the switch's state:\n  ${COMMAND.status}\n`));
      } catch (e) { console.error("email failed:", e); }
      return { ignored: "old message", published: cmd.stale };
    }
    if (cmd.action === "status") { const state = await readState(); return { cloud: verdict(state), ...state }; }

    const w = want(cmd.action);
    const writes = await Promise.allSettled([
      ...cfg.functions.map(fn => step(() => aws.putConcurrency(fn, w.concurrency))),
      step(() => aws.setEndpointDisabled(w.endpointDisabled)),
    ]);
    const failures = writes.flatMap((r, i) => r.status === "rejected"
      ? [`${i < cfg.functions.length ? cfg.functions[i] : "API default endpoint"}: ${why(r.reason)}`] : []);
    const state = await readState();
    const done = matches(state, w);
    const OFF = cmd.action === "off";
    const subject = `Tune Garden: the cloud is switched ${OFF ? "OFF" : "back ON"}${done ? "" : " — NOT COMPLETE"}`;
    const message = [
      OFF ? "The cost switch has switched Tune Garden's cloud OFF." : "The cost switch has switched Tune Garden's cloud back ON.",
      `Why: ${cmd.why}.`, `When: ${at}.`, "", "Now:", describe(state), "",
      ...(failures.length ? ["Steps that failed:", ...failures.map(f => "  " + f), ""] : []),
      ...(done ? [] : [`Not every setting took. Run the same command again, from backend/ in the repository:`, `  ${COMMAND[cmd.action]}`, ""]),
      OFF ? "Players keep playing as guests; signed-in players see that the cloud is resting. Nothing switches back on by itself."
        : "Players' saves reach the cloud again. The $30 budget does not trip again this month: watch the spend.",
      ...(OFF ? ["", "To switch back on, read backend/README.md § The cost switch, then, from backend/:", `  ${COMMAND.on}`] : []),
    ].join("\n");
    let mailed = true;
    try { await step(() => aws.notify(subject, message)); }
    catch (e) { mailed = false; console.error("email failed:", e); }
    const result = { switched: cmd.action, done, mailed, cloud: verdict(state), ...state, failures };
    console.log(JSON.stringify(result));
    // A failure is the caller's to see: the CLI prints "FunctionError", and an SNS trip is retried.
    if (!done || !mailed) throw new Error(`${done ? "switched, but the email failed" : "not every setting took"}: ${JSON.stringify(result)}`);
    return result;
  };
}
