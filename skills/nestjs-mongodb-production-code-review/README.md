# NestJS/MongoDB Production Code Review Agent

A Claude Code skill for performing production-focused code reviews of **NestJS + MongoDB applications**.

The skill analyzes changed code and provides structured, actionable feedback across backend architecture, MongoDB performance, API design, testing, code quality, security, and maintainability.

It is designed to help developers catch production issues **before code reaches review or deployment**.

---

## 🎯 Problem

Traditional code reviews often focus on whether the implementation works, while production-impacting issues can remain hidden.

For NestJS and MongoDB applications, these issues commonly include:

- Inefficient MongoDB queries
- Missing or incorrect indexes
- Expensive `$lookup` operations
- N+1 query patterns
- Unnecessary aggregation stages
- Incorrect NestJS dependency injection patterns
- Missing DTO validation
- Weak error handling
- Insufficient Jest test coverage
- Sonar/code-quality issues
- TypeScript anti-patterns
- Security vulnerabilities
- Performance regressions

This skill provides a repeatable review process specifically focused on these areas.

---

## 🚀 What the Skill Does

The skill reviews the relevant changed files and evaluates them against production-readiness criteria.

### 1. NestJS Architecture

Checks for:

- Controller/service/repository responsibilities
- Dependency injection
- Module boundaries
- Provider registration
- DTO usage
- Guard/interceptor/filter usage
- Separation of concerns
- Reusability
- Maintainability

### 2. MongoDB & Mongoose

Analyzes:

- Query efficiency
- Aggregation pipelines
- `$match` placement
- `$lookup` usage
- `$unwind`
- `$group`
- `$sort`
- `$project`
- Pagination
- Projection
- Query patterns
- Potential collection scans
- N+1 queries

### 3. Index Analysis

Identifies:

- Missing indexes
- Incorrect compound-index ordering
- Redundant indexes
- Indexes that don't support the actual query pattern
- Queries likely to perform collection scans
- Sort/filter combinations requiring index consideration

The skill does **not** blindly recommend indexes. Recommendations are based on the actual query and access pattern.

### 4. Performance Review

Checks for:

- N+1 queries
- Unnecessary database calls
- Large aggregation pipelines
- Uncorrelated `$lookup`
- Repeated queries
- Excessive document loading
- Inefficient pagination
- Large in-memory operations
- Potential performance bottlenecks

### 5. API & Validation

Reviews:

- Request DTOs
- Response structures
- Validation decorators
- API contracts
- Error responses
- HTTP status codes
- Input handling
- Backward compatibility

### 6. Error Handling

Checks for:

- Missing error handling
- Incorrect exception types
- Swallowed errors
- Inadequate logging
- Incorrect error propagation
- Partial failure scenarios
- Async error handling

### 7. Testing

Reviews:

- Jest unit tests
- Integration tests
- Edge cases
- Error scenarios
- Mock quality
- Test isolation
- Coverage gaps
- Regression risks

### 8. Sonar & TypeScript Quality

Checks for:

- Code duplication
- Unnecessary complexity
- Unsafe typing
- `any` usage
- Dead code
- Maintainability issues
- Potential Sonar violations
- Readability problems

### 9. Security

Looks for:

- Missing authorization checks
- Missing input validation
- Sensitive data exposure
- Unsafe query construction
- Improper error information
- Tenant-isolation concerns
- Authentication/authorization gaps

---

# 🧠 Review Philosophy

The skill follows a production-first review philosophy.

It does **not** treat every finding as equally important.

Issues are prioritized according to their potential impact:

| Priority         | Meaning                                                               |
| ---------------- | --------------------------------------------------------------------- |
| 🔴 Critical      | Security, data integrity, tenant isolation, or severe production risk |
| 🟠 High          | Significant performance, architecture, or correctness problem         |
| 🟡 Medium        | Maintainability, testing, or potential production issue               |
| 🔵 Low           | Improvement or code-quality recommendation                            |
| ⚪ Informational | Optional improvement or observation                                   |

The goal is to help developers focus on the issues that matter most.

---

# 📋 Review Output

The skill produces a structured review containing:

## Summary

A concise overview of the implementation and overall production-readiness.

## Findings

Each finding contains:

- Severity
- Category
- File
- Line/reference where applicable
- Problem
- Why it matters
- Recommended fix

Example:

```text
[HIGH] MongoDB Performance

File: referral.service.ts

Problem:
A $lookup retrieves payment records without a selective correlation
before applying the paymentDate filter.

Why it matters:
The lookup can scan a large portion of the payments collection
for every outer document.

Recommendation:
Restrict the lookup using the available relationship key first and
ensure the relevant query fields are indexed.
```

## Positive Findings

The skill also identifies good implementation decisions instead of producing only negative feedback.

Examples:

- Appropriate compound index
- Correct DTO validation
- Good separation of concerns
- Efficient aggregation pipeline
- Proper exception handling
- Adequate test coverage

---

# 🔍 Review Workflow

The skill follows this general process:

```text
Changed Code
     │
     ▼
Understand Context
     │
     ▼
Identify Architecture
     │
     ▼
Analyze Database Access
     │
     ├── Queries
     ├── Aggregations
     ├── $lookup
     ├── Indexes
     └── N+1 patterns
     │
     ▼
Review API / Validation
     │
     ▼
Review Error Handling
     │
     ▼
Review Tests
     │
     ▼
Review TypeScript / Sonar
     │
     ▼
Review Security
     │
     ▼
Prioritize Findings
     │
     ▼
Production Readiness Summary
```

