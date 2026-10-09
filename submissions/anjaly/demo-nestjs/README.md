# Demo project — nestjs-api-architecture-reviewer test fixture

A small, deliberately flawed NestJS module (`users` + `orders`) used to test-drive the
[`nestjs-api-architecture-reviewer`](../../../subagents/anjaly-nestjs-api-architecture-reviewer.md)
subagent. Not a real application — it exists only to prove the subagent can find real,
specific architecture problems with file:line evidence.

## Planted issues

| # | File | Issue |
|---|---|---|
| 1 | `src/users/dto/create-user.dto.ts` | No `class-validator` decorators; includes a client-settable `role` field (privilege-escalation risk) |
| 2 | `src/users/users.controller.ts` | `catch` block returns `err.message` and `err.stack` to the HTTP response (information leakage) |
| 3 | `src/users/users.controller.ts` | Destructive delete exposed as `@Get('remove/:id')` instead of `@Delete(':id')` |
| 4 | `src/users/users.controller.ts` | Password hashing done inline in the controller instead of the service layer (and with plain unsalted SHA-256) |
| 5 | `src/users/users.module.ts` + `src/orders/orders.module.ts` | Bidirectional circular dependency via `forwardRef`, at both the module and provider level |
| 6 | `src/users/users.service.ts` + `src/orders/orders.service.ts` | In-memory data store despite `@nestjs/typeorm`/`typeorm` being declared dependencies |
| 7 | whole project | No `*.spec.ts` test files anywhere |

## Full review report

See [`REVIEW.md`](./REVIEW.md) for the actual report produced by running the subagent's
instructions against this project — it independently found all seven issues above with
severity, evidence, impact, recommended fix, and regression-risk classification for each.
