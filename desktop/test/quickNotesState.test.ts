import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { dockedBounds, loadQuickNotesState, QUICK_NOTES_WIDTH, saveQuickNotesState } from '../src/quickNotesState.js';

const dirs: string[] = [];
const tempDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quick-'));
  dirs.push(dir);
  return dir;
};
afterEach(() => dirs.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

describe('quick notes panel state', () => {
  it('saves and loads whether it is open and its width, within limits', () => {
    const dir = tempDir();
    expect(loadQuickNotesState(dir)).toEqual({ open: false, width: QUICK_NOTES_WIDTH.default });
    saveQuickNotesState(dir, { open: true, width: 400 });
    expect(loadQuickNotesState(dir)).toEqual({ open: true, width: 400 });
    fs.writeFileSync(path.join(dir, 'quick-notes.json'), JSON.stringify({ open: 'yes', width: 5000 }));
    expect(loadQuickNotesState(dir)).toEqual({ open: false, width: QUICK_NOTES_WIDTH.max });
  });
});

describe('dockedBounds', () => {
  it('docks to the right edge over the full height of the work area', () => {
    expect(dockedBounds({ x: 0, y: 0, width: 1920, height: 1040 }, 340)).toEqual({ x: 1580, y: 0, width: 340, height: 1040 });
    // A second screen left of the first, with the taskbar at the top.
    expect(dockedBounds({ x: -1280, y: 40, width: 1280, height: 984 }, 100)).toEqual({ x: -1280 + 1280 - 260, y: 40, width: 260, height: 984 });
  });
});
