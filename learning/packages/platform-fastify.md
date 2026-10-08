# @nestjs/platform-fastify 贡献教程

> 配套测试：`learning/specs/packages/platform-fastify.spec.ts`（10 个，含 1 个记录 bug 的 `it.fails`）
> 以及第 06 课 `learning/specs/06-triage-issue-18052.spec.ts`（listen bug 分析）
> 练习：`PRACTICES.md` 第八阶段 · platform-fastify

## 1. 一句话定位

用 Fastify 代替 Express 作为 HTTP 平台。实现的是**和 `ExpressAdapter` 同一份** `HttpServer` 接口，
另外暴露了 Fastify 自己的能力：JSON Schema 校验、插件系统、`inject()`、路由约束。

| 规模 | 数据 |
| --- | --- |
| 源码 | 40 个文件；`adapters/fastify-adapter.ts` 有 1000 多行（express 的近两倍） |
| 单元测试 | 21 个 spec |
| 2026 年以来的提交 | 20 个以上，包括新功能：基于 `@fastify/multipart` 的上传拦截器（#17835） |

## 2. 目录地图

| 路径 | 作用 |
| --- | --- |
| `adapters/fastify-adapter.ts` | 适配器本体：`reply`、`listen`、`inject`、`register`、`useBodyParser`、`mapException`… |
| `decorators/` | `@RouteSchema`、`@RouteConfig`、`@RouteConstraints`：把 Fastify 的路由选项写进元数据 |
| `multipart/` | 文件上传。和 express 的 `FileInterceptor` **同名、同用法**，底层换成 `@fastify/multipart` |
| `multipart/multipart/multipart.constants.ts` | 把 Fastify 的错误码（`FST_REQ_FILE_TOO_LARGE`）**翻译成 multer 的错误码**，保证和 express 返回同样的错误 |

**为什么 fastify 适配器比 express 的大得多？** Express 的中间件模型和 Nest 天然契合；
Fastify 有自己的插件系统、钩子生命周期、异步 `ready()`，适配器要做更多“翻译”工作。
**翻译层越厚，两个平台之间出现差异的机会就越多**，这正是第 5 节那个 bug 的来源。

## 3. Fastify 独有的东西

| 能力 | 用法 | 注意 |
| --- | --- | --- |
| `app.inject()` | 不开端口、不走网络发请求（light-my-request） | 用之前要 `await instance.ready()` |
| `@RouteSchema` | 用 JSON Schema 校验 body/query/params，**在 Nest 的 pipe 之前执行** | 校验失败的状态码有 bug，见第 5 节 |
| `@RouteConfig` | 自定义路由 config，处理时通过 `req.routeOptions.config` 读取 | 常配合插件使用（如限流） |
| 路由不按顺序匹配 | `isRouteOrderSensitive()` 返回 `false`（radix tree） | express 是按注册顺序匹配的 |

## 4. 动手：配套测试证明了什么

| 测试 | 证明 |
| --- | --- |
| `getType()` / `isRouteOrderSensitive()` | `'fastify'` / `false` |
| `app.inject()` | 不需要 supertest 也能测 |
| `@RouteSchema` 合法输入 | 正常通过 |
| `@RouteConfig` | 处理函数里读到 `{ rateLimit: 5 }` |
| **一致性 ×4** | 404 格式、上传结果、413 "File too large"、400 "Unexpected file field - wrong" **和 express 完全一致** |
| **BUG**（当前行为） | `@RouteSchema` 校验失败返回 **500** |
| **`it.fails`**（期望行为） | 应该返回 **400**，修复后它会翻转 |

## 5. 案例：写教程时发现的一个真实 bug

### 发现

我原本只想写一个演示 `@RouteSchema` 的测试：缺少 `name` 时应该返回 400。结果收到的是 **500**。

### 复现：和纯 fastify 对比

在 scratch 目录写了一个不经过 Nest 的脚本：

```js
const fastify = require('fastify')();
fastify.post('/users', { schema: { body: { type: 'object', required: ['name'], ... } } }, ...);
fastify.inject({ method: 'POST', url: '/users', payload: { age: 3 } })
// → 400 {"statusCode":400,"code":"FST_ERR_VALIDATION","error":"Bad Request","message":"body must have required property 'name'"}
```

