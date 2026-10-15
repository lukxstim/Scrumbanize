import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { TableKit } from '@tiptap/extension-table';
import { Placeholder } from '@tiptap/extensions';
import { Markdown } from '@tiptap/markdown';
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

/** Links as typed: a bare address stays a bare address in the Markdown. */
const MarkdownLink = Link.extend({
  renderMarkdown: (node, h, context) =>
    renderLinkMarkdown(node, () => h.renderChildren(node), (context?.meta as { markText?: string } | undefined)?.markText),
}).configure({ openOnClick: false, autolink: true, defaultProtocol: 'https' });

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
    TableKit.configure({ table: { resizable: false } }),
    ColoredHighlight,
    Markdown,
    ...(placeholder ? [Placeholder.configure({ placeholder })] : []),
  ];
}
