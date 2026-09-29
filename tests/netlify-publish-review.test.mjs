// GPT's test pass on TUN-6: the shipped checker (tests/helpers/netlify-publish.mjs) against layouts the
// real page does not have yet, and two false greens it found — both red against the first checker, which
// split a command on && without honouring a shell comment and read whichever `command =` came first.
import { test } from 'node:test';
import assert from 'node:assert';
import { publishGaps } from './helpers/netlify-publish.mjs';

const scripts = ['boot.js', 'js/nested/engine.js', 'spike/probe.js'].map(name => ({ name, inline: false }));
const command = 'mkdir -p site && cp index.html site/index.html && cp boot.js site/boot.js' +
  ' && cp -r js site/js && cp -r spike site/spike';
const config = cmd => `[build]\ncommand = "${cmd}"\npublish = "site"\n`;

// Mutations: drop each correct copy separately. Root-file and nested-directory handling must
// reject only the affected URL; a script in spike/ must not accidentally count as covered by js/.
test('publish checker: root scripts, nested scripts, spike scripts and CRLF retain exact coverage', () => {
  for (const newline of ['\n', '\r\n']) {
    const toml = config(command).replaceAll('\n', newline);
    assert.deepEqual(publishGaps(toml, scripts), []);
    for (const [copy, missing] of [
      [' && cp boot.js site/boot.js', 'boot.js'],
      [' && cp -r js site/js', 'js/nested/engine.js'],
      [' && cp -r spike site/spike', 'spike/probe.js'],
    ]) assert.deepEqual(publishGaps(toml.replace(copy, ''), scripts), [missing]);
  }
});

// Was red against the first checker: sh ignores everything after #, but splitting on && resurrected
// those copies. Green control differs only by removing the shell comment marker. No shell command runs.
test('publish checker: a shell-commented copy cannot satisfy a required script', () => {
  const page = [{ name: 'js/engine.js', inline: false }];
  const good = config('mkdir -p site && cp index.html site/index.html && echo publishing && cp -r js site/js');
  assert.deepEqual(publishGaps(good, page), []);
  const mutant = good.replace('echo publishing &&', 'echo publishing # &&');
  assert.deepEqual(publishGaps(mutant, page), ['js/engine.js']);
});

// Was red against the first checker: a valid command for another deploy context precedes [build].
// Removing build's js copy must not be hidden by that unrelated command. Both TOML documents are valid.
test('publish checker: an unrelated context command cannot hide a missing build copy', () => {
  const page = [{ name: 'js/engine.js', inline: false }];
  const other = '[context.branch-deploy]\ncommand = "cp index.html site/index.html && cp -r js site/js"\n';
  const good = other + config('cp index.html site/index.html && cp -r js site/js');
  assert.deepEqual(publishGaps(good, page), []);
  const mutant = other + config('cp index.html site/index.html');
  assert.deepEqual(publishGaps(mutant, page), ['js/engine.js']);
});
