---
name: pre-push-gate
description: Pre-PR quality gate. Asks for the base branch and a mode, runs the security-reviewer and decision-checker subagents plus a quality check on everything the branch would merge, then either reviews only (warnings) or commits and pushes — blocking on serious issues — and writes the PR description. Use when the user types /pre-push-gate or says their branch is ready for a PR.
argument-hint: "[base-branch] [auto|review]"
disable-model-invocation: true
---

# /pre-push-gate — pre-PR quality gate

Get the current branch ready for a pull request: check it, then (in auto mode) commit, push, and hand over a PR description.

Arguments (optional): `$ARGUMENTS` — a base branch and/or a mode, e.g. `/pre-push-gate dev auto` or `/pre-push-gate master review`. Anything not given is asked for.

## Safety rules — always

- **Ask before every git write.** Never commit, amend, or push without an explicit "yes" in this conversation.
- **Never** force-push, use `--no-verify`, rewrite pushed commits, or push directly to the base branch.
- **Never** auto-resolve a rejected push (no automatic pull/rebase/merge) — explain and stop.
- **Never** stage files that look like secrets (`.env*`, `*.pem`, `*.key`, `id_rsa*`, `*credentials*.json`, `*.p12`, `*.keystore`) — list them and ask the user to remove or ignore them.
- If a git hook fails, show its output and stop. Don't try to bypass it.

## Step 0 — Preflight

1. `git rev-parse --is-inside-work-tree` — if not a git repo, say so and stop.
2. `git branch --show-current` — if empty (detached HEAD), say so and stop.

## Step 1 — Ask for the base branch

Skip if `$ARGUMENTS` names a branch.

1. List candidates: `git branch -a --list "*main" "*master" "*dev" "*develop" "*release*"`.
2. Ask: **"Which branch will this work be merged into?"** — offer the candidates found as choices (use the AskUserQuestion tool if available, otherwise ask in plain text and wait).
3. Verify it exists: `git rev-parse --verify <base>`, else `origin/<base>`. If neither exists, say so and ask again.
4. If the current branch **is** the base branch, warn: "You're on `<base>` itself — /pre-push-gate is meant for a feature branch." In auto mode, stop and suggest `git checkout -b <new-branch>`. In review mode, continue and review uncommitted changes only.

## Step 2 — Ask for the mode

Skip if `$ARGUMENTS` says `auto` or `review`.

Ask: **"How should /pre-push-gate run?"**

- **Auto** — check, then commit and push for you. 🛑 serious issues **block** (nothing is committed or pushed); ⚠️ normal issues are warnings. You still approve the commit and the push.
- **Review only** — check and report. No git changes. Everything is reported as a warning; you commit and push yourself.

## Step 3 — Read the branch state

Run and remember:

- Merge base: `git merge-base HEAD <base>`
- Uncommitted changes: `git status --porcelain`
- Branch commits: `git log --oneline <merge-base>..HEAD`
- Upstream: `git rev-parse --abbrev-ref @{u}` (no upstream → nothing pushed yet). If it exists, unpushed commits are `git log --oneline @{u}..HEAD`.

If there are no branch commits **and** no uncommitted changes, say "Nothing to push against `<base>`" and stop.

## Step 4 — Security and decision checks

Run both subagents **in parallel** (one message, two calls). Each covers branch commits, uncommitted edits, and new files, and ends with `VERDICT: BLOCK` or `VERDICT: PASS`.

**4a. Security** — the **security-reviewer** subagent, prompt: `Branch review. base: <base>`.

- Keep its 🔴 / 🟠 / 🔵 findings for the report.
- If it isn't installed, say so (it lives in `subagents/shashank-security-reviewer.md` in the AMT toolbox). In **auto** mode, stop — don't push unchecked code. In **review** mode, continue and mark security as "not run".

**4b. Decisions** — only if a `decisions/` folder exists at the project root (`git rev-parse --show-toplevel`). Use the **decision-checker** subagent, prompt: `Branch review. base: <base>`.

- Keep its 🔴 / 🟠 / 🔵 / ❓ findings and its "Decision changes in this branch" section for the report and the PR description.
- No `decisions/` folder → skip it and mark decisions as "not set up — `/decide init` to start". This never blocks.
- Folder exists but the subagent isn't installed → say so (it lives in `subagents/shashank-decision-checker.md`). In **auto** mode, stop. In **review** mode, continue and mark decisions as "not run".

## Step 5 — Quality check

Look only at **added lines** in `git diff <merge-base>` (lines starting with `+`), plus the full content of new untracked files (`git ls-files --others --exclude-standard`). Ignore removed lines and files under `node_modules/`, `dist/`, `build/`, `vendor/`, and lockfiles.

**🛑 Blocking — always a mistake:**

| Check | What to look for |
|---|---|
| Debugger stops | `debugger;` (JS/TS), `breakpoint()`, `pdb.set_trace()`, `binding.pry`, `byebug`, `dd(` / `dump(` (PHP) |
| Merge conflict markers | lines starting with `<<<<<<<`, `=======` (alone on a line), `>>>>>>>` |
| Focused tests (silently skip the rest) | `it.only(`, `describe.only(`, `test.only(`, `fit(`, `fdescribe(`, `fcontext(` |
| Secret files added | any path matching the secret patterns in Safety rules |

