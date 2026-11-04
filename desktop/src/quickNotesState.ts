import fs from 'node:fs';
import path from 'node:path';
import type { Rectangle } from 'electron';

const FILE_NAME = 'quick-notes.json';
export const QUICK_NOTES_WIDTH = { min: 260, default: 340, max: 640 };

/**
 * The quick notes panel of the desktop app (US-26): docked to the right edge of the screen over its full height, with
 * the width it was given; open again at the next start if it was open when the app was quit.
 */
export interface QuickNotesState {
  open: boolean;
  width: number;
}

const clampWidth = (width: number) => Math.round(Math.min(QUICK_NOTES_WIDTH.max, Math.max(QUICK_NOTES_WIDTH.min, width)));

export function loadQuickNotesState(dir: string): QuickNotesState {
  try {
    const saved = JSON.parse(fs.readFileSync(path.join(dir, FILE_NAME), 'utf8')) as Partial<QuickNotesState>;
    return {
      open: saved.open === true,
      width: typeof saved.width === 'number' && Number.isFinite(saved.width) ? clampWidth(saved.width) : QUICK_NOTES_WIDTH.default,
    };
  } catch {
    return { open: false, width: QUICK_NOTES_WIDTH.default };
  }
}

export function saveQuickNotesState(dir: string, state: QuickNotesState): void {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, FILE_NAME), JSON.stringify(state));
  } catch {
    // Not remembering the panel is fine.
  }
}

/** The panel's place: at the right edge of the screen's work area (without the taskbar), over its full height. */
export function dockedBounds(workArea: Rectangle, width: number): Rectangle {
  const w = Math.min(clampWidth(width), workArea.width);
  return { x: workArea.x + workArea.width - w, y: workArea.y, width: w, height: workArea.height };
}
