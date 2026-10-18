import { describe, expect, it } from 'vitest';
import { acceleratorFromKeyEvent, acceleratorKeys, DEFAULT_HOTKEY } from './hotkey';

const press = (code: string, modifiers: { ctrl?: boolean; alt?: boolean; shift?: boolean; meta?: boolean } = {}) =>
  acceleratorFromKeyEvent({ code, ctrlKey: !!modifiers.ctrl, altKey: !!modifiers.alt, shiftKey: !!modifiers.shift, metaKey: !!modifiers.meta });

describe('acceleratorFromKeyEvent', () => {
  it('turns key presses with Ctrl or Alt into accelerators, modifiers in a fixed order', () => {
    expect(press('Space', { ctrl: true, shift: true })).toBe(DEFAULT_HOTKEY);
    expect(press('KeyS', { alt: true, shift: true })).toBe('Alt+Shift+S');
    expect(press('Digit1', { ctrl: true, alt: true })).toBe('CommandOrControl+Alt+1');
    expect(press('F5', { ctrl: true })).toBe('CommandOrControl+F5');
    expect(press('ArrowUp', { alt: true })).toBe('Alt+Up');
  });

  it('uses the physical key, so it is the same on a German keyboard (Z/Y)', () => {
    expect(press('KeyY', { ctrl: true })).toBe('CommandOrControl+Y');
  });

  it('waits while only modifiers are held and rejects other shortcuts', () => {
    expect(press('ControlLeft', { ctrl: true })).toBeNull();
    expect(press('ShiftRight', { ctrl: true, shift: true })).toBeNull();
    expect(press('KeyA')).toBeNull();
    expect(press('KeyA', { shift: true })).toBeNull();
    expect(press('KeyA', { ctrl: true, meta: true })).toBeNull();
    expect(press('Minus', { ctrl: true })).toBeNull();
    expect(press('F25', { ctrl: true })).toBeNull();
  });
});

describe('acceleratorKeys', () => {
  it('names the keys as the keyboard shows them', () => {
    expect(acceleratorKeys(DEFAULT_HOTKEY)).toEqual(['Ctrl', 'Shift', 'Leertaste']);
    expect(acceleratorKeys('Alt+Left')).toEqual(['Alt', '←']);
  });
});
