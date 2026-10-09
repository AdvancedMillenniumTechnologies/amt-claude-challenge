# /decide — architecture decisions the team can check

**Author:** Shashank
**Type:** Agent Skill. Works alone, and works best with the [decision-checker subagent](../../subagents/shashank-decision-checker.md) and [`/pre-push-gate`](../shashank-pre-push-gate/).

## The problem

Teams make important technical decisions — "money is stored in paise", "services talk only through the queue", "every query filters by tenant". Then:

- the reasons are lost in old chats and meetings,
- months later someone breaks the decision without knowing it existed,
- new joiners ask "why is it done this way?" and nobody remembers.

Code reviewers check whether code is *good*. Nothing checks whether it follows **what the team already decided**.

## What it does

`/decide` records decisions as short files in a **`decisions/` folder at the root of each project**, each with **rules that can be checked against code**. The decision-checker subagent then checks every branch against those rules, automatically, inside `/pre-push-gate`.

```
  DECIDE                      BUILD                    CHECK & PUSH
  ──────                      ─────                    ────────────
  /decide "<question>"        /decide brief <ticket>   /pre-push-gate dev auto
   ├─ reads the codebase       └─ which decisions        ├─ security-reviewer
   ├─ 2–3 options + trade-offs    apply before you       ├─ decision-checker  ◄── reads decisions/
   ├─ recommendation              write any code         ├─ quality check
   └─ saves decisions/0012-*.md                          └─ commit → push → PR description
```

| You type | What happens |
|---|---|
| `/decide Should coupon usage limits use Mongo $inc or Redis?` | Compares options (cost now, cost later, **easy to undo?**, risk, 10× scale), recommends one, writes checkable rules, saves the decision after you approve |
| `/decide` + paste a Slack thread or meeting notes | Same, starting from the discussion that already happened |
| `/decide brief NS-2541 coupons at checkout` | Lists the decisions that apply to this ticket and what they mean for it — before you code |
| `/decide init` | Scans an existing project and proposes 3–7 decisions it already follows (with evidence), for the team to confirm |
| `/decide accept 0012` | Marks a proposed decision as agreed |
| `/decide retire 0004` | Marks a decision as no longer applying (moved to `archive/`) |

Claude can also start `/decide brief` on its own when you say "I'm starting ticket X", and suggest `/decide` when you're weighing a long-lived choice. It always asks before saving a file.

## Use it alone or with the other tools

| Setup | What you get |
|---|---|
| **`/decide` alone** | Decisions are written down, and developers get a briefing at the start of a ticket. Nothing checks the code automatically, so you rely on people reading the briefing. |
| **`/decide` + Decision Checker** | You can also ask "does my change follow our decisions?" at any time, and get a list of rule breaks with fixes. |
| **`/decide` + Decision Checker + [`/pre-push-gate`](../shashank-pre-push-gate/)** | Every push is checked automatically. Breaking a "block" decision stops the push, and the PR description lists which decisions the change follows or adds. **Recommended.** |

## Cheat sheet

| I want to… | Type in Claude Code |
|---|---|
| Write down the rules my project already follows | `/decide init` |
| Approve a decision | `/decide accept 0001` |
| Make a decision strict (stops the push) | `set decision 0001 to block` |
| Change a proposed decision | `change decision 0004 so it doesn't apply to test files` |
| Remove a proposed decision | `delete proposed decision 0001 and update the decisions index` |
| Stop using an approved decision | `/decide retire 0001` |
| Record a new decision | `/decide Should we use Redis or MongoDB for coupon counters?` |
| See which decisions apply to my ticket | `/decide brief NS-2541 coupons at checkout` |
| Check my code against decisions | `Use the decision-checker on my changes against dev` |
| Check everything before pushing | `/pre-push-gate dev review` |

**Tip:** you don't need exact commands. Plain words work too, for example "approve all decisions except 0006".

### After `/decide init`: approving the decisions

`/decide init` saves every decision as **proposed**. The checker ignores proposed decisions until you approve them.

1. **Read them:** open `decisions/`, or ask "list the proposed decisions in plain words".
2. **Fix any that aren't quite right:** "change decision 0004 so it doesn't apply to test files".
3. **Approve the ones you agree with**, one at a time: `/decide accept 0001`. Claude shows the change and asks before saving.
4. **Delete the ones you don't want:** "delete proposed decision 0006 and update the decisions index".
5. **Make the critical ones strict:** "set decision 0002 to block".
6. **Check it works:** "Use the decision-checker on my changes against dev".
7. **Share it:** commit `decisions/` in a PR so the team reviews and uses the same rules.

## What a decision looks like

