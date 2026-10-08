/**
 * Integration test: the pipe inside a real controller + HTTP request.
 * Unit tests prove the logic; this proves the WIRING (that Nest calls the pipe
 * for `@Query('sort')` and turns BadRequestException into a 400 JSON body).
 */
import { Controller, Get, INestApplication, Query } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ParseSortPipe, SortField } from './parse-sort.pipe';

@Controller('cats')
class CatsController {
  @Get()
  findAll(
    @Query('sort', new ParseSortPipe({ allowedFields: ['name', 'age'] }))
    sort: SortField[],
  ) {
    return { sort };
  }
}

describe('ParseSortPipe (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CatsController],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(() => app.close());

  it('GET /cats?sort=age:desc,name → parsed sort', async () => {
    const res = await request(app.getHttpServer())
      .get('/cats')
      .query({ sort: 'age:desc,name' })
      .expect(200);
    expect(res.body).toEqual({
      sort: [
        { field: 'age', order: 'desc' },
        { field: 'name', order: 'asc' },
      ],
    });
  });

  it('GET /cats without sort → empty list', async () => {
    const res = await request(app.getHttpServer()).get('/cats').expect(200);
    expect(res.body).toEqual({ sort: [] });
  });

  it('GET /cats?sort=password → 400 with Nest error body', async () => {
    const res = await request(app.getHttpServer())
      .get('/cats')
      .query({ sort: 'password' })
      .expect(400);
    expect(res.body).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Sorting by "password" is not allowed',
    });
  });
});
