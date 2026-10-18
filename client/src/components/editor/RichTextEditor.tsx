import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import type { SuggestionProps } from '@tiptap/suggestion';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import type { LinkCandidate, ResolvedLink } from '../../types/link';
import { linksApi } from '../../utils/api';
import { refKey, resolvedPath } from '../../utils/contentLinks';
import EditorToolbar from './EditorToolbar';
import { ContentLinks, contentLinksKey, contentRefsIn, LinkSuggestion } from './contentLinkExtensions';
import { editorExtensions } from './extensions';
import LinkPicker from './LinkPicker';

export interface RichTextEditorProps {
  /** Markdown; only read when the editor is created (remount it, e.g. via `key`, for other content). */
  value: string;
  onChange: (markdown: string) => void;
  /** The selected part as Markdown, or '' (for "Auswahl in Task umwandeln"). */
  onSelectionChange?: (markdown: string) => void;
  label: string;
  placeholder?: string;
  autoFocus?: boolean;
  /** Extra controls at the end of the toolbar (the Formatiert/Markdown switch). */
  toolbarTrailing?: ReactNode;
  contentClassName?: string;
  /** Viewers (US-21): the text formatted as usual, without toolbar; checklists cannot be ticked. */
  readOnly?: boolean;
  /** Links to notes and tasks (US-22): typing "[[" suggests them, this project's first. Without it, no picker. */
  links?: { projectId: number };
}

interface PickerState {
  items: LinkCandidate[];
  query: string;
  anchor: DOMRect | null;
  active: number;
  loading: boolean;
  pick: (item: LinkCandidate) => void;
}

const RESOLVE_DELAY_MS = 400;

/** The WYSIWYG editor (Tiptap). It reads and writes Markdown; loaded on demand (see MarkdownEditor). */
export default function RichTextEditor({
  value,
  onChange,
  onSelectionChange,
  label,
  placeholder,
  autoFocus = false,
  toolbarTrailing,
  contentClassName = '',
  readOnly = false,
  links,
}: RichTextEditorProps) {
  // The editor is created once; the latest callbacks are read through refs.
  const onChangeRef = useRef(onChange);
  const onSelectionRef = useRef(onSelectionChange);
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  const projectIdRef = useRef(links?.projectId ?? 0);
  useEffect(() => {
    onChangeRef.current = onChange;
    onSelectionRef.current = onSelectionChange;
    navigateRef.current = navigate;
    projectIdRef.current = links?.projectId ?? 0;
  });

  // Link targets (US-22): resolved once per editor, so chips know their title, place and whether they may be opened.
  const resolved = useRef(new Map<string, ResolvedLink>());
  const resolving = useRef(new Set<string>());
  const resolveMissing = useCallback(async (editor: Editor) => {
    const missing = contentRefsIn(editor.state.doc).filter((ref) => !resolved.current.has(refKey(ref)) && !resolving.current.has(refKey(ref)));
    if (missing.length === 0) return;
    missing.forEach((ref) => resolving.current.add(refKey(ref)));
    try {
      for (const target of await linksApi.resolve(missing)) resolved.current.set(refKey(target), target);
      if (!editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(contentLinksKey, true));
    } catch {
      // Shown as plain links; the next edit tries again.
    } finally {
      missing.forEach((ref) => resolving.current.delete(refKey(ref)));
    }
  }, []);
  const resolveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(resolveTimer.current), []);

  // The [[ picker: the suggestion plugin reports, React draws the list.
  const [picker, setPicker] = useState<PickerState | null>(null);
  const pickerRef = useRef(picker);
  useEffect(() => {
    pickerRef.current = picker;
  });

  const [extensions] = useState(() => {
    const show = (props: SuggestionProps<LinkCandidate, LinkCandidate>, loading: boolean) =>
      setPicker((current) => ({
        items: props.items,
        query: props.query,
        anchor: props.clientRect?.() ?? null,
        active: current && current.query === props.query ? Math.min(current.active, Math.max(0, props.items.length - 1)) : 0,
        loading,
        pick: (item) => {
          // Known right away: the chip needs no round trip.
          resolved.current.set(refKey(item), { ...item, status: 'ok' });
          props.command(item);
        },
      }));
    return [
      ...editorExtensions(placeholder),
      ContentLinks.configure({
        getResolved: () => resolved.current,
        onOpen: (target) => navigateRef.current(resolvedPath(target)),
      }),
      ...(links && !readOnly
        ? [
            LinkSuggestion.configure({
              suggestion: {
                items: ({ query, signal }) => linksApi.candidates(query, projectIdRef.current, signal).catch(() => []),
                render: () => ({
                  onBeforeStart: (props) => show(props, true),
                  onStart: (props) => show(props, false),
                  onBeforeUpdate: (props) => show(props, true),
                  onUpdate: (props) => show(props, false),
                  onExit: () => setPicker(null),
                  onKeyDown: ({ event }) => {
                    const current = pickerRef.current;
                    if (!current) return false;
                    const count = current.items.length;
                    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                      const step = event.key === 'ArrowDown' ? 1 : -1;
                      if (count > 0) setPicker({ ...current, active: (current.active + step + count) % count });
                      return true;
                    }
                    if (event.key === 'Enter' || event.key === 'Tab') {
                      const item = current.items[current.active];
                      if (!item) return event.key === 'Enter' && current.loading;
                      current.pick(item);
                      return true;
                    }
                    return false;
                  },
                }),
              },
            }),
          ]
        : []),
    ];
  });

  const editor = useEditor({
    extensions,
    content: value,
    contentType: 'markdown',
    editable: !readOnly,
    autofocus: autoFocus && !readOnly ? 'end' : false,
    editorProps: {
      attributes: {
        'aria-label': label,
        role: 'textbox',
        'aria-multiline': 'true',
        class: `rich-text prose prose-zinc dark:prose-invert max-w-none focus:outline-none ${contentClassName}`,
      },
    },
    onCreate: ({ editor: e }) => void resolveMissing(e),
    // Only real edits arrive here (also ticking a checklist box), so opening a note never saves it.
    // The editor keeps an empty paragraph at the end for typing; it is not stored.
    onUpdate: ({ editor: e }) => {
      onChangeRef.current(e.getMarkdown().trimEnd());
      clearTimeout(resolveTimer.current);
      resolveTimer.current = setTimeout(() => void resolveMissing(e), RESOLVE_DELAY_MS);
    },
    onSelectionUpdate: ({ editor: e }) => {
      const report = onSelectionRef.current;
      if (!report) return;
      const { selection } = e.state;
      if (selection.empty) return report('');
      const content = selection.content().content.toJSON() as object[];
      report(e.markdown?.serialize({ type: 'doc', content }).trim() ?? '');
    },
    onBlur: () => onSelectionRef.current?.(''),
  });

  if (!editor) return null;
  return (
    <div className="flex flex-col">
      {!readOnly && <EditorToolbar editor={editor} trailing={toolbarTrailing} />}
      <EditorContent editor={editor} className="pt-3" />
      {picker?.anchor && links && (
        <LinkPicker
          anchor={picker.anchor}
          items={picker.items}
          active={picker.active}
          loading={picker.loading}
          query={picker.query}
          projectId={links.projectId}
          onPick={picker.pick}
          onHover={(index) => setPicker({ ...picker, active: index })}
        />
      )}
    </div>
  );
}
