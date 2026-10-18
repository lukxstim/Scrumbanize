import { describe, expect, it } from 'vitest';
import { findLinkTrigger, insertLinkAt, linkMarkdown, parseContentHref, resolvedPath } from './contentLinks';

describe('content links', () => {
  it('reads note: and task: addresses only', () => {
    expect(parseContentHref('note:42')).toEqual({ type: 'note', id: 42 });
    expect(parseContentHref('task:7')).toEqual({ type: 'task', id: 7 });
    expect(parseContentHref('https://note:42')).toBeNull();
    expect(parseContentHref('note:abc')).toBeNull();
    expect(parseContentHref(undefined)).toBeNull();
  });

  it('writes links with escaped text', () => {
    expect(linkMarkdown({ type: 'note', id: 3 }, 'Plan [v2]')).toBe('[Plan \\[v2\\]](note:3)');
    expect(linkMarkdown({ type: 'task', id: 9 }, '  ')).toBe('[Task #9](task:9)');
    expect(linkMarkdown({ type: 'note', id: 1 }, '')).toBe('[Unbenannte Notiz](note:1)');
  });

  it('finds an open [[ before the caret', () => {
    expect(findLinkTrigger('Siehe [[Pas', 11)).toEqual({ start: 6, query: 'Pas' });
    expect(findLinkTrigger('[[', 2)).toEqual({ start: 0, query: '' });
    expect(findLinkTrigger('[[Pasta]] und', 13)).toBeNull();
    expect(findLinkTrigger('[[Zeile\nneu', 11)).toBeNull();
  });

  it('replaces the trigger with the link', () => {
    const text = 'Siehe [[Pas und mehr';
    expect(insertLinkAt(text, { start: 6 }, 11, { type: 'note', id: 5 }, 'Pasta')).toEqual({
      text: 'Siehe [Pasta](note:5) und mehr',
      caret: 21,
    });
  });

  it('opens notes and tasks in their own project', () => {
    const place = { projectId: 4, projectName: 'Rezepte', projectKind: 'notebook' as const, status: 'ok' as const, title: 'X' };
    expect(resolvedPath({ type: 'note', id: 2, ...place })).toBe('/p/4/notes/2');
    expect(resolvedPath({ type: 'task', id: 3, ...place })).toBe('/p/4/tasks/3');
  });
});
