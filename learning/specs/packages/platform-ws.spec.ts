/**
 * Package 教程配套测试 —— @nestjs/platform-ws
 * 文档：learning/packages/platform-ws.md
 *
 * WsAdapter 基于原生 WebSocket（ws 库），没有 socket.io 的事件协议，
 * 所以 Nest 自己约定了一个 JSON 格式：{ "event": "...", "data": ... }
 * 源码：packages/platform-ws/adapters/ws-adapter.ts
 */
import { INestApplication } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import { Test } from '@nestjs/testing';
import {
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import WebSocket from 'ws';

@WebSocketGateway({ path: '/events' })
class EventsGateway {
  @SubscribeMessage('echo')
  echo(@MessageBody() data: unknown) {
    // WsAdapter 只会把 { event, data } 形状的返回值发回去
    return { event: 'echo', data };
  }

  @SubscribeMessage('silent')
  silent() {
    // 返回普通值：WsAdapter 会把它 JSON.stringify 后原样发送
    return 'plain value';
  }

  @SubscribeMessage('crash')
  crash(): never {
    throw new Error('sync crash');
  }
}

describe('@nestjs/platform-ws', () => {
  let app: INestApplication;
  let wsUrl: string;
  const sockets: WebSocket[] = [];

  async function connect(path = '/events') {
    const ws = new WebSocket(`${wsUrl}${path}`);
    sockets.push(ws);
    await new Promise((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });
    return ws;
  }

  /** 收集一段时间内收到的所有消息 */
  function collect(ws: WebSocket, ms = 100): Promise<unknown[]> {
    const got: unknown[] = [];
    ws.on('message', raw => got.push(JSON.parse(raw.toString())));
    return new Promise(resolve => setTimeout(() => resolve(got), ms));
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [EventsGateway],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.useWebSocketAdapter(new WsAdapter(app));
    await app.listen(0);
    wsUrl = (await app.getUrl()).replace('http', 'ws');
  });

  afterAll(async () => {
    sockets.forEach(ws => ws.close());
    await app.close();
  });

  it('消息协议：发送 {event, data}，收到 {event, data}', async () => {
    const ws = await connect();
    const messages = collect(ws);
    ws.send(JSON.stringify({ event: 'echo', data: { a: 1 } }));
    expect(await messages).toEqual([{ event: 'echo', data: { a: 1 } }]);
  });

  it('返回普通值也会原样发送（没有 event 包装）', async () => {
    const ws = await connect();
    const messages = collect(ws);
    ws.send(JSON.stringify({ event: 'silent' }));
    expect(await messages).toEqual(['plain value']);
  });

  it('path 不匹配 → 连接被拒绝', async () => {
    await expect(connect('/wrong')).rejects.toThrow();
  });

  it('健壮性：非法 JSON 和未知事件被静默丢弃，连接仍然可用', async () => {
    const ws = await connect();
    const messages = collect(ws, 200);

    ws.send('this is not json'); // 默认解析器抛错 → 丢弃（不打日志，防止日志刷屏）
    ws.send(JSON.stringify({ event: 'unknown' })); // 未知事件 → 丢弃
    ws.send(JSON.stringify({ event: 'echo', data: 'still alive' }));

    expect(await messages).toEqual([{ event: 'echo', data: 'still alive' }]);
    expect(ws.readyState).toBe(WebSocket.OPEN);
  });

  it('处理器抛普通 Error → 变成 exception 事件，且内部信息被隐藏', async () => {
    // 写测试时的发现：错误先被 @nestjs/websockets 的异常处理层捕获，
    // 适配器里的 try/catch 只是最后的兜底。
    // 非 WsException 的错误一律显示为 "Internal server error"，不泄露 "sync crash"。
    const ws = await connect();
    const messages = collect(ws, 200);

    ws.send(JSON.stringify({ event: 'crash' }));
    ws.send(JSON.stringify({ event: 'echo', data: 'still alive' }));

    expect(await messages).toEqual([
      {
        event: 'exception',
        data: {
          status: 'error',
          message: 'Internal server error',
          cause: { pattern: 'crash' },
        },
      },
      { event: 'echo', data: 'still alive' },
    ]);
  });

  it('自定义 messageParser：可以换成别的协议', async () => {
    // WsAdapter 的第二个参数允许自定义解析，例如 "event:data" 的纯文本格式
    const moduleRef = await Test.createTestingModule({
      providers: [EventsGateway],
    }).compile();
    const custom = moduleRef.createNestApplication({ logger: false });
    custom.useWebSocketAdapter(
      new WsAdapter(custom, {
        messageParser: raw => {
          const [event, data] = raw.toString().split(':');
          return { event, data };
        },
      }),
    );
    await custom.listen(0);
    const url = (await custom.getUrl()).replace('http', 'ws');

    const ws = new WebSocket(`${url}/events`);
    await new Promise(resolve => ws.once('open', resolve));
    const reply = new Promise(resolve =>
      ws.once('message', raw => resolve(JSON.parse(raw.toString()))),
    );
    ws.send('echo:hello');
    await expect(reply).resolves.toEqual({ event: 'echo', data: 'hello' });

    ws.close();
    await custom.close();
  });
});
