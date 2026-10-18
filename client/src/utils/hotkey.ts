/**
 * The desktop app's global shortcut (US-18) as an Electron accelerator, e.g. "CommandOrControl+Shift+Space".
 * CommandOrControl is Ctrl on Windows and ⌘ on a Mac (US-20), where Control is the separate ⌃ key. The rules
 * match isValidAccelerator in desktop/src/hotkey.ts: one modifier besides Shift, optionally Shift, and one key.
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

type KeyPress = Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>;

/**
 * The accelerator of a key press while recording a shortcut; null while only modifiers are held, for keys that
 * are not supported, and with only Shift (that would take a key away from typing). On Windows the Windows key is
 * not supported; on a Mac (`apple`) ⌘ becomes CommandOrControl and ⌃ Control.
 */
export function acceleratorFromKeyEvent(event: KeyPress, apple = false): string | null {
  const key = acceleratorKey(event.code);
  if (!key) return null;
  const command = apple ? event.metaKey : event.ctrlKey;
  const control = apple && event.ctrlKey;
  if (!apple && event.metaKey) return null;
  if (!command && !control && !event.altKey) return null;
  return [command && 'CommandOrControl', control && 'Control', event.altKey && 'Alt', event.shiftKey && 'Shift', key]
    .filter(Boolean)
    .join('+');
}

const LABELS: Record<string, string> = {
  CommandOrControl: 'Ctrl',
  Control: 'Ctrl',
  Space: 'Leertaste',
  Up: '↑',
  Down: '↓',
  Left: '←',
  Right: '→',
  Delete: 'Entf',
  Insert: 'Einfg',
  Backspace: '⌫',
};
/** As a Mac keyboard shows the modifiers. */
const APPLE_LABELS: Record<string, string> = { ...LABELS, CommandOrControl: '⌘', Control: '⌃', Alt: '⌥', Shift: '⇧' };

/** The keys of an accelerator for display, e.g. ["Ctrl", "Shift", "Leertaste"], or ["⌘", "⇧", "Leertaste"] on a Mac. */
export function acceleratorKeys(accelerator: string, apple = false): string[] {
  const labels = apple ? APPLE_LABELS : LABELS;
  return accelerator.split('+').map((part) => labels[part] ?? part);
}