```markdown
---
id: "0007"
title: Store all money values as integer paise
status: accepted          # proposed | accepted | superseded | deprecated
enforcement: block        # block | warn | off
applies_to: ["src/**/*.ts"]
exclude: ["src/legacy/**"]
review_by: 2027-04-01
---
## Context · ## Decision · ## Options considered · ## Consequences

## Rules
- **R1:** Money fields in schemas/DTOs are integers in paise, named `*Paise`.
  - hint: `(amount|price|total|discount)\w*\s*[:?]\s*number`
- **R2:** No `parseFloat` / `toFixed` on money outside the display layer.
  - except: `src/ui/format/**`
```

Full template: [`decision-template.md`](decision-template.md).

## Design decisions (and why)

| Choice | Why |
|---|---|
| **One file per decision** in `decisions/` at the project root | It lives next to the code, changes version with it, and is reviewed in the same PR. Two people adding decisions at once don't clash. This is the standard way to record architecture decisions (called "ADRs"). |
| **Rules must be checkable** | "Keep code clean" can't be checked. `/decide` turns down vague rules and asks for specific ones. |
| **`/decide` refuses small choices** | Only choices that are hard to undo, affect many places, or the team argued about get recorded: about 1–4 a month. The folder stays small (about 150 KB a year) and worth reading. |
| **People decide, Claude advises** | `/decide` writes the draft. The team approves the file in a PR. Only `accepted` decisions are checked. |
| **Never rewrite an agreed decision** | To change one, you write a **new** decision that replaces it. The old one moves to `archive/` unchanged, so the reason for the change is never lost. |
| **Only new code is checked** | Changing a decision never breaks existing code. `transition_until` gives a grace period during which a "block" decision only warns. |
| **Default `warn`, `block` for the few that matter most** | Easier for a team to start with. Money, security, data correctness, and keeping customers' data apart deserve `block`. |
| **Agreed exceptions in code** | `// decision-exception: 0007-R2 reason: SDK returns float` is visible, reviewed, and counted. If one rule has 5+ exceptions, the checker says the rule is probably wrong. |
| **Weakening a decision is always reported** | If a branch lowers a decision's strictness or removes a rule, the gate and the PR description say so. No one can quietly loosen a rule to get past the check. |

## Life of a decision

```
proposed ──/decide accept──► accepted ──/decide (a new one replaces it)──► superseded → archive/
                                     └──/decide retire──────────────────► deprecated → archive/
```

## Install

1. Copy this folder to `.claude/skills/decide/` in your project (or `~/.claude/skills/decide/` for all projects).
2. Copy [`subagents/shashank-decision-checker.md`](../../subagents/shashank-decision-checker.md) to `.claude/agents/decision-checker.md` (same level).
3. Optional but recommended: install [`/pre-push-gate`](../shashank-pre-push-gate/) so every push is checked against your decisions.
4. Start a new Claude Code session. In an existing project, start with `/decide init`.

Commit the project's `decisions/` folder. It's team knowledge, just like the code.

## How I built it with Claude Code

- **Started from a real problem.** On long-running projects, the costly mistakes are broken decisions nobody remembered, and code reviewers don't check for them.
- **Talked the design through with Claude before writing anything:** where decisions live, who approves them, how they change without losing history, how to stop people quietly weakening a rule, and how to keep the folder small.
- **Built the checker the same way as my Security Reviewer:** read-only, "check before you report", and a `VERDICT: BLOCK | PASS` last line. Adding it to `/pre-push-gate` then took a single extra step.
- **Tested every mode with Claude Code** on a demo project with rule breaks planted on purpose (below).

## How I tested it

A throwaway NestJS + MongoDB project ("demo-shop") with three accepted decisions on `master`:
- **0002** every query filters by customer account (`tenantId`), set to block
- **0004** modules talk through the queue, set to warn, with its review date already passed
- **0007** money in paise, set to block

A feature branch for ticket NS-2541 (coupons) then added decision **0012** (counters must be updated in one safe step, set to block), quietly switched 0004 to `off`, and broke rules on purpose. One of the breaks was in a file that wasn't even committed yet.

**decision-checker** (`base: master`) → `VERDICT: BLOCK`, 5 block findings:

| Planted | Result |
|---|---|
| `findOne({ code })` with no `tenantId` | 🔴 caught — 0002-R1 |
| Read the coupon, check the limit, then update separately (two users can both get through) | 🔴 caught — 0012-R1 (a decision added *in the same branch*), with the one-step fix |
| `discount: number` in schema | 🔴 caught — 0007-R1 |
| `parseFloat` on money in a controller **not yet committed** | 🔴 caught — 0007-R2 |
| `decision-exception: 0007-R2 reason: tbd` | 🔴 caught — placeholder reason rejected |
| `decision-exception` with a real reason | ✅ accepted, listed as Info |
| 0004 lowered `warn` → `off` | ⚠️ flagged as weakened — and it noticed the same branch adds the cross-module call 0004 forbids |
| `ioredis` added, unused | 🔵 flagged — contradicts 0012's "no Redis for now" |
| 0004 past its `review_by` date | 🔵 flagged |
| `listActive()` with `tenantId`, existing `orders` code | ✅ not flagged |

**`/decide brief NS-2890 gift cards`** → listed 0007, 0002 and 0012 with what each means for gift cards concretely (e.g. "spend balance with one atomic `$inc` and the sufficiency check in the filter"), warned that the coupon code it might copy breaks 0012, and named two choices no decision covers (partial refunds, expiry).

**`/decide` "cache product prices: Redis, in-memory, or Mongo index?"** → read the repo first (found `ioredis` unused, linked 0004 and 0007 in the rules), compared all three on cost, reversibility, risk and 10× scale, drafted 0013 as `proposed` with 4 checkable rules — and asked before saving.

**`/decide` "for-of or forEach?"** → declined: "too small for a decision record — a short code comment is enough."

**`/pre-push-gate master review`** → ran security-reviewer and decision-checker in parallel, both `BLOCK`, combined report, no git changes.
