import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadStickyState, saveStickyState, STICKY_SIZE, stickyBounds } from '../src/stickyState.js';

const dirs: string[] = [];
const tempDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sticky-'));
  dirs.push(dir);
  return dir;
};
afterEach(() => dirs.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

const screen = { x: 0, y: 0, width: 1920, height: 1040 };

describe('sticky note state', () => {
  it('saves and loads positions and open notes, dropping what is broken', () => {
    const dir = tempDir();
    expect(loadStickyState(dir)).toEqual({ bounds: {}, open: [] });
    saveStickyState(dir, { bounds: { '4': { x: 10, y: 20, width: 300, height: 320 } }, open: [4, 7] });
    expect(loadStickyState(dir)).toEqual({ bounds: { '4': { x: 10, y: 20, width: 300, height: 320 } }, open: [4, 7] });

    fs.writeFileSync(path.join(dir, 'sticky-notes.json'), JSON.stringify({ bounds: { '1': { x: 1 } }, open: [3, 3, 'x', -1] }));
    expect(loadStickyState(dir)).toEqual({ bounds: {}, open: [3] });
  });
});

describe('stickyBounds', () => {
  it('keeps a saved place that is still on a screen', () => {
    const saved = { x: 100, y: 100, width: 260, height: 240 };
    expect(stickyBounds(saved, [screen], 0)).toEqual(saved);
  });

  it('opens new notes at the top right, each a bit further down, and saved places off screen there, too', () => {
    expect(stickyBounds(undefined, [screen], 0)).toEqual({ x: 1920 - STICKY_SIZE.width - 24, y: 24, ...STICKY_SIZE });
    expect(stickyBounds(undefined, [screen], 1)).toMatchObject({ x: 1920 - STICKY_SIZE.width - 24 - 32, y: 56 });
    expect(stickyBounds({ x: 3000, y: 100, width: 300, height: 300 }, [screen], 0)).toMatchObject({ y: 24 });
  });
});
