# Submission — anjaly

## Track

- [x] Track A — Claude Code (Pro)
- [ ] Track B — claude.ai web (free)

## Course(s) completed

- Claude Academy: Claude Code in Action — 2026-10-08

## Proof

- **Completion badge:** [`claude-academy-badge-claude-code-in-action.pdf`](./claude-academy-badge-claude-code-in-action.pdf)
- **LinkedIn post:** https://lnkd.in/p/gjXUAGyN

## My artifact

**Track A** — subagent: [`subagents/anjaly-nestjs-api-architecture-reviewer.md`](../../subagents/anjaly-nestjs-api-architecture-reviewer.md)

`nestjs-api-architecture-reviewer` — a read-only Claude Code subagent that performs
comprehensive architecture reviews of NestJS backend projects: controllers, services,
modules, DTOs, DI, exception handling, and API contracts. It flags SOLID/separation-of-
concerns violations, circular dependencies, maintainability risk, and classifies the
regression risk (HIGH/MEDIUM/LOW) of every change it recommends, reporting back in a
structured Markdown format with file:line evidence for each finding. It never edits
source, schemas, or migrations.

Proof of it working: [`demo-nestjs/`](./demo-nestjs/) is a small NestJS project with
seven deliberately planted architecture/security issues (unvalidated DTO with a
client-settable `role`, stack-trace leakage, a `GET` route that deletes data, a
bidirectional circular module dependency, etc.) and [`demo-nestjs/REVIEW.md`](./demo-nestjs/REVIEW.md)
is the subagent's actual review output against it — it independently found all seven.
