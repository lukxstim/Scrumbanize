import { describe, expect, it } from 'vitest';
import type { Note } from '../types/note';
import { fromQuickMarkdown, quickCards, quickColorOf, quickMarkdown } from './quickNotes';

const note = (id: number, title: string, content: string, updatedAt: string): Note => ({
  id,
  projectId: 1,
  folderId: null,
  position: null,
  color: null,
  title,
  content,
  tags: [],
  tasks: [],
  attachments: [],
  createdAt: updatedAt,
  updatedAt,
});

describe('quick note Markdown', () => {
  it('keeps the first paragraph as title and the rest as content, both ways', () => {
    expect(fromQuickMarkdown('Kelker\n\n- Einsetzen\n- Einschalten', ['x'])).toEqual({ title: 'Kelker', content: '- Einsetzen\n- Einschalten', tags: ['x'] });
    expect(fromQuickMarkdown('Nur eine Zeile  ')).toEqual({ title: 'Nur eine Zeile', content: '', tags: [] });
    expect(quickMarkdown({ title: 'Kelker', content: '- Einsetzen' })).toBe('Kelker\n\n- Einsetzen');
    expect(quickMarkdown({ title: 'Allein', content: '' })).toBe('Allein');
    expect(quickMarkdown({ title: '', content: '- [ ] a' })).toBe('- [ ] a');
  });

  it('takes the title as plain text, without its formatting', () => {
    expect(fromQuickMarkdown('**Wichtig:** *heute* ~~nicht~~ <mark data-color="yellow">gelb</mark>\n\nRest').title).toBe('Wichtig: heute nicht gelb');
    expect(fromQuickMarkdown('## Überschrift').title).toBe('Überschrift');
    expect(fromQuickMarkdown('Erste\\\nzweite Zeile')).toEqual({ title: 'Erste', content: 'zweite Zeile', tags: [] });
  });

  it('escapes a title, so it comes back as typed', () => {
    for (const title of ['5 * 3 = 15', '- kein Punkt', '# keine Überschrift', 'snake_case [x]', 'C:\\Pfad']) {
      expect(fromQuickMarkdown(quickMarkdown({ title, content: 'x' })).title).toBe(title);
    }
  });

  it('gives a card that starts with a list no title', () => {
    expect(fromQuickMarkdown('- [ ] Milch\n- [x] Brot')).toEqual({ title: '', content: '- [ ] Milch\n- [x] Brot', tags: [] });
    expect(fromQuickMarkdown('1. eins')).toEqual({ title: '', content: '1. eins', tags: [] });
  });

  it('moves the end of an overly long first line into the content', () => {
    const input = fromQuickMarkdown(`${'a'.repeat(210)}\n\nweiter`);
    expect(input.title).toHaveLength(200);
    expect(input.content).toBe('aaaaaaaaaa\n\nweiter');
  });
});

describe('quickColorOf', () => {
  it('takes the own color, else one from the id', () => {
    expect(quickColorOf({ id: 7, color: 'blue' })).toBe('blue');
    expect(quickColorOf({ id: 1, color: null })).toBe('green');
    expect(quickColorOf(null)).toBe('yellow');
  });
});

describe('quickCards', () => {
  it('finds every word anywhere, newest first', () => {
    const notes = [note(1, 'Kelker', '- Port Security', '2026-10-15'), note(2, 'Petri-Netze', 'unwichtig', '2026-10-20')];
    expect(quickCards(notes, '').map((n) => n.id)).toEqual([2, 1]);
    expect(quickCards(notes, 'security kelker').map((n) => n.id)).toEqual([1]);
  });
});
