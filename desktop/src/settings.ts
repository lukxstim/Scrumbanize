import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_HOTKEY, isValidAccelerator } from './hotkey.js';
import { normalizeServerUrl } from './serverLink.js';

const FILE_NAME = 'desktop-settings.json';

/**
 * Preferences of this computer's desktop app (US-18). They live next to the window state rather than in the
 * database, so a backup restored on another computer does not carry them along. Starting with Windows is not
 * stored here: Windows keeps it, and the Task Manager can change it.
 */
export interface DesktopSettings {
  /** Closing the window hides it in the notification area instead of quitting. */
  closeToTray: boolean;
  /** Minimising hides the window in the notification area instead of the taskbar. */
  minimizeToTray: boolean;
  /** Windows notifications for tasks due today or overdue. */
  notifications: boolean;
  /** Global shortcut that brings the window to the front, as an Electron accelerator. */
  hotkey: string;
  /** The hint "läuft im Infobereich weiter" was shown once. */
  trayHintShown: boolean;
  /** The online server to work with (US-31), as an origin; null: the database on this computer. */
  serverUrl: string | null;
}

export const DEFAULT_SETTINGS: DesktopSettings = {
  closeToTray: false,
  minimizeToTray: false,
  notifications: true,
  hotkey: DEFAULT_HOTKEY,
  trayHintShown: false,
  serverUrl: null,
};

/** Takes every valid field of `raw` and the default for the others, so an old or damaged file still works. */
export function parseSettings(raw: unknown): DesktopSettings {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const flag = (key: keyof DesktopSettings) => (typeof value[key] === 'boolean' ? value[key] : DEFAULT_SETTINGS[key]) as boolean;
  return {
    closeToTray: flag('closeToTray'),
    minimizeToTray: flag('minimizeToTray'),
    notifications: flag('notifications'),
    hotkey: typeof value.hotkey === 'string' && isValidAccelerator(value.hotkey) ? value.hotkey : DEFAULT_SETTINGS.hotkey,
    trayHintShown: flag('trayHintShown'),
    serverUrl: typeof value.serverUrl === 'string' ? serverUrlOf(value.serverUrl) : null,
  };
}

function serverUrlOf(text: string): string | null {
  const result = normalizeServerUrl(text);
  return result.ok ? result.url : null;
}

export function loadSettings(dir: string): DesktopSettings {
  try {
    return parseSettings(JSON.parse(fs.readFileSync(path.join(dir, FILE_NAME), 'utf8')));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(dir: string, settings: DesktopSettings): void {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, FILE_NAME), JSON.stringify(settings));
  } catch {
    // The settings then apply until the app quits.
  }
}
