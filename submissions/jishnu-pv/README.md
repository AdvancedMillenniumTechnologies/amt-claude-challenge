# Submission — Jishnu PV

## Track

- [x] Track A — Claude Code (Pro)
- [ ] Track B — claude.ai web (free)

## Course(s) completed

- Claude Code in Action (Claude Academy) — 2026-10-09
- Claude 101 (Claude Academy) — 2026-10-06
- AI Fluency: Framework & Foundations (Claude Academy) — 2026-10-06

## Proof

- **Completion badges:**
  - [claude-code-in-action-badge.png](claude-code-in-action-badge.png)([verify online](https://academy.claude.com/verify/d0ab7a80e697e8c2820a0e496d2820ff))
  - [claude-101-badge.png](claude-101-badge.png)([verify online](https://academy.claude.com/verify/3bae740bc268674b0fc9621b5fabdf46))
  - [AI-Fluency-Framework-and-foundations-badge.png](AI-Fluency-Framework-and-foundations-badge.png)([verify online](https://academy.claude.com/verify/997f8ed781c77c6db6924b902417effc))
- **LinkedIn post:** https://lnkd.in/p/grfZwqjM

![Claude Code in Action — course completion badge](claude-code-in-action-badge.png)

## My artifact

**Track A**: MCP integration, [`mcp/jishnu-pv-gitlab-mcp/`](../../mcp/jishnu-pv-gitlab-mcp/)

A local MCP server (stdio) that lets Claude check and act on our company GitLab merge requests over the VPN. It lists your review queue across all projects and builds a one-call review package with automatic rule checks. The checks flag missing descriptions, drafts, conflicts, large diffs, code changes without tests, failing pipelines and unresolved threads. It also explains pipeline failures from job logs and JUnit test reports, reads files at any branch, compares branches or tags, and says exactly what is blocking a merge.

It is read-only by default. Write tools (comment, inline comment, resolve, approve, retry job, merge) stay hidden until `GITLAB_READONLY=false` is set, and merging needs explicit confirmation. It also supports a project allowlist, output size caps and clear error hints for VPN, 401, 403 and 404 problems. It is written in TypeScript with only two dependencies (`@modelcontextprotocol/sdk`, `zod`), includes ready-made prompts (`review_mr`, `debug_pipeline`, `my_review_queue`), and ships with a step-by-step [user guide](../../mcp/jishnu-pv-gitlab-mcp/USER_GUIDE.md), so any AMT developer can set it up in Claude Code, Cursor or Claude Desktop.
