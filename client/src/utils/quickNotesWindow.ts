import { desktopBridge } from '../hooks/useDesktopSettings';

/**
 * Where the quick notes (US-26) open: the desktop app docks a frameless panel of its own to the right edge of the
 * screen; Chrome and Edge open a Document Picture-in-Picture window, whose content this tab renders
 * (QuickNotesPipHost). Elsewhere there are none, and the button is not shown.
 */
interface DocumentPictureInPicture {
  requestWindow: (options: { width: number; height: number }) => Promise<Window>;
}

const pictureInPicture = (): DocumentPictureInPicture | undefined =>
  (window as unknown as { documentPictureInPicture?: DocumentPictureInPicture }).documentPictureInPicture;

export const quickNotesAvailable = (): boolean => Boolean(desktopBridge?.openQuickNotes || pictureInPicture());

/** This tab's Picture-in-Picture window with the quick notes; one at a time, as the browser allows. */
let pip: Window | null = null;
const listeners = new Set<() => void>();
const setPip = (next: Window | null) => {
  pip = next;
  listeners.forEach((listener) => listener());
};

export const quickNotesPip = {
  get: () => pip,
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

/** The page's styles and theme in the Picture-in-Picture window, so the panel looks as in the app. */
function copyStyles(target: Document) {
  for (const sheet of [...document.styleSheets]) {
    try {
      const style = target.createElement('style');
      style.textContent = [...sheet.cssRules].map((rule) => rule.cssText).join('\n');
      target.head.append(style);
    } catch {
      // A stylesheet of another origin cannot be read: link it instead.
      if (sheet.href) {
        const link = target.createElement('link');
        link.rel = 'stylesheet';
        link.href = sheet.href;
        target.head.append(link);
      }
    }
  }
  const theme = document.documentElement.getAttribute('data-theme');
  if (theme) target.documentElement.setAttribute('data-theme', theme);
}

/** Opens the quick notes; must run on a click (the browser opens Picture-in-Picture only for a user gesture). */
export async function openQuickNotes(): Promise<void> {
  if (desktopBridge?.openQuickNotes) {
    await desktopBridge.openQuickNotes();
    return;
  }
  if (pip && !pip.closed) {
    pip.focus();
    return;
  }
  const api = pictureInPicture();
  if (!api) return;
  const next = await api.requestWindow({ width: 360, height: Math.min(900, window.screen.availHeight) });
  copyStyles(next.document);
  next.document.title = 'Kurznotizen';
  next.document.body.className = 'm-0 h-screen overflow-hidden bg-canvas';
  next.addEventListener('pagehide', () => {
    if (pip === next) setPip(null);
  });
  setPip(next);
}
