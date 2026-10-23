import { describe, expect, it, vi } from 'vitest';
import { haptic, isTouchActivation } from './haptics';

describe('haptic feedback', () => {
  it('vibrates with a pattern per moment of the drag', () => {
    const vibrate = vi.fn(() => true);
    expect(haptic('pickUp', { vibrate })).toBe(true);
    expect(haptic('drop', { vibrate })).toBe(true);
    expect(vibrate).toHaveBeenNthCalledWith(1, 12);
    expect(vibrate).toHaveBeenNthCalledWith(2, [8, 40, 8]);
  });

  it('does nothing where the browser cannot vibrate, or refuses', () => {
    expect(haptic('target', undefined)).toBe(false);
    expect(haptic('target', {} as Navigator)).toBe(false);
    const refusing = {
      vibrate: () => {
        throw new Error('not allowed');
      },
    };
    expect(haptic('target', refusing)).toBe(false);
  });

  it('counts only drags started by a finger', () => {
    expect(isTouchActivation(null)).toBe(false);
    expect(isTouchActivation(new Event('mousedown'))).toBe(false);
  });
});
