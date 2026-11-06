/**
 * What the app's page and the main process exchange (US-18). The preload script offers it to the page as
 * `window.scrumbanizeDesktop`; keep in sync with client/src/types/desktop.ts.
 */

export const IPC = {
  getSettings: 'desktop:get-settings',
  updateSettings: 'desktop:update-settings',
  checkReminders: 'desktop:check-reminders',
  /** Opens the quick notes (US-26): a panel docked to the right edge of the screen, always in front. */
  openQuickNotes: 'desktop:open-quick-notes',
  /** Works with an online server from now on, or with the database on this computer again (null), US-31. */
  setServer: 'desktop:set-server',
  /** Main → page: show this path of the app, e.g. after a click on a notification. */
  navigate: 'desktop:navigate',
} as const;

/** The settings as the settings page shows them. */
export interface DesktopSettingsView {
  closeToTray: boolean;
  minimizeToTray: boolean;
  notifications: boolean;
  /** Electron accelerator, e.g. "CommandOrControl+Shift+Space". */
  hotkey: string;
  /** False when another program has taken the shortcut. */
  hotkeyActive: boolean;
  /** Starts hidden in the notification area when signing in to Windows. */
  openAtLogin: boolean;
  /** Only the installed or portable app can start at login, not an unpacked run. */
  openAtLoginAvailable: boolean;
  /** The settings page words things for Windows or macOS and hides what a Mac does differently. */
  platform: NodeJS.Platform;
  /** Where the data is (US-31). */
  storage: StorageView;
}

export interface StorageView {
  /** The chosen online server, or null for this computer. */
  serverUrl: string | null;
  /** What the window shows right now: the server, or this computer (also when the server could not be reached at the start). */
  active: 'server' | 'local';
  /** The database file on this computer. */
  localFile: string;
}

export type SetServerResult =
  | { ok: true; version: string | null }
  | { ok: false; error: 'invalid_url' | 'insecure' | 'unreachable' | 'not_scrumbanize' | 'unhealthy' };

export type DesktopSettingsPatch = Partial<Pick<DesktopSettingsView, 'closeToTray' | 'minimizeToTray' | 'notifications' | 'hotkey' | 'openAtLogin'>>;

export type UpdateSettingsResult =
  | { ok: true; settings: DesktopSettingsView }
  /** `hotkey_taken`: another program uses the shortcut, the previous one stays. */
  | { ok: false; error: 'invalid' | 'hotkey_taken'; settings: DesktopSettingsView };
