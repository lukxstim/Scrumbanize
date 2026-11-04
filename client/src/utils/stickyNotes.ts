import { desktopBridge } from '../hooks/useDesktopSettings';

/**
 * Sticky notes (US-26): a note as a small window that stays in front of everything. The desktop app opens a frameless
 * window of its own; Chrome and Edge a Document Picture-in-Picture window, whose content this tab renders
 * (StickyPipHost). Elsewhere there are none, and the button is not shown.
 */
export type StickySupport = 'desktop' | 'pip' | null;

interface DocumentPictureInPicture {
  requestWindow: (options: { width: number; height: number }) => Promise<Window>;
}

const pictureInPicture = (): DocumentPictureInPicture | undefined =>
  (window as unknown as { documentPictureInPicture?: DocumentPictureInPicture }).documentPictureInPicture;

export function stickySupport(): StickySupport {
  if (desktopBridge?.openSticky) return 'desktop';
  return pictureInPicture() ? 'pip' : null;
}

/** The note shown in this tab's Picture-in-Picture window; one at a time, as the browser allows. */
export interface PipSticky {
  window: Window;
  noteId: number;
}

let pip: PipSticky | null = null;
const listeners = new Set<() => void>();
const setPip = (next: PipSticky | null) => {
  pip = next;
  listeners.forEach((listener) => listener());
};

export const pipSticky = {
  get: () => pip,
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

/** The page's styles and theme in the Picture-in-Picture window, so the note looks as in the app. */
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

/** Opens the note as a sticky note; must run on a click (the browser asks for a user gesture). */
export async function openStickyNote(noteId: number): Promise<void> {
  if (desktopBridge?.openSticky) {
    await desktopBridge.openSticky(noteId);
    return;
  }
  const api = pictureInPicture();
  if (!api) return;
  const next = await api.requestWindow({ width: 320, height: 340 });
  copyStyles(next.document);
  next.document.title = 'Sticky Note';
  next.document.body.className = 'm-0 h-screen overflow-hidden';
  next.addEventListener('pagehide', () => {
    if (pip?.window === next) setPip(null);
  });
  setPip({ window: next, noteId });
}
