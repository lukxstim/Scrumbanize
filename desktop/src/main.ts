import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, nativeTheme, Notification, screen, shell, type IpcMainInvokeEvent, type Tray } from 'electron';
import { startServer, type RunningServer } from '../../server/src/start.js';
import { IPC, type DesktopSettingsPatch, type DesktopSettingsView, type UpdateSettingsResult } from './bridge.js';
import { isValidAccelerator } from './hotkey.js';
import type { DueTask, ReminderMessage } from './reminderPlan.js';
import { startReminders, type Reminders } from './reminders.js';
import { loadSettings, saveSettings, type DesktopSettings } from './settings.js';
import { createTray } from './tray.js';
import { loadWindowState, trackWindowState } from './windowState.js';

/** The port the app prefers, so its address (and with it the browser storage: theme, last project …) stays the same. */
const PREFERRED_PORT = 41723;

/**
 * Where new versions are published. The repository is private: family members are collaborators and see the
 * releases when logged in to GitHub. The app does not check by itself; it reminds every few weeks (client).
 */
const RELEASES_URL = 'https://github.com/lukxstim/Scrumbanize/releases/latest';

/** Windows starts the app with this argument at login: it then waits in the notification area without a window. */
const HIDDEN_ARG = '--hidden';

// Unpacked runs (`npm run desktop`) keep their data apart from an installed app. SCRUMBANIZE_USER_DATA lets
// automated tests use a throwaway directory.
if (process.env.SCRUMBANIZE_USER_DATA) app.setPath('userData', process.env.SCRUMBANIZE_USER_DATA);
else if (!app.isPackaged) app.setPath('userData', `${app.getPath('userData')} (Dev)`);

// Windows shows notifications under this id; the installer's shortcuts carry the same one (appId in
// electron-builder.yml). Unpacked runs use the executable instead, which Windows accepts without a shortcut.
app.setAppUserModelId(app.isPackaged ? 'de.scrumbanize.app' : process.execPath);

const logFile = path.join(app.getPath('userData'), 'logs', 'main.log');

function log(message: string): void {
  const line = `${new Date().toISOString()} ${message}\n`;
  process.stdout.write(line);
  try {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    fs.appendFileSync(logFile, line);
  } catch {
    // Logging must never break the app.
  }
}

/** The built React app: next to the executable when packaged, in the repository otherwise. */
const clientDist = app.isPackaged
  ? path.join(process.resourcesPath, 'client')
  : path.join(app.getAppPath(), '..', 'client', 'dist');

const trayIcon = app.isPackaged ? path.join(process.resourcesPath, 'tray.png') : path.join(app.getAppPath(), 'build', 'icon.png');

let server: RunningServer | undefined;
let mainWindow: BrowserWindow | undefined;
let tray: Tray | undefined;
let reminders: Reminders | undefined;
let settings: DesktopSettings = loadSettings(app.getPath('userData'));
let hotkeyActive = false;
/** Set once quitting has begun, so closing the window no longer hides it in the notification area. */
let quitting = false;

// One instance per user: a second start brings the running window to the front instead of starting a
// second server on the same database.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());

  app.whenReady().then(start, (error: unknown) => fail(error));
}

async function start(): Promise<void> {
  Menu.setApplicationMenu(null);
  server = await startServer({
    host: '127.0.0.1',
    port: PREFERRED_PORT,
    fallbackToFreePort: true,
    localOnly: true,
    dataDir: app.getPath('userData'),
    clientDist,
    desktop: { version: app.getVersion(), releasesUrl: RELEASES_URL },
  });
  log(`Scrumbanize ${app.getVersion()} started: ${server.url}, database ${server.dbFile}`);
  if (server.port !== PREFERRED_PORT) log(`Port ${PREFERRED_PORT} was busy; settings stored in the browser start fresh on this port.`);

  registerIpc(server.url);
  createWindow(server.url, !process.argv.includes(HIDDEN_ARG));
  tray = createTray(trayIcon, { open: showWindow, checkReminders: () => void reminders?.check(true), quit: () => app.quit() });
  setHotkey(settings.hotkey);
  const url = server.url;
  reminders = startReminders({
    dataDir: app.getPath('userData'),
    enabled: settings.notifications,
    fetchDue: (day) => fetchDue(url, day),
    onClick: openReminder,
    log,
  });
}

