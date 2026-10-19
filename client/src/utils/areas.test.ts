import { afterEach, describe, expect, it, vi } from 'vitest';
import { lastAreaPath, rememberAreaPath } from './areas';

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
