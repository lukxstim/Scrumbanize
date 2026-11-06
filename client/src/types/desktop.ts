/**
 * What the desktop app offers the page (US-18), as `window.scrumbanizeDesktop`; absent in the browser.
 * Keep in sync with desktop/src/bridge.ts.
 */

export interface DesktopSettings {
  closeToTray: boolean;
  minimizeToTray: boolean;
  notifications: boolean;
  /** Electron accelerator, e.g. "CommandOrControl+Shift+Space". */
  hotkey: string;
  /** False when another program has taken the shortcut. */
  hotkeyActive: boolean;
  openAtLogin: boolean;
  /** Only the installed or portable app can start at login, not an unpacked run. */
  openAtLoginAvailable: boolean;
  /** Node's process.platform: "win32", "darwin" (macOS) … The page words things for it and hides what a Mac does differently. */
  platform: string;
  /** Where the data is (US-31); absent in older versions of the desktop app. */
  storage?: StorageInfo;
}

export interface StorageInfo {
  /** The chosen online server, or null for this computer. */
  serverUrl: string | null;
  /** What the window shows right now; 'local' also when the server could not be reached at the start. */
  active: 'server' | 'local';
  /** The database file on this computer. */
  localFile: string;
}

export type SetServerResult =
  | { ok: true; version: string | null }
  | { ok: false; error: 'invalid_url' | 'insecure' | 'unreachable' | 'not_scrumbanize' | 'unhealthy' };

export type DesktopSettingsPatch = Partial<Pick<DesktopSettings, 'closeToTray' | 'minimizeToTray' | 'notifications' | 'hotkey' | 'openAtLogin'>>;

export type UpdateSettingsResult =
  | { ok: true; settings: DesktopSettings }
  | { ok: false; error: 'invalid' | 'hotkey_taken'; settings: DesktopSettings };

export interface DesktopBridge {
  getSettings: () => Promise<DesktopSettings>;
  updateSettings: (patch: DesktopSettingsPatch) => Promise<UpdateSettingsResult>;
  /** Shows every task due today or overdue as a notification again, or that there are none. */
  checkReminders: () => Promise<void>;
  /** Opens the quick notes (US-26), a panel at the right edge of the screen, always in front; absent in older versions. */
  openQuickNotes?: () => Promise<void>;
  /** Works with an online server (its address), or with this computer again (null), US-31; absent in older versions. */
  setServer?: (url: string | null) => Promise<SetServerResult>;
  /** The desktop app asks to show a path of the app (a click on a notification); returns the unsubscribe. */
  onNavigate: (handler: (path: string) => void) => () => void;
}

declare global {
  interface Window {
    scrumbanizeDesktop?: DesktopBridge;
  }
}
