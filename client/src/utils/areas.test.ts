import { afterEach, describe, expect, it, vi } from 'vitest';
import { areaTarget, lastAreaPath, rememberAreaPath } from './areas';

describe('areaTarget', () => {
  const projects = [
    { id: 1, kind: 'project' as const },
    { id: 3, kind: 'notebook' as const },
  ];

  it('goes back to the last page while it still belongs to the area', () => {
    expect(areaTarget('projects', '/p/1/board', projects)).toBe('/p/1/board');
    expect(areaTarget('knowledge', '/p/3/notes/7', projects)).toBe('/p/3/notes/7');
    expect(areaTarget('knowledge', '/wissen/notizen/7?tag=rezept', projects)).toBe('/wissen/notizen/7?tag=rezept');
    expect(areaTarget('knowledge', '/wissen', projects)).toBe('/wissen');
  });

  it('opens the start of the area when the last page is gone or of the other kind', () => {
    // A deleted notebook must not lead into a project (the redirect for unknown projects would).
    expect(areaTarget('knowledge', '/p/9/notes', projects)).toBe('/wissen');
    expect(areaTarget('knowledge', '/p/1/notes', projects)).toBe('/wissen');
    expect(areaTarget('projects', '/p/3/notes', projects)).toBe('/');
    expect(areaTarget('projects', '/p/12', projects)).toBe('/');
    expect(areaTarget('knowledge', '/wissenschaft', projects)).toBe('/wissen');
    expect(areaTarget('projects', null, projects)).toBe('/');
    expect(areaTarget('knowledge', null, projects)).toBe('/wissen');
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubStorage() {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  });
  return data;
}

describe('area paths', () => {
  it('remembers the last page per area', () => {
    stubStorage();
    expect(lastAreaPath('projects')).toBeNull();
    rememberAreaPath('projects', '/p/1/board');
    rememberAreaPath('knowledge', '/wissen?tag=rezept');
    expect(lastAreaPath('projects')).toBe('/p/1/board');
    expect(lastAreaPath('knowledge')).toBe('/wissen?tag=rezept');
  });

  it('ignores stored values that are no app path, and missing storage', () => {
    stubStorage().set('scrumbanize.lastPath.projects', 'https://example.com');
    expect(lastAreaPath('projects')).toBeNull();
    vi.stubGlobal('localStorage', undefined);
    expect(lastAreaPath('knowledge')).toBeNull();
    expect(() => rememberAreaPath('knowledge', '/wissen')).not.toThrow();
  });
});
