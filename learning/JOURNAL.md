# Journal

One entry per session: what was done, what was found, what was produced.
Newest at the bottom.

---

## Session 1: 2026-10-08: Kick-off (with Claude)

### Setup

- Clone at upstream `b6295c799` (Nest 12.x, Node v24.20.0).
- `npm ci --legacy-peer-deps` (the flag is required, per CONTRIBUTING.md).
- Remotes reorganised: `upstream` = nestjs/nest, `origin` = fengdi721/nest (fork).
- Branch `learning/first-steps` created for this notebook; `master` stays pristine.

### Exploration done

1. Read `CONTRIBUTING.md`, `package.json` scripts, `.commitlintrc.json`, `.husky/*`,
   `vitest.config.mts`, `.github/` → summarised in 01 and 04.
2. Mapped the package dependency graph (`common` ← `core` ← platforms/transports
   ← `testing`) → 01-REPO-ANATOMY.md.
3. Traced `NestFactory.create()` → `initialize()` → `scanner.scan()` →
   `instanceLoader.createInstancesOfDependencies()` → `injector.loadInstance()`,
   and `app.init()` → `registerRouter()` → `RouterExplorer` → 02-HOW-NEST-BOOTS.md.
4. Dissected upstream commit `b6295c799` as the model of "fix + unit + e2e" → 03.
5. Browsed GitHub (labels, good-first-issues, open issues) with the in-app browser:
   - only ~10 open issues; every `good first issue 👍` is closed;
   - found nestjs/nest#18052 (`needs triage`), already with a reporter fix PR (#18053).

### Tests produced

| File | Tests | What it proves |
| --- | --- | --- |
| `specs/01-decorators-are-metadata.spec.ts` | 7 | decorators only write `Reflect` metadata; `design:paramtypes` comes from TS |
| `specs/02-dependency-injection.spec.ts` | 5 | provider shapes, export visibility + error message, `@Optional`, container inspection |
| `specs/03-provider-scopes.spec.ts` | 3 | TRANSIENT vs REQUEST, `get()` vs `resolve()`, scope bubbling |
| `specs/04-request-lifecycle.spec.ts` | 3 | middleware → guard → interceptor → pipe → handler → interceptor; filters |
| `specs/05-lifecycle-hooks.spec.ts` | 1 | hook order (deepest module first; all inits before any bootstrap) |
| `specs/06-triage-issue-18052.spec.ts` | 4 (1 `it.fails`) | reproduces #18052 at unit level, no server |
| `exercises/exercises.spec.ts` | 4 skipped | E1 param decorator, E2 forwardRef, E3 @Global, E4 dynamic module |

Result: `22 passed | 1 expected fail | 4 skipped`. The exercises were checked to be
solvable (with a throw-away solved copy: all green), then the copy was deleted.
An upstream suite was also run as a sanity check:
`packages/platform-fastify/test/adapters/fastify-adapter.spec.ts` → 40 passed.

### Findings / surprises

- **My first lifecycle test was wrong.** I expected a guard returning `false` to
  produce a 403 without touching filters. In fact `RouterExecutionContext` throws
  `ForbiddenException` (`router-execution-context.ts:415`), which is an
  `HttpException`, so `@Catch(HttpException)` filters catch it. Learning tests
  catch wrong beliefs.
- `vitest`'s `mergeConfig` **concatenates** arrays, so `include` from the base config
  would have leaked in; the learning config overrides via spread instead.
- There is **no unit test for `FastifyAdapter.listen()`** upstream: a real
  coverage gap (practice P13).
- Root cause of #18052: `options = { port: +listenOptions }` for every non-object
  argument (`packages/platform-fastify/adapters/fastify-adapter.ts`, `listen()`).

### Next session

- Do P1–P6, then solve E1–E4.
- Watch PR #18053; when it is merged, do P11.
