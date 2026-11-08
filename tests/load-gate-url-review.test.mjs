// TUN-7 URL boundaries. Run the real classifier with DOM-shaped error sources. URL constructs
// absolute script.src values the way relative tags resolve; no network, files, or browser is used.
import { test } from 'node:test';
import assert from 'node:assert';
import vm from 'node:vm';
import { gameScripts } from './helpers/game-scripts.mjs';

const source = gameScripts().scripts.find(s => s.name === 'js/load-gate.js').src;
function classifier(href, transform = s => s, baseURI = href) {
  const document = new EventTarget();
  document.currentScript = null;
  document.baseURI = new URL(baseURI, href).href;
  const context = vm.createContext({ document, window: new EventTarget(), location: { href: new URL(href).href } });
  vm.runInContext(transform(source), context);
  return { check: vm.runInContext('isGameScriptError', context), document };
}

// Fault caught: hard-code the deployment root, silently losing nested/http and encoded file paths.
test('TUN-7 gate URLs: directory and index pages, queries, fragments and encoded file paths classify alike', () => {
  const verify = transform => {
    for (const href of [
      'https://tunegarden.test/',
      'https://tunegarden.test/index.html?next=/elsewhere/index.html#song=x',
      'https://tunegarden.test/play/',
      'https://tunegarden.test/play/index.html?dev#s=x',
      'https://tunegarden.test/play', // no trailing slash: browser resolves js/ at the parent
      'file:///C:/Tune Garden/index.html',
      'file:///C:/Tune%20Garden/%E9%9F%B3/index.html?dev#s=x',
      'file:///C:/Tune%23Garden/100%25/index.html',
      'file://server/share/Tune%20Garden/index.html',
    ]) {
      const g = classifier(href, transform);
      for (const relative of ['js/grid.js', 'js/grid.js?v=abc#debug', 'js/sub/component.js', 'js/a%20file.js']) {
        const src = new URL(relative, href).href;
        assert.strictEqual(g.check({ target: { tagName: 'SCRIPT', src } }), true, `${href}: ${src}`);
        assert.strictEqual(g.check({ filename: src }), true, `runtime filename: ${src}`);
      }
    }
  };
  verify(s => s);
  const transform = s => s.replace(/^  const base=.*;$/m, '  const base="https://tunegarden.test/js/";');
  assert.notStrictEqual(transform(source), source, 'mutation anchor must exist');
  assert.throws(() => verify(transform), { code: 'ERR_ASSERTION' });
});

// Fault caught: reverting 531bfbd to location.href misses errors from the paths a <base> resolves.
test('TUN-7 gate URLs: a base element moves the game-script directory, not the page address', () => {
  const verify = transform => {
    for (const [href, baseURI] of [
      ['https://tunegarden.test/play/index.html', '../assets/'],
      ['https://tunegarden.test/play/', 'https://static.tunegarden.test/release/index.html'],
      ['file:///C:/Tune%20Garden/page/index.html', '../assets/'],
    ]) {
      const g = classifier(href, transform, baseURI);
      assert.strictEqual(g.check({ target: { tagName: 'SCRIPT', src: new URL('js/grid.js?v=1#source', g.document.baseURI).href } }), true);
      assert.strictEqual(g.check({ filename: new URL('js/grid.js', href).href }), false, 'page-relative js/ is no longer this document\'s script directory');
    }
  };
  verify(s => s);
  const transform = s => s.replace('const base=document.baseURI', 'const base=location.href');
  assert.notStrictEqual(transform(source), source);
  assert.throws(() => verify(transform), { code: 'ERR_ASSERTION' });
});

// Faults caught: lose the directory's slash boundary, or accept ANY origin/path containing /js/.
test('TUN-7 gate URLs: lookalike folders and foreign origins never poison startup', () => {
  const verify = transform => {
    const g = classifier('https://tunegarden.test/play/index.html', transform);
    for (const src of [
      'https://tunegarden.test/play/js-old/grid.js',
      'https://tunegarden.test/play/javascript/grid.js',
      'https://tunegarden.test/play/js',
      'https://tunegarden.test/other/js/grid.js',
      'https://tunegarden.test/play/other/js/grid.js',
      'https://tunegarden.test/js/grid.js',
      'https://elsewhere.test/play/js/grid.js',
      'https://tunegarden.test/play/samples/piano.js',
      'chrome-extension://abc/js/content.js',
    ]) assert.strictEqual(g.check({ target: { tagName: 'SCRIPT', src } }), false, src);
    assert.strictEqual(g.check({ filename: 'https://tunegarden.test/play/js/nested/grid.js' }), true, 'descendants really are under this js/ directory');
  };
  verify(s => s);
  for (const expression of ['src.startsWith(base.slice(0,-1))', 'src.includes("/js/")']) {
    const transform = s => s.replace('src.startsWith(base)', expression);
    assert.throws(() => verify(transform), { code: 'ERR_ASSERTION' });
  }
});

// Fault caught: prefer a generic/current script over the actual failing resource's own script.src.
// A currently executing game script must not make a failed sample or CDN script look like game code.
test('TUN-7 gate URLs: resource target wins over currentScript and filename', () => {
  const verify = transform => {
    const g = classifier('file:///C:/Tune%20Garden/index.html', transform);
    g.document.currentScript = { src: 'file:///C:/Tune%20Garden/js/grid.js' };
    assert.strictEqual(g.check({ target: { tagName: 'SCRIPT', src: 'file:///C:/Tune%20Garden/samples/piano.js' },
      filename: 'file:///C:/Tune%20Garden/js/grid.js' }), false);
    g.document.currentScript = { src: 'https://cdn.example/optional.js' };
    assert.strictEqual(g.check({ target: { tagName: 'SCRIPT', src: 'file:///C:/Tune%20Garden/js/cloud.js?v=1' }, filename: '' }), true);
  };
  verify(s => s);
  const transform = s => s.replace('(t && t.tagName==="SCRIPT") ? t.src : ((cs && cs.src) || e.filename || "")', '(cs && cs.src) || e.filename || (t && t.src) || ""');
  assert.notStrictEqual(transform(source), source);
  assert.throws(() => verify(transform), { code: 'ERR_ASSERTION' });
});
