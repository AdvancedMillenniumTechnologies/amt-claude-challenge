---
name: i18n-checker
description: Validate i18n / translation JSON locale files against a base locale (default en.json) and fix safe issues. Use when the user asks to check translations, find missing or extra translation keys, validate locale/i18n files, compare language files, fix key order in translation files, debug {{placeholder}} / interpolation mismatches, or when a CI "LANGUAGE DIFFERENCES" / i18n check is failing. Works for Angular, React, Nest and Nx/monorepo projects.
---

# i18n Checker

Compare every locale file (e.g. `fr.json`, `es.json`) with the base locale (`en.json`) and report what's broken, using the bundled zero-dependency Node script.

## When to use this

- "Check our translations" / "are any i18n keys missing?"
- "The i18n check is failing in CI" or a build log shows `LANGUAGE DIFFERENCES`.
- After adding or renaming keys in `en.json`, to see which locales need updating.
- "Fix the key order in the translation files" / "add the missing keys as TODOs".

## The script

`scripts/check-i18n.js` lives in this skill's base directory (the folder containing this `SKILL.md`). Call it with an absolute path and **run it from the user's project root**:

```
node <skill-dir>/scripts/check-i18n.js [--config <file>] [--target <name>] [--json] [--fix | --fix-missing]
```

Requires Node 18+. No `npm install`.

## How to do it

1. **Find the config.** Look for `i18n-check.config.json` in the project root.
   - If it exists, use it.
   - If not, run the script anyway. It auto-discovers folders named `i18n`, `locales`, `lang` or `translations` that contain `en.json`. Show the user which folders it found and **offer to write a config file** (use `i18n-check.config.example.json` from this skill as the template). Ask whether the base locale is something other than `en.json`, and whether only some languages are supported per app (the `languages` list).

2. **Run the check with `--json`** so you can read the result reliably:
   ```
   node <skill-dir>/scripts/check-i18n.js --json
   ```
   Exit code `1` means errors, `0` means clean, `2` means a usage or config problem (read stderr).

3. **Summarise in plain language, worst first:**
   1. `load`: invalid JSON or a missing file. Nothing else can be checked for that file, so fix this first.
   2. `duplicateKeys`: the same key appears twice. `JSON.parse` silently keeps the last one, so a translation is being lost.
   3. `interpolation`: placeholders differ (`{{name}}` vs `{{nom}}`). This breaks at runtime.
   4. `missingKeys` / `extraKeys`: keys out of sync with the base.
   5. `order`, `blankLines`, `lineCount`: structural drift. Usually fixable automatically.
   6. Warnings (`emptyValues`, `untranslated`): worth a look, but they don't fail the build.

   Group by file, give counts, and list the actual keys. Don't paste the raw JSON back at the user.

4. **Offer fixes. Always ask first.**
   - `--fix`: reorders keys to match the base, then reformats each file using the base file's indentation, line endings and final newline. This also removes blank lines.
   - `--fix-missing`: does the same, and also adds each missing key with the value `"[TODO] <English text>"`.
   - Neither ever deletes extra keys or changes existing translation text. Files with invalid JSON or duplicate keys are skipped, because a human must decide which duplicate wins.
   - After fixing, show `git diff --stat` and a short diff of one file, then re-run the check.

5. **Fix the rest by hand, with the user's approval.** Resolve duplicates (ask which value is correct) and correct placeholder names in the target file to match the base exactly. Ask before removing extra keys. They may be keys the base forgot.

6. **Offer CI wiring** if the project doesn't have it yet:
   ```json
   // package.json
   "scripts": { "i18n:check": "node tools/check-i18n.js" }
   ```
   ```yaml
   # .github/workflows/i18n.yml
   name: i18n
   on: [pull_request]
   jobs:
     check:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with: { node-version: 20 }
         - run: npm run i18n:check
   ```
   (Copy `check-i18n.js` into the repo, e.g. `tools/`, so CI doesn't depend on a local skill folder.)

## Config reference

```json
{
  "baseLocale": "en.json",
  "interpolation": ["\\{\\{[^{}]+\\}\\}"],
  "rules": { "order": "error", "lineCount": "error", "emptyValues": "warn", "untranslated": "off" },
  "targets": [
    { "name": "da",     "dir": "apps/da/src/assets/i18n",     "languages": null },
    { "name": "four-c", "dir": "apps/four-c/src/assets/i18n", "languages": ["es.json", "fr.json", "uk.json"] }
  ]
}
```

- `dir` paths are relative to the config file.
- `languages: null` means every `*.json` in the folder. A list means only those files. A listed file that doesn't exist counts as an error.
- Each rule can be `"error"`, `"warn"` or `"off"` (`true`/`false` also work). Rules: `duplicateKeys`, `missingKeys`, `extraKeys`, `order`, `lineCount`, `blankLines`, `interpolation`, `emptyValues`, `untranslated`.
- For ICU or single-brace placeholders, add `"\\{[A-Za-z_][\\w.]*\\}"` to `interpolation`.

## Notes

- Nested keys are compared as dot paths (`orders.status.open`). Arrays are compared as single values.
- Key order is read straight from the file, so integer-like keys such as `"404"` keep their real position (`JSON.parse` would move them).
- A UTF-8 BOM is tolerated, and is preserved on `--fix`.
