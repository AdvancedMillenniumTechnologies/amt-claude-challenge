# /pre-push-gate — pre-PR quality gate

**Author:** Shashank
**Type:** Agent Skill. Uses the [security-reviewer](../../subagents/shashank-security-reviewer.md) subagent, plus the [decision-checker](../../subagents/shashank-decision-checker.md) when the project has recorded decisions.

## What it does

One command to get a branch ready for a pull request. It runs a security review, checks the code against the team's recorded architecture decisions, and runs a quality check on everything the branch would merge. Then it either just reports, or commits, pushes, and writes the PR description for you.

```
/pre-push-gate
 ├─ Asks: which base branch?        (dev / develop / main / master …)
 ├─ Asks: auto or review only?
 │
 ├─ Security check   → security-reviewer subagent  ┐ run in
 ├─ Decision check   → decision-checker subagent   ┘ parallel
 │                     (only if the project has a decisions/ folder — see /decide)
 ├─ Quality check    → debugger, conflict markers, .only tests, secret files,
 │                     console.log, TODOs, missing tests, large files
 │
 ├─ Review only → report everything as warnings. No git changes.
 └─ Auto        → 🛑 serious issue? STOP, nothing committed or pushed
                  ⚠️ warnings only? show them, then:
                  write commit message → you approve → commit
                  → you approve → push → PR description + PR link
```

## Why both modes

Blocking only means something when the tool controls the commit and push. In **auto** mode `/pre-push-gate` does both, so a serious issue really stops the code. If you prefer to commit and push yourself, **review only** gives the same checks as warnings, with no git changes.

It doesn't matter whether you've already committed. `/pre-push-gate` checks the **whole branch against the branch it will merge into**: committed, uncommitted, and new files.

## What it needs

| Installed | What the gate does |
|---|---|
| **Gate + Security Reviewer** (minimum) | Security check + quality check, then commit, push, and PR description |
| **+ Decision Checker**, in a project with a `decisions/` folder | Also checks the code against the team's recorded decisions (see [`/decide`](../shashank-decide/)) |
| Project has no `decisions/` folder | The decision check is skipped quietly. Nothing breaks |
| Security Reviewer missing | **Auto mode stops**, so code is never pushed without a security check. Review mode continues and shows "security not run" |

## What blocks vs. warns (auto mode)

| 🛑 Blocks | ⚠️ Warns |
|---|---|
| Security finding rated 🔴 (injection, one user reaching another's data, leaked secret…) | Security 🟠 / 🔵 findings |
| Breaking a decision marked `enforcement: block` | Breaking a `warn` decision; a decision weakened in this branch |
| `debugger;`, `breakpoint()`, `pdb.set_trace()` | `console.log`, `print(`, `System.out.println` |
| Merge conflict markers | New `TODO` / `FIXME` |
| `it.only` / `fdescribe` (silently skips other tests) | Commented-out code |
| `.env`, `*.pem`, `*.key` files being added | Source changed without tests, files over 1 MB |

## Safety rules

- Asks before every commit and every push.
- Never force-pushes, never uses `--no-verify`, never rewrites pushed commits, never pushes to the base branch.
- If a push is rejected, it explains how to sync and stops. It never auto-rebases.

## Install

1. Copy this folder to `.claude/skills/pre-push-gate/` in your project (or `~/.claude/skills/pre-push-gate/` for all projects).
2. Copy [`subagents/shashank-security-reviewer.md`](../../subagents/shashank-security-reviewer.md) to `.claude/agents/security-reviewer.md` (same level: project or user).
3. Copy [`subagents/shashank-decision-checker.md`](../../subagents/shashank-decision-checker.md) to `.claude/agents/decision-checker.md`, and the [`/decide`](../shashank-decide/) skill to `.claude/skills/decide/`. (Optional: without a `decisions/` folder in the project, the decision check is skipped.)
4. Start a new Claude Code session.

## Use: all the ways to type it

The command takes two optional words. Each one answers a question in advance, so it doesn't need to ask:

```
/pre-push-gate   dev    auto
      │           │      │
      │           │      └── Mode: auto = commit + push for you (blocks on serious issues)
      │           │                review = report only, no git changes
      │           └───────── Base branch: the branch your PR will merge into
      └───────────────────── The command: run the security, decision and quality checks
```

| You type | What it asks you | What it does |
|---|---|---|
| `/pre-push-gate` | Base branch? Mode? | Asks both questions, then runs |
| `/pre-push-gate dev` | Mode? | Knows the branch, asks only the mode |
| `/pre-push-gate dev auto` | Nothing | Compares with `dev`, checks, then commits and pushes with your approval |
| `/pre-push-gate dev review` | Nothing | Compares with `dev`, reports only, no git changes |
| `/pre-push-gate master auto` | Nothing | Same as `dev auto`, but compares with `master` |
| `/pre-push-gate master review` | Nothing | Same as `dev review`, but compares with `master` |

Use any branch name your team merges into: `main`, `develop`, `release/2.0`, and so on.

**Example: long way vs. short way (same result)**

```
You:    /pre-push-gate
Claude: Which branch will this be merged into?  → dev / master
You:    dev
Claude: Auto or review only?
You:    auto
→ runs
```

```
You:    /pre-push-gate dev auto
→ runs immediately
```

> **Note:** the two words skip only the *starting* questions. In `auto` mode it **still asks for your OK before committing and again before pushing**.

**Tip:** type `/pre` and press Tab, and Claude Code completes the command name.

## How I built it with Claude Code

- Started from the security-reviewer subagent and made it end with a fixed `VERDICT: BLOCK | PASS` line, so this skill can read the result and act on it.
- Gave the decision-checker the same last line, so adding it to the gate took one extra step. It runs at the same time as the security check.
- Designed the two modes after realising that "blocking" means nothing if the developer pushes by hand.
- Set `disable-model-invocation: true` so Claude can't start `/pre-push-gate` on its own. It commits and pushes, so only a person typing the command can start it.
- Tested on throwaway repos, pushing to a local test remote instead of GitHub:

  | Scenario | Result |
  |---|---|
  | Auto, branch already committed with `debugger;` + `console.log` | 🛑 Blocked on `debugger`, warned on `console.log`, nothing committed or pushed |
  | Review only, branch with 6 serious security bugs | Reported all as "Serious — fix before you push", no git changes |
  | Auto, clean except a `console.log` (uncommitted) | ⚠️ Warned → proposed commit message → asked → committed → asked → pushed → PR description |
  | Plain `/pre-push-gate` | Asked for base branch (listed `dev`, `main`), then mode |
  | Review only, branch breaking 3 recorded decisions and weakening a 4th | Security + decision checks ran in parallel, both `BLOCK`; decision report listed each broken rule, the weakened decision, and that the index was stale; no git changes |
