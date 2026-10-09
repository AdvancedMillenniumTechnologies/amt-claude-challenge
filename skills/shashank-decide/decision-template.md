---
id: "NNNN"
title: <short statement of the decision, e.g. "Store all money values as integer paise">
status: proposed            # proposed | accepted | superseded | deprecated
date: YYYY-MM-DD
owner: <name>
enforcement: warn           # block | warn | off
applies_to:                 # globs of files these rules apply to
  - "src/**"
exclude: []                 # globs to skip, e.g. "src/legacy/**"
review_by: YYYY-MM-DD       # when to check this still makes sense
transition_until: null      # optional: until this date, "block" is treated as "warn"
supersedes: []              # ids this decision replaces, e.g. ["0004"]
superseded_by: null
---

# NNNN — <title>

## Context

<What problem or question forced a decision. Facts, numbers, ticket IDs. 2–5 sentences.>

## Decision

<What we will do, in one or two plain sentences.>

## Options considered

| Option | Fits current system | Cost now | Cost to run / later | Easy to undo? | Risk | At 10× scale |
|---|---|---|---|---|---|---|
| **<chosen>** | | | | | | |
| <alternative> | | | | | | |
| <alternative> | | | | | | |

**Why the chosen option:** <the deciding trade-off, in 2–3 sentences.>

## Consequences

- ➕ <what gets better>
- ➖ <what we accept as a cost>
- 🔁 **Revisit when:** <the signal that means this decision should be looked at again, e.g. "coupon redemptions > 200/sec">

## Rules

<!-- Each rule must be checkable by reading code. One line, specific, testable. -->

- **R1:** <rule>
  - hint: `<optional regex that finds likely violations in added lines>`
  - except: `<optional glob where this rule does not apply>`
- **R2:** <rule>

## Notes

<Links to tickets, Slack threads, meeting notes, benchmarks.>
