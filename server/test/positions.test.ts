import { describe, expect, it } from 'vitest';
import { positionForIndex } from '../src/positions.js';

const list = (...positions: number[]) => positions.map((position, i) => ({ id: i + 1, position }));

describe('positionForIndex', () => {
  it('starts at 1 in an empty list', () => {
    expect(positionForIndex([], 0)).toEqual({ position: 1, renumbered: [] });
  });

  it('goes before the first, after the last, or halfway between neighbours', () => {
    expect(positionForIndex(list(1, 2, 3), 0).position).toBe(0);
    expect(positionForIndex(list(1, 2, 3), 3).position).toBe(4);
    expect(positionForIndex(list(1, 2, 3), 1).position).toBe(1.5);
  });

  it('clamps the index to the list', () => {
    expect(positionForIndex(list(1, 2), 99).position).toBe(3);
    expect(positionForIndex(list(1, 2), -5).position).toBe(0);
  });

  it('renumbers when the neighbours are too close', () => {
    expect(positionForIndex(list(1, 1 + 1e-9, 5), 1)).toEqual({
      position: 2,
      renumbered: [
        { id: 1, position: 1 },
        { id: 2, position: 3 },
        { id: 3, position: 4 },
      ],
    });
  });
});
