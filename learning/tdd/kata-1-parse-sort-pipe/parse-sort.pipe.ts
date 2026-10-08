import { BadRequestException, PipeTransform } from '@nestjs/common';

export interface SortField {
  field: string;
  order: 'asc' | 'desc';
}

export class ParseSortPipe implements PipeTransform<string, SortField[]> {
  transform(value: string | undefined): SortField[] {
    if (!value?.trim()) {
      return [];
    }
    return value.split(',').map(part => {
      const [field, order = 'asc'] = part.split(':').map(s => s.trim());
      if (order !== 'asc' && order !== 'desc') {
        throw new BadRequestException(
          `Invalid sort direction "${order}" for field "${field}"`,
        );
      }
      return { field, order };
    });
  }
}
