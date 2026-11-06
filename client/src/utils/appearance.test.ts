import { describe, expect, it } from 'vitest';
import { backgroundCss, DEFAULT_APPEARANCE, isAppearance, PRESET_BACKGROUNDS, scaledSize } from './appearance';

describe('appearance (US-30)', () => {
  it('accepts known palettes and backgrounds only', () => {
    expect(isAppearance(DEFAULT_APPEARANCE)).toBe(true);
    expect(isAppearance({ palette: 'rose', background: { kind: 'preset', id: 'ocean' } })).toBe(true);
    expect(isAppearance({ palette: 'rose', background: { kind: 'custom' } })).toBe(true);
    expect(isAppearance({ palette: 'pink', background: { kind: 'none' } })).toBe(false);
    expect(isAppearance({ palette: 'rose', background: { kind: 'preset', id: 'moon' } })).toBe(false);
    expect(isAppearance(null)).toBe(false);
  });

  it('turns the choice into CSS, and nothing for a missing own image', () => {
    expect(backgroundCss({ kind: 'none' }, null)).toBeNull();
    expect(backgroundCss({ kind: 'preset', id: 'forest' }, null)).toBe(PRESET_BACKGROUNDS.find((b) => b.id === 'forest')!.css);
    expect(backgroundCss({ kind: 'custom' }, null)).toBeNull();
    expect(backgroundCss({ kind: 'custom' }, 'data:image/jpeg;base64,AAA')).toBe('center / cover no-repeat url("data:image/jpeg;base64,AAA")');
  });

  it('scales large images down to 1920 px on the longer side, never up', () => {
    expect(scaledSize(4000, 3000)).toEqual({ width: 1920, height: 1440 });
    expect(scaledSize(1080, 2400)).toEqual({ width: 864, height: 1920 });
    expect(scaledSize(800, 600)).toEqual({ width: 800, height: 600 });
  });
});
