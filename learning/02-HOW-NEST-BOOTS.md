# 02: How Nest boots: tracing `NestFactory.create()` through the source

Reading strategy: **pick something you already use daily and follow it
down**. For a CRUD developer that is `main.ts`:

```ts
const app = await NestFactory.create(AppModule);
await app.listen(3000);
```

## Phase 0: before any of that runs: decorators

When your files are *imported*, every `@Module/@Injectable/@Controller/@Get`
executes and calls `Reflect.defineMetadata(...)`. Nothing else happens.
TypeScript's `emitDecoratorMetadata` adds `design:paramtypes` (constructor
types). **Proof:** `learning/specs/01-decorators-are-metadata.spec.ts`.

## Phase 1: `NestFactory.create()` builds the graph and the instances

`packages/core/nest-factory.ts`

- `create()` (~line 89) → `initialize()` (~line 212), which wires up:
  - `NestContainer`: the registry: `Map<moduleToken, Module>`
  - `DependenciesScanner`: reads metadata into the container
  - `Injector` + `InstanceLoader`: create the instances
- Then, inside `ExceptionsZone.asyncRun`, three calls do all the work:

```ts
await dependenciesScanner.scan(module);               // 1a
await instanceLoader.createInstancesOfDependencies(); // 1b
dependenciesScanner.applyApplicationProviders();      // 1c (APP_GUARD, APP_PIPE…)
```

### 1a: `DependenciesScanner.scan()`: `packages/core/scanner.ts:84`

1. `registerCoreModule()`: adds `InternalCoreModule` (provides `ModuleRef`,
   `HttpAdapterHost`, `Reflector`, …). That is why you can inject those anywhere.
2. `scanForModules()`: recursive DFS over `imports` metadata; each module class
   (or dynamic module, or `forwardRef`) becomes a `Module` object in the container.
3. `scanModulesForDependencies()`: for each module, reads `providers`,
   `controllers`, `exports` and enhancers (`@UseGuards`…) → `InstanceWrapper`s.
4. `calculateModulesDistance()`: depth from the root; this drives the
   lifecycle-hook order (`specs/05`).
5. `container.bindGlobalScope()`: links `@Global()` modules into every module.

**Proof:** `specs/02` › "the container is a Map of Module objects you can inspect".

### 1b: `InstanceLoader.createInstancesOfDependencies()`: `packages/core/injector/instance-loader.ts:25`

Two passes over every module:

1. `createPrototypes()`: `Object.create(Class.prototype)` for each wrapper,
   so circular `forwardRef`s have *something* to point at (exercise E2).
2. `createInstances()`: for each provider → `Injector.loadInstance()`
   (`injector.ts:138`) → `resolveConstructorParams()` (`injector.ts:320`):
   - reads `design:paramtypes` / `@Inject()` tokens
   - looks the token up in the **current module**, then in **imported modules'
     exports** (`lookupComponentInParentModules`, `injector.ts:707`)
   - not found → `UnknownDependenciesException` (the famous
     "Nest can't resolve dependencies of X (?, Y)" message, built in
     `packages/core/errors/messages.ts`)
   - found → recursively `loadInstance` the dependency, then `instantiateClass`
     (`injector.ts:915`): `new Class(...deps)` or `await factory(...deps)`.

**Proof:** `specs/02` (export visibility, provider shapes, `@Optional`), `specs/03` (scopes).

## Phase 2: `app.listen()` → `app.init()`: `packages/core/nest-application.ts:188`

```ts
await this.registerModules();      // websockets/microservices if present
await this.registerRouter();       // middleware + RoutesResolver → RouterExplorer
await this.callInitHook();         // onModuleInit           (all modules, deepest first)
await this.registerRouterHooks();  // 404 + global error handler
await this.callBootstrapHook();    // onApplicationBootstrap (all modules)
```

`registerRouter()` (line 228) → `RoutesResolver` → `RouterExplorer.explore()`
(`packages/core/router/router-explorer.ts:106`): for every controller method
with `PATH_METADATA`, it asks `RouterExecutionContext.create()` to build one
handler function that runs:

```
guards → interceptors(before) → pipes → YOUR METHOD → interceptors(after)
          └──────── any throw ──────────→ exception filters (router-proxy.ts)
```

and registers it on the adapter (`app.get(path, handler)` in Express terms).
Middleware is registered *before* routes, so it runs first.

**Proof:** `specs/04-request-lifecycle.spec.ts` (including the surprise that a
guard's `false` becomes a `ForbiddenException` that your filters can catch:
`router-execution-context.ts:415`).

## A debugging trick for reading internals

Because tests run against `packages/*/**.ts` directly, you can drop a
temporary log in the engine and watch it from a learning spec:

```ts
// packages/core/injector/injector.ts, inside resolveConstructorParams,
// right AFTER the line `const [dependencies, optionalDependenciesIds] = …`
console.log('[resolve]', wrapper.name, '←', dependencies.map(d => d?.name ?? d));
```

```bash
npx vitest run --config learning/vitest.config.mts learning/specs/02
git checkout packages/   # ALWAYS revert engine experiments
```
