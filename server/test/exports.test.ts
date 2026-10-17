import { describe, expect, it } from 'vitest';
import { attachmentDisposition, boardToCsv, germanDate, noteToHtml, noteToMarkdown, safeFileName, uniqueNames } from '../src/exports.js';
import type { Task } from '../src/repositories/tasksRepository.js';

const note = {
  title: 'Plan: Q4 / 2026',
  content: '## Ziele\n\n- [x] Fertig\n- Offen <mark data-color="green">wichtig</mark>\n\n<script>alert(1)</script>\n\n[Doku](https://example.com) [böse](javascript:alert(1))',
  tags: ['planung', 'team'],
  createdAt: '2026-10-01T08:00:00.000Z',
  updatedAt: '2026-10-17T09:30:00.000Z',
};

describe('file names', () => {
  it('removes characters file systems reject and makes names unique', () => {
    expect(safeFileName('Plan: Q4 / 2026?')).toBe('Plan Q4 2026');
    expect(safeFileName('  ')).toBe('Unbenannte Notiz');
    expect(safeFileName('..versteckt')).toBe('versteckt');
    expect(uniqueNames(['Plan', 'plan', 'Plan', 'Idee'])).toEqual(['Plan', 'plan (2)', 'Plan (3)', 'Idee']);
  });

  it('builds a download header for any name', () => {
    expect(attachmentDisposition('Ärger "neu".md')).toBe(
      `attachment; filename="_rger _neu_.md"; filename*=UTF-8''%C3%84rger%20%22neu%22.md`,
    );
  });
});

describe('noteToMarkdown', () => {
  it('writes front matter, the title and the content', () => {
    expect(noteToMarkdown(note)).toBe(
      [
        '---',
        'title: "Plan: Q4 / 2026"',
        'tags:',
        '  - "planung"',
        '  - "team"',
        'created: 2026-10-01T08:00:00.000Z',
        'updated: 2026-10-17T09:30:00.000Z',
        '---',
        '',
        '# Plan: Q4 / 2026',
        '',
        note.content,
        '',
      ].join('\n'),
    );
  });

  it('lists exported attachments with relative links', () => {
    const md = noteToMarkdown({ ...note, tags: [], content: '', files: [{ name: 'Foto 1.png', href: 'Anhänge/Plan/Foto 1.png' }] });
    expect(md).toContain('# Plan: Q4 / 2026\n\n## Anhänge\n\n- [Foto 1.png](<Anhänge/Plan/Foto 1.png>)\n');
    expect(md).not.toContain('tags:');
  });
});

describe('noteToHtml', () => {
  const html = noteToHtml(note);

  it('renders a standalone page with the note', () => {
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain('<title>Plan: Q4 / 2026</title>');
    expect(html).toContain('<h2>Ziele</h2>');
    expect(html).toContain('<input checked="" disabled="" type="checkbox">');
    expect(html).toContain('#planung #team');
    expect(html).toContain('<a href="https://example.com">Doku</a>');
  });

  it('keeps highlights but no scripts or unsafe links', () => {
    expect(html).toContain('<mark>wichtig</mark>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('javascript:');
  });
});

describe('boardToCsv', () => {
  const task = (overrides: Partial<Task>): Task => ({
    id: 1,
    projectId: 1,
    columnId: 10,
    laneId: 100,
    title: 'Aufgabe',
    description: '',
    position: 1,
    sourceNote: null,
    priority: null,
    links: [],
    attachments: [],
    startDate: null,
    dueDate: null,
    createdAt: '2026-10-01T22:30:00.000Z',
    updatedAt: '2026-10-02T08:00:00.000Z',
    ...overrides,
  });

  it('writes German Excel CSV: BOM, semicolons, quoting, TT.MM.JJJJ, CRLF', () => {
    const csv = boardToCsv(
      [
        task({
          title: 'Angebot; "final"',
          description: 'Zeile 1\nZeile 2',
          priority: 'high',
          startDate: '2026-10-05',
          dueDate: '2026-10-09',
          sourceNote: { id: 3, title: 'Meeting', tags: [] },
          links: [
            { id: 1, kind: 'blocked_by', task: { id: 7, title: 'Freigabe', columnId: 10, columnName: 'To Do', done: false } },
            { id: 2, kind: 'relates', task: { id: 8, title: 'Mail', columnId: 11, columnName: 'Done', done: true } },
          ],
        }),
        task({ id: 2, columnId: 11, title: 'Fertig' }),
      ],
      [
        { id: 10, name: 'To Do' },
        { id: 11, name: 'Done' },
      ],
      [{ id: 100, name: 'Standard' }],
    );
    const lines = csv.split('\r\n');
    expect(csv.startsWith('﻿ID;Titel;Spalte;Lane;Erledigt;Priorität;Start;Fällig;Erstellt;Aktualisiert;')).toBe(true);
    // Created 22:30 UTC is already the next day in Germany.
    // The line break inside the description stays inside its quotes.
    expect(lines[1]).toBe(
      '1;"Angebot; ""final""";To Do;Standard;nein;Hoch;05.10.2026;09.10.2026;02.10.2026;02.10.2026;Meeting;#7 Freigabe;;#8 Mail;;"Zeile 1\nZeile 2"',
    );
    expect(lines[2]).toBe('2;Fertig;Done;Standard;ja;;;;02.10.2026;02.10.2026;;;;;;');
    expect(csv.endsWith('\r\n')).toBe(true);
  });

  it('formats dates the German way', () => {
    expect(germanDate('2026-03-07')).toBe('07.03.2026');
    expect(germanDate(null)).toBe('');
  });
});
