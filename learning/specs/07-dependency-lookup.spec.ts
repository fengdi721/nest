/**
 * 第 07 课 —— 注入器如何“找”依赖，以及报错信息是怎么拼出来的
 *
 * 配套阅读的源码：
 *   packages/core/injector/injector.ts
 *     resolveComponentWrapper()          先在“当前模块”找
 *     lookupComponentInParentModules()   找不到 → 去 imports 里找，再找不到就抛错
 *     lookupComponentInImports()         递归遍历 imports（只跟随被 re-export 的模块）
 *     printLookingForProviderLog() 等    NEST_DEBUG 打开时的调试日志
 *   packages/core/injector/helpers/is-debug-mode.util.ts   NEST_DEBUG 开关
 *   packages/core/errors/messages.ts → UNKNOWN_DEPENDENCIES_MESSAGE   报错文案
 *   packages/core/test/errors/test/messages.spec.ts                   上游对文案的测试
 */
import { Inject, Injectable, Logger, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';

// 去掉终端颜色码，方便断言日志文本
// eslint-disable-next-line no-control-regex
const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

@Injectable()
class DbService {}

@Module({ providers: [DbService], exports: [DbService] })
class DbModule {}

describe('第 07 课：依赖查找与报错信息', () => {
  describe('查找算法：先本模块，再 imports（不会自动传递）', () => {
    @Injectable()
    class UsersService {
      constructor(readonly db: DbService) {}
    }

    it('imports 不具有传递性：A → B → Db，A 看不到 DbService', async () => {
      // B 导入了 DbModule，但没有把它再导出
      @Module({ imports: [DbModule] })
      class BModule {}

      await expect(
        Test.createTestingModule({
          imports: [BModule],
          providers: [UsersService],
        }).compile(),
      ).rejects.toThrow(/Nest can't resolve dependencies of the UsersService/);
    });

    it('re-export 模块后就能看到：B 把 DbModule 放进 exports', async () => {
      // lookupComponentInImports 在递归时（isTraversing = true）
      // 只会继续进入“被当前模块 exports 的子模块”
      @Module({ imports: [DbModule], exports: [DbModule] })
      class BModule {}

      const moduleRef = await Test.createTestingModule({
        imports: [BModule],
        providers: [UsersService],
      }).compile();

      expect(moduleRef.get(UsersService).db).toBeInstanceOf(DbService);
    });
  });

  describe('报错信息的结构（UNKNOWN_DEPENDENCIES_MESSAGE）', () => {
    it('缺失的参数用 ? 标出，并给出下标和模块名', async () => {
      @Injectable()
      class Logger2 {}

      @Injectable()
      class OrdersService {
        constructor(
          readonly logger: Logger2,
          readonly db: DbService, // ← 下标 1，没有提供
        ) {}
      }

      const error = await Test.createTestingModule({
        providers: [Logger2, OrdersService],
      })
        .compile()
        .catch((e: Error) => e);

      const message = (error as Error).message;
      // 依赖列表：已知的写类名，缺失的那个写成 ?
      expect(message).toContain('OrdersService (Logger2, ?)');
      expect(message).toContain('argument DbService at index [1]');
      // Test.createTestingModule 的根模块叫 RootTestModule
      expect(message).toContain('is available in the RootTestModule module');
    });

    it('属性注入缺失时走另一个分支：index 为空，报的是属性名', async () => {
      // messages.ts 里 `if (isNil(index))` 这个分支。
      // 发现：上游 packages/*/test 和 integration 里都没有断言过这段文案（见第 05 篇文档）。
      @Injectable()
      class ReportsService {
        @Inject('MISSING_TOKEN')
        readonly cache: unknown;
      }

      const error = await Test.createTestingModule({
        providers: [ReportsService],
      })
        .compile()
        .catch((e: Error) => e);

      expect((error as Error).message).toContain(
        `Nest can't resolve dependencies of the ReportsService. ` +
          `Please make sure that the "cache" property is available in the current context.`,
      );
    });

    it('参数类型是 interface / `import type` 时，会给出专门的提示', async () => {
      // interface 在运行时不存在，TypeScript 只能把 design:paramtypes 写成 Object。
      // 用 `import type { X }` 导入的类也是同样的结果。
      interface Repo {
        find(): unknown;
      }

      @Injectable()
      class ProductsService {
        constructor(readonly repo: Repo) {}
      }

      const error = await Test.createTestingModule({
        providers: [ProductsService],
      })
        .compile()
        .catch((e: Error) => e);

      const message = (error as Error).message;
      expect(message).toContain('appears to be undefined at runtime');
      expect(message).toContain("'import type'");
    });
  });

  describe('内置调试开关：NEST_DEBUG', () => {
    afterEach(() => {
      delete process.env.NEST_DEBUG;
      vi.restoreAllMocks();
    });

    it('设置 NEST_DEBUG 后，注入器会打印每一步查找过程', async () => {
      process.env.NEST_DEBUG = '1';
      const logs: string[] = [];
      vi.spyOn(Logger.prototype, 'log').mockImplementation((msg: any) => {
        logs.push(stripAnsi(String(msg)));
      });

      @Injectable()
      class UsersService {
        constructor(readonly db: DbService) {}
      }

      await Test.createTestingModule({
        imports: [DbModule],
        providers: [UsersService],
      }).compile();

      // 先在本模块(RootTestModule)找，再到导入的 DbModule 里找到
      expect(logs).toEqual(
        expect.arrayContaining([
          'Resolving dependency DbService in the UsersService provider ',
          'Looking for DbService in RootTestModule',
          'Looking for DbService in DbModule',
          'Found DbService in DbModule',
        ]),
      );
    });
  });
});
