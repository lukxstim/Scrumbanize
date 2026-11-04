import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, nativeTheme, Notification, powerMonitor, screen, shell, type IpcMainInvokeEvent, type Tray } from 'electron';
import { startServer, type RunningServer } from '../../server/src/start.js';
import { IPC, type DesktopSettingsPatch, type DesktopSettingsView, type UpdateSettingsResult } from './bridge.js';
import { isValidAccelerator } from './hotkey.js';
import { macMenuTemplate } from './macMenu.js';
import type { DueTask, ReminderMessage } from './reminderPlan.js';
import { startReminders, type Reminders } from './reminders.js';
import { loadSettings, saveSettings, type DesktopSettings } from './settings.js';
import { dockedBounds, loadQuickNotesState, QUICK_NOTES_WIDTH, saveQuickNotesState, type QuickNotesState } from './quickNotesState.js';
import { attachAppBar } from './appBar.js';
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

/**
 * On a Mac (US-20) the app follows macOS conventions: closing the window keeps it running in the Dock and the menu
 * bar (the Windows settings for that are hidden), the Dock icon shows it again, and ⌘Q quits.
 */
const isMac = process.platform === 'darwin';

// Unpacked runs (`npm run desktop`) keep their data apart from an installed app. SCRUMBANIZE_USER_DATA lets
// automated tests use a throwaway directory.
if (process.env.SCRUMBANIZE_USER_DATA) app.setPath('userData', process.env.SCRUMBANIZE_USER_DATA);
else if (!app.isPackaged) app.setPath('userData', `${app.getPath('userData')} (Dev)`);

// Windows shows notifications under this id; the installer's shortcuts carry the same one (appId in
// electron-builder.yml). Unpacked runs use the executable instead, which Windows accepts without a shortcut.
// macOS takes the bundle id from the app itself.
if (process.platform === 'win32') app.setAppUserModelId(app.isPackaged ? 'de.scrumbanize.app' : process.execPath);

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

/** The colored app icon in the Windows notification area; a black "template" glyph in the macOS menu bar. */
const trayIconName = isMac ? 'trayTemplate.png' : app.isPackaged ? 'tray.png' : 'icon.png';
const trayIcon = app.isPackaged ? path.join(process.resourcesPath, trayIconName) : path.join(app.getAppPath(), 'build', trayIconName);

let server: RunningServer | undefined;
let mainWindow: BrowserWindow | undefined;
let tray: Tray | undefined;
let reminders: Reminders | undefined;
let settings: DesktopSettings = loadSettings(app.getPath('userData'));
let hotkeyActive = false;
/** The quick notes panel (US-26), docked to the right edge of the screen. */
let quickNotesWindow: BrowserWindow | undefined;
let quickNotesState: QuickNotesState = loadQuickNotesState(app.getPath('userData'));
/** Set once quitting has begun, so closing the window no longer hides it (notification area, macOS Dock). */
let quitting = false;
/**
 * The computer shuts down, restarts or logs out: quitting must not wait for anything, or macOS (and Windows) see an
 * app that refuses to quit and stop the shutdown.
 */
let systemQuitting = false;

/** How long a normal quit waits for the server to stop before it quits anyway. */
const STOP_TIMEOUT_MS = 3000;

// One instance per user: a second start brings the running window to the front instead of starting a
// second server on the same database.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());
  // macOS: a click on the Dock icon (or opening the app again in the Finder) shows the hidden window.
  app.on('activate', () => showWindow());

  app.whenReady().then(start, (error: unknown) => fail(error));
}

