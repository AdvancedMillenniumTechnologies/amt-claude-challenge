---
name: decide
description: Records and manages the team's architecture decisions (ADRs) in the project's decisions/ folder. Three jobs - (1) "/decide <question>" weighs options and trade-offs for a technical choice and saves a decision with checkable rules; (2) "/decide brief <task>" tells a developer which saved decisions apply before they start a ticket; (3) "/decide init" writes down the unwritten rules an existing codebase already follows. Use when the user faces a long-lived technical choice (database, library, data format, API contract, service boundaries, a pattern every module must follow), starts work on a ticket or feature, pastes meeting notes or a thread about a technical choice, or asks why something is done a certain way.
argument-hint: "[<question> | brief <task> | init | accept <id> | retire <id>]"
---

# /decide — architecture decisions the team can check

Decisions are saved as one Markdown file each in the **`decisions/` folder at the root of the project** (`git rev-parse --show-toplevel`). The **decision-checker** subagent reads these files and checks code changes against their rules; `/pre-push-gate` runs it before every push.

`$ARGUMENTS` picks the mode:

| Arguments | Mode |
|---|---|
| `init` | **Init** — document the rules the codebase already follows |
| `brief <task>` | **Brief** — which decisions apply to a task (read-only) |
| `accept <id>` | **Accept** — mark a proposed decision as accepted |
| `retire <id>` | **Retire** — mark a decision as deprecated (no replacement) |
| anything else, or empty | **New decision** — the question, notes, or ticket to decide on |

If Claude invoked this skill on its own (the user is starting a ticket or discussing a choice), use **Brief** for "I'm starting X", and **New decision** for "should we use A or B" — but ask before saving any file.

## Ground rules

- **People decide, you advise.** Present options and a recommendation; the user and their team make the call. Never mark a decision `accepted` unless the user says the team has agreed.
- **Ask before writing any file.** Show the full draft first.
- **Never rewrite the meaning of an accepted decision.** Changes in meaning are a **new** decision that supersedes the old one. Typos and clearer wording may be fixed in place.
- **Never commit or push.** Tell the user what to commit.
- **Evidence over opinion.** Base options on what the codebase actually has (read it), and say when something is an assumption.

## File layout

```
decisions/
├── README.md          ← index of decisions (you keep it up to date)
├── 0001-<slug>.md     ← active decisions (proposed / accepted)
└── archive/           ← superseded and deprecated decisions
```

- File name: 4-digit id + kebab-case slug of the title, e.g. `0007-money-in-paise.md`.
- **Next id** = highest id found in `decisions/` **and** `decisions/archive/` + 1.
- Use the template `decision-template.md` in this skill's folder for every new decision. Keep the front-matter field names exactly as in the template — the decision-checker reads them.

Index format for `decisions/README.md`:

```markdown
# Architecture decisions

Checked automatically by the decision-checker before each push. Add or change one with `/decide`.

| ID | Decision | Status | Enforcement | Review by |
|---|---|---|---|---|
| [0007](0007-money-in-paise.md) | Store all money values as integer paise | accepted | block | 2027-04-01 |

Archived: [0004](archive/0004-services-via-queue.md) — superseded by 0015
```

---

## Mode: New decision

### Step 1 — Understand the question

- Take the question from `$ARGUMENTS` or the conversation. If the user pasted meeting notes, a Slack thread, or a ticket, pull out: the problem, the options already raised, the constraints, and who argued what.
- If key facts are missing (expected scale, deadline, hard constraints), ask **at most 3** short questions. Otherwise continue and state your assumptions.

### Step 2 — Is it worth a decision?

Record it only if **at least one** is true:

1. **Hard to undo** — database, framework, data format, public API contract, auth model, infrastructure.
2. **Affects many places** — a pattern every module or service must follow.
3. **The team disagreed** and the reasoning is worth keeping.
4. **Sets a convention** future tickets will hit again.

If none apply, say: "This is too small for a decision record — a short code comment where it's used is enough." and stop, unless the user insists.

### Step 3 — Check existing decisions

Read `decisions/README.md` and grep `decisions/` (not `archive/`) for the topic.

- **Already covered and the user agrees with it** → point to it and stop.
- **Covered, but the user wants to change it** → this is a **replacement**. Continue, and note the old id for Step 8.
- **Conflicts with another accepted decision** → say which, and ask how to resolve before continuing.

If `decisions/` doesn't exist, say it will be created with an index, and suggest `/decide init` later to capture existing conventions.

### Step 4 — Read the codebase

Find what's already in place that the decision touches: manifests (`package.json`, `pom.xml`, …), config, the modules involved, existing patterns for the same problem. Note the files the decision will apply to — this becomes `applies_to`.

### Step 5 — Options and trade-offs

Give **2–3 real options**. Include "keep what we have" when it's a real choice. Compare them in the template's table:

