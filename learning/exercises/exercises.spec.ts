/**
 * EXERCISES — your turn.
 *
 * How to work on one:
 *   1. Replace `it.skip` with `it`.
 *   2. Run only this file in watch mode:
 *        npx vitest --config learning/vitest.config.mts learning/exercises
 *   3. Make it pass WITHOUT looking at the hints in learning/PRACTICES.md first.
 *   4. Commit with a conventional message, e.g.
 *        test(learning): solve exercise 2 (forwardRef)
 *
 * Each exercise names the source file you should open in packages/.
 */
import {
  Controller,
  createParamDecorator,
  ExecutionContext,
  forwardRef,
  Get,
  Global,
  Inject,
  Injectable,
  Module,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

describe('Exercises', () => {
  /**
   * E1 — custom param decorator.
   * Read: packages/common/decorators/http/create-route-param-metadata.decorator.ts
   *       packages/core/router/route-params-factory.ts
   * Goal: `@UserAgent()` injects the request's `user-agent` header.
   */
  it.skip('E1: createParamDecorator reads from the request', async () => {
    const UserAgent = createParamDecorator(
      (_data: unknown, _ctx: ExecutionContext) => {
        // TODO: return the user-agent header from the HTTP request
        return undefined;
      },
    );

    @Controller()
    class UaController {
      @Get('ua')
      ua(@UserAgent() ua: string) {
        return { ua };
      }
    }

    const app = (
      await Test.createTestingModule({ controllers: [UaController] }).compile()
    ).createNestApplication({ logger: false });
    await app.init();

    const res = await request(app.getHttpServer())
      .get('/ua')
      .set('user-agent', 'learning-nest');
    expect(res.body).toEqual({ ua: 'learning-nest' });
    await app.close();
  });

  /**
   * E2 — circular dependencies.
   * Read: packages/common/utils/forward-ref.util.ts
   *       packages/core/injector/injector.ts (search "forwardRef")
   *       packages/core/errors/exceptions/undefined-dependency.exception.ts
   * Goal: first SEE the failure, then fix it with forwardRef on BOTH sides.
   */
  it.skip('E2: A <-> B circular dependency resolved with forwardRef', async () => {
    @Injectable()
    class A {
      // TODO: use @Inject(forwardRef(() => B))
      constructor(readonly b: any) {}
    }
    @Injectable()
    class B {
      // TODO: same here for A
      constructor(readonly a: any) {}
    }

    const moduleRef = await Test.createTestingModule({
      providers: [A, B],
    }).compile();
    expect(moduleRef.get(A).b).toBe(moduleRef.get(B));
    expect(moduleRef.get(B).a).toBe(moduleRef.get(A));
    void forwardRef;
    void Inject;
  });

  /**
   * E3 — @Global modules.
   * Read: packages/common/decorators/modules/global.decorator.ts
   *       packages/core/injector/container.ts (bindGlobalScope / bindGlobalsToImports)
   * Goal: make ConfigService injectable in FeatureModule without importing ConfigModule there.
   */
  it.skip('E3: a @Global module is visible without importing it', async () => {
    @Injectable()
    class ConfigService {
      get = () => 'value';
    }

    // TODO: decorate with @Global() and export ConfigService
    @Module({ providers: [ConfigService] })
    class ConfigModule {}

    @Injectable()
    class FeatureService {
      constructor(readonly config: ConfigService) {}
    }
    @Module({ providers: [FeatureService] })
    class FeatureModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, FeatureModule],
    }).compile();
    expect(moduleRef.get(FeatureService).config.get()).toBe('value');
    void Global;
  });

  /**
   * E4 — dynamic modules (the `forRoot()` pattern used by TypeOrmModule, ConfigModule…).
   * Read: packages/common/interfaces/modules/dynamic-module.interface.ts
   *       packages/core/scanner.ts (insertModule / isDynamicModule)
   *       packages/common/module-utils/configurable-module.builder.ts (bonus)
   * Goal: implement DbModule.forRoot(url) returning a DynamicModule that provides 'DB_URL'.
   */
  it.skip('E4: DbModule.forRoot() provides its options', async () => {
    @Module({})
    class DbModule {
      static forRoot(_url: string): any {
        // TODO: return { module: DbModule, providers: [...], exports: [...] }
        return { module: DbModule };
      }
    }

    const moduleRef = await Test.createTestingModule({
      imports: [DbModule.forRoot('postgres://localhost')],
    }).compile();
    expect(moduleRef.get('DB_URL')).toBe('postgres://localhost');
  });
});
