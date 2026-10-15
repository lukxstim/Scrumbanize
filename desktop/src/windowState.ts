import fs from 'node:fs';
import path from 'node:path';
import type { BrowserWindow, Rectangle } from 'electron';

const FILE_NAME = 'window-state.json';
const DEFAULT_SIZE = { width: 1280, height: 820 };

export interface WindowState {
  /** Without x/y the window is centred. */
  bounds: Partial<Rectangle> & { width: number; height: number };
  maximized: boolean;
}

/**
 * The last window size and position, if it still fits on one of the screens (a monitor may have been
 * disconnected since); otherwise a centred default window.
 */
export function loadWindowState(dir: string, displays: { workArea: Rectangle }[]): WindowState {
  try {
    const saved = JSON.parse(fs.readFileSync(path.join(dir, FILE_NAME), 'utf8')) as Partial<WindowState>;
    const bounds = saved.bounds;
    if (
      bounds &&
      typeof bounds.x === 'number' &&
      typeof bounds.y === 'number' &&
      bounds.width >= 400 &&
      bounds.height >= 300 &&
      displays.some(({ workArea: area }) => isMostlyInside(bounds as Rectangle, area))
    ) {
      return { bounds: bounds as Rectangle, maximized: saved.maximized === true };
    }
    return { bounds: DEFAULT_SIZE, maximized: saved.maximized === true };
  } catch {
    return { bounds: DEFAULT_SIZE, maximized: false };
  }
}

/** At least the top-left 100×50 pixels (the title bar) are on the screen. */
function isMostlyInside(bounds: Rectangle, area: Rectangle): boolean {
  return (
    bounds.x >= area.x - 50 &&
    bounds.y >= area.y - 10 &&
    bounds.x + 100 <= area.x + area.width &&
    bounds.y + 50 <= area.y + area.height
  );
}

/** Saves size, position and maximised state when the window is closed. */
export function trackWindowState(window: BrowserWindow, dir: string): void {
  window.on('close', () => {
    const state: WindowState = { bounds: window.getNormalBounds(), maximized: window.isMaximized() };
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, FILE_NAME), JSON.stringify(state));
    } catch {
      // Not remembering the window is fine.
    }
  });
}
