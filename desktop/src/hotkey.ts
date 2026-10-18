/** Brings the window to the front from anywhere. Alt+Space is taken by the Windows window menu and PowerToys Run. */
export const DEFAULT_HOTKEY = 'CommandOrControl+Shift+Space';

const MODIFIERS = new Set(['CommandOrControl', 'Alt', 'Shift']);
const NAMED_KEYS = new Set([
  'Space', 'Enter', 'Tab', 'Backspace', 'Delete', 'Insert', 'Home', 'End', 'PageUp', 'PageDown', 'Up', 'Down', 'Left', 'Right',
]);

/**
 * Whether `accelerator` is a shortcut the settings accept: CommandOrControl/Alt/Shift (each at most once, in this
 * order), at least Ctrl or Alt, and one key A–Z, 0–9, F1–F24 or a named key. A shortcut without Ctrl or Alt would
 * take a key away from typing in every other program. Keep in sync with client/src/utils/hotkey.ts.
 */
export function isValidAccelerator(accelerator: string): boolean {
  const parts = accelerator.split('+');
  const key = parts.pop()!;
  const order = ['CommandOrControl', 'Alt', 'Shift'];
  if (parts.some((part) => !MODIFIERS.has(part))) return false;
  if (parts.join('+') !== order.filter((m) => parts.includes(m)).join('+')) return false;
  if (!parts.includes('CommandOrControl') && !parts.includes('Alt')) return false;
  return /^[A-Z0-9]$/.test(key) || /^F([1-9]|1\d|2[0-4])$/.test(key) || NAMED_KEYS.has(key);
}
