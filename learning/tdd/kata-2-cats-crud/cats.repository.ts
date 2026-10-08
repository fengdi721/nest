import { Injectable } from '@nestjs/common';
import { SortField } from '../kata-1-parse-sort-pipe/parse-sort.pipe';

export interface Cat {
  id: number;
  name: string;
  age: number;
}

export type CreateCatDto = Omit<Cat, 'id'>;
export type UpdateCatDto = Partial<CreateCatDto>;

/**
 * 数据访问层的“端口”（抽象类可以直接当注入 token 用）。
 * 写 CatsService 的单元测试时，用 mock 替换它 —— 不需要真的数据库。
 * 本文件已完成，不需要修改。
 */
export abstract class CatsRepository {
  abstract findAll(sort: SortField[]): Promise<Cat[]>;
  abstract findById(id: number): Promise<Cat | null>;
  abstract findByName(name: string): Promise<Cat | null>;
  abstract create(data: CreateCatDto): Promise<Cat>;
  abstract update(id: number, data: UpdateCatDto): Promise<Cat>;
  abstract delete(id: number): Promise<void>;
}

/**
 * 一个“fake”（假实现）：真的能工作，但数据只存在内存里。
 * e2e 测试用它，这样不需要启动数据库。
 */
@Injectable()
export class InMemoryCatsRepository extends CatsRepository {
  private cats: Cat[] = [];
  private nextId = 1;

  async findAll(sort: SortField[]): Promise<Cat[]> {
    const sorted = [...this.cats];
    for (const { field, order } of [...sort].reverse()) {
      sorted.sort((a, b) => {
        const x = a[field as keyof Cat];
        const y = b[field as keyof Cat];
        const cmp = x < y ? -1 : x > y ? 1 : 0;
        return order === 'asc' ? cmp : -cmp;
      });
    }
    return sorted;
  }

  async findById(id: number) {
    return this.cats.find(cat => cat.id === id) ?? null;
  }

  async findByName(name: string) {
    return this.cats.find(cat => cat.name === name) ?? null;
  }

  async create(data: CreateCatDto) {
    const cat = { id: this.nextId++, ...data };
    this.cats.push(cat);
    return cat;
  }

  async update(id: number, data: UpdateCatDto) {
    const cat = (await this.findById(id))!;
    Object.assign(cat, data);
    return cat;
  }

  async delete(id: number) {
    this.cats = this.cats.filter(cat => cat.id !== id);
  }
}
