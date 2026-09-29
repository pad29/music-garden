import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, relative, resolve, isAbsolute } from 'node:path';
import { loadGame } from './harness.mjs';
import { observeLoadOrder, assertNoForwardReads } from './helpers/load-order-observer.mjs';

function page(t, first, last) {
  const root = mkdtempSync(join(tmpdir(), 'tg-load-order-'));
  t.after(() => {
    const rel = relative(resolve(tmpdir()), resolve(root));
    assert.ok(rel && !rel.startsWith('..') && !isAbsolute(rel));
    rmSync(root, { recursive: true, force: true });
  });
  for (const [name, src] of Object.entries({
    'index.html': '<input id="tempo" min="40" max="200" value="100">' +
      '<script src="first/early.js"></script><script src="second/late.js"></script>',
    'first/early.js': first, 'second/late.js': last,
  })) { mkdirSync(dirname(join(root, name)), { recursive: true }); writeFileSync(join(root, name), src); }
  return root;
}

// Mutation: prepend each silent future-name probe to the real first script IN MEMORY. Each must
// fail the same zero-forward-read assertion that guards the unmodified real page.
test('load order: the real page never probes globals first introduced by a later script', () => {
  loadGame({ fresh: true }); // the normal harness remains the initialization-error oracle
  assertNoForwardReads(observeLoadOrder());
  for (const probe of ['typeof freshDoc', 'window.freshDoc', '"freshDoc" in window']) {
    const changed = observeLoadOrder({ transform: (s, i) => i ? s.src : `void (${probe});\n${s.src}` });
    assert.throws(() => assertNoForwardReads(changed), { code: 'ERR_ASSERTION' });
    assert.ok(changed.forward.some(r => r.name === 'freshDoc' && r.owner === 'js/doc-model.js'));
  }
});

// Faults: each independent probe used to pass loadGame without an exception. Controls MUST report
// the named later declaration, not merely fail initialization or rely on a different probe.
for (const [kind, probe] of [['typeof', 'typeof later'], ['window', 'window.later'], ['in', '"later" in window']]) {
  test(`load order: catches a silent ${kind} probe that the ordinary harness accepts`, t => {
    const root = page(t, `const result = ${probe};`, 'function later(){ return 42; }');
    assert.doesNotThrow(() => loadGame({ root }));
    const observed = observeLoadOrder({ root });
    assert.throws(() => assertNoForwardReads(observed), { code: 'ERR_ASSERTION' });
    assert.deepEqual(observed.forward, [{ from: 'first/early.js', name: 'later',
      kind: kind === 'in' ? 'has' : 'get', owner: 'second/late.js' }]);
  });
}

// Mutation: move the same-file declaration into late.js; same probes must then turn red.
test('load order: accepts same-file hoisting and callbacks invoked by the later script', t => {
  const early = 'const own = typeof same; window.same; "same" in window;\n' +
    'function same(){}\nfunction deferred(){ return typeof late; }';
  const late = 'function late(){}\nconst result = deferred();';
  const root = page(t, early, late);
  assertNoForwardReads(observeLoadOrder({ root }));
  const changed = observeLoadOrder({ root, transform: (s, i) => i === 0
    ? s.src.replace('function same(){}', '') : 'function same(){}\n' + s.src });
  assert.throws(() => assertNoForwardReads(changed), { code: 'ERR_ASSERTION' });
  assert.ok(changed.forward.every(r => r.name === 'same'));
});

// Faults: a regex inventory can miss indentation, a second declarator, destructuring and classes.
// The test observes a future lexical name from the global side, before that lexical binding exists.
test('load order: V8 discovers later lexical declarations independent of formatting', t => {
  const root = page(t, 'const result = [typeof second, typeof renamed, typeof Later];',
    '  const first = 1, second = 2;\n  let {value: renamed} = {value:3};\n  class Later {}');
  const observed = observeLoadOrder({ root });
  assert.throws(() => assertNoForwardReads(observed), { code: 'ERR_ASSERTION' });
  assert.deepEqual(observed.forward.map(r => r.name).sort(), ['Later', 'renamed', 'second']);
});
