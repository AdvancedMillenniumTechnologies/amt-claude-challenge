# i18n Checker skill

**Author:** Jibin JV
**Type:** Agent Skill

## What it does

Checks i18n JSON translation files against the base locale (`en.json`), explains what's wrong, and fixes the safe issues for you. Ask Claude Code *"check our translations"* or *"why is the i18n CI step failing?"*. It runs the bundled script, summarises the problems worst-first, and offers to fix them.

It checks every locale file for:

| Check | Default | Catches |
|---|---|---|
| `load` | error | Invalid JSON (with the real parser message), missing base or listed language file |
| `duplicateKeys` | error | The same key twice in one object. `JSON.parse` silently drops one. |
| `missingKeys` / `extraKeys` | error | Keys out of sync with `en.json` (nested keys compared as dot paths) |
| `order` | error | Keys in a different order from the base. Reports the first differing position. |
| `lineCount` | error | Structural drift from the base file |
| `blankLines` | error | Blank lines (also checked in the base file) |
| `interpolation` | error | `{{name}}` in English but `{{nom}}` (or nothing) in the translation |
| `emptyValues` | warn | `""` where the base has text |
| `untranslated` | off | Value identical to English |

**Safe auto-fix.** `--fix` reorders keys and reformats each file to match the base file's indentation and line endings. `--fix-missing` also adds missing keys as `"[TODO] <English text>"`. It never deletes keys or changes existing translations. Files with duplicate keys are left for a human.

There are no dependencies (only Node 18+ built-ins), it handles Windows and Linux paths and CRLF line endings, and it is CI-friendly (exit code `1` on errors, plus a `--json` output mode).

## How I built it with Claude Code

- Started from the script we already run in our Nx monorepo's CI to compare `apps/*/src/assets/i18n/*.json` with `en.json`. That script had the app names and folder paths hardcoded, depended on `@nestjs/common` just to throw an error, and only said yes or no for key order.
- Asked Claude to classify the idea (skill vs subagent vs MCP). A skill fits best: the check itself is a fixed script, and Claude adds the explanation and the fixes on top.
- Had Claude plan, then generalise the script:
  - a config file plus auto-discovery replaced the hardcoded folders;
  - severity is configurable per rule;
  - a small order-preserving JSON parser catches duplicate keys and keeps the real position of keys like `"404"` (`JSON.parse` hides both);
  - placeholder comparison ignores whitespace;
  - CRLF line endings and the final newline are handled correctly.
- Added a safe `--fix` mode, then fixture files with deliberate mistakes (`examples/`) and a `node:test` suite covering every check, the fix mode and the exit codes.
- Wrote `SKILL.md` so Claude knows when to trigger, how to rank issues, and to always ask before fixing.

## How to run it

All commands need Node 18+. There is nothing to install.

### 1. Try the demo (from the repo root)

```bash
cd skills/jibin-jv-i18n-checker/examples
node ../scripts/check-i18n.js
```

`examples/i18n/` contains `en.json` (the base) and 8 locales: `am`, `ar`, `bn`, `es`, `fr`, `ro`, `ru` and `uk`. Most are clean. Three have deliberate mistakes, so you can see each check fire:

```
OK   demo/en.json (base)
OK   demo/am.json
FAIL demo/ar.json
     error interpolation (1):
         orders.count: expected {{count}}, found (none)
OK   demo/bn.json
OK   demo/es.json
FAIL demo/fr.json
     error missingKeys (1):
         orders.status.closed
     error extraKeys (1):
         orders.legacy
     error lineCount: 19 lines vs 18 in base (+1)
     error blankLines: line 6
     error interpolation (1):
         app.welcome: expected {{name}}, found {{nom}}
     warn  emptyValues: orders.empty
OK   demo/ro.json
FAIL demo/ru.json
     error duplicateKeys: orders.status.open
     error order: first difference at position 0: expected "app.title", found "app.welcome"
     error lineCount: 19 lines vs 18 in base (+1)
OK   demo/uk.json

LANGUAGE DIFFERENCES: 9 error(s), 1 warning(s)
```

### 2. Run it on your own project

From your project root (point `node` at wherever this skill's folder is):

```bash
# auto-discover any i18n/, locales/, lang/ or translations/ folder that has an en.json
node path/to/jibin-jv-i18n-checker/scripts/check-i18n.js

# use a config (copy i18n-check.config.example.json to i18n-check.config.json first)
node path/to/jibin-jv-i18n-checker/scripts/check-i18n.js --config i18n-check.config.json

# check only one app from the config
node path/to/jibin-jv-i18n-checker/scripts/check-i18n.js --target four-c

# machine-readable output (for CI or other tools)
node path/to/jibin-jv-i18n-checker/scripts/check-i18n.js --json

# safe fixes: reorder keys + normalise formatting, then re-check
node path/to/jibin-jv-i18n-checker/scripts/check-i18n.js --fix

# same, and also add missing keys as "[TODO] <English text>"
node path/to/jibin-jv-i18n-checker/scripts/check-i18n.js --fix-missing

# all options
node path/to/jibin-jv-i18n-checker/scripts/check-i18n.js --help
```

Exit codes: `0` means no errors, `1` means errors were found (fails the CI build), `2` means bad options or a broken config.

> `--fix` rewrites files. Commit first, or try it on a copy, so you can review the result with `git diff`.

### 3. Use it through Claude Code (as a skill)

Copy this folder to `.claude/skills/i18n-checker/` in your project, or to `~/.claude/skills/i18n-checker/` to use it in every project. Then just ask:

> "Check our translation files"
> "Why is the i18n CI step failing?"
> "Add the missing i18n keys as TODOs and fix the ordering"

Claude runs the script, explains the problems worst-first, and asks before changing anything.

### 4. Add it to CI

Copy `scripts/check-i18n.js` into your repo (e.g. `tools/check-i18n.js`), then:

```json
"scripts": { "i18n:check": "node tools/check-i18n.js" }
```

and run `npm run i18n:check` in your pipeline.

### 5. Run the tests

```bash
cd skills/jibin-jv-i18n-checker
node --test tests/
```

## Files

```
jibin-jv-i18n-checker/
├── SKILL.md                         ← instructions Claude follows
├── README.md
├── i18n-check.config.example.json
├── scripts/check-i18n.js            ← the checker (zero deps)
├── tests/check-i18n.test.js         ← node:test suite
└── examples/
    ├── i18n-check.config.json       ← demo config
    └── i18n/
        ├── CLAUDE.md                ← translation rules Claude follows when editing this folder
        ├── en.json                  ← base locale
        └── am, ar, bn, es, fr, ro, ru, uk .json
```
