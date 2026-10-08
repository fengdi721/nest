/**
 * Package 教程配套测试 —— @nestjs/platform-express
 * 文档：learning/packages/platform-express.md
 *
 * ExpressAdapter 实现了 core 定义的 HttpServer 接口（adapters/express-adapter.ts），
 * multer/ 目录把 multer（文件上传）包装成 Nest 的拦截器。
 */
import {
  Controller,
  Get,
  INestApplication,
  Post,
  RawBodyRequest,
  Req,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import {
  ExpressAdapter,
  FileInterceptor,
  FilesInterceptor,
  NestExpressApplication,
} from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import request from 'supertest';

@Controller()
class AppController {
  @Get('hello')
  hello() {
    return 'plain string';
  }

  @Get('json')
  json() {
    return { ok: true };
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 } }))
  upload(@UploadedFile() file?: Express.Multer.File) {
    // 默认是内存存储：文件内容在 file.buffer 里
    return file
      ? {
          name: file.originalname,
          size: file.size,
          text: file.buffer.toString(),
        }
      : { file: null };
  }

  @Post('uploads')
  @UseInterceptors(FilesInterceptor('files', 2))
  uploads(@UploadedFiles() files: Express.Multer.File[]) {
    return files.map(f => f.originalname);
  }

  @Post('webhook')
  webhook(@Req() req: RawBodyRequest<Request>) {
    // rawBody 常用于校验 webhook 签名（Stripe、GitHub…）
    return { raw: req.rawBody?.toString(), parsed: req.body };
  }
}

describe('@nestjs/platform-express', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AppController],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      logger: false,
      rawBody: true,
    });
    // 可以直接使用原生 express 中间件 / 设置
    app.set('x-powered-by', false);
    await app.init();
  });

  afterAll(() => app.close());

  describe('适配器', () => {
    it('getHttpAdapter() 是 ExpressAdapter，getInstance() 是原生 express app', () => {
      const adapter = app.getHttpAdapter();
      expect(adapter).toBeInstanceOf(ExpressAdapter);
      expect(adapter.getType()).toBe('express');
      expect(typeof adapter.getInstance().use).toBe('function');
    });

    it('reply()：字符串 → text/html，对象 → application/json', async () => {
      const text = await request(app.getHttpServer()).get('/hello');
      expect(text.headers['content-type']).toMatch(/text\/html/);
      expect(text.text).toBe('plain string');

      const json = await request(app.getHttpServer()).get('/json');
      expect(json.headers['content-type']).toMatch(/application\/json/);
      expect(json.body).toEqual({ ok: true });
    });

    it('原生设置生效：x-powered-by 被关掉了', async () => {
      const res = await request(app.getHttpServer()).get('/json');
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('404 由 setNotFoundHandler 统一成 Nest 的错误格式', async () => {
      await request(app.getHttpServer()).get('/nope').expect(404, {
        message: 'Cannot GET /nope',
        error: 'Not Found',
        statusCode: 404,
      });
    });

    it('rawBody: true → 保留原始请求体（同时 body 照常解析）', async () => {
      const res = await request(app.getHttpServer())
        .post('/webhook')
        .set('content-type', 'application/json')
        .send('{"a": 1}');
      expect(res.body).toEqual({ raw: '{"a": 1}', parsed: { a: 1 } });
    });
  });

  describe('multer：文件上传', () => {
    it('FileInterceptor：内存存储，文件内容在 buffer 里', async () => {
      const res = await request(app.getHttpServer())
        .post('/upload')
        .attach('file', Buffer.from('hi'), 'a.txt')
        .expect(201);
      expect(res.body).toEqual({ name: 'a.txt', size: 2, text: 'hi' });
    });

    it('没有上传文件 → file 是 undefined（不报错）', async () => {
      await request(app.getHttpServer())
        .post('/upload')
        .field('other', 'x')
        .expect(201, { file: null });
    });

    it('超过 fileSize → multer 的 LIMIT_FILE_SIZE 被映射成 413', async () => {
      const res = await request(app.getHttpServer())
        .post('/upload')
        .attach('file', Buffer.from('more than ten bytes'), 'big.txt');
      expect(res.status).toBe(413);
      expect(res.body.message).toBe('File too large');
    });

    it('字段名不对 → LIMIT_UNEXPECTED_FILE 映射成 400，并带上字段名', async () => {
      const res = await request(app.getHttpServer())
        .post('/upload')
        .attach('wrong', Buffer.from('x'), 'x.txt');
      expect(res.status).toBe(400);
      // 我一开始写的是 'Unexpected field'，失败了：新版 multer 把文案改成了
      // 'Unexpected file field'。这正是 multer.utils.ts 改为按 error.code 映射的原因。
      expect(res.body.message).toBe('Unexpected file field - wrong');
    });

    it('FilesInterceptor 的 maxCount：超过 2 个 → 400', async () => {
      const ok = await request(app.getHttpServer())
        .post('/uploads')
        .attach('files', Buffer.from('1'), '1.txt')
        .attach('files', Buffer.from('2'), '2.txt')
        .expect(201);
      expect(ok.body).toEqual(['1.txt', '2.txt']);

      const tooMany = await request(app.getHttpServer())
        .post('/uploads')
        .attach('files', Buffer.from('1'), '1.txt')
        .attach('files', Buffer.from('2'), '2.txt')
        .attach('files', Buffer.from('3'), '3.txt');
      expect(tooMany.status).toBe(400);
    });
  });
});