- **Fits current system** — uses what's already deployed and known?
- **Cost now** — build effort.
- **Cost to run / later** — operations, monitoring, licences, maintenance.
- **Easy to undo?** — *two-way door* (cheap to reverse) vs *one-way door* (data migrations, public contracts, vendor lock-in). One-way doors deserve more caution.
- **Risk** — correctness, security, data loss, delivery.
- **At 10× scale** — what breaks first.

Then recommend one, with the deciding trade-off in 2–3 sentences, and a **"Revisit when"** signal (a measurable trigger, not "if needed").

### Step 6 — Write the rules

Turn the decision into **1–5 rules** the decision-checker can verify by reading code:

- **Good:** "Coupon redemption must use one atomic update with the limit in the query filter — never read then update."
- **Bad (reject):** "Keep coupon code clean." / "Use best practices for concurrency."

For each rule, add a `hint:` regex when a text pattern can find likely violations (it only finds candidates — the checker confirms by reading the code), and `except:` globs where it doesn't apply.

Set the front matter:

- `applies_to` / `exclude` — from Step 4; as narrow as truthfully possible.
- `enforcement` — default **`warn`**. Suggest **`block`** only for data integrity, money, security, or tenant isolation, and ask the user.
- `review_by` — 6 months from today unless the "revisit when" signal suggests sooner.
- `transition_until` — only for a replacement that needs a migration period.
- `owner` — the user's git name (`git config user.name`).
- `status` — ask: **"Has the team already agreed on this?"** Yes → `accepted`. No → `proposed` (the checker shows proposed decisions as info only; accept later with `/decide accept <id>`).

### Step 7 — Show the draft, then save

Show the complete file. Ask: **"Save this as `decisions/<id>-<slug>.md`? (yes / edit / cancel)"**. On yes, write it and update `decisions/README.md`.

### Step 8 — Replacing an older decision

When this decision replaces one or more older ones:

1. New file: `supersedes: ["<old id>"]`, and its Context says **why** the old decision no longer holds.
2. Old file: change only `status: superseded` and `superseded_by: "<new id>"`. Leave its text as it was — it's history.
3. Move the old file to `decisions/archive/` (`git mv` if tracked, otherwise a normal move).
4. Update the index.

Existing code isn't blocked by the new decision — the checker only checks added lines.

### Step 9 — Hand over

Tell the user:

- Which files changed.
- **How to get it agreed:** for a one-way-door decision, open a small PR with only the decision file first and get the team's approval before writing the code; for a smaller one, include it in the feature PR — reviewers approve it with the code.
- Once agreed, `/decide accept <id>` (if saved as proposed).

---

## Mode: Brief

Read-only. Never write files in this mode.

1. Read the task from `$ARGUMENTS` or the conversation (ticket text, feature description).
2. If `decisions/` doesn't exist: say "No decisions recorded in this project yet — run `/decide init` to capture existing conventions." and stop.
3. Find the code the task will likely touch: grep for the task's key nouns (e.g. `coupon`, `checkout`), and look at the matching modules.
4. Load decisions with `status: accepted` (and `proposed`, listed separately). Keep those whose `applies_to` matches the likely files **or** whose topic clearly relates to the task.
5. Report:

```
## 📋 Decision brief — <task>

### Applies to this work
- **0007 Money in paise** (block) → <what it means for *this* task, concretely>
- **0002 Every query filters by tenantId** (block) → <…>

### Proposed (not yet agreed)
- 0013 … → <…>

### ❓ Not covered by any decision
- <a choice this task forces that no decision covers> → suggest `/decide "<question>"`

Likely files: <list>
```

Keep it short. If nothing applies, say so in one line.

---

## Mode: Init

Capture the conventions an existing codebase **already** follows, so they become checkable.

1. If `decisions/` already has decisions, list them and ask whether to continue.
2. Scan the project: manifests, folder structure, data models/schemas, data-access code, auth/guards, inter-service calls, money/date handling, error handling, config. Look for patterns that are **followed consistently** and **matter** — data integrity, security, tenant isolation, service boundaries, data formats, API conventions.
3. For each candidate, gather evidence: "followed in N of M places" with 2–3 example `file:line`. Drop anything followed in fewer than ~80% of places, or that a linter already enforces (formatting, naming style).
4. Present **3–7 candidates** as a numbered list with the evidence. Ask which to record.
5. Write the chosen ones from the template with `status: proposed`, `enforcement: warn`, and Context starting "Documented from existing code on <today>." Include the places that don't follow the rule under Notes, so the team can decide whether they're exceptions or bugs.
6. Create `decisions/README.md`. Tell the user to review them as a team in one PR, then `/decide accept <id>` for each one agreed.

---

## Mode: Accept / Retire

- **Accept `<id>`** — set `status: accepted` in the file and the index. Show the change and ask before saving.
- **Retire `<id>`** — for a decision that no longer applies and has no replacement: ask why, add the reason under Notes, set `status: deprecated`, move it to `decisions/archive/`, and update the index. If something *does* replace it, use New decision instead (Step 8).
