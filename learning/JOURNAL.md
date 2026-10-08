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

---

## 第 3 次学习：2026-10-08：写测试与 TDD

### 背景

我没有写测试和 TDD 的经验，这一步专门练习。

### 做了什么

1. **Kata 1（演示）**：用 TDD 从零实现 `ParseSortPipe`（解析 `?sort=name:asc,age:desc`）。
   9 轮红/绿 + 1 次重构 + 1 个集成测试，共 20 个提交，每个提交都能单独 `git show` 回看。
2. **手动变异测试**：故意改坏 6 处代码，6 处都被测试抓到。
3. **Kata 2（练习）**：Cats CRUD 的骨架 + 测试清单（`it.todo`），每个文件给一个写好的模板测试。
   用一份参考实现验证过需求都能做通，然后删掉了参考实现。

### 产出的测试

| 文件 | 测试数 | 说明 |
| --- | --- | --- |
| `tdd/kata-1-parse-sort-pipe/parse-sort.pipe.spec.ts` | 14 | 单元测试，TDD 逐个加出来 |
| `tdd/kata-1-parse-sort-pipe/parse-sort.pipe.e2e.spec.ts` | 3 | 真实 controller + supertest |
| `tdd/kata-2-cats-crud/cats.service.spec.ts` | 1 + 11 todo | 模板：AAA + mock repository |
| `tdd/kata-2-cats-crud/cats.e2e.spec.ts` | 1 + 8 todo | 模板：fake repository + supertest |

全部学习测试：`47 passed | 1 expected fail | 4 skipped | 19 todo`。

### 发现 / 体会

- **红要红得正确**：第一轮先写一个返回 `undefined` 的空类，让失败是断言失败而不是 import 失败。
- **第 9 轮来自主动思考边界**：`'name,,age'` 会产生空字段名，需求里没写，是 TDD 的“还有什么输入会出错”的习惯发现的。
- **重构有底气**：重构改动很大，但 14 个测试一直是绿的。
- **变异测试**是检验测试质量最直观的方法：改坏代码，测试必须变红。

### 下一步

- P19–P23：回放 kata 1 → 自己重做 → 完成 kata 2 → 对 kata 2 做变异测试。
- 完成后让 Claude 做 code review；然后回到 P18（第一个上游 PR）。

---

## 第 4 次学习：2026-10-09：评审真实 PR + 提 PR 演练

### 插曲（题外问题）

- 依赖安装：本仓库要用 `npm ci --legacy-peer-deps`。Node 版本只要 ≥ 20 即可（CI 测试的是 20.19 / 22.14 / 24.1），装不上的原因是 peer dependency 冲突，和 Node 版本无关。
- 真实冲突的例子：仓库装的是 `graphql@17.0.2`，而 `@apollo/server` 的 peer 要求 `^16.11.0`（用 `npm ls --all | grep invalid` 查到）。
- 不要用 yarn：仓库只有 `package-lock.json`，CI 用的是 npm。

### 做了什么

1. **查重改变了计划**：原计划给 `FastifyAdapter.listen()` 补测试，发现 PR #18053 已经加了 8 个 → 改为评审它。
2. **本地评审 #18053**：CI 全绿；和最新 master 无冲突（落后 12 个提交）；单元 8/8、e2e 3/3 通过；
   第 06 课的复现测试翻转（`it.fails` 报 `Expect test to fail`）；4 个变异全部被抓到。
3. **边界对比**：写小脚本对比 Node `net.listen` 和 PR 的规则，只有 `"-1"` 不一致 → 记为 nit。
   评审意见草稿写在 07 文档里，**没有发出**，由我决定。
4. **提 PR 演练**：CONTRIBUTING 有两处和工具不一致（代码宽度 100 vs Prettier 实际 80；
   提交标题 100 vs commitlint 实际 72）。从 `upstream/master` 开分支 `docs/contributing-tooling-limits`，
   用工具实测验证后提交，推到 fork，开了 PR：https://github.com/fengdi721/nest/pull/1 （只改 1 个文件）。

