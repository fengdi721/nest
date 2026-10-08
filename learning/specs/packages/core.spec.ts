/**
 * Package 教程配套测试 —— @nestjs/core
 * 文档：learning/packages/core.md
 *
 * core 的注入器、作用域、生命周期、请求流程已经在第 02–05、07 课覆盖。
 * 这里补上：Reflector、DiscoveryService、全局前缀 / 版本控制、中间件排除、SSE、安全头。
 */
import {
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  INestApplication,
  Injectable,
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
  Sse,
  UseGuards,
  Version,
  VersioningType,
} from '@nestjs/common';
import { DiscoveryModule, DiscoveryService, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { interval, map, take } from 'rxjs';
import request from 'supertest';

// ---------- Reflector：类型安全的自定义元数据 ----------
const Roles = Reflector.createDecorator<string[]>();

@Injectable()
class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(ctx: ExecutionContext) {
    // 方法上的值优先，没有再看类上的
    const roles = this.reflector.getAllAndOverride(Roles, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    const role = ctx.switchToHttp().getRequest().headers['x-role'];
    return !roles || roles.includes(role);
  }
}

// ---------- DiscoveryService：在运行时找出所有带某个标记的 provider ----------
const JobHandler = DiscoveryService.createDecorator<{ cron: string }>();

@Injectable()
@JobHandler({ cron: '0 * * * *' })
class CleanupJob {}

@Injectable()
@JobHandler({ cron: '*/5 * * * *' })
class ReportJob {}

@Injectable()
class NotAJob {}

const middlewareHits: string[] = [];

@Controller('cats')
@Roles(['admin', 'user'])
@UseGuards(RolesGuard)
class CatsController {
  @Get()
  list() {
    return 'v1 list';
  }

  @Get()
  @Version('2')
  listV2() {
    return 'v2 list';
  }

  @Get('admin')
  @Roles(['admin'])
  adminOnly() {
    return 'admin area';
  }

  @Get('health')
  health() {
    return 'ok';
  }

  @Sse('ticks')
  ticks() {
    return interval(1).pipe(
      take(3),
      map(i => ({ data: { tick: i } })),
    );
  }
}

@Module({
  imports: [DiscoveryModule],
  controllers: [CatsController],
  providers: [RolesGuard, CleanupJob, ReportJob, NotAJob],
})
class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply((req: any, _res: any, next: () => void) => {
        middlewareHits.push(req.originalUrl);
        next();
      })
      // 启用 URI 版本控制后，exclude 必须带 version，否则静默失效（见下方测试和 core.md 第 5 节）
      .exclude({ path: 'cats/health', method: RequestMethod.GET, version: '1' })
      .forRoutes(CatsController);
  }
}

