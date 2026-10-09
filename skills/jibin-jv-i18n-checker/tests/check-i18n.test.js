'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const lib = require('../scripts/check-i18n');

const EXAMPLES = path.join(__dirname, '..', 'examples');

function tmpCopyOfExamples() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-check-'));
  fs.cpSync(EXAMPLES, dir, { recursive: true });
  return dir;
}

function writeLocales(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-check-'));
  const i18n = path.join(dir, 'i18n');
  fs.mkdirSync(i18n);
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(i18n, name), content);
  return dir;
}

function findings(result, label) {
  const file = result.files.find((f) => f.label === label);
  assert.ok(file, `no result for ${label}`);
  return Object.fromEntries(file.findings.map((f) => [f.rule, f]));
}

test('parseOrdered keeps source order (including integer-like keys) and reports duplicates', () => {
  const { root, duplicates } = lib.parseOrdered('{"b":1,"404":2,"a":{"x":1,"x":2}}');
  assert.deepEqual([...root.keys()], ['b', '404', 'a']);
  assert.deepEqual(duplicates, ['a.x']);
});

test('flatten produces dot keys; arrays and empty objects are leaves', () => {
  const { root } = lib.parseOrdered('{"a":{"b":"x","c":[1,2]},"d":{}}');
  assert.deepEqual([...lib.flatten(root).keys()], ['a.b', 'a.c', 'd']);
});

test('extractPlaceholders ignores whitespace inside braces and sorts', () => {
  const patterns = lib.compilePatterns(['\\{\\{[^{}]+\\}\\}']);
  assert.deepEqual(lib.extractPlaceholders('{{ b }} and {{a}}', patterns), ['{{a}}', '{{b}}']);
});

test('findBlankLines ignores the final newline and handles CRLF', () => {
  assert.deepEqual(lib.findBlankLines('{\r\n\r\n  "a": 1\r\n}\r\n'), [2]);
});

test('example fixtures: clean files pass (including non-Latin scripts)', () => {
  const result = lib.run({ root: EXAMPLES, configPath: path.join(EXAMPLES, 'i18n-check.config.json') });
  for (const lang of ['en', 'am', 'bn', 'es', 'ro', 'uk']) {
    assert.deepEqual(findings(result, `demo/${lang}.json`), {}, `${lang}.json should be clean`);
  }
});

test('example fixtures: ar.json reports a dropped placeholder', () => {
  const result = lib.run({ root: EXAMPLES, configPath: path.join(EXAMPLES, 'i18n-check.config.json') });
  const ar = findings(result, 'demo/ar.json');
  assert.deepEqual(Object.keys(ar), ['interpolation']);
  assert.deepEqual(ar.interpolation.items, [{ key: 'orders.count', expected: '{{count}}', found: '(none)' }]);
});

test('example fixtures: fr.json reports missing/extra/blank/interpolation/empty', () => {
  const result = lib.run({ root: EXAMPLES, configPath: path.join(EXAMPLES, 'i18n-check.config.json') });
  const fr = findings(result, 'demo/fr.json');
  assert.deepEqual(fr.missingKeys.items, ['orders.status.closed']);
  assert.deepEqual(fr.extraKeys.items, ['orders.legacy']);
  assert.deepEqual(fr.blankLines.items, [6]);
  assert.equal(fr.lineCount.severity, 'error');
  assert.deepEqual(fr.interpolation.items, [{ key: 'app.welcome', expected: '{{name}}', found: '{{nom}}' }]);
  assert.equal(fr.emptyValues.severity, 'warn');
  assert.deepEqual(fr.emptyValues.items, ['orders.empty']);
});

test('example fixtures: ru.json reports duplicate keys and order mismatch', () => {
  const result = lib.run({ root: EXAMPLES, configPath: path.join(EXAMPLES, 'i18n-check.config.json') });
  const ru = findings(result, 'demo/ru.json');
  assert.deepEqual(ru.duplicateKeys.items, ['orders.status.open']);
  assert.deepEqual(ru.order.items[0], { index: 0, expected: 'app.title', found: 'app.welcome' });
  assert.equal(result.summary.errors > 0, true);
});

test('BOM is stripped and invalid JSON is reported with the parser message', () => {
  const root = writeLocales({ 'en.json': '﻿{"a":"x"}', 'fr.json': '{"a": }' });
  const result = lib.run({ root });
  assert.deepEqual(findings(result, 'i18n/en.json'), {});
  const load = findings(result, 'i18n/fr.json').load;
  assert.match(load.items[0], /Invalid JSON in .*fr\.json: /);
});

