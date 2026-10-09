# Submission — Rahman

## Track

- [x] Track A — Claude Code (Pro)
- [ ] Track B — claude.ai web (free)

## Course(s) completed

- Claude Code in Action — October 8, 2026

## Proof

- **Completion badge:** [`claude-code-in-action-badge.png`](claude-code-in-action-badge.png)
- **LinkedIn post:** https://lnkd.in/p/eTaSix9S

## My artifact

**Track A** — subagent: [`subagents/rahman-testcase-agent.md`](../../subagents/rahman-testcase-agent.md)

### What it does

`testcase-agent` raises test coverage on a module or a whole repo. It:

1. Works out the language, test framework, test command and existing test style.
2. Finds exported functions with no tests or too few.
3. Writes the missing tests (happy path, edge cases, error cases) in the repo's own style.
4. Runs the suite and sorts each failure into "bad test" (fixed by the agent) or "likely app bug" (test is skipped and a numbered fix is proposed).
5. Returns a report: functions analyzed, tests created, pass/fail/skip, proposed fixes, and what is still uncovered.

It writes test files only. Production code is changed only when the user approves a fix by number ("apply fix #1", "apply all fixes"), and only that fix is applied.

### How I built and tested it

- Wrote the subagent definition with a strict "test files only" rule and an explicit two-run approval flow, since a subagent can't pause to ask for approval mid-run.
- Wrapped it in a small `/rahman-testcase-agent` skill so it can be run as `/rahman-testcase-agent` (whole repo), `/rahman-testcase-agent src/services`, or `/rahman-testcase-agent apply fix #N`.
- Validated it on a small JavaScript (`node:test`) sandbox with two planted bugs:
  - **Run 1:** analyzed 4 functions and added 19 tests. 16 passed, 0 failed, 4 skipped. It found both planted bugs (`applyDiscount` subtracting the raw percent, `capitalize` crashing on `""`) and proposed fix #1 and fix #2 without touching production code.
  - **Run 2 (`apply fix #1`):** applied only fix #1 and un-skipped its 3 tests: 19 passed, 1 skipped.
  - **Run 3 (`fix all`):** applied fix #2: 20/20 passed, 0 skipped.

### How to install

See the "How to install" section at the bottom of the subagent file. In short: copy it into `.claude/agents/` (or `~/.claude/agents/`), then ask Claude to "use the testcase-agent on src/…".
