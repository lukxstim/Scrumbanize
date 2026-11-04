import type { JSONContent } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
import { describe, expect, it } from 'vitest';
import { needsSourceMode } from '../../utils/highlight';
import { editorExtensions } from './extensions';
import { escapeMarkdownText } from './markdownEscaping';

// The editor's Markdown conversion without a browser: what a note looks like after being opened and saved.
const manager = new MarkdownManager({ extensions: editorExtensions() });
const roundTrip = (markdown: string) => manager.serialize(manager.parse(markdown)).trim();

/** The text of the first paragraph, after a paragraph with `text` was saved as Markdown and read again. */
function savedText(text: string): string {
  const doc: JSONContent = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
  const paragraph = manager.parse(manager.serialize(doc)).content?.[0];
  return (paragraph?.content ?? []).map((node) => node.text ?? '').join('');
}

describe('Markdown round trip', () => {
  it.each([
    ['headings', '# Titel\n\n## Abschnitt\n\n### Unterabschnitt'],
    ['emphasis', 'Text mit **fett**, *kursiv*, ~~durch~~ und `code`.'],
    ['links', 'Siehe [Doku](https://example.com) hier.'],
    ['bare links', 'Siehe https://example.com/a_b hier.'],
    ['note and task links', 'Siehe [Plan](note:42), [Angebot](task:17) und [Plan \\[v2\\]](note:3).'],
    ['bullet list', '- eins\n- zwei\n  - verschachtelt'],
    ['ordered list', '1. erstens\n2. zweitens'],
    ['checklist', '- [ ] offen\n- [x] erledigt'],
    ['quote', '> Zitat'],
    ['code block', '```ts\nconst a = 1;\n```'],
    ['highlight', 'Ein <mark data-color="green">grüner</mark> und <mark data-color="pink">rosa</mark> Text.'],
    ['tables with alignment and formatting', '| Name  | **Menge** | Preis    |\n| :----- | :---------: | --------: |\n| Äpfel | 3         | `1,20 €` |'],
    ['plain text with symbols', 'Tom & Jerry, a < b > c, 5 * 3, snake_case, C:\\Pfad und #hashtag'],
  ])('keeps %s', (_name, markdown) => {
    expect(roundTrip(markdown)).toBe(markdown);
  });

  it('normalizes only the style, not the meaning', () => {
    expect(roundTrip('* stern')).toBe('- stern');
    expect(roundTrip('__fett__')).toBe('**fett**');
    expect(roundTrip('| A | B |\n| --- | --- |\n| 1 | 2 |')).toBe('| A   | B   |\n| --- | --- |\n| 1   | 2   |');
    expect(roundTrip('<mark data-color="yellow">**fett**</mark>')).toBe('**<mark data-color="yellow">fett</mark>**');
    expect(roundTrip('Ein ==wichtiger== Satz')).toBe('Ein <mark data-color="yellow">wichtiger</mark> Satz');
  });

  it('is stable: saving twice changes nothing more', () => {
    const markdown = '# T\n\n* a\n* b\n\n__x__ <mark data-color="blue">y</mark> | z |';
    expect(roundTrip(roundTrip(markdown))).toBe(roundTrip(markdown));
  });

  it.each([
    '*kein Fett*',
    '_kein Kursiv_',
    '**zwei Sterne**',
    '`kein Code`',
    '[kein Link](x)',
    '~~kein Strich~~',
    '&amp; als Text',
    '<div> als Text',
    'Backslash \\* vor Stern',
    'Ende mit Backslash \\',
    '5 * 3 und snake_case',
  ])('keeps typed text "%s" as text', (text) => {
    expect(savedText(text)).toBe(text);
  });
});

describe('escapeMarkdownText', () => {
  it('escapes only where needed', () => {
    expect(escapeMarkdownText('Tom & Jerry, a < b, 5 * 3, snake_case')).toBe('Tom & Jerry, a < b, 5 * 3, snake_case');
    expect(escapeMarkdownText('*x* _y_ `z` [a]')).toBe('\\*x\\* \\_y\\_ \\`z\\` \\[a\\]');
    expect(escapeMarkdownText('&amp; <b>')).toBe('&amp;amp; &lt;b>');
  });
});

describe('needsSourceMode', () => {
  it('flags HTML, comments, footnotes and unknown highlight colors, but not our highlights or code', () => {
    expect(needsSourceMode('Text mit <mark data-color="blue">Farbe</mark>')).toBe(false);
    expect(needsSourceMode('Code: `<div>` und\n```\n<details>\n```')).toBe(false);
    expect(needsSourceMode('Vergleich: a < b und b > c')).toBe(false);
    expect(needsSourceMode('<mark data-color="red">rot</mark>')).toBe(true);
    expect(needsSourceMode('<details><summary>Mehr</summary></details>')).toBe(true);
    expect(needsSourceMode('Zeile<br>Umbruch')).toBe(true);
    expect(needsSourceMode('<!-- Kommentar -->')).toBe(true);
    expect(needsSourceMode('Fußnote[^1]\n\n[^1]: Text')).toBe(true);
  });
});