async function start(): Promise<void> {
  Menu.setApplicationMenu(isMac ? Menu.buildFromTemplate(macMenuTemplate(app.name)) : null);
  server = await startServer({
    host: '127.0.0.1',
    port: PREFERRED_PORT,
    fallbackToFreePort: true,
    localOnly: true,
    dataDir: app.getPath('userData'),
    clientDist,
    desktop: { version: app.getVersion(), releasesUrl: RELEASES_URL },
    // Only this computer reaches the app (127.0.0.1, hostGuard), so there is nothing to log in to (US-21).
    auth: 'local',
  });
  log(`Scrumbanize ${app.getVersion()} started: ${server.url}, database ${server.dbFile}`);
  // macOS: restarting, shutting down or logging out is announced before the app is asked to quit (see before-quit).
  // No preventDefault() here: that would delay the shutdown.
  powerMonitor.on('shutdown', () => {
    log('System is shutting down');
    systemQuitting = true;
    quitting = true;
    app.quit();
  });
  if (server.port !== PREFERRED_PORT) log(`Port ${PREFERRED_PORT} was busy; settings stored in the browser start fresh on this port.`);

  registerIpc(server.url);
  createWindow(server.url, !startedAtLogin());
  // The quick notes come back if they were open when the app was quit, also when it starts hidden at login.
  if (quickNotesState.open) openQuickNotes(server.url);
  tray = createTray(trayIcon, { open: showWindow, quickNotes: () => server && openQuickNotes(server.url), checkReminders: () => void reminders?.check(true), quit: () => app.quit() }, { template: isMac });
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
    // Closing the window ends the app on Windows, also while the quick notes are open; they come back at the next start.
    if (!isMac) app.quit();
  });

  // Closing or minimising may hide the window in the notification area instead (settings, US-18). On a Mac,
  // closing always only hides it, as usual there; ⌘Q or "Beenden" in the menu bar quits.
  window.on('close', (event) => {
    if (quitting || !(isMac || settings.closeToTray)) return;
    event.preventDefault();
    if (isMac) window.hide();
    else hideToTray();
  });
  window.on('minimize', () => {
    if (settings.minimizeToTray && !isMac) hideToTray();
  });
  // Signing out or shutting down Windows must not be held up by a window that only hides.
  window.on('session-end', () => {
    systemQuitting = true;
    quitting = true;
  });

  keepInApp(window);
  void window.loadURL(url);
}

/**
 * Only the app itself is shown in its windows; any other link opens in the default browser. Developer tools (F12)
 * only in unpacked runs.
 */
function keepInApp(window: BrowserWindow): void {
  const origin = server ? new URL(server.url).origin : '';
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
  if (!app.isPackaged) {
    window.webContents.on('before-input-event', (_event, input) => {
      if (input.type === 'keyDown' && input.key === 'F12') window.webContents.toggleDevTools();
    });
  }
}

/**
 * The quick notes (US-26): one frameless panel, always in front, docked to the right edge of the screen the mouse is
 * on, over its full height. Opening it again brings it to the front. Its width is kept; it stays where it is docked,
 * and resizing only changes the width. Closing it with × closes it; quitting the app keeps it for the next start.
 */
