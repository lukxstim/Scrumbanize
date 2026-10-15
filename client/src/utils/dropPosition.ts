import type { TaskStatus } from '../types/task';

export interface ColumnGeometry {
  status: TaskStatus;
  left: number;
  right: number;
  /** Vertical centres of the column's cards, top to bottom, without the card being dragged. */
  cardMiddles: number[];
}

/**
 * Where a dragged card at (x, y) would land: the column under x, and in it the slot after every card
 * whose middle is above y. Returns null between or beside the columns.
 */
export function dropPosition(x: number, y: number, columns: ColumnGeometry[]): { status: TaskStatus; index: number } | null {
  const column = columns.find((c) => x >= c.left && x <= c.right);
  if (!column) return null;
  return { status: column.status, index: column.cardMiddles.filter((middle) => middle < y).length };
}
