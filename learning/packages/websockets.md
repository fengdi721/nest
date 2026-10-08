# @nestjs/websockets 贡献教程

> 配套测试：`learning/specs/packages/websockets.spec.ts`（10 个，真实 socket.io 连接）
> 练习：`PRACTICES.md` 第八阶段 · websockets

## 1. 一句话定位

WebSocket 网关的**抽象层**：`@WebSocketGateway`、`@SubscribeMessage`、`WsException`，
以及让 guard / pipe / interceptor / filter 在 WebSocket 上也能工作的那套机制。
它**不直接收发消息**，这部分交给适配器：`platform-socket.io`（默认）或 `platform-ws`。

| 规模 | 数据 |
| --- | --- |
| 源码文件 | 44 个 |
| 单元测试 | 18 个 spec |
| 2026-04 以来的提交 | 10 个 |

## 2. 目录地图

| 路径 | 作用 |
| --- | --- |
| `web-sockets-controller.ts` | **核心**：把网关连接到服务器、订阅 connection / disconnect、绑定消息处理器（类似 HTTP 的 `RouterExplorer`） |
| `socket-module.ts` | 在 `app.init()` 时扫描所有网关并交给 controller（被 core 动态加载） |
| `socket-server-provider.ts` `sockets-container.ts` | 按“端口 + 选项”复用服务器实例：多个网关可以共用一个 server |
| `gateway-metadata-explorer.ts` | 从网关类里找出所有带 `@SubscribeMessage` 的方法 |
| `adapters/ws-adapter.ts` | `AbstractWsAdapter`：**所有适配器的基类**（只有 62 行） |
| `context/` | `WsContextCreator`：给每个处理器包上 guards / interceptors / pipes / filters |
| `exceptions/` | `WsException`、`BaseWsExceptionFilter`（默认的错误格式在这里定义） |
| `decorators/` | `@ConnectedSocket`、`@MessageBody`、`@Ack`、`@WebSocketServer` |
| `constants.ts` | 元数据 key。⚠️ **不在公共入口导出** |

## 3. 核心流程

```
app.listen()
  └─ SocketModule.connectAllGateways()
       └─ WebSocketsController.connectGatewayToServer(gateway)
            ├─ SocketServerProvider 拿到（或复用）一个 server ← adapter.create()
            ├─ @WebSocketServer() 属性 ← 注入 server（有 namespace 时注入 Namespace）
            ├─ 调用 afterInit(server)
            └─ subscribeEvents():
                 connection  → handleConnection(client)
                              → adapter.bindMessageHandlers(client, handlers, transform)
                                  每个 handler 都已经被 WsContextCreator 包装过：
                                  guards → interceptors → pipes → 你的方法 → 异常过滤器
                 disconnect  → handleDisconnect(client)

处理器的返回值：
  普通值 / Promise   → 适配器决定怎么发（socket.io：作为 ack）
  { event, data }     → 以 event 为名推送一个新事件
  Observable          → 每个值发一次
  抛出 WsException    → 发 'exception' 事件 { status: 'error', message, cause }
  抛出其他 Error      → 'exception' 事件，message 固定为 'Internal server error'
```

## 4. 动手：配套测试证明了什么

| 测试 | 证明 |
| --- | --- |
| 装饰器元数据 ×2 | `GATEWAY_METADATA`、`MESSAGE_MAPPING_METADATA`、`MESSAGE_METADATA` |
| 生命周期 | 顺序：`afterInit` → `handleConnection`；断开时 `handleDisconnect` |
| `@WebSocketServer()` | 注入的是真正的 socket.io `Server` |
| 返回值 → ack | `client.emitWithAck('sum', [1,2,3])` 得到 `6` |
| `WsResponse` | 返回 `{ event: 'pong', data }` → 客户端收到 `pong` 事件 |
| `WsException` | 客户端收到 `exception` 事件，带 `cause.pattern` |
| guard 返回 false | 变成 `WsException('Forbidden resource')`（对比 HTTP 是 403） |
| `@ConnectedSocket()` | 拿到服务端 socket，`id` 和客户端一致 |

### 写测试时的发现：常量不在公共入口里

我一开始写的是 `import { GATEWAY_METADATA } from '@nestjs/websockets'`，测试失败，
提示 `expected undefined to be true`。原因：

- `packages/websockets/index.ts` 没有 `export * from './constants'`，所以导入得到 `undefined`；
- **vitest 只转译、不做类型检查**，所以这个错误没有在导入时报出来，而是变成了运行时的断言失败。

改成 `from '@nestjs/websockets/constants.js'` 就好了。
**教训：** 断言结果是 `undefined` 时，先怀疑“我拿到的是不是真的那个东西”。

## 5. 上游测试在哪里、怎么跑

```bash
npx vitest run packages/websockets                          # 单元测试，大量使用 mock
npx vitest run --config vitest.config.integration.mts integration/websockets   # 真实连接，不需要 Docker
```

上游的 `web-sockets-controller.spec.ts` 有 900 多行，几乎全部用 mock。
`integration/websockets/e2e/connection-hook-error.spec.ts`（最新的 `b6295c799` 加的）
是 `app.listen(0)` + `app.getUrl()` 写法的好例子：不占用固定端口。

## 6. 贡献切入点

2026-03 以来的 websockets 修复：

```
fix(websockets): pass gateway lifecycle hook errors to exception filters (#18048)
fix(websockets): pass the pattern when a scoped handler fails to resolve (#18046)
fix(websockets): use the hook name as pattern for request-scoped hooks (#18044)
fix(websockets): resolve global scoped enhancers per connection (#17979)
fix(websockets): retain shared contexts during disconnect hooks (#17985)
fix(websockets): await async request-scoped connection hooks (#17926)
```

**规律：** 6 个修复里有 5 个和 **request-scoped 网关**或**生命周期钩子**有关。
WebSocket 没有“一个请求”的概念，REQUEST 作用域（第 03 课）在这里要按“连接”或“消息”来模拟，
边界情况特别多。这是这个 package 当前最容易出 bug 的区域。

**怎么找：** 拿第 03 课的作用域知识，结合 `integration/websockets/src/request-scope.gateway.ts`，
问自己：handleConnection / handleDisconnect / afterInit 在 REQUEST 作用域下，
每一种错误（同步抛错、异步 reject、过滤器再抛错）都被正确处理了吗？

## 7. 练习

见 `PRACTICES.md` 第八阶段 · websockets。
