import { PipeTransform } from '@nestjs/common';

export interface SortField {
  field: string;
  order: 'asc' | 'desc';
}

export class ParseSortPipe implements PipeTransform<string, SortField[]> {
  transform(value: string): SortField[] {
    const [field, order = 'asc'] = value.split(':');
    return [{ field, order: order as SortField['order'] }];
  }
}
