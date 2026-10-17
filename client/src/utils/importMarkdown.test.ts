import { describe, expect, it } from 'vitest';
import {
  batchNotes,
  classifyFiles,
  DEFAULT_IMPORT_OPTIONS,
  commonRootFolder,
  parseDate,
  parseFrontMatter,
  parseMarkdownNote,
  titleFromPath,
} from './importMarkdown';

const noOptions = { folderTags: false, inlineTags: false };

describe('parseFrontMatter', () => {
  it('reads scalars, inline lists and block lists', () => {
    const { data, body } = parseFrontMatter(
      ['---', 'title: "Plan: Q4"', "alias: 'It''s'", 'tags: [a, "b c"]', 'Kategorien:', '  - eins', '- zwei', 'created: 2025-03-01', '---', 'Text'].join('\n'),
    );
    expect(data).toEqual({ title: 'Plan: Q4', alias: "It's", tags: ['a', 'b c'], kategorien: ['eins', 'zwei'], created: '2025-03-01' });
    expect(body).toBe('Text');
  });

  it('leaves text without front matter alone, also with a byte order mark', () => {
    expect(parseFrontMatter('﻿# Titel\n---\nkein: frontmatter')).toEqual({ data: {}, body: '# Titel\n---\nkein: frontmatter' });
  });
});

describe('parseMarkdownNote', () => {
  it('takes title, tags and date from the front matter (Obsidian)', () => {
    const note = parseMarkdownNote(
      'Vault/Projekte/Kunde A/datei.md',
      '---\ntitle: Kickoff\ntags:\n  - Meeting\n  - "#kunde"\ncreated: 2025-03-01T10:15:00Z\n---\n\nAgenda mit #Wichtig und `#kein-tag` und # keine Überschrift\n\n# Kopf\n',
      DEFAULT_IMPORT_OPTIONS,
      'Vault',
    );
    expect(note).toEqual({
      path: 'Vault/Projekte/Kunde A/datei.md',
      title: 'Kickoff',
      content: 'Agenda mit #Wichtig und `#kein-tag` und # keine Überschrift\n\n# Kopf',
      tags: ['meeting', 'kunde', 'projekte', 'kunde a', 'wichtig'],
      createdAt: '2025-03-01T10:15:00.000Z',
    });
  });

  it('takes a first heading as title and removes it from the text, else the file name without Notion id', () => {
    expect(parseMarkdownNote('a.md', '\n# Mein Titel\n\nText', noOptions)).toMatchObject({ title: 'Mein Titel', content: 'Text' });
    expect(parseMarkdownNote('Export/Roadmap 2026 3f2a9c1d8e7b6a5f4e3d2c1b0a9f8e7d.md', 'Text\n# Später', noOptions)).toMatchObject({
      title: 'Roadmap 2026',
      content: 'Text\n# Später',
    });
  });

  it('turns Obsidian links into text and embeds into a hint', () => {
    const note = parseMarkdownNote('n.md', 'Siehe [[Plan]] und [[Plan#Ziele|die Ziele]] ![[foto.png]]', noOptions);
    expect(note.content).toBe('Siehe Plan und die Ziele [Anhang: foto.png]');
  });

  it('ignores unusable dates and duplicate tags', () => {
    const note = parseMarkdownNote('n.md', '---\ndate: irgendwann\ntags: a, A, b\n---\n#a', DEFAULT_IMPORT_OPTIONS);
    expect(note.createdAt).toBeUndefined();
    expect(note.tags).toEqual(['a', 'b']);
  });
});

describe('helpers', () => {
  it('reads dates', () => {
    expect(parseDate('2025-03-01')).toBe(new Date(2025, 2, 1).toISOString());
    expect(parseDate('2025-03-01 14:30')).toBe(new Date(2025, 2, 1, 14, 30).toISOString());
    expect(parseDate(['2025-03-01'])).toBeUndefined();
    expect(parseDate('0001-01-01')).toBeUndefined();
  });

  it('finds the one top folder of a ZIP', () => {
    expect(commonRootFolder(['Vault/a.md', 'Vault/Projekte/b.md'])).toBe('Vault');
    expect(commonRootFolder(['Vault/a.md', 'Anderes/b.md'])).toBeUndefined();
    expect(commonRootFolder(['a.md', 'Ordner/b.md'])).toBeUndefined();
  });

  it('names notes after their file', () => {
    expect(titleFromPath('Ordner/Unter/Meine Notiz.markdown')).toBe('Meine Notiz');
  });

  it('sorts files into Markdown, skipped and ignored', () => {
    const files = ['Vault/a.md', 'Vault/b.MARKDOWN', 'Vault/bild.png', 'Vault/.obsidian/app.json', '__MACOSX/x.md', 'Vault/.DS_Store'].map(
      (path) => ({ path }),
    );
    const { markdown, skipped } = classifyFiles(files);
    expect(markdown.map((f) => f.path)).toEqual(['Vault/a.md', 'Vault/b.MARKDOWN']);
    expect(skipped.map((f) => f.path)).toEqual(['Vault/bild.png']);
  });

  it('splits imports into batches by count and size', () => {
    // About 1.6 MB of text: more than one request may carry, so it travels alone.
    const notes = Array.from({ length: 120 }, (_, i) => ({ title: `N${i}`, content: i === 5 ? 'x'.repeat(800_000) : 'kurz' }));
    const batches = batchNotes(notes);
    expect(batches.flat()).toHaveLength(120);
    expect(batches.every((b) => b.length <= 50)).toBe(true);
    expect(batches.slice(0, 2).map((b) => b.length)).toEqual([5, 1]);
  });
});
