# @nestjs/microservices 贡献教程

> 配套测试：`learning/specs/packages/microservices.spec.ts`（9 个，用真实 TCP 通信）
> 练习：`PRACTICES.md` 第八阶段 · microservices

## 1. 一句话定位

让 Nest 应用通过**消息**（而不是 HTTP）通信。同一套 `@MessagePattern` / `@EventPattern`
写法，背后可以换 8 种传输层：TCP、Redis、NATS、MQTT、RabbitMQ、Kafka、gRPC，以及自定义传输层。

| 规模 | 数据 |
| --- | --- |
| 源码文件 | 137 个 |
| 单元测试 | 68 个 spec |
| 2026-04 以来的提交 | 83 个，**仅次于 core**，是最活跃的 package 之一 |

## 2. 目录地图

| 路径 | 作用 |
| --- | --- |
| `server/server.ts` | 所有服务端传输层的**基类**：注册处理器、按 pattern 查找处理器、把返回值转成 Observable |
| `server/server-tcp.ts` 等 8 个 | 各传输层的服务端实现（**一个传输层一个文件**） |
| `client/client-proxy.ts` | 所有客户端的基类：`send()` / `emit()` |
| `client/client-tcp.ts` 等 | 各传输层的客户端实现 |
| `decorators/` | `@MessagePattern`、`@EventPattern`、`@Payload`、`@Ctx`、`@Client` |
| `listeners-controller.ts` | 把 controller 里带 pattern 的方法注册到 server 上（类似 HTTP 的 `RouterExplorer`） |
| `nest-microservice.ts` | `INestMicroservice` 的实现：`init()` → `registerModules()` → `registerListeners()` → `listen()` |
| `ctx-host/` | 每个传输层的上下文对象：`TcpContext`、`KafkaContext`…（`@Ctx()` 拿到的就是它） |
| `exceptions/` | `RpcException`、`BaseRpcExceptionFilter`、`RpcExceptionsHandler` |
| `serializers/` `deserializers/` | 消息在线路上的编码/解码，可以自定义 |
| `external/` | 第三方库（kafkajs、amqplib…）的**类型声明副本**，这样 Nest 不需要把它们当成依赖 |

**架构思路：** 和 HTTP 平台适配器是同一个模式。`core` 不认识 Express 或 Fastify；
同样，`Server` 基类也不认识 Kafka 或 Redis。每个传输层都只是 `Server` / `ClientProxy`
的一个子类，第三方库在**运行时按需加载**（用户只需安装自己用到的那个）。

## 3. 核心流程：一条 TCP 消息的一生

```
客户端                                       服务端
client.send({cmd:'sum'}, [1,2])
  │ ClientProxy.send()  → 生成带 id 的 packet
  │ ClientTCP.publish() → serializer 编码 → socket
  ▼
=========== TCP ===========▶  ServerTCP.handleMessage()        server-tcp.ts:125
                                ├─ deserializer 解码
                                ├─ packet 没有 id → 事件 → handleEvent()   ← emit() 走这里
                                ├─ getHandlerByPattern(pattern)            server.ts:176
                                │    找不到 → 回一个 err: NO_MESSAGE_HANDLER（纯字符串）
                                └─ handler(data, ctx)
                                     ↑ 这个 handler 由 ListenersController 创建，
                                       里面同样包含 guards / interceptors / pipes / 异常过滤器
                                     → transformToObservable()  返回值、Promise、Observable 统一处理
                                     → 每个值序列化成一个响应 packet（带同一个 id）
◀========== TCP ============
ClientTCP 按 id 找到对应的请求，把值推给 Observable
```

**关键设计：** 请求和事件的区别**只在于 packet 里有没有 `id`**。
`send()` 带 id，需要回复；`emit()` 不带 id，发完即止。

## 4. 动手：配套测试证明了什么

