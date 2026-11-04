import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Extension, type Editor } from '@tiptap/core';
import { TableCell, TableHeader, TableKit } from '@tiptap/extension-table';
import { Placeholder } from '@tiptap/extensions';
import { Markdown } from '@tiptap/markdown';
import { TextSelection } from '@tiptap/pm/state';
import { isInTable, selectedRect } from '@tiptap/pm/tables';
import StarterKit from '@tiptap/starter-kit';
import { HIGHLIGHT_COLORS, type HighlightColor } from '../../utils/highlight';
import { renderLinkMarkdown } from './markdownEscaping';

const isHighlightColor = (value: unknown): value is HighlightColor => HIGHLIGHT_COLORS.some((c) => c.value === value);

// <mark data-color="yellow">…</mark>, with one of our colors only.
const MARK_PATTERN = /^<mark data-color="([a-z]+)">([\s\S]*?)<\/mark>/;

/**
 * Highlighting in one of the app's colors. Markdown has no syntax for colors, so it is stored as
 * `<mark data-color="…">…</mark>` (the colors themselves are theme tokens in index.css). `==text==` from
 * elsewhere is read as yellow.
 */
export const ColoredHighlight = Highlight.extend({
  addAttributes() {
    return {
      color: {
        default: 'yellow',
        parseHTML: (element) => {
          const color = element.getAttribute('data-color');
          return isHighlightColor(color) ? color : 'yellow';
        },
        renderHTML: (attributes) => ({ 'data-color': isHighlightColor(attributes.color) ? attributes.color : 'yellow' }),
      },
    };
  },

  renderMarkdown: (node, h) => {
    const color = isHighlightColor(node.attrs?.color) ? node.attrs.color : 'yellow';
    return `<mark data-color="${color}">${h.renderChildren(node)}</mark>`;
  },

  parseMarkdown: (token, h) => h.applyMark('highlight', h.parseInline(token.tokens || []), { color: token.color ?? 'yellow' }),

  markdownTokenizer: {
    name: 'highlight',
    level: 'inline',
    start: (src: string) => {
      const positions = [src.indexOf('<mark '), src.indexOf('==')].filter((i) => i !== -1);
      return positions.length > 0 ? Math.min(...positions) : -1;
    },
    tokenize(src, _tokens, h) {
      const mark = MARK_PATTERN.exec(src);
      if (mark && isHighlightColor(mark[1])) {
        return { type: 'highlight', raw: mark[0], text: mark[2]!, color: mark[1], tokens: h.inlineTokens(mark[2]!) };
      }
      const legacy = /^==([^=]+)==/.exec(src);
      if (legacy) {
        return { type: 'highlight', raw: legacy[0], text: legacy[1]!, color: 'yellow', tokens: h.inlineTokens(legacy[1]!.trim()) };
      }
      return undefined;
    },
  },
}).configure({ multicolor: true });

/**
 * Links as typed: a bare address stays a bare address in the Markdown. Besides web addresses, links to notes and tasks
 * (`note:42`, `task:17`, US-22) are kept; typing "note:42" does not turn into a link by itself.
 */
const MarkdownLink = Link.extend({
  renderMarkdown: (node, h, context) =>
    renderLinkMarkdown(node, () => h.renderChildren(node), (context?.meta as { markText?: string } | undefined)?.markText),
}).configure({
  openOnClick: false,
  autolink: true,
  defaultProtocol: 'https',
  isAllowedUri: (url, { defaultValidate }) => /^(note|task):\d+$/.test(url) || defaultValidate(url),
});

export type ColumnAlign = 'left' | 'center' | 'right' | null;

/**
 * Tables (US-26) as Markdown (GFM) stores them: one line of text per cell, the first row is the header, alignment
 * per column. Enter moves to the cell below (a new row at the end), like in a spreadsheet; a line break would end up
 * as <br>, which only the source view can keep.
 */
const SingleLineCell = TableCell.extend({ content: 'paragraph' });
const SingleLineHeader = TableHeader.extend({ content: 'paragraph' });
const TableKeys = Extension.create({
  name: 'tableKeys',
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        if (!isInTable(editor.state)) return false;
        if (selectedRect(editor.state).bottom === selectedRect(editor.state).map.height) editor.commands.addRowAfter();
        const { state } = editor;
        const rect = selectedRect(state);
        const below = rect.tableStart + rect.map.positionAt(rect.bottom, rect.left, rect.table);
        editor.view.dispatch(state.tr.setSelection(TextSelection.near(state.doc.resolve(below + 1))).scrollIntoView());
        return true;
      },
      'Shift-Enter': ({ editor }) => isInTable(editor.state),
    };
  },
});

/** Whether the cursor is in the header row, which has to stay first (it may not be deleted or get a row above). */
export function inHeaderRow(editor: Editor): boolean {
  return isInTable(editor.state) && selectedRect(editor.state).top === 0;
}

/** The alignment of the column the cursor is in (Markdown keeps one per column). */
export function columnAlign(editor: Editor): ColumnAlign {
  if (!isInTable(editor.state)) return null;
  const { map, table, left } = selectedRect(editor.state);
  const align: unknown = table.nodeAt(map.positionAt(0, left, table))?.attrs.align;
  return align === 'left' || align === 'center' || align === 'right' ? align : null;
}

/** Aligns the selected columns, every cell of them, so the view shows what Markdown keeps. */
export function alignColumns(editor: Editor, align: ColumnAlign) {
  const { state } = editor;
  if (!isInTable(state)) return;
  const rect = selectedRect(state);
  const { tr } = state;
  for (let row = 0; row < rect.map.height; row += 1) {
    for (let col = rect.left; col < rect.right; col += 1) {
      const pos = rect.tableStart + rect.map.positionAt(row, col, rect.table);
      const cell = tr.doc.nodeAt(pos);
      if (cell) tr.setNodeMarkup(pos, undefined, { ...cell.attrs, align });
    }
  }
  editor.view.dispatch(tr);
  editor.commands.focus();
}

/**
 * Everything the editor understands. Kept to what Markdown (GFM) can store, so a note survives being opened
 * and saved: no underline (Markdown has none), links without opening on click (editing comes first).
 */
export function editorExtensions(placeholder = '') {
  return [
    StarterKit.configure({
      underline: false,
      heading: { levels: [1, 2, 3] },
      link: false,
    }),
    MarkdownLink,
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit.configure({ table: { resizable: false, renderWrapper: true }, tableCell: false, tableHeader: false }),
    SingleLineCell,
    SingleLineHeader,
    TableKeys,
    ColoredHighlight,
    Markdown,
    ...(placeholder ? [Placeholder.configure({ placeholder })] : []),
  ];
}
