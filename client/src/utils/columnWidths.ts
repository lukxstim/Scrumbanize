/**
 * Board column widths (US-19). A column without a saved width uses the default of the current mode; a saved
 * width counts in both modes. Limits match the server (validation.ts) and migration 13.
 */

export const MIN_COLUMN_WIDTH = 200;
export const MAX_COLUMN_WIDTH = 600;
export const DEFAULT_COLUMN_WIDTH = 288;
export const COMPACT_COLUMN_WIDTH = 224;

/** Space between columns (gap-3) and beside the board (px-4), and the "+ Spalte" button at the end (w-56). */
export const COLUMN_GAP = 12;
export const BOARD_PADDING_X = 16;
export const ADD_COLUMN_WIDTH = 224;

/** Arrow keys on a resize handle change the width by this much, with Shift by the larger step. */
export const KEYBOARD_STEP = 16;
export const KEYBOARD_STEP_LARGE = 64;

export function clampWidth(px: number): number {
  return Math.round(Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, px)));
}

export function columnWidth(column: { width: number | null }, compact: boolean): number {
  return column.width ?? (compact ? COMPACT_COLUMN_WIDTH : DEFAULT_COLUMN_WIDTH);
}

/** The CSS variable that holds a column's width on the board, so dragging a handle can change it without rendering. */
export const columnWidthVar = (columnId: number) => `--column-width-${columnId}`;

/**
 * "An Fenster anpassen": the width that lets `count` columns and the "+ Spalte" button fill `boardWidth` (the
 * visible width of the board). Within the limits, so many columns still scroll and few do not get huge.
 */
export function fitWidth(count: number, boardWidth: number): number {
  if (count <= 0) return DEFAULT_COLUMN_WIDTH;
  const available = boardWidth - 2 * BOARD_PADDING_X - ADD_COLUMN_WIDTH - count * COLUMN_GAP;
  return clampWidth(Math.floor(available / count));
}

/** The width after a key on a resize handle: a number, null to reset (Enter), or undefined for other keys. */
export function widthForKey(width: number, key: string, shift: boolean): number | null | undefined {
  const step = shift ? KEYBOARD_STEP_LARGE : KEYBOARD_STEP;
  switch (key) {
    case 'ArrowLeft':
      return clampWidth(width - step);
    case 'ArrowRight':
      return clampWidth(width + step);
    case 'Home':
      return MIN_COLUMN_WIDTH;
    case 'End':
      return MAX_COLUMN_WIDTH;
    case 'Enter':
      return null;
  }
  return undefined;
}