| 测试 | 证明 |
| --- | --- |
| 装饰器 = 元数据 ×2 | `@MessagePattern` 写入 `PATTERN_METADATA` 和处理器类型 `MESSAGE`；`@EventPattern` 是 `EVENT` |
| `send()` 请求/响应 | 真实 TCP 往返 |
| 返回 Observable | 客户端收到**一串值** `[3, 2, 1]`，不是一个数组 |
| `RpcException` | 客户端收到 `{ status: 'error', message }` 对象 |
| `@Ctx()` | 拿到 `TcpContext`，`getPattern()` 返回 pattern |
| 没有处理器 | 客户端收到的是**纯字符串** |
| data 为 `null` | **客户端本地就拒绝**，请求不会发出 |
| `emit()` | 事件被异步处理（用 `vi.waitFor` 等待） |

### 写测试时的两个发现

1. **`send('x', null)` 会直接报错**：`The invalid data or message pattern (undefined/null)`
   （`errors/invalid-message.exception.ts`）。一开始我以为 `null` 是合法的“空载荷”。
2. **两种错误形状不同**：`RpcException` 传回来的是 `{ status, message }` 对象，
   而“找不到处理器”传回来的是纯字符串。写客户端错误处理时要两种都考虑到。

### 测试技巧

- **`freePort()`**：先让系统分配一个空闲端口再关掉，避免和本机的 3000 端口冲突。
  上游的 integration 测试直接用默认端口，所以必须串行运行（`fileParallelism: false`）。
- **`vi.waitFor()`**：事件没有回复，只能轮询检查副作用，不能用固定的 `sleep`。
- **`toArray()`**：把 Observable 的多个值收集成数组再断言。

## 5. 上游测试在哪里、怎么跑

```bash
# 单元测试：不需要任何外部服务
npx vitest run packages/microservices
npx vitest run packages/microservices/test/server/server-tcp.spec.ts

# 集成测试：TCP / gRPC 不需要 Docker
npx vitest run --config vitest.config.integration.mts integration/microservices/e2e/sum-rpc.spec.ts

# Redis / NATS / MQTT / RabbitMQ / Kafka 需要 Docker（integration/docker-compose.yml）
npm run test:docker:up
npx vitest run --config vitest.config.integration.mts integration/microservices/e2e/sum-redis.spec.ts
npm run test:docker:down
```

单元测试的写法：**mock 掉第三方客户端**（例如把 kafkajs 的 producer 换成 `vi.fn()`），
只测 Nest 自己的逻辑。参考 `test/server/server-kafka.spec.ts`。

## 6. 贡献切入点（基于真实数据）

2026-07 以来合并的 microservices 修复：

```
fix(microservices): fail pending kafka request on deserializer error (#18043)
fix(microservices): wait for the TCP TLS handshake (#18002)
fix(microservices): survive custom deserializer errors in clients (#17995)
fix(microservices): close both kafka client connections when one fails (#18027)
fix(microservices): wait for both Redis clients to be ready (#18001)
fix(microservices): ignore stale NATS status events (#18000)
fix(microservices): cancel pending TCP retries on close (#17988)
...
```

能看出 bug 集中在三类地方，这也是找贡献机会的方向：

1. **异常路径**：自定义 deserializer 抛错、连接中途失败。正常路径大家都测过，异常路径常常没人测。
2. **生命周期**：连接就绪、关闭、重连、超时计时器的清理。
3. **传输层之间的一致性**：同一个行为在 8 个传输层上表现是否一致。
   例如修了 Redis 的“等待两个客户端都就绪”之后，**其他双连接的传输层是不是也有同样的问题？**
   这类“横向对比”是新人很好的切入点。

**怎么找：** 挑一个最近的 fix，读懂它，然后问“同样的问题在其他传输层存在吗？”

```bash
git show 3965882fe --stat         # 看一个 kafka 修复改了什么
grep -rn "deserialize(" packages/microservices/client/   # 其他客户端是怎么处理 deserializer 错误的？
```

## 7. 练习

见 `PRACTICES.md` 第八阶段 · microservices（P31–P33）。