---

# 🧪 Validation Against NRC Code

The skill was validated against real-world NestJS/MongoDB code from the NRC application.

The validation focused on three progressively broader scenarios.

### Test 1 — Backend Performance Review

Validated the skill against a MongoDB/NestJS performance-related change.

The review focused on:

- Query patterns
- Aggregation performance
- Index usage
- `$lookup` behavior
- Potential collection scans
- Performance implications of the implementation

### Test 2 — Angular / Frontend Review

Validated that the skill can also recognize issues outside the immediate MongoDB layer when reviewing a full-stack codebase.

The review focused on:

- Angular implementation quality
- API interaction
- TypeScript quality
- Error handling
- Maintainability
- Frontend/backend interaction concerns

### Test 3 — Full-Stack Review

Validated the skill against a broader change involving both frontend and backend.

The review covered:

- NestJS architecture
- MongoDB queries
- Performance
- API contracts
- Angular implementation
- Error handling
- Testing
- TypeScript quality
- Security
- Cross-layer concerns

These tests demonstrate that the skill can move beyond simple static code inspection and reason about the **production impact of changes across application layers**.

---

# 📁 Skill Structure

The skill is packaged as:

```text
skills/
└── nestjs-mongodb-production-code-review/
    ├── SKILL.md
    └── README.md
```

### `SKILL.md`

Contains the actual instructions used by Claude Code to perform the review.

It defines:

- Review scope
- Review methodology
- Priority rules
- NestJS checks
- MongoDB checks
- Performance checks
- Testing checks
- Security checks
- Expected output format

### `README.md`

Provides project documentation, usage information, validation details, and contribution context.

---

# ⚙️ Usage

Install/copy the skill into the Claude Code skills directory:

```text
skills/nestjs-mongodb-production-code-review/
```

Claude Code can then use the skill when performing a production-oriented review of NestJS/MongoDB changes.

A typical workflow is:

```text
1. Make code changes
2. Run tests
3. Invoke the production code review skill
4. Review findings
5. Fix high-priority issues
6. Re-run tests
7. Run the review again
8. Submit the change for human review
```

---

# 🛠️ Technology Focus

The skill is primarily designed for applications using:

- NestJS
- Node.js
- TypeScript
- MongoDB
- Mongoose
- Jest
- Nx
- Angular

It is especially useful for applications with:

- Multi-tenant architecture
- Large MongoDB collections
- Complex aggregation pipelines
- Microservices
- REST APIs
- Role/permission systems
- High-volume data access

---

# 🎯 Design Goals

The skill is designed around five goals:

### 1. Production First

Identify issues that can affect real users, production performance, reliability, or security.

### 2. Actionable Feedback

Avoid vague statements such as:

> "This query may be slow."

Instead, explain:

- Why it may be slow
- What part of the query causes the concern
- What data access pattern is involved
- What should be investigated or changed

### 3. Context-Aware Analysis

Review the surrounding code instead of evaluating a single line in isolation.

For example, an index recommendation should consider:

```text
Query
 ↓
Filter fields
 ↓
Sort fields
 ↓
Cardinality
 ↓
Existing indexes
 ↓
Access pattern
```

### 4. Prioritized Findings

Developers should immediately understand which issues require attention before merging.

### 5. Developer-Friendly

The review should assist developers rather than replace human judgment.

The skill provides recommendations and reasoning; final architectural decisions remain with the development team.

---

# 🔮 Future Enhancements

Potential future versions of the skill could include:

### PR-Level Review

Automatically analyze the complete PR diff.

### Git Integration

Compare:

```text
base branch
     ↓
changed files
     ↓
production review
```

### Automated Index Verification

Compare detected query patterns with actual MongoDB index definitions.

### Explain Plan Analysis

Use MongoDB `explain()` output to validate performance concerns.

### Test Generation

Suggest or generate Jest tests for identified coverage gaps.

### Sonar Integration

Combine static-analysis findings with the production review.

### CI/CD Integration

Run the review automatically during CI.

### Review History

Track recurring issues across multiple PRs.

### Organization-Specific Rules

Allow teams to define their own:

- Architecture rules
- Naming conventions
- Security rules
- MongoDB standards
- Testing requirements

---

# 📌 Important Limitations

This skill provides an intelligent code review and should not be considered a replacement for:

- Human code review
- Production monitoring
- MongoDB profiling
- Load testing
- Security testing
- Integration testing
- CI/CD validation

Performance recommendations should be validated against the application's actual:

- Dataset size
- Query frequency
- Cardinality
- Index configuration
- Production workload

---

# 🤝 Contribution

Contributions are welcome.

When extending the skill:

1. Keep the review focused on production impact.
2. Avoid adding generic recommendations without context.
3. Prefer actionable findings.
4. Keep severity definitions consistent.
5. Include examples when adding new review rules.
6. Validate changes against realistic NestJS/MongoDB code.
7. Update documentation when the review behavior changes.

---

# 🏁 Project Goal

The goal of this project is to turn Claude Code into a **specialized production-review assistant for NestJS and MongoDB applications**.

Instead of simply asking:

> "Does this code work?"

the skill encourages a deeper question:

> **"Will this code remain correct, performant, secure, maintainable, and reliable in production?"**

That is the core purpose of the **NestJS/MongoDB Production Code Review Agent**.
