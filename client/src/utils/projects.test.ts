import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '../types/project';
import { countLabel, defaultProject, getLastProjectId, setLastProjectId, sortProjects } from './projects';

function project(id: number, name: string): Project {
  return { id, name, color: 'slate', noteCount: 0, taskCount: 0, createdAt: '', updatedAt: '' };
}

const names = (projects: Project[]) => projects.map((p) => p.name);

describe('sortProjects', () => {
  it('sorts alphabetically, ignoring case and treating umlauts like German', () => {
    expect(names(sortProjects([project(1, 'studium'), project(2, 'Ärger'), project(3, 'Allgemein'), project(4, 'Zoo')]))).toEqual([
      'Allgemein',
      'Ärger',
      'studium',
      'Zoo',
    ]);
  });
});

describe('countLabel', () => {
  it('uses the singular only for one', () => {
    expect(countLabel(1, 'Notiz', 'Notizen')).toBe('1 Notiz');
    expect(countLabel(0, 'Notiz', 'Notizen')).toBe('0 Notizen');
    expect(countLabel(12, 'Task', 'Tasks')).toBe('12 Tasks');
  });
});

describe('last project', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const projects = [project(1, 'Allgemein'), project(5, 'Studium')];

  it('opens the last used project', () => {
    setLastProjectId(5);
    expect(getLastProjectId()).toBe(5);
    expect(defaultProject(projects)?.id).toBe(5);
  });

  it('opens the sample project on the first start, but the last used one afterwards', () => {
    expect(defaultProject(projects, 5)?.id).toBe(5);
    expect(defaultProject(projects, 99)?.id).toBe(1); // sample project deleted
    setLastProjectId(1);
    expect(defaultProject(projects, 5)?.id).toBe(1);
  });

  it('falls back to the first project if the last one is gone or unknown', () => {
    expect(defaultProject(projects)?.id).toBe(1);
    setLastProjectId(99);
    expect(defaultProject(projects)?.id).toBe(1);
  });

  it('copes with unavailable storage', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(() => setLastProjectId(5)).not.toThrow();
    expect(getLastProjectId()).toBeNull();
    expect(defaultProject(projects)?.id).toBe(1);
  });
});
