import { describe, expect, it } from 'vitest';
import { dropPosition, type ColumnGeometry } from './dropPosition';

// Two columns side by side; cards are 80px tall, so their middles are 40px below their tops.
const columns: ColumnGeometry[] = [
  { status: 'backlog', left: 0, right: 280, cardMiddles: [140, 230, 320] },
  { status: 'todo', left: 300, right: 580, cardMiddles: [] },
];

describe('dropPosition', () => {
  it('lands above a card when the pointer is on its upper half', () => {
    expect(dropPosition(100, 120, columns)).toEqual({ status: 'backlog', index: 0 });
    expect(dropPosition(100, 210, columns)).toEqual({ status: 'backlog', index: 1 });
  });

  it('lands below a card when the pointer is on its lower half', () => {
    expect(dropPosition(100, 160, columns)).toEqual({ status: 'backlog', index: 1 });
    expect(dropPosition(100, 900, columns)).toEqual({ status: 'backlog', index: 3 });
  });

  it('lands at the top of an empty column, wherever the pointer is', () => {
    expect(dropPosition(400, 600, columns)).toEqual({ status: 'todo', index: 0 });
  });

  it('has no target between or beside the columns', () => {
    expect(dropPosition(290, 200, columns)).toBeNull();
    expect(dropPosition(700, 200, columns)).toBeNull();
  });
});
