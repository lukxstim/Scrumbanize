/** Brings the window to the front from anywhere. Alt+Space is taken by the Windows window menu and PowerToys Run. */
export const DEFAULT_HOTKEY = 'CommandOrControl+Shift+Space';

/** In this order. CommandOrControl is Ctrl on Windows and ⌘ on a Mac, where Control is the separate ⌃ key. */
const MODIFIERS = ['CommandOrControl', 'Control', 'Alt', 'Shift'];
const NAMED_KEYS = new Set([
  'Space', 'Enter', 'Tab', 'Backspace', 'Delete', 'Insert', 'Home', 'End', 'PageUp', 'PageDown', 'Up', 'Down', 'Left', 'Right',
]);

/**
 * Whether `accelerator` is a shortcut the settings accept: modifiers from MODIFIERS (each at most once, in that
 * order), at least one besides Shift, and one key A–Z, 0–9, F1–F24 or a named key. A shortcut with only Shift would
 * take a key away from typing in every other program. Keep in sync with client/src/utils/hotkey.ts.
 */
export function isValidAccelerator(accelerator: string): boolean {
  const parts = accelerator.split('+');
  const key = parts.pop()!;
  if (parts.some((part) => !MODIFIERS.includes(part))) return false;
  if (parts.join('+') !== MODIFIERS.filter((m) => parts.includes(m)).join('+')) return false;
  if (!parts.some((part) => part !== 'Shift')) return false;
  return /^[A-Z0-9]$/.test(key) || /^F([1-9]|1\d|2[0-4])$/.test(key) || NAMED_KEYS.has(key);
}