**纯 fastify 返回 400，经过 Nest 变成 500。是 Nest 改变了行为。**

### 定位根因

开启日志后看到 `ERROR [ExceptionsHandler] Error: body must have required property 'name'`：
错误被 Nest 的异常处理器当成“未知错误”了。Nest 有两处识别“带状态码的第三方错误”的逻辑：

```ts
// packages/core/exceptions/base-exception-filter.ts → isHttpError()
err.constructor?.name === 'FastifyError' && typeof err.code === 'string' && typeof err.statusCode === 'number'

// packages/platform-fastify/adapters/fastify-adapter.ts → isHttpFastifyError()
error.statusCode !== undefined && error instanceof Error && error.name === 'FastifyError'
```

而 fastify 5.12.5 的校验错误是这样产生的（`node_modules/fastify/lib/validation.js`）：

```js
const error = schemaErrorFormatter(result, dataVar)   // → new Error(...)，名字是 'Error'
error.statusCode = error.statusCode || 400
error.code = error.code || 'FST_ERR_VALIDATION'
```

**是一个普通的 `Error`，名字不是 `'FastifyError'`**，两处判断都没识别出来 → 500。

再看引入这段映射的提交 `fb3b12d97` / `07603b53f`（2025-05）：它们的测试只用 `@fastify/error` 的
`createError()` 构造错误，**没有覆盖校验错误这种来源**。而 `@RouteSchema` 在上游只有一个
检查元数据的单元测试，**从来没有测过校验失败时的实际行为**。

### 查重

```bash
gh search issues "FST_ERR_VALIDATION" --repo nestjs/nest       # 无结果
gh search issues "RouteSchema validation" --repo nestjs/nest   # 无结果
```

### 验证修复思路（只在本地，已还原）

在 `isHttpFastifyError` 里额外接受 `code === 'FST_ERR_VALIDATION'`：

- 本课的两个测试都翻转了（BUG 测试失败，`it.fails` 报“本该失败却通过了”）→ 400 回来了
- `npx vitest run packages/platform-fastify packages/core/test/router` → **463 个测试全部通过**

这只是用来**证明根因判断正确**的最小改动，未必是最好的修法。更通用的方案可能是：
识别所有 `instanceof Error`、带合法 4xx/5xx `statusCode`、并且 `code` 以 `FST_` 开头的错误。
**选哪种方案应该和维护者讨论。**

### 下一步：由你决定

这是一个**真实、未被报告、可以完整复现**的 bug，非常适合作为你的第一个 issue，甚至第一个修复 PR。
按 04 / 07 文档的流程：

1. 开 issue：标题如 `Fastify JSON schema validation errors (@RouteSchema) return 500 instead of 400`，
   附上本测试作为最小复现、纯 fastify 的对比结果、根因分析。
2. 等维护者回复，确认修复方向。
3. 从 `upstream/master` 开分支，先写失败的单元测试（`fastify-adapter.spec.ts`）和 e2e 测试，再修复。

> 开 issue 会以你的账号公开发布，所以我没有替你提交。

## 6. 上游测试

```bash
npx vitest run packages/platform-fastify
npx vitest run --config vitest.config.integration.mts integration/hello-world/e2e/fastify-adapter.spec.ts
```

## 7. 贡献切入点

```
fix(fastify): treat an empty route parameter as a route miss
fix(fastify): settle async lifecycle hooks once (#17997)
fix(fastify): preserve custom router constraints (#17998)
fix(fastify): keep the default body parsers after `useBodyParser()` (#17938)
fix(express,fastify): keep +json content types on error replies (#17916)
feat(fastify): add file upload interceptors backed by @fastify/multipart (#17835)
```

1. **第 5 节的 bug**：现成的第一个贡献。
2. **express ↔ fastify 一致性**：本课的“一致性”测试只覆盖了 4 种情况。可以继续扩展：
   CORS、`StreamableFile`、`HEAD` 请求、带参数的 content-type……
   每找到一处不一致，都是一个潜在的 issue。
3. **新功能**：`@fastify/multipart` 上传拦截器刚加入（#17835），`FileFieldsInterceptor`、
   `AnyFilesInterceptor` 和 express 版本的行为一致吗？

## 8. 练习

见 `PRACTICES.md` 第八阶段 · platform-fastify。
