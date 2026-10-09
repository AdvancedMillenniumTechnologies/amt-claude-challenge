# Offboard skill

**Author:** Dibeesh
**Type:** Agent Skill

## What it does

When someone resigns or is let go, the risky part is not the HR paperwork. It's what nobody remembers: the branch only they were working on, the `billing/` folder only they understand, the CI token named after them that breaks two weeks later, and the AWS key that still works after their account is gone.

Tell Claude Code *"Jane resigned, last day Friday, offboard her"* or *"we're terminating X today, what access do we need to pull?"*. The skill then:

1. **Asks once** for identities (git emails, GitHub handle, tracker user), the type of exit, the last day, the successor and which systems the company uses.
2. **Picks a mode.** The order of operations flips between the two:
   - **Resigned:** knowledge transfer first while they're still helpful, then revoke access on the last day.
   - **Terminated:** revoke access first, in the same hour, then rebuild the handover from their footprint. The plan is written outside shared repos so the person can't see it.
3. **Finds pending work:** open PRs, review requests, unmerged branches and open tracker tasks.
4. **Finds knowledge silos:** files where they wrote 80% or more of the commits, and the next-best person to own each one.
5. **Finds landmines:** CODEOWNERS entries, alert contacts, CI secrets and deploy keys, cron jobs and runbooks that point at them.
6. **Writes one plan,** `offboarding/<name>-<date>.md`, containing:
   - the top risks
   - an ordered access-revocation checklist (SSO first, then everything SSO doesn't cover, then credential rotation)
   - a handover table with new owners and due dates
   - a knowledge-transfer agenda
   - a 30-day watch list

### What it will not do

- **It never revokes, deletes or rotates anything.** It produces the checklist and a human runs it.
- **It leaves nothing the person could see:** no comments, branches or messages.
- **It records facts only,** with no performance opinions, because HR or legal may read the plan.
- **It stays out of private data:** no DMs or email, only repos, trackers, CI and infra config.

## How to use it

Copy `dibeesh-offboard/` into `~/.claude/skills/` (or into your project's `.claude/skills/`). Then, in a repo the person worked on:

> "Rahman is leaving, last day Oct 31. Offboard him."

It works with plain git. It does more when `gh` is authenticated (PRs, deploy keys, secrets, webhooks) and when a tracker MCP (Phabricator, Jira or Linear) is connected (open tasks).

## How I built it with Claude Code

- I started from a real startup problem: when someone leaves suddenly, nobody knows what they owned or what access they had.
- I asked Claude to check the idea before building it. That review shaped three design decisions:
  - Resigned and terminated exits need **opposite orders** of operations.
  - The skill must **never revoke access itself**.
  - The scope should stay on what Claude can actually discover: git, `gh`, trackers and config files.
- Claude drafted the `SKILL.md`. I tested every git command against the commit history of this challenge repo.
  - The test found a real bug: `git shortlog` inside a pipe reads stdin unless you pass it a ref. That's fixed.
- Last, I tuned the knowledge-silo detection to count only files that still exist, and to group results by directory so a whole orphaned module stands out.
