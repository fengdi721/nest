/**
 * Package 教程配套测试 —— @nestjs/testing
 * 文档：learning/packages/testing.md
 *
 * 这个 package 只有 531 行，但你每天都在用它。读懂它 = 读懂“测试时 Nest 和运行时有什么不同”。
 */
import {
  CanActivate,
  Global,
  Controller,
  Get,
  INestApplication,
  Injectable,
  Logger,
  Module,
  UseGuards,
} from '@nestjs/common';
import { CapturingLogger, Test } from '@nestjs/testing';
import request from 'supertest';

@Injectable()
class PaymentsClient {
  charge(amount: number) {
    throw new Error(`real network call: ${amount}`);
  }
}

@Module({ providers: [PaymentsClient], exports: [PaymentsClient] })
class PaymentsModule {}

@Injectable()
class OrdersService {
  private readonly logger = new Logger(OrdersService.name);
  constructor(private readonly payments: PaymentsClient) {}

  checkout(amount: number) {
    this.logger.log('checkout', { amount });
    return this.payments.charge(amount);
  }
}

@Injectable()
class AuthGuard implements CanActivate {
  canActivate() {
    return false; // 真实环境：没有 token 就拒绝
  }
}

@Controller('orders')
@UseGuards(AuthGuard)
class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get('checkout')
  checkout() {
    return { result: this.orders.checkout(42) };
  }
}

@Module({
  imports: [PaymentsModule],
  controllers: [OrdersController],
  providers: [OrdersService, AuthGuard],
})
class OrdersModule {}

