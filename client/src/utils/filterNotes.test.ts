import { describe, expect, it } from 'vitest';
import type { Note } from '../types/note';
import { filterNotes, sortByUpdated } from './filterNotes';
import { countTags, normalizeTag } from './tags';

function note(id: number, title: string, content: string, tags: string[], updatedAt = '2026-01-01T00:00:00.000Z'): Note {
  return { id, projectId: 1, folderId: null, position: null, title, content, tags, tasks: [], attachments: [], createdAt: updatedAt, updatedAt };
}

const notes = [
  note(1, 'Sprint Review', 'Demo des Boards', ['arbeit', 'meeting']),
  note(2, 'Einkaufsliste', 'Hafermilch, Äpfel', ['privat']),
  note(3, 'Retro', 'Was lief gut?', ['arbeit']),
];

const ids = (result: Note[]) => result.map((n) => n.id);

describe('filterNotes', () => {
  it('returns all notes without query or tags', () => {
    expect(ids(filterNotes(notes, '  ', []))).toEqual([1, 2, 3]);
  });

  it('matches title, content and tags case-insensitively', () => {
    expect(ids(filterNotes(notes, 'review', []))).toEqual([1]);
    expect(ids(filterNotes(notes, 'äpfel', []))).toEqual([2]);
    expect(ids(filterNotes(notes, 'MEET', []))).toEqual([1]);
  });

  it('requires every word of the query', () => {
    expect(ids(filterNotes(notes, 'arbeit gut', []))).toEqual([3]);
    expect(ids(filterNotes(notes, 'arbeit milch', []))).toEqual([]);
  });

  it('requires every selected tag', () => {
    expect(ids(filterNotes(notes, '', ['arbeit']))).toEqual([1, 3]);
    expect(ids(filterNotes(notes, '', ['arbeit', 'meeting']))).toEqual([1]);
    expect(ids(filterNotes(notes, 'retro', ['arbeit', 'meeting']))).toEqual([]);
  });
});

describe('sortByUpdated', () => {
  it('puts the most recently updated note first', () => {
    const sorted = sortByUpdated([note(1, 'a', '', [], '2026-01-01T00:00:00.000Z'), note(2, 'b', '', [], '2026-02-01T00:00:00.000Z')]);
    expect(ids(sorted)).toEqual([2, 1]);
  });
});

describe('tags', () => {
  it('normalizes like the server', () => {
    expect(normalizeTag('  Q3,  Planning ')).toBe('q3 planning');
    expect(normalizeTag('x'.repeat(40))).toHaveLength(32);
    expect(normalizeTag(' , ')).toBe('');
  });

  it('counts tag usage sorted by name', () => {
    expect(countTags(notes)).toEqual([
      { name: 'arbeit', count: 2 },
      { name: 'meeting', count: 1 },
      { name: 'privat', count: 1 },
    ]);
  });
});
