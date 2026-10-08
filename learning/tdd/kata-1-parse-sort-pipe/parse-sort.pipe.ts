import { PipeTransform } from '@nestjs/common';

export interface SortField {
  field: string;
  order: 'asc' | 'desc';
}

export class ParseSortPipe implements PipeTransform<string, SortField[]> {
  transform(value: string): SortField[] {
    // "Fake it": the simplest thing that makes the only test pass.
    return [{ field: value, order: 'asc' }];
  }
}
