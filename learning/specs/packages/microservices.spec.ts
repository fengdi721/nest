/**
 * Package 教程配套测试 —— @nestjs/microservices
 * 文档：learning/packages/microservices.md
 *
 * 用真实的 TCP 传输层，在同一个进程里启动“服务端”和“客户端”：
 *   ClientProxy.send()  → 请求/响应（@MessagePattern）
 *   ClientProxy.emit()  → 只发不收的事件（@EventPattern）
 */
import { Controller, INestMicroservice } from '@nestjs/common';
import {
  ClientProxy,
  ClientProxyFactory,
  Ctx,
  EventPattern,
  MessagePattern,
  Payload,
  RpcException,
  TcpContext,
  Transport,
} from '@nestjs/microservices';
import {
  PATTERN_HANDLER_METADATA,
  PATTERN_METADATA,
} from '@nestjs/microservices/constants.js';
import { PatternHandler } from '@nestjs/microservices/enums/pattern-handler.enum.js';
import { Test } from '@nestjs/testing';
import { createServer } from 'node:net';
import { lastValueFrom, Observable, of, toArray } from 'rxjs';

/** 让系统分配一个空闲端口，避免和本机其他服务冲突 */
async function freePort(): Promise<number> {
  return new Promise(resolve => {
    const srv = createServer().listen(0, () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
  });
}

const received: unknown[] = [];

@Controller()
class MathController {
  @MessagePattern({ cmd: 'sum' })
  sum(@Payload() numbers: number[]) {
    return numbers.reduce((a, b) => a + b, 0);
  }

  @MessagePattern('countdown')
  countdown(@Payload() from: number): Observable<number> {
    // 返回 Observable 时，每个值都会作为一个独立的响应包发回客户端
    return of(...Array.from({ length: from }, (_, i) => from - i));
  }

  @MessagePattern('divide')
  divide(@Payload() [a, b]: [number, number]) {
    if (b === 0) {
      throw new RpcException('Division by zero');
    }
    return a / b;
  }

  @MessagePattern('whoami')
  whoami(@Ctx() ctx: TcpContext) {
    // 第 04 课的 ExecutionContext 在这里变成了 RPC 版本的 context
    return ctx.getPattern();
  }

  @EventPattern('user_created')
  onUserCreated(@Payload() user: { name: string }) {
    received.push(user);
  }
}

describe('@nestjs/microservices', () => {
  describe('装饰器 = 元数据（和第 01 课同一个思路）', () => {
    it('@MessagePattern 记录 pattern 和处理器类型', () => {
      const handler = MathController.prototype.sum;
      expect(Reflect.getMetadata(PATTERN_METADATA, handler)).toEqual([
        { cmd: 'sum' },
      ]);
      expect(Reflect.getMetadata(PATTERN_HANDLER_METADATA, handler)).toBe(
        PatternHandler.MESSAGE,
      );
    });

    it('@EventPattern 的处理器类型是 EVENT', () => {
      expect(
        Reflect.getMetadata(
          PATTERN_HANDLER_METADATA,
          MathController.prototype.onUserCreated,
        ),
      ).toBe(PatternHandler.EVENT);
    });
  });

  describe('真实 TCP 通信', () => {
    let server: INestMicroservice;
    let client: ClientProxy;

    beforeAll(async () => {
      const port = await freePort();
      const moduleRef = await Test.createTestingModule({
        controllers: [MathController],
      }).compile();

      server = moduleRef.createNestMicroservice({
        transport: Transport.TCP,
        options: { host: '127.0.0.1', port },
        logger: false,
      });
      await server.listen();

      client = ClientProxyFactory.create({
        transport: Transport.TCP,
        options: { host: '127.0.0.1', port },
      });
      await client.connect();
    });

    afterAll(async () => {
      await client.close();
      await server.close();
    });

    it('send(): 请求/响应', async () => {
      await expect(
        lastValueFrom(client.send({ cmd: 'sum' }, [1, 2, 3, 4])),
      ).resolves.toBe(10);
    });

    it('send(): 处理器返回 Observable → 客户端收到一串值', async () => {
      const values = await lastValueFrom(
        client.send('countdown', 3).pipe(toArray()),
      );
      expect(values).toEqual([3, 2, 1]);
    });

    it('RpcException 会被序列化后传回客户端（不是 HTTP 状态码）', async () => {
      await expect(
        lastValueFrom(client.send('divide', [1, 0])),
      ).rejects.toEqual({ status: 'error', message: 'Division by zero' });
    });

    it('@Ctx() 拿到传输层上下文', async () => {
      await expect(lastValueFrom(client.send('whoami', {}))).resolves.toBe(
        'whoami',
      );
    });

    it('没有匹配的处理器时，客户端收到的是纯字符串（注意：和 RpcException 的对象形状不同）', async () => {
      // 来源：packages/microservices/constants.ts → NO_MESSAGE_HANDLER
      await expect(
        lastValueFrom(client.send('no-such-pattern', {})),
      ).rejects.toBe(
        'There is no matching message handler defined in the remote service.',
      );
    });

    it('data 不能是 null/undefined：客户端在本地就拒绝，请求不会发出', async () => {
      // 写这个测试时踩到的坑，见 packages/microservices/client/client-proxy.ts
      await expect(lastValueFrom(client.send('whoami', null))).rejects.toThrow(
        'The invalid data or message pattern (undefined/null)',
      );
    });

    it('emit(): 事件只发不收，服务端异步处理', async () => {
      received.length = 0;
      await lastValueFrom(client.emit('user_created', { name: 'Tom' }));
      await vi.waitFor(() => expect(received).toEqual([{ name: 'Tom' }]));
    });
  });
});
