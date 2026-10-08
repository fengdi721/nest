# @nestjs/core 贡献教程

> 配套测试：`learning/specs/packages/core.spec.ts`（10 个）
> 以及第 02、03、04、05、07 课（core 的注入器、作用域、请求流程、生命周期、依赖查找）
> 练习：`PRACTICES.md` 第八阶段 · core

## 1. 一句话定位

Nest 的**引擎**：读取 common 写下的元数据，构建依赖图、创建实例、注册路由、执行请求管线、管理生命周期。
所有平台适配器和传输层都插在它上面。

| 规模 | 数据 |
| --- | --- |
| 源码 | 197 个文件 |
| 单元测试 | 103 个 spec（仓库里最多） |
| 2026-04 以来的提交 | **100 个**（仓库里最活跃） |

## 2. 目录地图 → 对应的课程

core 太大，不要从头读。**按主题读，每个主题已经有对应的课程和测试：**

| 目录 / 文件 | 主题 | 去哪里学 |
| --- | --- | --- |
| `nest-factory.ts` `nest-application.ts` | 启动流程 | 02 文档 |
| `scanner.ts` `injector/` | 扫描、依赖注入、依赖查找 | 第 02、07 课，05 文档 |
| `injector/instance-wrapper.ts` `helpers/context-id-factory.ts` | 作用域 | 第 03 课 |
| `router/` `guards/` `interceptors/` `pipes/` `exceptions/` | 请求管线 | 第 04 课 |
| `hooks/` `nest-application-context.ts` | 生命周期钩子、关闭 | 第 05 课 |
| `services/reflector.service.ts` | `Reflector` | **本课** |
| `discovery/` | `DiscoveryService` | **本课** |
| `router/route-path-factory.ts` `middleware/` | 全局前缀、版本控制、中间件排除 | **本课** |
| `router/sse-stream.ts` `router/router-response-controller.ts` | SSE | **本课** |
| `security/` | 内置安全头、CSRF（新功能 #17836） | **本课** |
| `inspector/` `repl/` | 依赖图快照、REPL 调试 | 练习 |
| `injector/internal-core-module/` | 每个 app 都有的内置模块（提供 `Reflector`、`ModuleRef`…） | 第 02 课 |

## 3. 动手：本课测试证明了什么

| 主题 | 测试 | 证明 |
| --- | --- | --- |
| Reflector | `getAllAndOverride` | 方法上的 `@Roles` 覆盖类上的（user 可以访问 `/cats`，不能访问 `/cats/admin`） |
| | `getAllAndMerge` | 方法和类上的值合并成 `['admin', 'admin', 'user']`（**不去重**） |
| DiscoveryService | `createDecorator` + `getProviders({ metadataKey })` | 运行时找出所有标记了 `@JobHandler` 的 provider 和它们的元数据。`@nestjs/schedule`、`@nestjs/cqrs` 等库就是这样工作的 |
| 路由 | 全局前缀 + URI 版本 | `/api/v1/cats` 和 `/api/v2/cats` 由不同方法处理；`/v1/cats` 是 404 |
| | 前缀排除 | 排除的路由没有 `/api` 前缀，**但仍然有 `/v1`** |
| 中间件 | `forRoutes(Controller)` + `exclude` | 带 `version` 的 exclude 生效 |
| **发现** | 不带 `version` 的 exclude | 启用 URI 版本控制后**静默失效**，见第 5 节 |
| SSE | `@Sse` 返回 Observable | `text/event-stream`，每个值一行 `data: {...}` |
| 安全 | `app.useSecurityHeaders()` | 默认加上 CSP、HSTS、`X-Content-Type-Options: nosniff` |

### 写测试时的小插曲：测试本身的 bug

第一次运行有两个测试返回 403。原因是**我自己的测试漏带了 `x-role` 请求头**，被 `RolesGuard` 拒绝了。
测试失败时，**先怀疑测试本身**，再怀疑被测代码。

## 4. 热点：bug 集中在哪里

2026-07 以来的 core 修复：

```
fix(core): end sse streams whose event data cannot be serialized (#18025)
fix(core): send status and headers set by handlers on sse responses (#18011)
fix(core): settle SSE lifecycle on early disconnect (#17987)
fix(core): commit SSE headers for empty streams (#17986)
fix(core): send the expires header on sse responses (#17963)        ← SSE：5 个
fix(core): honor a shutdown signal received while close() is in flight (#18021)
fix(core): run the shutdown sequence after a failed init (#17966)
fix(core): reset the listening state when the application closes (#17951)   ← 关闭：3 个
fix(core): honor global prefix exclusions for overlapping versions (#17953)
fix(core): let a `GET` middleware exclusion cover `HEAD` requests (#17950)
fix(common,core,express): answer method miss on an excluded route (#17923)  ← 前缀/版本/排除：3 个
```