describe('@nestjs/testing', () => {
  describe('override*：在“扫描之后、实例化之前”替换', () => {
    it('overrideProvider().useValue()', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [OrdersModule],
      })
        .overrideProvider(PaymentsClient)
        .useValue({ charge: (n: number) => `fake charge ${n}` })
        .compile();

      expect(moduleRef.get(OrdersService).checkout(10)).toBe('fake charge 10');
    });

    it('override 是“原地替换”：useFactory 的 inject 在【原模块】里解析', async () => {
      // 写测试时的发现：PaymentsClient 声明在 PaymentsModule 里，
      // 替换后的 factory 也在 PaymentsModule 里解析依赖，看不到根模块的 'CURRENCY'
      await expect(
        Test.createTestingModule({
          imports: [OrdersModule],
          providers: [{ provide: 'CURRENCY', useValue: 'EUR' }],
        })
          .overrideProvider(PaymentsClient)
          .useFactory({ factory: () => ({}), inject: ['CURRENCY'] })
          .compile(),
      ).rejects.toThrow(/is available in the PaymentsModule module/);

      // 解决：让 'CURRENCY' 对所有模块可见（@Global），或从 PaymentsModule 能导入的模块里导出
      @Global()
      @Module({
        providers: [{ provide: 'CURRENCY', useValue: 'EUR' }],
        exports: ['CURRENCY'],
      })
      class CurrencyModule {}

      const moduleRef = await Test.createTestingModule({
        imports: [OrdersModule, CurrencyModule],
      })
        .overrideProvider(PaymentsClient)
        .useFactory({
          factory: (currency: string) => ({
            charge: (n: number) => `${n} ${currency}`,
          }),
          inject: ['CURRENCY'],
        })
        .compile();

      expect(moduleRef.get(OrdersService).checkout(5)).toBe('5 EUR');
    });

    it('overrideModule()：整个模块换掉', async () => {
      @Module({
        providers: [
          { provide: PaymentsClient, useValue: { charge: () => 'mod' } },
        ],
        exports: [PaymentsClient],
      })
      class FakePaymentsModule {}

      const moduleRef = await Test.createTestingModule({
        imports: [OrdersModule],
      })
        .overrideModule(PaymentsModule)
        .useModule(FakePaymentsModule)
        .compile();

      expect(moduleRef.get(OrdersService).checkout(1)).toBe('mod');
    });

    it('overrideGuard()：e2e 测试里绕过认证', async () => {
      const build = async (allow: boolean) => {
        let builder = Test.createTestingModule({ imports: [OrdersModule] })
          .overrideProvider(PaymentsClient)
          .useValue({ charge: () => 'ok' });
        if (allow) {
          builder = builder.overrideGuard(AuthGuard).useValue({
            canActivate: () => true,
          });
        }
        const app = (await builder.compile()).createNestApplication({
          logger: false,
        });
        await app.init();
        return app;
      };

      const locked: INestApplication = await build(false);
      await request(locked.getHttpServer()).get('/orders/checkout').expect(403);
      await locked.close();

      const open = await build(true);
      await request(open.getHttpServer())
        .get('/orders/checkout')
        .expect(200, { result: 'ok' });
      await open.close();
    });
  });

  describe('useMocker()：自动 mock 所有缺失的依赖', () => {
    it('没有 mocker：缺依赖就报第 07 课那条错', async () => {
      await expect(
        Test.createTestingModule({ providers: [OrdersService] }).compile(),
      ).rejects.toThrow(/can't resolve dependencies of the OrdersService/);
    });

    it('有 mocker：TestingInjector 在报错前先问 mocker 要一个替身', async () => {
      // 源码：packages/testing/testing-injector.ts → resolveComponentWrapper 的 catch
      const requested: unknown[] = [];
      const moduleRef = await Test.createTestingModule({
        providers: [OrdersService],
      })
        .useMocker(token => {
          requested.push(token);
          if (token === PaymentsClient) {
            return { charge: vi.fn().mockReturnValue('auto-mocked') };
          }
        })
        .compile();

      expect(requested).toEqual([PaymentsClient]);
      expect(moduleRef.get(OrdersService).checkout(1)).toBe('auto-mocked');
    });
  });

  describe('日志：TestingLogger vs CapturingLogger', () => {
    it('默认的 TestingLogger 吞掉 log，所以测试输出很干净（第 05 课的坑）', async () => {
      const spy = vi.spyOn(process.stdout, 'write');
      const moduleRef = await Test.createTestingModule({
        providers: [
          OrdersService,
          { provide: PaymentsClient, useValue: { charge: () => 1 } },
        ],
      }).compile();

      moduleRef.get(OrdersService).checkout(1);
      expect(
        spy.mock.calls.some(([chunk]) => String(chunk).includes('checkout')),
      ).toBe(false);
      spy.mockRestore();
    });

    it('CapturingLogger：把日志记下来并断言', async () => {
      const logger = new CapturingLogger();
      const moduleRef = await Test.createTestingModule({
        providers: [
          OrdersService,
          { provide: PaymentsClient, useValue: { charge: () => 1 } },
        ],
      })
        .setLogger(logger)
        .compile();

      moduleRef.get(OrdersService).checkout(99);

      logger.assertLogged({
        level: 'log',
        context: 'OrdersService',
        message: 'checkout',
        params: { amount: 99 },
      });
      logger.assertNotLogged({ level: 'error' });
    });

    it('CapturingLogger + NEST_DEBUG：注入器日志自带颜色码，要配合 NO_COLOR', async () => {
      // 写测试时的发现：injector.ts 用 clc.cyanBright() 等把颜色码拼进了消息文本，
      // 是否上色只看 NO_COLOR 环境变量（packages/common/utils/cli-colors.util.ts）
      const capture = async () => {
        const logger = new CapturingLogger();
        await Test.createTestingModule({ imports: [OrdersModule] })
          .setLogger(logger)
          .compile();
        return logger;
      };

      process.env.NEST_DEBUG = '1';
      try {
        const colored = await capture();
        const found = colored.find({
          context: 'InjectorLogger',
          message: /^Found/,
        })!;
        expect(found.message).toContain('\x1b['); // 带颜色码
        expect(found.message).not.toContain('Found PaymentsClient in');

        process.env.NO_COLOR = '1';
        const plain = await capture();
        plain.assertLogged({
          context: 'InjectorLogger',
          message: 'Found PaymentsClient in PaymentsModule',
        });
      } finally {
        delete process.env.NEST_DEBUG;
        delete process.env.NO_COLOR;
      }
    });
  });
});
