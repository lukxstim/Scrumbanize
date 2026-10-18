import { describe, expect, it } from 'vitest';
import { clampWidth, columnWidth, fitWidth, widthForKey } from './columnWidths';

describe('column widths', () => {
  it('stay between 200 and 600 whole pixels', () => {
    expect(clampWidth(150)).toBe(200);
    expect(clampWidth(320.6)).toBe(321);
    expect(clampWidth(900)).toBe(600);
  });

  it('use the saved width in both modes, otherwise the default of the mode', () => {
    expect(columnWidth({ width: null }, false)).toBe(288);
    expect(columnWidth({ width: null }, true)).toBe(224);
    expect(columnWidth({ width: 410 }, false)).toBe(410);
    expect(columnWidth({ width: 410 }, true)).toBe(410);
  });

  it('fit the window: the columns and the add button fill the board width', () => {
    // 1600 − 2·16 padding − 224 button − 5·12 gaps = 1284, over 5 columns.
    expect(fitWidth(5, 1600)).toBe(256);
    const used = 2 * 16 + 224 + 5 * 12 + 5 * fitWidth(5, 1600);
    expect(used).toBeLessThanOrEqual(1600);
    // Too many columns: the minimum, the board scrolls. Few columns: at most 600.
    expect(fitWidth(12, 1280)).toBe(200);
    expect(fitWidth(2, 2560)).toBe(600);
    expect(fitWidth(0, 1280)).toBe(288);
  });

  it('change with the keys of a resize handle', () => {
    expect(widthForKey(288, 'ArrowRight', false)).toBe(304);
    expect(widthForKey(288, 'ArrowLeft', true)).toBe(224);
    expect(widthForKey(210, 'ArrowLeft', false)).toBe(200);
    expect(widthForKey(288, 'Home', false)).toBe(200);
    expect(widthForKey(288, 'End', false)).toBe(600);
    expect(widthForKey(288, 'Enter', false)).toBeNull();
    expect(widthForKey(288, 'a', false)).toBeUndefined();
  });
});
