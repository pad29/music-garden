// TUN-7 counterparty tests. Only source transformations in memory; no game files are edited.
// Reuse the real harness's DOM/audio stubs, but intercept VM execution to report a failed script
// and CONTINUE with the next one. The event dispatcher below models only listener registration,
// window capture, and a target. It does not claim browser hit testing, default actions, audio,
// pointer capture, SDK internals, or native error-event provenance.
import { test } from 'node:test';
import assert from 'node:assert';
import vm from 'node:vm';
import { loadGame } from './harness.mjs';
import { gameScripts } from './helpers/game-scripts.mjs';

const scripts = gameScripts().scripts;
const GUARD = 'Tune Garden: a game script failed to load';
const ordinary = scripts.filter(s => !/load-gate|boot\.js/.test(s.name));
const positions = [ordinary[0].name, 'js/quest-engine.js', ordinary.at(-1).name];
const ignoreFailure = (src, name) => name === 'js/load-gate.js'
  ? src.replace('gameScriptFailed=true;', 'gameScriptFailed=false;') : src;

function simulate(options = {}) {
  const create = vm.createContext, run = vm.runInContext;
  const href = options.href || 'https://tunegarden.test/index.html';
  const listeners = [], registrations = [], errors = [], writes = [], attempted = [], timers = [];
  const nodes = new Map(), observers = [], remote = [], sessions = [];
  let sandbox, context, active = null, currentScript = null, serial = 0, timerSerial = 0;
  const capture = o => o === true || !!o?.capture;
  function add(target, type, fn, opts = {}) {
    const entry = { target, type: String(type), fn, capture: capture(opts), once: !!opts.once, source: active };
    if (!listeners.some(e => e.target === target && e.type === entry.type && e.fn === fn && e.capture === entry.capture)) {
      listeners.push(entry); registrations.push(entry);
    }
  }
  function remove(target, type, fn, opts) {
    const i = listeners.findIndex(e => e.target === target && e.type === type && e.fn === fn && e.capture === capture(opts));
    if (i >= 0) listeners.splice(i, 1);
  }
  function dispatch(type, target = sandbox, fields = {}) {
    let stopped = false;
    const event = { type, target, defaultPrevented: false, ...fields,
      stopImmediatePropagation() { stopped = true; }, stopPropagation() {},
      preventDefault() { this.defaultPrevented = true; } };
    const path = [
      ...listeners.filter(e => e.target === sandbox && e.capture && e.type === type),
      ...listeners.filter(e => e.type === type && e.target === target && !(target === sandbox && e.capture)),
    ];
    for (const entry of path) {
      if (stopped) break;
      if (!listeners.includes(entry)) continue;
      if (entry.once) remove(entry.target, entry.type, entry.fn, entry.capture);
      try { entry.fn.call(entry.target, event); }
      catch (error) { errors.push({ phase: 'callback', file: active, type, error }); }
    }
    return { stopped, event };
  }
  function wrap(backing, label) {
    const handlers = new Map();
    let node;
    node = new Proxy({}, {
      get(_t, key) {
        if (key === 'addEventListener') return (type, fn, opts) => add(node, type, fn, opts);
        if (key === 'removeEventListener') return (type, fn, opts) => remove(node, type, fn, opts);
        if (key === '__label') return label;
        if (handlers.has(key)) return handlers.get(key);
        return backing[key];
      },
      set(_t, key, value) {
        if (typeof key === 'string' && /^on[a-z]+$/.test(key)) {
          if (handlers.has(key)) remove(node, key.slice(2), handlers.get(key), false);
          handlers.set(key, value);
          if (typeof value === 'function') add(node, key.slice(2), value);
          return true;
        }
        backing[key] = value; return true;
      },
    });
    return node;
  }
  const read = source => run(source, context, { filename: 'review-probe' });
  const view = () => ({ sandbox, context, listeners, registrations, errors, writes, attempted, timers,
    nodes, observers, remote, sessions, dispatch, read });
  vm.createContext = (s, opts) => {
    sandbox = s;
    const oldDoc = s.document;
    s.location = { ...s.location, href, search: new URL(href).search, hash: new URL(href).hash };
    // ?reset asks before it wipes (TUN-84). Say yes, the worst case: these tests use ?reset precisely so a
    // boot that wrongly runs is caught writing.
    s.confirm = () => true;
    for (const [key, value] of Object.entries(options.storage || {})) s.localStorage.setItem(key, value);
    const set = s.localStorage.setItem;
    s.localStorage.setItem = (key, value) => { writes.push({ key, value: String(value), file: active }); return set(key, value); };
    if (options.storageThrows) s.localStorage.getItem = () => { throw new Error('storage unavailable'); };
    s.addEventListener = (type, fn, opts) => add(s, type, fn, opts);
    s.removeEventListener = (type, fn, opts) => remove(s, type, fn, opts);
    s.document = new Proxy({}, { get(_t, key) {
      if (key === 'currentScript') return currentScript;
      if (key === 'baseURI') return options.baseURI || href;
      if (key === 'hidden') return !!options.hidden;
      if (key === 'addEventListener') return (type, fn, opts) => add(s.document, type, fn, opts);
      if (key === 'removeEventListener') return (type, fn, opts) => remove(s.document, type, fn, opts);
      if (key === 'getElementById') return id => {
        if (!nodes.has(id)) nodes.set(id, wrap(oldDoc.getElementById(id), id));
        return nodes.get(id);
      };
      if (key === 'createElement' || key === 'createElementNS') return (...args) => wrap(oldDoc[key](...args), `created-${++serial}`);
      return oldDoc[key];
    } });
    s.setTimeout = (fn, delay) => { const id = ++timerSerial; timers.push({ id, fn, delay, file: active }); return id; };
    s.setInterval = s.setTimeout;
    s.clearTimeout = s.clearInterval = id => { const i = timers.findIndex(t => t.id === id); if (i >= 0) timers.splice(i, 1); };
    s.requestAnimationFrame = fn => s.setTimeout(fn, 0);
    s.cancelAnimationFrame = s.clearTimeout;
    if (options.resizeObserver) s.ResizeObserver = class { constructor(fn) { this.fn = fn; } observe() { observers.push(this.fn); } };
    if (options.speech === false) delete s.speechSynthesis;
    else s.speechSynthesis = { getVoices: () => [{ name: 'English', lang: 'en-US' }], cancel() {}, speak() {} };
    // Deliberately a protocol stub, not the Cognito SDK. Exercise the GAME's stored-user branches.
    if (options.cognito) s.AmazonCognitoIdentity = { CognitoUserPool: class {
      constructor({ ClientId }) { this.key = `CognitoIdentityServiceProvider.${ClientId}.LastAuthUser`; }
      getCurrentUser() {
        const username = s.localStorage.getItem(this.key);
        return username ? { getUsername: () => username, getSession(cb) {
          sessions.push(active);
          cb(null, { isValid: () => true, getIdToken: () => ({ getJwtToken: () => 'fixture-token' }) });
        } } : null;
      }
    } };
    // Real VM Promise jobs drain after each script. No network and no real timers escape the fixture.
    delete s.Promise;
    context = create(s, { ...opts, microtaskMode: 'afterEvaluate' });
    run('globalThis.fetch=(url,opts)=>{ __remote.push({url,method:opts?.method||"GET"}); return Promise.resolve({ok:true,json:()=>Promise.resolve({})}); };',
      Object.assign(context, { __remote: remote }));
    return context;
  };
  vm.runInContext = (source, ctx, opts) => {
    if (opts?.filename === 'harness-collector') return run(source, ctx, opts);
    active = opts.filename; attempted.push(active);
    const url = new URL(active, options.baseURI || href).href;
    currentScript = { tagName: 'SCRIPT', src: url };
    if (options.failure?.file === active && options.failure.kind === 'missing') {
      dispatch('error', currentScript);
      errors.push({ phase: 'resource', file: active });
    } else {
      let src = options.transform ? options.transform(source, active) : source;
      if (options.failure?.file === active) {
        if (options.failure.kind === 'html') src = '<!doctype html><html>Netlify fallback</html>';
        if (options.failure.kind === 'throw') src += '\nthrow new Error("REVIEW_LOAD_FAILURE");';
      }
      try { run(src, ctx, opts); }
      catch (error) {
        errors.push({ phase: 'script', file: active, error });
        dispatch('error', sandbox, { filename: options.maskFilename ? '' : url, error });
      }
    }
    currentScript = null;
    options.afterScript?.(active, view());
    active = null;
  };
  try {
    const game = loadGame({ fresh: true });
    dispatch('DOMContentLoaded', sandbox.document);
    return { ...view(), game };
  } finally { vm.createContext = create; vm.runInContext = run; }
}

