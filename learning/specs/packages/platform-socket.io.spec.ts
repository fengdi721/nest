/**
 * Package 教程配套测试 —— @nestjs/platform-socket.io
 * 文档：learning/packages/platform-socket.io.md
 *
 * IoAdapter 只有 128 行（adapters/io-adapter.ts），却把 socket.io 的
 * 命名空间（namespace）、房间（room）、ack 回调都接进了 Nest 的网关模型。
 */
import { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Test } from '@nestjs/testing';
import {
  Ack,
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { io, Socket as ClientSocket } from 'socket.io-client';

@WebSocketGateway({ namespace: 'chat' })
class ChatGateway {
  // 设置了 namespace 时，注入的是 Namespace 而不是整个 Server
  @WebSocketServer()
  nsp!: Namespace;

  @SubscribeMessage('join')
  async join(@MessageBody() room: string, @ConnectedSocket() client: Socket) {
    await client.join(room);
    return `joined ${room}`;
  }

  @SubscribeMessage('say')
  say(@MessageBody() { room, text }: { room: string; text: string }) {
    // 只发给某个房间里的客户端
    this.nsp.to(room).emit('message', text);
  }

  @SubscribeMessage('slow')
  async slow(@Ack() ack: (response: unknown) => void) {
    // 用了 @Ack() 就由你手动调用 ack；方法返回值会被忽略
    await new Promise(resolve => setTimeout(resolve, 10));
    ack('manual ack');
    return 'ignored';
  }
}

@WebSocketGateway()
class RootGateway {
  @SubscribeMessage('where')
  where() {
    return 'root';
  }
}

describe('@nestjs/platform-socket.io', () => {
  let app: INestApplication;
  let url: string;
  const clients: ClientSocket[] = [];

  async function connect(path = ''): Promise<ClientSocket> {
    const client = io(`${url}${path}`, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });
    clients.push(client);
    await new Promise(resolve => client.once('connect', resolve));
    return client;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [ChatGateway, RootGateway],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    // 不写这一行也会默认使用 IoAdapter；显式写出来更清楚
    app.useWebSocketAdapter(new IoAdapter(app));
    await app.listen(0);
    url = await app.getUrl();
  });

  afterAll(async () => {
    clients.forEach(c => c.disconnect());
    await app.close();
  });

  it('命名空间相互隔离：根命名空间收不到 chat 的事件', async () => {
    const root = await connect();
    const chat = await connect('/chat');

    await expect(root.emitWithAck('where')).resolves.toBe('root');
    await expect(chat.emitWithAck('join', 'lobby')).resolves.toBe(
      'joined lobby',
    );
    // 'where' 只注册在根命名空间；chat 发出去不会有回应
    await expect(chat.timeout(100).emitWithAck('where')).rejects.toThrow(
      'operation has timed out',
    );
  });

  it('房间：只有加入了房间的客户端才收到消息', async () => {
    const alice = await connect('/chat');
    const bob = await connect('/chat');
    await alice.emitWithAck('join', 'room-1');

    const aliceGot = new Promise(resolve => alice.once('message', resolve));
    const bobGot = vi.fn();
    bob.on('message', bobGot);

    bob.emit('say', { room: 'room-1', text: 'hi room-1' });

    await expect(aliceGot).resolves.toBe('hi room-1');
    expect(bobGot).not.toHaveBeenCalled(); // bob 没加入，发消息的人自己也收不到
  });

  it('@Ack()：手动确认，返回值被忽略', async () => {
    const chat = await connect('/chat');
    await expect(chat.emitWithAck('slow')).resolves.toBe('manual ack');
  });
});
