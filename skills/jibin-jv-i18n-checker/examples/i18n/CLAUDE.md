# Translations (i18n)

`en.json` is the source of truth. Every other `*.json` here must mirror it exactly:
same keys, same nesting, same key order, same `{{placeholders}}`, no blank lines.

- When you add, rename or remove a key in `en.json`, make the same change in every locale.
  Use `"[TODO] <English text>"` as the value if you don't have a translation.
- Never rename or translate a placeholder: `{{name}}` stays `{{name}}` in every language.
- Never invent translations for languages you're unsure of. Leave a `[TODO]` instead.
- After editing, run the checker from the skill folder and make sure it reports 0 errors:
  `node ../../scripts/check-i18n.js --root ..`
