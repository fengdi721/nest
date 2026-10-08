import { BadRequestException } from '@nestjs/common';
import { ParseSortPipe } from './parse-sort.pipe';

describe('ParseSortPipe', () => {
  let pipe: ParseSortPipe;

  beforeEach(() => {
    pipe = new ParseSortPipe();
  });

  describe('transform', () => {
    it('should default to ascending order when no direction is given', () => {
      expect(pipe.transform('name')).toEqual([{ field: 'name', order: 'asc' }]);
    });

    it('should read the direction after a colon', () => {
      expect(pipe.transform('name:desc')).toEqual([
        { field: 'name', order: 'desc' },
      ]);
    });

    it('should parse several comma-separated fields in order', () => {
      expect(pipe.transform('name:asc,createdAt:desc')).toEqual([
        { field: 'name', order: 'asc' },
        { field: 'createdAt', order: 'desc' },
      ]);
    });

    it('should ignore whitespace around fields and directions', () => {
      expect(pipe.transform(' name : desc , age ')).toEqual([
        { field: 'name', order: 'desc' },
        { field: 'age', order: 'asc' },
      ]);
    });

    it.each([undefined, '', '   '])(
      'should return an empty list when the value is %j',
      value => {
        expect(pipe.transform(value as any)).toEqual([]);
      },
    );

    it('should reject an unknown direction with a 400', () => {
      expect(() => pipe.transform('name:up')).toThrow(BadRequestException);
      expect(() => pipe.transform('name:up')).toThrow(
        'Invalid sort direction "up" for field "name"',
      );
    });
  });
});
