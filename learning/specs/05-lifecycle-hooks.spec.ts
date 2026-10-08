/**
 * Lesson 05 — Application lifecycle hooks.
 *
 * Source to read alongside this spec:
 *   packages/core/hooks/on-module-init.hook.ts
 *   packages/core/hooks/on-app-bootstrap.hook.ts
 *   packages/core/hooks/on-module-destroy.hook.ts
 *   packages/core/nest-application-context.ts   (init() and close() call the hooks)
 *
 * Key idea: init() calls onModuleInit for ALL modules, then
 * onApplicationBootstrap for ALL modules. Modules are processed by
 * `distance` (deepest dependency first), so imported modules are
 * initialised before the modules importing them.
 */
import {
  Injectable,
  Module,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';

const events: string[] = [];

function hooked(name: string) {
  @Injectable()
  class Hooked
    implements
      OnModuleInit,
      OnApplicationBootstrap,
      OnModuleDestroy,
      OnApplicationShutdown
  {
    onModuleInit() {
      events.push(`${name}.onModuleInit`);
    }
    onApplicationBootstrap() {
      events.push(`${name}.onApplicationBootstrap`);
    }
    onModuleDestroy() {
      events.push(`${name}.onModuleDestroy`);
    }
    onApplicationShutdown(signal?: string) {
      events.push(`${name}.onApplicationShutdown(${signal ?? ''})`);
    }
  }
  return Hooked;
}

const DbService = hooked('Db');
const AppService = hooked('App');

@Module({ providers: [DbService], exports: [DbService] })
class DbModule {}

@Module({ imports: [DbModule], providers: [AppService] })
class AppModule {}

describe('Lesson 05: lifecycle hooks', () => {
  it('init(): dependencies first, and every init before any bootstrap', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const app = moduleRef.createNestApplication({ logger: false });

    await app.init();
    expect(events).toEqual([
      'Db.onModuleInit',
      'App.onModuleInit',
      'Db.onApplicationBootstrap',
      'App.onApplicationBootstrap',
    ]);

    events.length = 0;
    await app.close();
    expect(events).toEqual([
      'App.onModuleDestroy',
      'Db.onModuleDestroy',
      'App.onApplicationShutdown()',
      'Db.onApplicationShutdown()',
    ]);
  });
});
