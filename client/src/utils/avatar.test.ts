import { describe, expect, it } from 'vitest';
import { squareCrop } from './avatar';

describe('squareCrop', () => {
  it('takes the centered square of landscape and portrait pictures', () => {
    expect(squareCrop(4000, 3000)).toEqual({ sx: 500, sy: 0, size: 3000 });
    expect(squareCrop(1080, 1920)).toEqual({ sx: 0, sy: 420, size: 1080 });
  });

  it('keeps square pictures whole and rounds odd offsets down', () => {
    expect(squareCrop(256, 256)).toEqual({ sx: 0, sy: 0, size: 256 });
    expect(squareCrop(301, 300)).toEqual({ sx: 0, sy: 0, size: 300 });
    expect(squareCrop(303, 300)).toEqual({ sx: 1, sy: 0, size: 300 });
  });
});
