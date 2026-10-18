import { Extension, type Editor, type Range } from '@tiptap/core';
import type { Node as PmNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import Suggestion, { type SuggestionOptions } from '@tiptap/suggestion';
import type { ContentRef, LinkCandidate, ResolvedLink } from '../../types/link';
import { contentHref, parseContentHref, refKey } from '../../utils/contentLinks';

/** Set as transaction meta when new link targets were resolved, so the chips are drawn again. */
export const contentLinksKey = new PluginKey<DecorationSet>('contentLinks');

/** The note and task links in a document (US-22), each once. */
export function contentRefsIn(doc: PmNode): ContentRef[] {
  const refs = new Map<string, ContentRef>();
  doc.descendants((node) => {
    for (const mark of node.marks) {
      const ref = mark.type.name === 'link' ? parseContentHref(mark.attrs.href as string) : null;
      if (ref) refs.set(refKey(ref), ref);
    }
  });
  return [...refs.values()];
}

const STATUS_TEXT = { forbidden: 'Kein Zugriff', trashed: 'Im Papierkorb' } as const;

function chip(label: string) {
  const span = document.createElement('span');
  span.className = 'content-link-chip';
  span.textContent = label;
  span.contentEditable = 'false';
  return span;
}

/** Link ranges: a link split by bold or italic text is one range. */
function decorations(doc: PmNode, resolved: Map<string, ResolvedLink>): DecorationSet {
  const ranges: { from: number; to: number; href: string }[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText) return;
    const href = node.marks.find((m) => m.type.name === 'link')?.attrs.href as string | undefined;
    if (!parseContentHref(href)) return;
    const last = ranges.at(-1);
    if (last && last.to === pos && last.href === href) last.to = pos + node.nodeSize;
    else ranges.push({ from: pos, to: pos + node.nodeSize, href: href! });
  });
  const list: Decoration[] = [];
  for (const range of ranges) {
    const target = resolved.get(range.href);
    const status = target?.status ?? 'pending';
    const title =
      target?.status === 'ok'
        ? `${target.type === 'note' ? 'Notiz' : 'Task'} in „${target.projectName}“ – klicken zum Öffnen`
        : target
          ? STATUS_TEXT[target.status]
          : undefined;
    list.push(Decoration.inline(range.from, range.to, { class: `content-link content-link-${status}`, ...(title ? { title } : {}) }));
    if (target && target.status !== 'ok') {
      list.push(Decoration.widget(range.to, () => chip(STATUS_TEXT[target.status]), { side: 1, key: `${range.href}@${range.to}:${status}` }));
    }
  }
  return DecorationSet.create(doc, list);
}

export interface ContentLinksOptions {
  /** The targets resolved so far, by "note:42". */
  getResolved: () => Map<string, ResolvedLink>;
  onOpen: (target: Extract<ResolvedLink, { status: 'ok' }>) => void;
}

/**
 * Links to notes and tasks (US-22) as chips: a click opens the target; targets the user may not see show their
 * text with "Kein Zugriff", trashed ones with "Im Papierkorb". The chips are decorations, so the Markdown stays
 * `[Text](note:42)`.
 */
export const ContentLinks = Extension.create<ContentLinksOptions>({
  name: 'contentLinks',

  addOptions() {
    return { getResolved: () => new Map(), onOpen: () => {} };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    return [
      new Plugin<DecorationSet>({
        key: contentLinksKey,
        state: {
          init: (_, state) => decorations(state.doc, options.getResolved()),
          apply: (tr, old, _oldState, state) =>
            tr.docChanged || tr.getMeta(contentLinksKey) ? decorations(state.doc, options.getResolved()) : old,
        },
        props: {
          decorations(state) {
            return contentLinksKey.getState(state);
          },
          // Opens visible targets; the others do nothing. The native click (editable or read-only) is always
          // stopped, or the browser would try to open "note:42" itself.
          handleDOMEvents: {
            click(_view, event) {
              const anchor = (event.target as HTMLElement | null)?.closest('a[href]');
              const ref = parseContentHref(anchor?.getAttribute('href'));
              if (!ref) return false;
              event.preventDefault();
              const target = options.getResolved().get(refKey(ref));
              if (target?.status === 'ok' && event.button === 0) options.onOpen(target);
              return true;
            },
          },
        },
      }),
    ];
  },
});

export interface LinkSuggestionOptions {
  suggestion: Omit<SuggestionOptions<LinkCandidate, LinkCandidate>, 'editor'>;
}

/** Puts the picked note or task as a link where "[[…" was typed. */
export function insertContentLink(editor: Editor, range: Range, item: LinkCandidate) {
  const text = item.title.trim() || (item.type === 'note' ? 'Unbenannte Notiz' : `Task #${item.id}`);
  editor
    .chain()
    .focus()
    .insertContentAt(range, [
      { type: 'text', text, marks: [{ type: 'link', attrs: { href: contentHref(item) } }] },
      { type: 'text', text: ' ' },
    ])
    .run();
}

/** Typing "[[" opens the picker for notes and tasks (US-22); the React side renders the list. */
export const LinkSuggestion = Extension.create<LinkSuggestionOptions>({
  name: 'linkSuggestion',

  addOptions() {
    return { suggestion: {} };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion<LinkCandidate, LinkCandidate>({
        editor: this.editor,
        pluginKey: new PluginKey('linkSuggestion'),
        char: '[[',
        allowSpaces: true,
        allowedPrefixes: null,
        // A typed "]" ends it: the user writes something else.
        shouldShow: ({ query }) => !query.includes(']') && query.length <= 80,
        command: ({ editor, range, props }) => insertContentLink(editor, range, props),
        ...this.options.suggestion,
      }),
    ];
  },
});
