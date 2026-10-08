/**
 * Package 教程配套测试 —— @nestjs/platform-fastify
 * 文档：learning/packages/platform-fastify.md
 *
 * 1) Fastify 独有的能力：inject()（不走网络）、JSON Schema 校验、路由 config。
 * 2) 和 platform-express 的一致性：同样的控制器，两个平台的行为是否一样？
 *    （第 06 课已经分析过这个 package 的 listen() bug：#18052）
 */
import {
  Controller,
  Get,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  FastifyAdapter,
  FileInterceptor,
  NestFastifyApplication,
  RouteConfig,
  RouteSchema,
  UploadedMultipartFile,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { FastifyRequest } from 'fastify';
import request from 'supertest';

@Controller()
class AppController {
  @Get('json')
  json() {
    return { ok: true };
  }

  @Post('users')
  @RouteSchema({
    body: {
      type: 'object',
      required: ['name'],
      properties: { name: { type: 'string' } },
    },
  })
  createUser(@Req() req: FastifyRequest) {
    return req.body;
  }

  @Get('limited')
  @RouteConfig({ rateLimit: 5 })
  limited(@Req() req: FastifyRequest) {
    // @RouteConfig 写进 fastify 的路由 config，处理请求时可以读到
    return req.routeOptions.config;
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 } }))
  upload(@UploadedFile() file?: UploadedMultipartFile) {
    return file
      ? {
          name: file.originalname,
          size: file.size,
          text: file.buffer?.toString(),
        }
      : { file: null };
  }
}

describe('@nestjs/platform-fastify', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AppController],
    }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
      { logger: false },
    );
    await app.init();
    // fastify 的插件是异步注册的，用 inject / supertest 之前要等它 ready
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(() => app.close());

  describe('Fastify 独有的能力', () => {
    it('getType() 是 fastify；路由顺序不敏感（按 radix tree 匹配）', () => {
      const adapter = app.getHttpAdapter();
      expect(adapter.getType()).toBe('fastify');
      expect(adapter.isRouteOrderSensitive()).toBe(false);
    });

    it('app.inject()：不开端口、不走网络就能发请求', async () => {
      const res = await app.inject({ method: 'GET', url: '/json' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });
    });

    it('@RouteSchema：合法请求体正常通过', async () => {
      const ok = await app.inject({
        method: 'POST',
        url: '/users',
        payload: { name: 'Tom' },
      });
      expect(ok.json()).toEqual({ name: 'Tom' });
    });

    // ⚠️ 写这个测试时发现的 bug（尚未报告）：见 learning/packages/platform-fastify.md 第 5 节
    // 纯 fastify 对同一个 schema 返回 400；经过 Nest 变成了 500。
    // 原因：fastify 的校验错误是普通 Error（statusCode 400，code FST_ERR_VALIDATION），
    // 而 Nest 的 isHttpError / isHttpFastifyError 都要求错误名为 'FastifyError'。
    it('BUG：@RouteSchema 校验失败返回 500（当前行为）', async () => {
      const bad = await app.inject({
        method: 'POST',
        url: '/users',
        payload: { age: 3 },
      });
      expect(bad.statusCode).toBe(500);
      expect(bad.json()).toEqual({
        statusCode: 500,
        message: 'Internal server error',
      });
    });

    it.fails(
      'EXPECTED：@RouteSchema 校验失败应返回 400（和纯 fastify 一致）',
      async () => {
        const bad = await app.inject({
          method: 'POST',
          url: '/users',
          payload: { age: 3 },
        });
        expect(bad.statusCode).toBe(400);
        expect(bad.json()).toMatchObject({
          statusCode: 400,
          message: "body must have required property 'name'",
        });
      },
    );

    it('@RouteConfig：处理函数里能读到路由 config', async () => {
      const res = await app.inject('/limited');
      expect(res.json()).toMatchObject({ rateLimit: 5 });
    });
  });

  describe('和 platform-express 的一致性（对照 platform-express.spec.ts）', () => {
    it('404 格式相同', async () => {
      const res = await app.inject('/nope');
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({
        message: 'Cannot GET /nope',
        error: 'Not Found',
        statusCode: 404,
      });
    });

    it('上传：同名的 FileInterceptor，同样的结果', async () => {
      const res = await request(app.getHttpServer())
        .post('/upload')
        .attach('file', Buffer.from('hi'), 'a.txt')
        .expect(201);
      expect(res.body).toEqual({ name: 'a.txt', size: 2, text: 'hi' });
    });

    it('上传超过大小：同样是 413 "File too large"', async () => {
      const res = await request(app.getHttpServer())
        .post('/upload')
        .attach('file', Buffer.from('more than ten bytes'), 'big.txt');
      expect(res.status).toBe(413);
      expect(res.body.message).toBe('File too large');
    });

    it('字段名不对：同样是 400 "Unexpected file field - wrong"', async () => {
      const res = await request(app.getHttpServer())
        .post('/upload')
        .attach('wrong', Buffer.from('x'), 'x.txt');
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Unexpected file field - wrong');
    });
  });
});
