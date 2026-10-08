# @nestjs/platform-ws 贡献教程

> 配套测试：`learning/specs/packages/platform-ws.spec.ts`（6 个）
> 练习：`PRACTICES.md` 第八阶段 · platform-ws

## 1. 一句话定位

基于原生 WebSocket（`ws` 库）的适配器。和 socket.io 不同，原生 WebSocket 只能收发字符串或二进制，
**没有“事件”的概念**，所以 Nest 约定了一个 JSON 协议：

```json
{ "event": "echo", "data": { "any": "payload" } }
```

| 规模 | 数据 |
| --- | --- |
| 源码 | 3 个文件，核心 `adapters/ws-adapter.ts`（338 行） |
| 单元测试 | 2 个 spec |
| 2026-04 以来的提交 | 5 个 |

## 2. 源码导读：`ws-adapter.ts`

这个文件的**注释写得特别好**，很多注释解释的是“为什么这样做”，读它能学到很多安全方面的考虑：

| 位置 | 设计决策 |
| --- | --- |
| `defaultMessageParser`（约第 50 行） | 默认用 `JSON.parse`；放在类外面，是为了能判断“当前用的是不是默认解析器” |
| `bindMessageHandler` 的 catch | **默认解析器**解析失败时**不记日志**：客户端输入不可信，记日志会让公开的 socket 变成刷日志的攻击入口；**自定义解析器**抛错是应用 bug，要记日志 |
| 未知事件 | 直接丢弃，不当成错误（公开 socket 上收到未知事件是正常情况） |
| `onMessage` 里的 try/catch | `JSON.stringify` 遇到循环引用、BigInt 或嵌套过深的数据会抛错，不处理会让 RxJS 异步重抛、**导致进程崩溃** |
| `create()` + `path` | 多个网关可以在同一个端口上用不同的 path，通过 HTTP `upgrade` 事件按 pathname 分发（约第 300 行） |

## 3. 动手：配套测试证明了什么

| 测试 | 证明 |
| --- | --- |
| 消息协议 | 发 `{event, data}`，返回 `{event, data}` 时原样发回 |
| 普通返回值 | 返回 `'plain value'` → 客户端收到 `"plain value"`（没有 event 包装） |
| path 不匹配 | 连接 `/wrong` 被拒绝 |
| 非法 JSON / 未知事件 | 被静默丢弃，**后面的消息照常处理**，连接保持打开 |
| 处理器抛普通 `Error` | 客户端收到 `exception` 事件，message 是 `Internal server error`（不泄露 `sync crash`） |
| 自定义 `messageParser` | 可以把协议换成纯文本 `echo:hello` |

### 写测试时的发现：错误处理有两层

一开始我以为处理器抛错会被适配器的 `try/catch` 静默吞掉，结果客户端收到了一个 `exception` 事件。原因是：

```
你的处理器抛错
  → 第一层：@nestjs/websockets 的 WsExceptionsHandler（exceptions/ws-exceptions-handler.ts，包在 handler 外面）
       'Internal server error' 来自 packages/core/constants.ts 的 UNKNOWN_EXCEPTION_MESSAGE
       把它变成 { event: 'exception', data: { status, message, cause } }
       非 WsException → message 统一改成 'Internal server error'
  → 第二层：ws-adapter 的 try/catch 只兜底“第一层也没接住”的情况
```

**教训：** 读适配器代码时要记住，传进来的 `callback` 已经被上层包装过。
同一段 `try/catch` 在不同层的意义完全不同。

## 4. 上游测试

```bash
npx vitest run packages/platform-ws
npx vitest run --config vitest.config.integration.mts integration/websockets/e2e/ws-gateway.spec.ts
```

上游 e2e 用的是固定端口（3000、8080），所以 integration 测试必须串行运行。

## 5. 贡献切入点

```
fix(ws): default omitted adapter creation options (#18003)
fix(ws): stop discarding parser and handler lookup failures silently
refactor(ws): extract the default message parser to a module constant
test(ws): cover the message handler binding failure paths      ← 只加测试的 PR，被合并了
fix(ws): remove the upgrade listener on dispose
```

注意 `test(ws): cover the message handler binding failure paths`：**只补测试的 PR 同样会被合并**，
和我们为 P18 准备的 PR 是同一类。

方向：

1. **补测试**：`packages/platform-ws/test` 只有 2 个 spec。对照上面表格里的每个设计决策，看有没有对应的单元测试。
2. **和 socket.io 对比**（见 platform-socket.io 教程第 5 节）。
3. **文档**：WsAdapter 的消息协议、`messageParser` 选项，在 docs.nestjs.com 上写清楚了吗？

## 6. 练习

见 `PRACTICES.md` 第八阶段 · platform-ws。
