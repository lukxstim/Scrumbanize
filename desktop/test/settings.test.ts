import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_HOTKEY, isValidAccelerator } from '../src/hotkey.js';
import { DEFAULT_SETTINGS, loadSettings, parseSettings, saveSettings } from '../src/settings.js';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scrumbanize-desktop-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('desktop settings', () => {
  it('start with notifications on and the window closing as usual', () => {
    expect(loadSettings(dir)).toEqual({
      closeToTray: false,
      minimizeToTray: false,
      notifications: true,
      hotkey: 'CommandOrControl+Shift+Space',
      trayHintShown: false,
    });
  });

  it('are saved and loaded again', () => {
    const settings = { ...DEFAULT_SETTINGS, closeToTray: true, notifications: false, hotkey: 'Alt+Shift+S' };
    saveSettings(dir, settings);
    expect(loadSettings(dir)).toEqual(settings);
  });

  it('keep the valid fields of a damaged or older file', () => {
    expect(parseSettings({ closeToTray: true, minimizeToTray: 'yes', hotkey: 'Shift+A', extra: 1 })).toEqual({
      ...DEFAULT_SETTINGS,
      closeToTray: true,
    });
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    fs.writeFileSync(path.join(dir, 'desktop-settings.json'), '{not json');
    expect(loadSettings(dir)).toEqual(DEFAULT_SETTINGS);
  });
});

describe('isValidAccelerator', () => {
  it('accepts shortcuts with Ctrl or Alt and one key', () => {
    for (const accelerator of [
      DEFAULT_HOTKEY,
      'CommandOrControl+K',
      'Alt+F4',
      'CommandOrControl+Alt+Shift+9',
      'Alt+Shift+Up',
      'CommandOrControl+F24',
      // On a Mac, ⌃ (Control) is a key of its own besides ⌘ (CommandOrControl).
      'Control+Space',
      'CommandOrControl+Control+Shift+S',
    ]) {
      expect(isValidAccelerator(accelerator), accelerator).toBe(true);
    }
  });

  it('rejects shortcuts that would take a key from typing, and malformed ones', () => {
    for (const accelerator of [
      'A',
      'Space',
      'Shift+A',
      'CommandOrControl',
      'CommandOrControl+Shift',
      'Shift+CommandOrControl+A',
      'Control+CommandOrControl+A',
      'Shift+Control',
      'CommandOrControl+CommandOrControl+A',
      'Ctrl+A',
      'Super+A',
      'CommandOrControl+a',
      'CommandOrControl+F25',
      'CommandOrControl+Plus',
      '',
    ]) {
      expect(isValidAccelerator(accelerator), accelerator).toBe(false);
    }
  });
});
