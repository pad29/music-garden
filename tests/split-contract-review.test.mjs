import { test } from 'node:test';
import assert from 'node:assert';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { gameScripts, ROOT } from './helpers/game-scripts.mjs';
import { loadGame } from './harness.mjs';
import { observeLoadOrder } from './helpers/load-order-observer.mjs';

function inventory(dir = 'js') {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap(entry => {
    const name = `${dir}/${entry.name}`;
    return entry.isDirectory() ? inventory(name) : /\.(?:[cm]?js)$/.test(name) ? [name] : [];
  }).sort();
}
function assertInventory(files, scripts) {
  const loaded = scripts.filter(s => !s.inline && s.name.startsWith('js/')).map(s => s.name).sort();
  assert.deepEqual(loaded, files, 'every js/ source must be statically loaded exactly once, with exact casing');
}

// Mutations: remove a script tag; duplicate one; add an orphan nested file; change filename casing.
// Apply them to the real inventory/list in memory, never to the game or generated asset directories.
test('split contract: every js source is loaded exactly once with the correct path', () => {
  const files = inventory(), { scripts } = gameScripts();
  assert.ok(files.length > 0);
  assertInventory(files, scripts);
  const first = scripts.find(s => s.name === files[0]);
  for (const [mutantFiles, mutantScripts] of [
    [files, scripts.filter(s => s !== first)],
    [files, [...scripts, first]],
    [[...files, 'js/nested/orphan.js'].sort(), scripts],
    [files, scripts.map(s => s === first ? { ...s, name: s.name.toUpperCase() } : s)],
  ]) assert.throws(() => assertInventory(mutantFiles, mutantScripts), { code: 'ERR_ASSERTION' });
});

function assertInterception(game) {
  for (const name of ['playRow', 'voice', 'jamStep', 'bookColumn']) {
    const original = game.__window[name];
    const wrapper = () => 'intercepted';
    try {
      assert.strictEqual(typeof original, 'function', `${name} must be a window function`);
      game.__window[name] = wrapper;
      assert.strictEqual(game[name], wrapper, `window.${name} must change the live identifier binding`);
    } finally { game.__window[name] = original; }
  }
}

// Mutation: convert each function declaration to a top-level const function expression. The game
// still initializes, but the documented golden wrapper silently stops intercepting that identifier.
test('split contract: all four golden wrappers intercept the live game binding', () => {
  assertInterception(loadGame({ fresh: true }));
  for (const name of ['playRow', 'voice', 'jamStep', 'bookColumn']) {
    let hits = 0;
    const { game } = observeLoadOrder({ transform: s => {
      const needle = `function ${name}(`;
      if (!s.src.includes(needle)) return s.src;
      hits++;
      return s.src.replace(needle, `const ${name}=function(`);
    } });
    assert.strictEqual(hits, 1);
    assert.throws(() => assertInterception(game), { code: 'ERR_ASSERTION' });
  }
});
