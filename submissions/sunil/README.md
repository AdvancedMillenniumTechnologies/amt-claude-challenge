# Submission — sunil

## Track

- [x] Track A — Claude Code (Pro)
- [ ] Track B — claude.ai web (free)

## Course(s) completed

- <course name> — <completion date>

## Proof

- **Completion badge:** <screenshot filename in this folder, or link>
- **LinkedIn post:** <link>

## My artifact

**Track A** — link to the skill / subagent / MCP you added elsewhere in this repo:
- [`subagents/angular-nestjs-mongodb-fullstack-upgrade-migration.md`](../../subagents/angular-nestjs-mongodb-fullstack-upgrade-migration.md)

A single subagent that analyzes and plans upgrades across Angular, Node.js/NestJS, and MongoDB/Mongoose together — treating version bumps in one layer (e.g. TypeScript, RxJS, Mongoose/driver) as constraints on the others, instead of upgrading each in isolation. It runs in five modes: Analyze (read-only compatibility matrix), Latest Version & Dependency Discovery (resolves "latest" to the latest *mutually compatible* stack and flags peer-dependency/transitive conflicts), Plan (phased migration plan with a dependency resolution order), Migrate (applies one approved dependency group at a time, including MongoDB schema/data migrations with pre-migration counts, validation, and rollback scripts), and Validate (build/lint/test/connection checks plus a final dependency health report).