**⚠️ Warning — usually wrong, sometimes intended:**

| Check | What to look for |
|---|---|
| Debug output | `console.log`, `print(`, `System.out.println`, `fmt.Println`, `var_dump` in non-test source files |
| Unfinished work | new `TODO`, `FIXME`, `HACK`, `XXX` |
| Commented-out code | 3+ consecutive added comment lines that look like code |
| Missing tests | source files changed but no test/spec file changed in the same diff |
| Large files | any added file over 1 MB |

Use Grep / `git diff` output to find these. Report each as `path:line — <check>`.

## Step 6 — Report

Show one combined report:

```
## /pre-push-gate report — <branch> → <base> (<mode> mode)

### Security (security-reviewer)
<🔴 / 🟠 / 🔵 findings, or ✅ clean>

### Decisions (decision-checker)
<🔴 / 🟠 / 🔵 / ❓ findings and decision changes, or ✅ follows all <n> applied decisions, or ➖ not set up>

### Quality
🛑 <blocking items>
⚠️ <warnings>

**Result:** 🛑 BLOCKED | ⚠️ READY WITH WARNINGS | ✅ READY
```

**Blocked** = security `VERDICT: BLOCK`, decisions `VERDICT: BLOCK`, or any 🛑 quality item.

If the decision-checker reports a **weakened** decision in this branch, show it as a ⚠️ warning even in a clean run — a reviewer must see it.

## Step 7a — Review only mode

Never run a git write in this mode.

- Present every finding as a warning. Label 🔴 / 🛑 items **"Serious — fix before you push"**.
- End with: "Review only — nothing was committed or pushed."
- Offer: "Want me to draft the PR description?" If yes, do Step 10.

## Step 7b — Auto mode

**If BLOCKED:** stop here. Say clearly:

> ⛔ Blocked — nothing was committed or pushed. Fix the items above, then run `/pre-push-gate` again.

For each blocking item, give the one-line fix. For a decision finding, the fix is either to follow the rule or — if the rule no longer fits — to replace the decision with `/decide` and get it agreed. Offer to make the fixes, but don't commit them as part of this run.

**If READY (with or without warnings):** show the warnings, then go on to Step 8. The approvals in Steps 8 and 9 are the user's chance to stop.

## Step 8 — Commit (auto mode)

1. **Uncommitted changes exist:**
   - List the files that will be staged. Exclude secret-pattern files (they would already have blocked).
   - Match the repo's commit style: look at `git log -10 --pretty=%s` (conventional commits like `feat:`, ticket prefixes like `NS-2541`, etc.). If the branch name contains a ticket ID and the repo uses ticket prefixes, include it.
   - Write the message: a short subject (≤ 72 chars) and a body with 2–4 bullets saying *what* and *why*.
   - Show the file list and the message. Ask: **"Commit with this message? (yes / edit / cancel)"**
   - On yes: `git add -- <listed files>` then `git commit -m "<subject>" -m "<body>"`.
2. **Everything already committed:** skip committing. If the latest commit is unpushed **and** its message is vague (`fix`, `wip`, `changes`, `update`, or under 10 characters), offer a better message and amend only on an explicit yes. Never amend a pushed commit.

## Step 9 — Push (auto mode)

Ask: **"Push `<branch>` to origin now? (yes / no)"**

- On yes: `git push -u origin <branch>` if there's no upstream, else `git push`.
- If the push is rejected (remote has new commits), stop and explain: "The remote branch has commits you don't have. Run `git pull --rebase` (or merge), re-run your tests, then `/pre-push-gate` again."
- On no: say "Committed locally, not pushed." and continue to Step 10.

## Step 10 — PR description

Build it from **all** commits in `<merge-base>..HEAD` and the diff summary (`git diff --stat <merge-base>`):

```markdown
## Summary
<1–2 sentences: what this PR does and why>

## Changes
- <grouped, plain-language bullets>

## Risk & impact
<what could break, who's affected; "Low — <reason>" if small>

## How to test
1. <steps a reviewer can follow>

## Rollback
<how to undo — usually "revert this PR"; mention migrations, flags, or config if any>

## Decisions
- Follows: <ids and titles of applied decisions>
- Introduces / replaces: <new or superseded decisions in this branch — reviewers, please approve these>
- ⚠️ Weakens: <any weakened decision, with what changed>

## Checks
- Security review: <✅ clean | n findings — summary>
- Decision check: <✅ follows n decisions | n findings — summary | not set up>
- Quality check: <✅ clean | warnings acknowledged: …>
```

Leave out the **Decisions** section when the project has no `decisions/` folder, and leave out any of its lines that would be empty.

Then give the PR link:

- Use the URL GitHub printed in the push output (`remote: Create a pull request ... https://...`), if there was one.
- Otherwise build it from `git remote get-url origin`: `https://github.com/<owner>/<repo>/compare/<base>...<branch>?expand=1` (convert `git@github.com:owner/repo.git` to `owner/repo`). For non-GitHub remotes, skip the link.

End with a one-line summary, e.g.:

> ✅ Pushed: 1 commit pushed to `feature/login`. Open the PR: <link>
