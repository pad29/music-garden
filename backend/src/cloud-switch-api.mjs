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
// can never switch the cloud on. A direct invoke must be exactly {"switch":"off"|"on"|"status"}; anything
// else is refused and changes nothing. `publishedAt` is the newest record's SNS timestamp (NaN if unreadable).
export function readCommand(event, cfg) {
  if (event && typeof event === "object" && Array.isArray(event.Records)) {
    const ours = event.Records.filter(r => r && r.EventSource === "aws:sns" && r.Sns && r.Sns.TopicArn === cfg.alarmTopicArn);
    if (!ours.length) return { ignore: "no record from the alarm topic" };
    const times = ours.map(r => Date.parse(r.Sns.Timestamp)).filter(Number.isFinite);
    const s = ours[0].Sns;
    const said = String(s.Subject || s.Message || "").replace(/\s+/g, " ").slice(0, 200);
    return { action: "off", publishedAt: times.length ? Math.max(...times) : NaN,
      why: `a message on the alarm topic (the $30 budget, or a rehearsal): "${said}"` };
  }
  if (event && typeof event === "object" && !Array.isArray(event)) {
    const keys = Object.keys(event);
    if (keys.length === 1 && keys[0] === "switch" && ACTIONS.includes(event.switch)) return { action: event.switch, why: "the owner's command" };
  }
  return { refuse: true };
}

// A step that hangs must not stop the others, or the email: each gets `ms`, then its AbortSignal fires — the
// SDK stops the request and its retries (sdkAdapter passes the signal to every call) — and the step waits up
// to `graceMs` more for the call to settle before the read-back. Once the deadline has passed the step has
// FAILED, whatever the call does next: the command is NOT COMPLETE. The abort only stops this client; a
// request AWS had already received may still apply, possibly after the read-back (or after the grace runs
// out with the call unsettled). The runbook's status check a minute after every on or off is what shows it.
function capped(fn, ms, graceMs) {
  const ac = new AbortController(); let timer, graceTimer, timedOut = false;
  const op = Promise.resolve().then(() => fn(ac.signal));
  return new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      timedOut = true; const e = new Error(`timed out after ${ms} ms`); ac.abort(e);
      const grace = new Promise(r => { graceTimer = setTimeout(r, graceMs); });
      Promise.race([op.then(() => {}, () => {}), grace]).then(() => { clearTimeout(graceTimer); reject(e); });
    }, ms);
    op.then(v => { if (!timedOut) { clearTimeout(timer); resolve(v); } },
      err => { if (!timedOut) { clearTimeout(timer); reject(err); } });
  });
}
const why = e => (e && e.message) || String(e);

