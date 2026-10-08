/**
 * Kata 2 · 单元测试（你来写）
 *
 * 规则：
 *   1. 每次只把一个 it.todo 改成真正的测试 → 运行 → 看到【红】且失败原因正确
 *   2. 去 cats.service.ts 写【最少】的代码让它变【绿】
 *   3. 需要时重构（测试保持绿）
 *   4. 每个红 / 绿各提交一次：test(learning): kata 2 red, ...
 *
 * 运行（监听模式）：
 *   npx vitest --config learning/vitest.config.mts learning/tdd/kata-2-cats-crud
 *
 * 下面第一个测试已经写好，作为模板（AAA：Arrange 准备 / Act 执行 / Assert 断言）。
 */
import { Test } from '@nestjs/testing';
import { CatsRepository } from './cats.repository';
import { CatsService } from './cats.service';

describe('CatsService', () => {
  let service: CatsService;
  // 每个方法都是 vi.fn()：既能“规定返回值”（stub），也能“检查被怎样调用”（spy）
  let repository: { [K in keyof CatsRepository]: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    repository = {
      findAll: vi.fn(),
      findById: vi.fn(),
      findByName: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CatsService,
        // 用 mock 替换真正的 repository —— 第 02 课里的 useValue
        { provide: CatsRepository, useValue: repository },
      ],
    }).compile();

    service = moduleRef.get(CatsService);
  });

  describe('findAll', () => {
    it('should pass the sort fields to the repository', async () => {
      // Arrange（准备）
      const sort = [{ field: 'name', order: 'asc' as const }];
      const cats = [{ id: 1, name: 'Tom', age: 3 }];
      repository.findAll.mockResolvedValue(cats);

      // Act（执行）
      const result = await service.findAll(sort);

      // Assert（断言）：返回值 + 交互
      expect(result).toBe(cats);
      expect(repository.findAll).toHaveBeenCalledWith(sort);
    });
  });

  describe('findOne', () => {
    it.todo('should return the cat when it exists');
    it.todo('should throw NotFoundException "Cat #42 not found" when missing');
  });

  describe('create', () => {
    it.todo('should trim the name before saving');
    it.todo('should throw BadRequestException when the name is blank');
    it.todo('should throw BadRequestException when age is negative');
    it.todo('should throw ConflictException when the name already exists');
    it.todo('should NOT call repository.create when validation fails');
  });

  describe('update', () => {
    it.todo('should throw NotFoundException when the cat does not exist');
    it.todo('should return the updated cat');
  });

  describe('remove', () => {
    it.todo('should throw NotFoundException when the cat does not exist');
    it.todo('should call repository.delete with the id');
  });
});
