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
  });
});
