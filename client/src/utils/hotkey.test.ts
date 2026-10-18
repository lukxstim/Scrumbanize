import { describe, expect, it } from 'vitest';
import { acceleratorFromKeyEvent, acceleratorKeys, DEFAULT_HOTKEY } from './hotkey';

type Modifiers = { ctrl?: boolean; alt?: boolean; shift?: boolean; meta?: boolean };
const press = (code: string, modifiers: Modifiers = {}, apple = false) =>
  acceleratorFromKeyEvent(
    { code, ctrlKey: !!modifiers.ctrl, altKey: !!modifiers.alt, shiftKey: !!modifiers.shift, metaKey: !!modifiers.meta },
    apple,
  );

describe('acceleratorFromKeyEvent on Windows', () => {
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

describe('acceleratorFromKeyEvent on a Mac', () => {
  it('takes ⌘ as CommandOrControl and ⌃ as Control', () => {
    expect(press('Space', { meta: true, shift: true }, true)).toBe(DEFAULT_HOTKEY);
    expect(press('Space', { ctrl: true }, true)).toBe('Control+Space');
    expect(press('KeyS', { meta: true, ctrl: true, alt: true }, true)).toBe('CommandOrControl+Control+Alt+S');
    expect(press('KeyS', { alt: true }, true)).toBe('Alt+S');
  });

  it('rejects a key with only ⇧ or nothing', () => {
    expect(press('KeyA', { shift: true }, true)).toBeNull();
    expect(press('KeyA', {}, true)).toBeNull();
    expect(press('MetaLeft', { meta: true }, true)).toBeNull();
  });
});

describe('acceleratorKeys', () => {
  it('names the keys as the keyboard shows them', () => {
    expect(acceleratorKeys(DEFAULT_HOTKEY)).toEqual(['Ctrl', 'Shift', 'Leertaste']);
    expect(acceleratorKeys('Alt+Left')).toEqual(['Alt', '←']);
  });

  it('uses the Mac symbols on a Mac', () => {
    expect(acceleratorKeys(DEFAULT_HOTKEY, true)).toEqual(['⌘', '⇧', 'Leertaste']);
    expect(acceleratorKeys('Control+Alt+K', true)).toEqual(['⌃', '⌥', 'K']);
  });
});
