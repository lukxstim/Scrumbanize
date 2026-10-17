import { Marked, type Token, type Tokens } from 'marked';
import { UNTITLED_NOTE } from './taskFromNote';

export interface MindmapNode {
  /** Path from the root ("0", "0.2", "0.2.1"), stable while the note's outline stays the same. */
  id: string;
  text: string;
  kind: 'root' | 'heading' | 'item';
  /** Checklist items only. */
  checked?: boolean;
  children: MindmapNode[];
}

// An own instance: the editor registers its extensions on the global `marked`, which changes how checklists are tokenized.
const markdown = new Marked();

/** Longer texts are cut, so a node stays a short label. */
export const MAX_NODE_TEXT = 80;

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };

function shorten(text: string): string {
  const clean = text.replace(/&(?:amp|lt|gt|quot|#39);/g, (e) => ENTITIES[e]!).replace(/\s+/g, ' ').trim();
  return clean.length > MAX_NODE_TEXT ? `${clean.slice(0, MAX_NODE_TEXT - 1).trimEnd()}…` : clean;
}

/** The visible text of inline tokens: formatting, links and HTML (e.g. <mark>) are reduced to their text. */
function inlineText(tokens: Token[] | undefined): string {
  return (tokens ?? [])
    .map((token): string => {
      switch (token.type) {
        case 'html':
        case 'checkbox':
        case 'list':
          return '';
        case 'br':
          return ' ';
        case 'image':
          return (token as Tokens.Image).text;
        default:
          return 'tokens' in token && token.tokens ? inlineText(token.tokens) : 'text' in token ? String(token.text) : '';
      }
    })
    .join('');
}

function listItems(list: Tokens.List, parentId: string, offset: number): MindmapNode[] {
  return list.items.flatMap((item, i) => {
    const id = `${parentId}.${offset + i}`;
    const text = shorten(inlineText(item.tokens));
    const nested = item.tokens.filter((t): t is Tokens.List => t.type === 'list');
    const children: MindmapNode[] = [];
    for (const sub of nested) children.push(...listItems(sub, id, children.length));
    if (!text && children.length === 0) return [];
    return [{ id, text: text || '…', kind: 'item' as const, ...(item.task ? { checked: Boolean(item.checked) } : {}), children }];
  });
}

/**
 * The outline of a note as a tree: the title is the root, headings nest by level, lists (checklists included) hang
 * below the heading before them. Paragraphs, code, tables and quotes are left out.
 */
export function noteToMindmap(title: string, content: string): MindmapNode {
  const root: MindmapNode = { id: '0', text: shorten(title) || UNTITLED_NOTE, kind: 'root', children: [] };
  // The open headings, innermost last; depth 0 is the root.
  const stack: { depth: number; node: MindmapNode }[] = [{ depth: 0, node: root }];
  const top = () => stack.at(-1)!.node;
  const childId = (parent: MindmapNode) => `${parent.id}.${parent.children.length}`;

  for (const token of markdown.lexer(content)) {
    if (token.type === 'heading') {
      const heading = token as Tokens.Heading;
      const text = shorten(inlineText(heading.tokens));
      if (!text) continue;
      while (stack.at(-1)!.depth >= heading.depth) stack.pop();
      const node: MindmapNode = { id: childId(top()), text, kind: 'heading', children: [] };
      top().children.push(node);
      stack.push({ depth: heading.depth, node });
    } else if (token.type === 'list') {
      const parent = top();
      parent.children.push(...listItems(token as Tokens.List, parent.id, parent.children.length));
    }
  }
  return root;
}

/** Whether there is anything to draw besides the title. */
export const hasOutline = (root: MindmapNode) => root.children.length > 0;

/** Splits the root's branches into a right and a left half of about equal size (by number of nodes), right first. */
export function splitSides(root: MindmapNode): { right: MindmapNode[]; left: MindmapNode[] } {
  const size = (node: MindmapNode): number => 1 + node.children.reduce((sum, c) => sum + size(c), 0);
  const total = root.children.reduce((sum, c) => sum + size(c), 0);
  const right: MindmapNode[] = [];
  const left: MindmapNode[] = [];
  let rightSize = 0;
  for (const branch of root.children) {
    // Branches stay in reading order: the first ones go right (clockwise from the top), the rest left.
    if (left.length === 0 && (right.length === 0 || rightSize + size(branch) / 2 <= total / 2)) {
      right.push(branch);
      rightSize += size(branch);
    } else {
      left.push(branch);
    }
  }
  return { right, left };
}

/** File name for an export: the note's title without characters file systems reject. */
export function exportFileName(title: string, extension: 'svg' | 'png'): string {
  const base = title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Mindmap';
  return `${base}.${extension}`;
}
