import { describe, expect, it } from 'vitest';
import { columnDropIndex, dropPosition, type CellGeometry } from './dropPosition';

// Two columns (10 at x 0-280, 20 at x 300-580) and two lanes (1 at y 100-400, 2 at y 450-700).
// Cards are 80px tall, so their middles are 40px below their tops.
const cells: CellGeometry[] = [
  { columnId: 10, laneId: 1, left: 0, right: 280, top: 100, bottom: 400, cardMiddles: [140, 230, 320] },
  { columnId: 20, laneId: 1, left: 300, right: 580, top: 100, bottom: 400, cardMiddles: [] },
  { columnId: 10, laneId: 2, left: 0, right: 280, top: 450, bottom: 700, cardMiddles: [490] },
  { columnId: 20, laneId: 2, left: 300, right: 580, top: 450, bottom: 700, cardMiddles: [] },
];

describe('dropPosition', () => {
  it('lands above a card when the pointer is on its upper half, below it on the lower half', () => {
    expect(dropPosition(100, 120, cells)).toEqual({ columnId: 10, laneId: 1, index: 0 });
    expect(dropPosition(100, 160, cells)).toEqual({ columnId: 10, laneId: 1, index: 1 });
    expect(dropPosition(100, 390, cells)).toEqual({ columnId: 10, laneId: 1, index: 3 });
  });

  it('picks the lane under the pointer', () => {
    expect(dropPosition(100, 500, cells)).toEqual({ columnId: 10, laneId: 2, index: 1 });
    expect(dropPosition(400, 600, cells)).toEqual({ columnId: 20, laneId: 2, index: 0 });
  });

  it('uses the nearest lane over a header or in the gap between lanes', () => {
    expect(dropPosition(400, 40, cells)).toEqual({ columnId: 20, laneId: 1, index: 0 });
    expect(dropPosition(100, 420, cells)).toEqual({ columnId: 10, laneId: 1, index: 3 });
    expect(dropPosition(100, 440, cells)).toEqual({ columnId: 10, laneId: 2, index: 0 });
  });

  it('has no target between or beside the columns', () => {
    expect(dropPosition(290, 200, cells)).toBeNull();
    expect(dropPosition(700, 200, cells)).toBeNull();
  });
});

describe('columnDropIndex', () => {
  it('counts the other columns left of the pointer', () => {
    expect(columnDropIndex(50, [140, 440, 740])).toBe(0);
    expect(columnDropIndex(500, [140, 440, 740])).toBe(2);
    expect(columnDropIndex(900, [140, 440, 740])).toBe(3);
  });
});