function openQuickNotes(url: string): void {
  if (quickNotesWindow && !quickNotesWindow.isDestroyed()) {
    quickNotesWindow.show();
    quickNotesWindow.focus();
    return;
  }
  const dir = app.getPath('userData');
  // The screen the mouse is on; the same one again after the screens changed, or the primary one if it is gone.
  const displayId = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id;
  const display = () => screen.getAllDisplays().find((d) => d.id === displayId) ?? screen.getPrimaryDisplay();
  const window = new BrowserWindow({
    ...dockedBounds(display().workArea, quickNotesState.width),
    minWidth: QUICK_NOTES_WIDTH.min,
    maxWidth: QUICK_NOTES_WIDTH.max,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    title: 'Kurznotizen',
    show: false,
    // The paper color, so there is no white flash before the page has loaded.
    backgroundColor: '#fff4a8',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });
  quickNotesWindow = window;
  quickNotesState = { ...quickNotesState, open: true };
  saveQuickNotesState(dir, quickNotesState);
  // On Windows an app bar like the docked Sticky Notes: its strip is reserved, other windows end next to it.
  const bar = attachAppBar(window, display, quickNotesState.width, log);
  const dock = () => {
    if (window.isDestroyed()) return;
    if (bar) bar.place();
    else window.setBounds(dockedBounds(display().workArea, quickNotesState.width));
  };

  // Resized at its left edge, it stays docked: the new width, again over the full height at the right edge.
  window.on('resized', () => {
    quickNotesState = { ...quickNotesState, width: window.getBounds().width };
    if (bar) bar.setWidth(quickNotesState.width);
    else dock();
    saveQuickNotesState(dir, quickNotesState);
  });
  // A screen added, removed or rearranged (or the taskbar moved): dock again.
  const redock = dock;
  screen.on('display-metrics-changed', redock);
  screen.on('display-removed', redock);
  // Only once it is really gone: the page may still refuse to close (unsaved text), and then it keeps its strip.
  window.on('closed', () => {
    try {
      bar?.remove();
    } catch (error) {
      log(`Quick notes strip could not be given back: ${String(error)}`);
    }
    screen.removeListener('display-metrics-changed', redock);
    screen.removeListener('display-removed', redock);
    quickNotesWindow = undefined;
    if (!quitting) quickNotesState = { ...quickNotesState, open: false };
    saveQuickNotesState(dir, quickNotesState);
  });
  // Quitting: the strip goes back before anything else is torn down.
  const release = () => bar?.remove();
  app.once('before-quit', release);
  window.once('closed', () => app.removeListener('before-quit', release));
  window.once('ready-to-show', () => window.show());
  keepInApp(window);
  void window.loadURL(`${url}/kurznotizen`);
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
 * What starts at login, or undefined where that is not available. Windows starts this executable; the portable app
 * runs from a temporary copy, so it registers the .exe the user started. macOS registers the app itself. Unpacked
 * runs would register electron.exe or Electron.app and therefore cannot start at login.
 */
function loginItem(): { path?: string; args?: string[] } | undefined {
  if (!app.isPackaged) return undefined;
  if (process.platform === 'win32') return { path: process.env.PORTABLE_EXECUTABLE_FILE ?? process.execPath, args: [HIDDEN_ARG] };
  if (isMac) return {};
  return undefined;
}

/** Whether the app was started at login, so its window stays hidden. macOS 13 and later may not tell. */
function startedAtLogin(): boolean {
  if (process.argv.includes(HIDDEN_ARG)) return true;
  return isMac && app.isPackaged && app.getLoginItemSettings().wasOpenedAtLogin;
}

function settingsView(): DesktopSettingsView {
  const item = loginItem();
  return {
    closeToTray: settings.closeToTray,
    minimizeToTray: settings.minimizeToTray,
    notifications: settings.notifications,
    hotkey: settings.hotkey,
    hotkeyActive,
    // On Windows also false when it was switched off in the Task Manager's startup apps.
    openAtLogin: !item ? false : isMac ? app.getLoginItemSettings().openAtLogin : app.getLoginItemSettings(item).executableWillLaunchAtLogin,
    openAtLoginAvailable: item !== undefined,
    platform: process.platform,
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
  ipcMain.handle(IPC.openQuickNotes, (event) => {
    if (!fromApp(event)) throw new Error('Not allowed');
    openQuickNotes(appUrl);
  });
}

// Windows convention: closing the last window ends the app. With "close to tray" the window only hides, so
// the app keeps running until it is quit from the tray. On a Mac the window always only hides (see createWindow).
app.on('window-all-closed', () => {
  if (!isMac) app.quit();
});

// Stop the server and close the database before exiting, so nothing keeps running in the background.
let shutdownDone = false;
app.on('before-quit', (event) => {
  quitting = true;
  if (shutdownDone || !server) return;
  reminders?.stop();
  const running = server;
  server = undefined;

  // The computer shuts down: close everything at once and let the quit go on. Holding it up with preventDefault()
  // tells macOS the app refuses to quit, which can cancel the shutdown.
  if (systemQuitting) {
    shutdownDone = true;
    try {
      running.closeNow();
      log('Server stopped, database closed (system shutdown)');
    } catch (error) {
      log(`Error while stopping: ${String(error)}`);
    }
    return;
  }

  // Quit by the user (⌘Q, menu, tray): wait for open requests, but never longer than STOP_TIMEOUT_MS.
  event.preventDefault();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      log(`Server did not stop within ${STOP_TIMEOUT_MS} ms; closing at once`);
      running.closeNow();
      resolve();
    }, STOP_TIMEOUT_MS);
  });
  Promise.race([running.close().then(() => log('Server stopped, database closed')), timeout])
    .catch((error: unknown) => log(`Error while stopping: ${String(error)}`))
    .finally(() => {
      clearTimeout(timer);
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