describe('@nestjs/core', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('api', { exclude: ['cats/health'] });
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.init();
  });

  afterAll(() => app.close());

  describe('Reflector', () => {
    it('getAllAndOverride：方法上的 @Roles 覆盖类上的', async () => {
      const server = app.getHttpServer();
      // 类上：admin, user
      await request(server)
        .get('/api/v1/cats')
        .set('x-role', 'user')
        .expect(200);
      // 方法上：只有 admin
      await request(server)
        .get('/api/v1/cats/admin')
        .set('x-role', 'user')
        .expect(403);
      await request(server)
        .get('/api/v1/cats/admin')
        .set('x-role', 'admin')
        .expect(200, 'admin area');
    });

    it('getAllAndMerge：把方法和类上的值合并', () => {
      const reflector = app.get(Reflector);
      const merged = reflector.getAllAndMerge(Roles, [
        CatsController.prototype.adminOnly,
        CatsController,
      ]);
      expect(merged).toEqual(['admin', 'admin', 'user']);
    });
  });

  describe('DiscoveryService', () => {
    it('找出所有带 @JobHandler 的 provider 以及它们的元数据', () => {
      const discovery = app.get(DiscoveryService);
      const jobs = discovery
        .getProviders({ metadataKey: JobHandler.KEY })
        .map(wrapper => ({
          name: wrapper.name,
          cron: discovery.getMetadataByDecorator(JobHandler, wrapper)?.cron,
        }));

      expect(jobs).toEqual(
        expect.arrayContaining([
          { name: 'CleanupJob', cron: '0 * * * *' },
          { name: 'ReportJob', cron: '*/5 * * * *' },
        ]),
      );
      expect(jobs.map(j => j.name)).not.toContain('NotAJob');
    });
  });

  describe('路由：全局前缀 + URI 版本控制 + 排除', () => {
    it('/api/v1/cats 和 /api/v2/cats 由不同方法处理', async () => {
      const server = app.getHttpServer();
      await request(server)
        .get('/api/v1/cats')
        .set('x-role', 'user')
        .expect(200, 'v1 list');
      await request(server)
        .get('/api/v2/cats')
        .set('x-role', 'user')
        .expect(200, 'v2 list');
    });

    it('没有前缀不匹配：/v1/cats → 404', async () => {
      await request(app.getHttpServer()).get('/v1/cats').expect(404);
    });

    it('exclude 的路由不带全局前缀（但版本号仍然存在）', async () => {
      await request(app.getHttpServer())
        .get('/v1/cats/health')
        .set('x-role', 'user')
        .expect(200, 'ok');
    });
  });

  describe('中间件', () => {
    it('forRoutes(Controller) 覆盖整个 controller，exclude 的路由跳过', async () => {
      middlewareHits.length = 0;
      const server = app.getHttpServer();
      await request(server).get('/api/v1/cats').set('x-role', 'user');
      await request(server).get('/v1/cats/health').set('x-role', 'user');
      expect(middlewareHits).toEqual(['/api/v1/cats']);
    });
  });

  describe('发现：URI 版本控制下，不带 version 的 exclude 静默失效', () => {
    // 根因：packages/core/middleware/route-info-path-extractor.ts
    //   extractVersionPathFrom(undefined) 返回 []，排除路径只生成 '/cats/health'，
    //   而真实路由是 '/v1/cats/health'（来自 defaultVersion）。
    // docs.nestjs.com 的 Versioning 章节只讲了 forRoutes 的 version，没提 exclude。
    it('当前行为：中间件仍然执行', async () => {
      const hits: string[] = [];

      @Controller('dogs')
      class DogsController {
        @Get('health')
        health() {
          return 'ok';
        }
      }

      @Module({ controllers: [DogsController] })
      class DogsModule implements NestModule {
        configure(consumer: MiddlewareConsumer) {
          consumer
            .apply((req: any, _res: any, next: () => void) => {
              hits.push(req.originalUrl);
              next();
            })
            .exclude({ path: 'dogs/health', method: RequestMethod.GET })
            .forRoutes(DogsController);
        }
      }

      const moduleRef = await Test.createTestingModule({
        imports: [DogsModule],
      }).compile();
      const dogs = moduleRef.createNestApplication({ logger: false });
      dogs.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
      await dogs.init();

      await request(dogs.getHttpServer()).get('/v1/dogs/health').expect(200);
      expect(hits).toEqual(['/v1/dogs/health']); // 本以为会被排除
      await dogs.close();
    });
  });

  describe('SSE（core 最近修复最多的区域之一）', () => {
    it('@Sse 返回 Observable → text/event-stream，每个值一条 data', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/cats/ticks')
        .set('x-role', 'user')
        .buffer(true)
        .parse((response, done) => {
          let body = '';
          response.on('data', chunk => (body += chunk));
          response.on('end', () => done(null, body));
        });

      expect(res.headers['content-type']).toMatch(/text\/event-stream/);
      const events = String(res.body)
        .split('\n')
        .filter(line => line.startsWith('data:'))
        .map(line => JSON.parse(line.slice(5)));
      expect(events).toEqual([{ tick: 0 }, { tick: 1 }, { tick: 2 }]);
    });
  });
});

describe('@nestjs/core：内置安全头（新功能 #17836）', () => {
  it('useSecurityHeaders() 默认加上 CSP、HSTS 等响应头', async () => {
    @Controller()
    class PingController {
      @Get('ping')
      ping() {
        return 'pong';
      }
    }

    const moduleRef = await Test.createTestingModule({
      controllers: [PingController],
    }).compile();
    const app = moduleRef.createNestApplication({ logger: false });
    app.useSecurityHeaders();
    await app.init();

    const res = await request(app.getHttpServer()).get('/ping').expect(200);
    expect(res.headers['content-security-policy']).toContain(
      "default-src 'self'",
    );
    expect(res.headers['strict-transport-security']).toContain('max-age=');
    expect(res.headers['x-content-type-options']).toBe('nosniff');

    await app.close();
  });
});