export function makeCloudSwitchHandler(aws, cfg) {
  const step = fn => capped(fn, cfg.stepMs, cfg.graceMs);
  const want = action => action === "off" ? { concurrency: 0, endpointDisabled: true }
    : { concurrency: cfg.onConcurrency, endpointDisabled: false };

  // Every setting, read back. A value that could not be read is an error string, never a guess.
  async function readState() {
    const [fns, ep] = await Promise.all([
      Promise.allSettled(cfg.functions.map(fn => step(s => aws.getConcurrency(fn, s)))),
      Promise.allSettled([step(s => aws.getEndpointDisabled(s))]),
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
    const now = aws.now(), at = new Date(now).toISOString();
    const cmd = readCommand(event, cfg);
    if (cmd.ignore) { console.log("ignored:", cmd.ignore); return { ignored: cmd.ignore }; }
    if (cmd.refuse) throw new Error('refused: send exactly {"switch":"off"}, {"switch":"on"} or {"switch":"status"}; nothing was changed');
    if (cmd.action === "status") { const state = await readState(); return { cloud: verdict(state), ...state }; }

    // A trip published before the owner's last switch-on is that switch-on's past, not a new alarm: Lambda
    // and SNS can deliver a message again, hours later, even after it was handled. The switch-on time is kept
    // in an SSM parameter. If it cannot be read, the trip acts — off is the safe side.
    let stateNote = "";
    if (Number.isFinite(cmd.publishedAt)) {
      let onAt = NaN;
      try { onAt = Date.parse(await step(s => aws.getOnAt(s))); }
      catch (e) { stateNote = `(The last switch-on time could not be read: ${why(e)}. Acted to be safe.)`; }
      if (Number.isFinite(onAt) && cmd.publishedAt <= onAt) {
        const published = new Date(cmd.publishedAt).toISOString(), on = new Date(onAt).toISOString();
        console.log("ignored a trip from before the last switch-on:", published, on);
        await step(sig => aws.notify("Tune Garden: an old cost-switch message was ignored",
          `At ${at} the cost switch received a trip message published at ${published}, before you switched the cloud `
          + `back on at ${on}, and ignored it: it is that switch-on's past, delivered again. Nothing was changed.\n\n`
          + `To see the switch's state, from backend/:\n  ${COMMAND.status}\n`, sig));   // a failure here throws: the retry emails again
        return { ignored: "published before the last switch-on", published, switchedOnAt: on };
      }
    }

    const w = want(cmd.action), ON = cmd.action === "on";
    const named = [...cfg.functions, "API default endpoint", ...(ON ? ["the switch-on time"] : [])];
    const writes = await Promise.allSettled([
      ...cfg.functions.map(fn => step(s => aws.putConcurrency(fn, w.concurrency, s))),
      step(s => aws.setEndpointDisabled(w.endpointDisabled, s)),
      ...(ON ? [step(s => aws.setOnAt(at, s))] : []),   // so a trip from before now is recognised as old
    ]);
    const failures = writes.flatMap((r, i) => r.status === "rejected" ? [`${named[i]}: ${why(r.reason)}`] : []);
    const state = await readState();
    const done = matches(state, w) && failures.length === 0;
    const subject = `Tune Garden: the cloud is switched ${ON ? "back ON" : "OFF"}${done ? "" : " — NOT COMPLETE"}`;
    const message = [
      ON ? "The cost switch has switched Tune Garden's cloud back ON." : "The cost switch has switched Tune Garden's cloud OFF.",
      `Why: ${cmd.why}.`, `When: ${at}.`, ...(stateNote ? [stateNote] : []), "", "Now:", describe(state), "",
      ...(failures.length ? ["Steps that failed:", ...failures.map(f => "  " + f), ""] : []),
      ...(done ? [] : ["Not everything took. Run the same command again, from backend/ in the repository:", `  ${COMMAND[cmd.action]}`, ""]),
      ON ? "Players' saves reach the cloud again. If this month's $30 alert has already fired, the budget will not trip the switch again until next month: watch the spend."
        : "Players keep playing as guests; signed-in players see that the cloud is resting. Nothing switches back on by itself.",
      ...(ON ? [] : ["", "To switch back on, read backend/README.md § The cost switch, then, from backend/:", `  ${COMMAND.on}`]),
    ].join("\n");
    let mailed = true;
    try { await step(sig => aws.notify(subject, message, sig)); }
    catch (e) { mailed = false; console.error("email failed:", e); }
    const result = { switched: cmd.action, done, mailed, cloud: verdict(state), ...state, failures };
    console.log(JSON.stringify(result));
    // A failure is the caller's to see: the CLI prints "FunctionError", and an SNS trip is retried.
    if (!done || !mailed) throw new Error(`${done ? "switched, but the email failed" : "not everything took"}: ${JSON.stringify(result)}`);
    return result;
  };
}

// The real AWS calls, given the SDK clients and command classes (cloud-switch.mjs passes the real ones; the
// tests pass recording ones). Every call carries the step's AbortSignal, so a deadline stops it and its retries.
export function sdkAdapter({ lambda, apigw, sns, ssm }, C, env, now = () => Date.now()) {
  const opt = signal => ({ abortSignal: signal });
  return {
    getConcurrency: async (fn, s) => (await lambda.send(new C.GetFunctionConcurrencyCommand({ FunctionName: fn }), opt(s))).ReservedConcurrentExecutions,
    putConcurrency: (fn, n, s) => lambda.send(new C.PutFunctionConcurrencyCommand({ FunctionName: fn, ReservedConcurrentExecutions: n }), opt(s)),
    getEndpointDisabled: async s => (await apigw.send(new C.GetApiCommand({ ApiId: env.API_ID }), opt(s))).DisableExecuteApiEndpoint === true,
    setEndpointDisabled: (disabled, s) => apigw.send(new C.UpdateApiCommand({ ApiId: env.API_ID, DisableExecuteApiEndpoint: disabled }), opt(s)),
    getOnAt: async s => (await ssm.send(new C.GetParameterCommand({ Name: env.STATE_PARAM }), opt(s))).Parameter.Value,
    setOnAt: (iso, s) => ssm.send(new C.PutParameterCommand({ Name: env.STATE_PARAM, Value: iso, Overwrite: true }), opt(s)),
    notify: (subject, message, s) => sns.send(new C.PublishCommand({ TopicArn: env.NOTICE_TOPIC_ARN, Subject: subject, Message: message }), opt(s)),
    now,
  };
}

// The handler's settings, from the function's environment (template.yaml: CloudSwitchFn).
export const switchConfig = env => ({
  functions: [env.PROGRESS_FN, env.SONGS_FN, env.PRESIGNUP_FN],
  onConcurrency: Number(env.ON_CONCURRENCY),
  alarmTopicArn: env.ALARM_TOPIC_ARN,
  stepMs: 10e3,   // + graceMs, ≤ 4 rounds (switch-on time, writes, read-back, email): 48 s, inside the 60-second Timeout
  graceMs: 2e3,
});
// SDK client options: at most 3 attempts, and a request that stalls fails instead of only warning.
export const CLIENT_OPTIONS = { maxAttempts: 3, requestHandler: { connectionTimeout: 3000, requestTimeout: 5000, throwOnRequestTimeout: true } };
