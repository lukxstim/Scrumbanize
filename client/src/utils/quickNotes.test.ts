import { describe, expect, it } from 'vitest';
import type { Note } from '../types/note';
import { fromQuickText, previewLines, quickCards, quickText } from './quickNotes';

const note = (id: number, title: string, content: string, updatedAt: string): Note => ({
  id,
  projectId: 1,
  folderId: null,
  position: null,
  title,
  content,
  tags: [],
  tasks: [],
  attachments: [],
  createdAt: updatedAt,
  updatedAt,
});

describe('quick note text', () => {
  it('keeps the first line as title and the rest as content, both ways', () => {
    expect(fromQuickText('Kelker\n- Einsetzen\n- Einschalten', ['x'])).toEqual({ title: 'Kelker', content: '- Einsetzen\n- Einschalten', tags: ['x'] });
    expect(fromQuickText('Nur eine Zeile  ')).toEqual({ title: 'Nur eine Zeile', content: '', tags: [] });
    expect(quickText({ title: 'Kelker', content: '- Einsetzen' })).toBe('Kelker\n- Einsetzen');
    expect(quickText({ title: 'Allein', content: '' })).toBe('Allein');
  });

  it('moves the end of an overly long first line into the content', () => {
    const input = fromQuickText(`${'a'.repeat(210)}\nweiter`);
    expect(input.title).toHaveLength(200);
    expect(input.content).toBe('aaaaaaaaaa\nweiter');
  });
});

describe('previewLines', () => {
  it('shows list items as bullets and drops Markdown marks', () => {
    expect(previewLines('- **Skala:** 1-6\n1. Start\n- [ ] Offen\n## Teil\n[Link](note:3)\n\n---')).toEqual([
      { text: 'Skala: 1-6', bullet: true },
      { text: 'Start', bullet: true },
      { text: 'Offen', bullet: true },
      { text: 'Teil', bullet: false },
      { text: 'Link', bullet: false },
    ]);
    expect(previewLines('a\nb\nc', 2)).toHaveLength(2);
  });
});

describe('quickCards', () => {
  it('finds every word anywhere, newest first', () => {
    const notes = [note(1, 'Kelker', '- Port Security', '2026-10-15'), note(2, 'Petri-Netze', 'unwichtig', '2026-10-20')];
    expect(quickCards(notes, '').map((n) => n.id)).toEqual([2, 1]);
    expect(quickCards(notes, 'security kelker').map((n) => n.id)).toEqual([1]);
  });
});
