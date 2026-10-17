import { describe, expect, it } from 'vitest';
import { noteToMindmap } from './mindmap';
import { COLUMN_GAP, layoutMindmap, linkPath, ROOT_PADDING, ROW_HEIGHT } from './mindmapLayout';

// 10 px per character keeps the expected numbers readable.
const measure = (node: { text: string }) => node.text.length * 10;

describe('layoutMindmap', () => {
  const root = noteToMindmap('Plan', '# Ziele\n- Schnell\n- Gut\n# B\n# Risiken\n- [x] Zeit');

  it('puts the title in the middle and branches on both sides, columns as wide as their widest label', () => {
    const { nodes, links } = layoutMindmap(root, new Set(), measure);
    const at = (text: string) => nodes.find((n) => n.node.text === text)!;
    const rootWidth = 40 + 2 * ROOT_PADDING;

    expect(at('Plan')).toMatchObject({ x: 0, y: 0, side: 0, width: rootWidth });
    expect(at('Ziele')).toMatchObject({ side: 1, x: rootWidth / 2 + COLUMN_GAP, branch: 0, depth: 1 });
    expect(at('Schnell')).toMatchObject({ side: 1, x: rootWidth / 2 + COLUMN_GAP + 50 + COLUMN_GAP, branch: 0, depth: 2 });
    expect(at('B')).toMatchObject({ side: -1, x: -(rootWidth / 2 + COLUMN_GAP), branch: 1 });
    // Checklist items make room for their box; the widest label of the left's first column is "Risiken".
    expect(at('Zeit')).toMatchObject({ side: -1, width: 40 + 18, x: -(rootWidth / 2 + COLUMN_GAP + 70 + COLUMN_GAP), branch: 2 });
    // Siblings are a row apart.
    expect(Math.abs(at('Schnell').y - at('Gut').y)).toBe(ROW_HEIGHT);
    expect(links).toHaveLength(nodes.length - 1);
    expect(links.find((l) => l.to.y === at('Schnell').y)!.from).toEqual({ x: at('Ziele').x + 50, y: at('Ziele').y });
  });

  it('hides the children of collapsed nodes and counts them', () => {
    const ziele = root.children[0]!.id;
    const { nodes } = layoutMindmap(root, new Set([ziele]), measure);
    expect(nodes.map((n) => n.node.text)).not.toContain('Schnell');
    expect(nodes.find((n) => n.node.id === ziele)!.hiddenChildren).toBe(2);
  });

  it('measures the bounds of everything drawn', () => {
    const { bounds } = layoutMindmap(noteToMindmap('Plan', ''), new Set(), measure);
    expect(bounds).toEqual({ x: -36, y: -ROW_HEIGHT / 2, width: 72, height: ROW_HEIGHT });
  });
});

it('draws links as horizontal S-curves', () => {
  expect(linkPath({ x: 0, y: 0 }, { x: 40, y: 20 })).toBe('M0,0 C20,0 20,20 40,20');
});