function refused(result) {
  assert.ok(result.errors.some(e => e.file === 'js/boot.js' && e.error?.message.startsWith(GUARD)), 'boot must refuse at its guard');
  assert.deepEqual(result.writes, [], 'a failed load must not write any localStorage key');
  assert.deepEqual(result.attempted, scripts.map(s => s.name), 'the loader must continue through ALL later files');
  assert.strictEqual(result.read('loadGateOpen'), false, 'DOMContentLoaded must not open a failed load');
  assert.strictEqual(result.dispatch('click').stopped, true, 'input must still be swallowed');
}

for (const kind of ['missing', 'html', 'throw']) {
  // Fault caught: ignore a REAL resource/parse/runtime error, rather than presetting the failed flag.
  // ?reset is intentional: bypassing the guard must expose actual storage writes even if later boot fails.
  test(`TUN-7 continuation: ${kind} in first, middle, or penultimate code file prevents boot and all writes`, () => {
    for (const file of positions) {
      const options = { href: 'https://tunegarden.test/index.html?reset', failure: { file, kind } };
      refused(simulate(options));
      assert.throws(() => refused(simulate({ ...options, transform: ignoreFailure })), { code: 'ERR_ASSERTION' }, `${file}: ignored failure must fail the same assertion`);
    }
  });
}

