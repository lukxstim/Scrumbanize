import type { MenuItemConstructorOptions } from 'electron';
import { describe, expect, it } from 'vitest';
import { macMenuTemplate } from '../src/macMenu.js';

const roles = (menu: MenuItemConstructorOptions) => (menu.submenu as MenuItemConstructorOptions[]).map((item) => item.role).filter(Boolean);

describe('macMenuTemplate', () => {
  const [appMenu, edit, window] = macMenuTemplate('Scrumbanize');

  it('has an Edit menu, without which copy and paste do not work in text fields on a Mac', () => {
    expect(edit!.label).toBe('Bearbeiten');
    expect(roles(edit!)).toEqual(expect.arrayContaining(['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll']));
  });

  it('quits from the app menu (⌘Q) and closes the window from the window menu (⌘W)', () => {
    expect(appMenu!.label).toBe('Scrumbanize');
    expect(roles(appMenu!)).toContain('quit');
    expect((appMenu!.submenu as MenuItemConstructorOptions[]).find((i) => i.role === 'quit')!.label).toBe('Scrumbanize beenden');
    expect(roles(window!)).toEqual(expect.arrayContaining(['minimize', 'close']));
  });
});
