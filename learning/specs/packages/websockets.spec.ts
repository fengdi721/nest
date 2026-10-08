/**
 * Package 教程配套测试 —— @nestjs/websockets
 * 文档：learning/packages/websockets.md
 *
 * @nestjs/websockets 是“抽象层”：网关、装饰器、异常、增强器（guard/pipe/filter）。
 * 真正收发消息的是适配器（默认 socket.io，见 platform-socket.io.spec.ts）。
 */
import {
  CanActivate,
  INestApplication,
  Injectable,
  UseGuards,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
  WsResponse,
} from '@nestjs/websockets';
// 注意：这些常量不在 '@nestjs/websockets' 的公共入口里。从入口导入会得到 undefined，
// 而 vitest 不做类型检查，不会提前报错（写这个测试时踩到的坑）。
import {
  GATEWAY_METADATA,
  MESSAGE_MAPPING_METADATA,
  MESSAGE_METADATA,
} from '@nestjs/websockets/constants.js';
import type { Server, Socket } from 'socket.io';
import { io, Socket as ClientSocket } from 'socket.io-client';

const lifecycle: string[] = [];

@Injectable()
class DenyGuard implements CanActivate {
  canActivate() {
    return false;
  }
}

@WebSocketGateway()
class EventsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  afterInit() {
    lifecycle.push('afterInit');
  }
  handleConnection() {
    lifecycle.push('handleConnection');
  }
  handleDisconnect() {
    lifecycle.push('handleDisconnect');
  }

  // 返回普通值 → 作为 ack（确认回调）的参数发回给客户端
  @SubscribeMessage('sum')
  sum(@MessageBody() numbers: number[]) {
    return numbers.reduce((a, b) => a + b, 0);
  }

  // 返回 { event, data } → 以一个新事件推送给客户端
  @SubscribeMessage('ping')
  ping(): WsResponse<string> {
    return { event: 'pong', data: 'hello' };
  }

  @SubscribeMessage('fail')
  fail() {
    throw new WsException('Something went wrong');
  }

  @UseGuards(DenyGuard)
  @SubscribeMessage('secret')
  secret() {
    return 'never';
  }

  @SubscribeMessage('whoami')
  whoami(@ConnectedSocket() client: Socket) {
    return client.id;
  }
}

describe('@nestjs/websockets', () => {
  describe('装饰器 = 元数据', () => {
    it('@WebSocketGateway 标记网关类', () => {
      expect(Reflect.getMetadata(GATEWAY_METADATA, EventsGateway)).toBe(true);
    });

    it('@SubscribeMessage 在方法上记录事件名', () => {
      const handler = EventsGateway.prototype.sum;
      expect(Reflect.getMetadata(MESSAGE_MAPPING_METADATA, handler)).toBe(true);
      expect(Reflect.getMetadata(MESSAGE_METADATA, handler)).toBe('sum');
    });
  });

  describe('真实连接（默认的 socket.io 适配器）', () => {
    let app: INestApplication;
    let client: ClientSocket;

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
        providers: [EventsGateway, DenyGuard],
      }).compile();
      app = moduleRef.createNestApplication({ logger: false });
      await app.listen(0); // 端口 0 = 让系统分配
      client = io(await app.getUrl(), {
        transports: ['websocket'],
        forceNew: true,
        reconnection: false,
      });
      await new Promise(resolve => client.once('connect', resolve));
    });

    afterAll(async () => {
      client.disconnect();
      await app.close();
    });

    it('网关生命周期钩子：afterInit → handleConnection', () => {
      expect(lifecycle).toEqual(['afterInit', 'handleConnection']);
    });

    it('@WebSocketServer() 注入了底层的 socket.io Server', () => {
      const gateway = app.get(EventsGateway);
      expect(gateway.server.engine).toBeDefined();
    });

    it('返回值 → ack', async () => {
      await expect(client.emitWithAck('sum', [1, 2, 3])).resolves.toBe(6);
    });

    it('返回 WsResponse → 推送一个新事件', async () => {
      const pong = new Promise(resolve => client.once('pong', resolve));
      client.emit('ping');
      await expect(pong).resolves.toBe('hello');
    });

    it('WsException → 客户端收到 "exception" 事件', async () => {
      const exception = new Promise(resolve =>
        client.once('exception', resolve),
      );
      client.emit('fail');
      await expect(exception).resolves.toEqual({
        status: 'error',
        message: 'Something went wrong',
        cause: { pattern: 'fail', data: undefined },
      });
    });

    it('guard 返回 false → WsException("Forbidden resource")', async () => {
      const exception = new Promise<any>(resolve =>
        client.once('exception', resolve),
      );
      client.emit('secret');
      expect(await exception).toMatchObject({
        status: 'error',
        message: 'Forbidden resource',
      });
    });

    it('@ConnectedSocket() 拿到服务端的 socket 对象', async () => {
      await expect(client.emitWithAck('whoami', {})).resolves.toBe(client.id);
    });

    it('断开连接触发 handleDisconnect', async () => {
      const other = io(await app.getUrl(), {
        transports: ['websocket'],
        forceNew: true,
        reconnection: false,
      });
      await new Promise(resolve => other.once('connect', resolve));
      lifecycle.length = 0;
      other.disconnect();
      await vi.waitFor(() => expect(lifecycle).toEqual(['handleDisconnect']));
    });
  });
});