三个热点：**SSE**、**关闭流程**、**前缀 / 版本 / 排除的组合**。
第三个热点正是第 5 节那个发现所在的区域。

## 5. 案例：一个未被记录的行为

### 发现

我想测试“中间件 exclude 的路由不执行中间件”，结果中间件**仍然执行了**。

### 缩小范围：对照实验

不靠猜，写一个临时测试，对 6 种配置逐一验证：

| 配置 | 请求 | 中间件执行了吗？ |
| --- | --- | --- |
| 无前缀、无版本 | `/cats/health` | 否 ✅ |
| 只有前缀 | `/api/cats/health` | 否 ✅ |
| 前缀 + 前缀排除 | `/cats/health` | 否 ✅ |
| **只有 URI 版本** | `/v1/cats/health` | **是** ❌ |
| 前缀 + URI 版本 | `/api/v1/cats/health` | **是** ❌ |
| 前缀排除 + URI 版本 | `/v1/cats/health` | **是** ❌ |

→ 和前缀无关，**只要启用了 URI 版本控制，exclude 就失效**。再加一轮：

| exclude 写法 | 中间件执行了吗？ |
| --- | --- |
| `{ path, method }` | 是 ❌ |
| `{ path, method, version: '1' }` | 否 ✅ |
| `'cats/health'`（字符串） | 是 ❌ |

### 根因

`packages/core/middleware/route-info-path-extractor.ts`：

```ts
private extractVersionPathFrom(versionValue?: VersionValue): string[] {
  if (!versionValue || this.versioningConfig?.type !== VersioningType.URI)
    return [];      // ← exclude 没写 version → 不生成版本段
  ...
}
```

不写 `version` 时，排除路径只生成 `/cats/health`；而路由通过 `defaultVersion` 实际注册在 `/v1/cats/health`，两者对不上。

### 它是 bug 吗？

| 角度 | 情况 |
| --- | --- |
| 文档 | docs.nestjs.com 的 Versioning 章节只讲了 `forRoutes()` 可以带 `version`，**没提 `exclude()`** |
| 直觉 | 写 `exclude('cats/health')` 的人，通常期望**所有版本**都被排除 |
| 后果 | **静默失效**：不报错、不警告，认证中间件可能意外地跑在健康检查上，或者反过来 |
| 查重 | 搜索 “middleware exclude versioning” 等关键词，没有相关 issue |

→ **至少是文档缺口，也可能是行为 bug。** 这类“是 bug 还是设计如此”的问题，**先开 issue 讨论**，
让维护者决定是改行为（例如未写 version 时按 `defaultVersion` 或所有版本处理）还是补文档。
issue 里附上上面两张对照表和本课的测试即可，复现非常完整。

> 开 issue 会以你的账号公开发布，所以我没有替你提交。

## 6. 上游测试

```bash
npx vitest run packages/core                               # 103 个 spec，单元测试
npx vitest run packages/core/test/middleware
npx vitest run packages/core/test/router
npx vitest run --config vitest.config.integration.mts integration/versioning
npx vitest run --config vitest.config.integration.mts integration/hello-world/e2e/exclude-middleware.spec.ts
npx vitest run --config vitest.config.integration.mts integration/hello-world/e2e/middleware-with-versioning.spec.ts
```

## 7. 贡献切入点

1. **第 5 节的发现**：开 issue 讨论（行为还是文档）。
2. **前缀 / 版本 / 排除的组合**：本课的对照实验只覆盖了 URI 版本控制。HEADER、MEDIA_TYPE、CUSTOM
   版本控制下，`forRoutes` / `exclude` 的行为一致吗？这个区域组合多、最近修复也多。
3. **SSE**：5 个修复说明这块还在打磨。客户端提前断开、Observable 报错、空流、非 JSON 数据……
   用本课的 SSE 测试为起点，逐个边界情况去试。
4. **core 的规模意味着评审需求大**：100 个提交 / 半年，评审 core 的 PR（07 文档的方法）本身就是重要贡献。

## 8. 练习

见 `PRACTICES.md` 第八阶段 · core。
