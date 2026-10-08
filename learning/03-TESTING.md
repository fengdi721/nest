# 03: How Nest tests itself

A PR without tests is not reviewed (`CONTRIBUTING.md`: *"All features or bug
fixes must be tested by one or more specs"*). So understanding the test layout
**is** understanding how to contribute.

## Three layers

| Layer | Where | Runner / config | Needs | Command |
| --- | --- | --- | --- | --- |
| Unit | `packages/<pkg>/test/**/*.spec.ts` (mirrors source tree) | `vitest.config.mts` | nothing | `npm test` |
| Integration (e2e) | `integration/<area>/e2e/*.spec.ts` | `vitest.config.integration.mts` | build into `node_modules/@nestjs` + Docker for DB/broker suites | `bash scripts/prepare.sh` then `bash scripts/run-integration.sh` |
| Samples | `sample/*` | gulp `build:samples` | full build | `npm run build:samples` (rarely needed locally) |

Real example: upstream commit `b6295c799`
(`fix(websockets): pass gateway lifecycle hook errors to exception filters`):

```
packages/websockets/web-sockets-controller.ts              ← the fix
packages/websockets/test/web-sockets-controller.spec.ts    ← unit test (mocks)
integration/websockets/e2e/connection-hook-error.spec.ts   ← e2e test (real sockets)
```

Note the pattern: **one fix, a unit test proving the logic, an e2e test proving
the user-visible behaviour.** Bug-repro e2e specs are sometimes named after the
issue (`integration/hello-world/e2e/repro-11802.spec.ts`).

## Useful commands

```bash
npm test                                          # all unit tests (~seconds, no build)
npx vitest run packages/core/test/injector        # one folder
npx vitest run packages/platform-fastify -t "listen"   # filter by test name
npx vitest packages/common/test/pipes             # watch mode while coding
npm run test:cov                                  # coverage report
npm run lint                                      # oxlint
npm run format                                    # prettier
```

## Unit test style used upstream (copy it)

- `vitest` globals (`describe`, `it`, `expect`, `vi`). No imports needed for them.
- Build the class under test directly (`new FastifyAdapter()`), stub collaborators
  with `vi.fn()` / `vi.spyOn(...)`, and `afterEach(() => vi.restoreAllMocks())`.
- `describe('<ClassName>')` → `describe('<method>')` → `it('should …')`.
- Integration tests use `Test.createTestingModule(...).compile()` +
  `createNestApplication()` + `supertest`, and **always** `await app.close()`.

## Two kinds of tests in `learning/`

- **Lesson specs** (`learning/specs`) are *learning tests*: they pin down how the
  framework behaves, so reading becomes verifiable. If a belief is wrong, the
  test tells you (this happened in `specs/04`; see JOURNAL).
- **Exercises** (`learning/exercises`) are skipped tests you complete.
- `it.fails(...)` (used in `specs/06`) documents a known bug: it passes while the
  bug exists and alerts you when the fix lands.
