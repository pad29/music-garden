// Observe the ORIGINAL harness through node:vm's public entry points; no source rewriting.
// This is a synchronous diagnostic, not an alternative execution harness. Do not run it concurrently
// with another VM user in the same process. All interception is restored in finally.
//
// Limits: only executed synchronous paths, under the harness's browser stubs and default storage/URL.
// No lexical-read interception, browser callbacks, microtask checkpoints, CDN code or rendering.
// V8 enumerates lexical names after each script; newly introduced global-object properties are also
// owners (including explicit window assignments). Existing host properties and names deleted before
// a script finishes are not discovered. This is deliberately NOT a complete dependency analyzer.
// A distinct window proxy is needed: V8's contextified global bypasses `has` for `"x" in window`.
// Thus window/globalThis/self/top share an alias, but top-level `this === window` is not modeled.
import assert from 'node:assert';
import vm from 'node:vm';
import inspector from 'node:inspector';
import { loadGame } from '../harness.mjs';
import { gameScripts, ROOT } from './game-scripts.mjs';

let serial = 0;
export function observeLoadOrder({ root = ROOT, transform = s => s.src } = {}) {
  const { scripts } = gameScripts(root);
  const create = vm.createContext, run = vm.runInContext;
  const session = new inspector.Session();
  const label = `tune-garden-load-order-${++serial}`;
  let contextId, context, target, active = -1, ran = 0;
  const owners = new Map(), reads = [];
  const post = (method, params = {}) => {
    let done = false, failure, result;
    session.post(method, params, (err, value) => { done = true; failure = err; result = value; });
    assert.ok(done, `Inspector ${method} must complete synchronously`);
    if (failure) throw failure;
    return result;
  };
  session.connect();
  session.on('Runtime.executionContextCreated', ({ params }) => {
    if (params.context.name === label) contextId = params.context.id;
  });
  try {
    post('Runtime.enable');
    vm.createContext = (sandbox, options) => {
      assert.ok(!context, 'one harness context per observation');
      target = sandbox;
      // A Proxy global hides VM-supplied intrinsics; supply the same built-ins for missing names.
      const intrinsics = run('globalThis', create({}));
      for (const key of Object.getOwnPropertyNames(intrinsics)) {
        if (!(key in sandbox)) Object.defineProperty(sandbox, key,
          Object.getOwnPropertyDescriptor(intrinsics, key));
      }
      const record = (kind, name) => {
        if (active >= 0 && typeof name === 'string') reads.push({ index: active, kind, name });
      };
      const handlers = {
        get(t, key, receiver) { record('get', key); return Reflect.get(t, key, receiver); },
        has(t, key) { record('has', key); return Reflect.has(t, key); },
      };
      const alias = new Proxy(sandbox, handlers);
      for (const key of ['window', 'globalThis', 'self', 'top']) sandbox[key] = alias;
      for (const key of Object.getOwnPropertyNames(sandbox)) owners.set(key, -1);
      context = create(new Proxy(sandbox, handlers), { ...options, name: label });
      assert.ok(contextId, 'Inspector saw the harness context');
      return context;
    };
    vm.runInContext = (source, ctx, options) => {
      if (options?.filename === 'harness-collector') {
        assert.strictEqual(ran, scripts.length, 'every game script observed before collector');
        return run(source, ctx, options);
      }
      const index = ran++, script = scripts[index];
      assert.ok(script, 'unexpected VM execution');
      assert.strictEqual(ctx, context);
      assert.strictEqual(source, script.src, 'observe the exact source read by the harness');
      assert.strictEqual(options.filename, script.name);
      active = index;
      let result;
      try { result = run(transform(script, index), ctx, options); }
      finally { active = -1; }
      const lexical = post('Runtime.globalLexicalScopeNames', { executionContextId: contextId }).names;
      for (const key of [...Object.getOwnPropertyNames(target), ...lexical]) {
        if (!owners.has(key)) owners.set(key, index);
      }
      return result;
    };
    const game = loadGame({ root, fresh: true });
    assert.strictEqual(ran, scripts.length);
    const seen = new Set();
    const forward = reads.filter(r => owners.has(r.name) && owners.get(r.name) > r.index)
      .filter(r => { const key = `${r.index}:${r.kind}:${r.name}`;
        if (seen.has(key)) return false; seen.add(key); return true; })
      .map(r => ({ from: scripts[r.index].name, name: r.name, kind: r.kind,
        owner: scripts[owners.get(r.name)].name }));
    return { game, forward, reads, scripts, owners };
  } finally {
    active = -1;
    vm.createContext = create;
    vm.runInContext = run;
    session.disconnect();
  }
}

export function assertNoForwardReads(observation) {
  assert.deepEqual(observation.forward, [],
    'load-time global lookups reach later scripts: ' + JSON.stringify(observation.forward));
}