// Fault caught: discard document.currentScript and depend on the filename hidden by file:// errors.
test('TUN-7 continuation: masked file errors still stop real boot before reset writes', () => {
  const options = { href: 'file:///C:/Tune%20Garden/%E9%9F%B3/index.html?reset', maskFilename: true,
    failure: { file: 'js/living-garden.js', kind: 'throw' } };
  refused(simulate(options));
  const transform = (src, name) => name === 'js/load-gate.js' ? src.replace('const t=e.target, cs=document.currentScript;', 'const t=e.target, cs=null;') : src;
  assert.throws(() => refused(simulate({ ...options, transform })), { code: 'ERR_ASSERTION' });
});

// Fault caught: allow a broken/missing boot file to open the gate despite never asking the guard.
test('TUN-7 continuation: missing or unparsable boot never opens input', () => {
  const verify = r => {
    assert.deepEqual(r.writes, []);
    assert.strictEqual(r.read('gameScriptsChecked'), false);
    assert.strictEqual(r.dispatch('click').stopped, true);
  };
  for (const kind of ['missing', 'html']) {
    const options = { failure: { file: 'js/boot.js', kind } };
    verify(simulate(options));
    const transform = (src, name) => name === 'js/load-gate.js' ? src.replace('if(gameScriptsChecked && !gameScriptFailed) openLoadGate();', 'openLoadGate();') : src;
    assert.throws(() => verify(simulate({ ...options, transform })), { code: 'ERR_ASSERTION' });
  }
});

// Fault caught: freeze all controls after an ordinary exception INSIDE boot, despite all dependencies
// having loaded. This pins the stated compatibility decision, not a stronger successful-boot contract.
test('TUN-7 continuation: an exception after boot asks retains the former interactive failure mode', () => {
  const verify = r => {
    assert.ok(r.errors.some(e => e.file === 'js/boot.js' && e.error?.message === 'REVIEW_LOAD_FAILURE'));
    assert.ok(r.writes.some(w => w.key === 'mg_progress'), 'real boot ran before its injected tail exception');
    assert.strictEqual(r.read('gameScriptsChecked'), true);
    assert.strictEqual(r.dispatch('click').stopped, false);
  };
  const options = { failure: { file: 'js/boot.js', kind: 'throw' } };
  verify(simulate(options));
  const transform = (src, name) => name === 'js/load-gate.js' ? src.replace('!gameScriptsChecked && isGameScriptError(e)', 'isGameScriptError(e)') : src;
  assert.throws(() => verify(simulate({ ...options, transform })), { code: 'ERR_ASSERTION' });
});

function earlyCellPress(options = {}) {
  let snapshot;
  const result = simulate({ ...options, afterScript(name, r) {
    if (name !== 'js/playback.js') return;
    const cell = r.registrations.find(e => e.source === 'js/grid.js' && e.type === 'mousedown');
    assert.ok(cell, 'the REAL buildGrid registered its cell handler');
    const stopped = r.dispatch('mousedown', cell.target).stopped;
    snapshot = { stopped, notes: r.read('doc.tracks[0].notes.length'), journal: r.read('journal.length'),
      callbackErrors: r.errors.filter(e => e.phase === 'callback').map(e => e.error.message) };
  } });
  return { result, snapshot };
}
function assertCellHeld({ snapshot }) {
  assert.strictEqual(snapshot.stopped, true, 'a cell press must be held until dependencies finish');
  assert.strictEqual(snapshot.notes, 0, 'input must not plant a note before boot');
  assert.strictEqual(snapshot.journal, 0, 'input must not add an undo entry before boot');
  assert.deepEqual(snapshot.callbackErrors, []);
}