function createWindow(url: string, visible: boolean): void {
  const state = loadWindowState(app.getPath('userData'), screen.getAllDisplays());
  const window = new BrowserWindow({
    ...state.bounds,
    minWidth: 1024,
    minHeight: 640,
    title: 'Scrumbanize',
    show: false,
    // Matches the app background, so there is no white flash before the page has loaded.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0f0f12' : '#fafafa',
    autoHideMenuBar: true,
    icon: app.isPackaged ? undefined : path.join(app.getAppPath(), 'build', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
      // Chromium's built-in PDF viewer, for previewing PDF attachments.
      plugins: true,
    },
  });
  mainWindow = window;
  trackWindowState(window, app.getPath('userData'));

  // Started at login, the window loads in the background and only appears when opened from the tray.
  // Maximising shows a window, so a hidden one is maximised when it first appears.
  if (state.maximized) {
    if (visible) window.maximize();
    else window.once('show', () => window.maximize());
  }
  if (visible) window.once('ready-to-show', () => window.show());
  window.on('closed', () => {
    mainWindow = undefined;
  });

  // Closing or minimising may hide the window in the notification area instead (settings, US-18).
  window.on('close', (event) => {
    if (quitting || !settings.closeToTray) return;
    event.preventDefault();
    hideToTray();
  });
  window.on('minimize', () => {
    if (settings.minimizeToTray) hideToTray();
  });
  // Signing out or shutting down Windows must not be held up by a window that only hides.
  window.on('session-end', () => {
    quitting = true;
  });

  // Only the app itself is shown in the window; any other link opens in the default browser.
  const origin = new URL(url).origin;
  const openOutside = (target: string) => {
    if (/^https?:\/\//i.test(target) || /^mailto:/i.test(target)) void shell.openExternal(target);
  };
  window.webContents.setWindowOpenHandler(({ url: target }) => {
    openOutside(target);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, target) => {
    if (new URL(target).origin === origin) return;
    event.preventDefault();
    openOutside(target);
  });

  // Developer tools only in unpacked runs.
  if (!app.isPackaged) {
    window.webContents.on('before-input-event', (_event, input) => {
      if (input.type === 'keyDown' && input.key === 'F12') window.webContents.toggleDevTools();
    });
  }

  void window.loadURL(url);
}

/** Brings the window to the front: from the tray, the shortcut, a notification or a second start. */
function showWindow(): void {
  const window = mainWindow;
  if (!window) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}

function hideToTray(): void {
  mainWindow?.hide();
  if (settings.trayHintShown || !Notification.isSupported()) return;
  updateSettings({ trayHintShown: true });
  new Notification({
    title: 'Scrumbanize läuft im Infobereich weiter',
    body: 'Ein Klick auf das Symbol neben der Uhr öffnet es wieder. Beenden über das Menü des Symbols.',
  }).show();
}

/** Opens the task of a notification, or the calendar for a summary of several tasks. */
function openReminder(message: ReminderMessage): void {
  const window = mainWindow;
  if (!window) return;
  showWindow();
  const target = message.task ? `/p/${message.projectId}/tasks/${message.task.id}` : `/p/${message.projectId}/calendar`;
  const send = () => window.webContents.send(IPC.navigate, target);
  if (window.webContents.isLoading()) window.webContents.once('did-finish-load', send);
  else send();
}

async function fetchDue(url: string, day: string): Promise<DueTask[]> {
  const res = await fetch(`${url}/api/reminders/due?date=${day}`);
  if (!res.ok) throw new Error(`GET /api/reminders/due: ${res.status}`);
  return (await res.json()) as DueTask[];
}

function updateSettings(patch: Partial<DesktopSettings>): void {
  settings = { ...settings, ...patch };
  saveSettings(app.getPath('userData'), settings);
}

/** Registers the shortcut that brings the window to the front; false if another program already uses it. */
function setHotkey(accelerator: string): boolean {
  globalShortcut.unregisterAll();
  hotkeyActive = globalShortcut.register(accelerator, showWindow);
  if (!hotkeyActive) log(`Shortcut ${accelerator} could not be registered (used by another program?)`);
  return hotkeyActive;
}

/**
 * Windows starts this executable at login. The portable app runs from a temporary copy, so it registers the
 * .exe the user started. Unpacked runs would register electron.exe and therefore cannot start with Windows.
 */
function loginItem(): { path: string; args: string[] } | undefined {
  if (!app.isPackaged || process.platform !== 'win32') return undefined;
  return { path: process.env.PORTABLE_EXECUTABLE_FILE ?? process.execPath, args: [HIDDEN_ARG] };
}

function settingsView(): DesktopSettingsView {
  const item = loginItem();
  return {
    closeToTray: settings.closeToTray,
    minimizeToTray: settings.minimizeToTray,
    notifications: settings.notifications,
    hotkey: settings.hotkey,
    hotkeyActive,
    // Also false when it was switched off in the Task Manager's startup apps.
    openAtLogin: item ? app.getLoginItemSettings(item).executableWillLaunchAtLogin : false,
    openAtLoginAvailable: item !== undefined,
  };
}

function isPatch(value: unknown): value is DesktopSettingsPatch {
  if (!value || typeof value !== 'object') return false;
  const flags = ['closeToTray', 'minimizeToTray', 'notifications', 'openAtLogin'];
  return Object.entries(value).every(([key, field]) =>
    key === 'hotkey' ? typeof field === 'string' && isValidAccelerator(field) : flags.includes(key) && typeof field === 'boolean',
  );
}

function applyPatch(patch: DesktopSettingsPatch): UpdateSettingsResult {
  if (patch.hotkey !== undefined && patch.hotkey !== settings.hotkey) {
    if (!setHotkey(patch.hotkey)) {
      setHotkey(settings.hotkey);
      return { ok: false, error: 'hotkey_taken', settings: settingsView() };
    }
    updateSettings({ hotkey: patch.hotkey });
  }
  if (patch.closeToTray !== undefined) updateSettings({ closeToTray: patch.closeToTray });
  if (patch.minimizeToTray !== undefined) updateSettings({ minimizeToTray: patch.minimizeToTray });
  if (patch.notifications !== undefined) {
    updateSettings({ notifications: patch.notifications });
    reminders?.setEnabled(patch.notifications);
  }
  const item = loginItem();
  if (patch.openAtLogin !== undefined && item) app.setLoginItemSettings({ openAtLogin: patch.openAtLogin, ...item });
  return { ok: true, settings: settingsView() };
}

/** The page may only use the desktop functions when it is the app itself. */
function registerIpc(appUrl: string): void {
  const origin = new URL(appUrl).origin;
  const fromApp = (event: IpcMainInvokeEvent) => {
    const url = event.senderFrame?.url;
    return !!url && new URL(url).origin === origin;
  };
  ipcMain.handle(IPC.getSettings, (event) => {
    if (!fromApp(event)) throw new Error('Not allowed');
    return settingsView();
  });
  ipcMain.handle(IPC.updateSettings, (event, patch: unknown): UpdateSettingsResult => {
    if (!fromApp(event)) throw new Error('Not allowed');
    if (!isPatch(patch)) return { ok: false, error: 'invalid', settings: settingsView() };
    return applyPatch(patch);
  });
  ipcMain.handle(IPC.checkReminders, async (event) => {
    if (!fromApp(event)) throw new Error('Not allowed');
    await reminders?.check(true);
  });
}

// Windows convention: closing the last window ends the app. With "close to tray" the window only hides, so
// the app keeps running until it is quit from the tray.
app.on('window-all-closed', () => app.quit());

// Stop the server and close the database before exiting, so nothing keeps running in the background.
let shutdownDone = false;
app.on('before-quit', (event) => {
  quitting = true;
  if (shutdownDone || !server) return;
  event.preventDefault();
  reminders?.stop();
  const running = server;
  server = undefined;
  running
    .close()
    .then(() => log('Server stopped, database closed'))
    .catch((error: unknown) => log(`Error while stopping: ${String(error)}`))
    .finally(() => {
      shutdownDone = true;
      app.quit();
    });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  tray?.destroy();
});

process.on('uncaughtException', (error) => log(`Uncaught: ${error.stack ?? String(error)}`));

function fail(error: unknown): void {
  log(`Start failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
  dialog.showErrorBox(
    'Scrumbanize konnte nicht starten',
    `${error instanceof Error ? error.message : String(error)}\n\nDetails stehen in:\n${logFile}`,
  );
  app.exit(1);
}
