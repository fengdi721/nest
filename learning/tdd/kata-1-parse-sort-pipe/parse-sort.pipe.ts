import { BadRequestException, PipeTransform } from '@nestjs/common';

export interface SortField {
  field: string;
  order: 'asc' | 'desc';
}

export interface ParseSortPipeOptions {
  allowedFields?: string[];
}

export class ParseSortPipe implements PipeTransform<string, SortField[]> {
  constructor(private readonly options: ParseSortPipeOptions = {}) {}

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
      const { allowedFields } = this.options;
      if (allowedFields && !allowedFields.includes(field)) {
        throw new BadRequestException(`Sorting by "${field}" is not allowed`);
      }
      return { field, order };
    });
  }
}
