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

- **The git hooks in action** (on the first commit of this notebook):
  `pre-commit` ran prettier on the staged `.ts` files, and `commit-msg` ran
  commitlint, which warned `scope must be one of [common, core, …]` because
  `learning` is not a package. It is a warning (rule level `1` in
  `.commitlintrc.json`), not an error (`2`), so the commit passed. In a real
  upstream PR, use a real package scope.

### Next session

- Do P1–P6, then solve E1–E4.
- Watch PR #18053; when it is merged, do P11.

---

## 第 2 次学习：2026-10-08：从报错倒推源码（中文记录开始）

### 准备工作

- 配好远程仓库：`upstream` 的 push 地址设为 `DISABLED`，防止误推到 nestjs/nest。
- 学会只看修改文件列表：`git show --name-status --format= <sha>`、
  `git diff --name-status upstream/master...HEAD`。

### 做了什么

1. 用“三次 grep”从 `Nest can't resolve dependencies` 定位到
   `messages.ts` → `unknown-dependencies.exception.ts` → `injector.ts#lookupComponentInParentModules`。
2. 精读 `lookupComponentInImports`，理解 `isTraversing` 让 imports **不传递**，
   只有 re-export 的模块才会被继续查找。
3. 发现框架自带调试开关 `NEST_DEBUG`（`is-debug-mode.util.ts`），并拿到真实日志输出。
4. 对比 `messages.ts` 的 3 个分支和上游 `messages.spec.ts` 的覆盖情况。

### 产出的测试

| 文件 | 测试数 | 证明了什么 |
| --- | --- | --- |
| `specs/07-dependency-lookup.spec.ts` | 6 | imports 不传递 / re-export；报错结构；属性注入分支；`import type` 分支；`NEST_DEBUG` 日志顺序 |

全部学习测试：`28 passed | 1 expected fail | 4 skipped`。

### 发现 / 意外

- **测试里看不到 `NEST_DEBUG` 日志**：`@nestjs/testing` 默认的 `TestingLogger`
  把 `log/warn/debug/verbose` 全部吞掉，只保留 `error`。
  解决：`.setLogger(new ConsoleLogger())`。
- **上游测试缺口**：`UNKNOWN_DEPENDENCIES_MESSAGE` 的属性注入分支
  （`...the "xxx" property is available in the current context`）在
  `packages/*/test` 和 `integration` 中都没有断言 → 第一个 PR 候选（P18）。
- **commitlint 拦下了提交**：标题 `add step 2 on dependency lookup and NEST_DEBUG (zh)`
  因为混入大写的 `NEST_DEBUG`，不属于 `subject-case` 允许的任何一种大小写风格
  （`.commitlintrc.json` 中级别为 `2` = error）。改成全小写后通过。
  教训：提交标题里避免混用大写标识符，或整句用 sentence-case。
- **第二次又被拦**：`header must not be longer than 72 characters`。但 `CONTRIBUTING.md`
  第 242 行写的是“不能超过 100 个字符”。实际规则来自
  `node_modules/@commitlint/config-angular/index.js`：`"header-max-length": [2, "always", 72]`，
  而 `.commitlintrc.json` 没有覆盖它。**文档和工具不一致**：这是一个潜在的 docs PR
  候选（提之前要先搜一下 issue/PR，看维护者是否已讨论过）。以工具为准：标题 ≤ 72。
- 日志 `...provider ` 末尾多一个空格：判断为**不值得**单独提 PR（纯外观、无用户影响）。

### 下一步

- 完成 P15–P18；P18 做完后一起检查，再决定是否向 nestjs/nest 提交真正的 PR。