// Fault caught: turn swallowing into a no-op; invoke the real grid listener, not a sentinel callback.
test('TUN-7 continuation: real early cell input cannot mutate the document or undo journal', () => {
  assertCellHeld(earlyCellPress());
  const transform = (src, name) => name === 'js/load-gate.js' ? src.replace('e.stopImmediatePropagation();', '') : src;
  const faulty = earlyCellPress({ transform });
  assert.strictEqual(faulty.snapshot.notes, 1, 'positive control must reproduce the partially committed edit');
  assert.ok(faulty.snapshot.callbackErrors.includes('bloom is not defined'));
  assert.throws(() => assertCellHeld(faulty), { code: 'ERR_ASSERTION' });
});

// ACCEPTED EXCEPTION (reviews/TUN-7-rest-of-script.md). GPT's test pass showed that when js/load-gate.js ITSELF
// never runs, nothing holds input back while the later files load: a cell press after js/playback.js plants a note
// and an undo entry, then throws on bloom. GPT left that red and recommended an inline barrier; Claude kept the
// page script-free and accepted it. What still holds, and is pinned here, is the part that could cost a player
// data: boot's guard names gameScriptsLoaded, which then does not exist, so boot throws before it saves anything.
// Fault caught: a "defensive" guard that skips the check when the gate is absent — boot then runs, and ?reset writes.
for (const kind of ['missing', 'html']) {
  test(`TUN-7 continuation: a ${kind} load-gate still stops boot before any write (input is the accepted exception)`, () => {
    const options = { href: 'https://tunegarden.test/index.html?reset', failure: { file: 'js/load-gate.js', kind } };
    const verify = r => {
      assert.ok(r.errors.some(e => e.file === 'js/boot.js' && /gameScriptsLoaded is not defined/.test(e.error?.message)),
        'boot stops at its own guard');
      assert.deepEqual(r.writes, [], 'no localStorage write, even under ?reset');
      assert.deepEqual(r.attempted, scripts.map(s => s.name), 'the loader continued through every later file');
    };
    verify(simulate(options));
    const transform = (src, name) => name === 'js/boot.js'
      ? src.replace('if(!gameScriptsLoaded()) throw', 'if(typeof gameScriptsLoaded==="function" && !gameScriptsLoaded()) throw') : src;
    assert.notStrictEqual(transform(scripts.at(-1).src, 'js/boot.js'), scripts.at(-1).src, 'mutation anchor must exist');
    assert.throws(() => verify(simulate({ ...options, transform })), { code: 'ERR_ASSERTION' });
  });
}

// Faults caught at registration time, independent of spelling: a variable event name, computed
// addEventListener, computed .on property, and a template .on property escape the existing regex.
// These are NEW simulated listeners, not a claim that the current game has a wheel/dblclick handler.
test('TUN-7 continuation: executed registrations expose computed and variable input names', () => {
  const automatic = new Set(['scroll', 'resize', 'visibilitychange', 'pagehide', 'blur', 'error', 'load', 'DOMContentLoaded']);
  const verify = r => {
    assert.deepEqual(r.errors, [], 'a registration mutation must not merely break initialization');
    const gated = new Set(r.read('LOAD_GATE_EVENTS'));
    const exposed = r.registrations.filter(e => e.source !== 'js/load-gate.js' && !gated.has(e.type) && !automatic.has(e.type));
    assert.deepEqual(exposed.map(e => [e.source, e.type]), [], 'all executed input registrations must be covered');
  };
  verify(simulate());
  for (const fault of [
    'const reviewEvent="wheel"; document.addEventListener(reviewEvent,()=>{});',
    'document["addEventListener"]("focus",()=>{});',
    'document.getElementById("play")["on"+"dblclick"]=()=>{};',
    'document.getElementById("play")[`on${"contextmenu"}`]=()=>{};',
  ]) {
    const transform = (src, name) => name === 'js/playback.js' ? src + '\n' + fault : src;
    assert.throws(() => verify(simulate({ transform })), { code: 'ERR_ASSERTION' }, fault);
  }
});

function automaticCallbacks(name, r) {
  if (name === 'js/boot.js') return;
  // Invoke only the actual automatic registrations. Layout values still come from the harness's
  // stubs; this detects unavailable bindings and scheduled work, not camera/scroll correctness.
  for (const type of ['resize', 'blur', 'pagehide']) r.dispatch(type);
  r.dispatch('visibilitychange', r.sandbox.document);
  for (const id of ['scroller', 'drumArea']) if (r.nodes.has(id)) r.dispatch('scroll', r.nodes.get(id));
  for (const fn of r.observers) {
    try { fn(); } catch (error) { r.errors.push({ phase: 'observer', file: name, error }); }
  }
  try { r.sandbox.speechSynthesis?.onvoiceschanged?.(); }
  catch (error) { r.errors.push({ phase: 'voiceschanged', file: name, error }); }
  // Run any timer registered before boot once. A newly introduced deferred forward call is part of
  // the hazard: the real browser could run it while waiting for the next file's response.
  for (const timer of r.timers.splice(0)) {
    try { timer.fn(); } catch (error) { r.errors.push({ phase: 'timer', file: name, error }); }
  }
}

