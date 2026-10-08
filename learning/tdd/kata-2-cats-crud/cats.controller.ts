import { Controller, Get, Query } from '@nestjs/common';
import {
  ParseSortPipe,
  SortField,
} from '../kata-1-parse-sort-pipe/parse-sort.pipe';
import { CatsService } from './cats.service';

/**
 * 需求（先在 cats.e2e.spec.ts 写失败的测试，再来这里加路由）：
 *
 * GET    /cats?sort=name:asc   200，sort 用第 1 个 kata 的 ParseSortPipe（只允许 name、age）
 * GET    /cats/:id             200；id 不是数字 → 400（提示：ParseIntPipe）；不存在 → 404
 * POST   /cats                 201，返回新建的猫
 * PATCH  /cats/:id             200
 * DELETE /cats/:id             204（提示：@HttpCode）
 */
@Controller('cats')
export class CatsController {
  constructor(private readonly cats: CatsService) {}

  @Get()
  findAll(
    @Query('sort', new ParseSortPipe({ allowedFields: ['name', 'age'] }))
    sort: SortField[],
  ) {
    return this.cats.findAll(sort);
  }
}
