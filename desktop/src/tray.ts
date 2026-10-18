import { Menu, nativeImage, Tray } from 'electron';

export interface TrayActions {
  open: () => void;
  checkReminders: () => void;
  quit: () => void;
}

/**
 * The icon in the notification area next to the clock (US-18): a click shows the window, the menu also checks
 * the reminders or quits. It is there while the app runs, so a window hidden at login can always be opened.
 */
export function createTray(iconFile: string, actions: TrayActions): Tray {
  const tray = new Tray(trayImage(iconFile));
  tray.setToolTip('Scrumbanize');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Scrumbanize öffnen', click: actions.open },
      { label: 'Erinnerungen jetzt prüfen', click: actions.checkReminders },
      { type: 'separator' },
      { label: 'Beenden', click: actions.quit },
    ]),
  );
  tray.on('click', actions.open);
  return tray;
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
