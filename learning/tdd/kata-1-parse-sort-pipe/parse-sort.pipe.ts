import {
  BadRequestException,
  Injectable,
  Optional,
  PipeTransform,
} from '@nestjs/common';

export type SortOrder = 'asc' | 'desc';

export interface SortField {
  field: string;
  order: SortOrder;
}

export interface ParseSortPipeOptions {
  /** When set, only these fields may be sorted on (400 otherwise). */
  allowedFields?: string[];
}

const SORT_ORDERS: readonly string[] = ['asc', 'desc'];

/**
 * Parses `?sort=name:asc,createdAt:desc` into
 * `[{ field: 'name', order: 'asc' }, { field: 'createdAt', order: 'desc' }]`.
 */
@Injectable()
export class ParseSortPipe implements PipeTransform<
  string | undefined,
  SortField[]
> {
  constructor(
    @Optional() private readonly options: ParseSortPipeOptions = {},
  ) {}

  transform(value: string | undefined): SortField[] {
    if (!value?.trim()) {
      return [];
    }
    const fields = value.split(',').map(part => this.parsePart(part, value));
    this.assertNoDuplicates(fields);
    return fields;
  }

  private parsePart(part: string, value: string): SortField {
    const [field, order = 'asc'] = part.split(':').map(token => token.trim());
    if (!field) {
      throw new BadRequestException(`Empty sort field in "${value}"`);
    }
    if (!SORT_ORDERS.includes(order)) {
      throw new BadRequestException(
        `Invalid sort direction "${order}" for field "${field}"`,
      );
    }
    const { allowedFields } = this.options;
    if (allowedFields && !allowedFields.includes(field)) {
      throw new BadRequestException(`Sorting by "${field}" is not allowed`);
    }
    return { field, order: order as SortOrder };
  }

  private assertNoDuplicates(fields: SortField[]) {
    const seen = new Set<string>();
    for (const { field } of fields) {
      if (seen.has(field)) {
        throw new BadRequestException(`Duplicate sort field "${field}"`);
      }
      seen.add(field);
    }
  }
}
