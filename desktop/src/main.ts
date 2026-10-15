import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, dialog, Menu, nativeTheme, screen, shell } from 'electron';
import { startServer, type RunningServer } from '../../server/src/start.js';
import { loadWindowState, trackWindowState } from './windowState.js';

/** The port the app prefers, so its address (and with it the browser storage: theme, last project …) stays the same. */
const PREFERRED_PORT = 41723;

// Unpacked runs (`npm run desktop`) keep their data apart from an installed app. SCRUMBANIZE_USER_DATA lets
// automated tests use a throwaway directory.
if (process.env.SCRUMBANIZE_USER_DATA) app.setPath('userData', process.env.SCRUMBANIZE_USER_DATA);
else if (!app.isPackaged) app.setPath('userData', `${app.getPath('userData')} (Dev)`);

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

let server: RunningServer | undefined;
let mainWindow: BrowserWindow | undefined;

// One instance per user: a second start brings the running window to the front instead of starting a
// second server on the same database.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

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
  });
  log(`Scrumbanize ${app.getVersion()} started: ${server.url}, database ${server.dbFile}`);
  if (server.port !== PREFERRED_PORT) log(`Port ${PREFERRED_PORT} was busy; settings stored in the browser start fresh on this port.`);
  createWindow(server.url);
}

function createWindow(url: string): void {
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
    },
  });
  mainWindow = window;
  if (state.maximized) window.maximize();
  trackWindowState(window, app.getPath('userData'));

  window.once('ready-to-show', () => window.show());
  window.on('closed', () => {
    mainWindow = undefined;
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

// Windows convention: closing the last window ends the app.
app.on('window-all-closed', () => app.quit());

// Stop the server and close the database before exiting, so nothing keeps running in the background.
let shutdownDone = false;
app.on('before-quit', (event) => {
  if (shutdownDone || !server) return;
  event.preventDefault();
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

process.on('uncaughtException', (error) => log(`Uncaught: ${error.stack ?? String(error)}`));

function fail(error: unknown): void {
  log(`Start failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
  dialog.showErrorBox(
    'Scrumbanize konnte nicht starten',
    `${error instanceof Error ? error.message : String(error)}\n\nDetails stehen in:\n${logFile}`,
  );
  app.exit(1);
}