test('auto-discovery finds locale dirs and skips node_modules', () => {
  const root = writeLocales({ 'en.json': '{"a":"x"}' });
  fs.mkdirSync(path.join(root, 'node_modules', 'pkg', 'i18n'), { recursive: true });
  fs.writeFileSync(path.join(root, 'node_modules', 'pkg', 'i18n', 'en.json'), '{}');
  assert.deepEqual(lib.discoverTargets(root, 'en.json').map((t) => t.name), ['i18n']);
});

test('languages filter limits files and reports listed-but-missing ones', () => {
  const root = writeLocales({ 'en.json': '{"a":"x"}', 'fr.json': '{"a":"y"}', 'de.json': '{}' });
  fs.writeFileSync(path.join(root, 'i18n-check.config.json'), JSON.stringify({
    targets: [{ name: 'app', dir: 'i18n', languages: ['fr.json', 'es.json'] }],
  }));
  const result = lib.run({ root });
  assert.deepEqual(result.files.map((f) => f.label).sort(), ['app/en.json', 'app/es.json', 'app/fr.json']);
  assert.match(findings(result, 'app/es.json').load.items[0], /not found/);
});

test('rule severities can be downgraded or switched off', () => {
  const root = writeLocales({ 'en.json': '{"a":"x","b":"y"}', 'fr.json': '{"b":"y","a":"z"}' });
  fs.writeFileSync(path.join(root, 'i18n-check.config.json'), JSON.stringify({
    targets: [{ dir: 'i18n' }],
    rules: { order: 'warn', untranslated: true },
  }));
  const result = lib.run({ root });
  const fr = result.files.find((f) => f.label.endsWith('fr.json'));
  const rules = Object.fromEntries(fr.findings.map((f) => [f.rule, f.severity]));
  assert.deepEqual(rules, { order: 'warn', untranslated: 'error' });
});

test('--fix reorders, removes blank lines, keeps extra keys and skips files with duplicates', () => {
  const root = tmpCopyOfExamples();
  const configPath = path.join(root, 'i18n-check.config.json');
  const before = fs.readFileSync(path.join(root, 'i18n', 'ru.json'), 'utf-8');
  const { _targets } = lib.run({ root, configPath });
  const { written, skipped } = lib.applyFixes(_targets);

  assert.deepEqual(written.map((p) => path.basename(p)), ['fr.json']);
  assert.deepEqual(skipped.map((s) => path.basename(s.path)), ['ru.json']);
  assert.equal(fs.readFileSync(path.join(root, 'i18n', 'ru.json'), 'utf-8'), before);

  const fr = findings(lib.run({ root, configPath }), 'demo/fr.json');
  assert.equal(fr.blankLines, undefined);
  assert.equal(fr.order, undefined);
  assert.deepEqual(fr.extraKeys.items, ['orders.legacy']);
  assert.deepEqual(fr.missingKeys.items, ['orders.status.closed']);
});

test('--fix-missing adds [TODO] placeholders and preserves CRLF + indentation of base', () => {
  const root = writeLocales({
    'en.json': '{\r\n    "a": "Hello {{name}}",\r\n    "b": {\r\n        "c": "Bye"\r\n    }\r\n}\r\n',
    'fr.json': '{"b":{},"a":"Bonjour {{name}}"}',
  });
  const { _targets } = lib.run({ root });
  lib.applyFixes(_targets, { fillMissing: true });
  const text = fs.readFileSync(path.join(root, 'i18n', 'fr.json'), 'utf-8');
  assert.equal(text, '{\r\n    "a": "Bonjour {{name}}",\r\n    "b": {\r\n        "c": "[TODO] Bye"\r\n    }\r\n}\r\n');
  assert.equal(lib.run({ root }).summary.errors, 0);
});

test('CLI exit codes: 1 on errors, 0 when clean, 2 on bad usage', () => {
  const log = console.log;
  const err = console.error;
  console.log = console.error = () => {};
  try {
    assert.equal(lib.main(['--config', path.join(EXAMPLES, 'i18n-check.config.json'), '--json']), 1);
    const clean = writeLocales({ 'en.json': '{"a":"x"}', 'fr.json': '{"a":"y"}' });
    assert.equal(lib.main(['--root', clean]), 0);
    assert.equal(lib.main(['--nope']), 2);
  } finally {
    console.log = log;
    console.error = err;
  }
});
