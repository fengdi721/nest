import { Injectable } from '@nestjs/common';
import { SortField } from '../kata-1-parse-sort-pipe/parse-sort.pipe';
import {
  Cat,
  CatsRepository,
  CreateCatDto,
  UpdateCatDto,
} from './cats.repository';

/**
 * 需求（按 TDD 的节奏：先在 cats.service.spec.ts 写一个失败的测试，再来这里实现）：
 *
 * findAll(sort)      把 sort 原样传给 repository.findAll
 * findOne(id)        找到就返回；找不到 → NotFoundException('Cat #<id> not found')
 * create(dto)        - name 去掉首尾空格后保存
 *                    - name 为空 → BadRequestException('Name is required')
 *                    - age < 0   → BadRequestException('Age must be >= 0')
 *                    - 同名已存在 → ConflictException('Cat "<name>" already exists')
 * update(id, dto)    不存在 → NotFoundException；存在 → 调 repository.update 并返回结果
 * remove(id)         不存在 → NotFoundException；存在 → 调 repository.delete
 */
@Injectable()
export class CatsService {
  constructor(private readonly repository: CatsRepository) {}

  async findAll(sort: SortField[]): Promise<Cat[]> {
    return this.repository.findAll(sort);
  }

  async findOne(id: number): Promise<Cat> {
    throw new Error('Not implemented');
  }

  async create(dto: CreateCatDto): Promise<Cat> {
    throw new Error('Not implemented');
  }

  async update(id: number, dto: UpdateCatDto): Promise<Cat> {
    throw new Error('Not implemented');
  }

  async remove(id: number): Promise<void> {
    throw new Error('Not implemented');
  }
}
