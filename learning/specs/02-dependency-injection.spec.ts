/**
 * Lesson 02 — Modules, providers and the injector.
 *
 * Source to read alongside this spec:
 *   packages/core/scanner.ts                  DependenciesScanner.scan()
 *   packages/core/injector/container.ts       NestContainer (module registry)
 *   packages/core/injector/module.ts          Module (providers/imports/exports maps)
 *   packages/core/injector/instance-loader.ts createPrototypes → createInstances
 *   packages/core/injector/injector.ts        resolveConstructorParams, lookupComponentInParentModules
 *   packages/core/errors/messages.ts          the "Nest can't resolve dependencies" message
 *
 * `Test.createTestingModule().compile()` runs exactly the same scanner +
 * instance loader as `NestFactory.create()`, minus the HTTP server.
 */
import { Inject, Injectable, Module, Optional } from '@nestjs/common';
import { ModulesContainer } from '@nestjs/core';
import { Test } from '@nestjs/testing';

describe('Lesson 02: dependency injection', () => {
  @Injectable()
  class Logger {
    logs: string[] = [];
    log(msg: string) {
      this.logs.push(msg);
    }
  }

  it('resolves a constructor dependency by its class token', async () => {
    @Injectable()
    class CatsService {
      constructor(readonly logger: Logger) {}
    }

    const moduleRef = await Test.createTestingModule({
      providers: [Logger, CatsService],
    }).compile();

    const cats = moduleRef.get(CatsService);
    expect(cats.logger).toBeInstanceOf(Logger);
    // DEFAULT scope = one singleton per module: same instance everywhere.
    expect(cats.logger).toBe(moduleRef.get(Logger));
  });

  it('supports the 4 provider shapes: class, value, factory, existing', async () => {
    const CONFIG = Symbol('CONFIG');

    const moduleRef = await Test.createTestingModule({
      providers: [
        Logger, // shorthand for { provide: Logger, useClass: Logger }
        { provide: CONFIG, useValue: { db: 'sqlite' } },
        {
          provide: 'DB_URL',
          useFactory: (cfg: { db: string }) => `${cfg.db}://memory`,
          inject: [CONFIG],
        },
        { provide: 'LOGGER_ALIAS', useExisting: Logger },
      ],
    }).compile();

    expect(moduleRef.get(CONFIG)).toEqual({ db: 'sqlite' });
    expect(moduleRef.get('DB_URL')).toBe('sqlite://memory');
    expect(moduleRef.get('LOGGER_ALIAS')).toBe(moduleRef.get(Logger));
  });

  it('only EXPORTED providers are visible to importing modules', async () => {
    @Injectable()
    class SecretService {}

    @Module({ providers: [Logger, SecretService], exports: [Logger] })
    class SharedModule {}

    @Injectable()
    class UsesLogger {
      constructor(readonly logger: Logger) {}
    }

    @Injectable()
    class UsesSecret {
      constructor(readonly secret: SecretService) {}
    }

    // Exported → works
    await expect(
      Test.createTestingModule({
        imports: [SharedModule],
        providers: [UsesLogger],
      }).compile(),
    ).resolves.toBeDefined();

    // Not exported → the famous error message (packages/core/errors/messages.ts)
    await expect(
      Test.createTestingModule({
        imports: [SharedModule],
        providers: [UsesSecret],
      }).compile(),
    ).rejects.toThrow(/Nest can't resolve dependencies of the UsesSecret/);
  });

  it('@Optional() turns a missing dependency into undefined', async () => {
    @Injectable()
    class WithOptional {
      constructor(@Optional() @Inject('MISSING') readonly missing?: string) {}
    }

    const moduleRef = await Test.createTestingModule({
      providers: [WithOptional],
    }).compile();

    expect(moduleRef.get(WithOptional).missing).toBeUndefined();
  });

  it('the container is a Map of Module objects you can inspect', async () => {
    @Module({ providers: [Logger], exports: [Logger] })
    class LoggerModule {}

    @Module({ imports: [LoggerModule] })
    class AppModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    const modules = moduleRef.get(ModulesContainer);
    const names = [...modules.values()].map(m => m.metatype.name);

    // InternalCoreModule is always registered first by scanner.registerCoreModule()
    expect(names).toEqual(
      expect.arrayContaining([
        'InternalCoreModule',
        'AppModule',
        'LoggerModule',
      ]),
    );

    const loggerModule = [...modules.values()].find(
      m => m.metatype === LoggerModule,
    )!;
    // Each Module holds Maps of InstanceWrapper keyed by token.
    expect(loggerModule.providers.has(Logger)).toBe(true);
    expect(loggerModule.exports.has(Logger)).toBe(true);
    // `distance` = depth from the root module (see scanner.calculateModulesDistance)
    const appModule = [...modules.values()].find(
      m => m.metatype === AppModule,
    )!;
    expect(loggerModule.distance).toBeGreaterThan(appModule.distance);
  });
});
