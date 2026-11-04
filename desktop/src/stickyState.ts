import fs from 'node:fs';
import path from 'node:path';
import type { Rectangle } from 'electron';

const FILE_NAME = 'sticky-notes.json';
export const STICKY_SIZE = { width: 300, height: 320 };
export const STICKY_MIN_SIZE = { width: 200, height: 160 };

/**
 * The sticky notes of the desktop app (US-26): where each note's window was, and which were open when the app was
 * quit, so they come back pinned at the next start.
 */
export interface StickyState {
  bounds: Record<string, Rectangle>;
  open: number[];
}

const isRect = (value: unknown): value is Rectangle =>
  typeof value === 'object' &&
  value !== null &&
  ['x', 'y', 'width', 'height'].every((key) => typeof (value as Record<string, unknown>)[key] === 'number');

export function loadStickyState(dir: string): StickyState {
  try {
    const saved = JSON.parse(fs.readFileSync(path.join(dir, FILE_NAME), 'utf8')) as Partial<StickyState>;
    const bounds = Object.fromEntries(Object.entries(saved.bounds ?? {}).filter(([, rect]) => isRect(rect)));
    const open = Array.isArray(saved.open) ? saved.open.filter((id): id is number => Number.isInteger(id) && id > 0) : [];
    return { bounds, open: [...new Set(open)] };
  } catch {
    return { bounds: {}, open: [] };
  }
}

export function saveStickyState(dir: string, state: StickyState): void {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, FILE_NAME), JSON.stringify(state));
  } catch {
    // Not remembering the sticky notes is fine.
  }
}

/**
 * Where a note's window opens: where it was, if that is still on a screen; otherwise near the top right of the
 * primary screen, a little further down for every note already open, so new ones do not cover each other.
 */
export function stickyBounds(saved: Rectangle | undefined, workAreas: Rectangle[], alreadyOpen: number): Rectangle {
  const fits = (rect: Rectangle) =>
    workAreas.some((area) => rect.x >= area.x - 20 && rect.y >= area.y - 10 && rect.x + 60 <= area.x + area.width && rect.y + 40 <= area.y + area.height);
  if (saved && saved.width >= STICKY_MIN_SIZE.width && saved.height >= STICKY_MIN_SIZE.height && fits(saved)) return saved;
  const area = workAreas[0] ?? { x: 0, y: 0, width: 1280, height: 800 };
  const step = (alreadyOpen % 8) * 32;
  return {
    x: area.x + area.width - STICKY_SIZE.width - 24 - step,
    y: area.y + 24 + step,
    ...STICKY_SIZE,
  };
}
