/**
 * The desktop app's global shortcut (US-18) as an Electron accelerator, e.g. "CommandOrControl+Shift+Space".
 * The rules match isValidAccelerator in desktop/src/hotkey.ts: Ctrl or Alt, optionally Shift, and one key.
 */

export const DEFAULT_HOTKEY = 'CommandOrControl+Shift+Space';

const NAMED_CODES: Record<string, string> = {
  Space: 'Space',
  Enter: 'Enter',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
};

/** The key of `code` (KeyboardEvent.code, the same on every keyboard layout) as accelerators name it. */
function acceleratorKey(code: string): string | undefined {
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1];
  const digit = /^Digit(\d)$/.exec(code);
  if (digit) return digit[1];
  if (/^F([1-9]|1\d|2[0-4])$/.test(code)) return code;
  return NAMED_CODES[code];
}

/**
 * The accelerator of a key press while recording a shortcut; null while only modifiers are held, for keys that
 * are not supported, with the Windows key, and without Ctrl or Alt (that would take a key away from typing).
 */
export function acceleratorFromKeyEvent(event: Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>): string | null {
  const key = acceleratorKey(event.code);
  if (!key || event.metaKey || (!event.ctrlKey && !event.altKey)) return null;
  return [event.ctrlKey && 'CommandOrControl', event.altKey && 'Alt', event.shiftKey && 'Shift', key].filter(Boolean).join('+');
}

const LABELS: Record<string, string> = { CommandOrControl: 'Ctrl', Space: 'Leertaste', Up: '↑', Down: '↓', Left: '←', Right: '→', Delete: 'Entf', Insert: 'Einfg', Backspace: '⌫' };

/** The keys of an accelerator for display, e.g. ["Ctrl", "Shift", "Leertaste"]. */
export function acceleratorKeys(accelerator: string): string[] {
  return accelerator.split('+').map((part) => LABELS[part] ?? part);
}