### 发现 / 体会

- 上游最近 500 个提交里有 101 个标题超过 72 个字符，原因是 squash 合并时加上了 ` (#1234)`。看起来和规则矛盾，其实并不冲突。
- 文档和工具不一致时，有两种修法（改文档或改配置）。选影响最小的那种，并把另一种写进 PR 描述，让维护者决定。
- `it.fails` 的设计在真实场景里起了作用：修复一出现，测试就提醒了。

### 下一步

- P26–P30：自己评审一遍 #18053；决定评审意见和演练 PR 的去向；用同样的流程完成 P18。
- kata 2 仍待完成（P21–P23）。

---

## 第 5 次学习：2026-10-09：9 个 package 的贡献教程（`/goal`）

### 目标

用 `/goal` 设定：为仓库的每一个 package 写贡献教程和对应的测试，并在 PRACTICES.md 中覆盖。

### 产出

| Package | 教程 | 测试数 |
| --- | --- | --- |
| common | `packages/common.md` | 16 |
| core | `packages/core.md` | 10 |
| microservices | `packages/microservices.md` | 9 |
| websockets | `packages/websockets.md` | 10 |
| platform-express | `packages/platform-express.md` | 10 |
| platform-fastify | `packages/platform-fastify.md` | 9 + 1 `it.fails` |
| platform-socket.io | `packages/platform-socket.io.md` | 3 |
| platform-ws | `packages/platform-ws.md` | 6 |
| testing | `packages/testing.md` | 9 |

总览：`packages/README.md`；练习：`PRACTICES.md` 第八阶段 P31–P50。

### 两个真实、未被报告的问题（待我决定是否开 issue）

1. 🐛 **fastify：`@RouteSchema` 校验失败返回 500 而不是 400。** 纯 fastify 返回 400；Nest 的 `isHttpError` /
   `isHttpFastifyError` 都要求错误名为 `FastifyError`，而 fastify 的校验错误是普通 `Error`。
   本地验证了修复思路（两个测试翻转，上游 463 个测试通过），已还原。→ P43
2. 🔎 **core：URI 版本控制下，不带 `version` 的中间件 `exclude` 静默失效。** 用 6 + 3 种配置的对照实验
   定位到 `route-info-path-extractor.ts` 的 `extractVersionPathFrom`。官方文档没提 exclude 和版本的关系。→ P38

### 一个低优先级问题

- `CapturingLogger` 匹配不到注入器调试日志，因为颜色码被拼进了消息文本（`NO_COLOR=1` 可绕过）。→ P33

### 核对过、不是 bug 的地方（避免以后重复检查）

- common：`@Optional()` 参数分支的 `getOwnMetadata` 是有意为之（`getConstructorOwner` 的注释解释了原因）。
- express：busboy 错误仍按文案匹配，因为 busboy 1.6.0 的错误没有 code。
- socket.io / ws：两个适配器都处理了“编码失败不能让进程崩溃”。

### 写测试时被纠正的理解

- microservices：`send()` 的 data 不能为 `null`；“找不到处理器”返回纯字符串，而 `RpcException` 返回对象。
- websockets：常量不在公共入口，vitest 不做类型检查，所以导入得到 `undefined` 却不报错。
- platform-ws：处理器抛错先被 websockets 层捕获，变成 `exception` 事件，非 `WsException` 的错误信息被隐藏。
- testing：override 是原地替换，`useFactory` 的 `inject` 在原模块里解析。
- express：自己踩中了 multer 文案变化（#17769 修复的正是这个问题）。
- core：两个 403 是我测试里漏带了请求头，先怀疑测试本身。

### 用变异测试检验练习本身

把“改坏源码 → 测试变红”类练习（P31、P34、P40、P45、P49）都实际跑了一遍。P49 的变异**没有**被学习测试抓到，
却被上游单元测试抓到了。由此在 microservices 教程里补了一节“为什么既要集成测试，也要单元测试”。
