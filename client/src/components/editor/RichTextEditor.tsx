import { EditorContent, useEditor } from '@tiptap/react';
import { useEffect, useRef, type ReactNode } from 'react';
import EditorToolbar from './EditorToolbar';
import { editorExtensions } from './extensions';

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
}

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
}: RichTextEditorProps) {
  // The editor is created once; the latest callbacks are read through refs.
  const onChangeRef = useRef(onChange);
  const onSelectionRef = useRef(onSelectionChange);
  useEffect(() => {
    onChangeRef.current = onChange;
    onSelectionRef.current = onSelectionChange;
  });

  const editor = useEditor({
    extensions: editorExtensions(placeholder),
    content: value,
    contentType: 'markdown',
    autofocus: autoFocus ? 'end' : false,
    editorProps: {
      attributes: {
        'aria-label': label,
        role: 'textbox',
        'aria-multiline': 'true',
        class: `rich-text prose prose-zinc dark:prose-invert max-w-none focus:outline-none ${contentClassName}`,
      },
    },
    // Only real edits arrive here (also ticking a checklist box), so opening a note never saves it.
    // The editor keeps an empty paragraph at the end for typing; it is not stored.
    onUpdate: ({ editor: e }) => onChangeRef.current(e.getMarkdown().trimEnd()),
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
      <EditorToolbar editor={editor} trailing={toolbarTrailing} />
      <EditorContent editor={editor} className="pt-3" />
    </div>
  );
}
