/** One cell (column × lane) of the board as measured on the page. */
export interface CellGeometry {
  columnId: number;
  laneId: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  /** Vertical centres of the cell's cards, top to bottom, without the card being dragged. */
  cardMiddles: number[];
}

/**
 * Where a dragged card at (x, y) would land: the column under x; in it, the lane under y (or the nearest one,
 * e.g. over a header or between lanes); and in that cell, the slot after every card whose middle is above y.
 * Returns null beside or between the columns.
 */
export function dropPosition(
  x: number,
  y: number,
  cells: CellGeometry[],
): { columnId: number; laneId: number; index: number } | null {
  const inColumn = cells.filter((cell) => x >= cell.left && x <= cell.right);
  if (inColumn.length === 0) return null;

  const distance = (cell: CellGeometry) => (y < cell.top ? cell.top - y : y > cell.bottom ? y - cell.bottom : 0);
  const cell = inColumn.reduce((best, candidate) => (distance(candidate) < distance(best) ? candidate : best));

  return { columnId: cell.columnId, laneId: cell.laneId, index: cell.cardMiddles.filter((middle) => middle < y).length };
}

/** Where a dragged column header at x would go: after every other column whose centre is left of x. */
export function columnDropIndex(x: number, otherColumnCentres: number[]): number {
  return otherColumnCentres.filter((centre) => centre < x).length;
}

/**
 * How far a keyboard drag moves sideways to reach the neighbouring column, given the left edges of all column
 * headers in order and the dragged item's left edge `x`. Columns can have different widths, so the step is the
 * distance between the current column's edge and the neighbour's; 0 at either end of the board.
 */
export function columnStep(headerLefts: number[], x: number, direction: -1 | 1): number {
  // The column the item is in: the last one starting at or left of it (cards sit a little inside their column).
  let current = 0;
  headerLefts.forEach((left, i) => {
    if (left <= x + 1) current = i;
  });
  const target = headerLefts[current + direction];
  return target === undefined ? 0 : target - headerLefts[current]!;
}
