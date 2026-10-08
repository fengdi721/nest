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

    describe('with allowedFields', () => {
      beforeEach(() => {
        pipe = new ParseSortPipe({ allowedFields: ['name', 'createdAt'] });
      });

      it('should accept whitelisted fields', () => {
        expect(pipe.transform('createdAt:desc')).toEqual([
          { field: 'createdAt', order: 'desc' },
        ]);
      });

      it('should reject a field that is not whitelisted', () => {
        // Protects the database: clients must not sort by e.g. password
        expect(() => pipe.transform('password')).toThrow(
          'Sorting by "password" is not allowed',
        );
      });
    });

    it('should reject the same field given twice', () => {
      expect(() => pipe.transform('name:asc,name:desc')).toThrow(
        'Duplicate sort field "name"',
      );
    });

    it.each(['name,,age', ':desc', 'name, '])(
      'should reject an empty field name in %j',
      value => {
        expect(() => pipe.transform(value)).toThrow('Empty sort field');
      },
    );
  });
});