// Faults caught: a ResizeObserver or voice event calls a later helper, or an early script queues a
// timer or Promise continuation that calls a later helper. All four must fail at the intervening seam.
test('TUN-7 continuation: automatic callbacks and microtasks cannot call later files before boot', () => {
  const verify = r => assert.deepEqual(r.errors.map(e => [e.phase, e.file, e.error?.message]), []);
  const options = { resizeObserver: true, hidden: true, afterScript: automaticCallbacks };
  verify(simulate(options));
  for (const [file, from, to] of [
    ['js/grid.js', 'camMeasure(); camEdges(); }).observe(scroller)', 'setStatus("too early"); camMeasure(); camEdges(); }).observe(scroller)'],
    ['js/play-scope.js', '_voicePick=null; pickVoice();', '_voicePick=null; setStatus("too early"); pickVoice();'],
    ['js/grid.js', null, 'setTimeout(()=>setStatus("too early"),0);'],
    ['js/grid.js', null, 'Promise.resolve().then(()=>setStatus("too early")).catch(e=>__reviewAsyncErrors.push(e));'],
  ]) {
    const transform = (src, name) => name !== file ? src : from ? src.replace(from, to) : src + '\n' + to;
    const afterScript = (name, r) => {
      r.sandbox.__reviewAsyncErrors ||= [];
      automaticCallbacks(name, r);
      for (const error of r.sandbox.__reviewAsyncErrors.splice(0)) r.errors.push({ phase: 'microtask', file: name, error });
    };
    // Install the reporting sink before the mutated grid file reaches its first microtask checkpoint.
    const faulty = simulate({ ...options, transform, afterScript });
    assert.ok(faulty.errors.some(e => e.error?.message === 'setStatus is not defined'), 'the fault must reach its intended unavailable binding');
    assert.throws(() => verify(faulty), { code: 'ERR_ASSERTION' }, `${file}: ${to}`);
  }
});

// Fault caught: on the returning-profile branch, the stored progress initializer synchronously calls
// the not-yet-loaded cloud helper. The default empty-storage branch would miss that dependency.
test('TUN-7 continuation: URL and persisted-state branches load with callbacks between scripts', () => {
  const returning = { v: 1, companion: 'sprout', current: 'intro', packages: {}, settings: { speak: false } };
  const stored = { mg_progress: JSON.stringify(returning),
    'CognitoIdentityServiceProvider.44vulb0g89acopnl86svibaitf.LastAuthUser': 'fixture-user' };
  const baseline = simulate();
  const song = baseline.game.encodeSong(baseline.game.currentSong());
  const rows = [
    { href: 'https://tunegarden.test/?dev' },
    { href: 'https://tunegarden.test/index.html?reset', storage: stored },
    { href: 'https://tunegarden.test/index.html#s=' + song },
    { href: 'https://tunegarden.test/index.html#song=fixture', cognito: true, storage: stored },
    { storage: stored, cognito: true },
    { storage: stored, speech: false },
    { storageThrows: true, speech: false },
  ];
  const verify = r => {
    assert.deepEqual(r.errors.map(e => [e.file, e.error?.message]), []);
    assert.strictEqual(r.read('loadGateOpen'), true);
    assert.ok(r.writes.every(w => w.file === 'js/boot.js'), 'no initializer or automatic callback may save before boot');
    assert.ok(r.sessions.every(file => file === 'js/boot.js'), 'stored-user session work belongs to boot');
  };
  for (const row of rows) {
    const r = simulate({ resizeObserver: true, hidden: true, afterScript: automaticCallbacks, ...row });
    verify(r);
    if (row.cognito) assert.ok(r.sessions.length > 0, 'the fixture must actually exercise a stored Cognito user');
    if (row.href?.includes('#song=')) assert.ok(r.remote.some(x => x.url.endsWith('/songs/fixture')), 'cloud-link continuation ran');
  }
  const transform = (src, name) => name === 'js/persistence.js' ? src + '\nif(progress.companion) scheduleCloud();' : src;
  assert.throws(() => verify(simulate({ storage: stored, transform })), { code: 'ERR_ASSERTION' });
});
