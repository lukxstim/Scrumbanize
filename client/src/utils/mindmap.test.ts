import { MarkdownManager } from '@tiptap/markdown';
import { describe, expect, it } from 'vitest';
import { editorExtensions } from '../components/editor/extensions';
import { exportFileName, hasOutline, noteToMindmap, splitSides, type MindmapNode } from './mindmap';

/** The tree as nested [text, children] pairs, with a check mark for checklist items. */
const shape = (node: MindmapNode): unknown => {
  const label = node.checked === undefined ? node.text : `${node.checked ? '☑' : '☐'} ${node.text}`;
  return node.children.length ? [label, node.children.map(shape)] : label;
};

describe('noteToMindmap', () => {
  it('nests headings by level and hangs lists below the heading before them', () => {
    const root = noteToMindmap(
      'Planung',
      [
        'Einleitung, die nicht in die Mindmap gehört.',
        '# Ziele',
        '- Schneller **liefern**',
        '- Weniger [Meetings](https://example.com)',
        '  - Daily kürzer',
        '## Q4',
        '1. Release',
        '### Details',
        '- [x] Changelog',
        '- [ ] Blogpost <mark>wichtig</mark>',
        '# Risiken',
        '```',
        '- kein Listenpunkt',
        '```',
        '- Zeit',
      ].join('\n'),
    );
    expect(shape(root)).toEqual([
      'Planung',
      [
        ['Ziele', ['Schneller liefern', ['Weniger Meetings', ['Daily kürzer']], ['Q4', ['Release', ['Details', ['☑ Changelog', '☐ Blogpost wichtig']]]]]],
        ['Risiken', ['Zeit']],
      ],
    ]);
  });

  it('puts a deeper heading right below a shallower one, and lists before any heading below the title', () => {
    const root = noteToMindmap('T', '- Erst\n\n### Tief\n\n## Mittel\n\n- Punkt');
    expect(shape(root)).toEqual(['T', ['Erst', 'Tief', ['Mittel', ['Punkt']]]]);
  });

  it('reads checklists the way the editor saves them, also after the editor set up its Markdown parser', () => {
    // Creating the editor's MarkdownManager registers its extensions on the global `marked`.
    const manager = new MarkdownManager({ extensions: editorExtensions() });
    const saved = manager.serialize(manager.parse('# Termine\n- [x] Kickoff\n- [ ] Review\n# Risiken\n- Zeit'));
    expect(shape(noteToMindmap('T', saved))).toEqual(['T', [['Termine', ['☑ Kickoff', '☐ Review']], ['Risiken', ['Zeit']]]]);
  });

  it('gives every node a path id', () => {
    const root = noteToMindmap('T', '# A\n- a1\n- a2\n# B');
    expect(root.children.map((c) => [c.id, c.children.map((g) => g.id)])).toEqual([
      ['0.0', ['0.0.0', '0.0.1']],
      ['0.1', []],
    ]);
  });

  it('shortens long texts, decodes entities and handles empty notes', () => {
    const long = noteToMindmap('', `# ${'x'.repeat(200)}\n\n- Tom &amp; Jerry`);
    expect(long.text).toBe('Unbenannte Notiz');
    expect(long.children[0]!.text).toHaveLength(80);
    expect(long.children[0]!.text.endsWith('…')).toBe(true);
    expect(long.children[0]!.children[0]!.text).toBe('Tom & Jerry');
    expect(hasOutline(noteToMindmap('Nur Text', 'Ein Absatz.\n\nNoch einer.'))).toBe(false);
  });
});

describe('splitSides', () => {
  it('splits branches into halves of similar size, keeping their order', () => {
    const root = noteToMindmap('T', '# A\n- 1\n- 2\n- 3\n# B\n# C\n- 1\n# D');
    const { right, left } = splitSides(root);
    expect(right.map((b) => b.text)).toEqual(['A']);
    expect(left.map((b) => b.text)).toEqual(['B', 'C', 'D']);
    expect(splitSides(noteToMindmap('T', '# Nur einer'))).toMatchObject({ right: [{ text: 'Nur einer' }], left: [] });
  });
});

describe('exportFileName', () => {
  it('removes characters file systems reject', () => {
    expect(exportFileName('Q4: Plan / Ziele?', 'png')).toBe('Q4 Plan Ziele.png');
    expect(exportFileName('  ', 'svg')).toBe('Mindmap.svg');
  });
});
