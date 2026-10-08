#!/usr/bin/env node
/**
 * check-i18n — validate i18n JSON locale files against a base locale.
 *
 * Zero dependencies (Node >= 18). Run `node check-i18n.js --help` for usage.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const CONFIG_FILE = 'i18n-check.config.json';
const DEFAULT_CONFIG = {
  baseLocale: 'en.json',
  // Regex sources. Default matches Angular/ngx-translate/i18next style {{ var }}.
  // Add "\\{[A-Za-z_][\\w.]*\\}" for ICU / single-brace placeholders.
  interpolation: ['\\{\\{[^{}]+\\}\\}'],
  rules: {
    duplicateKeys: 'error',
    missingKeys: 'error',
    extraKeys: 'error',
    order: 'error',
    lineCount: 'error',
    blankLines: 'error',
    interpolation: 'error',
    emptyValues: 'warn',
    untranslated: 'off',
  },
  targets: null,
};
const DISCOVER_DIR_NAMES = /^(i18n|locales?|lang|languages|translations)$/i;
const DISCOVER_SKIP = new Set(['node_modules', 'dist', 'build', 'coverage', '.git', '.angular', '.next', '.nx', 'tmp']);

// ---------------------------------------------------------------------------
// Reading & parsing
// ---------------------------------------------------------------------------

function readText(filePath) {
  let text = fs.readFileSync(filePath, 'utf-8');
  const hadBom = text.charCodeAt(0) === 0xfeff;
  if (hadBom) text = text.slice(1);
  return { text, hadBom };
}

/**
 * Parse JSON preserving source key order (objects become Maps) and collecting
 * duplicate keys. JSON.parse silently drops duplicates and moves integer-like
 * keys ("404") to the front, which would hide real problems.
 * Input is validated with JSON.parse first so we get its error messages.
 */
