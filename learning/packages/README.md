# 按 package 分的贡献教程

仓库的 9 个 package，每个都有：**一篇中文教程** + **一个可运行的测试文件** + **PRACTICES.md 里的练习**。

```bash
# 运行全部 package 的测试
npx vitest run --config learning/vitest.config.mts learning/specs/packages

# 只运行某一个
npx vitest run --config learning/vitest.config.mts learning/specs/packages/core.spec.ts
```

## 总览

| Package | 教程 | 测试 | 测试数 | 写教程时的发现 |
| --- | --- | --- | --- | --- |
| `@nestjs/common` | [common.md](common.md) | `specs/packages/common.spec.ts` | 16 | 继承类 bug 的调查方法；`@Optional` 参数分支经核对**不是** bug |
| `@nestjs/core` | [core.md](core.md) | `specs/packages/core.spec.ts` | 10 | 🔎 **URI 版本控制下，不带 `version` 的中间件 `exclude` 静默失效**（未报告） |
| `@nestjs/microservices` | [microservices.md](microservices.md) | `specs/packages/microservices.spec.ts` | 9 | `send()` 的 data 不能为 null；两种错误形状不同；变异测试暴露集成测试的盲区 |
| `@nestjs/websockets` | [websockets.md](websockets.md) | `specs/packages/websockets.spec.ts` | 10 | 常量不在公共入口；vitest 不做类型检查 |
| `@nestjs/platform-express` | [platform-express.md](platform-express.md) | `specs/packages/platform-express.spec.ts` | 10 | 亲身踩中 multer 文案变化（#17769 的成因）；busboy 按文案匹配经核对**不是** bug |
| `@nestjs/platform-fastify` | [platform-fastify.md](platform-fastify.md) | `specs/packages/platform-fastify.spec.ts` | 9 + 1 `it.fails` | 🐛 **`@RouteSchema` 校验失败返回 500 而不是 400**（未报告，已验证修复思路） |
| `@nestjs/platform-socket.io` | [platform-socket.io.md](platform-socket.io.md) | `specs/packages/platform-socket.io.spec.ts` | 3 | 两个适配器横向对比的方法 |
| `@nestjs/platform-ws` | [platform-ws.md](platform-ws.md) | `specs/packages/platform-ws.spec.ts` | 6 | 错误处理有两层；非 `WsException` 的错误信息被隐藏 |
| `@nestjs/testing` | [testing.md](testing.md) | `specs/packages/testing.spec.ts` | 9 | override 是“原地替换”；`CapturingLogger` 匹配不到带颜色码的日志 |

## 每篇教程的结构

1. **一句话定位**，以及规模数据（源码文件数、spec 数、近期提交数）
2. **目录地图**：每个文件 / 目录是做什么的
3. **核心流程**：一个请求 / 一条消息在这个 package 里怎么走
4. **配套测试证明了什么**，以及**写测试时的发现**
5. **上游测试在哪里、怎么跑**
6. **贡献切入点**：基于真实的近期提交，看 bug 集中在哪里
7. **练习**：在 `PRACTICES.md` 第八阶段

## 建议的阅读顺序

```
testing → common → core → platform-express → platform-fastify
        → websockets → platform-socket.io → platform-ws → microservices
```

先读 **testing**（531 行，一个下午就能读完，而且你每天都在用），
再读 **common → core**（框架的地基），然后是 **HTTP 平台**，最后是 **WebSocket** 和 **microservices**。

## 贯穿所有 package 的方法

写这 9 篇教程时反复用到的几个方法，整理在这里：

| 方法 | 在哪里用过 |
| --- | --- |
| **写学习测试来验证理解**；测试失败时先怀疑测试本身 | 所有 package；core（漏带请求头） |
| **和“不经过 Nest 的原生库”对比** | fastify（纯 fastify 返回 400）、platform-socket.io（对比 Node 的 `net`） |
| **对照实验缩小范围**：一次只改一个变量 | core（6 种配置 → 定位到 URI 版本控制） |
| **读懂一个修复 → 搜索同样的代码模式 → 用测试逐个确认** | common（`getOwnMetadata`） |
| **横向对比同类实现** | express ↔ fastify、socket.io ↔ ws、8 个传输层 |
| **核对过、没发现问题，也是有效结论** | common（`@Optional` 参数分支）、express（busboy）、socket.io（编码失败） |
| **在本地验证修复思路，再还原** | fastify（463 个上游测试仍然通过） |
| **用变异测试检验练习和测试本身** | 每个“改坏”类练习都实际跑过；microservices 的变异暴露了集成测试的盲区 |
| **用 `it.fails` 记录已知 bug** | 第 06 课（#18052）、fastify（`@RouteSchema`） |
