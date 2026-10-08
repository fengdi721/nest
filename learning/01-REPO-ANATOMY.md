# 01: Repository anatomy: how to find the organising philosophy

## The method (works for any open source project)

Never start by opening random `.ts` files. Read in this order; each step costs
only a few minutes and tells you where to look next:

1. **`Readme.md`**: what the project promises its users.
2. **`CONTRIBUTING.md`**: how the maintainers *want* you to work. This is the
   most underrated file in any repo.
3. **Root `package.json`**: `workspaces`, `scripts` (how to build, test and lint)
   and `devDependencies` (which tools: test runner, linter, formatter).
4. **Root config files**: each one is a decision the maintainers made
   (`tsconfig.json`, `vitest.config*.mts`, `.commitlintrc.json`, `.husky/`,
   `.oxlintrc.json`, `.prettierrc`, `lerna.json`).
5. **`.github/`**: issue and PR templates, plus CI workflows (what a PR must pass).
6. **`git log --oneline -30`**: the *living* conventions (commit style, who
   merges, how often).
7. Only then, **one package's entry point** (`packages/<x>/index.ts`), followed
   by imports.

## What that gives us for Nest

### Top level

| Path | Role | Philosophy it reveals |
| --- | --- | --- |
| `packages/` | The 9 npm packages published as `@nestjs/*` | **Monorepo**: one repo, many packages, released together (`lerna.json`, npm `workspaces`) |
| `integration/` | End-to-end tests that boot real apps (some need Docker: Mongo, Redis, Kafka, RabbitMQ…) | Unit tests live *next to* each package; cross-package behaviour is tested *here* |
| `sample/` | ~40 standalone example apps (`01-cats-app`…) | Living documentation; also compiled in CI to catch breaking changes |
| `tools/` | Benchmarks and gulp tasks | Build helpers are code, kept out of `packages/` |
| `scripts/` | Shell/Node scripts (`prepare.sh`, docker helpers) | One-command setup for contributors |
| `.github/` | Issue/PR templates, CodeQL, PR content guard | Quality gates before a human ever looks |
| `.husky/` | `pre-commit` → `lint-staged` (prettier); `commit-msg` → `commitlint` | Conventions are **enforced by tools**, not by memory |

### The packages and how they depend on each other

```
                 @nestjs/common   ← decorators, interfaces, exceptions, pipes (NO runtime engine)
                       ▲
                 @nestjs/core     ← scanner, injector, router, app context (THE engine)
             ▲     ▲      ▲      ▲
   platform-express  platform-fastify   microservices   websockets ← platform-socket.io / platform-ws
                       ▲
                 @nestjs/testing  ← Test.createTestingModule (thin layer over core)
```

**Key design rule: `common` vs `core`.** Everything *you* import in a CRUD app
(`@Controller`, `@Injectable`, `HttpException`, `ValidationPipe`) is in `common`.
Those decorators **only write metadata** (proved in `specs/01`). `core` contains
the engine that *reads* that metadata, builds the dependency graph and wires the
HTTP routes. That split lets `common` stay tiny and engine-agnostic.

**Platform adapters.** `core` never imports Express or Fastify. It talks to an
`HttpServer` interface (`packages/common/interfaces/http/http-server.interface.ts`),
and `platform-express`/`platform-fastify` implement it (adapter pattern). That is
why issue #18052 (see `specs/06`) is fixed in `platform-fastify` only.

### Inside a package (example: `packages/core`)

```
packages/core/
├── index.ts            public API: what users may import
├── internal.ts         shared with sibling @nestjs packages only, NOT public API
├── package.json        its own version, deps and `exports` map
├── tsconfig.build.json compiled with `tsc -b` (project references)
├── test/               unit tests, mirroring the source tree
│   └── injector/injector.spec.ts  ↔  injector/injector.ts
├── injector/           DI container, Module, InstanceWrapper, Injector
├── scanner.ts          walks @Module metadata → fills the container
├── router/             turns controllers into HTTP routes
├── guards/ interceptors/ pipes/ exceptions/  ← "consumers" + "context creators"
├── middleware/
├── hooks/              onModuleInit / onApplicationBootstrap …
└── nest-factory.ts     NestFactory.create(): the entry point
```

Conventions you will notice everywhere:

- **One concept per file**, with the kind in the name: `*.decorator.ts`,
  `*.interface.ts`, `*.exception.ts`, `*.pipe.ts`, `*-consumer.ts`,
  `*-context-creator.ts`.
- **Every folder has an `index.ts` barrel**; public surface = what the barrels export.
- **Imports end in `.js`** even in `.ts` files (`"type": "module"`, real ESM).
  `vitest.config.mts` has a small plugin that maps them back to `.ts` sources.
- **Tests mirror sources**: if you change `x/y.ts`, the test is `test/x/y.spec.ts`.
- **Metadata keys are centralised** in `packages/common/constants.ts`.
- **Error messages are centralised** in `packages/core/errors/messages.ts`.

## Useful commands to explore any repo

```bash
git log --oneline -20                       # living conventions
git log --oneline -- packages/core/injector # history of one area
git shortlog -sn --since="1 year ago" | head # who maintains it
git show --stat <sha>                         # anatomy of a single fix: src + unit + e2e
grep -rn "can't resolve dependencies" packages/  # follow an error message to its source
```