function parseOrdered(text) {
  JSON.parse(text);
  const duplicates = [];
  let i = 0;

  const skipWs = () => {
    while (i < text.length && ' \t\r\n'.includes(text[i])) i++;
  };
  const readString = () => {
    const start = i++;
    while (text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
    i++;
    return JSON.parse(text.slice(start, i));
  };
  const readValue = (keyPath) => {
    skipWs();
    const c = text[i];
    if (c === '{') {
      i++;
      const map = new Map();
      skipWs();
      if (text[i] === '}') { i++; return map; }
      for (;;) {
        skipWs();
        const key = readString();
        const childPath = keyPath ? `${keyPath}.${key}` : key;
        if (map.has(key)) duplicates.push(childPath);
        skipWs();
        i++; // ':'
        map.set(key, readValue(childPath));
        skipWs();
        if (text[i++] === '}') return map;
      }
    }
    if (c === '[') {
      i++;
      const arr = [];
      skipWs();
      if (text[i] === ']') { i++; return arr; }
      for (;;) {
        arr.push(readValue(`${keyPath}[${arr.length}]`));
        skipWs();
        if (text[i++] === ']') return arr;
      }
    }
    if (c === '"') return readString();
    const start = i;
    while (i < text.length && !' \t\r\n,]}'.includes(text[i])) i++;
    return JSON.parse(text.slice(start, i));
  };

  return { root: readValue(''), duplicates };
}

function loadLocale(filePath) {
  const { text, hadBom } = readText(filePath);
  try {
    const { root, duplicates } = parseOrdered(text);
    if (!(root instanceof Map)) throw new Error('top-level value must be an object');
    return { text, hadBom, root, duplicates, flat: flatten(root) };
  } catch (err) {
    return { text, hadBom, error: `Invalid JSON in ${filePath}: ${err.message}` };
  }
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** Flatten nested Maps to dot-keys. Arrays and empty objects are leaf values. */
function flatten(map, prefix = '', out = new Map()) {
  for (const [key, value] of map) {
    const flatKey = prefix ? `${prefix}.${key}` : key;
    if (value instanceof Map && value.size) flatten(value, flatKey, out);
    else out.set(flatKey, value);
  }
  return out;
}

function toPlain(value) {
  if (value instanceof Map) return Object.fromEntries([...value].map(([k, v]) => [k, toPlain(v)]));
  if (Array.isArray(value)) return value.map(toPlain);
  return value;
}

function asText(value) {
  return typeof value === 'string' ? value : JSON.stringify(toPlain(value));
}

function splitLines(text) {
  const lines = text.split(/\r?\n/);
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop(); // final newline
  return lines;
}

function findBlankLines(text) {
  return splitLines(text).reduce((acc, line, idx) => {
    if (line.trim() === '') acc.push(idx + 1);
    return acc;
  }, []);
}

function compareKeys(baseFlat, targetFlat) {
  const baseKeys = [...baseFlat.keys()];
  const targetKeys = [...targetFlat.keys()];
  const missingKeys = baseKeys.filter((k) => !targetFlat.has(k));
  const extraKeys = targetKeys.filter((k) => !baseFlat.has(k));

  const commonBase = baseKeys.filter((k) => targetFlat.has(k));
  const commonTarget = targetKeys.filter((k) => baseFlat.has(k));
  const index = commonBase.findIndex((k, idx) => k !== commonTarget[idx]);
  const orderMismatch = index === -1 ? null : { index, expected: commonBase[index], found: commonTarget[index] };

  return { missingKeys, extraKeys, orderMismatch };
}

function compilePatterns(sources) {
  return sources.map((src) => new RegExp(src, 'g'));
}

/** Sorted, whitespace-normalised placeholder list: "{{ name }}" == "{{name}}". */
function extractPlaceholders(value, patterns) {
  const str = asText(value);
  const found = [];
  for (const re of patterns) {
    for (const match of str.matchAll(re)) found.push(match[0].replace(/\s+/g, ''));
  }
  return found.sort();
}

function checkInterpolation(baseFlat, targetFlat, patterns) {
  const mismatches = [];
  for (const [key, baseValue] of baseFlat) {
    if (!targetFlat.has(key)) continue; // reported as missing instead
    const expected = extractPlaceholders(baseValue, patterns);
    const found = extractPlaceholders(targetFlat.get(key), patterns);
    if (expected.join(',') !== found.join(',')) {
      mismatches.push({ key, expected: expected.join(', ') || '(none)', found: found.join(', ') || '(none)' });
    }
  }
  return mismatches;
}

function findEmptyValues(baseFlat, targetFlat) {
  return [...targetFlat].filter(([k, v]) => v === '' && baseFlat.get(k) !== '').map(([k]) => k);
}

function findUntranslated(baseFlat, targetFlat) {
  return [...targetFlat]
    .filter(([k, v]) => typeof v === 'string' && v.trim() !== '' && v === baseFlat.get(k))
    .map(([k]) => k);
}

// ---------------------------------------------------------------------------
// Config & discovery
// ---------------------------------------------------------------------------

function normaliseSeverity(value) {
  if (value === true) return 'error';
  if (value === false || value == null) return 'off';
  if (['error', 'warn', 'off'].includes(value)) return value;
  throw new Error(`Invalid rule severity "${value}" (use "error", "warn" or "off")`);
}

function loadConfig({ configPath, root }) {
  let fileConfig = {};
  let baseDir = root;
  const resolved = configPath ? path.resolve(configPath) : path.join(root, CONFIG_FILE);
  if (fs.existsSync(resolved)) {
    try {
      fileConfig = JSON.parse(readText(resolved).text);
    } catch (err) {
      throw new Error(`Cannot read config ${resolved}: ${err.message}`);
    }
    baseDir = path.dirname(resolved);
  } else if (configPath) {
    throw new Error(`Config file not found: ${resolved}`);
  }

  const config = {
    ...DEFAULT_CONFIG,
    ...fileConfig,
    rules: { ...DEFAULT_CONFIG.rules, ...(fileConfig.rules || {}) },
  };
  for (const rule of Object.keys(config.rules)) config.rules[rule] = normaliseSeverity(config.rules[rule]);

  const source = fs.existsSync(resolved) ? resolved : null;
  let targets;
  if (Array.isArray(config.targets) && config.targets.length) {
    targets = config.targets.map((t) => ({
      name: t.name || t.dir,
      dir: path.resolve(baseDir, t.dir),
      baseLocale: t.baseLocale || config.baseLocale,
      languages: t.languages || null,
    }));
  } else {
    targets = discoverTargets(root, config.baseLocale);
  }
  return { config, targets, source, discovered: !(Array.isArray(config.targets) && config.targets.length) };
}

function discoverTargets(root, baseLocale) {
  const found = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    if (DISCOVER_DIR_NAMES.test(path.basename(dir)) && entries.some((e) => e.isFile() && e.name === baseLocale)) {
      const rel = path.relative(root, dir).split(path.sep).join('/');
      found.push({ name: rel || '.', dir, baseLocale, languages: null });
    }
    for (const e of entries) {
      if (e.isDirectory() && !DISCOVER_SKIP.has(e.name)) walk(path.join(dir, e.name));
    }
  };
  walk(root);
  return found;
}

// ---------------------------------------------------------------------------
// Checking
// ---------------------------------------------------------------------------

function addFinding(entry, rule, severity, items) {
  if (severity === 'off' || !items.length) return;
  entry.findings.push({ rule, severity, items });
}

function checkTarget(target, config) {
  const { rules } = config;
  const patterns = compilePatterns(config.interpolation);
  const results = [];
  const basePath = path.join(target.dir, target.baseLocale);
  const label = (file) => `${target.name}/${file}`;

  if (!fs.existsSync(basePath)) {
    results.push({ label: label(target.baseLocale), path: basePath, role: 'base', findings: [
      { rule: 'load', severity: 'error', items: [`Base locale not found: ${basePath}`] },
    ] });
    return results;
  }

  const base = loadLocale(basePath);
  const baseEntry = { label: label(target.baseLocale), path: basePath, role: 'base', findings: [] };
  results.push(baseEntry);
  if (base.error) {
    addFinding(baseEntry, 'load', 'error', [base.error]);
    return results;
  }
  addFinding(baseEntry, 'duplicateKeys', rules.duplicateKeys, base.duplicates);
  addFinding(baseEntry, 'blankLines', rules.blankLines, findBlankLines(base.text));

  const present = fs.readdirSync(target.dir).filter((f) => f.endsWith('.json') && f !== target.baseLocale).sort();
  let files = present;
  if (target.languages) {
    files = present.filter((f) => target.languages.includes(f));
    for (const listed of target.languages.filter((f) => !present.includes(f))) {
      results.push({ label: label(listed), path: path.join(target.dir, listed), role: 'locale', findings: [
        { rule: 'load', severity: 'error', items: [`Configured language file not found: ${listed}`] },
      ] });
    }
  }

  const baseLineCount = splitLines(base.text).length;
  for (const file of files) {
    const filePath = path.join(target.dir, file);
    const entry = { label: label(file), path: filePath, role: 'locale', findings: [] };
    results.push(entry);
    const locale = loadLocale(filePath);
    if (locale.error) {
      addFinding(entry, 'load', 'error', [locale.error]);
      continue;
    }

    const { missingKeys, extraKeys, orderMismatch } = compareKeys(base.flat, locale.flat);
    const lineCount = splitLines(locale.text).length;

    addFinding(entry, 'duplicateKeys', rules.duplicateKeys, locale.duplicates);
    addFinding(entry, 'missingKeys', rules.missingKeys, missingKeys);
    addFinding(entry, 'extraKeys', rules.extraKeys, extraKeys);
    addFinding(entry, 'order', rules.order, orderMismatch ? [orderMismatch] : []);
    addFinding(entry, 'lineCount', rules.lineCount,
      lineCount !== baseLineCount ? [{ base: baseLineCount, target: lineCount, diff: lineCount - baseLineCount }] : []);
    addFinding(entry, 'blankLines', rules.blankLines, findBlankLines(locale.text));
    addFinding(entry, 'interpolation', rules.interpolation, checkInterpolation(base.flat, locale.flat, patterns));
    addFinding(entry, 'emptyValues', rules.emptyValues, findEmptyValues(base.flat, locale.flat));
    addFinding(entry, 'untranslated', rules.untranslated, findUntranslated(base.flat, locale.flat));
  }
  return results;
}

function run({ root = process.cwd(), configPath, targetNames } = {}) {
  const { config, targets, source, discovered } = loadConfig({ configPath, root });
  const selected = targetNames && targetNames.length ? targets.filter((t) => targetNames.includes(t.name)) : targets;
  if (targetNames && targetNames.length && !selected.length) {
    throw new Error(`No target matches ${targetNames.join(', ')}. Known: ${targets.map((t) => t.name).join(', ') || '(none)'}`);
  }

  const files = selected.flatMap((t) => checkTarget(t, config));
  const count = (sev) => files.reduce((n, f) => n + f.findings.filter((x) => x.severity === sev).length, 0);
  return {
    config: source,
    discovered,
    targets: selected.map((t) => ({ name: t.name, dir: t.dir, baseLocale: t.baseLocale, languages: t.languages })),
    files,
    summary: { files: files.length, errors: count('error'), warnings: count('warn') },
    _config: config,
    _targets: selected,
  };
}

// ---------------------------------------------------------------------------
// Fixing
// ---------------------------------------------------------------------------

function detectFormat(text) {
  const indentMatch = text.match(/^[ \t]+(?=")/m);
  return {
    indent: indentMatch ? indentMatch[0] : '  ',
    eol: text.includes('\r\n') ? '\r\n' : '\n',
    finalNewline: /\r?\n$/.test(text),
  };
}

function serialize(value, indent, level = 0) {
  const pad = indent.repeat(level + 1);
  const close = indent.repeat(level);
  if (value instanceof Map) {
    if (!value.size) return '{}';
    const items = [...value].map(([k, v]) => `${pad}${JSON.stringify(k)}: ${serialize(v, indent, level + 1)}`);
    return `{\n${items.join(',\n')}\n${close}}`;
  }
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    return `[\n${value.map((v) => pad + serialize(v, indent, level + 1)).join(',\n')}\n${close}]`;
  }
  return JSON.stringify(value);
}

function formatLike(root, format) {
  const body = serialize(root, format.indent).replace(/\n/g, format.eol);
  return body + (format.finalNewline ? format.eol : '');
}

function todoValue(baseValue) {
  if (baseValue instanceof Map) return new Map([...baseValue].map(([k, v]) => [k, todoValue(v)]));
  return typeof baseValue === 'string' ? `[TODO] ${baseValue}` : baseValue;
}

/** Rebuild `target` in `base` key order. Extra keys are kept (appended), never deleted. */
function reorderLike(base, target, fillMissing) {
  const out = new Map();
  for (const [key, baseValue] of base) {
    if (target.has(key)) {
      const value = target.get(key);
      out.set(key, baseValue instanceof Map && value instanceof Map ? reorderLike(baseValue, value, fillMissing) : value);
    } else if (fillMissing) {
      out.set(key, todoValue(baseValue));
    }
  }
  for (const [key, value] of target) if (!out.has(key)) out.set(key, value);
  return out;
}

/**
 * Apply safe fixes: reorder keys to match base, normalise formatting to the
 * base file (indent, EOL, final newline — which also removes blank lines) and,
 * with fillMissing, add missing keys as "[TODO] <base text>".
 * Files with parse errors or duplicate keys are skipped (a human must decide).
 */
function applyFixes(targets, { fillMissing = false } = {}) {
  const written = [];
  const skipped = [];
  const write = (filePath, original, content, hadBom) => {
    if (content === original) return;
    fs.writeFileSync(filePath, (hadBom ? '﻿' : '') + content, 'utf-8');
    written.push(filePath);
  };

  for (const target of targets) {
    const basePath = path.join(target.dir, target.baseLocale);
    if (!fs.existsSync(basePath)) continue;
    const base = loadLocale(basePath);
    if (base.error || base.duplicates.length) {
      skipped.push({ path: basePath, reason: base.error || 'duplicate keys' });
      continue;
    }
    const format = detectFormat(base.text);
    if (findBlankLines(base.text).length) write(basePath, base.text, formatLike(base.root, format), base.hadBom);

    let files = fs.readdirSync(target.dir).filter((f) => f.endsWith('.json') && f !== target.baseLocale);
    if (target.languages) files = files.filter((f) => target.languages.includes(f));
    for (const file of files) {
      const filePath = path.join(target.dir, file);
      const locale = loadLocale(filePath);
      if (locale.error || locale.duplicates.length) {
        skipped.push({ path: filePath, reason: locale.error || `duplicate keys: ${locale.duplicates.join(', ')}` });
        continue;
      }
      const fixed = reorderLike(base.root, locale.root, fillMissing);
      write(filePath, locale.text, formatLike(fixed, format), locale.hadBom);
    }
  }
  return { written, skipped };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const HELP = `Usage: node check-i18n.js [options]

Checks i18n JSON locale files against a base locale (default en.json).

Options:
  --config <path>    Config file (default: ./${CONFIG_FILE}; auto-discovers if absent)
  --root <dir>       Directory to resolve/auto-discover from (default: cwd)
  --target <names>   Only check these targets (comma-separated)
  --json             Machine-readable output
  --fix              Reorder keys + normalise formatting to match the base file
  --fix-missing      Like --fix, and also add missing keys as "[TODO] <base text>"
  -h, --help         Show this help

Exit codes: 0 = no errors, 1 = errors found, 2 = usage/config problem.`;

function parseArgs(argv) {
  const opts = { targetNames: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`${arg} needs a value`);
      return argv[++i];
    };
    if (arg === '--config') opts.configPath = next();
    else if (arg === '--root') opts.root = path.resolve(next());
    else if (arg === '--target') opts.targetNames.push(...next().split(',').map((s) => s.trim()).filter(Boolean));
    else if (arg === '--json') opts.json = true;
    else if (arg === '--fix') opts.fix = true;
    else if (arg === '--fix-missing') opts.fix = opts.fillMissing = true;
    else if (arg === '-h' || arg === '--help') opts.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  return opts;
}

function formatItem(rule, item) {
  if (rule === 'order') return `first difference at position ${item.index}: expected "${item.expected}", found "${item.found}"`;
  if (rule === 'lineCount') return `${item.target} lines vs ${item.base} in base (${item.diff > 0 ? '+' : ''}${item.diff})`;
  if (rule === 'interpolation') return `${item.key}: expected ${item.expected}, found ${item.found}`;
  if (rule === 'blankLines') return `line ${item}`;
  return String(item);
}

function printReport(result, fixResult) {
  const MAX = 20;
  const out = [];
  const where = result.config ? `config ${result.config}` : 'auto-discovered (no config file)';
  out.push(`i18n-check: ${result.targets.length} target(s), ${result.summary.files} file(s) — ${where}`);
  if (!result.targets.length) out.push('  No locale directories found. Create an i18n-check.config.json (see --help).');
  for (const t of result.targets) out.push(`  - ${t.name}: ${t.dir}`);
  out.push('');

  for (const file of result.files) {
    const hasError = file.findings.some((f) => f.severity === 'error');
    const status = hasError ? 'FAIL' : file.findings.length ? 'WARN' : 'OK  ';
    out.push(`${status} ${file.label}${file.role === 'base' ? ' (base)' : ''}`);
    for (const finding of file.findings) {
      const tag = finding.severity === 'error' ? 'error' : 'warn ';
      const shown = finding.items.slice(0, MAX).map((item) => formatItem(finding.rule, item));
      const more = finding.items.length > MAX ? ` … and ${finding.items.length - MAX} more` : '';
      if (shown.length === 1 && !['missingKeys', 'extraKeys', 'interpolation'].includes(finding.rule)) {
        out.push(`     ${tag} ${finding.rule}: ${shown[0]}`);
      } else {
        out.push(`     ${tag} ${finding.rule} (${finding.items.length}):`);
        for (const s of shown) out.push(`         ${s}`);
        if (more) out.push(`        ${more}`);
      }
    }
  }

  if (fixResult) {
    out.push('');
    out.push(`Fixed ${fixResult.written.length} file(s):`);
    for (const p of fixResult.written) out.push(`  ~ ${p}`);
    for (const s of fixResult.skipped) out.push(`  skipped ${s.path} (${s.reason})`);
  }
  out.push('');
  const { errors, warnings } = result.summary;
  out.push(errors ? `LANGUAGE DIFFERENCES: ${errors} error(s), ${warnings} warning(s)` : `All good: 0 errors, ${warnings} warning(s)`);
  console.log(out.join('\n'));
}

function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    console.error(`${err.message}\n\n${HELP}`);
    return 2;
  }
  if (opts.help) {
    console.log(HELP);
    return 0;
  }

  try {
    let result = run(opts);
    let fixResult = null;
    if (opts.fix) {
      fixResult = applyFixes(result._targets, { fillMissing: opts.fillMissing });
      result = run(opts); // report the post-fix state
    }
    const { _config, _targets, ...publicResult } = result;
    if (opts.json) console.log(JSON.stringify(fixResult ? { ...publicResult, fixed: fixResult } : publicResult, null, 2));
    else printReport(result, fixResult);
    return result.summary.errors ? 1 : 0;
  } catch (err) {
    console.error(`i18n-check: ${err.message}`);
    return 2;
  }
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = {
  parseOrdered,
  flatten,
  compareKeys,
  extractPlaceholders,
  compilePatterns,
  checkInterpolation,
  findBlankLines,
  findEmptyValues,
  findUntranslated,
  discoverTargets,
  loadConfig,
  run,
  applyFixes,
  reorderLike,
  main,
};
