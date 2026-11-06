import { Menu, nativeImage, Tray } from 'electron';

export interface TrayActions {
  open: () => void;
  /** The quick notes panel at the right edge of the screen (US-26). */
  quickNotes: () => void;
  checkReminders: () => void;
  /**
   * Back to the data on this computer (US-31). Offered while the window shows an online server, also as a way out
   * should the server's page not offer it.
   */
  useLocal: () => void;
  quit: () => void;
}

/**
 * The icon in the notification area next to the clock (US-18), or in the macOS menu bar (US-20): a click shows the
 * window, the menu also checks the reminders or quits. It is there while the app runs, so a window hidden at login
 * can always be opened. On a Mac a click opens the menu, as usual there, and `template` marks the black glyph that
 * macOS tints for light and dark menu bars (it finds the @2x file next to it by itself).
 */
export function createTray(iconFile: string, actions: TrayActions, { template = false, server = null as string | null } = {}): Tray {
  const image = template ? nativeImage.createFromPath(iconFile) : trayImage(iconFile);
  if (template) image.setTemplateImage(true);
  const tray = new Tray(image);
  setTrayMenu(tray, actions, server);
  if (!template) tray.on('click', actions.open);
  return tray;
}

/** The menu, and the tooltip naming the online server while the window shows one (US-31). */
export function setTrayMenu(tray: Tray, actions: TrayActions, server: string | null): void {
  tray.setToolTip(server ? `Scrumbanize – ${new URL(server).host}` : 'Scrumbanize');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Scrumbanize öffnen', click: actions.open },
      { label: 'Kurznotizen', click: actions.quickNotes },
      { label: 'Erinnerungen jetzt prüfen', click: actions.checkReminders },
      ...(server ? [{ type: 'separator' as const }, { label: 'Daten auf diesem Computer verwenden', click: actions.useLocal }] : []),
      { type: 'separator' },
      { label: 'Beenden', click: actions.quit },
    ]),
  );
}

/** The app icon in the sizes Windows uses at 100–200 % display scaling, so it stays sharp. */
function trayImage(file: string) {
  const source = nativeImage.createFromPath(file);
  const image = nativeImage.createEmpty();
  for (const scaleFactor of [1, 1.25, 1.5, 2]) {
    const size = Math.round(16 * scaleFactor);
    image.addRepresentation({ scaleFactor, buffer: source.resize({ width: size, height: size, quality: 'best' }).toPNG() });
  }
  return image;
}
