/**
 * Kata 2 · e2e / 集成测试（你来写）
 *
 * 这里不 mock CatsService，而是用 InMemoryCatsRepository（fake）让整条链路真实运行：
 *   HTTP → 路由 → 管道 → Controller → Service → Repository(内存)
 *
 * 先写失败的 e2e 测试 → 再去 cats.controller.ts 加路由 → 变绿。
 * 第一个测试已写好作为模板。
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CatsController } from './cats.controller';
import { CatsRepository, InMemoryCatsRepository } from './cats.repository';
import { CatsService } from './cats.service';

describe('Cats (e2e)', () => {
  let app: INestApplication;
  let repository: InMemoryCatsRepository;

  // 每个测试都用全新的 app + 空仓库：测试之间互不影响（隔离性）
  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CatsController],
      providers: [
        CatsService,
        { provide: CatsRepository, useClass: InMemoryCatsRepository },
      ],
    }).compile();

    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    repository = moduleRef.get(CatsRepository);
  });

  afterEach(() => app.close());

  describe('GET /cats', () => {
    it('should return cats sorted by the sort query', async () => {
      // Arrange：直接往 fake 仓库里放数据
      await repository.create({ name: 'Tom', age: 3 });
      await repository.create({ name: 'Garfield', age: 7 });

      // Act + Assert
      const res = await request(app.getHttpServer())
        .get('/cats')
        .query({ sort: 'age:desc' })
        .expect(200);

      expect(res.body.map((cat: { name: string }) => cat.name)).toEqual([
        'Garfield',
        'Tom',
      ]);
    });

    it.todo('should return 400 when sorting by a field that is not allowed');
  });

  describe('GET /cats/:id', () => {
    it.todo('should return 200 and the cat');
    it.todo('should return 404 when the cat does not exist');
    it.todo('should return 400 when id is not a number');
  });

  describe('POST /cats', () => {
    it.todo('should return 201 and the created cat with an id');
    it.todo('should return 409 when the name already exists');
  });

  describe('PATCH /cats/:id', () => {
    it.todo('should return 200 and the updated cat');
  });

  describe('DELETE /cats/:id', () => {
    it.todo('should return 204, then GET returns 404');
  });
});
