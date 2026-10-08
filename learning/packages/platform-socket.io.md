# @nestjs/platform-socket.io 贡献教程

> 配套测试：`learning/specs/packages/platform-socket.io.spec.ts`（3 个：命名空间、房间、`@Ack`）
> 练习：`PRACTICES.md` 第八阶段 · platform-socket.io

## 1. 一句话定位

把 socket.io 接入 `@nestjs/websockets` 的适配器。它是 Nest **默认**的 WebSocket 适配器：
只要安装了这个包，不调用 `useWebSocketAdapter()` 也会用它。

| 规模 | 数据 |
| --- | --- |
| 源码 | **3 个文件**，核心只有 `adapters/io-adapter.ts`（128 行） |
| 单元测试 | 1 个 spec |
| 2026-04 以来的提交 | 3 个 |

**这是整个仓库最小的 package 之一，非常适合完整读一遍源码。** 建议花 20 分钟把 `io-adapter.ts` 从头读到尾。

## 2. 源码导读：`io-adapter.ts`

| 方法 | 作用 |
| --- | --- |
| `create(port, options)` | 有 `namespace` 时返回 `server.of(namespace)`，否则返回整个 `Server` |
| `createIOServer(port, options)` | port 为 0 时挂到 Nest 的 HTTP 服务器上（共用端口），否则单独开一个端口 |
| `bindMessageHandlers()` | 为每个 `@SubscribeMessage` 调用 `socket.on(message, ...)`，并处理返回值 |
| `mapPayload(payload)` | 把 socket.io 的参数拆成 `{ data, ack }`：**最后一个参数是函数时，它就是 ack** |

`bindMessageHandlers` 的关键逻辑（约第 60–90 行）：

```ts
handlers.forEach(({ message, callback, isAckHandledManually }) => {
  fromEvent(socket, message).pipe(
    mergeMap(payload => {
      const { data, ack } = this.mapPayload(payload);
      return defer(() => transform(callback(data, ack)))   // defer：同步抛错也能被 RxJS 接住
        .pipe(map(response => [response, ack, isAckHandledManually]));
    }),
  ).subscribe(([response, ack, isAckHandledManually]) => {
    if (response.event)                → socket.emit(response.event, response.data)
    else if (!isAckHandledManually && ack) → ack(response)    // 用了 @Ack() 就不自动 ack
  });
});
```

## 3. 动手：配套测试证明了什么

| 测试 | 证明 |
| --- | --- |
| 命名空间隔离 | `@WebSocketGateway({ namespace: 'chat' })` 的事件只在 `/chat` 有效；在 `/chat` 发 `where` 会超时 |
| 房间 | `client.join(room)` + `nsp.to(room).emit()`：只有房间里的人收到，**发送者自己没加入也收不到** |
| `@Ack()` | 手动调用 ack；方法的返回值（`'ignored'`）**不会**再自动发送 |

测试技巧：`client.timeout(100).emitWithAck(...)` 用来断言“**没有**回应”，
比 `setTimeout` 后检查变量更清楚。

## 4. 上游测试

```bash
npx vitest run packages/platform-socket.io
npx vitest run --config vitest.config.integration.mts integration/websockets/e2e/gateway.spec.ts
npx vitest run --config vitest.config.integration.mts integration/websockets/e2e/gateway-ack.spec.ts
```

## 5. 贡献切入点：两个适配器横向对比

最近的修复：

```
fix(socket.io): keep the message stream alive when a handler throws (#17666)
fix(socket.io): Deduplicate disconnect listener in bindMessageHandlers
fix(ws):        stop discarding parser and handler lookup failures silently
fix(ws):        remove the upgrade listener on dispose
```

**规律：** 两个适配器在修**同一类问题**：处理器抛错后消息流不能断、监听器不能泄漏、错误不能被静默吞掉。

**思路：** 每当一个适配器修了某个问题，就去检查另一个适配器有没有同样的问题。

**示例（已核对）：** “发送响应时编码失败，不能让进程崩溃”。两边都处理了：
- ws：`onMessage` 里用 try/catch 包住 `JSON.stringify`
- socket.io：`bindMessageHandlers` 第 80–95 行的 try/catch，注释说明 socket.io 的编码器会递归遍历，嵌套过深会栈溢出

→ 结论：**两边一致，没有问题。** 这也是一个有效的结论：核对过、没发现问题，
就不要提 issue。把“查了什么、为什么没问题”记进 JOURNAL，避免以后重复检查。

还没核对过的问题，留给你：

1. `close()` / `dispose()` 时，两个适配器都清理了自己添加的所有监听器吗？
   （ws 最近刚修过 “remove the upgrade listener on dispose”；io-adapter 的 `disconnectMap` 呢？）
2. 两个适配器对 `handleDisconnect` 传的参数一样吗？（io 传了 `reason`，ws 呢？）

把这个问题写成测试：同一个网关，分别用两个适配器跑，看行为是否一致。
**如果不一致，先开 issue 讨论**（不确定那是 bug 还是有意为之）。

## 6. 练习

见 `PRACTICES.md` 第八阶段 · platform-socket.io。
