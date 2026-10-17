import { hierarchy, tree } from 'd3-hierarchy';
import { splitSides, type MindmapNode } from './mindmap';

export interface PlacedNode {
  node: MindmapNode;
  /** Left edge of the label on the right side, right edge on the left side; the root's center. */
  x: number;
  y: number;
  width: number;
  /** -1 left of the root, 1 right of it, 0 for the root. */
  side: -1 | 0 | 1;
  /** Index of the root's branch the node belongs to (for its color); -1 for the root. */
  branch: number;
  depth: number;
  /** Children hidden because the node is collapsed. */
  hiddenChildren: number;
}

export interface PlacedLink {
  from: { x: number; y: number };
  to: { x: number; y: number };
  branch: number;
  depth: number;
}

export interface MindmapLayout {
  nodes: PlacedNode[];
  links: PlacedLink[];
  bounds: { x: number; y: number; width: number; height: number };
}

export const ROW_HEIGHT = 28;
export const COLUMN_GAP = 40;
/** Horizontal padding inside the root's pill, on each side. */
export const ROOT_PADDING = 16;
/** Space for the checkbox before a checklist item's text. */
export const CHECKBOX_SPACE = 18;

/**
 * Classic mindmap: the title in the middle, branches to both sides. Columns are as wide as their widest label, so
 * labels never overlap the next level. `measure` gives a node's text width in pixels.
 */
export function layoutMindmap(root: MindmapNode, collapsed: Set<string>, measure: (node: MindmapNode) => number): MindmapLayout {
  const visible = (node: MindmapNode): MindmapNode => ({
    ...node,
    children: collapsed.has(node.id) ? [] : node.children.map(visible),
  });
  const shown = visible(root);
  const rootWidth = measure(root) + 2 * ROOT_PADDING;
  const width = (node: MindmapNode) => measure(node) + (node.checked === undefined ? 0 : CHECKBOX_SPACE);
  const hiddenOf = (id: string) => (collapsed.has(id) ? (find(root, id)?.children.length ?? 0) : 0);

  const nodes: PlacedNode[] = [{ node: root, x: 0, y: 0, width: rootWidth, side: 0, branch: -1, depth: 0, hiddenChildren: hiddenOf(root.id) }];
  const links: PlacedLink[] = [];
  const { right, left } = splitSides(shown);
  const branchIndex = new Map(shown.children.map((child, i) => [child.id, i]));

  for (const [side, branches] of [[1, right], [-1, left]] as const) {
    if (branches.length === 0) continue;
    const sideRoot = hierarchy<MindmapNode>({ ...shown, children: branches });
    tree<MindmapNode>()
      .nodeSize([ROW_HEIGHT, 1])
      .separation((a, b) => (a.parent === b.parent ? 1 : 1.3))(sideRoot);

    // Each level starts where the widest label of the level before ends.
    const columnWidth: number[] = [];
    sideRoot.each((d) => {
      if (d.depth > 0) columnWidth[d.depth] = Math.max(columnWidth[d.depth] ?? 0, width(d.data));
    });
    const columnStart: number[] = [0, rootWidth / 2 + COLUMN_GAP];
    for (let depth = 2; depth < columnWidth.length; depth++) {
      columnStart[depth] = columnStart[depth - 1]! + columnWidth[depth - 1]! + COLUMN_GAP;
    }

    const placed = new Map<string, PlacedNode>();
    sideRoot.each((d) => {
      if (d.depth === 0) return;
      const branch = branchIndex.get(d.ancestors().at(-2)!.data.id) ?? 0;
      const node: PlacedNode = {
        node: d.data,
        x: side * columnStart[d.depth]!,
        // d3's tree spreads siblings along x; here that is the vertical axis.
        y: (d as unknown as { x: number }).x,
        width: width(d.data),
        side,
        branch,
        depth: d.depth,
        hiddenChildren: hiddenOf(d.data.id),
      };
      placed.set(d.data.id, node);
      nodes.push(node);
      const parent = d.parent!;
      // Links leave the parent's label at its outer end and arrive at the child's inner end.
      const from =
        parent.depth === 0
          ? { x: (side * rootWidth) / 2, y: 0 }
          : { x: placed.get(parent.data.id)!.x + side * placed.get(parent.data.id)!.width, y: placed.get(parent.data.id)!.y };
      links.push({ from, to: { x: node.x, y: node.y }, branch, depth: d.depth });
    });
  }

  const xs = nodes.flatMap((n) => (n.side === 0 ? [-n.width / 2, n.width / 2] : [n.x, n.x + n.side * n.width]));
  const ys = nodes.map((n) => n.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys) - ROW_HEIGHT / 2;
  return {
    nodes,
    links,
    bounds: { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) + ROW_HEIGHT / 2 - minY },
  };
}

function find(node: MindmapNode, id: string): MindmapNode | undefined {
  if (node.id === id) return node;
  for (const child of node.children) {
    const hit = find(child, id);
    if (hit) return hit;
  }
  return undefined;
}

/** A smooth horizontal S-curve between two points. */
export function linkPath(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const mid = (from.x + to.x) / 2;
  return `M${from.x},${from.y} C${mid},${from.y} ${mid},${to.y} ${to.x},${to.y}`;
}
